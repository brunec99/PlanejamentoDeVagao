import { NextResponse, type NextRequest } from 'next/server';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';
import type { User } from '@/domain/entities';
import {
  agentConfigFromEnv,
  budgetDecision,
  ESTIMATED_GLOBAL_QUESTION_USD,
  globalUsageWorkOf,
  monthKey,
  type BudgetReason,
  type BudgetState,
} from '@/domain/agent-cost';
import type { AgentWorkRef, GlobalToolContext } from '@/application/use-cases/agent-global-tools';
import { isManualScreen } from '@/modules/agente/manual';
import { monthUsage, recordUsage, userSettings, type MonthUsage, type UserAgentSettings } from '@/infrastructure/agent/ledger';
import { createAgentDataLoader } from '@/infrastructure/agent/global-data';
import { answerGlobalQuestion, isAgentModelError, type ChatTurn } from '@/infrastructure/agent/chat';

export const runtime = 'nodejs';
// Várias idas ao modelo; o laço corta as ferramentas aos 38 s para responder dentro do limite.
export const maxDuration = 60;

/** Claudia geral (08/11/2026, aprovada pelo usuário no modelo de UX): só para administradores, em qualquer
 * tela, sobre qualquer obra e módulo da pessoa. GET devolve o estado (IA configurada, corte, teto, uso do
 * mês) para o rodapé da janela; POST responde a uma pergunta. Os assuntos ficam no navegador (regra 4): a
 * rota não guarda conversa, recebe o histórico a cada pergunta. Custo (regra 10): conta no teto do mês e no
 * limite da pessoa, não na parte de cada obra; a pergunta que leu uma obra só é gravada nela, a que leu
 * várias (ou nenhuma, fora de uma obra) vai sem obra, "Geral (várias obras)", com a migração 0041. */

const headers = { 'Cache-Control': 'no-store' };
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers });
const ADMIN_ONLY = 'A Claudia geral é só para administradores.';
const MIGRATION_MESSAGE = 'Aplique a migração 0035_agent.sql no Supabase para usar o agente de IA.';
const NOT_CONFIGURED = 'Agente de IA não configurado: defina ANTHROPIC_API_KEY (ou API_ANTHROPIC) no servidor.';
const MAX_QUESTION = 1500;
const round6 = (usd: number) => Math.round(usd * 1_000_000) / 1_000_000;

async function adminProfile(): Promise<{ profile: User; developer: boolean; modules: string[] } | NextResponse> {
  const { profile, developer, modules } = await getRouteAccess();
  if (!profile) return fail('Perfil não provisionado.', 403);
  if (profile.role !== 'admin') return fail(ADMIN_ONLY, 403);
  return { profile, developer, modules };
}

type Ledger = { missing: true } | { missing: false; usage: MonthUsage; settings: UserAgentSettings | null };
async function loadLedger(actorId: string, month: string): Promise<Ledger | string> {
  const [usage, settings] = await Promise.all([monthUsage(month), userSettings(actorId)]);
  if (!usage.ok) return usage.missing ? { missing: true } : usage.error;
  if (!settings.ok) return settings.missing ? { missing: true } : settings.error;
  return { missing: false, usage: usage.value, settings: settings.value };
}

/** A parte da obra não vale aqui (regra 10): `workUsd` zero e uma obra só, para o teto da obra nunca cortar. */
function budgetState(ledger: Extract<Ledger, { missing: false }>, actorId: string, budgetUsd: number): BudgetState {
  return {
    budgetUsd,
    monthUsd: ledger.usage.totalUsd,
    workUsd: 0,
    activeWorks: 1,
    userUsd: ledger.usage.byUser.get(actorId)?.usd ?? 0,
    userLimitUsd: ledger.settings?.monthlyLimitUsd ?? null,
    userBlocked: ledger.settings?.blocked ?? false,
  };
}
const usagePayload = (state: BudgetState, model: string, spent = 0) => ({
  monthUsd: round6(state.monthUsd + spent),
  budgetUsd: state.budgetUsd,
  userUsd: round6((state.userUsd ?? 0) + spent),
  userLimitUsd: state.userLimitUsd ?? null,
  model,
});

/** As obras da pessoa, com sigla e situação, para o prompt e para achar a obra citada. */
async function worksOf(profile: User): Promise<AgentWorkRef[]> {
  if (!profile.workIds.length) return [];
  const { data, error } = await getServiceClient().from('works').select('id, name, code, active').in('id', profile.workIds);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; name: string; code: string | null; active: boolean | null }[])
    .map(row => ({ id: row.id, name: row.name, code: row.code ?? '', active: row.active !== false }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'pt-BR'));
}

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const access = await adminProfile();
  if (access instanceof NextResponse) return access;
  const { profile } = access;
  const config = agentConfigFromEnv(process.env);
  const ledger = await loadLedger(profile.id, monthKey(todayInSaoPaulo()));
  if (typeof ledger === 'string') {
    logRouteError('GET /api/agente/geral', ledger, { actorId: profile.id, step: 'ledger' });
    return fail('Não foi possível ler o uso do agente de IA. Tente de novo em instantes.', 502);
  }
  if (ledger.missing)
    return NextResponse.json(
      {
        configured: !!config.apiKey,
        blocked: false,
        migrationMissing: true,
        budget: { allowed: false, message: MIGRATION_MESSAGE },
        usage: { monthUsd: 0, budgetUsd: config.budgetUsd, userUsd: 0, userLimitUsd: null, model: config.model },
      },
      { headers },
    );
  const state = budgetState(ledger, profile.id, config.budgetUsd);
  const decision = budgetDecision(state, ESTIMATED_GLOBAL_QUESTION_USD);
  return NextResponse.json(
    {
      configured: !!config.apiKey,
      blocked: ledger.settings?.blocked ?? false,
      migrationMissing: false,
      budget: decision.allowed ? { allowed: true } : { allowed: false, message: decision.message },
      usage: usagePayload(state, config.model),
    },
    { headers },
  );
}

// ─── POST ──────────────────────────────────────────────────────────────────────

const parseHistory = (value: unknown): ChatTurn[] | null => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const turns: ChatTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { role, content } = item as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    turns.push({ role, content });
  }
  return turns;
};

export async function POST(request: NextRequest) {
  let body: { question?: unknown; history?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Corpo da requisição inválido.', 400);
  }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
  if (!question) return fail('Escreva a pergunta.', 422);
  const history = parseHistory(body.history);
  if (!history) return fail('Histórico inválido.', 400);
  const context = body.context && typeof body.context === 'object' ? (body.context as Record<string, unknown>) : {};
  const screen = isManualScreen(context.screen) ? context.screen : undefined;

  const access = await adminProfile();
  if (access instanceof NextResponse) return access;
  const { profile, developer, modules } = access;
  // Obra da tela fora do acesso da pessoa (link antigo) é ignorada: a pergunta vale para todas.
  const contextWorkId = typeof context.workId === 'string' && profile.workIds.includes(context.workId) ? context.workId : undefined;
  const config = agentConfigFromEnv(process.env);
  if (!config.apiKey) return fail(NOT_CONFIGURED, 503);
  const log = (cause: unknown, extra: Record<string, unknown> = {}) =>
    logRouteError('POST /api/agente/geral', cause, { actorId: profile.id, workId: contextWorkId, ...extra });

  const today = todayInSaoPaulo();
  const month = monthKey(today);
  const ledger = await loadLedger(profile.id, month);
  if (typeof ledger === 'string') {
    log(ledger, { step: 'ledger' });
    return fail('Não foi possível ler o uso do agente de IA. Tente de novo em instantes.', 502);
  }
  if (ledger.missing) return fail(MIGRATION_MESSAGE, 503);
  const state = budgetState(ledger, profile.id, config.budgetUsd);
  const decision = budgetDecision(state, ESTIMATED_GLOBAL_QUESTION_USD);
  if (!decision.allowed) return fail(decision.message, 429, { reason: decision.reason satisfies BudgetReason });

  let works: AgentWorkRef[];
  try {
    works = await worksOf(profile);
  } catch (cause) {
    log(cause, { step: 'works' });
    return fail('Não foi possível ler as obras. Tente de novo em instantes.', 502);
  }
  const toolContext: GlobalToolContext = {
    works,
    contextWorkId,
    today,
    actor: { id: profile.id, role: profile.role },
    loader: createAgentDataLoader({ profile, developer, modules, today }),
    newId: () => crypto.randomUUID(),
    // A ferramenta devolve ao modelo um aviso em português; a causa vai para o registro da rota.
    onError: (cause, info) => log(cause, { step: 'tool', tool: info.tool, toolWorkId: info.workId }),
  };
  try {
    const result = await answerGlobalQuestion({
      config: { apiKey: config.apiKey, model: config.model },
      question,
      history,
      toolContext,
      screen,
    });
    const recorded = await recordUsage({
      workId: globalUsageWorkOf(result.workIds, contextWorkId),
      fallbackWorkId: contextWorkId ?? result.workIds[0] ?? works[0]?.id,
      actorId: profile.id,
      month,
      kind: 'pergunta',
      model: result.model,
      calls: result.calls,
      usage: result.usage,
      costUsd: result.costUsd,
    });
    if (!recorded.ok) log(recorded.error, { step: 'recordUsage' });
    return NextResponse.json(
      {
        answer: result.text,
        proposals: result.proposals,
        consulted: result.consulted,
        usage: usagePayload(state, result.model, result.costUsd),
        costUsd: result.costUsd,
        model: result.model,
      },
      { headers },
    );
  } catch (cause) {
    log(cause, { step: 'model' });
    if (isAgentModelError(cause)) return fail(cause.message, cause.status);
    return fail('Falha na pergunta. Tente de novo em instantes.', 502);
  }
}

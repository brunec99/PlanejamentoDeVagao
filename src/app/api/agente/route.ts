import { NextResponse, type NextRequest } from 'next/server';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { hasSectionAccess } from '@/application/module-access';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { scopePlanning } from '@/application/use-cases/scope-planning';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';
import { startOfWeek } from '@/domain/validation';
import type { PlanningData, User } from '@/domain/entities';
import type { LongTermPlanDocument } from '@/domain/long-term-plan';
import { buildBriefing, type AgentBriefing, type BriefingLevel } from '@/domain/agent-briefing';
import {
  agentConfigFromEnv,
  budgetDecision,
  ESTIMATED_CALL_USD,
  monthKey,
  workBudgetOf,
  type BudgetReason,
  type BudgetState,
} from '@/domain/agent-cost';
import type { ToolContext } from '@/application/use-cases/agent-tools';
import { AGENT } from '@/modules/agente/agent-identity';
import { isManualScreen } from '@/modules/agente/manual';
import {
  countActiveWorks,
  monthUsage,
  readInsight,
  recordUsage,
  saveInsight,
  userSettings,
  type MonthUsage,
  type StoredInsight,
  type UserAgentSettings,
} from '@/infrastructure/agent/ledger';
import { answerQuestion, generateReading, isAgentModelError, type ChatTurn } from '@/infrastructure/agent/chat';

export const runtime = 'nodejs';
// A pergunta com ferramentas faz várias idas ao modelo; o padrão da Vercel cortaria antes.
export const maxDuration = 60;

/** Agente de IA (27/10/2026). GET monta o dossiê determinístico da obra (`buildBriefing`), devolve a
 * leitura guardada (se houver) e o uso do mês; funciona sem chave da API e sem a migração 0035. POST
 * chama o modelo: `leitura` (guardada por obra; sem mudança no dossiê, não chama de novo) ou
 * `pergunta` (com ferramentas, que devolvem propostas para a tela aplicar). Os tetos de custo são
 * conferidos no servidor antes de cada chamada e o uso é gravado no livro-razão depois. */

const headers = { 'Cache-Control': 'no-store' };
const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status, headers });
const MIGRATION_MESSAGE = 'Aplique a migração 0035_agent.sql no Supabase para usar o agente de IA.';
const NOT_CONFIGURED = 'Agente de IA não configurado: defina ANTHROPIC_API_KEY (ou API_ANTHROPIC) no servidor.';
const MAX_QUESTION = 1500;
const SECTION_OF: Record<BriefingLevel, string> = { longo: 'longo-prazo', medio: 'medio-prazo', curto: 'curto-prazo' };
const ALL_LEVELS: BriefingLevel[] = ['longo', 'medio', 'curto'];
const round6 = (usd: number) => Math.round(usd * 1_000_000) / 1_000_000;

// ─── Acesso e dossiê ───────────────────────────────────────────────────────────

type Access = { profile: User; levels: BriefingLevel[] };
async function authorize(workId: string): Promise<Access | NextResponse> {
  const { profile, developer, modules } = await getRouteAccess();
  if (!profile) return fail('Perfil não provisionado.', 403);
  if (!profile.workIds.includes(workId)) return fail('Você não tem acesso a esta obra.', 403);
  const levels = ALL_LEVELS.filter(level => hasSectionAccess(SECTION_OF[level], { developer, modules }));
  return { profile, levels };
}

/** Plano de longo prazo da obra; sem tabela, sem linha ou com erro, fica de fora do dossiê. */
async function loadLongTermPlan(workId: string): Promise<LongTermPlanDocument | undefined> {
  const { data, error } = await getServiceClient().from('long_term_plans').select('document').eq('work_id', workId).maybeSingle();
  if (error || !data?.document || typeof data.document !== 'object') return undefined;
  return data.document as LongTermPlanDocument;
}
/** Semana 1 das configurações da obra, se definida. */
async function loadWeekOne(workId: string): Promise<string | undefined> {
  const { data, error } = await getServiceClient().from('work_settings').select('week_one_start').eq('work_id', workId).maybeSingle();
  return !error && data?.week_one_start ? startOfWeek(data.week_one_start) : undefined;
}

type Context = { data: PlanningData; today: string; briefing: AgentBriefing; weekOne?: string; longTermPlan?: LongTermPlanDocument };
async function loadContext(workId: string, access: Access): Promise<Context> {
  const [snapshot, longTermPlan, weekOne] = await Promise.all([
    new SupabasePlanningRepository().getSnapshot({ workIds: [workId] }),
    access.levels.includes('longo') ? loadLongTermPlan(workId) : Promise.resolve(undefined),
    loadWeekOne(workId),
  ]);
  const data = scopePlanning(snapshot, access.profile.id);
  const today = todayInSaoPaulo();
  const briefing = buildBriefing({ data, workId, today, levels: access.levels, longTermPlan, weekOne });
  return { data, today, briefing, weekOne, longTermPlan };
}

// ─── Livro-razão e orçamento ───────────────────────────────────────────────────

type Ledger =
  | { missing: true }
  | { missing: false; usage: MonthUsage; activeWorks: number; settings: UserAgentSettings | null; insight: StoredInsight | null };
async function loadLedger(workId: string, actorId: string, month: string): Promise<Ledger | string> {
  const [usage, works, settings, insight] = await Promise.all([
    monthUsage(month),
    countActiveWorks(),
    userSettings(actorId),
    readInsight(workId),
  ]);
  if (!usage.ok) return usage.missing ? { missing: true } : usage.error;
  if (!settings.ok) return settings.missing ? { missing: true } : settings.error;
  if (!insight.ok) return insight.missing ? { missing: true } : insight.error;
  if (!works.ok) return works.error;
  return { missing: false, usage: usage.value, activeWorks: works.value, settings: settings.value, insight: insight.value };
}

function budgetState(ledger: Extract<Ledger, { missing: false }>, workId: string, actorId: string, budgetUsd: number): BudgetState {
  return {
    budgetUsd,
    monthUsd: ledger.usage.totalUsd,
    workUsd: ledger.usage.byWork.get(workId)?.usd ?? 0,
    activeWorks: ledger.activeWorks,
    userUsd: ledger.usage.byUser.get(actorId)?.usd ?? 0,
    userLimitUsd: ledger.settings?.monthlyLimitUsd ?? null,
    userBlocked: ledger.settings?.blocked ?? false,
  };
}
const usagePayload = (state: BudgetState, model: string, spent = 0) => ({
  monthUsd: round6(state.monthUsd + spent),
  budgetUsd: state.budgetUsd,
  workUsd: round6(state.workUsd + spent),
  workBudgetUsd: workBudgetOf(state.budgetUsd, state.activeWorks),
  userUsd: round6((state.userUsd ?? 0) + spent),
  userLimitUsd: state.userLimitUsd ?? null,
  model,
});
const emptyUsagePayload = (budgetUsd: number, model: string) => ({
  monthUsd: 0,
  budgetUsd,
  workUsd: 0,
  workBudgetUsd: workBudgetOf(budgetUsd, 1),
  userUsd: 0,
  userLimitUsd: null,
  model,
});
function readingPayload(insight: StoredInsight, briefing: AgentBriefing, data: PlanningData) {
  return {
    markdown: insight.markdown,
    model: insight.model,
    generatedAt: insight.generatedAt,
    generatedBy: { id: insight.generatedBy, name: data.users.find(u => u.id === insight.generatedBy)?.name ?? 'alguém' },
    costUsd: insight.costUsd,
    hash: insight.hash,
    current: insight.hash === briefing.hash,
  };
}

// ─── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const workId = request.nextUrl.searchParams.get('workId') ?? '';
  if (!workId) return fail('Obra não informada.', 400);
  const access = await authorize(workId);
  if (access instanceof NextResponse) return access;
  const { profile } = access;
  const config = agentConfigFromEnv(process.env);
  let context: Context;
  try {
    context = await loadContext(workId, access);
  } catch (cause) {
    logRouteError('GET /api/agente', cause, { actorId: profile.id, workId, step: 'briefing' });
    return fail('Não foi possível montar o dossiê da obra. Tente de novo em instantes.', 502);
  }
  const ledger = await loadLedger(workId, profile.id, monthKey(context.today));
  if (typeof ledger === 'string') {
    logRouteError('GET /api/agente', ledger, { actorId: profile.id, workId, step: 'ledger' });
    return fail('Não foi possível ler o uso do agente de IA. Tente de novo em instantes.', 502);
  }
  const base = {
    agent: { name: AGENT.name, tagline: AGENT.tagline },
    briefing: context.briefing,
    configured: !!config.apiKey,
    canEdit: profile.role !== 'viewer',
  };
  if (ledger.missing)
    return NextResponse.json(
      {
        ...base,
        reading: null,
        usage: emptyUsagePayload(config.budgetUsd, config.model),
        migrationMissing: true,
        blocked: false,
        budget: { allowed: true },
      },
      { headers },
    );
  const state = budgetState(ledger, workId, profile.id, config.budgetUsd);
  const decision = budgetDecision(state, ESTIMATED_CALL_USD.pergunta);
  return NextResponse.json(
    {
      ...base,
      reading: ledger.insight ? readingPayload(ledger.insight, context.briefing, context.data) : null,
      usage: usagePayload(state, config.model),
      migrationMissing: false,
      blocked: ledger.settings?.blocked ?? false,
      budget: decision.allowed ? { allowed: true } : { allowed: false, reason: decision.reason, message: decision.message },
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
  let body: { workId?: unknown; kind?: unknown; question?: unknown; history?: unknown; screen?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Corpo da requisição inválido.', 400);
  }
  // A tela em que a pessoa está (29/10/2026), só para as dúvidas de uso; valor desconhecido é ignorado.
  const screen = isManualScreen(body.screen) ? body.screen : undefined;
  const workId = typeof body.workId === 'string' ? body.workId : '';
  if (!workId) return fail('Obra não informada.', 400);
  const kind = body.kind === 'leitura' ? 'leitura' : body.kind === 'pergunta' ? 'pergunta' : null;
  if (!kind) return fail('Tipo de chamada inválido: use "leitura" ou "pergunta".', 400);
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
  if (kind === 'pergunta' && !question) return fail('Escreva a pergunta.', 422);
  const history = parseHistory(body.history);
  if (!history) return fail('Histórico inválido.', 400);

  const access = await authorize(workId);
  if (access instanceof NextResponse) return access;
  const { profile } = access;
  const config = agentConfigFromEnv(process.env);
  if (!config.apiKey) return fail(NOT_CONFIGURED, 503);
  const log = (cause: unknown, extra: Record<string, unknown> = {}) =>
    logRouteError('POST /api/agente', cause, { actorId: profile.id, workId, kind, ...extra });

  let context: Context;
  try {
    context = await loadContext(workId, access);
  } catch (cause) {
    log(cause, { step: 'briefing' });
    return fail('Não foi possível montar o dossiê da obra. Tente de novo em instantes.', 502);
  }
  const { data, today, briefing } = context;
  const month = monthKey(today);
  const ledger = await loadLedger(workId, profile.id, month);
  if (typeof ledger === 'string') {
    log(ledger, { step: 'ledger' });
    return fail('Não foi possível ler o uso do agente de IA. Tente de novo em instantes.', 502);
  }
  if (ledger.missing) return fail(MIGRATION_MESSAGE, 503);
  const state = budgetState(ledger, workId, profile.id, config.budgetUsd);
  const chatConfig = { apiKey: config.apiKey, model: config.model };

  if (kind === 'leitura') {
    if (ledger.insight && ledger.insight.hash === briefing.hash)
      return NextResponse.json(
        { reading: readingPayload(ledger.insight, briefing, data), usage: usagePayload(state, config.model), unchanged: true },
        { headers },
      );
    const decision = budgetDecision(state, ESTIMATED_CALL_USD.leitura);
    if (!decision.allowed) return fail(decision.message, 429, { reason: decision.reason satisfies BudgetReason });
    try {
      const result = await generateReading({ briefing, config: chatConfig });
      const [saved, recorded] = await Promise.all([
        saveInsight({
          workId,
          hash: briefing.hash,
          markdown: result.text,
          model: result.model,
          generatedBy: profile.id,
          costUsd: result.costUsd,
        }),
        recordUsage({
          workId,
          actorId: profile.id,
          month,
          kind,
          model: result.model,
          calls: result.calls,
          usage: result.usage,
          costUsd: result.costUsd,
        }),
      ]);
      // A chamada já foi feita e paga: falha ao guardar vira registro, não erro para a pessoa.
      if (!saved.ok) log(saved.error, { step: 'saveInsight' });
      if (!recorded.ok) log(recorded.error, { step: 'recordUsage' });
      const insight: StoredInsight = saved.ok
        ? saved.value
        : {
            workId,
            hash: briefing.hash,
            markdown: result.text,
            model: result.model,
            generatedAt: new Date().toISOString(),
            generatedBy: profile.id,
            costUsd: result.costUsd,
          };
      return NextResponse.json(
        { reading: readingPayload(insight, briefing, data), usage: usagePayload(state, result.model, result.costUsd) },
        { headers },
      );
    } catch (cause) {
      log(cause, { step: 'model' });
      if (isAgentModelError(cause)) return fail(cause.message, cause.status);
      return fail('Falha na leitura. Tente de novo em instantes.', 502);
    }
  }

  const decision = budgetDecision(state, ESTIMATED_CALL_USD.pergunta);
  if (!decision.allowed) return fail(decision.message, 429, { reason: decision.reason satisfies BudgetReason });
  const toolContext: ToolContext = {
    data,
    workId,
    today,
    actor: { id: profile.id, role: profile.role },
    levels: access.levels,
    weekOne: context.weekOne,
    longTermPlan: context.longTermPlan,
    newId: () => crypto.randomUUID(),
  };
  try {
    const result = await answerQuestion({ briefing, config: chatConfig, question, history, toolContext, screen });
    const recorded = await recordUsage({
      workId,
      actorId: profile.id,
      month,
      kind,
      model: result.model,
      calls: result.calls,
      usage: result.usage,
      costUsd: result.costUsd,
    });
    if (!recorded.ok) log(recorded.error, { step: 'recordUsage' });
    return NextResponse.json(
      { answer: result.text, proposals: result.proposals, usage: usagePayload(state, result.model, result.costUsd), model: result.model },
      { headers },
    );
  } catch (cause) {
    log(cause, { step: 'model' });
    if (isAgentModelError(cause)) return fail(cause.message, cause.status);
    return fail('Falha na pergunta. Tente de novo em instantes.', 502);
  }
}

import { NextResponse, type NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { SupabasePlanningRepository } from '@/infrastructure/repositories/supabase/planning-repository';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { scopePlanning } from '@/application/use-cases/scope-planning';
import { todayInSaoPaulo } from '@/infrastructure/clock';
import { logRouteError } from '@/infrastructure/log';
import { startOfWeek } from '@/domain/validation';
import { applyClosingFilter, failureRows, type FailureRow } from '@/modules/curto-prazo/justifications';
import { agentConfigFromEnv } from '@/domain/agent-cost';

export const runtime = 'nodejs';
// A chamada ao modelo leva dezenas de segundos com muitas linhas; o padrão da Vercel cortaria antes.
export const maxDuration = 60;

const MODEL = 'claude-sonnet-5-5';
const MAX_ROWS = 1500;
const MAX_JUSTIFICATION = 200;
const MAX_TOKENS = 1500;
const headers = { 'Cache-Control': 'no-store' };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers });
const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every(item => typeof item === 'string') ? (value as string[]) : undefined;

const SYSTEM = `Você é analista de planejamento de obra (Last Planner System) e lê o fechamento semanal de compromissos de uma construtora brasileira.
Recebe as linhas não cumpridas: causa (lista fechada), justificativa escrita pela equipe de obra, empreiteiro, equipe, semana e atividade.
Responda em português do Brasil, em markdown simples (títulos com #, listas com -, negrito com **), direto e sem introdução. Estrutura obrigatória:
# Principais temas por causa
Para cada causa relevante, os temas que as justificativas revelam, com contagem aproximada e exemplos citados entre aspas.
# Padrões por empreiteiro
Repetições por empreiteiro ou equipe (mesma causa, mesma justificativa, semanas seguidas).
# 5 ações recomendadas
Lista numerada de 1 a 5, cada ação concreta, com o responsável provável e a causa que ataca.
Baseie-se só nos dados recebidos; se faltarem justificativas, diga isso. Não invente números: use "cerca de" quando estimar.`;

/** Entrada enxuta para o modelo: uma linha por falha, justificativa cortada em 200 caracteres e no
 * máximo 1500 linhas (as mais recentes), com o resumo por causa na frente para ancorar as contagens. */
function buildInput(rows: FailureRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(row.cause, (totals.get(row.cause) ?? 0) + 1);
  const summary = [...totals.entries()]
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b, 'pt-BR'))
    .map(([cause, total]) => `- ${cause}: ${total}`)
    .join('\n');
  const kept = rows.slice(-MAX_ROWS);
  const lines = kept
    .map(
      row =>
        `S${row.week} | ${row.cause} | ${row.company || '(sem empreiteiro)'} | ${row.team || '-'} | ${row.name} | ${row.justification.slice(0, MAX_JUSTIFICATION) || '(sem justificativa)'}`,
    )
    .join('\n');
  const note = rows.length > kept.length ? `\n(Mostrando as ${kept.length} falhas mais recentes de ${rows.length}.)` : '';
  return `Total de falhas: ${rows.length}${note}\n\nFalhas por causa:\n${summary}\n\nLinhas (semana | causa | empreiteiro | equipe | atividade | justificativa):\n${lines}`;
}

/** Semana 1 das configurações da obra; sem tabela ou sem valor, a primeira semana com linha. */
async function firstWeekOf(workId: string, fallback: string) {
  const { data, error } = await getServiceClient().from('work_settings').select('week_one_start').eq('work_id', workId).maybeSingle();
  return !error && data?.week_one_start ? startOfWeek(data.week_one_start) : fallback;
}

export async function POST(request: NextRequest) {
  let body: { workId?: unknown; scope?: unknown; weekStart?: unknown; companies?: unknown; teams?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail('Corpo da requisição inválido.', 400);
  }
  const workId = typeof body.workId === 'string' ? body.workId : '';
  if (!workId) return fail('Obra não informada.', 400);
  const scope = body.scope === 'semana' ? 'semana' : body.scope === 'obra' ? 'obra' : null;
  if (!scope) return fail('Período inválido.', 400);
  const weekStart = typeof body.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart) ? body.weekStart : '';
  if (scope === 'semana' && !weekStart) return fail('Semana não informada.', 400);
  const companies = strings(body.companies),
    teams = strings(body.teams);

  const { profile } = await getRouteAccess();
  // Leitura apenas: quem consulta a obra também pode pedir a análise.
  if (!profile?.workIds.includes(workId)) return fail('Você não tem acesso a esta obra.', 403);
  // A mesma chave do agente de IA (27/10/2026): `ANTHROPIC_API_KEY` ou o apelido `API_ANTHROPIC` que o usuário gravou.
  const { apiKey } = agentConfigFromEnv(process.env);
  if (!apiKey) return fail('Análise com IA não configurada: defina ANTHROPIC_API_KEY.', 503);

  let rows: FailureRow[];
  try {
    const repository = new SupabasePlanningRepository();
    const data = scopePlanning(await repository.getSnapshot({ workIds: profile.workIds }), profile.id);
    const workTeams = data.teams.filter(t => t.workId === workId);
    const commitments = data.commitments.filter(c => c.workId === workId);
    const today = todayInSaoPaulo();
    const earliest = startOfWeek(commitments.reduce((min, c) => (c.weekStart < min ? c.weekStart : min), today));
    const firstWeek = await firstWeekOf(workId, earliest);
    const filtered = applyClosingFilter(
      commitments,
      { companies: companies && new Set(companies), teams: teams && new Set(teams) },
      workTeams,
    );
    rows = failureRows(scope === 'semana' ? filtered.filter(c => c.weekStart === weekStart) : filtered, workTeams, firstWeek);
  } catch (cause) {
    logRouteError('POST /api/curto-prazo/analise', cause, { actorId: profile.id, workId, step: 'snapshot' });
    return fail('Não foi possível carregar os compromissos. Tente de novo em instantes.', 502);
  }
  if (!rows.length) return fail('Nenhuma falha com causa no recorte escolhido: não há o que analisar.', 422);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Recusa por política cai num modelo alternativo escolhido pelo servidor, em vez de erro.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [{ role: 'user', content: buildInput(rows) }],
    });
    if (response.stop_reason === 'refusal') return fail('O modelo não pôde analisar estes dados.', 502);
    const markdown = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();
    if (!markdown) return fail('A análise voltou vazia. Tente de novo.', 502);
    return NextResponse.json(
      { markdown, rows: rows.length, truncated: rows.length > MAX_ROWS, model: response.model, cut: response.stop_reason === 'max_tokens' },
      { headers },
    );
  } catch (cause) {
    logRouteError('POST /api/curto-prazo/analise', cause, { actorId: profile.id, workId, rows: rows.length, step: 'model' });
    if (cause instanceof Anthropic.AuthenticationError) return fail('Chave da API da Anthropic inválida. Confira ANTHROPIC_API_KEY.', 503);
    if (cause instanceof Anthropic.RateLimitError) return fail('Limite de uso da IA atingido. Tente de novo em instantes.', 429);
    if (cause instanceof Anthropic.APIConnectionError) return fail('Sem conexão com a IA. Tente de novo em instantes.', 502);
    if (cause instanceof Anthropic.APIError)
      return fail(`A IA respondeu com erro${cause.status ? ` ${cause.status}` : ''}. Tente de novo.`, 502);
    return fail('Falha na análise. Tente de novo em instantes.', 502);
  }
}

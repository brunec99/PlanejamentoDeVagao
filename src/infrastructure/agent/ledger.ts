import type { PostgrestError } from '@supabase/supabase-js';
import { getServiceClient } from '../repositories/supabase/client';
import type { AgentCallKind, TokenUsage } from '../../domain/agent-cost';

/** Acesso ao banco do agente de IA (27/10/2026): leitura guardada por obra (`agent_insights`),
 * livro-razão de uso (`agent_usage`) e limites por pessoa (`agent_user_settings`), da migração 0035.
 * Só o servidor chega aqui, com a chave de serviço. Toda função devolve um `LedgerResult`, que separa
 * "a tabela não existe" (migração ainda não aplicada: a rota segue sem o modelo) de erro de verdade. */

export type LedgerResult<T> = { ok: true; value: T } | { ok: false; missing: boolean; error: string };

/** Tabela ausente: código do PostgreSQL ou do PostgREST (cache de esquema sem a tabela). */
export function isMissingTable(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}
const failed = <T>(error: PostgrestError | { code?: string | null; message: string }): LedgerResult<T> => ({
  ok: false,
  missing: isMissingTable(error),
  error: error.message,
});
const caught = <T>(cause: unknown): LedgerResult<T> => ({
  ok: false,
  missing: false,
  error: cause instanceof Error ? cause.message : String(cause),
});
const PAGE = 1000;
const number = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

// ─── Leitura guardada ──────────────────────────────────────────────────────────

export interface StoredInsight {
  workId: string;
  hash: string;
  markdown: string;
  model: string;
  generatedAt: string;
  generatedBy: string;
  costUsd: number;
}
type InsightRow = {
  work_id: string;
  briefing_hash: string;
  markdown: string;
  model: string;
  generated_at: string;
  generated_by: string;
  cost_usd: unknown;
};
const toInsight = (row: InsightRow): StoredInsight => ({
  workId: row.work_id,
  hash: row.briefing_hash,
  markdown: row.markdown,
  model: row.model,
  generatedAt: row.generated_at,
  generatedBy: row.generated_by,
  costUsd: number(row.cost_usd),
});

export async function readInsight(workId: string): Promise<LedgerResult<StoredInsight | null>> {
  try {
    const { data, error } = await getServiceClient().from('agent_insights').select('*').eq('work_id', workId).maybeSingle();
    if (error) return failed(error);
    return { ok: true, value: data ? toInsight(data as InsightRow) : null };
  } catch (cause) {
    return caught(cause);
  }
}

export async function saveInsight(input: {
  workId: string;
  hash: string;
  markdown: string;
  model: string;
  generatedBy: string;
  costUsd: number;
}): Promise<LedgerResult<StoredInsight>> {
  try {
    const { data, error } = await getServiceClient()
      .from('agent_insights')
      .upsert(
        {
          work_id: input.workId,
          briefing_hash: input.hash,
          markdown: input.markdown,
          model: input.model,
          generated_at: new Date().toISOString(),
          generated_by: input.generatedBy,
          cost_usd: input.costUsd,
        },
        { onConflict: 'work_id' },
      )
      .select('*')
      .single();
    if (error) return failed(error);
    return { ok: true, value: toInsight(data as InsightRow) };
  } catch (cause) {
    return caught(cause);
  }
}

// ─── Livro-razão ───────────────────────────────────────────────────────────────

export interface WorkUsage {
  usd: number;
  calls: number;
}
export interface UserUsage {
  usd: number;
  calls: number;
  leituras: number;
  perguntas: number;
  /** Última chamada da pessoa no mês (ISO). */
  lastAt?: string;
}
export interface MonthUsage {
  byWork: Map<string, WorkUsage>;
  byUser: Map<string, UserUsage>;
  totalUsd: number;
  totalCalls: number;
}
type UsageRow = { work_id: string; actor_id: string; kind: string; calls: unknown; cost_usd: unknown; created_at: string };
const round6 = (usd: number) => Math.round(usd * 1_000_000) / 1_000_000;

/** Tudo o que o mês gastou, numa só consulta paginada em blocos de 1000 (o PostgREST corta em 1000 por
 * padrão; sem o `range`, um mês movimentado ficaria subcontado e o teto seria furado). */
export async function monthUsage(month: string): Promise<LedgerResult<MonthUsage>> {
  const rows: UsageRow[] = [];
  try {
    const client = getServiceClient();
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client
        .from('agent_usage')
        .select('work_id, actor_id, kind, calls, cost_usd, created_at')
        .eq('month', month)
        .order('created_at')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) return failed(error);
      rows.push(...((data ?? []) as UsageRow[]));
      if (!data || data.length < PAGE) break;
    }
  } catch (cause) {
    return caught(cause);
  }
  const byWork = new Map<string, WorkUsage>();
  const byUser = new Map<string, UserUsage>();
  let totalUsd = 0,
    totalCalls = 0;
  for (const row of rows) {
    const usd = number(row.cost_usd),
      calls = Math.max(0, Math.round(number(row.calls)));
    totalUsd += usd;
    totalCalls += calls;
    const work = byWork.get(row.work_id) ?? { usd: 0, calls: 0 };
    work.usd = round6(work.usd + usd);
    work.calls += calls;
    byWork.set(row.work_id, work);
    const user = byUser.get(row.actor_id) ?? { usd: 0, calls: 0, leituras: 0, perguntas: 0 };
    user.usd = round6(user.usd + usd);
    user.calls += calls;
    if (row.kind === 'leitura') user.leituras += 1;
    else if (row.kind === 'pergunta') user.perguntas += 1;
    if (!user.lastAt || row.created_at > user.lastAt) user.lastAt = row.created_at;
    byUser.set(row.actor_id, user);
  }
  return { ok: true, value: { byWork, byUser, totalUsd: round6(totalUsd), totalCalls } };
}

export interface UsageRecord {
  workId: string;
  actorId: string;
  month: string;
  kind: AgentCallKind;
  model: string;
  /** Iterações com o modelo numa mesma pergunta (as ferramentas pedem idas e voltas). */
  calls: number;
  usage: TokenUsage;
  costUsd: number;
}

export async function recordUsage(record: UsageRecord): Promise<LedgerResult<null>> {
  try {
    const { error } = await getServiceClient()
      .from('agent_usage')
      .insert({
        work_id: record.workId,
        actor_id: record.actorId,
        month: record.month,
        kind: record.kind,
        model: record.model,
        calls: Math.max(1, Math.round(record.calls)),
        input_tokens: Math.round(record.usage.input),
        cache_read_tokens: Math.round(record.usage.cacheRead),
        cache_write_tokens: Math.round(record.usage.cacheWrite),
        output_tokens: Math.round(record.usage.output),
        cost_usd: record.costUsd,
      });
    if (error) return failed(error);
    return { ok: true, value: null };
  } catch (cause) {
    return caught(cause);
  }
}

// ─── Limites por pessoa ────────────────────────────────────────────────────────

export interface UserAgentSettings {
  userId: string;
  /** Nulo = sem limite individual; valem só os tetos gerais. */
  monthlyLimitUsd: number | null;
  blocked: boolean;
  updatedAt: string;
  updatedBy: string;
}
type SettingsRow = { user_id: string; monthly_limit_usd: unknown; blocked: boolean; updated_at: string; updated_by: string };
const toSettings = (row: SettingsRow): UserAgentSettings => ({
  userId: row.user_id,
  monthlyLimitUsd: row.monthly_limit_usd === null || row.monthly_limit_usd === undefined ? null : number(row.monthly_limit_usd),
  blocked: row.blocked === true,
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});

export async function userSettings(userId: string): Promise<LedgerResult<UserAgentSettings | null>> {
  try {
    const { data, error } = await getServiceClient().from('agent_user_settings').select('*').eq('user_id', userId).maybeSingle();
    if (error) return failed(error);
    return { ok: true, value: data ? toSettings(data as SettingsRow) : null };
  } catch (cause) {
    return caught(cause);
  }
}

export async function allUserSettings(): Promise<LedgerResult<UserAgentSettings[]>> {
  try {
    const { data, error } = await getServiceClient().from('agent_user_settings').select('*').order('user_id');
    if (error) return failed(error);
    return { ok: true, value: ((data ?? []) as SettingsRow[]).map(toSettings) };
  } catch (cause) {
    return caught(cause);
  }
}

export async function saveUserSettings(input: {
  userId: string;
  monthlyLimitUsd: number | null;
  blocked: boolean;
  updatedBy: string;
}): Promise<LedgerResult<UserAgentSettings>> {
  try {
    const { data, error } = await getServiceClient()
      .from('agent_user_settings')
      .upsert(
        {
          user_id: input.userId,
          monthly_limit_usd: input.monthlyLimitUsd,
          blocked: input.blocked,
          updated_at: new Date().toISOString(),
          updated_by: input.updatedBy,
        },
        { onConflict: 'user_id' },
      )
      .select('*')
      .single();
    if (error) return failed(error);
    return { ok: true, value: toSettings(data as SettingsRow) };
  } catch (cause) {
    return caught(cause);
  }
}

// ─── Obras ativas ──────────────────────────────────────────────────────────────

/** Obras ativas no sistema: é por elas que o teto mensal é dividido (`workBudgetOf`). */
export async function countActiveWorks(): Promise<LedgerResult<number>> {
  try {
    const { count, error } = await getServiceClient().from('works').select('id', { count: 'exact', head: true }).eq('active', true);
    if (error) return failed(error);
    return { ok: true, value: count ?? 0 };
  } catch (cause) {
    return caught(cause);
  }
}

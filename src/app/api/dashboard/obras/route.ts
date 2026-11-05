import { NextResponse } from 'next/server';
import { hasSectionAccess } from '@/application/module-access';
import type { LongTermPlanDocument } from '@/domain/long-term-plan';
import type { TerminalityData } from '@/domain/terminality';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { logRouteError, logRouteTiming, serverTimingHeader, SLOW_ROUTE_MS } from '@/infrastructure/log';
import { getServiceClient } from '@/infrastructure/repositories/supabase/client';
import { loadTerminality, TerminalityUnavailableError } from '@/infrastructure/repositories/supabase/terminality-repository';
import type { PortfolioSourcesResponse } from '@/modules/dashboard/portfolio/types';

/** Dashboard geral (04/11/2026, regra 15 do modelo "Dashboard geral e escalas de tempo"): o que o planejamento
 * já carregado não traz, para todas as obras liberadas para a pessoa numa leitura só. O longo prazo vem numa
 * consulta a `long_term_plans` com todas as obras, e só para quem pode abrir o módulo (a rota fica fora de
 * `RESTRICTED_API_PREFIXES`: o proxy só exige login, e o acesso ao longo prazo é decidido aqui, sem 403 para
 * quem não o tem). A terminalidade vem por obra, até `TERMINALITY_CONCURRENCY` ao mesmo tempo, sem fotos
 * (nenhuma URL assinada). Nenhuma tabela nova, nenhuma migração. */

export const runtime = 'nodejs';
const ROUTE = 'GET /api/dashboard/obras';
/** Quantas obras têm a terminalidade lida ao mesmo tempo: cada uma faz seis consultas paginadas. */
export const TERMINALITY_CONCURRENCY = 4;

/** Leitura do longo prazo: sem acesso ao módulo, as linhas de `long_term_plans` ou a falha (código do banco). */
export type LongTermRead =
  { kind: 'denied' } | { kind: 'rows'; rows: { work_id: string; document: unknown }[] } | { kind: 'error'; code?: string };
/** Leitura da terminalidade de uma obra: os dados, a migração 0028 ausente ou outra falha. */
export type TerminalityRead = { kind: 'ready'; data: TerminalityData } | { kind: 'unavailable' } | { kind: 'error' };

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
/** Mensagem curta que o Dashboard geral mostra no lugar do longo prazo de cada obra. */
export const longTermErrorMessage = (code?: string) =>
  missingTable(code) ? 'Plano de longo prazo indisponível: migração 0024 não aplicada.' : 'Não foi possível ler o plano de longo prazo.';
export const TERMINALITY_ERROR = 'Não foi possível carregar as pendências da obra.';

/** Monta a resposta a partir das leituras, na ordem de `workIds`. Puro. Obra sem linha no longo prazo sai com
 * `longTerm: null` (sem plano salvo); falha da consulta vai para todas as obras. Terminalidade sem a migração
 * em qualquer obra vale para todas (`terminalityAvailable: false`, nenhuma obra com dado); as fotos saem
 * vazias. */
export function assemblePortfolioSources(
  workIds: readonly string[],
  longTerm: LongTermRead,
  terminality: ReadonlyMap<string, TerminalityRead>,
): PortfolioSourcesResponse {
  const terminalityAvailable = !workIds.some(workId => terminality.get(workId)?.kind === 'unavailable');
  const documents = new Map(
    longTerm.kind === 'rows' ? longTerm.rows.map(row => [row.work_id, row.document as LongTermPlanDocument | null]) : [],
  );
  const longTermError = longTerm.kind === 'error' ? longTermErrorMessage(longTerm.code) : undefined;
  return {
    longTermAccess: longTerm.kind !== 'denied',
    terminalityAvailable,
    works: workIds.map(workId => {
      const read = terminalityAvailable ? terminality.get(workId) : undefined;
      return {
        workId,
        ...(longTerm.kind === 'rows' ? { longTerm: documents.get(workId) ?? null } : {}),
        ...(longTermError ? { longTermError } : {}),
        ...(read?.kind === 'ready' ? { terminality: { ...read.data, photos: [] } } : {}),
        ...(read?.kind === 'error' ? { terminalityError: TERMINALITY_ERROR } : {}),
      };
    }),
  };
}

/** `run` em cada item, no máximo `limit` ao mesmo tempo, com os resultados na ordem dos itens. `run` não deve
 * lançar (cada leitura devolve a própria falha). */
export async function mapLimited<T, R>(items: readonly T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await run(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(0, Math.min(limit, items.length)) }, worker));
  return out;
}

async function readLongTerm(workIds: readonly string[], allowed: boolean, actorId: string): Promise<LongTermRead> {
  if (!allowed) return { kind: 'denied' };
  if (!workIds.length) return { kind: 'rows', rows: [] };
  try {
    const { data, error } = await getServiceClient()
      .from('long_term_plans')
      .select('work_id, document')
      .in('work_id', [...workIds]);
    if (error) {
      if (!missingTable(error.code)) logRouteError(ROUTE, new Error(error.message), { actorId, part: 'long_term_plans', code: error.code });
      return { kind: 'error', code: error.code };
    }
    return { kind: 'rows', rows: (data ?? []) as { work_id: string; document: unknown }[] };
  } catch (cause) {
    logRouteError(ROUTE, cause, { actorId, part: 'long_term_plans' });
    return { kind: 'error' };
  }
}

/** Terminalidade de cada obra. A primeira obra sem a migração faz as seguintes pularem a leitura. */
async function readTerminality(workIds: readonly string[], actorId: string): Promise<Map<string, TerminalityRead>> {
  let unavailable = false;
  const reads = await mapLimited(workIds, TERMINALITY_CONCURRENCY, async (workId): Promise<TerminalityRead> => {
    if (unavailable) return { kind: 'unavailable' };
    try {
      return { kind: 'ready', data: await loadTerminality(workId) };
    } catch (cause) {
      if (cause instanceof TerminalityUnavailableError) {
        unavailable = true;
        return { kind: 'unavailable' };
      }
      logRouteError(ROUTE, cause, { actorId, workId, part: 'terminalidade' });
      return { kind: 'error' };
    }
  });
  return new Map(workIds.map((workId, index) => [workId, reads[index]]));
}

export async function GET() {
  // Tempo por fase em `Server-Timing` (`auth`, `longTerm`, `terminality`, `total`), como em `/api/planning`:
  // a terminalidade de muitas obras é a parte que pode pesar.
  const startedAt = performance.now();
  const durations: Record<string, number> = {};
  const { profile, developer, modules } = await getRouteAccess();
  durations.auth = performance.now() - startedAt;
  const respond = (body: PortfolioSourcesResponse | { error: string }, status: number) => {
    durations.total = performance.now() - startedAt;
    if (durations.total > SLOW_ROUTE_MS) logRouteTiming(ROUTE, durations, { actorId: profile?.id, status });
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Server-Timing': serverTimingHeader(durations) } });
  };
  if (!profile) return respond({ error: 'Perfil não provisionado. Contate o gestor.' }, 403);
  const workIds = [...new Set(profile.workIds)];
  const longTermAccess = hasSectionAccess('longo-prazo', { developer, modules });
  const timed = async <T>(phase: string, work: Promise<T>): Promise<T> => {
    const phaseStartedAt = performance.now();
    try {
      return await work;
    } finally {
      durations[phase] = performance.now() - phaseStartedAt;
    }
  };
  try {
    const [longTerm, terminality] = await Promise.all([
      timed('longTerm', readLongTerm(workIds, longTermAccess, profile.id)),
      timed('terminality', readTerminality(workIds, profile.id)),
    ]);
    return respond(assemblePortfolioSources(workIds, longTerm, terminality), 200);
  } catch (cause) {
    logRouteError(ROUTE, cause, { actorId: profile.id });
    return respond({ error: 'Não foi possível carregar os dados das obras. Tente de novo em instantes.' }, 502);
  }
}

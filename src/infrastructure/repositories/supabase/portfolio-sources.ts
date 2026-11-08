import { hasSectionAccess, type ModuleAccess } from '../../../application/module-access';
import type { LongTermPlanDocument } from '../../../domain/long-term-plan';
import type { SafetyType } from '../../../domain/safety';
import type { TerminalityData } from '../../../domain/terminality';
import type { PortfolioSafetyItem, PortfolioSourcesResponse } from '../../../modules/dashboard/portfolio/types';
import { logRouteError } from '../../log';
import { getServiceClient } from './client';
import { loadSafetyOverview, SafetyUnavailableError, type SafetyOverviewItem } from './safety-repository';
import { loadTerminality, TerminalityUnavailableError } from './terminality-repository';

/** Dashboard geral (04/11/2026, regra 15 do modelo "Dashboard geral e escalas de tempo"): o que o planejamento
 * já carregado não traz, para todas as obras liberadas para a pessoa numa leitura só. O longo prazo vem numa
 * consulta a `long_term_plans` com todas as obras, e só para quem pode abrir o módulo (sem 403 para quem não o
 * tem: a resposta diz `longTermAccess: false`). A terminalidade vem por obra, até `TERMINALITY_CONCURRENCY` ao
 * mesmo tempo, sem fotos (nenhuma URL assinada), e desde 08/11/2026 só para quem pode abrir o módulo (passou a
 * ser liberado por pessoa; sem ele, nenhuma obra traz `terminality` e o quadro some, como já fazia a tela).
 * Nenhuma tabela nova.
 *
 * Segurança do trabalho (06/11/2026, regra 12 do modelo aprovado): a lista única de tipos e os apontamentos de
 * todas as obras numa leitura paginada de `safety_items`, só com as colunas do cálculo (sem descrição nem
 * fotos). A aba 6 é aberta a todos, então não há conferência de módulo. Sem a migração 0040, `safetyAvailable:
 * false`; outra falha vira `safetyError` em cada obra, e só o quadro de segurança fica indisponível.
 *
 * 08/11/2026: as leituras saíram da rota `GET /api/dashboard/obras` para cá, sem mudar nada, porque a ferramenta
 * `panorama_obras` da Claudia lê as mesmas fontes no servidor e precisa dos mesmos números da página. A rota
 * chama `readPortfolioSources` e continua cuidando da sessão, do `Server-Timing` e do 502. */

const ROUTE = 'GET /api/dashboard/obras';
/** Quantas obras têm a terminalidade lida ao mesmo tempo: cada uma faz seis consultas paginadas. */
export const TERMINALITY_CONCURRENCY = 4;

/** Leitura do longo prazo: sem acesso ao módulo, as linhas de `long_term_plans` ou a falha (código do banco). */
export type LongTermRead =
  { kind: 'denied' } | { kind: 'rows'; rows: { work_id: string; document: unknown }[] } | { kind: 'error'; code?: string };
/** Leitura da terminalidade de uma obra: os dados, a migração 0028 ausente ou outra falha. */
export type TerminalityRead = { kind: 'ready'; data: TerminalityData } | { kind: 'unavailable' } | { kind: 'error' };
/** Leitura da segurança de todas as obras de uma vez: os tipos e os apontamentos, a migração 0040 ausente ou outra falha. */
export type SafetyRead = { kind: 'ready'; types: SafetyType[]; items: SafetyOverviewItem[] } | { kind: 'unavailable' } | { kind: 'error' };

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
/** Mensagem curta que o Dashboard geral mostra no lugar do longo prazo de cada obra. */
export const longTermErrorMessage = (code?: string) =>
  missingTable(code) ? 'Plano de longo prazo indisponível: migração 0024 não aplicada.' : 'Não foi possível ler o plano de longo prazo.';
export const TERMINALITY_ERROR = 'Não foi possível carregar as pendências da obra.';
export const SAFETY_ERROR = 'Não foi possível carregar os apontamentos de segurança.';

/** Monta a resposta a partir das leituras, na ordem de `workIds`. Puro. Obra sem linha no longo prazo sai com
 * `longTerm: null` (sem plano salvo); falha da consulta vai para todas as obras. Terminalidade sem a migração
 * em qualquer obra vale para todas (`terminalityAvailable: false`, nenhuma obra com dado); as fotos saem
 * vazias. A segurança, quando lida (`safety`), sai com `safetyAvailable`, os tipos uma vez e, por obra, os
 * apontamentos dela sem o `workId`; sem `safety` (chamada antiga), a resposta não traz nada de segurança. */
export function assemblePortfolioSources(
  workIds: readonly string[],
  longTerm: LongTermRead,
  terminality: ReadonlyMap<string, TerminalityRead>,
  safety?: SafetyRead,
): PortfolioSourcesResponse {
  const terminalityAvailable = !workIds.some(workId => terminality.get(workId)?.kind === 'unavailable');
  const documents = new Map(
    longTerm.kind === 'rows' ? longTerm.rows.map(row => [row.work_id, row.document as LongTermPlanDocument | null]) : [],
  );
  const longTermError = longTerm.kind === 'error' ? longTermErrorMessage(longTerm.code) : undefined;
  const safetyByWork = new Map<string, PortfolioSafetyItem[]>(workIds.map(workId => [workId, []]));
  if (safety?.kind === 'ready') for (const { workId, ...item } of safety.items) safetyByWork.get(workId)?.push(item);
  return {
    longTermAccess: longTerm.kind !== 'denied',
    terminalityAvailable,
    ...(safety ? { safetyAvailable: safety.kind !== 'unavailable' } : {}),
    ...(safety?.kind === 'ready' ? { safetyTypes: safety.types } : {}),
    works: workIds.map(workId => {
      const read = terminalityAvailable ? terminality.get(workId) : undefined;
      return {
        workId,
        ...(longTerm.kind === 'rows' ? { longTerm: documents.get(workId) ?? null } : {}),
        ...(longTermError ? { longTermError } : {}),
        ...(read?.kind === 'ready' ? { terminality: { ...read.data, photos: [] } } : {}),
        ...(read?.kind === 'error' ? { terminalityError: TERMINALITY_ERROR } : {}),
        ...(safety?.kind === 'ready' ? { safety: safetyByWork.get(workId) ?? [] } : {}),
        ...(safety?.kind === 'error' ? { safetyError: SAFETY_ERROR } : {}),
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

async function readLongTerm(workIds: readonly string[], allowed: boolean, actorId: string, label: string): Promise<LongTermRead> {
  if (!allowed) return { kind: 'denied' };
  if (!workIds.length) return { kind: 'rows', rows: [] };
  try {
    const { data, error } = await getServiceClient()
      .from('long_term_plans')
      .select('work_id, document')
      .in('work_id', [...workIds]);
    if (error) {
      if (!missingTable(error.code)) logRouteError(label, new Error(error.message), { actorId, part: 'long_term_plans', code: error.code });
      return { kind: 'error', code: error.code };
    }
    return { kind: 'rows', rows: (data ?? []) as { work_id: string; document: unknown }[] };
  } catch (cause) {
    logRouteError(label, cause, { actorId, part: 'long_term_plans' });
    return { kind: 'error' };
  }
}

/** Terminalidade de cada obra. A primeira obra sem a migração faz as seguintes pularem a leitura. */
async function readTerminality(workIds: readonly string[], actorId: string, label: string): Promise<Map<string, TerminalityRead>> {
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
      logRouteError(label, cause, { actorId, workId, part: 'terminalidade' });
      return { kind: 'error' };
    }
  });
  return new Map(workIds.map((workId, index) => [workId, reads[index]]));
}

/** Segurança de todas as obras numa leitura (regra 12 da segurança). */
async function readSafety(workIds: readonly string[], actorId: string, label: string): Promise<SafetyRead> {
  try {
    const { types, items } = await loadSafetyOverview(workIds);
    return { kind: 'ready', types, items };
  } catch (cause) {
    if (cause instanceof SafetyUnavailableError) return { kind: 'unavailable' };
    logRouteError(label, cause, { actorId, part: 'seguranca' });
    return { kind: 'error' };
  }
}

export interface PortfolioSourcesRequest extends ModuleAccess {
  /** As obras liberadas para a pessoa (repetidas contam uma vez); a resposta segue esta ordem. */
  workIds: readonly string[];
  /** Quem pede, para os registros de erro. */
  actorId: string;
  /** Rótulo dos registros de erro; padrão: a rota do Dashboard geral. */
  label?: string;
  /** Quando informado, recebe o tempo de cada fase em ms (`longTerm`, `terminality`, `safety`), para o
   * `Server-Timing` da rota. */
  durations?: Record<string, number>;
}

/** A resposta de `GET /api/dashboard/obras` para estas obras e este acesso: longo prazo só com o módulo
 * `longo-prazo`, terminalidade só com o módulo `terminalidade` (os dois por `hasSectionAccess`, como a tela
 * decide os quadros), segurança sempre. Cada leitura devolve a própria falha (vira mensagem na obra); só um
 * erro inesperado fora delas lança, e a rota o transforma em 502. */
export async function readPortfolioSources(request: PortfolioSourcesRequest): Promise<PortfolioSourcesResponse> {
  const { actorId, durations, label = ROUTE } = request;
  const workIds = [...new Set(request.workIds)];
  const access: ModuleAccess = { developer: request.developer, modules: request.modules };
  const longTermAccess = hasSectionAccess('longo-prazo', access);
  const terminalityAccess = hasSectionAccess('terminalidade', access);
  const timed = async <T>(phase: string, work: Promise<T>): Promise<T> => {
    const phaseStartedAt = performance.now();
    try {
      return await work;
    } finally {
      if (durations) durations[phase] = performance.now() - phaseStartedAt;
    }
  };
  const [longTerm, terminality, safety] = await Promise.all([
    timed('longTerm', readLongTerm(workIds, longTermAccess, actorId, label)),
    timed(
      'terminality',
      terminalityAccess ? readTerminality(workIds, actorId, label) : Promise.resolve(new Map<string, TerminalityRead>()),
    ),
    timed('safety', readSafety(workIds, actorId, label)),
  ]);
  return assemblePortfolioSources(workIds, longTerm, terminality, safety);
}

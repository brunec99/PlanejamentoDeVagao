import { hasSectionAccess, type ModuleAccess } from '../../../application/module-access';
import { CHECKLIST_WINDOW_DAYS, shiftDay } from '../../../domain/equipment-checklist';
import {
  buildChecklistBlock,
  buildHeadcountBlock,
  buildLobBlock,
  buildProductionBlock,
  buildRestrictionsBlock,
} from '../../../modules/dashboard/extras/blocks';
import type { DashboardExtrasResponse, ExtrasCell, ExtrasKey, ExtrasRange, WorkExtras } from '../../../modules/dashboard/extras/types';
import { buildSafetyBlock } from '../../../modules/dashboard/portfolio/safety';
import type { PortfolioSafetyItem } from '../../../modules/dashboard/portfolio/types';
import { logRouteError } from '../../log';
import { ChecklistUnavailableError, loadChecklist } from './checklist-repository';
import { HeadcountUnavailableError, loadHeadcountRange } from './headcount-repository';
import { loadLob, LobUnavailableError } from './lob-repository';
import { listPeople, loadPendingCards, PendingUnavailableError } from './pending-repository';
import { mapLimited } from './portfolio-sources';
import { loadProductionRange, ProductionUnavailableError } from './production-repository';
import { loadSafetyOverview, SafetyUnavailableError } from './safety-repository';

/** Quadros novos dos dashboards (12/11/2026, modelo aprovado "Dashboards completos e resumo semanal", regra 11):
 * histograma, produtividade, Quadro de Restrições, Linha de Balanço (IDP), checklist de equipamentos e, quando
 * pedida, a segurança, já calculados para o intervalo, de todas as obras pedidas numa leitura. Serve a rota
 * `GET /api/dashboard/extras` (aba 0 e Dashboard geral), a Claudia e o resumo semanal por e-mail (`access:
 * 'all'`). Sem migração.
 *
 * Custo: o efetivo e a produtividade leem só as linhas do intervalo (mais uma consulta de uma linha para o
 * último dia lançado), no máximo `WORK_CONCURRENCY` obras ao mesmo tempo; a segurança vem numa leitura para
 * todas as obras. Cada célula devolve a própria falha: migração ausente vira `unavailable` (e as obras seguintes
 * nem consultam), outra falha vira `error` só nela. Nada aqui lança por causa de uma obra. */

const ROUTE = 'GET /api/dashboard/extras';
/** Quantas obras são lidas ao mesmo tempo (cada uma faz até cinco leituras em paralelo). */
export const WORK_CONCURRENCY = 3;

export const EXTRAS_ERRORS: Record<ExtrasKey, string> = {
  headcount: 'Não foi possível carregar o histograma.',
  production: 'Não foi possível carregar o controle de produtividade.',
  restrictions: 'Não foi possível carregar o Quadro de Restrições.',
  lob: 'Não foi possível carregar a Linha de Balanço.',
  checklist: 'Não foi possível carregar os checklists de equipamentos.',
  safety: 'Não foi possível carregar os apontamentos de segurança.',
};
/** A seção de `module-access` que libera cada célula. */
export const EXTRAS_SECTIONS: Record<ExtrasKey, string> = {
  headcount: 'histograma',
  production: 'produtividade',
  restrictions: 'restricoes',
  lob: 'longo-prazo',
  checklist: 'checklist',
  safety: 'seguranca',
};
const EXTRAS_KEYS = Object.keys(EXTRAS_SECTIONS) as ExtrasKey[];

/** As células que este acesso recebe. A segurança só entra quando a leitura a pede. */
export function allowedExtras(access: ModuleAccess | 'all', includeSafety: boolean): Set<ExtrasKey> {
  return new Set(
    EXTRAS_KEYS.filter(key => (key !== 'safety' || includeSafety) && (access === 'all' || hasSectionAccess(EXTRAS_SECTIONS[key], access))),
  );
}

type Unavailable = abstract new (...args: never[]) => Error;
/** Lê uma célula: o bloco pronto, `absent` (o construtor não achou dado), `unavailable` (a migração do módulo
 * não foi aplicada) ou `error` (qualquer outra falha, que vai para o log). Nunca lança. */
export async function readCell<T>(
  key: ExtrasKey,
  read: () => Promise<T | undefined>,
  unavailable: Unavailable,
  onError: (cause: unknown) => void,
): Promise<ExtrasCell<T>> {
  try {
    const data = await read();
    return data === undefined ? { kind: 'absent' } : { kind: 'ready', data };
  } catch (cause) {
    if (cause instanceof unavailable) return { kind: 'unavailable' };
    onError(cause);
    return { kind: 'error', message: EXTRAS_ERRORS[key] };
  }
}

/** A célula de segurança de cada obra a partir da leitura única. Puro. */
export function safetyCells(
  workIds: readonly string[],
  read:
    | { kind: 'ready'; types: Parameters<typeof buildSafetyBlock>[1]; items: (PortfolioSafetyItem & { workId: string })[] }
    | { kind: 'unavailable' }
    | { kind: 'error' },
  range: ExtrasRange,
): Map<string, NonNullable<WorkExtras['safety']>> {
  if (read.kind === 'unavailable') return new Map(workIds.map(id => [id, { kind: 'unavailable' }]));
  if (read.kind === 'error') return new Map(workIds.map(id => [id, { kind: 'error', message: EXTRAS_ERRORS.safety }]));
  const byWork = new Map<string, PortfolioSafetyItem[]>(workIds.map(id => [id, []]));
  for (const item of read.items) byWork.get(item.workId)?.push(item);
  return new Map(
    workIds.map(id => {
      const block = buildSafetyBlock(byWork.get(id) ?? [], read.types, { start: range.start, end: range.end }, range.today);
      return [id, block ? { kind: 'ready', data: block } : { kind: 'absent' }];
    }),
  );
}

export interface DashboardExtrasRequest {
  /** As obras a ler (repetidas contam uma vez); a resposta segue esta ordem. Quem chama já conferiu que a pessoa as tem. */
  workIds: readonly string[];
  range: ExtrasRange;
  /** O acesso da pessoa; `'all'` para leituras do sistema (resumo semanal). */
  access: ModuleAccess | 'all';
  /** Traz também a segurança (a aba 0 pede; o Dashboard geral já a recebe por `GET /api/dashboard/obras`). */
  includeSafety?: boolean;
  /** Quem pede, para os registros de erro. */
  actorId: string;
  label?: string;
  /** Quando informado, recebe o tempo em ms de `works` (as leituras por obra) e de `safety`. */
  durations?: Record<string, number>;
}

export async function readDashboardExtras(request: DashboardExtrasRequest): Promise<DashboardExtrasResponse> {
  const { range, actorId, durations, label = ROUTE } = request;
  const workIds = [...new Set(request.workIds)];
  const allowed = allowedExtras(request.access, request.includeSafety === true);
  // A primeira obra sem a migração de um módulo dispensa a consulta nas seguintes.
  const missing = new Set<ExtrasKey>();
  const checklistSince = (() => {
    const window = shiftDay(range.today, -CHECKLIST_WINDOW_DAYS);
    return range.start < window ? range.start : window;
  })();

  const timed = async <T>(phase: string, work: Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    try {
      return await work;
    } finally {
      if (durations) durations[phase] = performance.now() - startedAt;
    }
  };
  const cell = async <T>(key: ExtrasKey, workId: string, unavailable: Unavailable, read: () => Promise<T | undefined>) => {
    if (!allowed.has(key)) return undefined;
    if (missing.has(key)) return { kind: 'unavailable' } as ExtrasCell<T>;
    const result = await readCell(key, read, unavailable, cause => logRouteError(label, cause, { actorId, workId, part: key }));
    if (result.kind === 'unavailable') missing.add(key);
    return result;
  };

  const readWork = async (workId: string): Promise<WorkExtras> => {
    const [headcount, production, restrictions, lob, checklist] = await Promise.all([
      cell('headcount', workId, HeadcountUnavailableError, async () => {
        const { entries, lastDay } = await loadHeadcountRange(workId, range.start, range.end);
        return buildHeadcountBlock(entries, range, { lastDay });
      }),
      cell('production', workId, ProductionUnavailableError, async () => {
        const { entries, lastDay } = await loadProductionRange(workId, range.start, range.end);
        return buildProductionBlock(entries, range, { lastDay });
      }),
      cell('restrictions', workId, PendingUnavailableError, async () => {
        const cards = await loadPendingCards(workId);
        return cards.length ? buildRestrictionsBlock(cards, await listPeople(workId), range) : undefined;
      }),
      cell('lob', workId, LobUnavailableError, async () => buildLobBlock(await loadLob(workId), range)),
      cell('checklist', workId, ChecklistUnavailableError, async () =>
        buildChecklistBlock(await loadChecklist(workId, checklistSince), range),
      ),
    ]);
    return {
      workId,
      ...(headcount ? { headcount } : {}),
      ...(production ? { production } : {}),
      ...(restrictions ? { restrictions } : {}),
      ...(lob ? { lob } : {}),
      ...(checklist ? { checklist } : {}),
    };
  };
  const readSafety = async (): Promise<Map<string, NonNullable<WorkExtras['safety']>> | undefined> => {
    if (!allowed.has('safety') || !workIds.length) return undefined;
    try {
      const { types, items } = await loadSafetyOverview(workIds);
      return safetyCells(workIds, { kind: 'ready', types, items }, range);
    } catch (cause) {
      if (cause instanceof SafetyUnavailableError) return safetyCells(workIds, { kind: 'unavailable' }, range);
      logRouteError(label, cause, { actorId, part: 'safety' });
      return safetyCells(workIds, { kind: 'error' }, range);
    }
  };

  const [works, safety] = await Promise.all([
    timed('works', mapLimited(workIds, WORK_CONCURRENCY, readWork)),
    timed('safety', readSafety()),
  ]);
  return {
    range,
    works: works.map(work => {
      const cellOfSafety = safety?.get(work.workId);
      return cellOfSafety ? { ...work, safety: cellOfSafety } : work;
    }),
  };
}

// ─── A consulta da rota ──────────────────────────────────────────────────────────────────────────────

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: string | null): value is string =>
  !!value &&
  ISO_DAY.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
/** O maior intervalo aceito: dez anos (a escala anual de uma obra longa cabe com folga). */
export const EXTRAS_MAX_DAYS = 3660;

export type ExtrasQuery = { ok: true; start: string; end: string; workId?: string; includeSafety: boolean } | { ok: false; error: string };
/** Lê `de`, `ate`, `obra` e `seguranca` da URL. Puro. */
export function parseExtrasQuery(params: URLSearchParams): ExtrasQuery {
  const start = params.get('de');
  const end = params.get('ate');
  if (!validDay(start) || !validDay(end)) return { ok: false, error: 'Informe o período em "de" e "ate", no formato AAAA-MM-DD.' };
  if (end < start) return { ok: false, error: 'O fim do período vem antes do início.' };
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
  if (days > EXTRAS_MAX_DAYS) return { ok: false, error: 'Período longo demais.' };
  const workId = params.get('obra')?.trim();
  return { ok: true, start, end, ...(workId ? { workId } : {}), includeSafety: params.get('seguranca') === '1' };
}

import type { LocalDate } from '@/domain/entities';
import { checklistBoard, checklistSummary, nonConformities, type ChecklistData } from '@/domain/equipment-checklist';
import {
  addDays,
  headcountKey,
  headcountRanking,
  headcountSeries,
  headcountSummary,
  isOwnCompany,
  type HeadcountEntry,
} from '@/domain/headcount';
import { workdaysIn } from '@/domain/holidays';
import type { LobData } from '@/domain/lob';
import { lobPerformance } from '@/domain/lob-performance';
import { isClosed, startBy, type PendingCard, type PendingPerson } from '@/domain/pending-board';
import { productionSummary, productivityBy, type ProductionEntry } from '@/domain/production';
import type {
  ChecklistBlock,
  ExtrasRange,
  ExtrasSeriesPoint,
  HeadcountBlock,
  LobBlock,
  ProductionBlock,
  RestrictionsBlock,
  WorkdayCoverage,
} from './types';

/** Os blocos dos quadros novos dos dashboards (12/11/2026, modelo aprovado "Dashboards completos e resumo
 * semanal"), um construtor por módulo, a partir dos dados crus do domínio e do intervalo. Puro: sem React e sem
 * Supabase, para rodar igual no servidor (`readDashboardExtras`), nos testes e no resumo semanal. Cada construtor
 * devolve o bloco, ou `undefined` quando a obra não tem dado do módulo até o fim do período (a célula vira
 * `absent`: "a obra não usa o módulo"). As contas são as das abas de origem, reaproveitadas do domínio. */

const MISSING_LIMIT = 31;
const WEEKLY_SERIES_MAX = 16;
const TOP_COMPANIES = 5;
const TOP_SERVICES = 12;
const TOP_RESPONSIBLES = 5;
const PENDING_LIST = 6;

const min = (a: LocalDate, b: LocalDate) => (a < b ? a : b);
const inRange = (day: string | undefined | null, range: Pick<ExtrasRange, 'start' | 'end'>) =>
  !!day && day >= range.start && day <= range.end;
const DAY_MS = 86_400_000;
const daysSpan = (from: LocalDate, to: LocalDate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

const LOCAL_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
/** A data civil (Brasília) de um instante ISO; data pura passa direto; inválido vira `undefined`. */
export function localDay(instant: string | undefined | null): LocalDate | undefined {
  if (!instant) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(instant)) return instant;
  const time = Date.parse(instant);
  return Number.isNaN(time) ? undefined : LOCAL_DAY.format(new Date(time));
}

/** Dias úteis do intervalo com lançamento (regra 14). Esperados: de `start` ao menor entre `end` e a véspera de
 * `today` (hoje ainda pode ser lançado e não conta como falta), de segunda a sexta, fora feriado nacional. */
export function workdayCoverage(launchedDays: Iterable<string>, range: ExtrasRange): WorkdayCoverage {
  const launched = new Set(launchedDays);
  const expected = workdaysIn(range.start, min(range.end, addDays(range.today, -1)));
  const missing = expected.filter(day => !launched.has(day));
  return {
    expected: expected.length,
    launched: expected.length - missing.length,
    missing: missing.slice(0, MISSING_LIMIT),
    missingCount: missing.length,
  };
}

/** O que a leitura por intervalo informa além das linhas: o último dia lançado até o fim do período, quando as
 * linhas passadas ao construtor são só as do período (o leitor não traz a obra inteira). */
export interface BlockOptions {
  /** `null` = a obra não tem linha até `range.end`. Ausente = sai das próprias linhas. */
  lastDay?: LocalDate | null;
}
function lastDayOf(days: readonly string[], range: ExtrasRange, options?: BlockOptions): LocalDate | undefined {
  if (options && options.lastDay !== undefined) return options.lastDay ?? undefined;
  let last: string | undefined;
  for (const day of days) if (day <= range.end && (!last || day > last)) last = day;
  return last;
}

// ─── Histograma (2.2), regra 4 ───────────────────────────────────────────────────────────────────────

export function buildHeadcountBlock(
  entries: readonly HeadcountEntry[],
  range: ExtrasRange,
  options?: BlockOptions,
): HeadcountBlock | undefined {
  const lastDay = lastDayOf(
    entries.map(e => e.workedOn),
    range,
    options,
  );
  if (!lastDay) return undefined;
  const filter = { from: range.start, to: range.end };
  const inPeriod = entries.filter(e => inRange(e.workedOn, range));
  const summary = headcountSummary(inPeriod, filter);
  const seriesGrain: HeadcountBlock['seriesGrain'] =
    Math.ceil(daysSpan(range.start, range.end) / 7) <= WEEKLY_SERIES_MAX ? 'semana' : 'mes';
  const series: ExtrasSeriesPoint[] = headcountSeries(inPeriod, filter, seriesGrain, 'vinculo').points.map(point => ({
    key: seriesGrain === 'semana' ? point.start : point.start.slice(0, 7),
    label: point.label,
    value: point.total,
  }));
  return {
    manDays: summary.manDays,
    dailyAverage: summary.dailyAverage,
    peak: summary.peak,
    ...(summary.peakDay ? { peakDay: summary.peakDay } : {}),
    contractorShare: summary.contractorShare,
    coverage: workdayCoverage(
      inPeriod.map(e => e.workedOn),
      range,
    ),
    lastDay,
    series,
    seriesGrain,
    companies: headcountRanking(inPeriod, filter, 'empresa')
      .slice(0, TOP_COMPANIES)
      .map(row => ({ name: row.name, manDays: row.manDays, averagePresent: row.averagePresent, own: row.own ?? isOwnCompany(row.name) })),
  };
}

// ─── Produtividade (2.3), regra 5 ────────────────────────────────────────────────────────────────────

export function buildProductionBlock(
  entries: readonly ProductionEntry[],
  range: ExtrasRange,
  options?: BlockOptions,
): ProductionBlock | undefined {
  const lastDay = lastDayOf(
    entries.map(e => e.workedOn),
    range,
    options,
  );
  if (!lastDay) return undefined;
  const filter = { from: range.start, to: range.end };
  const inPeriod = entries.filter(e => inRange(e.workedOn, range));
  const summary = productionSummary(inPeriod, filter);
  return {
    entries: summary.entries,
    measured: summary.measured,
    pending: summary.pending,
    manDays: summary.manDays,
    ...(summary.entries > 0 ? { measuredShare: summary.measured / summary.entries } : {}),
    coverage: workdayCoverage(
      inPeriod.map(e => e.workedOn),
      range,
    ),
    lastDay,
    services: productivityBy(inPeriod, filter, 'service')
      .sort((a, b) => b.manDays - a.manDays || a.name.localeCompare(b.name, 'pt-BR') || a.unit.localeCompare(b.unit))
      .slice(0, TOP_SERVICES)
      .map(row => ({
        key: headcountKey(row.name),
        name: row.name,
        unit: row.unit,
        quantity: row.quantity,
        manDays: row.manDays,
        perManDay: row.perManDay,
        measured: row.measured,
      })),
  };
}

// ─── Quadro de Restrições (1.4), regra 6 ─────────────────────────────────────────────────────────────

export const NO_RESPONSIBLE_LABEL = 'Sem responsável na obra';

/** Retrato em `asOf` (o menor entre o fim do período e hoje): em aberto = criado até lá e não fechado até lá.
 * O card fechado depois de `asOf` conta como aberto; como a coluna em que ele estava não se reconstrói, entra
 * em "Fazendo". Vencido = aberto com a entrega antes de `asOf`; começo atrasado = ainda em "A fazer", com o
 * "começar até" antes de `asOf` e a entrega não vencida. */
export function buildRestrictionsBlock(
  cards: readonly PendingCard[],
  people: readonly PendingPerson[],
  range: ExtrasRange,
): RestrictionsBlock | undefined {
  const asOf = min(range.end, range.today);
  const known = cards.map(card => ({
    card,
    created: localDay(card.createdAt) ?? '',
    closed: isClosed(card.status) ? localDay(card.closedAt) : undefined,
  }));
  const until = known.filter(k => k.created && k.created <= asOf);
  if (!until.length) return undefined;
  const names = new Map(people.map(p => [p.id, p.name]));
  const byStatus = { todo: 0, doing: 0, paused: 0 };
  const responsibles = new Map<string, { name: string; open: number; overdue: number }>();
  let open = 0;
  let overdue = 0;
  let startOverdue = 0;
  for (const { card, closed } of until) {
    const closedNow = isClosed(card.status);
    // Fechado sem data de fechamento conta como fechado desde sempre.
    if (closedNow && (!closed || closed <= asOf)) continue;
    open++;
    const status = closedNow ? 'doing' : (card.status as 'todo' | 'doing' | 'paused');
    byStatus[status]++;
    const late = card.dueDate < asOf;
    if (late) overdue++;
    else if (status === 'todo' && startBy(card) < asOf) startOverdue++;
    const name = names.get(card.responsibleId) ?? NO_RESPONSIBLE_LABEL;
    const key = names.has(card.responsibleId) ? card.responsibleId : '';
    const entry = responsibles.get(key) ?? { name, open: 0, overdue: 0 };
    entry.open++;
    if (late) entry.overdue++;
    responsibles.set(key, entry);
  }
  return {
    asOf,
    open,
    byStatus,
    overdue,
    startOverdue,
    doneInPeriod: known.filter(k => k.card.status === 'done' && inRange(k.closed, range)).length,
    cancelledInPeriod: known.filter(k => k.card.status === 'cancelled' && inRange(k.closed, range)).length,
    createdInPeriod: known.filter(k => inRange(k.created, range)).length,
    byResponsible: [...responsibles.values()]
      .sort((a, b) => b.open - a.open || b.overdue - a.overdue || a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, TOP_RESPONSIBLES),
  };
}

// ─── Linha de Balanço (1.1), regra 7 ─────────────────────────────────────────────────────────────────

/** O IDP da última medição fechada até o fim do período, no peso vigente (custo, ou duração sem custo
 * cadastrado). Só percentuais e o índice: nenhum valor em reais sai daqui. Sem bloco lançado, sem dado. */
export function buildLobBlock(
  data: Pick<LobData, 'services' | 'activities' | 'baselines' | 'measurements' | 'items' | 'costs'>,
  range: ExtrasRange,
): LobBlock | undefined {
  if (!data.activities.length) return undefined;
  const measurements = data.measurements.filter(m => m.date <= range.end);
  const kept = new Set(measurements.map(m => m.id));
  const performance = lobPerformance({ ...data, measurements, items: data.items.filter(item => kept.has(item.measurementId)) });
  const point = performance.point;
  return {
    status: performance.status,
    ...(point?.idp !== undefined ? { idp: point.idp } : {}),
    ...(point ? { real: point.real, planned: point.planned, measurementDate: point.date, measurementNumber: point.number } : {}),
    weighting: performance.weights.mode,
    ...(performance.baseline ? { baselineName: performance.baseline.name } : {}),
  };
}

// ─── Checklist de equipamentos (3.2), regra 8 ────────────────────────────────────────────────────────

/** O quadro de vencidos é o de hoje (`range.today`), como a aba; inspeções e não conformidades são as do
 * período. Sem equipamento ativo e sem inspeção até o fim do período, sem dado. */
export function buildChecklistBlock(data: ChecklistData, range: ExtrasRange): ChecklistBlock | undefined {
  const board = checklistBoard(data, range.today);
  if (!board.length && !data.runs.some(run => run.doneOn <= range.end)) return undefined;
  const summary = checklistSummary(board);
  const totals = Object.values(summary.due);
  const pendingList = board
    .flatMap(row => row.dues)
    .filter(due => due.status === 'pending')
    .slice(0, PENDING_LIST)
    .map(due => ({ equipment: due.equipment.name, model: due.model.name, frequency: due.model.frequency }));
  const runs = data.runs.filter(run => inRange(run.doneOn, range));
  const counts = runs.map(nonConformities);
  return {
    equipment: summary.equipment,
    due: totals.reduce((sum, d) => sum + d.total, 0),
    pending: totals.reduce((sum, d) => sum + d.pending, 0),
    pendingList,
    runsInPeriod: runs.length,
    runsWithNonConformity: counts.filter(count => count > 0).length,
    nonConformities: counts.reduce((sum, count) => sum + count, 0),
  };
}

// ─── Endereço da rota ────────────────────────────────────────────────────────────────────────────────

/** `GET /api/dashboard/extras` para o intervalo: sem `workId`, todas as obras liberadas (Dashboard geral); com
 * `safety`, traz também a segurança (a aba 0 pede). */
export function dashboardExtrasPath(
  range: Pick<ExtrasRange, 'start' | 'end'>,
  options: { workId?: string; safety?: boolean } = {},
): string {
  const params = new URLSearchParams({ de: range.start, ate: range.end });
  if (options.workId) params.set('obra', options.workId);
  if (options.safety) params.set('seguranca', '1');
  return `/api/dashboard/extras?${params}`;
}

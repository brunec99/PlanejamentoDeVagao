/** Índice de desempenho de prazo (IDP) da Linha de Balanço, ponderado por custo (11/11/2026, modelo
 * aprovado "IDP na Linha de Balanço", com a mudança pedida pelo usuário: a apropriação dos custos é
 * uma tela própria, por pacote de serviço). Tudo puro, a partir de `LobData`.
 *
 * Regras do modelo (numeração do modelo publicado):
 *  1. IDP = % físico real ÷ % físico planejado, na mesma data, com os mesmos blocos e o mesmo peso.
 *     Com o peso por custo, é o índice do valor agregado (valor agregado ÷ valor planejado).
 *  3. A data é a da última medição fechada; a medição aberta não conta.
 *  4. O planejado sai da linha de base escolhida; sem escolha, da manual mais recente; sem linha de
 *     base manual, do cronograma atual. Bloco criado depois da linha de base usa as datas atuais.
 *  5. Custo por pacote de serviço (soma dos itens apropriados), repartido entre os blocos do pacote
 *     pela duração.
 *  6. Enquanto algum pacote com blocos estiver sem item de custo, tudo segue pesado pela duração.
 *     Um item de valor zero conta como informado.
 *  7. Um peso só na aba: o avanço físico, o previsto até hoje, a curva das Medições e o IDP usam o
 *     mesmo `LobWeights`.
 * 10. Faixas: 1,00 ou mais verde; 0,90 a 0,99 amarelo; abaixo de 0,90 vermelho, pelo número mostrado
 *     (duas casas).
 * 11. Sem medição fechada ou sem nada planejado até a data, não há IDP. */
import {
  closedMeasurements,
  measuredPercents,
  physicalProgress,
  plannedPercent,
  type LobActivity,
  type LobBaseline,
  type LobBaselineEntry,
  type LobCostItem,
  type LobData,
  type LobId,
  type LobMeasurement,
  type LobService,
  type LocalDate,
} from './lob';

// ─── Valores em reais ───────────────────────────────────────────────────────────

const cents = (value: number) => Math.round(value * 100) / 100;

/** Lê um valor em reais digitado ou colado do Excel: "R$ 1.234.567,89", "1234567,89", "1.500"
 * (mil e quinhentos), "1500.5", "(1.234,00)" e "-" (vazio). Devolve `null` para vazio e `NaN` para
 * texto que não é número. Ponto seguido de exatamente três dígitos é separador de milhar, como no
 * Brasil; vírgula é sempre a casa decimal, a menos que venha antes de um ponto ("1,234.56"). */
export function parseMoney(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  if (typeof input !== 'string') return null;
  let text = input.replace(/ /g, ' ').trim();
  if (!text || text === '-' || text === '—') return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/r\$/i, '').replace(/\s+/g, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text)) return NaN;
  const lastComma = text.lastIndexOf(','),
    lastDot = text.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot > lastComma)
    normalized = text.replace(/,/g, ''); // 1,234.56
  else if (lastComma >= 0)
    normalized = text.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (lastDot >= 0) {
    const parts = text.split('.');
    // "1.500" e "1.234.567": milhar; "1500.5" e "12.75": decimal.
    normalized = parts.length > 2 || parts[parts.length - 1].length === 3 ? parts.join('') : text;
  } else normalized = text;
  if ((normalized.match(/\./g) ?? []).length > 1 || normalized.includes(',')) return NaN;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return NaN;
  return negative ? -value : value;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "R$ 1.234.567,89". */
export const formatMoney = (value: number) => brl.format(value);
/** "1.234.567,89", para campo de digitação. */
export const formatMoneyInput = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Custo por pacote e peso ────────────────────────────────────────────────────

/** Custo de cada pacote: soma dos itens apropriados a ele. Pacote sem item fica fora do mapa (sem
 * custo informado); um item de valor zero põe o pacote no mapa com zero. */
export function serviceCosts(costs: readonly LobCostItem[]): Map<LobId, number> {
  const result = new Map<LobId, number>();
  for (const item of costs) {
    if (!item.serviceId) continue;
    result.set(item.serviceId, cents((result.get(item.serviceId) ?? 0) + item.amount));
  }
  return result;
}

export type LobWeighting = 'cost' | 'duration';
export interface LobWeights {
  mode: LobWeighting;
  /** Por que ficou na duração: falta custo em algum pacote com blocos, ou todos têm custo e a soma é zero. */
  fallback?: 'missing' | 'zero';
  /** Peso de cada bloco: custo do pacote × duração do bloco ÷ duração somada do pacote, ou a duração. */
  weight: Map<LobId, number>;
  /** Pacotes com ao menos um bloco, na ordem da obra. */
  servicesWithBlocks: LobId[];
  /** Pacotes com blocos e sem item de custo (regra 6), na ordem da obra. */
  missingServiceIds: LobId[];
  /** Custo somado dos pacotes com blocos (zero quando nenhum tem custo). */
  totalCost: number;
}

const byOrder = (a: LobService, b: LobService) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, 'pt-BR');

/** O peso dos blocos (regras 5 e 6): por custo quando todo pacote com blocos tem custo e a soma passa
 * de zero; senão, pela duração, que é o peso de antes do IDP. */
export function lobWeights(services: readonly LobService[], activities: readonly LobActivity[], costs: readonly LobCostItem[]): LobWeights {
  const days = new Map<LobId, number>();
  for (const a of activities) days.set(a.serviceId, (days.get(a.serviceId) ?? 0) + a.durationDays);
  const ordered = [...services].sort(byOrder);
  const known = new Set(ordered.map(s => s.id));
  // Bloco de um pacote que não está na lista (não deveria acontecer) entra no fim, para não sumir do peso.
  const servicesWithBlocks = [...ordered.filter(s => days.has(s.id)).map(s => s.id), ...[...days.keys()].filter(id => !known.has(id))];
  const costOf = serviceCosts(costs);
  const missingServiceIds = servicesWithBlocks.filter(id => !costOf.has(id));
  const totalCost = cents(servicesWithBlocks.reduce((sum, id) => sum + (costOf.get(id) ?? 0), 0));
  const weight = new Map<LobId, number>();
  if (servicesWithBlocks.length && !missingServiceIds.length && totalCost > 0) {
    for (const a of activities) weight.set(a.id, ((costOf.get(a.serviceId) ?? 0) * a.durationDays) / days.get(a.serviceId)!);
    return { mode: 'cost', weight, servicesWithBlocks, missingServiceIds, totalCost };
  }
  for (const a of activities) weight.set(a.id, a.durationDays);
  return {
    mode: 'duration',
    ...(servicesWithBlocks.length ? { fallback: missingServiceIds.length ? ('missing' as const) : ('zero' as const) } : {}),
    weight,
    servicesWithBlocks,
    missingServiceIds,
    totalCost,
  };
}

/** "peso por custo" / "peso por duração". */
export const weightingLabel = (mode: LobWeighting) => (mode === 'cost' ? 'peso por custo' : 'peso por duração');

// ─── Planejado pela linha de base ───────────────────────────────────────────────

/** A linha de base do IDP (regra 4): a escolhida; sem escolha, a manual mais recente; sem manual,
 * nenhuma (o planejado sai do cronograma atual). */
export function performanceBaseline(baselines: readonly LobBaseline[], chosenId?: LobId): LobBaseline | undefined {
  if (chosenId) {
    const chosen = baselines.find(b => b.id === chosenId);
    if (chosen) return chosen;
  }
  let best: LobBaseline | undefined;
  for (const b of baselines) if (!b.automatic && (!best || b.createdAt > best.createdAt)) best = b;
  return best;
}

/** Previsto (%) de cada bloco na data: pelas datas da linha de base quando o bloco está nela, pelas
 * atuais quando não está (bloco criado depois) ou sem linha de base. */
export function plannedPercents(activities: readonly LobActivity[], date: LocalDate, baseline?: LobBaseline): Record<LobId, number> {
  const frozen = new Map<LobId, LobBaselineEntry>((baseline?.snapshot ?? []).map(e => [e.activityId, e]));
  const result: Record<LobId, number> = {};
  for (const a of activities) result[a.id] = plannedPercent(frozen.get(a.id) ?? a, date);
  return result;
}

// ─── IDP ────────────────────────────────────────────────────────────────────────

/** IDP com duas casas, que é o número mostrado e o que decide a cor (regra 10). */
export const roundIdp = (value: number) => Math.round(value * 100) / 100;
export type IdpTone = 'good' | 'warn' | 'bad';
export const idpTone = (value: number): IdpTone => {
  const shown = roundIdp(value);
  return shown >= 1 ? 'good' : shown >= 0.9 ? 'warn' : 'bad';
};
export const IDP_TONE_LABEL: Record<IdpTone, string> = { good: 'em dia', warn: 'atenção', bad: 'atrasado' };
/** "0,94". */
export const formatIdp = (value: number) => roundIdp(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** IDP de um real e um planejado; indefinido sem nada planejado (regra 11). */
export const idpOf = (real: number, planned: number) => (planned > 0 ? real / planned : undefined);

export interface LobPerformancePoint {
  measurementId: LobId;
  number: number;
  date: LocalDate;
  /** % físico real na data, no peso vigente. */
  real: number;
  /** % físico planejado na data pela linha de base do IDP, no mesmo peso. */
  planned: number;
  /** Indefinido quando nada estava planejado até a data. */
  idp?: number;
}
export type LobPerformanceStatus = 'no-blocks' | 'no-measurement' | 'nothing-planned' | 'ok';
export interface LobPerformance {
  status: LobPerformanceStatus;
  weights: LobWeights;
  /** A linha de base de onde saiu o planejado; ausente = cronograma atual. */
  baseline?: Pick<LobBaseline, 'id' | 'name' | 'automatic' | 'createdAt'>;
  /** A última medição fechada (regra 3); ausente sem medição fechada. */
  point?: LobPerformancePoint;
  /** Uma por medição fechada, da mais antiga à mais nova (visão Medições). */
  series: LobPerformancePoint[];
}
type PerformanceData = Pick<LobData, 'services' | 'activities' | 'baselines' | 'measurements' | 'items' | 'costs'>;

function pointOf(
  activities: readonly LobActivity[],
  weights: ReadonlyMap<LobId, number>,
  rounds: LobMeasurement[],
  items: LobData['items'],
  measurement: LobMeasurement,
  baseline?: LobBaseline,
): LobPerformancePoint {
  // Só as rodadas até esta (inclusive): duas medições no mesmo dia dão dois pontos diferentes.
  const percents = measuredPercents(rounds, items);
  const planned = plannedPercents(activities, measurement.date, baseline);
  const list = activities as LobActivity[];
  const real = physicalProgress(list, percents, weights) ?? 0;
  const plan = physicalProgress(list, planned, weights) ?? 0;
  const idp = idpOf(real, plan);
  return {
    measurementId: measurement.id,
    number: measurement.number,
    date: measurement.date,
    real,
    planned: plan,
    ...(idp !== undefined ? { idp } : {}),
  };
}

/** O IDP da obra na última medição fechada e a série por medição. `baselineId` é a linha de base
 * escolhida na tela (seletor "Linha de base" da Linha de Balanço); vazio cai na regra 4. */
export function lobPerformance(data: PerformanceData, options: { baselineId?: LobId } = {}): LobPerformance {
  const weights = lobWeights(data.services, data.activities, data.costs);
  const chosen = performanceBaseline(data.baselines, options.baselineId);
  const baseline = chosen ? { id: chosen.id, name: chosen.name, automatic: chosen.automatic, createdAt: chosen.createdAt } : undefined;
  const base = { weights, ...(baseline ? { baseline } : {}) };
  if (!data.activities.length) return { status: 'no-blocks', ...base, series: [] };
  const closed = closedMeasurements(data.measurements);
  if (!closed.length) return { status: 'no-measurement', ...base, series: [] };
  const series = closed.map((m, index) => pointOf(data.activities, weights.weight, closed.slice(0, index + 1), data.items, m, chosen));
  const point = series[series.length - 1];
  return { status: point.idp === undefined ? 'nothing-planned' : 'ok', ...base, point, series };
}

/** O avanço físico e o previsto numa data no peso vigente (regra 7), para o cartão "Avanço físico"
 * (previsto até hoje pelo cronograma atual, como antes) e para a curva das Medições. */
export function weightedProgress(data: PerformanceData, date: LocalDate, weights = lobWeights(data.services, data.activities, data.costs)) {
  const percents = measuredPercents(data.measurements, data.items);
  const list = data.activities as LobActivity[];
  return {
    weights,
    physical: physicalProgress(list, percents, weights.weight),
    planned: physicalProgress(list, plannedPercents(data.activities, date), weights.weight),
  };
}

export interface LobServicePerformance {
  serviceId: LobId;
  blocks: number;
  /** Dias úteis somados dos blocos. */
  days: number;
  /** Itens de custo apropriados ao pacote. */
  itemCount: number;
  /** Custo do pacote; ausente = sem item de custo. */
  cost?: number;
  /** Fatia do pacote no peso da obra (0–100), no peso vigente; ausente para pacote sem blocos. */
  share?: number;
  /** Real e planejado do pacote na data da última medição fechada; ausentes sem medição fechada ou sem blocos. */
  real?: number;
  planned?: number;
  idp?: number;
}

/** Uma linha por pacote (na ordem da obra), para a tela de custos: custo, fatia no peso e o IDP do
 * pacote na data do IDP da obra. Dentro do pacote o peso é a duração nos dois modos, então o real e o
 * planejado do pacote não mudam com o peso; muda só a fatia dele na obra. */
export function servicePerformance(data: PerformanceData, performance: LobPerformance): LobServicePerformance[] {
  const costOf = serviceCosts(data.costs);
  const itemCount = new Map<LobId, number>();
  for (const item of data.costs) if (item.serviceId) itemCount.set(item.serviceId, (itemCount.get(item.serviceId) ?? 0) + 1);
  const totalWeight = [...performance.weights.weight.values()].reduce((a, b) => a + b, 0);
  const point = performance.point;
  const closed = closedMeasurements(data.measurements);
  const rounds = point ? closed.slice(0, closed.findIndex(m => m.id === point.measurementId) + 1) : [];
  const percents = point ? measuredPercents(rounds, data.items) : {};
  const chosen = performance.baseline ? data.baselines.find(b => b.id === performance.baseline!.id) : undefined;
  const planned = point ? plannedPercents(data.activities, point.date, chosen) : {};
  return [...data.services].sort(byOrder).map(service => {
    const blocks = data.activities.filter(a => a.serviceId === service.id);
    const days = blocks.reduce((sum, a) => sum + a.durationDays, 0);
    const weight = blocks.reduce((sum, a) => sum + (performance.weights.weight.get(a.id) ?? 0), 0);
    const row: LobServicePerformance = {
      serviceId: service.id,
      blocks: blocks.length,
      days,
      itemCount: itemCount.get(service.id) ?? 0,
      ...(costOf.has(service.id) ? { cost: costOf.get(service.id)! } : {}),
      ...(blocks.length && totalWeight > 0 ? { share: (100 * weight) / totalWeight } : {}),
    };
    if (point && blocks.length) {
      const real = physicalProgress(blocks, percents) ?? 0;
      const plan = physicalProgress(blocks, planned) ?? 0;
      const idp = idpOf(real, plan);
      Object.assign(row, { real, planned: plan, ...(idp !== undefined ? { idp } : {}) });
    }
    return row;
  });
}

// ─── Sigilo do valor (regra 9) ──────────────────────────────────────────────────

/** Para o perfil de consulta: cada item vira a porcentagem dele no total de todos os itens (quatro
 * casas), então o peso e o IDP saem iguais e o valor em reais não sai do servidor. */
export function maskCosts(costs: readonly LobCostItem[]): LobCostItem[] {
  const total = costs.reduce((sum, item) => sum + item.amount, 0);
  return costs.map(item => ({ ...item, amount: total > 0 ? Math.round((item.amount / total) * 100 * 10000) / 10000 : 0 }));
}

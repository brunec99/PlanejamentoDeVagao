/** Simulação 4D: funções puras que transformam o cronograma de longo prazo e o histórico datado
 * de avanço no estado de cada serviço numa data. Sem React e sem Three — a tela decide o que
 * desenhar, o visualizador só aplica cor, opacidade e visibilidade por serviço. */
import type { ProgressEntry } from '@/domain/entities';

export type SimulationMode = 'planejado' | 'executado' | 'comparado';
export type StepUnit = 'dia' | 'semana' | 'mes';
export type ServiceState = 'nao_iniciado' | 'em_execucao' | 'concluido';
export type Deviation = 'adiantado' | 'no_prazo' | 'atrasado';

/** O mínimo de uma atividade (atual ou de linha de base) que a simulação precisa. */
export interface Scheduled { id: string; plannedStart: string; plannedEnd: string; weight: number }

export interface ServiceFrame {
  state: ServiceState;
  /** Percentual que dá o tom na cena: planejado no modo "Planejado", executado nos demais.
   * `undefined` quando o serviço não tem nenhuma atividade — sem medição. */
  percent: number | undefined;
  planned: number;
  executed: number;
  /** Executado menos planejado de referência, em pontos percentuais. */
  gap: number;
  deviation: Deviation;
}

export const MODE_LABELS: Record<SimulationMode, string> = { planejado: 'Planejado', executado: 'Executado', comparado: 'Planejado × executado' };
export const STATE_LABELS: Record<ServiceState, string> = { nao_iniciado: 'Não iniciado', em_execucao: 'Em execução', concluido: 'Concluído' };
export const DEVIATION_LABELS: Record<Deviation, string> = { adiantado: 'Adiantado', no_prazo: 'No prazo', atrasado: 'Atrasado' };
/** Tolerância, em pontos, para chamar um serviço de adiantado ou atrasado — a mesma folga de 5
 * pontos que a tela já usava para alertar o planejado da linha de base acima do executado. */
export const DEVIATION_TOLERANCE = 5;

const MS = 86400000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromTime = (time: number) => new Date(time).toISOString().slice(0, 10);
export const spanDays = (from: string, to: string) => Math.round((toTime(to) - toTime(from)) / MS) + 1;
export const addDays = (date: string, days: number) => fromTime(toTime(date) + days * MS);

/** Soma meses mantendo o dia de referência; no mês curto, cai no último dia (31/01 → 28/02). */
export function addMonths(date: string, months: number, anchorDay = Number(date.slice(8, 10))) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromTime(Date.UTC(year, month, Math.min(anchorDay, last)));
}

/** Datas da linha do tempo, de `start` a `end`, inclusive nas duas pontas: o último quadro é
 * sempre o término, mesmo quando o passo não cai exatamente nele. */
export function simulationFrames(start: string, end: string, step: StepUnit): string[] {
  if (!start || !end || end < start) return start ? [start] : [];
  const frames: string[] = [];
  const anchor = Number(start.slice(8, 10));
  for (let index = 0, date = start; date < end; index++) {
    frames.push(date);
    date = step === 'dia' ? addDays(start, index + 1) : step === 'semana' ? addDays(start, 7 * (index + 1)) : addMonths(start, index + 1, anchor);
  }
  frames.push(end);
  return frames;
}

/** Quadro que representa uma data: o último que não passa dela (ou o primeiro, antes do início). */
export function frameIndexAt(frames: string[], date: string) {
  let low = 0, high = frames.length - 1, found = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (frames[middle] <= date) { found = middle; low = middle + 1; } else high = middle - 1;
  }
  return found;
}

/** Faixa da simulação: do menor início ao maior término do cronograma (e da linha de base, quando houver). */
export function scheduleRange(...groups: Scheduled[][]): { start: string; end: string } | undefined {
  let start = '', end = '';
  for (const activity of groups.flat()) {
    if (!start || activity.plannedStart < start) start = activity.plannedStart;
    if (!end || activity.plannedEnd > end) end = activity.plannedEnd;
  }
  return start && end ? { start, end } : undefined;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));
function weighted<T extends { weight: number }>(items: T[], value: (item: T) => number) {
  const total = items.reduce((sum, item) => sum + (item.weight > 0 ? item.weight : 0), 0);
  return total ? items.reduce((sum, item) => sum + (item.weight > 0 ? value(item) * item.weight : 0), 0) / total : 0;
}

/** Planejado na data: cada atividade avança linearmente entre as suas datas, ponderada pelo peso. */
export function plannedShare(activity: Pick<Scheduled, 'plannedStart' | 'plannedEnd'>, date: string) {
  if (date < activity.plannedStart) return 0;
  if (date >= activity.plannedEnd) return 100;
  return (spanDays(activity.plannedStart, date) / spanDays(activity.plannedStart, activity.plannedEnd)) * 100;
}
export const plannedPercentAt = (activities: Scheduled[], date: string) => weighted(activities, activity => plannedShare(activity, date));

/** Histórico datado por atividade, em ordem, para responder "último lançamento até a data" por
 * busca binária — a simulação consulta dezenas de datas por segundo. */
export type ProgressIndex = Map<string, ProgressEntry[]>;
export function indexProgress(entries: ProgressEntry[]): ProgressIndex {
  const index: ProgressIndex = new Map();
  for (const entry of entries) {
    const list = index.get(entry.activityId);
    if (list) list.push(entry); else index.set(entry.activityId, [entry]);
  }
  for (const list of index.values()) list.sort((a, b) => a.recordedDate.localeCompare(b.recordedDate) || a.createdAt.localeCompare(b.createdAt));
  return index;
}

/** Executado de uma atividade na data: o último lançamento com `recordedDate <= data`, ou 0. */
export function executedAt(index: ProgressIndex, activityId: string, date: string) {
  const list = index.get(activityId);
  if (!list?.length) return 0;
  let low = 0, high = list.length - 1, found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (list[middle].recordedDate <= date) { found = middle; low = middle + 1; } else high = middle - 1;
  }
  return found < 0 ? 0 : clamp(list[found].progress);
}
export const executedPercentAt = (activities: Scheduled[], index: ProgressIndex, date: string) => weighted(activities, activity => executedAt(index, activity.id, date));

const stateOf = (percent: number): ServiceState => percent >= 100 ? 'concluido' : percent > 0 ? 'em_execucao' : 'nao_iniciado';
export function deviationOf(gap: number): Deviation {
  return gap > DEVIATION_TOLERANCE ? 'adiantado' : gap < -DEVIATION_TOLERANCE ? 'atrasado' : 'no_prazo';
}

/** Estado de um serviço numa data. `activities` são as atividades do cronograma atual com o nome
 * do serviço; `reference`, quando dada e não vazia, é o planejado de comparação (linha de base) —
 * senão a comparação usa o próprio cronograma atual.
 *
 * - planejado: começou quando a janela prevista começou; concluído quando o término passou.
 * - executado e comparado: pelo histórico datado; o modo comparado só muda a cor (desvio). */
export function serviceStateAt(
  activities: Scheduled[],
  progress: ProgressIndex | ProgressEntry[],
  date: string,
  mode: SimulationMode,
  reference?: Scheduled[],
): ServiceFrame {
  const index = Array.isArray(progress) ? indexProgress(progress) : progress;
  const base = reference?.length ? reference : activities;
  if (!activities.length && !base.length) return { state: 'nao_iniciado', percent: undefined, planned: 0, executed: 0, gap: 0, deviation: 'no_prazo' };
  const plannedNow = plannedPercentAt(activities, date);
  const executed = executedPercentAt(activities, index, date);
  const referencePlanned = base === activities ? plannedNow : plannedPercentAt(base, date);
  const gap = executed - referencePlanned;
  const deviation = deviationOf(gap);
  if (mode === 'planejado') {
    const range = scheduleRange(activities);
    const state: ServiceState = !range || date < range.start ? 'nao_iniciado' : date >= range.end ? 'concluido' : 'em_execucao';
    return { state, percent: activities.length ? plannedNow : undefined, planned: plannedNow, executed, gap, deviation };
  }
  return { state: stateOf(executed), percent: activities.length ? executed : undefined, planned: referencePlanned, executed, gap, deviation };
}

export interface FrameEvent { service: string; kind: 'inicio' | 'termino' }
/** O que muda entre dois quadros: serviços que saem de "não iniciado" e que chegam a "concluído".
 * Um serviço que começa e termina no mesmo passo aparece nas duas listas. */
export function frameEvents(previous: Map<string, ServiceState>, current: Map<string, ServiceState>): FrameEvent[] {
  const events: FrameEvent[] = [];
  for (const [service, state] of current) {
    const before = previous.get(service) ?? 'nao_iniciado';
    if (before === 'nao_iniciado' && state !== 'nao_iniciado') events.push({ service, kind: 'inicio' });
    if (before !== 'concluido' && state === 'concluido') events.push({ service, kind: 'termino' });
  }
  return events;
}

/** Como um serviço aparece na cena. A intensidade é do serviço inteiro: o avanço parcial é uma
 * estimativa e nunca marca elementos individuais como executados. */
export interface ServiceLook { color: string; strength: number; display: 'solid' | 'ghost' | 'hidden' }
export const DEVIATION_COLORS: Record<Deviation, string> = { adiantado: '#2a78d6', no_prazo: '#1baf7a', atrasado: '#d03b3b' };
/** A intensidade vai em degraus de 10%: poucos materiais distintos no Fragments e nenhuma
 * repintura quando o percentual mexe só na casa decimal entre dois quadros. */
export const quantize = (percent: number) => Math.round(clamp(percent) / 10) / 10;

export function lookFor(frame: ServiceFrame, mode: SimulationMode, color: string, ghost: boolean): ServiceLook {
  // Serviço com regra e sem atividade: não há o que simular, então fica sempre como fantasma.
  if (frame.percent === undefined) return { color, strength: 0, display: 'ghost' };
  if (frame.state === 'nao_iniciado') return { color, strength: 0, display: ghost ? 'ghost' : 'hidden' };
  const strength = frame.state === 'concluido' ? 1 : quantize(frame.percent);
  return { color: mode === 'comparado' ? DEVIATION_COLORS[frame.deviation] : color, strength, display: 'solid' };
}

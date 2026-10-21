'use client';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { ArrowRightToLine, X } from 'lucide-react';
import type { DayEdge, WorkCalendar } from '@/domain/plan-schedule';
import { CHART } from '@/shared/palette';

/* Linha do Tempo do médio prazo, no molde da "Linha do Tempo" do Project: faixa horizontal acima do
 * Gantt com "Início" e a data à esquerda e "Término" e a data à direita, fora da área das barras;
 * escala de datas no topo, com a unidade (dia, semana, mês, trimestre, ano) escolhida pela largura;
 * cada tarefa adicionada vira uma barra com o nome e o período escritos dentro, a parte concluída
 * mais escura, e as barras que se sobrepõem descem para outra linha; marcos em losango na borda de
 * baixo da faixa, com uma linha fina até a legenda (nome e data), que desce de nível quando duas
 * legendas se encostariam; linha de hoje; e a moldura da janela visível do Gantt, que se arrasta
 * (ou se recentraliza com um clique num ponto vazio da faixa) para rolar o Gantt. O intervalo
 * inteiro cabe na largura disponível, sem rolagem própria, como no Project. Clicar numa barra
 * seleciona a tarefa; o clique duplo e o menu de contexto fazem o "Rolar até a Tarefa"; o menu de
 * contexto, a tecla Delete e o botão que aparece na barra selecionada fazem o "Remover da Linha do
 * Tempo". Do Project vêm o layout e o comportamento; cores, tipografia e cantos são os do Obra 360
 * (`palette.ts` e as classes do Gantt ao lado). É só apresentação: datas e pontas do dia
 * (`DayEdge`) chegam prontas do motor. As contas (escala, posição, linhas, marcas, legendas,
 * moldura, cores e textos) ficam em funções puras exportadas, cobertas por
 * tests/timeline-band.test.ts. */

export interface TimelineItem {
  id: string;
  name: string;
  /** AAAA-MM-DD, datas agendadas. */
  start: string;
  end: string;
  /** 'start' = começo do dia (08:00), 'end' = fim do dia (17:00); o padrão é start/end. */
  startEdge?: DayEdge;
  endEdge?: DayEdge;
  milestone: boolean;
  summary: boolean;
  /** 0–100. */
  progress: number;
  critical?: boolean;
}
export interface TimelineBandProps {
  items: TimelineItem[];
  /** Rótulos "Início" e "Término" nas pontas; sem itens, a faixa cobre esse intervalo. */
  projectStart?: string;
  projectFinish?: string;
  /** Intervalo de dias visível no Gantt agora (a moldura), com o término incluído. */
  visible?: { start: string; end: string };
  today: string;
  calendar: WorkCalendar;
  selectedId?: string;
  onSelect?: (id: string) => void;
  /** Pede ao Gantt para rolar até `start` ser o primeiro dia visível. */
  onPan?: (start: string) => void;
  canEdit?: boolean;
  /** "Remover da Linha do Tempo". */
  onRemove?: (id: string) => void;
  /** Rótulo vertical "LINHA DO TEMPO" na borda esquerda (padrão ligado, como no Project). */
  showSideLabel?: boolean;
  className?: string;
}

// ————— Datas (UTC puro: as datas do plano são dias, sem fuso) —————

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** AAAA-MM-DD que existe no calendário. */
export const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && ISO.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
/** Dias desde 1970-01-01 em UTC. */
export const dayNumber = (date: string) => Math.round(Date.parse(date + 'T00:00:00Z') / DAY_MS);
export const fromDayNumber = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => fromDayNumber(dayNumber(date) + days);
/** 0 = domingo … 6 = sábado; 1970-01-01 foi uma quinta. */
const weekdayOfDay = (day: number) => ((day % 7) + 7 + 4) % 7;
/** "Seg 07/09/26", como o Project escreve as datas na Linha do Tempo. */
export const formatTimelineDate = (date: string) =>
  isIsoDate(date) ? `${WEEKDAYS[weekdayOfDay(dayNumber(date))]} ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}` : '';
/** "Seg 07/09/26 - Ter 29/09/26", o período escrito dentro da barra. */
export const formatTimelinePeriod = (start: string, end: string) => `${formatTimelineDate(start)} - ${formatTimelineDate(end)}`;

// ————— Escala horizontal —————

/** Posição de uma ponta do dia na escala, em dias: o começo do dia é a borda esquerda dele e o fim
 * do dia, a borda direita (a esquerda do dia seguinte). */
export const edgeValue = (date: string, edge: DayEdge = 'start') => dayNumber(date) + (edge === 'end' ? 1 : 0);

export interface TimelineSpan {
  from: number;
  to: number;
}
/** Onde a tarefa fica na escala. A barra vai da ponta de início à de término (padrão: começo do
 * primeiro dia ao fim do último); término antes do início, por dado antigo, vira o próprio dia de
 * início. O marco é um ponto na ponta indicada (a de início, ou a de término quando só ela vem).
 * Sem data de início válida, a tarefa não entra na faixa. */
export function itemSpan(item: Pick<TimelineItem, 'start' | 'end' | 'startEdge' | 'endEdge' | 'milestone'>): TimelineSpan | undefined {
  if (!isIsoDate(item.start)) return undefined;
  if (item.milestone) {
    const at = edgeValue(item.start, item.startEdge ?? item.endEdge ?? 'start');
    return { from: at, to: at };
  }
  const end = isIsoDate(item.end) && item.end >= item.start ? item.end : item.start;
  const from = edgeValue(item.start, item.startEdge ?? 'start');
  return { from, to: Math.max(from, edgeValue(end, item.endEdge ?? 'end')) };
}

export interface TimelineRange extends TimelineSpan {
  /** Datas escritas em "Início" e "Término". */
  start: string;
  finish: string;
}
/** Intervalo que a faixa cobre, de borda a borda, em dias (`to` é a borda direita). É o do projeto
 * (começo do dia de início ao fim do dia de término) somado ao de todas as tarefas da faixa, sem
 * folga nas pontas, como no Project. Sem projeto nem tarefas, cobre a janela visível do Gantt; sem
 * ela, quatro semanas a partir de hoje. Nunca fica mais curto que `minDays` (padrão 7): um marco
 * sozinho fica no meio de uma semana. "Início" e "Término" mostram as datas do projeto; sem elas, a
 * primeira data de início e a última de término das tarefas. */
export function timelineRange(
  items: readonly TimelineItem[],
  {
    projectStart,
    projectFinish,
    visible,
    today,
    minDays = 7,
  }: { projectStart?: string; projectFinish?: string; visible?: { start: string; end: string }; today?: string; minDays?: number } = {},
): TimelineRange {
  const points: number[] = [];
  let first: string | undefined, last: string | undefined;
  if (isIsoDate(projectStart)) points.push(edgeValue(projectStart, 'start'));
  if (isIsoDate(projectFinish)) points.push(edgeValue(projectFinish, 'end'));
  for (const item of items) {
    const span = itemSpan(item);
    if (!span) continue;
    points.push(span.from, span.to);
    const end = !item.milestone && isIsoDate(item.end) && item.end > item.start ? item.end : item.start;
    if (!first || item.start < first) first = item.start;
    if (!last || end > last) last = end;
  }
  if (!points.length && visible && isIsoDate(visible.start) && isIsoDate(visible.end)) {
    const a = dayNumber(visible.start),
      b = dayNumber(visible.end);
    points.push(Math.min(a, b), Math.max(a, b) + 1);
  }
  if (!points.length) {
    const base = isIsoDate(today) ? dayNumber(today) : dayNumber(new Date().toISOString().slice(0, 10));
    points.push(base, base + 28);
  }
  let from = Math.min(...points),
    to = Math.max(...points);
  const short = Math.max(1, Math.round(minDays)) - (to - from);
  if (short > 0) {
    from -= Math.floor(short / 2);
    to += Math.ceil(short / 2);
  }
  return {
    from,
    to,
    start: isIsoDate(projectStart) ? projectStart : (first ?? fromDayNumber(from)),
    finish: isIsoDate(projectFinish) ? projectFinish : (last ?? fromDayNumber(to - 1)),
  };
}

/** Posição em pixels de um valor da escala (em dias), com o intervalo inteiro na largura. */
export const timelineX = (value: number, range: TimelineSpan, width: number) =>
  range.to > range.from ? ((value - range.from) / (range.to - range.from)) * width : 0;
/** O inverso: o valor da escala (em dias, com fração) no pixel `x`. */
export const timelineValueAt = (x: number, range: TimelineSpan, width: number) =>
  range.from + (width > 0 ? (x / width) * (range.to - range.from) : 0);

// ————— Barras em linhas e marcos —————

export interface TimelineEntry extends TimelineSpan {
  item: TimelineItem;
  kind: 'bar' | 'milestone';
  /** Linha da barra, a partir de 0 no topo; -1 no marco, que fica na borda de baixo. */
  lane: number;
}
/** Distribui as barras em linhas como o Project: em ordem de início (empate pela ordem da tabela),
 * cada barra vai para a primeira linha em que não se sobrepõe a nenhuma outra. Barras que só se
 * encostam (uma termina no fim da sexta, a outra começa no começo da segunda) dividem a linha. Os
 * marcos não ocupam linha. A lista volta em ordem cronológica — é a ordem do Tab e das setas —, sem
 * tarefas repetidas e sem as que não têm data válida. */
export function layoutTimeline(items: readonly TimelineItem[]): { entries: TimelineEntry[]; laneCount: number } {
  const seen = new Set<string>();
  const candidates: { item: TimelineItem; index: number; span: TimelineSpan }[] = [];
  items.forEach((item, index) => {
    if (seen.has(item.id)) return;
    const span = itemSpan(item);
    if (!span) return;
    seen.add(item.id);
    candidates.push({ item, index, span });
  });
  candidates.sort((a, b) => a.span.from - b.span.from || a.index - b.index);
  const laneEnds: number[] = [];
  const entries = candidates.map(({ item, span }): TimelineEntry => {
    if (item.milestone) return { item, kind: 'milestone', lane: -1, ...span };
    let lane = laneEnds.findIndex(end => end <= span.from);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = span.to;
    return { item, kind: 'bar', lane, ...span };
  });
  return { entries, laneCount: laneEnds.length };
}

// ————— Marcas da escala —————

export type TimelineUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';
const UNITS: TimelineUnit[] = ['day', 'week', 'month', 'quarter', 'year'];
const UNIT_DAYS: Record<TimelineUnit, number> = { day: 1, week: 7, month: 30.44, quarter: 91.31, year: 365.25 };

/** A menor unidade cujas marcas ficam a pelo menos `minSpacing` pixels umas das outras: com a faixa
 * inteira na largura, um mês vira marcas por dia ou por semana e um ano, por mês ou trimestre. */
export function tickUnit(range: TimelineSpan, width: number, minSpacing = 64): TimelineUnit {
  const days = range.to - range.from;
  if (width <= 0 || days <= 0) return 'week';
  const perDay = width / days;
  return UNITS.find(unit => UNIT_DAYS[unit] * perDay >= minSpacing) ?? 'year';
}

/** Rótulo da marca: "Seg 14/09" (dia), "13/Set/26" (semana, como o Project), "Set/26" (mês),
 * "3º tri/26" (trimestre), "2026" (ano). */
export function tickLabel(date: string, unit: TimelineUnit): string {
  const month = Number(date.slice(5, 7));
  switch (unit) {
    case 'day':
      return `${WEEKDAYS[weekdayOfDay(dayNumber(date))]} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
    case 'week':
      return `${date.slice(8, 10)}/${MONTHS[month - 1]}/${date.slice(2, 4)}`;
    case 'month':
      return `${MONTHS[month - 1]}/${date.slice(2, 4)}`;
    case 'quarter':
      return `${Math.ceil(month / 3)}º tri/${date.slice(2, 4)}`;
    case 'year':
      return date.slice(0, 4);
  }
}
/** Texto completo da marca, para a dica. */
export function tickTitle(date: string, unit: TimelineUnit): string {
  const month = Number(date.slice(5, 7));
  switch (unit) {
    case 'day':
      return formatTimelineDate(date);
    case 'week':
      return `Semana de ${formatTimelineDate(date)}`;
    case 'month':
      return `${MONTH_NAMES[month - 1].replace(/^./, c => c.toUpperCase())} de ${date.slice(0, 4)}`;
    case 'quarter':
      return `${Math.ceil(month / 3)}º trimestre de ${date.slice(0, 4)}`;
    case 'year':
      return date.slice(0, 4);
  }
}
const startsUnit = (date: string, day: number, unit: TimelineUnit, weekStartsOn: number) => {
  switch (unit) {
    case 'day':
      return true;
    case 'week':
      return weekdayOfDay(day) === weekStartsOn;
    case 'month':
      return date.endsWith('-01');
    case 'quarter':
      return date.endsWith('-01') && (Number(date.slice(5, 7)) - 1) % 3 === 0;
    case 'year':
      return date.endsWith('-01-01');
  }
};

export interface TimelineTick {
  date: string;
  /** Borda esquerda do dia da marca, em pixels. */
  x: number;
  label: string;
  title: string;
  /** Espaço para o rótulo, à direita da marca, até a próxima (ou até o fim da faixa). */
  room: number;
  /** O rótulo cabe inteiro no espaço; senão fica só o traço ("28/Se" cortado não ajuda ninguém). */
  fits: boolean;
}
/** Largura média de um caractere do rótulo da escala (11 px, algarismos tabulares). */
const TICK_CHAR_PX = 6.2;
/** Marcas da escala no topo da faixa, só as de dentro (a borda já tem "Início" e "Término"). A
 * semana começa na segunda, como no Gantt do Obra 360; `weekStartsOn: 0` dá o domingo do Project. */
export function timelineTicks(
  range: TimelineSpan,
  width: number,
  { minSpacing = 64, weekStartsOn = 1 }: { minSpacing?: number; weekStartsOn?: number } = {},
): { unit: TimelineUnit; ticks: TimelineTick[] } {
  const unit = tickUnit(range, width, minSpacing);
  const ticks: TimelineTick[] = [];
  if (width <= 0) return { unit, ticks };
  for (let day = Math.floor(range.from) + 1; day < range.to; day++) {
    const date = fromDayNumber(day);
    if (!startsUnit(date, day, unit, weekStartsOn)) continue;
    ticks.push({ date, x: timelineX(day, range, width), label: tickLabel(date, unit), title: tickTitle(date, unit), room: 0, fits: false });
  }
  ticks.forEach((tick, index) => {
    tick.room = Math.max(0, (ticks[index + 1]?.x ?? width) - tick.x - 6);
    tick.fits = tick.room >= tick.label.length * TICK_CHAR_PX;
  });
  return { unit, ticks };
}

// ————— Legendas dos marcos —————

const CALLOUT_MIN = 48;
const CALLOUT_MAX = 180;
/** Largura estimada da legenda (nome em cima, data embaixo), entre 48 e 180 px: o nome longo é
 * cortado com reticências e aparece inteiro na dica. */
export const estimateCalloutWidth = (name: string, date: string) =>
  Math.round(Math.min(CALLOUT_MAX, Math.max(CALLOUT_MIN, Math.max(name.trim().length * 6.6, date.length * 6.2) + 8)));

export interface CalloutInput {
  id: string;
  /** Posição do losango. */
  x: number;
  width: number;
}
export interface CalloutPlacement extends CalloutInput {
  left: number;
  /** 0 logo abaixo da faixa; cada nível desce uma legenda. */
  level: number;
}
/** Legendas dos marcos: centradas sob o losango, presas entre `minX` e `maxX` (podem avançar sob
 * "Início" e "Término", como no Project), e em níveis para não se encostarem — cada legenda vai
 * para o primeiro nível em que cabe com `gap` de folga. Passados `maxLevels`, volta ao nível que
 * acaba mais cedo, para a faixa não crescer sem fim. */
export function placeCallouts(
  inputs: readonly CalloutInput[],
  { minX = -Infinity, maxX = Infinity, gap = 8, maxLevels = 3 }: { minX?: number; maxX?: number; gap?: number; maxLevels?: number } = {},
): CalloutPlacement[] {
  const rights: number[] = [];
  return [...inputs]
    .sort((a, b) => a.x - b.x)
    .map(input => {
      const width = Math.min(input.width, maxX - minX);
      const left = Math.max(minX, Math.min(input.x - width / 2, maxX - width));
      let level = rights.findIndex(right => right + gap <= left);
      if (level < 0) level = rights.length < Math.max(1, maxLevels) ? rights.length : rights.indexOf(Math.min(...rights));
      rights[level] = left + width;
      return { ...input, width, left, level };
    });
}

// ————— Moldura da janela do Gantt —————

/** Largura mínima da moldura: a janela inteira fora da faixa vira um traço na borda. */
const FRAME_MIN_PX = 4;
export interface TimelineFrame extends TimelineSpan {
  /** Dias visíveis no Gantt. */
  days: number;
  left: number;
  right: number;
  /** A janela passa da borda esquerda ou direita da faixa: esse lado da moldura fica tracejado. */
  clippedLeft: boolean;
  clippedRight: boolean;
  /** A janela mostra a faixa inteira: não há o que rolar, e a moldura não aparece. */
  covers: boolean;
}
/** Moldura da janela visível do Gantt, recortada nas bordas da faixa. */
export function timelineFrame(
  visible: { start: string; end: string } | undefined,
  range: TimelineSpan,
  width: number,
): TimelineFrame | undefined {
  if (!visible || !isIsoDate(visible.start) || !isIsoDate(visible.end)) return undefined;
  const from = dayNumber(visible.start);
  const to = Math.max(from + 1, dayNumber(visible.end) + 1);
  const clamp = (value: number) => Math.max(range.from, Math.min(range.to, value));
  let left = timelineX(clamp(from), range, width),
    right = timelineX(clamp(to), range, width);
  if (right - left < FRAME_MIN_PX) {
    if (left >= width - FRAME_MIN_PX) left = Math.max(0, width - FRAME_MIN_PX);
    right = Math.min(width, left + FRAME_MIN_PX);
  }
  return {
    from,
    to,
    days: to - from,
    left,
    right,
    clippedLeft: from < range.from,
    clippedRight: to > range.to,
    covers: from <= range.from && to >= range.to,
  };
}
/** Primeiro dia visível pedido ao Gantt, em dias, com a janela inteira dentro da faixa sempre que
 * ela cabe; maior que a faixa, fica no início dela. */
export function clampPanStart(start: number, days: number, range: TimelineSpan): number {
  const lastStart = range.to - days;
  if (lastStart <= range.from) return range.from;
  return Math.max(range.from, Math.min(lastStart, Math.round(start)));
}
/** Clique num ponto da faixa: a janela do Gantt centraliza nele. */
export const panStartAt = (center: number, days: number, range: TimelineSpan) => clampPanStart(center - days / 2, days, range);
/** "Rolar até a Tarefa": o Gantt começa um dia antes do início da tarefa, para a barra não colar na borda. */
export const scrollTarget = (item: Pick<TimelineItem, 'start'>) => addDays(item.start, -1);

// ————— Dias não úteis —————

/** Sequências de dias não úteis (fins de semana do calendário e feriados) dentro da faixa, em dias
 * da escala. Só aparecem com o dia largo (`OFF_DAY_MIN_PX`): mais estreitos, viram listras que
 * só atrapalham a leitura das barras — o Project nem os mostra na Linha do Tempo. */
export function offDayRuns(range: TimelineSpan, calendar: WorkCalendar): TimelineSpan[] {
  const weekdays = new Set(calendar.weekdays),
    holidays = new Set(calendar.holidays);
  const runs: TimelineSpan[] = [];
  for (let day = Math.floor(range.from); day < range.to; day++) {
    if (weekdays.has(weekdayOfDay(day)) && !holidays.has(fromDayNumber(day))) continue;
    const last = runs.at(-1);
    if (last && last.to === day) last.to++;
    else runs.push({ from: day, to: day + 1 });
  }
  return runs;
}

// ————— Cores e textos —————

/* As cores vêm da paleta única (`CHART`): a barra é o azul de "planejado" misturado com branco e a
 * parte concluída um tom mais cheio do mesmo azul — mais claro que o avanço do Gantt, porque aqui o
 * texto passa por cima dela (nome em slate-900 e período em slate-800 ficam acima de 4,5:1 em todos
 * os tons, inclusive no avanço da crítica). A tarefa crítica, quando a tela pede, usa o vermelho de
 * "atrasado", como no Gantt; o marco é o losango escuro do Project, no petróleo dos textos; hoje é
 * o âmbar de todos os gráficos. */
const mixWhite = (color: string, share: number) => `color-mix(in srgb, ${color} ${share}%, white)`;
export interface TimelineTone {
  fill: string;
  progress: string;
  border: string;
}
export function timelineBarTone(item: Pick<TimelineItem, 'critical'>): TimelineTone {
  const base = item.critical ? CHART.late : CHART.planned;
  return { fill: mixWhite(base, 16), progress: mixWhite(base, 42), border: mixWhite(base, 62) };
}
export const milestoneFill = (item: Pick<TimelineItem, 'critical'>) => (item.critical ? CHART.late : CHART.ink);
export const clampProgress = (value: number) => Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));

/** Rótulo acessível e dica: "Tarefa: Alvenaria · Seg 07/09/26 - Sex 11/09/26 · 40% concluída ·
 * Crítica", "Resumo: Torre A · …" ou "Marco: Vistoria · Ter 29/09/26". */
export function timelineItemLabel(item: TimelineItem): string {
  const name = item.name.trim() || 'Sem nome';
  if (item.milestone) return [`Marco: ${name}`, formatTimelineDate(item.start), ...(item.critical ? ['Crítico'] : [])].join(' · ');
  const end = isIsoDate(item.end) && item.end >= item.start ? item.end : item.start;
  return [
    `${item.summary ? 'Resumo' : 'Tarefa'}: ${name}`,
    formatTimelinePeriod(item.start, end),
    `${clampProgress(item.progress)}% concluída`,
    ...(item.critical ? ['Crítica'] : []),
  ].join(' · ');
}

// ————— Componente —————

/** Faixa da escala no topo. */
const SCALE_H = 20;
/** Cada linha de barras: duas linhas de texto (nome e período). */
const LANE_H = 32;
const BAR_GAP = 2;
const PAD_TOP = 4;
/** Folga embaixo para o losango, que fica na borda, não encostar na última barra. */
const PAD_BOTTOM = 8;
/** Miolo da faixa vazia (o aviso do Project) e da faixa só com marcos. */
const EMPTY_H = 44;
const MILESTONES_ONLY_H = 20;
const DIAMOND = 10;
/** Comprimento da linha do losango até a legenda, no primeiro nível. */
const STEM = 16;
const LEVEL_H = 30;
const LABEL_H = 28;
/** Colunas de "Início" e "Término". */
const EDGE_W = 92;
const SIDE_W = 22;
/** Abaixo disso a barra não comporta o botão de remover por dentro: ele vai para fora, à direita. */
const REMOVE_INSIDE_MIN = 56;
const REMOVE_SIZE = 24;
/** Largura mínima do dia, em pixels, para sombrear fins de semana e feriados na faixa. */
const OFF_DAY_MIN_PX = 14;
const MENU_W = 248;

interface DragState {
  pointerId: number;
  originX: number;
  originStart: number;
  last: number;
  perDay: number;
  days: number;
}
interface MenuState {
  id: string;
  x: number;
  y: number;
}

export function TimelineBand({
  items,
  projectStart,
  projectFinish,
  visible,
  today,
  calendar,
  selectedId,
  onSelect,
  onPan,
  canEdit = false,
  onRemove,
  showSideLabel = true,
  className = '',
}: TimelineBandProps): JSX.Element {
  const rootRef = useRef<HTMLElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  // Largura da área das barras. Zero no servidor e antes da primeira medida: aí só a moldura da
  // faixa aparece (as alturas não dependem da largura, então nada pula quando a medida chega).
  const [width, setWidth] = useState(0);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  useLayoutEffect(() => {
    const node = areaRef.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A janela entra pelas datas, não pelo objeto: um `{ start, end }` novo a cada render não pode
  // refazer a escala.
  const visibleStart = visible?.start,
    visibleEnd = visible?.end;
  const layout = useMemo(() => layoutTimeline(items), [items]);
  const range = useMemo(
    () =>
      timelineRange(items, {
        projectStart,
        projectFinish,
        visible: visibleStart && visibleEnd ? { start: visibleStart, end: visibleEnd } : undefined,
        today,
      }),
    [items, projectStart, projectFinish, visibleStart, visibleEnd, today],
  );
  const scale = useMemo(() => timelineTicks(range, width), [range, width]);
  const perDay = width > 0 ? width / (range.to - range.from) : 0;
  const wideDays = perDay >= OFF_DAY_MIN_PX;
  const offDays = useMemo(() => (wideDays ? offDayRuns(range, calendar) : []), [range, calendar, wideDays]);
  const frame = useMemo(() => {
    if (!visibleStart || !visibleEnd || width <= 0) return undefined;
    const base = timelineFrame({ start: visibleStart, end: visibleEnd }, range, width);
    if (!base || dragStart === null) return base;
    // Durante o arraste a moldura segue o ponteiro, sem esperar o Gantt devolver a janela nova.
    return timelineFrame({ start: fromDayNumber(dragStart), end: fromDayNumber(dragStart + base.days - 1) }, range, width);
  }, [visibleStart, visibleEnd, range, width, dragStart]);
  const canPan = !!onPan && !!frame && !frame.covers;

  const milestones = useMemo(() => layout.entries.filter(entry => entry.kind === 'milestone'), [layout]);
  const callouts = useMemo(() => {
    if (width <= 0) return new Map<string, CalloutPlacement>();
    const inputs = milestones.map(entry => ({
      id: entry.item.id,
      x: timelineX(entry.from, range, width),
      width: estimateCalloutWidth(entry.item.name.trim() || 'Sem nome', formatTimelineDate(entry.item.start)),
    }));
    return new Map(placeCallouts(inputs, { minX: -(EDGE_W - 6), maxX: width + EDGE_W - 6 }).map(p => [p.id, p]));
  }, [milestones, range, width]);

  // Alturas: escala, faixa (linhas de barras) e, com marcos, os níveis de legenda embaixo.
  const levels = Math.max(1, ...[...callouts.values()].map(p => p.level + 1));
  const inner = layout.laneCount ? layout.laneCount * LANE_H : layout.entries.length ? MILESTONES_ONLY_H : EMPTY_H;
  const bandH = PAD_TOP + inner + PAD_BOTTOM;
  const bandBottom = SCALE_H + bandH;
  const totalH = bandBottom + (milestones.length ? STEM + (levels - 1) * LEVEL_H + LABEL_H + 6 : 8);
  const x = (value: number) => timelineX(value, range, width);
  const todayValue = isIsoDate(today) ? dayNumber(today) : NaN;
  const todayX = width > 0 && todayValue >= range.from && todayValue < range.to ? x(todayValue + 0.5) : undefined;

  const order = layout.entries;
  // Só uma barra entra na ordem do Tab (a selecionada, ou a primeira); as setas andam entre elas.
  const focusable = order.some(entry => entry.item.id === selectedId) ? selectedId : order[0]?.item.id;
  const removable = canEdit && !!onRemove;
  const hasMenu = removable || !!onPan;
  const itemNode = (id: string) => rootRef.current?.querySelector<HTMLElement>(`[data-timeline-item="${CSS.escape(id)}"]`);
  const focusEntry = (index: number) => {
    const entry = order[Math.max(0, Math.min(order.length - 1, index))];
    if (entry) itemNode(entry.item.id)?.focus();
  };
  const remove = (id: string) => {
    if (!removable) return;
    const index = order.findIndex(entry => entry.item.id === id);
    const neighbor = order[index + 1]?.item.id ?? order[index - 1]?.item.id;
    setMenu(null);
    onRemove!(id);
    if (neighbor) requestAnimationFrame(() => itemNode(neighbor)?.focus());
  };
  const scrollTo = (item: TimelineItem) => {
    setMenu(null);
    onPan?.(scrollTarget(item));
  };

  // ——— Menu de contexto ("Rolar até a Tarefa", "Remover da Linha do Tempo") ———
  /** Abre o menu no ponto do clique ou, sem ponto (teclado), logo abaixo da barra ou do marco. */
  const openMenuAt = (element: HTMLElement, id: string, point?: { x: number; y: number }) => {
    const root = rootRef.current;
    if (!hasMenu || !root) return false;
    onSelect?.(id);
    const box = root.getBoundingClientRect(),
      target = element.getBoundingClientRect();
    // A tecla de menu às vezes chega como `contextmenu` sem a posição do ponteiro (ou com uma de
    // fora da barra): aí também vale a posição de teclado.
    const inside = point && point.x >= target.left && point.x <= target.right && point.y >= target.top && point.y <= target.bottom;
    const left = (inside ? point.x : target.left) - box.left,
      top = (inside ? point.y : target.bottom) - box.top;
    setMenu({ id, x: Math.max(0, Math.min(left, box.width - MENU_W)), y: top });
    return true;
  };
  const openMenu = (event: MouseEvent<HTMLElement>, id: string) => {
    if (openMenuAt(event.currentTarget, id, { x: event.clientX, y: event.clientY })) event.preventDefault();
  };
  const closeMenu = (refocus: boolean) => {
    const id = menu?.id;
    setMenu(null);
    if (refocus && id) requestAnimationFrame(() => itemNode(id)?.focus());
  };
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (event: Event) => {
      if (event.type === 'pointerdown' && menuRef.current?.contains(event.target as Node)) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [menu]);
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const options = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape' || event.key === 'Tab') closeMenu(true);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      options[(at + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
    else if (event.key === 'Home') options[0]?.focus();
    else if (event.key === 'End') options.at(-1)?.focus();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  // ——— Teclado nas barras e nos marcos ———
  const onItemKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const entry = order[index];
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        focusEntry(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        focusEntry(index - 1);
        break;
      case 'Home':
        focusEntry(0);
        break;
      case 'End':
        focusEntry(order.length - 1);
        break;
      case 'Delete':
      case 'Backspace':
        // Engolida mesmo sem permissão: o Delete da tabela ao lado apaga a tarefa, não pode vazar daqui.
        if (entry) remove(entry.item.id);
        break;
      case 'ContextMenu':
      case 'F10':
        // A tecla de menu e o Shift+F10 nem sempre geram `contextmenu` (no Mac, nunca): abre daqui.
        if (event.key === 'F10' && !event.shiftKey) return;
        if (!entry || !openMenuAt(event.currentTarget, entry.item.id)) return;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  // ——— Moldura: arrastar, clicar num ponto vazio da faixa e teclado ———
  const emitPan = (start: number) => onPan?.(fromDayNumber(start));
  const onSurfaceDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canPan || !frame || event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const value = timelineValueAt(event.clientX - box.left, range, box.width);
    let origin = frame.from;
    // Fora da moldura, o clique centraliza a janela ali; daí em diante o arraste continua dela.
    if (value < frame.from || value >= frame.to) {
      origin = panStartAt(value, frame.days, range);
      emitPan(origin);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originStart: origin,
      last: origin,
      perDay: box.width / (range.to - range.from),
      days: frame.days,
    };
    setDragStart(origin);
  };
  const onSurfaceMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.perDay <= 0) return;
    const next = clampPanStart(drag.originStart + (event.clientX - drag.originX) / drag.perDay, drag.days, range);
    if (next === drag.last) return;
    drag.last = next;
    setDragStart(next);
    emitPan(next);
  };
  const onSurfaceUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragStart(null);
  };
  const onFrameKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!frame || !onPan) return;
    const step = event.shiftKey ? 7 : 1;
    const next =
      event.key === 'ArrowLeft'
        ? frame.from - step
        : event.key === 'ArrowRight'
          ? frame.from + step
          : event.key === 'PageUp'
            ? frame.from - frame.days
            : event.key === 'PageDown'
              ? frame.from + frame.days
              : event.key === 'Home'
                ? range.from
                : event.key === 'End'
                  ? range.to - frame.days
                  : undefined;
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    emitPan(clampPanStart(next, frame.days, range));
  };
  const frameMax = Math.max(0, range.to - range.from - (frame?.days ?? 0));
  const frameNow = frame ? Math.max(0, Math.min(frameMax, frame.from - range.from)) : 0;

  const menuEntry = menu ? order.find(entry => entry.item.id === menu.id) : undefined;
  const selectedEntry = order.find(entry => entry.item.id === selectedId);
  const barTop = (lane: number) => SCALE_H + PAD_TOP + lane * LANE_H;

  // Botão de remover da barra (ou do marco) selecionada.
  let removeButton: { left: number; top: number; entry: TimelineEntry } | undefined;
  if (removable && selectedEntry && width > 0) {
    if (selectedEntry.kind === 'bar') {
      const left = x(selectedEntry.from),
        right = Math.max(x(selectedEntry.to), left + 2);
      const inside = right - left >= REMOVE_INSIDE_MIN;
      removeButton = {
        entry: selectedEntry,
        left: inside ? right - REMOVE_SIZE - 3 : right + 3,
        top: barTop(selectedEntry.lane) + (LANE_H - BAR_GAP - REMOVE_SIZE) / 2,
      };
    } else {
      const callout = callouts.get(selectedEntry.item.id);
      if (callout)
        removeButton = {
          entry: selectedEntry,
          left: callout.left + callout.width + 2,
          top: bandBottom + STEM + callout.level * LEVEL_H + (LABEL_H - REMOVE_SIZE) / 2,
        };
    }
  }

  return (
    <section
      ref={rootRef}
      aria-label="Linha do Tempo"
      data-tour="medio-linha-do-tempo"
      className={`relative flex select-none border-b border-slate-200 bg-white ${className}`}
      style={{ height: totalH }}
    >
      {showSideLabel && (
        <div
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center border-r border-slate-200 bg-slate-100"
          style={{ width: SIDE_W }}
        >
          <span className="rotate-180 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600 [writing-mode:vertical-rl]">
            Linha do tempo
          </span>
        </div>
      )}

      {/* "Início" e "Término" ficam fora da área das barras, na altura da escala, como no Project. */}
      <div className="shrink-0 pr-2 text-right" style={{ width: EDGE_W, paddingTop: SCALE_H - 14 }}>
        <div className="text-[11px] leading-[14px] text-slate-500">Início</div>
        <div className="text-xs font-medium leading-4 tabular-nums text-slate-700">{formatTimelineDate(range.start)}</div>
      </div>

      <div ref={areaRef} className="relative min-w-0 flex-1">
        {/* Superfície da escala e da faixa: clicar num ponto vazio centraliza o Gantt ali e arrastar
         * dentro da moldura rola o Gantt. As barras ficam fora dela, por cima. */}
        <div
          className={`absolute inset-x-0 top-0 touch-pan-y ${canPan ? 'cursor-pointer' : ''}`}
          style={{ height: bandBottom }}
          onPointerDown={onSurfaceDown}
          onPointerMove={onSurfaceMove}
          onPointerUp={onSurfaceUp}
          onPointerCancel={onSurfaceUp}
          onLostPointerCapture={onSurfaceUp}
        >
          {scale.ticks.map(tick => (
            <div key={tick.date} title={tick.title} className="absolute top-0" style={{ left: tick.x, height: SCALE_H }}>
              <span aria-hidden="true" className="absolute left-0 top-1 border-l border-slate-400" style={{ height: SCALE_H - 4 }} />
              {tick.fits && (
                <span
                  className="absolute left-1 top-0.5 overflow-hidden whitespace-nowrap text-[11px] leading-[14px] tabular-nums text-slate-600"
                  style={{ maxWidth: tick.room }}
                >
                  {tick.label}
                </span>
              )}
            </div>
          ))}
          <div
            className="absolute inset-x-0 overflow-hidden rounded-[3px] border border-slate-300 bg-slate-50"
            style={{ top: SCALE_H, height: bandH }}
          >
            {width > 0 &&
              offDays.map(run => (
                <div
                  key={run.from}
                  aria-hidden="true"
                  className="absolute inset-y-0 bg-slate-200/45"
                  style={{ left: x(run.from), width: x(run.to) - x(run.from) }}
                />
              ))}
            {scale.ticks.map(tick => (
              <div
                key={tick.date}
                aria-hidden="true"
                className="absolute inset-y-0 border-l border-slate-200/80"
                style={{ left: tick.x }}
              />
            ))}
            {!order.length && (
              <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-sm text-slate-600">
                Adicione tarefas com datas à linha do tempo
              </p>
            )}
          </div>
          {canPan && frame && (
            <>
              <div
                aria-hidden="true"
                className={`absolute top-0 bg-primary/[0.07] ${dragStart !== null ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{ left: frame.left, width: frame.right - frame.left, height: bandBottom }}
              />
              {/* Alça da moldura na escala: foco pelo Tab e setas para rolar o Gantt pelo teclado. */}
              <div
                role="slider"
                tabIndex={0}
                aria-label="Janela visível do Gantt"
                aria-orientation="horizontal"
                aria-valuemin={0}
                aria-valuemax={frameMax}
                aria-valuenow={frameNow}
                aria-valuetext={`${formatTimelineDate(fromDayNumber(frame.from))} a ${formatTimelineDate(fromDayNumber(frame.to - 1))}`}
                title="Arraste para rolar o Gantt (setas: um dia; Shift: uma semana; Page Up/Down: uma janela)"
                onKeyDown={onFrameKey}
                className={`absolute top-0 rounded-t-[3px] bg-primary/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${dragStart !== null ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{ left: frame.left, width: frame.right - frame.left, height: SCALE_H }}
              />
            </>
          )}
        </div>

        {width > 0 &&
          order.map((entry, index) => {
            const { item } = entry;
            const selected = item.id === selectedId;
            const label = timelineItemLabel(item);
            const hint = [label, onPan ? 'Clique duplo: rolar até a tarefa' : '', removable ? 'Delete: remover da Linha do Tempo' : '']
              .filter(Boolean)
              .join('\n');
            const common = {
              type: 'button' as const,
              'data-timeline-item': item.id,
              'aria-label': label,
              'aria-pressed': selected,
              'aria-keyshortcuts': removable ? 'Delete' : undefined,
              title: hint,
              tabIndex: item.id === focusable ? 0 : -1,
              onClick: () => onSelect?.(item.id),
              onDoubleClick: () => scrollTo(item),
              onContextMenu: (event: MouseEvent<HTMLButtonElement>) => openMenu(event, item.id),
              onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => onItemKey(event, index),
            };
            if (entry.kind === 'bar') {
              const left = x(entry.from),
                barWidth = Math.max(x(entry.to) - left, 2);
              const tone = timelineBarTone(item);
              const end = isIsoDate(item.end) && item.end >= item.start ? item.end : item.start;
              return (
                <button
                  key={item.id}
                  {...common}
                  className={`absolute cursor-pointer overflow-hidden rounded-[3px] border text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? 'z-[15] ring-2 ring-primary' : 'z-10'}`}
                  style={{
                    left,
                    width: barWidth,
                    top: barTop(entry.lane),
                    height: LANE_H - BAR_GAP,
                    background: tone.fill,
                    borderColor: tone.border,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0"
                    style={{ width: `${clampProgress(item.progress)}%`, background: tone.progress }}
                  />
                  <span
                    className={`relative block truncate px-1.5 pt-0.5 text-[11px] leading-[14px] text-slate-900 ${item.summary ? 'font-bold' : 'font-semibold'}`}
                  >
                    {item.name.trim() || 'Sem nome'}
                  </span>
                  <span className="relative block truncate px-1.5 text-[11px] leading-[13px] tabular-nums text-slate-800">
                    {formatTimelinePeriod(item.start, end)}
                  </span>
                </button>
              );
            }
            // Marco: losango na borda de baixo da faixa e linha fina até a legenda (nome e data).
            const callout = callouts.get(item.id);
            if (!callout) return null;
            const cx = x(entry.from);
            const stem = STEM + callout.level * LEVEL_H;
            const boxLeft = Math.min(callout.left, cx - DIAMOND / 2),
              boxRight = Math.max(callout.left + callout.width, cx + DIAMOND / 2);
            return (
              <button
                key={item.id}
                {...common}
                className="group absolute z-10 cursor-pointer rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                style={{ left: boxLeft, top: bandBottom - DIAMOND / 2, width: boxRight - boxLeft, height: DIAMOND / 2 + stem + LABEL_H }}
              >
                <span
                  aria-hidden="true"
                  className={`absolute rotate-45 rounded-[1px] border border-white ${selected ? 'ring-2 ring-primary' : ''}`}
                  style={{ left: cx - boxLeft - DIAMOND / 2, top: 0, width: DIAMOND, height: DIAMOND, background: milestoneFill(item) }}
                />
                <span
                  aria-hidden="true"
                  className="absolute w-px bg-slate-400"
                  style={{ left: cx - boxLeft, top: DIAMOND * 1.2, height: Math.max(2, DIAMOND / 2 + stem - DIAMOND * 1.2) }}
                />
                <span
                  className={`absolute rounded-[3px] px-1 text-center ${selected ? 'bg-primary/10 ring-1 ring-primary' : 'group-hover:bg-slate-100'}`}
                  style={{ left: callout.left - boxLeft, top: DIAMOND / 2 + stem, width: callout.width, height: LABEL_H }}
                >
                  <span className="block truncate text-xs leading-[14px] text-slate-700">{item.name.trim() || 'Sem nome'}</span>
                  <span className="block truncate text-[11px] leading-[13px] tabular-nums text-slate-500">
                    {formatTimelineDate(item.start)}
                  </span>
                </span>
              </button>
            );
          })}

        {/* Hoje: âmbar, da escala ao fundo da faixa, por cima das barras. */}
        {todayX !== undefined && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-20 w-0.5"
            style={{ left: todayX - 1, top: SCALE_H - 6, height: bandH + 6, background: CHART.today }}
          />
        )}

        {/* Contorno da moldura por cima das barras; o lado em que a janela passa da faixa fica tracejado. */}
        {canPan && frame && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 z-30 rounded-[3px] border-2 border-primary"
            style={{
              left: frame.left,
              width: frame.right - frame.left,
              height: bandBottom,
              borderLeftStyle: frame.clippedLeft ? 'dashed' : 'solid',
              borderRightStyle: frame.clippedRight ? 'dashed' : 'solid',
            }}
          />
        )}

        {removeButton && (
          <button
            type="button"
            aria-label={`Remover ${removeButton.entry.item.name.trim() || 'tarefa sem nome'} da Linha do Tempo`}
            title="Remover da Linha do Tempo"
            onClick={() => remove(removeButton.entry.item.id)}
            className="absolute z-40 grid cursor-pointer place-items-center rounded-full border border-slate-300 bg-white text-slate-600 shadow-sm hover:border-danger hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
            style={{ left: removeButton.left, top: removeButton.top, width: REMOVE_SIZE, height: REMOVE_SIZE }}
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>

      <div className="shrink-0 pl-2" style={{ width: EDGE_W, paddingTop: SCALE_H - 14 }}>
        <div className="text-[11px] leading-[14px] text-slate-500">Término</div>
        <div className="text-xs font-medium leading-4 tabular-nums text-slate-700">{formatTimelineDate(range.finish)}</div>
      </div>

      {menu && menuEntry && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Ações de ${menuEntry.item.name.trim() || 'tarefa sem nome'}`}
          onKeyDown={onMenuKey}
          onContextMenu={event => event.preventDefault()}
          className="absolute z-50 rounded-md border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-lg"
          style={{ left: menu.x, top: menu.y, width: MENU_W }}
        >
          {onPan && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => scrollTo(menuEntry.item)}
              className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
            >
              <ArrowRightToLine aria-hidden="true" className="size-4 text-slate-500" />
              Rolar até a tarefa
            </button>
          )}
          {removable && (
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => remove(menuEntry.item.id)}
              className="flex w-full cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
            >
              <X aria-hidden="true" className="size-4 text-slate-500" />
              Remover da Linha do Tempo
            </button>
          )}
        </div>
      )}
    </section>
  );
}

'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  type UIEvent,
} from 'react';
import type { LinkType } from '@/domain/entities';
import type { DayEdge, WorkCalendar } from '@/domain/plan-schedule';
import { CHART, SERIES_COLORS, STATUS } from '@/shared/palette';

/* Gráfico de Gantt de acompanhamento, no molde do "Gantt de acompanhamento" do Project: barra
 * azul-clara com o avanço em azul-escuro (vermelha quando crítica), linha de base cinza logo
 * abaixo, resumo em colchete preto, marco em losango com a data ao lado, vínculos em cotovelo,
 * seta de prazo final, linha de folga, nome do recurso à direita da barra, tarefa dividida (trecho
 * feito e restante ligados por pontilhado) e o "Caminho da tarefa" do Project 2013 colorindo
 * predecessoras e sucessoras da linha selecionada. Cada barra começa e termina na borda do dia que
 * o motor indica: 08:00 é a borda esquerda do dia, 17:00 a direita.
 *
 * Não calcula datas: recebe as linhas já na ordem da tabela ao lado, com o caminho crítico, as
 * folgas e os papéis já calculados pelo motor, e desenha o que a tabela mostra. Com `canEdit`,
 * aceita o arrasto do Project — mover a barra, esticar a ponta direita, puxar o avanço, arrastar
 * até outra tarefa para vincular e clique duplo para as informações —, mas só propõe a data nova:
 * quem grava são os callbacks, e o motor recalcula. As contas de posição, de cor e de arrasto
 * ficam em funções puras exportadas, cobertas por tests/gantt-chart.test.ts. */

export type GanttZoom = 'dia' | 'semana' | 'mes';
/** Papel de uma linha no "Caminho da tarefa": a partir da selecionada, quem de fato fixa a data
 * dela (predecessora determinante), quem só a antecede, quem ela de fato fixa (sucessora
 * determinada) e quem só a segue. */
export type GanttPathRole = 'selected' | 'driving' | 'predecessor' | 'driven' | 'successor';
export interface GanttRow {
  id: string;
  name: string;
  summary: boolean;
  milestone: boolean;
  level: number;
  start: string;
  end: string;
  progress: number;
  actualStart?: string;
  actualEnd?: string;
  baseStart?: string;
  baseEnd?: string;
  outOfWindow?: boolean;
  /** Tarefa, marco ou resumo no caminho crítico. */
  critical?: boolean;
  /** "Prazo final" (AAAA-MM-DD): seta no topo da linha, vermelha quando perdido. */
  deadline?: string;
  deadlineMissed?: boolean;
  /** Término tardio (AAAA-MM-DD): a linha de folga vai do fim da barra até ele. */
  lateFinish?: string;
  /** Folgas em dias úteis; a total pode ser negativa. */
  totalSlack?: number;
  freeSlack?: number;
  /** Algum vínculo de entrada desrespeitado: restrição ou data real prendem a tarefa antes do permitido. */
  conflict?: boolean;
  pathRole?: GanttPathRole;
  /** Ponta do dia em que o início cai: começo (08:00, borda esquerda; padrão) ou fim (17:00, borda
   * direita). O marco empurrado por TI fica no fim do dia; o de data digitada, no começo. */
  startEdge?: DayEdge;
  /** Ponta do dia em que o término cai: fim (17:00, borda direita; padrão) ou começo (08:00, borda
   * esquerda) — o término puxado por IT sem defasagem e a duração em dias corridos. */
  endEdge?: DayEdge;
  /** Ponta do dia do término tardio, para a linha de folga acabar onde o motor diz (padrão: fim). */
  lateFinishEdge?: DayEdge;
  /** Tarefa dividida ("dividir tarefas em andamento" do Project): último dia trabalhado antes da
   * interrupção e dia em que o restante retoma. */
  stop?: string;
  resume?: string;
  /** "Nomes dos recursos", escritos à direita da barra como no Project. */
  resourceLabel?: string;
  /** Duração em dias corridos: o arrasto encaixa em qualquer dia, não só nos úteis. */
  elapsed?: boolean;
}
export interface GanttLink {
  id: string;
  from: string;
  to: string;
  type: LinkType;
  /** A predecessora de fato fixa a data da sucessora. */
  driving?: boolean;
}
export interface GanttChartProps {
  rows: GanttRow[];
  links: GanttLink[];
  window: { start: string; end: string };
  today: string;
  zoom: GanttZoom;
  rowHeight: number;
  headerHeight: number;
  calendar: WorkCalendar;
  showBaseline: boolean;
  /** "Tarefas críticas" do Gantt de acompanhamento: barras críticas em vermelho (padrão ligado). */
  showCritical?: boolean;
  /** "Folga": linha fina do fim da barra até o término tardio (padrão desligado). */
  showSlack?: boolean;
  /** "Caminho da tarefa": realça predecessoras e sucessoras da linha selecionada (padrão desligado). */
  showPath?: boolean;
  /** Nome do recurso à direita da barra (padrão ligado). */
  showResourceNames?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Liga o arrasto das barras. Sem ele, o gráfico só seleciona e abre as informações. */
  canEdit?: boolean;
  /** Barra arrastada na horizontal: novo início (AAAA-MM-DD). O Project grava "Não iniciar antes de". */
  onMoveTask?: (id: string, start: string) => void;
  /** Ponta direita esticada: novo término (AAAA-MM-DD), que muda a duração. */
  onResizeTask?: (id: string, end: string) => void;
  /** Alça do avanço puxada: novo % concluído, inteiro de 0 a 100. */
  onProgressTask?: (id: string, progress: number) => void;
  /** Barra arrastada até outra tarefa: vínculo término-a-início de `fromId` para `toId`. */
  onLinkTasks?: (fromId: string, toId: string) => void;
  /** Clique duplo (ou Shift+F2 na barra em foco, o atalho do Project): "Informações da tarefa". */
  onOpenTask?: (id: string) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  className?: string;
}

// ————— Datas (UTC puro: as datas do plano são dias, sem fuso) —————

const DAY_MS = 86_400_000;
/** Pixels por dia em cada escala: na semanal, uma semana dá 42 px. */
export const GANTT_DAY_PX: Record<GanttZoom, number> = { dia: 28, semana: 6, mes: 1.6 };
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Dias desde 1970-01-01 em UTC. */
export const dayNumber = (date: string) => Math.round(Date.parse(date + 'T00:00:00Z') / DAY_MS);
const fromDayNumber = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
export const addUtcDays = (date: string, days: number) => fromDayNumber(dayNumber(date) + days);
/** 0 = domingo … 6 = sábado. */
export const weekdayOf = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();
/** "Set/26": mês abreviado com inicial maiúscula e ano com dois dígitos. */
export const monthLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]}/${date.slice(2, 4)}`;
/** "Seg 24/08/26". */
export const shortDate = (date: string) => `${WEEKDAYS[weekdayOf(date)]} ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}`;

// ————— Escala horizontal —————

export interface GanttRange {
  start: string;
  end: string;
  days: number;
}

/** Período desenhado: a janela do plano mais tudo o que as linhas mostram (atual, base, real e
 * prazo final), com uma semana de folga de cada lado. O término tardio só entra com a linha de
 * folga à mostra (`showSlack`): sem ela nada o desenha, e o gráfico não precisa alargar por ele.
 * Na escala semanal começa numa segunda e termina num domingo; na mensal, no primeiro e no último
 * dia do mês. */
export function ganttRange(
  rows: readonly GanttRow[],
  window: { start: string; end: string },
  zoom: GanttZoom,
  options: { showSlack?: boolean } = {},
): GanttRange {
  let min = window.start,
    max = window.end;
  if (max < min) [min, max] = [max, min];
  for (const row of rows) {
    const dates = [row.start, row.end, row.baseStart, row.baseEnd, row.actualStart, row.actualEnd, row.deadline];
    if (options.showSlack) dates.push(row.lateFinish);
    for (const date of dates) {
      if (!date || !ISO.test(date)) continue;
      if (date < min) min = date;
      if (date > max) max = date;
    }
  }
  let start = addUtcDays(min, -7),
    end = addUtcDays(max, 7);
  if (zoom === 'semana') {
    start = addUtcDays(start, -((weekdayOf(start) + 6) % 7));
    end = addUtcDays(end, (7 - weekdayOf(end)) % 7);
  } else if (zoom === 'mes') {
    start = start.slice(0, 8) + '01';
    const [y, m] = end.split('-').map(Number);
    end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
  return { start, end, days: dayNumber(end) - dayNumber(start) + 1 };
}

/** Borda esquerda do dia `date`. */
export const dateX = (date: string, rangeStart: string, zoom: GanttZoom) => (dayNumber(date) - dayNumber(rangeStart)) * GANTT_DAY_PX[zoom];

/** Barra de `start` até o fim do dia `end` (término inclusivo). Datas invertidas por dado antigo
 * viram uma barra de um dia, e nenhuma barra fica mais fina que 2 px. Não conhece as bordas do
 * dia: o Gantt usa `barSpanEdges`; esta continua para quem desenha dias inteiros. */
export function barSpan(start: string, end: string, rangeStart: string, zoom: GanttZoom) {
  const left = dateX(start, rangeStart, zoom);
  const right = Math.max(dateX(end < start ? start : end, rangeStart, zoom) + GANTT_DAY_PX[zoom], left + 2);
  return { left, right, width: right - left };
}

/** O marco no meio do dia da data dele. O Gantt põe o marco na borda do dia (`dayEdgeX`); esta
 * posição continua para a seta do prazo final e para quem não conhece a borda. */
export const milestoneX = (date: string, rangeStart: string, zoom: GanttZoom) => dateX(date, rangeStart, zoom) + GANTT_DAY_PX[zoom] / 2;

/** A seta do prazo final fica no meio do dia dele. */
export const deadlineX = (date: string, rangeStart: string, zoom: GanttZoom) => milestoneX(date, rangeStart, zoom);

/** Borda do dia `date`: a esquerda no começo do dia (08:00), a direita no fim (17:00). 08:00 de
 * segunda e 17:00 da sexta anterior são o mesmo instante de trabalho, mas caem em bordas
 * diferentes — e a tabela mostra datas diferentes. */
export const dayEdgeX = (date: string, edge: DayEdge, rangeStart: string, zoom: GanttZoom) =>
  dateX(date, rangeStart, zoom) + (edge === 'end' ? GANTT_DAY_PX[zoom] : 0);

export interface Span {
  left: number;
  right: number;
  width: number;
}

/** Barra presa às bordas do dia que o motor indica. Com as bordas padrão (começa às 08:00, acaba
 * às 17:00) é a `barSpan`. A tarefa ligada por IT sem defasagem termina às 08:00 da segunda: a
 * tabela mostra a segunda, mas a barra acaba na borda esquerda dela, sem cobrir o dia. Datas
 * invertidas viram um dia e nenhuma barra fica mais fina que 2 px. */
export function barSpanEdges(
  start: string,
  end: string,
  rangeStart: string,
  zoom: GanttZoom,
  startEdge: DayEdge = 'start',
  endEdge: DayEdge = 'end',
): Span {
  const left = dayEdgeX(start, startEdge, rangeStart, zoom);
  const right = Math.max(end < start ? left + GANTT_DAY_PX[zoom] : dayEdgeX(end, endEdge, rangeStart, zoom), left + 2);
  return { left, right, width: right - left };
}

/** Interrupção válida de uma tarefa dividida: parou em `stop` e retoma depois, em `resume`, ambos
 * dentro do período da barra. Qualquer outra combinação desenha a barra inteira. */
function splitOf(row: Pick<GanttRow, 'start' | 'end' | 'stop' | 'resume'>) {
  const { stop, resume } = row;
  if (!stop || !resume || !ISO.test(stop) || !ISO.test(resume)) return undefined;
  return stop >= row.start && resume > stop && resume <= row.end ? { stop, resume } : undefined;
}

export interface BarSegments {
  /** Um trecho, ou dois na tarefa dividida, da esquerda para a direita. */
  segments: Span[];
  /** Interrupções entre trechos, desenhadas em pontilhado. */
  gaps: { left: number; right: number }[];
}

/** Trechos da barra. A tarefa dividida tem o trecho feito, do início até o fim do dia `stop`, e o
 * restante, do começo do dia `resume` até o término, ligados pela linha pontilhada com que o
 * Project desenha a interrupção. Sem divisão (ou com `resume` colado em `stop`), um trecho só. */
export function barSegments(
  row: Pick<GanttRow, 'start' | 'end' | 'startEdge' | 'endEdge' | 'stop' | 'resume'>,
  rangeStart: string,
  zoom: GanttZoom,
): BarSegments {
  const whole = barSpanEdges(row.start, row.end, rangeStart, zoom, row.startEdge, row.endEdge);
  const split = splitOf(row);
  if (!split) return { segments: [whole], gaps: [] };
  const done = barSpanEdges(row.start, split.stop, rangeStart, zoom, row.startEdge, 'end');
  const rest = barSpanEdges(split.resume, row.end, rangeStart, zoom, 'start', row.endEdge);
  if (rest.left <= done.right) return { segments: [whole], gaps: [] };
  return { segments: [done, rest], gaps: [{ left: done.right, right: rest.left }] };
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

/** Calendário da barra para o avanço: o % concluído conta dias de trabalho — úteis, ou corridos
 * com `elapsed` —, não comprimento. */
export interface WorkScale {
  rangeStart: string;
  zoom: GanttZoom;
  calendar: Pick<WorkCalendar, 'weekdays' | 'holidays'>;
  elapsed?: boolean;
}
interface WorkPiece {
  left: number;
  right: number;
  /** Trabalho do pedaço, em dias (fração do dia coberta); zero no dia não útil. */
  work: number;
}

/** A barra cortada nas colunas de dia que os trechos cobrem, cada pedaço com o trabalho que vale.
 * A interrupção da dividida não é trecho e fica de fora. Sem escala, ou sem nenhum dia de
 * trabalho coberto, o trabalho é o próprio comprimento (proporcional, como antes). */
function workPieces(segments: readonly Span[], scale?: WorkScale): WorkPiece[] {
  const byLength = segments.map(segment => ({ left: segment.left, right: segment.right, work: segment.width }));
  if (!scale) return byLength;
  const px = GANTT_DAY_PX[scale.zoom],
    pieces: WorkPiece[] = [];
  let total = 0;
  for (const segment of segments)
    for (let column = Math.floor(segment.left / px); column * px < segment.right; column++) {
      const left = Math.max(segment.left, column * px),
        right = Math.min(segment.right, (column + 1) * px);
      if (right <= left) continue;
      const working = scale.elapsed || isWorkingDay(addUtcDays(scale.rangeStart, column), scale.calendar);
      const work = working ? (right - left) / px : 0;
      total += work;
      pieces.push({ left, right, work });
    }
  return total > 0 ? pieces : byLength;
}

/** Onde o avanço acaba (a alça do avanço). O % vale sobre os dias de trabalho dos trechos: 40% de
 * uma tarefa de cinco dias úteis que começa na sexta acaba no fim da segunda, cobrindo o fim de
 * semana do meio, como o Project; termina no fim do último dia feito, sem invadir o fim de semana
 * seguinte nem o trecho retomado da dividida. Sem avanço, no começo da barra; com 100%, no fim. */
export function progressX(segments: readonly Span[], progress: number, scale?: WorkScale): number {
  if (!segments.length) return 0;
  const percent = clampPercent(progress);
  if (percent >= 100) return segments[segments.length - 1].right;
  const pieces = workPieces(segments, scale);
  let left = (pieces.reduce((sum, piece) => sum + piece.work, 0) * percent) / 100,
    x = segments[0].left;
  for (const piece of pieces) {
    if (left <= 1e-9) break;
    if (piece.work <= 0) continue;
    if (left >= piece.work) {
      x = piece.right;
      left -= piece.work;
    } else {
      x = piece.left + (left / piece.work) * (piece.right - piece.left);
      left = 0;
    }
  }
  return x;
}

/** Largura do avanço em cada trecho, da esquerda até `progressX`. */
export function progressFill(segments: readonly Span[], progress: number, scale?: WorkScale): number[] {
  const x = progressX(segments, progress, scale);
  return segments.map(segment => Math.min(segment.width, Math.max(0, x - segment.left)));
}

/** O inverso de `progressX`: o % concluído (inteiro) com a alça do avanço no ponto `x`, contando
 * os dias de trabalho à esquerda dele. Sobre o fim de semana ou a interrupção, vale o trabalho
 * feito até ali. */
export function progressAtX(x: number, segments: readonly Span[], scale?: WorkScale): number {
  const pieces = workPieces(segments, scale);
  const total = pieces.reduce((sum, piece) => sum + piece.work, 0);
  if (total <= 0) return 0;
  const done = pieces.reduce(
    (sum, piece) => sum + piece.work * Math.min(1, Math.max(0, (x - piece.left) / (piece.right - piece.left || 1))),
    0,
  );
  return Math.round((done / total) * 100);
}

/** Linha de folga: do fim da barra até o fim do dia `lateFinish`. Sem término tardio, ou com
 * ele no mesmo dia do término ou antes (folga zero ou negativa), não há linha a desenhar. */
export function slackSpan(
  end: string,
  lateFinish: string | undefined,
  rangeStart: string,
  zoom: GanttZoom,
): { left: number; width: number } | undefined {
  if (!lateFinish || !ISO.test(lateFinish) || !ISO.test(end) || lateFinish <= end) return undefined;
  const px = GANTT_DAY_PX[zoom];
  const left = dateX(end, rangeStart, zoom) + px;
  return { left, width: dateX(lateFinish, rangeStart, zoom) + px - left };
}

/** Linha de folga com bordas: de onde a barra (ou o losango) acaba até a borda do término tardio.
 * O término às 08:00 de segunda com término tardio às 08:00 de quarta tem dois dias de folga, não
 * três. Folga zero ou negativa não desenha nada. */
export function slackLine(
  barRight: number,
  lateFinish: string | undefined,
  rangeStart: string,
  zoom: GanttZoom,
  lateFinishEdge: DayEdge = 'end',
): { left: number; width: number } | undefined {
  if (!lateFinish || !ISO.test(lateFinish)) return undefined;
  const right = dayEdgeX(lateFinish, lateFinishEdge, rangeStart, zoom);
  return right - barRight >= 1 ? { left: barRight, width: right - barRight } : undefined;
}

export interface TimescaleCell {
  key: string;
  label: string;
  title: string;
  left: number;
  width: number;
}

/** Divide o período em faixas contíguas pela chave de cada dia. */
function segments(
  range: GanttRange,
  zoom: GanttZoom,
  keyOf: (date: string) => string,
  labelOf: (date: string) => string,
  titleOf: (date: string) => string,
): TimescaleCell[] {
  const px = GANTT_DAY_PX[zoom],
    first = dayNumber(range.start),
    cells: TimescaleCell[] = [];
  for (let i = 0; i < range.days; i++) {
    const date = fromDayNumber(first + i),
      key = keyOf(date),
      last = cells.at(-1);
    if (last?.key === key) last.width += px;
    else cells.push({ key, label: labelOf(date), title: titleOf(date), left: i * px, width: px });
  }
  return cells;
}
const mondayOf = (date: string) => addUtcDays(date, -((weekdayOf(date) + 6) % 7));

/** Os dois níveis da escala de tempo. Semana: meses em cima, dia da segunda-feira embaixo. Dia:
 * meses em cima, dia do mês embaixo. Mês: ano em cima, meses embaixo. */
export function timescaleTiers(range: GanttRange, zoom: GanttZoom): { top: TimescaleCell[]; bottom: TimescaleCell[] } {
  const month = (date: string) => date.slice(0, 7);
  const monthTitle = (date: string) => monthLabel(date);
  if (zoom === 'mes')
    return {
      top: segments(
        range,
        zoom,
        date => date.slice(0, 4),
        date => date.slice(0, 4),
        date => date.slice(0, 4),
      ),
      bottom: segments(range, zoom, month, date => MONTHS[Number(date.slice(5, 7)) - 1], monthTitle),
    };
  const top = segments(range, zoom, month, monthLabel, monthTitle);
  if (zoom === 'dia')
    return {
      top,
      bottom: segments(
        range,
        zoom,
        date => date,
        date => date.slice(8, 10),
        shortDate,
      ),
    };
  return {
    top,
    bottom: segments(
      range,
      zoom,
      mondayOf,
      date => mondayOf(date).slice(8, 10),
      date => `Semana de ${shortDate(mondayOf(date))}`,
    ),
  };
}

/** Sequências de dias não úteis (fins de semana do calendário e feriados), em dias a partir do
 * início do período. Dias seguidos viram um só bloco. */
export function nonWorkingRuns(range: GanttRange, calendar: WorkCalendar): { from: number; days: number }[] {
  const weekdays = new Set(calendar.weekdays),
    holidays = new Set(calendar.holidays),
    first = dayNumber(range.start);
  const runs: { from: number; days: number }[] = [];
  for (let i = 0; i < range.days; i++) {
    const date = fromDayNumber(first + i);
    const off = !weekdays.has(new Date((first + i) * DAY_MS).getUTCDay()) || holidays.has(date);
    if (!off) continue;
    const last = runs.at(-1);
    if (last && last.from + last.days === i) last.days++;
    else runs.push({ from: i, days: 1 });
  }
  return runs;
}

// ————— Geometria vertical —————

export interface GanttRowMetrics {
  barTop: number;
  barHeight: number;
  baseTop: number;
  baseHeight: number;
  mid: number;
}
/** Com a linha de base à mostra, a barra atual sobe para a metade de cima e a base vai logo abaixo,
 * como no Gantt de acompanhamento; sem ela, a barra fica centralizada. */
export function ganttRowMetrics(rowHeight: number, withBaseline: boolean): GanttRowMetrics {
  if (!withBaseline) {
    const barHeight = Math.max(8, Math.round(rowHeight * 0.46)),
      barTop = Math.round((rowHeight - barHeight) / 2);
    return { barTop, barHeight, baseTop: barTop + barHeight, baseHeight: 0, mid: barTop + barHeight / 2 };
  }
  const barTop = Math.round(rowHeight * 0.16),
    barHeight = Math.max(6, Math.round(rowHeight * 0.36));
  const baseTop = barTop + barHeight + 2,
    baseHeight = Math.max(3, Math.round(rowHeight * 0.2));
  return { barTop, barHeight, baseTop, baseHeight, mid: barTop + barHeight / 2 };
}

// ————— Vínculos —————

export type Point = [number, number];
/** Onde um vínculo pode prender numa linha: as pontas da barra, a altura dela e os limites da linha. */
export interface LinkAnchor {
  left: number;
  right: number;
  y: number;
  top: number;
  bottom: number;
}

/** Caminho ortogonal de um vínculo. Sai da ponta da predecessora na horizontal (para a direita no
 * término, para a esquerda no início), desce ou sobe até a linha da sucessora e entra na ponta
 * dela pela horizontal — pela esquerda no início, pela direita no término —, que é para onde a
 * seta aponta. Quando a entrada exigiria voltar por dentro da predecessora (TI com sucessora que
 * começa antes do fim da predecessora, por exemplo), o caminho contorna pela borda da linha da
 * predecessora, como o Project faz. */
export function linkPoints(type: LinkType, from: LinkAnchor, to: LinkAnchor, gap = 6): Point[] {
  const exit = type[0] === 'T' ? 1 : -1,
    entry = type[1] === 'I' ? 1 : -1;
  const x1 = exit > 0 ? from.right : from.left,
    x2 = entry > 0 ? to.left : to.right;
  const y1 = from.y,
    y2 = to.y;
  const xa = x1 + exit * gap,
    xb = x2 - entry * gap;
  if (exit !== entry) {
    // II e TT: um só trecho vertical, do lado de fora das duas pontas.
    const xv = exit < 0 ? Math.min(xa, xb) : Math.max(xa, xb);
    return [
      [x1, y1],
      [xv, y1],
      [xv, y2],
      [x2, y2],
    ];
  }
  if ((xb - xa) * exit >= 0)
    return [
      [x1, y1],
      [xa, y1],
      [xa, y2],
      [x2, y2],
    ];
  const turn = y2 > y1 ? from.bottom : y2 < y1 ? from.top : (y1 + y2) / 2;
  return [
    [x1, y1],
    [xa, y1],
    [xa, turn],
    [xb, turn],
    [xb, y2],
    [x2, y2],
  ];
}

/** Ponta de seta no último ponto do caminho, apontando no sentido do último trecho. */
export function arrowHead(points: readonly Point[], size = 4): Point[] {
  const [x2, y2] = points[points.length - 1],
    [x1, y1] = points[points.length - 2] ?? [x2 - 1, y2];
  if (x1 !== x2) {
    const dir = x2 > x1 ? 1 : -1;
    return [
      [x2, y2],
      [x2 - dir * size * 1.5, y2 - size],
      [x2 - dir * size * 1.5, y2 + size],
    ];
  }
  const dir = y2 > y1 ? 1 : -1;
  return [
    [x2, y2],
    [x2 - size, y2 - dir * size * 1.5],
    [x2 + size, y2 - dir * size * 1.5],
  ];
}

export interface LinkPath {
  id: string;
  type: LinkType;
  from: string;
  to: string;
  driving?: boolean;
  points: Point[];
}
/** Vínculos desenháveis. O que tem uma ponta fora das linhas exibidas (recolhida, filtrada ou de
 * outro plano) é ignorado em silêncio: continua valendo no cálculo, só não vira seta. */
export function layoutLinks(links: readonly GanttLink[], anchors: ReadonlyMap<string, LinkAnchor>, gap = 6): LinkPath[] {
  const paths: LinkPath[] = [];
  for (const link of links) {
    const from = anchors.get(link.from),
      to = anchors.get(link.to);
    if (!from || !to || link.from === link.to) continue;
    paths.push({
      id: link.id,
      type: link.type,
      from: link.from,
      to: link.to,
      driving: link.driving,
      points: linkPoints(link.type, from, to, gap),
    });
  }
  return paths;
}

// ————— Arrasto: mover, esticar, avanço e vínculo —————

/** O que o arrasto faz: mover a barra (o Project grava "Não iniciar antes de"), esticar a ponta
 * direita (término e, com ele, a duração), puxar a alça do avanço (% concluído) ou ligar a outra
 * tarefa (vínculo TI). */
export type GanttDragMode = 'move' | 'resize' | 'progress' | 'link';
/** Onde o arrasto começou: no corpo da barra, na ponta direita ou na alça do avanço. O vínculo
 * nasce do corpo da barra quando o ponteiro sai da linha na vertical, como no Project. */
export type GanttDragOrigin = Exclude<GanttDragMode, 'link'>;
/** Deslocamento mínimo, em px, para o clique virar arrasto. */
export const DRAG_THRESHOLD = 4;
/** Teto das contas de calendário, em dias: um calendário sem dia útil não trava o arrasto. */
const CALENDAR_GUARD = 3660;

export interface DragAbilities {
  move: boolean;
  resize: boolean;
  progress: boolean;
  link: boolean;
}
/** O que cada barra aceita. Resumo não se arrasta: as datas dele vêm dos filhos, e o motor não
 * vincula resumos. A tarefa iniciada não se move — o início real é o que já aconteceu, e o motor
 * não o reprograma —, mas ainda se estica, recebe avanço e se vincula. A concluída não se estica
 * pelo mesmo motivo. Marco não se estica nem tem avanço para puxar. Cada ação também exige o
 * callback dela. */
export function barDragAbilities(
  row: Pick<GanttRow, 'summary' | 'milestone' | 'actualStart' | 'actualEnd'>,
  handlers: { canEdit?: boolean; move?: boolean; resize?: boolean; progress?: boolean; link?: boolean },
): DragAbilities {
  const on = !!handlers.canEdit && !row.summary;
  return {
    move: on && !!handlers.move && !row.actualStart,
    resize: on && !!handlers.resize && !row.milestone && !row.actualEnd,
    progress: on && !!handlers.progress && !row.milestone,
    link: on && !!handlers.link,
  };
}

/** Dia útil no calendário do plano: dia da semana de trabalho e fora dos feriados. */
export const isWorkingDay = (date: string, calendar: Pick<WorkCalendar, 'weekdays' | 'holidays'>) =>
  calendar.weekdays.includes(weekdayOf(date)) && !calendar.holidays.includes(date);

/** O próprio dia quando é útil; senão o dia útil seguinte (`direction` 1) ou anterior (-1). */
export function snapToWorkingDay(date: string, calendar: Pick<WorkCalendar, 'weekdays' | 'holidays'>, direction: 1 | -1): string {
  let day = date;
  for (let i = 0; i < CALENDAR_GUARD; i++) {
    if (isWorkingDay(day, calendar)) return day;
    day = addUtcDays(day, direction);
  }
  return date;
}

/** Dias úteis de `from` (inclusive) até `to` (exclusive). */
export function workingDaysBetween(from: string, to: string, calendar: Pick<WorkCalendar, 'weekdays' | 'holidays'>): number {
  const first = dayNumber(from),
    last = Math.min(dayNumber(to), first + CALENDAR_GUARD * 10);
  let count = 0;
  for (let day = first; day < last; day++) if (isWorkingDay(fromDayNumber(day), calendar)) count++;
  return count;
}

/** Avança `days` dias úteis a partir de `date` (zero devolve o próprio dia). */
export function addWorkingDays(date: string, days: number, calendar: Pick<WorkCalendar, 'weekdays' | 'holidays'>): string {
  if (!calendar.weekdays.length) return addUtcDays(date, days);
  let day = dayNumber(date),
    left = days;
  for (let guard = 0; left > 0 && guard < CALENDAR_GUARD * 10; guard++) {
    day++;
    if (isWorkingDay(fromDayNumber(day), calendar)) left--;
  }
  return fromDayNumber(day);
}

/** Dias de trabalho de `start` a `end`, inclusive: úteis, ou corridos com `elapsed`. */
export function spanDays(start: string, end: string, calendar: Pick<WorkCalendar, 'weekdays' | 'holidays'>, elapsed = false): number {
  if (end < start) return 0;
  return elapsed ? dayNumber(end) - dayNumber(start) + 1 : workingDaysBetween(start, addUtcDays(end, 1), calendar);
}

/** O dia sob o ponteiro: o dia cuja coluna contém `x` (px a partir do início do período). */
export const dateAtX = (x: number, rangeStart: string, zoom: GanttZoom) => addUtcDays(rangeStart, Math.floor(x / GANTT_DAY_PX[zoom]));
/** Deslocamento horizontal em dias inteiros: o arrasto encaixa no dia mais próximo. */
export const dayDelta = (dx: number, zoom: GanttZoom) => Math.round(dx / GANTT_DAY_PX[zoom]) || 0;

export interface DragDates {
  start: string;
  end: string;
  startEdge: DayEdge;
  endEdge: DayEdge;
}

/** Datas da barra movida `deltaDays` dias. O início encaixa no dia útil seguinte quando cai fora
 * do calendário — soltar no sábado é começar segunda às 08:00, como o "Não iniciar antes de" do
 * Project agenda —, a não ser na duração em dias corridos, que aceita qualquer dia. O término
 * acompanha mantendo os dias úteis trabalhados (ou os corridos), e a ponta do dia dele não muda: a
 * tarefa que acabava às 08:00 continua acabando às 08:00. Sem deslocamento, nada muda. */
export function movedDates(
  row: Pick<GanttRow, 'start' | 'end' | 'milestone' | 'startEdge' | 'endEdge' | 'elapsed'>,
  deltaDays: number,
  calendar: Pick<WorkCalendar, 'weekdays' | 'holidays'>,
): DragDates {
  const endEdge = row.endEdge ?? 'end';
  if (!deltaDays) return { start: row.start, end: row.end, startEdge: row.startEdge ?? 'start', endEdge };
  let start = addUtcDays(row.start, deltaDays);
  if (!row.elapsed) start = snapToWorkingDay(start, calendar, 1);
  if (row.milestone) return { start, end: start, startEdge: 'start', endEdge: 'start' };
  const end = row.elapsed
    ? addUtcDays(row.end, dayNumber(start) - dayNumber(row.start))
    : addWorkingDays(start, workingDaysBetween(row.start, row.end, calendar), calendar);
  return { start, end, startEdge: 'start', endEdge };
}

/** Término com a ponta direita da barra em `rightX`: o último dia que a barra cobre, com a borda
 * no dia mais próximo. Fora do calendário, volta ao último dia útil — esticar até o sábado é
 * terminar sexta às 17:00, porque no sábado não há trabalho —, menos em dias corridos. Nunca
 * antes do início, nem antes da retomada na tarefa dividida. O término devolvido é sempre no fim
 * do dia: o que a tabela vai mostrar depois de soltar. */
export function resizedEnd(
  row: Pick<GanttRow, 'start' | 'end' | 'stop' | 'resume' | 'elapsed'>,
  rightX: number,
  rangeStart: string,
  zoom: GanttZoom,
  calendar: Pick<WorkCalendar, 'weekdays' | 'holidays'>,
): string {
  let end = dateAtX(rightX - GANTT_DAY_PX[zoom] / 2, rangeStart, zoom);
  if (!row.elapsed) end = snapToWorkingDay(end, calendar, -1);
  const floor = splitOf(row)?.resume ?? row.start;
  return end < floor ? floor : end;
}

/** Modo do arrasto com o ponteiro na altura `y` (px do corpo do gráfico). Quem começou no corpo
 * da barra move enquanto o ponteiro fica na linha dela; ao sair na vertical, passa a vincular,
 * como no Project, e volta a mover se o ponteiro voltar. Ponta direita e alça do avanço não
 * mudam de modo. */
export function dragModeAt(origin: GanttDragOrigin, y: number, rowIndex: number, rowHeight: number, canLink: boolean): GanttDragMode {
  if (origin !== 'move' || !canLink) return origin;
  const top = rowIndex * rowHeight;
  return y < top || y >= top + rowHeight ? 'link' : 'move';
}

/** Sucessora sob o ponteiro durante o vínculo: a linha na altura do ponteiro, com o ponteiro sobre
 * a barra dela (com `tolerance` px de cada lado, para barras curtas). Resumo e a própria tarefa
 * não servem. */
export function linkTargetAt(
  point: { x: number; y: number },
  rows: readonly Pick<GanttRow, 'id' | 'summary'>[],
  bars: readonly Pick<Span, 'left' | 'right'>[],
  rowHeight: number,
  sourceId: string,
  tolerance = 12,
): string | undefined {
  const index = Math.floor(point.y / rowHeight),
    row = rows[index],
    bar = bars[index];
  if (!row || !bar || row.summary || row.id === sourceId) return undefined;
  return point.x >= bar.left - tolerance && point.x <= bar.right + tolerance ? row.id : undefined;
}

/** Rolagem automática quando o ponteiro chega perto da borda da área visível durante o arrasto:
 * até `step` px por quadro, mais rápido quanto mais perto (ou além) da borda. */
export function edgeScrollDelta(
  pointer: { x: number; y: number },
  viewport: { left: number; top: number; right: number; bottom: number },
  { margin = 32, step = 16, vertical = true }: { margin?: number; step?: number; vertical?: boolean } = {},
): { dx: number; dy: number } {
  const push = (low: number, high: number, at: number) => {
    if (at < low + margin) return 0 - Math.round(step * Math.min(1, (low + margin - at) / margin));
    if (at > high - margin) return Math.round(step * Math.min(1, (at - (high - margin)) / margin));
    return 0;
  };
  return { dx: push(viewport.left, viewport.right, pointer.x), dy: vertical ? push(viewport.top, viewport.bottom, pointer.y) : 0 };
}

export interface DragTooltip {
  lines: [label: string, value: string][];
  note?: string;
}
/** A dica do Project durante o arrasto: "Início: Seg 14/09/26" e companhia, conforme o modo. */
export function dragTooltip(input: {
  mode: GanttDragMode;
  name: string;
  milestone?: boolean;
  start?: string;
  end?: string;
  /** Duração depois de esticar, em dias úteis (ou corridos com `elapsed`). */
  days?: number;
  elapsed?: boolean;
  progress?: number;
  /** Nome da sucessora sob o ponteiro, no vínculo. */
  target?: string;
  /** As duas tarefas já estão vinculadas nesse sentido. */
  linked?: boolean;
  /** Início real da tarefa iniciada, que não se move. */
  locked?: string;
}): DragTooltip {
  const name = input.name.trim() || 'Sem nome';
  switch (input.mode) {
    case 'link':
      return {
        lines: [
          ['Vínculo', 'Término-a-início (TI)'],
          ['De', name],
          ['Para', input.target?.trim() || '—'],
        ],
        note: input.linked ? 'As duas já estão vinculadas.' : input.target === undefined ? 'Solte sobre a barra da sucessora.' : undefined,
      };
    case 'progress':
      return {
        lines: [
          ['Tarefa', name],
          ['% concluído', percent(input.progress ?? 0)],
        ],
      };
    case 'resize': {
      const days = input.days ?? 0;
      const duration = input.elapsed ? `${days} ${days === 1 ? 'dia corrido' : 'dias corridos'}` : dayCount(days);
      return {
        lines: [
          ['Tarefa', name],
          ['Término', input.end ? shortDate(input.end) : '—'],
          ['Duração', duration],
        ],
      };
    }
    default:
      if (input.locked)
        return {
          lines: [
            ['Tarefa', name],
            ['Início real', shortDate(input.locked)],
          ],
          note: 'Tarefa iniciada: o início real não se arrasta.',
        };
      if (input.milestone)
        return {
          lines: [
            ['Marco', name],
            ['Data', input.start ? shortDate(input.start) : '—'],
          ],
        };
      return {
        lines: [
          ['Tarefa', name],
          ['Início', input.start ? shortDate(input.start) : '—'],
          ['Término', input.end ? shortDate(input.end) : '—'],
        ],
      };
  }
}

// ————— Textos —————

const percent = (value: number) => `${Math.round(clampPercent(value))}%`;
const DAY_NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
/** "1 dia", "3 dias", "0 dias", "-1 dia", "17,38 dias": folga fracionária com vírgula e até duas casas. */
const dayCount = (days: number) => {
  const value = Math.round(days * 100) / 100 || 0;
  return `${DAY_NUMBER.format(value)} ${Math.abs(value) === 1 ? 'dia' : 'dias'}`;
};
/** O que a dica e o rótulo acessível dizem de cada papel; a selecionada já tem `aria-pressed`. */
const PATH_ROLE_LABEL: Record<GanttPathRole, string | undefined> = {
  selected: undefined,
  driving: 'Predecessora determinante',
  predecessor: 'Predecessora',
  driven: 'Sucessora determinada',
  successor: 'Sucessora',
};
/** "Prazo final: Seg 24/08/26", ou "Prazo final perdido: …" quando o término passa dele. */
export const deadlineLabel = (row: Pick<GanttRow, 'deadline' | 'deadlineMissed'>) =>
  row.deadline && ISO.test(row.deadline)
    ? `${row.deadlineMissed ? 'Prazo final perdido' : 'Prazo final'}: ${shortDate(row.deadline)}`
    : undefined;

/** Texto da dica e do rótulo acessível: "Nome · Seg 24/08/26 a Sex 09/10/26 · 40% · Crítica ·
 * Base: … · Real: … · Interrompida: … · Recursos: … · Folga livre: 2 dias · Folga total: 2 dias ·
 * Prazo final: … · Vínculo desrespeitado · Predecessora determinante · Fora da janela do plano".
 * Tudo em texto: nenhuma dessas informações depende da cor da barra nem do desenho. */
export function ganttTooltip(row: GanttRow): string {
  const parts = [row.name.trim() || 'Sem nome'];
  parts.push(row.milestone ? `Marco em ${shortDate(row.start)}` : `${shortDate(row.start)} a ${shortDate(row.end)}`);
  parts.push(percent(row.progress));
  if (row.critical) parts.push('Crítica');
  if (row.baseStart && row.baseEnd)
    parts.push(row.milestone ? `Base: ${shortDate(row.baseStart)}` : `Base: ${shortDate(row.baseStart)} a ${shortDate(row.baseEnd)}`);
  if (row.actualStart)
    parts.push(
      row.actualEnd
        ? `Real: ${shortDate(row.actualStart)} a ${shortDate(row.actualEnd)}`
        : `Real: iniciada em ${shortDate(row.actualStart)}`,
    );
  const split = row.milestone || row.summary ? undefined : splitOf(row);
  if (split) parts.push(`Interrompida: trabalhou até ${shortDate(split.stop)} e retoma em ${shortDate(split.resume)}`);
  const resource = row.resourceLabel?.trim();
  if (resource) parts.push(`Recursos: ${resource}`);
  const { freeSlack, totalSlack } = row;
  if (typeof freeSlack === 'number' && Number.isFinite(freeSlack)) parts.push(`Folga livre: ${dayCount(freeSlack)}`);
  if (typeof totalSlack === 'number' && Number.isFinite(totalSlack)) parts.push(`Folga total: ${dayCount(totalSlack)}`);
  const deadline = deadlineLabel(row);
  if (deadline) parts.push(deadline);
  if (row.conflict) parts.push('Vínculo desrespeitado');
  const role = row.pathRole && PATH_ROLE_LABEL[row.pathRole];
  if (role) parts.push(role);
  if (row.outOfWindow) parts.push('Fora da janela do plano');
  return parts.join(' · ');
}

// ————— Cores —————

/* As cores vêm da paleta única dos gráficos (`CHART`): a barra é o azul de "planejado", a crítica
 * o vermelho de "atrasado" (o Gantt de acompanhamento do Project também pinta as críticas de
 * vermelho), a linha de base o cinza de "base", a linha de hoje o âmbar que marca hoje em todos os
 * gráficos do sistema e a linha de folga o tom apagado dos textos. A barra clara é o tom cheio
 * misturado com branco, para o avanço ser o tom cheio por cima. O caminho da tarefa usa o âmbar e
 * o roxo da série categórica, que não aparecem em mais nada neste gráfico. O arrasto usa o azul
 * da marca dos vínculos (`CHART.link`) no contorno da barra fantasma, da sucessora e da seta. */
const mixWhite = (color: string, share: number) => `color-mix(in srgb, ${color} ${share}%, white)`;
const mixBlack = (color: string, share: number) => `color-mix(in srgb, ${color} ${share}%, black)`;
const PLANNED_LIGHT = mixWhite(CHART.planned, 28);
const CRITICAL_LIGHT = mixWhite(CHART.late, 28);
const BASELINE_EDGE = mixBlack(CHART.baseline, 80);
/** O resumo é o colchete preto do Project, no preto petróleo da escala de neutros (`globals.css`). */
const SUMMARY_INK = 'var(--color-slate-900)';
const PATH_DRIVING = SERIES_COLORS[3];
const PATH_DRIVEN = SERIES_COLORS[6];
/** Com o caminho da tarefa ligado, o que está fora dele apaga para o caminho saltar. */
const DIM_BAR = 0.45;
const DIM_LINK = 0.35;

export interface BarTone {
  fill: string;
  border: string;
  progress: string;
  /** 1, ou 0,45 na linha fora do caminho da tarefa quando ele está ligado. */
  opacity: number;
}

/** Cor da barra de uma linha: `fill` no fundo, `border` no contorno e `progress` no avanço. O
 * marco usa `fill` no losango e `border` no contorno. O caminho da tarefa, quando ligado, vem por
 * cima da cor crítica, como no Project, que pinta o caminho por cima; o resumo é sempre preto,
 * crítico ou não. As cores "cheias" (determinante e determinada) escurecem o avanço e o contorno
 * para o avanço continuar visível sobre o fundo cheio. */
export function barTone(
  row: Pick<GanttRow, 'summary' | 'critical' | 'pathRole'>,
  { showCritical = true, showPath = false }: { showCritical?: boolean; showPath?: boolean } = {},
): BarTone {
  const role = showPath ? row.pathRole : undefined;
  const opacity = showPath && !role ? DIM_BAR : 1;
  if (row.summary) return { fill: SUMMARY_INK, border: SUMMARY_INK, progress: SUMMARY_INK, opacity };
  if (role === 'driving' || role === 'driven') {
    const color = role === 'driving' ? PATH_DRIVING : PATH_DRIVEN,
      dark = mixBlack(color, 70);
    return { fill: color, border: dark, progress: dark, opacity };
  }
  if (role === 'predecessor' || role === 'successor') {
    const color = role === 'predecessor' ? PATH_DRIVING : PATH_DRIVEN;
    return { fill: mixWhite(color, 40), border: color, progress: color, opacity };
  }
  if (showCritical && row.critical) return { fill: CRITICAL_LIGHT, border: CHART.late, progress: CHART.late, opacity };
  return { fill: PLANNED_LIGHT, border: CHART.planned, progress: CHART.planned, opacity };
}

export interface LinkTone {
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/** Cor de um vínculo. Sem o caminho da tarefa (`pathIds` ausente), todos iguais. Com ele, o vínculo
 * determinante entre duas linhas do caminho fica âmbar e mais grosso, os demais vínculos entre
 * linhas do caminho continuam normais e os de fora apagam. */
export function linkTone(link: Pick<GanttLink, 'from' | 'to' | 'driving'>, pathIds?: ReadonlySet<string>): LinkTone {
  if (!pathIds) return { stroke: CHART.link, strokeWidth: 1.25, opacity: 1 };
  if (!pathIds.has(link.from) || !pathIds.has(link.to)) return { stroke: CHART.link, strokeWidth: 1.25, opacity: DIM_LINK };
  return link.driving ? { stroke: PATH_DRIVING, strokeWidth: 2, opacity: 1 } : { stroke: CHART.link, strokeWidth: 1.25, opacity: 1 };
}

// ————— Componente —————

/** Desenho da barra de tarefa: um trecho, ou dois na tarefa dividida, com a interrupção em
 * pontilhado entre eles. As posições vêm em px do período; `origin` é a borda esquerda do
 * elemento que contém o desenho. */
function BarShape({
  shape,
  origin,
  tone,
  progress,
  borderStyle,
  borderWidth = 1,
  scale,
}: {
  shape: BarSegments;
  origin: number;
  tone: Pick<BarTone, 'fill' | 'border' | 'progress'>;
  progress: number;
  borderStyle: CSSProperties['borderStyle'];
  /** A barra fantasma do arrasto usa contorno mais grosso, para aparecer por cima da original. */
  borderWidth?: number;
  /** Calendário da linha: o avanço conta dias de trabalho. */
  scale?: WorkScale;
}) {
  const fills = progressFill(shape.segments, progress, scale);
  return (
    <>
      {shape.gaps.map(gap => (
        <span
          key={`g-${gap.left}`}
          className="absolute"
          style={{ left: gap.left - origin, width: gap.right - gap.left, top: 'calc(50% - 1px)', borderTop: `2px dotted ${tone.border}` }}
        />
      ))}
      {shape.segments.map((segment, index) => (
        <span
          key={`s-${segment.left}`}
          className="absolute inset-y-0 overflow-hidden rounded-[2px] border"
          style={{
            left: segment.left - origin,
            width: segment.width,
            background: tone.fill,
            borderColor: tone.border,
            borderStyle,
            borderWidth,
          }}
        >
          {fills[index] > 0 && (
            <span
              className="absolute inset-y-0 left-0"
              style={{ width: Math.max(0, fills[index] - borderWidth), background: tone.progress }}
            />
          )}
        </span>
      ))}
    </>
  );
}

/** Arrasto em andamento, guardado fora do estado: o ponteiro mexe nele a cada movimento. */
interface DragSession {
  id: string;
  origin: GanttDragOrigin;
  pointerId: number;
  /** Onde o ponteiro desceu, em px do corpo do gráfico. */
  start: { x: number; y: number };
  /** Última posição do ponteiro na tela: a rolagem automática refaz a conta sem movimento. */
  client: { x: number; y: number };
  /** Passou do limiar: deixou de ser clique. */
  active: boolean;
  mode?: GanttDragMode;
}
/** O que o arrasto mostra agora (barra fantasma, seta e dica) e o que gravaria ao soltar. */
interface DragView {
  id: string;
  mode: GanttDragMode;
  /** Soltar agora muda algo: só então o callback é chamado. */
  changed: boolean;
  dates?: DragDates;
  /** Duração depois de esticar, para a dica. */
  days?: number;
  progress?: number;
  target?: string;
  /** Onde o arrasto começou e onde o ponteiro está, em px do corpo do gráfico. */
  from: Point;
  pointer: Point;
  /** Área visível do corpo, em px do corpo, para a dica não sair da tela. */
  viewport: { left: number; top: number; width: number; height: number };
}
const DRAG_TOOLTIP_WIDTH = 248;

export function GanttChart({
  rows,
  links,
  window: planWindow,
  today,
  zoom,
  rowHeight,
  headerHeight,
  calendar,
  showBaseline,
  showCritical = true,
  showSlack = false,
  showPath = false,
  showResourceNames = true,
  selectedId,
  onSelect,
  canEdit = false,
  onMoveTask,
  onResizeTask,
  onProgressTask,
  onLinkTasks,
  onOpenTask,
  scrollRef,
  onScroll,
  className = '',
}: GanttChartProps): JSX.Element {
  const px = GANTT_DAY_PX[zoom];
  // A janela entra pelas datas, não pelo objeto: um `{ start, end }` novo a cada render não pode
  // refazer a escala inteira.
  const range = useMemo(
    () => ganttRange(rows, { start: planWindow.start, end: planWindow.end }, zoom, { showSlack }),
    [rows, planWindow.start, planWindow.end, zoom, showSlack],
  );
  // Linhas do caminho da tarefa, para os vínculos saberem se ligam duas delas.
  const pathIds = useMemo(() => (showPath ? new Set(rows.filter(row => row.pathRole).map(row => row.id)) : undefined), [rows, showPath]);
  const width = range.days * px;
  const tiers = useMemo(() => timescaleTiers(range, zoom), [range, zoom]);
  const offDays = useMemo(() => (zoom === 'mes' ? [] : nonWorkingRuns(range, calendar)), [range, zoom, calendar]);
  const metrics = useMemo(() => ganttRowMetrics(rowHeight, showBaseline), [rowHeight, showBaseline]);
  const x = useCallback((date: string) => dateX(date, range.start, zoom), [range.start, zoom]);
  const bodyHeight = rows.length * rowHeight;
  const topTier = Math.floor(headerHeight / 2),
    bottomTier = headerHeight - topTier;
  const diamond = Math.max(8, Math.min(12, metrics.barHeight + 2));
  const summaryThickness = Math.max(3, Math.round(metrics.barHeight * 0.4));

  // Uma passada pelas linhas: posição de cada barra (com os trechos da dividida) e ponto de
  // engate dos vínculos, indexados por id para os vínculos não precisarem procurar linha por linha.
  const geometry = useMemo(() => {
    const anchors = new Map<string, LinkAnchor>();
    const bars = rows.map((row, index) => {
      const top = index * rowHeight;
      if (row.milestone) {
        const center = dayEdgeX(row.start, row.startEdge ?? 'start', range.start, zoom);
        const left = center - diamond / 2,
          right = center + diamond / 2;
        anchors.set(row.id, { left, right, y: top + metrics.mid, top, bottom: top + rowHeight });
        return { left, right, width: diamond, center, shape: undefined as BarSegments | undefined };
      }
      const shape = barSegments(row, range.start, zoom);
      const left = shape.segments[0].left,
        right = shape.segments[shape.segments.length - 1].right;
      const y = top + (row.summary ? metrics.barTop + summaryThickness / 2 : metrics.mid);
      anchors.set(row.id, { left, right, y, top, bottom: top + rowHeight });
      return { left, right, width: right - left, center: (left + right) / 2, shape: shape as BarSegments | undefined };
    });
    return { anchors, bars };
  }, [rows, rowHeight, range.start, zoom, metrics, diamond, summaryThickness]);
  const paths = useMemo(() => layoutLinks(links, geometry.anchors), [links, geometry]);

  // A escala muda a largura inteira do gráfico: ao abrir e a cada troca de escala, a rolagem
  // horizontal volta para perto de hoje (ou do início da janela, quando hoje está fora).
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const anchor = today >= range.start && today <= range.end ? today : planWindow.start;
    node.scrollLeft = Math.max(0, dateX(anchor, range.start, zoom) - node.clientWidth / 4);
    // Só a escala reposiciona: editar uma linha não pode arrastar a vista de quem está lendo.
  }, [zoom]);

  const focusRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return;
      onSelect(row.id);
      requestAnimationFrame(() => {
        const node = scrollRef.current?.querySelector<HTMLElement>(`[data-gantt-bar="${CSS.escape(row.id)}"]`);
        node?.focus({ preventScroll: false });
      });
    },
    [rows, onSelect, scrollRef],
  );
  const onBarKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusRow(index + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'F2' && event.shiftKey && onOpenTask && rows[index]) {
        // Shift+F2 é o atalho do Project para "Informações da tarefa".
        event.preventDefault();
        onOpenTask(rows[index].id);
      }
    },
    [focusRow, onOpenTask, rows],
  );
  // Só uma barra entra na ordem do Tab (a selecionada, ou a primeira): com mil linhas, o Tab
  // passaria por mil botões. As setas para cima e para baixo andam entre elas.
  const focusable = rows.some(row => row.id === selectedId) ? selectedId : rows[0]?.id;

  // ——— Arrasto ———
  // O ponteiro desce numa barra (ou alça) e a sessão começa pendente: até passar do limiar é só
  // um clique, que seleciona e, em dobro, abre as informações. Passado o limiar, o corpo do
  // gráfico captura o ponteiro e passa a desenhar a barra fantasma e a dica; ao soltar, o callback
  // do modo recebe a data nova. Esc cancela. A captura só vem depois do limiar para o clique e o
  // clique duplo continuarem chegando à barra.
  const bodyRef = useRef<HTMLDivElement>(null);
  const session = useRef<DragSession | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<DragView | null>(null);
  const canMove = !!onMoveTask,
    canResize = !!onResizeTask,
    canProgress = !!onProgressTask,
    canLink = !!onLinkTasks;
  const abilityOptions = useMemo(
    () => ({ canEdit, move: canMove, resize: canResize, progress: canProgress, link: canLink }),
    [canEdit, canMove, canResize, canProgress, canLink],
  );

  const beginDrag = useCallback(
    (event: PointerEvent<HTMLElement>, id: string, origin: GanttDragOrigin) => {
      const body = bodyRef.current;
      if (!body || event.button !== 0 || !event.isPrimary) return;
      const rect = body.getBoundingClientRect();
      session.current = {
        id,
        origin,
        pointerId: event.pointerId,
        start: { x: event.clientX - rect.left, y: event.clientY - rect.top },
        client: { x: event.clientX, y: event.clientY },
        active: false,
      };
      // O Project seleciona a tarefa ao pegar a barra.
      onSelect(id);
    },
    [onSelect],
  );

  // A vista do arrasto a partir da posição do ponteiro na tela. Só roda em eventos: lê o DOM.
  const viewAt = (current: DragSession, clientX: number, clientY: number): DragView | null => {
    const body = bodyRef.current,
      node = scrollRef.current,
      index = rows.findIndex(row => row.id === current.id);
    if (!body || index < 0) return null;
    const rect = body.getBoundingClientRect();
    const pointerX = clientX - rect.left,
      pointerY = clientY - rect.top;
    const row = rows[index],
      bar = geometry.bars[index];
    const able = barDragAbilities(row, abilityOptions);
    const mode = dragModeAt(current.origin, pointerY, index, rowHeight, able.link);
    const dx = pointerX - current.start.x;
    const view: DragView = {
      id: row.id,
      mode,
      changed: false,
      from: [current.start.x, current.start.y],
      pointer: [Math.round(pointerX), Math.round(pointerY)],
      viewport: node
        ? { left: node.scrollLeft, top: node.scrollTop, width: node.clientWidth, height: node.clientHeight - headerHeight }
        : { left: 0, top: 0, width: rect.width, height: rect.height },
    };
    if (mode === 'move' && able.move) {
      view.dates = movedDates(row, dayDelta(dx, zoom), calendar);
      view.changed = view.dates.start !== row.start;
    } else if (mode === 'resize' && able.resize) {
      const initial = resizedEnd(row, bar.right, range.start, zoom, calendar);
      const end = resizedEnd(row, bar.right + dx, range.start, zoom, calendar);
      view.changed = end !== initial;
      view.dates = {
        start: row.start,
        end: view.changed ? end : row.end,
        startEdge: row.startEdge ?? 'start',
        endEdge: view.changed ? 'end' : (row.endEdge ?? 'end'),
      };
      const split = splitOf(row);
      view.days = split
        ? spanDays(row.start, split.stop, calendar, row.elapsed) + spanDays(split.resume, end, calendar, row.elapsed)
        : spanDays(row.start, end, calendar, row.elapsed);
    } else if (mode === 'progress' && able.progress && bar.shape) {
      view.progress = progressAtX(pointerX, bar.shape.segments, { rangeStart: range.start, zoom, calendar, elapsed: row.elapsed });
      view.changed = view.progress !== Math.round(clampPercent(row.progress));
    } else if (mode === 'link') {
      view.target = linkTargetAt({ x: pointerX, y: pointerY }, rows, geometry.bars, rowHeight, row.id);
      view.changed = !!view.target && !links.some(link => link.from === row.id && link.to === view.target);
    }
    current.mode = mode;
    return view;
  };
  const refresh = () => {
    const current = session.current;
    if (current?.active) setDrag(viewAt(current, current.client.x, current.client.y));
  };
  // A rolagem automática roda num quadro de animação, fora do render: ela chama a versão mais
  // recente de `refresh`, com as linhas e a escala atuais.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  const commitDrag = (view: DragView) => {
    if (!view.changed) return;
    if (view.mode === 'move' && view.dates) onMoveTask?.(view.id, view.dates.start);
    else if (view.mode === 'resize' && view.dates) onResizeTask?.(view.id, view.dates.end);
    else if (view.mode === 'progress' && view.progress !== undefined) onProgressTask?.(view.id, view.progress);
    else if (view.mode === 'link' && view.target) onLinkTasks?.(view.id, view.target);
  };
  const onBodyPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = session.current;
    if (!current || event.pointerId !== current.pointerId) return;
    // Botão solto fora do gráfico antes do limiar: a sessão pendente morre aqui.
    if (!current.active && event.pointerType === 'mouse' && event.buttons === 0) {
      session.current = null;
      return;
    }
    current.client = { x: event.clientX, y: event.clientY };
    if (!current.active) {
      const rect = event.currentTarget.getBoundingClientRect();
      const moved = Math.hypot(event.clientX - rect.left - current.start.x, event.clientY - rect.top - current.start.y);
      if (moved < DRAG_THRESHOLD) return;
      current.active = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Ponteiro já solto: o pointerup chega em seguida e encerra a sessão.
      }
    }
    refresh();
  };
  const onBodyPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = session.current;
    if (!current || event.pointerId !== current.pointerId) return;
    session.current = null;
    if (!current.active) return;
    // O clique que o navegador dispara depois de soltar não pode selecionar outra linha.
    suppressClick.current = true;
    const view = viewAt(current, event.clientX, event.clientY);
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (view) commitDrag(view);
  };
  const onBodyPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const current = session.current;
    if (!current || event.pointerId !== current.pointerId) return;
    session.current = null;
    if (current.active) {
      suppressClick.current = true;
      setDrag(null);
    }
  };

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      const current = session.current,
        body = bodyRef.current;
      session.current = null;
      if (current && body?.hasPointerCapture(current.pointerId)) body.releasePointerCapture(current.pointerId);
      suppressClick.current = true;
      setDrag(null);
    };
    let frame = 0;
    const tick = () => {
      const current = session.current,
        node = scrollRef.current;
      if (current?.active && node) {
        const rect = node.getBoundingClientRect();
        const { dx, dy } = edgeScrollDelta(
          current.client,
          { left: rect.left, top: rect.top + headerHeight, right: rect.right, bottom: rect.bottom },
          { vertical: current.mode === 'link' },
        );
        if (dx || dy) {
          node.scrollLeft += dx;
          node.scrollTop += dy;
          refreshRef.current();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener('keydown', cancel, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', cancel, true);
    };
  }, [dragging, scrollRef, headerHeight]);

  const windowLeft = x(planWindow.start),
    windowRight = x(planWindow.end) + px;
  const todayX = today >= range.start && today <= range.end ? x(today) + px / 2 : undefined;

  // As linhas não dependem do arrasto: memorizadas, o arrasto redesenha só a camada de cima.
  const rowNodes = useMemo(
    () =>
      rows.map((row, index) => {
        const bar = geometry.bars[index];
        const selected = row.id === selectedId;
        // O papel no caminho só entra no texto com o caminho à mostra: a grade pode calculá-lo sempre.
        const tooltip = ganttTooltip(showPath || !row.pathRole ? row : { ...row, pathRole: undefined });
        const kind = row.milestone ? 'Marco' : row.summary ? 'Resumo' : 'Tarefa';
        const progress = clampPercent(row.progress);
        const tone = barTone(row, { showCritical, showPath });
        const borderStyle = row.conflict ? 'dashed' : 'solid';
        const able = barDragAbilities(row, abilityOptions);
        const scale: WorkScale = { rangeStart: range.start, zoom, calendar, elapsed: row.elapsed };
        const startEdge = row.startEdge ?? 'start',
          endEdge = row.endEdge ?? 'end';
        // A base não guarda a hora: usa as bordas da linha atual, para base e barra iguais coincidirem.
        const hasBase = showBaseline && !!row.baseStart && !!row.baseEnd;
        const base = hasBase ? barSpanEdges(row.baseStart!, row.baseEnd!, range.start, zoom, startEdge, endEdge) : undefined;
        const baseDiamond = row.milestone && hasBase ? dayEdgeX(row.baseStart!, startEdge, range.start, zoom) : undefined;
        // A linha de folga começa onde a barra (ou o losango) acaba, e os textos ficam depois dela.
        const slack = showSlack && !row.summary ? slackLine(bar.right, row.lateFinish, range.start, zoom, row.lateFinishEdge) : undefined;
        const slackLineNode = slack && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{ left: slack.left, width: slack.width, top: metrics.mid - 1, height: 2, background: CHART.inkMuted }}
          />
        );
        const slackRight = slack ? slack.left + slack.width : 0;
        const textLeft = row.milestone
          ? Math.max(bar.right + 2, baseDiamond !== undefined ? baseDiamond + diamond * 0.35 : 0, slackRight) + 4
          : Math.max(bar.right, base?.right ?? 0, slackRight) + 4;
        const resource = showResourceNames && !row.summary ? row.resourceLabel?.trim() : undefined;
        const resourceNode = resource && <span className="ml-1.5 font-semibold text-slate-800">{resource}</span>;
        const deadline = row.deadline && ISO.test(row.deadline) ? deadlineX(row.deadline, range.start, zoom) : undefined;
        const dragBody = able.move || able.link;
        const dragStyle: CSSProperties = dragBody ? { touchAction: 'none', cursor: able.move ? 'move' : 'default' } : {};
        const barProps = {
          type: 'button' as const,
          title: tooltip,
          'aria-label': `${kind}: ${tooltip}`,
          'aria-pressed': selected,
          'data-gantt-bar': row.id,
          tabIndex: row.id === focusable ? 0 : -1,
          onClick: (event: MouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            onSelect(row.id);
          },
          onDoubleClick: onOpenTask
            ? (event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                onOpenTask(row.id);
              }
            : undefined,
          onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => onBarKey(event, index),
          onPointerDown: dragBody ? (event: PointerEvent<HTMLButtonElement>) => beginDrag(event, row.id, 'move') : undefined,
        };
        // Alças: a ponta direita estica e o triângulo sob a barra puxa o avanço. Aparecem ao passar
        // o ponteiro e na linha selecionada (no toque não há "passar"); a área de pegar vale sempre.
        const handleVisibility = selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100';
        const resizeHandle = able.resize && (
          <span
            aria-hidden="true"
            data-gantt-handle="resize"
            className="absolute cursor-ew-resize"
            style={{
              left: bar.right - Math.min(3, bar.width / 4),
              width: 8,
              top: metrics.barTop - 1,
              height: metrics.barHeight + 2,
              touchAction: 'none',
            }}
            onPointerDown={event => beginDrag(event, row.id, 'resize')}
          >
            <span
              className={`absolute inset-y-[3px] left-[2px] w-[2px] rounded-full transition-opacity ${handleVisibility}`}
              style={{ background: tone.border }}
            />
          </span>
        );
        const progressHandle = able.progress && bar.shape && (
          <span
            aria-hidden="true"
            data-gantt-handle="progress"
            className="absolute cursor-col-resize"
            style={{
              left: progressX(bar.shape.segments, progress, scale) - 5,
              width: 10,
              top: metrics.barTop + metrics.barHeight - 2,
              height: 8,
              touchAction: 'none',
            }}
            onPointerDown={event => beginDrag(event, row.id, 'progress')}
          >
            <span
              className={`absolute inset-x-px bottom-0 top-[2px] transition-opacity ${handleVisibility}`}
              style={{ background: tone.border, clipPath: 'polygon(50% 0, 100% 100%, 0 100%)' }}
            />
          </span>
        );
        return (
          <div
            key={row.id}
            onClick={() => onSelect(row.id)}
            style={{ height: rowHeight }}
            className={`group relative border-b border-slate-100 ${selected ? 'bg-primary/10' : row.outOfWindow ? 'bg-warning/10' : ''}`}
          >
            {/* Tudo da linha apaga junto quando ela está fora do caminho da tarefa; a seta do
             * prazo final fica fora desse invólucro, porque um prazo perdido não pode apagar. */}
            <div className="absolute inset-0" style={{ opacity: tone.opacity }}>
              {row.milestone ? (
                <>
                  {baseDiamond !== undefined && (
                    <div
                      aria-hidden="true"
                      className="absolute rotate-45"
                      style={{
                        background: CHART.baseline,
                        left: baseDiamond - diamond * 0.35,
                        top: metrics.baseTop + (metrics.baseHeight - diamond * 0.7) / 2,
                        width: diamond * 0.7,
                        height: diamond * 0.7,
                      }}
                    />
                  )}
                  {slackLineNode}
                  {/* Marco: losango na borda do dia, na cor da linha; em conflito, o contorno fica tracejado. */}
                  <button
                    {...barProps}
                    className="absolute rotate-45 rounded-[1px] border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    style={{
                      left: bar.center - diamond / 2,
                      top: metrics.mid - diamond / 2,
                      width: diamond,
                      height: diamond,
                      background: tone.fill,
                      borderColor: tone.border,
                      borderStyle,
                      ...dragStyle,
                    }}
                  />
                  {/* A data ao lado do losango, como o "29/09" do Project. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute whitespace-nowrap text-xs leading-none tabular-nums text-slate-800"
                    style={{ left: textLeft, top: metrics.mid - 6 }}
                  >
                    <span className="font-semibold">
                      {row.start.slice(8, 10)}/{row.start.slice(5, 7)}
                    </span>
                    {resourceNode}
                  </span>
                </>
              ) : row.summary ? (
                <>
                  {base && (
                    <div
                      aria-hidden="true"
                      className="absolute"
                      style={{
                        background: CHART.baseline,
                        left: base.left,
                        width: base.width,
                        top: metrics.baseTop,
                        height: Math.max(2, Math.round(metrics.baseHeight * 0.6)),
                      }}
                    />
                  )}
                  {/* Resumo: colchete preto com as pontas voltadas para baixo, como no Project. Não se arrasta. */}
                  <button
                    {...barProps}
                    className="absolute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    style={{ left: bar.left, width: bar.width, top: metrics.barTop, height: summaryThickness + 5 }}
                  >
                    <span className="absolute inset-x-0 top-0" style={{ height: summaryThickness, background: tone.fill }} />
                    <span
                      className="absolute left-0 w-[5px]"
                      style={{ top: summaryThickness, height: 5, clipPath: 'polygon(0 0, 100% 0, 0 100%)', background: tone.fill }}
                    />
                    <span
                      className="absolute right-0 w-[5px]"
                      style={{ top: summaryThickness, height: 5, clipPath: 'polygon(0 0, 100% 0, 100% 100%)', background: tone.fill }}
                    />
                  </button>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute whitespace-nowrap text-xs font-semibold tabular-nums leading-none text-slate-800"
                    style={{ left: textLeft, top: metrics.barTop }}
                  >
                    {percent(progress)}
                  </span>
                </>
              ) : (
                <>
                  {base && (
                    <div
                      aria-hidden="true"
                      className="absolute rounded-[1px] border"
                      style={{
                        background: CHART.baseline,
                        borderColor: BASELINE_EDGE,
                        left: base.left,
                        width: base.width,
                        top: metrics.baseTop,
                        height: metrics.baseHeight,
                      }}
                    />
                  )}
                  {slackLineNode}
                  {/* Tarefa: barra clara com o avanço no tom cheio, em um trecho ou, dividida, em dois
                   * ligados por pontilhado; em conflito, a borda fica tracejada. */}
                  <button
                    {...barProps}
                    className="absolute rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    style={{ left: bar.left, width: bar.width, top: metrics.barTop, height: metrics.barHeight, ...dragStyle }}
                  >
                    {bar.shape && (
                      <BarShape
                        shape={bar.shape}
                        origin={bar.left}
                        tone={tone}
                        progress={progress}
                        borderStyle={borderStyle}
                        scale={scale}
                      />
                    )}
                  </button>
                  {resizeHandle}
                  {progressHandle}
                  {row.actualStart && ISO.test(row.actualStart) && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute w-px bg-slate-800/70"
                      style={{ left: x(row.actualStart), top: metrics.barTop - 2, height: metrics.barHeight + 4 }}
                    />
                  )}
                  {/* À direita da barra: o avanço e o nome do recurso, como no Project. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute whitespace-nowrap text-xs tabular-nums leading-none text-slate-600"
                    style={{ left: textLeft, top: metrics.barTop + (metrics.barHeight - 12) / 2 }}
                  >
                    {percent(progress)}
                    {resourceNode}
                  </span>
                </>
              )}
            </div>
            {/* Prazo final: seta para baixo no meio do dia, no topo da linha, verde; vermelha
             * quando perdido. Aparece com qualquer combinação de opções, inclusive sem as críticas. */}
            {deadline !== undefined && (
              <span
                aria-hidden="true"
                title={deadlineLabel(row)}
                className="absolute z-10"
                style={{
                  left: deadline - 5,
                  top: 1,
                  width: 10,
                  height: 7,
                  clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                  background: row.deadlineMissed ? STATUS.danger : STATUS.good,
                }}
              />
            )}
          </div>
        );
      }),
    [
      rows,
      geometry,
      selectedId,
      showPath,
      showCritical,
      showBaseline,
      showSlack,
      showResourceNames,
      abilityOptions,
      range.start,
      zoom,
      calendar,
      metrics,
      diamond,
      summaryThickness,
      rowHeight,
      focusable,
      onSelect,
      onOpenTask,
      onBarKey,
      beginDrag,
      x,
    ],
  );

  // ——— Camada do arrasto: barra fantasma, avanço novo, seta do vínculo e a dica ———
  let dragLayer: JSX.Element | null = null;
  let dragCursor: CSSProperties['cursor'];
  const dragIndex = drag ? rows.findIndex(row => row.id === drag.id) : -1;
  if (drag && dragIndex >= 0) {
    const row = rows[dragIndex],
      bar = geometry.bars[dragIndex],
      top = dragIndex * rowHeight;
    const tone = barTone(row, { showCritical, showPath });
    const targetIndex = drag.target ? rows.findIndex(item => item.id === drag.target) : -1;
    const locked = drag.mode === 'move' && !drag.dates && row.actualStart && ISO.test(row.actualStart) ? row.actualStart : undefined;
    const showTip = drag.mode !== 'move' || !!drag.dates || !!locked;
    const tip = dragTooltip({
      mode: drag.mode,
      name: row.name,
      milestone: row.milestone,
      start: drag.dates?.start,
      end: drag.dates?.end,
      days: drag.days,
      elapsed: row.elapsed,
      progress: drag.progress,
      target: targetIndex >= 0 ? rows[targetIndex].name : undefined,
      linked: drag.mode === 'link' && targetIndex >= 0 && !drag.changed,
      locked,
    });
    dragCursor =
      drag.mode === 'link'
        ? drag.changed
          ? 'alias'
          : 'no-drop'
        : drag.mode === 'move'
          ? drag.dates
            ? 'move'
            : 'not-allowed'
          : drag.mode === 'progress'
            ? 'col-resize'
            : 'ew-resize';
    const ghostTone = { fill: `color-mix(in srgb, ${tone.fill} 55%, transparent)`, border: CHART.link, progress: 'transparent' };
    let ghost: JSX.Element | null = null;
    if ((drag.mode === 'move' || drag.mode === 'resize') && drag.dates && drag.changed) {
      if (row.milestone) {
        const center = dayEdgeX(drag.dates.start, drag.dates.startEdge, range.start, zoom);
        ghost = (
          <div
            className="absolute rotate-45 rounded-[1px] border-2 border-dashed"
            style={{
              left: center - diamond / 2,
              top: top + metrics.mid - diamond / 2,
              width: diamond,
              height: diamond,
              borderColor: CHART.link,
            }}
          />
        );
      } else {
        // Ao mover, a tarefa (que não está iniciada) não tem divisão; ao esticar, a divisão fica.
        const shape = barSegments(
          drag.mode === 'move' ? { ...drag.dates } : { ...drag.dates, stop: row.stop, resume: row.resume },
          range.start,
          zoom,
        );
        const left = shape.segments[0].left,
          right = shape.segments[shape.segments.length - 1].right;
        ghost = (
          <div className="absolute" style={{ left, width: right - left, top: top + metrics.barTop, height: metrics.barHeight }}>
            <BarShape shape={shape} origin={left} tone={ghostTone} progress={0} borderStyle="dashed" borderWidth={1.5} />
          </div>
        );
      }
    } else if (drag.mode === 'progress' && drag.progress !== undefined && bar.shape) {
      // O avanço novo por cima da barra, no desenho exato dela.
      ghost = (
        <div className="absolute" style={{ left: bar.left, width: bar.width, top: top + metrics.barTop, height: metrics.barHeight }}>
          <BarShape
            shape={bar.shape}
            origin={bar.left}
            tone={tone}
            progress={drag.progress}
            borderStyle="solid"
            scale={{ rangeStart: range.start, zoom, calendar, elapsed: row.elapsed }}
          />
        </div>
      );
    }
    // O vínculo: contorno na tarefa de origem e na sucessora, e a seta que vai nascer (o cotovelo
    // TI de verdade quando há sucessora; senão, uma linha até o ponteiro).
    const outline = (index: number, dashed: boolean) => {
      const item = geometry.bars[index],
        rowTop = index * rowHeight;
      const isMilestone = rows[index].milestone;
      const boxTop = isMilestone ? rowTop + metrics.mid - diamond / 2 : rowTop + metrics.barTop;
      const boxHeight = isMilestone ? diamond : metrics.barHeight;
      return (
        <div
          key={`o-${rows[index].id}`}
          className={`absolute rounded-[3px] border-2 ${dashed ? 'border-dashed' : ''}`}
          style={{ left: item.left - 3, width: item.width + 6, top: boxTop - 3, height: boxHeight + 6, borderColor: CHART.link }}
        />
      );
    };
    let linkNodes: JSX.Element | null = null;
    if (drag.mode === 'link') {
      const sourceAnchor = geometry.anchors.get(row.id),
        targetAnchor = drag.target ? geometry.anchors.get(drag.target) : undefined;
      const points: Point[] =
        sourceAnchor && targetAnchor
          ? linkPoints('TI', sourceAnchor, targetAnchor)
          : [
              [drag.from[0], drag.from[1]],
              [drag.pointer[0], drag.pointer[1]],
            ];
      linkNodes = (
        <>
          {outline(dragIndex, true)}
          {targetIndex >= 0 && outline(targetIndex, !drag.changed)}
          <svg className="absolute left-0 top-0 overflow-visible" width={width} height={bodyHeight}>
            <polyline
              points={points.map(p => p.join(',')).join(' ')}
              fill="none"
              stroke={CHART.link}
              strokeWidth={1.5}
              strokeDasharray={targetAnchor ? undefined : '4 3'}
            />
            {targetAnchor ? (
              <polygon
                points={arrowHead(points)
                  .map(p => p.join(','))
                  .join(' ')}
                fill={CHART.link}
              />
            ) : (
              <circle cx={drag.pointer[0]} cy={drag.pointer[1]} r={3} fill={CHART.link} />
            )}
          </svg>
        </>
      );
    }
    // A dica acompanha o ponteiro e vira para dentro perto das bordas da área visível.
    const tipHeight = 14 + tip.lines.length * 18 + (tip.note ? 18 : 0);
    const { viewport } = drag;
    const tipLeft = Math.max(viewport.left + 4, Math.min(drag.pointer[0] + 16, viewport.left + viewport.width - DRAG_TOOLTIP_WIDTH - 16));
    const below = drag.pointer[1] + 20;
    const tipTop = Math.max(
      viewport.top + 4,
      below + tipHeight > viewport.top + viewport.height - 4 ? drag.pointer[1] - tipHeight - 12 : below,
    );
    dragLayer = (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
        {ghost}
        {linkNodes}
        {showTip && (
          <div
            className="absolute rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs leading-[18px] text-slate-700 shadow-lg"
            style={{ left: tipLeft, top: tipTop, width: DRAG_TOOLTIP_WIDTH }}
          >
            {tip.lines.map(([label, value]) => (
              <div key={label} className="flex gap-1.5">
                <span className="shrink-0 text-slate-500">{label}:</span>
                <span className="truncate font-semibold tabular-nums text-slate-800">{value}</span>
              </div>
            ))}
            {tip.note && <div className="text-slate-500">{tip.note}</div>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      onPointerDownCapture={() => {
        suppressClick.current = false;
      }}
      onClickCapture={event => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.stopPropagation();
        event.preventDefault();
      }}
      role="region"
      aria-label="Gráfico de Gantt"
      data-tour="medio-gantt-grafico"
      tabIndex={0}
      className={`relative overflow-auto bg-white [scrollbar-gutter:stable] [scrollbar-width:auto] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:bg-slate-100 ${className}`}
    >
      <div style={{ width, minWidth: '100%' }}>
        {/* Escala de tempo: exatamente a altura do cabeçalho da tabela, para as linhas alinharem. */}
        <div className="sticky top-0 z-30 border-b border-slate-300 bg-slate-100" style={{ height: headerHeight }}>
          {tiers.top.map(cell => (
            <div
              key={`t-${cell.key}`}
              title={cell.title}
              style={{ left: cell.left, width: cell.width, height: topTier }}
              className="absolute top-0 flex items-center overflow-hidden whitespace-nowrap border-r border-slate-300 px-1.5 text-xs font-semibold text-slate-700"
            >
              {cell.label}
            </div>
          ))}
          {tiers.bottom.map(cell => (
            <div
              key={`b-${cell.key}`}
              title={cell.title}
              style={{ left: cell.left, width: cell.width, top: topTier, height: bottomTier }}
              className={`absolute flex items-center overflow-hidden whitespace-nowrap border-r border-t border-slate-200 text-xs tabular-nums text-slate-500 ${zoom === 'dia' ? 'justify-center' : 'px-1'}`}
            >
              {cell.label}
            </div>
          ))}
          {todayX !== undefined && (
            <div aria-hidden="true" className="absolute bottom-0 h-1.5 w-0.5" style={{ left: todayX - 1, background: CHART.today }} />
          )}
        </div>

        <div
          ref={bodyRef}
          onPointerMove={onBodyPointerMove}
          onPointerUp={onBodyPointerUp}
          onPointerCancel={onBodyPointerCancel}
          onLostPointerCapture={onBodyPointerCancel}
          className={`relative ${canEdit ? 'select-none' : ''}`}
          style={{ height: bodyHeight, cursor: dragCursor }}
        >
          {/* Fundo: dias não úteis, área fora da janela do plano, grade, hoje e limites da janela. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {offDays.map(run => (
              <div key={run.from} className="absolute inset-y-0 bg-slate-200/45" style={{ left: run.from * px, width: run.days * px }} />
            ))}
            {windowLeft > 0 && <div className="absolute inset-y-0 left-0 bg-slate-300/25" style={{ width: windowLeft }} />}
            {windowRight < width && <div className="absolute inset-y-0 right-0 bg-slate-300/25" style={{ left: windowRight }} />}
            {tiers.bottom.map(
              cell =>
                cell.left > 0 && (
                  <div key={cell.key} className="absolute inset-y-0 border-l border-slate-200/70" style={{ left: cell.left }} />
                ),
            )}
            <div className="absolute inset-y-0 border-l border-dashed border-slate-500" style={{ left: windowLeft }} />
            <div className="absolute inset-y-0 border-l border-dashed border-slate-500" style={{ left: windowRight }} />
            {todayX !== undefined && <div className="absolute inset-y-0 w-0.5" style={{ left: todayX - 1, background: CHART.today }} />}
          </div>

          {rowNodes}

          {paths.length > 0 && (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
              width={width}
              height={bodyHeight}
            >
              {paths.map(path => {
                const tone = linkTone(path, pathIds);
                return (
                  <g key={path.id} opacity={tone.opacity}>
                    <polyline
                      points={path.points.map(p => p.join(',')).join(' ')}
                      fill="none"
                      stroke={tone.stroke}
                      strokeWidth={tone.strokeWidth}
                      strokeLinejoin="miter"
                    />
                    <polygon
                      points={arrowHead(path.points)
                        .map(p => p.join(','))
                        .join(' ')}
                      fill={tone.stroke}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {/* Durante o arrasto, uma película por cima de tudo mantém o cursor do modo (mover,
           * esticar, vincular ou proibido) onde quer que o ponteiro passe. */}
          {drag && <div aria-hidden="true" className="absolute inset-0 z-20" style={{ cursor: dragCursor }} />}
          {dragLayer}
        </div>
      </div>
    </div>
  );
}

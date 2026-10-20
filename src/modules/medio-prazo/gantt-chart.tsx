'use client';
import { useCallback, useEffect, useMemo, type JSX, type KeyboardEvent, type MouseEvent, type RefObject, type UIEvent } from 'react';
import type { LinkType } from '@/domain/entities';
import type { WorkCalendar } from '@/domain/plan-schedule';
import { CHART, SERIES_COLORS, STATUS } from '@/shared/palette';

/* Gráfico de Gantt de acompanhamento, no molde do "Gantt de acompanhamento" do Project: barra
 * azul-clara com o avanço em azul-escuro (vermelha quando crítica), linha de base cinza logo
 * abaixo, resumo em colchete preto, marco em losango, vínculos em cotovelo, seta de prazo final,
 * linha de folga e o "Caminho da tarefa" do Project 2013 colorindo predecessoras e sucessoras da
 * linha selecionada. É só apresentação: recebe as linhas já na ordem da tabela ao lado, com o
 * caminho crítico, as folgas e os papéis já calculados pelo motor — não calcula datas; o que ele
 * desenha é o que a tabela mostra. As contas de posição e de cor ficam em funções puras
 * exportadas, cobertas por tests/gantt-chart.test.ts. */

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
  selectedId?: string;
  onSelect: (id: string) => void;
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
 * viram uma barra de um dia, e nenhuma barra fica mais fina que 2 px. */
export function barSpan(start: string, end: string, rangeStart: string, zoom: GanttZoom) {
  const left = dateX(start, rangeStart, zoom);
  const right = Math.max(dateX(end < start ? start : end, rangeStart, zoom) + GANTT_DAY_PX[zoom], left + 2);
  return { left, right, width: right - left };
}

/** O marco fica no meio do dia da data dele: a mesma posição em qualquer escala e coerente com o
 * rótulo "dd/mm" ao lado. */
export const milestoneX = (date: string, rangeStart: string, zoom: GanttZoom) => dateX(date, rangeStart, zoom) + GANTT_DAY_PX[zoom] / 2;

/** A seta do prazo final fica no meio do dia dele, como o marco. */
export const deadlineX = (date: string, rangeStart: string, zoom: GanttZoom) => milestoneX(date, rangeStart, zoom);

/** Linha de folga: do fim do dia `end` até o fim do dia `lateFinish`. Sem término tardio, ou com
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

// ————— Textos —————

const percent = (value: number) => `${Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)))}%`;
/** "1 dia", "3 dias", "0 dias", "-1 dia". */
const dayCount = (days: number) => `${days} ${Math.abs(days) === 1 ? 'dia' : 'dias'}`;
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
 * Base: … · Real: … · Folga livre: 2 dias · Folga total: 2 dias · Prazo final: … · Vínculo
 * desrespeitado · Predecessora determinante · Fora da janela do plano". Tudo em texto: nenhuma
 * dessas informações depende da cor da barra. */
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
 * o roxo da série categórica, que não aparecem em mais nada neste gráfico. */
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
  selectedId,
  onSelect,
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

  // Uma passada pelas linhas: posição de cada barra e ponto de engate dos vínculos, indexados por
  // id para os vínculos não precisarem procurar linha por linha.
  const geometry = useMemo(() => {
    const anchors = new Map<string, LinkAnchor>();
    const bars = rows.map((row, index) => {
      const top = index * rowHeight;
      if (row.milestone) {
        const center = milestoneX(row.start, range.start, zoom);
        anchors.set(row.id, {
          left: center - diamond / 2,
          right: center + diamond / 2,
          y: top + metrics.mid,
          top,
          bottom: top + rowHeight,
        });
        return { left: center - diamond / 2, right: center + diamond / 2, width: diamond, center };
      }
      const span = barSpan(row.start, row.end, range.start, zoom);
      const y = top + (row.summary ? metrics.barTop + summaryThickness / 2 : metrics.mid);
      anchors.set(row.id, { left: span.left, right: span.right, y, top, bottom: top + rowHeight });
      return { ...span, center: (span.left + span.right) / 2 };
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

  const focusRow = (index: number) => {
    const row = rows[index];
    if (!row) return;
    onSelect(row.id);
    requestAnimationFrame(() => {
      const node = scrollRef.current?.querySelector<HTMLElement>(`[data-gantt-bar="${CSS.escape(row.id)}"]`);
      node?.focus({ preventScroll: false });
    });
  };
  const onBarKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow(index + (event.key === 'ArrowDown' ? 1 : -1));
    }
  };
  // Só uma barra entra na ordem do Tab (a selecionada, ou a primeira): com mil linhas, o Tab
  // passaria por mil botões. As setas para cima e para baixo andam entre elas.
  const focusable = rows.some(row => row.id === selectedId) ? selectedId : rows[0]?.id;

  const windowLeft = x(planWindow.start),
    windowRight = x(planWindow.end) + px;
  const todayX = today >= range.start && today <= range.end ? x(today) + px / 2 : undefined;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
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

        <div className="relative" style={{ height: bodyHeight }}>
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

          {rows.map((row, index) => {
            const bar = geometry.bars[index];
            const selected = row.id === selectedId;
            // O papel no caminho só entra no texto com o caminho à mostra: a grade pode calculá-lo sempre.
            const tooltip = ganttTooltip(showPath || !row.pathRole ? row : { ...row, pathRole: undefined });
            const kind = row.milestone ? 'Marco' : row.summary ? 'Resumo' : 'Tarefa';
            const progress = Math.min(100, Math.max(0, Number.isFinite(row.progress) ? row.progress : 0));
            const tone = barTone(row, { showCritical, showPath });
            const borderStyle = row.conflict ? 'dashed' : 'solid';
            const base = showBaseline && row.baseStart && row.baseEnd ? barSpan(row.baseStart, row.baseEnd, range.start, zoom) : undefined;
            // A linha de folga começa onde a barra (ou o losango) acaba, e o "%" fica depois dela.
            const slack = showSlack && !row.summary ? slackSpan(row.end, row.lateFinish, range.start, zoom) : undefined;
            const slackLeft = slack ? Math.max(slack.left, bar.right) : 0;
            const slackWidth = slack ? slack.left + slack.width - slackLeft : 0;
            const slackLine = slackWidth > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{ left: slackLeft, width: slackWidth, top: metrics.mid - 1, height: 2, background: CHART.inkMuted }}
              />
            );
            const textLeft = Math.max(bar.right, base?.right ?? 0, slackWidth > 0 ? slackLeft + slackWidth : 0) + 4;
            const deadline = row.deadline && ISO.test(row.deadline) ? deadlineX(row.deadline, range.start, zoom) : undefined;
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
              onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => onBarKey(event, index),
            };
            return (
              <div
                key={row.id}
                onClick={() => onSelect(row.id)}
                style={{ height: rowHeight }}
                className={`relative border-b border-slate-100 ${selected ? 'bg-primary/10' : row.outOfWindow ? 'bg-warning/10' : ''}`}
              >
                {/* Tudo da linha apaga junto quando ela está fora do caminho da tarefa; a seta do
                 * prazo final fica fora desse invólucro, porque um prazo perdido não pode apagar. */}
                <div className="absolute inset-0" style={{ opacity: tone.opacity }}>
                  {row.milestone ? (
                    <>
                      {base && (
                        <div
                          aria-hidden="true"
                          className="absolute rotate-45"
                          style={{
                            background: CHART.baseline,
                            left: milestoneX(row.baseStart!, range.start, zoom) - diamond * 0.35,
                            top: metrics.baseTop + (metrics.baseHeight - diamond * 0.7) / 2,
                            width: diamond * 0.7,
                            height: diamond * 0.7,
                          }}
                        />
                      )}
                      {slackLine}
                      {/* Marco: losango na cor da linha; em conflito, o contorno fica tracejado. */}
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
                        }}
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute whitespace-nowrap text-xs font-medium tabular-nums leading-none text-slate-700"
                        style={{
                          left: Math.max(bar.right + 2, base ? milestoneX(row.baseStart!, range.start, zoom) + diamond * 0.35 : 0) + 4,
                          top: metrics.mid - 6,
                        }}
                      >
                        {row.start.slice(8, 10)}/{row.start.slice(5, 7)}
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
                      {/* Resumo: colchete preto com as pontas voltadas para baixo, como no Project. */}
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
                      {slackLine}
                      {/* Tarefa: barra clara com o avanço no tom cheio; em conflito, a borda fica tracejada. */}
                      <button
                        {...barProps}
                        className="absolute overflow-hidden rounded-[2px] border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        style={{
                          background: tone.fill,
                          borderColor: tone.border,
                          borderStyle,
                          left: bar.left,
                          width: bar.width,
                          top: metrics.barTop,
                          height: metrics.barHeight,
                        }}
                      >
                        <span className="absolute inset-y-0 left-0" style={{ background: tone.progress, width: `${progress}%` }} />
                      </button>
                      {row.actualStart && ISO.test(row.actualStart) && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute w-px bg-slate-800/70"
                          style={{ left: x(row.actualStart), top: metrics.barTop - 2, height: metrics.barHeight + 4 }}
                        />
                      )}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute whitespace-nowrap text-xs tabular-nums leading-none text-slate-600"
                        style={{ left: textLeft, top: metrics.barTop + (metrics.barHeight - 12) / 2 }}
                      >
                        {percent(progress)}
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
          })}

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
        </div>
      </div>
    </div>
  );
}

import { addDays, daysBetween, fromMs, toMs } from '@/domain/long-term-plan';
import {
  activityEnd,
  activityFinish,
  weekday,
  type LobActivity,
  type LobBaseline,
  type LobData,
  type LobLocal,
  type LobService,
  type LocalDate,
} from '@/domain/lob';
import { CHART } from '@/shared/palette';

/** Geometria da Linha de Balanço (aba 1, modelo aprovado em 04/11/2026): funções puras, sem React,
 * que transformam `LobData` + zoom + filtros em pixels. O gráfico (`lob-chart.tsx`) só desenha o que
 * sai daqui, e o arrasto usa `dateAtX` para voltar de pixel a data. Tudo em dias corridos no eixo
 * (um dia = `pxPerDay`), mas as datas devolvidas caem sempre em dia útil. */

export type LobZoom = 'semana' | 'mes' | 'trimestre';

/** Medidas fixas do desenho. Rótulos dos locais à esquerda, uma linha de 30 px por local. */
export const GEOMETRY = {
  left: 110,
  top: 34,
  right: 24,
  bottom: 26,
  row: 30,
  /** Folga vertical do bloco dentro da linha (4 px acima e abaixo). */
  blockPad: 4,
  /** Folga horizontal entre um bloco e o início do seguinte. */
  blockGap: 1.5,
  /** Dias de respiro antes do começo e depois do fim do plano. */
  padBefore: 10,
  padAfter: 24,
  /** Largura mínima do bloco para receber o nome do serviço. */
  minLabelWidth: 40,
} as const;

/** Pixels por dia corrido em cada zoom. 'mes' é calculado para o plano caber na largura disponível. */
export const ZOOM_PX = { semana: 9, trimestre: 1, mesMin: 1.5, mesMax: 4 } as const;

/** "Hoje" só entra na janela do eixo se estiver a até este tanto de dias do plano: uma obra
 * concluída há anos não precisa de um eixo até hoje. */
const TODAY_REACH_DAYS = 120;

export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** "dd/mm". */
export const shortDate = (date: LocalDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
/** "seg 09/11": dia da semana abreviado e dd/mm, como no tooltip do modelo. */
export const weekdayDate = (date: LocalDate) => `${WEEKDAYS_SHORT[weekday(date)]} ${shortDate(date)}`;
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const clip = (text: string, max: number) => (max < 1 ? '' : text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text);

// ─── Cor do texto sobre o bloco ─────────────────────────────────────────────────

/** Luminância relativa (WCAG) de um `#rrggbb`. */
function luminance(hex: string) {
  const channel = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
/** A cor como fica desenhada com `fill-opacity` sobre o fundo do gráfico. */
export function blendOnSurface(hex: string, alpha: number, surface: string = CHART.surfaceMuted) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const mix = (at: number) => {
    const top = parseInt(hex.slice(at, at + 2), 16),
      under = parseInt(surface.slice(at, at + 2), 16);
    return Math.round(top * alpha + under * (1 - alpha))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}
/** Mesma regra da Linha de Balanço dos vagões: texto escuro sobre as cores claras da paleta (amarelo,
 * verde-água, rosa), branco sobre as outras. `alpha` considera a parte ainda não medida do bloco,
 * desenhada a 42%: sobre ela quase toda cor fica clara e o texto precisa ser escuro. */
export function inkOn(fill: string, alpha = 1) {
  const effective = alpha < 1 ? blendOnSurface(fill, alpha) : fill;
  if (!/^#[0-9a-f]{6}$/i.test(effective)) return CHART.ink;
  return luminance(effective) > 0.3 ? CHART.ink : '#ffffff';
}

// ─── Tipos do layout ────────────────────────────────────────────────────────────

export interface LobLayoutInput {
  data: Pick<LobData, 'locals' | 'services' | 'activities'>;
  zoom: LobZoom;
  /** Largura do contêiner em px: o zoom 'mes' ajusta a escala para o plano caber nela. */
  availableWidth: number;
  today: LocalDate;
  measurementDates?: { number: number; date: LocalDate }[];
  baseline?: LobBaseline;
  hiddenServiceIds?: ReadonlySet<string>;
  visibleLocalIds?: ReadonlySet<string>;
  /** Período mostrado (datas inclusivas); sem ele, o plano inteiro. */
  range?: { start: LocalDate; end: LocalDate };
}
export interface LobRow {
  local: LobLocal;
  /** Posição de baixo para cima (0 = o local mais baixo). */
  index: number;
  /** Topo da linha, em px. */
  y: number;
}
export interface LobBlock {
  activity: LobActivity;
  service: LobService;
  local: LobLocal;
  row: LobRow;
  x: number;
  y: number;
  w: number;
  h: number;
  start: LocalDate;
  /** Fim exclusivo (primeiro dia útil livre). */
  end: LocalDate;
  /** Último dia trabalhado. */
  finish: LocalDate;
}
export interface LobGhost {
  activityId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  start: LocalDate;
  durationDays: number;
}
export interface LobMonthTick {
  x: number;
  label: string;
  /** Janeiro: grade mais forte e rótulo "jan/27" em negrito. */
  yearStart: boolean;
  /** Falso quando o zoom não deixa espaço para escrever todos os meses (só o rótulo some; a grade fica). */
  labeled: boolean;
}
export interface LobMarker {
  x: number;
  label: string;
  date: LocalDate;
}
export interface LobLayout {
  zoom: LobZoom;
  /** Janela do eixo: `start` inclusivo, `end` exclusivo. */
  start: LocalDate;
  end: LocalDate;
  pxPerDay: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  rowHeight: number;
  innerW: number;
  innerH: number;
  width: number;
  height: number;
  rows: LobRow[];
  blocks: LobBlock[];
  blockById: Map<string, LobBlock>;
  ghosts: LobGhost[];
  months: LobMonthTick[];
  /** Abscissas das segundas-feiras, para os traços na base do gráfico. */
  mondays: number[];
  /** Abscissa de "hoje"; indefinida quando fica fora da janela. */
  todayX?: number;
  measurements: LobMarker[];
  /** Data → px (borda esquerda do dia). */
  xOf: (date: LocalDate) => number;
  /** px → dia útil mais próximo: sábado volta para sexta, domingo avança para segunda. */
  dateAtX: (x: number) => LocalDate;
}

// ─── Layout ─────────────────────────────────────────────────────────────────────

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Locais ordenados de baixo para cima (orderIndex crescente), já filtrados. */
export function orderedLocals(locals: LobLocal[], visibleLocalIds?: ReadonlySet<string>): LobLocal[] {
  return locals
    .filter(l => !visibleLocalIds || visibleLocalIds.has(l.id))
    .sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, 'pt-BR'));
}
/** Dia útil mais próximo de uma data qualquer. */
export function nearestWorkday(date: LocalDate): LocalDate {
  const d = weekday(date);
  if (d === 6) return addDays(date, -1);
  if (d === 0) return addDays(date, 1);
  return date;
}

/** Janela do eixo do tempo. Sem período escolhido, vai do primeiro ao último bloco de TODA a obra
 * (não só dos filtrados): ocultar um serviço pela legenda não desloca o eixo. Entram também os
 * fantasmas da linha de base e, se estiver perto do plano, o dia de hoje. */
function timeWindow(input: LobLayoutInput): { start: LocalDate; end: LocalDate } {
  if (input.range) return { start: input.range.start, end: addDays(input.range.end, 1) };
  const dates: LocalDate[] = [];
  const ends: LocalDate[] = [];
  for (const a of input.data.activities) {
    dates.push(a.start);
    ends.push(activityEnd(a));
  }
  for (const g of input.baseline?.snapshot ?? []) {
    dates.push(g.start);
    ends.push(activityEnd(g));
  }
  if (!dates.length) {
    dates.push(input.today);
    ends.push(addDays(input.today, 30));
  }
  let start = dates.reduce((m, d) => (d < m ? d : m));
  let end = ends.reduce((m, d) => (d > m ? d : m));
  if (Math.abs(daysBetween(start, input.today)) <= TODAY_REACH_DAYS || Math.abs(daysBetween(end, input.today)) <= TODAY_REACH_DAYS) {
    if (input.today < start) start = input.today;
    if (input.today >= end) end = addDays(input.today, 1);
  }
  return { start: addDays(start, -GEOMETRY.padBefore), end: addDays(end, GEOMETRY.padAfter) };
}

export function pxPerDayFor(zoom: LobZoom, days: number, availableWidth: number): number {
  if (zoom === 'semana') return ZOOM_PX.semana;
  if (zoom === 'trimestre') return ZOOM_PX.trimestre;
  // 2 px a menos: o arredondamento da largura não pode gerar uma barra de rolagem de 1 px.
  const inner = Math.max(120, availableWidth - GEOMETRY.left - GEOMETRY.right - 2);
  return clamp(inner / Math.max(1, days), ZOOM_PX.mesMin, ZOOM_PX.mesMax);
}

/** Monta o layout inteiro. Chamar dentro de um `useMemo`: percorre todos os blocos uma vez. */
export function lobLayout(input: LobLayoutInput): LobLayout {
  const { left, top, right, bottom, row: rowHeight } = GEOMETRY;
  const { start, end } = timeWindow(input);
  const days = Math.max(1, daysBetween(start, end));
  const pxPerDay = pxPerDayFor(input.zoom, days, input.availableWidth);
  const innerW = Math.round(days * pxPerDay);
  const xOf = (date: LocalDate) => left + daysBetween(start, date) * pxPerDay;
  const dateAtX = (x: number) => nearestWorkday(addDays(start, Math.round((x - left) / pxPerDay)));

  const locals = orderedLocals(input.data.locals, input.visibleLocalIds);
  const rows: LobRow[] = locals.map((local, index) => ({ local, index, y: top + (locals.length - 1 - index) * rowHeight }));
  const rowByLocal = new Map(rows.map(r => [r.local.id, r]));
  const innerH = rows.length * rowHeight;
  const serviceById = new Map(input.data.services.map(s => [s.id, s]));

  const blockH = rowHeight - 2 * GEOMETRY.blockPad;
  const blocks: LobBlock[] = [];
  const blockById = new Map<string, LobBlock>();
  for (const activity of input.data.activities) {
    if (input.hiddenServiceIds?.has(activity.serviceId)) continue;
    const row = rowByLocal.get(activity.localId);
    const service = serviceById.get(activity.serviceId);
    if (!row || !service) continue;
    const blockEnd = activityEnd(activity);
    // Fora do período escolhido: nem desenha. Quem cruza a borda entra e o gráfico recorta.
    if (blockEnd <= start || activity.start >= end) continue;
    const x = xOf(activity.start);
    const block: LobBlock = {
      activity,
      service,
      local: row.local,
      row,
      x: r2(x),
      y: row.y + GEOMETRY.blockPad,
      w: r2(Math.max(2, xOf(blockEnd) - x - GEOMETRY.blockGap)),
      h: blockH,
      start: activity.start,
      end: blockEnd,
      finish: activityFinish(activity),
    };
    blocks.push(block);
    blockById.set(activity.id, block);
  }

  // Linha de base: fantasma só onde o bloco atual existe e saiu do lugar (ou mudou de duração).
  // Fantasma igual ao bloco só poria um tracejado por baixo de tudo, sem informação nova.
  const ghosts: LobGhost[] = [];
  for (const entry of input.baseline?.snapshot ?? []) {
    const block = blockById.get(entry.activityId);
    if (!block || (entry.start === block.activity.start && entry.durationDays === block.activity.durationDays)) continue;
    const ghostEnd = activityEnd(entry);
    if (ghostEnd <= start || entry.start >= end) continue;
    const x = xOf(entry.start);
    ghosts.push({
      activityId: entry.activityId,
      x: r2(x),
      y: block.y,
      w: r2(Math.max(2, xOf(ghostEnd) - x - GEOMETRY.blockGap)),
      h: blockH,
      start: entry.start,
      durationDays: entry.durationDays,
    });
  }

  // Meses: linha de grade no dia 1 e rótulo "mar", "abr"; na virada do ano "jan/27" em negrito.
  // Três letras a 10 px ocupam ~18 px: cabem a partir de 28 px por mês (o zoom 'trimestre' tem 30).
  // "jan/27" ocupa ~30 px e, abaixo de 40 px por mês, toma o lugar do rótulo de fevereiro.
  const pxPerMonth = 30.44 * pxPerDay;
  const labelEvery = pxPerMonth >= 28 ? 1 : pxPerMonth >= 14 ? 2 : 3;
  const tightYear = labelEvery === 1 && pxPerMonth < 40;
  const months: LobMonthTick[] = [];
  const cursor = new Date(toMs(start));
  cursor.setUTCDate(1);
  while (cursor.getTime() < toMs(end)) {
    const month = cursor.getUTCMonth();
    const x = xOf(fromMs(cursor.getTime()));
    if (x >= left) {
      const yearStart = month === 0;
      months.push({
        x: r2(x),
        label: yearStart ? `${MONTHS_SHORT[month]}/${String(cursor.getUTCFullYear()).slice(2)}` : MONTHS_SHORT[month],
        yearStart,
        labeled: yearStart || (month % labelEvery === 0 && !(tightYear && month === 1)),
      });
    }
    cursor.setUTCMonth(month + 1);
  }

  // Segundas-feiras: traço curto na base, a régua das semanas.
  const mondays: number[] = [];
  const firstMonday = addDays(start, (8 - weekday(start)) % 7);
  for (let d = firstMonday; d < end; d = addDays(d, 7)) mondays.push(r2(xOf(d)));

  const inWindow = (date: LocalDate) => date >= start && date < end;
  const todayX = inWindow(input.today) ? r2(xOf(input.today)) : undefined;
  const measurements: LobMarker[] = (input.measurementDates ?? [])
    .filter(m => inWindow(m.date))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number)
    .map(m => ({ x: r2(xOf(m.date)), label: `M${m.number}`, date: m.date }));

  return {
    zoom: input.zoom,
    start,
    end,
    pxPerDay,
    left,
    top,
    right,
    bottom,
    rowHeight,
    innerW,
    innerH,
    width: left + innerW + right,
    height: top + innerH + bottom,
    rows,
    blocks,
    blockById,
    ghosts,
    months,
    mondays,
    todayX,
    measurements,
    xOf,
    dateAtX,
  };
}

/** Duração mais comum de cada serviço entre seus blocos ("10 d/local" na legenda). */
export function typicalDurations(activities: Pick<LobActivity, 'serviceId' | 'durationDays'>[]): Map<string, number> {
  const counts = new Map<string, Map<number, number>>();
  for (const a of activities) {
    const perService = counts.get(a.serviceId) ?? new Map<number, number>();
    perService.set(a.durationDays, (perService.get(a.durationDays) ?? 0) + 1);
    counts.set(a.serviceId, perService);
  }
  const result = new Map<string, number>();
  for (const [serviceId, perService] of counts) {
    let best = 0,
      bestCount = -1;
    for (const [duration, count] of perService) {
      if (count > bestCount || (count === bestCount && duration < best)) {
        best = duration;
        bestCount = count;
      }
    }
    result.set(serviceId, best);
  }
  return result;
}

/** Quantos caracteres do nome cabem num bloco: ~6 px por caractere a 10,5 px, com 5 px de margem. */
export const labelChars = (width: number) => Math.floor((width - 10) / 6);

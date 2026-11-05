import type { LocalDate } from '@/domain/entities';
import { addDays, startOfWeek } from '@/domain/validation';

/** Escalas de tempo do dashboard (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"): a aba 0
 * de cada obra e o Dashboard geral analisam uma semana, um mês, um trimestre, um ano ou um intervalo escolhido.
 * Regras do modelo que este arquivo implementa:
 *
 * - Regra 5: o período é sempre feito de semanas inteiras. A semana pertence ao balde (mês, trimestre, ano)
 *   da sua segunda-feira, a mesma regra do "Histórico desde a semana 1"; trimestres e ano são os do calendário.
 *   No personalizado, "de" recua para a segunda e "até" vai até o sábado. Tudo conta até o sábado da última
 *   semana do período (`end`), e nada depois.
 * - Regra 6: o período que contém a semana atual é "parcial".
 * - Regra 7: o período anterior é o balde anterior da mesma escala; no personalizado, o intervalo de mesmo
 *   número de semanas imediatamente antes.
 * - Regra 8: a série mostra 12 semanas, 12 meses, 8 trimestres ou todos os anos; o personalizado agrupa sozinho
 *   (até 16 semanas por semana, até 24 meses por mês, acima disso por trimestre) ou como a pessoa escolher.
 * - Regra 4: escala e período vão para a URL; o link antigo com `semana=` abre na escala semanal.
 *
 * Tudo puro e determinístico. Semanas são sempre a segunda-feira ("AAAA-MM-DD"). */

export type DashboardScale = 'semana' | 'mes' | 'trimestre' | 'ano' | 'personalizado';
/** Como as semanas se agrupam num balde: a escala fixa ou o agrupamento da série do personalizado. */
export type PeriodGrouping = Exclude<DashboardScale, 'personalizado'>;
export type GroupingChoice = PeriodGrouping | 'auto';

export const DASHBOARD_SCALES: readonly { id: DashboardScale; label: string }[] = [
  { id: 'semana', label: 'Semanal' },
  { id: 'mes', label: 'Mensal' },
  { id: 'trimestre', label: 'Trimestral' },
  { id: 'ano', label: 'Anual' },
  { id: 'personalizado', label: 'Personalizado' },
];
export const GROUPINGS: readonly PeriodGrouping[] = ['semana', 'mes', 'trimestre', 'ano'];
export const isDashboardScale = (value: unknown): value is DashboardScale => DASHBOARD_SCALES.some(s => s.id === value);
export const isGrouping = (value: unknown): value is PeriodGrouping => GROUPINGS.includes(value as PeriodGrouping);
export const scaleLabel = (scale: DashboardScale) => DASHBOARD_SCALES.find(s => s.id === scale)!.label;

/** Regra 8: quantos baldes a série mostra em cada escala. Anual: todos, desde a primeira semana com dado. */
export const SERIES_LENGTH: Record<PeriodGrouping, number> = { semana: 12, mes: 12, trimestre: 8, ano: Number.POSITIVE_INFINITY };
/** Personalizado automático: até 16 semanas, por semana; até 104 semanas (24 meses), por mês; acima, por trimestre. */
export const AUTO_WEEK_LIMIT = 16;
export const AUTO_MONTH_LIMIT = 104;
/** Personalizado sem datas na URL: as 12 semanas até a atual. */
export const DEFAULT_CUSTOM_WEEKS = 12;

/** Substantivo de cada agrupamento, para "série por mês", "12 meses". */
export const GROUPING_NOUN: Record<PeriodGrouping, { one: string; many: string }> = {
  semana: { one: 'semana', many: 'semanas' },
  mes: { one: 'mês', many: 'meses' },
  trimestre: { one: 'trimestre', many: 'trimestres' },
  ano: { one: 'ano', many: 'anos' },
};
/** "PPC do mês", "Pendências do trimestre". */
export const SCALE_OF: Record<DashboardScale, string> = {
  semana: 'da semana',
  mes: 'do mês',
  trimestre: 'do trimestre',
  ano: 'do ano',
  personalizado: 'do período',
};

const MONTHS = [
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
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const QUARTER_MONTHS = [
  ['jan', 'mar'],
  ['abr', 'jun'],
  ['jul', 'set'],
  ['out', 'dez'],
];
const pad = (n: number) => String(n).padStart(2, '0');
const dm = (date: LocalDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const dmy = (date: LocalDate) => `${dm(date)}/${date.slice(0, 4)}`;
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
const quarterOfMonth = (month: number) => Math.floor((month - 1) / 3) + 1;
const isLocalDate = (value: unknown): value is LocalDate =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** Um balde de semanas inteiras: uma semana, um mês, um trimestre ou um ano. */
export interface PeriodBucket {
  grouping: PeriodGrouping;
  /** "2026-10-26" (semana), "2026-10" (mês), "2026-T4" (trimestre), "2026" (ano); no personalizado, as datas. */
  key: string;
  /** Segundas-feiras do balde, da mais antiga à mais nova, só até a semana atual. */
  weeks: LocalDate[];
  /** Segunda-feira da primeira semana e sábado da última (das semanas que já existem). */
  start: LocalDate;
  end: LocalDate;
  /** Quantas semanas o balde tem no calendário inteiro. */
  nominalWeeks: number;
  /** O balde contém a semana atual: está em andamento. */
  current: boolean;
  /** "outubro de 2026" / "26/10 a 31/10/2026" e "out/26" / "26/10". */
  label: string;
  short: string;
}

/** O período analisado e tudo o que os quadros precisam dele. `lastWeek`/`end` viram a semana e o sábado de
 * referência dos quadros (`DashboardReference.week`/`weekEnd`): os retratos (status, atrasadas, em aberto)
 * são tirados no sábado final, os fluxos somam as semanas de `weeks` (regra 9). */
export interface DashboardPeriod {
  scale: DashboardScale;
  /** A chave do balde nas escalas fixas; no personalizado, "AAAA-MM-DD..AAAA-MM-DD" (segunda inicial..segunda final). */
  key: string;
  /** Agrupamento da série: a própria escala, ou o escolhido/automático no personalizado. */
  grouping: PeriodGrouping;
  /** Só no personalizado: o que a pessoa escolheu em "Agrupar por". */
  groupingChoice?: GroupingChoice;
  weeks: LocalDate[];
  start: LocalDate;
  end: LocalDate;
  lastWeek: LocalDate;
  nominalWeeks: number;
  partial: boolean;
  label: string;
  short: string;
  /** "do mês", "do período". */
  of: string;
  /** Os baldes da série, do mais antigo ao mais novo; nas escalas fixas o último é o próprio período. */
  series: PeriodBucket[];
  /** O período anterior para a comparação; ausente antes da primeira semana com dado. */
  previous?: PeriodBucket;
}

/** O que a pessoa escolheu (e o que viaja na URL). Escala fixa: `key`; personalizado: `from`, `to`, `grouping`. */
export interface PeriodSelection {
  scale: DashboardScale;
  key?: string;
  from?: LocalDate;
  to?: LocalDate;
  grouping?: GroupingChoice;
}

/** O que resolve uma seleção num período. */
export interface PeriodContext {
  /** Segunda-feira da semana de hoje. */
  currentWeek: LocalDate;
  /** Segunda-feira da primeira semana com dado (a obra, ou a mais antiga entre as obras). Limita a lista de
   * períodos, a série anual e o recuo das setas. */
  since: LocalDate;
  /** Escala fixa sem período escolhido: o balde que contém esta semana. Aba 0: a semana atual; Dashboard geral:
   * a semana apurada mais recente (regra 6). */
  anchorWeek: LocalDate;
}

// ─── Baldes ─────────────────────────────────────────────────────────────────────────────────────────────

export function bucketKey(grouping: PeriodGrouping, week: LocalDate): string {
  const monday = startOfWeek(week);
  const year = monday.slice(0, 4);
  const month = Number(monday.slice(5, 7));
  switch (grouping) {
    case 'semana':
      return monday;
    case 'mes':
      return monday.slice(0, 7);
    case 'trimestre':
      return `${year}-T${quarterOfMonth(month)}`;
    case 'ano':
      return year;
  }
}

export function isBucketKey(grouping: PeriodGrouping, key: unknown): key is string {
  if (typeof key !== 'string') return false;
  switch (grouping) {
    case 'semana':
      return isLocalDate(key) && startOfWeek(key) === key;
    case 'mes':
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
    case 'trimestre':
      return /^\d{4}-T[1-4]$/.test(key);
    case 'ano':
      return /^\d{4}$/.test(key);
  }
}

/** Primeiro e último dia do calendário do balde. */
function bucketRange(grouping: PeriodGrouping, key: string): { from: LocalDate; to: LocalDate } {
  const year = Number(key.slice(0, 4));
  switch (grouping) {
    case 'semana':
      return { from: key, to: addDays(key, 6) };
    case 'mes': {
      const month = Number(key.slice(5, 7));
      return { from: `${key}-01`, to: lastDayOfMonth(year, month) };
    }
    case 'trimestre': {
      const quarter = Number(key.slice(-1));
      return { from: `${year}-${pad(quarter * 3 - 2)}-01`, to: lastDayOfMonth(year, quarter * 3) };
    }
    case 'ano':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
}

/** As segundas-feiras cujas datas caem entre `from` e `to`, inclusive. */
export function mondaysBetween(from: LocalDate, to: LocalDate): LocalDate[] {
  let week = startOfWeek(from);
  if (week < from) week = addDays(week, 7);
  const out: LocalDate[] = [];
  for (; week <= to && out.length < 2000; week = addDays(week, 7)) out.push(week);
  return out;
}

export function bucketLabel(grouping: PeriodGrouping, key: string, form: 'long' | 'short'): string {
  switch (grouping) {
    case 'semana':
      return form === 'long' ? `${dm(key)} a ${dmy(addDays(key, 5))}` : dm(key);
    case 'mes': {
      const month = Number(key.slice(5, 7));
      return form === 'long' ? `${MONTHS[month - 1]} de ${key.slice(0, 4)}` : `${MONTHS_SHORT[month - 1]}/${key.slice(2, 4)}`;
    }
    case 'trimestre': {
      const quarter = Number(key.slice(-1));
      const [a, b] = QUARTER_MONTHS[quarter - 1];
      return form === 'long' ? `${quarter}º trimestre de ${key.slice(0, 4)} (${a}–${b})` : `${quarter}T${key.slice(2, 4)}`;
    }
    case 'ano':
      return key;
  }
}

/** O balde de chave `key`, com as semanas até a atual. Balde todo no futuro sai com `weeks` vazio. */
export function bucketOf(grouping: PeriodGrouping, key: string, currentWeek: LocalDate): PeriodBucket {
  const range = bucketRange(grouping, key);
  const nominal = mondaysBetween(range.from, range.to);
  const weeks = nominal.filter(week => week <= currentWeek);
  const first = weeks[0] ?? nominal[0];
  const last = weeks.at(-1) ?? nominal.at(-1)!;
  return {
    grouping,
    key,
    weeks,
    start: first,
    end: addDays(last, 5),
    nominalWeeks: nominal.length,
    current: weeks.includes(currentWeek),
    label: bucketLabel(grouping, key, 'long'),
    short: bucketLabel(grouping, key, 'short'),
  };
}

/** O balde `delta` posições antes (negativo) ou depois (positivo) de `key`. */
export function shiftKey(grouping: PeriodGrouping, key: string, delta: number): string {
  const year = Number(key.slice(0, 4));
  switch (grouping) {
    case 'semana':
      return addDays(key, 7 * delta);
    case 'mes': {
      const index = year * 12 + Number(key.slice(5, 7)) - 1 + delta;
      return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
    }
    case 'trimestre': {
      const index = year * 4 + Number(key.slice(-1)) - 1 + delta;
      return `${Math.floor(index / 4)}-T${(index % 4) + 1}`;
    }
    case 'ano':
      return String(year + delta);
  }
}

/** Os baldes que contêm alguma das semanas, na ordem, cada um só com as semanas da lista (o personalizado corta
 * o primeiro e o último balde nas bordas do intervalo; o rótulo continua o do balde). */
export function groupWeeks(weeks: readonly LocalDate[], grouping: PeriodGrouping, currentWeek: LocalDate): PeriodBucket[] {
  const keys: string[] = [];
  const byKey = new Map<string, LocalDate[]>();
  for (const week of weeks) {
    const key = bucketKey(grouping, week);
    const list = byKey.get(key);
    if (list) list.push(week);
    else {
      byKey.set(key, [week]);
      keys.push(key);
    }
  }
  return keys.map(key => {
    const full = bucketOf(grouping, key, currentWeek);
    const own = byKey.get(key)!;
    return { ...full, weeks: own, start: own[0], end: addDays(own.at(-1)!, 5), current: own.includes(currentWeek) };
  });
}

/** Regra 8: o agrupamento automático do personalizado pelo número de semanas. */
export const autoGrouping = (weekCount: number): PeriodGrouping =>
  weekCount <= AUTO_WEEK_LIMIT ? 'semana' : weekCount <= AUTO_MONTH_LIMIT ? 'mes' : 'trimestre';

// ─── Períodos ───────────────────────────────────────────────────────────────────────────────────────────

/** Os baldes da série que termina em `key`: até `SERIES_LENGTH`, sem recuar para antes de `since`. */
function seriesUntil(grouping: PeriodGrouping, key: string, ctx: Pick<PeriodContext, 'since' | 'currentWeek'>): PeriodBucket[] {
  const out: PeriodBucket[] = [];
  for (let k = key; out.length < SERIES_LENGTH[grouping] && out.length < 600; k = shiftKey(grouping, k, -1)) {
    const bucket = bucketOf(grouping, k, ctx.currentWeek);
    if (bucket.end < ctx.since) break;
    out.unshift(bucket);
  }
  return out;
}

/** Um período de escala fixa a partir da chave do balde (válida e já dentro dos limites). */
function fixedPeriod(grouping: PeriodGrouping, key: string, ctx: PeriodContext): DashboardPeriod {
  const bucket = bucketOf(grouping, key, ctx.currentWeek);
  const previousKey = shiftKey(grouping, key, -1);
  const previous = bucketOf(grouping, previousKey, ctx.currentWeek);
  return {
    scale: grouping,
    key,
    grouping,
    weeks: bucket.weeks,
    start: bucket.start,
    end: bucket.end,
    lastWeek: bucket.weeks.at(-1)!,
    nominalWeeks: bucket.nominalWeeks,
    partial: bucket.current,
    label: bucket.label,
    short: bucket.short,
    of: SCALE_OF[grouping],
    series: seriesUntil(grouping, key, ctx),
    ...(previous.end >= ctx.since ? { previous } : {}),
  };
}

/** Um período personalizado: semanas inteiras de `from` a `to` (invertidos se preciso), até a semana atual. */
export function customPeriod(
  from: LocalDate,
  to: LocalDate,
  choice: GroupingChoice,
  ctx: Pick<PeriodContext, 'currentWeek'>,
): DashboardPeriod {
  let first = startOfWeek(from < to ? from : to);
  let last = startOfWeek(from < to ? to : from);
  if (last > ctx.currentWeek) last = ctx.currentWeek;
  if (first > last) first = last;
  const weeks: LocalDate[] = [];
  for (let week = first; week <= last && weeks.length < 2000; week = addDays(week, 7)) weeks.push(week);
  const grouping = choice === 'auto' ? autoGrouping(weeks.length) : choice;
  const previousWeeks = weeks.map((_, i) => addDays(first, -7 * (weeks.length - i)));
  const end = addDays(last, 5);
  return {
    scale: 'personalizado',
    key: `${first}..${last}`,
    grouping,
    groupingChoice: choice,
    weeks,
    start: first,
    end,
    lastWeek: last,
    nominalWeeks: weeks.length,
    partial: weeks.includes(ctx.currentWeek),
    label: `${dmy(first)} a ${dmy(end)}`,
    short: `${dm(first)} a ${dm(end)}`,
    of: SCALE_OF.personalizado,
    series: groupWeeks(weeks, grouping, ctx.currentWeek),
    previous: {
      grouping,
      key: `${previousWeeks[0]}..${previousWeeks.at(-1)}`,
      weeks: previousWeeks,
      start: previousWeeks[0],
      end: addDays(previousWeeks.at(-1)!, 5),
      nominalWeeks: previousWeeks.length,
      current: false,
      label: `${dmy(previousWeeks[0])} a ${dmy(addDays(previousWeeks.at(-1)!, 5))}`,
      short: `${dm(previousWeeks[0])} a ${dm(addDays(previousWeeks.at(-1)!, 5))}`,
    },
  };
}

/** A seleção vira período. Chave ausente, inválida ou fora dos limites (antes de `since`, depois da semana atual)
 * cai no balde de `anchorWeek`. */
export function resolvePeriod(selection: PeriodSelection | undefined, ctx: PeriodContext): DashboardPeriod {
  const scale = selection?.scale ?? 'semana';
  if (scale === 'personalizado') {
    const to = selection?.to && isLocalDate(selection.to) ? selection.to : addDays(ctx.currentWeek, 5);
    const from =
      selection?.from && isLocalDate(selection.from) ? selection.from : addDays(startOfWeek(to), -7 * (DEFAULT_CUSTOM_WEEKS - 1));
    const choice = selection?.grouping && (selection.grouping === 'auto' || isGrouping(selection.grouping)) ? selection.grouping : 'auto';
    return customPeriod(from, to, choice, ctx);
  }
  const anchor = bucketKey(scale, ctx.anchorWeek <= ctx.currentWeek ? ctx.anchorWeek : ctx.currentWeek);
  const lowest = bucketKey(scale, ctx.since <= ctx.currentWeek ? ctx.since : ctx.currentWeek);
  const highest = bucketKey(scale, ctx.currentWeek);
  const wanted = selection?.key;
  const key = isBucketKey(scale, wanted) && wanted >= lowest && wanted <= highest ? wanted : anchor;
  return fixedPeriod(scale, key, ctx);
}

/** O período de uma semana sem olhar para a semana atual nem para a primeira semana com dado além de `since`
 * (o padrão de `referenceOf` quando o chamador não passa período, como nos testes dos quadros). */
export function weekPeriod(week: LocalDate, since: LocalDate = week): DashboardPeriod {
  const monday = startOfWeek(week);
  const start = startOfWeek(since) < monday ? startOfWeek(since) : monday;
  return fixedPeriod('semana', monday, { currentWeek: monday, since: start, anchorWeek: monday });
}

/** Os períodos que o seletor oferece numa escala fixa, do mais novo ao mais antigo. */
export function periodOptions(
  scale: PeriodGrouping,
  ctx: Pick<PeriodContext, 'since' | 'currentWeek'>,
): { key: string; label: string; short: string; current: boolean; firstWeek: LocalDate }[] {
  const lowest = bucketKey(scale, ctx.since <= ctx.currentWeek ? ctx.since : ctx.currentWeek);
  const out: { key: string; label: string; short: string; current: boolean; firstWeek: LocalDate }[] = [];
  for (let key = bucketKey(scale, ctx.currentWeek); key >= lowest && out.length < 2000; key = shiftKey(scale, key, -1)) {
    const bucket = bucketOf(scale, key, ctx.currentWeek);
    if (!bucket.weeks.length) continue;
    out.push({ key, label: bucket.label, short: bucket.short, current: bucket.current, firstWeek: bucket.weeks[0] });
  }
  return out;
}

/** Trocar de escala mantém o lugar: o balde da nova escala que contém a última semana do período atual; para o
 * personalizado, o intervalo do período atual. */
export function switchScale(period: DashboardPeriod, scale: DashboardScale): PeriodSelection {
  if (scale === 'personalizado') return { scale, from: period.start, to: period.end, grouping: 'auto' };
  return { scale, key: bucketKey(scale, period.lastWeek) };
}

/** As setas ‹ ›: um balde para trás ou para frente; no personalizado, o mesmo número de semanas. Ausente quando
 * sairia dos limites (o botão fica desabilitado). */
export function stepPeriod(period: DashboardPeriod, delta: -1 | 1, ctx: PeriodContext): PeriodSelection | undefined {
  if (period.scale === 'personalizado') {
    const shift = 7 * period.weeks.length * delta;
    const from = addDays(period.start, shift);
    const to = addDays(period.end, shift);
    if (delta > 0 && period.lastWeek >= ctx.currentWeek) return undefined;
    if (delta < 0 && addDays(period.start, -1) < ctx.since) return undefined;
    return { scale: 'personalizado', from, to, grouping: period.groupingChoice ?? 'auto' };
  }
  const key = shiftKey(period.scale, period.key, delta);
  const lowest = bucketKey(period.scale, ctx.since <= ctx.currentWeek ? ctx.since : ctx.currentWeek);
  const highest = bucketKey(period.scale, ctx.currentWeek);
  return key < lowest || key > highest ? undefined : { scale: period.scale, key };
}

/** A seleção que reproduz o período (para a URL e para levar o período de uma tela à outra). */
export function selectionOf(period: DashboardPeriod): PeriodSelection {
  return period.scale === 'personalizado'
    ? { scale: 'personalizado', from: period.start, to: period.end, grouping: period.groupingChoice ?? 'auto' }
    : { scale: period.scale, key: period.key };
}

// ─── URL (regra 4) ─────────────────────────────────────────────────────────────────────────────────────

/** Os parâmetros da URL. Semanal sai como `semana=` (o formato dos links que já existem); as demais escalas como
 * `escala=` com `periodo=` ou, no personalizado, `de=`, `ate=` e `agrupar=`. */
export function periodSearchEntries(selection: PeriodSelection): [string, string][] {
  if (selection.scale === 'semana') return selection.key ? [['semana', selection.key]] : [['escala', 'semana']];
  if (selection.scale === 'personalizado') {
    const out: [string, string][] = [['escala', 'personalizado']];
    if (selection.from) out.push(['de', selection.from]);
    if (selection.to) out.push(['ate', selection.to]);
    if (selection.grouping && selection.grouping !== 'auto') out.push(['agrupar', selection.grouping]);
    return out;
  }
  return selection.key
    ? [
        ['escala', selection.scale],
        ['periodo', selection.key],
      ]
    : [['escala', selection.scale]];
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Lê a seleção da URL; ausente quando a URL não diz nada sobre o período. Chave inválida chega como está e
 * `resolvePeriod` cai no padrão. */
export function parsePeriodParams(raw: Record<string, string | string[] | undefined>): PeriodSelection | undefined {
  const scale = first(raw.escala);
  if (scale === 'personalizado') {
    const from = first(raw.de);
    const to = first(raw.ate);
    const grouping = first(raw.agrupar);
    return {
      scale,
      ...(isLocalDate(from) ? { from } : {}),
      ...(isLocalDate(to) ? { to } : {}),
      grouping: isGrouping(grouping) ? grouping : 'auto',
    };
  }
  if (isDashboardScale(scale)) {
    const key = first(raw.periodo) ?? (scale === 'semana' ? first(raw.semana) : undefined);
    const normalized = scale === 'semana' && isLocalDate(key) ? startOfWeek(key) : key;
    return normalized ? { scale, key: normalized } : { scale };
  }
  const week = first(raw.semana);
  return isLocalDate(week) ? { scale: 'semana', key: startOfWeek(week) } : undefined;
}

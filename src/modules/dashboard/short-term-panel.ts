import type { LocalDate, Team, WeeklyCommitment, Work } from '@/domain/entities';
import { MIN_RANKED_WEEKS, type ClosingRankingResponse } from '@/domain/closing-ranking';
import { causePareto, ppcSeries, type WeekPpc } from '@/domain/rules';
import { closingDashboard, closingSummary, type ClosingDashboard, type Segment } from '@/modules/curto-prazo/closing-dashboard';
import { commitmentCompany } from '@/modules/curto-prazo/justifications';
import { compareText, distinctValues } from '@/modules/curto-prazo/sheet-view';
import {
  companyKey,
  dayMonth,
  hasCompanyFilter,
  isWeekly,
  matchesCompany,
  monthOf,
  pct,
  plural,
  weekNumberOf,
  type DashboardFilters,
  type DashboardReference,
  type KpiCard,
  type PanelSummary,
} from '@/modules/dashboard/model';
import type { DashboardPeriod, DashboardScale, PeriodBucket, PeriodGrouping } from '@/modules/dashboard/period';
import type { BucketPpc, ShortTermPeriodView } from '@/modules/dashboard/period-views';
import { formatDate } from '@/shared/format';

/** Quadro do curto prazo na aba 0 (04/11/2026, regra 5 do modelo aprovado): o painel do fechamento da
 * semana analisada (PPC, série, causas, Pareto, posição no ranking) mais o histórico desde a semana 1,
 * por mês e por ano. Nada aqui recalcula o que `closingDashboard` já entrega: o quadro diz os mesmos
 * números da primeira página do PDF do fechamento para a mesma semana. Tudo puro.
 *
 * Escalas de tempo (04/11/2026, modelo "Dashboard geral e escalas de tempo", regras 5 a 9): além do painel da
 * semana, o quadro calcula sempre o período (`period`): PPC do período somando as linhas das semanas apuradas,
 * o anterior, a série por balde e as causas das semanas do período. Na escala semanal a tela e o resumo
 * continuam no painel do fechamento; nas demais, usam o período. O Dashboard geral usa `bucketPpc` e
 * `periodCompanies` para comparar as obras. */

export interface MonthPpc {
  /** "AAAA-MM". */
  month: string;
  /** Cumpridos ÷ assumidos das semanas apuradas do mês; ausente só se o mês não tiver semana apurada. */
  percent?: number;
  /** Semanas apuradas no mês. */
  weeks: number;
  planned: number;
  fulfilled: number;
}
export interface YearPpc {
  year: string;
  percent?: number;
  weeks: number;
}
export interface ShortTermHistory {
  /** Só os meses com alguma semana apurada, do mais antigo ao mais recente. */
  months: MonthPpc[];
  /** Todos os anos do primeiro mês ao da semana analisada; ano sem semana apurada fica com `percent` ausente. */
  years: YearPpc[];
  /** PPC geral desde a semana 1: cumpridos ÷ assumidos das semanas apuradas. */
  overall?: number;
  planned: number;
  fulfilled: number;
  closedWeeks: number;
  /** Semanas com alguma linha até a analisada, apuradas ou não. */
  totalWeeks: number;
  /** Linhas até a semana analisada, inclusive as em aberto. */
  commitments: number;
  /** Linhas com Não, e quantas delas com causa apontada. */
  failures: number;
  failuresWithCause: number;
  /** Melhor e pior mês; empate vai para o mais recente. */
  best?: MonthPpc;
  worst?: MonthPpc;
  /** A primeira semana com linha (no recorte, quando há). */
  firstWeek: string;
}
export interface ShortTermPanelData {
  /** O painel que o quadro mostra: a obra inteira ou, com recorte de empreiteiro, as linhas recortadas
   * (série, média, causas da semana, Pareto). Ranking, posição, média das obras e PPC geral vêm sempre
   * de `whole`, para a comparação com as outras obras nunca seguir o recorte. */
  closing: ClosingDashboard;
  /** Sempre a obra inteira. */
  whole: ClosingDashboard;
  companyFiltered: boolean;
  weekNumber: number;
  /** Número da semana a partir da semana 1 da obra. */
  label: (weekStart: string) => number;
  history: ShortTermHistory;
  /** O curto prazo no período analisado (regras 7 a 9), calculado em toda escala, das linhas já recortadas
   * por empreiteiro. Na semanal, o período é a própria semana e a série são as 12 semanas do calendário
   * (com as semanas sem linha), diferente de `closing.series`, que pula as semanas vazias. */
  period: ShortTermPeriodView;
  /** O período analisado, para o componente escrever títulos e rótulos sem receber a referência. */
  periodInfo: ShortTermPeriodInfo;
}

export interface ShortTermPeriodInfo {
  scale: DashboardScale;
  /** Agrupamento da série (a própria escala; no personalizado, o escolhido ou o automático). */
  grouping: PeriodGrouping;
  /** "outubro de 2026" / "out/26"; "do mês". */
  label: string;
  short: string;
  of: string;
  start: LocalDate;
  end: LocalDate;
  /** O período contém a semana atual. */
  partial: boolean;
  /** Semanas do período até a atual, e quantas ele tem no calendário inteiro. */
  weeks: number;
  nominalWeeks: number;
  /** O balde da série que é o próprio período (a faixa âmbar); ausente no personalizado, cuja série é o
   * próprio período dividido. */
  analyzedKey?: string;
}

export interface ShortTermPanelInput {
  commitments: WeeklyCommitment[];
  teams: Team[];
  work: Pick<Work, 'id' | 'name' | 'code'>;
  /** Ausente: a rota do ranking não respondeu. */
  ranking?: ClosingRankingResponse;
}

/** `undefined` quando a obra não tem linha até a semana analisada: o módulo some da página. Com recorte de
 * empreiteiro que não deixa linha nenhuma, o quadro fica, vazio, porque o dado existe e o recorte é da pessoa. */
export function buildShortTermPanel(
  input: ShortTermPanelInput,
  ref: DashboardReference,
  filters: DashboardFilters,
): ShortTermPanelData | undefined {
  const upTo = input.commitments.filter(c => c.workId === input.work.id && c.weekStart <= ref.week);
  if (!upTo.length) return undefined;
  const whole = closingDashboard(upTo, input.work, ref.week, input.ranking);
  const companyFiltered = hasCompanyFilter(filters);
  const rows = companyFiltered ? upTo.filter(row => matchesCompany(filters, commitmentCompany(row, input.teams))) : upTo;
  // Sem ranking na chamada recortada: a posição vem da obra inteira, calculada uma vez só.
  const cut = companyFiltered ? closingDashboard(rows, input.work, ref.week, undefined) : whole;
  const closing: ClosingDashboard = companyFiltered
    ? { ...cut, overall: whole.overall, ranking: whole.ranking, position: whole.position, ranked: whole.ranked, mean: whole.mean }
    : whole;
  const label = (weekStart: string) => weekNumberOf(ref, weekStart);
  return {
    closing,
    whole,
    companyFiltered,
    weekNumber: label(ref.week),
    label,
    history: buildHistory(rows, ref.week, whole.series[0]?.weekStart ?? ref.week),
    period: buildPeriodView(rows, ref.period),
    periodInfo: periodInfoOf(ref.period),
  };
}

// ─── Período (escalas de tempo, regras 5 a 9) ──────────────────────────────────────────────────────────

/** O que identifica um balde: o período, o anterior ou uma coluna da série. */
export type BucketShape = Pick<PeriodBucket, 'key' | 'label' | 'short' | 'start' | 'end' | 'weeks'>;

/** Soma as semanas de um balde (regra 7): a semana apurada (todas as linhas com Status, a regra de `ppcSeries`
 * com `pending === 0`) entra em cumpridos ÷ assumidos somando linhas; a semana em aberto fica fora e só conta
 * em `openWeeks`/`pending`. Semana sem linha não conta em nada. */
function bucketFromPoints(points: readonly WeekPpc[], bucket: BucketShape): BucketPpc {
  let planned = 0,
    fulfilled = 0,
    closedWeeks = 0,
    openWeeks = 0,
    pending = 0;
  for (const point of points) {
    if (point.pending === 0) {
      closedWeeks += 1;
      planned += point.planned;
      fulfilled += point.fulfilled;
    } else {
      openWeeks += 1;
      pending += point.pending;
    }
  }
  const percent = ratio(fulfilled, planned);
  return {
    key: bucket.key,
    label: bucket.label,
    short: bucket.short,
    start: bucket.start,
    end: bucket.end,
    planned,
    fulfilled,
    closedWeeks,
    openWeeks,
    pending,
    ...(percent === undefined ? {} : { percent }),
  };
}

/** O PPC de um balde a partir das linhas (de uma obra, já recortadas se for o caso): só as semanas do balde
 * entram, cada uma apurada ou em aberto pelas próprias linhas. */
export function bucketPpc(rows: readonly WeeklyCommitment[], bucket: BucketShape): BucketPpc {
  const weeks = new Set(bucket.weeks);
  return bucketFromPoints(ppcSeries(rows.filter(row => weeks.has(row.weekStart))), bucket);
}

/** O curto prazo no período (regras 7 a 9), das linhas já recortadas e já cortadas na última semana do
 * período. A média da série continua sendo média simples dos baldes com PPC (regra 8). As causas são as das
 * linhas com Não de todas as semanas do período, inclusive as em aberto, como as causas da semana do painel. */
export function buildPeriodView(rows: readonly WeeklyCommitment[], period: DashboardPeriod): ShortTermPeriodView {
  const byWeek = new Map(ppcSeries(rows.filter(row => row.weekStart <= period.lastWeek)).map(point => [point.weekStart, point]));
  const of = (bucket: BucketShape) =>
    bucketFromPoints(
      bucket.weeks.flatMap(week => byWeek.get(week) ?? []),
      bucket,
    );
  const series = period.series.map(of);
  const withPpc = series.filter(bucket => bucket.percent !== undefined);
  const weeks = new Set(period.weeks);
  const inPeriod = rows.filter(row => weeks.has(row.weekStart));
  const failures = inPeriod.filter(row => row.fulfilled === false);
  return {
    current: of(period),
    ...(period.previous ? { previous: of(period.previous) } : {}),
    series,
    ...(withPpc.length ? { average: withPpc.reduce((sum, bucket) => sum + bucket.percent!, 0) / withPpc.length } : {}),
    closedInSeries: withPpc.length,
    causes: causePareto(inPeriod),
    failures: failures.length,
    uncaused: failures.filter(row => !row.cause).length,
  };
}

function periodInfoOf(period: DashboardPeriod): ShortTermPeriodInfo {
  return {
    scale: period.scale,
    grouping: period.grouping,
    label: period.label,
    short: period.short,
    of: period.of,
    start: period.start,
    end: period.end,
    partial: period.partial,
    weeks: period.weeks.length,
    nominalWeeks: period.nominalWeeks,
    ...(period.scale === 'personalizado' ? {} : { analyzedKey: period.key }),
  };
}

/** Diferença em p.p. entre o PPC do período e o do anterior, sobre os valores já arredondados (o cartão, a
 * frase e o quadro dizem o mesmo número); ausente se um dos dois não tem semana apurada. */
export function periodDelta(view: Pick<ShortTermPeriodView, 'current' | 'previous'>): number | undefined {
  const current = view.current.percent;
  const previous = view.previous?.percent;
  return current === undefined || previous === undefined ? undefined : Math.round(current) - Math.round(previous);
}

/** As linhas das semanas apuradas do período agrupadas pela empresa (coluna Empresa), para o Dashboard geral
 * comparar empreiteiros entre obras. A apuração da semana é pela obra inteira (todas as linhas da semana em
 * `rows` com Status), não pela empresa: uma semana em aberto sai inteira. Grafias equivalentes somam numa
 * empresa só, com a grafia mais frequente como `name` (empate: a primeira em ordem alfabética); a linha sem
 * empresa fica de fora. Da empresa com mais linhas para a com menos. */
export function periodCompanies(
  rows: WeeklyCommitment[],
  teams: Team[],
  weeks: readonly string[],
): { name: string; key: string; planned: number; fulfilled: number }[] {
  const wanted = new Set(weeks);
  const inWeeks = rows.filter(row => wanted.has(row.weekStart));
  const closed = new Set(ppcSeries(inWeeks).flatMap(point => (point.pending === 0 ? [point.weekStart] : [])));
  const byKey = new Map<string, { key: string; planned: number; fulfilled: number; spellings: Map<string, number> }>();
  for (const row of inWeeks) {
    if (!closed.has(row.weekStart)) continue;
    const company = commitmentCompany(row, teams);
    const key = companyKey(company);
    if (!key) continue;
    const item = byKey.get(key) ?? { key, planned: 0, fulfilled: 0, spellings: new Map<string, number>() };
    item.planned += 1;
    if (row.fulfilled === true) item.fulfilled += 1;
    item.spellings.set(company, (item.spellings.get(company) ?? 0) + 1);
    byKey.set(key, item);
  }
  return [...byKey.values()]
    .map(item => {
      const [name] = [...item.spellings].sort(([a, countA], [b, countB]) => countB - countA || compareText(a, b))[0];
      return { name, key: item.key, planned: item.planned, fulfilled: item.fulfilled };
    })
    .sort((a, b) => b.planned - a.planned || compareText(a.name, b.name));
}

const yearOf = (month: string) => month.slice(0, 4);
const ratio = (fulfilled: number, planned: number) => (planned > 0 ? (fulfilled / planned) * 100 : undefined);

/** O histórico desde a semana 1, a partir das linhas já recortadas e já cortadas na semana analisada. A semana
 * em aberto não entra em nenhuma soma (como no PPC geral), mas conta em `totalWeeks` e em `commitments`. */
export function buildHistory(rows: readonly WeeklyCommitment[], week: string, fallbackFirstWeek: string): ShortTermHistory {
  const series = ppcSeries(rows.filter(row => row.weekStart <= week));
  const closed = series.filter(point => point.pending === 0);
  const byMonth = new Map<string, MonthPpc>();
  for (const point of closed) {
    const month = monthOf(point.weekStart);
    const item = byMonth.get(month) ?? { month, weeks: 0, planned: 0, fulfilled: 0 };
    item.weeks += 1;
    item.planned += point.planned;
    item.fulfilled += point.fulfilled;
    byMonth.set(month, item);
  }
  const months = [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(item => ({ ...item, percent: ratio(item.fulfilled, item.planned) }));

  const firstWeek = series[0]?.weekStart ?? fallbackFirstWeek;
  const years: YearPpc[] = [];
  for (let year = Number(yearOf(firstWeek)); year <= Number(yearOf(week)); year++) {
    const own = months.filter(item => yearOf(item.month) === String(year));
    const planned = own.reduce((sum, item) => sum + item.planned, 0);
    const fulfilled = own.reduce((sum, item) => sum + item.fulfilled, 0);
    years.push({ year: String(year), percent: ratio(fulfilled, planned), weeks: own.reduce((sum, item) => sum + item.weeks, 0) });
  }

  const planned = closed.reduce((sum, point) => sum + point.planned, 0);
  const fulfilled = closed.reduce((sum, point) => sum + point.fulfilled, 0);
  const failures = rows.filter(row => row.weekStart <= week && row.fulfilled === false);
  // Empate no mais recente: `>=`/`<=` percorrendo do mais antigo ao mais novo deixa o último ganhar.
  let best: MonthPpc | undefined, worst: MonthPpc | undefined;
  for (const item of months) {
    if (item.percent === undefined) continue;
    if (!best || item.percent >= best.percent!) best = item;
    if (!worst || item.percent <= worst.percent!) worst = item;
  }
  return {
    months,
    years,
    overall: ratio(fulfilled, planned),
    planned,
    fulfilled,
    closedWeeks: closed.length,
    totalWeeks: series.length,
    commitments: rows.filter(row => row.weekStart <= week).length,
    failures: failures.length,
    failuresWithCause: failures.filter(row => !!row.cause).length,
    best,
    worst,
    firstWeek,
  };
}

/** O cartão do resumo (o principal da página, quando o curto prazo está presente) e a frase do topo. O selo
 * é o mesmo do painel do PDF do fechamento: em aberto, acima da média, abaixo da média ou na média. */
export function shortTermSummary(data: ShortTermPanelData, ref: DashboardReference): PanelSummary {
  if (!isWeekly(ref)) return periodSummary(data, ref);
  const d = data.closing;
  const c = d.current;
  const n = weekNumberOf(ref, d.week);
  const comparable = d.average !== undefined && d.closedInSeries >= 2;
  const versusAverage = c && comparable ? Math.round(c.percent) - Math.round(d.average!) : undefined;
  const tag: KpiCard['tag'] = !c
    ? undefined
    : c.pending > 0
      ? { text: `em aberto · ${c.pending} sem Status`, tone: 'warn' }
      : versusAverage === undefined
        ? undefined
        : versusAverage > 0
          ? { text: 'acima da média', tone: 'good' }
          : versusAverage < 0
            ? { text: 'abaixo da média', tone: 'neutral' }
            : { text: 'na média', tone: 'neutral' };
  const delta = c && d.previous ? Math.round(c.percent) - Math.round(d.previous.percent) : undefined;
  const previous = d.previous && data.label(d.previous.weekStart);
  const hint = !c
    ? 'Semana sem compromissos'
    : [
        `${c.fulfilled} de ${plural(c.planned, 'compromisso cumprido', 'compromissos cumpridos')}`,
        delta === undefined
          ? ''
          : delta === 0
            ? `igual à semana ${previous}`
            : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} p.p. vs semana ${previous}`,
      ]
        .filter(Boolean)
        .join(' · ');
  return {
    kpi: { module: 'curto-prazo', label: `PPC da semana ${n}`, value: c ? pct(c.percent) : '—', tag, hint, main: true },
    sentence: withOverall(closingSummary(d, data.label), data),
  };
}

const RANKING_LEAD = ' No PPC geral, a obra está em ';

/** "Mês sem compromissos". */
const SCALE_NOUN: Record<DashboardScale, string> = {
  semana: 'Semana',
  mes: 'Mês',
  trimestre: 'Trimestre',
  ano: 'Ano',
  personalizado: 'Período',
};
export const periodNoun = (scale: DashboardScale) => SCALE_NOUN[scale];

/** O cartão e a frase fora da escala semanal (regras 6 e 7): o PPC do período somando as linhas das semanas
 * apuradas, comparado com o anterior; período parcial ou com semana em aberto ganha o selo "parcial". Compara
 * os valores já arredondados, para a frase nunca contradizer o cartão. */
function periodSummary(data: ShortTermPanelData, ref: DashboardReference): PanelSummary {
  const view = data.period;
  const c = view.current;
  const period = ref.period;
  const value = c.percent === undefined ? undefined : Math.round(c.percent);
  const delta = periodDelta(view);
  const comparable = view.average !== undefined && view.closedInSeries >= 2;
  const versusAverage = value !== undefined && comparable ? value - Math.round(view.average!) : undefined;
  const tag: KpiCard['tag'] =
    period.partial || c.openWeeks > 0
      ? { text: `parcial · ${c.closedWeeks} de ${plural(period.nominalWeeks, 'semana apurada', 'semanas apuradas')}`, tone: 'warn' }
      : versusAverage === undefined
        ? undefined
        : versusAverage > 0
          ? { text: 'acima da média', tone: 'good' }
          : versusAverage < 0
            ? { text: 'abaixo da média', tone: 'neutral' }
            : { text: 'na média', tone: 'neutral' };
  const custom = period.scale === 'personalizado';
  const versus =
    delta === undefined || !view.previous
      ? ''
      : delta === 0
        ? custom
          ? 'igual ao período anterior'
          : `igual a ${view.previous.short}`
        : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} p.p. vs ${custom ? 'período anterior' : view.previous.short}`;
  const hint = c.closedWeeks
    ? [`${c.fulfilled} de ${plural(c.planned, 'compromisso', 'compromissos')}`, versus].filter(Boolean).join(' · ')
    : c.openWeeks
      ? `Nenhuma semana apurada · ${plural(c.pending, 'linha sem Status', 'linhas sem Status')}`
      : `${periodNoun(period.scale)} sem compromissos`;
  return {
    kpi: {
      module: 'curto-prazo',
      label: `PPC ${period.of}`,
      value: value === undefined ? '—' : `${value}%`,
      ...(tag ? { tag } : {}),
      hint,
      main: true,
    },
    sentence: withOverall(periodSentence(data, ref), data),
  };
}

/** "Em outubro de 2026", "No 4º trimestre de 2026 (out–dez)", "Em 2026", "De 01/06 a 31/10/2026". */
function periodIntro(period: DashboardPeriod): string {
  switch (period.scale) {
    case 'semana':
      return `Na semana de ${period.label}`;
    case 'mes':
    case 'ano':
      return `Em ${period.label}`;
    case 'trimestre':
      return `No ${period.label}`;
    case 'personalizado':
      return period.start.slice(0, 4) === period.end.slice(0, 4)
        ? `De ${dayMonth(period.start)} a ${formatDate(period.end)}`
        : `De ${formatDate(period.start)} a ${formatDate(period.end)}`;
  }
}

const CONTRACTION = {
  de: { '': 'de', o: 'do', a: 'da', as: 'das' },
  a: { '': 'a', o: 'ao', a: 'à', as: 'às' },
} as const;

/** O período anterior na frase, já com a preposição: "de setembro", "do 3º trimestre", "de 2025", "das 22
 * semanas anteriores"; o ano só aparece quando muda. */
function previousName(period: DashboardPeriod, preposition: 'de' | 'a'): string {
  const previous = period.previous!;
  const sameYear = previous.key.slice(0, 4) === period.key.slice(0, 4);
  const [article, name]: [keyof (typeof CONTRACTION)['de'], string] =
    period.scale === 'mes'
      ? ['', sameYear ? previous.label.replace(/ de \d{4}$/, '') : previous.label]
      : period.scale === 'trimestre'
        ? ['o', `${previous.key.slice(-1)}º trimestre${sameYear ? '' : ` de ${previous.key.slice(0, 4)}`}`]
        : period.scale === 'ano'
          ? ['', previous.label]
          : period.scale === 'semana'
            ? ['a', 'semana anterior']
            : previous.weeks.length === 1
              ? ['a', 'semana anterior']
              : ['as', `${previous.weeks.length} semanas anteriores`];
  return `${CONTRACTION[preposition][article]} ${name}`;
}

/** "Em outubro de 2026 a obra cumpriu 78% do que assumiu (312 de 400 compromissos em 4 semanas apuradas),
 * 3 p.p. acima de setembro." Depois, como na escala semanal, a posição no ranking (sempre da obra inteira),
 * que `withOverall` completa com o PPC geral desde a semana 1. */
function periodSentence(data: ShortTermPanelData, ref: DashboardReference): Segment[] {
  const out: Segment[] = [];
  const say = (text: string, strong = false) => out.push(strong ? { text, strong } : { text });
  const period = ref.period;
  const c = data.period.current;
  const intro = periodIntro(period);
  if (!c.closedWeeks) {
    say(
      c.openWeeks
        ? `${intro} ainda não há semana apurada: ${plural(c.openWeeks, 'semana está', 'semanas estão')} em aberto, com ${plural(c.pending, 'linha', 'linhas')} sem Status.`
        : `${intro} não há compromissos registrados.`,
    );
  } else {
    say(`${intro}${period.partial ? ', até agora,' : ''} ${data.companyFiltered ? 'o recorte de empreiteiro' : 'a obra'} cumpriu `);
    say(pct(c.percent!), true);
    const open = c.openWeeks ? `; ${plural(c.openWeeks, 'semana em aberto fica', 'semanas em aberto ficam')} fora` : '';
    say(
      ` do que assumiu (${c.fulfilled} de ${plural(c.planned, 'compromisso', 'compromissos')} em ${plural(c.closedWeeks, 'semana apurada', 'semanas apuradas')}${open})`,
    );
    const delta = periodDelta(data.period);
    if (delta !== undefined && period.previous)
      say(
        delta === 0
          ? `, igual ${previousName(period, 'a')}`
          : `, ${Math.abs(delta)} p.p. ${delta > 0 ? 'acima' : 'abaixo'} ${previousName(period, 'de')}`,
      );
    say('.');
  }
  const d = data.closing;
  if (d.ranking) {
    if (d.position !== undefined && d.ranked >= 2) {
      say(RANKING_LEAD);
      say(`${d.position}º lugar entre ${d.ranked} obras`, true);
      say('.');
    } else if (d.position === undefined)
      say(` Com menos de ${MIN_RANKED_WEEKS} semanas apuradas, a obra ainda não tem posição no ranking.`);
  }
  return out;
}

/** Acrescenta o PPC geral desde a semana 1 à frase do fechamento. Com posição no ranking, entra entre
 * parênteses no mesmo trecho; sem ranking (ou sem posição), vira uma frase ao fim, para não repetir nada. */
function withOverall(sentence: Segment[], data: ShortTermPanelData): Segment[] {
  const overall = data.whole.overall;
  if (overall.percent === undefined) return sentence;
  const weeks = plural(overall.closedWeeks, 'semana apurada', 'semanas apuradas');
  // Com recorte, o PPC da semana é do empreiteiro e o ranking é da obra: a frase diz de quem é cada número.
  const scope = data.companyFiltered ? ', obra inteira' : '';
  const at = sentence.findIndex(segment => segment.text === RANKING_LEAD);
  if (at >= 0)
    return sentence.map((segment, index) =>
      index === at ? { text: ` No PPC geral desde a semana 1 (${pct(overall.percent!)} em ${weeks}${scope}), a obra está em ` } : segment,
    );
  return [
    ...sentence,
    { text: ` Desde a semana 1, o PPC geral da obra${data.companyFiltered ? ' inteira' : ''} é de ` },
    { text: pct(overall.percent), strong: true },
    { text: ` em ${weeks}.` },
  ];
}

const listText = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

/** "Em 2026 o PPC geral é de 75%, contra 74% em 2025 e 66% em 2024." Anos sem semana apurada ficam de fora. */
export function yearsSentence(years: readonly YearPpc[]): string {
  const known = years.filter(item => item.percent !== undefined);
  const last = known.at(-1);
  if (!last) return '';
  const rest = known.slice(0, -1).reverse();
  const head = `Em ${last.year} o PPC geral é de ${pct(last.percent!)}`;
  return rest.length ? `${head}, contra ${listText(rest.map(item => `${pct(item.percent!)} em ${item.year}`))}.` : `${head}.`;
}

/** Os empreiteiros do seletor da tela, com a contagem de linhas. Grafias equivalentes ("Hidrotec" e
 * "HIDROTEC") viram uma opção só, com a grafia mais frequente, porque o recorte compara por `companyKey`;
 * a linha sem empreiteiro fica de fora, já que o recorte nunca a alcança. */
export function shortTermCompanies(commitments: WeeklyCommitment[], teams: Team[]): { value: string; count: number }[] {
  const merged = new Map<string, { value: string; count: number }>();
  for (const item of distinctValues(commitments, row => commitmentCompany(row, teams))) {
    const key = companyKey(item.value);
    if (!key) continue;
    const known = merged.get(key);
    if (!known) merged.set(key, { ...item });
    else {
      if (item.count > known.count) known.value = item.value;
      known.count += item.count;
    }
  }
  return [...merged.values()].sort((a, b) => compareText(a.value, b.value));
}

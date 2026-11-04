import type { Team, WeeklyCommitment, Work } from '@/domain/entities';
import type { ClosingRankingResponse } from '@/domain/closing-ranking';
import { ppcSeries } from '@/domain/rules';
import { closingDashboard, closingSummary, type ClosingDashboard, type Segment } from '@/modules/curto-prazo/closing-dashboard';
import { commitmentCompany } from '@/modules/curto-prazo/justifications';
import { compareText, distinctValues } from '@/modules/curto-prazo/sheet-view';
import {
  companyKey,
  hasCompanyFilter,
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

/** Quadro do curto prazo na aba 0 (04/11/2026, regra 5 do modelo aprovado): o painel do fechamento da
 * semana analisada (PPC, série, causas, Pareto, posição no ranking) mais o histórico desde a semana 1,
 * por mês e por ano. Nada aqui recalcula o que `closingDashboard` já entrega: o quadro diz os mesmos
 * números da primeira página do PDF do fechamento para a mesma semana. Tudo puro. */

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
  };
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

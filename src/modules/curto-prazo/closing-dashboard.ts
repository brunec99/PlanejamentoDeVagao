import type { WeeklyCommitment, Work } from '@/domain/entities';
import { causePareto, ppcSeries, type CauseTally, type WeekPpc } from '@/domain/rules';
import {
  MIN_RANKED_WEEKS,
  rankingMean,
  withLocalWork,
  workPpc,
  type ClosingRankingResponse,
  type OverallPpc,
  type RankingEntry,
} from '@/domain/closing-ranking';

/** Painel da primeira página do PDF do fechamento (30/10/2026, modelo aprovado pelo usuário): o PPC da
 * semana contra as anteriores, o PPC geral da obra contra as outras obras e as principais causas.
 * Tudo puro e determinístico, a partir das linhas da obra (as mesmas da planilha) e do ranking que a
 * rota `/api/curto-prazo/ranking` devolve. Nada aqui olha para semanas depois da analisada. */

export const SERIES_WEEKS = 12;
/** O mesmo limite do cartão "PPC médio das semanas apuradas" da tela Fechamento. */
export const AVERAGE_ALERT = 70;

export interface ClosingDashboard {
  week: string;
  /** A semana analisada; ausente quando ela não tem linha. */
  current?: WeekPpc;
  /** A última semana apurada antes da analisada. */
  previous?: WeekPpc;
  /** Até 12 semanas com linha, terminando na analisada. */
  series: WeekPpc[];
  /** Média simples dos PPCs das semanas apuradas da série, como na tela Fechamento. */
  average?: number;
  closedInSeries: number;
  overall: OverallPpc;
  /** Linhas com Não na semana analisada, e quantas delas ainda sem causa. */
  failures: number;
  uncaused: number;
  weekCauses: CauseTally[];
  /** O Pareto da obra até a semana analisada. */
  pareto: CauseTally[];
  /** Ausente: o ranking não veio do servidor. */
  ranking?: RankingEntry[];
  position?: number;
  /** Obras com posição no ranking. */
  ranked: number;
  mean?: number;
}

export function closingDashboard(
  commitments: readonly WeeklyCommitment[],
  work: Pick<Work, 'id' | 'name' | 'code'>,
  week: string,
  ranking: ClosingRankingResponse | undefined,
): ClosingDashboard {
  const upTo = commitments.filter(c => c.workId === work.id && c.weekStart <= week);
  const weekRows = upTo.filter(c => c.weekStart === week);
  const all = ppcSeries(upTo);
  const series = all.slice(-SERIES_WEEKS);
  const closed = series.filter(point => point.pending === 0);
  const previous = all.filter(point => point.weekStart < week && point.pending === 0).at(-1);
  const failures = weekRows.filter(c => c.fulfilled === false);
  const entries = ranking?.available
    ? withLocalWork(ranking.entries, { workId: work.id, name: work.name, code: work.code }, workPpc(upTo, week))
    : undefined;
  const own = entries?.find(entry => entry.workId === work.id);
  return {
    week,
    current: all.find(point => point.weekStart === week),
    previous,
    series,
    average: closed.length ? closed.reduce((sum, point) => sum + point.percent, 0) / closed.length : undefined,
    closedInSeries: closed.length,
    overall: workPpc(upTo, week).overall,
    failures: failures.length,
    uncaused: failures.filter(c => !c.cause).length,
    weekCauses: causePareto(weekRows),
    pareto: causePareto(upTo),
    ranking: entries,
    position: own?.position,
    ranked: entries?.filter(entry => entry.position !== undefined).length ?? 0,
    mean: entries && rankingMean(entries),
  };
}

const round = Math.round;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const listText = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

export interface Segment {
  text: string;
  strong?: boolean;
}

/** A frase do topo do painel, em trechos (os destaques vão em negrito no PDF). Compara os valores já
 * arredondados, para a frase nunca contradizer os números dos cartões. */
export function closingSummary(d: ClosingDashboard, label: (weekStart: string) => number): Segment[] {
  const out: Segment[] = [];
  const say = (text: string, strong = false) => out.push(strong ? { text, strong } : { text });
  const n = label(d.week);
  const c = d.current;
  if (!c) say(`A semana ${n} não tem compromissos registrados.`);
  else if (c.pending > 0) {
    say(`A semana ${n} ainda está em aberto, com ${plural(c.pending, 'linha', 'linhas')} sem Status: o `);
    say(`PPC provisório é de ${round(c.percent)}%`, true);
    say('.');
  } else {
    say(`A semana ${n} fechou com `);
    say(`PPC de ${round(c.percent)}%`, true);
    const parts: string[] = [];
    let unit = false;
    const compare = (diff: number, what: string, same: string) => {
      if (diff === 0) return same;
      const text = `${Math.abs(diff)}${unit ? '' : Math.abs(diff) === 1 ? ' ponto' : ' pontos'} ${diff > 0 ? 'acima' : 'abaixo'} ${what}`;
      unit = true;
      return text;
    };
    if (d.previous) {
      const previous = label(d.previous.weekStart);
      parts.push(compare(round(c.percent) - round(d.previous.percent), `da semana ${previous}`, `igual à semana ${previous}`));
    }
    if (d.average !== undefined && d.closedInSeries >= 2)
      parts.push(
        compare(
          round(c.percent) - round(d.average),
          `da média das últimas ${SERIES_WEEKS} semanas`,
          `na média das últimas ${SERIES_WEEKS} semanas`,
        ),
      );
    say(parts.length ? `: ${parts.join(' e ')}.` : '.');
  }

  if (d.ranking) {
    if (d.position !== undefined && d.ranked >= 2) {
      say(' No PPC geral, a obra está em ');
      say(`${d.position}º lugar entre ${d.ranked} obras`, true);
      say('.');
    } else if (d.position === undefined)
      say(` Com menos de ${MIN_RANKED_WEEKS} semanas apuradas, a obra ainda não tem posição no ranking.`);
  }

  if (!c) return out;
  if (!d.failures) {
    if (!c.pending) say(' Nenhum compromisso deixou de ser cumprido.');
    return out;
  }
  if (!d.weekCauses.length) {
    say(
      d.failures === 1
        ? ' A falha da semana ainda está sem causa apontada.'
        : ` As ${d.failures} falhas da semana ainda estão sem causa apontada.`,
    );
    return out;
  }
  const top = d.weekCauses[0].total;
  const leaders = d.weekCauses.filter(item => item.total === top).map(item => item.cause);
  const first = d.pareto[0]?.cause;
  if (leaders.length === 1) {
    say(' ');
    say(leaders[0], true);
    say(d.failures === 1 ? ' foi a causa da única falha da semana' : ` foi a principal causa da semana (${top} das ${d.failures} falhas)`);
    if (first === leaders[0]) say(' e é também a primeira no Pareto da obra.');
    else if (first) {
      say('; na obra, a primeira é ');
      say(first, true);
      say('.');
    } else say('.');
    return out;
  }
  say(' As principais causas da semana foram ');
  leaders.forEach((cause, index) => {
    if (index) say(index === leaders.length - 1 ? ' e ' : ', ');
    say(cause, true);
  });
  say(`, com ${plural(top, 'falha', 'falhas')} cada`);
  if (first && leaders.includes(first)) say(`; ${first} é também a primeira no Pareto da obra.`);
  else if (first) {
    say('; na obra, a primeira é ');
    say(first, true);
    say('.');
  } else say('.');
  return out;
}

/** As causas que somam os primeiros 80% das falhas, pela mesma regra do Pareto da tela Fechamento. */
export const vitalCauses = (tally: readonly CauseTally[]) => tally.findIndex(item => item.accumulated >= 80) + 1;

export function paretoCallout(tally: readonly CauseTally[]): Segment[] {
  const failures = tally.reduce((sum, item) => sum + item.total, 0);
  if (!tally.length) return [];
  if (tally.length === 1)
    return [{ text: `Todas as ${plural(failures, 'falha apurada', 'falhas apuradas')} na obra têm a mesma causa: ${tally[0].cause}.` }];
  const vital = vitalCauses(tally);
  if (vital === tally.length)
    return [{ text: `As ${tally.length} causas apontadas se dividem por ${failures} falhas na obra, sem concentração clara.` }];
  return [
    { text: `${vital} ${vital === 1 ? 'causa responde' : 'causas respondem'} por ${round(tally[vital - 1].accumulated)}%`, strong: true },
    { text: ` das ${failures} falhas apuradas na obra: ${listText(tally.slice(0, vital).map(item => item.cause))}.` },
  ];
}

export interface Remainder {
  causes: number;
  total: number;
  share: number;
}

/** Corta a lista para caber na folha: até `max` causas e, se sobrar mais de uma, uma linha "Outras". */
export function topCauses(tally: readonly CauseTally[], max: number): { rows: CauseTally[]; rest?: Remainder } {
  if (tally.length <= max + 1) return { rows: [...tally] };
  const rows = tally.slice(0, max);
  const left = tally.slice(max);
  const failures = tally.reduce((sum, item) => sum + item.total, 0);
  const total = left.reduce((sum, item) => sum + item.total, 0);
  return { rows, rest: { causes: left.length, total, share: (total / failures) * 100 } };
}

/** O ranking que cabe na folha: as primeiras obras e, se ela ficou de fora, a obra do PDF. */
export function visibleRanking(entries: readonly RankingEntry[], workId: string, max: number): { rows: RankingEntry[]; hidden: number } {
  if (entries.length <= max) return { rows: [...entries], hidden: 0 };
  const head = entries.slice(0, max - 1);
  const own = entries.find(entry => entry.workId === workId);
  const rows = own && !head.includes(own) ? [...head, own] : entries.slice(0, max);
  return { rows, hidden: entries.length - rows.length };
}

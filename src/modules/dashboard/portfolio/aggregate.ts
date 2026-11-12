import { textKey } from '@/modules/curto-prazo/sheet-view';
import { SAFETY_CONSEQUENCES } from '@/domain/safety';
import { dayMonth, pct, PORTFOLIO_MODULES, signedPoints, type KpiCard, type PortfolioModule, type Segment } from '../model';
import type { DashboardPeriod } from '../period';
import type { BucketPpc } from '../period-views';
import { cardOwnersOf, extraKpisOf, extraSentenceOf, extraTotalsOf, servicesOf } from './extras';
import type {
  PortfolioCompanies,
  PortfolioData,
  PortfolioHeat,
  PortfolioPareto,
  PortfolioResponsibles,
  PortfolioRow,
  PortfolioSafetyTypes,
  PortfolioTotals,
  PortfolioWork,
} from './types';

/** Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"): das linhas do
 * comparativo (uma por obra, de `extract.ts`) para tudo o que a tela e o PDF mostram. Regras do modelo que
 * este arquivo implementa:
 *
 * - Regra 7: o PPC do período e o consolidado são cumpridos ÷ assumidos das semanas apuradas, somando linhas
 *   (a obra com mais compromissos pesa mais); a seta compara com o período anterior sobre valores arredondados.
 * - Regra 10: uma linha por obra; a obra que só começa depois do período (primeira semana com linha depois de
 *   `period.lastWeek`) sai das linhas e vai para `notStarted`; a obra sem linha nenhuma no curto prazo fica
 *   (não há como saber quando ela começa).
 * - Regra 11: "em início" (menos de `MIN_RANKED_WEEKS` semanas apuradas até o fim do período) fica sem posição;
 *   a posição é pelo PPC do período entre as demais. Pareto somando as obras, com a obra que mais contribui;
 *   empresas com linhas em duas ou mais obras.
 * - Regra 12: os responsáveis terceiros com mais pendências em aberto, somando as obras.
 * - Regra 13: a frase e até seis cartões, só dos módulos que a pessoa pode abrir e não escondeu, com os números
 *   da frase iguais aos dos cartões já arredondados.
 * - Segurança do trabalho (modelo aprovado em 06/11/2026): os totais somando as obras, o 7º cartão
 *   (regra 8), o trecho da frase e os tipos com mais apontamentos no período (regra 7).
 *
 * Tudo puro e determinístico. */

export interface PortfolioAggregateInput {
  period: DashboardPeriod;
  /** Uma linha por obra escolhida, em qualquer ordem (inclusive as que só começam depois do período). */
  rows: readonly PortfolioRow[];
  /** Módulos que a pessoa pode abrir e não escondeu em "Quadros": os únicos com cartão e trecho na frase. */
  shown: ReadonlySet<PortfolioModule>;
}

/** Abaixo disto a obra entra em "Obras abaixo de 70%" e ganha o aviso (regra 11, a mesma faixa da aba 0). */
export const PPC_ALERT = 70;
/** Quantos responsáveis terceiros o quadro mostra. */
export const RESPONSIBLES_SHOWN = 6;
/** Quantos tipos de apontamento de segurança o quadro mostra (regra 7 da segurança). */
export const SAFETY_TYPES_SHOWN = 6;
/** Até quantos cartões o topo mostra: seis do modelo original, o da segurança (regra 8 da segurança) e, desde
 * 12/11/2026, "Efetivo médio" e "Cards vencidos" (regra 9 do modelo "Dashboards completos e resumo semanal"). */
export const KPIS_SHOWN = 9;
/** O Pareto marca as causas até somar este percentual (a convenção de `vitalCauses`). */
const VITAL_SHARE = 80;

const byName = (a: PortfolioWork, b: PortfolioWork) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
const ratio = (fulfilled: number, planned: number) => (planned > 0 ? (fulfilled / planned) * 100 : undefined);
const sum = <T>(items: readonly T[], value: (item: T) => number) => items.reduce((total, item) => total + value(item), 0);
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
/** "1.234": inteiro com separador de milhar, como a planilha. */
const int = (value: number) => integer.format(Math.round(value));
const plural = (count: number, one: string, many: string) => `${int(count)} ${count === 1 ? one : many}`;
const listText = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);
/** O PPC arredondado está abaixo de 70%? Sobre o valor arredondado, para "70%" nunca aparecer como abaixo. */
const belowAlert = (percent: number) => Math.round(percent) < PPC_ALERT;

// ─── Linhas e posições ──────────────────────────────────────────────────────────────────────────────────

/** Numera pelo PPC do período as obras com PPC e fora de "em início" (regra 11). Empate exato divide a
 * posição (1º, 2º, 2º, 4º), como o ranking do fechamento; dentro do empate, a ordem é a do nome. */
function withPositions(rows: PortfolioRow[]): PortfolioRow[] {
  const ranked = rows
    .filter(row => row.short && !row.short.early && row.short.current.percent !== undefined)
    .sort((a, b) => b.short!.current.percent! - a.short!.current.percent! || byName(a.work, b.work));
  const positions = new Map<string, number>();
  ranked.forEach((row, index) => {
    const previous = ranked[index - 1];
    const tied = previous && previous.short!.current.percent === row.short!.current.percent;
    positions.set(row.work.id, tied ? positions.get(previous.work.id)! : index + 1);
  });
  return rows.map(row => {
    if (!row.short) return row;
    const { position: _ignored, ...short } = row.short;
    const position = positions.get(row.work.id);
    return { ...row, short: position === undefined ? short : { ...short, position } };
  });
}

// ─── Totais ─────────────────────────────────────────────────────────────────────────────────────────────

function totalsOf(rows: readonly PortfolioRow[]): PortfolioTotals {
  const shorts = rows.flatMap(row => (row.short ? [{ work: row.work, short: row.short }] : []));
  const planned = sum(shorts, item => item.short.current.planned);
  const fulfilled = sum(shorts, item => item.short.current.fulfilled);
  const percent = ratio(fulfilled, planned);
  const previous = shorts.flatMap(item => (item.short.previous ? [item.short.previous] : []));
  const previousPercent = ratio(
    sum(previous, item => item.fulfilled),
    sum(previous, item => item.planned),
  );
  const withPpc = shorts.filter(item => item.short.current.percent !== undefined);
  const below70 = withPpc
    .filter(item => belowAlert(item.short.current.percent!))
    .sort((a, b) => a.short.current.percent! - b.short.current.percent! || byName(a.work, b.work))
    .map(item => item.work);
  const overallPercent = ratio(
    sum(shorts, item => item.short.overall.fulfilled),
    sum(shorts, item => item.short.overall.planned),
  );

  const measured = rows.flatMap(row => (row.longTerm?.delta !== undefined ? [{ work: row.work, delta: row.longTerm.delta }] : []));
  const worst = measured.reduce<{ work: PortfolioWork; delta: number } | undefined>(
    (lowest, item) => (!lowest || item.delta < lowest.delta ? item : lowest),
    undefined,
  );

  const wagons = rows.flatMap(row => (row.wagons ? [row.wagons] : []));
  const medium = rows.flatMap(row => (row.medium ? [row.medium] : []));
  const terminality = rows.flatMap(row => (row.terminality ? [row.terminality] : []));
  // Tempo médio das resolvidas no período somando as obras: cada obra pesa pelo número de resolvidas.
  const timed = terminality.filter(item => item.averageDaysToResolve !== undefined && item.resolved > 0);
  const resolvedTimed = sum(timed, item => item.resolved);
  const safety = rows.flatMap(row => (row.safety ? [row.safety] : []));
  // Média de dias para resolver da segurança somando as obras: cada obra pesa pelos finalizados no período.
  const safetyTimed = safety.filter(item => item.averageDaysToResolve !== undefined && item.resolved > 0);
  const safetyResolvedTimed = sum(safetyTimed, item => item.resolved);

  return {
    works: rows.length,
    short: {
      planned,
      fulfilled,
      ...(percent !== undefined ? { percent } : {}),
      ...(previousPercent !== undefined ? { previousPercent } : {}),
      ...(percent !== undefined && previousPercent !== undefined ? { delta: Math.round(percent) - Math.round(previousPercent) } : {}),
      withPpc: withPpc.length,
      below70,
      ...(overallPercent !== undefined ? { overallPercent } : {}),
    },
    longTerm: {
      withMeasurement: measured.length,
      behind: measured.filter(item => item.delta < 0).length,
      ...(worst ? { worst } : {}),
    },
    wagons: {
      works: wagons.length,
      taktOverdue: sum(wagons, item => item.taktOverdue),
      taktWorks: wagons.filter(item => item.taktOverdue > 0).length,
      restrictionsOverdue: sum(wagons, item => item.restrictionsOverdue),
      restrictionsWorks: wagons.filter(item => item.restrictionsOverdue > 0).length,
      restrictionsResolved: sum(wagons, item => item.restrictionsResolved),
    },
    medium: {
      works: medium.length,
      late: sum(medium, item => item.late),
      lateWorks: medium.filter(item => item.late > 0).length,
    },
    terminality: {
      works: terminality.length,
      open: sum(terminality, item => item.open),
      openAtStart: sum(terminality, item => item.openAtStart),
      opened: sum(terminality, item => item.opened),
      resolved: sum(terminality, item => item.resolved),
      ...(resolvedTimed ? { averageDaysToResolve: sum(timed, item => item.averageDaysToResolve! * item.resolved) / resolvedTimed } : {}),
    },
    safety: {
      works: safety.length,
      open: sum(safety, item => item.open),
      openAtStart: sum(safety, item => item.openAtStart),
      openOver7: sum(safety, item => item.openOver7),
      worksOver7: safety.filter(item => item.openOver7 > 0).length,
      opened: sum(safety, item => item.opened),
      resolved: sum(safety, item => item.resolved),
      ...(safetyResolvedTimed
        ? { averageDaysToResolve: sum(safetyTimed, item => item.averageDaysToResolve! * item.resolved) / safetyResolvedTimed }
        : {}),
      byConsequence: SAFETY_CONSEQUENCES.map((_, at) => sum(safety, item => item.byConsequence[at] ?? 0)),
    },
    ...extraTotalsOf(rows),
  };
}

// ─── Mapa de calor ──────────────────────────────────────────────────────────────────────────────────────

/** Obra × balde de `period.series` (só as obras com curto prazo), com a linha "Todas" somando linhas, coluna a
 * coluna. Célula ausente = a obra não tem linha naquele balde. A coluna em destaque (`analyzed`) é o próprio
 * período nas escalas fixas; no personalizado, nenhuma, como no modelo. */
function heatOf(rows: readonly PortfolioRow[], period: DashboardPeriod): PortfolioHeat {
  const buckets = period.series.map(bucket => ({
    key: bucket.key,
    label: bucket.label,
    short: bucket.short,
    analyzed: period.scale !== 'personalizado' && bucket.key === period.key,
  }));
  const heatRows = rows.flatMap(row => {
    if (!row.short) return [];
    const byKey = new Map(row.short.series.map(cell => [cell.key, cell]));
    const cells = buckets.map(bucket => {
      const cell = byKey.get(bucket.key);
      return cell && cell.closedWeeks + cell.openWeeks > 0 ? cell : undefined;
    });
    return [{ work: row.work, cells }];
  });
  const total = period.series.map((bucket, index): BucketPpc => {
    const cells = heatRows.flatMap(row => (row.cells[index] ? [row.cells[index]!] : []));
    const planned = sum(cells, cell => cell.planned);
    const fulfilled = sum(cells, cell => cell.fulfilled);
    const percent = ratio(fulfilled, planned);
    return {
      key: bucket.key,
      label: bucket.label,
      short: bucket.short,
      start: bucket.start,
      end: bucket.end,
      planned,
      fulfilled,
      // Semanas-obra: duas obras apuradas na mesma semana contam duas.
      closedWeeks: sum(cells, cell => cell.closedWeeks),
      openWeeks: sum(cells, cell => cell.openWeeks),
      pending: sum(cells, cell => cell.pending),
      ...(percent !== undefined ? { percent } : {}),
    };
  });
  return { buckets, rows: heatRows, total };
}

// ─── Pareto, empresas e responsáveis ────────────────────────────────────────────────────────────────────

/** As causas das linhas com Não no período, somando as obras, em ordem de peso (empate pelo nome, como
 * `causePareto`). `vital` marca as causas até a primeira que alcança 80% do acumulado, a convenção de
 * `vitalCauses`. A obra que mais contribui com cada causa: empate fica com a primeira pelo nome. */
function paretoOf(rows: readonly PortfolioRow[]): PortfolioPareto {
  const causes = new Map<string, { total: number; byWork: { work: PortfolioWork; total: number }[] }>();
  for (const row of rows) {
    for (const item of row.short?.causes ?? []) {
      if (!item.total) continue;
      const entry = causes.get(item.cause) ?? { total: 0, byWork: [] };
      entry.total += item.total;
      entry.byWork.push({ work: row.work, total: item.total });
      causes.set(item.cause, entry);
    }
  }
  const failures = sum([...causes.values()], entry => entry.total);
  if (!failures) return { failures: 0, rows: [] };
  const sorted = [...causes.entries()].sort(([nameA, a], [nameB, b]) => b.total - a.total || nameA.localeCompare(nameB, 'pt-BR'));
  let running = 0;
  const tallied = sorted.map(([cause, entry]) => {
    running += entry.total;
    const top = [...entry.byWork].sort((a, b) => b.total - a.total || byName(a.work, b.work))[0];
    return {
      cause,
      total: entry.total,
      share: (entry.total / failures) * 100,
      accumulated: (running / failures) * 100,
      top: { work: top.work, total: top.total, share: (top.total / entry.total) * 100 },
    };
  });
  const vital = tallied.findIndex(item => item.accumulated >= VITAL_SHARE) + 1;
  return { failures, rows: tallied.map((item, index) => ({ ...item, vital: index < vital })) };
}

/** Empresas com linhas apuradas em duas ou mais obras no período, pareadas pela chave sem acento nem caixa;
 * a grafia exibida é a de mais linhas somando as obras. Da empresa com mais linhas para a com menos. */
function companiesOf(rows: readonly PortfolioRow[]): PortfolioCompanies {
  const companies = new Map<
    string,
    { spellings: Map<string, number>; byWork: Record<string, { planned: number; fulfilled: number; percent?: number }> }
  >();
  for (const row of rows) {
    for (const company of row.short?.companies ?? []) {
      if (!company.key || company.planned <= 0) continue;
      const entry = companies.get(company.key) ?? { spellings: new Map<string, number>(), byWork: {} };
      entry.spellings.set(company.name, (entry.spellings.get(company.name) ?? 0) + company.planned);
      const own = entry.byWork[row.work.id] ?? { planned: 0, fulfilled: 0 };
      own.planned += company.planned;
      own.fulfilled += company.fulfilled;
      entry.byWork[row.work.id] = own;
      companies.set(company.key, entry);
    }
  }
  const list = [...companies.values()]
    .filter(entry => Object.keys(entry.byWork).length >= 2)
    .map(entry => {
      const byWork = Object.fromEntries(
        Object.entries(entry.byWork).map(([id, cell]) => {
          const percent = ratio(cell.fulfilled, cell.planned);
          return [id, { planned: cell.planned, fulfilled: cell.fulfilled, ...(percent !== undefined ? { percent } : {}) }];
        }),
      );
      const planned = sum(Object.values(byWork), cell => cell.planned);
      const fulfilled = sum(Object.values(byWork), cell => cell.fulfilled);
      const percent = ratio(fulfilled, planned);
      const [name] = [...entry.spellings].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b, 'pt-BR'))[0];
      return { name, total: { planned, fulfilled, ...(percent !== undefined ? { percent } : {}) }, byWork };
    })
    .sort((a, b) => b.total.planned - a.total.planned || a.name.localeCompare(b.name, 'pt-BR'));
  const works = rows.filter(row => list.some(entry => entry.byWork[row.work.id])).map(row => row.work);
  return { works, rows: list };
}

/** Os responsáveis terceiros com mais pendências em aberto no sábado final, somando as obras (regra 12),
 * pareados pelo nome sem acento nem caixa; "Sem responsável" soma num item só. Até `RESPONSIBLES_SHOWN`. */
function responsiblesOf(rows: readonly PortfolioRow[]): PortfolioResponsibles {
  const NONE = '\u0000';
  const entries = new Map<string, { spellings: Map<string, number>; none: boolean; byWork: { work: PortfolioWork; count: number }[] }>();
  for (const row of rows) {
    for (const item of row.terminality?.openByContractor ?? []) {
      if (item.count <= 0) continue;
      const key = item.none ? NONE : textKey(item.label);
      if (!key) continue;
      const entry = entries.get(key) ?? { spellings: new Map<string, number>(), none: !!item.none, byWork: [] };
      entry.spellings.set(item.label, (entry.spellings.get(item.label) ?? 0) + item.count);
      const own = entry.byWork.find(cell => cell.work.id === row.work.id);
      if (own) own.count += item.count;
      else entry.byWork.push({ work: row.work, count: item.count });
      entries.set(key, entry);
    }
  }
  const list = [...entries.values()]
    .map(entry => {
      const [label] = [...entry.spellings].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b, 'pt-BR'))[0];
      return {
        label,
        total: sum(entry.byWork, cell => cell.count),
        ...(entry.none ? { none: true } : {}),
        byWork: [...entry.byWork].sort((a, b) => b.count - a.count || byName(a.work, b.work)),
      };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, RESPONSIBLES_SHOWN);
  return { rows: list };
}

/** Os tipos com mais apontamentos feitos no período, somando as obras (regra 7 da segurança). A lista de tipos
 * é a mesma em todas as obras, então o tipo se pareia pelo id; "Sem tipo" soma num item só. Até
 * `SAFETY_TYPES_SHOWN`, do mais frequente ao menos (empate pelo nome). */
function safetyTypesOf(rows: readonly PortfolioRow[]): PortfolioSafetyTypes {
  const entries = new Map<string, { key: string; label: string; byWork: { work: PortfolioWork; count: number }[] }>();
  for (const row of rows) {
    for (const item of row.safety?.byType ?? []) {
      if (item.count <= 0) continue;
      const entry = entries.get(item.key) ?? { key: item.key, label: item.label, byWork: [] };
      entry.byWork.push({ work: row.work, count: item.count });
      entries.set(item.key, entry);
    }
  }
  const list = [...entries.values()]
    .map(entry => ({
      key: entry.key,
      label: entry.label,
      total: sum(entry.byWork, cell => cell.count),
      byWork: [...entry.byWork].sort((a, b) => b.count - a.count || byName(a.work, b.work)),
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, SAFETY_TYPES_SHOWN);
  return { rows: list };
}

function noDataOf(rows: readonly PortfolioRow[]): Record<PortfolioModule, PortfolioWork[]> {
  return Object.fromEntries(
    PORTFOLIO_MODULES.map(module => [module.id, rows.filter(row => row.status[module.id].kind === 'absent').map(row => row.work)]),
  ) as Record<PortfolioModule, PortfolioWork[]>;
}

// ─── Cartões (regra 13) ─────────────────────────────────────────────────────────────────────────────────

const deltaTag = (delta: number): NonNullable<KpiCard['tag']> => ({
  text: `${delta > 0 ? '▲' : delta < 0 ? '▼' : '='} ${Math.abs(delta)} p.p.`,
  tone: delta > 0 ? 'good' : delta < 0 ? 'bad' : 'neutral',
});
/** "na obra" / "nas 3 obras". */
const inWorks = (count: number) => (count === 1 ? 'na obra' : `nas ${int(count)} obras`);

/** Até sete cartões (`KPIS_SHOWN`), na ordem do modelo: PPC das obras (o principal), obras abaixo de 70%, atrás no
 * físico, takt vencido, restrições vencidas, pendências em aberto e, desde 06/11/2026, apontamentos de segurança
 * em aberto. Só módulos acessíveis e não escondidos; o do
 * curto prazo sai sempre que o módulo aparece (com "—" sem semana apurada), os demais só com alguma obra com
 * dado. Cada cartão diz quantas obras entram na conta; os retratos dizem o sábado final. */
function kpisOf(
  totals: PortfolioTotals,
  rows: readonly PortfolioRow[],
  period: DashboardPeriod,
  shown: ReadonlySet<PortfolioModule>,
): KpiCard[] {
  const end = dayMonth(period.end);
  const out: KpiCard[] = [];
  if (shown.has('curto-prazo')) {
    const t = totals.short;
    out.push({
      module: 'curto-prazo',
      label: 'PPC das obras',
      value: t.percent !== undefined ? pct(t.percent) : '—',
      ...(t.delta !== undefined ? { tag: deltaTag(t.delta) } : {}),
      hint: t.withPpc
        ? `${int(t.fulfilled)} de ${plural(t.planned, 'compromisso', 'compromissos')} · ${plural(t.withPpc, 'obra', 'obras')}`
        : 'Nenhuma semana apurada no período',
      main: true,
    });
    const percentOf = new Map(rows.map(row => [row.work.id, row.short?.current.percent]));
    out.push({
      module: 'curto-prazo',
      label: `Obras abaixo de ${PPC_ALERT}%`,
      value: t.withPpc ? `${int(t.below70.length)} de ${int(t.withPpc)}` : '—',
      hint: t.below70.length
        ? t.below70.map(work => `${work.code} ${pct(percentOf.get(work.id)!)}`).join(' · ')
        : t.withPpc
          ? 'Nenhuma no período'
          : 'Nenhuma obra com semana apurada no período',
      ...(t.withPpc ? { tone: t.below70.length ? ('warn' as const) : ('good' as const) } : {}),
    });
  }
  if (shown.has('longo-prazo') && totals.longTerm.withMeasurement) {
    const t = totals.longTerm;
    out.push({
      module: 'longo-prazo',
      label: 'Atrás no físico',
      value: `${int(t.behind)} de ${int(t.withMeasurement)}`,
      hint:
        t.behind && t.worst
          ? `Pior: ${t.worst.work.code}, ${signedPoints(t.worst.delta)} em ${end}`
          : `${t.withMeasurement === 1 ? 'Em dia' : 'Todas em dia'} em ${end}`,
      tone: t.behind ? 'warn' : 'good',
    });
  }
  if (shown.has('vagoes') && totals.wagons.works) {
    const t = totals.wagons;
    out.push({
      module: 'vagoes',
      label: 'Takt vencido',
      value: int(t.taktOverdue),
      hint: t.taktOverdue
        ? `${plural(t.taktOverdue, 'vagão', 'vagões')} em ${int(t.taktWorks)} de ${plural(t.works, 'obra', 'obras')}, em ${end}`
        : `Nenhum vagão vencido ${inWorks(t.works)}, em ${end}`,
      tone: t.taktOverdue ? 'warn' : 'good',
    });
    out.push({
      module: 'vagoes',
      label: 'Restrições vencidas',
      value: int(t.restrictionsOverdue),
      hint: t.restrictionsOverdue
        ? `Em ${int(t.restrictionsWorks)} de ${plural(t.works, 'obra', 'obras')}, em ${end}`
        : `Nenhuma vencida ${inWorks(t.works)}, em ${end}`,
      tone: t.restrictionsOverdue ? 'bad' : 'good',
    });
  }
  if (shown.has('terminalidade') && totals.terminality.works) {
    const t = totals.terminality;
    const change = t.open - t.openAtStart;
    out.push({
      module: 'terminalidade',
      label: 'Pendências em aberto',
      value: int(t.open),
      ...(change
        ? { tag: { text: `${change > 0 ? '▲' : '▼'} ${int(Math.abs(change))}`, tone: change > 0 ? ('bad' as const) : ('good' as const) } }
        : {}),
      hint: `${int(t.opened)} ${t.opened === 1 ? 'aberta' : 'abertas'} e ${int(t.resolved)} ${t.resolved === 1 ? 'resolvida' : 'resolvidas'} no período · ${plural(t.works, 'obra', 'obras')}`,
      ...(t.open === 0 ? { tone: 'good' as const } : {}),
    });
  }
  // Regra 8 da segurança: o 7º cartão, retrato no sábado final com a seta da variação no período.
  if (shown.has('seguranca') && totals.safety.works) {
    const t = totals.safety;
    const change = t.open - t.openAtStart;
    out.push({
      module: 'seguranca',
      label: 'Apontamentos de segurança em aberto',
      value: int(t.open),
      ...(change
        ? { tag: { text: `${change > 0 ? '▲' : '▼'} ${int(Math.abs(change))}`, tone: change > 0 ? ('bad' as const) : ('good' as const) } }
        : {}),
      hint: `${int(t.opened)} ${t.opened === 1 ? 'feito' : 'feitos'} e ${int(t.resolved)} ${t.resolved === 1 ? 'finalizado' : 'finalizados'} no período · ${plural(t.works, 'obra', 'obras')}`,
      ...(t.open === 0 ? { tone: 'good' as const } : t.openOver7 > 0 ? { tone: 'bad' as const } : {}),
    });
  }
  out.push(...extraKpisOf(totals, period, shown));
  const kpis = out.slice(0, KPIS_SHOWN);
  // Sem o curto prazo, o primeiro cartão que houver é o destaque (como no resumo da aba 0).
  if (kpis.length && !kpis.some(kpi => kpi.main)) kpis[0] = { ...kpis[0], main: true };
  return kpis;
}

// ─── Frase (regra 13) ───────────────────────────────────────────────────────────────────────────────────

const say = (text: string): Segment => ({ text });
const strong = (text: string): Segment => ({ text, strong: true });

/** "Em outubro de 2026", "No 4º trimestre de 2026", "Na semana de 26/10 a 31/10/2026", "De 01/06/2026 a 31/10/2026". */
export function periodPhrase(period: DashboardPeriod): string {
  switch (period.scale) {
    case 'semana':
      return `Na semana de ${period.label}`;
    case 'mes':
    case 'ano':
      return `Em ${period.label}`;
    case 'trimestre':
      return `No ${period.label.replace(/ \(.*\)$/, '')}`;
    case 'personalizado':
      return `De ${period.label}`;
  }
}

/** Regra 6: o período em andamento diz quantas das suas semanas já terminaram ("parcial: 1 de 5 semanas
 * encerradas"). O modelo aprovado dizia "apuradas", mas o número conta semanas do calendário, não as apuradas
 * da planilha, e a frase podia dizer "9 de 13 semanas apuradas" e logo depois "nenhuma obra tem semana apurada".
 * O personalizado não leva a nota, como no modelo. */
function partialNote(period: DashboardPeriod): string {
  if (!period.partial || period.scale === 'personalizado') return '';
  if (period.scale === 'semana') return ' (semana em andamento)';
  return ` (parcial: ${int(period.weeks.length - 1)} de ${plural(period.nominalWeeks, 'semana encerrada', 'semanas encerradas')})`;
}

/** "da semana anterior", "de setembro", "de dezembro de 2025", "do 3º trimestre", "de 2025", "do intervalo
 * anterior de mesmo tamanho". Ausente sem período anterior. */
export function previousPhrase(period: DashboardPeriod): string | undefined {
  const previous = period.previous;
  if (!previous) return undefined;
  const sameYear = previous.key.slice(0, 4) === period.key.slice(0, 4);
  switch (period.scale) {
    case 'semana':
      return 'da semana anterior';
    case 'mes':
      return `de ${sameYear ? previous.label.replace(/ de \d{4}$/, '') : previous.label}`;
    case 'trimestre': {
      const name = previous.label.replace(/ \(.*\)$/, '');
      return `do ${sameYear ? name.replace(/ de \d{4}$/, '') : name}`;
    }
    case 'ano':
      return `de ${previous.label}`;
    case 'personalizado':
      return 'do intervalo anterior de mesmo tamanho';
  }
}

/** A frase do topo, com os números dos cartões já arredondados (nunca os contradiz): o PPC consolidado e a seta
 * contra o período anterior, a melhor e a pior obra com posição, as obras em início, o físico e a
 * terminalidade. Só os módulos que a pessoa pode abrir e não escondeu. */
function sentenceOf(
  totals: PortfolioTotals,
  rows: readonly PortfolioRow[],
  notStarted: readonly PortfolioWork[],
  period: DashboardPeriod,
  shown: ReadonlySet<PortfolioModule>,
): Segment[] {
  const head = `${periodPhrase(period)}${partialNote(period)}`;
  if (!rows.length)
    return [
      say(
        notStarted.length
          ? `${head}, nenhuma das obras escolhidas tinha começado no curto prazo.`
          : `${head}, nenhuma obra está no comparativo.`,
      ),
    ];
  const out: Segment[] = [];
  const end = dayMonth(period.end);

  if (shown.has('curto-prazo')) {
    const t = totals.short;
    if (!t.withPpc || t.percent === undefined) out.push(say(`${head}, nenhuma obra tem semana apurada ainda.`));
    else {
      out.push(
        say(
          `${head}, ${t.withPpc === 1 ? 'a única obra com semana apurada cumpriu' : `as ${int(t.withPpc)} obras com semana apurada cumpriram`} `,
        ),
        strong(pct(t.percent)),
        say(
          ` do que ${t.withPpc === 1 ? 'assumiu' : 'assumiram'} (${int(t.fulfilled)} de ${plural(t.planned, 'compromisso', 'compromissos')})`,
        ),
      );
      const previous = previousPhrase(period);
      if (t.delta !== undefined && previous) {
        if (t.delta === 0) out.push(say(`, igual ao PPC ${previous}`));
        else out.push(say(', '), strong(`${Math.abs(t.delta)} p.p. ${t.delta > 0 ? 'acima' : 'abaixo'}`), say(` ${previous}`));
      }
      out.push(say('.'));
      const ranked = rows
        .filter(row => row.short?.position !== undefined)
        .sort((a, b) => a.short!.position! - b.short!.position! || byName(a.work, b.work));
      if (ranked.length >= 2) {
        const best = ranked[0];
        const worst = ranked[ranked.length - 1];
        const worstPercent = worst.short!.current.percent!;
        out.push(
          say(' A melhor foi '),
          strong(`${best.work.name} (${pct(best.short!.current.percent!)})`),
          say(' e a pior '),
          strong(`${worst.work.name} (${pct(worstPercent)})`),
          say(belowAlert(worstPercent) ? `, abaixo de ${PPC_ALERT}%.` : '.'),
        );
      }
      const early = rows.filter(row => row.short?.early && row.short.current.percent !== undefined).map(row => row.work.name);
      if (early.length)
        out.push(
          say(
            ` ${listText(early)} ${early.length === 1 ? 'ainda está em início e fica' : 'ainda estão em início e ficam'} fora da comparação.`,
          ),
        );
    }
  } else out.push(say(`${head}, o comparativo reúne ${plural(rows.length, 'obra', 'obras')}.`));

  if (shown.has('longo-prazo') && totals.longTerm.withMeasurement) {
    const { behind, withMeasurement } = totals.longTerm;
    if (behind)
      out.push(
        say(' No físico, '),
        strong(`${int(behind)} de ${int(withMeasurement)}`),
        say(` ${withMeasurement === 1 ? 'obra está' : behind === 1 ? 'obras está' : 'obras estão'} atrás do planejado em ${end}.`),
      );
    else
      out.push(
        say(
          withMeasurement === 1
            ? ` No físico, a obra com medição está em dia ou à frente em ${end}.`
            : ` No físico, as ${int(withMeasurement)} obras com medição estão em dia ou à frente em ${end}.`,
        ),
      );
  }

  if (shown.has('terminalidade') && totals.terminality.works) {
    const { open, openAtStart } = totals.terminality;
    const change = open - openAtStart;
    out.push(
      say(' A terminalidade fecha o período com '),
      strong(plural(open, 'pendência em aberto', 'pendências em aberto')),
      say(change ? ` (${int(Math.abs(change))} a ${change < 0 ? 'menos' : 'mais'} que no início).` : '.'),
    );
  }

  if (shown.has('seguranca') && totals.safety.works) {
    const { open, openAtStart, openOver7 } = totals.safety;
    const change = open - openAtStart;
    out.push(
      say(' A segurança do trabalho fecha o período com '),
      strong(plural(open, 'apontamento em aberto', 'apontamentos em aberto')),
      say(change ? ` (${int(Math.abs(change))} a ${change < 0 ? 'menos' : 'mais'} que no início)` : ''),
    );
    if (openOver7) out.push(say(', '), strong(`${int(openOver7)} há mais de 7 dias`));
    out.push(say('.'));
  }
  out.push(...extraSentenceOf(totals, shown));
  return out;
}

// ─── Tudo junto ─────────────────────────────────────────────────────────────────────────────────────────

export function aggregatePortfolio({ period, rows, shown }: PortfolioAggregateInput): PortfolioData {
  const startedAfter = (row: PortfolioRow) => !!row.firstWeek && row.firstWeek > period.lastWeek;
  const started = withPositions(rows.filter(row => !startedAfter(row)).sort((a, b) => byName(a.work, b.work)));
  const notStarted = rows
    .filter(startedAfter)
    .map(row => row.work)
    .sort(byName);
  const totals = totalsOf(started);
  return {
    period,
    rows: started,
    notStarted,
    totals,
    kpis: kpisOf(totals, started, period, shown),
    sentence: sentenceOf(totals, started, notStarted, period, shown),
    heat: heatOf(started, period),
    pareto: paretoOf(started),
    companies: companiesOf(started),
    responsibles: responsiblesOf(started),
    safetyTypes: safetyTypesOf(started),
    services: servicesOf(started),
    cardOwners: cardOwnersOf(started),
    noData: noDataOf(started),
  };
}

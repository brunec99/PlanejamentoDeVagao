import { formatIdp, idpTone, IDP_TONE_LABEL } from '@/domain/lob-performance';
import { textKey } from '@/modules/curto-prazo/sheet-view';
import { dayMonth, type KpiCard, type PortfolioModule, type Segment, type Tone } from '../model';
import type { DashboardPeriod } from '../period';
import type {
  ChecklistBlock,
  DashboardExtrasResponse,
  ExtrasCell,
  HeadcountBlock,
  LegalizationBlock,
  LobBlock,
  ProductionBlock,
  RestrictionsBlock,
  WorkdayCoverage,
  WorkExtras,
} from '../extras/types';
import type { PortfolioSource } from './extract';
import type { PortfolioBalance, PortfolioCardOwners, PortfolioRow, PortfolioServices, PortfolioTotals, PortfolioWork } from './types';

/** Quadros de 12/11/2026 no Dashboard geral (modelo aprovado "Dashboards completos e resumo semanal", regras 1 a
 * 11): Linha de Balanço e legalização (1.1), Quadro de Restrições (1.4), histograma (2.2), produtividade (2.3) e
 * checklist de equipamentos (3.2). Os blocos chegam prontos de `GET /api/dashboard/extras` para o período (a
 * legalização, do planejamento já carregado); aqui fica o que o geral faz com eles: o estado de cada quadro na
 * obra, os totais, as faixas de cor, os serviços medidos em mais de uma obra, os responsáveis com mais cards
 * vencidos, os dois cartões novos e a oração do efetivo na frase. Tudo puro; a tela (`use-portfolio-data.ts`) e
 * o servidor da Claudia (`compose.ts`) usam igual. */

/** Os módulos que dependem da rota dos quadros novos (o `balanco` também lê o planejamento). */
export const EXTRA_ROUTE_MODULES: PortfolioModule[] = ['balanco', 'restricoes', 'histograma', 'produtividade', 'checklist'];
export const extrasUrl = (period: Pick<DashboardPeriod, 'start' | 'end'>) =>
  `/api/dashboard/extras?de=${encodeURIComponent(period.start)}&ate=${encodeURIComponent(period.end)}`;

/** A leitura da rota como a tela a vê; `absent` = não pedida ou negada (os quadros somem). */
export type ExtrasState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'absent' } | { status: 'ready'; data: DashboardExtrasResponse };

export interface ExtraSources {
  balance: PortfolioSource<PortfolioBalance>;
  restrictions: PortfolioSource<RestrictionsBlock>;
  headcount: PortfolioSource<HeadcountBlock>;
  production: PortfolioSource<ProductionBlock>;
  checklist: PortfolioSource<ChecklistBlock>;
  reasons: Partial<Record<PortfolioModule, string>>;
}
export const HIDDEN_EXTRAS: ExtraSources = {
  balance: { status: 'hidden' },
  restrictions: { status: 'hidden' },
  headcount: { status: 'hidden' },
  production: { status: 'hidden' },
  checklist: { status: 'hidden' },
  reasons: {},
};

const UNAVAILABLE_REASON: Partial<Record<PortfolioModule, string>> = {
  balanco: 'A Linha de Balanço não está disponível neste ambiente.',
  restricoes: 'O Quadro de Restrições não está disponível neste ambiente.',
  histograma: 'O histograma não está disponível neste ambiente.',
  produtividade: 'O controle de produtividade não está disponível neste ambiente.',
  checklist: 'O checklist de equipamentos não está disponível neste ambiente.',
};

export interface ExtraSourcesInput {
  state: ExtrasState;
  /** A obra na resposta da rota; ausente = a rota não a devolveu. */
  entry?: WorkExtras;
  /** A obra já tinha começado até o fim do período (tem data de referência). */
  inPeriod: boolean;
  shown: ReadonlySet<PortfolioModule>;
  /** A legalização da obra, do planejamento já carregado; ausente = a obra não tem Gantt de legalização. */
  legalization?: LegalizationBlock;
}

/** O estado de cada quadro novo numa obra. Célula ausente = a pessoa não tem o módulo (escondido); `absent` =
 * a obra não usa o módulo; `unavailable` = migração ausente (sem dado, com o motivo); `error` = indisponível. */
export function extraSources({ state, entry, inPeriod, shown, legalization }: ExtraSourcesInput): ExtraSources {
  const reasons: Partial<Record<PortfolioModule, string>> = {};
  const pick = <T>(module: PortfolioModule, cell: (entry: WorkExtras) => ExtrasCell<T> | undefined): PortfolioSource<T> => {
    if (!shown.has(module) || state.status === 'absent') return { status: 'hidden' };
    if (!inPeriod) return { status: 'absent' };
    if (state.status !== 'ready') return state;
    if (!entry) return { status: 'absent' };
    const own = cell(entry);
    if (!own) return { status: 'hidden' };
    if (own.kind === 'ready') return { status: 'ready', data: own.data };
    if (own.kind === 'error') return { status: 'error', message: own.message };
    if (own.kind === 'unavailable') reasons[module] = UNAVAILABLE_REASON[module];
    return { status: 'absent' };
  };
  // O IDP só existe com bloco lançado; "sem blocos" vale como obra sem Linha de Balanço.
  const lob = pick<LobBlock>('balanco', e => (e.lob?.kind === 'ready' && e.lob.data.status === 'no-blocks' ? { kind: 'absent' } : e.lob));
  let balance: PortfolioSource<PortfolioBalance>;
  if (!shown.has('balanco')) balance = { status: 'hidden' };
  else if (!inPeriod) balance = { status: 'absent' };
  else if (lob.status === 'ready') balance = { status: 'ready', data: { lob: lob.data, ...(legalization ? { legalization } : {}) } };
  else if (lob.status === 'loading') balance = lob;
  // A legalização vem do planejamento: aparece mesmo sem a Linha de Balanço (negada, sem dado ou com erro).
  else if (legalization) balance = { status: 'ready', data: { legalization } };
  else balance = lob;
  return {
    balance,
    restrictions: pick('restricoes', e => e.restrictions),
    headcount: pick('histograma', e => e.headcount),
    production: pick('produtividade', e => e.production),
    checklist: pick('checklist', e => e.checklist),
    reasons,
  };
}

// ─── Faixas (sempre com texto ao lado da cor) ───────────────────────────────────────────────────────────

/** Dias lançados ÷ dias úteis esperados, em % (ausente sem dia esperado: período que ainda não teve dia útil). */
export const coveragePercent = (coverage: Pick<WorkdayCoverage, 'expected' | 'launched'>) =>
  coverage.expected > 0 ? (coverage.launched / coverage.expected) * 100 : undefined;
/** Faixas de "dias lançados" (modelo de 12/11/2026): 90% ou mais em verde, 70% a 89% em âmbar, abaixo em vermelho. */
export function coverageTone(coverage: Pick<WorkdayCoverage, 'expected' | 'launched'>): Tone {
  const percent = coveragePercent(coverage);
  if (percent === undefined) return 'neutral';
  const value = Math.round(percent);
  return value >= 90 ? 'good' : value >= 70 ? 'warn' : 'bad';
}
export const COVERAGE_LABEL: Record<Tone, string> = {
  good: 'em dia',
  warn: 'faltam dias',
  bad: 'abaixo de 70%',
  neutral: 'sem dia útil',
  here: '',
};
export const coverageText = (coverage: Pick<WorkdayCoverage, 'expected' | 'launched'>) => `${coverage.launched}/${coverage.expected}`;
/** "faltou 21/10, 22/10 e mais 3". */
export function missingText(coverage: WorkdayCoverage, limit = 4): string {
  if (!coverage.missingCount) return 'nenhum dia útil sem lançamento';
  const shown = coverage.missing.slice(0, limit).map(dayMonth);
  const rest = coverage.missingCount - shown.length;
  return `${coverage.missingCount === 1 ? 'faltou' : 'faltaram'} ${shown.join(', ')}${rest > 0 ? ` e mais ${rest}` : ''}`;
}
export const idpToneOf = (idp: number | undefined): Tone => (idp === undefined ? 'neutral' : idpTone(idp));
export const idpLabel = (idp: number) => `${formatIdp(idp)} · ${IDP_TONE_LABEL[idpTone(idp)]}`;
/** Checklists de hoje em dia: devidos − vencidos. */
export const checklistOnTime = (block: Pick<ChecklistBlock, 'due' | 'pending'>) => Math.max(0, block.due - block.pending);

// ─── Totais ─────────────────────────────────────────────────────────────────────────────────────────────

type ExtraTotals = Pick<PortfolioTotals, 'headcount' | 'production' | 'restrictions' | 'balance' | 'checklist'>;
const sum = <T>(items: readonly T[], value: (item: T) => number) => items.reduce((total, item) => total + value(item), 0);
const byName = (a: PortfolioWork, b: PortfolioWork) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
const complete = (coverage: WorkdayCoverage) => coverage.expected > 0 && coverage.launched >= coverage.expected;

export function extraTotalsOf(rows: readonly PortfolioRow[]): ExtraTotals {
  const headcount = rows.flatMap(row => (row.headcount ? [row.headcount] : []));
  const production = rows.flatMap(row => (row.production ? [row.production] : []));
  const restrictions = rows.flatMap(row => (row.restrictions ? [row.restrictions] : []));
  const checklist = rows.flatMap(row => (row.checklist ? [row.checklist] : []));
  const balance = rows.flatMap(row => (row.balance ? [{ work: row.work, balance: row.balance }] : []));
  const manDays = sum(headcount, item => item.manDays);
  const entries = sum(production, item => item.entries);
  const measured = sum(production, item => item.measured);
  const withIdp = balance.flatMap(item => (item.balance.lob?.idp !== undefined ? [{ work: item.work, idp: item.balance.lob.idp }] : []));
  const worst = withIdp.reduce<{ work: PortfolioWork; idp: number } | undefined>(
    (lowest, item) => (!lowest || item.idp < lowest.idp ? item : lowest),
    undefined,
  );
  const legalization = balance.flatMap(item => (item.balance.legalization ? [item.balance.legalization] : []));
  return {
    headcount: {
      works: headcount.length,
      dailyAverage: sum(headcount, item => item.dailyAverage),
      manDays,
      ...(manDays > 0 ? { contractorShare: sum(headcount, item => item.manDays * item.contractorShare) / manDays } : {}),
      launched: sum(headcount, item => item.coverage.launched),
      expected: sum(headcount, item => item.coverage.expected),
      worksComplete: headcount.filter(item => complete(item.coverage)).length,
    },
    production: {
      works: production.length,
      entries,
      measured,
      manDays: sum(production, item => item.manDays),
      ...(entries > 0 ? { measuredShare: measured / entries } : {}),
      launched: sum(production, item => item.coverage.launched),
      expected: sum(production, item => item.coverage.expected),
      worksComplete: production.filter(item => complete(item.coverage)).length,
    },
    restrictions: {
      works: restrictions.length,
      open: sum(restrictions, item => item.open),
      overdue: sum(restrictions, item => item.overdue),
      overdueWorks: restrictions.filter(item => item.overdue > 0).length,
      startOverdue: sum(restrictions, item => item.startOverdue),
      doneInPeriod: sum(restrictions, item => item.doneInPeriod),
      createdInPeriod: sum(restrictions, item => item.createdInPeriod),
    },
    balance: {
      works: balance.length,
      withIdp: withIdp.length,
      // Pelo valor de duas casas que a tela mostra: 0,996 aparece como 1,00 e não é "abaixo".
      behind: withIdp.filter(item => idpTone(item.idp) !== 'good').length,
      ...(worst ? { worst } : {}),
      legalizationWorks: legalization.length,
      legalizationLate: sum(legalization, item => item.late),
    },
    checklist: {
      works: checklist.length,
      equipment: sum(checklist, item => item.equipment),
      due: sum(checklist, item => item.due),
      pending: sum(checklist, item => item.pending),
      pendingWorks: checklist.filter(item => item.pending > 0).length,
      runsInPeriod: sum(checklist, item => item.runsInPeriod),
      runsWithNonConformity: sum(checklist, item => item.runsWithNonConformity),
      nonConformities: sum(checklist, item => item.nonConformities),
    },
  };
}

// ─── Serviços em mais de uma obra e responsáveis ────────────────────────────────────────────────────────

/** Quantos serviços e quantos responsáveis os quadros mostram. */
export const SERVICES_SHOWN = 8;
export const CARD_OWNERS_SHOWN = 6;

/** Regra 5: o mesmo serviço (`key`, o nome sem acento nem caixa) na mesma unidade em duas obras ou mais, com a
 * produção por homem-dia de cada obra. A grafia exibida é a da obra com mais homens-dia; da linha com mais
 * homens-dia para a com menos. Cada obra só manda os 12 serviços com mais homens-dia. */
export function servicesOf(rows: readonly PortfolioRow[]): PortfolioServices {
  const groups = new Map<
    string,
    {
      name: string;
      top: number;
      unit: string;
      key: string;
      byWork: Record<string, { perManDay: number; manDays: number; quantity: number }>;
    }
  >();
  for (const row of rows) {
    for (const service of row.production?.services ?? []) {
      if (!service.key || service.manDays <= 0) continue;
      const id = `${service.key}|${service.unit}`;
      const group = groups.get(id) ?? { name: service.name, top: 0, unit: service.unit, key: service.key, byWork: {} };
      if (service.manDays > group.top) {
        group.top = service.manDays;
        group.name = service.name;
      }
      group.byWork[row.work.id] = { perManDay: service.perManDay, manDays: service.manDays, quantity: service.quantity };
      groups.set(id, group);
    }
  }
  const list = [...groups.values()]
    .filter(group => Object.keys(group.byWork).length >= 2)
    .map(group => {
      const cells = Object.values(group.byWork);
      const manDays = sum(cells, cell => cell.manDays);
      return {
        key: group.key,
        name: group.name,
        unit: group.unit,
        manDays,
        perManDay: manDays > 0 ? sum(cells, cell => cell.quantity) / manDays : 0,
        byWork: group.byWork,
      };
    })
    .sort((a, b) => b.manDays - a.manDays || a.name.localeCompare(b.name, 'pt-BR') || a.unit.localeCompare(b.unit))
    .slice(0, SERVICES_SHOWN);
  return { works: rows.filter(row => list.some(item => item.byWork[row.work.id])).map(row => row.work), rows: list };
}

/** Os responsáveis com mais cards vencidos somando as obras (cada obra manda os 5 com mais cards em aberto),
 * pareados pelo nome sem acento nem caixa. Só quem tem algum vencido; empate pelos abertos e depois pelo nome. */
export function cardOwnersOf(rows: readonly PortfolioRow[]): PortfolioCardOwners {
  const owners = new Map<string, { name: string; byWork: { work: PortfolioWork; overdue: number; open: number }[] }>();
  for (const row of rows) {
    for (const item of row.restrictions?.byResponsible ?? []) {
      const key = textKey(item.name);
      if (!key) continue;
      const owner = owners.get(key) ?? { name: item.name, byWork: [] };
      owner.byWork.push({ work: row.work, overdue: item.overdue, open: item.open });
      owners.set(key, owner);
    }
  }
  const list = [...owners.values()]
    .map(owner => ({
      name: owner.name,
      overdue: sum(owner.byWork, cell => cell.overdue),
      open: sum(owner.byWork, cell => cell.open),
      byWork: [...owner.byWork].sort((a, b) => b.overdue - a.overdue || b.open - a.open || byName(a.work, b.work)),
    }))
    .filter(owner => owner.overdue > 0)
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, CARD_OWNERS_SHOWN);
  return { rows: list };
}

// ─── Cartões e frase (regra 9) ──────────────────────────────────────────────────────────────────────────

const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const int = (value: number) => integer.format(Math.round(value));
const plural = (count: number, one: string, many: string) => `${int(count)} ${count === 1 ? one : many}`;

/** Os dois cartões de 12/11/2026: "Efetivo médio" (soma das obras, com quantas lançaram todos os dias úteis) e
 * "Cards vencidos" (com quantas obras). Só com alguma obra com dado e o quadro mostrado. */
export function extraKpisOf(totals: PortfolioTotals, period: DashboardPeriod, shown: ReadonlySet<PortfolioModule>): KpiCard[] {
  const out: KpiCard[] = [];
  if (shown.has('histograma') && totals.headcount.works) {
    const t = totals.headcount;
    const missing = t.works - t.worksComplete;
    out.push({
      module: 'histograma',
      label: 'Efetivo médio',
      value: int(t.dailyAverage),
      hint: `Por dia útil lançado, somando ${plural(t.works, 'obra', 'obras')} · ${int(t.worksComplete)} de ${int(t.works)} ${
        t.worksComplete === 1 ? 'lançou' : 'lançaram'
      } todos os dias úteis`,
      ...(t.expected > 0 ? { tag: { text: `${coverageText(t)} dias`, tone: missing ? ('warn' as const) : ('good' as const) } } : {}),
    });
  }
  if (shown.has('restricoes') && totals.restrictions.works) {
    const t = totals.restrictions;
    out.push({
      module: 'restricoes',
      label: 'Cards vencidos',
      value: int(t.overdue),
      hint: t.overdue
        ? `Em ${int(t.overdueWorks)} de ${plural(t.works, 'obra', 'obras')} · ${int(t.open)} em aberto, em ${dayMonth(period.end)}`
        : `Nenhum vencido ${t.works === 1 ? 'na obra' : `nas ${int(t.works)} obras`} · ${int(t.open)} em aberto`,
      tone: t.overdue ? 'bad' : 'good',
    });
  }
  return out;
}

/** A oração do efetivo na frase do topo, com os números já arredondados do cartão. */
export function extraSentenceOf(totals: PortfolioTotals, shown: ReadonlySet<PortfolioModule>): Segment[] {
  if (!shown.has('histograma') || !totals.headcount.works) return [];
  const t = totals.headcount;
  return [
    { text: ' O efetivo médio somou ' },
    { text: plural(Math.round(t.dailyAverage), 'pessoa por dia útil', 'pessoas por dia útil'), strong: true },
    {
      text: ` em ${plural(t.works, 'obra', 'obras')}${
        t.expected > 0 ? `, com o histograma lançado em ${int(t.launched)} de ${plural(t.expected, 'dia útil', 'dias úteis')}` : ''
      }.`,
    },
  ];
}

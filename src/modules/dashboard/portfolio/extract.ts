import type { LocalDate, Team, WeeklyCommitment } from '@/domain/entities';
import { MIN_RANKED_WEEKS } from '@/domain/closing-ranking';
import { deviationTone, type LongTermPanelData } from '../long-term-panel';
import type { MediumTermPanelData } from '../medium-term-panel';
import type { PanelState, PortfolioModule, Tone } from '../model';
import type { DashboardPeriod } from '../period';
import { periodCompanies, periodDelta, type ShortTermPanelData } from '../short-term-panel';
import type { TerminalityPanelData } from '../terminality-panel';
import type { WagonsPanelData } from '../wagons-panel';
import type { ChecklistBlock, HeadcountBlock, ProductionBlock, RestrictionsBlock } from '../extras/types';
import { coveragePercent } from './extras';
import type {
  PortfolioBalance,
  PortfolioCellStatus,
  PortfolioLongTerm,
  PortfolioMedium,
  PortfolioRow,
  PortfolioSafety,
  PortfolioShort,
  PortfolioTerminality,
  PortfolioWagons,
  PortfolioWork,
} from './types';

/** Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"): de uma obra, com os
 * quadros da aba 0 já construídos para o período, para a linha do comparativo (`PortfolioRow`, regra 10).
 * Nada aqui recalcula o que os quadros já entregam: os fluxos do período saem de `period` de cada quadro
 * (regra 9) e os retratos no sábado final, dos campos que a aba 0 já mostra. Só a posição entre as obras fica
 * para `aggregate.ts`, porque depende das outras linhas. Tudo puro. */

/** O estado de um quadro na obra, como o hook o entrega: o da aba 0 (`PanelState`) ou escondido (a pessoa não
 * pode abrir o módulo ou desmarcou o quadro em "Quadros"). */
export type PortfolioSource<T> = PanelState<T> | { status: 'hidden' };

export interface PortfolioWorkInput {
  work: PortfolioWork;
  /** Segunda-feira da primeira semana com linha no curto prazo; ausente se a obra não tem linha. */
  firstWeek?: LocalDate;
  /** Todas as linhas do curto prazo da obra (só dela) e as equipes dela, para as empresas do período. */
  commitments: WeeklyCommitment[];
  teams: Team[];
  short: PortfolioSource<ShortTermPanelData>;
  longTerm: PortfolioSource<LongTermPanelData>;
  wagons: PortfolioSource<WagonsPanelData>;
  medium: PortfolioSource<MediumTermPanelData>;
  terminality: PortfolioSource<TerminalityPanelData>;
  /** Segurança do trabalho (06/11/2026): sem quadro na aba 0, o hook entrega o bloco pronto (`buildSafetyBlock`).
   * Ausente = escondido (chamadas antigas, testes). */
  safety?: PortfolioSource<PortfolioSafety>;
  /** Quadros de 12/11/2026 (`extras.ts`): o hook entrega o bloco pronto da rota. Ausente = escondido. */
  balance?: PortfolioSource<PortfolioBalance>;
  restrictions?: PortfolioSource<RestrictionsBlock>;
  headcount?: PortfolioSource<HeadcountBlock>;
  production?: PortfolioSource<ProductionBlock>;
  checklist?: PortfolioSource<ChecklistBlock>;
  /** O motivo do "—" de um módulo ausente, quando o hook sabe mais que o padrão (`ABSENT_REASON`). */
  reasons?: Partial<Record<PortfolioModule, string>>;
}

/** O motivo padrão do "—" de cada módulo sem dado na obra, que a tela mostra ao passar o mouse. */
export const ABSENT_REASON: Record<PortfolioModule, string> = {
  'longo-prazo': 'Sem plano de longo prazo nesta obra.',
  balanco: 'Sem Linha de Balanço nem Gantt de legalização nesta obra.',
  vagoes: 'A obra não usa vagões.',
  'medio-prazo': 'Sem plano de médio prazo nesta obra.',
  'curto-prazo': 'Sem linha no curto prazo até o fim do período.',
  restricoes: 'A obra não usa o Quadro de Restrições.',
  terminalidade: 'Sem pendências de terminalidade até o fim do período.',
  histograma: 'A obra não usa o histograma.',
  produtividade: 'A obra não usa o controle de produtividade.',
  seguranca: 'Sem apontamentos de segurança até o fim do período.',
  checklist: 'A obra não tem equipamento no checklist.',
};
const NO_SHORT_LINE = 'Sem linha no curto prazo nesta obra.';

// ─── Estado da obra (regra 10) ──────────────────────────────────────────────────────────────────────────

export type WorkStateTone = Extract<Tone, 'good' | 'warn' | 'bad' | 'neutral'>;
export const STATE_LABEL: Record<WorkStateTone, string> = {
  good: 'Em dia',
  warn: 'Atenção',
  bad: 'Crítico',
  neutral: 'Sem apuração',
};
const RANK: Record<WorkStateTone, number> = { neutral: 0, good: 1, warn: 2, bad: 3 };

/** Faixas do PPC (regra 11): 80% ou mais é bom, abaixo de 70% pede atenção, abaixo de 60% é crítico; de 70 a
 * 79 fica neutro. Sobre o valor arredondado, o que a tela mostra: 69,6% aparece como 70% e não é "abaixo de
 * 70%". Sem PPC, neutro. */
export function ppcTone(percent: number | undefined): WorkStateTone {
  if (percent === undefined) return 'neutral';
  const value = Math.round(percent);
  return value >= 80 ? 'good' : value < 60 ? 'bad' : value < 70 ? 'warn' : 'neutral';
}

/** O pior estado entre os indicadores da obra, como no cartão da lista de obras (regra 10): PPC do período
 * (70–79 conta como bom aqui), desvio do físico (`deviationTone`), restrições vencidas (crítico), takt vencido
 * e tarefas atrasadas (atenção). Módulo presente com zero conta como "em dia"; só os módulos presentes contam
 * (escondido ou sem dado não puxa o estado), e a terminalidade não tem faixa, então não entra. Sem nenhum
 * indicador: "Sem apuração". Desde 12/11/2026 (regra 9 do modelo "Dashboards completos e resumo semanal") contam
 * também, como atenção, os cards vencidos do Quadro de Restrições e os dias lançados abaixo de 70% no histograma
 * e na produtividade (obra que não usa o módulo não é puxada por ele). */
export const LOW_COVERAGE = 70;
const lowCoverage = (block: { coverage: { expected: number; launched: number } }) => {
  const percent = coveragePercent(block.coverage);
  return percent !== undefined && Math.round(percent) < LOW_COVERAGE;
};
export function workState(
  row: Pick<PortfolioRow, 'short' | 'longTerm' | 'wagons' | 'medium' | 'restrictions' | 'headcount' | 'production'>,
): { state: WorkStateTone; label: string } {
  const tones: WorkStateTone[] = [];
  const ppc = row.short?.current.percent;
  if (ppc !== undefined) {
    const tone = ppcTone(ppc);
    tones.push(tone === 'neutral' ? 'good' : tone);
  }
  if (row.longTerm?.delta !== undefined) tones.push(deviationTone(row.longTerm.delta) as WorkStateTone);
  if (row.wagons) {
    tones.push(row.wagons.restrictionsOverdue > 0 ? 'bad' : 'good');
    tones.push(row.wagons.taktOverdue > 0 ? 'warn' : 'good');
  }
  if (row.medium) tones.push(row.medium.late > 0 ? 'warn' : 'good');
  if (row.restrictions) tones.push(row.restrictions.overdue > 0 ? 'warn' : 'good');
  if (row.headcount) tones.push(lowCoverage(row.headcount) ? 'warn' : 'good');
  if (row.production) tones.push(lowCoverage(row.production) ? 'warn' : 'good');
  const state = tones.reduce<WorkStateTone>((worst, tone) => (RANK[tone] > RANK[worst] ? tone : worst), 'neutral');
  return { state, label: STATE_LABEL[state] };
}

// ─── Blocos por módulo ──────────────────────────────────────────────────────────────────────────────────

function shortOf(data: ShortTermPanelData, input: PortfolioWorkInput, period: DashboardPeriod): PortfolioShort {
  const view = data.period;
  const { current, previous } = view;
  const delta = periodDelta(view);
  // O PPC geral é sempre o da obra inteira até o fim do período (`whole`), o mesmo do ranking da aba 0.
  const overall = data.whole.overall;
  return {
    current,
    ...(previous ? { previous } : {}),
    ...(delta !== undefined ? { delta } : {}),
    overall: {
      planned: overall.planned,
      fulfilled: overall.fulfilled,
      closedWeeks: overall.closedWeeks,
      ...(overall.percent !== undefined ? { percent: overall.percent } : {}),
    },
    early: overall.closedWeeks < MIN_RANKED_WEEKS,
    series: view.series,
    causes: view.causes.map(item => ({ cause: item.cause, total: item.total })),
    // Empresas só das semanas apuradas do período, como o PPC (regra 7): `periodCompanies` tira as em aberto.
    companies: periodCompanies(input.commitments, input.teams, period.weeks),
  };
}

const longTermOf = (data: LongTermPanelData): PortfolioLongTerm => ({
  ...(data.measured !== undefined ? { measured: data.measured } : {}),
  planned: data.planned,
  ...(data.delta !== undefined ? { delta: data.delta } : {}),
  ...(data.period.measuredGain !== undefined ? { measuredGain: data.period.measuredGain } : {}),
  plannedGain: data.period.plannedGain,
  ...(data.lastMeasurement ? { lastMeasurement: data.lastMeasurement } : {}),
  ...(data.span?.slip !== undefined ? { slip: data.span.slip } : {}),
  plannedSource: data.plannedSource,
});

const wagonsOf = (data: WagonsPanelData): PortfolioWagons => ({
  total: data.total,
  byStatus: data.byStatus,
  taktOverdue: data.overdue.count,
  restrictionsOverdue: data.restrictions.overdue,
  restrictionsResolved: data.period.restrictionsResolved,
  openDebts: data.openDebts,
});

const mediumOf = (data: MediumTermPanelData): PortfolioMedium => ({
  planName: data.plan.name,
  planMonth: data.plan.month,
  planMonthLabel: data.plan.monthLabel,
  done: data.done,
  inProgress: data.inProgress,
  notStarted: data.notStarted,
  late: data.late.count,
  ...(data.baseline?.planFinishVariance !== undefined ? { finishVariance: data.baseline.planFinishVariance } : {}),
  overloaded: data.overloaded.count,
});

const terminalityOf = (data: TerminalityPanelData): PortfolioTerminality => ({
  open: data.open,
  openAtStart: data.period.openAtStart,
  opened: data.period.opened,
  resolved: data.period.resolved,
  percentLabel: data.percentLabel,
  ...(data.period.averageDaysToResolve !== undefined ? { averageDaysToResolve: data.period.averageDaysToResolve } : {}),
  openByContractor: data.period.openByContractor,
});

function cellOf(source: PortfolioSource<unknown>, reason: string): PortfolioCellStatus {
  switch (source.status) {
    case 'ready':
      return { kind: 'ready' };
    case 'loading':
      return { kind: 'loading' };
    case 'error':
      return { kind: 'error', message: source.message };
    case 'hidden':
      return { kind: 'hidden' };
    case 'absent':
      return { kind: 'absent', reason };
  }
}

const readyData = <T>(source: PortfolioSource<T>): T | undefined => (source.status === 'ready' ? source.data : undefined);

/** A linha do comparativo de uma obra no período. `short.position` fica ausente: é `aggregate.ts` quem
 * numera, comparando as obras. */
export function extractRow(input: PortfolioWorkInput, period: DashboardPeriod): PortfolioRow {
  const reason = (module: PortfolioModule) =>
    input.reasons?.[module] ?? (module === 'curto-prazo' && !input.commitments.length ? NO_SHORT_LINE : ABSENT_REASON[module]);
  const hidden = { status: 'hidden' } as const;
  const safetySource: PortfolioSource<PortfolioSafety> = input.safety ?? hidden;
  const balanceSource: PortfolioSource<PortfolioBalance> = input.balance ?? hidden;
  const restrictionsSource: PortfolioSource<RestrictionsBlock> = input.restrictions ?? hidden;
  const headcountSource: PortfolioSource<HeadcountBlock> = input.headcount ?? hidden;
  const productionSource: PortfolioSource<ProductionBlock> = input.production ?? hidden;
  const checklistSource: PortfolioSource<ChecklistBlock> = input.checklist ?? hidden;
  const status: Record<PortfolioModule, PortfolioCellStatus> = {
    'longo-prazo': cellOf(input.longTerm, reason('longo-prazo')),
    balanco: cellOf(balanceSource, reason('balanco')),
    vagoes: cellOf(input.wagons, reason('vagoes')),
    'medio-prazo': cellOf(input.medium, reason('medio-prazo')),
    'curto-prazo': cellOf(input.short, reason('curto-prazo')),
    restricoes: cellOf(restrictionsSource, reason('restricoes')),
    terminalidade: cellOf(input.terminality, reason('terminalidade')),
    histograma: cellOf(headcountSource, reason('histograma')),
    produtividade: cellOf(productionSource, reason('produtividade')),
    seguranca: cellOf(safetySource, reason('seguranca')),
    checklist: cellOf(checklistSource, reason('checklist')),
  };
  const shortData = readyData(input.short);
  const longData = readyData(input.longTerm);
  const wagonsData = readyData(input.wagons);
  const mediumData = readyData(input.medium);
  const terminalityData = readyData(input.terminality);
  const short = shortData ? shortOf(shortData, input, period) : undefined;
  const longTerm = longData ? longTermOf(longData) : undefined;
  const wagons = wagonsData ? wagonsOf(wagonsData) : undefined;
  const medium = mediumData ? mediumOf(mediumData) : undefined;
  const terminality = terminalityData ? terminalityOf(terminalityData) : undefined;
  const safety = readyData(safetySource);
  const balance = readyData(balanceSource);
  const restrictions = readyData(restrictionsSource);
  const headcount = readyData(headcountSource);
  const production = readyData(productionSource);
  const checklist = readyData(checklistSource);
  // Regra 9 da segurança: o estado da obra não muda (a segurança, como a terminalidade, não entra nele).
  const { state, label } = workState({ short, longTerm, wagons, medium, restrictions, headcount, production });
  return {
    work: input.work,
    ...(input.firstWeek ? { firstWeek: input.firstWeek } : {}),
    state,
    stateLabel: label,
    status,
    ...(short ? { short } : {}),
    ...(longTerm ? { longTerm } : {}),
    ...(wagons ? { wagons } : {}),
    ...(medium ? { medium } : {}),
    ...(terminality ? { terminality } : {}),
    ...(safety ? { safety } : {}),
    ...(balance ? { balance } : {}),
    ...(restrictions ? { restrictions } : {}),
    ...(headcount ? { headcount } : {}),
    ...(production ? { production } : {}),
    ...(checklist ? { checklist } : {}),
  };
}

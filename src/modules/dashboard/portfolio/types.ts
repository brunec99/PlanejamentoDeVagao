import type { LocalDate } from '@/domain/entities';
import type { LongTermPlanDocument } from '@/domain/long-term-plan';
import type { TerminalityData } from '@/domain/terminality';
import type { DashboardModule, KpiCard, Segment, Tone } from '../model';
import type { DashboardPeriod, PeriodContext, PeriodSelection } from '../period';
import type { BucketPpc } from '../period-views';
import type { WagonStatusCount } from '../wagons-panel';

/** Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"): os quadros do dashboard
 * para todas as obras liberadas para a pessoa, lado a lado, no período escolhido. Este arquivo é o contrato
 * entre o cálculo (`extract.ts`, `aggregate.ts`, `use-portfolio-data.ts`) e a tela/impressão
 * (`portfolio-overview.tsx`, `portfolio-print.tsx`). Só tipos. */

export interface PortfolioWork {
  id: string;
  name: string;
  code: string;
}

/** Estado de um módulo numa obra: pronto, sem dado (com o motivo do "—"), carregando, com erro, ou escondido
 * (a pessoa não pode abrir o módulo ou desmarcou o quadro). */
export type PortfolioCellStatus =
  { kind: 'ready' } | { kind: 'absent'; reason: string } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'hidden' };

export interface PortfolioShort {
  current: BucketPpc;
  previous?: BucketPpc;
  /** Diferença em p.p. entre os valores arredondados do período e do anterior. */
  delta?: number;
  /** PPC geral desde a primeira semana até o fim do período (semanas apuradas, somando linhas). */
  overall: { planned: number; fulfilled: number; closedWeeks: number; percent?: number };
  /** Menos de 4 semanas apuradas até o fim do período: "em início", sem posição (regra 11). */
  early: boolean;
  /** Posição pelo PPC do período entre as obras com PPC e fora de "em início" (1 = maior PPC). */
  position?: number;
  /** As colunas da série (os baldes de `period.series`), na mesma ordem. */
  series: BucketPpc[];
  /** Linhas com Não nas semanas do período, por causa. */
  causes: { cause: string; total: number }[];
  /** Linhas das semanas apuradas do período por empresa (coluna Empresa; `key` sem acento nem caixa). */
  companies: { name: string; key: string; planned: number; fulfilled: number }[];
}
export interface PortfolioLongTerm {
  /** Acumulado medido (última medição até o sábado final) e planejado no sábado final. */
  measured?: number;
  planned: number;
  /** Medido − planejado em p.p. */
  delta?: number;
  /** Avanço dentro do período, em p.p. */
  measuredGain?: number;
  plannedGain: number;
  lastMeasurement?: LocalDate;
  /** Prazo do plano vivo contra a linha de base, em dias (positivo = atraso). */
  slip?: number;
  plannedSource: 'baseline' | 'plan';
}
export interface PortfolioWagons {
  total: number;
  byStatus: WagonStatusCount[];
  taktOverdue: number;
  restrictionsOverdue: number;
  restrictionsResolved: number;
  openDebts: number;
}
export interface PortfolioMedium {
  planName: string;
  planMonth: string;
  planMonthLabel: string;
  done: number;
  inProgress: number;
  notStarted: number;
  late: number;
  /** Variação do término do plano contra a linha de base, em dias úteis; ausente sem linha de base. */
  finishVariance?: number;
  overloaded: number;
}
export interface PortfolioTerminality {
  /** Em aberto no sábado final e na véspera do período. */
  open: number;
  openAtStart: number;
  /** Abertas e resolvidas dentro do período. */
  opened: number;
  resolved: number;
  /** % resolvidas desde a primeira pendência até o sábado final, como a aba 5 exibe. */
  percentLabel: string;
  averageDaysToResolve?: number;
  openByContractor: { label: string; count: number; none?: boolean }[];
}

/** Uma linha do comparativo (regra 10). Bloco ausente: ver `status` daquele módulo. */
export interface PortfolioRow {
  work: PortfolioWork;
  /** Segunda-feira da primeira semana com linha no curto prazo; ausente se a obra não tem linha. */
  firstWeek?: LocalDate;
  /** O pior estado entre os indicadores, como no cartão da lista de obras. */
  state: Tone;
  stateLabel: string;
  status: Record<DashboardModule, PortfolioCellStatus>;
  short?: PortfolioShort;
  longTerm?: PortfolioLongTerm;
  wagons?: PortfolioWagons;
  medium?: PortfolioMedium;
  terminality?: PortfolioTerminality;
}

export interface PortfolioTotals {
  works: number;
  short: {
    planned: number;
    fulfilled: number;
    percent?: number;
    previousPercent?: number;
    /** Diferença em p.p. sobre os valores arredondados. */
    delta?: number;
    /** Obras com PPC no período. */
    withPpc: number;
    below70: PortfolioWork[];
    overallPercent?: number;
  };
  longTerm: { withMeasurement: number; behind: number; worst?: { work: PortfolioWork; delta: number } };
  wagons: {
    works: number;
    taktOverdue: number;
    taktWorks: number;
    restrictionsOverdue: number;
    restrictionsWorks: number;
    restrictionsResolved: number;
  };
  medium: { works: number; late: number; lateWorks: number };
  terminality: { works: number; open: number; openAtStart: number; opened: number; resolved: number; averageDaysToResolve?: number };
}

export interface PortfolioHeat {
  buckets: { key: string; label: string; short: string; analyzed: boolean }[];
  rows: { work: PortfolioWork; cells: (BucketPpc | undefined)[] }[];
  /** Todas as obras somadas, coluna a coluna. */
  total: BucketPpc[];
}
export interface PortfolioPareto {
  failures: number;
  rows: {
    cause: string;
    total: number;
    share: number;
    accumulated: number;
    /** Entre as causas que somam 80% dos não cumpridos. */
    vital: boolean;
    top: { work: PortfolioWork; total: number; share: number };
  }[];
}
export interface PortfolioCompanies {
  /** As obras que aparecem em alguma linha, na ordem das linhas do comparativo. */
  works: PortfolioWork[];
  /** Empresas com linhas em duas ou mais obras no período, da que tem mais linhas para a que tem menos. */
  rows: {
    name: string;
    total: { planned: number; fulfilled: number; percent?: number };
    byWork: Record<string, { planned: number; fulfilled: number; percent?: number }>;
  }[];
}
export interface PortfolioResponsibles {
  /** Até 6 responsáveis terceiros com mais pendências em aberto no sábado final, somando as obras. */
  rows: { label: string; total: number; none?: boolean; byWork: { work: PortfolioWork; count: number }[] }[];
}

export interface PortfolioData {
  period: DashboardPeriod;
  /** As obras escolhidas que já tinham começado até o fim do período, na ordem padrão (nome). */
  rows: PortfolioRow[];
  /** Obras escolhidas que só começam depois do período (citadas na linha de escopo). */
  notStarted: PortfolioWork[];
  totals: PortfolioTotals;
  /** Até 6 cartões (regra 13), já respeitando quadros escondidos e módulos sem acesso. */
  kpis: KpiCard[];
  sentence: Segment[];
  heat: PortfolioHeat;
  pareto: PortfolioPareto;
  companies: PortfolioCompanies;
  responsibles: PortfolioResponsibles;
  /** Por módulo, as obras do período sem dado dele ("Sem plano de longo prazo: …"). */
  noData: Record<DashboardModule, PortfolioWork[]>;
}

export interface PortfolioInput {
  selection?: PeriodSelection;
  /** Obras escolhidas; ausente = todas as liberadas. */
  workIds?: ReadonlySet<string>;
  /** Quadros escolhidos; ausente = todos os que a pessoa pode abrir. */
  modules?: ReadonlySet<DashboardModule>;
}
export interface PortfolioReady {
  data: PortfolioData;
  actorName: string;
  today: LocalDate;
  /** O que o seletor de período precisa (semana atual, primeira semana com dado, âncora). */
  periodContext: PeriodContext;
  /** Todas as obras liberadas para a pessoa, para o seletor "Obras". */
  works: PortfolioWork[];
  /** Quais módulos a pessoa pode abrir. */
  access: Record<DashboardModule, boolean>;
  /** Módulos cuja leitura (rota do Dashboard geral) ainda não chegou ou falhou. */
  loading: DashboardModule[];
  unavailable: { module: DashboardModule; message: string }[];
}
export type PortfolioState =
  { status: 'loading' } | { status: 'error'; message: string; retry: () => void } | ({ status: 'ready' } & PortfolioReady);

/** Resposta de `GET /api/dashboard/obras`: o que não vem no planejamento já carregado, para todas as obras
 * liberadas de uma vez (regra 15). Longo prazo só para quem pode abrir o módulo; terminalidade sem fotos. */
export interface PortfolioSourcesResponse {
  /** A pessoa pode abrir o longo prazo (senão `longTerm` não vem em nenhuma obra). */
  longTermAccess: boolean;
  /** Migração da terminalidade aplicada. */
  terminalityAvailable: boolean;
  works: {
    workId: string;
    /** Documento do plano de longo prazo; `null` = a obra não tem plano salvo; ausente = sem acesso ou erro. */
    longTerm?: LongTermPlanDocument | null;
    longTermError?: string;
    /** Pendências da obra sem fotos (`photos` vazio); ausente = indisponível ou erro. */
    terminality?: TerminalityData;
    terminalityError?: string;
  }[];
}

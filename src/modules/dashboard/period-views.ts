import type { LocalDate } from '@/domain/entities';
import type { CauseTally } from '@/domain/rules';

/** O que cada quadro calcula sobre o período analisado (04/11/2026, modelo "Dashboard geral e escalas de tempo",
 * regra 9): os fluxos somados dentro do período, além dos retratos no sábado final que os quadros já tinham. Os
 * quadros preenchem estes tipos sempre, em toda escala (na semanal, o período é a semana); a aba 0 só os mostra
 * fora da escala semanal, e o Dashboard geral os usa para comparar as obras. Só tipos: o cálculo fica em cada
 * `*-panel.ts`. */

/** PPC de um balde de semanas: o período, o anterior ou uma coluna da série (regra 7). */
export interface BucketPpc {
  key: string;
  /** "outubro de 2026" / "out/26". */
  label: string;
  short: string;
  start: LocalDate;
  end: LocalDate;
  /** Linhas das semanas apuradas do balde (todas as linhas com Status). */
  planned: number;
  fulfilled: number;
  /** Semanas com linha no balde, apuradas e em aberto. */
  closedWeeks: number;
  openWeeks: number;
  /** Linhas sem Status nas semanas em aberto. */
  pending: number;
  /** Cumpridos ÷ assumidos das semanas apuradas, somando linhas; ausente sem semana apurada no balde. */
  percent?: number;
}

/** Curto prazo no período (regras 7 e 8). */
export interface ShortTermPeriodView {
  current: BucketPpc;
  /** O período anterior da mesma escala (personalizado: o intervalo de mesmo tamanho antes). */
  previous?: BucketPpc;
  /** Os baldes da série, do mais antigo ao mais novo; nas escalas fixas o último é o período. */
  series: BucketPpc[];
  /** Média simples dos baldes da série que têm PPC (a linha da média continua sendo média simples). */
  average?: number;
  closedInSeries: number;
  /** Pareto das linhas com Não nas semanas do período. */
  causes: CauseTally[];
  failures: number;
  uncaused: number;
}

/** Longo prazo no período: o avanço feito dentro dele, além do acumulado no sábado final. */
export interface LongTermPeriodView {
  start: LocalDate;
  end: LocalDate;
  /** Medido na véspera do período (a última medição datada antes da segunda-feira inicial). */
  measuredAtStart?: number;
  plannedAtStart: number;
  /** Medido no fim − medido no início, em p.p. (sem medição antes do período, o medido no fim); ausente sem
   * medição até o fim. */
  measuredGain?: number;
  /** Planejado no fim − planejado no início, em p.p. */
  plannedGain: number;
}

/** Vagões no período: o que foi resolvido e criado dentro dele (os demais números são retrato no sábado final). */
export interface WagonsPeriodView {
  start: LocalDate;
  end: LocalDate;
  /** Restrições com `resolvedAt` entre a segunda-feira inicial e o sábado final. */
  restrictionsResolved: number;
  /** Restrições criadas no mesmo intervalo. */
  restrictionsCreated: number;
}

/** Terminalidade no período. */
export interface TerminalityPeriodView {
  start: LocalDate;
  end: LocalDate;
  /** Observadas dentro do período. */
  opened: number;
  /** Corrigidas dentro do período. */
  resolved: number;
  /** Abertas na véspera do período. */
  openAtStart: number;
  /** Média de dias da observação à correção das resolvidas no período; ausente sem resolvida. */
  averageDaysToResolve?: number;
  /** Abertas no sábado final por responsável terceiro, todas (o Dashboard geral soma as obras). */
  openByContractor: { label: string; count: number; none?: boolean }[];
  /** A série por balde: abertas e resolvidas dentro do balde e o saldo em aberto no fim dele. */
  buckets: { key: string; label: string; short: string; opened: number; resolved: number; balance: number }[];
}

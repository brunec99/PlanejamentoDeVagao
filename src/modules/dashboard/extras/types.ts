import type { LocalDate } from '@/domain/entities';
import type { ChecklistFrequency } from '@/domain/equipment-checklist';
import type { LobPerformanceStatus } from '@/domain/lob-performance';
import type { PortfolioSafety } from '../portfolio/types';

/** Quadros novos dos dashboards (12/11/2026, modelo aprovado "Dashboards completos e resumo semanal"): Linha de
 * Balanço e legalização (1.1), Quadro de Restrições (1.4), histograma (2.2), produtividade (2.3), segurança
 * (3.1, que a aba 0 não tinha) e checklist de equipamentos (3.2). Este arquivo é o contrato entre o cálculo no
 * servidor (`blocks.ts`, `GET /api/dashboard/extras`), a aba 0, o Dashboard geral e o resumo semanal por e-mail.
 * Só tipos.
 *
 * Regra 3 do modelo: fluxo somado no período (efetivo, produtividade, apontamentos, cards concluídos, checklists
 * feitos) e retrato no fim (cards em aberto e vencidos, IDP, legalização, checklists vencidos). */

/** O intervalo analisado: `start` é a segunda-feira inicial e `end` o sábado final do período dos dashboards. */
export interface ExtrasRange {
  start: LocalDate;
  end: LocalDate;
  today: LocalDate;
}

/** Dias úteis do intervalo com lançamento. Dia útil = segunda a sexta, fora feriado nacional
 * (`src/domain/holidays.ts`). Os dias esperados vão de `start` ao menor entre `end` e a véspera de `today`:
 * o dia de hoje ainda pode ser lançado e não conta como falta. */
export interface WorkdayCoverage {
  expected: number;
  launched: number;
  /** Dias úteis esperados sem lançamento, em ordem (no máximo 31; `missingCount` traz o total). */
  missing: LocalDate[];
  missingCount: number;
}

export interface ExtrasSeriesPoint {
  /** Segunda-feira da semana ("2026-10-26") ou o mês ("2026-10"). */
  key: string;
  /** "26/10" ou "out/26". */
  label: string;
  value: number;
}

/** Histograma (2.2), regra 4: as contas são as da aba (`headcountSummary`). */
export interface HeadcountBlock {
  manDays: number;
  /** Média de pessoas por dia útil lançado no período. */
  dailyAverage: number;
  peak: number;
  peakDay?: LocalDate;
  /** Parcela dos homens-dia que é de empreiteiro (0–1). */
  contractorShare: number;
  coverage: WorkdayCoverage;
  /** Último dia lançado até o fim do período. */
  lastDay?: LocalDate;
  /** Efetivo médio por dia útil, por semana (períodos de até 16 semanas) ou por mês. */
  series: ExtrasSeriesPoint[];
  seriesGrain: 'semana' | 'mes';
  /** As 5 empresas com mais homens-dia no período. */
  companies: { name: string; manDays: number; averagePresent: number; own: boolean }[];
}

/** Produtividade (2.3), regra 5. */
export interface ProductionBlock {
  entries: number;
  measured: number;
  pending: number;
  manDays: number;
  /** Linhas com produção medida ÷ linhas do período (0–1); ausente sem linha no período. */
  measuredShare?: number;
  coverage: WorkdayCoverage;
  lastDay?: LocalDate;
  /** Até 12 serviços medidos com mais homens-dia no período (a aba 0 mostra 5; o geral pareia por `key` + `unit`). */
  services: { key: string; name: string; unit: string; quantity: number; manDays: number; perManDay: number; measured: number }[];
}

/** Quadro de Restrições (1.4), regra 6. O retrato é no menor entre o fim do período e hoje (`asOf`): card em
 * aberto = criado até lá e não fechado até lá. O status de um card aberto é o atual (o quadro não guarda o
 * histórico de colunas de um jeito que se reconstrua por data). */
export interface RestrictionsBlock {
  asOf: LocalDate;
  open: number;
  byStatus: { todo: number; doing: number; paused: number };
  /** Abertos com a entrega antes de `asOf`. */
  overdue: number;
  /** Ainda em "A fazer", com o "começar até" antes de `asOf` e a entrega ainda não vencida. */
  startOverdue: number;
  /** Concluídos, cancelados e criados dentro do período. */
  doneInPeriod: number;
  cancelledInPeriod: number;
  createdInPeriod: number;
  /** Até 5 responsáveis com mais cards em aberto. */
  byResponsible: { name: string; open: number; overdue: number }[];
}

/** Linha de Balanço (1.1), regra 7: o IDP da última medição fechada até o fim do período. Nunca traz valor em reais. */
export interface LobBlock {
  status: LobPerformanceStatus;
  idp?: number;
  /** % físico real e planejado (0–100) na data da medição. */
  real?: number;
  planned?: number;
  measurementDate?: LocalDate;
  measurementNumber?: number;
  weighting: 'cost' | 'duration';
  baselineName?: string;
}

/** Gantt de legalização (1.1), regra 7. Calculado no cliente (e no servidor da Claudia) a partir do planejamento
 * já carregado, por `buildLegalizationBlock` (`legalization.ts`). */
export interface LegalizationBlock {
  /** Marcos da legalização concluídos e no total. */
  milestones: { done: number; total: number };
  /** Tarefas (folhas) com término previsto antes da data e menos de 100%. */
  late: number;
  tasks: { done: number; total: number };
  next?: { name: string; date: LocalDate };
  deliveryDate?: LocalDate;
  forecast?: LocalDate;
  /** Dias úteis entre a entrega contratual e a prevista; positivo = atraso. */
  lateDays: number;
}

/** Checklist de equipamentos (3.2), regra 8. O quadro de vencidos é sempre o de hoje (a aba não tem retrato por
 * data); inspeções e não conformidades são as do período. */
export interface ChecklistBlock {
  equipment: number;
  /** Checklists devidos hoje (diário de hoje, semanal desta semana, mensal deste mês) e quantos faltam. */
  due: number;
  pending: number;
  /** Até 6 dos que faltam. */
  pendingList: { equipment: string; model: string; frequency: ChecklistFrequency }[];
  runsInPeriod: number;
  /** Inspeções do período com alguma não conformidade e o total de itens não conformes nelas. */
  runsWithNonConformity: number;
  nonConformities: number;
}

/** Uma célula da resposta: pronta, sem dado (a obra nunca usou o módulo, ou nada até o fim do período),
 * migração ausente, ou erro. Célula ausente do objeto = a pessoa não tem o módulo. */
export type ExtrasCell<T> = { kind: 'ready'; data: T } | { kind: 'absent' } | { kind: 'unavailable' } | { kind: 'error'; message: string };

export interface WorkExtras {
  workId: string;
  headcount?: ExtrasCell<HeadcountBlock>;
  production?: ExtrasCell<ProductionBlock>;
  restrictions?: ExtrasCell<RestrictionsBlock>;
  lob?: ExtrasCell<LobBlock>;
  checklist?: ExtrasCell<ChecklistBlock>;
  /** Só quando a leitura pede (`includeSafety`): a aba 0 pede; o Dashboard geral já recebe a segurança pela
   * rota `GET /api/dashboard/obras`. */
  safety?: ExtrasCell<PortfolioSafety>;
}

/** Resposta de `GET /api/dashboard/extras?de=&ate=[&obra=][&seguranca=1]`. Os blocos já vêm calculados para o
 * intervalo: uma obra de dois anos tem mais de dez mil linhas de efetivo, que não precisam ir ao navegador. */
export interface DashboardExtrasResponse {
  range: ExtrasRange;
  works: WorkExtras[];
}

/** O que cada módulo novo precisa em `WorkExtras` (o módulo `balanco` junta `lob` e a legalização do cliente). */
export type ExtrasKey = 'headcount' | 'production' | 'restrictions' | 'lob' | 'checklist' | 'safety';

import type { LocalDate, MediumTermPlan, PlanningData } from '@/domain/entities';
import { isLegalizationPlan, legalizationSummary } from '@/domain/legalization';
import { analyzeSchedule, DEFAULT_CALENDAR } from '@/domain/plan-schedule';
import { rollUpPlan } from '@/domain/rules';
import type { ExtrasRange, LegalizationBlock } from './types';

/** Gantt de legalização (1.1) nos dashboards (12/11/2026, regra 7 do modelo "Dashboards completos e resumo
 * semanal"). Sai do planejamento já carregado: o plano vivo de tipo `legalizacao` da obra, analisado pelo mesmo
 * motor da tela (`analyzeSchedule`) e resumido por `legalizationSummary`, como o topo do Gantt. Puro: roda no
 * navegador (aba 0 e Dashboard geral) e no servidor (Claudia).
 *
 * A data do retrato é o menor entre o fim do período e hoje: tarefa atrasada = folha com término previsto antes
 * dela e menos de 100%; o próximo marco é o primeiro ainda não concluído a partir dela. O avanço é o de hoje (o
 * cronograma não guarda histórico de percentual). */

/** O plano vivo de legalização da obra: sem linha de base; havendo mais de um, o atualizado por último. */
export function legalizationPlanOf(plans: readonly MediumTermPlan[], workId: string): MediumTermPlan | undefined {
  return plans
    .filter(plan => plan.workId === workId && isLegalizationPlan(plan) && !plan.baselineOf)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0];
}

export function buildLegalizationBlock(
  data: Pick<PlanningData, 'plans' | 'planTasks' | 'planDependencies'>,
  workId: string,
  range: ExtrasRange,
): LegalizationBlock | undefined {
  const plan = legalizationPlanOf(data.plans, workId);
  if (!plan) return undefined;
  const tasks = data.planTasks.filter(task => task.planId === plan.id);
  if (!tasks.length) return undefined;
  const ids = new Set(tasks.map(task => task.id));
  const links = data.planDependencies.filter(link => ids.has(link.predecessorId) && ids.has(link.successorId));
  const calendar = plan.calendar ?? DEFAULT_CALENDAR;
  const asOf: LocalDate = range.end < range.today ? range.end : range.today;

  const roll = rollUpPlan(tasks);
  const leaves = tasks.filter(task => !roll.get(task.id)?.summary);
  const counts = {
    late: leaves.filter(task => task.plannedEnd < asOf && task.progress < 100).length,
    tasks: { done: leaves.filter(task => task.progress >= 100).length, total: leaves.length },
  };
  // O motor lança em cronograma inconsistente (ciclo, restrição inválida): o quadro mostra as contagens mesmo assim.
  try {
    const delivery = plan.deliveryDate;
    const analysis = analyzeSchedule(tasks, links, calendar);
    const summary = legalizationSummary(tasks, analysis, delivery ?? analysis.projectFinish ?? asOf, asOf, calendar);
    return {
      milestones: summary.milestones,
      ...counts,
      ...(summary.next ? { next: { name: summary.next.name, date: summary.next.date } } : {}),
      ...(delivery ? { deliveryDate: delivery } : {}),
      ...(delivery && summary.forecast ? { forecast: summary.forecast } : {}),
      lateDays: delivery ? summary.lateDays : 0,
    };
  } catch {
    return { milestones: { done: 0, total: 0 }, ...counts, ...(plan.deliveryDate ? { deliveryDate: plan.deliveryDate } : {}), lateDays: 0 };
  }
}

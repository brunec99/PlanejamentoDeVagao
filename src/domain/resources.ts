import type { PlanningData, Team } from './entities';
import { legalizationPlanIds } from './legalization';

/** Identifies a crew even when different contractors use the same crew name. */
export function teamLabel(team: Pick<Team, 'company' | 'name'>): string {
  return team.company ? `${team.company} · ${team.name}` : team.name;
}

/** Counts references, not workload: past commitments and frozen plans still use this record. */
export function teamUsage(data: PlanningData, teamId: string) {
  const frozen = new Set(data.plans.filter(p => p.frozenAt || p.baselineOf).map(p => p.id));
  const tasks = data.planTasks.filter(t => t.teamId === teamId);
  // Gantt de legalização (04/11/2026, regra 17): as linhas dele (vivo e linhas de base) não são do
  // médio prazo nem das linhas de base do mês, mas seguem no total — a equipe continua vinculada.
  const legalization = legalizationPlanIds(data.plans);
  const monthly = tasks.filter(t => !legalization.has(t.planId));
  const medium = monthly.filter(t => !frozen.has(t.planId)).length;
  const baselines = monthly.length - medium;
  const short = data.commitments.filter(c => c.teamId === teamId).length;
  const activities = data.activities.filter(a => a.teamId === teamId).length;
  // Mostradas à parte nas configurações da obra, para a equipe "sem uso" não ter o excluir travado sem explicação.
  const legalizationTasks = tasks.length - monthly.length;
  return { medium, baselines, legalization: legalizationTasks, short, activities, total: tasks.length + short + activities };
}

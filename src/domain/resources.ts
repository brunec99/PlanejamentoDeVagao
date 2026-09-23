import type { PlanningData, Team } from './entities';

/** Identifies a crew even when different contractors use the same crew name. */
export function teamLabel(team: Pick<Team, 'company' | 'name'>): string {
  return team.company ? `${team.company} · ${team.name}` : team.name;
}

/** Counts references, not workload: past commitments and frozen plans still use this record. */
export function teamUsage(data: PlanningData, teamId: string) {
  const frozen = new Set(data.plans.filter(p => p.frozenAt || p.baselineOf).map(p => p.id));
  const tasks = data.planTasks.filter(t => t.teamId === teamId);
  const medium = tasks.filter(t => !frozen.has(t.planId)).length;
  const baselines = tasks.length - medium;
  const short = data.commitments.filter(c => c.teamId === teamId).length;
  const activities = data.activities.filter(a => a.teamId === teamId).length;
  return { medium, baselines, short, activities, total: tasks.length + short + activities };
}

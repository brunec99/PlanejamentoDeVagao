import type { PlanningRepository } from '../ports/planning-repository';
import { isOverdue, wagonStatus, weightedProgress } from '../../domain/rules';
export async function getPlanning(repository: PlanningRepository, today: string) {
  const data = await repository.getSnapshot();
  return { data, today, wagons: data.wagons.map(wagon => ({ ...wagon,
    status: wagonStatus(wagon, data), overdue: isOverdue(wagon, data, today),
    progress: weightedProgress(data.activities.filter(a => a.wagonId === wagon.id)),
    successorId: data.wagons.find(next => next.predecessorId === wagon.id)?.id,
  })) };
}
export type Planning = Awaited<ReturnType<typeof getPlanning>>;

export function selectWorkPlanning(planning: Planning, workId: string) {
  const work = planning.data.works.find(w => w.id === workId);
  if (!work) return undefined;
  const sequences = planning.data.sequences.filter(s => s.workId === workId);
  const ids = new Set(sequences.map(s => s.id));
  const wagons = planning.wagons.filter(w => ids.has(w.sequenceId)).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.number - b.number);
  const wagonIds = new Set(wagons.map(w => w.id));
  const debts = planning.data.debts.filter(d => planning.data.pendingItems.some(p => p.id === d.pendingItemId && wagonIds.has(p.wagonId)));
  return { work, sequences, wagons, debts };
}

export function selectWagonDetail(planning: Planning, workId: string, wagonId: string) {
  const workPlanning = selectWorkPlanning(planning, workId);
  const wagon = workPlanning?.wagons.find(w => w.id === wagonId);
  if (!wagon || !workPlanning) return undefined;
  const { data } = planning;
  const ancestorIds = new Set<string>();
  let previousId = wagon.predecessorId;
  while (previousId && !ancestorIds.has(previousId) && previousId !== wagon.id) {
    const previous = workPlanning.wagons.find(w => w.id === previousId && w.sequenceId === wagon.sequenceId);
    if (!previous) break;
    ancestorIds.add(previous.id);
    previousId = previous.predecessorId;
  }
  const activities = data.activities.filter(a => a.wagonId === wagonId);
  const activityIds = new Set(activities.map(a => a.id));
  return {
    work: workPlanning.work, wagon, sequence: workPlanning.sequences.find(s => s.id === wagon.sequenceId)!,
    predecessor: workPlanning.wagons.find(w => w.id === wagon.predecessorId),
    successor: workPlanning.wagons.find(w => w.id === wagon.successorId),
    activities, criteria: data.criteria.filter(c => activityIds.has(c.activityId)),
    pendingItems: data.pendingItems.filter(p => p.wagonId === wagonId),
    restrictions: data.restrictions.filter(r => r.wagonId === wagonId),
    releases: data.releases.filter(r => r.wagonId === wagonId),
    debts: data.debts.filter(d => data.pendingItems.some(p => p.id === d.pendingItemId && (p.wagonId === wagonId || ancestorIds.has(p.wagonId)))),
    history: data.history.filter(e => e.entityId === wagonId || activityIds.has(e.entityId)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
  };
}

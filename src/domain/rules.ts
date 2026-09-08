import type { Activity, PlanningData, Wagon, WagonStatus } from './entities';

export function validateActivity(activity: Activity): void {
  if (!Number.isFinite(activity.progress) || activity.progress < 0 || activity.progress > 100) throw new Error('Progresso deve ficar entre 0 e 100.');
  if (!Number.isFinite(activity.weight) || activity.weight <= 0) throw new Error('Peso deve ser positivo.');
  if (activity.plannedEnd < activity.plannedStart) throw new Error('Término deve ser igual ou posterior ao início.');
  if (activity.status === 'completed' && activity.progress !== 100) throw new Error('Atividade concluída exige progresso de 100%.');
}
export function weightedProgress(activities: Activity[]): number {
  activities.forEach(validateActivity);
  const weight = activities.reduce((sum, activity) => sum + activity.weight, 0);
  return weight === 0 ? 0 : activities.reduce((sum, activity) => sum + activity.progress * activity.weight, 0) / weight;
}
export function isTerminal(wagonId: string, data: PlanningData): boolean {
  const required = data.activities.filter(a => a.wagonId === wagonId && a.mandatory);
  const activityIds = new Set(data.activities.filter(a => a.wagonId === wagonId).map(a => a.id));
  return required.length > 0
    && required.every(a => a.progress === 100 && a.status === 'completed')
    && data.criteria.filter(c => activityIds.has(c.activityId) && c.mandatory).every(c => c.fulfilled)
    && !data.pendingItems.some(p => p.wagonId === wagonId && p.status === 'open' && p.blocksTerminality)
    && !data.restrictions.some(r => r.wagonId === wagonId && r.status === 'open' && r.blocksTerminality);
}
export function wagonStatus(wagon: Wagon, data: PlanningData): WagonStatus {
  if (isTerminal(wagon.id, data)) return 'terminal';
  if (data.restrictions.some(r => r.wagonId === wagon.id && r.status === 'open' && (r.blocksExecution || r.blocksTerminality))) return 'restricted';
  if (wagon.actualStart || data.activities.some(a => a.wagonId === wagon.id && (a.progress > 0 || a.status !== 'not_started'))) return 'in_production';
  return 'not_started';
}
export function isOverdue(wagon: Wagon, data: PlanningData, today: string): boolean {
  return wagon.plannedEnd < today && !isTerminal(wagon.id, data);
}
export function validateSequence(wagons: Wagon[]): void {
  const byId = new Map(wagons.map(w => [w.id, w]));
  if (byId.size !== wagons.length) throw new Error('Identificador de vagão duplicado.');
  const successors = new Set<string>();
  const numbers = new Set<string>();
  for (const wagon of wagons) {
    const key = `${wagon.sequenceId}:${wagon.number}`;
    if (numbers.has(key)) throw new Error('Número de vagão duplicado na sequência.');
    numbers.add(key);
    if (wagon.predecessorId) {
      const previous = byId.get(wagon.predecessorId);
      if (!previous || previous.sequenceId !== wagon.sequenceId) throw new Error('Predecessor deve pertencer à mesma sequência.');
      if (successors.has(previous.id)) throw new Error('Um vagão não pode ter múltiplos sucessores.');
      successors.add(previous.id);
    }
    const visited = new Set<string>();
    let cursor: Wagon | undefined = wagon;
    while (cursor) {
      if (visited.has(cursor.id)) throw new Error('Sequência não pode conter ciclos.');
      visited.add(cursor.id);
      cursor = cursor.predecessorId ? byId.get(cursor.predecessorId) : undefined;
    }
  }
}

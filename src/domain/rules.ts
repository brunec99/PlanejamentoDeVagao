import type { Activity, LinkRule, LocalDate, PlanningData, Wagon, WagonStatus, WeeklyCommitment } from './entities';

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
/** PPC: compromissos cumpridos sobre compromissos planejados na semana. Nunca é a média
 * dos percentuais executados — o denominador é o número de compromissos assumidos. */
export function ppc(commitments: WeeklyCommitment[]) {
  const planned = commitments.length;
  const fulfilled = commitments.filter(c => c.fulfilled === true).length;
  const pending = commitments.filter(c => c.fulfilled === undefined).length;
  return { planned, fulfilled, pending, percent: planned === 0 ? 0 : (fulfilled / planned) * 100 };
}
/** Atividades da equipe que se sobrepõem à janela, contra a capacidade cadastrada. */
export function teamLoad(teamId: string, start: LocalDate, end: LocalDate, data: PlanningData) {
  const team = data.teams.find(t => t.id === teamId);
  const assigned = data.activities.filter(a => a.teamId === teamId && a.plannedStart <= end && a.plannedEnd >= start);
  return { assigned: assigned.length, capacity: team?.weeklyCapacity ?? 0, overloaded: !!team && assigned.length > team.weeklyCapacity };
}
/** Propriedades de um elemento IFC que as regras desta versão sabem ler. */
export interface ElementFacts { pavimento: string; tipo: string }
// Pavimentos em IFC brasileiro vêm como "1º Pavimento", "Térreo"; o valor da regra é
// digitado à mão. Sem ignorar acento e indicador ordinal, a regra falharia em silêncio.
const norm = (value: string) => value
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/(\d)\s*[ºª°]/g, '$1')
  .replace(/(\d)\s*[oa](?!\p{L})/gu, '$1')
  .replace(/\s+/g, ' ')
  .trim();
export function matchesRule(rule: LinkRule, element: ElementFacts): boolean {
  return rule.criteria.every(criterion => {
    const actual = norm(element[criterion.property] ?? '');
    const expected = norm(criterion.value);
    return criterion.operator === 'igual' ? actual === expected : actual.includes(expected);
  });
}
/** Serviço vinculado ao elemento: entre as regras que casam, a de menor ordem. Varre sem
 * ordenar porque é chamada uma vez por elemento do modelo. */
export function serviceForElement(rules: LinkRule[], element: ElementFacts): string | undefined {
  let winner: LinkRule | undefined;
  for (const rule of rules) if ((!winner || rule.order < winner.order) && matchesRule(rule, element)) winner = rule;
  return winner?.serviceName;
}
/** Regras cujo critério de pavimento não encontra nenhum pavimento do modelo atual —
 * o vínculo precisa de revisão humana, sem presumir correspondência. */
export function rulesNeedingReview(rules: LinkRule[], storeys: string[]): LinkRule[] {
  return rules.filter(rule => rule.criteria.some(criterion =>
    criterion.property === 'pavimento' && !storeys.some(storey =>
      criterion.operator === 'igual' ? norm(storey) === norm(criterion.value) : norm(storey).includes(norm(criterion.value)))));
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

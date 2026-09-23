import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyTeamLoad, baselineVariance, businessVariance } from '../src/domain/schedule-analysis';
import { DEFAULT_CALENDAR } from '../src/domain/plan-schedule';
import type { Activity, PlanningData, PlanTask } from '../src/domain/entities';

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' };
const empty = (): PlanningData => ({ works: [], locations: [], sequences: [], wagons: [], activities: [], criteria: [], pendingItems: [], restrictions: [], releases: [], debts: [], teams: [], progressEntries: [], commitments: [], baselines: [], dependencies: [], plans: [], planTasks: [], planDependencies: [], ifcModels: [], ifcVersions: [], linkRules: [], users: [], history: [] });
const task = (id: string, start: string, end: string, extra: Partial<PlanTask> = {}): PlanTask => ({ id, ...stamp, planId: 'p', name: id, plannedStart: start, plannedEnd: end, progress: 0, order: Number(id.replace(/\D/g, '')) || 1, level: 0, ...extra });
const activity = (id: string, start: string, end: string, teamId?: string): Activity => ({ id, ...stamp, wagonId: 'w1', name: id, locationId: 'l', responsibleId: 'u', plannedStart: start, plannedEnd: end, progress: 0, status: 'not_started', weight: 1, mandatory: true, origin: 'manual', teamId });

function setup() {
  const data = empty();
  data.sequences.push({ id: 's1', ...stamp, workId: 'obra', name: 'Torre', defaultTaktDays: 5, calendar: 'business_days' }, { id: 's2', ...stamp, workId: 'outra', name: 'Outra', defaultTaktDays: 5, calendar: 'business_days' });
  data.wagons.push({ id: 'w1', ...stamp, sequenceId: 's1', number: 1, plannedStart: '2026-09-01', plannedEnd: '2026-09-30', taktDays: 5, responsibleIds: [] }, { id: 'w2', ...stamp, sequenceId: 's2', number: 1, plannedStart: '2026-09-01', plannedEnd: '2026-09-30', taktDays: 5, responsibleIds: [] });
  data.teams.push({ id: 'eq', ...stamp, workId: 'obra', company: 'Alfa', name: 'Alvenaria', weeklyCapacity: 1 });
  data.plans.push({ id: 'p', ...stamp, workId: 'obra', month: '2026-09', name: 'Setembro', createdBy: 'u' });
  return data;
}
// Semanas de 07/09 (seg) a 13/09 e de 14/09 a 20/09.
const FROM = '2026-09-07', TO = '2026-09-20';

test('item que atravessa a virada da semana conta nas duas semanas', () => {
  const data = setup();
  data.planTasks.push(task('1', '2026-09-11', '2026-09-15', { teamId: 'eq' }));
  const result = weeklyTeamLoad(data, 'obra', FROM, TO);
  assert.deepEqual(result.weeks, ['2026-09-07', '2026-09-14']);
  assert.deepEqual(result.teams[0].weeks.map(w => w.load), [1, 1]);
  assert.equal(result.teams[0].overloadedWeeks, 0);
});

test('início no meio da semana alinha a grade na segunda-feira', () => {
  assert.deepEqual(weeklyTeamLoad(setup(), 'obra', '2026-09-10', '2026-09-16').weeks, ['2026-09-07', '2026-09-14']);
});

test('superalocação acima da capacidade semanal, com os itens que a causam', () => {
  const data = setup();
  data.planTasks.push(task('1', '2026-09-07', '2026-09-08', { teamId: 'eq' }));
  data.activities.push(activity('a1', '2026-09-10', '2026-09-11', 'eq'), activity('fora', '2026-09-10', '2026-09-11'));
  const { teams, unassigned } = weeklyTeamLoad(data, 'obra', FROM, TO);
  const [first, second] = teams[0].weeks;
  assert.equal(first.load, 2); assert.equal(first.overloaded, true);
  assert.deepEqual(first.items.map(i => `${i.kind}:${i.id}`), ['tarefa:1', 'atividade:a1']);
  assert.equal(second.overloaded, false);
  assert.equal(teams[0].peak, 2); assert.equal(teams[0].overloadedWeeks, 1);
  assert.deepEqual(unassigned.map(w => w.load), [1, 0]);
  assert.equal(unassigned[0].overloaded, false);
});

test('plano congelado e atividade de outra obra não contam como carga', () => {
  const data = setup();
  data.plans.push({ id: 'base', ...stamp, workId: 'obra', month: '2026-09', name: 'Base', baselineOf: 'p', frozenAt: '2026-09-02T00:00:00Z', createdBy: 'u' });
  data.planTasks.push(task('1', '2026-09-07', '2026-09-08', { teamId: 'eq', planId: 'base' }));
  data.activities.push({ ...activity('x', '2026-09-07', '2026-09-08', 'eq'), wagonId: 'w2' });
  assert.deepEqual(weeklyTeamLoad(data, 'obra', FROM, TO).teams[0].weeks.map(w => w.load), [0, 0]);
});

test('item de resumo não conta: só os subitens', () => {
  const data = setup();
  data.planTasks.push(
    task('1', '2026-09-07', '2026-09-11', { teamId: 'eq', order: 1, level: 0 }),
    task('2', '2026-09-07', '2026-09-08', { teamId: 'eq', order: 2, level: 1 }),
  );
  const week = weeklyTeamLoad(data, 'obra', FROM, TO).teams[0].weeks[0];
  assert.equal(week.load, 1); assert.equal(week.items[0].id, '2');
});

test('variação em dias úteis: sinal e fim de semana', () => {
  assert.equal(businessVariance('2026-09-11', '2026-09-14'), 1); // sexta → segunda
  assert.equal(businessVariance('2026-09-14', '2026-09-11'), -1);
  assert.equal(businessVariance('2026-09-10', '2026-09-10'), 0);
  assert.equal(businessVariance('2026-09-11', '2026-09-13'), 0); // só atravessa o fim de semana
  assert.equal(businessVariance('2026-09-04', '2026-09-08', { ...DEFAULT_CALENDAR, holidays: ['2026-09-07'] }), 1);
});

test('pareia por sourceTaskId antes do nome e classifica atraso pelo término', () => {
  const live = [task('1', '2026-09-08', '2026-09-14', { name: 'Reboco' }), task('2', '2026-09-07', '2026-09-09', { name: 'Reboco' })];
  // A cópia de "2" vem primeiro e tem o mesmo nome: pelo nome ela seria roubada por "1".
  const base = [task('b2', '2026-09-07', '2026-09-10', { name: 'Reboco', sourceTaskId: '2', order: 1 }), task('b1', '2026-09-07', '2026-09-11', { name: 'Reboco', sourceTaskId: '1', order: 2 })];
  const { rows, summary } = baselineVariance(live, base);
  const one = rows.find(r => r.id === '1')!, two = rows.find(r => r.id === '2')!;
  assert.equal(one.status, 'atrasada'); assert.equal(one.startVariance, 1); assert.equal(one.finishVariance, 1);
  assert.equal(two.status, 'adiantada'); assert.equal(two.finishVariance, -1);
  assert.equal(summary.lateCount, 1); assert.equal(summary.maxDelay, 1); assert.equal(summary.planFinishVariance, 1);
});

test('sem vínculo, pareia pelo nome normalizado; sobra vira nova ou removida', () => {
  const live = [task('1', '2026-09-07', '2026-09-18', { name: 'Contrapiso  Térreo' }), task('2', '2026-09-07', '2026-09-08', { name: 'Pintura' })];
  const base = [task('b1', '2026-09-07', '2026-09-11', { name: 'contrapiso terreo' }), task('b3', '2026-09-07', '2026-09-09', { name: 'Forro', order: 3 })];
  const { rows, summary, critical } = baselineVariance(live, base);
  assert.deepEqual(rows.map(r => `${r.id}:${r.status}`), ['1:atrasada', '2:nova', 'b3:removida']);
  assert.equal(rows[0].finishVariance, 5);
  assert.equal(summary.newCount, 1); assert.equal(summary.removedCount, 1);
  assert.equal(summary.averageDelay, 5); assert.deepEqual(critical.map(r => r.id), ['1']);
});

test('item de resumo fica de fora da comparação', () => {
  const live = [task('1', '2026-09-07', '2026-09-30', { order: 1 }), task('2', '2026-09-07', '2026-09-08', { order: 2, level: 1 })];
  const base = [task('b1', '2026-09-07', '2026-09-08', { order: 1, sourceTaskId: '1' }), task('b2', '2026-09-07', '2026-09-08', { order: 2, level: 1, sourceTaskId: '2' })];
  const { rows } = baselineVariance(live, base);
  assert.deepEqual(rows.map(r => `${r.id}:${r.status}`), ['2:no prazo']);
});

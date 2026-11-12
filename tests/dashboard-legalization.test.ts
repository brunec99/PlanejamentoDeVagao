import test from 'node:test';
import assert from 'node:assert/strict';
import type { MediumTermPlan, PlanningData } from '../src/domain/entities';
import { buildLegalizationTasks, LEGALIZATION_KIND, legalizationMonth, legalizationSummary } from '../src/domain/legalization';
import { analyzeSchedule } from '../src/domain/plan-schedule';
import { rollUpPlan } from '../src/domain/rules';
import { buildLegalizationBlock, legalizationPlanOf } from '../src/modules/dashboard/extras/legalization';
import type { ExtrasRange } from '../src/modules/dashboard/extras/types';

/** Gantt de legalização nos dashboards (12/11/2026, regra 7): o bloco sai do plano vivo de legalização da obra,
 * com as mesmas contas do topo do Gantt. Entrega do exemplo aprovado: 30/09/2027. */

const NOW = '2026-11-04T12:00:00Z';
const DELIVERY = '2027-09-30';
const W = 'obra-1';
const stamp = { createdAt: NOW, updatedAt: NOW };
const plan = (id: string, over: Partial<MediumTermPlan> = {}): MediumTermPlan => ({
  id,
  ...stamp,
  workId: W,
  month: legalizationMonth(DELIVERY),
  name: 'Gantt de legalização',
  createdBy: 'u1',
  kind: LEGALIZATION_KIND,
  deliveryDate: DELIVERY,
  ...over,
});
function dataWith(progress: (name: string, index: number) => number = () => 0) {
  let n = 0;
  const { tasks, links } = buildLegalizationTasks({
    planId: 'leg',
    deliveryDate: DELIVERY,
    template: 'atr',
    newId: () => `id-${++n}`,
    now: NOW,
  });
  const planTasks = tasks.map((task, index) => ({ ...task, progress: progress(task.name, index) }));
  const data: Pick<PlanningData, 'plans' | 'planTasks' | 'planDependencies'> = {
    plans: [plan('leg'), plan('base', { baselineOf: 'leg', frozenAt: NOW }), plan('mes', { kind: undefined, deliveryDate: undefined })],
    planTasks,
    planDependencies: links,
  };
  return { data, tasks: planTasks, links };
}
const range = (end: string, today: string): ExtrasRange => ({ start: '2026-11-09', end, today });

test('obra sem Gantt de legalização (ou só com plano do mês e linha de base) não tem bloco', () => {
  const { data } = dataWith();
  assert.equal(buildLegalizationBlock(data, 'outra-obra', range('2026-11-14', '2026-11-14')), undefined);
  assert.equal(
    buildLegalizationBlock({ ...data, plans: data.plans.filter(p => p.id !== 'leg') }, W, range('2026-11-14', '2026-11-14')),
    undefined,
  );
  assert.equal(legalizationPlanOf(data.plans, W)?.id, 'leg');
});

test('o bloco repete o resumo do Gantt na data: marcos, próximo marco, entrega e previsão', () => {
  const { data, tasks, links } = dataWith();
  const asOf = '2026-11-14';
  const block = buildLegalizationBlock(data, W, range(asOf, asOf))!;
  const summary = legalizationSummary(tasks, analyzeSchedule(tasks, links), DELIVERY, asOf);
  assert.deepEqual(block.milestones, summary.milestones);
  assert.ok(block.milestones.total > 0);
  assert.equal(block.milestones.done, 0);
  assert.deepEqual(block.next, summary.next && { name: summary.next.name, date: summary.next.date });
  assert.equal(block.deliveryDate, DELIVERY);
  assert.equal(block.forecast, summary.forecast);
  assert.equal(block.lateDays, summary.lateDays);
  assert.equal(block.lateDays, 0);
});

test('tarefas: só as folhas contam; atrasada = término antes da data e menos de 100%', () => {
  const { data, tasks } = dataWith();
  const roll = rollUpPlan(tasks);
  const leaves = tasks.filter(t => !roll.get(t.id)?.summary);
  const asOf = '2027-03-13';
  const block = buildLegalizationBlock(data, W, range(asOf, '2027-06-01'))!;
  assert.deepEqual(block.tasks, { done: 0, total: leaves.length });
  const expected = leaves.filter(t => t.plannedEnd < asOf).length;
  assert.ok(expected > 0);
  assert.equal(block.late, expected);
  // Com tudo concluído, nada atrasa e não há próximo marco.
  const done = buildLegalizationBlock(dataWith(() => 100).data, W, range(asOf, '2027-06-01'))!;
  assert.equal(done.late, 0);
  assert.equal(done.tasks.done, leaves.length);
  assert.equal(done.milestones.done, done.milestones.total);
  assert.equal(done.next, undefined);
});

test('o retrato é no menor entre o fim do período e hoje', () => {
  const { data } = dataWith();
  const future = buildLegalizationBlock(data, W, range('2027-03-13', '2026-11-14'))!;
  const today = buildLegalizationBlock(data, W, range('2026-11-14', '2026-11-14'))!;
  assert.deepEqual(future, today);
});

test('sem data de entrega o bloco sai sem previsão; cronograma inconsistente ainda dá as contagens', () => {
  const { data } = dataWith();
  const noDelivery = { ...data, plans: [plan('leg', { deliveryDate: undefined })] };
  const block = buildLegalizationBlock(noDelivery, W, range('2026-11-14', '2026-11-14'))!;
  assert.equal(block.deliveryDate, undefined);
  assert.equal(block.forecast, undefined);
  assert.equal(block.lateDays, 0);
  assert.ok(block.tasks.total > 0);
  // Plano sem tarefa nenhuma: sem dado.
  assert.equal(buildLegalizationBlock({ ...data, planTasks: [] }, W, range('2026-11-14', '2026-11-14')), undefined);
});

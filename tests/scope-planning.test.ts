import test from 'node:test';
import assert from 'node:assert/strict';
import { scopePlanning, slimForModules, slimForShortTerm } from '../src/application/use-cases/scope-planning';
import { createMockData } from '../src/mocks/planning';
import type { PlanningData } from '../src/domain/entities';

test('Fora do desenvolvimento, o payload leva só obras, usuários, equipes e compromissos', () => {
  const data = createMockData();
  data.commitments.push({
    id: 'c-1',
    createdAt: '',
    updatedAt: '',
    workId: 'obra-1',
    name: 'Forro 701',
    supplier: '',
    weekStart: '2026-09-28',
    weekEnd: '2026-10-04',
    responsibleId: 'user-2',
    startDate: '2026-09-28',
    endDate: '2026-09-28',
  });
  const snapshot = structuredClone(data);
  for (const key of ['sequences', 'wagons', 'activities', 'restrictions', 'teams', 'commitments'] as const)
    assert.ok(data[key].length > 0, `${key} do mock precisa ter linhas para o teste valer`);
  const slim = slimForShortTerm(data);
  // As quatro coleções do curto prazo seguem inteiras (mesmas referências), e o histórico também.
  for (const key of ['works', 'users', 'teams', 'commitments', 'history'] as const) assert.equal(slim[key], data[key], key);
  const emptied = [
    'locations',
    'sequences',
    'wagons',
    'activities',
    'criteria',
    'pendingItems',
    'restrictions',
    'releases',
    'debts',
    'progressEntries',
    'baselines',
    'dependencies',
    'plans',
    'planTasks',
    'planDependencies',
    'ifcModels',
    'ifcVersions',
    'linkRules',
  ] as const satisfies readonly (keyof PlanningData)[];
  for (const key of emptied) assert.deepEqual(slim[key], [], key);
  // Nenhuma chave do contrato fica de fora nem sobra: o navegador lê todas.
  assert.deepEqual(Object.keys(slim).sort(), Object.keys(data).sort());
  // A entrada não é tocada: o recorte devolve um objeto novo.
  assert.deepEqual(data, snapshot);
});
test('payload de consulta não expõe plano, tarefa, anotação ou histórico de outra obra', () => {
  const data = createMockData();
  const actor = data.users.find(u => u.id === 'user-2')!;
  actor.workIds = ['obra-1'];
  data.plans.push({
    id: 'secret',
    createdAt: '',
    updatedAt: '',
    workId: 'obra-2',
    month: '2026-09',
    name: 'Restrito',
    createdBy: 'user-1',
  });
  data.planTasks.push({
    id: 'secret-task',
    createdAt: '',
    updatedAt: '',
    planId: 'secret',
    name: 'Restrita',
    notes: 'Confidencial',
    plannedStart: '2026-09-01',
    plannedEnd: '2026-09-01',
    progress: 0,
    level: 0,
    order: 1,
  });
  data.history.push({
    id: 'secret-history',
    entityId: 'deleted-secret-task',
    entityType: 'planning',
    action: 'plan_task_revision',
    authorId: 'user-1',
    occurredAt: '',
    changes: { planId: 'secret', reason: 'Confidencial' },
  });
  const result = scopePlanning(data, actor.id);
  assert.ok(result.works.every(w => w.id === 'obra-1'));
  assert.ok(!result.plans.some(p => p.id === 'secret'));
  assert.ok(!result.planTasks.some(t => t.id === 'secret-task'));
  assert.ok(!result.history.some(h => h.id === 'secret-history'));
  assert.ok(result.users.every(u => u.workIds.every(id => id === 'obra-1')));
});

test('Módulo liberado leva os dados que a tela dele lê, e só eles', () => {
  const data = createMockData();
  const stamp = { createdAt: '', updatedAt: '' };
  data.ifcModels.push({
    id: 'm-1',
    ...stamp,
    workId: 'obra-1',
    name: 'Arquitetura',
    discipline: 'Arquitetura',
  } as PlanningData['ifcModels'][number]);
  data.plans.push({ id: 'p-1', ...stamp, workId: 'obra-1', month: '2026-10', name: 'Plano', createdBy: 'user-1' });
  // Pedro, 14/10/2026: com IFC liberado, os modelos que ele criou precisam chegar à tela.
  const ifc = slimForModules(data, ['ifc']);
  assert.equal(ifc.ifcModels.length, 1);
  assert.equal(ifc.plans.length, 0);
  assert.equal(ifc.wagons.length, 0);
  const medio = slimForModules(data, ['medio-prazo']);
  assert.equal(medio.plans.length, 1);
  assert.ok(medio.activities.length > 0, 'a janela de três meses do médio prazo lê as atividades');
  assert.equal(medio.ifcModels.length, 0);
  assert.equal(slimForModules(data, ['federacao']).ifcModels.length, 1);
  assert.ok(slimForModules(data, ['vagoes']).wagons.length > 0);
  assert.equal(slimForModules(data, ['desconhecido']).ifcModels.length, 0);
  assert.deepEqual(slimForModules(data, []), slimForShortTerm(data));
  assert.equal(data.ifcModels.length, 1, 'a entrada não é alterada');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlanning, selectWorkPlanning, selectWagonDetail } from '../src/application/use-cases/get-planning';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { DEMO_DATE } from '../src/mocks/planning';
const load = () => getPlanning(new MockPlanningRepository(), DEMO_DATE);
test('consulta isola obras e trata obra vazia ou inexistente', async () => {
  const p = await load();
  assert.equal(selectWorkPlanning(p, 'obra-1')?.wagons.length, 6);
  assert.equal(selectWorkPlanning(p, 'obra-2')?.wagons.length, 0);
  assert.equal(selectWorkPlanning(p, 'obra-2')?.debts.length, 0);
  assert.equal(selectWorkPlanning(p, 'inexistente'), undefined);
  assert.equal(selectWagonDetail(p, 'obra-2', 'v1'), undefined);
  assert.equal(selectWagonDetail(p, 'obra-1', 'inexistente'), undefined);
});
test('detalhe associa atividades de locais distintos e navegação temporal', async () => {
  const detail = selectWagonDetail(await load(), 'obra-1', 'v2')!;
  assert.equal(detail.predecessor?.id, 'v1');
  assert.equal(detail.successor?.id, 'v3');
  assert.equal(detail.activities.length, 2);
  assert.equal(new Set(detail.activities.map(a => a.locationId)).size, 2);
  assert.ok(detail.criteria.every(c => detail.activities.some(a => a.id === c.activityId)));
});
test('dívida aparece na origem e nos sucessores sem contaminar outra sequência', async () => {
  const p = await load();
  assert.equal(selectWagonDetail(p, 'obra-1', 'v2')?.debts[0].id, 'd1');
  assert.equal(selectWagonDetail(p, 'obra-1', 'v3')?.debts[0].id, 'd1');
  assert.equal(selectWagonDetail(p, 'obra-1', 'v1')?.debts.length, 0);
  assert.equal(selectWagonDetail(p, 'obra-1', 'v4')?.debts.length, 0);
  assert.equal(selectWagonDetail(p, 'obra-1', 'v6')?.debts.length, 0);
});
test('início e fim de sequência não inventam vizinhos', async () => {
  const p = await load();
  assert.equal(selectWagonDetail(p, 'obra-1', 'v1')?.predecessor, undefined);
  assert.equal(selectWagonDetail(p, 'obra-1', 'v3')?.successor, undefined);
  assert.equal(selectWagonDetail(p, 'obra-1', 'v6')?.predecessor, undefined);
  assert.equal(selectWagonDetail(p, 'obra-1', 'v6')?.successor, undefined);
});

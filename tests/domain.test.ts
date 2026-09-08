import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockData, DEMO_DATE } from '../src/mocks/planning';
import { isTerminal, isOverdue, wagonStatus, weightedProgress, validateSequence } from '../src/domain/rules';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { getPlanning } from '../src/application/use-cases/get-planning';
test('fim do takt não conclui vagão', () => { const d = createMockData(); assert.equal(isOverdue(d.wagons[1], d, DEMO_DATE), true); assert.equal(isTerminal('v2', d), false); });
test('100% exige critérios obrigatórios', () => { const d = createMockData(); assert.equal(isTerminal('v6', d), false); d.criteria[5].fulfilled = true; assert.equal(isTerminal('v6', d), true); });
test('vagão vazio não é terminal', () => { const d = createMockData(); d.activities = []; assert.equal(isTerminal('v1', d), false); });
test('pendência e restrição bloqueiam terminalidade', () => { const d = createMockData(); d.pendingItems[0].wagonId = 'v1'; assert.equal(isTerminal('v1', d), false); d.pendingItems[0].status = 'resolved'; assert.equal(isTerminal('v1', d), true); d.restrictions[0].wagonId = 'v1'; assert.equal(isTerminal('v1', d), false); });
test('status separa restrição, produção e início', () => { const d = createMockData(); assert.deepEqual(d.wagons.map(w => wagonStatus(w,d)), ['terminal','in_production','restricted','in_production','not_started','in_production']); });
test('progresso considera pesos e rejeita valores inválidos', () => { const d = createMockData(); const a = { ...d.activities[0], weight: 3 }; const b = { ...d.activities[4], weight: 1 }; assert.equal(weightedProgress([a,b]),75); assert.throws(() => weightedProgress([{ ...a, weight: 0 }])); assert.throws(() => weightedProgress([{ ...a, progress: 101 }])); assert.equal(weightedProgress([]),0); });
test('sequência rejeita ciclos, ramificações e predecessor de outra frente', () => { const d = createMockData(); validateSequence(d.wagons); assert.throws(() => validateSequence(d.wagons.map(w => w.id === 'v1' ? {...w, predecessorId:'v3'} : w))); assert.throws(() => validateSequence(d.wagons.map(w => w.id === 'v3' ? {...w, predecessorId:'v1'} : w))); assert.throws(() => validateSequence(d.wagons.map(w => w.id === 'v4' ? {...w, predecessorId:'v1'} : w))); });
test('liberação excepcional não encerra pendência nem predecessor', () => { const d = createMockData(); assert.equal(d.releases.find(r => r.wagonId === 'v3')?.type, 'exceptional'); assert.equal(isTerminal('v2', d), false); assert.equal(d.pendingItems.find(p => p.id === d.debts[0].pendingItemId)?.status, 'open'); });
test('repositório isola snapshots e instâncias', async () => { const a = new MockPlanningRepository(); const snapshot = await a.getSnapshot(); snapshot.wagons.length = 0; assert.equal((await a.getSnapshot()).wagons.length,6); assert.equal((await new MockPlanningRepository().getSnapshot()).wagons.length,6); });
test('consulta entrega sucessor derivado e status calculado', async () => { const result = await getPlanning(new MockPlanningRepository(), DEMO_DATE); assert.equal(result.wagons[0].successorId,'v2'); assert.equal(result.wagons[0].status,'terminal'); });

test('vagão reúne atividades em locais distintos sem local próprio', async () => {
  const d = createMockData();
  assert.equal('locationId' in d.wagons[0], false);
  const activities = d.activities.filter(a => a.wagonId === 'v1');
  assert.ok(new Set(activities.map(a => a.locationId)).size > 1);
  const before = isTerminal('v1', d);
  activities[0].locationId = 'local-3';
  assert.equal(isTerminal('v1', d), before);
  activities[1].progress = 80;
  activities[1].status = 'in_progress';
  assert.equal(isTerminal('v1', d), false);
});

test('cenários respeitam janelas temporais, locais da obra e liberações', () => {
  const d = createMockData();
  for (const wagon of d.wagons) {
    const sequence = d.sequences.find(s => s.id === wagon.sequenceId)!;
    const predecessor = d.wagons.find(w => w.id === wagon.predecessorId);
    if (predecessor) assert.ok(predecessor.plannedEnd < wagon.plannedStart);
    if (wagon.actualStart) assert.ok(d.releases.some(r => r.wagonId === wagon.id && r.releasedAt.slice(0, 10) <= wagon.actualStart!));
    for (const activity of d.activities.filter(a => a.wagonId === wagon.id)) {
      assert.ok(activity.plannedStart >= wagon.plannedStart && activity.plannedEnd <= wagon.plannedEnd);
      assert.equal(d.locations.find(l => l.id === activity.locationId)?.workId, sequence.workId);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockData, DEMO_DATE } from '../src/mocks/planning';
import { planSequenceRegeneration } from '../src/application/use-cases/regenerate-sequence';
import { diffDeletedIds } from '../src/infrastructure/repositories/supabase/mappers';
import type { ImportedActivity } from '../src/application/use-cases/commands';

const row = (externalId: string, start: string, end: string, progress = 0): ImportedActivity =>
  ({ externalId, name: `Atividade ${externalId}`, location: 'Térreo', plannedStart: start, plannedEnd: end, progress });

test('regenera só a cauda não liberada, preservando o vagão liberado', () => {
  const d = createMockData();
  // seq-2: v4 (liberado, sem predecessor) -> v5 (sem liberação) — exatamente o caso real.
  const plan = planSequenceRegeneration(d, 'seq-2', '99999', [row('a', '2026-09-16', '2026-09-18')], 5, DEMO_DATE);
  assert.equal(plan.aborted, false);
  assert.deepEqual(plan.removedWagonIds, ['v5']);
  assert.equal(plan.frozenWagonId, 'v4');
  assert.equal(plan.startNumber, d.wagons.find(w => w.id === 'v4')!.number + 1);
  // atividades do v5 removido também somem do plano de remoção
  const v5ActivityIds = d.activities.filter(a => a.wagonId === 'v5').map(a => a.id);
  assert.ok(v5ActivityIds.length > 0);
  for (const id of v5ActivityIds) assert.ok(plan.removedActivityIds.includes(id));
});

test('sequência inteiramente liberada só acrescenta vagões novos, nada é removido', () => {
  const d = createMockData();
  // seq-1: v1 -> v2 -> v3, todos liberados.
  const plan = planSequenceRegeneration(d, 'seq-1', '99999', [row('b', '2026-09-20', '2026-09-22')], 5, DEMO_DATE);
  assert.equal(plan.aborted, false);
  assert.deepEqual(plan.removedWagonIds, []);
  assert.equal(plan.frozenWagonId, 'v3');
  assert.equal(plan.windows.length, 1);
});

test('aborta quando um vagão liberado vem depois de um não liberado', () => {
  const d = createMockData();
  // Força v3 (não liberado neste cenário) a ficar antes de v-extra (liberado), fora de ordem.
  d.releases = d.releases.filter(r => r.wagonId !== 'v3');
  d.wagons.push({ ...d.wagons.find(w => w.id === 'v3')!, id: 'v3b', number: 4, predecessorId: 'v3', plannedStart: '2026-09-11', plannedEnd: '2026-09-15' });
  d.releases.push({ id: 'lx', createdAt: DEMO_DATE, updatedAt: DEMO_DATE, wagonId: 'v3b', predecessorId: 'v3', type: 'exceptional', authorizedBy: 'user-1', releasedAt: DEMO_DATE, acceptedPendingIds: [], acknowledgedDebtIds: [], justification: 'x', regularizationResponsibleId: 'user-1', dueDate: '2026-09-20' });
  const plan = planSequenceRegeneration(d, 'seq-1', '99999', [], 5, DEMO_DATE);
  assert.equal(plan.aborted, true);
  assert.match(plan.reason!, /ordem inesperada/);
});

test('atividades muito longas ou com progresso ficam de fora e são contadas', () => {
  const d = createMockData();
  const rows = [
    row('c1', '2026-09-16', '2026-09-30'), // 15 dias, maior que o takt de 5
    row('c2', '2026-09-16', '2026-09-18', 40), // progresso > 0
    row('c3', '2026-09-16', '2026-09-18'), // essa deve entrar
  ];
  const plan = planSequenceRegeneration(d, 'seq-2', '99999', rows, 5, DEMO_DATE);
  assert.equal(plan.skippedTooLong, 1);
  assert.equal(plan.skippedProgress, 1);
  assert.equal(plan.windows.flatMap(w => w.members).length, 1);
});

test('sem vagão liberado, usa a data de início configurada na sequência em vez de hoje', () => {
  const d = createMockData();
  // seq-2 sem nenhuma liberação: nenhum vagão congelado, ponto de partida vem da config.
  d.releases = d.releases.filter(r => r.wagonId !== 'v4');
  const sequence = d.sequences.find(s => s.id === 'seq-2')!;
  sequence.startDate = '2026-09-21';
  const plan = planSequenceRegeneration(d, 'seq-2', '99999', [row('z', '2026-09-19', '2026-09-23')], 5, DEMO_DATE);
  assert.equal(plan.aborted, false);
  assert.equal(plan.frozenWagonId, undefined);
  assert.equal(plan.windows.length, 1);
  assert.equal(plan.windows[0].plannedStart, '2026-09-21');
});

test('diffDeletedIds encontra só os ids que desapareceram entre dois snapshots', () => {
  const before = createMockData();
  const after = createMockData();
  after.wagons = after.wagons.filter(w => w.id !== 'v5');
  after.activities = after.activities.filter(a => a.wagonId !== 'v5' && a.id !== 'a1');
  const diff = diffDeletedIds(before, after);
  assert.deepEqual(diff.wagons, ['v5']);
  assert.ok(diff.activities.includes('a1'));
  assert.ok(!diff.activities.includes('a2'));
});

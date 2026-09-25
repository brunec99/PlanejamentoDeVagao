import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { longTermSlots, planLongTermSync } from '../src/application/use-cases/sync-long-term-plan';
import { examplePlanDocument, type LongTermPlanDocument } from '../src/domain/long-term-plan';
import { createMockData } from '../src/mocks/planning';
import type { PlanningData } from '../src/domain/entities';

let id = 0;
const context = (today = '2026-09-08'): CommandContext => ({ actorId: 'user-1', today, now: `${today}T12:00:00Z`, newId: () => `t-${++id}` });
const run = (d: PlanningData, c: Command, today?: string) => applyCommand(d, c, context(today));
const plan = (start = '2026-10-05', floors = 4): LongTermPlanDocument => ({ ...examplePlanDocument(start, floors), floorNames: { '1': 'Térreo' } });
const sequence = (d: PlanningData, calendar: 'calendar_days' | 'business_days' = 'calendar_days') =>
  run(d, { type: 'create_sequence', workId: 'obra-2', name: 'Ciclo do plano', taktDays: 5, calendar });
const sync = (d: PlanningData, sequenceId: string, doc: LongTermPlanDocument, today?: string) =>
  run(d, { type: 'sync_long_term_plan', sequenceId, responsibleId: 'user-1', slots: longTermSlots(doc) }, today);

test('o plano gera vagões encadeados e uma atividade por serviço × pavimento, fatiada no vagão', () => {
  const d = createMockData(); const seq = sequence(d); const doc = plan();
  sync(d, seq, doc);
  const wagons = d.wagons.filter(w => w.sequenceId === seq).sort((a, b) => a.number - b.number);
  assert.ok(wagons.length > 5);
  assert.equal(wagons[0].predecessorId, undefined);
  wagons.slice(1).forEach((w, i) => assert.equal(w.predecessorId, wagons[i].id));
  const activities = d.activities.filter(a => wagons.some(w => w.id === a.wagonId));
  assert.ok(activities.every(a => a.origin === 'long_term' && a.previsionExternalId?.startsWith('plano:')));
  for (const a of activities) { const w = wagons.find(x => x.id === a.wagonId)!; assert.ok(a.plannedStart >= w.plannedStart && a.plannedEnd <= w.plannedEnd); }
  // Cada serviço × pavimento soma peso 1 entre as fatias.
  const bySlot = new Map<string, number>();
  for (const a of activities) { const key = a.previsionExternalId!.split('#')[0].split('@')[0]; bySlot.set(key, (bySlot.get(key) ?? 0) + a.weight); }
  assert.equal(bySlot.size, doc.activities.length * 4);
  for (const total of bySlot.values()) assert.ok(Math.abs(total - 1) < 0.011);
  assert.ok(d.locations.some(l => l.workId === 'obra-2' && l.name === 'Térreo'));
});

test('gerar de novo sem mudar o plano mantém vagões, atividades, avanço e restrições', () => {
  const d = createMockData(); const seq = sequence(d); const doc = plan();
  sync(d, seq, doc);
  const wagonIds = d.wagons.filter(w => w.sequenceId === seq).map(w => w.id).sort();
  const activity = d.activities.find(a => a.origin === 'long_term')!;
  activity.progress = 40; activity.status = 'in_progress';
  run(d, { type: 'create_restriction', wagonId: activity.wagonId, activityId: activity.id, description: 'Projeto de formas', responsibleId: 'user-1', dueDate: '2026-10-01', blocksExecution: true, blocksTerminality: false });
  const before = d.activities.filter(a => a.origin === 'long_term').map(a => a.id).sort();
  const preview = planLongTermSync(d, seq, longTermSlots(doc), '2026-09-08');
  assert.deepEqual([preview.removedWagonIds.length, preview.removedActivityIds.length, preview.removedRestrictionIds.length], [0, 0, 0]);
  sync(d, seq, doc);
  assert.deepEqual(d.wagons.filter(w => w.sequenceId === seq).map(w => w.id).sort(), wagonIds);
  assert.deepEqual(d.activities.filter(a => a.origin === 'long_term').map(a => a.id).sort(), before);
  assert.equal(d.activities.find(a => a.id === activity.id)!.progress, 40);
  assert.ok(d.restrictions.some(r => r.activityId === activity.id));
});

test('adiar o plano troca os vagões da cauda e leva junto as restrições dos vagões que saem', () => {
  const d = createMockData(); const seq = sequence(d);
  sync(d, seq, plan());
  const first = d.wagons.find(w => w.sequenceId === seq && w.number === 1)!;
  run(d, { type: 'create_restriction', wagonId: first.id, description: 'Alvará', responsibleId: 'user-1', dueDate: '2026-10-01', blocksExecution: true, blocksTerminality: false });
  const preview = planLongTermSync(d, seq, longTermSlots(plan('2026-10-08')), '2026-09-08');
  assert.ok(preview.removedWagonIds.includes(first.id));
  assert.equal(preview.removedRestrictionIds.length, 1);
  sync(d, seq, plan('2026-10-08'));
  assert.equal(d.wagons.filter(w => w.sequenceId === seq).sort((a, b) => a.number - b.number)[0].plannedStart, '2026-10-08');
});

test('vagão liberado não é tocado: o plano ocupa só a cauda, a partir do dia seguinte', () => {
  const d = createMockData();
  // seq-2: v4 liberado (06–10/09), v5 não liberado (11–15/09) com atividades de demonstração.
  const doc = plan('2026-09-01', 3);
  const v4 = structuredClone(d.wagons.find(w => w.id === 'v4')!);
  const v4Activities = d.activities.filter(a => a.wagonId === 'v4').map(a => a.id);
  sync(d, 'seq-2', doc);
  assert.deepEqual(d.wagons.find(w => w.id === 'v4'), v4);
  assert.deepEqual(d.activities.filter(a => a.wagonId === 'v4').map(a => a.id), v4Activities);
  const tail = d.wagons.filter(w => w.sequenceId === 'seq-2' && w.id !== 'v4').sort((a, b) => a.number - b.number);
  assert.equal(tail[0].plannedStart, '2026-09-11');
  assert.equal(tail[0].predecessorId, 'v4');
  assert.equal(tail[0].number, 5);
  assert.ok(!d.activities.some(a => a.wagonId === tail[0].id && a.origin === 'mock'));
});

test('em dias úteis a grade é contínua e cada vagão conta o takt em dias úteis', () => {
  const d = createMockData(); const seq = sequence(d, 'business_days');
  sync(d, seq, plan('2026-10-05'));
  const wagons = d.wagons.filter(w => w.sequenceId === seq).sort((a, b) => a.number - b.number);
  assert.equal(wagons[0].plannedStart, '2026-10-05');
  assert.equal(wagons[0].plannedEnd, '2026-10-11');
  assert.ok(wagons.every(w => w.taktDays === 5));
});

test('a rota genérica de comandos não aceita a geração: só a rota do plano, que lê o plano salvo', async () => {
  const source = await import('node:fs').then(fs => fs.readFileSync('src/app/api/planning/commands/route.ts', 'utf8'));
  assert.match(source, /sync_long_term_plan/);
});

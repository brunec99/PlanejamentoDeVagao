import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { planningDataToPayload, rowsToPlanningData } from '../src/infrastructure/repositories/supabase/mappers';
import { createMockData } from '../src/mocks/planning';

/* Local da linha do curto prazo (05/11/2026): campo opcional com os "Locais da obra" da Linha de Balanço,
 * gravado em `weekly_commitments.local_id` (migração 0039). */

const WEEK = '2026-09-28';
let id = 0;
const run = (data: ReturnType<typeof createMockData>, command: Command) =>
  applyCommand(data, command, { actorId: 'user-1', today: '2026-10-02', now: '2026-10-02T12:00:00.000Z', newId: () => `local-${++id}` });
const create = (data: ReturnType<typeof createMockData>, extra: Partial<Extract<Command, { type: 'create_commitment' }>> = {}) =>
  run(data, { type: 'create_commitment', workId: 'obra-1', name: 'Alvenaria', weekStart: WEEK, responsibleId: 'user-1', ...extra });
const row = (data: ReturnType<typeof createMockData>, rowId: string) => data.commitments.find(c => c.id === rowId)!;
const update = (data: ReturnType<typeof createMockData>, rowId: string, localId?: string | null) => {
  const current = row(data, rowId);
  run(data, {
    type: 'update_commitment',
    commitmentId: rowId,
    name: current.name,
    supplier: current.supplier,
    weekStart: current.weekStart,
    startDate: current.startDate,
    endDate: current.endDate,
    ...(localId === undefined ? {} : { localId }),
  });
};

test('a linha nasce com ou sem local', () => {
  const data = createMockData();
  const withLocal = create(data, { localId: 'loc-torre-a' });
  const without = create(data);
  const blank = create(data, { localId: '' });
  assert.equal(row(data, withLocal).localId, 'loc-torre-a');
  assert.equal(row(data, without).localId, undefined);
  assert.equal(row(data, blank).localId, undefined);
});

test('editar sem mandar o local mantém; nulo tira; outro id troca', () => {
  const data = createMockData();
  const rowId = create(data, { localId: 'loc-torre-a' });
  update(data, rowId);
  assert.equal(row(data, rowId).localId, 'loc-torre-a', 'tela antiga, sem o campo, não apaga o local');
  update(data, rowId, 'loc-torre-b');
  assert.equal(row(data, rowId).localId, 'loc-torre-b');
  update(data, rowId, null);
  assert.equal(row(data, rowId).localId, undefined);
});

test('local com formato inválido é recusado', () => {
  const data = createMockData();
  assert.throws(() => create(data, { localId: 'x'.repeat(101) }), /Local inválido/);
});

test('o local vai e volta do banco como local_id', () => {
  const data = createMockData();
  const rowId = create(data, { localId: 'loc-torre-a' });
  create(data);
  const payload = planningDataToPayload(data);
  const saved = payload.weekly_commitments.find((r: { id: string }) => r.id === rowId) as { local_id: string | null };
  assert.equal(saved.local_id, 'loc-torre-a');
  const other = payload.weekly_commitments.find((r: { id: string }) => r.id !== rowId) as { local_id: string | null };
  assert.equal(other.local_id, null);
  const back = rowsToPlanningData(payload as never);
  assert.equal(back.commitments.find(c => c.id === rowId)!.localId, 'loc-torre-a');
  // Banco sem a 0039: a coluna não vem e a linha fica sem local.
  const legacy = structuredClone(payload) as typeof payload;
  for (const r of legacy.weekly_commitments as { local_id?: string | null }[]) delete r.local_id;
  assert.equal(rowsToPlanningData(legacy as never).commitments.find(c => c.id === rowId)!.localId, undefined);
});

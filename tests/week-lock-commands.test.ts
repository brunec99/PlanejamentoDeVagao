import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { createMockData } from '../src/mocks/planning';

// Semana de 28/09/2026: aberta até terça 06/10; no dia 09/10 está encerrada. user-2 é planejador.
let id = 0;
const run = (data: ReturnType<typeof createMockData>, command: Command, actorId: string, today: string) =>
  applyCommand(data, command, { actorId, today, now: `${today}T12:00:00.000Z`, newId: () => `lock-${++id}` });

const withRow = () => {
  const data = createMockData();
  data.users.find(u => u.id === 'user-2')!.role = 'planner';
  data.users.find(u => u.id === 'user-1')!.role = 'admin';
  const rowId = run(
    data,
    { type: 'create_commitment', workId: 'obra-1', name: 'Forro 701', weekStart: '2026-09-28', responsibleId: 'user-2' },
    'user-2',
    '2026-10-02',
  );
  return { data, rowId };
};

test('Semana encerrada: o Realizado, a causa e a justificativa continuam abertos a quem edita', () => {
  const { data, rowId } = withRow();
  run(
    data,
    { type: 'record_fulfillment', commitmentId: rowId, fulfilled: false, cause: 'Falta de Material', justification: 'Gesso não chegou' },
    'user-2',
    '2026-10-09',
  );
  const row = data.commitments.find(c => c.id === rowId)!;
  assert.deepEqual([row.fulfilled, row.cause, row.justification], [false, 'Falta de Material', 'Gesso não chegou']);
});

test('Semana encerrada: incluir, editar e excluir linhas fica com os admins', () => {
  const { data, rowId } = withRow();
  const row = data.commitments.find(c => c.id === rowId)!;
  const edit: Command = {
    type: 'update_commitment',
    commitmentId: rowId,
    name: 'Outro nome',
    supplier: '',
    weekStart: row.weekStart,
    startDate: row.startDate,
    endDate: row.endDate,
  };
  assert.throws(() => run(data, edit, 'user-2', '2026-10-09'), /encerrada/);
  assert.throws(() => run(data, { type: 'delete_commitment', commitmentId: rowId }, 'user-2', '2026-10-09'), /encerrada/);
  assert.throws(
    () =>
      run(
        data,
        { type: 'create_commitment', workId: 'obra-1', name: 'Nova', weekStart: '2026-09-28', responsibleId: 'user-2' },
        'user-2',
        '2026-10-09',
      ),
    /encerrada/,
  );
  run(data, edit, 'user-1', '2026-10-09');
  assert.equal(data.commitments.find(c => c.id === rowId)!.name, 'Outro nome');
});

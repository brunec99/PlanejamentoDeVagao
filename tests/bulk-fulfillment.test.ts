import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { commandScope } from '../src/application/use-cases/command-scope';
import { createMockData } from '../src/mocks/planning';

/* Apontamento em lote (26/10/2026): a barra de seleção e a alça de arrastar da planilha mandam um
 * comando só com várias linhas; as regras são as mesmas do apontamento de uma linha. */

let id = 0;
const run = (data: ReturnType<typeof createMockData>, command: Command, actorId = 'user-1') =>
  applyCommand(data, command, { actorId, today: '2026-10-02', now: '2026-10-02T12:00:00.000Z', newId: () => `lote-${++id}` });

const withRows = (count: number) => {
  const data = createMockData();
  data.users.find(u => u.id === 'user-1')!.role = 'admin';
  const ids = Array.from({ length: count }, (_, i) =>
    run(data, { type: 'create_commitment', workId: 'obra-1', name: `Linha ${i + 1}`, weekStart: '2026-09-28', responsibleId: 'user-1' }),
  );
  return { data, ids };
};

test('grava Sim e Não com causa em várias linhas de uma vez, com quem e quando', () => {
  const { data, ids } = withRows(3);
  run(data, {
    type: 'record_fulfillments',
    items: [
      { commitmentId: ids[0], fulfilled: true, justification: ' ok ' },
      { commitmentId: ids[1], fulfilled: false, cause: 'Intempéries', justification: 'Chuva' },
      { commitmentId: ids[2], fulfilled: false, cause: 'Intempéries' },
    ],
  });
  const rows = ids.map(rowId => data.commitments.find(c => c.id === rowId)!);
  assert.deepEqual(
    rows.map(r => [r.fulfilled, r.cause, r.justification, r.recordedBy]),
    [
      [true, undefined, 'ok', 'user-1'],
      [false, 'Intempéries', 'Chuva', 'user-1'],
      [false, 'Intempéries', undefined, 'user-1'],
    ],
  );
  assert.equal(data.history.filter(h => h.action === 'record_fulfillments').length, 1, 'um evento só para o lote');
});

test('uma linha recusada derruba o lote inteiro: nada fica meio gravado', () => {
  const { data, ids } = withRows(2);
  assert.throws(
    () =>
      run(data, {
        type: 'record_fulfillments',
        items: [
          { commitmentId: ids[0], fulfilled: true },
          { commitmentId: ids[1], fulfilled: false, cause: 'Causa inventada' },
        ],
      }),
    /fora da lista/,
  );
  // O chamador descarta o rascunho com o erro; aqui conferimos só que a recusa saiu da regra.
});

test('lote vazio, repetido ou grande demais é recusado antes de tocar nas linhas', () => {
  const { data, ids } = withRows(1);
  assert.throws(() => run(data, { type: 'record_fulfillments', items: [] }), /ao menos uma linha/);
  assert.throws(
    () =>
      run(data, {
        type: 'record_fulfillments',
        items: [
          { commitmentId: ids[0], fulfilled: true },
          { commitmentId: ids[0], fulfilled: false, cause: 'Intempéries' },
        ],
      }),
    /mais de uma vez/,
  );
  const many = Array.from({ length: 501 }, (_, i) => ({ commitmentId: `x${i}`, fulfilled: true }));
  assert.throws(() => run(data, { type: 'record_fulfillments', items: many }), /até 500/);
  assert.equal(data.commitments.find(c => c.id === ids[0])!.fulfilled, undefined);
});

test('consulta não aponta em lote; o recorte da leitura é só as linhas do lote', () => {
  const { data, ids } = withRows(2);
  data.users.find(u => u.id === 'user-2')!.role = 'viewer';
  assert.throws(() => run(data, { type: 'record_fulfillments', items: [{ commitmentId: ids[0], fulfilled: true }] }, 'user-2'), /consulta/);
  const command: Command = {
    type: 'record_fulfillments',
    items: [
      { commitmentId: ids[0], fulfilled: true },
      { commitmentId: ids[1], fulfilled: true },
    ],
  };
  assert.deepEqual(commandScope(command, ['obra-1']), { workIds: ['obra-1'], commitments: { ids } });
});

test('item com `clear` limpa o apontamento daquela linha no mesmo lote (é o que o Desfazer manda)', () => {
  const { data, ids } = withRows(2);
  run(data, {
    type: 'record_fulfillments',
    items: [
      { commitmentId: ids[0], fulfilled: true },
      { commitmentId: ids[1], fulfilled: true },
    ],
  });
  run(data, {
    type: 'record_fulfillments',
    items: [
      { commitmentId: ids[0], clear: true },
      { commitmentId: ids[1], fulfilled: false, cause: 'Intempéries' },
    ],
  });
  const [a, b] = ids.map(rowId => data.commitments.find(c => c.id === rowId)!);
  assert.deepEqual([a.fulfilled, a.cause, a.recordedBy], [undefined, undefined, undefined]);
  assert.deepEqual([b.fulfilled, b.cause], [false, 'Intempéries']);
});

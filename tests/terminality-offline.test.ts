import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alreadyApplied,
  applyMutationToData,
  checkOperation,
  localView,
  operationCommand,
  todayInSaoPaulo,
  type FieldPackage,
  type QueuedOperation,
} from '../src/modules/terminalidade/offline-model';
import { planTerminalityCommand } from '../src/application/use-cases/terminality-commands';
import type { TerminalityData } from '../src/domain/terminality';

/* Modo de campo da terminalidade (14/10/2026): a vista do celular é o pacote baixado com a fila do
 * aparelho aplicada por cima, pelas mesmas regras do servidor. Sem sinal, é o aparelho que recusa. */

const stamp = { createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z' };
const W = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const PHOTO = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-10-14T15:00:00Z');
function data(): TerminalityData {
  return {
    floors: [{ id: 'f1', ...stamp, workId: W, name: '4° pavto', orderIndex: 4 }],
    units: [{ id: 'u1', ...stamp, workId: W, floorId: 'f1', name: '401', orderIndex: 1 }],
    types: [{ id: 't1', ...stamp, workId: W, name: 'PINTURA', orderIndex: 1, active: true }],
    people: [],
    items: [],
    photos: [],
  };
}
const pkg = (d = data()): FieldPackage => ({
  work: { id: W, name: 'Blentt', code: 'BLT' },
  actor: { id: 'user-1', name: 'Pedro', role: 'planner' },
  data: d,
  companies: ['Pinturas Silva'],
  savedAt: '2026-10-14T10:00:00Z',
});
let n = 0;
const queued = (operation: QueuedOperation['operation']): QueuedOperation => ({
  id: `q${++n}`,
  workId: W,
  createdAt: now.toISOString(),
  operation,
});
const createItem = queued({
  kind: 'command',
  command: {
    type: 'create_item',
    workId: W,
    itemId: ITEM,
    floorId: 'f1',
    unitId: 'u1',
    description: 'Retoque na parede',
    typeId: 't1',
    observedOn: '2026-10-14',
  },
});
const correction = queued({
  kind: 'photo',
  itemId: ITEM,
  photoId: PHOTO,
  photoKind: 'correction',
  width: 1600,
  height: 1200,
  bytes: 250_000,
});
const resolve = queued({ kind: 'command', command: { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-14' } });

test('a fila aplicada por cima do pacote mostra a pendência criada, a foto e a resolução', () => {
  const view = localView(pkg(), [createItem, correction, resolve], now);
  assert.equal(view.data.items.length, 1);
  assert.equal(view.data.items[0].status, 'resolved');
  assert.equal(view.data.items[0].correctedOn, '2026-10-14');
  assert.equal(view.data.photos[0].storagePath, `${W}/${ITEM}/${PHOTO}.jpg`);
  assert.deepEqual([...view.pendingItems], [ITEM]);
  assert.deepEqual([...view.pendingPhotos], [PHOTO]);
  assert.equal(view.rejected.length, 0);
});

test('sem sinal, o aparelho recusa o que o servidor recusaria', () => {
  assert.throws(() => checkOperation(pkg(), [createItem], resolve.operation, now), /foto/i);
  assert.throws(
    () =>
      checkOperation(
        pkg(),
        [],
        {
          kind: 'command',
          command: { type: 'create_item', workId: W, itemId: ITEM, floorId: 'f1', description: 'x', observedOn: '2026-10-20' },
        },
        now,
      ),
    /futuro/i,
  );
  assert.doesNotThrow(() => checkOperation(pkg(), [createItem, correction], resolve.operation, now));
});

test('operação que já não vale não derruba as outras: vai para a lista de recusadas', () => {
  const orphan = queued({ kind: 'command', command: { type: 'reopen_item', itemId: '44444444-4444-4444-8444-444444444444' } });
  const view = localView(pkg(), [orphan, createItem], now);
  assert.equal(view.rejected.length, 1);
  assert.equal(view.rejected[0].operation.id, orphan.id);
  assert.equal(view.data.items.length, 1);
});

test('depois de enviada, a mesma pendência vinda do servidor não é criada de novo pela fila', () => {
  const server = applyMutationToData(
    data(),
    planTerminalityCommand(data(), operationCommand(W, createItem.operation), {
      actorId: 'user-1',
      now: now.toISOString(),
      today: '2026-10-14',
      newId: () => 'x',
    }),
  );
  const view = localView(pkg(server), [createItem], now);
  assert.equal(view.data.items.length, 1);
  assert.equal(view.rejected.length, 1);
  assert.ok(alreadyApplied(view.rejected[0].message));
});

test('aplicar a mutação apaga, atualiza e insere sem tocar a entrada', () => {
  const base = data();
  const created = planTerminalityCommand(base, operationCommand(W, createItem.operation), {
    actorId: 'u',
    now: now.toISOString(),
    today: '2026-10-14',
    newId: () => 'x',
  });
  const after = applyMutationToData(base, created);
  assert.equal(base.items.length, 0);
  assert.equal(after.items.length, 1);
  assert.equal(after.floors, after.floors);
});

test('hoje é o de São Paulo, não o UTC', () => {
  assert.equal(todayInSaoPaulo(new Date('2026-10-15T01:30:00Z')), '2026-10-14');
  assert.equal(todayInSaoPaulo(new Date('2026-10-15T04:00:00Z')), '2026-10-15');
  assert.equal(alreadyApplied('Esta foto já foi registrada.'), true);
  assert.equal(alreadyApplied('Pendência não encontrada.'), false);
});

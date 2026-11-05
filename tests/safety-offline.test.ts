import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alreadyApplied,
  applyMutationToData,
  checkOperation,
  localView,
  operationCommand,
  operationItemId,
  todayInSaoPaulo,
  type FieldPackage,
  type QueuedOperation,
} from '../src/modules/seguranca/offline-model';
import { planSafetyCommand } from '../src/application/use-cases/safety-commands';
import { SAFETY_TST_ONLY_MESSAGE, type SafetyData } from '../src/domain/safety';

/* Modo de campo da segurança do trabalho (05/11/2026): a vista do celular é o pacote baixado com a fila
 * do aparelho aplicada por cima, pelas mesmas regras do servidor. Sem sinal, é o aparelho que recusa — e
 * só TST lança: para os demais, nada entra na fila. */

const stamp = { createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z' };
const W = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const PHOTO = '33333333-3333-4333-8333-333333333333';
const ISSUE_PHOTO = '55555555-5555-4555-8555-555555555555';
const now = new Date('2026-11-05T15:00:00Z');
function data(): SafetyData {
  return {
    types: [{ id: 't1', ...stamp, name: 'Proteções periféricas', orderIndex: 0, active: true }],
    items: [],
    photos: [],
  };
}
const pkg = (d = data(), canEdit = true): FieldPackage => ({
  work: { id: W, name: 'Blentt', code: 'BLT' },
  actor: { id: 'user-1', name: 'Joana', role: 'viewer', tst: canEdit },
  canEdit,
  inspectors: [{ id: 'user-1', name: 'Joana' }],
  data: d,
  savedAt: '2026-11-05T10:00:00Z',
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
    typeId: 't1',
    consequence: 'Severa',
    probability: 'Possível',
    description: 'Guarda-corpo solto na laje',
    location: '4° Pavimento',
    observedOn: '2026-11-05',
  },
});
const issue = queued({ kind: 'photo', itemId: ITEM, photoId: ISSUE_PHOTO, photoKind: 'issue', width: 1600, height: 1200, bytes: 240_000 });
const correction = queued({
  kind: 'photo',
  itemId: ITEM,
  photoId: PHOTO,
  photoKind: 'correction',
  width: 1600,
  height: 1200,
  bytes: 250_000,
});
const resolve = queued({
  kind: 'command',
  command: { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-11-05', resolutionNote: 'Guarda-corpo refixado' },
});
const context = { actorId: 'user-1', now: now.toISOString(), today: '2026-11-05', newId: () => 'x' };

test('a fila aplicada por cima do pacote mostra o apontamento criado, as fotos e a finalização', () => {
  const view = localView(pkg(), [createItem, issue, correction, resolve], now);
  assert.equal(view.data.items.length, 1);
  const [item] = view.data.items;
  assert.equal(item.status, 'resolved');
  assert.equal(item.correctedOn, '2026-11-05');
  assert.equal(item.resolutionNote, 'Guarda-corpo refixado');
  assert.equal(item.consequence, 'Severa');
  assert.equal(item.location, '4° Pavimento');
  assert.equal(item.origin, 'app');
  assert.deepEqual(
    view.data.photos.map(p => [p.kind, p.storagePath]),
    [
      ['issue', `${W}/${ITEM}/${ISSUE_PHOTO}.jpg`],
      ['correction', `${W}/${ITEM}/${PHOTO}.jpg`],
    ],
  );
  assert.deepEqual([...view.pendingItems], [ITEM]);
  assert.deepEqual([...view.pendingPhotos], [ISSUE_PHOTO, PHOTO]);
  assert.equal(view.rejected.length, 0);
});

test('sem sinal, o aparelho recusa o que o servidor recusaria', () => {
  assert.throws(() => checkOperation(pkg(), [createItem], resolve.operation, now), /foto da correção/i);
  assert.throws(
    () =>
      checkOperation(
        pkg(),
        [],
        { kind: 'command', command: { ...(createItem.operation as { command: object }).command, observedOn: '2026-11-06' } } as never,
        now,
      ),
    /futuro/i,
  );
  assert.throws(
    () =>
      checkOperation(
        pkg(),
        [],
        { kind: 'command', command: { ...(createItem.operation as { command: object }).command, consequence: '' } } as never,
        now,
      ),
    /consequência/i,
  );
  assert.throws(
    () =>
      checkOperation(
        pkg(),
        [createItem, correction],
        { kind: 'command', command: { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-11-04' } },
        now,
      ),
    /anterior/i,
  );
  assert.doesNotThrow(() => checkOperation(pkg(), [createItem, correction], resolve.operation, now));
});

test('quem não é TST não põe nada na fila, nem com o apontamento válido', () => {
  assert.throws(() => checkOperation(pkg(data(), false), [], createItem.operation, now), new RegExp(SAFETY_TST_ONLY_MESSAGE.slice(0, 20)));
  assert.throws(() => checkOperation(pkg(data(), false), [createItem], issue.operation, now), /TST/);
});

test('o apontamento lançado no campo tem de ser da obra baixada', () => {
  const other = { ...(createItem.operation as { command: object }).command, workId: '99999999-9999-4999-8999-999999999999' };
  assert.throws(() => checkOperation(pkg(), [], { kind: 'command', command: other } as never, now), /desta obra/i);
});

test('operação que já não vale não derruba as outras: vai para a lista de recusadas', () => {
  const orphan = queued({ kind: 'command', command: { type: 'reopen_item', itemId: '44444444-4444-4444-8444-444444444444' } });
  const view = localView(pkg(), [orphan, createItem], now);
  assert.equal(view.rejected.length, 1);
  assert.equal(view.rejected[0].operation.id, orphan.id);
  assert.equal(view.data.items.length, 1);
});

test('a fila de outra obra não entra na vista desta', () => {
  const elsewhere = { ...createItem, id: 'q-outra', workId: '99999999-9999-4999-8999-999999999999' };
  const view = localView(pkg(), [elsewhere], now);
  assert.equal(view.data.items.length, 0);
  assert.equal(view.rejected.length, 0);
});

test('depois de enviado, o mesmo apontamento vindo do servidor não é criado de novo pela fila', () => {
  const server = applyMutationToData(data(), planSafetyCommand(data(), operationCommand(W, createItem.operation), context));
  const view = localView(pkg(server), [createItem], now);
  assert.equal(view.data.items.length, 1);
  assert.equal(view.rejected.length, 1);
  assert.ok(alreadyApplied(view.rejected[0].message));
});

test('reabrir no campo devolve o apontamento finalizado à lista de abertos, sem a data e o texto da correção', () => {
  const resolved = [createItem, correction, resolve].reduce(
    (d, q) => applyMutationToData(d, planSafetyCommand(d, operationCommand(W, q.operation), context)),
    data(),
  );
  const reopen = queued({ kind: 'command', command: { type: 'reopen_item', itemId: ITEM } });
  const view = localView(pkg(resolved), [reopen], now);
  assert.equal(view.data.items[0].status, 'open');
  assert.equal(view.data.items[0].correctedOn, undefined);
  assert.equal(view.data.items[0].resolutionNote, undefined);
  assert.equal(view.data.photos.length, 1, 'as fotos ficam ao reabrir');
});

test('aplicar a mutação apaga, atualiza e insere sem tocar a entrada', () => {
  const base = data();
  const after = applyMutationToData(base, planSafetyCommand(base, operationCommand(W, createItem.operation), context));
  assert.equal(base.items.length, 0);
  assert.equal(after.items.length, 1);
  assert.equal(after.types, base.types);
});

test('cada operação aponta para o apontamento que mexe', () => {
  assert.equal(operationItemId(createItem.operation), ITEM);
  assert.equal(operationItemId(correction.operation), ITEM);
  assert.equal(operationCommand(W, correction.operation).type, 'add_photo');
});

test('hoje é o de São Paulo, não o UTC', () => {
  assert.equal(todayInSaoPaulo(new Date('2026-11-06T01:30:00Z')), '2026-11-05');
  assert.equal(todayInSaoPaulo(new Date('2026-11-06T04:00:00Z')), '2026-11-06');
  assert.equal(alreadyApplied('Este apontamento já foi registrado.'), true);
  assert.equal(alreadyApplied('Esta foto já foi registrada.'), true);
  assert.equal(alreadyApplied('Apontamento não encontrado.'), false);
});

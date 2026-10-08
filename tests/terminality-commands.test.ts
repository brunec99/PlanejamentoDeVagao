import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTerminalityCommand,
  planTerminalityCommand,
  terminalityCommandTarget,
  type TerminalityContext,
  type TerminalityMutation,
} from '../src/application/use-cases/terminality-commands';
import {
  TERMINALITY_LIMITS,
  terminalityPhotoPaths,
  type TerminalityCommand,
  type TerminalityData,
  type TerminalityItem,
  type TerminalityPhoto,
} from '../src/domain/terminality';

const NOW = '2026-10-08T15:00:00.000Z';
const OLD = '2026-09-01T12:00:00.000Z';
const W = 'obra-1';
const ITEM = '11111111-1111-4111-8111-111111111111';
const NEW_ITEM = '22222222-2222-4222-8222-222222222222';
const PHOTO = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;

let seq = 0;
const ctx = (over: Partial<TerminalityContext> = {}): TerminalityContext => ({
  actorId: 'user-1',
  now: NOW,
  newId: () => `id-${++seq}`,
  ...over,
});
const stamp = { createdAt: OLD, updatedAt: OLD };

const photo = (n: number, over: Partial<TerminalityPhoto> = {}): TerminalityPhoto => ({
  id: PHOTO(n),
  itemId: ITEM,
  workId: W,
  kind: 'issue',
  ...terminalityPhotoPaths(W, over.itemId ?? ITEM, PHOTO(n)),
  createdBy: 'user-1',
  createdAt: OLD,
  ...over,
});
const item = (over: Partial<TerminalityItem> = {}): TerminalityItem => ({
  id: ITEM,
  workId: W,
  floorId: 'f1',
  unitId: 'u1',
  description: 'Rejunte faltando no box',
  typeId: 't1',
  observedOn: '2026-09-20',
  atrPersonId: 'p1',
  contractor: 'Acabamentos Silva',
  status: 'open',
  createdBy: 'user-1',
  ...stamp,
  ...over,
});

/** Obra com dois pavimentos (o 4° com as unidades 401 e 402), um tipo ativo e um desativado,
 * uma pessoa ativa e uma desativada, e uma pendência aberta na 401 com uma foto do problema. */
function data(): TerminalityData {
  return {
    floors: [
      { id: 'f1', workId: W, name: '4° pavto', orderIndex: 0, ...stamp },
      { id: 'f2', workId: W, name: 'Térreo', orderIndex: 1, ...stamp },
    ],
    units: [
      { id: 'u1', workId: W, floorId: 'f1', name: '401', orderIndex: 0, ...stamp },
      { id: 'u2', workId: W, floorId: 'f1', name: '402', orderIndex: 1, ...stamp },
    ],
    types: [
      { id: 't1', workId: W, name: 'PINTURA', orderIndex: 0, active: true, ...stamp },
      { id: 't2', workId: W, name: 'A/C', orderIndex: 1, active: false, ...stamp },
    ],
    people: [
      { id: 'p1', workId: W, name: 'Joana', active: true, ...stamp },
      { id: 'p2', workId: W, name: 'Carlos', active: false, ...stamp },
    ],
    items: [item()],
    photos: [photo(1)],
  };
}
const run = (d: TerminalityData, c: TerminalityCommand, over: Partial<TerminalityContext> = {}) => planTerminalityCommand(d, c, ctx(over));
const rejects = (d: TerminalityData, c: TerminalityCommand, message: string | RegExp, over: Partial<TerminalityContext> = {}) =>
  assert.throws(() => run(d, c, over), typeof message === 'string' ? { message } : message);
const touched = (m: TerminalityMutation) =>
  (['floors', 'units', 'types', 'people', 'items', 'photos'] as const).flatMap(t => [
    ...m.insert[t].map(() => `+${t}`),
    ...m.update[t].map(() => `~${t}`),
    ...m.delete[t].map(() => `-${t}`),
  ]);

const createItem = (over: Partial<Extract<TerminalityCommand, { type: 'create_item' }>> = {}): TerminalityCommand => ({
  type: 'create_item',
  workId: W,
  itemId: NEW_ITEM,
  floorId: 'f1',
  unitId: 'u2',
  description: '  Tomada sem espelho  ',
  typeId: 't1',
  observedOn: '2026-10-08',
  atrPersonId: 'p1',
  contractor: ' Elétrica Luz ',
  ...over,
});
const updateItem = (over: Partial<Extract<TerminalityCommand, { type: 'update_item' }>> = {}): TerminalityCommand => {
  const { floorId, unitId, description, typeId, observedOn, atrPersonId, contractor } = item();
  return { type: 'update_item', itemId: ITEM, floorId, unitId, description, typeId, observedOn, atrPersonId, contractor, ...over };
};
const addPhoto = (n: number, over: Partial<Extract<TerminalityCommand, { type: 'add_photo' }>> = {}): TerminalityCommand => ({
  type: 'add_photo',
  itemId: ITEM,
  photoId: PHOTO(n),
  kind: 'correction',
  ...terminalityPhotoPaths(W, ITEM, PHOTO(n)),
  width: 1600,
  height: 1200,
  bytes: 400_000,
  ...over,
});
function resolved(): TerminalityData {
  const d = data();
  d.items = [item({ status: 'resolved', correctedOn: '2026-10-01', resolvedAt: OLD, resolvedBy: 'user-2' })];
  d.photos.push(photo(2, { kind: 'correction' }));
  return d;
}

// ----- Pavimentos -----

test('cadastra pavimentos em lote, ignorando linhas vazias e continuando a ordem', () => {
  const m = run(data(), { type: 'create_floors', workId: W, names: ['  5° pavto ', '', '   ', 'Cobertura'] });
  assert.equal(m.workId, W);
  assert.deepEqual(
    m.insert.floors.map(f => [f.name, f.orderIndex, f.workId, f.createdAt]),
    [
      ['5° pavto', 2, W, NOW],
      ['Cobertura', 3, W, NOW],
    ],
  );
  assert.deepEqual(touched(m), ['+floors', '+floors']);
});

test('nome de pavimento repetido é recusado sem considerar acento, caixa ou espaços', () => {
  rejects(data(), { type: 'create_floors', workId: W, names: ['TERREO'] }, 'Já existe o pavimento "TERREO".');
  rejects(data(), { type: 'create_floors', workId: W, names: ['Mezanino', 'mezanino '] }, 'Já existe o pavimento "mezanino".');
  rejects(data(), { type: 'create_floors', workId: W, names: ['', ' '] }, 'Informe ao menos um nome do pavimento.');
  rejects(data(), { type: 'create_floors', workId: W, names: 'Térreo' as unknown as string[] }, 'Lista de nomes inválida.');
  rejects(data(), { type: 'create_floors', workId: W, names: ['x'.repeat(TERMINALITY_LIMITS.maxName + 1)] }, /passa de 80 caracteres/);
});

test('renomear pavimento aceita o próprio nome com outra grafia e recusa o de outro pavimento', () => {
  const m = run(data(), { type: 'rename_floor', floorId: 'f2', name: 'TÉRREO' });
  assert.equal(m.update.floors[0].name, 'TÉRREO');
  assert.equal(m.update.floors[0].updatedAt, NOW);
  rejects(data(), { type: 'rename_floor', floorId: 'f2', name: '4° PAVTO' }, 'Já existe o pavimento "4° PAVTO".');
  rejects(data(), { type: 'rename_floor', floorId: 'nada', name: 'X' }, 'Pavimento não encontrado.');
  rejects(data(), { type: 'rename_floor', floorId: 'f2', name: '  ' }, 'Informe o nome do pavimento.');
});

test('reordenar exige exatamente os pavimentos da obra e grava só os que mudaram de lugar', () => {
  const d = data();
  d.floors.push({ id: 'f3', workId: W, name: 'Cobertura', orderIndex: 2, ...stamp });
  const m = run(d, { type: 'reorder_floors', workId: W, floorIds: ['f2', 'f1', 'f3'] });
  assert.deepEqual(
    m.update.floors.map(f => [f.id, f.orderIndex]),
    [
      ['f2', 0],
      ['f1', 1],
    ],
  );
  const stale = 'A lista de pavimentos mudou. Recarregue a página e reordene de novo.';
  rejects(d, { type: 'reorder_floors', workId: W, floorIds: ['f2', 'f1'] }, stale);
  rejects(d, { type: 'reorder_floors', workId: W, floorIds: ['f2', 'f1', 'f1'] }, stale);
  rejects(d, { type: 'reorder_floors', workId: W, floorIds: ['f2', 'f1', 'outro'] }, stale);
});

test('pavimento só é apagado sem unidades e sem pendências', () => {
  rejects(data(), { type: 'delete_floor', floorId: 'f1' }, 'O pavimento tem pendências registradas e não pode ser apagado.');
  const d = data();
  d.items = [];
  d.photos = [];
  rejects(d, { type: 'delete_floor', floorId: 'f1' }, 'Apague as unidades do pavimento antes de apagá-lo.');
  const m = run(d, { type: 'delete_floor', floorId: 'f2' });
  assert.deepEqual(m.delete.floors, ['f2']);
  assert.deepEqual(touched(m), ['-floors']);
});

// ----- Unidades -----

test('cadastra unidades no pavimento, com nome único por pavimento e ordem continuada', () => {
  const m = run(data(), { type: 'create_units', floorId: 'f1', names: ['403', 'Hall'] });
  assert.deepEqual(
    m.insert.units.map(u => [u.name, u.floorId, u.workId, u.orderIndex]),
    [
      ['403', 'f1', W, 2],
      ['Hall', 'f1', W, 3],
    ],
  );
  // O mesmo nome em outro pavimento é permitido.
  assert.equal(run(data(), { type: 'create_units', floorId: 'f2', names: ['401'] }).insert.units[0].orderIndex, 0);
  rejects(data(), { type: 'create_units', floorId: 'f1', names: ['401'] }, 'O pavimento 4° pavto já tem a unidade "401".');
  rejects(data(), { type: 'create_units', floorId: 'nada', names: ['1'] }, 'Pavimento não encontrado.');
});

test('renomear e apagar unidade', () => {
  assert.equal(run(data(), { type: 'rename_unit', unitId: 'u2', name: '402A' }).update.units[0].name, '402A');
  rejects(data(), { type: 'rename_unit', unitId: 'u2', name: '401' }, 'O pavimento já tem a unidade "401".');
  rejects(data(), { type: 'delete_unit', unitId: 'u1' }, 'A unidade tem pendências registradas e não pode ser apagada.');
  assert.deepEqual(run(data(), { type: 'delete_unit', unitId: 'u2' }).delete.units, ['u2']);
});

// ----- Tipos e responsáveis -----

test('tipos: nome único por obra (inclusive desativados), nunca apagados, só desativados', () => {
  const m = run(data(), { type: 'create_type', workId: W, name: ' RI ' });
  assert.deepEqual([m.insert.types[0].name, m.insert.types[0].orderIndex, m.insert.types[0].active], ['RI', 2, true]);
  rejects(data(), { type: 'create_type', workId: W, name: 'a/c' }, 'Já existe o tipo "a/c". Se estiver desativado, reative-o.');
  const off = run(data(), { type: 'update_type', typeId: 't1', active: false });
  assert.equal(off.update.types[0].active, false);
  assert.equal(off.update.types[0].name, 'PINTURA');
  assert.equal(run(data(), { type: 'update_type', typeId: 't2', name: 'Ar-condicionado', active: true }).update.types[0].active, true);
  rejects(data(), { type: 'update_type', typeId: 't1', name: 'A/C' }, 'Já existe o tipo "A/C".');
  rejects(data(), { type: 'update_type', typeId: 't1', active: 'sim' as unknown as boolean }, 'Situação do tipo inválida.');
});

test('responsáveis ATR: nome único por obra e desativação no lugar de apagar', () => {
  assert.equal(run(data(), { type: 'create_person', workId: W, name: 'Bruno' }).insert.people[0].active, true);
  rejects(
    data(),
    { type: 'create_person', workId: W, name: 'carlos' },
    'Já existe o responsável "carlos". Se estiver desativado, reative-o.',
  );
  assert.equal(run(data(), { type: 'update_person', personId: 'p1', active: false }).update.people[0].active, false);
  rejects(data(), { type: 'update_person', personId: 'p1', name: 'Carlos' }, 'Já existe o responsável "Carlos".');
  rejects(data(), { type: 'update_person', personId: 'nada', active: true }, 'Responsável ATR não encontrado.');
});

// ----- Pendências -----

test('cria pendência aberta com textos aparados, autor e datas', () => {
  const m = run(data(), createItem());
  const created = m.insert.items[0];
  assert.equal(created.id, NEW_ITEM);
  assert.equal(created.status, 'open');
  assert.equal(created.description, 'Tomada sem espelho');
  assert.equal(created.contractor, 'Elétrica Luz');
  assert.equal(created.createdBy, 'user-1');
  assert.equal(created.createdAt, NOW);
  assert.equal(created.correctedOn, undefined);
  assert.deepEqual(touched(m), ['+items']);
});

test('pendência sem unidade, tipo, responsável ou terceiro (nulos ou vazios viram ausentes)', () => {
  const m = run(
    data(),
    createItem({
      unitId: null as unknown as string,
      typeId: '',
      atrPersonId: undefined,
      contractor: '   ',
    }),
  );
  const created = m.insert.items[0];
  assert.equal(created.unitId, undefined);
  assert.equal(created.typeId, undefined);
  assert.equal(created.atrPersonId, undefined);
  assert.equal(created.contractor, undefined);
});

test('criar pendência valida id, locais, listas, datas e textos', () => {
  rejects(data(), createItem({ itemId: 'abc' }), 'Identificador da pendência inválido.');
  rejects(data(), createItem({ itemId: ITEM }), 'Esta pendência já foi registrada.');
  rejects(data(), createItem({ floorId: 'nada' }), 'Pavimento não encontrado.');
  rejects(data(), createItem({ floorId: 'f2', unitId: 'u1' }), 'A unidade não pertence ao pavimento escolhido.');
  rejects(data(), createItem({ unitId: 'nada' }), 'Unidade não encontrada.');
  rejects(data(), createItem({ typeId: 't2' }), 'O tipo "A/C" está desativado.');
  rejects(data(), createItem({ atrPersonId: 'p2' }), 'O responsável "Carlos" está desativado.');
  rejects(data(), createItem({ typeId: 'nada' }), 'Tipo de pendência não encontrado.');
  rejects(data(), createItem({ observedOn: '2026-02-30' }), 'Data da observação inválida.');
  rejects(data(), createItem({ observedOn: '08/10/2026' }), 'Data da observação inválida.');
  rejects(data(), createItem({ observedOn: '2026-10-09' }), 'A data da observação não pode estar no futuro.');
  rejects(data(), createItem({ description: '   ' }), 'Descreva a pendência.');
  rejects(data(), createItem({ description: 'x'.repeat(TERMINALITY_LIMITS.maxDescription + 1) }), /A descrição passa de 1000/);
  rejects(data(), createItem({ contractor: 'x'.repeat(TERMINALITY_LIMITS.maxName + 1) }), /responsável terceiro passa de 80/);
});

test('pavimento de outra obra é recusado mesmo se aparecer nos dados', () => {
  const d = data();
  d.floors.push({ id: 'fx', workId: 'obra-2', name: 'Outro', orderIndex: 0, ...stamp });
  rejects(d, createItem({ floorId: 'fx', unitId: undefined }), 'O pavimento não pertence a esta obra.');
});

test('"hoje" usa a data da obra quando informada, não a data UTC', () => {
  // 22h em São Paulo já é dia seguinte em UTC: sem `today`, o dia 09 passaria.
  const late = { now: '2026-10-09T01:00:00.000Z', today: '2026-10-08' };
  rejects(data(), createItem({ observedOn: '2026-10-09' }), 'A data da observação não pode estar no futuro.', late);
  assert.equal(run(data(), createItem({ observedOn: '2026-10-09' }), { now: late.now }).insert.items[0].observedOn, '2026-10-09');
});

test('editar pendência mantém status e autor e permite manter tipo/responsável já desativados', () => {
  const d = data();
  d.items = [item({ typeId: 't2', atrPersonId: 'p2' })];
  const m = run(d, updateItem({ typeId: 't2', atrPersonId: 'p2', description: 'Rejunte e silicone', unitId: undefined }));
  const updated = m.update.items[0];
  assert.equal(updated.description, 'Rejunte e silicone');
  assert.equal(updated.unitId, undefined);
  assert.equal(updated.status, 'open');
  assert.equal(updated.createdBy, 'user-1');
  assert.equal(updated.createdAt, OLD);
  assert.equal(updated.updatedAt, NOW);
  // Escolher de novo um desativado que não era o atual continua proibido.
  rejects(data(), updateItem({ typeId: 't2' }), 'O tipo "A/C" está desativado.');
  rejects(data(), updateItem({ atrPersonId: 'p2' }), 'O responsável "Carlos" está desativado.');
  rejects(data(), updateItem({ itemId: 'nada' }), 'Pendência não encontrada.');
});

test('editar pendência resolvida é permitido, sem mudar o status nem passar da data da correção', () => {
  const m = run(resolved(), updateItem({ description: 'Ajuste de texto' }));
  assert.equal(m.update.items[0].status, 'resolved');
  assert.equal(m.update.items[0].correctedOn, '2026-10-01');
  rejects(resolved(), updateItem({ observedOn: '2026-10-02' }), 'A data da observação não pode ser posterior à data da correção.');
});

// ----- Fotos -----

test('registra foto no caminho liberado pela rota de envio', () => {
  const m = run(data(), addPhoto(5, { kind: 'issue' }));
  const p = m.insert.photos[0];
  assert.deepEqual([p.id, p.itemId, p.workId, p.kind, p.createdBy], [PHOTO(5), ITEM, W, 'issue', 'user-1']);
  assert.equal(p.storagePath, `${W}/${ITEM}/${PHOTO(5)}.jpg`);
  assert.equal(p.thumbPath, `${W}/${ITEM}/${PHOTO(5)}-thumb.jpg`);
  assert.deepEqual([p.width, p.height, p.bytes], [1600, 1200, 400_000]);
});

test('foto da correção pode subir antes de resolver e depois de resolvida', () => {
  assert.equal(run(data(), addPhoto(5)).insert.photos[0].kind, 'correction');
  assert.equal(run(resolved(), addPhoto(5)).insert.photos[0].kind, 'correction');
});

test('foto: id, caminho, tipo, limite por pendência e tamanho são conferidos', () => {
  rejects(data(), addPhoto(5, { photoId: 'x' }), 'Identificador da foto inválido.');
  rejects(data(), addPhoto(1), 'Esta foto já foi registrada.');
  rejects(data(), addPhoto(5, { storagePath: `obra-2/${ITEM}/${PHOTO(5)}.jpg` }), 'Caminho da foto inválido.');
  rejects(data(), addPhoto(5, { thumbPath: `${W}/${ITEM}/${PHOTO(5)}.jpg` }), 'Caminho da foto inválido.');
  rejects(data(), addPhoto(5, { kind: 'antes' as 'issue' }), 'Tipo de foto inválido.');
  rejects(data(), addPhoto(5, { bytes: TERMINALITY_LIMITS.maxPhotoBytes + 1 }), 'A foto passa do tamanho máximo permitido.');
  rejects(data(), addPhoto(5, { width: -1 }), 'Largura da foto inválido.');
  rejects(data(), addPhoto(5, { itemId: 'nada' }), 'Pendência não encontrada.');
  assert.equal(run(data(), addPhoto(5, { bytes: undefined, width: undefined, height: undefined })).insert.photos[0].bytes, undefined);
  const full = data();
  full.photos = Array.from({ length: TERMINALITY_LIMITS.maxPhotosPerItem }, (_, i) => photo(i + 10));
  rejects(full, addPhoto(5), 'A pendência já tem 10 fotos, o máximo permitido.');
});

test('apagar foto remove a linha e os dois arquivos', () => {
  const m = run(data(), { type: 'delete_photo', photoId: PHOTO(1) });
  assert.deepEqual(m.delete.photos, [PHOTO(1)]);
  assert.deepEqual(m.removeFiles, [`${W}/${ITEM}/${PHOTO(1)}.jpg`, `${W}/${ITEM}/${PHOTO(1)}-thumb.jpg`]);
  rejects(data(), { type: 'delete_photo', photoId: PHOTO(9) }, 'Foto não encontrada.');
});

test('a última foto da correção de pendência resolvida só sai depois de reabrir', () => {
  rejects(resolved(), { type: 'delete_photo', photoId: PHOTO(2) }, 'Reabra a pendência antes de apagar a última foto da correção.');
  // A foto do problema pode sair; e com duas fotos da correção, uma delas também.
  assert.deepEqual(run(resolved(), { type: 'delete_photo', photoId: PHOTO(1) }).delete.photos, [PHOTO(1)]);
  const two = resolved();
  two.photos.push(photo(3, { kind: 'correction' }));
  assert.deepEqual(run(two, { type: 'delete_photo', photoId: PHOTO(2) }).delete.photos, [PHOTO(2)]);
  // Aberta, a foto da correção sai livremente.
  const open = data();
  open.photos.push(photo(2, { kind: 'correction' }));
  assert.deepEqual(run(open, { type: 'delete_photo', photoId: PHOTO(2) }).delete.photos, [PHOTO(2)]);
});

// ----- Resolver, reabrir, apagar -----

test('resolver exige foto da correção e data entre a observação e hoje', () => {
  const d = data();
  rejects(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-05' }, 'Envie a foto da correção para marcar como resolvida.');
  d.photos.push(photo(2, { kind: 'correction' }));
  rejects(
    d,
    { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-09-19' },
    'A data da correção não pode ser anterior à data da observação.',
  );
  rejects(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-09' }, 'A data da correção não pode estar no futuro.');
  rejects(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '' }, 'Data da correção inválida.');
  const m = run(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-09-20' }, { actorId: 'user-2' });
  const r = m.update.items[0];
  assert.deepEqual([r.status, r.correctedOn, r.resolvedAt, r.resolvedBy, r.updatedAt], ['resolved', '2026-09-20', NOW, 'user-2', NOW]);
  assert.equal(r.createdBy, 'user-1');
  rejects(resolved(), { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-05' }, 'A pendência já está resolvida.');
});

test('reabrir limpa a correção e mantém as fotos', () => {
  const m = run(resolved(), { type: 'reopen_item', itemId: ITEM });
  const r = m.update.items[0];
  assert.equal(r.status, 'open');
  assert.equal(r.correctedOn, undefined);
  assert.equal(r.resolvedAt, undefined);
  assert.equal(r.resolvedBy, undefined);
  assert.ok(!('correctedOn' in r));
  assert.deepEqual(touched(m), ['~items']);
  assert.deepEqual(m.removeFiles, []);
  rejects(data(), { type: 'reopen_item', itemId: ITEM }, 'A pendência já está aberta.');
});

test('apagar pendência apaga a linha (fotos em cascata) e devolve todos os arquivos das fotos', () => {
  const d = resolved();
  d.photos.push(photo(7, { itemId: 'outra' }));
  const m = run(d, { type: 'delete_item', itemId: ITEM });
  assert.deepEqual(m.delete.items, [ITEM]);
  assert.deepEqual(m.delete.photos, []);
  assert.deepEqual(m.removeFiles, [
    `${W}/${ITEM}/${PHOTO(1)}.jpg`,
    `${W}/${ITEM}/${PHOTO(1)}-thumb.jpg`,
    `${W}/${ITEM}/${PHOTO(2)}.jpg`,
    `${W}/${ITEM}/${PHOTO(2)}-thumb.jpg`,
  ]);
  rejects(d, { type: 'delete_item', itemId: 'nada' }, 'Pendência não encontrada.');
});

test('o planejador não altera os dados recebidos', () => {
  const d = resolved();
  const before = JSON.stringify(d);
  run(d, { type: 'reopen_item', itemId: ITEM });
  run(d, updateItem({ description: 'Outra' }));
  run(d, { type: 'create_floors', workId: W, names: ['Ático'] });
  assert.equal(JSON.stringify(d), before);
});

// ----- Formato do comando e obra de destino -----

test('alvo do comando: a obra direto ou o registro cuja obra a rota busca', () => {
  assert.deepEqual(terminalityCommandTarget({ type: 'create_floors', workId: W, names: [] }), { workId: W });
  assert.deepEqual(terminalityCommandTarget(createItem()), { workId: W });
  assert.deepEqual(terminalityCommandTarget({ type: 'create_units', floorId: 'f1', names: [] }), { table: 'floors', id: 'f1' });
  assert.deepEqual(terminalityCommandTarget({ type: 'delete_unit', unitId: 'u1' }), { table: 'units', id: 'u1' });
  assert.deepEqual(terminalityCommandTarget({ type: 'update_type', typeId: 't1' }), { table: 'types', id: 't1' });
  assert.deepEqual(terminalityCommandTarget({ type: 'update_person', personId: 'p1' }), { table: 'people', id: 'p1' });
  assert.deepEqual(terminalityCommandTarget(addPhoto(5)), { table: 'items', id: ITEM });
  assert.deepEqual(terminalityCommandTarget({ type: 'delete_photo', photoId: PHOTO(1) }), { table: 'photos', id: PHOTO(1) });
  assert.throws(() => terminalityCommandTarget({ type: 'delete_item', itemId: '' }), { message: 'Pendência não informada.' });
});

test('corpo do comando precisa ser objeto com tipo conhecido', () => {
  assert.throws(() => parseTerminalityCommand(null), { message: 'Comando inválido.' });
  assert.throws(() => parseTerminalityCommand([]), { message: 'Comando inválido.' });
  assert.throws(() => parseTerminalityCommand({ type: 'drop_table' }), { message: 'Comando desconhecido.' });
  assert.equal(parseTerminalityCommand({ type: 'reopen_item', itemId: ITEM }).type, 'reopen_item');
  rejects(data(), { type: 'drop_table' } as unknown as TerminalityCommand, 'Comando desconhecido.');
});

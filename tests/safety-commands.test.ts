import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canWriteSafety,
  normalizeSafetyName,
  parseSafetyCommand,
  planSafetyCommand,
  safetyCommandTarget,
  SAFETY_TABLES,
  type SafetyContext,
  type SafetyMutation,
} from '../src/application/use-cases/safety-commands';
import {
  SAFETY_LIMITS,
  safetyDays,
  safetyPhotoPaths,
  type SafetyCommand,
  type SafetyData,
  type SafetyItem,
  type SafetyPhoto,
} from '../src/domain/safety';

const NOW = '2026-11-05T15:00:00.000Z';
const OLD = '2026-10-01T12:00:00.000Z';
const W = 'obra-1';
const ITEM = '11111111-1111-4111-8111-111111111111';
const NEW_ITEM = '22222222-2222-4222-8222-222222222222';
const PHOTO = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`;

let seq = 0;
const ctx = (over: Partial<SafetyContext> = {}): SafetyContext => ({
  actorId: 'tst-1',
  now: NOW,
  newId: () => `id-${++seq}`,
  ...over,
});
const stamp = { createdAt: OLD, updatedAt: OLD };

const photo = (n: number, over: Partial<SafetyPhoto> = {}): SafetyPhoto => ({
  id: PHOTO(n),
  itemId: ITEM,
  workId: W,
  kind: 'issue',
  ...safetyPhotoPaths(W, over.itemId ?? ITEM, PHOTO(n)),
  createdBy: 'tst-1',
  createdAt: OLD,
  ...over,
});
const item = (over: Partial<SafetyItem> = {}): SafetyItem => ({
  id: ITEM,
  workId: W,
  typeId: 't1',
  consequence: 'Severa',
  probability: 'Possível',
  description: 'Guarda-corpo solto na laje',
  location: '3° Pavimento',
  observedOn: '2026-10-20',
  status: 'open',
  origin: 'app',
  createdBy: 'tst-1',
  ...stamp,
  ...over,
});

/** Lista única com um tipo ativo e um desativado, e um apontamento aberto na obra com uma foto do problema. */
function data(): SafetyData {
  return {
    types: [
      { id: 't1', name: 'Proteções periféricas', orderIndex: 0, active: true, ...stamp },
      { id: 't2', name: 'Sinalização', orderIndex: 1, active: false, ...stamp },
    ],
    items: [item()],
    photos: [photo(1)],
  };
}
const run = (d: SafetyData, c: SafetyCommand, over: Partial<SafetyContext> = {}) => planSafetyCommand(d, c, ctx(over));
const rejects = (d: SafetyData, c: SafetyCommand, message: string | RegExp, over: Partial<SafetyContext> = {}) =>
  assert.throws(() => run(d, c, over), typeof message === 'string' ? { message } : message);
const touched = (m: SafetyMutation) =>
  SAFETY_TABLES.flatMap(t => [...m.insert[t].map(() => `+${t}`), ...m.update[t].map(() => `~${t}`), ...m.delete[t].map(() => `-${t}`)]);

const createItem = (over: Partial<Extract<SafetyCommand, { type: 'create_item' }>> = {}): SafetyCommand => ({
  type: 'create_item',
  workId: W,
  itemId: NEW_ITEM,
  typeId: 't1',
  consequence: 'Morte',
  probability: 'Provável',
  description: '  Trabalhador sem cinto na periferia  ',
  location: '  Laje   do 5°  ',
  observedOn: '2026-11-05',
  ...over,
});
const updateItem = (over: Partial<Extract<SafetyCommand, { type: 'update_item' }>> = {}): SafetyCommand => {
  const { typeId, consequence, probability, description, location, observedOn } = item();
  return { type: 'update_item', itemId: ITEM, typeId, consequence, probability, description, location, observedOn, ...over };
};
const addPhoto = (n: number, over: Partial<Extract<SafetyCommand, { type: 'add_photo' }>> = {}): SafetyCommand => ({
  type: 'add_photo',
  itemId: ITEM,
  photoId: PHOTO(n),
  kind: 'correction',
  ...safetyPhotoPaths(W, ITEM, PHOTO(n)),
  width: 1600,
  height: 1200,
  bytes: 400_000,
  ...over,
});
function resolved(): SafetyData {
  const d = data();
  d.items = [item({ status: 'resolved', correctedOn: '2026-10-25', resolvedAt: OLD, resolvedBy: 'tst-2' })];
  d.photos.push(photo(2, { kind: 'correction' }));
  return d;
}

// ----- Quem grava -----

test('grava quem é TST ou admin; os demais papéis não', () => {
  assert.equal(canWriteSafety({ tst: true }), true);
  assert.equal(canWriteSafety({ tst: false }), false);
  assert.equal(canWriteSafety({}), false);
  assert.equal(canWriteSafety({ role: 'admin' }), true);
  assert.equal(canWriteSafety({ role: 'manager' }), false);
  assert.equal(canWriteSafety({ role: 'planner', tst: false }), false);
  assert.equal(canWriteSafety({ role: 'viewer', tst: true }), true);
  assert.equal(canWriteSafety(null), false);
  assert.equal(canWriteSafety(undefined), false);
  assert.equal(canWriteSafety({ tst: 'true' as unknown as boolean }), false);
});

// ----- Tipos (lista única, sem obra) -----

test('cria tipo na lista única, sem obra, com nome aparado e ordem continuada', () => {
  const m = run(data(), { type: 'create_type', name: '  Tela   de Fachada ' });
  assert.equal(m.workId, undefined);
  const t = m.insert.types[0];
  assert.deepEqual([t.name, t.orderIndex, t.active, t.createdAt], ['Tela de Fachada', 2, true, NOW]);
  assert.deepEqual(touched(m), ['+types']);
});

test('nome de tipo: obrigatório, até o limite e único sem acento, caixa ou espaços, inclusive contra desativados', () => {
  rejects(data(), { type: 'create_type', name: 'SINALIZACAO' }, 'Já existe o tipo "SINALIZACAO". Se estiver desativado, reative-o.');
  rejects(data(), { type: 'create_type', name: ' proteções  periféricas ' }, /Já existe o tipo "proteções periféricas"/);
  rejects(data(), { type: 'create_type', name: '   ' }, 'Informe o nome do tipo.');
  rejects(data(), { type: 'create_type', name: 'x'.repeat(SAFETY_LIMITS.maxName + 1) }, /passa de 80 caracteres/);
  assert.equal(normalizeSafetyName('  SPIQ –  Linha de   Vída '), 'spiq – linha de vida');
});

test('editar tipo: renomear (aceita a própria grafia), desativar e reativar', () => {
  assert.equal(
    run(data(), { type: 'update_type', typeId: 't1', name: 'PROTEÇÕES PERIFÉRICAS' }).update.types[0].name,
    'PROTEÇÕES PERIFÉRICAS',
  );
  const off = run(data(), { type: 'update_type', typeId: 't1', active: false });
  assert.equal(off.workId, undefined);
  assert.deepEqual(
    [off.update.types[0].active, off.update.types[0].name, off.update.types[0].updatedAt],
    [false, 'Proteções periféricas', NOW],
  );
  assert.equal(run(data(), { type: 'update_type', typeId: 't2', active: true }).update.types[0].active, true);
  rejects(data(), { type: 'update_type', typeId: 't1', name: 'sinalização' }, /Já existe o tipo "sinalização"/);
  rejects(data(), { type: 'update_type', typeId: 't1', active: 'sim' as unknown as boolean }, 'Situação do tipo inválida.');
  rejects(data(), { type: 'update_type', typeId: 'nada', active: true }, 'Tipo de apontamento não encontrado.');
});

test('reordenar tipos exige a lista inteira, uma vez cada, e grava só os que mudaram de lugar', () => {
  const d = data();
  d.types.push({ id: 't3', name: 'Escavação', orderIndex: 2, active: true, ...stamp });
  const m = run(d, { type: 'reorder_types', typeIds: ['t2', 't1', 't3'] });
  assert.equal(m.workId, undefined);
  assert.deepEqual(
    m.update.types.map(t => [t.id, t.orderIndex]),
    [
      ['t2', 0],
      ['t1', 1],
    ],
  );
  const stale = 'A lista de tipos mudou. Recarregue a página e reordene de novo.';
  rejects(d, { type: 'reorder_types', typeIds: ['t2', 't1'] }, stale);
  rejects(d, { type: 'reorder_types', typeIds: ['t2', 't1', 't1'] }, stale);
  rejects(d, { type: 'reorder_types', typeIds: ['t2', 't1', 'outro'] }, stale);
  rejects(d, { type: 'reorder_types', typeIds: 't1' as unknown as string[] }, stale);
});

// ----- Apontamentos -----

test('cria apontamento aberto, do sistema, com textos aparados, autor e datas', () => {
  const m = run(data(), createItem());
  assert.equal(m.workId, W);
  const created = m.insert.items[0];
  assert.equal(created.id, NEW_ITEM);
  assert.deepEqual([created.status, created.origin, created.createdBy, created.createdAt], ['open', 'app', 'tst-1', NOW]);
  assert.equal(created.description, 'Trabalhador sem cinto na periferia');
  assert.equal(created.location, 'Laje do 5°');
  assert.deepEqual([created.consequence, created.probability, created.typeId], ['Morte', 'Provável', 't1']);
  assert.equal(created.correctedOn, undefined);
  assert.deepEqual(touched(m), ['+items']);
});

test('na importação da planilha o apontamento nasce com origem "planilha"', () => {
  assert.equal(run(data(), createItem(), { importing: true }).insert.items[0].origin, 'planilha');
});

test('tipo e local são opcionais (nulo ou vazio viram "sem tipo" e local vazio)', () => {
  const created = run(data(), createItem({ typeId: '', location: '   ' })).insert.items[0];
  assert.equal(created.typeId, undefined);
  assert.equal(created.location, '');
  const nulls = run(data(), createItem({ typeId: null as unknown as string, location: null as unknown as string })).insert.items[0];
  assert.equal(nulls.typeId, undefined);
  assert.equal(nulls.location, '');
});

test('criar apontamento valida id, tipo, risco, descrição, local e data', () => {
  rejects(data(), createItem({ itemId: 'abc' }), 'Identificador do apontamento inválido.');
  rejects(data(), createItem({ itemId: ITEM }), 'Este apontamento já foi registrado.');
  rejects(data(), createItem({ typeId: 'nada' }), 'Tipo de apontamento não encontrado.');
  rejects(data(), createItem({ typeId: 't2' }), 'O tipo "Sinalização" está desativado.');
  rejects(data(), createItem({ consequence: undefined as unknown as 'Morte' }), 'Informe a consequência do risco.');
  rejects(data(), createItem({ consequence: 'Grave' as 'Morte' }), 'Consequência do risco inválida.');
  rejects(data(), createItem({ probability: '' as 'Rara' }), 'Informe a probabilidade do risco.');
  rejects(data(), createItem({ probability: 'Certa' as 'Rara' }), 'Probabilidade do risco inválida.');
  rejects(data(), createItem({ description: '   ' }), 'Descreva o apontamento.');
  rejects(data(), createItem({ description: 'x'.repeat(SAFETY_LIMITS.maxDescription + 1) }), /A descrição passa de 1000/);
  rejects(data(), createItem({ location: 'x'.repeat(SAFETY_LIMITS.maxLocation + 1) }), /O local passa de 120/);
  rejects(data(), createItem({ location: 5 as unknown as string }), 'Local inválido.');
  rejects(data(), createItem({ observedOn: '2026-02-30' }), 'Data do apontamento inválida.');
  rejects(data(), createItem({ observedOn: '05/11/2026' }), 'Data do apontamento inválida.');
  rejects(data(), createItem({ observedOn: '2026-11-06' }), 'A data do apontamento não pode estar no futuro.');
  rejects(data(), createItem({ workId: '' }), 'Obra não informada.');
});

test('"hoje" usa a data da obra quando informada, não a data UTC', () => {
  // 22h em São Paulo já é dia seguinte em UTC: sem `today`, o dia 06 passaria.
  const late = { now: '2026-11-06T01:00:00.000Z', today: '2026-11-05' };
  rejects(data(), createItem({ observedOn: '2026-11-06' }), 'A data do apontamento não pode estar no futuro.', late);
  assert.equal(run(data(), createItem({ observedOn: '2026-11-06' }), { now: late.now }).insert.items[0].observedOn, '2026-11-06');
});

test('editar apontamento mantém status, origem e autor e permite manter tipo já desativado', () => {
  const d = data();
  d.items = [item({ typeId: 't2', origin: 'planilha' })];
  const m = run(d, updateItem({ typeId: 't2', description: 'Guarda-corpo e rodapé soltos', probability: 'Remota', location: '' }));
  const updated = m.update.items[0];
  assert.deepEqual(
    [updated.description, updated.probability, updated.location, updated.typeId],
    ['Guarda-corpo e rodapé soltos', 'Remota', '', 't2'],
  );
  assert.deepEqual(
    [updated.status, updated.origin, updated.createdBy, updated.createdAt, updated.updatedAt],
    ['open', 'planilha', 'tst-1', OLD, NOW],
  );
  // Escolher de novo um desativado que não era o atual continua proibido.
  rejects(data(), updateItem({ typeId: 't2' }), 'O tipo "Sinalização" está desativado.');
  rejects(data(), updateItem({ itemId: 'nada' }), 'Apontamento não encontrado.');
  rejects(data(), updateItem({ consequence: 'Grave' as 'Morte' }), 'Consequência do risco inválida.');
  // Tirar o tipo é permitido.
  assert.equal(run(data(), updateItem({ typeId: undefined })).update.items[0].typeId, undefined);
});

test('editar apontamento finalizado é permitido, sem mudar o status nem passar da data da correção', () => {
  const m = run(resolved(), updateItem({ description: 'Ajuste de texto' }));
  assert.equal(m.update.items[0].status, 'resolved');
  assert.equal(m.update.items[0].correctedOn, '2026-10-25');
  rejects(resolved(), updateItem({ observedOn: '2026-10-26' }), 'A data do apontamento não pode ser posterior à data da correção.');
});

// ----- Edição em lote -----

test('edição em lote troca só os campos enviados, em todos os apontamentos marcados, e limpa o tipo com null', () => {
  const d = data();
  d.types.push({ id: 't3', name: 'Escavação', orderIndex: 2, active: true, ...stamp });
  d.items = [item(), item({ id: NEW_ITEM, typeId: undefined, location: 'Canteiro', consequence: 'Leve' })];
  const m = run(d, { type: 'update_items', workId: W, itemIds: [ITEM, NEW_ITEM, ITEM], typeId: 't3', location: '  Área  de vivência ' });
  assert.equal(m.workId, W);
  assert.equal(m.update.items.length, 2);
  for (const updated of m.update.items) {
    assert.equal(updated.typeId, 't3');
    assert.equal(updated.location, 'Área de vivência');
    assert.equal(updated.updatedAt, NOW);
  }
  // Consequência não foi enviada: cada apontamento mantém a sua.
  assert.equal(m.update.items.find(i => i.id === ITEM)!.consequence, 'Severa');
  assert.equal(m.update.items.find(i => i.id === NEW_ITEM)!.consequence, 'Leve');
  const cleared = run(d, { type: 'update_items', workId: W, itemIds: [ITEM], typeId: null, consequence: 'Morte', probability: 'Rara' });
  assert.deepEqual(
    [cleared.update.items[0].typeId, cleared.update.items[0].consequence, cleared.update.items[0].probability],
    [undefined, 'Morte', 'Rara'],
  );
  assert.equal(run(d, { type: 'update_items', workId: W, itemIds: [ITEM], typeId: '' }).update.items[0].typeId, undefined);
});

test('edição em lote recusa nada a mudar, apontamento de fora, tipo desativado, risco inválido e lote vazio ou grande demais', () => {
  const d = data();
  const bulk = (command: Partial<Extract<SafetyCommand, { type: 'update_items' }>>) =>
    run(d, { type: 'update_items', workId: W, itemIds: [ITEM], ...command } as SafetyCommand);
  assert.throws(() => bulk({}), { message: 'Escolha o que mudar: tipo, consequência, probabilidade ou local.' });
  assert.throws(() => bulk({ itemIds: [] }), { message: 'Escolha ao menos um apontamento.' });
  assert.throws(() => bulk({ itemIds: ['nao-existe'], typeId: null }), /não foi encontrado/);
  assert.throws(() => bulk({ typeId: 't2' }), /desativado/);
  assert.throws(() => bulk({ consequence: 'Grave' as 'Morte' }), /Consequência do risco inválida/);
  assert.throws(() => bulk({ probability: 'Certa' as 'Rara' }), /Probabilidade do risco inválida/);
  assert.throws(() => bulk({ location: 'x'.repeat(SAFETY_LIMITS.maxLocation + 1) }), /passa de/);
  assert.throws(() => bulk({ itemIds: Array.from({ length: SAFETY_LIMITS.maxBulkItems + 1 }, () => ITEM), typeId: null }), /até 500/);
  d.items.push(item({ id: NEW_ITEM, workId: 'obra-2' }));
  assert.throws(() => bulk({ itemIds: [ITEM, NEW_ITEM], typeId: null }), /desta obra/);
});

// ----- Fotos -----

test('registra foto no caminho liberado pela rota de envio', () => {
  const m = run(data(), addPhoto(5, { kind: 'issue' }));
  assert.equal(m.workId, W);
  const p = m.insert.photos[0];
  assert.deepEqual([p.id, p.itemId, p.workId, p.kind, p.createdBy], [PHOTO(5), ITEM, W, 'issue', 'tst-1']);
  assert.equal(p.storagePath, `${W}/${ITEM}/${PHOTO(5)}.jpg`);
  assert.equal(p.thumbPath, `${W}/${ITEM}/${PHOTO(5)}-thumb.jpg`);
  assert.deepEqual([p.width, p.height, p.bytes], [1600, 1200, 400_000]);
  // A foto da correção sobe antes de finalizar e também depois.
  assert.equal(run(data(), addPhoto(5)).insert.photos[0].kind, 'correction');
  assert.equal(run(resolved(), addPhoto(5)).insert.photos[0].kind, 'correction');
});

test('foto: id, caminho, tipo, limite por apontamento e tamanho são conferidos', () => {
  rejects(data(), addPhoto(5, { photoId: 'x' }), 'Identificador da foto inválido.');
  rejects(data(), addPhoto(1), 'Esta foto já foi registrada.');
  rejects(data(), addPhoto(5, { storagePath: `obra-2/${ITEM}/${PHOTO(5)}.jpg` }), 'Caminho da foto inválido.');
  rejects(data(), addPhoto(5, { thumbPath: `${W}/${ITEM}/${PHOTO(5)}.jpg` }), 'Caminho da foto inválido.');
  rejects(data(), addPhoto(5, { kind: 'antes' as 'issue' }), 'Tipo de foto inválido.');
  rejects(data(), addPhoto(5, { bytes: SAFETY_LIMITS.maxPhotoBytes + 1 }), 'A foto passa do tamanho máximo permitido.');
  rejects(data(), addPhoto(5, { width: -1 }), 'Largura da foto inválido.');
  rejects(data(), addPhoto(5, { height: 1.5 }), 'Altura da foto inválido.');
  rejects(data(), addPhoto(5, { itemId: 'nada' }), 'Apontamento não encontrado.');
  assert.equal(run(data(), addPhoto(5, { bytes: undefined, width: undefined, height: undefined })).insert.photos[0].bytes, undefined);
  const full = data();
  full.photos = Array.from({ length: SAFETY_LIMITS.maxPhotosPerItem }, (_, i) => photo(i + 10));
  rejects(full, addPhoto(5), 'O apontamento já tem 10 fotos, o máximo permitido.');
});

test('apagar foto remove a linha e os dois arquivos', () => {
  const m = run(data(), { type: 'delete_photo', photoId: PHOTO(1) });
  assert.equal(m.workId, W);
  assert.deepEqual(m.delete.photos, [PHOTO(1)]);
  assert.deepEqual(m.removeFiles, [`${W}/${ITEM}/${PHOTO(1)}.jpg`, `${W}/${ITEM}/${PHOTO(1)}-thumb.jpg`]);
  rejects(data(), { type: 'delete_photo', photoId: PHOTO(9) }, 'Foto não encontrada.');
});

test('a última foto da correção de apontamento finalizado só sai depois de reabrir', () => {
  rejects(resolved(), { type: 'delete_photo', photoId: PHOTO(2) }, 'Reabra o apontamento antes de apagar a última foto da correção.');
  // A foto do apontamento pode sair; e com duas fotos da correção, uma delas também.
  assert.deepEqual(run(resolved(), { type: 'delete_photo', photoId: PHOTO(1) }).delete.photos, [PHOTO(1)]);
  const two = resolved();
  two.photos.push(photo(3, { kind: 'correction' }));
  assert.deepEqual(run(two, { type: 'delete_photo', photoId: PHOTO(2) }).delete.photos, [PHOTO(2)]);
  // Aberto, a foto da correção sai livremente.
  const open = data();
  open.photos.push(photo(2, { kind: 'correction' }));
  assert.deepEqual(run(open, { type: 'delete_photo', photoId: PHOTO(2) }).delete.photos, [PHOTO(2)]);
});

// ----- Finalizar, reabrir, apagar -----

test('finalizar exige foto da correção e data entre o apontamento e hoje', () => {
  const d = data();
  rejects(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-25' }, 'Envie a foto da correção para finalizar o apontamento.');
  d.photos.push(photo(2, { kind: 'correction' }));
  rejects(
    d,
    { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-19' },
    'A data da correção não pode ser anterior à data do apontamento.',
  );
  rejects(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-11-06' }, 'A data da correção não pode estar no futuro.');
  rejects(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '' }, 'Data da correção inválida.');
  const m = run(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-20' }, { actorId: 'tst-2' });
  assert.equal(m.workId, W);
  const r = m.update.items[0];
  assert.deepEqual([r.status, r.correctedOn, r.resolvedAt, r.resolvedBy, r.updatedAt], ['resolved', '2026-10-20', NOW, 'tst-2', NOW]);
  assert.deepEqual([r.createdBy, r.origin], ['tst-1', 'app']);
  assert.equal('resolutionNote' in r, false);
  rejects(resolved(), { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-25' }, 'O apontamento já está finalizado.');
  rejects(d, { type: 'resolve_item', itemId: 'nada', correctedOn: '2026-10-25' }, 'Apontamento não encontrado.');
});

test('na importação da planilha, finalizar dispensa a foto da correção, mas não as regras de data', () => {
  const d = data();
  const r = run(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-25' }, { importing: true }).update.items[0];
  assert.deepEqual([r.status, r.correctedOn], ['resolved', '2026-10-25']);
  rejects(
    d,
    { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-19' },
    'A data da correção não pode ser anterior à data do apontamento.',
    { importing: true },
  );
});

test('finalizar grava "como foi corrigido" (opcional, até o limite) e reabrir limpa a finalização e mantém as fotos', () => {
  const d = data();
  d.photos.push(photo(2, { kind: 'correction' }));
  const done = run(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-25', resolutionNote: '  Guarda-corpo refixado.  ' })
    .update.items[0];
  assert.equal(done.resolutionNote, 'Guarda-corpo refixado.');
  rejects(
    d,
    { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-25', resolutionNote: 'x'.repeat(SAFETY_LIMITS.maxResolutionNote + 1) },
    /passa de/,
  );
  rejects(d, { type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-25', resolutionNote: 5 as unknown as string }, /inválida/);
  d.items = [done];
  const m = run(d, { type: 'reopen_item', itemId: ITEM });
  const r = m.update.items[0];
  assert.equal(r.status, 'open');
  for (const key of ['correctedOn', 'resolvedAt', 'resolvedBy', 'resolutionNote']) assert.equal(key in r, false, key);
  assert.deepEqual(touched(m), ['~items']);
  assert.deepEqual(m.removeFiles, []);
  rejects(data(), { type: 'reopen_item', itemId: ITEM }, 'O apontamento já está aberto.');
});

test('apagar apontamento apaga a linha (fotos em cascata) e devolve todos os arquivos das fotos', () => {
  const d = resolved();
  d.photos.push(photo(7, { itemId: 'outro' }));
  const m = run(d, { type: 'delete_item', itemId: ITEM });
  assert.equal(m.workId, W);
  assert.deepEqual(m.delete.items, [ITEM]);
  assert.deepEqual(m.delete.photos, []);
  assert.deepEqual(m.removeFiles, [
    `${W}/${ITEM}/${PHOTO(1)}.jpg`,
    `${W}/${ITEM}/${PHOTO(1)}-thumb.jpg`,
    `${W}/${ITEM}/${PHOTO(2)}.jpg`,
    `${W}/${ITEM}/${PHOTO(2)}-thumb.jpg`,
  ]);
  rejects(d, { type: 'delete_item', itemId: 'nada' }, 'Apontamento não encontrado.');
});

test('o planejador não altera os dados recebidos', () => {
  const d = resolved();
  const before = JSON.stringify(d);
  run(d, { type: 'reopen_item', itemId: ITEM });
  run(d, updateItem({ description: 'Outra' }));
  run(d, { type: 'reorder_types', typeIds: ['t2', 't1'] });
  run(d, { type: 'update_items', workId: W, itemIds: [ITEM], typeId: null });
  assert.equal(JSON.stringify(d), before);
});

test('"dias para resolver": até a correção quando finalizado, até hoje quando aberto', () => {
  assert.equal(safetyDays(item(), '2026-11-05'), 16);
  assert.equal(safetyDays(item({ correctedOn: '2026-10-25' }), '2026-11-05'), 5);
});

// ----- Formato do comando e destino -----

test('alvo do comando: lista única de tipos, a obra direto ou o registro cuja obra a rota busca', () => {
  assert.deepEqual(safetyCommandTarget({ type: 'create_type', name: 'X' }), { global: true });
  assert.deepEqual(safetyCommandTarget({ type: 'update_type', typeId: 't1', active: false }), { global: true });
  assert.deepEqual(safetyCommandTarget({ type: 'reorder_types', typeIds: [] }), { global: true });
  assert.throws(() => safetyCommandTarget({ type: 'update_type', typeId: '' }), { message: 'Tipo de apontamento não informado.' });
  assert.deepEqual(safetyCommandTarget(createItem()), { workId: W });
  assert.deepEqual(safetyCommandTarget({ type: 'update_items', workId: W, itemIds: [ITEM] }), { workId: W });
  assert.throws(() => safetyCommandTarget(createItem({ workId: '' })), { message: 'Obra não informada.' });
  assert.deepEqual(safetyCommandTarget(updateItem()), { table: 'items', id: ITEM });
  assert.deepEqual(safetyCommandTarget(addPhoto(5)), { table: 'items', id: ITEM });
  assert.deepEqual(safetyCommandTarget({ type: 'resolve_item', itemId: ITEM, correctedOn: '2026-10-25' }), { table: 'items', id: ITEM });
  assert.deepEqual(safetyCommandTarget({ type: 'reopen_item', itemId: ITEM }), { table: 'items', id: ITEM });
  assert.deepEqual(safetyCommandTarget({ type: 'delete_photo', photoId: PHOTO(1) }), { table: 'photos', id: PHOTO(1) });
  assert.throws(() => safetyCommandTarget({ type: 'delete_item', itemId: '' }), { message: 'Apontamento não informado.' });
  assert.throws(() => safetyCommandTarget({ type: 'delete_photo', photoId: '' }), { message: 'Foto não informada.' });
});

test('corpo do comando precisa ser objeto com tipo conhecido', () => {
  assert.throws(() => parseSafetyCommand(null), { message: 'Comando inválido.' });
  assert.throws(() => parseSafetyCommand([]), { message: 'Comando inválido.' });
  assert.throws(() => parseSafetyCommand({ name: 'x' }), { message: 'Comando inválido.' });
  assert.throws(() => parseSafetyCommand({ type: 'create_floors' }), { message: 'Comando desconhecido.' });
  assert.equal(parseSafetyCommand({ type: 'reopen_item', itemId: ITEM }).type, 'reopen_item');
  assert.equal(parseSafetyCommand({ type: 'update_items' }).type, 'update_items');
  rejects(data(), { type: 'drop_table' } as unknown as SafetyCommand, 'Comando desconhecido.');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checklistBoard,
  checklistSummary,
  equipmentTypes,
  CHECKLIST_TOKEN,
  modelsFor,
  operatorDues,
  periodKey,
  type ChecklistData,
  type ChecklistEquipment,
  type ChecklistModel,
  type ChecklistRun,
} from '../src/domain/equipment-checklist';
import {
  canManageChecklist,
  canWriteChecklist,
  checklistCommandNeedsAdmin,
  checklistCommandTarget,
  parseChecklistCommand,
  parseOperatorRun,
  planChecklistCommand,
  planOperatorRun,
} from '../src/application/use-cases/checklist-commands';
import { hasSectionAccess, isRestrictedApi, MODULES } from '../src/application/module-access';

const NOW = '2026-11-11T12:00:00.000Z';
const TODAY = '2026-11-11'; // quarta-feira
function ctx() {
  let n = 0;
  return { actorId: 'tst-1', now: NOW, today: TODAY, newId: () => `new-${++n}` };
}
const model = (over: Partial<ChecklistModel> = {}): ChecklistModel => ({
  id: 'm-dia',
  name: 'Betoneira — diário',
  equipmentType: 'Betoneira',
  frequency: 'daily',
  items: [
    { id: 'i1', text: 'Proteção das partes móveis' },
    { id: 'i2', text: 'Aterramento' },
  ],
  active: true,
  createdBy: 'tst-1',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const equipment = (over: Partial<ChecklistEquipment> = {}): ChecklistEquipment => ({
  id: 'e1',
  workId: 'obra-1',
  name: 'Betoneira 01',
  equipmentType: 'Betoneira',
  active: true,
  publicToken: 'segredo-do-equipamento-e1-0123456789',
  createdBy: 'tst-1',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const run = (over: Partial<ChecklistRun> = {}): ChecklistRun => ({
  id: 'r1',
  workId: 'obra-1',
  equipmentId: 'e1',
  modelId: 'm-dia',
  modelName: 'Betoneira — diário',
  frequency: 'daily',
  doneOn: TODAY,
  answers: [
    { itemId: 'i1', text: 'Proteção das partes móveis', answer: 'c', note: '' },
    { itemId: 'i2', text: 'Aterramento', answer: 'c', note: '' },
  ],
  note: '',
  operatorName: '',
  signaturePath: null,
  signedAt: null,
  photos: [],
  source: 'app',
  createdBy: 'tst-1',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const data = (over: Partial<ChecklistData> = {}): ChecklistData => ({ models: [model()], equipment: [equipment()], runs: [], ...over });
const plan = (d: ChecklistData, command: unknown) => planChecklistCommand(d, parseChecklistCommand(command), ctx(), 'obra-1');
const answersOk = [
  { itemId: 'i1', answer: 'c' },
  { itemId: 'i2', answer: 'c' },
];

test('checklist: só TST e admin editam; a aba é aberta para consulta', () => {
  assert.equal(canWriteChecklist({ tst: true, role: 'viewer' }), true);
  assert.equal(canWriteChecklist({ role: 'admin' }), true);
  assert.equal(canWriteChecklist({ role: 'manager' }), false);
  assert.equal(canWriteChecklist({ role: 'planner' }), false);
  assert.equal(canWriteChecklist(null), false);
  assert.equal(hasSectionAccess('checklist', { developer: false, modules: [] }), true);
  assert.equal(isRestrictedApi('/api/checklist'), false);
  assert.equal(MODULES.find(m => m.section === 'checklist')?.open, true);
});

test('checklist: o período é o dia, a semana de segunda a domingo e o mês', () => {
  assert.equal(periodKey('daily', '2026-11-11'), '2026-11-11');
  assert.equal(periodKey('weekly', '2026-11-11'), '2026-11-09');
  assert.equal(periodKey('weekly', '2026-11-09'), '2026-11-09');
  assert.equal(periodKey('weekly', '2026-11-15'), '2026-11-09'); // domingo fecha a semana
  assert.equal(periodKey('weekly', '2026-11-16'), '2026-11-16');
  assert.equal(periodKey('monthly', '2026-11-30'), '2026-11');
});

test('checklist: o equipamento recebe os modelos ativos do tipo dele, sem acento nem maiúsculas', () => {
  const models = [
    model(),
    model({ id: 'm-mes', name: 'Betoneira — mensal', frequency: 'monthly', equipmentType: 'betoneira ' }),
    model({ id: 'm-off', name: 'Betoneira antigo', active: false }),
    model({ id: 'm-serra', name: 'Serra — diário', equipmentType: 'Serra circular' }),
  ];
  assert.deepEqual(
    modelsFor(equipment({ equipmentType: 'BETONEIRA' }), models).map(m => m.id),
    ['m-dia', 'm-mes'],
  );
  assert.deepEqual(equipmentTypes({ models, equipment: [equipment()] }), ['Betoneira', 'Serra circular']);
});

test('checklist: o quadro mostra pendente, feito e não conforme no período corrente', () => {
  const weekly = model({ id: 'm-sem', name: 'Betoneira — semanal', frequency: 'weekly' });
  const monthly = model({ id: 'm-mes', name: 'Betoneira — mensal', frequency: 'monthly' });
  const d = data({
    models: [model(), weekly, monthly],
    equipment: [equipment(), equipment({ id: 'e2', name: 'Guincho 01', equipmentType: 'Guincho' }), equipment({ id: 'e3', active: false })],
    runs: [
      run({ id: 'r-ontem', doneOn: '2026-11-10' }), // diário de ontem não vale hoje
      run({ id: 'r-sem', modelId: 'm-sem', frequency: 'weekly', doneOn: '2026-11-09' }), // segunda desta semana
      run({
        id: 'r-mes',
        modelId: 'm-mes',
        frequency: 'monthly',
        doneOn: '2026-11-02',
        answers: [{ itemId: 'i1', text: 'x', answer: 'nc', note: 'sem proteção' }],
      }),
    ],
  });
  const board = checklistBoard(d, TODAY);
  assert.deepEqual(
    board.map(r => r.equipment.id),
    ['e1', 'e2'],
  );
  const [daily, week, month] = board[0].dues;
  assert.equal(daily.status, 'pending');
  assert.equal(daily.lastDoneOn, '2026-11-10');
  assert.equal(week.status, 'done');
  assert.equal(month.status, 'nonconforming');
  assert.equal(board[1].dues.length, 0);
  const summary = checklistSummary(board);
  assert.deepEqual(summary.due.daily, { total: 1, pending: 1 });
  assert.deepEqual(summary.due.weekly, { total: 1, pending: 0 });
  assert.equal(summary.nonconforming, 1);
  assert.equal(summary.withoutModel, 1);
});

test('checklist: criar modelo limpa os textos e recusa nome repetido, item em branco ou repetido', () => {
  const m = plan(data(), {
    type: 'save_model',
    name: '  Serra   circular — diário ',
    equipmentType: 'Serra circular',
    frequency: 'daily',
    items: [{ text: ' Coifa  instalada ' }, { text: 'Empurrador disponível' }],
  });
  assert.equal(m.workId, undefined);
  assert.equal(m.insert.models[0].name, 'Serra circular — diário');
  assert.deepEqual(
    m.insert.models[0].items.map(i => i.text),
    ['Coifa instalada', 'Empurrador disponível'],
  );
  const base = { type: 'save_model', equipmentType: 'Betoneira', frequency: 'daily' };
  assert.throws(() => plan(data(), { ...base, name: 'betoneira — DIÁRIO', items: [{ text: 'a' }] }), /Já existe um checklist/);
  assert.throws(() => plan(data(), { ...base, name: 'Novo', items: [] }), /pelo menos um item/);
  assert.throws(() => plan(data(), { ...base, name: 'Novo', items: [{ text: '  ' }] }), /em branco/);
  assert.throws(() => plan(data(), { ...base, name: 'Novo', items: [{ text: 'A' }, { text: 'a' }] }), /repetido/);
  assert.throws(() => parseChecklistCommand({ ...base, name: 'Novo', frequency: 'anual', items: [] }), /Periodicidade/);
});

test('checklist: editar modelo mantém o id dos itens que ficaram e a grafia do tipo que já existe', () => {
  const m = plan(data(), {
    type: 'save_model',
    id: 'm-dia',
    name: 'Betoneira — diário',
    equipmentType: 'betoneira',
    frequency: 'daily',
    items: [
      { id: 'i2', text: 'Aterramento conferido' },
      { id: 'de-outro-modelo', text: 'Chave liga/desliga' },
    ],
  });
  const saved = m.update.models[0];
  assert.equal(saved.equipmentType, 'Betoneira');
  assert.equal(saved.items[0].id, 'i2');
  assert.notEqual(saved.items[1].id, 'de-outro-modelo');
});

test('checklist: equipamento é da obra aberta e não repete o nome nela', () => {
  const m = plan(data(), { type: 'save_equipment', workId: 'obra-1', name: 'Betoneira 02', equipmentType: 'betoneira' });
  assert.equal(m.workId, 'obra-1');
  assert.equal(m.insert.equipment[0].equipmentType, 'Betoneira');
  assert.throws(
    () => plan(data(), { type: 'save_equipment', workId: 'obra-1', name: 'betoneira 01', equipmentType: 'Betoneira' }),
    /Já existe/,
  );
  const off = plan(data(), { type: 'set_equipment_active', id: 'e1', active: false });
  assert.equal(off.update.equipment[0].active, false);
  assert.deepEqual(checklistCommandTarget(parseChecklistCommand({ type: 'set_equipment_active', id: 'e1', active: false })), {
    table: 'equipment',
    id: 'e1',
  });
});

test('checklist: a inspeção guarda o texto dos itens e exige todos respondidos', () => {
  const m = plan(data(), { type: 'save_run', workId: 'obra-1', equipmentId: 'e1', modelId: 'm-dia', doneOn: TODAY, answers: answersOk });
  const saved = m.insert.runs[0];
  assert.equal(saved.modelName, 'Betoneira — diário');
  assert.equal(saved.frequency, 'daily');
  assert.deepEqual(
    saved.answers.map(a => a.text),
    ['Proteção das partes móveis', 'Aterramento'],
  );
  const base = { type: 'save_run', workId: 'obra-1', equipmentId: 'e1', modelId: 'm-dia', doneOn: TODAY };
  assert.throws(() => plan(data(), { ...base, answers: [answersOk[0]] }), /Responda o item "Aterramento"/);
  assert.throws(() => plan(data(), { ...base, answers: [...answersOk, { itemId: 'x', answer: 'c' }] }), /mudou enquanto/);
  assert.throws(() => plan(data(), { ...base, answers: [answersOk[0], { itemId: 'i2', answer: 'nc' }] }), /Descreva a não conformidade/);
  assert.throws(() => parseChecklistCommand({ ...base, answers: [{ itemId: 'i1', answer: 'ok' }] }), /Resposta inválida/);
});

test('checklist: recusa data futura, dia repetido, tipo diferente e modelo ou equipamento desativado', () => {
  const base = { type: 'save_run', workId: 'obra-1', equipmentId: 'e1', modelId: 'm-dia', answers: answersOk };
  assert.throws(() => plan(data(), { ...base, doneOn: '2026-11-12' }), /futuro/);
  assert.throws(() => plan(data(), { ...base, doneOn: '2026-02-30' }), /Data inválida/);
  assert.throws(() => plan(data({ runs: [run()] }), { ...base, doneOn: TODAY }), /já foi preenchido/);
  assert.throws(() => plan(data({ models: [model({ active: false })] }), { ...base, doneOn: TODAY }), /checklist está desativado/);
  assert.throws(() => plan(data({ equipment: [equipment({ active: false })] }), { ...base, doneOn: TODAY }), /equipamento está desativado/);
  assert.throws(() => plan(data({ equipment: [equipment({ equipmentType: 'Guincho' })] }), { ...base, doneOn: TODAY }), /é de Betoneira/);
});

test('checklist: editar a inspeção usa os itens que ela guardou, mesmo com o modelo já alterado', () => {
  const changed = model({ items: [{ id: 'i9', text: 'Item novo' }] });
  const d = data({ models: [changed], runs: [run()] });
  const m = plan(d, {
    type: 'save_run',
    id: 'r1',
    workId: 'obra-1',
    equipmentId: 'e1',
    modelId: 'm-dia',
    doneOn: '2026-11-10',
    answers: [
      { itemId: 'i1', answer: 'nc', note: 'correia exposta' },
      { itemId: 'i2', answer: 'na' },
    ],
  });
  const saved = m.update.runs[0];
  assert.equal(saved.doneOn, '2026-11-10');
  assert.equal(saved.answers[0].note, 'correia exposta');
  assert.equal(saved.answers[1].answer, 'na');
  const del = plan(d, { type: 'delete_run', id: 'r1' });
  assert.deepEqual(del.deleteRuns, ['r1']);
  assert.throws(() => plan(d, { type: 'delete_run', id: 'nao-existe' }), /não encontrada/);
});

// 12/11/2026: cadastro só com admin, link do operador (QR, sem login), assinatura e fotos.
const PNG = `iVBORw0KGgo${'A'.repeat(40)}`;
const JPEG = `/9j/${'A'.repeat(40)}`;

test('checklist: cadastro (modelo, equipamento, link do QR) é só do admin; TST segue nas inspeções', () => {
  assert.equal(canManageChecklist({ role: 'admin' }), true);
  assert.equal(canManageChecklist({ role: 'viewer', tst: true } as { role: string }), false);
  assert.equal(canManageChecklist(null), false);
  for (const type of ['save_model', 'set_model_active', 'save_equipment', 'set_equipment_active', 'rotate_equipment_token'])
    assert.equal(checklistCommandNeedsAdmin({ type } as never), true, type);
  for (const type of ['save_run', 'delete_run']) assert.equal(checklistCommandNeedsAdmin({ type } as never), false, type);
});

test('checklist: equipamento novo nasce com link próprio e "gerar novo link" troca o segredo', () => {
  const created = plan(data({ equipment: [] }), { type: 'save_equipment', workId: 'obra-1', name: 'Guincho 01', equipmentType: 'Guincho' });
  assert.match(created.insert.equipment[0].publicToken, /^[A-Za-z0-9_-]+$/);
  const rotated = plan(data(), { type: 'rotate_equipment_token', id: 'e1' });
  assert.notEqual(rotated.update.equipment[0].publicToken, equipment().publicToken);
  assert.deepEqual(checklistCommandTarget(parseChecklistCommand({ type: 'rotate_equipment_token', id: 'e1' })), {
    table: 'equipment',
    id: 'e1',
  });
  // Renomear não troca o link: a etiqueta colada continua valendo.
  const renamed = plan(data(), { type: 'save_equipment', id: 'e1', workId: 'obra-1', name: 'Betoneira A', equipmentType: 'Betoneira' });
  assert.equal(renamed.update.equipment[0].publicToken, equipment().publicToken);
  assert.equal(CHECKLIST_TOKEN.test('curto'), false);
  assert.equal(CHECKLIST_TOKEN.test('a'.repeat(32)), true);
  assert.equal(CHECKLIST_TOKEN.test(`${'a'.repeat(31)}/`), false);
});

test('checklist pelo QR: registra hoje com nome, assinatura e fotos, e os arquivos vão para a pasta da inspeção', () => {
  const input = parseOperatorRun({
    modelId: 'm-dia',
    answers: answersOk,
    operatorName: '  Carlos   Henrique da Silva ',
    signature: PNG,
    photos: [{ id: 'foto-1', data: JPEG }],
    // O que o operador tentar mandar a mais é ignorado: obra, equipamento, data e id são do servidor.
    workId: 'outra-obra',
    doneOn: '2026-01-01',
    id: 'r1',
  });
  const m = planOperatorRun(data(), input, ctx(), equipment());
  const saved = m.insert.runs[0];
  assert.equal(saved.workId, 'obra-1');
  assert.equal(saved.equipmentId, 'e1');
  assert.equal(saved.doneOn, TODAY);
  assert.equal(saved.source, 'link');
  assert.equal(saved.operatorName, 'Carlos Henrique da Silva');
  assert.equal(saved.signedAt, NOW);
  assert.ok(saved.signaturePath?.startsWith(`obra-1/${saved.id}/assinatura-`));
  assert.deepEqual(saved.photos, [{ id: 'foto-1', path: `obra-1/${saved.id}/foto-1.jpg` }]);
  assert.deepEqual(
    m.uploads.map(u => [u.path, u.contentType]),
    [
      [saved.signaturePath, 'image/png'],
      [`obra-1/${saved.id}/foto-1.jpg`, 'image/jpeg'],
    ],
  );
});

test('checklist pelo QR: exige nome completo e assinatura, e só aceita o que está pendente no período', () => {
  const base = { modelId: 'm-dia', answers: answersOk, operatorName: 'Carlos Silva', signature: PNG };
  const send = (d: ChecklistData, body: unknown) => planOperatorRun(d, parseOperatorRun(body), ctx(), equipment());
  assert.throws(() => send(data(), { ...base, operatorName: 'Carlos' }), /nome completo/);
  assert.throws(() => parseOperatorRun({ ...base, signature: undefined }), /signature/);
  assert.throws(() => send(data(), { ...base, signature: 'nao-e-png' }), /Assinatura inválida/);
  assert.throws(() => send(data(), { ...base, photos: [{ id: 'f1', data: PNG }] }), /Foto inválida/);
  assert.throws(() => send(data(), { ...base, photos: [{ id: '../x', data: JPEG }] }), /Foto inválida/);
  assert.throws(() => send(data(), { ...base, photos: [1, 2, 3, 4, 5].map(n => ({ id: `f${n}`, data: JPEG })) }), /até 4 fotos/);
  assert.throws(() => send(data({ runs: [run()] }), base), /já foi preenchido/);
  assert.throws(() => send(data({ equipment: [equipment({ active: false })] }), base), /desativado/);
  // Semanal feito na segunda: na quarta da mesma semana o link não aceita de novo.
  const weekly = model({ id: 'm-sem', name: 'Betoneira — semanal', frequency: 'weekly' });
  const done = run({ id: 'r-sem', modelId: 'm-sem', frequency: 'weekly', doneOn: '2026-11-09' });
  assert.throws(() => send(data({ models: [weekly], runs: [done] }), { ...base, modelId: 'm-sem' }), /já foi preenchido neste período/);
  // A tela logada segue podendo repetir o semanal em outro dia da semana.
  const again = plan(data({ models: [weekly], runs: [done] }), {
    type: 'save_run',
    workId: 'obra-1',
    equipmentId: 'e1',
    modelId: 'm-sem',
    doneOn: TODAY,
    answers: answersOk,
  });
  assert.equal(again.insert.runs[0].source, 'app');
  assert.equal(again.insert.runs[0].signaturePath, null);
});

test('checklist: editar mantém assinatura e fotos, troca o que mudou e a exclusão leva os arquivos', () => {
  const signed = run({
    operatorName: 'Carlos Silva',
    signaturePath: 'obra-1/r1/assinatura-a.png',
    signedAt: NOW,
    photos: [
      { id: 'f1', path: 'obra-1/r1/f1.jpg' },
      { id: 'f2', path: 'obra-1/r1/f2.jpg' },
    ],
    source: 'link',
  });
  const d = data({ runs: [signed] });
  const base = { type: 'save_run', id: 'r1', workId: 'obra-1', equipmentId: 'e1', modelId: 'm-dia', doneOn: TODAY, answers: answersOk };
  const kept = plan(d, base).update.runs[0];
  assert.equal(kept.signaturePath, signed.signaturePath);
  assert.equal(kept.photos.length, 2);
  assert.equal(kept.operatorName, 'Carlos Silva');
  assert.equal(kept.source, 'link');
  const changed = plan(d, { ...base, signature: PNG, photos: [{ id: 'f2' }, { id: 'f3', data: JPEG }] });
  assert.deepEqual(
    changed.update.runs[0].photos.map(p => p.id),
    ['f2', 'f3'],
  );
  assert.deepEqual(changed.removeFiles.sort(), ['obra-1/r1/assinatura-a.png', 'obra-1/r1/f1.jpg']);
  assert.equal(changed.uploads.length, 2);
  assert.throws(() => plan(d, { ...base, photos: [{ id: 'f9' }] }), /Foto não encontrada/);
  assert.throws(() => plan(data(), { ...base, id: undefined, signature: PNG }), /nome de quem assina/);
  assert.deepEqual(plan(d, { type: 'delete_run', id: 'r1' }).removeFiles.sort(), [
    'obra-1/r1/assinatura-a.png',
    'obra-1/r1/f1.jpg',
    'obra-1/r1/f2.jpg',
  ]);
});

test('checklist pelo QR: o operador vê só os checklists do equipamento, com a situação e quem fez', () => {
  const weekly = model({ id: 'm-sem', name: 'Betoneira — semanal', frequency: 'weekly' });
  const other = equipment({ id: 'e2', name: 'Betoneira 02' });
  const d = data({
    models: [model(), weekly],
    equipment: [equipment(), other],
    runs: [run({ operatorName: 'José Almeida', source: 'link' }), run({ id: 'r2', equipmentId: 'e2' })],
  });
  const dues = operatorDues(d, 'e1', TODAY);
  assert.deepEqual(
    dues.map(due => [due.modelId, due.status, due.doneBy]),
    [
      ['m-dia', 'done', 'José Almeida'],
      ['m-sem', 'pending', ''],
    ],
  );
  assert.equal(dues[0].items.length, 2);
  assert.deepEqual(operatorDues(d, 'nao-existe', TODAY), []);
});

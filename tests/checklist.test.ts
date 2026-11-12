import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checklistBoard,
  checklistSummary,
  equipmentTypes,
  modelsFor,
  periodKey,
  type ChecklistData,
  type ChecklistEquipment,
  type ChecklistModel,
  type ChecklistRun,
} from '../src/domain/equipment-checklist';
import {
  canWriteChecklist,
  checklistCommandTarget,
  parseChecklistCommand,
  planChecklistCommand,
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crewSize,
  entriesOfDay,
  normalizeUnit,
  perManDay,
  productionCatalog,
  productionSummary,
  productivityBy,
  type ProductionData,
  type ProductionEntry,
} from '../src/domain/production';
import {
  applyProductionMutation,
  canWriteProduction,
  parseProductionCommand,
  planProductionCommand,
  productionCommandTarget,
  type ProductionContext,
} from '../src/application/use-cases/production-commands';
import {
  importedProductionId,
  parseSheetNumber,
  pendingProductionImport,
  planProductionImport,
} from '../src/application/use-cases/import-production';
import { hasApiAccess, hasSectionAccess } from '../src/application/module-access';

/** Aba 8, Controle de produtividade (11/11/2026): contas da tela, regras dos comandos e importação. */

const W = 'obra-1';
const NOW = '2026-11-11T15:00:00.000Z';
let seq = 0;
const ctx = (over: Partial<ProductionContext> = {}): ProductionContext => ({
  actorId: 'u-1',
  now: NOW,
  today: '2026-11-11',
  newId: () => `id-${++seq}`,
  ...over,
});
const entry = (
  id: string,
  workedOn: string,
  service: string,
  contractor: string,
  professionals: number,
  helpers: number,
  quantity: number | null,
  unit: ProductionEntry['unit'] = 'm²',
  note = '',
): ProductionEntry => ({
  id,
  workId: W,
  workedOn,
  service,
  contractor,
  professionals,
  helpers,
  quantity,
  unit,
  note,
  origin: 'app',
  createdBy: 'u-1',
  createdAt: NOW,
  updatedAt: NOW,
});
const ROWS: ProductionEntry[] = [
  entry('a', '2026-11-09', 'Reboco', 'GGP', 2, 1, 30),
  entry('b', '2026-11-10', 'Reboco', 'GGP', 4, 2, 90),
  entry('c', '2026-11-10', 'Reboco', 'Fusca', 1, 0, 5),
  entry('d', '2026-11-10', 'Reboco', 'GGP', 2, 1, null, 'm²', 'Trecho B'),
  entry('e', '2026-11-10', 'Aço', 'AWA', 3, 1, 800, 'kg'),
  entry('f', '2026-11-10', 'Requadro', 'GGP', 1, 0, 12, 'm'),
];
const NOVEMBER = { from: '2026-11-01', to: '2026-11-30' };
const data = (): ProductionData => ({ entries: ROWS.map(e => ({ ...e })) });
const refuses = (fn: () => unknown, message: RegExp) => assert.throws(fn, message);

test('unidade: as grafias da planilha caem em sete', () => {
  for (const u of ['m²', 'M²', 'm2', 'M2']) assert.equal(normalizeUnit(u), 'm²');
  for (const u of ['un', 'Un', 'und', 'unid', 'uni', 'ud', 'UD', 'u', 'umd']) assert.equal(normalizeUnit(u), 'un');
  for (const u of ['m', 'ml', 'Ml', 'm/l', 'm/L']) assert.equal(normalizeUnit(u), 'm');
  assert.equal(normalizeUnit('Kgs'), 'kg');
  assert.equal(normalizeUnit('M³'), 'm³');
  assert.equal(normalizeUnit('0'), '');
  assert.equal(normalizeUnit(undefined), '');
});

test('produção por homem-dia: só de linha medida', () => {
  assert.equal(crewSize(ROWS[0]), 3);
  assert.equal(perManDay(ROWS[0]), 10);
  assert.equal(perManDay(ROWS[3]), null);
});

test('resumo do período conta o que está a medir', () => {
  const s = productionSummary(ROWS, NOVEMBER);
  assert.deepEqual([s.entries, s.measured, s.pending, s.manDays, s.days, s.services, s.contractors], [6, 5, 1, 18, 2, 3, 3]);
  assert.equal(productionSummary(ROWS, { from: '2026-11-10', to: '2026-11-10' }).entries, 5);
});

test('produtividade por serviço: ponderada pelo período, só com as medidas', () => {
  const rows = productivityBy(ROWS, NOVEMBER, 'service');
  const reboco = rows[0];
  assert.deepEqual(
    [reboco.name, reboco.unit, reboco.quantity, reboco.manDays, reboco.measured, reboco.pending],
    ['Reboco', 'm²', 125, 10, 3, 1],
  );
  assert.equal(reboco.perManDay, 12.5, '125 m² ÷ 10 homens-dia, não a média das três linhas');
  assert.deepEqual([reboco.worst, reboco.best], [5, 15]);
  assert.deepEqual(
    rows.slice(1).map(r => [r.name, r.unit, r.perManDay]),
    [
      ['Aço', 'kg', 200],
      ['Requadro', 'm', 12],
    ],
  );
  const contractors = productivityBy(ROWS, NOVEMBER, 'contractor', 'reboco');
  assert.deepEqual(
    contractors.map(r => [r.name, r.perManDay, r.pending]),
    [
      ['GGP', 120 / 9, 1],
      ['Fusca', 5, 0],
    ],
  );
});

test('serviço lançado em duas unidades vira duas linhas', () => {
  const mixed = [...ROWS, entry('g', '2026-11-10', 'Reboco', 'GGP', 1, 0, 8, 'm')];
  assert.deepEqual(
    productivityBy(mixed, NOVEMBER, 'service')
      .filter(r => r.name === 'Reboco')
      .map(r => r.unit)
      .sort(),
    ['m', 'm²'],
  );
});

test('folha do dia e catálogo com a unidade que o serviço costuma ter', () => {
  assert.deepEqual(
    entriesOfDay(ROWS, '2026-11-10').map(e => e.id),
    ['e', 'c', 'b', 'd', 'f'],
  );
  const catalog = productionCatalog(ROWS);
  assert.deepEqual(catalog.services[0], { name: 'Reboco', uses: 4, unit: 'm²' });
  assert.equal(catalog.contractors[0].name, 'GGP');
});

test('parse: quantity nula é "a medir"; forma errada é recusada', () => {
  const body = {
    type: 'save_entry',
    workId: W,
    workedOn: '2026-11-11',
    service: 'Reboco',
    contractor: 'GGP',
    professionals: 2,
    helpers: 1,
    quantity: null,
    unit: '',
  };
  assert.equal(parseProductionCommand(body).type, 'save_entry');
  refuses(() => parseProductionCommand({ ...body, quantity: '10' }), /quantity/);
  refuses(() => parseProductionCommand({ ...body, professionals: '2' }), /professionals/);
  refuses(() => parseProductionCommand({ type: 'x' }), /desconhecido/);
  assert.deepEqual(productionCommandTarget({ type: 'delete_entry', id: 'a' }), { entryId: 'a' });
});

const save = (over: Record<string, unknown> = {}, id?: string) =>
  planProductionCommand(
    data(),
    {
      type: 'save_entry',
      ...(id ? { id } : {}),
      workId: W,
      workedOn: '2026-11-11',
      service: 'Reboco',
      contractor: 'GGP',
      professionals: 2,
      helpers: 1,
      quantity: 42.5,
      unit: 'M2',
      ...over,
    } as never,
    ctx(),
    W,
  );

test('save_entry cria na grafia da obra, com a unidade normalizada', () => {
  const created = save({ service: ' reboco ', contractor: 'ggp', note: '  Trecho  C ' }).insert[0];
  assert.deepEqual(
    [created.service, created.contractor, created.quantity, created.unit, created.note, created.origin],
    ['Reboco', 'GGP', 42.5, 'm²', 'Trecho C', 'app'],
  );
  const pending = save({ quantity: null, unit: '' }).insert[0];
  assert.deepEqual([pending.quantity, pending.unit], [null, '']);
  // Duas frentes do mesmo serviço e empreiteiro no dia são aceitas.
  assert.equal(save({ workedOn: '2026-11-10' }).insert.length, 1);
});

test('save_entry recusa o que a planilha deixava passar', () => {
  refuses(() => save({ workedOn: '2026-11-12' }), /futuro/);
  refuses(() => save({ workedOn: '2026-02-31' }), /inválida/);
  refuses(() => save({ service: ' ' }), /serviço/);
  refuses(() => save({ contractor: '' }), /empreiteiro/);
  refuses(() => save({ professionals: 0, helpers: 0 }), /ao menos uma pessoa/);
  refuses(() => save({ professionals: 1.5 }), /inteiro/);
  refuses(() => save({ helpers: 201 }), /200/);
  refuses(() => save({ quantity: 0 }), /maior que zero/);
  refuses(() => save({ unit: '' }), /unidade da produção/);
  refuses(() => save({ unit: 'saco' }), /Unidade desconhecida/);
});

test('save_entry com id edita; medir é editar a quantidade', () => {
  const m = save({ workedOn: '2026-11-10', quantity: 60, unit: 'm²', note: 'Trecho B' }, 'd');
  assert.equal(m.insert.length, 0);
  assert.deepEqual([m.update[0].id, m.update[0].quantity, m.update[0].createdAt, m.update[0].updatedAt], ['d', 60, NOW, NOW]);
  refuses(() => save({}, 'zz'), /não encontrado/);
});

test('copy_day repete as equipes sem a produção nem as observações', () => {
  const m = planProductionCommand(data(), { type: 'copy_day', workId: W, from: '2026-11-10', to: '2026-11-11' }, ctx(), W);
  assert.equal(m.insert.length, 5);
  assert.ok(m.insert.every(e => e.workedOn === '2026-11-11' && e.quantity === null && e.note === ''));
  assert.equal(m.insert.find(e => e.service === 'Aço')?.unit, 'kg', 'a unidade fica como referência');
  refuses(
    () => planProductionCommand(data(), { type: 'copy_day', workId: W, from: '2026-11-09', to: '2026-11-10' }, ctx(), W),
    /já tem lançamentos/,
  );
  refuses(
    () => planProductionCommand(data(), { type: 'copy_day', workId: W, from: '2026-11-08', to: '2026-11-11' }, ctx(), W),
    /origem não tem/,
  );
});

test('delete_entry, mutação na tela e quem grava', () => {
  const removal = planProductionCommand(data(), { type: 'delete_entry', id: 'f' }, ctx(), W);
  const after = applyProductionMutation(ROWS, {
    insert: [],
    update: save({ workedOn: '2026-11-10', quantity: 60, unit: 'm²' }, 'd').update,
    delete: removal.delete,
  });
  assert.equal(after.length, 5);
  assert.equal(after.find(e => e.id === 'd')?.quantity, 60);
  assert.ok(canWriteProduction({ role: 'manager' }));
  assert.ok(!canWriteProduction({ role: 'viewer' }));
  const granted = { developer: false, modules: ['produtividade'] };
  assert.equal(hasSectionAccess('produtividade', { developer: false, modules: [] }), false);
  assert.equal(hasSectionAccess('produtividade', granted), true);
  assert.equal(hasApiAccess('/api/produtividade/commands', granted), true);
  assert.equal(hasApiAccess('/api/produtividade', { developer: false, modules: ['histograma'] }), false);
});

// ----- Importação -----

const HEADER = ['OBRA', 'SERVIÇO', 'EMPREITEIRO', 'DATA', 'QTD PROFISSIONAIS', 'QTD AJUDANTES', 'PRODUÇÃO', 'UNID.', 'OBS.'];
const WORKS = [{ id: 'w-mzn', name: 'Mozine', code: 'MZN' }];
const importCtx = { actorId: 'admin-1', now: NOW, today: '2026-11-11' };

test('importação: números da planilha', () => {
  assert.equal(parseSheetNumber('1.250,00'), 1250);
  assert.equal(parseSheetNumber('35,50'), 35.5);
  assert.equal(parseSheetNumber('2*'), 2);
  assert.equal(parseSheetNumber('-'), null);
  assert.equal(parseSheetNumber(''), null);
});

test('importação: "0,00" e vazio viram a medir; unidades e grafias unificadas; o resto fica de fora', () => {
  const plan = planProductionImport(
    [
      ['CONTROLE DE PRODUÇÃO ATR'],
      HEADER,
      ['MOZINE', 'Reboco', 'GGP Reboco', '10/11/2026', '2', '1', '35,50', 'M2', 'Trecho A'],
      ['MOZINE', 'Reboco ', 'GGP Reboco ', '09/11/2026', '2', '1', '0,00', 'm²', ''],
      ['MOZINE', 'reboco', 'GGP Reboco', '08/11/2026', '2', '', '', '', ''],
      ['MOZINE', 'Aço', 'AWA', '10/11/2026', '4', '2', '1.250,00', 'Kgs', ''],
      ['MOZINE', 'Limpeza', 'ATR Obra', '10/11/2026', '1', '0', '3,00', '0', 'andar 4'], // unidade irreconhecível
      ['', 'Aço', 'AWA', '10/11/2026', '1', '0', '', '', ''], // sem obra
      ['MOZINE', 'Aço', 'AWA', '32/13/2026', '1', '0', '', '', ''], // data ruim
      ['MOZINE', '', 'AWA', '10/11/2026', '1', '0', '', '', ''], // sem serviço
      ['MOZINE', 'Aço', 'AWA', '10/11/2026', '-', '-', '5,00', 'kg', ''], // sem equipe
      ['LUMMI', 'Aço', 'AWA', '10/11/2025', '1', '0', '', '', ''], // obra que o sistema não tem
    ],
    WORKS,
    importCtx,
  );
  const { report } = plan;
  assert.deepEqual(
    [report.rows, report.noWork, report.badDate, report.noService, report.noCrew, report.pending, report.unknownUnit],
    [10, 1, 1, 1, 1, 3, 1],
  );
  assert.deepEqual(report.unknownWorks, { LUMMI: 1 });
  const entries = plan.byWork.get('w-mzn')!;
  assert.equal(entries.length, 5);
  const [first, zero, blank, steel, cleaning] = entries;
  assert.deepEqual(
    [first.id, first.service, first.contractor, first.quantity, first.unit, first.note, first.origin],
    [importedProductionId('w-mzn', 3), 'Reboco', 'GGP Reboco', 35.5, 'm²', 'Trecho A', 'planilha'],
  );
  assert.equal(zero.quantity, null);
  assert.deepEqual([blank.service, blank.helpers, blank.quantity], ['Reboco', 0, null]);
  assert.deepEqual([steel.quantity, steel.unit], [1250, 'kg']);
  assert.equal(cleaning.quantity, null);
  assert.match(cleaning.note, /andar 4 · Planilha: produção 3 sem unidade reconhecida/);
  assert.equal(pendingProductionImport(entries, entries.slice(0, 2)).length, 3, 'rodar de novo só grava o que falta');
});

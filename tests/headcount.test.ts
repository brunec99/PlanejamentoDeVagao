import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACTOR_LABEL,
  OTHERS_LABEL,
  OWN_LABEL,
  crewsOfDay,
  headcountCatalog,
  headcountRanking,
  headcountSeries,
  headcountSummary,
  isIsoDate,
  isOwnCompany,
  launchedDays,
  weekday,
  workdaysBetween,
  type HeadcountData,
  type HeadcountEntry,
} from '../src/domain/headcount';
import {
  applyHeadcountMutation,
  canWriteHeadcount,
  headcountCommandTarget,
  parseHeadcountCommand,
  planHeadcountCommand,
  type HeadcountContext,
} from '../src/application/use-cases/headcount-commands';
import {
  importedHeadcountId,
  matchHeadcountWork,
  parseSheetDate,
  pendingHeadcountImport,
  planHeadcountImport,
} from '../src/application/use-cases/import-headcount';
import { hasApiAccess, hasSectionAccess, MODULES } from '../src/application/module-access';

/** Aba 7, Histograma (11/11/2026): contas da tela, regras dos comandos e importação da planilha. */

const W = 'obra-1';
const NOW = '2026-11-11T15:00:00.000Z';
let seq = 0;
const ctx = (over: Partial<HeadcountContext> = {}): HeadcountContext => ({
  actorId: 'u-1',
  now: NOW,
  today: '2026-11-11',
  newId: () => `id-${++seq}`,
  ...over,
});
const entry = (id: string, workedOn: string, company: string, role: string, quantity: number, note = ''): HeadcountEntry => ({
  id,
  workId: W,
  workedOn,
  company,
  role,
  quantity,
  note,
  origin: 'app',
  createdBy: 'u-1',
  createdAt: NOW,
  updatedAt: NOW,
});

// Semana de 02 a 08/11/2026 (segunda a domingo).
const WEEK: HeadcountEntry[] = [
  entry('a', '2026-11-02', 'ATR', 'Engenheiro', 1),
  entry('b', '2026-11-02', 'AWA', 'Carpinteiro', 9),
  entry('c', '2026-11-03', 'ATR', 'Engenheiro', 1),
  entry('d', '2026-11-03', 'AWA', 'Carpinteiro', 5),
  entry('e', '2026-11-03', 'AWA', 'Servente', 2, 'faltou 1'),
  entry('f', '2026-11-03', 'Hidrotec', 'Encanador', 4),
  entry('g', '2026-11-07', 'AWA', 'Carpinteiro', 2), // sábado
];
const NOVEMBER = { from: '2026-11-01', to: '2026-11-30' };

test('datas: dia da semana, dias úteis e data que não existe', () => {
  assert.equal(weekday('2026-11-11'), 3, '11/11/2026 é quarta');
  assert.equal(workdaysBetween('2026-11-06', '2026-11-11'), 3, 'seg, ter e qua');
  assert.equal(workdaysBetween('2026-11-11', '2026-11-11'), 0);
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(!isIsoDate('2026-02-31'));
  assert.ok(!isIsoDate('11/11/2026'));
});

test('próprio é ATR e Takt, em qualquer grafia', () => {
  assert.ok(isOwnCompany('ATR '));
  assert.ok(isOwnCompany('takt'));
  assert.ok(!isOwnCompany('AWA ESTRU'));
});

test('série: o dia soma; a semana é média por dia útil lançado, sem o sábado', () => {
  const daily = headcountSeries(WEEK, NOVEMBER, 'dia', 'vinculo');
  assert.deepEqual(
    daily.points.map(p => [p.label, p.total]),
    [
      ['02/11', 10],
      ['03/11', 12],
      ['07/11', 2],
    ],
  );
  const weekly = headcountSeries(WEEK, NOVEMBER, 'semana', 'vinculo');
  assert.equal(weekly.points.length, 1);
  assert.equal(weekly.points[0].label, '02/11', 'a semana começa na segunda');
  assert.equal(weekly.points[0].days, 2);
  assert.equal(weekly.points[0].total, 11);
  assert.equal(weekly.points[0].values[OWN_LABEL], 1);
  assert.equal(weekly.points[0].values[CONTRACTOR_LABEL], 10);
  const monthly = headcountSeries(WEEK, NOVEMBER, 'mes', 'empresa', 1);
  assert.equal(monthly.points[0].label, 'nov/26');
  assert.deepEqual(monthly.keys, ['AWA', OTHERS_LABEL]);
  assert.equal(monthly.points[0].values.AWA, 8);
  assert.equal(monthly.points[0].values[OTHERS_LABEL], 3);
});

test('série: período só de fim de semana usa os dias que houver; o filtro corta', () => {
  const weekend = headcountSeries(WEEK, { from: '2026-11-07', to: '2026-11-08' }, 'semana', 'funcao');
  assert.equal(weekend.points[0].total, 2);
  assert.equal(headcountSeries(WEEK, { from: '2026-12-01', to: '2026-12-31' }, 'dia', 'vinculo').points.length, 0);
});

test('resumo: média em dia útil, pico e parcela de empreiteiros', () => {
  const s = headcountSummary(WEEK, NOVEMBER);
  assert.equal(s.manDays, 24);
  assert.equal(s.days, 3);
  assert.equal(s.dailyAverage, 11);
  assert.equal(s.peak, 12);
  assert.equal(s.peakDay, '2026-11-03');
  assert.equal(s.contractorShare, 22 / 24);
  assert.equal(s.companies, 3);
  assert.equal(s.roles, 4);
  assert.equal(headcountSummary([], NOVEMBER).dailyAverage, 0);
});

test('ranking por empresa soma as funções do mesmo dia', () => {
  const [awa, hidrotec, atr] = headcountRanking(WEEK, NOVEMBER, 'empresa');
  assert.deepEqual([awa.name, awa.manDays, awa.daysPresent, awa.peak, awa.own], ['AWA', 18, 3, 9, false]);
  assert.equal(hidrotec.name, 'Hidrotec');
  assert.deepEqual([atr.name, atr.own, atr.averagePresent], ['ATR', true, 1]);
  assert.equal(headcountRanking(WEEK, NOVEMBER, 'funcao')[0].name, 'Carpinteiro');
});

test('folha do dia: próprio primeiro, depois as maiores; catálogo do mais usado para o menos', () => {
  assert.deepEqual(launchedDays(WEEK), ['2026-11-02', '2026-11-03', '2026-11-07']);
  const crews = crewsOfDay(WEEK, '2026-11-03');
  assert.deepEqual(
    crews.map(c => [c.company, c.total]),
    [
      ['ATR', 1],
      ['AWA', 7],
      ['Hidrotec', 4],
    ],
  );
  assert.deepEqual(
    crews[1].rows.map(r => [r.role, r.quantity, r.note]),
    [
      ['Carpinteiro', 5, ''],
      ['Servente', 2, 'faltou 1'],
    ],
  );
  const catalog = headcountCatalog(WEEK);
  assert.equal(catalog.companies[0], 'AWA');
  assert.equal(catalog.roles[0], 'Carpinteiro');
});

// ----- Comandos -----

const data = (): HeadcountData => ({ entries: WEEK.map(e => ({ ...e })) });
const refuses = (fn: () => unknown, message: RegExp) => assert.throws(fn, message);

test('parse: forma do comando', () => {
  assert.deepEqual(parseHeadcountCommand({ type: 'delete_entry', id: 'a' }), { type: 'delete_entry', id: 'a' });
  assert.deepEqual(parseHeadcountCommand({ type: 'copy_day', workId: W, from: '2026-11-03', to: '2026-11-04', extra: 1 }), {
    type: 'copy_day',
    workId: W,
    from: '2026-11-03',
    to: '2026-11-04',
  });
  refuses(
    () => parseHeadcountCommand({ type: 'save_entry', workId: W, workedOn: '2026-11-04', company: 'ATR', role: 'TST', quantity: '2' }),
    /quantity/,
  );
  refuses(() => parseHeadcountCommand({ type: 'outro' }), /desconhecido/);
  refuses(() => parseHeadcountCommand(null), /inválido/);
  assert.deepEqual(headcountCommandTarget({ type: 'delete_entry', id: 'a' }), { entryId: 'a' });
  assert.deepEqual(headcountCommandTarget({ type: 'copy_day', workId: W, from: 'x', to: 'y' }), { workId: W });
});

test('save_entry cria na grafia que a obra já usa', () => {
  const m = planHeadcountCommand(
    data(),
    { type: 'save_entry', workId: W, workedOn: '2026-11-04', company: ' awa ', role: 'carpinteiro', quantity: 6, note: '  dia  cheio ' },
    ctx(),
    W,
  );
  assert.equal(m.insert.length, 1);
  const created = m.insert[0];
  assert.deepEqual(
    [created.company, created.role, created.quantity, created.note, created.origin, created.workId],
    ['AWA', 'Carpinteiro', 6, 'dia cheio', 'app', W],
  );
  assert.equal(
    planHeadcountCommand(
      data(),
      { type: 'save_entry', workId: W, workedOn: '2026-11-04', company: 'Nova Ltda', role: 'Pintor', quantity: 1 },
      ctx(),
      W,
    ).insert[0].company,
    'Nova Ltda',
  );
});

test('save_entry recusa o que a planilha deixava passar', () => {
  const save = (over: Record<string, unknown>) =>
    planHeadcountCommand(
      data(),
      { type: 'save_entry', workId: W, workedOn: '2026-11-04', company: 'AWA', role: 'Pintor', quantity: 2, ...over },
      ctx(),
      W,
    );
  refuses(() => save({ workedOn: '2026-11-12' }), /futuro/);
  refuses(() => save({ workedOn: '2026-02-31' }), /inválida/);
  refuses(() => save({ workedOn: '2019-11-04' }), /2020/);
  refuses(() => save({ company: '  ' }), /empresa/);
  refuses(() => save({ role: '' }), /função/);
  refuses(() => save({ quantity: 0 }), /inteiro/);
  refuses(() => save({ quantity: 2.5 }), /inteiro/);
  refuses(() => save({ quantity: 501 }), /500/);
  refuses(() => save({ workedOn: '2026-11-03', role: 'CARPINTEIRO ' }), /já está lançado neste dia \(5\)/);
});

test('save_entry com id edita; não deixa virar a linha de outra', () => {
  const m = planHeadcountCommand(
    data(),
    { type: 'save_entry', id: 'd', workId: W, workedOn: '2026-11-03', company: 'AWA', role: 'Carpinteiro', quantity: 8 },
    ctx(),
    W,
  );
  assert.equal(m.update[0].quantity, 8);
  assert.equal(m.update[0].updatedAt, NOW);
  assert.equal(m.insert.length, 0);
  refuses(
    () =>
      planHeadcountCommand(
        data(),
        { type: 'save_entry', id: 'd', workId: W, workedOn: '2026-11-03', company: 'AWA', role: 'Servente', quantity: 8 },
        ctx(),
        W,
      ),
    /Já existe um lançamento/,
  );
  refuses(
    () =>
      planHeadcountCommand(
        data(),
        { type: 'save_entry', id: 'zz', workId: W, workedOn: '2026-11-03', company: 'AWA', role: 'X', quantity: 1 },
        ctx(),
        W,
      ),
    /não encontrado/,
  );
});

test('copy_day repete as equipes num dia vazio, sem as observações', () => {
  const m = planHeadcountCommand(data(), { type: 'copy_day', workId: W, from: '2026-11-03', to: '2026-11-04' }, ctx(), W);
  assert.equal(m.insert.length, 4);
  assert.ok(m.insert.every(e => e.workedOn === '2026-11-04' && e.note === '' && e.origin === 'app'));
  assert.equal(
    m.insert.reduce((sum, e) => sum + e.quantity, 0),
    12,
  );
  refuses(
    () => planHeadcountCommand(data(), { type: 'copy_day', workId: W, from: '2026-11-02', to: '2026-11-03' }, ctx(), W),
    /já tem lançamentos/,
  );
  refuses(
    () => planHeadcountCommand(data(), { type: 'copy_day', workId: W, from: '2026-11-05', to: '2026-11-06' }, ctx(), W),
    /origem não tem/,
  );
  refuses(() => planHeadcountCommand(data(), { type: 'copy_day', workId: W, from: '2026-11-03', to: '2026-11-12' }, ctx(), W), /futuro/);
});

test('delete_entry e a aplicação da mutação na tela', () => {
  const removal = planHeadcountCommand(data(), { type: 'delete_entry', id: 'g' }, ctx(), W);
  assert.deepEqual(removal.delete, ['g']);
  refuses(() => planHeadcountCommand(data(), { type: 'delete_entry', id: 'zz' }, ctx(), W), /não encontrado/);
  const edit = planHeadcountCommand(
    data(),
    { type: 'save_entry', id: 'a', workId: W, workedOn: '2026-11-02', company: 'ATR', role: 'Engenheiro', quantity: 2 },
    ctx(),
    W,
  );
  const after = applyHeadcountMutation(WEEK, {
    insert: [entry('n', '2026-11-04', 'ATR', 'TST', 1)],
    update: edit.update,
    delete: removal.delete,
  });
  assert.equal(after.length, 7);
  assert.equal(after.find(e => e.id === 'a')?.quantity, 2);
  assert.ok(!after.some(e => e.id === 'g'));
  assert.ok(after.some(e => e.id === 'n'));
});

test('quem grava: todos os papéis menos consulta; o módulo é liberado por pessoa', () => {
  assert.ok(canWriteHeadcount({ role: 'planner' }));
  assert.ok(canWriteHeadcount({ role: 'admin' }));
  assert.ok(!canWriteHeadcount({ role: 'viewer' }));
  assert.ok(!canWriteHeadcount(null));
  const none = { developer: false, modules: [] };
  const granted = { developer: false, modules: ['histograma'] };
  assert.equal(hasSectionAccess('histograma', none), false);
  assert.equal(hasSectionAccess('histograma', granted), true);
  assert.equal(hasApiAccess('/api/histograma/commands', none), false);
  assert.equal(hasApiAccess('/api/histograma/commands', granted), true);
  assert.ok(MODULES.some(m => m.section === 'histograma' && !m.open));
});

// ----- Importação -----

const HEADER = ['Obra', 'Data', 'Empresa', 'Função', 'Número de funcionários', 'Observação'];
const WORKS = [
  { id: 'w-blt', name: 'Blentt', code: 'BLT' },
  { id: 'w-brz', name: 'Brizz', code: 'BRZ' },
];
const importCtx = { actorId: 'admin-1', now: NOW, today: '2026-11-11' };

test('importação: data da planilha e obra pelo código, nome ou apelido', () => {
  assert.equal(parseSheetDate('01/09/2026'), '2026-09-01');
  assert.equal(parseSheetDate('22/0/2026'), null);
  assert.equal(parseSheetDate('31/02/2026'), null);
  assert.equal(matchHeadcountWork('blt', WORKS)?.id, 'w-blt');
  assert.equal(matchHeadcountWork('BRIZZ', WORKS)?.id, 'w-brz');
  assert.equal(matchHeadcountWork('MYS', WORKS), undefined);
  assert.equal(matchHeadcountWork('MYS', WORKS, { MYS: 'BLT' })?.id, 'w-blt');
});

test('importação: unifica grafias, soma repetidas e relata o que ficou de fora', () => {
  const plan = planHeadcountImport(
    [
      HEADER,
      ['BRZ', '01/09/2026', 'ATR ', 'Técnico em Edf', '1'],
      ['BRZ', '01/09/2026', 'ATR ', 'Engenheiro', '1'],
      ['BRZ', '01/09/2026', 'ATR', 'Técnico em Edf', '1', 'atestado'], // repetida: soma
      ['BRZ', '02/09/2026', 'ATR ', 'engenheiro ', '1'],
      ['BRZ', '22/0/2026', 'ATR', 'Engenheiro', '1'], // data impossível
      ['', '', 'METROFORM', 'Aux Montador', '1'], // sem obra
      ['BRZ', '03/09/2026', 'ATR', 'Mestre', '0'], // zero
      ['BRZ', '03/09/2026', 'ATR', 'Mestre', ''], // sem quantidade
      ['BRZ', '03/09/2027', 'ATR', 'Mestre', '1'], // futuro
      ['BRZ', '03/09/2026', 'Trento', 'Carpinteiro', '´3'], // sujeira no número
      ['MYS', '03/09/2026', 'ATR', 'Mestre', '1'], // obra que o sistema não tem
      ['', '', '', '', ''],
    ],
    WORKS,
    importCtx,
  );
  const { report } = plan;
  assert.equal(report.rows, 11);
  assert.deepEqual(
    [report.noWork, report.badDateTotal, report.zero, report.badQuantity, report.futureDate, report.merged],
    [1, 1, 1, 1, 1, 1],
  );
  assert.deepEqual(report.badDate[0], { line: 6, work: 'BRZ', value: '22/0/2026' });
  assert.deepEqual(report.unknownWorks, { MYS: 1 });
  const entries = plan.byWork.get('w-brz')!;
  assert.equal(entries.length, 4);
  const tecnico = entries.find(e => e.role === 'Técnico em Edf')!;
  assert.deepEqual([tecnico.company, tecnico.quantity, tecnico.note, tecnico.origin], ['ATR', 2, 'atestado', 'planilha']);
  // Empate de grafia (uma de cada): vale uma só para as duas linhas.
  assert.equal(new Set(entries.filter(e => e.role.toLowerCase() === 'engenheiro').map(e => e.role)).size, 1);
  assert.equal(entries.find(e => e.company === 'Trento')?.quantity, 3);
  assert.equal(tecnico.id, importedHeadcountId('w-brz', '2026-09-01', 'ATR', 'Técnico em Edf'));
});

test('importação: rodar de novo não duplica nem atropela o que foi lançado na tela', () => {
  const rows = [HEADER, ['BLT', '03/11/2026', 'AWA', 'Carpinteiro', '5'], ['BLT', '04/11/2026', 'AWA', 'Carpinteiro', '6']];
  const planned = planHeadcountImport(rows, WORKS, importCtx).byWork.get('w-blt')!;
  assert.equal(pendingHeadcountImport(planned, []).length, 2);
  assert.equal(pendingHeadcountImport(planned, planned).length, 0, 'mesmos ids');
  const typed = [{ ...entry('tela-1', '2026-11-04', 'awa', 'CARPINTEIRO', 7), workId: 'w-blt' }];
  assert.deepEqual(
    pendingHeadcountImport(planned, typed).map(e => e.workedOn),
    ['2026-11-03'],
    'o dia lançado na tela fica como está',
  );
});

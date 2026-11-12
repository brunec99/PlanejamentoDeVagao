import test from 'node:test';
import assert from 'node:assert/strict';
import type { ChecklistData, ChecklistEquipment, ChecklistModel, ChecklistRun } from '../src/domain/equipment-checklist';
import type { HeadcountEntry } from '../src/domain/headcount';
import type { LobActivity, LobCostItem, LobMeasurement, LobMeasurementItem, LobService } from '../src/domain/lob';
import type { PendingCard } from '../src/domain/pending-board';
import type { ProductionEntry } from '../src/domain/production';
import {
  buildChecklistBlock,
  buildHeadcountBlock,
  buildLobBlock,
  buildProductionBlock,
  buildRestrictionsBlock,
  dashboardExtrasPath,
  localDay,
  workdayCoverage,
} from '../src/modules/dashboard/extras/blocks';
import type { ExtrasRange } from '../src/modules/dashboard/extras/types';

/** Blocos dos quadros novos dos dashboards (12/11/2026). Semana de 09/11 (segunda) a 14/11/2026 (sábado). */

const NOW = '2026-11-11T12:00:00.000Z';
const W = 'obra-1';
const WEEK: ExtrasRange = { start: '2026-11-09', end: '2026-11-14', today: '2026-11-14' };

// ─── Cobertura de dias úteis ─────────────────────────────────────────────────────────────────────────

test('cobertura: no sábado a semana cobra os cinco dias úteis e lista os que faltaram', () => {
  const coverage = workdayCoverage(['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-14'], WEEK);
  assert.deepEqual(coverage, { expected: 5, launched: 3, missing: ['2026-11-11', '2026-11-13'], missingCount: 2 });
});

test('cobertura: hoje não conta como falta, e o feriado nacional não é dia esperado', () => {
  // Quarta-feira: só segunda e terça são cobradas.
  assert.deepEqual(workdayCoverage(['2026-11-09'], { ...WEEK, today: '2026-11-11' }), {
    expected: 2,
    launched: 1,
    missing: ['2026-11-10'],
    missingCount: 1,
  });
  // Semana de 16/11: a sexta 20/11 é feriado, então são quatro dias.
  const holidayWeek = workdayCoverage([], { start: '2026-11-16', end: '2026-11-21', today: '2026-11-30' });
  assert.equal(holidayWeek.expected, 4);
  // Período futuro: nada esperado.
  assert.equal(workdayCoverage([], { start: '2026-12-07', end: '2026-12-12', today: '2026-11-14' }).expected, 0);
});

test('cobertura: a lista de faltas para em 31 dias e o total continua certo', () => {
  const year = workdayCoverage([], { start: '2026-01-05', end: '2026-06-27', today: '2026-11-14' });
  assert.equal(year.missing.length, 31);
  assert.ok(year.missingCount > 100);
  assert.equal(year.expected, year.missingCount);
});

// ─── Histograma ──────────────────────────────────────────────────────────────────────────────────────

let seq = 0;
const head = (workedOn: string, company: string, quantity: number, role = 'Pedreiro'): HeadcountEntry => ({
  id: `h${++seq}`,
  workId: W,
  workedOn,
  company,
  role,
  quantity,
  note: '',
  origin: 'app',
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
});

test('histograma: média por dia útil lançado, pico, parcela de empreiteiros, série semanal e empresas', () => {
  const entries = [
    head('2026-11-06', 'ATR', 9), // semana anterior: fora do período
    head('2026-11-09', 'ATR', 10),
    head('2026-11-09', 'Alfa', 30),
    head('2026-11-10', 'ATR', 10),
    head('2026-11-10', 'Alfa', 40),
    head('2026-11-12', 'Alfa', 20),
  ];
  const block = buildHeadcountBlock(entries, WEEK)!;
  assert.equal(block.manDays, 110);
  assert.equal(Math.round(block.dailyAverage * 10) / 10, 36.7);
  assert.equal(block.peak, 50);
  assert.equal(block.peakDay, '2026-11-10');
  assert.equal(Math.round(block.contractorShare * 100), 82);
  assert.deepEqual(block.coverage, { expected: 5, launched: 3, missing: ['2026-11-11', '2026-11-13'], missingCount: 2 });
  assert.equal(block.lastDay, '2026-11-12');
  assert.equal(block.seriesGrain, 'semana');
  assert.deepEqual(block.series, [{ key: '2026-11-09', label: '09/11', value: 36.7 }]);
  assert.deepEqual(
    block.companies.map(c => [c.name, c.manDays, c.own]),
    [
      ['Alfa', 90, false],
      ['ATR', 20, true],
    ],
  );
});

test('histograma: obra que já lançou mas parou sai com zeros e todas as faltas; obra que nunca lançou sai sem dado', () => {
  const stopped = buildHeadcountBlock([head('2026-10-30', 'ATR', 5)], WEEK)!;
  assert.equal(stopped.manDays, 0);
  assert.equal(stopped.coverage.launched, 0);
  assert.equal(stopped.coverage.missingCount, 5);
  assert.equal(stopped.lastDay, '2026-10-30');
  assert.equal(buildHeadcountBlock([], WEEK), undefined);
  // Lançamento só depois do período não conta.
  assert.equal(buildHeadcountBlock([head('2026-11-16', 'ATR', 5)], WEEK), undefined);
  // A leitura por intervalo informa o último dia à parte (as linhas são só as do período).
  assert.equal(buildHeadcountBlock([], WEEK, { lastDay: '2026-10-01' })!.lastDay, '2026-10-01');
  assert.equal(buildHeadcountBlock([head('2026-11-09', 'ATR', 5)], WEEK, { lastDay: null }), undefined);
});

test('histograma: acima de 16 semanas a série vira mensal', () => {
  const block = buildHeadcountBlock([head('2026-01-05', 'ATR', 10), head('2026-06-01', 'ATR', 20)], {
    start: '2026-01-05',
    end: '2026-06-27',
    today: '2026-11-14',
  })!;
  assert.equal(block.seriesGrain, 'mes');
  assert.deepEqual(
    block.series.map(p => [p.key, p.label, p.value]),
    [
      ['2026-01', 'jan/26', 10],
      ['2026-06', 'jun/26', 20],
    ],
  );
});

// ─── Produtividade ───────────────────────────────────────────────────────────────────────────────────

const prod = (
  workedOn: string,
  service: string,
  crew: number,
  quantity: number | null,
  unit: ProductionEntry['unit'] = 'm²',
): ProductionEntry => ({
  id: `p${++seq}`,
  workId: W,
  workedOn,
  service,
  contractor: 'Alfa',
  professionals: crew,
  helpers: 0,
  quantity,
  unit: quantity === null ? '' : unit,
  note: '',
  origin: 'app',
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
});

test('produtividade: linhas, parcela medida, cobertura e serviços por homens-dia com o índice ponderado', () => {
  const entries = [
    prod('2026-11-09', 'Alvenaria', 4, 40),
    prod('2026-11-10', 'alvenaria', 6, 30),
    prod('2026-11-10', 'Reboco', 2, 50),
    prod('2026-11-11', 'Reboco', 3, null),
    prod('2026-11-03', 'Contrapiso', 5, 90), // fora do período
  ];
  const block = buildProductionBlock(entries, WEEK)!;
  assert.equal(block.entries, 4);
  assert.equal(block.measured, 3);
  assert.equal(block.pending, 1);
  assert.equal(block.manDays, 15);
  assert.equal(block.measuredShare, 0.75);
  assert.deepEqual(block.coverage.missing, ['2026-11-12', '2026-11-13']);
  assert.equal(block.lastDay, '2026-11-11');
  assert.deepEqual(
    block.services.map(s => [s.key, s.unit, s.quantity, s.manDays, s.perManDay, s.measured]),
    [
      ['alvenaria', 'm²', 70, 10, 7, 2],
      ['reboco', 'm²', 50, 2, 25, 1],
    ],
  );
});

test('produtividade: sem linha no período não há parcela medida; sem linha nenhuma, sem dado', () => {
  const stopped = buildProductionBlock([prod('2026-10-01', 'Alvenaria', 4, 40)], WEEK)!;
  assert.equal(stopped.entries, 0);
  assert.equal(stopped.measuredShare, undefined);
  assert.deepEqual(stopped.services, []);
  assert.equal(buildProductionBlock([], WEEK), undefined);
});

// ─── Quadro de Restrições ────────────────────────────────────────────────────────────────────────────

const card = (id: string, over: Partial<PendingCard>): PendingCard => ({
  id,
  workId: W,
  title: id,
  status: 'todo',
  origin: 'manual',
  dueDate: '2026-11-30',
  leadTimeDays: 0,
  responsibleId: 'u1',
  orderIndex: 0,
  createdBy: 'u1',
  createdAt: '2026-11-02T12:00:00.000Z',
  updatedAt: NOW,
  ...over,
});
const PEOPLE = [
  { id: 'u1', name: 'Carla' },
  { id: 'u2', name: 'Diego' },
];

test('restrições: abertos, vencidos, começo atrasado e o fluxo do período', () => {
  const cards = [
    card('a', { status: 'doing', dueDate: '2026-11-12' }), // vencido
    card('b', { status: 'todo', dueDate: '2026-11-20', leadTimeDays: 10 }), // começo atrasado
    card('c', { status: 'paused', dueDate: '2026-11-30', responsibleId: 'u2', statusReason: 'aguardando' }),
    card('d', { status: 'done', closedAt: '2026-11-10T15:00:00.000Z' }), // concluído no período
    card('e', { status: 'cancelled', closedAt: '2026-11-03T15:00:00.000Z' }), // cancelado antes
    card('f', { status: 'todo', createdAt: '2026-11-10T12:00:00.000Z', responsibleId: 'fora' }), // criado no período
    card('g', { status: 'todo', createdAt: '2026-11-20T12:00:00.000Z' }), // criado depois: fora
  ];
  const block = buildRestrictionsBlock(cards, PEOPLE, WEEK)!;
  assert.equal(block.asOf, '2026-11-14');
  assert.equal(block.open, 4);
  assert.deepEqual(block.byStatus, { todo: 2, doing: 1, paused: 1 });
  assert.equal(block.overdue, 1);
  assert.equal(block.startOverdue, 1);
  assert.equal(block.doneInPeriod, 1);
  assert.equal(block.cancelledInPeriod, 0);
  assert.equal(block.createdInPeriod, 1);
  assert.deepEqual(block.byResponsible, [
    { name: 'Carla', open: 2, overdue: 1 },
    { name: 'Diego', open: 1, overdue: 0 },
    { name: 'Sem responsável na obra', open: 1, overdue: 0 },
  ]);
});

test('restrições: período passado conta como aberto o card fechado depois; período em andamento retrata hoje', () => {
  const cards = [card('a', { status: 'done', dueDate: '2026-11-05', closedAt: '2026-11-12T15:00:00.000Z' })];
  const past = buildRestrictionsBlock(cards, PEOPLE, { start: '2026-11-02', end: '2026-11-07', today: '2026-11-14' })!;
  assert.equal(past.asOf, '2026-11-07');
  assert.equal(past.open, 1);
  assert.deepEqual(past.byStatus, { todo: 0, doing: 1, paused: 0 });
  assert.equal(past.overdue, 1);
  assert.equal(past.doneInPeriod, 0);
  const running = buildRestrictionsBlock(cards, PEOPLE, { start: '2026-11-09', end: '2026-11-14', today: '2026-11-11' })!;
  assert.equal(running.asOf, '2026-11-11');
  assert.equal(running.open, 1);
  // Sem card criado até a data, sem dado.
  assert.equal(buildRestrictionsBlock(cards, PEOPLE, { start: '2026-10-19', end: '2026-10-24', today: '2026-11-14' }), undefined);
  assert.equal(buildRestrictionsBlock([], PEOPLE, WEEK), undefined);
});

test('localDay: o instante vira a data de Brasília', () => {
  assert.equal(localDay('2026-11-11T01:30:00.000Z'), '2026-11-10');
  assert.equal(localDay('2026-11-11'), '2026-11-11');
  assert.equal(localDay(undefined), undefined);
  assert.equal(localDay('xx'), undefined);
});

// ─── Linha de Balanço ────────────────────────────────────────────────────────────────────────────────

const service = (id: string, orderIndex: number): LobService => ({
  id,
  workId: W,
  name: `Pacote ${id}`,
  color: '#1a719f',
  orderIndex,
  createdAt: NOW,
  updatedAt: NOW,
});
const act = (id: string, serviceId: string, start: string, durationDays: number): LobActivity => ({
  id,
  workId: W,
  serviceId,
  localId: `l-${id}`,
  start,
  durationDays,
  createdAt: NOW,
  updatedAt: NOW,
});
const measurement = (id: string, number: number, date: string, status: LobMeasurement['status'] = 'closed'): LobMeasurement => ({
  id,
  workId: W,
  number,
  date,
  status,
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
});
const item = (measurementId: string, activityId: string, value: number): LobMeasurementItem => ({
  id: `${measurementId}-${activityId}`,
  measurementId,
  workId: W,
  activityId,
  value,
  previousValue: 0,
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
});
const cost = (serviceId: string, amount: number): LobCostItem => ({
  id: `c${++seq}`,
  workId: W,
  serviceId,
  description: 'Item',
  amount,
  orderIndex: seq,
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
});
// A obra do teste do IDP (`lob-performance.test.ts`): pelo custo, 23,5% real ÷ 25% planejado = 0,94 em 06/11.
const LOB = {
  services: [service('A', 0), service('B', 1)],
  activities: [act('a1', 'A', '2026-11-02', 10), act('a2', 'A', '2026-11-16', 10), act('b1', 'B', '2026-11-02', 20)],
  baselines: [],
  measurements: [measurement('m1', 1, '2026-11-06'), measurement('m2', 2, '2026-11-20')],
  items: [item('m1', 'a1', 50), item('m1', 'b1', 10), item('m2', 'a1', 100), item('m2', 'b1', 60)],
  costs: [cost('A', 900), cost('B', 100)],
};

test('Linha de Balanço: o IDP é o da última medição fechada até o fim do período, sem valor em reais', () => {
  const block = buildLobBlock(LOB, WEEK)!;
  assert.equal(block.status, 'ok');
  assert.equal(block.measurementDate, '2026-11-06');
  assert.equal(block.measurementNumber, 1);
  assert.equal(block.weighting, 'cost');
  assert.equal(Math.round(block.idp! * 100) / 100, 0.94);
  assert.equal(Math.round(block.real! * 10) / 10, 23.5);
  assert.equal(block.planned, 25);
  assert.ok(!JSON.stringify(block).includes('900'));
  // Um período que alcança a segunda medição usa a segunda.
  assert.equal(buildLobBlock(LOB, { start: '2026-11-16', end: '2026-11-21', today: '2026-11-30' })!.measurementNumber, 2);
});

test('Linha de Balanço: sem medição até a data, sem custo e sem bloco', () => {
  const before = buildLobBlock(LOB, { start: '2026-10-26', end: '2026-10-31', today: '2026-11-14' })!;
  assert.equal(before.status, 'no-measurement');
  assert.equal(before.idp, undefined);
  assert.equal(buildLobBlock({ ...LOB, costs: [] }, WEEK)!.weighting, 'duration');
  assert.equal(buildLobBlock({ ...LOB, activities: [] }, WEEK), undefined);
});

// ─── Checklist de equipamentos ───────────────────────────────────────────────────────────────────────

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
  workId: W,
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
  id: `r${++seq}`,
  workId: W,
  equipmentId: 'e1',
  modelId: 'm-dia',
  modelName: 'Betoneira — diário',
  frequency: 'daily',
  doneOn: '2026-11-11',
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
const nc = (text: string) => ({ itemId: 'i1', text, answer: 'nc' as const, note: '' });

test('checklist: o quadro de vencidos é o de hoje; inspeções e não conformidades são as do período', () => {
  const data: ChecklistData = {
    models: [model(), model({ id: 'm-sem', name: 'Betoneira — semanal', frequency: 'weekly' })],
    equipment: [equipment(), equipment({ id: 'e2', name: 'Betoneira 02' }), equipment({ id: 'e3', name: 'Velha', active: false })],
    runs: [
      run({ doneOn: '2026-11-13' }), // diário de e1 feito hoje
      run({ modelId: 'm-sem', frequency: 'weekly', doneOn: '2026-11-10', answers: [nc('Proteção'), nc('Aterramento')] }),
      run({ equipmentId: 'e2', doneOn: '2026-11-09', answers: [nc('Proteção')] }),
      run({ equipmentId: 'e2', doneOn: '2026-11-04' }), // fora do período
    ],
  };
  const block = buildChecklistBlock(data, { start: '2026-11-09', end: '2026-11-14', today: '2026-11-13' })!;
  assert.equal(block.equipment, 2);
  assert.equal(block.due, 4);
  assert.equal(block.pending, 2);
  assert.deepEqual(block.pendingList, [
    { equipment: 'Betoneira 02', model: 'Betoneira — diário', frequency: 'daily' },
    { equipment: 'Betoneira 02', model: 'Betoneira — semanal', frequency: 'weekly' },
  ]);
  assert.equal(block.runsInPeriod, 3);
  assert.equal(block.runsWithNonConformity, 2);
  assert.equal(block.nonConformities, 3);
});

test('checklist: sem equipamento ativo e sem inspeção, sem dado', () => {
  assert.equal(buildChecklistBlock({ models: [model()], equipment: [], runs: [] }, WEEK), undefined);
  assert.equal(buildChecklistBlock({ models: [], equipment: [equipment({ active: false })], runs: [] }, WEEK), undefined);
  assert.equal(buildChecklistBlock({ models: [], equipment: [equipment()], runs: [] }, WEEK)!.due, 0);
});

test('endereço da rota: período, obra e segurança', () => {
  assert.equal(dashboardExtrasPath(WEEK), '/api/dashboard/extras?de=2026-11-09&ate=2026-11-14');
  assert.equal(
    dashboardExtrasPath(WEEK, { workId: 'obra 1', safety: true }),
    '/api/dashboard/extras?de=2026-11-09&ate=2026-11-14&obra=obra+1&seguranca=1',
  );
});

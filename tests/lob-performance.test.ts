import test from 'node:test';
import assert from 'node:assert/strict';
import {
  physicalProgress,
  type LobActivity,
  type LobBaseline,
  type LobCostItem,
  type LobMeasurement,
  type LobMeasurementItem,
  type LobService,
} from '../src/domain/lob';
import {
  formatIdp,
  formatMoney,
  idpTone,
  lobPerformance,
  lobWeights,
  maskCosts,
  parseMoney,
  performanceBaseline,
  servicePerformance,
  serviceCosts,
  weightedProgress,
} from '../src/domain/lob-performance';

/** IDP ponderado por custo (11/11/2026, modelo aprovado). Obra pequena: o pacote A (dois blocos de 10
 * dias úteis) custa 900 e o B (um bloco de 20 dias, como uma grua) custa 100; C não tem blocos.
 * Na medição de 06/11 (sexta): a1 50% medido e 50% previsto; b1 10% medido e 25% previsto; a2 nem
 * começou. Pela duração: real 17,5% ÷ planejado 25% = 0,70. Pelo custo: 23,5% ÷ 25% = 0,94. */

const NOW = '2026-11-11T12:00:00.000Z';
const W = 'obra-1';

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
let seq = 0;
const cost = (serviceId: string | undefined, amount: number): LobCostItem => ({
  id: `c${++seq}`,
  workId: W,
  ...(serviceId ? { serviceId } : {}),
  description: 'Item',
  amount,
  orderIndex: seq,
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
});
const baseline = (id: string, createdAt: string, automatic: boolean, starts: Record<string, string> = {}): LobBaseline => ({
  id,
  workId: W,
  name: `LB ${id}`,
  automatic,
  createdBy: 'u1',
  createdAt,
  snapshot: activities.map(a => ({
    activityId: a.id,
    serviceId: a.serviceId,
    localId: a.localId,
    start: starts[a.id] ?? a.start,
    durationDays: a.durationDays,
  })),
});

const services = [service('A', 0), service('B', 1), service('C', 2)];
const activities = [act('a1', 'A', '2026-11-02', 10), act('a2', 'A', '2026-11-16', 10), act('b1', 'B', '2026-11-02', 20)];
const m1 = measurement('m1', 1, '2026-11-06');
const items = [item('m1', 'a1', 50), item('m1', 'b1', 10)];
const fullCosts = () => [cost('A', 600), cost('A', 300), cost('B', 100)];
const obra = (over: Partial<Parameters<typeof lobPerformance>[0]> = {}) => ({
  services,
  activities,
  baselines: [] as LobBaseline[],
  measurements: [m1],
  items,
  costs: fullCosts(),
  ...over,
});
const close = (actual: number | undefined, expected: number) => {
  assert.ok(actual !== undefined, 'valor ausente');
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
};

test('parseMoney lê os formatos de reais que chegam colados do Excel', () => {
  assert.equal(parseMoney('R$ 1.234.567,89'), 1234567.89);
  assert.equal(parseMoney('1234567,89'), 1234567.89);
  assert.equal(parseMoney('1.500'), 1500);
  assert.equal(parseMoney('1.234.567'), 1234567);
  assert.equal(parseMoney('1500.5'), 1500.5);
  assert.equal(parseMoney('1,234.56'), 1234.56);
  assert.equal(parseMoney(' R$ 950 '), 950);
  assert.equal(parseMoney('(1.234,00)'), -1234);
  assert.equal(parseMoney('-'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney(undefined), null);
  assert.equal(parseMoney(42), 42);
  assert.ok(Number.isNaN(parseMoney('Concreto')));
  assert.ok(Number.isNaN(parseMoney('1,2,3')));
  assert.equal(formatMoney(1234567.89).replace(/\s/g, ' '), 'R$ 1.234.567,89');
});

test('custo do pacote é a soma dos itens; item sem pacote fica de fora e zero conta como informado', () => {
  const costs = serviceCosts([cost('A', 600.105), cost('A', 300), cost(undefined, 999), cost('C', 0)]);
  assert.equal(costs.get('A'), 900.11);
  assert.equal(costs.get('C'), 0);
  assert.equal(costs.has('B'), false);
  assert.equal(costs.size, 2);
});

test('regra 6: sem custo em algum pacote com blocos, o peso é a duração e a falta é contada', () => {
  const weights = lobWeights(services, activities, [cost('A', 900)]);
  assert.equal(weights.mode, 'duration');
  assert.equal(weights.fallback, 'missing');
  assert.deepEqual(weights.missingServiceIds, ['B']);
  assert.deepEqual(weights.servicesWithBlocks, ['A', 'B']);
  assert.equal(weights.weight.get('b1'), 20);
  // C não tem blocos: ficar sem custo não impede o peso por custo.
  const complete = lobWeights(services, activities, fullCosts());
  assert.equal(complete.mode, 'cost');
  assert.equal(complete.fallback, undefined);
  assert.equal(complete.totalCost, 1000);
});

test('regra 5: o custo do pacote se reparte entre os blocos pela duração', () => {
  const weights = lobWeights(services, [...activities, act('a3', 'A', '2026-11-30', 20)], [cost('A', 800), cost('B', 100)]);
  assert.equal(weights.weight.get('a1'), 200);
  assert.equal(weights.weight.get('a2'), 200);
  assert.equal(weights.weight.get('a3'), 400);
  assert.equal(weights.weight.get('b1'), 100);
});

test('todos os pacotes com custo zero: volta para a duração', () => {
  const weights = lobWeights(services, activities, [cost('A', 0), cost('B', 0)]);
  assert.equal(weights.mode, 'duration');
  assert.equal(weights.fallback, 'zero');
  assert.deepEqual(weights.missingServiceIds, []);
});

test('IDP pela duração e pelo custo na última medição fechada', () => {
  const byDuration = lobPerformance(obra({ costs: [cost('A', 900)] }));
  assert.equal(byDuration.status, 'ok');
  assert.equal(byDuration.weights.mode, 'duration');
  close(byDuration.point?.real, 17.5);
  close(byDuration.point?.planned, 25);
  close(byDuration.point?.idp, 0.7);
  assert.equal(formatIdp(byDuration.point!.idp!), '0,70');
  assert.equal(idpTone(byDuration.point!.idp!), 'bad');

  const byCost = lobPerformance(obra());
  assert.equal(byCost.weights.mode, 'cost');
  close(byCost.point?.real, 23.5);
  close(byCost.point?.planned, 25);
  close(byCost.point?.idp, 0.94);
  assert.equal(formatIdp(byCost.point!.idp!), '0,94');
  assert.equal(idpTone(byCost.point!.idp!), 'warn');
});

test('regra 10: a cor segue o número mostrado com duas casas', () => {
  assert.equal(idpTone(0.995), 'good');
  assert.equal(idpTone(1.2), 'good');
  assert.equal(idpTone(0.994), 'warn');
  assert.equal(idpTone(0.899), 'warn');
  assert.equal(idpTone(0.894), 'bad');
  assert.equal(formatIdp(0.996), '1,00');
});

test('regra 3: a medição aberta não conta e cada medição fechada vira um ponto da série', () => {
  const m2 = measurement('m2', 2, '2026-11-13');
  const m3 = measurement('m3', 3, '2026-11-20', 'open');
  const result = lobPerformance(
    obra({ measurements: [m3, m2, m1], items: [...items, item('m2', 'a1', 100), item('m2', 'b1', 30), item('m3', 'b1', 90)] }),
  );
  assert.deepEqual(
    result.series.map(p => p.number),
    [1, 2],
  );
  assert.equal(result.point?.date, '2026-11-13');
  // 13/11: a1 100% e b1 30% medidos; previstos a1 100% e b1 50%.
  close(result.point?.real, (450 * 100 + 100 * 30) / 1000);
  close(result.point?.planned, (450 * 100 + 100 * 50) / 1000);
});

test('duas medições fechadas no mesmo dia dão dois pontos diferentes', () => {
  const m2 = measurement('m2', 2, '2026-11-06');
  const result = lobPerformance(obra({ measurements: [m1, m2], items: [...items, item('m2', 'b1', 25)] }));
  assert.equal(result.series.length, 2);
  close(result.series[0].real, 23.5);
  close(result.series[1].real, (450 * 50 + 100 * 25) / 1000);
  close(result.series[1].idp, 1);
});

test('regra 4: linha de base escolhida, senão a manual mais recente, senão o cronograma atual', () => {
  const older = baseline('lb1', '2026-11-01T00:00:00Z', false, { a1: '2026-11-09' });
  const automatic = baseline('lb2', '2026-11-10T00:00:00Z', true);
  const newer = baseline('lb3', '2026-11-05T00:00:00Z', false, { a1: '2026-11-04' });
  assert.equal(performanceBaseline([older, automatic, newer])?.id, 'lb3');
  assert.equal(performanceBaseline([older, automatic, newer], 'lb1')?.id, 'lb1');
  assert.equal(performanceBaseline([automatic])?.id, undefined);
  assert.equal(performanceBaseline([older], 'sumiu')?.id, 'lb1');

  // Pela lb1, a1 só começava em 09/11: nada dele estava previsto em 06/11.
  const chosen = lobPerformance(obra({ baselines: [older, automatic, newer] }), { baselineId: 'lb1' });
  assert.equal(chosen.baseline?.id, 'lb1');
  close(chosen.point?.planned, (100 * 25) / 1000);
  // Sem escolha vale a lb3 (manual mais recente): a1 começava em 04/11, 3 de 10 dias em 06/11.
  const fallback = lobPerformance(obra({ baselines: [older, automatic, newer] }));
  assert.equal(fallback.baseline?.id, 'lb3');
  close(fallback.point?.planned, (450 * 30 + 100 * 25) / 1000);
  // Só a automática: o planejado sai do cronograma atual.
  const current = lobPerformance(obra({ baselines: [automatic] }));
  assert.equal(current.baseline, undefined);
  close(current.point?.planned, 25);
});

test('bloco criado depois da linha de base entra com as datas atuais', () => {
  const lb = baseline('lb1', '2026-11-01T00:00:00Z', false);
  const late = act('b2', 'B', '2026-11-02', 20);
  const result = lobPerformance(obra({ activities: [...activities, late], baselines: [lb] }));
  // b2 não está na foto, usa 02/11: 25% previsto, com o mesmo peso de b1 (o pacote B se divide em dois).
  close(result.point?.planned, (450 * 50 + 50 * 25 + 50 * 25) / 1000);
});

test('regra 11: sem blocos, sem medição fechada ou sem nada previsto até a data, não há IDP', () => {
  assert.equal(lobPerformance(obra({ activities: [] })).status, 'no-blocks');
  const open = lobPerformance(obra({ measurements: [measurement('m1', 1, '2026-11-06', 'open')] }));
  assert.equal(open.status, 'no-measurement');
  assert.equal(open.point, undefined);
  const early = lobPerformance(obra({ measurements: [measurement('m1', 1, '2026-10-30')], items: [item('m1', 'a1', 5)] }));
  assert.equal(early.status, 'nothing-planned');
  assert.equal(early.point?.idp, undefined);
  close(early.point?.real, (450 * 5) / 1000);
});

test('regra 7: avanço físico e previsto até hoje no mesmo peso do IDP', () => {
  const progress = weightedProgress(obra(), '2026-11-06');
  assert.equal(progress.weights.mode, 'cost');
  close(progress.physical, 23.5);
  close(progress.planned, 25);
  const duration = weightedProgress(obra({ costs: [] }), '2026-11-06');
  close(duration.physical, 17.5);
  // physicalProgress sem peso continua sendo a média pela duração.
  close(physicalProgress(activities, { a1: 50, b1: 10 }), 17.5);
  close(physicalProgress(activities, { a1: 50 }, new Map([['a1', 1]])), 50);
});

test('linha por pacote: custo, fatia no peso e IDP do pacote na data do IDP', () => {
  const data = obra();
  const rows = servicePerformance(data, lobPerformance(data));
  assert.deepEqual(
    rows.map(r => r.serviceId),
    ['A', 'B', 'C'],
  );
  const [a, b, c] = rows;
  assert.equal(a.cost, 900);
  assert.equal(a.itemCount, 2);
  assert.equal(a.blocks, 2);
  assert.equal(a.days, 20);
  close(a.share, 90);
  close(a.real, 25);
  close(a.planned, 25);
  close(a.idp, 1);
  close(b.share, 10);
  close(b.idp, 0.4);
  assert.equal(c.blocks, 0);
  assert.equal(c.share, undefined);
  assert.equal(c.cost, undefined);
  assert.equal(c.real, undefined);
});

test('regra 9: o perfil de consulta recebe porcentagens e o IDP não muda', () => {
  const masked = maskCosts([...fullCosts(), cost(undefined, 1000)]);
  assert.deepEqual(
    masked.map(i => i.amount),
    [30, 15, 5, 50],
  );
  const result = lobPerformance(obra({ costs: masked.slice(0, 3) }));
  close(result.point?.idp, 0.94);
  assert.deepEqual(
    maskCosts([cost('A', 0)]).map(i => i.amount),
    [0],
  );
});

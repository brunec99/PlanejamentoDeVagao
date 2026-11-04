import test from 'node:test';
import assert from 'node:assert/strict';
import type { LongTermActivity, LongTermBaseline, LongTermMeasurement, LongTermPlanDocument } from '../src/domain/long-term-plan';
import { floorKey, referenceOf, type DashboardFilters } from '../src/modules/dashboard/model';
import {
  buildLongTermPanel,
  deviationTone,
  latestBaseline,
  longTermFloorNames,
  longTermSummary,
  plannedShare,
} from '../src/modules/dashboard/long-term-panel';
import { floorSchedule } from '../src/domain/long-term-plan';

/** Serviço de um pavimento, 10 dias, começando na segunda 05/01/2026 (sem unidade de medição por padrão). */
const activity = (id: string, over: Partial<LongTermActivity> = {}): LongTermActivity => ({
  id,
  name: id,
  color: '#2563eb',
  firstFloor: 1,
  lastFloor: 1,
  start: '2026-01-05',
  duration: 10,
  interval: 10,
  visible: true,
  predecessors: [],
  teams: [],
  ...over,
});
const doc = (activities: LongTermActivity[], over: Partial<LongTermPlanDocument> = {}): LongTermPlanDocument => ({
  floorCount: 3,
  floorNames: {},
  activities,
  baselines: [],
  measurements: [],
  ...over,
});
const baseline = (id: string, createdAt: string, activities: LongTermActivity[]): LongTermBaseline => ({
  id,
  name: id,
  createdAt,
  createdBy: 'u',
  activities,
});
let seq = 0;
const measurement = (date: string, values: Record<string, number>): LongTermMeasurement => ({
  id: `m${++seq}`,
  number: ++seq,
  date,
  createdAt: `${date}T12:00:00.000Z`,
  createdBy: 'u',
  items: Object.entries(values).map(([activityId, value]) => ({ activityId, value })),
});
/** A semana de 05/01/2026 (semana 1 da obra): a data de referência é o sábado 10/01, cinco dias depois do início. */
const ref = referenceOf('2026-01-05', '2026-11-04', '2026-01-05');
const filters: DashboardFilters = { week: '2026-01-05' };

test('planejado linear por pavimento-dias: no meio do primeiro de dois pavimentos iguais vale 25%', () => {
  const a = activity('a', { lastFloor: 2 }); // 1º: 05/01–14/01; 2º: 15/01–24/01
  const data = buildLongTermPanel(doc([a]), ref, filters)!;
  assert.equal(data.planned, 25);
  assert.equal(data.measured, undefined);
  assert.equal(data.delta, undefined);
  assert.equal(data.plannedSource, 'plan');
  assert.equal(data.refDate, '2026-01-10');
  assert.equal(data.refLabel, 'semana 1');
  assert.equal(data.services, 1);
  assert.equal(data.floors, 3);
  assert.equal(data.floorFiltered, false);
  // Antes do início é 0%, no primeiro dia livre é 100%, e a duração própria pesa mais.
  const slots = floorSchedule(a);
  assert.equal(plannedShare(slots, '2026-01-04'), 0);
  assert.equal(plannedShare(slots, '2026-01-25'), 100);
  assert.equal(plannedShare(floorSchedule(activity('b', { lastFloor: 2, floorDurations: { '1': 30 } })), '2026-01-10'), (5 / 40) * 100);
  assert.equal(plannedShare([], '2026-01-10'), undefined);
});

test('o planejado vem da linha de base mais recente pela data de criação, não da ordem na lista', () => {
  const live = activity('a', { start: '2026-02-02' }); // reprogramado: planejado 0% em 10/01
  const older = baseline('lb-1', '2025-12-01T10:00:00Z', [activity('a', { start: '2026-01-01' })]); // 90% em 10/01
  const newer = baseline('lb-2', '2025-12-20T10:00:00Z', [activity('a')]); // 50% em 10/01
  const data = buildLongTermPanel(doc([live], { baselines: [newer, older] }), ref, filters)!;
  assert.equal(data.plannedSource, 'baseline');
  assert.equal(data.baselineName, 'lb-2');
  assert.equal(data.baselineDate, '2025-12-20');
  assert.equal(data.planned, 50);
  assert.equal(latestBaseline([older, newer])?.id, 'lb-2');
  // O prazo é o do plano vivo, e o atraso é contra a linha de base: 02/02 → 11/02 contra 05/01 → 14/01 = +28 dias.
  assert.equal(data.span?.finish, '2026-02-11');
  assert.equal(data.span?.slip, 28);
  // Sem linha de base, o planejado é o do plano vivo e não há atraso a calcular.
  const plain = buildLongTermPanel(doc([live]), ref, filters)!;
  assert.equal(plain.plannedSource, 'plan');
  assert.equal(plain.planned, 0);
  assert.equal(plain.span?.slip, undefined);
});

test('serviço criado depois da linha de base entra com as datas do plano vivo', () => {
  const a = activity('a', { unit: '%' });
  const b = activity('b', { unit: '%', start: '2026-01-10' }); // 0% em 10/01 (começa no dia)
  const lb = baseline('lb', '2025-12-01T10:00:00Z', [a]);
  const data = buildLongTermPanel(
    doc([a, b], { baselines: [lb], measurements: [measurement('2026-01-10', { a: 50, b: 0 })] }),
    ref,
    filters,
  )!;
  assert.equal(data.planned, 25); // (50 + 0) / 2, mesmo conjunto do medido
  assert.equal(data.measured, 25);
});

test('medição datada depois do sábado da semana analisada fica fora', () => {
  const a = activity('a', { unit: '%' });
  const measurements = [measurement('2026-01-09', { a: 30 }), measurement('2026-01-12', { a: 90 })];
  const data = buildLongTermPanel(doc([a], { measurements }), ref, filters)!;
  assert.equal(data.measured, 30);
  assert.equal(data.measurementCount, 1);
  assert.equal(data.lastMeasurement, '2026-01-09');
  assert.deepEqual(data.measurements, [{ date: '2026-01-09', percent: 30 }]);
  // Só medição futura: o quadro trata como "sem medição", em vez de 0%.
  const future = buildLongTermPanel(doc([a], { measurements: [measurements[1]] }), ref, filters)!;
  assert.equal(future.measured, undefined);
  assert.equal(future.measurementCount, 0);
  assert.deepEqual(future.measurements, []);
  assert.deepEqual(future.deviations, []);
});

test('desvio em p.p. e a tabela de serviços ordenada pelo maior |desvio|', () => {
  const a = activity('a', { name: 'Alvenaria', unit: '%' });
  const b = activity('b', { name: 'Estrutura', unit: '%' });
  const c = activity('c', { name: 'Instalações', unit: 'apartamento', plannedTotal: 20 });
  const d = activity('d', { name: 'Sem unidade' }); // fora do conjunto medido
  const measurements = [measurement('2026-01-07', { a: 10, b: 20 }), measurement('2026-01-10', { a: 45, b: 80, c: 2 })];
  const data = buildLongTermPanel(doc([a, b, c, d], { measurements }), ref, filters)!;
  // Planejado 50% em cada um dos três mensuráveis; medido 45, 80 e 10 (2 de 20 apartamentos).
  assert.equal(data.planned, 50);
  assert.equal(data.measured, 45);
  assert.equal(data.delta, -5);
  assert.deepEqual(
    data.deviations.map(row => [row.name, row.planned, row.measured, row.delta]),
    [
      ['Instalações', 50, 10, -40],
      ['Estrutura', 50, 80, 30],
      ['Alvenaria', 50, 45, -5],
    ],
  );
  // As bolinhas da curva: o avanço físico até cada data de medição (c sem medição em 07/01 conta como 0%).
  assert.deepEqual(data.measurements, [
    { date: '2026-01-07', percent: 10 },
    { date: '2026-01-10', percent: 45 },
  ]);
  assert.equal(data.services, 4);
});

test('a tabela de desvios para nos cinco maiores', () => {
  const activities = Array.from({ length: 8 }, (_, i) => activity(`s${i}`, { unit: '%' }));
  const values = Object.fromEntries(activities.map((a, i) => [a.id, i * 10]));
  const data = buildLongTermPanel(doc(activities, { measurements: [measurement('2026-01-10', values)] }), ref, filters)!;
  assert.equal(data.deviations.length, 5);
  assert.deepEqual(
    data.deviations.map(row => row.delta),
    [-50, -40, -30, -20, 20], // empate em |20|: o negativo vem antes
  );
});

test('curva S: um ponto no último dia de cada mês do plano, crescente até 100%', () => {
  const a = activity('a', { lastFloor: 3, duration: 20, interval: 25 }); // 05/01 → 15/03/2026
  const data = buildLongTermPanel(doc([a]), ref, filters)!;
  assert.deepEqual(
    data.curve.map(p => p.date),
    ['2026-01-31', '2026-02-28', '2026-03-31'],
  );
  for (let i = 1; i < data.curve.length; i++) assert.ok(data.curve[i].planned >= data.curve[i - 1].planned);
  assert.equal(data.curve.at(-1)?.planned, 100);
  assert.ok(data.curve[0].planned > 0 && data.curve[0].planned < 100);
});

test('filtro de pavimento: só serviços que tocam o pavimento, planejado só dos pavimentos escolhidos, medição inteira', () => {
  const a = activity('a', { lastFloor: 2, unit: '%' }); // 1º e 2º
  const b = activity('b', { firstFloor: 2, lastFloor: 2, unit: '%' }); // só o 2º
  const document = doc([a, b], {
    floorNames: { '1': 'Térreo', '2': '1º Pav' },
    measurements: [measurement('2026-01-10', { a: 20, b: 60 })],
  });
  const data = buildLongTermPanel(document, ref, { ...filters, floors: new Set([floorKey('TERREO')]) })!;
  assert.equal(data.floorFiltered, true);
  assert.deepEqual(data.selectedFloors, ['Térreo']);
  assert.equal(data.services, 1);
  assert.equal(data.planned, 50); // só o 1º pavimento de "a": 5 de 10 dias
  assert.equal(data.measured, 20); // a medição de "a" é do serviço inteiro
  assert.deepEqual(
    data.deviations.map(row => row.id),
    ['a'],
  );
  assert.equal(data.floors, 3); // floorCount do documento, sem recorte
  // Sem recorte: dois serviços, três pavimentos-fatias de 10 dias (dois de "a", um de "b"), e a medição inteira.
  const whole = buildLongTermPanel(document, ref, filters)!;
  assert.equal(whole.services, 2);
  assert.equal(whole.floorFiltered, false);
  assert.deepEqual(whole.selectedFloors, []);
  // Pavimento que não existe neste plano: nada passa, e o quadro diz isso em vez de sumir.
  const none = buildLongTermPanel(document, ref, { ...filters, floors: new Set([floorKey('Cobertura')]) })!;
  assert.equal(none.services, 0);
  assert.equal(none.planned, 0);
  assert.deepEqual(none.curve, []);
  assert.equal(longTermSummary(none, ref).kpi.value, '—');
});

test('sem serviço visível o quadro não existe', () => {
  assert.equal(buildLongTermPanel(doc([]), ref, filters), undefined);
  assert.equal(buildLongTermPanel(doc([activity('a', { visible: false })]), ref, filters), undefined);
});

test('resumo: cartão e frase com os tons do desvio', () => {
  const a = activity('a', { unit: '%' });
  const at = (value: number) => buildLongTermPanel(doc([a], { measurements: [measurement('2026-01-09', { a: value })] }), ref, filters)!;

  const good = longTermSummary(at(55), ref);
  assert.equal(good.kpi.module, 'longo-prazo');
  assert.equal(good.kpi.label, 'Avanço físico');
  assert.equal(good.kpi.value, '55%');
  assert.deepEqual(good.kpi.tag, { text: '+5 p.p. vs planejado', tone: 'good' });
  assert.equal(good.kpi.hint, 'Medido em 09/01 · planejado na data: 50%');
  assert.equal(good.kpi.tone, undefined);
  assert.deepEqual(good.sentence, [
    { text: 'O avanço físico medido é de ' },
    { text: '55%', strong: true },
    { text: ', 5 pontos acima do planejado para a data.' },
  ]);

  const warn = longTermSummary(at(45), ref);
  assert.equal(warn.kpi.tag?.tone, 'warn');
  assert.equal(warn.kpi.tone, 'warn');
  assert.equal(warn.sentence[2].text, ', 5 pontos abaixo do planejado para a data.');

  const bad = longTermSummary(at(35), ref);
  assert.equal(bad.kpi.tag?.tone, 'bad');
  assert.equal(bad.kpi.tag?.text, '−15 p.p. vs planejado');

  const same = longTermSummary(at(50), ref);
  assert.equal(same.kpi.tag?.tone, 'good');
  assert.equal(same.sentence[2].text, ', igual ao planejado para a data.');
  assert.equal(longTermSummary(at(49), ref).sentence[2].text, ', 1 ponto abaixo do planejado para a data.');

  // Limites dos tons: −10 ainda é atenção, −11 é crítico.
  assert.equal(deviationTone(-10), 'warn');
  assert.equal(deviationTone(-11), 'bad');
  assert.equal(deviationTone(0), 'good');

  const none = longTermSummary(buildLongTermPanel(doc([a]), ref, filters)!, ref);
  assert.equal(none.kpi.value, '50%');
  assert.deepEqual(none.kpi.tag, { text: 'sem medição', tone: 'neutral' });
  assert.equal(none.kpi.hint, 'Planejado na data pelo plano atual (sem linha de base); nenhuma medição até 10/01');
  assert.deepEqual(none.sentence, [
    { text: 'O longo prazo ainda não tem medição até a data; o avanço planejado para a data é de ' },
    { text: '50%', strong: true },
    { text: '.' },
  ]);
});

test('os nomes dos pavimentos saem na ordem, com "Nº" onde não há nome', () => {
  assert.deepEqual(longTermFloorNames({ floorCount: 3, floorNames: { '2': 'Mezanino' } }), ['1º', 'Mezanino', '3º']);
  assert.deepEqual(longTermFloorNames({ floorCount: 0, floorNames: {} }), []);
});

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
import { resolvePeriod, type PeriodContext } from '../src/modules/dashboard/period';

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
const text = (segments: { text: string }[]) => segments.map(s => s.text).join('');

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

// ─── Escalas de tempo (04/11/2026): o avanço dentro do período ─────────────────────────────────────

/** Contexto dos períodos: hoje em 04/11/2026, obra desde a semana de 05/01/2026. */
const periodCtx: PeriodContext = { currentWeek: '2026-11-02', since: '2026-01-05', anchorWeek: '2026-11-02' };
/** Fevereiro de 2026: semanas de 02/02 a 23/02, do dia 02/02 ao sábado 28/02; véspera no domingo 01/02. */
const february = referenceOf('2026-02-02', '2026-11-04', '2026-01-05', resolvePeriod({ scale: 'mes', key: '2026-02' }, periodCtx));
/** Um pavimento de 100 dias a partir de 05/01: planejado 27% em 01/02 e 54% em 28/02. */
const long = (over: Partial<LongTermActivity> = {}) => activity('a', { unit: '%', duration: 100, interval: 100, ...over });

test('período: medido e planejado na véspera e no fim, ganhos sobre valores arredondados', () => {
  const measurements = [
    measurement('2026-01-20', { a: 10 }),
    // Domingo antes da segunda-feira inicial: é a véspera, conta no início.
    measurement('2026-02-01', { a: 20 }),
    measurement('2026-02-15', { a: 45 }),
    // Depois do sábado final: não existe para o quadro.
    measurement('2026-03-02', { a: 70 }),
  ];
  const data = buildLongTermPanel(doc([long()], { measurements }), february, filters)!;
  assert.equal(data.scale, 'mes');
  assert.equal(data.periodLabel, 'fevereiro de 2026');
  assert.equal(data.periodIn, 'no mês');
  assert.equal(data.refDate, '2026-02-28');
  assert.equal(data.refLabel, '28/02');
  assert.equal(data.measured, 45);
  assert.equal(data.planned, 54);
  assert.deepEqual(data.period, {
    start: '2026-02-02',
    end: '2026-02-28',
    measuredAtStart: 20,
    plannedAtStart: 27,
    measuredGain: 25,
    plannedGain: 27,
  });

  const summary = longTermSummary(data, february);
  assert.equal(summary.kpi.label, 'Avanço físico');
  assert.equal(summary.kpi.value, '45%');
  assert.deepEqual(summary.kpi.tag, { text: '−9 p.p. vs planejado', tone: 'warn' });
  assert.equal(summary.kpi.hint, 'Medido em 15/02 · planejado na data: 54% · no mês: +25 p.p. × planejado +27 p.p.');
  assert.equal(
    text(summary.sentence),
    'Em 28/02, o avanço físico medido é de 45%, 9 pontos abaixo do planejado para a data; no mês, avançou 25 pontos contra 27 planejados.',
  );
  assert.deepEqual(
    summary.sentence.filter(s => s.strong).map(s => s.text),
    ['45%'],
  );
});

test('período sem medição antes: o ganho é o medido no fim; sem medição até o fim, só o planejado', () => {
  const only = buildLongTermPanel(doc([long()], { measurements: [measurement('2026-02-15', { a: 45 })] }), february, filters)!;
  assert.equal(only.period.measuredAtStart, undefined);
  assert.equal(only.period.measuredGain, 45);
  assert.equal(only.period.plannedGain, 27);

  // Medição no dia da segunda-feira inicial já é do período, não da véspera.
  const monday = buildLongTermPanel(doc([long()], { measurements: [measurement('2026-02-02', { a: 30 })] }), february, filters)!;
  assert.equal(monday.period.measuredAtStart, undefined);
  assert.equal(monday.period.measuredGain, 30);

  const none = buildLongTermPanel(doc([long()], { measurements: [measurement('2026-03-02', { a: 70 })] }), february, filters)!;
  assert.equal(none.measured, undefined);
  assert.equal(none.period.measuredAtStart, undefined);
  assert.equal(none.period.measuredGain, undefined);
  assert.equal(none.period.plannedGain, 27);
  const summary = longTermSummary(none, february);
  assert.equal(
    summary.kpi.hint,
    'Planejado na data pelo plano atual (sem linha de base); nenhuma medição até 28/02 · no mês: planejado +27 p.p.',
  );
  assert.equal(
    text(summary.sentence),
    'O longo prazo ainda não tem medição até a data; o avanço planejado para a data é de 54%; no mês, o planejado avançou 27 pontos.',
  );
});

test('período: planejado no início pela linha de base mais recente, e o recorte de pavimentos vale nos dois extremos', () => {
  // O plano vivo foi reprogramado para março (0% em fevereiro); a linha de base mantém o início em 05/01.
  const lb = baseline('lb', '2025-12-20T10:00:00Z', [long()]);
  const data = buildLongTermPanel(doc([long({ start: '2026-03-02' })], { baselines: [lb] }), february, filters)!;
  assert.equal(data.plannedSource, 'baseline');
  assert.equal(data.period.plannedAtStart, 27);
  assert.equal(data.planned, 54);
  assert.equal(data.period.plannedGain, 27);
  const live = buildLongTermPanel(doc([long({ start: '2026-03-02' })]), february, filters)!;
  assert.equal(live.period.plannedAtStart, 0);
  assert.equal(live.period.plannedGain, 0);

  // Dois pavimentos de 100 dias: o 2º começa em 15/04. Sem recorte, 13,5% na véspera e 27% no fim; o ganho
  // sai dos arredondados (27 − 14), como o desvio. Só o 1º pavimento: 27% e 54%.
  const twoFloors = doc([long({ lastFloor: 2 })], { floorNames: { '1': 'Térreo', '2': '1º Pav' } });
  const whole = buildLongTermPanel(twoFloors, february, filters)!;
  assert.equal(whole.period.plannedAtStart, 13.5);
  assert.equal(whole.planned, 27);
  assert.equal(whole.period.plannedGain, 13);
  const ground = buildLongTermPanel(twoFloors, february, { ...filters, floors: new Set([floorKey('Térreo')]) })!;
  assert.equal(ground.period.plannedAtStart, 27);
  assert.equal(ground.period.plannedGain, 27);
});

test('na escala semanal o período é a semana e o quadro continua como antes', () => {
  const data = buildLongTermPanel(
    doc([activity('a', { unit: '%' })], { measurements: [measurement('2026-01-09', { a: 55 })] }),
    ref,
    filters,
  )!;
  assert.equal(data.scale, 'semana');
  assert.equal(data.refLabel, 'semana 1');
  assert.equal(data.periodIn, 'na semana');
  assert.deepEqual(data.period, { start: '2026-01-05', end: '2026-01-10', plannedAtStart: 0, measuredGain: 55, plannedGain: 50 });
  assert.equal(longTermSummary(data, ref).kpi.hint, 'Medido em 09/01 · planejado na data: 50%');
  // Personalizado: "no período", a partir da segunda-feira do "de".
  const custom = referenceOf(
    '2026-01-05',
    '2026-11-04',
    '2026-01-05',
    resolvePeriod({ scale: 'personalizado', from: '2026-01-21', to: '2026-02-28' }, periodCtx),
  );
  const p = buildLongTermPanel(doc([long()]), custom, filters)!;
  assert.equal(p.periodIn, 'no período');
  assert.equal(p.period.start, '2026-01-19');
  assert.equal(p.period.plannedAtStart, 13);
});

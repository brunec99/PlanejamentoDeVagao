import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoGrouping,
  bucketKey,
  bucketOf,
  customPeriod,
  parsePeriodParams,
  periodOptions,
  periodSearchEntries,
  resolvePeriod,
  selectionOf,
  shiftKey,
  stepPeriod,
  switchScale,
  weekPeriod,
  type PeriodContext,
} from '../src/modules/dashboard/period';
import { dashboardSearchParams, parseDashboardParams, referenceOf } from '../src/modules/dashboard/model';

// 04/11/2026 é uma quarta-feira: a semana atual começa em 02/11.
const ctx: PeriodContext = { currentWeek: '2026-11-02', since: '2024-08-05', anchorWeek: '2026-10-26' };

test('a semana pertence ao balde da sua segunda-feira (regra 5)', () => {
  // A semana de 28/09 começa em setembro: fica em setembro e no 3º trimestre, mesmo terminando em outubro.
  assert.equal(bucketKey('mes', '2026-10-01'), '2026-09');
  assert.equal(bucketKey('trimestre', '2026-10-03'), '2026-T3');
  assert.equal(bucketKey('ano', '2025-12-31'), '2025');
  assert.equal(bucketKey('semana', '2026-11-04'), '2026-11-02');
  const october = bucketOf('mes', '2026-10', ctx.currentWeek);
  assert.deepEqual(october.weeks, ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.equal(october.start, '2026-10-05');
  assert.equal(october.end, '2026-10-31');
  assert.equal(october.label, 'outubro de 2026');
  assert.equal(october.short, 'out/26');
  assert.equal(october.current, false);
});

test('balde em andamento só tem as semanas até a atual e é parcial (regra 6)', () => {
  const q4 = bucketOf('trimestre', '2026-T4', ctx.currentWeek);
  assert.equal(q4.weeks.length, 5);
  assert.equal(q4.nominalWeeks, 13);
  assert.equal(q4.current, true);
  assert.equal(q4.end, '2026-11-07');
  assert.equal(q4.label, '4º trimestre de 2026 (out–dez)');
  assert.equal(q4.short, '4T26');
});

test('shiftKey anda entre anos', () => {
  assert.equal(shiftKey('mes', '2026-01', -1), '2025-12');
  assert.equal(shiftKey('mes', '2025-12', 1), '2026-01');
  assert.equal(shiftKey('trimestre', '2026-T1', -1), '2025-T4');
  assert.equal(shiftKey('ano', '2026', -2), '2024');
  assert.equal(shiftKey('semana', '2026-11-02', -1), '2026-10-26');
});

test('resolvePeriod: escala fixa, série e anterior (regras 7 e 8)', () => {
  const month = resolvePeriod({ scale: 'mes', key: '2026-10' }, ctx);
  assert.equal(month.lastWeek, '2026-10-26');
  assert.equal(month.end, '2026-10-31');
  assert.equal(month.partial, false);
  assert.equal(month.series.length, 12);
  assert.equal(month.series.at(-1)!.key, '2026-10');
  assert.equal(month.series[0].key, '2025-11');
  assert.equal(month.previous!.key, '2026-09');
  assert.equal(month.of, 'do mês');
  const quarter = resolvePeriod({ scale: 'trimestre', key: '2026-T3' }, ctx);
  assert.equal(quarter.series.length, 8);
  const year = resolvePeriod({ scale: 'ano', key: '2026' }, ctx);
  assert.deepEqual(
    year.series.map(b => b.key),
    ['2024', '2025', '2026'],
  );
  assert.equal(year.partial, true);
});

test('resolvePeriod: sem chave ou chave fora dos limites cai na âncora', () => {
  assert.equal(resolvePeriod({ scale: 'mes' }, ctx).key, '2026-10');
  assert.equal(resolvePeriod({ scale: 'mes', key: '2027-01' }, ctx).key, '2026-10');
  assert.equal(resolvePeriod({ scale: 'mes', key: '2020-01' }, ctx).key, '2026-10');
  assert.equal(resolvePeriod({ scale: 'mes', key: 'lixo' }, ctx).key, '2026-10');
  assert.equal(resolvePeriod(undefined, ctx).key, '2026-10-26');
  // A série não recua para antes da primeira semana com dado.
  const early = resolvePeriod({ scale: 'mes', key: '2024-10' }, ctx);
  assert.deepEqual(
    early.series.map(b => b.key),
    ['2024-08', '2024-09', '2024-10'],
  );
  assert.equal(resolvePeriod({ scale: 'mes', key: '2024-08' }, ctx).previous, undefined);
});

test('personalizado: semanas inteiras, agrupamento automático e intervalo anterior (regras 5, 7 e 8)', () => {
  const p = customPeriod('2026-06-03', '2026-10-31', 'auto', ctx);
  assert.equal(p.start, '2026-06-01');
  assert.equal(p.lastWeek, '2026-10-26');
  assert.equal(p.end, '2026-10-31');
  assert.equal(p.weeks.length, 22);
  assert.equal(p.grouping, 'mes');
  assert.deepEqual(
    p.series.map(b => b.key),
    ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
  );
  assert.equal(p.previous!.weeks.length, 22);
  assert.equal(p.previous!.weeks.at(-1), '2026-05-25');
  assert.equal(p.label, '01/06/2026 a 31/10/2026');
  // Datas invertidas e "até" no futuro.
  const q = customPeriod('2026-12-31', '2026-10-14', 'semana', ctx);
  assert.equal(q.start, '2026-10-12');
  assert.equal(q.lastWeek, '2026-11-02');
  assert.equal(q.partial, true);
  assert.equal(q.series.length, 4);
  assert.equal(autoGrouping(16), 'semana');
  assert.equal(autoGrouping(17), 'mes');
  assert.equal(autoGrouping(104), 'mes');
  assert.equal(autoGrouping(105), 'trimestre');
});

test('personalizado corta o primeiro balde na borda do intervalo', () => {
  const p = customPeriod('2026-06-15', '2026-07-31', 'mes', ctx);
  assert.deepEqual(p.series[0].weeks, ['2026-06-15', '2026-06-22', '2026-06-29']);
  assert.equal(p.series[0].start, '2026-06-15');
  assert.equal(p.series[0].label, 'junho de 2026');
});

test('trocar de escala mantém o lugar; setas respeitam os limites', () => {
  const week = resolvePeriod({ scale: 'semana', key: '2026-10-26' }, ctx);
  assert.deepEqual(switchScale(week, 'mes'), { scale: 'mes', key: '2026-10' });
  assert.deepEqual(switchScale(week, 'personalizado'), { scale: 'personalizado', from: '2026-10-26', to: '2026-10-31', grouping: 'auto' });
  const now = resolvePeriod({ scale: 'mes', key: '2026-11' }, ctx);
  assert.equal(stepPeriod(now, 1, ctx), undefined);
  assert.deepEqual(stepPeriod(now, -1, ctx), { scale: 'mes', key: '2026-10' });
  const firstMonth = resolvePeriod({ scale: 'mes', key: '2024-08' }, ctx);
  assert.equal(stepPeriod(firstMonth, -1, ctx), undefined);
  const custom = customPeriod('2026-09-07', '2026-10-03', 'auto', ctx);
  assert.deepEqual(stepPeriod(custom, 1, ctx), { scale: 'personalizado', from: '2026-10-05', to: '2026-10-31', grouping: 'auto' });
});

test('periodOptions lista do mais novo ao mais antigo, só com semanas existentes', () => {
  const options = periodOptions('mes', ctx);
  assert.equal(options[0].key, '2026-11');
  assert.equal(options[0].current, true);
  assert.equal(options.at(-1)!.key, '2024-08');
  assert.equal(options.length, 28);
});

test('URL: semanal sai como semana=, as demais como escala=; o link antigo continua valendo (regra 4)', () => {
  assert.deepEqual(periodSearchEntries({ scale: 'semana', key: '2026-10-26' }), [['semana', '2026-10-26']]);
  assert.deepEqual(periodSearchEntries({ scale: 'mes', key: '2026-10' }), [
    ['escala', 'mes'],
    ['periodo', '2026-10'],
  ]);
  assert.deepEqual(periodSearchEntries({ scale: 'personalizado', from: '2026-06-01', to: '2026-10-31', grouping: 'mes' }), [
    ['escala', 'personalizado'],
    ['de', '2026-06-01'],
    ['ate', '2026-10-31'],
    ['agrupar', 'mes'],
  ]);
  assert.deepEqual(parsePeriodParams({ semana: '2026-10-28' }), { scale: 'semana', key: '2026-10-26' });
  assert.deepEqual(parsePeriodParams({ escala: 'trimestre', periodo: '2026-T4' }), { scale: 'trimestre', key: '2026-T4' });
  assert.deepEqual(parsePeriodParams({ escala: 'personalizado', de: '2026-06-01', ate: 'x' }), {
    scale: 'personalizado',
    from: '2026-06-01',
    grouping: 'auto',
  });
  assert.equal(parsePeriodParams({}), undefined);
  const selection = selectionOf(resolvePeriod({ scale: 'ano', key: '2025' }, ctx));
  const params = dashboardSearchParams({ week: '2025-12-29', selection });
  assert.equal(params.toString(), 'escala=ano&periodo=2025');
  assert.deepEqual(parseDashboardParams(Object.fromEntries(params)).selection, { scale: 'ano', key: '2025' });
  assert.equal(dashboardSearchParams({ week: '2026-10-26' }).toString(), 'semana=2026-10-26');
});

test('referenceOf sem período continua sendo a semana; com período, a última semana dele', () => {
  const plain = referenceOf('2026-10-28', '2026-11-04', '2026-01-05');
  assert.equal(plain.week, '2026-10-26');
  assert.equal(plain.weekEnd, '2026-10-31');
  assert.equal(plain.period.scale, 'semana');
  assert.equal(plain.period.series.length, 12);
  const month = referenceOf('2000-01-03', '2026-11-04', '2026-01-05', resolvePeriod({ scale: 'mes', key: '2026-10' }, ctx));
  assert.equal(month.week, '2026-10-26');
  assert.equal(month.weekEnd, '2026-10-31');
  assert.equal(weekPeriod('2026-10-28').weeks[0], '2026-10-26');
});

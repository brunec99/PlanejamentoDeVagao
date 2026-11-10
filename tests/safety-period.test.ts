import test from 'node:test';
import assert from 'node:assert/strict';
import type { SafetyItem } from '../src/domain/safety';
import {
  SAFETY_SCALES,
  currentKey,
  fixedPeriod,
  isFixedScale,
  isSafetyScale,
  periodChoices,
  periodKey,
  periodName,
  periodRange,
  stepPeriod,
  switchScale,
} from '../src/modules/seguranca/period';
import { DEFAULT_FILTERS, filterItems, hasActiveFilters, indexSafety, summarizeDeathRisk } from '../src/modules/seguranca/safety-view';

/** Período da aba 6 (10/11/2026): a escala e as setas do Dashboard da obra, com "Tudo" e períodos do calendário. */

const TODAY = '2026-11-10'; // terça-feira

test('as escalas: "Tudo" primeiro e padrão, depois as do Dashboard da obra', () => {
  assert.deepEqual(
    SAFETY_SCALES.map(scale => scale.label),
    ['Tudo', 'Semanal', 'Mensal', 'Trimestral', 'Anual', 'Personalizado'],
  );
  assert.equal(DEFAULT_FILTERS.scale, 'tudo');
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false);
  assert.ok(isSafetyScale('personalizado') && !isSafetyScale('dia'));
  assert.ok(isFixedScale('mes') && !isFixedScale('tudo') && !isFixedScale('personalizado'));
});

test('os períodos são do calendário: semana de segunda a domingo, mês, trimestre e ano inteiros', () => {
  assert.equal(periodKey('semana', '2026-11-01'), '2026-10-26'); // domingo fica na semana da segunda anterior
  assert.equal(periodKey('semana', TODAY), '2026-11-09');
  assert.deepEqual(periodRange('semana', '2026-10-26'), { from: '2026-10-26', to: '2026-11-01' });
  // O mês começa no dia 1º, mesmo numa quinta-feira (na aba 0 o mês é o das semanas inteiras).
  assert.equal(periodKey('mes', '2026-10-01'), '2026-10');
  assert.deepEqual(periodRange('mes', '2026-10'), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(periodRange('mes', '2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.equal(periodKey('trimestre', '2026-11-10'), '2026-T4');
  assert.equal(periodKey('trimestre', '2026-03-31'), '2026-T1');
  assert.deepEqual(periodRange('trimestre', '2026-T3'), { from: '2026-07-01', to: '2026-09-30' });
  assert.equal(periodKey('ano', TODAY), '2026');
  assert.deepEqual(periodRange('ano', '2025'), { from: '2025-01-01', to: '2025-12-31' });
});

test('nomes do período na lista', () => {
  assert.equal(periodName('semana', '2026-10-26'), '26/10 a 01/11/2026');
  assert.equal(periodName('mes', '2026-10'), 'outubro de 2026');
  assert.equal(periodName('trimestre', '2026-T4'), '4º trimestre de 2026 (out–dez)');
  assert.equal(periodName('ano', '2026'), '2026');
});

test('a lista vai do período de hoje (atual) ao do apontamento mais antigo', () => {
  const months = periodChoices('mes', '2026-08-20', TODAY);
  assert.deepEqual(
    months.map(option => option.key),
    ['2026-11', '2026-10', '2026-09', '2026-08'],
  );
  assert.deepEqual(
    months.map(option => option.current),
    [true, false, false, false],
  );
  assert.deepEqual(
    periodChoices('ano', '2024-05-01', TODAY).map(option => option.key),
    ['2026', '2025', '2024'],
  );
  assert.deepEqual(
    periodChoices('trimestre', '2025-12-31', TODAY).map(option => option.key),
    ['2026-T4', '2026-T3', '2026-T2', '2026-T1', '2025-T4'],
  );
  // Sem apontamento (ou com data depois de hoje), só o período de hoje.
  assert.deepEqual(
    periodChoices('semana', undefined, TODAY).map(option => option.key),
    ['2026-11-09'],
  );
  assert.deepEqual(
    periodChoices('mes', '2026-12-01', TODAY).map(option => option.key),
    ['2026-11'],
  );
});

test('o período mostrado é o do início do filtro; sem início, o de hoje', () => {
  assert.equal(currentKey('mes', '2026-09-01', TODAY), '2026-09');
  assert.equal(currentKey('semana', '', TODAY), '2026-11-09');
  assert.deepEqual(fixedPeriod('mes', '2026-09'), { scale: 'mes', from: '2026-09-01', to: '2026-09-30' });
});

test('as setas andam um período e param nas pontas da lista', () => {
  assert.deepEqual(stepPeriod('mes', '2026-10', -1, '2026-08-20', TODAY), { scale: 'mes', from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(stepPeriod('mes', '2026-10', 1, '2026-08-20', TODAY), { scale: 'mes', from: '2026-11-01', to: '2026-11-30' });
  assert.equal(stepPeriod('mes', '2026-11', 1, '2026-08-20', TODAY), undefined);
  assert.equal(stepPeriod('mes', '2026-08', -1, '2026-08-20', TODAY), undefined);
  assert.deepEqual(stepPeriod('semana', '2026-11-09', -1, '2026-01-01', TODAY), {
    scale: 'semana',
    from: '2026-11-02',
    to: '2026-11-08',
  });
  assert.deepEqual(stepPeriod('ano', '2026', -1, '2025-03-01', TODAY), { scale: 'ano', from: '2025-01-01', to: '2025-12-31' });
});

test('trocar de escala mantém o lugar', () => {
  const since = '2025-03-01';
  // De "Tudo" para uma escala fixa: o período de hoje.
  assert.deepEqual(switchScale({ from: '', to: '' }, 'mes', since, TODAY), { scale: 'mes', from: '2026-11-01', to: '2026-11-30' });
  // De setembro (mensal) para trimestral: o trimestre que contém o fim de setembro.
  assert.deepEqual(switchScale({ from: '2026-09-01', to: '2026-09-30' }, 'trimestre', since, TODAY), {
    scale: 'trimestre',
    from: '2026-07-01',
    to: '2026-09-30',
  });
  // Do mês atual (término no futuro) para semanal: a semana de hoje, não a do dia 30.
  assert.deepEqual(switchScale({ from: '2026-11-01', to: '2026-11-30' }, 'semana', since, TODAY), {
    scale: 'semana',
    from: '2026-11-09',
    to: '2026-11-15',
  });
  // Personalizado leva as datas de agora; "Tudo" limpa.
  assert.deepEqual(switchScale({ from: '2026-09-01', to: '2026-09-30' }, 'personalizado', since, TODAY), {
    scale: 'personalizado',
    from: '2026-09-01',
    to: '2026-09-30',
  });
  assert.deepEqual(switchScale({ from: '2026-09-01', to: '2026-09-30' }, 'tudo', since, TODAY), { scale: 'tudo', from: '', to: '' });
  // Um personalizado antes do primeiro apontamento cai no primeiro período da lista.
  assert.deepEqual(switchScale({ from: '2024-01-01', to: '2024-02-10' }, 'mes', since, TODAY), {
    scale: 'mes',
    from: '2025-03-01',
    to: '2025-03-31',
  });
});

const stamp = { createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };
const item = (id: string, patch: Partial<SafetyItem>): SafetyItem => ({
  ...stamp,
  id,
  workId: 'obra-1',
  consequence: 'Leve',
  probability: 'Possível',
  description: `Apontamento ${id}`,
  location: '',
  observedOn: '2026-11-01',
  status: 'open',
  origin: 'app',
  createdBy: 'u1',
  ...patch,
});
const done = (observedOn: string, correctedOn: string): Partial<SafetyItem> => ({ observedOn, status: 'resolved', correctedOn });

test('um mês do calendário filtra do dia 1º ao último, pela data do apontamento', () => {
  const items = [
    item('set-30', { observedOn: '2026-09-30' }),
    item('out-01', { observedOn: '2026-10-01' }),
    item('out-31', { observedOn: '2026-10-31' }),
    item('nov-01', { observedOn: '2026-11-01' }),
  ];
  const index = indexSafety({ types: [], items, photos: [] });
  const october = { ...DEFAULT_FILTERS, situation: 'all' as const, ...fixedPeriod('mes', '2026-10') };
  assert.deepEqual(
    filterItems(items, october, index).map(i => i.id),
    ['out-01', 'out-31'],
  );
  assert.equal(hasActiveFilters(october), true);
});

test('risco de morte: abertos, há quantos dias espera o mais antigo e a média dos finalizados', () => {
  const items = [
    item('m1', { consequence: 'Morte', observedOn: '2026-11-03' }), // aberto há 7 dias
    item('m2', { consequence: 'Morte', observedOn: '2026-11-09' }), // aberto há 1 dia
    item('m3', { consequence: 'Morte', ...done('2026-10-01', '2026-10-03') }), // 2 dias para resolver
    item('m4', { consequence: 'Morte', ...done('2026-10-10', '2026-10-15') }), // 5 dias
    item('s1', { consequence: 'Severa', observedOn: '2026-09-01' }), // não conta: não é morte
  ];
  assert.deepEqual(summarizeDeathRisk(items, TODAY), { open: 2, oldestOpenDays: 7, resolved: 2, avgDaysToResolve: 3.5 });
  // Só finalizados: nenhum aberto, e a média continua.
  assert.deepEqual(summarizeDeathRisk(items.slice(2), TODAY), { open: 0, oldestOpenDays: null, resolved: 2, avgDaysToResolve: 3.5 });
  // Aberto hoje conta 0 dias.
  assert.equal(summarizeDeathRisk([item('h', { consequence: 'Morte', observedOn: TODAY })], TODAY).oldestOpenDays, 0);
  // Nenhum de morte.
  assert.deepEqual(summarizeDeathRisk([items[4]], TODAY), { open: 0, oldestOpenDays: null, resolved: 0, avgDaysToResolve: null });
});

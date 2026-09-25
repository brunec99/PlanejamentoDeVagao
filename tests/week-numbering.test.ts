import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWeekOne, weekNumberFrom, weekOneFromCurrent } from '../src/domain/week-numbering';

test('a semana 1 é a segunda-feira da data informada', () => {
  assert.equal(normalizeWeekOne('2024-07-04'), '2024-07-01');
  assert.equal(normalizeWeekOne('2024-07-07'), '2024-07-01');
});

test('numera a partir da semana 1, com anteriores em zero ou negativo', () => {
  assert.equal(weekNumberFrom('2024-07-01', '2024-07-01'), 1);
  assert.equal(weekNumberFrom('2024-07-01', '2024-07-10'), 2);
  assert.equal(weekNumberFrom('2024-07-01', '2024-06-24'), 0);
});

test('a semana atual 113 leva à data da semana 1 e volta ao mesmo número', () => {
  const weekOne = weekOneFromCurrent('2026-09-23', 113);
  assert.equal(weekOne, '2024-07-29');
  assert.equal(weekNumberFrom(weekOne, '2026-09-21'), 113);
});

test('atravessar o horário de verão não desloca a contagem', () => {
  assert.equal(weekNumberFrom('2018-10-29', '2019-03-04'), 19);
});

test('número da semana atual precisa ser inteiro positivo', () => {
  assert.throws(() => weekOneFromCurrent('2026-09-21', 0));
  assert.throws(() => weekOneFromCurrent('2026-09-21', 2.5));
});

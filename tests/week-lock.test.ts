import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditWeek, isWeekLocked, weekLockLastDay } from '../src/domain/week-lock';

test('A semana fica aberta até a terça-feira seguinte, inclusive', () => {
  // Semana de 28/09/2026 (segunda) a 04/10 (domingo): a terça seguinte é 06/10.
  assert.equal(weekLockLastDay('2026-09-28'), '2026-10-06');
  assert.equal(weekLockLastDay('2026-10-01'), '2026-10-06', 'qualquer dia da semana leva à mesma segunda');
  assert.equal(isWeekLocked('2026-09-28', '2026-10-04'), false);
  assert.equal(isWeekLocked('2026-09-28', '2026-10-05'), false, 'segunda seguinte: ainda dá para fechar');
  assert.equal(isWeekLocked('2026-09-28', '2026-10-06'), false, 'terça seguinte: último dia');
  assert.equal(isWeekLocked('2026-09-28', '2026-10-07'), true, 'quarta seguinte: congelada');
  assert.equal(isWeekLocked('2026-10-05', '2026-10-05'), false, 'semana atual nunca congela');
});

test('Só admins editam a semana congelada', () => {
  assert.equal(canEditWeek('2026-09-28', '2026-10-07', 'admin'), true);
  for (const role of ['manager', 'planner', 'viewer']) assert.equal(canEditWeek('2026-09-28', '2026-10-07', role), false, role);
  assert.equal(canEditWeek('2026-09-28', '2026-10-06', 'planner'), true);
});

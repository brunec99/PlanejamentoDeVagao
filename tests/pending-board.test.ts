import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checklistProgress,
  dueDateFromStart,
  pendingSignal,
  startBy,
  statusNeedsReason,
  subtractWorkdays,
  workdaysUntil,
  type PendingChecklistItem,
} from '../src/domain/pending-board';

// Novembro de 2026: dia 2 é segunda; 7 e 8, 14 e 15, 21 e 22 são fim de semana.

test('subtractWorkdays pula sábado e domingo; zero devolve a própria data', () => {
  assert.equal(subtractWorkdays('2026-11-10', 0), '2026-11-10');
  assert.equal(subtractWorkdays('2026-11-10', 1), '2026-11-09');
  assert.equal(subtractWorkdays('2026-11-09', 1), '2026-11-06');
  assert.equal(subtractWorkdays('2026-11-09', 5), '2026-11-02');
  // Partindo do fim de semana, o primeiro dia útil para trás é a sexta.
  assert.equal(subtractWorkdays('2026-11-08', 1), '2026-11-06');
  // Virada de mês e de ano.
  assert.equal(subtractWorkdays('2026-11-02', 1), '2026-10-30');
  assert.equal(subtractWorkdays('2027-01-01', 1), '2026-12-31');
});

test('dueDateFromStart é a véspera útil do início', () => {
  assert.equal(dueDateFromStart('2026-11-17'), '2026-11-16');
  assert.equal(dueDateFromStart('2026-11-16'), '2026-11-13');
  assert.equal(dueDateFromStart('2026-11-15'), '2026-11-13');
});

test('workdaysUntil conta de `from` (inclusive) a `to` (exclusive), com sinal', () => {
  assert.equal(workdaysUntil('2026-11-10', '2026-11-10'), 0);
  assert.equal(workdaysUntil('2026-11-09', '2026-11-10'), 1);
  assert.equal(workdaysUntil('2026-11-06', '2026-11-09'), 1);
  assert.equal(workdaysUntil('2026-11-02', '2026-11-16'), 10);
  assert.equal(workdaysUntil('2026-11-16', '2026-11-02'), -10);
  assert.equal(workdaysUntil('2026-11-07', '2026-11-09'), 0);
});

test('startBy desconta o tempo de execução em dias úteis', () => {
  assert.equal(startBy({ dueDate: '2026-11-20', leadTimeDays: 0 }), '2026-11-20');
  assert.equal(startBy({ dueDate: '2026-11-20', leadTimeDays: 5 }), '2026-11-13');
  assert.equal(startBy({ dueDate: '2026-11-20', leadTimeDays: 10 }), '2026-11-06');
});

test('pendingSignal: fechado, atrasado, perto de começar e em dia', () => {
  const card = (status: 'todo' | 'doing' | 'paused' | 'done' | 'cancelled', dueDate: string, leadTimeDays = 0) => ({
    status,
    dueDate,
    leadTimeDays,
  });
  const today = '2026-11-10';
  assert.equal(pendingSignal(card('done', '2026-01-01'), today), 'closed');
  assert.equal(pendingSignal(card('cancelled', '2026-01-01'), today), 'closed');
  // Passou da entrega sem concluir, em qualquer coluna aberta (pausado não para o prazo).
  for (const status of ['todo', 'doing', 'paused'] as const) assert.equal(pendingSignal(card(status, '2026-11-09'), today), 'late', status);
  // A entrega é hoje: ainda não atrasou.
  assert.equal(pendingSignal(card('doing', '2026-11-10'), today), 'ok');
  // Em A fazer, o que manda é o "começar até" (entrega menos o tempo de execução).
  assert.equal(pendingSignal(card('todo', '2026-11-20', 10), today), 'late');
  assert.equal(pendingSignal(card('doing', '2026-11-20', 10), today), 'ok');
  // Começar até 17/11: cinco dias úteis de hoje, ainda "soon"; 18/11 são seis.
  assert.equal(pendingSignal(card('todo', '2026-11-17'), today), 'soon');
  assert.equal(pendingSignal(card('todo', '2026-11-18'), today), 'ok');
  assert.equal(pendingSignal(card('todo', '2026-11-25', 5), today), 'ok');
  assert.equal(pendingSignal(card('todo', '2026-11-24', 5), today), 'soon');
});

test('statusNeedsReason e checklistProgress', () => {
  assert.deepEqual((['todo', 'doing', 'paused', 'done', 'cancelled'] as const).filter(statusNeedsReason), ['paused', 'cancelled']);
  const item = (id: string, cardId: string, done: boolean) => ({ id, cardId, done }) as PendingChecklistItem;
  const items = [item('a', 'c1', true), item('b', 'c1', false), item('c', 'c2', true)];
  assert.deepEqual(checklistProgress(items, 'c1'), { done: 1, total: 2 });
  assert.deepEqual(checklistProgress(items, 'c3'), { done: 0, total: 0 });
});

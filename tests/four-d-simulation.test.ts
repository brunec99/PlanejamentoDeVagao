import test from 'node:test';
import assert from 'node:assert/strict';
import { simulationFrames, frameIndexAt, scheduleRange, serviceStateAt, indexProgress, executedAt, plannedPercentAt, frameEvents, lookFor, addMonths, quantize, type Scheduled } from '../src/modules/quatro-d/simulation';
import type { ProgressEntry } from '../src/domain/entities';

const act = (id: string, plannedStart: string, plannedEnd: string, weight = 1): Scheduled => ({ id, plannedStart, plannedEnd, weight });
let seq = 0;
const entry = (activityId: string, recordedDate: string, progress: number, createdAt = `${recordedDate}T12:00:00Z`): ProgressEntry =>
  ({ id: `e${++seq}`, activityId, recordedDate, progress, recordedBy: 'u', createdAt, updatedAt: createdAt });

test('quadros incluem as duas pontas e o último é sempre o término', () => {
  assert.deepEqual(simulationFrames('2026-09-01', '2026-09-04', 'dia'), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  assert.deepEqual(simulationFrames('2026-09-01', '2026-09-20', 'semana'), ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-20']);
  assert.deepEqual(simulationFrames('2026-01-31', '2026-04-15', 'mes'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-15']);
  assert.deepEqual(simulationFrames('2026-09-01', '2026-09-01', 'dia'), ['2026-09-01']);
  assert.deepEqual(simulationFrames('2026-09-05', '2026-09-01', 'dia'), ['2026-09-05']);
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
});

test('índice do quadro é o último que não passa da data', () => {
  const frames = ['2026-09-01', '2026-09-08', '2026-09-15'];
  assert.equal(frameIndexAt(frames, '2026-08-01'), 0);
  assert.equal(frameIndexAt(frames, '2026-09-08'), 1);
  assert.equal(frameIndexAt(frames, '2026-09-10'), 1);
  assert.equal(frameIndexAt(frames, '2027-01-01'), 2);
});

test('faixa junta cronograma atual e linha de base', () => {
  assert.deepEqual(scheduleRange([act('a', '2026-03-01', '2026-05-01')], [act('b', '2026-02-10', '2026-04-01')]), { start: '2026-02-10', end: '2026-05-01' });
  assert.equal(scheduleRange([]), undefined);
});

test('executado usa o último lançamento até a data, com desempate pela criação', () => {
  const index = indexProgress([entry('a', '2026-09-10', 40), entry('a', '2026-09-05', 20), entry('a', '2026-09-10', 45, '2026-09-10T18:00:00Z')]);
  assert.equal(executedAt(index, 'a', '2026-09-04'), 0);
  assert.equal(executedAt(index, 'a', '2026-09-07'), 20);
  assert.equal(executedAt(index, 'a', '2026-09-10'), 45);
  assert.equal(executedAt(index, 'x', '2026-09-10'), 0);
});

test('planejado avança linearmente e pondera pelo peso', () => {
  const list = [act('a', '2026-09-01', '2026-09-10', 1), act('b', '2026-09-20', '2026-09-30', 3)];
  assert.equal(plannedPercentAt(list, '2026-08-31'), 0);
  assert.equal(plannedPercentAt(list, '2026-09-05'), 50 / 4 * 1);
  assert.equal(plannedPercentAt(list, '2026-09-30'), 100);
});

test('modo planejado: não iniciado, em execução e concluído pela janela prevista', () => {
  const list = [act('a', '2026-09-01', '2026-09-10')];
  assert.equal(serviceStateAt(list, [], '2026-08-31', 'planejado').state, 'nao_iniciado');
  const middle = serviceStateAt(list, [], '2026-09-05', 'planejado');
  assert.equal(middle.state, 'em_execucao');
  assert.equal(middle.percent, 50);
  assert.equal(serviceStateAt(list, [], '2026-09-10', 'planejado').state, 'concluido');
});

test('modo executado segue o histórico datado', () => {
  const list = [act('a', '2026-09-01', '2026-09-10')];
  const entries = [entry('a', '2026-09-03', 30), entry('a', '2026-09-12', 100)];
  assert.equal(serviceStateAt(list, entries, '2026-09-02', 'executado').state, 'nao_iniciado');
  assert.deepEqual([serviceStateAt(list, entries, '2026-09-05', 'executado').state, serviceStateAt(list, entries, '2026-09-05', 'executado').percent], ['em_execucao', 30]);
  assert.equal(serviceStateAt(list, entries, '2026-09-12', 'executado').state, 'concluido');
});

test('comparado: desvio contra a linha de base quando houver, senão contra o plano atual', () => {
  const list = [act('a', '2026-09-01', '2026-09-10')];
  const entries = [entry('a', '2026-09-05', 50)];
  assert.equal(serviceStateAt(list, entries, '2026-09-05', 'comparado').deviation, 'no_prazo');
  assert.equal(serviceStateAt(list, entries, '2026-09-05', 'comparado', [act('a', '2026-08-20', '2026-08-30')]).deviation, 'atrasado');
  assert.equal(serviceStateAt(list, entries, '2026-09-05', 'comparado', [act('a', '2026-09-05', '2026-09-30')]).deviation, 'adiantado');
});

test('serviço sem atividade fica sem medição e sempre fantasma', () => {
  const frame = serviceStateAt([], [], '2026-09-05', 'executado');
  assert.equal(frame.percent, undefined);
  assert.equal(lookFor(frame, 'executado', '#000', false).display, 'ghost');
});

test('aparência: não iniciado some ou vira fantasma; comparado troca a cor pelo desvio', () => {
  const list = [act('a', '2026-09-01', '2026-09-10')];
  const before = serviceStateAt(list, [], '2026-08-01', 'planejado');
  assert.equal(lookFor(before, 'planejado', '#123456', false).display, 'hidden');
  assert.equal(lookFor(before, 'planejado', '#123456', true).display, 'ghost');
  const late = serviceStateAt(list, [entry('a', '2026-09-09', 10)], '2026-09-09', 'comparado');
  const look = lookFor(late, 'comparado', '#123456', false);
  assert.deepEqual([look.display, look.color, look.strength], ['solid', '#d03b3b', 0.1]);
  assert.equal(quantize(46), 0.5);
});

test('eventos do quadro: inícios e términos entre dois estados', () => {
  const previous = new Map([['Alvenaria', 'nao_iniciado'], ['Reboco', 'em_execucao'], ['Pintura', 'nao_iniciado']] as const);
  const current = new Map([['Alvenaria', 'em_execucao'], ['Reboco', 'concluido'], ['Pintura', 'concluido']] as const);
  assert.deepEqual(frameEvents(new Map(previous), new Map(current)), [
    { service: 'Alvenaria', kind: 'inicio' }, { service: 'Reboco', kind: 'termino' },
    { service: 'Pintura', kind: 'inicio' }, { service: 'Pintura', kind: 'termino' },
  ]);
});

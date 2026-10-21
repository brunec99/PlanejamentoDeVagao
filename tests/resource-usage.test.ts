import test from 'node:test';
import assert from 'node:assert/strict';
import type { Team } from '../src/domain/entities';
import { DEFAULT_CALENDAR } from '../src/domain/plan-schedule';
import { capacityOf, dailyLoad, overallocatedTaskIds, resourceRows, stackLanes, type ResourceTask } from '../src/domain/resource-usage';

/* Carga dos recursos como o Planejador de Equipe do Project: equipe é recurso, a capacidade são as
 * unidades máximas e o recurso fica vermelho no dia em que tem mais tarefas do que isso. */

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' };
const team = (id: string, name: string, weeklyCapacity = 1): Team => ({ id, ...stamp, workId: 'w', company: 'ATR', name, weeklyCapacity });
const task = (id: string, start: string, end: string, teamId?: string, extra: Partial<ResourceTask> = {}): ResourceTask => ({
  id,
  name: id,
  start,
  end,
  teamId,
  progress: 0,
  milestone: false,
  critical: false,
  started: false,
  ...extra,
});
const eletricista = team('ele', 'Eletricista'),
  alvenaria = team('alv', 'Alvenaria', 2);

test('Recursos: uma linha por equipe, na ordem do cadastro, e as não atribuídas no fim', () => {
  const rows = resourceRows(
    [task('a', '2026-09-07', '2026-09-08', 'ele'), task('x', '2026-09-07', '2026-09-07')],
    [eletricista, alvenaria],
  );
  assert.deepEqual(
    rows.map(r => r.team?.name ?? 'não atribuídas'),
    ['Alvenaria', 'Eletricista', 'não atribuídas'],
  );
  assert.equal(rows[1].workDays, 2);
  assert.equal(resourceRows([], [eletricista]).length, 1, 'sem tarefa solta, a faixa das não atribuídas não aparece');
});

test('Recursos: duas tarefas no mesmo dia superalocam a equipe de capacidade 1, não a de capacidade 2', () => {
  const tasks = [
    task('ele4', '2026-09-14', '2026-09-16', 'ele'),
    task('qd4', '2026-09-15', '2026-09-16', 'ele'),
    task('alv4', '2026-09-07', '2026-09-11', 'alv'),
    task('alv5', '2026-09-07', '2026-09-08', 'alv'),
  ];
  const [alv, ele] = resourceRows(tasks, [eletricista, alvenaria]);
  assert.equal(ele.overallocated, true);
  assert.equal(ele.peak, 2);
  assert.equal(ele.lanes.length, 2);
  assert.deepEqual([...overallocatedTaskIds(ele)].sort(), ['ele4', 'qd4']);
  assert.equal(alv.overallocated, false);
  const load = dailyLoad(ele, '2026-09-14', '2026-09-16');
  assert.deepEqual(
    load.map(d => [d.date, d.count, d.over]),
    [
      ['2026-09-14', 1, false],
      ['2026-09-15', 2, true],
      ['2026-09-16', 2, true],
    ],
  );
});

test('Recursos: fim de semana não carrega e marco não ocupa a equipe', () => {
  const [row] = resourceRows(
    [task('a', '2026-09-11', '2026-09-14', 'ele'), task('m', '2026-09-12', '2026-09-12', 'ele', { milestone: true })],
    [eletricista],
    DEFAULT_CALENDAR,
  );
  assert.equal(row.workDays, 2);
  assert.deepEqual(
    dailyLoad(row, '2026-09-11', '2026-09-14').map(d => d.count),
    [1, 0, 0, 1],
  );
});

test('Recursos: subfaixas reaproveitam a primeira livre e capacidade inválida vale 1', () => {
  const lanes = stackLanes([
    task('a', '2026-09-07', '2026-09-08'),
    task('b', '2026-09-08', '2026-09-09'),
    task('c', '2026-09-09', '2026-09-10'),
  ]);
  assert.deepEqual(
    lanes.map(l => l.map(t => t.id)),
    [['a', 'c'], ['b']],
  );
  assert.equal(capacityOf({ weeklyCapacity: 0 }), 1);
  assert.equal(capacityOf({ weeklyCapacity: 3 }), 3);
});

test('Recursos: término às 08:00 não ocupa o dia (IT sem defasagem, do motor)', async () => {
  const { analyzeSchedule, endFor, parseDuration } = await import('../src/domain/plan-schedule');
  const { resourceTasks } = await import('../src/domain/resource-usage');
  const row = (id: string, start: string, dur: string, order: number) => ({
    id,
    ...stamp,
    planId: 'p',
    name: id,
    plannedStart: start,
    plannedEnd: endFor(start, parseDuration(dur), DEFAULT_CALENDAR).end,
    duration: parseDuration(dur),
    level: 0,
    order,
    progress: 0,
    teamId: 'ele',
  });
  const plan = [row('a', '2026-09-07', '2d', 1), row('b', '2026-09-07', '2d', 2)];
  const link = { id: 'l', ...stamp, predecessorId: 'a', successorId: 'b', type: 'IT' as const, lagDays: 0, lagBusiness: true };
  const { tasks, info } = analyzeSchedule(plan, [link]);
  assert.equal(tasks[1].plannedEnd, '2026-09-07', 'a tabela mostra o término na segunda, como o Project');
  const b = resourceTasks(tasks, info).find(t => t.id === 'b')!;
  assert.deepEqual([b.start, b.end], ['2026-09-03', '2026-09-06']);
  const [ele] = resourceRows(resourceTasks(tasks, info), [eletricista]);
  assert.equal(ele.overallocated, false, 'b termina às 08:00 de segunda, quando a começa: não há sobreposição');
});

test('Recursos: tarefa dividida libera a equipe nos dias parados', () => {
  const split = task('reb', '2026-09-07', '2026-09-16', 'ele', { started: true, pause: { from: '2026-09-09', to: '2026-09-11' } });
  const other = task('qd', '2026-09-09', '2026-09-11', 'ele');
  const [row] = resourceRows([split, other], [eletricista]);
  assert.equal(row.workDays, 5 + 3, 'reboco: 8 dias úteis de 07 a 16 menos 3 parados; quadro: 3');
  assert.equal(row.overallocated, false, 'o quadro cabe na pausa do reboco');
  assert.deepEqual(
    dailyLoad(row, '2026-09-08', '2026-09-14').map(d => d.count),
    [1, 1, 1, 1, 0, 0, 1],
  );
});

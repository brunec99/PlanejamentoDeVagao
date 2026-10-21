import test from 'node:test';
import assert from 'node:assert/strict';
import type { Team } from '../src/domain/entities';
import { DEFAULT_CALENDAR } from '../src/domain/plan-schedule';
import { dailyLoad, resourceRows, type ResourceTask } from '../src/domain/resource-usage';
import {
  cellLabel,
  columnGroups,
  formatHours,
  hoursPerDayOf,
  resourceCells,
  resourceKey,
  saneTasks,
  taskCells,
  taskWorkHours,
  usageColumns,
  usageOutline,
  usageRange,
  validDate,
  workLabel,
} from '../src/modules/medio-prazo/resource-usage-view';
import { initialsOf, nextSort, resourceSheetRows, sortResourceRows, unitsLabel } from '../src/modules/medio-prazo/resource-sheet-view';

/* Uso dos Recursos e Planilha de Recursos no molde do Project: horas por dia ou por semana, o
 * vermelho da superalocação, "Sem alocação" primeiro, "64 hrs" e "200%", iniciais e ordenação. */

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' };
const team = (id: string, name: string, weeklyCapacity = 1, company = 'ATR'): Team => ({
  id,
  ...stamp,
  workId: 'w',
  company,
  name,
  weeklyCapacity,
});
const task = (id: string, start: string, end: string, teamId?: string, extra: Partial<ResourceTask> = {}): ResourceTask => ({
  id,
  name: id,
  start,
  end,
  teamId,
  progress: 0,
  milestone: false,
  critical: false,
  ...extra,
});
const eletricista = team('ele', 'Eletricista'),
  alvenaria = team('alv', 'Equipe Alvenaria', 2, 'Construtora B');

test('Uso dos Recursos: horas no formato do Project', () => {
  assert.equal(cellLabel(8), '8h');
  assert.equal(cellLabel(16), '16h');
  assert.equal(cellLabel(4.5), '4,5h');
  assert.equal(cellLabel(0), '', 'célula sem trabalho fica vazia');
  assert.equal(workLabel(64), '64 hrs');
  assert.equal(workLabel(0), '0 hrs');
  assert.equal(workLabel(1000), '1.000 hrs');
  assert.equal(formatHours(Number.NaN), '0');
  assert.equal(hoursPerDayOf({ hoursPerDay: 0 }), 8, 'jornada inválida vale a do calendário padrão');
  assert.equal(hoursPerDayOf({ hoursPerDay: 9 }), 9);
});

test('Uso dos Recursos: período em semanas inteiras, com a janela e as tarefas', () => {
  assert.deepEqual(usageRange([task('a', '2026-10-05', '2026-10-06')], { start: '2026-09-16', end: '2026-09-30' }), {
    start: '2026-09-14',
    end: '2026-10-11',
  });
  assert.equal(usageRange([task('x', '2026-02-30', 'abc')], { start: '', end: '' }), undefined, 'sem data válida não há grade');
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-02-28'), true);
  assert.deepEqual(
    saneTasks([task('a', '2026-09-10', '2026-09-08'), task('b', 'x', '2026-09-08')]).map(t => [t.id, t.start, t.end]),
    [['a', '2026-09-10', '2026-09-10']],
    'término antes do início vira um dia; data inválida sai',
  );
});

test('Uso dos Recursos: colunas diárias com a letra do dia e a semana em cima; fim de semana sombreado', () => {
  const columns = usageColumns({ start: '2026-09-14', end: '2026-09-20' }, 'dia', DEFAULT_CALENDAR);
  assert.deepEqual(
    columns.map(c => c.label),
    ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'],
  );
  assert.deepEqual(
    columns.filter(c => c.off).map(c => c.start),
    ['2026-09-19', '2026-09-20'],
  );
  assert.deepEqual(columnGroups(columns), [{ key: '2026-09-14', label: '14/Set/26', span: 7 }]);
  assert.equal(columns[0].title, 'Seg 14/09/26');
});

test('Uso dos Recursos: em Semanas e Meses, uma coluna por semana e o mês em cima', () => {
  for (const zoom of ['semana', 'mes'] as const) {
    const columns = usageColumns({ start: '2026-09-14', end: '2026-10-11' }, zoom, DEFAULT_CALENDAR);
    assert.deepEqual(
      columns.map(c => [c.start, c.end, c.label]),
      [
        ['2026-09-14', '2026-09-20', '14/09'],
        ['2026-09-21', '2026-09-27', '21/09'],
        ['2026-09-28', '2026-10-04', '28/09'],
        ['2026-10-05', '2026-10-11', '05/10'],
      ],
    );
    assert.deepEqual(
      columnGroups(columns).map(g => [g.label, g.span]),
      [
        ['Set/26', 3],
        ['Out/26', 1],
      ],
    );
  }
  assert.deepEqual(usageColumns(undefined, 'dia', DEFAULT_CALENDAR), []);
});

test('Uso dos Recursos: horas do recurso por dia e por semana, vermelhas acima das unidades máximas', () => {
  const tasks = [task('ele4', '2026-09-14', '2026-09-16', 'ele'), task('qd4', '2026-09-15', '2026-09-16', 'ele')];
  const [ele] = resourceRows(tasks, [eletricista]);
  const days = usageColumns({ start: '2026-09-14', end: '2026-09-20' }, 'dia', DEFAULT_CALENDAR);
  const load = dailyLoad(ele, '2026-09-14', '2026-09-20');
  const daily = resourceCells(load, days, ele.capacity, 8);
  assert.deepEqual(
    daily.slice(0, 4).map(c => [c.hours, c.over]),
    [
      [8, false],
      [16, true],
      [16, true],
      [0, false],
    ],
  );
  assert.equal(daily[5].available, 0, 'sábado não tem hora disponível');
  const weeks = usageColumns({ start: '2026-09-14', end: '2026-09-27' }, 'semana', DEFAULT_CALENDAR);
  const weekly = resourceCells(dailyLoad(ele, '2026-09-14', '2026-09-27'), weeks, ele.capacity, 8);
  assert.deepEqual(weekly[0], { hours: 40, available: 40, over: true }, 'a semana fica vermelha mesmo com o total cabendo');
  assert.deepEqual(weekly[1], { hours: 0, available: 40, over: false });
});

test('Uso dos Recursos: horas da tarefa por coluna e trabalho total; marco sem trabalho', () => {
  const weeks = usageColumns({ start: '2026-09-07', end: '2026-09-20' }, 'semana', DEFAULT_CALENDAR);
  const friToMon = task('a', '2026-09-11', '2026-09-14', 'ele');
  assert.deepEqual(taskCells(friToMon, weeks, DEFAULT_CALENDAR), [8, 8]);
  assert.equal(taskWorkHours(friToMon, DEFAULT_CALENDAR), 16);
  const marco = task('m', '2026-09-12', '2026-09-12', 'ele', { milestone: true });
  assert.deepEqual(taskCells(marco, weeks, DEFAULT_CALENDAR), [0, 0]);
  assert.equal(taskWorkHours(marco, DEFAULT_CALENDAR), 0);
  assert.equal(taskWorkHours(task('b', '2026-09-14', '2026-09-16'), { ...DEFAULT_CALENDAR, hoursPerDay: 9 }), 27);
});

test('Uso dos Recursos: "Sem alocação" primeiro e recurso recolhido esconde as tarefas', () => {
  const rows = resourceRows(
    [task('a', '2026-09-14', '2026-09-15', 'ele'), task('x', '2026-09-14', '2026-09-14'), task('b', '2026-09-16', '2026-09-16', 'alv')],
    [eletricista, alvenaria],
  );
  const open = usageOutline(rows, new Set());
  assert.deepEqual(
    open.map(l => (l.kind === 'resource' ? (l.row.team?.name ?? 'Sem alocação') : `  ${l.task.id}`)),
    ['Sem alocação', '  x', 'Eletricista', '  a', 'Equipe Alvenaria', '  b'],
  );
  const ele = rows.find(r => r.team?.id === 'ele')!;
  assert.deepEqual(
    usageOutline(rows, new Set([resourceKey(ele)])).map(l => l.key),
    ['recurso:sem-alocacao', 'x', 'recurso:ele', 'recurso:alv', 'b'],
  );
});

test('Uso dos Recursos e Planilha: a pausa da tarefa dividida não conta trabalho nem superaloca', () => {
  // Reboco de 10 dias úteis: trabalha 07 e 08/09, fica parado de 09 a 11/09 e retoma de 14 a 23/09.
  const reboco = task('reb', '2026-09-07', '2026-09-23', 'ele', { started: true, pause: { from: '2026-09-09', to: '2026-09-11' } });
  assert.equal(taskWorkHours(reboco, DEFAULT_CALENDAR), 80, '10 dias × 8 h, não os 13 dias úteis do início ao término');
  const days = usageColumns({ start: '2026-09-07', end: '2026-09-13' }, 'dia', DEFAULT_CALENDAR);
  assert.deepEqual(taskCells(reboco, days, DEFAULT_CALENDAR), [8, 8, 0, 0, 0, 0, 0], 'dias parados ficam vazios');
  const weeks = usageColumns({ start: '2026-09-07', end: '2026-09-27' }, 'semana', DEFAULT_CALENDAR);
  assert.deepEqual(taskCells(reboco, weeks, DEFAULT_CALENDAR), [16, 40, 24]);

  // Outra tarefa da mesma equipe (capacidade 1) cabe exatamente na pausa: sem superalocação.
  const instalacao = task('ins', '2026-09-09', '2026-09-11', 'ele');
  const [ele] = resourceRows([reboco, instalacao], [eletricista]);
  assert.equal(ele.overallocated, false);
  const weekly = resourceCells(dailyLoad(ele, '2026-09-07', '2026-09-27'), weeks, ele.capacity, 8);
  assert.deepEqual(
    weekly.map(c => [c.hours, c.over]),
    [
      [40, false],
      [40, false],
      [24, false],
    ],
  );
  assert.deepEqual(
    resourceSheetRows([ele], 8).map(r => [workLabel(r.work), unitsLabel(r.peak), r.overallocated]),
    [['104 hrs', '100%', false]],
    'trabalho da equipe: 80 h do reboco mais 24 h da instalação',
  );
});

test('Planilha de Recursos: unidades máximas em %, iniciais e linhas por equipe', () => {
  assert.equal(unitsLabel(2), '200%');
  assert.equal(unitsLabel(1), '100%');
  assert.equal(unitsLabel(0), '0%');
  assert.equal(initialsOf('Equipe Alvenaria'), 'EA');
  assert.equal(initialsOf('Eletricista'), 'E');
  assert.equal(initialsOf('Mestre de obras'), 'MO');
  assert.equal(initialsOf('  instalações elétricas e hidráulicas prediais '), 'IEH', 'até três letras, sem conectivos');
  assert.equal(initialsOf('(Hidráulica) 2º pav'), 'H2P');
  assert.equal(initialsOf(''), '');

  const rows = resourceRows(
    [
      task('e1', '2026-09-14', '2026-09-16', 'ele'),
      task('e2', '2026-09-15', '2026-09-16', 'ele'),
      task('a1', '2026-09-14', '2026-09-18', 'alv'),
      task('x', '2026-09-14', '2026-09-14'),
    ],
    [eletricista, alvenaria],
  );
  const sheet = resourceSheetRows(rows, 8);
  assert.deepEqual(
    sheet.map(r => [
      r.index,
      r.name,
      r.initials,
      r.group,
      unitsLabel(r.capacity),
      unitsLabel(r.peak),
      workLabel(r.work),
      r.tasks,
      r.overallocated,
    ]),
    [
      [1, 'Eletricista', 'E', 'ATR', '100%', '200%', '40 hrs', 2, true],
      [2, 'Equipe Alvenaria', 'EA', 'Construtora B', '200%', '100%', '40 hrs', 1, false],
    ],
    'a faixa das não atribuídas não é recurso',
  );
});

test('Planilha de Recursos: ordenar pelo cabeçalho, crescente, decrescente e de volta ao Id', () => {
  const rows = resourceSheetRows(
    resourceRows(
      [
        task('a', '2026-09-14', '2026-09-18', 'e10'),
        task('b', '2026-09-14', '2026-09-14', 'e2'),
        task('c', '2026-09-15', '2026-09-15', 'e2'),
      ],
      [team('e10', 'Equipe 10', 3, 'Beta'), team('e2', 'equipe 2', 1, 'Álamo'), team('e3', 'Élétrica', 1, 'Beta')],
    ),
    8,
  );
  assert.deepEqual(
    rows.map(r => r.name),
    ['equipe 2', 'Élétrica', 'Equipe 10'],
    'Id na ordem do domínio: empresa e nome',
  );
  assert.deepEqual(
    sortResourceRows(rows, { key: 'name', dir: 'asc' }).map(r => r.name),
    ['Élétrica', 'equipe 2', 'Equipe 10'],
    'texto sem diferenciar acento e caixa, com número em ordem natural',
  );
  assert.deepEqual(
    sortResourceRows(rows, { key: 'work', dir: 'desc' }).map(r => [r.name, r.work]),
    [
      ['Equipe 10', 40],
      ['equipe 2', 16],
      ['Élétrica', 0],
    ],
  );
  assert.deepEqual(
    sortResourceRows(rows, { key: 'group', dir: 'desc' }).map(r => r.name),
    ['Élétrica', 'Equipe 10', 'equipe 2'],
    'empate fica na ordem do Id',
  );
  assert.deepEqual(
    sortResourceRows(rows).map(r => r.index),
    [1, 2, 3],
  );
  assert.deepEqual(nextSort(undefined, 'name'), { key: 'name', dir: 'asc' });
  assert.deepEqual(nextSort({ key: 'name', dir: 'asc' }, 'name'), { key: 'name', dir: 'desc' });
  assert.equal(nextSort({ key: 'name', dir: 'desc' }, 'name'), undefined);
  assert.deepEqual(nextSort({ key: 'name', dir: 'desc' }, 'work'), { key: 'work', dir: 'asc' });
});

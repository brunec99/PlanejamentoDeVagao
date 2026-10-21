import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTask, Team } from '../src/domain/entities';
import { DEFAULT_CALENDAR, type TaskSchedule } from '../src/domain/plan-schedule';
import { resourceRows, type ResourceTask } from '../src/domain/resource-usage';
import { CHART, STATUS } from '../src/shared/palette';
import {
  PLANNER_LANE_PX,
  UNASSIGNED_KEY,
  adjacentRowKey,
  blockSegments,
  blockTone,
  clampPaneHeight,
  dragDays,
  draggedStart,
  labelPlacement,
  lockReason,
  neighborTask,
  plannerLines,
  plannerRowHeight,
  plannerTasks,
  plannerTooltip,
  resolveDrop,
  rowKeyOf,
  snapToWorkday,
  startLocked,
  teamIdOfKey,
} from '../src/modules/medio-prazo/team-planner';

/* Planejador de Equipe do Project: as contas de tela (tarefas desenháveis, linhas visuais,
 * navegação pelo teclado, arrasto encaixado no dia útil e o que soltar o bloco faz) ficam em
 * funções puras, sem DOM. 07/09/2026 é uma segunda-feira. */

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' };
const team = (id: string, name: string, weeklyCapacity = 1): Team => ({ id, ...stamp, workId: 'w', company: 'ATR', name, weeklyCapacity });
const planTask = (id: string, order: number, level: number, start: string, end: string, extra: Partial<PlanTask> = {}): PlanTask => ({
  id,
  ...stamp,
  planId: 'p',
  name: id,
  plannedStart: start,
  plannedEnd: end,
  progress: 0,
  order,
  level,
  ...extra,
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
const alvenaria = team('alv', 'Alvenaria'),
  eletricista = team('ele', 'Eletricista'),
  encanador = team('enc', 'Encanador');
const teams = [eletricista, encanador, alvenaria];
/* Alvenaria com duas tarefas em sequência, Eletricista superalocado (ele4 e qd4 no mesmo dia),
 * Encanador sem tarefa e uma pintura sem equipe. */
const scenario = [
  task('alv4', '2026-09-07', '2026-09-11', 'alv'),
  task('alv5', '2026-09-14', '2026-09-18', 'alv'),
  task('ele4', '2026-09-14', '2026-09-16', 'ele'),
  task('qd4', '2026-09-15', '2026-09-16', 'ele'),
  task('ele5', '2026-09-21', '2026-09-23', 'ele'),
  task('pint', '2026-09-08', '2026-09-09'),
];
const rows = resourceRows(scenario, teams, DEFAULT_CALENDAR);
const ids = (lines: ReturnType<typeof plannerLines>) =>
  lines.map(line => `${line.key}#${line.lane}:${line.tasks.map(t => t.id).join(',')}`);

test('Planejador: só tarefas entram, data inválida fica de fora e término invertido vira um dia', () => {
  const info = new Map([['a', { critical: true } as TaskSchedule]]);
  const out = plannerTasks(
    [
      planTask('resumo', 0, 0, '2026-09-07', '2026-09-30'),
      planTask('a', 1, 1, '2026-09-07', '2026-09-09', { teamId: 'ele' }),
      planTask('b', 2, 1, '2026-09-10', '2026-09-08'),
      planTask('c', 3, 1, '2026-02-30', '2026-03-02'),
      planTask('m', 4, 1, '2026-09-29', '2026-09-29', { duration: { value: 0, unit: 'd' } }),
    ],
    info,
  );
  assert.deepEqual(
    out.map(t => t.id),
    ['a', 'b', 'm'],
  );
  assert.equal(out[0].critical, true);
  assert.equal(out[0].teamId, 'ele');
  assert.deepEqual([out[1].start, out[1].end], ['2026-09-10', '2026-09-10']);
  assert.equal(out[2].milestone, true);
  assert.doesNotThrow(() => resourceRows(out, teams), 'o que sai daqui não derruba o resourceRows');
});

test('Planejador: chave da linha, com equipe excluída caindo nas não atribuídas', () => {
  const known = new Set(['ele']);
  assert.equal(rowKeyOf('ele', known), 'team:ele');
  assert.equal(rowKeyOf('apagada', known), UNASSIGNED_KEY);
  assert.equal(rowKeyOf(undefined, known), UNASSIGNED_KEY);
  assert.equal(teamIdOfKey('team:ele'), 'ele');
  assert.equal(teamIdOfKey(UNASSIGNED_KEY), undefined);
});

test('Planejador: a equipe superalocada abre em subfaixas, recolhida volta a uma linha, e a faixa de baixo vem sempre por último', () => {
  assert.deepEqual(ids(plannerLines(rows)), [
    'team:alv#0:alv4,alv5',
    'team:ele#0:ele4,ele5',
    'team:ele#1:qd4',
    'team:enc#0:',
    'none#0:pint',
  ]);
  assert.deepEqual(ids(plannerLines(rows, new Set(['team:ele'])))[1], 'team:ele#0:ele4,qd4,ele5');
  assert.deepEqual(
    ids(plannerLines(resourceRows([], [eletricista]))),
    ['team:ele#0:', 'none#0:'],
    'sem tarefa solta, a faixa de baixo continua lá como alvo de soltar',
  );
  const loose = resourceRows([task('x', '2026-09-07', '2026-09-08'), task('y', '2026-09-08', '2026-09-09')], []);
  assert.deepEqual(ids(plannerLines(loose, new Set([UNASSIGNED_KEY]))), ['none#0:x', 'none#1:y'], 'a faixa de baixo empilha e não recolhe');
});

test('Planejador: setas andam na linha, e para cima e para baixo vão ao bloco mais próximo no tempo', () => {
  const lines = plannerLines(rows);
  assert.equal(neighborTask(lines, 'alv4', 'right'), 'alv5');
  assert.equal(neighborTask(lines, 'alv4', 'left'), undefined);
  assert.equal(neighborTask(lines, 'alv4', 'last'), 'alv5');
  assert.equal(neighborTask(lines, 'ele5', 'first'), 'ele4');
  assert.equal(neighborTask(lines, 'alv5', 'down'), 'ele4', 'a que se cruza com a atual');
  assert.equal(neighborTask(lines, 'ele5', 'up'), 'alv5', 'sem cruzamento, a de menor distância');
  assert.equal(neighborTask(lines, 'ele4', 'down'), 'qd4', 'a subfaixa de baixo da mesma equipe');
  assert.equal(neighborTask(lines, 'qd4', 'down'), 'pint', 'pula a equipe sem tarefa');
  assert.equal(neighborTask(lines, 'pint', 'up'), 'qd4');
  assert.equal(neighborTask(lines, 'pint', 'down'), undefined);
  assert.equal(neighborTask(lines, 'resumo', 'down'), 'alv4', 'sem bloco atual, o primeiro de todos');
  assert.equal(neighborTask(plannerLines(rows, new Set(['team:ele'])), 'alv5', 'down'), 'ele4', 'no empate, o que começa antes');
});

test('Planejador: Shift com seta troca para o recurso vizinho, com a faixa das não atribuídas por último', () => {
  const keys = ['team:alv', 'team:ele', UNASSIGNED_KEY];
  assert.equal(adjacentRowKey(keys, 'team:ele', 1), UNASSIGNED_KEY);
  assert.equal(adjacentRowKey(keys, UNASSIGNED_KEY, -1), 'team:ele');
  assert.equal(adjacentRowKey(keys, UNASSIGNED_KEY, 1), undefined);
  assert.equal(adjacentRowKey(keys, 'team:alv', -1), undefined);
  assert.equal(adjacentRowKey(keys, 'team:apagada', 1), undefined);
});

test('Planejador: o arrasto anda em dias inteiros, igual para os dois lados, com zona morta', () => {
  assert.equal(dragDays(5, 'semana'), 0, 'menos de 6 px não muda a data');
  assert.equal(dragDays(6, 'semana'), 1);
  assert.equal(dragDays(-6, 'semana'), -1);
  assert.equal(dragDays(20, 'semana'), 3);
  assert.equal(dragDays(13, 'dia'), 0, 'menos de meio dia não muda a data');
  assert.equal(dragDays(14, 'dia'), 1);
  assert.equal(dragDays(-14, 'dia'), -1);
  assert.equal(dragDays(42, 'dia'), 2);
  assert.equal(dragDays(5, 'mes'), 0);
  assert.equal(dragDays(8, 'mes'), 5);
  assert.equal(dragDays(Number.NaN, 'dia'), 0);
});

test('Planejador: o novo início cai em dia útil, no sentido do arrasto', () => {
  assert.equal(draggedStart('2026-09-11', 28, 'dia', DEFAULT_CALENDAR), '2026-09-14', 'da sexta para o sábado vai à segunda');
  assert.equal(draggedStart('2026-09-14', -28, 'dia', DEFAULT_CALENDAR), '2026-09-11', 'da segunda para o domingo volta à sexta');
  assert.equal(draggedStart('2026-09-09', 28, 'dia', DEFAULT_CALENDAR), '2026-09-10');
  assert.equal(draggedStart('2026-09-09', 10, 'dia', DEFAULT_CALENDAR), '2026-09-09');
  assert.equal(draggedStart('2026-09-07', 42, 'semana', DEFAULT_CALENDAR), '2026-09-14', 'uma semana na escala semanal');
  const feriado = { ...DEFAULT_CALENDAR, holidays: ['2026-09-15'] };
  assert.equal(draggedStart('2026-09-14', 28, 'dia', feriado), '2026-09-16', 'feriado também pula');
  assert.equal(snapToWorkday('2026-09-12', DEFAULT_CALENDAR, 1), '2026-09-14');
  assert.equal(snapToWorkday('2026-09-12', DEFAULT_CALENDAR, -1), '2026-09-11');
  assert.equal(snapToWorkday('2026-09-10', DEFAULT_CALENDAR, -1), '2026-09-10');
});

test('Planejador: soltar em outra linha reatribui, na faixa de baixo desatribui, e para os lados muda o início', () => {
  const ele4 = scenario[2];
  assert.equal(resolveDrop(ele4, 'team:ele', 'team:ele', ele4.start), undefined, 'nada mudou');
  assert.equal(resolveDrop(ele4, 'team:ele', null, '2026-09-21'), undefined, 'fora das linhas, o bloco volta');
  assert.deepEqual(resolveDrop(ele4, 'team:ele', 'team:enc', ele4.start), { assign: true, teamId: 'enc', start: undefined });
  assert.deepEqual(resolveDrop(ele4, 'team:ele', UNASSIGNED_KEY, ele4.start), { assign: true, teamId: undefined, start: undefined });
  assert.deepEqual(resolveDrop(scenario[5], UNASSIGNED_KEY, 'team:ele', '2026-09-08'), {
    assign: true,
    teamId: 'ele',
    start: undefined,
  });
  assert.deepEqual(resolveDrop(ele4, 'team:ele', 'team:ele', '2026-09-21'), { assign: false, teamId: undefined, start: '2026-09-21' });
  assert.deepEqual(resolveDrop(ele4, 'team:ele', 'team:enc', '2026-09-21'), { assign: true, teamId: 'enc', start: '2026-09-21' });
  const done = { ...ele4, progress: 100 };
  assert.equal(startLocked(done), true);
  assert.equal(resolveDrop(done, 'team:ele', 'team:ele', '2026-09-21'), undefined, 'concluída não muda de data');
  assert.deepEqual(resolveDrop(done, 'team:ele', 'team:enc', '2026-09-21'), { assign: true, teamId: 'enc', start: undefined });
});

test('Planejador: a dica escreve período, equipe, avanço, criticidade e conflito', () => {
  assert.equal(
    plannerTooltip(
      task('Instalações elétricas 4º', '2026-09-14', '2026-09-16', 'ele', { progress: 40, critical: true }),
      'Eletricista',
      true,
    ),
    'Instalações elétricas 4º · Seg 14/09/26 – Qua 16/09/26 · Eletricista · 40% concluída · Crítica · Superalocada',
  );
  assert.equal(
    plannerTooltip(task('Vistoria 4º pav', '2026-09-29', '2026-09-29', undefined, { milestone: true }), undefined),
    'Vistoria 4º pav · Marco em Ter 29/09/26 · Sem equipe · 0% concluída',
  );
  assert.match(plannerTooltip(task('  ', '2026-09-14', '2026-09-14'), 'X'), /^Sem nome · /);
});

test('Planejador: cor do bloco — conflito no contorno vermelho, crítica no filete, concluída mais clara', () => {
  const normal = blockTone({ critical: false, progress: 30 });
  assert.equal(normal.border, CHART.planned);
  assert.equal(normal.borderWidth, 1);
  assert.equal(normal.accent, undefined);
  const over = blockTone({ critical: false, progress: 30 }, true);
  assert.deepEqual([over.border, over.borderWidth], [STATUS.danger, 2]);
  assert.equal(blockTone({ critical: true, progress: 0 }).accent, CHART.late);
  assert.equal(blockTone({ critical: true, progress: 0 }).border, CHART.planned, 'crítica sem conflito não ganha contorno vermelho');
  const done = blockTone({ critical: false, progress: 100 });
  assert.equal(done.text, CHART.inkMuted);
  assert.notEqual(done.fill, normal.fill);
});

test('Planejador: altura das linhas e da faixa de baixo', () => {
  assert.equal(plannerRowHeight(0), plannerRowHeight(1));
  assert.equal(plannerRowHeight(2) - plannerRowHeight(1), PLANNER_LANE_PX);
  const min = clampPaneHeight(0, 600);
  assert.equal(min, plannerRowHeight(1) + 12, 'nunca menos de uma subfaixa e a barra de rolagem');
  assert.equal(clampPaneHeight(200, 600), 200);
  assert.ok(clampPaneHeight(5000, 600) < 600, 'sempre sobra espaço para as equipes');
  assert.equal(clampPaneHeight(Number.NaN, 600), min);
  assert.equal(clampPaneHeight(300, 50), min, 'tela pequena: fica o mínimo');
});

test('Planejador: o nome vai dentro do bloco largo, ao lado do estreito quando há vão, e some sem vão', () => {
  assert.equal(labelPlacement(84, 0), 'inside');
  assert.equal(labelPlacement(18, 60), 'outside', 'escala semanal: bloco de três dias com espaço até o próximo');
  assert.equal(labelPlacement(18, 10), 'none', 'sem vão, pedaço de letra não ajuda');
});

test('Planejador: tarefa iniciada troca de equipe, mas o início real não se move', () => {
  const started = task('ele4', '2026-09-14', '2026-09-16', 'ele', { started: true, progress: 40 });
  assert.equal(lockReason(started), 'A tarefa já começou: o início real não se move');
  assert.equal(startLocked(started), true);
  assert.equal(lockReason(task('a', '2026-09-14', '2026-09-16')), undefined);
  assert.match(lockReason({ progress: 100, started: true }) ?? '', /^Concluída/);
  assert.equal(resolveDrop(started, 'team:ele', 'team:ele', '2026-09-21'), undefined, 'na mesma linha, nada muda');
  assert.deepEqual(
    resolveDrop(started, 'team:ele', 'team:enc', '2026-09-21'),
    { assign: true, teamId: 'enc', start: undefined },
    'na diagonal, só a equipe muda',
  );
  assert.match(plannerTooltip(started, 'Eletricista'), / · Iniciada: o início real não se move$/);
});

test('Planejador: tarefa dividida em dois trechos, com a pausa no meio, como no Gantt', () => {
  // Trabalhou de seg 07 a qua 09, parou de qui 10 a seg 14 e retoma na ter 15 até sex 18.
  const split = task('alv', '2026-09-07', '2026-09-18', 'alv', { pause: { from: '2026-09-10', to: '2026-09-14' } });
  const shape = blockSegments(split, '2026-09-07', 'dia');
  assert.deepEqual(
    shape.segments.map(s => [s.left, s.right]),
    [
      [0, 3 * 28],
      [8 * 28, 12 * 28],
    ],
  );
  assert.deepEqual(shape.gaps, [{ left: 3 * 28, right: 8 * 28 }]);
  assert.equal(blockSegments({ ...split, pause: undefined }, '2026-09-07', 'dia').segments.length, 1);
  assert.equal(
    blockSegments({ ...split, pause: { from: '2026-09-07', to: '2026-09-09' } }, '2026-09-07', 'dia').segments.length,
    1,
    'pausa colada no início não é divisão desenhável',
  );
  assert.match(plannerTooltip(split, 'Alvenaria'), /Interrompida: trabalhou até Qua 09\/09\/26 e retoma em Ter 15\/09\/26/);
});

test('Planejador: as tarefas do plano trazem início real e pausa, e data ruim não derruba nada', () => {
  const edges = { earlyStart: 'end', earlyFinish: 'end', lateStart: 'start', lateFinish: 'end' } as const;
  const info = new Map<string, TaskSchedule>([
    ['a', { critical: false, stop: '2026-09-09', resume: '2026-09-15' } as TaskSchedule],
    ['ruim', { critical: false, edges } as TaskSchedule],
  ]);
  const out = plannerTasks(
    [
      planTask('a', 0, 0, '2026-09-07', '2026-09-18', { actualStart: '2026-09-07', progress: 30 }),
      planTask('ruim', 1, 0, '2026-13-01', '2026-13-05'),
    ],
    info,
  );
  assert.deepEqual(
    out.map(t => t.id),
    ['a'],
  );
  assert.equal(out[0].started, true);
  assert.deepEqual(out[0].pause, { from: '2026-09-10', to: '2026-09-14' });
});

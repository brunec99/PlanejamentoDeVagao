import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlanDependency, PlanTask } from '../src/domain/entities';
import { FIXED_COLS, moveColumn, normalizeOrder, shiftLevels } from '../src/modules/medio-prazo/schedule-sheet';

function task(id: string, level: number, extra: Partial<PlanTask> = {}): PlanTask {
  return {
    id,
    level,
    name: id,
    progress: 0,
    order: 0,
    planId: 'plan',
    plannedStart: '2026-09-01',
    plannedEnd: '2026-09-30',
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}
const link = (from: string, to: string): PlanDependency => ({
  id: `${from}>${to}`,
  predecessorId: from,
  successorId: to,
  type: 'TI',
  lagDays: 0,
  lagBusiness: true,
  createdAt: '',
  updatedAt: '',
});
const levels = (tasks: PlanTask[]) => tasks.map(t => `${t.id}${t.level}`).join(' ');

test('recuar um bloco leva as subtarefas recolhidas junto e mantém a estrutura relativa', () => {
  // a0 b0 [c0 d1 e2 f1] g0: seleciona c..f (d recolhido esconde e); o bloco vai até o fim da subárvore de f.
  const tasks = [task('a', 0), task('b', 0), task('c', 0), task('d', 1), task('e', 2), task('f', 1), task('g', 0)];
  const out = shiftLevels(tasks, 2, 5, 1);
  assert.equal(out.error, undefined);
  assert.equal(levels(out.tasks), 'a0 b0 c1 d2 e3 f2 g0');
});

test('recuar a última linha selecionada com subárvore inclui as subtarefas dela, mesmo recolhidas', () => {
  // seleção visível x..y com y recolhido: y1 e y2 acompanham.
  const tasks = [task('p', 0), task('x', 0), task('y', 0), task('y1', 1), task('y2', 2), task('z', 0)];
  const out = shiftLevels(tasks, 1, 2, 1);
  assert.equal(levels(out.tasks), 'p0 x1 y1 y12 y23 z0');
});

test('bloco cuja primeira linha não pode recuar devolve erro e não muda nada', () => {
  const tasks = [task('a', 0), task('b', 1), task('c', 1)];
  const first = shiftLevels(tasks, 0, 1, 1);
  assert.equal(first.error, 'A primeira linha selecionada não pode recuar.');
  assert.equal(first.tasks, tasks);
  // b já é subitem de a (mais fundo que a linha de cima): recuar de novo não dá.
  const deeper = shiftLevels([task('a', 0), task('b', 1), task('c', 2)], 1, 2, 1);
  assert.equal(deeper.error, 'A primeira linha selecionada não pode recuar.');
});

test('diminuir o recuo com linha no nível 0 na seleção devolve erro', () => {
  const tasks = [task('a', 0), task('b', 1), task('c', 0), task('d', 1)];
  const out = shiftLevels(tasks, 1, 2, -1);
  assert.equal(out.error, 'Há linha no nível 0 na seleção.');
  assert.equal(levels(out.tasks), 'a0 b1 c0 d1');
});

test('diminuir o recuo do bloco preserva a estrutura relativa e leva a subárvore da última linha', () => {
  const tasks = [task('a', 0), task('b', 1), task('c', 2), task('d', 1), task('e', 2), task('f', 0)];
  const out = shiftLevels(tasks, 1, 3, -1);
  assert.equal(out.error, undefined);
  assert.equal(levels(out.tasks), 'a0 b0 c1 d0 e1 f0');
});

test('a linha de cima que vira resumo perde vínculos, datas reais, restrição, prazo e anchorStart', () => {
  const parent = task('p', 0, {
    actualStart: '2026-09-01',
    actualEnd: '2026-09-02',
    deadline: '2026-09-30',
    anchorStart: '2026-09-01',
    constraintType: 'SNET',
    constraintDate: '2026-09-01',
  });
  const tasks = [task('a', 0), parent, task('b', 0), task('c', 0)];
  const links = [link('a', 'p'), link('p', 'b'), link('b', 'c')];
  const out = shiftLevels(tasks, 2, 3, 1, links);
  assert.equal(levels(out.tasks), 'a0 p0 b1 c1');
  const p = out.tasks[1];
  for (const k of ['actualStart', 'actualEnd', 'deadline', 'anchorStart', 'constraintType', 'constraintDate'] as const)
    assert.equal(p[k], undefined, k);
  assert.deepEqual(
    out.links.map(l => l.id),
    ['b>c'],
  );
  // Entradas intactas.
  assert.equal(parent.deadline, '2026-09-30');
  assert.equal(links.length, 3);
});

test('recuar sob um resumo já existente não limpa ninguém', () => {
  const summary = task('s', 0, { deadline: '2026-09-30' });
  const tasks = [summary, task('s1', 1), task('x', 0)];
  const out = shiftLevels(tasks, 2, 2, 1, [link('s1', 'x')]);
  assert.equal(levels(out.tasks), 's0 s11 x1');
  assert.equal(out.tasks[0].deadline, '2026-09-30');
  assert.equal(out.links.length, 1);
});

test('ao diminuir o recuo, a última linha do bloco que vira resumo da irmã de baixo também é limpa', () => {
  const tasks = [task('a', 0), task('b', 1, { deadline: '2026-09-30' }), task('c', 1)];
  const out = shiftLevels(tasks, 1, 1, -1, [link('b', 'c')]);
  assert.equal(levels(out.tasks), 'a0 b0 c1');
  assert.equal(out.tasks[1].deadline, undefined);
  assert.deepEqual(out.links, []);
});

test('intervalo inválido devolve erro sem mexer', () => {
  const tasks = [task('a', 0)];
  assert.ok(shiftLevels(tasks, -1, 0, 1).error);
  assert.ok(shiftLevels(tasks, 0, 1, 1).error);
  assert.ok(shiftLevels(tasks, 1, 0, -1).error);
});

test('moveColumn solta antes ou depois da coluna alvo conforme o lado', () => {
  const order = normalizeOrder(['id', 'ind', 'progress', 'name', 'duration', 'start']);
  const before = moveColumn(order, 'duration', 'progress', false);
  assert.deepEqual(before.slice(0, 6), ['id', 'ind', 'duration', 'progress', 'name', 'start']);
  const after = moveColumn(order, 'progress', 'name', true);
  assert.deepEqual(after.slice(0, 6), ['id', 'ind', 'name', 'progress', 'duration', 'start']);
  // O nome também se move.
  assert.deepEqual(moveColumn(order, 'name', 'start', true).slice(0, 6), ['id', 'ind', 'progress', 'duration', 'start', 'name']);
});

test('moveColumn: colunas presas não andam, soltar sobre elas cai logo depois delas e sem mudança devolve o mesmo array', () => {
  const order = normalizeOrder([]);
  assert.deepEqual(FIXED_COLS, ['id', 'ind']);
  assert.equal(moveColumn(order, 'id', 'name', true), order);
  assert.equal(moveColumn(order, 'ind', 'name', false), order);
  assert.deepEqual(moveColumn(order, 'duration', 'id', false).slice(0, 5), ['id', 'ind', 'duration', 'progress', 'name']);
  assert.equal(moveColumn(order, 'name', 'name', true), order);
  assert.equal(moveColumn(order, 'progress', 'name', false), order);
  assert.equal(moveColumn(order, 'name', 'progress', true), order);
  assert.equal(moveColumn(order, 'name', 'inexistente' as never, true), order);
});

test('normalizeOrder filtra chaves desconhecidas, repetidas, prende Id e Indicadores e completa com a ordem padrão', () => {
  const full = normalizeOrder(undefined);
  assert.equal(full.length, 26);
  assert.equal(new Set(full).size, 26);
  assert.deepEqual(full.slice(0, 4), ['id', 'ind', 'progress', 'name']);
  const custom = normalizeOrder(['notes', 'bogus', 'name', 'id', 'notes', 7, 'start']);
  assert.deepEqual(custom.slice(0, 5), ['id', 'ind', 'notes', 'name', 'start']);
  assert.equal(custom.length, 26);
  assert.equal(new Set(custom).size, 26);
  assert.deepEqual(normalizeOrder('name'), full);
});

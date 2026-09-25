import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GANTT_DAY_PX, arrowHead, barSpan, dateX, ganttRange, ganttRowMetrics, ganttTooltip, layoutLinks, linkPoints, milestoneX, monthLabel,
  nonWorkingRuns, shortDate, timescaleTiers, weekdayOf, type GanttRow, type LinkAnchor,
} from '../src/modules/medio-prazo/gantt-chart';

const row = (overrides: Partial<GanttRow> = {}): GanttRow => ({
  id: 'a', name: 'Alvenaria', summary: false, milestone: false, level: 1, start: '2026-08-24', end: '2026-10-09', progress: 40, ...overrides,
});
const anchor = (left: number, right: number, index: number, rowHeight = 30): LinkAnchor =>
  ({ left, right, y: index * rowHeight + rowHeight / 2, top: index * rowHeight, bottom: (index + 1) * rowHeight });

test('rótulos de mês em pt-BR atravessam a virada do ano', () => {
  assert.equal(monthLabel('2026-09-14'), 'Set/26');
  assert.equal(monthLabel('2026-12-31'), 'Dez/26');
  assert.equal(monthLabel('2027-01-01'), 'Jan/27');
  const range = ganttRange([row({ start: '2026-12-10', end: '2027-01-20' })], { start: '2026-12-01', end: '2027-01-31' }, 'semana');
  const labels = timescaleTiers(range, 'semana').top.map(cell => cell.label);
  assert.deepEqual(labels, ['Nov/26', 'Dez/26', 'Jan/27', 'Fev/27']);
  const yearly = timescaleTiers(ganttRange([], { start: '2026-11-01', end: '2027-02-28' }, 'mes'), 'mes');
  assert.deepEqual(yearly.top.map(cell => cell.label), ['2026', '2027']);
  assert.deepEqual(yearly.bottom.map(cell => cell.label), ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar']);
});

test('escala semanal começa numa segunda, fecha num domingo e rotula o dia da segunda', () => {
  const range = ganttRange([row()], { start: '2026-09-01', end: '2026-11-30' }, 'semana');
  assert.equal(weekdayOf(range.start), 1);
  assert.equal(weekdayOf(range.end), 0);
  assert.equal(range.days % 7, 0);
  const { bottom } = timescaleTiers(range, 'semana');
  assert.equal(bottom.length, range.days / 7);
  for (const cell of bottom) {
    assert.equal(weekdayOf(cell.key), 1, `${cell.key} deveria ser segunda`);
    assert.equal(cell.label, cell.key.slice(8, 10));
    assert.equal(cell.width, 7 * GANTT_DAY_PX.semana);
  }
  assert.equal(bottom[0].left, 0);
  // 24/08/26 é segunda: a linha começa em 24/08 e a folga de uma semana cai em 17/08.
  assert.equal(range.start, '2026-08-17');
});

test('escala diária usa o dia do mês e o período cobre base e real com folga', () => {
  const range = ganttRange([row({ baseStart: '2026-08-10', baseEnd: '2026-10-20', actualStart: '2026-08-25' })], { start: '2026-09-01', end: '2026-10-31' }, 'dia');
  assert.equal(range.start, '2026-08-03');
  assert.equal(range.end, '2026-11-07');
  const { bottom } = timescaleTiers(range, 'dia');
  assert.equal(bottom.length, range.days);
  assert.equal(bottom[0].label, '03');
  assert.equal(bottom[0].title, 'Seg 03/08/26');
});

test('posição horizontal: barra inclui o dia do término e o marco fica no meio do dia', () => {
  const start = '2026-08-24';
  assert.equal(dateX('2026-08-31', start, 'semana'), 42);
  assert.deepEqual(barSpan('2026-08-24', '2026-08-28', start, 'dia'), { left: 0, right: 5 * 28, width: 5 * 28 });
  // Datas invertidas viram um dia; nenhuma barra some.
  assert.equal(barSpan('2026-08-28', '2026-08-24', start, 'dia').width, 28);
  assert.equal(barSpan('2026-08-24', '2026-08-24', start, 'mes').width, 2);
  assert.equal(milestoneX('2026-10-09', start, 'dia'), 46 * 28 + 14);
  assert.equal(milestoneX('2026-10-09', start, 'semana'), 46 * 6 + 3);
});

test('dias não úteis seguem o calendário e agrupam dias seguidos', () => {
  const range = { start: '2026-09-04', end: '2026-09-14', days: 11 }; // sex a seg
  const runs = nonWorkingRuns(range, { weekdays: [1, 2, 3, 4, 5], hoursPerDay: 8, daysPerMonth: 20, holidays: ['2026-09-07'] });
  // Sáb 05, dom 06 e o feriado de seg 07 formam um bloco; sáb 12 e dom 13, outro.
  assert.deepEqual(runs, [{ from: 1, days: 3 }, { from: 8, days: 2 }]);
  const sixDays = nonWorkingRuns(range, { weekdays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, daysPerMonth: 24, holidays: [] });
  assert.deepEqual(sixDays, [{ from: 2, days: 1 }, { from: 9, days: 1 }]);
});

test('vínculos TI, II, TT e IT saem e entram pelas pontas certas', () => {
  const from = anchor(100, 200, 0), to = anchor(300, 400, 2);
  const ti = linkPoints('TI', from, to);
  assert.deepEqual(ti[0], [200, 15]);
  assert.deepEqual(ti.at(-1), [300, 75]);
  assert.deepEqual(ti, [[200, 15], [206, 15], [206, 75], [300, 75]]);

  const ii = linkPoints('II', from, to);
  assert.deepEqual(ii, [[100, 15], [94, 15], [94, 75], [300, 75]]);

  const tt = linkPoints('TT', from, to);
  assert.deepEqual(tt, [[200, 15], [406, 15], [406, 75], [400, 75]]);

  const it = linkPoints('IT', anchor(300, 400, 0), anchor(100, 200, 2));
  assert.deepEqual(it, [[300, 15], [294, 15], [294, 75], [200, 75]]);
});

test('TI com sucessora colada contorna pela borda da linha da predecessora', () => {
  const points = linkPoints('TI', anchor(100, 200, 0), anchor(200, 260, 1));
  assert.deepEqual(points, [[200, 15], [206, 15], [206, 30], [194, 30], [194, 45], [200, 45]]);
  // Subindo, o contorno usa a borda de cima.
  const up = linkPoints('TI', anchor(100, 200, 3), anchor(150, 260, 1));
  assert.equal(up[2][1], 90);
});

test('a ponta da seta aponta para dentro da sucessora', () => {
  const ti = linkPoints('TI', anchor(100, 200, 0), anchor(300, 400, 2));
  const head = arrowHead(ti, 4);
  assert.deepEqual(head[0], [300, 75]);
  assert.ok(head[1][0] < 300 && head[2][0] < 300, 'entra no início vindo da esquerda');
  const tt = linkPoints('TT', anchor(100, 200, 0), anchor(300, 400, 2));
  const back = arrowHead(tt, 4);
  assert.ok(back[1][0] > 400 && back[2][0] > 400, 'entra no término vindo da direita');
});

test('vínculo com uma ponta fora das linhas exibidas é ignorado', () => {
  const anchors = new Map([['a', anchor(0, 50, 0)], ['b', anchor(80, 120, 1)]]);
  const paths = layoutLinks([
    { id: 'ok', from: 'a', to: 'b', type: 'TI' },
    { id: 'sem-sucessora', from: 'a', to: 'recolhida', type: 'TI' },
    { id: 'sem-predecessora', from: 'outra', to: 'b', type: 'II' },
    { id: 'laco', from: 'a', to: 'a', type: 'TT' },
  ], anchors);
  assert.deepEqual(paths.map(path => path.id), ['ok']);
});

test('métricas de linha deixam a base abaixo da barra, dentro da altura', () => {
  for (const height of [24, 28, 32, 36]) {
    const m = ganttRowMetrics(height, true);
    assert.ok(m.baseTop >= m.barTop + m.barHeight);
    assert.ok(m.baseTop + m.baseHeight <= height);
    const centered = ganttRowMetrics(height, false);
    assert.ok(Math.abs(centered.mid - height / 2) <= 1);
  }
});

test('dica descreve datas, avanço, base, real e janela em texto', () => {
  assert.equal(shortDate('2026-08-24'), 'Seg 24/08/26');
  assert.equal(ganttTooltip(row({ baseStart: '2026-08-24', baseEnd: '2026-10-02' })), 'Alvenaria · Seg 24/08/26 a Sex 09/10/26 · 40% · Base: Seg 24/08/26 a Sex 02/10/26');
  assert.equal(ganttTooltip(row({ milestone: true, name: 'Entrega', start: '2026-10-09', end: '2026-10-09', progress: 100, outOfWindow: true })),
    'Entrega · Marco em Sex 09/10/26 · 100% · Fora da janela do plano');
  assert.match(ganttTooltip(row({ actualStart: '2026-08-25' })), /Real: iniciada em Ter 25\/08\/26/);
});

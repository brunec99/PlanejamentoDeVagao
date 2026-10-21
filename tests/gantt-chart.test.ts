import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GANTT_DAY_PX,
  addWorkingDays,
  arrowHead,
  barDragAbilities,
  barSegments,
  barSpan,
  barSpanEdges,
  barTone,
  dateAtX,
  dateX,
  dayDelta,
  dayEdgeX,
  deadlineLabel,
  deadlineX,
  dragModeAt,
  dragTooltip,
  edgeScrollDelta,
  ganttRange,
  ganttRowMetrics,
  ganttTooltip,
  isWorkingDay,
  layoutLinks,
  linkPoints,
  linkTargetAt,
  linkTone,
  milestoneX,
  monthLabel,
  movedDates,
  nonWorkingRuns,
  progressAtX,
  progressFill,
  progressX,
  resizedEnd,
  shortDate,
  slackLine,
  slackSpan,
  snapToWorkingDay,
  spanDays,
  timescaleTiers,
  weekdayOf,
  workingDaysBetween,
  type GanttRow,
  type GanttZoom,
  type LinkAnchor,
} from '../src/modules/medio-prazo/gantt-chart';
import { CHART, SERIES_COLORS } from '../src/shared/palette';

const row = (overrides: Partial<GanttRow> = {}): GanttRow => ({
  id: 'a',
  name: 'Alvenaria',
  summary: false,
  milestone: false,
  level: 1,
  start: '2026-08-24',
  end: '2026-10-09',
  progress: 40,
  ...overrides,
});
const anchor = (left: number, right: number, index: number, rowHeight = 30): LinkAnchor => ({
  left,
  right,
  y: index * rowHeight + rowHeight / 2,
  top: index * rowHeight,
  bottom: (index + 1) * rowHeight,
});

test('rótulos de mês em pt-BR atravessam a virada do ano', () => {
  assert.equal(monthLabel('2026-09-14'), 'Set/26');
  assert.equal(monthLabel('2026-12-31'), 'Dez/26');
  assert.equal(monthLabel('2027-01-01'), 'Jan/27');
  const range = ganttRange([row({ start: '2026-12-10', end: '2027-01-20' })], { start: '2026-12-01', end: '2027-01-31' }, 'semana');
  const labels = timescaleTiers(range, 'semana').top.map(cell => cell.label);
  assert.deepEqual(labels, ['Nov/26', 'Dez/26', 'Jan/27', 'Fev/27']);
  const yearly = timescaleTiers(ganttRange([], { start: '2026-11-01', end: '2027-02-28' }, 'mes'), 'mes');
  assert.deepEqual(
    yearly.top.map(cell => cell.label),
    ['2026', '2027'],
  );
  assert.deepEqual(
    yearly.bottom.map(cell => cell.label),
    ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar'],
  );
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
  const range = ganttRange(
    [row({ baseStart: '2026-08-10', baseEnd: '2026-10-20', actualStart: '2026-08-25' })],
    { start: '2026-09-01', end: '2026-10-31' },
    'dia',
  );
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
  assert.deepEqual(runs, [
    { from: 1, days: 3 },
    { from: 8, days: 2 },
  ]);
  const sixDays = nonWorkingRuns(range, { weekdays: [1, 2, 3, 4, 5, 6], hoursPerDay: 8, daysPerMonth: 24, holidays: [] });
  assert.deepEqual(sixDays, [
    { from: 2, days: 1 },
    { from: 9, days: 1 },
  ]);
});

test('vínculos TI, II, TT e IT saem e entram pelas pontas certas', () => {
  const from = anchor(100, 200, 0),
    to = anchor(300, 400, 2);
  const ti = linkPoints('TI', from, to);
  assert.deepEqual(ti[0], [200, 15]);
  assert.deepEqual(ti.at(-1), [300, 75]);
  assert.deepEqual(ti, [
    [200, 15],
    [206, 15],
    [206, 75],
    [300, 75],
  ]);

  const ii = linkPoints('II', from, to);
  assert.deepEqual(ii, [
    [100, 15],
    [94, 15],
    [94, 75],
    [300, 75],
  ]);

  const tt = linkPoints('TT', from, to);
  assert.deepEqual(tt, [
    [200, 15],
    [406, 15],
    [406, 75],
    [400, 75],
  ]);

  const it = linkPoints('IT', anchor(300, 400, 0), anchor(100, 200, 2));
  assert.deepEqual(it, [
    [300, 15],
    [294, 15],
    [294, 75],
    [200, 75],
  ]);
});

test('TI com sucessora colada contorna pela borda da linha da predecessora', () => {
  const points = linkPoints('TI', anchor(100, 200, 0), anchor(200, 260, 1));
  assert.deepEqual(points, [
    [200, 15],
    [206, 15],
    [206, 30],
    [194, 30],
    [194, 45],
    [200, 45],
  ]);
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
  const anchors = new Map([
    ['a', anchor(0, 50, 0)],
    ['b', anchor(80, 120, 1)],
  ]);
  const paths = layoutLinks(
    [
      { id: 'ok', from: 'a', to: 'b', type: 'TI' },
      { id: 'sem-sucessora', from: 'a', to: 'recolhida', type: 'TI' },
      { id: 'sem-predecessora', from: 'outra', to: 'b', type: 'II' },
      { id: 'laco', from: 'a', to: 'a', type: 'TT' },
    ],
    anchors,
  );
  assert.deepEqual(
    paths.map(path => path.id),
    ['ok'],
  );
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
  assert.equal(
    ganttTooltip(row({ baseStart: '2026-08-24', baseEnd: '2026-10-02' })),
    'Alvenaria · Seg 24/08/26 a Sex 09/10/26 · 40% · Base: Seg 24/08/26 a Sex 02/10/26',
  );
  assert.equal(
    ganttTooltip(row({ milestone: true, name: 'Entrega', start: '2026-10-09', end: '2026-10-09', progress: 100, outOfWindow: true })),
    'Entrega · Marco em Sex 09/10/26 · 100% · Fora da janela do plano',
  );
  assert.match(ganttTooltip(row({ actualStart: '2026-08-25' })), /Real: iniciada em Ter 25\/08\/26/);
});

test('dica diz crítica, folgas, prazo final, conflito e papel no caminho em texto', () => {
  assert.equal(
    ganttTooltip(row({ critical: true, freeSlack: 0, totalSlack: 0, baseStart: '2026-08-24', baseEnd: '2026-10-02' })),
    'Alvenaria · Seg 24/08/26 a Sex 09/10/26 · 40% · Crítica · Base: Seg 24/08/26 a Sex 02/10/26 · Folga livre: 0 dias · Folga total: 0 dias',
  );
  // Singular, plural e folga negativa.
  assert.match(ganttTooltip(row({ freeSlack: 1, totalSlack: 3 })), /Folga livre: 1 dia · Folga total: 3 dias$/);
  assert.match(ganttTooltip(row({ totalSlack: -1 })), /Folga total: -1 dia$/);
  assert.doesNotMatch(ganttTooltip(row({ totalSlack: -1 })), /Folga livre/);
  // Prazo final, com e sem perda.
  assert.match(ganttTooltip(row({ deadline: '2026-10-16' })), /Prazo final: Sex 16\/10\/26/);
  assert.match(ganttTooltip(row({ deadline: '2026-10-02', deadlineMissed: true })), /Prazo final perdido: Sex 02\/10\/26/);
  assert.equal(deadlineLabel(row({ deadline: '2026-10-02', deadlineMissed: true })), 'Prazo final perdido: Sex 02/10/26');
  assert.equal(deadlineLabel(row()), undefined);
  assert.equal(deadlineLabel(row({ deadline: 'nd' })), undefined);
  // Conflito e papel no caminho, sempre antes de "Fora da janela".
  assert.equal(
    ganttTooltip(row({ conflict: true, pathRole: 'driving', outOfWindow: true })),
    'Alvenaria · Seg 24/08/26 a Sex 09/10/26 · 40% · Vínculo desrespeitado · Predecessora determinante · Fora da janela do plano',
  );
  assert.match(ganttTooltip(row({ pathRole: 'predecessor' })), /· Predecessora$/);
  assert.match(ganttTooltip(row({ pathRole: 'driven' })), /· Sucessora determinada$/);
  assert.match(ganttTooltip(row({ pathRole: 'successor' })), /· Sucessora$/);
  // A selecionada não ganha texto de papel: o `aria-pressed` já diz que é ela.
  assert.equal(ganttTooltip(row({ pathRole: 'selected' })), ganttTooltip(row()));
  // Marco crítico: a palavra entra logo depois do avanço.
  assert.equal(
    ganttTooltip(row({ milestone: true, name: 'Entrega', start: '2026-10-09', progress: 0, critical: true })),
    'Entrega · Marco em Sex 09/10/26 · 0% · Crítica',
  );
});

test('cor da barra: normal, crítica, resumo sempre preto e opção desligada', () => {
  const normal = barTone(row());
  assert.equal(normal.border, CHART.planned);
  assert.equal(normal.progress, CHART.planned);
  assert.match(normal.fill, new RegExp(`${CHART.planned} 28%, white`));
  assert.equal(normal.opacity, 1);
  // Crítica: vermelho de "atrasado", claro no fundo e cheio na borda e no avanço.
  const critical = barTone(row({ critical: true }));
  assert.equal(critical.border, CHART.late);
  assert.equal(critical.progress, CHART.late);
  assert.equal(critical.fill, `color-mix(in srgb, ${CHART.late} 28%, white)`);
  // "Tarefas críticas" desligado: volta ao azul.
  assert.deepEqual(barTone(row({ critical: true }), { showCritical: false }), normal);
  // Resumo crítico continua preto, como no Project.
  const summary = barTone(row({ summary: true, critical: true }));
  assert.equal(summary.fill, summary.border);
  assert.equal(summary.fill, summary.progress);
  assert.notEqual(summary.fill, CHART.late);
  assert.equal(summary.fill, barTone(row({ summary: true })).fill);
  // Marco crítico usa as mesmas cores da tarefa crítica.
  assert.deepEqual(barTone(row({ milestone: true, critical: true })), critical);
});

test('cor da barra no caminho da tarefa: âmbar e roxo, por cima da crítica, e o resto apaga', () => {
  const amber = SERIES_COLORS[3],
    purple = SERIES_COLORS[6];
  const on = { showPath: true };
  const driving = barTone(row({ pathRole: 'driving' }), on);
  assert.equal(driving.fill, amber);
  assert.match(driving.border, new RegExp(`${amber} 70%, black`));
  assert.equal(driving.progress, driving.border);
  assert.equal(driving.opacity, 1);
  const predecessor = barTone(row({ pathRole: 'predecessor' }), on);
  assert.equal(predecessor.fill, `color-mix(in srgb, ${amber} 40%, white)`);
  assert.equal(predecessor.border, amber);
  assert.equal(predecessor.progress, amber);
  const driven = barTone(row({ pathRole: 'driven' }), on);
  assert.equal(driven.fill, purple);
  assert.match(driven.border, new RegExp(`${purple} 70%, black`));
  const successor = barTone(row({ pathRole: 'successor' }), on);
  assert.equal(successor.fill, `color-mix(in srgb, ${purple} 40%, white)`);
  assert.equal(successor.border, purple);
  // O caminho vem por cima da cor crítica.
  assert.deepEqual(barTone(row({ pathRole: 'driving', critical: true }), on), driving);
  // A selecionada mantém a cor normal (ou crítica) e não apaga.
  assert.deepEqual(barTone(row({ pathRole: 'selected' }), on), barTone(row()));
  assert.deepEqual(barTone(row({ pathRole: 'selected', critical: true }), on), barTone(row({ critical: true })));
  // Fora do caminho: cor normal com opacidade 0,45; resumo fora do caminho apaga também.
  const outside = barTone(row(), on);
  assert.equal(outside.opacity, 0.45);
  assert.equal(outside.border, CHART.planned);
  assert.equal(barTone(row({ summary: true }), on).opacity, 0.45);
  assert.equal(barTone(row({ critical: true }), on).border, CHART.late);
  // Com o caminho desligado, o papel é ignorado.
  assert.deepEqual(barTone(row({ pathRole: 'driving' })), barTone(row()));
  assert.deepEqual(barTone(row({ pathRole: 'driving' }), { showPath: false, showCritical: true }), barTone(row()));
});

test('cor do vínculo: determinante no caminho fica âmbar e grosso, fora do caminho apaga', () => {
  const link = { from: 'a', to: 'b', driving: true };
  // Sem caminho da tarefa, todos iguais.
  assert.deepEqual(linkTone(link), { stroke: CHART.link, strokeWidth: 1.25, opacity: 1 });
  assert.deepEqual(linkTone({ from: 'a', to: 'b' }), linkTone(link));
  const path = new Set(['a', 'b']);
  assert.deepEqual(linkTone(link, path), { stroke: SERIES_COLORS[3], strokeWidth: 2, opacity: 1 });
  assert.deepEqual(linkTone({ from: 'a', to: 'b' }, path), { stroke: CHART.link, strokeWidth: 1.25, opacity: 1 });
  // Uma ponta fora do caminho basta para apagar, mesmo determinante.
  assert.deepEqual(linkTone({ from: 'a', to: 'c', driving: true }, path), { stroke: CHART.link, strokeWidth: 1.25, opacity: 0.35 });
  assert.equal(linkTone({ from: 'c', to: 'd' }, path).opacity, 0.35);
  // `layoutLinks` leva o `driving` até o desenho.
  const anchors = new Map([
    ['a', anchor(0, 50, 0)],
    ['b', anchor(80, 120, 1)],
  ]);
  const paths = layoutLinks(
    [
      { id: 'd', from: 'a', to: 'b', type: 'TI', driving: true },
      { id: 'n', from: 'a', to: 'b', type: 'II' },
    ],
    anchors,
  );
  assert.deepEqual(
    paths.map(path => path.driving),
    [true, undefined],
  );
});

test('linha de folga vai do fim da barra até o fim do dia do término tardio', () => {
  const start = '2026-08-24';
  // Término sex 28/08, término tardio qua 02/09: a linha começa no fim de 28/08 e cobre 5 dias.
  assert.deepEqual(slackSpan('2026-08-28', '2026-09-02', start, 'dia'), { left: 5 * 28, width: 5 * 28 });
  assert.deepEqual(slackSpan('2026-08-28', '2026-09-02', start, 'semana'), { left: 5 * 6, width: 5 * 6 });
  // A linha encosta na barra: começa exatamente onde `barSpan` termina.
  assert.equal(slackSpan('2026-08-28', '2026-09-02', start, 'dia')!.left, barSpan(start, '2026-08-28', start, 'dia').right);
  // Sem término tardio, no mesmo dia do término ou antes dele (folga negativa), não há linha.
  assert.equal(slackSpan('2026-08-28', undefined, start, 'dia'), undefined);
  assert.equal(slackSpan('2026-08-28', '2026-08-28', start, 'dia'), undefined);
  assert.equal(slackSpan('2026-08-28', '2026-08-26', start, 'dia'), undefined);
  assert.equal(slackSpan('2026-08-28', 'nd', start, 'dia'), undefined);
});

test('seta do prazo final fica no meio do dia, como o marco', () => {
  const start = '2026-08-24';
  assert.equal(deadlineX('2026-10-09', start, 'dia'), milestoneX('2026-10-09', start, 'dia'));
  assert.equal(deadlineX('2026-08-24', start, 'semana'), 3);
  assert.equal(deadlineX('2026-08-25', start, 'mes'), 1.6 + 0.8);
});

test('período inclui o prazo final sempre e o término tardio só com a folga à mostra', () => {
  const window = { start: '2026-09-01', end: '2026-10-31' };
  // Prazo final depois de tudo alarga o período, com a semana de folga.
  const withDeadline = ganttRange([row({ deadline: '2026-11-20' })], window, 'dia');
  assert.equal(withDeadline.end, '2026-11-27');
  // Término tardio além do fim: só entra com `showSlack`.
  const late = [row({ lateFinish: '2026-12-01' })];
  assert.equal(ganttRange(late, window, 'dia').end, '2026-11-07');
  assert.equal(ganttRange(late, window, 'dia', { showSlack: true }).end, '2026-12-08');
  // Sem os campos, nada muda em relação ao período de antes.
  assert.deepEqual(ganttRange([row()], window, 'dia', { showSlack: true }), ganttRange([row()], window, 'dia'));
  // Datas inválidas são ignoradas.
  assert.deepEqual(
    ganttRange([row({ deadline: 'nd', lateFinish: '' })], window, 'dia', { showSlack: true }),
    ganttRange([row()], window, 'dia'),
  );
});

// ————— Bordas do dia, tarefa dividida e arrasto —————

/* 24/08/26 é segunda: é o início do período nestes testes, então o dia N do período é 24/08 + N.
 * 07/09 é o dia 14, 11/09 (sexta) o 18, 14/09 (segunda) o 21. */
const RANGE = '2026-08-24';
const WEEK = { weekdays: [1, 2, 3, 4, 5], holidays: [] as string[] };
const lines = (tip: { lines: [string, string][] }) => tip.lines.map(([label, value]) => `${label}: ${value}`);

test('bordas do dia: começo à esquerda, fim à direita, e as bordas padrão são a barSpan', () => {
  assert.equal(dayEdgeX('2026-08-25', 'start', RANGE, 'dia'), 28);
  assert.equal(dayEdgeX('2026-08-25', 'end', RANGE, 'dia'), 56);
  for (const zoom of ['dia', 'semana', 'mes'] as GanttZoom[])
    for (const [start, end] of [
      ['2026-08-24', '2026-08-28'],
      ['2026-08-28', '2026-08-24'],
      ['2026-08-24', '2026-08-24'],
      ['2026-09-03', '2026-10-09'],
    ])
      assert.deepEqual(barSpanEdges(start, end, RANGE, zoom), barSpan(start, end, RANGE, zoom), `${start} a ${end} em ${zoom}`);
});

test('IT sem defasagem termina na borda esquerda da segunda e dias corridos acabam às 08:00', () => {
  // Seg 07/09 a seg 14/09 às 08:00: a tabela mostra a segunda, mas a barra não cobre o dia 14.
  const it = barSpanEdges('2026-09-07', '2026-09-14', RANGE, 'dia', 'start', 'start');
  assert.equal(it.left, 14 * 28);
  assert.equal(it.right, dateX('2026-09-14', RANGE, 'dia'));
  assert.equal(it.width, 7 * 28);
  // A sucessora que começa seg 14/09 às 08:00 encosta na mesma borda.
  assert.equal(barSpanEdges('2026-09-14', '2026-09-18', RANGE, 'dia').left, it.right);
  // 5 dias corridos a partir de sex 04/09 às 08:00 terminam qua 09/09 às 08:00: cinco colunas.
  const elapsed = barSpanEdges('2026-09-04', '2026-09-09', RANGE, 'dia', 'start', 'start');
  assert.equal(elapsed.left, 11 * 28);
  assert.equal(elapsed.width, 5 * 28);
  // Começando às 17:00 (dias corridos depois de uma predecessora), a barra nasce na borda direita.
  assert.equal(barSpanEdges('2026-09-04', '2026-09-09', RANGE, 'dia', 'end', 'end').left, 12 * 28);
  // Começo e término na mesma borda ainda deixam 2 px à mostra.
  assert.equal(barSpanEdges('2026-09-14', '2026-09-14', RANGE, 'dia', 'start', 'start').width, 2);
  // Marco empurrado por TI fica no fim do dia; com data digitada, no começo.
  assert.equal(dayEdgeX('2026-09-29', 'end', RANGE, 'dia'), 37 * 28);
  assert.equal(dayEdgeX('2026-09-29', 'start', RANGE, 'dia'), 36 * 28);
});

test('tarefa dividida: trecho feito até o fim do stop, pontilhado e restante desde o resume', () => {
  const split = barSegments({ start: '2026-09-07', end: '2026-09-18', stop: '2026-09-08', resume: '2026-09-14' }, RANGE, 'dia');
  assert.deepEqual(split.segments, [
    { left: 14 * 28, right: 16 * 28, width: 2 * 28 },
    { left: 21 * 28, right: 26 * 28, width: 5 * 28 },
  ]);
  assert.deepEqual(split.gaps, [{ left: 16 * 28, right: 21 * 28 }]);
  // O restante respeita a borda do término.
  const itEnd = barSegments(
    { start: '2026-09-07', end: '2026-09-21', endEdge: 'start', stop: '2026-09-08', resume: '2026-09-14' },
    RANGE,
    'dia',
  );
  assert.equal(itEnd.segments[1].right, dateX('2026-09-21', RANGE, 'dia'));
  // Sem divisão válida, um trecho só, igual à barra inteira.
  const whole = barSpanEdges('2026-09-07', '2026-09-18', RANGE, 'dia');
  for (const extra of [
    {},
    { stop: '2026-09-08' },
    { stop: '2026-09-08', resume: 'nd' },
    { stop: '2026-09-10', resume: '2026-09-09' },
    { stop: '2026-09-01', resume: '2026-09-14' },
    { stop: '2026-09-08', resume: '2026-09-21' },
    { stop: '2026-09-08', resume: '2026-09-09' },
  ]) {
    const shape = barSegments({ start: '2026-09-07', end: '2026-09-18', ...extra }, RANGE, 'dia');
    assert.deepEqual(shape, { segments: [whole], gaps: [] }, JSON.stringify(extra));
  }
});

test('avanço enche os trechos sem contar a interrupção, e a alça volta ao mesmo %', () => {
  const single = barSegments({ start: '2026-08-24', end: '2026-08-28' }, RANGE, 'dia').segments;
  assert.deepEqual(progressFill(single, 40), [56]);
  assert.deepEqual(progressFill(single, 150), [140]);
  assert.deepEqual(progressFill(single, Number.NaN), [0]);
  assert.equal(progressX(single, 40), 56);
  assert.equal(progressX(single, 0), 0);
  assert.equal(progressAtX(56, single), 40);
  assert.equal(progressAtX(-10, single), 0);
  assert.equal(progressAtX(1000, single), 100);
  // Dividida: 56 px feitos + 140 px restantes; 50% são 98 px, 56 no primeiro trecho e 42 no segundo.
  const split = barSegments({ start: '2026-09-07', end: '2026-09-18', stop: '2026-09-08', resume: '2026-09-14' }, RANGE, 'dia').segments;
  assert.deepEqual(progressFill(split, 50), [56, 42]);
  assert.equal(progressX(split, 50), 21 * 28 + 42);
  assert.equal(progressAtX(21 * 28 + 42, split), 50);
  // Na interrupção, conta o trecho feito inteiro: 56 de 196 px.
  assert.equal(progressAtX(18 * 28, split), 29);
  assert.equal(progressX(split, 0), 14 * 28);
  assert.equal(progressAtX(0, []), 0);
});

test('dia sob o ponteiro e deslocamento em dias inteiros', () => {
  assert.equal(dateAtX(0, RANGE, 'dia'), '2026-08-24');
  assert.equal(dateAtX(27.9, RANGE, 'dia'), '2026-08-24');
  assert.equal(dateAtX(28, RANGE, 'dia'), '2026-08-25');
  assert.equal(dateAtX(-1, RANGE, 'dia'), '2026-08-23');
  assert.equal(dateAtX(7 * 6 + 3, RANGE, 'semana'), '2026-08-31');
  assert.equal(dayDelta(13, 'dia'), 0);
  assert.equal(dayDelta(15, 'dia'), 1);
  assert.equal(dayDelta(-15, 'dia'), -1);
  assert.ok(Object.is(dayDelta(-3, 'dia'), 0), 'sem -0');
  assert.equal(dayDelta(7 * 6, 'semana'), 7);
});

test('calendário: dia útil, encaixe para a frente e para trás e contagem de dias úteis', () => {
  const holiday = { weekdays: [1, 2, 3, 4, 5], holidays: ['2026-09-07'] };
  assert.equal(isWorkingDay('2026-09-05', holiday), false);
  assert.equal(isWorkingDay('2026-09-07', holiday), false);
  assert.equal(isWorkingDay('2026-09-08', holiday), true);
  // Sábado vai à terça (segunda é feriado); feriado para trás vai à sexta.
  assert.equal(snapToWorkingDay('2026-09-05', holiday, 1), '2026-09-08');
  assert.equal(snapToWorkingDay('2026-09-07', holiday, -1), '2026-09-04');
  assert.equal(snapToWorkingDay('2026-09-08', holiday, 1), '2026-09-08');
  // Sex 04 até qui 10, sem o dia 10: sexta, terça e quarta.
  assert.equal(workingDaysBetween('2026-09-04', '2026-09-10', holiday), 3);
  assert.equal(workingDaysBetween('2026-09-10', '2026-09-04', holiday), 0);
  assert.equal(addWorkingDays('2026-09-04', 1, holiday), '2026-09-08');
  assert.equal(addWorkingDays('2026-09-04', 0, holiday), '2026-09-04');
  assert.equal(spanDays('2026-09-04', '2026-09-08', holiday), 2);
  assert.equal(spanDays('2026-09-04', '2026-09-08', holiday, true), 5);
  assert.equal(spanDays('2026-09-08', '2026-09-04', holiday), 0);
  // Calendário sem dia útil não trava: devolve o próprio dia e anda em dias corridos.
  const none = { weekdays: [], holidays: [] };
  assert.equal(snapToWorkingDay('2026-09-05', none, 1), '2026-09-05');
  assert.equal(addWorkingDays('2026-09-05', 2, none), '2026-09-07');
});

test('mover encaixa o início em dia útil e mantém os dias trabalhados e a borda do término', () => {
  const task = { start: '2026-09-07', end: '2026-09-11', milestone: false }; // seg a sex
  assert.deepEqual(movedDates(task, 2, WEEK), { start: '2026-09-09', end: '2026-09-15', startEdge: 'start', endEdge: 'end' });
  // Solto no sábado: começa segunda, como o "Não iniciar antes de" agenda.
  assert.deepEqual(movedDates(task, 5, WEEK), { start: '2026-09-14', end: '2026-09-18', startEdge: 'start', endEdge: 'end' });
  assert.equal(movedDates(task, -1, WEEK).start, '2026-09-07');
  assert.equal(movedDates(task, -3, WEEK).start, '2026-09-04');
  // Sem deslocamento, nada muda, nem as bordas.
  assert.deepEqual(movedDates({ ...task, startEdge: 'end', endEdge: 'start' }, 0, WEEK), {
    start: '2026-09-07',
    end: '2026-09-11',
    startEdge: 'end',
    endEdge: 'start',
  });
  // Término às 08:00 (IT sem defasagem) continua às 08:00, cinco dias úteis depois do novo início.
  assert.deepEqual(movedDates({ start: '2026-09-07', end: '2026-09-14', endEdge: 'start', milestone: false }, 2, WEEK), {
    start: '2026-09-09',
    end: '2026-09-16',
    startEdge: 'start',
    endEdge: 'start',
  });
  // Dias corridos aceitam o sábado e andam o término em dias corridos.
  assert.deepEqual(movedDates({ start: '2026-09-04', end: '2026-09-09', endEdge: 'start', elapsed: true, milestone: false }, 1, WEEK), {
    start: '2026-09-05',
    end: '2026-09-10',
    startEdge: 'start',
    endEdge: 'start',
  });
  // Marco empurrado por TI (sex às 17:00) movido um dia: segunda às 08:00.
  assert.deepEqual(movedDates({ start: '2026-09-11', end: '2026-09-11', milestone: true, startEdge: 'end', endEdge: 'end' }, 1, WEEK), {
    start: '2026-09-14',
    end: '2026-09-14',
    startEdge: 'start',
    endEdge: 'start',
  });
});

test('esticar a ponta direita encaixa no dia mais próximo e volta ao último dia útil', () => {
  const task = { start: '2026-09-07', end: '2026-09-11' };
  const right = barSpanEdges(task.start, task.end, RANGE, 'dia').right; // borda entre sex 11 e sáb 12
  assert.equal(resizedEnd(task, right, RANGE, 'dia', WEEK), '2026-09-11');
  // Até o sábado: o término fica na sexta, porque no sábado não há trabalho.
  assert.equal(resizedEnd(task, right + 28, RANGE, 'dia', WEEK), '2026-09-11');
  assert.equal(resizedEnd(task, right + 3 * 28, RANGE, 'dia', WEEK), '2026-09-14');
  // Encaixe pela borda mais próxima: 13 px antes da borda da segunda ainda é segunda.
  assert.equal(resizedEnd(task, right + 3 * 28 - 13, RANGE, 'dia', WEEK), '2026-09-14');
  assert.equal(resizedEnd(task, right + 3 * 28 - 15, RANGE, 'dia', WEEK), '2026-09-11');
  // Nunca antes do início.
  assert.equal(resizedEnd(task, right - 10 * 28, RANGE, 'dia', WEEK), '2026-09-07');
  // Término às 08:00 de segunda: sem arrasto, o término equivalente é sexta às 17:00.
  assert.equal(resizedEnd({ start: '2026-09-07', end: '2026-09-14' }, 21 * 28, RANGE, 'dia', WEEK), '2026-09-11');
  assert.equal(resizedEnd({ start: '2026-09-07', end: '2026-09-14' }, 22 * 28, RANGE, 'dia', WEEK), '2026-09-14');
  // Dias corridos aceitam o domingo.
  assert.equal(resizedEnd({ start: '2026-09-04', end: '2026-09-09', elapsed: true }, 21 * 28, RANGE, 'dia', WEEK), '2026-09-13');
  // Dividida: nunca antes da retomada.
  assert.equal(
    resizedEnd({ start: '2026-09-07', end: '2026-09-18', stop: '2026-09-08', resume: '2026-09-14' }, 0, RANGE, 'dia', WEEK),
    '2026-09-14',
  );
});

test('modo do arrasto: sair da linha na vertical vincula, como no Project', () => {
  // A linha 1 vai de 30 a 60 px.
  assert.equal(dragModeAt('move', 45, 1, 30, true), 'move');
  assert.equal(dragModeAt('move', 29, 1, 30, true), 'link');
  assert.equal(dragModeAt('move', 60, 1, 30, true), 'link');
  assert.equal(dragModeAt('move', 90, 1, 30, false), 'move');
  assert.equal(dragModeAt('resize', 200, 1, 30, true), 'resize');
  assert.equal(dragModeAt('progress', -5, 1, 30, true), 'progress');
});

test('alvo do vínculo: barra da linha sob o ponteiro, sem resumo e sem a própria tarefa', () => {
  const list = [
    { id: 'a', summary: false },
    { id: 'r', summary: true },
    { id: 'b', summary: false },
  ];
  const bars = [
    { left: 0, right: 50 },
    { left: 0, right: 200 },
    { left: 100, right: 160 },
  ];
  assert.equal(linkTargetAt({ x: 120, y: 75 }, list, bars, 30, 'a'), 'b');
  assert.equal(linkTargetAt({ x: 90, y: 75 }, list, bars, 30, 'a'), 'b');
  assert.equal(linkTargetAt({ x: 172, y: 75 }, list, bars, 30, 'a'), 'b');
  assert.equal(linkTargetAt({ x: 80, y: 75 }, list, bars, 30, 'a'), undefined);
  assert.equal(linkTargetAt({ x: 20, y: 45 }, list, bars, 30, 'a'), undefined);
  assert.equal(linkTargetAt({ x: 20, y: 15 }, list, bars, 30, 'a'), undefined);
  assert.equal(linkTargetAt({ x: 20, y: -5 }, list, bars, 30, 'b'), undefined);
  assert.equal(linkTargetAt({ x: 120, y: 95 }, list, bars, 30, 'a'), undefined);
  assert.equal(linkTargetAt({ x: 20, y: 15 }, list, bars, 30, 'b'), 'a');
});

test('o que cada barra aceita arrastar', () => {
  const all = { canEdit: true, move: true, resize: true, progress: true, link: true };
  const none = { move: false, resize: false, progress: false, link: false };
  assert.deepEqual(barDragAbilities(row(), all), { move: true, resize: true, progress: true, link: true });
  assert.deepEqual(barDragAbilities(row({ summary: true }), all), none);
  assert.deepEqual(barDragAbilities(row(), { ...all, canEdit: false }), none);
  assert.deepEqual(barDragAbilities(row({ milestone: true }), all), { move: true, resize: false, progress: false, link: true });
  // Iniciada: o início real não se move; concluída: o término real não se estica.
  assert.deepEqual(barDragAbilities(row({ actualStart: '2026-08-24' }), all), { move: false, resize: true, progress: true, link: true });
  assert.deepEqual(barDragAbilities(row({ actualStart: '2026-08-24', actualEnd: '2026-10-09' }), all), {
    move: false,
    resize: false,
    progress: true,
    link: true,
  });
  // Cada ação exige o callback dela.
  assert.deepEqual(barDragAbilities(row(), { canEdit: true, link: true }), { ...none, link: true });
});

test('dica do arrasto no texto do Project', () => {
  assert.deepEqual(lines(dragTooltip({ mode: 'move', name: 'Alvenaria', start: '2026-09-14', end: '2026-09-18' })), [
    'Tarefa: Alvenaria',
    'Início: Seg 14/09/26',
    'Término: Sex 18/09/26',
  ]);
  assert.deepEqual(lines(dragTooltip({ mode: 'move', name: 'Vistoria', milestone: true, start: '2026-09-29' })), [
    'Marco: Vistoria',
    'Data: Ter 29/09/26',
  ]);
  assert.deepEqual(lines(dragTooltip({ mode: 'resize', name: 'Alvenaria', end: '2026-09-14', days: 6 })), [
    'Tarefa: Alvenaria',
    'Término: Seg 14/09/26',
    'Duração: 6 dias',
  ]);
  assert.equal(
    lines(dragTooltip({ mode: 'resize', name: 'Cura', end: '2026-09-14', days: 1, elapsed: true }))[2],
    'Duração: 1 dia corrido',
  );
  assert.deepEqual(lines(dragTooltip({ mode: 'progress', name: '  ', progress: 40 })), ['Tarefa: Sem nome', '% concluído: 40%']);
  const loose = dragTooltip({ mode: 'link', name: 'Alvenaria' });
  assert.deepEqual(lines(loose), ['Vínculo: Término-a-início (TI)', 'De: Alvenaria', 'Para: —']);
  assert.equal(loose.note, 'Solte sobre a barra da sucessora.');
  const target = dragTooltip({ mode: 'link', name: 'Alvenaria', target: 'Reboco' });
  assert.equal(lines(target)[2], 'Para: Reboco');
  assert.equal(target.note, undefined);
  assert.equal(dragTooltip({ mode: 'link', name: 'Alvenaria', target: 'Reboco', linked: true }).note, 'As duas já estão vinculadas.');
  const locked = dragTooltip({ mode: 'move', name: 'Alvenaria', locked: '2026-09-07' });
  assert.deepEqual(lines(locked), ['Tarefa: Alvenaria', 'Início real: Seg 07/09/26']);
  assert.match(locked.note ?? '', /início real não se arrasta/);
});

test('rolagem automática perto das bordas, proporcional à distância', () => {
  const viewport = { left: 0, top: 50, right: 500, bottom: 400 };
  assert.deepEqual(edgeScrollDelta({ x: 250, y: 200 }, viewport), { dx: 0, dy: 0 });
  assert.deepEqual(edgeScrollDelta({ x: 500, y: 200 }, viewport), { dx: 16, dy: 0 });
  assert.deepEqual(edgeScrollDelta({ x: 600, y: 200 }, viewport), { dx: 16, dy: 0 });
  assert.deepEqual(edgeScrollDelta({ x: 484, y: 200 }, viewport), { dx: 8, dy: 0 });
  assert.deepEqual(edgeScrollDelta({ x: 0, y: 50 }, viewport), { dx: -16, dy: -16 });
  assert.deepEqual(edgeScrollDelta({ x: 31.9, y: 200 }, viewport), { dx: 0, dy: 0 });
  assert.deepEqual(edgeScrollDelta({ x: 0, y: 400 }, viewport, { vertical: false }), { dx: -16, dy: 0 });
});

test('linha de folga com bordas: do fim da barra até a borda do término tardio', () => {
  // Término seg 14/09 às 08:00 e término tardio qua 16/09 às 08:00: dois dias de folga.
  const itRight = dateX('2026-09-14', RANGE, 'dia');
  assert.deepEqual(slackLine(itRight, '2026-09-16', RANGE, 'dia', 'start'), { left: itRight, width: 2 * 28 });
  // Com as bordas padrão, igual à slackSpan.
  const right = barSpan(RANGE, '2026-08-28', RANGE, 'dia').right;
  assert.deepEqual(slackLine(right, '2026-09-02', RANGE, 'dia'), slackSpan('2026-08-28', '2026-09-02', RANGE, 'dia'));
  // Folga zero, negativa, ausente ou inválida: nada.
  assert.equal(slackLine(right, '2026-08-28', RANGE, 'dia'), undefined);
  assert.equal(slackLine(right, '2026-08-26', RANGE, 'dia'), undefined);
  assert.equal(slackLine(right, undefined, RANGE, 'dia'), undefined);
  assert.equal(slackLine(right, 'nd', RANGE, 'dia'), undefined);
});

test('dica e rótulo acessível dizem a interrupção e os recursos', () => {
  assert.equal(
    ganttTooltip(
      row({
        start: '2026-09-07',
        end: '2026-09-18',
        actualStart: '2026-09-07',
        stop: '2026-09-08',
        resume: '2026-09-14',
        resourceLabel: 'Equipe Alvenaria',
      }),
    ),
    'Alvenaria · Seg 07/09/26 a Sex 18/09/26 · 40% · Real: iniciada em Seg 07/09/26 · Interrompida: trabalhou até Ter 08/09/26 e retoma em Seg 14/09/26 · Recursos: Equipe Alvenaria',
  );
  // Divisão inválida e recurso em branco não entram.
  assert.equal(ganttTooltip(row({ stop: '2026-09-08', resume: '2026-09-01', resourceLabel: '  ' })), ganttTooltip(row()));
  // Marco não se divide.
  assert.doesNotMatch(
    ganttTooltip(row({ milestone: true, start: '2026-09-07', end: '2026-09-07', stop: '2026-09-07', resume: '2026-09-08' })),
    /Interrompida/,
  );
});

test('avanço conta dias de trabalho: pula fins de semana, feriados e a pausa da dividida', () => {
  const scale = { rangeStart: RANGE, zoom: 'dia' as GanttZoom, calendar: WEEK };
  // Sex 11/09 a qui 17/09: cinco dias úteis em sete colunas (18 a 24).
  const bar = barSegments({ start: '2026-09-11', end: '2026-09-17' }, RANGE, 'dia').segments;
  // 40% são dois dias úteis, sexta e segunda: o avanço acaba no fim da segunda, não no domingo.
  assert.equal(progressX(bar, 40, scale), 22 * 28);
  assert.deepEqual(progressFill(bar, 40, scale), [4 * 28]);
  assert.ok(progressX(bar, 40) < 21 * 28, 'pelo comprimento, cairia no domingo');
  // 20% é só a sexta: não invade o fim de semana seguinte.
  assert.equal(progressX(bar, 20, scale), 19 * 28);
  // 50%: dois dias e meio, até o meio da terça.
  assert.equal(progressX(bar, 50, scale), 22 * 28 + 14);
  assert.equal(progressX(bar, 0, scale), 18 * 28);
  assert.equal(progressX(bar, 100, scale), 25 * 28);
  // A alça grava o mesmo %; sobre o fim de semana vale o que foi feito até sexta.
  assert.equal(progressAtX(22 * 28, bar, scale), 40);
  assert.equal(progressAtX(22 * 28 + 14, bar, scale), 50);
  assert.equal(progressAtX(19.5 * 28, bar, scale), 20);
  assert.equal(progressAtX(20.9 * 28, bar, scale), 20);
  // Feriado na segunda 14: quatro dias úteis; 40% são 1,6 dia, a sexta e 60% da terça.
  const holiday = { ...scale, calendar: { weekdays: [1, 2, 3, 4, 5], holidays: ['2026-09-14'] } };
  assert.ok(Math.abs(progressX(bar, 40, holiday) - (22 * 28 + 0.6 * 28)) < 1e-9);
  assert.equal(progressAtX(22 * 28, bar, holiday), 25);
  // Dias corridos contam o fim de semana: o mesmo que pelo comprimento.
  const elapsed = { ...scale, elapsed: true };
  assert.equal(progressX(bar, 40, elapsed), progressX(bar, 40));
  assert.equal(progressAtX(20 * 28, bar, elapsed), 29);
  // Término às 08:00 de segunda (a barra cobre o fim de semana): 80% vão até o fim de quinta e
  // 100% enchem a barra inteira.
  const itBar = barSegments({ start: '2026-09-07', end: '2026-09-14', endEdge: 'start' }, RANGE, 'dia').segments;
  assert.equal(progressX(itBar, 80, scale), 18 * 28);
  assert.deepEqual(progressFill(itBar, 100, scale), [7 * 28]);
  // Dividida: qui 10 a seg 14 feitos (três dias úteis em cinco colunas), pausa na terça, restante
  // qua 16 e qui 17. 60% são os três dias feitos: o primeiro trecho inteiro e nada do retomado.
  const split = barSegments({ start: '2026-09-10', end: '2026-09-17', stop: '2026-09-14', resume: '2026-09-16' }, RANGE, 'dia').segments;
  assert.deepEqual(progressFill(split, 60, scale), [5 * 28, 0]);
  assert.deepEqual(progressFill(split, 80, scale), [5 * 28, 28]);
  assert.equal(progressAtX(22 * 28 + 10, split, scale), 60);
  // Sem nenhum dia útil na barra (só o fim de semana), volta ao comprimento.
  const weekend = barSegments({ start: '2026-09-12', end: '2026-09-13' }, RANGE, 'dia').segments;
  assert.equal(progressX(weekend, 50, scale), 19 * 28 + 28);
});

test('folga fracionária com vírgula e até duas casas; inteira sem casas', () => {
  assert.match(ganttTooltip(row({ freeSlack: 17.375, totalSlack: 2.5 })), /Folga livre: 17,38 dias · Folga total: 2,5 dias$/);
  assert.match(ganttTooltip(row({ totalSlack: 1.001 })), /Folga total: 1 dia$/);
  assert.match(ganttTooltip(row({ totalSlack: -0.001 })), /Folga total: 0 dias$/);
  assert.match(ganttTooltip(row({ totalSlack: -1.25 })), /Folga total: -1,25 dias$/);
  assert.match(ganttTooltip(row({ totalSlack: 4 })), /Folga total: 4 dias$/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GANTT_DAY_PX,
  arrowHead,
  barSpan,
  barTone,
  dateX,
  deadlineLabel,
  deadlineX,
  ganttRange,
  ganttRowMetrics,
  ganttTooltip,
  layoutLinks,
  linkPoints,
  linkTone,
  milestoneX,
  monthLabel,
  nonWorkingRuns,
  shortDate,
  slackSpan,
  timescaleTiers,
  weekdayOf,
  type GanttRow,
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

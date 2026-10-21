import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  clampPanStart,
  clampProgress,
  dayNumber,
  edgeValue,
  estimateCalloutWidth,
  formatTimelineDate,
  formatTimelinePeriod,
  isIsoDate,
  itemSpan,
  layoutTimeline,
  milestoneFill,
  offDayRuns,
  panStartAt,
  placeCallouts,
  scrollTarget,
  tickLabel,
  tickTitle,
  tickUnit,
  timelineBarTone,
  timelineFrame,
  timelineItemLabel,
  timelineRange,
  timelineTicks,
  timelineValueAt,
  timelineX,
  type TimelineItem,
} from '../src/modules/medio-prazo/timeline-band';
import { DEFAULT_CALENDAR } from '../src/domain/plan-schedule';
import { CHART } from '../src/shared/palette';

const d = dayNumber;
const item = (overrides: Partial<TimelineItem> = {}): TimelineItem => ({
  id: 'a',
  name: 'Torre A',
  start: '2026-09-07',
  end: '2026-09-29',
  milestone: false,
  summary: false,
  progress: 0,
  ...overrides,
});
/** O exemplo do print do Project: Torre A, 4º e 5º pavimentos e dois marcos. */
const printItems = (): TimelineItem[] => [
  item({ id: 'torre', name: 'Torre A', summary: true, progress: 25 }),
  item({ id: 'p4', name: '4º pavimento', summary: true, progress: 40 }),
  item({ id: 'p5', name: '5º pavimento', summary: true, start: '2026-09-14' }),
  item({ id: 'laje', name: 'Liberação da laje 6º pav', milestone: true, start: '2026-09-18', end: '2026-09-18', startEdge: 'end' }),
  item({ id: 'vistoria', name: 'Vistoria 4º pav', milestone: true, start: '2026-09-29', end: '2026-09-29', startEdge: 'end' }),
];

test('datas no formato do Project: "Seg 07/09/26" e o período "início - término"', () => {
  assert.equal(formatTimelineDate('2026-09-07'), 'Seg 07/09/26');
  assert.equal(formatTimelineDate('2026-09-18'), 'Sex 18/09/26');
  assert.equal(formatTimelineDate('2026-09-29'), 'Ter 29/09/26');
  assert.equal(formatTimelineDate('2026-10-04'), 'Dom 04/10/26');
  assert.equal(formatTimelineDate(''), '');
  assert.equal(formatTimelinePeriod('2026-09-07', '2026-09-29'), 'Seg 07/09/26 - Ter 29/09/26');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(isIsoDate('2026-09-07'), true);
  assert.equal(isIsoDate('2026-9-7'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate(undefined), false);
});

test('ponta do dia: o começo é a borda esquerda do dia e o fim, a direita', () => {
  assert.equal(edgeValue('2026-09-07'), d('2026-09-07'));
  assert.equal(edgeValue('2026-09-07', 'start'), d('2026-09-07'));
  assert.equal(edgeValue('2026-09-07', 'end'), d('2026-09-08'));
});

test('posição da tarefa: barra entre as pontas, marco num ponto, dado ruim vira um dia ou fica fora', () => {
  assert.deepEqual(itemSpan(item()), { from: d('2026-09-07'), to: d('2026-09-30') });
  // Término no começo do dia: a barra acaba na borda esquerda dele.
  assert.deepEqual(itemSpan(item({ endEdge: 'start' })), { from: d('2026-09-07'), to: d('2026-09-29') });
  assert.deepEqual(itemSpan(item({ startEdge: 'end' })), { from: d('2026-09-08'), to: d('2026-09-30') });
  // Marco: na ponta de início; sem ela, na de término; sem nenhuma, no começo do dia.
  const at = { milestone: true, start: '2026-09-29', end: '2026-09-29' };
  assert.deepEqual(itemSpan(item({ ...at, startEdge: 'end' })), { from: d('2026-09-30'), to: d('2026-09-30') });
  assert.deepEqual(itemSpan(item({ ...at, endEdge: 'end' })), { from: d('2026-09-30'), to: d('2026-09-30') });
  assert.deepEqual(itemSpan(item(at)), { from: d('2026-09-29'), to: d('2026-09-29') });
  // Término antes do início (dado antigo): um dia.
  assert.deepEqual(itemSpan(item({ start: '2026-09-10', end: '2026-09-08' })), { from: d('2026-09-10'), to: d('2026-09-11') });
  assert.deepEqual(itemSpan(item({ end: 'sem data' })), { from: d('2026-09-07'), to: d('2026-09-08') });
  assert.equal(itemSpan(item({ start: '' })), undefined);
});

test('intervalo da faixa: o do projeto, sem folga, ampliado pelas tarefas que passam dele', () => {
  const project = { projectStart: '2026-09-07', projectFinish: '2026-09-29' };
  assert.deepEqual(timelineRange(printItems(), project), {
    from: d('2026-09-07'),
    to: d('2026-09-30'),
    start: '2026-09-07',
    finish: '2026-09-29',
  });
  // Sem itens, cobre o projeto.
  assert.deepEqual(timelineRange([], project), { from: d('2026-09-07'), to: d('2026-09-30'), start: '2026-09-07', finish: '2026-09-29' });
  // Tarefa além do projeto alarga a faixa; os rótulos continuam os do projeto.
  const wide = timelineRange([item({ end: '2026-10-02' })], project);
  assert.equal(wide.to, d('2026-10-03'));
  assert.equal(wide.finish, '2026-09-29');
});

test('intervalo da faixa sem projeto: tarefas, depois a janela do Gantt, depois quatro semanas a partir de hoje', () => {
  const items = [
    item({ id: 'b', start: '2026-09-14', end: '2026-09-18' }),
    item({ id: 'm', milestone: true, start: '2026-09-25', end: '2026-09-25' }),
  ];
  assert.deepEqual(timelineRange(items), { from: d('2026-09-14'), to: d('2026-09-25'), start: '2026-09-14', finish: '2026-09-25' });
  assert.deepEqual(timelineRange([], { visible: { start: '2026-10-01', end: '2026-10-20' } }), {
    from: d('2026-10-01'),
    to: d('2026-10-21'),
    start: '2026-10-01',
    finish: '2026-10-20',
  });
  assert.deepEqual(timelineRange([], { today: '2026-10-21' }), {
    from: d('2026-10-21'),
    to: d('2026-11-18'),
    start: '2026-10-21',
    finish: '2026-11-17',
  });
  // Um marco sozinho fica no meio de uma semana.
  const lone = timelineRange([item({ milestone: true, start: '2026-09-18', end: '2026-09-18' })]);
  assert.deepEqual(lone, { from: d('2026-09-15'), to: d('2026-09-22'), start: '2026-09-18', finish: '2026-09-18' });
});

test('escala: o intervalo inteiro cabe na largura', () => {
  const range = { from: 0, to: 10 };
  assert.equal(timelineX(0, range, 500), 0);
  assert.equal(timelineX(10, range, 500), 500);
  assert.equal(timelineX(2.5, range, 500), 125);
  assert.equal(timelineValueAt(125, range, 500), 2.5);
  assert.equal(timelineX(5, { from: 3, to: 3 }, 100), 0);
  assert.equal(timelineValueAt(50, range, 0), 0);
});

test('barras em linhas como no print: Torre A, 4º e 5º pavimentos empilhados; marcos fora das linhas', () => {
  const { entries, laneCount } = layoutTimeline(printItems());
  assert.equal(laneCount, 3);
  assert.deepEqual(
    entries.map(e => [e.item.id, e.kind, e.lane]),
    [
      ['torre', 'bar', 0],
      ['p4', 'bar', 1],
      ['p5', 'bar', 2],
      ['laje', 'milestone', -1],
      ['vistoria', 'milestone', -1],
    ],
  );
});

test('barras em linhas: só desce quem se sobrepõe; encostar não é sobrepor', () => {
  const lanes = (items: TimelineItem[]) => {
    const { entries, laneCount } = layoutTimeline(items);
    return { lanes: Object.fromEntries(entries.map(e => [e.item.id, e.lane])), laneCount };
  };
  // Sem sobreposição: a mesma linha.
  assert.deepEqual(lanes([item({ id: 'a', end: '2026-09-11' }), item({ id: 'b', start: '2026-09-14', end: '2026-09-18' })]), {
    lanes: { a: 0, b: 0 },
    laneCount: 1,
  });
  // Fim da sexta e começo do sábado se encostam; término no começo do dia também libera o dia.
  assert.deepEqual(lanes([item({ id: 'a', end: '2026-09-11' }), item({ id: 'b', start: '2026-09-12', end: '2026-09-18' })]).laneCount, 1);
  assert.deepEqual(
    lanes([item({ id: 'a', end: '2026-09-14', endEdge: 'start' }), item({ id: 'b', start: '2026-09-14', end: '2026-09-18' })]).laneCount,
    1,
  );
  // Um dia em comum: desce.
  assert.deepEqual(lanes([item({ id: 'a', end: '2026-09-14' }), item({ id: 'b', start: '2026-09-14', end: '2026-09-18' })]), {
    lanes: { a: 0, b: 1 },
    laneCount: 2,
  });
  // A primeira linha livre é reaproveitada, e a ordem da tabela não importa para o encaixe.
  assert.deepEqual(
    lanes([
      item({ id: 'c', start: '2026-09-14', end: '2026-09-18' }),
      item({ id: 'a', end: '2026-09-11' }),
      item({ id: 'b', start: '2026-09-09', end: '2026-09-20' }),
    ]),
    { lanes: { a: 0, b: 1, c: 0 }, laneCount: 2 },
  );
});

test('barras em linhas: ordem cronológica, sem repetidas e sem as que não têm data', () => {
  const { entries } = layoutTimeline([
    item({ id: 'tarde', start: '2026-09-20', end: '2026-09-22' }),
    item({ id: 'cedo', start: '2026-09-08', end: '2026-09-09' }),
    item({ id: 'cedo', start: '2026-09-01', end: '2026-09-30' }),
    item({ id: 'sem', start: '' }),
  ]);
  assert.deepEqual(
    entries.map(e => e.item.id),
    ['cedo', 'tarde'],
  );
  assert.equal(entries[0].from, d('2026-09-08'));
});

test('marcas da escala: a unidade depende da largura', () => {
  const month = { from: d('2026-09-07'), to: d('2026-09-30') };
  assert.equal(tickUnit(month, 700), 'week');
  assert.equal(tickUnit(month, 2000), 'day');
  const year = { from: d('2026-01-01'), to: d('2027-01-01') };
  assert.equal(tickUnit(year, 1000), 'month');
  assert.equal(tickUnit(year, 400), 'quarter');
  assert.equal(tickUnit(year, 100), 'year');
  assert.equal(tickUnit(year, 50), 'year');
  assert.equal(tickUnit(year, 0), 'week');
  assert.deepEqual(timelineTicks(month, 0).ticks, []);
});

test('marcas semanais: segundas por padrão, domingos com weekStartsOn 0, como no print do Project', () => {
  const range = { from: d('2026-09-07'), to: d('2026-09-30') };
  const monday = timelineTicks(range, 700);
  assert.equal(monday.unit, 'week');
  // 07/09 é a borda: só as marcas de dentro.
  assert.deepEqual(
    monday.ticks.map(t => t.label),
    ['14/Set/26', '21/Set/26', '28/Set/26'],
  );
  assert.equal(monday.ticks[0].title, 'Semana de Seg 14/09/26');
  const sunday = timelineTicks(range, 700, { weekStartsOn: 0 });
  assert.deepEqual(
    sunday.ticks.map(t => t.label),
    ['13/Set/26', '20/Set/26', '27/Set/26'],
  );
  const [a, b, c] = sunday.ticks;
  assert.equal(a.x, (6 / 23) * 700);
  assert.equal(a.room, b.x - a.x - 6);
  assert.equal(c.room, 700 - c.x - 6);
  assert.deepEqual(
    sunday.ticks.map(t => t.fits),
    [true, true, true],
  );
  // Faixa estreita: o rótulo da última marca não cabe até a borda e fica só o traço.
  assert.deepEqual(
    timelineTicks(range, 300).ticks.map(t => [t.label, t.fits]),
    [
      ['14/Set/26', true],
      ['21/Set/26', true],
      ['28/Set/26', false],
    ],
  );
});

test('marcas por mês e por trimestre só dentro da faixa', () => {
  const year = { from: d('2026-01-01'), to: d('2027-01-01') };
  const months = timelineTicks(year, 1000);
  assert.equal(months.unit, 'month');
  assert.equal(months.ticks.length, 11);
  assert.equal(months.ticks[0].label, 'Fev/26');
  assert.equal(months.ticks[0].title, 'Fevereiro de 2026');
  const quarters = timelineTicks(year, 400);
  assert.deepEqual(
    quarters.ticks.map(t => t.label),
    ['2º tri/26', '3º tri/26', '4º tri/26'],
  );
  assert.equal(tickLabel('2026-09-14', 'day'), 'Seg 14/09');
  assert.equal(tickLabel('2027-01-01', 'year'), '2027');
  assert.equal(tickTitle('2026-07-01', 'quarter'), '3º trimestre de 2026');
  assert.equal(tickTitle('2026-09-14', 'day'), 'Seg 14/09/26');
});

test('legendas dos marcos: centradas, presas nas bordas e em níveis quando se encostariam', () => {
  assert.deepEqual(
    placeCallouts([
      { id: 'b', x: 400, width: 80 },
      { id: 'a', x: 100, width: 80 },
    ]).map(p => [p.id, p.left, p.level]),
    [
      ['a', 60, 0],
      ['b', 360, 0],
    ],
  );
  // b encostaria em a e desce; c já cabe de novo no primeiro nível.
  assert.deepEqual(
    placeCallouts([
      { id: 'a', x: 100, width: 80 },
      { id: 'b', x: 150, width: 80 },
      { id: 'c', x: 200, width: 80 },
    ]).map(p => p.level),
    [0, 1, 0],
  );
  // Presa nas bordas permitidas.
  assert.equal(placeCallouts([{ id: 'v', x: 690, width: 100 }], { maxX: 700 })[0].left, 600);
  assert.equal(placeCallouts([{ id: 'i', x: 0, width: 100 }], { minX: -20 })[0].left, -20);
  assert.equal(placeCallouts([{ id: 'w', x: 50, width: 300 }], { minX: 0, maxX: 200 })[0].width, 200);
  // Passado o limite de níveis, volta ao que acaba mais cedo.
  assert.deepEqual(
    placeCallouts(
      ['a', 'b', 'c'].map(id => ({ id, x: 100, width: 80 })),
      { maxLevels: 2 },
    ).map(p => p.level),
    [0, 1, 0],
  );
  assert.equal(estimateCalloutWidth('Liberação da laje 6º pav', 'Sex 18/09/26'), 166);
  assert.equal(estimateCalloutWidth('A', 'Sex 18/09/26'), 82);
  assert.equal(estimateCalloutWidth('x'.repeat(60), 'Sex 18/09/26'), 180);
});

test('moldura: janela do Gantt na faixa, recortada nas bordas e escondida quando cobre tudo', () => {
  const range = { from: d('2026-09-07'), to: d('2026-09-30') };
  const width = 230; // 10 px por dia
  assert.deepEqual(timelineFrame({ start: '2026-09-14', end: '2026-09-20' }, range, width), {
    from: d('2026-09-14'),
    to: d('2026-09-21'),
    days: 7,
    left: 70,
    right: 140,
    clippedLeft: false,
    clippedRight: false,
    covers: false,
  });
  const before = timelineFrame({ start: '2026-09-01', end: '2026-09-10' }, range, width)!;
  assert.equal(before.clippedLeft, true);
  assert.equal(before.left, 0);
  assert.equal(before.right, 40);
  assert.equal(timelineFrame({ start: '2026-09-01', end: '2026-10-10' }, range, width)!.covers, true);
  // Inteira fora: vira um traço na borda.
  const after = timelineFrame({ start: '2026-10-05', end: '2026-10-10' }, range, width)!;
  assert.deepEqual([after.left, after.right, after.clippedRight], [226, 230, true]);
  const earlier = timelineFrame({ start: '2026-08-20', end: '2026-08-25' }, range, width)!;
  assert.deepEqual([earlier.left, earlier.right], [0, 4]);
  assert.equal(timelineFrame({ start: '2026-09-20', end: '2026-09-14' }, range, width)!.days, 1);
  assert.equal(timelineFrame(undefined, range, width), undefined);
  assert.equal(timelineFrame({ start: 'x', end: '2026-09-14' }, range, width), undefined);
});

test('rolar pelo Gantt: a janela fica dentro da faixa e o clique centraliza nela', () => {
  const range = { from: 0, to: 23 };
  assert.equal(clampPanStart(-3, 7, range), 0);
  assert.equal(clampPanStart(20, 7, range), 16);
  assert.equal(clampPanStart(5.4, 7, range), 5);
  assert.equal(clampPanStart(5, 30, range), 0);
  assert.equal(panStartAt(10, 7, range), 7);
  assert.equal(panStartAt(1, 7, range), 0);
  assert.equal(panStartAt(22.5, 7, range), 16);
  assert.equal(scrollTarget({ start: '2026-09-14' }), '2026-09-13');
});

test('dias não úteis: fins de semana e feriados viram blocos contínuos', () => {
  const range = { from: d('2026-09-07'), to: d('2026-09-21') };
  assert.deepEqual(offDayRuns(range, DEFAULT_CALENDAR), [
    { from: d('2026-09-12'), to: d('2026-09-14') },
    { from: d('2026-09-19'), to: d('2026-09-21') },
  ]);
  // 07/09 é feriado; o feriado na sexta emenda com o fim de semana.
  assert.deepEqual(offDayRuns(range, { ...DEFAULT_CALENDAR, holidays: ['2026-09-07', '2026-09-11'] }), [
    { from: d('2026-09-07'), to: d('2026-09-08') },
    { from: d('2026-09-11'), to: d('2026-09-14') },
    { from: d('2026-09-19'), to: d('2026-09-21') },
  ]);
});

test('cores: azul de planejado com a parte concluída mais cheia; crítica no vermelho; marco escuro', () => {
  assert.deepEqual(timelineBarTone({}), {
    fill: `color-mix(in srgb, ${CHART.planned} 16%, white)`,
    progress: `color-mix(in srgb, ${CHART.planned} 42%, white)`,
    border: `color-mix(in srgb, ${CHART.planned} 62%, white)`,
  });
  assert.equal(timelineBarTone({ critical: true }).progress, `color-mix(in srgb, ${CHART.late} 42%, white)`);
  assert.equal(milestoneFill({}), CHART.ink);
  assert.equal(milestoneFill({ critical: true }), CHART.late);
  assert.deepEqual([clampProgress(140), clampProgress(-5), clampProgress(Number.NaN), clampProgress(42.6)], [100, 0, 0, 43]);
});

test('rótulo acessível: tipo, nome, período, avanço e criticidade, tudo em texto', () => {
  assert.equal(
    timelineItemLabel(item({ name: 'Alvenaria 4º pav', end: '2026-09-11', progress: 40, critical: true })),
    'Tarefa: Alvenaria 4º pav · Seg 07/09/26 - Sex 11/09/26 · 40% concluída · Crítica',
  );
  assert.equal(timelineItemLabel(item({ summary: true })), 'Resumo: Torre A · Seg 07/09/26 - Ter 29/09/26 · 0% concluída');
  assert.equal(timelineItemLabel(printItems()[3]), 'Marco: Liberação da laje 6º pav · Sex 18/09/26');
  assert.equal(timelineItemLabel(item({ name: '  ', end: '2026-09-01' })), 'Tarefa: Sem nome · Seg 07/09/26 - Seg 07/09/26 · 0% concluída');
});

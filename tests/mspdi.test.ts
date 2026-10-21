import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMspdi, escapeXml, journeyFor, xsdDuration, tenthsOfMinutes } from '../src/domain/mspdi';
import { DEFAULT_CALENDAR, analyzeSchedule, endFor, parseDuration, type WorkCalendar } from '../src/domain/plan-schedule';
import type { LinkType, MediumTermPlan, PlanDependency, PlanTask } from '../src/domain/entities';

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-02T15:30:00Z' };
const calendar: WorkCalendar = { ...DEFAULT_CALENDAR, holidays: ['2026-09-07'] };
const task = (id: string, order: number, level: number, start: string, duration: string, extra: Partial<PlanTask> = {}): PlanTask => ({
  id,
  ...stamp,
  planId: 'p',
  name: id,
  plannedStart: start,
  plannedEnd: endFor(start, parseDuration(duration), calendar).end,
  duration: parseDuration(duration),
  level,
  order,
  progress: 0,
  ...extra,
});
const link = (
  id: string,
  predecessorId: string,
  successorId: string,
  type: LinkType,
  lagDays: number,
  lagBusiness = true,
): PlanDependency => ({
  id,
  ...stamp,
  predecessorId,
  successorId,
  type,
  lagDays,
  lagBusiness,
});
const plan: MediumTermPlan = { id: 'plan', ...stamp, workId: 'w', month: '2026-09', name: 'Setembro', createdBy: 'u' };
const tasks: PlanTask[] = [
  task('r', 1, 0, '2026-09-01', '1d', { name: 'Resumo & Estrutura' }),
  task('a', 2, 1, '2026-09-01', '2d', { notes: 'Ver <projeto> "A" & B' }),
  task('b', 3, 1, '2026-09-01', '2dd'),
  task('c', 4, 1, '2026-09-01', '3d'),
  task('m', 5, 1, '2026-09-01', '0d'),
  task('snet', 6, 0, '2026-09-10', '1d', { constraintType: 'SNET', constraintDate: '2026-09-10' }),
  task('snlt', 7, 0, '2026-09-10', '1d', { constraintType: 'SNLT', constraintDate: '2026-09-10' }),
  task('fnet', 8, 0, '2026-09-15', '1d', { constraintType: 'FNET', constraintDate: '2026-09-15' }),
  task('fnlt', 9, 0, '2026-09-15', '1d', { constraintType: 'FNLT', constraintDate: '2026-09-15' }),
  task('mso', 10, 0, '2026-09-14', '1d', { constraintType: 'MSO', constraintDate: '2026-09-14' }),
  task('mfo', 11, 0, '2026-09-18', '1d', { constraintType: 'MFO', constraintDate: '2026-09-18' }),
  task('alap', 12, 0, '2026-09-01', '1d', { constraintType: 'ALAP' }),
  task('antigo', 13, 0, '2026-09-01', '1d', { anchorStart: '2026-09-09' }),
  task('dl', 14, 0, '2026-09-01', '2d', { deadline: '2026-09-30' }),
  task('half', 15, 0, '2026-09-08', '4d', { progress: 50, actualStart: '2026-09-08' }),
  task('done', 16, 0, '2026-09-01', '3d', { progress: 100, actualStart: '2026-09-01', actualEnd: '2026-09-03' }),
  task('hrs', 17, 0, '2026-09-01', '16h'),
  task('mes', 18, 0, '2026-09-01', '1mês'),
];
const links: PlanDependency[] = [link('l1', 'a', 'b', 'TI', 2), link('l2', 'a', 'c', 'II', 1, false), link('l3', 'a', 'm', 'TT', -1)];
const baseline = new Map([['a', { start: '2026-08-31', end: '2026-09-01' }]]);
const build = (c: WorkCalendar = calendar) =>
  buildMspdi({ plan, tasks, links, calendar: c, analysis: analyzeSchedule(tasks, links, c), workName: 'Obra Teste', baseline });

// ————— Mini leitor do XML: blocos por tag e campos escalares —————
const blocks = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))].map(m => m[1]);
const field = (block: string, tag: string) => block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1];
const fields = (block: string, tag: string) => [...block.matchAll(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g'))].map(m => m[1]);
const taskNamed = (xml: string, name: string) => {
  const found = blocks(xml, 'Task').find(t => field(t, 'Name') === name);
  assert.ok(found, `tarefa ${name} não encontrada`);
  return found;
};
/** As tags aparecem nessa ordem (as ausentes são ignoradas). */
const assertOrder = (block: string, tags: string[]) => {
  const present = tags.filter(tag => block.includes(`<${tag}>`));
  const positions = present.map(tag => block.indexOf(`<${tag}>`));
  assert.deepEqual(
    positions,
    positions.slice().sort((x, y) => x - y),
    `ordem errada em ${present.join(' → ')}`,
  );
};
function assertWellFormed(xml: string) {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w]*)[^<>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) assert.equal(stack.pop(), m[2], `fechamento de ${m[2]} fora de ordem`);
    else stack.push(m[2]);
  }
  assert.deepEqual(stack, []);
  assert.doesNotMatch(body, /&(?!(amp|lt|gt|quot|apos);)/);
  assert.doesNotMatch(body.replace(/<[^<>]*>/g, ''), /[<>]/);
}

test('declaração, namespace, cabeçalho na ordem do XSD e XML bem formado', () => {
  const xml = build();
  assert.ok(
    xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n'),
  );
  assert.ok(xml.endsWith('</Project>\n'));
  assertWellFormed(xml);
  assertOrder(xml, [
    'SaveVersion',
    'Name',
    'Title',
    'CreationDate',
    'LastSaved',
    'ScheduleFromStart',
    'StartDate',
    'FinishDate',
    'CriticalSlackLimit',
    'CurrencySymbol',
    'CurrencyCode',
    'CalendarUID',
    'DefaultStartTime',
    'DefaultFinishTime',
    'MinutesPerDay',
    'MinutesPerWeek',
    'DaysPerMonth',
    'DurationFormat',
    'WorkFormat',
    'WeekStartDay',
    'NewTasksAreManual',
    'Calendars',
    'Tasks',
  ]);
  const header = xml.slice(0, xml.indexOf('<Calendars>'));
  assert.equal(field(header, 'SaveVersion'), '14');
  assert.equal(field(header, 'Name'), 'Obra Teste · Setembro');
  assert.equal(field(header, 'Title'), 'Obra Teste · Setembro');
  assert.equal(field(header, 'CreationDate'), '2026-09-01T12:00:00');
  assert.equal(field(header, 'StartDate'), '2026-09-01T08:00:00');
  assert.ok(field(header, 'FinishDate')!.endsWith('T17:00:00'));
  assert.equal(field(header, 'CurrencyCode'), 'BRL');
  assert.equal(field(header, 'CurrencySymbol'), 'R$');
  assert.equal(field(header, 'MinutesPerDay'), '480');
  assert.equal(field(header, 'MinutesPerWeek'), '2400');
  assert.equal(field(header, 'DaysPerMonth'), '20');
  assert.equal(field(header, 'DefaultStartTime'), '08:00:00');
  assert.equal(field(header, 'DefaultFinishTime'), '17:00:00');
  assert.ok(xml.includes('  <OutlineCodes/>\n'));
  assert.ok(!xml.includes('<Resources'), 'recursos ficam para a próxima etapa');
});

test('UID e ID sequenciais na ordem do plano; EAP e nível do resumo e dos filhos', () => {
  const xml = build();
  const all = blocks(xml, 'Task');
  assert.equal(all.length, tasks.length);
  assert.deepEqual(
    all.map(t => field(t, 'UID')),
    tasks.map((_, i) => String(i + 1)),
  );
  assert.deepEqual(
    all.map(t => field(t, 'ID')),
    all.map(t => field(t, 'UID')),
  );
  const summary = taskNamed(xml, 'Resumo &amp; Estrutura');
  assert.equal(field(summary, 'Summary'), '1');
  assert.equal(field(summary, 'OutlineLevel'), '1');
  assert.equal(field(summary, 'OutlineNumber'), '1');
  assert.equal(field(summary, 'WBS'), '1');
  assert.equal(field(summary, 'ConstraintType'), '0');
  assert.equal(field(summary, 'Milestone'), '0');
  assert.equal(field(summary, 'Start'), '2026-09-01T08:00:00');
  assert.equal(field(summary, 'DurationFormat'), '7');
  for (const [name, number] of [
    ['a', '1.1'],
    ['b', '1.2'],
    ['c', '1.3'],
    ['m', '1.4'],
  ]) {
    const t = taskNamed(xml, name);
    assert.equal(field(t, 'OutlineLevel'), '2');
    assert.equal(field(t, 'OutlineNumber'), number);
    assert.equal(field(t, 'WBS'), number);
    assert.equal(field(t, 'Summary'), '0');
  }
  assert.equal(field(taskNamed(xml, 'snet'), 'OutlineNumber'), '2');
  assert.equal(field(taskNamed(xml, 'snet'), 'OutlineLevel'), '1');
  assertOrder(taskNamed(xml, 'b'), [
    'UID',
    'ID',
    'Name',
    'Active',
    'Manual',
    'Type',
    'IsNull',
    'WBS',
    'OutlineNumber',
    'OutlineLevel',
    'Priority',
    'Start',
    'Finish',
    'Duration',
    'DurationFormat',
    'Estimated',
    'Milestone',
    'Summary',
    'Critical',
    'EarlyStart',
    'EarlyFinish',
    'LateStart',
    'LateFinish',
    'FreeSlack',
    'TotalSlack',
    'StartSlack',
    'FinishSlack',
    'PercentComplete',
    'ActualDuration',
    'RemainingDuration',
    'ConstraintType',
    'CalendarUID',
    'PredecessorLink',
  ]);
  assertOrder(taskNamed(xml, 'a'), [
    'LateFinish',
    'StartVariance',
    'FinishVariance',
    'FreeSlack',
    'PercentComplete',
    'ConstraintType',
    'Notes',
    'Baseline',
  ]);
  assertOrder(taskNamed(xml, 'done'), [
    'PercentComplete',
    'ActualStart',
    'ActualFinish',
    'ActualDuration',
    'RemainingDuration',
    'ConstraintType',
  ]);
});

test('durações em horas do Project: dias úteis, corridos, horas, meses e marco', () => {
  const xml = build();
  const a = taskNamed(xml, 'a');
  assert.equal(field(a, 'Start'), '2026-09-01T08:00:00');
  assert.equal(field(a, 'Finish'), '2026-09-02T17:00:00');
  assert.equal(field(a, 'Duration'), 'PT16H0M0S');
  assert.equal(field(a, 'DurationFormat'), '7');
  assert.equal(field(a, 'Active'), '1');
  assert.equal(field(a, 'Manual'), '0');
  assert.equal(field(a, 'Type'), '0');
  const b = taskNamed(xml, 'b');
  assert.equal(field(b, 'Duration'), 'PT48H0M0S');
  assert.equal(field(b, 'DurationFormat'), '8');
  const m = taskNamed(xml, 'm');
  assert.equal(field(m, 'Duration'), 'PT0H0M0S');
  assert.equal(field(m, 'Milestone'), '1');
  assert.equal(field(m, 'Start'), field(m, 'Finish'));
  assert.ok(field(m, 'Start')!.endsWith('T17:00:00'));
  const hrs = taskNamed(xml, 'hrs');
  assert.equal(field(hrs, 'Duration'), 'PT16H0M0S');
  assert.equal(field(hrs, 'DurationFormat'), '5');
  const mes = taskNamed(xml, 'mes');
  assert.equal(field(mes, 'Duration'), 'PT160H0M0S');
  assert.equal(field(mes, 'DurationFormat'), '7');
  assert.equal(xsdDuration(8.8), 'PT8H48M0S');
  assert.equal(xsdDuration(0), 'PT0H0M0S');
});

test('vínculos: códigos TI/II/TT/IT e defasagem em décimos de minuto, úteis ou decorridos', () => {
  const xml = build();
  const [toB] = blocks(taskNamed(xml, 'b'), 'PredecessorLink');
  assert.equal(field(toB, 'PredecessorUID'), '2');
  assert.equal(field(toB, 'Type'), '1');
  assert.equal(field(toB, 'CrossProject'), '0');
  assert.equal(field(toB, 'LinkLag'), '9600');
  assert.equal(field(toB, 'LagFormat'), '7');
  assertOrder(toB, ['PredecessorUID', 'Type', 'CrossProject', 'LinkLag', 'LagFormat']);
  const [toC] = blocks(taskNamed(xml, 'c'), 'PredecessorLink');
  assert.equal(field(toC, 'Type'), '3');
  assert.equal(field(toC, 'LinkLag'), '14400');
  assert.equal(field(toC, 'LagFormat'), '8');
  const [toM] = blocks(taskNamed(xml, 'm'), 'PredecessorLink');
  assert.equal(field(toM, 'Type'), '0');
  assert.equal(field(toM, 'LinkLag'), '-4800');
  assert.equal(field(toM, 'LagFormat'), '7');
  assert.equal(blocks(taskNamed(xml, 'a'), 'PredecessorLink').length, 0);
  assert.equal(tenthsOfMinutes(1.5, 8), 7200);
});

test('restrições com data, prazo final, datas reais, % concluída e folgas', () => {
  const xml = build();
  const analysis = analyzeSchedule(tasks, links, calendar);
  for (const [name, code, date] of [
    ['snet', '4', '2026-09-10T08:00:00'],
    ['snlt', '5', '2026-09-10T08:00:00'],
    ['fnet', '6', '2026-09-15T17:00:00'],
    ['fnlt', '7', '2026-09-15T17:00:00'],
    ['mso', '2', '2026-09-14T08:00:00'],
    ['mfo', '3', '2026-09-18T17:00:00'],
    ['antigo', '4', '2026-09-09T08:00:00'],
  ]) {
    const t = taskNamed(xml, name);
    assert.equal(field(t, 'ConstraintType'), code, name);
    assert.equal(field(t, 'ConstraintDate'), date, name);
    assertOrder(t, ['ConstraintType', 'CalendarUID', 'ConstraintDate']);
  }
  const alap = taskNamed(xml, 'alap');
  assert.equal(field(alap, 'ConstraintType'), '1');
  assert.equal(field(alap, 'ConstraintDate'), undefined);
  assert.equal(field(taskNamed(xml, 'a'), 'ConstraintType'), '0');
  assert.equal(field(taskNamed(xml, 'a'), 'ConstraintDate'), undefined);
  const dl = taskNamed(xml, 'dl');
  assert.equal(field(dl, 'Deadline'), '2026-09-30T17:00:00');
  assertOrder(dl, ['ConstraintType', 'CalendarUID', 'Deadline']);
  const half = taskNamed(xml, 'half');
  assert.equal(field(half, 'PercentComplete'), '50');
  assert.equal(field(half, 'ActualStart'), '2026-09-08T08:00:00');
  assert.equal(field(half, 'ActualFinish'), undefined);
  assert.equal(field(half, 'ActualDuration'), 'PT16H0M0S');
  assert.equal(field(half, 'RemainingDuration'), 'PT16H0M0S');
  const done = taskNamed(xml, 'done');
  assert.equal(field(done, 'PercentComplete'), '100');
  assert.equal(field(done, 'ActualStart'), '2026-09-01T08:00:00');
  assert.equal(field(done, 'ActualFinish'), '2026-09-03T17:00:00');
  assert.equal(field(done, 'RemainingDuration'), 'PT0H0M0S');
  assert.equal(field(done, 'Critical'), '0');
  // Folgas em décimos de minuto: dias úteis × 8 h × 60 × 10 (a tarefa em dias corridos, `b`, em
  // dias de 24 h, como o Project guarda), e as datas cedo/tardias do motor na ponta do dia certa.
  for (const name of ['a', 'b', 'c', 'm', 'dl', 'alap', 'half']) {
    const t = taskNamed(xml, name),
      info = analysis.info.get(name)!;
    const perDay = name === 'b' ? 14400 : 4800;
    assert.equal(field(t, 'TotalSlack'), String(Math.round(info.totalSlack * perDay)), name);
    assert.equal(field(t, 'FreeSlack'), String(Math.round(info.freeSlack * perDay)), name);
    assert.match(field(t, 'StartSlack')!, /^-?\d+$/);
    assert.match(field(t, 'FinishSlack')!, /^-?\d+$/);
    assert.equal(field(t, 'EarlyStart')!.slice(0, 10), info.earlyStart, name);
    assert.equal(field(t, 'LateFinish'), `${info.lateFinish}T${info.edges.lateFinish === 'start' ? '08' : '17'}:00:00`, name);
    assert.equal(field(t, 'Critical'), info.critical ? '1' : '0', name);
  }
  assert.equal(field(taskNamed(xml, 'dl'), 'TotalSlack'), String(analysis.info.get('dl')!.totalSlack * 4800));
  assert.ok(Number(field(taskNamed(xml, 'dl'), 'TotalSlack')) > 0, 'prazo final folgado dá folga positiva');
});

test('calendário: semana, horários, feriado nos dois formatos e linha de base com variação', () => {
  const xml = build();
  const [cal] = blocks(xml, 'Calendar');
  assertOrder(cal, ['UID', 'Name', 'IsBaseCalendar', 'IsBaselineCalendar', 'BaseCalendarUID', 'WeekDays', 'Exceptions']);
  assert.equal(field(cal, 'UID'), '1');
  assert.equal(field(cal, 'Name'), 'Padrão');
  assert.equal(field(cal, 'IsBaseCalendar'), '1');
  assert.equal(field(cal, 'BaseCalendarUID'), '-1');
  const days = blocks(cal, 'WeekDay');
  assert.equal(days.length, 8, 'sete dias da semana e um feriado no formato legado');
  assert.deepEqual(
    days.slice(0, 7).map(d => `${field(d, 'DayType')}:${field(d, 'DayWorking')}`),
    ['1:0', '2:1', '3:1', '4:1', '5:1', '6:1', '7:0'],
  );
  assert.deepEqual(fields(days[1], 'FromTime'), ['08:00:00', '13:00:00']);
  assert.deepEqual(fields(days[1], 'ToTime'), ['12:00:00', '17:00:00']);
  assert.equal(days[0].includes('WorkingTimes'), false);
  const legacy = days[7];
  assert.equal(field(legacy, 'DayType'), '0');
  assert.equal(field(legacy, 'DayWorking'), '0');
  assert.equal(field(legacy, 'FromDate'), '2026-09-07T00:00:00');
  assert.equal(field(legacy, 'ToDate'), '2026-09-07T23:59:59');
  const [exception] = blocks(cal, 'Exception');
  assertOrder(exception, ['EnteredByOccurrences', 'TimePeriod', 'Occurrences', 'Name', 'Type', 'DayWorking']);
  assert.equal(field(exception, 'FromDate'), '2026-09-07T00:00:00');
  assert.equal(field(exception, 'Name'), 'Feriado 07/09/2026');
  assert.equal(field(exception, 'Type'), '1');
  assert.equal(field(exception, 'DayWorking'), '0');
  assert.equal(field(exception, 'Occurrences'), '1');
  // Sem feriado, nada de `Exceptions`; feriados repetidos e fora de ordem saem únicos e ordenados.
  assert.ok(!build({ ...calendar, holidays: [] }).includes('<Exceptions>'));
  const ordered = build({ ...calendar, holidays: ['2026-11-02', '2026-09-07', '2026-11-02'] });
  assert.deepEqual(
    blocks(ordered, 'Exception').map(e => field(e, 'FromDate')),
    ['2026-09-07T00:00:00', '2026-11-02T00:00:00'],
  );
  const a = taskNamed(xml, 'a');
  const [base] = blocks(a, 'Baseline');
  assert.ok(base, 'tarefa com linha de base leva Baseline');
  assertOrder(base, ['Number', 'Start', 'Finish', 'Duration', 'DurationFormat']);
  assert.equal(field(base, 'Number'), '0');
  assert.equal(field(base, 'Start'), '2026-08-31T08:00:00');
  assert.equal(field(base, 'Finish'), '2026-09-01T17:00:00');
  assert.equal(field(base, 'Duration'), 'PT16H0M0S');
  assert.equal(field(base, 'DurationFormat'), '7');
  assert.equal(field(a, 'StartVariance'), '4800');
  assert.equal(field(a, 'FinishVariance'), '4800');
  const b = taskNamed(xml, 'b');
  assert.equal(blocks(b, 'Baseline').length, 0);
  assert.equal(field(b, 'StartVariance'), undefined);
});

test('escapa &, <, > e aspas no nome e nas anotações', () => {
  const xml = build();
  assert.ok(xml.includes('<Name>Resumo &amp; Estrutura</Name>'));
  assert.equal(field(taskNamed(xml, 'a'), 'Notes'), 'Ver &lt;projeto&gt; &quot;A&quot; &amp; B');
  assert.equal(escapeXml('a\u0000b<c>&"d"'), 'ab&lt;c&gt;&amp;&quot;d&quot;');
  assertWellFormed(xml);
});

test('jornada de 9 h: tarde até 18:00, minutos por dia e semana, durações e defasagens', () => {
  const c = { ...calendar, hoursPerDay: 9 };
  const xml = build(c);
  const header = xml.slice(0, xml.indexOf('<Calendars>'));
  assert.equal(field(header, 'DefaultFinishTime'), '18:00:00');
  assert.equal(field(header, 'MinutesPerDay'), '540');
  assert.equal(field(header, 'MinutesPerWeek'), '2700');
  assert.ok(field(header, 'FinishDate')!.endsWith('T18:00:00'));
  const [cal] = blocks(xml, 'Calendar');
  assert.deepEqual(fields(blocks(cal, 'WeekDay')[1], 'ToTime'), ['12:00:00', '18:00:00']);
  const a = taskNamed(xml, 'a');
  assert.equal(field(a, 'Finish'), '2026-09-02T18:00:00');
  assert.equal(field(a, 'Duration'), 'PT18H0M0S');
  assert.equal(field(a, 'StartVariance'), '5400');
  const [toB] = blocks(taskNamed(xml, 'b'), 'PredecessorLink');
  assert.equal(field(toB, 'LinkLag'), '10800');
  const [toC] = blocks(taskNamed(xml, 'c'), 'PredecessorLink');
  assert.equal(field(toC, 'LinkLag'), '14400', 'dias corridos não dependem da jornada');
  assert.equal(field(taskNamed(xml, 'm'), 'Start'), field(taskNamed(xml, 'm'), 'Finish'));
  assert.ok(field(taskNamed(xml, 'm'), 'Start')!.endsWith('T18:00:00'));
  assert.deepEqual(journeyFor(4).ranges, [['08:00:00', '12:00:00']]);
  assert.equal(journeyFor(8.5).finishTime, '17:30:00');
  assert.equal(journeyFor(12).finishTime, '21:00:00');
  assert.equal(journeyFor(16).finishTime, '23:59:00', 'acima de 15 h não cabe nas duas faixas do dia');
});

test('resumo com filhos iniciados e concluídos carrega as datas reais e o % do envelope', () => {
  const rows = [
    task('r', 1, 0, '2026-09-01', '1d'),
    task('x', 2, 1, '2026-09-01', '2d', { progress: 100, actualStart: '2026-09-01', actualEnd: '2026-09-02' }),
    task('y', 3, 1, '2026-09-03', '2d'),
  ];
  const xml = buildMspdi({ plan: { ...plan, name: '' }, tasks: rows, links: [], calendar, analysis: analyzeSchedule(rows, [], calendar) });
  const header = xml.slice(0, xml.indexOf('<Calendars>'));
  assert.equal(field(header, 'Name'), 'Plano');
  const r = taskNamed(xml, 'r');
  assert.equal(field(r, 'Summary'), '1');
  assert.equal(field(r, 'Start'), '2026-09-01T08:00:00');
  assert.equal(field(r, 'Finish'), '2026-09-04T17:00:00');
  assert.equal(field(r, 'Duration'), 'PT32H0M0S');
  assert.equal(field(r, 'PercentComplete'), '50');
  assert.equal(field(r, 'ActualStart'), '2026-09-01T08:00:00');
  assert.equal(field(r, 'ActualFinish'), undefined, 'o resumo só termina quando todos os filhos terminam');
  assert.equal(field(r, 'Critical'), '1');
  assertWellFormed(xml);
});

test('Project real: sem HonorConstraints, início do projeto nas tarefas sem predecessora e NIAD para quem começa depois', () => {
  // Medido no Project 2019 (docs/engenharia-reversa-project.md): <HonorConstraints>1 desliga a
  // opção; o <StartDate> é para onde vai toda tarefa "o mais breve possível" sem predecessora.
  const rows = [
    task('a', 1, 0, '2026-09-07', '2d'),
    task('b', 2, 0, '2026-09-07', '3d'),
    task('p', 3, 0, '2026-09-09', '2d'),
    task('m', 4, 0, '2026-09-11', '0d', { constraintType: 'SNET', constraintDate: '2026-09-11' }),
  ];
  const it = [link('l1', 'a', 'b', 'IT', 0)];
  // Calendário sem o feriado de 07/09 que o resto deste arquivo usa.
  const xml = buildMspdi({
    plan,
    tasks: rows,
    links: it,
    calendar: DEFAULT_CALENDAR,
    analysis: analyzeSchedule(rows, it, DEFAULT_CALENDAR),
  });
  const header = xml.slice(0, xml.indexOf('<Calendars>'));
  assert.equal(field(header, 'HonorConstraints'), undefined);
  // `b` (3 dias) é puxada por IT para 02/09, antes de `a`; o início do projeto continua sendo o de `a`.
  assert.equal(field(header, 'StartDate'), '2026-09-07T08:00:00');
  const b = taskNamed(xml, 'b');
  assert.equal(field(b, 'Start'), '2026-09-02T08:00:00');
  assert.equal(field(b, 'Finish'), '2026-09-07T08:00:00', 'IT sem defasagem termina às 08:00 do dia em que a predecessora começa');
  const p = taskNamed(xml, 'p');
  assert.equal(field(p, 'ConstraintType'), '4');
  assert.equal(field(p, 'ConstraintDate'), '2026-09-09T08:00:00');
  assert.equal(field(taskNamed(xml, 'a'), 'ConstraintType'), '0');
  // Marco com data digitada fica no começo do dia.
  assert.equal(field(taskNamed(xml, 'm'), 'Start'), '2026-09-11T08:00:00');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanImport, parseMspdi, parseXsdDuration, type DraftTask, type PlanImportDraft } from '../src/domain/mspdi-import';
import { buildMspdi } from '../src/domain/mspdi';
import { DEFAULT_CALENDAR, analyzeSchedule, endFor, parseDuration, type WorkCalendar } from '../src/domain/plan-schedule';
import type { LinkType, MediumTermPlan, PlanDependency, PlanTask } from '../src/domain/entities';

// ————— Montagem de XML sintético no formato do Project 2019 —————

const NS = 'http://schemas.microsoft.com/project';
type Fields = Record<string, string | number | undefined>;
const tags = (fields: Fields) =>
  Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<${k}>${v}</${k}>`)
    .join('');
const linkXml = (uid: number, type = 1, lag = 0, format = 7, cross = 0) =>
  `<PredecessorLink>${tags({ PredecessorUID: uid, Type: type, CrossProject: cross, LinkLag: lag, LagFormat: format })}</PredecessorLink>`;
/** Tarefa de um dia (03/11/2026, terça) com os campos que o Project grava; `extra` sobrepõe. */
const taskXml = (uid: number, level: number, name: string, extra: Fields = {}, inner = '') =>
  `<Task>${tags({
    UID: uid,
    ID: uid,
    Name: name,
    Active: 1,
    Manual: 0,
    IsNull: 0,
    OutlineLevel: level,
    Start: '2026-11-03T08:00:00',
    Finish: '2026-11-03T17:00:00',
    Duration: 'PT8H0M0S',
    DurationFormat: 7,
    Estimated: 0,
    Milestone: 0,
    Summary: 0,
    PercentComplete: 0,
    ConstraintType: 0,
    ...extra,
  })}${inner}</Task>`;
const summaryXml = (uid: number, level: number, name: string, extra: Fields = {}, inner = '') =>
  taskXml(uid, level, name, { Summary: 1, DurationFormat: 21, ...extra }, inner);
const weekXml = (ranges: [string, string][]) =>
  [1, 2, 3, 4, 5, 6, 7]
    .map(day =>
      day === 1 || day === 7
        ? `<WeekDay><DayType>${day}</DayType><DayWorking>0</DayWorking></WeekDay>`
        : `<WeekDay><DayType>${day}</DayType><DayWorking>1</DayWorking><WorkingTimes>${ranges
            .map(([from, to]) => `<WorkingTime><FromTime>${from}</FromTime><ToTime>${to}</ToTime></WorkingTime>`)
            .join('')}</WorkingTimes></WeekDay>`,
    )
    .join('');
const EIGHT_HOURS: [string, string][] = [
  ['08:00:00', '12:00:00'],
  ['13:00:00', '17:00:00'],
];
const calendarXml = (uid = 1, exceptions = '', extra: Fields = {}, week = weekXml(EIGHT_HOURS)) =>
  `<Calendar>${tags({ UID: uid, Name: 'Padrão', IsBaseCalendar: 1, BaseCalendarUID: -1, ...extra })}<WeekDays>${week}</WeekDays>${
    exceptions ? `<Exceptions>${exceptions}</Exceptions>` : ''
  }</Calendar>`;
const exceptionXml = (from: string, to: string, fields: Fields = {}, inner = '') =>
  `<Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod><FromDate>${from}T00:00:00</FromDate><ToDate>${to}T23:59:00</ToDate></TimePeriod>${tags(
    { Occurrences: 1, Name: 'Feriado', Type: 1, DayWorking: 0, ...fields },
  )}${inner}</Exception>`;
const projectXml = (o: { header?: Fields; calendars?: string; tasks: string[]; resources?: string; assignments?: string }) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<Project xmlns="${NS}">\r\n\t${tags({
    SaveVersion: 14,
    Name: 'teste.xml',
    Title: 'Plano Teste',
    StartDate: '2026-11-03T08:00:00',
    CalendarUID: 1,
    MinutesPerDay: 480,
    MinutesPerWeek: 2400,
    DaysPerMonth: 20,
    DurationFormat: 7,
    ...o.header,
  })}\r\n\t<Calendars>${o.calendars ?? calendarXml()}</Calendars>\r\n\t<Tasks>\r\n${[
    summaryXml(0, 0, 'Resumo do projeto'),
    ...o.tasks,
  ].join(
    '\r\n',
  )}\r\n\t</Tasks>${o.resources ? `<Resources>${o.resources}</Resources>` : ''}${o.assignments ? `<Assignments>${o.assignments}</Assignments>` : ''}\r\n</Project>\r\n`;

const read = (xml: string, month = '2026-11', fileName?: string) => buildPlanImport(parseMspdi(xml), { month, fileName });
const named = (draft: PlanImportDraft, name: string): DraftTask => {
  const found = draft.tasks.find(t => t.name === name);
  assert.ok(found, `tarefa ${name} não encontrada`);
  return found;
};
const warning = (draft: PlanImportDraft, code: string) => draft.warnings.find(w => w.code === code);
const nameOf = (draft: PlanImportDraft, key: string) => draft.tasks.find(t => t.key === key)?.name;
const linkList = (draft: PlanImportDraft) =>
  draft.links.map(
    l => `${nameOf(draft, l.predecessorKey)}→${nameOf(draft, l.successorKey)} ${l.type}${l.lagDays}${l.lagBusiness ? '' : 'c'}`,
  );

/** O rascunho no formato do plano, para passar pelo motor como o servidor faz. */
const now = '2026-11-08T00:00:00Z';
function toPlan(draft: PlanImportDraft): { tasks: PlanTask[]; links: PlanDependency[] } {
  return {
    tasks: draft.tasks.map(t => ({
      id: t.key,
      createdAt: now,
      updatedAt: now,
      planId: 'p',
      name: t.name,
      plannedStart: t.plannedStart,
      plannedEnd: t.plannedEnd,
      progress: t.progress,
      order: t.order,
      level: t.level,
      duration: t.duration,
      actualStart: t.actualStart,
      actualEnd: t.actualEnd,
      constraintType: t.constraintType,
      constraintDate: t.constraintDate,
      deadline: t.deadline,
    })),
    links: draft.links.map((l, i) => ({
      id: `l${i}`,
      createdAt: now,
      updatedAt: now,
      predecessorId: l.predecessorKey,
      successorId: l.successorKey,
      type: l.type,
      lagDays: l.lagDays,
      lagBusiness: l.lagBusiness,
    })),
  };
}

test('níveis e ordem; resumo do projeto, tarefas nulas e inativas ficam de fora', () => {
  const draft = read(
    projectXml({
      tasks: [
        summaryXml(1, 1, 'Fase A'),
        taskXml(2, 2, 'A1'),
        taskXml(3, 2, 'A2'),
        '<Task><UID>4</UID><ID>4</ID><IsNull>1</IsNull></Task>',
        summaryXml(5, 1, 'Fase B'),
        summaryXml(6, 2, 'B inativa', { Active: 0 }),
        taskXml(7, 3, 'B1 inativa', { Active: 0 }),
        taskXml(8, 3, 'B2'),
        taskXml(9, 2, 'B3'),
        taskXml(10, 1, 'Solta'),
      ],
    }),
  );
  assert.equal(draft.name, 'Plano Teste');
  assert.deepEqual(
    draft.tasks.map(t => [t.order, t.name, t.level, t.summary, t.key]),
    [
      [1, 'Fase A', 0, true, '1'],
      [2, 'A1', 1, false, '2'],
      [3, 'A2', 1, false, '3'],
      [4, 'Fase B', 0, true, '5'],
      // A mãe inativa saiu: B2 sobe para irmã de B3, sem pular nível.
      [5, 'B2', 1, false, '8'],
      [6, 'B3', 1, false, '9'],
      [7, 'Solta', 0, false, '10'],
    ],
  );
  assert.equal(draft.stats.ignoredNull, 1);
  assert.equal(draft.stats.ignoredInactive, 2);
  assert.deepEqual(warning(draft, 'tarefa_inativa')?.taskKeys, ['6', '7']);
  assert.deepEqual(warning(draft, 'nivel_corrigido')?.taskKeys, ['8']);
  // Resumo não leva duração; a folha leva.
  assert.equal(named(draft, 'Fase A').duration, undefined);
  assert.deepEqual(named(draft, 'A1').duration, { value: 1, unit: 'd' });
  // Título genérico: vale o nome do arquivo.
  assert.equal(read(projectXml({ header: { Title: 'msproj11' }, tasks: [taskXml(1, 1, 'X')] }), '2026-11', 'Obra X.xml').name, 'Obra X');
  assert.equal(read(projectXml({ header: { Title: undefined, Name: 'BLT.xml' }, tasks: [taskXml(1, 1, 'X')] })).name, 'BLT');
});

test('durações: dias, corridos, horas, semanas, meses, estimada, fração, xsd com dias e formato nulo', () => {
  assert.equal(parseXsdDuration('PT80H0M0S'), 80);
  assert.equal(parseXsdDuration('P1DT2H'), 26);
  assert.equal(parseXsdDuration('PT30M'), 0.5);
  assert.equal(parseXsdDuration('P'), undefined);
  assert.equal(parseXsdDuration('10 dias'), undefined);
  const spec: [string, string | undefined, number][] = [
    ['dias', 'PT16H0M0S', 7],
    ['corridos', 'PT48H0M0S', 8],
    ['horas', 'PT4H0M0S', 5],
    ['horas corridas', 'PT36H0M0S', 6],
    ['semanas', 'PT80H0M0S', 9],
    ['semanas corridas', 'PT336H0M0S', 10],
    ['meses', 'PT160H0M0S', 11],
    ['meses corridos', 'PT720H0M0S', 12],
    ['estimada', 'PT24H0M0S', 39],
    ['fração', 'PT12H0M0S', 7],
    ['xsd com dia', 'P1DT2H', 5],
    ['nulo com duração', 'PT16H0M0S', 21],
    ['nulo sem duração', undefined, 53],
  ];
  const draft = read(
    projectXml({
      tasks: [
        summaryXml(1, 1, 'Resumo'),
        ...spec.map(([name, duration, format], i) =>
          taskXml(i + 2, 2, name, {
            Duration: duration,
            DurationFormat: format,
            // A sem duração vai de terça a quinta: três dias úteis.
            ...(duration ? {} : { Finish: '2026-11-05T17:00:00' }),
          }),
        ),
      ],
    }),
  );
  const durations = Object.fromEntries(spec.map(([name]) => [name, named(draft, name).duration]));
  assert.deepEqual(durations, {
    dias: { value: 2, unit: 'd' },
    corridos: { value: 2, unit: 'dd' },
    horas: { value: 4, unit: 'h' },
    'horas corridas': { value: 1.5, unit: 'dd' },
    semanas: { value: 10, unit: 'd' },
    'semanas corridas': { value: 14, unit: 'dd' },
    meses: { value: 1, unit: 'mês' },
    'meses corridos': { value: 1, unit: 'md' },
    estimada: { value: 3, unit: 'd' },
    fração: { value: 1.5, unit: 'd' },
    'xsd com dia': { value: 26, unit: 'h' },
    'nulo com duração': { value: 2, unit: 'd' },
    'nulo sem duração': { value: 3, unit: 'd' },
  });
  assert.equal(named(draft, 'Resumo').duration, undefined);
  const keys = (code: string) => warning(draft, code)?.taskKeys?.map(key => nameOf(draft, key));
  assert.deepEqual(keys('unidade_convertida'), ['horas corridas', 'semanas', 'semanas corridas']);
  // Horas que não fecham o dia e frações: o motor arredonda para cima, e o aviso diz isso.
  assert.deepEqual(keys('duracao_fracionada'), ['horas', 'horas corridas', 'fração', 'xsd com dia']);
  assert.deepEqual(keys('duracao_estimada'), ['estimada', 'nulo sem duração']);
  assert.equal(named(draft, 'estimada').estimated, true);
  assert.deepEqual(keys('duracao_por_datas'), ['nulo sem duração']);
  // Jornada de 9 h: 18 h em dias são 2 dias.
  const nine = read(
    projectXml({
      header: { MinutesPerDay: 540 },
      calendars: calendarXml(
        1,
        '',
        {},
        weekXml([
          ['08:00:00', '12:00:00'],
          ['13:00:00', '18:00:00'],
        ]),
      ),
      tasks: [taskXml(1, 1, 'nove', { Duration: 'PT18H0M0S' })],
    }),
  );
  assert.equal(nine.calendar.hoursPerDay, 9);
  assert.deepEqual(named(nine, 'nove').duration, { value: 2, unit: 'd' });
  assert.equal(warning(nine, 'jornada_diferente'), undefined);
});

test('marco: duração zero, mesmo quando o Project guardou duração', () => {
  const draft = read(
    projectXml({
      tasks: [
        taskXml(1, 1, 'Marco', { Milestone: 1, Duration: 'PT0H0M0S', Finish: '2026-11-03T08:00:00' }),
        taskXml(2, 1, 'Marco longo', { Milestone: 1, Duration: 'PT8H0M0S' }),
      ],
    }),
  );
  assert.deepEqual(named(draft, 'Marco').duration, { value: 0, unit: 'd' });
  assert.deepEqual(named(draft, 'Marco longo').duration, { value: 0, unit: 'd' });
  assert.deepEqual(warning(draft, 'marco_com_duracao')?.taskKeys, ['2']);
  assert.equal(draft.stats.milestones, 2);
});

test('tarefa manual vira automática com NIAD no início; resumo manual e estimada', () => {
  const draft = read(
    projectXml({
      tasks: [
        summaryXml(1, 1, 'Grupo manual', { Manual: 1, Start: '2026-11-02T08:00:00', Finish: '2043-10-22T17:00:00' }),
        taskXml(2, 2, 'Manual', {
          Manual: 1,
          Estimated: 1,
          DurationFormat: 53,
          Start: '2026-11-10T08:00:00',
          Finish: '2026-11-10T17:00:00',
        }),
        taskXml(3, 2, 'Manual com restrição', {
          Manual: 1,
          ConstraintType: 6,
          ConstraintDate: '2026-11-20T17:00:00',
          Start: '2026-11-19T08:00:00',
          Finish: '2026-11-20T17:00:00',
          Duration: 'PT16H0M0S',
        }),
      ],
    }),
  );
  const manual = named(draft, 'Manual');
  assert.deepEqual(
    [manual.constraintType, manual.constraintDate, manual.manual, manual.estimated, manual.duration],
    ['SNET', '2026-11-10', true, true, { value: 1, unit: 'd' }],
  );
  const constrained = named(draft, 'Manual com restrição');
  assert.deepEqual([constrained.constraintType, constrained.constraintDate], ['FNET', '2026-11-20']);
  assert.equal(warning(draft, 'tarefa_manual')?.count, 2);
  assert.deepEqual(warning(draft, 'resumo_manual')?.taskKeys, ['1']);
  assert.deepEqual(warning(draft, 'duracao_estimada')?.taskKeys, ['2']);
  // O resumo manual guarda o envelope das subtarefas; a data do arquivo fica para a comparação.
  const group = named(draft, 'Grupo manual');
  assert.deepEqual([group.plannedStart, group.plannedEnd], ['2026-11-10', '2026-11-20']);
  assert.deepEqual(draft.fileDates['1'], { start: '2026-11-02', end: '2043-10-22' });
  assert.equal(draft.stats.manual, 3);
  // O motor aceita e reproduz as datas do arquivo nas folhas.
  const plan = toPlan(draft);
  const analysis = analyzeSchedule(plan.tasks, plan.links, draft.calendar);
  for (const key of ['2', '3']) {
    const task = analysis.tasks.find(t => t.id === key)!;
    assert.deepEqual({ start: task.plannedStart, end: task.plannedEnd }, draft.fileDates[key]);
  }
});

test('restrições: os oito códigos, sem data, desconhecida, e resumo sem restrição nem prazo final', () => {
  const codes = ['ASAP', 'ALAP', 'MSO', 'MFO', 'SNET', 'SNLT', 'FNET', 'FNLT'];
  const draft = read(
    projectXml({
      tasks: [
        summaryXml(1, 1, 'Resumo', { ConstraintType: 4, ConstraintDate: '2026-11-03T08:00:00', Deadline: '2026-11-30T17:00:00' }),
        ...codes.map((code, i) =>
          taskXml(i + 2, 2, code, { ConstraintType: i, ConstraintDate: i > 1 ? `2026-11-${10 + i}T08:00:00` : undefined }),
        ),
        taskXml(20, 2, 'sem data', { ConstraintType: 4 }),
        taskXml(21, 2, 'desconhecida', { ConstraintType: 9, ConstraintDate: '2026-11-10T08:00:00' }),
        taskXml(22, 2, 'prazo', { Deadline: '2026-11-27T17:00:00' }),
      ],
    }),
  );
  assert.deepEqual(
    codes.map(code => [named(draft, code).constraintType, named(draft, code).constraintDate]),
    [
      [undefined, undefined],
      ['ALAP', undefined],
      ['MSO', '2026-11-12'],
      ['MFO', '2026-11-13'],
      ['SNET', '2026-11-14'],
      ['SNLT', '2026-11-15'],
      ['FNET', '2026-11-16'],
      ['FNLT', '2026-11-17'],
    ],
  );
  assert.equal(named(draft, 'sem data').constraintType, undefined);
  assert.deepEqual(warning(draft, 'restricao_sem_data')?.taskKeys, ['20']);
  assert.equal(named(draft, 'desconhecida').constraintType, undefined);
  assert.deepEqual(warning(draft, 'restricao_desconhecida')?.taskKeys, ['21']);
  assert.equal(named(draft, 'prazo').deadline, '2026-11-27');
  const summary = named(draft, 'Resumo');
  assert.deepEqual([summary.constraintType, summary.constraintDate, summary.deadline], [undefined, undefined, undefined]);
  assert.deepEqual(warning(draft, 'resumo_restricao')?.taskKeys, ['1']);
  assert.deepEqual(warning(draft, 'resumo_prazo_final')?.taskKeys, ['1']);
  assert.equal(draft.stats.constrained, 7);
});

test('vínculos: quatro tipos, defasagem útil, corrida, negativa, em horas, em %, limitada; externos e inexistentes caem', () => {
  const draft = read(
    projectXml({
      tasks: [
        taskXml(1, 1, 'P', { Duration: 'PT32H0M0S', Finish: '2026-11-06T17:00:00' }),
        taskXml(2, 1, 'TI útil', {}, linkXml(1, 1, 4800, 7)),
        taskXml(3, 1, 'II corrido', {}, linkXml(1, 3, 14400, 8)),
        taskXml(4, 1, 'TT negativo', {}, linkXml(1, 0, -9600, 7)),
        taskXml(5, 1, 'IT horas', {}, linkXml(1, 2, 2400, 5)),
        taskXml(6, 1, 'Sem predecessora', {}, linkXml(999) + linkXml(1, 1, 0, 7, 1)),
        taskXml(7, 1, 'Porcentagem', {}, linkXml(1, 1, 50, 19)),
        taskXml(8, 1, 'Longe', {}, linkXml(1, 1, 600 * 8 * 400, 7)),
        taskXml(9, 1, 'Estimada', {}, linkXml(1, 1, 9600, 39)),
      ],
    }),
  );
  assert.deepEqual(linkList(draft), [
    'P→TI útil TI1',
    'P→II corrido II1c',
    'P→TT negativo TT-2',
    // 4 h = meio dia útil: convertido e arredondado.
    'P→IT horas IT1',
    // 50% de 4 dias.
    'P→Porcentagem TI2',
    'P→Longe TI365',
    'P→Estimada TI2',
  ]);
  const keys = (code: string) => warning(draft, code)?.taskKeys;
  assert.deepEqual(keys('defasagem_convertida'), ['5']);
  assert.deepEqual(keys('defasagem_arredondada'), ['5']);
  assert.deepEqual(keys('defasagem_percentual'), ['7']);
  assert.deepEqual(keys('defasagem_limitada'), ['8']);
  assert.deepEqual(keys('predecessora_ausente'), ['6']);
  assert.deepEqual(keys('vinculo_externo'), ['6']);
  assert.equal(draft.stats.links, 7);
  const plan = toPlan(draft);
  assert.doesNotThrow(() => analyzeSchedule(plan.tasks, plan.links, draft.calendar));
});

test('vínculo com resumo vai para as subtarefas de borda, sem repetir o que já existe', () => {
  const draft = read(
    projectXml({
      tasks: [
        taskXml(1, 1, 'Antes'),
        summaryXml(2, 1, 'Grupo', {}, linkXml(1)),
        taskXml(3, 2, 'G1', {}, linkXml(1)),
        taskXml(4, 2, 'G2', {}, linkXml(3)),
        taskXml(5, 2, 'G3'),
        taskXml(6, 1, 'Depois', {}, linkXml(2, 1, 4800)),
        taskXml(7, 1, 'Junto', {}, linkXml(2, 3)),
      ],
    }),
  );
  assert.deepEqual(linkList(draft), [
    'Antes→G1 TI0',
    'G1→G2 TI0',
    // Chega no resumo: G1 e G3 não têm predecessora dentro do grupo (Antes→G1 já existia).
    'Antes→G3 TI0',
    // Sai do resumo pelo término: G2 e G3 não têm sucessora dentro do grupo.
    'G2→Depois TI1',
    'G3→Depois TI1',
    // II sai pelo início: das subtarefas de entrada.
    'G1→Junto II0',
    'G3→Junto II0',
  ]);
  assert.deepEqual(draft.links.filter(l => l.redistributed).length, 5, 'os vínculos vindos do resumo ficam marcados');
  assert.ok(!draft.links.some(l => l.predecessorKey === '2' || l.successorKey === '2'));
  const notice = warning(draft, 'vinculo_resumo');
  assert.equal(notice?.count, 3);
  assert.match(
    notice!.message,
    /3 vínculos do arquivo ligados a tarefas-resumo .*: 5 vínculos novos entre subtarefas e 1 que já existia entre as subtarefas e foi descartado/,
  );
  // O motor recusaria vínculo em resumo; aqui ele aceita.
  const plan = toPlan(draft);
  assert.doesNotThrow(() => analyzeSchedule(plan.tasks, plan.links, draft.calendar));
});

test('ciclo num arquivo mexido à mão: cai o vínculo que fecha o ciclo', () => {
  const draft = read(projectXml({ tasks: [taskXml(1, 1, 'A', {}, linkXml(2)), taskXml(2, 1, 'B', {}, linkXml(1))] }));
  assert.deepEqual(linkList(draft), ['B→A TI0']);
  assert.equal(warning(draft, 'vinculo_ciclo')?.count, 1);
});

test('recursos: o da primeira atribuição; atribuição dupla avisa; sem recurso é ignorado', () => {
  const resource = (uid: number, name?: string) => `<Resource>${tags({ UID: uid, ID: uid, Name: name, Type: 1, IsNull: 0 })}</Resource>`;
  const assignment = (uid: number, task: number, res: number) =>
    `<Assignment>${tags({ UID: uid, TaskUID: task, ResourceUID: res, Units: 1 })}<TimephasedData><Type>1</Type><UID>${uid}</UID><Value>PT8H0M0S</Value></TimephasedData></Assignment>`;
  const draft = read(
    projectXml({
      tasks: [taskXml(1, 1, 'Alvenaria'), taskXml(2, 1, 'Reboco'), taskXml(3, 1, 'Limpeza')],
      resources: resource(0) + resource(1, 'Empreiteira A') + resource(2, 'Empreiteira B'),
      assignments: assignment(1, 1, 1) + assignment(2, 2, 1) + assignment(3, 2, 2) + assignment(4, 3, -65535),
    }),
  );
  assert.deepEqual(
    draft.tasks.map(t => t.resourceName),
    ['Empreiteira A', 'Empreiteira A', undefined],
  );
  assert.deepEqual(warning(draft, 'varios_recursos')?.taskKeys, ['2']);
  assert.deepEqual(draft.resources, [{ name: 'Empreiteira A', taskCount: 2 }]);
  assert.equal(draft.stats.withResource, 2);
});

test('calendário: derivado do base, recesso em intervalo, feriado avulso, recorrências, dia útil de exceção', () => {
  const base = calendarXml(
    1,
    exceptionXml('2026-11-20', '2026-11-20', { Name: 'Consciência Negra' }) +
      exceptionXml('2026-12-21', '2027-01-03', { Name: 'Recesso', Occurrences: 14 }) +
      exceptionXml('2026-12-25', '2035-12-25', { Name: 'Natal', Type: 2, Month: 11, MonthDay: 25, Occurrences: 10 }),
    {},
    weekXml([
      ['08:00:00', '12:00:00'],
      ['13:00:00', '18:00:00'],
    ]),
  );
  const derived = `<Calendar>${tags({ UID: 2, Name: 'Obra', IsBaseCalendar: 0, BaseCalendarUID: 1 })}<WeekDays/><Exceptions>${
    exceptionXml(
      '2026-11-28',
      '2026-11-28',
      { Name: 'Sábado de concretagem', DayWorking: 1 },
      '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime></WorkingTimes>',
    ) +
    exceptionXml('2027-02-01', '2027-04-05', {
      Name: 'Primeira segunda',
      Type: 5,
      MonthItem: 4,
      MonthPosition: 0,
      Period: 1,
      Occurrences: 3,
    }) +
    exceptionXml('2027-05-07', '2027-05-28', { Name: 'Sexta quinzenal', Type: 6, DaysOfWeek: 32, Period: 2, Occurrences: 2 }) +
    exceptionXml('2027-06-01', '2027-06-30', { Name: 'Estranha', Type: 99 })
  }</Exceptions></Calendar>`;
  const draft = read(
    projectXml({ header: { CalendarUID: 2, MinutesPerDay: 540 }, calendars: base + derived, tasks: [taskXml(1, 1, 'A')] }),
  );
  assert.deepEqual(draft.calendar, {
    weekdays: [1, 2, 3, 4, 5],
    hoursPerDay: 9,
    daysPerMonth: 20,
    holidays: [
      '2026-11-20',
      // Recesso: só os dias que seriam úteis.
      '2026-12-21',
      '2026-12-22',
      '2026-12-23',
      '2026-12-24',
      '2026-12-25',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-02-01',
      '2027-03-01',
      '2027-04-05',
      '2027-05-07',
      '2027-05-21',
      // Natal anual: 2027 cai no sábado; 2029 já passa da janela de três anos.
      '2028-12-25',
    ],
  });
  assert.match(warning(draft, 'excecao_dia_util')!.message, /Sábado de concretagem/);
  assert.match(warning(draft, 'recorrencia_desconhecida')!.message, /tipo 99/);
  assert.equal(draft.stats.holidays, 17);
  // Jornada de 9 h nas faixas com 8 h no cabeçalho: vale o cabeçalho, com aviso.
  const mismatch = read(projectXml({ header: { CalendarUID: 1 }, calendars: base, tasks: [taskXml(1, 1, 'A')] }));
  assert.equal(mismatch.calendar.hoursPerDay, 8);
  assert.match(warning(mismatch, 'jornada_diferente')!.message, /segunda 9 h/);
  // Sem `<Exceptions>`, valem as exceções antigas dentro de `WeekDays`.
  const legacy = calendarXml(
    1,
    '',
    {},
    weekXml(EIGHT_HOURS) +
      '<WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>2026-11-02T00:00:00</FromDate><ToDate>2026-11-02T23:59:00</ToDate></TimePeriod></WeekDay>',
  );
  assert.deepEqual(read(projectXml({ calendars: legacy, tasks: [taskXml(1, 1, 'A')] })).calendar.holidays, ['2026-11-02']);
});

test('linha de base: a de número 0, só para quem tem', () => {
  const baseline = (number: number, start: string, finish: string) =>
    `<Baseline><Number>${number}</Number><Start>${start}T08:00:00</Start><Finish>${finish}T17:00:00</Finish><Duration>PT8H0M0S</Duration></Baseline>`;
  const draft = read(
    projectXml({
      tasks: [
        taskXml(1, 1, 'Com base', {}, baseline(0, '2026-11-02', '2026-11-04') + baseline(1, '2026-12-01', '2026-12-02')),
        taskXml(2, 1, 'Só base 1', {}, baseline(1, '2026-11-02', '2026-11-02')),
        taskXml(3, 1, 'Sem base'),
      ],
    }),
  );
  assert.deepEqual(draft.baseline, { '1': { start: '2026-11-02', end: '2026-11-04' } });
  assert.equal(draft.stats.withBaseline, 1);
  assert.equal(read(projectXml({ tasks: [taskXml(1, 1, 'A')] })).baseline, undefined);
});

test('reais e % incoerentes seguem as regras do servidor; resumo não leva data real', () => {
  const draft = read(
    projectXml({
      tasks: [
        summaryXml(1, 1, 'Resumo', { ActualStart: '2026-11-03T08:00:00', PercentComplete: 40 }),
        taskXml(2, 2, 'Terminou sem 100', { ActualStart: '2026-11-03T08:00:00', ActualFinish: '2026-11-03T17:00:00', PercentComplete: 90 }),
        taskXml(3, 2, 'Avançou sem início', { PercentComplete: 50 }),
        taskXml(4, 2, '100 sem término', { ActualStart: '2026-11-03T08:00:00', PercentComplete: 100 }),
        taskXml(5, 2, 'Em andamento', { ActualStart: '2026-11-03T08:00:00', PercentComplete: 30 }),
      ],
    }),
  );
  const pick = (name: string) => {
    const t = named(draft, name);
    return [t.progress, t.actualStart, t.actualEnd];
  };
  assert.deepEqual(pick('Resumo'), [40, undefined, undefined]);
  assert.deepEqual(pick('Terminou sem 100'), [100, '2026-11-03', '2026-11-03']);
  assert.deepEqual(pick('Avançou sem início'), [50, '2026-11-03', undefined]);
  assert.deepEqual(pick('100 sem término'), [100, '2026-11-03', '2026-11-03']);
  assert.deepEqual(pick('Em andamento'), [30, '2026-11-03', undefined]);
  assert.deepEqual(warning(draft, 'real_ajustado')?.taskKeys, ['2', '3', '4']);
  assert.deepEqual([draft.stats.completed, draft.stats.inProgress], [2, 2]);
});

test('entidades, BOM, CRLF, comentário, CDATA, atributo com ">" e blocos de distribuição pulados', () => {
  const xml =
    '﻿' +
    projectXml({
      header: { Title: 'Edif&#237;cio &amp; Torre' },
      tasks: [
        '<!-- comentário com <Task> dentro -->',
        taskXml(
          1,
          1,
          'Funda&#xE7;&#227;o &amp; &lt;bloco&gt; &quot;A&quot; &apos;B&apos;',
          {},
          '<Notes><![CDATA[linha 1\r\nlinha <2> & fim]]></Notes><TimephasedData><Type>9</Type><UID>999</UID><Start>2030-01-01T08:00:00</Start></TimephasedData>',
        ),
        '<Task note="a>b"><UID>2</UID><ID>2</ID><Name>Com atributo</Name><OutlineLevel>1</OutlineLevel><Start>2026-11-04T08:00:00</Start><Finish>2026-11-04T17:00:00</Finish><Duration>PT8H0M0S</Duration><DurationFormat>7</DurationFormat></Task>',
      ],
    });
  const project = parseMspdi(xml);
  assert.equal(project.title, 'Edifício & Torre');
  assert.deepEqual(
    project.tasks.map(t => t.uid),
    [0, 1, 2],
  );
  const draft = buildPlanImport(project, { month: '2026-11' });
  assert.equal(draft.name, 'Edifício & Torre');
  assert.equal(draft.tasks[0].name, 'Fundação & <bloco> "A" \'B\'');
  assert.equal(draft.tasks[0].notes, 'linha 1\nlinha <2> & fim');
  assert.deepEqual(draft.fileDates['1'], { start: '2026-11-03', end: '2026-11-03' });
  assert.equal(draft.tasks[1].name, 'Com atributo');
});

test('XML que não é do Project, malformado, vazio ou binário: erro em português', () => {
  assert.throws(() => parseMspdi(''), /vazio/);
  assert.throws(() => parseMspdi('PK\u0003\u0004 binário'), /não é XML/);
  assert.throws(
    () => parseMspdi('<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"/>'),
    /não é um XML do Microsoft Project/,
  );
  assert.throws(() => parseMspdi('<Project><Tasks/></Project>'), /não é um XML do Microsoft Project/);
  assert.throws(() => parseMspdi(`<Project xmlns="${NS}">\n<Tasks>\n<Task></Tasks>\n</Project>`), /XML malformado \(linha 3\)/);
  assert.throws(() => parseMspdi(`<Project xmlns="${NS}"><Tasks>`), /não foi fechado/);
  assert.throws(() => parseMspdi(`<Project xmlns="${NS}"/><Project xmlns="${NS}"/>`), /mais de um elemento raiz/);
  // Com prefixo de namespace também é do Project.
  assert.equal(parseMspdi(`<p:Project xmlns:p="${NS}"><p:Title>Ok</p:Title></p:Project>`).title, 'Ok');
  assert.throws(() => buildPlanImport(parseMspdi(projectXml({ tasks: [] })), { month: '11/2026' }), /AAAA-MM/);
});

// ————— Ida e volta: plano → buildMspdi → parseMspdi → buildPlanImport —————

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-02T15:30:00Z' };
const calendar: WorkCalendar = { ...DEFAULT_CALENDAR, holidays: ['2026-09-07'] };
const planTask = (id: string, order: number, level: number, start: string, duration: string, extra: Partial<PlanTask> = {}): PlanTask => ({
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
const planLink = (
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

test('ida e volta com buildMspdi: nomes, níveis, durações, vínculos, restrições, %, reais, linha de base e datas', () => {
  const plan: MediumTermPlan = { id: 'plan', ...stamp, workId: 'w', month: '2026-09', name: 'Setembro', createdBy: 'u' };
  const tasks: PlanTask[] = [
    planTask('r', 1, 0, '2026-09-01', '1d', { name: 'Estrutura & fundação' }),
    planTask('a', 2, 1, '2026-09-01', '2d', { notes: 'Ver <projeto> "A" & B' }),
    planTask('b', 3, 1, '2026-09-01', '2dd'),
    planTask('c', 4, 1, '2026-09-01', '3d'),
    planTask('m', 5, 1, '2026-09-01', '0d'),
    planTask('snet', 6, 0, '2026-09-10', '1d', { constraintType: 'SNET', constraintDate: '2026-09-10' }),
    planTask('fnlt', 7, 0, '2026-09-15', '1d', { constraintType: 'FNLT', constraintDate: '2026-09-15' }),
    planTask('alap', 8, 0, '2026-09-01', '1d', { constraintType: 'ALAP' }),
    planTask('dl', 9, 0, '2026-09-01', '2d', { deadline: '2026-09-30' }),
    planTask('half', 10, 0, '2026-09-08', '4d', { progress: 50, actualStart: '2026-09-08' }),
    planTask('done', 11, 0, '2026-09-01', '3d', { progress: 100, actualStart: '2026-09-01', actualEnd: '2026-09-03' }),
    planTask('hrs', 12, 0, '2026-09-01', '16h'),
    planTask('mes', 13, 0, '2026-09-01', '1mês'),
  ];
  const links = [
    planLink('l1', 'a', 'b', 'TI', 2),
    planLink('l2', 'a', 'c', 'II', 1, false),
    planLink('l3', 'a', 'm', 'TT', -1),
    planLink('l4', 'snet', 'fnlt', 'TI', 1),
    planLink('l5', 'c', 'hrs', 'IT', 0),
  ];
  const analysis = analyzeSchedule(tasks, links, calendar);
  const xml = buildMspdi({
    plan,
    tasks,
    links,
    calendar,
    analysis,
    workName: 'Obra Teste',
    baseline: new Map([['a', { start: '2026-08-31', end: '2026-09-01' }]]),
  });
  const draft = read(xml, '2026-09');
  const byId = (id: string) => named(draft, tasks.find(t => t.id === id)!.name);

  assert.equal(draft.name, 'Obra Teste · Setembro');
  assert.deepEqual(draft.warnings, []);
  assert.deepEqual(
    draft.tasks.map(t => [t.name, t.level, t.summary]),
    tasks.map(t => [t.name, t.level, t.id === 'r']),
  );
  assert.deepEqual(draft.calendar, calendar);
  assert.deepEqual(Object.fromEntries(tasks.filter(t => t.id !== 'r').map(t => [t.id, byId(t.id).duration])), {
    a: { value: 2, unit: 'd' },
    b: { value: 2, unit: 'dd' },
    c: { value: 3, unit: 'd' },
    m: { value: 0, unit: 'd' },
    snet: { value: 1, unit: 'd' },
    fnlt: { value: 1, unit: 'd' },
    alap: { value: 1, unit: 'd' },
    dl: { value: 2, unit: 'd' },
    half: { value: 4, unit: 'd' },
    done: { value: 3, unit: 'd' },
    hrs: { value: 16, unit: 'h' },
    // O mês sai em dias úteis no XML.
    mes: { value: 20, unit: 'd' },
  });
  assert.deepEqual(linkList(draft), ['a→b TI2', 'a→c II1c', 'a→m TT-1', 'snet→fnlt TI1', 'c→hrs IT0']);
  assert.deepEqual([byId('snet').constraintType, byId('snet').constraintDate], ['SNET', '2026-09-10']);
  assert.deepEqual([byId('fnlt').constraintType, byId('fnlt').constraintDate], ['FNLT', '2026-09-15']);
  assert.equal(byId('alap').constraintType, 'ALAP');
  assert.equal(byId('dl').deadline, '2026-09-30');
  assert.equal(byId('a').notes, 'Ver <projeto> "A" & B');
  assert.deepEqual([byId('half').progress, byId('half').actualStart, byId('half').actualEnd], [50, '2026-09-08', undefined]);
  assert.deepEqual([byId('done').progress, byId('done').actualStart, byId('done').actualEnd], [100, '2026-09-01', '2026-09-03']);
  assert.deepEqual(draft.baseline, { [byId('a').key]: { start: '2026-08-31', end: '2026-09-01' } });
  // As datas do arquivo são as do motor, e o motor, rodando no rascunho, chega nas mesmas.
  const again = toPlan(draft);
  const recomputed = new Map(analyzeSchedule(again.tasks, again.links, draft.calendar).tasks.map(t => [t.name, t]));
  const children = analysis.tasks.filter(t => ['a', 'b', 'c', 'm'].includes(t.id));
  const envelope = {
    start: children.map(t => t.plannedStart).sort()[0],
    end: children
      .map(t => t.plannedEnd)
      .sort()
      .at(-1),
  };
  // O resumo sai no XML com o envelope dos filhos, e o rascunho guarda o mesmo envelope.
  assert.deepEqual(draft.fileDates[byId('r').key], envelope);
  assert.deepEqual({ start: byId('r').plannedStart, end: byId('r').plannedEnd }, envelope);
  for (const original of analysis.tasks) {
    if (original.id === 'r') continue;
    const key = byId(original.id).key;
    assert.deepEqual(
      draft.fileDates[key],
      { start: original.plannedStart, end: original.plannedEnd },
      `datas do arquivo de ${original.id}`,
    );
    const motor = recomputed.get(original.name)!;
    assert.deepEqual(
      [motor.plannedStart, motor.plannedEnd],
      [original.plannedStart, original.plannedEnd],
      `motor no rascunho, ${original.id}`,
    );
  }
});

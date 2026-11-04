import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityEnd,
  activityFinish,
  addWorkdays,
  cascade,
  delayDays,
  descendants,
  editableMeasurement,
  flowLevels,
  fromLongTermPlan,
  isLate,
  LOB_COLORS,
  lobSpan,
  measurableActivities,
  measuredPercents,
  moveActivity,
  nextWorkday,
  openMeasurement,
  physicalProgress,
  planLaunch,
  plannedPercent,
  plannedProgress,
  validateFlowDocument,
  validateFlowForLaunch,
  validateMeasurementValue,
  workdaysBetween,
  wouldCycle,
  type FlowService,
  type LaunchInput,
  type LobActivity,
  type LobDependency,
  type LobDependencyKind,
  type LobLocal,
  type LobMeasurement,
  type LobMeasurementItem,
  type LobService,
  type ServiceFlowDocument,
} from '../src/domain/lob';
import { examplePlanDocument, type LongTermActivity, type LongTermPlanDocument } from '../src/domain/long-term-plan';

const NOW = '2026-11-04T12:00:00.000Z';
const W = 'obra-1';
/** Calendário de 2026 usado nos testes: 02/11 é segunda, 07/11 sábado, 16/11, 23/11 e 30/11 segundas. */
const MON = '2026-11-02';
const SAT = '2026-11-07';

const act = (id: string, start: string, durationDays: number, over: Partial<LobActivity> = {}): LobActivity => ({
  id,
  workId: W,
  serviceId: 's1',
  localId: 'l1',
  start,
  durationDays,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const dep = (id: string, predecessorId: string, successorId: string, lagDays = 0, kind: LobDependencyKind = 'fs'): LobDependency => ({
  id,
  workId: W,
  predecessorId,
  successorId,
  lagDays,
  kind,
  createdAt: NOW,
});
const local = (id: string, name: string, orderIndex: number): LobLocal => ({
  id,
  workId: W,
  name,
  orderIndex,
  createdAt: NOW,
  updatedAt: NOW,
});
const service = (id: string, name: string, orderIndex = 0): LobService => ({
  id,
  workId: W,
  name,
  color: '#2a78d6',
  orderIndex,
  createdAt: NOW,
  updatedAt: NOW,
});
const flowService = (
  id: string,
  name: string,
  durationDays: number,
  predecessors: FlowService['predecessors'] = [],
  over: Partial<FlowService> = {},
): FlowService => ({ id, name, color: '#2a78d6', durationDays, predecessors, ...over });
const measurement = (id: string, number: number, date: string, status: 'open' | 'closed' = 'closed'): LobMeasurement => ({
  id,
  workId: W,
  number,
  date,
  status,
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
});
const item = (measurementId: string, activityId: string, value: number, previousValue = 0): LobMeasurementItem => ({
  id: `${measurementId}-${activityId}`,
  measurementId,
  workId: W,
  activityId,
  value,
  previousValue,
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
});

// ----- Dias úteis -----

test('nextWorkday: sábado e domingo caem na segunda; dia útil fica como está', () => {
  assert.equal(nextWorkday(SAT), '2026-11-09');
  assert.equal(nextWorkday('2026-11-08'), '2026-11-09');
  assert.equal(nextWorkday(MON), MON);
});

test('addWorkdays pula o fim de semana nos dois sentidos e zero devolve o próprio dia', () => {
  assert.equal(addWorkdays(MON, 5), '2026-11-09'); // cinco úteis depois da segunda: a segunda seguinte
  assert.equal(addWorkdays('2026-11-05', 2), '2026-11-09'); // quinta + 2 cruza o fim de semana
  assert.equal(addWorkdays('2026-11-09', -1), '2026-11-06'); // segunda − 1 é a sexta anterior
  assert.equal(addWorkdays(MON, -5), '2026-10-26');
  assert.equal(addWorkdays(MON, 0), MON);
  assert.equal(addWorkdays(SAT, 0), '2026-11-09'); // parte sempre de um dia útil
});

test('workdaysBetween conta só os úteis em [de, até) e zero quando não avança', () => {
  assert.equal(workdaysBetween(MON, '2026-11-09'), 5);
  assert.equal(workdaysBetween(MON, '2026-11-16'), 10);
  assert.equal(workdaysBetween('2026-11-06', '2026-11-09'), 1); // sexta → segunda: só a sexta
  assert.equal(workdaysBetween(MON, MON), 0);
  assert.equal(workdaysBetween('2026-11-09', MON), 0);
});

test('10 dias úteis a partir de uma segunda terminam na sexta seguinte; o fim exclusivo é a outra segunda', () => {
  const a = { start: MON, durationDays: 10 };
  assert.equal(activityFinish(a), '2026-11-13');
  assert.equal(activityEnd(a), '2026-11-16');
  assert.equal(activityFinish({ start: MON, durationDays: 1 }), MON);
  assert.equal(activityEnd({ start: MON, durationDays: 1 }), '2026-11-03');
});

// ----- Previsto -----

test('plannedPercent: zero antes do início, proporcional no meio (5 dias, na quarta = 60), 100 depois do fim', () => {
  const a = { start: MON, durationDays: 5 };
  assert.equal(plannedPercent(a, '2026-11-01'), 0);
  assert.equal(plannedPercent(a, MON), 20);
  assert.equal(plannedPercent(a, '2026-11-04'), 60);
  assert.equal(plannedPercent(a, '2026-11-06'), 100);
  assert.equal(plannedPercent(a, SAT), 100); // fim de semana depois da sexta
  assert.equal(plannedPercent(a, '2027-01-01'), 100);
  // Bloco de 10 dias visto no sábado do meio: só os cinco primeiros dias contaram.
  assert.equal(plannedPercent({ start: MON, durationDays: 10 }, SAT), 50);
});

// ----- Fluxos -----

const rawFlow = (services: unknown[], over: Record<string, unknown> = {}) => ({
  name: 'Residencial',
  direction: 'bottom_up',
  services,
  ...over,
});
const rawService = (id: string, name: string, durationDays: unknown, over: Record<string, unknown> = {}) => ({
  id,
  name,
  durationDays,
  ...over,
});

test('validateFlowDocument limpa e devolve o fluxo: nome aparado, cor inválida vira a da paleta, espera negativa aceita', () => {
  const flow = validateFlowDocument(
    rawFlow(
      [
        rawService('a', '  Estrutura   de concreto ', '10', { color: 'azul', team: ' Equipe A ', unit: 'laje' }),
        rawService('b', 'Alvenaria', 8, { color: '#EB6834', predecessors: [{ serviceId: 'a', lagDays: -3 }] }),
        rawService('c', 'Contrapiso', 5, { predecessors: [{ serviceId: 'b', lagDays: '' }] }),
      ],
      { name: '  Residencial  padrão ', direction: 'top_down' },
    ),
  );
  assert.equal(flow.name, 'Residencial padrão');
  assert.equal(flow.direction, 'top_down');
  assert.deepEqual(
    flow.services.map(s => [s.name, s.durationDays, s.color, s.team, s.unit]),
    [
      ['Estrutura de concreto', 10, LOB_COLORS[0], 'Equipe A', 'laje'],
      ['Alvenaria', 8, '#eb6834', undefined, undefined],
      ['Contrapiso', 5, LOB_COLORS[2], undefined, undefined],
    ],
  );
  assert.deepEqual(flow.services[1].predecessors, [{ serviceId: 'a', lagDays: -3 }]);
  assert.deepEqual(flow.services[2].predecessors, [{ serviceId: 'b', lagDays: 0 }]);
  assert.equal(validateFlowDocument(rawFlow([], { direction: 'diagonal' })).direction, 'bottom_up');
});

test('validateFlowDocument recusa nome vazio, duração inválida, predecessora fora do fluxo, si mesmo, ciclo e nomes repetidos', () => {
  const rejects = (input: unknown, message: string | RegExp) =>
    assert.throws(() => validateFlowDocument(input), typeof message === 'string' ? { message } : message);
  rejects(rawFlow([], { name: '   ' }), 'Informe o nome do fluxo.');
  rejects(null, 'Fluxo inválido.');
  rejects(rawFlow([rawService('a', '', 5)]), 'Informe o nome do serviço 1.');
  rejects(rawFlow([rawService('a', 'Estrutura', 0)]), 'Duração de "Estrutura" inválida: informe de 1 a 730 dias úteis.');
  rejects(rawFlow([rawService('a', 'Estrutura', 2.5)]), 'Duração de "Estrutura" inválida: informe de 1 a 730 dias úteis.');
  rejects(rawFlow([rawService('a', 'Estrutura', 731)]), 'Duração de "Estrutura" inválida: informe de 1 a 730 dias úteis.');
  rejects(
    rawFlow([rawService('a', 'Estrutura', 5, { predecessors: [{ serviceId: 'zz', lagDays: 0 }] })]),
    '"Estrutura" depende de um serviço que não está no fluxo.',
  );
  rejects(
    rawFlow([rawService('a', 'Estrutura', 5, { predecessors: [{ serviceId: 'a', lagDays: 0 }] })]),
    '"Estrutura" não pode depender dele mesmo.',
  );
  rejects(
    rawFlow([
      rawService('a', 'Estrutura', 5, { predecessors: [{ serviceId: 'b', lagDays: 0 }] }),
      rawService('b', 'Alvenaria', 5, { predecessors: [{ serviceId: 'a', lagDays: 0 }] }),
    ]),
    'O fluxo tem um ciclo de predecessoras: um serviço depende, no fim, dele mesmo.',
  );
  rejects(
    rawFlow([rawService('a', 'Estrutura', 5), rawService('b', ' ESTRUTURA', 5)]),
    'O serviço "ESTRUTURA" aparece duas vezes no fluxo.',
  );
  rejects(rawFlow([rawService('a', 'Estrutura', 5), rawService('a', 'Alvenaria', 5)]), 'Dois serviços do fluxo têm o mesmo identificador.');
  rejects(
    rawFlow([
      rawService('a', 'Estrutura', 5),
      rawService('b', 'Alvenaria', 5, { predecessors: [{ serviceId: 'a' }, { serviceId: 'a', lagDays: 2 }] }),
    ]),
    '"Alvenaria" tem a mesma predecessora duas vezes.',
  );
  rejects(
    rawFlow([rawService('a', 'Estrutura', 5), rawService('b', 'Alvenaria', 5, { predecessors: [{ serviceId: 'a', lagDays: 400 }] })]),
    /Espera inválida em "Alvenaria"/,
  );
});

test('validateFlowForLaunch (regra 7): um serviço só, dois iniciais ou sem inicial não lançam; fluxo válido passa', () => {
  const doc = (services: FlowService[]): ServiceFlowDocument => ({ name: 'F', direction: 'bottom_up', services });
  assert.throws(() => validateFlowForLaunch(doc([flowService('a', 'Estrutura', 5)])), {
    message: 'Um fluxo precisa de ao menos dois serviços para ser lançado.',
  });
  assert.throws(() => validateFlowForLaunch(doc([flowService('a', 'Estrutura', 5), flowService('b', 'Alvenaria', 5)])), {
    message: 'O fluxo tem 2 serviços iniciais (Estrutura, Alvenaria). Separe em dois fluxos ou ligue-os.',
  });
  assert.throws(
    () =>
      validateFlowForLaunch(
        doc([
          flowService('a', 'Estrutura', 5, [{ serviceId: 'b', lagDays: 0 }]),
          flowService('b', 'Alvenaria', 5, [{ serviceId: 'a', lagDays: 0 }]),
        ]),
      ),
    { message: 'O fluxo não tem serviço inicial: algum serviço precisa começar sem predecessora.' },
  );
  assert.doesNotThrow(() =>
    validateFlowForLaunch(doc([flowService('a', 'Estrutura', 5), flowService('b', 'Alvenaria', 5, [{ serviceId: 'a', lagDays: 0 }])])),
  );
});

test('flowLevels dá a coluna da rede pela precedência (diamante: A → B, A → C, B e C → D)', () => {
  const levels = flowLevels([
    flowService('d', 'D', 5, [
      { serviceId: 'b', lagDays: 0 },
      { serviceId: 'c', lagDays: 0 },
    ]),
    flowService('a', 'A', 5),
    flowService('c', 'C', 5, [{ serviceId: 'a', lagDays: 0 }]),
    flowService('b', 'B', 5, [{ serviceId: 'a', lagDays: 0 }]),
  ]);
  assert.deepEqual([...levels.entries()].sort(), [
    ['a', 0],
    ['b', 1],
    ['c', 1],
    ['d', 2],
  ]);
});

// ----- Lançamento -----

/** Três serviços encadeados (10, 10 e 8 dias úteis; esperas 10 e 5) em três locais, base → topo, ritmo contínuo. */
const THREE = [
  flowService('fa', 'Estrutura', 10),
  flowService('fb', 'Alvenaria', 10, [{ serviceId: 'fa', lagDays: 10 }]),
  flowService('fc', 'Contrapiso', 8, [{ serviceId: 'fb', lagDays: 5 }]),
];
const LOCALS = [local('l1', 'Térreo', 0), local('l2', '1º pavimento', 1), local('l3', '2º pavimento', 2)];
let seq = 0;
const newId = () => `id-${++seq}`;
const launch = (over: Partial<LaunchInput> = {}, params: Partial<LaunchInput['params']> = {}) =>
  planLaunch({
    workId: W,
    flow: { name: 'Residencial', direction: 'bottom_up', services: THREE },
    locals: LOCALS,
    params: { localIds: ['l1', 'l2', 'l3'], start: MON, direction: 'bottom_up', rhythm: { kind: 'continuous' }, ...params },
    existing: { services: [], activities: [], dependencies: [] },
    launchId: 'launch-1',
    now: NOW,
    newId,
    ...over,
  });
type Plan = ReturnType<typeof planLaunch>;
const block = (plan: Plan, serviceName: string, localId: string, services: LobService[] = []) => {
  const svc = [...plan.services, ...services].find(s => s.name === serviceName);
  return plan.activities.find(a => a.serviceId === svc?.id && a.localId === localId);
};
const linksInto = (plan: Plan, successor: LobActivity) =>
  plan.dependencies.filter(d => d.successorId === successor.id).map(d => ({ from: d.predecessorId, lag: d.lagDays, kind: d.kind }));

test('planLaunch contínuo: cada serviço segue ao próximo local ao terminar (crew, lag 0) e a sucessora encaixa no fim + espera (fs)', () => {
  const plan = launch();
  assert.equal(plan.services.length, 3);
  assert.deepEqual(
    plan.services.map(s => [s.name, s.orderIndex, s.workId]),
    [
      ['Estrutura', 0, W],
      ['Alvenaria', 1, W],
      ['Contrapiso', 2, W],
    ],
  );
  assert.equal(plan.activities.length, 9);
  assert.equal(plan.dependencies.length, 12); // 2 crew por serviço + 3 fs por serviço com predecessora
  assert.deepEqual(plan.skipped, []);
  assert.equal(plan.start, MON);
  assert.equal(plan.end, '2027-01-28');
  assert.ok(plan.activities.every(a => a.launchId === 'launch-1' && a.workId === W && a.createdAt === NOW));

  const e1 = block(plan, 'Estrutura', 'l1')!,
    e2 = block(plan, 'Estrutura', 'l2')!,
    e3 = block(plan, 'Estrutura', 'l3')!;
  assert.deepEqual([e1.start, e2.start, e3.start], [MON, '2026-11-16', '2026-11-30']);
  assert.deepEqual(linksInto(plan, e1), []);
  assert.deepEqual(linksInto(plan, e2), [{ from: e1.id, lag: 0, kind: 'crew' }]);
  assert.deepEqual(linksInto(plan, e3), [{ from: e2.id, lag: 0, kind: 'crew' }]);

  const a1 = block(plan, 'Alvenaria', 'l1')!,
    a2 = block(plan, 'Alvenaria', 'l2')!,
    a3 = block(plan, 'Alvenaria', 'l3')!;
  // Alvenaria no Térreo: fim da Estrutura (16/11) + 10 úteis de espera = 30/11.
  assert.deepEqual([a1.start, a2.start, a3.start], ['2026-11-30', '2026-12-14', '2026-12-28']);
  assert.deepEqual(linksInto(plan, a1), [{ from: e1.id, lag: 10, kind: 'fs' }]);
  assert.deepEqual(linksInto(plan, a2), [
    { from: a1.id, lag: 0, kind: 'crew' },
    { from: e2.id, lag: 10, kind: 'fs' },
  ]);

  const c1 = block(plan, 'Contrapiso', 'l1')!,
    c2 = block(plan, 'Contrapiso', 'l2')!,
    c3 = block(plan, 'Contrapiso', 'l3')!;
  // Contrapiso: no Térreo manda a espera (14/12 + 5 = 21/12); nos outros a equipe termina antes da predecessora liberar.
  assert.deepEqual([c1.start, c2.start, c3.start], ['2026-12-21', '2027-01-04', '2027-01-18']);
  assert.equal(activityEnd(c3), '2027-01-28');
  assert.ok(plan.activities.every(a => a.start === nextWorkday(a.start)));
});

test('planLaunch topo → base inverte a ordem dos locais', () => {
  const plan = launch({}, { direction: 'top_down' });
  assert.deepEqual(
    [block(plan, 'Estrutura', 'l3')!.start, block(plan, 'Estrutura', 'l2')!.start, block(plan, 'Estrutura', 'l1')!.start],
    [MON, '2026-11-16', '2026-11-30'],
  );
  const e3 = block(plan, 'Estrutura', 'l3')!;
  assert.deepEqual(linksInto(plan, block(plan, 'Estrutura', 'l2')!), [{ from: e3.id, lag: 0, kind: 'crew' }]);
  assert.equal(block(plan, 'Alvenaria', 'l3')!.start, '2026-11-30');
});

test('planLaunch takt N: a equipe começa a cada N dias úteis, gravado como crew com lag = N − duração', () => {
  const plan = launch({}, { rhythm: { kind: 'takt', days: 15 } });
  const e1 = block(plan, 'Estrutura', 'l1')!,
    e2 = block(plan, 'Estrutura', 'l2')!,
    e3 = block(plan, 'Estrutura', 'l3')!;
  assert.deepEqual([e1.start, e2.start, e3.start], [MON, '2026-11-23', '2026-12-14']);
  assert.equal(e2.start, addWorkdays(MON, 15));
  assert.deepEqual(linksInto(plan, e2), [{ from: e1.id, lag: 5, kind: 'crew' }]);
  // Takt menor que a duração: lag negativo, o próximo local começa antes de o anterior acabar.
  const fast = launch({}, { rhythm: { kind: 'takt', days: 5 } });
  const f1 = block(fast, 'Estrutura', 'l1')!,
    f2 = block(fast, 'Estrutura', 'l2')!;
  assert.equal(f2.start, '2026-11-09');
  assert.deepEqual(linksInto(fast, f2), [{ from: f1.id, lag: -5, kind: 'crew' }]);
  // Contrapiso (8 dias) com takt 15: lag 7.
  const c1 = block(plan, 'Contrapiso', 'l1')!,
    c2 = block(plan, 'Contrapiso', 'l2')!;
  assert.ok(linksInto(plan, c2).some(l => l.from === c1.id && l.lag === 7 && l.kind === 'crew'));
  assert.throws(() => launch({}, { rhythm: { kind: 'takt', days: 0 } }), { message: 'Takt inválido: informe de 1 a 365 dias úteis.' });
});

test('planLaunch "todos juntos": sem crew, os locais de cada serviço começam na mesma data', () => {
  const plan = launch({}, { rhythm: { kind: 'together' } });
  assert.ok(plan.dependencies.every(d => d.kind === 'fs'));
  assert.equal(plan.dependencies.length, 6);
  assert.ok(['l1', 'l2', 'l3'].every(l => block(plan, 'Estrutura', l)!.start === MON));
  assert.ok(['l1', 'l2', 'l3'].every(l => block(plan, 'Alvenaria', l)!.start === '2026-11-30'));
  assert.ok(['l1', 'l2', 'l3'].every(l => block(plan, 'Contrapiso', l)!.start === '2026-12-21'));
  assert.equal(plan.end, '2026-12-31');
});

test('planLaunch mantém o bloco que já existe (regra 11), lista em skipped e encaixa as sucessoras nele', () => {
  const estrutura = service('svc-e', 'ESTRUTURA');
  // Estrutura no 1º pavimento já existe, bem mais tarde do que o fluxo colocaria (07/12 a 18/12).
  const existing = act('old-e2', '2026-12-07', 10, { serviceId: 'svc-e', localId: 'l2' });
  const plan = launch({ existing: { services: [estrutura], activities: [existing], dependencies: [] } });
  // O serviço com o mesmo nome (sem acento/caixa) é reaproveitado: não entra em `services`.
  assert.deepEqual(
    plan.services.map(s => s.name),
    ['Alvenaria', 'Contrapiso'],
  );
  assert.deepEqual(
    plan.services.map(s => s.orderIndex),
    [1, 2],
  );
  assert.deepEqual(plan.skipped, [{ serviceName: 'ESTRUTURA', localName: '1º pavimento' }]);
  assert.equal(plan.activities.length, 8);
  assert.equal(block(plan, 'ESTRUTURA', 'l2', [estrutura]), undefined);
  const e1 = block(plan, 'ESTRUTURA', 'l1', [estrutura])!,
    e3 = block(plan, 'ESTRUTURA', 'l3', [estrutura])!;
  assert.equal(e1.serviceId, 'svc-e');
  assert.equal(e1.start, MON);
  // A equipe segue do bloco existente: o 2º pavimento só começa quando ele acaba (21/12).
  assert.equal(e3.start, '2026-12-21');
  assert.deepEqual(linksInto(plan, e3), [{ from: 'old-e2', lag: 0, kind: 'crew' }]);
  // A Alvenaria do 1º pavimento depende do bloco existente: 21/12 + 10 úteis = 04/01.
  const a2 = block(plan, 'Alvenaria', 'l2')!;
  assert.equal(a2.start, '2027-01-04');
  assert.ok(linksInto(plan, a2).some(l => l.from === 'old-e2' && l.lag === 10 && l.kind === 'fs'));
});

test('planLaunch ignora locais fora da obra, exige ao menos um local e começa em sábado na segunda', () => {
  const plan = launch({}, { localIds: ['l1', 'de-outra-obra'], start: SAT });
  assert.equal(plan.activities.length, 3);
  assert.ok(plan.activities.every(a => a.localId === 'l1'));
  assert.equal(plan.start, '2026-11-09');
  assert.equal(block(plan, 'Estrutura', 'l1')!.start, '2026-11-09');
  assert.throws(() => launch({}, { localIds: [] }), { message: 'Marque ao menos um local para lançar o fluxo.' });
  assert.throws(() => launch({}, { localIds: ['de-outra-obra'] }), { message: 'Marque ao menos um local para lançar o fluxo.' });
  assert.throws(() => launch({}, { start: '2026-02-30' }), { message: 'Informe a data de início do lançamento.' });
  assert.throws(() => launch({ flow: { name: 'F', direction: 'bottom_up', services: [THREE[0]] } }), {
    message: 'Um fluxo precisa de ao menos dois serviços para ser lançado.',
  });
});

// ----- Cascata e arrastar -----

/** a1 (02/11, 10 dias) → a2 (16/11, 5 dias) → a3 (23/11, 5 dias), sem folga; a4 solto. */
const chain = () => ({
  activities: [act('a1', MON, 10), act('a2', '2026-11-16', 5), act('a3', '2026-11-23', 5), act('a4', '2026-12-01', 3)],
  dependencies: [dep('d1', 'a1', 'a2'), dep('d2', 'a2', 'a3')],
});
const starts = (changed: LobActivity[]) => Object.fromEntries(changed.map(a => [a.id, a.start]).sort());

test('moveActivity para frente empurra as sucessoras (e as delas) só o necessário (regra 16)', () => {
  const { activities, dependencies } = chain();
  const changed = moveActivity(activities, dependencies, 'a1', '2026-11-09');
  assert.deepEqual(starts(changed), { a1: '2026-11-09', a2: '2026-11-23', a3: '2026-11-30' });
  // Com folga na sucessora, ela só anda o que faltava.
  const slack = [act('a1', MON, 10), act('a2', '2026-11-18', 5)];
  assert.deepEqual(starts(moveActivity(slack, [dep('d1', 'a1', 'a2')], 'a1', '2026-11-09')), { a1: '2026-11-09', a2: '2026-11-23' });
  // Esticar a duração também empurra.
  assert.deepEqual(starts(moveActivity(activities, dependencies, 'a1', MON, 11)), { a1: MON, a2: '2026-11-17', a3: '2026-11-24' });
  assert.equal(moveActivity(activities, dependencies, 'a1', MON, 11).find(a => a.id === 'a1')!.durationDays, 11);
  // Os originais não são alterados.
  assert.equal(activities[1].start, '2026-11-16');
});

test('moveActivity para trás nunca passa do mínimo das predecessoras (+ espera)', () => {
  const { activities, dependencies } = chain();
  // a2 já está no mínimo: puxar não muda nada.
  assert.deepEqual(moveActivity(activities, dependencies, 'a2', '2026-11-09'), []);
  // Com folga de dois dias, puxar volta só até o fim de a1.
  const slack = [act('a1', MON, 10), act('a2', '2026-11-18', 5)];
  assert.deepEqual(starts(moveActivity(slack, [dep('d1', 'a1', 'a2')], 'a2', '2026-11-09')), { a2: '2026-11-16' });
  // Espera de 2 dias úteis entra no mínimo; espera negativa antecipa.
  const wide = [act('a1', MON, 10), act('a2', '2026-11-20', 5)];
  assert.deepEqual(starts(moveActivity(wide, [dep('d1', 'a1', 'a2', 2)], 'a2', '2026-11-09')), { a2: '2026-11-18' });
  assert.deepEqual(starts(moveActivity(wide, [dep('d1', 'a1', 'a2', -2)], 'a2', '2026-11-09')), { a2: '2026-11-12' });
  // Já no mínimo com a espera: puxar não muda nada.
  assert.deepEqual(moveActivity(slack, [dep('d1', 'a1', 'a2', 2)], 'a2', '2026-11-09'), []);
  // Puxar a2 para trás não puxa a3 junto.
  const loose = [act('a1', MON, 10), act('a2', '2026-11-20', 5), act('a3', '2026-12-07', 5)];
  assert.deepEqual(starts(moveActivity(loose, dependencies, 'a2', MON)), { a2: '2026-11-16' });
});

test('bloco sem predecessora move livremente, inclusive para trás e com início em sábado', () => {
  const { activities, dependencies } = chain();
  assert.deepEqual(starts(moveActivity(activities, dependencies, 'a1', '2026-10-19')), { a1: '2026-10-19' });
  assert.deepEqual(starts(moveActivity(activities, dependencies, 'a4', '2026-10-03')), { a4: '2026-10-05' });
  assert.deepEqual(moveActivity(activities, dependencies, 'inexistente', MON), []);
});

test('cascade só empurra quem ficou antes do mínimo; folga dada à mão fica', () => {
  const { activities, dependencies } = chain();
  assert.deepEqual(cascade(activities, dependencies), []);
  const slack = [act('a1', MON, 10), act('a2', '2026-11-18', 5), act('a3', '2026-11-30', 5)];
  assert.deepEqual(cascade(slack, dependencies), []);
  const broken = [act('a1', MON, 10), act('a2', '2026-11-09', 5), act('a3', '2026-11-30', 5)];
  assert.deepEqual(starts(cascade(broken, dependencies)), { a2: '2026-11-16' });
  // Em cadeia: a1 cresce, a2 vai ao mínimo e a3 segue a2 (sem folga).
  const grown = [act('a1', MON, 15), act('a2', '2026-11-16', 5), act('a3', '2026-11-23', 5)];
  assert.deepEqual(starts(cascade(grown, dependencies)), { a2: '2026-11-23', a3: '2026-11-30' });
});

test('descendants conta a árvore inteira e wouldCycle vê ciclo direto e indireto', () => {
  const deps = [dep('d1', 'a1', 'a2'), dep('d2', 'a2', 'a3'), dep('d3', 'a1', 'a4'), dep('d4', 'a4', 'a3')];
  assert.deepEqual([...descendants(deps, 'a1')].sort(), ['a2', 'a3', 'a4']);
  assert.deepEqual([...descendants(deps, 'a2')], ['a3']);
  assert.deepEqual([...descendants(deps, 'a3')], []);
  assert.equal(wouldCycle(deps, 'a2', 'a1'), true); // direto: a1 já é predecessora de a2
  assert.equal(wouldCycle(deps, 'a3', 'a1'), true); // indireto
  assert.equal(wouldCycle(deps, 'a1', 'a1'), true);
  assert.equal(wouldCycle(deps, 'a1', 'a3'), false);
  assert.equal(wouldCycle(deps, 'a2', 'a4'), false);
});

// ----- Medições -----

/** M1 (04/09) e M2 (02/10) fechadas, fora de ordem na lista; M3 (30/10) aberta. */
const rounds = () => ({
  measurements: [measurement('m2', 2, '2026-10-02'), measurement('m1', 1, '2026-09-04'), measurement('m3', 3, '2026-10-30', 'open')],
  items: [item('m1', 'a1', 20), item('m2', 'a1', 50, 20), item('m2', 'a2', 10), item('m3', 'a1', 80, 50)],
});

test('measuredPercents: só medições fechadas, a mais recente por data vale, e `until` limita', () => {
  const { measurements, items } = rounds();
  assert.deepEqual(measuredPercents(measurements, items), { a1: 50, a2: 10 });
  assert.deepEqual(measuredPercents(measurements, items, '2026-09-30'), { a1: 20 });
  assert.deepEqual(measuredPercents(measurements, items, '2026-10-02'), { a1: 50, a2: 10 });
  assert.deepEqual(measuredPercents(measurements, items, '2026-08-01'), {});
  // Duas fechadas no mesmo dia: o número decide.
  const sameDay = [measurement('x1', 1, '2026-10-02'), measurement('x2', 2, '2026-10-02')];
  assert.deepEqual(measuredPercents(sameDay, [item('x2', 'a1', 60), item('x1', 'a1', 40)]), { a1: 60 });
});

test('openMeasurement e editableMeasurement: a aberta tem prioridade; sem aberta, a última fechada por data e número', () => {
  const { measurements } = rounds();
  assert.equal(openMeasurement(measurements)?.id, 'm3');
  assert.equal(editableMeasurement(measurements)?.id, 'm3');
  const closedOnly = measurements.filter(m => m.status === 'closed');
  assert.equal(openMeasurement(closedOnly), undefined);
  assert.equal(editableMeasurement(closedOnly)?.id, 'm2');
  assert.equal(editableMeasurement([measurement('x2', 2, '2026-10-02'), measurement('x3', 3, '2026-10-02')])?.id, 'x3');
  assert.equal(editableMeasurement([]), undefined);
});

test('physicalProgress é ponderado pela duração; plannedProgress idem com o previsto na data', () => {
  const activities = [act('a1', MON, 10), act('a2', MON, 5)];
  assert.equal(physicalProgress(activities, { a1: 50, a2: 100 }), (10 * 50 + 5 * 100) / 15);
  assert.equal(physicalProgress(activities, {}), 0);
  assert.equal(physicalProgress([], {}), undefined);
  // Na quarta 04/11: a1 em 30%, a2 em 60%.
  assert.equal(plannedProgress(activities, '2026-11-04'), (10 * 30 + 5 * 60) / 15);
  assert.equal(plannedProgress(activities, '2026-10-01'), 0);
  assert.equal(plannedProgress(activities, '2026-12-01'), 100);
  assert.equal(plannedProgress([], MON), undefined);
});

test('isLate usa o limiar de 10 pontos: abaixo não conta e concluído nunca é atrasado; delayDays em dias úteis', () => {
  const a = act('a1', MON, 10);
  const monday = '2026-11-09'; // 6 de 10 dias úteis decorridos: previsto 60
  assert.equal(plannedPercent(a, monday), 60);
  assert.equal(isLate(a, 50, monday), true);
  assert.equal(isLate(a, 51, monday), false);
  assert.equal(isLate(a, undefined, monday), true);
  assert.equal(isLate(a, 100, '2027-01-01'), false);
  assert.equal(isLate(a, 0, '2026-10-30'), false); // ainda não começou
  assert.equal(delayDays(a, 50, monday), 1);
  assert.equal(delayDays(a, undefined, monday), 6);
  assert.equal(delayDays(a, 80, monday), 0);
  assert.equal(delayDays(a, 0, '2026-12-01'), 10);
});

test('measurableActivities separa atuais, futuras (até 12 meses) e concluídas', () => {
  const date = '2026-11-04';
  const activities = [
    act('started', MON, 10),
    act('today', date, 5),
    act('soon', '2027-03-01', 5),
    act('far', '2027-12-01', 5),
    act('done', '2026-10-05', 5),
    act('doneAhead', '2027-01-04', 5),
  ];
  const { current, future, done } = measurableActivities(activities, { done: 100, doneAhead: 100, started: 40 }, date);
  assert.deepEqual(
    current.map(a => a.id),
    ['started', 'today'],
  );
  assert.deepEqual(
    future.map(a => a.id),
    ['soon'],
  );
  assert.deepEqual(
    done.map(a => a.id),
    ['done', 'doneAhead'],
  );
});

test('validateMeasurementValue aceita vírgula, arredonda a uma casa, recusa fora de 0–100 e abaixo da anterior', () => {
  assert.equal(validateMeasurementValue('85,5', 0), 85.5);
  assert.equal(validateMeasurementValue('33.333', 0), 33.3);
  assert.equal(validateMeasurementValue(100, 99), 100);
  assert.equal(validateMeasurementValue(50, 50), 50);
  assert.throws(() => validateMeasurementValue(100.1, 0), { message: 'O realizado acumulado vai de 0 a 100%.' });
  assert.throws(() => validateMeasurementValue(-1, 0), { message: 'O realizado acumulado vai de 0 a 100%.' });
  assert.throws(() => validateMeasurementValue('abc', 0), { message: 'O realizado acumulado vai de 0 a 100%.' });
  assert.throws(() => validateMeasurementValue(40, 50), { message: 'O acumulado não pode ficar abaixo da medição anterior (50%).' });
});

test('validateMeasurementValue: campo vazio não é 0%', () => {
  // Number('') é 0 em JavaScript: sem a conferência, um campo em branco gravaria 0% em vez de pedir o valor.
  assert.throws(() => validateMeasurementValue('', 0));
  assert.throws(() => validateMeasurementValue('   ', 0));
});

test('lobSpan dá começo, fim exclusivo e último dia trabalhado', () => {
  const span = lobSpan([act('a1', MON, 10), act('a2', '2026-10-26', 3)])!;
  assert.deepEqual(span, { start: '2026-10-26', end: '2026-11-16', finish: '2026-11-13', days: 21 });
  assert.equal(lobSpan([]), undefined);
});

// ----- Importar do Planejador -----

const planned = (id: string, name: string, start: string, duration: number, over: Partial<LongTermActivity> = {}): LongTermActivity => ({
  id,
  name,
  color: '#eb6834',
  firstFloor: 1,
  lastFloor: 3,
  start,
  duration,
  interval: 7,
  visible: true,
  predecessors: [],
  teams: [],
  ...over,
});
const planDoc = (activities: LongTermActivity[], over: Partial<LongTermPlanDocument> = {}): LongTermPlanDocument => ({
  floorCount: 3,
  floorNames: {},
  activities,
  baselines: [],
  measurements: [],
  ...over,
});

test('fromLongTermPlan: pavimentos viram locais em ordem, serviços e blocos com duração em dias úteis, fs por pavimento e crew entre pavimentos', () => {
  seq = 0;
  // Estrutura: 5 dias corridos a partir da segunda 05/01/2026, ritmo semanal; Alvenaria 7 dias corridos, começa 12/01.
  const doc = planDoc(
    [
      planned('p-est', 'Estrutura', '2026-01-05', 5, { teams: [{ name: 'Equipe A', size: 8 }], unit: 'laje' }),
      planned('p-alv', 'Alvenaria', '2026-01-12', 7, { predecessors: [{ activityId: 'p-est', lagDays: 0 }] }),
    ],
    { floorNames: { '1': 'Térreo' } },
  );
  const imported = fromLongTermPlan(doc, W, NOW, newId);
  assert.deepEqual(
    imported.locals.map(l => [l.name, l.orderIndex, l.workId]),
    [
      ['Térreo', 0, W],
      ['2º', 1, W],
      ['3º', 2, W],
    ],
  );
  assert.deepEqual(
    imported.services.map(s => [s.name, s.color, s.team, s.unit, s.orderIndex]),
    [
      ['Estrutura', '#eb6834', 'Equipe A', 'laje', 0],
      ['Alvenaria', '#eb6834', undefined, undefined, 1],
    ],
  );
  const [est, alv] = imported.services;
  const at = (serviceId: string, floor: number) =>
    imported.activities.find(a => a.serviceId === serviceId && a.localId === imported.locals[floor - 1].id)!;
  assert.equal(imported.activities.length, 6);
  assert.deepEqual(
    [1, 2, 3].map(f => [at(est.id, f).start, at(est.id, f).durationDays]),
    [
      ['2026-01-05', 5],
      ['2026-01-12', 5],
      ['2026-01-19', 5],
    ],
  );
  // 7 dias corridos de segunda a domingo são 5 úteis.
  assert.deepEqual(
    [1, 2, 3].map(f => [at(alv.id, f).start, at(alv.id, f).durationDays]),
    [
      ['2026-01-12', 5],
      ['2026-01-19', 5],
      ['2026-01-26', 5],
    ],
  );
  const kinds = (succ: LobActivity) =>
    imported.dependencies.filter(d => d.successorId === succ.id).map(d => [d.predecessorId, d.lagDays, d.kind]);
  assert.equal(imported.dependencies.length, 7);
  assert.deepEqual(kinds(at(est.id, 1)), []);
  assert.deepEqual(kinds(at(est.id, 2)), [[at(est.id, 1).id, 0, 'crew']]);
  assert.deepEqual(kinds(at(alv.id, 1)), [[at(est.id, 1).id, 0, 'fs']]);
  assert.deepEqual(kinds(at(alv.id, 3)), [
    [at(alv.id, 2).id, 0, 'crew'],
    [at(est.id, 3).id, 0, 'fs'],
  ]);
  assert.ok(imported.activities.every(a => a.workId === W && a.createdAt === NOW && a.launchId === undefined));
  // Nada importado fica antes do mínimo: a cascata não muda nada.
  assert.deepEqual(cascade(imported.activities, imported.dependencies), []);
});

test('fromLongTermPlan: pavimento que começa no fim de semana vai para a segunda e o ritmo vira lag de crew (negativo quando sobrepõe)', () => {
  // Ritmo de 5 dias corridos com 7 de duração: o 2º pavimento começa no sábado 10/01 → segunda 12/01, enquanto o 1º só acaba em 12/01.
  const doc = planDoc([planned('p', 'Estrutura', '2026-01-05', 7, { interval: 5 })]);
  const imported = fromLongTermPlan(doc, W, NOW, newId);
  assert.deepEqual(
    imported.activities.map(a => [a.start, a.durationDays]),
    [
      ['2026-01-05', 5],
      ['2026-01-12', 5], // sábado 10/01 → segunda 12/01; até o sábado 17/01 são 5 úteis
      ['2026-01-15', 5], // quinta 15/01 até quinta 22/01: 5 úteis
    ],
  );
  // 1º acaba em 12/01 e o 2º começa em 12/01: lag 0; o 2º acaba em 19/01 e o 3º começa em 15/01: lag −2.
  assert.deepEqual(
    imported.dependencies.map(d => [d.kind, d.lagDays]),
    [
      ['crew', 0],
      ['crew', -2],
    ],
  );
});

test('fromLongTermPlan com o plano de exemplo: um bloco por serviço × pavimento, crew entre pavimentos e fs por predecessora', () => {
  const doc = examplePlanDocument('2026-01-05', 4);
  const imported = fromLongTermPlan(doc, W, NOW, newId);
  assert.equal(imported.locals.length, 4);
  assert.equal(imported.services.length, 6);
  assert.equal(imported.activities.length, 24);
  assert.equal(imported.dependencies.filter(d => d.kind === 'crew').length, 18);
  assert.equal(imported.dependencies.filter(d => d.kind === 'fs').length, 20);
  assert.ok(imported.activities.every(a => a.start === nextWorkday(a.start) && a.durationDays >= 1));
});

test('fromLongTermPlan: a espera das predecessoras do Planejador é em dias corridos e os blocos importados não violam o mínimo', () => {
  // Estrutura 05/01 (5 dias, ritmo 7); Alvenaria depende dela com 14 dias corridos: o Planejador a coloca em 24/01 (sábado) → 26/01.
  // Importada como 14 dias ÚTEIS, o mínimo da Alvenaria passaria a 30/01 e a cascata moveria um bloco que o usuário não tocou:
  // a espera vira dias úteis e nunca passa da folga real entre os blocos.
  const doc = planDoc([
    planned('p-est', 'Estrutura', '2026-01-05', 5),
    planned('p-alv', 'Alvenaria', '2026-01-24', 7, { predecessors: [{ activityId: 'p-est', lagDays: 14 }] }),
  ]);
  const imported = fromLongTermPlan(doc, W, NOW, newId);
  assert.deepEqual(cascade(imported.activities, imported.dependencies), []);
});

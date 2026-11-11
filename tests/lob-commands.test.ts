import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lobCommandTarget,
  parseLobCommand,
  planLobCommand,
  type LobContext,
  type LobExtras,
  type LobMutation,
  type LobTable,
} from '../src/application/use-cases/lob-commands';
import {
  LOB_COLORS,
  LOB_LIMITS,
  lobPhotoPaths,
  type LobActivity,
  type LobCommand,
  type LobCostItem,
  type LobData,
  type LobDependency,
  type LobDependencyKind,
  type LobMeasurement,
  type LobMeasurementItem,
  type LobPhoto,
  type ServiceFlow,
} from '../src/domain/lob';
import type { LongTermActivity, LongTermPlanDocument } from '../src/domain/long-term-plan';

const NOW = '2026-11-04T12:00:00.000Z';
const TODAY = '2026-11-04';
const OLD = '2026-10-01T12:00:00.000Z';
const W = 'obra-1';
const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const I1 = '33333333-3333-4333-8333-000000000001';
const I2 = '33333333-3333-4333-8333-000000000002';
const NEW_ITEM = '33333333-3333-4333-8333-000000000099';
const PHOTO = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const COST = (n: number) => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;

let seq = 0;
const ctx = (over: Partial<LobContext> = {}): LobContext => ({
  actorId: 'u1',
  now: NOW,
  today: TODAY,
  newId: () => `id-${++seq}`,
  ...over,
});
const stamp = { createdAt: OLD, updatedAt: OLD };

const act = (id: string, serviceId: string, localId: string, start: string, over: Partial<LobActivity> = {}): LobActivity => ({
  id,
  workId: W,
  serviceId,
  localId,
  start,
  durationDays: 10,
  ...stamp,
  ...over,
});
const dep = (id: string, predecessorId: string, successorId: string, kind: LobDependencyKind, lagDays = 0): LobDependency => ({
  id,
  workId: W,
  predecessorId,
  successorId,
  lagDays,
  kind,
  createdAt: OLD,
});
const measurement = (id: string, number: number, date: string, status: 'open' | 'closed' = 'closed'): LobMeasurement => ({
  id,
  workId: W,
  number,
  date,
  status,
  createdBy: 'u1',
  ...stamp,
  ...(status === 'closed' ? { closedAt: OLD, closedBy: 'u1' } : {}),
});
const item = (id: string, measurementId: string, activityId: string, value: number, previousValue = 0): LobMeasurementItem => ({
  id,
  measurementId,
  workId: W,
  activityId,
  value,
  previousValue,
  createdBy: 'u1',
  ...stamp,
});
const photo = (n: number, itemId: string, measurementId: string, activityId: string): LobPhoto => ({
  id: PHOTO(n),
  itemId,
  measurementId,
  workId: W,
  activityId,
  ...lobPhotoPaths(W, itemId, PHOTO(n)),
  createdBy: 'u1',
  createdAt: OLD,
});

/** Obra com Estrutura e Alvenaria em Térreo, 1º e 2º pavimento, encadeadas sem folga:
 * Estrutura 05/10 → 19/10 → 02/11 (crew); Alvenaria 5 dias úteis depois de cada Estrutura (fs)
 * e seguindo pelos locais (crew): 26/10 → 09/11 → 23/11. Medição #1 fechada em 16/10 com
 * Estrutura · Térreo em 50% e uma foto; linha de base "Inicial" igual ao estado atual. */
function fixture(): LobData {
  const activities = [
    act('a11', 's1', 'l1', '2026-10-05', { actualStart: '2026-10-05' }),
    act('a12', 's1', 'l2', '2026-10-19'),
    act('a13', 's1', 'l3', '2026-11-02'),
    act('a21', 's2', 'l1', '2026-10-26'),
    act('a22', 's2', 'l2', '2026-11-09'),
    act('a23', 's2', 'l3', '2026-11-23'),
  ];
  return {
    locals: [
      { id: 'l1', workId: W, name: 'Térreo', orderIndex: 0, ...stamp },
      { id: 'l2', workId: W, name: '1º pavimento', orderIndex: 1, ...stamp },
      { id: 'l3', workId: W, name: '2º pavimento', orderIndex: 2, ...stamp },
    ],
    services: [
      { id: 's1', workId: W, name: 'Estrutura', color: LOB_COLORS[0], team: 'Equipe A', unit: 'laje', orderIndex: 0, ...stamp },
      { id: 's2', workId: W, name: 'Alvenaria', color: LOB_COLORS[1], orderIndex: 1, ...stamp },
    ],
    activities,
    dependencies: [
      dep('d1', 'a11', 'a12', 'crew'),
      dep('d2', 'a12', 'a13', 'crew'),
      dep('d3', 'a11', 'a21', 'fs', 5),
      dep('d4', 'a12', 'a22', 'fs', 5),
      dep('d5', 'a13', 'a23', 'fs', 5),
      dep('d6', 'a21', 'a22', 'crew'),
      dep('d7', 'a22', 'a23', 'crew'),
    ],
    baselines: [
      {
        id: 'b1',
        workId: W,
        name: 'Inicial',
        automatic: false,
        createdBy: 'u1',
        createdAt: OLD,
        snapshot: activities.map(a => ({
          activityId: a.id,
          serviceId: a.serviceId,
          localId: a.localId,
          start: a.start,
          durationDays: a.durationDays,
        })),
      },
    ],
    launches: [],
    measurements: [measurement(M1, 1, '2026-10-16')],
    items: [item(I1, M1, 'a11', 50)],
    photos: [photo(1, I1, M1, 'a11')],
    costs: [],
  };
}
/** A obra com a medição #2 aberta em 04/11, ainda sem lançamentos. */
function withOpen(): LobData {
  const d = fixture();
  d.measurements.push(measurement(M2, 2, TODAY, 'open'));
  return d;
}
/** Obra vazia (sem locais, serviços nem blocos). */
const empty = (): LobData => ({
  ...fixture(),
  locals: [],
  services: [],
  activities: [],
  dependencies: [],
  baselines: [],
  measurements: [],
  items: [],
  photos: [],
  costs: [],
});

const run = (d: LobData, c: LobCommand, extras: LobExtras = {}, over: Partial<LobContext> = {}) => planLobCommand(d, c, ctx(over), extras);
const rejects = (d: LobData, c: LobCommand, message: string | RegExp, extras: LobExtras = {}, over: Partial<LobContext> = {}) =>
  assert.throws(() => run(d, c, extras, over), typeof message === 'string' ? { message } : message);
const TABLES: readonly LobTable[] = [
  'locals',
  'services',
  'activities',
  'dependencies',
  'baselines',
  'launches',
  'measurements',
  'items',
  'photos',
  'costs',
];
const touched = (m: LobMutation) =>
  TABLES.flatMap(t => [...m.insert[t].map(() => `+${t}`), ...m.update[t].map(() => `~${t}`), ...m.delete[t].map(() => `-${t}`)]).sort();
const starts = (list: LobActivity[]) => Object.fromEntries(list.map(a => [a.id, a.start]).sort());

const flow = (over: Partial<ServiceFlow> = {}): ServiceFlow => ({
  id: 'flow-1',
  name: 'Residencial padrão',
  direction: 'bottom_up',
  services: [
    { id: 'f-est', name: 'ESTRUTURA', color: '#2a78d6', durationDays: 10, predecessors: [] },
    { id: 'f-alv', name: 'Alvenaria', color: '#eb6834', durationDays: 10, predecessors: [{ serviceId: 'f-est', lagDays: 5 }] },
    {
      id: 'f-con',
      name: 'Contrapiso',
      color: '#1baf7a',
      durationDays: 5,
      team: 'Contrapiso · 4',
      unit: 'm²',
      predecessors: [{ serviceId: 'f-alv', lagDays: 0 }],
    },
  ],
  revision: 1,
  createdBy: 'u1',
  createdAt: OLD,
  updatedBy: 'u1',
  updatedAt: OLD,
  ...over,
});
const launchFlow = (over: Partial<Extract<LobCommand, { type: 'launch_flow' }>['params']> = {}): LobCommand => ({
  type: 'launch_flow',
  workId: W,
  flowId: 'flow-1',
  params: { localIds: ['l1', 'l2', 'l3'], start: '2026-10-05', direction: 'bottom_up', rhythm: { kind: 'continuous' }, ...over },
});

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
const planDoc = (activities: LongTermActivity[], floorNames: Record<string, string> = {}): LongTermPlanDocument => ({
  floorCount: 3,
  floorNames,
  activities,
  baselines: [],
  measurements: [],
});
const plannerDocument = (floorNames: Record<string, string> = {}) =>
  planDoc(
    [
      planned('p-est', 'Estrutura', '2026-01-05', 5),
      planned('p-alv', 'Alvenaria', '2026-01-12', 7, { predecessors: [{ activityId: 'p-est', lagDays: 0 }] }),
    ],
    floorNames,
  );

// ----- Leitura do comando -----

test('parseLobCommand recusa comando desconhecido ou malformado', () => {
  assert.throws(() => parseLobCommand({ type: 'explodir_obra' }), { message: 'Comando desconhecido.' });
  assert.throws(() => parseLobCommand(null), { message: 'Comando inválido.' });
  assert.throws(() => parseLobCommand('create_locals'), { message: 'Comando inválido.' });
  assert.throws(() => parseLobCommand({ type: 'create_locals', names: ['Térreo'] }), { message: 'Obra não informada.' });
});

test('parse create_locals: lista obrigatória, nomes vazios descartados, ao menos um nome', () => {
  assert.throws(() => parseLobCommand({ type: 'create_locals', workId: W, names: [] }), { message: 'Informe ao menos um nome de local.' });
  assert.throws(() => parseLobCommand({ type: 'create_locals', workId: W, names: ['', '   '] }), {
    message: 'Informe ao menos um nome de local.',
  });
  assert.throws(() => parseLobCommand({ type: 'create_locals', workId: W, names: 'Térreo' }), { message: 'Lista de nomes inválida.' });
  assert.deepEqual(parseLobCommand({ type: 'create_locals', workId: W, names: [' Térreo ', '', 'Cobertura'] }), {
    type: 'create_locals',
    workId: W,
    names: ['Térreo', 'Cobertura'],
  });
});

test('parse save_items: itemId precisa ser UUID, valor obrigatório, lista não vazia', () => {
  const base = { type: 'save_items', measurementId: M2 };
  assert.throws(() => parseLobCommand({ ...base, items: [{ itemId: 'item-1', activityId: 'a11', value: 10 }] }), {
    message: 'Identificador do lançamento inválido.',
  });
  assert.throws(() => parseLobCommand({ ...base, items: [{ activityId: 'a11', value: 10 }] }), {
    message: 'Lançamento sem identificador.',
  });
  assert.throws(() => parseLobCommand({ ...base, items: [{ itemId: NEW_ITEM, activityId: 'a11' }] }), {
    message: 'Informe o realizado acumulado.',
  });
  assert.throws(() => parseLobCommand({ ...base, items: [] }), { message: 'Nenhum lançamento para salvar.' });
  assert.throws(() => parseLobCommand({ ...base, items: 'x' }), { message: 'Lista de lançamentos inválida.' });
  const ok = parseLobCommand({
    ...base,
    items: [{ itemId: NEW_ITEM, activityId: 'a11', value: '85,5', note: '', delayCause: 'Retrabalho' }],
  });
  assert.deepEqual(ok, {
    type: 'save_items',
    measurementId: M2,
    items: [{ itemId: NEW_ITEM, activityId: 'a11', value: '85,5', note: null, delayCause: 'Retrabalho' }],
  });
});

test('parse add_photo: dimensões e tamanho válidos, identificador UUID', () => {
  const base = { type: 'add_photo', itemId: I1, photoId: PHOTO(2), ...lobPhotoPaths(W, I1, PHOTO(2)) };
  assert.throws(() => parseLobCommand({ ...base, width: 0, height: 1200 }), { message: 'Dimensão da foto inválida.' });
  assert.throws(() => parseLobCommand({ ...base, width: 1600, height: 'alta' }), { message: 'Dimensão da foto inválida.' });
  assert.throws(() => parseLobCommand({ ...base, width: 1600, height: 1200, bytes: LOB_LIMITS.maxPhotoBytes + 1 }), {
    message: 'A foto passa do tamanho máximo.',
  });
  assert.throws(() => parseLobCommand({ ...base, photoId: 'foto-1' }), { message: 'Identificador da foto inválido.' });
  assert.throws(() => parseLobCommand({ type: 'add_photo', itemId: I1, photoId: PHOTO(2) }), { message: 'Caminho da foto ausente.' });
  const ok = parseLobCommand({ ...base, width: 1600, height: 1200, bytes: 250_000 });
  assert.deepEqual(ok, { ...base, width: 1600, height: 1200, bytes: 250_000 });
  assert.deepEqual(parseLobCommand(base), { ...base, width: undefined, height: undefined, bytes: undefined });
});

test('parse launch_flow: locais obrigatórios e sem repetição, sentido e ritmo com padrão, takt inválido recusado', () => {
  const base = { type: 'launch_flow', workId: W, flowId: 'flow-1' };
  assert.throws(() => parseLobCommand({ ...base, params: { start: '2026-10-05' } }), { message: 'Marque os locais do lançamento.' });
  assert.throws(() => parseLobCommand({ ...base, params: { localIds: ['l1', ''], start: '2026-10-05' } }), {
    message: 'Marque os locais do lançamento.',
  });
  assert.throws(() => parseLobCommand({ ...base }), { message: 'Marque os locais do lançamento.' });
  assert.throws(() => parseLobCommand({ ...base, params: { localIds: ['l1'], start: '05/10/2026' } }), {
    message: 'Data de início inválida.',
  });
  assert.throws(() => parseLobCommand({ ...base, params: { localIds: ['l1'], start: '2026-10-05', rhythm: { kind: 'takt', days: 0 } } }), {
    message: 'Takt inválido: informe de 1 a 365 dias úteis.',
  });
  assert.throws(
    () => parseLobCommand({ ...base, params: { localIds: ['l1'], start: '2026-10-05', rhythm: { kind: 'takt', days: 2.5 } } }),
    {
      message: 'Takt inválido: informe de 1 a 365 dias úteis.',
    },
  );
  assert.throws(() => parseLobCommand({ ...base, params: { localIds: ['l1'], start: '2026-10-05', rhythm: { kind: 'takt' } } }), {
    message: 'Takt inválido: informe de 1 a 365 dias úteis.',
  });
  assert.throws(() => parseLobCommand({ type: 'launch_flow', workId: W, params: { localIds: ['l1'], start: '2026-10-05' } }), {
    message: 'Fluxo não informado.',
  });
  assert.deepEqual(
    parseLobCommand({
      ...base,
      params: { localIds: ['l1', 'l2', 'l1'], start: '2026-10-05', direction: 'diagonal', rhythm: { kind: 'ritmo' } },
    }),
    {
      type: 'launch_flow',
      workId: W,
      flowId: 'flow-1',
      params: { localIds: ['l1', 'l2'], start: '2026-10-05', direction: 'bottom_up', rhythm: { kind: 'continuous' } },
    },
  );
  const takt = parseLobCommand({
    ...base,
    params: { localIds: ['l1'], start: '2026-10-05', direction: 'top_down', rhythm: { kind: 'takt', days: '15' } },
  });
  assert.deepEqual((takt as Extract<LobCommand, { type: 'launch_flow' }>).params, {
    localIds: ['l1'],
    start: '2026-10-05',
    direction: 'top_down',
    rhythm: { kind: 'takt', days: 15 },
  });
});

test('parse dos demais comandos: datas, inteiros, textos opcionais e cores só passam adiante', () => {
  assert.throws(
    () => parseLobCommand({ type: 'create_activity', workId: W, serviceId: 's1', localId: 'l1', start: '2026-10-05', durationDays: 0 }),
    {
      message: 'Duração inválida: informe de 1 a 730 dias úteis.',
    },
  );
  assert.throws(
    () => parseLobCommand({ type: 'create_activity', workId: W, serviceId: 's1', localId: 'l1', start: '2026-02-30', durationDays: 5 }),
    {
      message: 'Data de início inválida.',
    },
  );
  assert.throws(
    () => parseLobCommand({ type: 'create_activity', workId: W, serviceId: 's1', localId: 'l1', start: '05/10/2026', durationDays: 5 }),
    {
      message: 'Data de início inválida.',
    },
  );
  assert.throws(() => parseLobCommand({ type: 'open_measurement', workId: W, measurementId: 'm-2', date: TODAY }), {
    message: 'Identificador da medição inválido.',
  });
  assert.throws(
    () => parseLobCommand({ type: 'add_dependency', workId: W, predecessorId: 'a11', successorId: 'a12', lagDays: 400 }),
    /Espera inválida/,
  );
  assert.throws(() => parseLobCommand({ type: 'rename_local', localId: 'l1', name: '   ' }), { message: 'Informe o nome do local.' });
  assert.throws(() => parseLobCommand({ type: 'create_baseline', workId: W, name: 'x'.repeat(121) }), {
    message: 'O nome da linha de base passa de 120 caracteres.',
  });
  assert.deepEqual(parseLobCommand({ type: 'add_dependency', workId: W, predecessorId: 'a11', successorId: 'a12' }), {
    type: 'add_dependency',
    workId: W,
    predecessorId: 'a11',
    successorId: 'a12',
    lagDays: 0,
    kind: 'fs',
  });
  assert.deepEqual(parseLobCommand({ type: 'update_service', serviceId: 's1', team: '', color: 'vermelho' }), {
    type: 'update_service',
    serviceId: 's1',
    name: undefined,
    color: 'vermelho',
    team: null,
    unit: undefined,
  });
  assert.deepEqual(parseLobCommand({ type: 'update_activity', activityId: 'a11', notes: ' obs ', actualStart: '', durationDays: '12' }), {
    type: 'update_activity',
    activityId: 'a11',
    start: undefined,
    durationDays: 12,
    notes: 'obs',
    actualStart: null,
    actualFinish: undefined,
  });
  assert.deepEqual(parseLobCommand({ type: 'import_planner', workId: W }), { type: 'import_planner', workId: W });
});

test('parse: mês ou dia fora do calendário ("2026-13-01") é "data inválida", não um RangeError', () => {
  // isLocalDate (long-term-plan.ts) chamava toISOString() em Date(NaN) e estourava antes de devolver false.
  assert.throws(
    () => parseLobCommand({ type: 'create_activity', workId: W, serviceId: 's1', localId: 'l1', start: '2026-13-01', durationDays: 5 }),
    {
      message: 'Data de início inválida.',
    },
  );
  assert.throws(() => parseLobCommand({ type: 'open_measurement', workId: W, measurementId: M2, date: '2026-11-32' }), {
    message: 'Data da medição inválida.',
  });
});

test('lobCommandTarget devolve a tabela certa para cada comando com id e a obra para os demais', () => {
  const cases: [LobCommand, ReturnType<typeof lobCommandTarget>][] = [
    [{ type: 'create_locals', workId: W, names: ['x'] }, { workId: W }],
    [
      { type: 'rename_local', localId: 'l1', name: 'x' },
      { table: 'locals', id: 'l1' },
    ],
    [
      { type: 'delete_local', localId: 'l1' },
      { table: 'locals', id: 'l1' },
    ],
    [{ type: 'reorder_locals', workId: W, localIds: [] }, { workId: W }],
    [
      { type: 'update_service', serviceId: 's1' },
      { table: 'services', id: 's1' },
    ],
    [
      { type: 'delete_service', serviceId: 's1' },
      { table: 'services', id: 's1' },
    ],
    [
      { type: 'update_activity', activityId: 'a11' },
      { table: 'activities', id: 'a11' },
    ],
    [
      { type: 'delete_activity', activityId: 'a11' },
      { table: 'activities', id: 'a11' },
    ],
    [
      { type: 'update_dependency', dependencyId: 'd1', lagDays: 1 },
      { table: 'dependencies', id: 'd1' },
    ],
    [
      { type: 'remove_dependency', dependencyId: 'd1' },
      { table: 'dependencies', id: 'd1' },
    ],
    [
      { type: 'restore_baseline', baselineId: 'b1' },
      { table: 'baselines', id: 'b1' },
    ],
    [
      { type: 'delete_baseline', baselineId: 'b1' },
      { table: 'baselines', id: 'b1' },
    ],
    [{ type: 'open_measurement', workId: W, measurementId: M2, date: TODAY }, { workId: W }],
    [
      { type: 'update_measurement', measurementId: M1 },
      { table: 'measurements', id: M1 },
    ],
    [
      { type: 'save_items', measurementId: M1, items: [] },
      { table: 'measurements', id: M1 },
    ],
    [
      { type: 'close_measurement', measurementId: M1 },
      { table: 'measurements', id: M1 },
    ],
    [
      { type: 'delete_measurement', measurementId: M1 },
      { table: 'measurements', id: M1 },
    ],
    [
      { type: 'remove_item', itemId: I1 },
      { table: 'items', id: I1 },
    ],
    [
      { type: 'add_photo', itemId: I1, photoId: PHOTO(2), storagePath: 'a', thumbPath: 'b' },
      { table: 'items', id: I1 },
    ],
    [
      { type: 'delete_photo', photoId: PHOTO(1) },
      { table: 'photos', id: PHOTO(1) },
    ],
    [launchFlow(), { workId: W }],
    [{ type: 'import_planner', workId: W }, { workId: W }],
    [{ type: 'create_baseline', workId: W, name: 'x' }, { workId: W }],
    [{ type: 'save_costs', workId: W, upsert: [], remove: [COST(1)] }, { workId: W }],
  ];
  for (const [command, expected] of cases) assert.deepEqual(lobCommandTarget(command), expected, command.type);
  // Comando sem workId acha a obra pelo registro; registro inexistente é recusado.
  assert.equal(run(fixture(), { type: 'rename_local', localId: 'l1', name: 'Subsolo' }).workId, W);
  rejects(fixture(), { type: 'rename_local', localId: 'nada', name: 'Subsolo' }, 'Registro não encontrado. Recarregue a página.');
});

// ----- Locais -----

test('create_locals continua a ordem e recusa nome repetido ignorando acento e caixa', () => {
  const m = run(fixture(), { type: 'create_locals', workId: W, names: ['Cobertura', 'Subsolo'] });
  assert.deepEqual(
    m.insert.locals.map(l => [l.name, l.orderIndex, l.workId, l.createdAt]),
    [
      ['Cobertura', 3, W, NOW],
      ['Subsolo', 4, W, NOW],
    ],
  );
  assert.deepEqual(touched(m), ['+locals', '+locals']);
  rejects(fixture(), { type: 'create_locals', workId: W, names: ['TERREO'] }, 'O local "TERREO" já existe.');
  rejects(fixture(), { type: 'create_locals', workId: W, names: ['Cobertura', ' cobertura '] }, 'O local "cobertura" já existe.');
  assert.equal(run(empty(), { type: 'create_locals', workId: W, names: ['Térreo'] }).insert.locals[0].orderIndex, 0);
});

test('rename_local aceita o próprio nome em outra grafia e recusa o de outro local', () => {
  const m = run(fixture(), { type: 'rename_local', localId: 'l1', name: 'TÉRREO' });
  assert.deepEqual(
    [m.update.locals[0].id, m.update.locals[0].name, m.update.locals[0].orderIndex, m.update.locals[0].updatedAt],
    ['l1', 'TÉRREO', 0, NOW],
  );
  rejects(fixture(), { type: 'rename_local', localId: 'l1', name: '1º PAVIMENTO' }, 'O local "1º PAVIMENTO" já existe.');
  rejects(fixture(), { type: 'rename_local', localId: 'nada', name: 'X' }, 'Registro não encontrado. Recarregue a página.');
});

test('reorder_locals exige exatamente os locais da obra e grava só os que mudaram', () => {
  const m = run(fixture(), { type: 'reorder_locals', workId: W, localIds: ['l3', 'l2', 'l1'] });
  assert.deepEqual(
    m.update.locals.map(l => [l.id, l.orderIndex]),
    [
      ['l3', 0],
      ['l1', 2],
    ],
  );
  const stale = 'A ordem não bate com os locais da obra. Recarregue a página.';
  rejects(fixture(), { type: 'reorder_locals', workId: W, localIds: ['l3', 'l1'] }, stale);
  rejects(fixture(), { type: 'reorder_locals', workId: W, localIds: ['l3', 'l1', 'l1'] }, stale);
  rejects(fixture(), { type: 'reorder_locals', workId: W, localIds: ['l3', 'l1', 'outro'] }, stale);
  assert.deepEqual(touched(run(fixture(), { type: 'reorder_locals', workId: W, localIds: ['l1', 'l2', 'l3'] })), []);
});

test('delete_local: com blocos recusado, sem blocos aceito', () => {
  rejects(fixture(), { type: 'delete_local', localId: 'l1' }, 'O local "Térreo" tem 2 blocos. Exclua-os antes de excluir o local.');
  const d = fixture();
  d.activities = d.activities.filter(a => a.id !== 'a13');
  rejects(d, { type: 'delete_local', localId: 'l3' }, 'O local "2º pavimento" tem 1 bloco. Exclua-os antes de excluir o local.');
  d.locals.push({ id: 'l4', workId: W, name: 'Cobertura', orderIndex: 3, ...stamp });
  const m = run(d, { type: 'delete_local', localId: 'l4' });
  assert.deepEqual(m.delete.locals, ['l4']);
  assert.deepEqual(touched(m), ['-locals']);
});

// ----- Serviços -----

test('create_service: cor padrão da paleta pela posição, cor inválida idem, ordem continuada, nome único', () => {
  const m = run(fixture(), { type: 'create_service', workId: W, name: 'Instalações' });
  const s = m.insert.services[0];
  assert.deepEqual(
    [s.name, s.color, s.orderIndex, s.team, s.unit, s.workId, s.createdAt],
    ['Instalações', LOB_COLORS[2], 2, undefined, undefined, W, NOW],
  );
  assert.equal(
    run(fixture(), { type: 'create_service', workId: W, name: 'Instalações', color: 'laranja' }).insert.services[0].color,
    LOB_COLORS[2],
  );
  assert.equal(
    run(fixture(), { type: 'create_service', workId: W, name: 'Instalações', color: '#ABCDEF' }).insert.services[0].color,
    '#abcdef',
  );
  assert.equal(
    run(fixture(), { type: 'create_service', workId: W, name: 'Instalações', team: 'Hidráulica', unit: 'apartamento' }).insert.services[0]
      .team,
    'Hidráulica',
  );
  rejects(fixture(), { type: 'create_service', workId: W, name: ' ESTRUTURA ' }, 'O serviço " ESTRUTURA " já existe.');
});

test('update_service: equipe nula limpa, cor inválida mantém a atual, nome repetido recusado', () => {
  const m = run(fixture(), { type: 'update_service', serviceId: 's1', team: null, color: 'azul', unit: 'm²' });
  const s = m.update.services[0];
  assert.deepEqual([s.id, s.name, s.color, s.team, s.unit, s.updatedAt], ['s1', 'Estrutura', LOB_COLORS[0], undefined, 'm²', NOW]);
  assert.equal(run(fixture(), { type: 'update_service', serviceId: 's1', name: 'ESTRUTURA' }).update.services[0].name, 'ESTRUTURA');
  assert.equal(run(fixture(), { type: 'update_service', serviceId: 's1' }).update.services[0].team, 'Equipe A');
  rejects(fixture(), { type: 'update_service', serviceId: 's1', name: 'alvenaria' }, 'O serviço "alvenaria" já existe.');
  rejects(fixture(), { type: 'update_service', serviceId: 'nada', name: 'x' }, 'Registro não encontrado. Recarregue a página.');
});

test('delete_service: com medição recusado; sem medição apaga blocos e dependências do serviço', () => {
  rejects(fixture(), { type: 'delete_service', serviceId: 's1' }, '"Estrutura" já tem medições registradas e não pode ser excluído.');
  const m = run(fixture(), { type: 'delete_service', serviceId: 's2' });
  assert.deepEqual(m.delete.services, ['s2']);
  assert.deepEqual(m.delete.activities.sort(), ['a21', 'a22', 'a23']);
  assert.deepEqual(m.delete.dependencies.sort(), ['d3', 'd4', 'd5', 'd6', 'd7']);
  assert.deepEqual(
    touched(m).filter(t => !t.startsWith('-activities') && !t.startsWith('-dependencies')),
    ['-services'],
  );
});

// ----- Blocos e dependências -----

test('create_activity: um bloco por serviço × local, início em sábado vira segunda', () => {
  rejects(
    fixture(),
    { type: 'create_activity', workId: W, serviceId: 's1', localId: 'l1', start: '2026-11-07', durationDays: 5 },
    'Este serviço já tem um bloco neste local.',
  );
  rejects(
    fixture(),
    { type: 'create_activity', workId: W, serviceId: 'nada', localId: 'l1', start: '2026-11-07', durationDays: 5 },
    'Serviço não encontrado. Recarregue a página.',
  );
  rejects(
    fixture(),
    { type: 'create_activity', workId: W, serviceId: 's1', localId: 'nada', start: '2026-11-07', durationDays: 5 },
    'Local não encontrado. Recarregue a página.',
  );
  const d = fixture();
  d.locals.push({ id: 'l4', workId: W, name: 'Cobertura', orderIndex: 3, ...stamp });
  const m = run(d, { type: 'create_activity', workId: W, serviceId: 's1', localId: 'l4', start: '2026-11-07', durationDays: 5 });
  const a = m.insert.activities[0];
  assert.deepEqual(
    [a.serviceId, a.localId, a.start, a.durationDays, a.workId, a.launchId, a.createdAt],
    ['s1', 'l4', '2026-11-09', 5, W, undefined, NOW],
  );
  assert.deepEqual(touched(m), ['+activities']);
});

test('update_activity move o bloco e empurra as sucessoras só o necessário', () => {
  // Estrutura · 2º uma semana para frente (09/11, fim 23/11): só a Alvenaria · 2º segue (23/11 + 5 = 30/11).
  const m = run(fixture(), { type: 'update_activity', activityId: 'a13', start: '2026-11-09' });
  assert.deepEqual(starts(m.update.activities), { a13: '2026-11-09', a23: '2026-11-30' });
  assert.ok(m.update.activities.every(a => a.updatedAt === NOW));
  assert.deepEqual(touched(m), ['~activities', '~activities']);
  // Estrutura · Térreo uma semana para frente arrasta toda a obra.
  const all = run(fixture(), { type: 'update_activity', activityId: 'a11', start: '2026-10-12' });
  assert.deepEqual(starts(all.update.activities), {
    a11: '2026-10-12',
    a12: '2026-10-26',
    a13: '2026-11-09',
    a21: '2026-11-02',
    a22: '2026-11-16',
    a23: '2026-11-30',
  });
  // Puxar para trás não passa do mínimo (regra 16): a23 fica em 23/11 e nada mais muda... exceto o carimbo.
  const back = run(fixture(), { type: 'update_activity', activityId: 'a23', start: '2026-11-02' });
  assert.deepEqual(starts(back.update.activities), { a23: '2026-11-23' });
  // Esticar a duração também empurra.
  const longer = run(fixture(), { type: 'update_activity', activityId: 'a13', durationDays: 12 });
  assert.deepEqual(starts(longer.update.activities), { a13: '2026-11-02', a23: '2026-11-25' });
  assert.equal(longer.update.activities.find(a => a.id === 'a13')!.durationDays, 12);
  // Início em sábado vira segunda.
  assert.equal(
    run(fixture(), { type: 'update_activity', activityId: 'a11', start: '2026-10-03' }).update.activities.find(a => a.id === 'a11')!.start,
    '2026-10-05',
  );
});

test('update_activity: observação e datas reais; término antes do início e data futura recusados', () => {
  const m = run(fixture(), {
    type: 'update_activity',
    activityId: 'a12',
    notes: ' Concreto usinado ',
    actualStart: '2026-10-20',
    actualFinish: '2026-11-03',
  });
  assert.deepEqual(touched(m), ['~activities']);
  assert.deepEqual(
    [m.update.activities[0].notes, m.update.activities[0].actualStart, m.update.activities[0].actualFinish, m.update.activities[0].start],
    [' Concreto usinado ', '2026-10-20', '2026-11-03', '2026-10-19'],
  );
  assert.equal(
    run(fixture(), { type: 'update_activity', activityId: 'a11', actualStart: null }).update.activities[0].actualStart,
    undefined,
  );
  rejects(
    fixture(),
    { type: 'update_activity', activityId: 'a12', actualStart: '2026-10-20', actualFinish: '2026-10-19' },
    'O término real não pode vir antes do início real.',
  );
  rejects(
    fixture(),
    { type: 'update_activity', activityId: 'a11', actualFinish: '2026-10-01' },
    'O término real não pode vir antes do início real.',
  );
  rejects(
    fixture(),
    { type: 'update_activity', activityId: 'a12', actualStart: '2026-11-05' },
    'A data de início real não pode estar no futuro.',
  );
  rejects(
    fixture(),
    { type: 'update_activity', activityId: 'a11', actualFinish: '2026-11-05' },
    'A data de término real não pode estar no futuro.',
  );
  assert.equal(
    run(fixture(), { type: 'update_activity', activityId: 'a11', actualFinish: TODAY }).update.activities[0].actualFinish,
    TODAY,
  );
  rejects(fixture(), { type: 'update_activity', activityId: 'nada', notes: 'x' }, 'Registro não encontrado. Recarregue a página.');
});

test('delete_activity: medido recusado; sem medição apaga o bloco e suas dependências', () => {
  rejects(fixture(), { type: 'delete_activity', activityId: 'a11' }, 'Estrutura · Térreo já foi medido e não pode ser excluído.');
  const m = run(fixture(), { type: 'delete_activity', activityId: 'a23' });
  assert.deepEqual(m.delete.activities, ['a23']);
  assert.deepEqual(m.delete.dependencies.sort(), ['d5', 'd7']);
  assert.deepEqual(touched(m), ['-activities', '-dependencies', '-dependencies']);
});

test('add_dependency: ciclo e repetição recusados; aceita e empurra a sucessora', () => {
  rejects(
    fixture(),
    { type: 'add_dependency', workId: W, predecessorId: 'a23', successorId: 'a11', lagDays: 0 },
    'Ligar Alvenaria · 2º pavimento → Estrutura · Térreo fecharia um ciclo.',
  );
  rejects(
    fixture(),
    { type: 'add_dependency', workId: W, predecessorId: 'a12', successorId: 'a11', lagDays: 0 },
    'Ligar Estrutura · 1º pavimento → Estrutura · Térreo fecharia um ciclo.',
  );
  rejects(
    fixture(),
    { type: 'add_dependency', workId: W, predecessorId: 'a11', successorId: 'a12', lagDays: 3 },
    'Essa dependência já existe.',
  );
  rejects(
    fixture(),
    { type: 'add_dependency', workId: W, predecessorId: 'nada', successorId: 'a12', lagDays: 0 },
    'Predecessora não encontrada. Recarregue a página.',
  );
  // Alvenaria · Térreo (fim 09/11) → Estrutura · 2º (02/11): empurra para 09/11 e, em cadeia, Alvenaria · 2º para 30/11.
  const m = run(fixture(), { type: 'add_dependency', workId: W, predecessorId: 'a21', successorId: 'a13', lagDays: 0, kind: 'fs' });
  assert.deepEqual(
    m.insert.dependencies.map(d => [d.predecessorId, d.successorId, d.lagDays, d.kind, d.workId, d.createdAt]),
    [['a21', 'a13', 0, 'fs', W, NOW]],
  );
  assert.deepEqual(starts(m.update.activities), { a13: '2026-11-09', a23: '2026-11-30' });
  // Dependência que já está satisfeita não mexe em ninguém.
  const quiet = run(fixture(), { type: 'add_dependency', workId: W, predecessorId: 'a11', successorId: 'a23', lagDays: -5 });
  assert.deepEqual(touched(quiet), ['+dependencies']);
});

test('update_dependency e remove_dependency', () => {
  const m = run(fixture(), { type: 'update_dependency', dependencyId: 'd5', lagDays: 10 });
  assert.deepEqual([m.update.dependencies[0].id, m.update.dependencies[0].lagDays], ['d5', 10]);
  assert.deepEqual(starts(m.update.activities), { a23: '2026-11-30' });
  assert.deepEqual(run(fixture(), { type: 'remove_dependency', dependencyId: 'd1' }).delete.dependencies, ['d1']);
  assert.deepEqual(touched(run(fixture(), { type: 'remove_dependency', dependencyId: 'd1' })), ['-dependencies']);
  rejects(fixture(), { type: 'remove_dependency', dependencyId: 'nada' }, 'Registro não encontrado. Recarregue a página.');
});

// ----- Lançamento e importação -----

test('launch_flow numa obra com blocos: linha de base automática (regra 10), registro do lançamento e só serviços novos', () => {
  seq = 0;
  const m = run(fixture(), launchFlow(), { flow: flow() });
  // Estrutura e Alvenaria já existem nos três locais: só o Contrapiso entra.
  assert.deepEqual(
    m.insert.services.map(s => [s.name, s.color, s.team, s.unit, s.orderIndex, s.workId]),
    [['Contrapiso', '#1baf7a', 'Contrapiso · 4', 'm²', 2, W]],
  );
  const contrapiso = m.insert.services[0];
  assert.equal(m.insert.activities.length, 3);
  assert.ok(m.insert.activities.every(a => a.serviceId === contrapiso.id && a.workId === W));
  // Encaixa no fim da Alvenaria existente em cada local: 09/11, 23/11 e 07/12.
  assert.deepEqual(
    m.insert.activities.map(a => [a.localId, a.start, a.durationDays]),
    [
      ['l1', '2026-11-09', 5],
      ['l2', '2026-11-23', 5],
      ['l3', '2026-12-07', 5],
    ],
  );
  assert.equal(m.insert.dependencies.length, 5);
  assert.deepEqual(
    m.insert.dependencies.filter(d => d.kind === 'fs').map(d => d.predecessorId),
    ['a21', 'a22', 'a23'],
  );
  const [launch] = m.insert.launches;
  assert.deepEqual(
    [launch.workId, launch.flowId, launch.flowName, launch.activityCount, launch.launchedBy, launch.launchedAt, launch.params],
    [
      W,
      'flow-1',
      'Residencial padrão',
      3,
      'u1',
      NOW,
      { localIds: ['l1', 'l2', 'l3'], start: '2026-10-05', direction: 'bottom_up', rhythm: { kind: 'continuous' } },
    ],
  );
  assert.ok(m.insert.activities.every(a => a.launchId === launch.id));
  const [baseline] = m.insert.baselines;
  assert.deepEqual(
    [baseline.name, baseline.automatic, baseline.createdBy, baseline.createdAt, baseline.workId],
    ['Antes do lançamento 04/11/2026', true, 'u1', NOW, W],
  );
  assert.equal(baseline.snapshot.length, 6);
  assert.deepEqual(
    baseline.snapshot.find(e => e.activityId === 'a23'),
    { activityId: 'a23', serviceId: 's2', localId: 'l3', start: '2026-11-23', durationDays: 10 },
  );
  assert.deepEqual(touched(m), [
    '+activities',
    '+activities',
    '+activities',
    '+baselines',
    '+dependencies',
    '+dependencies',
    '+dependencies',
    '+dependencies',
    '+dependencies',
    '+launches',
    '+services',
  ]);
});

test('launch_flow numa obra vazia não grava linha de base; sem fluxo, local estranho ou nada a lançar é recusado', () => {
  const d = fixture();
  d.activities = [];
  d.dependencies = [];
  d.items = [];
  d.photos = [];
  const m = run(d, launchFlow(), { flow: flow() });
  assert.deepEqual(m.insert.baselines, []);
  assert.equal(m.insert.activities.length, 9);
  assert.equal(m.insert.launches[0].activityCount, 9);
  assert.deepEqual(
    m.insert.services.map(s => s.name),
    ['Contrapiso'],
  );
  rejects(fixture(), launchFlow(), 'Fluxo não encontrado. Ele pode ter sido excluído.');
  rejects(fixture(), launchFlow({ localIds: ['l1', 'l9'] }), 'Um dos locais marcados não existe mais. Recarregue a página.', {
    flow: flow(),
  });
  const twoOnly = flow({ services: flow().services.slice(0, 2) });
  rejects(fixture(), launchFlow(), 'Nada a lançar: todos os blocos deste fluxo já existem nos locais marcados.', { flow: twoOnly });
  rejects(fixture(), launchFlow({ localIds: [] }), 'Marque ao menos um local para lançar o fluxo.', { flow: flow() });
  rejects(fixture(), launchFlow(), 'Um fluxo precisa de ao menos dois serviços para ser lançado.', {
    flow: flow({ services: flow().services.slice(0, 1) }),
  });
});

test('import_planner: com blocos ou plano vazio recusado; numa obra vazia cria locais, serviços, blocos e dependências', () => {
  rejects(
    fixture(),
    { type: 'import_planner', workId: W },
    'A importação só funciona numa Linha de Balanço sem blocos. Exclua os blocos atuais ou lance o fluxo direto.',
    {
      plannerDocument: plannerDocument(),
    },
  );
  rejects(empty(), { type: 'import_planner', workId: W }, 'O Planejador desta obra está vazio: não há serviços para importar.', {
    plannerDocument: planDoc([]),
  });
  rejects(empty(), { type: 'import_planner', workId: W }, 'A obra não tem plano no Planejador para importar.');
  const m = run(empty(), { type: 'import_planner', workId: W }, { plannerDocument: plannerDocument({ '1': 'Térreo' }) });
  assert.deepEqual(
    m.insert.locals.map(l => [l.name, l.orderIndex, l.workId]),
    [
      ['Térreo', 0, W],
      ['2º', 1, W],
      ['3º', 2, W],
    ],
  );
  assert.deepEqual(
    m.insert.services.map(s => [s.name, s.orderIndex]),
    [
      ['Estrutura', 0],
      ['Alvenaria', 1],
    ],
  );
  assert.equal(m.insert.activities.length, 6);
  assert.equal(m.insert.dependencies.length, 7);
  const localIds = new Set(m.insert.locals.map(l => l.id)),
    serviceIds = new Set(m.insert.services.map(s => s.id)),
    activityIds = new Set(m.insert.activities.map(a => a.id));
  assert.ok(m.insert.activities.every(a => localIds.has(a.localId) && serviceIds.has(a.serviceId) && a.workId === W));
  assert.ok(m.insert.dependencies.every(d => activityIds.has(d.predecessorId) && activityIds.has(d.successorId)));
  assert.deepEqual(
    touched(m).filter(t => t.startsWith('+locals') || t.startsWith('+services')),
    ['+locals', '+locals', '+locals', '+services', '+services'],
  );
});

test('import_planner reaproveita local e serviço já cadastrados com o mesmo nome', () => {
  const d = empty();
  d.locals = [{ id: 'l1', workId: W, name: 'TÉRREO', orderIndex: 0, ...stamp }];
  d.services = [{ id: 's9', workId: W, name: 'alvenaria', color: '#000000', orderIndex: 0, ...stamp }];
  const m = run(d, { type: 'import_planner', workId: W }, { plannerDocument: plannerDocument({ '1': 'Térreo' }) });
  assert.deepEqual(
    m.insert.locals.map(l => [l.name, l.orderIndex]),
    [
      ['2º', 1],
      ['3º', 2],
    ],
  );
  assert.deepEqual(
    m.insert.services.map(s => [s.name, s.orderIndex]),
    [['Estrutura', 1]],
  );
  assert.equal(m.insert.activities.filter(a => a.localId === 'l1').length, 2);
  assert.equal(m.insert.activities.filter(a => a.serviceId === 's9').length, 3);
  assert.equal(m.insert.activities.length, 6);
});

test('import_planner: serviços ou pavimentos homônimos no Planejador não viram cadastros repetidos (unique work_id+name na 0038)', () => {
  const doc = planDoc([planned('p1', 'Alvenaria', '2026-01-05', 5), planned('p2', 'Alvenaria', '2026-01-12', 5)], {
    '1': 'Garagem',
    '2': 'Garagem',
  });
  const m = run(empty(), { type: 'import_planner', workId: W }, { plannerDocument: doc });
  const names = (list: { name: string }[]) => list.map(l => l.name.toLowerCase());
  assert.equal(new Set(names(m.insert.services)).size, m.insert.services.length);
  assert.equal(new Set(names(m.insert.locals)).size, m.insert.locals.length);
});

// ----- Linhas de base -----

test('create_baseline: sem blocos recusado, nome repetido recusado, snapshot com todos os blocos', () => {
  rejects(empty(), { type: 'create_baseline', workId: W, name: 'Marco 1' }, 'Não há blocos para guardar numa linha de base.');
  rejects(fixture(), { type: 'create_baseline', workId: W, name: ' INICIAL ' }, 'Já existe uma linha de base chamada " INICIAL ".');
  const m = run(fixture(), { type: 'create_baseline', workId: W, name: 'Marco 1' });
  const [b] = m.insert.baselines;
  assert.deepEqual([b.name, b.automatic, b.createdBy, b.createdAt, b.workId], ['Marco 1', false, 'u1', NOW, W]);
  assert.deepEqual(
    b.snapshot.map(e => [e.activityId, e.serviceId, e.localId, e.start, e.durationDays]),
    fixture().activities.map(a => [a.id, a.serviceId, a.localId, a.start, a.durationDays]),
  );
  assert.deepEqual(touched(m), ['+baselines']);
});

test('restore_baseline altera só os blocos que diferem e recusa quando nada muda', () => {
  rejects(fixture(), { type: 'restore_baseline', baselineId: 'b1' }, 'Os blocos já estão como nesta linha de base.');
  const d = fixture();
  d.activities.find(a => a.id === 'a13')!.start = '2026-11-09';
  d.activities.find(a => a.id === 'a21')!.durationDays = 12;
  const m = run(d, { type: 'restore_baseline', baselineId: 'b1' });
  assert.deepEqual(m.update.activities.map(a => [a.id, a.start, a.durationDays, a.updatedAt]).sort(), [
    ['a13', '2026-11-02', 10, NOW],
    ['a21', '2026-10-26', 10, NOW],
  ]);
  // Bloco criado depois da linha de base não é tocado; bloco da linha de base que já não existe é ignorado.
  const later = fixture();
  later.activities.find(a => a.id === 'a13')!.start = '2026-11-09';
  later.activities.push(act('a99', 's1', 'l1', '2026-12-01'));
  later.baselines[0].snapshot.push({ activityId: 'sumiu', serviceId: 's1', localId: 'l1', start: '2026-01-05', durationDays: 1 });
  assert.deepEqual(starts(run(later, { type: 'restore_baseline', baselineId: 'b1' }).update.activities), { a13: '2026-11-02' });
  rejects(fixture(), { type: 'restore_baseline', baselineId: 'nada' }, 'Registro não encontrado. Recarregue a página.');
});

test('delete_baseline', () => {
  const m = run(fixture(), { type: 'delete_baseline', baselineId: 'b1' });
  assert.deepEqual(m.delete.baselines, ['b1']);
  assert.deepEqual(touched(m), ['-baselines']);
  rejects(fixture(), { type: 'delete_baseline', baselineId: 'nada' }, 'Registro não encontrado. Recarregue a página.');
});

// ----- Medições -----

test('open_measurement: uma aberta por vez, data nem futura nem anterior à última fechada, número sequencial', () => {
  rejects(
    withOpen(),
    { type: 'open_measurement', workId: W, measurementId: PHOTO(9), date: TODAY },
    'Já existe uma medição em aberto. Salve ou exclua a atual antes de abrir outra.',
  );
  rejects(
    fixture(),
    { type: 'open_measurement', workId: W, measurementId: M2, date: '2026-11-05' },
    'A data da medição não pode estar no futuro.',
  );
  rejects(
    fixture(),
    { type: 'open_measurement', workId: W, measurementId: M2, date: '2026-10-15' },
    'A data não pode ser anterior à medição #1 (16/10/2026).',
  );
  rejects(fixture(), { type: 'open_measurement', workId: W, measurementId: M1, date: TODAY }, 'Esta medição já foi registrada.');
  rejects(
    empty(),
    { type: 'open_measurement', workId: W, measurementId: M2, date: TODAY },
    'Não há blocos para medir: lance um fluxo primeiro.',
  );
  const m = run(fixture(), { type: 'open_measurement', workId: W, measurementId: M2, date: '2026-10-30' });
  const [opened] = m.insert.measurements;
  assert.deepEqual(
    [opened.id, opened.number, opened.date, opened.status, opened.createdBy, opened.createdAt, opened.workId],
    [M2, 2, '2026-10-30', 'open', 'u1', NOW, W],
  );
  assert.deepEqual(touched(m), ['+measurements']);
  // No mesmo dia da última fechada pode.
  assert.equal(
    run(fixture(), { type: 'open_measurement', workId: W, measurementId: M2, date: '2026-10-16' }).insert.measurements[0].number,
    2,
  );
});

test('update_measurement: rodada fechada não muda a data, só a observação; a aberta muda a data dentro dos limites', () => {
  rejects(
    fixture(),
    { type: 'update_measurement', measurementId: M1, date: '2026-10-20' },
    'A data de uma medição salva não muda. Se estiver errada, exclua a medição e lance de novo.',
  );
  const note = run(fixture(), { type: 'update_measurement', measurementId: M1, note: 'Chuva na semana' });
  assert.deepEqual(
    [
      note.update.measurements[0].id,
      note.update.measurements[0].note,
      note.update.measurements[0].date,
      note.update.measurements[0].updatedAt,
    ],
    [M1, 'Chuva na semana', '2026-10-16', NOW],
  );
  // Mesma data: não é mudança.
  assert.equal(run(fixture(), { type: 'update_measurement', measurementId: M1, date: '2026-10-16' }).update.measurements.length, 1);
  const open = run(withOpen(), { type: 'update_measurement', measurementId: M2, date: '2026-10-30', note: null });
  assert.deepEqual([open.update.measurements[0].date, open.update.measurements[0].note], ['2026-10-30', undefined]);
  rejects(withOpen(), { type: 'update_measurement', measurementId: M2, date: '2026-11-05' }, 'A data da medição não pode estar no futuro.');
  rejects(
    withOpen(),
    { type: 'update_measurement', measurementId: M2, date: '2026-10-15' },
    'A data não pode ser anterior à medição #1 (16/10/2026).',
  );
  // Com a #2 aberta, a #1 é só leitura (regra 24).
  rejects(
    withOpen(),
    { type: 'update_measurement', measurementId: M1, note: 'x' },
    'Só a última medição pode ser alterada. As anteriores ficam só para consulta.',
  );
  rejects(fixture(), { type: 'update_measurement', measurementId: M2, note: 'x' }, 'Registro não encontrado. Recarregue a página.');
});

test('save_items cria o item com previousValue = acumulado anterior e aceita vírgula', () => {
  const m = run(withOpen(), {
    type: 'save_items',
    measurementId: M2,
    items: [
      { itemId: NEW_ITEM, activityId: 'a11', value: '85,5', note: 'Faltou a laje do hall', delayCause: 'Falta de Material' },
      { itemId: PHOTO(7), activityId: 'a12', value: 30 },
    ],
  });
  assert.deepEqual(
    m.insert.items.map(i => [
      i.id,
      i.measurementId,
      i.activityId,
      i.value,
      i.previousValue,
      i.note,
      i.delayCause,
      i.createdBy,
      i.createdAt,
      i.workId,
    ]),
    [
      [NEW_ITEM, M2, 'a11', 85.5, 50, 'Faltou a laje do hall', 'Falta de Material', 'u1', NOW, W],
      [PHOTO(7), M2, 'a12', 30, 0, undefined, undefined, 'u1', NOW, W],
    ],
  );
  assert.deepEqual(touched(m), ['+items', '+items']);
  // Valor igual ao anterior é aceito (nada avançou).
  assert.equal(
    run(withOpen(), { type: 'save_items', measurementId: M2, items: [{ itemId: NEW_ITEM, activityId: 'a11', value: 50 }] }).insert.items[0]
      .value,
    50,
  );
});

test('save_items atualiza item existente mantendo o id e recalcula previousValue', () => {
  const d = withOpen();
  d.items.push(item(I2, M2, 'a11', 60, 50));
  const m = run(d, {
    type: 'save_items',
    measurementId: M2,
    items: [{ itemId: NEW_ITEM, activityId: 'a11', value: 70, delayCause: null }],
  });
  assert.deepEqual(m.insert.items, []);
  assert.deepEqual(
    m.update.items.map(i => [i.id, i.value, i.previousValue, i.note, i.delayCause, i.updatedAt, i.createdAt]),
    [[I2, 70, 50, undefined, undefined, NOW, OLD]],
  );
  // Nota omitida fica; nota nula limpa.
  const noted = withOpen();
  noted.items.push({ ...item(I2, M2, 'a11', 60, 50), note: 'antiga', delayCause: 'Retrabalho' });
  assert.deepEqual(
    [
      run(noted, { type: 'save_items', measurementId: M2, items: [{ itemId: I2, activityId: 'a11', value: 60 }] }).update.items[0].note,
      run(noted, { type: 'save_items', measurementId: M2, items: [{ itemId: I2, activityId: 'a11', value: 60 }] }).update.items[0]
        .delayCause,
    ],
    ['antiga', 'Retrabalho'],
  );
  assert.equal(
    run(noted, { type: 'save_items', measurementId: M2, items: [{ itemId: I2, activityId: 'a11', value: 60, note: null }] }).update.items[0]
      .note,
    undefined,
  );
});

test('save_items recusa valor abaixo do anterior com o nome do bloco, motivo desconhecido, bloco repetido, rodada antiga (regra 24)', () => {
  rejects(
    withOpen(),
    { type: 'save_items', measurementId: M2, items: [{ itemId: NEW_ITEM, activityId: 'a11', value: 40 }] },
    'Estrutura · Térreo: O acumulado não pode ficar abaixo da medição anterior (50%).',
  );
  rejects(
    withOpen(),
    { type: 'save_items', measurementId: M2, items: [{ itemId: NEW_ITEM, activityId: 'a12', value: 101 }] },
    'Estrutura · 1º pavimento: O realizado acumulado vai de 0 a 100%.',
  );
  rejects(
    withOpen(),
    { type: 'save_items', measurementId: M2, items: [{ itemId: NEW_ITEM, activityId: 'a12', value: 10, delayCause: 'Chuva forte' }] },
    'Motivo do atraso desconhecido: "Chuva forte".',
  );
  rejects(
    withOpen(),
    {
      type: 'save_items',
      measurementId: M2,
      items: [
        { itemId: NEW_ITEM, activityId: 'a12', value: 10 },
        { itemId: PHOTO(7), activityId: 'a12', value: 20 },
      ],
    },
    'Estrutura · 1º pavimento aparece duas vezes no lançamento.',
  );
  rejects(
    withOpen(),
    { type: 'save_items', measurementId: M2, items: [{ itemId: NEW_ITEM, activityId: 'nada', value: 10 }] },
    'Um dos blocos não existe mais. Recarregue a página.',
  );
  rejects(
    withOpen(),
    { type: 'save_items', measurementId: M2, items: [{ itemId: I1, activityId: 'a12', value: 10 }] },
    'Este lançamento já foi registrado. Recarregue a página.',
  );
  rejects(
    withOpen(),
    { type: 'save_items', measurementId: M1, items: [{ itemId: NEW_ITEM, activityId: 'a11', value: 60 }] },
    'Só a última medição pode ser alterada. As anteriores ficam só para consulta.',
  );
  // Sem aberta, a última fechada ainda aceita correção, e a rodada recebe carimbo.
  const m = run(fixture(), { type: 'save_items', measurementId: M1, items: [{ itemId: I1, activityId: 'a11', value: 55 }] });
  assert.deepEqual([m.update.items[0].value, m.update.items[0].previousValue], [55, 0]);
  assert.deepEqual([m.update.measurements[0].id, m.update.measurements[0].updatedAt], [M1, NOW]);
});

test('remove_item apaga o lançamento com suas fotos, só da medição editável', () => {
  const d = withOpen();
  d.items.push(item(I2, M2, 'a12', 30));
  d.photos.push(photo(2, I2, M2, 'a12'));
  const m = run(d, { type: 'remove_item', itemId: I2 });
  assert.deepEqual(m.delete.items, [I2]);
  assert.deepEqual(m.delete.photos, [PHOTO(2)]);
  assert.deepEqual(m.removeFiles, [lobPhotoPaths(W, I2, PHOTO(2)).storagePath, lobPhotoPaths(W, I2, PHOTO(2)).thumbPath]);
  rejects(d, { type: 'remove_item', itemId: I1 }, 'Só a última medição pode ser alterada. As anteriores ficam só para consulta.');
  rejects(d, { type: 'remove_item', itemId: 'nada' }, 'Registro não encontrado. Recarregue a página.');
});

test('close_measurement: sem itens recusado; avanço sem foto recusado listando o bloco', () => {
  rejects(
    withOpen(),
    { type: 'close_measurement', measurementId: M2 },
    'Lance o realizado de ao menos um bloco antes de salvar a medição.',
  );
  rejects(fixture(), { type: 'close_measurement', measurementId: M1 }, 'Esta medição já foi salva.');
  const one = withOpen();
  one.items.push(item(I2, M2, 'a12', 30));
  rejects(
    one,
    { type: 'close_measurement', measurementId: M2 },
    'Avanço sem foto: Estrutura · 1º pavimento. Tire ao menos uma foto do que avançou.',
  );
  const two = withOpen();
  two.items.push(item(I2, M2, 'a12', 30), item(NEW_ITEM, M2, 'a11', 60, 50));
  rejects(
    two,
    { type: 'close_measurement', measurementId: M2 },
    '2 avanços sem foto: Estrutura · 1º pavimento, Estrutura · Térreo. Tire ao menos uma foto de cada um.',
  );
  // Item sem avanço (igual ao anterior) não exige foto.
  const same = withOpen();
  same.items.push(item(I2, M2, 'a11', 50, 50));
  assert.equal(run(same, { type: 'close_measurement', measurementId: M2 }).update.measurements[0].status, 'closed');
});

test('close_measurement com foto fecha a rodada e preenche as datas reais (regra 22) sem mexer nas já preenchidas', () => {
  const d = withOpen();
  d.items.push(item(I2, M2, 'a12', 30), item(NEW_ITEM, M2, 'a11', 100, 50));
  d.photos.push(photo(2, I2, M2, 'a12'), photo(3, NEW_ITEM, M2, 'a11'));
  const m = run(d, { type: 'close_measurement', measurementId: M2 });
  const [closed] = m.update.measurements;
  assert.deepEqual(
    [closed.id, closed.status, closed.closedAt, closed.closedBy, closed.updatedAt, closed.date],
    [M2, 'closed', NOW, 'u1', NOW, TODAY],
  );
  assert.deepEqual(m.update.activities.map(a => [a.id, a.actualStart, a.actualFinish, a.updatedAt]).sort(), [
    ['a11', '2026-10-05', TODAY, NOW], // início real já existia e fica; término real na data da medição
    ['a12', TODAY, undefined, NOW], // primeiro avanço: início real na data da medição
  ]);
  assert.deepEqual(touched(m), ['~activities', '~activities', '~measurements']);
  // 100% direto num bloco sem início real preenche os dois com a data da medição.
  const direct = withOpen();
  direct.items.push(item(I2, M2, 'a12', 100));
  direct.photos.push(photo(2, I2, M2, 'a12'));
  const [a12] = run(direct, { type: 'close_measurement', measurementId: M2 }).update.activities;
  assert.deepEqual([a12.id, a12.actualStart, a12.actualFinish], ['a12', TODAY, TODAY]);
  // Término real já preenchido à mão não é sobrescrito.
  const manual = withOpen();
  manual.activities.find(a => a.id === 'a12')!.actualStart = '2026-10-20';
  manual.activities.find(a => a.id === 'a12')!.actualFinish = '2026-11-03';
  manual.items.push(item(I2, M2, 'a12', 100));
  manual.photos.push(photo(2, I2, M2, 'a12'));
  assert.deepEqual(run(manual, { type: 'close_measurement', measurementId: M2 }).update.activities, []);
});

test('delete_measurement: rodada antiga recusada; a última apaga itens, fotos e arquivos', () => {
  const d = withOpen();
  d.items.push(item(I2, M2, 'a12', 30));
  d.photos.push(photo(2, I2, M2, 'a12'), photo(3, I2, M2, 'a12'));
  rejects(
    d,
    { type: 'delete_measurement', measurementId: M1 },
    'Só a última medição pode ser alterada. As anteriores ficam só para consulta.',
  );
  const m = run(d, { type: 'delete_measurement', measurementId: M2 });
  assert.deepEqual(m.delete.measurements, [M2]);
  assert.deepEqual(m.delete.items, [I2]);
  assert.deepEqual(m.delete.photos, [PHOTO(2), PHOTO(3)]);
  assert.deepEqual(m.removeFiles, [
    lobPhotoPaths(W, I2, PHOTO(2)).storagePath,
    lobPhotoPaths(W, I2, PHOTO(2)).thumbPath,
    lobPhotoPaths(W, I2, PHOTO(3)).storagePath,
    lobPhotoPaths(W, I2, PHOTO(3)).thumbPath,
  ]);
  assert.deepEqual(touched(m), ['-items', '-measurements', '-photos', '-photos']);
  // Sem aberta, a última fechada pode ser excluída.
  const last = run(fixture(), { type: 'delete_measurement', measurementId: M1 });
  assert.deepEqual([last.delete.measurements, last.delete.items, last.delete.photos], [[M1], [I1], [PHOTO(1)]]);
  rejects(fixture(), { type: 'delete_measurement', measurementId: M2 }, 'Registro não encontrado. Recarregue a página.');
});

test('add_photo: caminho no padrão, até 6 por bloco na medição, sem repetir, só na medição editável', () => {
  const paths = lobPhotoPaths(W, I1, PHOTO(2));
  const m = run(fixture(), { type: 'add_photo', itemId: I1, photoId: PHOTO(2), ...paths, width: 1600, height: 1200, bytes: 250_000 });
  const [p] = m.insert.photos;
  assert.deepEqual(
    [
      p.id,
      p.itemId,
      p.measurementId,
      p.activityId,
      p.workId,
      p.storagePath,
      p.thumbPath,
      p.width,
      p.height,
      p.bytes,
      p.createdBy,
      p.createdAt,
    ],
    [PHOTO(2), I1, M1, 'a11', W, paths.storagePath, paths.thumbPath, 1600, 1200, 250_000, 'u1', NOW],
  );
  assert.deepEqual(touched(m), ['+photos']);
  rejects(
    fixture(),
    { type: 'add_photo', itemId: I1, photoId: PHOTO(2), storagePath: `outra-obra/${I1}/${PHOTO(2)}.jpg`, thumbPath: paths.thumbPath },
    'Caminho da foto fora do padrão.',
  );
  rejects(
    fixture(),
    { type: 'add_photo', itemId: I1, photoId: PHOTO(2), ...lobPhotoPaths(W, I1, PHOTO(3)) },
    'Caminho da foto fora do padrão.',
  );
  rejects(
    fixture(),
    { type: 'add_photo', itemId: I1, photoId: PHOTO(1), ...lobPhotoPaths(W, I1, PHOTO(1)) },
    'Esta foto já foi registrada.',
  );
  rejects(fixture(), { type: 'add_photo', itemId: 'nada', photoId: PHOTO(2), ...paths }, 'Registro não encontrado. Recarregue a página.');
  const full = fixture();
  for (let n = 2; n <= LOB_LIMITS.maxPhotosPerItem; n++) full.photos.push(photo(n, I1, M1, 'a11'));
  rejects(
    full,
    { type: 'add_photo', itemId: I1, photoId: PHOTO(9), ...lobPhotoPaths(W, I1, PHOTO(9)) },
    'Este bloco já tem 6 fotos nesta medição, o máximo.',
  );
  // Com a #2 aberta, o item da #1 não recebe foto.
  rejects(
    withOpen(),
    { type: 'add_photo', itemId: I1, photoId: PHOTO(2), ...paths },
    'Só a última medição pode ser alterada. As anteriores ficam só para consulta.',
  );
});

test('delete_photo gera removeFiles e respeita a medição editável', () => {
  // Regra 21: na medição já salva, a única foto de um avanço não sai; com outra foto, sai.
  rejects(fixture(), { type: 'delete_photo', photoId: PHOTO(1) }, /única foto de um avanço/);
  const twoPhotos = fixture();
  twoPhotos.photos.push(photo(2, I1, M1, 'a11'));
  const m = run(twoPhotos, { type: 'delete_photo', photoId: PHOTO(1) });
  assert.deepEqual(m.delete.photos, [PHOTO(1)]);
  assert.deepEqual(m.removeFiles, [lobPhotoPaths(W, I1, PHOTO(1)).storagePath, lobPhotoPaths(W, I1, PHOTO(1)).thumbPath]);
  assert.deepEqual(touched(m), ['-photos']);
  rejects(
    withOpen(),
    { type: 'delete_photo', photoId: PHOTO(1) },
    'Só a última medição pode ser alterada. As anteriores ficam só para consulta.',
  );
  rejects(fixture(), { type: 'delete_photo', photoId: PHOTO(9) }, 'Registro não encontrado. Recarregue a página.');
});

// ----- Regras acrescentadas na integração (04/11/2026) -----

test('launch_flow: summary com lançados e mantidos (regra 11) e nome único da linha de base automática no mesmo dia', () => {
  const d = fixture();
  d.baselines.push({ ...d.baselines[0], id: 'b-auto', name: 'Antes do lançamento 04/11/2026', automatic: true });
  const m = run(d, launchFlow(), { flow: flow() });
  assert.deepEqual(m.summary, { launched: 3, skipped: 6 });
  assert.equal(m.insert.baselines[0].name, 'Antes do lançamento 04/11/2026 (2)');
});

test('save_items na última medição já salva preenche as datas reais como o fechamento (regra 22)', () => {
  const d = fixture();
  d.activities.find(a => a.id === 'a11')!.actualStart = undefined;
  const m = run(d, { type: 'save_items', measurementId: M1, items: [{ itemId: I1, activityId: 'a11', value: 100 }] });
  const a11 = m.update.activities.find(a => a.id === 'a11')!;
  assert.deepEqual([a11.actualStart, a11.actualFinish], ['2026-10-16', '2026-10-16']);
  // Data real já preenchida à mão fica como está.
  const kept = run(fixture(), { type: 'save_items', measurementId: M1, items: [{ itemId: I1, activityId: 'a11', value: 60 }] });
  assert.equal(
    kept.update.activities.find(a => a.id === 'a11'),
    undefined,
  );
});

test('delete_measurement desfaz as datas reais que vieram dela e mantém as digitadas em outra data', () => {
  const d = fixture();
  const a11 = d.activities.find(a => a.id === 'a11')!;
  a11.actualStart = '2026-10-16';
  a11.actualFinish = '2026-10-16';
  const m = run(d, { type: 'delete_measurement', measurementId: M1 });
  const next = m.update.activities.find(a => a.id === 'a11')!;
  assert.deepEqual([next.actualStart, next.actualFinish], [undefined, undefined]);
  // Na semente, a11 começou em 05/10 (data digitada, não a da medição): fica.
  assert.equal(
    run(fixture(), { type: 'delete_measurement', measurementId: M1 }).update.activities.find(a => a.id === 'a11'),
    undefined,
  );
});

// ----- Apropriação de custos (11/11/2026) -----

const cost = (n: number, serviceId: string | undefined, amount: number, over: Partial<LobCostItem> = {}): LobCostItem => ({
  id: COST(n),
  workId: W,
  serviceId,
  description: `Item ${n}`,
  amount,
  orderIndex: n,
  createdBy: 'u0',
  ...stamp,
  ...over,
});
/** A obra com três itens: dois na Estrutura (um com código) e um não apropriado. */
function withCosts(): LobData {
  const d = fixture();
  d.costs = [cost(1, 's1', 1000, { code: '01.01' }), cost(2, 's1', 250.5), cost(3, undefined, 80)];
  return d;
}
const saveCosts = (upsert: Extract<LobCommand, { type: 'save_costs' }>['upsert'], remove: string[] = []): LobCommand => ({
  type: 'save_costs',
  workId: W,
  upsert,
  remove,
});
const parseCosts = (upsert: unknown, remove: unknown = []) => parseLobCommand({ type: 'save_costs', workId: W, upsert, remove });
const costInput = (n: number, over: Record<string, unknown> = {}) => ({
  id: COST(n),
  serviceId: 's1',
  description: `Item ${n}`,
  amount: 10,
  ...over,
});

test('parse save_costs: listas obrigatórias, não as duas vazias, obra e limite por gravação', () => {
  assert.throws(() => parseLobCommand({ type: 'save_costs', upsert: [costInput(1)], remove: [] }), { message: 'Obra não informada.' });
  assert.throws(() => parseCosts(undefined), { message: 'Lista de itens de custo inválida.' });
  assert.throws(() => parseCosts([], 'x'), { message: 'Lista de itens de custo inválida.' });
  assert.throws(() => parseCosts([], []), { message: 'Nenhum item de custo para salvar.' });
  const many = Array.from({ length: LOB_LIMITS.costBatch + 1 }, (_, i) => costInput(i + 1));
  assert.throws(() => parseCosts(many), { message: `Salve no máximo ${LOB_LIMITS.costBatch} itens de custo por vez.` });
  assert.throws(
    () =>
      parseCosts(
        [],
        many.map(c => c.id),
      ),
    { message: `Salve no máximo ${LOB_LIMITS.costBatch} itens de custo por vez.` },
  );
  // Só exclusão vale.
  assert.deepEqual(parseCosts([], [COST(1)]), { type: 'save_costs', workId: W, upsert: [], remove: [COST(1)] });
});

test('parse save_costs: id UUID, descrição limpa e obrigatória, código até o limite, pacote string ou nulo', () => {
  assert.throws(() => parseCosts([costInput(1, { id: undefined })]), { message: 'Item de custo sem identificador.' });
  assert.throws(() => parseCosts([costInput(1, { id: 'item-1' })]), { message: 'Identificador do item de custo inválido.' });
  assert.throws(() => parseCosts([], ['item-1']), { message: 'Identificador do item de custo inválido.' });
  assert.throws(() => parseCosts([costInput(1, { description: '   ' })]), { message: 'O item 1: informe a descrição do item de custo.' });
  assert.throws(() => parseCosts([costInput(1, { description: '', code: '02.03' })]), {
    message: 'O item 02.03: informe a descrição do item de custo.',
  });
  assert.throws(() => parseCosts([costInput(1, { description: 'x'.repeat(LOB_LIMITS.costDescription + 1) })]), {
    message: new RegExp(`a descrição passa de ${LOB_LIMITS.costDescription} caracteres`),
  });
  assert.throws(() => parseCosts([costInput(1, { code: '9'.repeat(LOB_LIMITS.costCode + 1) })]), {
    message: `"Item 1": o código passa de ${LOB_LIMITS.costCode} caracteres.`,
  });
  assert.throws(() => parseCosts([costInput(1, { code: 12 })]), { message: '"Item 1": código inválido.' });
  assert.throws(() => parseCosts([costInput(1, { serviceId: 7 })]), { message: '"Item 1": pacote inválido.' });
  const parsed = parseCosts([
    costInput(1, { description: '  Concreto   usinado\tfck 30 ', code: ' 03.01 ' }),
    costInput(2, { serviceId: null, code: '' }),
    costInput(3, { serviceId: '' }),
    costInput(4, { serviceId: undefined, code: null }),
  ]) as Extract<LobCommand, { type: 'save_costs' }>;
  assert.deepEqual(parsed.upsert, [
    { id: COST(1), serviceId: 's1', code: '03.01', description: 'Concreto usinado fck 30', amount: 10 },
    { id: COST(2), serviceId: null, code: null, description: 'Item 2', amount: 10 },
    { id: COST(3), serviceId: null, code: null, description: 'Item 3', amount: 10 },
    { id: COST(4), serviceId: null, code: null, description: 'Item 4', amount: 10 },
  ]);
});

test('parse save_costs: valor número finito, nem negativo nem acima do teto, arredondado a centavos', () => {
  for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, '1.234,56', null, undefined])
    assert.throws(
      () => parseCosts([costInput(1, { amount })]),
      { message: '"Item 1": valor inválido. Informe o valor em reais.' },
      String(amount),
    );
  assert.throws(() => parseCosts([costInput(1, { amount: -0.01 })]), { message: '"Item 1": o valor não pode ser negativo.' });
  assert.throws(() => parseCosts([costInput(1, { amount: LOB_LIMITS.maxCostAmount + 1 })]), {
    message: '"Item 1": o valor passa do teto de R$ 1 trilhão por item.',
  });
  const amounts = (values: number[]) =>
    (parseCosts(values.map((amount, i) => costInput(i + 1, { amount }))) as Extract<LobCommand, { type: 'save_costs' }>).upsert.map(
      c => c.amount,
    );
  assert.deepEqual(amounts([1.005, 10.004, 1234.565, 0, 0.001, LOB_LIMITS.maxCostAmount]), [
    1.01,
    10,
    1234.57,
    0,
    0,
    LOB_LIMITS.maxCostAmount,
  ]);
  assert.ok(Object.is(amounts([0.001])[0], 0), 'nada de −0 nem 0,001 gravado');
});

test('parse save_costs: id repetido ou presente em upsert e remove é recusado', () => {
  assert.throws(() => parseCosts([costInput(1), costInput(1, { amount: 20 })]), {
    message: 'Um item de custo aparece duas vezes na gravação. Recarregue a página.',
  });
  assert.throws(() => parseCosts([costInput(1)], [COST(1)]), {
    message: 'Um item de custo não pode ser salvo e excluído na mesma gravação. Recarregue a página.',
  });
  assert.throws(() => parseCosts([], [COST(1), COST(1)]), {
    message: 'Um item de custo aparece duas vezes entre os excluídos. Recarregue a página.',
  });
});

test('save_costs insere itens novos na ordem recebida depois do maior orderIndex, com o ator e o carimbo', () => {
  const m = run(
    withCosts(),
    saveCosts([
      { id: COST(10), serviceId: 's2', code: '04.01', description: 'Bloco cerâmico', amount: 5000 },
      { id: COST(11), serviceId: null, description: 'Administração local', amount: 0 },
    ]),
  );
  assert.deepEqual(touched(m), ['+costs', '+costs']);
  assert.equal(m.workId, W);
  assert.deepEqual(m.insert.costs, [
    {
      id: COST(10),
      workId: W,
      serviceId: 's2',
      code: '04.01',
      description: 'Bloco cerâmico',
      amount: 5000,
      orderIndex: 4,
      createdBy: 'u1',
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: COST(11),
      workId: W,
      serviceId: undefined,
      code: undefined,
      description: 'Administração local',
      amount: 0,
      orderIndex: 5,
      createdBy: 'u1',
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  assert.deepEqual(m.summary, { saved: 2, removed: 0 });
  // Obra sem itens começa do zero.
  assert.equal(run(fixture(), saveCosts([costInput(1)])).insert.costs[0].orderIndex, 0);
});

test('save_costs atualiza só o que mudou, preservando autor, criação e ordem', () => {
  const m = run(
    withCosts(),
    saveCosts([
      // Sem mudança (o código vazio e o ausente são o mesmo): não vira escrita.
      { id: COST(1), serviceId: 's1', code: '01.01', description: 'Item 1', amount: 1000 },
      { id: COST(3), serviceId: null, code: null, description: 'Item 3', amount: 80 },
      // Muda o pacote: apropria o item que estava solto.
      { id: COST(2), serviceId: 's2', description: 'Item 2', amount: 250.5 },
    ]),
  );
  assert.deepEqual(touched(m), ['~costs']);
  assert.deepEqual(m.update.costs[0], { ...cost(2, 's2', 250.5), code: undefined, updatedAt: NOW });
  assert.equal(m.update.costs[0].createdBy, 'u0');
  assert.equal(m.update.costs[0].createdAt, OLD);
  assert.equal(m.update.costs[0].orderIndex, 2);
  assert.deepEqual(m.summary, { saved: 1, removed: 0 });
  // Cada campo conta: valor, descrição, código e tirar o pacote.
  const one = (input: Extract<LobCommand, { type: 'save_costs' }>['upsert'][number]) => run(withCosts(), saveCosts([input])).update.costs;
  assert.equal(one({ id: COST(1), serviceId: 's1', code: '01.01', description: 'Item 1', amount: 1000.01 })[0].amount, 1000.01);
  assert.equal(one({ id: COST(1), serviceId: 's1', code: '01.01', description: 'Item um', amount: 1000 })[0].description, 'Item um');
  assert.equal(one({ id: COST(1), serviceId: 's1', code: null, description: 'Item 1', amount: 1000 })[0].code, undefined);
  assert.equal(one({ id: COST(1), serviceId: null, code: '01.01', description: 'Item 1', amount: 1000 })[0].serviceId, undefined);
  // Nada mudou: gravação vazia, sem erro.
  const idle = run(withCosts(), saveCosts([{ id: COST(2), serviceId: 's1', description: 'Item 2', amount: 250.5 }]));
  assert.deepEqual(touched(idle), []);
  assert.deepEqual(idle.summary, { saved: 0, removed: 0 });
});

test('save_costs remove itens da obra e recusa id que não é dela', () => {
  const m = run(withCosts(), saveCosts([], [COST(1), COST(3)]));
  assert.deepEqual(m.delete.costs, [COST(1), COST(3)]);
  assert.deepEqual(touched(m), ['-costs', '-costs']);
  assert.deepEqual(m.summary, { saved: 0, removed: 2 });
  rejects(withCosts(), saveCosts([], [COST(9)]), 'Item de custo não encontrado. Recarregue a página.');
  // Inserir e remover juntos: um novo, um a menos.
  const mixed = run(withCosts(), saveCosts([costInput(7)], [COST(2)]));
  assert.deepEqual(touched(mixed), ['+costs', '-costs']);
  assert.deepEqual(mixed.summary, { saved: 1, removed: 1 });
});

test('save_costs: pacote inexistente ou de outra obra é recusado', () => {
  rejects(withCosts(), saveCosts([costInput(7, { serviceId: 's9' })]), 'Pacote não encontrado. Recarregue a página.');
  // O pacote de outra obra não está entre os serviços carregados desta obra.
  const other = withCosts();
  other.services.push({ ...other.services[0], id: 's-outra', workId: 'obra-2' });
  const data = { ...other, services: other.services.filter(s => s.workId === W) };
  rejects(data, saveCosts([costInput(7, { serviceId: 's-outra' })]), 'Pacote não encontrado. Recarregue a página.');
  rejects(
    withCosts(),
    saveCosts([costInput(1, { serviceId: 's9', description: 'Item 1', amount: 1000 })]),
    'Pacote não encontrado. Recarregue a página.',
  );
});

test('save_costs respeita o limite de itens por obra, contando os removidos', () => {
  const d = fixture();
  d.costs = Array.from({ length: LOB_LIMITS.costItems - 1 }, (_, i) => cost(i + 1, 's1', 1));
  const ok = run(d, saveCosts([costInput(LOB_LIMITS.costItems)]));
  assert.equal(ok.insert.costs.length, 1);
  rejects(
    d,
    saveCosts([costInput(LOB_LIMITS.costItems), costInput(LOB_LIMITS.costItems + 1)]),
    `A obra aceita no máximo ${LOB_LIMITS.costItems} itens de custo; com esta gravação ficaria com ${LOB_LIMITS.costItems + 1}.`,
  );
  // Com um removido, os dois novos cabem.
  const swap = run(d, saveCosts([costInput(LOB_LIMITS.costItems), costInput(LOB_LIMITS.costItems + 1)], [COST(1)]));
  assert.deepEqual(swap.summary, { saved: 2, removed: 1 });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { activityFinish, cascade, type LobLocal } from '../src/domain/lob';
import type { MspdiProject, MspdiTask } from '../src/domain/mspdi-import';
import {
  buildPrevisionImport,
  detachFlowIds,
  localGroup,
  readPrevisionSchedule,
  type PrevisionImportOptions,
} from '../src/domain/lob-prevision-import';

/** Novembro e dezembro de 2026: 02/11 é segunda-feira. */
let uid = 0;
const task = (name: string, level: number, start?: string, finish?: string, days?: number, percent = 0): MspdiTask => ({
  uid: ++uid,
  id: uid,
  name,
  active: true,
  manual: true,
  isNull: false,
  outlineLevel: level,
  summary: false,
  milestone: false,
  estimated: false,
  start: start && `${start}T09:00:00`,
  finish: finish && `${finish}T18:00:00`,
  duration: days ? `PT${days * 8}H0M0S` : undefined,
  percentComplete: percent,
  constraintType: 0,
  predecessorLinks: [],
  baselines: [],
});
const service = (name: string) => task(name, 1, '2026-11-02', '2026-12-18', 35);
const block = (local: string, start: string, finish: string, days: number, percent = 0) => task(local, 2, start, finish, days, percent);

/** Arquivo no formato do Prevision: serviço no nível 1, locais no nível 2, sem vínculos. */
function project(extra: MspdiTask[] = []): MspdiProject {
  return {
    title: 'Obra teste',
    minutesPerDay: 480,
    calendars: [],
    resources: [],
    assignments: [],
    tasks: [
      service('EST - Estrutura'),
      block('Térreo', '2026-11-02', '2026-11-06', 5, 100),
      block('2ºpavto', '2026-11-09', '2026-11-13', 5, 40),
      block('3ºpavto', '2026-11-16', '2026-11-20', 5),
      ...extra,
      service('ALV - Alvenaria'),
      block('Subsolo 01', '2026-11-09', '2026-11-13', 5),
      block('Térreo', '2026-11-16', '2026-11-20', 5),
      block('2ºpavto', '2026-11-23', '2026-11-27', 5),
      block('3ºpavto', '2026-11-30', '2026-12-04', 5),
      service('INF - Elétrica'),
      block('Térreo', '2026-11-23', '2026-11-27', 5),
      block('2ºpavto', '2026-11-30', '2026-12-04', 5),
      block('3ºpavto', '2026-12-07', '2026-12-11', 5),
      service('INF - Hidráulica'),
      block('Térreo', '2026-11-23', '2026-11-27', 5),
      block('2ºpavto', '2026-11-30', '2026-12-04', 5),
      block('3ºpavto', '2026-12-07', '2026-12-11', 5),
      service('REB - Reboco'),
      block('Térreo', '2026-11-30', '2026-12-04', 5),
      // 4 dias no calendário do Prevision num intervalo de 5 dias úteis: um feriado no meio.
      block('2ºpavto', '2026-12-07', '2026-12-11', 4),
      block('3ºpavto', '2026-12-14', '2026-12-18', 5),
      service('PRU - Prumada'),
      block('Hall - 2ºpavto', '2026-12-01', '2026-12-01', 1),
      block('Hall - 3ºpavto', '2026-12-02', '2026-12-02', 1),
      service('FAC - Balancim'),
      // O Prevision lista a fachada do último pano ao primeiro.
      block('Sul - 2 ao 9', '2026-12-07', '2026-12-11', 5),
      block('Sul - 10 ao 15', '2026-11-30', '2026-12-04', 5),
      service('EQP - Grua'),
      block('Equipamentos', '2026-11-02', '2026-12-18', 35, 30),
      service('EQP - Cremalheira'),
      block('Equipamentos', '2026-11-09', '2026-12-04', 20),
    ],
  };
}
let n = 0;
const options = (over: Partial<PrevisionImportOptions> = {}): PrevisionImportOptions => ({
  workId: 'obra-1',
  workName: 'Teste',
  actorId: 'user-1',
  now: '2026-11-11T12:00:00.000Z',
  newId: () => `id-${++n}`,
  measurementDate: '2026-11-11',
  sourceName: 'Teste.xml',
  ...over,
});

test('grupo do local pelo nome', () => {
  assert.equal(localGroup('Hall - 2ºpavto'), 'hall');
  assert.equal(localGroup('10º Pavimento'), 'pavimento_tipo');
  assert.equal(localGroup('5ºpavto'), 'pavimento_tipo');
  assert.equal(localGroup('Pavimento 3'), 'pavimento_tipo');
  assert.equal(localGroup('Térreo'), 'demais');
  assert.equal(localGroup('Caixa de água'), 'demais');
  assert.equal(localGroup('Leste - 2 ao 9'), 'fachada');
  assert.equal(localGroup('Equipamentos'), 'equipamentos');
});

test('leitura: serviços, blocos e locais de baixo para cima, com a fachada pela data de início', () => {
  const schedule = readPrevisionSchedule(project());
  assert.equal(schedule.services.length, 9);
  assert.equal(schedule.blocks.length, 22);
  assert.deepEqual(
    schedule.locals.map(l => l.name),
    ['Subsolo 01', 'Térreo', '2ºpavto', '3ºpavto', 'Hall - 2ºpavto', 'Hall - 3ºpavto', 'Sul - 10 ao 15', 'Sul - 2 ao 9', 'Equipamentos'],
  );
  const reboco = schedule.blocks.find(b => b.serviceName === 'REB - Reboco' && b.localName === '2ºpavto')!;
  assert.deepEqual([reboco.start, reboco.finish, reboco.workDays], ['2026-12-07', '2026-12-11', 4]);
  assert.deepEqual(schedule.warnings, []);
});

test('leitura: bloco repetido e serviço sem local viram aviso', () => {
  const schedule = readPrevisionSchedule(project([block('Térreo', '2026-11-09', '2026-11-13', 5)]));
  assert.equal(schedule.blocks.filter(b => b.serviceName === 'EST - Estrutura' && b.localName === 'Térreo').length, 1);
  assert.match(schedule.warnings.join(' '), /aparece duas vezes/);
  const lonely = readPrevisionSchedule({ ...project(), tasks: [...project().tasks, service('VAZ - Sem locais')] });
  assert.match(lonely.warnings.join(' '), /não tem locais/);
});

test('importação mantém as datas do Prevision e nada se move com as dependências', () => {
  const result = buildPrevisionImport(readPrevisionSchedule(project()), options());
  const schedule = readPrevisionSchedule(project());
  const localName = new Map(result.localOrder.map(l => [l.local.id, l.local.name]));
  const serviceName = new Map(result.services.map(s => [s.id, s.name]));
  for (const a of result.activities) {
    const original = schedule.blocks.find(b => b.serviceName === serviceName.get(a.serviceId) && b.localName === localName.get(a.localId))!;
    assert.equal(a.start, original.start);
    assert.equal(activityFinish(a), original.finish);
  }
  assert.equal(result.stats.withHolidays, 1);
  assert.deepEqual(cascade(result.activities, result.dependencies), []);
  assert.equal(result.baseline.snapshot.length, result.activities.length);
  // Serviços pela data do primeiro início: Estrutura e Grua começam em 02/11.
  assert.deepEqual(
    result.services.slice(0, 2).map(s => s.name),
    ['EST - Estrutura', 'EQP - Grua'],
  );
});

test('dependências: equipe segue entre locais e sequência dentro do local', () => {
  const result = buildPrevisionImport(readPrevisionSchedule(project()), options());
  const id = (svc: string, local: string) =>
    result.activities.find(
      a =>
        result.services.find(s => s.id === a.serviceId)!.name === svc &&
        result.localOrder.find(l => l.local.id === a.localId)!.local.name === local,
    )!.id;
  const find = (p: string, s: string) => result.dependencies.find(d => d.predecessorId === p && d.successorId === s);
  // Alvenaria: Subsolo → Térreo → 2º → 3º, uma semana atrás da outra.
  assert.deepEqual(
    [
      find(id('ALV - Alvenaria', 'Subsolo 01'), id('ALV - Alvenaria', 'Térreo'))?.kind,
      find(id('ALV - Alvenaria', 'Subsolo 01'), id('ALV - Alvenaria', 'Térreo'))?.lagDays,
    ],
    ['crew', 0],
  );
  // No 2º: Alvenaria depois da Estrutura com a espera de 5 dias do fluxo; as duas infras em paralelo
  // depois da Alvenaria; o Reboco depois das duas.
  assert.equal(find(id('EST - Estrutura', '2ºpavto'), id('ALV - Alvenaria', '2ºpavto'))?.lagDays, 5);
  assert.ok(find(id('ALV - Alvenaria', '2ºpavto'), id('INF - Elétrica', '2ºpavto')));
  assert.ok(find(id('ALV - Alvenaria', '2ºpavto'), id('INF - Hidráulica', '2ºpavto')));
  assert.ok(find(id('INF - Elétrica', '2ºpavto'), id('REB - Reboco', '2ºpavto')));
  assert.ok(find(id('INF - Hidráulica', '2ºpavto'), id('REB - Reboco', '2ºpavto')));
  assert.equal(find(id('INF - Elétrica', '2ºpavto'), id('INF - Hidráulica', '2ºpavto')), undefined);
  // Equipamentos não dependem uns dos outros.
  assert.equal(find(id('EQP - Grua', 'Equipamentos'), id('EQP - Cremalheira', 'Equipamentos')), undefined);
});

test('medição com o avanço do arquivo, datas reais e data inválida recusada', () => {
  const result = buildPrevisionImport(readPrevisionSchedule(project()), options());
  assert.equal(result.measurement?.status, 'closed');
  assert.equal(result.measurement?.date, '2026-11-11');
  assert.deepEqual(
    result.items.map(i => i.value).sort((a, b) => a - b),
    [30, 40, 100],
  );
  const done = result.activities.find(a => a.id === result.items.find(i => i.value === 100)!.activityId)!;
  assert.deepEqual([done.actualStart, done.actualFinish], ['2026-11-02', '2026-11-06']);
  const partial = result.activities.find(a => a.id === result.items.find(i => i.value === 40)!.activityId)!;
  assert.deepEqual([partial.actualStart, partial.actualFinish], ['2026-11-09', undefined]);
  assert.throws(
    () => buildPrevisionImport(readPrevisionSchedule(project()), options({ measurementDate: '2026-13-01' })),
    /Data da medição/,
  );
});

test('fluxo dos pavimentos tipo deduzido; demais pavimentos sem repetição não viram fluxo', () => {
  const result = buildPrevisionImport(readPrevisionSchedule(project()), options());
  assert.equal(result.flows.length, 1);
  const [tipo] = result.flows;
  assert.equal(tipo.group, 'pavimento_tipo');
  assert.equal(tipo.document.name, 'Pavimentos tipo — Teste');
  const byName = new Map(tipo.document.services.map(s => [s.name, s]));
  const nameOf = new Map(tipo.document.services.map(s => [s.id, s.name]));
  assert.deepEqual(
    tipo.document.services.map(s => s.name),
    ['EST - Estrutura', 'ALV - Alvenaria', 'INF - Elétrica', 'INF - Hidráulica', 'REB - Reboco'],
  );
  assert.deepEqual(byName.get('ALV - Alvenaria')!.predecessors, [{ serviceId: byName.get('EST - Estrutura')!.id, lagDays: 5 }]);
  assert.deepEqual(
    byName
      .get('REB - Reboco')!
      .predecessors.map(p => nameOf.get(p.serviceId))
      .sort(),
    ['INF - Elétrica', 'INF - Hidráulica'],
  );
  // Duração: a mais frequente; no empate (4 e 5), a menor.
  assert.equal(byName.get('REB - Reboco')!.durationDays, 4);
  assert.match(result.warnings.join(' '), /Demais pavimentos — Teste/);
});

test('fluxo para a empresa ganha ids próprios com as predecessoras refeitas', () => {
  const [tipo] = buildPrevisionImport(readPrevisionSchedule(project()), options()).flows;
  let k = 0;
  const detached = detachFlowIds(tipo.document, () => `novo-${++k}`);
  const ids = new Set(detached.services.map(s => s.id));
  assert.ok(detached.services.every(s => s.id.startsWith('novo-')));
  assert.ok(detached.services.every(s => s.predecessors.every(p => ids.has(p.serviceId))));
  assert.equal(detached.services.find(s => s.name === 'ALV - Alvenaria')!.predecessors[0].lagDays, 5);
});

test('locais já cadastrados na obra são reaproveitados pelo nome', () => {
  const existing: LobLocal = {
    id: 'L-terreo',
    workId: 'obra-1',
    name: 'térreo',
    orderIndex: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
  const result = buildPrevisionImport(readPrevisionSchedule(project()), options({ existingLocals: [existing] }));
  assert.equal(result.locals.length, 8);
  assert.ok(result.locals.every(l => l.orderIndex >= 1));
  assert.equal(result.activities.filter(a => a.localId === 'L-terreo').length, 5);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { briefingHash, buildBriefing, nameKey, namesPair, type BriefingLevel, type FindingSeverity } from '../src/domain/agent-briefing';
import { weekNumberFrom } from '../src/domain/week-numbering';
import { addDays } from '../src/domain/validation';
import type { NonFulfillmentCause, PlanningData, PlanTask, WeeklyCommitment } from '../src/domain/entities';
import type { LongTermActivity, LongTermPlanDocument } from '../src/domain/long-term-plan';

/** Terça-feira 27/10/2026: a semana atual começa na segunda 26/10 e a anterior em 19/10. */
const TODAY = '2026-10-27';
/** Semana 1 da obra (segunda-feira): 26/10/2026 é a semana 43. */
const WEEK_ONE = '2026-01-05';
const WORK = 'w1';

const stamp = { createdAt: '2026-08-01T12:00:00Z', updatedAt: '2026-08-01T12:00:00Z' };
const empty = (): PlanningData => ({
  works: [],
  locations: [],
  sequences: [],
  wagons: [],
  activities: [],
  criteria: [],
  pendingItems: [],
  restrictions: [],
  releases: [],
  debts: [],
  teams: [],
  progressEntries: [],
  commitments: [],
  baselines: [],
  dependencies: [],
  plans: [],
  planTasks: [],
  planDependencies: [],
  ifcModels: [],
  ifcVersions: [],
  linkRules: [],
  users: [],
  history: [],
});

// ─── Fábricas ───────────────────────────────────────────────────────────────────

const row = (id: string, weekStart: string, name: string, over: Partial<WeeklyCommitment> = {}): WeeklyCommitment => ({
  id,
  ...stamp,
  workId: WORK,
  name,
  supplier: '',
  weekStart,
  weekEnd: addDays(weekStart, 5),
  responsibleId: 'u1',
  startDate: weekStart,
  endDate: addDays(weekStart, 2),
  ...over,
});
const sim = (id: string, weekStart: string, name: string, over: Partial<WeeklyCommitment> = {}) =>
  row(id, weekStart, name, { fulfilled: true, ...over });
const nao = (id: string, weekStart: string, name: string, cause: NonFulfillmentCause, over: Partial<WeeklyCommitment> = {}) =>
  row(id, weekStart, name, { fulfilled: false, cause, ...over });

let taskOrder = 0;
const task = (id: string, planId: string, name: string, start: string, end: string, over: Partial<PlanTask> = {}): PlanTask => ({
  id,
  ...stamp,
  planId,
  name,
  plannedStart: start,
  plannedEnd: end,
  progress: 0,
  order: ++taskOrder,
  level: 0,
  ...over,
});

const service = (id: string, name: string, start: string, duration: number, interval: number, over: Partial<LongTermActivity> = {}) =>
  ({
    id,
    name,
    color: '#2563eb',
    firstFloor: 1,
    lastFloor: 5,
    start,
    duration,
    interval,
    visible: true,
    predecessors: [],
    teams: [],
    unit: '%',
    ...over,
  }) satisfies LongTermActivity;

// Semanas fechadas, da mais antiga para a mais recente (S35 a S42), e a semana atual (S43).
const S35 = '2026-08-31',
  S36 = '2026-09-07',
  S37 = '2026-09-14',
  S38 = '2026-09-21',
  S39 = '2026-09-28',
  S40 = '2026-10-05',
  S41 = '2026-10-12',
  S42 = '2026-10-19',
  S43 = '2026-10-26';

/** Obra OB1 com os três níveis preenchidos e problemas em todos eles. */
function fixture(): { data: PlanningData; longTermPlan: LongTermPlanDocument } {
  taskOrder = 0;
  const data = empty();
  data.works.push({ id: WORK, ...stamp, name: 'Residencial Horizonte', code: 'OB1', description: '', active: true });
  data.users.push({ id: 'u1', ...stamp, name: 'Engenheira', role: 'admin', workIds: [WORK] });
  data.teams.push(
    { id: 'tA', ...stamp, workId: WORK, company: 'Alfa', name: 'Alvenaria', weeklyCapacity: 1 },
    { id: 'tB', ...stamp, workId: WORK, company: 'Beta', name: 'Acabamento', weeklyCapacity: 2 },
  );

  // Curto prazo: PPC por semana 75, 50, 75, 50, 75, 50, 50, 50.
  data.commitments.push(
    sim('s35-1', S35, 'Forma pilares', { supplier: 'Alfa' }),
    sim('s35-2', S35, 'Armação vigas', { teamId: 'tA' }),
    sim('s35-3', S35, 'Diário de obra'),
    nao('s35-4', S35, 'Contrapiso apto 101', 'Falta de Material', { teamId: 'tB' }),

    sim('s36-1', S36, 'Forma pilares', { supplier: 'Alfa' }),
    sim('s36-2', S36, 'Diário de obra'),
    nao('s36-3', S36, 'Alvenaria apto 201', 'Falta de Mão de Obra', { teamId: 'tA' }),
    nao('s36-4', S36, 'Contrapiso apto 201', 'Falta de Material', { teamId: 'tB' }),

    sim('s37-1', S37, 'Alvenaria apto 301', { teamId: 'tA' }),
    sim('s37-2', S37, 'Diário de obra'),
    sim('s37-3', S37, 'Instalações apto 101', { supplier: 'Gama' }),
    nao('s37-4', S37, 'Contrapiso apto 301', 'Falta de Material', { teamId: 'tB' }),

    sim('s38-1', S38, 'Alvenaria apto 401', { teamId: 'tA' }),
    sim('s38-2', S38, 'Diário de obra'),
    nao('s38-3', S38, 'Instalações apto 201', 'Falta de Mão de Obra', { supplier: 'Gama' }),
    row('s38-4', S38, 'Contrapiso apto 401', { teamId: 'tB' }), // semana fechada sem apontamento

    sim('s39-1', S39, 'Alvenaria apto 501', { teamId: 'tA' }),
    sim('s39-2', S39, 'Diário de obra'),
    sim('s39-3', S39, 'Instalações apto 301', { supplier: 'Gama' }),
    nao('s39-4', S39, 'Contrapiso apto 501', 'Falta de Material', { teamId: 'tB' }),

    sim('s40-1', S40, 'Diário de obra'),
    sim('s40-2', S40, 'Instalações apto 401', { supplier: 'Gama' }),
    nao('s40-3', S40, 'Reboco apto 501', 'Falta de Mão de Obra', { teamId: 'tA' }),
    nao('s40-4', S40, 'Contrapiso apto 601', 'Falta de Material', { teamId: 'tB' }),

    sim('s41-1', S41, 'Diário de obra'),
    sim('s41-2', S41, 'Instalações apto 501', { supplier: 'Gama' }),
    nao('s41-3', S41, 'Reboco apto 501', 'Falta de Mão de Obra', { teamId: 'tA' }),
    row('s41-4', S41, 'Pintura externa fachada norte', { supplier: 'Gama' }), // semana fechada sem apontamento

    // Semana anterior: dois "Não"; só o Reboco tem linha de mesmo nome e empresa na semana atual.
    sim('s42-1', S42, 'Diário de obra'),
    sim('s42-2', S42, 'Pintura externa fachada norte', { supplier: 'Gama' }),
    nao('s42-3', S42, 'Reboco apto 501', 'Falta de Mão de Obra', { teamId: 'tA' }),
    nao('s42-4', S42, 'Contrapiso apto 602', 'Falta de Material', { teamId: 'tB' }),

    // Semana atual.
    row('s43-1', S43, 'Reboco apto 501', { teamId: 'tA' }),
    row('s43-2', S43, 'Pintura externa fachada norte', { supplier: 'Gama' }),
    sim('s43-3', S43, 'Diário de obra'),
  );

  // Médio prazo: plano vivo de outubro e a linha de base congelada no dia 1º.
  data.plans.push(
    { id: 'plan-out', ...stamp, workId: WORK, month: '2026-10', name: 'Outubro', createdBy: 'u1' },
    {
      id: 'base-out',
      ...stamp,
      workId: WORK,
      month: '2026-10',
      name: 'Base de outubro',
      baselineOf: 'plan-out',
      frozenAt: '2026-10-01T12:00:00Z',
      createdBy: 'u1',
    },
  );
  data.planTasks.push(
    // Ativa nesta semana e sem linha na planilha; com o Reboco, estoura a capacidade 1 da equipe Alfa.
    task('ta000001-imper', 'plan-out', 'Impermeabilização cobertura', '2026-10-22', '2026-10-29', { teamId: 'tA' }),
    // Vencida: terminava 16/10 e está em 40%.
    task('ta000002-pintura', 'plan-out', 'Pintura externa fachada norte', '2026-10-05', '2026-10-16', { progress: 40 }),
    // Em andamento abaixo do alvo temporal.
    task('ta000003-reboco', 'plan-out', 'Reboco apto 501', '2026-10-13', '2026-11-06', { progress: 10, teamId: 'tA' }),
    // Concluída.
    task('ta000004-forro', 'plan-out', 'Forro de gesso apto 301', '2026-10-01', '2026-10-09', { progress: 100, actualEnd: '2026-10-09' }),
    // Linha de base: a pintura terminava 09/10 e o reboco 30/10 (cinco dias úteis antes do vivo).
    task('tb000001-imper', 'base-out', 'Impermeabilização cobertura', '2026-10-22', '2026-10-29', { sourceTaskId: 'ta000001-imper' }),
    task('tb000002-pintura', 'base-out', 'Pintura externa fachada norte', '2026-10-05', '2026-10-09', { sourceTaskId: 'ta000002-pintura' }),
    task('tb000003-reboco', 'base-out', 'Reboco apto 501', '2026-10-13', '2026-10-30', { sourceTaskId: 'ta000003-reboco' }),
    task('tb000004-forro', 'base-out', 'Forro de gesso apto 301', '2026-10-01', '2026-10-09', { sourceTaskId: 'ta000004-forro' }),
  );

  // Longo prazo: sequência com dois vagões, um vencido, e uma restrição aberta vencida.
  data.sequences.push({ id: 'seq1', ...stamp, workId: WORK, name: 'Torre', defaultTaktDays: 5, calendar: 'business_days' });
  data.wagons.push(
    {
      id: 'wg1',
      ...stamp,
      sequenceId: 'seq1',
      number: 1,
      plannedStart: '2026-09-01',
      plannedEnd: '2026-10-15',
      taktDays: 5,
      responsibleIds: [],
    },
    {
      id: 'wg2',
      ...stamp,
      sequenceId: 'seq1',
      number: 2,
      plannedStart: '2026-10-16',
      plannedEnd: '2026-11-30',
      taktDays: 5,
      responsibleIds: [],
    },
  );
  data.restrictions.push(
    {
      id: 'r1',
      ...stamp,
      wagonId: 'wg1',
      description: 'Projeto de impermeabilização aprovado',
      responsibleId: 'u1',
      dueDate: '2026-10-10',
      status: 'open',
      blocksExecution: true,
      blocksTerminality: false,
      boardStatus: 'identificada',
    },
    {
      id: 'r2',
      ...stamp,
      wagonId: 'wg2',
      description: 'Compra de argamassa',
      responsibleId: 'u1',
      dueDate: '2026-10-01',
      status: 'resolved',
      resolvedAt: '2026-09-30T12:00:00Z',
      blocksExecution: true,
      blocksTerminality: false,
      boardStatus: 'resolvida',
    },
  );

  // Plano macro: alvenaria e reboco atrás do previsto; pintura ainda não começou. A linha de base
  // previa a pintura duas semanas antes, então o término deslizou 14 dias.
  const alvenaria = service('lt-alv', 'Alvenaria', '2026-08-03', 7, 7);
  const reboco = service('lt-reb', 'Reboco interno', '2026-09-07', 14, 14);
  const pintura = service('lt-pin', 'Pintura', '2026-11-09', 7, 7);
  const longTermPlan: LongTermPlanDocument = {
    floorCount: 5,
    floorNames: {},
    activities: [alvenaria, reboco, pintura],
    baselines: [
      {
        id: 'lb1',
        name: 'Linha de base inicial',
        createdAt: '2026-08-01T00:00:00Z',
        createdBy: 'u1',
        activities: [alvenaria, reboco, { ...pintura, start: '2026-10-26' }],
      },
    ],
    measurements: [
      {
        id: 'm1',
        number: 1,
        date: '2026-09-29',
        createdAt: '2026-09-29T12:00:00Z',
        createdBy: 'u1',
        items: [
          { activityId: 'lt-alv', value: 50 },
          { activityId: 'lt-reb', value: 10 },
        ],
      },
      {
        id: 'm2',
        number: 2,
        date: '2026-10-20',
        createdAt: '2026-10-20T12:00:00Z',
        createdBy: 'u1',
        items: [
          { activityId: 'lt-alv', value: 70 },
          { activityId: 'lt-reb', value: 40 },
        ],
      },
    ],
  };
  return { data, longTermPlan };
}

const ALL: BriefingLevel[] = ['longo', 'medio', 'curto'];
const build = (levels: BriefingLevel[] = ALL, over: Partial<ReturnType<typeof fixture>> = {}) => {
  const f = { ...fixture(), ...over };
  return buildBriefing({ data: f.data, workId: WORK, today: TODAY, levels, longTermPlan: f.longTermPlan, weekOne: WEEK_ONE });
};
const ids = (b: ReturnType<typeof buildBriefing>) => b.findings.map(f => f.id);

// ─── Testes ─────────────────────────────────────────────────────────────────────

test('dossiê completo: cabeçalho, obra e semana atual numerada a partir da semana 1', () => {
  const b = build();
  assert.equal(b.workCode, 'OB1');
  assert.equal(b.workName, 'Residencial Horizonte');
  assert.deepEqual(b.levels, ['longo', 'medio', 'curto']);
  assert.equal(weekNumberFrom(WEEK_ONE, S43), 43);
  assert.equal(b.curto?.currentWeek.number, 43);
  assert.equal(b.curto?.currentWeek.weekStart, S43);
  assert.equal(b.curto?.weekOne, WEEK_ONE);
  assert.match(b.text, /^Obra: OB1 · Residencial Horizonte\. Hoje: 27\/10\/2026 \(terça\)\./);
  assert.ok(b.text.includes('Semana atual: 43 (segunda 26/10/2026).'));
  assert.ok(b.text.includes('## Longo prazo'));
  assert.ok(b.text.includes('## Médio prazo'));
  assert.ok(b.text.includes('## Curto prazo'));
  assert.ok(b.text.includes('## Achados automáticos'));
});

test('curto prazo: série de PPC, Pareto, falha repetida, sem apontamento e "Não" não levado', () => {
  const c = build().curto!;
  assert.deepEqual(
    c.recent.map(w => [w.number, w.percent]),
    [
      [35, 75],
      [36, 50],
      [37, 75],
      [38, 50],
      [39, 75],
      [40, 50],
      [41, 50],
      [42, 50],
    ],
  );
  assert.equal(c.averageRecent, 56.25);
  assert.equal(c.trend, 'estável');
  assert.deepEqual(c.currentWeek, { weekStart: S43, number: 43, planned: 3, fulfilled: 1, pending: 2, percent: (1 / 3) * 100 });
  assert.equal(c.failuresInWindow, 11);
  assert.deepEqual(
    c.topCauses.map(t => [t.cause, t.total]),
    [
      ['Falta de Material', 6],
      ['Falta de Mão de Obra', 5],
    ],
  );
  assert.deepEqual(c.repeated, [{ name: 'Reboco apto 501', company: 'Alfa', weeks: 3, causes: ['Falta de Mão de Obra'] }]);
  assert.equal(c.unrecorded, 2);
  assert.deepEqual(c.notCarried, ['Contrapiso apto 602 (Beta)']);
  // Empreiteiro com PPC mais baixo primeiro; o "Diário de obra" sem empresa entra como "(sem empreiteiro)".
  assert.equal(c.companies[0].company, 'Beta');
  assert.equal(c.companies[0].percent, 0);
  assert.ok(c.companies.some(e => e.company === '(sem empreiteiro)' && e.percent === 100));
});

test('médio prazo: linha de base, vencidas, abaixo do alvo, terminando em breve e equipe sobrecarregada', () => {
  const m = build().medio!;
  assert.deepEqual(m.plan, { name: 'Outubro', month: '2026-10', tasks: 4, leaves: 4, stale: false });
  assert.deepEqual(m.baseline, { name: 'Base de outubro', frozenAt: '2026-10-01T12:00:00Z' });
  assert.equal(m.lateCount, 2);
  assert.deepEqual(m.late, [
    { name: 'Pintura externa fachada norte', days: 5 },
    { name: 'Reboco apto 501', days: 5 },
  ]);
  assert.equal(m.planFinishVariance, 5);
  assert.equal(m.overdueCount, 1);
  assert.deepEqual(m.overdue, [{ name: 'Pintura externa fachada norte', plannedEnd: '2026-10-16', progress: 40 }]);
  assert.equal(m.behindTargetCount, 2);
  assert.deepEqual(
    m.behindTarget.map(t => t.name),
    ['Impermeabilização cobertura', 'Reboco apto 501'],
  );
  assert.equal(m.dueSoonCount, 2);
  assert.deepEqual(m.overloaded, [{ team: 'Alfa · Alvenaria', weeks: 1, peak: 2, capacity: 1 }]);
});

test('longo prazo: avanço físico, serviços atrasados, término deslizado, vagão vencido e restrição vencida', () => {
  const l = build().longo!;
  assert.equal(l.services, 3);
  assert.equal(l.floors, 5);
  assert.equal(l.start, '2026-08-03');
  assert.equal(l.finish, '2026-12-13');
  assert.deepEqual(l.baseline, { name: 'Linha de base inicial', finish: '2026-11-29', finishShiftDays: 14 });
  assert.equal(l.physicalProgress, 37.5);
  assert.ok(Math.abs(l.plannedProgress! - 60.714) < 0.01, `planejado ${l.plannedProgress}`);
  assert.equal(l.lastMeasurement, '2026-10-20');
  assert.equal(l.measurements, 2);
  assert.deepEqual(
    l.behind.map(g => [g.name, g.measured, Math.round(g.gap)]),
    [
      ['Reboco interno', 40, 31],
      ['Alvenaria', 70, 30],
    ],
  );
  assert.equal(l.ahead, 0);
  assert.deepEqual(l.wagons, {
    total: 2,
    overdue: 1,
    overdueNames: ['Vagão 01'],
    restricted: 1,
    openRestrictions: 1,
    overdueRestrictions: ['Projeto de impermeabilização aprovado (venceu 10/10)'],
  });
});

test('achados esperados nos três níveis e nas correlações, com severidade e itens', () => {
  const b = build();
  const found = ids(b);
  for (const id of [
    'longo-avanco-atrasado',
    'longo-servicos-atrasados',
    'longo-termino-deslizou',
    'longo-vagoes-vencidos',
    'longo-restricoes-vencidas',
    'medio-atraso-linha-base',
    'medio-vencidas',
    'medio-abaixo-do-alvo',
    'medio-equipes-sobrecarga',
    'curto-ppc-baixo',
    'curto-falhas-repetidas',
    'curto-sem-apontamento',
    'curto-nao-levadas',
    'cruzado-plano-sem-planilha',
    'cruzado-planilha-fora-do-plano',
    'cruzado-equipe-sobrecarga-falhas',
    'cruzado-ppc-avanco',
    'cruzado-restricoes-causas',
  ])
    assert.ok(found.includes(id), `faltou ${id} em ${found.join(', ')}`);
  for (const id of [
    'curto-semana-vazia',
    'curto-ppc-alto',
    'curto-ppc-caindo',
    'longo-sem-plano',
    'longo-sem-medicao',
    'longo-medicao-antiga',
    'medio-sem-plano',
    'medio-sem-linha-base',
    'medio-plano-desatualizado',
    'cruzado-plano-coberto',
    'cruzado-ritmo',
  ])
    assert.ok(!found.includes(id), `${id} não devia aparecer`);
  // Cada regra aparece uma vez só.
  assert.equal(new Set(found).size, found.length);

  const by = (id: string) => b.findings.find(f => f.id === id)!;
  assert.equal(by('longo-avanco-atrasado').severity, 'alerta'); // 23 pontos
  assert.equal(by('longo-servicos-atrasados').severity, 'alerta'); // maior diferença 31 pontos
  assert.equal(by('longo-termino-deslizou').severity, 'atencao'); // 14 dias
  assert.equal(by('medio-atraso-linha-base').severity, 'alerta'); // 5 dias úteis
  assert.deepEqual(by('medio-vencidas').items, ['Pintura externa fachada norte: término 16/10, 40%']);
  assert.deepEqual(by('curto-nao-levadas').items, ['Contrapiso apto 602 (Beta)']);
  assert.deepEqual(by('curto-falhas-repetidas').items, ['Reboco apto 501 (Alfa): 3 semanas']);
  assert.deepEqual(by('cruzado-plano-sem-planilha').items, ['Impermeabilização cobertura (22/10–29/10, 0%)']);
  assert.ok(by('cruzado-plano-sem-planilha').detail.includes('De 2 tarefas do plano previstas para esta semana, 1 não'));
  assert.deepEqual(by('cruzado-planilha-fora-do-plano').items, ['Diário de obra']);
  assert.deepEqual(by('cruzado-equipe-sobrecarga-falhas').items, ['Alfa · Alvenaria: pico 2 de 1']);
  assert.ok(by('cruzado-ppc-avanco').detail.includes('avanço físico abaixo do macro'));
  assert.ok(!by('cruzado-ppc-avanco').detail.includes('tarefas do mês atrasadas'));
  assert.ok(by('cruzado-restricoes-causas').detail.includes('Falta de Material'));
  // O texto lista cada achado com severidade e nível.
  assert.ok(b.text.includes('- [alerta][curto] 1 linha não cumprida da semana passada sem continuação.'));
});

test('frente atrasada nos três níveis quando o nome pareia do macro à semana', () => {
  const f = fixture();
  const rename = (name: string) => (name === 'Reboco apto 501' ? 'Reboco interno apto 501' : name);
  f.data.commitments.forEach(c => (c.name = rename(c.name)));
  f.data.planTasks.forEach(t => (t.name = rename(t.name)));
  const b = buildBriefing({ data: f.data, workId: WORK, today: TODAY, levels: ALL, longTermPlan: f.longTermPlan, weekOne: WEEK_ONE });
  const chain = b.findings.find(x => x.id === 'cruzado-frente-atrasada');
  assert.ok(chain, ids(b).join(', '));
  assert.equal(chain.severity, 'alerta');
  assert.deepEqual(chain.items, ['Reboco interno: -31 pontos no macro, "Reboco interno apto 501" atrasada no mês, 3 Não na planilha']);
});

test('só o curto prazo liberado: sem médio, sem longo e sem achados desses níveis', () => {
  const b = build(['curto']);
  assert.deepEqual(b.levels, ['curto']);
  assert.equal(b.medio, undefined);
  assert.equal(b.longo, undefined);
  assert.ok(b.curto);
  assert.ok(!b.text.includes('## Médio prazo'));
  assert.ok(!b.text.includes('## Longo prazo'));
  assert.ok(b.text.includes('Níveis lidos: curto.'));
  assert.ok(
    b.findings.every(f => f.level === 'curto'),
    ids(b).join(', '),
  );
  assert.ok(!ids(b).includes('cruzado-plano-sem-planilha'));
  assert.ok(ids(b).includes('curto-nao-levadas'));
});

test('médio e curto sem o longo: correlação plano × planilha continua, as do macro não', () => {
  const b = build(['curto', 'medio']);
  assert.deepEqual(b.levels, ['medio', 'curto']);
  assert.equal(b.longo, undefined);
  assert.ok(ids(b).includes('cruzado-plano-sem-planilha'));
  assert.ok(ids(b).includes('cruzado-equipe-sobrecarga-falhas'));
  assert.ok(!ids(b).includes('cruzado-restricoes-causas'));
  assert.ok(!ids(b).includes('cruzado-ppc-avanco')); // sem macro, e o mês tem menos de 3 atrasadas/vencidas
  assert.ok(b.findings.every(f => f.level !== 'longo'));
});

test('hash: estável entre duas chamadas iguais e muda quando um apontamento muda', () => {
  const a = build(),
    b = build();
  assert.equal(a.hash, b.hash);
  assert.equal(a.text, b.text);
  assert.equal(a.hash, briefingHash(a.text));
  assert.match(a.hash, /^[0-9a-f]{8}$/);
  const f = fixture();
  f.data.commitments.find(c => c.id === 's43-1')!.fulfilled = true;
  const c = buildBriefing({ data: f.data, workId: WORK, today: TODAY, levels: ALL, longTermPlan: f.longTermPlan, weekOne: WEEK_ONE });
  assert.notEqual(c.hash, a.hash);
  assert.equal(c.curto?.currentWeek.fulfilled, 2);
});

test('ordem dos achados: alertas, atenção, positivos, informações; cruzados primeiro dentro do grupo', () => {
  const b = build();
  const severity: Record<FindingSeverity, number> = { alerta: 0, atencao: 1, positivo: 2, info: 3 };
  const level: Record<string, number> = { cruzado: 0, curto: 1, medio: 2, longo: 3 };
  const keys = b.findings.map(f => severity[f.severity] * 10 + level[f.level]);
  for (let i = 1; i < keys.length; i++) assert.ok(keys[i - 1] <= keys[i], `posição ${i}: ${ids(b).join(', ')}`);
  assert.equal(b.findings[0].severity, 'alerta');
  assert.equal(b.findings[0].level, 'cruzado');
  const lastAlert = b.findings.map(f => f.severity).lastIndexOf('alerta');
  const firstAttention = b.findings.findIndex(f => f.severity === 'atencao');
  assert.ok(lastAlert < firstAttention);
  assert.equal(b.findings.at(-1)?.severity, 'info');
});

test('namesPair: iguais sem acento e caixa, contido com quatro letras ou mais, nada com menos', () => {
  assert.equal(namesPair('Reboco', 'reboco'), true);
  assert.equal(namesPair('Alvenaria apto 201', 'ALVENARIA  APTO 201'), true);
  assert.equal(namesPair('Instalações elétricas', 'instalacoes eletricas'), true);
  assert.equal(namesPair('Reboco apto 501', 'Reboco'), true);
  assert.equal(namesPair('Laje', 'Laje 3º pavimento'), true);
  assert.equal(namesPair('laje', 'lixo'), false);
  assert.equal(namesPair('aço', 'Armação de aço'), false); // três letras não pareiam
  assert.equal(namesPair('Forro', 'Pintura'), false);
  assert.equal(namesPair('', 'Reboco'), false);
  assert.equal(namesPair('  ', 'Reboco'), false);
  assert.equal(nameKey('  Instalações   Elétricas '), 'instalacoes eletricas');
});

test('obra sem dados: não lança, aponta semana vazia e falta de plano nos outros níveis', () => {
  const data = empty();
  data.works.push({ id: WORK, ...stamp, name: 'Obra Nova', code: 'OB2', description: '', active: true });
  const b = buildBriefing({ data, workId: WORK, today: TODAY, levels: ALL, weekOne: WEEK_ONE });
  assert.ok(ids(b).includes('curto-semana-vazia'));
  assert.ok(ids(b).includes('longo-sem-plano'));
  assert.ok(ids(b).includes('medio-sem-plano'));
  assert.equal(b.curto?.currentWeek.planned, 0);
  assert.equal(b.curto?.currentWeek.number, 43);
  assert.deepEqual(b.curto?.recent, []);
  assert.equal(b.curto?.averageRecent, undefined);
  assert.equal(b.curto?.trend, undefined);
  assert.equal(b.longo?.services, 0);
  assert.equal(b.longo?.wagons.total, 0);
  assert.equal(b.medio?.plan, undefined);
  assert.ok(b.text.includes('- Sem vagões gerados para esta obra.'));
  assert.ok(b.text.includes('- Nenhuma semana fechada ainda.'));
  // Sem semana 1 configurada e sem linhas, a semana atual é a semana 1.
  const semSemanaUm = buildBriefing({ data, workId: WORK, today: TODAY, levels: ['curto'] });
  assert.equal(semSemanaUm.curto?.currentWeek.number, 1);
  assert.equal(semSemanaUm.curto?.weekOne, S43);
});

test('obra inexistente: cabeçalho com "?" e id, sem lançar', () => {
  const b = buildBriefing({ data: empty(), workId: 'nao-existe', today: TODAY, levels: ['curto'] });
  assert.equal(b.workCode, '');
  assert.equal(b.workName, '');
  assert.ok(b.text.startsWith('Obra: ? · nao-existe.'));
  assert.ok(ids(b).includes('curto-semana-vazia'));
});

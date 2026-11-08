import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CALENDAR } from '../src/domain/plan-schedule';
import type { PlanningData } from '../src/domain/entities';
import { createMockData } from '../src/mocks/planning';
import {
  applyCommand,
  IMPORTED_TEAM_CAPACITY,
  type Command,
  type CommandContext,
  type ImportedPlanTask,
} from '../src/application/use-cases/commands';
import { isCommandAllowed } from '../src/application/module-access';

// Comando `import_plan` (08/11/2026): o cronograma do mês que vem de um arquivo do MS Project.
let seq = 0;
const context: CommandContext = { actorId: 'user-1', today: '2026-11-08', now: '2026-11-08T12:00:00Z', newId: () => `imp-${++seq}` };
const run = (d: PlanningData, c: Command) => applyCommand(d, c, context);
const calendar = { ...DEFAULT_CALENDAR, holidays: ['2026-11-20'] };
const row = (key: string, extra: Partial<ImportedPlanTask> = {}): ImportedPlanTask => ({
  key,
  name: `Tarefa ${key}`,
  level: 1,
  duration: { value: 2, unit: 'd' },
  plannedStart: '2026-11-03',
  plannedEnd: '2026-11-04',
  progress: 0,
  ...extra,
});
const command = (extra: Partial<Extract<Command, { type: 'import_plan' }>> = {}): Command => ({
  type: 'import_plan',
  workId: 'obra-1',
  month: '2026-11',
  name: 'BLT_Médio Prazo NOV - JAN',
  fileName: 'BLT_Médio Prazo NOV - JAN.xml',
  calendar,
  tasks: [
    row('1', { level: 0, name: 'Estrutura', duration: undefined, plannedEnd: '2026-11-09' }),
    row('2', {
      progress: 100,
      actualStart: '2026-11-03',
      actualEnd: '2026-11-04',
      resource: 'SM MARTINS - Revestimentos',
      baseline: { start: '2026-11-02', end: '2026-11-03' },
    }),
    row('3', { resource: 'MO CIVIL - 1', notes: '  Conferir prumo  ', baseline: { start: '2026-11-04', end: '2026-11-05' } }),
    row('4', { constraintType: 'SNET', constraintDate: '2026-11-18', resource: 'JWS' }),
  ],
  links: [{ predecessorKey: '2', successorKey: '3', type: 'TI', lagDays: 1, lagBusiness: true }],
  resources: [
    { name: 'SM MARTINS - Revestimentos', teamId: 'equipe-1' },
    { name: 'MO CIVIL - 1', create: { name: 'MO CIVIL - 1', company: 'MO CIVIL' } },
    { name: 'JWS' },
  ],
  baselineName: 'Linha de base do Project',
  ...extra,
});

test('importa o cronograma com equipes, vínculos, datas pela rede e a linha de base do Project', () => {
  const data = createMockData();
  const teamsBefore = data.teams.length;
  const planId = run(data, command());
  const plan = data.plans.find(p => p.id === planId)!;
  assert.equal(plan.month, '2026-11');
  assert.equal(plan.name, 'BLT_Médio Prazo NOV - JAN');
  assert.deepEqual(plan.calendar, calendar);
  const tasks = data.planTasks.filter(t => t.planId === planId).sort((a, b) => a.order - b.order);
  assert.deepEqual(
    tasks.map(t => [t.name, t.level, t.order]),
    [
      ['Estrutura', 0, 1],
      ['Tarefa 2', 1, 2],
      ['Tarefa 3', 1, 3],
      ['Tarefa 4', 1, 4],
    ],
  );
  const [, done, next, held] = tasks;
  // Concluída fica presa às datas reais; a sucessora vem 1 dia útil depois (TI+1).
  assert.equal(done.teamId, 'equipe-1');
  assert.equal(done.actualEnd, '2026-11-04');
  assert.equal(next.plannedStart, '2026-11-06');
  assert.equal(next.plannedEnd, '2026-11-09');
  assert.equal(next.notes, 'Conferir prumo');
  // "Não iniciar antes de" 18/11 e o feriado de 20/11 no meio: 18, 19 e pula para 23.
  assert.equal(held.plannedStart, '2026-11-18');
  assert.equal(held.plannedEnd, '2026-11-19');
  assert.equal(held.teamId, undefined, 'recurso sem destino fica sem equipe');
  // Equipe nova, com a capacidade do recurso do Project.
  assert.equal(data.teams.length, teamsBefore + 1);
  const created = data.teams.find(t => t.id === next.teamId)!;
  assert.deepEqual(
    [created.name, created.company, created.weeklyCapacity, created.workId],
    ['MO CIVIL - 1', 'MO CIVIL', IMPORTED_TEAM_CAPACITY, 'obra-1'],
  );
  const links = data.planDependencies.filter(l => l.successorId === next.id);
  assert.deepEqual(
    links.map(l => [l.predecessorId, l.type, l.lagDays, l.lagBusiness]),
    [[done.id, 'TI', 1, true]],
  );
  // Linha de base: o resumo e as duas folhas com base; a folha sem base fica fora.
  const baseline = data.plans.find(p => p.baselineOf === planId)!;
  assert.equal(baseline.name, 'Linha de base do Project');
  assert.ok(baseline.frozenAt);
  const frozen = data.planTasks.filter(t => t.planId === baseline.id).sort((a, b) => a.order - b.order);
  assert.deepEqual(
    frozen.map(t => [t.sourceTaskId, t.plannedStart, t.plannedEnd, t.progress, t.actualStart]),
    [
      [tasks[0].id, tasks[0].plannedStart, tasks[0].plannedEnd, 0, undefined],
      [done.id, '2026-11-02', '2026-11-03', 0, undefined],
      [next.id, '2026-11-04', '2026-11-05', 0, undefined],
    ],
  );
  assert.equal(data.planDependencies.filter(l => frozen.some(t => t.id === l.successorId)).length, 1);
  const history = data.history.find(h => h.action === 'plan_import' && h.entityId === planId)!;
  assert.deepEqual(history.changes, {
    fileName: 'BLT_Médio Prazo NOV - JAN.xml',
    tasks: 4,
    links: 1,
    teamsCreated: 1,
    baselineId: baseline.id,
  });
});

test('equipe já cadastrada com o mesmo nome e empresa é reaproveitada, sem duplicar', () => {
  const data = createMockData();
  const teamsBefore = data.teams.length;
  run(data, command({ resources: [{ name: 'MO CIVIL - 1', create: { name: 'revestimentos', company: 'sm martins' } }] }));
  assert.equal(data.teams.length, teamsBefore);
  const task = data.planTasks.find(t => t.name === 'Tarefa 3' && !data.plans.find(p => p.id === t.planId)?.baselineOf)!;
  assert.equal(task.teamId, 'equipe-1');
});

test('sem nome de linha de base ou sem base no arquivo, não cria linha de base', () => {
  const data = createMockData();
  const planId = run(data, command({ baselineName: undefined }));
  assert.equal(data.plans.filter(p => p.baselineOf === planId).length, 0);
  const other = createMockData();
  const tasks = (command() as Extract<Command, { type: 'import_plan' }>).tasks.map(t => ({ ...t, baseline: undefined }));
  const id = run(other, command({ tasks }));
  assert.equal(other.plans.filter(p => p.baselineOf === id).length, 0);
});

test('recusa o que o cronograma do mês não aceita', () => {
  const tasks = (command() as Extract<Command, { type: 'import_plan' }>).tasks;
  const cases: [Partial<Extract<Command, { type: 'import_plan' }>>, RegExp][] = [
    [{ month: '2026-13' }, /AAAA-MM/],
    [{ tasks: [] }, /não tem tarefas/],
    [{ tasks: [{ ...tasks[0], level: 1 }, ...tasks.slice(1)] }, /Linha 1: hierarquia/],
    [{ tasks: [...tasks.slice(0, 3), { ...tasks[3], key: '2' }] }, /Linha 4: identificador repetido/],
    [{ tasks: [{ ...tasks[0], constraintType: 'SNET', constraintDate: '2026-11-03' }, ...tasks.slice(1)] }, /resumo não recebe restrição/],
    [{ tasks: [tasks[0], { ...tasks[1], progress: 60 }, ...tasks.slice(2)] }, /Linha 2: tarefa com término real deve estar 100% concluída/],
    [{ tasks: [tasks[0], { ...tasks[1], actualStart: undefined }, ...tasks.slice(2)] }, /Linha 2: término real exige início real/],
    [{ tasks: [tasks[0], tasks[1], { ...tasks[2], progress: 30 }, tasks[3]] }, /Linha 3: tarefa com % concluído precisa de início real/],
    [{ links: [{ predecessorKey: '2', successorKey: '9', type: 'TI', lagDays: 0, lagBusiness: true }] }, /Vínculo 1: tarefa inexistente/],
    [{ links: [{ predecessorKey: '2', successorKey: '2', type: 'TI', lagDays: 0, lagBusiness: true }] }, /si mesma/],
    [{ links: [{ predecessorKey: '2', successorKey: '3', type: 'TI', lagDays: 1.5, lagBusiness: true }] }, /defasagem/],
    [{ resources: [{ name: 'JWS', teamId: 'equipe-de-outra-obra' }] }, /Recurso "JWS": equipe deve pertencer à obra/],
    [{ calendar: { ...calendar, weekdays: [] } }, /dias úteis/],
    [{ workId: 'obra-sem-acesso' }, /acesso a esta obra/],
  ];
  for (const [extra, message] of cases) assert.throws(() => run(createMockData(), command(extra)), message, String(message));
});

test('recusa um segundo plano no mesmo mês da obra', () => {
  const data = createMockData();
  run(data, command());
  assert.throws(() => run(data, command()), /já tem um plano para este mês/);
});

test('ciclo no arquivo é recusado pelo motor, sem gravar nada', () => {
  const data = createMockData();
  const plans = data.plans.length;
  assert.throws(() =>
    run(
      data,
      command({
        links: [
          { predecessorKey: '2', successorKey: '3', type: 'TI', lagDays: 0, lagBusiness: true },
          { predecessorKey: '3', successorKey: '2', type: 'TI', lagDays: 0, lagBusiness: true },
        ],
      }),
    ),
  );
  assert.equal(data.plans.length, plans);
});

test('o módulo de médio prazo libera a importação para quem não é desenvolvedor', () => {
  assert.equal(isCommandAllowed('import_plan', { developer: false, modules: ['medio-prazo'] }), true);
  assert.equal(isCommandAllowed('import_plan', { developer: false, modules: [] }), false);
});

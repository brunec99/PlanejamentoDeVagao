import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeSchedule,
  constraintOf,
  endFor,
  parseDuration,
  signedWorkingDays,
  validateConstraint,
  DEFAULT_CALENDAR,
  type WorkCalendar,
} from '../src/domain/plan-schedule';
import type { PlanTask, PlanDependency, PlanningData } from '../src/domain/entities';
import { CENARIOS, type Cenario } from './fixtures/cenarios-project';
import { createMockData } from '../src/mocks/planning';
import { applyCommand, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { planningDataToPayload, rowsToPlanningData, type Rows } from '../src/infrastructure/repositories/supabase/mappers';

/* Bancada de engenharia reversa do MS Project: cada cenário de `fixtures/cenarios-project.ts`
 * descreve um cronograma pequeno e o que o Project dá para ele (datas, datas tardias, folgas,
 * crítica, conflito, prazo perdido, predecessoras determinantes). O motor tem de bater em todos. */

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' };

function montar(cenario: Cenario) {
  const calendar: WorkCalendar = { ...DEFAULT_CALENDAR, holidays: cenario.feriados ?? [] };
  const tasks: PlanTask[] = cenario.tarefas.map((t, i) => {
    const duration = parseDuration(t.dur);
    const start = t.inicio ?? '2026-09-07';
    return {
      id: t.id,
      ...stamp,
      planId: 'p',
      name: t.id,
      plannedStart: start,
      plannedEnd: endFor(start, duration, calendar).end,
      duration,
      level: t.nivel ?? 0,
      order: i + 1,
      progress: t.progresso ?? 0,
      ...(t.restricao ? { constraintType: t.restricao.tipo, constraintDate: t.restricao.data } : {}),
      ...(t.prazo ? { deadline: t.prazo } : {}),
      ...(t.inicioReal ? { actualStart: t.inicioReal } : {}),
      ...(t.terminoReal ? { actualEnd: t.terminoReal } : {}),
    };
  });
  const links: PlanDependency[] = (cenario.vinculos ?? []).map((v, i) => ({
    id: `l${i}`,
    ...stamp,
    predecessorId: v.de,
    successorId: v.para,
    type: v.tipo ?? 'TI',
    lagDays: v.lag ?? 0,
    lagBusiness: !v.corrido,
  }));
  return { tasks, links, calendar };
}

for (const cenario of CENARIOS)
  test(`Project: ${cenario.nome}`, () => {
    const { tasks, links, calendar } = montar(cenario);
    const { tasks: out, info } = analyzeSchedule(tasks, links, calendar);
    for (const [id, esperado] of Object.entries(cenario.esperado)) {
      const t = out.find(x => x.id === id)!,
        i = info.get(id)!;
      const resumo = out[out.indexOf(t) + 1]?.level > t.level;
      const obtido: Record<string, unknown> = {
        inicio: resumo ? i.earlyStart : t.plannedStart,
        termino: resumo ? i.earlyFinish : t.plannedEnd,
        inicioTardio: i.lateStart,
        terminoTardio: i.lateFinish,
        folgaTotal: i.totalSlack,
        folgaLivre: i.freeSlack,
        critica: i.critical,
        conflito: i.conflict,
        prazoPerdido: i.deadlineMissed,
        determinantes: [...i.driverIds].sort(),
      };
      for (const [campo, valor] of Object.entries(esperado))
        assert.deepEqual(obtido[campo], Array.isArray(valor) ? [...valor].sort() : valor, `${id}.${campo}`);
    }
  });

test('restrições: formato antigo vira NIAD, tipos com data exigem data, siglas e rótulos existem', () => {
  assert.deepEqual(constraintOf({ anchorStart: '2026-09-14' }), { type: 'SNET', date: '2026-09-14' });
  assert.deepEqual(constraintOf({ constraintType: 'MFO', constraintDate: '2026-09-14', anchorStart: '2026-09-01' }), {
    type: 'MFO',
    date: '2026-09-14',
  });
  assert.deepEqual(constraintOf({ constraintType: 'ALAP', constraintDate: '2026-09-14' }), { type: 'ALAP' });
  assert.deepEqual(constraintOf({}), { type: 'ASAP' });
  assert.throws(() => validateConstraint({ type: 'SNET' }), /exige uma data/);
  assert.throws(() => validateConstraint({ type: 'FNLT', date: '14/09/2026' }), /Data inválida/);
  assert.doesNotThrow(() => validateConstraint({ type: 'ALAP' }));
});

test('dias úteis com sinal pulam fim de semana e feriado', () => {
  const c = { ...DEFAULT_CALENDAR, holidays: ['2026-09-07'] };
  assert.equal(signedWorkingDays('2026-09-04', '2026-09-04', c), 0);
  assert.equal(signedWorkingDays('2026-09-04', '2026-09-08', c), 1);
  assert.equal(signedWorkingDays('2026-09-08', '2026-09-04', c), -1);
  assert.equal(signedWorkingDays('2026-09-04', '2026-09-11', c), 4);
});

test('tarefa concluída não é crítica e não tem folga livre; tarefa iniciada só tem folga do término', () => {
  const { tasks, links, calendar } = montar({
    nome: 'x',
    tarefas: [
      { id: 'A', dur: '2d', inicio: '2026-09-07', inicioReal: '2026-09-07', terminoReal: '2026-09-08', progresso: 100 },
      { id: 'B', dur: '2d', inicioReal: '2026-09-09', progresso: 50 },
      { id: 'C', dur: '5d', inicio: '2026-09-07' },
    ],
    vinculos: [{ de: 'A', para: 'B' }],
    esperado: {},
  });
  const { info } = analyzeSchedule(tasks, links, calendar);
  assert.equal(info.get('A')!.critical, false);
  assert.equal(info.get('A')!.freeSlack, 0);
  assert.equal(info.get('A')!.lateFinish, '2026-09-08');
  assert.equal(info.get('B')!.lateStart, '2026-09-09');
  assert.equal(info.get('B')!.totalSlack, 1);
  assert.equal(info.get('B')!.critical, false);
});

test('folga crítica configurável, como a opção do Project', () => {
  const { tasks, links, calendar } = montar(CENARIOS.find(c => c.nome.startsWith('Dois caminhos'))!);
  assert.equal(analyzeSchedule(tasks, links, calendar).info.get('C')!.critical, false);
  assert.equal(analyzeSchedule(tasks, links, calendar, { criticalSlack: 3 }).info.get('C')!.critical, true);
});

// ————— Gravação: comando e mapper —————

const task = (id: string, start = '2026-09-07', duration = '2d', extra: Partial<PlanTask> = {}): PlanTask => ({
  id,
  ...stamp,
  planId: 'p',
  name: id,
  plannedStart: start,
  plannedEnd: endFor(start, parseDuration(duration), DEFAULT_CALENDAR).end,
  duration: parseDuration(duration),
  level: 0,
  order: Number(id) || 1,
  progress: 0,
  ...extra,
});
let seq = 0;
const context: CommandContext = { actorId: 'user-1', today: '2026-09-22', now: '2026-09-22T12:00:00Z', newId: () => `cpm-${++seq}` };
const run = (d: PlanningData, c: Command) => applyCommand(d, c, context);
function withPlan() {
  const data = createMockData();
  const planId = run(data, { type: 'create_plan', workId: data.works[0].id, month: '2026-09' });
  const plan = data.plans.find(p => p.id === planId)!;
  const revision = (tasks: PlanTask[], links: PlanDependency[] = []): Command => ({
    type: 'save_plan_revision',
    planId: plan.id,
    expectedSnapshot: JSON.stringify({ plan, tasks: [], links: [] }),
    reason: 'teste',
    tasks,
    links,
    calendar: DEFAULT_CALENDAR,
  });
  return { data, plan, revision };
}

test('revisão grava restrição e prazo final no formato atual e apaga o antigo', () => {
  const { data, plan, revision } = withPlan();
  const rows = [
    task('1', '2026-09-07', '2d', { planId: plan.id, anchorStart: '2026-09-07' }),
    task('2', '2026-09-10', '2d', { planId: plan.id, constraintType: 'FNLT', constraintDate: '2026-09-11', deadline: '2026-09-18' }),
  ];
  run(data, revision(rows));
  const saved = data.planTasks.filter(t => t.planId === plan.id).sort((a, b) => a.order - b.order);
  assert.equal(saved[0].anchorStart, undefined);
  assert.equal(saved[0].constraintType, 'SNET');
  assert.equal(saved[0].constraintDate, '2026-09-07');
  assert.equal(saved[1].constraintType, 'FNLT');
  assert.equal(saved[1].deadline, '2026-09-18');
  assert.equal(saved[1].plannedEnd, '2026-09-11');
  const history = data.history.find(h => h.action === 'plan_task_revision' && h.entityId === saved[1].id)!;
  const fields = history.changes.fields as Record<string, { before: unknown; after: unknown }>;
  assert.equal(fields.constraintType.after, 'FNLT');
  assert.equal(fields.deadline.after, '2026-09-18');
});

test('revisão recusa restrição sem data, data inválida e restrição ou prazo em resumo', () => {
  const { data, plan, revision } = withPlan();
  assert.throws(() => run(data, revision([task('1', '2026-09-07', '2d', { planId: plan.id, constraintType: 'SNET' })])), /exige uma data/);
  assert.throws(() => run(data, revision([task('1', '2026-09-07', '2d', { planId: plan.id, deadline: 'amanhã' })])), /Data inválida/);
  assert.throws(
    () =>
      run(
        data,
        revision([
          task('1', '2026-09-07', '2d', { planId: plan.id, deadline: '2026-09-30' }),
          task('2', '2026-09-07', '2d', { planId: plan.id, level: 1 }),
        ]),
      ),
    /resumo não recebe restrição nem prazo final/,
  );
});

test('mapper: o jsonb antigo com anchorStart é lido como NIAD e volta gravado no formato atual', () => {
  const data = createMockData();
  const plan = { ...stamp, id: 'plan', workId: data.works[0].id, month: '2026-09', name: 'Plano', createdBy: 'u' };
  data.plans.push(plan);
  data.planTasks.push(
    task('a', '2026-09-07', '2d', { planId: plan.id, deadline: '2026-09-30', constraintType: 'MSO', constraintDate: '2026-09-07' }),
  );
  const payload = planningDataToPayload(data) as unknown as Rows;
  const row = payload.plan_tasks.find(r => r.id === 'a')!;
  assert.equal(row.schedule_meta?.constraintType, 'MSO');
  assert.equal(row.schedule_meta?.deadline, '2026-09-30');
  assert.equal('anchorStart' in (row.schedule_meta ?? {}), false);
  row.schedule_meta = { duration: { value: 2, unit: 'd' }, anchorStart: '2026-09-14' };
  const back = rowsToPlanningData(payload).planTasks.find(t => t.id === 'a')!;
  assert.equal(back.anchorStart, undefined);
  assert.equal(back.constraintType, 'SNET');
  assert.equal(back.constraintDate, '2026-09-14');
});

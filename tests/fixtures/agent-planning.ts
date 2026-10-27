import type { PlanningData, PlanTask, WeeklyCommitment } from '../../src/domain/entities';
import type { LongTermPlanDocument } from '../../src/domain/long-term-plan';
import { addDays } from '../../src/domain/validation';

/** Obra de exemplo do agente de IA (27/10/2026), compartilhada entre `agent-tools.test.ts` e o teste de
 * fumaça contra a API real (`scripts/agent-smoke.ts`): semana 42 com dois "Não", semana 43 sem apontamento,
 * plano de outubro com tarefa vencida e tarefa sem linha na semana, macro com uma medição. */

/** Terça-feira 27/10/2026: semana atual 43 (26/10), anterior 42 (19/10), seguinte 44 (02/11). */
export const TODAY = '2026-10-27';
export const WEEK_ONE = '2026-01-05';
export const WORK = 'w1';
export const S35 = '2026-08-31',
  S42 = '2026-10-19',
  S43 = '2026-10-26',
  S44 = '2026-11-02';

export const stamp = { createdAt: '2026-08-01T12:00:00Z', updatedAt: '2026-08-01T12:00:00Z' };
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

// Os ids têm oito primeiros caracteres distintos: é o apelido que o modelo vê ("c:c42-0001").
let created = 0;
const row = (id: string, weekStart: string, name: string, over: Partial<WeeklyCommitment> = {}): WeeklyCommitment => ({
  id,
  ...stamp,
  createdAt: `2026-08-01T12:00:${String(++created).padStart(2, '0')}Z`,
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
let order = 0;
const task = (id: string, name: string, start: string, end: string, over: Partial<PlanTask> = {}): PlanTask => ({
  id,
  ...stamp,
  planId: 'plan-out',
  name,
  plannedStart: start,
  plannedEnd: end,
  progress: 0,
  order: ++order,
  level: 0,
  ...over,
});

export function fixture(): PlanningData {
  created = 0;
  order = 0;
  const data = empty();
  data.works.push({ id: WORK, ...stamp, name: 'Residencial Horizonte', code: 'OB1', description: '', active: true });
  data.teams.push(
    { id: 'tA', ...stamp, workId: WORK, company: 'Alfa', name: 'Alvenaria', weeklyCapacity: 1 },
    { id: 'tB', ...stamp, workId: WORK, company: 'Beta', name: 'Acabamento', weeklyCapacity: 2 },
  );
  data.commitments.push(
    row('c35-0001-forma', S35, 'Forma pilares', { supplier: 'Alfa', startDate: S35, endDate: '2026-09-02', fulfilled: true }),
    row('c42-0001-reboco', S42, 'Reboco apto 501', {
      teamId: 'tA',
      startDate: '2026-10-19',
      endDate: '2026-10-21',
      fulfilled: false,
      cause: 'Falta de Mão de Obra',
    }),
    row('c42-0002-contrapiso', S42, 'Contrapiso apto 602', {
      supplier: 'Beta',
      teamId: 'tB',
      startDate: '2026-10-20',
      endDate: '2026-10-23',
      fulfilled: false,
      cause: 'Falta de Material',
    }),
    row('c42-0003-diario', S42, 'Diário de obra', { startDate: '2026-10-19', endDate: '2026-10-24', fulfilled: true }),
    row('c42-0004-pintura', S42, 'Pintura externa', { supplier: 'Gama', startDate: '2026-10-19', endDate: '2026-10-23' }),
    row('c43-0001-reboco', S43, 'Reboco apto 501', { teamId: 'tA', startDate: '2026-10-26', endDate: '2026-10-28' }),
    row('c43-0002-gfip', S43, 'GFIP', { startDate: '2026-10-26', endDate: '2026-10-26' }),
    // Linha de outra obra: nunca aparece nem resolve por apelido.
    row('c43-0009-outra', S43, 'Fora da obra', { workId: 'w2' }),
  );
  data.plans.push(
    { id: 'plan-out', ...stamp, workId: WORK, month: '2026-10', name: 'Outubro', createdBy: 'u1' },
    {
      id: 'base-out',
      ...stamp,
      workId: WORK,
      month: '2026-10',
      name: 'Base',
      baselineOf: 'plan-out',
      frozenAt: '2026-10-01T12:00:00Z',
      createdBy: 'u1',
    },
  );
  data.planTasks.push(
    task('ta000001-imper', 'Impermeabilização cobertura', '2026-10-22', '2026-10-29', { teamId: 'tA' }),
    task('ta000002-pintura', 'Pintura externa fachada norte', '2026-10-05', '2026-10-16', { progress: 40 }),
    task('ta000003-reboco', 'Reboco apto 501', '2026-10-13', '2026-11-06', { progress: 10, teamId: 'tA' }),
    task('ta000004-forro', 'Forro de gesso apto 301', '2026-10-01', '2026-10-09', { progress: 100, actualEnd: '2026-10-09' }),
    task('ta000005-contramarco', 'Contramarco janelas', '2026-11-03', '2026-11-10'),
    // Tarefa da linha de base congelada: não é do plano vivo.
    task('tb000001-imper', 'Impermeabilização cobertura', '2026-10-22', '2026-10-29', {
      planId: 'base-out',
      sourceTaskId: 'ta000001-imper',
    }),
  );
  return data;
}

export const longTermPlan: LongTermPlanDocument = {
  floorCount: 5,
  floorNames: {},
  activities: [
    {
      id: 'lt-alv',
      name: 'Alvenaria',
      color: '#2563eb',
      firstFloor: 1,
      lastFloor: 5,
      start: '2026-08-03',
      duration: 7,
      interval: 7,
      visible: true,
      predecessors: [],
      teams: [],
      unit: '%',
    },
    {
      id: 'lt-pin',
      name: 'Pintura',
      color: '#16a34a',
      firstFloor: 1,
      lastFloor: 5,
      start: '2026-11-09',
      duration: 7,
      interval: 7,
      visible: true,
      predecessors: [],
      teams: [],
    },
    {
      id: 'lt-oculto',
      name: 'Oculto',
      color: '#000',
      firstFloor: 1,
      lastFloor: 1,
      start: '2026-08-03',
      duration: 1,
      interval: 1,
      visible: false,
      predecessors: [],
      teams: [],
    },
  ],
  baselines: [],
  measurements: [
    {
      id: 'm1',
      number: 1,
      date: '2026-10-20',
      createdAt: '2026-10-20T12:00:00Z',
      createdBy: 'u1',
      items: [{ activityId: 'lt-alv', value: 70 }],
    },
  ],
};

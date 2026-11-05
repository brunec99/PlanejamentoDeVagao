import test from 'node:test';
import assert from 'node:assert/strict';
import type { MediumTermPlan, PlanDependency, PlanningData, PlanTask } from '../src/domain/entities';
import { DEFAULT_CALENDAR } from '../src/domain/plan-schedule';
import { createMockData } from '../src/mocks/planning';
import { referenceOf, type DashboardFilters } from '../src/modules/dashboard/model';
import {
  buildMediumTermPanel,
  mediumTermCallout,
  mediumTermSnapshot,
  mediumTermSummary,
  pickPlan,
} from '../src/modules/dashboard/medium-term-panel';
import { resolvePeriod, type PeriodContext, type PeriodSelection } from '../src/modules/dashboard/period';

/** Quadro do médio prazo da aba 0: plano de novembro de 2026 com resumo, marcos, vínculos e uma linha
 * de base congelada em 30/10; a semana analisada é a de 02/11 a 07/11. */
const stamp = { createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z' };
const WORK = 'obra-1';
const plan = (id: string, month: string, extra: Partial<MediumTermPlan> = {}): MediumTermPlan => ({
  id,
  ...stamp,
  workId: WORK,
  month,
  name: `Plano ${month}`,
  createdBy: 'user-1',
  calendar: DEFAULT_CALENDAR,
  ...extra,
});
let order = 0;
const task = (id: string, planId: string, name: string, start: string, end: string, extra: Partial<PlanTask> = {}): PlanTask => ({
  id,
  ...stamp,
  planId,
  name,
  plannedStart: start,
  plannedEnd: end,
  progress: 0,
  order: ++order,
  level: 0,
  ...extra,
});
const milestone = (id: string, planId: string, name: string, date: string, extra: Partial<PlanTask> = {}) =>
  task(id, planId, name, date, date, { duration: { value: 0, unit: 'd' }, ...extra });
const link = (predecessorId: string, successorId: string): PlanDependency => ({
  id: `l-${predecessorId}-${successorId}`,
  ...stamp,
  predecessorId,
  successorId,
  type: 'TI',
  lagDays: 0,
  lagBusiness: true,
});

function setup(): PlanningData {
  const data = createMockData();
  order = 0;
  data.plans.push(
    plan('plan-out', '2026-10'),
    plan('plan-nov', '2026-11', { name: 'Plano de novembro' }),
    plan('base-nov', '2026-11', { name: 'Base 30/10', baselineOf: 'plan-nov', frozenAt: '2026-10-30T12:00:00Z' }),
  );
  // Plano vivo de novembro: um resumo com três filhas, duas tarefas soltas, dois marcos e uma tarefa sem equipe.
  data.planTasks.push(
    task('S', 'plan-nov', 'Estrutura', '2026-10-26', '2026-11-20'),
    task('A', 'plan-nov', 'Formas 5º', '2026-10-26', '2026-10-30', {
      level: 1,
      progress: 100,
      teamId: 'equipe-1',
      duration: { value: 5, unit: 'd' },
    }),
    task('B', 'plan-nov', 'Concretagem 5º', '2026-11-02', '2026-11-04', {
      level: 1,
      progress: 50,
      teamId: 'equipe-1',
      duration: { value: 3, unit: 'd' },
    }),
    task('C', 'plan-nov', 'Armação 6º', '2026-11-03', '2026-11-06', { level: 1, teamId: 'equipe-2', duration: { value: 4, unit: 'd' } }),
    task('D', 'plan-nov', 'Alvenaria 3º', '2026-11-09', '2026-11-20', { teamId: 'equipe-2', duration: { value: 10, unit: 'd' } }),
    milestone('M', 'plan-nov', 'Laje do 6º concretada', '2026-11-20'),
    milestone('M0', 'plan-nov', 'Início da estrutura', '2026-10-15', { progress: 100 }),
    task('E', 'plan-nov', 'Tarefa sem equipe', '2026-10-28', '2026-11-03'),
  );
  data.planDependencies.push(link('C', 'D'), link('D', 'M'));
  // Linha de base: cópia congelada com `sourceTaskId`; B, D e M estavam mais cedo, C mais tarde, E não
  // existia e R saiu do plano vivo.
  const copy = (source: string, start: string, end: string, extra: Partial<PlanTask> = {}) => {
    const original = data.planTasks.find(t => t.id === source)!;
    return { ...original, id: `${source}-b`, planId: 'base-nov', sourceTaskId: source, plannedStart: start, plannedEnd: end, ...extra };
  };
  data.planTasks.push(
    copy('S', '2026-10-26', '2026-11-13'),
    copy('A', '2026-10-26', '2026-10-30'),
    copy('B', '2026-10-29', '2026-11-02'),
    copy('C', '2026-11-05', '2026-11-10'),
    copy('D', '2026-11-02', '2026-11-13'),
    copy('M', '2026-11-13', '2026-11-13'),
    copy('M0', '2026-10-15', '2026-10-15'),
    task('R-b', 'base-nov', 'Tarefa removida', '2026-11-03', '2026-11-05', { teamId: 'equipe-2' }),
  );
  // Plano vivo de outubro: duas tarefas da mesma equipe que atravessam a semana analisada e estouram a capacidade 2.
  data.planTasks.push(
    task('O1', 'plan-out', 'Reboco 2º', '2026-10-26', '2026-11-06', { teamId: 'equipe-1', progress: 40 }),
    task('O2', 'plan-out', 'Reboco 3º', '2026-10-26', '2026-11-06', { teamId: 'equipe-1', progress: 10 }),
  );
  return data;
}

const refFor = (week: string) => referenceOf(week, '2026-11-04', '2026-01-05');
const ref = refFor('2026-11-02');
const noFilter: DashboardFilters = { week: ref.week };

test('escolhe o plano vivo do mês da data e cai no mais recente até o mês ou no mais recente de todos', () => {
  const data = setup();
  assert.equal(pickPlan(data.plans, WORK, '2026-11-07')?.id, 'plan-nov');
  assert.equal(pickPlan(data.plans, WORK, '2026-10-31')?.id, 'plan-out');
  // Dezembro não tem plano: usa o de novembro, o último até aquele mês.
  assert.equal(pickPlan(data.plans, WORK, '2026-12-12')?.id, 'plan-nov');
  // Setembro é antes de todos: usa o vivo mais recente.
  assert.equal(pickPlan(data.plans, WORK, '2026-09-05')?.id, 'plan-nov');
  // Linha de base nunca é escolhida, nem em outra obra.
  assert.equal(pickPlan(data.plans, 'obra-2', '2026-11-07'), undefined);
  assert.equal(buildMediumTermPanel(data, WORK, refFor('2026-12-07'), { week: '2026-12-07' })?.plan.id, 'plan-nov');
});

test('sem plano vivo o módulo fica sem dado', () => {
  const data = setup();
  data.plans = data.plans.filter(p => p.id === 'base-nov');
  assert.equal(buildMediumTermPanel(data, WORK, ref, noFilter), undefined);
  assert.equal(buildMediumTermPanel(createMockData(), WORK, ref, noFilter), undefined);
});

test('conta só as folhas, por status do % concluída, e aponta as atrasadas na data', () => {
  const d = buildMediumTermPanel(setup(), WORK, ref, noFilter)!;
  assert.equal(d.reference, '2026-11-07');
  assert.equal(d.plan.name, 'Plano de novembro');
  assert.equal(d.plan.monthLabel, 'novembro de 2026');
  // S é resumo e não conta: ficam A, B, C, D, M, M0 e E.
  assert.equal(d.plan.taskCount, 7);
  assert.deepEqual([d.done, d.inProgress, d.notStarted], [2, 1, 4]);
  assert.deepEqual(
    d.byStatus.map(s => [s.label, s.value]),
    [
      ['Concluídas', 2],
      ['Em andamento', 1],
      ['Não iniciadas', 4],
    ],
  );
  // Término antes de 07/11 e menos de 100%: E (03/11), B (04/11) e C (06/11); A e M0 estão concluídas.
  assert.equal(d.late.count, 3);
  assert.equal(d.late.inProgress, 1);
  assert.deepEqual(
    d.late.samples.map(s => [s.name, s.plannedEnd, s.daysLate]),
    [
      ['Tarefa sem equipe', '2026-11-03', 4],
      ['Concretagem 5º', '2026-11-04', 3],
      ['Armação 6º', '2026-11-06', 1],
    ],
  );
  assert.equal(d.companyFiltered, false);
});

test('compara com a linha de base mais recente em dias úteis e lista os maiores atrasos', () => {
  const d = buildMediumTermPanel(setup(), WORK, ref, noFilter)!;
  const b = d.baseline!;
  assert.equal(b.name, 'Base 30/10');
  assert.equal(b.frozenAt, '2026-10-30T12:00:00Z');
  // B +2, D +5 e M +5 atrasadas; C −2 adiantada; A e M0 no prazo; E nova; R removida.
  assert.deepEqual([b.late, b.early, b.onTime, b.added, b.removed], [3, 1, 2, 1, 1]);
  assert.deepEqual(
    b.worst.map(w => [w.name, w.days]),
    [
      ['Alvenaria 3º', 5],
      ['Laje do 6º concretada', 5],
      ['Concretagem 5º', 2],
    ],
  );
  // Último término vivo (20/11) contra o da base (13/11): cinco dias úteis.
  assert.equal(b.planFinishVariance, 5);
});

test('sem linha de base congelada o campo fica indefinido', () => {
  const data = setup();
  data.plans = data.plans.filter(p => p.id !== 'base-nov');
  const d = buildMediumTermPanel(data, WORK, ref, noFilter)!;
  assert.equal(d.baseline, undefined);
  assert.equal(mediumTermSummary(d, ref).kpi.hint, 'Plano de novembro de 2026 · sem linha de base');
});

test('caminho crítico vem do motor e os marcos dos 30 dias trazem a flag', () => {
  const d = buildMediumTermPanel(setup(), WORK, ref, noFilter)!;
  // C → D → M fecha o plano em 20/11; o resto tem folga.
  assert.deepEqual(d.critical, { count: 3, planFinish: '2026-11-20' });
  assert.equal(d.milestoneHorizonEnd, '2026-12-07');
  // M0 (15/10) já passou e fica fora da janela.
  assert.deepEqual(d.milestones, [{ name: 'Laje do 6º concretada', date: '2026-11-20', critical: true }]);
  // Na semana de 07/12 o marco de 20/11 já ficou para trás.
  const later = buildMediumTermPanel(setup(), WORK, refFor('2026-12-07'), { week: '2026-12-07' })!;
  assert.deepEqual(later.milestones, []);
});

test('rede com ciclo não derruba o quadro: caminho crítico fica indefinido e o marco sem flag', () => {
  const data = setup();
  data.planDependencies.push(link('M', 'C'));
  const d = buildMediumTermPanel(data, WORK, ref, noFilter)!;
  assert.equal(d.critical, undefined);
  assert.deepEqual(d.milestones, [{ name: 'Laje do 6º concretada', date: '2026-11-20', critical: false }]);
  assert.match(mediumTermCallout(d), /Caminho crítico indisponível/);
});

test('equipes superalocadas são as da semana analisada, no plano inteiro', () => {
  const d = buildMediumTermPanel(setup(), WORK, ref, noFilter)!;
  // Revestimentos (capacidade 2) tem B, O1 e O2 na semana; Elétrica (capacidade 3) só C.
  assert.deepEqual(d.overloaded, { count: 1, names: ['SM MARTINS · Revestimentos'] });
  // Semana seguinte: só D e nada acima da capacidade.
  assert.deepEqual(buildMediumTermPanel(setup(), WORK, refFor('2026-11-09'), { week: '2026-11-09' })!.overloaded, { count: 0, names: [] });
});

test('filtro de empreiteiro recorta status, atrasadas, linha de base e marcos; crítico e carga ficam do plano inteiro', () => {
  const d = buildMediumTermPanel(setup(), WORK, ref, { week: ref.week, companies: new Set(['sm martins']) })!;
  assert.equal(d.companyFiltered, true);
  // Só A e B são da SM MARTINS; a tarefa sem equipe e o marco sem equipe saem.
  assert.equal(d.plan.taskCount, 2);
  assert.deepEqual([d.done, d.inProgress, d.notStarted], [1, 1, 0]);
  assert.equal(d.late.count, 1);
  assert.deepEqual(
    d.late.samples.map(s => s.name),
    ['Concretagem 5º'],
  );
  assert.deepEqual([d.baseline!.late, d.baseline!.early, d.baseline!.onTime, d.baseline!.added, d.baseline!.removed], [1, 0, 1, 0, 0]);
  assert.deepEqual(d.milestones, []);
  assert.deepEqual(d.critical, { count: 3, planFinish: '2026-11-20' });
  assert.equal(d.overloaded.count, 1);
  // Empresa sem tarefa no plano: quadro vazio, mas presente.
  const none = buildMediumTermPanel(setup(), WORK, ref, { week: ref.week, companies: new Set(['Outra']) })!;
  assert.equal(none.plan.taskCount, 0);
  assert.equal(none.late.count, 0);
  assert.deepEqual([none.baseline!.late, none.baseline!.early, none.baseline!.onTime], [0, 0, 0]);
});

test('resumo: cartão de tarefas atrasadas e a frase do topo', () => {
  const d = buildMediumTermPanel(setup(), WORK, ref, noFilter)!;
  const summary = mediumTermSummary(d, ref);
  assert.deepEqual(summary.kpi, {
    module: 'medio-prazo',
    label: 'Tarefas atrasadas',
    value: '3',
    tag: { text: 'de 7', tone: 'bad' },
    hint: 'Plano de novembro de 2026 · 3 atrasadas contra a linha de base',
    tone: 'bad',
  });
  assert.equal(summary.sentence.map(s => s.text).join(''), 'No plano de novembro, 3 tarefas terminariam até a data e não terminaram.');
  assert.deepEqual(summary.sentence[1], { text: '3 tarefas', strong: true });
  assert.equal(
    mediumTermCallout(d),
    'Das 1 em andamento, 1 terminaria até 07/11; 2 não iniciadas também passaram do término. Caminho crítico com 3 tarefas; término do plano em 20/11.',
  );

  // Semana de 26/10 no plano de outubro: nada atrasado e sem linha de base.
  const calm = refFor('2026-10-26');
  const ok = mediumTermSummary(buildMediumTermPanel(setup(), WORK, calm, { week: calm.week })!, calm);
  assert.deepEqual(ok.kpi.tag, { text: 'em dia', tone: 'good' });
  assert.equal(ok.kpi.value, '0');
  assert.equal(ok.kpi.hint, 'Plano de outubro de 2026 · sem linha de base');
  assert.equal(ok.sentence.map(s => s.text).join(''), 'No plano de outubro, nenhuma tarefa está atrasada na data.');
});

// ─── Escalas de tempo (04/11/2026, regra 9) ──────────────────────────────────────────────────────────
// 04/11/2026 é uma quarta-feira: a semana atual começa em 02/11.
const periodCtx: PeriodContext = { currentWeek: '2026-11-02', since: '2026-01-05', anchorWeek: '2026-11-02' };
const periodRef = (selection: PeriodSelection) =>
  referenceOf('2026-11-02', '2026-11-04', '2026-01-05', resolvePeriod(selection, periodCtx));

test('período mensal: o plano é o do mês do sábado final e o retrato diz o dia e o plano', () => {
  const october = periodRef({ scale: 'mes', key: '2026-10' });
  assert.equal(october.weekEnd, '2026-10-31');
  const d = buildMediumTermPanel(setup(), WORK, october, { week: october.week })!;
  assert.equal(d.plan.id, 'plan-out');
  assert.equal(d.reference, '2026-10-31');
  assert.equal(d.scale, 'mes');
  assert.equal(mediumTermSnapshot(d), 'em 31/10 · plano de outubro');
  const summary = mediumTermSummary(d, october);
  assert.equal(summary.kpi.hint, 'Em 31/10 · plano de outubro · sem linha de base');
  assert.equal(summary.sentence.map(s => s.text).join(''), 'No plano de outubro, nenhuma tarefa está atrasada em 31/10.');
  // A superalocação continua sendo a da última semana do período (26/10 a 31/10): A, O1 e O2 na Revestimentos.
  assert.deepEqual(d.overloaded, buildMediumTermPanel(setup(), WORK, refFor('2026-10-26'), { week: '2026-10-26' })!.overloaded);
  assert.equal(d.overloaded.count, 1);

  // Novembro está em andamento: o sábado final é o da semana atual (07/11), e o plano é o de novembro.
  const november = periodRef({ scale: 'mes', key: '2026-11' });
  const n = buildMediumTermPanel(setup(), WORK, november, { week: november.week })!;
  assert.equal(n.plan.id, 'plan-nov');
  const nSummary = mediumTermSummary(n, november);
  assert.equal(nSummary.kpi.hint, 'Em 07/11 · plano de novembro · 3 atrasadas contra a linha de base');
  assert.equal(nSummary.sentence.map(s => s.text).join(''), 'No plano de novembro, 3 tarefas terminariam até 07/11 e não terminaram.');
  // Os números são o retrato no sábado final: os mesmos da semana de 02/11, só a escala muda.
  const { scale: _month, ...monthly } = n;
  const { scale: _week, ...weekly } = buildMediumTermPanel(setup(), WORK, ref, noFilter)!;
  assert.deepEqual(monthly, weekly);
});

test('período trimestral: o plano é o do mês do sábado final, mesmo quando ele cai no mês seguinte ao trimestre', () => {
  // 4º trimestre em andamento: termina no sábado 07/11, plano de novembro.
  const q4 = periodRef({ scale: 'trimestre', key: '2026-T4' });
  assert.equal(q4.weekEnd, '2026-11-07');
  const d4 = buildMediumTermPanel(setup(), WORK, q4, { week: q4.week })!;
  assert.equal(d4.plan.id, 'plan-nov');
  assert.equal(mediumTermSnapshot(d4), 'em 07/11 · plano de novembro');
  // 3º trimestre: a última semana começa na segunda 28/09 e termina no sábado 03/10, que é de outubro.
  const q3 = periodRef({ scale: 'trimestre', key: '2026-T3' });
  assert.equal(q3.week, '2026-09-28');
  assert.equal(q3.weekEnd, '2026-10-03');
  const d3 = buildMediumTermPanel(setup(), WORK, q3, { week: q3.week })!;
  assert.equal(d3.plan.id, 'plan-out');
  assert.equal(mediumTermSnapshot(d3), 'em 03/10 · plano de outubro');
  assert.equal(mediumTermSummary(d3, q3).kpi.hint, 'Em 03/10 · plano de outubro · sem linha de base');
});

test('na escala semanal o médio prazo não muda: sem rótulo de retrato, dica e frase de antes', () => {
  const d = buildMediumTermPanel(setup(), WORK, ref, noFilter)!;
  assert.equal(d.scale, 'semana');
  assert.equal(mediumTermSnapshot(d), undefined);
  assert.equal(mediumTermSummary(d, ref).kpi.hint, 'Plano de novembro de 2026 · 3 atrasadas contra a linha de base');
});

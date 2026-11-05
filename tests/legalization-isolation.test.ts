import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentTool, type ToolContext } from '../src/application/use-cases/agent-tools';
import { buildBriefing } from '../src/domain/agent-briefing';
import type { MediumTermPlan, PlanningData, PlanTask } from '../src/domain/entities';
import { LEGALIZATION_KIND, legalizationMonth } from '../src/domain/legalization';
import { teamUsage } from '../src/domain/resources';
import { teamLoad } from '../src/domain/rules';
import { weeklyTeamLoad } from '../src/domain/schedule-analysis';
import { addDays } from '../src/domain/validation';
import { buildMediumTermPanel, pickPlan } from '../src/modules/dashboard/medium-term-panel';
import { referenceOf } from '../src/modules/dashboard/model';
import { S43, TODAY, WEEK_ONE, WORK, fixture, longTermPlan, stamp } from './fixtures/agent-planning';

/** Gantt de legalização (04/11/2026, regra 17): o cronograma da aba 1 é gravado como um plano do médio
 * prazo (`kind: 'legalizacao'`) e pode ter o mesmo `month` do plano mensal da obra, mas fica fora de tudo
 * que lê "o plano do mês". A obra de exemplo do agente (plano de outubro, semana 43) ganha um Gantt de
 * outubro posto na frente da lista — sem o filtro, ele seria o escolhido — com tarefas da mesma equipe,
 * uma tarefa sem equipe e uma linha de base congelada; cada consumidor tem de dar o mesmo resultado que
 * daria sem ele. */

const LEG = 'lg-plan';
const LEG_BASE = 'lg-base';
const DELIVERY = '2027-09-30';
const leg = (id: string, name: string, start: string, end: string, over: Partial<PlanTask> = {}): PlanTask => ({
  id,
  ...stamp,
  planId: LEG,
  name,
  plannedStart: start,
  plannedEnd: end,
  progress: 0,
  order: 100,
  level: 0,
  ...over,
});
const LEG_NAMES = ['Vistoria do Corpo de Bombeiros', 'Energia: ligação definitiva', 'Água e esgoto: ligação', 'Protocolo do Habite-se'];

function withLegalization(month = legalizationMonth(DELIVERY)): PlanningData {
  const data = fixture();
  const plans: MediumTermPlan[] = [
    {
      id: LEG,
      ...stamp,
      workId: WORK,
      month,
      name: 'Gantt de legalização',
      createdBy: 'u1',
      kind: LEGALIZATION_KIND,
      deliveryDate: DELIVERY,
    },
    {
      id: LEG_BASE,
      ...stamp,
      workId: WORK,
      month,
      name: 'Base da legalização',
      createdBy: 'u1',
      kind: LEGALIZATION_KIND,
      deliveryDate: DELIVERY,
      baselineOf: LEG,
      frozenAt: '2026-10-25T12:00:00Z',
    },
  ];
  data.plans.unshift(...plans);
  data.planTasks.push(
    // Três tarefas da equipe tB (capacidade 2) e uma de tA na semana 43: estourariam as duas equipes.
    leg('lg000001-avcb', LEG_NAMES[0], '2026-10-26', '2026-10-30', { teamId: 'tB', order: 1 }),
    leg('lg000002-energia', LEG_NAMES[1], '2026-10-26', '2026-10-30', { teamId: 'tB', order: 2 }),
    leg('lg000003-agua', LEG_NAMES[2], '2026-10-19', '2026-11-03', { teamId: 'tB', order: 3, progress: 10 }),
    leg('lg000004-habite', LEG_NAMES[3], '2026-10-27', '2026-10-29', { teamId: 'tA', order: 4 }),
    leg('lg000005-solta', 'Laudos e ARTs', '2026-10-27', '2026-10-28', { order: 5 }),
    leg('lg000006-base', LEG_NAMES[0], '2026-10-26', '2026-10-30', { planId: LEG_BASE, teamId: 'tB', sourceTaskId: 'lg000001-avcb' }),
  );
  return data;
}
const LEG_IDS = new Set(['lg000001-avcb', 'lg000002-energia', 'lg000003-agua', 'lg000004-habite', 'lg000005-solta', 'lg000006-base']);

test('o cenário põe o Gantt de legalização na frente, no mesmo mês do plano mensal', () => {
  const data = withLegalization();
  assert.equal(data.plans[0].id, LEG);
  assert.equal(data.plans[0].month, '2026-10');
  assert.equal(data.plans.find(p => p.id === 'plan-out')?.month, '2026-10');
});

test('carga de equipe (teamLoad): tarefas do Gantt de legalização não contam', () => {
  const base = fixture();
  const data = withLegalization();
  const end = addDays(S43, 6);
  for (const team of ['tA', 'tB']) assert.deepEqual(teamLoad(team, S43, end, data), teamLoad(team, S43, end, base), team);
  assert.equal(teamLoad('tB', S43, end, data).tasks, 0);
  assert.equal(teamLoad('tB', S43, end, data).overloaded, false);
});

test('uso da equipe (teamUsage): fora do médio e das linhas de base do mês, mas ainda vincula a equipe', () => {
  const base = fixture();
  const data = withLegalization();
  const before = teamUsage(base, 'tB');
  const after = teamUsage(data, 'tB');
  assert.equal(after.medium, before.medium);
  assert.equal(after.baselines, before.baselines);
  // Quatro linhas de tB (três vivas e a da linha de base): a exclusão da equipe continua bloqueada.
  assert.equal(after.total, before.total + 4);
  // E a configuração da obra mostra essas quatro à parte, "no Gantt de legalização".
  assert.equal(after.legalization, 4);
  assert.equal(before.legalization, 0);
  assert.equal(teamUsage(data, 'tA').medium, teamUsage(base, 'tA').medium);
});

test('carga semanal (weeklyTeamLoad, Recursos e superalocação): o Gantt de legalização não entra', () => {
  const base = weeklyTeamLoad(fixture(), WORK, S43, addDays(S43, 13));
  const result = weeklyTeamLoad(withLegalization(), WORK, S43, addDays(S43, 13));
  assert.deepEqual(result, base);
  const items = [...result.teams.flatMap(t => t.weeks), ...result.unassigned].flatMap(w => w.items);
  assert.ok(items.every(i => !LEG_IDS.has(i.id)));
  assert.equal(result.teams.find(t => t.team.id === 'tB')?.peak, 0);
});

test('quadro do médio prazo do dashboard: escolhe o plano mensal, com a linha de base dele e a carga sem o Gantt', () => {
  const data = withLegalization();
  assert.equal(pickPlan(data.plans, WORK, '2026-10-31')?.id, 'plan-out');
  const ref = referenceOf(S43, TODAY, WEEK_ONE);
  const panel = buildMediumTermPanel(data, WORK, ref, { week: ref.week })!;
  assert.deepEqual(panel, buildMediumTermPanel(fixture(), WORK, ref, { week: ref.week }));
  assert.equal(panel.plan.id, 'plan-out');
  assert.equal(panel.baseline?.name, 'Base');
  assert.deepEqual(panel.overloaded.names, ['Alfa · Alvenaria']);
  // O caso comum: a janela começa no mês seguinte ao último plano mensal. Também não é escolhido.
  const later = withLegalization('2026-11');
  assert.equal(pickPlan(later.plans, WORK, '2026-11-07')?.id, 'plan-out');
  assert.equal(pickPlan(later.plans, WORK, '2026-09-05')?.id, 'plan-out');
  // Só com o Gantt de legalização, o quadro fica sem plano.
  const alone = withLegalization();
  alone.plans = alone.plans.filter(p => p.kind === LEGALIZATION_KIND);
  assert.equal(buildMediumTermPanel(alone, WORK, ref, { week: ref.week }), undefined);
});

test('briefing da Claudia: o dossiê sai igual, sem o Gantt de legalização no médio prazo', () => {
  const input = (data: PlanningData) =>
    buildBriefing({ data, workId: WORK, today: TODAY, levels: ['longo', 'medio', 'curto'], longTermPlan, weekOne: WEEK_ONE });
  const base = input(fixture());
  const briefing = input(withLegalization());
  assert.equal(briefing.medio?.plan?.name, 'Outubro');
  assert.equal(briefing.medio?.baseline?.name, 'Base');
  assert.deepEqual(briefing.medio, base.medio);
  assert.equal(briefing.text, base.text);
  assert.equal(briefing.hash, base.hash);
  for (const name of LEG_NAMES) assert.ok(!briefing.text.includes(name), name);
  // Só com o Gantt de legalização, o médio prazo fica sem plano vivo.
  const alone = withLegalization();
  alone.plans = alone.plans.filter(p => p.kind === LEGALIZATION_KIND);
  assert.equal(input(alone).medio?.plan, undefined);
});

test('ferramentas da Claudia: listar_tarefas_mes e propor_criar_linhas ignoram o Gantt de legalização', () => {
  let seq = 0;
  const ctx = (data: PlanningData): ToolContext => ({
    data,
    workId: WORK,
    today: TODAY,
    actor: { id: 'u-planner', role: 'planner' },
    levels: ['longo', 'medio', 'curto'],
    weekOne: WEEK_ONE,
    longTermPlan,
    newId: () => `prop-${++seq}`,
  });
  for (const filtro of ['todas', 'semana_atual', 'atrasadas', 'em_andamento', 'proximas']) {
    const out = runAgentTool('listar_tarefas_mes', { filtro }, ctx(withLegalization()));
    assert.equal(out.result, runAgentTool('listar_tarefas_mes', { filtro }, ctx(fixture())).result, filtro);
    assert.ok(!out.result.includes('t:lg'), filtro);
  }
  assert.equal(
    runAgentTool('listar_tarefas_mes', { filtro: 'todas' }, ctx(withLegalization())).result.split('\n')[0],
    'Plano "Outubro" (2026-10), filtro todas: 5 tarefas.',
  );
  // O apelido de uma tarefa do Gantt não resolve: não vira linha da planilha.
  const proposal = runAgentTool('propor_criar_linhas', { semana: 'atual', itens: [{ tarefa: 't:lg000001' }] }, ctx(withLegalization()));
  assert.equal(proposal.error, true);
  assert.ok(proposal.result.includes('t:lg000001: tarefa do plano do mês não encontrada'));
  const alone = withLegalization();
  alone.plans = alone.plans.filter(p => p.kind === LEGALIZATION_KIND);
  assert.equal(runAgentTool('listar_tarefas_mes', { filtro: 'todas' }, ctx(alone)).result, 'A obra não tem plano do mês vivo.');
});

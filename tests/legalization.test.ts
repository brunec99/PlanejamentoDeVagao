import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGALIZATION_DEFAULT_NAME,
  LEGALIZATION_KIND,
  LEGALIZATION_TEMPLATE,
  applyLobImport,
  buildLegalizationTasks,
  isLegalizationPlan,
  isMonthlyPlan,
  legalizationMonth,
  legalizationPlanIds,
  legalizationSummary,
  legalizationWindow,
  lobServiceRows,
  type LobServiceRow,
} from '../src/domain/legalization';
import {
  DEFAULT_CALENDAR as calendar,
  analyzeSchedule,
  isWorking,
  planSnapshot,
  previousWorking,
  scheduleTasks,
  signedWorkingDays,
  withProgress,
  type WorkCalendar,
} from '../src/domain/plan-schedule';
import type { LobActivity, LobData, LobMeasurement, LobMeasurementItem, LobService } from '../src/domain/lob';
import type { MediumTermPlan, PlanDependency, PlanTask, PlanningData } from '../src/domain/entities';
import { createMockData } from '../src/mocks/planning';
import { applyCommand, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { planningDataToPayload, rowsToPlanningData, type Rows } from '../src/infrastructure/repositories/supabase/mappers';
import { isCommandAllowed } from '../src/application/module-access';
import { slimForModules } from '../src/application/use-cases/scope-planning';

const NOW = '2026-11-04T12:00:00Z';
const TODAY = '2026-11-04';
/** Entrega do exemplo aprovado (quinta-feira): janela de 01/10/2026 a 30/09/2027. */
const DELIVERY = '2027-09-30';
const stamp = { createdAt: NOW, updatedAt: NOW };

let seq = 0;
const newId = () => `lob-${++seq}`;
const build = (deliveryDate: string, template: 'atr' | 'blank' = 'atr', cal?: WorkCalendar) =>
  buildLegalizationTasks({ planId: 'g', deliveryDate, template, calendar: cal, newId, now: NOW });
const byOrder = (rows: PlanTask[]) => rows.slice().sort((a, b) => a.order - b.order);
const named = (rows: PlanTask[], name: string) => {
  const found = rows.find(t => t.name === name);
  assert.ok(found, `linha "${name}" não encontrada`);
  return found;
};
const deliveryOf = (rows: PlanTask[]) => named(rows, 'Entrega das chaves');
/** Linhas com filhos (a seguinte tem nível maior), como o motor e o `save_plan_revision` decidem. */
const summaryIds = (rows: PlanTask[]) => {
  const list = byOrder(rows);
  return new Set(list.filter((t, i) => list[i + 1]?.level > t.level).map(t => t.id));
};
/** O motor devolve as mesmas datas: é o que o `save_plan_revision` confere antes de gravar. */
function assertStable(tasks: PlanTask[], links: PlanDependency[], cal: WorkCalendar = calendar, label = '') {
  const again = new Map(scheduleTasks(tasks, links, cal).map(t => [t.id, t]));
  for (const t of tasks)
    assert.deepEqual(
      [again.get(t.id)!.plannedStart, again.get(t.id)!.plannedEnd],
      [t.plannedStart, t.plannedEnd],
      `${label} ${t.name}: o motor mudou as datas`,
    );
}

// ─── Janela e tipo ───────────────────────────────────────────────────────────────

test('janela de 12 meses termina na entrega: 30/09/2027 → 01/10/2026 a 30/09/2027, inclusive em ano bissexto', () => {
  assert.deepEqual(legalizationWindow(DELIVERY), { start: '2026-10-01', end: '2027-09-30' });
  assert.deepEqual(legalizationWindow('2028-02-29'), { start: '2027-03-01', end: '2028-02-29' });
  // Dia 31: o mês de um ano antes também tem 31, e a janela começa no dia 1º seguinte.
  assert.deepEqual(legalizationWindow('2027-01-31'), { start: '2026-02-01', end: '2027-01-31' });
  assert.deepEqual(legalizationWindow('2027-03-31'), { start: '2026-04-01', end: '2027-03-31' });
  for (const bad of ['2027-02-30', '2027-02-29', '30/09/2027', '2027-9-30', ''])
    assert.throws(() => legalizationWindow(bad), /Data inválida/, bad);
  // O `month` gravado é o mês em que a janela começa.
  assert.equal(legalizationMonth(DELIVERY), '2026-10');
  assert.equal(legalizationMonth('2028-02-29'), '2027-03');
  assert.equal(legalizationMonth('2027-01-31'), '2026-02');
  assert.throws(() => legalizationMonth('2027-13-01'), /Data inválida/);
});

test('tipo do plano: sem kind é plano do mês; o Gantt e as linhas de base dele são de legalização', () => {
  const plan = (id: string, extra: Partial<MediumTermPlan> = {}): MediumTermPlan => ({
    id,
    ...stamp,
    workId: 'obra-1',
    month: '2026-10',
    name: id,
    createdBy: 'user-1',
    ...extra,
  });
  const plans = [
    plan('mes'),
    plan('gantt', { kind: LEGALIZATION_KIND, deliveryDate: DELIVERY }),
    plan('base', { kind: LEGALIZATION_KIND, deliveryDate: DELIVERY, baselineOf: 'gantt', frozenAt: NOW }),
    plan('base-mes', { baselineOf: 'mes', frozenAt: NOW }),
  ];
  assert.equal(LEGALIZATION_KIND, 'legalizacao');
  assert.deepEqual(
    plans.map(p => [isLegalizationPlan(p), isMonthlyPlan(p)]),
    [
      [false, true],
      [true, false],
      [true, false],
      [false, true],
    ],
  );
  assert.equal(isLegalizationPlan(undefined), false);
  assert.deepEqual([...legalizationPlanIds(plans)].sort(), ['base', 'gantt']);
  assert.equal(legalizationPlanIds([]).size, 0);
});

// ─── Modelo ATR ──────────────────────────────────────────────────────────────────

test('modelo ATR: 38 linhas de chave única, vínculos para linhas existentes e esperas de órgão em dias corridos', () => {
  assert.equal(LEGALIZATION_TEMPLATE.length, 38);
  const keys = LEGALIZATION_TEMPLATE.map(r => r.key);
  assert.equal(new Set(keys).size, 38);
  for (const row of LEGALIZATION_TEMPLATE) for (const l of row.links ?? []) assert.ok(keys.includes(l.from), `${row.key} ← ${l.from}`);
  assert.deepEqual(
    LEGALIZATION_TEMPLATE.filter(r => r.delivery).map(r => r.name),
    ['Entrega das chaves'],
  );
  for (const name of ['Vistoria do Corpo de Bombeiros', 'Vistoria da prefeitura', 'Averbação da construção na matrícula'])
    assert.equal(LEGALIZATION_TEMPLATE.find(r => r.name === name)!.duration!.unit, 'dd', name);
});

test('modelo ATR montado de trás para frente: 38 tarefas, 38 vínculos e o marco da entrega na data contratual', () => {
  const { tasks, links } = build(DELIVERY);
  assert.equal(tasks.length, 38);
  assert.equal(links.length, 38);
  const rows = byOrder(tasks);
  assert.deepEqual(
    rows.map(t => t.order),
    Array.from({ length: 38 }, (_, i) => i + 1),
  );
  assert.equal(new Set(tasks.map(t => t.id)).size, 38);
  assert.ok(tasks.every(t => t.planId === 'g' && t.progress === 0 && t.createdAt === NOW));
  // Níveis: o primeiro é 0 e nenhuma linha recua mais de um nível em relação à anterior.
  assert.equal(rows[0].level, 0);
  rows.forEach((t, i) => assert.ok(i === 0 || t.level <= rows[i - 1].level + 1, `${t.name}: nível ${t.level}`));
  // Vínculos entre tarefas do plano, sempre entre folhas, com defasagem em dias úteis.
  const ids = new Set(tasks.map(t => t.id));
  const summary = summaryIds(tasks);
  for (const l of links) {
    assert.ok(ids.has(l.predecessorId) && ids.has(l.successorId));
    assert.ok(!summary.has(l.predecessorId) && !summary.has(l.successorId), 'vínculo em tarefa-resumo');
    assert.equal(l.lagBusiness, true);
  }
  // Resumos (o bloco da obra, a legalização e cada órgão): sem duração, restrição nem prazo final.
  assert.deepEqual(
    rows.filter(t => summary.has(t.id)).map(t => t.name),
    [
      'Caminho crítico da obra',
      'Legalização',
      'Corpo de Bombeiros: AVCB',
      'Concessionárias',
      'Prefeitura: Habite-se',
      'Receita Federal: CND da obra',
      'Cartório e condomínio',
    ],
  );
  for (const t of rows.filter(r => summary.has(r.id)))
    assert.deepEqual([t.duration, t.constraintType, t.deadline], [undefined, undefined, undefined], t.name);
  for (const t of rows.filter(r => !summary.has(r.id))) assert.ok(t.duration, `${t.name} sem duração`);
  // Sem predecessora: "Não iniciar antes de" no próprio início, num dia útil. As demais, sem restrição.
  const withPredecessor = new Set(links.map(l => l.successorId));
  const roots = rows.filter(t => !summary.has(t.id) && !withPredecessor.has(t.id));
  assert.deepEqual(
    roots.map(t => t.name),
    [
      'Alvenaria e contrapiso dos últimos pavimentos',
      'Fachada: reboco, revestimento e pintura',
      'Elevadores: montagem, ajustes e comissionamento',
      'Projeto de incêndio: revisão final aprovada',
      'Energia: aprovação do projeto de entrada',
      'Manuais do proprietário e das áreas comuns (NBR 14037)',
    ],
  );
  for (const t of roots) {
    assert.equal(t.constraintType, 'SNET', t.name);
    assert.equal(t.constraintDate, t.plannedStart, t.name);
    assert.ok(isWorking(t.constraintDate!, calendar), t.name);
  }
  for (const t of rows.filter(r => withPredecessor.has(r.id))) assert.equal(t.constraintType, undefined, t.name);
  // O marco da entrega carrega o prazo final e cai na data contratual (quinta-feira).
  const delivery = deliveryOf(tasks);
  assert.deepEqual(
    [delivery.deadline, delivery.plannedStart, delivery.plannedEnd, delivery.level, delivery.order, delivery.duration],
    [DELIVERY, DELIVERY, DELIVERY, 0, 38, { value: 0, unit: 'd' }],
  );
  assert.deepEqual(
    tasks.filter(t => t.deadline).map(t => t.id),
    [delivery.id],
  );
  // Regra 6: tarefa pode começar antes da janela (o projeto de incêndio, no exemplo).
  assert.ok(rows.some(t => t.plannedStart < legalizationWindow(DELIVERY).start));
  // Idempotência: o que nasce passa no `save_plan_revision` sem ajuste.
  assertStable(tasks, links);
});

test('entrega em sábado, domingo ou feriado: o marco fica antes do prazo, no máximo poucos dias úteis', () => {
  const cases: [string, WorkCalendar][] = [
    ['2027-10-02', calendar], // sábado
    ['2027-10-03', calendar], // domingo
    ['2027-09-07', { ...calendar, holidays: ['2027-09-07'] }], // terça, feriado
    ['2027-11-15', { ...calendar, holidays: ['2027-11-15'] }], // segunda, feriado: o dia útil anterior é sexta
    [DELIVERY, { ...calendar, holidays: ['2027-09-29', '2027-09-30'] }], // dois feriados seguidos
  ];
  for (const [date, cal] of cases) {
    const { tasks, links } = build(date, 'atr', cal);
    const delivery = deliveryOf(tasks);
    assert.equal(delivery.deadline, date);
    assert.ok(delivery.plannedEnd <= previousWorking(date, cal), `${date}: marco em ${delivery.plannedEnd}`);
    assert.ok(signedWorkingDays(delivery.plannedEnd, date, cal) <= 3, `${date}: marco em ${delivery.plannedEnd}`);
    assertStable(tasks, links, cal, date);
  }
});

test('entregas em meses e anos diferentes: nenhuma lança e o marco fica no prazo ou poucos dias úteis antes', () => {
  for (const date of ['2026-12-31', '2027-01-01', '2027-06-15', '2027-12-24', '2028-02-29', '2028-07-31', '2030-06-14']) {
    const { tasks, links } = build(date);
    assert.equal(tasks.length, 38, date);
    const end = deliveryOf(tasks).plannedEnd;
    assert.ok(end <= date, `${date}: marco em ${end}`);
    assert.ok(signedWorkingDays(end, date, calendar) <= 3, `${date}: marco em ${end}`);
    assertStable(tasks, links, calendar, date);
  }
});

test('modelo em branco: só o marco da entrega com o prazo final, sem vínculos', () => {
  const { tasks, links } = build(DELIVERY, 'blank');
  assert.equal(links.length, 0);
  assert.deepEqual(
    tasks.map(t => [t.name, t.level, t.order, t.plannedStart, t.plannedEnd, t.deadline, t.duration, t.constraintType]),
    [['Entrega das chaves', 0, 1, DELIVERY, DELIVERY, DELIVERY, { value: 0, unit: 'd' }, undefined]],
  );
  // Sábado: o marco fica na sexta, o prazo final continua no sábado.
  const saturday = build('2027-10-02', 'blank');
  assert.deepEqual([saturday.tasks[0].plannedEnd, saturday.tasks[0].deadline], ['2027-10-01', '2027-10-02']);
  assertStable(saturday.tasks, saturday.links);
  assert.throws(() => build('2027-02-30', 'blank'), /Data inválida/);
});

// ─── Resumo do topo ──────────────────────────────────────────────────────────────

const LEGAL_MILESTONES = [
  'Protocolo da vistoria',
  'AVCB emitido',
  'Protocolo do Habite-se',
  'Habite-se emitido',
  'CND da obra emitida',
  'Assembleia de instalação do condomínio',
];
/** O modelo com a vistoria da prefeitura em 90 dias corridos em vez de 60: a entrega passa do prazo. */
function delayed() {
  const { tasks, links } = build(DELIVERY);
  const late = scheduleTasks(
    tasks.map(t => (t.name === 'Vistoria da prefeitura' ? { ...t, duration: { value: 90, unit: 'dd' as const } } : t)),
    links,
    calendar,
  );
  return { tasks: late, links, analysis: analyzeSchedule(late, links, calendar) };
}

test('resumo no prazo: entrega prevista na contratual, atraso zero, folga zero e a obra sem folga sobrando', () => {
  const { tasks, links } = build(DELIVERY);
  const analysis = analyzeSchedule(tasks, links, calendar);
  const summary = legalizationSummary(tasks, analysis, DELIVERY, TODAY);
  const delivery = deliveryOf(tasks);
  assert.equal(summary.deliveryDate, DELIVERY);
  assert.equal(summary.deliveryTaskId, delivery.id);
  assert.equal(summary.forecast, DELIVERY);
  assert.equal(summary.lateDays, 0);
  assert.equal(summary.deliverySlack, 0);
  // Críticas: as folhas com folga total ≤ 0 (os resumos não contam).
  const groups = summaryIds(tasks);
  assert.equal(summary.criticalCount, tasks.filter(t => !groups.has(t.id) && analysis.info.get(t.id)!.critical).length);
  assert.ok(summary.criticalCount > 0);
  assert.deepEqual(summary.milestones, { done: 0, total: 6 });
  const protocol = named(tasks, 'Protocolo da vistoria');
  assert.deepEqual(summary.next, { id: protocol.id, name: protocol.name, date: protocol.plannedStart });
  // A cadeia é montada mesmo no prazo e termina na entrega; a tela só mostra o aviso quando atrasa.
  assert.equal(summary.chain.at(-1)!.id, delivery.id);
  assert.equal(summary.workSlack, 0);
});

test('atraso forçado na vistoria da prefeitura: dias de atraso, folga negativa e a cadeia só com críticas até as chaves', () => {
  const { tasks, analysis } = delayed();
  const summary = legalizationSummary(tasks, analysis, DELIVERY, TODAY);
  assert.ok(summary.forecast! > DELIVERY, `prevista ${summary.forecast}`);
  assert.ok(summary.lateDays > 0);
  assert.equal(summary.lateDays, signedWorkingDays(DELIVERY, summary.forecast!, calendar));
  assert.equal(summary.deliverySlack, -summary.lateDays);
  assert.ok(summary.workSlack !== undefined && summary.workSlack < 0, `folga da obra ${summary.workSlack}`);
  // A cadeia vai da mais antiga às chaves, passa pela vistoria, só tem críticas e nenhum marco no meio.
  const chain = summary.chain;
  assert.ok(chain.length >= 3);
  assert.equal(chain.at(-1)!.name, 'Entrega das chaves');
  assert.ok(chain.some(c => c.name === 'Vistoria da prefeitura'));
  for (const c of chain) assert.equal(analysis.info.get(c.id)!.critical, true, c.name);
  const milestones = new Set(tasks.filter(t => t.duration?.value === 0).map(t => t.id));
  for (const c of chain.slice(0, -1)) assert.ok(!milestones.has(c.id), `marco intermediário na cadeia: ${c.name}`);
  const starts = chain.map(c => tasks.find(t => t.id === c.id)!.plannedStart);
  assert.deepEqual(starts, starts.slice().sort());
  assert.equal(new Set(chain.map(c => c.id)).size, chain.length);
});

test('marcos de legalização: são 6, concluído é progresso 100, e o próximo é o primeiro não concluído a partir de hoje', () => {
  const { tasks, links } = build(DELIVERY);
  // Progresso 100 em dois marcos; 99 não conta; a entrega fica fora do grupo Legalização.
  const progress: Record<string, number> = {
    'Protocolo da vistoria': 100,
    'AVCB emitido': 100,
    'Protocolo do Habite-se': 99,
    'Entrega das chaves': 100,
  };
  const marked = tasks.map(t => (progress[t.name] ? withProgress(t, progress[t.name], calendar) : t));
  const analysis = analyzeSchedule(marked, links, calendar);
  const summary = legalizationSummary(marked, analysis, DELIVERY, TODAY);
  assert.deepEqual(summary.milestones, { done: 2, total: 6 });
  assert.equal(summary.next?.name, 'Protocolo do Habite-se');
  // Os seis marcos são as linhas de duração zero dentro do grupo Legalização.
  const all = LEGAL_MILESTONES.map(name => named(tasks, name));
  const done = tasks.map(t => (LEGAL_MILESTONES.includes(t.name) ? withProgress(t, 100, calendar) : t));
  assert.deepEqual(legalizationSummary(done, analyzeSchedule(done, links, calendar), DELIVERY, TODAY).milestones, {
    done: 6,
    total: 6,
  });
  assert.equal(legalizationSummary(done, analyzeSchedule(done, links, calendar), DELIVERY, TODAY).next, undefined);
  // "A partir de hoje" inclui o próprio dia; marco atrasado e não concluído fica para trás.
  const base = analyzeSchedule(tasks, links, calendar);
  const protocol = all[0];
  assert.equal(legalizationSummary(tasks, base, DELIVERY, protocol.plannedStart).next?.id, protocol.id);
  const habiteProtocol = named(tasks, 'Protocolo do Habite-se');
  const after = new Date(Date.parse(`${habiteProtocol.plannedStart}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  // A CND sai 30 dias corridos depois do protocolo; o Habite-se, 60.
  assert.equal(legalizationSummary(tasks, base, DELIVERY, after).next?.name, 'CND da obra emitida');
  assert.equal(legalizationSummary(tasks, base, DELIVERY, '2028-01-01').next, undefined);
});

test('resumo: outra tarefa com o mesmo prazo final da entrega não toma o lugar do marco "Entrega das chaves"', () => {
  const { tasks, links } = build(DELIVERY);
  // A pessoa põe na vistoria com os clientes o mesmo prazo final da entrega ("tem de estar pronta até lá").
  const draft = tasks.map(t => (t.name === 'Vistoria com os clientes' ? { ...t, deadline: DELIVERY } : t));
  const summary = legalizationSummary(draft, analyzeSchedule(draft, links, calendar), DELIVERY, TODAY);
  assert.equal(summary.deliveryTaskId, deliveryOf(draft).id);
  assert.equal(summary.forecast, DELIVERY);
  assert.equal(summary.lateDays, 0);
});

test('resumo: com feriado no calendário do plano, o atraso em dias úteis segue o calendário e bate com a folga do marco', () => {
  const holiday: WorkCalendar = { ...calendar, holidays: ['2027-10-12'] };
  const { tasks, links } = build(DELIVERY);
  const late = scheduleTasks(
    tasks.map(t => (t.name === 'Vistoria da prefeitura' ? { ...t, duration: { value: 90, unit: 'dd' as const } } : t)),
    links,
    holiday,
  );
  const analysis = analyzeSchedule(late, links, holiday);
  const summary = legalizationSummary(late, analysis, DELIVERY, TODAY, holiday);
  assert.ok(summary.lateDays > 0);
  assert.equal(summary.lateDays, signedWorkingDays(DELIVERY, summary.forecast!, holiday));
  assert.equal(summary.lateDays, -summary.deliverySlack!);
  // Sem o calendário, o feriado conta como dia útil: um dia a mais que a folga.
  assert.equal(legalizationSummary(late, analysis, DELIVERY, TODAY).lateDays, summary.lateDays + 1);
});

// ─── Linha de Balanço ────────────────────────────────────────────────────────────

const W = 'obra-1';
const block = (id: string, serviceId: string, localId: string, start: string, durationDays: number): LobActivity => ({
  id,
  workId: W,
  serviceId,
  localId,
  start,
  durationDays,
  ...stamp,
});
const service = (id: string, name: string, orderIndex: number): LobService => ({
  id,
  workId: W,
  name,
  color: '#2a78d6',
  orderIndex,
  ...stamp,
});
const measurement = (id: string, number: number, date: string, status: 'open' | 'closed' = 'closed'): LobMeasurement => ({
  id,
  workId: W,
  number,
  date,
  status,
  createdBy: 'user-1',
  ...stamp,
});
const item = (measurementId: string, activityId: string, value: number): LobMeasurementItem => ({
  id: `${measurementId}-${activityId}`,
  measurementId,
  workId: W,
  activityId,
  value,
  previousValue: 0,
  createdBy: 'user-1',
  ...stamp,
});
/** Estrutura terminou antes da janela; Alvenaria começa antes e termina dentro, com blocos de durações
 * diferentes; Revestimento tem dois blocos no mesmo local; Instalações termina depois da janela;
 * Pintura externa começa depois dela; "Sem blocos" não tem bloco. M1 e M2 fechadas (fora de ordem),
 * M3 aberta. */
function lob(): Pick<LobData, 'services' | 'activities' | 'measurements' | 'items'> {
  return {
    services: [
      service('s3', 'Revestimento', 2),
      service('s1', 'Estrutura', 0),
      service('s4', 'Sem blocos', 3),
      service('s6', 'Instalações', 5),
      service('s2', 'Alvenaria', 1),
      service('s5', 'Pintura externa', 4),
    ],
    activities: [
      block('a1', 's1', 'l1', '2026-06-01', 20),
      block('a2', 's1', 'l2', '2026-07-01', 20),
      block('a3', 's2', 'l1', '2026-09-14', 10),
      block('a4', 's2', 'l2', '2026-10-05', 30),
      block('a5', 's3', 'l1', '2027-01-04', 15),
      block('a6', 's3', 'l1', '2027-02-01', 5),
      block('a7', 's3', 'l2', '2027-02-08', 10),
      block('a8', 's5', 'l1', '2027-10-04', 5),
      block('a9', 's6', 'l1', '2027-09-01', 40),
    ],
    measurements: [measurement('m2', 2, '2026-10-30'), measurement('m1', 1, '2026-09-30'), measurement('m3', 3, '2026-11-04', 'open')],
    items: [
      item('m1', 'a1', 100),
      item('m1', 'a2', 60),
      item('m1', 'a3', 50),
      item('m2', 'a2', 100),
      item('m2', 'a3', 100),
      item('m2', 'a4', 20),
      item('m3', 'a4', 80),
      item('m3', 'a5', 10),
    ],
  };
}
const WINDOW = legalizationWindow(DELIVERY);

test('lobServiceRows: um resumo por serviço com início, término, locais, % ponderado pela duração e se cai na janela', () => {
  const rows = lobServiceRows(lob(), WINDOW);
  assert.deepEqual(rows, [
    { serviceId: 's1', name: 'Estrutura', locals: 2, start: '2026-06-01', finish: '2026-07-28', percent: 100, inWindow: false },
    // (10 × 100 + 30 × 20) / 40 = 40; a média simples daria 60 e a medição aberta (80) não conta.
    { serviceId: 's2', name: 'Alvenaria', locals: 2, start: '2026-09-14', finish: '2026-11-13', percent: 40, inWindow: true },
    // Três blocos em dois locais; os 10% só estão na medição aberta.
    { serviceId: 's3', name: 'Revestimento', locals: 2, start: '2027-01-04', finish: '2027-02-19', percent: 0, inWindow: true },
    { serviceId: 's5', name: 'Pintura externa', locals: 1, start: '2027-10-04', finish: '2027-10-08', percent: 0, inWindow: false },
    // Começa dentro e termina depois do fim da janela: entra marcado.
    { serviceId: 's6', name: 'Instalações', locals: 1, start: '2027-09-01', finish: '2027-10-26', percent: 0, inWindow: true },
  ]);
  assert.deepEqual(lobServiceRows({ services: [], activities: [], measurements: [], items: [] }, WINDOW), []);
});

test('applyLobImport: linhas novas no fim do bloco da obra, com LB, "Não iniciar antes de", dias úteis, % e datas reais', () => {
  const { tasks, links } = build(DELIVERY);
  const rows = lobServiceRows(lob(), WINDOW).filter(r => r.inWindow);
  const before = structuredClone(tasks);
  const result = applyLobImport(tasks, rows, { planId: 'g', newId, now: '2026-11-05T09:00:00Z' });
  assert.deepEqual([result.added, result.updated, result.tasks.length], [3, 0, 41]);
  assert.deepEqual(tasks, before, 'a entrada não é alterada');
  assert.deepEqual(
    result.tasks.map(t => t.order),
    Array.from({ length: 41 }, (_, i) => i + 1),
  );
  // O bloco "Caminho crítico da obra" ganha as três linhas no fim, no nível dos filhos; depois vem a Legalização.
  assert.deepEqual(
    result.tasks.slice(10, 15).map(t => [t.order, t.level, t.name, t.lobServiceId]),
    [
      [11, 1, 'Vistoria com os clientes', undefined],
      [12, 1, 'Alvenaria', 's2'],
      [13, 1, 'Revestimento', 's3'],
      [14, 1, 'Instalações', 's6'],
      [15, 0, 'Legalização', undefined],
    ],
  );
  const pick = (t: PlanTask) => ({
    planId: t.planId,
    constraintType: t.constraintType,
    constraintDate: t.constraintDate,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    duration: t.duration,
    progress: t.progress,
    actualStart: t.actualStart,
    actualEnd: t.actualEnd,
  });
  assert.deepEqual(pick(named(result.tasks, 'Alvenaria')), {
    planId: 'g',
    constraintType: 'SNET',
    constraintDate: '2026-09-14',
    plannedStart: '2026-09-14',
    plannedEnd: '2026-11-13',
    duration: { value: 45, unit: 'd' },
    progress: 40,
    actualStart: '2026-09-14',
    actualEnd: undefined,
  });
  assert.deepEqual(pick(named(result.tasks, 'Revestimento')), {
    planId: 'g',
    constraintType: 'SNET',
    constraintDate: '2027-01-04',
    plannedStart: '2027-01-04',
    plannedEnd: '2027-02-19',
    duration: { value: 35, unit: 'd' },
    progress: 0,
    actualStart: undefined,
    actualEnd: undefined,
  });
  // As linhas do modelo não mudam, só a ordem das que vêm depois.
  for (const t of before) {
    const after = result.tasks.find(r => r.id === t.id)!;
    assert.deepEqual({ ...after, order: 0 }, { ...t, order: 0 }, t.name);
  }
  // O reagendamento não lança e fica estável (o `save_plan_revision` está no teste dos comandos).
  assertStable(scheduleTasks(result.tasks, links, calendar), links);
});

test('applyLobImport: 100% leva término real; início em fim de semana vai para o dia útil; % arredondado e limitado', () => {
  const { tasks } = build(DELIVERY, 'blank');
  const structure = lobServiceRows(lob(), WINDOW).find(r => r.serviceId === 's1')!;
  const hand: LobServiceRow[] = [
    structure,
    { serviceId: 'x1', name: 'Sábado', locals: 1, start: '2027-01-02', finish: '2027-01-08', percent: 33.6, inWindow: true },
    { serviceId: 'x2', name: 'Acima de 100', locals: 1, start: '2027-01-04', finish: '2027-01-04', percent: 120, inWindow: true },
    {
      serviceId: 'x3',
      name: 'Término no domingo antes do início',
      locals: 1,
      start: '2027-01-09',
      finish: '2027-01-10',
      percent: 0,
      inWindow: true,
    },
  ];
  const result = applyLobImport(tasks, hand, { planId: 'g', newId, now: NOW });
  const done = named(result.tasks, 'Estrutura');
  assert.deepEqual(
    [done.progress, done.actualStart, done.actualEnd, done.duration],
    [100, '2026-06-01', '2026-07-28', { value: 42, unit: 'd' }],
  );
  const saturday = named(result.tasks, 'Sábado');
  assert.deepEqual(
    [saturday.constraintDate, saturday.plannedStart, saturday.duration, saturday.progress, saturday.actualStart],
    ['2027-01-04', '2027-01-04', { value: 5, unit: 'd' }, 34, '2027-01-04'],
  );
  const above = named(result.tasks, 'Acima de 100');
  assert.deepEqual([above.progress, above.actualEnd, above.duration], [100, '2027-01-04', { value: 1, unit: 'd' }]);
  const weekend = named(result.tasks, 'Término no domingo antes do início');
  assert.deepEqual([weekend.plannedStart, weekend.plannedEnd, weekend.duration], ['2027-01-11', '2027-01-11', { value: 1, unit: 'd' }]);
});

test('applyLobImport: trazer de novo atualiza a mesma linha sem mexer em nome, nível, anotações e vínculos', () => {
  const { tasks, links } = build(DELIVERY);
  const [masonry, cladding] = lobServiceRows(lob(), WINDOW).filter(r => r.serviceId === 's2' || r.serviceId === 's3');
  const first = applyLobImport(tasks, [masonry], { planId: 'g', newId, now: NOW }).tasks;
  // A pessoa renomeia, anota, recua a linha para o nível 0 e liga a linha LB à limpeza final.
  const edited = first.map(t => (t.lobServiceId === 's2' ? { ...t, name: 'Alvenaria das torres', notes: 'Equipe própria', level: 0 } : t));
  const line = edited.find(t => t.lobServiceId === 's2')!;
  const cleaning = named(edited, 'Limpeza final');
  const withLink: PlanDependency[] = [
    ...links,
    { id: 'l-lb', ...stamp, predecessorId: line.id, successorId: cleaning.id, type: 'TI', lagDays: 0, lagBusiness: true },
  ];
  // Nova medição: a alvenaria termina mais tarde e chega a 100%; o revestimento entra pela primeira vez.
  const updatedRow: LobServiceRow = { ...masonry, finish: '2026-11-20', percent: 100 };
  const again = applyLobImport(edited, [updatedRow, cladding], { planId: 'g', newId, now: '2026-11-21T09:00:00Z' });
  assert.deepEqual([again.added, again.updated, again.tasks.length], [1, 1, 40]);
  const updated = again.tasks.find(t => t.id === line.id)!;
  assert.deepEqual([updated.name, updated.notes, updated.level, updated.lobServiceId], ['Alvenaria das torres', 'Equipe própria', 0, 's2']);
  assert.deepEqual(
    [updated.plannedStart, updated.plannedEnd, updated.duration, updated.progress, updated.actualStart, updated.actualEnd],
    ['2026-09-14', '2026-11-20', { value: 50, unit: 'd' }, 100, '2026-09-14', '2026-11-20'],
  );
  assert.equal(updated.updatedAt, '2026-11-21T09:00:00Z');
  assert.equal(again.tasks.filter(t => t.lobServiceId === 's2').length, 1);
  // Com a linha recuada para o nível 0, o bloco da obra termina antes dela: o revestimento entra ali.
  assert.deepEqual(
    again.tasks.slice(10, 14).map(t => [t.order, t.level, t.name]),
    [
      [11, 1, 'Vistoria com os clientes'],
      [12, 1, 'Revestimento'],
      [13, 0, 'Alvenaria das torres'],
      [14, 0, 'Legalização'],
    ],
  );
  assert.deepEqual(
    again.tasks.map(t => t.order),
    Array.from({ length: 40 }, (_, i) => i + 1),
  );
  // O vínculo continua apontando para a mesma linha e o cronograma reagenda sem erro.
  assertStable(scheduleTasks(again.tasks, withLink, calendar), withLink);
});

test('applyLobImport: sem o bloco "Caminho crítico da obra", as linhas vão para o fim com nível 0', () => {
  const { tasks, links } = build(DELIVERY, 'blank');
  const rows = lobServiceRows(lob(), WINDOW).filter(r => r.inWindow);
  const result = applyLobImport(tasks, rows, { planId: 'g', newId, now: NOW });
  assert.deepEqual(
    result.tasks.map(t => [t.order, t.level, t.name, t.lobServiceId]),
    [
      [1, 0, 'Entrega das chaves', undefined],
      [2, 0, 'Alvenaria', 's2'],
      [3, 0, 'Revestimento', 's3'],
      [4, 0, 'Instalações', 's6'],
    ],
  );
  assertStable(scheduleTasks(result.tasks, links, calendar), links);
  // Nada a trazer: nada muda além da ordem já contínua.
  assert.deepEqual(applyLobImport(tasks, [], { planId: 'g', newId, now: NOW }), { tasks, added: 0, updated: 0 });
});

// ─── Comandos ────────────────────────────────────────────────────────────────────

let commandSeq = 0;
const contextFor = (actorId = 'user-1'): CommandContext => ({ actorId, today: TODAY, now: NOW, newId: () => `leg-${++commandSeq}` });
const run = (data: PlanningData, command: Command, actorId = 'user-1') => applyCommand(data, command, contextFor(actorId));
const create = (workId = 'obra-1', deliveryDate = DELIVERY, template: 'atr' | 'blank' = 'atr', name?: string): Command => ({
  type: 'create_legalization_plan',
  workId,
  deliveryDate,
  template,
  ...(name === undefined ? {} : { name }),
});
const tasksOf = (data: PlanningData, planId: string) => byOrder(data.planTasks.filter(t => t.planId === planId));
const linksOf = (data: PlanningData, planId: string) =>
  data.planDependencies.filter(l => data.planTasks.some(t => t.planId === planId && t.id === l.successorId));
const revision = (data: PlanningData, planId: string, tasks: PlanTask[], links: PlanDependency[]): Command => ({
  type: 'save_plan_revision',
  planId,
  expectedSnapshot: planSnapshot(
    data.plans.find(p => p.id === planId)!,
    data.planTasks,
    data.planDependencies,
  ),
  reason: 'Linha de Balanço',
  tasks,
  links,
  calendar,
});

test('create_legalization_plan cria o Gantt com tipo, entrega, mês da janela e as 38 linhas do modelo', () => {
  const data = createMockData();
  const id = run(data, create());
  const plan = data.plans.find(p => p.id === id)!;
  assert.deepEqual(
    [plan.kind, plan.deliveryDate, plan.month, plan.name, plan.workId, plan.createdBy, plan.baselineOf],
    ['legalizacao', DELIVERY, '2026-10', LEGALIZATION_DEFAULT_NAME, 'obra-1', 'user-1', undefined],
  );
  const tasks = tasksOf(data, id);
  assert.equal(tasks.length, 38);
  assert.equal(linksOf(data, id).length, 38);
  assert.equal(deliveryOf(tasks).deadline, DELIVERY);
  assert.ok(data.history.some(h => h.action === 'create_legalization_plan' && h.entityId === id));
  // O que nasce é salvável sem ajuste: o servidor recalcula e confere as datas.
  run(data, revision(data, id, tasks, linksOf(data, id)));
  // Em branco, com nome próprio, em outra obra.
  const blank = run(data, create('obra-2', '2027-10-02', 'blank', '  Legalização Aurora  '));
  assert.equal(data.plans.find(p => p.id === blank)!.name, 'Legalização Aurora');
  assert.deepEqual(
    tasksOf(data, blank).map(t => [t.name, t.plannedEnd, t.deadline]),
    [['Entrega das chaves', '2027-10-01', '2027-10-02']],
  );
  assert.equal(linksOf(data, blank).length, 0);
});

test('create_legalization_plan: um Gantt por obra; consulta, obra sem acesso, modelo e data inválidos são recusados', () => {
  const data = createMockData();
  run(data, create());
  const before = structuredClone(data);
  assert.throws(() => run(data, create('obra-1', '2028-03-31', 'blank')), /já tem um Gantt de legalização/);
  assert.throws(() => run(data, create('obra-2'), 'user-3'), /apenas consulta/);
  // Rafael (planejador) só tem a obra 1.
  assert.throws(() => run(data, create('obra-2'), 'user-2'), /não tem acesso a esta obra/);
  assert.throws(() => run(data, create('obra-404')), /não tem acesso a esta obra/);
  assert.throws(() => run(data, { ...create('obra-2'), template: 'outro' } as unknown as Command), /modelo ATR ou em branco/);
  assert.throws(() => run(data, create('obra-2', '2027-02-30')), /Data inválida/);
  assert.deepEqual(data, before);
  // O Gantt de uma obra não impede o da outra.
  assert.ok(run(data, create('obra-2')));
});

test('create_plan: o mês da janela do Gantt continua livre e o Gantt (nem a linha de base dele) serve de origem da cópia', () => {
  const data = createMockData();
  const gantt = run(data, create());
  const october = run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-10' });
  assert.equal(data.plans.find(p => p.id === october)!.kind, undefined);
  assert.throws(() => run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-10' }), /já tem um plano para este mês/);
  const before = structuredClone(data);
  assert.throws(
    () => run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-11', copyFrom: gantt }),
    /não do Gantt de legalização/,
  );
  assert.deepEqual(data, before);
  const baseline = run(data, { type: 'freeze_plan_baseline', planId: gantt, name: 'Base' });
  assert.throws(() => run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-12', copyFrom: baseline }), /Gantt de legalização/);
});

test('update_legalization_plan muda a entrega, o mês e o prazo final do marco, sem mexer em outro prazo final', () => {
  const data = createMockData();
  const id = run(data, create());
  const plan = data.plans.find(p => p.id === id)!;
  const visit = data.planTasks.find(t => t.planId === id && t.name === 'Vistoria com os clientes')!;
  visit.deadline = '2027-08-31';
  const deliveryEnd = deliveryOf(tasksOf(data, id)).plannedEnd;
  run(data, { type: 'update_legalization_plan', planId: id, deliveryDate: '2027-12-15' });
  assert.deepEqual([plan.deliveryDate, plan.month, plan.version, plan.name], ['2027-12-15', '2026-12', 1, LEGALIZATION_DEFAULT_NAME]);
  const delivery = deliveryOf(tasksOf(data, id));
  assert.deepEqual([delivery.deadline, delivery.version], ['2027-12-15', 1]);
  // O prazo final não segura a data: o marco fica onde a rede o põe.
  assert.equal(delivery.plannedEnd, deliveryEnd);
  assert.deepEqual([visit.deadline, visit.version], ['2027-08-31', undefined]);
  // Nome: aparado; vazio volta ao padrão.
  run(data, { type: 'update_legalization_plan', planId: id, deliveryDate: '2027-12-15', name: '  Legalização BRZ ' });
  assert.equal(plan.name, 'Legalização BRZ');
  run(data, { type: 'update_legalization_plan', planId: id, deliveryDate: '2027-12-15', name: ' ' });
  assert.equal(plan.name, LEGALIZATION_DEFAULT_NAME);
  // Plano do mês, linha de base, consulta e data inválida são recusados.
  const monthly = run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-11' });
  const baseline = run(data, { type: 'freeze_plan_baseline', planId: id, name: 'Base' });
  const before = structuredClone(data);
  assert.throws(
    () => run(data, { type: 'update_legalization_plan', planId: monthly, deliveryDate: '2027-12-15' }),
    /Gantt de legalização não encontrado/,
  );
  assert.throws(
    () => run(data, { type: 'update_legalization_plan', planId: baseline, deliveryDate: '2027-12-15' }),
    /Gantt de legalização não encontrado/,
  );
  assert.throws(() => run(data, { type: 'update_legalization_plan', planId: id, deliveryDate: '2027-12-15' }, 'user-3'), /apenas consulta/);
  assert.throws(() => run(data, { type: 'update_legalization_plan', planId: id, deliveryDate: '15/12/2027' }), /Data inválida/);
  assert.deepEqual(data, before);
});

test('freeze_plan_baseline do Gantt gera linha de base com tipo e entrega; a do plano do mês continua sem tipo', () => {
  const data = createMockData();
  const id = run(data, create());
  const baseline = run(data, { type: 'freeze_plan_baseline', planId: id, name: 'Base nov/26' });
  const frozen = data.plans.find(p => p.id === baseline)!;
  assert.deepEqual(
    [frozen.kind, frozen.deliveryDate, frozen.baselineOf, frozen.month, frozen.frozenAt, frozen.name],
    ['legalizacao', DELIVERY, id, '2026-10', NOW, 'Base nov/26'],
  );
  const copies = tasksOf(data, baseline);
  assert.equal(copies.length, 38);
  const originals = new Set(tasksOf(data, id).map(t => t.id));
  assert.ok(copies.every(t => t.sourceTaskId && originals.has(t.sourceTaskId)));
  assert.equal(linksOf(data, baseline).length, 38);
  // O Gantt com linha de base não pode ser excluído antes dela.
  assert.throws(() => run(data, { type: 'delete_plan', planId: id }), /linhas de base salvas/);
  // Linha de base do plano do mês: sem tipo nem entrega.
  const monthly = run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-11' });
  data.planTasks.push({
    id: 'm-1',
    ...stamp,
    planId: monthly,
    name: 'Forro',
    plannedStart: '2026-11-09',
    plannedEnd: '2026-11-09',
    progress: 0,
    level: 0,
    order: 1,
  });
  const monthlyBaseId = run(data, { type: 'freeze_plan_baseline', planId: monthly, name: 'Base' });
  const monthlyBase = data.plans.find(p => p.id === monthlyBaseId)!;
  assert.deepEqual([monthlyBase.kind, monthlyBase.deliveryDate, monthlyBase.baselineOf], [undefined, undefined, monthly]);
});

test('save_plan_revision grava o lobServiceId do rascunho, e trazer de novo atualiza a mesma linha gravada', () => {
  const data = createMockData();
  const id = run(data, create());
  const imported = applyLobImport(
    tasksOf(data, id),
    lobServiceRows(lob(), WINDOW).filter(r => r.inWindow),
    { planId: id, newId, now: NOW },
  );
  run(data, revision(data, id, scheduleTasks(imported.tasks, linksOf(data, id), calendar), linksOf(data, id)));
  const saved = tasksOf(data, id);
  assert.equal(saved.length, 41);
  assert.deepEqual(
    saved.filter(t => t.lobServiceId).map(t => [t.order, t.level, t.name, t.lobServiceId, t.progress, t.actualStart]),
    [
      [12, 1, 'Alvenaria', 's2', 40, '2026-09-14'],
      [13, 1, 'Revestimento', 's3', 0, undefined],
      [14, 1, 'Instalações', 's6', 0, undefined],
    ],
  );
  // Segunda rodada: o revestimento foi renomeado e ligado à limpeza final; a medição M4 fecha 50%.
  const draft = structuredClone(saved).map(t =>
    t.lobServiceId === 's3' ? { ...t, name: 'Revestimento interno', notes: 'Torre única' } : t,
  );
  const cladding = draft.find(t => t.lobServiceId === 's3')!;
  const links: PlanDependency[] = [
    ...linksOf(data, id),
    {
      id: 'l-lb',
      ...stamp,
      predecessorId: cladding.id,
      successorId: named(draft, 'Limpeza final').id,
      type: 'TI',
      lagDays: 0,
      lagBusiness: true,
    },
  ];
  const measured = lob();
  measured.measurements.push(measurement('m4', 4, '2026-11-27'));
  measured.items.push(item('m4', 'a5', 50), item('m4', 'a6', 50), item('m4', 'a7', 50));
  const again = applyLobImport(
    draft,
    lobServiceRows(measured, WINDOW).filter(r => r.inWindow),
    { planId: id, newId, now: NOW },
  );
  assert.deepEqual([again.added, again.updated], [0, 3]);
  run(data, revision(data, id, scheduleTasks(again.tasks, links, calendar), links));
  const stored = data.planTasks.find(t => t.id === cladding.id)!;
  assert.deepEqual(
    [stored.name, stored.notes, stored.lobServiceId, stored.progress, stored.actualStart],
    ['Revestimento interno', 'Torre única', 's3', 50, '2027-01-04'],
  );
  assert.ok(data.planDependencies.some(l => l.id === 'l-lb'));
  // Linha que sai do rascunho sem lobServiceId (ou com texto vazio) perde a marca LB.
  const cleared = tasksOf(data, id).map(t => (t.id === cladding.id ? { ...t, lobServiceId: '' } : t));
  run(data, revision(data, id, cleared, linksOf(data, id)));
  assert.equal(data.planTasks.find(t => t.id === cladding.id)!.lobServiceId, undefined);
});

test('delete_plan apaga o Gantt de legalização com tarefas e vínculos, e a obra pode criar outro', () => {
  const data = createMockData();
  const id = run(data, create());
  const taskIds = new Set(tasksOf(data, id).map(t => t.id));
  run(data, { type: 'delete_plan', planId: id });
  assert.equal(
    data.plans.some(p => p.id === id),
    false,
  );
  assert.equal(data.planTasks.filter(t => taskIds.has(t.id)).length, 0);
  assert.equal(data.planDependencies.filter(l => taskIds.has(l.predecessorId) || taskIds.has(l.successorId)).length, 0);
  const next = run(data, create('obra-1', '2028-03-31', 'blank'));
  assert.equal(data.plans.find(p => p.id === next)!.deliveryDate, '2028-03-31');
});

// ─── Supabase, acesso e recorte ──────────────────────────────────────────────────

test('ida e volta pelo Supabase preserva o tipo, a entrega e o lobServiceId', () => {
  const data = createMockData();
  const id = run(data, create());
  const monthly = run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-11' });
  data.planTasks.find(t => t.planId === id && t.name === 'Limpeza final')!.lobServiceId = 's2';
  const payload = planningDataToPayload(data);
  const rows = {
    ...Object.fromEntries(Object.keys(payload).map(k => [k, []])),
    history_events: [],
    profiles: [],
    medium_term_plans: payload.medium_term_plans,
    plan_tasks: payload.plan_tasks,
    plan_dependencies: payload.plan_dependencies,
  } as unknown as Rows;
  const back = rowsToPlanningData(JSON.parse(JSON.stringify(rows)));
  const plan = back.plans.find(p => p.id === id)!;
  assert.deepEqual([plan.kind, plan.deliveryDate, plan.month], ['legalizacao', DELIVERY, '2026-10']);
  assert.equal(isLegalizationPlan(plan), true);
  const other = back.plans.find(p => p.id === monthly)!;
  assert.deepEqual([other.kind, other.deliveryDate, isMonthlyPlan(other)], [undefined, undefined, true]);
  const tasks = back.planTasks.filter(t => t.planId === id);
  assert.equal(tasks.length, 38);
  assert.deepEqual(
    tasks.filter(t => t.lobServiceId).map(t => [t.name, t.lobServiceId]),
    [['Limpeza final', 's2']],
  );
  assert.equal(deliveryOf(tasks).deadline, DELIVERY);
  assert.equal(back.planDependencies.length, 38);
});

test('module-access: a aba 1 libera os comandos do Gantt de legalização, mas não o create_plan do médio prazo', () => {
  const longTerm = { developer: false, modules: ['longo-prazo'] };
  for (const type of ['create_legalization_plan', 'update_legalization_plan', 'save_plan_revision', 'freeze_plan_baseline', 'delete_plan'])
    assert.equal(isCommandAllowed(type, longTerm), true, type);
  for (const type of ['create_plan', 'create_plan_task', 'link_plan_tasks']) assert.equal(isCommandAllowed(type, longTerm), false, type);
  assert.equal(isCommandAllowed('create_legalization_plan', { developer: false, modules: [] }), false);
  assert.equal(isCommandAllowed('create_legalization_plan', { developer: true, modules: [] }), true);
});

test('recorte por módulo: a aba 1 sozinha recebe só os Gantts de legalização, com tarefas e vínculos; médio prazo recebe tudo', () => {
  const data = createMockData();
  const gantt = run(data, create());
  const baseline = run(data, { type: 'freeze_plan_baseline', planId: gantt, name: 'Base' });
  const monthly = run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-11' });
  const monthTask = (id: string, order: number): PlanTask => ({
    id,
    ...stamp,
    planId: monthly,
    name: id,
    plannedStart: '2026-11-09',
    plannedEnd: '2026-11-09',
    progress: 0,
    level: 0,
    order,
  });
  data.planTasks.push(monthTask('m-1', 1), monthTask('m-2', 2));
  data.planDependencies.push({ id: 'l-m', ...stamp, predecessorId: 'm-1', successorId: 'm-2', type: 'TI', lagDays: 0, lagBusiness: true });
  const before = structuredClone(data);

  const longTerm = slimForModules(data, ['longo-prazo']);
  assert.deepEqual(longTerm.plans.map(p => p.id).sort(), [gantt, baseline].sort());
  assert.equal(longTerm.planTasks.length, 76);
  assert.ok(longTerm.planTasks.every(t => t.planId === gantt || t.planId === baseline));
  const kept = new Set(longTerm.planTasks.map(t => t.id));
  assert.equal(longTerm.planDependencies.length, 76);
  assert.ok(longTerm.planDependencies.every(l => kept.has(l.predecessorId) && kept.has(l.successorId)));
  assert.ok(longTerm.wagons.length > 0, 'a aba 1 continua lendo os vagões');

  const medium = slimForModules(data, ['medio-prazo']);
  assert.deepEqual([medium.plans.length, medium.planTasks.length, medium.planDependencies.length], [3, 78, 77]);
  const both = slimForModules(data, ['longo-prazo', 'medio-prazo']);
  assert.deepEqual([both.plans.length, both.planTasks.length, both.planDependencies.length], [3, 78, 77]);

  for (const modules of [[], ['ifc'], ['vagoes']]) {
    const slim = slimForModules(data, modules);
    assert.deepEqual([slim.plans, slim.planTasks, slim.planDependencies], [[], [], []], modules.join(',') || 'curto prazo');
  }
  assert.deepEqual(data, before, 'a entrada não é alterada');
});

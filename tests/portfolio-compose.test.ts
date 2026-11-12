import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlanning, type Planning } from '../src/application/use-cases/get-planning';
import { hasSectionAccess } from '../src/application/module-access';
import type { MediumTermPlan, NonFulfillmentCause, PlanningData, PlanTask, WeeklyCommitment, Work } from '../src/domain/entities';
import type { LongTermActivity, LongTermPlanDocument } from '../src/domain/long-term-plan';
import { ppcSeries } from '../src/domain/rules';
import type { SafetyType } from '../src/domain/safety';
import type { TerminalityData, TerminalityItem } from '../src/domain/terminality';
import { addDays, startOfWeek } from '../src/domain/validation';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { assemblePortfolioSources } from '../src/infrastructure/repositories/supabase/portfolio-sources';
import { createMockData } from '../src/mocks/planning';
import { PORTFOLIO_MODULES, referenceOf, type DashboardReference, type PortfolioModule } from '../src/modules/dashboard/model';
import { buildMediumTermPanel } from '../src/modules/dashboard/medium-term-panel';
import { resolvePeriod, type PeriodContext, type PeriodSelection } from '../src/modules/dashboard/period';
import { buildShortTermPanel } from '../src/modules/dashboard/short-term-panel';
import { buildWagonsPanel } from '../src/modules/dashboard/wagons-panel';
import { aggregatePortfolio } from '../src/modules/dashboard/portfolio/aggregate';
import { composePortfolio, PORTFOLIO_TEXT_LIMIT, portfolioText } from '../src/modules/dashboard/portfolio/compose';
import { extractRow, type PortfolioSource } from '../src/modules/dashboard/portfolio/extract';
import {
  byName,
  fromBuilder,
  longTermSource,
  safetySource,
  terminalitySource,
  type WorkLines,
} from '../src/modules/dashboard/portfolio/sources';
import type { PortfolioSourcesResponse, PortfolioWork } from '../src/modules/dashboard/portfolio/types';

/** Dashboard geral no servidor (08/11/2026, ferramenta `panorama_obras` da Claudia): `composePortfolio` tem de dar
 * os mesmos números da página. Cenário: hoje é terça 08/09/2026 (semana atual de 07/09). Residencial Horizonte
 * (RH-01, a obra com vagões dos dados de exemplo) tem linhas de 06/07 a 31/08, todas apuradas, e a semana atual
 * em aberto; Edifício Aurora (EA-02) começa em 27/07; Jardins do Lago (JL-03) só começa na semana atual. Sem
 * período escolhido, o geral abre em agosto de 2026 (a semana apurada mais recente é a de 31/08). */

const TODAY = '2026-09-08';
const stamp = { createdAt: '2026-07-01T12:00:00Z', updatedAt: '2026-07-01T12:00:00Z' };
const work = (id: string, name: string, code: string): Work => ({ id, name, code, description: '', active: true, ...stamp });

let seq = 0;
const line = (workId: string, weekStart: string, over: Partial<WeeklyCommitment> = {}): WeeklyCommitment => ({
  id: `c${++seq}`,
  workId,
  name: 'Alvenaria',
  supplier: '',
  weekEnd: addDays(weekStart, 5),
  responsibleId: 'user-1',
  startDate: weekStart,
  endDate: weekStart,
  weekStart,
  ...stamp,
  ...over,
});
/** Uma semana com `sim` cumpridas, uma linha Não por causa e `pending` sem Status. */
function week(
  workId: string,
  weekStart: string,
  sim: number,
  causes: NonFulfillmentCause[],
  pending = 0,
  extra: Partial<WeeklyCommitment> = {},
): WeeklyCommitment[] {
  return [
    ...Array.from({ length: sim }, () => line(workId, weekStart, { fulfilled: true, ...extra })),
    ...causes.map(cause => line(workId, weekStart, { fulfilled: false, cause, ...extra })),
    ...Array.from({ length: pending }, () => line(workId, weekStart, extra)),
  ];
}
const nao = (count: number, cause: NonFulfillmentCause = 'Falta de Mão de Obra') => Array.from({ length: count }, () => cause);
const mondays = (from: string, count: number) => Array.from({ length: count }, (_, i) => addDays(from, i * 7));

// Horizonte: julho 34 de 40 (85%), agosto 38 de 50 (76%); metade das linhas da SM MARTINS (equipe-1), metade da ATR ENG.
const HORIZONTE_SIM = [9, 9, 8, 8, 8, 7, 9, 6, 8];
// Aurora: 27/07 6 de 8; agosto 23 de 40 (57,5%), metade das linhas com a empresa "SM Martins" digitada.
const AURORA_SIM = [6, 5, 4, 6, 5, 3];

function scenario(): PlanningData {
  seq = 0;
  const data = createMockData();
  data.works.push(work('obra-3', 'Jardins do Lago', 'JL-03'));
  // Horizonte, 10 linhas por semana: 5 cumpridas da ATR ENG (equipe-2); as demais da SM MARTINS (equipe-1), com os
  // Não divididos entre falta de mão de obra (a maior parte) e falta de material.
  mondays('2026-07-06', 9).forEach((monday, i) => {
    const failures = 10 - HORIZONTE_SIM[i];
    const causes = [...nao(Math.ceil(failures / 2)), ...nao(Math.floor(failures / 2), 'Falta de Material')];
    data.commitments.push(...week('obra-1', monday, 5, [], 0, { teamId: 'equipe-2' }));
    data.commitments.push(...week('obra-1', monday, HORIZONTE_SIM[i] - 5, causes, 0, { teamId: 'equipe-1' }));
  });
  data.commitments.push(...week('obra-1', '2026-09-07', 0, [], 5));
  mondays('2026-07-27', 6).forEach((monday, i) => {
    const sim = AURORA_SIM[i];
    data.commitments.push(...week('obra-2', monday, sim, nao(8 - sim, 'Intempéries'), 0, { supplier: i % 2 ? 'SM Martins' : '' }));
  });
  data.commitments.push(...week('obra-3', '2026-09-07', 0, [], 4));

  // Médio prazo da Horizonte: plano de agosto com uma concluída, uma atrasada e uma não iniciada.
  const plan: MediumTermPlan = {
    id: 'plan-ago',
    ...stamp,
    workId: 'obra-1',
    month: '2026-08',
    name: 'Plano de agosto',
    createdBy: 'user-1',
  };
  data.plans.push(plan);
  const task = (id: string, end: string, progress: number, order: number): PlanTask => ({
    id,
    ...stamp,
    planId: plan.id,
    name: id,
    plannedStart: '2026-08-03',
    plannedEnd: end,
    progress,
    order,
    level: 0,
  });
  data.planTasks.push(task('T1', '2026-08-14', 100, 1), task('T2', '2026-08-20', 50, 2), task('T3', '2026-09-30', 0, 3));
  return data;
}

// Rotas: longo prazo só da Horizonte, terminalidade só da Horizonte, segurança das duas.
const activity: LongTermActivity = {
  id: 'alv',
  name: 'Alvenaria',
  color: '#2563eb',
  firstFloor: 1,
  lastFloor: 2,
  start: '2026-07-06',
  duration: 40,
  interval: 40,
  unit: '%',
  visible: true,
  predecessors: [],
  teams: [],
};
const longTermDoc: LongTermPlanDocument = {
  floorCount: 2,
  floorNames: {},
  activities: [activity],
  baselines: [],
  measurements: [
    {
      id: 'm1',
      number: 1,
      date: '2026-08-28',
      createdAt: '2026-08-28T12:00:00Z',
      createdBy: 'user-1',
      items: [{ activityId: 'alv', value: 60 }],
    },
  ],
};
const pendency = (id: string, observedOn: string, over: Partial<TerminalityItem> = {}): TerminalityItem => ({
  id,
  workId: 'obra-1',
  floorId: 'p1',
  description: 'Rejunte falhado',
  observedOn,
  status: 'open',
  createdBy: 'user-1',
  ...stamp,
  ...over,
});
const terminality: TerminalityData = {
  floors: [{ id: 'p1', workId: 'obra-1', name: 'Térreo', orderIndex: 0, ...stamp }],
  units: [],
  types: [],
  people: [],
  items: [
    pendency('i1', '2026-08-05', { contractor: 'SM MARTINS' }),
    pendency('i2', '2026-07-20', { status: 'resolved', correctedOn: '2026-08-12' }),
    pendency('i3', '2026-08-25'),
  ],
  photos: [],
};
const safetyType = (id: string, name: string, orderIndex: number): SafetyType => ({ id, name, orderIndex, active: true, ...stamp });
const SAFETY_TYPES = [safetyType('t1', 'EPI', 0), safetyType('t2', 'Proteções periféricas', 1)];

function sources(): PortfolioSourcesResponse {
  return assemblePortfolioSources(
    ['obra-1', 'obra-2', 'obra-3'],
    { kind: 'rows', rows: [{ work_id: 'obra-1', document: longTermDoc }] },
    new Map([['obra-1', { kind: 'ready' as const, data: terminality }]]),
    {
      kind: 'ready',
      types: SAFETY_TYPES,
      items: [
        { workId: 'obra-1', typeId: 't1', consequence: 'Leve', observedOn: '2026-08-10', status: 'open' },
        { workId: 'obra-1', typeId: 't2', consequence: 'Leve', observedOn: '2026-08-03', status: 'resolved', correctedOn: '2026-08-06' },
        { workId: 'obra-2', typeId: 't1', consequence: 'Severa', observedOn: '2026-08-20', status: 'open' },
      ],
    },
  );
}

const load = async (data = scenario()) => getPlanning(new MockPlanningRepository(data), TODAY);
const ALL_ACCESS = { developer: true, modules: [] as string[] };

/** Os passos do `usePortfolio` (use-portfolio-data.ts) escritos à parte, sem recorte de empreiteiro: o que a
 * página calcula para as mesmas entradas. */
function hookReplay(planning: Planning, response: PortfolioSourcesResponse, selection: PeriodSelection, modules = ALL_ACCESS) {
  const data = planning.data;
  const today = planning.today;
  const currentWeek = startOfWeek(today);
  const access = Object.fromEntries(PORTFOLIO_MODULES.map(m => [m.id, hasSectionAccess(m.id, modules)])) as Record<
    PortfolioModule,
    boolean
  >;
  const shown = new Set(PORTFOLIO_MODULES.filter(m => access[m.id]).map(m => m.id));
  const works: PortfolioWork[] = data.works.map(w => ({ id: w.id, name: w.name, code: w.code })).sort(byName);
  const lines = new Map<string, WorkLines>();
  for (const w of works) lines.set(w.id, { commitments: [], teams: [] });
  for (const c of data.commitments) lines.get(c.workId)?.commitments.push(c);
  for (const t of data.teams) lines.get(t.workId)?.teams.push(t);
  for (const own of lines.values()) {
    const series = ppcSeries(own.commitments);
    if (series.length) own.firstWeek = startOfWeek(series[0].weekStart);
    own.lastClosed = series.filter(point => point.weekStart < currentWeek && point.pending === 0).at(-1)?.weekStart;
  }
  let since = currentWeek;
  let anchor: string | undefined;
  for (const own of lines.values()) {
    if (own.firstWeek && own.firstWeek < since) since = own.firstWeek;
    if (own.lastClosed && (!anchor || own.lastClosed > anchor)) anchor = own.lastClosed;
  }
  const ctx: PeriodContext = { currentWeek, since, anchorWeek: anchor ?? currentWeek };
  const period = resolvePeriod(selection, ctx);
  const entries = new Map(response.works.map(entry => [entry.workId, entry]));
  const rows = works.map(w => {
    const own = lines.get(w.id)!;
    const firstWeek = own.firstWeek;
    const ref: DashboardReference | undefined =
      firstWeek && firstWeek > period.lastWeek ? undefined : referenceOf(period.lastWeek, today, firstWeek ?? period.lastWeek, period);
    const reasons = {};
    const entry = entries.get(w.id);
    // Quadro escondido não é construído; obra fora do período fica sem dado.
    const source = <T>(module: PortfolioModule, build: (ref: DashboardReference) => PortfolioSource<T>): PortfolioSource<T> =>
      !shown.has(module) ? { status: 'hidden' } : ref ? build(ref) : { status: 'absent' };
    return extractRow(
      {
        work: w,
        ...(firstWeek ? { firstWeek } : {}),
        commitments: own.commitments,
        teams: own.teams,
        short: source('curto-prazo', r =>
          fromBuilder(() => buildShortTermPanel({ commitments: own.commitments, teams: own.teams, work: w }, r, { week: r.week })),
        ),
        wagons: source('vagoes', r => fromBuilder(() => buildWagonsPanel(planning, w.id, r, { week: r.week }))),
        medium: source('medio-prazo', r => fromBuilder(() => buildMediumTermPanel(data, w.id, r, { week: r.week }))),
        longTerm: source('longo-prazo', r => longTermSource(response, entry, r, reasons)),
        terminality: source('terminalidade', r => terminalitySource(response, entry, r, reasons, undefined)),
        safety: source('seguranca', r => safetySource(response, entry, r, reasons, today)),
        reasons,
      },
      period,
    );
  });
  return { ctx, data: aggregatePortfolio({ period, rows, shown }) };
}

const names = (list: readonly (PortfolioWork | { work: PortfolioWork })[]) => list.map(item => ('work' in item ? item.work : item).name);
const ppcOf = (data: { rows: { work: PortfolioWork; short?: { current: { percent?: number } } }[] }, id: string) =>
  data.rows.find(row => row.work.id === id)?.short?.current.percent;

test('sem período escolhido: Mensal no mês da semana apurada mais recente, com os mesmos números da página', async () => {
  const planning = await load();
  const composed = composePortfolio({ planning, works: planning.data.works, sources: sources(), ...ALL_ACCESS });
  const expected = hookReplay(planning, sources(), { scale: 'mes' });
  assert.equal(composed.period.scale, 'mes');
  assert.equal(composed.period.key, '2026-08');
  assert.deepEqual(composed.periodContext, expected.ctx);
  assert.deepEqual(composed.periodContext, { currentWeek: '2026-09-07', since: '2026-07-06', anchorWeek: '2026-08-31' });
  for (const key of [
    'period',
    'rows',
    'notStarted',
    'totals',
    'kpis',
    'sentence',
    'heat',
    'pareto',
    'companies',
    'responsibles',
    'safetyTypes',
    'noData',
  ] as const)
    assert.deepEqual(composed[key], expected.data[key], key);
  // Os números do cenário, à mão.
  assert.deepEqual(names(composed.rows), ['Edifício Aurora', 'Residencial Horizonte']);
  assert.deepEqual(names(composed.notStarted), ['Jardins do Lago']);
  assert.equal(ppcOf(composed, 'obra-1'), 76);
  // 23 ÷ 40 em ponto flutuante dá 57,4999…: a página mostra 57%, e o texto também.
  assert.ok(Math.abs(ppcOf(composed, 'obra-2')! - 57.5) < 1e-9);
  const horizonte = composed.rows.find(row => row.work.id === 'obra-1')!;
  assert.equal(horizonte.short?.delta, -9);
  assert.equal(horizonte.short?.position, 1);
  assert.equal(composed.rows.find(row => row.work.id === 'obra-2')!.short?.position, 2);
  assert.equal(composed.totals.short.planned, 90);
  assert.equal(composed.totals.short.fulfilled, 61);
  // Todos os quadros: ninguém escondido, a Aurora sem longo prazo, sem vagões, sem médio prazo e sem terminalidade.
  assert.deepEqual(composed.shown, ['longo-prazo', 'vagoes', 'medio-prazo', 'curto-prazo', 'terminalidade', 'seguranca']);
  const aurora = composed.rows.find(row => row.work.id === 'obra-2')!;
  assert.deepEqual(
    PORTFOLIO_MODULES.map(m => aurora.status[m.id].kind),
    ['absent', 'absent', 'absent', 'ready', 'absent', 'ready'],
  );
  assert.ok(horizonte.longTerm && horizonte.wagons && horizonte.medium && horizonte.terminality && horizonte.safety);
  assert.equal(horizonte.medium.late, 1);
  assert.deepEqual(composed.unavailable, []);
  assert.deepEqual(composed.withoutCompany, []);
});

test('período escolhido: mês por chave e personalizado das últimas 4 semanas apuradas', async () => {
  const planning = await load();
  const july = composePortfolio({
    planning,
    works: planning.data.works,
    sources: sources(),
    selection: { scale: 'mes', key: '2026-07' },
    ...ALL_ACCESS,
  });
  assert.equal(july.period.label, 'julho de 2026');
  assert.deepEqual(names(july.rows), ['Edifício Aurora', 'Residencial Horizonte']);
  assert.equal(ppcOf(july, 'obra-1'), 85);
  assert.equal(ppcOf(july, 'obra-2'), 75);
  // A Aurora tem uma semana apurada até 01/08: em início, sem posição.
  assert.equal(july.rows.find(row => row.work.id === 'obra-2')!.short?.early, true);
  assert.equal(july.rows.find(row => row.work.id === 'obra-2')!.short?.position, undefined);
  assert.deepEqual(july.rows, hookReplay(planning, sources(), { scale: 'mes', key: '2026-07' }).data.rows);

  const selection: PeriodSelection = { scale: 'personalizado', from: '2026-08-10', to: '2026-09-05' };
  const custom = composePortfolio({ planning, works: planning.data.works, sources: sources(), selection, ...ALL_ACCESS });
  assert.deepEqual(custom.period.weeks, ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
  assert.equal(ppcOf(custom, 'obra-1'), 75); // 30 de 40
  assert.equal(ppcOf(custom, 'obra-2'), 56.25); // 18 de 32
  // O anterior são as 4 semanas antes (13/07 a 03/08): 33 de 40 = 82,5%, que arredonda para 83%.
  assert.equal(custom.rows.find(row => row.work.id === 'obra-1')!.short?.delta, -8);
  const expected = hookReplay(planning, sources(), selection).data;
  assert.deepEqual(custom.rows, expected.rows);
  assert.deepEqual(custom.kpis, expected.kpis);
  assert.deepEqual(custom.sentence, expected.sentence);
});

test('quadros: só os módulos que a pessoa pode abrir; os pedidos restringem; nenhum pedido acessível volta a todos', async () => {
  const planning = await load();
  const onlyShort = { developer: false, modules: ['curto-prazo'] };
  const composed = composePortfolio({ planning, works: planning.data.works, sources: sources(), ...onlyShort });
  // Curto prazo liberado; o resto escondido, inclusive a segurança (liberada por pessoa desde 12/11/2026).
  assert.deepEqual(composed.shown, ['curto-prazo']);
  for (const row of composed.rows) {
    for (const hidden of ['longo-prazo', 'vagoes', 'medio-prazo', 'terminalidade'] as const)
      assert.equal(row.status[hidden].kind, 'hidden');
    assert.ok(!row.longTerm && !row.wagons && !row.medium && !row.terminality);
  }
  assert.ok(composed.kpis.every(kpi => kpi.module === 'curto-prazo' || kpi.module === 'seguranca'));
  const expected = hookReplay(planning, sources(), { scale: 'mes' }, onlyShort).data;
  assert.deepEqual(composed.rows, expected.rows);
  assert.deepEqual(composed.kpis, expected.kpis);
  const text = portfolioText(composed);
  assert.ok(!text.includes('Longo prazo:') && !text.includes('Vagões:') && !text.includes('Terminalidade:'));

  const wanted = composePortfolio({
    planning,
    works: planning.data.works,
    sources: sources(),
    shown: new Set<PortfolioModule>(['curto-prazo', 'terminalidade']),
    ...ALL_ACCESS,
  });
  assert.deepEqual(wanted.shown, ['curto-prazo', 'terminalidade']);
  assert.equal(wanted.rows[0].status.seguranca.kind, 'hidden');
  const fallback = composePortfolio({
    planning,
    works: planning.data.works,
    sources: sources(),
    shown: new Set<PortfolioModule>(['vagoes']),
    ...onlyShort,
  });
  assert.deepEqual(fallback.shown, ['curto-prazo']);
});

test('fontes remotas: falha vira erro nos três quadros; sem leitura, eles somem; o local continua', async () => {
  const planning = await load();
  const failed = composePortfolio({ planning, works: planning.data.works, sources: { error: 'Falha na leitura.' }, ...ALL_ACCESS });
  assert.deepEqual(
    failed.unavailable.map(item => [item.module, item.message]),
    [
      ['longo-prazo', 'Falha na leitura.'],
      ['terminalidade', 'Falha na leitura.'],
      ['seguranca', 'Falha na leitura.'],
    ],
  );
  assert.ok(failed.rows.every(row => row.status.terminalidade.kind === 'error' && row.status['curto-prazo'].kind === 'ready'));
  assert.ok(portfolioText(failed).includes('Terminalidade: erro (Falha na leitura.)'));

  const none = composePortfolio({ planning, works: planning.data.works, ...ALL_ACCESS });
  assert.ok(none.rows.every(row => row.status['longo-prazo'].kind === 'hidden' && row.status.seguranca.kind === 'hidden'));
  assert.equal(ppcOf(none, 'obra-1'), 76);

  // Erro de uma obra só (como a rota devolve): o aviso cita a obra.
  const partial = sources();
  partial.works[0] = { ...partial.works[0], terminality: undefined, terminalityError: 'Não foi possível carregar as pendências da obra.' };
  delete partial.works[0].terminality;
  const one = composePortfolio({ planning, works: planning.data.works, sources: partial, ...ALL_ACCESS });
  assert.deepEqual(one.unavailable, [{ module: 'terminalidade', message: 'Não foi possível carregar em Residencial Horizonte.' }]);
});

test('recorte de empreiteiro: a obra sem o empreiteiro sai das linhas e "em mais de uma obra" fica só com os escolhidos', async () => {
  const planning = await load();
  const both = composePortfolio({
    planning,
    works: planning.data.works,
    sources: sources(),
    companies: new Set(['sm martins']),
    ...ALL_ACCESS,
  });
  assert.deepEqual(names(both.rows), ['Edifício Aurora', 'Residencial Horizonte']);
  assert.deepEqual(names(both.withoutCompany), ['Jardins do Lago']);
  assert.ok(both.companies.rows.length && both.companies.rows.every(row => row.name.toLowerCase() === 'sm martins'));
  const atr = composePortfolio({
    planning,
    works: planning.data.works,
    sources: sources(),
    companies: new Set(['ATR ENG']),
    ...ALL_ACCESS,
  });
  assert.deepEqual(names(atr.rows), ['Residencial Horizonte']);
  assert.deepEqual(names(atr.withoutCompany), ['Edifício Aurora', 'Jardins do Lago']);
  // Só as linhas da ATR ENG na Horizonte: todas cumpridas em agosto.
  assert.equal(ppcOf(atr, 'obra-1'), 100);
  // Conjunto vazio é "sem recorte", como a URL sem empreiteiro.
  const empty = composePortfolio({ planning, works: planning.data.works, sources: sources(), companies: new Set(), ...ALL_ACCESS });
  assert.deepEqual(names(empty.rows), ['Edifício Aurora', 'Residencial Horizonte']);
  assert.deepEqual(empty.withoutCompany, []);
});

test('texto: período, frase, cartões, uma linha por obra com "sem dado" e as listas somando as obras', async () => {
  const planning = await load();
  const composed = composePortfolio({ planning, works: planning.data.works, sources: sources(), ...ALL_ACCESS });
  const text = portfolioText(composed);
  assert.ok(text.length <= PORTFOLIO_TEXT_LIMIT);
  assert.ok(text.startsWith('Dashboard geral · Mensal: agosto de 2026'));
  assert.ok(text.includes(`Resumo: ${composed.sentence.map(s => s.text).join('')}`));
  assert.ok(text.includes('Cartões: PPC das obras: 68%'));
  const workLines = text.split('\n').filter(l => l.startsWith('- ') && / · (Em dia|Atenção|Crítico|Sem apuração)/.test(l));
  assert.equal(workLines.length, composed.rows.length);
  const aurora = workLines.find(l => l.startsWith('- Edifício Aurora (EA-02)'))!;
  assert.ok(aurora.includes('Longo prazo: sem dado'));
  assert.ok(aurora.includes('Vagões: sem dado'));
  assert.ok(aurora.includes('Terminalidade: sem dado'));
  assert.ok(aurora.includes('Curto prazo: PPC do período 57% (23 de 40, 2º, abaixo de 70%)'));
  const horizonte = workLines.find(l => l.startsWith('- Residencial Horizonte (RH-01)'))!;
  assert.ok(horizonte.includes('Curto prazo: PPC do período 76% (38 de 50, 1º)'));
  assert.ok(horizonte.includes('vs anterior −9 p.p.'));
  assert.ok(horizonte.includes('Médio prazo: 1 atrasada (plano de ago/26)'));
  assert.ok(text.includes('Só começam depois do período: Jardins do Lago (JL-03).'));
  assert.ok(text.includes('Causas no período, somando as obras'));
  assert.ok(text.includes('Empreiteiros em mais de uma obra (1 de 1'));
  assert.ok(text.includes('Tipos com mais apontamentos no período, somando as obras:\n- EPI: 2'));
});

test('texto: com muitas obras fica dentro do limite e avisa quantas ficaram de fora', async () => {
  seq = 0;
  const data = createMockData();
  data.works = Array.from({ length: 90 }, (_, i) => work(`w${i}`, `Obra com nome comprido número ${String(i).padStart(2, '0')}`, `W-${i}`));
  for (const w of data.works)
    for (const monday of mondays('2026-07-06', 9))
      data.commitments.push(
        ...week(w.id, monday, 6, ['Falta de Mão de Obra', 'Falta de Material', 'Intempéries'], 0, {
          supplier: `Empresa ${Number(w.id.slice(1)) % 12}`,
        }),
      );
  const planning = await load(data);
  const composed = composePortfolio({ planning, works: data.works, sources: sources(), ...ALL_ACCESS });
  assert.equal(composed.rows.length, 90);
  const text = portfolioText(composed);
  assert.ok(text.length <= PORTFOLIO_TEXT_LIMIT, `${text.length}`);
  assert.match(text, /… e mais \d+ obras fora deste texto/);
  const small = portfolioText(composed, 2_000);
  assert.ok(small.length <= 2_000);
});

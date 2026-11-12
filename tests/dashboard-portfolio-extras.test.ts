import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getPlanning } from '../src/application/use-cases/get-planning';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { createMockData } from '../src/mocks/planning';
import type { PortfolioModule, Segment } from '../src/modules/dashboard/model';
import { PORTFOLIO_MODULES } from '../src/modules/dashboard/model';
import { resolvePeriod, type PeriodContext } from '../src/modules/dashboard/period';
import type {
  ChecklistBlock,
  DashboardExtrasResponse,
  HeadcountBlock,
  LegalizationBlock,
  LobBlock,
  ProductionBlock,
  RestrictionsBlock,
  WorkdayCoverage,
} from '../src/modules/dashboard/extras/types';
import { aggregatePortfolio, KPIS_SHOWN } from '../src/modules/dashboard/portfolio/aggregate';
import { composePortfolio, portfolioRange, portfolioText } from '../src/modules/dashboard/portfolio/compose';
import { extractRow, workState, type PortfolioWorkInput } from '../src/modules/dashboard/portfolio/extract';
import {
  cardOwnersOf,
  coverageTone,
  extraSources,
  extrasUrl,
  EXTRA_ROUTE_MODULES,
  missingText,
  servicesOf,
  type ExtrasState,
} from '../src/modules/dashboard/portfolio/extras';
import {
  CardOwnersList,
  ChecklistRows,
  HeadcountRows,
  IdpRows,
  LegalizationRows,
  ProductionRows,
  RestrictionRows,
  ServicesTable,
} from '../src/modules/dashboard/portfolio/extras-charts';
import { parsePortfolioParams, portfolioSearchParams } from '../src/modules/dashboard/portfolio/params';
import { ComparisonTable, hasExtraColumns } from '../src/modules/dashboard/portfolio/portfolio-charts';
import type { PortfolioRow, PortfolioWork } from '../src/modules/dashboard/portfolio/types';

/** Dashboard geral, quadros de 12/11/2026 (modelo aprovado "Dashboards completos e resumo semanal", regras 1 a
 * 11): Linha de Balanço e legalização, Quadro de Restrições, histograma, produtividade e checklist. Os blocos
 * chegam prontos da rota; aqui se confere o que o geral faz com eles. Os números são os do modelo (obras
 * fictícias Horizonte, Mirante, Jardins e Aurora, outubro de 2026, 22 dias úteis). */

const ctx: PeriodContext = { currentWeek: '2026-11-02', since: '2026-08-03', anchorWeek: '2026-10-26' };
const october = resolvePeriod({ scale: 'mes', key: '2026-10' }, ctx);
const ALL = new Set<PortfolioModule>(PORTFOLIO_MODULES.map(m => m.id));
const text = (segments: Segment[]) => segments.map(s => s.text).join('');
const work = (id: string, name: string, code: string): PortfolioWork => ({ id, name, code });
const horizonte = work('h', 'Horizonte', 'HRZ');
const mirante = work('m', 'Mirante', 'MRT');
const jardins = work('j', 'Jardins', 'JRD');
const aurora = work('a', 'Aurora', 'AUR');

const coverage = (launched: number, expected = 22, missing: string[] = []): WorkdayCoverage => ({
  expected,
  launched,
  missing,
  missingCount: expected - launched,
});
const headcount = (dailyAverage: number, launched: number, over: Partial<HeadcountBlock> = {}): HeadcountBlock => ({
  manDays: dailyAverage * launched,
  dailyAverage,
  peak: dailyAverage + 19,
  peakDay: '2026-10-21',
  contractorShare: 0.71,
  coverage: coverage(launched, 22, launched < 22 ? ['2026-10-29', '2026-10-30'].slice(0, 22 - launched) : []),
  lastDay: '2026-10-30',
  series: [],
  seriesGrain: 'semana',
  companies: [{ name: 'Alfa Estruturas', manDays: 440, averagePresent: 22, own: false }],
  ...over,
});
const production = (entries: number, measured: number, launched: number, over: Partial<ProductionBlock> = {}): ProductionBlock => ({
  entries,
  measured,
  pending: entries - measured,
  manDays: entries * 4,
  ...(entries ? { measuredShare: measured / entries } : {}),
  coverage: coverage(launched),
  services: [],
  ...over,
});
const restrictions = (open: number, overdue: number, over: Partial<RestrictionsBlock> = {}): RestrictionsBlock => ({
  asOf: '2026-10-31',
  open,
  byStatus: { todo: open - 2, doing: 1, paused: 1 },
  overdue,
  startOverdue: 3,
  doneInPeriod: 11,
  cancelledInPeriod: 0,
  createdInPeriod: 9,
  byResponsible: [],
  ...over,
});
const lob = (idp: number | undefined, over: Partial<LobBlock> = {}): LobBlock => ({
  status: idp === undefined ? 'no-measurement' : 'ok',
  ...(idp !== undefined ? { idp, real: 41, planned: 44, measurementDate: '2026-10-28', measurementNumber: 7 } : {}),
  weighting: 'cost',
  baselineName: 'LB março',
  ...over,
});
const legalization: LegalizationBlock = {
  milestones: { done: 9, total: 31 },
  late: 2,
  tasks: { done: 20, total: 64 },
  next: { name: 'Vistoria do Corpo de Bombeiros', date: '2026-11-18' },
  deliveryDate: '2027-06-30',
  forecast: '2027-07-06',
  lateDays: 4,
};
const checklist = (pending: number, due: number, over: Partial<ChecklistBlock> = {}): ChecklistBlock => ({
  equipment: 14,
  due,
  pending,
  pendingList: pending ? [{ equipment: 'Betoneira 02', model: 'Betoneira diário', frequency: 'daily' }] : [],
  runsInPeriod: 96,
  runsWithNonConformity: 4,
  nonConformities: 6,
  ...over,
});

const hidden = { status: 'hidden' } as const;
const ready = <T>(data: T | undefined) => (data === undefined ? ({ status: 'absent' } as const) : ({ status: 'ready', data } as const));
interface Blocks {
  balance?: PortfolioRow['balance'];
  restrictions?: RestrictionsBlock;
  headcount?: HeadcountBlock;
  production?: ProductionBlock;
  checklist?: ChecklistBlock;
}
/** Uma linha só com os quadros novos (os de 04/11 e 06/11 ficam escondidos), pelo próprio `extractRow`. */
function row(w: PortfolioWork, blocks: Blocks): PortfolioRow {
  const input: PortfolioWorkInput = {
    work: w,
    commitments: [],
    teams: [],
    short: hidden,
    longTerm: hidden,
    wagons: hidden,
    medium: hidden,
    terminality: hidden,
    balance: ready(blocks.balance),
    restrictions: ready(blocks.restrictions),
    headcount: ready(blocks.headcount),
    production: ready(blocks.production),
    checklist: ready(blocks.checklist),
  };
  return extractRow(input, october);
}
/** As quatro obras da tabela "No Dashboard geral" do modelo. */
const rows = (): PortfolioRow[] => [
  row(horizonte, {
    headcount: headcount(84, 20),
    production: production(146, 91, 19, {
      services: [
        {
          key: 'alvenaria de vedacao',
          name: 'Alvenaria de vedação',
          unit: 'm²',
          quantity: 840,
          manDays: 100,
          perManDay: 8.4,
          measured: 20,
        },
        { key: 'reboco interno', name: 'Reboco interno', unit: 'm²', quantity: 610, manDays: 50, perManDay: 12.2, measured: 9 },
      ],
    }),
    restrictions: restrictions(23, 4, {
      byResponsible: [
        { name: 'Carla', open: 8, overdue: 3 },
        { name: 'Diego', open: 6, overdue: 1 },
      ],
    }),
    balance: { lob: lob(0.93), legalization },
    checklist: checklist(4, 21),
  }),
  row(mirante, {
    headcount: headcount(61, 22),
    production: production(50, 19, 12, {
      services: [
        { key: 'alvenaria de vedacao', name: 'ALVENARIA DE VEDAÇÃO', unit: 'm²', quantity: 300, manDays: 50, perManDay: 6, measured: 8 },
        { key: 'reboco interno', name: 'Reboco interno', unit: 'm', quantity: 90, manDays: 30, perManDay: 3, measured: 4 },
      ],
    }),
    restrictions: restrictions(5, 0),
    balance: { lob: lob(1.02) },
    checklist: checklist(0, 12),
  }),
  row(jardins, {
    headcount: headcount(47, 18),
    production: production(100, 71, 21),
    restrictions: restrictions(6, 1, { byResponsible: [{ name: 'CARLA', open: 2, overdue: 1 }] }),
    checklist: checklist(1, 9),
  }),
  row(aurora, {
    headcount: headcount(112, 22),
    production: production(0, 0, 0),
    restrictions: restrictions(15, 7),
    balance: { lob: lob(0.81) },
  }),
];

test('faixas de "dias lançados": 90% ou mais em verde, 70% a 89% em âmbar, abaixo em vermelho', () => {
  assert.equal(coverageTone(coverage(22)), 'good');
  assert.equal(coverageTone(coverage(20)), 'good'); // 91%
  assert.equal(coverageTone(coverage(19)), 'warn'); // 86%
  assert.equal(coverageTone(coverage(16)), 'warn'); // 73%
  assert.equal(coverageTone(coverage(15)), 'bad'); // 68%
  assert.equal(coverageTone(coverage(0)), 'bad');
  // Período que ainda não teve dia útil: sem faixa.
  assert.equal(coverageTone(coverage(0, 0)), 'neutral');
  assert.equal(missingText(coverage(22)), 'nenhum dia útil sem lançamento');
  assert.equal(
    missingText({
      expected: 22,
      launched: 16,
      missing: ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07'],
      missingCount: 6,
    }),
    'faltaram 01/10, 02/10, 05/10, 06/10 e mais 2',
  );
});

test('estado de cada quadro novo na obra: célula ausente esconde, sem dado vira "—", migração ausente explica', () => {
  const response: DashboardExtrasResponse = {
    range: { start: october.start, end: october.end, today: '2026-11-04' },
    works: [
      {
        workId: 'h',
        headcount: { kind: 'ready', data: headcount(84, 20) },
        production: { kind: 'absent' },
        restrictions: { kind: 'unavailable' },
        lob: { kind: 'error', message: 'Falhou.' },
        // sem `checklist`: a pessoa não tem o módulo
      },
    ],
  };
  const state: ExtrasState = { status: 'ready', data: response };
  const sources = extraSources({ state, entry: response.works[0], inPeriod: true, shown: ALL });
  assert.equal(sources.headcount.status, 'ready');
  assert.deepEqual(sources.production, { status: 'absent' });
  assert.deepEqual(sources.restrictions, { status: 'absent' });
  assert.match(sources.reasons.restricoes ?? '', /não está disponível neste ambiente/);
  assert.deepEqual(sources.balance, { status: 'error', message: 'Falhou.' });
  assert.deepEqual(sources.checklist, { status: 'hidden' });

  // A legalização vem do planejamento: o quadro existe mesmo com a Linha de Balanço falhando, negada ou sem blocos.
  const withLegalization = extraSources({ state, entry: response.works[0], inPeriod: true, shown: ALL, legalization });
  assert.deepEqual(withLegalization.balance, { status: 'ready', data: { legalization } });
  const noBlocks = extraSources({
    state,
    entry: { workId: 'h', lob: { kind: 'ready', data: lob(undefined, { status: 'no-blocks' }) } },
    inPeriod: true,
    shown: ALL,
  });
  assert.deepEqual(noBlocks.balance, { status: 'absent' });
  const denied = extraSources({ state: { status: 'absent' }, inPeriod: true, shown: ALL, legalization });
  assert.deepEqual(denied.balance, { status: 'ready', data: { legalization } });
  assert.deepEqual(denied.headcount, { status: 'hidden' });

  // Carregando, erro da rota, obra fora do período e quadro desmarcado.
  assert.deepEqual(extraSources({ state: { status: 'loading' }, inPeriod: true, shown: ALL, legalization }).balance, { status: 'loading' });
  assert.deepEqual(extraSources({ state: { status: 'error', message: 'Fora do ar.' }, inPeriod: true, shown: ALL }).headcount, {
    status: 'error',
    message: 'Fora do ar.',
  });
  assert.deepEqual(extraSources({ state, entry: response.works[0], inPeriod: false, shown: ALL }).headcount, { status: 'absent' });
  assert.deepEqual(extraSources({ state, entry: response.works[0], inPeriod: true, shown: new Set(['curto-prazo']) }).headcount, {
    status: 'hidden',
  });
  // A rota não devolveu a obra: sem dado.
  assert.deepEqual(extraSources({ state, inPeriod: true, shown: ALL }).headcount, { status: 'absent' });
  assert.deepEqual(EXTRA_ROUTE_MODULES, ['balanco', 'restricoes', 'histograma', 'produtividade', 'checklist']);
  assert.equal(extrasUrl(october), '/api/dashboard/extras?de=2026-10-05&ate=2026-10-31');
});

test('totais: efetivo somado, dias lançados Σ/Σ, parcela medida ponderada pelas linhas, IDP não se soma', () => {
  const data = aggregatePortfolio({ period: october, rows: rows(), shown: ALL });
  const t = data.totals;
  assert.equal(t.headcount.works, 4);
  assert.equal(t.headcount.dailyAverage, 304);
  assert.deepEqual([t.headcount.launched, t.headcount.expected], [82, 88]);
  assert.equal(t.headcount.worksComplete, 2);
  assert.deepEqual([t.production.launched, t.production.expected], [52, 88]);
  // 181 medidas de 296 linhas = 61%, e não a média dos percentuais das obras.
  assert.equal(Math.round(t.production.measuredShare! * 100), 61);
  assert.equal(t.production.entries, 296);
  assert.deepEqual([t.restrictions.open, t.restrictions.overdue, t.restrictions.overdueWorks], [49, 12, 3]);
  assert.deepEqual([t.balance.withIdp, t.balance.behind, t.balance.worst?.work.code], [3, 2, 'AUR']);
  assert.deepEqual([t.balance.legalizationWorks, t.balance.legalizationLate], [1, 2]);
  assert.deepEqual([t.checklist.works, t.checklist.pending, t.checklist.due, t.checklist.pendingWorks], [3, 5, 42, 2]);
  // Sem dado do módulo: a obra aparece na nota embaixo do quadro.
  assert.deepEqual(
    data.noData.checklist.map(w => w.code),
    ['AUR'],
  );
  assert.deepEqual(
    data.noData.balanco.map(w => w.code),
    ['JRD'],
  );
  assert.equal(data.rows.find(r => r.work.id === 'a')!.status.checklist.kind, 'absent');
});

test('cartões e frase (regra 9): "Efetivo médio" e "Cards vencidos", até nove cartões', () => {
  const data = aggregatePortfolio({ period: october, rows: rows(), shown: ALL });
  assert.equal(KPIS_SHOWN, 9);
  const crew = data.kpis.find(k => k.label === 'Efetivo médio')!;
  assert.equal(crew.value, '304');
  assert.equal(crew.module, 'histograma');
  assert.match(crew.hint, /somando 4 obras · 2 de 4 lançaram todos os dias úteis/);
  assert.deepEqual(crew.tag, { text: '82/88 dias', tone: 'warn' });
  const cards = data.kpis.find(k => k.label === 'Cards vencidos')!;
  assert.equal(cards.value, '12');
  assert.equal(cards.tone, 'bad');
  assert.match(cards.hint, /Em 3 de 4 obras · 49 em aberto, em 31\/10/);
  assert.match(
    text(data.sentence),
    /O efetivo médio somou 304 pessoas por dia útil em 4 obras, com o histograma lançado em 82 de 88 dias úteis\./,
  );

  // Quadro desmarcado: sem cartão e sem oração.
  const without = aggregatePortfolio({ period: october, rows: rows(), shown: new Set<PortfolioModule>(['produtividade']) });
  assert.equal(without.kpis.length, 0);
  assert.doesNotMatch(text(without.sentence), /efetivo/);
});

test('estado da obra: cards vencidos e dias lançados abaixo de 70% pedem atenção; quem não usa o módulo não é puxado', () => {
  assert.equal(workState({ headcount: headcount(84, 20), production: production(10, 5, 20) }).state, 'good');
  assert.equal(workState({ restrictions: restrictions(5, 1) }).state, 'warn');
  assert.equal(workState({ headcount: headcount(84, 15) }).state, 'warn');
  assert.equal(workState({ production: production(0, 0, 0) }).state, 'warn');
  // 16 de 22 = 73%: âmbar na célula, mas não puxa o estado.
  assert.equal(workState({ headcount: headcount(84, 16) }).state, 'good');
  assert.equal(workState({}).state, 'neutral');
  const list = rows();
  assert.equal(list.find(r => r.work.id === 'm')!.stateLabel, 'Atenção'); // produtividade 12/22
  assert.equal(list.find(r => r.work.id === 'a')!.stateLabel, 'Atenção'); // cards vencidos e produtividade 0/22
});

test('serviços medidos em mais de uma obra: mesmo nome sem acento e mesma unidade (regra 5)', () => {
  const services = servicesOf(rows());
  // Reboco interno está em m² numa obra e em m na outra: não pareia.
  assert.deepEqual(
    services.rows.map(r => [r.name, r.unit]),
    [['Alvenaria de vedação', 'm²']],
  );
  const alvenaria = services.rows[0];
  assert.equal(alvenaria.manDays, 150);
  assert.equal(alvenaria.perManDay, 1140 / 150);
  assert.deepEqual(
    services.works.map(w => w.code),
    ['HRZ', 'MRT'],
  );
  assert.equal(alvenaria.byWork.h.perManDay, 8.4);
});

test('responsáveis com mais cards vencidos, somando as obras pelo nome sem caixa', () => {
  const owners = cardOwnersOf(rows());
  assert.deepEqual(
    owners.rows.map(r => [r.name, r.overdue, r.open, r.byWork.map(c => `${c.work.code} ${c.overdue}/${c.open}`).join(' · ')]),
    [
      ['Carla', 4, 10, 'HRZ 3/8 · JRD 1/2'],
      ['Diego', 1, 6, 'HRZ 1/6'],
    ],
  );
});

test('URL: "quadros" aceita os onze módulos', () => {
  const parsed = parsePortfolioParams({ quadros: 'histograma,balanco,checklist,xyz,produtividade,restricoes' });
  assert.deepEqual([...(parsed.modules ?? [])], ['histograma', 'balanco', 'checklist', 'produtividade', 'restricoes']);
  assert.equal(portfolioSearchParams(parsed).get('quadros'), 'histograma,balanco,checklist,produtividade,restricoes');
});

const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);

test('comparativo: as sete colunas novas na tela; no papel, a segunda tabela só com elas', () => {
  const data = aggregatePortfolio({ period: october, rows: rows(), shown: ALL });
  const modules = new Set<PortfolioModule>(EXTRA_ROUTE_MODULES);
  assert.ok(hasExtraColumns(modules));
  assert.ok(!hasExtraColumns(new Set<PortfolioModule>(['curto-prazo', 'seguranca'])));

  const screen = render(createElement(ComparisonTable, { data, modules, variant: 'screen' }));
  for (const label of ['Efetivo médio', 'Dias lançados', 'Prod. medida', 'Cards vencidos', 'IDP', 'Vencidos'])
    assert.ok(screen.includes(label), label);
  // Horizonte: 20/22 em verde, 19/22 em âmbar, 62% medido, 4 cards vencidos, IDP 0,93 atenção, 4 checklists.
  assert.match(screen, /dsh-tag good[^>]*>20\/22/);
  assert.match(screen, /dsh-tag warn[^>]*>19\/22/);
  assert.match(screen, /dsh-tag bad[^>]*>0\/22/);
  assert.match(screen, /62%/);
  assert.match(screen, /dsh-tag warn[^>]*>0,93/);
  assert.match(screen, /dsh-tag bad[^>]*>0,81/);
  assert.match(screen, /dsh-tag good[^>]*>1,02/);
  // Sempre cor e texto: a faixa vai escrita para o leitor de tela.
  assert.match(screen, /\(faltam dias\)/);
  assert.match(screen, /\(atenção\)/);
  // Linha "Todas": 304, 82/88, 52/88, 61%, 12 de 49.
  assert.match(screen, /Consolidado/);
  assert.match(screen, />304</);
  assert.match(screen, /82\/88/);
  assert.match(screen, /52\/88/);
  assert.match(screen, /61%/);
  // "—" com o motivo onde a obra não usa o módulo.
  assert.match(screen, /A obra não tem equipamento no checklist\./);

  const paperBase = render(createElement(ComparisonTable, { data, modules, variant: 'paper', subset: 'base' }));
  assert.ok(!paperBase.includes('Efetivo médio'));
  assert.ok(paperBase.includes('Estado'));
  const paperExtras = render(createElement(ComparisonTable, { data, modules, variant: 'paper', subset: 'extras' }));
  assert.ok(paperExtras.includes('Efetivo médio') && paperExtras.includes('Cards vencidos'));
  assert.ok(!paperExtras.includes('Estado'));
  assert.ok(paperExtras.includes('Horizonte'));
});

test('quadros por módulo renderizam com os números de exemplo', () => {
  const data = aggregatePortfolio({ period: october, rows: rows(), shown: ALL });
  const t = data.totals;

  const crew = render(createElement(HeadcountRows, { rows: data.rows, total: t.headcount }));
  assert.match(crew, /Horizonte/);
  assert.match(crew, /<b>84<\/b> por dia/);
  assert.match(crew, /71% empreit\./);
  assert.match(crew, /20\/22 dias · em dia/);
  assert.match(crew, /18\/22 dias · faltam dias/);
  assert.match(crew, /faltaram 29\/10, 30\/10/);
  assert.match(crew, /<b>304<\/b> por dia/);
  assert.match(crew, /empreiteiros/);

  const prod = render(createElement(ProductionRows, { rows: data.rows, total: t.production }));
  assert.match(prod, /<b>62%<\/b> medido · 146 lanç\./);
  assert.match(prod, /nenhum lançamento no período/);
  assert.match(prod, /0\/22 dias · abaixo de 70%/);
  assert.match(prod, /<b>61%<\/b> medido · 296 lanç\./);

  const services = render(createElement(ServicesTable, { services: data.services }));
  assert.match(services, /Alvenaria de vedação/);
  assert.match(services, /m²\/Hd/);
  assert.match(services, /8,4/);
  assert.match(services, /6,0/);
  assert.match(services, /7,6/);
  assert.match(render(createElement(ServicesTable, { services: { works: [], rows: [] } })), /Nenhum serviço medido em mais de uma obra/);

  const cards = render(createElement(RestrictionRows, { rows: data.rows, total: t.restrictions }));
  assert.match(cards, /23 cards em aberto/);
  assert.match(cards, /<b>4<\/b> vencidos/);
  assert.match(cards, /<b>3<\/b> começo atrasado/);
  assert.match(cards, /11 concluídos, 9 criados/);
  assert.match(cards, /<b>12<\/b> vencidos/);
  const owners = render(createElement(CardOwnersList, { owners: data.cardOwners }));
  assert.match(owners, /Carla/);
  assert.match(owners, /HRZ 3\/8 · JRD 1\/2/);

  const idp = render(createElement(IdpRows, { rows: data.rows }));
  assert.match(idp, /<b>41%<\/b> × 44%/);
  assert.match(idp, /IDP 0,93 · atenção/);
  assert.match(idp, /IDP 0,81 · atrasado/);
  assert.match(idp, /IDP 1,02 · em dia/);
  assert.match(idp, /peso por custo/);
  assert.doesNotMatch(idp, /R\$/);
  const legal = render(createElement(LegalizationRows, { rows: data.rows }));
  assert.match(legal, /9\/31/);
  assert.match(legal, /<b>2<\/b> atrasadas/);
  assert.match(legal, /Próximo marco: Vistoria do Corpo de Bombeiros, 18\/11/);

  const check = render(createElement(ChecklistRows, { rows: data.rows, total: t.checklist }));
  assert.match(check, /14 equipamentos/);
  assert.match(check, /17\/21/);
  assert.match(check, /<b>4<\/b> vencidos/);
  assert.match(check, /<b>6<\/b> NC/);
  assert.match(check, /vencidos hoje: Betoneira 02 \(diário\) e mais 3/);
  assert.match(check, /<b>5<\/b> vencidos/);

  // Nenhuma obra com o módulo: o quadro diz isso em vez de ficar vazio.
  assert.match(render(createElement(HeadcountRows, { rows: [], total: t.headcount })), /Nenhuma obra com lançamento no histograma/);
  assert.match(render(createElement(ChecklistRows, { rows: [], total: t.checklist })), /Nenhuma obra com equipamento no checklist/);
});

test('servidor (Claudia): composePortfolio com a resposta da rota dos quadros novos, e o texto', async () => {
  const planning = await getPlanning(new MockPlanningRepository(createMockData()), '2026-11-04');
  const works = planning.data.works;
  const access = { developer: true, modules: [] as string[] };
  const range = portfolioRange({ planning, works });
  assert.ok(range && range.start <= range.end && range.today === '2026-11-04');
  const extras: DashboardExtrasResponse = {
    range: range!,
    works: works.map((w, index) => ({
      workId: w.id,
      headcount: index === 0 ? { kind: 'ready', data: headcount(84, 20) } : { kind: 'absent' },
      production: index === 0 ? { kind: 'ready', data: production(146, 91, 19) } : { kind: 'absent' },
      restrictions: index === 0 ? { kind: 'ready', data: restrictions(23, 4) } : { kind: 'absent' },
      lob: index === 0 ? { kind: 'ready', data: lob(0.93) } : { kind: 'absent' },
      checklist: index === 0 ? { kind: 'ready', data: checklist(4, 21) } : { kind: 'absent' },
    })),
  };
  const composed = composePortfolio({ planning, works, extras, ...access });
  const first = composed.rows.find(r => r.work.id === works[0].id)!;
  assert.equal(first.headcount?.dailyAverage, 84);
  assert.equal(first.balance?.lob?.idp, 0.93);
  assert.equal(first.status.checklist.kind, 'ready');
  assert.equal(composed.totals.restrictions.overdue, 4);
  const said = portfolioText(composed);
  assert.match(said, /Histograma: efetivo médio 84 por dia útil, dias lançados 20\/22/);
  assert.match(said, /Produtividade: dias lançados 19\/22, produção medida 62%/);
  assert.match(said, /Quadro de Restrições: em aberto 23, vencidos 4, começo atrasado 3/);
  assert.match(said, /IDP 0,93 \(atenção\)/);
  assert.match(said, /Checklist de equipamentos: vencidos hoje 4 de 21 \(17 em dia\)/);
  assert.doesNotMatch(said, /R\$/);

  // Leitura falhou: os cinco quadros ficam indisponíveis, com a mensagem; sem leitura, somem.
  const failed = composePortfolio({ planning, works, extras: { error: 'Fora do ar.' }, ...access });
  assert.deepEqual(
    failed.unavailable.filter(item => EXTRA_ROUTE_MODULES.includes(item.module)).map(item => item.message),
    EXTRA_ROUTE_MODULES.map(() => 'Fora do ar.'),
  );
  const none = composePortfolio({ planning, works, ...access });
  assert.ok(none.rows.every(r => r.status.histograma.kind === 'hidden' && !r.headcount));
});

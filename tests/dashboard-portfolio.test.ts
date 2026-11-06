import test from 'node:test';
import assert from 'node:assert/strict';
import type { WeeklyCommitment } from '../src/domain/entities';
import { addDays } from '../src/domain/validation';
import type { DashboardModule, Segment } from '../src/modules/dashboard/model';
import { resolvePeriod, type PeriodContext } from '../src/modules/dashboard/period';
import type { BucketPpc } from '../src/modules/dashboard/period-views';
import type { LongTermPanelData } from '../src/modules/dashboard/long-term-panel';
import type { MediumTermPanelData } from '../src/modules/dashboard/medium-term-panel';
import type { ShortTermPanelData } from '../src/modules/dashboard/short-term-panel';
import type { TerminalityPanelData } from '../src/modules/dashboard/terminality-panel';
import type { WagonsPanelData } from '../src/modules/dashboard/wagons-panel';
import { aggregatePortfolio, periodPhrase, previousPhrase } from '../src/modules/dashboard/portfolio/aggregate';
import { extractRow, ppcTone, workState, type PortfolioWorkInput } from '../src/modules/dashboard/portfolio/extract';
import type {
  PortfolioCellStatus,
  PortfolioLongTerm,
  PortfolioMedium,
  PortfolioRow,
  PortfolioSafety,
  PortfolioShort,
  PortfolioTerminality,
  PortfolioWagons,
  PortfolioWork,
} from '../src/modules/dashboard/portfolio/types';

// 04/11/2026 é uma quarta-feira: a semana atual começa em 02/11. Outubro de 2026 vai da semana de 05/10 à de
// 26/10 e termina no sábado 31/10; o anterior é setembro; a série vai de agosto (primeira semana com dado) a outubro.
const ctx: PeriodContext = { currentWeek: '2026-11-02', since: '2026-08-03', anchorWeek: '2026-10-26' };
const october = resolvePeriod({ scale: 'mes', key: '2026-10' }, ctx);
const ALL = new Set<DashboardModule>(['longo-prazo', 'vagoes', 'medio-prazo', 'curto-prazo', 'terminalidade']);

const text = (segments: Segment[]) => segments.map(s => s.text).join('');
const strong = (segments: Segment[]) => segments.filter(s => s.strong).map(s => s.text);
const work = (id: string, name: string, code = id.toUpperCase()): PortfolioWork => ({ id, name, code });

function bucket(key: string, planned: number, fulfilled: number, extra: Partial<BucketPpc> = {}): BucketPpc {
  return {
    key,
    label: key,
    short: key,
    start: '',
    end: '',
    planned,
    fulfilled,
    closedWeeks: planned ? 1 : 0,
    openWeeks: 0,
    pending: 0,
    ...(planned ? { percent: (fulfilled / planned) * 100 } : {}),
    ...extra,
  };
}
function short(planned: number, fulfilled: number, over: Partial<PortfolioShort> = {}): PortfolioShort {
  const current = bucket('2026-10', planned, fulfilled);
  return {
    current,
    overall: { planned: 1000, fulfilled: 750, closedWeeks: 20, percent: 75 },
    early: false,
    series: [current],
    causes: [],
    companies: [],
    ...over,
  };
}
interface Blocks {
  firstWeek?: string;
  short?: PortfolioShort;
  longTerm?: PortfolioLongTerm;
  wagons?: PortfolioWagons;
  medium?: PortfolioMedium;
  terminality?: PortfolioTerminality;
  safety?: PortfolioSafety;
}
/** Uma linha do comparativo montada à mão: o módulo presente fica `ready`, o ausente `absent`. */
function row(w: PortfolioWork, blocks: Blocks): PortfolioRow {
  const cell = (present: unknown): PortfolioCellStatus => (present ? { kind: 'ready' } : { kind: 'absent', reason: 'sem dado' });
  const { state, label } = workState(blocks);
  return {
    work: w,
    ...blocks,
    state,
    stateLabel: label,
    status: {
      'longo-prazo': cell(blocks.longTerm),
      vagoes: cell(blocks.wagons),
      'medio-prazo': cell(blocks.medium),
      'curto-prazo': cell(blocks.short),
      terminalidade: cell(blocks.terminality),
      seguranca: cell(blocks.safety),
    },
  };
}
const wagons = (taktOverdue: number, restrictionsOverdue: number): PortfolioWagons => ({
  total: 10,
  byStatus: [],
  taktOverdue,
  restrictionsOverdue,
  restrictionsResolved: 1,
  openDebts: 0,
});
const longTerm = (measured: number, planned: number): PortfolioLongTerm => ({
  measured,
  planned,
  delta: Math.round(measured) - Math.round(planned),
  plannedGain: 3,
  plannedSource: 'baseline',
});
const terminality = (open: number, openAtStart: number, over: Partial<PortfolioTerminality> = {}): PortfolioTerminality => ({
  open,
  openAtStart,
  opened: 4,
  resolved: 2,
  percentLabel: '50%',
  openByContractor: [],
  ...over,
});

// ─── aggregate ──────────────────────────────────────────────────────────────────────────────────────────

const horizonte = work('hrz', 'Horizonte');
const mirante = work('mrt', 'Mirante');
const jardins = work('jds', 'Jardins');

test('o consolidado é Σ cumpridos ÷ Σ assumidos, e a seta compara valores arredondados (regra 7)', () => {
  // Horizonte 640/800 (80%) e Mirante 64/200 (32%): a soma dá 704/1000 = 70,4%, não a média 56%. O anterior,
  // 696/1000 = 69,6%: arredondados, 70% e 70%, então a seta é 0, embora a diferença crua seja 0,8.
  const data = aggregatePortfolio({
    period: october,
    rows: [
      row(horizonte, { short: short(800, 640, { previous: bucket('2026-09', 800, 600) }) }),
      row(mirante, { short: short(200, 64, { previous: bucket('2026-09', 200, 96) }) }),
    ],
    shown: ALL,
  });
  assert.equal(data.totals.short.planned, 1000);
  assert.equal(data.totals.short.fulfilled, 704);
  assert.ok(Math.abs(data.totals.short.percent! - 70.4) < 1e-9);
  assert.ok(Math.abs(data.totals.short.previousPercent! - 69.6) < 1e-9);
  assert.equal(data.totals.short.delta, 0);
  assert.equal(data.totals.short.withPpc, 2);
  assert.deepEqual(data.totals.short.below70, [mirante]);
  const main = data.kpis[0];
  assert.equal(main.label, 'PPC das obras');
  assert.equal(main.main, true);
  assert.equal(main.value, '70%');
  assert.deepEqual(main.tag, { text: '= 0 p.p.', tone: 'neutral' });
  assert.equal(main.hint, '704 de 1.000 compromissos · 2 obras');
  assert.match(
    text(data.sentence),
    /^Em outubro de 2026, as 2 obras com semana apurada cumpriram 70% do que assumiram \(704 de 1\.000 compromissos\), igual ao PPC de setembro\./,
  );
});

test('obra em início fica sem posição; a posição é pelo PPC do período entre as demais (regra 11)', () => {
  const data = aggregatePortfolio({
    period: october,
    rows: [
      row(mirante, { short: short(100, 62) }),
      row(jardins, { short: short(20, 19, { early: true, overall: { planned: 40, fulfilled: 38, closedWeeks: 2, percent: 95 } }) }),
      row(horizonte, { short: short(100, 85) }),
    ],
    shown: ALL,
  });
  // As linhas saem na ordem do nome, cada uma com a sua posição.
  assert.deepEqual(
    data.rows.map(r => [r.work.name, r.short?.position]),
    [
      ['Horizonte', 1],
      ['Jardins', undefined],
      ['Mirante', 2],
    ],
  );
  const sentence = text(data.sentence);
  assert.match(sentence, /A melhor foi Horizonte \(85%\) e a pior Mirante \(62%\), abaixo de 70%\./);
  assert.match(sentence, /Jardins ainda está em início e fica fora da comparação\./);
  assert.ok(strong(data.sentence).includes('Horizonte (85%)'));
});

test('empate exato divide a posição, como o ranking do fechamento', () => {
  const data = aggregatePortfolio({
    period: october,
    rows: [row(horizonte, { short: short(100, 80) }), row(jardins, { short: short(50, 40) }), row(mirante, { short: short(100, 70) })],
    shown: ALL,
  });
  assert.deepEqual(
    data.rows.map(r => r.short?.position),
    [1, 1, 3],
  );
});

test('obra que só começa depois do período vai para notStarted; sem linha nenhuma fica (regra 10)', () => {
  const nova = work('nva', 'Nova');
  const semLinha = work('sl', 'Sem Linha');
  const data = aggregatePortfolio({
    period: october,
    rows: [
      row(horizonte, { firstWeek: '2025-03-03', short: short(100, 80) }),
      row(nova, { firstWeek: '2026-11-02', terminality: terminality(3, 0) }),
      row(semLinha, { wagons: wagons(1, 0) }),
    ],
    shown: ALL,
  });
  assert.deepEqual(data.notStarted, [nova]);
  assert.deepEqual(
    data.rows.map(r => r.work.name),
    ['Horizonte', 'Sem Linha'],
  );
  assert.equal(data.totals.works, 2);
  // A obra que começou depois não soma em nada: nem na terminalidade, que ela já tinha.
  assert.equal(data.totals.terminality.works, 0);
  assert.deepEqual(data.noData['curto-prazo'], [semLinha]);
  assert.deepEqual(data.noData.vagoes, [horizonte]);
});

test('Pareto somando as obras: as causas até 80% e a obra que mais contribui (regra 11)', () => {
  const data = aggregatePortfolio({
    period: october,
    rows: [
      row(horizonte, {
        short: short(100, 80, {
          causes: [
            { cause: 'Falta de Mão de Obra', total: 5 },
            { cause: 'Chuva', total: 2 },
          ],
        }),
      }),
      row(mirante, {
        short: short(100, 80, {
          causes: [
            { cause: 'Falta de Mão de Obra', total: 1 },
            { cause: 'Falta de Material', total: 2 },
          ],
        }),
      }),
    ],
    shown: ALL,
  });
  assert.equal(data.pareto.failures, 10);
  // Mão de obra 6 (60%), depois Chuva e Material empatadas com 2, pelo nome: Chuva alcança 80% e é a última vital.
  assert.deepEqual(
    data.pareto.rows.map(r => [r.cause, r.total, Math.round(r.accumulated), r.vital]),
    [
      ['Falta de Mão de Obra', 6, 60, true],
      ['Chuva', 2, 80, true],
      ['Falta de Material', 2, 100, false],
    ],
  );
  const top = data.pareto.rows[0].top;
  assert.equal(top.work, horizonte);
  assert.equal(top.total, 5);
  assert.equal(Math.round(top.share), 83);
  assert.equal(data.pareto.rows[2].top.work, mirante);
});

test('empresas: só as que têm linhas em duas ou mais obras, pareadas sem acento nem caixa (regra 11)', () => {
  const data = aggregatePortfolio({
    period: october,
    rows: [
      row(mirante, {
        short: short(100, 80, {
          companies: [
            { name: 'HIDROTEC', key: 'hidrotec', planned: 30, fulfilled: 15 },
            { name: 'Gesso Real', key: 'gesso real', planned: 12, fulfilled: 12 },
          ],
        }),
      }),
      row(horizonte, {
        short: short(100, 80, {
          companies: [
            { name: 'Hidrotec', key: 'hidrotec', planned: 10, fulfilled: 8 },
            { name: 'Solo Forte', key: 'solo forte', planned: 5, fulfilled: 5 },
          ],
        }),
      }),
      row(jardins, { short: short(100, 80, { companies: [{ name: 'Solo Forte', key: 'solo forte', planned: 20, fulfilled: 10 }] }) }),
    ],
    shown: ALL,
  });
  assert.deepEqual(
    data.companies.rows.map(r => [r.name, r.total.planned, r.total.fulfilled, Object.keys(r.byWork).sort()]),
    [
      ['HIDROTEC', 40, 23, ['hrz', 'mrt']],
      ['Solo Forte', 25, 15, ['hrz', 'jds']],
    ],
  );
  assert.equal(data.companies.rows[0].byWork.hrz.percent, 80);
  assert.equal(data.companies.rows[0].byWork.mrt.percent, 50);
  assert.ok(Math.abs(data.companies.rows[0].total.percent! - 57.5) < 1e-9);
  // Gesso Real só está no Mirante: fica de fora. As obras saem na ordem das linhas.
  assert.deepEqual(data.companies.works, [horizonte, jardins, mirante]);
});

test('responsáveis terceiros somando as obras, até 6 (regra 12)', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ label: `Empresa ${i + 1}`, count: 1 }));
  const data = aggregatePortfolio({
    period: october,
    rows: [
      row(horizonte, {
        terminality: terminality(9, 9, {
          openByContractor: [{ label: 'Elétrica Silva', count: 5 }, { label: 'Sem responsável', count: 2, none: true }, ...many],
        }),
      }),
      row(mirante, {
        terminality: terminality(12, 12, {
          openByContractor: [
            { label: 'Pintura Real', count: 9 },
            { label: 'ELETRICA SILVA', count: 3 },
          ],
        }),
      }),
    ],
    shown: ALL,
  });
  const rows = data.responsibles.rows;
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], { label: 'Pintura Real', total: 9, byWork: [{ work: mirante, count: 9 }] });
  assert.equal(rows[1].label, 'Elétrica Silva');
  assert.equal(rows[1].total, 8);
  assert.deepEqual(
    rows[1].byWork.map(cell => [cell.work.code, cell.count]),
    [
      ['HRZ', 5],
      ['MRT', 3],
    ],
  );
  assert.deepEqual(rows[2], { label: 'Sem responsável', total: 2, none: true, byWork: [{ work: horizonte, count: 2 }] });
});

const fullRows = () => [
  row(horizonte, {
    short: short(100, 85, { previous: bucket('2026-09', 100, 80) }),
    longTerm: longTerm(42, 40),
    wagons: wagons(2, 1),
    medium: {
      planName: 'Out',
      planMonth: '2026-10',
      planMonthLabel: 'outubro de 2026',
      done: 1,
      inProgress: 1,
      notStarted: 1,
      late: 0,
      overloaded: 0,
    },
    terminality: terminality(30, 34, { opened: 6, resolved: 10, averageDaysToResolve: 4 }),
  }),
  row(mirante, {
    short: short(100, 55, { previous: bucket('2026-09', 100, 60) }),
    longTerm: longTerm(30, 45),
    wagons: wagons(0, 0),
    terminality: terminality(20, 10, { opened: 12, resolved: 2, averageDaysToResolve: 10 }),
  }),
];

test('seis cartões na ordem do modelo, coerentes com a frase (regra 13)', () => {
  const data = aggregatePortfolio({ period: october, rows: fullRows(), shown: ALL });
  assert.deepEqual(
    data.kpis.map(k => [k.label, k.value, k.module]),
    [
      ['PPC das obras', '70%', 'curto-prazo'],
      ['Obras abaixo de 70%', '1 de 2', 'curto-prazo'],
      ['Atrás no físico', '1 de 2', 'longo-prazo'],
      ['Takt vencido', '2', 'vagoes'],
      ['Restrições vencidas', '1', 'vagoes'],
      ['Pendências em aberto', '50', 'terminalidade'],
    ],
  );
  assert.equal(data.kpis[1].hint, 'MRT 55%');
  assert.equal(data.kpis[2].hint, 'Pior: MRT, −15 p.p. em 31/10');
  assert.equal(data.kpis[3].hint, '2 vagões em 1 de 2 obras, em 31/10');
  assert.equal(data.kpis[5].hint, '18 abertas e 12 resolvidas no período · 2 obras');
  assert.deepEqual(data.kpis[5].tag, { text: '▲ 6', tone: 'bad' });
  // 140/200 no anterior e 140/200 agora: 70% contra 70%.
  assert.deepEqual(data.kpis[0].tag, { text: '= 0 p.p.', tone: 'neutral' });
  // Tempo médio ponderado pelas resolvidas: (4 × 10 + 10 × 2) ÷ 12 = 5.
  assert.equal(data.totals.terminality.averageDaysToResolve, 5);

  // A frase usa os mesmos números já arredondados dos cartões.
  const bold = strong(data.sentence);
  assert.ok(bold.includes(data.kpis[0].value));
  assert.ok(bold.includes(data.kpis[2].value));
  assert.ok(bold.includes('50 pendências em aberto'));
  const sentence = text(data.sentence);
  assert.match(sentence, /No físico, 1 de 2 obras está atrás do planejado em 31\/10\./);
  assert.match(sentence, /A terminalidade fecha o período com 50 pendências em aberto \(6 a mais que no início\)\./);
});

test('cartões e frase respeitam os quadros escondidos e os módulos sem acesso (regra 13)', () => {
  const noLongNoWagons = aggregatePortfolio({
    period: october,
    rows: fullRows(),
    shown: new Set<DashboardModule>(['curto-prazo', 'terminalidade', 'medio-prazo']),
  });
  assert.deepEqual(
    noLongNoWagons.kpis.map(k => k.label),
    ['PPC das obras', 'Obras abaixo de 70%', 'Pendências em aberto'],
  );
  assert.doesNotMatch(text(noLongNoWagons.sentence), /físico/);

  const noShort = aggregatePortfolio({ period: october, rows: fullRows(), shown: new Set<DashboardModule>(['longo-prazo', 'vagoes']) });
  assert.deepEqual(
    noShort.kpis.map(k => [k.label, !!k.main]),
    [
      ['Atrás no físico', true],
      ['Takt vencido', false],
      ['Restrições vencidas', false],
    ],
  );
  const sentence = text(noShort.sentence);
  assert.match(sentence, /^Em outubro de 2026, o comparativo reúne 2 obras\./);
  assert.doesNotMatch(sentence, /PPC|cumpri|terminalidade/);
});

test('sem semana apurada, o PPC sai como "—" e a frase diz isso', () => {
  const open = bucket('2026-10', 0, 0, { openWeeks: 1, pending: 10 });
  const data = aggregatePortfolio({
    period: october,
    rows: [row(horizonte, { short: short(0, 0, { current: open, series: [open] }) })],
    shown: new Set<DashboardModule>(['curto-prazo']),
  });
  assert.equal(data.kpis[0].value, '—');
  assert.equal(data.kpis[1].value, '—');
  assert.equal(text(data.sentence), 'Em outubro de 2026, nenhuma obra tem semana apurada ainda.');
  // A coluna em aberto aparece no mapa de calor (tem linha), sem percentual.
  assert.equal(data.heat.rows[0].cells.at(-1)?.openWeeks, 1);
  assert.equal(data.heat.total.at(-1)?.percent, undefined);
});

test('mapa de calor: colunas da série, célula vazia sem linha, linha "todas" somando linhas', () => {
  const sep = (planned: number, fulfilled: number) => bucket('2026-09', planned, fulfilled);
  const oct = (planned: number, fulfilled: number) => bucket('2026-10', planned, fulfilled);
  const data = aggregatePortfolio({
    period: october,
    rows: [
      row(horizonte, { short: short(100, 90, { series: [sep(100, 70), oct(100, 90)] }) }),
      row(mirante, { short: short(300, 150, { series: [bucket('2026-09', 0, 0), oct(300, 150)] }) }),
    ],
    shown: ALL,
  });
  assert.deepEqual(
    data.heat.buckets.map(b => [b.key, b.analyzed]),
    [
      ['2026-08', false],
      ['2026-09', false],
      ['2026-10', true],
    ],
  );
  assert.equal(data.heat.rows[0].cells[0], undefined);
  assert.equal(data.heat.rows[1].cells[1], undefined);
  assert.equal(data.heat.total[2].planned, 400);
  assert.equal(data.heat.total[2].percent, 60);
  assert.equal(data.heat.total[1].percent, 70);
  assert.equal(data.heat.total[0].percent, undefined);
});

test('frases do período: parcial, trimestre, personalizado e o anterior', () => {
  const quarter = resolvePeriod({ scale: 'trimestre', key: '2026-T4' }, ctx);
  assert.equal(periodPhrase(quarter), 'No 4º trimestre de 2026');
  assert.equal(previousPhrase(quarter), 'do 3º trimestre');
  const january = resolvePeriod({ scale: 'mes', key: '2026-01' }, { ...ctx, since: '2025-06-02' });
  assert.equal(previousPhrase(january), 'de dezembro de 2025');
  const custom = resolvePeriod({ scale: 'personalizado', from: '2026-06-01', to: '2026-10-31' }, ctx);
  assert.equal(periodPhrase(custom), 'De 01/06/2026 a 31/10/2026');
  assert.equal(previousPhrase(custom), 'do intervalo anterior de mesmo tamanho');
  // Novembro está em andamento: só a semana atual, nenhuma das 5 do mês encerrada.
  const november = resolvePeriod({ scale: 'mes', key: '2026-11' }, ctx);
  const data = aggregatePortfolio({ period: november, rows: [], shown: ALL });
  assert.equal(text(data.sentence), 'Em novembro de 2026 (parcial: 0 de 5 semanas encerradas), nenhuma obra está no comparativo.');
});

// ─── extract ────────────────────────────────────────────────────────────────────────────────────────────

test('estado da obra é o pior entre os indicadores (regra 10)', () => {
  assert.equal(ppcTone(79.4), 'neutral');
  assert.equal(ppcTone(79.6), 'good');
  assert.equal(ppcTone(69.6), 'neutral');
  assert.equal(ppcTone(69.4), 'warn');
  assert.equal(ppcTone(59.4), 'bad');
  // 70–79 conta como bom para o estado.
  assert.deepEqual(workState({ short: short(100, 75) }), { state: 'good', label: 'Em dia' });
  assert.deepEqual(workState({ short: short(100, 65) }), { state: 'warn', label: 'Atenção' });
  assert.deepEqual(workState({ short: short(100, 85), longTerm: longTerm(30, 42) }), { state: 'bad', label: 'Crítico' });
  assert.deepEqual(workState({ short: short(100, 85), longTerm: longTerm(38, 42) }), { state: 'warn', label: 'Atenção' });
  assert.deepEqual(workState({ short: short(100, 85), wagons: wagons(1, 0) }), { state: 'warn', label: 'Atenção' });
  assert.deepEqual(workState({ short: short(100, 85), wagons: wagons(0, 1) }), { state: 'bad', label: 'Crítico' });
  assert.deepEqual(workState({ wagons: wagons(0, 0) }), { state: 'good', label: 'Em dia' });
  assert.deepEqual(workState({}), { state: 'neutral', label: 'Sem apuração' });
  // Longo prazo sem medição não é indicador.
  assert.deepEqual(workState({ longTerm: { planned: 40, plannedGain: 2, plannedSource: 'plan' } }), {
    state: 'neutral',
    label: 'Sem apuração',
  });
});

let seq = 0;
const line = (weekStart: string, supplier: string, fulfilled?: boolean): WeeklyCommitment => ({
  id: `c${++seq}`,
  workId: 'hrz',
  name: 'Alvenaria',
  supplier,
  weekStart,
  weekEnd: addDays(weekStart, 5),
  responsibleId: 'u',
  startDate: weekStart,
  endDate: weekStart,
  createdAt: '',
  updatedAt: '',
  ...(fulfilled === undefined ? {} : { fulfilled }),
});

/** Só o que `extract` lê de cada quadro, montado à mão. */
const shortPanel = (overall: { planned: number; fulfilled: number; closedWeeks: number; percent?: number }) =>
  ({
    whole: { overall },
    period: {
      current: bucket('2026-10', 1000, 704),
      previous: bucket('2026-09', 1000, 696),
      series: [bucket('2026-10', 1000, 704)],
      closedInSeries: 1,
      causes: [{ cause: 'Chuva', total: 3, share: 100, accumulated: 100 }],
      failures: 3,
      uncaused: 0,
    },
  }) as unknown as ShortTermPanelData;

function input(over: Partial<PortfolioWorkInput>): PortfolioWorkInput {
  return {
    work: horizonte,
    commitments: [],
    teams: [],
    short: { status: 'absent' },
    longTerm: { status: 'absent' },
    wagons: { status: 'absent' },
    medium: { status: 'absent' },
    terminality: { status: 'absent' },
    ...over,
  };
}

test('extract: curto prazo do período, PPC geral da obra inteira, empresas das semanas apuradas', () => {
  const commitments = [
    // 05/10 apurada: Hidrotec 1 de 2.
    line('2026-10-05', 'Hidrotec', true),
    line('2026-10-05', 'Hidrotec', false),
    // 12/10 em aberto (uma linha sem Status): sai inteira das empresas.
    line('2026-10-12', 'Hidrotec', true),
    line('2026-10-12', 'Solo Forte'),
    // Setembro fica fora do período.
    line('2026-09-28', 'Solo Forte', true),
  ];
  const result = extractRow(
    input({
      firstWeek: '2026-09-28',
      commitments,
      short: { status: 'ready', data: shortPanel({ planned: 40, fulfilled: 30, closedWeeks: 3, percent: 75 }) },
    }),
    october,
  );
  assert.equal(result.firstWeek, '2026-09-28');
  assert.deepEqual(result.status['curto-prazo'], { kind: 'ready' });
  const s = result.short!;
  assert.equal(s.current.planned, 1000);
  assert.equal(s.delta, 0);
  assert.deepEqual(s.overall, { planned: 40, fulfilled: 30, closedWeeks: 3, percent: 75 });
  assert.equal(s.early, true);
  assert.equal(s.position, undefined);
  assert.deepEqual(s.causes, [{ cause: 'Chuva', total: 3 }]);
  assert.deepEqual(s.companies, [{ name: 'Hidrotec', key: 'hidrotec', planned: 2, fulfilled: 1 }]);
  // PPC de 70,4% conta como bom para o estado.
  assert.equal(result.state, 'good');
});

test('extract: com 4 semanas apuradas a obra sai de "em início"', () => {
  const result = extractRow(
    input({
      commitments: [line('2026-10-05', 'X', true)],
      short: { status: 'ready', data: shortPanel({ planned: 80, fulfilled: 60, closedWeeks: 4, percent: 75 }) },
    }),
    october,
  );
  assert.equal(result.short!.early, false);
});

test('extract: retratos e fluxos dos outros quadros', () => {
  const long = {
    measured: 41.6,
    planned: 45.2,
    delta: -3,
    plannedSource: 'baseline',
    lastMeasurement: '2026-10-28',
    span: { start: '2025-01-06', finish: '2027-06-30', months: 30, days: 905, slip: 12 },
    period: { start: '2026-10-05', end: '2026-10-31', measuredAtStart: 38, plannedAtStart: 41, measuredGain: 4, plannedGain: 4 },
  } as unknown as LongTermPanelData;
  const wagonsData = {
    total: 12,
    byStatus: [{ status: 'terminal', label: 'Terminal', value: 3, color: '#1baf7a' }],
    overdue: { count: 2, numbers: [3, 4] },
    openDebts: 1,
    restrictions: { overdue: 1 },
    period: { start: '2026-10-05', end: '2026-10-31', restrictionsResolved: 5, restrictionsCreated: 2 },
  } as unknown as WagonsPanelData;
  const mediumData = {
    plan: { id: 'p', name: 'Plano de outubro', month: '2026-10', monthLabel: 'outubro de 2026', taskCount: 9 },
    done: 3,
    inProgress: 4,
    notStarted: 2,
    late: { count: 2, inProgress: 1, samples: [] },
    baseline: { planFinishVariance: 6 },
    overloaded: { count: 1, names: ['X'] },
  } as unknown as MediumTermPanelData;
  const terminalityData = {
    open: 14,
    percentLabel: '72%',
    period: {
      start: '2026-10-05',
      end: '2026-10-31',
      opened: 9,
      resolved: 7,
      openAtStart: 12,
      averageDaysToResolve: 6.5,
      openByContractor: [{ label: 'Elétrica Silva', count: 14 }],
      buckets: [],
    },
  } as unknown as TerminalityPanelData;
  const result = extractRow(
    input({
      longTerm: { status: 'ready', data: long },
      wagons: { status: 'ready', data: wagonsData },
      medium: { status: 'ready', data: mediumData },
      terminality: { status: 'ready', data: terminalityData },
    }),
    october,
  );
  assert.deepEqual(result.longTerm, {
    measured: 41.6,
    planned: 45.2,
    delta: -3,
    measuredGain: 4,
    plannedGain: 4,
    lastMeasurement: '2026-10-28',
    slip: 12,
    plannedSource: 'baseline',
  });
  assert.deepEqual(result.wagons, {
    total: 12,
    byStatus: wagonsData.byStatus,
    taktOverdue: 2,
    restrictionsOverdue: 1,
    restrictionsResolved: 5,
    openDebts: 1,
  });
  assert.deepEqual(result.medium, {
    planName: 'Plano de outubro',
    planMonth: '2026-10',
    planMonthLabel: 'outubro de 2026',
    done: 3,
    inProgress: 4,
    notStarted: 2,
    late: 2,
    finishVariance: 6,
    overloaded: 1,
  });
  assert.deepEqual(result.terminality, {
    open: 14,
    openAtStart: 12,
    opened: 9,
    resolved: 7,
    percentLabel: '72%',
    averageDaysToResolve: 6.5,
    openByContractor: [{ label: 'Elétrica Silva', count: 14 }],
  });
  // Restrição vencida pesa mais que o físico atrás e o takt vencido.
  assert.equal(result.state, 'bad');
  assert.equal(result.stateLabel, 'Crítico');
});

test('extract: estado de cada módulo e o motivo do "—"', () => {
  const result = extractRow(
    input({
      short: { status: 'absent' },
      longTerm: { status: 'loading' },
      wagons: { status: 'hidden' },
      medium: { status: 'error', message: 'Falhou.' },
      terminality: { status: 'absent' },
      reasons: { terminalidade: 'A terminalidade não está disponível neste ambiente.' },
    }),
    october,
  );
  assert.deepEqual(result.status, {
    'curto-prazo': { kind: 'absent', reason: 'Sem linha no curto prazo nesta obra.' },
    'longo-prazo': { kind: 'loading' },
    vagoes: { kind: 'hidden' },
    'medio-prazo': { kind: 'error', message: 'Falhou.' },
    terminalidade: { kind: 'absent', reason: 'A terminalidade não está disponível neste ambiente.' },
    // Sem `safety` na entrada (chamada antiga), a segurança fica escondida.
    seguranca: { kind: 'hidden' },
  });
  assert.equal(result.firstWeek, undefined);
  assert.equal(result.short, undefined);
  assert.equal(result.state, 'neutral');
  assert.equal(result.stateLabel, 'Sem apuração');
  const withLines = extractRow(input({ commitments: [line('2026-11-02', 'X')] }), october);
  assert.deepEqual(withLines.status['curto-prazo'], { kind: 'absent', reason: 'Sem linha no curto prazo até o fim do período.' });
});

test('URL do geral: empreiteiro se repete, como na aba 0 (05/11/2026)', async () => {
  const { parsePortfolioParams, portfolioSearchParams } = await import('../src/modules/dashboard/portfolio/params');
  const params = portfolioSearchParams({
    selection: { scale: 'mes', key: '2026-10' },
    companies: new Set(['Hidro Norte', 'Elétrica Silva']),
  });
  assert.equal(params.toString(), 'escala=mes&periodo=2026-10&empreiteiro=Hidro+Norte&empreiteiro=El%C3%A9trica+Silva');
  const parsed = parsePortfolioParams({ escala: 'mes', periodo: '2026-10', empreiteiro: ['Hidro Norte', ' ', 'Elétrica Silva'] });
  assert.deepEqual([...(parsed.companies ?? [])], ['Hidro Norte', 'Elétrica Silva']);
  assert.equal(parsePortfolioParams({}).companies, undefined);
});

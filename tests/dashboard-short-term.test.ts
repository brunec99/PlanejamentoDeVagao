import test from 'node:test';
import assert from 'node:assert/strict';
import type { NonFulfillmentCause, Team, WeeklyCommitment } from '../src/domain/entities';
import { addDays } from '../src/domain/validation';
import { MIN_RANKED_WEEKS, rankWorks, type ClosingRankingResponse, type RankingEntry } from '../src/domain/closing-ranking';
import { closingDashboard, type Segment } from '../src/modules/curto-prazo/closing-dashboard';
import { referenceOf, type DashboardFilters } from '../src/modules/dashboard/model';
import { resolvePeriod, type PeriodContext, type PeriodSelection } from '../src/modules/dashboard/period';
import {
  bucketPpc,
  buildHistory,
  buildShortTermPanel,
  periodCompanies,
  shortTermCompanies,
  shortTermSummary,
  yearsSentence,
} from '../src/modules/dashboard/short-term-panel';

let seq = 0;
const line = (over: Partial<WeeklyCommitment> & { weekStart: string }): WeeklyCommitment => ({
  id: `c${++seq}`,
  workId: 'blt',
  name: 'Alvenaria',
  supplier: '',
  weekEnd: addDays(over.weekStart, 5),
  responsibleId: 'u',
  startDate: over.weekStart,
  endDate: over.weekStart,
  createdAt: '',
  updatedAt: '',
  ...over,
});
/** Uma semana com `sim` cumpridas, as causas dadas (uma linha Não por causa; '' = Não sem causa) e `pending` sem Status. */
function week(
  weekStart: string,
  sim: number,
  causes: (NonFulfillmentCause | '')[],
  pending = 0,
  extra: Partial<WeeklyCommitment> = {},
): WeeklyCommitment[] {
  return [
    ...Array.from({ length: sim }, () => line({ weekStart, fulfilled: true, ...extra })),
    ...causes.map(cause => line({ weekStart, fulfilled: false, ...(cause ? { cause } : {}), ...extra })),
    ...Array.from({ length: pending }, () => line({ weekStart, ...extra })),
  ];
}
const repeat = <T extends string>(count: number, value: T) => Array.from({ length: count }, () => value);
const text = (segments: Segment[]) => segments.map(s => s.text).join('');
const strong = (segments: Segment[]) => segments.filter(s => s.strong).map(s => s.text);

// O cenário do painel aprovado em 30/10/2026: semanas 105 a 116, de 03/08 a 19/10/2026. A semana 1 da obra
// é 05/08/2024, para a numeração bater com a do PDF do fechamento.
const FIRST_WEEK = '2024-08-05';
const MONDAYS = Array.from({ length: 12 }, (_, i) => addDays('2026-08-03', i * 7));
const PPCS = [66, 70, 64, 68, 74, 67, 70, 75, 72, 73, 72];
const ANALYZED = MONDAYS[11];
const blentt = [
  ...MONDAYS.slice(0, 11).flatMap((monday, i) => week(monday, PPCS[i], repeat(100 - PPCS[i], 'Falta de Mão de Obra'))),
  ...week(ANALYZED, 32, [
    'Falta de Mão de Obra',
    'Falta de Mão de Obra',
    'Falta de Mão de Obra',
    'Atraso de tarefas antecedentes',
    'Atraso de tarefas antecedentes',
    'Falta de Material',
    'Falta de Material',
    'Intempéries',
    'Falha de Planejamento',
  ]),
];
const entry = (workId: string, name: string, percent: number, closedWeeks = 40): RankingEntry => ({
  workId,
  name,
  code: name.slice(0, 3).toUpperCase(),
  overall: { planned: 1000, fulfilled: percent * 10, closedWeeks, percent },
});
const ranking: ClosingRankingResponse = {
  available: true,
  week: ANALYZED,
  minWeeks: MIN_RANKED_WEEKS,
  entries: rankWorks([
    entry('ess', 'Essenza', 76),
    entry('blt', 'Blentt', 10),
    entry('atm', 'Atmos', 67),
    entry('tau', 'Tauá', 65),
    entry('brz', 'Brizz', 62),
    entry('mzn', 'Mozine', 61),
  ]),
};
const work = { id: 'blt', name: 'Blentt', code: 'BLT' };
const teams: Team[] = [{ id: 't1', workId: 'blt', company: 'Hidrotec', name: 'Equipe A', weeklyCapacity: 5, createdAt: '', updatedAt: '' }];
const ref = (weekStart: string) => referenceOf(weekStart, weekStart, FIRST_WEEK);
const noFilter = (weekStart: string): DashboardFilters => ({ week: weekStart });
const build = (
  commitments: WeeklyCommitment[],
  weekStart: string,
  filters?: Partial<DashboardFilters>,
  rk: ClosingRankingResponse | undefined = ranking,
) => buildShortTermPanel({ commitments, teams, work, ranking: rk }, ref(weekStart), { ...noFilter(weekStart), ...filters });

test('o quadro não enxerga semanas depois da analisada nem linhas de outra obra', () => {
  const later = [
    ...blentt,
    ...week(addDays(ANALYZED, 7), 0, repeat(50, 'Retrabalho')),
    ...week(ANALYZED, 0, repeat(30, 'Retrabalho'), 0, { workId: 'outra' }),
  ];
  const data = build(later, ANALYZED)!;
  assert.equal(data.weekNumber, 116);
  assert.equal(data.label(MONDAYS[0]), 105);
  assert.equal(data.closing.series.at(-1)?.weekStart, ANALYZED);
  assert.equal(
    data.closing.pareto.find(item => item.cause === 'Retrabalho'),
    undefined,
  );
  assert.equal(data.history.totalWeeks, 12);
  assert.equal(data.history.commitments, blentt.length);
  assert.equal(
    data.history.months.find(item => item.month === '2026-11'),
    undefined,
  );
});

test('sem recorte, o quadro diz os mesmos números do painel do PDF do fechamento', () => {
  const data = build(blentt, ANALYZED)!;
  const d = closingDashboard(blentt, work, ANALYZED, ranking);
  assert.equal(data.companyFiltered, false);
  assert.deepEqual(data.closing, d);
  assert.equal(data.closing, data.whole);
  assert.equal(Math.round(data.closing.current!.percent), 78);
  assert.deepEqual([data.closing.position, data.closing.ranked], [2, 6]);
  // O PPC geral desde a semana 1 é o mesmo PPC geral do painel (cumpridos ÷ assumidos das apuradas).
  assert.equal(data.history.overall, d.overall.percent);
  assert.equal(data.history.closedWeeks, d.overall.closedWeeks);
  assert.equal(data.history.firstWeek, MONDAYS[0]);
});

test('histórico por mês soma cumpridos e assumidos das semanas apuradas; a em aberto fica fora', () => {
  const lines = [
    ...week('2026-08-31', 8, ['Retrabalho', '']),
    ...week('2026-09-07', 5, repeat(5, 'Falta de Material')),
    ...week('2026-09-14', 10, []),
    ...week('2026-09-28', 3, [], 1),
    ...week('2026-10-05', 7, repeat(3, 'Intempéries')),
    ...week('2026-10-12', 0, repeat(10, 'Retrabalho')),
  ];
  const h = build(lines, '2026-10-05')!.history;
  assert.deepEqual(h.months, [
    { month: '2026-08', percent: 80, weeks: 1, planned: 10, fulfilled: 8 },
    { month: '2026-09', percent: 75, weeks: 2, planned: 20, fulfilled: 15 },
    { month: '2026-10', percent: 70, weeks: 1, planned: 10, fulfilled: 7 },
  ]);
  // Não é a média dos percentuais dos meses (75%): é 30 ÷ 40.
  assert.equal(h.overall, 75);
  assert.deepEqual([h.planned, h.fulfilled], [40, 30]);
  assert.deepEqual([h.closedWeeks, h.totalWeeks], [4, 5]);
  assert.equal(h.commitments, 44);
  assert.deepEqual([h.failures, h.failuresWithCause], [10, 9]);
  assert.equal(h.best?.month, '2026-08');
  assert.equal(h.worst?.month, '2026-10');
  assert.equal(h.firstWeek, '2026-08-31');
  assert.deepEqual(h.years, [{ year: '2026', percent: 75, weeks: 4 }]);
});

test('empate de mês vai para o mais recente, mês só com semana em aberto é omitido e os anos somam', () => {
  const lines = [
    ...week('2025-12-15', 8, ['Retrabalho', 'Retrabalho']),
    ...week('2025-12-22', 8, ['Retrabalho', 'Retrabalho']),
    ...week('2026-01-05', 8, ['Retrabalho', 'Retrabalho']),
    ...week('2026-02-02', 6, repeat(4, 'Retrabalho')),
    ...week('2026-03-02', 6, repeat(4, 'Retrabalho')),
    ...week('2026-04-06', 5, [], 1),
  ];
  const h = build(lines, '2026-04-06')!.history;
  assert.deepEqual(
    h.months.map(item => [item.month, item.percent, item.weeks]),
    [
      ['2025-12', 80, 2],
      ['2026-01', 80, 1],
      ['2026-02', 60, 1],
      ['2026-03', 60, 1],
    ],
  );
  assert.equal(h.best?.month, '2026-01');
  assert.equal(h.worst?.month, '2026-03');
  assert.deepEqual(
    h.years.map(item => [item.year, Math.round(item.percent!), item.weeks]),
    [
      ['2025', 80, 2],
      ['2026', 67, 3],
    ],
  );
  assert.deepEqual([h.closedWeeks, h.totalWeeks], [5, 6]);
  assert.equal(yearsSentence(h.years), 'Em 2026 o PPC geral é de 67%, contra 80% em 2025.');
  assert.equal(yearsSentence([{ year: '2026', percent: 75, weeks: 3 }]), 'Em 2026 o PPC geral é de 75%.');
  assert.equal(
    yearsSentence([
      { year: '2024', percent: 66, weeks: 20 },
      { year: '2025', percent: 74, weeks: 52 },
      { year: '2026', percent: 75, weeks: 45 },
    ]),
    'Em 2026 o PPC geral é de 75%, contra 74% em 2025 e 66% em 2024.',
  );
  // Ano sem semana apurada no meio fica sem percentual, mas aparece na lista e sai da frase.
  const gap = buildHistory(
    [...week('2024-11-04', 9, ['Retrabalho']), ...week('2026-01-05', 7, repeat(3, 'Retrabalho'))],
    '2026-01-05',
    '2024-11-04',
  );
  assert.deepEqual(
    gap.years.map(item => [item.year, item.percent, item.weeks]),
    [
      ['2024', 90, 1],
      ['2025', undefined, 0],
      ['2026', 70, 1],
    ],
  );
  assert.equal(yearsSentence(gap.years), 'Em 2026 o PPC geral é de 70%, contra 90% em 2024.');
  assert.equal(yearsSentence([]), '');
});

test('recorte por empreiteiro muda série, Pareto e histórico, mas não o ranking nem a obra inteira', () => {
  const hidrotec = { teamId: 't1' };
  const typed = { supplier: 'HIDROTEC ' };
  const alfa = { supplier: 'Alfa' };
  const lines = [
    ...MONDAYS.slice(0, 11).flatMap((monday, i) => [
      ...week(monday, PPCS[i], repeat(100 - PPCS[i], 'Falta de Mão de Obra'), 0, alfa),
      ...week(monday, 5, repeat(5, 'Retrabalho'), 0, hidrotec),
    ]),
    ...week(ANALYZED, 32, repeat(9, 'Falta de Material'), 0, alfa),
    ...week(ANALYZED, 9, ['Retrabalho'], 0, typed),
  ];
  const filters = { companies: new Set(['hidrotec']) };
  const data = build(lines, ANALYZED, filters)!;
  const whole = closingDashboard(lines, work, ANALYZED, ranking);
  const cut = lines.filter(row => row.teamId === 't1' || row.supplier.trim() === 'HIDROTEC');
  const expected = closingDashboard(cut, work, ANALYZED, undefined);
  assert.equal(data.companyFiltered, true);
  assert.deepEqual(data.whole, whole);
  assert.deepEqual(data.closing.series, expected.series);
  assert.deepEqual(data.closing.pareto, expected.pareto);
  assert.deepEqual(data.closing.weekCauses, expected.weekCauses);
  assert.equal(data.closing.average, expected.average);
  assert.equal(Math.round(data.closing.current!.percent), 90);
  assert.equal(data.closing.pareto[0].cause, 'Retrabalho');
  assert.equal(whole.pareto[0].cause, 'Falta de Mão de Obra');
  // Ranking, posição, média das obras e PPC geral são sempre da obra inteira.
  assert.deepEqual(data.closing.ranking, whole.ranking);
  assert.deepEqual([data.closing.position, data.closing.ranked, data.closing.mean], [whole.position, whole.ranked, whole.mean]);
  assert.deepEqual(data.closing.overall, whole.overall);
  // O histórico segue o recorte: só as linhas da Hidrotec.
  assert.equal(data.history.commitments, cut.length);
  assert.equal(data.history.overall, expected.overall.percent);
  assert.equal(data.history.closedWeeks, 12);

  // Empreiteiro sem linha: o quadro fica, vazio, porque a obra tem dado e o recorte é da pessoa.
  const empty = build(lines, ANALYZED, { companies: new Set(['Ninguém']) })!;
  assert.equal(empty.closing.series.length, 0);
  assert.equal(empty.closing.current, undefined);
  assert.deepEqual(empty.history.months, []);
  assert.deepEqual([empty.history.totalWeeks, empty.history.commitments, empty.history.overall], [0, 0, undefined]);
  assert.equal(empty.history.firstWeek, MONDAYS[0]);
  assert.equal(empty.history.best, undefined);
  assert.deepEqual(empty.whole, whole);
});

test('empreiteiros do seletor: grafias equivalentes somam numa opção e a linha sem empresa fica de fora', () => {
  const lines = [
    ...week('2026-10-05', 2, [], 0, { supplier: 'Alfa' }),
    ...week('2026-10-05', 3, [], 0, { teamId: 't1' }),
    ...week('2026-10-05', 1, [], 0, { supplier: 'HIDROTEC' }),
    ...week('2026-10-05', 2, [], 0),
  ];
  assert.deepEqual(shortTermCompanies(lines, teams), [
    { value: 'Alfa', count: 2 },
    { value: 'Hidrotec', count: 4 },
  ]);
  assert.deepEqual(shortTermCompanies([], teams), []);
});

test('sem linha até a semana analisada, o módulo não tem dado', () => {
  assert.equal(build([], ANALYZED), undefined);
  assert.equal(build(week(addDays(ANALYZED, 7), 5, []), ANALYZED), undefined);
  assert.equal(build(week(ANALYZED, 5, [], 0, { workId: 'outra' }), ANALYZED), undefined);
  // Semana analisada sem linha, mas com passado: o quadro existe e diz que a semana está vazia.
  const data = build(blentt, addDays(ANALYZED, 7))!;
  assert.equal(data.closing.current, undefined);
  assert.equal(data.weekNumber, 117);
});

test('resumo: cartão principal acima da média e a frase com o PPC geral desde a semana 1', () => {
  const data = build(blentt, ANALYZED)!;
  const { kpi, sentence } = shortTermSummary(data, ref(ANALYZED));
  assert.deepEqual(kpi, {
    module: 'curto-prazo',
    label: 'PPC da semana 116',
    value: '78%',
    tag: { text: 'acima da média', tone: 'good' },
    hint: '32 de 41 compromissos cumpridos · ▲ 6 p.p. vs semana 115',
    main: true,
  });
  const overall = Math.round(data.whole.overall.percent!);
  assert.equal(
    text(sentence),
    'A semana 116 fechou com PPC de 78%: 6 pontos acima da semana 115 e 7 acima da média das últimas 12 semanas. ' +
      `No PPC geral desde a semana 1 (${overall}% em 12 semanas apuradas), a obra está em 2º lugar entre 6 obras. ` +
      'Falta de Mão de Obra foi a principal causa da semana (3 das 9 falhas) e é também a primeira no Pareto da obra.',
  );
  assert.deepEqual(strong(sentence), ['PPC de 78%', '2º lugar entre 6 obras', 'Falta de Mão de Obra']);
});

test('resumo: semana em aberto, sem ranking, ganha o PPC geral como frase ao fim', () => {
  const lines = [
    ...MONDAYS.slice(0, 11).flatMap((monday, i) => week(monday, PPCS[i], repeat(100 - PPCS[i], 'Falta de Material'))),
    ...week(ANALYZED, 10, ['Retrabalho', 'Intempéries'], 3),
  ];
  const data = build(lines, ANALYZED, {}, { available: false, message: 'fora' })!;
  const { kpi, sentence } = shortTermSummary(data, ref(ANALYZED));
  assert.deepEqual(kpi.tag, { text: 'em aberto · 3 sem Status', tone: 'warn' });
  assert.equal(kpi.value, '67%');
  assert.equal(kpi.hint, '10 de 15 compromissos cumpridos · ▼ 5 p.p. vs semana 115');
  assert.equal(
    text(sentence),
    'A semana 116 ainda está em aberto, com 3 linhas sem Status: o PPC provisório é de 67%. ' +
      'As principais causas da semana foram Intempéries e Retrabalho, com 1 falha cada; na obra, a primeira é Falta de Material. ' +
      'Desde a semana 1, o PPC geral da obra é de 70% em 11 semanas apuradas.',
  );
  assert.ok(strong(sentence).includes('70%'));
});

test('resumo: semana igual à anterior, abaixo da média, sem semana e com recorte', () => {
  const same = [
    ...week(MONDAYS[9], 9, ['Retrabalho']),
    ...week(MONDAYS[10], 7, repeat(3, 'Retrabalho')),
    ...week(ANALYZED, 7, repeat(3, 'Retrabalho')),
  ];
  const a = shortTermSummary(build(same, ANALYZED, {}, undefined)!, ref(ANALYZED));
  assert.deepEqual(a.kpi.tag, { text: 'abaixo da média', tone: 'neutral' });
  assert.equal(a.kpi.hint, '7 de 10 compromissos cumpridos · igual à semana 115');
  assert.match(text(a.sentence), /igual à semana 115 e 7 pontos abaixo da média/);

  const none = shortTermSummary(build(blentt, addDays(ANALYZED, 7))!, ref(addDays(ANALYZED, 7)));
  assert.deepEqual(
    [none.kpi.label, none.kpi.value, none.kpi.tag, none.kpi.hint],
    ['PPC da semana 117', '—', undefined, 'Semana sem compromissos'],
  );
  assert.match(text(none.sentence), /^A semana 117 não tem compromissos registrados\./);

  // Com recorte, a frase diz que o PPC geral do ranking é da obra inteira.
  const cut = [...blentt.map(row => ({ ...row, supplier: 'Alfa' })), ...week(ANALYZED, 9, ['Retrabalho'], 0, { teamId: 't1' })];
  const filtered = shortTermSummary(build(cut, ANALYZED, { companies: new Set(['Hidrotec']) })!, ref(ANALYZED));
  assert.equal(filtered.kpi.value, '90%');
  assert.match(
    text(filtered.sentence),
    /No PPC geral desde a semana 1 \(\d+% em 12 semanas apuradas, obra inteira\), a obra está em 2º lugar entre 6 obras\./,
  );
});

// ─── Escalas de tempo (04/11/2026, modelo "Dashboard geral e escalas de tempo", regras 5 a 9) ───────────
// Hoje é 04/11/2026: a semana atual começa em 02/11. Outubro tem as semanas de 05, 12, 19 e 26/10 (a de 28/09
// é de setembro, pela segunda-feira).
const TODAY = '2026-11-04';
const ctx: PeriodContext = { currentWeek: '2026-11-02', since: FIRST_WEEK, anchorWeek: '2026-10-26' };
const periodRef = (selection: PeriodSelection) => referenceOf('2026-10-26', TODAY, FIRST_WEEK, resolvePeriod(selection, ctx));
const buildIn = (
  commitments: WeeklyCommitment[],
  selection: PeriodSelection,
  filters?: Partial<DashboardFilters>,
  rk: ClosingRankingResponse | undefined = undefined,
) => {
  const r = periodRef(selection);
  const data = buildShortTermPanel({ commitments, teams, work, ranking: rk }, r, { week: r.week, selection, ...filters });
  return { data: data!, ref: r };
};
const months = [
  ...week('2025-11-03', 1, ['Retrabalho']),
  ...week('2026-08-03', 4, ['Falta de Material']),
  ...week('2026-09-07', 7, repeat(3, 'Retrabalho')),
  ...week('2026-09-28', 7, repeat(3, 'Falta de Material')),
  // Outubro: 18/20, 3/10, a semana de 19/10 em aberto (2 linhas sem Status) e 9/10.
  ...week('2026-10-05', 18, ['Falta de Material', 'Falta de Material']),
  ...week('2026-10-12', 3, ['Intempéries', 'Intempéries', 'Intempéries', 'Intempéries', 'Falta de Material', 'Falta de Material', '']),
  ...week('2026-10-19', 5, ['Retrabalho'], 2),
  ...week('2026-10-26', 9, ['Intempéries']),
];

test('período mensal: PPC soma as linhas das semanas apuradas; a semana em aberto fica fora', () => {
  const later = [...months, ...week('2026-11-02', 0, repeat(5, 'Retrabalho'))];
  const { data } = buildIn(later, { scale: 'mes', key: '2026-10' });
  const p = data.period;
  assert.deepEqual(p.current, {
    key: '2026-10',
    label: 'outubro de 2026',
    short: 'out/26',
    start: '2026-10-05',
    end: '2026-10-31',
    planned: 40,
    fulfilled: 30,
    closedWeeks: 3,
    openWeeks: 1,
    pending: 2,
    percent: 75,
  });
  // Não é a média dos percentuais das semanas apuradas ((90 + 30 + 90) ÷ 3 = 70%): é 30 ÷ 40.
  assert.notEqual(p.current.percent, 70);
  assert.deepEqual([p.previous!.key, p.previous!.planned, p.previous!.fulfilled, p.previous!.percent], ['2026-09', 20, 14, 70]);
  // A série são os 12 meses até outubro; mês sem linha fica sem PPC e fora da média simples.
  assert.equal(p.series.length, 12);
  assert.deepEqual([p.series[0].key, p.series.at(-1)!.key], ['2025-11', '2026-10']);
  assert.deepEqual(p.series.at(-1), p.current);
  assert.deepEqual(
    p.series.filter(b => b.percent !== undefined).map(b => [b.short, b.percent]),
    [
      ['nov/25', 50],
      ['ago/26', 80],
      ['set/26', 70],
      ['out/26', 75],
    ],
  );
  assert.equal(p.average, (50 + 80 + 70 + 75) / 4);
  assert.equal(p.closedInSeries, 4);
  // Causas das linhas com Não de todas as semanas do período, inclusive a em aberto; nada de novembro.
  assert.deepEqual(
    p.causes.map(item => [item.cause, item.total]),
    [
      ['Intempéries', 5],
      ['Falta de Material', 4],
      ['Retrabalho', 1],
    ],
  );
  assert.deepEqual([p.failures, p.uncaused], [11, 1]);
  assert.deepEqual(data.periodInfo, {
    scale: 'mes',
    grouping: 'mes',
    label: 'outubro de 2026',
    short: 'out/26',
    of: 'do mês',
    start: '2026-10-05',
    end: '2026-10-31',
    partial: false,
    weeks: 4,
    nominalWeeks: 4,
    analyzedKey: '2026-10',
  });
  // Os campos da semana continuam sendo os da última semana do período.
  assert.equal(data.closing.week, '2026-10-26');
  assert.equal(data.weekNumber, 117);
});

test('bucketPpc: semanas do balde, apuradas e em aberto, e balde sem semana apurada', () => {
  const bucket = { key: 'x', label: 'L', short: 'S', start: '2026-10-05', end: '2026-10-31' };
  assert.deepEqual(bucketPpc(months, { ...bucket, weeks: ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'] }), {
    ...bucket,
    planned: 40,
    fulfilled: 30,
    closedWeeks: 3,
    openWeeks: 1,
    pending: 2,
    percent: 75,
  });
  const open = bucketPpc(months, { ...bucket, weeks: ['2026-10-19'] });
  assert.equal(open.percent, undefined);
  assert.equal('percent' in open, false);
  assert.deepEqual([open.planned, open.closedWeeks, open.openWeeks, open.pending], [0, 0, 1, 2]);
  const empty = bucketPpc(months, { ...bucket, weeks: ['2026-06-01'] });
  assert.deepEqual([empty.planned, empty.closedWeeks, empty.openWeeks, empty.percent], [0, 0, 0, undefined]);
});

test('escala semanal: o período é a semana e repete os números do painel', () => {
  const data = build(blentt, ANALYZED)!;
  assert.equal(data.periodInfo.scale, 'semana');
  assert.equal(data.period.current.key, ANALYZED);
  assert.deepEqual([data.period.current.planned, data.period.current.fulfilled], [41, 32]);
  assert.equal(data.period.current.percent, data.closing.current!.percent);
  assert.equal(data.period.previous!.percent, data.closing.previous!.percent);
  assert.deepEqual(
    data.period.series.map(b => b.percent),
    data.closing.series.map(point => point.percent),
  );
  assert.deepEqual(data.period.causes, data.closing.weekCauses);
});

test('resumo na escala mensal: cartão "PPC do mês", selo parcial e a frase do período', () => {
  const { data, ref } = buildIn(months, { scale: 'mes', key: '2026-10' }, {}, ranking);
  const { kpi, sentence } = shortTermSummary(data, ref);
  assert.deepEqual(kpi, {
    module: 'curto-prazo',
    label: 'PPC do mês',
    value: '75%',
    tag: { text: 'parcial · 3 de 4 semanas apuradas', tone: 'warn' },
    hint: '30 de 40 compromissos · ▲ 5 p.p. vs set/26',
    main: true,
  });
  // PPC geral até 31/10: 49 de 67 nas 7 semanas apuradas (73%), 2º no ranking.
  assert.equal(
    text(sentence),
    'Em outubro de 2026 a obra cumpriu 75% do que assumiu (30 de 40 compromissos em 3 semanas apuradas; 1 semana em aberto fica fora), ' +
      '5 p.p. acima de setembro. No PPC geral desde a semana 1 (73% em 7 semanas apuradas), a obra está em 2º lugar entre 6 obras.',
  );
  assert.deepEqual(strong(sentence), ['75%', '2º lugar entre 6 obras']);

  // Mês todo apurado: o selo compara com a média da série, como na semanal.
  const september = buildIn(months, { scale: 'mes', key: '2026-09' });
  const s = shortTermSummary(september.data, september.ref);
  assert.deepEqual(s.kpi.tag, { text: 'acima da média', tone: 'good' });
  assert.equal(s.kpi.hint, '14 de 20 compromissos · ▼ 10 p.p. vs ago/26');
  assert.equal(
    text(s.sentence),
    'Em setembro de 2026 a obra cumpriu 70% do que assumiu (14 de 20 compromissos em 2 semanas apuradas), 10 p.p. abaixo de agosto. ' +
      'Desde a semana 1, o PPC geral da obra é de 70% em 4 semanas apuradas.',
  );
});

test('resumo: mês atual sem semana apurada, trimestre, ano e personalizado', () => {
  const lines = [...months, ...week('2026-11-02', 2, [], 3)];
  const november = buildIn(lines, { scale: 'mes', key: '2026-11' });
  const n = shortTermSummary(november.data, november.ref);
  assert.deepEqual(
    [n.kpi.label, n.kpi.value, n.kpi.tag, n.kpi.hint],
    ['PPC do mês', '—', { text: 'parcial · 0 de 5 semanas apuradas', tone: 'warn' }, 'Nenhuma semana apurada · 3 linhas sem Status'],
  );
  assert.equal(
    text(n.sentence),
    'Em novembro de 2026 ainda não há semana apurada: 1 semana está em aberto, com 3 linhas sem Status. ' +
      'Desde a semana 1, o PPC geral da obra é de 73% em 7 semanas apuradas.',
  );

  const quarter = buildIn(lines, { scale: 'trimestre', key: '2026-T4' });
  const q = shortTermSummary(quarter.data, quarter.ref);
  assert.deepEqual([q.kpi.label, q.kpi.value, q.kpi.hint], ['PPC do trimestre', '75%', '30 de 40 compromissos · ▲ 3 p.p. vs 3T26']);
  assert.deepEqual(q.kpi.tag, { text: 'parcial · 3 de 13 semanas apuradas', tone: 'warn' });
  assert.match(
    text(q.sentence),
    /^No 4º trimestre de 2026 \(out–dez\), até agora, a obra cumpriu 75% do que assumiu \(30 de 40 compromissos em 3 semanas apuradas; 2 semanas em aberto ficam fora\), 3 p\.p\. acima do 3º trimestre\./,
  );

  const year = buildIn(lines, { scale: 'ano', key: '2026' });
  const y = shortTermSummary(year.data, year.ref);
  assert.equal(y.kpi.label, 'PPC do ano');
  assert.equal(y.kpi.hint, '48 de 65 compromissos · ▲ 24 p.p. vs 2025');
  assert.match(
    text(y.sentence),
    /^Em 2026, até agora, a obra cumpriu 74% do que assumiu \(48 de 65 compromissos em 6 semanas apuradas; 2 semanas em aberto ficam fora\), 24 p\.p\. acima de 2025\./,
  );

  // Personalizado de 01/09 a 31/10: semanas inteiras de 31/08 a 31/10 (9), por semana; o anterior são as 9 semanas antes.
  const custom = buildIn(months, { scale: 'personalizado', from: '2026-09-01', to: '2026-10-31' });
  assert.equal(custom.data.periodInfo.analyzedKey, undefined);
  assert.equal(custom.data.periodInfo.grouping, 'semana');
  assert.equal(custom.data.period.series.length, 9);
  assert.equal(custom.data.period.previous!.percent, 80);
  const c = shortTermSummary(custom.data, custom.ref);
  assert.deepEqual(
    [c.kpi.label, c.kpi.value, c.kpi.tag, c.kpi.hint],
    [
      'PPC do período',
      '73%',
      { text: 'parcial · 5 de 9 semanas apuradas', tone: 'warn' },
      '44 de 60 compromissos · ▼ 7 p.p. vs período anterior',
    ],
  );
  assert.match(
    text(c.sentence),
    /^De 31\/08 a 31\/10\/2026 a obra cumpriu 73% do que assumiu \(44 de 60 compromissos em 5 semanas apuradas; 1 semana em aberto fica fora\), 7 p\.p\. abaixo das 9 semanas anteriores\./,
  );
});

test('recorte de empreiteiro vale no período; periodCompanies apura a semana pela obra inteira', () => {
  const lines = [
    ...week('2026-10-05', 8, ['Falta de Material', 'Falta de Material'], 0, { supplier: 'Alfa' }),
    ...week('2026-10-05', 4, ['Retrabalho'], 0, { teamId: 't1' }),
    ...week('2026-10-05', 1, []),
    // 12/10 fica em aberto para a obra (uma linha da Alfa sem Status), mas a Hidrotec apurou.
    ...week('2026-10-12', 5, [], 1, { supplier: 'Alfa' }),
    ...week('2026-10-12', 3, ['Retrabalho'], 0, { supplier: 'HIDROTEC' }),
    ...week('2026-10-19', 10, [], 0, { supplier: 'Alfa' }),
    ...week('2026-10-19', 1, [], 0, { supplier: 'ALFA ' }),
  ];
  const whole = buildIn(lines, { scale: 'mes', key: '2026-10' }).data.period;
  assert.deepEqual([whole.current.planned, whole.current.fulfilled, whole.current.closedWeeks, whole.current.openWeeks], [27, 24, 2, 1]);
  const { data, ref } = buildIn(lines, { scale: 'mes', key: '2026-10' }, { companies: new Set(['hidrotec']) });
  const p = data.period;
  // Só as linhas da Hidrotec: 4 de 5 em 05/10 e 3 de 4 em 12/10, as duas apuradas no recorte.
  assert.deepEqual([p.current.planned, p.current.fulfilled, p.current.closedWeeks, p.current.openWeeks], [9, 7, 2, 0]);
  assert.deepEqual(
    p.causes.map(item => [item.cause, item.total]),
    [['Retrabalho', 2]],
  );
  assert.deepEqual([p.failures, p.uncaused], [2, 0]);
  assert.match(text(shortTermSummary(data, ref).sentence), /^Em outubro de 2026 o recorte de empreiteiro cumpriu 78% do que assumiu/);

  const october = ref.period.weeks;
  assert.deepEqual(periodCompanies(lines, teams, october), [
    { name: 'Alfa', key: 'alfa', planned: 21, fulfilled: 19 },
    { name: 'Hidrotec', key: 'hidrotec', planned: 5, fulfilled: 4 },
  ]);
  assert.deepEqual(periodCompanies(lines, teams, ['2026-10-05']), [
    { name: 'Alfa', key: 'alfa', planned: 10, fulfilled: 8 },
    { name: 'Hidrotec', key: 'hidrotec', planned: 5, fulfilled: 4 },
  ]);
  assert.deepEqual(periodCompanies(lines, teams, ['2026-10-12']), []);
  assert.deepEqual(periodCompanies([], teams, october), []);
});

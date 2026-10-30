import test from 'node:test';
import assert from 'node:assert/strict';
import type { NonFulfillmentCause, WeeklyCommitment } from '../src/domain/entities';
import { addDays } from '../src/domain/validation';
import {
  buildRanking,
  MIN_RANKED_WEEKS,
  rankingMean,
  rankWorks,
  withLocalWork,
  workPpc,
  type ClosingRankingResponse,
  type RankingEntry,
} from '../src/domain/closing-ranking';
import {
  closingDashboard,
  closingSummary,
  paretoCallout,
  topCauses,
  visibleRanking,
  type Segment,
} from '../src/modules/curto-prazo/closing-dashboard';
import { causePareto } from '../src/domain/rules';

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
/** Uma semana com `sim` cumpridas, as causas dadas (uma linha Não por causa) e `pending` sem Status. */
function week(weekStart: string, sim: number, causes: (NonFulfillmentCause | '')[], pending = 0, workId = 'blt'): WeeklyCommitment[] {
  return [
    ...Array.from({ length: sim }, () => line({ workId, weekStart, fulfilled: true })),
    ...causes.map(cause => line({ workId, weekStart, fulfilled: false, ...(cause ? { cause } : {}) })),
    ...Array.from({ length: pending }, () => line({ workId, weekStart })),
  ];
}
const repeat = <T extends string>(count: number, value: T) => Array.from({ length: count }, () => value);
const text = (segments: Segment[]) => segments.map(s => s.text).join('');
const strong = (segments: Segment[]) => segments.filter(s => s.strong).map(s => s.text);

// O cenário do modelo aprovado (30/10/2026): semanas 105 a 116, de 03/08 a 19/10/2026.
const MONDAYS = Array.from({ length: 12 }, (_, i) => addDays('2026-08-03', i * 7));
const PPCS = [66, 70, 64, 68, 74, 67, 70, 75, 72, 73, 72];
const ANALYZED = MONDAYS[11];
const label = (weekStart: string) => 105 + MONDAYS.indexOf(weekStart);
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
    entry('blt', 'Blentt', 10), // valor velho do servidor: o PDF troca pelo cálculo local
    entry('atm', 'Atmos', 67),
    entry('tau', 'Tauá', 65),
    entry('brz', 'Brizz', 62),
    entry('mzn', 'Mozine', 61),
  ]),
};
const work = { id: 'blt', name: 'Blentt', code: 'BLT' };

test('PPC geral soma as linhas das semanas apuradas até a semana analisada', () => {
  const lines = [
    ...week('2026-09-07', 8, ['Retrabalho', 'Retrabalho']),
    ...week('2026-09-14', 1, ['Retrabalho'], 2),
    ...week('2026-09-21', 3, ['Retrabalho']),
  ];
  const until14 = workPpc(lines, '2026-09-14');
  // A semana de 14/09 tem linha sem Status: fica fora; a de 21/09 é posterior à analisada.
  assert.deepEqual(until14.overall, { planned: 10, fulfilled: 8, closedWeeks: 1, percent: 80 });
  assert.deepEqual(until14.week, { planned: 4, fulfilled: 1, pending: 2, percent: 25 });
  // Ponderado pelas linhas, não pela média dos percentuais (80% e 75% dariam 77,5%).
  assert.equal(workPpc(lines, '2026-09-21').overall.percent, (11 / 14) * 100);
  assert.equal(workPpc(lines, '2026-08-31').week, undefined);
  assert.equal(workPpc([], '2026-09-14').overall.percent, undefined);
});

test('ranking ordena pelo PPC geral, divide empate e deixa as obras em início sem posição', () => {
  const ranked = rankWorks([
    entry('a', 'Atmos', 70),
    entry('b', 'Brizz', 80),
    entry('c', 'Cedro', 70),
    entry('n', 'Nova', 95, MIN_RANKED_WEEKS - 1),
    entry('d', 'Delta', 60),
    entry('m', 'Mais nova', 99, 1),
  ]);
  assert.deepEqual(
    ranked.map(e => [e.name, e.position]),
    [
      ['Brizz', 1],
      ['Atmos', 2],
      ['Cedro', 2],
      ['Delta', 4],
      ['Mais nova', undefined],
      ['Nova', undefined],
    ],
  );
  assert.equal(rankingMean(ranked), 70);
});

test('ranking das linhas ignora obra sem linha e semanas depois da analisada', () => {
  const lines = [
    ...['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].flatMap(monday => week(monday, 9, ['Retrabalho'], 0, 'a')),
    ...week('2026-10-05', 0, ['Retrabalho', 'Retrabalho'], 0, 'a'),
    ...week('2026-09-28', 5, [], 0, 'b'),
  ];
  const works = [
    { workId: 'a', name: 'Atmos', code: 'ATM' },
    { workId: 'b', name: 'Brizz', code: 'BRZ' },
    { workId: 'z', name: 'Zero', code: 'ZER' },
  ];
  const result = buildRanking(works, lines, '2026-09-28');
  assert.deepEqual(
    result.map(e => [e.name, e.position, e.overall.percent, e.week?.percent]),
    [
      ['Atmos', 1, 90, 90],
      ['Brizz', undefined, 100, 100],
    ],
  );
});

test('o PDF troca a linha da própria obra pelo cálculo local e renumera', () => {
  const local = workPpc(blentt, ANALYZED);
  const merged = withLocalWork((ranking as { entries: RankingEntry[] }).entries, { workId: 'blt', name: 'Blentt', code: 'BLT' }, local);
  assert.deepEqual(
    merged.map(e => [e.name, e.position]),
    [
      ['Essenza', 1],
      ['Blentt', 2],
      ['Atmos', 3],
      ['Tauá', 4],
      ['Brizz', 5],
      ['Mozine', 6],
    ],
  );
  assert.equal(merged[1].overall.percent, local.overall.percent);
});

test('painel do modelo aprovado: série, semana anterior, média, causas e posição', () => {
  const d = closingDashboard(blentt, work, ANALYZED, ranking);
  assert.equal(d.series.length, 12);
  assert.equal(d.series.at(-1)?.weekStart, ANALYZED);
  assert.equal(Math.round(d.current!.percent), 78);
  assert.equal(d.previous?.weekStart, MONDAYS[10]);
  assert.equal(Math.round(d.average!), 71);
  assert.deepEqual([d.failures, d.uncaused], [9, 0]);
  assert.equal(d.weekCauses[0].cause, 'Falta de Mão de Obra');
  assert.deepEqual([d.position, d.ranked, Math.round(d.mean!)], [2, 6, 67]);
  assert.equal(
    text(closingSummary(d, label)),
    'A semana 116 fechou com PPC de 78%: 6 pontos acima da semana 115 e 7 acima da média das últimas 12 semanas. ' +
      'No PPC geral, a obra está em 2º lugar entre 6 obras. ' +
      'Falta de Mão de Obra foi a principal causa da semana (3 das 9 falhas) e é também a primeira no Pareto da obra.',
  );
  assert.deepEqual(strong(closingSummary(d, label)), ['PPC de 78%', '2º lugar entre 6 obras', 'Falta de Mão de Obra']);
});

test('o painel não enxerga semanas depois da analisada nem linhas de outra obra', () => {
  const later = [
    ...blentt,
    ...week(addDays(ANALYZED, 7), 0, repeat(50, 'Retrabalho')),
    ...week(ANALYZED, 0, repeat(30, 'Retrabalho'), 0, 'outra'),
  ];
  const d = closingDashboard(later, work, ANALYZED, ranking);
  assert.equal(d.series.at(-1)?.weekStart, ANALYZED);
  assert.equal(
    d.pareto.find(item => item.cause === 'Retrabalho'),
    undefined,
  );
});

test('semana em aberto, sem ranking e com empate de causas', () => {
  const lines = [
    ...MONDAYS.slice(0, 11).flatMap((monday, i) => week(monday, PPCS[i], repeat(100 - PPCS[i], 'Falta de Material'))),
    ...week(ANALYZED, 10, ['Retrabalho', 'Intempéries'], 3),
  ];
  const d = closingDashboard(lines, work, ANALYZED, { available: false, message: 'fora' });
  assert.equal(d.ranking, undefined);
  assert.equal(
    text(closingSummary(d, label)),
    'A semana 116 ainda está em aberto, com 3 linhas sem Status: o PPC provisório é de 67%. ' +
      'As principais causas da semana foram Intempéries e Retrabalho, com 1 falha cada; na obra, a primeira é Falta de Material.',
  );
});

test('semana sem falhas, obra em início e semana sem linhas', () => {
  const fresh = [...week(MONDAYS[9], 10, []), ...week(MONDAYS[10], 9, ['Retrabalho']), ...week(ANALYZED, 12, [])];
  const d = closingDashboard(fresh, work, ANALYZED, ranking);
  assert.equal(d.position, undefined);
  assert.equal(
    text(closingSummary(d, label)),
    'A semana 116 fechou com PPC de 100%: 10 pontos acima da semana 115 e 3 acima da média das últimas 12 semanas. ' +
      'Com menos de 4 semanas apuradas, a obra ainda não tem posição no ranking. Nenhum compromisso deixou de ser cumprido.',
  );
  const empty = closingDashboard(fresh, work, addDays(ANALYZED, 7), { available: false, message: 'fora' });
  assert.equal(text(closingSummary(empty, () => 117)), 'A semana 117 não tem compromissos registrados.');
});

test('falha sem causa e falha única', () => {
  const lines = [...week(MONDAYS[10], 10, []), ...week(ANALYZED, 9, [''])];
  const d = closingDashboard(lines, work, ANALYZED, undefined);
  assert.deepEqual([d.failures, d.uncaused], [1, 1]);
  assert.match(text(closingSummary(d, label)), /A falha da semana ainda está sem causa apontada\.$/);
  const single = closingDashboard([...week(MONDAYS[10], 10, []), ...week(ANALYZED, 9, ['Retrabalho'])], work, ANALYZED, undefined);
  assert.match(
    text(closingSummary(single, label)),
    /Retrabalho foi a causa da única falha da semana e é também a primeira no Pareto da obra\.$/,
  );
});

test('chamada do Pareto, corte das causas e ranking que cabe na folha', () => {
  const tally = causePareto([
    ...week('2026-09-07', 0, [...repeat(150, 'Falta de Mão de Obra'), ...repeat(112, 'Atraso de tarefas antecedentes')]),
    ...week('2026-09-14', 0, [...repeat(78, 'Falta de Material'), ...repeat(49, 'Baixa Produtividade'), ...repeat(29, 'Intempéries')]),
    ...week('2026-09-21', 0, [...repeat(30, 'Retrabalho'), ...repeat(20, 'Demanda extra'), ...repeat(18, 'Falta de documentação')]),
  ]);
  assert.equal(
    text(paretoCallout(tally)),
    '4 causas respondem por 80% das 486 falhas apuradas na obra: Falta de Mão de Obra, Atraso de tarefas antecedentes, Falta de Material e Baixa Produtividade.',
  );
  const cut = topCauses(tally, 6);
  assert.equal(cut.rows.length, 6);
  assert.deepEqual(cut.rest && [cut.rest.causes, cut.rest.total], [2, 38]);
  // Uma causa só sobrando não vira "Outras 1 causas": entra na lista.
  assert.equal(topCauses(tally.slice(0, 7), 6).rows.length, 7);
  assert.equal(text(paretoCallout(tally.slice(0, 1))), 'Todas as 150 falhas apuradas na obra têm a mesma causa: Falta de Mão de Obra.');

  const many = rankWorks(Array.from({ length: 12 }, (_, i) => entry(`w${i}`, `Obra ${i}`, 90 - i)));
  const view = visibleRanking(many, 'w10', 8);
  assert.deepEqual(
    view.rows.map(e => e.workId),
    ['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w10'],
  );
  assert.equal(view.hidden, 4);
  assert.equal(visibleRanking(many, 'w2', 8).rows.length, 8);
});

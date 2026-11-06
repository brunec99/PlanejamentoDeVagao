import test from 'node:test';
import assert from 'node:assert/strict';
import type { SafetyType } from '../src/domain/safety';
import { assemblePortfolioSources, SAFETY_ERROR } from '../src/app/api/dashboard/obras/route';
import { DASHBOARD_MODULES, moduleInfo, PORTFOLIO_MODULES, type PortfolioModule, type Segment } from '../src/modules/dashboard/model';
import { resolvePeriod, type PeriodContext } from '../src/modules/dashboard/period';
import { aggregatePortfolio, KPIS_SHOWN, SAFETY_TYPES_SHOWN } from '../src/modules/dashboard/portfolio/aggregate';
import { parsePortfolioParams } from '../src/modules/dashboard/portfolio/params';
import { buildSafetyBlock } from '../src/modules/dashboard/portfolio/safety';
import type {
  PortfolioCellStatus,
  PortfolioRow,
  PortfolioSafety,
  PortfolioSafetyItem,
  PortfolioWork,
} from '../src/modules/dashboard/portfolio/types';
import { NONE } from '../src/modules/seguranca/safety-view';

/** Segurança do trabalho no Dashboard geral (modelo aprovado em 06/11/2026). Outubro de 2026 no geral vai da
 * segunda 05/10 ao sábado 31/10 (semanas inteiras, regra 4); a véspera é o domingo 04/10. */

const ctx: PeriodContext = { currentWeek: '2026-11-02', since: '2026-08-03', anchorWeek: '2026-10-26' };
const october = resolvePeriod({ scale: 'mes', key: '2026-10' }, ctx);
const OCTOBER = { start: '2026-10-05', end: '2026-10-31' };
const TODAY = '2026-11-04';

const stamp = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const type = (id: string, name: string, orderIndex: number): SafetyType => ({ id, name, orderIndex, active: true, ...stamp });
const TYPES = [type('t1', 'Proteções periféricas', 0), type('t2', 'EPI', 1)];
const open = (observedOn: string, patch: Partial<PortfolioSafetyItem> = {}): PortfolioSafetyItem => ({
  consequence: 'Leve',
  observedOn,
  status: 'open',
  ...patch,
});
const done = (observedOn: string, correctedOn: string, patch: Partial<PortfolioSafetyItem> = {}): PortfolioSafetyItem => ({
  consequence: 'Leve',
  observedOn,
  status: 'resolved',
  correctedOn,
  ...patch,
});

test('bloco da obra: feitos e finalizados no período, em aberto no sábado final e na véspera (regra 3)', () => {
  const items = [
    open('2026-09-20', { typeId: 't1', consequence: 'Severa' }), // aberto desde antes: véspera e fim, 41 dias
    done('2026-09-25', '2026-10-10', { typeId: 't1' }), // aberto na véspera, finalizado no período (15 dias)
    done('2026-10-06', '2026-10-08', { typeId: 't2' }), // feito e finalizado no período (2 dias)
    open('2026-10-28', { typeId: 't1', consequence: 'Morte' }), // feito no período, aberto há 3 dias
    done('2026-10-20', '2026-11-02', { typeId: 't2', consequence: 'Significativa' }), // corrigido depois do fim: aberto em 31/10
    open('2026-11-02', { typeId: 't1' }), // depois do sábado final: não entra
    done('2026-10-10', '2026-10-12', { consequence: 'Morte' }), // sem tipo, feito e finalizado (2 dias)
  ];
  const block = buildSafetyBlock(items, TYPES, OCTOBER, TODAY)!;
  assert.equal(block.openAtStart, 2);
  assert.equal(block.opened, 4);
  assert.equal(block.resolved, 3);
  assert.equal(block.open, 3);
  // A conta fecha: aberto na véspera + feitos − finalizados = aberto no fim.
  assert.equal(block.openAtStart + block.opened - block.resolved, block.open);
  assert.equal(block.openOver7, 2);
  assert.equal(block.averageDaysToResolve, 19 / 3);
  // Feitos por consequência, na ordem Morte → Autuação/Multa.
  assert.deepEqual(block.byConsequence, [2, 0, 1, 1, 0, 0]);
  // Do tipo com mais feitos ao com menos; empate pela ordem do cadastro, "Sem tipo" por último.
  assert.deepEqual(block.byType, [
    { key: 't2', label: 'EPI', count: 2 },
    { key: 't1', label: 'Proteções periféricas', count: 1 },
    { key: NONE, label: 'Sem tipo', count: 1 },
  ]);
});

test('bloco da obra: sem apontamento até o sábado final a obra fica sem dado; sem finalizado, sem média', () => {
  assert.equal(buildSafetyBlock([open('2026-11-02')], TYPES, OCTOBER, TODAY), undefined);
  assert.equal(buildSafetyBlock([], TYPES, OCTOBER, TODAY), undefined);
  // Só histórico antigo, tudo corrigido antes: a obra aparece com zeros.
  const old = buildSafetyBlock([done('2026-03-01', '2026-03-05')], TYPES, OCTOBER, TODAY)!;
  assert.deepEqual([old.open, old.openAtStart, old.opened, old.resolved, old.openOver7], [0, 0, 0, 0, 0]);
  assert.equal(old.averageDaysToResolve, undefined);
  // Tipo que saiu do cadastro conta como "Sem tipo".
  assert.deepEqual(buildSafetyBlock([open('2026-10-10', { typeId: 'apagado' })], TYPES, OCTOBER, TODAY)!.byType, [
    { key: NONE, label: 'Sem tipo', count: 1 },
  ]);
});

test('abertos há mais de 7 dias no período em andamento contam até hoje, não até o sábado futuro', () => {
  // Novembro parcial: semana de 02/11, sábado 07/11; hoje 04/11. Apontado em 29/10: 6 dias até hoje, 9 até o sábado.
  const week = { start: '2026-11-02', end: '2026-11-07' };
  assert.equal(buildSafetyBlock([open('2026-10-29')], TYPES, week, TODAY)!.openOver7, 0);
  assert.equal(buildSafetyBlock([open('2026-10-27')], TYPES, week, TODAY)!.openOver7, 1);
  // Período encerrado: conta até o sábado final, mesmo que hoje seja depois.
  assert.equal(buildSafetyBlock([open('2026-10-29')], TYPES, OCTOBER, TODAY)!.openOver7, 0);
  assert.equal(buildSafetyBlock([open('2026-10-23')], TYPES, OCTOBER, TODAY)!.openOver7, 1);
});

// ─── aggregate ──────────────────────────────────────────────────────────────────────────────────────────

const work = (id: string, name: string): PortfolioWork => ({ id, name, code: id.toUpperCase() });
const horizonte = work('hrz', 'Horizonte');
const mirante = work('mrt', 'Mirante');
const jardins = work('jds', 'Jardins');
const safety = (over: Partial<PortfolioSafety>): PortfolioSafety => ({
  open: 0,
  openAtStart: 0,
  openOver7: 0,
  opened: 0,
  resolved: 0,
  byConsequence: [0, 0, 0, 0, 0, 0],
  byType: [],
  ...over,
});
function row(w: PortfolioWork, block?: PortfolioSafety): PortfolioRow {
  const absent: PortfolioCellStatus = { kind: 'absent', reason: 'sem dado' };
  const status = Object.fromEntries(PORTFOLIO_MODULES.map(m => [m.id, absent])) as Record<PortfolioModule, PortfolioCellStatus>;
  return {
    work: w,
    state: 'neutral',
    stateLabel: 'Sem apuração',
    status: { ...status, seguranca: block ? { kind: 'ready' } : absent },
    ...(block ? { safety: block } : {}),
  };
}
const rows = () => [
  row(
    horizonte,
    safety({
      open: 6,
      openAtStart: 9,
      openOver7: 1,
      opened: 38,
      resolved: 41,
      averageDaysToResolve: 4.2,
      byConsequence: [2, 6, 12, 13, 3, 2],
      byType: [
        { key: 't1', label: 'Proteções periféricas', count: 9 },
        { key: 't2', label: 'EPI', count: 5 },
      ],
    }),
  ),
  row(
    mirante,
    safety({
      open: 14,
      openAtStart: 6,
      openOver7: 5,
      opened: 52,
      resolved: 44,
      averageDaysToResolve: 7.8,
      byConsequence: [4, 11, 17, 14, 2, 4],
      byType: [
        { key: 't1', label: 'Proteções periféricas', count: 12 },
        { key: 't2', label: 'EPI', count: 7 },
        { key: 't3', label: 'Sinalização', count: 4 },
      ],
    }),
  ),
  row(jardins),
];
const text = (segments: Segment[]) => segments.map(s => s.text).join('');
const ONLY_SAFETY = new Set<PortfolioModule>(['seguranca']);

test('totais da segurança somando as obras; média ponderada pelos finalizados', () => {
  const data = aggregatePortfolio({ period: october, rows: rows(), shown: ONLY_SAFETY });
  const t = data.totals.safety;
  assert.deepEqual([t.works, t.open, t.openAtStart, t.openOver7, t.worksOver7, t.opened, t.resolved], [2, 20, 15, 6, 2, 90, 85]);
  assert.ok(Math.abs(t.averageDaysToResolve! - (4.2 * 41 + 7.8 * 44) / 85) < 1e-9);
  assert.deepEqual(t.byConsequence, [6, 17, 29, 27, 5, 6]);
  // A obra sem apontamento é citada embaixo do quadro.
  assert.deepEqual(
    data.noData.seguranca.map(w => w.name),
    ['Jardins'],
  );
});

test('o cartão de segurança e o trecho da frase (regra 8), com os mesmos números', () => {
  const data = aggregatePortfolio({ period: october, rows: rows(), shown: ONLY_SAFETY });
  assert.equal(data.kpis.length, 1);
  const [card] = data.kpis;
  assert.deepEqual([card.module, card.label, card.value, card.main], ['seguranca', 'Apontamentos de segurança em aberto', '20', true]);
  assert.deepEqual(card.tag, { text: '▲ 5', tone: 'bad' });
  assert.equal(card.hint, '90 feitos e 85 finalizados no período · 2 obras');
  assert.equal(card.tone, 'bad');
  assert.match(
    text(data.sentence),
    /A segurança do trabalho fecha o período com 20 apontamentos em aberto \(5 a mais que no início\), 6 há mais de 7 dias\./,
  );
  // Sem nada aberto: cartão verde e frase sem os "mais de 7 dias".
  const clean = aggregatePortfolio({
    period: october,
    rows: [row(horizonte, safety({ open: 0, openAtStart: 2, resolved: 2 }))],
    shown: ONLY_SAFETY,
  });
  assert.equal(clean.kpis[0].tone, 'good');
  assert.deepEqual(clean.kpis[0].tag, { text: '▼ 2', tone: 'good' });
  assert.match(text(clean.sentence), /fecha o período com 0 apontamentos em aberto \(2 a menos que no início\)\.$/);
});

test('quadro escondido: sem cartão nem frase de segurança; o topo vai até sete cartões', () => {
  const hidden = aggregatePortfolio({ period: october, rows: rows(), shown: new Set<PortfolioModule>(['terminalidade']) });
  assert.ok(!hidden.kpis.some(k => k.module === 'seguranca'));
  assert.doesNotMatch(text(hidden.sentence), /segurança/);
  assert.equal(KPIS_SHOWN, 7);
});

test('tipos com mais apontamentos no período, somando as obras pelo id (regra 7)', () => {
  const data = aggregatePortfolio({ period: october, rows: rows(), shown: ONLY_SAFETY });
  assert.deepEqual(
    data.safetyTypes.rows.map(r => [r.label, r.total, r.byWork.map(c => `${c.work.code} ${c.count}`).join(' · ')]),
    [
      ['Proteções periféricas', 21, 'MRT 12 · HRZ 9'],
      ['EPI', 12, 'MRT 7 · HRZ 5'],
      ['Sinalização', 4, 'MRT 4'],
    ],
  );
  const many = Array.from({ length: 9 }, (_, i) => ({ key: `t${i}`, label: `Tipo ${i}`, count: 9 - i }));
  const capped = aggregatePortfolio({ period: october, rows: [row(horizonte, safety({ byType: many }))], shown: ONLY_SAFETY });
  assert.equal(capped.safetyTypes.rows.length, SAFETY_TYPES_SHOWN);
  assert.equal(capped.safetyTypes.rows[0].label, 'Tipo 0');
});

// ─── quadros, URL e rota ────────────────────────────────────────────────────────────────────────────────

test('a segurança é o 6º quadro do geral; a aba 0 continua com os cinco (regra 2)', () => {
  assert.deepEqual(moduleInfo('seguranca'), { id: 'seguranca', number: 6, label: 'Segurança do trabalho' });
  assert.equal(DASHBOARD_MODULES.length, 5);
  assert.ok(!DASHBOARD_MODULES.some(m => (m.id as string) === 'seguranca'));
  assert.deepEqual([...(parsePortfolioParams({ quadros: 'seguranca,curto-prazo,xyz' }).modules ?? [])], ['seguranca', 'curto-prazo']);
});

test('rota: a segurança vem numa leitura, por obra, sem o workId; obra não liberada fica fora', () => {
  const response = assemblePortfolioSources(['obra-1', 'obra-2'], { kind: 'denied' }, new Map(), {
    kind: 'ready',
    types: TYPES,
    items: [
      { workId: 'obra-1', consequence: 'Leve', observedOn: '2026-10-10', status: 'open', typeId: 't1' },
      { workId: 'obra-3', consequence: 'Morte', observedOn: '2026-10-11', status: 'open' },
    ],
  });
  assert.equal(response.safetyAvailable, true);
  assert.deepEqual(response.safetyTypes, TYPES);
  assert.deepEqual(response.works[0].safety, [{ consequence: 'Leve', observedOn: '2026-10-10', status: 'open', typeId: 't1' }]);
  assert.deepEqual(response.works[1].safety, []);
  assert.ok(response.works.every(w => !('safetyError' in w)));
});

test('rota: sem a 0040, indisponível; outra falha vira erro em cada obra; chamada antiga não traz segurança', () => {
  const missing = assemblePortfolioSources(['obra-1'], { kind: 'denied' }, new Map(), { kind: 'unavailable' });
  assert.equal(missing.safetyAvailable, false);
  assert.ok(!('safetyTypes' in missing));
  assert.ok(!('safety' in missing.works[0]) && !('safetyError' in missing.works[0]));
  const failed = assemblePortfolioSources(['obra-1', 'obra-2'], { kind: 'denied' }, new Map(), { kind: 'error' });
  assert.equal(failed.safetyAvailable, true);
  assert.deepEqual(
    failed.works.map(w => w.safetyError),
    [SAFETY_ERROR, SAFETY_ERROR],
  );
  const legacy = assemblePortfolioSources(['obra-1'], { kind: 'denied' }, new Map());
  assert.ok(!('safetyAvailable' in legacy));
});

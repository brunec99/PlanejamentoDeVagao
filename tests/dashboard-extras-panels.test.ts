import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { referenceOf } from '../src/modules/dashboard/model';
import { composeSummary, MAX_KPIS } from '../src/modules/dashboard/summary';
import {
  coverageLabel,
  coverageTone,
  headcountSummary,
  missingText,
  periodIn,
  restrictionsSummary,
  safetySummary,
} from '../src/modules/dashboard/extras/extras-summary';
import {
  BalancePanel,
  ChecklistPanel,
  HeadcountPanel,
  ProductionPanel,
  RestrictionsPanel,
  SafetyPanel,
  type ExtrasPanelContext,
} from '../src/modules/dashboard/extras/panels';
import type { PortfolioSafety } from '../src/modules/dashboard/portfolio/types';
import type {
  ChecklistBlock,
  HeadcountBlock,
  LegalizationBlock,
  LobBlock,
  ProductionBlock,
  RestrictionsBlock,
  WorkdayCoverage,
} from '../src/modules/dashboard/extras/types';

/** Quadros de 12/11/2026 na aba 0: as faixas dos dias lançados, os três cartões novos do resumo e a
 * renderização dos seis quadros, na tela e no papel, com dados de exemplo (os do modelo aprovado). */

const coverage = (launched: number, expected: number, missing: string[] = []): WorkdayCoverage => ({
  expected,
  launched,
  missing,
  missingCount: expected - launched,
});
const ref = referenceOf('2026-10-26', '2026-11-12', '2025-08-04');
const ctx: ExtrasPanelContext = { periodIn: 'na semana', periodOf: 'da semana', end: '2026-10-31', filtered: false };

const headcount: HeadcountBlock = {
  manDays: 1680,
  dailyAverage: 84.2,
  peak: 103,
  peakDay: '2026-10-21',
  contractorShare: 0.71,
  coverage: coverage(20, 22, ['2026-10-09', '2026-10-30']),
  lastDay: '2026-10-29',
  series: [
    { key: '2026-10-05', label: '05/10', value: 78 },
    { key: '2026-10-12', label: '12/10', value: 82 },
    { key: '2026-10-19', label: '19/10', value: 94.4 },
    { key: '2026-10-26', label: '26/10', value: 83 },
  ],
  seriesGrain: 'semana',
  companies: [
    { name: 'Alfa Estruturas', manDays: 440, averagePresent: 22, own: false },
    { name: 'ATR', manDays: 380, averagePresent: 19, own: true },
  ],
};
const production: ProductionBlock = {
  entries: 146,
  measured: 90,
  pending: 56,
  manDays: 612,
  measuredShare: 90 / 146,
  coverage: coverage(19, 22, ['2026-10-09', '2026-10-16', '2026-10-30']),
  lastDay: '2026-10-29',
  services: [
    { key: 'alvenaria de vedacao', name: 'Alvenaria de vedação', unit: 'm²', quantity: 2100, manDays: 250, perManDay: 8.4, measured: 30 },
    { key: 'reboco interno', name: 'Reboco interno', unit: 'm²', quantity: 1830, manDays: 150, perManDay: 12.2, measured: 22 },
  ],
};
const restrictions: RestrictionsBlock = {
  asOf: '2026-10-31',
  open: 23,
  byStatus: { todo: 12, doing: 8, paused: 3 },
  overdue: 4,
  startOverdue: 3,
  doneInPeriod: 11,
  cancelledInPeriod: 1,
  createdInPeriod: 9,
  byResponsible: [
    { name: 'Carla', open: 8, overdue: 2 },
    { name: 'Diego', open: 6, overdue: 0 },
  ],
};
const lob: LobBlock = {
  status: 'ok',
  idp: 0.932,
  real: 41,
  planned: 44,
  measurementDate: '2026-10-28',
  measurementNumber: 7,
  weighting: 'cost',
  baselineName: 'LB 2',
};
const legalization: LegalizationBlock = {
  milestones: { done: 9, total: 31 },
  late: 2,
  tasks: { done: 40, total: 120 },
  next: { name: 'Vistoria do Corpo de Bombeiros', date: '2026-11-18' },
  deliveryDate: '2027-06-30',
  forecast: '2027-07-09',
  lateDays: 7,
};
const safety: PortfolioSafety = {
  open: 12,
  openAtStart: 5,
  openOver7: 4,
  opened: 38,
  resolved: 31,
  averageDaysToResolve: 5.2,
  byConsequence: [0, 3, 10, 20, 5, 0],
  byType: [
    { key: 't1', label: 'Trabalho em altura', count: 14 },
    { key: '__vazio__', label: 'Sem tipo', count: 3 },
  ],
};
const checklist: ChecklistBlock = {
  equipment: 14,
  due: 21,
  pending: 4,
  pendingList: [
    { equipment: 'Betoneira 02', model: 'Betoneira — diário', frequency: 'daily' },
    { equipment: 'Elevador cremalheira', model: 'Elevador — semanal', frequency: 'weekly' },
  ],
  runsInPeriod: 96,
  runsWithNonConformity: 5,
  nonConformities: 6,
};

test('dias lançados: 90% ou mais em verde, 70% a 89% em âmbar, abaixo em vermelho, sem dia esperado neutro', () => {
  assert.equal(coverageTone(coverage(20, 22)), 'good');
  assert.equal(coverageTone(coverage(18, 20)), 'good');
  assert.equal(coverageTone(coverage(19, 22)), 'warn');
  assert.equal(coverageTone(coverage(7, 10)), 'warn');
  assert.equal(coverageTone(coverage(12, 22)), 'bad');
  assert.equal(coverageTone(coverage(0, 0)), 'neutral');
  // A faixa nunca sai só em cor.
  for (const sample of [coverage(20, 22), coverage(19, 22), coverage(12, 22), coverage(0, 0)]) assert.ok(coverageLabel(sample));
});

test('dias que faltaram: um, dois e muitos', () => {
  assert.equal(missingText(coverage(5, 5)), '');
  assert.equal(missingText(coverage(4, 5, ['2026-10-30'])), 'faltou 30/10');
  assert.equal(missingText(coverage(3, 5, ['2026-10-28', '2026-10-30'])), 'faltaram 28/10 e 30/10');
  const many = {
    expected: 22,
    launched: 12,
    missingCount: 10,
    missing: ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'],
  };
  assert.equal(missingText(many, 3), 'faltaram 05/10, 06/10, 07/10 e mais 7');
});

test('resumo: os três cartões novos entram depois dos seis antigos, e só o efetivo ganha oração', () => {
  assert.equal(periodIn(ref), 'na semana');
  const head = headcountSummary(headcount, ref);
  assert.equal(head.kpi.module, 'histograma');
  assert.equal(head.kpi.value, '84');
  assert.equal(head.kpi.tag?.text, '20/22 dias lançados');
  assert.equal(head.kpi.tag?.tone, 'good');
  const cards = restrictionsSummary(restrictions);
  assert.equal(cards.kpi.value, '4');
  assert.equal(cards.kpi.tone, 'bad');
  assert.deepEqual(cards.sentence, []);
  const sst = safetySummary(safety, ref);
  assert.equal(sst.kpi.value, '12');
  assert.equal(sst.kpi.tag?.text, '4 há mais de 7 dias');
  assert.deepEqual(sst.sentence, []);

  const summary = composeSummary({ efetivo: head, cards, seguranca: sst });
  assert.deepEqual(
    summary.kpis.map(kpi => kpi.module),
    ['histograma', 'restricoes', 'seguranca'],
  );
  assert.equal(MAX_KPIS, 9);
  const sentence = summary.sentence.map(segment => segment.text).join('');
  // A frase usa o número arredondado do cartão.
  assert.match(sentence, /efetivo médio na semana foi de 84 pessoas por dia útil/);
  assert.match(sentence, /20 de 22 dias úteis/);
  assert.doesNotMatch(sentence, /card|apontamento/);

  const empty = headcountSummary({ ...headcount, manDays: 0, dailyAverage: 0, peak: 0, coverage: coverage(0, 5) }, ref);
  assert.equal(empty.kpi.value, '—');
  assert.equal(empty.kpi.tone, 'bad');
});

const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);

test('os seis quadros renderizam na tela e no papel, com os números de exemplo', () => {
  for (const variant of ['screen', 'paper'] as const) {
    const balance = render(createElement(BalancePanel, { data: { lob, legalization }, variant, ctx }));
    assert.match(balance, /0,93/);
    assert.match(balance, /atenção/);
    assert.match(balance, /41% × 44%/);
    assert.match(balance, /peso por custo/);
    assert.match(balance, /9\/31/);
    assert.match(balance, /Vistoria do Corpo de Bombeiros/);
    assert.match(balance, /7 dias úteis de atraso/);
    assert.doesNotMatch(balance, /R\$/);

    const kanban = render(createElement(RestrictionsPanel, { data: restrictions, variant, ctx }));
    assert.match(kanban, /12 a fazer · 8 fazendo · 3 pausado/);
    assert.match(kanban, /Carla \(2 vencidos\)/);
    assert.match(kanban, /Concluídos na semana/);

    const crew = render(createElement(HeadcountPanel, { data: headcount, variant, ctx }));
    assert.match(crew, /20\/22/);
    assert.match(crew, /em dia/);
    assert.match(crew, /71%/);
    assert.match(crew, /faltaram 09\/10 e 30\/10/);
    assert.match(crew, /ATR \(próprio\)/);

    const output = render(createElement(ProductionPanel, { data: production, variant, ctx }));
    assert.match(output, /62%/);
    assert.match(output, /56 a medir/);
    assert.match(output, /8,4 m²\/Hd/);
    assert.match(output, /atenção/);

    const sst = render(createElement(SafetyPanel, { data: safety, variant, ctx }));
    assert.match(sst, /4 há mais de 7 dias/);
    assert.match(sst, /5,2 dias em média/);
    assert.match(sst, /Trabalho em altura/);

    const equipment = render(createElement(ChecklistPanel, { data: checklist, variant, ctx }));
    assert.match(equipment, /17\/21/);
    assert.match(equipment, /Betoneira 02/);
    assert.match(equipment, /hoje/);
    assert.match(equipment, /E mais 2/);

    // No papel cada quadro é um painel só; na tela, o corpo do módulo.
    for (const html of [balance, kanban, crew, output, sst, equipment])
      assert.match(html, variant === 'paper' ? /^<div class="dsh-panel dsh-xp">/ : /^<div class="dsh-mod-b /);
  }
});

test('quadros com recorte ativo avisam que mostram a obra inteira; sem dado, dizem o motivo', () => {
  const filtered = { ...ctx, filtered: true };
  for (const variant of ['screen', 'paper'] as const)
    assert.match(render(createElement(HeadcountPanel, { data: headcount, variant, ctx: filtered })), /não segue o recorte de empreiteiro/);
  assert.doesNotMatch(render(createElement(HeadcountPanel, { data: headcount, variant: 'screen', ctx })), /não segue o recorte/);

  const onlyLegalization = render(createElement(BalancePanel, { data: { legalization }, variant: 'screen', ctx }));
  assert.match(onlyLegalization, /Sem Linha de Balanço nesta obra/);
  const noIdp = render(
    createElement(BalancePanel, { data: { lob: { status: 'no-measurement', weighting: 'duration' } }, variant: 'screen', ctx }),
  );
  assert.match(noIdp, /Nenhuma medição fechada até a data/);
  assert.match(noIdp, /Sem Gantt de legalização/);

  const clean = render(createElement(ChecklistPanel, { data: { ...checklist, pending: 0, pendingList: [] }, variant: 'screen', ctx }));
  assert.match(clean, /Nenhum checklist vencido hoje/);
});

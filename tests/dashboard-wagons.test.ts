import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlanning } from '../src/application/use-cases/get-planning';
import type { Restriction } from '../src/domain/entities';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { createMockData, DEMO_DATE } from '../src/mocks/planning';
import { referenceOf, type DashboardFilters } from '../src/modules/dashboard/model';
import { resolvePeriod, type PeriodContext } from '../src/modules/dashboard/period';
import {
  buildWagonsPanel,
  overdueHint,
  producingLegend,
  restrictionsCallout,
  restrictionsSentence,
  taktSentence,
  wagonNumbersText,
  wagonsSentence,
  wagonsSummary,
  wagonsTexts,
} from '../src/modules/dashboard/wagons-panel';

/* Dados de exemplo (hoje = 08/09/2026): v1 terminal (22→26/08); v2 em produção 75% (27→31/08) com a dívida d1
 * aberta; v3 com restrição r1 (01→05/09, limite 09/09); v4 em produção 25% (06→10/09); v5 não iniciado
 * (11→15/09); v6 em produção 100% sem critério (01→05/09). */
const load = (data = createMockData()) => getPlanning(new MockPlanningRepository(data), DEMO_DATE);
const ref = (week: string) => referenceOf(week, DEMO_DATE, '2026-08-17');
const all: DashboardFilters = { week: '2026-09-07' };
const text = (segments: { text: string }[]) => segments.map(s => s.text).join('');
const stamp = { createdAt: '2026-08-20T12:00:00Z', updatedAt: '2026-09-08T12:00:00Z' };
const restriction = (over: Partial<Restriction> & Pick<Restriction, 'id' | 'wagonId'>): Restriction => ({
  ...stamp,
  description: 'Restrição de teste',
  responsibleId: 'user-1',
  dueDate: '2026-09-30',
  status: 'open',
  blocksExecution: false,
  blocksTerminality: false,
  boardStatus: 'identificada',
  ...over,
});

test('conta os vagões da obra por status, na ordem e com as cores da barra', async () => {
  const panel = buildWagonsPanel(await load(), 'obra-1', ref('2026-09-07'), all)!;
  assert.equal(panel.total, 6);
  assert.deepEqual(
    panel.byStatus.map(s => [s.status, s.label, s.value, s.color]),
    [
      ['terminal', 'Terminal', 1, '#1baf7a'],
      ['in_production', 'Em produção', 3, '#2a78d6'],
      ['restricted', 'Com restrição', 1, '#be123c'],
      ['not_started', 'Não iniciado', 1, '#c4d3df'],
    ],
  );
  assert.equal(panel.companyFiltered, false);
  assert.deepEqual(panel.sequences, [
    { name: 'Planejamento principal', takt: '5 dias corridos' },
    { name: 'Planejamento complementar', takt: '5 dias corridos' },
    { name: 'Ciclo piloto', takt: '5 dias corridos' },
  ]);
});

test('takt vencido é recalculado pelo sábado da semana analisada, não pelo hoje do servidor', async () => {
  const planning = await load();
  // Semana de 07/09: sábado 12/09. O v4 termina em 10/09, depois do hoje (08/09) mas antes do sábado: conta.
  const current = buildWagonsPanel(planning, 'obra-1', ref('2026-09-07'), all)!;
  assert.deepEqual(current.overdue, { count: 4, numbers: [2, 3, 4, 6] });
  assert.equal(planning.wagons.find(w => w.id === 'v4')?.overdue, false, 'o servidor, com o hoje, não o considera vencido');
  // Semana de 31/08: sábado 05/09. Só o v2 (31/08) terminou antes; v3 e v6 terminam no próprio dia 05/09.
  const earlier = buildWagonsPanel(planning, 'obra-1', ref('2026-08-31'), all)!;
  assert.deepEqual(earlier.overdue, { count: 1, numbers: [2] });
  // Vagão terminal nunca é takt vencido, mesmo com término passado.
  assert.ok(!current.overdue.numbers.includes(1));
  // Vagão com início depois da data continua na barra como não iniciado.
  assert.equal(earlier.byStatus.find(s => s.status === 'not_started')?.value, 1);
});

test('dívidas abertas: pendência de origem aberta, registrada até a data', async () => {
  const planning = await load();
  assert.equal(buildWagonsPanel(planning, 'obra-1', ref('2026-09-07'), all)!.openDebts, 1);
  // Semana anterior ao registro da dívida (criada em 20/08): fica fora.
  assert.equal(buildWagonsPanel(planning, 'obra-1', ref('2026-08-10'), all)!.openDebts, 0);
  // Pendência resolvida: a dívida deixa de contar.
  const data = createMockData();
  data.pendingItems[0].status = 'resolved';
  assert.equal(buildWagonsPanel(await load(data), 'obra-1', ref('2026-09-07'), all)!.openDebts, 0);
});

test('lista os três vagões em produção de maior progresso e o progresso ponderado do conjunto', async () => {
  const data = createMockData();
  // v5 passa a estar em produção (0%), para haver quatro e um ficar de fora.
  data.wagons[4].actualStart = '2026-09-11';
  const panel = buildWagonsPanel(await load(data), 'obra-1', ref('2026-09-07'), all)!;
  assert.equal(panel.producing, 4);
  assert.deepEqual(
    panel.producingList.map(w => [w.number, w.progress, w.overdue, w.plannedStart, w.plannedEnd]),
    [
      [6, 100, true, '2026-09-01', '2026-09-05'],
      [2, 75, true, '2026-08-27', '2026-08-31'],
      [4, 25, true, '2026-09-06', '2026-09-10'],
    ],
  );
  // (100 + 75 + 25 + 0) × 3 de peso cada vagão / 12.
  assert.equal(panel.producingProgress, 50);
  assert.equal(producingLegend(panel), '4 vagões em produção; os 3 de maior progresso acima. Dívidas de terminalidade abertas: 1.');
});

test('sem vagão em produção o progresso fica ausente e a legenda diz isso', async () => {
  const data = createMockData();
  for (const activity of data.activities) {
    activity.progress = 0;
    activity.status = 'not_started';
  }
  for (const wagon of data.wagons) wagon.actualStart = undefined;
  data.criteria[0].fulfilled = false;
  const panel = buildWagonsPanel(await load(data), 'obra-1', ref('2026-09-07'), all)!;
  assert.equal(panel.producing, 0);
  assert.equal(panel.producingProgress, undefined);
  assert.deepEqual(panel.producingList, []);
  assert.equal(producingLegend(panel), 'Nenhum vagão em produção. Dívidas de terminalidade abertas: 1.');
});

test('restrições por coluna, abertas e vencidas pelo limite do lead time', async () => {
  const data = createMockData();
  data.restrictions.push(
    // Lead time 10 dias sobre a4 (início 06/09): limite 27/08, e a data gravada (2030) é ignorada.
    restriction({
      id: 'r2',
      wagonId: 'v4',
      activityId: 'a4',
      leadTimeDays: 10,
      dueDate: '2030-01-01',
      boardStatus: 'em_tratativa',
      blocksTerminality: true,
    }),
    // Resolvida: conta na coluna "resolvida", nunca como aberta ou vencida.
    restriction({
      id: 'r3',
      wagonId: 'v2',
      dueDate: '2026-08-01',
      status: 'resolved',
      boardStatus: 'em_tratativa',
      resolvedAt: '2026-08-15T10:00:00Z',
    }),
    // Em tratativa com limite depois da data: aberta, não vencida.
    restriction({ id: 'r4', wagonId: 'v5', dueDate: '2026-09-20', boardStatus: 'em_tratativa' }),
  );
  const planning = await load(data);
  const r = buildWagonsPanel(planning, 'obra-1', ref('2026-09-07'), all)!.restrictions;
  assert.equal(r.identified, 1);
  assert.equal(r.inTreatment, 2);
  assert.equal(r.resolved, 1);
  assert.equal(r.open, 3);
  assert.equal(r.overdue, 2);
  assert.equal(r.overdueBlockingExecution, 1);
  assert.equal(r.overdueBlockingTerminality, 2);
  // Da mais atrasada (r2, 27/08) à menos (r1, 09/09).
  assert.deepEqual(r.overdueSamples, ['Vagão 04, Restrição de teste', 'Vagão 03, Material de revestimento aguardando entrega']);
  // Na semana de 31/08 (sábado 05/09) só r2 está vencida: o limite de r1 (09/09) ainda não passou.
  const earlier = buildWagonsPanel(planning, 'obra-1', ref('2026-08-31'), all)!.restrictions;
  assert.equal(earlier.overdue, 1);
  assert.deepEqual(earlier.overdueSamples, ['Vagão 04, Restrição de teste']);
  // Registrada depois da data: fora de todas as contagens.
  const before = buildWagonsPanel(planning, 'obra-1', ref('2026-08-10'), all)!.restrictions;
  assert.deepEqual(before, {
    identified: 0,
    inTreatment: 0,
    resolved: 0,
    open: 0,
    overdue: 0,
    overdueBlockingExecution: 0,
    overdueBlockingTerminality: 0,
    overdueSamples: [],
  });
});

test('o aviso de restrições muda com o que há: nenhuma registrada, nenhuma aberta, nenhuma vencida, vencidas', async () => {
  const base = createMockData();
  const at = ref('2026-09-07');
  const none = createMockData();
  none.restrictions = [];
  assert.deepEqual(restrictionsCallout(buildWagonsPanel(await load(none), 'obra-1', at, all)!), {
    tone: 'neutral',
    text: 'Nenhuma restrição registrada nos vagões desta obra.',
  });
  const resolved = createMockData();
  resolved.restrictions[0].status = 'resolved';
  assert.deepEqual(restrictionsCallout(buildWagonsPanel(await load(resolved), 'obra-1', at, all)!), {
    tone: 'neutral',
    text: 'Nenhuma restrição aberta: 1 resolvida.',
  });
  assert.deepEqual(restrictionsCallout(buildWagonsPanel(await load(base), 'obra-1', ref('2026-08-31'), all)!), {
    tone: 'neutral',
    text: 'Nenhuma restrição vencida entre as 1 aberta.',
  });
  assert.deepEqual(restrictionsCallout(buildWagonsPanel(await load(base), 'obra-1', at, all)!), {
    tone: 'alert',
    text: '1 restrição vencida, a única aberta: Vagão 03, Material de revestimento aguardando entrega. 1 bloqueia execução e 1 bloqueia terminalidade.',
  });
  const many = createMockData();
  many.restrictions.push(
    restriction({ id: 'r2', wagonId: 'v4', dueDate: '2026-09-01', description: 'Projeto sem aprovação', blocksExecution: true }),
    restriction({ id: 'r3', wagonId: 'v5', dueDate: '2026-09-02', description: 'Equipe não contratada' }),
    restriction({ id: 'r4', wagonId: 'v6', dueDate: '2026-09-03', description: 'Andaime sem laudo' }),
    restriction({ id: 'r5', wagonId: 'v2', dueDate: '2026-09-30', description: 'Fora do prazo ainda' }),
  );
  const callout = restrictionsCallout(buildWagonsPanel(await load(many), 'obra-1', at, all)!);
  assert.equal(callout.tone, 'alert');
  assert.equal(
    callout.text,
    '4 restrições vencidas entre as 5 abertas: Vagão 04, Projeto sem aprovação; Vagão 05, Equipe não contratada; Vagão 06, Andaime sem laudo e mais 1. 2 bloqueiam execução e 1 bloqueia terminalidade.',
  );
});

test('filtro de empreiteiro: só vagões com atividade de equipe da empresa, progresso só dessas atividades', async () => {
  const data = createMockData();
  // Revestimentos (a*) com a SM MARTINS; elétrica (b*) com a ATR ENG, exceto no v5, que fica sem equipe.
  for (const activity of data.activities) {
    if (activity.id.startsWith('a')) activity.teamId = 'equipe-1';
    else if (activity.wagonId !== 'v5') activity.teamId = 'equipe-2';
  }
  // No v4 as duas frentes divergem: 50% em revestimentos (peso 2) e 0% em elétrica (peso 1).
  const a4 = data.activities.find(a => a.id === 'a4')!;
  const b4 = data.activities.find(a => a.id === 'b4')!;
  a4.progress = 50;
  b4.progress = 0;
  b4.status = 'not_started';
  // Restrição só no v5, que a ATR não alcança.
  data.restrictions.push(restriction({ id: 'r2', wagonId: 'v5', dueDate: '2026-08-01' }));
  const planning = await load(data);
  const at = ref('2026-09-07');

  const everyone = buildWagonsPanel(planning, 'obra-1', at, all)!;
  assert.equal(everyone.total, 6);
  assert.equal(Math.round(everyone.producingList.find(w => w.number === 4)!.progress), 33);
  assert.equal(everyone.restrictions.open, 2);

  // A comparação ignora caixa e acento.
  const sm = buildWagonsPanel(planning, 'obra-1', at, { ...all, companies: new Set(['sm martins']) })!;
  assert.equal(sm.companyFiltered, true);
  assert.equal(sm.total, 6);
  assert.equal(sm.producingList.find(w => w.number === 4)!.progress, 50);
  assert.equal(sm.restrictions.open, 2);

  const atr = buildWagonsPanel(planning, 'obra-1', at, { ...all, companies: new Set(['ATR ENG']) })!;
  assert.equal(atr.total, 5, 'o v5 não tem atividade da ATR');
  assert.equal(atr.byStatus.find(s => s.status === 'not_started')?.value, 0);
  assert.equal(atr.producingList.find(w => w.number === 4)!.progress, 0);
  assert.equal(atr.restrictions.open, 1, 'a restrição do v5 sai com ele');
  assert.deepEqual(atr.overdue.numbers, [2, 3, 4, 6]);

  // Empresa que não está em nenhuma equipe: módulo com dado, mas o recorte não deixa vagão.
  const nobody = buildWagonsPanel(planning, 'obra-1', at, { ...all, companies: new Set(['Outra']) })!;
  assert.equal(nobody.total, 0);
  assert.equal(nobody.producing, 0);
  assert.equal(nobody.restrictions.open, 0);
  assert.ok(nobody.byStatus.every(s => s.value === 0));
});

test('o filtro de pavimento não se aplica ao quadro', async () => {
  const planning = await load();
  const at = ref('2026-09-07');
  assert.deepEqual(
    buildWagonsPanel(planning, 'obra-1', at, { ...all, floors: new Set(['terreo']) }),
    buildWagonsPanel(planning, 'obra-1', at, all),
  );
});

test('obra sem vagão ou inexistente: módulo sem dado', async () => {
  const planning = await load();
  assert.equal(buildWagonsPanel(planning, 'obra-2', ref('2026-09-07'), all), undefined);
  assert.equal(buildWagonsPanel(planning, 'inexistente', ref('2026-09-07'), all), undefined);
});

test('cartões do resumo: takt vencido e restrições vencidas, tons e frases no plural', async () => {
  const data = createMockData();
  data.restrictions.push(restriction({ id: 'r2', wagonId: 'v4', activityId: 'a4', leadTimeDays: 10, blocksExecution: true }));
  const at = ref('2026-09-07');
  const panel = buildWagonsPanel(await load(data), 'obra-1', at, all)!;
  const { takt, restrictions } = wagonsSummary(panel, at);
  assert.deepEqual(takt.kpi, {
    module: 'vagoes',
    label: 'Takt vencido',
    value: '4',
    tag: { text: 'vagões', tone: 'warn' },
    hint: 'De 2 em produção · 2 com restrição aberta',
    tone: 'warn',
  });
  assert.equal(text(takt.sentence), '4 vagões estão com o takt vencido');
  assert.deepEqual(restrictions.kpi, {
    module: 'vagoes',
    label: 'Restrições vencidas',
    value: '2',
    tag: { text: 'de 2 abertas', tone: 'bad' },
    hint: '2 bloqueiam execução · prazo pelo lead time',
    tone: 'bad',
  });
  assert.equal(text(restrictions.sentence), '2 restrições venceram');
  assert.equal(text(wagonsSentence(panel)), '4 vagões estão com o takt vencido e 2 restrições venceram.');
  assert.deepEqual(
    wagonsSentence(panel)
      .filter(s => s.strong)
      .map(s => s.text),
    ['4 vagões', '2 restrições'],
  );
});

test('cartões do resumo no singular', async () => {
  const data = createMockData();
  // Semana de 31/08 (sábado 05/09): só o v2 vencido; r2 (limite 27/08 pelo lead time) é a única vencida.
  data.restrictions.push(restriction({ id: 'r2', wagonId: 'v4', activityId: 'a4', leadTimeDays: 10, blocksExecution: true }));
  const at = ref('2026-08-31');
  const panel = buildWagonsPanel(await load(data), 'obra-1', at, all)!;
  const { takt, restrictions } = wagonsSummary(panel, at);
  assert.equal(takt.kpi.value, '1');
  assert.deepEqual(takt.kpi.tag, { text: 'vagão', tone: 'warn' });
  assert.equal(text(takt.sentence), 'Um vagão está com o takt vencido');
  assert.equal(restrictions.kpi.value, '1');
  assert.deepEqual(restrictions.kpi.tag, { text: 'de 2 abertas', tone: 'bad' });
  assert.equal(restrictions.kpi.hint, '1 bloqueia execução · prazo pelo lead time');
  assert.equal(text(restrictions.sentence), 'Uma restrição venceu');
  assert.equal(text(wagonsSentence(panel)), 'Um vagão está com o takt vencido e uma restrição venceu.');
});

test('cartões do resumo com zero: tons bons e a frase negativa', async () => {
  const planning = await load();
  // Semana de 10/08 (sábado 15/08): nenhum vagão terminou e a restrição ainda não existia.
  const at = ref('2026-08-10');
  const panel = buildWagonsPanel(planning, 'obra-1', at, all)!;
  const { takt, restrictions } = wagonsSummary(panel, at);
  assert.equal(takt.kpi.value, '0');
  assert.deepEqual(takt.kpi.tag, { text: 'em dia', tone: 'good' });
  assert.equal(takt.kpi.tone, undefined);
  assert.equal(restrictions.kpi.value, '0');
  assert.deepEqual(restrictions.kpi.tag, { text: 'nenhuma aberta', tone: 'good' });
  assert.equal(restrictions.kpi.hint, 'Nenhuma vencida até 15/08 · prazo pelo lead time');
  assert.equal(restrictions.kpi.tone, undefined);
  assert.equal(text(wagonsSentence(panel)), 'Nenhum vagão com takt vencido e nenhuma restrição vencida.');
  assert.ok(taktSentence(panel).every(s => !s.strong) && restrictionsSentence(panel).every(s => !s.strong));
  // Aberta mas não vencida: o selo diz quantas há, no singular.
  const open = wagonsSummary(buildWagonsPanel(planning, 'obra-1', ref('2026-08-31'), all)!, ref('2026-08-31')).restrictions.kpi;
  assert.deepEqual(open.tag, { text: 'de 1 aberta', tone: 'good' });
});

test('lista de números de vagão com até três no texto', () => {
  assert.equal(wagonNumbersText([]), '');
  assert.equal(wagonNumbersText([2]), 'Vagão 02');
  assert.equal(wagonNumbersText([2, 3]), 'Vagões 02 e 03');
  assert.equal(wagonNumbersText([2, 3, 4]), 'Vagões 02, 03 e 04');
  assert.equal(wagonNumbersText([2, 3, 4, 6, 12]), 'Vagões 02, 03, 04 e mais 2');
});

// ─── Escalas de tempo (04/11/2026, regra 9) ──────────────────────────────────────────────────────────
/* Agosto de 2026 tem as semanas de 03/08 a 31/08: o período vai da segunda 03/08 ao sábado 05/09, e o
 * retrato é tirado nesse sábado, o mesmo da semana de 31/08. */
const periodCtx: PeriodContext = { currentWeek: '2026-09-07', since: '2026-08-03', anchorWeek: '2026-09-07' };
const monthRef = (key: string) => referenceOf('2026-09-07', DEMO_DATE, '2026-08-17', resolvePeriod({ scale: 'mes', key }, periodCtx));
/** Restrições em volta de agosto: antes, nas bordas (segunda inicial e sábado final, inclusive) e depois. */
const aroundAugust = () => [
  restriction({
    id: 'antes',
    wagonId: 'v2',
    createdAt: '2026-07-20T12:00:00Z',
    status: 'resolved',
    boardStatus: 'resolvida',
    resolvedAt: '2026-08-01T12:00:00Z',
  }),
  restriction({
    id: 'segunda',
    wagonId: 'v2',
    createdAt: '2026-07-25T12:00:00Z',
    status: 'resolved',
    boardStatus: 'resolvida',
    resolvedAt: '2026-08-03T09:00:00Z',
  }),
  restriction({
    id: 'dentro',
    wagonId: 'v4',
    createdAt: '2026-08-10T12:00:00Z',
    status: 'resolved',
    boardStatus: 'resolvida',
    resolvedAt: '2026-09-05T20:00:00Z',
  }),
  restriction({ id: 'sabado', wagonId: 'v5', createdAt: '2026-09-05T15:00:00Z' }),
  restriction({
    id: 'depois',
    wagonId: 'v5',
    createdAt: '2026-09-06T12:00:00Z',
    status: 'resolved',
    boardStatus: 'resolvida',
    resolvedAt: '2026-09-07T12:00:00Z',
  }),
  restriction({
    id: 'resolvida-depois',
    wagonId: 'v6',
    createdAt: '2026-08-12T12:00:00Z',
    status: 'resolved',
    boardStatus: 'resolvida',
    resolvedAt: '2026-09-07T12:00:00Z',
  }),
];

test('período: restrições resolvidas e criadas entre a segunda inicial e o sábado final, bordas inclusive', async () => {
  const data = createMockData();
  data.restrictions.push(...aroundAugust());
  const planning = await load(data);
  const august = buildWagonsPanel(planning, 'obra-1', monthRef('2026-08'), all)!;
  // Resolvidas: "segunda" (03/08) e "dentro" (05/09); "antes" (01/08) e as resolvidas em 07/09 ficam fora.
  // Criadas: r1 do exemplo (20/08), "dentro", "sabado" e "resolvida-depois"; "depois" (06/09) já é setembro.
  assert.deepEqual(august.period, { start: '2026-08-03', end: '2026-09-05', restrictionsResolved: 2, restrictionsCreated: 4 });
  assert.equal(august.scale, 'mes');
  assert.equal(august.refDate, '2026-09-05');
  // Na semanal o fluxo também sai (o Dashboard geral usa), só que da semana: "dentro" resolvida e "sabado" criada.
  const week = buildWagonsPanel(planning, 'obra-1', ref('2026-08-31'), all)!;
  assert.deepEqual(week.period, { start: '2026-08-31', end: '2026-09-05', restrictionsResolved: 1, restrictionsCreated: 1 });
  assert.equal(week.scale, 'semana');
  // Setembro (parcial até a semana de 07/09, sábado 12/09): as resolvidas em 07/09 e "depois", criada em 06/09.
  const september = buildWagonsPanel(planning, 'obra-1', monthRef('2026-09'), all)!;
  assert.deepEqual(september.period, { start: '2026-09-07', end: '2026-09-12', restrictionsResolved: 2, restrictionsCreated: 0 });
});

test('período: o retrato do mês é o do sábado final, igual ao da última semana', async () => {
  const data = createMockData();
  data.restrictions.push(...aroundAugust());
  const planning = await load(data);
  const { period: _monthFlow, scale: _month, ...august } = buildWagonsPanel(planning, 'obra-1', monthRef('2026-08'), all)!;
  const { period: _weekFlow, scale: _week, ...lastWeek } = buildWagonsPanel(planning, 'obra-1', ref('2026-08-31'), all)!;
  assert.deepEqual(august, lastWeek);
});

test('período: o recorte de empreiteiro vale também para o fluxo de restrições', async () => {
  const data = createMockData();
  // Como no teste do filtro: revestimentos com a SM MARTINS, elétrica com a ATR ENG, e o v5 sem equipe.
  for (const activity of data.activities) {
    if (activity.id.startsWith('a')) activity.teamId = 'equipe-1';
    else if (activity.wagonId !== 'v5') activity.teamId = 'equipe-2';
  }
  data.restrictions.push(
    restriction({ id: 'v5-criada', wagonId: 'v5', createdAt: '2026-08-10T12:00:00Z' }),
    restriction({
      id: 'v5-resolvida',
      wagonId: 'v5',
      createdAt: '2026-08-10T12:00:00Z',
      status: 'resolved',
      boardStatus: 'resolvida',
      resolvedAt: '2026-08-20T12:00:00Z',
    }),
    restriction({
      id: 'v4-resolvida',
      wagonId: 'v4',
      createdAt: '2026-08-11T12:00:00Z',
      status: 'resolved',
      boardStatus: 'resolvida',
      resolvedAt: '2026-08-21T12:00:00Z',
    }),
  );
  const planning = await load(data);
  const at = monthRef('2026-08');
  const everyone = buildWagonsPanel(planning, 'obra-1', at, all)!.period;
  assert.deepEqual([everyone.restrictionsResolved, everyone.restrictionsCreated], [2, 4]);
  // A ATR não alcança o v5: as duas restrições dele saem do fluxo, como saem do retrato.
  const atr = buildWagonsPanel(planning, 'obra-1', at, { ...all, companies: new Set(['atr eng']) })!.period;
  assert.deepEqual([atr.restrictionsResolved, atr.restrictionsCreated], [1, 2]);
  const nobody = buildWagonsPanel(planning, 'obra-1', at, { ...all, companies: new Set(['Outra']) })!.period;
  assert.deepEqual([nobody.restrictionsResolved, nobody.restrictionsCreated], [0, 0]);
});

test('fora da semanal os textos dizem o dia do retrato e o bloco de restrições ganha as resolvidas no período', async () => {
  const data = createMockData();
  data.restrictions.push(...aroundAugust());
  const planning = await load(data);
  const week = wagonsTexts(buildWagonsPanel(planning, 'obra-1', ref('2026-08-31'), all)!);
  assert.deepEqual(week, {
    statusNote: 'Na data analisada.',
    restrictionsNote: 'Coluna atual do quadro; vencidas pelo limite do lead time.',
    paperStatusNote: 'Status atual; takt vencido pela data analisada.',
    paperRestrictionsNote:
      'Coluna atual do quadro de restrições; vencida é a aberta com limite (início previsto menos lead time) antes da data.',
    resolvedInPeriod: undefined,
  });
  const month = wagonsTexts(buildWagonsPanel(planning, 'obra-1', monthRef('2026-08'), all)!);
  assert.deepEqual(month, {
    statusNote: 'Em 05/09.',
    restrictionsNote: 'Coluna atual do quadro; vencidas em 05/09 pelo limite do lead time.',
    paperStatusNote: 'Status atual; takt vencido em 05/09.',
    paperRestrictionsNote:
      'Coluna atual do quadro de restrições; vencida é a aberta com limite (início previsto menos lead time) antes de 05/09.',
    resolvedInPeriod: 'Restrições resolvidas no mês: 2',
  });
  // O 3º trimestre vai até a semana atual (07/09, sábado 12/09): entram também as resolvidas em 01/08 e 07/09.
  const quarter = referenceOf('2026-09-07', DEMO_DATE, '2026-08-17', resolvePeriod({ scale: 'trimestre', key: '2026-T3' }, periodCtx));
  assert.equal(wagonsTexts(buildWagonsPanel(planning, 'obra-1', quarter, all)!).resolvedInPeriod, 'Restrições resolvidas no trimestre: 5');
  // Sem vagão vencido, a dica do takt também diz o dia (personalizado de uma semana, sábado 15/08).
  const customRef = referenceOf(
    '2026-09-07',
    DEMO_DATE,
    '2026-08-17',
    resolvePeriod({ scale: 'personalizado', from: '2026-08-10', to: '2026-08-15' }, periodCtx),
  );
  assert.equal(overdueHint(buildWagonsPanel(planning, 'obra-1', customRef, all)!), 'Nenhum vagão com término previsto antes de 15/08');
  assert.equal(
    overdueHint(buildWagonsPanel(planning, 'obra-1', ref('2026-08-10'), all)!),
    'Nenhum vagão com término previsto antes da data',
  );
});

test('cartões do resumo fora da semanal: "em 05/09" nas dicas e as resolvidas no período', async () => {
  const data = createMockData();
  data.restrictions.push(
    restriction({ id: 'r2', wagonId: 'v4', activityId: 'a4', leadTimeDays: 10, blocksExecution: true }),
    ...aroundAugust(),
  );
  const planning = await load(data);
  const weekRef = ref('2026-08-31');
  const weekly = wagonsSummary(buildWagonsPanel(planning, 'obra-1', weekRef, all)!, weekRef);
  const at = monthRef('2026-08');
  const panel = buildWagonsPanel(planning, 'obra-1', at, all)!;
  const { takt, restrictions } = wagonsSummary(panel, at);
  // Os números são os do retrato no sábado final, os mesmos da semana de 31/08; só as dicas mudam.
  assert.equal(takt.kpi.value, weekly.takt.kpi.value);
  assert.equal(restrictions.kpi.value, weekly.restrictions.kpi.value);
  assert.deepEqual(restrictions.kpi.tag, weekly.restrictions.kpi.tag);
  assert.equal(weekly.takt.kpi.hint, `De ${panel.producing} em produção · 2 com restrição aberta`);
  assert.equal(takt.kpi.hint, `Em 05/09 · de ${panel.producing} em produção · 2 com restrição aberta`);
  assert.equal(weekly.restrictions.kpi.hint, '1 bloqueia execução · prazo pelo lead time');
  assert.equal(restrictions.kpi.hint, 'Em 05/09 · 1 bloqueia execução · 2 resolvidas no mês');
  assert.equal(text(restrictions.sentence), text(weekly.restrictions.sentence));
  // Sem vencida: "Nenhuma vencida em 15/08", com a resolvida no singular.
  const calm = createMockData();
  calm.restrictions.push(
    restriction({
      id: 'r9',
      wagonId: 'v2',
      createdAt: '2026-08-10T12:00:00Z',
      status: 'resolved',
      boardStatus: 'resolvida',
      resolvedAt: '2026-08-12T12:00:00Z',
    }),
  );
  const custom = referenceOf(
    '2026-09-07',
    DEMO_DATE,
    '2026-08-17',
    resolvePeriod({ scale: 'personalizado', from: '2026-08-10', to: '2026-08-15' }, periodCtx),
  );
  const calmSummary = wagonsSummary(buildWagonsPanel(await load(calm), 'obra-1', custom, all)!, custom).restrictions.kpi;
  assert.equal(calmSummary.hint, 'Nenhuma vencida em 15/08 · 1 resolvida no período');
});

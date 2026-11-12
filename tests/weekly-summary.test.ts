import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brasiliaClock,
  buildWeeklySummary,
  coverageCell,
  joinList,
  lastClosedWeek,
  manualIdempotencyKey,
  payloadBytes,
  planningCell,
  WEEKLY_PAYLOAD_BUDGET,
  weeklyDashboardLink,
  weeklyIdempotencyKey,
  weeklyPayload,
  weeklySendDue,
  type WeeklyLine,
  type WeeklyWorkInput,
} from '../src/domain/weekly-summary';
import { weeklySchedulerEnabled, weeklyTick, type WeeklyTickState } from '../src/infrastructure/weekly-summary-scheduler';
import type { ExtrasCell, HeadcountBlock, ProductionBlock, WorkdayCoverage, WorkExtras } from '../src/modules/dashboard/extras/types';
import type { PortfolioSafety } from '../src/modules/dashboard/portfolio/types';

// Resumo semanal por e-mail (12/11/2026): regras 12 a 20 do modelo "Dashboards completos e resumo semanal".
const WEEK = '2026-11-09'; // segunda-feira
const DAYS = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];

const lines = (yes: number, no: number, open = 0, cause = 'Falta de material'): WeeklyLine[] => [
  ...Array.from({ length: yes }, () => ({ fulfilled: true })),
  ...Array.from({ length: no }, () => ({ fulfilled: false, cause })),
  ...Array.from({ length: open }, () => ({})),
];
const coverage = (missing: string[] = [], expected = 5): WorkdayCoverage => ({
  expected,
  launched: expected - missing.length,
  missing,
  missingCount: missing.length,
});
const headcount = (missing: string[] = [], dailyAverage = 84): ExtrasCell<HeadcountBlock> => ({
  kind: 'ready',
  data: {
    manDays: 420,
    dailyAverage,
    peak: 103,
    contractorShare: 0.7,
    coverage: coverage(missing),
    series: [],
    seriesGrain: 'semana',
    companies: [],
  },
});
const production = (missing: string[] = [], measuredShare: number | undefined = 0.62): ExtrasCell<ProductionBlock> => ({
  kind: 'ready',
  data: {
    entries: 30,
    measured: 18,
    pending: 12,
    manDays: 120,
    ...(measuredShare !== undefined ? { measuredShare } : {}),
    coverage: coverage(missing),
    services: [],
  },
});
const safety = (openOver7: number): ExtrasCell<PortfolioSafety> => ({
  kind: 'ready',
  data: { open: openOver7 + 2, openAtStart: 3, openOver7, opened: 4, resolved: 2, byConsequence: [], byType: [] },
});
const work = (name: string, weekLines: WeeklyLine[], extras: Omit<WorkExtras, 'workId'> = {}): WeeklyWorkInput => ({
  work: { id: name.toLowerCase().replace(/\s+/g, '-'), name, code: name.slice(0, 3).toUpperCase() },
  lines: weekLines,
  extras: { workId: name, ...extras },
});

// As seis obras do modelo aprovado.
const MODEL: WeeklyWorkInput[] = [
  work('Horizonte', lines(25, 4), {
    headcount: headcount(),
    production: production(),
    safety: safety(4),
    checklist: {
      kind: 'ready',
      data: { equipment: 14, due: 21, pending: 4, pendingList: [], runsInPeriod: 96, runsWithNonConformity: 3, nonConformities: 6 },
    },
  }),
  work('Mirante', lines(30, 7), { headcount: headcount([], 61), production: production(['2026-11-11', '2026-11-13'], 0.38) }),
  work('Jardins', lines(17, 6), { headcount: headcount(['2026-11-13'], 47), production: production([], 0.71) }),
  work('Aurora', [...lines(18, 5), ...lines(0, 8, 0, 'Chuva')], {
    headcount: headcount([], 112),
    production: production(DAYS),
    restrictions: {
      kind: 'ready',
      data: {
        asOf: '2026-11-13',
        open: 12,
        byStatus: { todo: 6, doing: 5, paused: 1 },
        overdue: 7,
        startOverdue: 1,
        doneInPeriod: 2,
        cancelledInPeriod: 0,
        createdInPeriod: 3,
        byResponsible: [],
      },
    },
    safety: safety(5),
  }),
  work('Vista Mar', lines(15, 4, 12), {
    headcount: headcount(['2026-11-11', '2026-11-12', '2026-11-13'], 30),
    production: production([], 0.45),
  }),
  work('Parque', lines(19, 4), { headcount: headcount([], 39), production: production([], 0.8) }),
];

test('planejamento: 80% cumpre, 70 a 79% é parcial, abaixo não cumpre; linha sem status = não apurou; sem linha = sem programação', () => {
  assert.deepEqual(planningCell(lines(25, 4)), { verdict: 'c', detail: 'PPC 86% · 25 de 29', percent: 86, planned: 29, yes: 25 });
  assert.equal(planningCell(lines(8, 2)).verdict, 'c');
  assert.equal(planningCell(lines(79, 21)).verdict, 'p');
  assert.equal(planningCell(lines(7, 3)).verdict, 'p');
  assert.equal(planningCell(lines(69, 31)).verdict, 'n');
  // O corte é sobre o PPC arredondado, como o dashboard mostra: 79,6% aparece como 80%.
  assert.equal(planningCell(lines(199, 51)).verdict, 'c');
  assert.deepEqual(planningCell(lines(15, 4, 12)), { verdict: 'a', detail: '12 de 31 linhas sem status', planned: 31, yes: 15 });
  assert.deepEqual(planningCell([]), { verdict: 's', detail: 'nenhuma linha na semana', planned: 0, yes: 0 });
});

test('histograma e produtividade: todos os dias úteis esperados, ou os dias que faltaram', () => {
  assert.deepEqual(coverageCell(headcount(), 'efetivo 84'), { verdict: 'c', detail: '5 de 5 dias · efetivo 84' });
  assert.deepEqual(coverageCell(headcount(['2026-11-11', '2026-11-13'])), { verdict: 'n', detail: '3 de 5 dias · faltou qua e sex' });
  assert.deepEqual(coverageCell(headcount(['2026-11-11', '2026-11-12', '2026-11-13'])), {
    verdict: 'n',
    detail: '2 de 5 dias · faltou qua, qui e sex',
  });
  assert.deepEqual(coverageCell(production(DAYS)), { verdict: 'z', detail: '0 de 5 dias' });
  // Feriado nacional já vem fora de `expected`: quatro dias úteis, quatro lançados, cumpriu.
  assert.equal(coverageCell({ kind: 'ready', data: { coverage: coverage([], 4) } }).detail, '4 de 4 dias');
  assert.equal(coverageCell({ kind: 'absent' }).verdict, 'u');
  assert.equal(coverageCell({ kind: 'unavailable' }).verdict, 'i');
  assert.equal(coverageCell({ kind: 'error', message: 'x' }).verdict, 'i');
  assert.equal(coverageCell(undefined).verdict, 'i');
  assert.equal(joinList(['seg']), 'seg');
});

test('o resumo das seis obras do modelo: placar, ordem, frase, assunto e pontos de atenção', () => {
  const summary = buildWeeklySummary({ week: '2026-11-11', works: MODEL });
  assert.equal(summary.week, WEEK);
  assert.equal(summary.friday, '2026-11-13');
  assert.deepEqual(summary.score, {
    planning: { ok: 3, of: 6 },
    headcount: { ok: 4, of: 6 },
    production: { ok: 4, of: 6 },
    all: { ok: 2, of: 6 },
  });
  // Quem cumpriu tudo primeiro, depois por número de itens cumpridos, depois pelo nome.
  assert.deepEqual(
    summary.rows.map(row => row.work.name),
    ['Horizonte', 'Parque', 'Mirante', 'Aurora', 'Jardins', 'Vista Mar'],
  );
  // Σ/Σ das obras apuradas (Vista Mar fica fora): 109 de 143.
  assert.equal(summary.percent, 76);
  assert.equal(summary.subject, 'Resumo da semana 09/11 a 13/11: 2 de 6 obras cumpriram tudo');
  assert.equal(
    summary.sentence,
    'Na semana de 09/11 a 13/11, 3 de 6 obras cumpriram o planejamento, com PPC de 76% somando as obras. O histograma foi lançado todos os dias em 4 de 6 obras e a produtividade em 4 de 6. Horizonte e Parque cumpriram os três.',
  );
  assert.deepEqual(summary.attention, [
    'Aurora: PPC de 58%; principal causa, Chuva (8 de 13 não cumpridos).',
    'Sem apuração do curto prazo: Vista Mar.',
    '7 cards vencidos no Quadro de Restrições, todos na Aurora.',
    '9 apontamentos de segurança abertos há mais de 7 dias, 5 na Aurora.',
    '4 checklists de equipamento vencidos, todos na Horizonte.',
  ]);
  const aurora = summary.rows.find(row => row.work.name === 'Aurora')!;
  assert.deepEqual(aurora.production, { verdict: 'z', detail: '0 de 5 dias' });
  assert.equal(summary.rows[0].headcount.detail, '5 de 5 dias · efetivo 84');
  assert.equal(summary.rows[0].production.detail, '5 de 5 dias · 62% medido');
});

test('obra que não usa o módulo fica fora do placar dele e ainda pode cumprir tudo; leitura que falhou vira indisponível', () => {
  const summary = buildWeeklySummary({
    week: WEEK,
    works: [
      work('Alfa', lines(9, 1), { headcount: headcount(), production: { kind: 'absent' } }),
      work('Beta', lines(9, 1), { headcount: { kind: 'error', message: 'falhou' }, production: production() }),
      { work: { id: 'gama', name: 'Gama', code: 'GAM' }, lines: [] },
    ],
  });
  assert.deepEqual(summary.score.headcount, { ok: 1, of: 1 });
  assert.deepEqual(summary.score.production, { ok: 1, of: 1 });
  assert.deepEqual(summary.score.all, { ok: 2, of: 3 });
  const gama = summary.rows.find(row => row.work.name === 'Gama')!;
  assert.equal(gama.planning.verdict, 's');
  assert.equal(gama.headcount.verdict, 'i');
  assert.match(summary.attention[0], /^Sem programação na semana: Gama\.$/);
  assert.match(summary.sentence, /Alfa e Beta cumpriram os três\.$/);
  assert.equal(summary.subject, 'Resumo da semana 09/11 a 13/11: 2 de 3 obras cumpriram tudo');
});

test('sem obra nenhuma e com todas cumprindo, a frase continua correta', () => {
  const empty = buildWeeklySummary({ week: WEEK, works: [] });
  assert.equal(empty.percent, undefined);
  assert.equal(empty.sentence, 'Na semana de 09/11 a 13/11, 0 de 0 obras cumpriram o planejamento.');
  assert.deepEqual(empty.attention, []);
  const all = buildWeeklySummary({ week: WEEK, works: [work('Só', lines(10, 0), { headcount: headcount(), production: production() })] });
  assert.match(all.sentence, /1 de 1 obra cumpriu o planejamento, com PPC de 100% somando as obras\./);
  assert.match(all.sentence, /Todas as obras cumpriram os três\.$/);
  assert.equal(all.subject, 'Resumo da semana 09/11 a 13/11: 1 de 1 obra cumpriu tudo');
});

test('payload: contrato do modelo, link só https e teto de bytes com 12 obras de nome longo', () => {
  const summary = buildWeeklySummary({ week: WEEK, works: MODEL });
  const payload = weeklyPayload(summary, { firstName: 'Bruno', link: weeklyDashboardLink('https://obra360.example.com/', WEEK) });
  assert.equal(payload.semana, WEEK);
  assert.equal(payload.primeiroNome, 'Bruno');
  assert.equal(payload.avulso, undefined);
  assert.deepEqual(payload.placar, { plan: [3, 6], hist: [4, 6], prod: [4, 6], tudo: [2, 6] });
  assert.deepEqual(payload.obras[0], {
    n: 'Horizonte',
    p: ['c', 'PPC 86% · 25 de 29'],
    h: ['c', '5 de 5 dias · efetivo 84'],
    r: ['c', '5 de 5 dias · 62% medido'],
  });
  assert.equal(payload.atencao.length, 5);
  assert.equal(payload.link, 'https://obra360.example.com/dashboard?escala=semana&periodo=2026-11-09');
  assert.ok(payloadBytes(payload) <= WEEKLY_PAYLOAD_BUDGET);
  assert.equal(weeklyPayload(summary, { manual: true }).avulso, true);
  assert.equal(weeklyPayload(summary).link, undefined);

  assert.equal(weeklyDashboardLink(undefined, WEEK), undefined);
  assert.equal(weeklyDashboardLink('', WEEK), undefined);
  assert.equal(weeklyDashboardLink('http://0.0.0.0:3000', WEEK), undefined);
  assert.equal(weeklyDashboardLink('não é endereço', WEEK), undefined);

  const long = Array.from({ length: 12 }, (_, i) =>
    work(
      `Residencial Empreendimento de Nome Muito Comprido Número ${i + 1} da Incorporadora`,
      lines(15, 6, i % 3 === 0 ? 4 : 0, 'Falta de projeto ou de definição do cliente final'),
      {
        headcount: headcount(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']),
        production: production(['2026-11-09', '2026-11-11', '2026-11-12', '2026-11-13']),
        safety: safety(i + 1),
      },
    ),
  );
  const big = weeklyPayload(buildWeeklySummary({ week: WEEK, works: long }), {
    firstName: 'Bruno',
    link: weeklyDashboardLink('https://obra360.example.com', WEEK),
  });
  assert.ok(payloadBytes(big) <= WEEKLY_PAYLOAD_BUDGET, `payload com ${payloadBytes(big)} bytes`);
  assert.ok(payloadBytes(big) <= 4096);
  assert.equal(big.obras.length, 12);
  // Encolheu cortando pontos de atenção e nomes, sem perder obra nem situação.
  assert.ok(big.obras.every(obra => obra.p[0] && obra.h[0] === 'n' && obra.r[0] === 'n'));
  assert.ok(big.link);
});

test('chaves de idempotência: o sábado é por semana e pessoa; o avulso leva o instante', () => {
  assert.equal(weeklyIdempotencyKey(WEEK, 'u1'), 'obra360.resumo_semanal:2026-11-09:u1');
  assert.equal(manualIdempotencyKey('u1', '2026-11-12T15:00:00.000Z'), 'obra360.resumo_semanal:avulso:u1:2026-11-12T15:00:00.000Z');
});

test('horário: sábado das 08:00 às 23:59 de Brasília, para a semana que termina naquele sábado', () => {
  // Brasília = UTC−3. Sábado 14/11/2026.
  assert.deepEqual(brasiliaClock(new Date('2026-11-14T11:00:00Z')), { day: '2026-11-14', weekday: 6, hour: 8 });
  assert.equal(weeklySendDue(new Date('2026-11-14T10:59:00Z')), null); // 07:59
  assert.deepEqual(weeklySendDue(new Date('2026-11-14T11:00:00Z')), { week: WEEK, today: '2026-11-14' }); // 08:00
  assert.deepEqual(weeklySendDue(new Date('2026-11-15T02:59:00Z')), { week: WEEK, today: '2026-11-14' }); // 23:59
  assert.equal(weeklySendDue(new Date('2026-11-15T03:00:00Z')), null); // domingo 00:00
  assert.equal(weeklySendDue(new Date('2026-11-13T15:00:00Z')), null); // sexta
  // Sábado 02:00 UTC ainda é sexta à noite em Brasília.
  assert.equal(weeklySendDue(new Date('2026-11-14T02:00:00Z')), null);
});

test('envio avulso: sábado e domingo cobrem a semana que acabou; de segunda a sexta, a anterior', () => {
  assert.equal(lastClosedWeek('2026-11-14'), WEEK); // sábado
  assert.equal(lastClosedWeek('2026-11-15'), WEEK); // domingo
  assert.equal(lastClosedWeek('2026-11-16'), WEEK); // segunda
  assert.equal(lastClosedWeek('2026-11-12'), '2026-11-02'); // quinta
  assert.equal(lastClosedWeek('2026-11-13'), '2026-11-02'); // sexta
});

test('agendador: só em produção, no Node, com as credenciais reais e sem a chave de desligar', () => {
  const env = {
    NODE_ENV: 'production',
    NEXT_RUNTIME: 'nodejs',
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'chave',
  };
  assert.equal(weeklySchedulerEnabled(env), true);
  assert.equal(weeklySchedulerEnabled({ ...env, NODE_ENV: 'development' }), false);
  assert.equal(weeklySchedulerEnabled({ ...env, NODE_ENV: 'test' }), false);
  assert.equal(weeklySchedulerEnabled({ ...env, NEXT_RUNTIME: 'edge' }), false);
  assert.equal(weeklySchedulerEnabled({ ...env, NEXT_PHASE: 'phase-production-build' }), false);
  assert.equal(weeklySchedulerEnabled({ ...env, SUPABASE_SERVICE_ROLE_KEY: 'apenas-para-o-build' }), false);
  assert.equal(weeklySchedulerEnabled({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }), false);
  assert.equal(weeklySchedulerEnabled({ ...env, WEEKLY_SUMMARY_DISABLED: '1' }), false);
});

test('ciclo do agendador: envia uma vez por semana, repete depois de falha e não marca sem destinatário', async () => {
  const saturday = new Date('2026-11-14T12:00:00Z');
  const calls: string[] = [];
  const logs: string[] = [];
  const log = (message: string) => void logs.push(message);
  const ok = async (due: { week: string }) => {
    calls.push(due.week);
    return { status: 'sent' as const, recipients: 1, created: 1, failed: 0 };
  };

  const state: WeeklyTickState = {};
  assert.equal(await weeklyTick(new Date('2026-11-13T12:00:00Z'), state, ok, log), 'not-due');
  assert.equal(await weeklyTick(saturday, state, ok, log), 'sent');
  assert.equal(await weeklyTick(new Date('2026-11-14T12:05:00Z'), state, ok, log), 'already-sent');
  assert.deepEqual(calls, [WEEK]);
  // No sábado seguinte, a semana é outra.
  assert.equal(await weeklyTick(new Date('2026-11-21T12:00:00Z'), state, ok, log), 'sent');
  assert.deepEqual(calls, [WEEK, '2026-11-16']);

  const failing: WeeklyTickState = {};
  const partial = async () => ({ status: 'sent' as const, recipients: 2, created: 1, failed: 1 });
  assert.equal(await weeklyTick(saturday, failing, partial, log), 'retry');
  assert.equal(failing.sentWeek, undefined);
  await assert.rejects(
    weeklyTick(saturday, failing, async () => {
      throw new Error('banco fora do ar');
    }),
  );
  assert.equal(failing.running, false);
  assert.equal(await weeklyTick(saturday, failing, ok, log), 'sent');

  const none: WeeklyTickState = {};
  logs.length = 0;
  assert.equal(await weeklyTick(saturday, none, async () => ({ status: 'migration-missing' as const }), log), 'skipped');
  assert.equal(await weeklyTick(saturday, none, async () => ({ status: 'no-recipients' as const }), log), 'skipped');
  assert.equal(none.sentWeek, undefined);
  // O motivo é registrado uma vez por semana, não a cada 5 minutos.
  assert.deepEqual(logs, ['Resumo semanal não enviado: migração 0050 não aplicada.']);
  // Alguém ligou a chave ainda no sábado: o ciclo seguinte envia.
  assert.equal(await weeklyTick(saturday, none, ok, log), 'sent');

  // Um ciclo que ainda está rodando não dispara outro.
  const busy: WeeklyTickState = { running: true };
  assert.equal(await weeklyTick(saturday, busy, ok, log), 'skipped');
});

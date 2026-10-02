import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleEntityIds, scopePlanning } from '../src/application/use-cases/scope-planning';
import { createMockData } from '../src/mocks/planning';
import { interpretProbe, MIGRATION_CHECKS, summarizeMigrations } from '../src/infrastructure/repositories/supabase/migrations';
import { todayInSaoPaulo, commandContext } from '../src/infrastructure/clock';
import { SERIES_COLORS, seriesColor, CHART } from '../src/shared/palette';
import { rowsToPlanningData } from '../src/infrastructure/repositories/supabase/mappers';

test('visibleEntityIds devolve só as entidades da obra pedida', () => {
  const data = createMockData();
  const ids = visibleEntityIds(data, 'obra-1');
  assert.ok(ids.has('obra-1'));
  assert.ok(ids.has('v1'), 'vagão da obra');
  assert.ok(ids.has('a1'), 'atividade da obra');
  assert.ok(!ids.has('obra-2'), 'outra obra não entra');
  // Uma tarefa de plano de outra obra nunca aparece.
  data.plans.push({ id: 'p-outra', createdAt: '', updatedAt: '', workId: 'obra-2', month: '2026-09', name: 'Outra', createdBy: 'user-1' });
  data.planTasks.push({
    id: 't-outra',
    createdAt: '',
    updatedAt: '',
    planId: 'p-outra',
    name: 'X',
    plannedStart: '2026-09-01',
    plannedEnd: '2026-09-01',
    progress: 0,
    level: 0,
    order: 1,
  });
  assert.ok(!visibleEntityIds(data, 'obra-1').has('t-outra'));
  assert.ok(visibleEntityIds(data, 'obra-2').has('t-outra'));
});

test('o snapshot sem histórico continua válido para o recorte', () => {
  const data = createMockData();
  data.history = [];
  const scoped = scopePlanning(data, 'user-1');
  assert.deepEqual(scoped.history, []);
  assert.ok(scoped.works.length > 0);
});

test('rowsToPlanningData aceita histórico vazio (fora do snapshot)', () => {
  const data = rowsToPlanningData({
    works: [],
    locations: [],
    production_sequences: [],
    wagons: [],
    activities: [],
    terminality_criteria: [],
    pending_items: [],
    restrictions: [],
    releases: [],
    terminality_debts: [],
    teams: [],
    progress_entries: [],
    baselines: [],
    weekly_commitments: [],
    activity_dependencies: [],
    ifc_models: [],
    medium_term_plans: [],
    plan_tasks: [],
    plan_dependencies: [],
    ifc_model_versions: [],
    link_rules: [],
    history_events: [],
    profiles: [],
  });
  assert.deepEqual(data.history, []);
});

test('sondagem de migração: tabela/coluna/função ausentes viram "não aplicada"; outros erros não', () => {
  const table = MIGRATION_CHECKS.find(c => c.probe.kind === 'table')!;
  const column = MIGRATION_CHECKS.find(c => c.probe.kind === 'column')!;
  const fn = MIGRATION_CHECKS.find(c => c.probe.kind === 'function')!;
  assert.equal(interpretProbe(table, null).applied, true);
  assert.equal(interpretProbe(table, { code: '42P01' }).applied, false);
  assert.equal(interpretProbe(table, { code: 'PGRST205' }).applied, false);
  assert.equal(interpretProbe(column, { code: '42703' }).applied, false);
  assert.equal(interpretProbe(fn, { code: 'PGRST202' }).applied, false);
  // Função que existe e recusa o argumento de sondagem conta como aplicada.
  assert.equal(interpretProbe(fn, { code: '22P02', message: 'invalid input' }).applied, true);
  const unknown = interpretProbe(table, { code: '57014', message: 'timeout' });
  assert.equal(unknown.applied, true);
  assert.match(unknown.detail ?? '', /Não foi possível verificar/);
});

test('resumo das migrações separa as críticas', () => {
  const missingCode = (kind: string) => (kind === 'function' ? { code: 'PGRST202' } : { code: '42P01' });
  const statuses = MIGRATION_CHECKS.map(c =>
    interpretProbe(c, c.migration.startsWith('0027') || c.migration.startsWith('0013') ? missingCode(c.probe.kind) : null),
  );
  const summary = summarizeMigrations(statuses);
  assert.equal(summary.total, MIGRATION_CHECKS.length);
  assert.deepEqual(summary.missing, ['0013_monthly_plan', '0027_planning_snapshot']);
  assert.deepEqual(summary.criticalMissing, ['0013_monthly_plan']);
});

test('todayInSaoPaulo devolve a data civil do fuso da obra', () => {
  // 02:30 UTC de 2 de outubro ainda é 1 de outubro em São Paulo (UTC-3).
  assert.equal(todayInSaoPaulo(new Date('2026-10-02T02:30:00Z')), '2026-10-01');
  assert.equal(todayInSaoPaulo(new Date('2026-10-02T12:00:00Z')), '2026-10-02');
  const context = commandContext('user-1');
  assert.equal(context.actorId, 'user-1');
  assert.match(context.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(context.newId(), context.newId());
});

test('a paleta cicla sem gerar cor nova e os papéis apontam para a série', () => {
  assert.equal(SERIES_COLORS.length, 8);
  assert.equal(seriesColor(0), SERIES_COLORS[0]);
  assert.equal(seriesColor(8), SERIES_COLORS[0]);
  assert.equal(seriesColor(-1), SERIES_COLORS[7]);
  assert.ok(SERIES_COLORS.includes(CHART.planned as (typeof SERIES_COLORS)[number]));
  assert.ok(SERIES_COLORS.includes(CHART.executed as (typeof SERIES_COLORS)[number]));
});

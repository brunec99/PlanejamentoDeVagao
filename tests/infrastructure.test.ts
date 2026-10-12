import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleEntityIds, scopePlanning } from '../src/application/use-cases/scope-planning';
import { createMockData } from '../src/mocks/planning';
import { interpretProbe, MIGRATION_CHECKS, summarizeMigrations } from '../src/infrastructure/repositories/supabase/migrations';
import { todayInSaoPaulo, commandContext } from '../src/infrastructure/clock';
import { SERIES_COLORS, seriesColor, CHART } from '../src/shared/palette';
import { diffChangedRows, diffDeletedIds, rowsToPlanningData } from '../src/infrastructure/repositories/supabase/mappers';
import { commandScope } from '../src/application/use-cases/command-scope';
import type { WeeklyCommitment } from '../src/domain/entities';

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

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' };
const commitment = (id: string, weekStart: string, workId = 'obra-1'): WeeklyCommitment => ({
  id,
  ...stamp,
  workId,
  name: `Linha ${id}`,
  supplier: 'SM MARTINS',
  weekStart,
  weekEnd: '2026-09-13',
  responsibleId: 'user-1',
  teamId: 'equipe-1',
  startDate: weekStart,
  endDate: weekStart,
});
/** Como o snapshot chega do banco: sem histórico e com linhas da planilha. */
function snapshot() {
  const data = createMockData();
  data.history = [];
  data.commitments = [commitment('wc-1', '2026-09-07'), commitment('wc-2', '2026-09-07')];
  return data;
}
const onlyTables = (payload: Record<string, unknown[]>, except: string[]) => {
  for (const [table, rows] of Object.entries(payload)) if (!except.includes(table)) assert.deepEqual(rows, [], `${table} devia ir vazia`);
};

test('diffChangedRows: obra sem mudança não manda linha nenhuma', () => {
  const before = snapshot();
  onlyTables(diffChangedRows(before, structuredClone(before)), []);
});

test('diffChangedRows: só a linha alterada, a equipe nova e o evento do histórico viajam', () => {
  const before = snapshot();
  const after = structuredClone(before);
  Object.assign(after.commitments[1], {
    fulfilled: true,
    recordedAt: '2026-09-08T12:00:00Z',
    recordedBy: 'user-1',
    updatedAt: '2026-09-08T12:00:00Z',
  });
  after.teams.push({ id: 'equipe-3', ...stamp, workId: 'obra-1', company: 'ATR ENG', name: 'Hidráulica', weeklyCapacity: 1 });
  after.history.push({
    id: 'h-novo',
    entityId: 'wc-2',
    entityType: 'planning',
    action: 'record_fulfillment',
    authorId: 'user-1',
    occurredAt: '2026-09-08T12:00:00Z',
    changes: {},
  });
  const diff = diffChangedRows(before, after);
  assert.deepEqual(
    diff.weekly_commitments.map(c => [c.id, c.fulfilled, c.recorded_by]),
    [['wc-2', true, 'user-1']],
  );
  assert.deepEqual(
    diff.teams.map(t => t.id),
    ['equipe-3'],
  );
  assert.deepEqual(
    diff.history_events.map(h => h.id),
    ['h-novo'],
  );
  onlyTables(diff, ['weekly_commitments', 'teams', 'history_events']);
  // Nada foi apagado.
  for (const ids of Object.values(diffDeletedIds(before, after))) assert.deepEqual(ids, []);
});

test('diffChangedRows: a exclusão vai só em p_deletes', () => {
  const before = snapshot();
  const after = structuredClone(before);
  after.commitments = after.commitments.filter(c => c.id !== 'wc-1');
  onlyTables(diffChangedRows(before, after), []);
  assert.deepEqual(diffDeletedIds(before, after).weekly_commitments, ['wc-1']);
});

test('diffChangedRows: evento de histórico já conhecido não viaja de novo', () => {
  const before = createMockData();
  const after = structuredClone(before);
  assert.deepEqual(diffChangedRows(before, after).history_events, []);
});

test('commandScope: comandos do curto prazo recebem o recorte; os demais, as obras inteiras', () => {
  const workIds = ['obra-1'];
  for (const command of [
    { type: 'record_fulfillment' as const, commitmentId: 'wc-1', fulfilled: true },
    { type: 'clear_fulfillment' as const, commitmentId: 'wc-1' },
    { type: 'delete_commitment' as const, commitmentId: 'wc-1' },
  ])
    assert.deepEqual(commandScope(command, workIds), { workIds, commitments: { ids: ['wc-1'] } });
  // Mover de semana: a linha e a segunda-feira da semana de destino.
  assert.deepEqual(
    commandScope(
      {
        type: 'update_commitment',
        commitmentId: 'wc-1',
        name: 'x',
        supplier: '',
        weekStart: '2026-09-16',
        startDate: '2026-09-16',
        endDate: '2026-09-16',
      },
      workIds,
    ),
    { workIds, commitments: { ids: ['wc-1'], weekStarts: ['2026-09-14'] } },
  );
  const create = { type: 'create_commitment' as const, workId: 'obra-1', name: 'x', weekStart: '2026-09-14', responsibleId: 'user-1' };
  assert.deepEqual(commandScope(create, workIds), { workIds, commitments: { weekStarts: ['2026-09-14'] } });
  // Data inválida não derruba a leitura: o comando é que recusa.
  assert.deepEqual(commandScope({ ...create, weekStart: 'ontem' }, workIds), { workIds, commitments: { weekStarts: [] } });
  // Vínculo com atividade do cronograma precisa do planejamento inteiro.
  assert.deepEqual(commandScope({ ...create, activityId: 'a1' }, workIds), { workIds });
  assert.deepEqual(commandScope({ type: 'create_team', workId: 'obra-1', company: 'x', name: 'y', weeklyCapacity: 1 }, workIds), {
    workIds,
    commitments: { ids: [] },
  });
  assert.deepEqual(commandScope({ type: 'update_team', teamId: 'equipe-1', company: 'x', name: 'y', weeklyCapacity: 1 }, workIds), {
    workIds,
    commitments: { ids: [] },
  });
  // delete_team confere atividades e tarefas do mês; os demais comandos nem são do curto prazo.
  assert.deepEqual(commandScope({ type: 'delete_team', teamId: 'equipe-1' }, workIds), { workIds });
  assert.deepEqual(commandScope({ type: 'create_location', workId: 'obra-1', name: 'x' }, workIds), { workIds });
});

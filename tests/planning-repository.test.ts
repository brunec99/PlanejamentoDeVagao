import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabasePlanningRepository } from '../src/infrastructure/repositories/supabase/planning-repository';
import { planningDataToPayload, type CommitPayload } from '../src/infrastructure/repositories/supabase/mappers';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { commandScope } from '../src/application/use-cases/command-scope';
import { createMockData, DEMO_DATE } from '../src/mocks/planning';
import type { PlanningData, WeeklyCommitment } from '../src/domain/entities';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
interface Commit {
  expected: number;
  payload: CommitPayload;
  deletes: Record<string, string[]>;
}

/** Banco de mentira: tabelas em memória com os filtros `in`/`eq`, paginação por `range`, a linha
 * única de `planning_meta` e as duas RPCs. Registra cada leitura e cada commit para o teste conferir
 * o que viajaria de verdade. */
function fakeClient(tables: Tables, version: number) {
  const reads: { table: string; where: Record<string, string[]> }[] = [];
  const commits: Commit[] = [];
  const rpcs: string[] = [];
  const state = { version, failNext: undefined as string | undefined };
  class Query {
    private where: Record<string, string[]> = {};
    private one = false;
    private from = 0;
    private to = Infinity;
    constructor(private readonly table: string) {}
    select() {
      return this;
    }
    in(column: string, values: string[]) {
      this.where[column] = values;
      return this;
    }
    eq(column: string, value: unknown) {
      this.where[column] = [String(value)];
      return this;
    }
    order() {
      return this;
    }
    range(from: number, to: number) {
      this.from = from;
      this.to = to;
      return this;
    }
    single() {
      this.one = true;
      return this;
    }
    then(resolve: (value: { data: unknown; error: null }) => void) {
      const source = this.table === 'planning_meta' ? [{ id: 1, version: state.version }] : (tables[this.table] ?? []);
      const rows = source
        .filter(row => Object.entries(this.where).every(([column, values]) => values.includes(String(row[column]))))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .slice(this.from, this.to + 1);
      reads.push({ table: this.table, where: this.where });
      resolve({ data: this.one ? rows[0] : rows, error: null });
    }
  }
  const client = {
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push(name);
      if (name === 'planning_snapshot') {
        const { history_events: _history, ...rest } = tables;
        return { data: { version: state.version, ...rest }, error: null };
      }
      if (state.failNext) {
        const message = state.failNext;
        state.failNext = undefined;
        // Como no banco: quem conflitou foi outra gravação, que subiu a versão.
        state.version += 1;
        return { data: null, error: { message } };
      }
      commits.push({
        expected: args.p_expected_version as number,
        payload: args.p_payload as CommitPayload,
        deletes: args.p_deletes as Record<string, string[]>,
      });
      state.version += 1;
      return { data: state.version, error: null };
    },
  };
  return {
    client: client as unknown as SupabaseClient,
    reads,
    commits,
    rpcs,
    failNextCommit: (message: string) => {
      state.failNext = message;
    },
  };
}

const stamp = { createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-09-01T12:00:00Z' };
const commitment = (id: string, weekStart: string, workId = 'obra-1'): WeeklyCommitment => ({
  id,
  ...stamp,
  workId,
  name: `Linha ${id}`,
  supplier: 'SM MARTINS',
  weekStart,
  weekEnd: weekStart === '2026-09-07' ? '2026-09-13' : '2026-09-20',
  responsibleId: 'user-1',
  teamId: 'equipe-1',
  startDate: weekStart,
  endDate: weekStart,
});
/** Duas semanas da obra 1 e uma linha da obra 2, que nunca deve viajar. */
function seed(): Tables {
  const data = createMockData();
  data.history = [];
  data.commitments = [
    commitment('wc-1', '2026-09-07'),
    commitment('wc-2', '2026-09-07'),
    commitment('wc-3', '2026-09-14'),
    commitment('wc-4', '2026-09-07', 'obra-2'),
  ];
  return planningDataToPayload(data) as unknown as Tables;
}
const context = () => {
  let n = 0;
  return { actorId: 'user-1', today: DEMO_DATE, now: '2026-09-08T12:00:00Z', newId: () => `novo-${++n}` };
};
const run = (db: ReturnType<typeof fakeClient>, command: Command, peek?: (draft: PlanningData) => void) =>
  new SupabasePlanningRepository(db.client).transaction(
    draft => {
      peek?.(draft);
      return applyCommand(draft, command, context());
    },
    commandScope(command, ['obra-1']),
  );
const onlyTables = (payload: Record<string, unknown[]>, except: string[]) => {
  for (const [table, rows] of Object.entries(payload)) if (!except.includes(table)) assert.deepEqual(rows, [], `${table} devia ir vazia`);
};
const readOf = (db: ReturnType<typeof fakeClient>, table: string) => db.reads.filter(r => r.table === table).map(r => r.where);

test('apontamento: lê só obra, perfis, equipes e a linha; grava só a linha e o evento', async () => {
  const db = fakeClient(seed(), 7);
  const id = await run(db, { type: 'record_fulfillment', commitmentId: 'wc-2', fulfilled: true });
  assert.equal(id, 'wc-2');
  assert.deepEqual(db.rpcs, ['commit_planning'], 'sem planning_snapshot');
  assert.equal(db.reads[0].table, 'planning_meta', 'a versão vem antes das linhas');
  assert.deepEqual([...new Set(db.reads.map(r => r.table))].sort(), ['planning_meta', 'profiles', 'teams', 'weekly_commitments', 'works']);
  assert.deepEqual(readOf(db, 'works'), [{ id: ['obra-1'] }]);
  assert.deepEqual(readOf(db, 'teams'), [{ work_id: ['obra-1'] }]);
  assert.deepEqual(readOf(db, 'weekly_commitments'), [{ work_id: ['obra-1'], id: ['wc-2'] }]);
  const [commit] = db.commits;
  assert.equal(commit.expected, 7);
  assert.deepEqual(
    commit.payload.weekly_commitments.map(c => [c.id, c.fulfilled, c.recorded_by]),
    [['wc-2', true, 'user-1']],
  );
  const again = fakeClient(seed(), 7);
  const committed = await new SupabasePlanningRepository(again.client).commit(
    draft => applyCommand(draft, { type: 'record_fulfillment', commitmentId: 'wc-2', fulfilled: true }, context()),
    commandScope({ type: 'record_fulfillment', commitmentId: 'wc-2', fulfilled: true }, ['obra-1']),
  );
  assert.deepEqual(committed, { result: 'wc-2', version: 8 }, 'a versão gravada é a esperada + 1, sem outra leitura');
  assert.equal(commit.payload.history_events.length, 1);
  onlyTables(commit.payload, ['weekly_commitments', 'history_events']);
  for (const ids of Object.values(commit.deletes)) assert.deepEqual(ids, []);
});

test('mover de semana: a linha e a semana de destino entram no rascunho, sem repetir; só a linha movida viaja', async () => {
  const db = fakeClient(seed(), 1);
  let draftIds: string[] = [];
  await run(
    db,
    {
      type: 'update_commitment',
      commitmentId: 'wc-2',
      name: 'Linha wc-2',
      supplier: 'SM MARTINS',
      weekStart: '2026-09-15',
      startDate: '2026-09-15',
      endDate: '2026-09-15',
    },
    draft => (draftIds = draft.commitments.map(c => c.id).sort()),
  );
  assert.deepEqual(draftIds, ['wc-2', 'wc-3']);
  assert.deepEqual(readOf(db, 'weekly_commitments'), [
    { work_id: ['obra-1'], week_start: ['2026-09-14'] },
    { work_id: ['obra-1'], id: ['wc-2'] },
  ]);
  const [commit] = db.commits;
  assert.deepEqual(
    commit.payload.weekly_commitments.map(c => [c.id, c.week_start]),
    [['wc-2', '2026-09-14']],
  );
  onlyTables(commit.payload, ['weekly_commitments', 'history_events']);

  // Mesma semana: as duas leituras trazem a mesma linha, e o rascunho fica com uma cópia só.
  const same = fakeClient(seed(), 1);
  await run(
    same,
    {
      type: 'update_commitment',
      commitmentId: 'wc-1',
      name: 'Outra',
      supplier: 'SM MARTINS',
      weekStart: '2026-09-09',
      startDate: '2026-09-09',
      endDate: '2026-09-09',
    },
    draft => (draftIds = draft.commitments.map(c => c.id).sort()),
  );
  assert.deepEqual(draftIds, ['wc-1', 'wc-2']);
});

test('excluir linha: nada no payload, o id em p_deletes', async () => {
  const db = fakeClient(seed(), 3);
  await run(db, { type: 'delete_commitment', commitmentId: 'wc-1' });
  const [commit] = db.commits;
  onlyTables(commit.payload, ['history_events']);
  assert.deepEqual(commit.deletes.weekly_commitments, ['wc-1']);
});

test('equipe nova: nenhum compromisso é lido; só a equipe e o evento viajam', async () => {
  const db = fakeClient(seed(), 3);
  await run(db, { type: 'create_team', workId: 'obra-1', company: 'ATR ENG', name: 'Hidráulica', weeklyCapacity: 2 });
  assert.deepEqual(readOf(db, 'weekly_commitments'), []);
  const [commit] = db.commits;
  assert.deepEqual(
    commit.payload.teams.map(t => [t.id, t.name]),
    [['novo-1', 'Hidráulica']],
  );
  onlyTables(commit.payload, ['teams', 'history_events']);
});

test('conflito de versão: relê o recorte e grava com a versão nova', async () => {
  const db = fakeClient(seed(), 7);
  db.failNextCommit('version_conflict');
  await run(db, { type: 'clear_fulfillment', commitmentId: 'wc-1' });
  assert.equal(readOf(db, 'planning_meta').length, 2);
  assert.deepEqual(db.rpcs, ['commit_planning', 'commit_planning']);
  assert.deepEqual(
    db.commits.map(c => c.expected),
    [8],
  );
  // Outro erro do banco sobe como está.
  const other = fakeClient(seed(), 7);
  other.failNextCommit('Linha de base é imutável');
  await assert.rejects(run(other, { type: 'clear_fulfillment', commitmentId: 'wc-1' }), /imutável/);
});

test('planejamento inteiro (linha vinculada a atividade): lê pela RPC e ainda assim grava só o que mudou', async () => {
  const db = fakeClient(seed(), 2);
  await run(db, {
    type: 'create_commitment',
    workId: 'obra-1',
    name: 'Revestimento vinculado',
    weekStart: '2026-09-07',
    responsibleId: 'user-1',
    activityId: 'a1',
  });
  assert.deepEqual(db.rpcs, ['planning_snapshot', 'commit_planning']);
  assert.deepEqual(db.reads, [], 'nenhuma leitura por tabela');
  const [commit] = db.commits;
  assert.deepEqual(
    commit.payload.weekly_commitments.map(c => [c.id, c.activity_id]),
    [['novo-1', 'a1']],
  );
  onlyTables(commit.payload, ['weekly_commitments', 'history_events']);
  for (const ids of Object.values(commit.deletes)) assert.deepEqual(ids, []);
});

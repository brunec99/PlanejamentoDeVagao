import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMockData } from '../src/mocks/planning';
import { confirmsCode, workFootprint } from '../src/modules/configuracoes/delete-work-view';
import { removeWorkFiles } from '../src/infrastructure/repositories/supabase/work-files';

/** Exclusão de obra (0037) num PostgreSQL em memória com todas as migrações: duas obras com uma linha
 * em cada tabela, uma sai inteira e a outra fica como estava. Nenhum banco externo é acessado. */

type Value = string | number | boolean | null | string[] | Record<string, unknown>;
type Columns = Map<string, string>;

const ADMIN = '00000000-0000-4000-8000-000000000001';
const MANAGER = '00000000-0000-4000-8000-000000000002';
const STAMP = '2026-10-01T12:00:00Z';

async function database() {
  const db = new PGlite();
  await db.exec(
    'create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean);',
  );
  for (const file of fs
    .readdirSync('supabase/migrations')
    .filter(name => name.endsWith('.sql'))
    .sort())
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  return db;
}

/** As colunas obrigatórias sem padrão de cada tabela: o teste preenche essas por tipo, e cada linha
 * diz só o que importa (ids, chaves e os valores que as regras `check` exigem). */
async function requiredColumns(db: PGlite) {
  const { rows } = await db.query<{ table_name: string; column_name: string; data_type: string }>(
    "select table_name, column_name, data_type from information_schema.columns where table_schema='public' and is_nullable='NO' and column_default is null",
  );
  const byTable = new Map<string, Columns>();
  for (const row of rows) byTable.set(row.table_name, (byTable.get(row.table_name) ?? new Map()).set(row.column_name, row.data_type));
  return byTable;
}

const filler = (type: string): Value =>
  type === 'timestamp with time zone'
    ? STAMP
    : type === 'date'
      ? '2026-10-05'
      : ['integer', 'bigint', 'numeric', 'smallint'].includes(type)
        ? 1
        : type === 'boolean'
          ? false
          : type === 'jsonb'
            ? {}
            : type === 'ARRAY'
              ? ['x']
              : 'x';

/** Uma obra com uma linha em cada tabela que pende dela, todas com ids começando por `p`. */
async function seedWork(db: PGlite, required: Map<string, Columns>, p: string, code: string, frozen: boolean) {
  const insert = async (table: string, values: Record<string, Value>) => {
    const row: Record<string, Value> = {};
    for (const [column, type] of required.get(table) ?? []) row[column] = filler(type);
    Object.assign(row, values);
    const columns = Object.keys(row);
    const params = columns.map(column => {
      const value = row[column];
      return value !== null && typeof value === 'object' && !Array.isArray(value) ? JSON.stringify(value) : value;
    });
    await db.query(`insert into ${table} (${columns.join(', ')}) values (${columns.map((_, i) => `$${i + 1}`).join(', ')})`, params);
  };
  const w = `${p}-work`;
  await insert('works', { id: w, name: `Obra ${code}`, code, active: true });
  await insert('locations', { id: `${p}-loc`, work_id: w });
  await insert('production_sequences', { id: `${p}-seq`, work_id: w, calendar: 'business_days' });
  await insert('wagons', { id: `${p}-v1`, sequence_id: `${p}-seq` });
  await insert('wagons', { id: `${p}-v2`, sequence_id: `${p}-seq`, predecessor_id: `${p}-v1`, number: 2 });
  await insert('teams', { id: `${p}-team`, work_id: w });
  const activity = { wagon_id: `${p}-v1`, location_id: `${p}-loc`, status: 'in_progress', origin: 'manual', team_id: `${p}-team` };
  await insert('activities', { id: `${p}-a1`, ...activity });
  await insert('activities', { id: `${p}-a2`, ...activity });
  await insert('activity_dependencies', { id: `${p}-dep`, predecessor_id: `${p}-a1`, successor_id: `${p}-a2` });
  await insert('terminality_criteria', { id: `${p}-crit`, activity_id: `${p}-a1` });
  await insert('progress_entries', { id: `${p}-prog`, activity_id: `${p}-a1` });
  await insert('pending_items', { id: `${p}-pend`, wagon_id: `${p}-v1`, activity_id: `${p}-a1`, status: 'open' });
  await insert('restrictions', { id: `${p}-restr`, wagon_id: `${p}-v1`, activity_id: `${p}-a1`, status: 'open' });
  await insert('releases', { id: `${p}-rel`, wagon_id: `${p}-v2`, predecessor_id: `${p}-v1`, type: 'exceptional' });
  await insert('terminality_debts', { id: `${p}-debt`, pending_item_id: `${p}-pend`, release_id: `${p}-rel` });
  await insert('weekly_commitments', { id: `${p}-c1`, work_id: w, team_id: `${p}-team`, activity_id: `${p}-a1` });
  // Linha anterior à 0014, sem work_id: sai pela atividade da obra.
  await insert('weekly_commitments', { id: `${p}-c2`, work_id: null, activity_id: `${p}-a2` });
  await insert('baselines', { id: `${p}-base`, work_id: w });
  await insert('medium_term_plans', { id: `${p}-plan`, work_id: w, month: '2026-10' });
  await insert('plan_tasks', { id: `${p}-t1`, plan_id: `${p}-plan`, team_id: `${p}-team`, activity_id: `${p}-a1` });
  await insert('plan_tasks', { id: `${p}-t2`, plan_id: `${p}-plan` });
  await insert('plan_dependencies', { id: `${p}-pdep`, predecessor_id: `${p}-t1`, successor_id: `${p}-t2`, link_type: 'TI' });
  // Linha de base congelada: imutável, salvo na exclusão da própria obra.
  await insert('medium_term_plans', {
    id: `${p}-frozen`,
    work_id: w,
    month: '2026-10',
    baseline_of: `${p}-plan`,
    frozen_at: frozen ? STAMP : null,
  });
  await insert('plan_tasks', { id: `${p}-ft1`, plan_id: `${p}-frozen` });
  await insert('plan_tasks', { id: `${p}-ft2`, plan_id: `${p}-frozen` });
  await insert('plan_dependencies', { id: `${p}-fdep`, predecessor_id: `${p}-ft1`, successor_id: `${p}-ft2`, link_type: 'TI' });
  await insert('long_term_plans', { work_id: w, synced_sequence_id: `${p}-seq` });
  await insert('work_settings', { work_id: w, week_one_start: '2026-01-05' });
  await insert('prevision_activities', { work_id: w, external_id: `${p}-ext` });
  await insert('ifc_models', { id: `${p}-model`, work_id: w });
  await insert('ifc_model_versions', { id: `${p}-ver`, model_id: `${p}-model` });
  await insert('ifc_elements', { id: `${p}-el`, version_id: `${p}-ver` });
  await insert('ifc_properties', { id: `${p}-prop`, version_id: `${p}-ver` });
  await insert('ifc_quantities', { id: `${p}-qty`, version_id: `${p}-ver`, kind: 'area' });
  await insert('ifc_fragments', { version_id: `${p}-ver`, storage_path: `${w}/${p}-model/frag` });
  await insert('ifc_federations', { id: `${p}-fed`, work_id: w, version_ids: [`${p}-ver`] });
  await insert('link_rules', { id: `${p}-rule`, work_id: w });
  await insert('terminality_floors', { id: `${p}-floor`, work_id: w });
  await insert('terminality_units', { id: `${p}-unit`, work_id: w, floor_id: `${p}-floor` });
  await insert('terminality_types', { id: `${p}-type`, work_id: w });
  await insert('terminality_people', { id: `${p}-person`, work_id: w });
  await insert('terminality_items', {
    id: `${p}-item`,
    work_id: w,
    floor_id: `${p}-floor`,
    unit_id: `${p}-unit`,
    type_id: `${p}-type`,
    atr_person_id: `${p}-person`,
    status: 'open',
  });
  await insert('terminality_photos', {
    id: `${p}-photo`,
    item_id: `${p}-item`,
    work_id: w,
    kind: 'issue',
    storage_path: `${w}/${p}-item/photo.jpg`,
    thumb_path: `${w}/${p}-item/photo-thumb.jpg`,
  });
  await insert('agent_insights', { work_id: w });
  await insert('agent_usage', { work_id: w, actor_id: ADMIN, month: '2026-10', kind: 'leitura', cost_usd: 0.05 });
  await insert('history_events', { id: `${p}-h`, entity_id: `${p}-v1`, entity_type: 'wagon', action: 'release', author_id: ADMIN });
  return w;
}

async function setup() {
  const db = await database();
  const required = await requiredColumns(db);
  await db.query('insert into auth.users (id) values ($1), ($2)', [ADMIN, MANAGER]);
  const gone = await seedWork(db, required, 'del', 'DEL-01', true);
  const kept = await seedWork(db, required, 'keep', 'KEEP-01', true);
  await db.query("insert into profiles (id, name, role, work_ids) values ($1, 'Admin', 'admin', $3), ($2, 'Gestor', 'manager', $3)", [
    ADMIN,
    MANAGER,
    [gone, kept],
  ]);
  const tables = (
    await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name",
    )
  ).rows.map(r => r.table_name);
  const withId = (
    await db.query<{ table_name: string }>(
      "select table_name from information_schema.columns where table_schema='public' and column_name='id'",
    )
  ).rows.map(r => r.table_name);
  const withWork = (
    await db.query<{ table_name: string }>(
      "select table_name from information_schema.columns where table_schema='public' and column_name='work_id'",
    )
  ).rows.map(r => r.table_name);
  /** Linhas de uma obra, tabela a tabela: pelo prefixo do id e pela coluna work_id. */
  const footprint = async (prefix: string, workId: string) => {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const where = [
        withId.includes(table) ? `id::text like '${prefix}-%'` : null,
        withWork.includes(table) ? `work_id = '${workId}'` : null,
      ].filter(Boolean);
      if (!where.length) continue;
      counts[table] = (await db.query<{ n: number }>(`select count(*)::int n from ${table} where ${where.join(' or ')}`)).rows[0].n;
    }
    return counts;
  };
  const deleteWork = (workId: string, code: string, actor = ADMIN) =>
    db.query<{ result: { version: number; removed: Record<string, number> } }>('select delete_work($1, $2, $3) as result', [
      workId,
      code,
      actor,
    ]);
  const version = async () => (await db.query<{ version: number }>('select version::int version from planning_meta')).rows[0].version;
  return { db, gone, kept, withWork, footprint, deleteWork, version };
}

test('delete_work apaga a obra e tudo o que é dela, sem tocar a outra obra', async () => {
  const { db, gone, kept, withWork, footprint, deleteWork, version } = await setup();
  try {
    const before = await footprint('del', gone);
    const keptBefore = await footprint('keep', kept);
    // Toda tabela com work_id recebeu linha: tabela nova pendurada em works sem entrar na exclusão
    // faria este teste falhar (pela contagem abaixo ou pela chave estrangeira).
    for (const table of withWork) assert.ok(before[table] > 0, `a semente não cobre ${table}`);
    const versionBefore = await version();

    const { result } = (await deleteWork(gone, ' del-01 ')).rows[0];
    assert.equal(result.version, versionBefore + 1);
    assert.equal(await version(), versionBefore + 1, 'as telas abertas recarregam');
    assert.equal(result.removed.weekly_commitments, 2, 'inclusive a linha antiga sem work_id');
    assert.equal(result.removed.medium_term_plans, 2, 'inclusive a linha de base congelada');
    assert.equal(result.removed.wagons, 2);
    assert.equal(result.removed.profiles_access, 2);

    const after = await footprint('del', gone);
    for (const [table, count] of Object.entries(after)) {
      // Ficam de propósito: o histórico (append-only) e o livro-razão do custo da IA (o teto do mês).
      if (table === 'history_events' || table === 'agent_usage') continue;
      assert.equal(count, 0, `${table} ainda tem linha da obra excluída`);
    }
    assert.equal(after.agent_usage, 1, 'o custo da IA continua contando no mês');
    assert.equal(after.history_events, 1, 'o histórico da obra fica');
    assert.deepEqual(await footprint('keep', kept), keptBefore, 'a outra obra fica como estava');

    const event = (
      await db.query<{ author_id: string; changes: { code: string; name: string; removed: Record<string, number> } }>(
        "select author_id, changes from history_events where action='delete_work' and entity_id=$1",
        [gone],
      )
    ).rows;
    assert.equal(event.length, 1);
    assert.equal(event[0].author_id, ADMIN);
    assert.equal(event[0].changes.code, 'DEL-01');
    assert.equal(event[0].changes.removed.terminality_photos, 1);

    const access = (await db.query<{ work_ids: string[] }>('select work_ids from profiles order by id')).rows;
    for (const row of access) assert.deepEqual(row.work_ids, [kept], 'ninguém fica com acesso à obra excluída');

    // A exceção da linha de base vale só para a obra excluída e só dentro da transação.
    await assert.rejects(db.query("delete from plan_tasks where id='keep-ft1'"), /imutável/);
    await assert.rejects(db.query("update medium_term_plans set name='Outro nome' where id='keep-frozen'"), /imutável/);
  } finally {
    await db.close();
  }
});

test('delete_work recusa código errado, obra inexistente, quem não é admin e chamada de fora do servidor', async () => {
  const { db, gone, footprint, deleteWork, version } = await setup();
  try {
    const before = await footprint('del', gone);
    const versionBefore = await version();
    await assert.rejects(deleteWork(gone, 'KEEP-01'), /work_code_mismatch/);
    await assert.rejects(deleteWork(gone, ''), /work_code_mismatch/);
    await assert.rejects(deleteWork('nenhuma', 'DEL-01'), /work_not_found/);
    await assert.rejects(deleteWork(gone, 'DEL-01', MANAGER), /not_admin/);
    await db.exec('set role authenticated');
    await assert.rejects(deleteWork(gone, 'DEL-01'), /permission denied/);
    await db.exec('reset role');
    assert.deepEqual(await footprint('del', gone), before, 'nada foi apagado');
    assert.equal(await version(), versionBefore);
    // A linha de base congelada continua imutável fora da exclusão da obra.
    await assert.rejects(db.query("delete from medium_term_plans where id='del-frozen'"), /imutável/);
  } finally {
    await db.close();
  }
});

test('o resumo conta só o que é da obra, e o código confirma sem caixa nem espaços', () => {
  const data = createMockData();
  const footprint = workFootprint(data, 'obra-1');
  const sequences = new Set(data.sequences.filter(s => s.workId === 'obra-1').map(s => s.id));
  assert.equal(footprint.wagons, data.wagons.filter(w => sequences.has(w.sequenceId)).length);
  assert.ok(footprint.wagons > 0);
  assert.equal(footprint.people, data.users.filter(u => u.workIds.includes('obra-1')).length);
  assert.deepEqual(workFootprint(data, 'nenhuma'), { commitments: 0, wagons: 0, plans: 0, teams: 0, ifcModels: 0, people: 0 });
  assert.ok(confirmsCode(' mzn ', 'MZN'));
  assert.ok(!confirmsCode('MZ', 'MZN'));
  assert.ok(!confirmsCode('   ', ''), 'nunca confirma vazio');
});

/** Storage de mentira: caminhos de arquivo por bucket; `list` devolve o nível pedido (pasta com `id`
 * nulo), paginado; `remove` apaga ou falha no bucket marcado. */
function fakeStorage(buckets: Record<string, string[]>, failing?: string) {
  const removed: string[] = [];
  const client = {
    storage: {
      from: (name: string) => ({
        list: async (prefix: string, { limit, offset }: { limit: number; offset: number }) => {
          const level = new Map<string, boolean>();
          for (const path of buckets[name] ?? []) {
            if (!path.startsWith(`${prefix}/`)) continue;
            const [head, ...rest] = path.slice(prefix.length + 1).split('/');
            level.set(head, rest.length > 0);
          }
          const entries = [...level].sort().map(([entry, folder]) => ({ name: entry, id: folder ? null : `id-${entry}` }));
          return { data: entries.slice(offset, offset + limit), error: null };
        },
        remove: async (paths: string[]) => {
          if (name === failing) return { data: null, error: { message: 'falhou' } };
          removed.push(...paths.map(path => `${name}:${path}`));
          return { data: [], error: null };
        },
      }),
    },
  };
  return { client: client as unknown as SupabaseClient, removed };
}

test('removeWorkFiles apaga a pasta da obra nos dois buckets, descendo nas pastas, e só ela', async () => {
  // 1205 fotos numa pasta só: o `list` devolve 1000 por vez, e a segunda página tem que vir.
  const photos = [...Array.from({ length: 1205 }, (_, i) => `obra-x/item-1/foto-${i}.jpg`), 'obra-x/item-2/foto.jpg'];
  const { client, removed } = fakeStorage({
    ifc: ['obra-x/modelo-1/a.ifc', 'obra-x/modelo-1/a.frag', 'obra-y/modelo-2/b.ifc'],
    terminalidade: [...photos, 'obra-y/item/foto.jpg'],
  });
  const result = await removeWorkFiles(client, 'obra-x');
  assert.deepEqual(result, { removed: 2 + photos.length, failed: [] });
  assert.ok(
    removed.every(path => path.includes(':obra-x/')),
    'a outra obra fica',
  );
  assert.ok(removed.includes('ifc:obra-x/modelo-1/a.frag'));
  assert.equal(new Set(removed).size, removed.length);
});

test('removeWorkFiles segue no outro bucket quando um falha e diz qual ficou', async () => {
  const { client, removed } = fakeStorage({ ifc: ['obra-x/m/a.ifc'], terminalidade: ['obra-x/i/f.jpg'] }, 'ifc');
  assert.deepEqual(await removeWorkFiles(client, 'obra-x'), { removed: 1, failed: ['ifc'] });
  assert.deepEqual(removed, ['terminalidade:obra-x/i/f.jpg']);
});

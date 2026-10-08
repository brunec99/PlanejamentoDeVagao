// Valida supabase/bootstrap/obra360-schema.sql num PostgreSQL em memória (PGlite), do jeito que o
// SQL Editor do Supabase o executa: o arquivo inteiro numa chamada só, num banco vazio.
// Nenhum banco externo é acessado. PGLITE_MODULE pode apontar para uma instalação temporária.
//
//   node scripts/validate-bootstrap-sql.mjs
//
// O que confere:
//   - o arquivo está em dia com supabase/migrations (senão: npm run bootstrap:sql);
//   - roda inteiro num banco vazio que imita o Supabase (papéis, auth.users, storage.buckets e os
//     privilégios padrão do schema public), e é atômico: uma falha no fim não deixa nada gravado;
//   - commit_planning grava obra + equipe + compromisso semanal e planning_snapshot devolve os três;
//   - work_settings existe e aceita/recusa a semana 1 como a 0025 manda;
//   - todas as sondagens de src/infrastructure/repositories/supabase/migrations.ts passam;
//   - anon e authenticated não executam as RPCs nem leem linhas;
//   - supabase/bootstrap/conferencia.sql sai toda OK.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tsImport } from 'tsx/esm/api';
import { buildBootstrapSql, listMigrations, MIGRATIONS_DIR, OUTPUT } from './build-bootstrap-sql.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

// O que o Supabase já tem num projeto novo e as migrações pressupõem. Os privilégios padrão imitam
// os do Supabase para objetos criados pelo papel postgres no schema public.
const SUPABASE_BASE = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create schema storage; create table storage.buckets(id text primary key, name text, public boolean);
  grant usage on schema public to anon, authenticated, service_role;
  grant usage on schema storage to service_role; grant select on storage.buckets to service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const fresh = async () => {
  const db = new PGlite();
  await db.exec(SUPABASE_BASE);
  return db;
};

const bootstrap = fs.readFileSync(OUTPUT, 'utf8');
assert.equal(bootstrap, buildBootstrapSql(), 'obra360-schema.sql desatualizado: rode npm run bootstrap:sql');
const migrations = listMigrations();
const steps = [];

// 1) Por que o ajuste 1 existe: aplicando as migrações uma a uma, sobra commit_planning(bigint, jsonb)
//    executável por anon (SECURITY DEFINER). O bootstrap remove essa sobrecarga.
{
  const db = await fresh();
  try {
    for (const name of migrations) await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'));
    const { rows } = await db.query(
      "select has_function_privilege('anon', 'public.commit_planning(bigint,jsonb)'::regprocedure, 'execute') as anon",
    );
    assert.equal(rows[0].anon, true, 'esperava-se reproduzir a sobrecarga antiga exposta a anon');
    steps.push('migrações uma a uma deixam commit_planning(bigint, jsonb) executável por anon — o bootstrap a remove');
  } finally {
    await db.close();
  }
}

// 2) Atomicidade: o arquivo roda numa transação implícita; se algo falha no fim, nada fica gravado.
{
  const db = await fresh();
  try {
    await assert.rejects(db.exec(`${bootstrap}\nselect 1/0;`), /division by zero/);
    const { rows } = await db.query("select to_regclass('public.works') is null as vazio");
    assert.equal(rows[0].vazio, true, 'uma falha no meio deixou o esquema pela metade');
    steps.push('atomicidade: falha no fim desfaz tudo (banco segue vazio)');
  } finally {
    await db.close();
  }
}

// 3) O bootstrap de verdade, numa chamada só, e as conferências.
const db = await fresh();
try {
  const t0 = Date.now();
  await db.exec(bootstrap);
  steps.push(`bootstrap aplicado numa chamada só (${migrations.length} migrações + ajustes) em ${Date.now() - t0} ms`);
  await assert.rejects(db.exec(bootstrap), /already exists/, 'rodar de novo deveria falhar');
  steps.push('rodar o arquivo de novo falha com "already exists", como avisa o cabeçalho');

  const tables = (
    await db.query("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r'")
  ).rows.map(r => r.relname);
  // 32 do planejamento + 6 da terminalidade (0028).
  assert.equal(tables.length, 38, `esperava 38 tabelas, há ${tables.length}: ${tables.sort().join(', ')}`);
  const overloads = (await db.query("select count(*)::int n from pg_proc where proname='commit_planning'")).rows[0].n;
  assert.equal(overloads, 1, 'commit_planning deveria ter só a assinatura de três parâmetros');

  // Smoke: grava como o servidor (service_role) uma obra, uma equipe e um compromisso semanal.
  const sql0023 = fs.readFileSync(path.join(MIGRATIONS_DIR, '0023_plan_revisions.sql'), 'utf8');
  const payload = Object.fromEntries([...sql0023.matchAll(/jsonb_to_recordset\(p_payload->'([^']+)'/g)].map(m => [m[1], []]));
  const stamp = { created_at: '2026-10-05T12:00:00Z', updated_at: '2026-10-05T12:00:00Z' };
  payload.works = [{ id: 'w', ...stamp, name: 'Obra teste', code: 'OT', description: '', active: true, prevision_project_id: null }];
  payload.teams = [{ id: 'eq', ...stamp, work_id: 'w', company: 'Empreiteira', name: 'Alvenaria', weekly_capacity: 3 }];
  payload.weekly_commitments = [
    {
      id: 'c',
      ...stamp,
      work_id: 'w',
      name: 'Alvenaria 5º pavimento',
      supplier: 'Empreiteira',
      activity_id: null,
      week_start: '2026-10-05',
      week_end: '2026-10-11',
      responsible_id: 'tester',
      team_id: 'eq',
      start_date: '2026-10-05',
      end_date: '2026-10-09',
      fulfilled: true,
      cause: null,
      justification: null,
      recorded_at: '2026-10-09T18:00:00Z',
      recorded_by: 'tester',
    },
  ];
  await db.exec('set role service_role');
  const committed = await db.query('select commit_planning($1, $2::jsonb, $3::jsonb) as v', [0, JSON.stringify(payload), '{}']);
  assert.equal(Number(committed.rows[0].v), 1);
  const snap = (await db.query('select planning_snapshot($1::text[]) as s', [['w']])).rows[0].s;
  assert.equal(snap.version, 1);
  assert.equal(snap.works.length, 1);
  assert.deepEqual(
    snap.teams.map(t => [t.id, t.company]),
    [['eq', 'Empreiteira']],
  );
  assert.equal(snap.weekly_commitments.length, 1);
  const wc = snap.weekly_commitments[0];
  assert.deepEqual(
    [wc.id, wc.work_id, wc.team_id, wc.name, wc.supplier, wc.activity_id, wc.start_date, wc.end_date, wc.fulfilled],
    ['c', 'w', 'eq', 'Alvenaria 5º pavimento', 'Empreiteira', null, '2026-10-05', '2026-10-09', true],
  );
  assert.equal(Object.keys(snap).length, 23, 'version + 22 tabelas do snapshot');
  steps.push('commit_planning (obra + equipe + compromisso semanal) e planning_snapshot devolvendo os três: OK');

  // 0025: work_settings existe; a semana 1 tem de ser segunda-feira.
  await db.query("insert into work_settings (work_id, week_one_start, updated_by) values ('w', '2026-10-05', 'tester')");
  await assert.rejects(db.query("update work_settings set week_one_start = '2026-10-06' where work_id = 'w'"), /check constraint/);
  steps.push('work_settings (0025): grava segunda-feira, recusa outro dia: OK');

  // 0028: terminalidade fora do snapshot; resolvida exige data da correção; fotos caem com a pendência.
  await db.exec(`
    insert into terminality_floors (id, work_id, name, order_index) values ('f4', 'w', '4° pavto', 4);
    insert into terminality_units (id, work_id, floor_id, name) values ('u401', 'w', 'f4', '401');
    insert into terminality_types (id, work_id, name) values ('t-ac', 'w', 'A/C');
    insert into terminality_items (id, work_id, floor_id, unit_id, description, type_id, observed_on, contractor, created_by)
      values ('i1', 'w', 'f4', 'u401', 'Ponto de ar condicionado recortado', 't-ac', '2026-10-07', 'MZ CLIMATIZAÇÃO', 'tester');
    insert into terminality_photos (id, item_id, work_id, kind, storage_path, thumb_path, created_by)
      values ('p1', 'i1', 'w', 'issue', 'w/i1/p1.jpg', 'w/i1/p1-thumb.jpg', 'tester');`);
  await assert.rejects(db.query("update terminality_items set status = 'resolved' where id = 'i1'"), /check constraint/);
  await db.query("update terminality_items set status = 'resolved', corrected_on = '2026-10-08' where id = 'i1'");
  await db.query("delete from terminality_items where id = 'i1'");
  assert.equal((await db.query('select count(*)::int n from terminality_photos')).rows[0].n, 0);
  assert.equal(Object.keys((await db.query('select planning_snapshot($1::text[]) as s', [['w']])).rows[0].s).length, 23);
  steps.push('terminalidade (0028): status coerente com a data da correção, fotos em cascata, fora do snapshot: OK');

  // Sondagens da tela de saúde do banco, com o papel do servidor.
  const { MIGRATION_CHECKS, interpretProbe, summarizeMigrations } = await tsImport(
    pathToFileURL(path.join(root, 'src/infrastructure/repositories/supabase/migrations.ts')).href,
    import.meta.url,
  );
  const statuses = [];
  for (const check of MIGRATION_CHECKS) {
    const { probe } = check;
    let error = null;
    try {
      if (probe.kind === 'table') await db.query(`select * from public.${probe.table} limit 0`);
      else if (probe.kind === 'column') await db.query(`select ${probe.column} from public.${probe.table} limit 0`);
      else {
        const entries = Object.entries(probe.args);
        const args = entries.map(([k, v], i) => `${k} => $${i + 1}::${Array.isArray(v) ? 'text[]' : 'text'}`);
        await db.query(
          `select public.${probe.name}(${args.join(', ')})`,
          entries.map(([, v]) => v),
        );
      }
    } catch (e) {
      error = { code: e.code, message: e.message };
    }
    const status = interpretProbe(check, error);
    assert.ok(status.applied && !status.detail, `${check.migration}: ${error?.message ?? 'não aplicada'}`);
    statuses.push(status);
  }
  const summary = summarizeMigrations(statuses);
  assert.equal(summary.missing.length, 0);
  steps.push(`sondagens de migrations.ts: ${summary.applied}/${summary.total} aplicadas, nenhuma crítica faltando`);
  await db.exec('reset role');

  // Navegador (anon/authenticated): nada de RPC, nenhuma linha.
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select planning_snapshot('{}')"), /permission denied/);
    await assert.rejects(db.query("select commit_planning(0, '{}'::jsonb, '{}'::jsonb)"), /permission denied/);
    await assert.rejects(db.query("select ifc_version_summary('x')"), /permission denied/);
    assert.equal((await db.query('select count(*)::int n from works')).rows[0].n, 0, `${role} leu linhas`);
    await db.exec('reset role');
  }
  steps.push('anon e authenticated: RPCs negadas e RLS sem linhas: OK');

  // Conferência que o usuário roda no SQL Editor.
  const report = (await db.query(fs.readFileSync(path.join(root, 'supabase/bootstrap/conferencia.sql'), 'utf8'))).rows;
  const notOk = report.filter(r => r.situacao !== 'OK');
  assert.equal(notOk.length, 0, `conferencia.sql apontou: ${JSON.stringify(notOk, null, 1)}`);
  steps.push(`conferencia.sql: ${report.at(-1).item}`);

  for (const s of steps) console.log(`- ${s}`);
  console.log(
    `PostgreSQL isolado: bootstrap (${(Buffer.byteLength(bootstrap) / 1024).toFixed(0)} KB, ${migrations.length} migrações) num banco vazio: OK`,
  );
} finally {
  await db.close();
}

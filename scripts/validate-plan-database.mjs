// PGLITE_MODULE pode apontar para uma instalação temporária: nenhum banco externo é acessado.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE??'@electric-sql/pglite');
const db=new PGlite();
try {
  await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key,name text,public boolean);');
  for(const file of fs.readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const sql=fs.readFileSync('supabase/migrations/0023_plan_revisions.sql','utf8');
  const payload=Object.fromEntries([...sql.matchAll(/jsonb_to_recordset\(p_payload->'([^']+)'/g)].map(m=>[m[1],[]]));
  const stamp={created_at:'2026-09-22T12:00:00Z',updated_at:'2026-09-22T12:00:00Z'};
  payload.works=[{id:'w',...stamp,name:'Teste',code:'T',description:'',active:true}];
  payload.medium_term_plans=[{id:'p',...stamp,work_id:'w',month:'2026-09',name:'Plano',created_by:'tester',schedule_meta:{version:1}}];
  payload.plan_tasks=[{id:'t',...stamp,plan_id:'p',name:'Tarefa',planned_start:'2026-09-22',planned_end:'2026-09-23',progress:0,order_index:1,level:0,schedule_meta:{version:1,duration:{value:2,unit:'d'}}}];
  payload.history_events=[{id:'h',entity_id:'t',entity_type:'planning',action:'plan_task_revision',author_id:'tester',occurred_at:stamp.created_at,changes:{reason:'Teste'}}];
  const commit=(version,p=payload,deletes={})=>db.query('select commit_planning($1,$2::jsonb,$3::jsonb)',[version,JSON.stringify(p),JSON.stringify(deletes)]);
  await commit(0);
  assert.equal((await db.query("select schedule_meta->>'version' version from plan_tasks where id='t'")).rows[0].version,'1');
  await assert.rejects(commit(0),/version_conflict/);
  const invalid=structuredClone(payload);invalid.plan_tasks[0].name='Não deve gravar';invalid.plan_tasks.push({...invalid.plan_tasks[0],id:'bad',team_id:'missing'});
  await assert.rejects(commit(1,invalid));assert.equal((await db.query("select name from plan_tasks where id='t'")).rows[0].name,'Tarefa');
  payload.medium_term_plans.push({...payload.medium_term_plans[0],id:'b',baseline_of:'p',frozen_at:stamp.created_at});
  payload.plan_tasks.push({...payload.plan_tasks[0],id:'bt',plan_id:'b',schedule_meta:{version:1,sourceTaskId:'t'}});
  await commit(1);await commit(2); // upserts idênticos das bases e do histórico continuam válidos.
  const modified=structuredClone(payload);modified.plan_tasks[1].progress=99;
  await assert.rejects(commit(3,modified),/imutável/);
  await assert.rejects(db.query("delete from plan_tasks where id='bt'"),/imutável/);
  await assert.rejects(db.query("update history_events set changes='{}' where id='h'"),/imutável/);
  await assert.rejects(db.query("delete from history_events where id='h'"),/imutável/);
  await db.exec('set role authenticated');await assert.rejects(commit(3),/permission denied/);await db.exec('reset role');
  const liveOnly=structuredClone(payload);liveOnly.plan_tasks=liveOnly.plan_tasks.filter(t=>t.id!=='t');
  await commit(3,liveOnly,{plan_tasks:['t']});
  assert.equal((await db.query("select count(*)::int n from plan_tasks where id='t'")).rows[0].n,0);
  console.log('PostgreSQL isolado: 23 migrações, metadados, conflito de versão, rollback, base imutável, histórico append-only, exclusão autorizada e RPC sem acesso público: OK');
} finally {await db.close();}

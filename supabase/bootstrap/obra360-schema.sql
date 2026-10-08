-- =====================================================================================
-- Obra360 — esquema completo do banco (bootstrap)
--
-- O QUE É: todas as migrações de supabase/migrations concatenadas em ordem, mais uma seção final
-- de ajustes do bootstrap. Monta do zero as 32 tabelas, as funções commit_planning e
-- planning_snapshot, os gatilhos de imutabilidade e o bucket privado 'ifc' do Storage.
--
-- GERADO AUTOMATICAMENTE — não edite à mão. Fonte: 27 migrações, de 0001_init.sql a 0027_planning_snapshot.sql.
-- Para regenerar depois de criar uma migração nova:  npm run bootstrap:sql
--
-- COMO USAR: só num projeto Supabase VAZIO (recém-criado). Abra o SQL Editor do projeto, cole o
-- arquivo INTEIRO e clique em Run UMA vez. O editor roda o texto todo numa transação: se algum
-- comando falhar, nada fica gravado. Não rode de novo num banco que já tem o esquema — várias
-- migrações usam "create table" sem "if not exists" e falham com "already exists".
-- Depois, rode supabase/bootstrap/conferencia.sql para conferir o resultado.
--
-- Num banco que já existe, continue aplicando só as migrações novas, uma a uma.
-- =====================================================================================

-- ===== 0001_init.sql =====

-- Schema inicial: espelha src/domain/entities.ts. Ids são `text` (não `uuid`) porque
-- o domínio usa ids legíveis (ex.: "obra-1", "v1") além de crypto.randomUUID() em runtime.
-- Nenhum comando da aplicação apaga linhas (applyCommand só faz push/Object.assign),
-- então não há necessidade de ON DELETE CASCADE elaborado nem de soft delete.

create table works (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  name text not null,
  code text not null,
  description text not null default '',
  active boolean not null default true,
  prevision_project_id text
);

create table locations (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  work_id text not null references works(id),
  name text not null,
  code text not null default '',
  parent_id text references locations(id)
);

create table production_sequences (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  work_id text not null references works(id),
  name text not null,
  default_takt_days integer not null,
  calendar text not null check (calendar in ('calendar_days', 'business_days'))
);

create table wagons (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  sequence_id text not null references production_sequences(id),
  number integer not null,
  predecessor_id text references wagons(id),
  planned_start date not null,
  planned_end date not null,
  takt_days integer not null,
  actual_start date,
  responsible_ids text[] not null default '{}'
);

create table activities (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  wagon_id text not null references wagons(id),
  name text not null,
  location_id text not null references locations(id),
  responsible_id text not null,
  planned_start date not null,
  planned_end date not null,
  progress numeric not null,
  status text not null check (status in ('not_started', 'in_progress', 'completed')),
  weight numeric not null,
  mandatory boolean not null,
  origin text not null check (origin in ('manual', 'mock', 'prevision')),
  prevision_external_id text unique
);

create table terminality_criteria (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  activity_id text not null references activities(id),
  description text not null,
  mandatory boolean not null,
  fulfilled boolean not null,
  confirmed_at timestamptz,
  confirmed_by text
);

create table pending_items (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  wagon_id text not null references wagons(id),
  activity_id text references activities(id),
  description text not null,
  responsible_id text not null,
  due_date date not null,
  status text not null check (status in ('open', 'resolved')),
  blocks_terminality boolean not null,
  resolved_at timestamptz,
  resolution text
);

create table restrictions (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  wagon_id text not null references wagons(id),
  activity_id text references activities(id),
  description text not null,
  responsible_id text not null,
  due_date date not null,
  status text not null check (status in ('open', 'resolved')),
  blocks_execution boolean not null,
  blocks_terminality boolean not null,
  resolved_at timestamptz,
  resolution text
);

create table releases (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  wagon_id text not null references wagons(id),
  predecessor_id text references wagons(id),
  type text not null check (type in ('initial', 'normal', 'exceptional')),
  justification text,
  authorized_by text not null,
  regularization_responsible_id text,
  due_date date,
  released_at timestamptz not null,
  accepted_pending_ids text[] not null default '{}',
  acknowledged_debt_ids text[] not null default '{}'
);

create table terminality_debts (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  pending_item_id text not null references pending_items(id),
  release_id text not null references releases(id),
  responsible_id text not null,
  due_date date not null
);

-- History nunca é atualizado nem apagado; não estende RecordBase (sem created_at/updated_at).
create table history_events (
  id text primary key,
  entity_id text not null,
  entity_type text not null,
  action text not null,
  author_id text not null,
  occurred_at timestamptz not null,
  changes jsonb not null default '{}'
);

-- Identidade/autorização (não é escrita por commit_planning; ver client.ts do repositório).
-- Mapeada para PlanningData.users em toda leitura, pois applyCommand depende disso.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  role text not null check (role in ('viewer', 'planner', 'manager')),
  work_ids text[] not null default '{}'
);

-- Linha única de versão para concorrência otimista em commit_planning.
create table planning_meta (
  id smallint primary key default 1 check (id = 1),
  version bigint not null default 0
);
insert into planning_meta (id, version) values (1, 0);

-- RLS habilitado sem políticas: nega tudo para anon/authenticated. O acesso real
-- acontece só pelo servidor com a service role, que ignora RLS por padrão.
alter table works enable row level security;
alter table locations enable row level security;
alter table production_sequences enable row level security;
alter table wagons enable row level security;
alter table activities enable row level security;
alter table terminality_criteria enable row level security;
alter table pending_items enable row level security;
alter table restrictions enable row level security;
alter table releases enable row level security;
alter table terminality_debts enable row level security;
alter table history_events enable row level security;
alter table profiles enable row level security;
alter table planning_meta enable row level security;

-- Aplica atomicamente um snapshot completo de PlanningData (todas as tabelas exceto
-- profiles, que não é mutada por comandos) com controle de concorrência otimista.
-- p_payload usa chaves/colunas em snake_case já mapeadas pelo repositório TypeScript.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

revoke execute on function commit_planning(bigint, jsonb) from public;
grant execute on function commit_planning(bigint, jsonb) to service_role;

-- ===== 0002_commit_planning_profiles.sql =====

-- create_work mutates the acting user's profile (actor.workIds.push(work.id) in commands.ts),
-- but 0001's commit_planning excluded profiles from the write set, silently dropping that
-- change: a manager who creates a work loses access to it until someone fixes the row by hand.
-- Fix: treat profiles like every other table — upsert on every commit. No command creates a
-- new profile (those come from Supabase Auth + the seed script), so this only ever updates
-- rows that already exist via the auth.users FK.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0003_admin_role.sql =====

-- Adds the 'admin' role (grants/revokes other users' access to works — see the
-- grant_access/revoke_access commands). Separate from 'manager': admin does not
-- inherit planning permissions, it exists solely to manage who can see what.
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('viewer', 'planner', 'manager', 'admin'));

-- ===== 0004_prevision_schedule.sql =====

-- Cache local do cronograma do Prevision, por obra. Guarda o que a API devolve
-- (inclusive as datas de linha de base, que o domínio de planejamento não usa),
-- para a tela de atividades não precisar consultar o Prevision a cada abertura.
-- A atualização é sempre explícita, disparada pelo usuário.
create table prevision_activities (
  work_id text not null references works(id) on delete cascade,
  external_id text not null,
  name text not null,
  location text not null,
  planned_start date not null,
  planned_end date not null,
  baseline_start date,
  baseline_end date,
  progress numeric not null default 0,
  synced_at timestamptz not null default now(),
  primary key (work_id, external_id)
);

create index prevision_activities_work_idx on prevision_activities (work_id, planned_start);

alter table prevision_activities enable row level security;

-- ===== 0005_commit_planning_delete.sql =====

-- Adds real deletion to commit_planning, used by regenerate_sequence to remove the
-- not-yet-released tail of a wagon sequence before recreating it from the refreshed
-- Prevision schedule. Every other command still only pushes/updates — this is the one
-- place the domain is allowed to remove rows, and only for wagons/activities/criteria/
-- pending items/restrictions (never releases, debts, history or profiles).
-- p_deletes shape: {"wagons": [...ids], "activities": [...], "terminality_criteria": [...],
-- "pending_items": [...], "restrictions": [...]} — any key may be omitted.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0006_sequence_start_date.sql =====

-- Lets an admin pin where a sequence's first (still-unreleased) wagon should start, instead of
-- always defaulting to "today" on regeneration. Once a sequence has a released wagon, this field
-- stops mattering for it — the frozen boundary takes over as the anchor.
alter table production_sequences add column if not exists start_date date;

create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0007_teams_progress_baselines.sql =====

-- Fundações da expansão de escopo (longo/médio/curto prazo):
--   teams            equipes executoras, capacidade em atividades simultâneas por semana
--   activities.team_id  a equipe que executa a atividade (uma por atividade nesta versão)
--   progress_entries histórico datado de percentual executado; activities.progress segue
--                    guardando só o valor corrente, e esta tabela preserva a série temporal
--   weekly_commitments  compromissos semanais do Last Planner, base do PPC e das causas
--                    de não cumprimento (o PPC conta compromissos, não média de percentuais)
--   baselines        cópia imutável das datas planejadas da obra num momento; reprogramar
--                    o planejamento atual nunca altera uma linha de base já salva
--   restrictions.board_status  coluna do quadro Kanban de restrições

create table teams (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  work_id text not null references works(id),
  name text not null,
  weekly_capacity integer not null
);

alter table activities add column if not exists team_id text references teams(id);

create table progress_entries (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  activity_id text not null references activities(id),
  recorded_date date not null,
  progress numeric not null,
  recorded_by text not null
);

create table weekly_commitments (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  activity_id text not null references activities(id),
  week_start date not null,
  week_end date not null,
  responsible_id text not null,
  target_progress numeric not null,
  fulfilled boolean,
  cause text,
  recorded_at timestamptz,
  recorded_by text,
  unique (activity_id, week_start)
);

create table baselines (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  work_id text not null references works(id),
  name text not null,
  created_by text not null,
  wagons jsonb not null default '[]',
  activities jsonb not null default '[]'
);

alter table restrictions add column if not exists board_status text not null default 'identificada'
  check (board_status in ('identificada', 'em_tratativa', 'resolvida'));
update restrictions set board_status = 'resolvida' where status = 'resolved';

alter table teams enable row level security;
alter table progress_entries enable row level security;
alter table weekly_commitments enable row level security;
alter table baselines enable row level security;

-- Mesma função de 0006 com três blocos novos (teams antes de activities por causa da FK,
-- progress_entries depois de activities, baselines depois de works) e as duas colunas novas.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, name, weekly_capacity)
  select id, created_at, updated_at, work_id, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, target_progress, fulfilled, cause, recorded_at, recorded_by)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, target_progress, fulfilled, cause, recorded_at, recorded_by
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, target_progress numeric, fulfilled boolean, cause text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, target_progress = excluded.target_progress,
    fulfilled = excluded.fulfilled, cause = excluded.cause,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0008_ifc_repository.sql =====

-- Repositório IFC e vínculo por regras:
--   ifc_models          o modelo em si (obra + disciplina); é só o cabeçalho, sem arquivo
--   ifc_model_versions  histórico de uploads do modelo. Cada upload é uma versão nova e
--                       imutável: o app só acrescenta (append-only), nunca atualiza nem
--                       apaga, para que a versão usada num planejamento antigo continue
--                       recuperável. O arquivo .ifc não fica no banco — vive no Storage,
--                       e a linha guarda apenas storage_path/file_size/file_name.
--   link_rules          regras que ligam elementos IFC a serviços por critérios
--                       (pavimento/tipo). Os vínculos elemento-a-elemento NÃO são
--                       persistidos de propósito: são derivados das regras a cada leitura
--                       do modelo. Como o snapshot inteiro viaja em todo comando
--                       (commit_planning recebe o payload completo), guardar milhares de
--                       vínculos por modelo inflaria cada escrita sem ganho nenhum.
-- A coluna é order_index porque `order` é palavra reservada em SQL; o mapper traduz
-- LinkRule.order <-> link_rules.order_index.

create table ifc_models (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  work_id text not null references works(id),
  name text not null,
  discipline text not null
);

create table ifc_model_versions (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  model_id text not null references ifc_models(id),
  version integer not null,
  file_name text not null,
  file_size bigint not null,
  storage_path text not null unique,
  uploaded_by text not null,
  storeys text[] not null default '{}',
  element_count integer not null default 0,
  unique (model_id, version)
);

create table link_rules (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  work_id text not null references works(id),
  order_index integer not null,
  service_name text not null,
  criteria jsonb not null default '[]'
);

-- RLS habilitado sem políticas: nega tudo para anon/authenticated. O acesso real
-- acontece só pelo servidor com a service role, que ignora RLS por padrão.
alter table ifc_models enable row level security;
alter table ifc_model_versions enable row level security;
alter table link_rules enable row level security;

-- Bucket privado dos arquivos .ifc. Mesma lógica das tabelas: nenhuma política de
-- storage para anon/authenticated, porque o download acontece só por URL assinada
-- gerada no servidor com a service role.
insert into storage.buckets (id, name, public) values ('ifc', 'ifc', false)
on conflict (id) do nothing;

-- Mesma função de 0007 com três blocos novos (ifc_models antes de ifc_model_versions
-- por causa da FK, ambos depois de works; link_rules depois de works) e o delete de
-- link_rules, que agora o app sabe remover.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, name, weekly_capacity)
  select id, created_at, updated_at, work_id, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, target_progress, fulfilled, cause, recorded_at, recorded_by)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, target_progress, fulfilled, cause, recorded_at, recorded_by
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, target_progress numeric, fulfilled boolean, cause text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, target_progress = excluded.target_progress,
    fulfilled = excluded.fulfilled, cause = excluded.cause,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0009_restriction_lead_time.sql =====

-- O lead time é o prazo de obtenção da pendência. Quando informado junto da atividade,
-- o limite de resolução deixa de ser digitado: sai do início previsto da atividade menos
-- esse lead time, porque o prazo precisa caber antes de a frente começar. A data continua
-- gravada em due_date (é ela que as regras de bloqueio leem); lead_time_days registra
-- como ela foi obtida, e permite recalcular o limite se a atividade for reprogramada.

alter table restrictions add column if not exists lead_time_days integer
  check (lead_time_days is null or lead_time_days >= 0);

-- Mesma função de 0008, com lead_time_days somado ao bloco de restrictions.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, name, weekly_capacity)
  select id, created_at, updated_at, work_id, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, target_progress, fulfilled, cause, recorded_at, recorded_by)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, target_progress, fulfilled, cause, recorded_at, recorded_by
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, target_progress numeric, fulfilled boolean, cause text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, target_progress = excluded.target_progress,
    fulfilled = excluded.fulfilled, cause = excluded.cause,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text, lead_time_days integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status, lead_time_days = excluded.lead_time_days;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0010_activity_network.sql =====

-- Rede de precedência e anotações por atividade, para o médio prazo substituir o MS Project:
--   activity_dependencies  dependência término-início entre duas atividades da mesma obra
--   activities.notes       anotação livre da linha
-- O produto reprograma manualmente, por decisão de escopo: a dependência serve para ler a
-- rede e apontar incoerência (sucessora começando antes do término da predecessora), nunca
-- para mover datas sozinha.

create table activity_dependencies (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  predecessor_id text not null references activities(id),
  successor_id text not null references activities(id),
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

alter table activities add column if not exists notes text;

alter table activity_dependencies enable row level security;

-- Mesma função de 0009, com o bloco de activity_dependencies, notes em activities e a
-- remoção das dependências antes das atividades.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from activity_dependencies where id in (select jsonb_array_elements_text(p_deletes->'activity_dependencies'));
  delete from activity_dependencies where predecessor_id in (select jsonb_array_elements_text(p_deletes->'activities'))
     or successor_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, name, weekly_capacity)
  select id, created_at, updated_at, work_id, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text, notes text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id,
    notes = excluded.notes;

  insert into activity_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'activity_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, target_progress, fulfilled, cause, recorded_at, recorded_by)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, target_progress, fulfilled, cause, recorded_at, recorded_by
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, target_progress numeric, fulfilled boolean, cause text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, target_progress = excluded.target_progress,
    fulfilled = excluded.fulfilled, cause = excluded.cause,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text, lead_time_days integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status, lead_time_days = excluded.lead_time_days;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0011_production_sheet.sql =====

-- O curto prazo passa a ser a planilha de produção que a equipe já preenche, e o compromisso
-- muda de forma: sai a meta de percentual (a planilha não tem) e entram empresa, equipe,
-- período dentro da semana, os dias marcados e a justificativa. A causa continua em texto,
-- validada no domínio contra a lista fechada de 17 causas (mantê-la aqui duplicaria a lista
-- e ela sairia de sincronia).
--
-- Os defaults existem só para a migração ser segura se a tabela não estiver vazia; a aplicação
-- sempre envia os valores reais.

alter table weekly_commitments drop column if exists target_progress;
alter table weekly_commitments add column if not exists company text not null default '';
alter table weekly_commitments add column if not exists crew text not null default '';
alter table weekly_commitments add column if not exists start_date date not null default current_date;
alter table weekly_commitments add column if not exists end_date date not null default current_date;
alter table weekly_commitments add column if not exists weekdays integer[] not null default '{}';
alter table weekly_commitments add column if not exists justification text;

-- Mesma função de 0010, com o bloco de weekly_commitments na forma nova.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from activity_dependencies where id in (select jsonb_array_elements_text(p_deletes->'activity_dependencies'));
  delete from activity_dependencies where predecessor_id in (select jsonb_array_elements_text(p_deletes->'activities'))
     or successor_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, name, weekly_capacity)
  select id, created_at, updated_at, work_id, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text, notes text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id,
    notes = excluded.notes;

  insert into activity_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'activity_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, company, crew, start_date, end_date, weekdays, fulfilled, cause, justification, recorded_at, recorded_by)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, company, crew, start_date, end_date, weekdays, fulfilled, cause, justification, recorded_at, recorded_by
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, company text, crew text, start_date date, end_date date,
    weekdays integer[], fulfilled boolean, cause text, justification text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, company = excluded.company, crew = excluded.crew,
    start_date = excluded.start_date, end_date = excluded.end_date, weekdays = excluded.weekdays,
    fulfilled = excluded.fulfilled, cause = excluded.cause, justification = excluded.justification,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text, lead_time_days integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status, lead_time_days = excluded.lead_time_days;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0012_team_registry.sql =====

-- A tabela de equipes passa a ser o cadastro único de quem executa: ganha a empresa, que era
-- coluna solta na planilha semanal, e o compromisso passa a apontar para a equipe em vez de
-- repetir empresa e equipe como texto. O cronograma do médio prazo já usava esse cadastro
-- como recurso, então as duas telas passam a falar da mesma coisa.
--
-- Também libera exclusão de equipe e de linha da planilha, a pedido do usuário: é como se
-- corrige um apontamento, já que um cumprimento registrado não é editável.

alter table teams add column if not exists company text not null default '';

alter table weekly_commitments drop column if exists company;
alter table weekly_commitments drop column if exists crew;
alter table weekly_commitments add column if not exists team_id text references teams(id);

-- Mesma função de 0011, com company em teams, team_id no compromisso e as duas exclusões novas.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from activity_dependencies where id in (select jsonb_array_elements_text(p_deletes->'activity_dependencies'));
  delete from activity_dependencies where predecessor_id in (select jsonb_array_elements_text(p_deletes->'activities'))
     or successor_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- A planilha e o cadastro de equipes agora aceitam exclusão. O compromisso sai antes da
  -- equipe, e a equipe depois das atividades, por causa das chaves estrangeiras.
  delete from weekly_commitments where id in (select jsonb_array_elements_text(p_deletes->'weekly_commitments'));
  delete from teams where id in (select jsonb_array_elements_text(p_deletes->'teams'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, company, name, weekly_capacity)
  select id, created_at, updated_at, work_id, company, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, company text,
    name text, weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, company = excluded.company,
    name = excluded.name, weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text, notes text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id,
    notes = excluded.notes;

  insert into activity_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'activity_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, weekdays, fulfilled, cause, justification, recorded_at, recorded_by)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, weekdays, fulfilled, cause, justification, recorded_at, recorded_by
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, team_id text, start_date date, end_date date,
    weekdays integer[], fulfilled boolean, cause text, justification text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, team_id = excluded.team_id,
    start_date = excluded.start_date, end_date = excluded.end_date, weekdays = excluded.weekdays,
    fulfilled = excluded.fulfilled, cause = excluded.cause, justification = excluded.justification,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text, lead_time_days integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status, lead_time_days = excluded.lead_time_days;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0013_monthly_plan.sql =====

-- O médio prazo passa a ter plano mensal próprio: a folha que o planejador preenche para o
-- mês, que nasce vazia. Um plano vivo por mês por obra.
--
-- A linha de base é o próprio plano congelado: `baseline_of` aponta para o plano de origem e
-- `frozen_at` marca o congelamento. Assim ela abre no mesmo cronograma e serve de comparação,
-- em vez de virar estrutura paralela — e plano congelado não aceita edição.
--
-- A linha do plano é escrita à mão; `activity_id` liga ao longo prazo quando faz sentido, sem
-- obrigar, e é o rastro entre o mês detalhado e o serviço macro.

create table medium_term_plans (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  work_id text not null references works(id),
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  name text not null,
  baseline_of text references medium_term_plans(id),
  frozen_at timestamptz,
  created_by text not null
);

create table plan_tasks (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  plan_id text not null references medium_term_plans(id),
  name text not null,
  planned_start date not null,
  planned_end date not null,
  team_id text references teams(id),
  activity_id text references activities(id),
  notes text,
  progress numeric not null default 0,
  order_index integer not null default 1
);

create table plan_dependencies (
  id text primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  predecessor_id text not null references plan_tasks(id),
  successor_id text not null references plan_tasks(id),
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);

alter table medium_term_plans enable row level security;
alter table plan_tasks enable row level security;
alter table plan_dependencies enable row level security;

-- Mesma função de 0012, com os três blocos novos e as três exclusões novas.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from activity_dependencies where id in (select jsonb_array_elements_text(p_deletes->'activity_dependencies'));
  delete from activity_dependencies where predecessor_id in (select jsonb_array_elements_text(p_deletes->'activities'))
     or successor_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- A planilha e o cadastro de equipes agora aceitam exclusão. O compromisso sai antes da
  -- equipe, e a equipe depois das atividades, por causa das chaves estrangeiras.
  delete from plan_dependencies where id in (select jsonb_array_elements_text(p_deletes->'plan_dependencies'));
  delete from plan_tasks where id in (select jsonb_array_elements_text(p_deletes->'plan_tasks'));
  delete from medium_term_plans where id in (select jsonb_array_elements_text(p_deletes->'medium_term_plans'));
  delete from weekly_commitments where id in (select jsonb_array_elements_text(p_deletes->'weekly_commitments'));
  delete from teams where id in (select jsonb_array_elements_text(p_deletes->'teams'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, company, name, weekly_capacity)
  select id, created_at, updated_at, work_id, company, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, company text,
    name text, weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, company = excluded.company,
    name = excluded.name, weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text, notes text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id,
    notes = excluded.notes;

  insert into activity_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'activity_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into medium_term_plans (id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by)
  select id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by
  from jsonb_to_recordset(p_payload->'medium_term_plans') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, month text, name text,
    baseline_of text, frozen_at timestamptz, created_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, month = excluded.month,
    name = excluded.name, baseline_of = excluded.baseline_of, frozen_at = excluded.frozen_at,
    created_by = excluded.created_by;

  insert into plan_tasks (id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index)
  select id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index
  from jsonb_to_recordset(p_payload->'plan_tasks') as t(
    id text, created_at timestamptz, updated_at timestamptz, plan_id text, name text,
    planned_start date, planned_end date, team_id text, activity_id text, notes text,
    progress numeric, order_index integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, plan_id = excluded.plan_id, name = excluded.name,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    team_id = excluded.team_id, activity_id = excluded.activity_id, notes = excluded.notes,
    progress = excluded.progress, order_index = excluded.order_index;

  insert into plan_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'plan_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, weekdays, fulfilled, cause, justification, recorded_at, recorded_by)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, weekdays, fulfilled, cause, justification, recorded_at, recorded_by
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, team_id text, start_date date, end_date date,
    weekdays integer[], fulfilled boolean, cause text, justification text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, team_id = excluded.team_id,
    start_date = excluded.start_date, end_date = excluded.end_date, weekdays = excluded.weekdays,
    fulfilled = excluded.fulfilled, cause = excluded.cause, justification = excluded.justification,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text, lead_time_days integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status, lead_time_days = excluded.lead_time_days;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0014_weekly_from_scratch.sql =====

-- A semana do curto prazo passa a ser montada do zero, como o plano do mês: a linha ganha
-- `work_id` e `name` escritos à mão, e `activity_id` deixa de ser obrigatório.
--
-- O motivo está na planilha real: a coluna Atividade mistura frentes de obra com tarefas que
-- não existem no cronograma ("Diário de obra", "GFIP", "Visita", "NF - ..."). Exigir vínculo
-- com atividade importada impedia registrar metade do que a equipe de fato planeja na semana.
--
-- O default em work_id existe só para a migração ser segura se a tabela não estiver vazia; a
-- aplicação sempre envia o valor real.

alter table weekly_commitments add column if not exists work_id text references works(id);
alter table weekly_commitments add column if not exists name text not null default '';
alter table weekly_commitments alter column activity_id drop not null;

-- Mesma função de 0013, com work_id e name no bloco do compromisso.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from activity_dependencies where id in (select jsonb_array_elements_text(p_deletes->'activity_dependencies'));
  delete from activity_dependencies where predecessor_id in (select jsonb_array_elements_text(p_deletes->'activities'))
     or successor_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- A planilha e o cadastro de equipes agora aceitam exclusão. O compromisso sai antes da
  -- equipe, e a equipe depois das atividades, por causa das chaves estrangeiras.
  delete from plan_dependencies where id in (select jsonb_array_elements_text(p_deletes->'plan_dependencies'));
  delete from plan_tasks where id in (select jsonb_array_elements_text(p_deletes->'plan_tasks'));
  delete from medium_term_plans where id in (select jsonb_array_elements_text(p_deletes->'medium_term_plans'));
  delete from weekly_commitments where id in (select jsonb_array_elements_text(p_deletes->'weekly_commitments'));
  delete from teams where id in (select jsonb_array_elements_text(p_deletes->'teams'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, company, name, weekly_capacity)
  select id, created_at, updated_at, work_id, company, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, company text,
    name text, weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, company = excluded.company,
    name = excluded.name, weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text, notes text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id,
    notes = excluded.notes;

  insert into activity_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'activity_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into medium_term_plans (id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by)
  select id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by
  from jsonb_to_recordset(p_payload->'medium_term_plans') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, month text, name text,
    baseline_of text, frozen_at timestamptz, created_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, month = excluded.month,
    name = excluded.name, baseline_of = excluded.baseline_of, frozen_at = excluded.frozen_at,
    created_by = excluded.created_by;

  insert into plan_tasks (id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index)
  select id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index
  from jsonb_to_recordset(p_payload->'plan_tasks') as t(
    id text, created_at timestamptz, updated_at timestamptz, plan_id text, name text,
    planned_start date, planned_end date, team_id text, activity_id text, notes text,
    progress numeric, order_index integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, plan_id = excluded.plan_id, name = excluded.name,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    team_id = excluded.team_id, activity_id = excluded.activity_id, notes = excluded.notes,
    progress = excluded.progress, order_index = excluded.order_index;

  insert into plan_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'plan_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, weekdays, fulfilled, cause, justification, recorded_at, recorded_by, work_id, name)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, weekdays, fulfilled, cause, justification, recorded_at, recorded_by, work_id, name
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, team_id text, start_date date, end_date date, work_id text, name text,
    weekdays integer[], fulfilled boolean, cause text, justification text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, team_id = excluded.team_id,
    start_date = excluded.start_date, end_date = excluded.end_date, weekdays = excluded.weekdays,
    fulfilled = excluded.fulfilled, cause = excluded.cause, justification = excluded.justification,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by,
    work_id = excluded.work_id, name = excluded.name;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text, lead_time_days integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status, lead_time_days = excluded.lead_time_days;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0015_ifc_as_data.sql =====

-- O IFC é uma base de dados serializada em texto: cada linha do arquivo é uma instância
-- tipada (#123 = IFCWALL('guid', #5, 'Nome', ...)), e as relações são entidades próprias
-- (IfcRelContainedInSpatialStructure, IfcRelDefinesByProperties, IfcRelAggregates). Estas
-- tabelas transcrevem a parte que o planejamento usa: elemento, propriedade e quantidade.
--
-- Elas ficam FORA do snapshot do planejamento de propósito. Um modelo real tem de 10 mil a
-- centenas de milhares de elementos, e commit_planning trafega o PlanningData inteiro a cada
-- comando — incluir isso ali faria cada gravação custar o tamanho do modelo. Por isso a
-- função commit_planning não é tocada nesta migração: a escrita vem de rota própria e a
-- leitura é paginada e agregada no banco.
--
-- A chave natural é (version_id, express_id): o express id só é único dentro de um arquivo,
-- e cada versão do modelo é um arquivo diferente. GlobalId é estável entre versões e é o que
-- permite comparar o mesmo elemento ao longo do tempo — por isso ele é indexado à parte.

create table ifc_elements (
  id text primary key,
  created_at timestamptz not null,
  version_id text not null references ifc_model_versions(id),
  express_id integer not null,
  global_id text,
  ifc_class text not null,
  name text,
  object_type text,
  storey text,
  -- Atributos crus da instância, para não perder o que a projeção não previu.
  attributes jsonb not null default '{}',
  unique (version_id, express_id)
);

create table ifc_properties (
  id text primary key,
  created_at timestamptz not null,
  version_id text not null references ifc_model_versions(id),
  express_id integer not null,
  pset text not null,
  name text not null,
  value_text text,
  value_number numeric,
  unit text
);

create table ifc_quantities (
  id text primary key,
  created_at timestamptz not null,
  version_id text not null references ifc_model_versions(id),
  express_id integer not null,
  qset text not null,
  name text not null,
  kind text not null check (kind in ('area', 'volume', 'length', 'count', 'weight', 'time')),
  value numeric not null,
  unit text
);

create index ifc_elements_version_class on ifc_elements (version_id, ifc_class);
create index ifc_elements_version_storey on ifc_elements (version_id, storey);
create index ifc_elements_global on ifc_elements (global_id);
create index ifc_properties_lookup on ifc_properties (version_id, name);
create index ifc_properties_element on ifc_properties (version_id, express_id);
create index ifc_quantities_lookup on ifc_quantities (version_id, name);
create index ifc_quantities_element on ifc_quantities (version_id, express_id);

alter table ifc_elements enable row level security;
alter table ifc_properties enable row level security;
alter table ifc_quantities enable row level security;

-- Marca na versão o que já foi transcrito, para a tela saber se precisa extrair e para a
-- reextração ser idempotente: apaga o que é daquela versão e grava de novo.
alter table ifc_model_versions add column if not exists extracted_at timestamptz;
alter table ifc_model_versions add column if not exists element_rows integer not null default 0;

-- ===== 0016_ifc_geometry.sql =====

-- Geometria do elemento como dado, para o 3D sair da tabela e não do arquivo.
--
-- Guarda-se a caixa envolvente em coordenadas do modelo: seis números por elemento, algo como
-- 10 MB para um modelo de 100 mil elementos. Isso basta para a leitura de planejamento — a
-- massa do prédio, pavimento a pavimento, colorida por serviço e por status — e funciona em
-- qualquer tamanho de arquivo, inclusive nos que não cabem no limite do Storage.
--
-- A malha completa (triângulos por elemento) ficou de fora de propósito: são de 50 a 500 MB
-- de geometria por modelo, que precisariam de streaming por partes para renderizar. Se um dia
-- for necessária, entra em tabela própria sem desfazer esta.

alter table ifc_elements add column if not exists min_x numeric;
alter table ifc_elements add column if not exists min_y numeric;
alter table ifc_elements add column if not exists min_z numeric;
alter table ifc_elements add column if not exists max_x numeric;
alter table ifc_elements add column if not exists max_y numeric;
alter table ifc_elements add column if not exists max_z numeric;

-- Marca na versão se a transcrição trouxe geometria: um IFC sem representação geométrica é
-- válido e continua útil como dado, então a ausência precisa ser distinguível de falha.
alter table ifc_model_versions add column if not exists has_geometry boolean not null default false;

-- ===== 0017_ifc_optional_file.sql =====

-- O arquivo IFC deixa de ser obrigatório: o que vale é a transcrição.
--
-- Desde a 0015 o modelo vive em tabela (elemento, propriedade, quantidade) e desde a 0016 a
-- geometria de leitura também. O .ifc original virou anexo conveniente — e é justamente ele que
-- não cabe: o limite por arquivo do Storage trava em 50 MB no plano gratuito, enquanto um modelo
-- de obra passa disso com folga. Prender a versão ao arquivo faria o limite do Storage decidir o
-- que a obra pode planejar.
--
-- A unicidade continua: no Postgres, valores nulos não conflitam num índice único, então várias
-- versões sem arquivo convivem e dois registros nunca apontam para o mesmo objeto do Storage.
alter table ifc_model_versions alter column storage_path drop not null;

-- ===== 0018_ifc_summary.sql =====

-- O quantitativo do modelo é somado no banco, não no navegador.
--
-- A tela lia os elementos e as quantidades da versão e contava no cliente. Funcionava no modelo
-- de teste e mentia no modelo de obra: a API REST corta a resposta em 1.000 linhas (max_rows do
-- projeto), então um modelo de 80 mil elementos era resumido por uma amostra de mil — com o
-- agravante de o número sair plausível, sem erro nenhum na tela.
--
-- Agrupar é trabalho de banco de dados. Uma chamada, um jsonb, contagem exata.

create or replace function ifc_version_summary(p_version_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'elementos', (select count(*) from ifc_elements where version_id = p_version_id),
    'comGeometria', (select count(*) from ifc_elements where version_id = p_version_id and min_x is not null),
    'porClasse', coalesce((select jsonb_agg(item) from (
        select jsonb_build_object('nome', ifc_class, 'total', count(*)) as item
        from ifc_elements where version_id = p_version_id group by ifc_class order by count(*) desc) t), '[]'::jsonb),
    'porPavimento', coalesce((select jsonb_agg(item) from (
        select jsonb_build_object('nome', coalesce(nullif(btrim(storey), ''), 'Sem informação'), 'total', count(*)) as item
        from ifc_elements where version_id = p_version_id
        group by coalesce(nullif(btrim(storey), ''), 'Sem informação') order by count(*) desc) t), '[]'::jsonb),
    -- A unidade vem do próprio IFC e pode faltar em parte das linhas; max() pega a que existe.
    'quantidades', coalesce((select jsonb_agg(item) from (
        select jsonb_build_object('nome', name, 'kind', kind, 'unidade', max(unit), 'total', sum(value), 'itens', count(*)) as item
        from ifc_quantities where version_id = p_version_id group by name, kind order by sum(value) desc) t), '[]'::jsonb)
  );
$$;

-- A função é chamada pelo servidor da aplicação, que usa a service role; nenhum acesso anônimo.
revoke all on function ifc_version_summary(text) from public;
revoke all on function ifc_version_summary(text) from anon;
revoke all on function ifc_version_summary(text) from authenticated;
grant execute on function ifc_version_summary(text) to service_role;

-- ===== 0019_ifc_fragments.sql =====

-- A geometria do modelo passa a ser guardada convertida, não reduzida a caixas.
--
-- A caixa envolvente resolvia o tamanho e perdia a forma: o prédio saía blocado. O formato
-- Fragments (@thatopen/fragments) guarda a malha de verdade em binário compacto — um IFC de
-- 217 MB medido virou 15 MB de Fragments. Isso cabe folgado no limite por arquivo do Storage,
-- que era o bloqueio original, e abre rápido no navegador sem reabrir o STEP.
--
-- O ponteiro fica em tabela própria, fora do snapshot do planejamento: o snapshot trafega
-- inteiro a cada comando, e a conversão é escrita por outro caminho (a ingestão), não pelo
-- comando. Guardar o caminho em ifc_model_versions obrigaria a reescrever commit_planning e
-- deixaria um commit concorrente sobrescrever o que a ingestão acabou de gravar.
--
-- O binário em si não vira coluna bytea: lê-se o objeto do Storage por URL assinada, como o
-- .ifc original, sem trazer megabytes por dentro do Postgres a cada consulta.

create table if not exists ifc_fragments (
  version_id text primary key references ifc_model_versions(id) on delete cascade,
  created_at timestamptz not null,
  storage_path text not null unique,
  byte_size bigint not null
);

-- Servidor apenas, como as outras tabelas transcritas: RLS ligada e nenhuma política.
alter table ifc_fragments enable row level security;

-- ===== 0020_outline_and_supplier.sql =====

-- Item e subitem no plano do mês, e um curto prazo que não depende de cadastro nenhum.
--
-- O plano do mês ganha nível de recuo: é assim que o MS Project representa item e subitem, e é o
-- que faltava para o plano ter estrutura em vez de uma lista plana. O pai não guarda datas
-- próprias — início, término e avanço de uma linha com filhos são os dos filhos, calculados na
-- leitura, porque guardar os dois seria manter duas verdades sobre a mesma data.
--
-- A planilha da semana passa a se sustentar sozinha. Antes, escrever uma linha exigia uma equipe
-- cadastrada, e a empresa vinha do cadastro dela: quem preenche a semana ficava dependente de um
-- cadastro feito em outra tela, para uma planilha que na obra é preenchida direto. Agora o
-- fornecedor é texto na própria linha e a equipe é opcional.
--
-- E os dias marcados saem: eles eram o que o usuário preenchia para as datas serem calculadas, e
-- agora é o contrário — as datas são digitadas e o calendário da semana se preenche a partir
-- delas. Uma coluna que ninguém mais escreve não fica no banco fingindo que ainda decide algo.

alter table plan_tasks add column if not exists level integer not null default 0;
alter table weekly_commitments add column if not exists supplier text not null default '';
alter table weekly_commitments alter column team_id drop not null;
alter table weekly_commitments drop column if exists weekdays;

-- Mesma função de 0014, com o nível na tarefa e o fornecedor no compromisso.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from activity_dependencies where id in (select jsonb_array_elements_text(p_deletes->'activity_dependencies'));
  delete from activity_dependencies where predecessor_id in (select jsonb_array_elements_text(p_deletes->'activities'))
     or successor_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- A planilha e o cadastro de equipes agora aceitam exclusão. O compromisso sai antes da
  -- equipe, e a equipe depois das atividades, por causa das chaves estrangeiras.
  delete from plan_dependencies where id in (select jsonb_array_elements_text(p_deletes->'plan_dependencies'));
  delete from plan_tasks where id in (select jsonb_array_elements_text(p_deletes->'plan_tasks'));
  delete from medium_term_plans where id in (select jsonb_array_elements_text(p_deletes->'medium_term_plans'));
  delete from weekly_commitments where id in (select jsonb_array_elements_text(p_deletes->'weekly_commitments'));
  delete from teams where id in (select jsonb_array_elements_text(p_deletes->'teams'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, company, name, weekly_capacity)
  select id, created_at, updated_at, work_id, company, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, company text,
    name text, weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, company = excluded.company,
    name = excluded.name, weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text, notes text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id,
    notes = excluded.notes;

  insert into activity_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'activity_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into medium_term_plans (id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by)
  select id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by
  from jsonb_to_recordset(p_payload->'medium_term_plans') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, month text, name text,
    baseline_of text, frozen_at timestamptz, created_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, month = excluded.month,
    name = excluded.name, baseline_of = excluded.baseline_of, frozen_at = excluded.frozen_at,
    created_by = excluded.created_by;

  insert into plan_tasks (id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index, level)
  select id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index, level
  from jsonb_to_recordset(p_payload->'plan_tasks') as t(
    id text, created_at timestamptz, updated_at timestamptz, plan_id text, name text,
    planned_start date, planned_end date, team_id text, activity_id text, notes text,
    progress numeric, order_index integer, level integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, plan_id = excluded.plan_id, name = excluded.name,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    team_id = excluded.team_id, activity_id = excluded.activity_id, notes = excluded.notes,
    progress = excluded.progress, order_index = excluded.order_index, level = excluded.level;

  insert into plan_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'plan_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, supplier, fulfilled, cause, justification, recorded_at, recorded_by, work_id, name)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, supplier, fulfilled, cause, justification, recorded_at, recorded_by, work_id, name
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, team_id text, start_date date, end_date date, work_id text, name text,
    supplier text, fulfilled boolean, cause text, justification text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, team_id = excluded.team_id,
    start_date = excluded.start_date, end_date = excluded.end_date, supplier = excluded.supplier,
    fulfilled = excluded.fulfilled, cause = excluded.cause, justification = excluded.justification,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by,
    work_id = excluded.work_id, name = excluded.name;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text, lead_time_days integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status, lead_time_days = excluded.lead_time_days;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0021_ifc_federations.sql =====

-- Composições imutáveis, fora do snapshot de planejamento. Cada salvamento cria uma cópia.
-- `if not exists` porque as migrações são rodadas à mão, uma a uma, no painel: rodar duas vezes
-- por engano já derrubou uma sessão de trabalho com "relation already exists".
-- A API valida as versões e sua obra; as versões IFC não são excluídas pelo aplicativo.
create table if not exists ifc_federations (
  id text primary key,
  work_id text not null references works(id),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  version_ids text[] not null check (cardinality(version_ids) between 1 and 200),
  created_at timestamptz not null default now(),
  created_by text not null
);
create index if not exists ifc_federations_work_created on ifc_federations (work_id, created_at desc, id);
-- Mesmo contrato das demais tabelas IFC: acesso via servidor autorizado por obra.
alter table ifc_federations enable row level security;

-- ===== 0022_plan_link_types.sql =====

-- Vínculos do plano do mês nos quatro tipos do Project, com defasagem.
--
-- Antes havia só um par predecessora/sucessora, e a coerência era conferida como se todo vínculo
-- fosse Término-Início. Isso descreve mal a obra: a alvenaria do 5º não espera a do 4º terminar
-- para começar — ela começa alguns dias depois de a outra começar (Início-Início com defasagem),
-- e é assim que a equipe sobe o prédio. Quem só tinha TI ou mentia a data ou não usava o vínculo.
--
-- `lag_business` separa o `2d` do `2dd`: dois dias úteis e dois dias corridos caem em datas
-- diferentes quando o intervalo atravessa um fim de semana, e o Project faz essa distinção.
--
-- Os valores padrão descrevem o que já estava gravado: todo vínculo existente é TI sem defasagem.

alter table plan_dependencies add column if not exists link_type text not null default 'TI'
  check (link_type in ('TI', 'II', 'TT', 'IT'));
alter table plan_dependencies add column if not exists lag_days integer not null default 0
  check (lag_days between -365 and 365);
alter table plan_dependencies add column if not exists lag_business boolean not null default true;

-- Mesma função de 0020, com tipo e defasagem no vínculo do plano.
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  -- Children before parents, so FKs never block the delete.
  delete from activity_dependencies where id in (select jsonb_array_elements_text(p_deletes->'activity_dependencies'));
  delete from activity_dependencies where predecessor_id in (select jsonb_array_elements_text(p_deletes->'activities'))
     or successor_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- A planilha e o cadastro de equipes agora aceitam exclusão. O compromisso sai antes da
  -- equipe, e a equipe depois das atividades, por causa das chaves estrangeiras.
  delete from plan_dependencies where id in (select jsonb_array_elements_text(p_deletes->'plan_dependencies'));
  delete from plan_tasks where id in (select jsonb_array_elements_text(p_deletes->'plan_tasks'));
  delete from medium_term_plans where id in (select jsonb_array_elements_text(p_deletes->'medium_term_plans'));
  delete from weekly_commitments where id in (select jsonb_array_elements_text(p_deletes->'weekly_commitments'));
  delete from teams where id in (select jsonb_array_elements_text(p_deletes->'teams'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, company, name, weekly_capacity)
  select id, created_at, updated_at, work_id, company, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, company text,
    name text, weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, company = excluded.company,
    name = excluded.name, weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text, notes text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id,
    notes = excluded.notes;

  insert into activity_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'activity_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into medium_term_plans (id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by)
  select id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by
  from jsonb_to_recordset(p_payload->'medium_term_plans') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, month text, name text,
    baseline_of text, frozen_at timestamptz, created_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, month = excluded.month,
    name = excluded.name, baseline_of = excluded.baseline_of, frozen_at = excluded.frozen_at,
    created_by = excluded.created_by;

  insert into plan_tasks (id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index, level)
  select id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index, level
  from jsonb_to_recordset(p_payload->'plan_tasks') as t(
    id text, created_at timestamptz, updated_at timestamptz, plan_id text, name text,
    planned_start date, planned_end date, team_id text, activity_id text, notes text,
    progress numeric, order_index integer, level integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, plan_id = excluded.plan_id, name = excluded.name,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    team_id = excluded.team_id, activity_id = excluded.activity_id, notes = excluded.notes,
    progress = excluded.progress, order_index = excluded.order_index, level = excluded.level;

  insert into plan_dependencies (id, created_at, updated_at, predecessor_id, successor_id, link_type, lag_days, lag_business)
  select id, created_at, updated_at, predecessor_id, successor_id, link_type, lag_days, lag_business
  from jsonb_to_recordset(p_payload->'plan_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text,
    link_type text, lag_days integer, lag_business boolean
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id, link_type = excluded.link_type,
    lag_days = excluded.lag_days, lag_business = excluded.lag_business;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, supplier, fulfilled, cause, justification, recorded_at, recorded_by, work_id, name)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, supplier, fulfilled, cause, justification, recorded_at, recorded_by, work_id, name
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, team_id text, start_date date, end_date date, work_id text, name text,
    supplier text, fulfilled boolean, cause text, justification text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, team_id = excluded.team_id,
    start_date = excluded.start_date, end_date = excluded.end_date, supplier = excluded.supplier,
    fulfilled = excluded.fulfilled, cause = excluded.cause, justification = excluded.justification,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by,
    work_id = excluded.work_id, name = excluded.name;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text, lead_time_days integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status, lead_time_days = excluded.lead_time_days;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

-- ===== 0023_plan_revisions.sql =====

-- Aplicada no Supabase remoto em 23/09/2026. Mantém o contrato transacional de 0022.
-- Não é reexecutável: as funções guard_* e os gatilhos usam create sem "or replace"/"if not exists".
alter table medium_term_plans add column if not exists schedule_meta jsonb not null default '{}';
alter table plan_tasks add column if not exists schedule_meta jsonb not null default '{}';
create or replace function commit_planning(p_expected_version bigint, p_payload jsonb, p_deletes jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  select version into v_current from planning_meta where id = 1 for update;

  if v_current <> p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_payload->'plan_tasks') j
    join medium_term_plans p on p.id=j->>'plan_id' and p.frozen_at is not null
    where not exists (select 1 from plan_tasks t where t.id=j->>'id')
  ) or exists (
    select 1 from jsonb_array_elements(p_payload->'plan_dependencies') j
    join plan_tasks t on t.id=j->>'successor_id'
    join medium_term_plans p on p.id=t.plan_id and p.frozen_at is not null
    where not exists (select 1 from plan_dependencies d where d.id=j->>'id')
  ) then raise exception 'Linha de base é imutável'; end if;

  -- Children before parents, so FKs never block the delete.
  delete from activity_dependencies where id in (select jsonb_array_elements_text(p_deletes->'activity_dependencies'));
  delete from activity_dependencies where predecessor_id in (select jsonb_array_elements_text(p_deletes->'activities'))
     or successor_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from progress_entries where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from weekly_commitments where activity_id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from terminality_criteria where id in (select jsonb_array_elements_text(p_deletes->'terminality_criteria'));
  delete from pending_items where id in (select jsonb_array_elements_text(p_deletes->'pending_items'));
  delete from restrictions where id in (select jsonb_array_elements_text(p_deletes->'restrictions'));
  delete from activities where id in (select jsonb_array_elements_text(p_deletes->'activities'));
  delete from wagons where id in (select jsonb_array_elements_text(p_deletes->'wagons'));
  -- A planilha e o cadastro de equipes agora aceitam exclusão. O compromisso sai antes da
  -- equipe, e a equipe depois das atividades, por causa das chaves estrangeiras.
  delete from plan_dependencies where id in (select jsonb_array_elements_text(p_deletes->'plan_dependencies'));
  delete from plan_tasks where id in (select jsonb_array_elements_text(p_deletes->'plan_tasks'));
  delete from medium_term_plans where id in (select jsonb_array_elements_text(p_deletes->'medium_term_plans'));
  delete from weekly_commitments where id in (select jsonb_array_elements_text(p_deletes->'weekly_commitments'));
  delete from teams where id in (select jsonb_array_elements_text(p_deletes->'teams'));
  -- Regras de vínculo não têm filhos, então a ordem aqui é indiferente.
  delete from link_rules where id in (select jsonb_array_elements_text(p_deletes->'link_rules'));

  insert into works (id, created_at, updated_at, name, code, description, active, prevision_project_id)
  select id, created_at, updated_at, name, code, description, active, prevision_project_id
  from jsonb_to_recordset(p_payload->'works') as t(
    id text, created_at timestamptz, updated_at timestamptz, name text, code text,
    description text, active boolean, prevision_project_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, code = excluded.code,
    description = excluded.description, active = excluded.active,
    prevision_project_id = excluded.prevision_project_id;

  insert into locations (id, created_at, updated_at, work_id, name, code, parent_id)
  select id, created_at, updated_at, work_id, name, code, parent_id
  from jsonb_to_recordset(p_payload->'locations') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    code text, parent_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    code = excluded.code, parent_id = excluded.parent_id;

  insert into teams (id, created_at, updated_at, work_id, company, name, weekly_capacity)
  select id, created_at, updated_at, work_id, company, name, weekly_capacity
  from jsonb_to_recordset(p_payload->'teams') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, company text,
    name text, weekly_capacity integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, company = excluded.company,
    name = excluded.name, weekly_capacity = excluded.weekly_capacity;

  insert into baselines (id, created_at, updated_at, work_id, name, created_by, wagons, activities)
  select id, created_at, updated_at, work_id, name, created_by, wagons, activities
  from jsonb_to_recordset(p_payload->'baselines') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    created_by text, wagons jsonb, activities jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    created_by = excluded.created_by, wagons = excluded.wagons, activities = excluded.activities;

  insert into ifc_models (id, created_at, updated_at, work_id, name, discipline)
  select id, created_at, updated_at, work_id, name, discipline
  from jsonb_to_recordset(p_payload->'ifc_models') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    discipline text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    discipline = excluded.discipline;

  insert into ifc_model_versions (id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count)
  select id, created_at, updated_at, model_id, version, file_name, file_size, storage_path, uploaded_by, storeys, element_count
  from jsonb_to_recordset(p_payload->'ifc_model_versions') as t(
    id text, created_at timestamptz, updated_at timestamptz, model_id text, version integer,
    file_name text, file_size bigint, storage_path text, uploaded_by text,
    storeys text[], element_count integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, model_id = excluded.model_id, version = excluded.version,
    file_name = excluded.file_name, file_size = excluded.file_size,
    storage_path = excluded.storage_path, uploaded_by = excluded.uploaded_by,
    storeys = excluded.storeys, element_count = excluded.element_count;

  insert into link_rules (id, created_at, updated_at, work_id, order_index, service_name, criteria)
  select id, created_at, updated_at, work_id, order_index, service_name, criteria
  from jsonb_to_recordset(p_payload->'link_rules') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text,
    order_index integer, service_name text, criteria jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id,
    order_index = excluded.order_index, service_name = excluded.service_name,
    criteria = excluded.criteria;

  insert into production_sequences (id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date)
  select id, created_at, updated_at, work_id, name, default_takt_days, calendar, start_date
  from jsonb_to_recordset(p_payload->'production_sequences') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, name text,
    default_takt_days integer, calendar text, start_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, name = excluded.name,
    default_takt_days = excluded.default_takt_days, calendar = excluded.calendar,
    start_date = excluded.start_date;

  insert into wagons (id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids)
  select id, created_at, updated_at, sequence_id, number, predecessor_id, planned_start, planned_end, takt_days, actual_start, responsible_ids
  from jsonb_to_recordset(p_payload->'wagons') as t(
    id text, created_at timestamptz, updated_at timestamptz, sequence_id text, number integer,
    predecessor_id text, planned_start date, planned_end date, takt_days integer,
    actual_start date, responsible_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, sequence_id = excluded.sequence_id, number = excluded.number,
    predecessor_id = excluded.predecessor_id, planned_start = excluded.planned_start,
    planned_end = excluded.planned_end, takt_days = excluded.takt_days,
    actual_start = excluded.actual_start, responsible_ids = excluded.responsible_ids;

  insert into activities (id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes)
  select id, created_at, updated_at, wagon_id, name, location_id, responsible_id, planned_start, planned_end, progress, status, weight, mandatory, origin, prevision_external_id, team_id, notes
  from jsonb_to_recordset(p_payload->'activities') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, name text,
    location_id text, responsible_id text, planned_start date, planned_end date,
    progress numeric, status text, weight numeric, mandatory boolean, origin text,
    prevision_external_id text, team_id text, notes text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, name = excluded.name,
    location_id = excluded.location_id, responsible_id = excluded.responsible_id,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    progress = excluded.progress, status = excluded.status, weight = excluded.weight,
    mandatory = excluded.mandatory, origin = excluded.origin,
    prevision_external_id = excluded.prevision_external_id, team_id = excluded.team_id,
    notes = excluded.notes;

  insert into activity_dependencies (id, created_at, updated_at, predecessor_id, successor_id)
  select id, created_at, updated_at, predecessor_id, successor_id
  from jsonb_to_recordset(p_payload->'activity_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id;

  insert into medium_term_plans (id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by, schedule_meta)
  select id, created_at, updated_at, work_id, month, name, baseline_of, frozen_at, created_by, schedule_meta
  from jsonb_to_recordset(p_payload->'medium_term_plans') as t(
    id text, created_at timestamptz, updated_at timestamptz, work_id text, month text, name text,
    baseline_of text, frozen_at timestamptz, created_by text, schedule_meta jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, work_id = excluded.work_id, month = excluded.month,
    name = excluded.name, baseline_of = excluded.baseline_of, frozen_at = excluded.frozen_at,
    created_by = excluded.created_by, schedule_meta = excluded.schedule_meta;

  insert into plan_tasks (id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index, level, schedule_meta)
  select id, created_at, updated_at, plan_id, name, planned_start, planned_end, team_id, activity_id, notes, progress, order_index, level, schedule_meta
  from jsonb_to_recordset(p_payload->'plan_tasks') as t(
    id text, created_at timestamptz, updated_at timestamptz, plan_id text, name text,
    planned_start date, planned_end date, team_id text, activity_id text, notes text,
    progress numeric, order_index integer, level integer, schedule_meta jsonb
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, plan_id = excluded.plan_id, name = excluded.name,
    planned_start = excluded.planned_start, planned_end = excluded.planned_end,
    team_id = excluded.team_id, activity_id = excluded.activity_id, notes = excluded.notes,
    progress = excluded.progress, order_index = excluded.order_index, level = excluded.level, schedule_meta = excluded.schedule_meta;

  insert into plan_dependencies (id, created_at, updated_at, predecessor_id, successor_id, link_type, lag_days, lag_business)
  select id, created_at, updated_at, predecessor_id, successor_id, link_type, lag_days, lag_business
  from jsonb_to_recordset(p_payload->'plan_dependencies') as t(
    id text, created_at timestamptz, updated_at timestamptz, predecessor_id text, successor_id text,
    link_type text, lag_days integer, lag_business boolean
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, predecessor_id = excluded.predecessor_id,
    successor_id = excluded.successor_id, link_type = excluded.link_type,
    lag_days = excluded.lag_days, lag_business = excluded.lag_business;

  insert into progress_entries (id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by)
  select id, created_at, updated_at, activity_id, recorded_date, progress, recorded_by
  from jsonb_to_recordset(p_payload->'progress_entries') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text,
    recorded_date date, progress numeric, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    recorded_date = excluded.recorded_date, progress = excluded.progress,
    recorded_by = excluded.recorded_by;

  insert into weekly_commitments (id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, supplier, fulfilled, cause, justification, recorded_at, recorded_by, work_id, name)
  select id, created_at, updated_at, activity_id, week_start, week_end, responsible_id, team_id, start_date, end_date, supplier, fulfilled, cause, justification, recorded_at, recorded_by, work_id, name
  from jsonb_to_recordset(p_payload->'weekly_commitments') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, week_start date,
    week_end date, responsible_id text, team_id text, start_date date, end_date date, work_id text, name text,
    supplier text, fulfilled boolean, cause text, justification text,
    recorded_at timestamptz, recorded_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    week_start = excluded.week_start, week_end = excluded.week_end,
    responsible_id = excluded.responsible_id, team_id = excluded.team_id,
    start_date = excluded.start_date, end_date = excluded.end_date, supplier = excluded.supplier,
    fulfilled = excluded.fulfilled, cause = excluded.cause, justification = excluded.justification,
    recorded_at = excluded.recorded_at, recorded_by = excluded.recorded_by,
    work_id = excluded.work_id, name = excluded.name;

  insert into terminality_criteria (id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by)
  select id, created_at, updated_at, activity_id, description, mandatory, fulfilled, confirmed_at, confirmed_by
  from jsonb_to_recordset(p_payload->'terminality_criteria') as t(
    id text, created_at timestamptz, updated_at timestamptz, activity_id text, description text,
    mandatory boolean, fulfilled boolean, confirmed_at timestamptz, confirmed_by text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, activity_id = excluded.activity_id,
    description = excluded.description, mandatory = excluded.mandatory,
    fulfilled = excluded.fulfilled, confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by;

  insert into pending_items (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_terminality, resolved_at, resolution
  from jsonb_to_recordset(p_payload->'pending_items') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_terminality boolean, resolved_at timestamptz, resolution text
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_terminality = excluded.blocks_terminality, resolved_at = excluded.resolved_at,
    resolution = excluded.resolution;

  insert into restrictions (id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days)
  select id, created_at, updated_at, wagon_id, activity_id, description, responsible_id, due_date, status, blocks_execution, blocks_terminality, resolved_at, resolution, board_status, lead_time_days
  from jsonb_to_recordset(p_payload->'restrictions') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, activity_id text,
    description text, responsible_id text, due_date date, status text,
    blocks_execution boolean, blocks_terminality boolean, resolved_at timestamptz, resolution text,
    board_status text, lead_time_days integer
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, activity_id = excluded.activity_id,
    description = excluded.description, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date, status = excluded.status,
    blocks_execution = excluded.blocks_execution, blocks_terminality = excluded.blocks_terminality,
    resolved_at = excluded.resolved_at, resolution = excluded.resolution,
    board_status = excluded.board_status, lead_time_days = excluded.lead_time_days;

  insert into releases (id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids)
  select id, created_at, updated_at, wagon_id, predecessor_id, type, justification, authorized_by, regularization_responsible_id, due_date, released_at, accepted_pending_ids, acknowledged_debt_ids
  from jsonb_to_recordset(p_payload->'releases') as t(
    id text, created_at timestamptz, updated_at timestamptz, wagon_id text, predecessor_id text,
    type text, justification text, authorized_by text, regularization_responsible_id text,
    due_date date, released_at timestamptz, accepted_pending_ids text[], acknowledged_debt_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, wagon_id = excluded.wagon_id, predecessor_id = excluded.predecessor_id,
    type = excluded.type, justification = excluded.justification, authorized_by = excluded.authorized_by,
    regularization_responsible_id = excluded.regularization_responsible_id, due_date = excluded.due_date,
    released_at = excluded.released_at, accepted_pending_ids = excluded.accepted_pending_ids,
    acknowledged_debt_ids = excluded.acknowledged_debt_ids;

  insert into terminality_debts (id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date)
  select id, created_at, updated_at, pending_item_id, release_id, responsible_id, due_date
  from jsonb_to_recordset(p_payload->'terminality_debts') as t(
    id text, created_at timestamptz, updated_at timestamptz, pending_item_id text,
    release_id text, responsible_id text, due_date date
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, pending_item_id = excluded.pending_item_id,
    release_id = excluded.release_id, responsible_id = excluded.responsible_id,
    due_date = excluded.due_date;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  select id, entity_id, entity_type, action, author_id, occurred_at, changes
  from jsonb_to_recordset(p_payload->'history_events') as t(
    id text, entity_id text, entity_type text, action text, author_id text,
    occurred_at timestamptz, changes jsonb
  )
  on conflict (id) do update set
    entity_id = excluded.entity_id, entity_type = excluded.entity_type, action = excluded.action,
    author_id = excluded.author_id, occurred_at = excluded.occurred_at, changes = excluded.changes;

  insert into profiles (id, created_at, updated_at, name, role, work_ids)
  select id, created_at, updated_at, name, role, work_ids
  from jsonb_to_recordset(p_payload->'profiles') as t(
    id uuid, created_at timestamptz, updated_at timestamptz, name text, role text, work_ids text[]
  )
  on conflict (id) do update set
    updated_at = excluded.updated_at, name = excluded.name, role = excluded.role, work_ids = excluded.work_ids;

  update planning_meta set version = version + 1 where id = 1;
  return v_current + 1;
end;
$$;

revoke all on function commit_planning(bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function commit_planning(bigint,jsonb,jsonb) to service_role;
-- O fluxo comum nunca altera histórico existente; os upserts idênticos seguem válidos.
create function guard_planning_history() returns trigger language plpgsql as $$
begin
  if TG_OP='DELETE' or new is distinct from old then raise exception 'Histórico é imutável'; end if;
  return new;
end $$;
create trigger planning_history_immutable before update or delete on history_events for each row execute function guard_planning_history();
create function guard_plan_baseline() returns trigger language plpgsql as $$
declare frozen boolean;
begin
  if TG_TABLE_NAME='medium_term_plans' then frozen:=old.frozen_at is not null;
  elsif TG_TABLE_NAME='plan_tasks' then select frozen_at is not null into frozen from medium_term_plans where id=old.plan_id;
  else select p.frozen_at is not null into frozen from medium_term_plans p join plan_tasks t on t.plan_id=p.id where t.id=old.successor_id;
  end if;
  if frozen and (TG_OP='DELETE' or new is distinct from old) then raise exception 'Linha de base é imutável'; end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create trigger plan_baseline_immutable before update or delete on medium_term_plans for each row execute function guard_plan_baseline();
create trigger task_baseline_immutable before update or delete on plan_tasks for each row execute function guard_plan_baseline();
create trigger link_baseline_immutable before update or delete on plan_dependencies for each row execute function guard_plan_baseline();

-- ===== 0024_long_term_plans.sql =====

-- Planejamento de longo prazo preenchido no sistema (fluxograma → Linha de Balanço).
-- Um documento por obra, fora do snapshot de planejamento: não passa por `commit_planning`, e por
-- isso subir o código antes desta migração só deixa o planejador sem salvar — as outras telas seguem.
-- `revision` é a trava otimista: a API grava só se a revisão enviada for a que está no banco.
-- `if not exists` porque as migrações são rodadas à mão, uma a uma, no painel.
create table if not exists long_term_plans (
  work_id text primary key references works(id),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  revision integer not null check (revision >= 1),
  updated_at timestamptz not null default now(),
  updated_by text not null
);
-- Mesmo contrato das tabelas IFC: acesso só pela API, autorizada por obra no servidor.
alter table long_term_plans enable row level security;

-- ===== 0025_work_settings.sql =====

-- Configurações por obra que não pertencem ao snapshot de planejamento. Começa com a semana 1 da
-- numeração do curto prazo. Fica fora do snapshot como ifc_federations: não reescreve
-- commit_planning, e a ausência da tabela só faz a planilha voltar à numeração automática.
-- `if not exists` porque as migrações são rodadas à mão no painel e podem ser repetidas por engano.
create table if not exists work_settings (
  work_id text primary key references works(id),
  week_one_start date check (week_one_start is null or extract(isodow from week_one_start) = 1),
  updated_at timestamptz not null default now(),
  updated_by text not null
);
-- Mesmo contrato das demais tabelas fora do snapshot: acesso só pelo servidor, autorizado por obra.
alter table work_settings enable row level security;

-- ===== 0026_long_term_wagons.sql =====

-- Plano de longo prazo responsável pelas atividades dos vagões (25/09/2026).
-- Separada da 0024 porque aquela já tinha sido aplicada no Supabase quando isto foi decidido.
-- Pode ser rodada de novo: `if not exists` e `drop constraint if exists`.
-- Guarda de qual revisão e para qual sequência os vagões foram gerados por último, para a tela
-- dizer quando o plano mudou depois.
alter table long_term_plans add column if not exists synced_revision integer;
alter table long_term_plans add column if not exists synced_sequence_id text references production_sequences(id) on delete set null;
alter table long_term_plans add column if not exists synced_at timestamptz;
alter table long_term_plans add column if not exists synced_by text;

-- Atividade gerada pelo plano tem origem própria. `commit_planning` já grava `origin` como texto,
-- então basta alargar a checagem — nenhuma função é reescrita. Sem este trecho, gerar vagões
-- falha na gravação (violação da checagem) e nada é alterado.
alter table activities drop constraint if exists activities_origin_check;
alter table activities add constraint activities_origin_check check (origin in ('manual', 'mock', 'prevision', 'long_term'));

-- ===== 0027_planning_snapshot.sql =====

-- Leitura do planejamento numa ida só ao banco, recortada pelas obras do usuário.
--
-- Antes, cada requisição lia as 23 tabelas inteiras, página a página, e filtrava em memória. Com
-- esta função a API pede só as obras a que a pessoa tem acesso e recebe um JSON único. `works` e
-- `profiles` vêm sempre inteiros: o cadastro de obra confere unicidade de código entre todas, e a
-- administração de acessos precisa de todos os perfis. `history_events` não entra: o histórico é
-- lido pela rota própria, por entidade.
--
-- Reexecutável (`create or replace`). Não reescreve `commit_planning`. Sem ela o sistema continua
-- funcionando pela leitura por tabela; com ela, cada tela carrega menos e mais rápido.
create or replace function planning_snapshot(p_work_ids text[])
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'version', (select version from planning_meta where id = 1),
    'works', (select coalesce(jsonb_agg(to_jsonb(w) order by w.id), '[]'::jsonb) from works w),
    'profiles', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from profiles p),
    'locations', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb) from locations l where l.work_id = any(p_work_ids)),
    'production_sequences', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from production_sequences s where s.work_id = any(p_work_ids)),
    'wagons', (select coalesce(jsonb_agg(to_jsonb(w) order by w.id), '[]'::jsonb)
      from wagons w join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'activities', (select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb)
      from activities a join wagons w on w.id = a.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'terminality_criteria', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
      from terminality_criteria c join activities a on a.id = c.activity_id join wagons w on w.id = a.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'pending_items', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
      from pending_items p join wagons w on w.id = p.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'restrictions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
      from restrictions r join wagons w on w.id = r.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'releases', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
      from releases r join wagons w on w.id = r.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'terminality_debts', (select coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)
      from terminality_debts d join pending_items p on p.id = d.pending_item_id join wagons w on w.id = p.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'teams', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from teams t where t.work_id = any(p_work_ids)),
    'progress_entries', (select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb)
      from progress_entries e join activities a on a.id = e.activity_id join wagons w on w.id = a.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'weekly_commitments', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb) from weekly_commitments c where c.work_id = any(p_work_ids)),
    'baselines', (select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb) from baselines b where b.work_id = any(p_work_ids)),
    'activity_dependencies', (select coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)
      from activity_dependencies d join activities a on a.id = d.successor_id join wagons w on w.id = a.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'medium_term_plans', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from medium_term_plans p where p.work_id = any(p_work_ids)),
    'plan_tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)
      from plan_tasks t join medium_term_plans p on p.id = t.plan_id where p.work_id = any(p_work_ids)),
    'plan_dependencies', (select coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)
      from plan_dependencies d join plan_tasks t on t.id = d.successor_id join medium_term_plans p on p.id = t.plan_id where p.work_id = any(p_work_ids)),
    'ifc_models', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb) from ifc_models m where m.work_id = any(p_work_ids)),
    'ifc_model_versions', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb)
      from ifc_model_versions v join ifc_models m on m.id = v.model_id where m.work_id = any(p_work_ids)),
    'link_rules', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from link_rules r where r.work_id = any(p_work_ids))
  );
$$;

revoke all on function planning_snapshot(text[]) from public, anon, authenticated;
grant execute on function planning_snapshot(text[]) to service_role;

-- ===== Ajustes do bootstrap (gerados por scripts/build-bootstrap-sql.mjs; não são migração) =====

-- 1) Remove a sobrecarga antiga commit_planning(bigint, jsonb), criada pela 0001 e reescrita pela 0002.
--    A partir da 0005 a função passou a ter três parâmetros (p_deletes), e "create or replace" com
--    outra assinatura cria uma função NOVA em vez de substituir: a de dois parâmetros ficava para trás,
--    com o corpo da 0002 (que grava profiles) e SECURITY DEFINER. A 0001 só tirou o EXECUTE de PUBLIC;
--    no Supabase os privilégios padrão do schema public dão EXECUTE direto a anon e authenticated, e a
--    0023 só revogou isso da versão de três parâmetros. Resultado: qualquer um com a chave anônima
--    poderia chamar a versão antiga pela API. A aplicação sempre chama a de três parâmetros.
drop function if exists public.commit_planning(bigint, jsonb);

-- 2) Garante à service_role o acesso às tabelas que o servidor lê e grava pela API (PostgREST).
--    No Supabase isso já vem dos privilégios padrão do schema public; fica explícito para o banco
--    novo não depender dessa configuração do projeto. anon e authenticated continuam barrados pela
--    RLS ligada sem nenhuma política em todas as tabelas.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;

-- 3) Pede ao PostgREST que releia o esquema já, para a API enxergar tabelas e funções novas.
notify pgrst, 'reload schema';

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

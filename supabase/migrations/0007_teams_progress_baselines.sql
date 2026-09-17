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

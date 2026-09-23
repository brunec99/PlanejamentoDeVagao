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

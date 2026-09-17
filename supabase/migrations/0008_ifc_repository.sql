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

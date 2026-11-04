-- Aba 1, Linha de Balanço no estilo Prevision (04/11/2026, modelo aprovado): uma atividade por
-- serviço × local, dependências, linhas de base, lançamentos de fluxo e medições com fotos. Fica
-- FORA do snapshot e do commit_planning, como long_term_plans e a Terminalidade: os blocos e as
-- fotos crescem com a obra, e a ausência destas tabelas derruba só as visões novas da aba 1.
-- Não reescreve commit_planning e pode ser rodada de novo.
--
-- Exclusão de obra: toda tabela da obra aqui tem `on delete cascade` a partir de works, então o
-- delete_work da 0037 (que apaga a obra no fim) leva os blocos, as medições e as fotos junto, sem
-- reescrever aquela função. Os arquivos do bucket `medicoes` saem pela rota de exclusão, como os da
-- terminalidade. Os fluxos de serviços são da empresa e ficam.

-- Fluxos de serviços: o "macrofluxo" do Prevision. São da EMPRESA (sem obra): criados uma vez e
-- lançados em qualquer obra. O documento jsonb guarda os serviços (nome, cor, duração em dias
-- úteis, equipe, unidade, predecessoras com espera); `revision` é a trava contra sobrescrita.
create table if not exists service_flows (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  direction text not null default 'bottom_up' check (direction in ('bottom_up', 'top_down')),
  document jsonb not null default '{"services": []}'::jsonb,
  revision integer not null default 1,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_by text not null,
  updated_at timestamptz not null default now()
);

-- Locais da obra na Linha de Balanço, de baixo para cima (order_index).
create table if not exists lob_locals (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, name)
);

-- Serviços (pacotes de trabalho) da obra: a cor é a identidade dos blocos.
create table if not exists lob_services (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  color text not null,
  team text,
  unit text,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, name)
);

-- Lançamentos de fluxo: de onde vieram os blocos e com que parâmetros (locais, início, sentido, ritmo).
create table if not exists lob_launches (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  flow_id text references service_flows(id) on delete set null,
  flow_name text not null,
  params jsonb not null default '{}'::jsonb,
  activity_count integer not null default 0,
  launched_by text not null,
  launched_at timestamptz not null default now()
);

-- Um bloco: o serviço num local, com início (dia útil) e duração em dias úteis. Datas reais são
-- preenchidas pela medição e corrigíveis à mão.
create table if not exists lob_activities (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  service_id text not null references lob_services(id),
  local_id text not null references lob_locals(id),
  start_on date not null,
  duration_days integer not null check (duration_days >= 1),
  actual_start date,
  actual_finish date,
  notes text,
  launch_id text references lob_launches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, service_id, local_id)
);
create index if not exists lob_activities_work_idx on lob_activities (work_id);

-- Dependência término → início com espera em dias úteis; `crew` = "equipe segue" (mesmo serviço no
-- local seguinte, criada pelo ritmo do lançamento). Apagar um bloco apaga as suas dependências.
create table if not exists lob_dependencies (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  predecessor_id text not null references lob_activities(id) on delete cascade,
  successor_id text not null references lob_activities(id) on delete cascade,
  lag_days integer not null default 0,
  kind text not null default 'fs' check (kind in ('fs', 'crew')),
  created_at timestamptz not null default now(),
  unique (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);
create index if not exists lob_dependencies_work_idx on lob_dependencies (work_id);

-- Linhas de base: foto das datas de todos os blocos. `automatic` = gravada antes de um lançamento.
create table if not exists lob_baselines (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  automatic boolean not null default false,
  snapshot jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists lob_baselines_work_idx on lob_baselines (work_id);

-- Medições: rodadas numeradas com data; `open` é o rascunho (só um por obra), `closed` a salva.
create table if not exists lob_measurements (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  number integer not null,
  measured_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text,
  unique (work_id, number),
  check ((status = 'closed') = (closed_at is not null))
);
create unique index if not exists lob_measurements_open_idx on lob_measurements (work_id) where status = 'open';

-- O acumulado realizado (%) de um bloco numa rodada; `previous_value` é o que valia antes dela.
create table if not exists lob_measurement_items (
  id text primary key,
  measurement_id text not null references lob_measurements(id) on delete cascade,
  work_id text not null references works(id) on delete cascade,
  activity_id text not null references lob_activities(id),
  value numeric(5,1) not null check (value >= 0 and value <= 100),
  previous_value numeric(5,1) not null default 0,
  note text,
  delay_cause text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (measurement_id, activity_id)
);
create index if not exists lob_measurement_items_work_idx on lob_measurement_items (work_id);

-- Fotos no bucket privado `medicoes`: `<obra>/<lançamento>/<foto>.jpg` e `<foto>-thumb.jpg`.
create table if not exists lob_photos (
  id text primary key,
  item_id text not null references lob_measurement_items(id) on delete cascade,
  measurement_id text not null references lob_measurements(id) on delete cascade,
  work_id text not null references works(id) on delete cascade,
  activity_id text not null references lob_activities(id),
  storage_path text not null,
  thumb_path text not null,
  width integer,
  height integer,
  bytes integer,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists lob_photos_item_idx on lob_photos (item_id);
create index if not exists lob_photos_work_idx on lob_photos (work_id);

-- Mesmo contrato das demais tabelas: RLS ligada sem política e acesso só pelo servidor. O grant é
-- explícito porque no projeto takt-hub a exposição automática de tabelas novas está desligada.
alter table service_flows enable row level security;
alter table lob_locals enable row level security;
alter table lob_services enable row level security;
alter table lob_launches enable row level security;
alter table lob_activities enable row level security;
alter table lob_dependencies enable row level security;
alter table lob_baselines enable row level security;
alter table lob_measurements enable row level security;
alter table lob_measurement_items enable row level security;
alter table lob_photos enable row level security;
grant select, insert, update, delete on
  service_flows, lob_locals, lob_services, lob_launches, lob_activities, lob_dependencies, lob_baselines,
  lob_measurements, lob_measurement_items, lob_photos
to service_role;

-- Bucket privado das fotos de medição, com os mesmos limites da terminalidade (JPEG até 2 MB).
insert into storage.buckets (id, name, public) values ('medicoes', 'medicoes', false) on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'] where id = 'medicoes'$q$;
  end if;
end $$;

notify pgrst, 'reload schema';

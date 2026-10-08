-- Aba 5, Terminalidade (08/10/2026): lista de pendências por pavimento, apartamento e empreiteiro,
-- com fotos do problema e da correção, no formato da planilha "Lista de pendências" usada hoje.
-- Fica FORA do snapshot e do commit_planning, como long_term_plans e work_settings: as pendências e
-- as fotos crescem com a obra, e cada gravação do planejamento envia o snapshot inteiro. A ausência
-- destas tabelas derruba só a aba 5. Não reescreve commit_planning e pode ser rodada de novo.

-- Cadastro de locais da obra: pavimentos e, dentro deles, unidades (apartamentos ou áreas comuns).
create table if not exists terminality_floors (
  id text primary key,
  work_id text not null references works(id),
  name text not null check (length(trim(name)) > 0),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, name)
);
create table if not exists terminality_units (
  id text primary key,
  work_id text not null references works(id),
  floor_id text not null references terminality_floors(id),
  name text not null check (length(trim(name)) > 0),
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_id, name)
);

-- Listas da obra: os tipos de pendência (A/C, RI, PINTURA…) e os nomes do "Responsável ATR", que
-- podem ser de quem não usa o sistema. Desativar tira da lista sem apagar o histórico.
create table if not exists terminality_types (
  id text primary key,
  work_id text not null references works(id),
  name text not null check (length(trim(name)) > 0),
  order_index integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, name)
);
create table if not exists terminality_people (
  id text primary key,
  work_id text not null references works(id),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, name)
);

-- A pendência. `contractor` é o nome da empresa do cadastro de equipes (teams.company), guardado como
-- texto porque empresa não é entidade própria. Resolver exige a data da correção (e, na aplicação,
-- ao menos uma foto da correção); a restrição abaixo mantém status e data coerentes.
create table if not exists terminality_items (
  id text primary key,
  work_id text not null references works(id),
  floor_id text not null references terminality_floors(id),
  unit_id text references terminality_units(id),
  description text not null check (length(trim(description)) > 0),
  type_id text references terminality_types(id),
  observed_on date not null,
  atr_person_id text references terminality_people(id),
  contractor text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  corrected_on date,
  resolved_at timestamptz,
  resolved_by text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (corrected_on is not null))
);
create index if not exists terminality_items_work_idx on terminality_items (work_id);

-- Fotos no bucket privado `terminalidade`: a imagem comprimida no navegador e uma miniatura, ambas
-- JPEG, em `<obra>/<pendência>/<foto>.jpg` e `<foto>-thumb.jpg`. `issue` = o problema; `correction` =
-- o serviço corrigido. Apagar a pendência apaga as linhas (os arquivos, a aplicação remove).
create table if not exists terminality_photos (
  id text primary key,
  item_id text not null references terminality_items(id) on delete cascade,
  work_id text not null references works(id),
  kind text not null check (kind in ('issue', 'correction')),
  storage_path text not null,
  thumb_path text not null,
  width integer,
  height integer,
  bytes integer,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists terminality_photos_item_idx on terminality_photos (item_id);

-- Mesmo contrato das demais tabelas: RLS ligada sem política (navegador não lê nada) e acesso só pelo
-- servidor. O grant é explícito porque no projeto takt-hub a exposição automática de tabelas novas
-- está desligada.
alter table terminality_floors enable row level security;
alter table terminality_units enable row level security;
alter table terminality_types enable row level security;
alter table terminality_people enable row level security;
alter table terminality_items enable row level security;
alter table terminality_photos enable row level security;
grant select, insert, update, delete on
  terminality_floors, terminality_units, terminality_types, terminality_people, terminality_items, terminality_photos
to service_role;

-- Bucket privado. O navegador comprime para JPEG de ~300 KB; o próprio Storage recusa o que passar de
-- 2 MB ou não for JPEG, porque a URL assinada de envio aceitaria qualquer arquivo. O bloco só age onde
-- as colunas de limite existem (o Supabase real), para a validação local em PGlite seguir rodando.
insert into storage.buckets (id, name, public) values ('terminalidade', 'terminalidade', false) on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'] where id = 'terminalidade'$q$;
  end if;
end $$;

notify pgrst, 'reload schema';

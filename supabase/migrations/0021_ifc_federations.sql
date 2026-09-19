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

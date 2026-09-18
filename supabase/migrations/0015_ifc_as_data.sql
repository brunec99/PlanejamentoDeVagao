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

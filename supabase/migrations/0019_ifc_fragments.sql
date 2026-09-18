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

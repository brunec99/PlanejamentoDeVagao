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


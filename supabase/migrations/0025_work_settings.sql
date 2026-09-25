-- Configurações por obra que não pertencem ao snapshot de planejamento. Começa com a semana 1 da
-- numeração do curto prazo. Fica fora do snapshot como ifc_federations: não reescreve
-- commit_planning, e a ausência da tabela só faz a planilha voltar à numeração automática.
-- `if not exists` porque as migrações são rodadas à mão no painel e podem ser repetidas por engano.
create table if not exists work_settings (
  work_id text primary key references works(id),
  week_one_start date check (week_one_start is null or extract(isodow from week_one_start) = 1),
  updated_at timestamptz not null default now(),
  updated_by text not null
);
-- Mesmo contrato das demais tabelas fora do snapshot: acesso só pelo servidor, autorizado por obra.
alter table work_settings enable row level security;

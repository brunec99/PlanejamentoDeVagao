-- Aba 1, apropriação de custos da Linha de Balanço (11/11/2026, IDP ponderado por custo, modelo
-- aprovado): cada linha do orçamento da obra vira um item de custo ligado (ou não) a um pacote de
-- serviço (`lob_services`). O custo do pacote é a soma dos itens dele; item sem pacote fica "não
-- apropriado" e não entra no peso. Fica FORA do snapshot e do commit_planning, como as tabelas da
-- 0038: a ausência desta tabela derruba só a apropriação (a Linha de Balanço segue, pesada pela
-- duração). Não reescreve commit_planning e pode ser rodada de novo.
--
-- Exclusão de obra: `on delete cascade` a partir de works, então o delete_work da 0037 (que apaga a
-- obra no fim) leva os itens junto, sem reescrever aquela função. Excluir um pacote deixa os itens
-- dele "não apropriados" (`on delete set null`), em vez de apagar linhas do orçamento.
create table if not exists lob_cost_items (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  service_id text references lob_services(id) on delete set null,
  code text,
  description text not null check (length(trim(description)) > 0),
  -- Em reais, duas casas; o teto da aplicação (um trilhão) cabe com folga.
  amount numeric(16,2) not null check (amount >= 0),
  order_index integer not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lob_cost_items_work_idx on lob_cost_items (work_id);
create index if not exists lob_cost_items_service_idx on lob_cost_items (service_id);

-- Mesmo contrato das demais tabelas: RLS ligada sem política e acesso só pelo servidor. O grant é
-- explícito porque no projeto takt-hub a exposição automática de tabelas novas está desligada.
alter table lob_cost_items enable row level security;
grant select, insert, update, delete on lob_cost_items to service_role;

notify pgrst, 'reload schema';

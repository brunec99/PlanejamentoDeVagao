-- Aba 7, Histograma de mão de obra (11/11/2026): o efetivo diário da obra, no formato da planilha
-- "ATR Histograma - Todas as obras" usada até então — Obra, Data, Empresa, Função, Número de funcionários
-- e Observação —, uma linha por empresa × função × dia. Fica FORA do snapshot e do commit_planning, como a
-- terminalidade (0028) e a segurança (0040): a ausência desta tabela derruba só a aba 7. Não reescreve
-- commit_planning e pode ser rodada de novo.

-- `company` e `role` são texto livre, já na grafia que a aplicação escolheu (a tela sugere as já usadas e
-- o comando devolve a grafia existente para "ATR " = "ATR"). A unicidade impede a linha em dobro que a
-- planilha deixava passar: o mesmo dia, empresa e função só existe uma vez por obra, e lançar de novo
-- edita a quantidade. `origin` separa o que foi lançado no sistema do histórico importado da planilha.
-- Excluir a obra leva o efetivo junto (delete_work apaga a linha de works).
create table if not exists headcount_entries (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  worked_on date not null,
  company text not null check (length(trim(company)) > 0),
  role text not null check (length(trim(role)) > 0),
  quantity integer not null check (quantity > 0 and quantity <= 500),
  note text not null default '',
  origin text not null default 'app' check (origin in ('app', 'planilha')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, worked_on, company, role)
);
create index if not exists headcount_entries_work_day_idx on headcount_entries (work_id, worked_on);

-- Mesmo contrato das demais tabelas: RLS ligada sem política e acesso só pelo servidor. Grant explícito,
-- porque no takt-hub a exposição automática de tabelas novas está desligada.
alter table headcount_entries enable row level security;
grant select, insert, update, delete on headcount_entries to service_role;

notify pgrst, 'reload schema';

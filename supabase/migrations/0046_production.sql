-- Aba 8, Controle de produtividade (11/11/2026): o lançamento diário de serviço × empreiteiro × equipe ×
-- produção, no formato da planilha "ATR - Controle da produção" usada até então — Obra, Serviço,
-- Empreiteiro, Data, Qtd profissionais, Qtd ajudantes, Produção, Unid. e Obs. Fica FORA do snapshot e do
-- commit_planning, como a terminalidade (0028), a segurança (0040) e o histograma (0045): a ausência desta
-- tabela derruba só a aba 8. Não reescreve commit_planning e pode ser rodada de novo.

-- `service` e `contractor` são texto livre, já na grafia que a aplicação escolheu. `quantity` nula quer
-- dizer "equipe lançada, produção ainda não medida" — na planilha isso aparecia como vazio ou "0,00", e é
-- mais da metade das linhas. Não há unicidade: o mesmo serviço e empreiteiro pode ter duas frentes no dia
-- (trechos diferentes na observação). `origin` separa o lançado no sistema do histórico da planilha.
-- Excluir a obra leva os lançamentos junto (delete_work apaga a linha de works).
create table if not exists production_entries (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  worked_on date not null,
  service text not null check (length(trim(service)) > 0),
  contractor text not null check (length(trim(contractor)) > 0),
  professionals integer not null default 0 check (professionals >= 0 and professionals <= 200),
  helpers integer not null default 0 check (helpers >= 0 and helpers <= 200),
  quantity numeric(14, 3) check (quantity is null or quantity > 0),
  unit text not null default '' check (unit in ('', 'm²', 'm³', 'm', 'kg', 'un', 'vb', 't')),
  note text not null default '',
  origin text not null default 'app' check (origin in ('app', 'planilha')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (professionals + helpers > 0),
  check (quantity is null or unit <> '')
);
create index if not exists production_entries_work_day_idx on production_entries (work_id, worked_on);

-- Mesmo contrato das demais tabelas: RLS ligada sem política e acesso só pelo servidor. Grant explícito,
-- porque no takt-hub a exposição automática de tabelas novas está desligada.
alter table production_entries enable row level security;
grant select, insert, update, delete on production_entries to service_role;

notify pgrst, 'reload schema';

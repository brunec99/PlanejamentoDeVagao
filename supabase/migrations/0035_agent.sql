-- Agente de IA (27/10/2026): três tabelas fora do snapshot e do commit_planning, lidas e gravadas só pelo
-- servidor com a chave de serviço. Subir o código antes desta migração não quebra nada: a rota do agente
-- responde o dossiê determinístico com `migrationMissing: true`, e só a chamada ao modelo fica à espera.
--
-- agent_insights: a última leitura gerada pelo modelo para cada obra. `briefing_hash` é o hash do dossiê
-- que a produziu; se o dossiê não mudou, a leitura guardada é devolvida sem nova chamada (sem custo).
-- agent_usage: livro-razão de cada chamada ao modelo (tokens e custo em dólares, somados a partir do
-- `usage` que a API devolve), por obra, pessoa e mês no fuso de São Paulo. É por ele que o teto mensal
-- (AGENT_MONTHLY_BUDGET_USD), a parte de cada obra e o limite por pessoa são conferidos antes de chamar.
-- agent_user_settings: limite mensal individual (nulo = só os tetos gerais valem) e corte de acesso,
-- definidos pelo admin em Configurações.
--
-- Ids de perfil são uuid do Auth, mas ficam como text, igual a `updated_by` da 0024.
-- `if not exists` porque as migrações são rodadas à mão, uma a uma, no painel.

create table if not exists agent_insights (
  work_id text primary key references works(id),
  briefing_hash text not null,
  markdown text not null,
  model text not null,
  generated_at timestamptz not null default now(),
  generated_by text not null,
  cost_usd numeric(10, 6) not null default 0
);
alter table agent_insights enable row level security;
revoke all on agent_insights from anon, authenticated;
-- No projeto takt-hub a exposição automática de tabelas novas está desligada (ver 0033): sem o grant
-- explícito, a chave de serviço não lê nem grava.
grant select, insert, update, delete on agent_insights to service_role;

create table if not exists agent_usage (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references works(id),
  actor_id text not null,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  kind text not null check (kind in ('leitura', 'pergunta')),
  model text not null,
  calls integer not null default 1 check (calls >= 1),
  input_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists agent_usage_month_work on agent_usage (month, work_id);
create index if not exists agent_usage_month_actor on agent_usage (month, actor_id);
alter table agent_usage enable row level security;
revoke all on agent_usage from anon, authenticated;
grant select, insert, update, delete on agent_usage to service_role;

create table if not exists agent_user_settings (
  user_id text primary key,
  monthly_limit_usd numeric(10, 2) check (monthly_limit_usd is null or monthly_limit_usd >= 0),
  blocked boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text not null
);
alter table agent_user_settings enable row level security;
revoke all on agent_user_settings from anon, authenticated;
grant select, insert, update, delete on agent_user_settings to service_role;

notify pgrst, 'reload schema';

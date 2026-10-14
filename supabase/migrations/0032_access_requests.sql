-- Pedidos de acesso (14/10/2026): quem tenta entrar sem cadastro no Obra 360 pode pedir acesso pela tela
-- de login, e o admin vê os pedidos em Configurações para cadastrar ou dispensar. Fica fora do snapshot e
-- do commit_planning (não reescreve a função): é lido e gravado só pelo servidor, com a chave de serviço.
-- `verified` diz se o e-mail veio confirmado pelo Google (a pessoa passou pelo login e só não tinha
-- perfil) ou se foi digitado (o Google recusou antes, por não haver conta no Auth compartilhado).
create table if not exists access_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null unique check (email = lower(email)),
  name text not null check (length(name) between 1 and 120),
  message text check (message is null or length(message) <= 500),
  verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  handled_by uuid,
  handled_at timestamptz
);
create index if not exists access_requests_pending on access_requests (status, updated_at desc);

-- Sem política: só a chave de serviço (rotas do servidor) lê e grava.
alter table access_requests enable row level security;
revoke all on access_requests from anon, authenticated;

notify pgrst, 'reload schema';

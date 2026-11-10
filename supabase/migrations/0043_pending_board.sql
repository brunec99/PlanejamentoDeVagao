-- Aba 2, Lista de pendência (10/11/2026): quadro Kanban de cinco colunas (A fazer, Fazendo, Pausado,
-- Concluído, Cancelado) com conversa, menções por e-mail e checklists. O card nasce de três formas: à mão
-- na aba 2, de uma tarefa do médio prazo (plan_tasks) ou de um serviço da Linha de Balanço (lob_services).
-- Nos dois últimos a entrega é a véspera útil do início e acompanha a origem; o banco guarda a última
-- data conhecida em `due_date` e a aplicação recalcula ao ler.
--
-- Fica FORA do snapshot e do commit_planning, como a terminalidade (0028) e a segurança (0040): a ausência
-- destas tabelas derruba só a lista de pendência. Não reescreve commit_planning e pode ser rodada de novo.

-- `source_id` não tem chave estrangeira de propósito: a tarefa do plano muda de id a cada mês (a cópia
-- aponta para a anterior em schedule_meta->>'sourceTaskId') e pode ser apagada sem levar o card junto.
create table if not exists pending_cards (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  status text not null default 'todo' check (status in ('todo', 'doing', 'paused', 'done', 'cancelled')),
  status_reason text,
  origin text not null default 'manual' check (origin in ('manual', 'medio_prazo', 'longo_prazo', 'restricao')),
  source_id text,
  source_label text,
  due_date date not null,
  lead_time_days integer not null default 0 check (lead_time_days >= 0),
  responsible_id text not null,
  order_index integer not null default 0,
  closed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((origin in ('medio_prazo', 'longo_prazo')) = (source_id is not null) or origin = 'restricao')
);
create index if not exists pending_cards_work_idx on pending_cards (work_id);

create table if not exists pending_checklists (
  id text primary key,
  card_id text not null references pending_cards(id) on delete cascade,
  work_id text not null references works(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists pending_checklists_work_idx on pending_checklists (work_id);

create table if not exists pending_checklist_items (
  id text primary key,
  checklist_id text not null references pending_checklists(id) on delete cascade,
  card_id text not null references pending_cards(id) on delete cascade,
  work_id text not null references works(id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  done boolean not null default false,
  done_by text,
  done_at timestamptz,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists pending_checklist_items_work_idx on pending_checklist_items (work_id);

-- Conversa do card. `system` é a linha de histórico (mudança de coluna, data ou responsável), com o texto
-- pronto. `mentions` guarda os ids dos perfis marcados com @.
create table if not exists pending_messages (
  id text primary key,
  card_id text not null references pending_cards(id) on delete cascade,
  work_id text not null references works(id) on delete cascade,
  kind text not null default 'message' check (kind in ('message', 'system')),
  author_id text not null,
  body text not null check (length(trim(body)) > 0),
  mentions text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists pending_messages_work_idx on pending_messages (work_id);

-- Mesmo contrato das demais tabelas: RLS ligada sem política e acesso só pelo servidor. Grant explícito,
-- porque no takt-hub a exposição automática de tabelas novas está desligada.
alter table pending_cards enable row level security;
alter table pending_checklists enable row level security;
alter table pending_checklist_items enable row level security;
alter table pending_messages enable row level security;
grant select, insert, update, delete on pending_cards, pending_checklists, pending_checklist_items, pending_messages to service_role;

-- As restrições do antigo "Módulo de restrições" do longo prazo viram cards (decisão do usuário em
-- 10/11/2026: "tire do longo prazo e coloque ali"). É uma CÓPIA: as linhas de `restrictions` ficam como
-- estão, porque o vagão continua lendo as suas restrições impeditivas no detalhe dele. Id fixo por
-- restrição: rodar de novo não duplica nem desfaz o que já foi movido no quadro. O lead time antigo era
-- em dias corridos e passa a ser lido em dias úteis, com o mesmo número.
insert into pending_cards
  (id, work_id, title, status, origin, due_date, lead_time_days, responsible_id, order_index, closed_at, created_by, created_at, updated_at)
select
  'restricao-' || r.id,
  s.work_id,
  left(r.description, 160),
  case when r.status = 'resolved' then 'done' when r.board_status = 'em_tratativa' then 'doing' else 'todo' end,
  'restricao',
  r.due_date,
  coalesce(r.lead_time_days, 0),
  r.responsible_id,
  (row_number() over (partition by s.work_id order by r.due_date, r.created_at))::integer,
  case when r.status = 'resolved' then coalesce(r.resolved_at, r.updated_at) end,
  r.responsible_id,
  r.created_at,
  r.updated_at
from restrictions r
join wagons w on w.id = r.wagon_id
join production_sequences s on s.id = w.sequence_id
on conflict (id) do nothing;

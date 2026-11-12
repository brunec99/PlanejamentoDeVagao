-- Aba 9, Checklist de equipamentos (11/11/2026): a inspeção diária, semanal e mensal dos equipamentos da
-- obra, no grupo SST. Fica FORA do snapshot e do commit_planning, como a segurança (0040): a ausência
-- destas tabelas derruba só a aba 9. Não reescreve commit_planning e pode ser rodada de novo.
-- Quem grava é o tipo TST (`profiles.tst`, migração 0040) e os administradores; a aplicação confere.

-- O modelo (a ficha): lista única para todas as obras, como os tipos de apontamento da segurança — a
-- equipe de TSTs é a mesma. `equipment_type` liga o modelo aos equipamentos das obras (comparação sem
-- acento e sem maiúsculas, feita na aplicação). `items` é a lista ordenada [{ id, text }]. Desativar tira
-- o modelo do quadro sem apagar o histórico.
create table if not exists checklist_models (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  equipment_type text not null check (length(trim(equipment_type)) > 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- O equipamento da obra ("Betoneira 01"). Excluir a obra leva os equipamentos e as inspeções junto.
create table if not exists checklist_equipment (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  equipment_type text not null check (length(trim(equipment_type)) > 0),
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checklist_equipment_work_idx on checklist_equipment (work_id);

-- A inspeção: um modelo preenchido num equipamento num dia. `answers` é [{ itemId, text, answer, note }],
-- com o texto do item como estava no dia; `model_name` e `frequency` também são do dia. Um modelo só é
-- preenchido uma vez por equipamento por dia (preencher de novo edita).
create table if not exists checklist_runs (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  equipment_id text not null references checklist_equipment(id) on delete cascade,
  model_id text not null references checklist_models(id),
  model_name text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  done_on date not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'array'),
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (equipment_id, model_id, done_on)
);
create index if not exists checklist_runs_work_day_idx on checklist_runs (work_id, done_on);

-- Mesmo contrato das demais tabelas: RLS ligada sem política e acesso só pelo servidor. Grant explícito,
-- porque no takt-hub a exposição automática de tabelas novas está desligada.
alter table checklist_models enable row level security;
alter table checklist_equipment enable row level security;
alter table checklist_runs enable row level security;
grant select, insert, update, delete on checklist_models, checklist_equipment, checklist_runs to service_role;

notify pgrst, 'reload schema';

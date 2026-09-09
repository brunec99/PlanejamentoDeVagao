-- Cache local do cronograma do Prevision, por obra. Guarda o que a API devolve
-- (inclusive as datas de linha de base, que o domínio de planejamento não usa),
-- para a tela de atividades não precisar consultar o Prevision a cada abertura.
-- A atualização é sempre explícita, disparada pelo usuário.
create table prevision_activities (
  work_id text not null references works(id) on delete cascade,
  external_id text not null,
  name text not null,
  location text not null,
  planned_start date not null,
  planned_end date not null,
  baseline_start date,
  baseline_end date,
  progress numeric not null default 0,
  synced_at timestamptz not null default now(),
  primary key (work_id, external_id)
);

create index prevision_activities_work_idx on prevision_activities (work_id, planned_start);

alter table prevision_activities enable row level security;

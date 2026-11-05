-- Aba 6, Segurança do trabalho (05/11/2026): vistoria dos técnicos de segurança (TST), com as colunas da
-- planilha "SST - Controle geral" — tipo de apontamento, risco (consequência e probabilidade), descrição,
-- local, data do apontamento, foto, data de correção e foto da correção. Mesmo processo da terminalidade:
-- só finaliza com a data e (na aplicação) a foto da correção. Só quem está marcado como TST grava.
-- Fica FORA do snapshot e do commit_planning, como a terminalidade (0028): a ausência destas tabelas derruba
-- só a aba 6. Não reescreve commit_planning e pode ser rodada de novo.

-- Tipo de usuário TST: soma-se ao papel (consulta, planejador, gestor, admin), como os módulos liberados.
-- O commit_planning grava profiles só nas colunas que conhece (on conflict ... do update set name, role,
-- work_ids, module_access), então esta coluna não é tocada pelo planejamento; quem a grava é a rota
-- /api/seguranca/tst, só para admin.
alter table profiles add column if not exists tst boolean not null default false;

-- "Tipo de apontamento": lista única para todas as obras (a equipe de TSTs é a mesma e a planilha compara
-- os tipos entre obras). Desativar tira da lista de escolha sem apagar o histórico.
create table if not exists safety_types (
  id text primary key,
  name text not null unique check (length(trim(name)) > 0),
  order_index integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- O apontamento. `location` é texto livre (a tela sugere os locais já usados na obra). `origin` separa o
-- que foi lançado no sistema do histórico importado da planilha. A restrição mantém status e data de
-- correção coerentes. Excluir a obra leva os apontamentos junto (delete_work apaga a linha de works).
create table if not exists safety_items (
  id text primary key,
  work_id text not null references works(id) on delete cascade,
  type_id text references safety_types(id),
  consequence text not null check (consequence in ('Morte', 'Severa', 'Significativa', 'Leve', 'Nenhuma', 'Autuação/Multa')),
  probability text not null check (probability in ('Provável', 'Possível', 'Remota', 'Rara')),
  description text not null check (length(trim(description)) > 0),
  location text not null default '',
  observed_on date not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  corrected_on date,
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  origin text not null default 'app' check (origin in ('app', 'planilha')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'resolved') = (corrected_on is not null))
);
create index if not exists safety_items_work_idx on safety_items (work_id);

-- Fotos no bucket privado `seguranca`: imagem comprimida no navegador e miniatura, ambas JPEG, em
-- `<obra>/<apontamento>/<foto>.jpg` e `<foto>-thumb.jpg`. Apagar o apontamento apaga as linhas (os
-- arquivos, a aplicação remove).
create table if not exists safety_photos (
  id text primary key,
  item_id text not null references safety_items(id) on delete cascade,
  work_id text not null references works(id) on delete cascade,
  kind text not null check (kind in ('issue', 'correction')),
  storage_path text not null,
  thumb_path text not null,
  width integer,
  height integer,
  bytes integer,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists safety_photos_item_idx on safety_photos (item_id);
create index if not exists safety_photos_work_idx on safety_photos (work_id);

-- Mesmo contrato das demais tabelas: RLS ligada sem política e acesso só pelo servidor. Grant explícito,
-- porque no takt-hub a exposição automática de tabelas novas está desligada.
alter table safety_types enable row level security;
alter table safety_items enable row level security;
alter table safety_photos enable row level security;
grant select, insert, update, delete on safety_types, safety_items, safety_photos to service_role;

-- Os tipos da planilha (aba "Página15", na ordem dela), para a lista nascer pronta. Ids fixos: rodar de
-- novo não duplica.
insert into safety_types (id, name, order_index) values
  ('sst-tipo-01', 'Proteções periféricas', 0),
  ('sst-tipo-02', 'SPIQ – Linha de Vida', 1),
  ('sst-tipo-03', 'Máquinas e equipamentos', 2),
  ('sst-tipo-04', 'Escada / Bancadas', 3),
  ('sst-tipo-05', 'Elétrica irregular', 4),
  ('sst-tipo-06', 'Fechamento de piso', 5),
  ('sst-tipo-07', 'Área de vivência', 6),
  ('sst-tipo-08', 'Instalações provisórias', 7),
  ('sst-tipo-09', 'Sinalização', 8),
  ('sst-tipo-10', 'Bandeja', 9),
  ('sst-tipo-11', 'Documentação', 10),
  ('sst-tipo-12', 'EPI''s', 11),
  ('sst-tipo-13', 'Organização / Limpeza', 12),
  ('sst-tipo-14', 'Condições de trabalho', 13),
  ('sst-tipo-15', 'Tela de Fachada', 14),
  ('sst-tipo-16', 'Escavação', 15)
on conflict do nothing;

-- Bucket privado, com os mesmos limites do bucket da terminalidade (2 MB, só JPEG). O bloco só age onde as
-- colunas de limite existem (o Supabase real), para a validação local em PGlite seguir rodando.
insert into storage.buckets (id, name, public) values ('seguranca', 'seguranca', false) on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'] where id = 'seguranca'$q$;
  end if;
end $$;

notify pgrst, 'reload schema';

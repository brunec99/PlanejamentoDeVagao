-- Aba 9, Checklist de equipamentos (12/11/2026): preenchimento pelo operador, sem login, pelo QR colado no
-- equipamento, com nome, assinatura desenhada e fotos. Só acrescenta colunas e um bucket: não reescreve
-- commit_planning e pode ser rodada de novo. Sem ela a aba 9 segue lendo, mas a gravação de inspeção e o
-- link do operador respondem "aplique a migração 0048".

-- O link secreto do equipamento: quem tem o endereço preenche os checklists pendentes daquele equipamento,
-- e só isso. Cada linha que já existe recebe um valor próprio (o default é volátil, avaliado por linha).
-- "Gerar novo link" na tela troca o valor e a etiqueta antiga deixa de valer.
alter table checklist_equipment
  add column if not exists public_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
create unique index if not exists checklist_equipment_public_token_idx on checklist_equipment (public_token);

-- A inspeção ganha quem operou (nome digitado), a assinatura (arquivo PNG no bucket e a hora em que foi
-- colhida), as fotos ([{ id, path }], até 4) e a origem: 'app' (TST ou admin logado) ou 'link' (operador
-- pelo QR; `created_by` fica 'qr').
alter table checklist_runs add column if not exists operator_name text not null default '';
alter table checklist_runs add column if not exists signature_path text;
alter table checklist_runs add column if not exists signed_at timestamptz;
alter table checklist_runs add column if not exists photos jsonb not null default '[]'::jsonb;
alter table checklist_runs add column if not exists source text not null default 'app';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'checklist_runs_source_check') then
    alter table checklist_runs add constraint checklist_runs_source_check check (source in ('app', 'link'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'checklist_runs_photos_check') then
    alter table checklist_runs add constraint checklist_runs_photos_check check (jsonb_typeof(photos) = 'array');
  end if;
end $$;

-- Bucket privado `checklist`: `<obra>/<inspeção>/<foto>.jpg` e `<obra>/<inspeção>/assinatura-<id>.png`. Os
-- arquivos sobem pelo servidor (chave de serviço), nunca direto do navegador: o operador não tem sessão.
-- O bloco só age onde as colunas de limite existem (o Supabase real), para a validação local em PGlite.
insert into storage.buckets (id, name, public) values ('checklist', 'checklist', false) on conflict (id) do nothing;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png'] where id = 'checklist'$q$;
  end if;
end $$;

notify pgrst, 'reload schema';

-- 0041 — Claudia geral (08/11/2026). Os admins conversam com a Claudia em qualquer tela e sobre várias
-- obras numa mesma pergunta. A pergunta que não é de uma obra só é gravada no livro-razão sem obra
-- (work_id nulo) e aparece como "Geral (várias obras)" em Configurações → Agente de IA. O teto mensal e o
-- limite por pessoa continuam somando tudo; só a parte de cada obra ignora essas linhas.
-- Sem esta migração o código grava a pergunta geral na obra da tela (ou na primeira obra consultada).
-- Pode ser rodada de novo.

alter table agent_usage alter column work_id drop not null;

-- Sonda da tela de migrações (Configurações): a coluna aceitar nulo não aparece numa leitura comum.
create or replace function agent_usage_allows_general()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_nullable = 'YES'
       from information_schema.columns
      where table_schema = 'public' and table_name = 'agent_usage' and column_name = 'work_id'),
    false
  );
$$;
revoke all on function agent_usage_allows_general() from public, anon, authenticated;
grant execute on function agent_usage_allows_general() to service_role;

notify pgrst, 'reload schema';

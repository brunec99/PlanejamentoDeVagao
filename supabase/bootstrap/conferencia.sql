-- Conferência do banco depois do bootstrap (supabase/bootstrap/obra360-schema.sql).
--
-- Só LÊ: não cria, não altera e não apaga nada. Cole no SQL Editor do projeto e clique em Run.
-- Devolve uma tabela única, uma linha por item, com situação OK / FALTA / ATENÇÃO, e uma última
-- linha de resumo. Num banco recém-montado, todas as linhas devem sair OK.
--
-- Itens: as 22 tabelas do snapshot do planejamento, as 10 tabelas fora dele, as 6 da terminalidade, as colunas que a tela
-- de saúde do banco (/api/health) sonda, RLS ligada em cada tabela, as funções e seus privilégios,
-- os gatilhos de imutabilidade, os buckets ifc e terminalidade do Storage e a versão em planning_meta.
with
tabelas(ordem, nome, grupo) as (
  values
    (101, 'works', 'Tabela do snapshot'),
    (102, 'profiles', 'Tabela do snapshot'),
    (103, 'locations', 'Tabela do snapshot'),
    (104, 'production_sequences', 'Tabela do snapshot'),
    (105, 'wagons', 'Tabela do snapshot'),
    (106, 'activities', 'Tabela do snapshot'),
    (107, 'terminality_criteria', 'Tabela do snapshot'),
    (108, 'pending_items', 'Tabela do snapshot'),
    (109, 'restrictions', 'Tabela do snapshot'),
    (110, 'releases', 'Tabela do snapshot'),
    (111, 'terminality_debts', 'Tabela do snapshot'),
    (112, 'teams', 'Tabela do snapshot'),
    (113, 'progress_entries', 'Tabela do snapshot'),
    (114, 'weekly_commitments', 'Tabela do snapshot'),
    (115, 'baselines', 'Tabela do snapshot'),
    (116, 'activity_dependencies', 'Tabela do snapshot'),
    (117, 'medium_term_plans', 'Tabela do snapshot'),
    (118, 'plan_tasks', 'Tabela do snapshot'),
    (119, 'plan_dependencies', 'Tabela do snapshot'),
    (120, 'ifc_models', 'Tabela do snapshot'),
    (121, 'ifc_model_versions', 'Tabela do snapshot'),
    (122, 'link_rules', 'Tabela do snapshot'),
    (201, 'planning_meta', 'Tabela fora do snapshot'),
    (202, 'history_events', 'Tabela fora do snapshot'),
    (203, 'prevision_activities', 'Tabela fora do snapshot'),
    (204, 'ifc_elements', 'Tabela fora do snapshot'),
    (205, 'ifc_properties', 'Tabela fora do snapshot'),
    (206, 'ifc_quantities', 'Tabela fora do snapshot'),
    (207, 'ifc_fragments', 'Tabela fora do snapshot'),
    (208, 'ifc_federations', 'Tabela fora do snapshot'),
    (209, 'long_term_plans', 'Tabela fora do snapshot'),
    (210, 'work_settings', 'Tabela fora do snapshot'),
    (211, 'terminality_floors', 'Terminalidade (0028)'),
    (212, 'terminality_units', 'Terminalidade (0028)'),
    (213, 'terminality_types', 'Terminalidade (0028)'),
    (214, 'terminality_people', 'Terminalidade (0028)'),
    (215, 'terminality_items', 'Terminalidade (0028)'),
    (216, 'terminality_photos', 'Terminalidade (0028)')
),
colunas(ordem, tabela, coluna, migracao) as (
  values
    (301, 'production_sequences', 'start_date', '0006'),
    (302, 'restrictions', 'lead_time_days', '0009'),
    (303, 'activities', 'notes', '0010'),
    (304, 'teams', 'company', '0012'),
    (305, 'weekly_commitments', 'work_id', '0014'),
    (306, 'weekly_commitments', 'supplier', '0020'),
    (307, 'plan_tasks', 'level', '0020'),
    (308, 'plan_dependencies', 'link_type', '0022'),
    (309, 'plan_tasks', 'schedule_meta', '0023'),
    (310, 'long_term_plans', 'synced_revision', '0026')
),
funcoes(ordem, assinatura, servidor_apenas) as (
  values
    (401, 'commit_planning(bigint,jsonb,jsonb)', true),
    (402, 'planning_snapshot(text[])', true),
    (403, 'ifc_version_summary(text)', true),
    (404, 'guard_planning_history()', false),
    (405, 'guard_plan_baseline()', false)
),
gatilhos(ordem, tabela, nome) as (
  values
    (501, 'history_events', 'planning_history_immutable'),
    (502, 'medium_term_plans', 'plan_baseline_immutable'),
    (503, 'plan_tasks', 'task_baseline_immutable'),
    (504, 'plan_dependencies', 'link_baseline_immutable')
),
itens(ordem, grupo, item, ok, detalhe) as (
  select t.ordem, t.grupo, t.nome, c.oid is not null,
    case
      when c.oid is null then 'tabela ausente'
      when c.relrowsecurity then 'RLS ligada'
      else 'RLS DESLIGADA'
    end
  from tabelas t
  left join pg_class c on c.oid = to_regclass('public.' || t.nome)
  union all
  select 299, 'RLS', 'Tabelas do schema public sem RLS', count(*) = 0,
    coalesce(string_agg(c.relname, ', ' order by c.relname), 'nenhuma')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  union all
  select k.ordem, 'Coluna (sondada por /api/health)', k.tabela || '.' || k.coluna, i.column_name is not null,
    'migração ' || k.migracao
  from colunas k
  left join information_schema.columns i
    on i.table_schema = 'public' and i.table_name = k.tabela and i.column_name = k.coluna
  union all
  select f.ordem, 'Função', f.assinatura, to_regprocedure('public.' || f.assinatura) is not null,
    case
      when to_regprocedure('public.' || f.assinatura) is null then 'função ausente'
      when not f.servidor_apenas then 'função de gatilho'
      else 'service_role executa: '
        || coalesce(has_function_privilege('service_role', to_regprocedure('public.' || f.assinatura), 'execute')::text, '?')
    end
  from funcoes f
  union all
  select 406, 'Função', 'commit_planning: uma assinatura só (bigint, jsonb, jsonb)', count(*) = 1,
    coalesce(string_agg('commit_planning(' || pg_get_function_identity_arguments(p.oid) || ')', ' | '), 'nenhuma')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'commit_planning'
  union all
  select 407, 'Segurança', 'Funções SECURITY DEFINER que anon/authenticated executam', count(*) = 0,
    coalesce(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', '), 'nenhuma')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  union all
  select 408, 'Segurança', 'Tabelas que a service_role não consegue ler e gravar', count(*) = 0,
    coalesce(string_agg(c.relname, ', ' order by c.relname), 'nenhuma')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not has_table_privilege('service_role', c.oid, 'select, insert, update, delete')
  union all
  select g.ordem, 'Gatilho', g.tabela || '.' || g.nome, tg.oid is not null,
    case when tg.oid is null then 'gatilho ausente' else 'base e histórico imutáveis' end
  from gatilhos g
  left join pg_trigger tg on tg.tgname = g.nome and tg.tgrelid = to_regclass('public.' || g.tabela)
  union all
  select 601, 'Storage', 'bucket ifc (privado)', count(*) = 1,
    case
      when count(*) = 0 then 'bucket ausente'
      when bool_and(not b.public) then 'privado'
      else 'PÚBLICO — deveria ser privado'
    end
  from storage.buckets b where b.id = 'ifc'
  union all
  select 602, 'Storage', 'bucket terminalidade (privado, fotos da 0028)', count(*) = 1,
    case
      when count(*) = 0 then 'bucket ausente'
      when bool_and(not b.public) then 'privado'
      else 'PÚBLICO — deveria ser privado'
    end
  from storage.buckets b where b.id = 'terminalidade'
  union all
  -- query_to_xml lê a tabela por SQL dinâmico, para a conferência não quebrar se ela não existir.
  select 701, 'Dados', 'planning_meta (linha única de versão)', m.versao is not null,
    case
      when to_regclass('public.planning_meta') is null then 'tabela ausente'
      when m.versao is null then 'SEM a linha id = 1: commit_planning falha'
      else 'versão ' || m.versao || ' (0 num banco novo; sobe a cada gravação)'
    end
  from (
    select case when to_regclass('public.planning_meta') is not null then
      nullif((xpath('/row/v/text()', query_to_xml(
        'select coalesce(max(version)::text, '''') as v from public.planning_meta where id = 1', false, true, '')))[1]::text, '')
    end as versao
  ) m
)
select ordem, grupo, item,
  case when ok then 'OK' when grupo in ('Segurança', 'RLS') then 'ATENÇÃO' else 'FALTA' end as situacao,
  detalhe
from itens
union all
select 999, 'Resumo', count(*) filter (where ok) || ' de ' || count(*) || ' itens OK',
  case when bool_and(ok) then 'OK' else 'FALTA' end,
  case when bool_and(ok) then 'banco pronto para a aplicação' else 'veja as linhas que não estão OK' end
from itens
order by ordem;

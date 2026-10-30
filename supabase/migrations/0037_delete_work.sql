-- Exclusão de obra (30/10/2026): o usuário pediu que administradores possam excluir obras. A obra sai
-- com tudo o que é dela, numa transação só: vagões, atividades, restrições, curto prazo, médio prazo
-- (inclusive linhas de base congeladas), longo prazo, IFC, terminalidade, configurações e a leitura do
-- agente de IA. Quem chama é a rota /api/admin/works/[id], que confere o papel de admin, e depois apaga
-- os arquivos da obra nos buckets 'ifc' e 'terminalidade' (o Storage não entra na transação).
--
-- Fica de fora, de propósito:
-- - history_events: é append-only (gatilho da 0023) e não tem chave estrangeira; o histórico da obra
--   continua como trilha de auditoria, mais o evento 'delete_work' gravado aqui.
-- - agent_usage: é o livro-razão do custo da IA. Apagar as linhas da obra faria o teto do mês
--   (AGENT_MONTHLY_BUDGET_USD) contar menos do que foi gasto; por isso a chave estrangeira para works
--   sai, e o work_id fica como texto, igual a actor_id.
--
-- Concorrência: tranca planning_meta como commit_planning e soma 1 à versão, então nenhuma gravação do
-- planejamento corre ao mesmo tempo e as telas abertas recarregam. Pode ser rodada de novo.
--
-- Aplique ANTES de publicar o código: sem a função, a rota responde pedindo esta migração e nada é
-- apagado. Aplicar com o código antigo no ar também não quebra nada.

-- A linha de base congelada do médio prazo é imutável (0023). A exclusão da obra é a única exceção, e
-- só vale para as linhas da obra que está sendo excluída: delete_work marca a obra em
-- 'obra360.deleting_work', uma configuração local da transação, que some no commit ou no rollback.
create or replace function guard_plan_baseline() returns trigger language plpgsql as $$
declare frozen boolean; work text;
begin
  if TG_TABLE_NAME='medium_term_plans' then frozen:=old.frozen_at is not null; work:=old.work_id;
  elsif TG_TABLE_NAME='plan_tasks' then select frozen_at is not null, work_id into frozen, work from medium_term_plans where id=old.plan_id;
  else select p.frozen_at is not null, p.work_id into frozen, work from medium_term_plans p join plan_tasks t on t.plan_id=p.id where t.id=old.successor_id;
  end if;
  if TG_OP='DELETE' and work = current_setting('obra360.deleting_work', true) then return old; end if;
  if frozen and (TG_OP='DELETE' or new is distinct from old) then raise exception 'Linha de base é imutável'; end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;

alter table agent_usage drop constraint if exists agent_usage_work_id_fkey;

create or replace function delete_work(p_work_id text, p_code text, p_actor_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work works%rowtype;
  v_version bigint;
  v_count integer;
  v_removed jsonb := '{}'::jsonb;
  v_sequences text[];
  v_wagons text[];
  v_activities text[];
  v_pending text[];
  v_releases text[];
  v_plans text[];
  v_tasks text[];
  v_models text[];
  v_versions text[];
begin
  -- Antes de qualquer trava: é também a resposta à sondagem da tela de saúde do banco (ator fictício).
  if not exists (select 1 from profiles where id::text = p_actor_id and role = 'admin') then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  select version into v_version from planning_meta where id = 1 for update;
  select * into v_work from works where id = p_work_id for update;
  if not found then
    raise exception 'work_not_found' using errcode = 'P0001';
  end if;
  -- O código digitado na tela confirma qual obra sai; a rota confere de novo, mas a regra mora aqui.
  if lower(btrim(coalesce(p_code, ''))) <> lower(btrim(v_work.code)) then
    raise exception 'work_code_mismatch' using errcode = 'P0001';
  end if;
  perform set_config('obra360.deleting_work', p_work_id, true);

  v_sequences := array(select id from production_sequences where work_id = p_work_id);
  v_wagons := array(select id from wagons where sequence_id = any(v_sequences));
  v_activities := array(select id from activities where wagon_id = any(v_wagons));
  v_pending := array(select id from pending_items where wagon_id = any(v_wagons));
  v_releases := array(select id from releases where wagon_id = any(v_wagons));
  v_plans := array(select id from medium_term_plans where work_id = p_work_id);
  v_tasks := array(select id from plan_tasks where plan_id = any(v_plans));
  v_models := array(select id from ifc_models where work_id = p_work_id);
  v_versions := array(select id from ifc_model_versions where model_id = any(v_models));

  -- Filhos antes dos pais, para as chaves estrangeiras nunca barrarem. Cada contagem vai ao histórico.
  -- Médio prazo (as equipes e as atividades são referenciadas pelas linhas do plano).
  delete from plan_dependencies where predecessor_id = any(v_tasks) or successor_id = any(v_tasks);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('plan_dependencies', v_count);
  delete from plan_tasks where id = any(v_tasks);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('plan_tasks', v_count);
  delete from medium_term_plans where id = any(v_plans);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('medium_term_plans', v_count);

  -- Curto prazo. Linha anterior à 0014 pode ter ficado sem work_id: sai pela atividade da obra.
  delete from weekly_commitments where work_id = p_work_id or (work_id is null and activity_id = any(v_activities));
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('weekly_commitments', v_count);

  -- Vagões.
  delete from terminality_debts where release_id = any(v_releases) or pending_item_id = any(v_pending);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('terminality_debts', v_count);
  delete from releases where id = any(v_releases);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('releases', v_count);
  delete from activity_dependencies where predecessor_id = any(v_activities) or successor_id = any(v_activities);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('activity_dependencies', v_count);
  delete from progress_entries where activity_id = any(v_activities);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('progress_entries', v_count);
  delete from terminality_criteria where activity_id = any(v_activities);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('terminality_criteria', v_count);
  delete from pending_items where id = any(v_pending);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('pending_items', v_count);
  delete from restrictions where wagon_id = any(v_wagons);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('restrictions', v_count);
  delete from activities where id = any(v_activities);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('activities', v_count);
  delete from wagons where id = any(v_wagons);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('wagons', v_count);

  -- Longo prazo e cadastros da obra.
  delete from long_term_plans where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('long_term_plans', v_count);
  delete from production_sequences where id = any(v_sequences);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('production_sequences', v_count);
  delete from baselines where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('baselines', v_count);
  delete from teams where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('teams', v_count);
  delete from locations where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('locations', v_count);
  delete from prevision_activities where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('prevision_activities', v_count);

  -- IFC (os arquivos no bucket 'ifc' saem pela rota, depois do commit).
  delete from ifc_federations where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('ifc_federations', v_count);
  delete from ifc_fragments where version_id = any(v_versions);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('ifc_fragments', v_count);
  delete from ifc_quantities where version_id = any(v_versions);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('ifc_quantities', v_count);
  delete from ifc_properties where version_id = any(v_versions);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('ifc_properties', v_count);
  delete from ifc_elements where version_id = any(v_versions);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('ifc_elements', v_count);
  delete from ifc_model_versions where id = any(v_versions);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('ifc_model_versions', v_count);
  delete from link_rules where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('link_rules', v_count);
  delete from ifc_models where id = any(v_models);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('ifc_models', v_count);

  -- Terminalidade (as fotos no bucket 'terminalidade' saem pela rota, depois do commit).
  delete from terminality_photos where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('terminality_photos', v_count);
  delete from terminality_items where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('terminality_items', v_count);
  delete from terminality_people where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('terminality_people', v_count);
  delete from terminality_types where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('terminality_types', v_count);
  delete from terminality_units where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('terminality_units', v_count);
  delete from terminality_floors where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('terminality_floors', v_count);

  delete from work_settings where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('work_settings', v_count);
  delete from agent_insights where work_id = p_work_id;
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('agent_insights', v_count);

  -- Ninguém fica com acesso a uma obra que não existe.
  update profiles set work_ids = array_remove(work_ids, p_work_id), updated_at = now() where p_work_id = any(work_ids);
  get diagnostics v_count = row_count; v_removed := v_removed || jsonb_build_object('profiles_access', v_count);

  delete from works where id = p_work_id;

  insert into history_events (id, entity_id, entity_type, action, author_id, occurred_at, changes)
  values (
    gen_random_uuid()::text,
    p_work_id,
    'work',
    'delete_work',
    p_actor_id,
    now(),
    jsonb_build_object('type', 'delete_work', 'workId', p_work_id, 'name', v_work.name, 'code', v_work.code, 'removed', v_removed)
  );

  update planning_meta set version = version + 1 where id = 1;
  return jsonb_build_object('version', v_version + 1, 'removed', v_removed);
end;
$$;

revoke all on function delete_work(text, text, text) from public, anon, authenticated;
grant execute on function delete_work(text, text, text) to service_role;

notify pgrst, 'reload schema';

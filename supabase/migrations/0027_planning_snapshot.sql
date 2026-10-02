-- Leitura do planejamento numa ida só ao banco, recortada pelas obras do usuário.
--
-- Antes, cada requisição lia as 23 tabelas inteiras, página a página, e filtrava em memória. Com
-- esta função a API pede só as obras a que a pessoa tem acesso e recebe um JSON único. `works` e
-- `profiles` vêm sempre inteiros: o cadastro de obra confere unicidade de código entre todas, e a
-- administração de acessos precisa de todos os perfis. `history_events` não entra: o histórico é
-- lido pela rota própria, por entidade.
--
-- Reexecutável (`create or replace`). Não reescreve `commit_planning`. Sem ela o sistema continua
-- funcionando pela leitura por tabela; com ela, cada tela carrega menos e mais rápido.
create or replace function planning_snapshot(p_work_ids text[])
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'version', (select version from planning_meta where id = 1),
    'works', (select coalesce(jsonb_agg(to_jsonb(w) order by w.id), '[]'::jsonb) from works w),
    'profiles', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from profiles p),
    'locations', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]'::jsonb) from locations l where l.work_id = any(p_work_ids)),
    'production_sequences', (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from production_sequences s where s.work_id = any(p_work_ids)),
    'wagons', (select coalesce(jsonb_agg(to_jsonb(w) order by w.id), '[]'::jsonb)
      from wagons w join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'activities', (select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb)
      from activities a join wagons w on w.id = a.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'terminality_criteria', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb)
      from terminality_criteria c join activities a on a.id = c.activity_id join wagons w on w.id = a.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'pending_items', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb)
      from pending_items p join wagons w on w.id = p.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'restrictions', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
      from restrictions r join wagons w on w.id = r.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'releases', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
      from releases r join wagons w on w.id = r.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'terminality_debts', (select coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)
      from terminality_debts d join pending_items p on p.id = d.pending_item_id join wagons w on w.id = p.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'teams', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb) from teams t where t.work_id = any(p_work_ids)),
    'progress_entries', (select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb)
      from progress_entries e join activities a on a.id = e.activity_id join wagons w on w.id = a.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'weekly_commitments', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]'::jsonb) from weekly_commitments c where c.work_id = any(p_work_ids)),
    'baselines', (select coalesce(jsonb_agg(to_jsonb(b) order by b.id), '[]'::jsonb) from baselines b where b.work_id = any(p_work_ids)),
    'activity_dependencies', (select coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)
      from activity_dependencies d join activities a on a.id = d.successor_id join wagons w on w.id = a.wagon_id join production_sequences s on s.id = w.sequence_id where s.work_id = any(p_work_ids)),
    'medium_term_plans', (select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) from medium_term_plans p where p.work_id = any(p_work_ids)),
    'plan_tasks', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)
      from plan_tasks t join medium_term_plans p on p.id = t.plan_id where p.work_id = any(p_work_ids)),
    'plan_dependencies', (select coalesce(jsonb_agg(to_jsonb(d) order by d.id), '[]'::jsonb)
      from plan_dependencies d join plan_tasks t on t.id = d.successor_id join medium_term_plans p on p.id = t.plan_id where p.work_id = any(p_work_ids)),
    'ifc_models', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]'::jsonb) from ifc_models m where m.work_id = any(p_work_ids)),
    'ifc_model_versions', (select coalesce(jsonb_agg(to_jsonb(v) order by v.id), '[]'::jsonb)
      from ifc_model_versions v join ifc_models m on m.id = v.model_id where m.work_id = any(p_work_ids)),
    'link_rules', (select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) from link_rules r where r.work_id = any(p_work_ids))
  );
$$;

revoke all on function planning_snapshot(text[]) from public, anon, authenticated;
grant execute on function planning_snapshot(text[]) to service_role;

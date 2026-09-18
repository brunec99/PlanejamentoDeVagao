-- O quantitativo do modelo é somado no banco, não no navegador.
--
-- A tela lia os elementos e as quantidades da versão e contava no cliente. Funcionava no modelo
-- de teste e mentia no modelo de obra: a API REST corta a resposta em 1.000 linhas (max_rows do
-- projeto), então um modelo de 80 mil elementos era resumido por uma amostra de mil — com o
-- agravante de o número sair plausível, sem erro nenhum na tela.
--
-- Agrupar é trabalho de banco de dados. Uma chamada, um jsonb, contagem exata.

create or replace function ifc_version_summary(p_version_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'elementos', (select count(*) from ifc_elements where version_id = p_version_id),
    'comGeometria', (select count(*) from ifc_elements where version_id = p_version_id and min_x is not null),
    'porClasse', coalesce((select jsonb_agg(item) from (
        select jsonb_build_object('nome', ifc_class, 'total', count(*)) as item
        from ifc_elements where version_id = p_version_id group by ifc_class order by count(*) desc) t), '[]'::jsonb),
    'porPavimento', coalesce((select jsonb_agg(item) from (
        select jsonb_build_object('nome', coalesce(nullif(btrim(storey), ''), 'Sem informação'), 'total', count(*)) as item
        from ifc_elements where version_id = p_version_id
        group by coalesce(nullif(btrim(storey), ''), 'Sem informação') order by count(*) desc) t), '[]'::jsonb),
    -- A unidade vem do próprio IFC e pode faltar em parte das linhas; max() pega a que existe.
    'quantidades', coalesce((select jsonb_agg(item) from (
        select jsonb_build_object('nome', name, 'kind', kind, 'unidade', max(unit), 'total', sum(value), 'itens', count(*)) as item
        from ifc_quantities where version_id = p_version_id group by name, kind order by sum(value) desc) t), '[]'::jsonb)
  );
$$;

-- A função é chamada pelo servidor da aplicação, que usa a service role; nenhum acesso anônimo.
revoke all on function ifc_version_summary(text) from public;
revoke all on function ifc_version_summary(text) from anon;
revoke all on function ifc_version_summary(text) from authenticated;
grant execute on function ifc_version_summary(text) to service_role;

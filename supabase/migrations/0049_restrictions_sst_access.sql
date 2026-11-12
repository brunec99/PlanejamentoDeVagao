-- Quadro de Restrições, Segurança do trabalho e Checklist de equipamentos liberados por pessoa (12/11/2026).
-- Até aqui a segurança (aba 6, agora 3.1) e o checklist (aba 9, agora 3.2) eram abertos a todos que tinham a
-- obra, e o Kanban de pendências ia junto com o módulo `vagoes`. O usuário pediu os três nas liberações
-- (profiles.module_access, da 0031). Para ninguém perder o acesso no deploy, como na 0042:
--   * todo perfil que não é admin ganha `seguranca` e `checklist`;
--   * quem já tinha `vagoes` ganha `restricoes` (o quadro, agora com item próprio no menu: 1.4).
-- O admin revoga em lote, em Configurações → Usuários → Módulos, de quem não deve ter. Admin vê todos os
-- módulos e fica de fora. Só dados, nenhuma coluna nova. Pode ser rodada de novo, mas devolve os módulos a
-- quem o admin já tiver revogado: rode uma vez.
--
-- Aplique ANTES de publicar o código: o código novo sem esta migração tira as três telas de todos os
-- não-admins; o código antigo ignora as seções novas na lista.
update profiles
set module_access = module_access || array(
  select section
  from unnest(array['seguranca', 'checklist']) as section
  where not (section = any(module_access))
)
where role <> 'admin'
  and not (module_access @> array['seguranca', 'checklist']);

update profiles
set module_access = module_access || array['restricoes']
where role <> 'admin'
  and module_access @> array['vagoes']
  and not (module_access @> array['restricoes']);

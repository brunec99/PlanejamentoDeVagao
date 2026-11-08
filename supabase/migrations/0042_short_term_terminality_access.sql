-- Curto prazo e terminalidade liberados por pessoa (08/11/2026): até aqui as abas 4 e 5 eram abertas a todos
-- que tinham a obra liberada. O usuário pediu que entrassem no grupo de módulos liberados pelo admin
-- (profiles.module_access, da 0031), como médio prazo e IFC. Para ninguém perder o acesso no deploy (decisão
-- do usuário: "manter quem já usa"), todo perfil que não é admin ganha os dois; o admin revoga em lote, em
-- Configurações → Usuários → Módulos, de quem não deve ter. Admin vê todos os módulos e fica de fora, como no
-- lote. Só dados, nenhuma coluna nova. Pode ser rodada de novo, mas devolve os dois módulos a quem o admin já
-- tiver revogado: rode uma vez.
--
-- Aplique ANTES de publicar o código: o código novo sem esta migração tira as duas abas de todos os não-admins;
-- o código antigo ignora as duas seções na lista.
update profiles
set module_access = module_access || array(
  select section
  from unnest(array['curto-prazo', 'terminalidade']) as section
  where not (section = any(module_access))
)
where role <> 'admin'
  and not (module_access @> array['curto-prazo', 'terminalidade']);

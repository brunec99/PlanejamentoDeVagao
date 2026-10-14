-- Correção da 0032 (14/10/2026): no projeto takt-hub a exposição automática de tabelas novas está
-- desligada, então access_requests nasceu sem permissão para a chave de serviço, e todo pedido de
-- acesso respondia "Não foi possível registrar o pedido agora". Mesmo grant explícito da 0028.
-- Pode ser rodada de novo.
grant select, insert, update, delete on access_requests to service_role;

notify pgrst, 'reload schema';

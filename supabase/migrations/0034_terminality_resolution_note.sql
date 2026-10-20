-- "Como foi corrigido" (15/10/2026): texto opcional que quem resolve a pendência escreve junto da
-- data e da foto da correção. Coluna nova numa tabela que já existe: o grant da 0028 cobre (a
-- permissão é da tabela). Reabrir a pendência limpa o texto, como limpa a data da correção.
-- Pode ser rodada de novo. Não reescreve commit_planning (a terminalidade fica fora do snapshot).
alter table terminality_items
  add column if not exists resolution_note text check (resolution_note is null or length(resolution_note) <= 1000);

notify pgrst, 'reload schema';

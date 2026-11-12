-- Resumo semanal por e-mail (12/11/2026, modelo aprovado "Dashboards completos e resumo semanal", regra 18).
-- Todo sábado, às 08:00 de Brasília, o servidor do Obra 360 enfileira na fila de e-mail do Takt Hub
-- (takt.email_enqueue, modelo 'obra360.resumo_semanal') o placar da semana que acabou: quais obras cumpriram o
-- planejamento (curto prazo) e os processos de histograma e de produtividade. Recebe quem é admin e tem esta
-- chave ligada.
--
-- Só uma coluna em `profiles`, como a `tst` da 0040: o `commit_planning` não a conhece e não a altera. Quem a
-- grava é a rota POST /api/dashboard/resumo-semanal, só para admin (Configurações → Usuários, linha de admin).
-- Nasce desligada para todos: ninguém passa a receber e-mail só por a migração ter sido aplicada.
--
-- Independente da ordem do deploy: sem ela, o agendador não envia a ninguém e a chave avisa que falta a 0050;
-- o envio avulso ("Enviar o resumo agora para mim") não depende dela. Pode ser rodada de novo.
alter table profiles add column if not exists weekly_summary boolean not null default false;

comment on column profiles.weekly_summary is
  'Admin que recebe o resumo semanal por e-mail aos sábados (0050). Gravada só pela rota /api/dashboard/resumo-semanal.';

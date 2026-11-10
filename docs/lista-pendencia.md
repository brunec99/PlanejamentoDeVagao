# Lista de pendência (aba 2)

Entregue em 10/11/2026. A aba 2 passou a se chamar **Planejamento de vagão e lista de pendência** e tem duas visões: **Vagões** (a tela de sempre, sem mudança) e **Lista de pendência** (`/obras/{obraId}/vagoes?visao=pendencias`).

## Estado

| Item | Situação em 10/11/2026 |
| --- | --- |
| Código do Obra 360 (quadro, API, botões do médio e do longo prazo) | Commit `3382814`, enviado ao `main` em 10/11/2026; CI do GitHub verde. **A Vercel marcou o deploy desse commit como bloqueado** ("Deployment was blocked"): publicação não confirmada |
| Migração `0043_pending_board.sql` (este repositório) | **Aplicada no takt-hub em 10/11/2026** (4 tabelas, RLS e grants conferidos; leitura REST com a chave de serviço respondeu 200) |
| Migração `20261110090000_obra360_pendencia_email.sql` (repositório do Takt Hub) | **Aplicada no takt-hub em 10/11/2026** (`obra360.pendencia` nos dois CHECKs da fila) |
| Modelo de e-mail `obra360.pendencia` na Edge Function `email-dispatch` (Takt Hub) | Commit `137ce34` no takt-hub. **Edge Function não publicada**: a CLI do Supabase pede login (`npx supabase login`), que só o dono da conta faz |
| Uso real logado | Não feito |

Sem a 0043 a visão mostra "indisponível" e o resto do sistema segue normal. Sem a parte do Takt Hub o quadro funciona inteiro e só o e-mail não sai (a falha fica no log do servidor, o comando não é recusado).

## O que é

Quadro Kanban no estilo Trello/Pipefy com as pendências que precisam estar resolvidas antes de cada frente começar. O modelo de UX foi publicado e aprovado pelo usuário antes do código, com 11 regras numeradas; as respostas dele estão em "Decisões".

- Colunas: **A fazer, Fazendo, Pausado, Concluído, Cancelado**. Arrasta-se o card entre colunas e dentro da coluna; no celular e no teclado, a coluna muda pelo menu do card ou pelo seletor do card aberto.
- Pausar e cancelar pedem **motivo**, que aparece no card.
- Card: título, descrição, entrega, tempo de execução (dias úteis), responsável, checklists, conversa.
- Sinal do card (texto, nunca só cor): vermelho quando passou da entrega sem concluir ou passou do "começar até" ainda em A fazer; amarelo quando precisa começar em até 5 dias úteis; verde no prazo; cinza quando fechado. Pausado conta como aberto: o prazo não para.
- Filtros por responsável e por origem; os contadores do topo seguem os filtros.
- Conversa: mensagens e linhas de histórico (criação, mudança de coluna, de entrega e de responsável). `@` abre a lista de quem tem a obra liberada.
- Checklists: várias por card, com barra de progresso; concluir com item aberto pede confirmação e deixa.
- Excluir card: só quem criou ou um admin.

## As três formas de criar

1. **Na aba 2**, "+ Nova pendência": digita-se a data de término e o tempo de execução.
2. **No médio prazo**, botão "Criar pendência" na barra do cronograma (age na linha selecionada) e no rodapé de "Informações da tarefa". Desabilitado, com o motivo na dica, em tarefa-resumo, em linha de base, em tarefa ainda não salva e com edição em andamento. Não aparece no Gantt de legalização.
3. **No longo prazo**, botão "Criar pendência do serviço" no painel do bloco selecionado da Linha de Balanço. A origem é o **serviço** do bloco, e o início é o menor início entre os blocos do serviço.

Em 2 e 3 só se digita o título, o lead time e o responsável. A entrega é o **dia útil anterior ao início** e acompanha a reprogramação: a API recalcula a cada leitura. Se a tarefa ou o serviço deixar de existir, o card fica com a última data gravada e avisa.

Os dois botões só aparecem para quem pode abrir a aba 2.

## Decisões do usuário (10/11/2026)

- **E-mail:** "pegue do sistema de takt". O Obra 360 usa o mesmo banco do Takt Hub, então enfileira na `takt.email_outbox` pela RPC `takt.email_enqueue`; quem envia é a Edge Function `email-dispatch` do Takt Hub, pelo SMTP do Google Workspace, a cada 5 minutos.
- **Quadro de restrições do longo prazo:** "tire do longo prazo e coloque ali". O quadro de três colunas saiu da aba 1 e a visão "Vagões e restrições" virou "Vagões".
- **Acesso:** "vou liberar depois". O quadro segue a liberação da seção `vagoes` (desenvolvedor, admin e quem tem o módulo liberado). Dentro do módulo, qualquer papel cria, move, comenta e marca.
- **Prazo em dias úteis** (segunda a sexta, sem feriados).
- **Entrega na véspera do início**, acompanhando a tarefa; **longo prazo usa o início do serviço** no primeiro bloco.
- Demais regras do modelo aceitas como propostas: motivo ao pausar e cancelar, e-mail só a quem é marcado e ao novo responsável, confirmação ao concluir com item aberto, histórico na conversa.

## Decisões de desenho

- **Fora do snapshot**, como a terminalidade (0028) e a segurança (0040): tabelas próprias, API própria, um comando por requisição, resposta com a obra atualizada. A 0043 não reescreve `commit_planning`.
- **O card não trava vagão.** As restrições impeditivas do vagão (`restrictions`, comandos `create_restriction`/`resolve_restriction`) continuam no detalhe do vagão, sem mudança. A 0043 **copia** as restrições existentes como cards de origem "Restrição" (id `restricao-<id>`, rodar de novo não duplica); as linhas originais ficam.
- **Tarefa do médio prazo muda de id a cada mês.** A cópia mensal (`copyPlanForward`) passou a gravar `sourceTaskId` com a tarefa do mês anterior, e o card segue esse elo até o plano mais recente. Para planos copiados antes de 10/11/2026 e para planos importados do Project, que não têm o elo, o par é procurado no mês seguinte pelo caminho de nomes (resumos acima + nome); tarefa renomeada ou movida de resumo nesses casos perde o par e o card fica na data do mês antigo.
- **E-mail nunca derruba o comando**: é enfileirado depois da gravação, e a falha vai para o log só com ids e código do erro. Chave de idempotência por mensagem e pessoa.
- **Lead time das restrições copiadas**: o número antigo (dias corridos) passa a ser lido em dias úteis.

## Arquitetura

| Camada | Arquivo |
| --- | --- |
| Contrato e regras de prazo | `src/domain/pending-board.ts` |
| Regras dos comandos e resolução da origem (puro) | `src/application/use-cases/pending-commands.ts` |
| Banco | `src/infrastructure/repositories/supabase/pending-repository.ts` |
| E-mail | `src/infrastructure/email/takt-outbox.ts` |
| API | `GET /api/pendencias?workId=`, `POST /api/pendencias/commands?workId=` |
| Tela | `src/modules/pendencias/` (`pending-board.tsx`, `card-dialog.tsx`, `create-pending-dialog.tsx`, `mention-input.tsx`, `pending-view.ts`) |
| Botões | `src/modules/medio-prazo/schedule-sheet.tsx`, `task-info-dialog.tsx`; `src/modules/longo-prazo/lob/lob-activity-panel.tsx` |
| Acesso | `src/application/module-access.ts` (`/api/pendencias` na seção `vagoes`) |

Tabelas da 0043: `pending_cards`, `pending_checklists`, `pending_checklist_items`, `pending_messages`, todas com `work_id ... on delete cascade` (excluir a obra leva tudo), RLS ligada sem política e grant para `service_role`.

No Takt Hub (`~/Applications/App-Takt`): `supabase/migrations/20261110090000_obra360_pendencia_email.sql` soma `obra360.pendencia` ao catálogo de `kind`/`template` da fila; `supabase/functions/_shared/email-templates.ts` ganhou o modelo (moldura própria "Obra 360", sem o logo do Takt Hub; link só `https`); teste em `tests/unit/obra360-pendencia.test.ts`.

## Para colocar no ar, nesta ordem

1. ~~Aplicar a `0043_pending_board.sql` no takt-hub.~~ Feito em 10/11/2026.
2. ~~Aplicar a `20261110090000_obra360_pendencia_email.sql` no takt-hub.~~ Feito em 10/11/2026.
3. Publicar a Edge Function `email-dispatch` do Takt Hub (sem isso a linha da fila falha com `modelo_desconhecido`).
4. Publicar o Obra 360.

O código novo sem a 0043 não quebra nada (a visão fica indisponível). A cópia mensal que grava o elo não depende de migração.

## Validação (10/11/2026)

- `npm run typecheck`, `lint` (0 erros), `format:check`, `npm test` (1.250 testes), `validate:migrations`, `build` e `test:e2e`: todos passaram.
- Testes novos: `tests/pending-board.test.ts`, `tests/pending-commands.test.ts`, `tests/pending-view.test.ts`; ajustados `tests/delete-work.test.ts` (as tabelas novas caem com a obra), `tests/module-access.test.ts`, `tests/plan-monthly.test.ts` (o elo da cópia).
- Tela aberta no navegador com `next dev`, Supabase falso e API simulada pelas regras reais (`planPendingCommand`), em 1500 px e 400 px: quadro, arrastar entre colunas, motivo ao pausar, card aberto, menção com `@`, envio de mensagem e "Nova pendência", sem erro de página.
- No Takt Hub: `tsc` e os testes do modelo de e-mail passaram.

## Não verificado

- Nada rodou contra o banco real: rotas, repositório, a cópia das restrições e o enfileiramento do e-mail.
- O envio de um e-mail de ponta a ponta. O schema `takt` responde pela API com a chave de serviço (leitura de `takt.email_outbox` conferida em 10/11/2026), mas nenhuma linha foi enfileirada.
- Os botões do médio e do longo prazo abrindo o formulário em tela real.
- (Conferido em 10/11/2026: a tabela `restrictions` de produção estava vazia, então a 0043 não copiou nenhum card.)

## Pendências

- Publicar a Edge Function do Takt Hub e o código do Obra 360 (acima). Enquanto a função não for publicada, **não publicar o Obra 360 não é necessário**, mas todo e-mail enfileirado falha com `modelo_desconhecido` e não é reenviado.
- Liberar o módulo para as pessoas (decisão do usuário: depois).
- O Dashboard da obra ainda mostra "Restrições por coluna" com as três colunas antigas, e o comando `move_restriction` ficou sem tela.
- O botão "Gerar restrição" do curto prazo (só desenvolvedor) continua criando restrição de vagão, não card.
- Sem feriados no calendário de dias úteis; sem anexos no card; sem aviso por e-mail de prazo vencendo.
- Passeio guiado do quadro tem só três passos.

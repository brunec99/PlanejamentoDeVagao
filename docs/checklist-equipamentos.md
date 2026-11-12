# Checklist de equipamentos (aba 9)

Entregue em 11/11/2026, a pedido do usuário ("vamos desenvolver um módulo de checklist diário, semanal e
mensal de equipamentos"; "checklist permita que o tst edite"). Fica no grupo **SST** do menu, abaixo da
vistoria de segurança.

**Situação:** código, testes e migração prontos e validados localmente (testes, tipos, lint, validação das
migrações e build). **A migração 0047 ainda não foi aplicada no Supabase**, a tela não foi exercitada num
navegador e nenhuma gravação foi feita num banco real. Sem a 0047 a aba responde "indisponível" e as
demais seguem normais. **Nenhum modelo vem cadastrado:** as fichas da empresa não foram fornecidas, então
os TSTs criam os modelos na própria tela.

**Atualização de 11/11/2026 (noite):** a migração foi aplicada no `takt-hub` pela CLI do Supabase, a pedido do usuário, e conferida no catálogo (tabela, RLS ligada, grant para `service_role`, sem acesso de `anon`). A tela ainda não foi aberta logada em produção.

## Operador pelo QR, assinatura, fotos e cadastro só com admin (12/11/2026)

**Pedido:** a equipe de SST levantou quatro pontos e o usuário respondeu a cada um: (1) o preenchimento é do funcionário que opera o equipamento — decidido: **tela sem login**, aberta por QR; (2) assinatura — **sim**, desenhada na tela; (3) cadastro só com a responsável de SST — **só administradores** (ela passa a admin); (4) foto — o campo **já entra**, opcional. O modelo das telas e as sete regras abaixo foram publicados antes do código e aprovados sem mudança.

**Situação:** código, testes e migração `0048_checklist_operator.sql` prontos e validados localmente. **A 0048 foi aplicada no `takt-hub` em 12/11/2026**, a pedido do usuário, numa transação (pelo pooler), com o estado lido antes e depois: colunas novas em `checklist_equipment` e `checklist_runs`, as duas restrições, o índice único do link, o bucket privado `checklist` (2 MB, JPEG e PNG), `service_role` gravando, `anon` sem acesso (401) e a API REST lendo as colunas novas. As três tabelas estavam vazias. **O código ainda não foi publicado** (sem commit): em produção a aba 9 segue como estava até o push. A pessoa de SST ainda precisa ser marcada como admin em Configurações → Usuários.

### Regras aprovadas

1. **Um link secreto por equipamento, sem login.** `checklist_equipment.public_token`; o endereço é `/checklist/<token>`. Quem abre vê só aquele equipamento (obra, nome, tipo e os checklists dele). Nada mais do sistema sai por esse caminho.
2. **Pelo link só se registra o dia de hoje, e só o que está pendente no período** (diário uma vez por dia, semanal uma por semana, mensal uma por mês). O operador não edita nem apaga; corrigir é com TST e admin, logados. A tela logada segue podendo repetir um semanal ou mensal em outro dia.
3. **Nome completo (nome e sobrenome) e assinatura são obrigatórios pelo link.** Na tela logada os dois campos existem e são opcionais; quem assina precisa ter o nome escrito.
4. **Fotos opcionais, até 4 por inspeção**, da inspeção como um todo, comprimidas no celular (JPEG de até 1280 px e ~600 KB).
5. **Cadastro só com admin** (`canManageChecklist`): modelos, equipamentos e a troca do link. O TST (`canWriteChecklist`) registra, corrige e exclui inspeções e vê o QR.
6. **"Gerar novo link" invalida a etiqueta antiga** (`rotate_equipment_token`). Desativar o equipamento também fecha o link. Renomear não troca o link.
7. **No histórico aparecem o nome do operador, a assinatura (com data e hora) e as fotos**; a inspeção vinda do link leva a marca "pelo QR" (`source = 'link'`, `created_by = 'qr'`).

### Como funciona

- **Tela do operador** (`src/app/checklist/[token]/page.tsx`, `src/modules/checklist/operator-app.tsx`): lista dos checklists do equipamento com a situação, formulário (itens, fotos, observação, nome, assinatura) e confirmação; com item não conforme, a confirmação manda avisar o técnico de segurança. O nome fica guardado no aparelho (`localStorage`) para o dia seguinte. Precisa de internet.
- **API pública** (`src/app/api/publico/checklist/[token]/route.ts`): `GET` devolve a visão do operador; `POST` registra uma inspeção. Obra, equipamento, data e autoria são do servidor; o corpo só traz modelo, respostas, nome, assinatura e fotos. Freio de 20 envios por link a cada 10 minutos (em memória, por processo) e corpo de até 6 MB. Respostas com `X-Robots-Tag: noindex`.
- **Proxy** (`src/proxy.ts`): `checklist/` e `api/publico/` saíram do `matcher`, porque o operador não tem sessão. Nada mais mora em `api/publico/`.
- **Arquivos:** bucket privado `checklist` (`<obra>/<inspeção>/<foto>.jpg` e `<obra>/<inspeção>/assinatura-<id>.png`). Assinatura e fotos viajam em base64 dentro do comando e sobem pelo servidor, antes das linhas; se a gravação falha, os arquivos enviados saem. O planejador confere tamanho e a assinatura do formato (JPEG/PNG). A tela pede as URLs assinadas de uma inspeção só quando ela é aberta (`GET /api/checklist/arquivos`). Excluir a inspeção e excluir a obra levam os arquivos.
- **QR e etiquetas:** `qrcode-generator` (dependência nova, sem serviço externo) desenha o QR em SVG no navegador (`src/modules/checklist/qr.tsx`). "QR do operador" na linha do equipamento mostra QR, endereço, copiar, imprimir e, para o admin, "Gerar novo link". `/imprimir/checklist/{obraId}` é a folha de etiquetas (todas as ativas, ou uma com `?equipamento=`). O segredo só chega a TST e admin: `GET /api/checklist` zera `publicToken` para os demais.
- **Componentes divididos** entre a tela logada e a do operador: `answer-list.tsx` (C / NC / N/A) e `run-fields.tsx` (quadro de assinatura e fotos).

### Validação de 12/11/2026

- `tests/checklist.test.ts`: 16 testes (6 novos: cadastro só admin; link novo e troca; registro pelo QR com arquivos na pasta da inspeção; recusas do link; edição mantendo e trocando assinatura e fotos; visão do operador).
- Sequência do `ci.yml` local: tipos, lint (sem erro), Prettier, 1.361 testes, validação das migrações (com a 0048) e build.
- Navegador (`next dev` com um Supabase falso em memória — tabelas do checklist e bucket — exercitando as rotas reais): o admin criou modelo e equipamento e abriu o QR; num contexto de celular (390 px, sem cookie) o link abriu, o formulário bloqueou o envio sem respostas, com um nome só e sem assinatura, aceitou foto e assinatura desenhada, e o envio gravou a inspeção (`source = 'link'`, `created_by = 'qr'`) com o PNG e o JPEG na pasta da inspeção; o histórico mostrou "pelo QR", a assinatura e a foto; a edição logada manteve os dois; "Gerar novo link" fez o endereço antigo responder "link inválido"; a folha de etiquetas renderizou. Pela API: TST recebe 403 em `save_equipment` e `save_model` e continua vendo o link; perfil de consulta recebe o equipamento sem o segredo. O `matcher` do proxy foi conferido caminho a caminho (só `/checklist/<token>` e `/api/publico/` ficam sem sessão).
- **Não validado:** gravação num banco real pelo sistema, envio real de arquivo ao Storage, leitura do QR impresso por um celular e a tela logada em produção.

## As três peças

- **Modelo** (`checklist_models`): a ficha. Nome, tipo de equipamento, periodicidade (`daily`, `weekly`,
  `monthly`) e a lista ordenada de itens (`items`, JSON `[{ id, text }]`, até 60). Lista única para todas
  as obras, como os tipos de apontamento da aba 6.
- **Equipamento** (`checklist_equipment`): o que existe na obra ("Betoneira 01"), de um tipo. Recebe todos
  os modelos ativos do mesmo tipo; a comparação ignora acento e maiúsculas (`checklistKey`).
- **Inspeção** (`checklist_runs`): um modelo preenchido num equipamento num dia. `answers` guarda, por
  item, o texto como estava no dia, a resposta (`c`, `nc`, `na`) e a observação.

## O que a tela faz

`/obras/{obraId}/checklist`.

- **Cartões:** pendentes hoje, na semana e no mês, e checklists do período corrente com não conformidade.
- **Equipamentos da obra:** cada equipamento com os checklists do tipo dele — âmbar pendente no período,
  verde feito, vermelho feito com não conformidade. Clicar abre o formulário de inspeção. Abaixo, o
  cadastro de equipamentos; renomear, desativar e reativar.
- **Inspeção:** C / NC / N/A por item, descrição obrigatória no NC, "Marcar os demais como conforme",
  data (hoje por padrão) e observação geral.
- **Últimas inspeções:** as 30 mais recentes dos últimos 120 dias, com quem registrou, as respostas,
  edição e exclusão.
- **Modelos de checklist:** criar, editar (itens com ordem, colar vários de uma vez), desativar e reativar.

## Regras (`checklist-commands.ts`)

- Inspeções: o tipo TST (`profiles.tst`, migração 0040) e os admins (`canWriteChecklist`). Cadastro de
  modelos e equipamentos: só admins desde 12/11/2026 (`canManageChecklist`). Todos que têm a obra
  consultam: a seção `checklist` é aberta, como `seguranca`.
- Período: o dia; a semana de segunda a domingo; o mês (`periodKey`).
- Um modelo só é preenchido uma vez por equipamento por dia (regra e unicidade no banco).
- Sem data futura. Todos os itens respondidos. NC exige descrição.
- A edição da inspeção usa os itens que ela guardou; editar o modelo não reescreve o histórico. Na edição
  do modelo, o item que permanece mantém o id.
- Nome de modelo único (lista toda) e nome de equipamento único na obra, sem acento nem maiúsculas.
- Modelo e equipamento não são excluídos, são desativados. Só a inspeção é excluída.
- A API carrega as inspeções dos últimos 120 dias (`CHECKLIST_WINDOW_DAYS`); edição ou exclusão de uma
  mais antiga busca a linha à parte.

## Arquivos

- Domínio: `src/domain/equipment-checklist.ts`
- Regras: `src/application/use-cases/checklist-commands.ts`
- Banco: `supabase/migrations/0047_equipment_checklist.sql`, `0048_checklist_operator.sql`,
  `src/infrastructure/repositories/supabase/checklist-repository.ts`
- API: `src/app/api/checklist/route.ts`, `commands/route.ts`, `arquivos/route.ts` e a pública
  `src/app/api/publico/checklist/[token]/route.ts`
- Tela: `src/modules/checklist/`
- Manual e tour: `src/modules/agente/manual/checklist.ts`, `src/modules/tour/pages/checklist.ts`
- Testes: `tests/checklist.test.ts` (16) e a semente em `tests/delete-work.test.ts`

## Pendente

- **Publicar o código** (a 0048 já está aplicada). Marcar a responsável de SST como admin.
- Marcar os TSTs (mesma marcação da aba 6). A 0047 já está aplicada.
- Cadastrar os modelos com as fichas que a equipe de SST usa hoje, os equipamentos, e imprimir as etiquetas.
- Testar com um celular real: ler o QR impresso, fotografar, assinar e enviar.
- Não construído: foto presa a um item, modo sem internet, PDF da inspeção, abrir apontamento na aba 6 a partir
  de uma não conformidade, checklist no dashboard e na assistente (relatórios), histórico além de 120 dias
  na tela.

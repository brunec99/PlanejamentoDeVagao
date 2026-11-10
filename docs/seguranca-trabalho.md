# Aba 6 — Segurança do trabalho (05/11/2026)

Este documento registra a continuidade entre os modelos de IA que trabalham no repositório: o comportamento entregue, as decisões, os arquivos, a migração, a validação e as pendências. Não registre intenção como se fosse funcionalidade pronta.

## O que é

A aba 6 é a vistoria de segurança do trabalho da obra, feita pelos técnicos de segurança (TST). Ela substitui a planilha "SST - Controle geral" (Google Sheets, aba "SST") e mantém as mesmas colunas:

- Tipo de apontamento
- Risco: consequência
- Risco: probabilidade
- Descrição
- Local
- Data do apontamento
- Foto do apontamento
- Data de correção
- Foto da correção
- Dias para resolver (calculado)

O processo é o da terminalidade (aba 5, ver [terminalidade.md](terminalidade.md)): o apontamento nasce com foto e só se finaliza com a data e a foto da correção. A aba fica logo abaixo da terminalidade na lateral (`WORK_TABS` em `src/modules/layout/work-nav.tsx`).

Desde 06/11/2026 a vistoria aparece também no **Dashboard geral** (`/dashboard`), comparando as obras: quadro 6 "Segurança do trabalho", três colunas no comparativo, um cartão, uma frase no resumo e a folha 5 do PDF (ver "Na comparação entre obras", abaixo). A aba 0 de cada obra ainda não tem o quadro.

Em 10/11/2026 a tela recebeu os 7 ajustes pedidos pela equipe de SST: cartão "Risco de morte em aberto" no lugar de "Finalizados", período com escala e setas como na aba 0 (com "Tudo" como padrão e períodos do calendário), lista logo abaixo dos cartões, gráficos e quadro mês a mês recolhidos no fim, PDF sem folha nova por padrão e "Finalizar" verde, na coluna presa à direita e na janela do apontamento (ver "10/11/2026 — Ajustes pedidos pela equipe de SST").

## Decisões do usuário (05/11/2026)

- **Pedido:** "o mesmo processo da terminalidade, mas com os TSTs", acesso logo abaixo da terminalidade, e um **tipo de usuário TST, o único que pode colocar e finalizar informações**. Também pediu para importar os dados da planilha.
- **Obras da planilha que não existem no sistema:** "My Sunset" (242 apontamentos) e "Amariles" (49) ficaram **fora**, por escolha do usuário. As outras seis (Essenza, Mozine, Blentt, Atmos, Brizz, Tauá) foram importadas em 05/11/2026 (ver "Importação da planilha").
- **Fotos da planilha:** o usuário escolheu **importar sem fotos por ora** (ver "Importação da planilha").

## Decisões de desenho

- **TST é um tipo de usuário na lista "Papel"** (Consulta, TST, Planejador, Gestor, Admin), na grade de Configurações → Usuários e em "Cadastrar usuário". No banco, o TST é o papel `viewer` com a marca `profiles.tst = true` (`typeToProfile` e `userType` em `src/modules/configuracoes/user-list.ts`).
  - Gravam na aba 6 o TST e o admin (`canWriteSafety`): lançar, editar, editar em lote, finalizar, reabrir, excluir, fotos e a lista de tipos. Consulta, Planejador e Gestor só consultam. No resto do sistema, o TST é consulta.
  - Por que não um quinto valor em `role`: cerca de 45 telas e rotas testam `role === 'viewer'` para decidir quem edita. Um papel "tst" passaria nesses testes e ganharia escrita no planejamento. Guardado como consulta + marca, o TST não ganha nada fora da aba 6.
  - Trocar o papel para TST grava `set_role viewer` pelo planejamento e a marca pela rota `POST /api/seguranca/tst` (só admin); trocar de TST para outro papel grava o papel e tira a marca. O `commit_planning` não conhece a coluna: o upsert de `profiles` só atualiza `name`, `role`, `work_ids` e `module_access`, então salvar o planejamento não apaga a marca. A leitura do planejamento (`planning_snapshot`) devolve o perfil inteiro (`to_jsonb(p)`), e `rowsToPlanningData` põe `tst: true` no `User`. O cadastro (`/api/admin/invite`) aceita `tst: true` com o papel consulta.
  - O rodapé da lateral mostra "TST" no lugar de "Consulta" para quem tem a marca.
  - **Histórico da decisão:** a primeira entrega (05/11/2026) tinha uma coluna "TST" separada na grade e deixava só o TST gravar, nem o admin. No mesmo dia o usuário disse que o TST "não apareceu" e pediu "como tipo de usuário" e "eu como admin quero ter acesso ao módulo como TST": a coluna virou a opção "TST" do Papel, e o admin passou a gravar na aba 6.
- **Tipos de apontamento: uma lista só para todas as obras** (`safety_types`, sem `work_id`). A equipe de TST é a mesma em todas as obras, e a planilha compara os tipos entre obras mês a mês (aba "Página15"). A lista nasce com os 16 tipos da "Página15"; o TST acrescenta, renomeia, desativa e reordena.
- **Consequência e probabilidade:** listas fixas, tiradas dos valores da planilha (`SAFETY_CONSEQUENCES` e `SAFETY_PROBABILITIES` em `src/domain/safety.ts`, e `check` no banco).
- **Local:** texto livre, com sugestões dos locais já usados na obra. A planilha tinha 490 grafias (ex.: "2 pavimento", "2° Pavimento", "terriu"), e não há cadastro de locais que sirva aos TSTs (áreas de vivência, canteiro, fachada).
- **Fora do snapshot e do `commit_planning`**, como a terminalidade: tabelas, API e leitura próprias. Sem a migração 0040, só a aba 6 para.

## Arquitetura

| Camada | Arquivo |
| --- | --- |
| Migração | `supabase/migrations/0040_safety.sql` |
| Tipos e contrato | `src/domain/safety.ts` |
| Regras dos comandos (puras) | `src/application/use-cases/safety-commands.ts`, com testes em `tests/safety-commands.test.ts` |
| Repositório | `src/infrastructure/repositories/supabase/safety-repository.ts` |
| API | `src/app/api/seguranca/route.ts` (GET), `commands/route.ts`, `upload-url/route.ts`, `campo/route.ts` e `tst/route.ts` |
| Cliente | `src/modules/seguranca/api.ts` (`useSafety`, `uploadSafetyPhoto`, `uploadPendingSafetyPhotos`) |
| Tela | `src/modules/seguranca/safety-overview.tsx`, `safety-view.ts` (testes em `tests/safety-view.test.ts`) e, desde 10/11/2026, `period.ts` (escalas e períodos do calendário; testes em `tests/safety-period.test.ts`) |
| Diálogos | `src/modules/seguranca/item-dialog.tsx`, `resolve-dialog.tsx`, `bulk-edit-dialog.tsx` e `types-dialog.tsx` |
| PDF | `src/modules/seguranca/print-dialog.tsx`, `print-options.ts` e `print-list.tsx`; página `src/app/imprimir/seguranca/[obraId]/page.tsx` |
| Modo de campo | `src/modules/seguranca/field-app.tsx`, `offline-store.ts` e `offline-model.ts`; página `src/app/campo/seguranca/page.tsx` |
| Importação | `src/application/use-cases/import-safety.ts` e `scripts/import-seguranca.ts`, com testes em `tests/safety-import.test.ts` |
| Rota da página | `src/app/(app)/obras/[obraId]/seguranca/page.tsx` |

Reaproveitado da aba 5, sem cópia: compressão das fotos (`compress-image.ts`), seletor e grade de fotos (`photo-input.tsx`), visualizador (`photo-viewer.tsx`) e roscas (`donut-chart.tsx`). Para o visualizador avisar foto vencida também à aba 6, `src/modules/terminalidade/api.ts` passou a exportar `subscribeExpiredPhoto`.

### Banco (0040)

- `profiles.tst boolean not null default false`.
- `safety_types`: lista global, nome único, `active` e `order_index`. A migração semeia 16 tipos com ids fixos (`sst-tipo-01` a `sst-tipo-16`); rodar de novo não duplica.
- `safety_items`: consequência e probabilidade só nas listas; `status = 'resolved'` anda junto com `corrected_on` preenchido; `origin` separa o lançado no sistema (`app`) do importado da planilha (`planilha`).
- `safety_photos`: fotos do apontamento (`issue`) e da correção (`correction`), em cascata a partir do apontamento.
- `work_id` com `on delete cascade` nas duas tabelas da obra: a exclusão de obra (`delete_work`, 0037) apaga a linha de `works` e leva os apontamentos junto, sem precisar reescrever a função. Os arquivos saem por `removeWorkFiles`, que passou a listar também o bucket `seguranca` (`WORK_BUCKETS` em `work-files.ts`).
- Bucket privado `seguranca`, só JPEG e até 2 MB, com caminhos `<obra>/<apontamento>/<foto>.jpg` e `-thumb.jpg` (`safetyPhotoPaths`).
- RLS ligada sem política e grants explícitos para `service_role`. Não reescreve o `commit_planning`.

### Quem grava

- **Servidor:** toda rota de gravação confere `canWriteSafety(profile)` (`profile.tst === true` ou `profile.role === 'admin'`) antes de qualquer coisa e responde 403 com "Só técnicos de segurança (TST) e administradores lançam e finalizam apontamentos." Vale para comandos, envio de foto e lista de tipos. Ler exige só a obra liberada no perfil.
- **Tela:** o GET devolve `canEdit` (a pessoa é TST ou admin) e `inspectors` (os TSTs com a obra liberada, por nome). A tela só esconde os botões; quem decide é o servidor.
- **Dar o papel TST:** o seletor "Papel" da grade chama `set_role` e `POST /api/seguranca/tst` `{ userId, enabled }`, só para admin ("Só administradores marcam quem é TST."), e recarrega o planejamento.

### Comandos e regras (`planSafetyCommand`)

Todos passam por `POST /api/seguranca/commands?workId=<obra aberta>`. O `workId` da URL é obrigatório: é a obra da resposta e, nos comandos de tipo (que não têm obra), a conferência de acesso. Comando de outra obra é recusado ("O comando é de outra obra. Recarregue a página."), e registro que sumiu dá 404.

- **Tipos** (`create_type`, `update_type`, `reorder_types`): nome aparado, até 80 caracteres, único sem diferença de acento e caixa, inclusive contra os desativados (a mensagem sugere reativar). Tipo não se apaga, só se desativa. O reordenar precisa citar todos os tipos, uma vez cada.
- **Apontamento** (`create_item`, `update_item`): id UUID vindo do navegador; tipo opcional, mas ativo (um desativado pode continuar num apontamento que já o tinha); consequência e probabilidade obrigatórias e das listas; descrição obrigatória, até 1000; local opcional, até 120; data do apontamento válida e não futura (hoje de São Paulo). Editar não muda situação nem origem, e a data não pode passar da data da correção.
- **Edição em lote** (`update_items`): tipo (`null` limpa), consequência, probabilidade e local, de 1 a 500 apontamentos da obra, com ao menos um campo a mudar.
- **Fotos** (`add_photo`, `delete_photo`): caminho fixo (`safetyPhotoPaths`), até 10 por apontamento, e a foto só entra no banco se os dois arquivos já estiverem no bucket. A última foto da correção de um finalizado só sai depois de reabrir.
- **Finalizar** (`resolve_item`): só aberto; data da correção entre a data do apontamento e hoje; exige ao menos uma foto da correção, **exceto na importação** (`importing: true`); "Como foi corrigido" opcional, até 1000.
- **Reabrir** (`reopen_item`): limpa data da correção, quem finalizou e "Como foi corrigido"; as fotos ficam. A coluna `resolution_note` nasceu na 0040, então o repositório grava o nulo direto, sem o cuidado que a aba 5 precisou depois da 0034.
- **Excluir** (`delete_item`): apaga a linha (fotos em cascata) e depois os arquivos.
- **Respostas HTTP:** 400 regra, 403 sem acesso ou sem permissão (nem TST nem admin), 404 registro sumiu, 409 conflito, 503 sem a 0040, 502 falha inesperada.
- **Gravação em lotes:** inserções de 500 linhas, exclusões de 100 ids, atualizações uma por linha (até 50 ao mesmo tempo). Uma gravação grande (a importação) não é atômica: se um lote falhar, os anteriores ficam; rodar a importação de novo completa sem duplicar.

## A tela (aba 6)

`SafetyOverview`, com a lógica pura em `safety-view.ts` e, desde 10/11/2026, a do período em `period.ts` (testadas).

Ordem da página desde 10/11/2026 (ver "10/11/2026 — Ajustes pedidos pela equipe de SST", abaixo): cabeçalho → barra do período → cartões → "Apontamentos" (situação, busca, filtros e lista) → "Gráficos por tipo, consequência e probabilidade" (recolhido) → "Apontamentos por tipo, mês a mês" (recolhido). A lista fica logo abaixo dos cartões porque é o que os TSTs mais usam.

- **Cabeçalho:** "Novo apontamento" e "Tipos de apontamento" (só TST e admin), "Usar no celular, sem sinal" e "Gerar PDF". Quem não grava vê o aviso de consulta com os TSTs da obra, ou como o admin dá o papel TST a alguém.
- **Período (06/11/2026; controle trocado em 10/11/2026):** no topo do painel, acima dos cartões, filtra pela data do apontamento. Desde 10/11/2026 é o controle do "Dashboard da obra" (aba 0): "Escala" com os botões Tudo, Semanal, Mensal, Trimestral, Anual e Personalizado, e "Período" com as setas ‹ › e a lista. "Tudo" é o padrão (sem limite de data). Os períodos são do calendário (semana de segunda a domingo, mês do dia 1º ao último, trimestre e ano do calendário), diferente das semanas inteiras da aba 0; o Personalizado mostra "Início" e "Término" (os dois dias inclusive; um lado vazio não limita). Detalhes e motivos na seção de 10/11/2026. O período faz parte de `SafetyFilters` (`from`/`to`, AAAA-MM-DD, e a escala em `scale`), então vale para os cartões, os gráficos, o quadro mês a mês, a lista, a contagem dos filtros e o PDF (`de` e `ate` na URL; o PDF escreve "apontados de … a …" na linha de filtros). "Limpar filtros" limpa tudo e volta o período para "Tudo". Como as roscas seguem a situação da lista, um período sem aberto (com a lista em Abertos) mostra no lugar delas "Os gráficos seguem a situação da lista: nenhum apontamento aberto nesta seleção." e o botão "Ver todos os N". O período não fica salvo nem vai na URL da tela (recarregar volta em "Tudo") e não existe no modo de campo. A data é sempre a do apontamento, não a da correção. *Histórico:* em 06/11/2026 o período era uma barra "Período · pela data do apontamento" com dois campos de data e "Limpar período" (pedido do usuário: "adicione filtros temporais [...] deixe data de apontamento como data filtrada [...] selecione data de início e término"); foi trocada em 10/11/2026 a pedido da equipe de SST.
- **Cartões (revistos em 10/11/2026):** "Total", "Abertos", "Média de dias para resolver" (só finalizados, uma casa decimal), "Abertos há mais de 7 dias" e "Risco de morte em aberto" (abertos com consequência "Morte", em vermelho quando há algum; a linha de baixo diz há quantos dias o mais antigo está aberto, ou, sem nenhum aberto, a média de dias dos finalizados com "Morte", ou "nenhum na seleção"; `summarizeDeathRisk` em `safety-view.ts`). Contam a seleção dos filtros e do período nas duas situações. O cartão "Finalizados" (com %) saiu em 10/11/2026; a contagem de finalizados segue no botão "Finalizados" da situação, acima da lista.
- **Filtros:** situação (abre em Abertos), tipo, consequência, probabilidade e local, cada um com várias escolhas e contagem, e busca sem acento na descrição, no local, no tipo e em "Como foi corrigido". O local junta grafias que só diferem em acento, caixa, espaço e "°"/"º"; a tabela mostra a grafia de cada linha, e filtros, grupos e roscas usam a mais frequente na obra.
- **Lista:** colunas da planilha, classificáveis (crescente → decrescente → padrão, vazios no fim); ordem padrão do mais recente para o mais antigo. Consequência em chip colorido (Morte vermelho, Severa laranja, Significativa âmbar, Leve verde, Nenhuma cinza, Autuação/Multa violeta), sempre com o texto. Selo "Planilha" no histórico importado. "Dias para resolver": "N dias" no finalizado; "há N dias" no aberto, em âmbar e em vermelho depois de 7 dias. 100 linhas por vez, com "Mostrar mais".
- **Ações do TST e do admin:** Finalizar, Reabrir e ✕ por linha, na coluna "Ações", que desde 10/11/2026 fica presa na borda direita da tabela (a tabela tem 1.400 px de largura e o botão ficava fora da tela); o "Finalizar" é verde, como no aplicativo de campo. Marcação e edição em lote (bloqueada acima de 500 marcados). Um 409 recarrega a lista e avisa.
- **"Gráficos por tipo, consequência e probabilidade" (recolhido desde 10/11/2026):** seção no fim da página, logo acima do quadro mês a mês, aberta pelo clique no título. As três roscas, no máximo 6 fatias cada (5 maiores + "Outros"). Cada uma ignora o próprio filtro; clicar na legenda liga ou desliga o valor no filtro da lista. O centro diz "apontamentos" (o `DonutRing` da aba 5 ganhou a propriedade `noun`).
- **"Apontamentos por tipo, mês a mês" (no fim da página e recolhido desde 10/11/2026):** aberto pelo clique no título; conteúdo e regras iguais. O comparativo da aba "Página15" da planilha. Os 4 últimos meses até o mês atual, pela data do apontamento, com a diferença do mês atual (em andamento) para o anterior ("(novo)" quando o anterior foi zero) e a linha GERAL. Segue os filtros, menos a situação. Com período (`monthWindow`), mostra do mês do início ao do término: término no futuro para no mês de hoje; só o término mostra os 4 meses até ele; mais de 12 meses mostra os 12 últimos e avisa; mês cortado pelo período conta só os dias de dentro; um mês só (a escala Mensal, por exemplo) esconde a coluna "Diferença".
- **Diálogos:**
  - *Novo/Editar apontamento:* tipo obrigatório no apontamento novo ("Sem tipo" só aparece se o apontamento já não tinha tipo), consequência, probabilidade, descrição, local com sugestões, data e fotos (opcionais, como na aba 5; uma vaga fica reservada para a correção). "Salvar e lançar outro" mantém tipo, local e data e limpa descrição e risco, porque cada apontamento tem a própria avaliação. O último tipo e local ficam lembrados no navegador, por obra. Se uma foto falha depois de salvar, "Tentar de novo" reenvia só o que faltou. A leitura mostra situação, dias para resolver, "Apontado por" (ou "Planilha SST - Controle geral") e "Como foi corrigido". Desde 10/11/2026, no apontamento aberto, o rodapé tem o botão verde "Finalizar apontamento" (só TST e admin), que abre o diálogo de finalizar.
  - *Finalizar apontamento:* foto da correção (salvo se já houver), data da correção e "Como foi corrigido". Abre pelo "Finalizar" da linha ou, desde 10/11/2026, pelo "Finalizar apontamento" do diálogo do apontamento.
  - *Edição em lote:* tipo, consequência, probabilidade e local, todos em "Manter como está" com o valor atual embaixo.
  - *Tipos de apontamento:* a lista única (o diálogo avisa), com uso nesta obra, incluir, renomear, desativar/reativar e subir/descer.
- **Textos reaproveitados da aba 5:** o seletor de fotos (`noun`) e o visualizador (`issueLabel`) ganharam propriedades opcionais para dizer "apontamento" e "Apontamento"; a aba 5 continua igual.
- **Tour:** `src/modules/tour/pages/seguranca.ts` (14 passos), ligado em `tours.ts`. Desde 10/11/2026 os passos seguem a ordem nova da página: depois dos botões do cabeçalho, período → indicadores → filtros → lista → ações da linha → lote → gráficos → mês a mês. Na grade de usuários, o passo do "Papel" explica o TST.

## PDF

"Gerar PDF" abre `/imprimir/seguranca/<obra>` em outra aba, com os filtros e a ordem da lista na URL (tipo, consequência, probabilidade e local repetidos; `busca`; `de` e `ate` do período, conferidos como data válida; `quebra=1` para cada grupo em folha nova). Com o período em "Tudo", `de` e `ate` não vão; numa escala do calendário, vão o primeiro e o último dia do período.

- **Janela:** agrupar por tipo, local ou consequência (abre em tipo; em local ou consequência quando a lista está filtrada só por eles), com ou sem fotos, "Cada <grupo> começa em folha nova" (**desmarcado por padrão desde 10/11/2026**: os grupos seguem um depois do outro na mesma folha, separados pela faixa azul do título; marcado, um grupo por folha; na URL, `quebra=1` liga as quebras e sem ele não há quebra; antes era o contrário, ligado por padrão e `quebra=0` desligava), e a escolha dos grupos (busca, "Selecionar tudo", "Limpar"; vai na URL só o que entra).
- **Primeira folha:** logos ATR e Takt, "VISTORIA DE SEGURANÇA DO TRABALHO <OBRA>", agrupamento, situação, data, filtros, grupos escolhidos e ordem; cartões (as duas situações: total, abertos, finalizados, % e média de dias; só abertos: total, abertos há mais de 7 dias, média de dias em aberto, locais com aberto; só finalizados: total, média de dias, finalizados em até 7 dias, locais) e as três roscas.
- **Grupos:** tipos na ordem do cadastro e "Sem tipo" no fim; locais em ordem alfabética e "Sem local" no fim; consequências da mais grave para a mais leve. Colunas: Nº (contínuo), Tipo, Consequência, Probabilidade, Descrição, Local, Data do apontamento, Situação ("Aberto há N dias" ou "Finalizado em DD/MM/AAAA · N dias", com "Correção: …"), Foto e Foto da correção (até 2 miniaturas e "+N"). A coluna do agrupamento sai da tabela.
- **Impressão:** espera as fotos (até 20 s), A4 paisagem, arquivo "Segurança <CÓDIGO> - Por <agrupamento> - DD-MM-AAAA". Dados de `GET /api/seguranca/campo?workId=`.

## Modo de campo (celular, sem sinal)

`/campo/seguranca` (`FieldSafety`), casca estática como a da aba 5, com `?obra=` abrindo a obra direto (lido no navegador, porque `force-static` deixa `useSearchParams` vazio). Usa o mesmo service worker (`public/campo-sw.js`): a lista de cascas ganhou `/campo/seguranca`, a versão do cache ficou em v1 para não apagar a casca da terminalidade já guardada nos celulares, e uma tela de campo conhecida que não está no cache não cai mais na casca da terminalidade.

- **Pacote:** `GET /api/seguranca/campo` (obras sem `workId`; a obra com `workId`). Miniaturas só dos abertos (até 300, os mais recentes). Com sinal e pacote com mais de 45 minutos, baixa de novo em silêncio, uma vez por obra.
- **IndexedDB próprio:** `obra360-seguranca`.
- **Só TST e admin lançam.** O aparelho recusa antes de guardar, com a mesma mensagem; os demais veem a lista, os filtros, as fotos e o aviso com os TSTs da obra.
- **No campo:** lançar apontamento (**com foto obrigatória no campo**, embora o servidor não exija), juntar fotos, finalizar (data, "Como foi corrigido" e foto da correção, se ainda não houver) e reabrir. Editar, editar em lote, excluir e a lista de tipos ficam no computador.
- **Lista:** abre em Abertos, 25 por vez; filtros de tipo, consequência e local num painel recolhível; busca. Filtro, ordem e sugestões de local vêm de `safety-view.ts`, como na aba 6.
- **Envio:** como o da aba 5 (ao abrir, ao voltar o sinal, depois de cada lançamento e pelo botão; recusas com "Descartar"; "Entrar de novo" sem perder nada e voltando à obra aberta). Diferenças: as fotos pedem a URL de envio com o id de foto já guardado na fila (o `uploadSafetyPhoto` sorteia um id a cada chamada, e uma resposta perdida duplicaria a foto); 408, 409 e 429 são tentados de novo em vez de recusados.
- **Vaga para a correção:** enquanto o apontamento está aberto, o campo aceita no máximo 9 fotos do apontamento e reserva a 10ª para a foto da correção, como o computador. A primeira versão do campo não reservava, e um apontamento com 10 fotos não podia ser finalizado em lugar nenhum (achado pelo agente do manual, corrigido em 05/11/2026).
- **Sem tour** no modo de campo.

## Na comparação entre obras: Dashboard geral (06/11/2026)

Pedido do usuário: "adicione no dashboard geral os dados de segurança do trabalho também". Modelo aprovado no mesmo dia, com 12 regras; a especificação, a arquitetura, as regras de cálculo, a validação e as pendências estão em [Dashboard](dashboard.md#segurança-do-trabalho-no-dashboard-geral-06112026). Em resumo:

- **Onde:** quadro 6 "Segurança do trabalho" depois da terminalidade, chave "Segurança" em "Quadros" (`quadros=seguranca`), cartão "Apontamentos de segurança em aberto" (o 7º do topo), uma frase no resumo, colunas "Em aberto", "Feitos / finaliz." e "> 7 dias" no comparativo, e a folha 5 do PDF. Só no geral: a aba 0 continua sem o quadro.
- **Quem vê:** todos com a obra liberada, como a aba 6.
- **Datas:** período em semanas inteiras, como o resto do geral (da segunda-feira inicial ao sábado final). Feitos pela data do apontamento; finalizados pela data de correção; em aberto e abertos há mais de 7 dias como retrato no sábado final (os dias contam até ele, ou até hoje no período em andamento). Diferente do filtro de período da aba 6, que desde 10/11/2026 usa períodos do calendário (semana de segunda a domingo, mês do dia 1º ao último) ou datas exatas no Personalizado.
- **Histórico da planilha** conta igual ao lançado no sistema.
- **Risco:** os feitos no período por consequência; graves = Morte + Severa. **Tipos:** até 6 somando as obras, pela lista única.
- **Empreiteiro:** a vistoria não registra empresa; com empreiteiro escolhido no geral, o quadro diz "sem recorte de empreiteiro". O estado da obra não muda com a segurança.
- **Dados:** a leitura única do geral (`GET /api/dashboard/obras`) traz a lista de tipos e os apontamentos de todas as obras, só com as colunas do cálculo (sem descrição, local nem fotos), por `loadSafetyOverview` no repositório da aba 6; nenhuma migração nova (usa a 0040). Falha deixa só o quadro de segurança indisponível.

## 10/11/2026 — Ajustes pedidos pela equipe de SST

Origem: o documento "Ajustes portal de apontamentos", escrito pela equipe de SST (TST Renata), com 7 itens. Os 7 foram implementados em 10/11/2026, sem migração nova e sem rota de API nova. O modo de campo (`/campo/seguranca`) não mudou.

### O que mudou (implementado)

1. **Cartões ("Indicadores"):** o cartão "Finalizados" saiu. Ficaram "Total", "Abertos", "Média de dias para resolver", "Abertos há mais de 7 dias" e o novo **"Risco de morte em aberto"**: conta os abertos com "Risco: consequência" igual a "Morte", dentro dos filtros e do período; fica vermelho quando passa de zero. A linha de baixo diz há quantos dias está aberto o mais antigo deles ("aberto há N dias" ou "aberto hoje" com um só; "o mais antigo aberto há N dias" com mais). Sem nenhum aberto, mostra a média de dias que os finalizados com "Morte" levaram para ser resolvidos ("nenhum aberto · N dias para resolver, em média") ou "nenhum na seleção". A quantidade de finalizados continua no botão "Finalizados" da situação, acima da lista.
2. **"Apontamentos por tipo, mês a mês"** foi para o **fim da página, recolhido**: o clique no título abre e fecha. Conteúdo e regras iguais.
3. **Período:** a barra com os dois campos de data deu lugar ao controle do "Dashboard da obra" (aba 0): "Escala" com os botões **Tudo | Semanal | Mensal | Trimestral | Anual | Personalizado** e "Período" com as setas ‹ › e a lista. Diferenças para a aba 0, de propósito:
   - **"Tudo"**, a mais, é o **padrão** e não limita a data: a lista de abertos tem de continuar mostrando os abertos de qualquer data.
   - Os períodos são **do calendário**, não de semanas inteiras: Semanal = segunda a domingo; Mensal = do dia 1º ao último dia do mês; Trimestral = o trimestre do calendário; Anual = o ano do calendário. A aba 0 usa semanas inteiras de segunda a sábado, cada semana no mês da sua segunda-feira.
   - A lista do "Período" vai do mais recente ao mais antigo, do período do apontamento mais antigo da obra até hoje, com o atual marcado "(atual)". Rótulos: semana "26/10 a 01/11/2026", mês "outubro de 2026", trimestre "4º trimestre de 2026 (out–dez)", ano "2026". As setas andam um período e ficam desabilitadas nas pontas.
   - "Personalizado" mostra os campos "Início" e "Término" (um lado vazio não limita).
   - Trocar a escala mantém o lugar: abre o período da nova escala que contém o fim do período de antes, ou hoje.
   - "Limpar filtros" volta o período para "Tudo".
   - O período continua valendo para cartões, gráficos, quadro mês a mês, lista e PDF, pela "Data do apontamento", e continua fora da URL da tela.
4. **Roscas:** "Por tipo", "Por consequência" e "Por probabilidade" ficam numa seção recolhida no fim da página, **"Gráficos por tipo, consequência e probabilidade"** (logo acima da seção do quadro mês a mês), aberta pelo clique no título. Clicar num item da legenda continua ligando e desligando aquele filtro na lista.
5. **PDF:** a opção "Cada <grupo> começa em folha nova" vem **desmarcada**. Os grupos (por exemplo, cada pavimento ao agrupar por local) ficam separados pela faixa azul do título, mas seguem um depois do outro na mesma folha, para poupar papel. Marcada, volta a um grupo por folha. Na URL de impressão, `quebra=1` liga as quebras; sem ele, não há quebra. Antes, a quebra vinha ligada e `quebra=0` desligava.
6. **Ordem da página:** cabeçalho → barra do período → cartões → "Apontamentos" (situação, busca, filtros e lista) → "Gráficos…" recolhido → "Apontamentos por tipo, mês a mês" recolhido.
7. **Finalizar no computador, como no aplicativo de campo:**
   - O "Finalizar" de cada linha aberta ficou **verde**, como no aplicativo, e a coluna "Ações" ficou **presa na borda direita** da tabela, visível sem rolar de lado. A tabela tem 1.400 px de largura, e o botão ficava fora da tela.
   - A janela do apontamento (aberta pelo clique na linha) ganhou, no rodapé, o botão verde **"Finalizar apontamento"** nos abertos, só para TST e admin. Ele abre a mesma janela "Finalizar" (foto da correção, data da correção e "Como foi corrigido", opcional). "Reabrir" e "✕" continuam na linha.

### Decisões

- **Cartão de risco de morte (é uma interpretação):** o pedido dizia "Incluir dias para risco de morte e tirar os finalizados". Foi lido assim: um cartão com quantos apontamentos de "Morte" estão em aberto e, embaixo, os dias do mais antigo (ou, sem aberto, a média de dias dos finalizados com "Morte"); e o cartão "Finalizados" sai. Se a equipe quis dizer outra coisa (por exemplo, os dias médios de todos os de "Morte", ou uma coluna na lista), o usuário pode ajustar.
- **"Tudo" como padrão:** com um mês já escolhido ao abrir, um aberto de meses atrás sumiria da lista, que é o que os TSTs mais usam.
- **Períodos do calendário em vez das semanas inteiras da aba 0:** a lista, o quadro mês a mês e o PDF contam pela data de calendário do apontamento, então "outubro de 2026" tem de ser de 01/10 a 31/10. O Dashboard geral continua em semanas inteiras (ver "Na comparação entre obras").
- **Lista logo abaixo dos cartões**, e gráficos e quadro recolhidos no fim: a lista de abertos é a ferramenta do dia a dia; os gráficos e o comparativo são consulta.
- **As seções recolhidas abrem sempre fechadas** (não ficam lembradas no navegador), e o conteúdo só é montado quando abertas.
- **PDF sem quebra por padrão**, para poupar papel; a faixa azul do título continua separando os grupos.
- **"Finalizar" nos dois lugares:** na linha (verde, na coluna presa à direita) e no rodapé da janela do apontamento. "Reabrir" e "✕" ficam só na linha.
- O período continua **fora da URL** da tela e não existe no modo de campo, como antes.

### Arquivos

| O quê | Arquivo |
| --- | --- |
| Escalas e períodos do calendário (puros): chaves, rótulos, lista com o atual, setas e troca de escala | `src/modules/seguranca/period.ts` (novo), com testes em `tests/safety-period.test.ts` (novo) |
| `scale` em `SafetyFilters` e `summarizeDeathRisk` (o cartão novo) | `src/modules/seguranca/safety-view.ts` |
| Ordem da página, cartões, seletor de período, seções recolhidas e coluna "Ações" presa à direita | `src/modules/seguranca/safety-overview.tsx` |
| "Finalizar apontamento" no rodapé da janela | `src/modules/seguranca/item-dialog.tsx` |
| Quebra de folha desligada por padrão e `quebra=1` | `src/modules/seguranca/print-dialog.tsx` e `print-options.ts`, com testes em `tests/safety-print-options.test.ts` |
| Tour na ordem nova | `src/modules/tour/pages/seguranca.ts` |
| Manual da Claudia | `src/modules/agente/manual/seguranca.ts` |

### Validação

- Validação: testes unitários e CI pela sequência do ci.yml; conferência visual em navegador simulado.
- O manual da Claudia passa em `tests/agent-manual.test.ts` (índice com cerca de 13,9 mil caracteres, dentro do teto de 14 mil) e o tour em `tests/tour-targets.test.ts`.

### Pendências

- Pendências: uso real logado pelos TSTs.
- Confirmar com a equipe de SST a leitura do cartão "Risco de morte em aberto" (ver Decisões).

## Importação da planilha

1. **Exportar a aba SST em CSV:** `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=0` (o link aberto basta). O .xlsx **não sai**: o Google responde 400 à exportação da aba com cerca de 7 mil imagens nas células, inclusive com intervalo pequeno.
2. **Simular:** `node --import tsx scripts/import-seguranca.ts <sst.csv> --actor <id do perfil admin> --env-file ~/Applications/App-Takt/.env.local`. Sem `--env-file` nem variáveis no ambiente o script para: o `.env.local` deste repositório aponta para o Supabase antigo. Sem a 0040, a simulação segue com os 16 tipos semeados e avisa.
3. **Gravar:** o mesmo comando com `--apply`, que se recusa a gravar sem a 0040 ou com erro de linha.

Regras (`src/application/use-cases/import-safety.ts`, testadas em `tests/safety-import.test.ts`):

- Cada linha passa por `planSafetyCommand` com `importing: true`: origem `planilha` e finalização sem foto da correção. Uma mutação para os tipos novos e uma por obra; o apontamento corrigido já nasce finalizado.
- **Obras** pelo nome ou código, sem acento e caixa; `--obras` força o destino e `--only` restringe. Obra sem destino é pulada: "My Sunset" e "Amariles" aparecem como "fora por decisão".
- **Tipos:** casam com a lista pela chave sem acento, caixa e pontuação ("SPIQ (Linha de vida)" → "SPIQ – Linha de Vida"), mais sinônimos explícitos (`SAFETY_TYPE_SYNONYMS`): escadas e bancadas → "Escada / Bancadas"; limpeza/organização → "Organização / Limpeza"; "Projeto"/"Projetos SST" → "Projeto SST"; as duas grafias de condutores → "Condutores elétricos"; e os erros "Rico de queda" → "Risco de queda" e "Produtos inflamavel" → "Produtos inflamáveis" (decididos em 05/11/2026 antes da primeira gravação). O resto vira tipo novo, ativo; o TST desativa ou reclassifica na tela.
- **Probabilidade "Nenhum"** (uma linha) vira "Rara", com aviso.
- **Local:** "2 pavimento", "02 pavimento", "2° Pavimento", "2 andar" e "2°" → "2° Pavimento"; térreo/terreo/terriu → "Térreo"; ático → "Ático"; subsolo e mezanino com maiúscula; o resto aparado e, se todo minúsculo, com a primeira letra maiúscula. Grafias que só diferem em acento ou caixa se unificam por obra (vale a já usada no sistema, senão a mais frequente).
- **Datas:** DD/MM/AAAA. Correção sem ano ("08/05") ganha o ano do apontamento (ou o seguinte, se ficaria antes); ano com dois dígitos vira 20AA; correção antes do apontamento fica aberta. Tudo com aviso.
- **Texto nas colunas de foto:** na "Foto do apontamento" vai para o fim da descrição (" — Obs.: …", sem "?" e "-" soltos); na "Foto da correção" vira "Como foi corrigido" quando finalizado. Uma data solta na coluna é ignorada, com aviso.
- **Idempotência:** o id do apontamento sai das grafias cruas de obra, tipo, descrição e local, da data e da ocorrência (as ~95 linhas idênticas viram apontamentos separados). Rodar de novo só acrescenta o que é novo e nunca sobrescreve; um apontamento finalizado no sistema continua finalizado. Tipos novos e fotos também têm ids estáveis.
- **Fotos (`--photos`):** `{ "<linha da planilha>": { "issue": [url], "correction": [url] } }`. Cada endereço é baixado, comprimido com o `sharp` na escada do navegador e enviado ao bucket, e só então registrado. Implementado e testado com dados falsos; **ainda não usado** (ver Pendências).

### Importação em produção (05/11/2026)

O usuário autorizou ("faça tudo você e deixe commitado e gitpushado"). A 0040 foi aplicada no `takt-hub` por conexão direta ao banco (pooler `aws-0-sa-east-1`), numa transação, depois de ler o estado (nenhuma tabela `safety_*`, sem a coluna `tst`). Conferidos depois: as 3 tabelas, a coluna `profiles.tst`, o bucket `seguranca` privado (JPEG até 2 MB), os 16 tipos semeados, os grants para `service_role` e a leitura pela API REST (200 nas três tabelas e em `profiles.tst`). Em seguida, a importação com `--apply`, ator Bruno Lacerda Santos (admin), com o CSV baixado na hora:

| Obra | Apontamentos | Finalizados | Abertos |
| --- | --- | --- | --- |
| Atmos (ATM) | 413 | 395 | 18 |
| Blentt (BLT) | 646 | 640 | 6 |
| Brizz (BRZ) | 72 | 71 | 1 |
| Essenza (ESZ) | 1.253 | 1.245 | 8 |
| Mozine (MZN) | 818 | 814 | 4 |
| Tauá (TAU) | 59 | 59 | 0 |
| **Total** | **3.261** | **3.224** | **37** |

- 3.552 linhas com dados; Amariles (49) e My Sunset (242) fora por decisão. Nenhum erro de linha; 323 notas viraram "Como foi corrigido". Todos os apontamentos têm tipo e origem `planilha`; datas de 11/03/2025 a 05/11/2026.
- Conferência no banco: as contagens por obra batem com a tabela; a lista de tipos ficou com 31 (16 semeados + 15 novos), todos ativos. Rodar a simulação de novo deu "novos 0 | já no sistema 3.261".
- Entre a primeira simulação e a gravação, a planilha ganhou duas finalizações (Blentt e Essenza): por isso 3.224 finalizados, e não 3.222.
- 15 tipos novos (eram 17 antes das junções decididas acima): Proteções coletivas (82), Projeto SST (3), Balancins (9), Poço elevador (4), Abertura de piso (4), Andaime fachadeiro / tubular (4), Proteção de segurança (2), Plataforma de trabalho (2), Fluxo de pessoas (2) e, com uma linha cada, Condutores elétricos, Obstrução de passagem, Acesso seguro, Risco de queda, Produtos inflamáveis e Carpintaria.
- Locais distintos: 471 como digitados, 353 depois da normalização.
- 13 avisos: 2 correções sem ano, 2 anos com dois dígitos, 8 datas soltas na coluna da foto da correção e 1 "Nenhum".
- O e-mail `bruno@taktengenharia.com.br` existe no login mas não tem perfil no Obra 360; a simulação usou o id do perfil admin.

## Validação (05/11/2026)

- **Testes:** 26 das regras (`safety-commands`), 15 da tela (`safety-view`), 5 das opções do PDF, 11 do modo de campo e 11 da importação. A suíte inteira passa (1.091 de 1.091).
- `tests/delete-work.test.ts` semeia `safety_items` e `safety_photos` nas duas obras e confirma que a exclusão leva os da obra excluída e não toca os da outra.
- `scripts/validate-bootstrap-sql.mjs`: 55 tabelas, 16 tipos semeados, risco fora da lista recusado, finalizado sem data recusado, fotos em cascata, coluna `tst`, fora do snapshot; `conferencia.sql` com 82 de 82 itens (as 3 tabelas, a coluna `profiles.tst` e o bucket `seguranca`). Bootstrap regerado com 40 migrações.
- `npm run validate:migrations`, typecheck, ESLint (0 erros), Prettier, `npm run build` (as 8 rotas novas) e o teste de fumaça (8 de 8).
- **PDF no navegador:** os componentes reais, empacotados numa página de rascunho com 26 apontamentos simulados e fotos, nas três variantes (por tipo; abertos por local sem quebra; finalizados por consequência sem fotos e com grupos escolhidos): sem erro no console, impressão só depois das fotos.
- **Navegador, com dados simulados e sem banco** (`next dev` com perfil local de teste e as APIs respondidas pelo Playwright com as regras reais; 150 apontamentos, 10 abertos, 118 da planilha, 221 fotos geradas), em 1440×900 e 390×844:
  - TST: cartões, roscas ("apontamentos" no centro), quadro mês a mês, filtros de várias escolhas, legenda que filtra, classificação, "Mostrar mais", selo "Planilha"; lançar com foto, "Salvar e lançar outro", editar, editar em lote, tipos (repetido recusado, incluir, renomear, reordenar, desativar), finalizar, reabrir, excluir e o visualizador de fotos.
  - Quem não é TST: aviso com os nomes dos TSTs, nenhum botão de gravar, apontamento só para leitura.
  - PDF: janela e página de impressão (cartões, roscas, grupos, fotos, logos, título), com um PDF de 9 folhas gerado pelo Chromium.
  - Modo de campo: pacote, lista, filtros, lançamento com fotos (a regra das 9 fotos com a 10ª reservada para a correção), fila sem rede subindo sozinha quando a rede volta, e o aviso de consulta.
  - Sem erro nem aviso no console vindo destes componentes.
  - Corrigidos no caminho: a página rolava 275 px de lado no computador (textos só para leitor de tela escapavam do painel da tabela); no celular, o painel das roscas passava da borda e dois filtros ("Risco: consequência" e "Local") abriam cortados (ganharam alinhamento pela direita); no campo, a mensagem do limite dizia 10 fotos em vez de 9.
- **Correção de passagem nas duas abas:** a rota de envio de foto conferia o limite de 10 antes de "Esta foto já foi registrada". No modo de campo, se a resposta da 10ª foto se perdesse, a nova tentativa ouvia o limite e travava como recusada. A ordem foi invertida em `api/seguranca/upload-url` e em `api/terminalidade/upload-url`.

## Manual da Claudia

`src/modules/agente/manual/seguranca.ts`, com 8 seções da tela `seguranca` (visão geral e quem pode o quê, lançar e editar, finalizar/reabrir/excluir, indicadores e filtros, tipos e lote, PDF, modo de campo e perguntas frequentes), registradas em `index.ts` com o rótulo "Aba 6 · Segurança do trabalho". O índice ficou com cerca de 13.700 caracteres, dentro do teto de 14.000. Em 10/11/2026 o manual foi revisto com os ajustes da equipe de SST: a ordem da tela (seção nova na visão geral), o período com escala e setas, os cartões com "Risco de morte em aberto", os gráficos e o quadro mês a mês recolhidos, o PDF sem folha nova por padrão, o "Finalizar" verde na coluna presa e na janela do apontamento, e duas perguntas frequentes ("Cadê o cartão Finalizados…" e "Não acho o botão Finalizar"); o índice passou a cerca de 13.850 caracteres. Na mesma revisão saiu do manual do modo de campo a frase de que o campo não reserva vaga para a foto da correção: ele reserva desde 05/11/2026 (ver "Vaga para a correção"). Também foram atualizados: a coluna TST em `acesso-configuracoes.ts` (grade de usuários e navegação com 6 abas) e a visão geral em `geral.ts` (seis abas e a aba 6 aberta para consulta).

Divergências achadas ao escrever o manual, deixadas como estão de propósito:

- Foto do apontamento: opcional no computador, obrigatória no modo de campo. O servidor não exige.
- Tipo: obrigatório nas telas ao criar, opcional no servidor (o histórico pode não ter).
- Fotos da correção não têm botão de excluir, como na aba 5; por isso a recusa "Reabra o apontamento antes de apagar a última foto da correção." não aparece pela tela.
- Edição em lote limpa o tipo, mas só troca o local (não deixa vazio).
- Modo de campo: sem filtro de probabilidade, uma escolha por filtro e sem classificação; "Reabrir" sem confirmação. A marca de TST vai junto com o pacote baixado: quem acabou de virar TST precisa baixar a obra de novo para ver os botões, e quem perdeu a marca continua guardando no aparelho até o servidor recusar no envio.

## Pendências

- **Planilha e sistema ao mesmo tempo:** enquanto os TSTs lançarem nas duas, rodar a importação de novo traz só as linhas novas e as finalizações novas da planilha; o que for editado no sistema não volta para a planilha, e uma linha editada na planilha depois da importação (descrição, local, tipo ou data) vira apontamento novo.
- **Fotos da planilha:** os endereços das imagens só saem pela API do Google Sheets (precisa de uma chave de API ou conta de serviço) ou pela planilha publicada na web. Com eles, o `--photos` anexa as fotos aos apontamentos já importados.
- **Dar o papel TST** aos técnicos em Configurações → Usuários e liberar para eles as obras.
- **Não testado:** a aba logada em produção, o envio real de fotos ao bucket, o modo de campo num celular de verdade (e num build sem rede) e a câmera real.
- **Resposta grande:** cada comando devolve a obra inteira com as URLs de todas as fotos. Com 1.200 apontamentos isso pesa no dado móvel do campo; uma resposta curta fica como melhoria.
- **Achados no navegador, não corrigidos:** no modo de campo, com alterações na fila, a faixa amarela aumenta o cabeçalho e a barra de situação fica meio escondida embaixo dele ao rolar (o modo de campo da aba 5 tem o mesmo código); no diálogo, a mensagem "Escolha o tipo de apontamento." continua na tela depois de escolher o tipo, até salvar de novo (como na aba 5); na edição em lote, "Aplicar" desabilitado com "Trocar por…" e local vazio não diz por quê; campos só de leitura não têm aparência de desabilitados.
- **Herdado da aba 5:** arquivo de envio abandonado vira órfão no bucket; sem trava de edição simultânea (vale a última gravação).
- **Dashboard:** o quadro da aba 6 no **Dashboard geral** foi implementado em 06/11/2026 (ver "Na comparação entre obras: Dashboard geral (06/11/2026)", acima, e [Dashboard](dashboard.md#segurança-do-trabalho-no-dashboard-geral-06112026)). A **aba 0** de cada obra continua **sem** o quadro de segurança: é a próxima etapa, se o usuário pedir (regra 2 do modelo de 06/11/2026).
- **Período, não testado logado:** o seletor de 10/11/2026 (escala e período, como na aba 0) foi conferido por testes e em navegador simulado, sem tela logada em produção. Guardar o período escolhido (no navegador ou na URL) e atalhos como "últimos 3 meses" ficaram de fora (não pedidos).
- **Ajustes de 10/11/2026:** falta o uso real logado pelos TSTs e confirmar com a equipe de SST a leitura do cartão "Risco de morte em aberto" (ver "10/11/2026 — Ajustes pedidos pela equipe de SST").

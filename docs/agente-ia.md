# Agente de IA

Este documento registra a continuidade entre os modelos de IA que trabalham no repositório, no que toca ao agente de IA dentro do sistema. A cada alteração, atualizar aqui: comportamento entregue, decisões, arquivos, migração, validação e pendências. Não descrever intenção como funcionalidade pronta. O resumo fica no `README.md`, seção "Agente de IA".

Os trechos marcados **(conferir no código)** descrevem arquivos que ainda estavam sendo escritos por outra sessão quando este documento foi redigido (27/10/2026) — o painel `agent-panel.tsx` e os três arquivos de teste — e foram documentados pelo contrato combinado, não pela leitura do código. Quem passar por eles deve conferir e tirar a marca. O restante foi descrito a partir do código.

## Para que serve

O agente lê os três níveis do planejamento de uma obra — longo prazo (plano macro, Linha de Balanço e vagões), médio prazo (plano do mês) e curto prazo (planilha semanal) — e aponta o que não bate entre eles. Os três níveis são planilhas independentes que não conversam (ver `docs/planejamento-tres-niveis.md`); o que só um sistema faz é levar informação de um nível ao outro, e o agente é mais um jeito de fazer isso.

Ele tem três partes:

- um **radar determinístico**: regras fixas sobre os dados da obra, que funcionam sem chave da API e sem custo;
- uma **leitura** da obra, escrita pelo modelo da Anthropic sobre o dossiê que o radar produz;
- uma **conversa**: perguntas sobre a obra e pedidos de edição da planilha da semana, que viram propostas aplicadas pela própria tela.

Três limites valem em tudo: o modelo **nunca grava**; o agente lê só os níveis que a pessoa pode abrir; e o custo é contado por chamada, com teto mensal.

## O que o usuário pediu (27/10/2026)

- Iniciar "a implantação de agentes de IA ao sistema".
- Um agente com **nome engraçado ligado ao planejamento**, com propostas para ele escolher. "Vagner" (vagão + nome de gente) foi o nome de trabalho; ele não gostou e, ainda em 27/10/2026, escolheu **Claudia, "sua assistente de planejamento"**. O nome, a tagline e a persona (no feminino) estão em `src/modules/agente/agent-identity.ts`.
- O agente deve **correlacionar curto, médio e longo prazo** e trazer insights.
- Deve ser uma **janela de chat** em que a pessoa pede edições do planejamento. Exemplos dele: "as tarefas X, Y e Z do planejamento de médio prazo não estão na semana atual"; "as tarefas da semana passada não feitas não estão na semana atual".
- Ele tem **US$ 100/mês de crédito** na Anthropic, e o uso do agente **não pode passar de US$ 20/mês com seis obras** ao mesmo tempo.
- Gravou no `.env.local` a chave como `API_ANTHROPIC` e o modelo como `MODEL=SONNET5.5`.
- Pediu uma **tela de administração** em que os admins veem quanto cada usuário consumiu de API, cortam o acesso e definem limites mensais.

## O que foi entregue

| Camada | Arquivo |
| --- | --- |
| Dossiê e radar (puro) | `src/domain/agent-briefing.ts`, testes em `tests/agent-briefing.test.ts` (conferir no código) |
| Custo, teto e configuração (puro) | `src/domain/agent-cost.ts`, testes em `tests/agent-cost.test.ts` (conferir no código) |
| Ferramentas do chat (puro) | `src/application/use-cases/agent-tools.ts`, testes em `tests/agent-tools.test.ts` (conferir no código) |
| Identidade | `src/modules/agente/agent-identity.ts` |
| Livro-razão e leitura guardada | `src/infrastructure/agent/ledger.ts` |
| Chamada ao modelo | `src/infrastructure/agent/chat.ts` |
| API do agente | `src/app/api/agente/route.ts` (GET e POST) |
| API do admin | `src/app/api/admin/agente/route.ts` (GET) e `src/app/api/admin/agente/[userId]/route.ts` (PUT) |
| Painel na obra | `src/modules/agente/agent-panel.tsx` (`AgentButton` e o painel) (conferir no código) |
| Tela do admin | `src/app/(app)/configuracoes/agente/page.tsx` e `src/modules/agente/agent-admin.tsx` |
| Tour | passo global `AGENT_STEP` em `src/modules/tour/tours.ts`; `src/modules/tour/pages/agente-admin.ts` |
| Migração | `supabase/migrations/0035_agent.sql`, registrada em `src/infrastructure/repositories/supabase/migrations.ts` como `0035_agent` |
| Ambiente | `.env.example` (bloco "Agente de IA") |

### Dossiê determinístico e radar

`buildBriefing` (`src/domain/agent-briefing.ts`) recebe o `PlanningData` da obra, o documento do plano de longo prazo, a data de hoje, a semana 1 da obra (configurações; sem ela, a primeira semana com linha) e a lista de **níveis que a pessoa pode ler**. Devolve o `AgentBriefing`: os resumos por nível, os achados, o texto que vai para o modelo e o `hash` desse texto.

**Resumos por nível** (`LongTermSummary`, `MediumTermSummary`, `ShortTermSummary`):

- **Longo prazo:** avanço físico medido contra o previsto para hoje (o previsto assume avanço linear de cada serviço, a mesma aproximação da curva S), data da última medição, serviços atrasados (previsto menos medido, em pontos), serviços adiantados, deslocamento do término contra a linha de base, vagões vencidos sem terminalidade e restrições vencidas.
- **Médio prazo:** o plano do mês vivo (sem `baselineOf` e sem `frozenAt`, o de mês mais recente), tarefas folha, comparação com a última linha de base congelada (`baselineVariance`), tarefas vencidas sem concluir, tarefas abaixo do alvo temporal (`targetPercent`), tarefas que vencem em até 14 dias, vínculos desrespeitados e prazos finais estourados (`analyzeSchedule`), e equipes sobrecarregadas nas próximas 4 semanas (`weeklyTeamLoad`).
- **Curto prazo:** PPC da semana atual e das últimas 8 semanas fechadas, média das últimas 4, tendência (última semana 10 pontos acima ou abaixo da média das 3 anteriores: "subindo", "caindo", "estável"), Pareto de causas na janela, linhas que repetem a falha (mesmo nome e empresa com Não em duas ou mais semanas), empreiteiros com PPC mais baixo (só quem tem ao menos 5 linhas na janela), linhas de semanas fechadas sem apontamento e **"Não" da semana anterior sem linha de mesmo nome e empresa na semana atual**.

**Achados** (`BriefingFinding`): cada um tem um `id` fixo de regra, o nível (`longo`, `medio`, `curto` ou `cruzado`), a severidade (`alerta`, `atencao`, `positivo`, `info`), título, detalhe e até 8 itens (`MAX_ITEMS`). A ordem é alertas, atenção, positivos e informações; dentro do grupo, cruzados primeiro. Os ids, por nível:

- **Longo:** `longo-sem-plano`, `longo-avanco-atrasado` (5 pontos ou mais; alerta a partir de 15), `longo-avanco-adiantado`, `longo-sem-medicao`, `longo-medicao-antiga` (mais de 30 dias), `longo-servicos-atrasados` (alerta quando o maior atraso chega a 25 pontos), `longo-termino-deslizou` (alerta acima de 30 dias), `longo-vagoes-vencidos`, `longo-restricoes-vencidas`.
- **Médio:** `medio-sem-plano`, `medio-plano-desatualizado` (plano de mês anterior ao atual), `medio-atraso-linha-base` (alerta a partir de 5 dias), `medio-sem-linha-base`, `medio-vencidas`, `medio-abaixo-do-alvo` (20 pontos ou mais atrás do alvo temporal), `medio-vinculos`, `medio-prazo-final`, `medio-equipes-sobrecarga`.
- **Curto:** `curto-semana-vazia`, `curto-ppc-baixo` (média abaixo de 60%), `curto-ppc-alto` (85% ou mais), `curto-ppc-caindo`, `curto-falhas-repetidas`, `curto-sem-apontamento`, `curto-nao-levadas`.
- **Cruzados:** `cruzado-plano-sem-planilha` (tarefa do plano do mês prevista para esta semana sem linha de nome parecido na planilha), `cruzado-plano-coberto`, `cruzado-planilha-fora-do-plano` (linha da semana sem tarefa no mês), `cruzado-equipe-sobrecarga-falhas` (equipe sobrecarregada que já teve Não por falta de mão de obra, baixa produtividade ou superestimação), `cruzado-frente-atrasada` (serviço atrasado no macro, tarefa atrasada no mês e Não na semana, pareados pelo nome), `cruzado-ppc-avanco` (PPC médio abaixo de 70% com o macro 5 pontos atrás ou 3 ou mais tarefas do mês atrasadas ou vencidas), `cruzado-restricoes-causas` (restrições vencidas convivendo com causas de insumo: tarefas antecedentes, material, equipamento, definição de projeto), `cruzado-ritmo` (PPC de 85% ou mais, sem atraso contra a linha de base e macro dentro de 5 pontos).

**Pareamento por nome.** As correlações casam frentes por nome normalizado (`nameKey`: sem acento, caixa nem espaço repetido) e `namesPair` aceita que um nome contenha o outro a partir de quatro letras. É a mesma estratégia da conferência de cobertura do médio prazo: o vínculo formal entre níveis (`activityId`) é opcional e raro. É sugestão, e o texto do dossiê diz isso ao modelo.

**Texto e hash.** O dossiê vira um texto em seções ("## Longo prazo", "## Médio prazo", "## Curto prazo", "## Achados automáticos"), com a obra, a data, o dia da semana, a semana atual e os níveis lidos no cabeçalho. `briefingHash` é um FNV-1a de 32 bits desse texto: serve só para saber se os dados relevantes mudaram desde a última leitura.

O **radar** da tela são esses achados, com severidade e nível. Ele aparece mesmo sem chave da API, sem migração e sem orçamento.

### Leitura guardada

A **leitura** é um texto curto escrito pelo modelo sobre o dossiê, na persona do agente (`AGENT.persona`: engenheiro de planejamento de obra, direto, que conhece Last Planner, linha de balanço, takt e MS Project, cita nomes e números e nunca inventa dado).

**Como é gerada** (`generateReading` em `src/infrastructure/agent/chat.ts`): uma chamada, sem ferramentas, com até 4.000 tokens de saída (o raciocínio do modelo conta nesse limite) e `effort: 'medium'` (sem parâmetro `thinking`: os modelos 5.5 pensam por padrão, e o esforço médio segura o custo). O prompt do sistema fixa a estrutura, em markdown e com cerca de 350 palavras: "# Leitura da obra" (3 a 5 pontos com nomes e números), "# Correlações entre os níveis" (dizendo em uma linha se um nível não foi lido), "# O que fazer esta semana" (3 a 5 ações com o responsável provável) e "# Dados que faltam". As regras do prompt: só o dossiê, correlações como indícios, nada de número inventado.

**Onde fica e quando é refeita.** Guardada **por obra** na tabela `agent_insights` (`work_id` como chave primária, `briefing_hash`, `markdown`, `model`, `generated_at`, `generated_by`, `cost_usd`), uma por obra, para todas as pessoas. O fluxo na rota `src/app/api/agente/route.ts`:

- `GET /api/agente?workId=`: confere o acesso à obra e calcula os níveis liberados (`hasSectionAccess` para `longo-prazo`, `medio-prazo` e `curto-prazo`), monta o dossiê (`buildBriefing` sobre o snapshot da obra, o documento do plano de longo prazo e a semana 1 de `work_settings`) e devolve: nome e tagline do agente, o dossiê inteiro (achados e texto), `configured` (há chave), `canEdit` (perfil não é de consulta), a leitura guardada (`markdown`, modelo, quando, quem, custo, `hash` e `current`, que diz se o hash ainda bate com o dossiê de agora), o uso do mês, `blocked` e a decisão de orçamento. **Não chama o modelo.**
- `POST /api/agente` com `kind: 'leitura'`: se a leitura guardada tem o mesmo `hash` do dossiê, devolve-a com `unchanged: true`, **sem chamar o modelo e sem custo**. Se mudou (ou não há), confere o orçamento com a reserva de US$ 0,10, chama o modelo, grava a leitura (`saveInsight`) e o uso (`recordUsage`) e devolve a leitura nova. Falha ao guardar depois da chamada vira registro de erro, não erro para a pessoa: a chamada já foi paga.

**Sem a migração 0035**, o GET responde o dossiê e o radar com `migrationMissing: true` e uso zerado; o POST (leitura ou pergunta) responde **503** "Aplique a migração 0035_agent.sql no Supabase para usar o agente de IA". **Sem chave**, o GET responde `configured: false` e o POST responde 503 "Agente de IA não configurado".

### Conversa e propostas de edição

O `POST /api/agente` com `kind: 'pergunta'` recebe a pergunta (até 1.500 caracteres) e o histórico da conversa, que fica no navegador e não é persistido. `trimHistory` manda ao modelo só as últimas 8 mensagens, cada uma cortada em 2.000 caracteres, começando por uma da pessoa (a API exige). Depois da conferência de orçamento (reserva de US$ 0,08), `answerQuestion` roda um **laço manual de ferramentas** de no máximo **6 iterações** (`MAX_TOOL_ITERATIONS`), com até 4.000 tokens de saída por ida (raciocínio incluído) e `effort: 'medium'`: cada resposta com `tool_use` é devolvida inteira ao modelo (inclusive os blocos de raciocínio), seguida de uma mensagem da pessoa com todos os `tool_result` (com `is_error` quando a ferramenta recusou a entrada). Se a sexta ida ainda pedir ferramenta, a resposta fica com o texto que houver ou com um aviso ("Precisei de mais consultas do que cabem numa pergunta só"). O prompt do sistema manda o modelo listar (`listar_semana`, `listar_tarefas_mes`) antes de propor, nunca dizer que algo foi gravado, e resumir o que a proposta faz e o que ficou de fora.

O **dossiê vai no prompt do sistema com `cache_control: ephemeral`**, para as perguntas seguidas sobre a mesma obra reaproveitarem o prefixo em vez de pagar a entrada inteira. A chamada usa `fallbacks: 'default'` (beta `server-side-fallback-2026-07-01`): recusa por política cai num modelo substituto escolhido pelo servidor, e por isso o custo é calculado pelo `model` que **cada resposta** devolve, não pelo pedido (`Tally`). Erros da API são traduzidos como na análise do curto prazo: chave inválida 503, limite da Anthropic 429, sem conexão 502, demais 502; `stop_reason: 'refusal'` vira "O modelo não pôde analisar estes dados" (502). Ao fim, a rota grava o uso no livro-razão e devolve o texto, as propostas e o uso do mês.

As ferramentas (`AGENT_TOOL_SPECS` e `runAgentTool` em `src/application/use-cases/agent-tools.ts`) são funções puras que recebem o `ToolContext` (dados da obra, hoje, quem pergunta e o papel, níveis liberados, semana 1, plano de longo prazo e gerador de id):

- **Leitura** (devolvem texto ao modelo):
  - `listar_semana`: as linhas da planilha de uma semana, com apelido, atividade, empresa, equipe, período e apontamento, mais o PPC. A semana pode ser "atual", "anterior", "proxima", o número da semana da obra ou uma data dentro dela (`resolveWeek`).
  - `listar_tarefas_mes`: tarefas folha do plano do mês vivo, com filtro `semana_atual`, `atrasadas`, `em_andamento`, `proximas` (começam em até 14 dias) ou `todas`, e a situação de cada uma (vencida, abaixo do alvo quando 20 pontos ou mais atrás do alvo temporal, em andamento, a iniciar, concluída).
  - `listar_servicos_macro`: serviços do plano de longo prazo, com pavimentos, período, medido e previsto para hoje.
  - Listas param em 200 itens (`MAX_LIST`). Nível não liberado para a pessoa responde erro ao modelo ("não está liberado para esta pessoa").
- **Propostas** (devolvem uma `AgentProposal`; o modelo lê de volta "nada foi gravado ainda"):
  - `propor_levar`: cria uma linha igual (mesma atividade, empresa, equipe, período deslocado em semanas inteiras) na semana de destino, sem apontamento; a linha de origem não muda. Sem semana, vai para a seguinte à de cada linha. Linha já existente no destino (mesmo nome e empresa) fica de fora, com o motivo.
  - `propor_criar_linhas`: linhas novas numa semana, cada item vindo de uma tarefa do plano do mês (apelido `t:`; nome, equipe, empresa e período saem dela, com as datas recortadas para dentro da semana) ou escrito à mão (nome, empresa, equipe cadastrada, início e fim). Linha de mesmo nome e empresa já na semana fica de fora.
  - `propor_apontar`: Sim, ou Não com uma causa da lista fechada (`causeOf` aceita o nome normalizado ou um trecho de ao menos 5 letras que caiba numa causa só; trecho ambíguo como "falta" ou "produtividade" fica de fora com as candidatas listadas, para o modelo perguntar) e justificativa opcional de até 500 caracteres.
  - Até 60 itens por proposta (`MAX_PROPOSAL_ITEMS`). Levar e criar linhas passam pelo `editGate`: perfil de consulta não propõe, e semana encerrada para edição (`canEditWeek`) só com admin — as mesmas regras da planilha. Apontar segue a planilha: livre em qualquer semana para quem edita a obra (só a consulta é recusada).

**Apelidos.** Cada linha e tarefa aparece ao modelo com um apelido curto: `c:` ou `t:` mais os **8 primeiros caracteres do id** (`handleOf`). `resolveHandle` aceita o id inteiro ou o prefixo que case com uma só linha. O servidor resolve o apelido de volta ao id; o modelo nunca vê a lista de ids inteiros.

**Aplicar.** A proposta carrega `commands` prontos — `create_commitment` e `record_fulfillments`, os mesmos comandos da planilha — e a tela mostra um cartão com o título, uma linha por comando, o que ficou de fora e o botão **Aplicar**. Aplicar roda os comandos pelo mesmo caminho da planilha: mesmas permissões, projeção otimista e Desfazer (conferir no código: `agent-panel.tsx`).

### Custo, teto e limites

Tudo em `src/domain/agent-cost.ts`, funções puras usadas pela rota e pelos testes:

- `MODEL_PRICES`: preço por milhão de tokens (tabela da Anthropic em 10/2026) para `claude-opus-5-5` (4 / 20), `claude-sonnet-5-5` (2 / 10) e `claude-haiku-5-5` (0,10 / 0,50), com escrita de cache a 1,25× a entrada e leitura de cache a 10%. `priceFor` casa pelo prefixo do id; modelo desconhecido é cobrado como o mais caro, para o teto nunca ser furado por otimismo.
- `costOf(usage, model)`: o custo de uma chamada, com seis casas, a partir dos tokens que a API devolve. Não é estimativa: é o que vai para o livro-razão.
- `budgetDecision(state, estimate)`: pode chamar o modelo? A ordem é fixa: **corte do admin** (`bloqueado`), **teto do mês** (`mes`, absoluto, todas as obras), **parte da obra** (`obra`) e **limite da pessoa** (`usuario`, só quando o admin definiu um). `estimate` é a reserva da chamada que está para acontecer (`ESTIMATED_CALL_USD`: 0,10 para leitura, 0,08 para pergunta), para a última chamada do mês não passar do teto. Cada recusa tem a mensagem que a tela mostra, sempre terminando com "O radar continua funcionando".
- `workBudgetOf(budgetUsd, activeWorks)`: a parte de cada obra é **1,5× (teto ÷ obras ativas)** (`WORK_SHARE_TOLERANCE`). Com o teto de US$ 20 e seis obras, US$ 5,00 por obra; o total continua preso ao teto.
- `agentConfigFromEnv(env)`: a chave vem de `ANTHROPIC_API_KEY` ou, na falta, de `API_ANTHROPIC`; o modelo de `AGENT_MODEL` ou `MODEL`, com apelidos (`SONNET5.5`, `OPUS5.5`, `HAIKU5.5`, `sonnet`, `opus-5.5`…; um id que começa com `claude-` passa direto; desconhecido cai no padrão `claude-sonnet-5-5`); o teto de `AGENT_MONTHLY_BUDGET_USD`, padrão 20. Os nomes canônicos têm preferência quando os dois existem.
- `monthKey(today)`: o mês do livro-razão é o da data civil no fuso da obra.

Cada chamada ao modelo grava uma linha em `agent_usage` (obra, pessoa, mês, tipo `leitura` ou `pergunta`, modelo, número de idas ao modelo, tokens de entrada, saída, leitura e escrita de cache, custo). Antes de chamar, a rota lê o mês inteiro (`monthUsage` em `src/infrastructure/agent/ledger.ts`, paginado em blocos de 1.000 linhas, porque o PostgREST corta em 1.000 e um mês movimentado ficaria subcontado), conta as obras ativas (`works.active`), lê os limites da pessoa e monta o `BudgetState`; recusa responde **429** com a mensagem e o motivo (`reason`), e o radar continua. Toda função do ledger devolve um `LedgerResult` que separa "a tabela não existe" (migração ausente: a rota segue sem o modelo) de erro de verdade (502). O GET devolve o uso do mês para o rodapé do painel: gasto do mês e teto, gasto da obra e a parte dela, gasto da pessoa e o limite dela, e o modelo.

### Tela de administração

**Configurações → Agente de IA** (`/configuracoes/agente`), só para admin: quem não é vai para a lista de obras, como nas outras telas restritas. O painel (`AgentAdmin`) lê `GET /api/admin/agente?month=` e grava com `PUT /api/admin/agente/{userId}`:

- **Seletor de mês**, com o mês atual no fuso de São Paulo por padrão; as setas voltam ou avançam um mês e não passam do atual.
- **Resumo do mês**: gasto contra o teto (barra com cor de aviso a partir de 70% e de perigo a partir de 90%), chamadas (leituras e perguntas em todas as obras) e o modelo em uso.
- **Pessoas**, da que mais gastou para a que menos gastou: nome, papel, gasto, chamadas (leituras e perguntas), última chamada, **limite mensal** (campo em dólares; salva ao sair do campo ou com Enter; vazio é sem limite; valor inválido avisa e volta ao anterior) e **corte de acesso** (botão com o estado em texto, chip "Cortado"; liberar reabre na hora). Cada gravação atualiza só a linha; o rodapé soma tudo.
- **Obras**, da que mais gastou para a que menos: código, nome, gasto, chamadas e a parte da obra no teto. Obra inativa aparece em cinza: conta o que gastou, mas não entra na divisão do teto.
- Sem a migração, um aviso pede a 0035 e explica que até lá nada é registrado; o relatório vem com zeros.
- A ajuda da tela ("Como funciona") explica o teto geral, a parte de cada obra, o limite por pessoa, o corte e que o custo é calculado dos tokens devolvidos.

**Rotas** (só admin; outro perfil recebe 403):

- `GET /api/admin/agente?month=YYYY-MM` (sem `month`, o mês atual em São Paulo) devolve `AgentAdminReport`: mês, teto, modelo, `migrationMissing`, totais, pessoas (todos os perfis, com o gasto do mês e os limites) e obras (todas, com a parte do teto calculada sobre as ativas). Sem as tabelas da 0035, devolve o relatório zerado com `migrationMissing: true`; outro erro de leitura responde 502.
- `PUT /api/admin/agente/{userId}` recebe `monthlyLimitUsd` (número de 0 a 1.000.000, arredondado a duas casas, ou `null` para sem limite) e/ou `blocked` (booleano). Só o que vier no corpo muda; o resto fica. Corpo sem nada a alterar responde 400, usuário inexistente 404 e migração ausente 503. Grava em `agent_user_settings` com quem alterou e quando.

### Onde fica na interface e tour

- **Botão do agente** no cabeçalho de **toda tela da obra**, antes do zoom e da ajuda (`AgentButton`, de `src/modules/agente/agent-panel.tsx`, montado em `src/app/(app)/layout.tsx`; fora de `/obras/<id>` não renderiza). Abre uma gaveta (`Drawer` larga) com, nesta ordem: avisos (sem chave, sem migração, acesso cortado, orçamento esgotado pelo campo `budget` do GET, mostrado antes de a pessoa levar o 429); **Leitura de {nome}** (markdown da leitura guardada, "Leitura de {data} por {pessoa} · modelo · custo", chip âmbar "Os dados mudaram desde esta leitura" e botão "Nova leitura", desabilitado quando os dados não mudaram); **Radar** (achados com chip de severidade nos tokens do sistema, rótulo do nível e itens em `<details>`); **Conversa** (balões, três sugestões antes da primeira pergunta, textarea com Enter para enviar, cartões de proposta com "Aplicar" e "Descartar"); "O que o agente leu" (o dossiê em texto); e o rodapé fixo de uso (mês, obra, pessoa quando há limite, modelo). Decisões do painel: o estado inteiro (resposta do GET, conversa, propostas) vive no botão, preso ao `workId`, porque a gaveta desmonta o conteúdo ao fechar e trocar de obra zera tudo; o histórico enviado ao modelo tem só as rodadas respondidas; "Aplicar" roda os comandos da proposta em sequência pelo `execute` do provedor do planejamento (projeção otimista, permissões e Desfazer da planilha), mostra "Aplicando 2 de 5…", em erro para no comando que falhou e oferece "Tentar de novo" sem repetir os gravados, e ao terminar refaz o GET em silêncio para o radar acompanhar; quem não edita a obra vê a proposta sem o botão.
- **Link "Agente de IA"** na barra lateral, abaixo de Configurações, só para admin.
- **Tour:** o passo `AGENT_STEP` (alvo `agente`) é adicionado a todos os tours antes do fecho, em `withClosing`; fora da obra o alvo não existe e o passo é pulado. Dentro da gaveta os alvos `agente-leitura`, `agente-radar`, `agente-conversa`, `agente-proposta` e `agente-uso` já existem, mas ainda não há tour que os percorra: a gaveta é um `<dialog>` modal, e a camada do tour fica atrás dela (próxima etapa). A tela do admin tem o tour `agenteAdmin` (`src/modules/tour/pages/agente-admin.ts`, resolvido por `/configuracoes/agente`): um passo de abertura e os alvos `agente-admin-ajuda`, `agente-admin-mes`, `agente-admin-resumo`, `agente-admin-usuarios`, `agente-admin-limite`, `agente-admin-corte` e `agente-admin-obras`. Só a primeira linha da tabela de pessoas leva as marcações de limite e corte, porque o teste de alvos exige o atributo literal no código.
- O nome do agente aparece no botão, no painel, no tour e na apresentação ao modelo; trocar `AGENT.name` muda tudo.

### Variáveis de ambiente

Documentadas em `.env.example`:

| Variável | O que faz | Padrão |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Chave da Anthropic; a mesma do "Analisar com IA" do curto prazo. `API_ANTHROPIC` é aceita como apelido. | sem chave, o painel mostra só o radar e avisa |
| `AGENT_MODEL` | Id completo ou apelido (`SONNET5.5`, `OPUS5.5`, `HAIKU5.5`). `MODEL` é aceito como apelido. | `claude-sonnet-5-5` |
| `AGENT_MONTHLY_BUDGET_USD` | Teto mensal, em dólares, para todas as obras. | 20 |
| `NEXT_PUBLIC_AGENT_NAME` | Nome da assistente na tela. É público: vai para o navegador. | `Claudia` |

O usuário gravou `API_ANTHROPIC` e `MODEL=SONNET5.5` no `.env.local`; os dois são lidos. Na Vercel, as variáveis ainda não foram definidas (ver Próximas etapas).

## Decisões

- **O modelo nunca grava.** As ferramentas de edição devolvem propostas; a tela aplica com os comandos existentes, pelo mesmo caminho da planilha, com as mesmas permissões e o Desfazer. Isso vale também para o que o modelo "decidir" sozinho dentro do laço: sem clique em Aplicar, nada muda.
- **Níveis lidos seguem o acesso por módulo** (`hasSectionAccess` em `src/application/module-access.ts`). Quem não tem o longo ou o médio prazo liberado não os vê no dossiê, no radar nem nas ferramentas; o modelo recebe "não está liberado para esta pessoa".
- **Leitura guardada por obra e refeita só quando os dados mudam.** O `hash` do dossiê decide; não há leitura por pessoa nem por hora.
- **Radar sem modelo.** As regras fixas são a parte que não custa nada e não depende de chave, migração ou orçamento; a leitura e a conversa são a camada por cima.
- **Pareamento por nome**, não por vínculo, nas correlações entre níveis — a mesma decisão da cobertura do médio prazo. É conferência, erra quando o nome muda entre níveis, e o texto diz isso ao modelo.
- **Custo medido, não estimado.** O livro-razão guarda o custo calculado dos tokens que a API devolve. As estimativas servem só para a reserva antes da chamada e para o planejamento do orçamento.
- **Teto absoluto do mês, parte por obra, limite por pessoa opcional.** A parte por obra existe para uma obra não consumir o crédito das outras; o limite por pessoa é ferramenta do admin, e não vem definido.
- **Apelidos de 8 caracteres** para as listas caberem em poucos tokens; o servidor resolve de volta.
- **Sem `thinking` explícito e `effort` médio.** Os modelos 5.5 pensam por padrão; o esforço médio segura o custo da leitura e da pergunta. Mudar isso muda a tabela de custo.
- **Custo pelo modelo da resposta.** Com `fallbacks: 'default'`, o servidor pode responder com outro modelo; o livro-razão cobra o que de fato respondeu, e modelo desconhecido é cobrado como o mais caro.
- **Histórico no navegador**, cortado a 8 mensagens e 2.000 caracteres cada antes de ir ao modelo. Persistir é próxima etapa.
- **Tabelas fora do snapshot.** `agent_insights`, `agent_usage` e `agent_user_settings` não entram no `commit_planning` nem no `planning_snapshot`: a leitura e o livro-razão crescem com o uso, e o planejamento não precisa deles. Subir o código antes da migração não quebra nada.
- **Nome.** "Claudia, sua assistente de planejamento", escolha do usuário em 27/10/2026 depois de rejeitar o nome de trabalho "Vagner". Nome, tagline e persona ficam na constante `AGENT`; `NEXT_PUBLIC_AGENT_NAME` sobrepõe só o nome, e os textos do tour e do painel falam dela no feminino.

## Migração 0035 (criada em 27/10/2026; aplicada no takt-hub pelo usuário no mesmo dia)

`supabase/migrations/0035_agent.sql`, criada em 27/10/2026. **O usuário informou, ainda em 27/10, que a aplicou no Supabase `takt-hub` e definiu as variáveis na Vercel.** Isso não foi conferido pelo código: a máquina de desenvolvimento não tem a CLI do Supabase nem a da Vercel, e o `.env.local` ainda aponta para o projeto antigo (`fanktscgrprylqqnwjje`, que dá NXDOMAIN desde 08/10). A conferência fica para o primeiro uso logado: em **Configurações** (admin) a migração `0035_agent` deve aparecer como aplicada. Cria três tabelas, todas fora do snapshot, com RLS ligada sem políticas, `revoke` para `anon` e `authenticated` e **grant explícito para `service_role`** — no `takt-hub` a exposição automática de tabelas novas está desligada (ver 0033), e sem o grant a chave de serviço não lê nem grava:

- `agent_insights`: a última leitura por obra (`work_id` chave primária, `briefing_hash`, `markdown`, `model`, `generated_at`, `generated_by`, `cost_usd`).
- `agent_usage`: o livro-razão de cada chamada (`work_id`, `actor_id`, `month` no formato `YYYY-MM`, `kind` em `leitura` ou `pergunta`, `model`, `calls`, os quatro contadores de tokens, `cost_usd`), com índices por mês e obra e por mês e pessoa.
- `agent_user_settings`: `monthly_limit_usd` (nulo = só os tetos gerais valem) e `blocked`, por pessoa, com quem alterou e quando.

Ids de perfil ficam como `text`, igual a `updated_by` da 0024. A migração usa `if not exists` e **pode ser rodada de novo**; termina com `notify pgrst, 'reload schema'`.

**Como aplicar:**

1. No SQL Editor do projeto `takt-hub`, colar o conteúdo de `supabase/migrations/0035_agent.sql` e executar. O bootstrap `obra360-schema.sql` não deve ser rodado de novo num banco que já existe (ver `docs/go-live-curto-prazo.md`).
2. Conferir em **Configurações** (admin) que a migração `0035_agent` aparece como aplicada: a sonda é a tabela `agent_usage`.
3. Se o grant tiver ficado de fora por qualquer motivo, rodar à parte:

```sql
grant select, insert, update, delete on agent_insights to service_role;
grant select, insert, update, delete on agent_usage to service_role;
grant select, insert, update, delete on agent_user_settings to service_role;
notify pgrst, 'reload schema';
```

**Sem a migração:** a rota GET responde o dossiê e o radar com `migrationMissing: true`; leitura e pergunta respondem 503 pedindo a migração; a tela do admin mostra o aviso e a tela de migrações lista a 0035 como ausente (`critical: false`: nada além do agente para).

## Validação (27/10/2026)

- **Testes automatizados:** `tests/agent-briefing.test.ts` (13 testes: resumos dos três níveis com valores calculados à mão, 18 achados esperados por id, severidade e itens, correlações, recorte por `levels`, hash estável, ordem, `namesPair`, obra sem dados), `tests/agent-cost.test.ts` (11 testes: `costOf`, `priceFor` por prefixo, `workBudgetOf`, as quatro recusas e o permitido em `budgetDecision`, apelidos e chaves em `agentConfigFromEnv`) e `tests/agent-tools.test.ts` (22 testes: apelidos, `resolveWeek`, as três listas, as três propostas com o que fica de fora, consulta e semana encerrada). A revisão dos testes achou dois desvios nas ferramentas, corrigidos no mesmo dia: `propor_apontar` travava a semana encerrada para o planejador (a planilha e o servidor não travam o apontamento) e `causeOf` escolhia a primeira causa que contivesse um trecho genérico ("falta" virava "Falta de equipamento"); agora o apontamento é livre para quem edita e o trecho ambíguo fica de fora com as candidatas.
- **Sequência do `ci.yml`, rodada localmente em 27/10/2026:** `npm run typecheck` sem erros; `npm run lint` com 0 erros (28 avisos pré-existentes em outros arquivos); `npm run format:check` limpo; `npm test` com 726 testes passando (46 novos); `npm run validate:migrations` OK com a 0035 no PGlite; `npm run build` OK, com as rotas `/api/agente`, `/api/admin/agente`, `/api/admin/agente/[userId]` e a página `/configuracoes/agente` na saída. O `test:e2e` (fumaça do login) não foi rodado nesta sessão.
- **Chamada contra a API real da Anthropic, em 27/10/2026**, com `node --import tsx scripts/agent-smoke.ts` (chave e `MODEL=SONNET5.5` do `.env.local`, obra de exemplo de `tests/fixtures/agent-planning.ts`, sem banco). O apelido virou `claude-sonnet-5-5`; o beta `server-side-fallback-2026-07-01`, `fallbacks: 'default'` e `output_config.effort` foram aceitos; o modelo que respondeu foi o pedido (sem substituto). Resultado:
  - **Leitura:** 9,5 s, 1 chamada, 26 tokens de entrada + 2.645 de escrita de cache + 1.231 de saída (raciocínio incluído), **US$ 0,02**. O texto seguiu as quatro seções do prompt, citou os achados certos (macro 70% contra 100%, PPC 25% na S42, Impermeabilização sem linha na S43, Alfa com 2 frentes para capacidade 1) e não inventou dado.
  - **Pergunta com edição** ("quais tarefas do plano de outubro deveriam estar na semana atual e não estão? leve o que ficou sem fazer na semana passada"): 7,8 s, **3 idas ao modelo** (listas e `propor_levar`), 2.510 de entrada + 4.747 de escrita de cache + **9.494 de leitura de cache** (o bloco do dossiê foi reaproveitado entre as idas) + 849 de saída, **US$ 0,03**. Gerou **uma proposta correta**: levar o Contrapiso apto 602 para a semana 43; não duplicou o Reboco apto 501 (já tinha linha na 43) e não levou a Pintura externa (sem apontamento), explicando os dois. Para a Impermeabilização pediu datas e confirmação da equipe antes de propor, em vez de criar a linha por conta própria.
  - **Total da dupla: US$ 0,05**, abaixo da reserva conferida antes de cada chamada (US$ 0,10 + US$ 0,08). O dossiê da obra de exemplo tem 4 mil caracteres; numa obra real com os três níveis cheios ele é maior, por isso a tabela de custo abaixo mantém a estimativa, a ser conferida com o livro-razão.
- **Não validado nesta data:** o painel e a tela do admin **no navegador, logado** (proposta aplicada e desfeita, 429 ao estourar um teto, limite e corte do admin, custo gravado em `agent_usage`). O `.env.local` aponta para o projeto Supabase antigo, então o teste logado tem de ser feito na produção ou depois de trocar o `.env.local` para o `takt-hub`.

## Custo estimado

Preços por milhão de tokens (`MODEL_PRICES`) e custo por chamada, estimado para o tamanho típico do dossiê de uma obra mais as ferramentas:

| Modelo | Entrada | Saída | Leitura da obra | Pergunta com edição |
| --- | --- | --- | --- | --- |
| `claude-sonnet-5-5` (padrão) | US$ 2 | US$ 10 | ~US$ 0,05 (medido US$ 0,02 na obra de exemplo) | ~US$ 0,06 (medido US$ 0,03) |
| `claude-opus-5-5` | US$ 4 | US$ 20 | ~US$ 0,10 | ~US$ 0,12 |
| `claude-haiku-5-5` | US$ 0,10 | US$ 0,50 | bem abaixo do Sonnet; não medido | não medido |

Escrita de cache custa 1,25× a entrada e leitura de cache 10% (US$ 0,20 no Sonnet e no Opus). O cache de prompt no bloco do dossiê é o que mantém a pergunta perto do custo da leitura.

**Conta do orçamento no Sonnet 5.5:** 6 obras × 22 leituras por mês (uma por dia útil, só quando os dados mudam) × US$ 0,05 = US$ 6,60; 60 perguntas por mês (dez por obra) × US$ 0,06 = US$ 3,60; **total perto de US$ 10/mês**, metade do teto de US$ 20. No Opus o mesmo uso dobra e chega ao teto. A reserva conferida antes de cada chamada (US$ 0,10 por leitura, US$ 0,08 por pergunta) é propositalmente maior que a estimativa. O teste de fumaça (`scripts/agent-smoke.ts`, cerca de US$ 0,05 por execução) é o jeito de medir de novo depois de trocar de modelo.

Os limites por padrão, com seis obras ativas: teto US$ 20,00; parte de cada obra US$ 5,00; limite por pessoa sem valor.

## Próximas etapas

- **Conferir a 0035 e as variáveis na Vercel** no primeiro uso logado (o usuário informou que fez os dois em 27/10/2026; ver a seção da migração). Até lá, em produção, só o radar funciona. Trocar o `.env.local` para o `takt-hub` se quiser testar o painel localmente.
- **Testar no navegador, logado**, numa obra com os três níveis preenchidos: leitura, pergunta, as três propostas aplicadas e desfeitas, 429 ao estourar um teto, a tela do admin com limite e corte. Registrar aqui o custo real de uma leitura e de uma pergunta numa obra de verdade (o livro-razão já guarda), e ajustar `ESTIMATED_CALL_USD` e a tabela acima se a conta não bater.
- **Propostas para o médio e o longo prazo.** Hoje o modelo só propõe edições na planilha da semana (curto prazo); mover tarefa do plano do mês, mudar percentual ou lançar medição no macro são próxima etapa, com os comandos já existentes.
- **Persistir conversas.** O histórico fica no navegador e some ao fechar o painel; guardar por obra e pessoa é próxima etapa.
- **Leitura automática agendada**: gerar a leitura fora do horário (por exemplo, de madrugada, só para as obras cujo hash mudou), para o painel abrir já com ela. Hoje a leitura é pedida pela tela.
- **Nomes em `AGENT`.** Centralizar na constante o que ainda estiver escrito à mão (textos do painel, do tour e das mensagens de orçamento que citam o agente) e, se o usuário quiser, levar tagline e persona para variáveis de ambiente.
- **Regerar o bootstrap** (`npm run bootstrap:sql` e `node scripts/validate-bootstrap-sql.mjs`) para incluir a 0035, quando o próximo projeto vazio precisar dela. Não é necessário para o `takt-hub`, que recebe as migrações uma a uma.

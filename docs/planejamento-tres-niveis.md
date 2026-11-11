# Planejamento em três níveis

## Para que serve este documento

Continuidade entre os modelos de IA que trabalham no repositório, no que toca longo, médio e curto prazo — o equivalente ao que `docs/ifc-federacao.md` faz para IFC e federação. A cada alteração nesses três níveis, atualizar aqui: comportamento entregue, decisões, arquivos, migrações, validação e pendências. Não descrever intenção como funcionalidade pronta.

## Diagnóstico de 19/09/2026

Os três níveis são **três planilhas independentes que não conversam**. Cada uma tem o seu modelo de dado:

| Nível | Modelo | Origem do dado |
| --- | --- | --- |
| Longo prazo | `Activity` em vagões | importada do Prevision, fatiada por vagão |
| Médio prazo | `PlanTask` (plano do mês) + Look Ahead sobre `Activity` | escrita à mão; a janela é calculada |
| Curto prazo | `WeeklyCommitment` | escrita à mão, sem depender de nada |

O único fio entre eles é um `activityId` opcional que quase nunca é preenchido. A consequência: o sistema não dizia se o plano do mês cobre o que a janela anuncia, se a semana corresponde ao mês, nem se o que falhou na semana mudou alguma coisa acima. Cada tela é uma boa planilha — e planilha o Sheets já fazia. O que só um sistema faz é levar informação de um nível para o outro.

**Independência de preenchimento não é ausência de rastro.** O curto prazo se sustentar sozinho é decisão do usuário e continua valendo: a conferência entre níveis sugere e reconcilia, nunca exige, nunca bloqueia, nunca cria linha sozinha.

## Etapa 1 — fechar o ciclo do que já era coletado (19/09/2026)

### Regras novas, em `src/domain/rules.ts`

- `ppcSeries(commitments)` — o PPC semana a semana. O valor de uma semana isolada diz pouco; o Last Planner usa a série.
- `causePareto(commitments)` — as 17 causas em ordem de peso, com participação e acumulado **sobre as falhas**. Antes as causas eram coletadas e não eram lidas em lugar nenhum.
- `plannedAt(items, date)`, `executedAt(activities, entries, date)`, `progressCurve({...})` — a curva S. O planejado assume avanço linear de cada frente entre início e término: é aproximação declarada, e a alternativa seria inventar uma curva de produção que ninguém mediu. O executado não é aproximado, sai do lançamento datado. A referência do planejado é a linha de base quando houver — comparar o executado com um planejamento já reprogramado é comparar a obra com a desculpa dela.

### Correção de comportamento

`teamLoad` contava apenas `Activity.teamId` e ignorava o recurso das linhas do plano do mês. Quem planejava na grade nova via "dentro da capacidade" com o mês estourado. Passa a somar os dois e a devolver a separação (`activities`, `tasks`); linha de base congelada não entra na conta, porque retrato não é compromisso.

### Telas

- **Curto prazo** (`src/modules/curto-prazo/commitments-overview.tsx`): fechamento da semana abaixo da planilha — série do PPC, Pareto das causas, arrasto do não cumprido para a semana seguinte e geração de pendência a partir da falha. A linha original do "Não" permanece: ela é o registro do que aconteceu.
- **Longo prazo** (`src/modules/longo-prazo/s-curve.tsx`): curva de avanço acumulado, planejado contra executado, com desvio em pontos percentuais. O executado para em hoje; prolongá-lo inventaria medição.
- **Médio prazo** (`src/modules/medio-prazo/look-ahead-overview.tsx`): a lista da janela de três meses (antes eram só quatro cartões de número) e a conferência de cobertura entre níveis.

### Pareamento por nome

A conferência de cobertura casa frentes **por nome normalizado**, não por vínculo: `PlanTask.activityId` e `WeeklyCommitment.activityId` são opcionais e quase nunca preenchidos. É a mesma estratégia que a comparação do plano do mês com a sua linha de base já usa. É conferência, não vínculo, e erra quando o nome muda entre níveis — a tela diz isso.

## Etapa 2 — a grade do plano do mês no padrão Project (20/09/2026)

Referência: o guia de usabilidade de cronograma trazido pelo usuário, de sistema já consolidado. Ele foi adotado como padrão desta grade; o que segue diz o que foi implementado e o que ficou fora, de propósito.

### Vínculos nos quatro tipos, com defasagem

Havia só um par predecessora/sucessora, e a coerência era conferida como se todo vínculo fosse Término-Início. Isso descreve mal a obra: a alvenaria do 5º não espera a do 4º terminar para começar — ela começa alguns dias depois de a outra começar, que é Início-Início com defasagem, e é assim que a equipe sobe o prédio. Quem só tinha TI ou mentia a data ou não usava o vínculo.

- `PlanDependency` ganhou `type` (TI/II/TT/IT), `lagDays` e `lagBusiness`. Migração `0022_plan_link_types.sql`, que reescreve `commit_planning` por causa das três colunas. Os padrões descrevem o que já estava gravado: todo vínculo existente é TI sem defasagem.
- `parseLinks` e `formatLink` leem e escrevem a sintaxe do Project (`12`, `12II+2d`, `12TT-1d`, `12TI+2dd`). O número é a **posição na lista**, não o número hierárquico — o hierárquico muda a cada recuo e a referência apontaria para outra linha.
- `lagBusiness` separa `2d` de `2dd`: dois dias úteis e dois corridos caem em datas diferentes quando o intervalo atravessa um fim de semana.
- `linkBoundary` dá a data mais cedo que cada tipo permite e qual ponta ele prende; `linkConflicts` aponta os vínculos desrespeitados. **Apontar não é reprogramar** — ver a decisão em aberto abaixo.

### Percentual-alvo

`targetPercent` devolve quanto do tempo útil planejado já passou na data de referência. É leitura de **tempo**, não medição física, e a tela precisa dizer isso: confundir os dois numa obra é grave, porque vira um avanço que ninguém mediu.

### Na grade

Cadeado (a grade abre bloqueada, contra alteração acidental em reunião), recolher e expandir item de resumo, teclado no padrão do Project (F2, Esc, Enter desce, setas), predecessoras com tipo e defasagem, incoerência apontada por tipo de vínculo, e as colunas calculadas de % alvo, desvio, término da base e variação em dias.

### Decisões em aberto — precisam do usuário

1. *(Resolvida em 25/09/2026 — ver etapa 4: o usuário escolheu o agendamento automático.)* **Reprogramação automática (ASAP).** O guia exige datas, duração e predecessoras ligadas por um motor único (secao 7.1). Hoje as datas não se movem sozinhas: a rede aponta a incoerência e a reprogramação é manual — decisão anterior do próprio usuário, e não a desfiz sozinho. Ligar o motor muda datas na tela de quem planeja, e é a mudança de maior impacto do guia inteiro.
2. *(Resolvida: o rascunho com "Revisar e salvar" e motivo obrigatório foi implementado depois desta etapa, e o usuário confirmou em 25/09/2026 que quer mantê-lo.)* **Rascunho com gravação atômica e motivo obrigatório** (secao 12). Hoje cada célula grava ao sair dela, o que o usuário pediu explicitamente. O guia quer rascunho local, revisão antes de salvar e motivo por revisão. A concorrência otimista já existe, mas no nível do snapshot inteiro (`planning_meta.version`), não por tarefa, e o histórico é por comando, sem motivo.

### Do guia, ainda não implementado

Colunas configuráveis e redimensionáveis, seleção de intervalo com copiar/colar e preencher para baixo, desfazer/refazer, filtros, modo reunião, calendário de feriados e jornada, e duração em horas ou meses. Nada disso foi tentado pela metade.

## Pendências

- **Rede de atividades sem porta de entrada.** Os comandos `link_activities`/`unlink_activities`, a regra `dependencyConflicts` e a tabela `activity_dependencies` (migração 0010) existem, mas **nenhuma tela cria ou mostra** essas ligações. O plano do mês tem a sua própria rede, essa sim com tela. Decidir com o usuário: dar interface à rede das atividades do cronograma ou remover o caminho morto. Nada foi apagado por enquanto.
- O executado alimenta o sistema só pela tela do vagão (`record_progress`). Médio e curto prazo não lançam avanço físico, então a medição vive num lugar e o planejamento em outros dois.
- A ordem dos locais na Linha de Balanço sai de um interpretador de nomes do Prevision (`height`, em `line-of-balance.tsx`). Um campo próprio de cota/ordem no local seria mais firme.
- Não há curva por serviço nem desvio por frente em dias — a curva S é da obra inteira.

## Migrações

A etapa 1 não precisou de nenhuma: era cálculo sobre o que já estava gravado. A etapa 2 traz `0022_plan_link_types.sql`, que acrescenta tipo e defasagem ao vínculo do plano e reescreve `commit_planning`. **Precisa ser aplicada antes de o código correspondente subir**: sem ela, tipo e defasagem são descartados em silêncio a cada gravação.

## Etapa 3 — redesenho em seis abas (23/09/2026)

O sistema passou a se chamar **Sistema de Gestão de Projetos – ATR** e a navegação da obra virou seis abas numeradas na lateral (`WORK_TABS` em `src/modules/layout/work-nav.tsx`): 1 Cronograma de longo prazo, 2 Planejamento por vagões, 3 Cronograma de médio prazo, 4 Cronograma de curto prazo, 5 Modelo federado, 6 BIM 4D. Arquivos IFC, Dívidas, Integrações e Configurações da obra ficaram num grupo **Apoio** abaixo das abas, por escolha do usuário. No celular, as abas viram uma faixa rolável (`WorkTabsMobile`). O cabeçalho comum das abas está em `src/modules/layout/tab-header.tsx`, e abrir uma obra leva à aba 1. Um documento de orçamento integrado ao IFC (EAP e composições) foi apresentado junto do pedido, e o usuário decidiu deixá-lo fora do escopo.

### Aba 1 — longo prazo

A ordem da tela mudou para Linha de Balanço → módulo de restrições → curva de avanço → linhas de base. O quadro antes chamado "Pendências" passou a se chamar **Módulo de restrições**. A entidade sempre foi `Restriction`, e "pendência" continua designando o item de terminalidade do vagão (`PendingItem`): usar a mesma palavra para as duas coisas confundia. Nenhum comando nem dado mudou.

### Aba 3 — alocação de recursos e atrasos contra a linha de base

Regras novas, puras, em `src/domain/schedule-analysis.ts` (testes em `tests/schedule-analysis.test.ts`):

- `weeklyTeamLoad(data, workId, from, to)`: carga semana a semana (semanas começando na segunda) por equipe. Soma as atividades do cronograma e as tarefas **não resumo** dos planos vivos, contra `weeklyCapacity`. Plano congelado ou linha de base não conta, pelo mesmo motivo do `teamLoad`: retrato não é compromisso. Cada semana devolve os itens que a compõem, para a tela mostrar quem causa a superalocação. Uma linha "sem equipe" aparece só como informação.
- `baselineVariance(live, baseline, calendar)`: variação de início e término em **dias úteis do calendário do plano**, com sinal positivo para atraso. O pareamento usa primeiro `sourceTaskId` e depois o nome normalizado. Cada tarefa sai com o status atrasada/adiantada/no prazo, conforme o término, ou como nova/removida. O resumo traz a quantidade de atrasadas, o maior atraso, o atraso médio e a variação do término do plano.

Telas novas, montadas abaixo da grade em `medio-prazo/page.tsx`:

- `ResourceAnalysis`: grade equipes × semanas colorida por carga/capacidade, com texto e ícone além da cor. Um clique na célula lista os itens da semana, e o histograma da equipe escolhida traz a linha de capacidade. O período é o mês de um plano vivo ou as próximas 12 semanas.
- `BaselineDelays`: escolha do plano e de uma das suas linhas de base congeladas, com indicadores, comparação em barras (atual × base) das tarefas atrasadas e tabela completa de variações.

Premissas declaradas: atividade concluída continua contando carga, igual ao `teamLoad`. Tarefa que começa atrasada e termina no prazo conta como "no prazo", mas o Δ de início aparece. Linhas de resumo ficam fora da análise de atrasos.

**Validação:** 9 testes novos passando. As telas não foram abertas logadas no navegador.

### Pendências desta etapa

- Validar no navegador, com dados reais, a grade de carga e a comparação com a linha de base.
- A capacidade continua sendo "atividades simultâneas por semana". Um histograma em homens-hora exigiria cadastrar quantidade de pessoas e produtividade, o que não existe hoje.

### Migração 0023 — aplicada

`0023_plan_revisions.sql` veio do trabalho de 22/09 sobre as revisões do plano do mês. Ela acrescenta `schedule_meta` a `medium_term_plans` e `plan_tasks`, cria gatilhos que tornam imutáveis a linha de base congelada e o `history_events`, e reescreve `commit_planning`. O usuário a **aplicou no Supabase remoto em 23/09/2026**. A presença das colunas foi conferida pela API REST, com resposta 200 nas duas tabelas. A migração não é reexecutável, porque cria as funções `guard_*` e os gatilhos sem `or replace`/`if not exists`. Se for preciso rodá-la de novo em outro ambiente, é necessário remover antes os gatilhos e as funções.

### Aba 1 — longo prazo como leitura do Prevision (23/09/2026)

A pedido do usuário, a aba 1 passou a dizer, na descrição e num aviso logo abaixo do título, que o cronograma de longo prazo **por enquanto é mantido apenas no Prevision**. A tela serve para consultar esses dados e criar e acompanhar restrições. As atividades chegam pela importação em Integrações. Linhas de base e curva de avanço continuam disponíveis, mas não substituem a edição do cronograma, que não é feita aqui.

### Nome do sistema: Obra 360 (23/09/2026)

O usuário escolheu o nome **Obra 360** para substituir "Sistema de Gestão de Projetos – ATR". O novo nome aparece na lateral, com o subtítulo "Gestão de projetos e obras", no cabeçalho do celular, no login, no título da aba do navegador (`Obra 360 · ATR`) e no tour. A troca foi só de texto na tela. O **endereço do site** (projeto `planejamento-de-vagao` na Vercel), o **repositório** e o `package.json` não mudaram. Mudar o endereço exige atualizar o Site URL e as Redirect URLs no Supabase. A recomendação é fazer isso junto com um domínio próprio.

## Etapa 4 — planejador de longo prazo: fluxograma que se expande em Linha de Balanço (25/09/2026)

A pedido do usuário, a aba 1 ganhou uma ferramenta para **preencher** o planejamento de longo prazo no próprio sistema. Ela reproduz o "Planejamento de Longo Prazo" do App-ATR (`~/Applications/App-ATR`), criado entre 13 e 20/05/2026 e removido em 08/07/2026 no commit `10995b7` ("Remove módulos LOB, Restrições e PMP"). A documentação daquela ferramenta é o histórico do Git: `git show 10995b7^:src/app/dashboard/planejamento-longo-prazo/PlanejamentoLongoPrazoClient.tsx` (2.197 linhas) e `git show 10995b7^:src/lib/data/planejamento-lp.ts`. O repositório não tinha documento escrito, e esses dois arquivos foram a fonte da reprodução. Lá o plano ficava no Redis (Upstash) como um JSON por projeto.

### O que a aba 1 mostra agora

A aba tem duas visões, alternadas no cabeçalho, e o endereço guarda a escolhida em `?visao=`:

- **Planejador** (padrão, `src/modules/longo-prazo/planner/`): o cronograma de longo prazo é montado aqui.
- **Vagões e restrições** (`?visao=prevision`, chamada "Prevision e restrições" na primeira versão do dia): a tela anterior. Mostra a Linha de Balanço das atividades dos vagões, o módulo de restrições, a curva de avanço e as linhas de base dos vagões. O aviso diz que essas atividades são só leitura aqui e que quem responde por elas é o plano.

### O modelo do plano (igual ao original)

Cada **serviço** percorre uma faixa contínua de pavimentos, do inicial ao final, e tem:

- uma **duração por pavimento**, em dias corridos, com a opção de duração própria em alguns pavimentos;
- um **ritmo**: dias entre o início de um pavimento e o início do seguinte (0 = todos juntos);
- **predecessoras**, cada uma com espera em dias (negativa = antecipação) e dois modos:
  - **cruzamento automático**: em cada pavimento que os dois serviços têm em comum, o sucessor só começa depois que a predecessora terminou ali;
  - **pavimento específico**: o sucessor começa no seu primeiro pavimento depois que a predecessora termina aquele pavimento.
- **equipes**, com nome e número de pessoas;
- **unidade de medição** (%, apartamento, m², m, unidade ou outra) e total previsto.

A obra tem um número de pavimentos, e cada um pode ter um nome ("Térreo", "Cobertura"). O botão "Usar os locais da obra" preenche esses nomes com os locais importados do Prevision, em ordem de altura (`height`/`byHeight`, agora exportados por `line-of-balance.tsx`). Fachadas, halls e equipamentos ficam de fora, porque não têm altura.

### Telas do planejador

- **Fluxograma** (`plan-canvas.tsx`): diagrama de rede AON. Cada coluna é um nível de precedência, cada cartão é um serviço e as setas são as predecessoras, com a espera e o pavimento de referência escritos na seta. Cada cartão traz uma miniatura da Linha de Balanço do serviço e pode ser expandido no lugar, mostrando os pavimentos com início e término.
- **Expandir em Linha de Balanço**: a obra inteira passa para a Linha de Balanço, e cada retângulo de pavimento sai da miniatura do cartão e anima até a sua posição no gráfico (tempo × pavimento). Com `prefers-reduced-motion` a troca é instantânea. Na Linha de Balanço há zoom, linha de hoje, sobreposição cinza da linha de base escolhida e barra de avanço medido por pavimento. Arrastar um serviço o reprograma: a data nunca fica antes do mínimo das predecessoras, e as sucessoras são empurradas.
- **Indicadores**: serviços, pavimentos, prazo planejado em meses (com a diferença para a linha de base) e avanço físico.
- **Resumo dos serviços**: tabela expansível por pavimento, com botão de ocultar e mostrar.
- **Alocação de equipes**: pico diário de pessoas por equipe em cada semana.
- **Formulário do serviço** (`activity-form.tsx`), **pavimentos**, **linhas de base** e **medições** (`plan-panels.tsx`).
- **Exportar e importar** em JSON. A importação também aceita o `.plp.json` exportado pela ferramenta antiga (`fromLegacyProject`), que converte as chaves em português e a predecessora única dos arquivos mais antigos.
- Plano vazio oferece um **exemplo de edifício** encadeado (`examplePlanDocument`), para partir de algo e ajustar.

### Onde o dado fica — decisão

O plano é **um documento JSON por obra**, na tabela `long_term_plans` (migração `0024_long_term_plans.sql`), lido e gravado por `GET/PUT /api/long-term-plan` (`src/app/api/long-term-plan/route.ts`). Ele fica **fora do snapshot de planejamento** e não passa por `commit_planning`, como `ifc_federations`. Motivos:

- O original já era um documento único.
- O plano é editado como um todo: arrastar um serviço reprograma a cadeia inteira.
- Uma migração ausente ou um plano com problema não derruba as outras telas, porque o snapshot lê todas as tabelas em cada requisição.

Consequências dessa escolha:

- O plano e as `Activity` dos vagões são registros distintos, ligados pela geração de vagões (seção seguinte). Editar o plano não muda os vagões sozinho.
- **Não há histórico campo a campo** (`history_events`). Ficam registrados só a última gravação (`updated_at`, `updated_by`) e as linhas de base, que são fotos do plano.
- **Concorrência**: cada gravação envia a `revision` lida, e o servidor só grava se ela ainda for a do banco. Se outra pessoa salvou no meio tempo, a resposta é 409, a tela fica só leitura e oferece recarregar. Assim nenhuma edição é apagada em silêncio.
- **Salvamento automático** 1 s depois da última alteração, como no original. Fechar a aba com alteração pendente faz o navegador perguntar antes.
- Perfil **Consulta** vê tudo e não altera nada, e a API recusa a gravação.

### Diferenças em relação ao original — correções

Regras em `src/domain/long-term-plan.ts`, com testes em `tests/long-term-plan.test.ts`:

- **Cruzamento automático exato.** O original olhava só o primeiro ou o último pavimento. Com duração própria num pavimento do meio, ou com faixas de pavimentos diferentes, a sucessora podia cruzar a predecessora. Agora a regra confere todos os pavimentos em comum. Sem pavimento em comum, vale término-início do serviço inteiro.
- **Fim do serviço** é o do pavimento que termina por último. O original usava a duração padrão do último pavimento e ignorava as durações próprias. O mesmo vale para a alocação de equipes, que no original também ignorava a duração por pavimento.
- **Término mostrado é o último dia trabalhado.** O original exibia o dia seguinte: 5 dias a partir de segunda apareciam terminando no sábado.
- **Reprogramação em ordem topológica.** O original fazia várias passadas sem ordem. **Ciclo de predecessoras** agora é impedido: o formulário não oferece as opções que fechariam um ciclo, e a API recusa.
- **Avanço físico ponderado** pelos pavimento-dias de cada serviço. Serviço com unidade e ainda sem medição conta como 0%. O original fazia média simples só dos serviços já medidos, o que inflava o avanço no começo da obra.
- A unidade de medição fica **travada** depois da primeira medição do serviço. No original isso estava pela metade (`temMedicoes = false`).
- Excluir um serviço remove também os vínculos que apontavam para ele e as medições dele.

### O que ficou de fora

- **Restrições criadas no formulário do serviço.** O original tinha um quadro de restrições próprio. Aqui a `Restriction` depende de um vagão, e o serviço do planejador não tem vagão. As restrições continuam na visão "Prevision e restrições".
- **Vários projetos por obra.** O original tinha uma lista de projetos. Aqui é um plano por obra, e as linhas de base guardam as versões.
- Dias úteis e feriados: o macro é em dias corridos, como no original.

### Migração 0024 — aplicada em 25/09/2026

`0024_long_term_plans.sql` cria `long_term_plans` com `work_id` como chave, `document` jsonb, `revision`, `updated_at` e `updated_by`, e liga o RLS sem política: o acesso é só pela API, com a chave de serviço, como nas tabelas IFC. **Não reescreve `commit_planning`** e pode ser rodada de novo (`if not exists`). O usuário a aplicou no Supabase remoto em 25/09/2026; a tabela responde pela API REST.

### Validação (25/09/2026)

- `npx tsc --noEmit`: sem erros. `npm test`: 249 testes passando, 15 deles novos, em `tests/long-term-plan.test.ts`. Os testes cobrem o cálculo por pavimento, o cruzamento exato, a predecessora por pavimento, a cascata e o "Recalcular", os níveis do fluxograma, o ciclo, a validação, o pico de equipe, o avanço ponderado, o plano de exemplo e a conversão do `.plp.json` antigo.
- **Navegador** (Playwright sobre o `next dev` local, com o acesso sem login de `DEV_AUTH_BYPASS_PROFILE_ID`, na obra Brizz Smart Stay). Como a `0024` ainda não existe no banco, a API do plano foi **simulada** no navegador. O que foi conferido:
  - o fluxograma com setas e rótulos de espera e pavimento;
  - a animação fluxograma → Linha de Balanço e a volta;
  - o cartão expandido nos pavimentos;
  - o cadastro de um serviço com predecessora, gravado com o vínculo;
  - o arraste da Estrutura, que empurrou a Alvenaria os mesmos 19 dias e gravou com a revisão seguinte;
  - o plano vazio com "exemplo de edifício";
  - os painéis de pavimentos, linhas de base e medições;
  - a visão "Prevision e restrições".
  
  Nenhum erro apareceu no console. Na primeira rodada os rótulos de todos os serviços caíam no mesmo pavimento e se sobrepunham. Isso foi corrigido: cada serviço desloca o rótulo três pavimentos.
- **API de verdade, sem a migração:** o GET responde "Aplique a migração 0024_long_term_plans.sql…". O PUT com pavimento fora da obra é recusado com a mensagem da validação.
- **Não validado:** gravação real no Supabase, dois usuários salvando ao mesmo tempo (o 409), celular, e um plano grande (400 serviços × 60 pavimentos). No último caso as camadas esmaecidas continuam no DOM, e com linha de base são cerca de 48 mil retângulos.

### O plano é o responsável pelas atividades dos vagões (25/09/2026)

Decisão do usuário, no mesmo dia: **o plano de longo prazo responde pelas atividades dos vagões**. O botão **"Gerar vagões"** no Planejador (`planner/wagon-sync.tsx`) leva o plano salvo para uma sequência de vagões da obra, ou cria uma se a obra ainda não tem.

**Como funciona** (`src/application/use-cases/sync-long-term-plan.ts`, comando `sync_long_term_plan` em `commands.ts`, rota `POST /api/long-term-plan/sync`):

- Cada serviço × pavimento do plano vira atividade de vagão, com o pavimento como local, criado se ainda não existir. Entram todos os serviços, inclusive os ocultos no gráfico, porque ocultar é só leitura.
- **Vagões liberados não mudam.** O plano ocupa só a cauda não liberada, a partir do dia seguinte ao último vagão liberado, ou de hoje / do início da sequência, o que vier mais tarde. O que termina antes dessa fronteira fica fora, e a prévia informa quantos.
- A cauda vira uma **grade contínua** de vagões com o takt da sequência. Em dias úteis, cada vagão vai de segunda a domingo e conta só os dias úteis como takt; sem essa continuidade, o fatiamento recusaria as atividades. Cada serviço × pavimento é fatiado nos vagões que atravessa pelo mesmo `sliceActivity` da importação do Prevision ("parte 2 de 3 · 35%", peso proporcional). Vagão da grade sem atividade não é criado.
- **Idempotente.** Vagão que começa no mesmo dia de um vagão da cauda reaproveita o registro, com as restrições e pendências dele. Atividade com a mesma chave `plano:<serviço>:<pavimento>#<parte>@<início do vagão>` reaproveita o registro, com avanço, critérios, equipe e anotação. Gerar de novo sem mudar o plano não perde nada; um teste garante isso.
- O que sai é sempre mostrado na prévia antes de confirmar: vagões da cauda que não voltam, e junto deles restrições e pendências; atividades que o plano não gera mais, e quantas tinham avanço ou critério atendido; atividades do Prevision ou de demonstração na cauda, que são substituídas. Atividade **manual** sobrevive se o vagão dela continua e ela ainda cabe no período.
- A equipe da atividade é preenchida quando o nome de uma equipe do plano coincide com uma equipe cadastrada na obra.
- A rota lê o plano **salvo** no banco, nunca o que o navegador mandar, e exige a revisão que a tela mostra (409 se mudou). A rota genérica `/api/planning/commands` recusa `sync_long_term_plan`.
- Depois de gerar, `long_term_plans` guarda a revisão, a sequência, a data e o autor. O Planejador avisa quando o plano mudou depois da última geração.
- **Prevision:** a sincronização em Integrações continua atualizando o cache de leitura, mas **não regenera** sequência que já tem atividade de origem `long_term`. Regenerar ali apagaria a cauda montada pelo plano.
- Origem nova `Activity.origin = 'long_term'`, com rótulo "Plano de longo prazo" no detalhe do vagão.

**Migração 0026** (`0026_long_term_wagons.sql`) — **aplicada pelo usuário em 25/09/2026.** Ela acrescenta `synced_revision`, `synced_sequence_id`, `synced_at` e `synced_by` a `long_term_plans` e alarga a checagem `activities_origin_check` para aceitar `long_term`. Não reescreve `commit_planning`. Ficou separada da 0024 porque a 0024 já tinha sido aplicada quando a decisão veio. As colunas novas foram conferidas pela API REST (resposta 200).

**Validação:** 6 testes novos em `tests/long-term-sync.test.ts` cobrem a geração encadeada, os pesos somando 1 por serviço × pavimento, a idempotência com avanço e restrição preservados, o adiamento que troca vagões, o vagão liberado intocado com a cauda começando no dia seguinte, a grade em dias úteis e o bloqueio na rota genérica. No navegador, o diálogo foi conferido com a API simulada: prévia, confirmação e aviso de "vagões em dia". **Não foi rodada nenhuma geração real no Supabase:** a primeira deve ser feita pelo usuário, conferindo a prévia. Na obra Brizz Smart Stay, a sequência "Planejamento principal" tem takt de 21 dias e atividades do Prevision na cauda, que seriam substituídas pelas do plano.

### Pendências

- Primeira geração real de vagões, conferindo a prévia.
- O médio prazo e o 4D leem as atividades dos vagões; passam a refletir o plano só depois de gerar os vagões.
- Restrições ligadas a serviço e pavimento do planejador.
- Histórico de alterações do plano.

## Curto prazo com a cara da planilha (25/09/2026)

O usuário pediu que a aba 4 ficasse mais parecida com a planilha do Google Sheets usada hoje, com o mesmo efeito de lista suspensa para empresas, semanas, status e causas. Decisões tomadas com ele:

- **Empresa:** lista suspensa com as empresas do cadastro e as já digitadas na planilha, sem repetir grafias equivalentes (`companyOptions`). Aceita digitar uma empresa nova, que passa a aparecer na lista.
- **Equipe:** lista filtrada pela empresa da linha. Um nome novo cria a equipe no cadastro daquela empresa (`create_team`), com capacidade 3 (`NEW_TEAM_CAPACITY`) como ponto de partida, ajustável em Configurações. Trocar a empresa de uma linha desfaz a equipe de outra empresa.
- **Semana:** lista da primeira semana da obra até 4 semanas depois da atual (`weekOptions`), no formato "número · início". Vale para a coluna e para o "Semana analisada".
- **Status:** pílula verde (Sim) ou vermelha (Não).
- **Causas:** a lista fica travada até o Status ser Não, e então é obrigatória. Escolher Não sem causa não grava nada: a linha fica marcada e um aviso aparece no topo. O apontamento é gravado quando a causa é escolhida, porque `record_fulfillment` exige a causa. **Correção de comportamento:** antes, a tela mandava a primeira causa da lista automaticamente, gerando causa falsa no Pareto.
- **Filtros:** funil em todas as colunas, como no Sheets, com classificação A→Z/Z→A, busca e marcação de valores. A classificação de datas usa a data, não o texto "dd/mm". Filtro e classificação não alteram o PPC, que continua sendo da semana inteira.
- **Ordem padrão:** por empresa e, dentro dela, por início, como na planilha de origem.
- **Aparência:** manteve o estilo do Obra 360, por escolha do usuário, sem a faixa azul do Sheets.
- **Vocabulário:** "Gerar pendência" virou **Gerar restrição**, alinhado ao módulo de restrições da aba 1.

Arquivos: `src/modules/curto-prazo/sheet-controls.tsx` (`PillSelect`, `PillCombo` e `ColumnFilter`; os popovers ficam num portal com `data-sheet-popover`) e `src/modules/curto-prazo/sheet-view.ts` (filtro, ordem, semanas e empresas). Os testes estão em `tests/sheet-view.test.ts` (8) e `tests/sheet-controls.test.ts` (4).

**Validação:** a tela foi aberta num Chrome controlado por script, pelo acesso local sem login, com linhas de exemplo injetadas só no navegador: nenhum dado foi gravado. Foram conferidos as pílulas, o Não aguardando causa, o funil de Empresa e a criação de equipe filtrada pela empresa, sem erros no console. A gravação real de cada lista ainda não foi exercitada, porque exigiria escrever no banco de produção.

**Resolvido em seguida (ver "Semana 1 de cada obra"):** a numeração da semana era contada a partir da primeira semana com linha na obra (em obra nova, a atual é a 1). A planilha de origem usa outra origem (ex.: 113). Falta decidir se o número deve seguir a contagem da planilha.

## Etapa 4 — o médio prazo no layout do MS Project (25/09/2026)

O usuário pediu que a aba 3 ficasse mais parecida com o MS Project, que é onde a equipe faz o médio prazo hoje, e mandou um print da tela do Project que usam (Gantt de acompanhamento da obra MZN). As decisões foram tomadas com ele antes de codar:

| Pergunta | Decisão |
| --- | --- |
| O que mais faz falta | Tabela e Gantt lado a lado; datas que se recalculam. Caminho crítico e arrastar barras **não** foram pedidos. |
| Reprogramação | Automática, como o Project. Data digitada = "Não iniciar antes de". |
| Origem do plano | Digitado direto no sistema (sem importar XML do Project). |
| Período | **Um cronograma por mês**, cada um com **horizonte de três meses**. O usuário chegou a responder "janela móvel" e se corrigiu. |
| Mês seguinte | Nasce como **cópia do mês anterior**. |
| Linha de base | Quando o usuário clicar, como no Project. |
| Datas reais | Como no Project: % > 0 preenche o início real, 100% preenche o término real, e a data real prende a tarefa. |
| Gravação | Mantém rascunho + "Revisar e salvar" com motivo obrigatório. |
| Visual | Layout do Project, visual do Obra 360 (sem faixa de opções nem azul do Project). |

### Tela (`src/modules/medio-prazo/schedule-sheet.tsx` + `gantt-chart.tsx`)

- **Tabela e Gantt lado a lado**, com divisória arrastável e a mesma rolagem vertical. Modos "Tabela e Gantt", "Somente tabela" e "Somente Gantt" e escala Dias/Semanas/Meses ficam na barra de status, como no Project. O Gantt se alinha à tabela **medindo** a altura da linha e do cabeçalho (ResizeObserver), não por constante.
- **Colunas do print**, nesta ordem: Id, Indicadores, % concluída, Nome da tarefa (com EAP 1.1 e recolher), Duração ("10 dias", "10 dias corridos", "0 dias"), Início real, Término real, Início, Término, Início e Término da linha de base, Predecessoras ("18;19", "27TI+6 dias") e Nomes dos recursos. Anotações, % alvo, Desvio, Decorrido e Variação continuam disponíveis em "Colunas", ocultas por padrão. Datas no formato "Seg 24/08/26", com "ND" onde não há data. A entrada aceita o mesmo texto copiado do Project.
- **Linha 0**: resumo do cronograma inteiro (envelope das datas, % ponderado pela duração).
- **Indicadores**: concluída, "Não iniciar antes de" (só quando é a restrição, e não a rede, que segura o início), fora do horizonte e anotação. Cada um tem ícone e texto, nunca só cor.
- **Gantt de acompanhamento** (`gantt-chart.tsx`, componente só de apresentação):
  - barra azul com o avanço preenchido e, com linha de base escolhida, barra cinza embaixo;
  - resumo como colchete preto e marco como losango com "dd/mm";
  - setas com cotovelo nos quatro tipos de vínculo;
  - linha verde de hoje, tracejado no início e no fim do horizonte, sombra fora do horizonte e nos dias não úteis;
  - clique na barra seleciona a linha na tabela.
  As funções de layout são puras e testadas em `tests/gantt-chart.test.ts`.
- **Ferramentas e teclado do Project**: Inserir tarefa acima da selecionada (Insert), recuar e diminuir o recuo (Alt+Shift+→/←), Vincular as selecionadas em TI (Ctrl+F2), Desvincular (Ctrl+Shift+F2) e Excluir. Mantidos: cadeado, desfazer e refazer, Ctrl+D, copiar e colar, filtros e modo reunião. Recuar uma linha que vira resumo tira dela os vínculos e as datas reais, que passam a ficar nas subtarefas.
- **Horizonte**: o cabeçalho mostra "Horizonte de três meses: Ter 01/09/26 a Seg 30/11/26". Tarefas fora dele recebem indicador e aviso e têm o filtro "Fora do horizonte". São sinalizadas, **não bloqueadas**, porque a rede pode empurrar uma tarefa para fora.
- **Novo cronograma do mês**: o mês seguinte ao último vem sugerido, junto com "Cópia de ‹mês›" ou "Em branco".
- **Linha de base**: a mais recente aparece por padrão (o Project mostra a base sempre).
- **Plano gravado antes desta etapa**: ao abrir, a tela aplica a regra nova. Tarefa com % e sem início real recebe o início previsto, e o "Não iniciar antes de" passa a valer junto das predecessoras. Um aviso azul diz quantas linhas mudaram. O ajuste vai ao banco no próximo "Revisar e salvar", e o diálogo de revisão também o menciona. Sem isso, o servidor recusaria a gravação.
- Removido `src/modules/medio-prazo/gantt.tsx`: a grade antiga, sem uso desde a etapa 2. O passo "medio-gantt" do tour apontava para ela e estava quebrado; agora aponta para a tela nova, e os textos do tour foram reescritos.
- Corrigido no caminho: começar a digitar direto numa célula selecionava a primeira letra, e a segunda a apagava.

### Domínio e servidor

- `PlanTask.actualStart`/`actualEnd` e `MediumTermPlan.copiedFromPlanId`, gravados em `schedule_meta` (jsonb criado na 0023). **Nenhuma migração nova.**
- `scheduleTasks` (`src/domain/plan-schedule.ts`):
  - com data real, o início é o início real e o término é o término real, e a rede não move a tarefa;
  - sem data real, o início é o **mais tarde** entre `anchorStart` ("Não iniciar antes de") e os limites das predecessoras. Antes, `anchorStart` era ignorado quando havia predecessora;
  - **marco** (duração 0) tem início = término e, ligado por TI, fica no dia em que a predecessora termina, como no Project. A tarefa depois dele começa no dia útil seguinte.
- `withProgress`, `withActualStart` e `withActualEnd` aplicam as regras do Project entre % e datas reais:
  - 0% apaga as datas reais;
  - % acima de 0 preenche o início real;
  - 100% preenche o término real;
  - término real põe a tarefa em 100% e recalcula a duração.
  Limpar o término real com 100% é recusado, e a mensagem pede para reduzir o % antes.
- `parseDuration` e `formatDuration` entendem o texto do Project ("10 dias", "10 dias corridos", "8 horas", "2 meses", "0 dias"). `parseLinks` e `formatLink` passam a escrever `27TI+6 dias` e `12II+2 dias corridos`, com `;` como separador, e continuam aceitando `2d`/`2dd` e vírgula.
- `planWindow(month)`: do dia 1 do mês ao último dia do mês + 2.
- `rollUpPlan`: o resumo passa a ter início real (o mais cedo), término real (só quando todas as subtarefas terminaram) e `milestone`.
- `save_plan_revision` valida as datas reais:
  - término real exige início real, e o início não pode vir depois do término;
  - término real exige 100%, e % acima de 0 exige início real;
  - resumo não recebe data real.
  As datas reais entram no histórico por campo.
- `create_plan` com `copyFrom`:
  - copia tarefas (com ids novos), vínculos, calendário, recursos, anotações, % e datas reais;
  - deixa de fora as tarefas concluídas antes do novo horizonte e os resumos que ficam sem filhos;
  - acerta os níveis;
  - quando uma tarefa perde uma predecessora, fixa o início dela para a data não pular;
  - recusa copiar de linha de base, de mês posterior e de outra obra.
  O plano de origem não muda.

### Validação

- `npm test`: 249 testes passando, incluindo `tests/plan-monthly.test.ts` (14 testes) e `tests/gantt-chart.test.ts` (11 testes). `tests/plan-schedule.test.ts` e `tests/expansao.test.ts` foram ajustados à regra nova: duração 0 agora é aceita, revisão com % exige início real, e mudou o formato do texto do vínculo.
- `npm run typecheck`: limpo nos arquivos desta etapa. Os únicos erros são de `src/modules/longo-prazo/planner/`, trabalho em andamento de outra sessão.
- **Navegador**: a tela foi aberta com `next dev` e o acesso de desenvolvimento, e dirigida por Playwright sem janela, com as gravações bloqueadas na rede. O cenário foi montado só no rascunho, **sem salvar**: resumo com três subtarefas, predecessoras `2` e `3TI+2 dias`, marco de 0 dias, 100% e 40%. As datas conferiram com o Project. A tabela e o Gantt ficaram alinhados, e o console não registrou erros.

### Pendências

- Não foi feito nenhum "Revisar e salvar" real com datas reais nem criado nenhum mês por cópia no Supabase. As duas coisas estão cobertas pelos testes do comando, mas falta um uso real.
- Não foi validado com um plano grande (centenas de linhas) nem em tela de celular. No celular, o modo "Somente tabela" é o indicado.
- Não pedidos e não feitos: caminho crítico e folga, arrastar barras no Gantt, importar ou exportar XML do Project, e "rolar até a tarefa".
- O resumo de marcos conta com peso 1 no % ponderado.


## Semana 1 de cada obra (25/09/2026)

A pedido do usuário, **Configurações da obra** ganhou o campo **Numeração das semanas**, que define a semana 1 da obra. É dela que sai o número de cada semana no curto prazo, para bater com a planilha da obra (que estava na semana 113). A semana 1 pode ser informada de dois jeitos: pelo **número da semana atual** (113 → semana 1 = 29/07/2024) ou pela **data**. Qualquer dia vale pela segunda-feira da semana. Há também um botão para voltar à numeração automática, que conta a partir da primeira semana com linha na planilha. No curto prazo, ao lado de "Semana atual", o link "definir/alterar semana 1" leva ao campo. A lista de semanas passa a começar na semana 1.

**Onde fica:** tabela própria `work_settings` (migração `0025_work_settings.sql`, **criada e não aplicada**), lida e gravada por `GET/PUT /api/work-settings`, com o gancho `useWorkSettings` (`src/modules/configuracoes/work-settings.ts`). Ficou fora do snapshot de propósito: outra sessão estava alterando `entities`, `commands` e `mappers`, e pôr a semana 1 em `works` exigiria reescrever `commit_planning`. Sem a migração, a leitura responde "indisponível", o curto prazo segue com a numeração automática e a configuração mostra o aviso. Consulta vê, os demais perfis gravam, e a obra é verificada no servidor. O banco recusa uma data que não seja segunda-feira.

**Regras:** `src/domain/week-numbering.ts` (`normalizeWeekOne`, `weekNumberFrom`, `weekOneFromCurrent`), com testes em `tests/week-numbering.test.ts` (5). Semanas anteriores à semana 1 aparecem com número zero ou negativo.

**Validação:** a rota respondeu "indisponível" com o banco atual e recusou data inválida. No navegador de teste, com a resposta simulada, a configuração mostrou a prévia "113 → 29/07/2024", e o curto prazo passou a mostrar "Semana atual: 113", com as semanas de 1 a 117. A gravação real depende da `0025`.

## Revisão de operação e estética (01 e 02/10/2026)

Registro completo em `docs/revisao-2026-10-01.md`. O que toca os três níveis:

- **Bug corrigido:** a sincronização do Prevision (`POST /api/prevision/schedule`) usava a data fixa de demonstração 08/09/2026 como "hoje" ao regenerar a cauda dos vagões; passou a usar o relógio único das rotas (`src/infrastructure/clock.ts`), o mesmo da geração de vagões pelo plano e dos comandos.
- **02/10/2026 — o usuário cancelou o BIM 4D.** As abas passam a ser quatro: longo prazo, vagões, médio prazo e curto prazo. O modelo federado e os arquivos IFC ficam no grupo Apoio.
- **Snapshot por obra e histórico fora dele:** migração `0027_planning_snapshot.sql` (aplicada em 02/10/2026; sem ela a leitura volta a ser por tabela). O histórico do vagão e o histórico da tarefa do plano do mês passam a vir de `GET /api/history`, pelo hook `useHistory`.
- **Aba 3 em seções na URL** (`?secao=cronograma|janela|equipes|cobertura|historico|recursos|linha-de-base`), com um único cabeçalho e o alternador no padrão da aba 1.
- **Aba 4 no celular:** cada linha da planilha vira um cartão abaixo de 1024 px, com as mesmas pílulas de Status e Causa; a tabela com os filtros de coluna continua no desktop.
- **Em todas as abas:** cabeçalho único (`TabHeader` com ajuda "Como funciona"), prosa explicativa movida para a ajuda contextual, formulários em gaveta lateral (`CommandForm`), confirmações próprias no lugar do `window.confirm`, avisos por toast, paleta única dos gráficos (`src/shared/palette.ts`: planejado azul, executado verde, hoje âmbar, atrasado vermelho, linha de base cinza) e tipografia mínima de 12 px.
- **Provider:** recarga ao voltar o foco e a cada dois minutos, dados antigos mantidos durante a recarga, faixa "Sem resposta do servidor" com tentar de novo.

**Pendências desta revisão:** 0027 e 0025 aplicadas (conferido em 02/10/2026); versão por obra na concorrência (hoje `planning_meta.version` é único); validar no navegador autenticado as telas reorganizadas.

## Go-live do curto prazo (07/10/2026)

O curto prazo entra sozinho em produção num Supabase novo da ATR. Os outros níveis (longo prazo, vagões e médio prazo) e o grupo Apoio continuam no código, mas ficam restritos a quem está em `DEVELOPER_EMAILS` até serem liberados, um de cada vez. O histórico semanal do Sheets entra pelo importador `scripts/import-curto-prazo.ts`. Detalhes, validação e pendências estão em [go-live-curto-prazo.md](go-live-curto-prazo.md).

## Curto prazo: colunas ajustáveis e PDFs da semana (08/10/2026)

O usuário disse que a planilha estava ruim de usar e pediu duas coisas: colunas de largura arrastável e PDFs do planejamento e do fechamento, no formato da planilha da obra. Ele enviou dois exemplos: "PCP-BLT - Semana 115" e "PCP-BLT - Resultados Semana 114".

- **Colunas ajustáveis** (`src/modules/curto-prazo/column-widths.tsx`):
  - a tabela passou a `table-layout: fixed`, com `<colgroup>`;
  - cada cabeçalho tem uma alça na borda direita: arrastar muda a largura, duplo clique volta ao padrão e, com foco na alça, as setas ajustam;
  - as larguras ficam no `localStorage` de cada pessoa (`obra360.curto-prazo.colunas`), porque são preferência de quem lê, não dado da obra;
  - "Larguras padrão" restaura todas;
  - os padrões estão em `COLUMN_DEFAULTS` (`commitments-overview.tsx`). Os dias da semana têm 68 px para o cabeçalho com o filtro não cortar.
- **PDFs** (`src/modules/curto-prazo/print-sheet.tsx`, rota `src/app/imprimir/curto-prazo/[obraId]/page.tsx`):
  - os botões "PDF do planejamento" e "PDF do fechamento" abrem, numa aba nova, uma página fora do layout do sistema, que chama a impressão do navegador ("Salvar como PDF", A4 paisagem);
  - o título da página vira o nome do arquivo: `PCP-<código> - Semana N` ou `PCP-<código> - Resultados Semana N`;
  - o cabeçalho (faixa azul, obra, semana analisada e atual, datas sobre Seg. a Sáb.) fica no `<thead>` e se repete em cada folha;
  - a ordem das linhas é a padrão da planilha (empresa, depois início), sem os filtros da tela;
  - o fechamento acrescenta Realizado (Sim em verde, Não em vermelho), Causas e Justificativa.
  - O login continua exigido pelo proxy, e os dados vêm da mesma `/api/planning`.
- **Sem biblioteca de PDF:** a impressão do navegador dá o resultado do exemplo e evita mais uma dependência.
- **Validação:**
  - o sistema rodou localmente contra o banco de produção, só leitura e com o acesso local sem login;
  - o Playwright renderizou as semanas 114 (fechamento) e 115 (planejamento) da Blentt, e os títulos saíram exatamente como os nomes dos arquivos do usuário;
  - a planilha da tela foi conferida por captura;
  - checagens: TypeScript, ESLint, 337 testes e build.

## Curto prazo: semana encerrada e janela do PDF (08/10/2026)

- **Semana encerrada** (`src/domain/week-lock.ts`, testes em `tests/week-lock.test.ts`):
  - o usuário pediu que a semana que ficou para trás congele, de modo que só admins editem, e escolheu a folga: **até a terça-feira seguinte, inclusive**, para lançar o fechamento;
  - `isWeekLocked(weekStart, today)` vale quando hoje passa de segunda + 8 dias, e "hoje" é o de São Paulo;
  - o servidor (`applyCommand`) recusa `create_commitment`, `update_commitment` (nas duas pontas: tirar a linha de uma semana encerrada ou pôr nela), `record_fulfillment` e `delete_commitment` quando a semana está encerrada e o ator não é admin;
  - na planilha, a semana encerrada fica só para leitura para quem não é admin, com aviso. O admin vê um aviso de que está alterando uma semana encerrada;
  - o importador do histórico passou a exigir **admin**, porque todo histórico cai em semanas encerradas.
- **Janela do PDF** (`src/modules/curto-prazo/print-dialog.tsx`):
  - os botões "PDF do planejamento" e "PDF do fechamento" abrem antes uma janela;
  - a janela tem a lista de empreiteiros no estilo do filtro de coluna da planilha (pesquisar, selecionar tudo, limpar, contagem de linhas) e começa com o filtro de Empresa da planilha, se houver;
  - também tem a ordem das linhas: **por empreiteiro** (empresa, depois início) ou **por data de início** (início, depois empresa);
  - os empreiteiros desmarcados vão na URL como `excluir`, e a ordem como `ordem=inicio|empreiteiro`. A página de impressão aplica os dois.
- **Validação:**
  - o sistema rodou localmente contra a produção, com o acesso local sem login no perfil de um planejador;
  - a semana 114 da Blentt apareceu encerrada e só para leitura;
  - uma edição que regravava os mesmos valores foi recusada pelo servidor com 400;
  - o PDF de fechamento sem ATR ENG e por data de início saiu com 105 linhas e nenhuma do ATR ENG.

## Curto prazo: retorno da implantação (09/10/2026)

O Daniel (planejador da Blentt) testou em produção e mandou observações. O que foi achado e corrigido:

- **"Painel ruim" / tela deslocada:**
  - a página chegava a 2.473 px numa tela de 1.366;
  - a causa eram os ícones das células (`position: absolute`, 582 deles), que escapavam do quadro da planilha porque o quadro não era posicionado e alargavam a página inteira;
  - o quadro passou a `relative`, com altura limitada (`max-h-[calc(100dvh-12rem)]`) e rolagem própria nos dois sentidos, e o cabeçalho ficou fixo (`sticky`). A barra de rolagem lateral, que antes só aparecia depois de 148 linhas, fica à vista.
- **"Travando":**
  - a semana tinha 46 mil elementos, porque a tabela e os cartões do celular eram desenhados juntos e um deles ficava escondido por CSS. Agora `useWideScreen` desenha só um dos dois, e a página caiu para 22 mil;
  - a recarga automática (a cada 5 min (com verificação de versão antes, desde 12/10/2026) e ao voltar à aba) baixa os ~3 MB da obra e redesenhava tudo, até duas vezes por recarga. Agora uma resposta idêntica à anterior não muda estado nenhum, e o "Recarregando…" só aparece quando há aviso de conexão.
- **"Larguras padrão" não fazia nada:** sem larguras mexidas, voltar ao padrão não muda nada visível. Ele virou **"Ajustar à tela"** (`fitWidths`, testado em `tests/column-widths.test.ts`), que reduz as colunas proporcionalmente até o mínimo legível de cada uma (`COLUMN_MIN`). Sem preferência gravada, a planilha já abre ajustada. Duplo clique na borda continua voltando a coluna ao padrão.
- **Linha nova pulava para a ordem alfabética:**
  - a ordem das linhas fica presa enquanto se edita: linha nova entra no fim, e linha editada não muda de lugar, como no Sheets;
  - "Organizar por empresa" aparece quando a ordem diverge e volta à ordem padrão. Trocar de semana ou recarregar também volta;
  - classificar por uma coluna, no funil, continua valendo por cima.
- **Validação:**
  - medido com o Playwright numa tela de 1.366×768, contra os dados reais e com o perfil de planejador;
  - a página ficou com 1.366 px, sem rolagem lateral, e o cabeçalho continua fixo ao rolar.
  - A ordem estável não foi exercitada criando linhas em produção, para não deixar histórico de teste. A lógica fica em `commitments-overview.tsx` (`pinned`).
- **Ordem de inclusão como padrão (09/10/2026, segundo retorno):** o usuário pediu que a tarefa adicionada não suba na lista e fique embaixo, para uma experiência linear. A ordem presa só durante a sessão não bastava, porque ao recarregar a planilha voltava a ordenar por empresa. Agora:
  - a ordem padrão é `createdAt`: a nova entra embaixo e fica embaixo, mesmo depois de recarregar;
  - no histórico importado, as linhas de uma semana têm o mesmo `createdAt`, e o desempate é o da planilha de origem (empresa, depois início);
  - acima da planilha, "Organizar por empresa" agrupa por empresa durante a sessão (as novas continuam entrando embaixo), e "Voltar à ordem de inclusão" desfaz;
  - testado com o Playwright interceptando a gravação, sem escrever em produção: a linha nova ficou em 117 de 117, depois de incluir e depois de recarregar.
- **Apontamento livre (09/10/2026):**
  - o usuário pediu para liberar desde já o preenchimento do Realizado e das causas;
  - na semana atual isso já era livre, então a decisão foi tirar a trava de semana encerrada do **apontamento**;
  - `record_fulfillment` (Realizado, causa, justificativa) não confere mais a semana: quem pode editar a obra lança ou corrige o apontamento em qualquer semana;
  - criar, editar e excluir linhas de semana encerrada continua só para admins;
  - na planilha, os campos de Status, Causa e Justificativa ficam habilitados na semana encerrada (só o perfil de consulta não edita), e o aviso e a ajuda explicam a regra;
  - testes em `tests/week-lock-commands.test.ts`.
- **"A tarefa sobe ao marcar Sim/Não" e varredura de bugs (09/10/2026):**
  - A reprodução com gravação real, perfil de admin e o código publicado não moveu a linha: a ordem presa não depende do apontamento. O que move é a **classificação pelo funil** (ex.: Status A→Z), que era contínua e levava a linha recém-marcada para junto das outras "Sim". Agora classificar é ação de uma vez, como no Sheets: reescreve a ordem presa, o funil indica a coluna, e nem apontar nem editar movem a linha ("Voltar à ordem de inclusão" desfaz).
  - Bugs da planilha corrigidos: Sim não podia ser corrigido para Não (`statusOf` ignorava a marcação pendente); a marcação pendente era desfeita antes de a gravação confirmar; o rascunho da linha nova era apagado antes de gravar e se perdia quando outra linha estava salvando ou o servidor recusava (agora só limpa após criar, e o foco volta ao campo para a próxima linha); gravações disparadas enquanto outra estava em curso eram descartadas em silêncio (agora entram numa fila); campos de texto e data não refletiam a linha atualizada por outra pessoa (`key` pelo valor); "Levar p/ próxima" sumia na semana encerrada embora a semana seguinte esteja aberta; o Pareto "esta semana" seguia os filtros de coluna.
  - Provedor de dados: a recarga após um comando podia reaproveitar uma leitura iniciada antes da gravação e não mostrar a mudança; agora espera essa leitura e pede outra.

## Curto prazo: retorno da implantação, segunda rodada (11/10/2026)

O Pedro (planejador da Blentt) mandou oito observações. O que foi feito:

- **"Área vazia ao rolar" e "quando mexo no PCP fica descendo":** reproduzido com o zoom do navegador em 125%: a casca de `100vh` passava da janela, o corpo da página rolava (sobrava área vazia abaixo da planilha) e o navegador rolava ao focar campos. Agora, dentro do sistema (`[data-app-shell]` no layout), `html` e `body` ficam com `overflow: hidden` e só a coluna de conteúdo rola. Login, privacidade e impressão ficam fora da casca e seguem normais.
- **Fechamento em seção própria:** a série do PPC e o Pareto saíram de baixo da planilha para `?secao=fechamento` (`closing-overview.tsx`, navegação em `section-nav.tsx`, como no médio prazo). A planilha fica sozinha na página.
- **Velocidade:** a resposta de `/api/planning` para quem não desenvolve vem sem vagões, planos e IFC (`slimForShortTerm`, `scope-planning.ts`); os cartões de obra desses usuários deixam de mostrar restrições e vagões atrasados (só o PPC). Após gravar, a planilha reflete o comando na hora (`local-apply.ts` aplicado pelo provedor) e a recarga de confirmação roda em segundo plano. A tabela redesenha só a linha alterada (`SheetRow`/`SheetCard` memorizados). Na Blentt o volume (6 mil linhas) ainda dá ~3 MB por recarga; carregar por semana fica como próximo passo.
- **"Marquei Sim para testar e não consigo voltar para vazio":** novo comando `clear_fulfillment` (liberado em qualquer semana, como o apontamento) e botão "Limpar apontamento" na coluna final da linha (e no cartão), com confirmação.
- **Coluna final:** "Do não cumprido" virou "Apontamento" e só aparece quando a semana tem algum apontamento; o ✕ ficou mais estreito.
- **"Inclusão de equipe pelo PCP":** já existia (digitar um nome novo cria a equipe); o campo ganhou a dica "Não achou? Digite o nome para criar uma equipe nova".
- **Fechamento:** filtros de empreiteiro e equipe (marcar/desmarcar, como o filtro de coluna) aplicados à série do PPC e ao Pareto; bloco "Justificativas por causa" com temas recorrentes (`justifications.ts`, agrupamento por termos, testado) e busca; botão "Analisar com IA" (`POST /api/curto-prazo/analise`, Claude via `@anthropic-ai/sdk`, modelo `claude-sonnet-5-5`), que só funciona com `ANTHROPIC_API_KEY` definida no servidor e, sem ela, avisa.
- **Relatório único das justificativas** (pedido 5): feito a partir dos dados de produção em 11/10/2026 e entregue ao usuário como página publicada; não vive no repositório.
- **Logos no PDF (11/10/2026):** no cabeçalho dos PDFs do curto prazo, o nome da obra à esquerda deu lugar aos logos da ATR e da Takt lado a lado (`/logo-atr.png` e `/logo-takt.png`, os mesmos do login), num fundo branco sobre a faixa azul; o nome da obra continua no título ao centro.

## Curto prazo: tempo nos PDFs (12/10/2026)

Pedido do usuário: previsão do tempo dia a dia no PDF do planejamento e o tempo observado no PDF do fechamento.

- **Fonte:** Open-Meteo (`src/infrastructure/integrations/weather/open-meteo.ts`): previsão de até 16 dias e dados observados de dias passados (API de previsão para as últimas semanas, arquivo ERA5 para semanas mais antigas). Sem chave. **O uso gratuito é só para fins não comerciais**; o plano comercial (~€29/mês) entra pela variável `OPEN_METEO_API_KEY`, que troca os hosts para `customer-*.open-meteo.com` sem mudar código. Decisão de licença pendente com o usuário.
- **Local da obra:** migração `0029_work_location.sql` acrescenta `place`, `latitude` e `longitude` a `work_settings`. A tela Configurações da obra ganhou o painel "Local da obra" (`work-location.tsx`): busca de cidade/endereço pela geocodificação do Open-Meteo (`/api/clima/geocode`), escolha na lista e gravação pelo `PUT /api/work-settings`, que virou atualização parcial.
- **Rota:** `GET /api/clima?workId=&semana=` (`src/app/api/clima/route.ts`) devolve os 7 dias da semana (`src/domain/weather.ts`): código WMO traduzido para rótulo e ícone, máx/mín, chuva em mm e probabilidade (só na previsão), com `observed` por dia (dia já passado = observado). Sempre responde 200: sem local ou provedor fora, `available:false` com motivo, para o PDF não travar. Cache em memória por instância (30 min previsão, 24 h arquivo).
- **No PDF** (`weather-strip.tsx`, no fim do documento): seis quadros de Seg a Sáb com ícone, rótulo, máx/mín, chuva e a marca "obs."/"prev."; título "Previsão do tempo para a semana" (planejamento), "Tempo na semana" (fechamento) ou misto na semana corrente; frase de resumo (dias com chuva relevante) e a fonte. A impressão espera a resposta do tempo por até 4 s e sai mesmo sem ela.
- **Estado em 12/10/2026:** a 0029 foi aplicada pelo usuário no `takt-hub` (colunas conferidas pela API; o painel esconde o campo de busca enquanto a migração falta, e foi isso que ele viu antes de aplicar). Pendências: informar o local de cada obra em Configurações; decidir a licença do Open-Meteo.

## Tráfego das recargas (12/10/2026)

Cada recarga do planejamento baixa a obra inteira (Blentt: 3,9 MB em JSON, ~350 KB comprimidos), e isso acontecia a cada 2 minutos por aba aberta, ao voltar à aba e depois de cada gravação. Com poucos usuários, dá ~10 GB/mês de saída no Supabase e o mesmo volume de função na Vercel, suficiente para estourar planos gratuitos. O que mudou:

- **Verificação de versão antes de recarregar:** `GET /api/planning/version` (`src/app/api/planning/version/route.ts`) devolve a `planning_meta.version`, que o `commit_planning` incrementa a cada gravação. O provedor (`planning-provider.tsx`) só baixa o planejamento quando a versão mudou; a decisão pura está em `src/application/planning-version.ts`, testada.
- **Intervalo de 2 para 5 minutos**, ainda só com a aba visível, e ao voltar à aba depois de 30 s. Uma aba parada passa de 3,9 MB a cada 2 min para algumas centenas de bytes a cada 5 min. Medido com relógio simulado: 11 min parada = 2 verificações e nenhuma recarga cheia; voltar à aba = 1 verificação.
- A recarga após uma gravação continua cheia (confirma a gravação e registra a versão nova). Próximo passo, se ainda for preciso: carregar o curto prazo por janela de semanas.
- Cada verificação ainda é uma invocação de função na Vercel com leitura de sessão e perfil; baixar isso exigiria cache do perfil no servidor.
- **Busca de endereço (12/10/2026, retorno do usuário):** a geocodificação do Open-Meteo não achava "Rua Maranhão, 2176 - Portão, Curitiba - PR", porque só conhece nomes de lugares. A busca de `/api/clima/geocode` passou a ter três caminhos: coordenadas coladas (inclusive de um link do Google Maps); endereço completo pelo **Nominatim (OpenStreetMap)** (`src/infrastructure/integrations/geocoding/nominatim.ts`: rua, número, bairro, cidade e UF, com CEP no rótulo; fila de 1 pedido/s, cache de 24 h e identificação no User-Agent, como a política do serviço pede; `GEOCODING_USER_AGENT` opcional); e, só se nada vier, o Open-Meteo. O debounce da tela subiu para 700 ms. Testes em `tests/geocoding.test.ts`.

## Velocidade ao clicar (12/10/2026)

O usuário relatou demora ao clicar. Medido de uma máquina perto do banco: gravar um apontamento levava 1,8 s no servidor (baixa o planejamento inteiro, 3,9 MB, aplica o comando e devolve os 3,9 MB ao banco, regravando 6 mil linhas); `GET /api/planning` 0,5–0,8 s; e a produção rodava as funções da Vercel em `iad1` (EUA) com o banco em São Paulo (`x-vercel-id: gru1::iad1`), somando ~130 ms a cada ida e volta. Três frentes:

- **Região das funções:** `vercel.json` ganhou `"regions": ["gru1"]` (São Paulo, ao lado do Supabase sa-east-1). Conferir pelo cabeçalho `x-vercel-id` (`gru1::gru1`).
- **Resposta imediata ao clique (feito):** `src/app/(app)/obras/loading.tsx` e `obras/[obraId]/loading.tsx` são esqueletos que o Next mostra no instante do clique em "Obras", numa obra ou numa aba, antes de a função no servidor responder; o `<Link>` da lateral já os traz no prefetch. Sem dado nenhum, de propósito.
- **Planilha ↔ Fechamento sem servidor (feito):** a página do curto prazo ficou magra (`curto-prazo/page.tsx` só renderiza `CurtoPrazoSections`); a seção vem de `?secao=` lida no cliente com `useSearchParams` (dentro de `Suspense`), e o `SectionNav` troca a URL com `window.history.pushState`, que o Next intercepta e repassa ao roteador. Voltar/Avançar, clique do meio e Ctrl/Cmd+clique seguem funcionando porque o `<a href>` é real. O planejamento já está no `PlanningProvider`; a troca não busca nada.
- **Gravar só o que mudou (feito):** `SupabasePlanningRepository.commit` manda ao `commit_planning` apenas as linhas cujo JSON mudou (`diffChangedRows`, em `mappers.ts`) e os ids apagados (`diffDeletedIds`). O `commit_planning` (migração 0023, conferido: nada o redefine até a 0029) faz `insert … on conflict do update` linha a linha e só apaga o que `p_deletes` lista, então as linhas ausentes do payload ficam como estão. Um apontamento na Blentt passou de regravar 6 mil linhas (3,9 MB) para 1 linha + 1 evento de histórico (~2 KB). Validado em `scripts/validate-plan-database.mjs` e `validate-bootstrap-sql.mjs` (payload parcial muda só a linha enviada; payload vazio e `{}` só sobem a versão).
- **Leitura recortada nos comandos do curto prazo (feito):** `commandScope` (`src/application/use-cases/command-scope.ts`) diz o que cada comando precisa, e `fetchShortTermScope` lê só isso, em paralelo, depois de ler a versão (a versão vem antes para uma gravação concorrente entre as duas leituras virar `version_conflict`, nunca sobrescrita): `record_fulfillment`, `clear_fulfillment` e `delete_commitment` leem obra, perfis, equipes da obra e a própria linha (~10 KB em vez de 3,9 MB); `create_commitment` e `update_commitment` também a semana envolvida (destino, ao mover); `create_team`/`update_team` só obra, perfis e equipes. Ficam com o planejamento inteiro: `delete_team` (confere atividades e tarefas do mês que usam a equipe), a linha vinculada a atividade do cronograma e todos os demais comandos, que ainda assim gravam só o que mudou. Testes: `tests/planning-repository.test.ts` (cliente PostgREST de mentira: tabelas e filtros lidos, payload, retry de conflito) e `tests/infrastructure.test.ts`.
- **Sem recarga depois do próprio comando (feito):** a rota de comandos devolve `{ id, version }` (a versão gravada é a esperada + 1, garantida pelo `for update` do `commit_planning`). Se ela é exatamente a conhecida + 1 (`confirmsOwnWrite`, em `planning-version.ts`), a projeção local já é o que o banco tem: o provider registra a versão nova e não baixa nada. Antes, cada clique na planilha baixava os 3,9 MB e redesenhava a planilha inteira em segundo plano, travando a tela meio segundo, e era isso que o usuário sentia como demora ao clicar. Qualquer outra resposta (versão desconhecida, salto maior porque alguém gravou no meio, comando sem projeção) recarrega como antes.
- **Uma leitura de sessão por requisição (feito):** `getAuthUser`, `loadProfile` e `getRouteAccess` em `supabase-server.ts` estão em `cache()` do React. O layout de `(app)` e a página (ou um handler que pede perfil e usuário) chamavam o Supabase duas ou três vezes no mesmo render; agora é uma.

## Etapa 5 — engenharia reversa do Project: caminho crítico, restrições, prazo final e exportação (13/10/2026)

O usuário pediu a aba 3 "o mais próximo possível do MS Project" e que se buscasse no GitHub o que existe de consolidado, com uma bancada de testes antes de trazer ao sistema. A pesquisa, os candidatos avaliados e o veredito estão em `docs/engenharia-reversa-project.md`. Em uma linha: não há motor TypeScript livre que reproduza o Project; o que há de consolidado é o conhecimento (o `MicrosoftScheduler` do MPXJ e os artigos da Microsoft) e o formato de arquivo (MSPDI). O motor próprio foi ampliado com essas regras e ganhou exportação para o Project.

### Motor (`src/domain/plan-schedule.ts`)

- `analyzeSchedule(tasks, links, calendar, { criticalSlack })` faz as duas passadas e devolve, por linha, `TaskSchedule`: início e término cedo e tardios, folga total e livre (dias úteis), crítica, o que segura a data (`drivenBy`: rede, restrição, data real, início guardado ou, no resumo, os filhos), as predecessoras determinantes (`driverIds`), vínculo desrespeitado (`conflict`) e prazo perdido (`deadlineMissed`). `scheduleTasks` continua existindo e é só as datas, para o servidor e para quem não precisa de folga.
- **Oito restrições** (`PlanTask.constraintType` + `constraintDate`; rótulos e siglas do Project em pt-BR em `CONSTRAINT_LABELS`/`CONSTRAINT_ABBREVIATIONS`): NIAD e NTAD só empurram para a frente; NIDD, NTDD, DIE e DTE prendem a data mesmo contra a rede e marcam o vínculo como desrespeitado; OMTP agenda nas datas tardias e refaz as sucessoras a partir delas. `anchorStart` (o "Não iniciar antes de" antigo) virou **legado**: `constraintOf(task)` o lê como NIAD, o mapper converte na leitura e o comando de revisão não o grava mais.
- **Prazo final** (`PlanTask.deadline`): não reprograma; corta o término tardio (folga negativa quando não cabe) e acende o indicador quando o término passa dele.
- **Passada inversa**: término tardio = o inverso exato do limite da passada direta, a partir das datas tardias das sucessoras; sem sucessora, o fim do projeto. Data real fixa as datas tardias (iniciada: início tardio = início real; concluída: término tardio = término real).
- **Folgas e crítica**: folga total = menor entre a do término e a do início; tarefa iniciada só tem a do término; concluída nunca é crítica e tem folga livre zero; folga livre nunca negativa; crítica = folga total ≤ limite (0, configurável). Resumo é crítico quando alguma subtarefa é. A folga negativa aparece na predecessora cujo término tardio fica antes do término cedo e, como o Project real mostra (conferido em 20/10/2026, corrigido em 21/10/2026), também na tarefa presa pela restrição. Desde 21/10/2026 o motor segue o Project também nas datas exibidas, com o dia e a ponta dele (08:00 ou 17:00), a tarefa em andamento dividida e as demais regras medidas: ver "Correções de 21/10/2026" em `docs/engenharia-reversa-project.md`.
- **Correção**: vínculo IT (início-término) agora termina a sucessora no dia útil **anterior** ao início da predecessora (terminar às 08:00 é terminar às 17:00 da véspera), como o Project. O motor antigo terminava no mesmo dia; o teste `motor calcula IT` mudou de propósito.

### Servidor e persistência

- `save_plan_revision` valida a restrição (tipo que exige data sem data, data inválida) e o prazo final, recusa restrição e prazo em resumo, grava `constraintType`/`constraintDate`/`deadline` e apaga `anchorStart`; os três campos entram no histórico por campo. `create_plan` com cópia leva a restrição no formato atual e, para quem perdeu a predecessora e não tinha data, cria NIAD no início atual (como antes).
- Os campos novos ficam no jsonb `schedule_meta` de `plan_tasks` (migração 0023). **Nenhuma migração nova.** O mapper lê `anchorStart` antigo como NIAD e grava sempre o formato atual.
- Não implementado (e por quê): defasagem em percentual ou horas (a coluna `lag_days` é inteira em dias; exigiria migração), duração restante separada, restrição em resumo, tarefas manuais/inativas/divididas. Lista completa em `docs/engenharia-reversa-project.md`.

### Testes e bancada

- `tests/fixtures/cenarios-project.ts` + `tests/plan-cpm.test.ts`: 33 cenários com o resultado esperado do Project (vínculos nos quatro tipos com defasagem útil e corrida, marcos, feriados, dias corridos, as oito restrições, prazo final, dois caminhos, folga total diferente da livre, resumo, datas reais, predecessora determinante) mais testes de restrições, dias úteis com sinal, tarefa iniciada/concluída, folga crítica configurável, comando de revisão e mapper. A bancada original (fora do repositório, `scratchpad/bancada/`) rodou os mesmos cenários: 169/169 checagens.

### Tela (`schedule-sheet.tsx` + `gantt-chart.tsx`)

- **Colunas novas**, todas ocultas por padrão (a tabela padrão continua igual ao print do Project): Tipo de restrição (lista com os oito tipos, em português; aceita também a sigla NIAD/NIDD/NTAD/NTDD/DIE/DTE/OMBP/OMTP ou o código ao colar), Data da restrição, Prazo final, Início tardio, Término tardio, Folga total, Folga livre e Crítica (Sim/Não). As três primeiras são só de subtarefa; as demais valem para resumo e para a linha 0 (término tardio = fim do projeto).
- **Edição como no Project**: digitar o início cria "Não iniciar antes de" na data; digitar o término recalcula a duração **e** cria "Não terminar antes de"; escolher um tipo com data numa tarefa sem data usa o início (ou o término) atual; digitar uma data de restrição numa tarefa sem restrição cria NIAD; apagar a data volta a "O mais breve possível". Tarefa nova nasce sem restrição. Recuar uma linha que vira resumo tira dela restrição e prazo, além de vínculos e datas reais. Decisão a confirmar com o usuário: digitar o início numa tarefa que já tinha DIE/NIDD troca o tipo para NIAD (o Project mantém o tipo e troca só a data em alguns casos).
- **Indicadores**: restrição (azul = semiflexível, vermelho = inflexível, cinza = OMTP; o texto diz "segurando a data" quando é ela, e não a rede, que fixa o início), prazo final perdido e vínculo desrespeitado, sempre com ícone e texto.
- **Gantt de acompanhamento**: barra **vermelha** para tarefa e marco críticos ("Caminho crítico", ligado por padrão, como no Gantt de acompanhamento do Project); **linha de folga** do fim da barra até o término tardio ("Folga", desligado por padrão); **seta de prazo final** verde, vermelha quando perdido; borda tracejada no vínculo desrespeitado; e o **"Caminho da tarefa"** do Project 2013 (desligado por padrão): com uma linha selecionada, predecessoras determinantes em âmbar cheio, demais predecessoras em âmbar claro, sucessoras determinadas em roxo cheio, demais sucessoras em roxo claro, vínculo determinante mais grosso e o resto apagado. As três opções ficam no grupo "Exibir" e são lembradas por pessoa e plano, como as outras preferências. Tudo o que a cor diz está também no texto da dica e do rótulo acessível.
- Filtros novos: Críticas, Com vínculo desrespeitado, Prazo final perdido. Barra de status: quantas críticas e o fim do projeto. Painel de detalhes: datas tardias, folgas, crítica, restrição, prazo final e as predecessoras determinantes (pelo Id da linha). Diálogo de revisão e histórico mostram os três campos novos; `anchorStart` aparece no histórico antigo como "Não iniciar antes de (antigo)".
- **Exportar para o Project (.xml)** (`src/domain/mspdi.ts`): gera o MSPDI com cabeçalho, calendário (jornada 08–12/13–17 ajustada à carga horária, feriados nos dois formatos), tarefas com EAP, durações em horas (úteis, decorridas, horas, meses → dias úteis), marcos, cedo/tardias e folgas do motor em décimos de minuto, restrições com código e data, prazo final, % e datas reais, anotações, vínculos com defasagem (úteis e decorridas) e linha de base escolhida. Sem `<Resources>`: o Project não lê nomes de recurso do XML, então a coluna sai vazia (próxima etapa: `<Resources>` + `<Assignments>`). O Project recalcula tudo ao abrir, e é justamente aí que uma divergência do motor apareceria. **Conferido no Project 2019 real em 21/10/2026**, com três defeitos encontrados e corrigidos no mesmo dia: o `<HonorConstraints>` é lido invertido (o elemento saiu); o `<StartDate>` passou a ser o início das tarefas sem predecessora; e a tarefa sem predecessora que começa depois dele sai como NIAD. As horas seguem a ponta do dia calculada pelo motor (marco, IT e dias corridos às 08:00 quando é o caso), e a tarefa dividida sai com o término sem o empurrão, para o Project dividi-la de novo. Detalhes em `docs/engenharia-reversa-project.md`.

### Validação (13/10/2026)

- Sequência do CI local: `typecheck` limpo, `lint` sem erros (30 avisos pré-existentes), `format:check` limpo, `npm test` com **485 testes passando** (eram 476 antes desta etapa, mais 33 cenários do Project, testes de restrição/folga/comando/mapper, 7 testes novos do Gantt e 9 da exportação), `validate:migrations` OK, `build` OK e `test:e2e` 8/8 com as variáveis fictícias do Supabase.
- A tela foi renderizada no servidor (`react-dom/server`) com um plano de exemplo (resumo com três subtarefas, marco, 50% com início real, prazo final perdido, NIAD, DIE que desrespeita a rede): sem erro de render, com os três alternadores, o botão de exportação, as colunas novas no menu "Colunas", os indicadores de restrição, prazo e vínculo desrespeitado, a seta de prazo final e a barra crítica em vermelho no HTML. O `.xml` do mesmo plano passou num parser XML estrito, com o cabeçalho na ordem do esquema, códigos de restrição e vínculo corretos (NIAD = 4, DIE = 2; TI = 1, TT = 0, II = 3) e defasagens em décimos de minuto (2 dias decorridos = 28800, formato 8; 1 dia útil = 4800, formato 7).
- **Não validado em navegador logado**: a aba 3 é restrita ao desenvolvedor e o banco de desenvolvimento é a produção; efeitos (preferências no `localStorage`, alinhamento medido do Gantt, download do arquivo) não rodam na renderização no servidor.

### Ajustes de digitação pedidos ao ver a tela (14/10/2026)

- **Inserir tarefa** entra **abaixo** da linha selecionada (antes entrava acima, como a tecla Insert do Project), no mesmo nível; abaixo de um resumo vira a primeira subtarefa, senão as subtarefas dele passariam para a linha nova. A linha nova já abre com o nome em edição. Sem linha selecionada, entra no fim.
- **Enter na última linha** grava a célula e cria a próxima tarefa, para digitar uma atrás da outra; nas demais linhas, Enter continua descendo uma linha. As duas operações vão numa só entrada do desfazer.
- **Cmd+Alt+→ / Cmd+Alt+←** (Ctrl no Windows) recuam e diminuem o recuo, além de Alt+Shift+setas do Project.
- **Recuo em bloco**: com um intervalo selecionado (Shift+setas ou Shift+clique), recuar e diminuir o recuo agem em todas as linhas, da primeira selecionada ao fim da subárvore da última (subtarefas recolhidas acompanham), mantendo a estrutura relativa, numa só entrada do desfazer. Recusa com frase curta quando a primeira linha não pode recuar ou há linha no nível 0. Função pura `shiftLevels`, testada em `tests/sheet-columns.test.ts`.
- **Colunas arrastáveis**: a ordem das colunas muda arrastando o cabeçalho (ou, com o foco no cabeçalho, Alt+← / Alt+→) e fica guardada com as outras preferências; Id e Indicadores ficam presas no começo; "Restaurar padrão" também devolve a ordem. Funções puras `moveColumn` e `normalizeOrder`, testadas. No Chrome do Mac, Cmd+Alt+setas também troca de aba e pode vencer o atalho da página; Alt+Shift+setas continua valendo.

### Permissão de teste (14/10/2026)

Quem testa o curto prazo pode ganhar acesso ao médio prazo (ou a qualquer outro módulo em desenvolvimento) pela lista "Módulos" de cada usuário em Configurações (admin), sem virar admin nem desenvolvedor; substituiu o botão "Permissão de teste" no mesmo dia (migração 0031). Detalhes, regras e a migração 0030 (aplicada em 14/10/2026) em `docs/go-live-curto-prazo.md`.

### Pendências

- Abrir o `.xml` exportado no Project e comparar datas, folgas e críticas; cada divergência vira cenário em `tests/fixtures/cenarios-project.ts`. Primeiro ponto a conferir: a folga negativa em restrição inflexível (aqui aparece na predecessora, pela leitura do MPXJ).
- Confirmar com o usuário o comportamento de "digitar o início numa tarefa com DIE/NIDD".
- Recursos na exportação (`<Resources>`/`<Assignments>`), defasagem em percentual (migração), duração restante, restrição em resumo e tarefas inativas — lista completa em `docs/engenharia-reversa-project.md`.

## Curto prazo: semanas vizinhas (19/10/2026)

**Pedido da obra:** o Daniel (planejador da Blentt) monta o planejamento de cada empreiteiro com a semana anterior e a próxima à vista ("quando estou fazendo o planejamento do Claudiomir da RC, deixo a semana anterior e a próxima semana"). Assim ele vê a continuidade das tarefas, leva o que não foi feito e percebe o que vai continuar. A planilha mostrava uma semana por vez. O usuário aprovou a proposta.

**O que foi entregue** (`src/modules/curto-prazo/commitments-overview.tsx`):

- **Ligar a visão:** a caixa "Semanas vizinhas", ao lado do PPC, liga a visão. A escolha fica no `localStorage` de cada pessoa (`obra360.curto-prazo.vizinhas`), como as larguras das colunas, porque é preferência de quem lê.
- **Disposição:**
  - a semana anterior aparece acima da semana analisada, e a próxima abaixo, na mesma tabela e com as mesmas colunas;
  - cada semana tem uma faixa com o nome ("Semana anterior", "Semana analisada", "Próxima semana"), o período, o número de linhas (quantas passam no filtro) e o PPC;
  - no celular, a mesma ordem, em cartões;
  - a linha de datas no topo do cabeçalho fica vazia nessa visão, porque cada faixa traz o próprio período.
- **O centro é a semana escolhida no seletor**, e não a semana atual. Antes da semana 1 da obra não há semana anterior (`neighborWeeks` em `sheet-view.ts`, testado em `tests/sheet-view.test.ts`).
- **Filtros:**
  - os filtros de coluna valem para as três semanas. O de Empresa é o que permite planejar um empreiteiro por vez;
  - os valores oferecidos no filtro saem das três semanas;
  - a classificação pelo funil e a ordem presa valem só para a semana analisada. As vizinhas ficam na ordem de inclusão.
- **Semana anterior:**
  - só aceita apontamento (Status, causa, justificativa, Limpar) e "Levar p/ próxima", mesmo quando ainda está aberta;
  - para editar as linhas dela, escolha essa semana no seletor;
  - as linhas aparecem esmaecidas.
- **Próxima semana:** é editável como a analisada, se não estiver encerrada. Não tem linha em branco: entra nela o que se leva, e para escrever uma linha nova basta escolher a semana no seletor.
- **"Levar p/ próxima" para qualquer linha:**
  - nessa visão, o botão aparece em qualquer linha, e não só na do Não: também na linha com Sim (atividade que continua) e na ainda sem apontamento;
  - a linha levada entra como compromisso novo da semana seguinte, sem apontamento e sem marca de continuação, e a de origem não muda;
  - por isso, a coluna "Apontamento" fica sempre visível nessa visão;
  - fora dela, o comportamento antigo continua: só o Não é levado;
  - "Gerar restrição" continua só no Não.
- **A trava de semana encerrada não mudou.** O "Levar" confere a semana de destino, como antes.

**Decisões tomadas por padrão, a confirmar com a obra:**
- o centro da visão é a semana selecionada no seletor;
- a linha levada depois de um Sim entra como linha normal, sem marca de continuação, e conta no PPC da semana seguinte como qualquer compromisso.

**Validação:** typecheck, lint, 518 testes, `format:check` e build passaram. **Não foi aberta no navegador:** o acesso às variáveis do banco de produção para o `next dev` foi negado nesta sessão, e não há base local com dados. Falta conferir na tela com o Daniel:
- a faixa de cada semana;
- o filtro de Empresa nas três semanas;
- o "Levar" da semana anterior para a analisada;
- o celular.

## Médio prazo seguindo o Project: motor, exportação e a interface (21/10/2026)

O usuário pediu: "siga como o Project, corrija tudo", e também "copie a interface e a usabilidade da ferramenta", citando a Linha do Tempo e o planejamento de recursos. A referência foi o Project 2019 do próprio usuário, na VM do UTM: a bancada rodou lá e as telas foram capturadas lá (`scripts/ms-project/`).

**Identidade visual.** A decisão de 25/09/2026 foi mantida: copia-se o layout, as visões e o comportamento do Project, mas com o visual do Obra 360. A tela não tem faixa de opções, nem o azul e o tema escuro do Project.

### Motor e exportação

Estão descritos em `docs/engenharia-reversa-project.md`, seção "Correções de 21/10/2026". Em resumo:
- o motor trabalha com o dia e a ponta dele (08:00 ou 17:00) e segue o Project também nas datas da tabela;
- folga negativa na tarefa presa por restrição;
- NIDD sem sucessora;
- TT com piso no início do projeto;
- tarefa em andamento dividida;
- dias corridos em 24 h.

A bancada passou a ter 69 cenários com os valores medidos no Project, em todas as tarefas e campos. O `.xml` teve três defeitos corrigidos. `TaskSchedule` ganhou `edges`, `stop` e `resume`. `PlanTask` ganhou `timeline`, gravado no jsonb `schedule_meta` (**sem migração**) e aceito pelo `save_plan_revision`. `src/domain/resource-usage.ts` calcula a carga diária de cada equipe e não conta o dia de uma ponta às 08:00.

### Tela (`src/modules/medio-prazo/`)

- **Modo de exibição** (`schedule-sheet.tsx`):
  - seletor com Gráfico de Gantt, Planejador de Equipe, Uso dos Recursos e Planilha de Recursos, e os mesmos atalhos na barra de status;
  - nome da visão em pé na borda esquerda, como no Project;
  - a visão escolhida, a Linha do Tempo e "Recursos nas barras" ficam nas preferências do usuário por plano;
  - os comandos que só servem ao Gantt (inserir, recuo, vínculos, excluir, Exibir e filtros) só aparecem nele.
- **Linha do Tempo** (`timeline-band.tsx`):
  - faixa acima de qualquer visão, ligada por padrão e com caixa para esconder;
  - Início e Término nas pontas; barras das tarefas marcadas, com nome e período, a parte concluída mais escura e empilhadas quando se cruzam; marcos em losango com a legenda;
  - a moldura da janela visível do Gantt: arrastar a moldura ou clicar na faixa rola o Gantt;
  - "Adicionar/Remover da Linha do Tempo": botão na barra, aba Geral das Informações, menu de contexto da própria faixa e Delete;
  - escala que se ajusta à largura (dia, semana, mês, trimestre ou ano) e teclado completo.
- **Gantt** (`gantt-chart.tsx`):
  - arrastar a barra muda o início, gravando o "Não iniciar antes de" como a célula Início;
  - esticar a ponta muda a duração;
  - arrastar de uma barra a outra cria um TI;
  - arrastar o progresso muda o %;
  - duplo clique abre as Informações;
  - nome da equipe à direita da barra; marco com a data ao lado;
  - barra que acaba às 08:00 termina na borda do dia;
  - tarefa dividida desenhada em dois trechos ligados por pontilhado.
- **Planejador de Equipe** (`team-planner.tsx`):
  - uma linha por equipe, com as tarefas em blocos;
  - equipe superalocada em vermelho, aberta em subfaixas, com os blocos em conflito contornados;
  - painel "Tarefas não atribuídas: N" embaixo, com altura ajustável;
  - arrastar o bloco para outra equipe reatribui; arrastar na horizontal muda o início (NIAD);
  - a diagonal grava os dois num passo só do desfazer;
  - pelo teclado: Shift+↑/↓ troca de equipe, Shift+←/→ move um dia útil e há o seletor "Atribuir a…".
- **Uso dos Recursos** (`resource-usage-view.tsx`):
  - equipes em negrito, com as tarefas recuadas embaixo;
  - trabalho em horas (dias úteis × jornada);
  - grade por dia (zoom Dias) ou por semana, com as células superalocadas em vermelho;
  - grupo "Sem alocação".
- **Planilha de Recursos** (`resource-sheet-view.tsx`):
  - Nome, Tipo, Iniciais, Grupo (empresa), Unid. máximas (capacidade × 100%), Trabalho, Tarefas e Pico;
  - ordenação por coluna;
  - só leitura, com o link "Configurar recursos".
- **Informações da tarefa** (`task-info-dialog.tsx`):
  - abas Geral, Predecessoras, Recursos, Avançado e Anotações;
  - abre por Shift+F2, pelo botão "Informações", com duplo clique na barra ou no bloco, e com duplo clique numa célula calculada ou na grade bloqueada; na célula editável, o duplo clique continua editando;
  - o OK aplica tudo num passo só do desfazer, pelas mesmas funções de edição das células.
- **Barra de status:**
  - "Pronto", "Editando", "Alterações não salvas" ou "Salvando…";
  - "Novas tarefas: Agendadas automaticamente";
  - atalhos das visões e controle deslizante de zoom; um só controle vale para o Gantt, o Planejador e o Uso dos Recursos.
- **Rolar até a tarefa:** botão e Ctrl+Shift+F5.
- **Tour:** um passo para cada controle novo, em `src/modules/tour/pages/medio-prazo.ts`.

**Recursos = equipes.** Os recursos do Project são as equipes cadastradas da obra. A capacidade (`weeklyCapacity`, atividades simultâneas) faz o papel das "Unidades máximas", e o recurso fica superalocado no dia em que tem mais tarefas ao mesmo tempo do que isso. A seção "Recursos" da aba, com a carga semanal contra a capacidade, continua existindo.

### Validação (21/10/2026)

- **Motor contra o Project montado à mão:** 1.492 checagens nos 69 cenários, 4 divergências. São as duas diferenças conhecidas: restante fracionado de tarefa em andamento e determinante com TT corrido.
- **`.xml` exportado aberto no Project contra o motor:** 1.169 checagens, 2 divergências, no mesmo caso do restante fracionado.
- **Typecheck, lint e testes** (ver o commit). Os componentes foram exercitados em Chromium headless, numa página isolada fora do repositório que monta a tela inteira (`Sheet`) com dados de exemplo (16 tarefas, vínculos dos quatro tipos, tarefa dividida, marcos, equipe superalocada). A primeira passada achou 9 problemas, todos corrigidos:
  - **Alta (1):** esticar tarefa dividida contava a pausa.
  - **Médios (3):** a pausa contava como trabalho nas visões de recursos; o Planejador movia o início de tarefa iniciada; Ctrl+Z não funcionava fora da grade.
  - **Baixos (5):** faixa branca sob a Linha do Tempo; folga com ponto decimal; avanço desenhado por pixel e não por dia útil; barra de status abaixo da dobra; foco perdido ao fechar o diálogo.
- **Não foi aberta no app logado:** falta conferir à mão, no navegador, o arrasto diagonal no Planejador, a moldura da Linha do Tempo e o arrasto das barras do Gantt com dados reais.

### Pendências

- Conferir na tela com dados reais, logado (ver acima).
- Recursos no `.xml` (`<Resources>`/`<Assignments>`).
- Frações de dia (restante de tarefa em andamento, durações em horas).
- Tarefa com início real e 0% que a predecessora empurra: o motor marca a parada no próprio dia do início real, então a dica do Gantt e a duração ao esticar contam esse dia como trabalhado (no Project a parte feita tem duração zero). Corrigir pede mudar a regra de divisão no motor, no Gantt, no Planejador e na tela juntos.
- A tabela não tem menu de contexto; o da Linha do Tempo é da própria faixa.

## Curto prazo: planilha sem espera, apontamento em lote e alça de arrastar (26/10/2026)

**Pedido do usuário:** dois vídeos gravados na Blentt em 23/10/2026 comparando a mesma tarefa, marcar Não, escolher a causa e escrever a justificativa em quatro linhas: 18 s no Google Sheets, 85 s no Obra 360. "Vamos resolver para colocar para rodar da melhor forma."

### Diagnóstico, medido nos vídeos e no código

- **A tela ficou parada 75% do tempo** (quadros sem mudança). A linha em âmbar ("gravando") apareceu 4 vezes, de 3,75 a 4,5 s cada: **16 s dos 85 s** eram espera do sistema. Enquanto a linha gravava, Status, Causa e os botões ficavam desabilitados.
- **Os outros ~69 s eram a interação**, não o servidor: a justificativa só liberava depois que o Status gravava; nada de preencher várias linhas de uma vez (no Sheets a pessoa arrasta a célula para baixo); Enter não descia de linha; cada linha tinha 53 px de altura, pelos dois botões empilhados de Apontamento (11 linhas na tela, contra 20 no Sheets); e, mesmo em 1912 px de largura, Status, Causas e Justificativas ficavam fora da tela, exigindo rolar de lado.
- **O caminho do servidor não explica os 4 s.** Medido daqui contra o banco de produção, com uma linha criada e apagada só na "Obra - Teste": `record_fulfillment` leva **0,35–0,42 s** (6 idas ao Supabase: versão, quatro leituras em paralelo, `commit_planning`; ~100 ms cada ida daqui, menos a partir da Vercel em `gru1`). A Vercel responde em 75 ms quente e 0,7 s fria. Cada requisição à API autenticava **duas vezes** no Supabase Auth (proxy e rota). O que sobra (fria da função, rede do canteiro, recarga de 3,9 MB em curso) agora é mensurável pelo `Server-Timing`.

### Decisões do usuário

- Preencher várias linhas: **barra de seleção e alça de arrastar**, as duas.
- Coluna Apontamento: **botões compactos lado a lado** ("Levar ›", "Limpar"), não um menu.

### O que mudou

- **Projeção antes do servidor** (`planning-provider.tsx`, `projectsBeforeServer` em `local-apply.ts`): comandos que mudam linha existente (`record_fulfillment`, `record_fulfillments`, `clear_fulfillment`, `update_commitment`, `delete_commitment`) são aplicados aos dados da tela **antes** do `fetch`; a célula mostra a escolha no mesmo instante do clique. Se o servidor recusar ou a rede cair, a recarga completa devolve a linha ao que o banco tem. Criar linha ou equipe continua projetado depois da resposta, porque depende do id do servidor.
- **Nada trava enquanto grava** (`commitments-overview.tsx`): Empresa, Semana, Equipe, Status, Causa e os botões deixaram de ficar desabilitados com `saving`; a linha ganha um filete âmbar à esquerda e `aria-busy`, e o cabeçalho mostra "Gravando…" enquanto a fila sobe. A fila continua em série, para a ordem das gravações valer.
- **Justificativa em qualquer ordem:** aberta mesmo sem Status; escrita antes, fica guardada na linha (`drafts`) e sobe junto com o Sim ou com a causa. O rascunho só sai quando o servidor gravou.
- **Teclado como no Sheets** (`row-navigation.ts`): Enter desce e Shift+Enter sobe para a mesma coluna da linha vizinha, nas células de Status, Causas, Justificativas, Atividade, Semana, Início e Término; as setas para cima e para baixo também, só nos campos de texto (num select elas trocam o valor). Sair da célula é o que grava. Cada célula leva `data-col`; cada linha, `tr[data-row-id]`.
- **Apontamento em lote:** caixa de marcar por linha (e "marcar todas as visíveis" no cabeçalho); com linhas marcadas aparece a barra (`bulk-bar.tsx`): Status (manter/Sim/Não), Causa, Justificativa (manter/trocar), "Hoje: …" embaixo de cada campo, aviso das linhas que ficariam de fora e "Aplicar a N". Vai um comando só, **`record_fulfillments`** (`commands.ts`, `command-scope.ts`, `module-access.ts`, `local-apply.ts`): até 500 linhas, tudo ou nada, um evento de histórico, leitura recortada só nas linhas do lote. No celular a barra fica fixa no rodapé. Com a planilha filtrada, só as linhas à vista contam.
- **Alça de arrastar** (`fill-handle.tsx`): o quadradinho no canto inferior direito das células de Status, Causas e Justificativas, visível ao passar o mouse; arrasta para baixo ou para cima e copia o valor nas linhas por onde passou (realce `.fill-target`, em `globals.css`), num `record_fulfillments` só. Regras: Status Sim copia o Sim; Status Não copia Não com a causa da origem nas linhas sem causa (sem causa em nenhuma das duas, a linha fica "aguardando a causa", como no clique); Causa só entra em linha com Não (as outras ficam de fora, com aviso); Justificativa em linha sem Status vira rascunho. Soltar fora da tabela ou o navegador tomar o ponteiro (rolagem por toque) cancela sem gravar.
- **Linha mais baixa:** "Levar p/ próxima" e "Limpar apontamento" viraram "Levar ›" e "Limpar", lado a lado, com a explicação no `title` (e os textos do tour). A linha passou de ~53 px para **37 px**. A coluna Apontamento caiu de 208 para 168 px e a planilha de teste (checkbox, 12 colunas, Apontamento) coube em 1559 px num quadro de 1568 px, sem rolar de lado.
- **Servidor** (`src/proxy.ts`, `src/infrastructure/auth/trusted-user.ts`, `supabase-server.ts`): o proxy valida a sessão uma vez e repassa a identidade à rota em cabeçalhos `x-obra360-user-id`/`-email` **assinados** (HMAC-SHA256 com `OBRA360_TRUSTED_HEADER_SECRET` ou, sem ela, a chave de serviço); qualquer `x-obra360-*` vindo do navegador é apagado antes, e a rota só confia com assinatura válida e id em UUID, senão lê a sessão como antes. A assinatura existe porque o `matcher` do proxy pula caminhos com sufixo de imagem (`/api/admin/users/x.png`), e ali um cabeçalho forjado chegaria à rota. Resultado: **1 ida ao Auth por requisição em vez de 2**. `POST /api/planning/commands` e `GET /api/planning` devolvem `Server-Timing` (`auth`, `commit`/`snapshot`, `total`) e, acima de 1,5 s, registram uma linha JSON (`logRouteTiming`, em `log.ts`) com o tipo do comando, nunca o corpo.

### Validação

- **Testes:** 676 de 676. Novos: `tests/bulk-fulfillment.test.ts` (lote: grava, tudo ou nada, limites, consulta, recorte), `tests/row-navigation.test.ts`, `tests/fill-handle.test.ts` (linhas entre origem e alvo, linha sob o ponteiro), `tests/bulk-bar.test.ts` (regras da barra, linha a linha), `tests/trusted-user.test.ts` (ida e volta, forja, adulteração, sem segredo); casos novos em `tests/local-apply.test.ts` e `tests/module-access.test.ts`.
- **Navegador (Playwright, Chromium 1600 px), numa página de prévia temporária** fora do layout autenticado, com as APIs respondidas pelo Playwright com dados de teste e **um servidor simulado de 1,5 s por comando**: a causa escolhida apareceu em 60 ms e a justificativa foi digitada 0,5 s depois, com a gravação ainda em curso; Enter na justificativa da linha 1 levou o foco à da linha 2; a justificativa escrita antes do Status foi mantida e enviada no `record_fulfillment` do Sim; três linhas marcadas com Não + causa saíram num só `record_fulfillments` e mostraram Não em 58 ms; a alça arrastada da linha 7 à 9 realçou 2 linhas e mandou um só `record_fulfillments`; linha com Apontamento de 37 px; tabela cabendo no quadro; nenhum erro no console. A página de prévia e o roteiro foram apagados.
- **Checagens:** typecheck, lint, Prettier e build.
- **Não conferido:** produção. O `Server-Timing` é o que vai dizer onde ficam os ~3,5 s que o servidor medido daqui não explica; no celular, a barra fixa e a planilha em cartão não foram abertas em aparelho real.

### Pendências

- **Medir em produção:** abrir a aba Rede com um apontamento e ler o `Server-Timing` do POST (`auth` deve ficar em dezenas de ms; `commit` perto de 0,2–0,4 s). Se o total continuar em segundos, a diferença é partida fria da função ou a rede do canteiro, e o próximo passo é carregar a planilha **por janela de semanas** (hoje 3,9 MB de uma obra inteira), pendência que já estava anotada em 12/10.
- O `matcher` do proxy pula qualquer caminho com sufixo de imagem, inclusive sob `/api/` e `/obras/`; a assinatura torna a forja inócua, mas a conferência de módulo do proxy também é pulada ali (as rotas repetem a checagem). Vale restringir a exclusão por extensão aos caminhos estáticos.
- A alça não rola a página sozinha ao chegar na borda (o Sheets rola).
- Na barra, uma linha com Não ainda aguardando a causa conta como "sem Status"; Status Não + causa na barra resolve essas linhas.

### Desfazer (26/10/2026, mesmo dia)

Pedido do usuário logo depois de publicar: "adicione um botão de desfazer". Com a barra de lote e a alça, um arrasto errado muda dezenas de linhas; o Desfazer é o que torna isso barato.

- **Onde:** botão "Desfazer" ao lado do PPC (com "(N)" quando há mais de uma ação na pilha e o que vai ser desfeito no `title`), **Ctrl+Z / Cmd+Z** fora de um campo de texto (dentro dele, Ctrl+Z continua sendo o desfazer do próprio campo) e um botão "Desfazer" nos avisos de lote, alça, "Levar", exclusão e "Limpar", que desfaz aquela ação em particular (`action` novo em `ToastProvider`; o aviso com ação fica 8 s).
- **O que desfaz** (`src/modules/curto-prazo/undo.ts`): apontamento de uma linha, do lote ou da alça; justificativa; "Limpar"; edição de célula (empresa, equipe, semana, período, atividade) e equipe criada na linha (a equipe fica no cadastro); "Levar p/ próxima" (apaga a linha criada); exclusão (recria a linha, com id novo, e regrava o Sim/Não); linha nova (apaga).
- **Como:** cada gravação guarda o estado anterior das linhas e o comando inverso; as últimas 20, só nesta sessão, como no Sheets. O inverso do apontamento é um `record_fulfillments` só, em que a linha que não tinha Status vai com **`clear: true`**, item novo do lote (`FulfillmentItem` virou união em `commands.ts`; o `clear_fulfillment` passou a usar o mesmo `clearFulfillment`). Desfazer é uma gravação comum: entra no histórico e passa pelas mesmas regras (semana encerrada, papel).
- **Validação:** `tests/undo.test.ts` (comandos inversos), casos de `clear` em `tests/bulk-fulfillment.test.ts` e `tests/local-apply.test.ts`; 680 testes. No navegador (prévia temporária, servidor simulado de 400 ms): botão desabilitado sem ação; desfazer um apontamento mandou `record_fulfillments` com `clear` e a célula voltou a vazia; o "Desfazer" do aviso do lote limpou as 3 linhas num comando; Ctrl+Z desfez uma atividade renomeada e, com o cursor num campo de texto, não mandou nada; exclusão desfeita recriou a linha com o Sim. Sem erros no console.
- **Pendências:** sem Refazer; a pilha zera ao recarregar; desfazer uma ação antiga pelo aviso não desfaz as que vieram depois nas mesmas linhas (vale a última gravação).

## Curto prazo: inserir linha no meio e arrastar linhas (30/10/2026)

Pedido da obra, trazido pelo usuário: "colocar uma função pra inserir linha no meio do planejamento"; logo depois, "seria bom se fosse possível arrastar as atividades pra cima e para baixo". Até aqui a linha nova só entrava embaixo e a ordem salva era a de inclusão (`createdAt`), sem lugar para guardar outra.

### Decisões

- **A posição fica no banco**, coluna nova `weekly_commitments.order_index` (`WeeklyCommitment.order`), e vale para todos que abrem a planilha. A ordem da sessão (`pinned`) sozinha não bastava: recarregar desfaria o que a obra arrumou.
- **Quem insere ou arrasta grava a semana inteira** (1, 2, 3…), na ordem que a tela mostra. Gravar só a linha mexida deixaria a ordem salva diferente da tela quando ela estava classificada pelo funil ou organizada por empresa. A linha sem posição (todas as de antes, e a criada depois pela linha em branco do fim) segue a regra antiga, depois das posicionadas: a nova entra embaixo e fica embaixo.
- **"Inserir linha acima"**, como o "Inserir" do Excel: com ele chega-se a qualquer lugar (o topo e o meio; o fim é a linha em branco de sempre). Abre uma linha em branco logo acima, já no campo da atividade. Enter cria e a linha em branco continua aberta para a próxima, que entra logo abaixo da criada; sair da linha depois de criar, Esc ou "Cancelar" fecham. No celular, o cartão "Nova linha acima de …" tem "Inserir" e "Cancelar".
- **Arrastar pela alça ⠿** do começo da linha (HTML5 drag and drop, com o filete azul indicando se cai em cima ou embaixo). Com a alça em foco, as setas ↑ e ↓ movem uma posição e o foco acompanha a linha. No celular não há arrasto: o cartão ganhou setas de subir e descer.
- **Só na semana analisada e para quem edita a semana**, como a linha em branco: nas vizinhas não há alça nem inserir. Semana encerrada: só admin (`guardWeek`, a mesma trava das outras edições de linha).
- **"Organizar por empresa" e o funil continuam só da tela**; a faixa da ordem passa a dizer isso e oferece "Salvar esta ordem" (grava) e "Voltar à ordem salva" (antes "Voltar à ordem de inclusão").
- **Linha que muda de semana perde a posição** e entra embaixo da semana nova.

### O que mudou

- `src/domain/commitment-order.ts` (novo): a ordem saiu da tela para o domínio, porque o servidor precisa numerar exatamente como a tela mostra. `sheetOrder` (posição, depois inclusão, depois empresa e início para o lote importado), `byCompany`, `orderPositions` (linha da semana fora da lista vai para o fim; id de outra semana é ignorado), `insertionOrder` e `placeBefore`. `compareText` mora aqui e `sheet-view.ts` o reexporta.
- `commands.ts`: `create_commitment` aceita `beforeId` e `order` (a ordem da tela, sem a linha nova; sem ela, vale a salva). Referência que sumiu nesse meio-tempo não é erro: a linha entra embaixo. Comando novo **`reorder_commitments`** (`workId`, `weekStart`, `ids`), com até 2.000 ids, liberado para quem não é desenvolvedor (`module-access.ts`), lendo só a semana (`command-scope.ts`). Só as linhas cuja posição mudou são tocadas e viajam na gravação. No histórico, o arrasto guarda a contagem de linhas e não a lista de ids.
- `local-apply.ts`: o arrasto é projetado antes da resposta do servidor, como o apontamento; a inserção numera a semana quando o servidor devolve o id, pela mesma regra (`insertionOrder`).
- `commitments-overview.tsx`: alça na coluna da caixa de marcar (44 px), "Inserir linha acima" ao lado do ✕ (coluna de 56 px), linha em branco no meio (a mesma `BlankRow`/`BlankCard`, com `insert`), faixa da ordem. A ordem da tela (`pinned`) ganhou `session` (ordem só desta tela) e `sig` (as posições salvas): quando outra pessoa reordena, a recarga traz as posições novas e a tela que segue a ordem salva passa a mostrá-las. `mergePinned` (`sheet-view.ts`) põe a linha que a tela ainda não conhece acima da que vem depois dela na ordem salva: a inserida aparece no lugar, mesmo com a ordem classificada.
- Desfazer: arrasto (volta a ordem anterior), linha inserida (apaga) e **exclusão**, que agora devolve a linha ao mesmo lugar (`recreateCommand` manda `beforeId` com a linha que vinha logo abaixo).
- Migração **`0036_commitment_order.sql`**: coluna `order_index integer` e `commit_planning` reescrita (cópia da 0031 com a coluna no upsert). Sondagem em `migrations.ts`; bootstrap regenerado (36 migrações).
- Tour "Como usar" (passos "Arrastar a linha" e "Inserir linha acima"; textos de ordem, filtros e exclusão) e a ajuda "Como funciona" da tela.

### Validação (30/10/2026)

- `tests/commitment-order.test.ts` (13 testes): ordem salva, inserir na ordem da tela e na salva, referência que sumiu, arrasto que só toca o que mudou, trava da semana e papel, troca de semana, recorte de leitura, projeção local igual à do servidor, `mergePinned` e ida e volta de `order_index` (inclusive banco sem a coluna). 759 testes, `typecheck`, `lint` (sem aviso novo) e `format:check` passando.
- `npm run validate:migrations` (PGlite): `commit_planning` grava `order_index` e `planning_snapshot` o devolve. `node scripts/validate-bootstrap-sql.mjs`: OK. Ele falhava antes desta mudança por contar 39 tabelas: a 0035 criou 3 e o número não tinha sido atualizado. Passou para 42.
- No navegador (prévia temporária em `/campo/`, já apagada, com as APIs respondidas pelo `applyCommand` real): inserir duas linhas seguidas acima da 3ª, Esc fechando, recarga mantendo a ordem, arrastar a última para o topo e a primeira para baixo da terceira, seta ↓ na alça (o foco seguiu a linha), Desfazer do movimento, exclusão desfeita voltando ao mesmo lugar, "Organizar por empresa" + "Salvar esta ordem", e no celular as setas do cartão e o "Inserir". A ordem gravada no servidor bateu com a tela em todos os passos. Nenhum erro no console.

### Pendências

- **0036 aplicada pelo usuário no `takt-hub` em 30/10/2026**, antes da publicação (conferir em Configurações → Banco de dados; daqui a leitura de produção foi bloqueada pelo modo automático). Com o código antigo no ar ela não quebra nada: nada manda posição, e as linhas seguem sem ela.
- **Não publicado.** Decisão do usuário (30/10): esperar e publicar junto com a exclusão de obra (0037, outra sessão em andamento) e o manual da Claudia. Até lá o código está só no disco, sem commit.
- Os PDFs seguem as ordens próprias deles ("por empreiteiro" ou "por início"), não a da planilha. Se a obra quiser o PDF na ordem arrastada, é uma terceira opção no diálogo de impressão.
- A Claudia lista a semana pela ordem de inclusão (`agent-tools.ts`, `listWeek`), não pela salva. Não foi mexido porque o arquivo está com o trabalho do manual em andamento; a troca é uma linha (`sheetOrder`).
- Duas pessoas arrastando a mesma semana ao mesmo tempo: vale a última gravação, que leva a ordem inteira da tela de quem gravou.

## Curto prazo: painel na primeira página do PDF do fechamento (30/10/2026)

Pedido do usuário: "no relatório de fechamento colocar na primeira página um dashboard com o PPC da semana comparado com as semanas anteriores, o PPC geral da obra comparado com as outras obras e as principais causas", mais um ranking dos PPCs das obras. Antes de implementar, ele pediu o modelo da tela. O modelo foi entregue como página publicada (dados de exemplo) e aprovado sem mudanças ("adorei, pode seguir com ele"). O usuário falou em fechamento "mensal", mas o PDF que existe é o semanal ("Resultados Semana N"), e foi nele que o painel entrou.

### Decisões (todas do modelo aprovado)

- **Só no PDF do fechamento, na página 1**, com a planilha de resultados a partir da página 2. O PDF do planejamento não muda. Na janela do PDF entrou a caixa "Painel na primeira página", só no fechamento e já marcada; desmarcada, o PDF sai como antes. Na URL da impressão, só a caixa desmarcada aparece, como `painel=0`: sem o parâmetro, o fechamento sai com o painel (correção de 31/10/2026, abaixo).
- **O painel considera sempre a obra inteira.** Os empreiteiros desmarcados na janela saem só da planilha; se o painel seguisse o recorte, a comparação com as outras obras deixaria de valer. Com recorte, o rodapé diz quem ficou fora da planilha.
- **Nada depois da semana analisada:** série, médias, Pareto e ranking contam só até ela, para o PDF de uma semana antiga sair igual depois.
- **Série:** as 12 semanas com linha até a analisada, como a da tela Fechamento: barra hachurada para semana em aberto, fora da média, e faixa âmbar na analisada. "Média das últimas 12 semanas" é a média simples dos PPCs semanais apurados, como o cartão da tela Fechamento (âmbar abaixo de 70%).
- **PPC geral = cumpridos ÷ assumidos de todas as semanas apuradas desde o início da obra**, somando as linhas e não fazendo a média dos percentuais. É o que ordena o ranking.
- **Ranking:**
  - mostra todas as obras ativas pelo nome, para qualquer pessoa com obra liberada. De outra obra só saem números agregados (PPC geral, semanas apuradas e PPC da semana), nunca linhas, empreiteiros ou justificativas;
  - a obra do PDF entra mesmo inativa, e obra sem nenhuma linha até a semana fica fora;
  - obra com menos de 4 semanas apuradas aparece no fim, "em início", sem posição;
  - empate exato divide a posição;
  - a coluna da semana usa o mesmo período do calendário, porque cada obra tem a sua semana 1;
  - a folha mostra até 7 obras; se a obra do PDF ficar de fora, ela entra na 7ª linha, e a legenda diz quantas ficaram fora, todas contadas na média.
- **Causas em dois recortes:** as da semana, com a posição de cada uma no Pareto da obra, e o Pareto da obra até a semana, com as causas que somam 80% em vermelho e as demais agrupadas em "Outras N causas".

### O que mudou

- `src/domain/closing-ranking.ts` (novo, puro): `workPpc` (PPC geral e da semana de uma obra até a semana), `rankWorks`, `buildRanking`, `withLocalWork` e `rankingMean`. O PDF troca a linha da própria obra pelo cálculo com os dados que já carregou (`withLocalWork`), para o painel e o ranking nunca mostrarem números diferentes da mesma obra.
- `GET /api/curto-prazo/ranking?semana=&obra=` (`src/app/api/curto-prazo/ranking/route.ts`):
  - lê `works` e só `work_id, week_start, fulfilled` de `weekly_commitments` até a semana, de todas as obras, pelo service role. A primeira página traz a contagem, e as demais páginas de 1000 linhas vêm 6 por vez;
  - exige perfil com obra liberada;
  - qualquer falha depois da autorização responde 200 com `available: false`, como a rota do tempo.
- `src/modules/curto-prazo/closing-dashboard.ts` (novo, puro): monta o painel (série, semana anterior apurada, média, causas, posição) e escreve a frase de resumo em trechos, comparando os valores já arredondados para a frase nunca contradizer os cartões.
- `src/modules/curto-prazo/print-dashboard.tsx` (novo):
  - a folha em si: cabeçalho igual ao da planilha, resumo, quatro cartões, série, ranking, causas da semana, Pareto e rodapé;
  - altura fixa de 732 px dentro da área útil de A4 paisagem com 7 mm de margem (1069 × 741 px), e quebra de página depois;
  - cores fixas, porque é papel.
- `print-sheet.tsx`: com o painel ligado no fechamento, busca o ranking e espera a resposta antes de chamar a impressão, como já fazia com o tempo, com limite de 8 s; passou disso, o painel sai com "Ranking das obras indisponível no momento". A página `imprimir/curto-prazo/[obraId]` lê o `painel`, e `print-dialog.tsx` ganhou a caixa.
- Manual da Claudia (`curto-prazo-pdf-impressao`): a caixa da janela e a seção "O painel na primeira página do fechamento".
- **Nenhuma migração.**

### Validação (30/10/2026)

- `tests/closing-dashboard.test.ts`, com 10 testes:
  - PPC geral ponderado e só com semanas apuradas;
  - ranking com empate e obras em início;
  - obra sem linha e semanas posteriores fora;
  - troca da linha da própria obra;
  - o cenário do modelo aprovado, com a frase exata;
  - semana em aberto, sem ranking, empate de causas, semana sem falhas, falha sem causa e falha única;
  - chamada do Pareto, corte "Outras" e ranking que cabe na folha.
- A bateria do CI passou: `typecheck`, `lint` (nenhum aviso nos arquivos novos ou alterados), `format:check`, 774 testes, `validate:migrations` e `build` e o teste de fumaça no navegador (8 de 8).
- Renderização no Chromium com um harness fora do repositório: o componente com dados de exemplo, impresso em A4 paisagem com margem de 7 mm, em três cenários (o do modelo; semana em aberto com 13 obras e nome longo; ranking indisponível). Nos três, o painel ocupou uma folha só e nenhum quadro cortou conteúdo. O harness achou dois defeitos, já corrigidos: as barras do ranking não apareciam e o Pareto e o ranking com muitas obras passavam da altura do quadro.
- **Não validado:** a rota contra o banco real e o PDF gerado pelo botão no sistema. Desta máquina a sessão não alcançou o Supabase (`fetch failed`), então o tempo da rota com o volume real (todas as obras, ~6 mil linhas só na Blentt) não foi medido.

### Pendências

- **Sem commit e não publicado.** O código está só no disco, junto com o trabalho de outras sessões (ordem das linhas, exclusão de obra, manual da Claudia).
- Conferir no sistema: gerar o PDF do fechamento de uma semana encerrada da Blentt e comparar os números com a tela Fechamento (série, média e Pareto devem bater; a tela conta também as semanas posteriores, o PDF não).
- Se a rota ficar lenta com o volume real, o próximo passo é uma função SQL que agregue por obra e semana (exigiria migração). Um cache curto também ajudaria, mas faria a linha das outras obras ficar até alguns minutos atrás.

### Correção de 31/10/2026: fechamento sem o painel

Um engenheiro mandou um PDF do fechamento sem o painel na manhã seguinte à publicação (`65cd066`, 30/10/2026). O deploy estava no ar: os arquivos estáticos da página de login mudaram depois do push. A causa era outra:

- o sistema recarrega os dados da aba aberta, mas não o código;
- quem estava com a planilha aberta desde antes do deploy usava a janela antiga do PDF, que não manda o parâmetro do painel;
- a página de impressão, que abre numa aba nova e já com o código novo, exigia `painel=1` e por isso saía sem o painel.

A regra foi invertida: no fechamento, o painel sai sempre, e só a caixa desmarcada (`painel=0`) o tira. Funciona também a partir de uma aba antiga.

## Etapa — Linha de Balanço no estilo Prevision e medições fotográficas (04/11/2026)

Pedido do usuário em 04/11/2026: no longo prazo, "dois planejamentos": a Linha de Balanço parecida com o Prevision, com uma ferramenta para criar **fluxo de serviços** e facilitar o lançamento na Linha de Balanço, e a **interface de medição** do Prevision, para medições fotográficas dos serviços.

Seguindo o combinado de 30/10/2026, o modelo de UX foi publicado antes do código (<https://claude.ai/artifact/PQq34sq1UaWSw3WUTPnMi6>: cinco telas com dados de exemplo e 28 regras numeradas). O usuário aprovou sem mudanças ("adorei, pode seguir"), e a implementação seguiu as 28 regras. **Migração 0038 aplicada no `takt-hub` em 04/11/2026; código commitado e publicado no mesmo dia, junto com o dashboard da aba 0.**

### O que a aba 1 mostra agora

Cinco visões, trocadas no cabeçalho (`?visao=`), em `src/app/(app)/obras/[obraId]/longo-prazo/page.tsx`:

- **Linha de Balanço** (padrão, `src/modules/longo-prazo/lob/lob-view.tsx`): blocos por serviço × local, locais de baixo para cima, tempo com meses e segundas-feiras, parte medida cheia e parte a fazer clara, contorno vermelho nos atrasados, linhas de hoje e das medições (M1, M2…), sobreposição da linha de base escolhida. Arrastar empurra as sucessoras e nunca entra antes das predecessoras; setas do teclado movem um dia útil; desfazer (botão e Ctrl+Z) reverte as mudanças de datas da sessão. Filtros de serviço, local e período, zoom Semana/Mês/Trimestre, tecla H, tabela ordenável, lista de atrasos, indicadores (serviços, locais, término × linha de base, avanço físico × previsto), painel do bloco selecionado (início, duração, equipe, unidade, observação, predecessoras com espera e "equipe segue", sucessoras que acompanham, atraso com motivo, datas reais, fotos), gaveta de locais, gaveta de linhas de base (criar, comparar, restaurar, excluir), "Importar do Planejador" e exportar CSV. Gráfico em `lob-chart.tsx` e `lob-model.ts`, tabela em `lob-table.tsx`, painéis em `lob-activity-panel.tsx`, `lob-locals-panel.tsx`, `lob-baselines-panel.tsx`.
  - **Painel "Atividade selecionada" acima do gráfico (11/11/2026, pedido do usuário):** o painel saiu da lateral (coluna fixa de 320 px) e fica entre os indicadores e o gráfico, que passou a usar a largura toda. O conteúdo é o mesmo, em até três colunas conforme a largura do próprio painel (dados do bloco; dependências, sucessoras e observação; situação, datas reais, fotos e exclusão). Como o painel cresce ao selecionar e empurra o gráfico para baixo, o `click` que vem depois do soltar do ponteiro caía fora do bloco e desfazia a seleção: `lob-chart.tsx` passou a ignorar esse clique. Validado no navegador com obra de exemplo e API simulada (1300 px e 400 px): sem seleção, bloco selecionado, sem rolagem horizontal. Não verificado na tela real logada.
- **Fluxos de serviços** (`flows-view.tsx`, `flow-editor.tsx`, `flow-network.tsx`): lista dos fluxos da empresa com as obras em que cada um foi lançado; editor com nome, sentido padrão, rede desenhada a partir das predecessoras e tabela (nome, cor, duração por local em dias úteis, equipe com sugestões das equipes da obra, unidade, "Depois de" com espera), salvamento automático 1 s depois com trava de revisão, duplicar, excluir e "Lançar na Linha de Balanço".
- **Lançar fluxo** (`lob-launch-dialog.tsx`): fluxo, locais marcados, início, sentido e ritmo (contínuo, takt fixo, todos juntos), com prévia calculada no navegador pela mesma função do servidor (`planLaunch`), aviso dos blocos mantidos e da linha de base automática.
- **Medições** (`measurements-view.tsx`, `measurement-sheet.tsx`, `measurement-photos.tsx`): rodadas, avanço físico, folha com abas Atuais/Futuras/Concluídas, agrupada por local, previsto até a data, anterior, realizado acumulado com atalhos, desvio, datas reais e ações (fotos, observação, motivo do atraso, histórico). No celular (abaixo de 768 px) a folha vira um local por vez, com cartões, − e + de 5 em 5, "Tirar foto" (câmera traseira) e "Galeria". As fotos são comprimidas no navegador pelo mesmo `compressImage` da Terminalidade e sobem direto ao Storage por URL assinada.
- **Vagões e restrições** e **Planejador**: como antes. O Planejador continua responsável por "Gerar vagões" (regra 1).

### Onde o dado fica

- `src/domain/lob.ts`: tipos e regras puras (dias úteis, cascata, lançamento, previsto, atraso, avanço físico, medições, importação do Planejador).
- `src/application/use-cases/lob-commands.ts`: 26 comandos, que recebem os dados de uma obra e devolvem o que gravar, como a Terminalidade.
- `src/infrastructure/repositories/supabase/lob-repository.ts` e as rotas `GET /api/lob`, `POST /api/lob/commands`, `GET/POST/PUT/DELETE /api/lob/flows` e `POST/DELETE /api/lob/upload-url`. Todas exigem o módulo "Longo prazo" (`/api/lob` entrou em `RESTRICTED_API_PREFIXES`); consulta só lê.
- **Migração 0038** (`0038_lob.sql`, criada e **aplicada no `takt-hub` em 04/11/2026**, por conexão direta ao banco numa transação; conferidos as 10 tabelas, o `grant` para `service_role`, o bucket e a leitura pela API REST): `service_flows` (da empresa, sem obra), `lob_locals`, `lob_services`, `lob_launches`, `lob_activities`, `lob_dependencies`, `lob_baselines`, `lob_measurements`, `lob_measurement_items`, `lob_photos` e o bucket privado `medicoes` (JPEG até 2 MB). Fora do snapshot, não reescreve `commit_planning`, reexecutável. Sem ela, só as três visões novas respondem "indisponível". As tabelas da obra têm `on delete cascade` a partir de `works`, então o `delete_work` da 0037 leva tudo junto sem ser reescrito, e a rota de exclusão apaga também a pasta da obra no bucket `medicoes` (`work-files.ts`). Uma medição aberta por obra é garantida por índice único parcial. Sondagem nova na tela de saúde do banco; bootstrap regenerado (38 migrações) e `conferencia.sql` com as 10 tabelas e o bucket.

### Decisões de implementação (onde o modelo não dizia)

- Tudo em dias úteis, segunda a sexta, sem feriados (regra 5). O fim do bloco é exclusivo; o término mostrado é o último dia trabalhado.
- Atraso: previsto até hoje menos medido ≥ 10 pontos, e nunca em bloco a 100%. O limiar evita marcar em vermelho tudo o que andou na semana desde a última medição.
- Importar do Planejador: cada pavimento vira local, cada serviço × pavimento um bloco com a data atual; a espera do Planejador (dias corridos) vira dias úteis e nunca passa da folga real entre os blocos, para a importação não empurrar nada; nomes repetidos ganham sufixo "(2)". Só funciona com a Linha de Balanço vazia.
- Linha de base automática "Antes do lançamento dd/mm/aaaa", com sufixo se houver duas no mesmo dia. O lançamento devolve quantos blocos entraram e quantos foram mantidos.
- Medições: cada valor é gravado ao sair do campo (não há botão "Salvar rascunho"); campo vazio é recusado em vez de virar 0%; esvaziar um lançamento existente o remove, com confirmação; motivo ou observação num bloco não lançado cria o lançamento com o valor anterior. Corrigir a última medição já salva preenche as datas reais como o fechamento; excluir uma medição desfaz as datas reais iguais à data dela que nenhuma outra medição sustenta; numa medição já salva, a única foto de um avanço não pode ser excluída.
- Indicadores e contagem de atrasos são da obra inteira, não dos filtros.
- Fluxo: novo serviço já entra ligado ao último (para manter um só serviço inicial); "Lançar" fica desabilitado enquanto há alteração não salva; falha de rede no salvamento não tenta de novo sozinha.

### Correções feitas pela bateria de testes

O agente de testes achou quatro defeitos, todos corrigidos com teste: `isLocalDate` (`long-term-plan.ts`, também usado pelo Planejador) estourava `RangeError` com mês 13 ou dia 32 em vez de devolver falso; a importação do Planejador usava a espera em dias corridos como dias úteis e empurrava blocos no primeiro arrasto; a importação criava locais ou serviços homônimos que a 0038 recusaria; campo vazio virava 0%. Também: fluxo com serviço dependente de si mesmo passava pela trava de lançamento, e "12 meses" eram 360 dias.

### Validação (04/11/2026)

- Sequência do CI inteira: `typecheck`, `lint` (nenhum aviso nos arquivos novos), `format:check`, `npm test` com 908 testes (75 novos em `tests/lob.test.ts` e `tests/lob-commands.test.ts`, mais a semente da exclusão de obra com as tabelas da 0038), `validate:migrations`, bootstrap (77 de 77 itens), `build` e o teste de fumaça (8 de 8).
- **Navegador**: `next dev` local apontado para um Supabase falso (só o perfil) e as rotas `/api/*` respondidas no Playwright pelas regras reais do domínio, com uma obra de exemplo de 14 locais, 8 serviços, 112 blocos e 3 medições salvas com fotos. Conferidos em 1440 px e 400 px: Linha de Balanço, lista de atrasos, seleção e painel, arrasto (término de 18/03/2027 para 22/04/2027 com as sucessoras empurradas), tabela, lançamento de um segundo fluxo pelo endereço `?lancar=` (linha de base automática gravada), fluxos, medição (dois valores gravados, "Salvar" travado por avanço sem foto, foto enviada pelo diálogo) e a folha no celular. Nenhum erro de console. A conferência achou e corrigiu dois defeitos de layout: a tabela do fluxo empurrava a página 115 px (textos só para leitor de tela escapando do contêiner rolável) e, no celular, as três grades não encolhiam até a tela.
- **Não validado**: gravação real pelas telas (a 0038 foi aplicada e as tabelas respondem pela API, mas nenhum fluxo foi lançado em obra real), envio real de foto ao Storage, dois usuários editando o mesmo fluxo (409), e celular de verdade com câmera.

### Fontes consultadas sobre o Prevision

Artigos do suporte (suporteprevision.freshdesk.com): "Criando um Macrofluxo", "Como lançar o macrofluxo no Cronograma?", "Análise e ajustes do planejamento em linha de balanço" e "Como fazer medição física da obra". Deles saíram: macrofluxo criado pelo administrador e lançado por usuário normal; lançamento por lote com backup automático; sentido topo → base ou base → topo definido no pacote; macrofluxo e cronograma independentes depois do lançamento; medição com data retroativa, atividades atuais e futuras (12 meses), acumulado que não pode cair, atalhos "igualar ao previsto" e "100%", coluna de ações com imagens, observações e motivos de atraso, início e término reais digitados, data travada depois de salvar; na Linha de Balanço, barra azul-escura nas medições, azul-clara em hoje, arrastar replaneja as sucessoras, atalhos de seta, +, −, H e Ctrl+Z.

### Pendências

- Conferir no ar: abrir a aba 1 de uma obra logado e ver as três visões novas sem o aviso de "indisponível".
- Primeiro uso real: cadastrar os locais, criar o fluxo da empresa e lançar numa obra, ou importar o plano do Planejador de uma obra que já o tem.
- Etapa 3, a combinar (regra 27): "Gerar vagões" a partir da Linha de Balanço (e então tirar o Planejador), datas marco, edição em lote, medição sem sinal (fila no aparelho, como a Terminalidade), importar o cronograma do Prevision direto para a Linha de Balanço, "Importar .xml do Project" na tela de fluxos e o PDF da medição.
- O dashboard da aba 0 (outra sessão, também só no disco) lê o longo prazo do Planejador (`/api/long-term-plan`), não da Linha de Balanço: quando a Linha de Balanço virar a fonte, o quadro de longo prazo do dashboard deve passar a ler `/api/lob` (blocos, medições e avanço físico).
- Lacunas conhecidas: corrigir para cima um valor da última medição já salva não exige foto no servidor (a tela marca em âmbar); o motivo do atraso é pedido pela tela, mas o servidor não o exige; não há limpeza periódica de fotos órfãs no bucket (mesma pendência da Terminalidade); o takt padrão do diálogo de lançamento é 10 dias úteis, sem ler a sequência de vagões.

## Médio prazo: tabela do cronograma com altura de tela no notebook (04/11/2026)

**Pedido do usuário:** "o campo de adição de informações no médio prazo está muito pequeno", com print da Essenza num notebook: a tabela e o Gantt mostravam cinco linhas.

### Causa

A área de trabalho (barras, Linha do Tempo, visão e barra de status) era medida do lugar dela até o pé da janela, para a barra de status ficar à vista sem rolar (correção "barra de status abaixo da dobra", 21/10). Com o cabeçalho da aba acima, numa janela de cerca de 800 px de altura, o que sobrava para a visão era menor que o piso `MIN_VIEW` (200 px), e a visão ficava presa nele: cinco linhas e meia.

### O que mudou (`schedule-sheet.tsx`)

- Se, medida do lugar dela, a área de trabalho deixa a visão com pelo menos `COMFORT_VIEW` (360 px, cerca de 11 linhas), nada muda: monitor grande continua com a barra de status à vista sem rolar.
- Abaixo disso, a área de trabalho passa a ter a altura de uma tela inteira, descontada a barra fixa da trilha (medida: elementos `sticky` filhos do contêiner que rola). Rolando a página até o cronograma, a tabela ocupa todo o espaço livre e a barra de status fica no pé da tela.
- `MIN_VIEW` continua valendo para janela baixa demais até para isso.

### Validação (04/11/2026)

- Typecheck, ESLint (sem aviso novo; os dois avisos do arquivo já existiam) e Prettier no arquivo.
- A regra rodou em Chromium headless numa maquete do layout (barra fixa da trilha, cabeçalho da aba, área de trabalho com as faixas do print), fora do repositório: em 1470×800 a visão foi de 200 px para 357 px (de ~5 para ~11 linhas) e a área de trabalho cabe na tela depois de rolar; em 1920×1000, de 318 para 557 px; em 2560×1360 ficou igual (678 px).
- **Não foi aberta no app logado.**

### Pendências

- Conferir logado no notebook, na Essenza: rolar até o cronograma e ver a tabela até o pé da tela.
- Se o pedido era o campo "Anotações e encaminhamentos" do painel de detalhes (hoje com altura mínima de 96 px), aumentá-lo é outra mudança, não feita aqui.

## Longo prazo: Gantt de legalização na aba 1 (04/11/2026)

Pedido do usuário em 04/11/2026: no longo prazo, um botão de "Gantt de legalização/terminalização": nos 12 meses até a entrega da obra, um Gantt com o caminho crítico da obra e a legalização.

Seguindo o combinado de 30/10/2026, o modelo de UX foi publicado antes do código (<https://claude.ai/artifact/EtzWbULbk4K2Qk1pEQa93j>: o Gantt com dados de exemplo, o diálogo de criação, o "Trazer da Linha de Balanço", 18 regras numeradas e as próximas etapas A–C). O usuário aprovou sem mudanças ("pode seguir"), e a implementação seguiu as 18 regras. **Nenhuma migração.** Commitado e publicado (push para `main`) em 05/11/2026, a pedido do usuário.

### O que a aba 1 mostra agora

- Visão nova **Gantt de legalização** (`?visao=legalizacao`) na barra de visões da aba 1, depois de Medições. A aba passa a ter seis visões.
- **Sem Gantt na obra:** o botão "Criar Gantt de legalização" abre o diálogo com a entrega contratual, a janela que sai dela, "Modelo ATR de legalização" ou "Em branco", a caixa "Trazer também os serviços da Linha de Balanço que passam pela janela" (marcada; o botão vira "Criar e revisar a Linha de Balanço" e a lista do "Trazer" abre sozinha uma vez depois de criar), a prévia (primeira tarefa, entrega prevista, críticas, calculadas no navegador com o mesmo `buildLegalizationTasks` e o motor) e o nome opcional. O perfil de consulta vê o estado vazio sem o botão.
- **Com Gantt:** o mesmo componente do cronograma do médio prazo (tabela e Gantt no layout do Project, motor conferido no Project 2019, restrições, prazo final, caminho crítico, linha de base, desfazer, "Informações da tarefa", exportação .xml, rascunho e "Revisar e salvar" com motivo), com título próprio, a janela de 12 meses sombreada no Gantt, o filtro e o indicador "Fora da janela" no lugar de "Fora do horizonte" (sem a faixa amarela de aviso: tarefa antes da janela é normal, regra 6), o indicador LB nas linhas trazidas da Linha de Balanço, o zoom inicial em meses e a coluna "Folga total" visível por padrão (valem até a pessoa guardar as preferências dela).
- **Resumo no topo:** cinco cartões ("Entrega contratual"; "Entrega prevista", com os dias úteis depois ou antes do prazo; "Caminho crítico", com as tarefas críticas e a folga total do marco da entrega; "Marcos de legalização", cumpridos de quantos; "Próximo marco", que seleciona a tarefa no cronograma) e, quando a entrega prevista passa do prazo, o aviso vermelho "A entrega prevista passa N dias úteis do prazo. O que empurra: …", com os nomes da cadeia clicáveis e a folga que a obra em si ainda tem, quando tem.
- **"Alterar entrega"** (no lugar do seletor de mês, com "Salvar entrega") troca a data contratual e, se quiser, o nome; a janela anda junto e o prazo final do marco que estava na entrega antiga vai para a nova. As tarefas não mudam de data. Grava direto no banco, então fica travado com rascunho aberto ("Salve ou descarte o rascunho antes de alterar a entrega."): o "Revisar e salvar" seria recusado por o cronograma ter mudado por fora. Gantt gravado sem entrega válida abre só um aviso com "Informar a entrega".
- **"Trazer da Linha de Balanço"** (na barra de ferramentas) busca a Linha de Balanço a cada abertura e mostra um resumo por serviço ("Locais", "Início (1º local)", "Término (último)", "% medido" e "No Gantt": "Linha nova · LB", "Atualiza a linha LB" ou "Fora da janela"); "Trazer N linhas" leva os marcados para o rascunho num passo só do desfazer e avisa quantas linhas entraram e quantas foram atualizadas. Fica travado com célula em edição ou gravação; obra sem blocos recebe o convite para lançar um fluxo; se o Gantt tem "Acabamentos internos dos apartamentos", um aviso sugere apagá-la quando as linhas LB a cobrirem.
- **Fora do resto do sistema (regra 17):** o Gantt e as tarefas dele não aparecem na lista de cronogramas do mês, em "Próximos 90 dias" e "Cobertura", em Recursos e na carga das equipes, na variação contra linha de base do médio prazo, no quadro do médio prazo do dashboard nem para a assistente (briefing e ferramentas).

### Decisões (as 18 regras do modelo, resumidas)

- **Onde fica e como funciona.** (1) Botão na barra de visões da aba 1, depois de Medições, com `?visao=legalizacao` no endereço. (2) É o mesmo cronograma do médio prazo, sem motor novo. (3) Um Gantt por obra, vivo até a entrega; linha de base quando a pessoa clicar. (4) Mesma gravação e mesmos papéis do médio prazo: rascunho e "Revisar e salvar" com motivo; consulta só vê; planejador, gerente e admin editam; quem vê a aba 1 vê o Gantt.
- **Entrega e janela.** (5) A entrega contratual vira o "Prazo final" do marco "Entrega das chaves", não uma restrição "Deve terminar em": passando dela, o marco fica vermelho e a folga negativa mostra o atraso. (6) Janela de 12 meses antes da entrega, sombreada e usada no zoom inicial; tarefa pode começar antes dela. (7) A tolerância de 180 dias do contrato não entra no cálculo.
- **Caminho crítico.** (8) Ligado por padrão, com a coluna "Folga total" à mostra; crítica é folga total ≤ 0, como no Project. (9) Cinco números no topo; marco de legalização é toda tarefa de duração zero dentro do grupo "Legalização". (10) Aviso vermelho com a cadeia quando a entrega prevista passa do prazo.
- **Modelo pronto.** (11) "Modelo ATR de legalização" com 38 linhas: o caminho crítico da obra, a legalização por órgão (Corpo de Bombeiros, concessionárias, elevadores, Prefeitura, Receita Federal, cartório e condomínio) e o marco da entrega; esperas de órgão em dias corridos; "Em branco" continua disponível. (12) Montado de trás para frente: as tarefas sem predecessora ganham "Não iniciar antes de" calculado a partir da entrega; daí em diante o motor agenda para frente. (13) O órgão é a linha de resumo, sem coluna nova. (14) Responsável na coluna "Nomes dos recursos", com as equipes da obra.
- **Linha de Balanço.** (15) "Trazer da Linha de Balanço" cria uma linha por serviço, com início do primeiro local, término do último e % medido, no grupo "Caminho crítico da obra", com indicador LB e "Não iniciar antes de" no início da Linha de Balanço. (16) Trazer de novo atualiza só as linhas LB (início, duração, %); não sincroniza sozinho.
- **Fora do resto do sistema.** (17) Nesta etapa o Gantt fica só na aba 1. (18) Sem migração: o tipo e a data de entrega vão no `schedule_meta` que já existe.

### Decisões de implementação (onde o modelo não dizia)

- **Gravação:** o Gantt é um `MediumTermPlan` com `kind: 'legalizacao'` e `deliveryDate` no `schedule_meta`; a tarefa trazida da Linha de Balanço guarda `lobServiceId` no `schedule_meta` dela. O `month` obrigatório recebe o mês em que a janela começa. `create_plan` ignora o Gantt na regra de um cronograma por mês e recusa copiar dele ("Copie de um cronograma do mês, não do Gantt de legalização."). Um segundo Gantt na mesma obra é recusado ("Esta obra já tem um Gantt de legalização.").
- **Janela:** do dia seguinte à mesma data 12 meses antes até a entrega (entrega 30/09/2027 → 01/10/2026 a 30/09/2027); dia 31 num mês curto vira o último dia do mês.
- **Modelo ATR:** 38 linhas e 38 vínculos, os da tela 1 do modelo (a tela 2 dizia "41 vínculos"; era erro de texto). A origem começa cerca de 280 dias úteis antes da entrega e é corrigida em até 8 rodadas até o marco cair na entrega, ou no dia útil anterior quando ela cai em fim de semana ou feriado, para o Gantt não nascer atrasado. O modelo nasce com 0% em tudo e sem equipes.
- **"Em branco":** só o marco "Entrega das chaves" com o prazo final (a tela 2 do modelo citava também a linha de resumo).
- **Resumo:** o marco da entrega é a tarefa com prazo final igual à entrega, preferindo o marco (duração zero) quando outra tarefa também tem esse prazo (sem nenhuma, o marco com "entrega" no nome); o atraso em dias úteis usa o calendário do cronograma (feriados); a cadeia segue as predecessoras determinantes a partir dele, preferindo as críticas e de menor folga, sem os marcos intermediários, para caber numa linha; marcos de legalização são as tarefas de duração zero abaixo da linha de resumo "Legalização" (comparada sem acento nem caixa), e cumprido é 100%; o próximo marco é o primeiro não concluído com início a partir de hoje.
- **Trazer da Linha de Balanço:** % medido = blocos ponderados pela duração, pela última medição fechada. Vêm marcados os serviços que tocam a janela, inclusive os que começam antes do fim dela e terminam depois (a regra 15 falava só nos que terminam dentro); os textos da tela dizem "que passam pela janela". Início no dia útil seguinte quando cai em fim de semana, duração em dias úteis do primeiro ao último dia, % acima de zero preenche o início real e 100% o término real. Linhas novas entram no fim do grupo "Caminho crítico da obra", um nível abaixo dele (sem o grupo, no fim do cronograma), sem vínculos. A linha é reconhecida pelo serviço de origem, então renomeá-la não quebra a atualização.
- **Alterar entrega** (`update_legalization_plan`): leva junto só o prazo final que estava na data antiga; outros prazos finais ficam. Recusado em linha de base.
- **Linha de base:** `freeze_plan_baseline` copia o tipo e a entrega para a linha de base, que também fica fora do médio prazo. A exclusão (`delete_plan`) é a do médio prazo e recusa plano com linha de base salva.
- **Acesso:** `create_legalization_plan` e `update_legalization_plan` são da seção `longo-prazo`; `save_plan_revision`, `freeze_plan_baseline` e `delete_plan` foram liberados também para ela. Ressalva registrada no código: esses três comandos não distinguem o tipo do plano antes de ler o banco, então quem tem só a aba 1 poderia, por chamada feita à mão, gravar um plano do mês. Aceito por enquanto (mesma equipe).

### Arquitetura

- `src/domain/legalization.ts` (novo, funções puras): tipo e filtros (`isLegalizationPlan`, `isMonthlyPlan`, `legalizationPlanIds`, usados no isolamento da regra 17), janela (`legalizationWindow`, `legalizationMonth`), modelo ATR (`LEGALIZATION_TEMPLATE`, `buildLegalizationTasks`), resumo do topo (`legalizationSummary`) e importação da Linha de Balanço (`lobServiceRows`, `applyLobImport`).
- `src/domain/entities.ts` (`MediumTermPlan.kind` e `deliveryDate`, `PlanTask.lobServiceId`) e `src/infrastructure/repositories/supabase/mappers.ts` (os três no `schedule_meta`).
- `src/application/use-cases/commands.ts`: `create_legalization_plan` e `update_legalization_plan`; `create_plan` e `freeze_plan_baseline` passam a conhecer o tipo. `src/application/module-access.ts`: os comandos da seção `longo-prazo`.
- `src/modules/medio-prazo/schedule-sheet.tsx`: `SheetVariant` (título, subtítulo, janela e o nome dela, `headerExtra` no lugar do seletor de mês (como função, enxerga o rascunho: é assim que "Alterar entrega" trava com rascunho aberto), `footerExtra` no lugar de "Novo cronograma do mês", zoom e colunas iniciais, `summary` e `tools`) e `SheetApi` (`canEdit`, `replaceTasks` num passo só do desfazer, `selectTask`). Sem variante, o cronograma do mês segue como estava.
- A visão na página da aba 1 (`src/app/(app)/obras/[obraId]/longo-prazo/page.tsx`: item na barra de visões, descrição e parágrafo no "Como funciona") e os componentes em `src/modules/longo-prazo/legalizacao/`: `legalization-view.tsx` (estado vazio, variante do cronograma, um Gantt vivo por obra), `legalization-summary.tsx` (resumo do topo), `legalization-forms.tsx` (criar e alterar entrega) e `lob-import.tsx` (trazer da Linha de Balanço).
- Isolamento (regra 17), por `isMonthlyPlan` ou `legalizationPlanIds`: lista de cronogramas do mês (`schedule-sheet.tsx`), "Próximos 90 dias" e "Cobertura" (`look-ahead-overview.tsx`), Recursos (`resource-analysis.tsx`, `schedule-analysis.ts`), carga das equipes (`rules.ts`), variação contra linha de base (`baseline-delays.tsx`), quadro do médio prazo do dashboard (`medium-term-panel.ts`) e a assistente (`agent-briefing.ts`, `agent-tools.ts`). Em `resources.ts` (uso da equipe) as linhas do Gantt saem da contagem do médio prazo, mas continuam no total, porque a equipe segue vinculada; as Configurações da obra mostram "N no Gantt de legalização" ao lado de "no médio" e "no curto", para a equipe com o excluir travado não parecer sem uso (`work-resources.tsx`). Em `scope-planning.ts`, quem tem o longo prazo sem o médio prazo recebe só o Gantt de legalização e as linhas de base dele, com tarefas e vínculos; os planos do mês continuam fora.
- Manual da assistente (seção `longo-prazo-gantt-legalizacao`, a visão geral da aba 1 com a visão nova e uma frase na visão geral do médio prazo) e tour da aba 1 (passos com os alvos `longo-legal-criar`, `longo-legal-gantt`, `longo-legal-resumo`, `longo-legal-entrega` e `longo-legal-trazer-lb`; os passos `longo-visoes` e de abertura citam a visão nova).

### Validação (04/11/2026)

- **Testes:** 27 em `tests/legalization.test.ts` (janela; modelo ATR com 38 linhas e 38 vínculos, níveis, restrições, reagendamento idempotente, entrega em sábado, domingo, feriado e em 12 datas de anos diferentes sem o marco passar do prazo; resumo no prazo, com atraso forçado, com feriado e com outra tarefa no mesmo prazo final; `lobServiceRows`; `applyLobImport`; os comandos, inclusive recusas; ida e volta do mapper; acesso por módulo; recorte de `slimForModules`) e 7 em `tests/legalization-isolation.test.ts` (carga de equipe, uso da equipe, carga semanal, quadro do médio prazo do dashboard, briefing e ferramentas da assistente dão o mesmo resultado com e sem o Gantt no mesmo mês; rodado contra as versões antigas, 6 dos 7 falham). O agente de testes achou um defeito, corrigido: o resumo tomava como entrega qualquer tarefa com o prazo final igual à entrega, mesmo sem ser o marco.
- **CI inteiro verde:** `typecheck`, `lint` (0 erros; 1 aviso novo, do mesmo tipo de um que já existia no `schedule-sheet.tsx`), `format:check`, `npm test` (1019 de 1019), `validate:migrations`, `build` e o teste de fumaça no navegador (8 de 8).
- **Navegador** (Playwright, Chromium 1600 px), numa página de prévia temporária fora do layout autenticado, com todas as APIs respondidas pelo Playwright com dados de teste (o `next dev` local não alcança o banco: o `.env.local` deste repositório aponta para o Supabase antigo, que não existe mais): estado vazio, diálogo de criação com a janela 01/10/2026 a 30/09/2027 e a prévia "no prazo · 11 tarefas críticas", criar (um único `create_legalization_plan` interceptado), o "Trazer da Linha de Balanço" abrindo sozinho com Estrutura e Alvenaria fora da janela e Revestimento cerâmico e Pintura marcados, "Trazer 2 linhas" pondo as duas linhas LB no fim do grupo "Caminho crítico da obra", o resumo com a vistoria da prefeitura alongada ("Entrega prevista Dom 10/10/27 · 6 dias úteis depois do prazo", folga total -6, cadeia de elevadores à instituição do condomínio no aviso vermelho), "Alterar entrega" travado com o rascunho aberto, nenhum erro no console. Na mesma página, o cronograma do médio prazo com um plano do mês no mesmo mês do Gantt listou só o plano do mês no seletor. A página de prévia foi apagada.
- **Não validado:** nada foi aberto logado nem gravado no Supabase real; a importação com uma Linha de Balanço real não foi testada.

### Pendências e próximas etapas

- Conferir logado numa obra real: criar o Gantt pelo modelo ATR, editar, "Revisar e salvar", definir linha de base, alterar a entrega e abrir o .xml exportado no Project.
- Primeira importação real: "Trazer da Linha de Balanço" numa obra com blocos lançados e medições salvas, conferindo datas, duração e % das linhas LB, e trazer de novo para ver a atualização.
- Conferir com a equipe a lista e as durações do modelo ATR (regra 11: "é o que mais precisa do seu olho"), em especial as esperas de órgão em dias corridos (Bombeiros 30, Prefeitura 60, cartório 45 + 45, concessionárias 30 a 45).
- Ressalva de acesso: fazer `save_plan_revision`, `freeze_plan_baseline` e `delete_plan` conferirem o tipo do plano antes de autorizar pela seção (ler o plano na rota de comandos), para quem tem só a aba 1 não gravar um plano do mês.
- O resumo e a importação acham os grupos pelo nome: renomear "Legalização" tira os marcos do resumo, e renomear "Caminho crítico da obra" manda as linhas LB para o fim do cronograma.
- Próximas etapas do modelo (não entram agora):
  - **A.** Cartão "Entrega prevista" no dashboard da obra (aba 0) e no dashboard geral.
  - **B.** "Vistoria interna de terminalidade" com o % de pendências resolvidas da aba 5.
  - **C.** PDF do Gantt para a diretoria e anexar o documento emitido (AVCB, Habite-se) à linha do marco.

## Curto prazo: local da linha e filtro de local no PDF (05/11/2026)

Pedido do usuário: "no curto prazo, adicione um campo de local (opcional) para que as tarefas possam ser filtradas por local ao gerar o PDF. O local deve ser o mesmo do longo prazo (lista suspensa que vem de configuração de obra)". Implementado sem modelo de UX (é uma coluna nova e uma seção na janela do PDF, no padrão das que já existem).

### De onde vem a lista

Dos **"Locais da obra" da Linha de Balanço** (aba 1, gaveta "Locais da obra", tabela `lob_locals` da 0038), de cima para baixo como na gaveta. É a lista do longo prazo atual; a gaveta também traz os locais do planejamento dos vagões ("Usar os locais da obra"). A linha guarda o **id** do local (`weekly_commitments.local_id`, migração **0039, criada e não aplicada**): renomear o local muda o nome em todas as linhas, e apagar o local deixa a linha sem local (`on delete set null`). Como `/api/lob` é restrita ao módulo do longo prazo e o curto prazo é aberto a todos, a lista sai de uma rota própria, `GET /api/curto-prazo/locais?workId=` (só id, nome e ordem, para quem tem a obra), lida pelo hook `src/modules/curto-prazo/use-work-locals.ts`. Obra sem local cadastrado: a célula fica travada com a dica "Cadastre os locais em Configurações da obra (Locais da obra)" (até 05/11/2026 a dica mandava para a aba 1; ver a seção seguinte).

### O que mudou

- **Planilha:** coluna **Local** (opcional) entre Atividade e Equipe, lista suspensa com os locais da obra e "(sem local)" para tirar; funil de filtro pelo nome do local, com "(vazias)"; trava igual às outras células da linha (semana encerrada só admin, Consulta só lê). No celular, o cartão ganha o campo, só nas obras com locais.
- **O local acompanha a linha:** "Levar ›" leva o local para a semana seguinte; a alça de preencher copia o local (um `update_commitment` por linha, desfeito de uma vez); o Desfazer devolve o local anterior, inclusive "sem local"; a exclusão desfeita recria a linha com o local. "Inserir linha acima" não herda o local, como as outras colunas.
- **Comandos:** `create_commitment` e `update_commitment` aceitam `localId`; em `update_commitment`, **ausente mantém** o local (telas e chamadas de antes do campo não o apagam) e `null` tira. O servidor só confere o formato (os locais não vêm no planejamento carregado); a chave estrangeira recusa local inexistente. A projeção otimista (`local-apply.ts`) segue a mesma regra.
- **PDF:** a janela antes do PDF ganha a seção **Local** no estilo da lista de empreiteiros (contagem, pesquisa, "(sem local)"), só quando alguma linha da semana tem local; o filtro de coluna Local da planilha vira a seleção inicial. Os desmarcados vão na URL como `excluir-local=<id>` (vazio = "sem local"). A página de impressão filtra por empreiteiro e por local, põe a coluna Local depois de Atividade quando alguma linha impressa tem local e escreve "Local: Torre A, Torre B" sob o título de cada folha. Ela espera os locais carregarem e, com recorte de local e a lista em erro, mostra o erro em vez de imprimir. O painel da primeira página do fechamento continua na obra inteira (o rodapé cita o recorte). Vale para os dois PDFs da janela.
- **Arquivos:** `src/modules/curto-prazo/commitment-local.ts` e `print-options.ts` (puros, novos), `commitments-overview.tsx`, `print-dialog.tsx`, `print-sheet.tsx`, `print-dashboard.tsx`, `undo.ts`, `fill-handle.tsx`, a página de impressão, `local-apply.ts`, `commands.ts`, mappers, `entities.ts`, `migrations.ts` (verificação da 0039), manual da Claudia e tour do curto prazo (passo "Local (opcional)").

### Validação (05/11/2026)

Testes novos: `tests/commitment-local.test.ts` (11), `tests/commitment-local-command.test.ts` (4) e um caso em `tests/local-apply.test.ts`; `npm run validate:migrations` passa com a 0039 (grava o local, recusa local inexistente, apagar o local deixa a linha sem local). Nada foi aberto no navegador logado, o PDF não foi impresso com a coluna, e a gravação real depende de aplicar a 0039.

### Pendências

- **Aplicar a 0039 no takt-hub antes de publicar o código.** Sem ela o código funciona, mas a coluna Local não grava.
- Comando em lote para o local (a alça manda uma gravação por linha); a assistente ainda não lê o local; quem tinha larguras de coluna salvas vê a planilha 128 px mais larga até "Ajustar à tela"; o nome do arquivo do PDF não cita o recorte por local.

## Configurações da obra: cadastro dos locais da obra (05/11/2026)

**Pedido do usuário:** "onde fica o campo para inserir os locais? deveria estar em configuração da obra". Até aqui os locais da coluna Local do curto prazo só se cadastravam na aba 1 (Linha de Balanço → "⋯" → "Locais da obra"), que é restrita ao módulo do longo prazo: quem só tem o curto prazo via a coluna travada e não tinha onde cadastrar.

### O que mudou

- **Seção "Locais da obra"** nas Configurações da obra (`src/modules/configuracoes/work-locals.tsx`), logo abaixo de "Local da obra" (a cidade, que é outra coisa). Mostra os locais do topo para a base e a contagem, ou "Nenhum local cadastrado. Sem locais, a coluna Local do curto prazo fica travada.". O botão "Cadastrar locais" ("Cadastrar e ordenar locais" quando já há algum) abre **a mesma gaveta da Linha de Balanço** (`lob-locals-panel.tsx`, carregada só ao abrir): cadastro em lote da base ao topo, renomear na lista, setas para a ordem, lixeira e "Usar os locais dos vagões". Consulta vê a lista sem o botão.
- **A lista é a mesma** (`lob_locals`, migração 0038, já aplicada): o que se cadastra aqui aparece na Linha de Balanço e na coluna Local do curto prazo, e vice-versa. Nada de banco mudou; **nenhuma migração nova**.
- **Rota própria, aberta:** `GET/POST /api/work-locals` (`src/app/api/work-locals/route.ts`). Lê quem tem a obra; grava quem tem a obra e não é Consulta. Aceita só os quatro comandos do cadastro (`create_locals`, `rename_local`, `reorder_locals`, `delete_local`, filtrados por `parseWorkLocalCommand` em `src/application/use-cases/work-locals.ts`) e aplica as regras de sempre (`planLobCommand`): nome repetido recusado, limite de 300, local com blocos na Linha de Balanço não sai. `/api/lob/commands` continua restrita ao longo prazo.
- **Gaveta:** passou a receber `locals` e `blocksOf` em vez da Linha de Balanço inteira, para servir às duas telas. Textos: descrição "De cima para baixo, como o prédio · valem na Linha de Balanço e no curto prazo"; a confirmação de exclusão sem blocos avisa que as linhas do curto prazo que usavam o local ficam sem local; o botão "Usar os locais da obra" virou **"Usar os locais dos vagões"** (o título da gaveta já é "Locais da obra").
- **Curto prazo:** a dica da coluna sem locais passou a "Cadastre os locais em Configurações da obra (Locais da obra)".
- **Manual da Claudia** (seção "Configurações da obra: semana 1, local da obra e locais da obra", com palavras-chave como "onde cadastro os locais"; curto prazo e longo prazo ajustados) e **tour** das Configurações da obra (passos "Locais da obra" e "Cadastrar e ordenar locais").
- Decisões tomadas sem perguntar, por seguirem o padrão das outras seções da página: quem edita é quem edita o resto das Configurações da obra (todos menos Consulta); a gaveta da aba 1 continua lá. Não houve modelo de UX antes: a seção reaproveita a gaveta que já existia.

### Validação (05/11/2026)

- `tests/work-locals.test.ts` (4 testes: os quatro comandos aceitos, os demais e entrada inválida recusados, a lista de baixo para cima com os blocos, e as regras da Linha de Balanço valendo pela rota nova); manual e tour passam nos testes deles.
- **Navegador:** `next dev` local com o acesso sem login apontado para um Supabase falso (só o perfil) e `/api/planning` e `/api/work-locals` respondidas no Playwright pelas regras reais (`parseWorkLocalCommand`, `planLobCommand`, `workLocalsView`), fora do repositório. Planejador em 1440 px: seção com 3 locais, gaveta aberta, cadastro de "Cobertura" (entra no topo), renomear "2º pavimento", descer "Cobertura", excluir "Térreo" com bloco (confirmação avisa e o servidor recusa: "O local "Térreo" tem 1 bloco…"), excluir "1º pavimento" (confirmação cita o curto prazo); a seção acompanha cada passo. Consulta: lista sem botão, com "Seu perfil permite consulta aos locais.". Obra sem locais: texto do vazio e "Cadastrar locais". Celular em 400 px sem rolagem horizontal; nenhum erro de console.
- **Não foi aberta no app logado** nem contra o banco real.

### Pendências

- Conferir logado, numa obra real: cadastrar os locais nas Configurações da obra e escolher um na coluna Local do curto prazo.
- A terminalidade tem o seu próprio cadastro de "Pavimentos e unidades" na mesma página; as duas listas são independentes. Unificar, se fizer sentido, é outra decisão.

## Médio prazo: importar do MS Project e carga dos cronogramas de novembro (08/11/2026)

**Pedido do usuário:** "dentro do médio prazo quero criar uma ferramenta que possibilite que o usuário suba arquivos do MS Project direto para o sistema", ao criar um novo cronograma, e "inserir todos os médios prazos do mês de novembro no sistema para que comecem a operar 100% dentro da plataforma". Isso muda a decisão de 25/09/2026 ("Origem do plano: digitado direto no sistema, sem importar XML do Project").

Antes de codar, o modelo da tela foi publicado com as regras numeradas e a carga de novembro (https://claude.ai/artifact/2YVb8UYKWXFXP8Gn6UpRN5). O usuário respondeu "aprovado tudo", confirmou a exclusão do cronograma de teste da Blentt, mandou usar a versão do Drive do arquivo da Atmos e decidiu liberar o módulo de médio prazo **pessoa por pessoa** (em Configurações › Usuários, como já era), sem abrir para todos.

### Regras aprovadas

1. **Formato:** o `.xml` que o próprio Project grava (Arquivo › Salvar como › "Formato XML (*.xml)"). O `.mpp` é um formato fechado; ao escolher um, a gaveta explica o passo do XML. Aceitar o `.mpp` direto exigiria rodar no servidor um conversor de terceiros (o MPXJ compilado, pacote `@byteink/mppjs`, 68 MB, código aberto LGPL com proveniência SLSA) com acesso às chaves do sistema; ficou de fora porque a importação acontece uma vez por obra e, depois dela, cada mês nasce como cópia do anterior dentro do sistema.
2. **O que entra:** todas as tarefas do arquivo, na ordem e nos níveis do Project, com duração, % concluída, início e término reais, restrições, prazo final, anotações e vínculos nos quatro tipos com defasagem. O resumo do projeto (tarefa 0) não entra: o sistema calcula a linha 0.
3. **Recursos viram equipes:** liga à equipe da obra quando o nome bate (sem diferenciar acento e maiúscula, também no formato "EMPRESA - NOME", e "EMPRESA - NOME" casa com a equipe NOME da empresa que começa por EMPRESA, como "ATR - Adenir" com "adenir · ATR OBRA"). Sem candidata única, sugere criar a equipe com o nome do Project e a empresa antes do " - " (a empresa que já existe na obra mantém a grafia de lá). Na conferência dá para trocar cada um por outra equipe ou "Sem recurso". A equipe criada nasce com capacidade 1 (as "Unidades máximas" de 100% do Project) e aparece também no curto prazo.
4. **Linha de base:** a linha de base 0 do Project vira uma linha de base congelada do cronograma, "Linha de base do Project", já exibida no Gantt. Folha sem base fica fora dela (no Project aparece sem base); resumo entra sempre, para a estrutura não mudar.
5. **Calendário:** dias úteis, horas por dia e dias sem trabalho do calendário do projeto, inclusive períodos (recesso de fim de ano). Dia trabalhado fora do normal e calendário por recurso não existem no sistema e geram aviso.
6. **O que o sistema não tem:** tarefa manual vira automática com "Não iniciar antes de" na data dela; inativa não entra; linha em branco é ignorada; defasagem em horas ou % vira dias; vínculo com tarefa-resumo passa para as subtarefas (o sistema só vincula subtarefas): o que chega no resumo vai para as subtarefas sem predecessora dentro dele, o que sai, das subtarefas sem sucessora dentro dele. Cada caso vira um aviso na conferência.
7. **Datas:** o sistema refaz a rede ao gravar, como o Project faz ao abrir, e a conferência lista antes as tarefas cuja data ficaria diferente do arquivo.
8. **Quem pode:** quem já cria cronograma do mês (planejador, gestor ou admin com o módulo de médio prazo). Continua valendo um plano vivo por mês por obra.

### O que mudou

- **Leitor do XML** (`src/domain/mspdi-import.ts`, puro, sem dependência, roda no navegador e no Node): `parseMspdi(xml)` lê o MSPDI com um leitor XML próprio (pula o `TimephasedData`, que é a maior parte do arquivo) e `buildPlanImport(project, { month, fileName })` devolve o rascunho nas regras do servidor: linhas por `key` (o UID do Project), vínculos, calendário, linha de base, as datas que o Project mostra (`fileDates`), recursos com a contagem de tarefas, avisos agrupados por código e contagens.
- **Ponte com o comando** (`src/application/use-cases/plan-import.ts`): `suggestResourceChoices` (regra 3), `toImportCommand` e `compareWithProject`, que calcula as datas pelo mesmo `scheduleTasks` do servidor e lista as folhas diferentes do arquivo. A tela e o script usam as mesmas funções.
- **Comando `import_plan`** (`commands.ts`, liberado pelo módulo `medio-prazo` em `module-access.ts`): numa gravação só, cria o cronograma do mês com o calendário do arquivo, cria ou reaproveita as equipes (mesmo nome e empresa não duplica), grava as tarefas com as datas do motor e, com `baselineName`, congela a linha de base do Project. Valida como o "Revisar e salvar" (hierarquia, %, datas reais, restrição e prazo só em subtarefa, defasagem inteira de -365 a 365, vínculo sem tarefa, repetido ou para si mesma; ciclo cai na mensagem do motor) e recusa segundo plano no mesmo mês. Registra `plan_import` no histórico com o arquivo e as contagens. **Nenhuma migração**: tudo cabe nas tabelas e no `schedule_meta` que já existem.
- **Gaveta "Novo cronograma do mês"** (`src/modules/medio-prazo/new-plan-drawer.tsx`, no lugar do formulário antigo de `schedule-sheet.tsx`): "Partir de" ganhou "Importar do MS Project (.xml)". Escolhido o arquivo, a gaveta se alarga e mostra a conferência: linhas e resumos, vínculos, concluídas e em andamento, recursos; linha de base, calendário e horizonte; os avisos; a tabela de recursos → equipes com a escolha por linha; e as datas que mudam (até 40 linhas, depois "mais N"). O nome vem do título do arquivo (ou do nome do arquivo, quando o título é genérico como "msproj11"). O botão vira "Criar cronograma de Nov/26".
- **Script da carga** (`scripts/import-medio-prazo.ts`): o mesmo caminho da tela, por obra. Sem `--apply` simula e imprime o relatório; `--replace` exclui na mesma transação o cronograma vivo do mês e as linhas de base dele.
- **Conversão .mpp → .xml pela VM** (`scripts/ms-project/converter-xml.ps1`): no Project 2019 da VM, o `FileSaveAs` com `FormatID = 'MSProject.XML'` funciona quando chamado por `InvokeMember` com argumentos nomeados; a chamada posicional com `[Type]::Missing` não acha a sobrecarga. Em 20/10 o "Salvar como XML" tinha falhado (ver `docs/engenharia-reversa-project.md`).
- **Manual da Claudia** (seção "Criar o cronograma do mês…", com "Importar do MS Project") e **tour** ("Novo cronograma do mês").

### Carga de novembro

Arquivos que o usuário salvou em `~/Downloads/Médio prazo/`, exceto a Atmos, que veio do Drive compartilhado ("ATM Médio Prazo nov-fev.26.mpp", salvo em 06/11; a cópia da pasta Downloads era de 03/11, sem avanço). Os quatro foram convertidos para XML no Project da VM e simulados contra o banco de produção antes de gravar:

| Obra | Arquivo | Linhas | Vínculos | Linha de base | Datas iguais ao Project | Recursos |
| --- | --- | --- | --- | --- | --- | --- |
| Blentt | BLT_Médio Prazo NOV - JAN | 290 | 251 | 287 linhas | 273 de 274 folhas | 47: 16 ligados, 31 criados |
| Atmos | ATM Médio Prazo nov-fev.26 | 372 | 360 | 372 linhas | 285 de 285 | 18 criados |
| Brizz | Médio Prazo 05 - NOV - JAN (título BRZ-OUT-DEZ_26) | 94 | 118 (8 de resumo viraram 50) | 94 linhas | 80 de 80 | 1 criado |
| Tauá | 05 NOV - JAN - Atualização Gabriel | 25 | 14 | 25 linhas | 17 de 17 | 6 criados |

A única data diferente é a da linha 6 da Blentt ("SS2 - Infra carregadores carros elétricos"): vínculo IT com defasagem de -10 dias úteis a partir de uma tarefa que começa em 15/12 às 08:00. O Project mostra o término em 01/12 às 08:00 e o motor em 30/11, o fim do dia útil anterior: é o mesmo instante em horas de trabalho, com outra data na tabela (regra "subtrair cai no fim do dia" da passada direta; registrado em `docs/engenharia-reversa-project.md`).

**Gravado em produção em 08/11/2026** pelo `scripts/import-medio-prazo.ts --apply`, com o perfil do usuário, uma transação por obra, e conferido no banco:

- **Atmos:** "ATM Médio Prazo nov-fev.26", 372 tarefas, 360 vínculos, 283 com equipe, de 02/11/2026 a 06/04/2027, linha de base com 372 linhas, 18 equipes criadas.
- **Brizz:** "BRZ-OUT-DEZ_26", 94 tarefas, 118 vínculos, de 03/11/2026 a 20/01/2027, linha de base com 94 linhas, 1 equipe criada (Carpinteiros).
- **Tauá:** "05 NOV - JAN", 25 tarefas, 14 vínculos, de 07/10/2026 a 05/03/2027, linha de base com 25 linhas, 6 equipes criadas (a obra não tinha equipe).
- **Blentt:** "BLT_Médio Prazo NOV - JAN", 290 tarefas, 251 vínculos, 271 com equipe, de 03/11/2026 a 05/03/2027, linha de base com 287 linhas, 31 equipes criadas e 16 recursos ligados a equipes que já existiam. Antes, saiu o cronograma de teste "Teste do teste" (7 tarefas) com as linhas de base "Base 14/10/2026" e "Base 1/10/2026", como o usuário autorizou. O banco não deixava: o gatilho `guard_plan_baseline` (0023, ajustado na 0037) recusa apagar ou alterar linha de base ("Linha de base é imutável"), com exceção só da exclusão da obra inteira, e o `delete_plan` da aplicação cai no mesmo gatilho (hoje nenhuma linha de base sai pela tela). A exclusão foi feita por SQL, com autorização explícita do usuário, numa transação com a exceção do `obra360.deleting_work` restrita à Blentt, conferindo as contagens antes do commit (12 vínculos, 19 tarefas, 3 planos) e subindo a `planning_meta.version` para as telas abertas recarregarem. A primeira tentativa, sem essa autorização, foi bloqueada pela proteção automática da sessão.

Essenza, Mozine, Bioma, Nova Sede e SEPAT não tinham arquivo e seguem sem cronograma de novembro. O acesso à aba 3 continua **pessoa por pessoa** (decisão do usuário): quem vai operar o médio prazo de cada obra precisa do módulo "Médio prazo" marcado em Configurações › Usuários.

### Validação (08/11/2026)

- **Testes novos:** `tests/mspdi-import.test.ts` (15: níveis, nulas e inativas, formatos de duração, marco, manual, estimada, restrições, vínculos nos quatro tipos com defasagem útil, corrida, negativa e em horas, vínculo com resumo, recursos, calendário com recesso, feriado e exceção de dia útil, linha de base, entidades e BOM, XML que não é do Project, e ida e volta com `buildMspdi`), `tests/plan-import-command.test.ts` (7: gravação completa com equipe existente, equipe criada, vínculo, datas pela rede, feriado e linha de base; equipe reaproveitada; sem linha de base; 14 recusas; mês ocupado; ciclo; módulo) e `tests/plan-import.test.ts` (3: sugestão de equipes, montagem do comando e comparação de datas).
- **Arquivos reais:** leitura de 1 a 23 ms por arquivo; o motor sobre o rascunho chega às datas do Project em 655 de 656 folhas.
- **Navegador:** a gaveta foi aberta numa página de prévia temporária com `next dev` e as APIs respondidas pelo Playwright com as regras reais (`applyCommand` sobre os dados de exemplo), com o XML real da Blentt. Em 1440 px: o .mpp é recusado com a explicação, a conferência aparece com os números do arquivo, a troca de equipe de um recurso funciona, "Criar cronograma de Nov/26" grava (290 tarefas) e avisa "Cronograma importado do Project", sem erro de console. Em 400 px, sem rolagem lateral. A primeira passada achou a gaveta cortada à direita no celular (o `fieldset` não encolhia; ganhou `min-w-0`) e o nome do arquivo repetido; os dois foram corrigidos. **Não foi aberta no app logado.**

### Pendências

- Liberar o módulo "Médio prazo" para as pessoas de cada obra (Configurações › Usuários).
- Conferir logado, numa obra real: abrir os cronogramas importados, a linha de base do Project no Gantt e as equipes novas no Planejador de Equipe.
- Não há como excluir linha de base pela tela (gatilho do banco). Se for preciso, é uma migração que abra a exceção para o `delete_plan`.
- Fora do escopo aprovado: importar por cima de um cronograma que já existe e aceitar o .mpp direto.

## Médio prazo: Linha do Tempo, tabela e Gantt do tamanho da tela (08/11/2026)

**Pedido do usuário**, com print do cronograma importado da Atmos num notebook: "o quadrado em vermelho deve ser do tamanho de toda a tela. Está muito pequeno como está". O quadrado ia da Linha do Tempo à barra de status, com a tabela mostrando umas dez linhas.

### Causa

Desde 04/11 a área de trabalho inteira (título, comandos, Exibir, filtros, avisos, Linha do Tempo, visão e barra de status) cabia do lugar dela até o pé da janela, ou numa tela inteira quando a visão ficaria com menos de 360 px. Como as quatro faixas de cima entravam na conta, num notebook sobravam cerca de 360 px para a tabela e o Gantt.

### O que mudou (`schedule-sheet.tsx`)

- A **"mesa"** (Linha do Tempo, visão e barra de status) tem sozinha a altura de uma tela, descontada a barra fixa da trilha. As faixas de cima ficam acima dela: rolando a página até a Linha do Tempo, a mesa ocupa a tela toda, e a barra de status fica no pé.
- A mesa começa no elemento marcado com `data-workspace-stage` (a Linha do Tempo) ou na visão, quando a faixa está escondida. Saiu o `COMFORT_VIEW`; o `MIN_VIEW` continua para janela baixa demais.
- Vale também para o Gantt de legalização da aba 1, que usa o mesmo cronograma.
- Em troca, a barra de status deixa de aparecer sem rolar a página, inclusive em monitor grande: para ver a mesa inteira, rola-se até ela.

### Validação (08/11/2026)

- Página de prévia temporária com o cronograma importado da Atmos (372 tarefas) e as APIs respondidas pelo Playwright, rolada até a Linha do Tempo: em 1470×815 (o notebook do print), a mesa vai do topo da janela até 16 px do pé, com **24 linhas** visíveis na tabela (eram cerca de 10); em 1920×1080, **34 linhas**. Sem erro de console.
- Typecheck, ESLint (sem aviso novo), Prettier e `npm test` (1200 testes).
- **Não foi aberta no app logado.**


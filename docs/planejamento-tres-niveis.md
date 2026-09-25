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

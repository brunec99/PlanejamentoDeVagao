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

1. **Reprogramação automática (ASAP).** O guia exige datas, duração e predecessoras ligadas por um motor único (secao 7.1). Hoje as datas não se movem sozinhas: a rede aponta a incoerência e a reprogramação é manual — decisão anterior do próprio usuário, e não a desfiz sozinho. Ligar o motor muda datas na tela de quem planeja, e é a mudança de maior impacto do guia inteiro.
2. **Rascunho com gravação atômica e motivo obrigatório** (secao 12). Hoje cada célula grava ao sair dela, o que o usuário pediu explicitamente. O guia quer rascunho local, revisão antes de salvar e motivo por revisão. A concorrência otimista já existe, mas no nível do snapshot inteiro (`planning_meta.version`), não por tarefa, e o histórico é por comando, sem motivo.

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

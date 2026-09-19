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

## Pendências

- **Rede de atividades sem porta de entrada.** Os comandos `link_activities`/`unlink_activities`, a regra `dependencyConflicts` e a tabela `activity_dependencies` (migração 0010) existem, mas **nenhuma tela cria ou mostra** essas ligações. O plano do mês tem a sua própria rede, essa sim com tela. Decidir com o usuário: dar interface à rede das atividades do cronograma ou remover o caminho morto. Nada foi apagado por enquanto.
- O executado alimenta o sistema só pela tela do vagão (`record_progress`). Médio e curto prazo não lançam avanço físico, então a medição vive num lugar e o planejamento em outros dois.
- A ordem dos locais na Linha de Balanço sai de um interpretador de nomes do Prevision (`height`, em `line-of-balance.tsx`). Um campo próprio de cota/ordem no local seria mais firme.
- Não há curva por serviço nem desvio por frente em dias — a curva S é da obra inteira.

## Migrações

Nenhuma nesta etapa: as regras novas são cálculo sobre o que já está gravado. As últimas aplicadas são `0020_outline_and_supplier.sql` (item e subitem, fornecedor) e `0021_ifc_federations.sql`.

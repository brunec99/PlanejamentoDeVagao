# Dashboard da obra (aba 0) e Dashboard geral (04/11/2026)

Continuidade entre os modelos de IA que trabalham no repositório. Descreve o que a aba 0 entrega, as decisões do modelo aprovado, os arquivos, as regras de cálculo de cada quadro, a validação e as pendências. O que está marcado como pendência **não** está feito.

O documento tem duas partes. A primeira (até a seção "Pendências" logo abaixo) é a **aba 0**, o primeiro modelo aprovado em 04/11/2026. A segunda, "[Dashboard geral e escalas de tempo (04/11/2026)](#dashboard-geral-e-escalas-de-tempo-04112026)", é o segundo modelo aprovado no mesmo dia: a página que compara as obras e as escalas de tempo, que também mudaram a aba 0. O texto da primeira parte foi mantido como histórico; onde a segunda parte o mudou, o trecho ganhou a marca *Atualizado em 04/11/2026 pelas escalas de tempo:* e a explicação ao lado.

## O que o usuário pediu

Em 04/11/2026 o usuário pediu um **campo 0, "DASHBOARD"**, no topo das abas de cada obra: uma página que compile o curto prazo, o médio prazo, o longo prazo, a terminalidade e os vagões, com filtros e geração de PDF, mostrando **só os módulos liberados** para quem está olhando. Junto veio um segundo pedido: a planilha com o histórico do curto prazo ("Dados compilados", uma aba por obra) tem os dados do passado, e o dashboard precisa considerá-los; a planilha continua sendo preenchida pelas equipes depois da carga de 28/10/2026 (em 04/11, a Atmos estava na semana 64 e a Mozine na 119).

Seguindo o combinado de 30/10/2026 (modelo de UX antes do código), o modelo foi publicado com o visual real, dados de exemplo e as regras numeradas, e o usuário o aprovou em 04/11/2026. As 15 regras abaixo são o que foi aprovado e valem como especificação.

## Decisões (modelo aprovado em 04/11/2026)

1. **Aba "0 · Dashboard"** no topo da lista de abas de toda obra (chip 0), rota `/obras/{obra}/dashboard`. Abrir uma obra na lista de obras passa a cair nela, e não mais no curto prazo.
2. **Quadros só dos módulos que a pessoa pode abrir e que têm dado nesta obra.** Abertos a todos: curto prazo e terminalidade; os demais, os liberados pelo admin para a pessoa (admin e desenvolvedor veem todos). Módulo sem dado não ocupa espaço; a linha abaixo dos filtros diz "Módulos sem dados nesta obra: …".
3. **"Semana analisada" é a data de referência de tudo.** Padrão: a semana atual. Cada quadro conta só até o **sábado** dela, nada depois (pendência resolvida depois conta como aberta; medição posterior não entra), como o painel do PDF do fechamento, para o PDF de uma semana antiga sair igual depois.
   *Atualizado em 04/11/2026 pelas escalas de tempo:* a data de referência passou a ser o sábado da **última semana do período** escolhido (escala + período, regras 4 a 9 da segunda parte). Na escala semanal, que continua sendo a padrão da aba 0, é exatamente o que está acima.
4. **Filtros:** Semana analisada (seletor), Empreiteiro (seletor múltiplo), Pavimento (seletor múltiplo) e Quadros (quais módulos entram na tela e no PDF). *Atualizado em 04/11/2026 pelas escalas de tempo:* o seletor "Semana analisada" foi substituído por **Escala** (Semanal, Mensal, Trimestral, Anual, Personalizado) e **Período** (lista com setas ‹ ›; no personalizado, "de", "até" e "Agrupar por"); o link antigo com `semana=` continua abrindo na escala semanal. Empreiteiro, Pavimento e Quadros não mudaram. Empreiteiro vale no curto prazo (coluna Empresa), na terminalidade (Responsável terceiro), no médio prazo (empresa da equipe) e nos vagões (empresa das equipes das atividades). Pavimento vale na terminalidade e no longo prazo, pareado pelo nome sem acento; no longo prazo a medição é por serviço, então o medido não se divide por pavimento. O ranking das obras e o avanço físico nunca seguem o recorte, e o quadro diz isso.
5. **Curto prazo:** série das 12 semanas até a analisada, média simples das apuradas (alerta âmbar abaixo de 70%), PPC geral e ranking das obras (os mesmos números do PDF do fechamento), causas da semana e Pareto da obra; e o quadro **"Histórico desde a semana 1"**: PPC de cada mês desde a primeira semana da obra, PPC geral por ano, melhor e pior mês. *Atualizado em 04/11/2026 pelas escalas de tempo:* fora da escala semanal, o quadro mostra o PPC do período (soma das semanas apuradas), a série por mês, trimestre ou ano (regra 8) e as causas do período. O passado vem das planilhas já importadas (Blentt em 08/10/2026; Atmos, Tauá, Brizz, Essenza e Mozine em 28/10/2026, da planilha "Dados compilados") e entra sozinho.
6. **Longo prazo:** avanço físico medido (última medição até a data) contra o planejado na data (dias-pavimento do plano, linear em cada pavimento, pela linha de base mais recente; sem ela, pelo plano vivo), desvio em p.p.; curva S (planejado contínuo, medições como pontos); os 5 serviços com maior desvio; prazo planejado contra a linha de base. Sem medição: só o planejado e o aviso.
7. **Vagões:** vagões por status (não iniciado, em produção, com restrição, terminal), takt vencido, dívidas abertas, progresso dos vagões em produção (os 3 de maior progresso) e o quadro de restrições por coluna, com as vencidas destacadas.
8. **Médio prazo:** o plano vivo do mês da semana analisada (sem ele, o mais recente; *Atualizado em 04/11/2026 pelas escalas de tempo:* no código, o mês é o do **sábado** da semana de referência, e o substituto é o plano vivo mais recente até aquele mês, ou o mais recente de todos): tarefas concluídas, em andamento e não iniciadas; atrasadas na data (término previsto antes dela e < 100%); variação contra a linha de base congelada mais recente, em dias úteis; caminho crítico; equipes superalocadas na semana; marcos dos próximos 30 dias.
9. **Terminalidade:** abertas, resolvidas e % até a data, tempo médio em aberto, abertas por responsável terceiro e por pavimento (os 6 maiores), por tipo em rosca, evolução das 12 semanas (abertas × resolvidas por semana e saldo). *Atualizado em 04/11/2026 pelas escalas de tempo:* fora da escala semanal, abertas e resolvidas no período, em aberto no sábado final contra a véspera, tempo médio das resolvidas no período e a evolução por balde.
10. **Resumo no topo:** uma frase (com os números arredondados, nunca contradizendo os cartões) e até 6 cartões (PPC da semana, avanço físico, takt vencido, tarefas atrasadas, pendências abertas, restrições vencidas), cada um dizendo de que aba vem; estado sempre com cor **e** texto. *Atualizado em 04/11/2026 pelas escalas de tempo:* fora da escala semanal, o cartão do PPC vira "PPC do mês" (do trimestre, do ano, do período) e cada cartão diz se é "no período" ou "em 31/10" (regra 9).
11. **PDF:** o botão "Gerar PDF" abre a página de impressão numa aba nova com os filtros na URL (`/imprimir/dashboard/{obra}?semana=&empreiteiro=&pavimento=&quadros=`; *Atualizado em 04/11/2026 pelas escalas de tempo:* fora da escala semanal, `escala=` com `periodo=` ou `de=`/`ate=`/`agrupar=` no lugar de `semana=`, e o cabeçalho mostra a escala e o período, regra 14) e chama o "Salvar como PDF" do navegador, como os PDFs de hoje. A4 paisagem, cabeçalho igual ao do fechamento (logos ATR e Takt, "DASHBOARD DA OBRA <NOME>", semana analisada e atual). Folha 1: resumo e curto prazo; depois uma folha por módulo presente: longo prazo e vagões juntos; médio prazo; terminalidade. Rodapé com a data de referência, os filtros ativos, quem gerou e quando, "Folha N de M".
12. **Dados:** o dashboard lê o planejamento que a obra já carrega (vagões, plano do mês, compromissos, restrições) e as rotas que já existem (`GET /api/long-term-plan`, `GET /api/terminalidade`, `GET /api/curto-prazo/ranking`). Cada quadro aparece quando o dado dele chega; uma falha deixa só aquele quadro como "indisponível". **Nenhuma migração, nenhuma tabela nova.**
13. **Acesso:** aberta a todo papel com a obra liberada, inclusive Consulta; nada se edita; "Abrir aba N →" leva à aba de origem. Está no catálogo de módulos como aberta a todos.
14. **Celular:** a mesma página com os quadros em uma coluna e a aba 0 na faixa sob o cabeçalho; o PDF sai pelo computador.
15. **Planilha "Dados compilados":** continua sendo preenchida depois da carga de 28/10; o dashboard mostra o que está no sistema. Recomendação registrada: nova rodada do importador (idempotente) e decisão de onde cada obra preenche. **Isso é pendência, não está feito** (ver Pendências).

## Arquitetura

Tudo em `src/modules/dashboard/`, sem migração e sem tabela nova. Os cálculos ficam em arquivos puros (sem React), um por quadro, testados isoladamente; a tela e o PDF só montam o que eles devolvem.

| Peça | Arquivo |
| --- | --- |
| Contrato comum (módulos, filtros, data de referência, cartões, estado de carga, URL da impressão, rótulos) | `src/modules/dashboard/model.ts` |
| Estilos da tela e do papel (A4 paisagem, 7 mm de margem, folha de 732 px) | `src/modules/dashboard/styles.ts` |
| Gráficos em SVG (série, curva S, barras, rosca) | `src/modules/dashboard/charts.tsx` |
| Quadros, cálculo puro | `src/modules/dashboard/short-term-panel.ts`, `long-term-panel.ts`, `wagons-panel.ts`, `medium-term-panel.ts`, `terminality-panel.ts` |
| Quadros, componentes | `src/modules/dashboard/panels/*.tsx` |
| Carga dos dados (planejamento já carregado + rotas existentes), um estado por quadro | `src/modules/dashboard/use-dashboard-data.ts` |
| Frase de resumo e cartões | `src/modules/dashboard/summary.ts` |
| Tela da aba 0 | `src/modules/dashboard/dashboard-overview.tsx` |
| Página de impressão (folhas) | `src/modules/dashboard/dashboard-print.tsx` |
| Rota da aba | `src/app/(app)/obras/[obraId]/dashboard/page.tsx` |
| Rota da impressão | `src/app/imprimir/dashboard/[obraId]/page.tsx` |
| Tour "Como usar esta tela" (15 passos próprios + os 2 comuns) | `src/modules/tour/pages/dashboard.ts`, registrado em `tours.ts` (`TourKey` `dashboard`, `resolveTourKey` para `/obras/x/dashboard`) |
| Manual da assistente de IA (6 seções, `screen: 'dashboard'`) | `src/modules/agente/manual/dashboard.ts`, registrado em `manual/index.ts` (`SCREEN_LABEL` e `MANUAL_SECTIONS`) |
| Testes | `tests/dashboard-*.test.ts`, um por quadro |

*Atualizado em 04/11/2026 pelas escalas de tempo:* entraram `period.ts`, `period-views.ts`, `period-picker.tsx` e a pasta `portfolio/` (tabela da segunda parte); o tour da aba 0 passou a ter 16 passos próprios (`dash-semana` virou `dash-escala` e `dash-periodo`); a rota da aba lê o período da URL.

**O que mudou fora do módulo:**

- `src/modules/layout/work-nav.tsx`: `WORK_TABS` ganhou `number` explícito (o dashboard é 0; as outras abas continuam 1 a 5), em vez de numerar pela posição.
- `src/modules/layout/tab-header.tsx`: usa `tab.number`, para o cabeçalho mostrar o 0.
- `src/application/module-access.ts`: `MODULES` ganhou `dashboard` como módulo **aberto a todos** (não entra em `RESTRICTED_SECTIONS`).
- `src/modules/obras/works-overview.tsx` e `top-bar.tsx`: abrir a obra cai no dashboard.
- `src/modules/tour/tours.ts` e `src/modules/agente/manual/index.ts`: registro do tour e do manual.

**Modelo de dados do módulo (`model.ts`):** `DashboardModule` (`longo-prazo`, `vagoes`, `medio-prazo`, `curto-prazo`, `terminalidade`, com o número da aba de origem), `DashboardFilters` (`week` = segunda-feira da semana analisada; `companies`, `floors` e `modules` como conjuntos, ausente = sem recorte), `DashboardReference` (`week`, `weekEnd` = sábado, `weekNumber`, `currentWeek`, `today`, `firstWeek`), `KpiCard`/`PanelSummary` (o cartão e os trechos da frase que cada quadro entrega) e `PanelState` (`loading`, `error`, `absent`, `ready`). Empreiteiro e pavimento são comparados por `textKey` (sem acento nem caixa), porque o nome é digitado à mão no curto prazo e na terminalidade. Os filtros viajam na URL da impressão por `dashboardSearchParams`/`parseDashboardParams` (`semana`, `empreiteiro` repetido, `pavimento` repetido, `quadros` separados por vírgula; semana inválida vira a atual, lista vazia de quadros vale "todos").

*Atualizado em 04/11/2026 pelas escalas de tempo:* `DashboardFilters` ganhou `selection` (`PeriodSelection`, a escala e o período escolhidos) e `DashboardReference` ganhou `period` (`DashboardPeriod`); `week`/`weekEnd` passaram a ser a última semana do período e o sábado dela. `referenceOf(week, today, firstWeek, period?)`: sem `period`, o período é a semana `week` (o comportamento antigo, usado pelos testes dos quadros). `periodName` dá "semana 64" na escala semanal e o rótulo do período nas demais; `isWeekly` diz se a escala é a semanal. Na URL, fora da escala semanal, `escala`, `periodo`, `de`, `ate` e `agrupar` substituem `semana`.

## Regras de cálculo por quadro

### Comum a todos: data de referência e filtros

- **Data de referência** = o sábado da semana analisada (`weekEnd`). Todo quadro ignora o que tem data depois dela. *Atualizado em 04/11/2026 pelas escalas de tempo:* = o sábado da última semana do período (`period.end`). É a mesma regra do painel da primeira página do PDF do fechamento (30/10/2026), e o motivo é o mesmo: o PDF de uma semana antiga precisa sair igual quando for gerado de novo.
- **Semana 1** = a definida em Configurações da obra; sem ela, a primeira semana com linha no curto prazo. O número da semana segue a planilha.
- **Empreiteiro:** sem recorte, tudo passa; com recorte, linha, pendência, tarefa ou vagão **sem** empresa fica fora. A comparação é pelo nome normalizado.
- **Pavimento:** pareado pelo nome normalizado entre a terminalidade (cadastro de pavimentos) e o longo prazo (pavimentos do plano).
- **Presença de módulo:** `absent` quando a pessoa não pode abrir o módulo ou a obra não tem dado dele; esse quadro não aparece e o módulo é citado só na linha "Módulos sem dados nesta obra". `error` deixa só aquele quadro como "indisponível".

### Curto prazo (aba 4)

Lê as linhas da planilha (`weekly_commitments`) da obra com semana ≤ semana analisada, mais a resposta de `GET /api/curto-prazo/ranking?semana=&obra=`.

- **PPC da semana:** linhas com Sim ÷ total de linhas da semana analisada; linha sem Status conta como não cumprida, e a semana é marcada "em aberto".
- **Série:** as 12 semanas com linha até a analisada; semana em aberto sai hachurada e fora da média; a analisada ganha a faixa âmbar.
- **Média:** média simples dos PPCs das semanas **apuradas** (todas as linhas com Status) da série; âmbar abaixo de 70% (`AVERAGE_ALERT`, o mesmo da tela Fechamento).
- **PPC geral:** cumpridos ÷ assumidos de todas as semanas apuradas até a analisada, somando linhas (não a média dos percentuais).
- **Ranking:** o de `src/domain/closing-ranking.ts`, com a linha da própria obra trocada pelo cálculo local (`withLocalWork`), para quadro e ranking nunca divergirem; obra com menos de 4 semanas apuradas fica "em início", sem posição; **sempre a obra inteira**, mesmo com empreiteiro filtrado.
- **Causas da semana** e **Pareto da obra:** `causePareto` de `src/domain/rules.ts` sobre as linhas com Não até a semana; as causas que somam 80% em vermelho; as demais em "Outras N causas".
- **Histórico desde a semana 1:** por mês (a semana pertence ao mês da sua segunda-feira), cumpridos ÷ assumidos das semanas apuradas do mês; mês sem semana apurada fica sem valor. PPC geral por ano com a mesma soma. Melhor e pior mês entre os meses com valor.
- **Filtro de empreiteiro:** recorta PPC, série, média, PPC geral, causas, Pareto e histórico pela coluna Empresa; o ranking não.

### Longo prazo (aba 1)

Lê o plano de `GET /api/long-term-plan` (serviços, pavimentos, datas por pavimento, linhas de base e medições).

- **Planejado na data:** cada serviço × pavimento é um trecho com início e término; o avanço planejado em cada trecho é linear entre os dois, e o total é ponderado pelos dias-pavimento do plano. A fonte das datas é a **linha de base mais recente**; sem linha de base, o plano vivo, e o quadro avisa.
- **Medido:** a última medição com data ≤ sábado; medição posterior não entra. Sem nenhuma medição: só o planejado e o aviso.
- **Desvio:** medido − planejado, em pontos percentuais.
- **Curva S:** planejado como linha contínua até a data; cada medição como um ponto.
- **5 serviços com maior desvio:** por serviço, medido − planejado na data, os 5 mais negativos.
- **Prazo planejado:** último término do plano vivo contra o da linha de base, em dias.
- **Filtros:** pavimento recorta o planejado (só os trechos dos pavimentos escolhidos); o medido é por serviço e não se divide, e o quadro diz isso. Empreiteiro não se aplica.

### Vagões (aba 2)

Lê os vagões, atividades, restrições e dívidas do planejamento já carregado.

- **Status** pelo `wagonStatus` de `src/domain/rules.ts`, avaliado na data: não iniciado, em produção, com restrição, terminal.
- **Takt vencido:** período encerrado até o sábado sem o vagão ser terminal.
- **Dívidas abertas:** dívidas de terminalidade não resolvidas na data.
- **Progresso:** os 3 vagões em produção com maior percentual.
- **Restrições por coluna:** Identificada, Em tratativa, Resolvida; **vencidas** = limite de resolução (início previsto da atividade − lead time, ou o prazo digitado) antes do sábado e ainda não resolvidas.
- **Filtro de empreiteiro:** pela empresa das equipes das atividades do vagão.

### Médio prazo (aba 3)

Lê os planos do mês do planejamento já carregado.

- **Plano:** o plano vivo cujo mês contém a semana analisada; sem ele, o mais recente, e o quadro diz qual. (*Atualizado em 04/11/2026 pelas escalas de tempo:* o código escolhe pelo mês do sábado de referência, `ref.weekEnd`, e o substituto é o plano vivo mais recente até aquele mês, ou o mais recente de todos.)
- **Tarefas:** concluídas (100%), em andamento (> 0% e < 100%) e não iniciadas, só nas folhas (resumos não contam duas vezes).
- **Atrasadas na data:** término previsto < sábado e % < 100.
- **Variação:** término do plano vivo − término da linha de base congelada mais recente, em dias úteis, pareando por `sourceTaskId`; sem linha de base, não aparece.
- **Caminho crítico:** tarefas sem folga total pelo motor de `src/domain/plan-schedule.ts`.
- **Equipes superalocadas:** carga da semana analisada acima da capacidade cadastrada.
- **Marcos:** tarefas de 0 dias com data entre o sábado e 30 dias depois.
- **Filtro de empreiteiro:** pela empresa da equipe (recurso) da tarefa.

### Terminalidade (aba 5)

Lê `GET /api/terminalidade` da obra.

- **Entra** a pendência com data de observação ≤ sábado. **Conta como resolvida** só se a data da correção ≤ sábado; resolvida depois conta como aberta.
- **Abertas, resolvidas, %:** abertas + resolvidas = total; % = resolvidas ÷ total.
- **Tempo médio em aberto:** abertas, dias da observação ao sábado; resolvidas, dias da observação à correção.
- **Por responsável terceiro e por pavimento:** as 6 maiores contagens de abertas.
- **Por tipo:** rosca das abertas, até 6 fatias e "Outros", como a aba 5 (`donutSlices`).
- **Evolução das 12 semanas:** por semana até a analisada, abertas (observação na semana), resolvidas (correção na semana) e saldo de abertas ao fim da semana. (*Atualizado em 04/11/2026 pelas escalas de tempo:* fora da escala semanal, por mês, trimestre ou ano; ver "Regras de cálculo no período" na segunda parte.)
- **Filtros:** empreiteiro pelo Responsável terceiro; pavimento pelo Local.

### Resumo e cartões

- Cada quadro `ready` devolve um `PanelSummary`: o `KpiCard` (módulo, rótulo, valor, etiqueta com `Tone` e texto, dica) e os trechos da frase.
- A frase é montada a partir dos valores **já arredondados** dos cartões, para nunca contradizer um cartão.
- O cartão do PPC é o `main` quando o curto prazo está presente. Módulo ausente, com erro ou desmarcado em "Quadros" não deixa cartão vazio: a grade se ajusta a 4, 5 ou 6 cartões.

## Tour e manual da assistente

- **Tour** (`src/modules/tour/pages/dashboard.ts`): 15 passos, na ordem da tela (introdução sem alvo, cabeçalho, "Como funciona", filtros, semana, empreiteiro, pavimento, quadros, linha de escopo, frase, cartões, primeiro quadro, primeiro "Abrir aba", "Gerar PDF", nota final), mais os 2 comuns acrescentados por `tours.ts` (agente e "Sempre que precisar"). Alvos `data-tour`: `tab-header`, `tab-ajuda`, `dash-filtros`, `dash-semana`, `dash-empreiteiro`, `dash-pavimento`, `dash-quadros`, `dash-escopo`, `dash-resumo`, `dash-cartoes`, `dash-quadro`, `dash-abrir-aba`, `dash-pdf`, `dash-rodape`. *Atualizado em 04/11/2026 pelas escalas de tempo:* 16 passos próprios: o passo `dash-semana` saiu e entraram `dash-escala` (os botões de escala) e `dash-periodo` (a lista com setas, ou "de"/"até" e "Agrupar por"); os textos que falavam da "semana analisada" passaram a falar do período. `tests/tour-targets.test.ts` confere que cada alvo existe em alguma marcação do código e que a rota tem tour.
- **Manual** (`src/modules/agente/manual/dashboard.ts`), 6 seções com `screen: 'dashboard'`: `dashboard-visao-geral` (o que é, quem vê, a frase e os cartões), `dashboard-filtros-semana-analisada` (*Atualizado em 04/11/2026 pelas escalas de tempo:* título "Filtros: escala e período, empreiteiro, pavimento e quadros"; o id ficou o mesmo, para não quebrar referências), `dashboard-quadro-curto-prazo`, `dashboard-quadros-longo-vagoes-medio-terminalidade`, `dashboard-pdf` e `dashboard-duvidas-comuns` (módulo que não aparece, número diferente da aba, dados antigos da planilha, "indisponível", semana em aberto, só o planejado, nada se edita, celular). O texto é para quem usa a tela: sem caminhos de código nem rotas.

## Validação (preenchido pelo coordenador ao fim da implementação)

Rodada de 04/11/2026, ao fim da implementação, com outra sessão construindo o módulo LOB do longo prazo (`src/modules/longo-prazo/lob/*`, `/api/lob`, migração 0038) no mesmo repositório ao mesmo tempo:

- **Testes:** `tests/dashboard-long-term.test.ts` (11), `dashboard-wagons` (14), `dashboard-medium-term` (10), `dashboard-short-term` (10) e `dashboard-terminality` (14) passam, 59 ao todo; `tests/tour-targets.test.ts` e `tests/agent-manual.test.ts` passam com a aba 0 registrada. `npm test`: 832 de 833; a única falha é `delete_work apaga a obra…` ("a semente não cobre lob_locals"), causada pela tabela nova da migração 0038 do LOB, que ainda não entrou na função `delete_work`, e não pelo dashboard.
- **`npx tsc --noEmit`:** sem erro nos arquivos do dashboard; os três erros restantes são importações de `@/modules/longo-prazo/lob/*` em `longo-prazo/page.tsx`, do trabalho paralelo.
- **`npm run lint`:** 0 erros (30 avisos, todos anteriores, do tipo `set-state-in-effect` em telas antigas). **Prettier:** conforme em todos os arquivos do dashboard e nos compartilhados alterados; os 8 arquivos fora do padrão são do LOB.
- **`npm run validate:migrations`:** OK (nenhuma migração nova do dashboard).
- **`npm run build`:** falha só nos três módulos ausentes do LOB; as páginas `obras/[obraId]/dashboard` e `imprimir/dashboard/[obraId]` compilam no typecheck.
- **Renderização fora do navegador:** os cinco quadros, nas variantes de tela e de papel, mais os cartões e a frase do resumo, foram renderizados com `react-dom/server` a partir dos construtores puros, com o mock do planejamento (longo prazo, vagões, terminalidade) e com a fixture do agente (curto prazo com ranking, médio prazo com plano e linha de base), inclusive com recorte de empreiteiro e de pavimento sem resultado. Nenhum erro de execução; a frase e os cartões saíram coerentes ("A semana 9 ainda está em aberto…", "No plano de outubro, 2 tarefas terminariam até a data e não terminaram.").
- **Não validado:** a tela logada em produção (o login exige Google), o PDF gerado pelo botão num navegador real, o celular, e os tempos de carga com o volume das obras reais. Estão nas pendências abaixo.

## Pendências

- **Reimportação da planilha "Dados compilados" (regra 15, não feito).** A planilha segue sendo preenchida depois da carga de 28/10/2026 (04/11: Atmos na semana 64, Mozine na 119), e as semanas de 26/10 e 02/11 entraram sem apontamento. O importador (`scripts/import-curto-prazo.ts`) é idempotente para linhas iguais, mas **campo editado na tela nunca é sobrescrito** e a Blentt não pode ser reimportada enquanto a equipe lançar nos dois lugares (duplicaria). Decisão pendente com o usuário: em que lugar cada obra passa a preencher, e quando rodar a nova rodada. Até lá, o dashboard mostra semanas recentes hachuradas ou sem linha nessas obras, e o manual explica o motivo.
- **Validação logada em produção:** abrir a aba 0 das obras reais (Blentt com ~6 mil linhas; Mozine com ~7,9 mil e terminalidade importada), conferir o tempo de carga de cada quadro e comparar os números com as abas de origem na mesma semana (o curto prazo deve bater com o painel do PDF do fechamento; a tela Fechamento conta também as semanas posteriores e o dashboard não).
- **PDF no navegador real:** gerar pelo botão, em Chromium e Safari, conferir que cada seção ocupa uma folha sem corte (a folha tem altura fixa de 732 px), que o "Salvar como PDF" é chamado depois de os quadros chegarem e que o rodapé mostra os filtros, quem gerou e "Folha N de M". Testar também uma obra em que só o curto prazo e a terminalidade têm dado (PDF de duas folhas) e uma obra sem nenhum módulo com dado.
- **Pareamento de pavimento por nome (regra 4):** a terminalidade cadastra nomes ("2° pavto", "Térreo") e o Planejador do longo prazo numera os pavimentos; se o plano não tiver nome por pavimento igual ao da terminalidade, o filtro recorta a terminalidade e deixa o planejado do longo prazo inteiro. Conferir numa obra real e, se não parear, decidir com o usuário (nomear os pavimentos do plano ou parear por número).
- **Acesso ao longo prazo:** `GET /api/long-term-plan` é rota restrita (`RESTRICTED_API_PREFIXES`); o dashboard só deve chamá-la quando a pessoa tem o módulo, senão o quadro apareceria como "indisponível" (erro 403) em vez de ausente. Conferir com um perfil sem o módulo.
- **Semanas anteriores à semana 1:** a Essenza tem 171 linhas importadas antes da semana 1 gravada (semanas −1 a 15 da planilha, pela data). Decidir se "Histórico desde a semana 1" começa na primeira semana com linha (como escrito) ou na semana 1 configurada; hoje o manual diz "primeira semana da obra".
- **"Causa não informada" no Pareto:** 276 linhas importadas receberam essa causa; em obras com muito histórico ela pode aparecer entre as que somam 80%. O manual avisa; decidir com o usuário se o Pareto do dashboard a exclui ou a mantém.
- **Celular:** a aba 0 e os filtros no telefone não foram testados num aparelho real; o PDF é só pelo computador (regra 14).
- **Custo do ranking:** a rota lê as linhas de todas as obras até a semana a cada abertura do dashboard; se ficar lenta com o volume real, a saída já anotada em 30/10 é uma função SQL agregada por obra e semana (exigiria migração).
- **Sem commit e não publicado** até o coordenador fechar a bateria do CI e registrar a validação acima. (*Atualizado em 04/11/2026 pelas escalas de tempo:* a aba 0 entrou no commit 982a192. As escalas de tempo e o Dashboard geral, da segunda parte, ainda não têm commit.)

---

# Dashboard geral e escalas de tempo (04/11/2026)

Segunda parte do documento. Descreve o pedido, as 16 regras do modelo aprovado (a especificação), a arquitetura, as regras de cálculo no período, a URL, o tour e o manual. **Estado em 04/11/2026:** implementação em curso por vários agentes ao mesmo tempo, sem commit; o que foi conferido de fato fica na subseção "Validação", preenchida pelo coordenador. **Nenhuma migração e nenhuma tabela nova** (regra 15).

## O pedido

Em 04/11/2026, com a aba 0 pronta, o usuário pediu um **dashboard geral, fora das obras**, no menu inicial, com os quadros do dashboard para todas as obras lado a lado, e **escalas de tempo** (semanal, mensal, trimestral, anual ou um intervalo escolhido) que valessem tanto nessa página quanto na aba 0 de cada obra.

Seguindo o combinado de 30/10/2026 (modelo de UX antes do código), o modelo "Dashboard geral e escalas de tempo" foi publicado com o formato real, dados de exemplo (seis obras fictícias: Horizonte, Mirante, Jardins, Aurora, Vista Mar e Parque, com empreiteiros inventados), o seletor de escala funcionando sobre os dados semana a semana, a aba 0 com o mesmo seletor, a folha 1 do PDF e as regras numeradas. O usuário o aprovou em 04/11/2026. As 16 regras abaixo valem como especificação; cada uma traz a recomendação aprovada, e a alternativa recusada fica registrada entre parênteses.

## Regras aprovadas (especificação)

### Onde fica e quem vê

1. **Item "Dashboard geral" no menu, fora das obras.** Novo item em Empreendimentos, logo abaixo de Obras (dica "Todas as obras · Comparativos"), com rota própria `/dashboard`, mais um botão **"Comparar obras"** no topo da lista de obras. A lista de obras continua sendo a página inicial. (Alternativas recusadas: só o botão; abrir o sistema direto no Dashboard geral.)
2. **Só as obras liberadas para a pessoa.** Cada pessoa vê as mesmas obras da lista de obras. O item aparece para quem tem **duas ou mais obras** (com uma só não há o que comparar) e **sempre para admin e desenvolvedor**. Quadros e colunas seguem os módulos liberados, como na aba 0: curto prazo e terminalidade para todos, os demais para quem o admin liberou. Consulta também vê. Nada se edita. (Recusada: o PPC de todas as obras para todos, como o ranking do PDF do fechamento.)
3. **Filtros: escala, período, obras e quadros.** "Obras" é um seletor múltiplo (padrão: todas). Empreiteiro e pavimento ficam só na aba 0, porque os nomes mudam de obra para obra; a comparação por empresa fica no quadro "Empreiteiros em mais de uma obra". (Recusada no modelo: filtro de empreiteiro também no geral, pareando pelo nome sem acento.) *Atualizado em 05/11/2026 a pedido do usuário:* o geral ganhou o filtro de empreiteiro; ver "Filtro de empreiteiro no Dashboard geral (05/11/2026)", abaixo.

### Escalas de tempo (valem nas duas telas)

4. **Semanal, Mensal, Trimestral, Anual e Personalizado.** Um seletor de escala e, ao lado, o período: lista com os períodos, setas ‹ › para andar um período e, no Personalizado, "de" e "até". Escala e período vão para a URL, então o link e o PDF reproduzem a mesma visão. Na aba 0 o seletor **substitui "Semana analisada"**, e os links antigos com `semana=` continuam abrindo na escala semanal. (Recusada: aba 0 só semanal, escala só no geral.)
5. **O período é sempre feito de semanas inteiras.** A semana pertence ao período da **sua segunda-feira**, a mesma regra do "Histórico desde a semana 1": outubro de 2026 vai da semana de 05/10 à de 26/10 (a de 28/09 começa em setembro e fica em setembro) e tudo conta até o sábado 31/10. Trimestres e ano são os do calendário. No Personalizado, "de" recua para a segunda e "até" avança para o sábado. A regra 3 da aba 0 continua: nada depois do sábado final entra. (Recusada: datas exatas do calendário, que cortariam semanas da planilha ao meio e fariam o PPC deixar de bater com a aba 4.)
6. **Período em andamento e período inicial.** O período atual aparece como "parcial, N de M semanas apuradas", e a semana em aberto fica fora do PPC, hachurada, como hoje. O Dashboard geral abre em **Mensal**, no mês mais recente com alguma semana apurada (em 04/11/2026, outubro). A aba 0 abre como antes, em Semanal na semana atual. Vindo do Dashboard geral, a aba 0 abre na mesma escala e no mesmo período. (Recusadas: abrir o geral no mês atual mesmo sem semana apurada; abrir o geral em Semanal.)
7. **PPC do período é soma, não média.** Cumpridos ÷ assumidos de todas as semanas apuradas do período, o mesmo cálculo do PPC geral. O consolidado das obras também soma as linhas, então a obra com mais compromissos pesa mais. A seta compara com o período anterior da mesma escala; no Personalizado, com o intervalo de mesmo tamanho imediatamente antes. (Recusadas: média simples dos PPCs semanais; consolidado como média das obras.)
8. **Séries e agrupamento.** As séries mostram 12 semanas no Semanal, 12 meses no Mensal, 8 trimestres no Trimestral e todos os anos no Anual. O Personalizado agrupa sozinho: até 16 semanas, por semana; até 24 meses, por mês; acima disso, por trimestre; "Agrupar por" deixa trocar. Vale para a série do curto prazo, a evolução da terminalidade e a curva S da aba 0. A linha da média da série continua sendo a média simples dos períodos mostrados. (Recusada: 12 colunas fixas em toda escala.)
9. **Fluxo dentro do período, retrato no sábado final.** Somado no período: compromissos e PPC, causas, pendências abertas e resolvidas, e o avanço físico do período (medido no fim menos medido no início, contra o planejado no mesmo intervalo). Retrato no sábado final: avanço acumulado medido × planejado, status dos vagões, takt vencido, restrições vencidas, tarefas do plano do mês desse sábado, pendências em aberto e tempo médio. Cada cartão e cada coluna diz qual dos dois é ("no período" ou "em 31/10"). (Recusada: tudo como retrato.)

### O que a tela mostra

10. **Comparativo das obras: uma linha por obra.** Uma coluna por indicador, com cor e texto em cada célula, e a última linha com o consolidado. Clicar no título ordena; clicar na obra abre a aba 0 dela no mesmo período. Obra sem dado do módulo mostra "—", com o motivo ao passar o mouse. O estado da obra é o pior entre os indicadores, como no cartão da lista de obras. Obra que só começou depois do período sai da tabela e é citada na linha de escopo. (Recusada: um cartão por obra.)
11. **Curto prazo comparado.** Barras do PPC do período por obra, com a linha dos 70% e a do consolidado; mapa de calor obra × período; Pareto das causas somando as obras, com a obra que mais contribui com cada causa; e "Empreiteiros em mais de uma obra", com o PPC de cada empresa em cada obra. Obra com menos de 4 semanas apuradas fica "em início", sem posição (a regra do ranking). Faixas de cor do PPC: 80% ou mais em verde, abaixo de 70% em âmbar, abaixo de 60% em vermelho. (Recusada: linhas sobrepostas no lugar do mapa de calor.)
12. **Longo prazo, vagões, médio prazo e terminalidade comparados.** Longo prazo: medido × planejado por obra, desvio em p.p., avanço no período e prazo contra a linha de base (faixas da aba 0: atrás do planejado em âmbar, mais de 10 p.p. em vermelho). Vagões: barra de status, takt vencido e restrições vencidas. Médio prazo: tarefas por situação, atrasadas, variação contra a linha de base e equipes superalocadas. Terminalidade: abertas × resolvidas no período, em aberto no fim, % resolvidas e tempo médio; e os responsáveis terceiros com mais pendências somando as obras. Cada quadro lista embaixo as obras sem dado dele. (Recusada: só a tabela.)
13. **Frase e seis cartões no topo.** Uma frase com os números já arredondados dos cartões (nunca os contradiz) e até seis cartões consolidados: PPC das obras, obras abaixo de 70%, obras atrás no físico, takt vencido, restrições vencidas e pendências em aberto. Cada cartão diz de que aba vem e quantas obras entram na conta. (Recusada: sem frase.)

### PDF, dados e celular

14. **PDF de quatro folhas, no padrão do fechamento.** A4 paisagem, cabeçalho "DASHBOARD GERAL DAS OBRAS" com escala e período. Folha 1: resumo, cartões, comparativo e PPC por obra; folha 2: curto prazo (mapa de calor, causas, empreiteiros); folha 3: longo prazo e vagões; folha 4: médio prazo e terminalidade. Saem só as folhas dos quadros presentes. Rodapé com período, obras, quem gerou e quando, e "Folha N de M". O PDF da aba 0 passa a mostrar a escala e o período no cabeçalho. (Recusada: uma folha só.)
15. **Dados: uma leitura única para longo prazo e terminalidade.** Curto prazo, vagões e médio prazo vêm do planejamento que já carrega todas as obras da pessoa. Longo prazo e terminalidade ganham uma rota de leitura que devolve as obras de uma vez, **sem as fotos**. Nenhuma tabela nova e nenhuma migração. Cada quadro aparece quando o dado dele chega; uma falha deixa só aquele quadro indisponível. (Recusada: as rotas atuais, uma chamada por obra.)
16. **Celular.** Mesmos quadros, em uma coluna; a tabela comparativa rola de lado com a coluna da obra fixa; o seletor de escala quebra em duas linhas. O PDF sai pelo computador. (Recusada: no celular, só cartões e tabela.)

### O que muda em cada quadro da aba 0 com a escala (do modelo)

| Quadro | Conta | Com a escala |
| --- | --- | --- |
| Curto prazo | PPC do período | soma das semanas apuradas; série de 12 semanas, 12 meses, 8 trimestres ou todos os anos; causas do período (com a posição no Pareto da obra) |
| Longo prazo | em 31/10 | medido × planejado no sábado final; curva S por mês, trimestre ou ano; avanço no período |
| Vagões | em 31/10 | status, takt vencido, dívidas e restrições no sábado final |
| Médio prazo | em 31/10 | plano do mês do sábado final; atrasadas no sábado final |
| Terminalidade | no período | abertas e resolvidas no período; em aberto no sábado final; evolução por mês, trimestre ou ano |

Na escala semanal a aba 0 mostra o que mostrava antes; os números de fluxo (`period-views.ts`) só aparecem fora dela.

## Próximas etapas (fora desta entrega, registradas no modelo)

- Meta de PPC por obra (hoje a referência é a mesma para todas: 70% e 80%).
- Exportar o comparativo para planilha.
- Comparar uma obra com a média das outras dentro da aba 0.

## Arquitetura

Tudo em `src/modules/dashboard/`, reaproveitando os quadros da aba 0. O cálculo do período é puro e testado; a tela e o PDF só montam o que ele devolve.

| Peça | Arquivo |
| --- | --- |
| Escalas e períodos, puro (regras 4 a 8): `DashboardScale`, `PeriodBucket`, `DashboardPeriod`, `PeriodSelection`, `PeriodContext`; `resolvePeriod`, `customPeriod`, `weekPeriod`, `periodOptions`, `switchScale`, `stepPeriod`, `selectionOf`, `autoGrouping`, `SERIES_LENGTH`, URL (`periodSearchEntries`/`parsePeriodParams`) | `src/modules/dashboard/period.ts` |
| Tipos dos fluxos por período que cada quadro preenche (regra 9): `BucketPpc`, `ShortTermPeriodView`, `LongTermPeriodView`, `WagonsPeriodView`, `TerminalityPeriodView` | `src/modules/dashboard/period-views.ts` |
| Seletor de escala e período, o mesmo nas duas telas: `ScaleButtons` e `PeriodControl` (duas peças, para cada tela marcar o tour em cada uma) | `src/modules/dashboard/period-picker.tsx` |
| Contrato da aba 0 com o período (`DashboardFilters.selection`, `DashboardReference.period`, `periodName`, `isWeekly`, URL da impressão) | `src/modules/dashboard/model.ts` |
| Quadros por período (preenchem as visões de `period-views.ts`) | `src/modules/dashboard/short-term-panel.ts`, `long-term-panel.ts`, `wagons-panel.ts`, `medium-term-panel.ts`, `terminality-panel.ts` e `panels/*.tsx` |
| Aba 0: carga com o período, tela, impressão e rota (lê `escala`/`periodo`/`de`/`ate`/`agrupar` ou o antigo `semana`) | `use-dashboard-data.ts`, `dashboard-overview.tsx`, `dashboard-print.tsx`, `src/app/(app)/obras/[obraId]/dashboard/page.tsx` |
| Dashboard geral, contrato (só tipos): `PortfolioRow`, `PortfolioTotals`, `PortfolioData`, `PortfolioState`, `PortfolioSourcesResponse` | `src/modules/dashboard/portfolio/types.ts` |
| URL do geral: `portfolioSearchParams`, `parsePortfolioParams`, `PORTFOLIO_PATH`, `portfolioPath`, `printPortfolioPath` | `src/modules/dashboard/portfolio/params.ts` |
| Extração por obra (uma linha do comparativo a partir dos quadros) | `src/modules/dashboard/portfolio/extract.ts` |
| Consolidação (totais, cartões, frase, mapa de calor, Pareto, empreiteiros, responsáveis, obras sem dado) | `src/modules/dashboard/portfolio/aggregate.ts` |
| Carga (planejamento já carregado + rota única), um estado por módulo | `src/modules/dashboard/portfolio/use-portfolio-data.ts` |
| Tela do Dashboard geral | `src/modules/dashboard/portfolio/portfolio-overview.tsx` |
| Página de impressão (até 4 folhas) | `src/modules/dashboard/portfolio/portfolio-print.tsx` |
| Rota da página (`/dashboard`) | `src/app/(app)/dashboard/page.tsx` |
| Rota da impressão (`/imprimir/dashboard-geral`) | `src/app/imprimir/dashboard-geral/page.tsx` |
| Rota de leitura (`GET /api/dashboard/obras`): longo prazo (só com o módulo) e terminalidade sem fotos, para todas as obras liberadas | `src/app/api/dashboard/obras/route.ts` |
| Menu: `PortfolioLink` e `canComparePortfolio` (2+ obras, admin ou desenvolvedor) | `src/modules/layout/work-nav.tsx`, usado em `src/app/(app)/layout.tsx` |
| Migalha "Obras › Dashboard geral" | `src/modules/layout/top-bar.tsx` |
| Botão "Comparar obras" (`data-tour="obras-comparar"`) | `src/modules/obras/works-overview.tsx` |
| Tour da página (`steps`, `TourKey` `dashboardGeral`, `resolveTourKey('/dashboard')`) | `src/modules/tour/pages/dashboard-geral.ts`, registrado em `src/modules/tour/tours.ts` |
| Manual da assistente (`sections`, `screen: 'dashboard-geral'`) | `src/modules/agente/manual/dashboard-geral.ts`, registrado em `manual/index.ts` (`MANUAL_SECTIONS`, `SCREEN_LABEL`, nomes de busca) |
| Testes | `tests/dashboard-period.test.ts` e os testes dos quadros e do geral (ver "Validação") |

**Rotas:** `/dashboard` (a página, dentro do layout do sistema), `/imprimir/dashboard-geral` (a impressão, fora do layout, como a da aba 0) e `GET /api/dashboard/obras` (a leitura única).

**`GET /api/dashboard/obras`:** exige login; as obras são as liberadas para a pessoa. O longo prazo vem numa consulta só, e só para quem pode abrir o módulo (obra sem plano = sem dado; erro de banco = aviso em todas as obras). A terminalidade vem obra a obra, no máximo 4 ao mesmo tempo, sem fotos; sem a migração da terminalidade aplicada, nenhuma obra traz pendências. Erro numa obra fica só nela. O tempo de cada fase sai no cabeçalho `Server-Timing`. A resposta da rota (`PortfolioSourcesResponse`) traz `longTermAccess` (a pessoa pode abrir o longo prazo; senão nenhuma obra traz `longTerm`), `terminalityAvailable` (migração da terminalidade aplicada) e, por obra, `longTerm` (`null` = obra sem plano salvo; ausente = sem acesso ou erro, com `longTermError`) e `terminality` (pendências com `photos` vazio; ausente = indisponível ou erro, com `terminalityError`).

**Estados por módulo e por obra (`PortfolioCellStatus`):** `ready`, `absent` (sem dado, com o motivo do "—"), `loading`, `error` e `hidden` (a pessoa não pode abrir o módulo ou desmarcou o quadro).

## Regras de cálculo no período

### Comum: o período (`period.ts`)

- **Baldes.** Semana = a segunda-feira (`2026-10-26`); mês = `2026-10`; trimestre = `2026-T4`; ano = `2026`. Uma semana pertence ao balde da sua segunda-feira (`bucketKey`). Os baldes só têm as semanas até a atual; `nominalWeeks` conta as do calendário inteiro (o "M" de "N de M semanas").
- **Período (`DashboardPeriod`).** `weeks` (as segundas), `start` (segunda inicial), `end` (sábado da última semana), `lastWeek`, `partial` (contém a semana atual), `label`/`short` ("outubro de 2026"/"out/26"; "26/10 a 31/10/2026"/"26/10"; "4º trimestre de 2026 (out–dez)"/"4T26"), `of` ("do mês"), `series` e `previous`.
- **Referência.** `lastWeek` e `end` viram a semana e o sábado de referência dos quadros (`DashboardReference.week`/`weekEnd`): os retratos são tirados no sábado final, os fluxos somam as semanas de `weeks`.
- **Limites (`PeriodContext`).** `currentWeek` (segunda de hoje), `since` (primeira semana com dado: na aba 0, a primeira semana oferecida pela obra; no geral, a mais antiga entre as obras escolhidas) e `anchorWeek` (o balde padrão: na aba 0, a semana atual; no geral, a última semana antes da atual em que alguma obra escolhida tem todas as linhas com Status, regra 6). Chave ausente, inválida ou fora dos limites cai no balde de `anchorWeek`.
- **Lista de períodos (`periodOptions`).** Do balde atual ao de `since`, do mais novo ao mais antigo, só baldes com alguma semana até a atual; o atual leva " · parcial".
- **Setas (`stepPeriod`).** Um balde para trás ou para frente; no personalizado, o mesmo número de semanas. Ausente (botão desabilitado) quando sairia dos limites.
- **Troca de escala (`switchScale`).** Mantém o lugar: o balde da nova escala que contém a última semana do período; para o personalizado, o intervalo do período atual com agrupamento automático.
- **Personalizado (`customPeriod`).** De e até invertidos se preciso; "de" recua para a segunda, "até" vai ao sábado e não passa da semana atual. Sem datas na URL: as 12 semanas até a atual (`DEFAULT_CUSTOM_WEEKS`). O anterior é o intervalo de mesmo número de semanas imediatamente antes.
- **Série (`SERIES_LENGTH`).** 12 semanas, 12 meses, 8 trimestres, todos os anos, terminando no período e sem recuar antes de `since`. Personalizado: `autoGrouping` agrupa por semana até 16 semanas, por mês até **104 semanas** (os "24 meses" da regra 8) e por trimestre acima; "Agrupar por" oferece automático, semana, mês e trimestre. No personalizado, o primeiro e o último balde da série são cortados nas bordas do intervalo, mantendo o rótulo do balde.
- **Anterior.** O balde anterior da mesma escala; ausente antes da primeira semana com dado.
- **Véspera do período** = o domingo antes da segunda-feira inicial. Medição datada nesse domingo conta no início; a da segunda já é do período.

### Curto prazo (aba 4)

- **Semana apurada** = todas as linhas com Status. **Fluxo, `BucketPpc` por balde** (o período, o anterior e cada coluna da série): `planned`/`fulfilled` das semanas apuradas, `closedWeeks`, `openWeeks`, `pending` (linhas sem Status nas semanas em aberto) e `percent` = Σ cumpridos ÷ Σ assumidos das semanas apuradas, ausente sem semana apurada (regra 7). A semana em aberto fica fora do PPC e é contada à parte.
- **Série e média (`ShortTermPeriodView`):** os baldes da série; `average` = média simples dos baldes com PPC (regra 8); causas do período = as linhas com Não de todas as semanas do período, **inclusive as em aberto** (como "Causas na semana" já fazia), com a posição de cada causa no Pareto da obra.
- **Na aba 0, fora da escala semanal:** o cartão "PPC do mês" (do trimestre, do ano, do período), com a etiqueta "parcial · N de M semanas apuradas" no período em andamento e a dica "30 de 40 compromissos · ▲ 5 p.p. vs set/26". A frase: "Em outubro de 2026 a obra cumpriu 75% do que assumiu (30 de 40 compromissos em 3 semanas apuradas; 1 semana em aberto fica fora), 5 p.p. acima de setembro." (período parcial acrescenta "até agora"; com recorte, "o recorte de empreiteiro cumpriu"). O quadro vira "PPC do mês e dos anteriores", com três números ("PPC do mês", "vs anterior", "Semanas apuradas"), as barras por balde (faixa âmbar no analisado, hachura no balde só com semana em aberto, tracejado da média) e "Causas do mês". O Pareto da obra, o histórico e o ranking não mudam. No PDF, o quadro fora da escala semanal não traz as causas do período (como a semanal, que no papel também não traz as da semana).
- **Retrato até o fim do período:** PPC geral (`overall`) desde a primeira semana até o sábado final, somando linhas.
- **No geral (`PortfolioShort`):** `delta` = diferença entre os valores **arredondados** do período e do anterior; `early` = menos de 4 semanas apuradas até o fim do período ("em início", sem posição, regra 11); `position` = posição pelo PPC do período entre as obras com PPC e fora de "em início"; `companies` = linhas das semanas apuradas do período por empresa (coluna Empresa, `key` sem acento nem caixa).
- **Semana 1 de cada obra no geral** = a primeira semana com linha no curto prazo (`PortfolioRow.firstWeek`). Obra cuja primeira semana é posterior ao sábado final vai para `notStarted` e é citada na linha de escopo (regra 10). Na aba 0 a semana 1 continua sendo a das Configurações da obra (sem ela, a primeira com linha).
- **Faixas do PPC no geral:** 80% ou mais, bom; abaixo de 70%, atenção; abaixo de 60%, crítico; entre 70% e 80%, neutro. As faixas se aplicam ao **valor arredondado** que aparece na tela: 69,6% aparece como 70% e não conta como abaixo de 70%.
- **Posição:** empate exato divide a posição (1º, 1º, 3º).

### Longo prazo (aba 1)

- **Retrato no sábado final:** medido = última medição até o sábado; planejado no sábado pela linha de base mais recente (sem ela, plano vivo; `plannedSource`); desvio = medido − planejado em p.p.; prazo (`slip`) = término do plano vivo contra o da linha de base, em dias (positivo = atraso). Faixas: atrás do planejado, atenção; mais de 10 p.p. atrás, crítico.
- **Fluxo (`LongTermPeriodView`):** `measuredAtStart` = medido na véspera; `plannedAtStart`; `measuredGain` = medido no fim − medido no início e `plannedGain` = planejado no fim − planejado no início, **sobre os valores arredondados**; sem medição antes do período, o ganho é o medido no fim; ausente sem medição até o fim.
- **Na aba 0, fora da escala semanal:** a curva S marca a data como "31/10" e ganha a faixa "Período analisado"; o quadro mostra o cartão "Avanço no mês" (no trimestre, no ano, no período).

### Vagões (aba 2)

- **Retrato no sábado final:** status (`byStatus`), takt vencido, restrições vencidas e dívidas abertas, como na aba 0.
- **Fluxo (`WagonsPeriodView`):** restrições resolvidas (status Resolvida com data de resolução entre a segunda inicial e o sábado final) e criadas no mesmo intervalo, ambas com o recorte de empreiteiro.
- **Na aba 0, fora da escala semanal:** os retratos dizem "em 31/10"; aparece "Restrições resolvidas no mês: N"; a dica do cartão de restrições troca "prazo pelo lead time" pelas resolvidas no período.

### Médio prazo (aba 3)

- **Só retrato:** o plano vivo do mês do **sábado final** (sem ele, o mais recente até aquele mês, ou o mais recente de todos). Exemplo: o 3º trimestre de 2026 termina na semana de 28/09 (que começa em setembro), cujo sábado é 03/10, então lê o plano de outubro. Tarefas concluídas, em andamento e não iniciadas (só folhas); atrasadas (término previsto < sábado e % < 100); variação do término contra a linha de base congelada mais recente, em dias úteis (ausente sem linha de base); equipes superalocadas na última semana do período.
- **Na aba 0, fora da escala semanal:** "em 31/10 · plano de outubro", "Atrasadas em 31/10" e a superalocação "na última semana".

### Terminalidade (aba 5)

- **Fluxo (`TerminalityPeriodView`):** `opened` (observadas no período), `resolved` (corrigidas no período), `averageDaysToResolve` = média de dias da observação à correção das resolvidas no período, **sem arredondar no cálculo** (a tela arredonda; correção datada antes da observação conta 0 dia).
- **Retrato:** `openAtStart` (abertas na véspera) e em aberto no sábado final; a conta fecha: **em aberto no início + abertas − resolvidas = em aberto no fim**. `percentLabel` = % resolvidas desde a primeira pendência até o sábado final, como a aba 5. `openByContractor` = abertas no sábado final por responsável terceiro, todas (o geral soma as obras e mostra até 6).
- **Série (`buckets`):** cada balde vai da segunda-feira até o domingo antes do balde seguinte (o último para no sábado final), com abertas, resolvidas e o saldo em aberto no fim dele; por isso o saldo do balde anterior é igual ao em aberto no início do seguinte. Na escala semanal os baldes são idênticos às 12 semanas de antes.
- **Na aba 0, fora da escala semanal:** "Abertas no mês", "Resolvidas no mês", "Em aberto em 31/10 (eram N em …)" e a evolução por balde.
- **Sem fotos no geral:** a rota única devolve as pendências com `photos` vazio (regra 15).

### Consolidado do geral (`PortfolioTotals`)

- **Curto prazo:** soma das linhas de todas as obras (PPC e PPC geral); o anterior soma as obras que têm período anterior; `delta` sobre valores arredondados; `withPpc` = obras com PPC no período; `below70` = as obras abaixo de 70% (pelo valor arredondado).
- **Longo prazo:** obras com medição, obras atrás (`delta` < 0) e a pior.
- **Vagões:** takt vencido e restrições vencidas somados, com quantas obras têm cada um; restrições resolvidas no período somadas.
- **Médio prazo:** atrasadas somadas e quantas obras têm atrasadas.
- **Terminalidade:** em aberto, em aberto na véspera, abertas e resolvidas somadas; tempo médio **ponderado pelas resolvidas** de cada obra.
- **Estado da obra:** o pior tom entre os indicadores dos módulos **presentes e visíveis** da linha (em dia, atenção, crítico), como no selo do cartão da lista de obras; sempre com o texto (`stateLabel`). Módulo escondido em "Quadros" ou sem acesso não puxa o estado; a terminalidade não tem faixa e não muda o estado; "Sem apuração" só quando a obra não tem nenhum indicador. Isso difere do modelo HTML, que ignorava os quadros escondidos só na tela.
- **Mapa de calor (`PortfolioHeat`):** só as obras que têm curto prazo; célula vazia quando a obra não tem linha no balde; a linha "Todas" soma as linhas das obras; no personalizado nenhum balde fica marcado como o analisado.
- **Empresas e responsáveis:** pareados pelo nome sem acento nem caixa; o nome exibido é a grafia com mais linhas (ou pendências); as pendências sem responsável terceiro ficam num item só, "Sem responsável".
- **Cartões (regra 13):** os dois do curto prazo (PPC das obras, obras abaixo de 70%) aparecem sempre que o módulo está visível, com "—" sem semana apurada; os demais só quando alguma obra tem dado do módulo. Sem curto prazo, o primeiro cartão que sobra vira o principal.
- **Frase:** o PPC das obras e a comparação com o anterior, a melhor e a pior, as obras em início, o físico e a terminalidade (vagões não entram na frase). Período parcial: "(parcial: N de M semanas encerradas)", em que N conta as semanas do calendário que já terminaram (o modelo dizia "apuradas"; trocado em 04/11/2026 porque a frase podia dizer "9 de 13 semanas apuradas" e logo depois "nenhuma obra tem semana apurada"); na escala semanal, "(semana em andamento)".

### Carga do geral (`use-portfolio-data.ts`)

- **Âncora (regra 6):** a última semana antes da atual em que alguma das obras escolhidas tem todas as linhas com Status; o geral abre no balde dela (em Mensal, o mês).
- **Primeira semana (`since`):** a mais antiga entre as obras escolhidas.
- **Seleção de obras:** uma seleção na URL sem nenhuma obra válida (não liberada, inexistente) volta para todas.
- **Obra que começa depois do período:** não monta quadros; vai para `notStarted` e é citada na linha de escopo.
- **Rota:** se `GET /api/dashboard/obras` responder 403, longo prazo e terminalidade ficam escondidos; sem a migração da terminalidade, aparece o aviso "A terminalidade não está disponível neste ambiente."; erro numa obra aparece só naquela célula e no aviso de indisponível.

## URL

- **Aba 0** (`/obras/{obra}/dashboard` e `/imprimir/dashboard/{obra}`):
  - semanal: `semana=AAAA-MM-DD` (o formato dos links que já existiam, que continua valendo; qualquer dia vira a segunda);
  - mensal, trimestral e anual: `escala=mes&periodo=2026-10`, `escala=trimestre&periodo=2026-T4`, `escala=ano&periodo=2026`;
  - personalizado: `escala=personalizado&de=AAAA-MM-DD&ate=AAAA-MM-DD`, mais `agrupar=semana|mes|trimestre` quando não é o automático;
  - também valem `escala=semana&periodo=…` e `escala=semana&semana=…`; chave inválida ou fora dos limites cai no padrão;
  - na tela, trocar escala ou período atualiza o endereço sem recarregar (só escala e período); na impressão seguem também `empreiteiro` (repetido), `pavimento` (repetido) e `quadros` (separados por vírgula).
- **Geral** (`/dashboard` e `/imprimir/dashboard-geral`): os mesmos parâmetros de período, mais `obra=` repetido (as obras escolhidas; ausente = todas as liberadas) e `quadros=` separados por vírgula (ausente = todos os que a pessoa pode abrir). A tela e a impressão leem os mesmos parâmetros (`parsePortfolioParams`), para o PDF sair igual à tela.
- **Do geral para a aba 0:** clicar numa obra abre `/obras/{obra}/dashboard` com os parâmetros de período do geral (regra 6).

## Tour e manual da assistente

- **Tour do Dashboard geral** (`src/modules/tour/pages/dashboard-geral.ts`, export `steps`, `TourKey` `dashboardGeral`): 18 passos próprios na ordem da tela (introdução sem alvo, cabeçalho, "Como funciona", filtros, escala, período, obras, quadros, linha de escopo, frase, cartões, comparativo, PPC por obra, mapa de calor e causas, empreiteiros, outros quadros, "Gerar PDF", nota final), mais os 2 comuns de `tours.ts` (o da assistente é pulado, porque a assistente não abre fora das obras). Alvos `data-tour`: `geral-cabecalho`, `geral-ajuda`, `geral-filtros`, `geral-escala`, `geral-periodo`, `geral-obras`, `geral-quadros`, `geral-escopo`, `geral-resumo`, `geral-cartoes`, `geral-comparativo`, `geral-curto`, `geral-mapa`, `geral-empreiteiros`, `geral-modulos`, `geral-pdf`, `geral-rodape`.
- **Tour da aba 0:** `dash-semana` virou `dash-escala` e `dash-periodo` (16 passos próprios); os passos do quadro e do PDF citam o período, o "Avanço no mês" e a faixa "Período analisado".
- **Tour da lista de obras** (`obras.ts`): passo novo "Comparar obras" (`obras-comparar`), logo depois da introdução; o passo "Abrir a obra" foi corrigido para a aba 0 (dizia "cronograma de curto prazo", anterior à aba 0).
- **Manual** (`src/modules/agente/manual/dashboard-geral.ts`, export `sections`, `screen: 'dashboard-geral'`, rótulo "Dashboard geral (todas as obras)"), 7 seções: `dashboard-geral-visao-geral` (o que é, onde fica, quem vê, a página de cima para baixo, a assistente só dentro da obra), `dashboard-geral-escalas-e-periodo` (vale também para a aba 0), `dashboard-geral-comparativo-das-obras` (frase, cartões, tabela, estado, "—"), `dashboard-geral-curto-prazo-comparado` (barras, em início, faixas, mapa de calor, causas, empreiteiros), `dashboard-geral-outros-quadros` (fluxo × retrato por módulo), `dashboard-geral-pdf` e `dashboard-geral-duvidas-comuns` (número diferente da aba 0, obra que não aparece, item do menu, "—", parcial, soma e não média, filtro de empreiteiro, o que fica para depois). Como a assistente só abre dentro de uma obra, estas seções respondem a quem pergunta de lá.
- **Manual da aba 0** (`dashboard.ts`): a seção `dashboard-filtros-semana-analisada` (mesmo id) passou a explicar escala e período e o "somado no período × retrato no sábado final"; as demais trocaram "semana analisada" por "período" onde mudou; as dúvidas comuns ganharam "Onde foi parar a Semana analisada?", "Por que o PPC do mês não é a média das semanas?" e "O número é diferente do Dashboard geral".

## Filtro de empreiteiro no Dashboard geral (05/11/2026)

Pedido do usuário logo depois da publicação: "além de filtrar por obra, permita que a gente filtre por empreiteiro". Era a alternativa recusada da regra 3; foi implementada sem novo modelo, com o comportamento do mesmo filtro na aba 0.

- **Seletor "Empreiteiro"** ao lado de "Obras" (`data-tour="geral-empreiteiro"`), com as empresas de todas as obras escolhidas: coluna Empresa do curto prazo (`shortTermCompanies`), responsável terceiro da terminalidade (`terminalityCompanies`, quando a rota responde) e empresa das equipes. Grafias equivalentes (sem acento nem caixa, `companyKey`) viram uma opção só, somando as contagens.
- **Recorte:** os nomes vão a `filters.companies` de cada construtor, como na aba 0: curto prazo pela coluna Empresa, vagões e médio prazo pela empresa da equipe, terminalidade pelo responsável terceiro. Longo prazo não se aplica (medição por serviço). PPC geral e "em início" continuam da obra inteira (`whole.overall`), como o ranking da aba 0.
- **Obras sem o empreiteiro:** com recorte, a obra escolhida onde nenhuma das empresas aparece (em nenhuma das três fontes) sai das linhas (`PortfolioReady.withoutCompany`); a linha de escopo e o rodapé do PDF dizem quais. Enquanto a rota não responde, a presença é decidida só pelo curto prazo e pelas equipes.
- **"Empreiteiros em mais de uma obra"** mostra só as empresas escolhidas (continua exigindo duas obras ou mais).
- **URL:** `empreiteiro=` repetido, o mesmo nome do parâmetro da aba 0. Clicar numa obra abre a aba 0 no mesmo período e com o mesmo recorte (a página da aba 0 passou a ler `empreiteiro=` como recorte inicial, e o seletor acende a opção de grafia equivalente). O PDF sai com o recorte.
- **Arquivos:** `portfolio/types.ts` (`PortfolioInput.companies`, `PortfolioReady.companyOptions` e `withoutCompany`), `portfolio/params.ts`, `portfolio/use-portfolio-data.ts`, `portfolio/portfolio-overview.tsx`, `portfolio/portfolio-print.tsx`, `dashboard-overview.tsx` e a página da aba 0; tour (passo "Empreiteiro") e manual (dúvida "Dá para filtrar por empreiteiro aqui?").

## Validação

Rodada de 04/11/2026, ao fim da implementação (seis agentes em paralelo, por posse de arquivo, e o coordenador nos arquivos compartilhados):

- **Sequência do CI, toda verde:** `npm run typecheck` sem erro; `npm run lint` com 0 erros (29 avisos, todos anteriores, nenhum nos arquivos novos ou alterados); `npm run format:check` conforme; `npm test` com 968 de 968; `npm run validate:migrations` OK (nenhuma migração nova); `npm run build` com as variáveis do CI, com as rotas `/dashboard`, `/imprimir/dashboard-geral` e `/api/dashboard/obras` no resultado; `npm run test:e2e` com 8 de 8.
- **Testes novos ou ampliados:** `tests/dashboard-period.test.ts` (11, o modelo do período, a URL e a compatibilidade de `referenceOf`); `dashboard-short-term` (16, 6 novos), `dashboard-long-term` (15, 4 novos), `dashboard-terminality` (21, 7 novos), `dashboard-wagons` (19, 5 novos), `dashboard-medium-term` (13, 3 novos), `dashboard-portfolio` (17, cálculo do geral) e `dashboard-portfolio-route` (7, partes puras da rota). Os testes antigos da aba 0 passam sem nenhuma mudança de expectativa.
- **Escala semanal igual a antes:** os agentes renderizaram, fora do navegador (`react-dom/server`), os quadros de curto prazo, vagões e médio prazo nas variantes de tela e papel, com os mesmos dados, no código novo e no do commit `982a192`: o HTML saiu idêntico.
- **Fora do navegador:** os quadros nas seis situações de escala, nas duas variantes, sem erro de execução; o gráfico de barras por período e o comparativo/mapa de calor do geral foram convertidos em imagem e conferidos com dados inventados, no computador e na largura de celular. O cálculo do geral rodou de ponta a ponta sobre os dados de demonstração do repositório nas cinco escalas, sem erro (os dados de demonstração só têm a semana atual em aberto, então a frase diz que nenhuma obra tem semana apurada).
- **Correção feita na revisão:** a frase do geral dizia "parcial: 9 de 13 semanas apuradas" contando semanas do calendário; passou a "semanas encerradas" (ver "Frase", acima). Também: a semana atual na lista da aba 0 deixou de sair com duas marcas ("(atual) · parcial"), e o item do menu e o botão "Comparar obras" passaram a contar as obras da mesma forma.
- **Não validado:** nenhuma das duas telas foi aberta logada (o login exige Google); o PDF do geral e o da aba 0 fora da escala semanal não foram gerados num navegador real; o tempo da rota `GET /api/dashboard/obras` com o volume real (Blentt e Mozine com milhares de linhas, terminalidade importada) não foi medido; o celular não foi testado num aparelho.

## Pendências

- **Publicado em 04/11/2026** (commit `de1b449`, deploy conferido pela troca dos arquivos da página de login; CI do GitHub verde). O filtro de empreiteiro do geral (05/11/2026) entra no commit seguinte.
- **Validação logada em produção:** abrir o Dashboard geral com as obras reais e conferir, num mesmo período, que a linha de cada obra bate com a aba 0 dela (o clique na obra leva ao mesmo período); conferir o padrão "Mensal, mês mais recente com semana apurada" e o item do menu para quem tem uma obra só.
- **PDF no navegador real:** gerar o do geral (até 4 folhas) e o da aba 0 em escala mensal e personalizada, em Chromium e Safari; a descrição do quadro do curto prazo no papel pode ocupar 2 ou 3 linhas na folha de 732 px.
- **Tempo da rota do geral:** medir pelo `Server-Timing` (fases `auth`, `longTerm`, `terminality`); o cálculo de todas as obras roda no navegador a cada troca de período.
- **Divergências conhecidas, registradas para o usuário decidir se quiser:** o tempo médio da terminalidade no geral é das resolvidas no período (fluxo), enquanto a regra 9 o listava como retrato; as faixas do PPC no geral (80/70/60 sobre o período) diferem das do cartão da lista de obras (80/60 sobre a última semana apurada); a lista de períodos traz todo balde entre a primeira semana com dado e hoje, inclusive meses sem linha; a semana 1 de cada obra no geral é a primeira semana com linha (não a das Configurações), então "em início" pode diferir da aba 0 numa obra como a Essenza.

- **Leitura da terminalidade sem fotos (anotado durante a implementação):** o repositório da terminalidade ainda lê a tabela de fotos, e a rota `GET /api/dashboard/obras` só as descarta antes de responder. Se o tempo pesar com o volume real (ver o `Server-Timing`), criar no repositório uma leitura sem fotos.

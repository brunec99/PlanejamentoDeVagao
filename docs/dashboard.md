# Aba 0 — Dashboard da obra (04/11/2026)

Continuidade entre os modelos de IA que trabalham no repositório. Descreve o que a aba 0 entrega, as decisões do modelo aprovado, os arquivos, as regras de cálculo de cada quadro, a validação e as pendências. O que está marcado como pendência **não** está feito.

## O que o usuário pediu

Em 04/11/2026 o usuário pediu um **campo 0, "DASHBOARD"**, no topo das abas de cada obra: uma página que compile o curto prazo, o médio prazo, o longo prazo, a terminalidade e os vagões, com filtros e geração de PDF, mostrando **só os módulos liberados** para quem está olhando. Junto veio um segundo pedido: a planilha com o histórico do curto prazo ("Dados compilados", uma aba por obra) tem os dados do passado, e o dashboard precisa considerá-los; a planilha continua sendo preenchida pelas equipes depois da carga de 28/10/2026 (em 04/11, a Atmos estava na semana 64 e a Mozine na 119).

Seguindo o combinado de 30/10/2026 (modelo de UX antes do código), o modelo foi publicado com o visual real, dados de exemplo e as regras numeradas, e o usuário o aprovou em 04/11/2026. As 15 regras abaixo são o que foi aprovado e valem como especificação.

## Decisões (modelo aprovado em 04/11/2026)

1. **Aba "0 · Dashboard"** no topo da lista de abas de toda obra (chip 0), rota `/obras/{obra}/dashboard`. Abrir uma obra na lista de obras passa a cair nela, e não mais no curto prazo.
2. **Quadros só dos módulos que a pessoa pode abrir e que têm dado nesta obra.** Abertos a todos: curto prazo e terminalidade; os demais, os liberados pelo admin para a pessoa (admin e desenvolvedor veem todos). Módulo sem dado não ocupa espaço; a linha abaixo dos filtros diz "Módulos sem dados nesta obra: …".
3. **"Semana analisada" é a data de referência de tudo.** Padrão: a semana atual. Cada quadro conta só até o **sábado** dela, nada depois (pendência resolvida depois conta como aberta; medição posterior não entra), como o painel do PDF do fechamento, para o PDF de uma semana antiga sair igual depois.
4. **Filtros:** Semana analisada (seletor), Empreiteiro (seletor múltiplo), Pavimento (seletor múltiplo) e Quadros (quais módulos entram na tela e no PDF). Empreiteiro vale no curto prazo (coluna Empresa), na terminalidade (Responsável terceiro), no médio prazo (empresa da equipe) e nos vagões (empresa das equipes das atividades). Pavimento vale na terminalidade e no longo prazo, pareado pelo nome sem acento; no longo prazo a medição é por serviço, então o medido não se divide por pavimento. O ranking das obras e o avanço físico nunca seguem o recorte, e o quadro diz isso.
5. **Curto prazo:** série das 12 semanas até a analisada, média simples das apuradas (alerta âmbar abaixo de 70%), PPC geral e ranking das obras (os mesmos números do PDF do fechamento), causas da semana e Pareto da obra; e o quadro **"Histórico desde a semana 1"**: PPC de cada mês desde a primeira semana da obra, PPC geral por ano, melhor e pior mês. O passado vem das planilhas já importadas (Blentt em 08/10/2026; Atmos, Tauá, Brizz, Essenza e Mozine em 28/10/2026, da planilha "Dados compilados") e entra sozinho.
6. **Longo prazo:** avanço físico medido (última medição até a data) contra o planejado na data (dias-pavimento do plano, linear em cada pavimento, pela linha de base mais recente; sem ela, pelo plano vivo), desvio em p.p.; curva S (planejado contínuo, medições como pontos); os 5 serviços com maior desvio; prazo planejado contra a linha de base. Sem medição: só o planejado e o aviso.
7. **Vagões:** vagões por status (não iniciado, em produção, com restrição, terminal), takt vencido, dívidas abertas, progresso dos vagões em produção (os 3 de maior progresso) e o quadro de restrições por coluna, com as vencidas destacadas.
8. **Médio prazo:** o plano vivo do mês da semana analisada (sem ele, o mais recente): tarefas concluídas, em andamento e não iniciadas; atrasadas na data (término previsto antes dela e < 100%); variação contra a linha de base congelada mais recente, em dias úteis; caminho crítico; equipes superalocadas na semana; marcos dos próximos 30 dias.
9. **Terminalidade:** abertas, resolvidas e % até a data, tempo médio em aberto, abertas por responsável terceiro e por pavimento (os 6 maiores), por tipo em rosca, evolução das 12 semanas (abertas × resolvidas por semana e saldo).
10. **Resumo no topo:** uma frase (com os números arredondados, nunca contradizendo os cartões) e até 6 cartões (PPC da semana, avanço físico, takt vencido, tarefas atrasadas, pendências abertas, restrições vencidas), cada um dizendo de que aba vem; estado sempre com cor **e** texto.
11. **PDF:** o botão "Gerar PDF" abre a página de impressão numa aba nova com os filtros na URL (`/imprimir/dashboard/{obra}?semana=&empreiteiro=&pavimento=&quadros=`) e chama o "Salvar como PDF" do navegador, como os PDFs de hoje. A4 paisagem, cabeçalho igual ao do fechamento (logos ATR e Takt, "DASHBOARD DA OBRA <NOME>", semana analisada e atual). Folha 1: resumo e curto prazo; depois uma folha por módulo presente: longo prazo e vagões juntos; médio prazo; terminalidade. Rodapé com a data de referência, os filtros ativos, quem gerou e quando, "Folha N de M".
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

**O que mudou fora do módulo:**

- `src/modules/layout/work-nav.tsx`: `WORK_TABS` ganhou `number` explícito (o dashboard é 0; as outras abas continuam 1 a 5), em vez de numerar pela posição.
- `src/modules/layout/tab-header.tsx`: usa `tab.number`, para o cabeçalho mostrar o 0.
- `src/application/module-access.ts`: `MODULES` ganhou `dashboard` como módulo **aberto a todos** (não entra em `RESTRICTED_SECTIONS`).
- `src/modules/obras/works-overview.tsx` e `top-bar.tsx`: abrir a obra cai no dashboard.
- `src/modules/tour/tours.ts` e `src/modules/agente/manual/index.ts`: registro do tour e do manual.

**Modelo de dados do módulo (`model.ts`):** `DashboardModule` (`longo-prazo`, `vagoes`, `medio-prazo`, `curto-prazo`, `terminalidade`, com o número da aba de origem), `DashboardFilters` (`week` = segunda-feira da semana analisada; `companies`, `floors` e `modules` como conjuntos, ausente = sem recorte), `DashboardReference` (`week`, `weekEnd` = sábado, `weekNumber`, `currentWeek`, `today`, `firstWeek`), `KpiCard`/`PanelSummary` (o cartão e os trechos da frase que cada quadro entrega) e `PanelState` (`loading`, `error`, `absent`, `ready`). Empreiteiro e pavimento são comparados por `textKey` (sem acento nem caixa), porque o nome é digitado à mão no curto prazo e na terminalidade. Os filtros viajam na URL da impressão por `dashboardSearchParams`/`parseDashboardParams` (`semana`, `empreiteiro` repetido, `pavimento` repetido, `quadros` separados por vírgula; semana inválida vira a atual, lista vazia de quadros vale "todos").

## Regras de cálculo por quadro

### Comum a todos: data de referência e filtros

- **Data de referência** = o sábado da semana analisada (`weekEnd`). Todo quadro ignora o que tem data depois dela. É a mesma regra do painel da primeira página do PDF do fechamento (30/10/2026), e o motivo é o mesmo: o PDF de uma semana antiga precisa sair igual quando for gerado de novo.
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

- **Plano:** o plano vivo cujo mês contém a semana analisada; sem ele, o mais recente, e o quadro diz qual.
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
- **Evolução das 12 semanas:** por semana até a analisada, abertas (observação na semana), resolvidas (correção na semana) e saldo de abertas ao fim da semana.
- **Filtros:** empreiteiro pelo Responsável terceiro; pavimento pelo Local.

### Resumo e cartões

- Cada quadro `ready` devolve um `PanelSummary`: o `KpiCard` (módulo, rótulo, valor, etiqueta com `Tone` e texto, dica) e os trechos da frase.
- A frase é montada a partir dos valores **já arredondados** dos cartões, para nunca contradizer um cartão.
- O cartão do PPC é o `main` quando o curto prazo está presente. Módulo ausente, com erro ou desmarcado em "Quadros" não deixa cartão vazio: a grade se ajusta a 4, 5 ou 6 cartões.

## Tour e manual da assistente

- **Tour** (`src/modules/tour/pages/dashboard.ts`): 15 passos, na ordem da tela (introdução sem alvo, cabeçalho, "Como funciona", filtros, semana, empreiteiro, pavimento, quadros, linha de escopo, frase, cartões, primeiro quadro, primeiro "Abrir aba", "Gerar PDF", nota final), mais os 2 comuns acrescentados por `tours.ts` (agente e "Sempre que precisar"). Alvos `data-tour`: `tab-header`, `tab-ajuda`, `dash-filtros`, `dash-semana`, `dash-empreiteiro`, `dash-pavimento`, `dash-quadros`, `dash-escopo`, `dash-resumo`, `dash-cartoes`, `dash-quadro`, `dash-abrir-aba`, `dash-pdf`, `dash-rodape`. `tests/tour-targets.test.ts` confere que cada alvo existe em alguma marcação do código e que a rota tem tour.
- **Manual** (`src/modules/agente/manual/dashboard.ts`), 6 seções com `screen: 'dashboard'`: `dashboard-visao-geral` (o que é, quem vê, a frase e os cartões), `dashboard-filtros-semana-analisada`, `dashboard-quadro-curto-prazo`, `dashboard-quadros-longo-vagoes-medio-terminalidade`, `dashboard-pdf` e `dashboard-duvidas-comuns` (módulo que não aparece, número diferente da aba, dados antigos da planilha, "indisponível", semana em aberto, só o planejado, nada se edita, celular). O texto é para quem usa a tela: sem caminhos de código nem rotas.

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
- **Sem commit e não publicado** até o coordenador fechar a bateria do CI e registrar a validação acima.

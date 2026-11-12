import type { ManualSection } from './types';

/** Manual do Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"): a página fora
 * das obras que compara as obras liberadas para a pessoa no período escolhido, e as escalas de tempo, que valem
 * também na aba 0. Para quem não é admin, a assistente só abre dentro de uma obra, então estas seções respondem
 * a quem pergunta de dentro de uma obra sobre a página geral; o admin tem a Claudia geral também aqui (08/11/2026).
 * A página não edita nada: o manual é de leitura. */
export const sections: ManualSection[] = [
  {
    id: 'dashboard-geral-visao-geral',
    title: 'Dashboard geral: o que é, onde fica e quem vê',
    summary: 'Página fora das obras com as obras liberadas lado a lado no período escolhido; item no menu, botão Comparar obras e quem vê.',
    keywords: [
      'dashboard geral',
      'comparar obras',
      'todas as obras',
      'obras lado a lado',
      'onde fica o dashboard geral',
      'quem vê o dashboard geral',
      'empreendimentos',
      'visão de todas as obras',
      'painel das obras',
    ],
    screen: 'dashboard-geral',
    body: `## O que é o Dashboard geral

É uma página **fora das obras** que mostra as obras liberadas para você lado a lado, no período escolhido. Os quadros são os mesmos da aba 0 (Dashboard da obra), agora comparando as obras: curto prazo, longo prazo, vagões, médio prazo, terminalidade e segurança do trabalho e, desde 12/11/2026, Linha de Balanço e legalização, Quadro de Restrições, histograma, produtividade e checklist de equipamentos (onze quadros, na ordem do menu). Responde a perguntas como "qual obra está cumprindo menos o que assume neste mês?", "quantas obras estão atrás no físico?", "qual empreiteiro vai mal em mais de uma obra?" e "quantos apontamentos de segurança estão abertos há mais de 7 dias?".

Nada aqui se edita. Clicar numa obra da tabela abre a aba 0 dela **no mesmo período e na mesma escala**; de lá, "Abrir aba N →" leva à aba de origem, onde o dado se altera.

## Onde fica

- No menu lateral, em **Empreendimentos**, logo abaixo de **Obras**: o item "Dashboard geral", com a dica "Todas as obras · Comparativos".
- Na lista de obras, o botão **"Comparar obras"**, no topo, ao lado de "Cadastrar obra".

A lista de obras continua sendo a página inicial do sistema.

## Quem vê, e o que aparece para cada pessoa

- O item e o botão aparecem para quem tem **duas obras ou mais** liberadas (com uma só não há o que comparar), e **sempre** para admin e desenvolvedor.
- Cada pessoa vê **as mesmas obras da lista de obras**, e nenhuma outra.
- Os quadros e as colunas seguem os **módulos liberados**, como na aba 0: longo prazo, vagões, médio prazo, curto prazo, terminalidade e segurança do trabalho para quem o admin liberou (curto prazo e terminalidade entraram nessa regra em 08/11/2026 e a segurança do trabalho em 12/11/2026; admin e desenvolvedor veem todos). Módulo que você não pode abrir não aparece nem vira coluna. A segurança aparece para quem tem o módulo "Segurança do trabalho" liberado, como a aba 3.1 (antes de 12/11/2026, para todos com a obra), e não só para TST e admin.
- O papel "Consulta" também vê a página e gera o PDF, como nas outras telas de leitura.

## A página, de cima para baixo

1. O cabeçalho, com "Como funciona" (a explicação longa) e "Gerar PDF".
2. Os filtros: **"Escala"** (Semanal, Mensal, Trimestral, Anual, Personalizado), **"Período"**, **"Obras"** (seletor múltiplo, todas marcadas ao abrir), **"Empreiteiro"** (desde 05/11/2026) e **"Quadros"** (quais módulos entram; a chave "Segurança" liga e desliga a segurança do trabalho).
3. A linha de escopo: quantas obras estão no período, as semanas que ele cobre, o sábado até o qual tudo conta, "parcial" quando o período está em andamento, e as obras que só começaram depois do período.
4. A frase de resumo e até nove cartões, em duas linhas (seção "Comparativo das obras, frase e cartões do Dashboard geral").
5. O **Comparativo das obras**, uma linha por obra.
6. O curto prazo comparado: PPC do período por obra, evolução do PPC (mapa de calor), causas somando as obras e empreiteiros em mais de uma obra.
7. Os quadros do longo prazo, da Linha de Balanço e legalização, dos vagões, do médio prazo, do Quadro de Restrições e da terminalidade; depois o histograma e a produtividade, lado a lado; a **"Segurança do trabalho"**; e o checklist de equipamentos (seção "Controles de obra, restrições, balanço e checklist no Dashboard geral").
8. A nota final: clicar numa obra abre a aba 0 dela no mesmo período; nada se edita.

O filtro de **Pavimento** não existe aqui, de propósito: os nomes mudam de uma obra para outra. Para recortar por pavimento, abra a aba 0 da obra. O filtro de **Empreiteiro** existe desde 05/11/2026 (seção "Dúvidas comuns do Dashboard geral"); a segurança do trabalho não se recorta por empresa, porque a vistoria não registra a empresa responsável.

## A assistente nesta página

Para administradores, a Claudia geral abre também aqui (botão "Claudia" no cabeçalho, ou Ctrl+J / ⌘J) e compara as obras com os mesmos números desta página (seção da Claudia geral). Para os outros perfis, a assistente só abre dentro de uma obra: para tirar uma dúvida sobre a página geral, abra qualquer obra e pergunte lá.`,
  },
  {
    id: 'dashboard-geral-escalas-e-periodo',
    title: 'Escalas de tempo e período: semanal, mensal, trimestral, anual e personalizado',
    summary:
      'O seletor de escala e período vale no Dashboard geral e na aba 0; o período é feito de semanas inteiras e vai até o sábado final.',
    keywords: [
      'escala de tempo',
      'escala',
      'mensal',
      'trimestral',
      'anual',
      'personalizado',
      'agrupar por',
      'semanas inteiras',
      'período anterior',
      'série de 12 meses',
      'trocar o período',
      'intervalo de datas',
    ],
    screen: 'dashboard-geral',
    body: `## O seletor de escala e período

O mesmo seletor está no Dashboard geral e na aba 0 de cada obra (onde substituiu a antiga "Semana analisada"). São duas peças:

- **"Escala"**: Semanal, Mensal, Trimestral, Anual ou Personalizado.
- **"Período"**: nas quatro primeiras escalas, uma lista com os períodos, do mais novo ao mais antigo, e as setas ‹ › para andar um período de cada vez; no Personalizado, os campos "de" e "até" e a lista "Agrupar por".

Trocar a escala **mantém o lugar**: vendo outubro em Mensal, o Trimestral abre no 4º trimestre e o Semanal na última semana de outubro.

## O período é sempre feito de semanas inteiras

- A semana pertence ao período da **sua segunda-feira**, a mesma regra do "Histórico desde a semana 1" da aba 0. Exemplo: outubro de 2026 vai da semana de 05/10 à de 26/10, e tudo conta até o sábado 31/10. A semana de 28/09 começa em setembro e fica em setembro.
- Trimestres e anos são os do calendário (1º trimestre = janeiro a março).
- No Personalizado, "de" recua para a segunda-feira e "até" avança para o sábado da sua semana; "até" não passa da semana atual.
- Nada depois do sábado final entra: uma pendência resolvida depois conta como aberta, um apontamento de segurança finalizado depois conta como em aberto, uma medição posterior não entra. Por isso o PDF de um período antigo sai igual quando é gerado de novo.

Datas exatas do calendário (01 a 31/10) cortariam semanas da planilha ao meio, e o PPC deixaria de bater com a aba 1.3.

## Período em andamento: "parcial"

O período que contém a semana atual aparece como **"parcial"**, com quantas das suas semanas já foram apuradas. A semana em aberto (com linha sem Status) fica fora do PPC e aparece hachurada, como sempre.

## Onde cada tela abre

- **Dashboard geral**: em **Mensal**, no mês mais recente que tem alguma semana apurada (em 04/11/2026, outubro).
- **Aba 0**: como antes, em **Semanal**, na semana atual.
- **Da tabela do Dashboard geral para a aba 0**: a aba 0 abre na mesma escala e no mesmo período.

Escala e período vão para o endereço da página, então o link copiado reproduz a mesma visão. Os links antigos da aba 0, feitos com a semana analisada, continuam abrindo na escala semanal.

## Séries e agrupamento

As séries (a do curto prazo, a evolução da terminalidade e a curva S da aba 0) mostram:

- **12 semanas** no Semanal, **12 meses** no Mensal, **8 trimestres** no Trimestral e **todos os anos** no Anual, sempre terminando no período escolhido e sem recuar antes da primeira semana com dado;
- no **Personalizado**, os períodos do intervalo, agrupados sozinhos: até 16 semanas, por semana; até 24 meses, por mês; acima disso, por trimestre. "Agrupar por" deixa escolher semana, mês ou trimestre.

A linha da **média da série** continua sendo a média simples dos períodos mostrados que têm valor.

## Comparação com o período anterior

A seta (▲ ou ▼, em pontos percentuais) compara com o **período anterior da mesma escala**: outubro com setembro, o 4º trimestre com o 3º. No Personalizado, com o intervalo de mesmo número de semanas imediatamente antes. Sem dado no período anterior, não há seta.

## PPC do período: soma, não média

O PPC de um mês, trimestre, ano ou intervalo é **cumpridos ÷ assumidos de todas as semanas apuradas do período**, somando as linhas, o mesmo cálculo do PPC geral. Não é a média dos PPCs semanais: uma semana com 10 compromissos não pesa o mesmo que uma com 90. Detalhes e exemplo na seção "Dúvidas comuns do Dashboard geral".`,
  },
  {
    id: 'dashboard-geral-comparativo-das-obras',
    title: 'Comparativo das obras, frase e cartões do Dashboard geral',
    summary:
      'Uma linha por obra com os indicadores de cada módulo, a linha do consolidado, o estado da obra, o traço e os cartões do topo.',
    keywords: [
      'comparativo das obras',
      'tabela comparativa',
      'uma linha por obra',
      'consolidado',
      'estado da obra',
      'ordenar a tabela',
      'ppc das obras',
      'obras abaixo de 70%',
      'atrás no físico',
      'cartões do dashboard geral',
      'frase do dashboard geral',
      'apontamentos de segurança em aberto',
      'colunas de segurança',
    ],
    screen: 'dashboard-geral',
    body: `## A frase de resumo

No topo, uma frase conta o período: o PPC das obras e a diferença para o período anterior, a melhor e a pior obra, as obras em início, as obras atrás no físico, as pendências em aberto no fim e, por último, a segurança do trabalho ("A segurança do trabalho fecha o período com N apontamentos em aberto, X a mais que no início, Y há mais de 7 dias."). Ela é escrita com os números **já arredondados** dos cartões, para nunca contradizer um cartão.

## Os cartões

Até nove números consolidados, em duas linhas (até seis antes da segurança do trabalho, em 06/11/2026, e até sete antes de 12/11/2026, quando entraram **Efetivo médio**, a soma do efetivo médio por dia útil das obras, com quantas lançaram todos os dias úteis, e **Cards vencidos**, do Quadro de Restrições, com quantas obras têm algum). Os dois cartões do curto prazo aparecem sempre que o quadro do curto prazo está visível (com "—" quando nenhuma obra tem semana apurada); os demais só aparecem quando alguma obra tem dado daquele módulo. Quadro desmarcado em "Quadros" ou módulo sem acesso não deixa cartão vazio; sem o curto prazo, o primeiro cartão que sobra vira o destaque. Cada cartão diz de que aba vem e quantas obras entram na conta (os números abaixo são os do menu renumerado em 12/11/2026; o Planejamento de vagão, antiga aba 2, não tem mais número e abre pela aba 1.1):

- **PPC das obras** (aba 1.3): cumpridos ÷ assumidos de todas as obras no período, somando as linhas, com a seta contra o período anterior.
- **Obras abaixo de 70%** (aba 1.3): quantas das obras com PPC no período ficaram abaixo da linha de alerta, e quais.
- **Atrás no físico** (aba 1.1): quantas obras com medição estão abaixo do planejado no sábado final, e a pior.
- **Takt vencido** (Planejamento de vagão): vagões com o período vencido sem serem terminais, somando as obras, no sábado final.
- **Restrições vencidas** (Planejamento de vagão): restrições abertas com o limite de resolução vencido, somando as obras, no sábado final.
- **Pendências em aberto** (aba 2.1): em aberto no sábado final, somando as obras, com a diferença para o início do período e quantas foram abertas e resolvidas nele.
- **Apontamentos de segurança em aberto** (aba 3.1): em aberto no sábado final, somando as obras, com a seta da diferença para o início do período e a dica "N feitos e N finalizados no período · N obras".

Cada cartão diz também se o número é **o que aconteceu no período** ou **o retrato do sábado final** (seção "Longo prazo, vagões, médio prazo e terminalidade no Dashboard geral").

## O Comparativo das obras

Uma tabela com **uma linha por obra** e uma coluna por indicador, agrupadas por módulo:

- **Obra** (nome e código; "em início" quando é o caso) e **Estado**;
- **Curto prazo**: PPC do período, a diferença para o período anterior e o PPC geral desde a primeira semana;
- **Longo prazo**: medido × planejado no sábado final e o desvio em pontos percentuais;
- **Vagões**: takt vencido e restrições vencidas;
- **Médio prazo**: tarefas atrasadas do plano do mês;
- **Terminalidade**: em aberto no fim, abertas e resolvidas no período e o tempo médio até a correção;
- **Segurança**: "Em aberto" no sábado final (com a variação no período embaixo), "Feitos / finaliz." no período e "> 7 dias" (abertos há mais de 7 dias no sábado final, em vermelho quando há algum).

Só entram as colunas dos módulos que você pode abrir e que estão marcados em "Quadros". Cada célula tem **cor e texto** juntos, para não depender só da cor.

- **Ordenar**: clique no título da coluna; clique de novo para inverter.
- **Abrir a obra**: clique na linha da obra para abrir a aba 0 dela no mesmo período e na mesma escala.
- **Consolidado**: a última linha soma as obras. O PPC consolidado soma as linhas de todas as obras, então a obra com mais compromissos pesa mais; a comparação com o período anterior soma as obras que têm período anterior; takt, restrições, pendências e apontamentos de segurança são somados; o tempo médio até a correção pesa cada obra pelo número de pendências resolvidas.
- **"—"**: a obra não tem dado daquele módulo ou daquele número no período. Passe o mouse (ou toque) no traço para ver o motivo: sem plano de longo prazo, sem medição até a data, a obra não usa vagões, sem plano de médio prazo, sem pendências de terminalidade, sem apontamentos de segurança até o fim do período, nenhuma semana apurada no período, sem período anterior para comparar, nenhuma pendência resolvida no período.

## O estado da obra

É o **pior entre os indicadores** da obra, como no selo do cartão da lista de obras: Em dia, Atenção ou Crítico, sempre com o texto ao lado da cor. Só contam os módulos presentes e visíveis: um quadro desmarcado em "Quadros" ou um módulo que você não pode abrir não puxa o estado. A terminalidade e a segurança do trabalho não mudam o estado: um apontamento aberto há mais de 7 dias aparece em vermelho na coluna "> 7 dias", mas não deixa a obra em "Atenção". "Sem apuração" aparece só quando a obra não tem nenhum indicador com valor.

Os limites do PPC aqui são os do Dashboard geral (verde a partir de 80%, âmbar abaixo de 70%, vermelho abaixo de 60%), aplicados ao número **arredondado** que aparece na tela: 69,6% aparece como 70% e não conta como abaixo de 70%. O número é o PPC do período; o selo da lista de obras olha a última semana apurada, então os dois podem diferir.

## Obras que não entram na tabela

Obra que só começou **depois** do período (a primeira semana com linha na planilha da semana é posterior ao sábado final) sai da tabela e é citada na linha de escopo. Obra desmarcada em "Obras" também não entra.

No celular, a tabela rola de lado com a coluna da obra fixa.`,
  },
  {
    id: 'dashboard-geral-curto-prazo-comparado',
    title: 'Curto prazo comparado: PPC por obra, obra em início, mapa de calor, causas e empreiteiros',
    summary:
      'Barras do PPC do período por obra com a linha dos 70%, obra em início, mapa de calor, causas somando as obras e empreiteiros em várias obras.',
    keywords: [
      'ppc do período por obra',
      'obra em início',
      'mapa de calor',
      'evolução do ppc',
      'causas somando as obras',
      'empreiteiros em mais de uma obra',
      'empresa em várias obras',
      'faixas de cor do ppc',
      'linha dos 70%',
      'posição da obra',
    ],
    screen: 'dashboard-geral',
    body: `## PPC do período por obra

Uma barra por obra com o **PPC do período**: cumpridos ÷ assumidos das semanas apuradas do período, somando as linhas. As obras ficam em ordem, da maior para a menor, com a posição de cada uma ("1º", "2º"...); empate exato divide a posição (1º, 1º, 3º). Duas linhas verticais ajudam a ler: a de **alerta dos 70%** e a do **consolidado** (todas as obras somadas). Passe o mouse numa barra para ver quantos compromissos e quantas semanas apuradas entram na conta.

**Faixas de cor do PPC** no Dashboard geral, sempre com o número escrito:

- **80% ou mais**: verde;
- **abaixo de 70%**: âmbar, com o aviso "abaixo de 70%";
- **abaixo de 60%**: vermelho;
- entre 70% e 80%: sem cor de alerta.

As faixas valem para o número arredondado que aparece: 69,6% aparece como 70% e não fica âmbar.

## Obra "em início"

Obra com **menos de 4 semanas apuradas** até o fim do período fica "em início": aparece no fim, com a barra hachurada e **sem posição**, a mesma regra do ranking do PDF do fechamento. Poucas semanas não dão base para comparar. A frase de resumo diz quais obras estão em início.

A posição aqui é pelo **PPC do período**, entre as obras escolhidas em "Obras". O ranking da aba 0 é outro: ordena todas as obras ativas pelo PPC geral até a semana. Por isso as posições podem não coincidir.

## Evolução do PPC (mapa de calor)

Uma tabela com **uma linha por obra que tem curto prazo** e **uma coluna por período da série** (12 semanas, 12 meses, 8 trimestres, todos os anos ou o agrupamento do Personalizado). Cada célula tem o PPC daquele período naquela obra, num tom de azul que escurece com o PPC. A coluna do período escolhido fica destacada (no Personalizado, nenhuma coluna é destacada, porque o período é o intervalo inteiro); célula hachurada é período só com semana em aberto; célula vazia é obra sem linha naquele período. A última linha, "Todas", soma as linhas das obras coluna a coluna.

O mapa de calor substitui as linhas sobrepostas, que ficam difíceis de separar com mais de quatro obras.

## Causas no período, somando as obras

O Pareto das linhas com Não de todas as obras no período, da causa mais frequente para a menos. As causas que somam 80% dos não cumpridos ficam em vermelho. Ao lado de cada causa, **a obra que mais contribui** com ela e quanto. Linhas importadas das planilhas antigas sem causa aparecem como "Causa não informada".

## Empreiteiros em mais de uma obra

As empresas que aparecem na coluna **Empresa** da planilha da semana de **duas obras ou mais** no período, da que tem mais linhas para a que tem menos. Para cada uma, o PPC dela em cada obra e no total. O nome é comparado sem acento nem maiúscula ("Elétrica São José" e "eletrica sao jose" são a mesma empresa), e aparece na grafia que tem mais linhas; grafias diferentes ("Elétrica S. José") contam como empresas diferentes. Corrija o nome na planilha da semana (aba 1.3) para elas se juntarem.

Com o filtro "Empreiteiro" do topo marcado, o quadro mostra só as empresas escolhidas.`,
  },
  {
    id: 'dashboard-geral-outros-quadros',
    title: 'Longo prazo, vagões, médio prazo, terminalidade e segurança no Dashboard geral',
    summary: 'O que cada quadro compara entre as obras, o que é somado no período e o que é retrato no sábado final, e as obras sem dado.',
    keywords: [
      'medido e planejado por obra',
      'avanço no período',
      'prazo contra a linha de base',
      'vagões por status nas obras',
      'restrições vencidas por obra',
      'tarefas do plano do mês por obra',
      'pendências abertas e resolvidas no período',
      'responsáveis terceiros',
      'retrato no sábado final',
      'somado no período',
      'obras sem dado',
      'segurança do trabalho no dashboard geral',
      'apontamentos de segurança por obra',
      'tst',
      'graves',
      'apontamentos abertos há mais de 7 dias',
      'risco por consequência',
    ],
    screen: 'dashboard-geral',
    body: `## Somado no período ou retrato no sábado final

Cada número do Dashboard geral (e da aba 0 fora da escala semanal) é de um de dois tipos, e o cartão ou a coluna diz qual ("no período" ou "em 31/10"):

- **Somado no período**: compromissos e PPC, causas, pendências abertas e resolvidas, apontamentos de segurança feitos e finalizados, e o avanço físico do período (medido no fim menos medido no início, contra o planejado no mesmo intervalo).
- **Retrato no sábado final**: avanço acumulado medido × planejado, status dos vagões, takt vencido, restrições vencidas, tarefas do plano do mês daquele sábado, pendências em aberto, apontamentos de segurança em aberto e abertos há mais de 7 dias.

Cada quadro aparece quando o dado dele chega; se a leitura de um módulo falhar, só aquele quadro fica indisponível. Embaixo de cada quadro, a lista das **obras sem dado** dele ("Sem plano de longo prazo: …").

## Longo prazo (aba 1.1)

- **Medido × planejado por obra**: a última medição até o sábado final contra o planejado nessa data pela linha de base mais recente (sem linha de base, pelo plano vivo), e o **desvio** em pontos percentuais. Atrás do planejado fica em âmbar; mais de 10 p.p. atrás, em vermelho, as mesmas faixas da aba 0.
- **Avanço no período**: quanto cada obra avançou dentro do período (medido no fim menos o medido na véspera, o domingo antes da segunda-feira inicial) contra o que o plano previa para o mesmo intervalo, em pontos percentuais. Sem medição antes do período, conta o medido no fim.
- **Prazo contra a linha de base**: o término do plano vivo contra o da linha de base, em dias; positivo é atraso.

## Vagões (Planejamento de vagão, aberto pela aba 1.1)

No sábado final: os vagões de cada obra por status (não iniciado, em produção, com restrição, terminal) numa barra, o **takt vencido** e as **restrições vencidas**. Obra que não usa vagões mostra "—".

## Médio prazo (aba 1.2)

O plano vivo do mês do sábado final, em cada obra: tarefas concluídas, em andamento e não iniciadas (só as tarefas de detalhe, sem os resumos), **atrasadas** (término previsto antes do sábado e menos de 100%), a **variação do término contra a linha de base** em dias úteis (sem linha de base, não aparece) e as **equipes superalocadas**.

## Terminalidade (aba 2.1)

- **Abertas × resolvidas no período**, por obra.
- **Em aberto no sábado final** e a diferença para a véspera do período (subiu ou desceu). A conta fecha: em aberto no início + abertas − resolvidas = em aberto no fim.
- **% resolvidas** desde a primeira pendência da obra até o sábado final, como a aba 2.1 mostra.
- **Tempo médio até a correção**, em dias, das pendências resolvidas no período. Sem resolvida no período, "—". No consolidado, a média pesa cada obra pelo número de pendências resolvidas.
- **Responsáveis terceiros com mais pendências em aberto**, somando as obras: até 6 responsáveis, com quantas pendências cada um tem em cada obra. O nome é o digitado no "Responsável terceiro" de cada obra, pareado sem acento nem maiúscula e mostrado na grafia que tem mais pendências; as pendências sem responsável ficam juntas em "Sem responsável".

As fotos das pendências não são carregadas nesta página; elas ficam na aba 2.1 de cada obra.

## Segurança do trabalho (aba 3.1)

O quadro 6 compara a vistoria dos técnicos de segurança (TST) das obras. Existe desde 06/11/2026 no Dashboard geral e, desde 12/11/2026, também na aba 0 de cada obra. Desde 12/11/2026 aparece só para quem tem o módulo "Segurança do trabalho" liberado (antes, para todos com a obra), como a aba 3.1, e entra ou sai pela chave "Segurança" de "Quadros".

Que data conta:

- **Feitos**: pela data do apontamento, dentro do período (a mesma data do filtro de período da aba 3.1).
- **Finalizados**: pela data de correção, dentro do período.
- **Em aberto**: o retrato do sábado final, apontado até ele e não finalizado até ele, com a variação contra a véspera do período. A conta fecha: em aberto no início + feitos − finalizados = em aberto no fim.
- **Abertos há mais de 7 dias**: em aberto no sábado final com mais de 7 dias desde a data do apontamento, contados até o sábado final, ou até hoje se o período ainda está em andamento.
- O período é o mesmo do resto da página, de semanas inteiras: outubro de 2026 vai da segunda 05/10 ao sábado 31/10, e não de 01/10 a 31/10.
- O histórico importado da planilha "SST - Controle geral" conta igual ao lançado no sistema, então dá para olhar meses e trimestres passados.

Os três blocos:

1. **Apontamentos feitos × finalizados no período**: duas barras por obra e, à direita, o em aberto no sábado final (com a variação), os abertos há mais de 7 dias e a média de dias para resolver dos finalizados no período (no consolidado, cada obra pesa pelos finalizados dela).
2. **Risco dos apontamentos feitos no período**: uma barra por obra dividida pela "Risco: consequência", da mais grave para a mais leve (Morte, Severa, Significativa, Leve, Nenhuma, Autuação/Multa), e a linha "Todas". À direita, os **graves** (Morte + Severa) e a parte deles nos feitos da obra.
3. **Tipos com mais apontamentos no período, somando as obras**: até 6 tipos, com o total e a contagem em cada obra. A lista de tipos é a mesma em todas as obras.

Embaixo, as obras sem nenhum apontamento até o fim do período. Com um empreiteiro escolhido no topo, o quadro continua mostrando a vistoria inteira das obras que ficam na tela e avisa "sem recorte de empreiteiro" no subtítulo: a vistoria não registra a empresa responsável. A segurança não muda o estado da obra. As fotos dos apontamentos não são carregadas aqui; ficam na aba 3.1.`,
  },
  {
    id: 'dashboard-geral-controles-e-sst',
    title: 'Controles de obra, restrições, balanço e checklist no Dashboard geral',
    summary:
      'Histograma, produtividade, Quadro de Restrições, IDP e legalização e checklist comparando as obras; dias lançados, cards vencidos e as cores.',
    keywords: [
      'efetivo médio das obras',
      'dias lançados no histograma',
      'dias lançados na produtividade',
      'produção medida por obra',
      'serviços medidos em mais de uma obra',
      'cards vencidos por obra',
      'idp por obra',
      'legalização por obra',
      'checklists vencidos por obra',
      'qual obra não lançou o histograma',
    ],
    screen: 'dashboard-geral',
    body: `## O que entrou em 12/11/2026

Cinco quadros novos no Dashboard geral, além da segurança, que já existia: **Linha de Balanço e legalização** (1.1), **Quadro de Restrições** (1.4), **Histograma** (2.2), **Produtividade** (2.3) e **Checklist de equipamentos** (3.2). Cada um aparece para quem tem o módulo liberado (a Linha de Balanço e a legalização seguem o longo prazo) e pode ser ligado e desligado em "Quadros". Obra que não usa o módulo mostra "—" na tabela e é citada embaixo do quadro.

Esses quadros **não seguem o filtro de Empreiteiro**: mostram sempre a obra inteira, e o subtítulo do quadro avisa quando há empreiteiro escolhido.

## Colunas novas no Comparativo das obras

- **Efetivo médio** (Histograma): a média de pessoas por dia útil lançado no período, com a parcela de empreiteiros embaixo. Na linha do consolidado, a soma do efetivo médio das obras.
- **Dias lançados** (Histograma) e **Dias lançados** (Produtividade): dias úteis do período com lançamento sobre os dias úteis esperados, como "20/22". Dia útil é de segunda a sexta, fora feriado nacional; os dias esperados vão até ontem, porque o dia de hoje ainda pode ser lançado. **90% ou mais em verde, 70% a 89% em âmbar, abaixo em vermelho.** Passe o mouse para ver os dias que faltaram. No consolidado, a soma dos lançados sobre a soma dos esperados.
- **Prod. medida**: lançamentos da produtividade com produção medida sobre os lançamentos do período. No consolidado, a soma das linhas medidas sobre a soma das linhas (a obra com mais lançamentos pesa mais).
- **Cards vencidos** (Restrições): cards em aberto que passaram da entrega, com o total em aberto embaixo.
- **IDP** (Linha de Balanço): o índice de desempenho de prazo na última medição fechada até o fim do período. 1,00 ou mais em dia (verde), de 0,90 a 0,99 atenção (âmbar), abaixo de 0,90 atrasado (vermelho). O IDP não se soma: o consolidado mostra "—".
- **Vencidos** (Checklist): checklists devidos hoje e ainda sem inspeção, sobre os devidos hoje.

## O que cada quadro mostra

- **Linha de Balanço e legalização**: por obra, o real × planejado e o IDP, com a medição e a linha de base usadas e se o peso é por custo ou por duração; e o Gantt de legalização, com marcos concluídos, tarefas atrasadas e o próximo marco. Nenhum valor em reais aparece.
- **Quadro de Restrições**: por obra, os cards em aberto por coluna (a fazer, fazendo, pausado), os vencidos, os de começo atrasado (ainda em "A fazer" depois do "começar até") e, embaixo, concluídos e criados no período. Ao lado, os responsáveis com mais cards vencidos somando as obras. O retrato é no fim do período, ou hoje quando o período está em andamento; pausado conta como aberto.
- **Histograma de mão de obra**: o efetivo médio de cada obra em barras, próprio (ATR e Takt) × empreiteiros, o pico, os dias lançados e os dias que faltaram; a última linha soma as obras.
- **Controle de produtividade**: por obra, lançamentos com produção medida × a medir, homens-dia e dias lançados; e **"Serviços medidos em mais de uma obra"**, com a produção por homem-dia de cada obra lado a lado. O serviço só pareia quando tem o mesmo nome (sem acento nem maiúscula) e a mesma unidade, porque o nome é digitado em cada obra; não há meta por serviço, então a tabela não pinta de bom ou ruim, só destaca a maior de cada linha.
- **Checklist de equipamentos**: por obra, equipamentos ativos, checklists em dia × vencidos e os itens não conformes (NC). Em dia e vencidos são **sempre os de hoje** (diário de hoje, semanal desta semana, mensal deste mês), como na aba 3.2; o período muda só as inspeções e as não conformidades.

## Cartões, frase e estado da obra

Entraram os cartões **Efetivo médio** e **Cards vencidos**, e a frase do topo ganhou uma oração com o efetivo médio somado e os dias lançados. O **estado** da obra (Em dia, Atenção, Crítico) passou a considerar também, como atenção, cards vencidos no Quadro de Restrições e dias lançados abaixo de 70% no histograma ou na produtividade; obra que não usa o módulo não é puxada por ele.

## Resumo semanal por e-mail

Ao lado de "Gerar PDF", administradores veem o botão que envia o resumo semanal para o próprio e-mail na hora. O envio automático é o de sábado de manhã.`,
  },
  {
    id: 'dashboard-geral-pdf',
    title: 'PDF do Dashboard geral: até sete folhas no padrão do fechamento',
    summary:
      'Gerar PDF abre a impressão numa aba nova com escala, período, obras e quadros; A4 paisagem, até sete folhas, rodapé com quem gerou.',
    keywords: [
      'pdf do dashboard geral',
      'pdf das obras',
      'imprimir o comparativo',
      'sete folhas',
      'dashboard geral das obras',
      'folhas do pdf geral',
      'salvar o comparativo em pdf',
      'pdf da segurança do trabalho no geral',
    ],
    screen: 'dashboard-geral',
    body: `## Passo a passo

1. Ajuste "Escala", "Período", "Obras" e "Quadros". O PDF sai exatamente com eles.
2. Clique em **"Gerar PDF"**, no cabeçalho. A página de impressão abre **numa aba nova**, com os filtros no endereço, como o PDF da aba 0.
3. A página espera os quadros chegarem e chama sozinha o diálogo de impressão do navegador. Escolha **"Salvar como PDF"** e confira a orientação em paisagem.

É preciso estar logado; o PDF traz só as obras e os módulos que você vê na tela. O PDF sai pelo computador; no celular a página funciona, mas a impressão não.

## O que sai

- **Papel**: A4 paisagem, no padrão do PDF do fechamento.
- **Cabeçalho**: "DASHBOARD GERAL DAS OBRAS", com a escala e o período.
- **Folha 1**: a frase de resumo, os cartões (até nove, em duas linhas), o Comparativo das obras (com as três colunas de segurança; as colunas de 12/11/2026 saem na folha de controles) e o PPC do período por obra.
- **Folha 2, curto prazo**: a evolução do PPC (mapa de calor), as causas somando as obras e os empreiteiros em mais de uma obra.
- **Folha 3, longo prazo e vagões**: medido × planejado por obra, avanço no período, prazo contra a linha de base, vagões por status e restrições vencidas.
- **Quadro de Restrições e Linha de Balanço** (desde 12/11/2026, depois da folha 3): o IDP de cada obra com real × planejado, o Gantt de legalização (marcos, atrasadas, próximo marco), os cards em aberto por coluna com vencidos e começo atrasado, e os responsáveis com mais cards vencidos.
- **Médio prazo e terminalidade**: tarefas por situação, atrasadas e variação contra a linha de base; pendências abertas × resolvidas e responsáveis terceiros.
- **Controles de obra e SST** (desde 12/11/2026): a segunda tabela do comparativo (efetivo médio, dias lançados no histograma e na produtividade, produção medida, cards vencidos, IDP e checklists vencidos), os serviços medidos em mais de uma obra e os quadros de histograma, produtividade e checklist.
- **Segurança do trabalho** (desde 06/11/2026, no fim): seis números (em aberto no sábado final, com a variação e quantos eram no início; abertos há mais de 7 dias e em quantas obras; feitos no período; finalizados no período; média de dias para resolver; graves, Morte + Severa, com a parte nos feitos) e os três blocos da tela (feitos × finalizados, risco por consequência e tipos com mais apontamentos). O rodapé cita as obras sem apontamentos.
- **Rodapé** de cada folha: o período, as obras, quem gerou e quando, e "Folha N de M".

Só saem as folhas dos quadros presentes: sem longo prazo nem vagões (por falta de acesso, de dado ou por escolha em "Quadros"), a folha 3 não sai; com a chave "Segurança" desmarcada, a folha da segurança não sai. Com tudo presente são sete folhas. Um quadro cujo dado não chegou a tempo sai como indisponível, e o resto do PDF sai normalmente.

## PDF da aba 0

O PDF da aba 0 de cada obra também passou a mostrar a escala e o período no cabeçalho. O PDF do Dashboard geral sai com o recorte de empreiteiro que estiver na tela, e o rodapé diz quais empresas entraram; para recortar por pavimento, gere pela aba 0 da obra.`,
  },
  {
    id: 'dashboard-geral-duvidas-comuns',
    title: 'Dúvidas comuns do Dashboard geral: número diferente, obra que não aparece, traço, parcial, soma',
    summary:
      'Por que o número difere da aba 0 ou do cartão da lista, por que uma obra falta, o que é o traço, o parcial e por que o PPC é soma.',
    keywords: [
      'número diferente da aba 0',
      'obra não aparece no dashboard geral',
      'obra faltando',
      'traço na tabela',
      'mês parcial',
      'soma e não média',
      'média dos ppcs semanais',
      'não vejo o dashboard geral',
      'filtro de empreiteiro no geral',
      'meta de ppc por obra',
      'exportar para planilha',
      'segurança diferente da aba 6',
      'segurança diferente da aba 3.1',
      'segurança do trabalho não aparece',
      'módulo segurança do trabalho',
      'quadro de segurança sumiu',
    ],
    screen: 'dashboard-geral',
    body: `## "O número do Dashboard geral é diferente do da aba 0"

No mesmo período e na mesma escala, o PPC, as pendências e os demais números de uma obra são os mesmos nas duas telas: o cálculo é o mesmo. Quando diferem, confira:

- **O período**: as duas telas abrem em lugares diferentes (o geral em Mensal, no mês mais recente com semana apurada; a aba 0 em Semanal, na semana atual). Clicando na obra pela tabela do geral, a aba 0 abre no mesmo período.
- **Os filtros**: "Pavimento" recorta a aba 0 e não existe no geral; o "Empreiteiro" existe nas duas telas, e só o clique na obra pela tabela do geral leva o recorte junto para a aba 0; aberta por outro caminho, a aba 0 começa sem recorte.
- **A posição**: no geral, a posição é pelo PPC do período entre as obras escolhidas; o ranking da aba 0 ordena todas as obras ativas pelo PPC geral até a semana.
- **O selo da lista de obras**: o cartão da obra na lista de obras olha a última semana apurada, com limites próprios; o estado no geral olha o período escolhido.

## "Uma obra não aparece"

- Ela não está liberada para você: o geral mostra só as obras da sua lista de obras.
- Ela está desmarcada no filtro "Obras".
- Ela só começou depois do período: a primeira semana com linha na planilha da semana é posterior ao sábado final. A linha de escopo cita essas obras. Escolha um período mais recente.

## "Não vejo o item Dashboard geral no menu"

O item e o botão "Comparar obras" aparecem para quem tem duas obras ou mais liberadas, e sempre para admin e desenvolvedor. Com uma obra só, use a aba 0 dela. Para ter mais obras liberadas, fale com o admin.

## "O que significa o traço (—)?"

A obra não tem aquele dado no período. Passe o mouse (ou toque) no traço para ver o motivo: o módulo não tem dado nesta obra (sem plano de longo prazo, não usa vagões, sem plano do mês, sem pendências), nenhuma semana apurada no período, sem período anterior para comparar, sem medição até a data, nenhuma pendência resolvida no período. Um módulo que você não pode abrir nem vira coluna.

## "Por que o período diz parcial?"

O período contém a semana atual, que ainda está em andamento: o mês, o trimestre ou o ano não acabaram. Diz quantas das semanas já foram apuradas. A semana em aberto fica fora do PPC, hachurada. O número de um período parcial muda até o período acabar e as semanas serem apuradas.

## "Por que o PPC do mês é uma soma e não a média das semanas?"

Porque a média trata igual uma semana com poucos compromissos e uma com muitos. Exemplo: semana A, 10 compromissos e 10 cumpridos (100%); semana B, 90 compromissos e 45 cumpridos (50%). A média das semanas daria 75%; a soma dá 55 de 100, **55%**, que é a proporção real do que foi assumido e cumprido. É o mesmo cálculo do PPC geral e do painel do PDF do fechamento.

O consolidado das obras segue a mesma regra: soma as linhas de todas as obras, então a obra com mais compromissos pesa mais. Já a linha da média da série continua sendo a média simples dos períodos mostrados.

## "Dá para filtrar por empreiteiro aqui?"

Sim, desde 05/11/2026: o filtro "Empreiteiro", ao lado de "Obras", lista as empresas de todas as obras escolhidas (coluna Empresa da planilha da semana, responsável terceiro da terminalidade e empresa das equipes), com o nome comparado sem acento nem maiúscula. Com o recorte:

- saem do comparativo as obras onde nenhuma das empresas escolhidas aparece, e a linha de cima diz quais;
- o PPC do período, as causas, o mapa de calor, os vagões, o médio prazo e a terminalidade passam a contar só as linhas, tarefas e pendências dessas empresas, como o mesmo filtro faz na aba 0;
- o longo prazo e o PPC geral (com a regra de "em início") continuam considerando a obra inteira: a medição é por serviço, e o PPC geral é o da obra;
- "Empreiteiros em mais de uma obra" mostra só as empresas escolhidas;
- clicar numa obra abre a aba 0 dela no mesmo período e com o mesmo recorte, e o PDF sai com ele.

Grafias diferentes de um mesmo nome ("Elétrica S. José" e "Elétrica São José") contam como empresas diferentes: corrija o nome na planilha da semana para elas se juntarem.

A segurança do trabalho não se recorta por empreiteiro: a vistoria não registra a empresa responsável. Com o recorte, o quadro de segurança mostra a vistoria inteira das obras que continuam na tela e diz "sem recorte de empreiteiro".

## "O número da segurança é diferente da aba 3.1"

- **O período**: o geral usa semanas inteiras (outubro de 2026 = 05/10 a 31/10); o filtro de período da aba 3.1 usa as datas exatas de "Início" e "Término".
- **Finalizados**: o geral conta pela data de correção dentro do período; o filtro da aba 3.1 é sempre pela data do apontamento. Um apontamento de setembro finalizado em outubro é finalizado de outubro aqui, e não aparece na aba 3.1 filtrada em outubro.
- **Abertos há mais de 7 dias**: aqui, contados até o sábado final do período (ou até hoje, se o período está em andamento); na aba 3.1, sempre até hoje.
- **Os filtros da aba 3.1** (situação, tipo, consequência, probabilidade, local, busca) não existem no geral: aqui entra a vistoria inteira de cada obra.

## "A segurança do trabalho não aparece"

- Na **aba 0** de cada obra ela ainda não existe: nesta etapa, o quadro de segurança está só no Dashboard geral.
- Desde 12/11/2026 o quadro, as colunas e o cartão de segurança só aparecem para quem tem o módulo "Segurança do trabalho" liberado (Configurações → Usuários → Módulos). Quem já usava a vistoria foi mantido; usuário novo começa sem. Peça a liberação a um administrador.
- No geral, confira a chave "Segurança" em "Quadros".
- Obra sem nenhum apontamento até o fim do período mostra "—" nas colunas de segurança e é citada embaixo do quadro.
- "A segurança do trabalho não está disponível neste ambiente." quer dizer que o banco ainda não tem a aba 3.1; se a leitura falhar, só o quadro de segurança fica indisponível e o resto da página abre normalmente.

## O que ainda não existe

Ficaram para depois, fora desta entrega: meta de PPC própria por obra (hoje a referência é a mesma para todas, 70% e 80%), exportar o comparativo para planilha, comparar uma obra com a média das outras dentro da aba 0 e o quadro de segurança do trabalho na aba 0.`,
  },
];

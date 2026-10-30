import type { ManualSection } from './types';

/** Visão geral do Obra 360 e glossário dos termos de planejamento (29/10/2026). As telas em si estão
 * nos arquivos por módulo; aqui fica o que a pessoa precisa saber antes de qualquer tela. */
export const sections: ManualSection[] = [
  {
    id: 'geral-o-que-e-o-obra-360',
    title: 'O que é o Obra 360',
    summary: 'O que o sistema faz, para quem é, como a obra está organizada em cinco abas e o grupo Apoio.',
    keywords: [
      'obra 360',
      'o que é o sistema',
      'para que serve',
      'visão geral',
      'como funciona o sistema',
      'abas',
      'níveis',
      'apoio',
      'começar',
      'primeiros passos',
      'atr',
    ],
    screen: 'geral',
    body: `## O que é o Obra 360

O Obra 360 é o sistema de gestão de projetos e obras da ATR Incorporadora. Ele substitui as planilhas que a equipe usava (planejamento de longo prazo, cronograma do mês no MS Project, planilha semanal de produção no Google Sheets e lista de pendências de terminalidade) por um lugar só, com os dados de cada obra ligados entre si. O endereço é https://obra360-atr.vercel.app e a entrada é com a conta Google da empresa.

## Como uma obra está organizada

Ao abrir uma obra, a barra lateral mostra o nome dela e **cinco abas numeradas**, na ordem em que o planejamento desce do macro para a semana:

1. **Cronograma de longo prazo** — o plano macro da obra: fluxograma de serviços que vira Linha de Balanço, linhas de base, medições e o módulo de restrições.
2. **Planejamento por vagões** — os períodos de takt (vagões) com as atividades, a terminalidade de cada período e as liberações; é onde a execução é registrada.
3. **Cronograma de médio prazo** — um cronograma por mês, com horizonte de três meses, no layout do MS Project (tabela e Gantt), recursos e linha de base.
4. **Cronograma de curto prazo** — a planilha semanal de produção: o que cada empresa e equipe faz na semana, o Status (Sim/Não), a causa de não cumprimento e o PPC.
5. **Terminalidade** — a lista de pendências por pavimento, apartamento e empreiteiro, com fotos de antes e depois, PDF e modo de campo para o celular.

Abaixo das abas fica o grupo **Apoio**: Modelo federado, Arquivos IFC, Dívidas, Integrações (Prevision) e Configurações da obra. Fora da obra ficam a lista de obras (/obras) e, para administradores, Configurações (/configuracoes), com usuários, acessos, banco de dados e o painel do Agente de IA.

## O que aparece para cada pessoa

Nem todo mundo vê as cinco abas. Desde o go-live (07/10/2026), **Cronograma de curto prazo, Terminalidade, Configurações da obra e a lista de obras estão abertos a todos** que têm acesso à obra. As outras abas (longo prazo, vagões, médio prazo) e as telas de apoio Modelo federado, Arquivos IFC, Dívidas e Integrações ainda estão em desenvolvimento e aparecem só para administradores e para quem o administrador liberou módulo a módulo em Configurações. Se uma aba não aparece para você, é isso: peça ao administrador para liberar o módulo. Além disso, cada pessoa só vê as obras que um administrador liberou para ela, e o papel (consulta, planejador, gestor ou admin) decide o que pode editar.

## Ajuda dentro do sistema

Toda tela tem, no cabeçalho, o botão **"?" (Como usar)**, que escurece a tela e explica cada botão e campo, um por vez, sem alterar nada. O cabeçalho da aba traz uma linha dizendo o que ela responde e o botão **"Como funciona"**, com a explicação longa. E há a assistente **Claudia** (botão com o nome dela no cabeçalho de toda tela da obra), que lê os níveis do planejamento, aponta o que não bate entre eles, propõe edições na planilha da semana e responde dúvidas sobre o sistema.`,
  },
  {
    id: 'geral-niveis-de-planejamento',
    title: 'Como os níveis de planejamento se relacionam',
    summary:
      'Longo, médio e curto prazo e terminalidade: o que cada um responde, de onde vem o dado e como o sistema confere um contra o outro.',
    keywords: [
      'níveis de planejamento',
      'longo prazo',
      'médio prazo',
      'curto prazo',
      'relação entre os níveis',
      'três níveis',
      'last planner',
      'hierarquia',
      'macro',
      'mês',
      'semana',
      'cobertura',
      'o plano do mês não bate com a semana',
    ],
    screen: 'geral',
    body: `## Três níveis e um fecho

O planejamento segue a lógica do Last Planner System, descendo do macro para a semana:

- **Longo prazo (aba 1)** responde *quando cada serviço passa por cada pavimento* na obra inteira. É o plano macro: fluxograma de serviços, Linha de Balanço, ritmo, equipes por serviço, linha de base e medição do avanço físico. Dele saem os vagões.
- **Vagões (aba 2)** são os períodos de takt em que o longo prazo é fatiado. Cada vagão tem as atividades previstas para aquele período, com responsável, local, datas, percentual executado, critérios de terminalidade, pendências, restrições e liberação para o período seguinte.
- **Médio prazo (aba 3)** responde *o que a obra faz nos próximos três meses, semana a semana*, no detalhe de um cronograma do MS Project: tarefas, durações, predecessoras, recursos, caminho crítico e linha de base do mês. Há um cronograma por mês, e o seguinte nasce como cópia do anterior.
- **Curto prazo (aba 4)** responde *o que cada empresa e equipe se comprometeu a fazer nesta semana e se fez*. É a planilha de produção, com Status Sim/Não, causa de não cumprimento e PPC (percentual de compromissos cumpridos).
- **Terminalidade (aba 5)** fecha a obra apartamento por apartamento: a lista de pendências com fotos de antes e depois, por pavimento, apartamento e empreiteiro.

## Os níveis são planilhas independentes

Decisão de projeto do sistema: **cada nível se sustenta sozinho**. A planilha da semana não exige que a tarefa exista no plano do mês, e o plano do mês não exige que a tarefa exista no longo prazo. O vínculo formal entre uma linha e a atividade de cima é opcional e quase nunca é preenchido. Isso permite que a obra use só o curto prazo, por exemplo, sem preencher o resto.

Por isso, quando o sistema compara um nível com outro, ele **pareia pelo nome** da atividade (sem acento, maiúsculas ou espaços repetidos; um nome que contém o outro também casa). É uma conferência, não um vínculo: erra quando a mesma frente tem nomes diferentes em cada nível, e a tela diz isso. Ela sugere, nunca bloqueia, nunca cria linha sozinha.

Onde a conferência aparece:

- Na aba 3, a **cobertura entre níveis**: frentes da janela de três meses sem linha no plano do mês, e linhas do plano sem nenhuma semana na planilha.
- No painel da Claudia, o **Radar** e a **Leitura**: tarefa do plano do mês prevista para esta semana sem linha na planilha, frente atrasada nos três níveis ao mesmo tempo, equipe sobrecarregada que já falhou por mão de obra, PPC baixo já refletido no avanço do macro.

## O fio que liga longo prazo e vagões

O único lugar em que um nível alimenta outro de verdade é o botão **"Gerar vagões"** do Planejador de longo prazo: cada serviço × pavimento do plano vira atividade nos vagões da cauda ainda não liberada de uma sequência. Vagões já liberados nunca mudam. Gerar de novo sem ter mudado o plano mantém vagões, avanço e restrições como estão.`,
  },
  {
    id: 'geral-glossario',
    title: 'Glossário: takt, vagão, PPC, linha de base, restrição e outros termos',
    summary:
      'Significado dos termos usados nas telas: takt, vagão, Linha de Balanço, PPC, linha de base, restrição, pendência, dívida, terminalidade, folga, marco.',
    keywords: [
      'o que é',
      'o que significa',
      'glossário',
      'takt',
      'vagão',
      'linha de balanço',
      'ppc',
      'linha de base',
      'restrição',
      'pendência',
      'dívida',
      'terminalidade',
      'caminho crítico',
      'folga',
      'marco',
      'predecessora',
      'lead time',
      'look ahead',
      'curva s',
      'semana da obra',
      'capacidade',
    ],
    screen: 'geral',
    body: `## Termos do planejamento, como o sistema os usa

- **Takt** — o ritmo da obra: o tempo que cada frente leva para passar por um local (um pavimento, por exemplo) antes de a próxima entrar. No sistema, o takt é dado em dias, corridos ou úteis, por sequência.
- **Sequência de produção** — a fila de vagões de uma obra, com takt padrão, calendário e data de início.
- **Vagão** — um **período de tempo** da sequência (um ciclo de takt), não um pavimento nem um local. Cada vagão tem número, datas planejadas, predecessor e sucessor, responsáveis e as atividades daquele período. Os locais pertencem às atividades, não ao vagão.
- **Atividade** — o serviço previsto num vagão, com local, responsável, datas, peso, percentual executado, status e critérios de terminalidade.
- **Linha de Balanço (LOB)** — o gráfico em que cada serviço é uma linha avançando pelos pavimentos ao longo do tempo. Responde *onde* a obra está adiantada ou atrasada; a curva de avanço responde *quanto*.
- **Curva de avanço acumulado (curva S)** — planejado contra executado ao longo do tempo. O planejado assume avanço linear de cada serviço entre início e término; o executado sai das medições datadas e para em hoje.
- **Linha de base** — uma cópia congelada do plano num momento, para comparar o que foi prometido com o que está acontecendo. Existe no longo prazo (Planejador e vagões) e no médio prazo ("Definir linha de base" congela o plano do mês). Reprogramar o plano atual nunca altera uma linha de base já salva.
- **Medição** — o percentual executado lançado com data. O valor atual e o histórico ficam separados, para a curva de avanço ser calculada sobre a série.
- **Plano do mês** — o cronograma de médio prazo de um mês, com horizonte de três meses. Um item com subitens é **resumo**: suas datas e avanço vêm dos subitens.
- **Predecessora** — a tarefa que precisa acontecer antes. No médio prazo, na sintaxe do Project: TI (término-início), II (início-início), TT (término-término), IT (início-término), com defasagem em dias úteis (d) ou corridos (dd).
- **Caminho crítico** — a cadeia de tarefas sem folga: qualquer atraso nela atrasa o término. Aparece em vermelho no Gantt do médio prazo.
- **Folga total e folga livre** — quanto uma tarefa pode atrasar sem atrasar o término do cronograma (total) ou a tarefa seguinte (livre).
- **Marco** — tarefa de duração zero, que marca uma data (entrega, vistoria).
- **Prazo final** — no médio prazo, a data limite de uma tarefa: não reprograma, só reduz a folga e acende o indicador quando o término passa dela.
- **Restrição** — algo que precisa ser resolvido antes de a frente começar: projeto, material, equipamento, contratação, liberação. Vive no quadro de três colunas (identificada, em tratativa, resolvida) do longo prazo e dos vagões. Pode ter **lead time**: o prazo de obtenção em dias, que faz o sistema calcular o limite de resolução a partir do início previsto da atividade.
- **Pendência** — no vagão, um item de terminalidade que falta fechar (com responsável, prazo e se bloqueia a terminalidade). Na aba 5, a pendência de acabamento por apartamento, com fotos.
- **Dívida** — uma pendência que passou de um vagão para o seguinte por meio de uma liberação excepcional. Pode ser própria ou herdada.
- **Terminalidade** — o vagão (ou o apartamento) estar de fato terminado: critérios confirmados e pendências resolvidas. **Liberação** é a passagem para o vagão seguinte: inicial, normal (terminalidade cumprida) ou excepcional (com justificativa e dívidas).
- **PPC (Percentual de Planos Concluídos)** — na planilha da semana, compromissos cumpridos (Status Sim) divididos pelos compromissos assumidos. Nunca é a média dos percentuais executados. Linha sem apontamento conta como não apurada.
- **Causa de não cumprimento** — a razão escolhida de uma lista fechada quando o Status é Não. O **Pareto de causas** ordena as causas pelo peso nas falhas.
- **Semana da obra** — o número cumulativo da semana, contado a partir da **Semana 1** definida em Configurações da obra. A planilha de origem da equipe pode ter outra origem de contagem.
- **Empreiteiro, equipe e capacidade** — a empresa contratada, a equipe dela e quantas atividades simultâneas ela aguenta por semana (capacidade). O cadastro fica em Configurações da obra e alimenta o médio e o curto prazo; a planilha da semana aceita empresa e equipe novas digitadas na linha.
- **Look Ahead** — a janela dos próximos meses (três, no sistema) vista como lista de trabalho: atividade, vagão, local, período, equipe e percentual.`,
  },
];

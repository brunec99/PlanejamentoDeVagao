import type { ManualSection } from './types';

/** Visão geral do Obra 360 e glossário dos termos de planejamento (29/10/2026). As telas em si estão
 * nos arquivos por módulo; aqui fica o que a pessoa precisa saber antes de qualquer tela. */
export const sections: ManualSection[] = [
  {
    id: 'geral-o-que-e-o-obra-360',
    title: 'O que é o Obra 360',
    summary:
      'O que o sistema faz, o menu da obra (0 Dashboard, 1 Prazo, 2 Controles de obra, 3 SST, Apoio) e a correspondência entre os números antigos e novos das abas.',
    keywords: [
      'obra 360',
      'o que é o sistema',
      'para que serve',
      'visão geral',
      'como funciona o sistema',
      'abas',
      'menu',
      'numeração das abas',
      'número antigo da aba',
      'renumeração',
      'aba mudou de número',
      'grupos do menu',
      'prazo',
      'controles de obra',
      'sst',
      'aba 0',
      'aba 1',
      'aba 2',
      'aba 3',
      'aba 4',
      'aba 5',
      'aba 6',
      'aba 7',
      'aba 8',
      'aba 9',
      'aba 1.1',
      'aba 1.2',
      'aba 1.3',
      'aba 1.4',
      'aba 2.1',
      'aba 2.2',
      'aba 2.3',
      'aba 3.1',
      'aba 3.2',
      '1.1',
      '1.2',
      '1.3',
      '1.4',
      '2.1',
      '2.2',
      '2.3',
      '3.1',
      '3.2',
      'quadro de restrições',
      'lista de pendência',
      'planejamento de vagão',
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

Ao abrir uma obra, a barra lateral mostra o nome dela, o **Dashboard da obra** no topo e **três grupos numerados**, cada um com as suas abas (numeração em vigor desde 12/11/2026):

- **0 · Dashboard da obra** — o resumo da obra em quadros, um por módulo. Fica no topo, fora dos grupos.
- **1 · Prazo** — o planejamento, descendo do macro para a semana:
  - **1.1 Cronograma de longo prazo** — o plano macro da obra: fluxograma de serviços que vira Linha de Balanço, linhas de base e medições. É de dentro dela que se abre o **Planejamento de vagão** (botão "Planejamento de vagão", para quem tem o módulo Vagões): os períodos de takt (vagões) com as atividades, a terminalidade de cada período e as liberações. O Planejamento de vagão não tem mais item nem número no menu.
  - **1.2 Cronograma de médio prazo** — um cronograma por mês, com horizonte de três meses, no layout do MS Project (tabela e Gantt), recursos e linha de base.
  - **1.3 Cronograma de curto prazo** — a planilha semanal de produção: o que cada empresa e equipe faz na semana, o Status (Sim/Não), a causa de não cumprimento e o PPC.
  - **1.4 Quadro de Restrições** — o quadro de cards (Kanban) com prazo, responsável, conversa e checklists (antes "Lista de pendência"). Tem item próprio no menu e o endereço /obras/{obraId}/restricoes.
- **2 · Controles de obra**:
  - **2.1 Terminalidade** — a lista de pendências por pavimento, apartamento e empreiteiro, com fotos de antes e depois, PDF e modo de campo para o celular.
  - **2.2 Histograma de mão de obra** — o efetivo diário da obra.
  - **2.3 Controle de produtividade** — a produção do dia por serviço e equipe e a produção por homem-dia.
- **3 · SST** (segurança do trabalho):
  - **3.1 Vistoria de segurança** (o módulo "Segurança do trabalho") — a vistoria dos técnicos de segurança (TST): apontamentos de risco com foto, finalizados com a foto da correção, PDF e modo de campo. Só TST e admin lançam e finalizam; os demais que têm o módulo consultam.
  - **3.2 Checklist de equipamentos** — inspeções diária, semanal e mensal dos equipamentos; o operador preenche pelo link ou QR do equipamento, sem login.

Abaixo dos grupos fica o **Apoio**: Modelo federado, Arquivos IFC, Dívidas, Integrações (Prevision) e Configurações da obra. Fora da obra ficam a lista de obras (/obras) e, para administradores, Configurações (/configuracoes), com usuários, acessos, banco de dados e o painel do Agente de IA.

## Números antigos das abas (até 12/11/2026)

Até 12/11/2026 as abas eram numeradas de 0 a 9, sem grupos. Quando alguém citar o número antigo, traduza assim:

| Número antigo | Hoje |
| --- | --- |
| aba 0, Dashboard da obra | continua aba 0 |
| aba 1, Cronograma de longo prazo | aba 1.1 |
| aba 2, "Planejamento de vagão e lista de pendência" | dividiu-se: a Lista de pendência virou o **Quadro de Restrições, aba 1.4**; o **Planejamento de vagão** saiu do menu, ficou sem número e abre pelo botão "Planejamento de vagão" da aba 1.1 |
| aba 3, Cronograma de médio prazo | aba 1.2 |
| aba 4, Cronograma de curto prazo | aba 1.3 |
| aba 5, Terminalidade | aba 2.1 |
| aba 6, Segurança do trabalho | aba 3.1 (no menu, "Vistoria de segurança") |
| aba 7, Histograma de mão de obra | aba 2.2 |
| aba 8, Controle de produtividade | aba 2.3 |
| aba 9, Checklist de equipamentos | aba 3.2 |

Em uma linha: antiga aba 1 = 1.1; antiga aba 2 = 1.4 (quadro) e botão na 1.1 (vagão); antiga aba 3 = 1.2; antiga aba 4 = 1.3; antiga aba 5 = 2.1; antiga aba 6 = 3.1; antiga aba 7 = 2.2; antiga aba 8 = 2.3; antiga aba 9 = 3.2. Um número com ponto ("1.3", "2.1") já é o novo. O quadro e o vagão não são mais duas visões da mesma aba: o seletor entre eles deixou de existir. O endereço antigo do quadro (/obras/{obraId}/vagoes?visao=pendencias) redireciona para o novo, e "?card=<id>" continua abrindo o card.

## O que aparece para cada pessoa

Nem todo mundo vê todas as abas. **Abertos a todos** que têm acesso à obra ficam só a lista de obras, a aba **0 "Dashboard da obra"** (cada quadro só aparece para quem pode abrir o módulo de origem) e as **Configurações da obra**. Todo o resto são **módulos liberados por pessoa**: longo prazo, vagões, médio prazo, **curto prazo** e **terminalidade** (estes dois desde 08/11/2026; antes eram abertos a todos), histograma, controle de produtividade, **Quadro de Restrições (1.4)**, **Segurança do trabalho (a Vistoria de segurança, 3.1)** e **Checklist de equipamentos (3.2)** (estes três desde 12/11/2026; antes a segurança era aberta a todos para consulta e o quadro vinha junto com o módulo Vagões), e as telas de apoio Modelo federado, Arquivos IFC, Dívidas e Integrações. Eles aparecem só para administradores, desenvolvedores e quem o administrador liberou módulo a módulo em Configurações → Usuários → Módulos. Quem já usava em 12/11/2026 foi mantido (todo não-admin ganhou segurança e checklist; quem tinha Vagões ganhou o Quadro de Restrições); usuário novo começa sem nenhum. Se uma aba não aparece para você, é isso: peça ao administrador para liberar o módulo. Abrir o endereço de uma aba não liberada leva ao Dashboard da obra. O link ou QR do operador do Checklist de equipamentos continua sem login e não depende de módulo. Além disso, cada pessoa só vê as obras que um administrador liberou para ela, e o papel (consulta, TST, planejador, gestor ou admin) decide o que pode editar.

## Ajuda dentro do sistema

Toda tela tem, no cabeçalho, o botão **"?" (Como usar)**, que escurece a tela e explica cada botão e campo, um por vez, sem alterar nada. O cabeçalho da aba traz uma linha dizendo o que ela responde e o botão **"Como funciona"**, com a explicação longa. E há a assistente **Claudia** (botão com o nome dela no cabeçalho de toda tela da obra; para administradores, em toda tela do sistema, com Ctrl+J), que lê os níveis do planejamento, aponta o que não bate entre eles, propõe edições na planilha da semana e responde dúvidas sobre o sistema.`,
  },
  {
    id: 'geral-niveis-de-planejamento',
    title: 'Como os níveis de planejamento se relacionam',
    summary:
      'Longo, médio e curto prazo, vagões, Quadro de Restrições e terminalidade: o que cada um responde, de onde vem o dado e como o sistema confere um contra o outro.',
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

- **Longo prazo (aba 1.1)** responde *quando cada serviço passa por cada pavimento* na obra inteira. É o plano macro: fluxograma de serviços, Linha de Balanço, ritmo, equipes por serviço, linha de base e medição do avanço físico. Dele saem os vagões.
- **Vagões** (o Planejamento de vagão, sem número no menu: abre pelo botão "Planejamento de vagão" da aba 1.1) são os períodos de takt em que o longo prazo é fatiado. Cada vagão tem as atividades previstas para aquele período, com responsável, local, datas, percentual executado, critérios de terminalidade, pendências, restrições e liberação para o período seguinte.
- **Médio prazo (aba 1.2)** responde *o que a obra faz nos próximos três meses, semana a semana*, no detalhe de um cronograma do MS Project: tarefas, durações, predecessoras, recursos, caminho crítico e linha de base do mês. Há um cronograma por mês, e o seguinte nasce como cópia do anterior.
- **Curto prazo (aba 1.3)** responde *o que cada empresa e equipe se comprometeu a fazer nesta semana e se fez*. É a planilha de produção, com Status Sim/Não, causa de não cumprimento e PPC (percentual de compromissos cumpridos).
- **Quadro de Restrições (aba 1.4)** acompanha, em cards com prazo e responsável, o que precisa ser resolvido para as frentes andarem; um card pode nascer de uma tarefa do médio prazo ou de um serviço do longo prazo e não trava vagão.
- **Terminalidade (aba 2.1)** fecha a obra apartamento por apartamento: a lista de pendências com fotos de antes e depois, por pavimento, apartamento e empreiteiro.

## Os níveis são planilhas independentes

Decisão de projeto do sistema: **cada nível se sustenta sozinho**. A planilha da semana não exige que a tarefa exista no plano do mês, e o plano do mês não exige que a tarefa exista no longo prazo. O vínculo formal entre uma linha e a atividade de cima é opcional e quase nunca é preenchido. Isso permite que a obra use só o curto prazo, por exemplo, sem preencher o resto.

Por isso, quando o sistema compara um nível com outro, ele **pareia pelo nome** da atividade (sem acento, maiúsculas ou espaços repetidos; um nome que contém o outro também casa). É uma conferência, não um vínculo: erra quando a mesma frente tem nomes diferentes em cada nível, e a tela diz isso. Ela sugere, nunca bloqueia, nunca cria linha sozinha.

Onde a conferência aparece:

- Na aba 1.2, a **cobertura entre níveis**: frentes da janela de três meses sem linha no plano do mês, e linhas do plano sem nenhuma semana na planilha.
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
      'quadro de restrições',
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
- **Restrição** — algo que precisa ser resolvido antes de a frente começar: projeto, material, equipamento, contratação, liberação. É registrada no detalhe do vagão (no Planejamento de vagão, aberto pela aba 1.1) e, enquanto aberta, pode bloquear a execução e a terminalidade dele. O quadro de restrições do longo prazo deixou de existir em 10/11/2026: as restrições que estavam nele foram copiadas como cards do Quadro de Restrições (aba 1.4; até 12/11/2026, "Lista de pendência" da antiga aba 2). Pode ter **lead time**: o prazo de obtenção em dias, que faz o sistema calcular o limite de resolução a partir do início previsto da atividade.
- **Pendência** — no vagão, um item de terminalidade que falta fechar (com responsável, prazo e se bloqueia a terminalidade). Na aba 2.1, a pendência de acabamento por apartamento, com fotos.
- **Dívida** — uma pendência que passou de um vagão para o seguinte por meio de uma liberação excepcional. Pode ser própria ou herdada.
- **Terminalidade** — o vagão (ou o apartamento) estar de fato terminado: critérios confirmados e pendências resolvidas. **Liberação** é a passagem para o vagão seguinte: inicial, normal (terminalidade cumprida) ou excepcional (com justificativa e dívidas).
- **PPC (Percentual de Planos Concluídos)** — na planilha da semana, compromissos cumpridos (Status Sim) divididos pelos compromissos assumidos. Nunca é a média dos percentuais executados. Linha sem apontamento conta como não apurada.
- **Causa de não cumprimento** — a razão escolhida de uma lista fechada quando o Status é Não. O **Pareto de causas** ordena as causas pelo peso nas falhas.
- **Semana da obra** — o número cumulativo da semana, contado a partir da **Semana 1** definida em Configurações da obra. A planilha de origem da equipe pode ter outra origem de contagem.
- **Empreiteiro, equipe e capacidade** — a empresa contratada, a equipe dela e quantas atividades simultâneas ela aguenta por semana (capacidade). O cadastro fica em Configurações da obra e alimenta o médio e o curto prazo; a planilha da semana aceita empresa e equipe novas digitadas na linha.
- **Look Ahead** — a janela dos próximos meses (três, no sistema) vista como lista de trabalho: atividade, vagão, local, período, equipe e percentual.`,
  },
];

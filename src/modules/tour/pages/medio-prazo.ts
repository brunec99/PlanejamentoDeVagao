import type { TourStep } from '../tours';

/* Tour da aba 3. Os passos seguem a ordem visual da tela, seção por seção (?secao=): o tour começa só
 * com os alvos visíveis, então cada seção mostra os seus e pula os das outras, e as colunas ocultas
 * por padrão aparecem no tour quando a pessoa as liga em "Colunas". */
export const steps: TourStep[] = [
  {
    title: 'Aba 3 · Cronograma de médio prazo',
    body: 'Um cronograma por mês, com horizonte de três meses, no layout do MS Project, e seções de apoio à reunião de médio prazo. O tour mostra os botões e campos da seção aberta: troque de seção e refaça o tour para ver os das outras.',
  },
  {
    target: 'tab-header',
    title: 'Cabeçalho da aba',
    body: 'Mostra a aba, a obra e o que faz a seção aberta.',
  },
  {
    target: 'medio-configurar-recursos',
    title: 'Configurar recursos',
    body: 'Leva às configurações da obra, onde se cadastram empreiteiros, equipes e a capacidade semanal que o cronograma e a seção Recursos usam.',
  },
  {
    target: 'tab-ajuda',
    title: 'Como funciona',
    body: 'O "?" ao lado da descrição resume as regras da aba: cada mês nasce como cópia do anterior, as datas se agendam pela rede, a linha de base é um retrato congelado e a conferência entre os níveis é feita pelo nome.',
  },
  {
    target: 'medio-secoes',
    title: 'Seções da aba',
    body: 'Cronograma é o plano do mês; Próximos 90 dias, Equipes, Cobertura, Histórico, Recursos e Linha de base apoiam a reunião. A seção fica no endereço da página: um link compartilhado abre a mesma seção para quem o recebe.',
  },

  // ————— Seção Cronograma —————
  {
    target: 'medio-primeiro-plano',
    title: 'Primeiro cronograma',
    body: 'A obra ainda não tem cronograma de médio prazo. Este botão cria o primeiro: escolha o mês e, se quiser, um nome. Os meses seguintes podem nascer como cópia do anterior.',
  },
  {
    target: 'medio-mes',
    title: 'Mês do cronograma',
    body: 'Troca o cronograma aberto entre os meses criados; a tela abre no mês corrente. À esquerda ficam o horizonte de três meses e de qual mês o plano foi copiado. Com alteração não salva, a troca fica travada: salve ou descarte antes.',
  },
  {
    target: 'medio-salvar',
    title: 'Revisar e salvar',
    body: 'Toda edição fica em rascunho, e o contador diz quantas tarefas mudaram. "Revisar e salvar" lista cada mudança, de antes para depois, e pede o motivo, que fica no histórico da tarefa. Se outra pessoa salvou antes, nada é gravado.',
  },
  {
    target: 'medio-modo-exibicao',
    title: 'Modo de exibição',
    body: 'Troca a visão principal, como no Project: Gráfico de Gantt (tabela e Gantt), Planejador de Equipe, Uso dos Recursos e Planilha de Recursos. O nome da visão aberta fica em pé na borda esquerda, e a escolha fica salva para a próxima vez.',
  },
  {
    target: 'medio-linha-tempo-exibir',
    title: 'Mostrar a Linha do Tempo',
    body: 'Liga ou desliga a faixa da Linha do Tempo acima da visão, como a caixa "Linha do Tempo" da guia Exibir do Project. Vem ligada, vale para todas as visões e a escolha fica salva.',
  },
  {
    target: 'medio-edicao',
    title: 'Liberar edição',
    body: 'A grade abre bloqueada, contra alteração acidental em reunião: "Liberar edição" destrava as células e "Bloquear" trava de novo. As setas ao lado desfazem e refazem as edições do rascunho (Ctrl+Z e Ctrl+Y).',
  },
  {
    target: 'medio-inserir',
    title: 'Inserir tarefa',
    body: 'Cria uma tarefa abaixo da selecionada, no mesmo nível, com 1 dia a partir do início da linha de cima, e já abre o nome para digitar; abaixo de um resumo, vira a primeira subtarefa. Atalho: Insert.',
  },
  {
    target: 'medio-recuo',
    title: 'Recuar e diminuir recuo',
    body: 'Recuar torna as linhas selecionadas subitens da de cima, que vira resumo: datas e avanço passam a vir dos subitens, e ela perde vínculos, datas reais e restrição. Os subitens acompanham. Atalhos: Alt+Shift+→ e ← (ou Cmd+Alt).',
  },
  {
    target: 'medio-vinculos',
    title: 'Vincular e desvincular',
    body: 'Vincular liga em sequência, Término-Início, as tarefas do intervalo selecionado (Shift+setas); resumos ficam de fora. Desvincular numa tarefa tira todos os vínculos dela; num intervalo, só os vínculos entre as tarefas dele.',
  },
  {
    target: 'medio-excluir',
    title: 'Excluir tarefa',
    body: 'Exclui a tarefa selecionada e os subitens dela, depois de confirmar. A exclusão fica no rascunho, dá para desfazer com Ctrl+Z e só vai ao banco em "Revisar e salvar".',
  },
  {
    target: 'medio-informacoes',
    title: 'Informações da tarefa',
    body: 'Abre o diálogo do Project com as abas Geral, Predecessoras, Recursos, Avançado e Anotações da tarefa selecionada. OK aplica tudo de uma vez no rascunho, num passo só do desfazer. Atalhos: Shift+F2, duplo clique na barra ou numa célula que não se edita.',
  },
  {
    target: 'medio-linha-tempo-adicionar',
    title: 'Adicionar à Linha do Tempo',
    body: 'Põe as tarefas selecionadas na Linha do Tempo, ou as tira, se a ativa já estiver nela; resumos e marcos também entram. É edição do rascunho: desfaz com Ctrl+Z e vai ao banco em "Revisar e salvar".',
  },
  {
    target: 'medio-rolar-tarefa',
    title: 'Rolar até a tarefa',
    body: 'Leva o Gantt até a barra da linha selecionada, como o "Rolar até a Tarefa" do Project, e traz a linha para a vista se ela estiver longe. Atalho: Ctrl+Shift+F5.',
  },
  {
    target: 'medio-base-exibida',
    title: 'Linha de base exibida',
    body: 'Escolhe qual linha de base congelada deste plano entra na comparação: as colunas da linha de base, a barra cinza do Gantt e a variação. Abre na mais recente; "Nenhuma" esconde a comparação.',
  },
  {
    target: 'medio-expandir',
    title: 'Expandir e recolher',
    body: 'Abre ou fecha de uma vez todos os resumos; para um só, use a seta ao lado do nome dele. Com busca ou filtro ativo, os dois ficam desligados e cada resultado aparece com os resumos acima dele.',
  },
  {
    target: 'medio-colunas',
    title: 'Colunas',
    body: 'Mostra ou esconde colunas; tardias, folgas, crítica, restrição, prazo final, anotações, decorrido, % alvo, desvio e variação vêm ocultas. Arraste o cabeçalho para mudar a ordem e a borda dele para a largura. "Restaurar padrão" desfaz tudo.',
  },
  {
    target: 'medio-critico',
    title: 'Caminho crítico e folga',
    body: '"Caminho crítico" pinta de vermelho, no Gantt, as tarefas sem folga, que atrasam o fim do plano se atrasarem. "Folga" desenha uma linha fina depois de cada barra, até o término tardio: o quanto a tarefa pode escorregar.',
  },
  {
    target: 'medio-nomes-recursos',
    title: 'Recursos nas barras',
    body: 'Escreve ao lado de cada barra do Gantt o nome da equipe da tarefa, como o Gantt do Project; a empresa só aparece quando duas equipes têm o mesmo nome. Vem ligado e a escolha fica salva.',
  },
  {
    target: 'medio-caminho',
    title: 'Caminho da tarefa',
    body: 'Realça no Gantt as predecessoras e as sucessoras da tarefa selecionada, em cores diferentes, e apaga as demais. As determinantes, que de fato seguram a data, ficam no tom mais forte, e o vínculo determinante fica mais grosso.',
  },
  {
    target: 'medio-reuniao',
    title: 'Modo reunião do cronograma',
    body: 'Acrescenta aos detalhes da tarefa os botões Anterior e Próxima e a marca "Revisado nesta reunião", para percorrer o plano linha a linha. É diferente do Modo reunião do topo da tela, que só aumenta o texto para projetar.',
  },
  {
    target: 'medio-filtros',
    title: 'Buscar e filtrar',
    body: 'A busca procura no nome, no recurso e nas anotações. Os filtros deixam só uma situação (atrasadas, críticas, prazo perdido, fora do horizonte, alteradas…) ou um recurso. Com filtro ativo, inserir, recuar, vincular e excluir ficam desligados.',
  },
  {
    target: 'medio-referencia',
    title: 'Referência do % alvo',
    body: 'Aparece com a coluna % alvo à mostra. É a data contra a qual se calcula quanto de cada tarefa já deveria estar feito pelo tempo decorrido. Abre em hoje.',
  },
  {
    target: 'medio-atalhos',
    title: 'Atalhos do teclado',
    body: 'O "?" lista os atalhos da grade, no jeito do Project: F2 ou Enter edita, Insert insere, Alt+Shift+setas recua, Ctrl+F2 vincula, Shift+F2 abre as Informações, Ctrl+Shift+F5 rola até a tarefa, Ctrl+C e Ctrl+V copiam e colam, Ctrl+Z e Ctrl+Y desfazem e refazem.',
  },
  {
    target: 'medio-linha-do-tempo',
    title: 'Linha do Tempo',
    body: 'As tarefas marcadas, com Início e Término do projeto nas pontas e os marcos embaixo. A moldura é o trecho que o Gantt mostra: arraste-a para rolar o Gantt. Clique numa tarefa para selecioná-la; o botão direito rola até ela ou a tira da faixa.',
  },
  {
    target: 'medio-tabela',
    title: 'Editar na grade',
    body: 'Funciona como planilha: clique para selecionar, Shift+setas para um intervalo, duplo clique, F2 ou digitar direto para editar, Esc cancela. Duplo clique numa célula calculada, ou com a grade bloqueada, abre as Informações da tarefa. Dá para colar do Excel ou do Project.',
  },
  {
    target: 'medio-linha-resumo',
    title: 'Linha 0: o plano inteiro',
    body: 'A primeira linha resume o cronograma todo, como a tarefa de resumo do projeto no Project: início, término, datas reais, linha de base e % concluída ponderado pela duração das tarefas. É calculada e não se edita.',
  },
  {
    target: 'medio-col-indicadores',
    title: 'Indicadores',
    body: 'Ícones de alerta da linha; passe o mouse para ler. Visto é tarefa concluída; calendário, restrição (vermelho se inflexível); triângulo, prazo final perdido; corrente partida, vínculo desrespeitado; círculo âmbar, fora do horizonte; nota, anotação.',
  },
  {
    target: 'medio-col-avanco',
    title: '% concluída',
    body: 'Lançar o avanço preenche o Início real com o início previsto; 100% preenche também o Término real, e voltar a 0% apaga as datas reais. Nos resumos, o % vem dos subitens e não se edita.',
  },
  {
    target: 'medio-col-duracao',
    title: 'Duração',
    body: 'Aceita "10 dias" (úteis), "10 dias corridos", "8h", "1 mês" e "0 dias", que é marco e vira losango no Gantt. Mudar a duração reagenda as sucessoras. Em tarefa concluída, a duração vem das datas reais.',
  },
  {
    target: 'medio-col-reais',
    title: 'Início e término reais',
    body: 'As datas em que a tarefa de fato começou e terminou, em dd/mm/aa. Data real prende a tarefa: a rede não a move mais. O término real conclui a tarefa em 100% e refaz a duração; apagar o início real desfaz o andamento.',
  },
  {
    target: 'medio-col-datas',
    title: 'Início e término',
    body: 'Calculados pela rede de predecessoras, no calendário do plano. Digitar o início cria "Não iniciar antes de" nessa data, e digitar o término, "Não terminar antes de"; apagar o início de uma tarefa com predecessora devolve a data à rede.',
  },
  {
    target: 'medio-col-predecessoras',
    title: 'Predecessoras',
    body: 'Use o Id da linha, como no Project: 12, 12;14, 27TI+6 dias, 12II+2 dias corridos, 5TT-1 dia. Sem tipo, vale Término-Início; sem unidade, a defasagem é em dias úteis. Vínculo só nas subtarefas, nunca nos resumos.',
  },
  {
    target: 'medio-col-recursos',
    title: 'Nomes dos recursos',
    body: 'Escolha na lista a equipe cadastrada na obra (empresa · equipe). O recurso alimenta o filtro por recurso e a carga das seções Equipes e Recursos.',
  },
  {
    target: 'medio-col-tardias',
    title: 'Datas tardias',
    body: 'Início e término tardios: o mais tarde que a tarefa pode começar e terminar sem atrasar o fim do plano, calculados de trás para a frente pela rede. Só leitura.',
  },
  {
    target: 'medio-col-folgas',
    title: 'Folgas e crítica',
    body: 'Folga total é quanto a tarefa pode atrasar sem mover o fim do plano; folga livre, sem mover nenhuma sucessora, em dias úteis. Crítica é "Sim" quando a tarefa não está concluída e não tem folga total.',
  },
  {
    target: 'medio-col-restricao',
    title: 'Tipo de restrição',
    body: 'As oito restrições do Project, pelo nome ou pela sigla (NIAD, NIDD, NTAD, NTDD, DIE, DTE, OMBP, OMTP), com a data em "Data da restrição". "O mais breve possível" é não ter restrição. Restrição que segura a data aparece nos indicadores.',
  },
  {
    target: 'medio-col-prazo',
    title: 'Prazo final',
    body: 'Não move a tarefa: reduz a folga e, quando o término passa dele, acende o indicador. No Gantt, a seta no topo da linha fica verde enquanto o prazo é cumprido e vermelha quando é perdido.',
  },
  {
    target: 'medio-col-alvo',
    title: '% alvo e desvio',
    body: 'Quanto da tarefa já deveria estar feito pelo tempo decorrido até a data de referência, e o desvio do % concluída contra ele, em pontos. É leitura de tempo, não medição física; "Decorrido / total" mostra os dias.',
  },
  {
    target: 'medio-col-variacao',
    title: 'Variação (dias)',
    body: 'Diferença, em dias corridos, entre o término atual e o término da linha de base exibida. Positivo é atraso.',
  },
  {
    target: 'medio-gantt-grafico',
    title: 'Gantt de acompanhamento',
    body: 'Barra azul é o previsto, com o avanço no tom escuro, e vermelha quando crítica; a cinza embaixo é a linha de base. Colchete preto é resumo e losango é marco; as setas são os vínculos. Clique numa barra para selecionar a linha na tabela.',
  },
  {
    target: 'medio-gantt-grafico',
    title: 'Marcas do Gantt',
    body: 'A linha âmbar é hoje; as tracejadas limitam o horizonte de três meses, e o fundo acinzentado marca o que fica fora dele e os dias não úteis. Borda tracejada é vínculo desrespeitado; o traço vertical na barra é o início real.',
  },
  {
    target: 'medio-gantt-grafico',
    title: 'Editar pelas barras',
    body: 'Com a edição liberada, como no Project: arrastar a barra muda o início (cria "Não iniciar antes de"), esticar a ponta muda a duração, puxar o avanço muda o % concluída e ligar uma barra a outra cria vínculo Término-Início. Duplo clique abre as Informações.',
  },
  {
    target: 'medio-planejador',
    title: 'Planejador de Equipe',
    body: 'Uma linha por equipe da obra, com as tarefas dela no tempo; equipe superalocada fica em vermelho, e "Tarefas não atribuídas" fica embaixo. Com a edição liberada, arraste a tarefa para outra equipe para trocar o recurso, ou para o lado para mudar o início. Duplo clique abre as Informações.',
  },
  {
    target: 'medio-planejador-atribuir',
    title: 'Atribuir a',
    body: 'O mesmo que arrastar entre as linhas, pelo teclado: escolhe a equipe da tarefa selecionada, ou "Sem equipe". Com a edição liberada, a troca entra no rascunho e se desfaz com Ctrl+Z.',
  },
  {
    target: 'medio-planejador-nao-atribuidas',
    title: 'Tarefas não atribuídas',
    body: 'Embaixo desta barra ficam as tarefas sem equipe; arraste uma delas para a linha de uma equipe para atribuí-la. Arraste a barra, ou use as setas com o foco nela, para dar mais ou menos altura à faixa.',
  },
  {
    target: 'medio-uso-recursos',
    title: 'Uso dos Recursos',
    body: 'Cada equipe com as tarefas dela embaixo e as horas de trabalho por período, na escala do zoom ("Sem alocação" junta as tarefas sem equipe). Passou da capacidade, fica vermelho. É leitura: a seleção é a mesma da tabela, e o duplo clique numa tarefa abre as Informações.',
  },
  {
    target: 'medio-planilha-recursos',
    title: 'Planilha de Recursos',
    body: 'As equipes da obra como recursos do Project: nome, iniciais, grupo (a empresa), unidades máximas (a capacidade), pico, trabalho e tarefas no plano. É leitura; equipes e capacidades se ajustam nas configurações da obra.',
  },
  {
    target: 'medio-planilha-configurar',
    title: 'Configurar recursos',
    body: 'Leva às configurações da obra, onde se cadastram empreiteiros, equipes e capacidades: a Planilha de Recursos só lê esse cadastro. Com rascunho não salvo, a tela pergunta antes de sair.',
  },
  {
    target: 'medio-status',
    title: 'Barra de status',
    body: 'À esquerda, "Pronto" (ou "Alterações não salvas", "Editando", "Salvando…"), o modo das tarefas novas e as contagens de tarefas, vínculos e críticas, com o fim do projeto já com o rascunho.',
  },
  {
    target: 'medio-status-visoes',
    title: 'Atalhos das visões',
    body: 'Os mesmos modos de exibição do seletor da barra de ferramentas, em um clique: Gráfico de Gantt, Planejador de Equipe, Uso dos Recursos e Planilha de Recursos, como os ícones do rodapé do Project.',
  },
  {
    target: 'medio-apresentacao',
    title: 'Tabela e Gantt',
    body: 'No Gráfico de Gantt, alterna tabela e Gantt lado a lado, só a tabela ou só o Gantt. Arraste a faixa entre os dois para dividir o espaço.',
  },
  {
    target: 'medio-zoom',
    title: 'Zoom',
    body: 'O controle deslizante muda a escala de tempo entre Meses, Semanas e Dias: − abre, + aproxima. Vale para o Gantt, o Planejador de Equipe e o Uso dos Recursos, e fica salvo.',
  },
  {
    target: 'medio-detalhes',
    title: 'Detalhes da tarefa',
    body: 'Resume a linha selecionada: datas, duração, avanço, predecessoras, datas tardias, folgas, restrição, prazo final e quais predecessoras determinam a data dela. "Detalhes em tela cheia" abre o painel ocupando a tela.',
  },
  {
    target: 'medio-reuniao-navegar',
    title: 'Percorrer na reunião',
    body: 'Anterior e Próxima andam de linha em linha; "Revisado nesta reunião" marca o que já foi discutido. A marca vale só nesta tela e some ao recarregar a página.',
  },
  {
    target: 'medio-anotacoes',
    title: 'Anotações e encaminhamentos',
    body: 'Texto livre da tarefa, editável com a edição liberada e gravado com o resto do rascunho. "Transformar linhas em tópicos" põe um marcador em cada linha. A busca também procura aqui.',
  },
  {
    target: 'medio-historico-tarefa',
    title: 'Histórico da tarefa',
    body: 'Abra para ver as revisões gravadas desta tarefa: data, autor, motivo e cada campo de antes para depois. O histórico só é carregado com o painel aberto.',
  },
  {
    target: 'medio-calendario',
    title: 'Calendário de trabalho',
    body: 'Dias úteis da semana, horas por dia, dias por mês e feriados do plano; horas e dias por mês convertem durações em "h" e em meses. Mudar o calendário reagenda todas as tarefas e vai ao banco em "Revisar e salvar".',
  },
  {
    target: 'medio-exportar',
    title: 'Exportar para o Project',
    body: 'Baixa o cronograma como .xml do MS Project do jeito que está na tela, inclusive o rascunho não salvo, com restrições, prazos, folgas, caminho crítico e a linha de base exibida.',
  },
  {
    target: 'medio-definir-base',
    title: 'Definir linha de base',
    body: 'Congela as datas gravadas do plano com um nome. Cada vez cria uma linha de base nova e guarda as anteriores, e a nova passa a ser a exibida. Só aparece sem alteração pendente.',
  },
  {
    target: 'medio-novo-plano',
    title: 'Novo cronograma do mês',
    body: 'Cria o plano de um mês, como cópia de um plano existente ou em branco. A cópia leva tarefas, vínculos, recursos, % concluída e datas reais, deixa de fora o que terminou antes do novo horizonte e não altera o mês de origem.',
  },
  {
    target: 'medio-descartar',
    title: 'Descartar rascunho',
    body: 'Aparece com alteração não salva: depois de confirmar, devolve todas as tarefas ao que está gravado. Sair da página com rascunho aberto também pede confirmação.',
  },

  // ————— Seção Próximos 90 dias —————
  {
    target: 'medio-janela-indicadores',
    title: 'Próximos 90 dias',
    body: 'Os cartões contam as atividades dos vagões que tocam a janela de hoje a 90 dias, quantas estão sem equipe, quantas equipes passam da capacidade e o progresso da janela, ponderado pelo peso das atividades.',
  },
  {
    target: 'medio-janela',
    title: 'O que vem na janela',
    body: 'As atividades dos vagões desta obra que tocam os próximos três meses, em ordem de início, com vagão, local, período, equipe e percentual. "Sem equipe" aparece destacado. O "?" explica a janela móvel.',
  },
  {
    target: 'medio-janela-filtro',
    title: 'Somente sem equipe',
    body: 'Deixa na lista só as atividades da janela que ainda não têm equipe definida: as que a reunião precisa resolver.',
  },

  // ————— Seção Equipes —————
  {
    target: 'medio-teams',
    title: 'Carga das equipes',
    body: 'Para cada equipe, quantas atividades dos vagões e linhas do plano do mês caem nos próximos 90 dias, contra a capacidade semanal cadastrada; linha de base não entra. Capacidade é número de atividades simultâneas, não pessoas nem horas.',
  },
  {
    target: 'medio-teams-gerenciar',
    title: 'Gerenciar equipes',
    body: 'Leva às configurações da obra, para cadastrar empreiteiros e equipes e ajustar a capacidade semanal de cada uma.',
  },

  // ————— Seção Cobertura —————
  {
    target: 'medio-cobertura',
    title: 'Cobertura entre os níveis',
    body: 'Duas conferências: frentes da janela que caem no mês e não têm linha no plano, e linhas do plano que não aparecem na planilha de nenhuma semana do período delas. O pareamento é pelo nome; é sugestão e não bloqueia nada.',
  },
  {
    target: 'medio-cobertura-plano',
    title: 'Plano conferido',
    body: 'Escolhe qual plano do mês entra na conferência; abre no mais recente. Linhas de base congeladas não aparecem aqui.',
  },

  // ————— Seção Histórico —————
  {
    target: 'medio-historico',
    title: 'Histórico de lançamentos',
    body: 'Os 20 lançamentos de percentual executado mais recentes das atividades desta obra, com data, percentual e quem lançou. O histórico completo de cada atividade fica no detalhe do vagão.',
  },

  // ————— Seção Recursos —————
  {
    target: 'medio-resources',
    title: 'Alocação de recursos',
    body: 'Carga semanal de cada equipe, somando as linhas do plano do mês e as atividades dos vagões, contra a capacidade cadastrada. É análise: o plano continua aceitando qualquer alocação. O "?" explica as premissas.',
  },
  {
    target: 'medio-recursos-periodo',
    title: 'Período analisado',
    body: 'Escolhe o mês de um plano ou as próximas 12 semanas. Trocar o período fecha o detalhe da célula aberta.',
  },
  {
    target: 'medio-recursos-indicadores',
    title: 'Resumo da superalocação',
    body: 'Quantas equipes e quantas semanas passam da capacidade, o pico de carga semanal e de qual equipe, e quantos itens do período estão sem equipe.',
  },
  {
    target: 'medio-recursos-mapa',
    title: 'Mapa de carga semanal',
    body: 'Cada célula é carga/capacidade da equipe na semana: verde abaixo, âmbar no limite, vermelho acima. Clique numa célula para listar os itens que formam a carga; clique no nome da equipe para vê-la no histograma.',
  },
  {
    target: 'medio-recursos-histograma',
    title: 'Histograma da equipe',
    body: 'A carga semana a semana da equipe escolhida, com a linha tracejada da capacidade; a barra fica vermelha quando passa dela. Troque a equipe no seletor ao lado do título.',
  },
  {
    target: 'medio-recursos-equipes',
    title: 'Ajustar equipes',
    body: 'Leva às configurações da obra para mudar equipes e capacidades: uma das saídas para a superalocação, junto de deslocar a linha no plano do mês ou passá-la para outra equipe.',
  },

  // ————— Seção Linha de base —————
  {
    target: 'medio-baseline',
    title: 'Linha de base e atrasos',
    body: 'Compara o plano do mês vivo com uma linha de base congelada, tarefa a tarefa, em dias úteis do calendário do plano: positivo é atraso. Sem linha de base, defina uma na seção Cronograma.',
  },
  {
    target: 'medio-baseline-seletores',
    title: 'Plano e linha de base',
    body: 'Escolha o plano do mês e uma das linhas de base congeladas dele; a tela abre no plano mais recente e na linha de base mais recente dele.',
  },
  {
    target: 'medio-baseline-indicadores',
    title: 'Resumo dos atrasos',
    body: 'Quantas tarefas terminam depois da base, o maior atraso e a média, quanto o término do plano se moveu e quantas tarefas são novas ou foram removidas.',
  },
  {
    target: 'medio-baseline-barras',
    title: 'Tarefas atrasadas',
    body: 'Até 15 tarefas atrasadas, da maior para a menor variação: a barra vermelha é a data atual e a fina cinza embaixo, a linha de base.',
  },
  {
    target: 'medio-baseline-tabela',
    title: 'Variação por tarefa',
    body: 'Início e término da base e atuais, as variações (Δ) e o status: atrasada, adiantada, no prazo, nova (não existia na base) ou removida (saiu do plano). Itens de resumo ficam de fora.',
  },
];

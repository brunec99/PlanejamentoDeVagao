import type { TourStep } from '../tours';

/** Tour da aba 1. A tela tem duas visões (`?visao=`): os passos da visão fechada são pulados sozinhos,
 * porque os alvos dela não estão na tela. Os passos seguem a ordem visual: primeiro o comum às duas
 * visões, depois o Planejador e, por fim, "Vagões e restrições". */
export const steps: TourStep[] = [
  {
    title: 'Aba 1 · Cronograma de longo prazo',
    body: 'O macro da obra em duas visões: o Planejador, onde se monta o cronograma de serviços por pavimento, e "Vagões e restrições", com as atividades dos vagões na Linha de Balanço, as restrições, a curva de avanço e as linhas de base.',
  },
  {
    target: 'work-nav',
    title: 'As abas da obra',
    body: 'As quatro abas numeradas seguem o planejamento do macro para a semana: longo prazo, vagões, médio prazo e curto prazo. Abaixo delas, em Apoio, ficam o modelo federado, os arquivos IFC, as dívidas, as integrações e as configurações da obra.',
  },
  {
    target: 'modo-reuniao',
    title: 'Modo reunião',
    body: 'Aumenta um degrau o texto do sistema inteiro, para ler no projetor da sala. A escolha fica guardada neste navegador; clique de novo para voltar ao tamanho normal.',
  },
  {
    target: 'tab-ajuda',
    title: 'Como funciona a aba',
    body: 'O ? ao lado da descrição explica como o Planejador, os vagões e as restrições se encaixam, e por que datas, serviços e pavimentos só mudam pelo Planejador.',
  },
  {
    target: 'longo-visoes',
    title: 'Planejador ou vagões',
    body: 'O Planejador é o cronograma de longo prazo e é ele que gera as atividades dos vagões. "Vagões e restrições" mostra essas atividades só para leitura, junto das restrições, da curva de avanço e das linhas de base. O tour explica a visão que estiver aberta.',
  },

  // ─── Planejador ───────────────────────────────────────────────────────────────
  {
    target: 'longo-planejador-titulo',
    title: 'Planejador de longo prazo',
    body: 'Aqui se monta a sequência de serviços da obra. O ? ao lado do subtítulo resume o método: duração por pavimento, ritmo, predecessoras, salvamento automático e geração dos vagões.',
  },
  {
    target: 'longo-salvamento',
    title: 'Situação do salvamento',
    body: 'O plano é salvo sozinho cerca de um segundo depois de cada alteração; aqui aparece "Salvando…", "Salvo" ou o erro. Se outra pessoa salvou antes, a tela fica "Somente leitura" até você recarregar o plano, para um não sobrescrever o outro.',
  },
  {
    target: 'longo-planejador-acoes',
    title: 'Ações do plano',
    body: 'Os botões que alteram o plano (Novo serviço, Recalcular, Gerar vagões e Importar) só aparecem para quem pode editar. No perfil de consulta, ou com a tela em somente leitura, ficam Linhas de base, Medições, Pavimentos e Exportar, para consultar.',
  },
  {
    target: 'longo-novo-servico',
    title: 'Novo serviço',
    body: 'Abre o cadastro: nome, cor, pavimento inicial e final, início no primeiro pavimento, duração por pavimento (dias corridos) e ritmo, os dias entre o início de um pavimento e o do seguinte (0 = todos juntos). Um pavimento pode ter duração própria.',
  },
  {
    target: 'longo-novo-servico',
    title: 'Predecessoras do serviço',
    body: 'No mesmo cadastro, as predecessoras empurram o início: no cruzamento automático, o serviço só entra em cada pavimento depois que a predecessora sai; ou escolha um pavimento de referência. A espera pode ser negativa (antecipação). O início nunca fica antes do mínimo.',
  },
  {
    target: 'longo-recalcular',
    title: 'Recalcular',
    body: 'Ao editar, as predecessoras só empurram as datas para frente. Recalcular puxa cada serviço com predecessora para a data mínima, tirando as folgas dadas à mão; serviço sem predecessora não muda. Fica desabilitado enquanto nenhum serviço tem predecessora.',
  },
  {
    target: 'longo-gerar-vagoes',
    title: 'Gerar vagões',
    body: 'Leva o plano salvo para os vagões: cada serviço vira uma atividade por pavimento, fatiada nos vagões que atravessa. Escolha a sequência (ou crie uma, com takt e calendário) e confira a prévia antes de gerar. Vagões já liberados nunca mudam.',
  },
  {
    target: 'longo-plano-linhas-base',
    title: 'Linhas de base do plano',
    body: 'Fotos do plano com nome; o número mostra quantas existem. "Comparar" desenha as datas da foto em cinza na Linha de Balanço e mostra o desvio do prazo; "Restaurar" troca os serviços atuais pela foto. Salve uma antes de uma grande mudança.',
  },
  {
    target: 'longo-medicoes',
    title: 'Medições físicas',
    body: 'Registra uma rodada: a data e o valor acumulado de cada serviço que tem unidade de medição, definida no cadastro do serviço e travada depois da primeira medição. O histórico mostra a curva do avanço físico e permite excluir uma rodada.',
  },
  {
    target: 'longo-pavimentos',
    title: 'Pavimentos da obra',
    body: 'Define quantos pavimentos a obra tem (o 1 é o mais baixo) e o nome de cada um: digite, use os locais importados do Prevision ou preencha uma sequência como "Térreo, 1º pavimento…". Diminuir o número corta a faixa dos serviços que passavam do topo.',
  },
  {
    target: 'longo-exportar',
    title: 'Exportar o plano',
    body: 'Baixa um arquivo .plp.json com o plano inteiro (serviços, pavimentos, linhas de base e medições), para guardar uma cópia ou levar a outra obra pelo Importar.',
  },
  {
    target: 'longo-importar',
    title: 'Importar um arquivo',
    body: 'Carrega um arquivo exportado aqui ou o .plp.json da ferramenta antiga do App-ATR. Se o plano já tem serviços, pede confirmação antes de substituir tudo: salve uma linha de base antes se quiser guardar o atual.',
  },
  {
    target: 'longo-situacao-vagoes',
    title: 'Vagões em dia?',
    body: 'Diz se os vagões refletem o plano: em dia (com a data da última geração), desatualizados porque o plano mudou depois, ou ainda não gerados. O link ao lado abre o "Gerar vagões".',
  },
  {
    target: 'longo-plano-vazio',
    title: 'Começar por um exemplo',
    body: 'Com o plano vazio, cadastre o primeiro serviço, importe um arquivo ou use "comece por um exemplo de edifício": entra uma sequência típica de serviços já encadeados por predecessoras, a partir da próxima segunda-feira, para ajustar.',
  },
  {
    target: 'longo-indicadores',
    title: 'Indicadores do plano',
    body: 'Serviços visíveis no gráfico, pavimentos da obra com a faixa ocupada, prazo planejado do primeiro início ao último término e avanço físico pelas medições. Comparando com uma linha de base, o prazo mostra também o desvio do término.',
  },
  {
    target: 'longo-comparacao',
    title: 'Comparando com a base',
    body: 'Aparece enquanto uma linha de base do plano está em comparação: as datas dela ficam em retângulos cinza na Linha de Balanço. "Parar de comparar" volta a mostrar só o plano atual.',
  },
  {
    target: 'longo-planejador-canvas',
    title: 'Fluxograma e Linha de Balanço',
    body: 'No fluxograma, cada cartão é um serviço e as setas são as predecessoras, com a espera e o pavimento de referência escritos nelas. Na Linha de Balanço, arraste um serviço (ou use as setas do teclado; com Shift, 7 dias) para reprogramá-lo, nunca antes do que as predecessoras permitem.',
  },
  {
    target: 'longo-canvas-modo',
    title: 'Trocar a visualização',
    body: 'Alterna entre o fluxograma e a Linha de Balanço da obra inteira, e os pavimentos de cada serviço voam de um desenho para o outro. "Expandir em Linha de Balanço" e "Recolher em fluxograma" fazem o mesmo.',
  },
  {
    target: 'longo-canvas-legenda',
    title: 'Legenda dos serviços',
    body: 'Cada nome tem a cor do serviço no desenho. Passe o mouse para destacar o serviço e as setas dele; clique para abrir o cadastro. Com uma linha de base em comparação, o nome dela aparece aqui também.',
  },
  {
    target: 'longo-canvas-zoom',
    title: 'Zoom do tempo',
    body: 'Só na Linha de Balanço: estica ou encolhe o eixo do tempo, de 0,25× a 6×, sem mudar a altura dos pavimentos. Use os valores prontos ou o − e o +, de 0,25 em 0,25.',
  },
  {
    target: 'longo-servico-cartao',
    title: 'Cartão do serviço',
    body: 'Mostra início → término, a faixa de pavimentos, a duração por pavimento, o ritmo, as equipes e o % medido. A seta do canto expande os pavimentos com as datas de cada um; clicar no cartão abre o cadastro para editar, duplicar ou excluir.',
  },
  {
    target: 'longo-resumo',
    title: 'Resumo dos serviços',
    body: 'A mesma lista em tabela, por data de início: predecessoras, pavimentos, datas, duração por pavimento (* quando algum pavimento tem duração própria), ritmo, total e equipes. Clique na linha para editar; a seta da esquerda abre as datas de cada pavimento.',
  },
  {
    target: 'longo-resumo-visibilidade',
    title: 'Ocultar do gráfico',
    body: 'O olho tira o serviço do fluxograma, da Linha de Balanço e da contagem de serviços, sem excluí-lo do plano; na tabela ele segue, marcado "(oculto)". Clique de novo para mostrar.',
  },
  {
    target: 'longo-alocacao',
    title: 'Alocação de equipes',
    body: 'Pico diário de pessoas por equipe em cada semana, somando os serviços que usam a mesma equipe no mesmo dia. As cores comparam cada semana com o pico da própria equipe. As equipes vêm do cadastro de cada serviço.',
  },

  // ─── Vagões e restrições ──────────────────────────────────────────────────────
  {
    target: 'longo-lob',
    title: 'Linha de Balanço dos vagões',
    body: 'Cada linha é um local, na ordem de altura da obra, e cada barra é uma atividade de vagão, colorida e rotulada pelo serviço. Aqui é só leitura: as datas mudam pelo Planejador. O ? ao lado do título explica a leitura completa.',
  },
  {
    target: 'longo-lob-linha-base',
    title: 'Comparar com linha de base',
    body: 'Escolha uma linha de base dos vagões para ver o fim dela como linha pontilhada cinza e, ao abrir uma barra, as datas de base e o desvio no término. Só aparece quando já existe linha de base salva.',
  },
  {
    target: 'longo-lob-inverter',
    title: 'Inverter locais',
    body: 'Por padrão as linhas começam, no alto, pelo local mais baixo da obra. Marcado, a ordem se inverte e a cobertura vai para o alto, como num corte do prédio.',
  },
  {
    target: 'longo-lob-escala',
    title: 'Escala do tempo',
    body: 'Mês deixa a obra inteira mais compacta; Semana alarga cada dia e numera o início de cada semana no cabeçalho.',
  },
  {
    target: 'longo-lob-tabela',
    title: 'Gráfico ou tabela',
    body: 'Troca o gráfico por uma tabela com serviço, local, início e término previstos e % executado de cada atividade. "Ver gráfico" volta ao desenho.',
  },
  {
    target: 'longo-lob-grafico',
    title: 'Barras das atividades',
    body: 'Clique numa barra para ver início, término, duração e % executado; com linha de base escolhida, também as datas de base e o desvio. Ali dá para criar uma pendência ligada à tarefa, com prazo pelo lead time. A linha tracejada âmbar é hoje.',
  },
  {
    target: 'longo-restricoes-registrar',
    title: 'Registrar restrição',
    body: 'Abre o cadastro: descrição, local, atividade vinculada, responsável e lead time. Com lead time, o limite sai do início previsto da atividade menos esses dias; sem ele, digite o prazo. Marque se bloqueia execução e terminalidade (as duas vêm marcadas).',
  },
  {
    target: 'longo-restricoes-indicadores',
    title: 'Resumo das restrições',
    body: 'Quantas restrições estão abertas, quantas já passaram do limite e qual é a mais próxima de vencer, com a data e a descrição.',
  },
  {
    target: 'longo-board',
    title: 'Quadro de restrições',
    body: 'Três colunas: Identificada, Em tratativa e Resolvida. Cada card mostra o vagão, a atividade, o limite e o lead time, com borda vermelha quando o prazo venceu. Se a atividade for reprogramada, o limite acompanha o novo início.',
  },
  {
    target: 'longo-restricao-card',
    title: 'Abrir uma restrição',
    body: 'O card abre o detalhe: descrição completa, de onde veio a data limite, responsável e bloqueios. Ali a restrição vai de Identificada para Em tratativa (e volta), e só chega a Resolvida com "Registrar resolução", contando como foi resolvida.',
  },
  {
    target: 'longo-curva-s',
    title: 'Curva de avanço',
    body: 'O acumulado da obra no tempo, planejado (tracejado) contra executado (contínuo): responde se a obra está adiantada ou atrasada, e a Linha de Balanço responde onde. O executado sai dos lançamentos datados e por isso para em hoje.',
  },
  {
    target: 'longo-curva-referencia',
    title: 'De onde vem o planejado',
    body: 'Por padrão, o planejado vem da linha de base mais recente: comparar o executado com um plano já reprogramado esconderia o atraso. "Planejamento atual" usa as datas de hoje. Sem linha de base salva, só existe o atual.',
  },
  {
    target: 'longo-curva-periodo',
    title: 'Período da curva',
    body: '"De" e "até" recortam o intervalo desenhado; por padrão ele vai do primeiro início ao último término, incluindo hoje. "Período padrão" desfaz o recorte.',
  },
  {
    target: 'longo-curva-indicadores',
    title: 'Leitura de hoje',
    body: 'Planejado e executado até hoje, o desvio em pontos percentuais e, quando dá para calcular, o atraso ou avanço em dias: a distância até a data em que o planejado marcava o avanço de hoje. A frase abaixo resume se a obra está em dia.',
  },
  {
    target: 'longo-curva-tabela',
    title: 'Pontos em tabela',
    body: 'Abre a lista de datas com o planejado e o executado de cada ponto da curva, para conferir os números.',
  },
  {
    target: 'longo-baselines-definir',
    title: 'Definir linha de base',
    body: 'Salva, com um nome, as datas atuais de todos os vagões e atividades. Cada acionamento cria um registro novo e preserva os anteriores; são estas as linhas de base usadas na Linha de Balanço e na curva acima.',
  },
  {
    target: 'longo-baselines',
    title: 'Linhas de base salvas',
    body: 'Cada linha mostra quando e por quem a base foi salva, quantos vagões e atividades ela guardou e o período coberto. Reprogramar o planejamento atual nunca altera uma linha de base salva.',
  },
];

import type { TourStep } from '../tours';

/** Tour da aba 1. A tela tem seis visões (`?visao=`): os passos das visões fechadas são pulados
 * sozinhos, porque os alvos delas não estão na tela. Os passos seguem a ordem visual: primeiro o comum
 * a todas, depois Linha de Balanço, Fluxos de serviços e Medições (04/11/2026), o Gantt de legalização
 * (04/11/2026), o Planejador e, por fim, "Vagões e restrições". */
export const steps: TourStep[] = [
  {
    title: 'Aba 1 · Cronograma de longo prazo',
    body: 'O macro da obra: a Linha de Balanço no estilo do Prevision (um bloco por serviço e local), os Fluxos de serviços que alimentam o lançamento, as Medições com fotos, o Gantt de legalização dos 12 meses até a entrega, "Vagões e restrições" e o Planejador anterior.',
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
    body: 'O ? ao lado da descrição explica como a Linha de Balanço, os fluxos, as medições, o Gantt de legalização, os vagões e o Planejador se encaixam.',
  },
  {
    target: 'longo-visoes',
    title: 'As visões da aba',
    body: 'Linha de Balanço (padrão) é o cronograma; Fluxos de serviços guarda as sequências padrão da empresa; Medições registra o realizado com fotos; o Gantt de legalização mostra os 12 meses até a entrega, com o caminho crítico da obra e a legalização. "Vagões e restrições" mostra as atividades dos vagões, e o Planejador é a ferramenta anterior, que ainda gera os vagões. O tour explica a visão que estiver aberta.',
  },

  // ─── Linha de Balanço ─────────────────────────────────────────────────────────
  {
    target: 'longo-lob-indicadores',
    title: 'Indicadores da obra',
    body: 'Serviços e blocos lançados, locais, término previsto (com a diferença para a linha de base escolhida) e avanço físico pelas medições salvas, com o previsto até hoje e quantos blocos estão atrasados.',
  },
  {
    target: 'longo-lob-filtros',
    title: 'Filtros',
    body: 'Escolha os serviços, os locais e o período que aparecem, e uma linha de base para sobrepor em cinza. Os indicadores e a contagem de atrasos continuam sendo da obra inteira.',
  },
  {
    target: 'longo-lob-zoom',
    title: 'Zoom do tempo',
    body: 'Semana, Mês ou Trimestre. "Hoje" (ou a tecla H) leva o gráfico até hoje.',
  },
  {
    target: 'longo-lob-grafico',
    title: 'Linha de Balanço',
    body: 'Locais de baixo para cima e o tempo na horizontal. Cada bloco é um serviço num local: a parte cheia é o que já foi medido, a clara o que falta, e o contorno vermelho marca atraso. Arraste um bloco para mudar a data: as sucessoras acompanham, e ele nunca entra antes das predecessoras. Com um bloco selecionado, as setas movem um dia útil.',
  },
  {
    target: 'longo-lob-legenda',
    title: 'Legenda',
    body: 'Cada serviço com a cor e a duração por local. Clique para esconder ou mostrar o serviço no gráfico.',
  },
  {
    target: 'longo-lob-painel',
    title: 'Bloco selecionado',
    body: 'Início, duração, equipe, predecessoras com a espera, quantos blocos acompanham ao arrastar, o atraso com o motivo da medição, as datas reais e as fotos da última medição.',
  },
  {
    target: 'longo-lob-desfazer',
    title: 'Desfazer',
    body: 'Volta a última mudança de datas (arraste, duração, dependência ou restauração). Ctrl+Z também funciona fora de um campo.',
  },
  {
    target: 'longo-lob-tabela',
    title: 'Tabela',
    body: 'Troca o gráfico por uma lista ordenável com local, serviço, datas, duração, previsto, medido, situação e datas reais.',
  },
  {
    target: 'longo-lob-atrasos',
    title: 'Atrasos',
    body: 'Os blocos em que o previsto até hoje passa do medido, com o atraso em dias úteis. Clique num deles para selecioná-lo no gráfico.',
  },
  {
    target: 'longo-lob-linha-base',
    title: 'Linhas de base',
    body: 'Guarde uma foto das datas, compare com o atual ou restaure. Antes de cada lançamento de fluxo o sistema grava uma automaticamente.',
  },
  {
    target: 'longo-lob-lancar',
    title: 'Lançar fluxo',
    body: 'Escolha um fluxo de serviços, os locais, a data de início, o sentido e o ritmo. A prévia mostra quantos blocos entram e quais já existiam e são mantidos.',
  },
  {
    target: 'longo-lob-mais',
    title: 'Mais ações',
    body: 'Locais da obra (cadastrar, renomear e reordenar), Importar do Planejador (converte o plano antigo em blocos, com a Linha de Balanço vazia) e Exportar CSV.',
  },

  // ─── Fluxos de serviços ───────────────────────────────────────────────────────
  {
    target: 'longo-fluxos-lista',
    title: 'Fluxos da empresa',
    body: 'Cada fluxo é um molde, com as obras em que já foi lançado. Depois de lançado, mudar o fluxo não mexe na obra.',
  },
  {
    target: 'longo-fluxos-novo',
    title: 'Novo fluxo',
    body: 'Cria um fluxo com dois serviços de exemplo encadeados, para ajustar.',
  },
  {
    target: 'longo-fluxos-rede',
    title: 'Rede do fluxo',
    body: 'Desenhada sozinha a partir da coluna "Depois de": cada cartão é um serviço e as setas são as dependências, com a espera em dias úteis. O serviço inicial tem contorno azul.',
  },
  {
    target: 'longo-fluxos-tabela',
    title: 'Serviços do fluxo',
    body: 'Nome, cor, duração por local em dias úteis, equipe, unidade e as predecessoras com espera (negativa antecipa). Tudo é salvo sozinho um segundo depois.',
  },
  {
    target: 'longo-fluxos-lancar',
    title: 'Lançar na Linha de Balanço',
    body: 'Abre o lançamento já com este fluxo. Fica desabilitado, com o motivo, se o fluxo tem um serviço só, mais de um serviço inicial ou um ciclo.',
  },

  // ─── Medições ─────────────────────────────────────────────────────────────────
  {
    target: 'longo-medicoes-nova',
    title: 'Nova medição',
    body: 'Abre uma rodada com data (passada ou hoje, nunca futura). Só pode haver uma em aberto.',
  },
  {
    target: 'longo-medicoes-rodadas',
    title: 'Rodadas',
    body: 'A medição em aberto e as salvas, com blocos, fotos e autor. Só a última pode ser corrigida ou excluída. Embaixo, o avanço físico da obra.',
  },
  {
    target: 'longo-medicoes-abas',
    title: 'Atuais, futuras e concluídas',
    body: 'Atuais são os blocos que já começaram e não chegaram a 100%; futuras começam nos próximos 12 meses.',
  },
  {
    target: 'longo-medicoes-tabela',
    title: 'Lançar o realizado',
    body: 'Digite o acumulado de cada bloco (nunca abaixo da medição anterior) ou use "= previsto" e "100%". Todo avanço precisa de foto; o ícone da câmera fica âmbar enquanto falta. Atrasado pede o motivo, da mesma lista de causas do curto prazo.',
  },
  {
    target: 'longo-medicoes-salvar',
    title: 'Salvar medição',
    body: 'Fecha a rodada e preenche as datas reais. Fica desabilitado enquanto houver avanço sem foto.',
  },

  // ─── Gantt de legalização ─────────────────────────────────────────────────────
  {
    target: 'longo-legal-criar',
    title: 'Criar Gantt de legalização',
    body: 'Informe a entrega contratual (vira o prazo final do marco "Entrega das chaves") e escolha o modelo ATR, com o caminho crítico da obra e a legalização por órgão montados de trás para frente, ou em branco. A prévia mostra a entrega prevista antes de criar; com "Trazer também os serviços da Linha de Balanço" marcado, a lista abre logo em seguida. Um Gantt por obra.',
  },
  {
    target: 'longo-legal-gantt',
    title: 'Gantt de legalização',
    body: 'O mesmo cronograma do médio prazo (tabela e Gantt do Project, predecessoras, restrições, linha de base, exportação .xml), com a janela de 12 meses até a entrega sombreada. Crítica é a tarefa com folga total ≤ 0; a coluna Folga total já vem à mostra. Tudo fica em rascunho até "Revisar e salvar", com motivo.',
  },
  {
    target: 'longo-legal-resumo',
    title: 'Resumo da entrega',
    body: 'Entrega contratual, entrega prevista, tarefas críticas, marcos de legalização cumpridos e o próximo marco. Quando a entrega prevista passa do prazo, o aviso vermelho mostra a cadeia de tarefas que a empurra.',
  },
  {
    target: 'longo-legal-entrega',
    title: 'Alterar entrega',
    body: 'Troca a data contratual e grava na hora: a janela de 12 meses anda junto, e o prazo final do marco da entrega passa para a data nova. As tarefas não mudam de data. Com rascunho aberto, salve ou descarte antes.',
  },
  {
    target: 'longo-legal-trazer-lb',
    title: 'Trazer da Linha de Balanço',
    body: 'Uma linha por serviço da Linha de Balanço, com início do primeiro local, término do último e % medido, no grupo "Caminho crítico da obra" com o indicador LB. Entra no rascunho; trazer de novo atualiza só essas linhas.',
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

export interface TourStep {
  /** Valor do atributo `data-tour` do elemento a destacar. Omitido = passo introdutório central, sem alvo. */
  target?: string;
  title: string;
  body: string;
}

export type TourKey = 'obras' | 'longoPrazo' | 'medioPrazo' | 'curtoPrazo' | 'planejamento' | 'vagao' | 'ifc' | 'federacao' | 'quatroD' | 'prevision' | 'dividas' | 'configuracoes';

export const tours: Record<TourKey, TourStep[]> = {
  obras: [
    { title: 'Bem-vindo ao Planejamento de Vagão', body: 'Este tour explica a tela em que você está. Use "Próximo" para avançar e "Sair" a qualquer momento — ele não altera nada, é só um guia.' },
    { target: 'obras-actions', title: 'Cadastrar obra', body: 'Cria uma nova obra no sistema. Depois disso, use Configurações para liberar o acesso de outros usuários a ela.' },
    { target: 'obras-grid', title: 'Suas obras', body: 'Cada cartão é uma obra que você tem acesso. Os números mostram quantos vagões existem, quantos já são terminais e quantas atividades estão planejadas. Clique num cartão para abrir o planejamento.' },
  ],
  longoPrazo: [
    { title: 'Planejamento de longo prazo', body: 'Visão macro da obra em Linha de Balanço e as linhas de base salvas para comparar com o realizado.' },
    { target: 'work-nav', title: 'Seções da obra', body: 'Alterna entre os três níveis de planejamento, os vagões, as dívidas e as integrações desta obra.' },
    { target: 'longo-baselines', title: 'Linhas de base', body: 'Cada acionamento de "Definir linha de base" cria um registro novo e preserva os anteriores. Reprogramar o planejamento atual nunca altera uma linha de base salva.' },
    { target: 'longo-curva-s', title: 'Curva de avanço', body: 'O acumulado da obra no tempo, planejado contra executado, que é a leitura que responde se a obra está adiantada ou atrasada — a Linha de Balanço responde onde. O planejado vem da linha de base escolhida: comparar o executado com um planejamento já reprogramado seria comparar a obra com a desculpa dela. A linha do executado para em hoje, porque depois de hoje não há medição.' },
    { target: 'longo-lob', title: 'Linha de Balanço', body: 'Cada linha é um serviço avançando pelos locais ao longo do tempo. Selecione uma linha de base para ver o traçado pontilhado de referência ao lado do planejamento atual, ou troque para a visão de tabela.' },
    { target: 'longo-board', title: 'Quadro de pendências', body: 'Cada pendência é ligada a uma atividade e a um lead time. O limite de resolução não é digitado: sai do início previsto da atividade menos esse lead time. Abra o card para ver a descrição completa e de onde veio a data.' },
  ],
  medioPrazo: [
    { title: 'Planejamento de médio prazo', body: 'O plano do mês, escrito do zero: um plano novo a cada mês, com o cadastro de equipes que também abastece a planilha semanal.' },
    { target: 'medio-teams', title: 'Equipes e capacidade', body: 'Empresa e equipe ficam aqui e abastecem o recurso do cronograma; na planilha do curto prazo a equipe é apenas uma opção, porque lá a linha se escreve sozinha. A capacidade é o número de atividades simultâneas por semana — é o que sinaliza sobrecarga.' },
    { target: 'medio-gantt', title: 'Plano do mês', body: 'A tela começa em branco: crie o plano do mês e escreva as linhas, com início, término, duração, recurso, predecessora e anotação. "Definir linha de base" congela o plano como está — a linha de base é o próprio plano congelado, então ela abre aqui mesmo e serve de comparação. As datas não se movem sozinhas: a rede aponta a incoerência, a reprogramação é sua.' },
    { title: 'Cobertura entre os níveis', body: 'A conferência mostra quais frentes da janela de três meses não têm linha no plano do mês, e quais linhas do plano não aparecem em semana nenhuma. O pareamento é por nome, não por vínculo — é conferência, e erra quando o nome muda de um nível para o outro. É sugestão: nada aqui bloqueia nem cria linha sozinho.' },
    { target: 'medio-gantt', title: 'Cadeado e predecessoras', body: 'A grade abre bloqueada de propósito: em reunião o risco não é a edição que falta, é a acidental. O cadeado libera. As predecessoras aceitam a sintaxe do Project — 12, 12II+2d, 12TT-1d, 12TI+2dd —, onde o número é a posição na lista e não o número do item. As datas não se movem sozinhas: a rede diz qual ponta o vínculo prende e a partir de quando, e a reprogramação é sua.' },
    { target: 'medio-gantt', title: 'Item e subitem', body: 'Recue uma linha (com o botão ou com Tab, como no MS Project) para ela virar subitem da linha de cima. O recuo leva os subitens dela junto. Um item com subitens passa a ser resumo: início, término e avanço dele são os dos subitens, e por isso essas células ficam travadas. Excluir um item exclui os subitens.' },
  ],
  curtoPrazo: [
    { title: 'Planejamento de curto prazo', body: 'A planilha da semana, que se sustenta sozinha: nada aqui depende do plano do mês nem de cadastro feito em outra tela. Compromissos da semana, cumprimento, PPC e causas de não cumprimento.' },
    { target: 'curto-ppc', title: 'PPC da semana', body: 'O PPC conta compromissos cumpridos sobre compromissos assumidos na semana. Ele não é a média dos percentuais executados dos serviços.' },
    { title: 'Fechamento da semana', body: 'Abaixo da planilha ficam a série do PPC e o Pareto das causas. O PPC de uma semana isolada diz pouco; o que ensina é a série, e quais poucas causas respondem pela maior parte das falhas. Uma linha com "Não" pode ser levada para a semana seguinte, sem apagar o registro do que aconteceu, e pode virar pendência no quadro do longo prazo.' },
    { target: 'curto-commitments', title: 'A planilha da semana', body: 'Mesma estrutura da planilha que a equipe já preenche: fornecedor, semana, início, término, atividade e equipe, todos editáveis na célula — a equipe é opcional. O calendário de segunda a sábado é a única coisa que se preenche sozinha, a partir do início e do término. Ao encerrar a semana, registre Sim ou Não em cada linha: o Não exige uma causa da lista, e é dela que sai a análise do PPC.' },
  ],
  planejamento: [
    { title: 'Planejamento por período', body: 'Aqui os vagões desta obra ficam organizados em sequências de produção. Cada vagão é um período fixo (o "takt") que reúne várias atividades.' },
    { target: 'planejamento-stats', title: 'Indicadores gerais', body: 'Resumo rápido: quantos vagões existem, quantos já viraram terminais, quantos estão com o takt vencido e quantas dívidas de terminalidade seguem abertas.' },
    { target: 'work-nav', title: 'Seções da obra', body: 'Toda a navegação da obra fica aqui na lateral: os três níveis de planejamento, os vagões, os modelos IFC, o BIM 4D, as dívidas e a integração com o Prevision.' },
    { target: 'planejamento-show-past', title: 'Mostrar vagões passados', body: 'Por padrão, vagões cujo período já terminou ficam ocultos para deixar a lista mais limpa. Marque aqui para revê-los.' },
    { target: 'planejamento-wagon-table', title: 'Lista de vagões', body: 'Cada linha é um vagão: período previsto, quantidade de atividades, progresso ponderado, status e o tipo de liberação já concedida. Clique no nome do vagão para abrir o detalhe.' },
  ],
  vagao: [
    { title: 'Detalhe do vagão', body: 'Esta tela reúne tudo sobre um período: atividades previstas, critérios de terminalidade, liberação, pendências e restrições.' },
    { target: 'vagao-status', title: 'Status do vagão', body: 'Mostra a situação atual do vagão e avisa se o takt já venceu — o que não impede a terminalidade, só sinaliza atraso.' },
    { target: 'vagao-actions', title: 'Adicionar e registrar', body: 'Formulários para incluir uma nova atividade, um critério de terminalidade, uma pendência ou uma restrição neste período.' },
    { target: 'vagao-activities', title: 'Atividades do período', body: 'Lista de atividades previstas para este vagão, com progresso, status e peso. O progresso do vagão é a média ponderada pelo peso de cada atividade.' },
    { target: 'vagao-criteria', title: 'Terminalidade', body: 'Um vagão só vira terminal quando todas as atividades obrigatórias estão concluídas e todos os critérios obrigatórios estão confirmados.' },
    { target: 'vagao-release', title: 'Liberação deste vagão', body: 'Registra a liberação que autoriza o início da execução. Pode ser inicial, normal (predecessor terminal) ou excepcional (aceitando pendências em aberto).' },
    { target: 'vagao-pending', title: 'Pendências', body: 'Itens em aberto que podem bloquear a terminalidade deste vagão até serem resolvidos.' },
    { target: 'vagao-restrictions', title: 'Restrições', body: 'Podem bloquear a execução, a terminalidade, ou ambas — diferente de uma pendência simples.' },
  ],
  ifc: [
    { title: 'Modelos IFC', body: 'O IFC é uma base de dados, não um desenho. O envio parte o arquivo em duas metades: os dados viram tabelas (elemento, propriedade, quantidade) e a geometria é convertida para um formato compacto que abre rápido no navegador. As duas se reencontram pelo GlobalId. Guardar o .ifc original é opcional — o limite de tamanho do armazenamento não decide o que a obra pode planejar.' },
    { target: 'ifc-models', title: 'Modelos e versões', body: 'Cada modelo lista suas versões, quantas linhas foram transcritas e se a geometria 3D já foi convertida. Uma versão nova nunca substitui as anteriores, e a versão sem o arquivo original continua completa como dado.' },
    { target: 'ifc-quantitativo', title: 'Quantitativo', body: 'As quantidades declaradas no modelo, somadas por tipo, com a distribuição por classe IFC e por pavimento e a consulta elemento a elemento. A soma é feita no banco, sobre o modelo inteiro — e sai em CSV para quem ainda precisa da planilha.' },
    { target: 'ifc-viewer', title: 'Visualizador', body: 'Desenha a geometria convertida guardada no envio, não o arquivo relido — é o que faz o modelo abrir em qualquer tamanho. Dá para colorir por pavimento ou por classe, isolar um pavimento, seccionar nos eixos X/Y/Z e clicar num elemento para ver classe IFC, nome, GlobalId e pavimento. Ative o corte, ajuste a posição e inverta o lado visível quando necessário.' },
    { target: 'ifc-rules', title: 'Vinculação por regras', body: 'As regras ligam elementos do modelo a um serviço por propriedade (pavimento e tipo de elemento nesta versão), em vez de seleção manual elemento por elemento. Regras cujo pavimento não existe mais no modelo aparecem marcadas para revisão.' },
  ],
  federacao: [
    { title: 'Modelo federado', body: 'Reúna versões dos modelos da obra e explore o conjunto sem depender do planejamento 4D.' },
    { target: 'federation-composition', title: 'Composição do conjunto', body: 'Busque modelos e disciplinas, marque os modelos que entram no conjunto e escolha suas versões. Selecionar disponíveis usa a versão mais recente pronta de cada modelo. Carregar aplica a seleção ao 3D.' },
    { target: 'federation-saved', title: 'Composições salvas', body: 'Abra esta área para restaurar uma composição ou salvar uma nova cópia. Cada composição mantém as versões escolhidas, mesmo após novos envios de IFC.' },
    { target: 'federation-viewer', title: 'Explorar o conjunto', body: 'Oculte ou isole modelos, recorte por pavimento e escolha as cores. Em Seccionamento, ative um corte X/Y/Z, ajuste a posição e inverta o lado visível; o mesmo plano atravessa todo o conjunto. Clique no 3D ou use Buscar elementos para selecionar pelo nome, classe ou GlobalId; o painel de detalhes mostra a origem e os dados.' },
  ],
  quatroD: [
    { title: 'BIM 4D', body: 'Mostra a evolução física no modelo federado e compara o planejado com o realizado numa data escolhida.' },
    { target: 'quatro-d-controls', title: 'Data, linha de base e pavimento', body: 'Escolha a data da consulta, a linha de base usada na comparação e o recorte por pavimento.' },
    { target: 'quatro-d-viewer', title: 'Modelo federado', body: 'As versões escolhidas entram na mesma cena, com a geometria convertida no envio. Os elementos são coloridos pelo serviço vinculado por regra. Avanço parcial aparece como estimativa do serviço — nenhum elemento individual é apresentado como verificado sem essa informação.' },
  ],
  prevision: [
    { title: 'Atividades do Prevision', body: 'Aqui o cronograma do Prevision fica salvo no sistema; ele só é consultado de novo quando você pede. Cada atividade só entra inteira num vagão cujo período a contenha.' },
    { target: 'prevision-responsible', title: 'Responsável local', body: 'Defina quem vai responder pelas atividades antes de importá-las — é obrigatório para adicionar qualquer atividade a um vagão.' },
    { target: 'prevision-sync', title: 'Atualizar do Prevision', body: 'Busca o cronograma mais recente e regenera os vagões futuros ainda não liberados a partir dele. Vagões já liberados nunca são alterados.' },
    { target: 'prevision-tabs', title: 'Três formas de organizar', body: '"Disponíveis para vagão" mostra o que falta encaixar; "Fora do período" mostra o que não cabe em nenhum vagão existente; "Escolher por vagão" deixa você selecionar várias atividades de uma vez para um vagão específico.' },
    { target: 'prevision-pool', title: 'Fatiamento automático', body: 'Uma atividade que atravessa mais de um vagão é dividida em fatias proporcionais aos dias de cada período, sempre somando 100%. É assim que toda atividade acaba dentro de algum vagão.' },
  ],
  dividas: [
    { title: 'Dívidas de terminalidade', body: 'Pendências que foram aceitas para permitir uma liberação excepcional, mas que ainda precisam ser resolvidas — mesmo com o vagão de origem já liberado.' },
    { target: 'dividas-filter', title: 'Filtrar por situação', body: 'Veja só as dívidas abertas, só as vencidas, só as resolvidas, ou todas de uma vez.' },
    { target: 'dividas-list', title: 'Cada dívida', body: 'Mostra a pendência original, o vagão onde ela surgiu e o vagão cuja liberação excepcional a aceitou. Dívidas em aberto podem ser resolvidas diretamente aqui.' },
  ],
  configuracoes: [
    { title: 'Configurações', body: 'Tela restrita a administradores: define o takt de cada obra, gerencia usuários e controla quem acessa o quê.' },
    { target: 'config-takt', title: 'Takt por obra', body: 'Ajusta a duração padrão (em dias) do takt de cada sequência de produção — usada para agrupar novas atividades em vagões.' },
    { target: 'config-start-date', title: 'Início do primeiro vagão', body: 'Enquanto a sequência não tiver nenhum vagão liberado, a regeneração pelo Prevision usa essa data como ponto de partida em vez de "hoje". Depois que o primeiro vagão for liberado, deixa de valer — o limite passa a ser o próprio vagão liberado.' },
    { target: 'config-invite', title: 'Convidar usuário', body: 'Envia um convite por e-mail com um papel já definido (consulta, planejador, gestor ou administrador). O acesso a cada obra é liberado à parte, na lista abaixo.' },
    { target: 'config-users', title: 'Usuários e acessos', body: 'Para cada pessoa: mude o papel, libere ou revogue o acesso a cada obra, ou remova o usuário do sistema.' },
  ],
};

export function resolveTourKey(pathname: string): TourKey | null {
  if (pathname === '/obras') return 'obras';
  if (/^\/obras\/[^/]+\/longo-prazo$/.test(pathname)) return 'longoPrazo';
  if (/^\/obras\/[^/]+\/medio-prazo$/.test(pathname)) return 'medioPrazo';
  if (/^\/obras\/[^/]+\/curto-prazo$/.test(pathname)) return 'curtoPrazo';
  if (/^\/obras\/[^/]+\/vagoes$/.test(pathname)) return 'planejamento';
  if (/^\/obras\/[^/]+\/vagoes\/[^/]+$/.test(pathname)) return 'vagao';
  if (/^\/obras\/[^/]+\/ifc$/.test(pathname)) return 'ifc';
  if (/^\/obras\/[^/]+\/federacao$/.test(pathname)) return 'federacao';
  if (/^\/obras\/[^/]+\/quatro-d$/.test(pathname)) return 'quatroD';
  if (/^\/obras\/[^/]+\/importar$/.test(pathname)) return 'prevision';
  if (/^\/obras\/[^/]+\/dividas$/.test(pathname)) return 'dividas';
  if (pathname === '/configuracoes') return 'configuracoes';
  return null;
}

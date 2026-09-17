export interface TourStep {
  /** Valor do atributo `data-tour` do elemento a destacar. Omitido = passo introdutório central, sem alvo. */
  target?: string;
  title: string;
  body: string;
}

export type TourKey = 'obras' | 'longoPrazo' | 'medioPrazo' | 'curtoPrazo' | 'planejamento' | 'vagao' | 'ifc' | 'quatroD' | 'prevision' | 'dividas' | 'configuracoes';

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
    { target: 'longo-lob', title: 'Linha de Balanço', body: 'Cada linha é um serviço avançando pelos locais ao longo do tempo. Selecione uma linha de base para ver o traçado pontilhado de referência ao lado do planejamento atual, ou troque para a visão de tabela.' },
    { target: 'longo-board', title: 'Quadro de pendências', body: 'Cada pendência é ligada a uma atividade e a um lead time. O limite de resolução não é digitado: sai do início previsto da atividade menos esse lead time. Abra o card para ver a descrição completa e de onde veio a data.' },
  ],
  medioPrazo: [
    { title: 'Planejamento de médio prazo', body: 'O Look Ahead dos próximos três meses: equipes executoras, carga de alocação e o percentual executado lançado a cada semana.' },
    { target: 'medio-teams', title: 'Equipes e capacidade', body: 'A capacidade é o número de atividades simultâneas que a equipe consegue executar por semana — é o que sinaliza sobrecarga.' },
  ],
  curtoPrazo: [
    { title: 'Planejamento de curto prazo', body: 'O planejamento semanal do Last Planner: compromissos da semana, cumprimento, PPC e causas de não cumprimento.' },
    { target: 'curto-ppc', title: 'PPC da semana', body: 'O PPC conta compromissos cumpridos sobre compromissos assumidos na semana. Ele não é a média dos percentuais executados dos serviços.' },
    { target: 'curto-commitments', title: 'Compromissos da semana', body: 'Cada linha é um compromisso com sua meta. Ao encerrar a semana, registre o cumprimento — e a causa, quando não for cumprido.' },
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
    { title: 'Modelos IFC', body: 'O repositório guarda apenas modelos IFC, vinculados a esta obra. Cada envio do mesmo modelo cria uma versão nova e preserva as anteriores.' },
    { target: 'ifc-models', title: 'Modelos e versões', body: 'Cada modelo lista suas versões, com os pavimentos lidos do próprio arquivo no momento do envio.' },
    { target: 'ifc-rules', title: 'Vinculação por regras', body: 'As regras ligam elementos do modelo a um serviço por propriedade (pavimento e tipo de elemento nesta versão), em vez de seleção manual elemento por elemento. Regras cujo pavimento não existe mais no modelo aparecem marcadas para revisão.' },
  ],
  quatroD: [
    { title: 'BIM 4D', body: 'Mostra a evolução física no modelo federado e compara o planejado com o realizado numa data escolhida.' },
    { target: 'quatro-d-controls', title: 'Data, linha de base e pavimento', body: 'Escolha a data da consulta, a linha de base usada na comparação e o recorte por pavimento.' },
    { target: 'quatro-d-viewer', title: 'Modelo federado', body: 'Os elementos são coloridos pelo serviço vinculado por regra. Avanço parcial aparece como estimativa do serviço — nenhum elemento individual é apresentado como verificado sem essa informação.' },
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
  if (/^\/obras\/[^/]+\/quatro-d$/.test(pathname)) return 'quatroD';
  if (/^\/obras\/[^/]+\/importar$/.test(pathname)) return 'prevision';
  if (/^\/obras\/[^/]+\/dividas$/.test(pathname)) return 'dividas';
  if (pathname === '/configuracoes') return 'configuracoes';
  return null;
}

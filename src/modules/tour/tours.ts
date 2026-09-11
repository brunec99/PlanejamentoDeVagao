export interface TourStep {
  /** Valor do atributo `data-tour` do elemento a destacar. Omitido = passo introdutório central, sem alvo. */
  target?: string;
  title: string;
  body: string;
}

export type TourKey = 'obras' | 'planejamento' | 'vagao' | 'prevision' | 'dividas' | 'configuracoes';

export const tours: Record<TourKey, TourStep[]> = {
  obras: [
    { title: 'Bem-vindo ao Planejamento de Vagão', body: 'Este tour explica a tela em que você está. Use "Próximo" para avançar e "Sair" a qualquer momento — ele não altera nada, é só um guia.' },
    { target: 'obras-actions', title: 'Cadastrar obra', body: 'Cria uma nova obra no sistema. Depois disso, use Configurações para liberar o acesso de outros usuários a ela.' },
    { target: 'obras-grid', title: 'Suas obras', body: 'Cada cartão é uma obra que você tem acesso. Os números mostram quantos vagões existem, quantos já são terminais e quantas atividades estão planejadas. Clique num cartão para abrir o planejamento.' },
  ],
  planejamento: [
    { title: 'Planejamento por período', body: 'Aqui os vagões desta obra ficam organizados em sequências de produção. Cada vagão é um período fixo (o "takt") que reúne várias atividades.' },
    { target: 'planejamento-stats', title: 'Indicadores gerais', body: 'Resumo rápido: quantos vagões existem, quantos já viraram terminais, quantos estão com o takt vencido e quantas dívidas de terminalidade seguem abertas.' },
    { target: 'planejamento-debts-link', title: 'Dívidas de terminalidade', body: 'Pendências que foram aceitas numa liberação excepcional e ainda precisam ser resolvidas — mesmo que o vagão de origem já tenha sido liberado.' },
    { target: 'planejamento-sync-link', title: 'Atualizar tarefas', body: 'Leva à tela de integração com o Prevision: busca o cronograma mais recente e reorganiza os vagões futuros ainda não liberados.' },
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
  if (/^\/obras\/[^/]+\/planejamento$/.test(pathname)) return 'planejamento';
  if (/^\/obras\/[^/]+\/vagoes\/[^/]+$/.test(pathname)) return 'vagao';
  if (/^\/obras\/[^/]+\/importar$/.test(pathname)) return 'prevision';
  if (/^\/obras\/[^/]+\/dividas$/.test(pathname)) return 'dividas';
  if (pathname === '/configuracoes') return 'configuracoes';
  return null;
}

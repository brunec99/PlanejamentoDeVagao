import type { TourStep } from '../tours';

export const steps: TourStep[] = [
  {
    title: 'Aba 2 · Planejamento de vagão e lista de pendência',
    body: 'A aba tem duas visões. No planejamento de vagão, os vagões da obra ficam organizados em sequências de produção: cada vagão é um período fixo de takt que reúne as atividades previstas entre o marco inicial e o final. Na Lista de pendência, um quadro de cards acompanha o que precisa ser resolvido na obra, com prazo, responsável, conversa e checklists. O tour explica a visão que estiver aberta.',
  },
  {
    target: 'vagoes-visoes',
    title: 'As duas visões da aba',
    body: '"Vagões" é o planejamento por períodos de takt. "Lista de pendência" é o quadro de cards do que precisa ser resolvido na obra: prazo em dias úteis, responsável, conversa com @ e checklists. O card não trava vagão; o que bloqueia um vagão continua sendo a restrição registrada no detalhe dele.',
  },
  {
    target: 'work-nav',
    title: 'Seções da obra',
    body: 'Toda a navegação da obra fica aqui na lateral: as abas numeradas e, em Apoio, o modelo federado, os arquivos IFC, as dívidas, as integrações e as configurações da obra. Só aparecem as seções liberadas para o seu acesso.',
  },
  {
    target: 'modo-reuniao',
    title: 'Modo reunião',
    body: 'Aumenta o texto do sistema inteiro para projetar na sala de reunião. Clique de novo para voltar ao tamanho normal; a escolha fica guardada neste navegador.',
  },
  {
    target: 'tab-ajuda',
    title: 'Como funciona',
    body: 'Abre a explicação do método: o que é um vagão, quando ele vira terminal e a diferença entre a liberação normal e a excepcional. Fecha com Esc ou clicando fora.',
  },
  {
    target: 'vagoes-criar-sequencia',
    title: 'Criar sequência',
    body: 'A sequência é a fila de vagões de uma frente de produção. Informe o nome, o takt padrão (1 a 365 dias) e o calendário: em dias úteis, a duração dos vagões conta só de segunda a sexta. Sem nenhuma sequência, este é o botão em destaque.',
  },
  {
    target: 'vagoes-criar-vagao',
    title: 'Criar vagão',
    body: 'Informe a sequência, o número, o vagão anterior, os marcos e o responsável. Só o primeiro da sequência fica sem anterior, e o período precisa começar depois do fim dele; a duração do takt sai das datas. Ao salvar, o detalhe do vagão abre.',
  },
  {
    target: 'vagoes-cadastrar-local',
    title: 'Cadastrar local',
    body: 'Cadastra um pavimento, zona ou frente da obra. Os locais pertencem às atividades, não aos vagões: é desta lista que se escolhe o local ao adicionar uma atividade. O nome não pode se repetir na mesma obra.',
  },
  {
    target: 'planejamento-stats',
    title: 'Indicadores gerais',
    body: 'Quantos vagões a obra tem, quantos já são terminais, quantos estão com o takt vencido (período encerrado sem terminalidade) e quantas dívidas de terminalidade seguem abertas.',
  },
  {
    target: 'planejamento-show-past',
    title: 'Mostrar vagões passados',
    body: 'Vagões cujo período terminou antes de hoje ficam ocultos para a lista ficar curta. Marque para revê-los: eles voltam esmaecidos, com a marca "passado". A caixa só aparece quando existe vagão passado.',
  },
  {
    target: 'vagoes-sequencia',
    title: 'Cada sequência',
    body: 'Cada quadro reúne os vagões de uma sequência de produção. O selo mostra o takt padrão dela e se o calendário conta dias corridos ou úteis.',
  },
  {
    target: 'planejamento-wagon-table',
    title: 'Lista de vagões',
    body: 'Cada linha é um vagão: período previsto, número de atividades, progresso ponderado pelo peso delas, status, prazo ("Atrasado" quando o período acabou sem terminalidade) e o tipo de liberação concedida, ou "Aguardando".',
  },
  {
    target: 'vagoes-abrir-vagao',
    title: 'Abrir o vagão',
    body: 'Clique no nome do vagão para abrir o detalhe dele: atividades, critérios de terminalidade, liberação, pendências, restrições, dívidas e histórico.',
  },

  // ─── Lista de pendência (visão `?visao=pendencias`, 10/11/2026) ──────────────
  {
    target: 'pendencias-nova',
    title: 'Nova pendência',
    body: 'Cria um card manual: título, data de entrega, tempo de execução em dias úteis e responsável. Os cards também nascem de uma tarefa do médio prazo ("Criar pendência" no cronograma) e de um serviço da Linha de Balanço do longo prazo; nesses, a entrega é o dia útil anterior ao início e acompanha a reprogramação.',
  },
  {
    target: 'pendencias-filtros',
    title: 'Filtros do quadro',
    body: 'Mostra só os cards de um responsável ou de uma origem: Manual, Médio prazo, Longo prazo ou Restrição (as restrições do antigo quadro do longo prazo, copiadas para cá). "Limpar filtros" volta a mostrar tudo.',
  },
  {
    target: 'pendencias-quadro',
    title: 'O quadro',
    body: 'Cinco colunas: A fazer, Fazendo, Pausado, Concluído e Cancelado. Pausar e cancelar pedem o motivo. O sinal do card é vermelho quando a entrega passou ou quando o "começar até" (a entrega menos o tempo de execução, em dias úteis) passou com o card ainda em A fazer; amarelo quando precisa começar nos próximos 5 dias úteis; verde dentro do prazo. Abra um card para a conversa (marque alguém com @: a pessoa recebe e-mail), as checklists e o histórico de mudanças.',
  },
];

import type { TourStep } from '../tours';

/** Tour da aba 1.4, Quadro de Restrições (12/11/2026). Até então os passos do quadro fechavam o tour da
 * antiga aba 2 (`vagoes.ts`), de que o Kanban era a segunda visão. */
export const steps: TourStep[] = [
  {
    title: 'Aba 1.4 · Quadro de Restrições',
    body: 'O quadro de cards do que precisa ser resolvido na obra antes de cada frente começar: prazo em dias úteis, responsável, conversa com @ e checklists. O card não trava vagão; o que bloqueia um vagão continua sendo a restrição registrada no detalhe dele, no Planejamento de vagão.',
  },
  {
    target: 'pendencias-nova',
    title: 'Nova pendência',
    body: 'Cria um card: título, data de término, tempo de execução em dias úteis e responsável. Em "Ligar a" dá para prender o card a uma tarefa do médio prazo ou a um serviço do longo prazo, escolhidos numa lista. Os cards também nascem de uma tarefa do médio prazo ("Criar pendência" no cronograma) e de um serviço da Linha de Balanço do longo prazo; nesses, a entrega é o dia útil anterior ao início e acompanha a reprogramação.',
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

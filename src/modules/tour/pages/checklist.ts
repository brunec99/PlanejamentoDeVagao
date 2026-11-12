import type { TourStep } from '../tours';

/** Tour da aba 9, Checklist de equipamentos (11/11/2026). Os alvos ficam em
 * `checklist/checklist-overview.tsx`; o formulário de inspeção só existe depois de clicar num checklist do
 * quadro, e o passo dele é pulado quando o alvo não está na tela. */
export const steps: TourStep[] = [
  {
    title: 'Aba 9 · Checklist de equipamentos',
    body: 'A inspeção diária, semanal e mensal dos equipamentos da obra. Todos consultam; só técnicos de segurança (TST) e administradores editam modelos, equipamentos e inspeções.',
  },
  {
    target: 'checklist-cards',
    title: 'Indicadores',
    body: 'Quantos checklists faltam hoje, nesta semana (segunda a domingo) e neste mês, e quantos do período corrente foram feitos com alguma não conformidade.',
  },
  {
    target: 'checklist-board',
    title: 'Equipamentos da obra',
    body: 'Cada equipamento com os checklists do tipo dele. Âmbar é pendente no período, verde é feito e vermelho é feito com não conformidade. Clique num checklist para preencher ou abrir a inspeção. Abaixo, o TST cadastra os equipamentos da obra.',
  },
  {
    target: 'checklist-form',
    title: 'Inspeção',
    body: 'Cada item recebe C (conforme), NC (não conforme) ou N/A (não se aplica). A não conformidade exige a descrição. "Marcar os demais como conforme" preenche o que ficou em branco.',
  },
  {
    target: 'checklist-history',
    title: 'Últimas inspeções',
    body: 'As 30 inspeções mais recentes, com quem registrou. "Ver respostas" abre os itens; o TST edita ou exclui uma inspeção lançada errada.',
  },
  {
    target: 'checklist-models',
    title: 'Modelos de checklist',
    body: 'A ficha de cada tipo de equipamento e periodicidade, com os itens a conferir. A lista é a mesma para todas as obras. Editar um modelo vale daqui em diante: as inspeções já feitas guardam os itens como estavam.',
  },
];

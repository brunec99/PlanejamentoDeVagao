import type { TourStep } from '../tours';

/** Tour da aba 9, Checklist de equipamentos (11/11/2026; QR do operador, assinatura e fotos em 12/11/2026). Os alvos ficam em
 * `checklist/checklist-overview.tsx`; o formulário de inspeção só existe depois de clicar num checklist do
 * quadro, e o passo dele é pulado quando o alvo não está na tela. */
export const steps: TourStep[] = [
  {
    title: 'Aba 3.2 · Checklist de equipamentos',
    body: 'A inspeção diária, semanal e mensal dos equipamentos da obra. O operador preenche pelo QR colado na máquina, sem login. Técnicos de segurança (TST) e administradores registram e corrigem inspeções; o cadastro de modelos e equipamentos é dos administradores. Os demais consultam.',
  },
  {
    target: 'checklist-cards',
    title: 'Indicadores',
    body: 'Quantos checklists faltam hoje, nesta semana (segunda a domingo) e neste mês, e quantos do período corrente foram feitos com alguma não conformidade.',
  },
  {
    target: 'checklist-board',
    title: 'Equipamentos da obra',
    body: 'Cada equipamento com os checklists do tipo dele. Âmbar é pendente no período, verde é feito e vermelho é feito com não conformidade. Clique num checklist para preencher ou abrir a inspeção. "QR do operador" mostra o link do equipamento, e "Imprimir etiquetas com QR" gera a folha para colar nas máquinas. Abaixo, o administrador cadastra os equipamentos da obra.',
  },
  {
    target: 'checklist-form',
    title: 'Inspeção',
    body: 'Cada item recebe C (conforme), NC (não conforme) ou N/A (não se aplica). A não conformidade exige a descrição. "Marcar os demais como conforme" preenche o que ficou em branco. Dá para anexar até 4 fotos, escrever o nome do operador e colher a assinatura dele no quadro.',
  },
  {
    target: 'checklist-history',
    title: 'Últimas inspeções',
    body: 'As 30 inspeções mais recentes, com o operador ou quem registrou; as que vieram do QR trazem a marca "pelo QR". "Ver respostas" abre os itens, a assinatura e as fotos; o TST edita ou exclui uma inspeção lançada errada.',
  },
  {
    target: 'checklist-models',
    title: 'Modelos de checklist',
    body: 'A ficha de cada tipo de equipamento e periodicidade, com os itens a conferir. A lista é a mesma para todas as obras, e só administradores criam e editam. Editar um modelo vale daqui em diante: as inspeções já feitas guardam os itens como estavam.',
  },
];

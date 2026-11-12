import type { TourStep } from '../tours';

/** Tour da aba 7, Histograma de mão de obra (11/11/2026). Os alvos ficam em
 * `histograma/headcount-overview.tsx`; o formulário de lançamento só aparece para quem pode lançar, e o
 * passo dele é pulado quando o alvo não está na tela. */
export const steps: TourStep[] = [
  {
    title: 'Aba 7 · Histograma de mão de obra',
    body: 'O efetivo de cada dia, por empresa e função, no lugar da planilha "ATR Histograma": quem estava na obra, quanto é mão de obra própria e quanto é de empreiteiro.',
  },
  {
    target: 'headcount-cards',
    title: 'Indicadores',
    body: 'O efetivo no último dia lançado (com o aviso de quantos dias úteis estão sem lançar), a média por dia útil, o pico do período e a parcela de empreiteiros nos homens-dia.',
  },
  {
    target: 'headcount-day',
    title: 'Folha do dia',
    body: 'As empresas do dia escolhido, cada uma com as funções e as quantidades. As setas vão ao dia lançado anterior e ao próximo.',
  },
  {
    target: 'headcount-form',
    title: 'Lançar',
    body: 'Empresa, função e quantidade; a empresa continua preenchida para a próxima função. Num dia vazio, "Repetir o último dia" copia as equipes do último dia lançado, e depois basta ajustar as quantidades na própria linha.',
  },
  {
    target: 'headcount-chart',
    title: 'Histograma',
    body: 'Barras empilhadas por dia, semana ou mês, por próprio × empreiteiro, empresa ou função. Em semana e mês o número é a média por dia útil lançado; sábado e domingo ficam fora da média.',
  },
  {
    target: 'headcount-ranking',
    title: 'Por empresa e por função',
    body: 'Homens-dia no período (pessoas × dias), a média da equipe nos dias em que esteve na obra e em quantos dias apareceu.',
  },
];

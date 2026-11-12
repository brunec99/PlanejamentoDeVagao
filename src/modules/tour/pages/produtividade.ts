import type { TourStep } from '../tours';

/** Tour da aba 8, Controle de produtividade (11/11/2026). Os alvos ficam em
 * `produtividade/production-overview.tsx`; o formulário só aparece para quem pode lançar, e o passo dele
 * é pulado quando o alvo não está na tela. */
export const steps: TourStep[] = [
  {
    title: 'Aba 2.3 · Controle de produtividade',
    body: 'O que cada equipe produziu em cada dia, no lugar da planilha "ATR - Controle da produção": serviço, empreiteiro, profissionais, ajudantes, produção e unidade.',
  },
  {
    target: 'production-cards',
    title: 'Indicadores',
    body: 'Até quando a obra lançou, quantos lançamentos há no período e quantos ainda estão sem produção medida.',
  },
  {
    target: 'production-day',
    title: 'Folha do dia',
    body: 'Os lançamentos do dia escolhido. A produção se digita direto na linha; o campo fica amarelo enquanto está "a medir".',
  },
  {
    target: 'production-form',
    title: 'Lançar',
    body: 'Serviço, empreiteiro, equipe e, se já tiver, a produção. Em branco quer dizer "a medir". Num dia vazio, "Repetir o último dia" copia as equipes do último dia lançado, sem a produção.',
  },
  {
    target: 'production-services',
    title: 'Produtividade por serviço',
    body: 'Produção total dividida pelos homens-dia do período, só com as linhas medidas. Clique num serviço para ver os empreiteiros.',
  },
];

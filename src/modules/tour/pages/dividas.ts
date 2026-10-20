import type { TourStep } from '../tours';

export const steps: TourStep[] = [
  {
    title: 'Dívidas de terminalidade',
    body: 'Pendências aceitas numa liberação excepcional, que continuam devidas mesmo com o vagão seguinte já liberado. A execução segue, mas cada uma precisa ser resolvida no prazo assumido.',
  },
  {
    target: 'work-nav',
    title: 'Seções da obra',
    body: 'Dívidas fica em Apoio, na lateral, junto das demais telas de apoio da obra. As abas numeradas acima levam aos níveis de planejamento.',
  },
  {
    target: 'modo-reuniao',
    title: 'Modo reunião',
    body: 'Aumenta o texto do sistema inteiro para projetar na sala de reunião. Clique de novo para voltar ao tamanho normal; a escolha fica guardada neste navegador.',
  },
  {
    target: 'dividas-ajuda',
    title: 'O que é uma dívida',
    body: 'Abre a explicação completa: como a dívida nasce, por que uma liberação seguinte não a duplica e por que restrição impeditiva nunca vira dívida.',
  },
  {
    target: 'dividas-filter',
    title: 'Filtrar por situação',
    body: '"Abertas", o filtro inicial, inclui as vencidas, que são as abertas com o prazo assumido já passado. "Resolvidas" mostra as encerradas e "Todas" junta tudo. O número ao lado de cada filtro é a contagem.',
  },
  {
    target: 'dividas-list',
    title: 'Cada dívida',
    body: 'Cada cartão traz a pendência de origem, a situação (aberta, vencida ou resolvida), o responsável e o prazo assumidos na liberação. Resolvida, mostra como foi resolvida.',
  },
  {
    target: 'dividas-vinculos',
    title: 'Origem e liberação',
    body: 'O primeiro link abre o vagão onde a pendência surgiu; o segundo, o vagão cuja liberação excepcional a aceitou.',
  },
  {
    target: 'dividas-resolver',
    title: 'Resolver a dívida',
    body: '"Registrar resolução" pede como a pendência foi resolvida e encerra a dívida, sem apagar de onde ela veio. A pendência passa a aparecer como resolvida também no vagão de origem.',
  },
];

import type { TourStep } from '../tours';

/** Tour da tela Administração › Agente de IA (27/10/2026): consumo por pessoa e por obra, limite
 * mensal por pessoa e corte de acesso. Só administrador vê a tela. */
export const steps: TourStep[] = [
  {
    title: 'Agente de IA',
    body: 'Tela restrita a administradores: mostra quanto cada pessoa e cada obra gastaram de IA no mês, deixa definir um limite mensal por pessoa e cortar o acesso de quem exagerou. O custo vem dos tokens que a API da Anthropic devolve a cada chamada.',
  },
  {
    target: 'agente-admin-ajuda',
    title: 'Como funciona',
    body: 'Abre o resumo das regras: o teto mensal geral (US$ 20 por padrão, absoluto), a parte de cada obra (o teto dividido pelas obras ativas, com folga de 1,5×), o limite opcional por pessoa e o que o corte de acesso faz. Fecha com Esc ou clicando fora.',
  },
  {
    target: 'agente-admin-mes',
    title: 'Mês',
    body: 'As setas voltam ou avançam um mês; a tela inteira passa a mostrar o consumo daquele mês. Abre no mês atual e não vai além dele, porque ainda não há uso futuro.',
  },
  {
    target: 'agente-admin-resumo',
    title: 'Resumo do mês',
    body: 'Gasto do mês contra o teto (fica amarelo a partir de 70% e vermelho a partir de 90%), quantas chamadas ao modelo foram feitas e qual modelo está em uso. A barra mostra a mesma proporção de relance.',
  },
  {
    target: 'agente-admin-usuarios',
    title: 'Pessoas',
    body: 'Uma linha por pessoa, da que mais gastou para a que menos gastou: papel, gasto no mês, chamadas separadas em leituras e perguntas, último uso, limite mensal e acesso. A linha vermelha é de quem está com o acesso cortado; o rodapé soma tudo.',
  },
  {
    target: 'agente-admin-limite',
    title: 'Limite mensal',
    body: 'Valor em dólares que a pessoa pode gastar no mês, além dos tetos gerais. Salva ao sair do campo ou com Enter e mostra "Salvo"; vazio é sem limite. Valor negativo ou que não é número não é salvo, e o campo volta ao anterior.',
  },
  {
    target: 'agente-admin-corte',
    title: 'Cortar ou liberar o acesso',
    body: 'Cortar acesso bloqueia só a IA para aquela pessoa: o radar determinístico continua funcionando. A linha ganha o chip "Cortado" e o botão vira Liberar, que reabre na hora. Vale assim que você clica, sem botão de salvar.',
  },
  {
    target: 'agente-admin-obras',
    title: 'Obras',
    body: 'Uma linha por obra, da que mais gastou para a que menos gastou: gasto, chamadas, a parte do teto que cabe a ela e quanto dessa parte já foi usado. Obra inativa aparece em cinza; ela ainda conta o que gastou, mas não entra na divisão do teto.',
  },
];

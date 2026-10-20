import type { TourStep } from '../tours';

export const steps: TourStep[] = [
  {
    title: 'Bem-vindo ao Obra 360',
    body: 'Esta é a lista das obras a que você tem acesso. Use "Próximo" para avançar e "Sair" a qualquer momento: o tour só explica, não altera nada.',
  },
  {
    target: 'obras-actions',
    title: 'Cadastrar obra',
    body: 'Abre o formulário com o nome e o código da obra (o código não pode repetir o de outra). Ao salvar, a obra já fica liberada para você e abre em seguida. Só gestor e administrador veem este botão.',
  },
  {
    target: 'obras-empty',
    title: 'Nenhuma obra liberada',
    body: 'Você ainda não tem acesso a nenhuma obra. Um administrador libera o acesso em Configurações, na sua linha da lista de usuários.',
  },
  {
    target: 'obras-grid',
    title: 'Suas obras',
    body: 'Um cartão por obra liberada para você, com o código e o nome. A cor da barra no topo e da borda acompanha o selo de saúde do cartão.',
  },
  {
    target: 'obras-card-status',
    title: 'Selo de saúde',
    body: 'Em dia, Atenção ou Crítico: vale o pior dos três indicadores do cartão. Uma restrição vencida deixa a obra em Crítico mesmo com o PPC bom, porque é ela que vai parar a frente.',
  },
  {
    target: 'obras-card-indicators',
    title: 'Indicadores da obra',
    body: 'PPC da última semana com todos os compromissos apurados (verde a partir de 80%, amarelo de 60%, vermelho abaixo; "—" sem semana apurada), restrições abertas com prazo vencido e vagões com o takt vencido.',
  },
  {
    target: 'obras-card-progress',
    title: 'Progresso em produção',
    body: 'Aparece quando a obra tem vagões em produção: é o progresso ponderado das atividades desses vagões, ou seja, do que está sendo executado agora.',
  },
  {
    target: 'obras-card-open',
    title: 'Abrir a obra',
    body: 'O cartão inteiro é um link: clique em qualquer ponto dele para abrir a obra no cronograma de curto prazo. Quem desenvolve o sistema entra pelo longo prazo.',
  },
  {
    target: 'modo-reuniao',
    title: 'Modo reunião',
    body: 'Aumenta o texto do sistema inteiro um degrau, para ler no projetor da sala. A escolha fica guardada neste navegador e vale para todas as telas.',
  },
];

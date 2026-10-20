import type { TourStep } from '../tours';

export const steps: TourStep[] = [
  {
    title: 'Integração com o Prevision',
    body: 'O cronograma do Prevision fica salvo no sistema e só é consultado de novo quando você pede. Daqui as atividades entram nos vagões, inteiras ou fatiadas pelo período de cada vagão.',
  },
  {
    target: 'prevision-help',
    title: 'Como funciona',
    body: 'Abre a explicação da integração: quando o Prevision é consultado, como a atualização refaz os vagões e quais papéis podem disparar a consulta.',
  },
  {
    target: 'prevision-sync',
    title: 'Atualizar do Prevision',
    body: 'Busca o cronograma mais recente e, depois de confirmar, refaz os vagões futuros ainda não liberados. Vagões liberados e sequências geradas pelo longo prazo não mudam; atividades com progresso ou critério preenchido nos vagões refeitos são removidas.',
  },
  {
    target: 'prevision-saved',
    title: 'Cronograma salvo',
    body: 'O projeto vinculado, quantas atividades foram salvas, quantas já estão em vagões e quantas faltam, e quando foi a última atualização.',
  },
  {
    target: 'prevision-responsible',
    title: 'Responsável local',
    body: 'Escolha quem responde pelas atividades importadas. É obrigatório: sem ele, os botões de adicionar ficam desligados.',
  },
  {
    target: 'prevision-link',
    title: 'Vincular ao Prevision',
    body: 'Aparece enquanto a obra não tem projeto. Listar projetos consulta o Prevision; escolha o projeto e use Atualizar do Prevision. O vínculo fica gravado na primeira atividade adicionada a um vagão.',
  },
  {
    target: 'prevision-tabs',
    title: 'Três formas de organizar',
    body: 'Disponíveis para vagão lista o que falta encaixar; Fora do período, o que não cruza nenhum vagão existente; Escolher por vagão permite marcar várias atividades de uma vez para um vagão.',
  },
  {
    target: 'prevision-search',
    title: 'Buscar atividade',
    body: 'Filtra as listas pelo nome da atividade ou pelo local.',
  },
  {
    target: 'prevision-pool',
    title: 'Disponíveis para vagão',
    body: 'Atividades que ainda não estão em vagão, com previsão, linha de base e duração. A que atravessa mais de um vagão é dividida em fatias proporcionais aos dias de cada período, sempre somando 100%.',
  },
  {
    target: 'prevision-add',
    title: 'Adicionar ao vagão',
    body: 'Adiciona a atividade aos vagões indicados na coluna de distribuição, uma fatia por vagão quando ela atravessa vários. Exige o responsável local.',
  },
  {
    target: 'prevision-milestones',
    title: 'Fora do período',
    body: 'Atividades que não cabem nos vagões existentes, em geral anteriores ao início do planejamento. Mostra o desvio da linha de base em dias (vermelho atrasa, verde adianta) e o progresso.',
  },
  {
    target: 'prevision-wagon',
    title: 'Escolher por vagão',
    body: 'Lista só as atividades pendentes que cabem inteiras no período do vagão escolhido; marque as que devem entrar.',
  },
  {
    target: 'prevision-wagon-pick',
    title: 'Vagão de destino',
    body: 'Escolha o vagão pelo número, período e quantas atividades ele já tem. Marcar todas seleciona de uma vez as atividades que cabem nele.',
  },
  {
    target: 'prevision-wagon-import',
    title: 'Adicionar selecionadas',
    body: 'Adiciona as atividades marcadas ao vagão escolhido, com o responsável local. O link ao lado abre o vagão.',
  },
];

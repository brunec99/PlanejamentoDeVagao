import type { TourStep } from '../tours';

export const steps: TourStep[] = [
  {
    title: 'Detalhe do vagão',
    body: 'Esta tela reúne tudo sobre um período de takt: atividades, critérios de terminalidade, liberação, pendências, restrições, dívidas e histórico. O perfil Consulta vê tudo, mas não altera nada.',
  },
  {
    target: 'work-nav',
    title: 'Seções da obra',
    body: 'O vagão pertence à aba 2, Planejamento por vagões, acesa na lateral. Daqui se chega às demais abas e às telas de Apoio da obra.',
  },
  {
    target: 'modo-reuniao',
    title: 'Modo reunião',
    body: 'Aumenta o texto do sistema inteiro para projetar na sala de reunião. Clique de novo para voltar ao tamanho normal; a escolha fica guardada neste navegador.',
  },
  {
    target: 'vagao-trilha',
    title: 'Caminho até aqui',
    body: '"Obras" volta à lista de obras, e o nome da obra volta à lista de vagões. O link no fim da página faz o mesmo.',
  },
  {
    target: 'vagao-titulo',
    title: 'Vagão e período',
    body: 'A sequência, o número do vagão e os marcos inicial e final do período. A marca "passado" aparece quando o período já terminou.',
  },
  {
    target: 'vagao-status',
    title: 'Status do vagão',
    body: 'Não iniciado, Em produção, Com restrição (há restrição aberta que bloqueia) ou Terminal. "Takt vencido" avisa que o período acabou sem terminalidade: sinaliza atraso, mas não impede concluir o vagão.',
  },
  {
    target: 'vagao-actions',
    title: 'Ações do vagão',
    body: 'Cada botão abre um formulário na lateral. Em vagão já terminal, incluir atividade, critério, pendência ou restrição reabre a terminalidade: só gestor ou admin pode, e a justificativa passa a ser obrigatória.',
  },
  {
    target: 'vagao-nova-atividade',
    title: 'Adicionar atividade',
    body: 'Informe nome, local, responsável, datas, peso e se a atividade é obrigatória para a terminalidade. As datas precisam caber no período do vagão, e o peso define quanto ela conta no progresso. Ela nasce com 0% e "Não iniciada".',
  },
  {
    target: 'vagao-novo-criterio',
    title: 'Critério de terminalidade',
    body: 'Uma condição de aceite ligada a uma atividade deste vagão. Os critérios obrigatórios precisam ser confirmados para o vagão virar terminal; os opcionais ficam só como registro.',
  },
  {
    target: 'vagao-nova-pendencia',
    title: 'Registrar pendência',
    body: 'Item em aberto do período, ligado a uma atividade ou ao vagão todo, com responsável e prazo. Marcada como "Bloqueia terminalidade", impede o vagão de virar terminal. É pela pendência que o vagão seguinte pode ter liberação excepcional.',
  },
  {
    target: 'vagao-nova-restricao',
    title: 'Registrar restrição',
    body: 'Impedimento com responsável e prazo, que pode bloquear a execução, a terminalidade ou ambas. Com bloqueio de execução, o progresso não avança; aberta, ela impede liberar os vagões seguintes, mesmo de forma excepcional.',
  },
  {
    target: 'vagao-editar-periodo',
    title: 'Editar período',
    body: 'Altera os marcos e o responsável do vagão. O novo período precisa conter todas as atividades e não pode sobrepor os vagões vizinhos. Depois da liberação o período não muda mais, e o botão some.',
  },
  {
    target: 'vagao-reaberta',
    title: 'Terminalidade reaberta',
    body: 'Aparece quando um vagão anterior teve a terminalidade reaberta e ainda não voltou a ser terminal. A base da liberação deste vagão mudou: reavalie a liberação e registre as novas pendências.',
  },
  {
    target: 'vagao-resumo',
    title: 'Takt, progresso e responsáveis',
    body: 'A duração do takt, em dias corridos ou úteis conforme a sequência; o progresso ponderado, que é a média do progresso das atividades pelo peso de cada uma; e os responsáveis pelo período.',
  },
  {
    target: 'vagao-vizinhos',
    title: 'Vagão anterior e seguinte',
    body: 'Atalhos para os vizinhos na sequência, com o período de cada um. O anterior é a base da liberação deste vagão; o primeiro da sequência não tem anterior.',
  },
  {
    target: 'vagao-activities',
    title: 'Atividades do período',
    body: 'Cada linha mostra local, se é obrigatória, responsável, previsão, progresso, status, peso e origem (manual, Prevision ou plano de longo prazo). Um mesmo vagão pode reunir pavimentos e zonas diferentes.',
  },
  {
    target: 'vagao-editar-atividade',
    title: 'Editar atividade',
    body: 'Abre todos os campos, inclusive progresso e status. Avançar exige o vagão liberado e sem restrição de execução; reduzir o progresso ou desfazer a conclusão pede justificativa, e em vagão terminal só gestor ou admin altera.',
  },
  {
    target: 'vagao-criteria',
    title: 'Terminalidade',
    body: 'O vagão vira terminal quando tem atividades obrigatórias, todas concluídas a 100%, os critérios obrigatórios confirmados e nenhuma pendência ou restrição aberta que bloqueie. O resumo no topo conta o que já foi atendido.',
  },
  {
    target: 'vagao-criterio-acao',
    title: 'Confirmar ou reabrir critério',
    body: '"Confirmar critério" registra quem confirmou e quando, e só vale com o vagão liberado e sem restrição de execução. "Reabrir critério" num vagão terminal tira a terminalidade: só gestor ou admin, com justificativa.',
  },
  {
    target: 'vagao-release',
    title: 'Liberação deste vagão',
    body: 'Mostra a liberação registrada: tipo, quem autorizou e quando e, se excepcional, a justificativa, o prazo de regularização e as pendências aceitas. Antes dela, avisa as restrições impeditivas dos anteriores e as condições ainda sem pendência.',
  },
  {
    target: 'vagao-liberar',
    title: 'Liberar o vagão',
    body: 'O tipo vem sozinho: inicial no primeiro vagão, normal quando o anterior é terminal e nada ficou pendente, excepcional nos demais casos. A excepcional é só para gestor ou admin, com justificativa e prazo futuro, e as pendências aceitas viram dívidas.',
  },
  {
    target: 'vagao-pending',
    title: 'Pendências',
    body: 'Itens em aberto deste vagão, com responsável, prazo e se bloqueiam a terminalidade. "Vencida" marca a pendência aberta com prazo já passado.',
  },
  {
    target: 'vagao-resolver-pendencia',
    title: 'Resolver pendência',
    body: '"Registrar resolução" pede como a pendência foi resolvida e a encerra. Se ela tinha virado dívida de terminalidade, a dívida também se encerra, sem apagar o registro de onde veio.',
  },
  {
    target: 'vagao-restrictions',
    title: 'Restrições',
    body: 'Impedimentos deste vagão, com responsável, prazo e o que bloqueiam: a execução, a terminalidade ou ambas. Diferente da pendência, restrição impeditiva não é contornada por liberação excepcional.',
  },
  {
    target: 'vagao-resolver-restricao',
    title: 'Resolver restrição',
    body: '"Registrar resolução" pede como a restrição foi resolvida e a encerra, soltando o que ela bloqueava. No módulo de restrições do longo prazo, ela passa para "Resolvida".',
  },
  {
    target: 'vagao-dividas',
    title: 'Dívidas de terminalidade',
    body: 'Pendências deste vagão ou de anteriores aceitas numa liberação excepcional. Cada uma mostra se é própria ou herdada, a liberação que a gerou, o responsável, o prazo e a situação. Ela se encerra ao resolver a pendência de origem.',
  },
  {
    target: 'vagao-historico',
    title: 'Histórico',
    body: 'O que foi registrado no vagão e nas atividades dele, do mais recente ao mais antigo, com autor, data e hora e, quando houver, a justificativa ou a resolução. Se não carregar, use "Tentar de novo".',
  },
];

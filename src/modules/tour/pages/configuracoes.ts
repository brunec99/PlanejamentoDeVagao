import type { TourStep } from '../tours';

export const steps: TourStep[] = [
  {
    title: 'Configurações',
    body: 'Tela restrita a administradores: cadastro de usuários, pedidos de acesso, papéis, acesso às obras e aos módulos e o estado do banco de dados. Quem desenvolve o sistema vê também o takt de cada sequência.',
  },
  {
    target: 'config-ajuda',
    title: 'Como funciona',
    body: 'Abre o resumo das regras desta tela: takt, cadastro e acessos, e a diferença entre migrações críticas e opcionais. Fecha com Esc ou clicando fora.',
  },
  {
    target: 'config-restrito',
    title: 'Acesso restrito',
    body: 'Seu papel não é de administrador, então esta tela não mostra nada. Peça a um administrador para mudar seu papel, suas obras ou seus módulos.',
  },
  {
    target: 'config-takt',
    title: 'Takt por obra',
    body: 'Uma linha por obra, com cada sequência de produção dela: o takt padrão e a data de início do primeiro vagão. Só quem desenvolve o sistema vê esta seção, porque os vagões ainda estão em desenvolvimento.',
  },
  {
    target: 'config-takt-field',
    title: 'Takt padrão',
    body: 'Duração, em dias (de 1 a 365), dos vagões que a sequência gera na regeneração pelo Prevision e na sincronização com o longo prazo. Ao mudar o número aparece Salvar; vagões já criados não mudam.',
  },
  {
    target: 'config-start-date',
    title: 'Início do primeiro vagão',
    body: 'Enquanto nenhum vagão da sequência for liberado, a regeneração pelo Prevision parte desta data em vez de hoje; depois, o limite passa a ser o vagão liberado. Ao mudar a data aparece Salvar; salvar com o campo vazio volta a partir de hoje.',
  },
  {
    target: 'config-requests',
    title: 'Pedidos de acesso',
    body: 'Aparece quando alguém sem cadastro pediu acesso pela tela de login. Mostra o nome, o e-mail (confirmado pelo Google ou só digitado), quando pediu e a mensagem, se houver.',
  },
  {
    target: 'config-request-actions',
    title: 'Cadastrar ou dispensar',
    body: 'Cadastrar cria o usuário com papel de consulta e sem obras: libere obras e módulos na grade abaixo e avise a pessoa para entrar de novo com o Google. Dispensar só tira o pedido da lista.',
  },
  {
    target: 'config-invite',
    title: 'Cadastrar usuário',
    body: 'Só entra quem foi cadastrado aqui. Informe o e-mail (o nome é opcional) e clique em Cadastrar: a pessoa entra com a conta Google desse e-mail, e nenhum e-mail é enviado. Se houver pedido do mesmo e-mail, ele sai da lista.',
  },
  {
    target: 'config-invite-role',
    title: 'Papel',
    body: 'Consulta só vê; Planejador edita o planejamento; Gestor também cadastra obras, libera vagão em caráter excepcional e reabre vagão terminal; Admin, além disso, usa esta tela. Dá para trocar depois, na grade.',
  },
  {
    target: 'config-users',
    title: 'Usuários e acessos',
    body: 'Uma grade com uma linha por pessoa, em ordem alfabética, e uma coluna por obra (ou por módulo). O que se muda aqui vale na hora, sem botão de salvar.',
  },
  {
    target: 'config-users-filters',
    title: 'Pesquisar e filtrar',
    body: 'Pesquise pelo nome ou pelo e-mail (sem diferença de acento) e filtre por papel ou por obra; "Sem obra liberada" mostra quem foi cadastrado e ainda não vê nada. Clique em Usuário ou em Papel, no cabeçalho, para ordenar; clicar de novo inverte a ordem.',
  },
  {
    target: 'config-users-view',
    title: 'Obras ou módulos',
    body: 'Troca as colunas da grade: Obras mostra uma coluna por obra; Módulos, uma por módulo em desenvolvimento. O número embaixo do nome da coluna diz quantos dos usuários listados têm aquele acesso.',
  },
  {
    target: 'config-user-role',
    title: 'Papel do usuário',
    body: 'Troca o papel da pessoa assim que você escolhe outro. Na sua própria linha o campo fica travado: ninguém tira o próprio acesso de administrador.',
  },
  {
    target: 'config-user-works',
    title: 'Obras liberadas',
    body: 'Cada célula cruza uma pessoa com uma obra: preenchida, com o visto, é obra liberada. Clique para liberar ou revogar; quem não tem a obra liberada não a vê na lista de obras.',
  },
  {
    target: 'config-user-modules',
    title: 'Módulos liberados',
    body: 'Na visão Módulos, cada célula libera ou bloqueia um módulo em desenvolvimento para a pessoa. Curto prazo, terminalidade e configurações da obra são abertos a todos e não aparecem. Admin vê todos: as células dele ficam marcadas em cinza, sem clique.',
  },
  {
    target: 'config-user-delete',
    title: 'Excluir usuário',
    body: 'A lixeira no fim da linha. Depois de confirmar, a pessoa perde o acesso ao Obra 360 e precisa ser cadastrada de novo; a conta de login continua valendo nos outros sistemas da ATR. Não aparece na sua própria linha.',
  },
  {
    target: 'config-db',
    title: 'Banco de dados',
    body: 'Pergunta ao banco quais migrações conhecidas já estão aplicadas. Faltando uma crítica, as telas não carregam; faltando uma opcional, só a funcionalidade dela fica indisponível. A tabela diz o que cada uma faz e o efeito da falta.',
  },
  {
    target: 'config-db-refresh',
    title: 'Verificar de novo',
    body: 'Refaz a consulta ao banco. Use depois de aplicar uma migração no painel do Supabase, para conferir se ela entrou.',
  },
];

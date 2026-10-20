import type { TourStep } from '../tours';

/* Tour do modo de campo (`/campo/terminalidade`, no celular). As telas se revezam na mesma rota: a
 * lista de obras, a obra aberta e as folhas de lançar, resolver e juntar foto. O passo de uma tela que
 * não está aberta é pulado sozinho, e cada tela tem um alvo que só existe nela.
 * As folhas vêm logo depois da abertura, fora da ordem da tela: elas cobrem o cabeçalho, então o tour
 * dos campos do formulário só começa pelo "?" da própria folha, e o formulário é o que importa ali.
 * Começando pelo "?" do cabeçalho, nenhuma folha está aberta e esses passos não aparecem. */
export const steps: TourStep[] = [
  {
    title: 'Terminalidade no celular',
    body: 'A lista de pendências da obra para usar andando pelo canteiro. Baixe a obra com sinal; depois ela abre sem internet, o que você lançar fica no aparelho e sobe sozinho quando a conexão voltar. Editar e excluir pendências é no computador, na aba 5.',
  },

  // Folha "Nova pendência"
  {
    target: 'campo-nova',
    title: 'Nova pendência',
    body: 'Lança uma pendência com foto. Ela fica guardada no aparelho e entra na lista na hora, mesmo sem sinal. Depois de lançada, só se edita ou exclui no computador.',
  },
  {
    target: 'campo-nova-local',
    title: 'Pavimento e apto',
    body: 'O pavimento é obrigatório. O apto ou área é opcional: vazio vale para o pavimento todo, e a lista depende do pavimento escolhido. Os dois já vêm com o filtro da lista.',
  },
  {
    target: 'campo-nova-descricao',
    title: 'Descrição',
    body: 'O que precisa ser corrigido, em até 1.000 caracteres. É nesse texto que a busca da lista procura.',
  },
  {
    target: 'campo-nova-tipo-data',
    title: 'Tipo e data',
    body: 'O tipo é opcional e sai da lista cadastrada no computador. A data da observação começa em hoje e não aceita dia futuro.',
  },
  {
    target: 'campo-nova-responsaveis',
    title: 'Responsáveis',
    body: 'Quem da ATR acompanha e a empresa que vai corrigir, os dois opcionais. A empresa pode ser digitada ou escolhida entre as das equipes cadastradas na obra.',
  },
  {
    target: 'campo-nova-fotos',
    title: 'Fotos da pendência',
    body: 'Câmera tira a foto com o celular, e dá para juntar várias. Elas são reduzidas no próprio aparelho antes de guardar; o X no canto tira uma antes de lançar. Aqui as fotos são opcionais.',
  },
  {
    target: 'campo-nova-lancar',
    title: 'Lançar pendência',
    body: 'Guarda a pendência e as fotos no aparelho e fecha o formulário. Com sinal, sobe na hora; sem sinal, aparece na lista com a etiqueta "no aparelho" até ser enviada.',
  },

  // Folha "Resolver pendência"
  {
    target: 'campo-resolucao',
    title: 'Resolver pendência',
    body: 'Registra a correção da pendência descrita logo abaixo do título. Ao confirmar, ela passa para Resolvidas, também sem sinal.',
  },
  {
    target: 'campo-resolucao-data',
    title: 'Corrigida em',
    body: 'Começa em hoje. Não aceita dia futuro nem data anterior à da observação.',
  },
  {
    target: 'campo-resolucao-nota',
    title: 'Como foi corrigido',
    body: 'Opcional: o que foi feito e por quem. Aparece no cartão como "Correção:" e sai se a pendência for reaberta.',
  },
  {
    target: 'campo-resolucao-fotos',
    title: 'Foto da correção',
    body: 'Obrigatória quando a pendência ainda não tem foto da correção; se já tiver, mais fotos são opcionais. Câmera tira a foto, e o X tira uma antes de confirmar.',
  },
  {
    target: 'campo-resolucao-salvar',
    title: 'Marcar como resolvida',
    body: 'Fica apagado até haver foto da correção. Guarda as fotos e a resolução no aparelho e fecha; com sinal, sobem na hora.',
  },

  // Folha "Foto da pendência"
  {
    target: 'campo-mais-fotos',
    title: 'Mais fotos do problema',
    body: 'Junta fotos a uma pendência aberta sem resolvê-la, para mostrar melhor o problema.',
  },
  {
    target: 'campo-mais-fotos-camera',
    title: 'Câmera',
    body: 'Tire uma ou mais fotos; elas são reduzidas no aparelho antes de guardar. O X no canto tira uma foto da seleção.',
  },
  {
    target: 'campo-mais-fotos-guardar',
    title: 'Guardar',
    body: 'Fica apagado até haver ao menos uma foto. Guarda no aparelho e fecha; as fotos sobem sozinhas quando houver sinal.',
  },

  // Cabeçalho e avisos (todas as telas)
  {
    target: 'campo-sair',
    title: 'Voltar ao Obra 360',
    body: 'Leva ao sistema completo, que precisa de internet. O que está guardado neste aparelho continua aqui para quando você voltar.',
  },
  {
    target: 'campo-obra-aberta',
    title: 'Obra aberta',
    body: 'Nome da obra e a hora em que ela foi baixada. A lista abaixo é a cópia guardada no aparelho, já com o que você lançou e ainda não foi enviado.',
  },
  {
    target: 'campo-voltar-obras',
    title: 'Voltar às obras',
    body: 'Volta para a lista de obras. A obra continua baixada e abre de novo sem sinal.',
  },
  {
    target: 'campo-conexao',
    title: 'Com ou sem sinal',
    body: 'Mostra se o celular está com internet agora. Sem sinal, a obra baixada funciona igual; só baixar ou atualizar obra e enviar dependem da conexão.',
  },
  {
    target: 'campo-enviar',
    title: 'Enviar agora',
    body: 'Envia já o que está guardado no aparelho. Não é obrigatório: com sinal, o envio acontece sozinho ao lançar e quando a conexão volta. Fica apagado sem sinal ou sem nada para enviar.',
  },
  {
    target: 'campo-fila',
    title: 'Guardado no aparelho',
    body: 'Quantas alterações ainda estão só neste celular. Elas sobem sozinhas, na ordem em que foram lançadas, quando houver sinal.',
  },
  {
    target: 'campo-entrar',
    title: 'Entrar de novo',
    body: 'A sessão venceu e o servidor parou de aceitar o envio. Entre de novo para continuar: o login volta para esta tela, e o que foi lançado segue guardado no aparelho.',
  },
  {
    target: 'campo-recusadas',
    title: 'Alterações recusadas',
    body: 'O servidor recusou uma alteração por alguma regra, e o envio para nela para não trocar a ordem. Cada linha mostra o que era, quando foi lançada e o motivo.',
  },
  {
    target: 'campo-descartar',
    title: 'Descartar',
    body: 'Tira a alteração recusada do aparelho, junto com o que dependia dela (fotos e resolução de uma pendência nova). Ela não sobe: se ainda for preciso, lance de novo. O resto da fila sobe no próximo envio.',
  },

  // Lista de obras
  {
    target: 'campo-preparar',
    title: 'Prepare com sinal',
    body: 'Neste aparelho ainda não há obras guardadas. Com internet, carregue suas obras e baixe a que vai usar: depois ela abre no canteiro sem sinal.',
  },
  {
    target: 'campo-carregar-obras',
    title: 'Carregar minhas obras',
    body: 'Busca as obras liberadas para o seu usuário. Só aparece com sinal.',
  },
  {
    target: 'campo-obras',
    title: 'Suas obras',
    body: 'As obras liberadas para você. Baixe cada uma com sinal antes de ir ao canteiro: sem internet, só abre a obra que já está no aparelho.',
  },
  {
    target: 'campo-obra',
    title: 'Abrir ou baixar a obra',
    body: 'Toque para abrir. Se ela ainda não estiver no aparelho, é baixada primeiro, com as fotos das pendências abertas. "Pronta sem sinal" mostra quantas estão abertas e quantas alterações faltam enviar.',
  },

  // Obra aberta
  {
    target: 'campo-situacao',
    title: 'Abertas ou resolvidas',
    body: 'Filtra a lista pela situação, com a contagem de cada uma. A tela abre em Abertas.',
  },
  {
    target: 'campo-local',
    title: 'Pavimento e unidade',
    body: 'Mostram só um pavimento e, dentro dele, um apto ou área. A unidade só libera depois do pavimento, e uma pendência nova já vem com os dois preenchidos.',
  },
  {
    target: 'campo-busca',
    title: 'Buscar na descrição',
    body: 'Procura palavras na descrição, sem diferença de acento ou maiúscula. Com várias palavras, mostra só as pendências que têm todas.',
  },
  {
    target: 'campo-pendencia',
    title: 'Cada pendência',
    body: 'Local, tipo e situação no topo; depois a descrição, a data da observação, os responsáveis e as fotos. "no aparelho" marca o que ainda não foi enviado, e "correção", a foto da correção.',
  },
  {
    target: 'campo-resolver',
    title: 'Resolver',
    body: 'Abre o registro da correção: data, como foi corrigido e a foto da correção.',
  },
  {
    target: 'campo-foto',
    title: 'Foto',
    body: 'Junta mais fotos do problema a esta pendência, sem resolvê-la.',
  },
  {
    target: 'campo-reabrir',
    title: 'Reabrir',
    body: 'Nas resolvidas: volta a pendência para Abertas, se o problema não foi resolvido de fato. A data e a descrição da correção saem; as fotos ficam.',
  },
  {
    target: 'campo-atualizar',
    title: 'Atualizar a obra',
    body: 'Baixa de novo a obra, com o que a equipe lançou no computador e em outros celulares. Só aparece com sinal; o que está na fila do aparelho não se perde.',
  },
  {
    target: 'campo-nova-pendencia',
    title: 'Abrir nova pendência',
    body: 'Abre o formulário da pendência nova, já com o pavimento e a unidade do filtro. Funciona sem sinal.',
  },
];

import type { TourStep } from '../tours';

/** Aba 4, nas duas seções (`?secao=`): os passos da planilha só têm alvo na planilha e os do fechamento só
 * no fechamento, então cada seção mostra os seus. As marcas das células ficam na primeira linha da semana
 * analisada; as dos botões de Apontamento, na primeira linha que tem o botão. */
export const steps: TourStep[] = [
  {
    title: 'Aba 4 · Curto prazo',
    body: 'A planilha da semana: o que cada empreiteiro se compromete a fazer, se cumpriu (Sim ou Não) e por quê. Ela se sustenta sozinha, sem depender do plano do mês. O fechamento, com a série do PPC e o Pareto das causas, fica numa seção à parte.',
  },
  {
    target: 'modo-reuniao',
    title: 'Modo reunião',
    body: 'Aumenta o texto do sistema inteiro para projetar a planilha na reunião semanal. A escolha fica guardada neste navegador; clique de novo para voltar ao tamanho normal.',
  },
  {
    target: 'tab-ajuda',
    title: 'Como funciona',
    body: 'Resume as regras da planilha: o que se marca sozinho, quando o Não é gravado, até quando a semana fica aberta, as semanas vizinhas e de onde vem a semana 1.',
  },
  {
    target: 'curto-secoes',
    title: 'Planilha ou fechamento',
    body: '"Planilha da semana" é onde se planeja e se aponta. "Fechamento" lê essas mesmas linhas e mostra a série do PPC, o Pareto das causas e as justificativas. A seção fica no endereço da página: o Voltar do navegador funciona.',
  },

  // Planilha da semana
  {
    target: 'curto-semana',
    title: 'Semana analisada',
    body: 'Escolhe a semana exibida na planilha: da semana 1 da obra até quatro semanas à frente da atual, mais qualquer semana que já tenha linha. A tela abre sempre na semana atual.',
  },
  {
    target: 'curto-semana-atual',
    title: 'Semana atual e semana 1',
    body: 'O número da semana de hoje, contado a partir da semana 1 da obra; sem ela, a contagem parte da primeira semana com linha. O link abre as configurações da obra para definir ou alterar a semana 1.',
  },
  {
    target: 'curto-ppc',
    title: 'PPC da semana',
    body: 'Linhas cumpridas (Sim) sobre o total de linhas da semana analisada. Linha sem Status conta como não cumprida até ser apontada; o número entre parênteses diz quantas faltam. Não é a média dos percentuais executados.',
  },
  {
    target: 'curto-desfazer',
    title: 'Desfazer',
    body: 'Desfaz a última gravação desta sessão: apontamento (de uma linha, do lote ou da alça), justificativa, edição de célula, "Levar", exclusão ou linha nova. Ctrl+Z (Cmd+Z no Mac) fora de um campo de texto faz o mesmo, e os avisos de ação trazem o próprio "Desfazer". Como no Sheets, recarregar a página zera a lista.',
  },
  {
    target: 'curto-vizinhas',
    title: 'Semanas vizinhas',
    body: 'Mostra a semana anterior acima e a próxima abaixo, na mesma planilha e com os mesmos filtros de coluna, para levar o que faltou de uma semana para a outra. Nessa visão qualquer linha pode ser levada. A escolha fica lembrada neste navegador.',
  },
  {
    target: 'curto-como-preencher',
    title: 'Como preencher',
    body: 'Lembrete rápido das células: Empresa e Equipe aceitam um nome novo digitado, e a equipe nova entra no cadastro da empresa da linha com capacidade de 3 atividades por semana, ajustável depois.',
  },
  {
    target: 'curto-recursos',
    title: 'Empreiteiros e equipes',
    body: 'Abre as configurações da obra, onde ficam o cadastro de empreiteiros e equipes, a capacidade de cada equipe e a semana 1. Para quem só consulta, o link se chama "Consultar recursos".',
  },
  {
    target: 'curto-pdf-planejamento',
    title: 'PDF do planejamento',
    body: 'Abre uma janela para escolher os empreiteiros (começa pelo filtro da coluna Empresa, se houver) e a ordem das linhas. Gera numa aba nova a semana analisada no formato da planilha da obra, com o tempo da semana; na impressão, escolha "Salvar como PDF".',
  },
  {
    target: 'curto-pdf-fechamento',
    title: 'PDF do fechamento',
    body: 'A mesma janela, mas o PDF ("Resultados Semana N") traz também Realizado, causa e justificativa de cada linha. Gere depois de apontar o Sim ou o Não da semana.',
  },
  {
    target: 'curto-ajustar',
    title: 'Ajustar à tela',
    body: 'Redistribui as colunas para a planilha caber na largura da tela, sem descer do mínimo legível de cada uma, e guarda o ajuste neste navegador. Só aparece em telas largas.',
  },
  {
    target: 'curto-semana-encerrada',
    title: 'Semana encerrada',
    body: 'A semana fica aberta até a terça-feira seguinte. Depois disso, incluir, editar ou excluir linhas, só administradores; Status, causa e justificativa continuam abertos para quem edita a obra.',
  },
  {
    target: 'curto-limpar-filtros',
    title: 'Filtros ativos',
    body: 'Diz quantas linhas passam nos filtros de coluna. "Limpar filtros e classificação" volta a mostrar todas as linhas, na ordem de inclusão.',
  },
  {
    target: 'curto-ordem',
    title: 'Ordem das linhas',
    body: 'Como numa planilha, a linha nova entra embaixo e a editada não muda de lugar. "Organizar por empresa" junta as linhas de cada empresa, pela data de início; "Voltar à ordem de inclusão" desfaz.',
  },
  {
    target: 'curto-commitments',
    title: 'A planilha da semana',
    body: 'Cada linha é um compromisso, editável na própria célula: o que se escolhe numa lista grava na hora; texto e data, ao sair do campo. A linha em âmbar está gravando. No celular, cada linha vira um cartão.',
  },
  {
    target: 'curto-colunas',
    title: 'Filtrar, classificar, redimensionar',
    body: 'O funil de cada coluna classifica A→Z ou Z→A uma vez e filtra por valores, que só valem no OK. Arraste a borda do cabeçalho para mudar a largura; duplo clique volta ao padrão.',
  },
  {
    target: 'curto-marcar',
    title: 'Marcar várias linhas',
    body: 'A caixa de cada linha (ou esta, que marca todas as visíveis) abre a barra "linhas marcadas": escolha Status, causa e justificativa uma vez e aplique a todas numa gravação só. Com a planilha filtrada, só as linhas à vista contam.',
  },
  {
    target: 'curto-faixa-semana',
    title: 'Faixas das semanas',
    body: 'Com Semanas vizinhas, cada semana ganha uma faixa com período, linhas e PPC: a anterior em cima, a analisada no meio, a próxima embaixo. Na anterior só se aponta e se leva para a próxima; para editá-la, escolha-a no seletor.',
  },
  {
    target: 'curto-linha-empresa',
    title: 'Empresa',
    body: 'Escolha o empreiteiro na lista ou digite um nome novo. Trocar a empresa tira da linha a equipe de outra empresa, porque cada equipe pertence a uma empresa só.',
  },
  {
    target: 'curto-linha-semana',
    title: 'Semana da linha',
    body: 'Trocar a semana move a linha inteira: início e término andam as mesmas semanas, no mesmo dia da semana. A linha sai da semana analisada e vai para a escolhida.',
  },
  {
    target: 'curto-linha-inicio',
    title: 'Início',
    body: 'Primeiro dia do compromisso, dentro da semana. Se ficar depois do término, o término acompanha.',
  },
  {
    target: 'curto-linha-termino',
    title: 'Término',
    body: 'Último dia do compromisso, entre o início e o fim da semana. Início e término marcam os dias de SEG a SÁB.',
  },
  {
    target: 'curto-linha-atividade',
    title: 'Atividade',
    body: 'O que será feito, escrito à mão. Grava com Enter ou ao sair do campo; apagar o texto todo devolve o nome anterior, porque linha sem atividade não existe.',
  },
  {
    target: 'curto-linha-equipe',
    title: 'Equipe (opcional)',
    body: 'Lista as equipes da empresa da linha. Digitar um nome novo cria a equipe nessa empresa, com capacidade inicial de 3 atividades por semana. Sem empresa na linha, não dá para criar equipe.',
  },
  {
    target: 'curto-linha-dias',
    title: 'Dias de SEG a SÁB',
    body: 'Marcados sozinhos a partir do início e do término: não se clica neles. Para mudar os dias, mude o período.',
  },
  {
    target: 'curto-linha-status',
    title: 'Status: Sim ou Não',
    body: 'Ao encerrar a semana, aponte se o compromisso foi cumprido. A célula mostra a escolha na hora e a gravação segue por trás (filete âmbar enquanto sobe); nada trava. O Não só é gravado depois que a causa é escolhida, e até lá a linha fica em rosa. Enter desce para a linha de baixo. O quadradinho no canto da célula é a alça do Sheets: arraste para copiar o valor nas linhas vizinhas.',
  },
  {
    target: 'curto-linha-causa',
    title: 'Causa do não cumprido',
    body: 'Só abre quando o Status é Não. A causa vem de uma lista fechada para as falhas poderem ser somadas: é dela que sai o Pareto das causas, no Fechamento. Também tem a alça para copiar nas linhas vizinhas com Não.',
  },
  {
    target: 'curto-linha-justificativa',
    title: 'Justificativa',
    body: 'Texto livre ao lado da causa, em qualquer ordem: escrita antes do Status, fica guardada na linha e sobe junto com o Sim ou a causa. Grava ao sair do campo; Enter e as setas levam à linha vizinha. Aparece em "Justificativas por causa", no Fechamento.',
  },
  {
    target: 'curto-levar',
    title: 'Levar ›: levar para a próxima semana',
    body: 'Cria a mesma linha na semana seguinte, sem apontamento; a de origem não muda e o Não segue no PPC dela. Aparece na linha com Não ou, com Semanas vizinhas, em qualquer linha. "Levar de novo" avisa que ela já está na semana seguinte.',
  },
  {
    target: 'curto-gerar-restricao',
    title: 'Gerar restrição',
    body: 'Transforma o não cumprido numa restrição do quadro do longo prazo, ligada a um vagão e, se quiser, a uma atividade com lead time. A linha continua com o Não e a causa. Em desenvolvimento: só aparece para desenvolvedores.',
  },
  {
    target: 'curto-limpar-apontamento',
    title: 'Limpar: limpar o apontamento',
    body: 'Desfaz um Sim ou Não marcado por engano: tira Status, causa e justificativa, e a linha continua, sem Status. Pede confirmação quando o apontamento já estava gravado.',
  },
  {
    target: 'curto-linha-excluir',
    title: 'Excluir linha',
    body: 'O ✕ apaga a linha, com o Status e a causa, depois de confirmar. A série do PPC e o Pareto deixam de contá-la.',
  },
  {
    target: 'curto-linha-nova',
    title: 'Nova linha',
    body: 'Escreva a atividade e tecle Enter, ou saia da linha, para criá-la; no celular, use Adicionar. Empresa, equipe e datas podem ficar em branco: sem período, a linha nasce no primeiro dia da semana.',
  },

  // Fechamento
  {
    target: 'curto-fechamento',
    title: 'Fechamento da semana',
    body: 'Lê as linhas da planilha e mais nada: a série do PPC diz se o comprometimento está sendo aprendido; o Pareto, quais causas custam mais à obra. O "?" ao lado de cada título explica a leitura.',
  },
  {
    target: 'curto-fechamento-semana',
    title: 'Semana analisada',
    body: 'A semana destacada em âmbar na série do PPC, e a usada pelo Pareto, pelas justificativas e pela IA quando o período é "Esta semana". Abre na semana atual.',
  },
  {
    target: 'curto-fechamento-recorte',
    title: 'Empreiteiro e equipe',
    body: 'Recortam a série, o Pareto, as justificativas e a análise com IA. Marque ou desmarque na lista e confirme com OK; marcar tudo é não filtrar. "Limpar" tira o recorte.',
  },
  {
    target: 'curto-fechamento-serie',
    title: 'Série do PPC',
    body: 'As últimas 12 semanas, uma barra cada. Barra hachurada é semana com linha sem Status, fora da média; a faixa âmbar é a semana analisada; o tracejado, a média das semanas apuradas, que também aparece no cartão acima.',
  },
  {
    target: 'curto-fechamento-pareto',
    title: 'Pareto das causas',
    body: 'Conta as linhas com Não e causa, da causa mais frequente para a menos. Em vermelho, as poucas causas que somam os primeiros 80% das falhas: atacar essas é atacar a maior parte do que não foi cumprido.',
  },
  {
    target: 'curto-fechamento-periodo',
    title: 'Período do Pareto',
    body: 'A obra inteira (padrão) ou só a semana analisada; vale também para as justificativas e para a análise com IA. Numa semana só, cada causa aparece uma ou duas vezes e a ordem diz pouco.',
  },
  {
    target: 'curto-fechamento-justificativas',
    title: 'Justificativas por causa',
    body: 'As falhas agrupadas por causa, na ordem do Pareto, com o que foi escrito em cada uma. Os temas são termos repetidos em duas ou mais justificativas da mesma causa. Clique na causa para abrir ou fechar a lista.',
  },
  {
    target: 'curto-fechamento-busca',
    title: 'Pesquisar justificativas',
    body: 'Filtra pelo texto da justificativa, da atividade, do empreiteiro ou da equipe, sem diferenciar acentos. As causas com resultado se abrem sozinhas.',
  },
  {
    target: 'curto-fechamento-ia',
    title: 'Analisar com IA',
    body: 'Envia as linhas não cumpridas do recorte (período, empreiteiro e equipe) a um modelo de IA, que devolve temas por causa, padrões por empreiteiro e cinco ações recomendadas. Só lê: nada é gravado.',
  },
];

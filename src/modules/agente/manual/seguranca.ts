import type { ManualSection } from './types';

/** Manual da aba 6, Segurança do trabalho (05/11/2026): a vistoria dos técnicos de segurança (TST), no
 * processo da terminalidade (foto do apontamento, finalização com a foto da correção), com a lista única de
 * tipos, a edição em lote, o PDF e o modo de campo. Escrito a partir do código das telas, dos comandos e do
 * tour; descreve só o que está implementado. */
export const sections: ManualSection[] = [
  {
    id: 'seguranca-visao-geral',
    title: 'Segurança do trabalho: para que serve e quem pode o quê',
    summary: 'Aba 6: vistoria dos TSTs, colunas, quem grava (só TST) e o histórico da planilha SST (selo "Planilha").',
    keywords: [
      'segurança do trabalho',
      'aba 6',
      'tst',
      'técnico de segurança',
      'vistoria de segurança',
      'sst - controle geral',
      'quem pode lançar',
      'só o tst',
      'selo planilha',
      'histórico importado',
      'dias para resolver',
      'colunas da vistoria',
    ],
    screen: 'seguranca',
    body: `## O que é a aba 6, Segurança do trabalho

É a vistoria de segurança da obra feita pelos técnicos de segurança do trabalho (TST), no formato da planilha "SST - Controle geral" usada antes. Cada linha é um apontamento: um risco encontrado na vistoria, com tipo, risco (consequência e probabilidade), descrição, local, data e foto. O processo é o da aba 5, Terminalidade: o apontamento fica aberto até ser finalizado com a foto da correção e a data em que foi corrigido.

A aba fica logo abaixo da Terminalidade na lateral e é aberta a todos que têm a obra liberada. O botão "?" ("Como funciona") do cabeçalho explica a tela, e "Como usar a lista", ao lado do título "Apontamentos", resume a ordem, a classificação, os filtros e os cliques.

## Quem pode fazer o quê

- **TST**: só quem está marcado como TST lança, edita, edita em lote, finaliza, reabre e exclui apontamentos, junta e exclui fotos e mexe na lista de "Tipos de apontamento". Vale nas obras liberadas para a pessoa, qualquer que seja o papel dela, inclusive Consulta.
- **Todos os demais com a obra liberada, inclusive administradores, gestores e planejadores**: só consultam. Veem a lista, os indicadores e as fotos, abrem o apontamento ("Ver"), filtram, classificam e geram o PDF. Não aparecem "Novo apontamento", "Tipos de apontamento", as caixas de marcar, "Finalizar", "Reabrir" nem o "✕".
- Para quem só consulta, o topo mostra "Consulta: só os técnicos de segurança (TST) lançam e finalizam apontamentos." com os nomes ("TSTs desta obra: …") ou o aviso de que nenhum TST tem acesso à obra.
- Se algo tentar gravar sem ser TST, o servidor recusa: "Só técnicos de segurança (TST) lançam e finalizam apontamentos."
- Quem marca a pessoa como TST é o administrador, em Configurações → Usuários, na coluna "TST" da grade de acessos. A obra também precisa estar liberada para ela. O TST soma-se ao papel: no resto do sistema vale o papel escolhido.

## Colunas da lista

- "Tipo de apontamento": a classificação (Proteções periféricas, SPIQ – Linha de Vida…), da lista única de todas as obras.
- "Risco: consequência": Morte, Severa, Significativa, Leve, Nenhuma ou Autuação/Multa (a consequência legal), em etiqueta colorida da mais grave para a mais leve, sempre com o texto.
- "Risco: probabilidade": Provável, Possível, Remota ou Rara.
- "Descrição": o que foi encontrado; o selo "Planilha" ao lado marca o histórico importado.
- "Local": texto livre ("Térreo", "2° Pavimento", "Canteiro"); pode ficar vazio.
- "Data do apontamento" e "Data de correção" (só no finalizado).
- "Foto do apontamento" e "Foto da correção": a primeira foto e "+N"; o clique amplia.
- "Dias para resolver": no finalizado, os dias do apontamento até a correção; no aberto, "há N dias" (ou "aberto hoje"), contados até hoje, em vermelho depois de 7 dias.
- "Situação": "Aberto" ou "Finalizado". Com o mouse sobre "Finalizado" aparece "Como foi corrigido", quando informado.

Para o TST, no fim da linha ficam "Finalizar" (aberto) ou "Reabrir" (finalizado) e o "✕" de excluir. Clicar na linha abre o apontamento. No celular, cada apontamento vira um cartão com tipo, risco, descrição, local, data e os botões "Finalizar" ou "Reabrir" e "Editar" (ou "Ver").

## Histórico importado da planilha

- O histórico da "SST - Controle geral" entra por importação feita pela equipe de desenvolvimento, por script, e não por botão da tela. Rodar de novo só acrescenta o que é novo e não sobrescreve o que o TST corrigiu na tela.
- Os importados têm o selo "Planilha" e, na janela do apontamento, "Apontado por: Planilha SST - Controle geral".
- Vieram **sem fotos, por enquanto**: as colunas de foto mostram "—", e os que já estavam corrigidos entraram finalizados sem foto da correção (só a importação dispensa essa foto). O texto que a planilha tinha nas colunas de foto virou "Obs.: …" no fim da descrição ou, nos finalizados, o "Como foi corrigido".
- As obras "My Sunset" e "Amariles" ficaram de fora, porque não existem no sistema.

## Ordem padrão e campo

A lista abre nos abertos, do apontamento mais recente para o mais antigo (no mesmo dia, pela ordem dos tipos). Para usar no canteiro sem sinal, existe o modo de campo em "/campo/seguranca", explicado em seção própria.`,
  },
  {
    id: 'seguranca-lancar-editar',
    title: 'Lançar e editar apontamento de segurança, com fotos',
    summary: '"Novo apontamento": campos, fotos, "Salvar e lançar outro", editar e excluir foto.',
    keywords: [
      'novo apontamento',
      'lançar apontamento',
      'registrar risco',
      'editar apontamento',
      'salvar e lançar outro',
      'foto do apontamento',
      'risco consequência',
      'risco probabilidade',
      'apontado por',
      'faltam fotos',
      'data do apontamento',
    ],
    screen: 'seguranca',
    body: `## Lançar: "Novo apontamento"

Só para TST. O botão "Novo apontamento" fica no cabeçalho da aba. Na janela:

1. "Tipo de apontamento": obrigatório no lançamento ("Escolha o tipo"); só aparecem os tipos ativos. Sem nenhum ativo, a tela pede: "Não há tipos de apontamento ativos. Cadastre ou reative um em "Tipos de apontamento"."
2. "Risco: consequência": obrigatório (Morte, Severa, Significativa, Leve, Nenhuma, Autuação/Multa).
3. "Risco: probabilidade": obrigatório (Provável, Possível, Remota, Rara).
4. "Descrição": obrigatória, até 1.000 caracteres. Ex.: "Guarda-corpo ausente na borda da laje".
5. "Local": opcional, até 120 caracteres. Escolha um local já usado na obra (a lista sugere enquanto você digita) ou digite outro.
6. "Data do apontamento": obrigatória, começa em hoje e não aceita dia futuro.
7. "Fotos do apontamento": opcionais no computador ("Opcional, mas ajuda a achar o risco e a comparar com a correção."). "Tirar foto" e "Galeria" no celular, "Escolher fotos" no computador; o "X" na miniatura tira a foto antes de salvar.
8. "Salvar" grava e fecha ("Apontamento lançado com N fotos."). "Salvar e lançar outro" grava e mantém tipo, local e data, limpando descrição, consequência e probabilidade: "Apontamento salvo. Classifique o risco e descreva o próximo."

O tipo e o local do último lançamento ficam lembrados neste navegador, por obra: o próximo "Novo apontamento" já abre com eles. O risco nunca é lembrado, porque cada apontamento tem a própria avaliação.

Mensagens da janela: "Escolha o tipo de apontamento.", "Escolha o risco: consequência.", "Escolha o risco: probabilidade.", "Descreva o apontamento." e "A data do apontamento não pode ser futura."

## Fotos: compressão e limites

- A foto é comprimida no navegador antes de subir: JPEG de até 1600 px no lado maior (cerca de 300 KB) e miniatura de 320 px. O original pode ter até 40 MB; HEIC do iPhone só abre no Safari.
- Cada apontamento aceita até 10 fotos, somando apontamento e correção. Enquanto está aberto, uma vaga fica reservada para a foto da correção, então cabem até 9 do apontamento. Passando, a tela avisa "Só cabem mais N fotos; N ficaram de fora." ou "O limite de fotos deste apontamento já foi atingido."
- O apontamento é gravado primeiro e as fotos sobem em seguida ("Enviando foto 1 de 3…"). Se uma falhar, o apontamento já está na lista: a janela vira "Apontamento salvo — faltam fotos" e o botão "Tentar de novo" reenvia só o que faltou.

## Editar um apontamento

Clique na linha (ou em "Editar", no cartão do celular). A janela "Editar apontamento" mostra no topo a "Situação" ("Aberto" ou "Finalizado em …"), os "Dias para resolver" e "Apontado por" (o TST que lançou, ou "Planilha SST - Controle geral" no histórico importado).

- Dá para mudar tipo, consequência, probabilidade, descrição, local e data, juntar fotos do apontamento e excluir uma foto do apontamento pela lixeira da miniatura ("Excluir esta foto?"; não dá para desfazer).
- "Sem tipo" só aparece no apontamento que já está sem tipo (histórico). Tipo desativado continua no apontamento que já o usa, marcado "(desativado)", mas não pode ser escolhido de novo.
- Finalizado também se edita: a janela mostra "Como foi corrigido" e as "Fotos da correção", que não têm botão de excluir, e a data do apontamento não pode passar da correção ("O apontamento não pode ser depois da correção (dd/mm/aaaa).").
- "Salvar alterações" só grava se algo mudou ("Apontamento atualizado."). No rodapé fica "Excluir apontamento".

Quem não é TST abre a mesma janela com o título "Apontamento", tudo travado, só para ver os dados e ampliar as fotos.`,
  },
  {
    id: 'seguranca-finalizar-reabrir',
    title: 'Finalizar, reabrir e excluir apontamento de segurança',
    summary: 'Finalizar exige foto da correção e data; reabrir; excluir apaga com as fotos.',
    keywords: [
      'finalizar',
      'finalizar apontamento',
      'finalizado',
      'dar baixa no apontamento',
      'data de correção',
      'reabrir apontamento',
      'excluir apontamento',
      'apagar apontamento',
      'fechar apontamento',
      'risco corrigido',
    ],
    screen: 'seguranca',
    body: `## Finalizar: o risco foi corrigido

Quem: só TST. Onde: "Finalizar", no fim da linha de um apontamento aberto (ou no cartão, no celular). Abre a janela "Finalizar apontamento", com a descrição, "Apontado: dd/mm/aaaa (há N dias)", o local, o risco (consequência · probabilidade) e as fotos em "Antes (fotos do apontamento)", para comparar ("O apontamento foi registrado sem foto." quando não há).

Preencha:

- "Data de correção": obrigatória, entre a data do apontamento e hoje. Começa em hoje.
- "Como foi corrigido": opcional, até 1.000 caracteres. O que foi feito, por quem, material usado.
- "Depois (fotos da correção)": obrigatória ao menos uma. "Tirar foto" ou "Galeria" no celular, "Escolher fotos" no computador. Dica da tela: fotografe o local corrigido, do mesmo ângulo da foto do apontamento.

O botão "Finalizar apontamento" fica apagado até haver foto e data válida; o texto ao lado diz o que falta: "Adicione ao menos uma foto da correção para finalizar.", "A data de correção não pode ser futura.", "A correção não pode ser antes do apontamento (dd/mm/aaaa)." ou "Aguarde a foto ficar pronta."

Ao confirmar, as fotos sobem primeiro ("Enviando foto 1 de 2…") e depois a finalização é gravada ("Finalizando…"). Se algo falhar no meio, o apontamento continua aberto, as fotos que subiram ficam salvas e "Tentar de novo" envia só o que falta. No fim: "Apontamento finalizado. Corrigido em dd/mm/aaaa." O apontamento passa a "Finalizado" na "Situação", ganha a "Data de correção", os "Dias para resolver" param de contar e ele sai de "Abertos" para "Finalizados".

Regras que valem sempre, também no modo de campo:

- Só se finaliza apontamento aberto ("O apontamento já está finalizado.").
- Sem foto da correção, o servidor recusa: "Envie a foto da correção para finalizar o apontamento." A única exceção é o histórico importado da planilha, que entrou finalizado sem foto.
- A data não pode ser futura ("A data da correção não pode estar no futuro.") nem anterior ao apontamento ("A data da correção não pode ser anterior à data do apontamento.").
- As fotos da correção contam no limite de 10 fotos do apontamento. Se ele já tem 10, a tela diz "Este apontamento já tem o máximo de fotos.": exclua uma foto do apontamento em "Editar apontamento" antes de finalizar.

## Reabrir: a correção não ficou boa

Nos finalizados, "Finalizar" dá lugar a "Reabrir". A confirmação "Reabrir o apontamento?" avisa que a data de correção e o "como foi corrigido" são apagados e que o apontamento volta para os abertos; as fotos ficam, inclusive as da correção, como histórico. Aviso: "Apontamento reaberto." Os "Dias para resolver" voltam a contar desde a data do apontamento. Para finalizar de novo basta uma nova data: a foto da correção que ficou já atende à exigência (junte outra se o serviço foi refeito). No modo de campo, "Reabrir" é imediato, sem confirmação, e funciona sem sinal.

Use "Reabrir" quando o risco voltou ou a correção foi recusada na vistoria seguinte.

## Excluir: apagar o apontamento e as fotos

O "✕" no fim da linha ("Excluir apontamento") e o botão "Excluir apontamento" no rodapé da janela de edição apagam o apontamento com todas as fotos. A confirmação avisa que ele "sai da lista com as fotos dele. Isto não pode ser desfeito." Não existe lixeira nem desfazer; por isso, se o risco voltou num apontamento finalizado, prefira "Reabrir", que preserva o histórico. Aviso: "Apontamento excluído."

- Só TST exclui, inclusive apontamento do histórico importado.
- No celular, a lista em cartões não tem o "✕": a exclusão fica no rodapé da janela aberta por "Editar".
- O modo de campo não exclui.`,
  },
  {
    id: 'seguranca-indicadores-filtros',
    title: 'Indicadores, roscas, quadro mês a mês, filtros e classificação da vistoria',
    summary: 'Cartões, roscas, quadro mês a mês por tipo, filtros de vários valores, busca e classificação.',
    keywords: [
      'média de dias para resolver',
      'abertos há mais de 7 dias',
      'por consequência',
      'por probabilidade',
      'mês a mês',
      'quadro mensal',
      'diferença do mês',
      'linha geral',
      'filtrar apontamentos',
      'buscar apontamento',
      'classificar apontamentos',
      'mostrar mais',
    ],
    screen: 'seguranca',
    body: `## Cartões do topo

Contam os apontamentos da seleção dos filtros nas duas situações, qualquer que seja a escolhida na lista (abertos + finalizados = total):

- "Total": "apontamentos da obra" ou, com filtro, "na seleção dos filtros".
- "Abertos".
- "Finalizados", com o percentual do total; enquanto houver um aberto, nunca mostra 100% (fica em 99%).
- "Média de dias para resolver": a média dos "Dias para resolver" dos finalizados, com uma casa decimal ("—" sem nenhum finalizado). Inclui o histórico importado.
- "Abertos há mais de 7 dias": contados até hoje; fica em vermelho quando há algum.

## Roscas "Por tipo", "Por consequência" e "Por probabilidade"

- Dividem os apontamentos que a lista mostra, com a situação e os filtros de agora. Cada rosca ignora o próprio filtro, para continuar mostrando as alternativas, com as escolhidas destacadas.
- Mostram até seis fatias: acima disso, as cinco maiores e "Outros (N tipos)". O total fica no centro; a legenda traz cor, nome, quantidade e percentual.
- Clique num item da legenda para ligar ou desligar aquele valor no filtro; dá para ligar vários. "Outros" só informa, não filtra.

## Quadro "Apontamentos por tipo, mês a mês"

É o comparativo da planilha: quantos apontamentos de cada tipo foram feitos em cada um dos últimos quatro meses (o atual e os três anteriores, como "ago/26"), pela data do apontamento, abertos e finalizados juntos. Segue os filtros, menos a situação.

- A coluna "Diferença" compara o mês atual com o anterior: "+3 (+50%)", "−2 (−40%)", "0" ou "+4 (novo)" quando o mês anterior teve zero.
- A linha "GERAL" soma todos os tipos.
- O mês atual ainda está em andamento: no começo do mês a diferença tende a ser negativa.
- Sem apontamento no período: "Nenhum apontamento nos últimos 4 meses."

## Situação, busca e filtros

- "Abertos", "Finalizados" e "Todos" escolhem a situação, com a contagem de cada uma. A lista abre em "Abertos", do mais recente para o mais antigo.
- "Buscar na descrição, no local, no tipo ou na correção": procura o texto na descrição, no local, no nome do tipo e no "Como foi corrigido", sem diferenciar acento nem maiúscula.
- Filtros "Tipo de apontamento", "Risco: consequência", "Risco: probabilidade" e "Local". Cada um abre uma lista de caixas de marcar com a contagem de cada opção e aceita vários valores (vale um OU outro); os filtros somam entre si. "Limpar este filtro" desmarca um; "(sem tipo)" e "(sem local)" trazem os apontamentos com o campo vazio; tipo desativado aparece com "(desativado)".
- O filtro "Local" junta grafias parecidas: "2° Pavimento" e "2º pavimento" são o mesmo local, mostrado com a grafia mais usada na obra.
- No celular, os filtros ficam no botão "Filtros (n)", em que n conta os filtros ativos e a busca.
- Abaixo dos filtros: "Mostrando X de N apontamentos." Com filtro ativo aparece "Limpar filtros", que volta aos abertos sem filtro, mas não desfaz a classificação.
- A lista desenha 100 apontamentos por vez: "Mostrando os 100 primeiros de X apontamentos desta seleção (N na obra)." e "Mostrar mais 100". A busca e os filtros encontram qualquer apontamento, mesmo os ainda não mostrados.
- Lista vazia: "Nenhum apontamento com esses filtros." ou, quando tudo já foi corrigido, "Nenhum apontamento aberto: os N registrados estão finalizados."

## Classificar por coluna, como no Excel

- No computador, clique no título da coluna: o 1º clique classifica em ordem crescente, o 2º em decrescente e o 3º volta à ordem padrão. Célula vazia fica no fim nos dois sentidos.
- "Risco: consequência" e "Risco: probabilidade" seguem a escala da planilha: crescente começa em "Morte" e em "Provável". As colunas de foto classificam pela quantidade de fotos; "Dias para resolver", pelos dias (aberto conta até hoje); "Situação" crescente põe os abertos primeiro.
- Ao lado da contagem: "Classificada por … (crescente)" e "Voltar à ordem padrão".
- No celular, use "Classificar por" acima dos cartões ("Ordem padrão (mais recentes)" volta ao normal) e o botão "Crescente"/"Decrescente".
- O PDF sai com os filtros e a classificação do momento.`,
  },
  {
    id: 'seguranca-tipos-lote',
    title: 'Tipos de apontamento (lista única) e edição em lote',
    summary: 'Lista única de tipos de todas as obras (incluir, renomear, ordenar, desativar) e edição em lote.',
    keywords: [
      'tipos de apontamento',
      'cadastrar tipo',
      'novo tipo',
      'adicionar tipo',
      'renomear tipo',
      'desativar tipo',
      'reativar tipo',
      'reordenar tipos',
      'lista única de tipos',
      'editar vários apontamentos',
      'apontamentos marcados',
      'trocar o local',
    ],
    screen: 'seguranca',
    body: `## "Tipos de apontamento": uma lista para todas as obras

O botão "Tipos de apontamento" fica no cabeçalho, só para TST. A lista é a mesma em todas as obras, porque a equipe de TST é a mesma e o quadro mês a mês compara os tipos: incluir, renomear, desativar ou reordenar um tipo vale para os apontamentos de todas elas. A contagem ao lado de cada tipo ("N apontamentos nesta obra" ou "sem uso nesta obra") é só da obra aberta.

- **Incluir**: digite o nome (até 80 caracteres; ex.: "Içamento de cargas") e clique em "Adicionar tipo". Nome repetido é recusado, sem diferença de acento, maiúscula ou espaços: "Já existe o tipo …" ou, se estiver desativado, "Já existe o tipo …, desativado. Reative-o na lista."
- **Renomear**: o lápis ao lado do nome; Enter salva, Esc cancela. O nome novo aparece em todos os apontamentos que usam o tipo, em todas as obras.
- **Reordenar**: as setas para cima e para baixo mudam a posição. A ordem é a da lista de escolha e também a das roscas, do quadro mês a mês, da ordem padrão da lista no mesmo dia e dos grupos do PDF.
- **Desativar / Reativar**: tipo não se exclui. Desativado, ele sai da lista de escolha dos novos apontamentos e da edição em lote, vai para "Desativados" e continua nos apontamentos que já o usam, marcado "(desativado)". Para reusar um nome, reative o tipo.
- Se outra pessoa mexeu na lista ao mesmo tempo: "A lista de tipos mudou. Recarregue a página e reordene de novo."

Sem nenhum tipo cadastrado, o TST vê o aviso "Nenhum tipo de apontamento cadastrado ainda." com a sugestão de cadastrar a lista em "Tipos de apontamento".

## Editar em lote: o mesmo valor em vários apontamentos

1. Marque a caixa dos apontamentos que vão mudar juntos, ou a caixa do cabeçalho, que marca os apontamentos mostrados (os que estão atrás de "Mostrar mais" não entram). A marcação vale só para o que a lista mostra: filtrar tira da seleção os que saíram de vista.
2. Na barra "N apontamentos marcados", clique em "Editar em lote" ("Desmarcar" limpa a seleção). São até 500 de uma vez; acima disso, "Edite no máximo 500 de uma vez."
3. Na janela "Editar N apontamentos", cada campo abre em "Manter como está": "Tipo de apontamento" (um tipo ativo, ou "Sem tipo", que limpa o tipo), "Risco: consequência", "Risco: probabilidade" e "Local" ("Trocar por…" e o novo local, com as sugestões da obra). "Hoje: …" mostra o valor atual dos marcados ("valores diferentes" quando variam).
4. "Aplicar a N" só libera quando algo foi trocado. Só o campo trocado muda; descrição, datas, situação e fotos ficam como estão. Aviso: "N apontamentos atualizados."

Na edição em lote o local só pode ser trocado, não apagado ("Escreva o local, ou volte para "Manter como está"."): para deixar sem local, edite cada apontamento.`,
  },
  {
    id: 'seguranca-pdf',
    title: 'Gerar o PDF da vistoria de segurança',
    summary: 'PDF: agrupar por tipo, local ou consequência, escolher grupos, fotos, folha nova e 1ª folha.',
    keywords: [
      'pdf da vistoria',
      'pdf de segurança',
      'imprimir vistoria',
      'relatório de segurança',
      'agrupar por tipo',
      'agrupar por local',
      'agrupar por consequência',
      'vistoria de segurança do trabalho',
      'riscos graves',
      'quais tipos entram',
    ],
    screen: 'seguranca',
    body: `## Onde fica e o que entra

O botão "Gerar PDF" fica no cabeçalho e aparece para todos, inclusive quem só consulta; fica apagado quando a obra não tem apontamento. O PDF parte do que a lista mostra: a situação ("Abertos", "Finalizados" ou "Todos"), os filtros, a busca e a classificação. Filtre e classifique antes de gerar. Ao contrário da tela, que desenha 100 por vez, o PDF leva a seleção inteira.

## A janela "PDF da vistoria de segurança"

1. O texto do topo diz de quantos apontamentos o PDF parte ("Parte dos N apontamentos abertos que a lista mostra, com os filtros de agora.").
2. "Agrupar por": "Tipo de apontamento", "Local" ou "Risco: consequência". Abre em "Tipo de apontamento"; se a lista está filtrada por local (e não por tipo), em "Local"; se só por consequência, em "Risco: consequência".
3. "Quais tipos entram" (ou locais, ou consequências): os grupos com a quantidade de cada um. Marque e desmarque, use "Selecionar tudo" e "Limpar", ou "Pesquisar" pelo nome. "N de M" conta os marcados. Cada agrupamento guarda a própria escolha enquanto a janela está aberta.
4. "Com as fotos do apontamento e da correção": ligado por padrão; desligue para um PDF só com texto.
5. "Cada tipo começa em folha nova" (ou local, ou consequência): ligado por padrão.
6. "Dentro de cada grupo, na ordem da lista: …" lembra a ordem (sem classificação, a data do apontamento, do mais recente para o mais antigo).
7. O rodapé diz "N apontamentos no PDF" ou "Marque ao menos um tipo." (um local, uma consequência). "Gerar PDF" abre a página de impressão numa aba nova; "Cancelar" fecha.

## A página de impressão

A página espera as fotos carregarem (no máximo 20 segundos) e abre o diálogo de impressão do navegador: escolha "Salvar como PDF" e o modo paisagem (A4). Se o diálogo não abrir, use o botão "Imprimir / Salvar PDF" no topo. O nome sugerido do arquivo sai do título, por exemplo "Segurança MZN - Por tipo - 05-11-2026".

Na primeira folha:

- A faixa com os logos da ATR e da Takt, o título "VISTORIA DE SEGURANÇA DO TRABALHO <OBRA>", o agrupamento, a situação e "Gerado em dd/mm/aaaa". Abaixo, quando houver, "Filtros: …", "Só os escolhidos: …" e "Ordem dentro de cada grupo: …".
- Cartões que mudam com a situação. "Todos": total, abertos, finalizados, percentual finalizado e dias para resolver em média. "Abertos": total, abertos há mais de 7 dias, dias em aberto em média e locais com apontamento aberto. "Finalizados": total, dias para resolver em média, finalizados em até 7 dias e locais com apontamento.
- As roscas "Por tipo", "Por consequência" e "Por probabilidade", contando só o que entrou no PDF.

Depois, um bloco por grupo, com o título repetido em cada folha ("· N apontamentos" e, com "Todos", "(N abertos)") e as colunas "Nº" (contínuo no documento), "Tipo" (some ao agrupar por tipo), "Consequência" (some ao agrupar por consequência), "Probabilidade", "Descrição", "Local" (some ao agrupar por local), "Data do apontamento", "Situação" ("Aberto há N dias" ou "Finalizado em dd/mm/aaaa · N dias", com "Correção: …" quando há o texto), "Foto" e "Foto da correção" (até duas miniaturas e "+N"; somem no PDF sem fotos). Tipos saem na ordem cadastrada, locais em ordem alfabética e consequências da mais grave para a mais leve; "Sem tipo" e "Sem local" ficam no fim. O histórico importado da planilha sai com "—" nas fotos.

## Exemplos rápidos

- Riscos graves em aberto: na rosca "Por consequência", clique em "Morte" e em "Severa" e gere; a janela já abre agrupada por consequência.
- Relatório de um local: filtre o local na lista, ou agrupe por "Local" e deixe marcado só ele.
- Fechamento com a média de dias para resolver: escolha "Todos" antes de gerar.`,
  },
  {
    id: 'seguranca-modo-de-campo',
    title: 'Segurança em campo: celular sem sinal (/campo/seguranca)',
    summary: 'Celular sem sinal: baixar a obra, lançar com foto, finalizar, reabrir, fila e recusas.',
    keywords: [
      'segurança em campo',
      'vistoria no celular',
      'apontamento sem sinal',
      'vistoria offline',
      'usar no celular',
      'lançar no celular',
      'foto obrigatória no celular',
      'fila do aparelho',
      'modo avião',
      'atualizar a obra',
    ],
    screen: 'seguranca',
    body: `## Para que serve

"/campo/seguranca" ("Segurança em campo") é a vistoria feita para o celular no canteiro: baixa-se a obra com sinal e, depois, tudo funciona sem internet. Nele o TST lança apontamento com foto, junta foto, finaliza com a foto da correção e reabre. Editar, editar em lote, excluir e cadastrar tipos ficam na aba 6, no computador. Quem não é TST vê a lista, os filtros e as fotos, com o aviso "Só técnicos de segurança (TST) lançam e finalizam apontamentos." e os nomes dos TSTs da obra; nada entra na fila.

## Como abrir e baixar a obra (com sinal)

1. Na aba 6, toque em "Usar no celular, sem sinal", ou digite "/campo/seguranca" no navegador do celular, com o mesmo login.
2. Na primeira vez aparece "Prepare com sinal": toque em "Carregar minhas obras". A lista mostra o seu nome, com "(TST)" se você for TST.
3. Toque na obra ("Toque para baixar e usar sem sinal"): ela é baixada com as fotos dos apontamentos abertos e passa a mostrar "Pronta sem sinal · N abertos". Daí em diante abre mesmo em modo avião. As fotos do histórico finalizado só aparecem com sinal.
4. Com sinal, "Atualizar a obra com o que está no servidor", no fim da lista, traz o que foi lançado no computador e em outros celulares, sem perder a fila do aparelho.

O aparelho guarda também se você é TST, do momento em que a obra foi baixada. Quem acabou de ser marcado como TST precisa atualizar a obra, com sinal, para os botões aparecerem; quem deixou de ser TST tem o que lançou recusado no envio.

## Lançar, fotografar e finalizar

- Filtros: "Abertos (N)", "Finalizados (N)" e "Todos"; "Buscar na descrição ou no local"; em "Filtros", tipo, consequência e local, um valor de cada ("Limpar filtros" desfaz). Não há filtro de probabilidade nem classificação: a ordem é a padrão, do mais recente. A lista mostra 25 por vez ("Mostrar mais (N restantes)").
- "Novo apontamento" (botão redondo no canto): "Tipo de apontamento" (obrigatório quando há tipo ativo), "Risco: consequência" e "Risco: probabilidade" (obrigatórios), "Descrição" (obrigatória, até 1.000 caracteres), "Local" (os locais já usados na obra aparecem em botões; começa com o local filtrado, se houver), "Data do apontamento" (hoje; não aceita futuro) e "Foto do apontamento (obrigatória)", pelo botão "Câmera", já reduzida no aparelho. **No campo a foto é exigida**: "Lançar apontamento" fica apagado sem ela (no computador ela é opcional).
- "Foto", no cartão de um apontamento aberto, junta mais fotos do apontamento ("Guardar").
- "Finalizar": "Data de correção" (começa em hoje; não aceita futuro nem antes do apontamento), "Como foi corrigido" (opcional) e "Foto da correção (obrigatória)" ("Mais fotos da correção (opcional)" quando já há uma); "Finalizar apontamento" fica apagado sem a foto.
- "Reabrir", nos finalizados: volta o apontamento para "Abertos" na hora, sem confirmação; a data e o texto da correção saem, as fotos ficam.
- Limite de 10 fotos por apontamento ("Limite de 10 fotos por apontamento."). O campo não guarda vaga para a correção: com 10 fotos do apontamento não dá para finalizar até excluir uma, no computador.

As regras do servidor valem no aparelho: data futura, finalizar sem foto da correção e mais de 10 fotos são recusados na hora, com a mesma mensagem.

## Enquanto não enviou, e quando a conexão volta

Cada alteração entra na lista na hora, com a etiqueta "no aparelho" até ser enviada. O cabeçalho mostra "N alterações guardadas no aparelho — sobe sozinho quando o sinal voltar" (ou ", enviando…", com sinal) e a etiqueta "on-line" ou "sem sinal". Sem sinal, o aviso do lançamento termina em "Fica no aparelho até o sinal voltar."

A fila sobe sozinha, na ordem em que foi lançada: ao abrir a tela com sinal, quando o sinal volta e logo depois de cada lançamento com internet. O botão de enviar, no cabeçalho, força o envio na hora. No fim, "N alterações enviadas." e a obra é baixada de novo. Fechar o navegador não perde a fila.

## Conflitos e erros

- "Sua sessão expirou. O que foi lançado continua guardado neste aparelho.", com o link "Entrar de novo": o login volta para esta tela e a fila sobe depois.
- "O servidor recusou uma alteração": uma regra recusou um item (por exemplo, o apontamento foi excluído no computador ou a pessoa deixou de ser TST). O envio para nele para não trocar a ordem; cada linha mostra o que era ("Novo apontamento: …", "Foto do apontamento", "Foto da correção", "Finalizar apontamento", "Reabrir apontamento"), quando foi lançado e o motivo. "Descartar" tira a alteração e o que dependia dela; se ainda for preciso, lance de novo.
- Falha passageira de rede ("Sem resposta do servidor.") não descarta nada: a fila tenta de novo.`,
  },
  {
    id: 'seguranca-perguntas-frequentes',
    title: 'Perguntas frequentes e mensagens da Segurança do trabalho',
    summary: 'Não vejo os botões, virar TST, não finaliza, foto não sobe, sumiu, histórico sem fotos.',
    keywords: [
      'não vejo novo apontamento',
      'como virar tst',
      'quero ser tst',
      'não consigo finalizar',
      'apontamento sumiu',
      'sem fotos da planilha',
      'importados sem foto',
      'fotos da planilha',
      'obra não importada',
      'my sunset',
      'amariles',
      'só técnicos de segurança',
    ],
    screen: 'seguranca',
    body: `## Não vejo "Novo apontamento" nem "Finalizar"

Esses botões são só do TST. O aviso "Consulta: só os técnicos de segurança (TST) lançam e finalizam apontamentos." no topo confirma que você não está marcado como TST e lista os TSTs da obra. Ser administrador, gestor ou planejador não basta. Para virar TST, peça a um administrador, que marca a coluna "TST" na grade de Configurações → Usuários. Depois, recarregue a aba (no modo de campo, atualize a obra com sinal).

## Sou TST e não consigo gravar

- "Você não tem acesso a esta obra.": a obra também precisa estar liberada para você na grade de acessos.
- "Só técnicos de segurança (TST) lançam e finalizam apontamentos.": a marcação de TST foi tirada, ou a tela foi aberta antes de você ser marcado; recarregue.
- No modo de campo, a marcação vale a partir da próxima vez que a obra for baixada ou atualizada.

## Não consigo finalizar

É regra, não erro: "Finalizar apontamento" só libera com ao menos uma foto da correção e a data entre o apontamento e hoje; o texto ao lado do botão diz o que falta. Se ninguém fotografou a correção, é preciso voltar ao local. Se a tela diz "Este apontamento já tem o máximo de fotos.", o apontamento chegou a 10 fotos: exclua uma foto do apontamento em "Editar apontamento" e tente de novo.

## A foto não sobe

- O envio tenta duas vezes e, se falhar, mostra "Não foi possível enviar a foto. Verifique a conexão e tente de novo." O apontamento já foi salvo: a janela vira "Apontamento salvo — faltam fotos" e "Tentar de novo" reenvia só o que faltou. Ao finalizar, as fotos que subiram ficam salvas e o apontamento segue aberto até concluir.
- "Formato não suportado": foto HEIC do iPhone aberta fora do Safari, ou arquivo que não é imagem. Tire a foto pela câmera do sistema ou envie JPG/PNG.
- No canteiro sem sinal, use "Usar no celular, sem sinal": a foto fica guardada no aparelho e sobe depois.
- "Não foi possível abrir a foto. Se o link venceu, ela volta em instantes; senão, recarregue a página.": os links das fotos valem uma hora; a aba renova sozinha, e recarregar resolve.

## O apontamento não aparece

- A lista abre em "Abertos": o finalizado só aparece em "Finalizados" ou "Todos".
- Algum filtro, ou item de rosca clicado, ficou ligado: veja "Mostrando X de N apontamentos" e use "Limpar filtros".
- A lista desenha 100 por vez: use a busca, os filtros ou "Mostrar mais".
- No modo de campo, a lista é a cópia baixada: use "Atualizar a obra com o que está no servidor". O que foi lançado num celular e ainda não enviado só existe naquele aparelho, com a etiqueta "no aparelho".
- "A lista mudou enquanto você trabalhava.": outra pessoa alterou os apontamentos ao mesmo tempo; a tela foi atualizada, confira e tente de novo. "Registro não encontrado. Recarregue a página.": o apontamento foi excluído por outra pessoa.

## Histórico da planilha "SST - Controle geral"

- Os apontamentos com o selo "Planilha" vieram da planilha **sem fotos, por enquanto**, e os que já estavam corrigidos entraram finalizados sem foto da correção. Não é erro: anexar as fotos da planilha é uma etapa posterior, feita pela equipe de desenvolvimento.
- As obras "My Sunset" e "Amariles" não tiveram o histórico importado, porque não existem no sistema. Se forem cadastradas e precisarem do histórico, peça a importação à equipe de desenvolvimento.
- Linhas novas na planilha também entram só por nova importação, a pedido; ela não duplica nem sobrescreve o que o TST já corrigiu na tela. O caminho normal agora é lançar direto na aba 6.

## Outras mensagens

- "A segurança do trabalho ainda não foi ativada no banco: aplique a migração 0040.": a aba ainda não foi ativada neste ambiente; avise quem mantém o sistema.
- "Não foi possível carregar os apontamentos.": falha de conexão; use "Tentar de novo".`,
  },
];

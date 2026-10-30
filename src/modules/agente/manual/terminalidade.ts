import type { ManualSection } from './types';

/** Manual da aba 5, Terminalidade (29/10/2026): a lista de pendências por pavimento, apartamento e
 * empreiteiro, com fotos, o modo de campo para o celular sem sinal e o PDF. Escrito a partir do código
 * dos componentes e dos tours; descreve só o que está implementado. */
export const sections: ManualSection[] = [
  {
    id: 'terminalidade-visao-geral',
    title: 'Terminalidade: para que serve e como está organizada',
    summary: 'O que é a lista de pendências da aba 5, suas colunas, de onde vêm os cadastros e quem pode fazer o quê.',
    keywords: [
      'terminalidade',
      'lista de pendências',
      'pendência',
      'aba 5',
      'pavimento',
      'apartamento',
      'apto',
      'empreiteiro',
      'responsável atr',
      'responsável terceiro',
      'tipo',
      'colunas',
      'quem pode',
      'consulta',
      'cadastro',
    ],
    screen: 'terminalidade',
    body: `## O que é a aba 5, Terminalidade

É a "Lista de pendências" da obra, no mesmo formato da planilha usada antes: cada linha é um problema encontrado na vistoria, com local, apartamento, tipo, quem da ATR acompanha, qual empreiteiro corrige, a foto do problema e, depois, a foto da correção. A lista existe para ser zerada: uma pendência só fecha com a foto do serviço corrigido e a data da correção.

A aba é aberta a todos os usuários que têm a obra liberada. O botão "?" ("Como funciona") do cabeçalho abre a explicação da tela, e o "Como usar a lista", ao lado do título "Lista de pendências", resume a ordem, a classificação e os cliques.

## Colunas da lista

- "Local": o pavimento.
- "Apto": o apartamento ou a área comum; fica vazio quando a pendência é do pavimento inteiro.
- "Descrição da pendência": o que precisa ser corrigido.
- "Tipo": a classificação (A/C, RI, PINTURA e as que a obra cadastrar).
- "Data observação": quando o problema foi visto.
- "Data correção": preenchida só quando a pendência é resolvida.
- "Responsável ATR": a pessoa da ATR que acompanha (lista da obra, que pode incluir quem não usa o sistema, como mestre e estagiário).
- "Responsável terceiro": o empreiteiro que corrige (empresa do cadastro de equipes ou nome digitado).
- "Foto": miniatura da primeira foto do problema e "+N" quando há mais; o clique amplia.
- "Resolvido?": "SIM" ou "NÃO". Com o mouse sobre o "SIM" aparece o texto "Como foi corrigido", quando foi informado.
- "Foto da correção": as fotos do serviço pronto.

No fim de cada linha ficam "Resolver" (pendência aberta) ou "Reabrir" (pendência resolvida) e o "✕" de excluir. Clicar na linha abre a pendência para ver ou editar.

## De onde vêm pavimentos, tipos e responsáveis

Pavimentos e unidades, tipos de pendência e responsáveis ATR são cadastrados em "Configurações da obra" (grupo Apoio), nas seções "Pavimentos e unidades", "Tipos de pendência" e "Responsáveis ATR". Tipos e responsáveis não se apagam, só se desativam: o desativado sai das listas de escolha, mas continua nas pendências antigas, marcado "(desativado)". Os empreiteiros vêm das empresas do cadastro de equipes da obra, somadas aos nomes já digitados em outras pendências.

Sem pavimentos cadastrados, a aba mostra só o aviso "A lista de pendências é organizada por pavimento e apartamento", com o link para as Configurações, e o botão "Nova pendência" não aparece.

## Quem pode fazer o quê

- Perfil "Consulta": vê tudo, abre a pendência ("Ver"), amplia as fotos, filtra, classifica e gera o PDF. Não vê "Nova pendência", as caixas de marcar, "Resolver", "Reabrir" nem o "✕". Se algo tentar gravar, o servidor responde "Seu perfil permite apenas consulta."
- "Planejador", "Gestor" e "Admin": incluem, editam, editam em lote, resolvem, reabrem e excluem pendências. Na terminalidade não há diferença entre esses três papéis.
- Em qualquer papel, a obra precisa estar liberada para a pessoa; senão aparece "Você não tem acesso a esta obra."

## Ordem padrão, celular e campo

A lista abre nas pendências abertas, na ordem da obra: pavimento (na ordem cadastrada), apartamento e data de observação; a pendência do pavimento sem apto vem antes dos aptos dele. No celular, cada pendência vira um cartão com os mesmos botões. Para usar no canteiro sem sinal, existe o modo de campo em "/campo/terminalidade", explicado em seção própria.`,
  },
  {
    id: 'terminalidade-filtros-roscas-classificacao',
    title: 'Roscas, filtros, busca e classificação da lista',
    summary:
      'O que as roscas e os quadros do topo mostram, como filtram a lista ao clicar, e como filtrar, buscar e classificar por coluna.',
    keywords: [
      'rosca',
      'gráfico',
      'filtro',
      'filtrar',
      'buscar',
      'busca',
      'classificar',
      'ordenar',
      'coluna',
      'abertas',
      'resolvidas',
      'todas',
      'limpar filtros',
      'por tipo',
      'por pavimento',
    ],
    screen: 'terminalidade',
    body: `## Indicadores "Abertas", "Resolvidas" e "% resolvida"

Os três cartões do topo contam as pendências da seleção dos filtros nas duas situações, qualquer que seja a escolhida na lista: abertas + resolvidas = total. "% resolvida" é a parte do total já corrigida; enquanto houver uma pendência aberta, nunca mostra 100% (fica em 99%). Com algum filtro ativo, o cartão avisa "na seleção dos filtros".

## Roscas "Por tipo", "Por pavimento" e "Por responsável terceiro"

- Dividem as pendências que a lista mostra, com a situação ("Abertas", "Resolvidas" ou "Todas") e os filtros de agora. Cada rosca ignora o próprio filtro: com um tipo filtrado, a rosca de tipo continua mostrando todos os tipos, com o escolhido destacado.
- Mostram até seis fatias; acima disso, as cinco maiores ficam e as demais se juntam em "Outros (N tipos)". O total fica no centro, e a legenda ao lado traz cor, nome, quantidade e percentual; o mouse sobre uma fatia mostra o mesmo.
- Clique num item da legenda para filtrar a lista por aquele tipo, pavimento ou empreiteiro; o item fica destacado e um novo clique tira o filtro. "Outros" só informa, não filtra.
- As roscas só aparecem quando há pendência na seleção.

## Quadros "Abertas por responsável terceiro" e "Abertas por pavimento"

Contam só as pendências abertas, com barra proporcional; a pendência sem empreiteiro entra como "Sem responsável". Clicar numa linha filtra a lista por ela (se a lista estava em "Resolvidas", volta para "Abertas"); clicar de novo desfaz. Aparecem as seis primeiras; "Ver todos (N)" mostra o resto e "Mostrar menos" recolhe.

## Situação, busca e filtros

- "Abertas", "Resolvidas" e "Todas" escolhem a situação, com a contagem de cada uma. A lista abre em "Abertas".
- "Buscar na descrição" procura o texto digitado na descrição, sem diferenciar acento nem maiúscula, e soma com os demais filtros.
- Filtros "Pavimento", "Apto", "Tipo", "Responsável terceiro" e "Responsável ATR". Eles somam; "Todos" tira o filtro. As opções entre parênteses, "(sem apto)", "(sem tipo)" e "(sem responsável)", trazem as pendências com o campo em branco. Escolher o pavimento limita os aptos a ele; sem pavimento, o apto aparece com o pavimento ao lado ("401 · 4° pavto").
- No celular, os filtros ficam recolhidos no botão "Filtros (n)", em que n é quantos filtros, contando a busca, estão ativos.
- Abaixo dos filtros, "Mostrando X de Y pendências." Com filtro ativo aparece "Limpar filtros", que volta às abertas sem filtro, mas não desfaz a classificação.
- Lista vazia: "Nenhuma pendência com esses filtros." ou, quando tudo da seleção já foi corrigido, "Nenhuma pendência aberta: as N registradas estão resolvidas."

## Classificar por qualquer coluna, como no Excel

- No computador, clique no título da coluna: o 1º clique classifica em ordem crescente, o 2º em decrescente e o 3º volta à ordem padrão. A seta no título mostra a coluna ativa.
- Célula vazia fica no fim nos dois sentidos, e o empate cai na ordem padrão.
- "Local" segue a ordem cadastrada dos pavimentos, não a alfabética ("Térreo" antes de "2° pavto"). "Apto" e os textos usam ordem natural ("402" antes de "1001"). "Foto" e "Foto da correção" classificam pela quantidade de fotos. "Resolvido?" crescente põe as abertas primeiro.
- Ao lado da contagem aparece "Classificada por … (crescente)" com "Voltar à ordem padrão".
- No celular não há títulos para clicar: use "Classificar por" acima dos cartões ("Ordem padrão" volta ao normal) e o botão ao lado alterna "Crescente" e "Decrescente".
- O PDF sai com os filtros e a classificação do momento.`,
  },
  {
    id: 'terminalidade-incluir-editar',
    title: 'Incluir e editar pendência, fotos e edição em lote',
    summary: 'Passo a passo de "Nova pendência", campos obrigatórios, fotos (compressão e limites), edição e edição em lote.',
    keywords: [
      'nova pendência',
      'incluir',
      'cadastrar',
      'lançar',
      'editar',
      'foto',
      'tirar foto',
      'galeria',
      'compressão',
      'tamanho da foto',
      'limite de fotos',
      'salvar e cadastrar outra',
      'editar em lote',
      'marcar',
      'excluir foto',
    ],
    screen: 'terminalidade',
    body: `## Incluir: "Nova pendência"

O botão "Nova pendência" fica no cabeçalho da aba, para planejador, gestor e admin, e só aparece depois de a obra ter pavimentos cadastrados. Na janela:

1. "Local (pavimento)": obrigatório.
2. "Apto": opcional. "— (pavimento / área comum)" registra a pendência no pavimento todo. A lista de aptos depende do pavimento.
3. "Descrição": obrigatória, até 1.000 caracteres. É nesse texto que a busca procura.
4. "Tipo": opcional ("Sem tipo").
5. "Data observação": obrigatória, começa em hoje e não aceita dia futuro.
6. "Responsável ATR": opcional, lista da obra.
7. "Responsável Terceiro": opcional; escolha da lista de empresas ou digite o nome (até 80 caracteres).
8. "Fotos do problema": opcionais. "Tirar foto" e "Galeria" no celular, "Escolher fotos" no computador; o "X" na miniatura tira a foto antes de salvar.
9. "Salvar" grava e fecha. "Salvar e cadastrar outra" grava e mantém local, apto, tipo, data e responsáveis, limpando só a descrição ("Pendência salva. Descreva a próxima.").

A pendência é gravada primeiro e as fotos sobem em seguida ("Enviando foto 1 de 3…"). Se uma foto falhar, a pendência já está na lista: a janela vira "Pendência salva — faltam fotos" e o botão "Tentar de novo" reenvia só o que faltou.

## Fotos: compressão e limites

- A foto é comprimida no navegador antes de subir: JPEG de até 1600 px no lado maior (cerca de 300 KB) e uma miniatura de 320 px.
- Cada pendência aceita até 10 fotos, somando problema e correção. Enquanto está aberta, uma vaga fica reservada para a foto da correção, então cabem até 9 do problema. Passando do limite, a tela avisa quantas ficaram de fora.
- O arquivo original pode ter até 40 MB. Servem JPG, PNG e os formatos que o navegador abre; HEIC do iPhone só abre no Safari ("Formato não suportado; tire a foto pela câmera do sistema ou envie JPG/PNG.").
- O servidor recusa foto comprimida acima de 2 MB; se nem comprimida couber, "Mesmo comprimida, … Tire a foto de novo."

## Editar uma pendência

Clique na linha (ou em "Editar", no cartão do celular) para abrir "Editar pendência". Dá para mudar local, apto, descrição, tipo, data de observação e responsáveis, juntar fotos do problema e excluir uma foto do problema pela lixeira da miniatura ("Excluir esta foto?"; não dá para desfazer). Numa pendência resolvida, a janela mostra "Resolvida em …", o texto "Como foi corrigido" e as "Fotos da correção", que não têm botão de excluir; a data de observação não pode passar da data de correção. "Salvar alterações" só grava se algo mudou. No rodapé fica "Excluir pendência". Quem é consulta abre a janela "Pendência", com tudo travado.

## Editar em lote: tipo e responsáveis de várias pendências

1. Marque a caixa das pendências que vão mudar juntas, ou a caixa do cabeçalho para marcar todas as que a lista mostra. A marcação vale só para o que está visível na lista.
2. Na barra "N pendências marcadas", toque em "Editar em lote" ("Desmarcar" limpa a seleção).
3. Na janela "Editar N pendências", cada campo abre em "Manter como está": "Tipo" (ou "Sem tipo"), "Responsável ATR" (ou "Sem responsável ATR") e "Responsável terceiro (empreiteiro)" ("Trocar por…" ou "Sem responsável terceiro"). "Hoje: …" mostra o valor atual das marcadas ("vazio" ou "valores diferentes").
4. "Aplicar a N" só libera quando algo foi trocado. Só o campo trocado muda; descrição, local, datas, situação e fotos ficam como estão. Até 500 pendências por vez.`,
  },
  {
    id: 'terminalidade-resolver-reabrir-excluir',
    title: 'Resolver, reabrir e excluir pendência',
    summary:
      'O que "Resolver" exige (foto da correção e data), o campo "Como foi corrigido", quando usar "Reabrir" e o que "Excluir" apaga.',
    keywords: [
      'resolver',
      'resolvida',
      'dar baixa',
      'foto da correção',
      'data da correção',
      'como foi corrigido',
      'reabrir',
      'excluir',
      'apagar',
      'corrigida',
      'antes e depois',
      'fechar pendência',
    ],
    screen: 'terminalidade',
    body: `## Resolver: dar baixa na pendência corrigida

Quem: planejador, gestor e admin. Onde: o botão "Resolver" no fim da linha de uma pendência aberta (ou no cartão, no celular). Abre a janela "Resolver pendência", com a descrição, a data de observação, o tipo, o terceiro e o responsável ATR, e as fotos do problema em "Antes (fotos do problema)", para comparar.

Preencha:

- "Data da correção": obrigatória, entre a data da observação e hoje. Começa em hoje.
- "Como foi corrigido": opcional, até 1.000 caracteres. O que foi feito, por quem, material usado.
- "Depois (fotos da correção)": obrigatória ao menos uma. "Tirar foto" ou "Galeria" no celular, "Escolher fotos" no computador. Dica da tela: fotografe o serviço pronto do mesmo ângulo da foto do problema.

O botão "Resolver pendência" fica apagado até haver foto da correção e data válida; o texto ao lado diz o que falta: "Adicione ao menos uma foto do serviço corrigido para resolver.", "A data da correção não pode ser futura." ou "A correção não pode ser antes da observação (dd/mm/aaaa)." Enquanto a foto é comprimida, "Aguarde a foto ficar pronta."

Ao confirmar, as fotos sobem primeiro e depois a baixa é gravada. Se algo falhar no meio, a pendência continua aberta e as fotos que subiram ficam salvas; "Tentar de novo" envia só o que faltou. No fim: "Pendência resolvida. Corrigida em dd/mm/aaaa." A pendência passa a "SIM" em "Resolvido?", ganha a "Data correção" e sai de "Abertas" para "Resolvidas". O texto "Como foi corrigido" aparece com o mouse sobre o "SIM", na janela da pendência, no cartão do celular ("Correção: …") e no PDF.

Regras que valem sempre, também no modo de campo: só se resolve pendência aberta ("A pendência já está resolvida."); sem foto da correção o servidor recusa ("Envie a foto da correção para marcar como resolvida."); a data não pode ser futura nem anterior à observação. As fotos da correção contam no limite de 10 fotos da pendência.

## Reabrir: a correção não ficou boa

Nas pendências resolvidas, o botão "Resolver" dá lugar a "Reabrir". A confirmação diz "Reabrir a pendência de <local>?" e avisa: "A data de correção (dd/mm/aaaa) é apagada e a pendência volta para as abertas." Ao confirmar, somem a data da correção e o texto "Como foi corrigido"; as fotos continuam na pendência, inclusive as da correção, que ficam como histórico. Aviso: "Pendência reaberta." Use "Reabrir" quando o serviço voltou a apresentar o problema ou a correção foi recusada na vistoria. No modo de campo, "Reabrir" é imediato, sem janela de confirmação, e funciona sem sinal.

## Excluir: apagar a pendência e as fotos

O "✕" no fim da linha ("Excluir pendência") e o botão "Excluir pendência" no rodapé da janela de edição apagam a pendência. A confirmação mostra a descrição e avisa: "sai da lista com as fotos dela. Isto não pode ser desfeito." As fotos saem do armazenamento junto; não existe lixeira nem desfazer. Por isso, se o problema voltou numa pendência já resolvida, prefira "Reabrir", que preserva o histórico. Excluir só existe na aba 5 (no computador ou no navegador do celular); o modo de campo não exclui. Quem é consulta não vê o "✕".`,
  },
  {
    id: 'terminalidade-pdf',
    title: 'Gerar o PDF da lista de pendências',
    summary:
      'Como gerar o PDF: agrupar por pavimento, empreiteiro ou tipo, escolher os grupos, fotos, folha nova e o que sai na primeira folha.',
    keywords: [
      'pdf',
      'imprimir',
      'impressão',
      'gerar pdf',
      'agrupar',
      'por pavimento',
      'por empreiteiro',
      'por tipo',
      'folha nova',
      'com fotos',
      'relatório',
      'salvar como pdf',
      'só um pavimento',
    ],
    screen: 'terminalidade',
    body: `## Onde fica e o que entra

O botão "Gerar PDF" fica ao lado de "Usar no celular, sem sinal", acima da lista, e aparece para todos os papéis, inclusive consulta. Fica apagado quando a obra não tem pendência. O PDF parte do que a lista mostra no momento: a situação ("Abertas", "Resolvidas" ou "Todas"), os filtros de pavimento, apto, tipo, responsáveis e busca, e a classificação escolhida. Filtre e classifique a lista antes de gerar.

## A janela "PDF das pendências"

1. "Agrupar por": "Pavimento", "Responsável terceiro" ou "Tipo". A janela já abre em "Responsável terceiro" quando a lista está filtrada por um empreiteiro, e em "Tipo" quando está filtrada só por tipo; nos demais casos, "Pavimento".
2. "Quais pavimentos entram" (ou empreiteiros, ou tipos): a lista dos grupos do agrupamento escolhido, com a quantidade de pendências de cada um. Marque e desmarque, use "Selecionar tudo" e "Limpar", ou pesquise pelo nome. O contador "N de M" mostra quantos grupos estão marcados. Cada agrupamento guarda a própria escolha enquanto a janela está aberta.
3. "Com as fotos do problema e da correção": ligado por padrão; desligue para um PDF só com texto.
4. "Cada pavimento começa em folha nova": ligado por padrão.
5. A linha "Dentro de cada grupo, na ordem da lista: …" lembra a classificação que será usada.
6. O rodapé diz "N pendências no PDF" ("Marque ao menos um pavimento." quando nada está marcado). "Gerar PDF" abre a página de impressão numa aba nova; "Cancelar" fecha.

## A página de impressão

A página espera as fotos carregarem (no máximo 20 segundos) e abre sozinha o diálogo de impressão do navegador. Nele, escolha "Salvar como PDF" e o modo paisagem (A4). Se o diálogo não abrir, use o botão "Imprimir / Salvar PDF" no topo da página. O nome sugerido do arquivo sai do título, por exemplo "Pendências MZN - Por pavimento - 29-10-2026".

Na primeira folha:

- Cabeçalho com os logos da ATR e da Takt, o título "LISTA DE PENDÊNCIAS <OBRA>", o agrupamento, a situação e "Gerado em dd/mm/aaaa". Abaixo, as linhas "Filtros: …", "Só os escolhidos: …" (quando nem todos os grupos foram marcados) e "Ordem dentro de cada grupo: …".
- Cartões: com "Todas", o total, as abertas, as resolvidas e a "% resolvida"; com uma situação só, o total, os pavimentos com pendência, os empreiteiros com pendência e as pendências sem responsável terceiro.
- As três roscas "Por tipo", "Por pavimento" e "Por responsável terceiro", contando só o que entrou no PDF, com legenda de cor, nome, quantidade e percentual.

Depois, um bloco por grupo, com o título repetido em cada folha e as colunas "Nº" (contínuo no documento), "Local" (some quando se agrupa por pavimento), "Apto", "Descrição da pendência", "Tipo" (some quando se agrupa por tipo), "Data observação", "Responsável ATR", "Responsável terceiro" (some quando se agrupa por empreiteiro), "Situação" ("Aberta" ou "Resolvida em …", com "Correção: …" quando há o texto), "Foto" e "Foto da correção". Em cada célula de foto entram até duas miniaturas e "+N" para as demais. Pavimentos e tipos saem na ordem cadastrada; empreiteiros, em ordem alfabética; "Sem responsável terceiro" e "Sem tipo" ficam no fim.

## Exemplos rápidos

- Só um pavimento: filtre o pavimento na lista ou, na janela, agrupe por "Pavimento" e deixe marcado só ele.
- Lista para um empreiteiro: clique nele no quadro "Abertas por responsável terceiro" ou na rosca e gere o PDF; a janela já abre agrupada por "Responsável terceiro".
- Fechamento com abertas e resolvidas: escolha "Todas" antes de gerar, para os cartões trazerem a "% resolvida".`,
  },
  {
    id: 'terminalidade-modo-de-campo',
    title: 'Modo de campo no celular, sem sinal (/campo/terminalidade)',
    summary: 'Como baixar a obra, lançar pendência, foto e resolução sem sinal, e como a fila do aparelho sobe quando a conexão volta.',
    keywords: [
      'campo',
      'celular',
      'sem sinal',
      'offline',
      'sem internet',
      'baixar a obra',
      'fila',
      'no aparelho',
      'enviar',
      'sincronizar',
      'lançar pendência',
      'câmera',
      'recusada',
      'descartar',
      'sessão expirou',
    ],
    screen: 'terminalidade',
    body: `## Para que serve

O modo de campo, em "/campo/terminalidade", é a lista de pendências feita para o celular no canteiro: baixa-se a obra com sinal e, depois, tudo funciona sem internet. Nele se faz o que se faz andando pelo prédio: lançar pendência com foto, juntar foto, resolver com a foto da correção e reabrir. Editar, excluir e os cadastros ficam na aba 5, no computador. Quem é consulta só vê a lista.

## Como abrir e baixar a obra (com sinal)

1. Na aba 5, toque em "Usar no celular, sem sinal", ou digite "/campo/terminalidade" no navegador do celular, com o mesmo login.
2. Na primeira vez aparece "Prepare com sinal": toque em "Carregar minhas obras" (só com internet).
3. Toque na obra: se ainda não está no aparelho, ela é baixada com as fotos das pendências abertas e passa a mostrar "Pronta sem sinal · N abertas"; daí em diante abre mesmo em modo avião.
4. Com sinal, "Atualizar a obra com o que está no servidor", no fim da lista, traz o que a equipe lançou no computador e em outros celulares, sem perder a fila do aparelho.

## Lançar, fotografar e resolver sem sinal

- Filtros: "Abertas (N)", "Resolvidas (N)" e "Todas"; "Pavimento" e "Unidade" (a unidade só libera depois do pavimento); "Buscar na descrição" (várias palavras: só as pendências que têm todas).
- "Nova pendência" (botão redondo no canto): "Pavimento" obrigatório; "Apto ou área" opcional ("Do pavimento todo"); "Descrição" obrigatória, até 1.000 caracteres; "Tipo", "Responsável ATR" e "Responsável terceiro" opcionais; "Observada em" começa em hoje e não aceita futuro; "Fotos da pendência" pelo botão "Câmera", já reduzidas no aparelho. "Lançar pendência" guarda tudo e fecha.
- "Foto", no cartão de uma pendência aberta, junta mais fotos do problema sem resolver ("Guardar").
- "Resolver": "Corrigida em" (começa em hoje; não aceita futuro nem antes da observação), "Como foi corrigido" (opcional) e "Foto da correção (obrigatória)"; "Marcar como resolvida" fica apagado até haver a foto.
- "Reabrir", nas resolvidas: volta a pendência para "Abertas" na hora, sem confirmação; a data e o texto da correção saem, as fotos ficam.

As regras do servidor valem no aparelho: resolver sem foto, data futura ou mais de 10 fotos são recusados na hora, com a mesma mensagem.

## Enquanto não enviou, e quando a conexão volta

Cada alteração entra na lista imediatamente. O cartão ganha a etiqueta "no aparelho" até ser enviado, e o cabeçalho mostra "N alterações guardadas no aparelho — sobe sozinho quando o sinal voltar" (ou ", enviando…", com sinal). A etiqueta "on-line" ou "sem sinal" no cabeçalho diz se há conexão agora.

A fila sobe sozinha, na ordem em que foi lançada: ao abrir a tela com sinal, quando o sinal volta e logo depois de cada lançamento com internet. O botão de enviar, no cabeçalho, força o envio na hora. No fim, "N alterações enviadas." e a obra é baixada de novo. Fechar o navegador não perde a fila.

## Conflitos e erros

- "Sua sessão expirou. O que foi lançado continua guardado neste aparelho.", com o link "Entrar de novo": o login volta para esta tela e a fila sobe depois.
- "O servidor recusou uma alteração": uma regra recusou um item (por exemplo, a pendência foi excluída no computador). O envio para nela para não trocar a ordem; cada linha mostra o que era, quando foi lançada e o motivo. "Descartar" tira a alteração e o que dependia dela; se ainda for preciso, lance de novo. O resto sobe no próximo envio.
- Falha passageira de rede ("Sem resposta do servidor.") não descarta nada: a fila tenta de novo.`,
  },
  {
    id: 'terminalidade-perguntas-frequentes',
    title: 'Perguntas frequentes e mensagens da Terminalidade',
    summary:
      'Foto não sobe, não consigo resolver, pendência sumiu, ver só um empreiteiro, imprimir só um pavimento, importação da planilha PCP.',
    keywords: [
      'não consigo',
      'foto não sobe',
      'erro',
      'não aparece',
      'sumiu',
      'só um empreiteiro',
      'só um pavimento',
      'planilha',
      'importar',
      'pcp',
      'link venceu',
      'sem acesso',
      'apenas consulta',
      'mensagem',
    ],
    screen: 'terminalidade',
    body: `## A foto não sobe

- Confira a conexão. O envio tenta duas vezes e, se falhar, mostra "Não foi possível enviar a foto. Verifique a conexão e tente de novo." A pendência já foi salva: a janela vira "Pendência salva — faltam fotos" e "Tentar de novo" reenvia só o que faltou. Ao resolver, as fotos que subiram ficam salvas e a pendência segue aberta até concluir.
- "Formato não suportado": foto HEIC do iPhone aberta fora do Safari, ou arquivo que não é imagem. Tire a foto pela câmera do sistema ou converta para JPG/PNG.
- "Só cabem mais N fotos" ou "O limite de fotos desta pendência já foi atingido": são 10 fotos por pendência, somando problema e correção, com uma vaga reservada para a correção enquanto aberta. Exclua uma foto do problema pela lixeira na janela de edição.
- No canteiro sem sinal, use o modo de campo ("Usar no celular, sem sinal"): a foto fica guardada e sobe depois.

## Não consigo resolver sem foto

É regra, não erro: "Resolver pendência" (e "Marcar como resolvida", no campo) só libera com ao menos uma foto da correção e a data entre a observação e hoje. O texto ao lado do botão diz o que falta. Se ninguém fotografou a correção, é preciso voltar ao local e fotografar o serviço pronto.

## A pendência não aparece na lista

- A lista abre em "Abertas": uma pendência resolvida só aparece em "Resolvidas" ou "Todas".
- Algum item da rosca ou dos quadros ficou clicado e filtrou a lista. Veja "Mostrando X de Y pendências" e use "Limpar filtros"; o item destacado na legenda também sai com um novo clique.
- A busca da descrição continua preenchida; apague o texto.
- No modo de campo, a lista é a cópia baixada: use "Atualizar a obra com o que está no servidor" para trazer o que foi lançado no computador.
- Pendência lançada no celular e ainda não enviada existe só naquele aparelho, com a etiqueta "no aparelho", até o envio.

## Como ver só um empreiteiro ou só um pavimento

Clique no nome dele no quadro "Abertas por responsável terceiro" ou "Abertas por pavimento", ou na legenda da rosca, ou use os filtros "Responsável terceiro" e "Pavimento". Para imprimir só isso, gere o PDF com a lista filtrada, ou abra "Gerar PDF", agrupe por "Pavimento" ou "Responsável terceiro" e deixe marcado só o grupo desejado.

## Mensagens comuns

- "Seu perfil permite apenas consulta.": o papel "Consulta" não grava. Peça ao admin para mudar o papel nas Configurações.
- "Você não tem acesso a esta obra.": a obra precisa ser liberada para você pelo admin.
- "Não foi possível abrir a foto. Se o link venceu, ela volta em instantes; senão, recarregue a página.": os links das fotos valem uma hora; a aba renova sozinha, e recarregar resolve.
- "Registro não encontrado. Recarregue a página.": outra pessoa alterou ou excluiu a pendência.
- "Esta obra ainda não tem pavimentos cadastrados.": cadastre os locais em "Configurações da obra", no computador.

## Trazer a lista de uma planilha PCP

A importação da planilha (aba "Terminalidades" da PCP, com as fotos) não é um botão da tela: é feita pela equipe de desenvolvimento, por script, a pedido. Foi assim com a Mozine, em 21/10/2026. Rodar de novo traz só o que é novo na planilha e não sobrescreve o que a equipe já corrigiu no sistema. Se a sua obra ainda usa o Sheets, peça a importação em vez de digitar tudo.`,
  },
];

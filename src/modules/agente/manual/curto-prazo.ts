import type { ManualSection } from './types';
import { NON_FULFILLMENT_CAUSES } from '../../../domain/entities';

/** Manual da aba 4, Cronograma de curto prazo (29/10/2026): a planilha semanal com Status, causas, PPC e
 * fechamento. Escrito a partir do código dos componentes e do tour; quando o tour ou a documentação
 * divergiam do código, valeu o código. A lista de causas é montada de `NON_FULFILLMENT_CAUSES` para o
 * manual nunca ficar atrás da lista real. */

const causesList = NON_FULFILLMENT_CAUSES.map(c => '- ' + c).join('\n');

export const sections: ManualSection[] = [
  {
    id: 'curto-prazo-visao-geral',
    title: 'Curto prazo: para que serve e como a tela é organizada',
    summary: 'O que é a planilha da semana, suas duas seções, as colunas, os botões do topo e o que cada papel pode fazer.',
    keywords: [
      'curto prazo',
      'planilha da semana',
      'aba 4',
      'cronograma de curto prazo',
      'colunas',
      'fechamento',
      'para que serve',
      'onde fica',
      'celular',
      'cartão',
      'modo reunião',
      'consulta',
      'papel',
      'quem pode',
    ],
    screen: 'curto-prazo',
    body: `## Para que serve

A aba 4, "Cronograma de curto prazo", é a planilha semanal de produção: o que cada empreiteiro se compromete a fazer na semana, se cumpriu ("Sim" ou "Não") e por quê. Tem a mesma estrutura da planilha do Google Sheets que a obra usava e é o módulo aberto a todos em produção desde 07/10/2026. Ela se sustenta sozinha: não depende do plano do mês nem de cadastro feito em outra tela. Cada linha é um compromisso.

## As duas seções

Um seletor no topo troca entre as seções, que ficam no endereço da página (o "Voltar" do navegador funciona):

- **"Planilha da semana"**: onde se planeja e se aponta.
- **"Fechamento"**: lê as mesmas linhas e mostra a série do PPC, o Pareto das causas, as justificativas por causa e "Analisar com IA".

## As colunas

Na ordem da tela: a alça ⠿ de arrastar a linha e a caixa de marcar (para apontar várias linhas), "Empresa", "Semana", "Início", "Término", "Atividade", "Equipe", os dias "SEG" a "SÁB", "Status", "Causas", "Justificativas", a coluna "Apontamento" (botões "Levar ›" e "Limpar"; só aparece quando a semana já tem algum apontamento ou com "Semanas vizinhas" ligado) e, no fim, "Inserir linha acima" e o ✕ de excluir. Os dias não se clicam: ficam marcados com "x" sozinhos, a partir de "Início" e "Término".

## O que fica acima da planilha

- **"Semana analisada"**: a semana exibida; a tela abre na semana atual.
- **"Semana atual: N"** com o link "definir semana 1" (ou "alterar semana 1"), que abre as Configurações da obra.
- **"PPC"**: cumpridos sobre o total da semana; entre parênteses, quantas linhas ainda estão sem Status.
- **"Gravando…"**: há gravação ainda subindo.
- **"Desfazer"**: volta a última gravação desta sessão.
- **"Semanas vizinhas"**: mostra a anterior acima e a próxima abaixo.
- **"Como preencher"**: lembrete das células.
- **"Gerenciar empreiteiros e equipes"** ("Consultar recursos" para quem só consulta): abre as Configurações da obra, com o cadastro de empreiteiros e equipes, a capacidade de cada equipe e a semana 1.
- **"PDF do planejamento"** e **"PDF do fechamento"**.
- **"Ajustar à tela"**: só em telas largas; encolhe as colunas para a planilha caber.

Abaixo aparecem, quando houver: o aviso de semana encerrada, o erro da última gravação, o aviso de linhas com "Não" aguardando causa, a barra de "linhas marcadas", "Mostrando X de Y linhas" e a frase sobre a ordem das linhas.

No cabeçalho da aba, "Como funciona" abre a explicação longa e "Como usar" inicia o tour que explica cada botão. O "Modo reunião", na navegação do sistema, aumenta o texto inteiro para projetar a planilha na reunião semanal.

## Quem pode fazer o quê

- **Consulta (viewer)**: só lê. Sem caixa de marcar, "Desfazer", linha nova, "Inserir linha acima", alça ⠿, ✕ ou alça de arrastar valores; Status, causa e justificativa desabilitados. Pode gerar os PDFs e ver o Fechamento.
- **Planejador, gestor e admin**: incluem, editam e excluem linhas da semana aberta e apontam em qualquer semana.
- **Admin**: também altera linhas de semana encerrada.

## No celular

Abaixo de 1024 px de largura, cada linha vira um cartão com os mesmos campos: atividade e ✕ no topo, "Empresa" e "Equipe", "Semana", "Início" e "Término", os dias como pílulas, "Status" e "Causa", "Justificativa" e os botões de apontamento. A linha nova vira o cartão "Nova linha", com o botão "Adicionar". Os filtros de coluna só existem na tabela de telas largas; a barra de linhas marcadas fica fixa no rodapé; a alça de arrastar não existe no cartão, então use as caixas de marcar para apontar várias linhas.`,
  },
  {
    id: 'curto-prazo-incluir-editar-linhas',
    title: 'Incluir, editar, mover, excluir e filtrar linhas',
    summary:
      'Como criar uma linha (embaixo ou no meio), o que é obrigatório, as listas de Empresa/Equipe/Semana, o calendário, o funil de filtro e a ordem (arrastar linhas).',
    keywords: [
      'incluir linha',
      'nova linha',
      'inserir linha no meio',
      'inserir linha acima',
      'arrastar linha',
      'mudar a ordem',
      'subir linha',
      'descer linha',
      'adicionar atividade',
      'empresa',
      'equipe nova',
      'capacidade 3',
      'semana da linha',
      'início',
      'término',
      'mover de semana',
      'excluir linha',
      'filtro',
      'funil',
      'classificar',
      'ordem das linhas',
    ],
    screen: 'curto-prazo',
    body: `## Incluir uma linha

A última linha da planilha é a linha em branco (fundo azulado). Escreva o que será feito em "Atividade" ("Escreva a atividade e tecle Enter") e tecle Enter, ou saia da linha: a linha passa a existir. No celular, use o cartão "Nova linha" e "Adicionar".

- **Obrigatório**: só a atividade. Linha sem atividade não existe.
- **Opcionais**: "Empresa", "Equipe", "Início" e "Término". Sem período, a linha nasce na segunda-feira da semana, com término igual ao início.
- A linha nova entra embaixo e fica embaixo; após o Enter, o foco volta à atividade para a próxima.
- Equipe só depois da empresa.

## Inserir uma linha no meio

O botão "Inserir linha acima" (ícone de linhas com seta, ao lado do ✕, no fim de cada linha) abre uma linha em branco logo acima daquela, já no campo da atividade. Escreva e tecle Enter: a linha entra ali, e a linha em branco continua aberta para a próxima, que entra logo abaixo da criada. Esc ou "Cancelar" fecham sem criar; sair da linha depois de criar também fecha. No celular, o mesmo botão fica no topo do cartão e abre o cartão "Nova linha acima de …", com "Inserir" e "Cancelar". Só na semana analisada e para quem pode editar a semana (encerrada: só administradores).

## As listas suspensas

- **"Empresa"**: junta o cadastro de empreiteiros da obra e os nomes já digitados na planilha (acento e maiúsculas não criam duplicata). Pesquise e escolha, ou digite um nome novo e confirme em "Usar “nome”". Trocar a empresa tira da linha a equipe de outra empresa.
- **"Equipe"**: mostra só as equipes da empresa da linha. Digitar um nome novo e confirmar em "Criar equipe “nome” em Empresa" cria a equipe no cadastro daquela empresa com capacidade inicial de 3 atividades por semana (ajustável em Configurações da obra). Sem empresa, a lista diz "Escolha a empresa primeiro.".
- **"Semana"**: da semana 1 da obra até 4 semanas à frente da atual, mais qualquer semana que já tenha linha.

## Início, Término e o calendário

"Início" é o primeiro dia do compromisso e "Término" o último, sempre dentro da semana da linha. Os "x" de SEG a SÁB vêm desses dois campos: para mudar os dias, mude o período. Se o início ficar depois do término, o término acompanha.

## Mover uma linha de semana

Trocar a "Semana" move a linha inteira: início e término andam o mesmo número de semanas, no mesmo dia da semana, e a linha passa a aparecer na semana escolhida. "Levar ›" é diferente: cria uma cópia na semana seguinte sem mexer na original.

## Editar qualquer célula

Tudo é editável na própria célula: lista grava na hora; texto e data, ao sair do campo ou com Enter. A linha fica em âmbar enquanto grava. Apagar a atividade inteira só devolve o nome anterior; editar não muda a posição da linha.

## Excluir uma linha

O ✕ no fim da linha pergunta "Excluir a linha “…”?" e avisa que o apontamento sai junto e que a série do PPC e o Pareto deixam de contar a linha. O aviso seguinte traz "Desfazer", que devolve a linha ao mesmo lugar. Para corrigir um Sim ou Não errado, não exclua: troque a célula ou use "Limpar".

## Filtrar e classificar (o funil)

Cada cabeçalho tem o funil do Sheets, com "Classificar A→Z", "Classificar Z→A", "Remover classificação" e "Filtrar por valores": caixas por valor com contagem, "Selecionar tudo", "Limpar", pesquisa e "(vazias)" para células em branco. O filtro só vale ao clicar em "OK"; marcar todos os valores é não filtrar. Com filtro ativo aparece "Mostrando X de Y linhas" e "Limpar filtros e classificação". O filtro não altera o PPC do topo, que é sempre da semana inteira. Classificar é ação de uma vez: apontar ou editar depois não move a linha, e as novas continuam entrando embaixo.

## Ordem e larguras

A ordem da planilha é salva e vale para todos: sem ninguém ter mexido, é a de inclusão. Para mudar, segure a alça ⠿ do começo da linha e arraste para cima ou para baixo (o filete azul mostra onde ela cai); com a alça selecionada, as setas ↑ e ↓ movem uma posição. No celular, use as setas de subir e descer do cartão. Arrastar e inserir só existem na semana analisada; o "Desfazer" volta a ordem anterior. Linha que muda de semana entra embaixo na semana nova. "Organizar por empresa" junta as linhas de cada empresa (pela data de início) e o funil classifica, mas os dois só valem na sua tela: a faixa avisa "só nesta tela" e oferece "Salvar esta ordem" (grava para todos) e "Voltar à ordem salva" (desfaz); arrastar ou inserir uma linha também salva a ordem que está na tela. Arraste a borda do cabeçalho para mudar a largura da coluna (duplo clique volta ao padrão); "Ajustar à tela" encolhe as colunas até a planilha caber. As larguras ficam guardadas no navegador.`,
  },
  {
    id: 'curto-prazo-apontamento',
    title: 'Apontar Sim ou Não, causa, justificativa, Levar e Limpar',
    summary: 'Como registrar o cumprimento de cada linha, por que o Não exige causa, a justificativa, a gravação por trás e as correções.',
    keywords: [
      'apontar',
      'apontamento',
      'status sim',
      'status não',
      'causa obrigatória',
      'escolha a causa',
      'justificativa',
      'realizado',
      'gravando',
      'enter desce',
      'limpar apontamento',
      'levar para a próxima semana',
      'linha rosa',
      'não gravou',
      'corrigir apontamento',
    ],
    screen: 'curto-prazo',
    body: `## Status: Sim ou Não

Ao encerrar a semana, registre em cada linha se o compromisso foi cumprido. "Status" é uma lista com "Sim" (verde) e "Não" (vermelho).

- **"Sim"** grava na hora; uma justificativa já escrita sobe junto.
- **"Não"** só é gravado depois que a causa é escolhida. Até lá a linha fica em rosa, a célula "Causas" mostra "Escolha a causa" com contorno vermelho e, acima da planilha, aparece "N linhas marcadas como Não aguardam a causa". Recarregar a página antes de escolher a causa perde a marca.
- Para trocar um "Sim" gravado por "Não", escolha "Não" e a causa; a linha fica marcada do mesmo jeito até a causa entrar.

## Causa do não cumprimento

A célula "Causas" só abre quando o Status é "Não" (nas outras: "A causa só é pedida quando o Status é Não."). A causa vem de uma lista fechada, para as falhas poderem ser somadas: é dela que sai o Pareto do Fechamento. A lista completa está na seção de causas e perguntas frequentes.

## Justificativa

Texto livre ao lado da causa, em qualquer ordem. Pode ser escrita **antes** do Status: fica guardada na linha ("Será gravada junto com o Status.") e sobe com o "Sim" ou com a causa. Com a linha já apontada, grava ao sair do campo. Aparece em "Justificativas por causa", no Fechamento.

## A planilha não espera o servidor

O que você escolhe aparece na hora e a gravação segue por trás: um filete âmbar na linha e o "Gravando…" no topo dizem que ainda há algo subindo; nada trava, e as gravações entram numa fila, na ordem. Se o servidor recusar, aparece "Não foi possível salvar." com o motivo, no canto da tela e acima da planilha, até a próxima ação; a linha marcada como "Não" continua marcada em vez de voltar calada.

## Teclado

Enter desce para a mesma coluna da linha de baixo e Shift+Enter sobe (em Status, Causas, Justificativas, Atividade, Semana, Início e Término). Nos campos de texto, as setas para cima e para baixo também mudam de linha. Sair da célula é o que grava; na última linha, Enter só confirma.

## Os botões da coluna "Apontamento"

- **"Levar ›"**: cria a mesma linha (empresa, equipe, atividade e período) na semana seguinte, sem apontamento. A origem não muda e, se tinha "Não", ele continua no PPC dela. Aparece na linha com "Não" ou, com "Semanas vizinhas" ligado, em qualquer linha, e só quando a semana seguinte está aberta para você. Se já existe linha igual na semana seguinte, vira "Levar de novo" e avisa que criará outra.
- **"Restrição"**: transforma o não cumprido numa restrição do longo prazo. Em desenvolvimento: só aparece para desenvolvedores.
- **"Limpar"**: desfaz um "Sim" ou "Não" marcado por engano. Tira Status, causa e justificativa; a linha continua, sem Status. Pergunta "Limpar o apontamento de “…”?" quando o apontamento já estava gravado; um "Não" ainda aguardando causa é limpo sem perguntar.

## Apontamento em qualquer semana

Status, causa, justificativa e "Limpar" ficam abertos em qualquer semana, inclusive nas encerradas, para planejador, gestor e admin. Só o perfil de consulta não aponta.

## Como corrigir um apontamento errado

Troque a célula: escolha o outro Status (e a causa, se for "Não"), ou use "Limpar". Não exclua a linha: excluir apaga o compromisso e o tira da série do PPC e do Pareto. Se acabou de gravar, "Desfazer" (ou Ctrl+Z) volta a última gravação.`,
  },
  {
    id: 'curto-prazo-lote-alca-desfazer',
    title: 'Apontar várias linhas de uma vez e Desfazer',
    summary: 'A barra de linhas marcadas, a alça de arrastar como no Sheets e o Desfazer (botão, Ctrl+Z e o aviso).',
    keywords: [
      'lote',
      'várias linhas',
      'marcar linhas',
      'linhas marcadas',
      'aplicar a',
      'alça',
      'arrastar',
      'copiar para baixo',
      'quadradinho',
      'desfazer',
      'ctrl+z',
      'voltar atrás',
      'marcar todas',
      'ficam de fora',
    ],
    screen: 'curto-prazo',
    body: `## Marcar linhas e aplicar de uma vez

Cada linha tem uma caixa de marcar na primeira coluna; a do cabeçalho marca todas as linhas visíveis. Com linhas marcadas aparece a barra **"N linhas marcadas"** (acima da planilha no computador, fixa no rodapé no celular):

- **"Marcar todas (N)"**: marca todas as que passam nos filtros.
- **"Status"**: "Manter como está", "Sim" ou "Não".
- **"Causa"**: "Manter" ou uma causa da lista; desabilitada quando o Status escolhido é "Sim".
- **"Justificativa"**: "Manter" ou "Trocar por…", que abre o campo do texto novo ("Em branco apaga a justificativa das marcadas").
- Embaixo de cada campo, **"Hoje: …"** mostra o valor atual nas marcadas ("vários" quando diferem, "vazio" quando não há).
- **"Aplicar a N"** grava tudo numa ida só ao servidor; **"Desmarcar"** limpa a seleção.

Regras, linha a linha: "Não" exige causa (a da barra ou a que a linha já tinha); "Sim" não tem causa; "Manter como está" numa linha sem Status não grava nada. As linhas que não dão para gravar ficam de fora, e a barra avisa antes: "N linhas ficam de fora: sem Status" ou "Não sem causa". Se nada muda: "Nada a gravar: as marcadas já estão assim." Depois de aplicar, a barra volta a "Manter como está".

Limites: até 500 linhas por aplicação, tudo ou nada (uma linha recusada derruba o lote, com um erro só). Com a planilha filtrada, só as linhas à vista contam. Com "Semanas vizinhas", a seleção atravessa as três semanas.

## A alça de arrastar (como no Sheets)

Ao passar o mouse numa célula de "Status", "Causas" ou "Justificativas", aparece um quadradinho no canto inferior direito. Arraste para baixo ou para cima e solte: o valor da célula de origem é copiado nas linhas por onde o ponteiro passou, numa gravação só; as linhas alvo ficam realçadas durante o arrasto.

- **Status "Sim"** copia o Sim. **Status "Não"** copia o Não com a causa da origem nas linhas sem causa; sem causa em nenhuma das duas, a linha fica "aguardando a causa", como no clique.
- **Causa** só entra em linha com "Não"; as outras ficam de fora ("Nenhuma linha recebeu o valor: sem Não.").
- **Justificativa** em linha sem Status fica como rascunho, para subir com o Status.
- Origem vazia: "A linha de origem está sem Status." ou "A linha de origem está sem causa.".

A alça só existe na tabela de telas largas; no celular, use as caixas de marcar. Se o navegador tomar o gesto (rolagem por toque), nada é gravado.

## Desfazer

O botão **"Desfazer"**, ao lado do PPC, volta a última gravação desta sessão; ganha "(N)" quando há mais de uma na pilha e, ao passar o mouse, diz o que vai desfazer. **Ctrl+Z** (Cmd+Z no Mac) fora de um campo de texto faz o mesmo; dentro de um campo, Ctrl+Z desfaz a digitação do próprio campo. Os avisos de lote, alça, "Levar", exclusão e "Limpar" trazem o próprio "Desfazer", que desfaz aquela ação em particular (o aviso fica 8 segundos).

Desfaz: apontamento (de uma linha, do lote ou da alça), justificativa, "Limpar", edição de célula, "Levar" (apaga a linha criada), exclusão (recria a linha no mesmo lugar e regrava o Sim/Não), linha nova ou inserida (apaga) e arrasto de linha (volta a ordem anterior). Uma equipe criada pela linha fica no cadastro.

Limites: guarda as últimas 20 ações; recarregar a página zera a lista, como no Sheets; não há "Refazer"; desfazer é uma gravação comum e passa pelas mesmas regras de semana encerrada e papel. Desfazer uma ação antiga pelo aviso não desfaz as que vieram depois nas mesmas linhas.`,
  },
  {
    id: 'curto-prazo-semanas',
    title: 'Semanas: navegação, numeração, Semanas vizinhas e semana encerrada',
    summary: 'Como trocar de semana, de onde vem o número da semana (semana 1), a visão das vizinhas e quando a semana trava.',
    keywords: [
      'semana analisada',
      'semana atual',
      'semana 1',
      'numeração',
      'número da semana',
      'semanas vizinhas',
      'semana anterior',
      'próxima semana',
      'semana encerrada',
      'travou',
      'não consigo editar',
      'terça-feira',
      'só administradores',
      'levar para a semana seguinte',
    ],
    screen: 'curto-prazo',
    body: `## Trocar de semana

O seletor **"Semana analisada"** lista as semanas da obra, da mais recente para a mais antiga, como "N · dd/mm a dd/mm", com "(atual)" na semana de hoje. Entram a semana 1 da obra até quatro semanas à frente da atual, mais qualquer semana que já tenha linha. A tela abre na semana atual.

## De onde vem o número da semana

O número é cumulativo, contado a partir da **semana 1 da obra**, definida em Configurações da obra, bloco "Numeração das semanas" (o link "definir semana 1" / "alterar semana 1", ao lado de "Semana atual", leva até lá). Informe "Pelo número da semana atual" (a planilha diz 113, e o sistema conta para trás) ou "Pela data da semana 1" (qualquer dia vale pela segunda-feira); há também "Voltar à numeração automática".

Sem semana 1 definida, a contagem começa na primeira semana com linha na planilha, e a planilha de origem pode ter outra contagem até a semana 1 ser ajustada. Semanas anteriores à semana 1 aparecem com número zero ou negativo, de propósito (acontece em histórico importado).

## Semanas vizinhas

A caixa **"Semanas vizinhas"** mostra, na mesma planilha e com os mesmos filtros de coluna, a semana anterior acima e a próxima abaixo da analisada. Cada semana ganha uma faixa com "Semana anterior", "Semana analisada" ou "Próxima semana", o período, as linhas (ou "N de M linhas com esses filtros") e o PPC. Serve para planejar um empreiteiro de cada vez: filtre a "Empresa" e veja o que faltou, o que continua e o que vem.

- **Semana anterior**: linhas esmaecidas; só aceita apontamento e "Levar ›", mesmo aberta. A faixa avisa: "Só apontamento e "Levar p/ próxima". Para editar as linhas, escolha esta semana no seletor."
- **Próxima semana**: editável como a analisada, se não estiver encerrada; sem linha em branco, alça de arrastar nem "Inserir linha acima" (para isso, escolha-a no seletor).
- Nessa visão, "Levar ›" aparece em **qualquer** linha: a cópia entra na semana seguinte sem apontamento e sem marca de continuação.
- A classificação pelo funil vale só para a analisada; as vizinhas ficam na ordem de inclusão. Antes da semana 1 não há semana anterior. A escolha fica lembrada no navegador.

## Semana encerrada

A semana fica aberta até a **terça-feira seguinte, inclusive**. A partir da quarta-feira:

- **Incluir, editar ou excluir linhas** (inclusive mover uma linha para dentro ou para fora dela): só administradores. Para os demais, as células da linha ficam desabilitadas, a linha em branco some e o ✕ não aparece, com o aviso "Semana encerrada em dd/mm/aaaa: Realizado, causa e justificativa continuam abertos; incluir, editar ou excluir linhas, só administradores." O admin vê "…: você está alterando como administrador."
- **Apontar é livre**: Status, causa, justificativa e "Limpar" continuam abertos para planejador, gestor e admin.
- **"Levar ›"** confere a semana de destino, não a de origem: dá para levar uma linha de semana encerrada para a seguinte, desde que a seguinte esteja aberta.
- O servidor confere o mesmo; a recusa diz "A semana de dd/mm a dd/mm foi encerrada em dd/mm: só administradores podem alterá-la."

"Hoje", para essa regra, é a data de São Paulo.

## Levar uma tarefa não feita para a semana seguinte

Na linha com "Não", clique em "Levar ›". A cópia entra na semana seguinte sem apontamento, e o aviso traz "Desfazer". A original fica como registro: o "Não" continua no PPC e a causa no Pareto. Com "Semanas vizinhas", dá para levar também a linha que continua ("Sim") ou a sem Status, e da anterior para a analisada.`,
  },
  {
    id: 'curto-prazo-fechamento',
    title: 'Fechamento: PPC, série, Pareto das causas, justificativas e Analisar com IA',
    summary: 'Como o PPC é calculado, como ler a série e o Pareto, o recorte por empreiteiro e equipe e o que faz o botão de IA.',
    keywords: [
      'ppc',
      'como calcula o ppc',
      'série do ppc',
      'fechamento',
      'pareto',
      'causas mais frequentes',
      'justificativas por causa',
      'temas',
      'analisar com ia',
      'não configurado',
      'recorte',
      'empreiteiro',
      'período',
      'esta semana',
      'obra inteira',
    ],
    screen: 'curto-prazo',
    body: `## Como o PPC é calculado

PPC é o número de linhas cumpridas ("Sim") dividido pelo total de linhas assumidas na semana. Nunca é a média dos percentuais executados. Linha sem Status conta como não cumprida até ser apontada; por isso o PPC do topo mostra "(N sem status)". Semana sem linha mostra "—". Filtros de coluna não mudam o PPC, que é sempre da semana inteira.

## A seção "Fechamento"

Escolha "Fechamento" no seletor de seções. Ela lê as linhas da planilha e mais nada. No topo:

- **"Semana analisada"**: a semana destacada na série e usada pelo Pareto, pelas justificativas e pela IA quando o período é "Esta semana". Abre na semana atual.
- **"Empreiteiro"** e **"Equipe"**: recortam a série, o Pareto, as justificativas e a análise com IA. Marque ou desmarque na lista e confirme; marcar tudo é não filtrar. "Limpar" tira o recorte, e "Recorte ativo: …" lembra que ele está ligado.
- O "?" ao lado de cada título explica a leitura.

## Série do PPC

Barras das últimas 12 semanas, da mais antiga para a mais recente, com o percentual e o rótulo "S<número>". Barra cheia é semana apurada; barra hachurada é semana em aberto (tem linha sem Status) e fica fora da média; a faixa âmbar é a semana analisada; o tracejado é a média das apuradas. Acima, os cartões "PPC médio das semanas apuradas" (em alerta abaixo de 70%) e "Semanas apuradas · em aberto". Sem linhas na obra: "Nenhum compromisso registrado ainda: a série começa na primeira linha da planilha."

## Pareto das causas

Conta as linhas com Status "Não" e causa apontada, da mais frequente para a menos, na tabela "Causa", "Ocorrências", "Participação" e "Acumulado". As barras em vermelho são as poucas causas que somam os primeiros 80% das falhas, e o aviso resume: "N causas respondem por X% das falhas…". O seletor **"Período"** escolhe "A obra inteira" (padrão) ou "Esta semana"; numa semana só, cada causa aparece uma ou duas vezes e a ordem diz pouco. Sem falhas: "Nenhuma falha apurada ainda. O Pareto se forma quando as linhas não cumpridas recebem a causa."

## Justificativas por causa

As falhas agrupadas por causa, na ordem do Pareto, com "N falhas · N justificadas" e o texto de cada linha (ou "Sem justificativa"). Os temas são termos que se repetem em duas ou mais justificativas da mesma causa. Clique na causa para abrir ou fechar. "Pesquisar justificativas" filtra pelo texto da justificativa, da atividade, do empreiteiro ou da equipe, sem diferenciar acentos. Valem o mesmo período e recorte do Pareto.

## Analisar com IA

No fim das justificativas, **"Analisar com IA"** envia as linhas não cumpridas do recorte atual (período, empreiteiro e equipe) a um modelo de IA, que devolve temas por causa, padrões por empreiteiro e cinco ações recomendadas, em "Leitura da IA · N linhas". Só lê: nada é gravado. O botão fica desabilitado sem falha no recorte; enquanto roda, mostra "Analisando…" e "Lendo as justificativas…".

- **"Análise com IA não configurada: defina ANTHROPIC_API_KEY."**: o servidor está sem a chave do serviço de IA. Não se resolve na tela: peça ao administrador do sistema para configurar a chave no servidor (a mesma que liga a assistente de IA).
- "Não foi possível analisar agora. Tente de novo em instantes.": falha momentânea; repita depois.
- "Você não tem acesso a esta obra.": seu usuário não tem a obra liberada.`,
  },
  {
    id: 'curto-prazo-pdf-impressao',
    title: 'Imprimir: PDF do planejamento e PDF do fechamento',
    summary: 'Os dois PDFs da semana, a janela de empreiteiros e ordem, o painel do fechamento com o ranking das obras e a faixa do tempo.',
    keywords: [
      'pdf',
      'imprimir',
      'salvar como pdf',
      'pdf do planejamento',
      'pdf do fechamento',
      'resultados semana',
      'painel do fechamento',
      'ranking das obras',
      'ppc geral',
      'empreiteiros no pdf',
      'ordem das linhas',
      'tempo',
      'clima',
      'previsão do tempo',
      'chuva',
      'paisagem',
      'logo',
    ],
    screen: 'curto-prazo',
    body: `## Os dois PDFs

Acima da planilha há dois botões, visíveis para todos os papéis:

- **"PDF do planejamento"**: a semana analisada no formato da planilha da obra, para distribuir antes da semana. O arquivo recebe o nome "PCP-<código da obra> - Semana N".
- **"PDF do fechamento"**: a mesma planilha com as colunas "Realizado" (Sim em verde, Não em vermelho), "Causas" e "Justificativa". O nome é "PCP-<código da obra> - Resultados Semana N". Gere depois de apontar o Sim e o Não da semana. Por padrão, a primeira página é o painel do fechamento (abaixo) e a planilha vem depois.

## A janela antes do PDF

Os dois botões abrem a mesma janela ("Escolha os empreiteiros e a ordem das linhas."):

- **"Ordem das linhas"**: "Por empreiteiro" (as linhas de cada empresa juntas, pela data de início, como na planilha da obra) ou "Por data de início" (data primeiro, depois empresa).
- **"Empreiteiros"**: a lista dos empreiteiros da semana com o número de linhas de cada um, "Selecionar tudo", "Limpar", pesquisa e "(sem empreiteiro)" para linhas sem empresa. Se a coluna "Empresa" da planilha estiver filtrada, a janela já começa com essa seleção.
- **"Painel na primeira página"** (só no PDF do fechamento, já marcado): desmarcado, o PDF sai só com a planilha.
- O rodapé diz "N linhas no PDF" ou "Marque ao menos um empreiteiro."; "Gerar PDF" abre o documento numa aba nova.

Os outros filtros e a classificação da planilha não vão para o PDF: só a escolha de empreiteiros e a ordem.

## A aba do PDF

A página abre fora do layout do sistema, em A4 paisagem, e chama sozinha o diálogo de impressão do navegador. Nele, escolha "Salvar como PDF" e o modo paisagem; o título da página vira o nome do arquivo. Se o diálogo não abrir, use o botão "Imprimir / Salvar PDF" no topo da aba. Uma linha ao lado diz quantas linhas saíram, a ordem e quem ficou "fora do PDF". É preciso estar logado; a página respeita o acesso às obras do usuário.

O cabeçalho repete em cada folha: os logos da ATR e da Takt, "PLANEJAMENTO DE CURTO PRAZO <NOME DA OBRA>", "Semana analisada: N" e "Semana atual: N"; depois as datas de cada dia e as colunas "Empreiteiro", "Semana", "Início", "Término", "Atividade", "Equipe" e "Seg." a "Sáb" com os "x" do calendário. Semana sem linha imprime "Semana sem linhas no planejamento."

## O painel na primeira página do fechamento

Uma folha com o mesmo cabeçalho e "RESULTADOS DA SEMANA N". Tudo conta só até a semana analisada (o PDF de uma semana antiga sai igual depois) e sempre a obra inteira: os empreiteiros desmarcados na janela saem só da planilha, e o rodapé avisa.

- **Frase de resumo**: o PPC da semana, a diferença para a semana anterior e para a média, a posição no ranking e a principal causa.
- **Quatro números**: "PPC da semana N" (com "em aberto" se houver linha sem Status), "Em relação à semana N" (em pontos percentuais), "Média das últimas 12 semanas" e "PPC geral da obra", com a posição ("2º de 6") e a média das obras.
- **"PPC da semana e das anteriores"**: as 12 semanas até a analisada, como a série do Fechamento.
- **"Ranking das obras · PPC geral"**: todas as obras ativas pelo nome, ordenadas pelo PPC geral, com a obra do PDF destacada e o PPC de cada uma na mesma semana do calendário. De outra obra só aparecem esses números. Obra com menos de 4 semanas apuradas fica no fim, "em início", sem posição.
- **"Causas na semana N"**, com a posição de cada causa no Pareto da obra, e **"Principais causas na obra · Pareto"**, com as causas que somam 80% em vermelho.

PPC geral é cumpridos ÷ assumidos de todas as semanas apuradas, somando as linhas; semana com linha sem Status fica fora das médias e do ranking.

- **"Ranking das obras indisponível no momento."**: o servidor não respondeu a tempo. O painel sai sem a comparação; gere de novo em instantes.

## O tempo no fim do PDF

Nos dois PDFs, o fim do documento traz a faixa do tempo da semana: seis quadros de segunda a sábado com ícone, descrição ("Céu limpo", "Chuva", "Nublado"…), temperaturas ("máx 28° · mín 19°"), chuva em milímetros (e a probabilidade, só na previsão) e a marca "obs." (dia já observado) ou "prev." (previsão). Dias com chuva relevante ficam destacados. O título é "Previsão do tempo para a semana" quando tudo é previsão, "Tempo na semana" quando tudo já passou, ou um misto na semana corrente. Abaixo, uma frase-resumo e "Fonte: Open-Meteo · lugar · consultado em …".

- **"Tempo não incluído: informe o local da obra em Configurações da obra."**: a obra não tem local cadastrado. Informe o endereço em Configurações da obra para o tempo entrar.
- **"Tempo indisponível no momento."**: o serviço de previsão não respondeu. O PDF espera no máximo 4 segundos e sai assim mesmo; gere de novo mais tarde se o tempo for importante.`,
  },
  {
    id: 'curto-prazo-causas-e-duvidas',
    title: 'Lista de causas de não cumprimento e perguntas frequentes',
    summary: 'As causas disponíveis na lista Causas, o que cada escolha significa na prática e respostas para as dúvidas mais comuns.',
    keywords: [
      'causas',
      'lista de causas',
      'causa não informada',
      'falha de equipamento',
      'falta de equipamento',
      'intempéries',
      'retrabalho',
      'perguntas frequentes',
      'a linha sumiu',
      'não consigo editar',
      'causa não gravou',
      'apontamento errado',
      'semana passada',
      'histórico importado',
    ],
    screen: 'curto-prazo',
    body:
      `## As causas de não cumprimento

A célula "Causas" (e o campo "Causa" da barra de linhas marcadas) oferece sempre a mesma lista fechada, para as falhas poderem ser somadas no Pareto. As opções, na ordem da tela:

` +
      causesList +
      `

Observações:

- **"Falha de Equipamento"** e **"Falta de equipamento"** são diferentes de propósito: a primeira é equipamento que existia e quebrou ou não funcionou; a segunda é equipamento que não estava disponível.
- **"Falha de Gestão do Empreiteiro"** e **"Falha de Gestão da Construtora"** separam de quem foi a falha.
- **"Causa não informada"** existe para o histórico importado da planilha antiga, onde havia "Não" sem causa. Não a escolha ao preencher a semana agora.

## Perguntas frequentes

**Por que não consigo editar a semana passada?** A semana fica aberta até a terça-feira seguinte; a partir da quarta, incluir, editar ou excluir linhas é só para administradores, e as células ficam desabilitadas com o aviso "Semana encerrada em…". O apontamento (Status, causa, justificativa, "Limpar") continua livre para planejador, gestor e admin. Precisa mudar uma linha de semana encerrada? Peça a um administrador.

**Marquei "Não" e a causa não gravou.** O "Não" só é gravado depois da causa; até lá a linha fica rosa e aparece "N linhas marcadas como Não aguardam a causa". Escolha a causa em "Causas". Se recarregou a página antes, a marca se perdeu: marque de novo. Se apareceu "Não foi possível salvar.", leia o motivo no aviso e corrija.

**A linha sumiu depois do filtro.** Um filtro de coluna está escondendo a linha: veja "Mostrando X de Y linhas" e clique em "Limpar filtros e classificação". Confira também "Semana analisada": uma linha movida de semana aparece na semana escolhida.

**Como corrijo um apontamento errado?** Troque a célula "Status" (e a causa, se for "Não") ou use "Limpar" para voltar a linha ao estado sem Status. Não exclua a linha: isso apaga o compromisso e o tira da série do PPC e do Pareto. Se foi agora, "Desfazer" ou Ctrl+Z volta a última gravação.

**Como levo uma tarefa não feita para a semana seguinte?** Na linha com "Não", "Levar ›": a cópia entra na próxima semana sem apontamento e a original fica como registro. Com "Semanas vizinhas", qualquer linha pode ser levada, inclusive da semana anterior para a analisada.

**O número da semana não bate com a planilha antiga.** Defina a semana 1 em Configurações da obra, "Numeração das semanas", informando o número da semana atual na planilha. Histórico importado pode mostrar semanas com número zero ou negativo quando a planilha de origem contava de outro jeito.

**Digitei uma equipe e ela não entrou.** Equipe só é criada com a empresa preenchida na linha ("Escolha a empresa da linha antes de criar uma equipe."). Preencha "Empresa" e digite a equipe de novo.

**Sou do perfil consulta e não consigo apontar.** O perfil de consulta só lê; peça a um administrador para alterar seu papel em Configurações.`,
  },
];

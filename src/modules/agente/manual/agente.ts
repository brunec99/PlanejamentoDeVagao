import type { ManualSection } from './types';
import { AGENT } from '../agent-identity';

/** O manual da própria assistente (29/10/2026): o que ela faz, o que não faz, como aplicar uma proposta,
 * os avisos do painel e a tela do admin. Escrito a partir de `agent-panel.tsx`, `agent-tools.ts`,
 * `agent-cost.ts`, da rota `/api/agente` e de `agent-admin.tsx`. */
const N = AGENT.name;

export const sections: ManualSection[] = [
  {
    id: 'agente-o-que-faz',
    title: `Quem é ${N} e o que ela faz`,
    summary: 'A assistente de IA: onde fica o botão, as partes do painel (Leitura, Radar, Conversa, uso) e o que ela lê da obra.',
    keywords: [
      'claudia',
      'assistente',
      'agente de ia',
      'inteligência artificial',
      'o que você faz',
      'o que você sabe fazer',
      'quem é você',
      'painel',
      'botão da assistente',
      'leitura da obra',
      'radar',
      'para que serve a ia',
    ],
    screen: 'agente',
    body: `## Quem é ${N}

${N} é a assistente de planejamento do Obra 360. Ela fica no botão com o nome dela, no cabeçalho de **toda tela da obra** (no celular aparece só o ícone de brilho). O botão abre um painel lateral com quatro partes, de cima para baixo:

1. **Leitura de ${N}** — um texto curto, escrito pela inteligência artificial, sobre a situação da obra: os pontos mais importantes com nomes e números, as correlações entre os níveis, o que fazer esta semana e os dados que faltam.
2. **Radar** — os achados automáticos do sistema sobre os dados da obra, com um chip de gravidade ("Alerta", "Atenção", "Positivo", "Info") e o nível de origem ("Longo", "Médio", "Curto" ou "Cruzado", quando o achado compara dois níveis). Cada achado tem um título, uma explicação e, em "Ver itens", a lista do que foi encontrado. O Radar é feito por regras fixas e **funciona mesmo sem a inteligência artificial configurada**.
3. **Conversa** — onde você pergunta sobre a obra, pede edições na planilha da semana e tira dúvidas sobre o sistema.
4. **O que o agente leu** — o dossiê em texto que ela recebeu: tudo o que ela sabe da obra vem dali. Abra para conferir de onde saiu um número.

No rodapé fica o uso de IA do mês ("Uso de IA no mês: X de Y · esta obra: … · modelo").

## O que ela lê

${N} recebe um **dossiê** montado pelo sistema a partir dos três níveis do planejamento da obra aberta: o longo prazo (plano macro, Linha de Balanço, medições, vagões e restrições vencidas), o médio prazo (plano do mês vivo, linha de base, tarefas vencidas e abaixo do alvo, vínculos, equipes sobrecarregadas) e o curto prazo (planilha semanal: PPC da semana e das últimas oito, tendência, Pareto de causas, linhas que repetem falha, empreiteiros com PPC baixo, linhas sem apontamento e os "Não" da semana anterior que não foram levados adiante). Ela só lê os níveis que **você** pode abrir: se o médio prazo não está liberado para você, ele não entra no dossiê nem nas respostas, e o painel diz "Níveis lidos: curto", por exemplo.

Ela **não lê** a lista de pendências da Terminalidade, os modelos IFC, as dívidas nem as fotos: sobre essas telas ela só explica como usar. E ela vê apenas a obra que está aberta; para falar de outra obra, abra a outra obra e abra o painel de novo.

## O que ela não faz

- **Nunca grava nada sozinha.** Toda edição que ela sugere vira uma proposta com o botão "Aplicar"; só o seu clique grava, pelo mesmo caminho da planilha.
- Não edita o plano do mês nem o plano de longo prazo (só a planilha da semana).
- Não cadastra obra, usuário, equipe, não muda permissão nem libera módulo.
- Não clica por você: quando a dúvida é de uso, ela explica o passo a passo e você faz na tela.
- Não inventa número: se o dado não está no dossiê ou nas listas que ela consulta, ela diz que não tem.`,
  },
  {
    id: 'agente-leitura-e-radar',
    title: 'Leitura da obra e Radar: como pedir, quando é refeita, o que significam os achados',
    summary:
      'Botão "Nova leitura", aviso "Os dados mudaram desde esta leitura", leitura guardada por obra, e os chips de gravidade do Radar.',
    keywords: [
      'nova leitura',
      'leitura',
      'os dados mudaram',
      'radar',
      'achados',
      'alerta',
      'atenção',
      'positivo',
      'cruzado',
      'níveis lidos',
      'leitura antiga',
      'quem fez a leitura',
      'demora',
    ],
    screen: 'agente',
    body: `## A Leitura

A leitura é guardada **por obra**, uma só, para todas as pessoas: quem abre o painel vê a última leitura feita, com a linha "Leitura de {data} por {pessoa} · {modelo} · {custo}". Se ainda ninguém pediu, aparece "Ainda não há leitura desta obra."

Para pedir uma nova, clique em **"Nova leitura"** (leva de 10 a 30 segundos; aparece "Lendo a obra…"). O botão fica desabilitado em três casos, e o motivo aparece ao passar o mouse:

- **Os dados não mudaram desde a última leitura.** O sistema compara os dados de agora com os da leitura guardada; se são os mesmos, não há o que reler e nada é cobrado. Quando os dados mudaram (alguém apontou a semana, lançou medição, editou o plano), aparece o chip âmbar **"Os dados mudaram desde esta leitura"** e o botão volta a funcionar.
- **A IA não está configurada no servidor.** Falta a chave da inteligência artificial; o Radar continua funcionando. É assunto do administrador.
- **Seu acesso ao agente foi cortado.** O administrador cortou o seu uso da IA em Configurações → Agente de IA. O Radar continua disponível.

A leitura segue sempre a mesma estrutura: "Leitura da obra" (3 a 5 pontos), "Correlações entre os níveis", "O que fazer esta semana" (ações com o responsável provável) e "Dados que faltam". Ela interpreta o dossiê, não repete tudo; as correlações entre níveis são pareadas pelo nome das atividades e por isso são indícios, não certeza.

## O Radar

O Radar lista os achados automáticos, em ordem de gravidade: primeiro os **"Alerta"**, depois **"Atenção"**, **"Positivo"** e **"Info"**; dentro de cada grupo, os **"Cruzado"** (que comparam níveis) vêm primeiro. Exemplos do que ele acha:

- **Longo prazo:** avanço físico atrasado ou adiantado contra o previsto para hoje, medição antiga (mais de 30 dias) ou inexistente, serviços atrasados, término que deslizou contra a linha de base, vagões vencidos sem terminalidade, restrições vencidas.
- **Médio prazo:** sem plano do mês ou plano de mês anterior, atraso contra a linha de base, sem linha de base, tarefas vencidas, tarefas abaixo do alvo temporal (20 pontos ou mais), vínculos desrespeitados, prazo final estourado, equipes sobrecarregadas nas próximas semanas.
- **Curto prazo:** semana vazia, PPC médio baixo (abaixo de 60%) ou alto (85% ou mais), PPC caindo, linhas que repetem a falha, linhas de semanas fechadas sem apontamento, "Não" da semana anterior que não foram levados para a semana atual.
- **Cruzados:** tarefa do plano do mês prevista para esta semana sem linha na planilha; linha da semana que não está no plano do mês; equipe sobrecarregada que já falhou por falta de mão de obra; a mesma frente atrasada nos três níveis; PPC baixo já refletido no macro; restrições vencidas junto de causas de insumo; e o positivo "ritmo", quando PPC alto, plano no prazo e macro em dia aparecem juntos.

Cada achado tem "Ver itens" com a lista (até 8 itens). Se não houver nada, aparece "Nenhum achado nos níveis lidos." A linha "Níveis lidos" diz quais níveis entraram: um nível que não está liberado para você fica de fora.

O Radar e a leitura são refeitos por trás sempre que você aplica uma proposta ou reabre o painel.`,
  },
  {
    id: 'agente-conversa-e-propostas',
    title: 'Conversa: perguntar, pedir edições e aplicar propostas',
    summary:
      'Como perguntar, o que ela consegue listar e propor (levar, criar, apontar), os botões Aplicar e Descartar, Desfazer e limites.',
    keywords: [
      'perguntar',
      'conversa',
      'chat',
      'proposta',
      'aplicar',
      'descartar',
      'levar para a semana',
      'criar linhas',
      'apontar pela ia',
      'não gravou',
      'desfazer proposta',
      'tentar de novo',
      'só quem edita',
      'histórico da conversa',
      'enter',
    ],
    screen: 'agente',
    body: `## Como perguntar

Escreva no campo "Pergunte para ${N}…" e tecle **Enter** (Shift+Enter quebra linha) ou clique em **"Perguntar"**. Antes da primeira pergunta aparecem três sugestões; clicar numa delas já envia. A pergunta pode ter até 1.500 caracteres. Enquanto ela responde aparece "${N} está lendo…".

Ela responde com base no dossiê e, quando precisa de detalhe, consulta listas da obra: as linhas da planilha de uma semana (atual, anterior, próxima, pelo número da semana ou por uma data), as tarefas do plano do mês (previstas para esta semana, atrasadas, em andamento, próximas) e os serviços do plano de longo prazo. Exemplos do que perguntar:

- "O que do plano do mês não está na semana atual?"
- "Quais linhas da semana passada ficaram sem apontamento?"
- "Qual empreiteiro tem o PPC mais baixo nas últimas semanas e por quê?"
- "Resuma os riscos da obra em 5 pontos."
- "Como eu aponto uma linha como não cumprida?" (dúvida de uso: ela responde pelo manual do sistema)

## Pedir uma edição

Ela edita só a **planilha da semana (curto prazo)**, e sempre por proposta. Três tipos:

- **Levar** — "Leve para a semana atual os Não da semana passada": cria na semana de destino uma linha igual (mesma atividade, empresa, equipe, período deslocado), sem apontamento; a linha de origem não muda. Se já existe linha igual no destino, ela fica de fora, e a proposta diz por quê.
- **Criar** — "Crie na semana atual as tarefas do plano do mês previstas para esta semana": linhas novas a partir das tarefas do plano do mês (nome, equipe, empresa e período vêm da tarefa, recortados para dentro da semana) ou escritas por você (nome, empresa, equipe, início e fim).
- **Apontar** — "Aponte como Sim as linhas X e Y" ou "Aponte Não por falta de mão de obra na linha Z": Sim, ou Não com uma causa da lista fechada da planilha e justificativa opcional. Se a causa que você disser couber em mais de uma da lista ("falta", "produtividade"), ela pergunta qual.

Cada proposta aparece como um **cartão**: chip "Levar", "Criar" ou "Apontar", título ("Levar 3 linhas para a semana 44"), uma linha por mudança (as 10 primeiras abertas; "Ver as outras N" mostra o resto) e, quando houver, "Ficaram de fora: …" com o motivo de cada item não incluído. Até 60 linhas por proposta.

## Aplicar e Descartar

**Nada é gravado até você clicar em "Aplicar".** Aplicar roda as mudanças pelo mesmo caminho da planilha, com as mesmas permissões: aparece "Aplicando 2 de 5…", depois o chip "Aplicada" e um aviso de sucesso ("3 linhas levadas para a semana de 02/11/2026"). Se uma mudança falhar, a proposta mostra o erro e quantas já entraram, e o botão vira **"Tentar de novo"**, que continua de onde parou sem repetir o que já gravou. **"Descartar"** marca o cartão como "Descartada" e não grava nada.

Uma proposta aplicada é uma gravação normal da planilha: para voltar, use o **"Desfazer"** da aba Cronograma de curto prazo (ou Ctrl+Z nela), ou corrija as células na própria planilha.

Quem tem perfil de **consulta** vê a conversa e as listas, mas não recebe propostas de edição e, se alguma aparecer, vê "Só quem edita a obra pode aplicar." Levar e criar linhas numa **semana encerrada para edição** só é permitido ao admin, como na planilha; apontar é livre para quem edita a obra.

## O histórico

A conversa vive no seu navegador, presa à obra aberta: fechar e reabrir o painel mantém a conversa; trocar de obra ou recarregar a página começa do zero. Ela leva em conta as últimas 8 mensagens da conversa ao responder, então uma pergunta pode se referir à anterior ("e na semana passada?").`,
  },
  {
    id: 'agente-duvidas-sobre-o-sistema',
    title: `Tirar dúvidas sobre o sistema com ${N}`,
    summary:
      'Como pedir ajuda de uso ("como faço…", "onde fica…", "por que não consigo…"), o que ela sabe do sistema e o que fazer se não souber.',
    keywords: [
      'ajuda',
      'dúvida',
      'como faço',
      'onde fica',
      'não consigo',
      'manual',
      'tutorial',
      'passo a passo',
      'como usar',
      'explicar',
      'o que significa',
      'suporte',
    ],
    screen: 'agente',
    body: `## Dúvidas de uso

Além dos dados da obra, ${N} conhece o **manual do Obra 360**: para que serve cada aba e tela, o que cada botão, campo e coluna faz, quem pode fazer o quê (consulta, planejador, gestor, admin), os avisos e mensagens de erro mais comuns e as perguntas frequentes de cada módulo. Pergunte como você perguntaria a um colega:

- "Como eu aponto uma linha como Não na planilha?"
- "Onde defino a semana 1 da obra?"
- "Por que não consigo editar a semana passada?"
- "Como gero o PDF da terminalidade só de um pavimento?"
- "O que é linha de base no cronograma do mês?"
- "Quem pode liberar um vagão excepcionalmente?"
- "Como funciona o sistema? O que você sabe fazer?"

Ela sabe em que tela você está e responde em passos curtos, citando os nomes dos botões e campos como aparecem na tela. Ela explica; quem clica é você.

## Quando ela não souber

Se o manual não cobre a dúvida, ela diz isso em vez de inventar, e sugere o botão **"?" (Como usar)** no cabeçalho da tela, que destaca cada botão com a explicação ao lado, e o **"Como funciona"** do cabeçalho da aba, com a explicação longa. Para problemas de acesso (não vejo a obra, não vejo a aba, não consigo entrar), o caminho é o administrador do sistema, que libera obras e módulos em Configurações.

## Dica

Dúvidas sobre o sistema custam pouco (uma consulta ao manual), mas cada pergunta ainda conta no uso de IA do mês mostrado no rodapé do painel. Para uma dúvida rápida de um botão da tela em que você está, o "?" é imediato e não custa nada.`,
  },
  {
    id: 'agente-limites-e-custo',
    title: 'Avisos do painel, limite mensal de IA e a tela do admin (Configurações → Agente de IA)',
    summary:
      'O que fazer em "IA não configurada", "acesso cortado", "limite mensal atingido"; como o custo é contado; limites por pessoa e por obra.',
    keywords: [
      'limite mensal',
      'custo',
      'quanto custa',
      'teto',
      'orçamento',
      'ia não configurada',
      'acesso cortado',
      'migração',
      'uso de ia no mês',
      'agente de ia configurações',
      'cortar acesso',
      'limite por pessoa',
      'consumo',
      'dólares',
      'erro 429',
    ],
    screen: 'agente',
    body: `## Avisos que podem aparecer no alto do painel

- **"A IA não está configurada no servidor."** Falta a chave da inteligência artificial no servidor. O Radar continua funcionando; leitura e conversa não. Assunto do administrador do sistema.
- **"Aplique a migração 0035_agent.sql para guardar leituras e controlar o uso."** O banco ainda não tem as tabelas do agente; até lá nada é guardado nem contado. Assunto do administrador.
- **"Seu acesso ao agente foi cortado pelo administrador."** Um admin cortou o seu uso em Configurações → Agente de IA. O Radar continua disponível; fale com o administrador para liberar.
- **"O limite mensal de IA foi atingido. O radar continua funcionando."** (ou a mensagem específica do limite estourado). Veja abaixo.
- Durante uma pergunta: **"Limite de uso da IA atingido. Tente de novo em instantes."** é um limite momentâneo do provedor; **"Sem conexão com a IA"** ou **"A IA respondeu com erro"** pedem tentar de novo.

## Como o custo é contado

Cada chamada à inteligência artificial (uma leitura ou uma pergunta) tem o custo calculado pelos tokens que o provedor devolve e gravado por obra, pessoa e mês. Uma leitura custa alguns centavos de dólar (medido: cerca de US$ 0,02 numa obra pequena, estimado até US$ 0,05 numa obra com os três níveis cheios) e uma pergunta com edição parecido (cerca de US$ 0,03 a 0,06). Uma leitura só é cobrada quando os dados mudaram; pedir de novo com os mesmos dados não chama a IA.

Antes de cada chamada o servidor confere, nesta ordem:

1. **Corte do admin** sobre a pessoa.
2. **Teto do mês**, em dólares, para todas as obras juntas (padrão US$ 20).
3. **Parte da obra**: 1,5 × (teto ÷ obras ativas). Com o teto padrão e seis obras ativas, US$ 5,00 por obra; a parte existe para uma obra não consumir o crédito das outras.
4. **Limite da pessoa**, só quando o admin definiu um.

Quando um deles estoura, a pergunta ou a leitura é recusada com a mensagem correspondente, e o Radar continua. O teto do mês zera quando o mês vira. O rodapé do painel mostra onde você está: "Uso de IA no mês: gasto de teto · esta obra: gasto de parte · você: gasto de limite (quando há) · modelo".

## A tela do admin: Configurações → Agente de IA

Só para administradores (link "Agente de IA" na barra lateral, abaixo de Configurações; endereço /configuracoes/agente). Nela:

- **Seletor de mês** (setas; não passa do mês atual).
- **Resumo do mês**: gasto contra o teto (a barra fica amarela a partir de 70% e vermelha a partir de 90%), chamadas (leituras e perguntas) e o modelo em uso.
- **Pessoas**, da que mais gastou para a que menos: nome, papel, gasto, chamadas, última chamada, o campo **"Limite mensal"** em dólares (salva ao sair do campo ou com Enter; vazio é sem limite) e o botão de **cortar/liberar acesso** (chip "Cortado"). Liberar reabre na hora.
- **Obras**, da que mais gastou para a que menos: código, nome, gasto, chamadas e a parte da obra no teto. Obra inativa aparece em cinza: conta o que gastou, mas não entra na divisão do teto.
- "Como funciona" explica as regras na própria tela.

O teto geral do mês e o modelo não são alterados nessa tela: são configuração do servidor, feita pela equipe que mantém o sistema.`,
  },
];

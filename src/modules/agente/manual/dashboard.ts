import type { ManualSection } from './types';

/** Manual da aba 0, Dashboard da obra (04/11/2026): os cinco níveis numa página, até a semana analisada,
 * com filtros e PDF. Escrito a partir do modelo aprovado pelo usuário e do contrato dos quadros; descreve
 * só o que a aba entrega. A aba não edita nada, então o manual é de leitura: o que cada número é, de onde
 * vem e por que pode diferir do que a aba de origem mostra hoje. */
export const sections: ManualSection[] = [
  {
    id: 'dashboard-visao-geral',
    title: 'Dashboard da obra: o que é, quem vê, o resumo e os cartões',
    summary:
      'A aba 0 junta curto, longo, médio prazo, vagões e terminalidade numa página só lida, com a frase de resumo e até seis cartões.',
    keywords: [
      'dashboard',
      'dashboard da obra',
      'aba 0',
      'visão geral da obra',
      'painel da obra',
      'resumo da obra',
      'frase de resumo',
      'cartões',
      'cartão',
      'indicadores da obra',
      'cinco níveis numa página',
      'abrir aba',
      'nada se edita',
      'quem vê o dashboard',
    ],
    screen: 'dashboard',
    body: `## O que é a aba 0, Dashboard da obra

É a primeira aba de toda obra (o chip 0 no topo da lista de abas) e a tela em que a obra abre quando você a escolhe na lista de obras. Ela reúne numa página só o que as outras cinco abas respondem: o curto prazo (aba 4), o longo prazo (aba 1), os vagões (aba 2), o médio prazo (aba 3) e a terminalidade (aba 5). Nada aqui se edita: a aba lê o que as outras já guardam e, em cada quadro, o link "Abrir aba N →" leva à aba de origem, onde o dado se consulta no detalhe e se altera.

Tudo é contado até a **semana analisada** (seção "Filtros: semana analisada, empreiteiro, pavimento e quadros"): por padrão a semana atual, mas pode ser uma semana antiga, e então a página mostra a obra como estava naquele sábado.

## Quem vê, e o que aparece para cada pessoa

- A aba é aberta a todo papel com a obra liberada, inclusive "Consulta". Como nada se edita, não há diferença entre os papéis dentro dela.
- Só entram os **módulos que a pessoa pode abrir**: curto prazo e terminalidade (abertos a todos) mais os que o admin liberou para ela em Configurações → Usuários; admin e desenvolvedor veem todos. Um módulo que a pessoa não pode abrir não aparece nem é citado.
- Dos módulos que a pessoa pode abrir, só entram os que **têm dado nesta obra**. Módulo sem dado não ocupa espaço: a linha abaixo dos filtros diz "Módulos sem dados nesta obra: …".
- Duas pessoas com permissões diferentes veem, portanto, dashboards diferentes da mesma obra. O PDF segue a mesma regra de quem o gera.

## A página, de cima para baixo

1. O cabeçalho da aba, com o botão "Como funciona" (a explicação longa) e o botão "Gerar PDF".
2. A barra de filtros: "Semana analisada", "Empreiteiro", "Pavimento" e "Quadros".
3. A linha de escopo: "Dados até sáb dd/mm · semana atual N · Módulos sem dados nesta obra: …".
4. A frase de resumo e os cartões.
5. Um quadro por módulo presente, cada um com o link "Abrir aba N →".
6. A nota final: o ranking das obras e o avanço físico consideram a obra inteira, sem recorte; nada se edita.

No celular a página é a mesma, com os quadros em uma coluna e a aba 0 na faixa de abas sob o cabeçalho. O PDF sai pelo computador.

## A frase de resumo

Uma frase no topo diz o estado da obra na semana analisada, com os números arredondados. Ela é escrita a partir dos mesmos valores dos cartões, já arredondados, para nunca contradizer um cartão: se o cartão mostra 72%, a frase diz 72%, e não "cerca de 70%".

## Os cartões

Até seis cartões, um por módulo presente na página; os módulos ausentes não deixam cartão vazio. Cada cartão diz, no rótulo, de que aba o número vem:

- **PPC da semana** (aba 4, curto prazo): o cartão em destaque quando o curto prazo está presente. Compromissos cumpridos sobre assumidos na semana analisada; com linha sem Status, o cartão marca "em aberto".
- **Avanço físico** (aba 1, longo prazo): o percentual medido até a data, com o desvio em pontos percentuais contra o planejado na mesma data.
- **Takt vencido** (aba 2, vagões): vagões cujo período acabou até a data sem o vagão ser terminal.
- **Tarefas atrasadas** (aba 3, médio prazo): tarefas do plano do mês com término previsto antes da data e menos de 100%.
- **Pendências abertas** (aba 5, terminalidade): pendências observadas até a data e não resolvidas até ela.
- **Restrições vencidas** (abas 1 e 2): restrições abertas cujo limite de resolução passou antes da data.

O estado de cada cartão aparece **em cor e em texto** ao mesmo tempo (uma etiqueta como "abaixo da meta", "no prazo", "atenção"), para ninguém depender só da cor, inclusive no PDF em preto e branco. O número de cada cartão é o mesmo que aparece no quadro do módulo; cartão e quadro nunca divergem porque saem do mesmo cálculo.`,
  },
  {
    id: 'dashboard-filtros-semana-analisada',
    title: 'Filtros: semana analisada, empreiteiro, pavimento e quadros',
    summary:
      'A semana analisada é a data de referência de tudo; empreiteiro e pavimento recortam só alguns módulos; quadros escolhe o que entra.',
    keywords: [
      'semana analisada',
      'filtros do dashboard',
      'filtro',
      'data de referência',
      'até o sábado',
      'semana antiga',
      'semana atual',
      'empreiteiro',
      'pavimento',
      'quadros',
      'recorte',
      'seletor múltiplo',
      'o que o filtro recorta',
      'módulos sem dados',
      'linha de escopo',
    ],
    screen: 'dashboard',
    body: `## "Semana analisada": a data de referência de tudo

O seletor "Semana analisada" escolhe a semana que a página inteira descreve. Ele abre na semana atual, e a lista vai da semana 1 da obra até a atual, numerada como na planilha do curto prazo.

A regra que vale para todos os quadros: **cada um conta só até o sábado da semana analisada, e nada depois**. É a mesma regra do painel da primeira página do PDF do fechamento, e existe para o PDF de uma semana antiga sair igual quando for gerado de novo. Em cada módulo isso significa:

- curto prazo: só as semanas até a analisada; a série, a média, o PPC geral e o ranking ignoram semanas posteriores;
- longo prazo: a última medição registrada até o sábado; uma medição posterior não entra, e o planejado é calculado na data;
- vagões: o status, o takt vencido e as restrições como estavam naquela data;
- médio prazo: o plano vivo do mês da semana analisada (sem ele, o mais recente), com as datas previstas comparadas ao sábado;
- terminalidade: pendência observada até a data entra; **pendência resolvida depois da data conta como aberta**, porque na semana analisada ela ainda estava aberta.

A linha abaixo dos filtros confirma a data: "Dados até sáb dd/mm · semana atual N".

Para ver como a obra estava numa reunião passada, escolha aquela semana: a página e o PDF mostram os números daquele sábado, não os de hoje.

## "Empreiteiro": seletor múltiplo

Marque um ou mais empreiteiros; sem nenhum marcado, não há recorte. A comparação é pelo nome, sem acento nem maiúscula, porque o nome é digitado à mão em alguns módulos. O recorte vale em:

- **curto prazo**: a coluna "Empresa" da planilha da semana;
- **terminalidade**: o "Responsável terceiro" da pendência;
- **médio prazo**: a empresa da equipe (recurso) da tarefa;
- **vagões**: a empresa das equipes das atividades do vagão.

Linha, pendência ou tarefa sem empresa fica fora quando há recorte. O que **não** segue o recorte, de propósito: o ranking das obras (a comparação com as outras obras só vale com a obra inteira) e o avanço físico do longo prazo (a medição é por serviço, não por empresa). Os quadros avisam quando mostram a obra inteira apesar do filtro.

## "Pavimento": seletor múltiplo

Marque um ou mais pavimentos; sem nenhum marcado, não há recorte. Vale em:

- **terminalidade**: o "Local" (pavimento) da pendência;
- **longo prazo**: os pavimentos do plano, pareados com os da terminalidade pelo nome, sem acento. O planejado na data segue o recorte; o **avanço medido não se divide por pavimento**, porque a medição do longo prazo é por serviço, e o quadro diz isso.

Curto prazo, vagões e médio prazo não têm pavimento na linha e não são recortados por este filtro.

## "Quadros": o que entra na tela e no PDF

Escolhe quais módulos aparecem. Desmarcar um quadro só o esconde (e tira o cartão dele do resumo); os quadros que ficam continuam com os mesmos números. Serve para a reunião que só quer ver dois níveis, ou para um PDF mais curto. Só aparecem na lista os módulos que você pode abrir.

## Os filtros no PDF

Os quatro filtros vão para o PDF exatamente como estão na tela, pelo endereço da página de impressão. O rodapé de cada folha repete a data de referência e os filtros ativos, para quem lê o PDF saber o recorte.

## "Módulos sem dados nesta obra"

A linha de escopo lista os módulos que você pode abrir mas que não têm nada registrado nesta obra (por exemplo, uma obra que só usa o curto prazo e a terminalidade). Esses módulos não ocupam espaço na página nem no PDF. Para um deles aparecer, basta a aba de origem passar a ter dado: um plano de longo prazo, um vagão, um plano do mês.`,
  },
  {
    id: 'dashboard-quadro-curto-prazo',
    title: 'Quadro do curto prazo: PPC da semana, ranking, causas e histórico desde a semana 1',
    summary:
      'Série de 12 semanas, média, PPC geral e ranking das obras, causas e Pareto, mais o histórico mensal e anual desde a semana 1.',
    keywords: [
      'ppc da semana',
      'série do ppc',
      'média das 12 semanas',
      'ppc geral',
      'ranking das obras',
      'posição no ranking',
      'causas da semana',
      'pareto das causas',
      'histórico desde a semana 1',
      'ppc por mês',
      'ppc por ano',
      'melhor mês',
      'pior mês',
      'histórico importado',
      'planilha antiga',
    ],
    screen: 'dashboard',
    body: `## O que o quadro do curto prazo mostra

O quadro lê as linhas da planilha da semana (aba 4) até a semana analisada e mais nada. Os números são **os mesmos do painel da primeira página do PDF do fechamento**: quem comparar os dois na mesma semana encontra os mesmos valores.

- **PPC da semana**: compromissos cumpridos (Sim) sobre assumidos na semana analisada. Linha sem Status conta como não cumprida; se houver alguma, o quadro marca a semana "em aberto".
- **Série das 12 semanas**: as 12 semanas com linha até a analisada, uma barra cada. Barra hachurada é semana em aberto (com linha sem Status), fora da média; a faixa âmbar é a semana analisada.
- **Média das semanas apuradas**: a média simples dos PPCs das semanas apuradas da série (semana apurada = todas as linhas com Status). Abaixo de 70% o cartão fica âmbar, como na tela Fechamento.
- **PPC geral da obra**: cumpridos ÷ assumidos de todas as semanas apuradas desde o início da obra, somando as linhas e não fazendo a média dos percentuais.
- **Ranking das obras**: todas as obras ativas pelo nome, ordenadas pelo PPC geral até a mesma semana, com a posição desta obra ("2º de 6") e a média das obras. Obra com menos de 4 semanas apuradas fica no fim, "em início", sem posição. De outra obra só aparecem números agregados, nunca linhas, empreiteiros ou justificativas. O ranking **considera sempre a obra inteira**, mesmo com empreiteiro filtrado.
- **Causas na semana**: as causas das linhas com Não na semana analisada, com a posição de cada uma no Pareto da obra.
- **Pareto da obra**: as causas de todas as falhas até a semana analisada, da mais frequente para a menos; as que somam 80% ficam em vermelho e as demais se agrupam em "Outras N causas".

Com o filtro "Empreiteiro", PPC da semana, série, média, PPC geral, causas e Pareto passam a contar só as linhas daquelas empresas; o ranking continua da obra inteira, e o quadro diz isso.

## "Histórico desde a semana 1"

Um segundo bloco do mesmo quadro mostra a vida inteira da obra no curto prazo:

- **PPC de cada mês** desde a primeira semana da obra até o mês da semana analisada: cumpridos ÷ assumidos das semanas apuradas daquele mês (a semana pertence ao mês da sua segunda-feira). Mês sem semana apurada fica sem valor, não entra como zero.
- **PPC geral por ano**: o mesmo cálculo somando as semanas apuradas de cada ano.
- **Melhor e pior mês**: os meses de maior e menor PPC entre os que têm valor, com o mês e o percentual.

A semana 1 é a definida em Configurações da obra; sem ela, a primeira semana com linha.

## De onde vem o passado

O histórico anterior ao sistema veio das planilhas que a equipe usava e **entra sozinho** no quadro, sem nenhum passo a mais:

- a Blentt teve a planilha importada em 08/10/2026, no go-live do curto prazo;
- Atmos, Tauá, Brizz, Essenza e Mozine tiveram o histórico importado em 28/10/2026, da planilha "Dados compilados".

Linhas importadas com Não e sem causa receberam a causa "Causa não informada", que por isso pode aparecer alta no Pareto de obras com muito histórico: é a planilha antiga, não uma causa real. A semana 1 dessas obras foi gravada para o número da semana no sistema bater com o da planilha.

O que foi preenchido na planilha **depois** da carga não está no sistema: o dashboard mostra o que o sistema tem (seção "Dúvidas comuns do dashboard"). Se uma semana recente aparece hachurada ou sem valor, é porque as linhas dela estão sem Status no sistema, mesmo que a planilha já tenha o apontamento.`,
  },
  {
    id: 'dashboard-quadros-longo-vagoes-medio-terminalidade',
    title: 'Quadros do longo prazo, dos vagões, do médio prazo e da terminalidade',
    summary:
      'Avanço físico e curva S; vagões por status, takt vencido e restrições; tarefas atrasadas, caminho crítico e marcos; pendências e evolução.',
    keywords: [
      'avanço físico',
      'curva s',
      'desvio em p.p.',
      'serviços com maior desvio',
      'sem medição',
      'vagões por status',
      'takt vencido',
      'dívidas abertas',
      'restrições por coluna',
      'restrições vencidas',
      'tarefas atrasadas',
      'caminho crítico',
      'equipes superalocadas',
      'marcos dos próximos 30 dias',
      'pendências abertas',
      'tempo médio em aberto',
      'evolução das pendências',
      'abertas por responsável',
    ],
    screen: 'dashboard',
    body: `## Longo prazo (aba 1)

Lê o plano de longo prazo da obra (o Planejador) e as medições registradas nele.

- **Avanço físico medido**: a última medição registrada até o sábado da semana analisada. Medição posterior não entra.
- **Planejado na data**: quanto a obra deveria ter avançado até o sábado, pelos dias-pavimento do plano, supondo avanço linear em cada pavimento de cada serviço. Usa a **linha de base mais recente** do plano; sem linha de base salva, usa o plano vivo e o quadro avisa, porque comparar com um plano já reprogramado esconde o atraso.
- **Desvio**: medido menos planejado, em pontos percentuais (p.p.); negativo é atraso.
- **Curva S**: o planejado como linha contínua ao longo do tempo e cada medição como um ponto, até a data.
- **Os 5 serviços com maior desvio**: os serviços em que o medido está mais abaixo do planejado na data.
- **Prazo planejado**: o término do plano contra o da linha de base, em dias.

Sem nenhuma medição registrada, o quadro mostra só o planejado na data e o aviso de que não há medição. O filtro "Pavimento" recorta o planejado; o avanço medido não se divide por pavimento (a medição é por serviço) e o filtro "Empreiteiro" não se aplica a este quadro.

## Vagões (aba 2)

Lê os vagões da obra como estavam no sábado da semana analisada.

- **Vagões por status**: quantos estão "Não iniciado", "Em produção", "Com restrição" e "Terminal".
- **Takt vencido**: vagões cujo período acabou até a data sem o vagão ser terminal (o mesmo "Atrasado" da coluna Prazo da aba 2).
- **Dívidas abertas**: as dívidas de terminalidade ainda por resolver na data.
- **Progresso dos vagões em produção**: os 3 de maior progresso, com o percentual de cada um.
- **Restrições por coluna**: quantas restrições em "Identificada", "Em tratativa" e "Resolvida", com as **vencidas** (limite de resolução antes da data e ainda não resolvidas) em destaque.

O filtro "Empreiteiro" vale pela empresa das equipes das atividades: só entram os vagões que têm alguma atividade de uma equipe daquelas empresas.

## Médio prazo (aba 3)

Lê o **plano vivo do mês** da semana analisada; se aquele mês não tem plano, o mais recente, e o quadro diz qual.

- **Tarefas**: quantas concluídas (100%), em andamento e não iniciadas.
- **Atrasadas na data**: término previsto antes do sábado da semana analisada e menos de 100%.
- **Variação contra a linha de base**: a diferença de término entre o plano vivo e a **linha de base congelada mais recente**, em dias úteis; sem linha de base, a variação não aparece.
- **Caminho crítico**: as tarefas sem folga, as mesmas que a aba 3 pinta de vermelho.
- **Equipes superalocadas na semana**: equipes cuja carga na semana analisada passa da capacidade cadastrada.
- **Marcos dos próximos 30 dias**: as tarefas de 0 dias (marcos) com data nos 30 dias seguintes ao sábado da semana analisada.

O filtro "Empreiteiro" vale pela empresa da equipe (recurso) da tarefa; tarefa sem equipe fica fora quando há recorte.

## Terminalidade (aba 5)

Lê a lista de pendências da obra até o sábado da semana analisada: pendência observada depois da data não existe ainda, e pendência resolvida depois da data conta como aberta.

- **Abertas, resolvidas e %**: abertas + resolvidas = total até a data; o % é a parte do total já corrigida na data.
- **Tempo médio em aberto**: para as pendências abertas na data, a média de dias entre a observação e o sábado; para as resolvidas, entre a observação e a correção.
- **Abertas por responsável terceiro** e **por pavimento**: as 6 maiores contagens de pendências abertas, com barra proporcional.
- **Por tipo**: uma rosca com as pendências abertas por tipo, até seis fatias e "Outros" para o resto, como na aba 5.
- **Evolução das 12 semanas**: por semana, quantas pendências foram abertas e quantas resolvidas, e o saldo de abertas ao fim de cada semana, até a analisada.

Os filtros "Empreiteiro" (Responsável terceiro) e "Pavimento" (Local) recortam tudo neste quadro.`,
  },
  {
    id: 'dashboard-pdf',
    title: 'Gerar o PDF do dashboard: aba nova, Salvar como PDF e as folhas',
    summary:
      'O botão Gerar PDF abre a impressão numa aba nova com os filtros; A4 paisagem, folha 1 com resumo e curto prazo, uma folha por módulo.',
    keywords: [
      'pdf do dashboard',
      'gerar pdf',
      'salvar como pdf',
      'imprimir o dashboard',
      'folhas do pdf',
      'a4 paisagem',
      'cabeçalho do pdf',
      'rodapé do pdf',
      'quem gerou',
      'folha n de m',
      'pdf de uma semana antiga',
      'pdf no celular',
      'logos atr e takt',
    ],
    screen: 'dashboard',
    body: `## Passo a passo

1. Ajuste os filtros na tela: "Semana analisada", "Empreiteiro", "Pavimento" e "Quadros". O PDF sai exatamente com eles.
2. Clique em **"Gerar PDF"**, no cabeçalho da aba. A página de impressão abre **numa aba nova** do navegador, com os filtros no endereço, como os PDFs do curto prazo e da terminalidade.
3. A página espera os dados dos quadros chegarem e chama sozinha o diálogo de impressão do navegador. Nele, escolha **"Salvar como PDF"** e confira que a orientação está em paisagem; o título da página vira o nome do arquivo.
4. Se o diálogo não abrir, use o botão de imprimir no topo da aba nova.

É preciso estar logado: a página respeita o acesso da pessoa às obras e aos módulos, então o PDF traz só os quadros que ela veria na tela. O PDF sai pelo computador; no celular a aba 0 funciona, mas a impressão não.

## O que sai

- **Papel**: A4 paisagem, cores fixas (é papel), cada seção numa folha.
- **Cabeçalho**, igual ao do PDF do fechamento: os logos da ATR e da Takt, o título "DASHBOARD DA OBRA <NOME DA OBRA>", a semana analisada e a semana atual.
- **Folha 1**: a frase de resumo, os cartões e o quadro do curto prazo (série, ranking, causas, Pareto e o histórico desde a semana 1).
- **Depois, uma folha por módulo presente**: longo prazo e vagões juntos numa folha; médio prazo; terminalidade. Módulo sem dado, sem permissão ou desmarcado em "Quadros" não gera folha.
- **Rodapé** de cada folha: a data de referência ("Dados até sáb dd/mm"), os filtros ativos, quem gerou e quando, e "Folha N de M".

Um quadro cujo dado não chegou a tempo sai como "indisponível" naquela folha, e o resto do PDF sai normalmente; gere de novo em instantes.

## PDF de uma semana antiga

Escolha a semana no filtro antes de gerar. Como tudo conta até o sábado da semana analisada, o PDF daquela semana sai com os mesmos números hoje ou daqui a meses, exceto pelo que for lançado no sistema com data retroativa (uma linha nova naquela semana, uma pendência com observação antiga). O rodapé registra a data de referência e quando o PDF foi gerado, para os dois casos ficarem distinguíveis.`,
  },
  {
    id: 'dashboard-duvidas-comuns',
    title: 'Dúvidas comuns do dashboard: módulo que não aparece, número diferente da aba, dados antigos, indisponível',
    summary:
      'Por que um módulo não aparece, por que o número difere da aba de origem, o que a planilha antiga tem que o sistema não tem, e o que é indisponível.',
    keywords: [
      'módulo não aparece',
      'por que não aparece',
      'módulos sem dados',
      'número diferente da aba',
      'não bate com a aba',
      'dados antigos da planilha',
      'dados compilados',
      'quadro indisponível',
      'indisponível',
      'não consigo editar no dashboard',
      'consulta vê o dashboard',
      'celular',
      'sem linha de base',
      'semana em aberto',
    ],
    screen: 'dashboard',
    body: `## "Por que um módulo não aparece no meu dashboard?"

Dois motivos possíveis, e a tela diz qual é:

- **Você não pode abrir o módulo.** Longo prazo, vagões e médio prazo são liberados por pessoa pelo admin (Configurações → Usuários, linha "Módulos"); curto prazo e terminalidade são abertos a todos. Módulo que você não pode abrir não aparece nem é citado. Peça a liberação ao admin.
- **O módulo não tem dado nesta obra.** A linha "Módulos sem dados nesta obra: …", abaixo dos filtros, lista esses. Uma obra que só usa o curto prazo e a terminalidade mostra só esses dois quadros. Para o módulo aparecer, basta a aba de origem passar a ter dado.

Um terceiro caso é o filtro "Quadros" com o módulo desmarcado: marque de novo.

## "Por que o número do dashboard é diferente do que a aba mostra?"

Quase sempre pela **data de referência**: o dashboard conta até o sábado da semana analisada, e a aba de origem mostra o estado de agora.

- Terminalidade: uma pendência resolvida nesta semana continua aberta no dashboard de uma semana anterior. A aba 5 mostra o total de hoje.
- Longo prazo: uma medição lançada depois do sábado não entra; a aba 1 mostra a medição mais recente.
- Curto prazo: a tela Fechamento da aba 4 conta também as semanas posteriores à analisada na série e no Pareto; o dashboard (e o painel do PDF do fechamento) não.
- Médio prazo: "atrasada" no dashboard é término previsto antes do sábado da semana analisada; a aba 3 compara com hoje.

Outros motivos: um filtro de "Empreiteiro" ou "Pavimento" ativo (o rodapé e os quadros avisam), ou a aba de origem com um filtro próprio que o dashboard não tem. O ranking das obras e o avanço físico nunca seguem o recorte.

Confira primeiro a linha "Dados até sáb dd/mm" e os filtros; depois abra a aba de origem pelo "Abrir aba N →" com a mesma semana.

## "A planilha tem mais semanas do que o dashboard"

O histórico do curto prazo que estava nas planilhas foi importado para o sistema: a Blentt em 08/10/2026 e Atmos, Tauá, Brizz, Essenza e Mozine em 28/10/2026 (planilha "Dados compilados"). O que a equipe preencheu **na planilha depois dessas datas** não está no sistema. O dashboard mostra o que está no sistema: uma semana recente pode aparecer hachurada (em aberto) ou sem linha porque o apontamento ficou só na planilha.

A saída é apontar no sistema (aba 4) ou pedir uma nova rodada de importação, que só acrescenta o que é novo. Enquanto a obra lançar nos dois lugares, os números divergem.

## "O quadro diz indisponível"

O dado daquele módulo não chegou: o servidor não respondeu a tempo ou a leitura falhou. Só aquele quadro fica assim; os outros continuam certos. Recarregue a página ou gere o PDF de novo em instantes. Se persistir num módulo só, a aba de origem dele mostra a mesma falha.

## "Por que a semana aparece hachurada ou sem média?"

Semana com alguma linha sem Status é semana **em aberto**: entra na série hachurada, mas fica fora da média e do PPC geral até ser apurada. Aponte o Sim ou o Não das linhas que faltam na aba 4.

## "O avanço físico mostra só o planejado"

A obra não tem medição registrada no plano de longo prazo até a data. Registre uma medição na aba 1 (Planejador, "Nova medição"); o dashboard passa a mostrar o medido e o desvio. Se o quadro avisa que compara com o plano vivo, é porque não há linha de base salva: salve uma na aba 1 para o planejado deixar de acompanhar as reprogramações.

## "Não consigo editar nada aqui"

Certo: o dashboard só lê. Use "Abrir aba N →" para ir à aba de origem e editar lá. Quem só tem o papel "Consulta" vê o dashboard inteiro e gera o PDF, como nas outras abas.

## No celular

A aba 0 aparece na faixa de abas sob o cabeçalho, e os quadros ficam em uma coluna. Os filtros funcionam; o PDF sai pelo computador.`,
  },
];

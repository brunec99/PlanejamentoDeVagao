import type { ManualSection } from './types';

/** Manual da aba 2 (Planejamento por vagões: lista e detalhe do vagão) e das telas de apoio Dívidas e
 * Integrações (Prevision). Escrito a partir do código dos componentes, dos tours e do README em
 * 29/10/2026; quando o tour ou a documentação divergiam do código, valeu o código. */
export const sections: ManualSection[] = [
  {
    id: 'vagoes-conceitos',
    title: 'O que é um vagão, sequência, takt e terminalidade',
    summary: 'Conceitos da aba 2: vagão como período de takt, sequência, calendário, anterior e seguinte, status e terminalidade.',
    keywords: [
      'vagão',
      'o que é vagão',
      'sequência de produção',
      'takt',
      'dias úteis',
      'dias corridos',
      'terminal',
      'terminalidade',
      'takt vencido',
      'vagão anterior',
      'predecessor',
      'sucessor',
      'status do vagão',
      'com restrição',
      'em produção',
    ],
    screen: 'vagoes',
    body: `## Planejamento por vagões (aba 2)

A aba 2, "Planejamento por vagões", organiza a produção da obra em **vagões**. Um vagão é um **período fixo de takt** dentro de uma sequência de produção: ele tem um marco inicial e um marco final e reúne as atividades previstas entre essas datas. O vagão **não tem pavimento próprio**: o local (pavimento, zona ou frente) pertence a cada atividade, e um mesmo vagão pode reunir atividades de pavimentos e zonas diferentes.

### Sequência de produção

A sequência é a fila de vagões de uma frente de produção. Ela define o **takt padrão** (de 1 a 365 dias) e o **calendário**: em "Dias corridos" todos os dias contam; em "Dias úteis (segunda a sexta)" a duração do vagão conta só de segunda a sexta, sem feriados. A duração do takt de cada vagão não é digitada: ela sai das datas do período, contadas no calendário da sequência. O selo no quadro de cada sequência mostra "Takt N dias corridos" ou "Takt N dias úteis".

O takt padrão e a data de início do primeiro vagão de uma sequência são alterados em "Configurações da obra" (grupo Apoio), nos campos "Takt em dias" e "Início do primeiro vagão", com o botão "Salvar". A data de início só é usada pela atualização do Prevision, para posicionar os vagões novos quando ainda não há vagão liberado.

### Vagão anterior e vagão seguinte

Os vagões de uma sequência formam uma cadeia: cada vagão tem no máximo um anterior (predecessor) e um seguinte (sucessor). Só o primeiro da sequência fica sem anterior, e o período de um vagão precisa começar depois do fim do anterior, sem sobreposição. O anterior é a **base da liberação** do vagão: a liberação normal depende de ele ser terminal. No detalhe do vagão, os quadros "← Vagão anterior" e "Vagão seguinte →" são atalhos para os vizinhos; o primeiro mostra "Primeiro vagão da sequência" e o último, "Último vagão planejado".

### Terminalidade

O fim do takt não conclui o vagão. Um vagão é **terminal** quando, ao mesmo tempo:

- tem ao menos uma atividade marcada como obrigatória;
- todas as atividades obrigatórias estão com 100% e status "Concluída";
- todos os critérios de terminalidade obrigatórios foram confirmados;
- não há pendência aberta marcada com "Bloqueia terminalidade";
- não há restrição aberta marcada com "Bloqueia terminalidade".

Um vagão sem atividade nunca vira terminal: a tela avisa "Nenhuma atividade neste período. O vagão ainda não pode ser terminal."

### Status do vagão

- **Não iniciado**: nada foi executado.
- **Em produção**: alguma atividade avançou ou mudou de status.
- **Com restrição**: há restrição aberta que bloqueia a execução ou a terminalidade.
- **Terminal**: todas as condições acima atendidas.

A marca **"Takt vencido"** no detalhe (e "Atrasado" na coluna "Prazo" da lista) aparece quando o período acabou e o vagão ainda não é terminal. Ela sinaliza atraso, mas não impede concluir o vagão depois. A marca "passado" indica apenas que o período já terminou.

### Quem vê esta aba

A aba 2 é um módulo ainda em desenvolvimento: aparece para administradores, para quem desenvolve o sistema e para quem recebeu o módulo "Vagões" liberado pelo administrador em Configurações. Quem não tem acesso é levado ao curto prazo da obra. O perfil Consulta vê tudo, mas não tem nenhum botão de ação; planejador, gestor e admin registram. Algumas ações exigem gestor ou admin, indicadas nas seções seguintes.`,
  },
  {
    id: 'vagoes-lista',
    title: 'Lista de vagões: criar sequência, vagão e local; indicadores e colunas',
    summary: 'Como usar a tela da aba 2: botões Criar sequência, Criar vagão e Cadastrar local, indicadores, Mostrar passado e colunas.',
    keywords: [
      'criar sequência',
      'criar vagão',
      'cadastrar local',
      'lista de vagões',
      'mostrar passado',
      'indicadores',
      'vagões planejados',
      'dívidas abertas',
      'marco inicial',
      'marco final',
      'número do vagão',
      'local',
      'pavimento',
      'abrir vagão',
      'como funciona',
    ],
    screen: 'vagoes',
    body: `## A tela da aba 2

A tela abre com a descrição da aba, um botão de ajuda "Como funciona" (explicação "Como funciona: vagões e terminalidade", que fecha com Esc ou clicando fora) e a barra de ações. Na lateral ficam as abas numeradas e, em Apoio, as telas de apoio da obra (Dívidas, Integrações, Configurações da obra e outras).

### Barra de ações (planejador, gestor e admin)

O perfil Consulta não vê a barra. Cada botão abre um formulário na lateral, com "Salvar" e "Cancelar"; o sucesso fecha a gaveta e mostra um aviso, e o erro aparece dentro da gaveta, perto dos campos.

- **"Criar sequência"**: campos "Nome da sequência", "Takt padrão (dias)" (1 a 365, padrão 5) e "Calendário" ("Dias corridos" ou "Dias úteis (segunda a sexta)"). Sem nenhuma sequência na obra, este é o botão em destaque e a tela mostra "Nenhum vagão planejado".
- **"Criar vagão"**: campos "Sequência", "Número do vagão" (inteiro positivo, sem repetir na sequência), "Vagão anterior" ("Primeiro da sequência" ou o último vagão de uma sequência), "Marco inicial", "Marco final previsto" e "Responsável" (alguém com acesso à obra). Ao salvar, o detalhe do vagão abre.
- **"Cadastrar local"**: campo "Nome do local / zona". Cadastra um pavimento, zona ou frente; é desta lista que se escolhe o local ao adicionar uma atividade. O nome não pode se repetir na obra ("Local já cadastrado.").

### Regras ao criar um vagão

- Se a sequência já tem vagões, é obrigatório escolher o último como "Vagão anterior" ("Selecione o último vagão como predecessor."). Só o último vagão de cada sequência aparece na lista de anteriores.
- O período precisa começar depois do fim do anterior, da mesma sequência ("O período deve começar após o predecessor da mesma sequência.").
- O "Marco final previsto" não pode ser antes do "Marco inicial", e o período precisa conter ao menos um dia de produção no calendário da sequência; em dias úteis, um vagão só de sábado e domingo é recusado ("O período precisa conter dias de produção.").

### Indicadores

Quatro cartões: "Vagões planejados" (total da obra), "Terminais", "Takt vencido" (período encerrado sem terminalidade) e "Dívidas abertas" (dívidas de terminalidade ainda por resolver, incluindo as vencidas).

### "Mostrar passado"

Vagões cujo período terminou antes de hoje ficam ocultos para a lista ficar curta. A caixa "Mostrar passado" só aparece quando existe vagão passado, junto do aviso "N vagões encerraram antes de hoje". Marcada, eles voltam esmaecidos, com a marca "passado".

### Quadros e colunas

Cada quadro é uma sequência, com o selo do takt padrão e do calendário. Cada linha é um vagão:

- **Vagão**: "Vagão 01", "Vagão 02" e assim por diante. Clique no nome para abrir o detalhe.
- **Período previsto**: marco inicial e "até" o marco final.
- **Atividades**: quantas atividades o vagão tem.
- **Progresso**: média do progresso das atividades, ponderada pelo peso de cada uma.
- **Status**: Não iniciado, Em produção, Com restrição ou Terminal.
- **Prazo**: "Atrasado" (período acabou sem terminalidade), "Encerrado" (terminal) ou "Dentro do prazo".
- **Liberação**: "Inicial", "Normal", "Excepcional" ou "Aguardando" quando o vagão ainda não foi liberado.

### Mensagens comuns

- "Obra não encontrada": você não tem acesso a esta obra ou o endereço está errado; use "Voltar".
- "Não foi possível carregar os dados.": confira a conexão e use "Tentar de novo".
- "Seu perfil permite apenas consulta.": o perfil Consulta não grava nada; peça ao administrador um papel de planejador ou gestor.`,
  },
  {
    id: 'vagoes-atividades',
    title: 'Atividades do vagão: adicionar, editar, progresso, status e peso',
    summary: 'Campos de uma atividade, como lançar progresso e status, regras de datas e peso, justificativa para reduzir e origem.',
    keywords: [
      'adicionar atividade',
      'editar atividade',
      'atualizar atividade',
      'progresso',
      'percentual',
      'status da atividade',
      'concluída',
      'em andamento',
      'peso',
      'obrigatória',
      'local da atividade',
      'responsável',
      'justificativa',
      'reduzir progresso',
      'origem',
    ],
    screen: 'vagoes',
    body: `## Atividades do período

A tabela "Atividades do período" lista cada atividade do vagão. Colunas: "Atividade / local" (nome, local e se é "Obrigatória" ou "Opcional"), "Responsável", "Previsão" (início e término previstos), "Progresso", "Status" ("Não iniciada", "Em andamento" ou "Concluída"), "Peso / origem" e, para quem pode agir, "Ações" com o link "Editar".

A origem diz de onde a atividade veio: **Manual** (criada nesta tela), **Prevision** (importada em Integrações), **Plano de longo prazo** (gerada pelo botão "Gerar vagões" do Planejador da aba 1) ou **Demonstração**. Atividades do plano de longo prazo são refeitas a cada "Gerar vagões", mas vagões já liberados não mudam.

### Adicionar atividade

O botão "Adicionar atividade" (planejador, gestor e admin) abre um formulário com:

- "Atividade": nome.
- "Local da atividade": um dos locais cadastrados em "Cadastrar local", na lista de vagões. Se o local não existe, cadastre-o antes.
- "Responsável": pessoa com acesso à obra.
- "Início previsto" e "Término previsto": precisam caber dentro do período do vagão; o formulário já limita o calendário a essas datas ("A previsão da atividade deve estar dentro do período do vagão.").
- "Peso no progresso": número positivo, padrão 1. É quanto a atividade conta no progresso ponderado do vagão.
- "Obrigatória para terminalidade": marcada por padrão. Só as obrigatórias precisam chegar a 100% para o vagão virar terminal; as opcionais contam no progresso, mas não travam a terminalidade.
- "Justificativa": só é obrigatória quando o vagão já é terminal (veja abaixo).

A atividade nasce com 0% e "Não iniciada".

### Editar: progresso e status

"Editar" abre "Atualizar atividade" com todos os campos acima mais "Progresso (%)" (0 a 100) e "Status". Regras:

- **Avançar o progresso, concluir ou tirar de "Não iniciada" exige o vagão liberado** ("Libere o vagão antes de registrar execução.") **e sem restrição aberta que bloqueie a execução** ("Resolva a restrição de execução antes de avançar.").
- "Concluída" exige 100% ("Atividade concluída exige progresso de 100%."); "Não iniciada" exige 0% ("Atividade não iniciada deve ter progresso zero.").
- **Reduzir o progresso ou desfazer uma conclusão pede "Justificativa"**; sem ela, a gravação é recusada. A justificativa fica no painel "Histórico" do vagão, junto do evento "Atividade atualizada".
- Em **vagão terminal**, qualquer alteração de atividade reabre a terminalidade: só gestor ou admin pode, com justificativa ("Somente gestor ou admin pode reabrir um vagão terminal.").
- O primeiro avanço registra o início real do vagão, que passa a "Em produção".

### Atividades fatiadas

Uma atividade importada do Prevision que atravessa mais de um vagão entra em fatias ("parte 2 de 3 · 35%"), cada uma em seu vagão, com peso proporcional aos dias. Ao mudar o peso de uma fatia, a diferença é descontada da fatia seguinte, para as partes continuarem somando o peso original; se o ajuste zerasse a seguinte, a tela avisa "Esse ajuste zeraria o peso da fatia seguinte. Reduza menos."

### Progresso ponderado

O cartão "Progresso ponderado" do vagão é a média do progresso das atividades, ponderada pelo peso de cada uma.

### Perguntas frequentes

- **Não consigo mudar o progresso.** Verifique se o vagão foi liberado e se não há restrição com "Bloqueia execução" aberta nele. Se o vagão já é terminal, só gestor ou admin altera, com justificativa.
- **Quero mudar o local de uma atividade.** Use "Editar" e troque "Local da atividade". Não existe local do vagão: ele é sempre da atividade.
- **Posso apagar uma atividade?** Não há exclusão de atividade nesta tela. Se ela não deve contar, desmarque "Obrigatória para terminalidade" ou ajuste o peso.`,
  },
  {
    id: 'vagoes-terminalidade-pendencias-restricoes',
    title: 'Critérios de terminalidade, pendências e restrições do vagão',
    summary: 'Como cadastrar e confirmar critérios, registrar e resolver pendências e restrições, e o que cada uma bloqueia.',
    keywords: [
      'critério de terminalidade',
      'confirmar critério',
      'reabrir critério',
      'pendência',
      'registrar pendência',
      'bloqueia terminalidade',
      'restrição',
      'bloqueia execução',
      'registrar resolução',
      'resolver pendência',
      'resolver restrição',
      'vencida',
      'prazo',
      'atividade vinculada',
      'conferência local',
    ],
    screen: 'vagoes',
    body: `## Terminalidade

O painel "Terminalidade" resume "X de Y atividades obrigatórias concluídas · X de Y critérios obrigatórios atendidos" e lista os critérios cadastrados. Embaixo, diz "Este vagão atende às condições de terminalidade." ou "Este vagão ainda não atende a todas as condições de terminalidade."

### Critério de terminalidade

Um critério é uma **condição de aceite ligada a uma atividade** deste vagão. O botão "Critério de terminalidade" (planejador, gestor e admin) pede "Atividade", "Critério de aceite" e a caixa "Obrigatório" (marcada por padrão). Critérios obrigatórios precisam ser confirmados para o vagão virar terminal; os opcionais ficam só como registro.

Cada critério aparece como "Aguardando" ou "Atendido", com a atividade e se é "Obrigatório" ou "Opcional":

- **"Confirmar critério"** registra quem confirmou e quando ("Confirmado por ... em ..."). Só funciona com o vagão liberado e sem restrição de execução aberta, como qualquer registro de execução.
- **"Reabrir critério"** desfaz a confirmação. Se o vagão é terminal, isso tira a terminalidade: só gestor ou admin pode, e a "Justificativa" é obrigatória.

Toda atividade importada do Prevision nasce com um critério obrigatório "Conferência local da atividade importada", não atendido, mesmo quando o progresso externo é 100%: a conclusão no Prevision não vale como aceite local.

### Pendências

Pendência é um **item em aberto do período**, ligado a uma atividade ou ao vagão todo. O botão "Pendência" pede "Pendência" (descrição), "Atividade vinculada" ("Todo o vagão" ou uma atividade), "Responsável", "Prazo" e a caixa "Bloqueia terminalidade" (marcada por padrão).

- Enquanto houver pendência aberta com "Bloqueia terminalidade", o vagão não vira terminal. Sem a marca, ela é só um registro.
- O painel "Pendências deste vagão" mostra responsável, prazo, "Aberta" ou "Resolvida", "Vencida" (aberta com prazo passado) e "Bloqueia terminalidade".
- É pela pendência que o vagão seguinte pode ser liberado de forma excepcional: as pendências abertas dos vagões anteriores são aceitas na liberação e viram dívidas de terminalidade.
- **"Registrar resolução"** pergunta "Como foi resolvido?" e encerra a pendência. Se ela tinha virado dívida, a dívida também se encerra, sem apagar o registro de origem. Uma pendência já resolvida não pode ser resolvida de novo ("Registro já resolvido.").

### Restrições

Restrição é um **impedimento** com responsável e prazo. O botão "Restrição" pede "Restrição" (descrição), "Atividade vinculada", "Responsável", "Prazo" e duas caixas, ambas marcadas por padrão: "Bloqueia terminalidade" e "Bloqueia execução".

- Com "Bloqueia execução" aberta, o progresso das atividades alcançadas não avança e os critérios não podem ser confirmados; o status do vagão passa a "Com restrição".
- Restrição aberta que bloqueie execução ou terminalidade em um vagão anterior impede liberar os vagões seguintes, **mesmo de forma excepcional** ("Resolva as restrições impeditivas dos antecessores."). Diferente da pendência, ela não é contornada e nunca vira dívida.
- **"Registrar resolução"** encerra a restrição e solta o que ela bloqueava. No módulo de restrições da aba 1 (longo prazo), ela passa para "Resolvida".

### Em vagão terminal

Incluir atividade, critério, pendência ou restrição num vagão já terminal **reabre a terminalidade**: só gestor ou admin pode, e o campo "Justificativa" passa a ser obrigatório. A reabertura fica registrada no "Histórico" como "Terminalidade reaberta", as liberações já feitas são preservadas e os vagões seguintes passam a mostrar um alerta (veja a seção sobre liberação).

### Mensagens comuns

- "Atividade não pertence ao vagão.": a atividade escolhida é de outro vagão.
- "Responsável deve pertencer à obra.": escolha alguém com acesso à obra.
- "Descrição é obrigatório.": preencha o texto da pendência ou da restrição.`,
  },
  {
    id: 'vagoes-liberacao',
    title: 'Liberar o vagão: inicial, normal e excepcional; reabertura de terminalidade',
    summary: 'Como liberar um vagão, quando cada tipo se aplica, o que a liberação excepcional exige e cria, e o que muda ao reabrir.',
    keywords: [
      'liberar vagão',
      'liberação',
      'liberação inicial',
      'liberação normal',
      'liberação excepcional',
      'registrar liberação',
      'justificativa',
      'prazo de regularização',
      'pendência aceita',
      'reabrir terminalidade',
      'terminalidade reaberta',
      'editar período',
      'vagão já liberado',
      'aguardando liberação',
      'histórico',
    ],
    screen: 'vagoes',
    body: `## Liberação deste vagão

Antes da liberação, o painel "Liberação deste vagão" mostra "Aguardando liberação para iniciar a execução." e nenhum progresso ou critério pode ser registrado. Cada vagão recebe **uma só** liberação ("Vagão já liberado."), e ela não altera a terminalidade do vagão anterior.

### O tipo vem sozinho

O botão "Liberar vagão (inicial)", "Liberar vagão (normal)" ou "Liberar vagão (excepcional)" já diz o tipo, calculado pela situação dos vagões anteriores:

- **Inicial**: só para o primeiro vagão da sequência, que não tem anterior.
- **Normal**: quando o vagão anterior é terminal e não há, em nenhum vagão anterior, pendência aberta, dívida aberta, restrição impeditiva ou condição não atendida.
- **Excepcional**: nos demais casos, quando o anterior não é terminal ou deixou pendências em aberto.

Antes do botão, o painel mostra a avaliação: "Restrições impeditivas: ...", "Condições ainda sem pendência registrada: ..." e a lista "Pendência a aceitar: ...".

### Liberação inicial e normal

Qualquer planejador, gestor ou admin registra. O formulário só avisa "A liberação será registrada em seu nome."; confirme em "Registrar liberação". O painel passa a mostrar o tipo e "Autorizada por ... em ...".

### Liberação excepcional (gestor ou admin)

Aceita pendências dos vagões anteriores para a produção não parar. Exige:

- Gestor ou admin ("Somente gestor ou admin pode liberar excepcionalmente.").
- "Justificativa da liberação excepcional", obrigatória.
- "Responsável" pela regularização.
- "Prazo futuro de regularização": uma data depois de hoje ("O prazo de regularização deve ser futuro.").
- **Nenhuma restrição impeditiva aberta nos vagões anteriores**: restrição que bloqueie execução ou terminalidade precisa ser resolvida antes ("Resolva as restrições impeditivas dos antecessores.").
- **Uma pendência registrada para cada condição não atendida** dos vagões anteriores: atividade obrigatória incompleta, critério obrigatório não confirmado ou vagão anterior sem atividade obrigatória. Se faltar, a mensagem lista o que está descoberto ("Registre pendências para todas as condições não atendidas: ...").
- Se não há nenhuma pendência a aceitar, o sistema recusa e manda usar a normal ("Sem pendências: utilize a liberação normal.").

Ao salvar, a autorização e as **dívidas de terminalidade** são criadas juntas: cada pendência aceita vira uma dívida com o responsável e o prazo informados. Uma pendência que já era dívida não vira dívida de novo: a nova liberação só registra o reconhecimento e preserva o prazo original.

### Editar período

"Editar período" (campos "Marco inicial", "Marco final" e "Responsável") existe só enquanto o vagão não foi liberado; depois, o botão some ("Só é possível replanejar vagões ainda não liberados."). O novo período precisa conter todas as atividades ("O novo período deve conter todas as atividades.") e não pode sobrepor o vagão anterior nem o seguinte ("O período não pode sobrepor seus vizinhos.").

### Reabertura de terminalidade

Um vagão terminal deixa de ser terminal quando alguém reabre um critério, reduz uma atividade obrigatória ou inclui atividade, critério, pendência ou restrição. Isso exige gestor ou admin e justificativa. A reabertura:

- fica no "Histórico" como "Terminalidade reaberta", com a justificativa;
- **preserva as liberações** já concedidas aos vagões seguintes;
- faz os vagões seguintes mostrarem o alerta "Terminalidade reaberta em período anterior: Vagão NN. Reavalie a liberação e registre as novas pendências." enquanto o anterior não voltar a ser terminal.

### Histórico

O painel "Histórico" lista o que foi registrado no vagão e nas suas atividades, do mais recente ao mais antigo: vagão, atividades, critérios, pendências, restrições, liberações, reaberturas, importações do Prevision e geração pelo plano de longo prazo, com autor, data e hora e, quando houver, "Justificativa:" ou "Resolução:". Se não carregar, use "Tentar de novo".`,
  },
  {
    id: 'dividas-tela',
    title: 'Dívidas de terminalidade: o que são, filtros e como resolver',
    summary: 'Tela Dívidas (Apoio): dívidas próprias e herdadas, filtros Abertas, Vencidas, Resolvidas e Todas, e Registrar resolução.',
    keywords: [
      'dívida',
      'dívidas de terminalidade',
      'dívida herdada',
      'dívida própria',
      'vencida',
      'abertas',
      'resolvidas',
      'registrar resolução',
      'resolver dívida',
      'prazo assumido',
      'liberação excepcional',
      'origem da dívida',
      'apoio',
    ],
    screen: 'dividas',
    body: `## Dívidas de terminalidade

A tela "Dívidas" fica no grupo Apoio, na lateral da obra. Ela reúne as **pendências aceitas numa liberação excepcional** e que continuam por resolver. A ideia: quando um vagão é liberado sem que o anterior seja terminal, as pendências abertas do anterior são aceitas e viram dívidas; a execução segue, mas cada pendência continua devida, com um responsável e um prazo assumidos na liberação.

A tela só aparece para quem tem o módulo "Dívidas" liberado (admin, desenvolvedores ou liberação em Configurações). O botão "Como funciona" ao lado da descrição abre a explicação "O que é uma dívida de terminalidade".

### Como uma dívida nasce e morre

- **Nasce** na liberação excepcional do vagão seguinte: cada "Pendência a aceitar" listada no painel de liberação vira uma dívida, com o "Responsável" e o "Prazo futuro de regularização" informados pelo gestor.
- **Não é duplicada**: se a mesma pendência já era dívida e um terceiro vagão é liberado excepcionalmente, a nova liberação só registra o reconhecimento; o prazo original é mantido.
- **Restrição impeditiva nunca vira dívida**: restrição aberta com "Bloqueia execução" ou "Bloqueia terminalidade" impede a liberação, mesmo excepcional, e precisa ser resolvida antes.
- **Morre** quando a pendência de origem é resolvida: a dívida passa a "Resolvida", sem apagar o registro de onde veio.

### Própria ou herdada

No detalhe do vagão, o painel "Dívidas de terminalidade" mostra as dívidas do próprio vagão e as dos vagões anteriores da mesma sequência. Cada uma diz "Dívida própria" (a pendência nasceu neste vagão) ou "Herdada de período anterior", a "Origem" (vagão da pendência), "Gerada na liberação de Vagão NN", o responsável, o prazo e a situação ("Aberta", "Aberta · Vencida" ou "Resolvida"). Sem dívidas, o painel diz "Nenhuma dívida deste vagão ou de seus antecessores."

### Filtros

Os botões de "Situação" trazem a contagem ao lado:

- **"Abertas"** (filtro inicial): dívidas por resolver, **incluindo as vencidas**.
- **"Vencidas"**: abertas cujo prazo assumido já passou.
- **"Resolvidas"**: encerradas.
- **"Todas"**: tudo.

Sem nada no filtro, a tela diz "Nenhuma dívida nesta situação."

### Cada cartão

O título é a descrição da pendência de origem; o selo diz "Aberta", "Vencida" ou "Resolvida". A linha "Origem: Vagão NN · gerada ao liberar Vagão MM" tem dois links: o primeiro abre o vagão onde a pendência surgiu; o segundo, o vagão cuja liberação excepcional a aceitou. Em seguida, o responsável e o "prazo assumido". Dívida resolvida mostra "Resolução: ..." com o texto registrado.

### Resolver a dívida

Em dívida aberta, o link **"Registrar resolução"** (planejador, gestor e admin; o perfil Consulta não vê o botão) pergunta "Como foi resolvido?" e grava. Isso resolve a pendência de origem, então ela aparece como "Resolvida" também no vagão em que foi registrada, e a dívida sai do filtro "Abertas".

### Perguntas frequentes

- **A dívida está vencida; o que acontece?** Nada trava automaticamente: "Vencida" é um sinal de atraso em relação ao prazo assumido. Resolva a pendência de origem ou acompanhe com o responsável.
- **Por que a dívida não aparece no painel de um vagão?** O painel do vagão mostra só as dívidas do próprio vagão e dos anteriores na mesma sequência. A tela Dívidas mostra todas da obra.
- **Posso alterar o prazo ou o responsável da dívida?** Não há edição de dívida: o prazo e o responsável são os assumidos na liberação. O que se faz é resolver a pendência.`,
  },
  {
    id: 'integracoes-prevision',
    title: 'Integrações: trazer o cronograma do Prevision para os vagões',
    summary: 'Tela Integrações (Apoio): vincular a obra ao projeto do Prevision, atualizar o cronograma e adicionar atividades aos vagões.',
    keywords: [
      'prevision',
      'integrações',
      'importar',
      'importação',
      'atualizar do prevision',
      'listar projetos',
      'vincular projeto',
      'responsável local',
      'disponíveis para vagão',
      'fora do período',
      'escolher por vagão',
      'adicionar fatias',
      'marcar todas',
      'cronograma salvo',
      'sincronizar',
    ],
    screen: 'importar',
    body: `## Integrações (Prevision)

A tela "Integrações" (grupo Apoio) traz o cronograma do Prevision para a obra. O cronograma fica **salvo no sistema** e o Prevision só é consultado ao clicar "Atualizar do Prevision": **não há sincronização automática nem escrita no Prevision**.

### Quem pode usar

A integração é liberada **por papel**: planejador, gestor e admin consultam o Prevision e adicionam atividades. O perfil Consulta vê o cronograma salvo, mas não tem os botões; ao consultar recebe "Seu perfil permite apenas consulta; a integração com o Prevision é para planejadores e gestores." A tela só aparece com o módulo "Integrações" liberado.

### Primeira vez

1. Em **"Responsável local"**, escolha quem responde pelas atividades importadas; sem ele, os botões de adicionar ficam desligados.
2. Enquanto a obra não tem projeto, aparece o quadro **"Vincular ao projeto do Prevision"**. Clique **"Listar projetos"**, escolha o projeto e clique **"Atualizar do Prevision"**.
3. O **vínculo** com o projeto fica gravado quando a primeira atividade entra num vagão. Depois disso, "Cronograma salvo" mostra "Projeto N" e importar de outro projeto é recusado ("A obra selecionada não corresponde ao vínculo com este projeto Prevision.").

"Cronograma salvo" mostra o projeto, quantas atividades foram salvas, quantas estão em vagões ou fora e a última atualização.

### "Atualizar do Prevision"

Busca o cronograma mais recente e pede confirmação, porque **apaga e recria os vagões futuros ainda não liberados** de cada sequência a partir do cronograma novo, em janelas do tamanho do takt:

- Vagões liberados nunca mudam; a cauda nova começa depois do último liberado (ou em "Início do primeiro vagão" das Configurações da obra).
- Atividades com progresso ou critério preenchido nos vagões refeitos são removidas; o aviso conta quantas.
- Sequências geradas pelo plano de longo prazo não são tocadas ("Os vagões desta sequência são gerados pelo plano de longo prazo; o Prevision não os altera.").
- Atividades com progresso, ou mais longas que o takt, não são encaixadas sozinhas: ficam em "Disponíveis para vagão".

Ao final, um aviso resume o resultado por sequência.

### As três abas

- **"Disponíveis para vagão (N)"**: atividades ainda fora de vagão. Cada atividade só entra num vagão cujo período a contenha inteira; a que atravessa vários é **dividida em fatias** proporcionais aos dias, somando 100% ("Vagão 03 · parte 1/2 · 60%"). O botão diz "Adicionar" ou "Adicionar N fatias".
- **"Fora do período dos vagões (N)"**: atividades que não cruzam nenhum vagão, em geral anteriores ao início do planejamento, com o desvio da linha de base em dias (vermelho atrasa, verde adianta) e o progresso.
- **"Escolher por vagão"**: escolha o "Vagão de destino"; a lista mostra só as atividades pendentes que **cabem inteiras** nele. Marque as caixas ou "Marcar todas (N)" e clique "Adicionar N atividades".

O campo "Buscar atividade ou local" filtra as três listas.

### O que a atividade importada recebe

Datas, local (criado na obra se não existir) e progresso vêm do Prevision. O responsável é o "Responsável local", o peso é 1 (ou a fração da fatia), a atividade nasce **obrigatória**, com origem "Prevision", e ganha um critério obrigatório **"Conferência local da atividade importada"**, não atendido mesmo com 100% no Prevision.

### Regras e mensagens

- **Duplicatas são recusadas**: "Atividade X já importada. Nenhuma alteração foi aplicada."
- **Atividade com progresso exige vagão liberado** e sem restrição de execução ("Libere o vagão antes de registrar execução.").
- "Selecione um vagão cujo período contenha integralmente as atividades.": a atividade não cabe no vagão escolhido.
- "Esta obra ainda não está vinculada a um projeto do Prevision.": vincule a obra antes de atualizar.`,
  },
];

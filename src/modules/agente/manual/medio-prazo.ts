import type { ManualSection } from './types';

/** Manual da aba 3, Cronograma de médio prazo (29/10/2026): o cronograma do mês no padrão do MS Project,
 * as seções de apoio à reunião, as regras do agendamento e as visões de recursos. Escrito a partir do
 * código da tela e do tour; quando os dois divergem, vale o código. */
export const sections: ManualSection[] = [
  {
    id: 'medio-prazo-visao-geral',
    title: 'Aba 3: para que serve e como está organizada',
    summary: 'O que é o cronograma de médio prazo, quem vê e edita, as sete seções da aba e os modos de exibição.',
    keywords: [
      'médio prazo',
      'medio prazo',
      'aba 3',
      'cronograma do mês',
      'plano do mês',
      'project',
      'seções',
      'próximos 90 dias',
      'janela',
      'equipes',
      'cobertura',
      'histórico',
      'modo de exibição',
      'quem pode',
      'não aparece',
    ],
    screen: 'medio-prazo',
    body: `## Para que serve

A aba 3, "Cronograma de médio prazo" (endereço /obras/<obra>/medio-prazo), é o cronograma do mês da obra no padrão do MS Project: tabela à esquerda, Gantt à direita e datas calculadas pela rede de predecessoras. Há **um cronograma por mês**, cada um com **horizonte de três meses** (do dia 1 do mês ao último dia do segundo mês seguinte). O primeiro nasce em branco; cada mês seguinte nasce como cópia do anterior, que fica guardado como estava. Em volta dele ficam seções de apoio à reunião de médio prazo.

## Quem vê e quem edita

- O módulo está **em desenvolvimento**: só aparece para administradores, para quem desenvolve o sistema e para quem teve o módulo "Médio prazo" liberado pelo admin na lista de usuários das Configurações. Quem não tem acesso é levado ao curto prazo da obra.
- É preciso ter acesso à obra ("Você não tem acesso a esta obra.").
- Perfil **consulta** só lê: vê a grade, as visões e as seções, mas não libera a edição, não salva, não cria cronograma nem define linha de base. **Planejador, gestor e admin** fazem tudo isso. Se consulta tentar gravar, recebe "Seu perfil permite apenas consulta."

## As sete seções

A barra de seções fica no cabeçalho da aba. A seção vai no endereço da página: um link compartilhado abre a mesma seção para quem o recebe.

- **"Cronograma"**: o plano do mês (grade, Gantt, visões de recursos, Linha do Tempo). Abre por padrão.
- **"Próximos 90 dias"**: as atividades dos vagões (aba 2) que tocam a janela móvel de hoje a 90 dias, em ordem de início, com vagão, local, período previsto, equipe e percentual. Cartões "Atividades na janela", "Atividades sem equipe", "Equipes em sobrecarga" e "Progresso ponderado da janela". A caixa "Somente sem equipe" deixa só o que a reunião precisa resolver.
- **"Equipes"**: "Carga das equipes na janela". Por equipe, quantas atividades dos vagões e linhas do plano do mês caem nos 90 dias contra a capacidade semanal; "Situação" diz "Dentro da capacidade" ou "Sobrecarga · N além da capacidade". "Gerenciar equipes" leva às Configurações da obra.
- **"Cobertura"**: duas conferências. "Da janela para o mês" lista frentes da janela que caem no mês e não têm linha no plano; "Do mês para a semana" lista linhas do plano que não aparecem na planilha de nenhuma semana do período delas. "Plano conferido" escolhe o plano. O pareamento é **pelo nome** (sem acento, caixa nem espaço repetido): é sugestão, nada bloqueia nem cria linha sozinho, e erra quando o nome muda de um nível para outro. Resumos ficam de fora.
- **"Histórico"**: os 20 lançamentos de percentual executado mais recentes das atividades da obra. O histórico completo fica no detalhe do vagão.
- **"Recursos"**: carga semanal de cada equipe contra a capacidade, com superalocação.
- **"Linha de base"**: variação de cada tarefa do plano vivo contra uma linha de base congelada.

## Dentro do Cronograma

- **"Modo de exibição"** (lista na barra de ferramentas e ícones na barra de status): "Gráfico de Gantt", "Planejador de Equipe", "Uso dos Recursos" e "Planilha de Recursos". O nome da visão fica em pé na borda esquerda, e a escolha fica salva.
- **"Linha do tempo"** (caixa): mostra ou esconde a faixa acima da visão. Vem ligada.
- **Barra de status**: "Pronto", "Editando", "Alterações não salvas" ou "Salvando…"; "Novas tarefas: Agendadas automaticamente"; contagem de tarefas, vínculos e críticas; "Fim do projeto"; atalhos das visões, apresentação e zoom.
- **"Configurar recursos"** (cabeçalho) leva às Configurações da obra, onde se cadastram empreiteiros, equipes e capacidades.
- O **"?"** ao lado da descrição ("Como funciona: médio prazo") resume as regras.
- Há dois **"Modo reunião"**: o do topo da tela só aumenta o texto para projetar; o da barra do cronograma acrescenta "Anterior", "Próxima" e "Revisado nesta reunião" ao painel de detalhes da tarefa.`,
  },
  {
    id: 'medio-prazo-criar-salvar-exportar',
    title: 'Criar o cronograma do mês, salvar o rascunho e exportar',
    summary:
      'Novo cronograma (em branco ou cópia), cadeado, rascunho, "Revisar e salvar" com motivo, conflito de versão, descartar e .xml.',
    keywords: [
      'criar cronograma',
      'novo cronograma do mês',
      'copiar mês anterior',
      'em branco',
      'liberar edição',
      'cadeado',
      'bloqueado',
      'rascunho',
      'revisar e salvar',
      'motivo',
      'não salvo',
      'descartar',
      'outra pessoa alterou',
      'exportar',
      'xml',
    ],
    screen: 'medio-prazo',
    body: `## Criar o cronograma de um mês

- Sem nenhum cronograma, a seção "Cronograma" mostra só o botão "Novo cronograma do mês". Depois, ele fica no rodapé, para planejador, gestor e admin, e só sem alteração pendente.
- Campos: "Mês" (vem sugerido o mês seguinte ao último criado), "Partir de" ("Cópia de Mmm/aa · nome" ou "Em branco") e "Nome (opcional)" (sem nome, fica "Plano de AAAA-MM"). "Criar cronograma" grava na hora e abre o mês novo.
- A **cópia** leva tarefas, vínculos, recursos, anotações, % concluída, datas reais e o calendário. Ficam de fora as tarefas 100% concluídas que terminaram antes do novo horizonte e os resumos que ficaram sem subitens. Tarefa que perdeu a predecessora ganha "Não iniciar antes de" na data em que estava, para não pular. O mês de origem não muda.
- Recusas: "Esta obra já tem um plano para este mês." (um plano vivo por mês), "O plano de origem deve ser de um mês anterior ao novo plano." e "Copie de um plano vivo, não de uma linha de base."
- Não há botão para excluir um cronograma na tela.

## Trocar de mês

O seletor "Mês" troca entre os meses criados; a tela abre no mês corrente ou, sem ele, no mais recente. À esquerda ficam "Horizonte de três meses: X a Y" e "copiado de Mmm/aa". Com alteração não salva, a troca fica travada: salve ou descarte antes.

## A grade abre bloqueada

A grade abre com cadeado, contra alteração acidental em reunião. "Liberar edição" destrava as células; "Bloquear" trava de novo. Consulta não consegue liberar. As setas ao lado desfazem e refazem (Ctrl+Z e Ctrl+Y) e valem na tela inteira, inclusive no Gantt e no Planejador.

## Rascunho e "Revisar e salvar"

- Toda edição (célula, Gantt, Planejador, Informações da tarefa, calendário, Linha do Tempo, exclusão) fica em **rascunho** no navegador. Nada vai ao banco antes de salvar. O contador diz "N tarefas alteradas · não salvo" ou "Tudo salvo"; as células alteradas ficam marcadas, e o filtro "Alteradas no rascunho" lista as linhas.
- "Revisar e salvar" abre "Revisar atualização": tarefas alteradas e excluídas, cada campo de antes para depois (inclusive "Predecessoras" e "Calendário alterado nesta revisão") e o campo obrigatório "Motivo da atualização". "Salvar alterações" grava tudo numa revisão só; "Voltar ao rascunho" fecha sem gravar. Sucesso: "Cronograma salvo".
- O motivo fica no "Histórico da tarefa" (painel de detalhes; abra para carregar), com data, autor e cada campo de antes para depois.
- **Se outra pessoa salvou antes:** "Outra pessoa alterou o cronograma. Atualize a página antes de salvar novamente; nenhuma alteração foi gravada." Recarregue a página (o rascunho se perde) e refaça as mudanças sobre a versão nova.
- Outras recusas do servidor: "Datas divergentes do cálculo. Revise o rascunho antes de salvar." (recarregue e tente de novo); "Revisão excede o limite de 3000 tarefas ou 10000 vínculos."; "Linha N: tarefa-resumo não recebe restrição nem prazo final; informe nas subtarefas."
- Aviso azul ao abrir ("N tarefas foram ajustadas à regra do Project ao abrir"): um plano antigo foi acertado às regras atuais; o ajuste vai ao banco no próximo "Revisar e salvar".

## Descartar e sair

"Descartar rascunho" (aparece com alteração não salva) pergunta "Descartar todas as alterações não salvas?" e devolve as tarefas ao que está gravado ("Descartar" ou "Manter rascunho"). Clicar em um link com rascunho aberto pergunta "Sair e perder as alterações não salvas?" ("Sair sem salvar" ou "Continuar editando"); fechar a aba do navegador também avisa.

## Exportar para o Project

"Exportar para o Project (.xml)" (rodapé) baixa o cronograma como está na tela, inclusive o rascunho não salvo, com restrições, prazos finais, folgas, caminho crítico e a linha de base exibida. O arquivo tem o nome do plano e abre no MS Project com as mesmas datas (o Project recalcula ao abrir). Limitação: os nomes dos recursos não vão no arquivo; a coluna chega vazia no Project. Disponível a todos os perfis; desligado com cronograma vazio.`,
  },
  {
    id: 'medio-prazo-colunas-indicadores-gantt',
    title: 'Colunas da tabela, indicadores e o Gantt',
    summary:
      'O que cada coluna mostra, como mostrar, ocultar e arrastar colunas, a linha 0, os ícones de indicadores e a legenda do Gantt.',
    keywords: [
      'colunas',
      'ocultar coluna',
      'mostrar coluna',
      'arrastar coluna',
      'restaurar padrão',
      'indicadores',
      'ícone',
      'linha 0',
      'gantt',
      'barra',
      'cores',
      'zoom',
      'filtro',
      'buscar',
      'detalhes da tarefa',
    ],
    screen: 'medio-prazo',
    body: `## Colunas

Padrão, as do Gantt de acompanhamento do Project: "Id", "Indicadores", "% concluída", "Nome da tarefa", "Duração", "Início real", "Término real", "Início", "Término", "Início da linha de base", "Término da linha de base", "Predecessoras" e "Nomes dos recursos".

Ocultas por padrão, ligam-se no menu "Colunas": "Início tardio", "Término tardio", "Folga total", "Folga livre", "Crítica", "Tipo de restrição", "Data da restrição", "Prazo final", "Anotações", "Decorrido / total", "% alvo", "Desvio (pp)" e "Variação (dias)".

- "Id" é a **posição** da linha (1, 2, 3…), como no Project, e é o número usado nas predecessoras. O número hierárquico (1.2, 1.2.1) aparece em cinza antes do nome.
- "Nome da tarefa" não se oculta. Resumo tem a seta para recolher e abrir.
- Datas no formato "Seg 24/08/26"; "ND" é sem data. Ao digitar, aceita dd/mm/aa, dd/mm/aaaa, AAAA-MM-DD ou o texto copiado do Project.
- Arraste o cabeçalho para mudar a ordem (ou Alt+← e Alt+→ com o foco nele) e a borda do cabeçalho para a largura. "Id" e "Indicadores" ficam presas no começo. "Restaurar padrão" devolve colunas, ordem e larguras. As escolhas ficam salvas no navegador, por pessoa e por plano, junto com visão, zoom e apresentação.
- Só leitura: Id, Indicadores, tardias, folgas, Crítica, linha de base, Decorrido, % alvo, Desvio e Variação. Nas linhas de **resumo**, duração, datas, %, predecessoras, restrição e prazo também são calculadas ("Resumo calculado das subtarefas").

## Linha 0

A primeira linha resume o plano inteiro, como a tarefa de resumo do projeto no Project: início e término, datas reais, linha de base e % concluída ponderada pela duração das tarefas. Não se edita.

## Indicadores (passe o mouse para ler)

- Visto verde: "Tarefa concluída".
- Calendário: a restrição da tarefa, com a data; azul semiflexível, vermelho inflexível, cinza em "O mais tarde possível"; acrescenta "segurando a data" quando é ela, e não a rede, que prende a tarefa.
- Triângulo vermelho: "Prazo final perdido: termina depois de X".
- Corrente partida: "Vínculo desrespeitado: a restrição ou a data real prendem a tarefa antes do que a predecessora permite".
- Círculo âmbar: "Fora do horizonte de três meses". Um aviso amarelo acima da grade conta quantas; o filtro "Fora do horizonte" mostra quais. É sinal, não bloqueio.
- Nota: "Tem anotações".

## Gantt

- Barra azul é o previsto, com o avanço em tom escuro; **vermelha** quando crítica ("Caminho crítico", ligado por padrão); barra cinza embaixo é a linha de base exibida.
- Colchete preto é resumo; losango é marco (0 dias), com a data ao lado; setas com cotovelo são os vínculos.
- Linha âmbar vertical é hoje; as tracejadas limitam o horizonte; o fundo acinzentado marca o que fica fora dele e os dias não úteis.
- Borda tracejada é vínculo desrespeitado; traço vertical na barra é o início real; tarefa interrompida aparece em dois trechos ligados por pontilhado; a seta no topo da linha é o prazo final (verde cumprido, vermelha perdido).
- "Folga" desenha uma linha fina depois da barra até o término tardio. "Recursos nas barras" escreve a equipe ao lado. Passe o mouse na barra para ler tudo em texto.
- Clique na barra para selecionar a linha. "Rolar até a tarefa" (Ctrl+Shift+F5) leva o Gantt até a barra selecionada.
- Na barra de status: "Tabela e Gantt", "Somente tabela" (indicado no celular) ou "Somente Gantt"; arraste a faixa entre tabela e Gantt para dividir o espaço; o zoom "Meses", "Semanas" e "Dias" vale também para o Planejador de Equipe e o Uso dos Recursos.

## Buscar, filtrar e detalhes

- A busca procura no nome, no recurso e nas anotações. Filtros por situação: "Não iniciadas", "Em andamento", "Concluídas", "Atrasadas", "Críticas", "Com vínculo desrespeitado", "Prazo final perdido", "Fora do horizonte", "Alteradas no rascunho", "Com anotações"; e por recurso. Com filtro ativo, cada resultado aparece com os resumos acima dele, e inserir, recuar, vincular e excluir ficam desligados. "Expandir" e "Recolher" abrem ou fecham todos os resumos.
- Abaixo da grade, **Detalhes da tarefa** resume a linha selecionada (datas, duração, avanço, predecessoras, tardias, folgas, restrição, prazo final e "Predecessoras determinantes"), com "Detalhes em tela cheia", "Anotações e encaminhamentos" (editável com a edição liberada; "Transformar linhas em tópicos") e "Histórico da tarefa". O "Modo reunião" do cronograma acrescenta "Anterior", "Próxima" e "Revisado nesta reunião" (marca só desta tela; some ao recarregar).
- **Linha do Tempo** (faixa acima da visão): as tarefas marcadas, com "Início" e "Término" do projeto nas pontas e os marcos embaixo. A moldura é o trecho que o Gantt mostra: arraste-a para rolar o Gantt. Clique numa tarefa para selecioná-la; duplo clique rola até ela; botão direito ou Delete a tira da faixa.`,
  },
  {
    id: 'medio-prazo-editar-grade-teclado',
    title: 'Editar a grade: inserir, item e subitem, excluir, vincular, atalhos e Informações da tarefa',
    summary:
      'Como criar, recuar, excluir e vincular tarefas, os atalhos de teclado, copiar e colar, o diálogo Informações e a edição pelas barras.',
    keywords: [
      'inserir tarefa',
      'nova tarefa',
      'subitem',
      'recuar',
      'diminuir recuo',
      'excluir tarefa',
      'vincular',
      'desvincular',
      'atalhos',
      'teclado',
      'insert',
      'copiar',
      'colar',
      'informações da tarefa',
      'arrastar barra',
    ],
    screen: 'medio-prazo',
    body: `## Editar uma célula

Com a edição liberada ("Liberar edição"), a grade funciona como planilha: clique seleciona; Shift+setas ou Shift+clique seleciona um intervalo; duplo clique, F2, Enter ou digitar direto começa a edição; Esc cancela; Tab anda de célula. Enter grava e desce uma linha; **na última linha, Enter grava e já cria a tarefa seguinte**, para digitar uma atrás da outra. "Nomes dos recursos" e "Tipo de restrição" abrem uma lista. Erro na célula aparece na faixa vermelha acima da grade, e o cursor fica na célula para corrigir.

Ctrl+C e Ctrl+V copiam e colam um bloco (dá para colar do Excel e do Project); Ctrl+D preenche as células de baixo com a de cima; Ctrl+Home e Ctrl+End vão à primeira e à última linha; Ctrl+Z e Ctrl+Y desfazem e refazem. Até 1000 células por operação. Recusas: "Colagem ultrapassa a grade." e "O intervalo contém uma célula bloqueada ou calculada."

## Inserir tarefa

"Inserir tarefa" (Insert) cria "Nova tarefa" **abaixo da linha selecionada**, no mesmo nível, com 1 dia a partir do início da linha de cima, e já abre o nome para digitar. Abaixo de um resumo, vira a primeira subtarefa dele. Sem linha selecionada, entra no fim. Nome é obrigatório. Grade sem nenhuma linha: "Cronograma vazio. Libere a edição e use “Inserir tarefa”."

## Item e subitem (recuo)

- "Recuar" (Alt+Shift+→ ou Cmd+Alt+→) torna as linhas selecionadas subitens da linha de cima, que vira **resumo**. "Diminuir recuo" (Alt+Shift+← ou Cmd+Alt+←) faz o inverso. Com um intervalo selecionado, os dois agem em todas as linhas dele e levam as subtarefas junto (inclusive recolhidas), numa só entrada do desfazer.
- Resumo não tem datas próprias: início, término, duração e % vêm dos subitens. Ao virar resumo, a linha **perde vínculos, datas reais, restrição e prazo final**; informe-os nas subtarefas.
- Recusas: "A primeira linha selecionada não pode recuar." e "Há linha no nível 0 na seleção." (não dá para diminuir o recuo de quem já está no nível 0).
- No Mac, Cmd+Alt+setas pode ser capturado pelo Chrome (troca de aba); Alt+Shift+setas sempre funciona.

## Excluir

O botão de lixeira ("Excluir tarefa e subitens") pergunta "Excluir X e N subitens?". A exclusão leva os subitens e os vínculos da tarefa, fica no rascunho, se desfaz com Ctrl+Z e só vai ao banco em "Revisar e salvar".

## Vincular e desvincular

"Vincular" (Ctrl+F2) liga em sequência, Término-Início, as tarefas do intervalo selecionado; resumos ficam de fora. Com menos de duas: "Selecione duas ou mais tarefas (Shift+setas) para vincular." "Desvincular" (Ctrl+Shift+F2) numa tarefa só tira todos os vínculos dela; num intervalo, só os vínculos entre as tarefas dele. Vínculos também se digitam na coluna "Predecessoras".

## Informações da tarefa

"Informações" (Shift+F2; ou duplo clique na barra do Gantt, num bloco do Planejador ou numa célula que não se edita: Id, Indicadores, calculadas ou grade bloqueada) abre o diálogo do Project com as abas "Geral" (Nome, Duração, % concluída, Início, Término, "Exibir na Linha do Tempo"), "Predecessoras" (Id, Nome da tarefa, Tipo e Defasagem em dias ou corridos; "Adicionar predecessora"), "Recursos", "Avançado" ("Prazo final", "Tipo de restrição", "Data da restrição") e "Anotações". "OK" aplica tudo de uma vez no rascunho, num passo só do desfazer, com as mesmas validações da grade. Com a grade bloqueada, o diálogo só mostra ("Somente leitura: libere a edição da grade para alterar.").

## Editar pelas barras e pelo Planejador

No Gantt, com a edição liberada: arrastar a barra muda o início (cria "Não iniciar antes de"; tarefa em dias úteis cai sempre em dia útil), esticar a ponta direita muda a duração, puxar o avanço dentro da barra muda o % concluída e arrastar de uma barra até outra cria um vínculo Término-Início. Tarefa iniciada não se arrasta ("Tarefa iniciada: o início real não se arrasta."); resumo não se arrasta nem se estica. No "Planejador de Equipe", arrastar o bloco para outra equipe reatribui, para "Tarefas não atribuídas" tira a equipe e para os lados muda o início; "Atribuir a" faz o mesmo pelo teclado; Esc cancela.

## Linha do Tempo

"Adicionar à Linha do Tempo" põe as tarefas selecionadas na faixa (resumos e marcos também); vira "Remover da Linha do Tempo" quando a tarefa ativa já está nela. É edição do rascunho: desfaz com Ctrl+Z e vai ao banco em "Revisar e salvar".`,
  },
  {
    id: 'medio-prazo-predecessoras-agendamento',
    title: 'Predecessoras, duração e agendamento automático',
    summary:
      'A sintaxe das predecessoras (12; 27TI+6 dias), os quatro tipos de vínculo, durações e marcos, e como a rede empurra as datas.',
    keywords: [
      'predecessora',
      'predecessoras',
      'vínculo',
      'ti',
      'ii',
      'tt',
      'it',
      'defasagem',
      'dias corridos',
      'duração',
      'marco',
      'agendamento automático',
      'empurra',
      'ciclo',
      'calendário de trabalho',
    ],
    screen: 'medio-prazo',
    body: `## Como escrever predecessoras

Na coluna "Predecessoras" (ou na aba "Predecessoras" das Informações), use o **Id da linha**: o número da coluna "Id", a posição da tarefa na tabela, e não o número hierárquico 1.2. Formatos, como no Project:

- "12": a tarefa começa depois que a linha 12 termina (Término-Início, o padrão).
- "12;14": duas predecessoras, separadas por ";" (vírgula também é aceita).
- "27TI+6 dias": Término-Início com 6 dias úteis de espera.
- "12II+2 dias corridos": Início-Início com 2 dias corridos de espera.
- "5TT-1 dia": Término-Término com 1 dia de antecipação (defasagem negativa).
- Formas curtas: "2d" é dias úteis e "2dd" é dias corridos ("27TI+2d").

Sem tipo, vale TI; sem unidade, a defasagem é em **dias úteis** do calendário do plano. Célula vazia apaga todas as predecessoras da linha.

## Os quatro tipos

- **TI (Término-a-início)**: a sucessora começa no dia útil seguinte ao término da predecessora.
- **II (Início-a-início)**: a sucessora começa quando a predecessora começa.
- **TT (Término-a-término)**: a sucessora termina quando a predecessora termina.
- **IT (Início-a-término)**: a sucessora termina quando a predecessora começa (no dia útil anterior).

Vínculo só nas subtarefas, nunca nos resumos ("Vínculos ficam nas subtarefas, não nos resumos.").

## Cuidado com o Id

Como o número é a posição, inserir ou excluir uma linha acima renumera as de baixo. Os vínculos já gravados acompanham sozinhos (a coluna é reescrita com os números novos); só muda o que você digita daí em diante.

## Recusas

- "Predecessora inválida: X": texto fora dos formatos.
- "Linha N não existe.": Id maior que o número de linhas.
- "A tarefa não pode ser predecessora dela mesma."
- "Essa ligação criaria um ciclo entre as linhas.": A depende de B, que depende de A. A ligação é recusada e nada muda; o mesmo vale ao ligar barras no Gantt.

## Duração

Aceita "10 dias" (úteis), "10 dias corridos", "8h", "1 mês" (converte pelos "Dias por mês" do calendário), "0 dias" e as formas curtas "10d", "10dd", "1mês" e "1md" (mês corrido). **"0 dias" é marco**: início e término no mesmo dia e losango no Gantt; ligado por TI, fica no dia em que a predecessora termina. Em tarefa concluída, a duração vem das datas reais ("Tarefa concluída: a duração vem do início e do término reais."). Mensagem de formato: "Use duração como 0 (marco), 8h, 10d, 10 dias, 10dd, 10 dias corridos, 1mês ou 1md."

## Agendamento automático

- "Início" e "Término" vêm da rede de predecessoras e das durações, no calendário do plano. Mudar a duração ou uma predecessora **empurra as sucessoras** na hora, ainda no rascunho; o servidor refaz a conta ao salvar.
- **Digitar o "Início"** cria a restrição "Não iniciar antes de" nessa data: a tarefa não começa antes, mas a rede ainda pode empurrá-la para depois. **Digitar o "Término"** cria "Não terminar antes de" e refaz a duração até ele.
- **Apagar o "Início"** de uma tarefa com predecessora devolve a data à rede ("O mais breve possível"). Sem predecessora, a data é obrigatória: "Informe o início."
- Tarefa nova sem predecessora nasce na data da linha de cima (ou no início do horizonte, se for a primeira).
- "Período sem dia de trabalho.": o término digitado não deixa nenhum dia útil.
- Tarefa com data real não se move pela rede (ver "Avanço, datas reais, % alvo e linha de base").

## Calendário de trabalho

Em "Calendário de trabalho" (abaixo do cronograma; edita-se com a edição liberada): dias úteis da semana (padrão segunda a sexta), "Horas por dia" (padrão 8), "Dias por mês" (padrão 20) e "Feriados (AAAA-MM-DD, separados por vírgula)". Horas e dias por mês convertem durações em "h" e em meses. Mudar o calendário reagenda todas as tarefas e vai ao banco em "Revisar e salvar" ("Calendário alterado nesta revisão.").`,
  },
  {
    id: 'medio-prazo-restricoes-prazo-critico',
    title: 'Restrições, prazo final, caminho crítico e folgas',
    summary:
      'As oito restrições e suas siglas, o prazo final, tarefa crítica, folga total e livre, vínculo desrespeitado e Caminho da tarefa.',
    keywords: [
      'restrição',
      'tipo de restrição',
      'niad',
      'nidd',
      'die',
      'não iniciar antes de',
      'deve iniciar em',
      'prazo final',
      'caminho crítico',
      'crítica',
      'vermelho',
      'folga',
      'término tardio',
      'vínculo desrespeitado',
      'caminho da tarefa',
    ],
    screen: 'medio-prazo',
    body: `## As oito restrições

As colunas "Tipo de restrição" e "Data da restrição" (ocultas por padrão; ligue em "Colunas") e a aba "Avançado" das Informações aceitam os oito tipos do Project, pelo nome ou pela sigla:

- "O mais breve possível" (OMBP): o padrão; é não ter restrição, só a rede manda.
- "O mais tarde possível" (OMTP): agenda a tarefa nas datas tardias; não leva data.
- "Não iniciar antes de" (NIAD) e "Não terminar antes de" (NTAD): semiflexíveis, só empurram para a frente; a rede ainda pode atrasar a tarefa.
- "Não iniciar depois de" (NIDD) e "Não terminar depois de" (NTDD): semiflexíveis no outro sentido; a data vira teto e prende a tarefa mesmo contra a rede.
- "Deve iniciar em" (DIE) e "Deve terminar em" (DTE): inflexíveis; a data manda, mesmo contra a rede.

Regras: digitar o "Início" cria NIAD e o "Término" cria NTAD. Digitar uma "Data da restrição" numa tarefa sem restrição vira NIAD; apagar a data volta a "O mais breve possível". Escolher um tipo com data sem informar a data usa o início (ou o término) atual. Resumo não recebe restrição nem prazo final. Mensagem de formato: "Tipo de restrição: use o nome do Project ou a sigla (NIAD, NIDD, NTAD, NTDD, DIE, DTE, OMBP, OMTP)."

## Vínculo desrespeitado

Quando NIDD, NTDD, DIE, DTE ou uma data real prendem a tarefa antes do que a predecessora permite, a tarefa fica no lugar e o indicador de corrente partida acende ("Vínculo desrespeitado"); no Gantt a barra ganha borda tracejada; o filtro "Com vínculo desrespeitado" lista todas. O sistema não corrige sozinho: mova a data, troque a restrição ou revise o vínculo. O indicador de calendário mostra a restrição (azul semiflexível, vermelho inflexível) e diz "segurando a data" quando é ela que prende a tarefa.

## Prazo final

"Prazo final" (coluna oculta por padrão, ou aba "Avançado") **não move a tarefa**: reduz a folga (que pode ficar negativa) e, quando o término passa dele, acende o triângulo vermelho "Prazo final perdido" e entra no filtro de mesmo nome. No Gantt, a seta no topo da linha fica verde enquanto o prazo é cumprido e vermelha quando é perdido. Célula vazia apaga o prazo.

## Caminho crítico e folgas

- "Caminho crítico" (ligado por padrão) pinta de vermelho, no Gantt, as tarefas sem folga total: se atrasarem, atrasam o fim do plano. A coluna "Crítica" diz "Sim" quando a tarefa não está concluída e não tem folga; o filtro "Críticas" lista; a barra de status conta "N críticas" e mostra "Fim do projeto". Resumo é crítico quando alguma subtarefa é. Tarefa concluída nunca é crítica.
- "Folga total" é quanto a tarefa pode atrasar sem mover o fim do plano; "Folga livre", sem mover nenhuma sucessora. Em dias úteis (tarefa em dias corridos conta em dias de 24 horas). Folga negativa quer dizer que uma restrição ou um prazo final não cabe na rede.
- "Início tardio" e "Término tardio": o mais tarde que a tarefa pode começar e terminar sem atrasar o fim do plano.
- "Folga" (botão) desenha a linha fina depois de cada barra até o término tardio.
- Tudo isso é calculado a cada edição; não se digita.

## Caminho da tarefa

"Caminho da tarefa" realça no Gantt as predecessoras e as sucessoras da tarefa selecionada, em cores diferentes, e apaga as demais. As **determinantes** (as que de fato seguram a data) ficam no tom mais forte, e o vínculo determinante fica mais grosso; passe o mouse para ler "Predecessora determinante", "Predecessora", "Sucessora determinada" ou "Sucessora". O painel de detalhes lista "Predecessoras determinantes: 3; 5". Com NIAD, DIE ou DTE segurando a data, a restrição toma o lugar da rede.

## Dúvidas comuns

- "Mudei a predecessora e a data não mexeu": a tarefa tem data real, restrição inflexível ou um "Não iniciar antes de" depois do que a rede pede. Veja o indicador de calendário.
- "Por que a tarefa está vermelha?": está no caminho crítico. Desligue "Caminho crítico" para ver só o azul.
- "A folga está negativa": um prazo final ou uma restrição de teto não cabe; a predecessora que a segura também aparece com folga negativa.`,
  },
  {
    id: 'medio-prazo-avanco-linha-de-base',
    title: 'Avanço, datas reais, % alvo e linha de base',
    summary:
      '% concluída e Início/Término real, % alvo e desvio, "Definir linha de base", Variação (dias) e a seção Linha de base com os atrasos.',
    keywords: [
      '% concluída',
      'percentual',
      'avanço',
      'início real',
      'término real',
      'data real',
      '% alvo',
      'desvio',
      'atrasadas',
      'linha de base',
      'definir linha de base',
      'congelar',
      'variação',
      'atraso',
      'dias úteis',
    ],
    screen: 'medio-prazo',
    body: `## % concluída e datas reais

- Lançar "% concluída" acima de 0 preenche o "Início real" com o início previsto (se não havia); 100% preenche também o "Término real" com o término previsto; voltar a 0% apaga as datas reais; baixar de 100% reabre a tarefa (apaga o término real). Nos resumos, o % vem dos subitens e não se edita.
- "Início real" e "Término real" se digitam direto (dd/mm/aa; vazio apaga). Digitar o término real conclui a tarefa em 100% e refaz a duração pelo que de fato durou. Apagar o início real desfaz o andamento (0%, sem término). Para limpar o término real de tarefa a 100%: "Reduza o % concluído para limpar o término real."
- **Data real prende a tarefa**: a rede não a move mais, "Início" e "Término" passam a ser as datas reais, e a barra não se arrasta ("A tarefa já começou: corrija o Início real."). Tarefa em andamento empurrada pela rede aparece dividida no Gantt (trecho feito e restante). Puxar o avanço dentro da barra também muda o %.
- Recusas: "% concluída deve ficar entre 0 e 100.", "Início real não pode ser depois do término real.", "Término real não pode ser antes do início real.", "Tarefa concluída: corrija o Término real."
- A barra de status diz "Sem avanço lançado ainda" enquanto nenhuma tarefa tem %.

## % alvo, desvio e atrasadas

Colunas ocultas por padrão: "% alvo" é quanto da tarefa já deveria estar feito pelo tempo decorrido até a "Referência do % alvo" (campo que aparece com a coluna ligada; abre em hoje); "Desvio (pp)" é o % concluída menos o % alvo, em pontos percentuais; "Decorrido / total" mostra os dias. É leitura de tempo, não medição física. O filtro "Atrasadas" lista tarefas não concluídas cujo término já passou da referência.

## Definir linha de base

- "Definir linha de base" (rodapé; planejador, gestor e admin, só sem alteração pendente) congela as datas gravadas do plano com um nome ("Nome da linha de base", sugerido "Base dd/mm/aaaa"; botão "Salvar linha de base"). Cada vez cria uma linha de base nova e guarda as anteriores; a nova passa a ser a exibida. Linha de base é um retrato e não aceita edição. Plano vazio: "Preencha o plano antes de definir a linha de base." Não há botão para excluir linha de base na tela.
- O seletor "Linha de base" (grupo "Exibir" do Gantt) escolhe qual entra na comparação: abre na mais recente; "Nenhuma" esconde. Ela aparece nas colunas "Início da linha de base" e "Término da linha de base", como barra cinza sob a barra azul do Gantt, na linha 0 e na exportação .xml.
- "Variação (dias)" (coluna oculta) é a diferença, em **dias corridos**, entre o término atual e o da linha de base exibida; positivo é atraso. O painel de detalhes mostra "Variação contra a base N dias".

## Seção "Linha de base" (atrasos)

A seção "Linha de base" da aba compara o plano vivo com uma linha de base congelada, tarefa a tarefa, em **dias úteis** do calendário do plano; positivo é atraso.

- Seletores "Plano" e "Linha de base"; abre no plano mais recente e na base mais recente dele.
- Cartões: "Atividades atrasadas", "Maior atraso (dias úteis)" (com a média), "Variação do término do plano" e "Novas / removidas".
- Barras das até 15 tarefas mais atrasadas: a vermelha é a data atual e a fina cinza embaixo, a linha de base.
- Tabela: "Início base", "Início atual", "Δ início", "Término base", "Término atual", "Δ término" e "Status" ("atrasada", "adiantada", "no prazo", "nova" quando não existia na base, "removida" quando saiu do plano). O status segue o término; tarefa que começou atrasada e termina no prazo fica "no prazo", mas o Δ início aparece. Resumos ficam de fora.
- Sem linha de base, a seção pede para defini-la na seção "Cronograma" (o texto da tela fala em "Criar linha de base"; o botão se chama "Definir linha de base").`,
  },
  {
    id: 'medio-prazo-recursos-equipes',
    title: 'Recursos são as equipes: visões de recursos, carga semanal e superalocação',
    summary:
      'Como cadastrar e atribuir equipes, as visões Planejador de Equipe, Uso dos Recursos e Planilha de Recursos, e a seção Recursos.',
    keywords: [
      'recurso',
      'recursos',
      'equipe',
      'empreiteiro',
      'capacidade semanal',
      'superalocação',
      'superalocada',
      'sobrecarga',
      'nomes dos recursos',
      'planejador de equipe',
      'uso dos recursos',
      'planilha de recursos',
      'tarefas não atribuídas',
      'sem equipe',
      'atribuir',
    ],
    screen: 'medio-prazo',
    body: `## Equipes como recursos

Os recursos do cronograma são as **equipes cadastradas na obra**, em Configurações da obra (botão "Configurar recursos" no cabeçalho da aba). Cada equipe pertence a um empreiteiro (empresa) e tem uma **capacidade semanal**: o número de atividades simultâneas que ela atende, não pessoas nem horas. Consulta só lê o cadastro; os demais perfis alteram. A mesma equipe serve ao médio e ao curto prazo.

## Atribuir

Na coluna "Nomes dos recursos", escolha na lista "empresa · equipe" ("Sem recurso" tira a equipe). Ao colar texto, vale o nome da equipe ou da empresa; fora do cadastro: "Escolha um recurso cadastrado na obra." Também dá para atribuir na aba "Recursos" das Informações, arrastando no Planejador de Equipe ou pelo seletor "Atribuir a". Resumo não recebe recurso. O recurso alimenta o filtro por recurso, "Recursos nas barras" e as visões abaixo.

## Planejador de Equipe

Uma linha por equipe, com as tarefas dela em blocos no tempo; embaixo, a barra "Tarefas não atribuídas: N" (arraste-a, ou use as setas com o foco nela, para dar altura à faixa). Equipe **superalocada** (mais tarefas ao mesmo tempo do que a capacidade) fica com o nome em vermelho, a linha se abre em subfaixas e os blocos em conflito ganham contorno vermelho. Marco não conta na carga; tarefa interrompida libera a equipe nos dias parados. Com a edição liberada: arraste o bloco para outra equipe, para a faixa de baixo (tira a equipe) ou para os lados (muda o início, gravando "Não iniciar antes de"); Shift+↑ e Shift+↓ trocam de equipe, Shift+← e Shift+→ andam um dia útil; Esc cancela; duplo clique ou Enter abre as Informações. Tarefa iniciada ou concluída troca de equipe, mas não de data.

## Uso dos Recursos

Cada equipe em negrito, com as tarefas embaixo e o "Trabalho" em horas (dias úteis da tarefa vezes as "Horas por dia" do calendário), por dia (zoom "Dias") ou por semana. "Sem alocação" junta as tarefas sem equipe, com trabalho zero. Célula vermelha é período em que a equipe passa da capacidade. É leitura: a seleção é a mesma da tabela, e o duplo clique abre as Informações.

## Planilha de Recursos

As equipes como recursos do Project: "Id", "Indicadores" (aviso de superalocado), "Nome do recurso", "Tipo" (Trabalho), "Iniciais", "Grupo" (a empresa), "Unid. máximas" (capacidade vezes 100%: capacidade 2 é 200%), "Pico" (maior número de tarefas no mesmo dia, também em %), "Trabalho" (horas) e "Tarefas". Clique no cabeçalho para ordenar. Só leitura: equipes e capacidades se ajustam em Configurações da obra.

## Seção "Recursos": carga semana a semana

"Alocação de recursos e superalocação" soma, por equipe e por semana, as linhas do plano do mês vivo e as atividades dos vagões, contra a capacidade semanal. Linha de base e item de resumo não contam.

- "Período": "Plano de <mês>" ou "Próximas 12 semanas".
- Cartões: "Equipes superalocadas", "Semanas com superalocação", "Pico de carga semanal" e "Itens sem equipe no período".
- Mapa: cada célula é carga/capacidade; verde abaixo, âmbar "no limite", vermelho "acima". Clique na célula para listar os itens da semana; clique no nome da equipe para vê-la no histograma, que traz a linha tracejada da capacidade. A linha "Sem equipe" é só informativa.
- É análise, não bloqueio: o plano aceita qualquer alocação. Saídas: "desloque uma das linhas no plano do mês, passe-a para outra equipe ou revise a capacidade cadastrada" ("Ajustar equipes e capacidades").
- Diferença entre as leituras: o Planejador e o Uso dos Recursos olham o **dia**, dentro do plano aberto; a seção "Recursos" e a seção "Equipes" olham a **semana**, somando plano do mês e atividades dos vagões.

## Avisos comuns

- "Nenhuma equipe cadastrada nesta obra.": cadastre empreiteiros e equipes em Configurações da obra.
- "Equipe deve pertencer à obra.": o recurso é de outra obra; escolha de novo na lista.
- Equipe com tarefas no plano, ou em linha de base congelada, não pode ser excluída do cadastro.`,
  },
];

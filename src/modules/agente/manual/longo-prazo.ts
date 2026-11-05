import type { ManualSection } from './types';

/** Manual da aba 1, Cronograma de longo prazo (29/10/2026): as duas visões (Planejador e "Vagões e
 * restrições"), o cadastro de serviços, o gráfico, linhas de base e medições, a geração de vagões,
 * o módulo de restrições e a curva de avanço. Escrito a partir do código dos componentes; quando o
 * tour ou a documentação divergiam, valeu o código. Em 04/11/2026 entraram a Linha de Balanço, os
 * fluxos de serviços, as medições e o Gantt de legalização. */
export const sections: ManualSection[] = [
  {
    id: 'longo-prazo-visao-geral',
    title: 'Aba 1 · Cronograma de longo prazo: as duas visões, quem edita e como o plano é salvo',
    summary:
      'O que a aba 1 mostra, as visões Planejador e Vagões e restrições, permissões, salvamento automático, trava de revisão, exportar e importar.',
    keywords: [
      'longo prazo',
      'cronograma de longo prazo',
      'aba 1',
      'planejador',
      'vagões e restrições',
      'somente leitura',
      'salvando',
      'não salvo',
      'outra pessoa salvou',
      'recarregar o plano',
      'exportar',
      'importar',
      'plp.json',
      'ferramenta antiga',
      'módulo em desenvolvimento',
    ],
    screen: 'longo-prazo',
    body: `## Para que serve
A aba 1, "Cronograma de longo prazo", é o macro da obra: a sequência de serviços por pavimento e o que deriva dela (datas, prazo, equipes, avanço).

Ela tem seis visões, alternadas pelo seletor no cabeçalho (desde 04/11/2026):
- **"Linha de Balanço"** (padrão): o cronograma de longo prazo no estilo do Prevision, uma atividade por serviço × local, com o que já foi medido. Os blocos nascem do lançamento de um fluxo de serviços; arrastar um bloco empurra as sucessoras. Veja a seção "Linha de Balanço".
- **"Fluxos de serviços"**: o molde da empresa (o "macrofluxo" do Prevision) com a sequência de serviços, a duração por local e as dependências, pronto para lançar em qualquer obra. Veja "Fluxos de serviços" e "Lançar um fluxo".
- **"Medições"**: rodadas com data em que se lança o acumulado realizado de cada bloco, com foto de cada avanço. Veja "Medições".
- **"Gantt de legalização"**: os 12 meses até a entrega da obra, com o caminho crítico da obra e a legalização por órgão até as chaves, no mesmo cronograma do médio prazo (tabela e Gantt do Project). Um por obra. Veja "Gantt de legalização".
- **"Vagões e restrições"**: as atividades dos vagões em Linha de Balanço, só para leitura, mais o módulo de restrições, a curva de avanço acumulado e as linhas de base da obra. Para mudar datas, serviços ou pavimentos, edite o Planejador e gere os vagões de novo. Obras que nunca geraram vagões pelo plano mostram ali o que veio do Prevision.
- **"Planejador"**: a ferramenta anterior, um fluxograma de serviços por pavimento que se expande em Linha de Balanço, com linhas de base, medições e alocação de equipes. Ainda é o Planejador que responde pelas atividades dos vagões: "Gerar vagões" transforma cada serviço × pavimento em atividades de vagão (aba 2). O plano dele pode ser levado para a Linha de Balanço nova por "Importar do Planejador".

As seções abaixo sobre salvamento, exportar e importar valem para o Planejador; a Linha de Balanço, os fluxos e as medições gravam cada alteração na hora, sem botão de salvar (as medições têm "Salvar medição", que fecha a rodada). O Gantt de legalização grava como o médio prazo: rascunho e "Revisar e salvar".

O "?" ao lado da descrição ("Como funciona") explica como as visões se encaixam.

## Quem vê e quem edita
- O módulo está em desenvolvimento: a aba só aparece para administradores, para quem desenvolve o sistema e para quem teve o módulo "Longo prazo" liberado pelo admin na tela de usuários das Configurações. Quem não tem acesso é levado à aba 4; se a aba não aparece no menu, peça a liberação ao administrador.
- Perfil de consulta vê tudo e não altera nada: o Planejador avisa "Seu perfil é de consulta: o plano aparece aqui, mas não pode ser alterado" e mostra só "Linhas de base", "Medições", "Pavimentos" e "Exportar".
- Planejador, gestor e admin veem também "Novo serviço", "Recalcular", "Gerar vagões" e "Importar", e podem registrar restrições e linhas de base da obra.

## Salvamento automático
O plano é salvo sozinho cerca de um segundo depois de cada alteração; não há botão "Salvar" para o plano inteiro. O texto no canto superior direito diz a situação: "Ainda não salvo" (obra sem plano), "Salvo em <data e hora>", "Alterações não salvas…", "Salvando…", "Salvo", "Não salvo" ou "Somente leitura". Fechar a aba do navegador com alteração pendente faz o navegador perguntar antes.

- **"Não salvo"** com "Sem conexão com o servidor. As alterações continuam nesta tela; tente salvar de novo": clique em "Tentar salvar de novo".
- **"Somente leitura"** com "Outra pessoa salvou este planejamento enquanto você editava. Recarregue para ver a versão atual antes de continuar": é a trava de revisão: uma gravação só é aceita se ninguém salvou depois que você abriu o plano, para um não sobrescrever o outro em silêncio. A tela trava até você clicar em "Recarregar o plano", e as suas alterações não gravadas são descartadas no recarregamento. Para guardá-las, clique em "Exportar" antes: o arquivo sai com o que está na sua tela.
- Mensagem pedindo para "aplicar a migração": o banco ainda não está preparado; avise o administrador.

## Exportar e importar
- **"Exportar"** baixa um arquivo .plp.json com o plano inteiro: serviços, pavimentos, linhas de base do plano e medições. Serve de cópia de segurança ou para levar o plano a outra obra; fica desabilitado com o plano vazio.
- **"Importar"** carrega um arquivo exportado aqui ou o .plp.json da ferramenta "Planejamento de Longo Prazo" do antigo App-ATR. Se o plano atual já tem serviços, a tela pergunta "Substituir o plano atual?" dizendo quantos serviços há em cada lado; a importação substitui tudo, inclusive pavimentos, linhas de base e medições — exporte antes, se quiser guardar o atual. Ao terminar, um aviso diz quantos serviços, linhas de base e medições entraram; arquivo inválido mostra "Arquivo não importado:" com o motivo.`,
  },
  {
    id: 'longo-prazo-planejador-servico',
    title: 'Planejador: cadastrar um serviço (pavimentos, duração, ritmo, predecessoras, equipes, unidade)',
    summary:
      'Campos do cadastro de serviço, como predecessoras e ritmo definem as datas, Recalcular, duplicar, excluir e os erros de validação.',
    keywords: [
      'novo serviço',
      'editar serviço',
      'predecessora',
      'cruzamento automático',
      'espera',
      'ritmo',
      'duração por pavimento',
      'pavimento inicial',
      'data mínima',
      'equipes',
      'unidade de medição',
      'total previsto',
      'duplicar',
      'recalcular',
      'exemplo de edifício',
    ],
    screen: 'longo-prazo',
    body: `## Abrir o cadastro
"Novo serviço" abre o cadastro em branco; clicar num cartão do fluxograma, numa linha do "Resumo dos serviços" ou num nome da legenda abre o mesmo cadastro para editar. O serviço novo vem com início na próxima segunda-feira, 7 dias por pavimento, ritmo 7 e a faixa do pavimento 1 ao topo. Com o plano vazio, o aviso oferece "comece por um exemplo de edifício": seis serviços típicos (de Estrutura a Acabamentos) já encadeados por predecessoras, para ajustar.

## Campos
- **"Nome"** e **"Cor"** (oito cores prontas ou "Cor personalizada"); a cor identifica o serviço em todos os gráficos.
- **"Pavimento inicial"** e **"Pavimento final"**: a faixa contínua que o serviço percorre (nomes do painel "Pavimentos").
- **"Predecessoras"**: escolha em "Selecionar serviço…" e clique em "Adicionar". Para cada uma:
  - "Referência" = "Cruzamento automático": em cada pavimento em comum, este serviço só entra depois que a predecessora sai dali; sem pavimento em comum, vale o término da predecessora inteira.
  - "Referência" = "Após o pavimento X": este serviço começa no seu primeiro pavimento depois que a predecessora termina o pavimento X.
  - "Espera (dias)": dias entre o fim da predecessora e o início deste; negativa é antecipação.
  - "Libera o início a partir de dd/mm/aaaa" diz o que cada vínculo impõe. Serviços que já dependem deste não aparecem, para não formar ciclo.
- **"Data de início — <pavimento inicial>"**. Com predecessoras aparece "Mínimo pelas predecessoras e pelo ritmo: dd/mm — você pode adiar, nunca antecipar" e o botão "Usar a data mínima". Mexer nas predecessoras, na faixa, na duração ou no ritmo empurra o início para o mínimo, mas nunca o puxa para trás: a folga dada à mão fica.
- **"Duração por pavimento (dias corridos)"**: de 1 a 3650; o macro não usa calendário de dias úteis.
- **"Ritmo / intervalo entre pavimentos (dias)"**: dias entre o início de um pavimento e o do seguinte; 0 = todos começam juntos. Ritmo mais rápido que o da predecessora gera o aviso "Ritmo mais rápido que X: o início foi ajustado para os dois não se cruzarem no último pavimento em comum".
- **"Durações por pavimento"** → "Personalizar por pavimento": duração própria em alguns pavimentos; em branco usa a padrão.
- **"Equipes"**: nome e pessoas trabalhando ao mesmo tempo (1 a 1000); Enter adiciona e repetir o nome atualiza a quantidade. Alimentam a "Alocação de equipes" e, ao gerar vagões, a equipe da atividade quando o nome coincide com uma equipe da obra.
- **"Unidade de medição"**: "%", "apartamento", "m²", "m", "unidade" ou "Outra unidade…". Fora de %, informe o "Total previsto" (maior que zero). Só serviços com unidade entram nas medições, e depois da primeira ela fica "Travada: este serviço já tem medição registrada".
- **"Observações"**: texto livre.

O rodapé mostra ao vivo "Início … → término … · N dias · N pavimentos"; o término é o último dia trabalhado.

## Botões
"Salvar" grava; "Cancelar" fecha sem gravar. Num serviço já salvo há também "Duplicar" (cria "<nome> (cópia)" e já abre para editar) e "Excluir", que confirma e avisa que as medições dele também saem; quem dependia dele perde só o vínculo e mantém as datas.

## Erros comuns ao salvar
"Informe o nome do serviço", "Informe a data de início", "Duração por pavimento: use um número inteiro de 1 a 3650 dias" (o ritmo aceita de 0 a 3650), "Informe o total previsto em <unidade> (maior que zero)" e "O início não pode ser antes de dd/mm/aaaa, o mínimo pelas predecessoras e pelo ritmo" — neste caso, adie a data ou clique em "Usar a data mínima".

## "Recalcular"
Ao editar, as predecessoras só empurram as datas para a frente. "Recalcular" puxa cada serviço com predecessora para a data mínima, tirando as folgas dadas à mão; serviço sem predecessora não muda. Fica desabilitado enquanto nenhum serviço tem predecessora. Limites do plano: 400 serviços e 200 pavimentos.`,
  },
  {
    id: 'longo-prazo-planejador-grafico',
    title: 'Planejador: fluxograma, Linha de Balanço, indicadores, resumo, alocação de equipes e pavimentos',
    summary:
      'Fluxograma e Linha de Balanço do plano (arrastar, zoom, ocultar), indicadores, Resumo dos serviços, Alocação de equipes e painel Pavimentos.',
    keywords: [
      'fluxograma',
      'linha de balanço',
      'expandir em linha de balanço',
      'recolher em fluxograma',
      'arrastar',
      'reprogramar',
      'zoom',
      'ocultar do gráfico',
      'resumo dos serviços',
      'alocação de equipes',
      'pavimentos',
      'nomes dos pavimentos',
      'usar os locais da obra',
      'prazo planejado',
      'indicadores',
    ],
    screen: 'longo-prazo',
    body: `## Fluxograma e Linha de Balanço
Dois modos, alternados pelos botões "Fluxograma" / "Linha de Balanço" ou por "Expandir em Linha de Balanço" / "Recolher em fluxograma".

- **Fluxograma**: diagrama de rede. Cada coluna é um nível de precedência, cada cartão é um serviço e as setas são as predecessoras, com a espera e o pavimento de referência escritos nelas. O cartão mostra início → término, a faixa de pavimentos, a duração por pavimento, o ritmo, as equipes e o % medido; a seta do canto expande os pavimentos com as datas de cada um. Clicar no cartão abre o cadastro.
- **Linha de Balanço**: tempo na horizontal, pavimentos na vertical (o 1 embaixo). Cada retângulo é um serviço num pavimento: largura = duração, inclinação = ritmo. Há a linha de hoje, a barra do avanço medido em cada pavimento e, com uma linha de base do plano em comparação, os retângulos cinza com as datas dela.
- **Reprogramar arrastando** (só na Linha de Balanço): arraste um serviço para mudar o início, ou, com o serviço focado, use as setas do teclado (com Shift, 7 dias). O serviço nunca vai para antes do mínimo das predecessoras — a dica mostra "Início dd/mm · limite das predecessoras" quando trava — e as sucessoras são empurradas em cascata. Soltar sem mover abre o cadastro. Perfil de consulta não arrasta.
- **Zoom do tempo** (só na Linha de Balanço): de 0,25× a 6×, pelos valores prontos ou pelos botões − e +.
- **Legenda**: um nome por serviço, na cor dele. Passar o mouse destaca o serviço e as setas; clicar abre o cadastro. Com linha de base em comparação, o nome dela aparece ali.

## Indicadores
Acima do gráfico: "Serviços" (os visíveis; "N no total" quando há ocultos), "Pavimentos" (quantos a obra tem e a faixa ocupada), "Prazo planejado" (meses e dias do primeiro início ao último término; comparando com uma linha de base, "vs. linha de base: no prazo" ou o desvio) e "Avanço físico" (pelas medições).

## Resumo dos serviços
Tabela por data de início: "Serviço", "Predecessoras", "Pavimentos", "Início", "Término", "Dur./pav." (asterisco quando algum pavimento tem duração própria), "Ritmo", "Total" e "Equipes". Clique na linha para editar; a seta da esquerda abre as datas de cada pavimento. O olho da direita oculta o serviço do fluxograma, da Linha de Balanço e da contagem, sem tirá-lo do plano: ele segue na tabela marcado "(oculto)", continua indo para os vagões em "Gerar vagões" e sai da lista de nova medição; clique de novo para mostrar.

## Alocação de equipes
Aparece quando algum serviço tem equipe: pico diário de pessoas por equipe em cada semana, somando os serviços que usam a mesma equipe no mesmo dia, e a coluna "Pico". As cores comparam cada semana com o pico da própria equipe: vermelho acima de 85%, âmbar de 50 a 85%, verde abaixo.

## Painel "Pavimentos"
- "Número de pavimentos" (1 a 200; "O pavimento 1 é o mais baixo"). Diminuir corta a faixa dos serviços que passavam do topo; o aviso diz quantos.
- "Usar os locais da obra (N)": preenche os nomes com os locais importados do Prevision, em ordem de altura (fachadas, halls e equipamentos ficam de fora).
- "Numerar a partir de" + "Preencher": sequências prontas ("Térreo, 1º pavimento…", "Subsolo, Térreo…", "Fundação, Térreo…" ou só numerados). Com nomes já digitados, pergunta "Substituir os nomes de pavimento já digitados?".
- "Nomes dos pavimentos": um campo por pavimento, do topo para baixo; em branco aparece "1º", "2º"…
- "Salvar" grava; perfil de consulta só visualiza.`,
  },
  {
    id: 'longo-prazo-planejador-linhas-base-medicoes',
    title: 'Planejador: linhas de base do plano e medições físicas',
    summary: 'Salvar, comparar, restaurar e excluir fotos do plano; registrar medições acumuladas por serviço e entender o avanço físico.',
    keywords: [
      'linha de base',
      'linhas de base do plano',
      'comparar',
      'parar de comparar',
      'restaurar',
      'foto do plano',
      'medição',
      'medições físicas',
      'nova medição',
      'avanço físico',
      'medição acumulada',
      'histórico de medições',
      'excluir medição',
      'unidade travada',
      '% medido',
    ],
    screen: 'longo-prazo',
    body: `## Linhas de base do plano
O botão "Linhas de base" (o número ao lado diz quantas existem) abre a gaveta "Linhas de base". Uma linha de base é uma foto dos serviços do plano com as datas daquele momento; reprogramar o plano depois não a altera. Salve uma antes de uma grande mudança ou quando o plano for aprovado.

- **"Nova linha de base"**: dê um nome (ex.: "Aprovado na diretoria") e clique em "Salvar linha de base atual". Limite de 60 por plano: "Limite de 60 linhas de base: exclua uma para salvar outra".
- Cada foto mostra quando foi salva, quantos serviços guardou e o término dela com a diferença para o atual: "+N d em relação ao atual" (verde) quer dizer que o plano de hoje termina antes da foto; "−N d" (vermelho), que termina depois.
- **"Comparar"** / **"Comparando"**: desenha as datas da foto em retângulos cinza na Linha de Balanço, mostra o aviso "Comparando com a linha de base X" (com "Parar de comparar") e acrescenta ao indicador "Prazo planejado" a linha "vs. linha de base". Uma foto por vez.
- **"Restaurar"**: troca os serviços atuais pelos da foto, depois de confirmar ("Os serviços atuais serão substituídos por esta foto"). Se a foto tinha mais pavimentos que a obra hoje, o número de pavimentos cresce. Nomes de pavimentos, medições e as outras linhas de base ficam como estão.
- **"Excluir"**: remove a foto, depois de confirmar.

Perfil de consulta abre a gaveta e compara, mas não salva, restaura nem exclui. Essas linhas de base são do Planejador e viajam com o plano no "Exportar"; não confunda com as "Linhas de base" da visão "Vagões e restrições", que fotografam os vagões.

## Medições físicas
O botão "Medições" (com o número de rodadas) abre "Medições físicas", com duas abas.

**"Nova medição #N"**
- Lista os serviços visíveis que têm unidade de medição. Sem nenhum: "Nenhum serviço tem unidade de medição. Defina a unidade no cadastro do serviço para medir".
- "Data da medição" (vem com hoje).
- Para cada serviço, digite o valor **acumulado** na unidade dele: em % (0 a 100) ou na quantidade (m², apartamentos…), que vira percentual pelo "Total previsto" do cadastro. A tela mostra a medição anterior e a barra do novo percentual.
- Avisos: "… é menor que a medição anterior — a medição é acumulada" (quase sempre é digitação do incremento, e não do acumulado); "Sem total previsto no cadastro, o percentual fica em 0%"; "Use um valor entre 0 e 100".
- "Observação (opcional)" por serviço.
- "Salvar medição #N (X serviços)" grava só os serviços preenchidos; os outros mantêm a última medição. Limite de 500 rodadas por plano.

**"Histórico (N)"**
- Com duas ou mais rodadas, o gráfico "Avanço físico do plano" mostra a evolução. Abaixo, cada rodada com data, serviços, valor, percentual e observação. A lixeira exclui a rodada ("Os valores desta rodada saem do avanço físico").

## Como o avanço físico é calculado
O "Avanço físico" dos indicadores é a média dos serviços com unidade, ponderada pelos pavimento-dias de cada um; serviço com unidade e ainda sem medição conta 0%, e serviço sem unidade não entra. O % medido de cada serviço aparece no cartão do fluxograma e como barra em cada pavimento da Linha de Balanço. Perfil de consulta vê o painel, com o aviso "Seu acesso é de consulta: a medição não pode ser salva".`,
  },
  {
    id: 'longo-prazo-gerar-vagoes',
    title: 'Gerar vagões a partir do plano de longo prazo',
    summary:
      'O que "Gerar vagões" faz, a prévia do que muda, por que vagões liberados nunca mudam, a situação dos vagões e as mensagens do diálogo.',
    keywords: [
      'gerar vagões',
      'gerar os vagões de novo',
      'vagões em dia',
      'vagões desatualizados',
      'plano mudou depois da última geração',
      'sequência de vagões',
      'criar sequência',
      'takt',
      'prévia',
      'cauda',
      'vagão liberado',
      'sai da cauda',
      'atividades do vagão',
      'o plano salvo mudou',
    ],
    screen: 'longo-prazo',
    body: `## O que faz
O Planejador é o dono das atividades dos vagões (aba 2). "Gerar vagões" leva o plano **salvo** para uma sequência de vagões da obra: cada serviço × pavimento vira uma atividade, com o pavimento como local (criado se não existir), fatiada nos vagões que atravessa ("parte 2 de 3", com peso proporcional aos dias em cada vagão). Editar o plano não muda os vagões sozinho: é preciso gerar de novo; o médio prazo (aba 3), que lê as atividades dos vagões, só reflete o plano depois disso.

Só planejador, gestor e admin veem o botão; ele fica desabilitado com o plano vazio.

## Situação dos vagões
A linha abaixo da barra de ações diz: "Vagões em dia com este plano (gerados em …)", "O plano mudou depois da última geração de vagões (…)" com o link "Gerar os vagões de novo", ou "Os vagões ainda não foram gerados a partir deste plano". Para o perfil de consulta: "Os vagões só acompanham o plano quando um planejador gera de novo".

## O diálogo "Gerar vagões a partir do plano"
1. **"Sequência de vagões"**: escolha a sequência (nome, takt e calendário). Se a obra não tem nenhuma, aparece "A obra ainda não tem sequência de vagões. Crie uma:" com "Nome" (vem "Ciclo do longo prazo"), "Takt (dias por vagão)" (1 a 60) e "Calendário" ("Dias úteis" ou "Dias corridos"), e o botão "Criar sequência".
2. A prévia é calculada sozinha ("Calculando a prévia…"); com o plano ainda salvando: "Aguardando o plano terminar de salvar — os vagões são gerados a partir do plano salvo".
3. **Prévia**: "Vagões" (quantos, do primeiro ao último dia), "Atividades" (serviço × pavimento, por vagão) e "A partir de", a data em que o plano passa a ocupar os vagões: "dia seguinte ao vagão N, o último liberado" ou "nenhum vagão liberado; o plano começa hoje ou no início da sequência", com os "Reaproveitados" (vagões e atividades que continuam iguais).
   - Aviso azul "N serviço × pavimento terminam antes de dd/mm e ficam fora dos vagões": o que já passou não entra.
   - Aviso amarelo "Sai da cauda: N vagões, N atividades (N com avanço ou critério atendido), N restrições e N pendências dos vagões removidos": é o que a geração vai apagar; atividades vindas do Prevision nessa cauda são substituídas pelas do plano. Leia antes de confirmar.
4. "Gerar N vagões" confirma; "Cancelar" fecha. Ao terminar: "Vagões gerados: N vagões com N atividades" e o link "Abrir os vagões".

## Regras
- **Vagões liberados nunca mudam.** O plano ocupa só a cauda ainda não liberada, a partir do dia seguinte ao último vagão liberado (ou de hoje, ou do início da sequência, o que vier mais tarde). Um vagão liberado depois de um não liberado aborta a geração, para não mexer nele.
- **Gerar de novo sem mudar o plano mantém tudo**: os mesmos vagões e atividades, com avanço, critérios, equipe, anotações e restrições. Só o que o plano deixou de prever sai, e a prévia mostra.
- Entram todos os serviços, inclusive os ocultos no gráfico. A equipe da atividade é preenchida quando o nome coincide com uma equipe cadastrada na obra.
- A geração lê o plano gravado, nunca a tela. Mensagens: "O plano salvo mudou desde que você o abriu. Recarregue antes de gerar os vagões" (outra pessoa salvou), "Salve o plano antes de gerar os vagões" (obra sem plano gravado) e "O plano não tem serviços".
- Depois da primeira geração, "Atualizar do Prevision" (Integrações) deixa de refazer essa sequência, para não apagar a cauda montada pelo plano.`,
  },
  {
    id: 'longo-prazo-vagoes-restricoes',
    title: 'Visão Vagões e restrições: Linha de Balanço dos vagões e módulo de restrições',
    summary:
      'Como ler a Linha de Balanço das atividades dos vagões e como registrar, mover e resolver restrições com lead time e data limite.',
    keywords: [
      'vagões e restrições',
      'restrição',
      'registrar restrição',
      'módulo de restrições',
      'lead time',
      'data limite',
      'prazo vencido',
      'identificada',
      'em tratativa',
      'registrar resolução',
      'iniciar tratativa',
      'bloqueia execução',
      'bloqueia terminalidade',
      'linha de balanço dos vagões',
      'criar pendência',
    ],
    screen: 'longo-prazo',
    body: `## Linha de Balanço dos vagões
As atividades dos vagões são só leitura aqui: datas, serviços e pavimentos mudam pelo Planejador e por "Gerar vagões". Obras sem vagões gerados mostram o que veio do Prevision.

- Cada linha é um local da obra, em ordem de altura: por padrão o local mais baixo fica na primeira linha; marque **"Inverter locais"** para ver como um corte do prédio, com a cobertura no alto. Cada barra é uma atividade, colorida e rotulada pelo serviço; atividades do mesmo local que se sobrepõem descem para uma sub-faixa, e as fatias ("parte 1 de 2") aparecem como o mesmo serviço.
- **"Escala"**: "Mês" compacta a obra inteira; "Semana" alarga os dias e numera as semanas.
- **"Ver tabela"** / **"Ver gráfico"**: a tabela lista "Serviço", "Local", "Início previsto", "Término previsto" e "Executado".
- **"Linha de base"** (só quando a obra já tem linha de base salva): escolha uma para ver o fim dela em linha pontilhada cinza. A linha tracejada âmbar é hoje.
- Clique numa barra para ver "Início", "Término", "Duração" e "Executado"; com linha de base escolhida, também "Início da linha de base", "Término da linha de base" e "Desvio no término". No mesmo diálogo, **"Criar pendência para esta tarefa"** cria uma restrição ligada à atividade, com você como responsável, bloqueando execução e terminalidade: informe a descrição e o lead time. Apesar do nome, ela entra no módulo de restrições abaixo.

## Módulo de restrições
Uma restrição é algo que precisa ser resolvido antes de uma frente começar (projeto, material, contratação, liberação). Ela aponta para uma atividade de vagão e, com lead time, o **limite de resolução = início previsto da atividade − lead time**: a obtenção precisa caber antes de a frente começar. Se a atividade for reprogramada, o limite mostrado acompanha o novo início, e o detalhe avisa "A atividade foi reprogramada desde o cadastro: o limite registrado é dd/mm".

**"Registrar restrição"** (planejador, gestor e admin): "Descrição da restrição", "Local" (só locais com atividade), "Atividade vinculada" (depois do local; mostra o início previsto), responsável, "Lead time (dias para obter)" e as caixas "Bloqueia execução" e "Bloqueia terminalidade" (vêm marcadas). Com lead time, a tela mostra "Data limite para resolução: dd/mm — início previsto … menos N dias de lead time"; sem lead time, digite o "Prazo".

**Indicadores**: "Restrições abertas", "Com prazo vencido" e "Mais próxima do limite".

**Quadro em três colunas**: "Identificada", "Em tratativa" e "Resolvida", com a contagem. Cada card mostra a descrição, o vagão e a atividade, "Limite dd/mm" (borda vermelha e "Prazo vencido" quando passou) e "Lead time N d". Os cards ficam em ordem de limite.

**Abrir um card** ("Detalhe da restrição"): descrição, atividade vinculada com link para o vagão e período previsto, lead time (ou "Sem lead time — prazo digitado manualmente"), data limite e de onde ela veio, responsável, situação, bloqueios e, se resolvida, a resolução.
- "Iniciar tratativa →" e "← Voltar para identificada" movem entre as duas primeiras colunas (qualquer perfil que edite).
- "Resolvida" só se alcança por **"Registrar resolução"**, respondendo "Como foi resolvido?". Restrição resolvida não volta ao quadro.

## Efeito nos vagões
Enquanto uma restrição aberta marcar "Bloqueia execução", a atividade dela (ou o vagão inteiro, se não há atividade vinculada) não aceita lançamento de progresso: "Resolva a restrição de execução antes de avançar". Marcando "Bloqueia terminalidade", o vagão não fecha. Restrições impeditivas abertas nos vagões anteriores também impedem a liberação do vagão seguinte. Ao "Gerar vagões", as restrições dos vagões que saem da cauda saem junto (a prévia avisa).`,
  },
  {
    id: 'longo-prazo-curva-avanco-linhas-base',
    title: 'Visão Vagões e restrições: curva de avanço acumulado e linhas de base da obra',
    summary:
      'Como ler a curva planejado × executado (de onde vem cada linha, desvio, atraso em dias) e como definir linhas de base dos vagões.',
    keywords: [
      'curva de avanço',
      'curva s',
      'planejado',
      'executado',
      'planejamento atual',
      'planejado de',
      'desvio',
      'atraso em dias',
      'adiantada',
      'atrasada',
      'definir linha de base',
      'linhas de base salvas',
      'linha de base dos vagões',
      'período da curva',
      'lançamento datado',
    ],
    screen: 'longo-prazo',
    body: `## Curva de avanço acumulado
Responde se a obra está adiantada ou atrasada (a Linha de Balanço responde onde). Duas linhas: o **planejado**, tracejado, e o **executado**, contínuo; a tracejada âmbar vertical é hoje.

- **Planejado**: supõe avanço linear de cada atividade de vagão entre o início e o término previstos, ponderado pelo peso dela. É aproximação declarada, não produção medida.
- **"Planejado de"**: por padrão, a linha de base mais recente da obra, porque comparar o executado com um cronograma já reprogramado esconderia o atraso. "Planejamento atual" usa as datas de hoje dos vagões; o subtítulo então lembra "já reprogramado; escolha uma linha de base para comparar com o prometido". Sem linha de base salva aparece "Sem linha de base salva", e só existe o atual.
- **Executado**: sai dos lançamentos de progresso com data feitos na tela do vagão (aba 2). Por isso a curva para em hoje: depois não há medição, e prolongar inventaria avanço. Sem lançamento datado: "Ainda não há lançamento datado nesta obra, então só o planejado está desenhado" (se as atividades declaram um % sem data, o aviso explica que ele não pode ser colocado no tempo).
- **"De"** e **"até"** recortam o período; por padrão vai do primeiro início ao último término, incluindo hoje. "Período padrão" desfaz. Data inicial depois da final: "A data inicial do período é posterior à final".

**Leitura de hoje**: "Planejado até dd/mm", "Executado medido até hoje", "Desvio de hoje (executado − planejado)" em pontos percentuais e, quando dá para calcular, "Atraso medido em tempo" ou "Avanço medido em tempo" em dias: a distância até a data em que o planejado marcava o avanço de hoje. A frase abaixo resume: "A obra está em dia / adiantada / atrasada em N pontos percentuais — X% executados contra Y% previstos para dd/mm", e "O avanço de hoje é o que o planejado já marcava em dd/mm: N dias atrás". "Ver os pontos da curva em tabela (N)" abre data, planejado e executado de cada ponto.

Casos: obra sem atividade de vagão mostra "Esta obra ainda não tem atividade planejada"; linha de base que não guardou atividades avisa que não há planejado a desenhar a partir dela.

## Linhas de base da obra
No fim da visão. Uma linha de base é uma fotografia imutável do cronograma dos vagões: número e datas de cada vagão, e datas, local e peso de cada atividade. A Linha de Balanço desta visão e a curva a usam como referência do "prometido".

- **"Definir linha de base"** (planejador, gestor e admin): dê o "Nome da linha de base" e confirme. Cada acionamento cria um registro novo e preserva os anteriores. Exige ao menos um vagão: "Cadastre ao menos um vagão antes de definir a linha de base".
- **"Linhas de base salvas"**: "Linha de base", "Salva em", "Por", "Vagões" (e a partir de qual vagão), "Atividades" e "Período coberto". Reprogramar o planejamento atual nunca altera uma linha de base salva; não há edição nem exclusão por aqui.
- Elas são diferentes das linhas de base do Planejador (fotos dos serviços do plano, na gaveta "Linhas de base" da outra visão). Um fluxo comum: aprovar o plano, gerar os vagões e, em seguida, definir aqui a linha de base dos vagões, para a curva comparar o executado com o aprovado.`,
  },
  {
    id: 'longo-prazo-linha-de-balanco',
    title: 'Linha de Balanço: blocos por serviço e local, arrastar, atrasos, filtros, linhas de base e locais',
    summary:
      'A visão padrão da aba 1 (estilo Prevision): blocos, arrastar e desfazer, filtros e zoom, atrasos, painel do bloco, locais, linhas de base e importar do Planejador.',
    keywords: [
      'linha de balanço',
      'linha de balanco',
      'bloco',
      'atividade',
      'serviço por local',
      'arrastar',
      'desfazer',
      'atrasado',
      'atrasos',
      'previsto até hoje',
      'medido',
      'zoom',
      'semana mês trimestre',
      'tabela',
      'hoje',
      'filtros',
      'locais da obra',
      'linha de base',
      'importar do planejador',
      'exportar csv',
      'término previsto',
      'avanço físico',
      'equipe segue',
      'predecessora',
      'dependência',
    ],
    screen: 'longo-prazo',
    body: `## O que a tela mostra
A visão "Linha de Balanço" é o cronograma de longo prazo da obra no estilo do Prevision. No eixo vertical estão os locais da obra, de baixo para cima (Térreo embaixo); no horizontal, o tempo em semanas, com os meses no alto. Cada bloco é um serviço num local, na cor do serviço: a parte cheia é o que já foi medido e a parte clara é o que falta. Um bloco fica com contorno vermelho quando o previsto até hoje passa do medido em 10 pontos ou mais ("atrasado"). A linha tracejada âmbar é hoje; as linhas azuis com "M1", "M2"… são as datas das medições salvas.

Passe o mouse sobre um bloco para ver serviço, local, início e término, duração em dias úteis, equipe, previsto até hoje e medido. Clique para selecionar: o painel à direita abre com os detalhes.

## Indicadores
No alto: Serviços (com quantos lançamentos e blocos), Locais, Término previsto (e a diferença em dias para a linha de base escolhida no filtro) e Avanço físico (média dos blocos ponderada pela duração de cada um, com o previsto até hoje e quantos blocos estão atrasados).

## Arrastar, desfazer e teclado
- Arraste um bloco para a direita ou para a esquerda para mudar a data de início. As sucessoras (os blocos que dependem dele, inclusive o mesmo serviço no local seguinte) acompanham. Um bloco nunca entra antes do fim das predecessoras mais a espera: puxar para trás só vai até essa folga.
- "Desfazer" (ou Ctrl+Z fora de um campo) volta a última mudança de datas.
- Com um bloco selecionado, as setas esquerda e direita do teclado movem um dia útil. A tecla H (ou o botão "Hoje") leva o gráfico para hoje.
- Perfil de consulta vê o gráfico e não arrasta.

## Filtros, zoom e tabela
- "Serviços", "Locais" e "Período" filtram o que aparece; a legenda embaixo do gráfico também esconde ou mostra um serviço com um clique.
- "Linha de base" sobrepõe em cinza as datas de uma linha de base salva (as automáticas, gravadas antes de cada lançamento, aparecem marcadas).
- Zoom "Semana", "Mês" e "Trimestre" muda a escala do tempo; "Tabela" troca o gráfico por uma lista com local, serviço, início, término, duração, previsto, medido, situação e datas reais, ordenável pelos cabeçalhos.
- "Atrasos" abre a lista dos blocos atrasados (previsto, medido e atraso em dias úteis); clicar num deles seleciona o bloco no gráfico.

## Painel do bloco selecionado
Início e duração (em dias úteis) editáveis, término calculado, equipe e unidade do serviço, observação, as predecessoras ("Depois de", com a espera em dias e a ligação "equipe segue" para o mesmo serviço no local anterior), quantos blocos acompanham ao arrastar, o aviso de atraso com o motivo informado na medição, as datas reais (início real e término real, que a medição preenche e aqui podem ser corrigidas), as fotos da última medição e "Excluir bloco". Um bloco já medido não pode ser excluído.

## Locais, linhas de base e outras ações
- "Lançar fluxo" abre o lançamento de um fluxo de serviços (veja "Lançar um fluxo"). Sem locais cadastrados, a tela pede para cadastrá-los primeiro.
- No menu "⋯": "Locais da obra" (cadastrar em lote, um nome por linha, renomear, reordenar com as setas e excluir; "Usar os locais da obra" traz os locais já importados do Prevision em ordem de altura; um local com blocos não pode ser excluído), "Importar do Planejador" (converte o plano do Planejador em blocos: cada pavimento vira um local e cada serviço × pavimento um bloco; só funciona com a Linha de Balanço ainda sem blocos) e "Exportar CSV".
- "Salvar linha de base" abre a gaveta de linhas de base: criar com nome, "Comparar" (sobrepõe no gráfico), "Restaurar" (volta as datas dos blocos para as da foto) e "Excluir". Antes de cada lançamento de fluxo o sistema grava sozinho a linha de base "Antes do lançamento <data>".
- "Nova medição" leva à visão "Medições".
- A tela avisa quando o banco ainda não tem a migração da Linha de Balanço ("indisponível"): avise o administrador.`,
  },
  {
    id: 'longo-prazo-fluxos-de-servicos',
    title: 'Fluxos de serviços: criar o molde da empresa com serviços, duração por local, equipe, unidade e predecessoras',
    summary:
      'A visão "Fluxos de serviços" (o macrofluxo): lista, editor com rede automática e tabela, dias úteis, predecessoras com espera, salvamento, duplicar, excluir e travas.',
    keywords: [
      'fluxo de serviços',
      'fluxos',
      'macrofluxo',
      'novo fluxo',
      'molde',
      'sequência de serviços',
      'duração por local',
      'dias úteis',
      'depois de',
      'predecessora',
      'espera',
      'antecipação',
      'rede',
      'cor do serviço',
      'equipe',
      'unidade',
      'duplicar fluxo',
      'excluir fluxo',
      'usado em',
      'serviço inicial',
      'ciclo',
    ],
    screen: 'longo-prazo',
    body: `## O que é um fluxo
Um fluxo de serviços é o molde da empresa: a sequência padrão de serviços de um tipo de obra (por exemplo, "Residencial padrão"), com a duração de cada serviço em cada local, a equipe, a unidade de medição e as dependências. Ele não pertence a uma obra: é criado uma vez e lançado em qualquer obra pela visão "Linha de Balanço". Depois de lançado, o fluxo e a obra ficam independentes: mudar o fluxo não mexe nos blocos já lançados.

## A lista
À esquerda ficam os fluxos da empresa, com o número de serviços e em quais obras cada um já foi lançado ("usado em …" ou "nunca lançado"). Clique num fluxo para abrir o editor; "Novo fluxo" cria um com dois serviços de exemplo encadeados para você ajustar.

## O editor
- O nome do fluxo é editado direto no título. A pill ao lado alterna o sentido padrão do lançamento ("Base → topo" ou "Topo → base").
- A rede acima da tabela é desenhada sozinha a partir da coluna "Depois de": cada cartão é um serviço (cor, duração por local e equipe), as setas são as dependências com a espera escrita no meio, e o serviço inicial tem contorno azul. Não há o que arrastar nela.
- Na tabela, cada linha é um serviço: setas para reordenar, nome, cor (clique no quadrado para escolher uma das oito cores), duração por local em dias úteis (segunda a sexta), equipe (com sugestões das equipes cadastradas na obra), unidade e "Depois de": as predecessoras, cada uma com a espera em dias úteis ("+5 d"; pode ser negativa, para antecipar). O "+" na coluna adiciona uma predecessora; só aparecem os serviços que não fechariam um ciclo. Toda dependência é término → início no mesmo local.
- "Adicionar serviço" cria uma linha nova; as ações da linha duplicam ou excluem o serviço.
- "Duplicar" copia o fluxo inteiro ("(cópia)" no nome); "Excluir" apaga o fluxo (as obras onde ele foi lançado não mudam).

## Salvamento
Cada alteração é salva sozinha cerca de um segundo depois; o texto no canto diz "Salvando…", "Salvo às hh:mm", "Não salvo" ou "Somente leitura". Um erro de validação (nome vazio, duração inválida, ciclo) aparece em vermelho e segura o salvamento até ser corrigido, sem perder o que você digitou. "Somente leitura" com aviso de que outra pessoa salvou o fluxo: clique em "Recarregar" para ver a versão atual.

## Quem edita
Planejador, gestor e admin criam, editam e lançam fluxos; o perfil de consulta só vê.

## Quando um fluxo não lança
"Lançar na Linha de Balanço" fica desabilitado, com o motivo, quando o fluxo tem um serviço só, tem mais de um serviço inicial (separe em dois fluxos ou ligue-os) ou tem um ciclo de predecessoras.`,
  },
  {
    id: 'longo-prazo-lancar-fluxo',
    title: 'Lançar um fluxo na Linha de Balanço: locais, data de início, sentido, ritmo e a prévia',
    summary:
      'O diálogo "Lançar fluxo": fluxo e locais, início, sentido (base → topo ou topo → base), ritmo (contínuo, takt, todos juntos), prévia, blocos mantidos e base automática.',
    keywords: [
      'lançar fluxo',
      'lançar na linha de balanço',
      'lançamento',
      'locais marcados',
      'data de início',
      'sentido',
      'base para topo',
      'topo para base',
      'ritmo',
      'contínuo',
      'takt fixo',
      'todos os locais juntos',
      'prévia',
      'blocos mantidos',
      'não duplica',
      'linha de base automática',
      'antes do lançamento',
      'independente',
    ],
    screen: 'longo-prazo',
    body: `## Como lançar
Na visão "Linha de Balanço", clique em "Lançar fluxo" (ou, na visão "Fluxos de serviços", em "Lançar na Linha de Balanço"). O diálogo pede:
- **Fluxo**: um dos fluxos da empresa ("Editar fluxos" leva à outra visão).
- **Locais**: marque, na ordem do cadastro de locais da obra, onde o fluxo entra ("Marcar todos" e "Desmarcar" ajudam). Sem locais cadastrados, cadastre-os antes em "⋯ → Locais da obra".
- **Início**: a data do primeiro serviço no primeiro local (um sábado ou domingo vira a segunda-feira seguinte).
- **Sentido**: "Base → topo" começa pelo local mais baixo; "Topo → base", pelo mais alto.
- **Ritmo**: "Contínuo" (a equipe passa ao próximo local quando termina o anterior, e o serviço vira uma linha reta no gráfico), "Takt fixo de N dias úteis" (cada local começa N dias úteis depois do anterior, como o vagão) ou "Todos os locais juntos".

## A prévia
Antes de confirmar, o diálogo calcula no navegador quantos blocos entram, o primeiro e o último bloco com as datas e a duração em semanas. Dois avisos podem aparecer:
- amarelo: quantos blocos já existiam (o mesmo serviço no mesmo local) e serão mantidos, não duplicados; as sucessoras encaixam neles;
- azul: a obra já tem blocos, então uma linha de base automática "Antes do lançamento <data>" será gravada antes. Desfazer um lançamento é restaurá-la na gaveta de linhas de base.

## Como as datas saem
Para cada serviço, em ordem de precedência, e cada local, no sentido escolhido, o bloco começa na data mais tardia entre: o início pedido, o fim das predecessoras no mesmo local mais a espera, e o ritmo (o fim do mesmo serviço no local anterior, no contínuo). Cada dependência fica gravada no bloco ("Depois de", no painel), inclusive a ligação "equipe segue" do ritmo.

## Depois
"Lançar N blocos" grava tudo e o gráfico mostra os blocos novos. A partir daí o fluxo e a obra ficam independentes: ajuste as datas arrastando os blocos ou pelo painel; mudar o fluxo não altera a obra. Serviço com o mesmo nome já existente na obra é reaproveitado (mesma cor); os demais entram como serviços novos.`,
  },
  {
    id: 'longo-prazo-medicoes-fotograficas',
    title: 'Medições: rodadas com data, realizado acumulado por bloco, foto obrigatória no avanço, motivo do atraso e datas reais',
    summary:
      'A visão "Medições" da aba 1: nova medição, atuais e futuras, previsto e anterior, realizado acumulado, fotos obrigatórias, motivo, salvar, última editável e celular.',
    keywords: [
      'medição',
      'medições',
      'medir',
      'nova medição',
      'realizado acumulado',
      'previsto até a data',
      'medição anterior',
      'igualar ao previsto',
      '100%',
      'foto',
      'fotos',
      'foto obrigatória',
      'avanço sem foto',
      'tirar foto',
      'galeria',
      'motivo do atraso',
      'observação',
      'início real',
      'término real',
      'salvar medição',
      'salvar rascunho',
      'em aberto',
      'só leitura',
      'excluir medição',
      'atuais',
      'futuras',
      'concluídas',
      'celular',
      'avanço físico',
    ],
    screen: 'longo-prazo',
    body: `## O que é uma medição
Uma medição é uma rodada com data em que se lança, para cada bloco da Linha de Balanço, o realizado acumulado em porcentagem. A rodada fica "em aberto" enquanto é preenchida e vira uma medição salva com "Salvar medição". Só pode haver uma rodada em aberto por obra.

## Nova medição
Clique em "Nova medição" e escolha a data: pode ser uma data passada, nunca futura, e não pode ser anterior à última medição salva. A data trava ao salvar; se estiver errada, exclua a medição e lance de novo. Sem blocos na obra, lance um fluxo antes.

## A folha de medição
- Abas: "Atuais" (blocos que começaram até a data e ainda não chegaram a 100%), "Futuras" (começam depois, até 12 meses) e "Concluídas". A busca filtra por serviço ou local.
- Os blocos vêm agrupados por local, do mais alto para o mais baixo; clique no local para abrir ou recolher.
- Em cada linha: o previsto até a data (pela proporção dos dias úteis do bloco), a medição anterior e o campo "Realizado acumulado" com os atalhos "= previsto" e "100%". O acumulado nunca pode ficar abaixo da anterior. O desvio em pontos aparece ao lado (vermelho atrás, verde à frente). O valor é gravado ao sair do campo.
- Início real e término real: o sistema preenche com a data da medição no primeiro avanço acima de zero e ao chegar a 100%; os dois podem ser corrigidos à mão.
- Ações: fotos (com a contagem), observação, motivo do atraso e histórico das medições anteriores daquele bloco.

## Fotos
Todo avanço precisa de foto: se o realizado subiu em relação à anterior, o bloco exige ao menos uma foto nesta rodada, e "Salvar medição" fica desabilitado listando os blocos sem foto. Até 6 fotos por bloco em cada medição. "Tirar foto" abre a câmera traseira no celular; "Galeria" aceita várias de uma vez. A foto é comprimida no aparelho antes de subir e fica guardada com a medição; dá para ampliar e excluir enquanto a rodada pode ser editada.

## Motivo do atraso e observação
Um bloco atrasado (previsto acima do medido) pede o motivo do atraso, escolhido na mesma lista de causas do curto prazo; a observação é texto livre. Os dois ficam na linha de detalhe do bloco.

## Salvar, corrigir e excluir
- "Salvar rascunho" guarda os valores lançados sem fechar; "Salvar medição #N" fecha a rodada e ela passa para a lista com data, blocos, fotos e autor.
- Só a última medição pode ser alterada ou excluída (valores, fotos, motivos); as anteriores ficam só para consulta. Excluir uma medição apaga os lançamentos e as fotos dela.
- O cartão "Avanço físico da obra" mostra o acumulado da obra pelas medições salvas, o previsto até hoje e o desvio.

## No celular
A mesma rodada aberta no computador aparece no celular: um local por vez, escolhido na faixa de cima; cada bloco é um cartão com previsto, anterior, o valor grande com "−" e "+" (de 5 em 5), os atalhos, "Tirar foto" e "Galeria". Avanço sem foto fica destacado e não deixa salvar. Sem sinal ainda não funciona: é preciso conexão para lançar e enviar fotos.

## Quem mede
Planejador, gestor e admin medem; o perfil de consulta vê as medições e as fotos, mas não lança.`,
  },
  {
    id: 'longo-prazo-gantt-legalizacao',
    title: 'Gantt de legalização: os 12 meses até a entrega, com o caminho crítico da obra e a legalização por órgão',
    summary:
      'A visão "Gantt de legalização" da aba 1: criar pela entrega, modelo ATR, resumo do topo, caminho crítico, alterar entrega e trazer da Linha de Balanço.',
    keywords: [
      'gantt de legalização',
      'legalização',
      'terminalização',
      'habite-se',
      'avcb',
      'corpo de bombeiros',
      'concessionárias',
      'cartório',
      'cnd da obra',
      'entrega das chaves',
      'entrega contratual',
      'entrega prevista',
      'alterar entrega',
      'modelo atr',
      'janela de 12 meses',
      'caminho crítico da obra',
      'trazer da linha de balanço',
      'linhas lb',
    ],
    screen: 'longo-prazo',
    body: `## Para que serve
A visão "Gantt de legalização" (barra de visões da aba 1, depois de "Medições") é o cronograma dos 12 meses até a entrega da obra: o caminho crítico da obra e a legalização por órgão até as chaves. Responde se a entrega cabe na data prometida ao cliente e, se não cabe, que cadeia de tarefas a empurra. Um Gantt por obra, vivo até a entrega (não há um por mês).

## É o mesmo cronograma do médio prazo
Tabela e Gantt no padrão do MS Project, com o mesmo cálculo, linha de base, desfazer, "Informações da tarefa" e "Exportar para o Project (.xml)" da aba 3: o que o manual do médio prazo diz sobre editar a grade, predecessoras, restrições e prazo final vale aqui. Muda: o horizonte é a janela de 12 meses antes da entrega (entrega em 30/09/2027 dá 01/10/2026 a 30/09/2027), sombreada no Gantt; o zoom abre em meses; a coluna "Folga total" vem à mostra. Tarefa que começa antes da janela (projeto de incêndio, aprovação na concessionária) continua no cálculo; o filtro "Fora da janela" mostra quais.

## Criar o Gantt
Obra sem Gantt mostra o botão "Criar Gantt de legalização" (o perfil de consulta não o vê). O diálogo pede:
- **"Entrega contratual"**: a data prometida ao cliente, sem a tolerância de 180 dias do contrato. Ela vira o "Prazo final" do marco "Entrega das chaves", e logo abaixo aparece a "Janela" que ela abre.
- **"Partir de"**: "Modelo ATR de legalização" (abaixo) ou "Em branco", só com o marco "Entrega das chaves" e o prazo final.
- **"Linha de Balanço"**: caixa que vem marcada; com ela, o botão vira "Criar e revisar a Linha de Balanço" e a lista do "Trazer da Linha de Balanço" abre logo depois.
- **"Prévia"** (primeira tarefa, entrega prevista, críticas) e "Nome (opcional)".
Um segundo Gantt na obra é recusado ("Esta obra já tem um Gantt de legalização").

## O modelo ATR
São 38 linhas em dois grupos, mais o marco final:
- **"Caminho crítico da obra"**: alvenaria e contrapiso dos últimos pavimentos, instalações, fachada, sistema de incêndio, elevadores, acabamentos internos, áreas comuns, limpeza final, vistoria interna de terminalidade e vistoria com os clientes.
- **"Legalização"**, com um grupo por órgão: Corpo de Bombeiros (laudos, protocolo, vistoria e AVCB), Concessionárias (energia, água e esgoto, gás e licença dos elevadores), Prefeitura (documentos, protocolo, vistoria e Habite-se), Receita Federal (aferição e CND da obra) e Cartório e condomínio (averbação, instituição do condomínio, assembleia de instalação e manuais do proprietário).
- **"Entrega das chaves"**, o marco que carrega o prazo final.
As esperas de órgão estão em dias corridos. O modelo é montado de trás para frente: as tarefas sem predecessora ganham "Não iniciar antes de" calculado para a rede terminar na entrega (ou no dia útil anterior); daí em diante o cálculo anda para a frente, como no Project. As durações são ponto de partida: revise-as com a equipe. Depois de criado, o Gantt é seu, e mudar o modelo não mexe nele.
Para ver tudo de um órgão, expanda o grupo dele. O responsável vai em "Nomes dos recursos", com as equipes da obra (cadastre despachante e projetista de incêndio como equipes nas Configurações da obra).

## O resumo do topo e o caminho crítico
Acima do cronograma ficam cinco números: "Entrega contratual"; "Entrega prevista", com os dias úteis depois ou antes do prazo; "Caminho crítico", com as tarefas críticas e a folga do marco da entrega; "Marcos de legalização" cumpridos; e "Próximo marco", que seleciona a tarefa ao ser clicado. Marco de legalização é toda tarefa de duração zero dentro do grupo "Legalização" (AVCB emitido, Habite-se emitido, CND da obra emitida…); cumprido é o que está em 100%. Não renomeie os grupos "Legalização" e "Caminho crítico da obra": o resumo e o "Trazer da Linha de Balanço" os acham pelo nome.
O caminho crítico vem ligado. Crítica é a tarefa com folga total menor ou igual a zero, como no Project. O prazo final não segura a data: quando a rede passa da entrega contratual, o marco fica vermelho, a folga fica negativa e a cadeia inteira que atrasa aparece com a mesma folga negativa. Aí surge o aviso vermelho "A entrega prevista passa N dias úteis do prazo. O que empurra: …", com a cadeia de tarefas (clique num nome para selecioná-la); ele some quando a entrega prevista volta para dentro do prazo. Para recuperar a data, encurte ou ponha em paralelo uma tarefa dessa cadeia, ou revise um vínculo.

## Alterar a entrega
"Alterar entrega", no cabeçalho do cronograma, troca a data contratual (e o nome, se quiser) e grava na hora com "Salvar entrega", sem passar pelo rascunho. A janela anda junto, e o prazo final que estava na entrega antiga passa para a nova; outros prazos finais ficam. As tarefas não mudam de data: a folga passa a contar até o novo prazo. Com rascunho aberto o botão trava: salve ou descarte antes.

## Trazer da Linha de Balanço
"Trazer da Linha de Balanço" (barra de ferramentas) lista os serviços da visão "Linha de Balanço": "Locais", "Início (1º local)", "Término (último)", "% medido" (última medição salva) e "No Gantt" (linha nova, atualiza a linha LB ou fora da janela). Vêm marcados os que tocam a janela; "Trazer N linhas" confirma. Cada um vira uma linha no fim do grupo "Caminho crítico da obra", com o indicador LB, "Não iniciar antes de" no início da Linha de Balanço, duração em dias úteis e o % medido, sem vínculo: ligue-as às sucessoras (por exemplo, à "Limpeza final") e, se cobrirem "Acabamentos internos dos apartamentos", apague a do modelo.
Tudo entra no rascunho: nada é gravado antes de "Revisar e salvar". Trazer de novo atualiza só início, duração e % das linhas LB; nome, vínculos e as outras linhas ficam. A Linha de Balanço não mexe no Gantt sozinha: ele só muda quando você traz de novo.

## Salvar e linha de base
Como no médio prazo: a grade abre bloqueada ("Liberar edição"), toda edição fica em rascunho, "Revisar e salvar" pede o motivo e "Definir linha de base" congela as datas gravadas, só quando você clicar.

## Quem vê e quem edita
Quem tem a aba 1 (módulo "Longo prazo") vê o Gantt, sem precisar do médio prazo. Planejador, gestor e admin criam, alteram a entrega, trazem da Linha de Balanço, salvam e definem linha de base; o perfil de consulta só vê.

## Onde ele não aparece
Nesta etapa o Gantt de legalização fica só na aba 1. Não entra na lista de cronogramas do mês do médio prazo, em "Próximos 90 dias", em "Cobertura", na carga das equipes ("Equipes" e "Recursos"), na seção "Linha de base" do médio prazo, no quadro do médio prazo do dashboard nem nas respostas da assistente de IA, que não lê as tarefas dele. Ainda não há PDF do Gantt nem anexo do documento emitido (AVCB, Habite-se); para imprimir, exporte o .xml e abra no Project.`,
  },
];

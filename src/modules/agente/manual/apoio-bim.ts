import type { ManualSection } from './types';

/** Manual das duas telas de BIM do grupo Apoio (29/10/2026): "Arquivos IFC" (repositório, envio,
 * quantitativo e visualizador) e "Modelo federado" (composição e exploração da cena). Escrito a partir
 * do código das telas e dos tours "Como usar"; descreve só o que está implementado. */
export const sections: ManualSection[] = [
  {
    id: 'ifc-visao-geral',
    title: 'Arquivos IFC: para que serve e como a tela está organizada',
    summary: 'O que é o repositório de modelos IFC da obra, o que cada painel e coluna mostra, como funcionam as versões e quem pode usar.',
    keywords: [
      'arquivos ifc',
      'ifc',
      'modelo bim',
      'modelo 3d',
      'repositório de modelos',
      'versões',
      'versão atual',
      'histórico',
      'disciplina',
      'quem pode',
      'não vejo a aba',
      'módulo liberado',
      'excluir modelo',
      'apagar versão',
    ],
    screen: 'ifc',
    body: `## Para que serve
A tela "Arquivos IFC" é o repositório dos modelos BIM da obra em formato IFC. Fica no grupo "Apoio" da lateral da obra (o endereço termina em /ifc). Cada disciplina (arquitetura, estrutura, instalações…) é um modelo, e cada envio de arquivo é uma versão desse modelo. Daqui saem os dados que o "Quantitativo" soma, a geometria que o "Visualizador" desenha e as versões que o "Modelo federado" combina.

O sistema trata o IFC como uma base de dados, não como um desenho. No envio, o arquivo é lido no seu navegador e dividido em duas metades: os dados (elementos, propriedades e quantidades) viram tabelas de consulta, e a geometria é convertida para um formato compacto que o 3D abre direto. As duas metades se ligam pelo GlobalId de cada elemento. Depois do envio, nenhuma tela relê o arquivo .ifc.

## Como a tela está organizada
- **Cabeçalho**: código e nome da obra, o "?" de "Como funciona: arquivos IFC", o botão "Modelo federado" (abre a outra tela) e, no canto, "Como usar", que percorre cada botão da tela.
- **Cartões de resumo**: "Modelos cadastrados", "Versões enviadas", "Pavimentos distintos", "Elementos na versão atual", "Com geometria 3D" (fica em alerta quando alguma versão está sem 3D) e "Com .ifc original guardado".
- **"Modelos e versões"**: um bloco por modelo, com nome, disciplina, "Renomear", o selo "Versão atual vN · N pavimentos" e a tabela de versões com as colunas "Versão" (versão atual ou histórico), "Arquivo", "Arquivo original" (tamanho e "baixar arquivo" ou "arquivo não guardado"), "Pavimentos lidos", "Elementos", "Transcrição e 3D" ("N linhas" e "geometria 3D · tamanho" ou "sem geometria 3D"), "Enviado por" e "Quando". Abaixo da tabela fica o envio de nova versão.
- **"Quantitativo"** e **"Visualizador"**: painéis próprios, descritos em outras seções deste manual.

## Versões: nada é apagado
Cada envio empilha uma versão nova (v1, v2, v3…). A mais recente é a "versão atual"; as anteriores ficam como "histórico", disponíveis no quantitativo, no visualizador e no federado. Nenhuma versão é substituída ou excluída, e não existe botão para apagar modelo ou versão. Para corrigir um nome, use "Renomear"; para corrigir um arquivo, envie uma versão nova.

## Quem vê e quem pode
- O módulo está em desenvolvimento: o item "Arquivos IFC" só aparece na lateral para administradores, desenvolvedores e pessoas com o módulo liberado. O administrador libera por pessoa em "Configurações" (fora da obra), na grade de usuários, visão "Módulos", clicando na célula. Sem liberação, o item não aparece e o endereço digitado volta para o Curto prazo da obra.
- Dentro do módulo, o perfil de consulta vê os modelos, usa o quantitativo e o visualizador e baixa o arquivo guardado, mas não vê "Cadastrar modelo", "Renomear" nem "Enviar nova versão". Planejador, gestor e administrador fazem tudo isso, sempre só nas obras liberadas para eles.`,
  },
  {
    id: 'ifc-enviar-versao',
    title: 'Enviar, renomear e baixar modelos IFC',
    summary:
      'Passo a passo para cadastrar um modelo, enviar uma versão, guardar ou não o .ifc original, renomear, baixar e resolver erros do envio.',
    keywords: [
      'enviar ifc',
      'enviar nova versão',
      'upload ifc',
      'cadastrar modelo',
      'guardar arquivo original',
      'storage',
      '50 mb',
      'renomear modelo',
      'baixar arquivo',
      'download ifc',
      'envio demorou',
      'envio falhou',
      'sem geometria 3d',
      'transcrição',
      'arquivo não guardado',
    ],
    screen: 'ifc',
    body: `## Cadastrar um modelo
- Clique em "Cadastrar modelo", no canto do painel "Modelos e versões". Abre uma gaveta com "Nome do modelo" e "Disciplina (arquitetura, estrutura, instalações…)"; confirme em "Cadastrar modelo" ou saia em "Cancelar".
- Os dois campos são obrigatórios. Nome repetido na mesma obra (maiúsculas ignoradas) dá "Modelo já cadastrado nesta obra.".
- O arquivo não entra aqui: ele é enviado depois, na linha do modelo. Para outra disciplina, cadastre outro modelo.

## Enviar uma versão
Na linha do modelo: escolha o arquivo (só .ifc), decida sobre a caixa "Guardar também o arquivo original no Storage" e clique em "Enviar nova versão". Vale para o primeiro envio e para cada revisão: todo envio cria a versão seguinte e nenhuma anterior é apagada.

O envio acontece no seu navegador, em etapas mostradas em azul:
- "Lendo o modelo neste navegador…": extração de elementos, propriedades e quantidades.
- "O arquivo original: enviando…" (só com a caixa marcada).
- "Registrando versão…" e "Gravando N de M linhas… %": os dados viram tabelas, em lotes.
- "Convertendo a geometria…" e "Registrando a geometria convertida…": a malha 3D é convertida e guardada.
No fim aparece "Envio de [modelo] concluído." e o resumo verde "Versão registrada · N pavimentos, N elementos e N linhas transcritas · geometria 3D convertida em X · arquivo original guardado no Storage".

**Tempo e tamanho**: um modelo grande leva alguns minutos no seu computador; mantenha a aba aberta e não troque de página até o resumo aparecer. A geometria convertida é bem menor que o IFC (um arquivo de 217 MB virou 15 MB).

## Guardar o original: opcional, e por quê
Nem o planejamento nem o 3D dependem do arquivo .ifc; guardá-lo serve só para "baixar arquivo" depois. O limite por arquivo do Storage é de 50 MB no plano gratuito, e um IFC de obra costuma passar disso. Se a caixa estiver marcada e o arquivo não couber, a versão é registrada mesmo assim, com o aviso "…o arquivo original não coube no Storage e a versão ficou sem anexo." e "arquivo não guardado" na tabela. Deixe a caixa desmarcada quando não precisar do arquivo de volta.

## Renomear o modelo
"Renomear", abaixo do nome do modelo, abre a gaveta com "Nome do modelo" e "Disciplina"; "Salvar" aplica. A mudança vale em todas as versões e nas composições do federado; a coluna "Arquivo" mantém o nome do .ifc enviado. Até 120 caracteres e sem repetir outro modelo da obra ("Já existe um modelo com esse nome nesta obra."). Disponível para planejador, gestor e administrador.

## Baixar o arquivo
Na coluna "Arquivo original", "baixar arquivo" gera um link na hora (válido por dois minutos) e inicia o download. Só existe para versões com o original guardado.

## Erros e avisos do envio
- "O repositório transcreve apenas modelos IFC.": o arquivo não termina em .ifc.
- "Arquivo vazio.": arquivo com zero bytes.
- "Não foi possível ler o IFC: …": arquivo corrompido ou ilegível; exporte de novo no software de projeto.
- "… A versão foi registrada, mas a transcrição parou em N de M linhas.": a conexão falhou no meio da gravação; envie o arquivo de novo (vira uma versão nova).
- "…a versão ficou sem geometria 3D: reenvie esta versão…": a conversão falhou, em geral por falta de memória do navegador em modelo grande. O quantitativo funciona; o visualizador não. Reenvie o mesmo arquivo com as outras abas fechadas.
- Fechou a aba no meio: a versão pode ter ficado "não transcrita" ou "sem geometria 3D" na coluna "Transcrição e 3D"; reenvie.`,
  },
  {
    id: 'ifc-quantitativo',
    title: 'Quantitativo do modelo IFC',
    summary:
      'Como ler as quantidades somadas, a distribuição por classe e pavimento, a consulta elemento a elemento e a exportação em CSV.',
    keywords: [
      'quantitativo',
      'quantidades',
      'área',
      'volume',
      'exportar csv',
      'planilha',
      'elementos por classe',
      'elementos por pavimento',
      'consulta de elementos',
      'globalid',
      'classe ifc',
      'filtrar pavimento',
      'sem informação',
      'itens',
    ],
    screen: 'ifc',
    body: `## O que é
O painel "Quantitativo", na tela "Arquivos IFC", mostra as quantidades que o projetista declarou no modelo (área, volume, comprimento, contagem, peso), somadas sobre a versão inteira. A soma é feita no servidor, sobre todas as linhas transcritas no envio, e não só sobre o que aparece na página. Ele existe para substituir a planilha de quantitativo montada à mão a partir do modelo.

## Escolher modelo e versão
- "Modelo": lista com nome e disciplina. "Versão": "vN · arquivo", com a mais recente marcada como "versão atual". Ao trocar de modelo, a versão volta para a atual dele.
- Enquanto soma, aparece "Somando as quantidades do modelo…".
- Cartões: "Elementos transcritos", "Classes IFC distintas" e "Pavimentos distintos" (sem contar elementos sem pavimento).

## "Quantidades do modelo"
Tabela com "Quantidade" (o nome que veio no arquivo, como NetVolume ou GrossArea), "Tipo" (Área, Volume, Comprimento, Contagem, Peso ou Tempo), "Unidade", "Total" e "Itens" (quantos elementos compõem a soma). Cada linha é uma combinação de nome e tipo.

"Exportar CSV" baixa a tabela como quantitativo-[modelo]-vN.csv, no formato da planilha da obra: separador ";", vírgula decimal e acentos preservados no Excel.

Se aparecer "Os elementos foram transcritos, mas nenhuma quantidade (área, volume, comprimento…) veio declarada no arquivo", o IFC saiu do software de projeto sem quantidades. O sistema não calcula quantidades pela geometria: só soma o que o arquivo declara. Peça a exportação com as quantidades incluídas e envie uma versão nova.

## Distribuição dos elementos
- "Elementos por classe IFC": coluna "Elemento" com o nome no vocabulário da obra (Parede, Laje, Viga, Pilar, Fundação, Porta, Janela, Escada, Cobertura, Forro, Armadura, Instalações, Mobiliário, Ambiente, Genérico) e a classe IFC original logo abaixo; "Elementos" e "Participação" em %.
- "Elementos por pavimento": o mesmo, por pavimento.
- Elemento sem pavimento na estrutura do arquivo aparece como "Sem informação", com um aviso amarelo, e fica fora de qualquer filtro por pavimento.

## "Consulta de elementos"
- Lista elemento a elemento, 500 por página: "Express ID", "GlobalId", "Classe IFC" (nome traduzido e classe original), "Nome", "Tipo" e "Pavimento".
- Filtros "Pavimento" ("Todos os pavimentos" ou um) e "Classe IFC" ("Todas as classes" ou uma, como "Parede · IFCWALL"). Trocar o filtro volta à primeira página; "Limpar filtros" aparece quando há filtro ativo.
- Rodapé: "Mostrando X a Y de Z · página A de B", com "Anterior" e "Próxima".
- "Exportar esta página (CSV)" baixa só a página que está na tela, já filtrada, como elementos-[modelo]-vN-pagina-N.csv. Não existe exportação de todos os elementos de uma vez.

## Mensagens comuns
- "Esta versão ainda não foi transcrita para as tabelas de consulta…": a versão existe, mas o envio não gravou as tabelas; reenvie o IFC no painel de modelos.
- "Nenhum modelo cadastrado nesta obra" ou "Este modelo ainda não tem versão enviada": cadastre o modelo e envie um arquivo primeiro.
- "Nenhum elemento com esse filtro nesta versão.": a combinação de pavimento e classe não tem resultado; use "Limpar filtros".`,
  },
  {
    id: 'ifc-visualizador',
    title: 'Visualizador 3D e seccionamento do modelo IFC',
    summary:
      'Carregar a geometria de uma versão, colorir, recortar, seccionar, clicar num elemento e o que fazer quando o modelo não aparece.',
    keywords: [
      'visualizador',
      '3d',
      'carregar geometria',
      'modelo não aparece',
      'cor por pavimento',
      'cor por classe',
      'recorte por pavimento',
      'isolar pavimento',
      'clicar elemento',
      'globalid',
      'seccionamento',
      'corte',
      'inverter lado',
      'webgl',
      'sem geometria',
    ],
    screen: 'ifc',
    body: `## O que é
O painel "Visualizador", na tela "Arquivos IFC", desenha uma versão de um modelo em 3D. Ele abre a geometria convertida no envio, e não o arquivo .ifc: por isso abre modelos de qualquer tamanho e só baixa a malha quando você pede. A classe, o nome e o pavimento de cada peça vêm das tabelas transcritas, ligadas à malha pelo GlobalId. Precisa de um navegador com WebGL.

## Carregar uma versão
- Escolha em "Versão do modelo" (lista "Modelo · vN · arquivo") e clique em "Carregar geometria". Trocar a versão na lista não muda a cena até clicar; depois do primeiro carregamento o botão vira "Recarregar geometria".
- Cartões: "Elementos desenhados", "Pavimentos", "Classes IFC distintas" e "Versão" (número, arquivo e data de envio). A linha "N elementos transcritos não têm par na geometria convertida e ficaram fora da cena" é normal: são espaços, anotações e agrupamentos sem malha.

## Navegar, colorir e recortar
- Arraste para orbitar, use a roda para aproximar e clique numa peça para selecioná-la (fica em âmbar).
- "Cor dos elementos": "Por pavimento" ou "Por classe IFC". A "Legenda" abaixo da cena mostra a cor de cada grupo e quantos elementos ele tem; "Sem pavimento" e "Sem classe IFC" ficam em cinza.
- "Recorte por pavimento": "Todos os pavimentos" ou um só; disponível depois de carregar.

## Elemento selecionado
O quadro "Elemento selecionado" mostra a classe IFC, o "Name", o "GlobalId" e o "Pavimento" da peça clicada; "Limpar seleção" devolve a cor do grupo. "Item sem linha transcrita" significa que a peça existe na malha, mas não na tabela desta versão.

## "Seccionamento"
- Marque "Ativar corte", escolha a "Orientação" ("Horizontal · Y" corta em altura; "Vertical · X" ou "Vertical · Z" cortam em planta) e ajuste a "Posição do corte" de 0 a 100% pela barra ou pelo campo. A posição é relativa à caixa de toda a geometria carregada.
- Por padrão fica visível o lado menor do eixo; "Inverter lado" troca a metade visível. "Remover corte" volta ao modelo inteiro.
- O corte combina com o recorte por pavimento. Ajustar o plano limpa a seleção, e o clique ignora o que está além do plano.
- É temporário: não altera arquivo, quantitativo nem nada salvo, e recomeça ao carregar outra versão. Não fecha as faces cortadas nem gera desenho de seção. Sem geometria carregada, o controle fica desabilitado com "Carregue a geometria para seccionar o modelo.".

## O modelo não aparece: avisos e o que fazer
- Erro ao carregar e o aviso "Os dados transcritos desta versão continuam valendo…; o que falta aqui é a geometria 3D": a versão foi transcrita, mas não convertida (na tabela de versões ela mostra "sem geometria 3D"). Reenvie o mesmo .ifc no modelo: a versão nova terá a geometria.
- "A geometria desta versão abriu, mas ela não tem nenhum elemento transcrito": só a malha existe; sem tabela não há cor, recorte nem dados no clique. Reenvie.
- "Nenhum dos N elementos transcritos foi encontrado na geometria convertida": tabela e malha vieram de arquivos diferentes. Reenvie o modelo para refazer as duas metades do mesmo arquivo.
- "Este navegador não tem WebGL disponível": troque de navegador ou ative a aceleração gráfica; a tabela de modelos e o quantitativo continuam funcionando.
- Cena vazia ou com pouca coisa: confira se um pavimento está recortado ("Todos os pavimentos") ou se há corte ativo ("Remover corte").
- "Nenhuma versão armazenada nesta obra": envie um IFC em algum modelo primeiro.`,
  },
  {
    id: 'federacao-montar-conjunto',
    title: 'Modelo federado: montar, carregar e salvar composições',
    summary:
      'Para que serve o federado, como escolher uma versão de cada modelo, carregar o conjunto e abrir ou salvar composições; quem pode.',
    keywords: [
      'modelo federado',
      'federar',
      'federação',
      'conjunto',
      'carregar conjunto',
      'aplicar seleção ao 3d',
      'composição',
      'composições salvas',
      'salvar composição',
      'abrir composição',
      'selecionar disponíveis',
      'escolher versão',
      'dados pendentes',
      'geometria pendente',
      'compatibilização',
    ],
    screen: 'federacao',
    body: `## Para que serve
A tela "Modelo federado" reúne versões de vários modelos IFC da obra (arquitetura, estrutura, instalações…) numa mesma cena 3D, para a análise virtual dos projetos: disciplinas sobrepostas, isoladas ou cortadas, com consulta de peças. Fica no grupo "Apoio" da lateral (o endereço termina em /federacao). Ela depende de "Arquivos IFC": só entra na cena uma versão que já tem dados transcritos e geometria 3D. O botão "Arquivos IFC" do cabeçalho leva para lá.

## Quem vê e quem pode
Módulo em desenvolvimento: aparece para administradores, desenvolvedores e pessoas com "Modelo federado" liberado em "Configurações" (liberação separada da de "Arquivos IFC"). O perfil de consulta monta, carrega e explora o conjunto e abre composições salvas, mas não salva: no lugar do formulário aparece "Seu perfil permite consultar e explorar as composições salvas.". Planejador, gestor e administrador salvam.

## Montar o conjunto
- O painel "Modelos do conjunto" lista os modelos da obra, com o contador "incluídos/total". Ao abrir a tela, todo modelo que tem versão já vem marcado na versão mais recente.
- A caixa de cada modelo o inclui ou tira do conjunto; incluído, o campo "Versão" ("vN · arquivo") escolhe qual revisão entra. Ao desmarcar e marcar de novo, o modelo volta na versão que tinha.
- A linha informa o estado da versão escolhida: "Pronto para carregar", "Dados pendentes" (envio sem tabelas) ou "Geometria pendente" (envio sem 3D). Fora do conjunto, mostra "Fora do conjunto" ou "Nenhuma versão enviada".
- "Buscar modelo ou disciplina" filtra a lista sem diferenciar acentos; "Somente selecionados" esconde os que estão fora; "Limpar filtros" restaura a lista. Buscar não altera a seleção.
- "Selecionar disponíveis" inclui cada modelo na versão mais recente que já tem dados e geometria (pode ser uma anterior). "Limpar seleção" tira todos.

## Carregar
- O aviso acima do botão diz o que falta: "Inclua ao menos um modelo.", "N modelo(s) selecionado(s) precisam de dados ou geometria." ou "N modelo(s) pronto(s) para carregar.". Se a disponibilidade não pôde ser consultada, use "Consultar novamente".
- "Carregar conjunto" só libera quando todos os selecionados estão prontos. Durante a carga vira "Carregando conjunto…" e, depois da primeira, "Aplicar seleção ao 3D". A cena só muda ao clicar; se você mexer na seleção depois, aparece "A seleção foi alterada. Aplique a seleção ao 3D para atualizar as versões da cena.".
- Se a geometria de um modelo falhar, a carga inteira para e o erro aparece; não há carregamento parcial.

## Composições salvas
- A área recolhível "Composições salvas" mostra, à direita, o nome da composição aberta ou "N composições · Abrir / salvar".
- "Abrir uma composição" (lista "nome · data") restaura os modelos e as versões guardados e avisa "Composição aberta. Use Carregar conjunto para exibir estas versões.". Se alguma versão não existir mais: "N versão(ões) da composição não estão disponíveis. Confira a seleção antes de carregar ou salvar uma cópia.".
- "Salvar a seleção atual": digite o "Nome da composição" (até 120 caracteres) e clique em "Salvar nova composição". Cada salvamento cria uma composição nova, com as versões escolhidas agora fixas; novos envios de IFC não mudam composições já salvas, e não há editar, sobrescrever ou excluir. A confirmação diz "As versões selecionadas ficaram fixas nesta cópia.". Regras: de 1 a 200 modelos, uma versão por modelo.
- A composição guarda só o conjunto de versões e é vista por todos com acesso à obra. Cores, pavimento, corte, visibilidade e câmera não são salvos. Renomear um modelo em "Arquivos IFC" atualiza o nome mostrado nas composições.`,
  },
  {
    id: 'federacao-explorar-cena',
    title: 'Modelo federado: explorar a cena, cores, busca e limites',
    summary: 'Cores, opacidade, ocultar e isolar modelos, corte, busca de elementos, inspeção da peça e o que o federado não faz.',
    keywords: [
      'explorar o conjunto',
      'cor por modelo',
      'cor do ifc',
      'escolher cor',
      'opacidade',
      'transparente',
      'ocultar modelo',
      'isolar',
      'mostrar tudo',
      'enquadrar',
      'seccionamento',
      'corte',
      'buscar elementos',
      'interferência',
      '4d',
    ],
    screen: 'federacao',
    body: `## A cena
O painel "Explorar o conjunto" mostra a cena e, no selo do canto, o estado: "Aguardando seleção", "Carregando", "Conjunto carregado", "Falha na visualização" ou "WebGL indisponível". Arraste para orbitar, role para aproximar e clique numa peça para selecioná-la (fica em âmbar).

## Controles acima da cena
- "Cores": "Por modelo" (cor fixa por modelo, a mesma em todas as versões dele), "Por pavimento" ou "Por classe IFC" (cor do grupo, igual em todos os modelos). Nesses dois casos, a "Legenda do conjunto completo", no rodapé, lista a cor e a quantidade de cada grupo, contando também modelos ocultos.
- "Pavimento": mostra só o pavimento escolhido em todos os modelos. A comparação é pelo nome exato: "Pav 1" e "1º Pavimento" são pavimentos diferentes; não há padronização entre arquivos.
- "Enquadrar" encaixa a câmera no conjunto. "Mostrar tudo" reexibe modelos ocultos e desfaz pavimento, corte e seleção.
- "Seccionamento": o mesmo controle do visualizador de "Arquivos IFC" ("Ativar corte", "Orientação", "Posição do corte", "Inverter lado", "Remover corte"); um único plano atravessa todos os modelos.
- Quando algo esconde parte do conjunto, a faixa amarela resume ("N modelo(s) oculto(s) · Pavimento: X · Corte Y: 50%") e "Limpar recorte" desfaz tudo de uma vez.

## "Modelos em cena"
- Na aba "Modelos em cena (N)", cada modelo tem o olho (ocultar ou mostrar), o estado "Visível" ou "Oculto", o botão de paleta "Cor e opacidade" e "Isolar", que esconde os outros.
- "Cor e opacidade" abre a aparência do modelo: "Cor padrão" (a cor do sistema para ele), "Cor do IFC" (as cores originais do arquivo) ou "Escolher cor" (uma cor para o modelo inteiro); "Opacidade" de 10% a 100%, de 5 em 5; "Voltar ao padrão" desfaz. A cor só aparece na pintura "Por modelo" (a tela avisa); a opacidade vale em qualquer pintura. A escolha fica guardada no seu navegador: outro computador ou outra pessoa não a vê, e ela não entra na composição salva.

## "Buscar elementos"
Na aba "Buscar elementos", digite em "Nome, classe ou GlobalId" (também encontra por pavimento e nome do modelo; várias palavras se combinam; acentos são ignorados). A busca só olha modelos e pavimentos visíveis e mostra até 50 resultados ("refine a busca" quando há mais). Clicar num resultado seleciona a peça no 3D. Com corte ativo, um aviso lembra que a busca inclui peças além do plano. Peças sem linha transcrita só são encontradas pelo clique.

## "Elemento selecionado"
O quadro ao lado mostra "Modelo / versão", "Classe IFC", "Pavimento" e "GlobalId" da peça escolhida no 3D ou na busca ("Sem dados transcritos" quando não há linha na tabela); o X limpa a seleção. No rodapé, "N registros com GlobalId não foram relacionados à geometria" conta elementos sem malha; é normal.

## Limites: o que o federado não faz
- Não detecta interferências (clash) nem compara revisões.
- Não ajusta coordenadas: cada modelo fica onde o arquivo o posicionou. Modelos desalinhados precisam ser corrigidos no software de projeto.
- Não lê os sistemas internos do IFC; a disciplina é só o texto cadastrado.
- Cores, opacidade, pavimento, corte, visibilidade e câmera são exploração da sessão; só a seleção de versões é salva.
- Não existe BIM 4D: a simulação do cronograma sobre o modelo foi cancelada em 02/10/2026.

## Perguntas frequentes
- "Não foi possível atualizar a visualização. Recarregue o conjunto.": clique em "Aplicar seleção ao 3D".
- "WebGL não está disponível": a cena não desenha, mas montar e salvar composições continua funcionando.
- A cena ficou vazia: veja a faixa amarela e use "Limpar recorte" ou "Mostrar tudo".`,
  },
];

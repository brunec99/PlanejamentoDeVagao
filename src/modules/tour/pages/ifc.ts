import type { TourStep } from '../tours';

export const steps: TourStep[] = [
  {
    title: 'Arquivos IFC',
    body: 'Os modelos IFC da obra, versão a versão. No envio, o arquivo é lido neste navegador: os dados viram tabelas de consulta e a geometria é convertida para o visualizador 3D, as duas ligadas pelo GlobalId.',
  },
  {
    target: 'ifc-help',
    title: 'Como funciona',
    body: 'Abre a explicação completa da tela: o que o envio grava, por que o .ifc original é opcional e como as versões se acumulam. O Quantitativo e o Visualizador têm o próprio botão de ajuda.',
  },
  {
    target: 'ifc-federation-link',
    title: 'Ir ao modelo federado',
    body: 'Abre o Modelo federado, onde as versões dos modelos desta obra se juntam numa mesma cena 3D.',
  },
  {
    target: 'ifc-stats',
    title: 'Resumo dos modelos',
    body: 'Modelos cadastrados, versões enviadas, pavimentos e elementos da versão atual de cada modelo, quantas versões têm geometria 3D e quantas guardaram o .ifc original. O número da geometria fica em alerta quando alguma versão está sem 3D.',
  },
  {
    target: 'ifc-models',
    title: 'Modelos e versões',
    body: 'Um modelo por disciplina. Cada linha da tabela é uma versão: arquivo, tamanho, pavimentos lidos, elementos, linhas transcritas e se tem geometria 3D. A mais recente é a atual; as anteriores ficam como histórico, nunca substituídas.',
  },
  {
    target: 'ifc-create-model',
    title: 'Cadastrar modelo',
    body: 'Abre o cadastro com o nome do modelo e a disciplina (arquitetura, estrutura, instalações…). O arquivo IFC é enviado depois, na linha do próprio modelo.',
  },
  {
    target: 'ifc-rename',
    title: 'Renomear modelo',
    body: 'Corrige o nome e a disciplina do modelo. A mudança vale para todas as versões e composições salvas; os arquivos já enviados não mudam.',
  },
  {
    target: 'ifc-download',
    title: 'Baixar o original',
    body: 'Aparece quando a versão guardou o .ifc original e baixa o arquivo por um link gerado na hora. Sem o original, a linha avisa "arquivo não guardado" e a versão segue completa pelas tabelas e pela geometria.',
  },
  {
    target: 'ifc-upload',
    title: 'Enviar nova versão',
    body: 'Escolha o .ifc e envie: o navegador lê o modelo, grava os dados e converte a geometria, o que pode levar minutos, então mantenha a aba aberta. Marque guardar o original só se precisar baixá-lo depois; se passar do limite do Storage, a versão segue sem ele.',
  },
  {
    target: 'ifc-quantitativo',
    title: 'Quantitativo',
    body: 'As quantidades declaradas no modelo, somadas no banco sobre a versão inteira, com a distribuição dos elementos e a consulta elemento a elemento.',
  },
  {
    target: 'ifc-quant-source',
    title: 'Modelo e versão',
    body: 'Escolha o modelo e a versão a somar. Ao trocar de modelo, a versão volta para a atual dele.',
  },
  {
    target: 'ifc-quant-stats',
    title: 'Números da versão',
    body: 'Elementos transcritos, classes IFC distintas e pavimentos distintos da versão escolhida.',
  },
  {
    target: 'ifc-quant-sums',
    title: 'Quantidades do modelo',
    body: 'Cada quantidade declarada no IFC (área, volume, comprimento, contagem, peso) somada por nome e tipo, com a unidade e o número de itens. Sem quantidade no arquivo, a versão fica só com a contagem de elementos.',
  },
  {
    target: 'ifc-quant-export',
    title: 'Exportar quantidades',
    body: 'Baixa a tabela de quantidades em CSV no formato da planilha da obra: separador ";", vírgula decimal e acentos preservados no Excel.',
  },
  {
    target: 'ifc-quant-distribution',
    title: 'Distribuição dos elementos',
    body: 'Quantos elementos há por classe IFC e por pavimento, com a participação no total. Elemento sem pavimento aparece como "Sem informação" e fica fora do filtro por pavimento.',
  },
  {
    target: 'ifc-elements',
    title: 'Consulta de elementos',
    body: 'A lista elemento a elemento, 500 por página: Express ID, GlobalId, classe IFC, nome, tipo e pavimento.',
  },
  {
    target: 'ifc-elements-filters',
    title: 'Filtrar elementos',
    body: 'Restrinja a lista por pavimento e por classe IFC; a consulta volta para a primeira página. Limpar filtros aparece quando há filtro ativo.',
  },
  {
    target: 'ifc-elements-export',
    title: 'Exportar a página',
    body: 'Baixa em CSV só a página que está na tela, já com os filtros aplicados.',
  },
  {
    target: 'ifc-elements-pages',
    title: 'Navegar nas páginas',
    body: 'Mostra a faixa exibida e o total de elementos; Anterior e Próxima trocam de página.',
  },
  {
    target: 'ifc-viewer',
    title: 'Visualizador',
    body: 'Desenha a geometria convertida no envio, não o arquivo IFC, e por isso abre modelos de qualquer tamanho. Classe, nome e pavimento de cada peça vêm das tabelas transcritas.',
  },
  {
    target: 'ifc-viewer-version',
    title: 'Versão a desenhar',
    body: 'Escolha qual versão de qual modelo abrir. A troca só vale ao clicar em Carregar geometria.',
  },
  {
    target: 'ifc-viewer-storey',
    title: 'Recorte por pavimento',
    body: 'Mostra só os elementos do pavimento escolhido. Fica disponível depois de carregar a geometria.',
  },
  {
    target: 'ifc-viewer-paint',
    title: 'Cor dos elementos',
    body: 'Pinta a cena por pavimento ou por classe IFC; a legenda abaixo do 3D mostra a cor de cada grupo.',
  },
  {
    target: 'ifc-viewer-load',
    title: 'Carregar geometria',
    body: 'Baixa a malha convertida e os elementos transcritos da versão escolhida. São megabytes, por isso só quando você pede. Depois de carregar, o botão vira Recarregar geometria.',
  },
  {
    target: 'ifc-section',
    title: 'Seccionamento',
    body: 'Ative o corte, escolha a orientação (horizontal Y, vertical X ou Z) e ajuste a posição de 0 a 100% na barra ou no campo. Inverter lado troca a metade visível; Remover corte volta ao modelo inteiro.',
  },
  {
    target: 'ifc-viewer-stats',
    title: 'Versão carregada',
    body: 'Elementos desenhados, pavimentos, classes IFC e a versão aberta, com arquivo e data de envio. Elementos transcritos sem par na malha são contados logo abaixo.',
  },
  {
    target: 'ifc-viewer-canvas',
    title: 'Cena 3D',
    body: 'Arraste para orbitar, use a roda para aproximar e clique num elemento para selecioná-lo; ele fica destacado em âmbar.',
  },
  {
    target: 'ifc-viewer-legend',
    title: 'Legenda',
    body: 'A cor de cada pavimento ou classe IFC e quantos elementos ele tem. Grupo sem dado fica em cinza.',
  },
  {
    target: 'ifc-viewer-picked',
    title: 'Elemento selecionado',
    body: 'Mostra a classe IFC, o Name, o GlobalId e o pavimento da peça clicada, vindos da transcrição. Limpar seleção devolve a peça à cor do grupo.',
  },
];

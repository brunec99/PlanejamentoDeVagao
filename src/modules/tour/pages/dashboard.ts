import type { TourStep } from '../tours';

/** Tour da aba 0, Dashboard da obra (04/11/2026, modelo aprovado pelo usuário). Os alvos ficam em
 * `dashboard/dashboard-overview.tsx`; os que se repetem por módulo (quadro, "Abrir aba") marcam só a primeira
 * ocorrência. A aba só lê: nenhum passo descreve edição. Passo cujo alvo não está na tela (obra sem nenhum
 * módulo com dado, celular) é pulado sozinho. */
export const steps: TourStep[] = [
  {
    title: 'Aba 0 · Dashboard da obra',
    body: 'Os cinco níveis da obra numa página só: curto prazo, longo prazo, vagões, médio prazo e terminalidade, lidos até a semana analisada. Só entram os módulos que você pode abrir e que têm dado nesta obra. Aqui nada se edita: cada quadro leva à aba de origem.',
  },
  {
    target: 'tab-header',
    title: 'Cabeçalho da aba',
    body: 'O número 0, o código e o nome da obra e uma linha do que a aba responde, na mesma moldura das outras abas. É a primeira aba de toda obra: abrir uma obra na lista cai aqui.',
  },
  {
    target: 'tab-ajuda',
    title: 'Como funciona',
    body: 'Abre a explicação da aba: de onde vem cada quadro, o que a semana analisada faz com os números, o que cada filtro recorta e por que um módulo pode não aparecer.',
  },
  {
    target: 'dash-filtros',
    title: 'Filtros',
    body: 'Quatro filtros, que valem ao mesmo tempo para a tela e para o PDF: “Semana analisada” é a data de referência; “Empreiteiro”, “Pavimento” e “Quadros” recortam o que entra. Os filtros seguem no endereço da página de impressão.',
  },
  {
    target: 'dash-semana',
    title: 'Semana analisada',
    body: 'A data de referência de tudo: cada quadro conta só até o sábado dela e ignora o que veio depois. Pendência resolvida depois conta como aberta; medição posterior não entra. Abre na semana atual; escolha uma semana antiga para ver a obra como estava, e o PDF dela sai igual depois.',
  },
  {
    target: 'dash-empreiteiro',
    title: 'Empreiteiro',
    body: 'Seletor múltiplo. Recorta o curto prazo (coluna Empresa), a terminalidade (Responsável terceiro), o médio prazo (empresa da equipe) e os vagões (empresa das equipes das atividades). O ranking das obras e o avanço físico não seguem o recorte, e o quadro diz isso.',
  },
  {
    target: 'dash-pavimento',
    title: 'Pavimento',
    body: 'Seletor múltiplo. Recorta a terminalidade e o longo prazo, pareados pelo nome do pavimento, sem acento. No longo prazo a medição é por serviço, então o avanço medido não se divide por pavimento; o quadro avisa.',
  },
  {
    target: 'dash-quadros',
    title: 'Quadros',
    body: 'Escolhe quais módulos entram na tela e no PDF. Desmarque o que não interessa à reunião; os quadros que ficam continuam com os mesmos números. Módulo sem dado nesta obra não ocupa espaço de qualquer jeito.',
  },
  {
    target: 'dash-escopo',
    title: 'Até quando, e o que falta',
    body: 'Diz a data até a qual tudo conta (o sábado da semana analisada), qual é a semana atual e quais módulos não têm dados nesta obra. Esses módulos não aparecem na página; a linha é o único lugar que os cita.',
  },
  {
    target: 'dash-resumo',
    title: 'Resumo em uma frase',
    body: 'O estado da obra na semana analisada, escrito com os números já arredondados dos cartões: a frase nunca contradiz o cartão abaixo dela.',
  },
  {
    target: 'dash-cartoes',
    title: 'Cartões',
    body: 'Até seis indicadores, um por módulo presente: PPC da semana, avanço físico, takt vencido, tarefas atrasadas, pendências abertas e restrições vencidas. Cada cartão diz de que aba vem, e o estado aparece em cor e em texto.',
  },
  {
    target: 'dash-quadro',
    title: 'Um quadro por módulo',
    body: 'Os mesmos números da aba de origem, contados até a semana analisada e com os filtros de agora. Cada quadro aparece quando o dado dele chega; se um falhar, só ele fica “indisponível” e os outros continuam.',
  },
  {
    target: 'dash-abrir-aba',
    title: 'Abrir aba N →',
    body: 'Leva à aba de origem do quadro, onde o dado se consulta no detalhe e se edita. No dashboard nada se altera.',
  },
  {
    target: 'dash-pdf',
    title: 'Gerar PDF',
    body: 'Abre a página de impressão numa aba nova, com os filtros de agora, e chama o “Salvar como PDF” do navegador, como os PDFs das outras abas. A4 paisagem: folha 1 com o resumo e o curto prazo, depois uma folha por módulo presente. O PDF sai pelo computador.',
  },
  {
    target: 'dash-rodape',
    title: 'Nota final',
    body: 'Lembra que o ranking das obras e o avanço físico consideram a obra inteira, sem recorte de empreiteiro ou pavimento, e que nesta aba nada se edita.',
  },
];

import type { TourStep } from '../tours';

/** Tour da aba 0, Dashboard da obra (04/11/2026, modelo aprovado pelo usuário). Os alvos ficam em
 * `dashboard/dashboard-overview.tsx`; os que se repetem por módulo (quadro, "Abrir aba") marcam só a primeira
 * ocorrência. A aba só lê: nenhum passo descreve edição. Passo cujo alvo não está na tela (obra sem nenhum
 * módulo com dado, celular) é pulado sozinho. Escalas de tempo (04/11/2026, modelo "Dashboard geral e escalas
 * de tempo"): o passo da "Semana analisada" (`dash-semana`) virou dois, a escala (`dash-escala`) e o período
 * (`dash-periodo`). */
export const steps: TourStep[] = [
  {
    title: 'Aba 0 · Dashboard da obra',
    body: 'A obra numa página só, em até onze quadros na ordem do menu: longo prazo, Linha de Balanço e legalização, vagões, médio prazo, curto prazo, Quadro de Restrições, terminalidade, histograma, produtividade, segurança e checklist de equipamentos, no período escolhido (uma semana, um mês, um trimestre, um ano ou um intervalo). Só entram os módulos que você pode abrir e que têm dado nesta obra. Aqui nada se edita: cada quadro leva à aba de origem.',
  },
  {
    target: 'tab-header',
    title: 'Cabeçalho da aba',
    body: 'O número 0, o código e o nome da obra e uma linha do que a aba responde, na mesma moldura das outras abas. É a primeira aba de toda obra: abrir uma obra na lista cai aqui.',
  },
  {
    target: 'tab-ajuda',
    title: 'Como funciona',
    body: 'Abre a explicação da aba: de onde vem cada quadro, como o período é montado, o que é somado dentro dele e o que é o retrato do sábado final, o que cada filtro recorta e por que um módulo pode não aparecer.',
  },
  {
    target: 'dash-filtros',
    title: 'Filtros',
    body: 'Os filtros valem ao mesmo tempo para a tela e para o PDF: “Escala” e “Período” escolhem o intervalo analisado; “Empreiteiro”, “Pavimento” e “Quadros” recortam o que entra. Escala e período vão para o endereço da página, então o link copiado reproduz a visão; todos os filtros seguem no endereço da página de impressão.',
  },
  {
    target: 'dash-escala',
    title: 'Escala',
    body: 'Semanal, Mensal, Trimestral, Anual ou Personalizado, o mesmo seletor do Dashboard geral. A aba abre em Semanal, na semana atual, como antes; vindo do Dashboard geral, abre na escala e no período de lá. Trocar a escala mantém o lugar: da última semana de outubro, o Mensal abre em outubro.',
  },
  {
    target: 'dash-periodo',
    title: 'Período',
    body: 'A lista dos períodos, com as setas ‹ › para andar um de cada vez; no Semanal as semanas vêm numeradas como na planilha, e o período em andamento aparece como “parcial”. No Personalizado, escolha “de” e “até” e, se quiser, “Agrupar por” semana, mês ou trimestre. O período é feito de semanas inteiras (a semana conta no mês da sua segunda-feira) e cada quadro conta só até o sábado da última semana: pendência resolvida depois conta como aberta, medição posterior não entra, e o PDF de um período antigo sai igual depois.',
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
    body: 'Diz o período e as semanas da obra que ele cobre (fora da escala semanal), a data até a qual tudo conta (o sábado da última semana), qual é a semana atual e quais módulos não têm dados nesta obra. Esses módulos não aparecem na página; a linha é o único lugar que os cita.',
  },
  {
    target: 'dash-resumo',
    title: 'Resumo em uma frase',
    body: 'O estado da obra no período escolhido, escrito com os números já arredondados dos cartões: a frase nunca contradiz o cartão abaixo dela.',
  },
  {
    target: 'dash-cartoes',
    title: 'Cartões',
    body: 'Até nove indicadores, em duas linhas, só dos módulos presentes: PPC da semana (ou do mês, do trimestre, do período), avanço físico, takt vencido, tarefas atrasadas, pendências abertas, restrições vencidas, efetivo médio (com os dias úteis lançados), cards vencidos do Quadro de Restrições e segurança em aberto. Cada cartão diz de que aba vem, e o estado aparece em cor e em texto. Fora da escala semanal, o cartão diz se o número é o que aconteceu no período ou o retrato do sábado final.',
  },
  {
    target: 'dash-quadro',
    title: 'Um quadro por módulo',
    body: 'Os mesmos números da aba de origem, contados até o sábado final do período e com os filtros de agora. Fora da escala semanal, cada quadro soma também o que aconteceu dentro do período: no longo prazo, o “Avanço no mês” e a faixa “Período analisado” na curva S; na terminalidade, as abertas e resolvidas no mês. Cada quadro aparece quando o dado dele chega; se um falhar, só ele fica “indisponível” e os outros continuam.',
  },
  {
    target: 'dash-abrir-aba',
    title: 'Abrir aba N →',
    body: 'Leva à aba de origem do quadro, onde o dado se consulta no detalhe e se edita. No dashboard nada se altera.',
  },
  {
    target: 'dash-pdf',
    title: 'Gerar PDF',
    body: 'Abre a página de impressão numa aba nova, com a escala, o período e os filtros de agora, e chama o “Salvar como PDF” do navegador, como os PDFs das outras abas. A4 paisagem, com a escala e o período no cabeçalho: folha 1 com o resumo e o curto prazo, depois uma folha por módulo presente (a última, “Controles de obra e SST”, traz o histograma, a produtividade, a segurança e o checklist). O PDF sai pelo computador.',
  },
  {
    target: 'dash-rodape',
    title: 'Nota final',
    body: 'Lembra que o ranking das obras, o avanço físico e os quadros 1.1 (Linha de Balanço e legalização), 1.4, 2.2, 2.3, 3.1 e 3.2 consideram a obra inteira, sem recorte de empreiteiro ou pavimento, e que nesta aba nada se edita.',
  },
];

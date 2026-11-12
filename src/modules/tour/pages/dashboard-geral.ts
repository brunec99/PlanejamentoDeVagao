import type { TourStep } from '../tours';

/** Tour do Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"), a página fora das
 * obras com as obras liberadas para a pessoa lado a lado. Os alvos ficam em
 * `dashboard/portfolio/portfolio-overview.tsx`; os quadros que se repetem por módulo marcam só o primeiro
 * (`geral-modulos`), e o quadro da segurança do trabalho (06/11/2026) tem o próprio alvo (`geral-seguranca`).
 * A página só lê: nenhum passo descreve edição. Passo cujo alvo não está na tela (quadro escondido, módulo sem
 * acesso, celular) é pulado sozinho. A assistente de IA não abre aqui, então o passo comum dela é pulado. */
export const steps: TourStep[] = [
  {
    title: 'Dashboard geral',
    body: 'As obras liberadas para você, lado a lado, no período escolhido: os mesmos quadros da aba 0 de cada obra, agora comparando as obras. Só entram os módulos que você pode abrir. Aqui nada se edita: clicar numa obra abre a aba 0 dela no mesmo período.',
  },
  {
    target: 'geral-cabecalho',
    title: 'Cabeçalho',
    body: 'O título e uma linha do que a página responde. Ela fica fora das obras, no menu em Empreendimentos, logo abaixo de Obras, e também abre pelo botão “Comparar obras” da lista de obras. Aparece para quem tem duas obras ou mais, e sempre para admin e desenvolvedor.',
  },
  {
    target: 'geral-ajuda',
    title: 'Como funciona',
    body: 'Abre a explicação da página: como o período é montado com semanas inteiras, por que o PPC do período é uma soma e não uma média, o que é contado dentro do período e o que é o retrato do sábado final, e por que uma obra pode mostrar “—”.',
  },
  {
    target: 'geral-filtros',
    title: 'Filtros',
    body: 'Quatro filtros, que valem para a tela e para o PDF: “Escala” e “Período” escolhem o intervalo analisado, “Obras” escolhe quem entra na comparação e “Quadros” escolhe os módulos. Tudo vai para o endereço da página, então o link copiado e o PDF reproduzem a mesma visão.',
  },
  {
    target: 'geral-escala',
    title: 'Escala',
    body: 'Semanal, Mensal, Trimestral, Anual ou Personalizado, o mesmo seletor da aba 0 de cada obra. A página abre em Mensal, no mês mais recente com alguma semana apurada. Trocar a escala mantém o lugar: de outubro em Mensal, o Trimestral abre no 4º trimestre.',
  },
  {
    target: 'geral-periodo',
    title: 'Período',
    body: 'A lista dos períodos, com as setas ‹ › para andar um de cada vez; o período em andamento aparece como “parcial”. O período é sempre feito de semanas inteiras: a semana conta no mês da sua segunda-feira e tudo vale até o sábado da última semana. No Personalizado, escolha “de” e “até” e, se quiser, “Agrupar por” semana, mês ou trimestre.',
  },
  {
    target: 'geral-obras',
    title: 'Obras',
    body: 'Seletor múltiplo com as obras liberadas para você (as mesmas da lista de obras). Abre com todas marcadas; desmarque as que não interessam à comparação. Pavimento fica só na aba 0 de cada obra.',
  },
  {
    target: 'geral-empreiteiro',
    title: 'Empreiteiro',
    body: 'As empresas de todas as obras escolhidas, com o nome comparado sem acento nem maiúscula. Com um recorte, saem as obras onde nenhuma delas aparece, e os quadros passam a contar só as linhas, tarefas e pendências dessas empresas. Longo prazo e PPC geral continuam considerando a obra inteira.',
  },
  {
    target: 'geral-quadros',
    title: 'Quadros',
    body: 'Escolhe quais módulos entram na tela e no PDF: as colunas da tabela, os cartões e os quadros de cada módulo seguem a escolha. Só aparecem os módulos que você pode abrir: todos, inclusive curto prazo, terminalidade e segurança do trabalho, dependem da liberação do admin.',
  },
  {
    target: 'geral-escopo',
    title: 'O que entra na conta',
    body: 'Quantas obras estão no período, quais semanas ele cobre, o sábado até o qual tudo conta e se o período ainda é parcial. No Personalizado diz também como a série está agrupada. Obra que só começou depois do período sai da tabela e é citada aqui.',
  },
  {
    target: 'geral-resumo',
    title: 'Resumo em uma frase',
    body: 'O PPC das obras no período e a comparação com o período anterior, a melhor e a pior obra, as obras atrás no físico, as pendências em aberto e os apontamentos de segurança em aberto, escritos com os números já arredondados dos cartões: a frase nunca contradiz um cartão.',
  },
  {
    target: 'geral-cartoes',
    title: 'Cartões',
    body: 'Até sete números consolidados: PPC das obras, obras abaixo de 70%, obras atrás no físico, takt vencido, restrições vencidas, pendências em aberto e apontamentos de segurança em aberto. Cada cartão diz de que aba vem, quantas obras entram na conta e se é o que aconteceu no período ou o retrato do sábado final.',
  },
  {
    target: 'geral-comparativo',
    title: 'Comparativo das obras',
    body: 'Uma linha por obra e uma coluna por indicador, com cor e texto em cada célula; a última linha é o consolidado, que soma as obras. Clique no título de uma coluna para ordenar e numa obra para abrir a aba 0 dela no mesmo período. “—” é obra sem dado daquele módulo; o motivo aparece ao passar o mouse. O estado é o pior entre os indicadores da obra.',
  },
  {
    target: 'geral-curto',
    title: 'Curto prazo: PPC do período por obra',
    body: 'Uma barra por obra com o PPC do período (cumpridos ÷ assumidos das semanas apuradas), a linha de alerta dos 70% e a do consolidado. Verde a partir de 80%, âmbar abaixo de 70%, vermelho abaixo de 60%. Obra com menos de 4 semanas apuradas fica no fim, “em início”, sem posição.',
  },
  {
    target: 'geral-mapa',
    title: 'Evolução do PPC',
    body: 'Mapa de calor: uma linha por obra e uma coluna por período da série (12 semanas, 12 meses, 8 trimestres ou todos os anos), com a linha “Todas” somando as obras; quanto mais escuro, maior o PPC. Coluna hachurada é período em aberto. Em seguida vêm as causas do período somando as obras, com a obra que mais contribui com cada uma.',
  },
  {
    target: 'geral-empreiteiros',
    title: 'Empreiteiros em mais de uma obra',
    body: 'As empresas que aparecem na planilha da semana de duas obras ou mais no período, com o PPC de cada uma em cada obra e no total. O nome é comparado pela coluna Empresa, sem acento nem maiúscula.',
  },
  {
    target: 'geral-modulos',
    title: 'Longo prazo, vagões, médio prazo e terminalidade',
    body: 'Um quadro por módulo comparando as obras: medido × planejado e o avanço no período; vagões por status, takt e restrições vencidas; tarefas do plano do mês e atrasadas; pendências abertas × resolvidas e os responsáveis terceiros. Cada quadro aparece quando o dado dele chega e lista embaixo as obras sem dado dele.',
  },
  {
    target: 'geral-seguranca',
    title: 'Segurança do trabalho',
    body: 'A vistoria dos TSTs (aba 3.1) comparando as obras: apontamentos feitos × finalizados no período, o risco dos feitos pela consequência (graves = Morte + Severa) e os tipos com mais apontamentos, somando as obras. Feitos contam pela data do apontamento e finalizados pela data de correção; em aberto e abertos há mais de 7 dias são o retrato do sábado final. A vistoria não registra empresa, então o filtro de empreiteiro não recorta este quadro.',
  },
  {
    target: 'geral-pdf',
    title: 'Gerar PDF',
    body: 'Abre a impressão numa aba nova, com escala, período, obras e quadros de agora, e chama o “Salvar como PDF” do navegador. A4 paisagem, até cinco folhas: resumo e comparativo; curto prazo; longo prazo e vagões; médio prazo e terminalidade; segurança do trabalho. Só saem as folhas dos quadros presentes. O PDF sai pelo computador.',
  },
  {
    target: 'geral-rodape',
    title: 'Nota final',
    body: 'Lembra que clicar numa obra abre a aba 0 dela no mesmo período e na mesma escala, onde entram os filtros de empreiteiro e pavimento, e que nesta página nada se edita.',
  },
];

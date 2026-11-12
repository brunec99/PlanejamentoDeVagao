import type { TourStep } from '../tours';

/** Tour do Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"), a página fora das
 * obras com as obras liberadas para a pessoa lado a lado. Os alvos ficam em
 * `dashboard/portfolio/portfolio-overview.tsx`; os quadros que se repetem por módulo marcam só o primeiro
 * (`geral-modulos`), e o quadro da segurança do trabalho (06/11/2026) tem o próprio alvo (`geral-seguranca`).
 * Desde 12/11/2026 (modelo "Dashboards completos e resumo semanal"): Linha de Balanço e Quadro de Restrições
 * entram em `geral-modulos`; histograma e produtividade têm o alvo `geral-controles` e o checklist de
 * equipamentos, `geral-checklist`.
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
    body: 'As empresas de todas as obras escolhidas, com o nome comparado sem acento nem maiúscula. Com um recorte, saem as obras onde nenhuma delas aparece, e os quadros passam a contar só as linhas, tarefas e pendências dessas empresas. Longo prazo, PPC geral, segurança, Linha de Balanço, Quadro de Restrições, histograma, produtividade e checklist continuam considerando a obra inteira.',
  },
  {
    target: 'geral-quadros',
    title: 'Quadros',
    body: 'Escolhe quais módulos entram na tela e no PDF: as colunas da tabela, os cartões e os quadros de cada módulo seguem a escolha. São onze, na ordem do menu (1.1 a 3.2), e só aparecem os módulos que você pode abrir: todos dependem da liberação do admin (a Linha de Balanço e a legalização seguem o longo prazo).',
  },
  {
    target: 'geral-escopo',
    title: 'O que entra na conta',
    body: 'Quantas obras estão no período, quais semanas ele cobre, o sábado até o qual tudo conta e se o período ainda é parcial. No Personalizado diz também como a série está agrupada. Obra que só começou depois do período sai da tabela e é citada aqui.',
  },
  {
    target: 'geral-resumo',
    title: 'Resumo em uma frase',
    body: 'O PPC das obras no período e a comparação com o período anterior, a melhor e a pior obra, as obras atrás no físico, as pendências em aberto, os apontamentos de segurança em aberto e o efetivo médio somado das obras, escritos com os números já arredondados dos cartões: a frase nunca contradiz um cartão.',
  },
  {
    target: 'geral-cartoes',
    title: 'Cartões',
    body: 'Até nove números consolidados, em duas linhas: PPC das obras, obras abaixo de 70%, obras atrás no físico, takt vencido, restrições vencidas, pendências em aberto, apontamentos de segurança em aberto, efetivo médio (a soma das obras, com quantas lançaram todos os dias úteis) e cards vencidos do Quadro de Restrições. Cada cartão diz de que aba vem, quantas obras entram na conta e se é o que aconteceu no período ou o retrato do sábado final.',
  },
  {
    target: 'geral-comparativo',
    title: 'Comparativo das obras',
    body: 'Uma linha por obra e uma coluna por indicador, com cor e texto em cada célula; a última linha é o consolidado, que soma as obras. Clique no título de uma coluna para ordenar e numa obra para abrir a aba 0 dela no mesmo período. “—” é obra sem dado daquele módulo; o motivo aparece ao passar o mouse. As colunas novas mostram o efetivo médio, os dias lançados no histograma e na produtividade (90% ou mais em verde, 70% a 89% em âmbar, abaixo em vermelho), a produção medida, os cards vencidos, o IDP e os checklists vencidos. O estado é o pior entre os indicadores da obra.',
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
    title: 'Longo prazo, balanço, vagões, médio prazo, restrições e terminalidade',
    body: 'Um quadro por módulo comparando as obras: medido × planejado e o avanço no período; o IDP da Linha de Balanço e o Gantt de legalização (marcos, atrasadas e próximo marco, sem valores em reais); vagões por status, takt e restrições vencidas; tarefas do plano do mês e atrasadas; os cards do Quadro de Restrições (em aberto, vencidos, começo atrasado) e os responsáveis com mais vencidos; pendências abertas × resolvidas e os responsáveis terceiros. Cada quadro aparece quando o dado dele chega e lista embaixo as obras sem dado dele.',
  },
  {
    target: 'geral-controles',
    title: 'Histograma e produtividade',
    body: 'Os controles de obra comparados. No histograma (aba 2.2), o efetivo médio por dia útil lançado de cada obra, próprio × empreiteiros, e os dias úteis com lançamento sobre os esperados, com os dias que faltaram. Na produtividade (aba 2.3), os lançamentos com produção medida × a medir, os dias lançados e “Serviços medidos em mais de uma obra”: a produção por homem-dia de cada obra para o mesmo serviço e a mesma unidade. Dia útil é de segunda a sexta, fora feriado nacional, e o dia de hoje ainda não conta como falta.',
  },
  {
    target: 'geral-seguranca',
    title: 'Segurança do trabalho',
    body: 'A vistoria dos TSTs (aba 3.1) comparando as obras: apontamentos feitos × finalizados no período, o risco dos feitos pela consequência (graves = Morte + Severa) e os tipos com mais apontamentos, somando as obras. Feitos contam pela data do apontamento e finalizados pela data de correção; em aberto e abertos há mais de 7 dias são o retrato do sábado final. A vistoria não registra empresa, então o filtro de empreiteiro não recorta este quadro.',
  },
  {
    target: 'geral-checklist',
    title: 'Checklist de equipamentos',
    body: 'O checklist da aba 3.2 comparando as obras: equipamentos ativos, checklists em dia × vencidos e os itens não conformes das inspeções do período. Em dia e vencidos são sempre os de hoje (diário de hoje, semanal desta semana, mensal deste mês), como na aba; o período escolhido só muda as inspeções e as não conformidades.',
  },
  {
    target: 'geral-pdf',
    title: 'Gerar PDF',
    body: 'Abre a impressão numa aba nova, com escala, período, obras e quadros de agora, e chama o “Salvar como PDF” do navegador. A4 paisagem, até sete folhas: resumo e comparativo; curto prazo; longo prazo e vagões; Quadro de Restrições e Linha de Balanço; médio prazo e terminalidade; controles de obra e SST (histograma, produtividade e checklist, com a segunda tabela do comparativo); segurança do trabalho. Só saem as folhas dos quadros presentes. O PDF sai pelo computador.',
  },
  {
    target: 'geral-rodape',
    title: 'Nota final',
    body: 'Lembra que clicar numa obra abre a aba 0 dela no mesmo período e na mesma escala, onde entram os filtros de empreiteiro e pavimento, e que nesta página nada se edita.',
  },
];

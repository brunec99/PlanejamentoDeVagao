import type { TourStep } from '../tours';

/** Tour da aba 6, Segurança do trabalho (05/11/2026; ordem e textos revistos em 10/11/2026, com a página
 * na ordem período → indicadores → lista → gráficos e quadro mês a mês, recolhidos no fim). Os alvos ficam
 * em `seguranca/safety-overview.tsx`; as ações da linha marcam só a primeira linha da tabela. Os passos do
 * que só o TST vê (Novo apontamento, Tipos, marcação em lote, Finalizar/Reabrir) e o aviso de consulta, que
 * só quem não é TST vê, são pulados quando o alvo não está na tela. */
export const steps: TourStep[] = [
  {
    title: 'Aba 3.1 · Segurança do trabalho',
    body: 'A vistoria dos técnicos de segurança (TST) na obra, com as colunas da planilha "SST - Controle geral": tipo de apontamento, risco (consequência e probabilidade), local, foto do apontamento e foto da correção. Cada apontamento só se finaliza com a foto do local corrigido e a data da correção.',
  },
  {
    target: 'safety-readonly',
    title: 'Quem lança e finaliza',
    body: 'Só os técnicos de segurança (TST) e os administradores lançam, editam, finalizam e reabrem apontamentos. Os demais consultam, filtram, abrem as fotos e geram o PDF. O aviso diz quais TSTs têm esta obra; quem dá a alguém o papel TST é o administrador, em Configurações → Usuários.',
  },
  {
    target: 'safety-new',
    title: 'Novo apontamento',
    body: 'Registra um risco encontrado na vistoria: tipo de apontamento, risco (consequência e probabilidade), descrição, local, data e as fotos. "Salvar e lançar outro" mantém tipo, local e data para o próximo.',
  },
  {
    target: 'safety-types',
    title: 'Tipos de apontamento',
    body: 'A lista de tipos é a mesma para todas as obras. Dá para incluir, renomear, desativar e reordenar; tipo não se apaga, porque continua nos apontamentos antigos.',
  },
  {
    target: 'safety-field',
    title: 'No celular, sem sinal',
    body: 'Abre a vistoria em modo de campo: baixa a obra com sinal e depois deixa lançar, fotografar e finalizar sem internet. O que foi feito no aparelho sobe sozinho quando o sinal volta.',
  },
  {
    target: 'safety-pdf',
    title: 'Gerar PDF',
    body: 'Monta o relatório da vistoria com o que a lista mostra (mesmos filtros, período e ordem), agrupado por tipo, local ou consequência, com ou sem fotos. Para poupar papel, os grupos seguem um depois do outro na mesma folha, separados pela faixa azul do título; marque "Cada tipo (local ou consequência) começa em folha nova" para ter um grupo por folha.',
  },
  {
    target: 'safety-period',
    title: 'Período',
    body: 'Escolha a escala e o período pela data do apontamento. "Tudo", o padrão, mostra a obra inteira, sem limite de data. Semanal (segunda a domingo), Mensal (do dia 1º ao último dia do mês), Trimestral e Anual seguem o calendário; as setas ‹ › andam um período e a lista traz do mais recente ao mais antigo, com o atual marcado. "Personalizado" mostra os campos de início e término. Indicadores, lista, gráficos, quadro mês a mês e PDF contam só o período.',
  },
  {
    target: 'safety-cards',
    title: 'Indicadores',
    body: 'Total e abertos da seleção dos filtros e do período, a média de dias para resolver (só dos finalizados), quantos estão abertos há mais de 7 dias e quantos com risco de morte seguem em aberto, em vermelho, com os dias do mais antigo. Os finalizados aparecem no botão "Finalizados", acima da lista.',
  },
  {
    target: 'safety-filters',
    title: 'Filtros e busca',
    body: 'Situação (abertos, finalizados ou todos), tipo, consequência, probabilidade e local, cada um com várias escolhas, e a busca por texto, sem diferença de acento. A lista abre nos abertos, do mais recente para o mais antigo. "Limpar filtros" também volta o período para "Tudo".',
  },
  {
    target: 'safety-table',
    title: 'A lista',
    body: 'Fica logo abaixo dos indicadores: uma linha por apontamento, nas colunas da planilha. Clique no cabeçalho para classificar; clique na linha para abrir o apontamento (para o TST, a janela também tem o botão "Finalizar apontamento"). O selo "Planilha" marca o histórico importado da "SST - Controle geral". A lista mostra 100 linhas por vez, com "Mostrar mais".',
  },
  {
    target: 'safety-row-actions',
    title: 'Finalizar, reabrir e excluir',
    body: 'A coluna "Ações" fica presa na borda direita da tabela, sem precisar rolar de lado. O botão verde "Finalizar" pede a foto da correção e a data em que foi corrigido, com o texto opcional "Como foi corrigido". "Reabrir" volta o apontamento para aberto e mantém as fotos. O "✕" exclui, depois de confirmar.',
  },
  {
    target: 'safety-bulk',
    title: 'Edição em lote',
    body: 'Com apontamentos marcados, muda de uma vez o tipo, a consequência, a probabilidade ou o local, até 500 por vez.',
  },
  {
    target: 'safety-donuts',
    title: 'Gráficos por tipo, consequência e probabilidade',
    body: 'Ficam recolhidos no fim da página: clique no título para abrir ou fechar. Cada rosca mostra até 6 fatias (as 5 maiores e "Outros"). Clicar num item da legenda liga ou desliga o filtro daquele valor na lista; cada rosca ignora o próprio filtro para continuar mostrando as alternativas.',
  },
  {
    target: 'safety-monthly',
    title: 'Mês a mês por tipo',
    body: 'O comparativo da planilha, recolhido no fim da página (clique no título para abrir): apontamentos por tipo nos últimos 4 meses, pela data do apontamento, e a diferença do último mês para o anterior. Com um período escolhido, mostra os meses do período (até 12). Segue os filtros, menos a situação.',
  },
];

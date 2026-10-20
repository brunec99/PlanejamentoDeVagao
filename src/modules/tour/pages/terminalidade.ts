import type { TourStep } from '../tours';

/** Tour da aba 5 (20/10/2026). Os alvos ficam em `terminalidade/terminality-overview.tsx`; os que se repetem
 * por linha (linha, foto, Resolver, Reabrir, ✕, cartão) marcam só a primeira ocorrência. Passos do celular
 * (Filtros, Classificar por, cartão) e os que dependem do papel ou da lista (Nova pendência, marcação em
 * lote, Reabrir) são pulados quando o alvo não está na tela. */
export const steps: TourStep[] = [
  {
    title: 'Aba 5 · Terminalidade',
    body: 'A lista de pendências da obra por pavimento, apartamento e empreiteiro, com foto do problema e da correção. A lista existe para ser zerada: cada pendência só fecha com a foto do serviço corrigido.',
  },
  {
    target: 'tab-ajuda',
    title: 'Como funciona',
    body: 'Abre a explicação da aba: o que é cada linha, de onde vêm pavimentos, aptos, tipos e responsáveis, e as regras para resolver e reabrir uma pendência.',
  },
  {
    target: 'termin-nova',
    title: 'Nova pendência',
    body: 'Registra um problema da vistoria. Pavimento, descrição e data de observação são obrigatórios; apto, tipo, responsáveis e fotos do problema completam. “Salvar e cadastrar outra” mantém local, tipo, data e responsáveis para a próxima.',
  },
  {
    target: 'termin-cadastro',
    title: 'Cadastro primeiro',
    body: 'A lista é organizada por pavimento e apartamento: sem pavimentos cadastrados não há onde registrar pendência. O link leva às Configurações da obra, onde entram também os tipos e os responsáveis da ATR.',
  },
  {
    target: 'termin-indicadores',
    title: 'Abertas, resolvidas e %',
    body: 'Contam as pendências da seleção dos filtros nas duas situações, qualquer que seja a escolhida na lista: abertas + resolvidas = total. O % resolvida é a parte desse total já corrigida.',
  },
  {
    target: 'termin-roscas',
    title: 'Gráficos de rosca',
    body: 'Dividem as pendências da lista por tipo, por pavimento e por responsável terceiro, com a situação e os filtros de agora. Cada rosca ignora o próprio filtro, para continuar mostrando as alternativas. Até seis fatias; acima disso, as menores se juntam em “Outros”.',
  },
  {
    target: 'termin-rosca-legenda',
    title: 'Legenda que filtra',
    body: 'Clique num item da legenda para filtrar a lista por ele; o item escolhido fica destacado e um novo clique tira o filtro. Vale nas três roscas. “Outros” só informa, não filtra.',
  },
  {
    target: 'termin-quebras',
    title: 'Abertas por terceiro e pavimento',
    body: 'Só as pendências abertas, com barra proporcional. Clicar numa linha filtra a lista por ela (se a lista estava em Resolvidas, volta para Abertas); clicar de novo desfaz. “Ver todos” mostra além das seis primeiras.',
  },
  {
    target: 'termin-como-usar',
    title: 'Como usar a lista',
    body: 'Resumo de como a lista funciona: a ordem padrão (pavimento, apto e data de observação), a classificação pelas colunas, o que entra no PDF e os cliques que abrem a pendência e a foto.',
  },
  {
    target: 'termin-celular',
    title: 'Usar no celular, sem sinal',
    body: 'Abre a versão de campo da lista, feita para o celular no canteiro. Com sinal, baixe a obra; depois, o que for lançado sem conexão fica no aparelho e sobe sozinho quando o sinal voltar.',
  },
  {
    target: 'termin-pdf',
    title: 'Gerar PDF',
    body: 'Gera o PDF do que a lista mostra, com os filtros e a classificação de agora. Na janela, agrupe por pavimento, responsável terceiro ou tipo, escolha quais grupos entram, se leva as fotos e se cada grupo começa em folha nova. Abre numa aba nova.',
  },
  {
    target: 'termin-situacao',
    title: 'Abertas, resolvidas ou todas',
    body: 'Escolhe a situação que a lista mostra; o número ao lado conta cada uma na seleção dos filtros. A lista abre nas abertas, que é o que falta corrigir.',
  },
  {
    target: 'termin-filtros-celular',
    title: 'Filtros no celular',
    body: 'No celular, os filtros ficam recolhidos para sobrar tela: toque para abrir ou fechar. O número entre parênteses diz quantos filtros, contando a busca, estão ativos.',
  },
  {
    target: 'termin-busca',
    title: 'Buscar na descrição',
    body: 'Procura o texto digitado na descrição das pendências, sem diferenciar acento nem maiúscula. Soma com a situação e os demais filtros.',
  },
  {
    target: 'termin-filtros',
    title: 'Filtros da lista',
    body: 'Pavimento, apto, tipo, responsável terceiro e responsável ATR. Os filtros somam; “Todos” tira o filtro e as opções entre parênteses, como “(sem apto)”, trazem as pendências com o campo em branco. Escolher o pavimento limita os aptos a ele.',
  },
  {
    target: 'termin-contagem',
    title: 'Contagem e atalhos',
    body: 'Quantas pendências a lista mostra do total. Com algum filtro ativo aparece “Limpar filtros”, que volta às abertas sem filtro; com a lista classificada, aparece a coluna usada e “Voltar à ordem padrão”. Um não desfaz o outro.',
  },
  {
    target: 'termin-marcar',
    title: 'Marcar para editar em lote',
    body: 'Marque as pendências que vão mudar juntas, ou todas as da lista pela caixa do cabeçalho. A marcação vale só para o que a lista mostra; ao marcar, aparece a barra “Editar em lote”.',
  },
  {
    target: 'termin-lote',
    title: 'Editar em lote',
    body: 'Abre a janela para trocar, de uma vez nas marcadas, o tipo, o responsável ATR e o responsável terceiro. Só o campo que você trocar muda; o resto de cada pendência fica como está. “Desmarcar” limpa a seleção.',
  },
  {
    target: 'termin-colunas',
    title: 'Classificar pelas colunas',
    body: 'Clique no título de uma coluna para classificar, como no Excel: o 1º clique põe em ordem crescente, o 2º em decrescente e o 3º volta à ordem padrão. Células vazias ficam no fim; “Local” segue a ordem dos pavimentos da obra.',
  },
  {
    target: 'termin-linha',
    title: 'Abrir a pendência',
    body: 'Clique na linha para abrir a pendência: quem edita muda local, descrição, tipo, data, responsáveis e fotos do problema; quem só acompanha vê. Em “Resolvido?”, o mouse sobre o SIM mostra como foi corrigido, quando informado.',
  },
  {
    target: 'termin-foto',
    title: 'Fotos da pendência',
    body: 'Clique na miniatura para ampliar. O “+N” diz quantas fotos há a mais; no visualizador, as setas (ou o arrasto, no celular) passam pelas fotos do problema e da correção, cada uma com o rótulo do que é.',
  },
  {
    target: 'termin-resolver',
    title: 'Resolver',
    body: 'Dá baixa na pendência corrigida. Exige ao menos uma foto do serviço corrigido e a data da correção, entre a observação e hoje; “Como foi corrigido” é opcional. A foto do problema aparece junto, para comparar.',
  },
  {
    target: 'termin-reabrir',
    title: 'Reabrir',
    body: 'Devolve a pendência resolvida para as abertas, quando a correção não ficou boa. Pede confirmação e apaga a data da correção e o “Como foi corrigido”; as fotos continuam na pendência.',
  },
  {
    target: 'termin-excluir',
    title: 'Excluir pendência',
    body: 'O ✕ apaga a pendência e as fotos dela, depois de confirmar. Não pode ser desfeito: se o problema voltou numa pendência já resolvida, prefira Reabrir.',
  },
  {
    target: 'termin-classificar-celular',
    title: 'Classificar por',
    body: 'No celular não há títulos de coluna para clicar: escolha aqui a coluna e, no botão ao lado, alterne entre crescente e decrescente. “Ordem padrão” volta a pavimento, apto e data de observação.',
  },
  {
    target: 'termin-cartao',
    title: 'Cartão da pendência',
    body: 'No celular, cada pendência vira um cartão. Toque na foto para ampliar, marque a caixa para editar em lote e use Resolver, Reabrir ou Editar (Ver, para quem só acompanha).',
  },
];

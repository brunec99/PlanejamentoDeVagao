/** Paleta única dos gráficos e dos estados. Os mesmos tons valem na Linha de Balanço, no Gantt, na
 * curva de avanço, na série do PPC e no 4D: o que muda de tela para tela é o significado, não a cor.
 *
 * A série categórica tem oito posições, em ordem fixa, validada contra daltonismo e contraste no
 * fundo claro (`scripts/validate_palette.js` da referência de visualização, 01/10/2026: todas as
 * verificações aprovadas; aqua, amarelo e magenta ficam abaixo de 3:1 e por isso toda série traz
 * rótulo ou tabela ao lado da cor). A nona série nunca ganha cor nova: volta ao início, e a
 * identidade continua garantida pelo nome escrito ao lado. */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] as const;

/** Cor da série pela posição, sem gerar tons novos depois da oitava. */
export const seriesColor = (index: number) => SERIES_COLORS[((index % SERIES_COLORS.length) + SERIES_COLORS.length) % SERIES_COLORS.length];

/** Papéis semânticos. "planejado" e "executado" aparecem juntos em quase todo gráfico, por isso
 * são o azul e o verde da série; "hoje" é sempre âmbar, "atrasado" é sempre o vermelho de estado.
 * Os neutros (grade, eixo, textos, superfícies e linha de base) seguem a escala `slate` com tom
 * petróleo de `globals.css`, na mesma posição da escala, e o vínculo usa o azul da marca
 * (`primary`, #1a719f), alinhados ao Takt Hub. A série categórica e os estados não mudam. */
export const CHART = {
  planned: '#2a78d6',
  executed: '#008300',
  baseline: '#8ea4b7',
  today: '#b45309',
  late: '#be123c',
  ahead: '#2a78d6',
  onTime: '#1baf7a',
  link: '#1a719f',
  grid: '#dce6ee',
  gridStrong: '#c4d3df',
  axis: '#8ea4b7',
  ink: '#2f4a61',
  inkMuted: '#59738a',
  inkFaint: '#8ea4b7',
  surface: '#ffffff',
  surfaceMuted: '#f5f8fb',
  surfaceAlt: '#ebf1f6',
} as const;

/** Estados, sempre acompanhados de ícone ou texto: cor sozinha não carrega informação. */
export const STATUS = {
  good: '#047857',
  warning: '#b45309',
  danger: '#be123c',
  neutral: '#64748b',
} as const;

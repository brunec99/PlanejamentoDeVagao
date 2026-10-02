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
 * são o azul e o verde da série; "hoje" é sempre âmbar, "atrasado" é sempre o vermelho de estado. */
export const CHART = {
  planned: '#2a78d6',
  executed: '#008300',
  baseline: '#94a3b8',
  today: '#b45309',
  late: '#be123c',
  ahead: '#2a78d6',
  onTime: '#1baf7a',
  link: '#2563eb',
  grid: '#e2e8f0',
  gridStrong: '#cbd5e1',
  axis: '#94a3b8',
  ink: '#334155',
  inkMuted: '#64748b',
  inkFaint: '#94a3b8',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
  surfaceAlt: '#f1f5f9',
} as const;

/** Estados, sempre acompanhados de ícone ou texto: cor sozinha não carrega informação. */
export const STATUS = {
  good: '#047857',
  warning: '#b45309',
  danger: '#be123c',
  neutral: '#64748b',
} as const;

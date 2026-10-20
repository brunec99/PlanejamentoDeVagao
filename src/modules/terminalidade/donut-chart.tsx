import type { DonutSlice } from './terminality-view';

/** Rosca das pendências (20/10/2026), a mesma no topo da aba 5 e na primeira folha do PDF. Paleta
 * categórica de referência do guia de gráficos, validada pelo script dele: pares vizinhos, a emenda (a
 * última fatia encosta na primeira) e o cinza de "Outros" contra os dois vizinhos. Três cores ficam
 * abaixo de 3:1 no branco; por isso a legenda ao lado, com os números, é obrigatória. */
export const DONUT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
export const DONUT_OTHERS_COLOR = '#d6d5cf';
export const donutColor = (slice: DonutSlice, i: number) => (slice.others ? DONUT_OTHERS_COLOR : DONUT_COLORS[i % DONUT_COLORS.length]);
export const sharePercent = (slice: DonutSlice) => `${Math.round(slice.share * 100)}%`;

/** O anel em SVG, com o total no centro. Cada fatia tem um <title> (dica ao passar o mouse na tela). */
export function DonutRing({ slices, total, title, className }: { slices: DonutSlice[]; total: number; title: string; className?: string }) {
  const size = 120;
  const radius = 46;
  const thickness = 20;
  const circumference = 2 * Math.PI * radius;
  // Espaço branco de ~2 px entre fatias; com uma fatia só, anel inteiro.
  const gap = slices.length > 1 ? 2 : 0;
  // Onde cada fatia começa, somando as anteriores; calculado antes de desenhar.
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((sum, slice) => sum + slice.share * circumference, 0));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title}: ${total} pendências`} className={className}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {slices.map((slice, i) => {
          const visible = Math.max(slice.share * circumference - gap, 0.6);
          return (
            <circle
              key={slice.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={donutColor(slice, i)}
              strokeWidth={thickness}
              strokeDasharray={`${visible} ${circumference - visible}`}
              strokeDashoffset={-starts[i]}
            >
              <title>{`${slice.label}: ${slice.count} (${sharePercent(slice)})`}</title>
            </circle>
          );
        })}
      </g>
      <text x={size / 2} y={size / 2 - 1} textAnchor="middle" fontSize="22" fontWeight="700" fill="#0b0b0b">
        {total}
      </text>
      <text x={size / 2} y={size / 2 + 14} textAnchor="middle" fontSize="9" fill="#52514e">
        {total === 1 ? 'pendência' : 'pendências'}
      </text>
    </svg>
  );
}

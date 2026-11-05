'use client';
import { useId } from 'react';
import { CHART } from '@/shared/palette';
import { Legend } from './charts';
import { pct } from './model';
import { GROUPING_NOUN, SCALE_OF, type PeriodGrouping } from './period';
import type { BucketPpc } from './period-views';

/** Gráficos do curto prazo fora da escala semanal (04/11/2026, modelo "Dashboard geral e escalas de tempo",
 * regras 6 a 8), no mesmo desenho de `PpcBars` (`charts.tsx`): SVG puro, cores da paleta do sistema, texto
 * sempre em tinta, `width`/`height` só mudam o viewBox, então o mesmo componente desenha a tela e o papel. */

/** Até quantos baldes cada barra ganha o seu número; acima disso, só o analisado, o máximo, o mínimo e o último. */
const ALL_VALUES = 16;
/** Rótulos do eixo: no máximo uns 12, sempre o primeiro e o último. */
const AXIS_LABELS = 12;

/** A série do PPC por balde (mês, trimestre, ano ou o agrupamento do personalizado): cada barra soma
 * cumpridos ÷ assumidos das semanas apuradas do balde. Balde sem semana apurada mas com semana em aberto sai
 * como coluna hachurada clara, sem número (não tem PPC e fica fora da média); balde sem linha nenhuma, um
 * traço. `analyzedKey` ganha a faixa âmbar (nas escalas fixas, o último balde). Embaixo do rótulo, quantas
 * semanas apuradas o balde tem (menos no agrupamento por semana, em que seria sempre 1). */
export function PeriodPpcBars({
  buckets,
  grouping,
  analyzedKey,
  average,
  width: W = 640,
  height: H = 205,
}: {
  buckets: BucketPpc[];
  grouping: PeriodGrouping;
  analyzedKey?: string;
  average?: number;
  width?: number;
  height?: number;
}) {
  const patternId = useId();
  if (!buckets.length) return <p className="dsh-empty">Nenhum período para mostrar.</p>;
  const noun = GROUPING_NOUN[grouping];
  const of = SCALE_OF[grouping];
  const weeksLine = grouping !== 'semana';
  const n = buckets.length;
  const TOP = 22,
    BOTTOM = 34,
    LEFT = 28,
    RIGHT = 54,
    PLOT = H - TOP - BOTTOM;
  const step = (W - LEFT - RIGHT) / n;
  const bar = Math.max(4, Math.min(30, step * 0.58));
  const y = (percent: number) => TOP + PLOT * (1 - percent / 100);
  const openOnly = (bucket: BucketPpc) => bucket.percent === undefined && bucket.openWeeks > 0;
  const anyOpenOnly = buckets.some(openOnly);
  const analyzedShown = analyzedKey !== undefined && buckets.some(bucket => bucket.key === analyzedKey);
  const values = buckets.map(bucket => bucket.percent);
  const known = values.filter((value): value is number => value !== undefined);
  const maxI = known.length ? values.indexOf(Math.max(...known)) : -1;
  const minI = known.length ? values.indexOf(Math.min(...known)) : -1;
  const lastI = values.reduce<number>((last, value, index) => (value !== undefined ? index : last), -1);
  const every = Math.max(1, Math.ceil(n / AXIS_LABELS));
  const valueLabel = (bucket: BucketPpc, index: number, center: number, height: number, here: boolean) => {
    if (n > ALL_VALUES && !here && index !== maxI && index !== minI && index !== lastI) return null;
    const value = Math.round(bucket.percent!);
    const top = TOP + PLOT - height;
    const avg = average === undefined ? undefined : y(average);
    const clearAbove = avg === undefined || avg < top - 16 || avg > top - 2;
    if (here && clearAbove)
      return (
        <text x={center} y={top - 5} textAnchor="middle" fontSize={12} fontWeight={700} fill={CHART.today}>
          {value}
        </text>
      );
    if (height >= 16 && bar >= 14)
      return (
        <text x={center} y={top + 13} textAnchor="middle" fontSize={10} fontWeight={700} fill={CHART.surface}>
          {value}
        </text>
      );
    return (
      <text x={center} y={top - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={here ? CHART.today : CHART.ink}>
        {value}
      </text>
    );
  };
  const describe = (bucket: BucketPpc) =>
    bucket.percent !== undefined ? `${Math.round(bucket.percent)}%` : bucket.openWeeks ? 'em aberto' : 'sem compromissos';
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`PPC por ${noun.one}: ${buckets.map(b => `${b.short} ${describe(b)}`).join(', ')}`}
      >
        <defs>
          <pattern id={patternId} width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={7} height={7} fill={CHART.planned} />
            <line x1={0} y1={0} x2={0} y2={7} stroke={CHART.surface} strokeWidth={3} />
          </pattern>
        </defs>
        {[0, 50, 100].map(mark => (
          <g key={mark}>
            <line x1={LEFT} y1={y(mark)} x2={W - RIGHT} y2={y(mark)} stroke={CHART.grid} strokeWidth={1} />
            <text x={LEFT - 6} y={y(mark) + 3} textAnchor="end" fontSize={10} fill={CHART.inkFaint}>
              {mark}
            </text>
          </g>
        ))}
        {buckets.map((bucket, index) =>
          bucket.key === analyzedKey ? (
            <rect
              key={`aqui-${bucket.key}`}
              x={LEFT + step * index + 2}
              y={TOP - 14}
              width={Math.max(2, step - 4)}
              height={PLOT + 44}
              rx={4}
              fill={CHART.today}
              opacity={0.12}
            />
          ) : null,
        )}
        {average !== undefined && (
          <>
            <line
              x1={LEFT}
              y1={y(average)}
              x2={W - RIGHT}
              y2={y(average)}
              stroke={CHART.inkMuted}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text x={W - RIGHT + 6} y={y(average) - 3} fontSize={10} fontWeight={700} fill={CHART.inkMuted}>
              média
            </text>
            <text x={W - RIGHT + 6} y={y(average) + 10} fontSize={10} fontWeight={700} fill={CHART.inkMuted}>
              {pct(average)}
            </text>
          </>
        )}
        {buckets.map((bucket, index) => {
          const center = LEFT + step * (index + 0.5);
          const here = bucket.key === analyzedKey;
          const labelled = index % every === 0 || index === n - 1 || here;
          let mark;
          if (bucket.percent !== undefined) {
            const height = Math.max(2, (PLOT * bucket.percent) / 100);
            mark = (
              <>
                <rect x={center - bar / 2} y={TOP + PLOT - height} width={bar} height={height} rx={2} fill={CHART.planned} />
                {valueLabel(bucket, index, center, height, here)}
              </>
            );
          } else if (openOnly(bucket)) {
            mark = (
              <>
                <rect x={center - bar / 2} y={TOP} width={bar} height={PLOT} rx={2} fill={`url(#${patternId})`} opacity={0.3} />
                {n <= ALL_VALUES && (
                  <text x={center} y={TOP - 4} textAnchor="middle" fontSize={9} fontWeight={700} fill={here ? CHART.today : CHART.inkMuted}>
                    aberto
                  </text>
                )}
              </>
            );
          } else
            mark = (
              <text x={center} y={TOP + PLOT - 4} textAnchor="middle" fontSize={10} fill={CHART.inkFaint}>
                —
              </text>
            );
          return (
            <g key={bucket.key}>
              {mark}
              {labelled && (
                <text
                  x={center}
                  y={H - BOTTOM + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={here ? 700 : 600}
                  fill={here ? CHART.today : CHART.inkMuted}
                >
                  {bucket.short}
                </text>
              )}
              {labelled && weeksLine && (
                <text x={center} y={H - BOTTOM + 26} textAnchor="middle" fontSize={9.5} fill={CHART.inkFaint}>
                  {bucket.closedWeeks} sem.
                </text>
              )}
            </g>
          );
        })}
        <line x1={LEFT} y1={TOP + PLOT} x2={W - RIGHT} y2={TOP + PLOT} stroke={CHART.gridStrong} strokeWidth={1} />
      </svg>
      <Legend
        items={[
          { color: CHART.planned, text: `PPC ${of}: cumpridos ÷ assumidos das semanas apuradas${weeksLine ? ' (embaixo, quantas)' : ''}` },
          ...(anyOpenOnly
            ? [
                {
                  color: CHART.planned,
                  text: grouping === 'semana' ? 'Semana em aberto, fora da média' : 'Só semanas em aberto: sem PPC, fora da média',
                },
              ]
            : []),
          ...(analyzedShown ? [{ color: '#fbe9d4', outline: CHART.today, text: 'Período analisado' }] : []),
          ...(average !== undefined
            ? [{ dashed: true, text: `Média simples ${grouping === 'semana' ? 'das' : 'dos'} ${noun.many} com PPC · ${pct(average)}` }]
            : []),
        ]}
      />
    </>
  );
}

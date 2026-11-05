'use client';
import { useId } from 'react';
import type { WeekPpc } from '@/domain/rules';
import type { DonutSlice } from '@/modules/terminalidade/terminality-view';
import { DonutRing, donutColor, sharePercent } from '@/modules/terminalidade/donut-chart';
import { CHART } from '@/shared/palette';
import { dayMonth, monthOf, monthShort, pct } from './model';

/** Os gráficos da aba 0 (04/11/2026, modelo aprovado), em SVG puro e com as cores da paleta do sistema:
 * os mesmos componentes desenham a tela e o papel, mudando só `width`/`height` (o viewBox; o SVG ocupa a
 * largura do bloco). Texto sempre em tinta, nunca na cor da série; toda série com mais de um item tem
 * legenda; valores só nos pontos que importam (semana analisada, máximo, mínimo, último). */

export const DASH_COLORS = {
  planned: CHART.planned,
  executed: CHART.executed,
  late: CHART.late,
  good: CHART.onTime,
  today: CHART.today,
  neutral: CHART.gridStrong,
  ink: CHART.ink,
  inkMuted: CHART.inkMuted,
  inkFaint: CHART.inkFaint,
  baseline: CHART.baseline,
} as const;

export interface LegendItem {
  color?: string;
  /** Amostra como traço (linha) em vez de quadrado. */
  line?: boolean;
  /** Amostra tracejada (média, referência). */
  dashed?: boolean;
  /** Contorno da amostra (a faixa âmbar da semana analisada). */
  outline?: string;
  text: string;
}
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <p className="dsh-legend">
      {items.map((item, index) => (
        <span key={index}>
          {(item.color || item.dashed) && (
            <i
              className={item.dashed ? 'dashed' : item.line ? 'line' : undefined}
              style={item.dashed ? undefined : { background: item.color, ...(item.outline ? { border: `1px solid ${item.outline}` } : {}) }}
            />
          )}
          {item.text}
        </span>
      ))}
    </p>
  );
}

/** A série do PPC: as semanas até a analisada (faixa âmbar), barra hachurada na semana em aberto, o
 * tracejado da média. O mesmo desenho da primeira página do PDF do fechamento. */
export function PpcBars({
  series,
  week,
  average,
  label,
  width: W = 640,
  height: H = 205,
}: {
  series: WeekPpc[];
  week: string;
  average?: number;
  label: (weekStart: string) => number;
  width?: number;
  height?: number;
}) {
  const patternId = useId();
  if (!series.length) return <p className="dsh-empty">Nenhum compromisso registrado até esta semana.</p>;
  const TOP = 22,
    BOTTOM = 34,
    LEFT = 28,
    RIGHT = 54,
    PLOT = H - TOP - BOTTOM;
  const step = (W - LEFT - RIGHT) / series.length;
  const bar = Math.min(30, step * 0.58);
  const y = (percent: number) => TOP + PLOT * (1 - percent / 100);
  const open = series.some(point => point.pending > 0);
  const valueLabel = (point: WeekPpc, center: number, height: number, here: boolean, pending: boolean) => {
    const top = TOP + PLOT - height;
    const avg = average === undefined ? undefined : y(average);
    const clearAbove = avg === undefined || avg < top - 16 || avg > top - 2;
    if (here && clearAbove)
      return (
        <text x={center} y={top - 5} textAnchor="middle" fontSize={12} fontWeight={700} fill={CHART.today}>
          {Math.round(point.percent)}
        </text>
      );
    if (!pending && height >= 16)
      return (
        <text x={center} y={top + 13} textAnchor="middle" fontSize={10} fontWeight={700} fill={CHART.surface}>
          {Math.round(point.percent)}
        </text>
      );
    return (
      <text x={center} y={top - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={here ? CHART.today : CHART.ink}>
        {Math.round(point.percent)}
      </text>
    );
  };
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`PPC das semanas ${series.map(p => `${label(p.weekStart)}: ${Math.round(p.percent)}%`).join(', ')}`}
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
        {series.map((point, index) =>
          point.weekStart === week ? (
            <rect
              key={`aqui-${point.weekStart}`}
              x={LEFT + step * index + 2}
              y={TOP - 14}
              width={step - 4}
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
        {series.map((point, index) => {
          const center = LEFT + step * (index + 0.5);
          const height = Math.max(2, (PLOT * point.percent) / 100);
          const here = point.weekStart === week,
            pending = point.pending > 0;
          return (
            <g key={point.weekStart}>
              <rect
                x={center - bar / 2}
                y={TOP + PLOT - height}
                width={bar}
                height={height}
                rx={2}
                fill={pending ? `url(#${patternId})` : CHART.planned}
                opacity={pending ? 0.75 : 1}
              />
              {valueLabel(point, center, height, here, pending)}
              <text
                x={center}
                y={H - BOTTOM + 14}
                textAnchor="middle"
                fontSize={10}
                fontWeight={here ? 700 : 600}
                fill={here ? CHART.today : CHART.inkMuted}
              >
                S{label(point.weekStart)}
              </text>
              <text x={center} y={H - BOTTOM + 26} textAnchor="middle" fontSize={9.5} fill={CHART.inkFaint}>
                {dayMonth(point.weekStart)}
              </text>
            </g>
          );
        })}
        <line x1={LEFT} y1={TOP + PLOT} x2={W - RIGHT} y2={TOP + PLOT} stroke={CHART.gridStrong} strokeWidth={1} />
      </svg>
      <Legend
        items={[
          { color: CHART.planned, text: 'Semana apurada' },
          ...(open ? [{ color: CHART.planned, text: 'Semana em aberto, fora da média' }] : []),
          { color: '#fbe9d4', outline: CHART.today, text: 'Semana analisada' },
          ...(average !== undefined ? [{ dashed: true, text: `Média das semanas apuradas · ${pct(average)}` }] : []),
        ]}
      />
    </>
  );
}

/** O histórico desde a semana 1: o PPC de cada mês, os anos separados e o tracejado do PPC geral. Só os
 * meses com semana apurada chegam aqui; o mês da semana analisada sai em âmbar. */
export function HistoryBars({
  months,
  overall,
  hereMonth,
  width: W = 820,
  height: H = 190,
}: {
  months: { month: string; percent: number; weeks: number }[];
  overall?: number;
  hereMonth: string;
  width?: number;
  height?: number;
}) {
  if (!months.length) return <p className="dsh-empty">Nenhuma semana apurada até esta semana.</p>;
  const TOP = 18,
    BOTTOM = 24,
    LEFT = 28,
    RIGHT = 14,
    PLOT = H - TOP - BOTTOM,
    n = months.length;
  const step = (W - LEFT - RIGHT) / n,
    bw = Math.max(4, Math.min(28, step * 0.62));
  const y = (percent: number) => TOP + PLOT * (1 - percent / 100);
  const values = months.map(m => m.percent);
  const maxI = values.indexOf(Math.max(...values)),
    minI = values.indexOf(Math.min(...values));
  // Rótulos do eixo: no máximo uns 12, sempre o primeiro e o último.
  const every = Math.max(1, Math.ceil(n / 12));
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`PPC por mês de ${monthShort(months[0].month)} a ${monthShort(months[n - 1].month)}${overall !== undefined ? `; PPC geral ${pct(overall)}` : ''}`}
      >
        {[0, 50, 100].map(mark => (
          <g key={mark}>
            <line x1={LEFT} y1={y(mark)} x2={W - RIGHT} y2={y(mark)} stroke={CHART.grid} />
            <text x={LEFT - 5} y={y(mark) + 3} textAnchor="end" fontSize={9} fill={CHART.inkFaint}>
              {mark}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const first = i === 0,
            newYear = !first && m.month.slice(5, 7) === '01';
          if (!first && !newYear) return null;
          const x = LEFT + step * i;
          return (
            <g key={`ano-${m.month}`}>
              {newYear && <line x1={x} y1={TOP - 10} x2={x} y2={TOP + PLOT} stroke={CHART.gridStrong} strokeDasharray="2 3" />}
              <text x={x + 4} y={TOP - 3} fontSize={9} fontWeight={700} fill={CHART.inkMuted}>
                {m.month.slice(0, 4)}
              </text>
            </g>
          );
        })}
        {months.map((m, i) => {
          const cx = LEFT + step * (i + 0.5),
            h = Math.max(2, (PLOT * m.percent) / 100),
            top = TOP + PLOT - h;
          const here = m.month === hereMonth;
          const labelled = i === maxI || i === minI || i === n - 1;
          return (
            <g key={m.month}>
              <rect x={cx - bw / 2} y={top} width={bw} height={h} rx={2} fill={here ? CHART.today : CHART.planned} />
              {labelled && (
                <text x={cx} y={top - 4} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={here ? CHART.today : CHART.ink}>
                  {Math.round(m.percent)}
                </text>
              )}
              {(i % every === 0 || i === n - 1) && (
                <text x={cx} y={H - BOTTOM + 13} textAnchor="middle" fontSize={9} fill={CHART.inkFaint}>
                  {monthShort(m.month)}
                </text>
              )}
            </g>
          );
        })}
        {overall !== undefined && (
          <line x1={LEFT} y1={y(overall)} x2={W - RIGHT} y2={y(overall)} stroke={CHART.inkMuted} strokeWidth={1.5} strokeDasharray="5 4" />
        )}
        <line x1={LEFT} y1={TOP + PLOT} x2={W - RIGHT} y2={TOP + PLOT} stroke={CHART.gridStrong} />
      </svg>
      <Legend
        items={[
          { color: CHART.planned, text: 'PPC do mês (cumpridos ÷ assumidos das semanas apuradas do mês)' },
          { color: CHART.today, text: 'Mês da semana analisada' },
          ...(overall !== undefined ? [{ dashed: true, text: `PPC geral desde a semana 1 · ${pct(overall)}` }] : []),
        ]}
      />
    </>
  );
}

const ms = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Curva S do longo prazo: o planejado contínuo (tracejado, como a curva de avanço da aba 1 distingue
 * planejado de executado também sem cor) e as medições como pontos ligados, com a data analisada marcada.
 * `highlight` (escalas de tempo, 04/11/2026) pinta a faixa âmbar do período analisado, de `from` a `to`. */
export function SCurve({
  points,
  measured,
  refDate,
  refLabel,
  plannedLabel,
  measuredLabel,
  highlight,
  width: W = 620,
  height: H = 230,
}: {
  points: { date: string; planned: number }[];
  measured: { date: string; percent: number }[];
  refDate: string;
  refLabel: string;
  plannedLabel: string;
  measuredLabel: string;
  /** A janela do período analisado e o texto dela na legenda. */
  highlight?: { from: string; to: string; label: string };
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return <p className="dsh-empty">O plano ainda não tem serviços com datas para desenhar a curva.</p>;
  const TOP = 14,
    BOTTOM = 30,
    LEFT = 34,
    RIGHT = 14,
    PW = W - LEFT - RIGHT,
    PH = H - TOP - BOTTOM;
  const from = ms(points[0].date),
    to = ms(points[points.length - 1].date);
  const x = (date: string) => LEFT + PW * (to === from ? 0 : Math.min(1, Math.max(0, (ms(date) - from) / (to - from))));
  const y = (value: number) => TOP + PH * (1 - Math.min(100, Math.max(0, value)) / 100);
  const path = (list: { x: number; y: number }[]) => list.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const plannedPath = path(points.map(p => ({ x: x(p.date), y: y(p.planned) })));
  const measuredPath = path(measured.map(m => ({ x: x(m.date), y: y(m.percent) })));
  // O planejado na data analisada: o último ponto até ela (os pontos são mensais; a tabela diz o valor exato).
  const plannedAtRef = [...points].reverse().find(p => p.date <= refDate) ?? points[0];
  const last = measured[measured.length - 1];
  const inRange = ms(refDate) >= from && ms(refDate) <= to;
  // A faixa do período, cortada nas bordas do eixo; fora do eixo inteiro, não aparece. Nunca mais fina que
  // 3 px, para uma semana caber num plano de anos.
  const band =
    highlight && ms(highlight.to) >= from && ms(highlight.from) <= to
      ? { x: x(highlight.from), width: Math.max(3, x(highlight.to) - x(highlight.from)) }
      : undefined;
  // Rótulos do eixo: cerca de dez, sempre o primeiro e o último.
  const every = Math.max(1, Math.ceil(points.length / 10));
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva S: ${plannedLabel} e ${measuredLabel}`}>
        {band && <rect x={band.x} y={TOP - 4} width={band.width} height={PH + 4} fill={CHART.today} opacity={0.12} />}
        {[0, 25, 50, 75, 100].map(mark => (
          <g key={mark}>
            <line x1={LEFT} y1={y(mark)} x2={W - RIGHT} y2={y(mark)} stroke={CHART.grid} />
            <text x={LEFT - 6} y={y(mark) + 3} textAnchor="end" fontSize={9.5} fill={CHART.inkFaint}>
              {mark}
            </text>
          </g>
        ))}
        {inRange && (
          <>
            <line x1={x(refDate)} y1={TOP - 4} x2={x(refDate)} y2={TOP + PH} stroke={CHART.today} strokeWidth={1.5} strokeDasharray="3 3" />
            <text x={x(refDate) + 5} y={TOP + 8} fontSize={9.5} fontWeight={700} fill={CHART.today}>
              {refLabel}
            </text>
          </>
        )}
        <path d={plannedPath} fill="none" stroke={CHART.planned} strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" />
        {measured.length > 0 && <path d={measuredPath} fill="none" stroke={CHART.executed} strokeWidth={2} strokeLinejoin="round" />}
        {measured.map(m => (
          <circle key={m.date} cx={x(m.date)} cy={y(m.percent)} r={3.5} fill={CHART.executed} stroke={CHART.surface} strokeWidth={1.5} />
        ))}
        {inRange && (
          <>
            <circle cx={x(refDate)} cy={y(plannedAtRef.planned)} r={3.5} fill={CHART.planned} stroke={CHART.surface} strokeWidth={1.5} />
            <text x={x(refDate) - 7} y={y(plannedAtRef.planned) - 7} textAnchor="end" fontSize={10} fontWeight={700} fill={CHART.planned}>
              planejado {pct(plannedAtRef.planned)}
            </text>
          </>
        )}
        {last && (
          <text x={x(last.date) + 7} y={y(last.percent) + 14} textAnchor="start" fontSize={10} fontWeight={700} fill={CHART.executed}>
            medido {pct(last.percent)}
          </text>
        )}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={p.date} x={x(p.date)} y={H - BOTTOM + 14} textAnchor="middle" fontSize={9} fill={CHART.inkFaint}>
              {monthShort(monthOf(p.date))}
            </text>
          ) : null,
        )}
        <line x1={LEFT} y1={TOP + PH} x2={W - RIGHT} y2={TOP + PH} stroke={CHART.gridStrong} />
      </svg>
      <Legend
        items={[
          { color: CHART.planned, line: true, text: plannedLabel },
          ...(measured.length ? [{ color: CHART.executed, line: true, text: measuredLabel }] : []),
          { color: CHART.today, line: true, text: 'Data analisada' },
          ...(band && highlight ? [{ color: '#fbe9d4', outline: CHART.today, text: highlight.label }] : []),
        ]}
      />
    </>
  );
}

/** Barra empilhada (vagões por status, tarefas por situação) com a legenda e as contagens. */
export function StackBar({ segments, ariaLabel }: { segments: { label: string; value: number; color: string }[]; ariaLabel: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <>
      <div className="dsh-stack" role="img" aria-label={ariaLabel}>
        {segments.map(segment =>
          segment.value > 0 ? (
            <b key={segment.label} style={{ width: `${total ? (segment.value / total) * 100 : 0}%`, background: segment.color }} />
          ) : null,
        )}
      </div>
      <p className="dsh-legend">
        {segments.map(segment => (
          <span key={segment.label}>
            <i style={{ background: segment.color }} />
            {segment.label} <b>{segment.value}</b>
          </span>
        ))}
      </p>
    </>
  );
}

/** Lista de barras horizontais, do maior para o menor, com o número e, se houver, a posição ("1ª na obra"). */
export function HBars({
  rows,
  color = CHART.planned,
}: {
  rows: { label: string; value: number; muted?: boolean; rank?: string }[];
  color?: string;
}) {
  if (!rows.length) return <p className="dsh-empty">Nada a mostrar.</p>;
  const peak = Math.max(1, ...rows.map(row => row.value));
  return (
    <div className="dsh-hb">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className={row.rank !== undefined ? 'ranked' : undefined}>
          <span className={`txt${row.muted ? ' none' : ''}`}>{row.label}</span>
          <span className="num">{row.value}</span>
          {row.rank !== undefined && <span className="rk">{row.rank}</span>}
          <span className="dsh-track">
            <b style={{ width: `${(row.value / peak) * 100}%`, background: color }} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Rosca com a legenda ao lado, o mesmo anel da aba 5 e do PDF da lista de pendências. */
export function Donut({
  slices,
  total,
  title,
  centerLabel,
  size = 110,
}: {
  slices: DonutSlice[];
  total: number;
  title: string;
  centerLabel: string;
  size?: number;
}) {
  if (!slices.length || !total) return <p className="dsh-empty">Nenhuma pendência aberta.</p>;
  return (
    <div className="dsh-donut" style={{ gridTemplateColumns: `${size}px minmax(0, 1fr)` }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <DonutRing slices={slices} total={total} title={title} />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            fontSize: size * 0.1,
            color: CHART.inkMuted,
            lineHeight: 1.1,
            pointerEvents: 'none',
            paddingTop: size * 0.34,
          }}
        >
          {centerLabel}
        </span>
      </div>
      <div className="dsh-donut-leg">
        {slices.map((slice, index) => (
          <div key={slice.key}>
            <i style={{ background: donutColor(slice, index) }} />
            <span className="txt">
              {slice.label}
              {slice.others ? ` (${slice.others} tipos)` : ''}
            </span>
            <span className="num">{slice.count}</span>
            <span className="pc">{sharePercent(slice)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Evolução da terminalidade: dois painéis com o mesmo eixo de semanas (o saldo em aberto como linha em
 * cima; abertas e resolvidas por semana como barras embaixo), porque são escalas diferentes e um eixo
 * duplo mentiria. Nas escalas de tempo (04/11/2026) os itens podem ser baldes (mês, trimestre, ano): o
 * rótulo vem como texto ("out/26") em vez do número da semana, e `bucket` ajusta a legenda ("do mês", "meses"). */
export function EvolutionChart({
  weeks,
  bucket = { of: 'da semana', many: 'semanas' },
  width: W = 560,
  height: H = 230,
}: {
  /** `weekStart` é a chave de cada item; `label` numérico sai como "S43", texto sai como está. */
  weeks: { weekStart: string; label: number | string; opened: number; resolved: number; balance: number }[];
  /** "da semana"/"semanas" por padrão; "do mês"/"meses" na série mensal. */
  bucket?: { of: string; many: string };
  width?: number;
  height?: number;
}) {
  if (!weeks.length) return <p className="dsh-empty">Sem {bucket.many} para mostrar.</p>;
  /** "do mês" → "no mês". */
  const within = bucket.of.replace(/^d/, 'n');
  const LEFT = 30,
    RIGHT = 10,
    TOP = 12,
    GAP = 16,
    BOTTOM = 26,
    n = weeks.length;
  const H1 = Math.round((H - TOP - GAP - BOTTOM) * 0.42),
    H2 = H - TOP - GAP - BOTTOM - H1;
  const step = (W - LEFT - RIGHT) / n,
    bw = Math.min(10, step * 0.3);
  const balances = weeks.map(w => w.balance);
  const minB = Math.max(0, Math.floor((Math.min(...balances) - 5) / 10) * 10),
    maxB = Math.max(minB + 10, Math.ceil((Math.max(...balances) + 5) / 10) * 10);
  const y1 = (value: number) => TOP + H1 * (1 - (value - minB) / (maxB - minB));
  const maxV = Math.max(4, ...weeks.flatMap(w => [w.opened, w.resolved]));
  const y2 = (value: number) => TOP + H1 + GAP + H2 * (1 - value / maxV);
  const line = weeks.map((w, i) => `${i ? 'L' : 'M'}${(LEFT + step * (i + 0.5)).toFixed(1)} ${y1(w.balance).toFixed(1)}`).join(' ');
  const first = weeks[0],
    last = weeks[n - 1];
  // Rótulos do eixo: todos até 16 itens (as 12 semanas de sempre); acima disso, cerca de 12, sempre o último.
  const every = n > 16 ? Math.ceil(n / 12) : 1;
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Saldo em aberto de ${first.balance} para ${last.balance} pendências em ${n} ${bucket.many}`}
      >
        {[minB, (minB + maxB) / 2, maxB].map(mark => (
          <g key={`b-${mark}`}>
            <line x1={LEFT} y1={y1(mark)} x2={W - RIGHT} y2={y1(mark)} stroke={CHART.grid} />
            <text x={LEFT - 5} y={y1(mark) + 3} textAnchor="end" fontSize={9} fill={CHART.inkFaint}>
              {Math.round(mark)}
            </text>
          </g>
        ))}
        <path d={line} fill="none" stroke={CHART.ink} strokeWidth={2} strokeLinejoin="round" />
        {[0, n - 1].map(i => {
          const w = weeks[i],
            cx = LEFT + step * (i + 0.5);
          return (
            <g key={`p-${w.weekStart}`}>
              <circle cx={cx} cy={y1(w.balance)} r={3.5} fill={CHART.ink} stroke={CHART.surface} strokeWidth={1.5} />
              <text
                x={cx + (i ? -7 : 7)}
                y={y1(w.balance) - 6}
                textAnchor={i ? 'end' : 'start'}
                fontSize={10}
                fontWeight={700}
                fill={CHART.ink}
              >
                {w.balance} em aberto
              </text>
            </g>
          );
        })}
        {[0, maxV / 2, maxV].map(mark => (
          <g key={`v-${mark}`}>
            <line x1={LEFT} y1={y2(mark)} x2={W - RIGHT} y2={y2(mark)} stroke={CHART.grid} />
            <text x={LEFT - 5} y={y2(mark) + 3} textAnchor="end" fontSize={9} fill={CHART.inkFaint}>
              {Math.round(mark)}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const cx = LEFT + step * (i + 0.5);
          return (
            <g key={w.weekStart}>
              <rect x={cx - bw - 1} y={y2(w.opened)} width={bw} height={Math.max(0, y2(0) - y2(w.opened))} rx={2} fill={CHART.late} />
              <rect x={cx + 1} y={y2(w.resolved)} width={bw} height={Math.max(0, y2(0) - y2(w.resolved))} rx={2} fill={CHART.onTime} />
              {(i % every === 0 || i === n - 1) && (
                <text x={cx} y={H - BOTTOM + 13} textAnchor="middle" fontSize={9} fill={CHART.inkMuted}>
                  {typeof w.label === 'number' ? `S${w.label}` : w.label}
                </text>
              )}
            </g>
          );
        })}
        <line x1={LEFT} y1={y2(0)} x2={W - RIGHT} y2={y2(0)} stroke={CHART.gridStrong} />
      </svg>
      <Legend
        items={[
          { color: CHART.ink, line: true, text: `Saldo em aberto no fim ${bucket.of}` },
          { color: CHART.late, text: `Abertas ${within}` },
          { color: CHART.onTime, text: `Resolvidas ${within}` },
        ]}
      />
    </>
  );
}

'use client';
import { Fragment, memo, useEffect, useId, useMemo, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { ChartNoAxesGantt, Maximize2, Minimize2, Minus, Plus, Workflow } from 'lucide-react';
import {
  activitySpan, addDays, daysBetween, earliestStart, floorLabel, floorSchedule, fromMs, planSpan, precedenceLevels, toMs,
  type LocalDate, type LongTermActivity, type LongTermBaseline, type LongTermPlanDocument,
} from '@/domain/long-term-plan';
import { formatDate } from '@/shared/format';

/** Fluxograma de serviços que se expande em Linha de Balanço, num único <svg>. Cada pavimento de
 * cada serviço é um só <rect> nos dois modos: no fluxograma ele vive na miniatura do cartão, na
 * Linha de Balanço no gráfico da obra. Trocar de modo só muda o `transform` CSS desses retângulos,
 * e a transição faz cada pavimento voar de um lugar para o outro — é a "expansão" que a
 * ferramenta original prometia e que aqui fica literal. */

export type CanvasMode = 'flow' | 'lob';
export interface CanvasRect { floor: number; x: number; y: number; w: number; h: number }
export interface FlowNode { id: string; activity: LongTermActivity; x: number; y: number; width: number; height: number; column: number; row: number; expanded: boolean; rects: CanvasRect[] }
export interface LobRect extends CanvasRect { start: LocalDate; finish: LocalDate }
export interface LobBand { id: string; rects: LobRect[] }
export interface LobLayout {
  /** Janela do eixo do tempo, com folga de 21 dias de cada lado; `end` exclusivo. */
  start: LocalDate; end: LocalDate;
  pxPerDay: number; pxPerFloor: number;
  left: number; top: number; innerW: number; innerH: number; width: number; height: number;
  ticks: { x: number; label: string; major: boolean }[];
  floors: { floor: number; label: string; yTop: number; yBottom: number }[];
  bands: LobBand[];
  baseline: LobBand[];
}

// ─── Geometria ──────────────────────────────────────────────────────────────────

const PAD = 24, GAP_X = 76, GAP_Y = 20;
const NODE_W = 216, NODE_H = 104, NODE_WIDE = 404;
const THUMB = { top: 72, bottom: 96, side: 14 };
const ROW_TOP = 78, ROW_H = 16, ROW_CHART_LEFT = 82, ROW_DATES_W = 112;
const LOB = { left: 116, right: 28, top: 30, bottom: 40, width: 1080, pad: 21, gap: 2 };
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ZOOMS = [0.5, 1, 1.5, 2, 3];
const MIN_TICK_PX = 52;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const short = (date: LocalDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const floorsText = (document: LongTermPlanDocument, a: LongTermActivity) =>
  a.firstFloor === a.lastFloor ? `Pav. ${floorLabel(document, a.firstFloor)}` : `Pav. ${floorLabel(document, a.firstFloor)}–${floorLabel(document, a.lastFloor)}`;
const expandedHeight = (a: LongTermActivity) => ROW_TOP + (a.lastFloor - a.firstFloor + 1) * ROW_H + 12;
/** Nome escrito na cor do serviço, escurecida: algumas cores da paleta (âmbar, lima) não passam
 * de 3:1 sobre branco. */
function darken(hex: string, amount = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v * (1 - amount));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Pavimentos dentro do cartão: tempo relativo ao próprio serviço (x) e pavimentos empilhados de
 * baixo para cima (y). Recolhido é a miniatura; expandido, uma linha de balanço legível. */
function nodeRects(a: LongTermActivity, x: number, y: number, width: number, open: boolean): CanvasRect[] {
  const span = activitySpan(a);
  const slots = floorSchedule(a);
  const days = Math.max(1, span.days);
  if (open) {
    const left = x + ROW_CHART_LEFT, w = width - ROW_CHART_LEFT - ROW_DATES_W - 10;
    return slots.map(s => ({
      floor: s.floor, x: left + (daysBetween(span.start, s.start) / days) * w, y: y + ROW_TOP + (a.lastFloor - s.floor) * ROW_H + 3,
      w: Math.max(1, (s.duration / days) * w), h: ROW_H - 6,
    }));
  }
  const left = x + THUMB.side, w = width - 2 * THUMB.side, bottom = y + THUMB.bottom;
  const fh = (THUMB.bottom - THUMB.top) / slots.length, gap = fh >= 3 ? 1 : 0;
  return slots.map((s, i) => ({
    floor: s.floor, x: left + (daysBetween(span.start, s.start) / days) * w, y: bottom - (i + 1) * fh + gap / 2,
    w: Math.max(0.75, (s.duration / days) * w), h: Math.max(0.35, fh - gap),
  }));
}

/** Fluxograma AON: coluna = nível de precedência, linhas da coluna por data de início. As alturas
 * são variáveis (cartão expandido cresce) e a coluna toma a largura do seu cartão mais largo. */
export function flowLayout(document: LongTermPlanDocument, expanded: Set<string>) {
  const shown = document.activities.filter(a => a.visible);
  const levels = precedenceLevels(shown);
  const starts = new Map(shown.map(a => [a.id, activitySpan(a).start]));
  const columns: LongTermActivity[][] = [];
  for (const a of shown) (columns[levels.get(a.id) ?? 0] ??= []).push(a);
  const nodes: FlowNode[] = [];
  let x = PAD, height = 0;
  columns.forEach((group, column) => {
    group.sort((a, b) => starts.get(a.id)!.localeCompare(starts.get(b.id)!) || a.name.localeCompare(b.name, 'pt-BR'));
    let y = PAD, columnWidth = 0;
    group.forEach((activity, row) => {
      const open = expanded.has(activity.id);
      const width = open ? NODE_WIDE : NODE_W, h = open ? expandedHeight(activity) : NODE_H;
      nodes.push({ id: activity.id, activity, x, y, width, height: h, column, row, expanded: open, rects: nodeRects(activity, x, y, width, open) });
      y += h + GAP_Y;
      columnWidth = Math.max(columnWidth, width);
    });
    height = Math.max(height, y - GAP_Y + PAD);
    x += columnWidth + GAP_X;
  });
  return { nodes, width: nodes.length ? x - GAP_X + PAD : 0, height };
}

/** Linha de Balanço da obra: X = tempo (zoom escala só o tempo), Y = pavimentos de baixo para
 * cima. A linha de base entra na janela de tempo para os fantasmas não ficarem cortados. */
export function lobLayout(document: LongTermPlanDocument, zoom: number, baseline?: LongTermBaseline): LobLayout | undefined {
  const shown = document.activities.filter(a => a.visible);
  const ghosts = baseline?.activities.filter(a => a.visible) ?? [];
  const span = planSpan([...shown, ...ghosts]);
  if (!shown.length || !span) return undefined;
  const start = addDays(span.start, -LOB.pad), end = addDays(span.end, LOB.pad);
  const innerW = Math.round(LOB.width * zoom);
  const pxPerDay = innerW / Math.max(1, daysBetween(start, end));
  const pxPerFloor = Math.max(18, Math.min(40, 640 / document.floorCount));
  const innerH = pxPerFloor * document.floorCount;
  const xOf = (date: LocalDate) => LOB.left + daysBetween(start, date) * pxPerDay;
  const band = (a: LongTermActivity): LobBand => ({
    id: a.id,
    rects: floorSchedule(a).filter(s => s.floor <= document.floorCount).map(s => ({
      floor: s.floor, start: s.start, finish: s.finish, x: xOf(s.start), w: Math.max(1, s.duration * pxPerDay),
      y: LOB.top + innerH - s.floor * pxPerFloor + LOB.gap, h: pxPerFloor - 2 * LOB.gap,
    })),
  });
  // Passo adaptativo como no original (mês, trimestre, semestre), mais o ano para obras longas no zoom mínimo.
  const pxPerMonth = 30.44 * pxPerDay;
  const step = [1, 3, 6, 12].find(s => pxPerMonth * s >= MIN_TICK_PX) ?? 12;
  const ticks: LobLayout['ticks'] = [];
  const d = new Date(toMs(start));
  d.setUTCDate(1);
  d.setUTCMonth(Math.floor(d.getUTCMonth() / step) * step);
  while (d.getTime() <= toMs(end)) {
    const m = d.getUTCMonth(), yy = String(d.getUTCFullYear()).slice(2);
    const label = step === 1 ? `${MONTHS[m]}/${yy}` : step === 3 ? `T${Math.floor(m / 3) + 1}/${yy}` : step === 6 ? `S${m < 6 ? 1 : 2}/${yy}` : String(d.getUTCFullYear());
    const x = xOf(fromMs(d.getTime()));
    if (x >= LOB.left) ticks.push({ x, label, major: m === 0 });
    d.setUTCMonth(m + step);
  }
  const floors = Array.from({ length: document.floorCount }, (_, i) => {
    const floor = i + 1;
    return { floor, label: floorLabel(document, floor), yTop: LOB.top + innerH - floor * pxPerFloor, yBottom: LOB.top + innerH - (floor - 1) * pxPerFloor };
  });
  return {
    start, end, pxPerDay, pxPerFloor, left: LOB.left, top: LOB.top, innerW, innerH,
    width: LOB.left + innerW + LOB.right, height: LOB.top + innerH + LOB.bottom,
    ticks, floors, bands: shown.map(band), baseline: ghosts.map(band),
  };
}

// ─── Estilo ─────────────────────────────────────────────────────────────────────

const CSS = `
.pc-f,.pc-move{transform-box:view-box;transform-origin:0 0}
.pc-f{transition:transform 600ms cubic-bezier(.2,.8,.2,1),fill-opacity 600ms ease}
.pc-move{transition:transform 600ms cubic-bezier(.2,.8,.2,1)}
.pc-layer{transition:opacity 350ms ease}
[data-aid],[data-from]{transition:opacity 150ms ease}
.pc-instant .pc-f,.pc-instant .pc-move,.pc-instant.pc-f{transition:none}
.pc-flow .pc-fill{fill-opacity:.9;stroke-width:0}
.pc-lob .pc-fill{fill-opacity:.55;stroke-width:1}
.pc-focus{outline:none}
.pc-focus:focus-visible{outline:2px solid #1d4ed8;outline-offset:3px}
.pc-node:focus-visible .pc-card{stroke:#1d4ed8;stroke-width:2.5}
@media (prefers-reduced-motion:reduce){.pc-f,.pc-move,.pc-layer,[data-aid],[data-from]{transition:none!important}}
`;
const cssString = (value: string) => value.replace(/[\n\r]/g, '').replace(/["\\]/g, c => `\\${c}`);
const tf = (r: Pick<CanvasRect, 'x' | 'y' | 'w' | 'h'>) => `translate(${r2(r.x)}px,${r2(r.y)}px) scale(${r3(Math.max(0, r.w))},${r3(Math.max(0, r.h))})`;
const layer = (on: boolean): CSSProperties => ({ opacity: on ? 1 : 0, pointerEvents: on ? undefined : 'none' });
const idAt = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-aid]')?.getAttribute('data-aid') ?? '';

// ─── Peças do desenho ───────────────────────────────────────────────────────────

/** Os retângulos que voam entre os modos. Memo: o hover é CSS e o arraste só muda o `offset` do
 * serviço arrastado, então os outros 399 serviços não re-renderizam. */
const Band = memo(function Band({ activity, flow, lob, mode, percent, offset, draggable, instant, label }: {
  activity: LongTermActivity; flow: CanvasRect[]; lob?: CanvasRect[]; mode: CanvasMode; percent?: number;
  offset: number; draggable: boolean; instant: boolean; label: string;
}) {
  const inLob = mode === 'lob' && !!lob;
  const rects = flow.map((r, i) => (inLob ? lob![i] ?? r : r));
  return <g data-aid={activity.id} className={`pc-focus${instant ? ' pc-instant' : ''}`} transform={offset ? `translate(${r2(offset)} 0)` : undefined}
    role={inLob ? 'button' : undefined} tabIndex={inLob ? 0 : -1} aria-label={inLob ? label : undefined} aria-hidden={inLob ? undefined : true}
    style={{ cursor: draggable ? 'grab' : 'pointer', touchAction: draggable ? 'pan-y' : undefined }}>
    {inLob && <title>{label}</title>}
    {rects.map(r => <rect key={r.floor} className="pc-f pc-fill" x={0} y={0} width={1} height={1} fill={activity.color} stroke={activity.color}
      vectorEffect="non-scaling-stroke" style={{ transform: tf(r) }} />)}
    {percent !== undefined && rects.map(r => {
      const strip = Math.min(4, r.h * 0.3);
      return <Fragment key={`p${r.floor}`}>
        <rect className="pc-f" x={0} y={0} width={1} height={1} fill="#e2e8f0" fillOpacity={0.7} style={{ transform: tf({ x: r.x, y: r.y + r.h - strip, w: r.w, h: strip }) }} />
        <rect className="pc-f" x={0} y={0} width={1} height={1} fill={activity.color} style={{ transform: tf({ x: r.x, y: r.y + r.h - strip, w: (r.w * percent) / 100, h: strip }) }} />
      </Fragment>;
    })}
  </g>;
});

/** Espinha tracejada pelos inícios e rótulo, só na Linha de Balanço. O rótulo não vai sempre no
 * pavimento do meio: serviços encadeados ficam lado a lado ali e os nomes se atropelavam. Cada
 * serviço desloca o rótulo três pavimentos em relação ao anterior. */
const BandOverlay = memo(function BandOverlay({ id, rects, color, name, percent, offset, slot }: {
  id: string; rects: CanvasRect[]; color: string; name: string; percent?: number; offset: number; slot: number;
}) {
  if (!rects.length) return null;
  const mid = rects[(Math.floor(rects.length / 2) + slot * 3) % rects.length];
  const text = clip(percent !== undefined ? `${name} ${Math.round(percent)}%` : name, 40);
  return <g data-aid={id} transform={offset ? `translate(${r2(offset)} 0)` : undefined}>
    {rects.length > 1 && <polyline points={rects.map(r => `${r2(r.x)},${r2(r.y + r.h / 2)}`).join(' ')} fill="none" stroke={color} strokeWidth={0.8} strokeDasharray="3 2" opacity={0.6} />}
    <text x={r2(mid.x + mid.w / 2)} y={r2(mid.y + mid.h / 2 + 4)} fontSize={11} fontWeight={700} fill={darken(color)} textAnchor="middle"
      stroke="white" strokeWidth={3.5} strokeLinejoin="round" paintOrder="stroke">{text}</text>
  </g>;
});

const Ghosts = memo(function Ghosts({ bands }: { bands: LobBand[] }) {
  return <g>{bands.flatMap(b => b.rects.map(r => <rect key={`${b.id}-${r.floor}`} x={r2(r.x)} y={r2(r.y)} width={r2(r.w)} height={r2(r.h)}
    fill="#94a3b8" fillOpacity={0.22} stroke="#94a3b8" strokeDasharray="3 2" />))}</g>;
});

const LobAxes = memo(function LobAxes({ lob }: { lob: LobLayout }) {
  const { left, top, innerW, innerH } = lob;
  return <g>
    <rect x={left} y={top} width={innerW} height={innerH} fill="#f8fafc" />
    {lob.floors.map((f, i) => (i % 2 === 0 ? <rect key={`z${f.floor}`} x={left} y={f.yTop} width={innerW} height={f.yBottom - f.yTop} fill="#f1f5f9" /> : null))}
    {lob.floors.map(f => <line key={`l${f.floor}`} x1={left} x2={left + innerW} y1={f.yTop} y2={f.yTop} stroke="#e2e8f0" strokeWidth={0.5} />)}
    {lob.ticks.map(t => <g key={`${t.label}-${t.x}`}>
      <line x1={r2(t.x)} x2={r2(t.x)} y1={top} y2={top + innerH} stroke={t.major ? '#cbd5e1' : '#e2e8f0'} strokeWidth={t.major ? 1.5 : 1} />
      <text x={r2(t.x)} y={top + innerH + 17} fontSize={t.major ? 11 : 10} fontWeight={t.major ? 700 : 400} fill={t.major ? '#334155' : '#64748b'} textAnchor="middle">{t.label}</text>
    </g>)}
    {lob.floors.map(f => <text key={`t${f.floor}`} x={left - 8} y={r2((f.yTop + f.yBottom) / 2 + 3.5)} fontSize={10} fontWeight={500} fill="#475569" textAnchor="end">{clip(f.label, 16)}</text>)}
    <rect x={left} y={top} width={innerW} height={innerH} fill="none" stroke="#cbd5e1" strokeWidth={1.5} />
    <text x={left - 8} y={top - 12} fontSize={10} fontWeight={700} fill="#64748b" textAnchor="end" letterSpacing="0.08em">PAVIMENTO</text>
  </g>;
});

function NodeCard({ node, document, percent, interactive }: { node: FlowNode; document: LongTermPlanDocument; percent?: number; interactive: boolean }) {
  const a = node.activity, span = activitySpan(a), w = node.width, h = node.height, wide = node.expanded;
  const floors = floorsText(document, a);
  const people = a.teams.reduce((sum, t) => sum + t.size, 0);
  const meta = [a.teams.length ? `${plural(a.teams.length, 'equipe', 'equipes')} · ${plural(people, 'pessoa', 'pessoas')}` : '', percent !== undefined ? `${Math.round(percent)}% medido` : ''].filter(Boolean).join(' · ');
  const lineMax = wide ? 66 : 34;
  return <g className="pc-move" style={{ transform: `translate(${node.x}px,${node.y}px)` }}>
    <g data-aid={a.id} role="button" tabIndex={interactive ? 0 : -1} className="pc-node pc-focus" style={{ '--c': a.color, cursor: 'pointer' } as CSSProperties}
      aria-label={`${a.name}: ${formatDate(span.start)} a ${formatDate(span.finish)}, ${floors}. Abrir serviço.`}>
      <title>{a.name}</title>
      <rect x={2} y={3} width={w} height={h} rx={10} fill="#0f172a" fillOpacity={0.06} />
      <rect className="pc-card" width={w} height={h} rx={10} fill="white" stroke="#e2e8f0" />
      <rect width={6} height={h} rx={3} fill={a.color} />
      <text x={16} y={21} fontSize={12} fontWeight={700} fill="#0f172a">{clip(a.name, wide ? 48 : 23)}</text>
      <text x={16} y={36} fontSize={10} fill="#475569">{formatDate(span.start)} → {formatDate(span.finish)} · {span.days}d</text>
      <text x={16} y={50} fontSize={10} fill="#64748b">{clip(`${floors} · ${a.duration}d/pav · ritmo ${a.interval}d`, lineMax)}</text>
      {meta && <text x={16} y={64} fontSize={10} fill="#64748b">{clip(meta, lineMax)}</text>}
      {!wide && <rect x={THUMB.side - 4} y={THUMB.top - 3} width={w - 2 * THUMB.side + 8} height={THUMB.bottom - THUMB.top + 6} rx={4} fill="#f8fafc" stroke="#eef2f7" />}
      {wide && <>
        <line x1={10} x2={w - 10} y1={ROW_TOP - 4} y2={ROW_TOP - 4} stroke="#e2e8f0" />
        {floorSchedule(a).map(s => {
          const row = a.lastFloor - s.floor, y = ROW_TOP + row * ROW_H;
          return <g key={s.floor}>
            {row % 2 === 0 && <rect x={8} y={y} width={w - 16} height={ROW_H} fill="#f8fafc" />}
            <text x={14} y={y + 11.5} fontSize={9.5} fill="#475569">{clip(floorLabel(document, s.floor), 11)}</text>
            <text x={w - 12} y={y + 11.5} fontSize={9.5} fill="#475569" textAnchor="end" className="tabular-nums">{short(s.start)} – {short(s.finish)}</text>
          </g>;
        })}
        <line x1={ROW_CHART_LEFT} x2={ROW_CHART_LEFT} y1={ROW_TOP} y2={h - 12} stroke="#e2e8f0" />
        <line x1={w - ROW_DATES_W - 10} x2={w - ROW_DATES_W - 10} y1={ROW_TOP} y2={h - 12} stroke="#e2e8f0" />
      </>}
    </g>
    <g data-toggle={a.id} role="button" tabIndex={interactive ? 0 : -1} aria-expanded={wide} className="pc-focus" style={{ cursor: 'pointer' }}
      aria-label={`${wide ? 'Recolher' : 'Expandir'} os pavimentos de ${a.name}`} transform={`translate(${w - 30} 6)`}>
      <rect width={24} height={24} rx={6} fill="#f1f5f9" />
      <path d={wide ? 'M7 14.5 L12 9.5 L17 14.5' : 'M7 9.5 L12 14.5 L17 9.5'} fill="none" stroke="#334155" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </g>;
}

const FlowChrome = memo(function FlowChrome({ flow, document, percents, interactive, markerId }: {
  flow: ReturnType<typeof flowLayout>; document: LongTermPlanDocument; percents: Record<string, number>; interactive: boolean; markerId: string;
}) {
  const byId = new Map(flow.nodes.map(n => [n.id, n]));
  // Âncora no meio do cabeçalho: com cartão expandido as setas continuam saindo do nome.
  const anchor = (n: FlowNode) => n.y + Math.min(n.height, NODE_H) / 2;
  return <>
    <g>{flow.nodes.flatMap(node => node.activity.predecessors.map(link => {
      const pred = byId.get(link.activityId);
      if (!pred) return null;
      const x1 = pred.x + pred.width, y1 = anchor(pred), x2 = node.x - 1, y2 = anchor(node), c = (x2 - x1) / 2;
      const tag = [link.lagDays ? `${link.lagDays > 0 ? '+' : '−'}${Math.abs(link.lagDays)}d` : '', link.floor !== undefined ? `após ${floorLabel(document, link.floor)}` : ''].filter(Boolean).join(' · ');
      return <g key={`${pred.id}>${node.id}`} data-from={pred.id} data-to={node.id}>
        <path d={`M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`} fill="none" stroke="#94a3b8" strokeWidth={1.5} markerEnd={`url(#${markerId})`} />
        {tag && <text x={r2((x1 + x2) / 2)} y={r2((y1 + y2) / 2 - 5)} fontSize={10} fontWeight={600} fill="#475569" textAnchor="middle"
          stroke="white" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">{tag}</text>}
      </g>;
    }))}</g>
    {flow.nodes.map(node => <NodeCard key={node.id} node={node} document={document} percent={percents[node.id]} interactive={interactive} />)}
  </>;
});

// ─── Componente ─────────────────────────────────────────────────────────────────

interface Drag { id: string; pointerId: number; x0: number; start: LocalDate; min?: number; days: number; moved: boolean; scale: number }

export function PlanCanvas({ document, mode, onModeChange, today, baseline, percents, hoverId, onHover, readOnly, onOpen, onMove, onCreate }: {
  document: LongTermPlanDocument;
  mode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
  today: LocalDate;
  baseline?: LongTermBaseline;
  percents: Record<string, number>;
  hoverId: string;
  onHover: (activityId: string) => void;
  readOnly: boolean;
  onOpen: (activityId: string) => void;
  onMove: (activityId: string, start: LocalDate) => void;
  onCreate: () => void;
}) {
  const svgId = `pc-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Serviço recém-solto (ou '*' após zoom): sem transição, para não voltar ao lugar antigo e deslizar. */
  const [instant, setInstant] = useState('');
  /** Modo cujo tamanho o <svg> já assumiu. Durante a animação vale o maior dos dois, senão os
   * retângulos em voo seriam cortados. */
  const [settled, setSettled] = useState(mode);

  const shown = useMemo(() => document.activities.filter(a => a.visible), [document.activities]);
  const byId = useMemo(() => new Map(document.activities.map(a => [a.id, a])), [document.activities]);
  const flow = useMemo(() => flowLayout(document, expanded), [document, expanded]);
  const lob = useMemo(() => lobLayout(document, zoom, baseline), [document, zoom, baseline]);
  const flowRects = useMemo(() => new Map(flow.nodes.map(n => [n.id, n.rects])), [flow]);
  const lobRects = useMemo(() => new Map(lob?.bands.map(b => [b.id, b.rects]) ?? []), [lob]);
  const labels = useMemo(() => new Map(shown.map(a => {
    const span = activitySpan(a);
    const pct = percents[a.id] !== undefined ? `, ${Math.round(percents[a.id])}% medido` : '';
    const hint = readOnly ? '' : '. Arraste ou use as setas para reprogramar';
    return [a.id, `${a.name}, ${floorsText(document, a)}, ${formatDate(span.start)} a ${formatDate(span.finish)}${pct}${hint}`];
  })), [shown, document, percents, readOnly]);
  const span = useMemo(() => planSpan(shown), [shown]);

  useEffect(() => {
    if (settled === mode) return;
    const timer = window.setTimeout(() => setSettled(mode), 650);
    return () => window.clearTimeout(timer);
  }, [mode, settled]);
  useEffect(() => {
    if (!instant) return;
    const timer = window.setTimeout(() => setInstant(''), 120);
    return () => window.clearTimeout(timer);
  }, [instant]);

  if (!shown.length || !span) return <section className="panel px-6 py-10 text-center">
    <Workflow className="mx-auto text-slate-300" size={32} aria-hidden="true" />
    <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">Nenhum serviço no plano ainda. Comece pelo primeiro serviço — as predecessoras montam o fluxograma sozinhas.</p>
    {!readOnly && <button type="button" className="button mt-4" onClick={onCreate}><Plus size={16} aria-hidden="true" />Novo serviço</button>}
  </section>;

  const inLob = mode === 'lob' && !!lob;
  const draggable = inLob && !readOnly;
  const flowSize = { w: flow.width, h: flow.height };
  const lobSize = lob ? { w: lob.width, h: lob.height } : flowSize;
  const size = settled === mode
    ? (inLob ? lobSize : flowSize)
    : { w: Math.max(flowSize.w, lobSize.w), h: Math.max(flowSize.h, lobSize.h) };
  const columns = new Set(flow.nodes.map(n => n.column)).size;
  const markerId = `${svgId}-seta`;

  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const changeZoom = (value: number) => { setInstant('*'); setZoom(value); };
  const hover = (id: string) => { if (id !== hoverId) onHover(id); };

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (!draggable || !lob || e.button !== 0) return;
    const id = idAt(e.target), activity = id ? byId.get(id) : undefined;
    if (!activity) return;
    const svg = e.currentTarget;
    svg.setPointerCapture(e.pointerId);
    const earliest = earliestStart(activity, document.activities);
    const box = svg.getBoundingClientRect();
    setDrag({ id, pointerId: e.pointerId, x0: e.clientX, start: activity.start, min: earliest ? daysBetween(activity.start, earliest) : undefined, days: 0, moved: false, scale: box.width ? size.w / box.width : 1 });
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!drag || !lob || e.pointerId !== drag.pointerId) return;
    const px = (e.clientX - drag.x0) * drag.scale;
    const moved = drag.moved || Math.abs(px) >= 4;
    let days = moved ? Math.round(px / lob.pxPerDay) : 0;
    // Nunca antes do que as predecessoras permitem: o mesmo mínimo que a reprogramação usa.
    if (moved && drag.min !== undefined) days = Math.max(days, drag.min);
    if (days !== drag.days || moved !== drag.moved) setDrag({ ...drag, days, moved });
  }
  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!drag.moved) onOpen(drag.id);
    else if (drag.days !== 0) { setInstant(drag.id); onMove(drag.id, addDays(drag.start, drag.days)); }
    setDrag(null);
  }
  function onClick(e: MouseEvent<SVGSVGElement>) {
    const toggleId = (e.target as Element).closest?.('[data-toggle]')?.getAttribute('data-toggle');
    if (toggleId) { toggle(toggleId); return; }
    if (draggable) return; // o soltar do arraste já decide entre abrir e mover
    const id = idAt(e.target);
    if (id) onOpen(id);
  }
  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    const target = e.target as Element;
    const activate = e.key === 'Enter' || e.key === ' ';
    const toggleId = target.getAttribute('data-toggle');
    if (toggleId) { if (activate) { e.preventDefault(); toggle(toggleId); } return; }
    const id = target.getAttribute('data-aid');
    if (!id || target.getAttribute('role') !== 'button') return;
    if (activate) { e.preventDefault(); onOpen(id); return; }
    if (draggable && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const activity = byId.get(id);
      if (!activity) return;
      e.preventDefault();
      const earliest = earliestStart(activity, document.activities);
      let next = addDays(activity.start, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 7 : 1));
      if (earliest && next < earliest) next = earliest;
      if (next !== activity.start) onMove(id, next);
    }
  }
  const onFocus = (e: FocusEvent<SVGSVGElement>) => { const id = (e.target as Element).getAttribute('data-aid'); if (id) hover(id); };

  const hovered = hoverId && byId.has(hoverId) ? cssString(hoverId) : '';
  const hoverCss = hovered
    ? `#${svgId} [data-aid]:not([data-aid="${hovered}"]),#${svgId} [data-from]:not([data-from="${hovered}"]):not([data-to="${hovered}"]){opacity:.18}`
      + `#${svgId} [data-aid="${hovered}"] .pc-card{stroke:var(--c);stroke-width:2}#${svgId} [data-aid="${hovered}"] .pc-fill{fill-opacity:.85}`
    : '';

  const todayX = lob ? lob.left + daysBetween(lob.start, today) * lob.pxPerDay : -1;
  const showToday = !!lob && todayX >= lob.left && todayX <= lob.left + lob.innerW;
  const dragOffset = (id: string) => (drag?.id === id && lob ? drag.days * lob.pxPerDay : 0);

  const tooltip = (() => {
    if (!drag?.moved || !lob) return null;
    const first = lobRects.get(drag.id)?.[0];
    if (!first) return null;
    const clamped = drag.min !== undefined && drag.days === drag.min;
    const text = `Início ${formatDate(addDays(drag.start, drag.days))}${clamped ? ' · limite das predecessoras' : ''}`;
    const w = text.length * 6.3 + 18;
    const x = Math.max(4, Math.min(first.x + drag.days * lob.pxPerDay, size.w - w - 4)), y = Math.max(22, first.y - 8);
    return <g pointerEvents="none" aria-hidden="true">
      <rect x={r2(x)} y={r2(y - 17)} width={r2(w)} height={22} rx={6} fill="#0f172a" />
      <text x={r2(x + 9)} y={r2(y - 2)} fontSize={11} fontWeight={600} fill="white">{text}</text>
    </g>;
  })();

  const title = inLob ? 'Linha de Balanço' : 'Fluxograma';
  const hint = inLob
    ? `Cada retângulo é um serviço num pavimento · largura = duração · inclinação = ritmo.${readOnly ? '' : ' Arraste para reprogramar.'}`
    : 'Cada cartão é um serviço; as setas são as predecessoras. Expanda um cartão para ver os pavimentos, ou a obra inteira em Linha de Balanço.';
  const summary = inLob
    ? `Linha de Balanço com ${plural(shown.length, 'serviço', 'serviços')} em ${plural(document.floorCount, 'pavimento', 'pavimentos')}, de ${formatDate(span.start)} a ${formatDate(span.finish)}.`
    : `Fluxograma com ${plural(shown.length, 'serviço', 'serviços')} em ${plural(columns, 'nível', 'níveis')} de precedência, de ${formatDate(span.start)} a ${formatDate(span.finish)}.`;
  const zoomLabel = (z: number) => `${String(z).replace('.', ',')}×`;

  return <section className="panel overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <div className="min-w-0 max-w-2xl">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {inLob ? <ChartNoAxesGantt size={16} className="text-blue-700" aria-hidden="true" /> : <Workflow size={16} className="text-blue-700" aria-hidden="true" />}{title}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Visualização" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(['flow', 'lob'] as const).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => onModeChange(m)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${mode === m ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {m === 'flow' ? 'Fluxograma' : 'Linha de Balanço'}
          </button>)}
        </div>
        <button type="button" className="button" onClick={() => onModeChange(inLob ? 'flow' : 'lob')}>
          {inLob ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          {inLob ? 'Recolher em fluxograma' : 'Expandir em Linha de Balanço'}
        </button>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-2.5">
      <div className="flex max-h-24 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 overflow-y-auto custom-scrollbar">
        {shown.map(a => <button key={a.id} type="button" title={`Abrir ${a.name}`} onClick={() => onOpen(a.id)}
          onMouseEnter={() => hover(a.id)} onMouseLeave={() => hover('')} onFocus={() => hover(a.id)} onBlur={() => hover('')}
          className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-colors hover:text-slate-900 ${hoverId === a.id ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: a.color }} aria-hidden="true" />{a.name}
        </button>)}
        {baseline && <span className="badge-muted"><span className="h-2.5 w-5 rounded-sm border border-dashed border-slate-400 bg-slate-200" aria-hidden="true" />Linha de base: {baseline.name}</span>}
      </div>
      {inLob && <div role="group" aria-label="Zoom do eixo do tempo" className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs font-semibold text-slate-500">Zoom</span>
        {ZOOMS.map(z => <button key={z} type="button" aria-pressed={zoom === z} onClick={() => changeZoom(z)}
          className={`rounded-md border px-2 py-1 text-xs font-semibold tabular-nums transition-colors ${zoom === z ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-800'}`}>{zoomLabel(z)}</button>)}
        <div className="ml-1 inline-flex items-center overflow-hidden rounded-md border border-slate-200">
          <button type="button" aria-label="Diminuir zoom" onClick={() => changeZoom(Math.max(0.25, Math.round((zoom - 0.25) * 4) / 4))} className="px-2 py-1.5 text-slate-600 hover:bg-slate-100"><Minus size={12} aria-hidden="true" /></button>
          <span className="min-w-11 px-1 text-center text-xs font-semibold tabular-nums text-slate-700" aria-live="polite">{zoomLabel(zoom)}</span>
          <button type="button" aria-label="Aumentar zoom" onClick={() => changeZoom(Math.min(6, Math.round((zoom + 0.25) * 4) / 4))} className="px-2 py-1.5 text-slate-600 hover:bg-slate-100"><Plus size={12} aria-hidden="true" /></button>
        </div>
      </div>}
    </div>

    <div className="overflow-x-auto custom-scrollbar" role="region" aria-label={title} tabIndex={0}>
      <svg id={svgId} width={Math.ceil(size.w)} height={Math.ceil(size.h)} viewBox={`0 0 ${Math.ceil(size.w)} ${Math.ceil(size.h)}`}
        className={`block ${inLob ? 'pc-lob' : 'pc-flow'}${instant === '*' ? ' pc-instant' : ''}`} role="group" aria-label={summary}
        style={{ cursor: drag?.moved ? 'grabbing' : undefined, fontFamily: 'inherit' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}
        onPointerOver={e => { if (!drag) hover(idAt(e.target)); }} onPointerLeave={() => { if (!drag) hover(''); }}
        onClick={onClick} onKeyDown={onKeyDown} onFocus={onFocus} onBlur={() => hover('')}>
        <style>{CSS + hoverCss}</style>
        <defs>
          <marker id={markerId} markerWidth={8} markerHeight={6} refX={8} refY={3} orient="auto"><polygon points="0 0, 8 3, 0 6" fill="#94a3b8" /></marker>
        </defs>
        {lob && <g className="pc-layer" style={layer(inLob)} aria-hidden="true"><LobAxes lob={lob} /></g>}
        <g className="pc-layer" style={layer(!inLob)} aria-hidden={inLob ? true : undefined}>
          <FlowChrome flow={flow} document={document} percents={percents} interactive={!inLob} markerId={markerId} />
        </g>
        {lob && baseline && <g className="pc-layer" style={layer(inLob)} pointerEvents="none" aria-hidden="true"><Ghosts bands={lob.baseline} /></g>}
        <g>{shown.map(a => <Band key={a.id} activity={a} flow={flowRects.get(a.id) ?? []} lob={lobRects.get(a.id)} mode={mode} percent={percents[a.id]}
          offset={dragOffset(a.id)} draggable={draggable} instant={instant === a.id} label={labels.get(a.id) ?? a.name} />)}</g>
        {lob && <g className="pc-layer" style={layer(inLob)} pointerEvents="none" aria-hidden="true">
          {shown.map((a, slot) => <BandOverlay key={a.id} slot={slot} id={a.id} rects={lobRects.get(a.id) ?? []} color={a.color} name={a.name} percent={percents[a.id]} offset={dragOffset(a.id)} />)}
          {showToday && <g>
            <line x1={r2(todayX)} x2={r2(todayX)} y1={lob.top} y2={lob.top + lob.innerH} stroke="#d97706" strokeWidth={1.5} strokeDasharray="6 3" />
            <text x={r2(todayX + 4)} y={lob.top - 12} fontSize={10} fontWeight={700} fill="#b45309">Hoje</text>
          </g>}
        </g>}
        {tooltip}
      </svg>
    </div>
  </section>;
}

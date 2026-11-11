'use client';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  addWorkdays,
  delayDays,
  descendants,
  isLate,
  plannedPercent,
  type LobActivity,
  type LobBaseline,
  type LobData,
  type LobService,
  type LocalDate,
} from '@/domain/lob';
import { daysBetween } from '@/domain/long-term-plan';
import { CHART } from '@/shared/palette';
import { formatDate } from '@/shared/format';
import {
  GEOMETRY,
  clip,
  inkOn,
  labelChars,
  lobLayout,
  plural,
  shortDate,
  typicalDurations,
  weekdayDate,
  type LobBlock,
  type LobLayout,
  type LobZoom,
} from './lob-model';

export type { LobZoom } from './lob-model';

/** Linha de Balanço no estilo Prevision (aba 1, modelo aprovado em 04/11/2026). Um <svg> por obra:
 * eixo vertical = locais de baixo para cima, eixo horizontal = tempo; cada bloco é um serviço num
 * local, na cor do serviço, com a parte medida cheia e a parte a fazer a 42%. Rótulos dos locais
 * ficam fixos à esquerda (coluna `position: sticky`) enquanto o gráfico rola. Toda a geometria vem
 * de `lob-model.ts`; aqui ficam só o desenho e a interação (seleção, tooltip, arrasto, teclado). */

export interface LobChartProps {
  data: LobData;
  /** AAAA-MM-DD. */
  today: string;
  /** Acumulado medido por activityId (de `measuredPercents`). */
  percents: Record<string, number>;
  /** Medições fechadas, para as linhas verticais azuis. */
  measurementDates: { number: number; date: string }[];
  /** Sobreposição fantasma cinza (snapshot) quando escolhida. */
  baseline?: LobBaseline;
  /** Serviços ocultos pela legenda. */
  hiddenServiceIds: ReadonlySet<string>;
  /** Filtro de locais; undefined = todos. */
  visibleLocalIds?: ReadonlySet<string>;
  /** Filtro de período; undefined = plano inteiro. */
  range?: { start: string; end: string };
  zoom: LobZoom;
  selectedId?: string;
  /** Sem arrastar nem mover pelo teclado. */
  readOnly: boolean;
  onSelect: (id: string | undefined) => void;
  /** Ao soltar o arrasto (ou pelas setas), com a data já no dia útil. */
  onMove: (id: string, start: string) => void;
  /** Quando muda, rola a área para "hoje" ficar visível. */
  scrollToTodayToken?: number;
}

// ─── Utilitários ────────────────────────────────────────────────────────────────

const STYLE = `
.lob-block{transition:transform 220ms cubic-bezier(.2,.8,.2,1),opacity 150ms ease;outline:none}
.lob-block:hover .lob-base{fill-opacity:.62}
.lob-block:focus-visible .lob-base{stroke:var(--color-primary);stroke-width:2}
.lob-dim{opacity:.3}
.lob-dragging{transition:none}
@media (prefers-reduced-motion:reduce){.lob-block{transition:none!important}}
`;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const idAt = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-aid]')?.getAttribute('data-aid') ?? undefined;
const escapeId = (id: string) => (typeof CSS !== 'undefined' && 'escape' in CSS ? CSS.escape(id) : id);
const percentText = (value: number) => `${String(Math.round(value * 10) / 10).replace('.', ',')}%`;
const sameSet = (a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined) => {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
};
const sameRecord = (a: Record<string, number>, b: Record<string, number>) => {
  if (a === b) return true;
  const ka = Object.keys(a),
    kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
};
const sameDates = (a: LobChartProps['measurementDates'], b: LobChartProps['measurementDates']) =>
  a === b || (a.length === b.length && a.every((m, i) => m.number === b[i].number && m.date === b[i].date));
const sameRange = (a: LobChartProps['range'], b: LobChartProps['range']) =>
  a === b || (!!a && !!b && a.start === b.start && a.end === b.end);

/** Devolve a mesma referência enquanto o valor for igual por conteúdo. O gráfico memoiza o layout
 * e as linhas por referência; se o contêiner recriar `percents` ou um `Set` a cada render, sem isto
 * cada passagem do mouse redesenharia os cinco mil blocos. Padrão oficial de estado derivado do
 * render anterior (setState condicional durante o render). */
function useStable<T>(value: T, equals: (a: T, b: T) => boolean): T {
  const [stable, setStable] = useState(value);
  if (!equals(stable, value)) {
    setStable(value);
    return value;
  }
  return stable;
}

// ─── Camadas estáticas (memo: não mudam com hover nem seleção) ──────────────────

/** Fundo com faixas alternadas por local, grade dos meses e régua das segundas-feiras. */
const Axes = memo(function Axes({ layout }: { layout: LobLayout }) {
  const { left, top, innerW, innerH, rows, rowHeight } = layout;
  const bottomY = top + innerH;
  return (
    <g aria-hidden="true">
      <rect x={left} y={top} width={innerW} height={innerH} fill={CHART.surfaceMuted} />
      {rows.map(r =>
        r.index % 2 === 0 ? (
          <rect key={`z${r.local.id}`} x={left} y={r.y} width={innerW} height={rowHeight} fill={CHART.surfaceAlt} />
        ) : null,
      )}
      {rows.map(r => (
        <line key={`l${r.local.id}`} x1={left} x2={left + innerW} y1={r.y} y2={r.y} stroke={CHART.grid} strokeWidth={0.6} />
      ))}
      {layout.months.map(m => (
        <g key={m.x}>
          <line
            x1={m.x}
            x2={m.x}
            y1={top}
            y2={bottomY}
            stroke={m.yearStart ? CHART.gridStrong : CHART.grid}
            strokeWidth={m.yearStart ? 1.5 : 1}
          />
          {m.labeled && (
            <text
              x={m.x + 3}
              y={top - 10}
              fontSize={10}
              fontWeight={m.yearStart ? 700 : 500}
              fill={m.yearStart ? CHART.ink : CHART.inkMuted}
            >
              {m.label}
            </text>
          )}
        </g>
      ))}
      {layout.mondays.map(x => (
        <line key={x} x1={x} x2={x} y1={bottomY} y2={bottomY + 4} stroke={CHART.gridStrong} />
      ))}
    </g>
  );
});

/** Linhas verticais por cima dos blocos: medições (M1, M2…) e "Hoje"; mais a moldura. Sem eventos
 * de ponteiro, para não roubar o hover dos blocos que cruzam. */
const Markers = memo(function Markers({ layout, today }: { layout: LobLayout; today: LocalDate }) {
  const { left, top, innerW, innerH, todayX } = layout;
  const bottomY = top + innerH;
  return (
    <g pointerEvents="none" aria-hidden="true">
      {layout.measurements.map(m => {
        const w = 10 + 6 * m.label.length;
        return (
          <g key={`${m.label}-${m.x}`}>
            <line x1={m.x} x2={m.x} y1={top} y2={bottomY} stroke={CHART.link} strokeWidth={1.5} />
            <rect x={m.x - w / 2} y={top + 2} width={w} height={12} rx={3} fill={CHART.link} />
            <text x={m.x} y={top + 11} textAnchor="middle" fontSize={8.5} fontWeight={800} fill="#ffffff">
              {m.label}
            </text>
          </g>
        );
      })}
      {todayX !== undefined && (
        <g>
          <line x1={todayX} x2={todayX} y1={top - 4} y2={bottomY} stroke={CHART.today} strokeWidth={1.75} strokeDasharray="4 3" />
          <rect x={todayX - 26} y={bottomY + 6} width={52} height={14} rx={4} fill={CHART.today} />
          <text x={todayX} y={bottomY + 16.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="#ffffff">
            Hoje {shortDate(today)}
          </text>
        </g>
      )}
      <rect x={left} y={top} width={innerW} height={innerH} fill="none" stroke={CHART.gridStrong} strokeWidth={1.5} />
    </g>
  );
});

/** Linha de base: contorno tracejado cinza onde o bloco estava no snapshot. */
const Ghosts = memo(function Ghosts({ ghosts }: { ghosts: LobLayout['ghosts'] }) {
  return (
    <g pointerEvents="none" aria-hidden="true">
      {ghosts.map(g => (
        <rect
          key={g.activityId}
          x={g.x}
          y={g.y}
          width={g.w}
          height={g.h}
          rx={3}
          fill="none"
          stroke={CHART.baseline}
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      ))}
    </g>
  );
});

/** Coluna fixa dos locais. É um segundo <svg> em `position: sticky`, por cima do gráfico: ao rolar,
 * os blocos passam por baixo dela. */
const LocalLabels = memo(function LocalLabels({ layout }: { layout: LobLayout }) {
  const { left, top, innerH, rows, rowHeight, height } = layout;
  return (
    <svg
      className="sticky left-0 top-0 z-[1] block"
      width={left}
      height={height}
      viewBox={`0 0 ${left} ${height}`}
      aria-hidden="true"
      style={{ fontFamily: 'inherit' }}
    >
      <rect width={left} height={height} fill={CHART.surface} />
      <text x={left - 8} y={top - 10} textAnchor="end" fontSize={9.5} fontWeight={700} letterSpacing=".08em" fill={CHART.inkMuted}>
        LOCAL
      </text>
      {rows.map(r => {
        const label = clip(r.local.name, 16);
        return (
          <text
            key={r.local.id}
            x={left - 8}
            y={r.y + rowHeight / 2 + 3.5}
            textAnchor="end"
            fontSize={10.5}
            fontWeight={500}
            fill={CHART.ink}
          >
            {label !== r.local.name && <title>{r.local.name}</title>}
            {label}
          </text>
        );
      })}
      <line x1={left - 0.75} x2={left - 0.75} y1={top} y2={top + innerH} stroke={CHART.gridStrong} strokeWidth={1.5} />
    </svg>
  );
});

// ─── Blocos ─────────────────────────────────────────────────────────────────────

/** Os blocos de um local. Memo por linha: selecionar um bloco redesenha só a linha que o contém, e
 * arrastar redesenha só a linha arrastada a cada movimento. */
const RowBlocks = memo(function RowBlocks({
  blocks,
  percents,
  today,
  selectedId,
  dimmed,
  shiftId,
  shiftX,
  readOnly,
}: {
  blocks: LobBlock[];
  percents: Record<string, number>;
  today: LocalDate;
  /** Só vem preenchido na linha que contém o selecionado. */
  selectedId?: string;
  /** Sucessores do bloco arrastado, esmaecidos para sinalizar que acompanham. */
  dimmed?: ReadonlySet<string>;
  /** Bloco deslocado (arrasto em curso ou solto à espera do servidor) e o deslocamento em px. */
  shiftId?: string;
  shiftX?: number;
  readOnly: boolean;
}) {
  const hint = readOnly ? '' : '. Arraste ou use as setas para mover';
  return (
    <>
      {blocks.map(b => {
        const a = b.activity;
        const measured = Math.min(100, percents[a.id] ?? 0);
        const planned = plannedPercent(a, today);
        const late = isLate(a, measured, today);
        const selected = a.id === selectedId;
        const shifted = a.id === shiftId ? (shiftX ?? 0) : 0;
        const label = b.w >= GEOMETRY.minLabelWidth ? clip(b.service.name, labelChars(b.w)) : '';
        const aria =
          `${b.service.name}, ${b.local.name}: ${formatDate(b.start)} a ${formatDate(b.finish)}, ${plural(a.durationDays, 'dia útil', 'dias úteis')}, ` +
          `previsto ${planned}%, medido ${percentText(measured)}` +
          (late ? `, atrasado ${plural(delayDays(a, measured, today), 'dia útil', 'dias úteis')}` : '') +
          (selected ? ', selecionado' : '') +
          hint;
        return (
          <g
            key={a.id}
            data-aid={a.id}
            className={`lob-block${dimmed?.has(a.id) ? ' lob-dim' : ''}${a.id === shiftId ? ' lob-dragging' : ''}`}
            style={{
              transform: `translate(${b.x + shifted}px, ${b.y}px)`,
              cursor: readOnly ? 'pointer' : 'grab',
              touchAction: readOnly ? undefined : 'pan-y',
            }}
            role="button"
            tabIndex={selected ? 0 : -1}
            aria-label={aria}
          >
            <rect className="lob-base" width={b.w} height={b.h} rx={3} fill={b.service.color} fillOpacity={0.42} />
            {measured > 0 && <rect width={Math.max(1.5, (b.w * measured) / 100)} height={b.h} rx={3} fill={b.service.color} />}
            {late && (
              <rect x={-0.75} y={-0.75} width={b.w + 1.5} height={b.h + 1.5} rx={3.5} fill="none" stroke={CHART.late} strokeWidth={1.75} />
            )}
            {selected && <rect x={-2} y={-2} width={b.w + 4} height={b.h + 4} rx={4.5} fill="none" stroke={CHART.ink} strokeWidth={2} />}
            {label && (
              <text
                x={5}
                y={b.h / 2 + 3.5}
                fontSize={10.5}
                fontWeight={600}
                fill={inkOn(b.service.color, measured >= 50 ? 1 : 0.42)}
                pointerEvents="none"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
});

// ─── Componente ─────────────────────────────────────────────────────────────────

interface Drag {
  id: string;
  pointerId: number;
  x0: number;
  /** px do SVG por px da tela (1 enquanto o SVG não for escalado por CSS). */
  scale: number;
  moved: boolean;
  /** Data de início sob o ponteiro, já em dia útil. */
  date: LocalDate;
  dimmed: ReadonlySet<string>;
}
/** Bloco solto à espera do servidor: fica na posição nova até `data` trazer a data alterada (ou até
 * 4 s), para não voltar ao lugar antigo e deslizar de novo quando a resposta chegar. */
interface Pending {
  id: string;
  from: LocalDate;
  to: LocalDate;
}
const PENDING_MS = 4000;

export function LobChart(props: LobChartProps) {
  const { data, today, baseline, zoom, selectedId, readOnly, onSelect, onMove, scrollToTodayToken } = props;
  const percents = useStable(props.percents, sameRecord);
  const hiddenServiceIds = useStable(props.hiddenServiceIds, sameSet);
  const visibleLocalIds = useStable(props.visibleLocalIds, sameSet);
  const measurementDates = useStable(props.measurementDates, sameDates);
  const range = useStable(props.range, sameRange);

  const clipId = `lob-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<LobLayout | undefined>(undefined);
  const activeRef = useRef<LobBlock | undefined>(undefined);
  const scrollLeftRef = useRef(0);
  /** Bloco que deve receber o foco assim que a seleção chegar (clique ou setas). */
  const focusNextRef = useRef<string | undefined>(undefined);
  const justDraggedRef = useRef(false);

  const [availableWidth, setAvailableWidth] = useState(1100);
  const [hoverId, setHoverId] = useState<string | undefined>(undefined);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const { locals, services, activities, dependencies } = data;
  const layout = useMemo(
    () =>
      lobLayout({
        data: { locals, services, activities },
        zoom,
        availableWidth,
        today,
        measurementDates,
        baseline,
        hiddenServiceIds,
        visibleLocalIds,
        range,
      }),
    [locals, services, activities, zoom, availableWidth, today, measurementDates, baseline, hiddenServiceIds, visibleLocalIds, range],
  );
  const rowBlocks = useMemo(() => {
    const map = new Map<string, LobBlock[]>(layout.rows.map(r => [r.local.id, []]));
    for (const b of layout.blocks) map.get(b.local.id)?.push(b);
    return map;
  }, [layout]);
  /** serviço × posição da linha → bloco, para as setas para cima e para baixo. */
  const neighbors = useMemo(() => new Map(layout.blocks.map(b => [`${b.service.id}|${b.row.index}`, b])), [layout]);
  const summary = useMemo(() => {
    if (!layout.blocks.length) return 'Linha de Balanço sem blocos para mostrar.';
    let start = layout.blocks[0].start,
      finish = layout.blocks[0].finish;
    const serviceIds = new Set<string>();
    for (const b of layout.blocks) {
      serviceIds.add(b.service.id);
      if (b.start < start) start = b.start;
      if (b.finish > finish) finish = b.finish;
    }
    return `Linha de Balanço: ${plural(serviceIds.size, 'serviço', 'serviços')} em ${plural(layout.rows.length, 'local', 'locais')}, de ${formatDate(start)} a ${formatDate(finish)}.`;
  }, [layout]);
  const lastMeasurement = useMemo(
    () =>
      measurementDates.reduce<LobChartProps['measurementDates'][number] | undefined>(
        (best, m) => (!best || m.date > best.date ? m : best),
        undefined,
      ),
    [measurementDates],
  );

  const dragging = !!drag?.moved;
  const activeId = dragging ? undefined : hoverId && layout.blockById.has(hoverId) ? hoverId : selectedId;
  const activeBlock = activeId ? layout.blockById.get(activeId) : undefined;
  const selectedBlock = selectedId ? layout.blockById.get(selectedId) : undefined;
  const shift = (() => {
    if (drag?.moved) {
      const b = layout.blockById.get(drag.id);
      if (b) return { id: drag.id, x: layout.xOf(drag.date) - b.x, rowId: b.local.id };
    } else if (pending) {
      const b = layout.blockById.get(pending.id);
      if (b && b.activity.start === pending.from) return { id: pending.id, x: layout.xOf(pending.to) - b.x, rowId: b.local.id };
    }
    return undefined;
  })();
  const dimmed = drag?.moved ? drag.dimmed : undefined;

  // Largura disponível: o zoom 'mes' encaixa o plano nela.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setAvailableWidth(Math.round(w));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Ao trocar a escala (zoom ou largura), a data que estava no meio da tela continua no meio.
  useLayoutEffect(() => {
    const box = scrollRef.current,
      previous = layoutRef.current;
    if (box && previous && previous.pxPerDay !== layout.pxPerDay) {
      const center = previous.dateAtX(scrollLeftRef.current + box.clientWidth / 2);
      box.scrollLeft = Math.max(0, layout.xOf(center) - box.clientWidth / 2);
      scrollLeftRef.current = box.scrollLeft;
    }
    layoutRef.current = layout;
  }, [layout]);

  // "Hoje" a ~35% da largura visível: na montagem e a cada mudança do token.
  useEffect(() => {
    const box = scrollRef.current,
      current = layoutRef.current;
    if (!box || !current || current.todayX === undefined) return;
    box.scrollLeft = Math.max(0, current.todayX - box.clientWidth * 0.35);
    scrollLeftRef.current = box.scrollLeft;
  }, [scrollToTodayToken]);

  // Tooltip: ao lado do bloco, à esquerda quando há espaço, senão à direita; nunca fora da área visível.
  const placeTooltip = useCallback(() => {
    const tip = tipRef.current,
      box = scrollRef.current,
      block = activeRef.current,
      current = layoutRef.current;
    if (!tip || !box || !block || !current) return;
    const viewW = box.clientWidth,
      tipW = tip.offsetWidth,
      tipH = tip.offsetHeight;
    const bx = block.x - box.scrollLeft;
    let left = bx - tipW - 10;
    if (left < current.left + 4) left = bx + block.w + 10;
    left = clamp(left, 4, Math.max(4, viewW - tipW - 4));
    const top = clamp(block.y + block.h / 2 - tipH / 2, 2, Math.max(2, current.height - tipH - 2));
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }, []);
  useLayoutEffect(() => {
    activeRef.current = activeBlock;
    placeTooltip();
  }, [activeBlock, layout, placeTooltip]);

  // Foco no bloco recém-selecionado pelo gráfico; seleção vinda de fora (tabela) só garante que ele apareça.
  useEffect(() => {
    if (!selectedId) return;
    const current = layoutRef.current,
      box = scrollRef.current;
    const block = current?.blockById.get(selectedId);
    if (focusNextRef.current === selectedId) {
      focusNextRef.current = undefined;
      svgRef.current?.querySelector<SVGGElement>(`[data-aid="${escapeId(selectedId)}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (!block || !box || !current) return;
    const viewLeft = box.scrollLeft + current.left,
      viewRight = box.scrollLeft + box.clientWidth;
    if (block.x < viewLeft || block.x + Math.min(block.w, 80) > viewRight) {
      box.scrollLeft = Math.max(0, block.x - box.clientWidth * 0.35);
      scrollLeftRef.current = box.scrollLeft;
    }
  }, [selectedId]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), PENDING_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  // ─── Ponteiro ───────────────────────────────────────────────────────────────
  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    // Um arrasto solto fora do SVG não gera click aqui; o próximo toque zera a marca para não engolir um clique.
    justDraggedRef.current = false;
    if (readOnly || e.button !== 0) return;
    const id = idAt(e.target);
    const block = id ? layout.blockById.get(id) : undefined;
    if (!block) return;
    const svg = e.currentTarget;
    svg.setPointerCapture(e.pointerId);
    const rect = svg.getBoundingClientRect();
    setPending(null);
    setDrag({
      id: block.activity.id,
      pointerId: e.pointerId,
      x0: e.clientX,
      scale: rect.width ? layout.width / rect.width : 1,
      moved: false,
      date: block.start,
      dimmed: descendants(dependencies, block.activity.id),
    });
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const block = layout.blockById.get(drag.id);
    if (!block) return;
    const dx = (e.clientX - drag.x0) * drag.scale;
    const moved = drag.moved || Math.abs(dx) >= 4;
    // O bloco encaixa no dia útil sob o ponteiro: fim de semana nunca é destino.
    const date = moved ? layout.dateAtX(block.x + dx) : block.start;
    if (moved !== drag.moved || date !== drag.date) setDrag({ ...drag, moved, date });
  }
  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const block = layout.blockById.get(drag.id);
    if (block) {
      if (!drag.moved) {
        focusNextRef.current = drag.id;
        // O painel da atividade abre acima do gráfico e o empurra para baixo antes de o `click` chegar:
        // o clique cairia fora do bloco e desfaria a seleção. Quem selecionou foi este soltar.
        justDraggedRef.current = true;
        onSelect(drag.id);
      } else {
        justDraggedRef.current = true;
        if (drag.date !== block.start) {
          setPending({ id: drag.id, from: block.start, to: drag.date });
          onMove(drag.id, drag.date);
        }
      }
    }
    setDrag(null);
  }
  function onClick(e: MouseEvent<SVGSVGElement>) {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    const id = idAt(e.target);
    if (!id) onSelect(undefined);
    else if (readOnly) {
      // Em modo edição o soltar do ponteiro já selecionou.
      focusNextRef.current = id;
      onSelect(id);
    }
  }
  function onPointerOver(e: PointerEvent<SVGSVGElement>) {
    if (drag) return;
    const id = idAt(e.target);
    if (id !== hoverId) setHoverId(id);
  }

  // ─── Teclado ────────────────────────────────────────────────────────────────
  function onSvgKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    const id = (e.target as Element).getAttribute?.('data-aid');
    const block = id ? layout.blockById.get(id) : undefined;
    if (!id || !block) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(id);
    } else if (e.key === 'Escape') {
      onSelect(undefined);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (readOnly) return;
      e.preventDefault();
      // Shift anda uma semana útil.
      onMove(id, addWorkdays(block.activity.start, (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1)));
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      // Mesmo serviço no local de cima ou de baixo.
      const next = neighbors.get(`${block.service.id}|${block.row.index + (e.key === 'ArrowUp' ? 1 : -1)}`);
      if (!next) return;
      e.preventDefault();
      focusNextRef.current = next.activity.id;
      onSelect(next.activity.id);
    }
  }
  /** Com o foco na área, Enter entra no bloco selecionado ou, sem seleção, no mais perto de hoje.
   * As setas ficam livres para a rolagem nativa da área. */
  function onRegionKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget || !layout.blocks.length || e.key !== 'Enter') return;
    e.preventDefault();
    const target =
      selectedBlock ??
      layout.blocks.reduce((best, b) => (Math.abs(daysBetween(b.start, today)) < Math.abs(daysBetween(best.start, today)) ? b : best));
    focusNextRef.current = target.activity.id;
    onSelect(target.activity.id);
  }

  // ─── Desenho ────────────────────────────────────────────────────────────────
  const dragHint = (() => {
    if (!drag?.moved || !shift) return null;
    const block = layout.blockById.get(drag.id);
    if (!block) return null;
    const text = `Início ${weekdayDate(drag.date)}`;
    const w = text.length * 6.3 + 18;
    const x = clamp(block.x + shift.x, layout.left, Math.max(layout.left, layout.width - w - 4));
    const y = Math.max(20, block.y - 8);
    return (
      <g pointerEvents="none" aria-hidden="true">
        <rect x={x} y={y - 17} width={w} height={22} rx={6} fill={CHART.ink} />
        <text x={x + 9} y={y - 2} fontSize={11} fontWeight={600} fill="#ffffff">
          {text}
        </text>
      </g>
    );
  })();

  const tooltip = (() => {
    if (!activeBlock) return null;
    const a = activeBlock.activity;
    const measured = Math.min(100, percents[a.id] ?? 0);
    const planned = plannedPercent(a, today);
    const late = isLate(a, measured, today);
    const rows: { label: string; value: string; danger?: boolean }[] = [
      { label: 'Início → término', value: `${weekdayDate(activeBlock.start)} → ${weekdayDate(activeBlock.finish)}` },
      { label: 'Duração', value: plural(a.durationDays, 'dia útil', 'dias úteis') },
    ];
    if (activeBlock.service.team) rows.push({ label: 'Equipe', value: activeBlock.service.team });
    rows.push({ label: 'Previsto até hoje', value: `${planned}%` });
    rows.push({
      label: lastMeasurement ? `Medido (M${lastMeasurement.number} · ${shortDate(lastMeasurement.date)})` : 'Medido',
      value: percentText(measured),
      danger: late,
    });
    if (late) rows.push({ label: 'Atraso', value: plural(delayDays(a, measured, today), 'dia útil', 'dias úteis'), danger: true });
    if (a.actualStart || a.actualFinish)
      rows.push({
        label: 'Real',
        value: `${a.actualStart ? shortDate(a.actualStart) : '…'} → ${a.actualFinish ? shortDate(a.actualFinish) : '…'}`,
      });
    return (
      <div
        ref={tipRef}
        role="tooltip"
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-20 w-[280px] rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-xs shadow-card-hover"
      >
        <h4 className="flex items-center gap-2 text-[13px] font-bold text-slate-900">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: activeBlock.service.color }} />
          <span className="min-w-0 truncate">
            {activeBlock.service.name} · {activeBlock.local.name}
          </span>
          {late && <span className="status ml-auto border-danger-ring bg-danger-soft text-danger before:bg-danger">atrasado</span>}
        </h4>
        <dl className="mt-1.5">
          {rows.map(r => (
            <div key={r.label} className="mt-1 flex justify-between gap-2.5 text-slate-500">
              <dt>{r.label}</dt>
              <dd className={`text-right font-semibold tabular-nums ${r.danger ? 'text-danger' : 'text-slate-700'}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  })();

  const empty = !layout.rows.length
    ? 'Nenhum local para mostrar: cadastre os locais da obra ou mude o filtro de locais.'
    : !layout.blocks.length
      ? 'Nenhum bloco para mostrar com os filtros atuais.'
      : '';

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="relative overflow-x-auto custom-scrollbar"
        role="region"
        aria-label="Linha de Balanço"
        tabIndex={0}
        onScroll={e => {
          scrollLeftRef.current = e.currentTarget.scrollLeft;
          placeTooltip();
        }}
        onKeyDown={onRegionKeyDown}
      >
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
          <svg
            ref={svgRef}
            className="absolute left-0 top-0 block"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="group"
            aria-label={summary}
            style={{ fontFamily: 'inherit', cursor: dragging ? 'grabbing' : undefined }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onPointerOver={onPointerOver}
            onPointerLeave={() => setHoverId(undefined)}
            onClick={onClick}
            onKeyDown={onSvgKeyDown}
          >
            <style>{STYLE}</style>
            <defs>
              <clipPath id={clipId}>
                <rect x={layout.left - 3} y={layout.top - 3} width={layout.innerW + 6} height={layout.innerH + 6} />
              </clipPath>
            </defs>
            <Axes layout={layout} />
            <g clipPath={`url(#${clipId})`}>
              {layout.ghosts.length > 0 && <Ghosts ghosts={layout.ghosts} />}
              {/* A chave remonta os blocos quando a escala muda: sem isso, 5 mil blocos animariam ao trocar o zoom. */}
              <g key={`${layout.pxPerDay}|${layout.start}`}>
                {layout.rows.map(row => (
                  <RowBlocks
                    key={row.local.id}
                    blocks={rowBlocks.get(row.local.id) ?? []}
                    percents={percents}
                    today={today}
                    selectedId={selectedBlock?.local.id === row.local.id ? selectedId : undefined}
                    dimmed={dimmed}
                    shiftId={shift?.rowId === row.local.id ? shift.id : undefined}
                    shiftX={shift?.rowId === row.local.id ? shift.x : undefined}
                    readOnly={readOnly}
                  />
                ))}
              </g>
            </g>
            <Markers layout={layout} today={today} />
            {dragHint}
          </svg>
          <LocalLabels layout={layout} />
        </div>
      </div>
      {tooltip}
      {empty && <p className="callout callout-info mt-3">{empty}</p>}
    </div>
  );
}

// ─── Legenda ────────────────────────────────────────────────────────────────────

/** Chips dos serviços: quadrado da cor, nome e "N d/local" (a duração mais comum entre os blocos do
 * serviço, quando `activities` é informado). Oculto fica esmaecido e riscado; o botão é um toggle
 * (`aria-pressed` = visível). */
export function LobLegend({
  services,
  hidden,
  onToggle,
  activities,
}: {
  services: LobService[];
  hidden: ReadonlySet<string>;
  onToggle: (serviceId: string) => void;
  /** Blocos da obra, só para a duração típica de cada serviço; sem eles o chip mostra só o nome. */
  activities?: LobActivity[];
}) {
  const ordered = useMemo(
    () => [...services].sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, 'pt-BR')),
    [services],
  );
  const durations = useMemo(() => (activities ? typicalDurations(activities) : new Map<string, number>()), [activities]);
  if (!ordered.length) return <></>;
  return (
    <div
      role="group"
      aria-label="Serviços da Linha de Balanço"
      className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
    >
      {ordered.map(s => {
        const off = hidden.has(s.id);
        const duration = durations.get(s.id);
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={!off}
            title={off ? `Mostrar ${s.name}` : `Ocultar ${s.name}`}
            onClick={() => onToggle(s.id)}
            className={`inline-flex h-7 items-center gap-2 rounded-full border border-slate-200 bg-white pl-2 pr-2.5 text-xs font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:bg-brand-50 ${off ? 'opacity-40 line-through' : ''}`}
          >
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.name}
            {duration !== undefined && <small className="font-medium tabular-nums text-slate-400">{duration} d/local</small>}
          </button>
        );
      })}
      <span className="ml-auto self-center text-xs text-slate-500">Clique num serviço para ocultar ou mostrar.</span>
    </div>
  );
}

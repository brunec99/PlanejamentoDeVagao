'use client';
import { memo, useId, useMemo, type KeyboardEvent } from 'react';
import { flowLevels, type FlowService } from '@/domain/lob';
import { Callout } from '@/modules/planejamento/ui';

/** Rede de precedência de um fluxo de serviços, desenhada sozinha a partir da coluna "Depois de"
 * (regra 5, modelo aprovado de 04/11/2026): um cartão por serviço, uma coluna por nível de
 * precedência (`flowLevels`), setas término → início com a espera no meio. Não há arrastar: a
 * posição é consequência das predecessoras, por isso o componente é puro e memoizado. */

/** Medidas do modelo: cartão 122×54, colunas separadas por 46 px, linhas por 16 px, margem 16 px. */
const NW = 122;
const NH = 54;
const GX = 46;
const GY = 16;
const P = 16;
/** Caracteres que cabem em cada linha do cartão (nome em 11,5 px negrito; detalhe em 10 px). SVG não
 * corta texto com reticências sozinho, então o corte é por contagem, com o nome inteiro no `<title>`. */
const NAME_CHARS = 16;
const DETAIL_CHARS = 21;

const ellipsize = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
/** "+5 d", "0 d" ou "−3 d" (antecipação), com o sinal tipográfico de menos. */
export const lagLabel = (lagDays: number) => `${lagDays > 0 ? '+' : lagDays < 0 ? '−' : ''}${Math.abs(lagDays)} d`;

interface Card {
  service: FlowService;
  x: number;
  y: number;
  initial: boolean;
}
interface Arrow {
  key: string;
  path: string;
  labelX: number;
  labelY: number;
  label: string;
}
type Layout =
  { kind: 'ok'; width: number; height: number; columns: number; cards: Card[]; arrows: Arrow[] } | { kind: 'cycle'; message: string };

/** Posições dos cartões e das setas. Cada coluna fica centralizada na vertical, como no modelo; a
 * ordem dentro da coluna é a ordem da tabela, para a rede e a tabela contarem a mesma história. */
function layout(services: FlowService[]): Layout {
  let levels: Map<string, number>;
  try {
    levels = flowLevels(services);
  } catch (error) {
    return { kind: 'cycle', message: error instanceof Error ? error.message : 'O fluxo tem um ciclo de predecessoras.' };
  }
  const grouped: FlowService[][] = [];
  for (const service of services) {
    const level = levels.get(service.id) ?? 0;
    (grouped[level] ??= []).push(service);
  }
  const columns = grouped.filter(Boolean);
  const rows = columns.reduce((max, column) => Math.max(max, column.length), 0);
  const width = P * 2 + columns.length * NW + Math.max(0, columns.length - 1) * GX;
  const height = P * 2 + rows * NH + Math.max(0, rows - 1) * GY;
  const position = new Map<string, { x: number; y: number }>();
  const cards: Card[] = [];
  columns.forEach((column, index) => {
    const columnHeight = column.length * NH + (column.length - 1) * GY;
    column.forEach((service, row) => {
      const x = P + index * (NW + GX);
      const y = P + (height - 2 * P - columnHeight) / 2 + row * (NH + GY);
      position.set(service.id, { x, y });
      cards.push({ service, x, y, initial: service.predecessors.length === 0 });
    });
  });
  const arrows: Arrow[] = [];
  for (const service of services) {
    const to = position.get(service.id);
    if (!to) continue;
    for (const link of service.predecessors) {
      const from = position.get(link.serviceId);
      // Predecessora que não está (mais) no fluxo: a validação do documento aponta; aqui só não se desenha.
      if (!from) continue;
      const x1 = from.x + NW;
      const y1 = from.y + NH / 2;
      const x2 = to.x;
      const y2 = to.y + NH / 2;
      const mx = (x1 + x2) / 2;
      arrows.push({
        key: `${link.serviceId}>${service.id}`,
        path: `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 2} ${y2}`,
        labelX: mx,
        labelY: (y1 + y2) / 2,
        label: lagLabel(link.lagDays),
      });
    }
  }
  return { kind: 'ok', width, height, columns: columns.length, cards, arrows };
}

const detailOf = (service: FlowService) => {
  const base = `${service.durationDays} d/local`;
  if (!service.team) return base;
  const room = DETAIL_CHARS - base.length - 3;
  return room < 4 ? base : `${base} · ${ellipsize(service.team, room)}`;
};

export const FlowNetwork = memo(function FlowNetwork({
  services,
  selectedId,
  onSelect,
}: {
  services: FlowService[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const uid = useId();
  const markerId = `${uid}-seta`;
  const net = useMemo(() => layout(services), [services]);

  if (net.kind === 'cycle')
    return (
      <Callout tone="danger" role="alert">
        A rede não pode ser desenhada: {net.message}
      </Callout>
    );
  if (!net.cards.length)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Adicione serviços na tabela abaixo: a rede é desenhada sozinha a partir das predecessoras.
      </div>
    );

  const byId = new Map(services.map(s => [s.id, s]));
  const summary = services
    .filter(s => s.predecessors.length)
    .map(s => `${s.name} depois de ${s.predecessors.map(p => `${byId.get(p.serviceId)?.name ?? '?'} ${lagLabel(p.lagDays)}`).join(' e ')}`)
    .join('; ');
  const label =
    `Rede do fluxo: ${services.length} ${services.length === 1 ? 'serviço' : 'serviços'} em ${net.columns} ${net.columns === 1 ? 'etapa' : 'etapas'}` +
    (summary ? `. ${summary}.` : '.');
  const keyActivate = (id: string) => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(id);
    }
  };

  return (
    <div className="relative overflow-x-auto rounded-xl border border-slate-200 bg-slate-50">
      <svg
        width={net.width}
        height={net.height}
        viewBox={`0 0 ${net.width} ${net.height}`}
        role="img"
        aria-label={label}
        className="block font-sans"
        style={{ minWidth: net.width }}
      >
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10z" fill="var(--color-slate-400)" />
          </marker>
        </defs>
        {net.arrows.map(arrow => {
          const labelWidth = Math.max(32, arrow.label.length * 6 + 8);
          return (
            <g key={arrow.key} aria-hidden>
              <path d={arrow.path} fill="none" stroke="var(--color-slate-400)" strokeWidth={1.5} markerEnd={`url(#${markerId})`} />
              <rect
                x={arrow.labelX - labelWidth / 2}
                y={arrow.labelY - 8}
                width={labelWidth}
                height={15}
                rx={4}
                fill="var(--color-card)"
                stroke="var(--color-slate-200)"
              />
              <text x={arrow.labelX} y={arrow.labelY + 3} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="var(--color-slate-700)">
                {arrow.label}
              </text>
            </g>
          );
        })}
        {net.cards.map(({ service, x, y, initial }) => {
          const selected = service.id === selectedId;
          const interactive = !!onSelect;
          return (
            <g
              key={service.id}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={interactive ? `${service.name}: ${detailOf(service)}` : undefined}
              aria-pressed={interactive ? selected : undefined}
              onClick={interactive ? () => onSelect(service.id) : undefined}
              onKeyDown={interactive ? keyActivate(service.id) : undefined}
              className={interactive ? 'cursor-pointer focus:outline-none [&:focus-visible>rect:first-of-type]:stroke-primary' : undefined}
            >
              <title>{`${service.name} · ${service.durationDays} d/local${service.team ? ` · ${service.team}` : ''}`}</title>
              {/* Contorno azul no serviço inicial (o que começa sem predecessora); o selecionado ganha fundo azul claro. */}
              <rect
                x={x}
                y={y}
                width={NW}
                height={NH}
                rx={10}
                fill={selected ? 'var(--color-primary-soft)' : 'var(--color-card)'}
                stroke={initial || selected ? 'var(--color-primary)' : 'var(--color-slate-300)'}
                strokeWidth={selected ? 2.5 : initial ? 2 : 1}
              />
              <rect x={x} y={y} width={6} height={NH} rx={3} fill={service.color} />
              <text x={x + 13} y={y + 21} fontSize={11.5} fontWeight={700} fill="var(--color-slate-900)">
                {ellipsize(service.name, NAME_CHARS)}
              </text>
              <text x={x + 13} y={y + 39} fontSize={10} fill="var(--color-slate-500)">
                {detailOf(service)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

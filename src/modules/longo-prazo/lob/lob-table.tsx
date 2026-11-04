'use client';
import { useMemo, useState, type MouseEvent } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  activityFinish,
  isLate,
  plannedPercent,
  type LobActivity,
  type LobData,
  type LobLocal,
  type LobService,
  type LocalDate,
} from '@/domain/lob';
import { formatDate } from '@/shared/format';
import { orderedLocals } from './lob-model';

/** Visão em tabela da Linha de Balanço (regra 17 do modelo): uma linha por bloco, com datas,
 * previsto, medido e situação. Respeita os mesmos filtros do gráfico e compartilha a seleção. */

type SortKey = 'local' | 'service' | 'start' | 'finish' | 'duration' | 'planned' | 'measured' | 'status' | 'actualStart' | 'actualFinish';
type Direction = 'asc' | 'desc';
type Situation = 'late' | 'done' | 'running' | 'pending';

interface TableRow {
  activity: LobActivity;
  service: LobService;
  local: LobLocal;
  /** Posição do local de baixo para cima. */
  localIndex: number;
  finish: LocalDate;
  planned: number;
  measured: number;
  situation: Situation;
}

const SITUATION: Record<Situation, { label: string; className: string; rank: number }> = {
  late: { label: 'atrasado', className: 'border-danger-ring bg-danger-soft text-danger before:bg-danger', rank: 0 },
  running: { label: 'em andamento', className: 'in_production', rank: 1 },
  pending: { label: 'a iniciar', className: 'not_started', rank: 2 },
  done: { label: 'concluído', className: 'terminal', rank: 3 },
};
const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'local', label: 'Local' },
  { key: 'service', label: 'Serviço' },
  { key: 'start', label: 'Início' },
  { key: 'finish', label: 'Término' },
  { key: 'duration', label: 'Duração', numeric: true },
  { key: 'planned', label: 'Previsto até hoje', numeric: true },
  { key: 'measured', label: 'Medido', numeric: true },
  { key: 'status', label: 'Situação' },
  { key: 'actualStart', label: 'Início real' },
  { key: 'actualFinish', label: 'Término real' },
];

const percentText = (value: number) => `${String(Math.round(value * 10) / 10).replace('.', ',')}%`;
const situationOf = (a: LobActivity, measured: number, today: LocalDate): Situation =>
  measured >= 100 ? 'done' : isLate(a, measured, today) ? 'late' : measured > 0 || a.start <= today ? 'running' : 'pending';

/** Comparador crescente de cada coluna. "Local" crescente é de cima para baixo (como no gráfico). */
const compare: Record<SortKey, (a: TableRow, b: TableRow) => number> = {
  local: (a, b) => b.localIndex - a.localIndex,
  service: (a, b) => a.service.orderIndex - b.service.orderIndex || a.service.name.localeCompare(b.service.name, 'pt-BR'),
  start: (a, b) => a.activity.start.localeCompare(b.activity.start),
  finish: (a, b) => a.finish.localeCompare(b.finish),
  duration: (a, b) => a.activity.durationDays - b.activity.durationDays,
  planned: (a, b) => a.planned - b.planned,
  measured: (a, b) => a.measured - b.measured,
  status: (a, b) => SITUATION[a.situation].rank - SITUATION[b.situation].rank,
  actualStart: (a, b) => (a.activity.actualStart ?? '9999').localeCompare(b.activity.actualStart ?? '9999'),
  actualFinish: (a, b) => (a.activity.actualFinish ?? '9999').localeCompare(b.activity.actualFinish ?? '9999'),
};

export function LobTable({
  data,
  percents,
  today,
  hiddenServiceIds,
  visibleLocalIds,
  selectedId,
  onSelect,
}: {
  data: Pick<LobData, 'locals' | 'services' | 'activities'>;
  percents: Record<string, number>;
  today: string;
  hiddenServiceIds: ReadonlySet<string>;
  visibleLocalIds?: ReadonlySet<string>;
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({ key: 'local', direction: 'asc' });
  const { locals, services, activities } = data;

  const rows = useMemo(() => {
    const localIndex = new Map(orderedLocals(locals, visibleLocalIds).map((l, index) => [l.id, { local: l, index }]));
    const serviceById = new Map(services.map(s => [s.id, s]));
    const list: TableRow[] = [];
    for (const activity of activities) {
      if (hiddenServiceIds.has(activity.serviceId)) continue;
      const entry = localIndex.get(activity.localId);
      const service = serviceById.get(activity.serviceId);
      if (!entry || !service) continue;
      const measured = Math.min(100, percents[activity.id] ?? 0);
      list.push({
        activity,
        service,
        local: entry.local,
        localIndex: entry.index,
        finish: activityFinish(activity),
        planned: plannedPercent(activity, today),
        measured,
        situation: situationOf(activity, measured, today),
      });
    }
    // Desempate sempre por local (de cima para baixo) e serviço, para a ordem ser estável.
    const primary = compare[sort.key];
    const sign = sort.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => sign * primary(a, b) || compare.local(a, b) || compare.service(a, b));
    return list;
  }, [locals, services, activities, visibleLocalIds, hiddenServiceIds, percents, today, sort]);

  const toggleSort = (key: SortKey) =>
    setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));
  /** Clicar na linha seleciona; clicar na linha já selecionada limpa a seleção. */
  const select = (id: string) => onSelect(id === selectedId ? undefined : id);
  const selectFromButton = (e: MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    select(id);
  };

  if (!rows.length) return <p className="callout callout-info">Nenhum bloco para listar com os filtros atuais.</p>;

  return (
    <div className="relative overflow-x-auto custom-scrollbar">
      <table className="data-table">
        <caption className="sr-only">
          {rows.length} {rows.length === 1 ? 'bloco' : 'blocos'} da Linha de Balanço, ordenados por{' '}
          {COLUMNS.find(c => c.key === sort.key)?.label.toLowerCase()}
        </caption>
        <thead>
          <tr>
            {COLUMNS.map(column => {
              const active = sort.key === column.key;
              const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className={column.numeric ? 'text-right' : ''}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wider hover:text-brand-900 ${active ? 'text-brand-900' : ''}`}
                  >
                    {column.label}
                    <Icon size={12} aria-hidden="true" className={active ? '' : 'text-brand-300'} />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const a = row.activity;
            const selected = a.id === selectedId;
            const situation = SITUATION[row.situation];
            return (
              <tr
                key={a.id}
                onClick={() => select(a.id)}
                data-selected={selected || undefined}
                className={`cursor-pointer ${selected ? 'bg-primary-soft hover:bg-primary-soft' : ''}`}
              >
                <th scope="row" className="whitespace-nowrap">
                  {row.local.name}
                </th>
                <td>
                  <button
                    type="button"
                    onClick={e => selectFromButton(e, a.id)}
                    aria-pressed={selected}
                    className="inline-flex items-center gap-2 text-left font-semibold text-slate-800 hover:text-primary-ink"
                  >
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: row.service.color }} aria-hidden="true" />
                    {row.service.name}
                  </button>
                </td>
                <td className="whitespace-nowrap tabular-nums">{formatDate(a.start)}</td>
                <td className="whitespace-nowrap tabular-nums">{formatDate(row.finish)}</td>
                <td className="text-right tabular-nums">{a.durationDays}</td>
                <td className="text-right tabular-nums">{row.planned}%</td>
                <td className={`text-right tabular-nums ${row.situation === 'late' ? 'font-semibold text-danger' : ''}`}>
                  {percentText(row.measured)}
                </td>
                <td>
                  <span className={`status ${situation.className}`}>{situation.label}</span>
                </td>
                <td className="whitespace-nowrap tabular-nums">{a.actualStart ? formatDate(a.actualStart) : '—'}</td>
                <td className="whitespace-nowrap tabular-nums">{a.actualFinish ? formatDate(a.actualFinish) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

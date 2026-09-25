'use client';
import { Fragment, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import {
  activitySpan, daysBetween, floorLabel, floorSchedule, physicalProgress, planSpan, teamDemand, toMs,
  type LocalDate, type LongTermActivity, type LongTermBaseline, type LongTermPlanDocument,
} from '@/domain/long-term-plan';
import { Empty, StatCard } from '@/modules/planejamento/ui';
import { formatDate } from '@/shared/format';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const monthYear = (date: LocalDate) => { const d = new Date(toMs(date)); return `${MONTHS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`; };
const dayMonth = (date: LocalDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const signed = (days: number) => `${days > 0 ? '+' : days < 0 ? '−' : ''}${Math.abs(days)} d`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const Sub = ({ children, className = 'text-slate-500' }: { children: ReactNode; className?: string }) => <span className={`mt-1 block truncate text-xs font-medium ${className}`}>{children}</span>;

// ─── Indicadores ────────────────────────────────────────────────────────────────

export function PlanStats({ document, baseline, today }: { document: LongTermPlanDocument; baseline?: LongTermBaseline; today: LocalDate }) {
  const visible = document.activities.filter(a => a.visible);
  const hidden = document.activities.length - visible.length;
  const span = planSpan(document.activities);
  const baseSpan = baseline ? planSpan(baseline.activities) : undefined;
  // Comparação pelo último dia de trabalho, o mesmo "término" que o usuário vê nas tabelas.
  const slip = span && baseSpan ? daysBetween(baseSpan.finish, span.finish) : undefined;
  const lowest = visible.length ? Math.min(...visible.map(a => a.firstFloor)) : undefined;
  const highest = visible.length ? Math.max(...visible.map(a => a.lastFloor)) : undefined;
  const progress = physicalProgress(document.activities, document.measurements, today);
  const measured = document.measurements.filter(m => m.date <= today).length;

  return <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
    <StatCard label="Serviços" value={<>{visible.length}{hidden > 0 && <Sub>{document.activities.length} no total</Sub>}</>} />
    <StatCard label="Pavimentos" value={<>{document.floorCount}<Sub>{lowest !== undefined && highest !== undefined ? `${floorLabel(document, lowest)} → ${floorLabel(document, highest)}` : 'Nenhum serviço visível'}</Sub></>} />
    <StatCard label="Prazo planejado" tone={slip !== undefined && slip > 0 ? 'warning' : 'default'} value={span ? <>
      {plural(span.months, 'mês', 'meses')}
      <Sub>{monthYear(span.start)} → {monthYear(span.finish)} · {span.days} dias</Sub>
      {slip !== undefined && <Sub className={slip > 0 ? 'text-amber-700' : 'text-slate-500'}>vs. linha de base: {slip === 0 ? 'no prazo' : signed(slip)}</Sub>}
    </> : <>—<Sub>Sem serviços visíveis</Sub></>} />
    <StatCard label="Avanço físico" value={<>
      {progress !== undefined ? `${Math.round(progress)}%` : '—'}
      <Sub>{measured ? plural(measured, 'medição', 'medições') : 'Sem medições'}</Sub>
    </>} />
  </div>;
}

// ─── Resumo dos serviços ────────────────────────────────────────────────────────

function predecessorsText(activity: LongTermActivity, document: LongTermPlanDocument) {
  const parts = activity.predecessors.flatMap(link => {
    const predecessor = document.activities.find(a => a.id === link.activityId);
    if (!predecessor) return [];
    const floor = link.floor !== undefined ? ` após ${floorLabel(document, link.floor)}` : '';
    return [`${predecessor.name}${floor}${link.lagDays ? ` ${signed(link.lagDays).replace(' d', 'd')}` : ''}`];
  });
  return parts.length ? parts.join(', ') : '—';
}
const floorsText = (activity: LongTermActivity, document: LongTermPlanDocument) =>
  activity.firstFloor === activity.lastFloor ? floorLabel(document, activity.firstFloor) : `${floorLabel(document, activity.firstFloor)} → ${floorLabel(document, activity.lastFloor)}`;

export function ActivitySummaryTable({ document, hoverId, onHover, readOnly, onOpen, onToggleVisible }: {
  document: LongTermPlanDocument;
  hoverId: string; onHover: (id: string) => void;
  readOnly: boolean;
  onOpen: (id: string) => void;
  onToggleVisible: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setExpanded(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });
  const rows = document.activities.map(activity => ({ activity, span: activitySpan(activity) }))
    .sort((a, b) => a.span.start.localeCompare(b.span.start) || a.activity.name.localeCompare(b.activity.name, 'pt-BR'));

  return <section className="panel overflow-hidden" aria-labelledby="resumo-servicos-title">
    <div className="border-b border-slate-100 px-5 py-3.5">
      <h3 id="resumo-servicos-title" className="text-sm font-bold text-slate-800">Resumo dos serviços</h3>
      <p className="mt-0.5 text-xs text-slate-500">Expanda um serviço para ver as datas de cada pavimento.</p>
    </div>
    {!rows.length ? <div className="p-5"><Empty>Nenhum serviço cadastrado.</Empty></div> : <div className="overflow-x-auto custom-scrollbar">
      <table className="data-table whitespace-nowrap">
        <thead><tr>
          <th className="w-8 px-2" aria-label="Expandir" />
          <th>Serviço</th><th>Predecessoras</th><th>Pavimentos</th><th>Início</th><th>Término</th>
          <th>Dur./pav.</th><th>Ritmo</th><th>Total</th><th>Equipes</th>
          <th className="w-10 px-2"><span className="sr-only">Visibilidade</span></th>
        </tr></thead>
        <tbody>{rows.map(({ activity, span }) => {
          const open = expanded.has(activity.id);
          const custom = !!activity.floorDurations && Object.keys(activity.floorDurations).length > 0;
          const teams = activity.teams.map(t => `${t.name} (${t.size})`);
          return <Fragment key={activity.id}>
            <tr
              tabIndex={0}
              aria-label={`${activity.name}: abrir para editar`}
              className={`cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${hoverId === activity.id ? 'bg-blue-50/70' : ''}`}
              onClick={() => onOpen(activity.id)}
              // Só a própria linha: Enter em um botão interno não deve abrir a edição.
              onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(activity.id); }}
              onMouseEnter={() => onHover(activity.id)} onMouseLeave={() => onHover('')}
              onFocus={() => onHover(activity.id)} onBlur={() => onHover('')}
            >
              <td className="px-2">
                <button type="button" className="rounded p-0.5 text-slate-400 hover:text-blue-600" aria-expanded={open} aria-label={`${open ? 'Recolher' : 'Expandir'} pavimentos de ${activity.name}`}
                  onClick={e => { e.stopPropagation(); toggle(activity.id); }}>
                  {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                </button>
              </td>
              <th scope="row">
                <span className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-sm" style={{ background: activity.color }} aria-hidden />
                  <span className={activity.visible ? '' : 'text-slate-400'}>{activity.name}</span>
                  {!activity.visible && <span className="badge-muted px-2 py-0.5 text-[10px]">(oculto)</span>}
                </span>
              </th>
              <td className="max-w-64 truncate text-xs" title={predecessorsText(activity, document)}>{predecessorsText(activity, document)}</td>
              <td>{floorsText(activity, document)}</td>
              <td className="tabular-nums">{formatDate(span.start)}</td>
              <td className="tabular-nums">{formatDate(span.finish)}</td>
              <td className="tabular-nums" title={custom ? 'duração própria em alguns pavimentos' : undefined}>{activity.duration} d{custom && '*'}</td>
              <td className="tabular-nums">{activity.interval} d</td>
              <td className="font-semibold tabular-nums text-slate-800">{span.days} d</td>
              <td className="text-xs" title={teams.join(', ') || undefined}>{!teams.length ? '—' : teams.length <= 2 ? teams.join(', ') : plural(teams.length, 'equipe', 'equipes')}</td>
              <td className="px-2">
                <button type="button" disabled={readOnly} className="rounded p-1 text-slate-400 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-slate-400"
                  aria-label={`${activity.visible ? 'Ocultar' : 'Mostrar'} ${activity.name} no gráfico`} title={activity.visible ? 'Ocultar do gráfico' : 'Mostrar no gráfico'}
                  onClick={e => { e.stopPropagation(); onToggleVisible(activity.id); }}>
                  {activity.visible ? <Eye size={15} aria-hidden /> : <EyeOff size={15} aria-hidden />}
                </button>
              </td>
            </tr>
            {open && floorSchedule(activity).map(slot => {
              const own = activity.floorDurations?.[String(slot.floor)] !== undefined;
              return <tr key={slot.floor} className="bg-slate-50/60 text-xs">
                <td className="py-1.5" />
                <td colSpan={3} className="py-1.5 pl-6">
                  <span className="flex items-center gap-1.5"><span className="size-1.5 shrink-0 rounded-full" style={{ background: activity.color }} aria-hidden />{floorLabel(document, slot.floor)}</span>
                </td>
                <td className="py-1.5 tabular-nums">{formatDate(slot.start)}</td>
                <td className="py-1.5 tabular-nums">{formatDate(slot.finish)}</td>
                <td className={`py-1.5 tabular-nums ${own ? 'font-semibold text-slate-800' : ''}`} title={own ? 'duração própria deste pavimento' : undefined}>{slot.duration} d</td>
                <td colSpan={4} className="py-1.5" />
              </tr>;
            })}
          </Fragment>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}

// ─── Alocação de equipes ────────────────────────────────────────────────────────

const intensityClass = (value: number, max: number) => {
  if (!value || !max) return '';
  const ratio = value / max;
  return ratio > 0.85 ? 'bg-red-100 text-red-800' : ratio > 0.5 ? 'bg-amber-100 text-amber-800' : 'bg-green-50 text-green-800';
};

export function TeamAllocation({ document }: { document: LongTermPlanDocument }) {
  const { weeks, teams, matrix } = teamDemand(document.activities);
  if (!teams.length) return null;
  return <section className="panel overflow-hidden" aria-labelledby="alocacao-equipes-title">
    <div className="border-b border-slate-100 px-5 py-3.5">
      <h3 id="alocacao-equipes-title" className="text-sm font-bold text-slate-800">Alocação de equipes</h3>
      <p className="mt-0.5 text-xs text-slate-500">Pico diário de pessoas por equipe em cada semana — soma dos serviços que usam a mesma equipe no mesmo dia.</p>
    </div>
    <div className="overflow-x-auto custom-scrollbar">
      <table className="data-table w-auto min-w-full text-xs">
        <thead><tr>
          <th className="sticky left-0 z-10 border-r border-slate-100 whitespace-nowrap">Equipe</th>
          {weeks.map(week => <th key={week} className="min-w-12 px-2 text-center whitespace-nowrap">
            {monthYear(week)}<span className="block text-[9px] font-medium tracking-normal text-slate-400/80">{dayMonth(week)}</span>
          </th>)}
          <th className="border-l border-slate-100 px-3 text-center">Pico</th>
        </tr></thead>
        <tbody>{teams.map(team => {
          // Intensidade relativa ao próprio pico: uma equipe de 2 pessoas também tem semanas críticas.
          const peak = Math.max(0, ...weeks.map(w => matrix[w]?.[team] ?? 0));
          return <tr key={team}>
            <th scope="row" className="sticky left-0 z-10 border-r border-slate-100 bg-white py-2 whitespace-nowrap">{team}</th>
            {weeks.map(week => {
              const value = matrix[week]?.[team] ?? 0;
              return <td key={week} className={`px-2 py-2 text-center font-semibold tabular-nums ${intensityClass(value, peak)}`}
                title={value ? `Equipe ${team}, semana de ${dayMonth(week)}: ${plural(value, 'pessoa', 'pessoas')}` : undefined}>
                {value || ''}
              </td>;
            })}
            <td className="border-l border-slate-100 px-3 py-2 text-center font-bold tabular-nums text-slate-800">{peak}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-5 py-2.5 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-red-200 bg-red-100" aria-hidden />Alta demanda (acima de 85% do pico)</span>
      <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-amber-200 bg-amber-100" aria-hidden />Média demanda (50–85%)</span>
      <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-green-200 bg-green-50" aria-hidden />Baixa demanda</span>
    </div>
  </section>;
}

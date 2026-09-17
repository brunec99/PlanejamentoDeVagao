'use client';
import { useMemo, useState } from 'react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Empty } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatDate, wagonLabel } from '@/shared/format';

// Paleta categórica validada para superfície branca (ordem fixa, nunca ciclada).
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const OTHER = '#52514e';
const MAX_SERIES = SERIES.length;
const LEFT = 168, RIGHT = 132, TOP = 16, ROW = 34, AXIS = 34, WIDTH = 1040;

interface Segment { service: string; locationId: string; start: string; end: string; label: string }

function useChartData(workId: string) {
  const context = usePlanning();
  return useMemo(() => {
    if (context.state !== 'ready') return undefined;
    const selected = selectWorkPlanning(context.planning, workId);
    if (!selected) return undefined;
    const { data } = context.planning;
    const wagonIds = new Set(selected.wagons.map(w => w.id));
    const activities = data.activities.filter(a => wagonIds.has(a.wagonId));
    if (!activities.length) return { empty: true as const, work: selected.work };
    const byService = new Map<string, number>();
    for (const a of activities) byService.set(a.name, (byService.get(a.name) ?? 0) + 1);
    const ranked = [...byService.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
    const named = ranked.slice(0, MAX_SERIES);
    const serviceOf = (name: string) => (named.includes(name) ? name : 'Outros serviços');
    const services = ranked.length > MAX_SERIES ? [...named, 'Outros serviços'] : named;
    const locations = data.locations
      .filter(l => activities.some(a => a.locationId === l.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    const segments: Segment[] = activities.map(a => ({
      service: serviceOf(a.name), locationId: a.locationId, start: a.plannedStart, end: a.plannedEnd,
      label: `${a.name} · ${locations.find(l => l.id === a.locationId)?.name ?? ''} · ${wagonLabel(selected.wagons.find(w => w.id === a.wagonId)?.number ?? 0)} · ${formatDate(a.plannedStart)} a ${formatDate(a.plannedEnd)} · ${Math.round(a.progress)}% executado`,
    }));
    return { empty: false as const, work: selected.work, services, locations, segments, activities, wagons: selected.wagons };
  }, [context, workId]);
}

function monthTicks(from: number, to: number) {
  const ticks: { time: number; label: string }[] = [];
  const cursor = new Date(from);
  cursor.setUTCDate(1);
  while (cursor.getTime() <= to) {
    if (cursor.getTime() >= from) ticks.push({ time: cursor.getTime(), label: new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(cursor) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return ticks;
}

export function LineOfBalance({ workId }: { workId: string }) {
  const chart = useChartData(workId);
  const context = usePlanning();
  const [baselineId, setBaselineId] = useState('');
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | undefined>();
  if (context.state !== 'ready' || !chart) return null;
  if (chart.empty) return <section className="panel mt-6 p-5"><h2 className="mb-1 text-sm font-bold text-slate-800">Linha de Balanço</h2><Empty>Nenhuma atividade planejada nesta obra ainda.</Empty></section>;

  const { services, locations, segments } = chart;
  const baselines = context.planning.data.baselines.filter(b => b.workId === workId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const baseline = baselines.find(b => b.id === baselineId);
  const baselineSegments: Segment[] = baseline
    ? baseline.activities.filter(a => locations.some(l => l.id === a.locationId)).map(a => ({ service: services.includes(a.name) ? a.name : 'Outros serviços', locationId: a.locationId, start: a.plannedStart, end: a.plannedEnd, label: '' }))
    : [];

  const dates = [...segments, ...baselineSegments].flatMap(s => [Date.parse(s.start), Date.parse(s.end)]);
  const t0 = Math.min(...dates), t1 = Math.max(...dates) || Math.min(...dates) + 86400000;
  const plot = WIDTH - LEFT - RIGHT;
  const height = TOP + locations.length * ROW + AXIS;
  const x = (date: string) => LEFT + ((Date.parse(date) - t0) / Math.max(1, t1 - t0)) * plot;
  const y = (locationId: string) => TOP + locations.findIndex(l => l.id === locationId) * ROW + ROW / 2;
  const color = (service: string) => (service === 'Outros serviços' ? OTHER : SERIES[services.indexOf(service) % SERIES.length]);
  const pathOf = (list: Segment[], service: string) => {
    const runs = list.filter(s => s.service === service).sort((a, b) => a.start.localeCompare(b.start) || y(a.locationId) - y(b.locationId));
    return runs.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(s.start).toFixed(1)} ${y(s.locationId)} L${x(s.end).toFixed(1)} ${y(s.locationId)}`).join(' ');
  };
  const today = x(context.planning.today);

  return <section data-tour="longo-lob" className="panel mt-6 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <h2 className="text-sm font-bold text-slate-800">Linha de Balanço</h2>
      <div className="flex flex-wrap items-center gap-2">
        {baselines.length > 0 && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Comparar com
          <select className="field max-w-52 py-1.5" value={baselineId} onChange={e => setBaselineId(e.target.value)}>
            <option value="">Sem linha de base</option>
            {baselines.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>}
        <button type="button" className="button-ghost" onClick={() => setAsTable(!asTable)}>{asTable ? 'Ver gráfico' : 'Ver tabela'}</button>
      </div>
    </div>

    {asTable
      ? <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Linha de Balanço em tabela" tabIndex={0}>
          <table className="data-table min-w-[720px]">
            <thead><tr>{['Serviço', 'Local', 'Início previsto', 'Término previsto', 'Executado'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
            <tbody>{chart.activities.slice().sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)).map(a => <tr key={a.id}>
              <th scope="row">{a.name}</th>
              <td>{locations.find(l => l.id === a.locationId)?.name ?? '—'}</td>
              <td className="whitespace-nowrap tabular-nums">{formatDate(a.plannedStart)}</td>
              <td className="whitespace-nowrap tabular-nums">{formatDate(a.plannedEnd)}</td>
              <td className="tabular-nums">{Math.round(a.progress)}%</td>
            </tr>)}</tbody>
          </table>
        </div>
      : <div className="relative">
          <div className="overflow-x-auto custom-scrollbar p-5" role="region" aria-label="Linha de Balanço: serviços por local ao longo do tempo" tabIndex={0}>
            <svg viewBox={`0 0 ${WIDTH} ${height}`} width={WIDTH} height={height} className="max-w-none" role="img" aria-label={`Linha de Balanço com ${services.length} serviços em ${locations.length} locais`}>
              {monthTicks(t0, t1).map(tick => <g key={tick.time}>
                <line x1={LEFT + ((tick.time - t0) / Math.max(1, t1 - t0)) * plot} x2={LEFT + ((tick.time - t0) / Math.max(1, t1 - t0)) * plot} y1={TOP} y2={height - AXIS} stroke="#e2e8f0" strokeWidth={1} />
                <text x={LEFT + ((tick.time - t0) / Math.max(1, t1 - t0)) * plot} y={height - AXIS + 18} fontSize={11} fill="#94a3b8" textAnchor="middle">{tick.label}</text>
              </g>)}
              {locations.map((location, i) => <g key={location.id}>
                <line x1={LEFT} x2={WIDTH - RIGHT} y1={TOP + i * ROW + ROW} y2={TOP + i * ROW + ROW} stroke="#f1f5f9" strokeWidth={1} />
                <text x={LEFT - 12} y={TOP + i * ROW + ROW / 2 + 4} fontSize={12} fill="#475569" textAnchor="end">{location.name.length > 26 ? `${location.name.slice(0, 25)}…` : location.name}</text>
              </g>)}

              {baseline && services.map(service => <path key={`b-${service}`} d={pathOf(baselineSegments, service)} fill="none" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />)}

              {services.map(service => <path key={service} d={pathOf(segments, service)} fill="none" stroke={color(service)} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />)}

              {segments.map((segment, i) => <g key={`${segment.service}-${i}`} onMouseEnter={() => setHover({ x: x(segment.start), y: y(segment.locationId), text: segment.label })} onMouseLeave={() => setHover(undefined)}>
                <title>{segment.label}</title>
                <line x1={x(segment.start)} x2={x(segment.end)} y1={y(segment.locationId)} y2={y(segment.locationId)} stroke={color(segment.service)} strokeWidth={9} strokeLinecap="round" opacity={0} />
                <circle cx={x(segment.start)} cy={y(segment.locationId)} r={4} fill="#ffffff" stroke={color(segment.service)} strokeWidth={2} />
              </g>)}

              {services.length <= 4 && services.map(service => {
                const last = segments.filter(s => s.service === service).sort((a, b) => a.end.localeCompare(b.end)).at(-1);
                return last ? <text key={`l-${service}`} x={Math.min(x(last.end) + 10, WIDTH - RIGHT + 8)} y={y(last.locationId) + 4} fontSize={11} fill="#475569">{service.length > 20 ? `${service.slice(0, 19)}…` : service}</text> : null;
              })}

              <line x1={today} x2={today} y1={TOP} y2={height - AXIS} stroke="#d97706" strokeWidth={1.5} strokeDasharray="4 3" />
              <text x={today} y={TOP - 4} fontSize={10} fill="#b45309" textAnchor="middle">hoje</text>
            </svg>
          </div>
          {hover && <p className="pointer-events-none absolute left-5 top-2 max-w-[90%] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">{hover.text}</p>}
        </div>}

    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 px-5 py-3">
      {services.map(service => <span key={service} className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color(service) }} />{service}
      </span>)}
      {baseline && <span className="flex items-center gap-2 text-xs font-medium text-slate-600"><span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-slate-300" />{baseline.name}</span>}
    </div>
  </section>;
}

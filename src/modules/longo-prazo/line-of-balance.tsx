'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Location } from '@/domain/entities';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Empty } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatDate } from '@/shared/format';

// Cores de barra com texto branco legível (todas acima de 4.5:1). Repetem quando há mais
// serviços que tons: a identidade de cada barra vem do rótulo escrito nela, não da cor.
const FILLS = ['#1d4ed8', '#b45309', '#0f766e', '#7e22ce', '#be123c', '#15803d', '#0369a1', '#4d7c0f', '#a21caf', '#9f1239'];
const LEFT = 184, LANE = 24, LANE_GAP = 3, ROW_PAD = 8;
const ZOOMS = { semana: 9, mes: 3.2 } as const;
const DAY = 86400000;

/** O importador anexa " — parte 1 de 2 · 33%" ao fatiar a atividade entre vagões. O serviço
 * é o nome sem esse sufixo: sem isso, a mesma frente apareceria como vários serviços. */
function serviceOf(name: string) {
  return name.replace(/\s*[—-]\s*parte\s+\d+\s+de\s+\d+/i, '').replace(/\s*·\s*\d+\s*%\s*$/, '').trim() || name;
}
const days = (from: number, to: number) => Math.round((to - from) / DAY) + 1;
/** Altura do local na obra, para as linhas seguirem a ordem física e não a alfabética.
 * Os nomes vêm do Prevision: "Térreo", "5º pavto", "Cobertura", "Barrilete", "Fach - Sul". */
function height(name: string): number {
  const text = name.toLowerCase();
  const floor = /(\d+)\s*º?\s*(pav|pavto|pavimento|andar)/.exec(text) ?? /^\s*(\d+)/.exec(text);
  // Fachada, hall e equipamento atravessam a obra inteira: não têm altura, ficam no fim.
  if (/fach|hall|equipamento/.test(text)) return 9999;
  if (/subsolo|sub-solo/.test(text)) return -100 + (Number(/(\d+)/.exec(text)?.[1] ?? 1) * -1);
  if (/conten|infra|funda|escava/.test(text)) return -50;
  if (/t[ée]rreo|embasamento/.test(text)) return 0;
  if (/mezanino|intermedi/.test(text)) return 0.5;
  if (floor) return Number(floor[1]);
  if (/cobertura|[áa]tico/.test(text)) return 900;
  if (/barrilete|casa de m[áa]q|reservat/.test(text)) return 950;
  return 9999; // fachadas, halls, equipamentos: sem altura própria, vão para o fim
}
function byHeight(a: Location, b: Location) {
  const diff = height(a.name) - height(b.name);
  return diff !== 0 ? diff : a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
}
interface Bar { id: string; service: string; start: string; end: string; lane: number; progress: number }
/** Empacota as barras em sub-linhas: cada uma entra na primeira faixa livre naquele período. */
function pack(bars: Omit<Bar, 'lane'>[]): Bar[] {
  const lanes: string[] = [];
  return bars.slice().sort((x, y) => x.start.localeCompare(y.start) || x.service.localeCompare(y.service)).map(bar => {
    let lane = lanes.findIndex(end => end < bar.start);
    if (lane === -1) { lane = lanes.length; lanes.push(bar.end); } else lanes[lane] = bar.end;
    return { ...bar, lane };
  });
}

export function LineOfBalance({ workId }: { workId: string }) {
  const context = usePlanning();
  const [baselineId, setBaselineId] = useState('');
  const [zoom, setZoom] = useState<keyof typeof ZOOMS>('mes');
  const [asTable, setAsTable] = useState(false);
  const [descending, setDescending] = useState(false);
  const [openId, setOpenId] = useState('');

  const model = useMemo(() => {
    if (context.state !== 'ready') return undefined;
    const selected = selectWorkPlanning(context.planning, workId);
    if (!selected) return undefined;
    const { data } = context.planning;
    // A leitura de longo prazo é serviço × local × tempo: o vagão não entra aqui.
    const wagonIds = new Set(selected.wagons.map(w => w.id));
    const activities = data.activities.filter(a => wagonIds.has(a.wagonId));
    const ordered = data.locations.filter(l => activities.some(a => a.locationId === l.id)).sort(byHeight);
    const locations = descending ? ordered.reverse() : ordered;
    const services = [...new Set(activities.map(a => serviceOf(a.name)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const colorOf = new Map(services.map((s, i) => [s, FILLS[i % FILLS.length]]));
    const rows = locations.map(location => ({
      location,
      bars: pack(activities.filter(a => a.locationId === location.id).map(a => ({
        id: a.id, service: serviceOf(a.name), start: a.plannedStart, end: a.plannedEnd, progress: a.progress,
      }))),
    }));
    return { work: selected.work, activities, locations, services, colorOf, rows, byId: new Map(activities.map(a => [a.id, a])) };
  }, [context, workId, descending]);

  if (context.state !== 'ready' || !model) return null;
  const { planning } = context;
  const baselines = planning.data.baselines.filter(b => b.workId === workId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const baseline = baselines.find(b => b.id === baselineId);

  const controls = <div className="flex flex-wrap items-center gap-2">
    {baselines.length > 0 && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Linha de base
      <select className="field max-w-44 py-1.5" value={baselineId} onChange={e => setBaselineId(e.target.value)}>
        <option value="">Sem comparação</option>
        {baselines.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>}
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input type="checkbox" className="accent-blue-700" checked={descending} onChange={e => setDescending(e.target.checked)} />Inverter locais
    </label>
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Escala
      <select className="field max-w-32 py-1.5" value={zoom} onChange={e => setZoom(e.target.value as keyof typeof ZOOMS)}>
        <option value="mes">Mês</option>
        <option value="semana">Semana</option>
      </select>
    </label>
    <button type="button" className="button-ghost" onClick={() => setAsTable(!asTable)}>{asTable ? 'Ver gráfico' : 'Ver tabela'}</button>
  </div>;

  if (!model.activities.length) return <section data-tour="longo-lob" className="panel mt-6 p-5">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-bold text-slate-800">Linha de Balanço</h2>{controls}</div>
    <Empty>Nenhuma atividade planejada nesta seleção.</Empty>
  </section>;

  const px = ZOOMS[zoom];
  const t0 = Date.parse(model.activities.reduce((min, a) => (a.plannedStart < min ? a.plannedStart : min), model.activities[0].plannedStart));
  const currentEnd = model.activities.reduce((max, a) => (a.plannedEnd > max ? a.plannedEnd : max), model.activities[0].plannedEnd);
  const baselineEnd = baseline?.activities.reduce((max, a) => (a.plannedEnd > max ? a.plannedEnd : max), baseline.activities[0]?.plannedEnd ?? '');
  const t1 = Math.max(Date.parse(currentEnd), baselineEnd ? Date.parse(baselineEnd) : 0);
  const total = days(t0, t1);
  const width = LEFT + total * px;
  const x = (date: string) => (Date.parse(date) - t0) / DAY * px;
  const months: { label: string; from: number; span: number }[] = [];
  const weeks: { label: string; from: number; span: number }[] = [];
  for (let i = 0; i < total; i++) {
    const day = new Date(t0 + i * DAY);
    const month = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(day);
    const last = months.at(-1);
    if (last?.label === month) last.span++; else months.push({ label: month, from: i, span: 1 });
    const weekday = day.getUTCDay();
    const lastWeek = weeks.at(-1);
    if (lastWeek && weekday !== 1) lastWeek.span++;
    else weeks.push({ label: String(day.getUTCDate()).padStart(2, '0'), from: i, span: 1 });
  }

  return <section data-tour="longo-lob" className="panel mt-6 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <div>
        <h2 className="text-sm font-bold text-slate-800">Linha de Balanço</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Fim atual: <strong className="text-slate-700">{formatDate(currentEnd)}</strong>
          {baseline && baselineEnd && <> · {formatDate(baselineEnd)} — fim de <strong className="text-slate-700">{baseline.name}</strong></>}
          {' · '}{model.services.length} serviços em {model.locations.length} locais · {model.activities.length} atividades
        </p>
      </div>
      {controls}
    </div>

    {asTable
      ? <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Linha de Balanço em tabela" tabIndex={0}>
          <table className="data-table min-w-[820px]">
            <thead><tr>{['Serviço', 'Local', 'Início previsto', 'Término previsto', 'Executado'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
            <tbody>{model.rows.flatMap(row => row.bars.map(bar => <tr key={bar.id}>
              <th scope="row">{bar.service}</th>
              <td>{row.location.name}</td>
              <td className="whitespace-nowrap tabular-nums">{formatDate(bar.start)}</td>
              <td className="whitespace-nowrap tabular-nums">{formatDate(bar.end)}</td>
              <td className="tabular-nums">{Math.round(bar.progress)}%</td>
            </tr>))}</tbody>
          </table>
        </div>
      : <div className="overflow-auto custom-scrollbar max-h-[75vh]" role="region" aria-label="Linha de Balanço: serviços por local ao longo do tempo" tabIndex={0}>
          <div style={{ width }} className="relative">
            <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
              <div style={{ width: LEFT }} className="sticky left-0 z-30 shrink-0 border-r border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Local</div>
              <div className="relative shrink-0" style={{ width: total * px, height: 40 }}>
                {months.map(month => <div key={`${month.label}-${month.from}`} style={{ left: month.from * px, width: month.span * px }}
                  className="absolute top-0 h-5 overflow-hidden whitespace-nowrap border-r border-slate-200 px-1.5 text-[11px] font-semibold text-slate-600">{month.label}</div>)}
                {weeks.map(week => <div key={`${week.label}-${week.from}`} style={{ left: week.from * px, width: week.span * px }}
                  className="absolute top-5 h-5 overflow-hidden whitespace-nowrap border-r border-slate-100 px-1 text-[10px] tabular-nums text-slate-400">{px >= 6 ? week.label : ''}</div>)}
              </div>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: LEFT + x(planning.today), borderLeft: '2px dashed #d97706' }} aria-hidden="true" />
              {baseline && baselineEnd && <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: LEFT + x(baselineEnd), borderLeft: '2px dotted #64748b' }} aria-hidden="true" />}
              {model.rows.map(row => {
                const lanes = Math.max(1, ...row.bars.map(b => b.lane + 1));
                return <div key={row.location.id} className="flex border-b border-slate-100">
                  <div style={{ width: LEFT }} className="sticky left-0 z-20 shrink-0 border-r border-slate-200 bg-white px-3 py-2 text-xs font-semibold leading-snug text-slate-700">{row.location.name}</div>
                  <div className="relative shrink-0" style={{ width: total * px, height: lanes * (LANE + LANE_GAP) + ROW_PAD }}>
                    {row.bars.map(bar => {
                      const left = x(bar.start);
                      const barWidth = Math.max(px, days(Date.parse(bar.start), Date.parse(bar.end)) * px);
                      return <button key={bar.id} type="button" aria-haspopup="dialog" onClick={() => setOpenId(bar.id)}
                        title={`${bar.service} · ${row.location.name} · ${formatDate(bar.start)} a ${formatDate(bar.end)} · ${Math.round(bar.progress)}% executado`}
                        style={{ left, width: barWidth, top: bar.lane * (LANE + LANE_GAP) + ROW_PAD / 2, height: LANE, backgroundColor: model.colorOf.get(bar.service) }}
                        className="absolute overflow-hidden whitespace-nowrap rounded px-1.5 text-left text-[11px] font-semibold leading-[24px] text-white hover:brightness-110">{bar.service}</button>;
                    })}
                  </div>
                </div>;
              })}
            </div>
          </div>
        </div>}

    <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">Cada barra é uma atividade, colorida por serviço e rotulada com o nome dele — a cor agrupa, o rótulo identifica. Clique na barra para ver as datas. A linha tracejada âmbar é hoje{baseline && baselineEnd ? '; a pontilhada cinza é o fim da linha de base selecionada' : ''}.</p>

    {openId && model.byId.has(openId) && <ActivityDates activity={model.byId.get(openId)!}
      place={model.locations.find(l => l.id === model.byId.get(openId)!.locationId)?.name ?? '—'}
      service={serviceOf(model.byId.get(openId)!.name)}
      baseline={baseline && { name: baseline.name, entry: baseline.activities.find(a => a.id === openId) }}
      hasBaselines={baselines.length > 0} onClose={() => setOpenId('')} />}
  </section>;
}

function ActivityDates({ activity, place, service, baseline, hasBaselines, onClose }: {
  activity: { plannedStart: string; plannedEnd: string; progress: number; name: string };
  place: string; service: string;
  baseline?: { name: string; entry?: { plannedStart: string; plannedEnd: string } };
  hasBaselines: boolean; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.showModal(); closeButton.current?.focus(); }, []);
  const duration = days(Date.parse(activity.plannedStart), Date.parse(activity.plannedEnd));
  const entry = baseline?.entry;
  const slip = entry ? days(Date.parse(entry.plannedEnd), Date.parse(activity.plannedEnd)) - 1 : undefined;
  const item = (label: string, content: React.ReactNode) => <div><dt className="eyebrow">{label}</dt><dd className="mt-1 font-semibold tabular-nums text-slate-900">{content}</dd></div>;
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="atividade-datas" className="m-auto w-[min(34rem,92vw)] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55">
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{place}</p>
          <h3 id="atividade-datas" className="mt-1 text-base font-bold text-slate-900">{service}</h3>
          {activity.name !== service && <p className="mt-0.5 text-xs text-slate-400">{activity.name}</p>}
        </div>
        <button ref={closeButton} type="button" className="button-ghost" onClick={() => dialog.current?.close()}>Fechar</button>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
        {item('Início', formatDate(activity.plannedStart))}
        {item('Término', formatDate(activity.plannedEnd))}
        {item('Duração', `${duration} ${duration === 1 ? 'dia' : 'dias'}`)}
        {item('Executado', `${Math.round(activity.progress)}%`)}
      </dl>
      <div className="mt-5 border-t border-slate-100 pt-4">
        {entry
          ? <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              {item('Início da linha de base', formatDate(entry.plannedStart))}
              {item('Término da linha de base', formatDate(entry.plannedEnd))}
              {item('Desvio no término', slip === 0 ? 'No prazo da base' : `${slip! > 0 ? '+' : ''}${slip} ${Math.abs(slip!) === 1 ? 'dia' : 'dias'}`)}
            </dl>
          : <p className="text-sm text-slate-500">{baseline
              ? <>Esta atividade não existia quando <strong>{baseline.name}</strong> foi salva, então não há datas de base para comparar.</>
              : hasBaselines ? 'Selecione uma linha de base acima para ver as datas de base desta atividade.' : 'Nenhuma linha de base salva ainda: defina uma para comparar as datas.'}</p>}
      </div>
    </div>
  </dialog>;
}

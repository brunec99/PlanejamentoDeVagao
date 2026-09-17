'use client';
import { useMemo, useState } from 'react';
import type { Activity } from '@/domain/entities';
import { dependencyConflicts } from '@/domain/rules';
import { addDays } from '@/domain/validation';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, Progress } from '@/modules/planejamento/ui';
import { CommandForm, Field, TextField, number, value } from '@/modules/planejamento/forms';
import { activityLabels, formatDate } from '@/shared/format';

const GRID = 620, ROW = 34, HEAD = 40, DAY = 86400000;
const PX = { semana: 9, mes: 3.2 } as const;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;

export function Gantt({ workId }: { workId: string }) {
  const context = usePlanning();
  const [zoom, setZoom] = useState<keyof typeof PX>('semana');
  const [wholeWork, setWholeWork] = useState(false);
  const [openId, setOpenId] = useState('');

  const model = useMemo(() => {
    if (context.state !== 'ready') return undefined;
    const selected = selectWorkPlanning(context.planning, workId);
    if (!selected) return undefined;
    const { data, today } = context.planning;
    const wagonIds = new Set(selected.wagons.map(w => w.id));
    const all = data.activities.filter(a => wagonIds.has(a.wagonId));
    const windowEnd = addDays(today, 90);
    const rows = (wholeWork ? all : all.filter(a => a.plannedStart <= windowEnd && a.plannedEnd >= today))
      .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.name.localeCompare(b.name, 'pt-BR'));
    const visible = new Set(rows.map(a => a.id));
    const conflicted = new Set(dependencyConflicts(data).map(c => c.dependency.id));
    return {
      rows, visible, conflicted, windowEnd, today,
      teams: data.teams.filter(t => t.workId === workId),
      locations: data.locations,
      byId: new Map(all.map(a => [a.id, a])),
      all,
      dependencies: data.dependencies.filter(d => visible.has(d.successorId) || visible.has(d.predecessorId)),
    };
  }, [context, workId, wholeWork]);

  if (context.state !== 'ready' || !model) return null;
  const { rows, byId, teams, locations, dependencies, conflicted, today, windowEnd } = model;
  const px = PX[zoom];
  const place = (id: string) => locations.find(l => l.id === id)?.name ?? '—';
  const predecessorsOf = (id: string) => dependencies.filter(d => d.successorId === id);
  const successorsOf = (id: string) => dependencies.filter(d => d.predecessorId === id);
  const open = rows.find(a => a.id === openId);

  const controls = <div className="flex flex-wrap items-center gap-2">
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input type="checkbox" className="accent-blue-700" checked={wholeWork} onChange={e => setWholeWork(e.target.checked)} />Toda a obra
    </label>
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Escala
      <select className="field max-w-28 py-1.5" value={zoom} onChange={e => setZoom(e.target.value as keyof typeof PX)}>
        <option value="semana">Semana</option>
        <option value="mes">Mês</option>
      </select>
    </label>
  </div>;

  if (!rows.length) return <section data-tour="medio-gantt" className="panel my-6 p-5">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-bold text-slate-800">Cronograma</h2>{controls}</div>
    <Empty>Nenhuma atividade {wholeWork ? 'cadastrada nesta obra' : `prevista entre hoje e ${formatDate(windowEnd)}`}.</Empty>
  </section>;

  const t0 = rows.reduce((min, a) => (a.plannedStart < min ? a.plannedStart : min), rows[0].plannedStart);
  const t1 = rows.reduce((max, a) => (a.plannedEnd > max ? a.plannedEnd : max), rows[0].plannedEnd);
  const total = days(t0, t1);
  const x = (date: string) => (Date.parse(date) - Date.parse(t0)) / DAY * px;
  const barOf = (a: Activity) => ({ left: x(a.plannedStart), width: Math.max(px, days(a.plannedStart, a.plannedEnd) * px) });
  const months: { label: string; from: number; span: number }[] = [];
  for (let i = 0; i < total; i++) {
    const day = new Date(Date.parse(t0) + i * DAY);
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(day);
    const last = months.at(-1);
    if (last?.label === label) last.span++; else months.push({ label, from: i, span: 1 });
  }

  return <section data-tour="medio-gantt" className="panel my-6 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <div>
        <h2 className="text-sm font-bold text-slate-800">Cronograma</h2>
        <p className="mt-0.5 text-xs text-slate-500">{rows.length} atividades · predecessoras, recurso e anotação por linha. Clique na linha para editar. As datas não se movem sozinhas: a rede aponta a incoerência, a reprogramação é sua.</p>
      </div>
      {controls}
    </div>

    <div className="overflow-auto custom-scrollbar max-h-[70vh]" role="region" aria-label="Cronograma de atividades" tabIndex={0}>
      <div style={{ width: GRID + total * px }} className="relative">
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white">
          <div style={{ width: GRID, height: HEAD }} className="sticky left-0 z-30 flex shrink-0 items-center border-r border-slate-200 bg-white text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span className="w-64 px-3">Atividade</span><span className="w-24 px-2">Início</span><span className="w-24 px-2">Término</span><span className="w-14 px-2">Dur.</span><span className="w-32 px-2">Recurso</span>
          </div>
          <div className="relative shrink-0" style={{ width: total * px, height: HEAD }}>
            {months.map(month => <div key={`${month.label}-${month.from}`} style={{ left: month.from * px, width: month.span * px }}
              className="absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap border-r border-slate-200 px-1.5 text-[11px] font-semibold text-slate-600">{month.label}</div>)}
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: GRID + x(today), borderLeft: '2px dashed #d97706' }} aria-hidden="true" />
          <svg className="pointer-events-none absolute z-10" style={{ left: GRID, top: 0, width: total * px, height: rows.length * ROW }} aria-hidden="true">
            {dependencies.map(dependency => {
              const from = rows.findIndex(a => a.id === dependency.predecessorId);
              const to = rows.findIndex(a => a.id === dependency.successorId);
              if (from < 0 || to < 0) return null;
              const fromBar = barOf(rows[from]), toBar = barOf(rows[to]);
              const y1 = from * ROW + ROW / 2, y2 = to * ROW + ROW / 2;
              const x1 = fromBar.left + fromBar.width, x2 = toBar.left;
              const mid = Math.max(x1 + 6, x2 - 6);
              return <polyline key={dependency.id} points={`${x1},${y1} ${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none"
                stroke={conflicted.has(dependency.id) ? '#be123c' : '#94a3b8'} strokeWidth={1.5} />;
            })}
          </svg>

          {rows.map(activity => {
            const bar = barOf(activity);
            const team = teams.find(t => t.id === activity.teamId);
            const predecessors = predecessorsOf(activity.id);
            const late = predecessors.some(d => conflicted.has(d.id));
            return <div key={activity.id} className={`flex border-b border-slate-100 ${openId === activity.id ? 'bg-blue-50/60' : 'hover:bg-slate-50/70'}`}>
              <button type="button" onClick={() => setOpenId(openId === activity.id ? '' : activity.id)} aria-expanded={openId === activity.id}
                style={{ width: GRID, height: ROW }} className="sticky left-0 z-20 flex shrink-0 items-center border-r border-slate-200 bg-inherit text-left text-xs text-slate-700">
                <span className="w-64 truncate px-3 font-medium text-slate-800" title={activity.name}>
                  {activity.notes && <span className="mr-1 text-amber-600" title="Tem anotação">✎</span>}
                  {late && <span className="mr-1 text-rose-600" title="Começa antes do término da predecessora">!</span>}
                  {activity.name}
                </span>
                <span className="w-24 px-2 tabular-nums">{formatDate(activity.plannedStart)}</span>
                <span className="w-24 px-2 tabular-nums">{formatDate(activity.plannedEnd)}</span>
                <span className="w-14 px-2 tabular-nums">{days(activity.plannedStart, activity.plannedEnd)}d</span>
                <span className={`w-32 truncate px-2 ${team ? '' : 'text-amber-600'}`}>{team ? team.name : 'Sem recurso'}</span>
              </button>
              <div className="relative shrink-0" style={{ width: total * px, height: ROW }}>
                <div title={`${activity.name} · ${formatDate(activity.plannedStart)} a ${formatDate(activity.plannedEnd)} · ${Math.round(activity.progress)}%`}
                  style={{ left: bar.left, width: bar.width }} className="absolute top-[7px] h-5 overflow-hidden rounded bg-blue-700">
                  <div className="h-full bg-blue-900/60" style={{ width: `${Math.min(100, Math.max(0, activity.progress))}%` }} />
                </div>
              </div>
            </div>;
          })}
        </div>
      </div>
    </div>

    {open && <RowDetail activity={open} place={place(open.locationId)} teams={teams} all={model.all} byId={byId}
      predecessors={predecessorsOf(open.id)} successors={successorsOf(open.id)} conflicted={conflicted} onClose={() => setOpenId('')} />}
  </section>;
}

function RowDetail({ activity, place, teams, all, byId, predecessors, successors, conflicted, onClose }: {
  activity: Activity; place: string; teams: { id: string; name: string }[]; all: Activity[]; byId: Map<string, Activity>;
  predecessors: { id: string; predecessorId: string }[]; successors: { id: string; successorId: string }[];
  conflicted: Set<string>; onClose: () => void;
}) {
  const context = usePlanning();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (context.state !== 'ready') return null;
  const unlink = async (dependencyId: string) => {
    if (busy) return; setBusy(dependencyId); setError('');
    try { await context.execute({ type: 'unlink_activities', dependencyId }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível remover a ligação.'); }
    finally { setBusy(''); }
  };
  const label = (id: string) => byId.get(id)?.name ?? 'Atividade de outra janela';

  return <div className="border-t border-slate-200 bg-slate-50/70 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="eyebrow">{place} · {activityLabels[activity.status]} · peso {activity.weight}</p>
        <h3 className="mt-0.5 text-sm font-bold text-slate-900">{activity.name}</h3>
        <p className="mt-1 text-xs text-slate-500">{formatDate(activity.plannedStart)} a {formatDate(activity.plannedEnd)} · {days(activity.plannedStart, activity.plannedEnd)} dias</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-40"><Progress value={activity.progress} label={`Progresso de ${activity.name}`} /></div>
        <button type="button" className="button-ghost" onClick={onClose}>Fechar</button>
      </div>
    </div>

    {activity.notes && <p className="mt-4 whitespace-pre-line rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-slate-700">{activity.notes}</p>}

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <p className="eyebrow">Predecessoras</p>
        {predecessors.length === 0 ? <Empty>Nenhuma predecessora.</Empty> : <ul className="space-y-1.5">{predecessors.map(d => <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
          <span className={conflicted.has(d.id) ? 'text-rose-700' : 'text-slate-700'}>{label(d.predecessorId)}{conflicted.has(d.id) && ' · começa antes do término desta predecessora'}</span>
          <button type="button" className="button-ghost shrink-0" disabled={busy === d.id} onClick={() => unlink(d.id)}>{busy === d.id ? 'Removendo…' : 'Remover'}</button>
        </li>)}</ul>}
        <CommandForm key={`link-${activity.updatedAt}`} title="Ligar predecessora" submit="Ligar" command={d => ({ type: 'link_activities', predecessorId: value(d, 'predecessorId'), successorId: activity.id })}>
          <Field label="Atividade que precede esta">
            <select className="field" name="predecessorId" required defaultValue="">
              <option value="">Selecione</option>
              {all.filter(a => a.id !== activity.id).map(a => <option key={a.id} value={a.id}>{a.name} · {formatDate(a.plannedStart)}</option>)}
            </select>
          </Field>
        </CommandForm>
      </div>

      <div className="space-y-2">
        <p className="eyebrow">Sucessoras</p>
        {successors.length === 0 ? <Empty>Nenhuma sucessora.</Empty> : <ul className="space-y-1.5 text-sm">{successors.map(d => <li key={d.id} className={conflicted.has(d.id) ? 'text-rose-700' : 'text-slate-700'}>
          {label(d.successorId)}{conflicted.has(d.id) && ' · começa antes do término desta atividade'}
        </li>)}</ul>}
        <p className="text-xs text-slate-400">A sucessora é ligada a partir da linha dela, para a leitura ficar sempre no mesmo sentido.</p>
      </div>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      {teams.length > 0 && <CommandForm key={`team-${activity.updatedAt}`} title="Recurso" submit="Salvar recurso" command={d => ({ type: 'assign_team', activityId: activity.id, teamId: value(d, 'teamId') || null })}>
        <Field label="Equipe executora">
          <select className="field" name="teamId" defaultValue={activity.teamId ?? ''}>
            <option value="">Sem recurso</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </CommandForm>}
      <CommandForm key={`note-${activity.updatedAt}`} title="Anotação" submit="Salvar anotação" command={d => ({ type: 'set_activity_note', activityId: activity.id, note: value(d, 'note') })}>
        <Field label="Anotação da linha (vazio limpa)">
          <textarea className="field min-h-24" name="note" maxLength={2000} defaultValue={activity.notes ?? ''} />
        </Field>
      </CommandForm>
      <CommandForm key={`progress-${activity.updatedAt}`} title="Percentual executado" submit="Lançar percentual" command={d => ({ type: 'record_progress', activityId: activity.id, progress: number(d, 'progress'), reason: value(d, 'reason') || undefined })}>
        <TextField name="progress" label="Percentual executado (%)" type="number" min={0} max={100} step="any" defaultValue={activity.progress} />
        <TextField name="reason" label="Justificativa (obrigatória para reduzir)" required={false} />
      </CommandForm>
    </div>

    {error && <div className="mt-3"><Callout tone="danger" role="alert">{error}</Callout></div>}
  </div>;
}

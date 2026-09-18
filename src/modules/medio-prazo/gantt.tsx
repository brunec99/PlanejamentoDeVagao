'use client';
import { useMemo, useState } from 'react';
import type { Command } from '@/application/use-cases/commands';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import type { Activity, MediumTermPlan, PlanDependency, PlanTask, Team } from '@/domain/entities';
import { teamLoad } from '@/domain/rules';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { CommandForm, Field, TextField, number, value } from '@/modules/planejamento/forms';
import { Callout, Empty, Progress, StatCard } from '@/modules/planejamento/ui';
import { formatDate, formatTimestamp } from '@/shared/format';

const COLS = 744, DEV = 80, ROW = 30, HEAD = 40, DAY = 86400000;
const PX = { semana: 9, mes: 3.2 } as const;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
const drift = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const monthEnd = (month: string) => { const [year, m] = month.split('-').map(Number); return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10); };
// A linha de base é uma cópia congelada do plano: os ids não coincidem, então o par de cada linha é achado pelo nome.
const nameKey = (name: string) => name.trim().toLowerCase();

type Line = { kind: 'group'; id: string; name: string; start: string; end: string; count: number } | { kind: 'task'; task: PlanTask };

export function Gantt({ workId }: { workId: string }) {
  const context = usePlanning();
  const [zoom, setZoom] = useState<keyof typeof PX>('semana');
  const [planId, setPlanId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [openBaseline, setOpenBaseline] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [openId, setOpenId] = useState('');

  const model = useMemo(() => {
    if (context.state !== 'ready') return undefined;
    const selected = selectWorkPlanning(context.planning, workId);
    const { data, today } = context.planning;
    const actor = data.users.find(u => u.id === context.actorId);
    if (!selected || !actor?.workIds.includes(workId)) return undefined;
    const plans = data.plans.filter(p => p.workId === workId);
    const wagonIds = new Set(selected.wagons.map(w => w.id));
    return {
      today, plans, tasks: data.planTasks, dependencies: data.planDependencies,
      live: plans.filter(p => !p.baselineOf).sort((a, b) => b.month.localeCompare(a.month)),
      teams: data.teams.filter(t => t.workId === workId).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name, 'pt-BR')),
      activities: data.activities.filter(a => wagonIds.has(a.wagonId)).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.name.localeCompare(b.name, 'pt-BR')),
      locations: data.locations.filter(l => l.workId === workId),
    };
  }, [context, workId]);

  if (context.state !== 'ready' || !model) return null;
  const { live, plans, tasks: allTasks, teams, activities, locations, today } = model;
  const plan = live.find(p => p.id === planId) ?? live[0];
  const baselines = plan ? plans.filter(p => p.baselineOf === plan.id).sort((a, b) => (b.frozenAt ?? '').localeCompare(a.frozenAt ?? '')) : [];
  const baseline = baselines.find(b => b.id === baselineId);
  const shown = openBaseline && baseline ? baseline : plan;
  const frozen = !!shown?.frozenAt;
  const compare = openBaseline ? undefined : baseline;

  const heading = <div>
    <h2 className="text-sm font-bold text-slate-800">Plano do mês</h2>
    <p className="mt-0.5 text-xs text-slate-500">O médio prazo começa em branco: um plano novo por mês, escrito linha por linha, com linha de base quando o mês estiver fechado. As datas não se movem sozinhas — a rede aponta a incoerência, a reprogramação é sua.</p>
  </div>;
  const newPlan = <CommandForm title="Novo plano do mês" submit="Criar plano" onDone={id => { setPlanId(id); setBaselineId(''); setOpenBaseline(false); setOpenId(''); }}
    command={d => ({ type: 'create_plan', workId, month: value(d, 'month'), name: value(d, 'name') || undefined })}>
    <TextField name="month" label="Mês do plano" type="month" defaultValue={today.slice(0, 7)} />
    <TextField name="name" label="Nome do plano (opcional)" required={false} />
  </CommandForm>;

  if (!plan || !shown) return <section data-tour="medio-gantt" className="panel my-6 p-5">
    {heading}
    <div className="my-4"><Empty>Esta obra ainda não tem plano de médio prazo. Nada vem importado para cá: crie o plano do mês e escreva as linhas.</Empty></div>
    <div className="max-w-md">{newPlan}</div>
  </section>;

  const tasks = allTasks.filter(t => t.planId === shown.id).sort((a, b) => a.order - b.order || a.plannedStart.localeCompare(b.plannedStart));
  const byId = new Map(tasks.map(t => [t.id, t]));
  const numberOf = new Map(tasks.map((t, index) => [t.id, index + 1]));
  const baseTasks = compare ? allTasks.filter(t => t.planId === compare.id) : [];
  const pairs = new Map<string, PlanTask>();
  for (const task of baseTasks) if (!pairs.has(nameKey(task.name))) pairs.set(nameKey(task.name), task);
  const pairOf = (task: PlanTask) => (compare ? pairs.get(nameKey(task.name)) : undefined);
  const dependencies = model.dependencies.filter(d => byId.has(d.predecessorId) && byId.has(d.successorId));
  // Não há regra compartilhada para linhas de plano: a incoerência é a sucessora que começa antes do término da predecessora.
  const conflicted = new Set(dependencies.filter(d => byId.get(d.successorId)!.plannedStart <= byId.get(d.predecessorId)!.plannedEnd).map(d => d.id));
  const predecessorsOf = (id: string) => dependencies.filter(d => d.successorId === id);
  const successorsOf = (id: string) => dependencies.filter(d => d.predecessorId === id);
  const resource = (teamId?: string) => { const team = teams.find(t => t.id === teamId); return team ? `${team.company} · ${team.name}` : 'Sem recurso'; };

  const px = PX[zoom];
  const grid = COLS + (compare ? DEV : 0);
  const hidden = new Set(collapsed);
  const lines: Line[] = [];
  if (grouped) {
    const bucket = new Map<string, PlanTask[]>();
    for (const task of tasks) { const id = task.teamId ?? 'sem-recurso'; const list = bucket.get(id); if (list) list.push(task); else bucket.set(id, [task]); }
    const groups = [...bucket.entries()].map(([id, items]) => ({
      id, items, name: resource(id === 'sem-recurso' ? undefined : id),
      start: items.reduce((min, t) => (t.plannedStart < min ? t.plannedStart : min), items[0].plannedStart),
      end: items.reduce((max, t) => (t.plannedEnd > max ? t.plannedEnd : max), items[0].plannedEnd),
    })).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, 'pt-BR'));
    for (const group of groups) {
      lines.push({ kind: 'group', id: group.id, name: group.name, start: group.start, end: group.end, count: group.items.length });
      if (!hidden.has(group.id)) for (const task of group.items) lines.push({ kind: 'task', task });
    }
  } else for (const task of tasks) lines.push({ kind: 'task', task });
  const groupIds = lines.flatMap(line => (line.kind === 'group' ? [line.id] : []));
  const lineOf = new Map<string, number>();
  lines.forEach((line, index) => { if (line.kind === 'task') lineOf.set(line.task.id, index); });

  // O calendário cobre o mês inteiro do plano mesmo em branco, e se estica para as linhas que saem dele.
  const dates = [`${shown.month}-01`, monthEnd(shown.month), ...tasks.flatMap(t => [t.plannedStart, t.plannedEnd]), ...baseTasks.flatMap(t => [t.plannedStart, t.plannedEnd])];
  const t0 = dates.reduce((min, date) => (date < min ? date : min));
  const t1 = dates.reduce((max, date) => (date > max ? date : max));
  const total = days(t0, t1);
  const x = (date: string) => ((Date.parse(date) - Date.parse(t0)) / DAY) * px;
  const span = (start: string, end: string) => ({ left: x(start), width: Math.max(px, days(start, end) * px) });
  const months: { label: string; from: number; span: number }[] = [];
  for (let i = 0; i < total; i++) {
    const day = new Date(Date.parse(t0) + i * DAY);
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(day);
    const last = months.at(-1);
    if (last?.label === label) last.span++; else months.push({ label, from: i, span: 1 });
  }
  const head = (label: string, width: string) => <span key={label} className={`${width} border-r border-slate-200 px-2`}>{label}</span>;

  const first = tasks.reduce((min, t) => (t.plannedStart < min ? t.plannedStart : min), tasks[0]?.plannedStart ?? '');
  const last = tasks.reduce((max, t) => (t.plannedEnd > max ? t.plannedEnd : max), tasks[0]?.plannedEnd ?? '');
  const average = tasks.length ? tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length : 0;
  const slipped = tasks.filter(t => { const par = pairOf(t); return par && t.plannedEnd > par.plannedEnd; }).length;
  const open = tasks.find(t => t.id === openId);

  const viewControls = <div className="flex flex-wrap items-center gap-2">
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input type="checkbox" className="accent-blue-700" checked={grouped} onChange={e => { setGrouped(e.target.checked); setCollapsed([]); }} />Agrupar por recurso
    </label>
    {grouped && <button type="button" className="button-ghost" onClick={() => setCollapsed(collapsed.length ? [] : groupIds)}>{collapsed.length ? 'Expandir tudo' : 'Recolher tudo'}</button>}
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Escala
      <select className="field max-w-28 py-1.5" value={zoom} onChange={e => setZoom(e.target.value as keyof typeof PX)}>
        <option value="semana">Semana</option>
        <option value="mes">Mês</option>
      </select>
    </label>
  </div>;

  return <section data-tour="medio-gantt" className="panel my-6 overflow-hidden">
    <div className="space-y-3 border-b border-slate-100 px-5 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">{heading}{viewControls}</div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-600">Plano do mês
          <select className="field mt-1 max-w-72 py-1.5" value={plan.id} onChange={e => { setPlanId(e.target.value); setBaselineId(''); setOpenBaseline(false); setOpenId(''); }}>
            {live.map(p => <option key={p.id} value={p.id}>{p.name} · {p.month}</option>)}
          </select>
        </label>
        {baselines.length > 0 && <label className="text-xs font-semibold text-slate-600">Linha de base
          <select className="field mt-1 max-w-72 py-1.5" value={baselineId} onChange={e => { setBaselineId(e.target.value); setOpenBaseline(false); setOpenId(''); }}>
            <option value="">Comparar com nenhuma</option>
            {baselines.map(b => <option key={b.id} value={b.id}>{b.name}{b.frozenAt ? ` · ${formatTimestamp(b.frozenAt)}` : ''}</option>)}
          </select>
        </label>}
        {baseline && <button type="button" className="button-ghost" onClick={() => { setOpenBaseline(!openBaseline); setOpenId(''); }}>{openBaseline ? 'Voltar ao plano vivo' : 'Abrir a linha de base'}</button>}
        {frozen
          ? <ActionButton label="Excluir linha de base" pending="Excluindo…" ariaLabel={`Excluir a linha de base ${shown.name}`} command={{ type: 'delete_plan', planId: shown.id }} onDone={() => { setBaselineId(''); setOpenBaseline(false); setOpenId(''); }} />
          : <ActionButton label="Excluir plano" pending="Excluindo…" ariaLabel={`Excluir o plano ${plan.name} de ${plan.month}`} command={{ type: 'delete_plan', planId: plan.id }} onDone={() => { setPlanId(''); setBaselineId(''); setOpenId(''); }} />}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {newPlan}
        {!frozen && <CommandForm key={`freeze-${plan.id}-${tasks.length}`} title="Definir linha de base" submit="Congelar linha de base" onDone={id => { setBaselineId(id); setOpenBaseline(false); }}
          command={d => ({ type: 'freeze_plan_baseline', planId: plan.id, name: value(d, 'name') })}>
          <TextField name="name" label="Nome da linha de base" defaultValue={`Linha de base de ${formatDate(today)}`} />
        </CommandForm>}
      </div>

      {frozen
        ? <Callout tone="warning" role="status">Retrato congelado: esta é a linha de base “{shown.name}”{shown.frozenAt ? `, de ${formatTimestamp(shown.frozenAt)}` : ''}. Ela não aceita edição — só leitura, ou exclusão. Volte ao plano vivo para preencher o mês.</Callout>
        : compare && <p className="text-xs text-slate-500">Comparando com a linha de base “{compare.name}”: a barra fina sob cada linha é a data congelada. O par é achado pelo nome da linha, porque a linha de base é uma cópia e os ids não coincidem.</p>}
    </div>

    <div className="grid gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Linhas do plano" value={tasks.length} />
      <StatCard label="Período coberto" value={<span className="text-base">{tasks.length ? `${formatDate(first)} a ${formatDate(last)}` : 'Plano em branco'}</span>} />
      <StatCard label="Progresso médio" value={`${Math.round(average)}%`} />
      {compare
        ? <StatCard label="Linhas atrasadas vs. linha de base" value={slipped} tone={slipped > 0 ? 'warning' : 'default'} />
        : <StatCard label="Linhas de base salvas" value={baselines.length} />}
    </div>

    <div className="overflow-auto custom-scrollbar max-h-[72vh]" role="region" aria-label={`Plano de médio prazo de ${shown.month}`} tabIndex={0}>
      <div style={{ width: grid + total * px }} className="relative">
        <div className="sticky top-0 z-20 flex border-b border-slate-300 bg-slate-50">
          <div style={{ width: grid, height: HEAD }} className="sticky left-0 z-30 flex shrink-0 items-center border-r border-slate-300 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span className="w-10 border-r border-slate-200 px-2 text-center">#</span>
            {head('Linha', 'w-56')}{head('Dur.', 'w-16')}{head('Início', 'w-24')}{head('Término', 'w-24')}{head('Predec.', 'w-28')}{head('Recurso', 'w-28')}{compare && head('Desvio', 'w-20')}
          </div>
          <div className="relative shrink-0" style={{ width: total * px, height: HEAD }}>
            {months.map(month => <div key={`${month.label}-${month.from}`} style={{ left: month.from * px, width: month.span * px }}
              className="absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap border-r border-slate-300 px-1.5 text-[11px] font-semibold text-slate-600">{month.label}</div>)}
          </div>
        </div>

        <div className="relative">
          {today >= t0 && today <= t1 && <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: grid + x(today), borderLeft: '2px dashed #d97706' }} aria-hidden="true" />}
          <svg className="pointer-events-none absolute z-10" style={{ left: grid, top: 0, width: total * px, height: lines.length * ROW }} aria-hidden="true">
            {dependencies.map(dependency => {
              const from = lineOf.get(dependency.predecessorId), to = lineOf.get(dependency.successorId);
              if (from === undefined || to === undefined) return null;
              const predecessor = byId.get(dependency.predecessorId)!, successor = byId.get(dependency.successorId)!;
              const fromBar = span(predecessor.plannedStart, predecessor.plannedEnd), toBar = span(successor.plannedStart, successor.plannedEnd);
              const y1 = from * ROW + ROW / 2, y2 = to * ROW + ROW / 2;
              const x1 = fromBar.left + fromBar.width, x2 = toBar.left;
              const mid = Math.max(x1 + 6, x2 - 6);
              return <polyline key={dependency.id} points={`${x1},${y1} ${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none"
                stroke={conflicted.has(dependency.id) ? '#be123c' : '#94a3b8'} strokeWidth={1.5} />;
            })}
          </svg>

          {lines.length === 0 && <div className="flex border-b border-slate-100">
            <div style={{ width: grid }} className="sticky left-0 z-20 shrink-0 border-r border-slate-300 bg-white px-4 py-6">
              <Empty>{frozen
                ? 'Esta linha de base foi congelada sem linhas.'
                : 'Plano em branco. O cabeçalho e o calendário do mês já estão prontos: abra “Adicionar linha” abaixo e escreva a primeira tarefa do mês.'}</Empty>
            </div>
            <div className="shrink-0" style={{ width: total * px, height: 78 }} />
          </div>}

          {lines.map(line => {
            if (line.kind === 'group') {
              const bar = span(line.start, line.end);
              return <div key={`g-${line.id}`} className="flex border-b border-slate-200 bg-slate-100/80">
                <button type="button" onClick={() => setCollapsed(current => current.includes(line.id) ? current.filter(id => id !== line.id) : [...current, line.id])} aria-expanded={!hidden.has(line.id)}
                  style={{ width: grid, height: ROW }} className="sticky left-0 z-20 flex shrink-0 items-center border-r border-slate-300 bg-slate-100 text-left text-xs font-bold text-slate-800">
                  <span className="w-10 px-2 text-center text-slate-400" aria-hidden="true">{hidden.has(line.id) ? '▸' : '▾'}</span>
                  <span className="w-56 truncate px-2" title={line.name}>{line.name}</span>
                  <span className="w-16 px-2 tabular-nums">{days(line.start, line.end)}d</span>
                  <span className="w-24 px-2 tabular-nums">{formatDate(line.start)}</span>
                  <span className="w-24 px-2 tabular-nums">{formatDate(line.end)}</span>
                  <span className="w-28 px-2 font-normal text-slate-400">{line.count} {line.count === 1 ? 'linha' : 'linhas'}</span>
                  <span className="w-28 px-2" />
                  {compare && <span className="w-20 px-2" />}
                </button>
                <div className="relative shrink-0" style={{ width: total * px, height: ROW }}>
                  <div style={{ left: bar.left, width: bar.width }} className="absolute top-[11px] h-2 bg-slate-800" />
                  <div style={{ left: bar.left }} className="absolute top-[11px] h-3.5 w-[3px] bg-slate-800" />
                  <div style={{ left: bar.left + bar.width - 3 }} className="absolute top-[11px] h-3.5 w-[3px] bg-slate-800" />
                </div>
              </div>;
            }
            const { task } = line;
            const bar = span(task.plannedStart, task.plannedEnd);
            const par = pairOf(task);
            const baseBar = par && span(par.plannedStart, par.plannedEnd);
            const deviation = par ? drift(par.plannedEnd, task.plannedEnd) : undefined;
            const predecessors = predecessorsOf(task.id);
            const late = predecessors.some(d => conflicted.has(d.id));
            return <div key={task.id} className={`flex border-b border-slate-100 ${openId === task.id ? 'bg-blue-50/70' : 'hover:bg-slate-50/70'}`}>
              <button type="button" onClick={() => setOpenId(openId === task.id ? '' : task.id)} aria-expanded={openId === task.id}
                style={{ width: grid, height: ROW }} className="sticky left-0 z-20 flex shrink-0 items-center border-r border-slate-300 bg-inherit text-left text-xs text-slate-700">
                <span className="w-10 border-r border-slate-100 px-2 text-center tabular-nums text-slate-400">{numberOf.get(task.id)}</span>
                <span className="w-56 truncate px-2 pl-5 font-medium text-slate-800" title={task.name}>
                  {task.notes && <span className="mr-1 text-amber-600" title="Tem anotação">✎</span>}
                  {late && <span className="mr-1 font-bold text-rose-600" title="Começa antes do término da predecessora">!</span>}
                  {task.name}
                </span>
                <span className="w-16 px-2 tabular-nums">{days(task.plannedStart, task.plannedEnd)}d</span>
                <span className="w-24 px-2 tabular-nums">{formatDate(task.plannedStart)}</span>
                <span className="w-24 px-2 tabular-nums">{formatDate(task.plannedEnd)}</span>
                <span className={`w-28 truncate px-2 tabular-nums ${late ? 'text-rose-600' : 'text-slate-500'}`} title={predecessors.map(d => byId.get(d.predecessorId)?.name).filter(Boolean).join(', ')}>
                  {predecessors.map(d => numberOf.get(d.predecessorId) ?? '—').join(', ')}
                </span>
                <span className={`w-28 truncate px-2 ${task.teamId ? '' : 'text-amber-600'}`} title={resource(task.teamId)}>{resource(task.teamId)}</span>
                {compare && <span className={`w-20 truncate px-2 tabular-nums ${deviation === undefined ? 'text-slate-400' : deviation > 0 ? 'text-rose-600' : deviation < 0 ? 'text-emerald-600' : 'text-slate-500'}`}
                  title={deviation === undefined ? 'Sem linha equivalente na linha de base: a comparação casa as linhas pelo nome.' : `Término da linha de base: ${formatDate(par!.plannedEnd)}`}>
                  {deviation === undefined ? 'sem par' : deviation === 0 ? 'igual' : `${deviation > 0 ? '+' : '−'}${Math.abs(deviation)}d`}
                </span>}
              </button>
              <div className="relative shrink-0" style={{ width: total * px, height: ROW }}>
                <div title={`${task.name} · ${formatDate(task.plannedStart)} a ${formatDate(task.plannedEnd)} · ${Math.round(task.progress)}%`}
                  style={{ left: bar.left, width: bar.width }} className="absolute top-[6px] h-4 overflow-hidden rounded-sm border border-blue-800 bg-blue-500">
                  <div className="h-full bg-blue-800" style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }} />
                </div>
                {baseBar && <div title={`Linha de base · ${formatDate(par!.plannedStart)} a ${formatDate(par!.plannedEnd)}`}
                  style={{ left: baseBar.left, width: baseBar.width }} className="absolute top-[24px] h-[3px] rounded-sm bg-slate-500" />}
              </div>
            </div>;
          })}
        </div>
      </div>
    </div>

    {!frozen && <div className="border-t border-slate-100 px-5 py-4">
      <CommandForm key={`add-${shown.id}-${tasks.length}`} title="Adicionar linha" submit="Adicionar linha"
        command={d => ({ type: 'create_plan_task', planId: shown.id, name: value(d, 'name'), plannedStart: value(d, 'plannedStart'), plannedEnd: value(d, 'plannedEnd'), teamId: value(d, 'teamId') || null, activityId: value(d, 'activityId') || null })}>
        <TextField name="name" label="Nome da linha" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="plannedStart" label="Início" type="date" defaultValue={`${shown.month}-01`} />
          <TextField name="plannedEnd" label="Término" type="date" defaultValue={monthEnd(shown.month)} />
        </div>
        {teams.length > 0 && <TeamField teams={teams} />}
        {activities.length > 0 && <ActivityField activities={activities} locations={locations} />}
      </CommandForm>
    </div>}

    {open && <RowDetail task={open} plan={shown} frozen={frozen} tasks={tasks} numberOf={numberOf} teams={teams} activities={activities} locations={locations}
      predecessors={predecessorsOf(open.id)} successors={successorsOf(open.id)} conflicted={conflicted} pair={pairOf(open)} comparing={compare?.name}
      onClose={() => setOpenId('')} />}
  </section>;
}

function TeamField({ teams, defaultValue }: { teams: Team[]; defaultValue?: string }) {
  return <Field label="Recurso (opcional)">
    <select className="field" name="teamId" defaultValue={defaultValue ?? ''}>
      <option value="">Sem recurso</option>
      {teams.map(t => <option key={t.id} value={t.id}>{t.company} · {t.name}</option>)}
    </select>
  </Field>;
}

// Uma obra real tem milhares de atividades: o local filtra a lista antes de escolher o vínculo.
function ActivityField({ activities, locations, defaultValue }: { activities: Activity[]; locations: { id: string; name: string }[]; defaultValue?: string }) {
  const [chosen, setChosen] = useState(defaultValue ?? '');
  const [locationId, setLocationId] = useState(activities.find(a => a.id === defaultValue)?.locationId ?? '');
  const places = locations.filter(l => activities.some(a => a.locationId === l.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const options = activities.filter(a => a.locationId === locationId || a.id === chosen);
  return <div className="grid gap-4 sm:grid-cols-2">
    <Field label="Local (filtra as atividades)">
      <select className="field" value={locationId} onChange={e => setLocationId(e.target.value)}>
        <option value="">Selecione o local</option>
        {places.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </Field>
    <Field label="Atividade do longo prazo (opcional)">
      <select className="field" name="activityId" value={chosen} onChange={e => setChosen(e.target.value)}>
        <option value="">Sem vínculo</option>
        {options.map(a => <option key={a.id} value={a.id}>{a.name} · {formatDate(a.plannedStart)}</option>)}
      </select>
    </Field>
  </div>;
}

function ActionButton({ label, pending, command, ariaLabel, onDone }: { label: string; pending: string; command: Command; ariaLabel?: string; onDone?: () => void }) {
  const context = usePlanning();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (context.state !== 'ready') return null;
  const actor = context.planning.data.users.find(u => u.id === context.actorId);
  if (actor?.role === 'viewer') return null;
  return <span className="inline-flex flex-col gap-1.5">
    <button type="button" className="button-ghost" disabled={busy} aria-label={ariaLabel ?? label} onClick={async () => {
      if (busy) return; setBusy(true); setError('');
      try { await context.execute(command); onDone?.(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.'); }
      finally { setBusy(false); }
    }}>{busy ? pending : label}</button>
    {error && <Callout tone="danger" role="alert">{error}</Callout>}
  </span>;
}

function RowDetail({ task, plan, frozen, tasks, numberOf, teams, activities, locations, predecessors, successors, conflicted, pair, comparing, onClose }: {
  task: PlanTask; plan: MediumTermPlan; frozen: boolean; tasks: PlanTask[]; numberOf: Map<string, number>;
  teams: Team[]; activities: Activity[]; locations: { id: string; name: string }[];
  predecessors: PlanDependency[]; successors: PlanDependency[]; conflicted: Set<string>;
  pair?: PlanTask; comparing?: string; onClose: () => void;
}) {
  const context = usePlanning();
  if (context.state !== 'ready') return null;
  const byId = new Map(tasks.map(t => [t.id, t]));
  const label = (id: string) => { const found = byId.get(id); return found ? `${numberOf.get(id)}. ${found.name}` : 'Linha removida'; };
  const linked = activities.find(a => a.id === task.activityId);
  const team = teams.find(t => t.id === task.teamId);
  const load = team ? teamLoad(team.id, task.plannedStart, task.plannedEnd, context.planning.data) : undefined;
  const deviation = pair ? drift(pair.plannedEnd, task.plannedEnd) : undefined;

  return <div className="border-t border-slate-200 bg-slate-50/70 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="eyebrow">Linha {numberOf.get(task.id)} · {plan.name} · {plan.month} · {team ? `${team.company} · ${team.name}` : 'Sem recurso'}</p>
        <h3 className="mt-0.5 text-sm font-bold text-slate-900">{task.name}</h3>
        <p className="mt-1 text-xs text-slate-500">{formatDate(task.plannedStart)} a {formatDate(task.plannedEnd)} · {days(task.plannedStart, task.plannedEnd)} dias · {linked ? `vinculada a ${linked.name}` : 'sem vínculo com o longo prazo'}</p>
        {comparing && <p className="mt-1 text-xs text-slate-500">{pair
          ? `Linha de base “${comparing}”: ${formatDate(pair.plannedStart)} a ${formatDate(pair.plannedEnd)} · desvio de ${deviation === 0 ? 'nenhum dia' : `${Math.abs(deviation!)} ${Math.abs(deviation!) === 1 ? 'dia' : 'dias'} ${deviation! > 0 ? 'para depois' : 'para antes'}`}.`
          : `Sem linha equivalente na linha de base “${comparing}”: não há desvio a apurar, o par é achado pelo nome da linha.`}</p>}
        {load && <p className="mt-1 text-xs text-slate-500">{team!.name} no período desta linha: {load.assigned} {load.assigned === 1 ? 'atividade' : 'atividades'} do longo prazo para uma capacidade de {load.capacity}{load.overloaded ? ' — em sobrecarga.' : '.'}</p>}
      </div>
      <div className="flex items-center gap-3">
        <div className="w-40"><Progress value={task.progress} label={`Progresso de ${task.name}`} /></div>
        <button type="button" className="button-ghost" onClick={onClose}>Fechar</button>
      </div>
    </div>

    {task.notes && <p className="mt-4 whitespace-pre-line rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-slate-700">{task.notes}</p>}
    {frozen && <div className="mt-4"><Callout tone="warning" role="status">Linha de um retrato congelado: nada aqui pode ser alterado.</Callout></div>}

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="space-y-2">
        <p className="eyebrow">Predecessoras</p>
        {predecessors.length === 0 ? <Empty>Nenhuma predecessora.</Empty> : <ul className="space-y-1.5">{predecessors.map(d => <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
          <span className={conflicted.has(d.id) ? 'text-rose-700' : 'text-slate-700'}>{label(d.predecessorId)}{conflicted.has(d.id) && ' · esta começa antes do término dela'}</span>
          {!frozen && <ActionButton label="Remover" pending="Removendo…" ariaLabel={`Remover a ligação com ${label(d.predecessorId)}`} command={{ type: 'unlink_plan_tasks', dependencyId: d.id }} />}
        </li>)}</ul>}
        {!frozen && tasks.length > 1 && <CommandForm key={`link-${task.updatedAt}`} title="Ligar predecessora" submit="Ligar"
          command={d => ({ type: 'link_plan_tasks', predecessorId: value(d, 'predecessorId'), successorId: task.id })}>
          <Field label="Linha que precede esta">
            <select className="field" name="predecessorId" required defaultValue="">
              <option value="">Selecione</option>
              {tasks.filter(t => t.id !== task.id).map(t => <option key={t.id} value={t.id}>{numberOf.get(t.id)}. {t.name} · {formatDate(t.plannedStart)}</option>)}
            </select>
          </Field>
        </CommandForm>}
      </div>

      <div className="space-y-2">
        <p className="eyebrow">Sucessoras</p>
        {successors.length === 0 ? <Empty>Nenhuma sucessora.</Empty> : <ul className="space-y-1.5 text-sm">{successors.map(d => <li key={d.id} className={conflicted.has(d.id) ? 'text-rose-700' : 'text-slate-700'}>
          {label(d.successorId)}{conflicted.has(d.id) && ' · começa antes do término desta'}
        </li>)}</ul>}
        <p className="text-xs text-slate-400">A sucessora é ligada a partir da linha dela, para a leitura ficar sempre no mesmo sentido. As datas não se movem sozinhas: a rede aponta a incoerência, a reprogramação é sua.</p>
      </div>
    </div>

    {!frozen && <div className="mt-4 grid gap-4 lg:grid-cols-3">
      <CommandForm key={`edit-${task.updatedAt}`} title="Editar a linha" submit="Salvar linha"
        command={d => ({ type: 'update_plan_task', taskId: task.id, name: value(d, 'name'), plannedStart: value(d, 'plannedStart'), plannedEnd: value(d, 'plannedEnd'), teamId: value(d, 'teamId') || null, activityId: value(d, 'activityId') || null, progress: number(d, 'progress') })}>
        <TextField name="name" label="Nome da linha" defaultValue={task.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="plannedStart" label="Início" type="date" defaultValue={task.plannedStart} />
          <TextField name="plannedEnd" label="Término" type="date" defaultValue={task.plannedEnd} />
        </div>
        {teams.length > 0 && <TeamField teams={teams} defaultValue={task.teamId} />}
        {activities.length > 0 && <ActivityField activities={activities} locations={locations} defaultValue={task.activityId} />}
        <TextField name="progress" label="Progresso (%)" type="number" min={0} max={100} step="any" defaultValue={task.progress} />
      </CommandForm>
      <CommandForm key={`note-${task.updatedAt}`} title="Anotação" submit="Salvar anotação" command={d => ({ type: 'set_plan_task_note', taskId: task.id, note: value(d, 'note') })}>
        <Field label="Anotação da linha (vazio limpa)">
          <textarea className="field min-h-24" name="note" maxLength={2000} defaultValue={task.notes ?? ''} />
        </Field>
      </CommandForm>
      <div className="command-box space-y-2">
        <p className="text-sm font-semibold text-slate-700">Excluir linha</p>
        <p className="text-xs text-slate-500">A linha sai do plano do mês junto com as ligações dela. A linha de base já congelada não muda.</p>
        <ActionButton label="Excluir linha" pending="Excluindo…" ariaLabel={`Excluir a linha ${task.name} do plano ${plan.name}`} command={{ type: 'delete_plan_task', taskId: task.id }} onDone={onClose} />
      </div>
    </div>}
  </div>;
}

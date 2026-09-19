'use client';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Command } from '@/application/use-cases/commands';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import type { PlanTask } from '@/domain/entities';
import { rollUpPlan, type PlanRollUp } from '@/domain/rules';
import { addDays } from '@/domain/validation';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { CommandForm, TextField, value } from '@/modules/planejamento/forms';
import { Callout, Empty, StatCard } from '@/modules/planejamento/ui';
import { formatDate } from '@/shared/format';

const GRID = 1000, ROW = 30, HEAD = 40, DAY = 86400000;
const PX = { semana: 9, mes: 3.2 } as const;
const INDENT = 12;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
const drift = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const monthEnd = (month: string) => { const [year, m] = month.split('-').map(Number); return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10); };
// A linha de base é uma cópia congelada: os ids não coincidem, então o par vem pelo nome.
const nameKey = (name: string) => name.trim().toLowerCase();
type InputProps = React.ComponentProps<'input'>;

export function Gantt({ workId }: { workId: string }) {
  const context = usePlanning();
  const [zoom, setZoom] = useState<keyof typeof PX>('semana');
  const [planId, setPlanId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [openBaseline, setOpenBaseline] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const model = useMemo(() => {
    if (context.state !== 'ready') return undefined;
    const selected = selectWorkPlanning(context.planning, workId);
    const { data, today } = context.planning;
    const actor = data.users.find(u => u.id === context.actorId);
    if (!selected || !actor?.workIds.includes(workId)) return undefined;
    const plans = data.plans.filter(p => p.workId === workId);
    return {
      today, plans, readOnly: actor.role === 'viewer',
      live: plans.filter(p => !p.baselineOf).sort((a, b) => b.month.localeCompare(a.month)),
      tasks: data.planTasks, dependencies: data.planDependencies,
      teams: data.teams.filter(t => t.workId === workId).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name, 'pt-BR')),
    };
  }, [context, workId]);

  if (context.state !== 'ready' || !model) return null;
  const { live, plans, teams, today, readOnly } = model;
  const plan = live.find(p => p.id === planId) ?? live[0];
  const baselines = plan ? plans.filter(p => p.baselineOf === plan.id).sort((a, b) => (b.frozenAt ?? '').localeCompare(a.frozenAt ?? '')) : [];
  const baseline = baselines.find(b => b.id === baselineId);
  const shown = openBaseline && baseline ? baseline : plan;
  const frozen = !!shown?.frozenAt || readOnly;
  const compare = openBaseline ? undefined : baseline;

  const run = async (command: Command, key: string) => {
    if (busy) return;
    setBusy(key); setError('');
    try { await context.execute(command); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(''); }
  };

  const heading = <div>
    <h2 className="text-sm font-bold text-slate-800">Plano do mês</h2>
    <p className="mt-0.5 text-xs text-slate-500">A tabela é a folha de trabalho: escreva na linha em branco e a barra aparece. Editar uma célula salva ao sair dela. As datas não se movem sozinhas — a rede aponta a incoerência, a reprogramação é sua.</p>
  </div>;
  const newPlan = <CommandForm title="Novo plano do mês" submit="Criar plano" onDone={id => { setPlanId(id); setBaselineId(''); setOpenBaseline(false); }}
    command={d => ({ type: 'create_plan', workId, month: value(d, 'month'), name: value(d, 'name') || undefined })}>
    <TextField name="month" label="Mês do plano" type="month" defaultValue={today.slice(0, 7)} />
    <TextField name="name" label="Nome do plano (opcional)" required={false} />
  </CommandForm>;

  if (!plan || !shown) return <section data-tour="medio-gantt" className="panel my-6 p-5">
    {heading}
    <div className="my-4"><Empty>Esta obra ainda não tem plano de médio prazo. Nada vem importado para cá: crie o plano do mês e escreva as linhas.</Empty></div>
    <div className="max-w-md">{newPlan}</div>
  </section>;

  const tasks = model.tasks.filter(t => t.planId === shown.id).sort((a, b) => a.order - b.order || a.plannedStart.localeCompare(b.plannedStart));
  const byId = new Map(tasks.map(t => [t.id, t]));
  const numberOf = new Map(tasks.map((t, index) => [t.id, index + 1]));
  const taskByNumber = new Map(tasks.map((t, index) => [index + 1, t]));
  // A estrutura é lida da ordem e do recuo: item de resumo não tem datas próprias, mostra as dos
  // subitens. Tudo o que a tela desenha — célula, barra, seta, indicador — sai daqui, para não
  // existirem duas verdades sobre a mesma linha.
  const rollUp = rollUpPlan(tasks);
  const view = (task: PlanTask): PlanRollUp => rollUp.get(task.id)
    ?? { number: '', summary: false, leaves: 0, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, progress: task.progress };
  /** Quantas linhas estão debaixo desta: as seguintes com recuo maior, até voltar ao nível dela. */
  const familyOf = (index: number) => { let count = 0; for (let i = index + 1; i < tasks.length && tasks[i].level > tasks[index].level; i++) count++; return count; };
  const baseTasks = compare ? model.tasks.filter(t => t.planId === compare.id) : [];
  const baseRoll = rollUpPlan(baseTasks);
  const baseView = (task: PlanTask) => baseRoll.get(task.id) ?? { plannedStart: task.plannedStart, plannedEnd: task.plannedEnd };
  const pairs = new Map<string, PlanTask>();
  for (const task of baseTasks) if (!pairs.has(nameKey(task.name))) pairs.set(nameKey(task.name), task);
  const dependencies = model.dependencies.filter(d => byId.has(d.predecessorId) && byId.has(d.successorId));
  // Incoerência: a sucessora começa antes de a predecessora terminar.
  const conflicted = new Set(dependencies.filter(d => view(byId.get(d.successorId)!).plannedStart <= view(byId.get(d.predecessorId)!).plannedEnd).map(d => d.id));
  const predecessorsOf = (id: string) => dependencies.filter(d => d.successorId === id);

  const px = PX[zoom];
  const dates = [`${shown.month}-01`, monthEnd(shown.month), ...tasks.flatMap(t => [view(t).plannedStart, view(t).plannedEnd]), ...baseTasks.flatMap(t => [baseView(t).plannedStart, baseView(t).plannedEnd])];
  const t0 = dates.reduce((min, date) => (date < min ? date : min));
  const t1 = dates.reduce((max, date) => (date > max ? date : max));
  const total = days(t0, t1);
  const x = (date: string) => (Date.parse(date) - Date.parse(t0)) / DAY * px;
  const span = (start: string, end: string) => ({ left: x(start), width: Math.max(px, days(start, end) * px) });
  const months: { label: string; from: number; span: number }[] = [];
  for (let i = 0; i < total; i++) {
    const day = new Date(Date.parse(t0) + i * DAY);
    const label = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(day);
    const last = months.at(-1);
    if (last?.label === label) last.span++; else months.push({ label, from: i, span: 1 });
  }

  const slipped = compare ? tasks.filter(t => { const pair = pairs.get(nameKey(t.name)); return pair && drift(baseView(pair).plannedEnd, view(t).plannedEnd) > 0; }).length : 0;
  // A média conta só as linhas que têm avanço próprio: o item de resumo repetiria o dos subitens.
  const leaves = tasks.filter(t => !view(t).summary);
  const average = leaves.length ? Math.round(leaves.reduce((sum, t) => sum + t.progress, 0) / leaves.length) : 0;

  /** Predecessoras são digitadas como no Project: números de linha separados por vírgula. É a
   * posição na lista, não o número do item — o hierárquico muda a cada recuo. */
  const savePredecessors = async (task: PlanTask, raw: string) => {
    const wanted = new Set([...raw.matchAll(/\d+/g)].map(match => taskByNumber.get(Number(match[0]))?.id).filter((id): id is string => !!id && id !== task.id));
    const current = predecessorsOf(task.id);
    for (const dependency of current) if (!wanted.has(dependency.predecessorId)) { await run({ type: 'unlink_plan_tasks', dependencyId: dependency.id }, `pred-${task.id}`); }
    for (const predecessorId of wanted) if (!current.some(d => d.predecessorId === predecessorId)) { await run({ type: 'link_plan_tasks', predecessorId, successorId: task.id }, `pred-${task.id}`); }
  };
  const saveField = (task: PlanTask, patch: Partial<Pick<PlanTask, 'name' | 'plannedStart' | 'plannedEnd' | 'teamId' | 'progress'>>) => {
    const next = { ...task, ...patch };
    if (next.name === task.name && next.plannedStart === task.plannedStart && next.plannedEnd === task.plannedEnd && next.teamId === task.teamId && next.progress === task.progress) return;
    if (!next.name.trim() || next.plannedEnd < next.plannedStart) return;
    return run({ type: 'update_plan_task', taskId: task.id, name: next.name, plannedStart: next.plannedStart, plannedEnd: next.plannedEnd, teamId: next.teamId ?? null, activityId: task.activityId ?? null, progress: next.progress }, task.id);
  };
  /** Recuar ou avançar leva a linha e a subárvore dela. O nome digitado é salvo antes: o recuo
   * redesenha a linha, e o que estava na célula sem ter saído dela se perderia. */
  const move = async (task: PlanTask, type: 'indent_plan_task' | 'outdent_plan_task', typed?: string) => {
    if (typed !== undefined) await saveField(task, { name: typed });
    await run({ type, taskId: task.id }, task.id);
  };
  const removeRow = (task: PlanTask, index: number) => {
    const children = familyOf(index);
    // Excluir o item apaga os subitens: quem aperta o ✕ precisa saber disso antes, não depois.
    if (children > 0 && !window.confirm(`A linha "${task.name}" tem ${children} ${children === 1 ? 'subitem, que será excluído' : 'subitens, que serão excluídos'} junto com ela. Excluir mesmo assim?`)) return;
    return run({ type: 'delete_plan_task', taskId: task.id }, task.id);
  };
  // Datas, duração e avanço do item de resumo vêm dos subitens: a célula mostra o valor calculado
  // e muda quando eles mudam, então ela é controlada e não aceita edição.
  const rolled = (shownValue: string | number): InputProps => ({ value: shownValue, readOnly: true, disabled: true });
  const own = (initial: string | number, onBlur: InputProps['onBlur']): InputProps => ({ defaultValue: initial, disabled: frozen, onBlur });

  return <section data-tour="medio-gantt" className="panel my-6 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      {heading}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Plano
          <select className="field max-w-52 py-1.5" value={plan.id} onChange={e => { setPlanId(e.target.value); setBaselineId(''); setOpenBaseline(false); }}>
            {live.map(p => <option key={p.id} value={p.id}>{p.name} · {p.month}</option>)}
          </select>
        </label>
        {baselines.length > 0 && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Linha de base
          <select className="field max-w-44 py-1.5" value={baselineId} onChange={e => { setBaselineId(e.target.value); setOpenBaseline(false); }}>
            <option value="">Sem comparação</option>
            {baselines.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>}
        {baseline && <button type="button" className="button-ghost" onClick={() => setOpenBaseline(!openBaseline)}>{openBaseline ? 'Voltar ao plano' : 'Abrir a linha de base'}</button>}
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Escala
          <select className="field max-w-28 py-1.5" value={zoom} onChange={e => setZoom(e.target.value as keyof typeof PX)}>
            <option value="semana">Semana</option>
            <option value="mes">Mês</option>
          </select>
        </label>
      </div>
    </div>

    {shown.frozenAt && <div className="border-b border-slate-100 px-5 py-3"><Callout tone="info">Esta é a linha de base <strong>{shown.name}</strong>, congelada em {formatDate(shown.frozenAt.slice(0, 10))}. É um retrato do plano e não aceita edição.</Callout></div>}

    <div className="grid gap-4 border-b border-slate-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Linhas do plano" value={tasks.length} />
      <StatCard label="Período coberto" value={tasks.length ? `${formatDate(t0)} a ${formatDate(t1)}` : '—'} />
      <StatCard label="Progresso médio" value={`${average}%`} />
      <StatCard label={compare ? `Atrasadas vs ${compare.name}` : 'Comparação'} value={compare ? slipped : '—'} tone={slipped > 0 ? 'warning' : 'default'} />
    </div>

    {error && <div className="px-5 pt-4"><Callout tone="danger" role="alert">{error}</Callout></div>}

    <div className="overflow-auto custom-scrollbar max-h-[72vh]" role="region" aria-label="Plano do mês" tabIndex={0}>
      <div style={{ width: GRID + total * px }} className="relative">
        <div className="sticky top-0 z-20 flex border-b border-slate-300 bg-slate-50">
          <div style={{ width: GRID, height: HEAD }} className="sticky left-0 z-30 flex shrink-0 items-center border-r border-slate-300 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span className="w-10 border-r border-slate-200 px-2 text-center">#</span>
            <span className="w-14 border-r border-slate-200 px-2">Item</span>
            <span className="w-72 border-r border-slate-200 px-2">Nome da tarefa</span>
            <span className="w-16 border-r border-slate-200 px-2">Dur.</span>
            <span className="w-32 border-r border-slate-200 px-2">Início</span>
            <span className="w-32 border-r border-slate-200 px-2">Término</span>
            <span className="w-24 border-r border-slate-200 px-2">Predec.</span>
            <span className="w-36 border-r border-slate-200 px-2">Recurso</span>
            <span className="w-14 px-2">%</span>
          </div>
          <div className="relative shrink-0" style={{ width: total * px, height: HEAD }}>
            {months.map(month => <div key={`${month.label}-${month.from}`} style={{ left: month.from * px, width: month.span * px }}
              className="absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap border-r border-slate-300 px-1.5 text-[11px] font-semibold text-slate-600">{month.label}</div>)}
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: GRID + x(today), borderLeft: '2px dashed #d97706' }} aria-hidden="true" />
          <svg className="pointer-events-none absolute z-10" style={{ left: GRID, top: 0, width: total * px, height: tasks.length * ROW }} aria-hidden="true">
            {dependencies.map(dependency => {
              const from = numberOf.get(dependency.predecessorId)! - 1, to = numberOf.get(dependency.successorId)! - 1;
              const fromView = view(byId.get(dependency.predecessorId)!), toView = view(byId.get(dependency.successorId)!);
              const fromBar = span(fromView.plannedStart, fromView.plannedEnd);
              const toBar = span(toView.plannedStart, toView.plannedEnd);
              const y1 = from * ROW + ROW / 2, y2 = to * ROW + ROW / 2;
              const x1 = fromBar.left + fromBar.width, x2 = toBar.left, mid = Math.max(x1 + 6, x2 - 6);
              return <polyline key={dependency.id} points={`${x1},${y1} ${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none"
                stroke={conflicted.has(dependency.id) ? '#be123c' : '#94a3b8'} strokeWidth={1.5} />;
            })}
          </svg>

          {tasks.map((task, index) => {
            const item = view(task);
            const bar = span(item.plannedStart, item.plannedEnd);
            const pair = pairs.get(nameKey(task.name));
            const late = predecessorsOf(task.id).some(d => conflicted.has(d.id));
            const saving = busy === task.id || busy === `pred-${task.id}`;
            const row = numberOf.get(task.id);
            const progress = Math.min(100, Math.max(0, item.progress));
            // O botão já sabe o que o comando recusaria: a primeira linha não tem de quem ser
            // subitem, quem já é subitem da linha de cima não recua de novo, e o nível 0 não volta.
            const noIndent = frozen || index === 0 || task.level > tasks[index - 1].level;
            const noOutdent = frozen || task.level === 0;
            return <div key={task.id} className={`flex border-b border-slate-100 ${saving ? 'bg-amber-50/60' : 'hover:bg-slate-50/60'}`}>
              <div style={{ width: GRID, height: ROW }} className="sticky left-0 z-20 flex shrink-0 items-center border-r border-slate-300 bg-inherit text-xs text-slate-700">
                <span className="w-10 border-r border-slate-100 px-2 text-center tabular-nums text-slate-400">{row}</span>
                <span className={`w-14 border-r border-slate-100 px-2 tabular-nums ${item.summary ? 'font-bold text-slate-700' : 'text-slate-500'}`}
                  aria-label={`Item ${item.number}`}>{item.number}</span>
                <Cell width="w-72" title={task.notes}>
                  <input className={`cell ${item.summary ? 'font-bold text-slate-900' : ''}`} style={{ paddingLeft: 4 + task.level * INDENT }}
                    defaultValue={task.name} disabled={frozen} aria-label={`Nome da linha ${row}, item ${item.number}`}
                    onBlur={e => saveField(task, { name: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.currentTarget.blur(); return; }
                      if (e.key !== 'Tab') return;
                      // Tab e Shift+Tab são o recuo de quem vem do Project. Quando o comando não se
                      // aplica, o Tab volta a ser navegação, que é o que o teclado espera dele.
                      if (e.shiftKey ? noOutdent : noIndent) return;
                      e.preventDefault();
                      void move(task, e.shiftKey ? 'outdent_plan_task' : 'indent_plan_task', e.currentTarget.value);
                    }} />
                  {late && <span className="ml-1 font-bold text-rose-600" title="Começa antes do término da predecessora">!</span>}
                  <button type="button" disabled={noOutdent} onClick={() => move(task, 'outdent_plan_task')}
                    aria-label={`Avançar a linha ${row} para um nível acima`} title="Avançar um nível (Shift+Tab)"
                    className="ml-0.5 shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-400">
                    <ChevronLeft size={13} />
                  </button>
                  <button type="button" disabled={noIndent} onClick={() => move(task, 'indent_plan_task')}
                    aria-label={`Recuar a linha ${row} para subitem da linha acima`} title="Recuar para subitem (Tab)"
                    className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-slate-400">
                    <ChevronRight size={13} />
                  </button>
                </Cell>
                <Cell width="w-16">
                  <input className="cell tabular-nums" type="number" min={1} aria-label={item.summary ? 'Duração em dias, somada dos subitens' : 'Duração em dias'}
                    {...(item.summary ? rolled(days(item.plannedStart, item.plannedEnd)) : own(days(task.plannedStart, task.plannedEnd),
                      e => { const duration = Math.max(1, Number(e.target.value) || 1); saveField(task, { plannedEnd: addDays(task.plannedStart, duration - 1) }); }))} />
                </Cell>
                <Cell width="w-32">
                  <input className="cell tabular-nums" type="date" aria-label={item.summary ? 'Início, o mais cedo dos subitens' : 'Início'}
                    {...(item.summary ? rolled(item.plannedStart) : own(task.plannedStart,
                      e => { const start = e.target.value; if (start) saveField(task, { plannedStart: start, plannedEnd: task.plannedEnd < start ? start : task.plannedEnd }); }))} />
                </Cell>
                <Cell width="w-32">
                  <input className="cell tabular-nums" type="date" aria-label={item.summary ? 'Término, o mais tarde dos subitens' : 'Término'}
                    {...(item.summary ? rolled(item.plannedEnd) : own(task.plannedEnd, e => { if (e.target.value) saveField(task, { plannedEnd: e.target.value }); }))} />
                </Cell>
                <Cell width="w-24">
                  <input className="cell tabular-nums" disabled={frozen} aria-label="Predecessoras, por número de linha"
                    defaultValue={predecessorsOf(task.id).map(d => numberOf.get(d.predecessorId)).filter(Boolean).join(', ')}
                    onBlur={e => savePredecessors(task, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                </Cell>
                <Cell width="w-36">
                  <select className="cell" disabled={frozen} defaultValue={task.teamId ?? ''} aria-label="Recurso"
                    onChange={e => saveField(task, { teamId: e.target.value || undefined })}>
                    <option value="">Sem recurso</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.company} · {t.name}</option>)}
                  </select>
                </Cell>
                <Cell width="w-14" last>
                  <input className="cell tabular-nums" type="number" min={0} max={100} aria-label={item.summary ? 'Percentual, média dos subitens' : 'Percentual'}
                    {...(item.summary ? rolled(Math.round(item.progress)) : own(Math.round(task.progress),
                      e => saveField(task, { progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })))} />
                </Cell>
              </div>
              <div className="relative shrink-0" style={{ width: total * px, height: ROW }}>
                {pair && <div title={`Linha de base: ${formatDate(baseView(pair).plannedStart)} a ${formatDate(baseView(pair).plannedEnd)}`}
                  style={{ ...span(baseView(pair).plannedStart, baseView(pair).plannedEnd) }} className="absolute top-[21px] h-1.5 rounded-sm bg-slate-400/70" />}
                {item.summary
                  // O item de resumo desenha o envelope dos subitens: traço fino e escuro com as
                  // pontas marcadas, como a barra de resumo do Project — não é período próprio.
                  ? <>
                    <div title={`${task.name} · envelope dos ${item.leaves} subitens · ${formatDate(item.plannedStart)} a ${formatDate(item.plannedEnd)} · ${Math.round(item.progress)}%`}
                      style={{ left: bar.left, width: bar.width }} className="absolute top-[11px] h-1.5 overflow-hidden bg-slate-300">
                      <div className="h-full bg-slate-800" style={{ width: `${progress}%` }} />
                    </div>
                    <div aria-hidden="true" style={{ left: bar.left }} className="absolute top-[10px] h-2 w-2 rotate-45 bg-slate-800" />
                    <div aria-hidden="true" style={{ left: bar.left + bar.width - 8 }} className="absolute top-[10px] h-2 w-2 rotate-45 bg-slate-800" />
                  </>
                  : <div title={`${task.name} · ${formatDate(item.plannedStart)} a ${formatDate(item.plannedEnd)} · ${Math.round(item.progress)}%`}
                    style={{ left: bar.left, width: bar.width }} className="absolute top-[5px] h-4 overflow-hidden rounded-sm border border-blue-800 bg-blue-500">
                    <div className="h-full bg-blue-800" style={{ width: `${progress}%` }} />
                  </div>}
                {!frozen && <button type="button" onClick={() => removeRow(task, index)}
                  aria-label={`Excluir a linha ${row}${item.summary ? ` e os ${familyOf(index)} subitens dela` : ''}`} title={item.summary ? 'Excluir linha e subitens' : 'Excluir linha'}
                  className="absolute right-1 top-1 rounded px-1.5 text-xs text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600">✕</button>}
              </div>
            </div>;
          })}

          {!frozen && <BlankRow planId={shown.id} month={shown.month} today={today} number={tasks.length + 1} level={tasks.at(-1)?.level ?? 0} width={total * px} onSave={run} busy={busy === 'nova'} />}
        </div>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
      <p className="text-xs text-slate-400">Item e subitem: Tab recua a linha, Shift+Tab a devolve, e o recuo leva os subitens junto. <strong className="font-semibold text-slate-500">O item de resumo (em negrito) tem início, término, duração e % vindos dos subitens — por isso essas células não são editáveis</strong>, e a barra dele é o envelope do período. Predecessoras são digitadas pelo número da linha (a coluna #), separadas por vírgula. A barra cinza sob a azul é a linha de base comparada, pareada pelo nome da linha.</p>
      <div className="flex flex-wrap gap-2">
        {!shown.frozenAt && !readOnly && <>
          <CommandForm title="Definir linha de base" submit="Congelar plano" command={d => ({ type: 'freeze_plan_baseline', planId: plan.id, name: value(d, 'name') })}>
            <TextField name="name" label="Nome da linha de base" />
          </CommandForm>
          <CommandForm title="Excluir plano" submit="Excluir" command={() => ({ type: 'delete_plan', planId: plan.id })} onDone={() => setPlanId('')}>
            <p className="text-sm text-slate-600">Exclui o plano de {plan.month} e todas as suas linhas. Linhas de base salvas impedem a exclusão.</p>
          </CommandForm>
        </>}
        <div className="max-w-xs">{newPlan}</div>
      </div>
    </div>
  </section>;
}

function Cell({ width, children, title, last }: { width: string; children: React.ReactNode; title?: string; last?: boolean }) {
  return <span title={title} className={`${width} flex items-center ${last ? '' : 'border-r border-slate-100'} px-1`}>{children}</span>;
}

/** A linha em branco é o modo de criar: escreveu o nome, a linha existe e a barra aparece.
 * A duração nasce de um dia, como no Project, e o início cai no mês do plano. O recuo é o da
 * última linha — quem está detalhando um item segue detalhando — e o campo já aparece recuado. */
function BlankRow({ planId, month, today, number, level, width, onSave, busy }: {
  planId: string; month: string; today: string; number: number; level: number; width: number;
  onSave: (command: Command, key: string) => Promise<void>; busy: boolean;
}) {
  const [name, setName] = useState('');
  const start = today.slice(0, 7) === month ? today : `${month}-01`;
  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setName('');
    await onSave({ type: 'create_plan_task', planId, name: trimmed, plannedStart: start, plannedEnd: start }, 'nova');
  };
  return <div className="flex border-b border-slate-100 bg-blue-50/30">
    <div style={{ width: GRID, height: ROW }} className="sticky left-0 z-20 flex shrink-0 items-center border-r border-slate-300 bg-blue-50/60 text-xs">
      <span className="w-10 border-r border-slate-100 px-2 text-center tabular-nums text-slate-300">{number}</span>
      <span className="w-14 border-r border-slate-100 px-2 text-slate-300" aria-hidden="true">—</span>
      <span className="flex w-72 items-center border-r border-slate-100 px-1">
        <input className="cell" style={{ paddingLeft: 4 + level * INDENT }} value={name} disabled={busy} placeholder={busy ? 'Criando…' : 'Escreva a próxima tarefa e tecle Enter'}
          aria-label="Nova linha do plano" onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} onBlur={create} />
      </span>
      <span className="px-2 text-slate-400">começa em {formatDate(start)}, um dia{level > 0 ? `, no recuo do nível ${level + 1}` : ''} — ajuste depois de criar</span>
    </div>
    <div className="shrink-0" style={{ width, height: ROW }} />
  </div>;
}

'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, Lock, LockOpen } from 'lucide-react';
import type { Command } from '@/application/use-cases/commands';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import type { PlanDependency, PlanTask } from '@/domain/entities';
import { formatLink, linkConflicts, parseLinks, rollUpPlan, targetPercent, type PlanRollUp } from '@/domain/rules';
import { addDays } from '@/domain/validation';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { CommandForm, TextField, value } from '@/modules/planejamento/forms';
import { Callout, Empty, StatCard } from '@/modules/planejamento/ui';
import { formatDate } from '@/shared/format';

const ROW = 28, HEAD = 40, DAY = 86400000;
const PX = { semana: 9, mes: 3.2 } as const;
const INDENT = 12;
// Largura de cada coluna da parte fixa, em pixels. O bloco da esquerda é grudado com `sticky` e
// precisa ter a soma exata das colunas que desenha — por isso a largura sai daqui, e não de
// classes soltas: as duas últimas só existem quando há linha de base em comparação.
const COL = { row: 36, item: 52, name: 260, duration: 56, start: 120, end: 120, links: 104, team: 132, percent: 52, target: 60, gap: 72, baseEnd: 108, variance: 72 } as const;
const sum = (widths: number[]) => widths.reduce((total, each) => total + each, 0);
const FIXED = sum([COL.row, COL.item, COL.name, COL.duration, COL.start, COL.end, COL.links, COL.team, COL.percent, COL.target, COL.gap]);
const FIXED_COMPARE = FIXED + COL.baseEnd + COL.variance;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
const drift = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);
const monthEnd = (month: string) => { const [year, m] = month.split('-').map(Number); return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10); };
// A linha de base é uma cópia congelada: os ids não coincidem, então o par vem pelo nome.
const nameKey = (name: string) => name.trim().toLowerCase();
const DASH = '—';

/** As colunas que recebem foco e edição. As calculadas ficam de fora: não há o que digitar nelas. */
type Column = 'name' | 'duration' | 'start' | 'end' | 'links' | 'team' | 'percent';
const cellKey = (taskId: string, column: Column) => `${taskId}:${column}`;
type CellMap = Map<string, HTMLInputElement | HTMLSelectElement>;

const FOLDED = 'medio-prazo:recolhidos:';
/** O que está recolhido é preferência de quem lê, não dado do plano: fica no navegador, por plano.
 * Janela anônima e armazenamento bloqueado derrubariam a grade inteira, e lixo gravado por uma
 * versão anterior também — por isso toda leitura é protegida e filtrada. */
function readFolded(planId: string): Set<string> {
  if (!planId || typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(FOLDED + planId);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []);
  } catch { return new Set(); }
}
function writeFolded(planId: string, ids: Set<string>) {
  if (!planId || typeof window === 'undefined') return;
  try { window.localStorage.setItem(FOLDED + planId, JSON.stringify([...ids])); } catch { /* sem armazenamento a preferência vale só nesta sessão, e a grade segue funcionando */ }
}

export function Gantt({ workId }: { workId: string }) {
  const context = usePlanning();
  const [zoom, setZoom] = useState<keyof typeof PX>('semana');
  const [planId, setPlanId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  const [openBaseline, setOpenBaseline] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // A grade abre bloqueada: a tela da reunião é para ler e conferir, e uma tecla distraída não
  // pode reprogramar a obra. O cadeado é da interface e não substitui a permissão — plano
  // congelado e perfil de consulta continuam impedindo a edição por baixo dele.
  const [locked, setLocked] = useState(true);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<{ row: number; pieces: string[] } | null>(null);
  const cells = useRef<CellMap>(new Map());

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

  // O plano em tela precisa ser conhecido antes das saídas antecipadas para a preferência de
  // recolhimento ser lida na troca de plano, e lida no efeito: no servidor não há localStorage.
  const current = (model?.live.find(p => p.id === planId) ?? model?.live[0])?.id ?? '';
  useEffect(() => { setFolded(readFolded(current)); setRejected(null); }, [current]);

  if (context.state !== 'ready' || !model) return null;
  const { live, plans, teams, today, readOnly } = model;
  const plan = live.find(p => p.id === planId) ?? live[0];
  const baselines = plan ? plans.filter(p => p.baselineOf === plan.id).sort((a, b) => (b.frozenAt ?? '').localeCompare(a.frozenAt ?? '')) : [];
  const baseline = baselines.find(b => b.id === baselineId);
  const shown = openBaseline && baseline ? baseline : plan;
  const frozen = !!shown?.frozenAt || readOnly;
  const editable = !frozen && !locked;
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
  // O número da coluna # é a posição na lista inteira, e não muda quando uma parte é recolhida:
  // é ele que as predecessoras citam, e uma referência que anda vira vínculo para outra linha.
  const numberOf = new Map(tasks.map((t, index) => [t.id, index + 1]));
  const taskByNumber = new Map(tasks.map((t, index) => [index + 1, t]));
  const indexOf = new Map(tasks.map((t, index) => [t.id, index]));
  // A estrutura é lida da ordem e do recuo: item de resumo não tem datas próprias, mostra as dos
  // subitens. Tudo o que a tela desenha — célula, barra, seta, indicador — sai daqui, para não
  // existirem duas verdades sobre a mesma linha.
  const rollUp = rollUpPlan(tasks);
  const view = (task: PlanTask): PlanRollUp => rollUp.get(task.id)
    ?? { number: '', summary: false, leaves: 0, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, progress: task.progress };
  /** Quantas linhas estão debaixo desta: as seguintes com recuo maior, até voltar ao nível dela. */
  const familyOf = (index: number) => { let count = 0; for (let i = index + 1; i < tasks.length && tasks[i].level > tasks[index].level; i++) count++; return count; };
  // Recolher é dobra de leitura, não filtro: as linhas escondidas continuam entrando no resumo,
  // no período coberto, na média e na checagem dos vínculos. Só saem do desenho.
  const hidden = new Set<string>();
  for (let i = 0; i < tasks.length; i++) {
    if (!folded.has(tasks[i].id)) continue;
    for (let j = i + 1; j < tasks.length && tasks[j].level > tasks[i].level; j++) hidden.add(tasks[j].id);
  }
  const visible = tasks.filter(t => !hidden.has(t.id));
  const visibleAt = new Map(visible.map((t, index) => [t.id, index]));

  const baseTasks = compare ? model.tasks.filter(t => t.planId === compare.id) : [];
  const baseRoll = rollUpPlan(baseTasks);
  const baseView = (task: PlanTask) => baseRoll.get(task.id) ?? { plannedStart: task.plannedStart, plannedEnd: task.plannedEnd };
  const pairs = new Map<string, PlanTask>();
  for (const task of baseTasks) if (!pairs.has(nameKey(task.name))) pairs.set(nameKey(task.name), task);
  const dependencies = model.dependencies.filter(d => byId.has(d.predecessorId) && byId.has(d.successorId));
  // A incoerência é lida pelo tipo do vínculo — II prende início a início, TT término a término —,
  // e sobre as datas que a linha mostra: no item de resumo, as dos subitens.
  const conflicts = new Map(linkConflicts(tasks.map(t => ({ ...t, plannedStart: view(t).plannedStart, plannedEnd: view(t).plannedEnd })), dependencies)
    .map(conflict => [conflict.dependency.id, conflict]));
  const predecessorsOf = (id: string) => dependencies.filter(d => d.successorId === id);
  const linkText = (dependency: PlanDependency) => formatLink(numberOf.get(dependency.predecessorId) ?? 0, dependency);

  const px = PX[zoom];
  const grid = compare ? FIXED_COMPARE : FIXED;
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

  const fold = (ids: Set<string>) => { setFolded(ids); writeFolded(current, ids); };
  const toggleFold = (taskId: string) => { const next = new Set(folded); if (!next.delete(taskId)) next.add(taskId); fold(next); };
  /** Foco na mesma coluna, uma linha acima ou abaixo — pelas linhas visíveis, que é o que se vê. */
  const step = (taskId: string, column: Column, delta: number) => {
    const at = visibleAt.get(taskId);
    if (at === undefined) return;
    const next = visible[at + delta];
    if (next) cells.current.get(cellKey(next.id, column))?.focus();
  };

  /** Predecessoras são escritas como no Project: número da linha (a coluna #), com tipo e
   * defasagem opcionais — `12`, `12II+2d`, `15TT-1d`. Trocar o tipo ou a defasagem de um vínculo
   * que já existe é desligar e ligar de novo: o servidor recusa o par repetido. O que foi recusado
   * é dito em voz alta; sumir com o que a pessoa digitou sem explicar é o pior desfecho possível. */
  const savePredecessors = async (task: PlanTask, raw: string, row: number) => {
    const { links, invalid } = parseLinks(raw);
    const refused = invalid.map(piece => `“${piece}” não é um vínculo`);
    const wanted = new Map<string, { type: PlanDependency['type']; lagDays: number; lagBusiness: boolean }>();
    for (const link of links) {
      const target = taskByNumber.get(link.number);
      if (!target) { refused.push(`a linha ${link.number} não existe`); continue; }
      if (target.id === task.id) { refused.push(`a linha ${link.number} é esta mesma`); continue; }
      if (wanted.has(target.id)) { refused.push(`a linha ${link.number} foi citada duas vezes`); continue; }
      wanted.set(target.id, { type: link.type, lagDays: link.lagDays, lagBusiness: link.lagBusiness });
    }
    setRejected(refused.length ? { row, pieces: refused } : null);
    const before = predecessorsOf(task.id);
    const same = (dependency: PlanDependency, link: { type: PlanDependency['type']; lagDays: number; lagBusiness: boolean }) =>
      dependency.type === link.type && dependency.lagDays === link.lagDays && dependency.lagBusiness === link.lagBusiness;
    for (const dependency of before) {
      const link = wanted.get(dependency.predecessorId);
      if (!link || !same(dependency, link)) await run({ type: 'unlink_plan_tasks', dependencyId: dependency.id }, `pred-${task.id}`);
    }
    for (const [predecessorId, link] of wanted) {
      const existing = before.find(d => d.predecessorId === predecessorId);
      if (existing && same(existing, link)) continue;
      await run({ type: 'link_plan_tasks', predecessorId, successorId: task.id, linkType: link.type, lagDays: link.lagDays, lagBusiness: link.lagBusiness }, `pred-${task.id}`);
    }
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

  const summaries = tasks.filter(t => view(t).summary);
  const lockLabel = locked ? 'Grade bloqueada: destranque para editar' : 'Grade liberada: as células aceitam edição';

  return <section data-tour="medio-gantt" className="panel my-6 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      {heading}
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={() => setLocked(!locked)} aria-pressed={!locked} title={lockLabel}
          className={`button-ghost py-1.5 ${locked ? '' : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900'}`}>
          {locked ? <Lock size={14} /> : <LockOpen size={14} />}{locked ? 'Bloqueada' : 'Liberada'}
        </button>
        {summaries.length > 0 && <div className="flex gap-1">
          <button type="button" className="button-ghost px-2 py-1.5" onClick={() => fold(new Set(summaries.map(t => t.id)))}
            aria-label="Recolher todos os itens de resumo" title="Recolher tudo"><ChevronsDownUp size={14} /></button>
          <button type="button" className="button-ghost px-2 py-1.5" onClick={() => fold(new Set())}
            aria-label="Expandir todos os itens de resumo" title="Expandir tudo"><ChevronsUpDown size={14} /></button>
        </div>}
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
      <StatCard label="Período coberto" value={tasks.length ? `${formatDate(t0)} a ${formatDate(t1)}` : DASH} />
      <StatCard label="Progresso médio" value={`${average}%`} />
      <StatCard label={compare ? `Atrasadas vs ${compare.name}` : 'Comparação'} value={compare ? slipped : DASH} tone={slipped > 0 ? 'warning' : 'default'} />
    </div>

    {error && <div className="px-5 pt-4"><Callout tone="danger" role="alert">{error}</Callout></div>}
    {rejected && <div className="px-5 pt-4"><Callout tone="warning" role="status">
      Predecessoras da linha {rejected.row}: {rejected.pieces.join('; ')}. O resto do que você digitou foi gravado. Escreva o número da linha, com o tipo e a defasagem quando precisar — <strong>12</strong>, <strong>12II+2d</strong>, <strong>15TT-1d</strong>.{' '}
      <button type="button" className="font-semibold underline" onClick={() => setRejected(null)}>Dispensar</button>
    </Callout></div>}

    <div className="overflow-auto custom-scrollbar max-h-[72vh]" role="region" aria-label="Plano do mês" tabIndex={0}>
      <div style={{ width: grid + total * px }} className="relative">
        <div className="sticky top-0 z-20 flex border-b border-slate-300 bg-slate-50">
          <div style={{ width: grid, height: HEAD }} className="sticky left-0 z-30 flex shrink-0 items-center border-r border-slate-300 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            <span style={{ width: COL.row }} className="shrink-0 border-r border-slate-200 px-2 text-center">#</span>
            <span style={{ width: COL.item }} className="shrink-0 border-r border-slate-200 px-2">Item</span>
            <span style={{ width: COL.name }} className="shrink-0 border-r border-slate-200 px-2">Nome da tarefa</span>
            <span style={{ width: COL.duration }} className="shrink-0 border-r border-slate-200 px-2">Dur.</span>
            <span style={{ width: COL.start }} className="shrink-0 border-r border-slate-200 px-2">Início</span>
            <span style={{ width: COL.end }} className="shrink-0 border-r border-slate-200 px-2">Término</span>
            <span style={{ width: COL.links }} className="shrink-0 border-r border-slate-200 px-2" title="Número da linha, com tipo e defasagem: 12, 12II+2d, 15TT-1d">Predec.</span>
            <span style={{ width: COL.team }} className="shrink-0 border-r border-slate-200 px-2">Recurso</span>
            <span style={{ width: COL.percent }} className="shrink-0 border-r border-slate-200 px-2">%</span>
            <span style={{ width: COL.target }} className="shrink-0 border-r border-slate-200 px-2" title="Quanto do tempo útil planejado já passou até hoje. É leitura de tempo decorrido, não medição física.">% alvo</span>
            <span style={{ width: COL.gap }} className={`shrink-0 px-2 ${compare ? 'border-r border-slate-200' : ''}`} title="Percentual informado menos o alvo, em pontos percentuais.">Desvio</span>
            {compare && <>
              <span style={{ width: COL.baseEnd }} className="shrink-0 border-r border-slate-200 px-2">Térm. base</span>
              <span style={{ width: COL.variance }} className="shrink-0 px-2" title="Dias entre o término da linha de base e o término planejado agora.">Variação</span>
            </>}
          </div>
          <div className="relative shrink-0" style={{ width: total * px, height: HEAD }}>
            {months.map(month => <div key={`${month.label}-${month.from}`} style={{ left: month.from * px, width: month.span * px }}
              className="absolute top-0 flex h-full items-center overflow-hidden whitespace-nowrap border-r border-slate-300 px-1.5 text-[11px] font-semibold text-slate-600">{month.label}</div>)}
          </div>
        </div>

        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: grid + x(today), borderLeft: '2px dashed #d97706' }} aria-hidden="true" />
          <svg className="pointer-events-none absolute z-10" style={{ left: grid, top: 0, width: total * px, height: visible.length * ROW }} aria-hidden="true">
            {dependencies.flatMap(dependency => {
              const from = visibleAt.get(dependency.predecessorId), to = visibleAt.get(dependency.successorId);
              // Vínculo com uma ponta recolhida não tem onde ser desenhado — ele continua valendo
              // no cálculo, só não vira seta.
              if (from === undefined || to === undefined) return [];
              const fromView = view(byId.get(dependency.predecessorId)!), toView = view(byId.get(dependency.successorId)!);
              const fromBar = span(fromView.plannedStart, fromView.plannedEnd);
              const toBar = span(toView.plannedStart, toView.plannedEnd);
              const y1 = from * ROW + ROW / 2, y2 = to * ROW + ROW / 2;
              const x1 = fromBar.left + fromBar.width, x2 = toBar.left, mid = Math.max(x1 + 6, x2 - 6);
              return [<polyline key={dependency.id} points={`${x1},${y1} ${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none"
                stroke={conflicts.has(dependency.id) ? '#be123c' : '#94a3b8'} strokeWidth={1.5} />];
            })}
          </svg>

          {visible.map(task => {
            const index = indexOf.get(task.id) ?? 0;
            const item = view(task);
            const bar = span(item.plannedStart, item.plannedEnd);
            const pair = pairs.get(nameKey(task.name));
            const saving = busy === task.id || busy === `pred-${task.id}`;
            const row = numberOf.get(task.id) ?? index + 1;
            const progress = Math.min(100, Math.max(0, item.progress));
            const shut = folded.has(task.id);
            const children = familyOf(index);
            // O botão já sabe o que o comando recusaria: a primeira linha não tem de quem ser
            // subitem, quem já é subitem da linha de cima não recua de novo, e o nível 0 não volta.
            const noIndent = !editable || index === 0 || task.level > tasks[index - 1].level;
            const noOutdent = !editable || task.level === 0;
            const links = predecessorsOf(task.id);
            const issues = links.flatMap(d => { const conflict = conflicts.get(d.id); return conflict ? [conflict] : []; });
            // Apontar não é reprogramar: o texto diz que ponta o vínculo prende, a data mais cedo
            // que ele permite e a que está lá — a correção é decisão de quem planeja.
            const issueText = issues.map(conflict => `${conflict.edge === 'start' ? 'Início' : 'Término'} não pode vir antes de ${formatDate(conflict.earliest)} pelo vínculo ${linkText(conflict.dependency)} (linha ${numberOf.get(conflict.dependency.predecessorId)}); está em ${formatDate(conflict.actual)}.`).join(' ');
            // O alvo é do tempo decorrido; datas invertidas por dado antigo, ou um período que não
            // tem nenhum dia útil dentro, não podem quebrar a tela nem virar número inventado.
            const elapsed = item.plannedEnd < item.plannedStart ? undefined : targetPercent(item, today);
            const target = elapsed !== undefined && Number.isFinite(elapsed) ? elapsed : undefined;
            const gap = target === undefined ? undefined : Math.round(item.progress - target);
            const baseEnd = pair ? baseView(pair).plannedEnd : undefined;
            const variance = baseEnd ? drift(baseEnd, item.plannedEnd) : undefined;
            const calculated = item.summary ? 'text-slate-500' : '';
            return <div key={task.id} className={`flex border-b border-slate-100 ${saving ? 'bg-amber-50/60' : 'hover:bg-slate-50/60'}`}>
              <div style={{ width: grid, height: ROW }} className="sticky left-0 z-20 flex shrink-0 items-center border-r border-slate-300 bg-inherit text-xs text-slate-700">
                <span style={{ width: COL.row }} className="shrink-0 border-r border-slate-100 px-2 text-center tabular-nums text-slate-400">{row}</span>
                <span style={{ width: COL.item }} className={`shrink-0 border-r border-slate-100 px-2 tabular-nums ${item.summary ? 'font-bold text-slate-700' : 'text-slate-500'}`}
                  aria-label={`Item ${item.number}`}>{item.number}</span>
                <Cell width={COL.name} title={task.notes ?? task.name}>
                  {item.summary
                    ? <button type="button" onClick={() => toggleFold(task.id)} aria-expanded={!shut} style={{ marginLeft: task.level * INDENT }}
                      aria-label={`${shut ? 'Expandir' : 'Recolher'} os ${children} subitens da linha ${row}`} title={shut ? 'Expandir os subitens' : 'Recolher os subitens'}
                      className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
                      {shut ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                    : <span aria-hidden="true" className="shrink-0" style={{ width: 17 + task.level * INDENT }} />}
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="name" text={task.name} editable={editable}
                    label={`Nome da linha ${row}, item ${item.number}`} className={item.summary ? 'font-bold text-slate-900' : ''}
                    onCommit={next => saveField(task, { name: next })}
                    onSpecialKey={event => {
                      if (event.key !== 'Tab') return false;
                      // Tab e Shift+Tab são o recuo de quem vem do Project. Quando o comando não se
                      // aplica, o Tab volta a ser navegação, que é o que o teclado espera dele.
                      if (event.shiftKey ? noOutdent : noIndent) return false;
                      event.preventDefault();
                      void move(task, event.shiftKey ? 'outdent_plan_task' : 'indent_plan_task', event.currentTarget.value);
                      return true;
                    }} />
                  {shut && <span className="shrink-0 px-1 text-[10px] font-semibold text-slate-400" title={`${children} linhas recolhidas`}>+{children}</span>}
                  {issues.length > 0 && <span className="ml-0.5 shrink-0 font-bold text-rose-600" title={issueText} aria-label={issueText}>!</span>}
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
                <Cell width={COL.duration}>
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="duration" type="number" min={1} className={calculated}
                    text={String(days(item.plannedStart, item.plannedEnd))} editable={editable && !item.summary}
                    label={item.summary ? `Duração da linha ${row} em dias, somada dos subitens` : `Duração da linha ${row} em dias`}
                    onCommit={next => saveField(task, { plannedEnd: addDays(task.plannedStart, Math.max(1, Number(next) || 1) - 1) })} />
                </Cell>
                <Cell width={COL.start}>
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="start" type="date" className={calculated}
                    text={item.plannedStart} editable={editable && !item.summary}
                    label={item.summary ? `Início da linha ${row}, o mais cedo dos subitens` : `Início da linha ${row}`}
                    onCommit={next => (next ? saveField(task, { plannedStart: next, plannedEnd: task.plannedEnd < next ? next : task.plannedEnd }) : undefined)} />
                </Cell>
                <Cell width={COL.end}>
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="end" type="date" className={calculated}
                    text={item.plannedEnd} editable={editable && !item.summary}
                    label={item.summary ? `Término da linha ${row}, o mais tarde dos subitens` : `Término da linha ${row}`}
                    onCommit={next => (next ? saveField(task, { plannedEnd: next }) : undefined)} />
                </Cell>
                <Cell width={COL.links}>
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="links" editable={editable}
                    text={links.map(linkText).join(', ')} label={`Predecessoras da linha ${row}, por número de linha`}
                    title="Número da linha (coluna #), com tipo e defasagem: 12, 12II+2d, 15TT-1d"
                    onCommit={next => savePredecessors(task, next, row)} />
                </Cell>
                <Cell width={COL.team}>
                  <select className="cell" disabled={!editable} defaultValue={task.teamId ?? ''} aria-label={`Recurso da linha ${row}`}
                    ref={node => { const key = cellKey(task.id, 'team'); if (node) cells.current.set(key, node); else cells.current.delete(key); }}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); step(task.id, 'team', 1); } }}
                    onChange={e => saveField(task, { teamId: e.target.value || undefined })}>
                    <option value="">Sem recurso</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.company} · {t.name}</option>)}
                  </select>
                </Cell>
                <Cell width={COL.percent}>
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="percent" type="number" min={0} max={100} className={calculated}
                    text={String(Math.round(item.progress))} editable={editable && !item.summary}
                    label={item.summary ? `Percentual da linha ${row}, média dos subitens` : `Percentual da linha ${row}`}
                    onCommit={next => saveField(task, { progress: Math.min(100, Math.max(0, Number(next) || 0)) })} />
                </Cell>
                <ReadCell width={COL.target} label={`Percentual-alvo da linha ${row}, pelo tempo decorrido até hoje`}
                  title={target === undefined ? undefined : `Tempo útil decorrido até ${formatDate(today)}. É leitura de tempo, não medição física.`}
                  text={target === undefined ? DASH : `${Math.round(target)}%`} />
                <ReadCell width={COL.gap} last={!compare} label={`Desvio da linha ${row}, em pontos percentuais`}
                  title={gap === undefined ? undefined : `${Math.round(item.progress)}% informado contra ${Math.round(target ?? 0)}% de alvo.`}
                  text={gap === undefined ? DASH : `${gap > 0 ? '+' : gap < 0 ? '−' : ''}${Math.abs(gap)} pp`}
                  tone={gap === undefined || gap === 0 ? '' : gap < -5 ? 'font-semibold text-rose-700' : gap < 0 ? 'text-amber-700' : 'text-emerald-700'} />
                {compare && <>
                  <ReadCell width={COL.baseEnd} label={`Término na linha de base da linha ${row}`}
                    title={baseEnd ? `Linha de base ${compare.name}: ${formatDate(baseView(pair!).plannedStart)} a ${formatDate(baseEnd)}` : 'Esta linha não tem par na linha de base, que é pareado pelo nome.'}
                    text={baseEnd ? formatDate(baseEnd) : DASH} />
                  <ReadCell width={COL.variance} last label={`Variação da linha ${row} contra a linha de base, em dias`}
                    title={variance === undefined ? undefined : variance > 0 ? `Termina ${variance} dia(s) depois da linha de base.` : variance < 0 ? `Termina ${Math.abs(variance)} dia(s) antes da linha de base.` : 'Termina na data da linha de base.'}
                    text={variance === undefined ? DASH : `${variance > 0 ? '+' : ''}${variance} d`}
                    tone={variance === undefined || variance === 0 ? '' : variance > 0 ? 'font-semibold text-rose-700' : 'text-emerald-700'} />
                </>}
              </div>
              <div className="relative shrink-0" style={{ width: total * px, height: ROW }}>
                {pair && <div title={`Linha de base: ${formatDate(baseView(pair).plannedStart)} a ${formatDate(baseView(pair).plannedEnd)}`}
                  style={{ ...span(baseView(pair).plannedStart, baseView(pair).plannedEnd) }} className="absolute top-[22px] h-1.5 rounded-sm bg-slate-400/70" />}
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
                    style={{ left: bar.left, width: bar.width }} className="absolute top-[6px] h-4 overflow-hidden rounded-sm border border-blue-800 bg-blue-500">
                    <div className="h-full bg-blue-800" style={{ width: `${progress}%` }} />
                  </div>}
                {editable && <button type="button" onClick={() => removeRow(task, index)}
                  aria-label={`Excluir a linha ${row}${item.summary ? ` e os ${children} subitens dela` : ''}`} title={item.summary ? 'Excluir linha e subitens' : 'Excluir linha'}
                  className="absolute right-1 top-0.5 rounded px-1.5 text-xs text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600">✕</button>}
              </div>
            </div>;
          })}

          {!frozen && <BlankRow planId={shown.id} month={shown.month} today={today} number={tasks.length + 1} level={tasks.at(-1)?.level ?? 0}
            width={total * px} fixed={grid} locked={locked} onSave={run} busy={busy === 'nova'} />}
        </div>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
      <div className="max-w-4xl space-y-1">
        <p className="text-xs text-slate-400">A grade abre bloqueada: o cadeado libera a edição e volta a bloquear, sem impedir rolar, recolher, comparar ou ler. Na célula, <strong className="font-semibold text-slate-500">F2 edita, Esc devolve o valor anterior, Enter grava e desce</strong>, as setas andam entre linhas e Tab recua a linha (Shift+Tab a devolve), levando os subitens junto.</p>
        <p className="text-xs text-slate-400"><strong className="font-semibold text-slate-500">O item de resumo (em negrito) tem início, término, duração e % vindos dos subitens — por isso essas células não são editáveis</strong>, e a barra dele é o envelope do período. O triângulo recolhe a subárvore; recolher é dobra de leitura e não tira as linhas do cálculo. A barra cinza sob a azul é a linha de base comparada, pareada pelo nome da linha.</p>
        <p className="text-xs text-slate-400">Predecessoras usam o número da linha (a coluna #) com o tipo e a defasagem do Project: <strong className="font-semibold text-slate-500">12</strong>, <strong className="font-semibold text-slate-500">12II+2d</strong>, <strong className="font-semibold text-slate-500">15TT-1d</strong> — <code>d</code> é dia útil, <code>dd</code> é corrido. O <strong className="font-semibold text-rose-600">!</strong> marca a sucessora cujo vínculo está desrespeitado e diz no título o que ele exige: <strong className="font-semibold text-slate-500">as datas não se movem sozinhas — apontar não é reprogramar</strong>.</p>
        <p className="text-xs text-slate-400"><strong className="font-semibold text-slate-500">% alvo é quanto do tempo útil planejado já passou até hoje — leitura de tempo decorrido, não medição física de serviço</strong>; Desvio é o percentual informado menos esse alvo, em pontos percentuais.</p>
      </div>
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

function Cell({ width, children, title, last }: { width: number; children: React.ReactNode; title?: string; last?: boolean }) {
  return <span title={title} style={{ width }} className={`flex shrink-0 items-center ${last ? '' : 'border-r border-slate-100'} px-1`}>{children}</span>;
}

/** Coluna calculada: mostra o valor e nada mais. Sem valor, mostra o travessão — zero inventado
 * numa grade de obra é lido como medição feita, e não foi. */
function ReadCell({ width, label, text, title, tone = '', last }: { width: number; label: string; text: string; title?: string; tone?: string; last?: boolean }) {
  return <span style={{ width }} title={title} className={`flex shrink-0 items-center ${last ? '' : 'border-r border-slate-100'} px-1`}>
    <span aria-label={label} className={`w-full truncate px-1 text-xs tabular-nums ${tone || 'text-slate-500'}`}>{text}</span>
  </span>;
}

interface GridCellProps {
  cells: CellMap;
  step: (taskId: string, column: Column, delta: number) => void;
  taskId: string;
  column: Column;
  /** O valor gravado. É ele que a célula mostra sempre que não está sendo editada. */
  text: string;
  label: string;
  title?: string;
  type?: 'text' | 'number' | 'date';
  editable: boolean;
  className?: string;
  min?: number;
  max?: number;
  onCommit?: (next: string) => Promise<unknown> | undefined;
  /** Tecla que a coluna trata por conta própria — o Tab do nome. Devolve true quando tratou. */
  onSpecialKey?: (event: React.KeyboardEvent<HTMLInputElement>) => boolean;
}

/** A célula no comportamento do sistema consolidado: recebe o foco sem entrar em edição, F2 (ou
 * dois cliques, ou começar a digitar) abre a edição, Esc devolve o valor anterior, Enter grava e
 * desce para a mesma coluna. Fora da edição as setas andam pelas linhas.
 *
 * O que ela mostra é o que está gravado: enquanto o comando vai e volta, o digitado fica na tela;
 * quando ele volta — tendo gravado ou não —, quem manda é o valor do plano. É assim que um valor
 * recusado volta ao que era sem precisar de aviso, e que uma edição aceita não pisca. */
function GridCell({ cells, step, taskId, column, text, label, title, type = 'text', editable, className = '', min, max, onCommit, onSpecialKey }: GridCellProps) {
  const [editing, setEditing] = useState(false);
  const [settled, setSettled] = useState(0);
  const element = useRef<HTMLInputElement | null>(null);
  const seed = useRef<string | undefined>(undefined);
  const sent = useRef<string | null>(null);
  const key = cellKey(taskId, column);

  const attach = useCallback((node: HTMLInputElement | null) => {
    element.current = node;
    if (node) cells.set(key, node); else cells.delete(key);
  }, [cells, key]);

  useEffect(() => {
    const node = element.current;
    if (!node || editing || sent.current !== null || node.value === text) return;
    node.value = text;
  }, [text, editing, settled]);

  // Bloquear a grade no meio de uma edição fecha a célula: o cadeado vale a partir do clique nele.
  useEffect(() => { if (!editable) setEditing(false); }, [editable]);

  useEffect(() => {
    const node = element.current;
    if (!editing || !node) return;
    if (seed.current !== undefined) { node.value = seed.current; seed.current = undefined; }
    node.focus();
    // O cursor vai para o fim do que já está escrito, como o F2 da planilha.
    if (type === 'text') node.setSelectionRange(node.value.length, node.value.length);
  }, [editing, type]);

  const commit = () => {
    const node = element.current;
    if (!node || sent.current === node.value) return;
    if (!editable || node.value === text) { node.value = text; return; }
    const running = onCommit?.(node.value);
    if (!running) { node.value = text; return; }
    sent.current = node.value;
    void running.finally(() => { sent.current = null; setSettled(count => count + 1); });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (onSpecialKey?.(event)) { setEditing(false); return; }
    if (event.key === 'F2') { event.preventDefault(); if (editable) setEditing(true); return; }
    if (event.key === 'Escape') {
      if (!editing) return;
      event.preventDefault();
      if (element.current) element.current.value = text;
      seed.current = undefined;
      setEditing(false);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      setEditing(false);
      step(taskId, column, 1);
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !editing) {
      event.preventDefault();
      step(taskId, column, event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (editing || !editable || event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    // Começar a digitar abre a edição, como na planilha: o primeiro caractere não se perde.
    event.preventDefault();
    seed.current = type === 'date' ? undefined : event.key;
    setEditing(true);
  };

  return <input ref={attach} type={type} min={min} max={max} aria-label={label} title={title ?? (editable ? 'F2 edita, Esc cancela, Enter grava e desce' : undefined)}
    defaultValue={text} readOnly={!editing} aria-readonly={!editing}
    className={`cell ${type === 'text' ? '' : 'tabular-nums'} ${editing ? 'rounded bg-white ring-2 ring-blue-500' : ''} ${editable ? '' : 'text-slate-500'} ${className}`}
    onDoubleClick={() => { if (editable) setEditing(true); }}
    onKeyDown={onKeyDown}
    onBlur={() => { commit(); setEditing(false); }}
    // Fora da edição a célula é só leitura, mas o seletor nativo de data ainda alcança o campo:
    // o valor gravado volta na hora, para a tela não mostrar o que ninguém mandou salvar.
    onChange={() => { const node = element.current; if (!editing && node && sent.current === null) node.value = text; }} />;
}

/** A linha em branco é o modo de criar: escreveu o nome, a linha existe e a barra aparece.
 * A duração nasce de um dia, como no Project, e o início cai no mês do plano. O recuo é o da
 * última linha — quem está detalhando um item segue detalhando — e o campo já aparece recuado. */
function BlankRow({ planId, month, today, number, level, width, fixed, locked, onSave, busy }: {
  planId: string; month: string; today: string; number: number; level: number; width: number; fixed: number; locked: boolean;
  onSave: (command: Command, key: string) => Promise<void>; busy: boolean;
}) {
  const [name, setName] = useState('');
  const start = today.slice(0, 7) === month ? today : `${month}-01`;
  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || locked) return;
    setName('');
    await onSave({ type: 'create_plan_task', planId, name: trimmed, plannedStart: start, plannedEnd: start }, 'nova');
  };
  return <div className="flex border-b border-slate-100 bg-blue-50/30">
    <div style={{ width: fixed, height: ROW }} className="sticky left-0 z-20 flex shrink-0 items-center border-r border-slate-300 bg-blue-50/60 text-xs">
      <span style={{ width: COL.row }} className="shrink-0 border-r border-slate-100 px-2 text-center tabular-nums text-slate-300">{number}</span>
      <span style={{ width: COL.item }} className="shrink-0 border-r border-slate-100 px-2 text-slate-300" aria-hidden="true">{DASH}</span>
      <span style={{ width: COL.name }} className="flex shrink-0 items-center border-r border-slate-100 px-1">
        <input className="cell" style={{ paddingLeft: 4 + level * INDENT }} value={name} disabled={busy || locked}
          placeholder={locked ? 'Destranque a grade para escrever' : busy ? 'Criando…' : 'Escreva a próxima tarefa e tecle Enter'}
          aria-label="Nova linha do plano" onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} onBlur={create} />
      </span>
      <span className="px-2 text-slate-400">começa em {formatDate(start)}, um dia{level > 0 ? `, no recuo do nível ${level + 1}` : ''} — ajuste depois de criar</span>
    </div>
    <div className="shrink-0" style={{ width, height: ROW }} />
  </div>;
}

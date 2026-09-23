'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Lock, LockOpen, Search, Plus, Trash2, IndentIncrease, IndentDecrease, CalendarDays, X, PanelLeft, Table2, ChartGantt, Users } from 'lucide-react';
import { dependencyAnchors, filterPlanRows } from './plan-view';
import type { Command } from '@/application/use-cases/commands';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import type { PlanDependency, PlanTask } from '@/domain/entities';
import { formatLink, linkConflicts, parseLinks, rollUpPlan, targetPercent, type PlanRollUp } from '@/domain/rules';
import { addDays, validatePeriod } from '@/domain/validation';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { CommandForm, TextField, value } from '@/modules/planejamento/forms';
import { Callout, Empty } from '@/modules/planejamento/ui';
import { formatDate, workPath } from '@/shared/format';

const ROW = 36, HEAD = 56, DAY = 86400000;
const PX = { dia: 32, semana: 14, mes: 5 } as const;
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
  const [saved, setSaved] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'incomplete' | 'conflicts'>('all');
  const [presentation, setPresentation] = useState<'split' | 'table' | 'chart'>('table');
  const [completeColumns, setCompleteColumns] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const tableScroll = useRef<HTMLDivElement>(null);
  const chartScroll = useRef<HTMLDivElement>(null);
  const newRow = useRef<HTMLInputElement>(null);
  const syncScroll = (source: HTMLDivElement, other: HTMLDivElement | null) => {
    if (other && Math.abs(other.scrollTop - source.scrollTop) > 1) other.scrollTop = source.scrollTop;
  };
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
  useEffect(() => { setFolded(readFolded(`${context.state === 'ready' ? context.actorId : ''}:${current}`)); setRejected(null); setSelectedId(''); setQuery(''); setFilter('all'); setLocked(true); setSaved(false); }, [current, context.state === 'ready' ? context.actorId : '']);

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
    setBusy(key); setError(''); setSaved(false);
    try { await context.execute(command); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(''); }
  };

  const heading = <div>
    <h2 className="text-base font-bold text-slate-900">Plano do mês</h2>
    <p className="mt-0.5 text-xs text-slate-500">Organize tarefas, datas e recursos. A edição salva por célula; a reprogramação das datas é manual.</p>
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
  const filtering = !!query.trim() || filter !== 'all';
  const visible = filterPlanRows(tasks, { query, filter, folded, conflictTaskIds: new Set([...conflicts.values()].map(c => c.dependency.successorId)) });
  const visibleAt = new Map(visible.map((t, index) => [t.id, index]));
  const predecessorsOf = (id: string) => dependencies.filter(d => d.successorId === id);
  const linkText = (dependency: PlanDependency) => formatLink(numberOf.get(dependency.predecessorId) ?? 0, dependency);

  const px = PX[zoom];
  const grid = completeColumns ? (compare ? FIXED_COMPARE : FIXED) : sum([COL.row, COL.item, COL.name, COL.start, COL.end, COL.team, COL.percent]);
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

  const fold = (ids: Set<string>) => { setFolded(ids); writeFolded(`${context.actorId}:${current}`, ids); };
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
    if (refused.length) throw new Error(refused.join('; '));
    setBusy(`pred-${task.id}`); setError(''); setSaved(false);
    try {
      await context.execute({ type: 'replace_plan_predecessors', taskId: task.id,
        links: [...wanted].map(([predecessorId, link]) => ({ predecessorId, linkType: link.type, lagDays: link.lagDays, lagBusiness: link.lagBusiness })) });
      setSaved(true);
    } finally { setBusy(''); }

  };
  const saveField = async (task: PlanTask, patch: Partial<Pick<PlanTask, 'name' | 'plannedStart' | 'plannedEnd' | 'teamId' | 'progress'>>) => {
    const next = { ...task, ...patch };
    if (next.name === task.name && next.plannedStart === task.plannedStart && next.plannedEnd === task.plannedEnd && next.teamId === task.teamId && next.progress === task.progress) return;
    if (!next.name.trim()) throw new Error('Informe o nome da tarefa.');
    validatePeriod(next.plannedStart, next.plannedEnd);
    if (!Number.isFinite(next.progress) || next.progress < 0 || next.progress > 100) throw new Error('Progresso deve ficar entre 0 e 100.');
    return context.execute({ type: 'update_plan_task', taskId: task.id, name: next.name, plannedStart: next.plannedStart, plannedEnd: next.plannedEnd, teamId: next.teamId ?? null, activityId: task.activityId ?? null, progress: next.progress });
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

  const ticks: { offset: number; days: number; label: string }[] = [];
  const weekends: number[] = [];
  for (let offset = 0; offset < total; offset++) {
    const date = new Date(Date.parse(t0) + offset * DAY);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) weekends.push(offset);
    if (zoom === 'dia' || offset === 0 || weekday === 1) ticks.push({ offset, days: zoom === 'dia' ? 1 : Math.min(weekday === 1 ? 7 : (8 - weekday) % 7 || 7, total - offset), label: zoom === 'dia' ? String(date.getUTCDate()) : `${date.getUTCDate()}/${date.getUTCMonth() + 1}` });
  }
  const active = visible.find(task => task.id === selectedId);
  const activeIndex = active ? indexOf.get(active.id)! : -1;
  const activeIssues = active ? [...conflicts.values()].filter(c => c.dependency.successorId === active.id) : [];
  const focusDate = (date: string) => { if (chartScroll.current) chartScroll.current.scrollLeft = Math.max(0, x(date) - chartScroll.current.clientWidth / 3); };
  const addTask = () => {
    setQuery(''); setFilter('all'); setLocked(false);
    if (presentation === 'chart') setPresentation('split');
    requestAnimationFrame(() => { newRow.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); newRow.current?.focus(); });
  };
  const renderedRows = visible.map(task => {
            const index = indexOf.get(task.id) ?? 0;
            const item = view(task);
            const bar = span(item.plannedStart, item.plannedEnd);
            const pair = pairs.get(nameKey(task.name));
            const saving = busy === task.id || busy === `pred-${task.id}`;
            const row = numberOf.get(task.id) ?? index + 1;
            const progress = Math.min(100, Math.max(0, item.progress));
            const shut = !filtering && folded.has(task.id);
            const children = familyOf(index);
            // O botão já sabe o que o comando recusaria: a primeira linha não tem de quem ser
            // subitem, quem já é subitem da linha de cima não recua de novo, e o nível 0 não volta.
            const noIndent = !editable || filtering || !!busy || index === 0 || task.level > tasks[index - 1].level;
            const noOutdent = !editable || filtering || !!busy || task.level === 0;
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

            return { id: task.id,
              table: <div key={task.id} data-task-row={task.id} onFocus={() => setSelectedId(task.id)} onClick={() => setSelectedId(task.id)} style={{ width: grid, height: ROW }} className={`plan-table-row flex items-center text-xs text-slate-700 ${selectedId === task.id ? 'is-selected' : ''} ${item.summary ? 'is-summary' : ''} ${saving ? 'is-saving' : ''}`}>
                <div className="plan-identity" style={{ width: COL.row + COL.item + COL.name }}>{/* Identificação congelada; as demais colunas têm rolagem própria. */}
                <button type="button" style={{ width: COL.row }} className="h-full shrink-0 border-r border-slate-200 text-center font-medium tabular-nums text-slate-500" aria-label={`Selecionar linha ${row}: ${task.name}`} aria-pressed={selectedId === task.id} onClick={() => setSelectedId(task.id)}>{row}</button>
                <span style={{ width: COL.item }} className={`shrink-0 border-r border-slate-100 px-2 tabular-nums ${item.summary ? 'font-bold text-slate-700' : 'text-slate-500'}`}
                  aria-label={`Item ${item.number}`}>{item.number}</span>
                <Cell width={COL.name} title={task.notes ?? task.name}>
                  {item.summary
                    ? <button type="button" disabled={filtering} onClick={() => toggleFold(task.id)} aria-expanded={!shut} style={{ marginLeft: task.level * INDENT }}
                      aria-label={`${shut ? 'Expandir' : 'Recolher'} os ${children} subitens da linha ${row}`} title={shut ? 'Expandir os subitens' : 'Recolher os subitens'}
                      className="flex h-7 w-5 shrink-0 items-center justify-center rounded text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800">
                      {shut ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                    : <span aria-hidden="true" className="shrink-0" style={{ width: 17 + task.level * INDENT }} />}
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="name" text={task.name} editable={editable}
                    label={`Nome da linha ${row}, item ${item.number}`} className={item.summary ? 'font-bold text-slate-900' : ''}
                    onCommit={next => saveField(task, { name: next })}
                    onSpecialKey={event => {
                      if (event.key !== 'Tab' || !event.altKey) return false;
                      // Tab e Shift+Tab são o recuo de quem vem do Project. Quando o comando não se
                      // aplica, o Tab volta a ser navegação, que é o que o teclado espera dele.
                      if (event.shiftKey ? noOutdent : noIndent) return false;
                      event.preventDefault();
                      void move(task, event.shiftKey ? 'outdent_plan_task' : 'indent_plan_task', event.currentTarget.value);
                      return true;
                    }} />
                  {shut && <span className="shrink-0 px-1 text-[10px] font-semibold text-slate-400" title={`${children} linhas recolhidas`}>+{children}</span>}
                  {issues.length > 0 && <span className="ml-0.5 shrink-0 font-bold text-rose-600" title={issueText} aria-label={issueText}>!</span>}
                </Cell>
                </div>
                {completeColumns && <Cell width={COL.duration}>
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="duration" type="number" min={1} className={calculated}
                    text={String(days(item.plannedStart, item.plannedEnd))} editable={editable && !item.summary}
                    label={item.summary ? `Duração da linha ${row} em dias, somada dos subitens` : `Duração da linha ${row} em dias`}
                    onCommit={next => saveField(task, { plannedEnd: addDays(task.plannedStart, Number(next) - 1) })} />
                </Cell>}
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
                {completeColumns && <Cell width={COL.links}>
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="links" editable={editable}
                    text={links.map(linkText).join(', ')} label={`Predecessoras da linha ${row}, por número de linha`}
                    title="Número da linha (coluna #), com tipo e defasagem: 12, 12II+2d, 15TT-1d"
                    onCommit={next => savePredecessors(task, next, row)} />
                </Cell>}
                <Cell width={COL.team}>
                  <select className="cell" disabled={!editable || !!busy} value={task.teamId ?? ''} aria-label={`Recurso da linha ${row}`}
                    ref={node => { const key = cellKey(task.id, 'team'); if (node) cells.current.set(key, node); else cells.current.delete(key); }}
                    onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); step(task.id, 'team', 1); } }}
                    onChange={e => { void saveField(task, { teamId: e.target.value || undefined }).catch(cause => setError(cause.message)); }}>
                    <option value="">Sem recurso</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.company} · {t.name}</option>)}
                  </select>
                </Cell>
                <Cell width={COL.percent}>
                  <GridCell cells={cells.current} step={step} taskId={task.id} column="percent" type="number" min={0} max={100} className={calculated}
                    text={String(Math.round(item.progress))} editable={editable && !item.summary}
                    label={item.summary ? `Percentual da linha ${row}, média dos subitens` : `Percentual da linha ${row}`}
                    onCommit={next => saveField(task, { progress: Number(next) })} />
                </Cell>
                {completeColumns && <>
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
                </>}
              </div>,
              timeline: <div key={task.id} style={{ width: total * px, height: ROW }} className={`plan-chart-row relative border-b border-slate-100 ${selectedId === task.id ? 'bg-blue-50' : item.summary ? 'bg-slate-50/80' : ''}`}>
                {pair && <div title={`Linha de base: ${formatDate(baseView(pair).plannedStart)} a ${formatDate(baseView(pair).plannedEnd)}`}
                  style={{ ...span(baseView(pair).plannedStart, baseView(pair).plannedEnd) }} className="absolute top-[29px] h-1.5 rounded-sm bg-slate-400/70" />}
                {item.summary
                  // O item de resumo desenha o envelope dos subitens: traço fino e escuro com as
                  // pontas marcadas, como a barra de resumo do Project — não é período próprio.
                  ? <>
                    <div title={`${task.name} · envelope dos ${item.leaves} subitens · ${formatDate(item.plannedStart)} a ${formatDate(item.plannedEnd)} · ${Math.round(item.progress)}%`}
                      style={{ left: bar.left, width: bar.width }} className="absolute top-[15px] h-1.5 overflow-hidden bg-slate-300">
                      <div className="h-full bg-slate-800" style={{ width: `${progress}%` }} />
                    </div>
                    <div aria-hidden="true" style={{ left: bar.left }} className="absolute top-[14px] h-2 w-2 rotate-45 bg-slate-800" />
                    <div aria-hidden="true" style={{ left: bar.left + bar.width - 8 }} className="absolute top-[14px] h-2 w-2 rotate-45 bg-slate-800" />
                  </>
                  : <button type="button" onClick={() => setSelectedId(task.id)} aria-label={`Selecionar ${task.name}`} aria-pressed={selectedId === task.id} title={`${task.name} · ${formatDate(item.plannedStart)} a ${formatDate(item.plannedEnd)} · ${Math.round(item.progress)}%`}
                    style={{ left: bar.left, width: bar.width }} className="absolute top-[9px] z-10 h-4 overflow-hidden rounded border border-blue-800 bg-blue-500 focus-visible:outline-blue-700">
                    <div className="h-full bg-blue-800" style={{ width: `${progress}%` }} />
                  </button>}

              </div>,
            };
  });
  return <section data-tour="medio-gantt" className="panel plan-workspace my-5 min-w-0 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-4 py-4">
      {heading}
      <div className="flex items-center gap-3">
        <span role="status" className={`text-xs font-medium ${busy ? 'text-blue-700' : error ? 'text-rose-700' : 'text-slate-500'}`}>{busy ? 'Salvando…' : error ? 'Alteração não salva' : saved ? 'Alterações salvas' : frozen ? 'Somente leitura' : locked ? 'Modo de consulta' : 'Salvamento por célula'}</span>
        <button type="button" disabled={frozen || !!busy} onClick={() => setLocked(!locked)} aria-pressed={!locked && !frozen} title={frozen ? 'Este plano permite apenas consulta' : lockLabel}
          className={editable ? 'button-ghost border-blue-200 bg-blue-50 text-blue-800' : 'button-ghost'}>
          {editable ? <LockOpen size={15} aria-hidden /> : <Lock size={15} aria-hidden />}{frozen ? 'Somente leitura' : locked ? 'Habilitar edição' : 'Concluir edição'}
        </button>
      </div>
    </div>
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
      <label className="min-w-44 flex-1 text-xs font-semibold text-slate-600">Plano em trabalho
        <select className="field mt-1 min-h-10" disabled={!!busy} value={plan.id} onChange={e => { setPlanId(e.target.value); setBaselineId(''); setOpenBaseline(false); }}>
          {live.map(p => <option key={p.id} value={p.id}>{p.name} · {p.month}</option>)}
        </select>
      </label>
      <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">Comparar com linha de base
        <select className="field mt-1 min-h-10" disabled={!!busy || !baselines.length} value={baselineId} onChange={e => { setBaselineId(e.target.value); setOpenBaseline(false); }}>
          <option value="">{baselines.length ? 'Sem comparação' : 'Nenhuma linha de base salva'}</option>
          {baselines.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      {baseline && <button type="button" disabled={!!busy} className="button-ghost min-h-10" onClick={() => { setOpenBaseline(!openBaseline); setSelectedId(''); }}>{openBaseline ? 'Voltar ao plano' : 'Consultar base'}</button>}
      <Link className="button-ghost min-h-10" href={workPath(workId, 'configuracoes')}><Users size={15} aria-hidden />Recursos da obra</Link>
    </div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-600">
      <span><strong className="text-slate-900">{tasks.length}</strong> tarefas · {summaries.length} resumos</span>
      <span>Avanço informado <strong className="text-slate-900">{average}%</strong></span>
      <button type="button" className={`min-h-8 rounded-md px-2 font-semibold ${conflicts.size ? 'bg-rose-50 text-rose-700' : 'text-slate-500'}`} onClick={() => setFilter(filter === 'conflicts' ? 'all' : 'conflicts')} aria-pressed={filter === 'conflicts'}>{conflicts.size} vínculos com conflito</button>
      {compare && <span className={slipped ? 'text-amber-800' : ''}>{slipped} tarefas com término após a base</span>}
      <span className="ml-auto tabular-nums">Referência: {formatDate(today)}</span>
    </div>
    {shown.frozenAt && <div className="border-b border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900">Consultando <strong>{shown.name}</strong>, congelada em {formatDate(shown.frozenAt.slice(0, 10))}. Esta cópia não aceita edição.</div>}
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
      <label className="relative min-w-44 flex-1"><Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-3 text-slate-400" /><span className="sr-only">Buscar tarefas</span><input type="search" className="field min-h-10 pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar tarefa…" /></label>
      <label><span className="sr-only">Filtrar tarefas</span><select className="field min-h-10" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}><option value="all">Todas as tarefas</option><option value="incomplete">Não concluídas</option><option value="conflicts">Com conflitos de vínculo</option></select></label>
      {!frozen && <button type="button" className="button min-h-10" disabled={!!busy} onClick={addTask}><Plus size={15} aria-hidden />Nova tarefa</button>}
      <div className="flex rounded-lg border border-slate-200 p-0.5" aria-label="Apresentação do plano">
        {([{ id: 'split', label: 'Tabela e cronograma', Icon: PanelLeft }, { id: 'table', label: 'Somente tabela', Icon: Table2 }, { id: 'chart', label: 'Somente cronograma', Icon: ChartGantt }] as const).map(mode => <button key={mode.id} type="button" className={`flex h-9 w-10 items-center justify-center rounded-md ${presentation === mode.id ? 'bg-blue-100 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`} aria-label={mode.label} title={mode.label} aria-pressed={presentation === mode.id} onClick={() => setPresentation(mode.id)}><mode.Icon size={17} aria-hidden /></button>)}
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/60 px-3 py-2">
      <label className="flex items-center gap-2 text-xs text-slate-600">Colunas<select className="field w-auto py-1.5 text-xs" value={completeColumns ? 'complete' : 'essential'} onChange={e => setCompleteColumns(e.target.value === 'complete')}><option value="essential">Essenciais</option><option value="complete">Completas</option></select></label>
      <button type="button" className="plan-tool" disabled={!summaries.length || filtering} onClick={() => fold(new Set(summaries.map(t => t.id)))} title="Recolher resumos" aria-label="Recolher todos os itens de resumo"><ChevronsDownUp size={15} aria-hidden /></button>
      <button type="button" className="plan-tool" disabled={!summaries.length || filtering} onClick={() => fold(new Set())} title="Expandir resumos" aria-label="Expandir todos os itens de resumo"><ChevronsUpDown size={15} aria-hidden /></button>
      <span className="mx-1 h-5 border-l border-slate-200" aria-hidden />
      <button type="button" className="plan-tool" disabled={!active || !editable || !!busy || active.level === 0 || filtering} onClick={() => active && move(active, 'outdent_plan_task')} title="Diminuir recuo da tarefa selecionada" aria-label="Diminuir recuo da tarefa selecionada"><IndentDecrease size={16} aria-hidden /></button>
      <button type="button" className="plan-tool" disabled={!active || !editable || !!busy || filtering || activeIndex <= 0 || active.level > tasks[activeIndex - 1].level} onClick={() => active && move(active, 'indent_plan_task')} title="Recuar tarefa selecionada como subitem" aria-label="Recuar tarefa selecionada como subitem"><IndentIncrease size={16} aria-hidden /></button>
      <button type="button" className="plan-tool text-rose-600" disabled={!active || !editable || !!busy} onClick={() => active && removeRow(active, activeIndex)} title="Excluir tarefa selecionada" aria-label="Excluir tarefa selecionada"><Trash2 size={15} aria-hidden /></button>
      <div className="ml-auto flex items-center gap-2">
        <button type="button" className="plan-tool gap-1 px-2" disabled={presentation === 'table' || today < t0 || today > t1} onClick={() => focusDate(today)}><CalendarDays size={14} aria-hidden />Hoje</button>
        <label className="flex items-center gap-2 text-xs text-slate-600">Escala<select className="field w-auto py-1.5 text-xs" value={zoom} onChange={event => setZoom(event.target.value as keyof typeof PX)}><option value="dia">Dias</option><option value="semana">Semanas</option><option value="mes">Meses</option></select></label>
      </div>
    </div>
    {filtering && <div className="flex items-center justify-between gap-2 bg-blue-50 px-4 py-2 text-xs text-blue-800" role="status"><span>{visible.length} de {tasks.length} linhas, incluindo os resumos. Grupos expandidos durante a busca; numeração preservada.</span><button type="button" className="flex min-h-8 shrink-0 items-center gap-1 font-semibold" onClick={() => { setQuery(''); setFilter('all'); }}><X size={14} aria-hidden />Limpar</button></div>}

    {error && <div className="px-5 pt-4"><Callout tone="danger" role="alert">{error}</Callout></div>}
    {rejected && <div className="px-5 pt-4"><Callout tone="warning" role="status">
      Predecessoras da linha {rejected.row}: {rejected.pieces.join('; ')}. Nenhum vínculo foi alterado. Escreva o número da linha, com o tipo e a defasagem quando precisar — <strong>12</strong>, <strong>12II+2d</strong>, <strong>15TT-1d</strong>.{' '}
      <button type="button" className="font-semibold underline" onClick={() => setRejected(null)}>Dispensar</button>
    </Callout></div>}

    <div className={`plan-panes plan-panes-${presentation}`}>
      <div className={presentation === 'chart' ? 'hidden' : 'min-w-0'}>
        <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-600"><span>TAREFAS · {visible.length} de {tasks.length}</span><span>Role para ver as colunas →</span></div>
        <div ref={tableScroll} onScroll={event => syncScroll(event.currentTarget, chartScroll.current)} className="plan-scroll" role="region" aria-label="Tabela de tarefas do plano" tabIndex={0}>
          <div style={{ width: grid, minHeight: 180 }}>
            <div style={{ height: HEAD }} className="plan-table-header sticky top-0 z-30 flex items-center border-b border-slate-300 bg-slate-100 text-[11px] font-semibold text-slate-600">
            <div className="plan-identity h-full" style={{ width: COL.row + COL.item + COL.name }}>            <span style={{ width: COL.row }} className="shrink-0 border-r border-slate-200 px-2 text-center">#</span>
            <span style={{ width: COL.item }} className="shrink-0 border-r border-slate-200 px-2">Item</span>
            <span style={{ width: COL.name }} className="shrink-0 border-r border-slate-200 px-2">Nome da tarefa</span></div>
            {completeColumns && <span style={{ width: COL.duration }} className="shrink-0 border-r border-slate-200 px-2">Dur.</span>}
            <span style={{ width: COL.start }} className="shrink-0 border-r border-slate-200 px-2">Início</span>
            <span style={{ width: COL.end }} className="shrink-0 border-r border-slate-200 px-2">Término</span>
            {completeColumns && <span style={{ width: COL.links }} className="shrink-0 border-r border-slate-200 px-2" title="Número da linha, com tipo e defasagem: 12, 12II+2d, 15TT-1d">Predec.</span>}
            <span style={{ width: COL.team }} className="shrink-0 border-r border-slate-200 px-2">Empreiteiro / equipe</span>
            <span style={{ width: COL.percent }} className="shrink-0 border-r border-slate-200 px-2">%</span>
            {completeColumns && <>
            <span style={{ width: COL.target }} className="shrink-0 border-r border-slate-200 px-2" title="Quanto do tempo útil planejado já passou até hoje. É leitura de tempo decorrido, não medição física.">% alvo</span>
            <span style={{ width: COL.gap }} className={`shrink-0 px-2 ${compare ? 'border-r border-slate-200' : ''}`} title="Percentual informado menos o alvo, em pontos percentuais.">Desvio</span>
            {compare && <>
              <span style={{ width: COL.baseEnd }} className="shrink-0 border-r border-slate-200 px-2">Térm. base</span>
              <span style={{ width: COL.variance }} className="shrink-0 px-2" title="Dias entre o término da linha de base e o término planejado agora.">Variação</span>
            </>}
            </>}
            </div>
            {renderedRows.map(row => row.table)}
            {!visible.length && <div className="flex h-24 items-center px-5 text-sm text-slate-500">{tasks.length ? 'Nenhuma tarefa corresponde aos filtros.' : 'O plano está pronto para receber a primeira tarefa.'}</div>}
            {!frozen && !filtering && <BlankRow inputRef={newRow} planId={shown.id} month={shown.month} today={today} number={tasks.length + 1} level={tasks.at(-1)?.level ?? 0}
              fixed={grid} locked={locked} onSave={run} busy={!!busy} />}
          </div>
        </div>
      </div>
      <div className={presentation === 'table' ? 'hidden' : 'min-w-0 border-slate-300 lg:border-l'}>
        <div className="flex h-9 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 text-[11px] font-semibold text-slate-600"><span>CRONOGRAMA</span><span>{formatDate(t0)} — {formatDate(t1)}</span></div>
        <div ref={chartScroll} onScroll={event => syncScroll(event.currentTarget, tableScroll.current)} className="plan-scroll" role="region" aria-label="Cronograma de tarefas do plano" tabIndex={0}>
          <div style={{ width: total * px, minWidth: '100%', minHeight: 180 }}>
            <div className="sticky top-0 z-30 bg-slate-100" style={{ height: HEAD }}>
              {months.map(month => <div key={`${month.label}-${month.from}`} style={{ left: month.from * px, width: month.span * px }} className="absolute top-0 flex h-7 items-center overflow-hidden whitespace-nowrap border-r border-slate-300 px-2 text-[11px] font-bold text-slate-600">{month.label}</div>)}
              {ticks.map(tick => <div key={tick.offset} style={{ left: tick.offset * px, width: tick.days * px }} className="absolute bottom-0 flex h-7 items-center overflow-hidden border-r border-t border-slate-200 px-1 text-[10px] tabular-nums text-slate-500">{tick.label}</div>)}
            </div>
            <div className="relative">
              <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">{zoom !== 'mes' && weekends.map(offset => <div key={offset} className="absolute inset-y-0 bg-slate-200/35" style={{ left: offset * px, width: px }} />)}{ticks.map(tick => <div key={tick.offset} className="absolute inset-y-0 border-l border-slate-200/70" style={{ left: tick.offset * px }} />)}</div>
              {today >= t0 && today <= t1 && <div className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-dashed border-amber-500" style={{ left: x(today) }} aria-hidden="true"><span className="absolute left-1 top-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">Hoje</span></div>}
              <svg className="pointer-events-none absolute z-[5]" style={{ left: 0, top: 0, width: total * px, height: visible.length * ROW }} aria-hidden="true">
            {dependencies.flatMap(dependency => {
              const from = visibleAt.get(dependency.predecessorId), to = visibleAt.get(dependency.successorId);
              // Vínculo com uma ponta recolhida não tem onde ser desenhado — ele continua valendo
              // no cálculo, só não vira seta.
              if (from === undefined || to === undefined) return [];
              const fromView = view(byId.get(dependency.predecessorId)!), toView = view(byId.get(dependency.successorId)!);
              const fromBar = span(fromView.plannedStart, fromView.plannedEnd);
              const toBar = span(toView.plannedStart, toView.plannedEnd);
              const y1 = from * ROW + ROW / 2, y2 = to * ROW + ROW / 2;
              const ends = dependencyAnchors(dependency.type);
              const x1 = fromBar.left + (ends.from === 'end' ? fromBar.width : 0), x2 = toBar.left + (ends.to === 'end' ? toBar.width : 0);
              const offset = ends.from === 'end' ? 8 : -8;
              const mid = ends.from === ends.to ? (ends.from === 'end' ? Math.max(x1, x2) + 8 : Math.min(x1, x2) - 8) : x1 + offset;
              return [<polyline key={dependency.id} points={`${x1},${y1} ${mid},${y1} ${mid},${y2} ${x2},${y2}`} fill="none"
                stroke={conflicts.has(dependency.id) ? '#be123c' : '#94a3b8'} strokeWidth={1.5} />];
            })}
              </svg>
              {renderedRows.map(row => row.timeline)}
              {!visible.length && <div className="h-24" />}
              {!frozen && !filtering && <div style={{ height: ROW }} className="border-b border-slate-100 bg-blue-50/30" />}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="border-t border-slate-200 bg-slate-50 px-4 py-3" aria-label="Detalhes da tarefa selecionada">
      {active ? <>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-800"><span className="mr-2 text-xs text-slate-500">#{numberOf.get(active.id)} · {view(active).number}</span>{active.name}</p><button type="button" className="text-link min-h-8 text-xs" disabled={presentation === 'table'} onClick={() => focusDate(view(active).plannedStart)}>Localizar no cronograma</button></div>
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs leading-5 text-slate-600"><span>{formatDate(view(active).plannedStart)} a {formatDate(view(active).plannedEnd)} · {days(view(active).plannedStart, view(active).plannedEnd)} dias corridos</span><span>{Math.round(view(active).progress)}% informado{view(active).summary ? ' · resumo dos subitens' : ''}</span><span>{teams.find(team => team.id === active.teamId) ? `${teams.find(team => team.id === active.teamId)!.company} · ${teams.find(team => team.id === active.teamId)!.name}` : 'Sem recurso alocado'}</span><span>Predecessoras: {predecessorsOf(active.id).map(linkText).join(', ') || DASH}</span></div>
        {activeIssues.length > 0 && <ul className="mt-2 space-y-1 text-xs leading-5 text-rose-700">{activeIssues.map(issue => <li key={issue.dependency.id}>{issue.edge === 'start' ? 'Início' : 'Término'} em {formatDate(issue.actual)}; o vínculo {linkText(issue.dependency)} exige {formatDate(issue.earliest)} ou depois.</li>)}</ul>}
      </> : <p className="text-xs text-slate-500">Selecione uma tarefa na tabela ou na barra para consultar os detalhes e usar as ações de recuo e exclusão.</p>}
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-5 rounded-sm bg-blue-500" aria-hidden />Planejado</span><span className="inline-flex items-center gap-1.5"><i className="h-2 w-5 rounded-sm bg-blue-800" aria-hidden />Avanço informado</span><span className="inline-flex items-center gap-1.5"><i className="h-1 w-5 bg-slate-800" aria-hidden />Resumo</span>{compare && <span className="inline-flex items-center gap-1.5"><i className="h-1 w-5 bg-slate-400" aria-hidden />Linha de base</span>}<span className="ml-auto">F2 edita · Enter salva e desce · Esc cancela</span></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
      <details className="min-w-0 flex-1"><summary className="min-h-9 cursor-pointer text-xs font-semibold text-slate-600">Como editar e interpretar o plano</summary><div className="max-w-4xl space-y-2 pb-2">
        <p className="text-xs text-slate-400">A grade abre bloqueada: o cadeado libera a edição e volta a bloquear, sem impedir rolar, recolher, comparar ou ler. Na célula, <strong className="font-semibold text-slate-500">F2 edita, Esc devolve o valor anterior, Enter grava e desce</strong>, as setas andam entre linhas e Tab recua a linha (Shift+Tab a devolve), levando os subitens junto.</p>
        <p className="text-xs text-slate-400"><strong className="font-semibold text-slate-500">O item de resumo (em negrito) tem início, término, duração e % vindos dos subitens — por isso essas células não são editáveis</strong>, e a barra dele é o envelope do período. O triângulo recolhe a subárvore; recolher é dobra de leitura e não tira as linhas do cálculo. A barra cinza sob a azul é a linha de base comparada, pareada pelo nome da linha.</p>
        <p className="text-xs text-slate-400">Predecessoras usam o número da linha (a coluna #) com o tipo e a defasagem do Project: <strong className="font-semibold text-slate-500">12</strong>, <strong className="font-semibold text-slate-500">12II+2d</strong>, <strong className="font-semibold text-slate-500">15TT-1d</strong> — <code>d</code> é dia útil, <code>dd</code> é corrido. O <strong className="font-semibold text-rose-600">!</strong> marca a sucessora cujo vínculo está desrespeitado e diz no título o que ele exige: <strong className="font-semibold text-slate-500">as datas não se movem sozinhas — apontar não é reprogramar</strong>.</p>
        <p className="text-xs text-slate-400"><strong className="font-semibold text-slate-500">% alvo é quanto do tempo útil planejado já passou até hoje — leitura de tempo decorrido, não medição física de serviço</strong>; Desvio é o percentual informado menos esse alvo, em pontos percentuais.</p>
      </div></details>
      <details className="min-w-0"><summary className="min-h-9 cursor-pointer text-xs font-semibold text-slate-600">Opções do plano e linhas de base</summary><div className="flex flex-wrap gap-2 pb-2">
        {!shown.frozenAt && !readOnly && <>
          <CommandForm title="Definir linha de base" submit="Congelar plano" command={d => ({ type: 'freeze_plan_baseline', planId: plan.id, name: value(d, 'name') })}>
            <TextField name="name" label="Nome da linha de base" />
          </CommandForm>
          <CommandForm title="Excluir plano" submit="Excluir" command={() => ({ type: 'delete_plan', planId: plan.id })} onDone={() => setPlanId('')}>
            <p className="text-sm text-slate-600">Exclui o plano de {plan.month} e todas as suas linhas. Linhas de base salvas impedem a exclusão.</p>
          </CommandForm>
        </>}
        <div className="max-w-xs">{newPlan}</div>
      </div></details>
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
  const [cellError, setCellError] = useState('');
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

  const commit = async (): Promise<boolean> => {
    const node = element.current;
    if (!node || sent.current !== null) return false;
    if (!editable || node.value === text) { setEditing(false); return true; }
    const raw = node.value;
    try {
      if (type !== 'text' && (!raw || !node.checkValidity())) throw new Error('Informe um valor válido dentro dos limites do campo.');
      sent.current = raw;
      await onCommit?.(raw);
      setCellError(''); setEditing(false);
      return true;
    } catch (cause) {
      setCellError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
      setEditing(true);
      node.value = raw;
      node.focus();
      return false;
    } finally { sent.current = null; setSettled(count => count + 1); }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (onSpecialKey?.(event)) { setEditing(false); return; }
    if (event.key === 'F2') { event.preventDefault(); if (editable) setEditing(true); return; }
    if (event.key === 'Escape') {
      if (!editing) return;
      event.preventDefault();
      if (element.current) element.current.value = text;
      seed.current = undefined;
      setCellError('');
      setEditing(false);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!editing) { if (editable) setEditing(true); return; }
      void commit().then(ok => { if (ok) step(taskId, column, 1); });
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

  return <input ref={attach} aria-invalid={!!cellError} type={type} min={min} max={max} aria-label={label} title={cellError || title || text || (editable ? 'F2 ou Enter edita, Esc cancela, Enter grava e desce' : undefined)}
    defaultValue={text} readOnly={!editing} aria-readonly={!editing}
    className={`cell ${type === 'text' ? '' : 'tabular-nums'} ${editing ? 'rounded bg-white ring-2 ring-blue-500' : ''} ${editable ? '' : 'text-slate-500'} ${className}`}
    onDoubleClick={() => { if (editable) setEditing(true); }}
    onKeyDown={onKeyDown}
    onBlur={() => { if (editing) void commit(); }}
    // Fora da edição a célula é só leitura, mas o seletor nativo de data ainda alcança o campo:
    // o valor gravado volta na hora, para a tela não mostrar o que ninguém mandou salvar.
    onChange={() => { const node = element.current; if (!editing && node && sent.current === null) node.value = text; }} />;
}

/** A linha em branco é o modo de criar: escreveu o nome, a linha existe e a barra aparece.
 * A duração nasce de um dia, como no Project, e o início cai no mês do plano. O recuo é o da
 * última linha — quem está detalhando um item segue detalhando — e o campo já aparece recuado. */
function BlankRow({ planId, month, today, number, level, fixed, locked, onSave, busy, inputRef }: {
  planId: string; month: string; today: string; number: number; level: number; fixed: number; locked: boolean; inputRef: React.RefObject<HTMLInputElement | null>;
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
    <div style={{ width: fixed, height: ROW }} className="flex shrink-0 items-center border-r border-slate-300 bg-blue-50/60 text-xs">
      <span style={{ width: COL.row }} className="shrink-0 border-r border-slate-100 px-2 text-center tabular-nums text-slate-300">{number}</span>
      <span style={{ width: COL.item }} className="shrink-0 border-r border-slate-100 px-2 text-slate-300" aria-hidden="true">{DASH}</span>
      <span style={{ width: COL.name }} className="flex shrink-0 items-center border-r border-slate-100 px-1">
        <input ref={inputRef} className="cell" style={{ paddingLeft: 4 + level * INDENT }} value={name} disabled={busy || locked}
          placeholder={locked ? 'Destranque a grade para escrever' : busy ? 'Criando…' : 'Escreva a próxima tarefa e tecle Enter'}
          aria-label="Nova linha do plano" onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create(); } }} onBlur={create} />
      </span>
      <span className="px-2 text-slate-400">começa em {formatDate(start)}, um dia{level > 0 ? `, no recuo do nível ${level + 1}` : ''} — ajuste depois de criar</span>
    </div>
  </div>;
}

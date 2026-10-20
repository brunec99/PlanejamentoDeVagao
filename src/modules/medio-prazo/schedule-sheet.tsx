'use client';
import { encodeGrid, decodeGrid } from './clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  ChartGantt,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Download,
  Flag,
  IndentDecrease,
  IndentIncrease,
  Link2,
  Link2Off,
  ListPlus,
  Lock,
  LockOpen,
  PanelLeft,
  Redo2,
  StickyNote,
  Table2,
  Trash2,
  TriangleAlert,
  Undo2,
  Unlink2,
} from 'lucide-react';
import {
  CONSTRAINT_TYPES,
  type ConstraintType,
  type MediumTermPlan,
  type PlanTask,
  type PlanDependency,
  type PlanningData,
  type User,
} from '@/domain/entities';
import {
  CONSTRAINT_ABBREVIATIONS,
  CONSTRAINT_LABELS,
  DEFAULT_CALENDAR,
  analyzeSchedule,
  constraintFlexibility,
  constraintNeedsDate,
  constraintOf,
  countedDays,
  endFor,
  formatDuration,
  parseDuration,
  planSnapshot,
  planWindow,
  scheduleTasks,
  temporalTarget,
  withActualEnd,
  withActualStart,
  withProgress,
  type ScheduleAnalysis,
  type TaskDuration,
  type TaskSchedule,
  type WorkCalendar,
} from '@/domain/plan-schedule';
import { buildMspdi } from '@/domain/mspdi';
import { parseLinks, formatLink, rollUpPlan } from '@/domain/rules';
import { validateDate } from '@/domain/validation';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { CommandForm, Field, TextField, value } from '@/modules/planejamento/forms';
import { useHistory } from '@/modules/planejamento/history';
import { useConfirm } from '@/modules/layout/confirm';
import { useToast } from '@/modules/layout/toast';
import { HelpNote } from '@/modules/layout/help-note';
import { formatDate } from '@/shared/format';
import { GanttChart, type GanttLink, type GanttRow, type GanttZoom } from './gantt-chart';

/* Cronograma do mês no layout do MS Project: tabela à esquerda, Gantt de acompanhamento à direita,
 * as duas com a mesma linha e a mesma rolagem vertical. As datas são agendadas automaticamente pela
 * rede (scheduleTasks) a cada edição do rascunho, e o servidor refaz o cálculo ao gravar. */

type Draft = { tasks: PlanTask[]; links: PlanDependency[]; calendar: WorkCalendar };
type Col =
  | 'id'
  | 'ind'
  | 'progress'
  | 'name'
  | 'duration'
  | 'actualStart'
  | 'actualEnd'
  | 'start'
  | 'end'
  | 'lateStart'
  | 'lateFinish'
  | 'totalSlack'
  | 'freeSlack'
  | 'critical'
  | 'baseStart'
  | 'baseEnd'
  | 'links'
  | 'team'
  | 'constraintType'
  | 'constraintDate'
  | 'deadline'
  | 'notes'
  | 'elapsed'
  | 'target'
  | 'gap'
  | 'variance';
type Presentation = 'split' | 'table' | 'chart';
const columns: { key: Col; label: string; width: number; editable?: boolean; right?: boolean }[] = [
  { key: 'id', label: 'Id', width: 40, right: true },
  { key: 'ind', label: 'Indicadores', width: 58 },
  { key: 'progress', label: '% concluída', width: 78, editable: true, right: true },
  { key: 'name', label: 'Nome da tarefa', width: 300, editable: true },
  { key: 'duration', label: 'Duração', width: 112, editable: true },
  { key: 'actualStart', label: 'Início real', width: 104, editable: true },
  { key: 'actualEnd', label: 'Término real', width: 104, editable: true },
  { key: 'start', label: 'Início', width: 104, editable: true },
  { key: 'end', label: 'Término', width: 104, editable: true },
  { key: 'lateStart', label: 'Início tardio', width: 104 },
  { key: 'lateFinish', label: 'Término tardio', width: 104 },
  { key: 'totalSlack', label: 'Folga total', width: 84, right: true },
  { key: 'freeSlack', label: 'Folga livre', width: 84, right: true },
  { key: 'critical', label: 'Crítica', width: 64 },
  { key: 'baseStart', label: 'Início da linha de base', width: 104 },
  { key: 'baseEnd', label: 'Término da linha de base', width: 104 },
  { key: 'links', label: 'Predecessoras', width: 120, editable: true },
  { key: 'team', label: 'Nomes dos recursos', width: 170, editable: true },
  { key: 'constraintType', label: 'Tipo de restrição', width: 150, editable: true },
  { key: 'constraintDate', label: 'Data da restrição', width: 104, editable: true },
  { key: 'deadline', label: 'Prazo final', width: 104, editable: true },
  { key: 'notes', label: 'Anotações', width: 220, editable: true },
  { key: 'elapsed', label: 'Decorrido / total', width: 110 },
  { key: 'target', label: '% alvo', width: 70, right: true },
  { key: 'gap', label: 'Desvio (pp)', width: 84, right: true },
  { key: 'variance', label: 'Variação (dias)', width: 90, right: true },
];
// As colunas do motor (tardias, folgas, crítica) e as de restrição ficam ocultas por padrão: a tabela
// padrão é a do Gantt de acompanhamento do Project; o seletor "Colunas" mostra as demais.
const DEFAULT_HIDDEN: Col[] = [
  'lateStart',
  'lateFinish',
  'totalSlack',
  'freeSlack',
  'critical',
  'constraintType',
  'constraintDate',
  'deadline',
  'notes',
  'elapsed',
  'target',
  'gap',
  'variance',
];
const LEAF_ONLY: Col[] = [
  'duration',
  'start',
  'end',
  'progress',
  'links',
  'actualStart',
  'actualEnd',
  'constraintType',
  'constraintDate',
  'deadline',
];
/** Colunas editadas num `<select>`, não num `<input>`: a tecla digitada não vira semente. */
const SELECT_COLS: Col[] = ['team', 'constraintType'];
const DATE_COLS: Col[] = ['actualStart', 'actualEnd', 'constraintDate', 'deadline'];
type Column = (typeof columns)[number];
const COLUMN = Object.fromEntries(columns.map(c => [c.key, c])) as Record<Col, Column>;
/** Ordem padrão das colunas. Id e Indicadores ficam presas no começo, como a coluna de identificação
 * do Project; as demais, inclusive o nome, vão para onde a pessoa arrastar o cabeçalho. */
const DEFAULT_ORDER: Col[] = columns.map(c => c.key);
export const FIXED_COLS: Col[] = ['id', 'ind'];
/** Ordem lida das preferências: chaves desconhecidas caem, repetidas valem uma vez, as presas voltam
 * ao começo e as que faltam entram no fim, na ordem padrão. */
export function normalizeOrder(raw: unknown): Col[] {
  const seen = new Set<Col>(FIXED_COLS);
  const kept: Col[] = [];
  for (const k of Array.isArray(raw) ? raw : [])
    if (typeof k === 'string' && k in COLUMN && !seen.has(k as Col)) {
      seen.add(k as Col);
      kept.push(k as Col);
    }
  return [...FIXED_COLS, ...kept, ...DEFAULT_ORDER.filter(k => !seen.has(k))];
}
/** Move `key` para antes de `target` (ou depois, com `after`). Coluna presa não se move; soltar sobre
 * uma presa põe a coluna arrastada logo depois delas. Sem mudança, devolve o mesmo array. */
export function moveColumn(order: Col[], key: Col, target: Col, after: boolean): Col[] {
  if (key === target || FIXED_COLS.includes(key) || !order.includes(key) || !order.includes(target)) return order;
  const rest = order.filter(k => k !== key);
  const at = FIXED_COLS.includes(target) ? rest.filter(k => FIXED_COLS.includes(k)).length : rest.indexOf(target) + (after ? 1 : 0);
  const next = [...rest.slice(0, at), key, ...rest.slice(at)];
  return next.every((k, i) => k === order[i]) ? order : next;
}
/** Um resumo não carrega data real, restrição (nova ou antiga) nem prazo final; os vínculos saem fora daqui. */
function asSummary(t: PlanTask): PlanTask {
  const summary = { ...t };
  for (const k of ['actualStart', 'actualEnd', 'deadline', 'anchorStart', 'constraintType', 'constraintDate'] as const) delete summary[k];
  return summary;
}
/** Recua (`delta` 1) ou diminui o recuo (`-1`) do bloco que começa na linha `from` e vai até o fim da
 * subárvore da linha `to` (índices em `tasks`): as subtarefas, visíveis ou recolhidas, acompanham e a
 * estrutura relativa se mantém. Recuar exige que a primeira linha possa virar subitem da de cima;
 * diminuir o recuo, que nenhuma linha do bloco esteja no nível 0. Quem vira resumo (a linha de cima,
 * ao recuar; a última do bloco, ao diminuir o recuo com uma irmã logo abaixo) perde vínculos, datas
 * reais, restrição e prazo, como na linha única. Não reagenda: quem chama faz isso. Com erro, devolve
 * a frase e as entradas intactas. */
export function shiftLevels(
  tasks: PlanTask[],
  from: number,
  to: number,
  delta: 1 | -1,
  links: PlanDependency[] = [],
): { tasks: PlanTask[]; links: PlanDependency[]; error?: string } {
  if (from < 0 || to < from || to >= tasks.length) return { tasks, links, error: 'Selecione as linhas para recuar.' };
  let end = to + 1;
  while (end < tasks.length && tasks[end].level > tasks[to].level) end++;
  if (delta === 1 && (from === 0 || tasks[from].level > tasks[from - 1].level))
    return { tasks, links, error: 'A primeira linha selecionada não pode recuar.' };
  if (delta === -1 && tasks.slice(from, end).some(t => t.level === 0)) return { tasks, links, error: 'Há linha no nível 0 na seleção.' };
  const next = tasks.map((t, i) => (i >= from && i < end ? { ...t, level: t.level + delta } : t));
  const promoted = delta === 1 ? (next[from].level > next[from - 1].level ? from - 1 : -1) : next[end]?.level > next[to].level ? to : -1;
  if (promoted < 0) return { tasks: next, links };
  next[promoted] = asSummary(next[promoted]);
  const id = next[promoted].id;
  return { tasks: next, links: links.filter(l => l.predecessorId !== id && l.successorId !== id) };
}
/** Linhas visíveis sem filtro: ficam de fora os descendentes de resumo recolhido. */
function unfoldedRows(tasks: PlanTask[], folded: string[]): PlanTask[] {
  const parents: PlanTask[] = [];
  return tasks.filter(t => {
    while (parents.length && parents.at(-1)!.level >= t.level) parents.pop();
    const shown = !parents.some(p => folded.includes(p.id));
    parents.push(t);
    return shown;
  });
}
const PLAN_ROW = '__plano__';
const fieldLabels: Record<string, string> = {
  name: 'Nome',
  plannedStart: 'Início',
  plannedEnd: 'Término',
  duration: 'Duração',
  anchorStart: 'Não iniciar antes de (antigo)',
  constraintType: 'Tipo de restrição',
  constraintDate: 'Data da restrição',
  deadline: 'Prazo final',
  actualStart: 'Início real',
  actualEnd: 'Término real',
  teamId: 'Recurso',
  progress: '% concluída',
  notes: 'Anotações',
  level: 'Nível',
  order: 'Ordem',
  predecessors: 'Predecessoras',
};
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
/** Data no formato que a equipe lê no Project: "Seg 24/08/26". */
const projectDate = (d?: string) =>
  d ? `${WEEKDAYS[new Date(d + 'T00:00:00Z').getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : 'ND';
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const nextMonth = (m: string) => {
  const y = Number(m.slice(0, 4)),
    n = Number(m.slice(5, 7));
  return n === 12 ? `${y + 1}-01` : `${y}-${String(n + 1).padStart(2, '0')}`;
};
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const stamp = () => ({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
const blank = (s: string) => !s.trim() || /^nd$/i.test(s.trim());
/** Aceita o que se copia do Project ("Seg 24/08/26"), dd/mm/aa, dd/mm/aaaa e AAAA-MM-DD. */
function dateInput(raw: string) {
  const s = raw.trim().replace(/^[A-Za-zÀ-ú]{3}\.?\s+/, '');
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const d = m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : s;
  validateDate(d);
  return d;
}
/** Tipo de restrição como se cola do Project: o nome em português ("Não iniciar antes de"), a sigla
 * (NIAD) ou o código interno (SNET), sem distinguir acento nem caixa. Vazio é "O mais breve possível". */
function constraintInput(raw: string): ConstraintType {
  const key = normalize(raw).replace(/\s+/g, ' ').trim();
  if (!key) return 'ASAP';
  const found = CONSTRAINT_TYPES.find(c => [c, CONSTRAINT_ABBREVIATIONS[c], CONSTRAINT_LABELS[c]].some(s => normalize(s) === key));
  if (!found) throw new Error('Tipo de restrição: use o nome do Project ou a sigla (NIAD, NIDD, NTAD, NTDD, DIE, DTE, OMBP, OMTP).');
  return found;
}
const startConstraint = (type: ConstraintType) => type === 'SNET' || type === 'SNLT' || type === 'MSO';
/** Folga como o Project escreve: "3 dias", "1 dia", "-2 dias". */
const slackText = (n?: number) => (n === undefined ? '' : `${n} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`);
const constraintText = (c: { type: ConstraintType; date?: string }) =>
  `${CONSTRAINT_LABELS[c.type]}${c.date && constraintNeedsDate(c.type) ? ` ${projectDate(c.date)}` : ''}`;
/** Alcançáveis a partir de `from` seguindo `step`, sem o próprio `from` (busca em largura). */
function reachable(from: string, step: (id: string) => string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [from];
  for (let i = 0; i < queue.length; i++)
    for (const next of step(queue[i]))
      if (next !== from && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
  return seen;
}
/** "Caminho da tarefa" do Project 2013, a partir de uma linha: predecessoras (subindo por todos os
 * vínculos de entrada), predecessoras determinantes (subindo só por quem de fato segura cada data),
 * sucessoras (descendo por todos os de saída) e sucessoras determinadas (descendo só por vínculos
 * em que a origem é determinante da sucessora). */
function taskPath(from: string, links: PlanDependency[], info: Map<string, TaskSchedule>) {
  const incoming = new Map<string, string[]>(),
    outgoing = new Map<string, string[]>();
  for (const l of links) {
    incoming.set(l.successorId, [...(incoming.get(l.successorId) ?? []), l.predecessorId]);
    outgoing.set(l.predecessorId, [...(outgoing.get(l.predecessorId) ?? []), l.successorId]);
  }
  return {
    predecessors: reachable(from, id => incoming.get(id) ?? []),
    driving: reachable(from, id => info.get(id)?.driverIds ?? []),
    successors: reachable(from, id => outgoing.get(id) ?? []),
    driven: reachable(from, id => (outgoing.get(id) ?? []).filter(s => info.get(s)?.driverIds.includes(id))),
  };
}
const stored = (data: PlanningData, plan: MediumTermPlan): Draft => ({
  tasks: data.planTasks.filter(t => t.planId === plan.id).sort((a, b) => a.order - b.order),
  links: data.planDependencies.filter(l => data.planTasks.some(t => t.planId === plan.id && t.id === l.successorId)),
  calendar: structuredClone(plan.calendar ?? DEFAULT_CALENDAR),
});
/** O plano como a regra atual o calcula. Plano gravado antes das datas reais tem % sem início real, e
 * datas que o "Não iniciar antes de" agora segura; os dois são acertados aqui e a tela avisa quantas
 * linhas mudaram, que vão ao banco no próximo "Revisar e salvar". O `anchorStart` antigo vira
 * "Não iniciar antes de" em `constraintType`/`constraintDate` (o mapper já faz isso ao ler; aqui é a
 * defesa para rascunho antigo) e o resumo não carrega restrição. */
function initial(data: PlanningData, plan: MediumTermPlan): Draft {
  const draft = stored(data, plan);
  const summaries = new Set(draft.tasks.filter((t, i) => draft.tasks[i + 1]?.level > t.level).map(t => t.id));
  const converted = draft.tasks.map(t => {
    if (!t.anchorStart) return t;
    const { anchorStart, ...rest } = t;
    if (summaries.has(t.id) || rest.constraintType) return rest;
    return { ...rest, constraintType: 'SNET' as const, constraintDate: anchorStart };
  });
  try {
    const tasks = converted.map(t =>
      !summaries.has(t.id) && t.progress > 0 && !t.actualStart ? withProgress(t, t.progress, draft.calendar) : t,
    );
    return { ...draft, tasks: scheduleTasks(tasks, draft.links, draft.calendar) };
  } catch {
    return draft;
  }
}
const linkText = (tasks: PlanTask[], links: PlanDependency[], id: string) =>
  links
    .filter(l => l.successorId === id)
    .map(l => formatLink(tasks.findIndex(p => p.id === l.predecessorId) + 1, l))
    .join(';');

export function ScheduleSheet({ workId }: { workId: string }) {
  const context = usePlanning();
  const [id, setId] = useState('');
  if (context.state !== 'ready') return null;
  const actor = context.planning.data.users.find(u => u.id === context.actorId);
  if (!actor?.workIds.includes(workId)) return null;
  const plans = context.planning.data.plans
    .filter(p => p.workId === workId && !p.baselineOf)
    .sort((a, b) => b.month.localeCompare(a.month));
  const today = context.planning.today;
  // Abre no cronograma do mês corrente; sem ele, no mais recente.
  const plan = plans.find(p => p.id === id) ?? plans.find(p => p.month === today.slice(0, 7)) ?? plans[0];
  return (
    <section className="panel my-5 overflow-hidden" data-tour="medio-gantt">
      {plan ? (
        <Sheet
          key={`${context.actorId}:${plan.id}`}
          plan={plan}
          data={context.planning.data}
          actorId={context.actorId}
          readOnly={actor.role === 'viewer'}
          today={today}
          execute={context.execute}
          plans={plans}
          choose={setId}
        />
      ) : (
        // Estado vazio: o que a tela faz, em uma frase, e o único botão que leva adiante.
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <ChartGantt size={28} className="text-slate-300" aria-hidden />
          <h2 className="text-base font-bold text-slate-900">Cronograma do mês</h2>
          <p className="max-w-md text-sm leading-6 text-slate-600">
            Cada mês tem o seu cronograma, com horizonte de três meses. Crie o primeiro para começar; os seguintes nascem como cópia do
            anterior.
          </p>
          <span data-tour="medio-primeiro-plano" className="inline-flex">
            <NewPlanForm workId={workId} plans={plans} today={today} onDone={setId} tone="primary" />
          </span>
        </div>
      )}
    </section>
  );
}

/** Abre numa gaveta; no estado vazio é o botão primário da tela, no rodapé do cronograma é discreto. */
function NewPlanForm({
  workId,
  plans,
  today,
  onDone,
  tone = 'ghost',
}: {
  workId: string;
  plans: MediumTermPlan[];
  today: string;
  onDone: (id: string) => void;
  tone?: 'primary' | 'ghost';
}) {
  const latest = plans[0];
  const month = latest ? nextMonth(latest.month) : today.slice(0, 7);
  return (
    <CommandForm
      title="Novo cronograma do mês"
      description="Cada mês tem o seu cronograma, com horizonte de três meses."
      submit="Criar cronograma"
      tone={tone}
      success="Cronograma criado"
      onDone={onDone}
      command={d => ({
        type: 'create_plan',
        workId,
        month: value(d, 'month'),
        name: value(d, 'name') || undefined,
        copyFrom: value(d, 'copyFrom') || undefined,
      })}
    >
      <TextField name="month" label="Mês" type="month" defaultValue={month} />
      {plans.length > 0 && (
        <Field label="Partir de">
          <select className="field" name="copyFrom" defaultValue={latest.id}>
            {plans.map(p => (
              <option key={p.id} value={p.id}>
                Cópia de {monthLabel(p.month)} · {p.name}
              </option>
            ))}
            <option value="">Em branco</option>
          </select>
        </Field>
      )}
      <p className="text-xs text-slate-500">
        A cópia leva tarefas, vínculos, recursos, % concluída e datas reais. Tarefas já concluídas antes do novo horizonte ficam de fora; o
        cronograma do mês anterior não muda.
      </p>
      <TextField name="name" label="Nome (opcional)" required={false} />
    </CommandForm>
  );
}

export function Sheet({
  plan,
  data,
  actorId,
  readOnly,
  today,
  execute,
  plans,
  choose,
}: {
  plan: MediumTermPlan;
  data: PlanningData;
  actorId: string;
  readOnly: boolean;
  today: string;
  execute: Extract<ReturnType<typeof usePlanning>, { state: 'ready' }>['execute'];
  plans: MediumTermPlan[];
  choose: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => initial(data, plan));
  const [base, setBase] = useState(() => planSnapshot(plan, data.planTasks, data.planDependencies));
  const [original, setOriginal] = useState<Draft>(() => initial(data, plan));
  const [past, setPast] = useState<Draft[]>([]),
    [future, setFuture] = useState<Draft[]>([]);
  const [locked, setLocked] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [review, setReview] = useState(false),
    [reason, setReason] = useState('');
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [team, setTeam] = useState(''),
    [reference, setReference] = useState(today);
  const [folded, setFolded] = useState<string[]>([]),
    [hidden, setHidden] = useState<Col[]>(DEFAULT_HIDDEN),
    [order, setOrder] = useState<Col[]>(DEFAULT_ORDER),
    [widths, setWidths] = useState<Record<string, number>>({});
  // Arrasto do cabeçalho: a coluna em movimento e a coluna alvo, com o lado em que será solta.
  const [dragCol, setDragCol] = useState<Col | null>(null),
    [drop, setDrop] = useState<{ key: Col; after: boolean } | null>(null);
  const [presentation, setPresentation] = useState<Presentation>('split'),
    [zoom, setZoom] = useState<GanttZoom>('semana'),
    [tableWidth, setTableWidth] = useState(720);
  // "Exibir" do Gantt: o caminho crítico vem ligado, como no Gantt de acompanhamento do Project.
  const [showCritical, setShowCritical] = useState(true),
    [showSlack, setShowSlack] = useState(false),
    [showPath, setShowPath] = useState(false);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [selected, setSelected] = useState<{ row: number; col: number }>({ row: 0, col: 3 }),
    [anchor, setAnchor] = useState<{ row: number; col: number }>({ row: 0, col: 3 });
  const [editor, setEditor] = useState<{ id: string; key: Col; text: string; seeded?: boolean } | null>(null);
  const baselines = data.plans.filter(p => p.baselineOf === plan.id).sort((a, b) => (b.frozenAt ?? '').localeCompare(a.frozenAt ?? ''));
  // Como no Project, a linha de base aparece sempre; a mais recente é a padrão.
  const [baseId, setBaseId] = useState(() => baselines[0]?.id ?? ''),
    [meeting, setMeeting] = useState(false),
    [reviewed, setReviewed] = useState<string[]>([]);
  const [fullDetails, setFullDetails] = useState(false),
    [metrics, setMetrics] = useState({ row: 28, head: 44 });
  // O histórico só é pedido ao servidor com o painel aberto: trocar de linha com as setas não pode virar uma consulta por tecla.
  const [historyOpen, setHistoryOpen] = useState(false);
  const confirm = useConfirm();
  const { toast } = useToast();
  const router = useRouter();
  const committedEditor = useRef<object | null>(null);
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const gridRef = useRef<HTMLTableElement>(null);
  const editRef = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const tableScroll = useRef<HTMLDivElement>(null),
    chartScroll = useRef<HTMLDivElement>(null);
  const prefKey = `cronograma:${actorId}:${plan.id}`;
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const canEdit = !readOnly && !locked && !busy && !plan.frozenAt;
  const teams = data.teams.filter(t => t.workId === plan.workId);
  const teamLabel = (id?: string) => {
    const e = teams.find(t => t.id === id);
    return e ? `${e.company} · ${e.name}` : '';
  };
  const win = useMemo(() => planWindow(plan.month), [plan.month]);
  const roll = useMemo(() => rollUpPlan(draft.tasks), [draft.tasks]);
  // Passada inversa, folgas e caminho crítico sobre o rascunho já agendado: as datas são as mesmas do
  // `scheduleTasks`; o que se lê daqui são as tardias, as folgas e quem segura cada data.
  const analysis = useMemo<ScheduleAnalysis>(() => {
    try {
      return analyzeSchedule(draft.tasks, draft.links, draft.calendar);
    } catch {
      return { tasks: draft.tasks, info: new Map() };
    }
  }, [draft]);
  const info = (id: string) => analysis.info.get(id);
  const criticalCount = draft.tasks.filter(t => !roll.get(t.id)?.summary && info(t.id)?.critical).length;
  const anyCritical = criticalCount > 0;
  const changed = draft.tasks.filter(
    t =>
      JSON.stringify(t) !== JSON.stringify(original.tasks.find(o => o.id === t.id)) ||
      JSON.stringify(draft.links.filter(l => l.successorId === t.id)) !==
        JSON.stringify(original.links.filter(l => l.successorId === t.id)),
  );
  const removed = original.tasks.filter(t => !draft.tasks.some(n => n.id === t.id));
  const baselineTasks = useMemo(() => data.planTasks.filter(t => t.planId === baseId), [data.planTasks, baseId]);
  const baselineRoll = useMemo(() => rollUpPlan(baselineTasks), [baselineTasks]);
  const visibleCols = order.map(k => COLUMN[k]).filter(c => !hidden.includes(c.key) || c.key === 'name');
  const filtering = !!query || status !== 'all' || !!team;
  const outOfWindow = (id: string) => {
    const v = roll.get(id)!;
    return !v.summary && (v.plannedEnd < win.start || v.plannedStart > win.end);
  };
  const included = new Set<string>();
  const parents: PlanTask[] = [];
  draft.tasks.forEach(t => {
    while (parents.length && parents.at(-1)!.level >= t.level) parents.pop();
    const v = roll.get(t.id)!;
    const hay = normalize([t.name, t.notes, teamLabel(t.teamId)].join(' '));
    const match =
      normalize(query)
        .split(/\s+/)
        .every(token => hay.includes(token)) &&
      (!team || t.teamId === team) &&
      (status === 'all' ||
        (status === 'zero' && v.progress === 0) ||
        (status === 'ongoing' && v.progress > 0 && v.progress < 100) ||
        (status === 'done' && v.progress === 100) ||
        (status === 'late' && v.progress < 100 && v.plannedEnd < reference) ||
        (status === 'changed' && changed.some(c => c.id === t.id)) ||
        (status === 'notes' && !!t.notes) ||
        (status === 'window' && outOfWindow(t.id)) ||
        (status === 'critical' && !!info(t.id)?.critical) ||
        (status === 'conflict' && !!info(t.id)?.conflict) ||
        (status === 'deadline' && !!info(t.id)?.deadlineMissed));
    if (filtering ? match : !parents.some(p => folded.includes(p.id))) {
      included.add(t.id);
      if (filtering) parents.forEach(p => included.add(p.id));
    }
    parents.push(t);
  });
  const rows = draft.tasks.filter(t => included.has(t.id));
  const active = rows[selected.row];
  const activeIndex = active ? draft.tasks.indexOf(active) : -1;
  const bounds = {
    r0: Math.min(anchor.row, selected.row),
    r1: Math.max(anchor.row, selected.row),
    c0: Math.min(anchor.col, selected.col),
    c1: Math.max(anchor.col, selected.col),
  };
  const baseFor = (id: string) => {
    const pair = baselineTasks.find(b => b.sourceTaskId === id);
    return pair ? baselineRoll.get(pair.id) : undefined;
  };

  // Linha 0 do Project: o resumo do cronograma inteiro.
  const planRow = useMemo(() => {
    const leaves = draft.tasks.filter(t => !roll.get(t.id)?.summary);
    if (!leaves.length) return null;
    const weight = (t: PlanTask) => Math.max(1, countedDays(t.plannedStart, t.plannedEnd, false, draft.calendar));
    const total = leaves.reduce((n, t) => n + weight(t), 0);
    const baseLeaves = baselineTasks.filter(t => !baselineRoll.get(t.id)?.summary);
    return {
      start: leaves.reduce((m, t) => (t.plannedStart < m ? t.plannedStart : m), leaves[0].plannedStart),
      end: leaves.reduce((m, t) => (t.plannedEnd > m ? t.plannedEnd : m), leaves[0].plannedEnd),
      progress: leaves.reduce((n, t) => n + t.progress * weight(t), 0) / total,
      actualStart: leaves
        .map(t => t.actualStart)
        .filter((d): d is string => !!d)
        .sort()[0],
      actualEnd: leaves.every(t => t.actualEnd)
        ? leaves
            .map(t => t.actualEnd!)
            .sort()
            .at(-1)
        : undefined,
      baseStart: baseLeaves.map(t => t.plannedStart).sort()[0],
      baseEnd: baseLeaves
        .map(t => t.plannedEnd)
        .sort()
        .at(-1),
    };
  }, [draft.tasks, draft.calendar, roll, baselineTasks, baselineRoll]);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(prefKey) ?? '{}');
      setFolded(Array.isArray(p.folded) ? p.folded : []);
      if (Array.isArray(p.hidden)) setHidden(p.hidden.filter((k: string) => columns.some(c => c.key === k)));
      setOrder(normalizeOrder(p.order));
      setWidths(
        p.widths && typeof p.widths === 'object'
          ? Object.fromEntries(
              Object.entries(p.widths)
                .filter(([k, v]) => columns.some(c => c.key === k) && typeof v === 'number' && v >= 36 && v <= 600)
                .map(([k, v]) => [k, Number(v)]),
            )
          : {},
      );
      if (['split', 'table', 'chart'].includes(p.presentation)) setPresentation(p.presentation);
      if (['dia', 'semana', 'mes'].includes(p.zoom)) setZoom(p.zoom);
      if (typeof p.tableWidth === 'number' && p.tableWidth >= 240 && p.tableWidth <= 2400) setTableWidth(p.tableWidth);
      if (typeof p.showCritical === 'boolean') setShowCritical(p.showCritical);
      if (typeof p.showSlack === 'boolean') setShowSlack(p.showSlack);
      if (typeof p.showPath === 'boolean') setShowPath(p.showPath);
    } catch {}
    setPreferencesLoaded(true);
  }, [prefKey]);
  useEffect(() => {
    if (preferencesLoaded)
      try {
        localStorage.setItem(
          prefKey,
          JSON.stringify({ folded, hidden, order, widths, presentation, zoom, tableWidth, showCritical, showSlack, showPath }),
        );
      } catch {}
  }, [prefKey, folded, hidden, order, widths, presentation, zoom, tableWidth, showCritical, showSlack, showPath, preferencesLoaded]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || editor) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, editor]);
  // Com rascunho aberto, clicar num link pergunta antes de sair. O diálogo é assíncrono, então o clique
  // é sempre barrado e a navegação refeita pelo router se a pessoa confirmar. Nova aba (target ou
  // Ctrl/Cmd+clique) e download não perdem o rascunho e passam direto.
  useEffect(() => {
    const guard = (e: MouseEvent) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
      if (!link || !(dirty || editor)) return;
      if (link.target === '_blank' || link.hasAttribute('download') || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      const href = link.getAttribute('href') ?? '';
      void confirm({
        title: 'Sair e perder as alterações não salvas?',
        description: 'O rascunho do cronograma ainda não foi salvo. Volte e use “Revisar e salvar” para gravá-lo.',
        confirmLabel: 'Sair sem salvar',
        cancelLabel: 'Continuar editando',
        tone: 'danger',
      }).then(ok => {
        if (ok && href) router.push(href);
      });
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, [dirty, editor, confirm, router]);
  // Atualizações externas não substituem um rascunho aberto.
  useEffect(() => {
    if (!dirty && !editor) {
      const next = initial(data, plan);
      setDraft(next);
      setOriginal(next);
      setBase(planSnapshot(plan, data.planTasks, data.planDependencies));
    }
  }, [data, plan, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  // Quem começa a digitar direto na célula continua digitando: a primeira tecla não fica selecionada.
  useEffect(() => {
    const input = editRef.current;
    if (!input) return;
    input.focus();
    if (editor?.seeded && 'setSelectionRange' in input) input.setSelectionRange(input.value.length, input.value.length);
    else input.select?.();
  }, [editor?.id, editor?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (review) reviewDialog.current?.showModal();
    else reviewDialog.current?.close();
  }, [review]);
  // O Gantt se alinha à tabela pela altura medida da linha e do cabeçalho, não por uma constante.
  useEffect(() => {
    const table = gridRef.current;
    if (!table) return;
    const measure = () => {
      const head = table.tHead?.getBoundingClientRect().height;
      const row = table.tBodies[0]?.rows[0]?.getBoundingClientRect().height;
      setMetrics(m => ({ row: row || m.row, head: head || m.head }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => observer.disconnect();
  }, [presentation, rows.length > 0]);

  function sync(from: HTMLDivElement, to: HTMLDivElement | null) {
    if (to && Math.abs(to.scrollTop - from.scrollTop) > 1) to.scrollTop = from.scrollTop;
  }
  function stage(next: Draft) {
    setPast(p => [...p.slice(-49), draft]);
    setFuture([]);
    setDraft(next);
    setError('');
  }
  function undo() {
    if (!past.length) return;
    setFuture(f => [draft, ...f]);
    setDraft(past.at(-1)!);
    setPast(p => p.slice(0, -1));
    setEditor(null);
  }
  function redo() {
    if (!future.length) return;
    setPast(p => [...p, draft]);
    setDraft(future[0]);
    setFuture(f => f.slice(1));
    setEditor(null);
  }
  function focus(row: number, col: number, extend = false) {
    const next = { row: Math.max(0, Math.min(rows.length - 1, row)), col: Math.max(0, Math.min(visibleCols.length - 1, col)) };
    setSelected(next);
    if (!extend) setAnchor(next);
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-pos="${next.row}:${next.col}"]`)?.focus());
  }
  /** Aplica a ordem nova mantendo a seleção na mesma coluna: a seleção guarda posições em `visibleCols`. */
  function reorder(next: Col[]) {
    if (next === order) return;
    const shown = (o: Col[]) => o.filter(k => !hidden.includes(k) || k === 'name');
    const before = shown(order),
      after = shown(next);
    const remap = (col: number) => Math.max(0, after.indexOf(before[col]));
    setOrder(next);
    setSelected(s => ({ ...s, col: remap(s.col) }));
    setAnchor(a => ({ ...a, col: remap(a.col) }));
  }
  function durationText(t: PlanTask) {
    const v = roll.get(t.id)!;
    if (v.summary) return formatDuration({ value: countedDays(v.plannedStart, v.plannedEnd, true, draft.calendar), unit: 'd' });
    return formatDuration(
      t.duration ?? ({ value: countedDays(t.plannedStart, t.plannedEnd, false, draft.calendar), unit: 'dd' } as TaskDuration),
    );
  }
  function raw(t: PlanTask, key: Col): string {
    const v = roll.get(t.id)!;
    const bv = ['baseStart', 'baseEnd', 'variance'].includes(key) ? baseFor(t.id) : undefined;
    const target = ['target', 'gap'].includes(key)
      ? temporalTarget({ ...t, plannedStart: v.plannedStart, plannedEnd: v.plannedEnd }, reference, draft.calendar)
      : 0;
    switch (key) {
      case 'id':
        return String(draft.tasks.indexOf(t) + 1);
      case 'ind':
        return '';
      case 'name':
        return t.name;
      case 'duration':
        return durationText(t);
      case 'start':
        return projectDate(v.plannedStart);
      case 'end':
        return projectDate(v.plannedEnd);
      case 'progress':
        return `${Math.round(v.progress)}%`;
      case 'actualStart':
        return projectDate(v.actualStart);
      case 'actualEnd':
        return projectDate(v.actualEnd);
      case 'links':
        return linkText(draft.tasks, draft.links, t.id);
      case 'team':
        return teamLabel(t.teamId);
      case 'notes':
        return t.notes ?? '';
      case 'target':
        return `${Math.round(target)}%`;
      case 'gap':
        return `${Math.round(v.progress - target)} pp`;
      case 'elapsed': {
        const business = t.duration ? !['dd', 'md'].includes(t.duration.unit) : false;
        return `${reference < v.plannedStart ? 0 : countedDays(v.plannedStart, reference > v.plannedEnd ? v.plannedEnd : reference, business, draft.calendar)} / ${countedDays(v.plannedStart, v.plannedEnd, business, draft.calendar)}`;
      }
      case 'baseStart':
        return projectDate(bv?.plannedStart);
      case 'baseEnd':
        return projectDate(bv?.plannedEnd);
      case 'variance':
        return bv ? String(Math.round((Date.parse(v.plannedEnd) - Date.parse(bv.plannedEnd)) / 86400000)) : '';
      case 'constraintType':
        return v.summary ? '' : CONSTRAINT_LABELS[constraintOf(t).type];
      case 'constraintDate': {
        if (v.summary) return '';
        const c = constraintOf(t);
        return constraintNeedsDate(c.type) ? projectDate(c.date) : 'ND';
      }
      case 'deadline':
        return v.summary ? '' : projectDate(t.deadline);
      case 'lateStart':
        return projectDate(info(t.id)?.lateStart);
      case 'lateFinish':
        return projectDate(info(t.id)?.lateFinish);
      case 'totalSlack':
        return slackText(info(t.id)?.totalSlack);
      case 'freeSlack':
        return slackText(info(t.id)?.freeSlack);
      case 'critical':
        return info(t.id) ? (info(t.id)!.critical ? 'Sim' : 'Não') : '';
    }
  }
  function planRaw(key: Col): string {
    if (!planRow) return '';
    switch (key) {
      case 'id':
        return '0';
      case 'name':
        return plan.name;
      case 'progress':
        return `${Math.round(planRow.progress)}%`;
      case 'duration':
        return formatDuration({ value: countedDays(planRow.start, planRow.end, true, draft.calendar), unit: 'd' });
      case 'start':
        return projectDate(planRow.start);
      case 'end':
        return projectDate(planRow.end);
      case 'actualStart':
        return projectDate(planRow.actualStart);
      case 'actualEnd':
        return projectDate(planRow.actualEnd);
      case 'baseStart':
        return baseId ? projectDate(planRow.baseStart) : 'ND';
      case 'baseEnd':
        return baseId ? projectDate(planRow.baseEnd) : 'ND';
      case 'lateFinish':
        return projectDate(analysis.projectFinish);
      case 'totalSlack':
      case 'freeSlack':
        return analysis.projectFinish ? slackText(0) : '';
      case 'critical':
        return analysis.projectFinish ? (anyCritical ? 'Sim' : 'Não') : '';
      default:
        return '';
    }
  }
  function editable(t: PlanTask, key: Col) {
    return canEdit && !!columns.find(c => c.key === key)?.editable && !(roll.get(t.id)?.summary && LEAF_ONLY.includes(key));
  }
  /** Grava a restrição no formato novo e apaga o `anchorStart` antigo. "O mais breve possível" é a
   * ausência de restrição, por isso fica sem campo; "O mais tarde possível" não leva data. */
  function setConstraint(t: PlanTask, type: ConstraintType, date?: string) {
    delete t.anchorStart;
    delete t.constraintType;
    delete t.constraintDate;
    if (type === 'ASAP') return;
    t.constraintType = type;
    if (constraintNeedsDate(type)) t.constraintDate = date;
  }
  function applyCells(entries: { id: string; key: Col; text: string }[]) {
    stage(applyCellsTo(draft, entries));
  }
  /** As células aplicadas sobre `base`, já reagendadas, sem mexer no rascunho: quem chama decide se
   * grava direto ou se encadeia outra operação (Enter na última linha edita e insere de uma vez). */
  function applyCellsTo(base: Draft, entries: { id: string; key: Col; text: string }[]): Draft {
    if (entries.length > 1000) throw new Error('Limite de 1000 células por operação.');
    const next = structuredClone(base);
    for (const entry of entries) {
      const at = next.tasks.findIndex(t => t.id === entry.id);
      const t = next.tasks[at];
      if (!t || !editable(t, entry.key)) throw new Error('O intervalo contém uma célula bloqueada ou calculada.');
      switch (entry.key) {
        case 'name':
          if (!entry.text.trim()) throw new Error('Nome é obrigatório.');
          t.name = entry.text.trim();
          break;
        case 'notes':
          t.notes = entry.text;
          break;
        case 'progress': {
          const n = Number(entry.text.replace('%', '').replace(',', '.').trim());
          if (!entry.text.trim() || !Number.isFinite(n)) throw new Error('% concluída deve ficar entre 0 e 100.');
          next.tasks[at] = withProgress(t, n, next.calendar);
          break;
        }
        case 'actualStart':
          next.tasks[at] = withActualStart(t, blank(entry.text) ? undefined : dateInput(entry.text), next.calendar);
          break;
        case 'actualEnd':
          next.tasks[at] = withActualEnd(t, blank(entry.text) ? undefined : dateInput(entry.text), next.calendar);
          break;
        case 'team': {
          const text = entry.text.trim();
          const match = teams.find(
            e =>
              e.id === text ||
              `${e.company} · ${e.name}` === text ||
              normalize(e.name) === normalize(text) ||
              normalize(e.company) === normalize(text),
          );
          if (text && !match) throw new Error('Escolha um recurso cadastrado na obra.');
          t.teamId = match?.id;
          break;
        }
        case 'duration':
          if (t.actualEnd) throw new Error('Tarefa concluída: a duração vem do início e do término reais.');
          t.duration = parseDuration(entry.text);
          break;
        case 'start': {
          if (t.actualStart) throw new Error('A tarefa já começou: corrija o Início real.');
          // Apagar o início de uma tarefa com predecessoras devolve a data à rede, como "o mais breve possível".
          if (blank(entry.text)) {
            if (!next.links.some(l => l.successorId === t.id)) throw new Error('Informe o início.');
            setConstraint(t, 'ASAP');
            break;
          }
          // Como no Project: digitar o início cria "Não iniciar antes de" nessa data.
          const start = dateInput(entry.text);
          t.duration ??= { value: countedDays(t.plannedStart, t.plannedEnd, false, next.calendar), unit: 'dd' };
          setConstraint(t, 'SNET', start);
          t.plannedStart = start;
          t.plannedEnd = endFor(start, t.duration, next.calendar).end;
          break;
        }
        case 'end': {
          if (t.actualEnd) throw new Error('Tarefa concluída: corrija o Término real.');
          const end = dateInput(entry.text);
          const business = t.duration ? !['dd', 'md'].includes(t.duration.unit) : true;
          t.duration = { value: countedDays(t.plannedStart, end, business, next.calendar), unit: business ? 'd' : 'dd' };
          if (!t.duration.value) throw new Error('Período sem dia de trabalho.');
          t.plannedEnd = end;
          // Como no Project: digitar o término cria "Não terminar antes de" nessa data.
          setConstraint(t, 'FNET', end);
          break;
        }
        case 'constraintType': {
          const type = constraintInput(entry.text);
          // Tipo com data numa tarefa sem data: o Project usa o início (ou o término) atual da tarefa.
          const date = constraintOf(t).date ?? (startConstraint(type) ? t.plannedStart : t.plannedEnd);
          setConstraint(t, type, date);
          break;
        }
        case 'constraintDate': {
          if (blank(entry.text)) {
            setConstraint(t, 'ASAP');
            break;
          }
          // Data numa tarefa sem restrição vira "Não iniciar antes de", como no Project.
          const current = constraintOf(t).type;
          setConstraint(t, constraintNeedsDate(current) ? current : 'SNET', dateInput(entry.text));
          break;
        }
        case 'deadline':
          if (blank(entry.text)) delete t.deadline;
          else t.deadline = dateInput(entry.text);
          break;
        case 'links': {
          const parsed = parseLinks(entry.text);
          if (parsed.invalid.length) throw new Error(`Predecessora inválida: ${parsed.invalid.join(', ')}`);
          next.links = next.links.filter(l => l.successorId !== t.id);
          for (const l of parsed.links) {
            const p = next.tasks[l.number - 1];
            if (!p) throw new Error(`Linha ${l.number} não existe.`);
            if (p.id === t.id) throw new Error('A tarefa não pode ser predecessora dela mesma.');
            next.links.push({
              id: crypto.randomUUID(),
              ...stamp(),
              predecessorId: p.id,
              successorId: t.id,
              type: l.type,
              lagDays: l.lagDays,
              lagBusiness: l.lagBusiness,
            });
          }
          break;
        }
      }
    }
    next.tasks = scheduleTasks(next.tasks, next.links, next.calendar);
    return next;
  }
  /** Tarefa nova logo abaixo da linha `at` (no fim, sem linha). Fica no nível dela; abaixo de um
   * resumo vira a primeira subtarefa, senão as subtarefas dele passariam para a linha nova. Nasce
   * "O mais breve possível", com 1 dia, na data da linha de cima, e já reagendada. */
  function insertBelow(base: Draft, at: number): { next: Draft; task: PlanTask; unfold?: string } {
    const next = structuredClone(base);
    const current = at >= 0 ? next.tasks[at] : undefined;
    const summary = !!current && next.tasks[at + 1]?.level > current.level;
    const start = current ? (roll.get(current.id)?.plannedStart ?? current.plannedStart) : win.start;
    const task: PlanTask = {
      id: crypto.randomUUID(),
      ...stamp(),
      planId: plan.id,
      name: 'Nova tarefa',
      plannedStart: start,
      plannedEnd: start,
      duration: { value: 1, unit: 'd' },
      progress: 0,
      order: 0,
      level: current ? current.level + (summary ? 1 : 0) : 0,
    };
    next.tasks.splice(current ? at + 1 : next.tasks.length, 0, task);
    next.tasks.forEach((t, i) => (t.order = i + 1));
    next.tasks = scheduleTasks(next.tasks, next.links, next.calendar);
    return { next, task, unfold: summary && current && folded.includes(current.id) ? current.id : undefined };
  }
  /** Grava o rascunho com a linha nova, seleciona-a e abre o nome para digitar, na coluna do nome. */
  function stageInserted({ next, task, unfold }: ReturnType<typeof insertBelow>, row: number) {
    stage(next);
    if (unfold) setFolded(f => f.filter(id => id !== unfold));
    const col = Math.max(
      0,
      visibleCols.findIndex(c => c.key === 'name'),
    );
    setSelected({ row, col });
    setAnchor({ row, col });
    committedEditor.current = null;
    setEditor({ id: task.id, key: 'name', text: task.name });
  }
  function commit() {
    if (!editor || committedEditor.current === editor) return true;
    try {
      applyCells([editor]);
      committedEditor.current = editor;
      setEditor(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      editRef.current?.focus();
      return false;
    }
  }
  function begin(t: PlanTask, key: Col, seed?: string) {
    if (editable(t, key)) {
      setError('');
      const text = raw(t, key);
      // O `<select>` abre no valor atual: a tecla digitada não substitui uma escolha de lista.
      const current =
        key === 'team'
          ? (t.teamId ?? '')
          : key === 'constraintType'
            ? constraintOf(t).type
            : text === 'ND'
              ? ''
              : key === 'progress'
                ? text.replace('%', '')
                : text;
      const select = SELECT_COLS.includes(key);
      setEditor({ id: t.id, key, seeded: seed !== undefined && !select, text: select ? current : (seed ?? current) });
    }
  }
  /** XML do Project (MSPDI) com o rascunho como está, inclusive folgas e caminho crítico. */
  function exportXml() {
    try {
      const baseline = baseId
        ? new Map(
            draft.tasks.flatMap(t => {
              const b = baseFor(t.id);
              return b ? [[t.id, { start: b.plannedStart, end: b.plannedEnd }] as const] : [];
            }),
          )
        : undefined;
      const xml = buildMspdi({
        plan,
        tasks: draft.tasks,
        links: draft.links,
        calendar: draft.calendar,
        analysis,
        workName: data.works.find(w => w.id === plan.workId)?.name,
        baseline,
      });
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${plan.name.replace(/[\\/:*?"<>|]+/g, '-')}.xml`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save() {
    if (editor && !commit()) return;
    const count = changed.length + removed.length;
    setBusy(true);
    setError('');
    try {
      await execute({
        type: 'save_plan_revision',
        planId: plan.id,
        expectedSnapshot: base,
        reason,
        tasks: draft.tasks,
        links: draft.links,
        calendar: draft.calendar,
      });
      setOriginal(draft);
      setPast([]);
      setFuture([]);
      setReview(false);
      setReason('');
      toast({
        title: 'Cronograma salvo',
        description: `${count} ${count === 1 ? 'tarefa gravada' : 'tarefas gravadas'} em ${monthLabel(plan.month)}.`,
        tone: 'success',
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Assíncrona só por causa da exclusão, que pergunta antes; as outras operações não esperam nada.
  async function structural(kind: 'insert' | 'remove' | 'indent' | 'outdent' | 'link' | 'unlink') {
    if (!canEdit || filtering) return;
    const next = structuredClone(draft);
    const at = activeIndex;
    if (kind === 'insert') {
      // A linha nova entra abaixo da selecionada (no fim, sem seleção) e já abre o nome para digitar.
      if (editor && !commit()) return;
      try {
        stageInserted(insertBelow(draft, at), at >= 0 ? selected.row + 1 : rows.length);
      } catch (e) {
        setError((e as Error).message);
      }
      return;
    } else if (kind === 'link' || kind === 'unlink') {
      const chosen = rows.slice(bounds.r0, bounds.r1 + 1).filter(t => !roll.get(t.id)!.summary);
      const ids = new Set(chosen.map(t => t.id));
      if (kind === 'link') {
        if (chosen.length < 2) {
          setError('Selecione duas ou mais tarefas (Shift+setas) para vincular.');
          return;
        }
        for (let i = 1; i < chosen.length; i++)
          if (!next.links.some(l => l.predecessorId === chosen[i - 1].id && l.successorId === chosen[i].id))
            next.links.push({
              id: crypto.randomUUID(),
              ...stamp(),
              predecessorId: chosen[i - 1].id,
              successorId: chosen[i].id,
              type: 'TI',
              lagDays: 0,
              lagBusiness: true,
            });
      } else
        next.links =
          chosen.length > 1
            ? next.links.filter(l => !(ids.has(l.predecessorId) && ids.has(l.successorId)))
            : next.links.filter(l => !ids.has(l.predecessorId) && !ids.has(l.successorId));
    } else if (at >= 0) {
      if (kind === 'remove') {
        let end = at + 1;
        while (end < next.tasks.length && next.tasks[end].level > next.tasks[at].level) end++;
        const ok = await confirm({
          title: `Excluir “${active.name}”${end - at > 1 ? ` e ${end - at - 1} subitens` : ''}?`,
          description: 'A exclusão fica no rascunho e só vai ao banco em “Revisar e salvar”. Dá para desfazer com Ctrl+Z.',
          confirmLabel: 'Excluir',
          tone: 'danger',
        });
        if (!ok) return;
        const ids = new Set(next.tasks.slice(at, end).map(t => t.id));
        next.tasks.splice(at, end - at);
        next.links = next.links.filter(l => !ids.has(l.predecessorId) && !ids.has(l.successorId));
        next.tasks.forEach((t, i) => (t.order = i + 1));
      } else {
        // Recuo e seu inverso agem no intervalo selecionado (Shift+setas ou Shift+clique), da primeira
        // linha ao fim da subárvore da última, numa só entrada do desfazer.
        const first = draft.tasks.indexOf(rows[bounds.r0]),
          last = draft.tasks.indexOf(rows[Math.min(bounds.r1, rows.length - 1)]);
        const shifted = shiftLevels(next.tasks, first, last, kind === 'indent' ? 1 : -1, next.links);
        if (shifted.error) {
          setError(shifted.error);
          return;
        }
        next.tasks = shifted.tasks;
        next.links = shifted.links;
        // Recuo para dentro de um resumo recolhido: abre o resumo, senão o bloco sumiria da vista; a
        // seleção desce o tanto de linhas que apareceram antes dela.
        if (kind === 'indent') {
          let p = first - 1;
          while (p >= 0 && next.tasks[p].level >= next.tasks[first].level) p--;
          if (p >= 0 && folded.includes(next.tasks[p].id)) {
            const open = folded.filter(id => id !== next.tasks[p].id);
            const shift = unfoldedRows(next.tasks, open).findIndex(t => t.id === rows[bounds.r0].id) - bounds.r0;
            setFolded(open);
            setSelected(s => ({ ...s, row: s.row + shift }));
            setAnchor(a => ({ ...a, row: a.row + shift }));
          }
        }
      }
    } else return;
    try {
      next.tasks = scheduleTasks(next.tasks, next.links, next.calendar);
      stage(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function keyDown(e: React.KeyboardEvent, t: PlanTask, r: number, c: number) {
    if (editor) return;
    const cmd = e.ctrlKey || e.metaKey;
    if (cmd && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (canEdit) {
        if (e.shiftKey) redo();
        else undo();
      }
      return;
    }
    if (cmd && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      if (canEdit) redo();
      return;
    }
    if (cmd && e.key === 'F2') {
      e.preventDefault();
      structural(e.shiftKey ? 'unlink' : 'link');
      return;
    }
    if (e.key === 'Insert') {
      e.preventDefault();
      structural('insert');
      return;
    }
    // Alt+Shift+setas é o atalho do Project; Cmd/Ctrl+Alt+setas, o pedido pela equipe no Mac.
    if (e.altKey && (e.shiftKey || cmd) && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      structural(e.key === 'ArrowRight' ? 'indent' : 'outdent');
      return;
    }
    if (cmd && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      try {
        const entries = [];
        for (let row = bounds.r0 + 1; row <= bounds.r1; row++)
          for (let col = bounds.c0; col <= bounds.c1; col++)
            entries.push({ id: rows[row].id, key: visibleCols[col].key, text: raw(rows[bounds.r0], visibleCols[col].key) });
        applyCells(entries);
      } catch (err) {
        setError((err as Error).message);
      }
      return;
    }
    if (e.key === 'F2' || e.key === 'Enter') {
      e.preventDefault();
      begin(t, visibleCols[c].key);
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowDown: [r + 1, c],
      ArrowUp: [r - 1, c],
      ArrowLeft: [r, c - 1],
      ArrowRight: [r, c + 1],
      Home: [cmd ? 0 : r, 0],
      End: [cmd ? rows.length - 1 : r, visibleCols.length - 1],
    };
    if (moves[e.key]) {
      e.preventDefault();
      focus(...moves[e.key], e.shiftKey);
      return;
    }
    if (e.key === 'Tab') {
      const col = c + (e.shiftKey ? -1 : 1);
      const row = r + (col < 0 ? -1 : col >= visibleCols.length ? 1 : 0);
      if (row >= 0 && row < rows.length) {
        e.preventDefault();
        focus(row, (col + visibleCols.length) % visibleCols.length);
      }
      return;
    }
    if (e.key.length === 1 && !cmd && !e.altKey) {
      e.preventDefault();
      begin(t, visibleCols[c].key, e.key);
    }
  }
  function editorKey(e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, r: number, c: number) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      committedEditor.current = editor;
      setEditor(null);
      setError('');
      focus(r, c);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!editor) return;
      // Na última linha, Enter grava a célula e já cria a próxima tarefa, para digitar uma atrás da
      // outra; nas demais, desce uma linha como numa planilha.
      if (r === rows.length - 1 && canEdit && !filtering) {
        try {
          const committed = committedEditor.current === editor ? draft : applyCellsTo(draft, [editor]);
          const at = committed.tasks.findIndex(t => t.id === editor.id);
          stageInserted(insertBelow(committed, at), r + 1);
        } catch (err) {
          setError((err as Error).message);
          editRef.current?.focus();
        }
        return;
      }
      if (commit()) focus(r + 1, c);
      return;
    }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    if (!commit()) return;
    const next = c + (e.shiftKey ? -1 : 1),
      row = r + (next < 0 ? -1 : next >= visibleCols.length ? 1 : 0);
    if (row >= 0 && row < rows.length) {
      focus(row, (next + visibleCols.length) % visibleCols.length);
      return;
    }
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,a[href]',
      ),
    ).filter(el => !gridRef.current?.contains(el) && el.getClientRects().length);
    const target = e.shiftKey
      ? targets.filter(el => !!(el.compareDocumentPosition(gridRef.current!) & Node.DOCUMENT_POSITION_FOLLOWING)).at(-1)
      : targets.find(el => !!(el.compareDocumentPosition(gridRef.current!) & Node.DOCUMENT_POSITION_PRECEDING));
    requestAnimationFrame(() => target?.focus());
  }
  const show = (key: string, v: unknown) =>
    key === 'constraintType'
      ? (CONSTRAINT_LABELS[(v || 'ASAP') as ConstraintType] ?? String(v))
      : v === undefined || v === null || v === ''
        ? '—'
        : ['plannedStart', 'plannedEnd', 'anchorStart', 'constraintDate', 'deadline', 'actualStart', 'actualEnd'].includes(key)
          ? projectDate(String(v))
          : key === 'duration'
            ? formatDuration(v as TaskDuration)
            : key === 'teamId'
              ? teamLabel(String(v)) || '—'
              : key === 'progress'
                ? `${v}%`
                : String(v);

  // Sem memo de propósito: `rows` já muda a cada render, e a busca é barata.
  const activeId = active?.id;
  const path = showPath && activeId ? taskPath(activeId, draft.links, analysis.info) : undefined;
  const pathRole = (id: string): GanttRow['pathRole'] =>
    !path
      ? undefined
      : id === activeId
        ? 'selected'
        : path.driving.has(id)
          ? 'driving'
          : path.predecessors.has(id)
            ? 'predecessor'
            : path.driven.has(id)
              ? 'driven'
              : path.successors.has(id)
                ? 'successor'
                : undefined;
  const ganttRows: GanttRow[] = useMemo(
    () => [
      ...(planRow
        ? [
            {
              id: PLAN_ROW,
              name: plan.name,
              summary: true,
              milestone: false,
              level: -1,
              start: planRow.start,
              end: planRow.end,
              progress: planRow.progress,
              actualStart: planRow.actualStart,
              actualEnd: planRow.actualEnd,
              baseStart: baseId ? planRow.baseStart : undefined,
              baseEnd: baseId ? planRow.baseEnd : undefined,
              critical: anyCritical,
              lateFinish: analysis.projectFinish,
            },
          ]
        : []),
      ...rows.map(t => {
        const v = roll.get(t.id)!;
        const bv = baseFor(t.id);
        const ai = info(t.id);
        return {
          id: t.id,
          name: t.name,
          summary: v.summary,
          milestone: v.milestone,
          level: t.level,
          start: v.plannedStart,
          end: v.plannedEnd,
          progress: v.progress,
          actualStart: v.actualStart,
          actualEnd: v.actualEnd,
          baseStart: bv?.plannedStart,
          baseEnd: bv?.plannedEnd,
          outOfWindow: outOfWindow(t.id),
          critical: ai?.critical,
          deadline: v.summary ? undefined : t.deadline,
          deadlineMissed: ai?.deadlineMissed,
          lateFinish: ai?.lateFinish,
          totalSlack: ai?.totalSlack,
          freeSlack: ai?.freeSlack,
          conflict: ai?.conflict,
          pathRole: pathRole(t.id),
        };
      }),
    ],
    [rows, roll, planRow, baseId, baselineTasks, baselineRoll, analysis, path],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const ganttLinks: GanttLink[] = useMemo(
    () =>
      draft.links.map(l => ({
        id: l.id,
        from: l.predecessorId,
        to: l.successorId,
        type: l.type,
        driving: analysis.info.get(l.successorId)?.driverIds.includes(l.predecessorId),
      })),
    [draft.links, analysis],
  );
  const outside = draft.tasks.filter(t => outOfWindow(t.id)).length;
  const normalized = useMemo(() => {
    const raw = stored(data, plan).tasks;
    return original.tasks.filter(t => JSON.stringify(t) !== JSON.stringify(raw.find(r => r.id === t.id))).length;
  }, [data, plan, original]);
  const tableTotal = visibleCols.reduce((n, c) => n + (widths[c.key] ?? c.width), 0);

  const tool =
    'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';
  const group = 'flex flex-wrap items-center gap-0.5 border-r border-slate-200 pr-2 last:border-r-0';
  const kbd = 'rounded border border-slate-200 bg-slate-50 px-1 font-mono text-xs text-slate-700';
  const cellClass = (col: Col, summary: boolean) =>
    `${col.startsWith('base') ? 'text-slate-500' : ''} ${columns.find(c => c.key === col)?.right ? 'text-right' : ''} ${summary ? 'font-semibold text-slate-900' : ''}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 p-3">
        <div className="mr-auto">
          <h2 className="font-semibold text-slate-900">Cronograma do mês</h2>
          <p className="text-xs text-slate-500">
            Horizonte de três meses: {projectDate(win.start)} a {projectDate(win.end)}
            {plan.copiedFromPlanId
              ? ` · copiado de ${monthLabel(data.plans.find(p => p.id === plan.copiedFromPlanId)?.month ?? plan.month)}`
              : ''}
          </p>
        </div>
        <label data-tour="medio-mes" className="text-xs font-semibold text-slate-600">
          Mês{' '}
          <select
            className="field w-auto py-1.5"
            value={plan.id}
            disabled={dirty || !!editor || busy}
            onChange={e => choose(e.target.value)}
          >
            {plans.map(p => (
              <option key={p.id} value={p.id}>
                {monthLabel(p.month)} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <div data-tour="medio-salvar" className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span role="status" aria-live="polite" className={`text-xs ${dirty ? 'font-semibold text-warning' : 'text-slate-500'}`}>
            {busy ? 'Salvando…' : dirty ? `${changed.length + removed.length} tarefas alteradas · não salvo` : 'Tudo salvo'}
          </span>
          <button className="button" disabled={!dirty || readOnly || busy || !!editor} onClick={() => setReview(true)}>
            Revisar e salvar
          </button>
        </div>
      </div>
      <div
        className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-1.5"
        role="toolbar"
        aria-label="Ferramentas do cronograma"
      >
        <div className={group} data-tour="medio-edicao">
          <button
            className={tool}
            disabled={readOnly || busy || !!plan.frozenAt}
            aria-pressed={!locked}
            onClick={() => {
              if (editor && !commit()) return;
              setLocked(!locked);
            }}
            title="A grade abre bloqueada, contra alteração acidental em reunião"
          >
            {locked ? <Lock size={14} aria-hidden /> : <LockOpen size={14} aria-hidden />}
            {locked ? 'Liberar edição' : 'Bloquear'}
          </button>
          <button className={tool} disabled={!canEdit || !past.length} onClick={undo} title="Desfazer (Ctrl+Z)">
            <Undo2 size={14} aria-hidden />
            <span className="sr-only">Desfazer</span>
          </button>
          <button className={tool} disabled={!canEdit || !future.length} onClick={redo} title="Refazer (Ctrl+Y)">
            <Redo2 size={14} aria-hidden />
            <span className="sr-only">Refazer</span>
          </button>
        </div>
        <div className={group} aria-label="Tarefa">
          <button
            className={tool}
            data-tour="medio-inserir"
            disabled={!canEdit || !!editor || filtering}
            onClick={() => structural('insert')}
            title="Inserir tarefa abaixo da selecionada (Insert)"
          >
            <ListPlus size={14} aria-hidden />
            Inserir tarefa
          </button>
          <span data-tour="medio-recuo" className="inline-flex items-center gap-0.5">
            <button
              className={tool}
              disabled={!canEdit || !active || !!editor || filtering}
              onClick={() => structural('outdent')}
              title="Diminuir o recuo das linhas selecionadas (Alt+Shift+←)"
            >
              <IndentDecrease size={14} aria-hidden />
              <span className="sr-only">Diminuir recuo</span>
            </button>
            <button
              className={tool}
              disabled={!canEdit || !active || !!editor || filtering}
              onClick={() => structural('indent')}
              title="Recuar as linhas selecionadas, tornando-as subitens da de cima (Alt+Shift+→)"
            >
              <IndentIncrease size={14} aria-hidden />
              <span className="sr-only">Recuar tarefa</span>
            </button>
          </span>
          <span data-tour="medio-vinculos" className="inline-flex items-center gap-0.5">
            <button
              className={tool}
              disabled={!canEdit || !active || !!editor || filtering}
              onClick={() => structural('link')}
              title="Vincular as tarefas selecionadas em Término-Início (Ctrl+F2)"
            >
              <Link2 size={14} aria-hidden />
              Vincular
            </button>
            <button
              className={tool}
              disabled={!canEdit || !active || !!editor || filtering}
              onClick={() => structural('unlink')}
              title="Desvincular as tarefas selecionadas (Ctrl+Shift+F2)"
            >
              <Unlink2 size={14} aria-hidden />
              <span className="sr-only">Desvincular</span>
            </button>
          </span>
          <button
            data-tour="medio-excluir"
            className={`${tool} text-danger`}
            disabled={!canEdit || !active || !!editor || filtering}
            onClick={() => structural('remove')}
            title="Excluir tarefa e subitens"
          >
            <Trash2 size={14} aria-hidden />
            <span className="sr-only">Excluir tarefa</span>
          </button>
        </div>
        <div className={group} aria-label="Exibir">
          <label data-tour="medio-base-exibida" className="flex items-center gap-1 text-xs text-slate-600">
            Linha de base
            <select className="field w-auto py-1 text-xs" value={baseId} onChange={e => setBaseId(e.target.value)}>
              <option value="">Nenhuma</option>
              {baselines.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.frozenAt ? ` · ${formatDate(b.frozenAt.slice(0, 10))}` : ''}
                </option>
              ))}
            </select>
          </label>
          <span data-tour="medio-expandir" className="inline-flex items-center gap-0.5">
            <button className={tool} disabled={filtering} onClick={() => setFolded([])}>
              Expandir
            </button>
            <button
              className={tool}
              disabled={filtering}
              onClick={() => setFolded(draft.tasks.filter(t => roll.get(t.id)?.summary).map(t => t.id))}
            >
              Recolher
            </button>
          </span>
          <details className="relative" data-tour="medio-colunas">
            <summary className={`${tool} cursor-pointer list-none`}>Colunas</summary>
            <div className="absolute left-0 z-40 mt-1 grid w-56 gap-1.5 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl">
              {columns.map(c => (
                <label key={c.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(c.key) || c.key === 'name'}
                    disabled={c.key === 'name'}
                    onChange={e => setHidden(e.target.checked ? hidden.filter(k => k !== c.key) : [...hidden, c.key])}
                  />{' '}
                  {c.label}
                </label>
              ))}
              <button
                className="button-ghost mt-1"
                onClick={() => {
                  setHidden(DEFAULT_HIDDEN);
                  setOrder(DEFAULT_ORDER);
                  setWidths({});
                }}
              >
                Restaurar padrão
              </button>
            </div>
          </details>
          <span data-tour="medio-critico" className="inline-flex items-center gap-0.5">
            <button
              className={tool}
              aria-pressed={showCritical}
              onClick={() => setShowCritical(!showCritical)}
              title="Pinta de vermelho as tarefas sem folga no Gantt"
            >
              Caminho crítico
            </button>
            <button
              className={tool}
              aria-pressed={showSlack}
              onClick={() => setShowSlack(!showSlack)}
              title="Linha de folga depois da barra, até o término tardio"
            >
              Folga
            </button>
          </span>
          <button
            data-tour="medio-caminho"
            className={tool}
            aria-pressed={showPath}
            onClick={() => setShowPath(!showPath)}
            title="Realça predecessoras e sucessoras da tarefa selecionada; as determinantes em tom mais forte"
          >
            Caminho da tarefa
          </button>
          <button data-tour="medio-reuniao" className={tool} aria-pressed={meeting} onClick={() => setMeeting(!meeting)}>
            Modo reunião
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs">
        <span data-tour="medio-filtros" className="flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">Buscar tarefas</span>
            <input
              type="search"
              className="field w-56 py-1 text-xs"
              placeholder="Buscar tarefa, recurso ou anotação"
              value={query}
              disabled={!!editor}
              onChange={e => {
                setQuery(e.target.value);
                setSelected({ row: 0, col: selected.col });
              }}
            />
          </label>
          <label>
            <span className="sr-only">Filtrar por situação</span>
            <select
              className="field w-auto py-1 text-xs"
              value={status}
              disabled={!!editor}
              onChange={e => {
                setStatus(e.target.value);
                setSelected({ row: 0, col: selected.col });
              }}
            >
              {[
                ['all', 'Todas as tarefas'],
                ['zero', 'Não iniciadas'],
                ['ongoing', 'Em andamento'],
                ['done', 'Concluídas'],
                ['late', 'Atrasadas'],
                ['critical', 'Críticas'],
                ['conflict', 'Com vínculo desrespeitado'],
                ['deadline', 'Prazo final perdido'],
                ['window', 'Fora do horizonte'],
                ['changed', 'Alteradas no rascunho'],
                ['notes', 'Com anotações'],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar por recurso</span>
            <select
              className="field w-auto py-1 text-xs"
              value={team}
              disabled={!!editor}
              onChange={e => {
                setTeam(e.target.value);
                setSelected({ row: 0, col: selected.col });
              }}
            >
              <option value="">Todos os recursos</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>
                  {t.company} · {t.name}
                </option>
              ))}
            </select>
          </label>
        </span>
        {!hidden.includes('target') && (
          <label data-tour="medio-referencia" className="flex items-center gap-1 text-slate-600">
            Referência do % alvo
            <input
              className="field w-auto py-1 text-xs"
              type="date"
              value={reference}
              onChange={e => {
                if (e.target.value) setReference(e.target.value);
              }}
            />
          </label>
        )}
        <span data-tour="medio-atalhos" className="ml-auto flex items-center gap-0.5 text-slate-500">
          Atalhos
          <HelpNote title="Atalhos do teclado" label="Atalhos do teclado" compact align="end">
            <p>
              <kbd className={kbd}>F2</kbd> ou <kbd className={kbd}>Enter</kbd> edita a célula; digitar direto também começa a edição.{' '}
              <kbd className={kbd}>Esc</kbd> cancela.
            </p>
            <p>
              <kbd className={kbd}>Insert</kbd> insere uma tarefa abaixo da selecionada; <kbd className={kbd}>Enter</kbd> na última linha
              grava e cria a próxima. <kbd className={kbd}>Alt+Shift+→</kbd> ou <kbd className={kbd}>Cmd+Alt+→</kbd> recua,{' '}
              <kbd className={kbd}>Alt+Shift+←</kbd> ou <kbd className={kbd}>Cmd+Alt+←</kbd> diminui o recuo; com um intervalo selecionado,
              os dois agem em todas as linhas dele.
            </p>
            <p>
              <kbd className={kbd}>Ctrl+F2</kbd> vincula as tarefas selecionadas em Término-Início; <kbd className={kbd}>Ctrl+Shift+F2</kbd>{' '}
              desvincula.
            </p>
            <p>
              <kbd className={kbd}>Shift+setas</kbd> seleciona um intervalo; <kbd className={kbd}>Ctrl+C</kbd> e{' '}
              <kbd className={kbd}>Ctrl+V</kbd> copiam e colam como na planilha; <kbd className={kbd}>Ctrl+D</kbd> preenche abaixo.
            </p>
            <p>
              <kbd className={kbd}>Ctrl+Z</kbd> desfaz e <kbd className={kbd}>Ctrl+Y</kbd> refaz. <kbd className={kbd}>Ctrl+Home</kbd> e{' '}
              <kbd className={kbd}>Ctrl+End</kbd> vão à primeira e à última linha.
            </p>
            <p>
              Arraste o cabeçalho para mudar a ordem das colunas; com o foco no cabeçalho, <kbd className={kbd}>Alt+←</kbd> e{' '}
              <kbd className={kbd}>Alt+→</kbd> também movem a coluna.
            </p>
          </HelpNote>
        </span>
      </div>
      {normalized > 0 && (
        <p className="border-b border-primary-ring bg-primary-soft px-3 py-2 text-xs text-primary-ink">
          {normalized} {normalized === 1 ? 'tarefa foi ajustada' : 'tarefas foram ajustadas'} à regra do Project ao abrir: % concluída sem
          início real recebe o início previsto, e o “Não iniciar antes de” antigo vira “Tipo de restrição” e passa a valer junto das
          predecessoras. O ajuste é gravado no próximo “Revisar e salvar”.
        </p>
      )}
      {error && (
        <p id="schedule-error" role="alert" className="border-b border-danger-ring bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {outside > 0 && (
        <p className="border-b border-warning-ring bg-warning-soft px-3 py-2 text-xs text-amber-900">
          <CircleAlert size={13} className="mr-1 inline text-warning" aria-hidden />
          {outside} {outside === 1 ? 'tarefa está' : 'tarefas estão'} fora do horizonte de três meses ({projectDate(win.start)} a{' '}
          {projectDate(win.end)}). O filtro “Fora do horizonte” mostra quais.
        </p>
      )}

      <div
        className="flex h-[68vh] min-h-[320px] border-b border-slate-200"
        onCopy={e => {
          if (editor) return;
          e.preventDefault();
          const text = encodeGrid(
            rows.slice(bounds.r0, bounds.r1 + 1).map(t => visibleCols.slice(bounds.c0, bounds.c1 + 1).map(c => raw(t, c.key))),
          );
          e.clipboardData.setData('text/plain', text);
        }}
        onPaste={e => {
          if (editor) return;
          e.preventDefault();
          try {
            const matrix = decodeGrid(e.clipboardData.getData('text/plain'));
            const entries = matrix.flatMap((line, r) =>
              line.map((text, c) => {
                const t = rows[selected.row + r],
                  col = visibleCols[selected.col + c];
                if (!t || !col) throw new Error('Colagem ultrapassa a grade.');
                return { id: t.id, key: col.key, text };
              }),
            );
            applyCells(entries);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        {presentation !== 'chart' && (
          <div
            ref={tableScroll}
            onScroll={e => sync(e.currentTarget, chartScroll.current)}
            className="min-w-0 overflow-auto"
            style={{
              width: presentation === 'split' ? Math.min(tableWidth, tableTotal + 2) : '100%',
              flex: presentation === 'split' ? 'none' : '1',
              overflowX: 'scroll',
            }}
            role="region"
            aria-label="Tabela do cronograma"
            data-tour="medio-tabela"
            tabIndex={-1}
          >
            <table
              ref={gridRef}
              className="schedule-grid project-grid"
              role="grid"
              aria-label="Cronograma de médio prazo"
              aria-multiselectable="true"
              style={{ width: tableTotal }}
            >
              <thead>
                <tr>
                  {visibleCols.map((c, i) => {
                    // Id e Indicadores ficam presas no começo (FIXED_COLS); as outras se arrastam pelo
                    // cabeçalho e caem antes ou depois da coluna alvo conforme a metade em que forem soltas.
                    const fixed = FIXED_COLS.includes(c.key);
                    const side = (e: React.DragEvent<HTMLElement>) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      return fixed || e.clientX > r.left + r.width / 2;
                    };
                    const target = drop?.key === c.key ? drop : undefined;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        data-col={c.key}
                        tabIndex={0}
                        draggable={!fixed}
                        aria-label={fixed ? `Coluna ${c.label}, fixa` : `Coluna ${c.label}; arraste ou use Alt com as setas para mover`}
                        title={fixed ? undefined : 'Arraste para mover a coluna; com o foco aqui, Alt+← e Alt+→ também movem'}
                        style={{ width: widths[c.key] ?? c.width }}
                        className={`${c.right ? 'text-right' : ''} ${fixed ? '' : 'cursor-grab'} ${dragCol === c.key ? 'opacity-50' : ''} ${
                          target
                            ? target.after
                              ? 'shadow-[inset_-3px_0_var(--color-primary)]'
                              : 'shadow-[inset_3px_0_var(--color-primary)]'
                            : ''
                        }`}
                        onDragStart={e => {
                          e.dataTransfer.setData('text/plain', c.key);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragCol(c.key);
                        }}
                        onDragEnd={() => {
                          setDragCol(null);
                          setDrop(null);
                        }}
                        onDragOver={e => {
                          if (!dragCol || dragCol === c.key) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          const after = side(e);
                          setDrop(d => (d && d.key === c.key && d.after === after ? d : { key: c.key, after }));
                        }}
                        onDragLeave={e => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(d => (d?.key === c.key ? null : d));
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          const key = dragCol ?? (e.dataTransfer.getData('text/plain') as Col);
                          if (key && key in COLUMN && key !== c.key) reorder(moveColumn(order, key, c.key, side(e)));
                          setDragCol(null);
                          setDrop(null);
                        }}
                        onKeyDown={e => {
                          // Só com o foco no próprio cabeçalho: no separador, as setas mudam a largura.
                          if (e.target !== e.currentTarget || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
                          e.preventDefault();
                          const neighbor = visibleCols[e.key === 'ArrowRight' ? i + 1 : i - 1];
                          if (!neighbor) return;
                          reorder(moveColumn(order, c.key, neighbor.key, e.key === 'ArrowRight'));
                          // Mover o nó no DOM tira o foco dele; devolve depois da nova pintura.
                          requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`th[data-col="${c.key}"]`)?.focus());
                        }}
                      >
                        {c.key === 'ind' ? (
                          <span title="Indicadores" data-tour="medio-col-indicadores">
                            <span aria-hidden>ⓘ</span>
                            <span className="sr-only">Indicadores</span>
                          </span>
                        ) : (
                          <ColumnLabel column={c} />
                        )}
                        <span
                          role="separator"
                          aria-label={`Largura de ${c.label}`}
                          aria-orientation="vertical"
                          aria-valuemin={36}
                          aria-valuemax={600}
                          aria-valuenow={widths[c.key] ?? c.width}
                          tabIndex={0}
                          draggable={false}
                          className="schedule-resize"
                          // O arrasto para redimensionar usa captura de ponteiro; cancelar o mousedown impede
                          // que o navegador comece o arrasto de coluna a partir do separador.
                          onMouseDown={e => e.preventDefault()}
                          onKeyDown={e => {
                            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                              e.preventDefault();
                              setWidths(w => ({
                                ...w,
                                [c.key]: Math.max(36, Math.min(600, (w[c.key] ?? c.width) + (e.key === 'ArrowRight' ? 10 : -10))),
                              }));
                            }
                          }}
                          onPointerDown={e => {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            e.currentTarget.dataset.x = String(e.clientX);
                            e.currentTarget.dataset.width = String(widths[c.key] ?? c.width);
                          }}
                          onPointerMove={e => {
                            if (e.currentTarget.hasPointerCapture(e.pointerId))
                              setWidths(w => ({
                                ...w,
                                [c.key]: Math.max(
                                  36,
                                  Math.min(600, Number(e.currentTarget.dataset.width) + e.clientX - Number(e.currentTarget.dataset.x)),
                                ),
                              }));
                          }}
                        />
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {planRow && (
                  <tr className="project-plan-row" data-tour="medio-linha-resumo" aria-label={`Resumo do cronograma: ${plan.name}`}>
                    {visibleCols.map(col => (
                      <td
                        key={col.key}
                        aria-readonly
                        className={cellClass(col.key, true)}
                        title={col.key === 'name' ? 'Resumo do cronograma inteiro, calculado das tarefas' : undefined}
                      >
                        {col.key === 'name' ? (
                          <span className="flex items-center gap-1">
                            <ChevronDown size={13} className="shrink-0 text-slate-400" aria-hidden />
                            {planRaw(col.key)}
                          </span>
                        ) : (
                          planRaw(col.key)
                        )}
                      </td>
                    ))}
                  </tr>
                )}
                {rows.map((t, r) => {
                  const v = roll.get(t.id)!;
                  const isSelected = r === selected.row;
                  return (
                    <tr key={t.id} className={isSelected ? 'project-row-selected' : ''}>
                      {visibleCols.map((col, c) => {
                        const editing = editor?.id === t.id && editor.key === col.key;
                        const selectedCell = r >= bounds.r0 && r <= bounds.r1 && c >= bounds.c0 && c <= bounds.c1;
                        const old = original.tasks.find(o => o.id === t.id);
                        const field =
                          ({ start: 'plannedStart', end: 'plannedEnd', team: 'teamId' } as Record<string, string>)[col.key] ?? col.key;
                        const modified =
                          col.key === 'links'
                            ? JSON.stringify(original.links.filter(l => l.successorId === t.id)) !==
                              JSON.stringify(draft.links.filter(l => l.successorId === t.id))
                            : JSON.stringify(old?.[field as keyof PlanTask]) !== JSON.stringify(t[field as keyof PlanTask]);
                        const text = raw(t, col.key);
                        return (
                          <td
                            key={col.key}
                            role="gridcell"
                            data-pos={`${r}:${c}`}
                            tabIndex={selected.row === r && selected.col === c ? 0 : -1}
                            aria-selected={selectedCell}
                            aria-readonly={!editable(t, col.key)}
                            title={`${text}${v.summary && LEAF_ONLY.includes(col.key) ? ' · Resumo calculado das subtarefas' : ''}${modified ? ' · Alteração não salva' : ''}`}
                            className={`${cellClass(col.key, v.summary)} ${selectedCell ? 'schedule-selected' : ''} ${modified ? 'schedule-modified' : ''}`}
                            onClick={e => {
                              if (editor && !editing && !commit()) return;
                              setSelected({ row: r, col: c });
                              if (!e.shiftKey) setAnchor({ row: r, col: c });
                            }}
                            onDoubleClick={() => begin(t, col.key)}
                            onKeyDown={e => keyDown(e, t, r, c)}
                          >
                            {editing ? (
                              col.key === 'team' ? (
                                <select
                                  ref={editRef}
                                  aria-label={`Recurso de ${t.name}`}
                                  value={editor.text}
                                  onChange={e => setEditor({ ...editor, text: e.target.value })}
                                  onBlur={commit}
                                  onKeyDown={e => editorKey(e, r, c)}
                                >
                                  <option value="">Sem recurso</option>
                                  {teams.map(team => (
                                    <option key={team.id} value={team.id}>
                                      {team.company} · {team.name}
                                    </option>
                                  ))}
                                </select>
                              ) : col.key === 'constraintType' ? (
                                <select
                                  ref={editRef}
                                  aria-label={`Tipo de restrição de ${t.name}`}
                                  value={editor.text}
                                  onChange={e => setEditor({ ...editor, text: e.target.value })}
                                  onBlur={commit}
                                  onKeyDown={e => editorKey(e, r, c)}
                                >
                                  {CONSTRAINT_TYPES.map(type => (
                                    <option key={type} value={type}>
                                      {CONSTRAINT_LABELS[type]}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  ref={editRef}
                                  aria-label={`${col.label} de ${t.name}`}
                                  aria-invalid={!!error}
                                  aria-describedby={error ? 'schedule-error' : undefined}
                                  value={editor.text}
                                  placeholder={DATE_COLS.includes(col.key) ? 'dd/mm/aa ou vazio' : undefined}
                                  onChange={e => setEditor({ ...editor, text: e.target.value })}
                                  onBlur={commit}
                                  onKeyDown={e => editorKey(e, r, c)}
                                />
                              )
                            ) : col.key === 'name' ? (
                              <div className="flex items-center gap-1 truncate" style={{ paddingLeft: t.level * 16 }}>
                                {v.summary ? (
                                  <button
                                    tabIndex={-1}
                                    aria-label={`${folded.includes(t.id) ? 'Expandir' : 'Recolher'} ${t.name}`}
                                    className="shrink-0 text-slate-500 hover:text-slate-900 disabled:opacity-40"
                                    disabled={filtering}
                                    onClick={e => {
                                      e.stopPropagation();
                                      setFolded(f => (f.includes(t.id) ? f.filter(id => id !== t.id) : [...f, t.id]));
                                    }}
                                  >
                                    {folded.includes(t.id) ? <ChevronRight size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
                                  </button>
                                ) : (
                                  <span className="w-[13px] shrink-0" />
                                )}
                                <span className="shrink-0 text-slate-400">{v.number}</span>
                                <span className="truncate">{t.name}</span>
                              </div>
                            ) : col.key === 'ind' ? (
                              <Indicators
                                done={v.progress === 100}
                                constraint={v.summary ? undefined : constraintOf(t)}
                                holding={info(t.id)?.drivenBy === 'constraint'}
                                deadline={info(t.id)?.deadlineMissed ? t.deadline : undefined}
                                conflict={!!info(t.id)?.conflict}
                                outside={outOfWindow(t.id)}
                                notes={!!t.notes}
                              />
                            ) : (
                              <span className={col.key === 'id' ? 'text-slate-400' : ''}>{text}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && (
              <p className="p-5 text-sm text-slate-600">
                {filtering ? 'Nenhuma tarefa neste filtro.' : 'Cronograma vazio. Libere a edição e use “Inserir tarefa”.'}
              </p>
            )}
          </div>
        )}
        {presentation === 'split' && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Divisão entre tabela e Gantt"
            aria-valuenow={tableWidth}
            aria-valuemin={240}
            aria-valuemax={2400}
            tabIndex={0}
            className="w-1.5 shrink-0 cursor-col-resize bg-slate-200 hover:bg-primary-ring focus:bg-primary focus:outline-none"
            onKeyDown={e => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                setTableWidth(w => Math.max(240, Math.min(2400, w + (e.key === 'ArrowRight' ? 40 : -40))));
              }
            }}
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId);
              e.currentTarget.dataset.x = String(e.clientX);
              e.currentTarget.dataset.width = String(Math.min(tableWidth, tableTotal + 2));
            }}
            onPointerMove={e => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                setTableWidth(
                  Math.max(240, Math.min(2400, Number(e.currentTarget.dataset.width) + e.clientX - Number(e.currentTarget.dataset.x))),
                );
            }}
          />
        )}
        {presentation !== 'table' && (
          <GanttChart
            rows={ganttRows}
            links={ganttLinks}
            window={win}
            today={today}
            zoom={zoom}
            rowHeight={metrics.row}
            headerHeight={metrics.head}
            calendar={draft.calendar}
            showBaseline={!!baseId}
            showCritical={showCritical}
            showSlack={showSlack}
            showPath={showPath}
            selectedId={active?.id}
            onSelect={id => {
              if (id === PLAN_ROW) return;
              const r = rows.findIndex(t => t.id === id);
              if (r >= 0) {
                if (editor && !commit()) return;
                setSelected({ row: r, col: selected.col });
                setAnchor({ row: r, col: selected.col });
              }
            }}
            scrollRef={chartScroll}
            onScroll={e => sync(e.currentTarget, tableScroll.current)}
            className="min-w-0 flex-1"
          />
        )}
      </div>
      <div
        data-tour="medio-status"
        className="flex flex-wrap items-center gap-3 bg-slate-100 px-3 py-1 text-xs text-slate-600"
        aria-label="Barra de status"
      >
        <span>
          Novas tarefas: <strong>Agendadas automaticamente</strong>
        </span>
        <span>
          {draft.tasks.length} tarefas · {draft.links.length} vínculos · {criticalCount} críticas
        </span>
        {analysis.projectFinish && <span>Fim do projeto: {projectDate(analysis.projectFinish)}</span>}
        {!draft.tasks.some(t => t.progress > 0) && <span>Sem avanço lançado ainda</span>}
        <div className="ml-auto flex items-center gap-1" aria-label="Modo de exibição">
          {(
            [
              { id: 'split', label: 'Tabela e Gantt', Icon: PanelLeft },
              { id: 'table', label: 'Somente tabela', Icon: Table2 },
              { id: 'chart', label: 'Somente Gantt', Icon: ChartGantt },
            ] as const
          ).map(m => (
            <button
              key={m.id}
              type="button"
              className={`flex h-7 w-8 items-center justify-center rounded ${presentation === m.id ? 'bg-white text-primary-ink shadow-sm' : 'hover:bg-white/70'}`}
              aria-label={m.label}
              title={m.label}
              aria-pressed={presentation === m.id}
              onClick={() => setPresentation(m.id)}
            >
              <m.Icon size={15} aria-hidden />
            </button>
          ))}
          {presentation !== 'table' && (
            <span className="ml-2 flex items-center gap-0.5" aria-label="Escala do Gantt">
              {(
                [
                  ['dia', 'Dias'],
                  ['semana', 'Semanas'],
                  ['mes', 'Meses'],
                ] as const
              ).map(([z, l]) => (
                <button
                  key={z}
                  type="button"
                  className={`h-7 rounded px-2 ${zoom === z ? 'bg-white font-semibold text-primary-ink shadow-sm' : 'hover:bg-white/70'}`}
                  aria-pressed={zoom === z}
                  onClick={() => setZoom(z)}
                >
                  {l}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>

      {active && (
        <aside
          data-tour="medio-detalhes"
          className={fullDetails ? 'fixed inset-0 z-40 overflow-auto bg-white p-5' : 'border-t border-slate-200 bg-slate-50 p-4'}
          aria-label="Detalhes da tarefa"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-sm font-bold text-slate-900">
              {roll.get(active.id)?.number} · {active.name}
            </h3>
            <button className="button-ghost" onClick={() => setFullDetails(!fullDetails)}>
              {fullDetails ? 'Fechar tela cheia' : 'Detalhes em tela cheia'}
            </button>
            {meeting && (
              <span data-tour="medio-reuniao-navegar" className="flex flex-wrap items-center gap-2">
                <button className="button-ghost" onClick={() => focus(selected.row - 1, selected.col)}>
                  Anterior
                </button>
                <button className="button-ghost" onClick={() => focus(selected.row + 1, selected.col)}>
                  Próxima
                </button>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={reviewed.includes(active.id)}
                    onChange={e => setReviewed(e.target.checked ? [...reviewed, active.id] : reviewed.filter(id => id !== active.id))}
                  />{' '}
                  Revisado nesta reunião
                </label>
              </span>
            )}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            {raw(active, 'start')} a {raw(active, 'end')} · {raw(active, 'duration')} · {raw(active, 'progress')} concluída · Início real{' '}
            {raw(active, 'actualStart')} · Término real {raw(active, 'actualEnd')} · Predecessoras {raw(active, 'links') || '—'}
            {baseId ? ` · Variação contra a base ${raw(active, 'variance') || '—'} dias` : ''}
          </p>
          {info(active.id) && (
            <p className="mt-1 text-sm leading-6 text-slate-700">
              Início tardio {raw(active, 'lateStart')} · Término tardio {raw(active, 'lateFinish')} · Folga total{' '}
              {raw(active, 'totalSlack')} · Folga livre {raw(active, 'freeSlack')} · Crítica {raw(active, 'critical')}
              {!roll.get(active.id)?.summary && constraintOf(active).type !== 'ASAP'
                ? ` · Restrição: ${constraintText(constraintOf(active))}`
                : ''}
              {active.deadline ? ` · Prazo final: ${projectDate(active.deadline)}` : ''}
              {info(active.id)?.drivenBy === 'network'
                ? ` · Predecessoras determinantes: ${info(active.id)!
                    .driverIds.map(id => draft.tasks.findIndex(t => t.id === id) + 1)
                    .join('; ')}`
                : ''}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500">
            % alvo em {formatDate(reference)}: {raw(active, 'target')} — leitura de tempo decorrido, não medição física.
          </p>
          <div data-tour="medio-anotacoes" className="mt-4">
            <label className="block text-xs font-semibold text-slate-600">
              Anotações e encaminhamentos
              <textarea
                key={active.id}
                className="field mt-1.5 min-h-24 whitespace-pre-wrap font-normal"
                readOnly={!canEdit}
                value={active.notes ?? ''}
                onChange={e => {
                  try {
                    applyCells([{ id: active.id, key: 'notes', text: e.target.value }]);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />
            </label>
            <button
              className="button-ghost mt-2"
              disabled={!canEdit || !active.notes}
              onClick={() =>
                applyCells([
                  {
                    id: active.id,
                    key: 'notes',
                    text: active
                      .notes!.split('\n')
                      .map(l => (l.trim() ? `• ${l}` : l))
                      .join('\n'),
                  },
                ])
              }
            >
              Transformar linhas em tópicos
            </button>
          </div>
          <details
            data-tour="medio-historico-tarefa"
            className="mt-4"
            open={historyOpen}
            onToggle={e => setHistoryOpen(e.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Histórico da tarefa</summary>
            {historyOpen && <TaskHistory workId={plan.workId} taskId={active.id} users={data.users} show={show} />}
          </details>
        </aside>
      )}
      <details data-tour="medio-calendario" className="border-t border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-slate-700">Calendário de trabalho</summary>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map(day => (
            <label key={day}>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={draft.calendar.weekdays.includes(day)}
                onChange={e => {
                  const calendar = {
                    ...draft.calendar,
                    weekdays: e.target.checked ? [...draft.calendar.weekdays, day] : draft.calendar.weekdays.filter(d => d !== day),
                  };
                  try {
                    stage({ ...draft, calendar, tasks: scheduleTasks(draft.tasks, draft.links, calendar) });
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />{' '}
              {WEEKDAYS[day]}
            </label>
          ))}
          {(['hoursPerDay', 'daysPerMonth'] as const).map(key => (
            <label key={key}>
              {key === 'hoursPerDay' ? 'Horas por dia' : 'Dias por mês'}
              <input
                className="field w-24"
                type="number"
                disabled={!canEdit}
                value={draft.calendar[key]}
                onChange={e => {
                  const calendar = { ...draft.calendar, [key]: Number(e.target.value) };
                  try {
                    stage({ ...draft, calendar, tasks: scheduleTasks(draft.tasks, draft.links, calendar) });
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              />
            </label>
          ))}
          <label>
            Feriados (AAAA-MM-DD, separados por vírgula)
            <input
              key={draft.calendar.holidays.join(',')}
              className="field"
              defaultValue={draft.calendar.holidays.join(', ')}
              disabled={!canEdit}
              onBlur={e => {
                const calendar = {
                  ...draft.calendar,
                  holidays: e.target.value
                    .split(',')
                    .map(d => d.trim())
                    .filter(Boolean),
                };
                try {
                  stage({ ...draft, calendar, tasks: scheduleTasks(draft.tasks, draft.links, calendar) });
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </label>
          <HelpNote title="Formatos aceitos" label="Durações e predecessoras">
            <p>Duração aceita “10 dias”, “10 dias corridos”, “8h”, “1 mês” e “0 dias” (marco).</p>
            <p>
              Predecessoras usam o Id da linha, como no Project: “12”, “12;14”, “27TI+6 dias”, “12II+2 dias corridos”, “5TT-1 dia”. Vínculos
              ficam nas subtarefas, não nos resumos.
            </p>
            <p>
              Tipo de restrição aceita o nome do Project ou a sigla: NIAD, NIDD, NTAD, NTDD, DIE, DTE, OMBP, OMTP. Digitar o início cria
              “Não iniciar antes de”; digitar o término, “Não terminar antes de”. Prazo final não move a tarefa: reduz a folga e acende o
              indicador quando o término passa dele.
            </p>
          </HelpNote>
        </div>
      </details>
      <div className="flex flex-wrap gap-3 border-t border-slate-200 p-3">
        <button
          type="button"
          data-tour="medio-exportar"
          className="button-ghost inline-flex items-center gap-1.5"
          disabled={!draft.tasks.length}
          onClick={exportXml}
          title="Baixa o cronograma como XML do Project, com restrições, prazos, folgas e caminho crítico"
        >
          <Download size={14} aria-hidden /> Exportar para o Project (.xml)
        </button>
        {!readOnly && !dirty && !editor && (
          <>
            <span data-tour="medio-definir-base" className="inline-flex">
              <CommandForm
                title="Definir linha de base"
                description="Congela as datas de hoje como referência: a tabela e o Gantt passam a mostrar a variação contra ela."
                submit="Salvar linha de base"
                icon="none"
                trigger={
                  <>
                    <Flag size={14} aria-hidden /> Definir linha de base
                  </>
                }
                success="Linha de base definida"
                onDone={setBaseId}
                command={d => ({ type: 'freeze_plan_baseline', planId: plan.id, name: value(d, 'name') })}
              >
                <TextField name="name" label="Nome da linha de base" defaultValue={`Base ${formatDate(today)}`} />
              </CommandForm>
            </span>
            <span data-tour="medio-novo-plano" className="inline-flex">
              <NewPlanForm workId={plan.workId} plans={plans} today={today} onDone={choose} />
            </span>
          </>
        )}
        {dirty && (
          <button
            data-tour="medio-descartar"
            className="button-ghost"
            disabled={busy}
            onClick={async () => {
              if (
                await confirm({
                  title: 'Descartar todas as alterações não salvas?',
                  description: `${changed.length + removed.length} ${changed.length + removed.length === 1 ? 'tarefa volta' : 'tarefas voltam'} ao que está gravado.`,
                  confirmLabel: 'Descartar',
                  cancelLabel: 'Manter rascunho',
                  tone: 'danger',
                })
              ) {
                setDraft(original);
                setPast([]);
                setFuture([]);
                setEditor(null);
              }
            }}
          >
            Descartar rascunho
          </button>
        )}
      </div>
      <dialog
        ref={reviewDialog}
        aria-labelledby="schedule-review-title"
        onCancel={e => {
          e.preventDefault();
          if (!busy) setReview(false);
        }}
        className="m-auto max-h-[90vh] w-[min(95vw,48rem)] rounded-2xl border border-slate-200 p-0 shadow-xl backdrop:bg-slate-900/55"
      >
        <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5">
          <h3 id="schedule-review-title" className="text-sm font-bold text-slate-900">
            Revisar atualização
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-slate-600">
            {changed.length} tarefas alteradas, {removed.length} excluídas. As datas das sucessoras já foram reagendadas pela rede.
          </p>
          <ul className="mt-3 max-h-60 overflow-auto rounded-lg border border-slate-200 text-xs">
            {changed.map(t => {
              const old = original.tasks.find(o => o.id === t.id);
              const before = old ? linkText(original.tasks, original.links, t.id) : '';
              const after = linkText(draft.tasks, draft.links, t.id);
              return (
                <li key={t.id} className="border-b border-slate-100 px-3 py-2 last:border-b-0">
                  <strong className="text-slate-900">
                    {draft.tasks.indexOf(t) + 1} · {t.name}
                  </strong>
                  {!old && <span className="ml-2 font-semibold text-success">nova</span>}
                  {(
                    [
                      'name',
                      'plannedStart',
                      'plannedEnd',
                      'duration',
                      'anchorStart',
                      'constraintType',
                      'constraintDate',
                      'deadline',
                      'actualStart',
                      'actualEnd',
                      'teamId',
                      'progress',
                      'notes',
                      'level',
                    ] as const
                  )
                    .filter(k => old && JSON.stringify(old[k]) !== JSON.stringify(t[k]))
                    .map(k => (
                      <p key={k} className="text-slate-600">
                        {fieldLabels[k]}: {show(k, old?.[k])} → {show(k, t[k])}
                      </p>
                    ))}
                  {before !== after && (
                    <p className="text-slate-600">
                      Predecessoras: {before || '—'} → {after || '—'}
                    </p>
                  )}
                </li>
              );
            })}
            {removed.map(t => (
              <li key={t.id} className="border-b border-slate-100 px-3 py-2 font-semibold text-danger last:border-b-0">
                Excluir: {t.name}
              </li>
            ))}
          </ul>
          {JSON.stringify(draft.calendar) !== JSON.stringify(original.calendar) && (
            <p className="mt-2 text-sm text-slate-600">Calendário alterado nesta revisão.</p>
          )}
          {normalized > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              Também vão ao banco {normalized} {normalized === 1 ? 'tarefa ajustada' : 'tarefas ajustadas'} à regra do Project ao abrir o
              cronograma.
            </p>
          )}
          <label className="mt-4 block text-xs font-semibold text-slate-600">
            Motivo da atualização
            <textarea className="field mt-1.5 font-normal" value={reason} onChange={e => setReason(e.target.value)} required />
          </label>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button className="button-ghost" disabled={busy} onClick={() => setReview(false)}>
              Voltar ao rascunho
            </button>
            <button className="button" disabled={busy || !reason.trim()} onClick={save}>
              {busy ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Rótulo do cabeçalho, com a marca do tour "Como usar" nas colunas que ele explica. Cada marca vai
 * escrita por extenso porque tests/tour-targets.test.ts procura o texto `data-tour="…"` no código. */
function ColumnLabel({ column }: { column: Column }) {
  switch (column.key) {
    case 'progress':
      return <span data-tour="medio-col-avanco">{column.label}</span>;
    case 'duration':
      return <span data-tour="medio-col-duracao">{column.label}</span>;
    case 'actualStart':
      return <span data-tour="medio-col-reais">{column.label}</span>;
    case 'start':
      return <span data-tour="medio-col-datas">{column.label}</span>;
    case 'links':
      return <span data-tour="medio-col-predecessoras">{column.label}</span>;
    case 'team':
      return <span data-tour="medio-col-recursos">{column.label}</span>;
    case 'lateStart':
      return <span data-tour="medio-col-tardias">{column.label}</span>;
    case 'totalSlack':
      return <span data-tour="medio-col-folgas">{column.label}</span>;
    case 'constraintType':
      return <span data-tour="medio-col-restricao">{column.label}</span>;
    case 'deadline':
      return <span data-tour="medio-col-prazo">{column.label}</span>;
    case 'target':
      return <span data-tour="medio-col-alvo">{column.label}</span>;
    case 'variance':
      return <span data-tour="medio-col-variacao">{column.label}</span>;
    default:
      return <>{column.label}</>;
  }
}

/** Coluna de indicadores do Project: ícone e texto, nunca só cor. A restrição aparece sempre que não
 * é "O mais breve possível", no tom da flexibilidade (semiflexível em azul, inflexível em vermelho,
 * "O mais tarde possível" em cinza), e diz quando é ela que está segurando a data. */
function Indicators({
  done,
  constraint,
  holding,
  deadline,
  conflict,
  outside,
  notes,
}: {
  done: boolean;
  constraint?: { type: ConstraintType; date?: string };
  holding?: boolean;
  deadline?: string;
  conflict: boolean;
  outside: boolean;
  notes: boolean;
}) {
  const flexibility = constraint ? constraintFlexibility(constraint.type) : 'flexible';
  const items = [
    done && { Icon: Check, label: 'Tarefa concluída', tone: 'text-success' },
    constraint &&
      constraint.type !== 'ASAP' && {
        Icon: CalendarClock,
        label: `${constraintText(constraint)}${holding ? ' · segurando a data' : ''}`,
        tone: flexibility === 'inflexible' ? 'text-danger' : flexibility === 'semi' ? 'text-primary' : 'text-slate-500',
      },
    deadline && { Icon: TriangleAlert, label: `Prazo final perdido: termina depois de ${projectDate(deadline)}`, tone: 'text-danger' },
    conflict && {
      Icon: Link2Off,
      label: 'Vínculo desrespeitado: a restrição ou a data real prendem a tarefa antes do que a predecessora permite',
      tone: 'text-danger',
    },
    outside && { Icon: CircleAlert, label: 'Fora do horizonte de três meses', tone: 'text-warning' },
    notes && { Icon: StickyNote, label: 'Tem anotações', tone: 'text-slate-500' },
  ].filter(Boolean) as { Icon: typeof Check; label: string; tone: string }[];
  return (
    <span className="flex items-center gap-0.5">
      {items.map(({ Icon, label, tone }) => (
        <span key={label} title={label} className={tone}>
          <Icon size={13} aria-hidden />
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </span>
  );
}

/** Revisões de uma tarefa, lidas de /api/history: o histórico saiu do snapshot (chega vazio do
 * servidor) e só é pedido com o painel aberto. A ordem já vem do servidor, da mais recente para a
 * mais antiga. `show` é a formatação da tela (datas no formato do Project, recurso pelo nome). */
function TaskHistory({
  workId,
  taskId,
  users,
  show,
}: {
  workId: string;
  taskId: string;
  users: User[];
  show: (key: string, v: unknown) => string;
}) {
  const ids = useMemo(() => [taskId], [taskId]);
  const { status, events, reload } = useHistory(workId, ids, { action: 'plan_task_revision', limit: 50 });
  if (status === 'loading' && !events.length)
    return (
      <p role="status" className="mt-2 text-xs text-slate-500">
        Carregando histórico…
      </p>
    );
  if (status === 'error')
    return (
      <p role="alert" className="mt-2 text-xs text-danger">
        Não foi possível carregar o histórico.{' '}
        <button type="button" className="text-link" onClick={reload}>
          Tentar de novo
        </button>
      </p>
    );
  if (!events.length) return <p className="mt-2 text-xs text-slate-500">Nenhuma revisão registrada para esta tarefa.</p>;
  return (
    <div className="mt-2 divide-y divide-slate-200">
      {events.map(h => (
        <div key={h.id} className="py-2 text-xs">
          <p className="text-slate-600">
            {formatDate(h.occurredAt.slice(0, 10))} {h.occurredAt.slice(11, 19)} ·{' '}
            {users.find(u => u.id === h.authorId)?.name ?? h.authorId} · {String(h.changes.reason ?? 'Motivo não registrado')}
          </p>
          <dl className="mt-1 whitespace-pre-wrap">
            {Object.entries((h.changes.fields ?? {}) as Record<string, { before: unknown; after: unknown }>).map(([field, change]) => (
              <div key={field}>
                <dt className="font-semibold text-slate-800">{fieldLabels[field] ?? field}</dt>
                <dd className="text-slate-600">
                  {show(field, change.before)} → {show(field, change.after)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

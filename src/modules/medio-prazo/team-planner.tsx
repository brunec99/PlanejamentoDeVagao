'use client';
import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, GripHorizontal } from 'lucide-react';
import type { PlanTask, Team } from '@/domain/entities';
import { nextWorking, previousWorking, shift, type TaskSchedule, type WorkCalendar } from '@/domain/plan-schedule';
import { overallocatedTaskIds, resourceRows, resourceTasks, type ResourceRow, type ResourceTask } from '@/domain/resource-usage';
import { HelpNote } from '@/modules/layout/help-note';
import { CHART, STATUS } from '@/shared/palette';
import {
  GANTT_DAY_PX,
  addUtcDays,
  barSegments,
  barSpan,
  dateX,
  dayNumber,
  ganttRange,
  milestoneX,
  nonWorkingRuns,
  progressFill,
  shortDate,
  timescaleTiers,
  type GanttRow,
  type GanttZoom,
} from './gantt-chart';

/* Planejador de Equipe, no molde do "Planejador de Equipe" do Project: à esquerda o nome de cada
 * recurso (aqui, as equipes da obra), à direita a mesma escala de tempo do Gantt (as funções de
 * escala são as dele, para as duas vistas casarem dia a dia), e na linha de cada equipe as tarefas
 * dela em blocos com o nome dentro. Equipe superalocada fica com o nome em vermelho e o ícone de
 * alerta, a linha se abre em subfaixas (triângulo para recolher) com as tarefas que se cruzam
 * empilhadas, e os blocos que causam o excesso ganham contorno vermelho. Embaixo, depois da barra
 * "Tarefas não atribuídas: N" (que se arrasta para dar mais ou menos altura), ficam as tarefas sem
 * equipe. Do Project vem também o uso: arrastar um bloco para a linha de outra equipe reatribui, da
 * faixa de baixo para uma equipe atribui, de uma equipe para a faixa de baixo tira a equipe, e
 * arrastar para os lados muda o início — quem transforma isso na restrição "Não iniciar antes de" é
 * a planilha, pelo `onMove`. Clique seleciona, duplo clique abre "Informações da tarefa"; pelo
 * teclado, as setas andam entre os blocos, Shift com setas para cima e para baixo troca a equipe,
 * Shift com setas para os lados anda um dia útil, e o seletor "Atribuir a" da barra de cima faz o
 * mesmo que o arrasto. Do Obra 360 vem o visual: paleta `CHART`, neutros `slate`, nada da faixa de
 * opções nem do azul e do tema escuro do Project. A carga, as subfaixas e a superalocação vêm
 * prontas de `domain/resource-usage`; as contas de tela ficam em funções puras exportadas,
 * cobertas por tests/team-planner.test.ts. */

export interface TeamPlannerProps {
  /** Rascunho do plano, na ordem da tabela, com os resumos (que não entram: só tarefa ocupa equipe). */
  tasks: PlanTask[];
  /** Saída do motor: criticidade de cada linha. */
  info: ReadonlyMap<string, TaskSchedule>;
  /** Equipes da obra: os recursos. */
  teams: Team[];
  calendar: WorkCalendar;
  /** Janela do plano (os 3 meses). */
  window: { start: string; end: string };
  today: string;
  /** A mesma escala do Gantt, controlada fora. */
  zoom: GanttZoom;
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Sem edição, nada arrasta e o seletor de equipe fica bloqueado. */
  canEdit: boolean;
  /** `teamId` ausente tira a equipe da tarefa. */
  onAssign: (taskId: string, teamId: string | undefined) => void;
  /** Novo início (AAAA-MM-DD), já num dia útil do calendário. */
  onMove: (taskId: string, start: string) => void;
  onOpenTask?: (id: string) => void;
  className?: string;
}

// ————— Medidas —————

/** Altura de cada subfaixa da linha de um recurso: um bloco de duas linhas de texto e o respiro. */
export const PLANNER_LANE_PX = 36;
/** Respiro em cima e embaixo da linha do recurso, fora das subfaixas. */
const ROW_PAD = 3;
/** Distância do bloco às bordas da subfaixa. */
const BLOCK_INSET = 3;
const NAME_WIDTH = 208;
const HEADER_HEIGHT = 44;
const DIAMOND = 11;
/** Abaixo disso o ponteiro ainda está "clicando", não arrastando. */
const DRAG_START_PX = 4;
/** Zona morta do arrasto horizontal, para a escala mensal (1,6 px por dia) não mudar a data de
 * quem só arrasta na vertical para trocar a equipe. */
const DRAG_DEAD_PX = 6;
/** Folga para a barra de rolagem horizontal da faixa de baixo. */
const SCROLLBAR_ROOM = 12;
/** A faixa de baixo nunca some de todo: é nela que se solta a tarefa para tirar a equipe. */
const MIN_PANE = ROW_PAD * 2 + PLANNER_LANE_PX + SCROLLBAR_ROOM;
/** Largura mínima para o nome ir dentro do bloco, e vão mínimo para ir ao lado. */
const LABEL_INSIDE_PX = 44;
const LABEL_OUTSIDE_PX = 28;
/** Chave da faixa "Tarefas não atribuídas". */
export const UNASSIGNED_KEY = 'none';

// ————— Funções puras —————

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** A mesma regra do `validateDate` do domínio, sem lançar erro: AAAA-MM-DD de um dia que existe. */
const validDate = (value: unknown): value is string =>
  typeof value === 'string' &&
  ISO.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;

/** Data que só guarda o lugar da linha inválida até ela sair: o `resourceTasks` precisa da
 * sequência inteira para saber o que é resumo, e lança erro ao deslocar uma data ruim. */
const PLACEHOLDER_DATE = '2000-01-03';

/** As tarefas que ocupam recurso (`resourceTasks`), prontas para desenhar. Linha com data inválida
 * fica de fora — a tabela mostra o erro, e o planejador não pode quebrar por ela, já que o domínio
 * lança erro com data ruim — e término antes do início, por dado antigo, vira um bloco de um dia,
 * como no Gantt. */
export function plannerTasks(tasks: PlanTask[], info: ReadonlyMap<string, TaskSchedule>): ResourceTask[] {
  const bad = new Set(tasks.filter(task => !validDate(task.plannedStart) || !validDate(task.plannedEnd)).map(task => task.id));
  const safe = bad.size
    ? tasks.map(task => (bad.has(task.id) ? { ...task, plannedStart: PLACEHOLDER_DATE, plannedEnd: PLACEHOLDER_DATE } : task))
    : tasks;
  return resourceTasks(safe, info)
    .filter(task => !bad.has(task.id) && validDate(task.start) && validDate(task.end))
    .map(task => (task.end < task.start ? { ...task, end: task.start } : task));
}

/** Chave da linha de um recurso: `team:<id>`, ou a faixa das não atribuídas. Tarefa com equipe que
 * não está mais na lista (excluída) mora nas não atribuídas, como no `resourceRows`. */
export const rowKeyOf = (teamId: string | undefined, known: ReadonlySet<string>) =>
  teamId && known.has(teamId) ? `team:${teamId}` : UNASSIGNED_KEY;
/** A equipe de uma chave de linha; a faixa das não atribuídas não tem. */
export const teamIdOfKey = (key: string) => (key.startsWith('team:') ? key.slice(5) : undefined);

/** Uma linha visual do planejador: uma subfaixa de um recurso, com as tarefas em ordem de início. */
export interface PlannerLine {
  key: string;
  lane: number;
  tasks: ResourceTask[];
}

/** As linhas visuais, de cima para baixo: uma por subfaixa da equipe aberta, uma só (com tudo
 * sobreposto) para a equipe recolhida ou sem cruzamento, e a faixa das não atribuídas por último —
 * mesmo vazia, porque é nela que se solta a tarefa para tirar a equipe. A faixa de baixo nunca
 * recolhe: no Project ela empilha as tarefas soltas para todas ficarem à vista. */
export function plannerLines(rows: readonly ResourceRow[], collapsed: ReadonlySet<string> = new Set()): PlannerLine[] {
  const lines: PlannerLine[] = [];
  const push = (row: ResourceRow, key: string, canCollapse: boolean) => {
    if ((canCollapse && collapsed.has(key)) || row.lanes.length <= 1) lines.push({ key, lane: 0, tasks: row.tasks });
    else row.lanes.forEach((tasks, lane) => lines.push({ key, lane, tasks }));
  };
  for (const row of rows) if (row.team) push(row, `team:${row.team.id}`, true);
  const loose = rows.find(row => !row.team);
  if (loose) push(loose, UNASSIGNED_KEY, false);
  else lines.push({ key: UNASSIGNED_KEY, lane: 0, tasks: [] });
  return lines;
}

/** Dias corridos entre dois períodos; zero quando se cruzam. */
const gapDays = (a: Pick<ResourceTask, 'start' | 'end'>, b: Pick<ResourceTask, 'start' | 'end'>) =>
  b.start > a.end ? dayNumber(b.start) - dayNumber(a.end) : a.start > b.end ? dayNumber(a.start) - dayNumber(b.end) : 0;

export type PlannerMove = 'left' | 'right' | 'up' | 'down' | 'first' | 'last';

/** Navegação pelo teclado entre os blocos. Para os lados, o bloco anterior ou seguinte da mesma
 * linha visual; Home e End, o primeiro e o último dela; para cima e para baixo, a linha visual
 * vizinha que tenha tarefa (subfaixas, equipes e a faixa de baixo, em sequência), no bloco mais
 * próximo no tempo — o que se cruza com o atual, ou o de menor distância, o mais cedo no empate.
 * Sem bloco atual (nada selecionado ou fora do planejador), o primeiro de todos. */
export function neighborTask(lines: readonly PlannerLine[], id: string | undefined, move: PlannerMove): string | undefined {
  const at = lines.findIndex(line => line.tasks.some(task => task.id === id));
  if (at < 0) return lines.find(line => line.tasks.length)?.tasks[0].id;
  const line = lines[at],
    index = line.tasks.findIndex(task => task.id === id),
    current = line.tasks[index];
  if (move === 'left') return line.tasks[index - 1]?.id;
  if (move === 'right') return line.tasks[index + 1]?.id;
  if (move === 'first') return line.tasks[0].id;
  if (move === 'last') return line.tasks[line.tasks.length - 1].id;
  const step = move === 'down' ? 1 : -1;
  for (let i = at + step; i >= 0 && i < lines.length; i += step) {
    const { tasks } = lines[i];
    if (tasks.length) return tasks.reduce((best, task) => (gapDays(current, task) < gapDays(current, best) ? task : best)).id;
  }
  return undefined;
}

/** O recurso vizinho para o Shift com seta: a lista é a ordem das linhas (equipes e, por último, a
 * faixa das não atribuídas). Na ponta, `undefined`: nada muda. */
export function adjacentRowKey(keys: readonly string[], key: string, step: 1 | -1): string | undefined {
  const at = keys.indexOf(key);
  return at < 0 ? undefined : keys[at + step];
}

/** Dias inteiros que um arrasto de `dx` pixels anda: arredonda para o dia mais próximo, igual
 * para os dois lados, e não sai do lugar com menos de meio dia ou de 6 px (o que for maior). */
export function dragDays(dx: number, zoom: GanttZoom): number {
  const px = GANTT_DAY_PX[zoom];
  if (!Number.isFinite(dx) || Math.abs(dx) < Math.max(DRAG_DEAD_PX, px / 2)) return 0;
  return Math.sign(dx) * Math.round(Math.abs(dx) / px);
}

/** Encaixe no dia útil, no sentido do arrasto: soltar no sábado vindo da sexta vai para a segunda;
 * vindo da segunda, volta para a sexta. Dia útil fica onde está. */
export const snapToWorkday = (date: string, calendar: WorkCalendar, direction: 1 | -1) =>
  direction < 0 ? previousWorking(date, calendar) : nextWorking(date, calendar);

/** Início depois de arrastar o bloco `dx` pixels na horizontal, já num dia útil. */
export function draggedStart(start: string, dx: number, zoom: GanttZoom, calendar: WorkCalendar): string {
  const days = dragDays(dx, zoom);
  return days ? snapToWorkday(addUtcDays(start, days), calendar, days < 0 ? -1 : 1) : start;
}

/** Por que o início não se move, como no Gantt: a tarefa concluída tem as datas reais, e a que já
 * começou tem o início real, que o Project não reprograma. As duas ainda trocam de equipe; num
 * arrasto na diagonal, só a equipe muda. `undefined`: o início se move. */
export function lockReason(task: Pick<ResourceTask, 'progress' | 'started'>): string | undefined {
  if (task.progress >= 100) return 'Concluída: as datas são as reais e não se movem';
  if (task.started) return 'A tarefa já começou: o início real não se move';
  return undefined;
}
export const startLocked = (task: Pick<ResourceTask, 'progress' | 'started'>) => lockReason(task) !== undefined;

export interface PlannerDrop {
  /** Muda a equipe; `teamId` ausente tira a equipe. */
  assign: boolean;
  teamId?: string;
  /** Novo início, quando o arrasto mudou a data. */
  start?: string;
}

/** O que soltar o bloco faz. Em outra linha, muda a equipe (a faixa de baixo tira a equipe); com
 * outro início, muda a data, a não ser na tarefa iniciada ou concluída (`lockReason`). Fora das
 * linhas (cabeçalho, barra da faixa de baixo, fora do planejador) ou sem mudança nenhuma:
 * `undefined`, e o bloco volta. */
export function resolveDrop(
  task: Pick<ResourceTask, 'start' | 'progress' | 'started'>,
  from: string,
  to: string | null | undefined,
  start: string,
): PlannerDrop | undefined {
  if (!to) return undefined;
  const assign = to !== from;
  const moved = !startLocked(task) && validDate(start) && start !== task.start ? start : undefined;
  if (!assign && !moved) return undefined;
  return { assign, teamId: assign ? teamIdOfKey(to) : undefined, start: moved };
}

/** Altura da linha de um recurso com `lanes` subfaixas à mostra. */
export const plannerRowHeight = (lanes: number) => Math.max(1, lanes) * PLANNER_LANE_PX + ROW_PAD * 2;

/** Onde vai o nome do bloco: dentro, quando cabe uma palavra; ao lado, no vão até o próximo bloco
 * da subfaixa, quando o bloco é estreito demais (escala semanal ou mensal); em lugar nenhum quando
 * não há vão — pedaço de letra não ajuda, e a dica e o rótulo acessível continuam dizendo o nome. */
export function labelPlacement(blockWidth: number, room: number): 'inside' | 'outside' | 'none' {
  if (blockWidth >= LABEL_INSIDE_PX) return 'inside';
  return room >= LABEL_OUTSIDE_PX ? 'outside' : 'none';
}

/** Altura da faixa de baixo depois de arrastar a barra: nunca menos de uma subfaixa e sempre
 * deixando espaço para o cabeçalho e uma linha de equipe em cima. */
export function clampPaneHeight(height: number, total: number): number {
  const max = Math.max(MIN_PANE, total - HEADER_HEIGHT - plannerRowHeight(1) - 40);
  return Math.round(Math.max(MIN_PANE, Math.min(max, Number.isFinite(height) ? height : MIN_PANE)));
}

const percent = (value: number) => `${Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)))}%`;

/** A pausa da tarefa dividida, quando é desenhável: dias parados válidos, dentro do período. */
const pauseOf = (task: Pick<ResourceTask, 'start' | 'end' | 'milestone' | 'pause'>) => {
  const { pause } = task;
  return !task.milestone && pause && validDate(pause.from) && validDate(pause.to) && task.start < pause.from && pause.to < task.end
    ? pause
    : undefined;
};

/** Trechos do bloco, desenhados como a barra do Gantt (`barSegments`): a tarefa dividida vira o
 * trecho trabalhado e o restante, com a pausa (os dias parados, inclusive) no meio em pontilhado;
 * sem pausa, um trecho só. A pausa vem do domínio, que já tira esses dias da carga da equipe. */
export function blockSegments(task: Pick<ResourceTask, 'start' | 'end' | 'milestone' | 'pause'>, rangeStart: string, zoom: GanttZoom) {
  const pause = pauseOf(task);
  return barSegments(
    { start: task.start, end: task.end, ...(pause ? { stop: addUtcDays(pause.from, -1), resume: addUtcDays(pause.to, 1) } : {}) },
    rangeStart,
    zoom,
  );
}

/** Dica e rótulo acessível do bloco: "Instalações elétricas 4º · Seg 14/09/26 – Qua 16/09/26 ·
 * Eletricista · 40% concluída · Crítica · Superalocada · Interrompida: … · Iniciada: …". Tudo o que
 * a cor, o contorno e o pontilhado dizem está escrito aqui. */
export function plannerTooltip(task: ResourceTask, teamName: string | undefined, overallocated = false): string {
  const parts = [task.name.trim() || 'Sem nome'];
  parts.push(task.milestone ? `Marco em ${shortDate(task.start)}` : `${shortDate(task.start)} – ${shortDate(task.end)}`);
  parts.push(teamName?.trim() || 'Sem equipe');
  parts.push(`${percent(task.progress)} concluída`);
  if (task.critical) parts.push('Crítica');
  if (overallocated) parts.push('Superalocada');
  const pause = pauseOf(task);
  if (pause)
    parts.push(`Interrompida: trabalhou até ${shortDate(addUtcDays(pause.from, -1))} e retoma em ${shortDate(addUtcDays(pause.to, 1))}`);
  if (task.started && task.progress < 100) parts.push('Iniciada: o início real não se move');
  return parts.join(' · ');
}

/* Cores da paleta única dos gráficos: o bloco é o azul de "planejado" claro com contorno no tom
 * cheio, como a barra do Gantt; o avanço é um filete no tom cheio no pé do bloco, para não brigar
 * com o nome; a concluída fica mais clara (o Project também clareia o que acabou). A crítica ganha
 * um filete vermelho à esquerda e a superalocada o contorno vermelho de estado mais grosso, como o
 * contorno vermelho do Project — dois sinais diferentes, para crítica e conflito não se confundirem. */
const mixWhite = (color: string, share: number) => `color-mix(in srgb, ${color} ${share}%, white)`;

export interface BlockTone {
  fill: string;
  border: string;
  borderWidth: number;
  text: string;
  progress: string;
  /** Filete à esquerda da tarefa crítica. */
  accent?: string;
}

export function blockTone(task: Pick<ResourceTask, 'critical' | 'progress'>, overallocated = false): BlockTone {
  const done = task.progress >= 100;
  return {
    fill: mixWhite(CHART.planned, done ? 10 : 24),
    border: overallocated ? STATUS.danger : done ? mixWhite(CHART.planned, 45) : CHART.planned,
    borderWidth: overallocated ? 2 : 1,
    text: done ? CHART.inkMuted : CHART.ink,
    progress: done ? mixWhite(CHART.planned, 45) : CHART.planned,
    accent: task.critical ? CHART.late : undefined,
  };
}

// ————— Componente —————

const SCROLL =
  'relative overflow-auto [scrollbar-gutter:stable] [scrollbar-width:auto] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:bg-slate-100';

const asGanttRow = (task: ResourceTask): GanttRow => ({
  id: task.id,
  name: task.name,
  summary: false,
  milestone: task.milestone,
  level: 0,
  start: task.start,
  end: task.end,
  progress: task.progress,
});

interface DragState {
  task: ResourceTask;
  from: string;
  pointerId: number;
  x0: number;
  y0: number;
  rect: { left: number; top: number; width: number; height: number };
  node: HTMLElement;
  active: boolean;
}
interface DragView {
  id: string;
  task: ResourceTask;
  rect: DragState['rect'];
  /** Deslocamento já encaixado em dias inteiros, em pixels. */
  shiftPx: number;
  dy: number;
  target: string | null;
  start: string;
}

const ARROWS: Record<string, PlannerMove> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'first',
  End: 'last',
};

export function TeamPlanner({
  tasks,
  info,
  teams,
  calendar,
  window: planWindow,
  today,
  zoom,
  selectedId,
  onSelect,
  canEdit,
  onAssign,
  onMove,
  onOpenTask,
  className = '',
}: TeamPlannerProps): JSX.Element {
  const px = GANTT_DAY_PX[zoom];
  const items = useMemo(() => plannerTasks(tasks, info), [tasks, info]);
  const rows = useMemo(() => resourceRows(items, teams, calendar), [items, teams, calendar]);
  const teamRows = useMemo(() => rows.filter((row): row is ResourceRow & { team: Team } => !!row.team), [rows]);
  const loose = rows.find(row => !row.team);
  const looseCount = loose?.tasks.length ?? 0;
  const known = useMemo(() => new Set(teams.map(team => team.id)), [teams]);
  const teamName = useMemo(() => new Map(teams.map(team => [team.id, team.name])), [teams]);
  // Os blocos que causam a superalocação: ativos em algum dia acima da capacidade da equipe.
  const conflicts = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) for (const id of overallocatedTaskIds(row, calendar)) ids.add(id);
    return ids;
  }, [rows, calendar]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const lines = useMemo(() => plannerLines(rows, collapsed), [rows, collapsed]);
  const linesByKey = useMemo(() => {
    const map = new Map<string, PlannerLine[]>();
    for (const line of lines) map.set(line.key, [...(map.get(line.key) ?? []), line]);
    return map;
  }, [lines]);
  const rowKeys = useMemo(() => [...teamRows.map(row => `team:${row.team.id}`), UNASSIGNED_KEY], [teamRows]);
  const overCount = teamRows.filter(row => row.overallocated).length;

  // A escala é a do Gantt: mesmo período, mesmas faixas, mesmos dias não úteis.
  const range = useMemo(
    () => ganttRange(items.map(asGanttRow), { start: planWindow.start, end: planWindow.end }, zoom),
    [items, planWindow.start, planWindow.end, zoom],
  );
  const width = range.days * px;
  const tiers = useMemo(() => timescaleTiers(range, zoom), [range, zoom]);
  const offDays = useMemo(() => (zoom === 'mes' ? [] : nonWorkingRuns(range, calendar)), [range, zoom, calendar]);
  const x = (date: string) => dateX(date, range.start, zoom);
  const windowLeft = x(planWindow.start),
    windowRight = x(planWindow.end) + px;
  const todayX = validDate(today) && today >= range.start && today <= range.end ? x(today) + px / 2 : undefined;
  const topTier = Math.floor(HEADER_HEIGHT / 2);

  const rootRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const splitRef = useRef<{ y: number; height: number } | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<DragView | null>(null);
  const [status, setStatus] = useState('');
  const [paneHeight, setPaneHeight] = useState<number>();
  const hintId = useId();

  const looseLanes = Math.max(1, loose?.lanes.length ?? 0);
  const bottomHeight = paneHeight ?? plannerRowHeight(Math.min(3, looseLanes)) + SCROLLBAR_ROOM;

  // Ao abrir e a cada troca de escala, a rolagem horizontal vai para perto de hoje (ou do início
  // da janela, com hoje fora), como no Gantt; a faixa de baixo acompanha.
  useEffect(() => {
    const node = topRef.current;
    if (!node) return;
    const anchor = validDate(today) && today >= range.start && today <= range.end ? today : planWindow.start;
    node.scrollLeft = Math.max(0, dateX(anchor, range.start, zoom) - (node.clientWidth - NAME_WIDTH) / 4);
    if (bottomRef.current) bottomRef.current.scrollLeft = node.scrollLeft;
    // Só a escala reposiciona: arrastar um bloco não pode puxar a vista de quem está trabalhando.
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc cancela o arrasto, e o bloco volta para onde estava.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const current = dragRef.current;
      dragRef.current = null;
      if (current?.node.hasPointerCapture(current.pointerId)) current.node.releasePointerCapture(current.pointerId);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      setDrag(null);
      setStatus('Arrasto cancelado.');
    };
    globalThis.addEventListener('keydown', key);
    return () => globalThis.removeEventListener('keydown', key);
  }, [dragging]);

  const syncScroll = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    if (to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft;
  };
  /** Leva o foco ao bloco. Na navegação ele já existe e o foco vai na hora (seta segurada não pode
   * repetir a partir do bloco antigo); depois de reatribuir, o bloco renasce na linha da outra
   * equipe, e o foco espera o próximo quadro. */
  const focusTask = (id: string, later = false) => {
    const run = () => rootRef.current?.querySelector<HTMLElement>(`[data-planner-task="${CSS.escape(id)}"]`)?.focus();
    if (later) requestAnimationFrame(run);
    else run();
  };
  const teamLabel = (key: string) => {
    const id = teamIdOfKey(key);
    return id ? (teamName.get(id) ?? 'equipe') : 'Sem equipe';
  };

  const apply = (task: ResourceTask, drop: PlannerDrop) => {
    onSelect(task.id);
    if (drop.assign) onAssign(task.id, drop.teamId);
    if (drop.start) onMove(task.id, drop.start);
    const said = [
      drop.assign ? (drop.teamId ? `atribuída a ${teamName.get(drop.teamId) ?? 'outra equipe'}` : 'sem equipe') : '',
      drop.start ? `início em ${shortDate(drop.start)}` : '',
    ].filter(Boolean);
    setStatus(`${task.name}: ${said.join(', ')}.`);
    focusTask(task.id, true);
  };

  // A linha sob o ponteiro: o elemento mais de cima que não seja o próprio bloco arrastado. O
  // cabeçalho e a barra da faixa de baixo não são linha, então soltar ali cancela.
  const rowAt = (clientX: number, clientY: number, node: HTMLElement): string | null => {
    const hit = document.elementsFromPoint(clientX, clientY).find(element => !node.contains(element));
    const row = hit?.closest<HTMLElement>('[data-planner-row]');
    return row && rootRef.current?.contains(row) ? (row.dataset.plannerRow ?? null) : null;
  };
  const startFor = (state: DragState, clientX: number) =>
    startLocked(state.task) ? state.task.start : draggedStart(state.task.start, clientX - state.x0, zoom, calendar);

  const onBlockPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, task: ResourceTask, from: string) => {
    if (!canEdit || event.button !== 0 || event.ctrlKey || event.metaKey) return;
    const box = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      task,
      from,
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      rect: { left: box.left, top: box.top, width: box.width, height: box.height },
      node: event.currentTarget,
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onBlockPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.x0,
      dy = event.clientY - state.y0;
    if (!state.active && Math.hypot(dx, dy) < DRAG_START_PX) return;
    state.active = true;
    const start = startFor(state, event.clientX);
    setDrag({
      id: state.task.id,
      task: state.task,
      rect: state.rect,
      shiftPx: (dayNumber(start) - dayNumber(state.task.start)) * px,
      dy,
      target: rowAt(event.clientX, event.clientY, state.node),
      start,
    });
  };
  const onBlockPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (!state.active) return;
    // O clique que o navegador dispara depois do arrasto não pode virar uma segunda seleção.
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    const drop = resolveDrop(state.task, state.from, rowAt(event.clientX, event.clientY, state.node), startFor(state, event.clientX));
    if (drop) apply(state.task, drop);
    else setStatus(`${state.task.name}: nada mudou.`);
  };
  const onBlockLostCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
  };

  const onBlockKey = (event: KeyboardEvent<HTMLButtonElement>, task: ResourceTask, from: string) => {
    if (event.shiftKey && canEdit && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const to = adjacentRowKey(rowKeys, from, event.key === 'ArrowDown' ? 1 : -1);
      if (to) apply(task, { assign: true, teamId: teamIdOfKey(to) });
      return;
    }
    if (event.shiftKey && canEdit && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const locked = lockReason(task);
      if (locked) setStatus(`${task.name}: ${locked}.`);
      else apply(task, { assign: false, start: shift(task.start, event.key === 'ArrowRight' ? 1 : -1, true, calendar) });
      return;
    }
    if (onOpenTask && ((event.key === 'Enter' && !event.shiftKey) || (event.key === 'F2' && event.shiftKey))) {
      event.preventDefault();
      onSelect(task.id);
      onOpenTask(task.id);
      return;
    }
    const move = ARROWS[event.key];
    if (!move || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const next = neighborTask(lines, task.id, move);
    if (next) {
      onSelect(next);
      focusTask(next);
    }
  };

  // Só um bloco entra na ordem do Tab (o selecionado, ou o primeiro); as setas andam entre eles.
  const focusable = items.some(task => task.id === selectedId) ? selectedId : lines.find(line => line.tasks.length)?.tasks[0].id;
  const selectedTask = items.find(task => task.id === selectedId);

  /** Vão livre na subfaixa, de `right` até o próximo bloco (ou o fim da escala), menos um respiro. */
  const roomAfter = (right: number, next: ResourceTask | undefined) =>
    (next
      ? next.milestone
        ? milestoneX(next.start, range.start, zoom) - DIAMOND / 2
        : barSpan(next.start, next.end, range.start, zoom).left
      : width) -
    right -
    8;

  const renderBlock = (task: ResourceTask, lane: number, from: string, next: ResourceTask | undefined): ReactNode => {
    const over = conflicts.has(task.id);
    const tone = blockTone(task, over);
    const tooltip = plannerTooltip(task, task.teamId && known.has(task.teamId) ? teamName.get(task.teamId) : undefined, over);
    const selected = task.id === selectedId;
    const top = ROW_PAD + lane * PLANNER_LANE_PX + BLOCK_INSET;
    const height = PLANNER_LANE_PX - BLOCK_INSET * 2;
    const progress = Math.min(100, Math.max(0, Number.isFinite(task.progress) ? task.progress : 0));
    const ring = `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? 'outline-2 outline-offset-1 outline-primary-ink' : ''} ${canEdit ? 'cursor-grab touch-none active:cursor-grabbing' : ''} ${drag?.id === task.id ? 'opacity-40' : ''}`;
    const props = {
      type: 'button' as const,
      title: tooltip,
      'aria-label': `${task.milestone ? 'Marco' : 'Tarefa'}: ${tooltip}`,
      'aria-pressed': selected,
      'aria-describedby': hintId,
      'data-planner-task': task.id,
      tabIndex: task.id === focusable ? 0 : -1,
      onClick: () => {
        if (suppressClick.current) return;
        onSelect(task.id);
      },
      onDoubleClick: () => onOpenTask?.(task.id),
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => onBlockKey(event, task, from),
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => onBlockPointerDown(event, task, from),
      onPointerMove: onBlockPointerMove,
      onPointerUp: onBlockPointerUp,
      onPointerCancel: onBlockLostCapture,
      onLostPointerCapture: onBlockLostCapture,
    };
    if (task.milestone) {
      // Marco: losango pequeno no meio do dia, com o nome ao lado até onde a subfaixa deixa.
      // Marco não ocupa a equipe, então nunca está em conflito: a cor é a do avanço, ou a crítica.
      const center = milestoneX(task.start, range.start, zoom);
      const room = roomAfter(center + DIAMOND / 2, next);
      const color = task.critical ? CHART.late : tone.progress;
      return (
        <Fragment key={task.id}>
          <button
            {...props}
            className={`absolute rotate-45 rounded-[1px] border ${ring}`}
            style={{
              left: center - DIAMOND / 2,
              top: top + (height - DIAMOND) / 2,
              width: DIAMOND,
              height: DIAMOND,
              background: color,
              borderColor: color,
            }}
          />
          {room >= LABEL_OUTSIDE_PX && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute truncate whitespace-nowrap text-[11px] leading-none text-slate-600"
              style={{ left: center + DIAMOND / 2 + 5, top: top + height / 2 - 6, maxWidth: Math.min(room, 180) }}
            >
              {task.name}
            </span>
          )}
        </Fragment>
      );
    }
    // O botão cobre o período inteiro; os trechos (dois na tarefa dividida, com a pausa em
    // pontilhado entre eles, como no Gantt) são desenhados dentro dele, e o nome vai no primeiro.
    const span = barSpan(task.start, task.end, range.start, zoom);
    const shape = blockSegments(task, range.start, zoom);
    const fills = progressFill(shape.segments, progress);
    const room = roomAfter(span.right, next);
    const place = labelPlacement(shape.segments[0].width, room);
    const check = task.progress >= 100 && <Check size={10} className="mr-0.5 inline align-[-1px]" aria-hidden />;
    return (
      <Fragment key={task.id}>
        <button
          {...props}
          className={`absolute rounded-[3px] text-left ${ring}`}
          style={{ left: span.left, width: span.width, top, height, color: tone.text }}
        >
          {shape.gaps.map(gap => (
            <span
              key={`g-${gap.left}`}
              aria-hidden="true"
              className="absolute"
              style={{
                left: gap.left - span.left,
                width: gap.right - gap.left,
                top: 'calc(50% - 1px)',
                borderTop: `2px dotted ${tone.border}`,
              }}
            />
          ))}
          {shape.segments.map((segment, index) => (
            <span
              key={`s-${segment.left}`}
              aria-hidden="true"
              className="absolute inset-y-0 overflow-hidden rounded-[3px]"
              style={{
                left: segment.left - span.left,
                width: segment.width,
                background: tone.fill,
                border: `${tone.borderWidth}px solid ${tone.border}`,
              }}
            >
              {index === 0 && tone.accent && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: tone.accent }} />}
              {index === 0 && place === 'inside' && (
                <span
                  className={`line-clamp-2 hyphens-auto break-words pr-1 pt-px text-[11px] font-medium leading-3 ${tone.accent ? 'pl-1.5' : 'pl-1'}`}
                >
                  {check}
                  {task.name}
                </span>
              )}
              {fills[index] > 0 && (
                <span className="absolute bottom-0 left-0 h-0.5" style={{ width: fills[index], background: tone.progress }} />
              )}
            </span>
          ))}
        </button>
        {/* Bloco estreito (escala semanal ou mensal): o nome vai ao lado, no vão até o próximo. */}
        {place === 'outside' && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute truncate whitespace-nowrap text-[11px] font-medium leading-none"
            style={{ left: span.right + 4, top: top + height / 2 - 6, maxWidth: Math.min(room, 180), color: tone.text }}
          >
            {check}
            {task.name}
          </span>
        )}
      </Fragment>
    );
  };

  /** Os blocos de uma linha de recurso, subfaixa por subfaixa. */
  const renderLanes = (key: string) =>
    (linesByKey.get(key) ?? []).map((line, lane) => line.tasks.map((task, index) => renderBlock(task, lane, key, line.tasks[index + 1])));

  /** Fundo da área do tempo: dias não úteis, fora da janela do plano, grade, limites da janela e hoje. */
  const background = (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {offDays.map(run => (
        <div key={run.from} className="absolute inset-y-0 bg-slate-200/45" style={{ left: run.from * px, width: run.days * px }} />
      ))}
      {windowLeft > 0 && <div className="absolute inset-y-0 left-0 bg-slate-300/25" style={{ width: windowLeft }} />}
      {windowRight < width && <div className="absolute inset-y-0 right-0 bg-slate-300/25" style={{ left: windowRight }} />}
      {tiers.bottom.map(
        cell =>
          cell.left > 0 && <div key={cell.key} className="absolute inset-y-0 border-l border-slate-200/70" style={{ left: cell.left }} />,
      )}
      <div className="absolute inset-y-0 border-l border-dashed border-slate-500" style={{ left: windowLeft }} />
      <div className="absolute inset-y-0 border-l border-dashed border-slate-500" style={{ left: windowRight }} />
      {/* Hoje: tracejado como no Planejador de Equipe do Project, no âmbar que marca hoje no sistema. */}
      {todayX !== undefined && (
        <div className="absolute inset-y-0 border-l-2 border-dashed" style={{ left: todayX - 1, borderColor: CHART.today }} />
      )}
    </div>
  );

  const resizePane = (height: number) => setPaneHeight(clampPaneHeight(height, rootRef.current?.clientHeight ?? 480));
  const looseHint = !canEdit
    ? 'Tarefas sem equipe.'
    : looseCount
      ? 'Arraste uma tarefa para a linha de uma equipe para atribuir.'
      : 'Solte aqui uma tarefa para tirar a equipe dela.';

  return (
    <div ref={rootRef} data-tour="medio-planejador" className={`relative flex min-h-0 flex-col overflow-hidden bg-white ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
        {overCount ? (
          <span className="inline-flex items-center gap-1 font-semibold text-danger">
            <AlertTriangle size={13} aria-hidden />
            {overCount} {overCount === 1 ? 'equipe superalocada' : 'equipes superalocadas'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-success">
            <Check size={13} aria-hidden />
            Nenhuma equipe superalocada
          </span>
        )}
        <span className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 md:flex" aria-label="Legenda">
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="relative inline-block h-3 w-5 overflow-hidden rounded-[2px] border"
              style={{ background: blockTone({ critical: true, progress: 0 }).fill, borderColor: CHART.planned }}
            >
              <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: CHART.late }} />
            </span>
            crítica
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-5 rounded-[2px] border-2"
              style={{ background: blockTone({ critical: false, progress: 0 }, true).fill, borderColor: STATUS.danger }}
            />
            em superalocação
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className="inline-block h-3 w-5 rounded-[2px] border"
              style={{
                background: blockTone({ critical: false, progress: 100 }).fill,
                borderColor: blockTone({ critical: false, progress: 100 }).border,
              }}
            />
            concluída
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2 w-2 rotate-45 rounded-[1px]" style={{ background: CHART.planned }} />
            marco
          </span>
        </span>
        <label data-tour="medio-planejador-atribuir" className="ml-auto flex min-w-0 items-center gap-2 font-semibold text-slate-600">
          <span className="max-w-56 truncate" title={selectedTask?.name}>
            {selectedTask ? `Atribuir “${selectedTask.name}” a` : 'Atribuir a'}
          </span>
          <select
            className="field w-auto max-w-56 py-1 text-xs"
            value={selectedTask?.teamId && known.has(selectedTask.teamId) ? selectedTask.teamId : ''}
            disabled={!canEdit || !selectedTask}
            aria-label={selectedTask ? `Equipe de ${selectedTask.name}` : 'Equipe da tarefa selecionada'}
            onChange={event => {
              const teamId = event.target.value || undefined;
              if (selectedTask && rowKeyOf(teamId, known) !== rowKeyOf(selectedTask.teamId, known))
                apply(selectedTask, { assign: true, teamId });
            }}
          >
            <option value="">{selectedTask ? 'Sem equipe' : 'Selecione uma tarefa'}</option>
            {teamRows.map(row => (
              <option key={row.team.id} value={row.team.id}>
                {row.team.name} · {row.team.company}
              </option>
            ))}
          </select>
        </label>
        <HelpNote title="Como funciona: planejador de equipe" align="end" compact>
          <p>
            Cada equipe da obra é um recurso, e a capacidade cadastrada são as unidades máximas: com mais tarefas ao mesmo tempo do que
            isso, a equipe fica superalocada — nome em vermelho, linha aberta em subfaixas e contorno vermelho nos blocos em conflito.
            Resumo não aparece: só tarefa ocupa equipe, e marco não conta na carga. Tarefa interrompida aparece em dois trechos, com a pausa
            em pontilhado: nos dias parados a equipe fica livre.
          </p>
          <p>
            Arraste um bloco para a linha de outra equipe para reatribuir, para a faixa de baixo para tirar a equipe, ou para os lados para
            mudar o início, que fica gravado como restrição "Não iniciar antes de". Esc cancela o arrasto. Tarefa que já começou, ou
            concluída, troca de equipe, mas não de data: o início real não se move.
          </p>
          <p>
            Pelo teclado: setas andam entre as tarefas; Shift com seta para cima ou para baixo troca a equipe; Shift com seta para os lados
            anda o início um dia útil; Enter abre as informações da tarefa.
          </p>
        </HelpNote>
      </div>
      <p id={hintId} className="sr-only">
        Setas andam entre as tarefas.
        {canEdit
          ? ' Shift com seta para cima ou para baixo troca a equipe; Shift com seta para os lados muda o início em um dia útil.'
          : ''}
        {onOpenTask ? ' Enter abre as informações da tarefa.' : ''}
      </p>
      <div aria-live="polite" className="sr-only">
        {status}
      </div>

      {/* Equipes: cabeçalho da escala e coluna de nomes fixos ao rolar. */}
      <div
        ref={topRef}
        role="region"
        aria-label="Planejador de equipe: tarefas por equipe"
        tabIndex={0}
        onScroll={event => syncScroll(event.currentTarget, bottomRef.current)}
        className={`${SCROLL} min-h-0 flex-1`}
      >
        <div className="flex min-h-full flex-col" style={{ width: NAME_WIDTH + width, minWidth: '100%' }}>
          <div className="sticky top-0 z-30 flex shrink-0 border-b border-slate-300 bg-slate-100" style={{ height: HEADER_HEIGHT }}>
            <div
              className="sticky left-0 z-10 flex shrink-0 items-end border-r border-slate-300 bg-slate-100 px-3 pb-1.5 text-xs font-semibold text-slate-700"
              style={{ width: NAME_WIDTH }}
            >
              Nome do recurso
            </div>
            <div className="relative shrink-0" style={{ width }}>
              {tiers.top.map(cell => (
                <div
                  key={`t-${cell.key}`}
                  title={cell.title}
                  style={{ left: cell.left, width: cell.width, height: topTier }}
                  className="absolute top-0 flex items-center overflow-hidden whitespace-nowrap border-r border-slate-300 px-1.5 text-xs font-semibold text-slate-700"
                >
                  {cell.label}
                </div>
              ))}
              {tiers.bottom.map(cell => (
                <div
                  key={`b-${cell.key}`}
                  title={cell.title}
                  style={{ left: cell.left, width: cell.width, top: topTier, height: HEADER_HEIGHT - topTier }}
                  className={`absolute flex items-center overflow-hidden whitespace-nowrap border-r border-t border-slate-200 text-xs tabular-nums text-slate-500 ${zoom === 'dia' ? 'justify-center' : 'px-1'}`}
                >
                  {cell.label}
                </div>
              ))}
              {todayX !== undefined && (
                <div aria-hidden="true" className="absolute bottom-0 h-1.5 w-0.5" style={{ left: todayX - 1, background: CHART.today }} />
              )}
            </div>
          </div>

          {teamRows.length === 0 ? (
            <p className="sticky left-0 max-w-md p-4 text-sm text-slate-500">
              Nenhuma equipe cadastrada nesta obra. Cadastre as equipes em Configurações da obra para atribuir as tarefas.
            </p>
          ) : (
            <div className="flex flex-1">
              <div className="sticky left-0 z-20 shrink-0 border-r border-slate-300 bg-white" style={{ width: NAME_WIDTH }}>
                {teamRows.map(row => {
                  const key = `team:${row.team.id}`;
                  const open = !collapsed.has(key);
                  const over = row.overallocated;
                  const detail = `${row.team.company} · cap. ${row.capacity}${over ? ` · pico ${row.peak}` : ''}`;
                  return (
                    <div
                      key={key}
                      data-planner-row={key}
                      className={`flex items-start gap-1 border-b border-slate-200/80 px-1.5 ${drag?.target === key ? 'bg-primary-soft' : ''}`}
                      style={{ height: plannerRowHeight(linesByKey.get(key)?.length ?? 1), paddingTop: ROW_PAD + 1 }}
                    >
                      {row.lanes.length > 1 ? (
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? 'Recolher' : 'Abrir'} as subfaixas de ${row.team.name}`}
                          title={open ? 'Recolher subfaixas' : 'Abrir subfaixas'}
                          onClick={() =>
                            setCollapsed(current => {
                              const nextSet = new Set(current);
                              if (open) nextSet.add(key);
                              else nextSet.delete(key);
                              return nextSet;
                            })
                          }
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        >
                          {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}
                      <div
                        className="min-w-0 flex-1"
                        title={
                          over
                            ? `${row.team.name}: superalocada, até ${row.peak} tarefas ao mesmo tempo para capacidade ${row.capacity}`
                            : `${row.team.name} · ${detail}`
                        }
                      >
                        <p
                          className={`flex min-w-0 items-center gap-1 text-sm leading-5 ${over ? 'font-semibold text-danger' : 'font-medium text-slate-800'}`}
                        >
                          {over && <AlertTriangle size={13} className="shrink-0" aria-hidden />}
                          <span className="truncate">{row.team.name}</span>
                          {over && <span className="sr-only">, superalocada</span>}
                        </p>
                        <p className={`truncate text-[11px] leading-4 ${over ? 'text-danger' : 'text-slate-400'}`}>{detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="relative shrink-0" style={{ width }}>
                {background}
                {teamRows.map(row => {
                  const key = `team:${row.team.id}`;
                  return (
                    <div
                      key={key}
                      data-planner-row={key}
                      className={`relative border-b border-slate-200/80 ${drag?.target === key ? 'bg-primary-soft/70' : ''}`}
                      style={{ height: plannerRowHeight(linesByKey.get(key)?.length ?? 1) }}
                    >
                      {renderLanes(key)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra "Tarefas não atribuídas: N": divide as duas faixas e se arrasta para mudar a altura. */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Tarefas não atribuídas: ${looseCount}. Arraste ou use as setas para mudar a altura da faixa.`}
        aria-valuenow={bottomHeight}
        aria-valuemin={MIN_PANE}
        aria-valuemax={1200}
        tabIndex={0}
        data-tour="medio-planejador-nao-atribuidas"
        className="flex h-7 shrink-0 cursor-row-resize touch-none select-none items-center gap-2 border-y border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200/70 focus:outline-none focus-visible:bg-primary-soft"
        onKeyDown={event => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            resizePane(bottomHeight + (event.key === 'ArrowUp' ? 24 : -24));
          }
        }}
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          splitRef.current = { y: event.clientY, height: bottomHeight };
        }}
        onPointerMove={event => {
          const split = splitRef.current;
          if (split && event.currentTarget.hasPointerCapture(event.pointerId)) resizePane(split.height - (event.clientY - split.y));
        }}
        onPointerUp={() => (splitRef.current = null)}
        onPointerCancel={() => (splitRef.current = null)}
      >
        <GripHorizontal size={14} className="text-slate-400" aria-hidden />
        <span className={looseCount ? '' : 'font-normal text-slate-500'}>Tarefas não atribuídas: {looseCount}</span>
      </div>

      {/* Tarefas sem equipe: a faixa inteira é alvo de soltar, e a rolagem horizontal anda junto com a de cima. */}
      <div
        ref={bottomRef}
        role="region"
        aria-label={`Tarefas não atribuídas: ${looseCount}`}
        tabIndex={0}
        data-planner-row={UNASSIGNED_KEY}
        onScroll={event => syncScroll(event.currentTarget, topRef.current)}
        className={`${SCROLL} shrink-0`}
        style={{ height: bottomHeight }}
      >
        <div className="flex min-h-full" style={{ width: NAME_WIDTH + width, minWidth: '100%' }}>
          <div
            className={`sticky left-0 z-20 shrink-0 border-r border-slate-300 px-3 py-2 text-[11px] leading-4 text-slate-500 ${drag?.target === UNASSIGNED_KEY ? 'bg-primary-soft' : 'bg-white'}`}
            style={{ width: NAME_WIDTH }}
          >
            {looseHint}
          </div>
          <div className={`relative shrink-0 ${drag?.target === UNASSIGNED_KEY ? 'bg-primary-soft/70' : ''}`} style={{ width }}>
            {background}
            <div className="relative" style={{ height: plannerRowHeight(linesByKey.get(UNASSIGNED_KEY)?.length ?? 1) }}>
              {renderLanes(UNASSIGNED_KEY)}
            </div>
          </div>
        </div>
      </div>

      {/* Fantasma do arrasto: segue o ponteiro na vertical e anda em dias inteiros na horizontal,
       * com o novo início e o destino escritos embaixo, como a dica do Project ao arrastar. Fica
       * fixo na tela para passar de uma faixa para a outra sem ser cortado pela rolagem. */}
      {drag && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50"
          style={{ left: drag.rect.left + drag.shiftPx, top: drag.rect.top + drag.dy, width: drag.rect.width, height: drag.rect.height }}
        >
          <div
            className={`h-full w-full border-2 border-dashed shadow-lg ${drag.task.milestone ? 'rotate-45 rounded-[1px]' : 'rounded-[3px]'}`}
            style={{ borderColor: drag.target ? CHART.planned : CHART.inkFaint, background: mixWhite(CHART.planned, 30), opacity: 0.9 }}
          />
          <div className="absolute left-0 top-full mt-1 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow">
            {lockReason(drag.task) ?? `Início ${shortDate(drag.start)}`} ·{' '}
            {drag.target ? teamLabel(drag.target) : 'Solte na linha de uma equipe'}
          </div>
        </div>
      )}
    </div>
  );
}

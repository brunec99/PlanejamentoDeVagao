'use client';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type JSX, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import type { PlanTask, Team } from '@/domain/entities';
import { isWorking, type TaskSchedule, type WorkCalendar } from '@/domain/plan-schedule';
import {
  activeOn,
  dailyLoad,
  overallocatedTaskIds,
  resourceRows,
  resourceTasks,
  type DayLoad,
  type ResourceRow,
  type ResourceTask,
} from '@/domain/resource-usage';
import { CHART } from '@/shared/palette';
import { addUtcDays, monthLabel, shortDate, weekdayOf, type GanttZoom } from './gantt-chart';

/* Uso dos Recursos, no molde da visão homônima do Project. À esquerda, a tabela com os
 * indicadores, o "Nome do recurso" e o "Trabalho": cada equipe é uma linha em negrito com o
 * triângulo de recolher e, embaixo, as tarefas atribuídas a ela, recuadas e em itálico, com o
 * trabalho de cada uma. "Sem alocação" vem primeiro, como no Project, e junta as tarefas sem
 * equipe (ou com equipe excluída) com trabalho zero: sem recurso não há horas. À direita, a coluna
 * "Detalhe" ("Trab.") e a grade de horas por período — um dia por coluna na escala Dias, uma
 * semana (segunda a domingo, somando os dias) em Semanas e Meses —, com o dia não útil sombreado e
 * o recurso superalocado em vermelho, no nome, no indicador e nas células do período em que passa
 * das unidades máximas; a semana fica vermelha se algum dia dela passa, mesmo que o total caiba,
 * como no Project. Trabalho é dia útil × jornada do calendário: uma tarefa de 3 dias soma 24 h com
 * jornada de 8 h; na tarefa dividida, os dias parados não contam e ficam vazios na grade (todo dia
 * passa pelo `activeOn` do domínio). Tabela e grade são uma só área de rolagem, com o cabeçalho e as quatro colunas da
 * esquerda fixos, para rolarem juntas na vertical. Clicar numa tarefa seleciona a linha (a mesma
 * seleção do cronograma); duplo clique ou Enter abre "Informações da tarefa"; as setas andam pelas
 * linhas e, num recurso, ← e → recolhem e expandem. Do Project não vêm a faixa de opções, o azul
 * e o tema escuro: o visual é o do Obra 360. A carga dia a dia é do domínio
 * (src/domain/resource-usage.ts); colunas, somas e rótulos ficam nas funções puras exportadas,
 * cobertas por tests/resource-views.test.ts. */

export interface ResourceUsageViewProps {
  tasks: PlanTask[];
  info: ReadonlyMap<string, TaskSchedule>;
  teams: Team[];
  calendar: WorkCalendar;
  /** Janela do plano (três meses). */
  window: { start: string; end: string };
  today: string;
  /** 'dia': uma coluna por dia; 'semana' e 'mes': uma coluna por semana, com a soma dos dias. */
  zoom: GanttZoom;
  selectedId?: string;
  onSelect: (id: string) => void;
  /** Duplo clique ou Enter numa tarefa: "Informações da tarefa". */
  onOpenTask?: (id: string) => void;
  className?: string;
}

// ————— Funções puras —————

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const HOURS = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Data AAAA-MM-DD que existe no calendário (30/02 não passa). */
export const validDate = (date: unknown): date is string => {
  if (typeof date !== 'string' || !ISO.test(date)) return false;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
};
/** Segunda-feira da semana: as semanas da obra começam na segunda, como no curto prazo. */
export const mondayOf = (date: string) => addUtcDays(date, -((weekdayOf(date) + 6) % 7));
/** Jornada do calendário; cadastro inválido vale as 8 h do calendário padrão. */
export const hoursPerDayOf = (calendar: Pick<WorkCalendar, 'hoursPerDay'> | undefined) =>
  calendar && Number.isFinite(calendar.hoursPerDay) && calendar.hoursPerDay > 0 ? calendar.hoursPerDay : 8;

/** "8", "4,5", "1.000": horas sem casas inúteis, no formato brasileiro. */
export const formatHours = (hours: number) => HOURS.format(Number.isFinite(hours) ? hours : 0);
/** Célula da grade: "8h", "16h"; vazia sem trabalho, como no Project. */
export const cellLabel = (hours: number) => (Number.isFinite(hours) && hours > 0 ? `${formatHours(hours)}h` : '');
/** Coluna Trabalho: "64 hrs", "0 hrs". */
export const workLabel = (hours: number) => `${formatHours(hours)} hrs`;

/** O domínio recusa período inválido; dado antigo com data trocada não pode derrubar a visão:
 * linha sem data válida sai, e término antes do início vira tarefa de um dia (como no Gantt). */
export function saneTasks(tasks: readonly ResourceTask[]): ResourceTask[] {
  return tasks.filter(t => validDate(t.start) && validDate(t.end)).map(t => (t.end < t.start ? { ...t, end: t.start } : t));
}

/** Período da grade: a janela do plano mais as datas das tarefas, em semanas inteiras (segunda a
 * domingo). Sem nenhuma data válida, não há grade. */
export function usageRange(
  tasks: readonly Pick<ResourceTask, 'start' | 'end'>[],
  window: { start: string; end: string },
): { start: string; end: string } | undefined {
  const dates = [window.start, window.end, ...tasks.flatMap(t => [t.start, t.end])].filter(validDate);
  if (!dates.length) return undefined;
  const min = dates.reduce((a, b) => (b < a ? b : a)),
    max = dates.reduce((a, b) => (b > a ? b : a));
  return { start: mondayOf(min), end: addUtcDays(mondayOf(max), 6) };
}

export interface UsageColumn {
  /** Primeiro dia da coluna. */
  key: string;
  start: string;
  end: string;
  /** Faixa de baixo: letra do dia ("S") na escala Dias, dia e mês da segunda ("14/09") nas outras. */
  label: string;
  title: string;
  /** Faixa de cima: a semana (escala Dias) ou o mês da segunda (Semanas e Meses). */
  group: string;
  groupLabel: string;
  /** Dia não útil do calendário, sombreado; só na escala Dias. */
  off: boolean;
}

/** Colunas da grade. Na escala Dias, como o Project: semana em cima ("14/Set/26") e a letra do dia
 * embaixo; em Semanas e Meses, o mês em cima e a segunda-feira de cada semana embaixo. */
export function usageColumns(range: { start: string; end: string } | undefined, zoom: GanttZoom, calendar: WorkCalendar): UsageColumn[] {
  const out: UsageColumn[] = [];
  if (!range || !validDate(range.start) || !validDate(range.end) || range.end < range.start) return out;
  if (zoom === 'dia') {
    for (let d = range.start; d <= range.end; d = addUtcDays(d, 1)) {
      const monday = mondayOf(d);
      out.push({
        key: d,
        start: d,
        end: d,
        label: WEEKDAY_LETTERS[weekdayOf(d)],
        title: shortDate(d),
        group: monday,
        groupLabel: `${monday.slice(8, 10)}/${monthLabel(monday)}`,
        off: !isWorking(d, calendar),
      });
    }
    return out;
  }
  for (let d = mondayOf(range.start); d <= range.end; d = addUtcDays(d, 7)) {
    const end = addUtcDays(d, 6);
    out.push({
      key: d,
      start: d,
      end,
      label: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
      title: `Semana de ${shortDate(d)} a ${shortDate(end)}`,
      group: d.slice(0, 7),
      groupLabel: monthLabel(d),
      off: false,
    });
  }
  return out;
}

/** Faixa de cima da escala: colunas seguidas do mesmo grupo viram uma célula só. */
export function columnGroups(columns: readonly UsageColumn[]): { key: string; label: string; span: number }[] {
  const out: { key: string; label: string; span: number }[] = [];
  for (const col of columns) {
    const last = out.at(-1);
    if (last?.key === col.group) last.span++;
    else out.push({ key: col.group, label: col.groupLabel, span: 1 });
  }
  return out;
}

export interface UsageCell {
  /** Horas trabalhadas no período: tarefas ativas × jornada, dia a dia. */
  hours: number;
  /** Horas disponíveis: unidades máximas × jornada × dias úteis do período. */
  available: number;
  /** Algum dia do período passa das unidades máximas. */
  over: boolean;
}

/** Soma a carga dia a dia de um recurso em cada coluna da grade. */
export function resourceCells(
  load: readonly DayLoad[],
  columns: readonly UsageColumn[],
  capacity: number,
  hoursPerDay: number,
): UsageCell[] {
  const byDate = new Map(load.map(day => [day.date, day]));
  return columns.map(col => {
    let hours = 0,
      available = 0,
      over = false;
    for (let d = col.start; d <= col.end; d = addUtcDays(d, 1)) {
      const day = byDate.get(d);
      if (!day) continue;
      hours += day.count * hoursPerDay;
      if (day.working) available += capacity * hoursPerDay;
      over ||= day.over;
    }
    return { hours, available, over };
  });
}

/** Dias trabalhados da tarefa entre `from` e `to`: dia útil do calendário em que ela ocupa a equipe
 * (`activeOn` do domínio), o que já tira o marco e a pausa da tarefa dividida. */
const activeDaysBetween = (task: ResourceTask, from: string, to: string, calendar: WorkCalendar) => {
  let count = 0;
  for (let d = from; d <= to; d = addUtcDays(d, 1)) if (isWorking(d, calendar) && activeOn(task, d)) count++;
  return count;
};

/** Horas de uma tarefa em cada coluna: dias trabalhados dela dentro da coluna × jornada. Marco não
 * tem trabalho, e os dias parados da tarefa dividida ficam vazios, como no Project. */
export function taskCells(task: ResourceTask, columns: readonly UsageColumn[], calendar: WorkCalendar): number[] {
  const hours = hoursPerDayOf(calendar);
  return columns.map(col => {
    if (task.milestone || task.end < col.start || task.start > col.end) return 0;
    const from = task.start > col.start ? task.start : col.start,
      to = task.end < col.end ? task.end : col.end;
    return activeDaysBetween(task, from, to, calendar) * hours;
  });
}

/** Trabalho total da tarefa (coluna Trabalho): todos os dias trabalhados dela, dentro ou fora da
 * grade, sem a pausa da tarefa dividida. */
export const taskWorkHours = (task: ResourceTask, calendar: WorkCalendar) =>
  task.milestone || task.end < task.start ? 0 : activeDaysBetween(task, task.start, task.end, calendar) * hoursPerDayOf(calendar);

export type UsageLine =
  { kind: 'resource'; key: string; row: ResourceRow } | { kind: 'task'; key: string; row: ResourceRow; task: ResourceTask };

/** Chave da linha do recurso; a das tarefas é o id delas. */
export const resourceKey = (row: Pick<ResourceRow, 'team'>) => `recurso:${row.team?.id ?? 'sem-alocacao'}`;

/** Linhas visíveis da tabela: "Sem alocação" primeiro (no Project ela é a linha 0), depois as
 * equipes na ordem do cadastro, cada uma seguida das tarefas dela, salvo se estiver recolhida. */
export function usageOutline(rows: readonly ResourceRow[], collapsed: ReadonlySet<string>): UsageLine[] {
  const out: UsageLine[] = [];
  for (const row of [...rows.filter(r => !r.team), ...rows.filter(r => r.team)]) {
    const key = resourceKey(row);
    out.push({ kind: 'resource', key, row });
    if (!collapsed.has(key)) for (const task of row.tasks) out.push({ kind: 'task', key: task.id, row, task });
  }
  return out;
}

// ————— Componente —————

/** Larguras das colunas fixas e posição de cada uma ao rolar para o lado. */
const COL = { ind: 30, name: 232, work: 76, detail: 52 } as const;
const LEFT = { ind: 0, name: COL.ind, work: COL.ind + COL.name, detail: COL.ind + COL.name + COL.work } as const;
const FROZEN = LEFT.detail + COL.detail;
/** Largura de uma coluna da grade: o dia cabe "16h"; a semana cabe "120h". */
export const USAGE_CELL_PX: Record<GanttZoom, number> = { dia: 40, semana: 60, mes: 60 };
/** Cada faixa da escala tem 22 px: as duas somam os 44 px do cabeçalho da tabela do cronograma. */
const TIER = 22;
/** Base das células do cabeçalho; cor, fundo e peso ficam em `HEAD` ou na própria coluna da escala, sem
 * duas classes da mesma propriedade na mesma célula. */
const HEAD_BASE = 'border-b border-r border-slate-200 px-1.5 text-[11px] whitespace-nowrap overflow-hidden';
const HEAD = `${HEAD_BASE} bg-brand-50 font-semibold text-brand-900`;
const BODY = 'h-[26px] border-b border-r border-slate-200 px-1.5 whitespace-nowrap overflow-hidden text-ellipsis tabular-nums';
const SCROLL =
  '[scrollbar-gutter:stable] [scrollbar-width:auto] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-100 [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:bg-slate-100';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Borda mais grossa depois da coluna Detalhe, no lugar da divisória entre tabela e grade do Project. */
const SPLIT: CSSProperties = { borderRightWidth: 2, borderRightColor: CHART.gridStrong };
/** Hoje: a mesma linha âmbar do Gantt, aqui como moldura fina da coluna. */
const TODAY_EDGE: CSSProperties = { boxShadow: `inset 1px 0 0 ${CHART.today}99, inset -1px 0 0 ${CHART.today}99` };

export function ResourceUsageView({
  tasks,
  info,
  teams,
  calendar,
  window: planWindow,
  today,
  zoom,
  selectedId,
  onSelect,
  onOpenTask,
  className = '',
}: ResourceUsageViewProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hours = hoursPerDayOf(calendar);
  const cellPx = USAGE_CELL_PX[zoom];
  const items = useMemo(() => saneTasks(resourceTasks(tasks, info)), [tasks, info]);
  const rows = useMemo(() => resourceRows(items, teams, calendar), [items, teams, calendar]);
  // A janela entra pelas datas, não pelo objeto: um `{ start, end }` novo a cada render não pode refazer a grade.
  const range = useMemo(
    () => usageRange(items, { start: planWindow.start, end: planWindow.end }),
    [items, planWindow.start, planWindow.end],
  );
  const columns = useMemo(() => usageColumns(range, zoom, calendar), [range, zoom, calendar]);
  const groups = useMemo(() => columnGroups(columns), [columns]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const lines = useMemo(() => usageOutline(rows, collapsed), [rows, collapsed]);
  const [focusKey, setFocusKey] = useState<string>();

  // Horas de cada linha por coluna, numa passada: carga do recurso pelo domínio, horas da tarefa pela interseção.
  const grid = useMemo(() => {
    const resource = new Map<string, UsageCell[]>(),
      task = new Map<string, number[]>();
    if (!columns.length) return { resource, task };
    const from = columns[0].start,
      to = columns[columns.length - 1].end;
    for (const row of rows) {
      if (row.team) resource.set(resourceKey(row), resourceCells(dailyLoad(row, from, to, calendar), columns, row.capacity, hours));
      // Sem recurso não há trabalho: as tarefas de "Sem alocação" ficam com a grade vazia, como no Project.
      for (const t of row.tasks) if (row.team) task.set(t.id, taskCells(t, columns, calendar));
    }
    return { resource, task };
  }, [rows, columns, calendar, hours]);
  // Tarefas ativas em algum dia de superalocação da equipe: ganham o indicador na linha delas.
  const hot = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) if (row.overallocated) overallocatedTaskIds(row, calendar).forEach(id => ids.add(id));
    return ids;
  }, [rows, calendar]);

  const resourceKeys = rows.map(resourceKey);
  const allCollapsed = resourceKeys.length > 0 && resourceKeys.every(key => collapsed.has(key));
  const toggle = (key: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(resourceKeys));

  // Ao abrir e a cada troca de escala, a rolagem horizontal leva hoje (ou o início da janela) para
  // perto da borda da tabela. Só a escala reposiciona: editar uma tarefa não arrasta a vista.
  const anchor = validDate(today) && range && today >= range.start && today <= range.end ? today : planWindow.start;
  const anchorIndex = Math.max(
    0,
    columns.findIndex(col => col.start <= anchor && anchor <= col.end),
  );
  const placed = useRef<GanttZoom | null>(null);
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !columns.length || placed.current === zoom) return;
    placed.current = zoom;
    node.scrollLeft = Math.max(0, (anchorIndex - 2) * cellPx);
  }, [zoom, anchorIndex, cellPx, columns.length]);

  // A tarefa selecionada em outra visão aparece na vertical, sem mexer na rolagem lateral.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !selectedId) return;
    const row = node.querySelector<HTMLElement>(`[data-usage-row="${CSS.escape(selectedId)}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop;
    if (top - TIER * 2 < node.scrollTop) node.scrollTop = top - TIER * 2;
    else if (top + row.offsetHeight > node.scrollTop + node.clientHeight) node.scrollTop = top + row.offsetHeight - node.clientHeight;
  }, [selectedId]);

  // Só uma linha entra na ordem do Tab (a focada, a selecionada ou a primeira); as setas andam entre elas.
  const tabbable = lines.some(l => l.key === focusKey) ? focusKey : (lines.find(l => l.key === selectedId)?.key ?? lines[0]?.key);
  const moveTo = (index: number) => {
    const line = lines[index];
    if (!line) return;
    setFocusKey(line.key);
    if (line.kind === 'task') onSelect(line.task.id);
    requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-usage-row="${CSS.escape(line.key)}"]`)?.focus());
  };
  const onRowKey = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    const line = lines[index];
    if (event.target !== event.currentTarget) return;
    switch (event.key) {
      case 'ArrowDown':
        moveTo(index + 1);
        break;
      case 'ArrowUp':
        moveTo(index - 1);
        break;
      case 'Home':
        moveTo(0);
        break;
      case 'End':
        moveTo(lines.length - 1);
        break;
      case 'ArrowRight':
        if (line.kind !== 'resource') return;
        if (collapsed.has(line.key)) toggle(line.key);
        else if (lines[index + 1]?.kind === 'task') moveTo(index + 1);
        break;
      case 'ArrowLeft':
        if (line.kind === 'resource') {
          if (!collapsed.has(line.key)) toggle(line.key);
        } else moveTo(lines.findIndex(l => l.key === resourceKey(line.row)));
        break;
      case 'Enter':
        if (line.kind === 'resource') toggle(line.key);
        else onOpenTask?.(line.task.id);
        break;
      case ' ':
        if (line.kind === 'resource') toggle(line.key);
        else onSelect(line.task.id);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const teamCount = rows.filter(r => r.team).length;
  const overCount = rows.filter(r => r.overallocated).length;
  const looseCount = rows.find(r => !r.team)?.tasks.length ?? 0;
  const width = FROZEN + columns.length * cellPx;
  const isToday = (col: UsageColumn) => col.start <= today && today <= col.end;
  const outside = (col: UsageColumn) => col.end < planWindow.start || col.start > planWindow.end;

  if (!lines.length || !columns.length)
    return (
      <div className={`flex min-h-0 flex-col bg-white ${className}`} data-tour="medio-uso-recursos">
        <p className="p-4 text-sm leading-6 text-slate-500">
          Sem equipes nem tarefas para mostrar. As equipes são os recursos do cronograma e são cadastradas em Configurações da obra; as
          tarefas do plano aparecem aqui sob a equipe atribuída a elas.
        </p>
      </div>
    );

  return (
    <div className={`flex min-h-0 min-w-0 flex-col bg-white ${className}`} data-tour="medio-uso-recursos">
      <div ref={scrollRef} role="region" aria-label="Uso dos recursos" tabIndex={-1} className={`min-h-0 flex-1 overflow-auto ${SCROLL}`}>
        <table
          role="treegrid"
          aria-label="Uso dos recursos: trabalho por equipe e por tarefa em cada período"
          className="border-separate border-spacing-0 text-xs text-slate-700"
          style={{ tableLayout: 'fixed', width }}
        >
          <colgroup>
            <col style={{ width: COL.ind }} />
            <col style={{ width: COL.name }} />
            <col style={{ width: COL.work }} />
            <col style={{ width: COL.detail }} />
            {columns.map(col => (
              <col key={col.key} style={{ width: cellPx }} />
            ))}
          </colgroup>
          <thead>
            <tr role="row">
              <th
                rowSpan={2}
                scope="col"
                title="Indicadores"
                className={`${HEAD} sticky top-0 z-40 text-center`}
                style={{ left: LEFT.ind }}
              >
                <span aria-hidden>ⓘ</span>
                <span className="sr-only">Indicadores</span>
              </th>
              <th rowSpan={2} scope="col" className={`${HEAD} sticky top-0 z-40 text-left`} style={{ left: LEFT.name }}>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={toggleAll}
                    aria-label={allCollapsed ? 'Expandir todos os recursos' : 'Recolher todos os recursos'}
                    title={allCollapsed ? 'Expandir todos os recursos' : 'Recolher todos os recursos'}
                    className="rounded p-0.5 text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {allCollapsed ? <ChevronRight size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
                  </button>
                  Nome do recurso
                </span>
              </th>
              <th
                rowSpan={2}
                scope="col"
                title="Dias úteis das tarefas × jornada do calendário"
                className={`${HEAD} sticky top-0 z-40 text-right`}
                style={{ left: LEFT.work }}
              >
                Trabalho
              </th>
              <th rowSpan={2} scope="col" className={`${HEAD} sticky top-0 z-40 text-left`} style={{ left: LEFT.detail, ...SPLIT }}>
                Detalhe
              </th>
              {groups.map(group => (
                <th
                  key={group.key}
                  colSpan={group.span}
                  scope="colgroup"
                  className={`${HEAD} sticky top-0 z-20 text-left`}
                  style={{ height: TIER }}
                  title={zoom === 'dia' ? `Semana de ${shortDate(group.key)}` : group.label}
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr role="row">
              {columns.map(col => {
                const now = isToday(col);
                return (
                  <th
                    key={col.key}
                    scope="col"
                    title={`${col.title}${now ? ' (hoje)' : ''}${outside(col) ? ' · fora do horizonte do plano' : ''}`}
                    className={`${HEAD_BASE} sticky z-20 text-center tabular-nums ${now ? 'font-bold' : 'font-medium'} ${
                      outside(col) ? 'text-slate-400' : col.off ? 'text-slate-500' : 'text-brand-900'
                    } ${col.off ? 'bg-slate-100' : 'bg-brand-50'}`}
                    style={{
                      top: TIER,
                      height: TIER,
                      ...(now ? { color: CHART.today, boxShadow: `inset 0 -3px 0 ${CHART.today}` } : {}),
                    }}
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const { row } = line;
              const focusable = line.key === tabbable ? 0 : -1;
              const rowClass =
                'group outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary cursor-default';
              const nameRing = 'group-focus-visible:shadow-[inset_0_0_0_2px_var(--color-primary)]';

              if (line.kind === 'resource') {
                const open = !collapsed.has(line.key);
                const name = row.team ? row.team.name : 'Sem alocação';
                const over = row.overallocated;
                const cells = grid.resource.get(line.key);
                const frozen = `${BODY} sticky z-10 bg-slate-50`;
                return (
                  <tr
                    key={line.key}
                    role="row"
                    aria-level={1}
                    aria-expanded={open}
                    data-usage-row={line.key}
                    tabIndex={focusable}
                    className={rowClass}
                    onClick={() => setFocusKey(line.key)}
                    onDoubleClick={() => toggle(line.key)}
                    onKeyDown={event => onRowKey(event, index)}
                  >
                    <td className={`${frozen} text-center`} style={{ left: LEFT.ind }}>
                      {over && (
                        <span
                          className="inline-flex align-middle text-danger"
                          title={`Superalocado: até ${row.peak} tarefas no mesmo dia para ${row.capacity} de capacidade`}
                        >
                          <TriangleAlert size={13} aria-hidden />
                          <span className="sr-only">Superalocado</span>
                        </span>
                      )}
                    </td>
                    <td
                      className={`${frozen} ${nameRing} font-bold ${over ? 'text-danger' : row.team ? 'text-slate-800' : 'text-slate-600'}`}
                      style={{ left: LEFT.name }}
                      title={
                        row.team
                          ? `${row.team.company} · ${row.team.name} · unidades máximas ${row.capacity * 100}%`
                          : 'Tarefas sem equipe atribuída: sem recurso, não somam trabalho'
                      }
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={event => {
                            event.stopPropagation();
                            toggle(line.key);
                            setFocusKey(line.key);
                            // O foco volta para a linha: as setas continuam andando pela tabela.
                            event.currentTarget.closest('tr')?.focus();
                          }}
                          aria-label={open ? `Recolher ${name}` : `Expandir ${name}`}
                          className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-brand-100"
                        >
                          {open ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />}
                        </button>
                        <span className="truncate">
                          {name}
                          {row.team && <span className="font-normal text-slate-400"> · {row.team.company}</span>}
                        </span>
                      </span>
                    </td>
                    <td className={`${frozen} text-right font-bold ${over ? 'text-danger' : ''}`} style={{ left: LEFT.work }}>
                      {workLabel(row.team ? row.workDays * hours : 0)}
                    </td>
                    <td className={`${frozen} text-slate-500`} style={{ left: LEFT.detail, ...SPLIT }}>
                      Trab.
                    </td>
                    {columns.map((col, at) => {
                      const cell = cells?.[at];
                      const value = cell?.hours ?? 0;
                      return (
                        <td
                          key={col.key}
                          className={`${BODY} text-right ${
                            cell?.over
                              ? 'bg-danger-soft font-bold text-danger'
                              : `font-semibold ${col.off ? 'bg-slate-200/70' : 'bg-slate-50'}`
                          }`}
                          style={isToday(col) ? TODAY_EDGE : undefined}
                          title={
                            cell && (value > 0 || cell.over)
                              ? `${name} · ${col.title}: ${formatHours(value)} h de ${formatHours(cell.available)} h disponíveis${
                                  cell.over ? ' — superalocado' : ''
                                }`
                              : undefined
                          }
                        >
                          {cellLabel(value)}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              const { task } = line;
              const selected = task.id === selectedId;
              const cells = grid.task.get(task.id);
              const frozen = `${BODY} sticky z-10 ${selected ? 'bg-primary-soft' : 'bg-white'}`;
              return (
                <tr
                  key={line.key}
                  role="row"
                  aria-level={2}
                  aria-selected={selected}
                  data-usage-row={line.key}
                  tabIndex={focusable}
                  className={rowClass}
                  onClick={() => {
                    setFocusKey(line.key);
                    onSelect(task.id);
                  }}
                  onDoubleClick={() => onOpenTask?.(task.id)}
                  onKeyDown={event => onRowKey(event, index)}
                >
                  <td className={`${frozen} text-center`} style={{ left: LEFT.ind }}>
                    {hot.has(task.id) && (
                      <span className="inline-flex align-middle text-danger/70" title="Ativa em dia em que a equipe passa da capacidade">
                        <TriangleAlert size={12} aria-hidden />
                        <span className="sr-only">Em superalocação</span>
                      </span>
                    )}
                  </td>
                  <td
                    className={`${frozen} ${nameRing} italic text-slate-700`}
                    // O recuo da atribuição sob o recurso, como no Project; inline para não brigar com o px da célula.
                    style={{ left: LEFT.name, paddingLeft: 30 }}
                    title={`${task.name} · ${task.milestone ? `marco em ${shortDate(task.start)}` : `${shortDate(task.start)} a ${shortDate(task.end)}`}${
                      task.pause ? ` · dividida, parada de ${shortDate(task.pause.from)} a ${shortDate(task.pause.to)}` : ''
                    }${onOpenTask ? ' · duplo clique abre as informações da tarefa' : ''}`}
                  >
                    {task.name}
                  </td>
                  <td className={`${frozen} text-right italic`} style={{ left: LEFT.work }}>
                    {workLabel(row.team ? taskWorkHours(task, calendar) : 0)}
                  </td>
                  <td className={`${frozen} text-slate-500`} style={{ left: LEFT.detail, ...SPLIT }}>
                    Trab.
                  </td>
                  {columns.map((col, at) => {
                    const value = cells?.[at] ?? 0;
                    return (
                      <td
                        key={col.key}
                        className={`${BODY} text-right ${col.off ? 'bg-slate-100' : selected ? 'bg-primary-soft/60' : 'bg-white'}`}
                        style={isToday(col) ? TODAY_EDGE : undefined}
                        title={value > 0 ? `${task.name} · ${col.title}: ${formatHours(value)} h` : undefined}
                      >
                        {cellLabel(value)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
        <span>
          {plural(teamCount, 'recurso', 'recursos')} ·{' '}
          <span className={overCount ? 'font-semibold text-danger' : ''}>{plural(overCount, 'superalocado', 'superalocados')}</span>
          {looseCount > 0 && ` · ${plural(looseCount, 'tarefa sem alocação', 'tarefas sem alocação')}`}
        </span>
        <span>Trabalho = dias úteis × jornada de {formatHours(hours)} h</span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-danger-ring bg-danger-soft align-middle" aria-hidden />
          acima das unidades máximas
        </span>
        {zoom === 'dia' ? (
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-slate-300 bg-slate-200 align-middle" aria-hidden />
            dia não útil
          </span>
        ) : (
          <span>Uma coluna por semana, de segunda a domingo, com a soma dos dias</span>
        )}
      </div>
    </div>
  );
}

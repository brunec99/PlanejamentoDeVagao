import type { Id, LocalDate, PlanTask, Team } from './entities';
import { DEFAULT_CALENDAR, isWorking, type TaskSchedule, type WorkCalendar } from './plan-schedule';
import { addDays, validatePeriod } from './validation';

/* Carga dos recursos do plano do mês, como o Planejador de Equipe, o Uso dos Recursos e a Planilha
 * de Recursos do Project mostram. Cada equipe da obra é um recurso; as "Unidades máximas" são a
 * capacidade cadastrada (atividades simultâneas), e o recurso fica superalocado no dia em que tem
 * mais tarefas ao mesmo tempo do que isso. O trabalho é contado em dias úteis da tarefa vezes a
 * jornada do calendário: uma equipe numa tarefa de 3 dias soma 24 h com jornada de 8 h. */

export interface ResourceTask {
  id: Id;
  name: string;
  start: LocalDate;
  end: LocalDate;
  teamId?: Id;
  progress: number;
  milestone: boolean;
  critical: boolean;
  /** Tem início real: o Project não reprograma o início do que já começou. */
  started?: boolean;
  /** Tarefa dividida (iniciada, com o restante empurrado por predecessora aberta): os dias
   * parados entre o último dia trabalhado e a retomada, inclusive. A equipe fica livre neles. */
  pause?: { from: LocalDate; to: LocalDate };
}
/** A tarefa ocupa a equipe no dia: dentro do período, fora da pausa, e não é marco. */
export const activeOn = (task: ResourceTask, date: LocalDate) =>
  !task.milestone && task.start <= date && date <= task.end && !(task.pause && task.pause.from <= date && date <= task.pause.to);
export interface ResourceRow {
  /** `null` é a faixa "Tarefas não atribuídas" do Planejador de Equipe. */
  team: Team | null;
  capacity: number;
  /** Em ordem de início. */
  tasks: ResourceTask[];
  /** Subfaixas sem sobreposição, na ordem de início: com uma só, o recurso cabe numa linha; com
   * mais, o Planejador de Equipe abre a linha do recurso e empilha as tarefas que se cruzam. */
  lanes: ResourceTask[][];
  /** Dias úteis de trabalho somados (marco não conta). */
  workDays: number;
  /** Maior número de tarefas no mesmo dia útil. */
  peak: number;
  overallocated: boolean;
}
export interface DayLoad {
  date: LocalDate;
  working: boolean;
  /** Tarefas com duração ativas no dia (marco não ocupa a equipe). */
  taskIds: Id[];
  count: number;
  over: boolean;
}

/** Capacidade em atividades simultâneas; cadastro zerado ou inválido vale 1, como as "Unidades
 * máximas" de 100% que o Project dá a todo recurso novo. */
export const capacityOf = (team: Pick<Team, 'weeklyCapacity'>) =>
  Number.isFinite(team.weeklyCapacity) && team.weeklyCapacity >= 1 ? Math.floor(team.weeklyCapacity) : 1;

/** As linhas do plano que ocupam recurso: as subtarefas (o resumo é só envelope), com as datas
 * agendadas pelo motor e a criticidade dele. A data que cai na ponta errada do dia não ocupa o
 * dia: o término às 08:00 de segunda (IT sem defasagem, dias corridos) libera a equipe na segunda,
 * e o início às 17:00 de sexta (dias corridos depois de tarefa que termina na sexta) não a ocupa
 * na sexta. */
export function resourceTasks(tasks: PlanTask[], info: ReadonlyMap<Id, TaskSchedule>): ResourceTask[] {
  const rows = [...tasks].sort((a, b) => a.order - b.order);
  return rows
    .filter((t, i) => !(rows[i + 1]?.level > t.level))
    .map(t => {
      const milestone = t.duration?.value === 0,
        schedule = info.get(t.id),
        edges = schedule?.edges;
      let start = t.plannedStart,
        end = t.plannedEnd;
      if (!milestone && edges?.earlyStart === 'end') start = addDays(start, 1);
      if (!milestone && edges?.earlyFinish === 'start') end = addDays(end, -1);
      if (end < start) end = start;
      const pause =
        schedule?.stop && schedule.resume && addDays(schedule.stop, 1) <= addDays(schedule.resume, -1)
          ? { from: addDays(schedule.stop, 1), to: addDays(schedule.resume, -1) }
          : undefined;
      return {
        id: t.id,
        name: t.name,
        start,
        end,
        teamId: t.teamId,
        progress: t.progress,
        milestone,
        critical: !!schedule?.critical,
        started: !!t.actualStart,
        ...(pause ? { pause } : {}),
      };
    });
}

const days = (task: ResourceTask, c: WorkCalendar) => {
  const out: LocalDate[] = [];
  if (task.milestone) return out;
  for (let d = task.start; d <= task.end; d = addDays(d, 1)) if (isWorking(d, c) && activeOn(task, d)) out.push(d);
  return out;
};

/** Subfaixas: cada tarefa vai para a primeira faixa em que a anterior já terminou. */
export function stackLanes(tasks: ResourceTask[]): ResourceTask[][] {
  const lanes: ResourceTask[][] = [];
  for (const task of [...tasks].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))) {
    const lane = lanes.find(l => l[l.length - 1].end < task.start);
    if (lane) lane.push(task);
    else lanes.push([task]);
  }
  return lanes;
}

/** Uma linha por equipe da obra, na ordem do cadastro (empresa e nome), mais a faixa das tarefas
 * sem equipe no fim — só quando houver alguma. Tarefa com equipe que não está na lista (excluída)
 * cai nas não atribuídas. */
export function resourceRows(tasks: ResourceTask[], teams: Team[], calendar: WorkCalendar = DEFAULT_CALENDAR): ResourceRow[] {
  for (const t of tasks) validatePeriod(t.start, t.end);
  const known = new Set(teams.map(t => t.id));
  const sorted = [...teams].sort((a, b) => a.company.localeCompare(b.company, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
  const row = (team: Team | null, own: ResourceTask[]): ResourceRow => {
    const capacity = team ? capacityOf(team) : Infinity;
    const count = new Map<LocalDate, number>();
    let workDays = 0;
    for (const task of own)
      for (const d of days(task, calendar)) {
        count.set(d, (count.get(d) ?? 0) + 1);
        workDays++;
      }
    const peak = Math.max(0, ...count.values());
    const ordered = [...own].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    return {
      team,
      capacity: team ? capacity : 0,
      tasks: ordered,
      lanes: stackLanes(ordered),
      workDays,
      peak,
      overallocated: !!team && peak > capacity,
    };
  };
  const rows = sorted.map(team =>
    row(
      team,
      tasks.filter(t => t.teamId === team.id),
    ),
  );
  const loose = tasks.filter(t => !t.teamId || !known.has(t.teamId));
  if (loose.length) rows.push(row(null, loose));
  return rows;
}

/** Carga dia a dia de um recurso, do `from` ao `to`, para a grade do Uso dos Recursos. */
export function dailyLoad(row: ResourceRow, from: LocalDate, to: LocalDate, calendar: WorkCalendar = DEFAULT_CALENDAR): DayLoad[] {
  validatePeriod(from, to);
  const out: DayLoad[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const working = isWorking(date, calendar);
    const taskIds = working ? row.tasks.filter(t => activeOn(t, date)).map(t => t.id) : [];
    out.push({ date, working, taskIds, count: taskIds.length, over: !!row.team && taskIds.length > row.capacity });
  }
  return out;
}

/** Tarefas que causam a superalocação do recurso: as que estão ativas em algum dia acima da capacidade. */
export function overallocatedTaskIds(row: ResourceRow, calendar: WorkCalendar = DEFAULT_CALENDAR): Set<Id> {
  const ids = new Set<Id>();
  if (!row.team || !row.tasks.length) return ids;
  const from = row.tasks.reduce((m, t) => (t.start < m ? t.start : m), row.tasks[0].start);
  const to = row.tasks.reduce((m, t) => (t.end > m ? t.end : m), row.tasks[0].end);
  for (const day of dailyLoad(row, from, to, calendar)) if (day.over) day.taskIds.forEach(id => ids.add(id));
  return ids;
}

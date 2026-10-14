import type { ConstraintType, Id, LocalDate, MediumTermPlan, PlanTask, PlanDependency } from './entities';
import { addDays, validateDate, validatePeriod } from './validation';
export interface WorkCalendar {
  weekdays: number[];
  hoursPerDay: number;
  daysPerMonth: number;
  holidays: string[];
}
export interface TaskDuration {
  value: number;
  unit: 'h' | 'd' | 'dd' | 'mês' | 'md';
}
export const DEFAULT_CALENDAR: WorkCalendar = { weekdays: [1, 2, 3, 4, 5], hoursPerDay: 8, daysPerMonth: 20, holidays: [] };
export function validateCalendar(c: WorkCalendar) {
  if (
    !c ||
    !Array.isArray(c.weekdays) ||
    !c.weekdays.length ||
    c.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6) ||
    new Set(c.weekdays).size !== c.weekdays.length
  )
    throw new Error('Selecione dias úteis válidos.');
  if (
    !Number.isFinite(c.hoursPerDay) ||
    c.hoursPerDay <= 0 ||
    c.hoursPerDay > 24 ||
    !Number.isInteger(c.daysPerMonth) ||
    c.daysPerMonth < 1 ||
    c.daysPerMonth > 31
  )
    throw new Error('Jornada ou dias por mês inválidos.');
  if (!Array.isArray(c.holidays) || c.holidays.length > 1000) throw new Error('Calendário aceita até 1000 feriados.');
  c.holidays.forEach(validateDate);
}
/** Unidades aceitas na célula de duração, como o Project escreve em português. `d` e `dias` são
 * úteis; `dd` e `dias corridos` (ou `decorridos`) contam fim de semana e feriado. */
const DURATION_UNITS: Record<string, TaskDuration['unit']> = {
  '': 'd',
  d: 'd',
  dia: 'd',
  dias: 'd',
  dd: 'dd',
  'dia corrido': 'dd',
  'dias corridos': 'dd',
  'dia decorrido': 'dd',
  'dias decorridos': 'dd',
  h: 'h',
  hr: 'h',
  hrs: 'h',
  hora: 'h',
  horas: 'h',
  mês: 'mês',
  mes: 'mês',
  meses: 'mês',
  md: 'md',
  'mês corrido': 'md',
  'mes corrido': 'md',
  'meses corridos': 'md',
  'mês decorrido': 'md',
  'mes decorrido': 'md',
  'meses decorridos': 'md',
};
/** Duração digitada como no Project: `10`, `10d`, `10 dias`, `10dd`, `10 dias corridos`, `8h`,
 * `8 horas`, `1mês`, `2 meses`, `1md`. Zero é marco. O `?` de duração estimada é ignorado. */
export function parseDuration(raw: string): TaskDuration {
  const match = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .match(/^(\d+(?:[.,]\d+)?)\s*([a-zçê ]*?)\s*\??$/);
  const unit = match ? DURATION_UNITS[match[2]] : undefined;
  if (!match || !unit) throw new Error('Use duração como 0 (marco), 8h, 10d, 10 dias, 10dd, 10 dias corridos, 1mês ou 1md.');
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > 10000) throw new Error('Duração deve ficar entre 0 (marco) e 10000 unidades.');
  return { value, unit };
}
/** O texto de volta para a célula, no português do Project: `0 dias`, `1 dia`, `10 dias corridos`,
 * `8 h`, `2 meses`, `1 mês corrido`. */
export function formatDuration(d: TaskDuration): string {
  const n = String(d.value).replace('.', ','),
    one = d.value === 1;
  switch (d.unit) {
    case 'h':
      return `${n} h`;
    case 'dd':
      return `${n} ${one ? 'dia corrido' : 'dias corridos'}`;
    case 'mês':
      return `${n} ${one ? 'mês' : 'meses'}`;
    case 'md':
      return `${n} ${one ? 'mês corrido' : 'meses corridos'}`;
    default:
      return `${n} ${one ? 'dia' : 'dias'}`;
  }
}
/** Marco: tarefa de duração zero, como no Project — início e término no mesmo dia. */
export const isMilestone = (t: Pick<PlanTask, 'duration'>) => t.duration?.value === 0;
export const isWorking = (date: string, c: WorkCalendar) =>
  c.weekdays.includes(new Date(date + 'T00:00:00Z').getUTCDay()) && !c.holidays.includes(date);
export function shift(date: string, amount: number, business: boolean, c: WorkCalendar): string {
  let next = date,
    left = Math.abs(amount),
    guard = 0;
  while (left > 0) {
    if (++guard > 100000) throw new Error('Período excede o limite do cronograma.');
    next = addDays(next, amount < 0 ? -1 : 1);
    if (!business || isWorking(next, c)) left--;
  }
  return next;
}
/** O próprio dia quando é útil; senão o dia útil seguinte (ou anterior). */
export const nextWorking = (date: string, c: WorkCalendar) => (isWorking(date, c) ? date : shift(date, 1, true, c));
export const previousWorking = (date: string, c: WorkCalendar) => (isWorking(date, c) ? date : shift(date, -1, true, c));

export function durationDays(duration: TaskDuration, c: WorkCalendar) {
  const d = parseDuration(`${duration.value}${duration.unit}`);
  return Math.ceil(d.value * (d.unit === 'h' ? 1 / c.hoursPerDay : d.unit === 'mês' ? c.daysPerMonth : d.unit === 'md' ? 30 : 1));
}
export const businessDuration = (d: TaskDuration) => d.unit !== 'dd' && d.unit !== 'md';
export function endFor(start: string, duration: TaskDuration, c: WorkCalendar) {
  validateDate(start);
  const days = durationDays(duration, c);
  let anchor = start;
  // O marco cai no próximo dia útil, como o início de uma tarefa de um dia.
  if ((businessDuration(duration) || !days) && !isWorking(anchor, c)) anchor = shift(anchor, 1, true, c);
  return { start: anchor, end: days ? shift(anchor, days - 1, businessDuration(duration), c) : anchor };
}
export function countedDays(start: string, end: string, business: boolean, c: WorkCalendar) {
  validatePeriod(start, end);
  if ((Date.parse(end) - Date.parse(start)) / 86400000 > 100000) throw new Error('Período excede o limite do cronograma.');
  let total = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) if (!business || isWorking(date, c)) total++;
  return total;
}
/** Dias úteis de `from` até `to`, com sinal: positivo quando `to` vem depois, negativo quando vem
 * antes, zero no mesmo dia. É a unidade das folgas do Project. */
export function signedWorkingDays(from: string, to: string, c: WorkCalendar): number {
  if (from === to) return 0;
  const [a, b, sign] = from < to ? [from, to, 1] : [to, from, -1];
  if ((Date.parse(b) - Date.parse(a)) / 86400000 > 100000) throw new Error('Período excede o limite do cronograma.');
  let n = 0;
  for (let date = addDays(a, 1); date <= b; date = addDays(date, 1)) if (isWorking(date, c)) n++;
  return sign * n;
}

// ————— Restrições —————

export const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  ASAP: 'O mais breve possível',
  ALAP: 'O mais tarde possível',
  SNET: 'Não iniciar antes de',
  SNLT: 'Não iniciar depois de',
  FNET: 'Não terminar antes de',
  FNLT: 'Não terminar depois de',
  MSO: 'Deve iniciar em',
  MFO: 'Deve terminar em',
};
/** Siglas do Project em português, as que a equipe lê na coluna "Tipo de restrição". */
export const CONSTRAINT_ABBREVIATIONS: Record<ConstraintType, string> = {
  ASAP: 'OMBP',
  ALAP: 'OMTP',
  SNET: 'NIAD',
  SNLT: 'NIDD',
  FNET: 'NTAD',
  FNLT: 'NTDD',
  MSO: 'DIE',
  MFO: 'DTE',
};
export const constraintNeedsDate = (type: ConstraintType) => type !== 'ASAP' && type !== 'ALAP';
/** Como o Project classifica: flexível (só a rede manda), semiflexível (a data é um limite num
 * sentido só) e inflexível (a data manda, mesmo contra a rede). */
export const constraintFlexibility = (type: ConstraintType): 'flexible' | 'semi' | 'inflexible' =>
  type === 'ASAP' || type === 'ALAP' ? 'flexible' : type === 'MSO' || type === 'MFO' ? 'inflexible' : 'semi';
export interface TaskConstraint {
  type: ConstraintType;
  date?: LocalDate;
}
/** A restrição da tarefa, lendo também o formato antigo (`anchorStart` = "Não iniciar antes de"). */
export function constraintOf(task: Pick<PlanTask, 'constraintType' | 'constraintDate' | 'anchorStart'>): TaskConstraint {
  if (task.constraintType)
    return constraintNeedsDate(task.constraintType)
      ? { type: task.constraintType, date: task.constraintDate }
      : { type: task.constraintType };
  if (task.anchorStart) return { type: 'SNET', date: task.anchorStart };
  return { type: 'ASAP' };
}
export function validateConstraint(constraint: TaskConstraint) {
  if (!(constraint.type in CONSTRAINT_LABELS)) throw new Error('Tipo de restrição inválido.');
  if (constraintNeedsDate(constraint.type)) {
    if (!constraint.date) throw new Error(`A restrição "${CONSTRAINT_LABELS[constraint.type]}" exige uma data.`);
    validateDate(constraint.date);
  }
}

// ————— Motor: passada direta, passada inversa, folgas e caminho crítico —————

/** O que o motor calcula para cada linha além das datas, no vocabulário do Project. As datas
 * cedo são as agendadas (a tarefa OMTP é a exceção: agendada nas tardias, por isso folga zero). */
export interface TaskSchedule {
  earlyStart: LocalDate;
  earlyFinish: LocalDate;
  lateStart: LocalDate;
  lateFinish: LocalDate;
  /** Em dias úteis; negativa quando restrição, prazo final ou data real não cabem na rede. */
  totalSlack: number;
  freeSlack: number;
  critical: boolean;
  /** O que segura a data: a rede, a restrição, a data real, o início guardado (sem predecessora) ou, no resumo, os filhos. */
  drivenBy: 'network' | 'constraint' | 'actual' | 'stored' | 'summary';
  /** Predecessoras determinantes: as que de fato fixam o início quando é a rede que manda. */
  driverIds: Id[];
  /** Algum vínculo de entrada desrespeitado — a data real ou a restrição prenderam a tarefa antes do permitido. */
  conflict: boolean;
  deadlineMissed: boolean;
}
export interface ScheduleOptions {
  /** "As tarefas são críticas se a folga for menor ou igual a N dias", como na opção do Project. */
  criticalSlack?: number;
}
export interface ScheduleAnalysis {
  tasks: PlanTask[];
  info: Map<Id, TaskSchedule>;
  projectStart?: LocalDate;
  projectFinish?: LocalDate;
}
interface LeafShape {
  duration: TaskDuration;
  days: number;
  business: boolean;
}
interface Boundary {
  link: PlanDependency;
  edge: 'start' | 'end';
  /** A data mais cedo que o vínculo permite na ponta `edge` da sucessora. */
  date: LocalDate;
  /** O início que isso implica para a sucessora. */
  start: LocalDate;
}

/** Programação automática, como o "Agendada automaticamente" do Project, com as oito restrições,
 * prazo final, passada inversa, folgas e caminho crítico.
 *
 * Tarefa com início real fica presa nele, e no término real quando houver — vínculos e restrição
 * deixam de mandar, porque o que já aconteceu não se reprograma. Sem real, o início sai da rede
 * (o mais tarde que as predecessoras permitem) e da restrição: "Não iniciar/terminar antes de"
 * só empurram para a frente; "Não iniciar/terminar depois de", "Deve iniciar em" e "Deve terminar
 * em" prendem a data mesmo contra a rede, como o Project faz com "as tarefas sempre respeitam as
 * datas de restrição", e aí o vínculo fica desrespeitado e a folga, negativa. "O mais tarde
 * possível" desliza para as datas tardias. A duração nunca muda aqui. */
export function analyzeSchedule(
  input: PlanTask[],
  links: PlanDependency[],
  calendar: WorkCalendar = DEFAULT_CALENDAR,
  options: ScheduleOptions = {},
): ScheduleAnalysis {
  validateCalendar(calendar);
  const c = calendar;
  const threshold = Number.isFinite(options.criticalSlack) ? (options.criticalSlack as number) : 0;
  const rows = structuredClone(input).sort((a, b) => a.order - b.order);
  const byId = new Map(rows.map(t => [t.id, t]));
  const summary = new Set(rows.filter((t, i) => rows[i + 1]?.level > t.level).map(t => t.id));
  const incoming = new Map<string, PlanDependency[]>();
  const outgoing = new Map<string, PlanDependency[]>();
  for (const link of links) {
    if (!byId.has(link.predecessorId) || !byId.has(link.successorId)) throw new Error('Predecessora inexistente.');
    if (summary.has(link.predecessorId) || summary.has(link.successorId)) throw new Error('Vincule as subtarefas, não as tarefas-resumo.');
    if (!['TI', 'II', 'TT', 'IT'].includes(link.type) || !Number.isInteger(link.lagDays) || Math.abs(link.lagDays) > 365)
      throw new Error('Vínculo ou defasagem inválidos.');
    const list = incoming.get(link.successorId) ?? [];
    if (list.some(l => l.predecessorId === link.predecessorId)) throw new Error('Predecessora repetida.');
    incoming.set(link.successorId, [...list, link]);
    outgoing.set(link.predecessorId, [...(outgoing.get(link.predecessorId) ?? []), link]);
  }
  // Kahn evita estouro de pilha em cadeias longas; a fila é a ordem topológica das duas passadas.
  const remaining = new Map(rows.map(t => [t.id, incoming.get(t.id)?.length ?? 0]));
  const order = rows.filter(t => remaining.get(t.id) === 0);
  for (let i = 0; i < order.length; i++)
    for (const link of outgoing.get(order[i].id) ?? []) {
      remaining.set(link.successorId, remaining.get(link.successorId)! - 1);
      if (!remaining.get(link.successorId)) order.push(byId.get(link.successorId)!);
    }
  if (order.length !== rows.length) throw new Error('Essa ligação criaria um ciclo entre as linhas.');

  const leaves = new Map<Id, LeafShape>();
  for (const task of rows) {
    if (summary.has(task.id)) continue;
    validatePeriod(task.plannedStart, task.plannedEnd);
    const duration = task.duration ?? { value: countedDays(task.plannedStart, task.plannedEnd, false, c), unit: 'dd' as const };
    leaves.set(task.id, { duration, days: durationDays(duration, c), business: businessDuration(duration) });
    validateConstraint(constraintOf(task));
    if (task.deadline) validateDate(task.deadline);
  }
  const info = new Map<Id, TaskSchedule>();
  const pinned = new Map<Id, LocalDate>();

  /** Os limites que as predecessoras impõem à sucessora, com as datas que elas têm agora. */
  const boundaries = (task: PlanTask, leaf: LeafShape): Boundary[] =>
    (incoming.get(task.id) ?? []).map(link => {
      const p = byId.get(link.predecessorId)!;
      let date = shift(link.type[0] === 'T' ? p.plannedEnd : p.plannedStart, link.lagDays, link.lagBusiness, c);
      if (link.type[1] === 'I') {
        // Como no Project, o marco fica no dia em que a predecessora termina; tarefa com duração começa no dia útil seguinte.
        if (link.type === 'TI' && leaf.days > 0) date = shift(date, 1, leaf.business, c);
        return { link, edge: 'start', date, start: date };
      }
      // Terminar quando a outra começa (às 08:00) é terminar às 17:00 do dia útil anterior; o marco não tem duração a recuar.
      if (link.type === 'IT' && leaf.days > 0) date = shift(date, -1, leaf.business, c);
      return { link, edge: 'end', date, start: leaf.days ? shift(date, -(leaf.days - 1), leaf.business, c) : date };
    });

  const forward = () => {
    for (const task of order) {
      const leaf = leaves.get(task.id);
      if (!leaf) continue;
      const bounds = boundaries(task, leaf);
      let drivenBy: TaskSchedule['drivenBy'] = 'stored',
        driverIds: Id[] = [];
      if (task.actualStart) {
        validateActualDates(task);
        task.plannedStart = task.actualStart;
        task.plannedEnd = task.actualEnd ?? (leaf.days ? endFor(task.actualStart, leaf.duration, c).end : task.actualStart);
        drivenBy = 'actual';
      } else {
        if (task.actualEnd) throw new Error('Informe o início real antes do término real.');
        const networkStart = bounds.length ? bounds.reduce((m, b) => (b.start > m ? b.start : m), bounds[0].start) : undefined;
        let base = networkStart ?? task.plannedStart;
        drivenBy = networkStart ? 'network' : 'stored';
        const constraint: TaskConstraint = pinned.has(task.id) ? { type: 'MSO', date: pinned.get(task.id) } : constraintOf(task);
        const date = constraint.date!;
        // Término em data não útil: "não antes de" vale o dia útil seguinte; "não depois de" e "deve terminar em", o anterior.
        const startToFinishFrom = (finish: LocalDate) =>
          leaf.days ? shift(finish, -(leaf.days - 1), leaf.business, c) : leaf.business ? finish : finish;
        const hold = (start: LocalDate) => {
          base = start;
          drivenBy = 'constraint';
        };
        switch (constraint.type) {
          case 'SNET':
            if (!networkStart || date > base) hold(date);
            break;
          case 'FNET': {
            const start = startToFinishFrom(leaf.business ? nextWorking(date, c) : date);
            if (!networkStart || start > base) hold(start);
            break;
          }
          case 'SNLT': {
            const start = leaf.business ? previousWorking(date, c) : date;
            if (start < base) hold(start);
            break;
          }
          case 'FNLT': {
            const start = startToFinishFrom(leaf.business ? previousWorking(date, c) : date);
            if (start < base) hold(start);
            break;
          }
          case 'MSO':
            hold(date);
            break;
          case 'MFO':
            hold(startToFinishFrom(leaf.business ? previousWorking(date, c) : date));
            break;
        }
        const dates = endFor(base, leaf.duration, c);
        task.plannedStart = dates.start;
        task.plannedEnd = dates.end;
        if (drivenBy === 'network') driverIds = bounds.filter(b => b.start === networkStart).map(b => b.link.predecessorId);
      }
      const conflict = bounds.some(b => (b.edge === 'start' ? task.plannedStart : task.plannedEnd) < b.date);
      info.set(task.id, {
        earlyStart: task.plannedStart,
        earlyFinish: task.plannedEnd,
        lateStart: task.plannedStart,
        lateFinish: task.plannedEnd,
        totalSlack: 0,
        freeSlack: 0,
        critical: false,
        drivenBy,
        driverIds,
        conflict,
        deadlineMissed: !!task.deadline && task.plannedEnd > task.deadline,
      });
    }
  };

  let projectStart: LocalDate | undefined, projectFinish: LocalDate | undefined;
  const backward = () => {
    projectStart = projectFinish = undefined;
    for (const task of order) {
      if (!leaves.has(task.id)) continue;
      if (!projectStart || task.plannedStart < projectStart) projectStart = task.plannedStart;
      if (!projectFinish || task.plannedEnd > projectFinish) projectFinish = task.plannedEnd;
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const task = order[i],
        leaf = leaves.get(task.id);
      if (!leaf) continue;
      let lateFinish = projectFinish!;
      for (const link of outgoing.get(task.id) ?? []) {
        const successor = byId.get(link.successorId)!,
          sLeaf = leaves.get(successor.id)!,
          sInfo = info.get(successor.id)!;
        // O inverso exato do limite da passada direta, a partir das datas tardias da sucessora.
        let date = link.type[1] === 'I' ? sInfo.lateStart : sInfo.lateFinish;
        if (link.type === 'TI' && sLeaf.days > 0) date = shift(date, -1, sLeaf.business, c);
        if (link.type === 'IT' && sLeaf.days > 0) date = shift(date, 1, sLeaf.business, c);
        date = shift(date, -link.lagDays, link.lagBusiness, c);
        const bound = link.type[0] === 'T' ? date : leaf.days ? shift(date, leaf.days - 1, leaf.business, c) : date;
        if (bound < lateFinish) lateFinish = bound;
      }
      if (task.deadline && task.deadline < lateFinish) lateFinish = task.deadline;
      const constraint = constraintOf(task);
      // "Não ... depois de" é teto das datas tardias; "Deve iniciar/terminar em" as fixa na data
      // (MPXJ e ProjectLibre concordam): a tarefa fica com folga zero e o conflito aparece ao redor.
      if (constraint.type === 'FNLT' && constraint.date! < lateFinish) lateFinish = constraint.date!;
      if (constraint.type === 'MFO') lateFinish = constraint.date!;
      if (constraint.type === 'SNLT' || constraint.type === 'MSO') {
        const bound = leaf.days ? shift(constraint.date!, leaf.days - 1, leaf.business, c) : constraint.date!;
        if (constraint.type === 'MSO' || bound < lateFinish) lateFinish = bound;
      }
      // Como no Project (e no MicrosoftScheduler do MPXJ): o que já aconteceu fixa as datas tardias.
      if (task.actualEnd) lateFinish = task.actualEnd;
      else if (leaf.business && !isWorking(lateFinish, c)) lateFinish = previousWorking(lateFinish, c);
      const lateStart = task.actualStart ?? (leaf.days ? shift(lateFinish, -(leaf.days - 1), leaf.business, c) : lateFinish);
      Object.assign(info.get(task.id)!, { lateStart, lateFinish });
    }
  };

  forward();
  backward();
  // "O mais tarde possível": a tarefa vai para as datas tardias e as sucessoras são refeitas a partir delas.
  const alap = rows.filter(t => leaves.has(t.id) && !t.actualStart && constraintOf(t).type === 'ALAP');
  if (alap.length) {
    for (const task of alap) pinned.set(task.id, info.get(task.id)!.lateStart);
    forward();
    backward();
  }

  for (const task of order) {
    const leaf = leaves.get(task.id);
    if (!leaf) continue;
    const self = info.get(task.id)!;
    const complete = task.progress >= 100 || !!task.actualEnd;
    // Folga total = a menor entre a do término e a do início; tarefa iniciada só tem a do término,
    // tarefa concluída nunca é crítica e não tem folga livre — regras observadas no Project.
    const finishSlack = signedWorkingDays(task.plannedEnd, self.lateFinish, c);
    self.totalSlack = task.actualStart ? finishSlack : Math.min(finishSlack, signedWorkingDays(task.plannedStart, self.lateStart, c));
    let free = Infinity;
    for (const link of outgoing.get(task.id) ?? []) {
      const successor = byId.get(link.successorId)!;
      const bound = boundaries(successor, leaves.get(successor.id)!).find(b => b.link === link)!;
      free = Math.min(free, signedWorkingDays(bound.date, bound.edge === 'start' ? successor.plannedStart : successor.plannedEnd, c));
    }
    self.freeSlack = complete ? 0 : Math.max(0, Math.min(self.totalSlack, free === Infinity ? self.totalSlack : free));
    self.critical = !complete && self.totalSlack <= threshold;
  }
  // Resumo: envelope dos filhos nas quatro datas; a folga é a do envelope.
  rows.forEach((task, at) => {
    if (!summary.has(task.id)) return;
    const children: TaskSchedule[] = [];
    for (let below = at + 1; below < rows.length && rows[below].level > task.level; below++)
      if (leaves.has(rows[below].id)) children.push(info.get(rows[below].id)!);
    const min = (pick: (i: TaskSchedule) => string) => children.map(pick).sort()[0];
    const max = (pick: (i: TaskSchedule) => string) => children.map(pick).sort().at(-1)!;
    const earlyStart = min(i => i.earlyStart),
      earlyFinish = max(i => i.earlyFinish),
      lateStart = min(i => i.lateStart),
      lateFinish = max(i => i.lateFinish);
    const totalSlack = Math.min(signedWorkingDays(earlyFinish, lateFinish, c), signedWorkingDays(earlyStart, lateStart, c));
    info.set(task.id, {
      earlyStart,
      earlyFinish,
      lateStart,
      lateFinish,
      totalSlack,
      freeSlack: Math.max(0, totalSlack),
      // Resumo é crítico quando alguma subtarefa é, como o Project resume.
      critical: children.some(child => child.critical),
      drivenBy: 'summary',
      driverIds: [],
      conflict: false,
      deadlineMissed: false,
    });
  });
  return { tasks: rows, info, projectStart, projectFinish };
}

/** Só as datas: o que o servidor confere ao gravar e o que a tela usa quando não precisa de folga. */
export function scheduleTasks(input: PlanTask[], links: PlanDependency[], calendar: WorkCalendar = DEFAULT_CALENDAR): PlanTask[] {
  return analyzeSchedule(input, links, calendar).tasks;
}

function validateActualDates(task: Pick<PlanTask, 'actualStart' | 'actualEnd'>) {
  if (task.actualStart) validateDate(task.actualStart);
  if (task.actualEnd) validateDate(task.actualEnd);
  if (task.actualEnd && !task.actualStart) throw new Error('Informe o início real antes do término real.');
  if (task.actualStart && task.actualEnd && task.actualStart > task.actualEnd)
    throw new Error('Início real não pode ser depois do término real.');
}
/** Regras do Project entre % concluído e datas reais, na mesma tarefa. Nenhuma altera a entrada:
 * devolvem a tarefa nova, que a tela passa de novo por `scheduleTasks`. */
const withoutActuals = ({ actualStart: _s, actualEnd: _e, ...task }: PlanTask): PlanTask => task;
const withoutActualEnd = ({ actualEnd: _e, ...task }: PlanTask): PlanTask => task;
/** % concluído: 0 limpa as datas reais; acima de 0 começa no início previsto se ainda não
 * começou; 100 termina no término previsto se ainda não terminou; abaixo de 100 reabre. */
export function withProgress(task: PlanTask, progress: number, calendar: WorkCalendar = DEFAULT_CALENDAR): PlanTask {
  validateCalendar(calendar);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new Error('Progresso deve ficar entre 0 e 100.');
  if (progress === 0) return { ...withoutActuals(task), progress };
  const actualStart = task.actualStart ?? task.plannedStart;
  if (progress < 100) return { ...withoutActualEnd(task), progress, actualStart };
  return { ...task, progress, actualStart, actualEnd: task.actualEnd ?? (task.plannedEnd > actualStart ? task.plannedEnd : actualStart) };
}
/** Início real: limpar desfaz o andamento (sem início não há término nem %); informar não mexe
 * no % — o Project aceita tarefa iniciada com 0%. */
export function withActualStart(task: PlanTask, date: string | undefined, calendar: WorkCalendar = DEFAULT_CALENDAR): PlanTask {
  validateCalendar(calendar);
  if (!date) return { ...withoutActuals(task), progress: 0 };
  validateDate(date);
  if (task.actualEnd && date > task.actualEnd && !isMilestone(task)) throw new Error('Início real não pode ser depois do término real.');
  // Marco acontece num dia só: o início real arrasta o término real junto.
  return { ...task, actualStart: date, ...(task.actualEnd && isMilestone(task) ? { actualEnd: date } : {}) };
}
/** Término real: conclui a tarefa (100%), começa no início previsto se ainda não havia início
 * real (ou no próprio término, se o previsto for depois) e recalcula a duração pelo que de fato
 * durou — em dias úteis, ou corridos se a tarefa era medida em corridos. Marco fica com zero. */
export function withActualEnd(task: PlanTask, date: string | undefined, calendar: WorkCalendar = DEFAULT_CALENDAR): PlanTask {
  validateCalendar(calendar);
  if (!date) {
    if (task.progress === 100) throw new Error('Reduza o % concluído para limpar o término real.');
    return withoutActualEnd(task);
  }
  validateDate(date);
  if (isMilestone(task)) return { ...task, progress: 100, actualStart: date, actualEnd: date };
  const actualStart = task.actualStart ?? (task.plannedStart <= date ? task.plannedStart : date);
  if (actualStart > date) throw new Error('Término real não pode ser antes do início real.');
  const unit = !task.duration || task.duration.unit === 'dd' || task.duration.unit === 'md' ? ('dd' as const) : ('d' as const);
  const duration = { value: Math.max(1, countedDays(actualStart, date, unit === 'd', calendar)), unit };
  return { ...task, progress: 100, actualStart, actualEnd: date, duration };
}
/** Janela do plano mensal: do primeiro dia do mês ao último dia do segundo mês seguinte — três
 * meses de horizonte, como o médio prazo do Last Planner. */
export function planWindow(month: string): { start: LocalDate; end: LocalDate } {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Informe o mês no formato AAAA-MM.');
  const [year, index] = month.split('-').map(Number);
  return { start: `${month}-01`, end: new Date(Date.UTC(year, index + 2, 0)).toISOString().slice(0, 10) };
}
export function temporalTarget(task: PlanTask, date: string, c: WorkCalendar) {
  validateDate(date);
  if (date < task.plannedStart) return 0;
  if (date >= task.plannedEnd) return 100;
  const business = task.duration ? businessDuration(task.duration) : false;
  return (
    (100 * countedDays(task.plannedStart, date, business, c)) / Math.max(1, countedDays(task.plannedStart, task.plannedEnd, business, c))
  );
}
export function planSnapshot(plan: MediumTermPlan, tasks: PlanTask[], links: PlanDependency[]) {
  return JSON.stringify({
    plan,
    tasks: tasks.filter(t => t.planId === plan.id).sort((a, b) => a.id.localeCompare(b.id)),
    links: links.filter(l => tasks.some(t => t.planId === plan.id && t.id === l.successorId)).sort((a, b) => a.id.localeCompare(b.id)),
  });
}

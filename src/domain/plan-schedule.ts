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

/** Começo (08:00) ou fim (17:00) do dia. O Project agenda em instantes: 08:00 de um dia é o mesmo
 * momento de trabalho que 17:00 do dia útil anterior, mas aparece com outra data na tabela. */
export type DayEdge = 'start' | 'end';
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
  /** Em que ponta do dia cada data cai. Tarefa com duração começa no começo do dia e em geral
   * termina no fim; marco, término puxado por IT sem defasagem e duração em dias corridos podem
   * cair no começo do dia — é o que o Gantt usa para desenhar a barra e a exportação para a hora. */
  edges: { earlyStart: DayEdge; earlyFinish: DayEdge; lateStart: DayEdge; lateFinish: DayEdge };
  /** Tarefa iniciada cujo restante foi empurrado por predecessora ainda aberta ("dividir tarefas
   * em andamento" do Project): último dia trabalhado antes da interrupção e dia em que retoma. */
  stop?: LocalDate;
  resume?: LocalDate;
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
/** Instante do Project reduzido a dias: o dia e a ponta dele (08:00 ou 17:00). */
interface At {
  day: LocalDate;
  edge: DayEdge;
}
const atStart = (day: LocalDate): At => ({ day, edge: 'start' });
const atEnd = (day: LocalDate): At => ({ day, edge: 'end' });
/** Ordem de relógio: no mesmo dia, as 08:00 vêm antes das 17:00. */
const compareAt = (a: At, b: At) => a.day.localeCompare(b.day) || (a.edge === b.edge ? 0 : a.edge === 'start' ? -1 : 1);
const laterAt = (a: At, b: At) => (compareAt(a, b) >= 0 ? a : b);
const earlierAt = (a: At, b: At) => (compareAt(a, b) <= 0 ? a : b);
/** O que um vínculo exige da sucessora: o instante na ponta `edge` e o início que isso implica. */
interface Requirement {
  link: PlanDependency;
  edge: 'start' | 'end';
  at: At;
  start: At;
  /** TT que puxaria para antes do início do projeto: o Project segura no início do projeto, e aí
   * quem manda é o início do projeto, não a predecessora. */
  floored: boolean;
}
interface Placement {
  start: At;
  finish: At;
  /** Onde a rede queria a tarefa quando uma restrição a prendeu antes: a folga sai daqui. */
  slackStart: At;
  slackFinish: At;
  /** Tarefa em andamento: retomada do restante (cedo); igual ao início real quando não dividiu. */
  resume?: At;
}

/** Programação automática, como o "Agendada automaticamente" do Project, com as oito restrições,
 * prazo final, passada inversa, folgas e caminho crítico — conferida contra o Project 2019 real
 * (docs/engenharia-reversa-project.md, "Conferência no Project real").
 *
 * O Project agenda em instantes e o plano guarda dias; o motor trabalha com o dia e a ponta dele
 * (começo, 08:00, ou fim, 17:00), porque 08:00 de segunda é o mesmo momento de trabalho que 17:00
 * de sexta, mas a tabela do Project mostra datas diferentes conforme a conta que chegou lá:
 * - somar dias úteis cai no fim do dia; subtrair cai no fim do dia na passada direta e no começo
 *   na inversa; defasagem zero não mexe no instante;
 * - tarefa com duração começa sempre no começo de um dia útil; na passada inversa, o término dela
 *   recua para o fim do último dia útil; marco fica onde a conta deixar (TI o põe no fim do dia
 *   da predecessora; data digitada, no começo do dia);
 * - duração e defasagem em dias corridos contam 24 h por dia, então 5 dias corridos a partir de
 *   sexta 08:00 terminam quarta 08:00 e a tabela mostra quarta.
 *
 * Tarefa com término real fica presa nas datas reais. Tarefa em andamento fica presa no início
 * real e, como no "dividir tarefas em andamento" do Project, o restante (a duração vezes o que
 * falta, arredondado para cima em dias) não começa antes do que os vínculos permitem: a barra se
 * divide e as sucessoras são empurradas. Sem real, o início sai da rede e da restrição: "Não
 * iniciar/terminar antes de" só empurram para a frente; "Não iniciar/terminar depois de", "Deve
 * iniciar em" e "Deve terminar em" prendem a data mesmo contra a rede (as tarefas sempre respeitam
 * as datas de restrição), e aí o vínculo fica desrespeitado e a folga, negativa — na tarefa presa
 * e na predecessora, como o Project mostra. TT não puxa a sucessora para antes do início do
 * projeto (o primeiro início das tarefas sem predecessora); TI, II e IT com antecipação puxam.
 * "O mais tarde possível" desliza para as datas tardias. A duração nunca muda aqui. */
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
    if (task.actualStart) validateActualDates(task);
    else if (task.actualEnd) throw new Error('Informe o início real antes do término real.');
  }

  // ————— Aritmética de instantes (DateAdd/DateSubtract do Project, em dias) —————
  /** O dia útil cujo começo é o primeiro momento de trabalho a partir do instante. */
  const firstStart = (at: At) => (at.edge === 'start' || !isWorking(at.day, c) ? nextWorking(at.day, c) : shift(at.day, 1, true, c));
  /** Diferença em dias úteis, a unidade das folgas. */
  const workDiff = (from: At, to: At) => signedWorkingDays(firstStart(from), firstStart(to), c);
  /** Diferença em dias corridos, a unidade das folgas de tarefa medida em corridos. */
  const calendarDiff = (from: At, to: At) => {
    // Em horas de relógio, com a jornada da exportação (08:00 às 17:00): do fim de um dia ao começo
    // do seguinte são 15 h, e é isso que o Project mostra como folga de tarefa em dias corridos.
    const hours = (at: At) => Date.parse(at.day + 'T00:00:00Z') / 3600000 + (at.edge === 'end' ? 17 : 8);
    return Math.round(((hours(to) - hours(from)) / 24) * 1000) / 1000;
  };
  /** Dias úteis somados ou subtraídos: o resultado que cai na virada do dia sai como fim do dia na
   * passada direta e como começo na inversa. Zero devolve o próprio instante. */
  const addWork = (at: At, n: number, pass: 'early' | 'late'): At =>
    !n ? at : pass === 'early' ? atEnd(shift(firstStart(at), n - 1, true, c)) : atStart(shift(firstStart(at), n, true, c));
  const addElapsed = (at: At, n: number): At => ({ day: addDays(at.day, n), edge: at.edge });
  const lagged = (at: At, link: PlanDependency, sign: 1 | -1, pass: 'early' | 'late') =>
    link.lagBusiness ? addWork(at, sign * link.lagDays, pass) : addElapsed(at, sign * link.lagDays);
  /** Início de tarefa com duração: o começo do dia útil em que o trabalho pode começar. */
  const asStart = (at: At): At => atStart(firstStart(at));
  /** Término de tarefa com duração em dias úteis na passada inversa: o fim do último dia útil. */
  /** Na passada inversa, o término de tarefa em dias úteis recua para o fim do último dia útil. A
   * tarefa sem sucessora fica no fim do projeto como ele é (o Project não move o 17:00 de um domingo
   * que veio de uma defasagem corrida); a com sucessora, sempre para um fim de dia útil. */
  const asFinish = (at: At, terminal = false): At =>
    at.edge === 'end' && (terminal || isWorking(at.day, c)) ? at : atEnd(shift(firstStart(at), -1, true, c));
  /** Tarefa em dias úteis começa no começo de um dia útil; marco e duração em dias corridos começam
   * no instante exato em que a rede deixa, mesmo à noite ou no fim de semana. */
  const startOf = (at: At, shape: Pick<LeafShape, 'days' | 'business'>) => (shape.days && shape.business ? asStart(at) : at);
  const finishFrom = (start: At, shape: Pick<LeafShape, 'days' | 'business'>, pass: 'early' | 'late') =>
    !shape.days ? start : shape.business ? addWork(start, shape.days, pass) : addElapsed(start, shape.days);
  const startFrom = (finish: At, shape: Pick<LeafShape, 'days' | 'business'>, pass: 'early' | 'late') =>
    !shape.days ? finish : shape.business ? addWork(finish, -shape.days, pass) : addElapsed(finish, -shape.days);
  /** Término exigido (TT/IT, NTAD, NTDD, DTE) → início; o término fica no instante exigido quando a
   * duração cabe exatamente até ele (é assim que IT sem defasagem termina às 08:00 da segunda). */
  const placeByFinish = (finish: At, shape: LeafShape): { start: At; finish: At } => {
    if (!shape.days) return { start: finish, finish };
    const start = startOf(startFrom(finish, shape, 'early'), shape);
    const natural = finishFrom(start, shape, 'early');
    return { start, finish: workDiff(natural, finish) === 0 ? finish : natural };
  };
  const remainingDays = (task: PlanTask, leaf: LeafShape) =>
    Math.max(
      task.progress < 100 && leaf.days ? 1 : 0,
      Math.ceil((leaf.days * (100 - Math.min(100, Math.max(0, task.progress)))) / 100 - 1e-9),
    );

  // O início do projeto do Project: o primeiro início das tarefas sem predecessora (o `StartDate`
  // que a exportação grava). TT não puxa nada para antes dele.
  let anchor: At | undefined;
  for (const task of rows)
    if (leaves.has(task.id) && !incoming.has(task.id)) {
      const day = nextWorking(task.actualStart ?? task.plannedStart, c);
      if (!anchor || day < anchor.day) anchor = atStart(day);
    }

  const info = new Map<Id, TaskSchedule>();
  const early = new Map<Id, Placement>();
  const late = new Map<Id, { start: At; finish: At; resume?: At }>();
  const pinned = new Map<Id, At>();

  const requirements = (task: PlanTask, shape: LeafShape, floor: boolean): Requirement[] =>
    (incoming.get(task.id) ?? []).map(link => {
      const p = early.get(link.predecessorId)!;
      const at = lagged(link.type[0] === 'T' ? p.finish : p.start, link, 1, 'early');
      let start = link.type[1] === 'I' ? startOf(at, shape) : placeByFinish(at, shape).start;
      let floored = false;
      if (floor && link.type === 'TT' && anchor && compareAt(start, anchor) < 0) {
        start = startOf(anchor, shape);
        floored = true;
      }
      return { link, edge: link.type[1] === 'I' ? 'start' : 'end', at, start, floored };
    });
  const networkDrivers = (reqs: Requirement[], start: At) =>
    reqs.filter(r => !r.floored && compareAt(r.start, start) === 0).map(r => r.link.predecessorId);

  const forward = () => {
    for (const task of order) {
      const leaf = leaves.get(task.id);
      if (!leaf) continue;
      let drivenBy: TaskSchedule['drivenBy'] = 'stored',
        driverIds: Id[] = [],
        conflict = false,
        place: Placement,
        stop: LocalDate | undefined;
      if (task.actualStart) {
        const reqs = requirements(task, leaf, false);
        drivenBy = 'actual';
        const start = atStart(task.actualStart);
        if (task.actualEnd || !leaf.days) {
          const finish = !leaf.days ? atStart(task.actualEnd ?? task.actualStart) : atEnd(task.actualEnd!);
          place = { start, finish, slackStart: start, slackFinish: finish };
          // O que já aconteceu não se reprograma: o vínculo que a data real contraria fica desrespeitado.
          conflict = !!task.actualEnd && reqs.some(r => (r.edge === 'start' ? workDiff(r.start, start) : workDiff(r.at, finish)) < 0);
        } else {
          const rest = remainingDays(task, leaf),
            done = leaf.days - rest;
          const restShape = { ...leaf, days: rest };
          const natural = finishFrom(start, leaf, 'early');
          const resumeNatural = done ? (leaf.business ? asStart(addWork(start, done, 'early')) : addElapsed(start, done)) : start;
          let resume = resumeNatural;
          for (const r of requirements(task, restShape, false)) resume = laterAt(resume, r.start);
          if (rest && workDiff(resumeNatural, resume) > 0) {
            const finish = finishFrom(resume, restShape, 'early');
            place = { start, finish, slackStart: start, slackFinish: finish, resume };
            stop = done
              ? leaf.business
                ? shift(task.actualStart, done - 1, true, c)
                : addDays(task.actualStart, done - 1)
              : task.actualStart;
          } else place = { start, finish: natural, slackStart: start, slackFinish: natural, resume: resumeNatural };
        }
      } else {
        const reqs = requirements(task, leaf, true);
        const stored = leaf.business || !leaf.days ? atStart(nextWorking(task.plannedStart, c)) : atStart(task.plannedStart);
        let networkStart: At | undefined;
        for (const r of reqs) networkStart = networkStart ? laterAt(networkStart, r.start) : r.start;
        // Quem fixa o início é um TT ou IT (e não um TI/II nem o piso do início do projeto): aí o
        // término fica no instante que o vínculo exige.
        const atNetwork = networkStart ? reqs.filter(r => compareAt(r.start, networkStart!) === 0) : [];
        const byFinish = atNetwork.length && atNetwork.every(r => r.edge === 'end' && !r.floored);
        const networkPlace = (): { start: At; finish: At } => {
          if (!networkStart) return { start: stored, finish: finishFrom(stored, leaf, 'early') };
          if (!byFinish) return { start: networkStart, finish: finishFrom(networkStart, leaf, 'early') };
          return placeByFinish(
            atNetwork.reduce((m, r) => laterAt(m, r.at), atNetwork[0].at),
            leaf,
          );
        };
        // `current` muda dentro dos `hold*`; o objeto evita que o TypeScript estreite o estado.
        const state = { current: networkPlace(), held: false };
        const network = state.current;
        const holdStart = (start: At) => {
          state.current = { start, finish: finishFrom(start, leaf, 'early') };
          state.held = true;
        };
        const holdFinish = (finish: At) => {
          state.current = placeByFinish(finish, leaf);
          state.held = true;
        };
        const constraint: TaskConstraint = pinned.has(task.id) ? { type: 'MSO' } : constraintOf(task);
        const date = constraint.date!;
        // Data não útil: "não antes de" vale o dia útil seguinte; "não depois de" e "deve terminar em", o anterior.
        const before = leaf.business || !leaf.days ? previousWorking : (d: LocalDate) => d;
        switch (constraint.type) {
          case 'SNET': {
            const start = startOf(atStart(date), leaf.days ? leaf : { days: 1, business: true });
            if (!networkStart || compareAt(start, state.current.start) > 0) holdStart(start);
            break;
          }
          case 'FNET': {
            const finish = atEnd(leaf.business || !leaf.days ? nextWorking(date, c) : date);
            if (!networkStart || compareAt(finish, state.current.finish) > 0) holdFinish(finish);
            break;
          }
          case 'SNLT': {
            const start = atStart(before(date, c));
            if (compareAt(start, state.current.start) < 0) holdStart(start);
            break;
          }
          case 'FNLT': {
            const finish = atEnd(before(date, c));
            if (compareAt(finish, state.current.finish) < 0) holdFinish(finish);
            break;
          }
          case 'MSO':
            holdStart(pinned.get(task.id) ?? startOf(atStart(date), leaf.days ? leaf : { days: 1, business: true }));
            break;
          case 'MFO':
            holdFinish(atEnd(before(date, c)));
            break;
        }
        const current = state.current;
        drivenBy = state.held ? 'constraint' : networkStart ? 'network' : 'stored';
        const heldEarlier = state.held && networkStart && compareAt(network.start, current.start) > 0;
        place = {
          ...current,
          slackStart: heldEarlier ? network.start : current.start,
          slackFinish: heldEarlier ? network.finish : current.finish,
        };
        if (drivenBy === 'network') driverIds = networkDrivers(reqs, current.start);
        // Como o "Inspetor de tarefas" do Project: NIAD, DIE e DTE tomam o lugar da rede; nas demais
        // restrições (e no OMTP) as predecessoras que fixam a rede continuam listadas.
        else if (drivenBy === 'constraint' && networkStart && (pinned.has(task.id) || ['FNET', 'SNLT', 'FNLT'].includes(constraint.type)))
          driverIds = networkDrivers(reqs, networkStart);
        conflict = reqs.some(
          r => !r.floored && (r.edge === 'start' ? workDiff(r.start, current.start) : workDiff(r.at, current.finish)) < 0,
        );
      }
      early.set(task.id, place);
      task.plannedStart = place.start.day;
      task.plannedEnd = place.finish.day;
      info.set(task.id, {
        earlyStart: place.start.day,
        earlyFinish: place.finish.day,
        lateStart: place.start.day,
        lateFinish: place.finish.day,
        totalSlack: 0,
        freeSlack: 0,
        critical: false,
        drivenBy,
        driverIds,
        conflict,
        deadlineMissed: !!task.deadline && compareAt(place.finish, atEnd(task.deadline)) > 0,
        edges: { earlyStart: place.start.edge, earlyFinish: place.finish.edge, lateStart: 'start', lateFinish: 'end' },
        ...(place.resume && stop ? { stop, resume: place.resume.day } : {}),
      });
    }
  };

  let projectStart: LocalDate | undefined, projectFinish: LocalDate | undefined;
  const backward = () => {
    let finishAt: At | undefined;
    projectStart = undefined;
    for (const task of order) {
      const place = early.get(task.id);
      if (!place) continue;
      if (!projectStart || place.start.day < projectStart) projectStart = place.start.day;
      finishAt = finishAt ? laterAt(finishAt, place.finish) : place.finish;
    }
    projectFinish = finishAt?.day;
    /** Término tardio a partir de `init` (o teto), das sucessoras e das restrições, prazo final e reais. */
    const lateFinishOf = (task: PlanTask, leaf: LeafShape, init: At): At => {
      const outs = outgoing.get(task.id) ?? [];
      let lateFinish = init;
      for (const link of outs) {
        const s = late.get(link.successorId)!;
        // Sucessora em andamento: o vínculo amarra o restante (a retomada), não o início real.
        const side = link.type[1] === 'I' ? (s.resume ?? s.start) : s.finish;
        const bound = lagged(side, link, -1, 'late');
        lateFinish = earlierAt(lateFinish, link.type[0] === 'T' ? bound : finishFrom(bound, leaf, 'late'));
      }
      const constraint = constraintOf(task);
      const before = leaf.business || !leaf.days ? previousWorking : (d: LocalDate) => d;
      const startBound = (date: LocalDate) => finishFrom(atStart(before(date, c)), leaf, 'late');
      // NIDD em tarefa sem sucessora: o Project põe o início tardio na própria data, mesmo depois do fim do projeto.
      if (constraint.type === 'SNLT')
        lateFinish = outs.length ? earlierAt(lateFinish, startBound(constraint.date!)) : startBound(constraint.date!);
      if (task.deadline) lateFinish = earlierAt(lateFinish, atEnd(task.deadline));
      if (constraint.type === 'FNLT') lateFinish = earlierAt(lateFinish, atEnd(before(constraint.date!, c)));
      // "Deve iniciar/terminar em" fixam as datas tardias na data (folga zero na tarefa).
      if (constraint.type === 'MFO') lateFinish = atEnd(before(constraint.date!, c));
      if (constraint.type === 'MSO')
        lateFinish = finishFrom(startOf(atStart(constraint.date!), leaf.days ? leaf : { days: 1, business: true }), leaf, 'late');
      if (task.actualEnd) return leaf.days ? atEnd(task.actualEnd) : atStart(task.actualEnd);
      return leaf.days && leaf.business ? asFinish(lateFinish, !outs.length) : lateFinish;
    };
    // O teto das tarefas com sucessora é o término tardio do projeto: o maior entre o fim do projeto
    // e o término tardio das tarefas sem sucessora — que o NIDD pode levar além do fim (as tarefas
    // sem sucessora não dependem de nenhuma outra na passada inversa, então saem primeiro).
    let ceiling = finishAt!;
    for (const task of order) {
      const leaf = leaves.get(task.id);
      if (leaf && !outgoing.has(task.id)) ceiling = laterAt(ceiling, lateFinishOf(task, leaf, finishAt!));
    }
    for (let i = order.length - 1; i >= 0; i--) {
      const task = order[i],
        leaf = leaves.get(task.id);
      if (!leaf) continue;
      const lateFinish = lateFinishOf(task, leaf, outgoing.has(task.id) ? ceiling : finishAt!);
      const lateStart = task.actualStart ? atStart(task.actualStart) : startFrom(lateFinish, leaf, 'late');
      const rest = task.actualStart && !task.actualEnd && leaf.days ? remainingDays(task, leaf) : 0;
      const resume = rest ? startFrom(lateFinish, { ...leaf, days: rest }, 'late') : undefined;
      late.set(task.id, { start: lateStart, finish: lateFinish, resume });
      const self = info.get(task.id)!;
      Object.assign(self, { lateStart: lateStart.day, lateFinish: lateFinish.day });
      self.edges = { ...self.edges, lateStart: lateStart.edge, lateFinish: lateFinish.edge };
    }
  };

  forward();
  backward();
  // "O mais tarde possível": a tarefa vai para as datas tardias e as sucessoras são refeitas a partir delas.
  const alap = rows.filter(t => leaves.has(t.id) && !t.actualStart && constraintOf(t).type === 'ALAP');
  if (alap.length) {
    for (const task of alap) pinned.set(task.id, late.get(task.id)!.start);
    forward();
    backward();
  }

  for (const task of order) {
    const leaf = leaves.get(task.id);
    if (!leaf) continue;
    const self = info.get(task.id)!,
      place = early.get(task.id)!,
      tardy = late.get(task.id)!;
    const diff = leaf.days && !leaf.business ? calendarDiff : workDiff;
    const complete = task.progress >= 100 || !!task.actualEnd;
    // Folga total = a menor entre a do término e a do início; tarefa iniciada só tem a do término,
    // tarefa concluída nunca é crítica e não tem folga livre — regras observadas no Project.
    const finishSlack = diff(place.slackFinish, tardy.finish);
    self.totalSlack = task.actualStart ? finishSlack : Math.min(finishSlack, diff(place.slackStart, tardy.start));
    // Folga livre: quanto a tarefa pode atrasar sem mexer nas datas cedo das sucessoras — a conta
    // inversa a partir do início (ou término) cedo de cada uma, como a passada inversa faz.
    let free = Infinity;
    for (const link of outgoing.get(task.id) ?? []) {
      const successor = early.get(link.successorId)!;
      const bound = lagged(link.type[1] === 'I' ? successor.start : successor.finish, link, -1, 'late');
      const finish = link.type[0] === 'T' ? bound : finishFrom(bound, leaf, 'late');
      free = Math.min(free, diff(place.finish, leaf.days && leaf.business ? asFinish(finish) : finish));
    }
    self.freeSlack = complete ? 0 : Math.max(0, Math.min(self.totalSlack, free === Infinity ? self.totalSlack : free));
    self.critical = !complete && self.totalSlack <= threshold;
  }
  // Resumo: envelope dos filhos nas quatro datas; a folga é a do envelope.
  rows.forEach((task, at) => {
    if (!summary.has(task.id)) return;
    const children: Id[] = [];
    for (let below = at + 1; below < rows.length && rows[below].level > task.level; below++)
      if (leaves.has(rows[below].id)) children.push(rows[below].id);
    if (!children.length) return;
    const pick = (list: At[], take: (a: At, b: At) => At) => list.reduce(take);
    const earlyStart = pick(
        children.map(id => early.get(id)!.start),
        earlierAt,
      ),
      earlyFinish = pick(
        children.map(id => early.get(id)!.finish),
        laterAt,
      ),
      lateStart = pick(
        children.map(id => late.get(id)!.start),
        earlierAt,
      ),
      lateFinish = pick(
        children.map(id => late.get(id)!.finish),
        laterAt,
      );
    const totalSlack = Math.min(workDiff(earlyFinish, lateFinish), workDiff(earlyStart, lateStart));
    info.set(task.id, {
      earlyStart: earlyStart.day,
      earlyFinish: earlyFinish.day,
      lateStart: lateStart.day,
      lateFinish: lateFinish.day,
      totalSlack,
      freeSlack: Math.max(0, totalSlack),
      // Resumo é crítico quando alguma subtarefa é, como o Project resume.
      critical: children.some(id => info.get(id)!.critical),
      drivenBy: 'summary',
      driverIds: [],
      conflict: false,
      deadlineMissed: false,
      edges: { earlyStart: earlyStart.edge, earlyFinish: earlyFinish.edge, lateStart: lateStart.edge, lateFinish: lateFinish.edge },
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

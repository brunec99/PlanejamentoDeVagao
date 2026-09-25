import type { LocalDate, MediumTermPlan, PlanTask, PlanDependency } from './entities';
import { addDays, validateDate, validatePeriod } from './validation';
export interface WorkCalendar { weekdays: number[]; hoursPerDay: number; daysPerMonth: number; holidays: string[] }
export interface TaskDuration { value: number; unit: 'h' | 'd' | 'dd' | 'mês' | 'md' }
export const DEFAULT_CALENDAR: WorkCalendar = { weekdays: [1, 2, 3, 4, 5], hoursPerDay: 8, daysPerMonth: 20, holidays: [] };
export function validateCalendar(c: WorkCalendar) {
  if (!c || !Array.isArray(c.weekdays) || !c.weekdays.length || c.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || new Set(c.weekdays).size !== c.weekdays.length) throw new Error('Selecione dias úteis válidos.');
  if (!Number.isFinite(c.hoursPerDay) || c.hoursPerDay <= 0 || c.hoursPerDay > 24 || !Number.isInteger(c.daysPerMonth) || c.daysPerMonth < 1 || c.daysPerMonth > 31) throw new Error('Jornada ou dias por mês inválidos.');
  if (!Array.isArray(c.holidays) || c.holidays.length > 1000) throw new Error('Calendário aceita até 1000 feriados.');
  c.holidays.forEach(validateDate);
}
/** Unidades aceitas na célula de duração, como o Project escreve em português. `d` e `dias` são
 * úteis; `dd` e `dias corridos` (ou `decorridos`) contam fim de semana e feriado. */
const DURATION_UNITS: Record<string, TaskDuration['unit']> = {
  '': 'd', d: 'd', dia: 'd', dias: 'd',
  dd: 'dd', 'dia corrido': 'dd', 'dias corridos': 'dd', 'dia decorrido': 'dd', 'dias decorridos': 'dd',
  h: 'h', hr: 'h', hrs: 'h', hora: 'h', horas: 'h',
  'mês': 'mês', mes: 'mês', meses: 'mês',
  md: 'md', 'mês corrido': 'md', 'mes corrido': 'md', 'meses corridos': 'md', 'mês decorrido': 'md', 'mes decorrido': 'md', 'meses decorridos': 'md',
};
/** Duração digitada como no Project: `10`, `10d`, `10 dias`, `10dd`, `10 dias corridos`, `8h`,
 * `8 horas`, `1mês`, `2 meses`, `1md`. Zero é marco. O `?` de duração estimada é ignorado. */
export function parseDuration(raw: string): TaskDuration {
  const match = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ').match(/^(\d+(?:[.,]\d+)?)\s*([a-zçê ]*?)\s*\??$/);
  const unit = match ? DURATION_UNITS[match[2]] : undefined;
  if (!match || !unit) throw new Error('Use duração como 0 (marco), 8h, 10d, 10 dias, 10dd, 10 dias corridos, 1mês ou 1md.');
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value < 0 || value > 10000) throw new Error('Duração deve ficar entre 0 (marco) e 10000 unidades.');
  return { value, unit };
}
/** O texto de volta para a célula, no português do Project: `0 dias`, `1 dia`, `10 dias corridos`,
 * `8 h`, `2 meses`, `1 mês corrido`. */
export function formatDuration(d: TaskDuration): string {
  const n = String(d.value).replace('.', ','), one = d.value === 1;
  switch (d.unit) {
    case 'h': return `${n} h`;
    case 'dd': return `${n} ${one ? 'dia corrido' : 'dias corridos'}`;
    case 'mês': return `${n} ${one ? 'mês' : 'meses'}`;
    case 'md': return `${n} ${one ? 'mês corrido' : 'meses corridos'}`;
    default: return `${n} ${one ? 'dia' : 'dias'}`;
  }
}
/** Marco: tarefa de duração zero, como no Project — início e término no mesmo dia. */
export const isMilestone = (t: Pick<PlanTask, 'duration'>) => t.duration?.value === 0;
export const isWorking = (date: string, c: WorkCalendar) => c.weekdays.includes(new Date(date + 'T00:00:00Z').getUTCDay()) && !c.holidays.includes(date);
export function shift(date: string, amount: number, business: boolean, c: WorkCalendar): string {
  let next = date, left = Math.abs(amount), guard = 0;
  while (left > 0) {
    if (++guard > 100000) throw new Error('Período excede o limite do cronograma.');
    next = addDays(next, amount < 0 ? -1 : 1);
    if (!business || isWorking(next, c)) left--;
  }
  return next;
}
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
/** Programação automática, como o "Agendada automaticamente" do Project.
 *
 * Tarefa com início real fica presa nele, e no término real quando houver — vínculos e restrição
 * deixam de mandar, porque o que já aconteceu não se reprograma. Sem real, o início é o mais tarde
 * entre a restrição `anchorStart` ("Não iniciar antes de") e o que cada predecessora permite; sem
 * predecessora e sem restrição, vale o início guardado. A duração nunca muda aqui. */
export function scheduleTasks(input: PlanTask[], links: PlanDependency[], calendar: WorkCalendar = DEFAULT_CALENDAR): PlanTask[] {
  validateCalendar(calendar);
  const rows = structuredClone(input).sort((a,b) => a.order-b.order);
  const byId = new Map(rows.map(t => [t.id, t]));
  const summary = new Set(rows.filter((t,i) => rows[i+1]?.level > t.level).map(t => t.id));
  const incoming = new Map<string, PlanDependency[]>();
  for (const link of links) {
    if (!byId.has(link.predecessorId) || !byId.has(link.successorId)) throw new Error('Predecessora inexistente.');
    if (summary.has(link.predecessorId) || summary.has(link.successorId)) throw new Error('Vincule as subtarefas, não as tarefas-resumo.');
    if (!['TI','II','TT','IT'].includes(link.type) || !Number.isInteger(link.lagDays) || Math.abs(link.lagDays)>365) throw new Error('Vínculo ou defasagem inválidos.');
    const list = incoming.get(link.successorId) ?? [];
    if (list.some(l=>l.predecessorId===link.predecessorId)) throw new Error('Predecessora repetida.');
    incoming.set(link.successorId,[...list,link]);
  }
  // Kahn evita estouro de pilha em cadeias longas.
  const remaining = new Map(rows.map(t=>[t.id, incoming.get(t.id)?.length ?? 0]));
  const outgoing = new Map<string, string[]>();
  links.forEach(l=>outgoing.set(l.predecessorId,[...(outgoing.get(l.predecessorId)??[]),l.successorId]));
  const queue = rows.filter(t=>remaining.get(t.id)===0); let visited=0;
  for (let i=0;i<queue.length;i++) {
    const task=queue[i]; visited++;
    validatePeriod(task.plannedStart,task.plannedEnd);
    if (!summary.has(task.id)) {
      const duration=task.duration ?? {value: countedDays(task.plannedStart,task.plannedEnd,false,calendar),unit:'dd' as const};
      if (task.actualStart) {
        validateActualDates(task);
        task.plannedStart=task.actualStart;
        task.plannedEnd=task.actualEnd ?? (durationDays(duration,calendar) ? endFor(task.actualStart,duration,calendar).end : task.actualStart);
      } else {
        if (task.actualEnd) throw new Error('Informe o início real antes do término real.');
        const predecessors=incoming.get(task.id)??[];
        let start=task.anchorStart ?? (predecessors.length ? '0001-01-01' : task.plannedStart);
        for (const link of predecessors) {
          const p=byId.get(link.predecessorId)!;
          let boundary=shift(link.type[0]==='T'?p.plannedEnd:p.plannedStart,link.lagDays,link.lagBusiness,calendar);
          // Como no Project, o marco fica no dia em que a predecessora termina; tarefa com duração começa no dia útil seguinte.
          if(link.type==='TI'&&durationDays(duration,calendar)>0) boundary=shift(boundary,1,businessDuration(duration),calendar);
          // Vínculo que prende o término recua a duração; o marco não tem duração a recuar.
          if(link.type[1]==='T') boundary=shift(boundary,-Math.max(0,durationDays(duration,calendar)-1),businessDuration(duration),calendar);
          if(boundary>start) start=boundary;
        }
        const dates=endFor(start,duration,calendar);
        task.plannedStart=dates.start; task.plannedEnd=dates.end;
      }
    }
    for(const id of outgoing.get(task.id)??[]) {remaining.set(id,remaining.get(id)!-1);if(!remaining.get(id))queue.push(byId.get(id)!);}
  }
  if(visited!==rows.length) throw new Error('Essa ligação criaria um ciclo entre as linhas.');
  return rows;
}
function validateActualDates(task: Pick<PlanTask, 'actualStart' | 'actualEnd'>) {
  if (task.actualStart) validateDate(task.actualStart);
  if (task.actualEnd) validateDate(task.actualEnd);
  if (task.actualEnd && !task.actualStart) throw new Error('Informe o início real antes do término real.');
  if (task.actualStart && task.actualEnd && task.actualStart > task.actualEnd) throw new Error('Início real não pode ser depois do término real.');
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
  const unit = !task.duration || task.duration.unit === 'dd' || task.duration.unit === 'md' ? 'dd' as const : 'd' as const;
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
  if(date<task.plannedStart)return 0;if(date>=task.plannedEnd)return 100;
  const business=task.duration?businessDuration(task.duration):false;
  return 100*countedDays(task.plannedStart,date,business,c)/Math.max(1,countedDays(task.plannedStart,task.plannedEnd,business,c));
}
export function planSnapshot(plan: MediumTermPlan, tasks: PlanTask[], links: PlanDependency[]) {
  return JSON.stringify({plan,tasks:tasks.filter(t=>t.planId===plan.id).sort((a,b)=>a.id.localeCompare(b.id)),links:links.filter(l=>tasks.some(t=>t.planId===plan.id&&t.id===l.successorId)).sort((a,b)=>a.id.localeCompare(b.id))});
}

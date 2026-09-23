import type { MediumTermPlan, PlanTask, PlanDependency } from './entities';
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
export function parseDuration(raw: string): TaskDuration {
  const match = raw.trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*(dd|d|h|mês|mes|md)?$/);
  if (!match) throw new Error('Use duração como 8h, 2d, 2dd, 1mês ou 1md.');
  const value = Number(match[1].replace(',', '.')), unit = (match[2] === 'mes' ? 'mês' : match[2] ?? 'd') as TaskDuration['unit'];
  if (value <= 0 || value > 10000) throw new Error('Duração deve ser maior que zero e até 10000 unidades.');
  return { value, unit };
}
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
  let anchor = start;
  if (businessDuration(duration) && !isWorking(anchor, c)) anchor = shift(anchor, 1, true, c);
  return { start: anchor, end: shift(anchor, durationDays(duration, c) - 1, businessDuration(duration), c) };
}
export function countedDays(start: string, end: string, business: boolean, c: WorkCalendar) {
  validatePeriod(start, end);
  if ((Date.parse(end) - Date.parse(start)) / 86400000 > 100000) throw new Error('Período excede o limite do cronograma.');
  let total = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) if (!business || isWorking(date, c)) total++;
  return total;
}
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
      const predecessors=incoming.get(task.id)??[];
      let start=task.anchorStart ?? task.plannedStart;
      if (predecessors.length) {
        start='0001-01-01';
        for (const link of predecessors) {
          const p=byId.get(link.predecessorId)!;
          let boundary=shift(link.type[0]==='T'?p.plannedEnd:p.plannedStart,link.lagDays,link.lagBusiness,calendar);
          if(link.type==='TI') boundary=shift(boundary,1,businessDuration(duration),calendar);
          if(link.type[1]==='T') boundary=shift(boundary,-(durationDays(duration,calendar)-1),businessDuration(duration),calendar);
          if(boundary>start) start=boundary;
        }
      }
      const dates=endFor(start,duration,calendar);
      task.plannedStart=dates.start; task.plannedEnd=dates.end;
    }
    for(const id of outgoing.get(task.id)??[]) {remaining.set(id,remaining.get(id)!-1);if(!remaining.get(id))queue.push(byId.get(id)!);}
  }
  if(visited!==rows.length) throw new Error('Essa ligação criaria um ciclo entre as linhas.');
  return rows;
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

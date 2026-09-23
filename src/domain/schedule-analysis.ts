import type { Id, LocalDate, PlanningData, PlanTask, Team } from './entities';
import { DEFAULT_CALENDAR, countedDays, type WorkCalendar } from './plan-schedule';
import { rollUpPlan } from './rules';
import { addDays, startOfWeek, validatePeriod } from './validation';

/** Item que ocupa a equipe numa semana: linha do plano do mês ou atividade do cronograma. Guarda
 * as datas e a origem para a tela mostrar quem causa a superalocação, e não só o número. */
export interface LoadItem { kind: 'tarefa' | 'atividade'; id: Id; name: string; plannedStart: LocalDate; plannedEnd: LocalDate; source: string }
export interface WeekLoad { weekStart: LocalDate; weekEnd: LocalDate; load: number; capacity: number; overloaded: boolean; items: LoadItem[] }
export interface TeamWeeklyLoad { team: Team; weeks: WeekLoad[]; peak: number; overloadedWeeks: number }
export interface WeeklyLoadResult { weeks: LocalDate[]; teams: TeamWeeklyLoad[]; unassigned: WeekLoad[] }

/** Carga semana a semana de cada equipe da obra — o histograma de recursos.
 *
 * `teamLoad` responde uma pergunta só (a janela inteira cabe?), e ela esconde o pico: dez
 * atividades espalhadas em três meses parecem sobrecarga, e três empilhadas na mesma semana
 * parecem folga. A capacidade cadastrada é por semana, então a conta também tem de ser.
 *
 * As regras de contagem são as de `teamLoad`, para as duas telas não discordarem: entram as
 * atividades do cronograma e as linhas do plano do mês; plano congelado (linha de base) não entra,
 * porque retrato não é compromisso; e item de resumo não entra, porque é o envelope dos subitens —
 * contá-lo cobraria a mesma frente duas vezes. Semana começa na segunda (`startOfWeek`), a mesma
 * semana canônica do curto prazo. O que não tem equipe vai numa linha à parte, como informação:
 * não há capacidade contra a qual comparar, mas é carga que alguém vai ter de assumir. */
export function weeklyTeamLoad(data: PlanningData, workId: Id, from: LocalDate, to: LocalDate): WeeklyLoadResult {
  validatePeriod(from, to);
  const weeks: LocalDate[] = [];
  for (let week = startOfWeek(from); week <= to; week = addDays(week, 7)) weeks.push(week);

  const sequenceIds = new Set(data.sequences.filter(s => s.workId === workId).map(s => s.id));
  const wagons = new Map(data.wagons.filter(w => sequenceIds.has(w.sequenceId)).map(w => [w.id, w]));
  const items: (LoadItem & { teamId?: Id })[] = data.activities.filter(a => wagons.has(a.wagonId)).map(a => ({
    kind: 'atividade', id: a.id, name: a.name, plannedStart: a.plannedStart, plannedEnd: a.plannedEnd, teamId: a.teamId,
    source: `Vagão ${String(wagons.get(a.wagonId)!.number).padStart(2, '0')}`,
  }));
  for (const plan of data.plans.filter(p => p.workId === workId && !p.frozenAt && !p.baselineOf)) {
    const tasks = data.planTasks.filter(t => t.planId === plan.id);
    const rollUp = rollUpPlan(tasks);
    for (const task of tasks) if (!rollUp.get(task.id)?.summary) items.push({
      kind: 'tarefa', id: task.id, name: task.name, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, teamId: task.teamId, source: plan.name,
    });
  }
  const byStart = (a: LoadItem, b: LoadItem) => a.plannedStart.localeCompare(b.plannedStart) || a.name.localeCompare(b.name, 'pt-BR');
  const weekOf = (weekStart: LocalDate, owned: LoadItem[], capacity: number, compare: boolean): WeekLoad => {
    const weekEnd = addDays(weekStart, 6);
    const inWeek = owned.filter(i => i.plannedStart <= weekEnd && i.plannedEnd >= weekStart).sort(byStart);
    return { weekStart, weekEnd, load: inWeek.length, capacity, overloaded: compare && inWeek.length > capacity, items: inWeek };
  };

  const teams = data.teams.filter(t => t.workId === workId)
    .sort((a, b) => a.company.localeCompare(b.company, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'))
    .map(team => {
      const owned = items.filter(i => i.teamId === team.id);
      const rows = weeks.map(week => weekOf(week, owned, team.weeklyCapacity, true));
      return { team, weeks: rows, peak: Math.max(0, ...rows.map(r => r.load)), overloadedWeeks: rows.filter(r => r.overloaded).length };
    });
  // Equipe de outra obra ou apagada conta como "sem equipe": para esta obra, ninguém responde por ela.
  const known = new Set(teams.map(t => t.team.id));
  const loose = items.filter(i => !i.teamId || !known.has(i.teamId));
  return { weeks, teams, unassigned: weeks.map(week => weekOf(week, loose, 0, false)) };
}

export type VarianceStatus = 'atrasada' | 'adiantada' | 'no prazo' | 'nova' | 'removida';
export interface TaskVariance {
  id: Id; name: string; status: VarianceStatus; order: number;
  live?: Pick<PlanTask, 'plannedStart' | 'plannedEnd'>; baseline?: Pick<PlanTask, 'plannedStart' | 'plannedEnd'>;
  startVariance?: number; finishVariance?: number;
}
export interface VarianceSummary { lateCount: number; earlyCount: number; onTimeCount: number; newCount: number; removedCount: number; maxDelay: number; averageDelay: number; planFinishVariance?: number }

const nameKey = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Diferença em dias úteis de `from` até `to`, com sinal: positivo quando `to` é depois. Conta os
 * dias de trabalho do calendário do plano em (from, to] — sexta para segunda é 1, e não 3. Um
 * atraso que só atravessa o fim de semana não custou dia de obra, e o Project mede assim. */
export function businessVariance(from: LocalDate, to: LocalDate, calendar: WorkCalendar = DEFAULT_CALENDAR): number {
  if (from === to) return 0;
  return to > from ? countedDays(addDays(from, 1), to, true, calendar) : -countedDays(addDays(to, 1), from, true, calendar);
}

/** Variação do plano vivo contra uma linha de base congelada, tarefa a tarefa.
 *
 * O par é achado primeiro por `sourceTaskId`, que a cópia congelada guarda; linha de base antiga,
 * de antes desse campo, cai no nome normalizado — a mesma estratégia que o resto do médio prazo
 * usa. Item de resumo fica de fora dos dois lados: as datas dele são o envelope dos subitens, e o
 * atraso já aparece no subitem que o causou.
 *
 * O status segue o término, porque é o término que a sucessora e a obra esperam: começar tarde e
 * recuperar dentro do prazo não é atraso. A variação do plano é o envelope — o último término vivo
 * contra o último término da base —, que é o que diz se o mês fecha. */
export function baselineVariance(liveTasks: PlanTask[], baselineTasks: PlanTask[], calendar: WorkCalendar = DEFAULT_CALENDAR) {
  const leaves = (tasks: PlanTask[]) => { const rollUp = rollUpPlan(tasks); return tasks.filter(t => !rollUp.get(t.id)?.summary).sort((a, b) => a.order - b.order); };
  const live = leaves(liveTasks), base = leaves(baselineTasks);
  const free = new Set(base.map(t => t.id));
  const pairs = new Map<Id, PlanTask>();
  for (const task of live) {
    const pair = base.find(b => free.has(b.id) && b.sourceTaskId === task.id);
    if (pair) { pairs.set(task.id, pair); free.delete(pair.id); }
  }
  // Por nome só entre as linhas que não acharam par pelo vínculo, senão uma cópia vinculada seria
  // roubada por outra linha de mesmo nome.
  for (const task of live) {
    if (pairs.has(task.id)) continue;
    const pair = base.find(b => free.has(b.id) && !b.sourceTaskId && nameKey(b.name) === nameKey(task.name))
      ?? base.find(b => free.has(b.id) && nameKey(b.name) === nameKey(task.name) && !live.some(l => l.id === b.sourceTaskId));
    if (pair) { pairs.set(task.id, pair); free.delete(pair.id); }
  }

  const rows: TaskVariance[] = live.map(task => {
    const pair = pairs.get(task.id);
    const dates = { plannedStart: task.plannedStart, plannedEnd: task.plannedEnd };
    if (!pair) return { id: task.id, name: task.name, order: task.order, status: 'nova', live: dates };
    const startVariance = businessVariance(pair.plannedStart, task.plannedStart, calendar);
    const finishVariance = businessVariance(pair.plannedEnd, task.plannedEnd, calendar);
    const status: VarianceStatus = finishVariance > 0 ? 'atrasada' : finishVariance < 0 ? 'adiantada' : 'no prazo';
    return { id: task.id, name: task.name, order: task.order, status, live: dates, baseline: { plannedStart: pair.plannedStart, plannedEnd: pair.plannedEnd }, startVariance, finishVariance };
  });
  for (const task of base) if (free.has(task.id)) rows.push({ id: task.id, name: task.name, order: task.order, status: 'removida', baseline: { plannedStart: task.plannedStart, plannedEnd: task.plannedEnd } });

  const late = rows.filter(r => r.status === 'atrasada');
  const delays = late.map(r => r.finishVariance!);
  const lastEnd = (tasks: PlanTask[]) => tasks.reduce<LocalDate | undefined>((max, t) => (!max || t.plannedEnd > max ? t.plannedEnd : max), undefined);
  const liveEnd = lastEnd(live), baseEnd = lastEnd(base);
  const summary: VarianceSummary = {
    lateCount: late.length,
    earlyCount: rows.filter(r => r.status === 'adiantada').length,
    onTimeCount: rows.filter(r => r.status === 'no prazo').length,
    newCount: rows.filter(r => r.status === 'nova').length,
    removedCount: rows.filter(r => r.status === 'removida').length,
    maxDelay: Math.max(0, ...delays),
    averageDelay: delays.length ? delays.reduce((sum, d) => sum + d, 0) / delays.length : 0,
    planFinishVariance: liveEnd && baseEnd ? businessVariance(baseEnd, liveEnd, calendar) : undefined,
  };
  // Lista crítica: as atrasadas, da maior para a menor variação de término.
  const critical = late.slice().sort((a, b) => b.finishVariance! - a.finishVariance! || a.order - b.order);
  return { rows, summary, critical };
}

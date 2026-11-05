import type { Id, LocalDate, MediumTermPlan, PlanningData, PlanTask } from '@/domain/entities';
import { isMonthlyPlan } from '@/domain/legalization';
import { DEFAULT_CALENDAR, analyzeSchedule, isMilestone, type ScheduleAnalysis } from '@/domain/plan-schedule';
import { rollUpPlan } from '@/domain/rules';
import { baselineVariance, weeklyTeamLoad } from '@/domain/schedule-analysis';
import { addDays } from '@/domain/validation';
import {
  daysBetween,
  dayMonth,
  hasCompanyFilter,
  isWeekly,
  matchesCompany,
  monthLong,
  monthOf,
  plural,
  type DashboardFilters,
  type DashboardReference,
  type PanelSummary,
  type Segment,
} from '@/modules/dashboard/model';
import type { DashboardScale } from '@/modules/dashboard/period';

/** Quadro do médio prazo na aba 0 (regra 8 do modelo aprovado em 04/11/2026): o plano do mês da data de
 * referência, lido como a aba 3 lê — tarefas folha, status pelo % concluída, atraso na data pelo término
 * previsto, variação contra a linha de base congelada em dias úteis, caminho crítico do motor e marcos
 * dos 30 dias seguintes. Tudo puro; a tela e o PDF só desenham o que sai daqui.
 *
 * Escalas de tempo (04/11/2026, regra 9): a data de referência é o sábado final do período, e o plano é o do
 * mês desse sábado (um trimestre de julho a setembro termina no sábado 03/10 e lê o plano de outubro). O
 * quadro é um retrato nesse dia; a superalocação continua sendo a da última semana do período. Fora da
 * semanal, a tela e o resumo dizem o dia e o plano ("em 31/10 · plano de outubro"). */

export const STATUS_COLORS = { done: '#1baf7a', inProgress: '#2a78d6', notStarted: '#c4d3df' } as const;
export const VARIANCE_COLORS = { late: '#be123c', onTime: '#c4d3df', early: '#2a78d6' } as const;
/** Janela dos próximos marcos, em dias corridos a partir da data de referência. */
export const MILESTONE_WINDOW_DAYS = 30;
const MAX_LATE_SAMPLES = 3;
const MAX_WORST = 3;
const MAX_MILESTONES = 6;
const MAX_OVERLOADED_NAMES = 3;

export interface MediumTermPanelData {
  /** Sábado da semana analisada: a data até a qual tudo conta. */
  reference: LocalDate;
  /** Último dia da janela de marcos (`reference` + 30 dias). */
  milestoneHorizonEnd: LocalDate;
  plan: { id: Id; name: string; month: string; monthLabel: string; taskCount: number };
  byStatus: { label: string; value: number; color: string }[];
  done: number;
  inProgress: number;
  notStarted: number;
  /** Término previsto antes da data e menos de 100%. `inProgress` é a parte delas que já começou. */
  late: { count: number; inProgress: number; samples: { name: string; plannedEnd: LocalDate; daysLate: number }[] };
  baseline?: {
    name: string;
    frozenAt: string;
    late: number;
    early: number;
    onTime: number;
    added: number;
    removed: number;
    /** Os maiores atrasos de término, em dias úteis (positivo é atraso). */
    worst: { name: string; days: number }[];
    planFinishVariance?: number;
  };
  /** Ausente quando o motor não conseguiu programar a rede (ciclo, vínculo inválido). */
  critical?: { count: number; planFinish?: LocalDate };
  overloaded: { count: number; names: string[] };
  milestones: { name: string; date: LocalDate; critical: boolean }[];
  /** Há recorte de empreiteiro: status, atrasos, base e marcos são só das tarefas da empresa; caminho
   * crítico e superalocação continuam do plano inteiro. */
  companyFiltered: boolean;
  /** Escala do período: na semanal o quadro diz o que dizia antes das escalas de tempo. */
  scale: DashboardScale;
}

const byFrozenDesc = (a: MediumTermPlan, b: MediumTermPlan) => (b.frozenAt ?? b.createdAt).localeCompare(a.frozenAt ?? a.createdAt);
const isLive = (plan: MediumTermPlan) => !plan.baselineOf && !plan.frozenAt;

/** O plano vivo do mês da data; sem ele, o vivo mais recente até aquele mês; sem nenhum, o vivo mais
 * recente. Linha de base e plano congelado nunca entram: retrato não é o plano em que se escreve. O Gantt
 * de legalização (04/11/2026, regra 17) também não: ele fica só na aba 1. */
export function pickPlan(plans: MediumTermPlan[], workId: Id, date: LocalDate): MediumTermPlan | undefined {
  const live = plans.filter(p => p.workId === workId && isLive(p) && isMonthlyPlan(p)).sort((a, b) => b.month.localeCompare(a.month));
  const month = monthOf(date);
  return live.find(p => p.month === month) ?? live.find(p => p.month <= month) ?? live[0];
}

/** As linhas folha do plano, na ordem da planilha: item de resumo é o envelope dos subitens e não conta. */
const leavesOf = (tasks: PlanTask[]): PlanTask[] => {
  const rollUp = rollUpPlan(tasks);
  return tasks.filter(t => !rollUp.get(t.id)?.summary).sort((a, b) => a.order - b.order);
};

/** Marco e tarefa de 0 dias são a mesma coisa para o quadro; `rollUpPlan` só marca a folha. */
const status = (task: PlanTask): 'done' | 'inProgress' | 'notStarted' =>
  task.progress >= 100 ? 'done' : task.progress > 0 ? 'inProgress' : 'notStarted';

const monthName = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

/** O rótulo do retrato fora da semanal: "em 31/10 · plano de outubro"; ausente na semanal. */
export const mediumTermSnapshot = (d: Pick<MediumTermPanelData, 'scale' | 'reference' | 'plan'>): string | undefined =>
  d.scale === 'semana' ? undefined : `em ${dayMonth(d.reference)} · plano de ${monthName(d.plan.month)}`;

export function buildMediumTermPanel(
  data: PlanningData,
  workId: Id,
  ref: DashboardReference,
  filters: DashboardFilters,
): MediumTermPanelData | undefined {
  const plan = pickPlan(data.plans, workId, ref.weekEnd);
  if (!plan) return undefined;
  const date = ref.weekEnd;
  const calendar = plan.calendar ?? DEFAULT_CALENDAR;
  const teams = new Map(data.teams.map(t => [t.id, t]));
  const companyFiltered = hasCompanyFilter(filters);
  // Com recorte, tarefa sem equipe fica de fora: não há empresa pela qual ela entraria.
  const passes = (task: PlanTask) => !companyFiltered || matchesCompany(filters, task.teamId ? teams.get(task.teamId)?.company : undefined);

  const allTasks = data.planTasks.filter(t => t.planId === plan.id);
  const leaves = leavesOf(allTasks);
  const tasks = leaves.filter(passes);

  const done = tasks.filter(t => status(t) === 'done').length;
  const inProgress = tasks.filter(t => status(t) === 'inProgress').length;
  const notStarted = tasks.length - done - inProgress;

  const lateTasks = tasks
    .filter(t => t.plannedEnd < date && t.progress < 100)
    .sort((a, b) => a.plannedEnd.localeCompare(b.plannedEnd) || a.order - b.order);

  // Caminho crítico do plano inteiro, com a estrutura original: o motor cuida dos resumos. Vínculo com
  // ponta fora do plano é dado inconsistente e sai antes, para não derrubar a análise toda.
  const ids = new Set(allTasks.map(t => t.id));
  const links = data.planDependencies.filter(l => ids.has(l.predecessorId) && ids.has(l.successorId));
  let analysis: ScheduleAnalysis | undefined;
  try {
    analysis = analyzeSchedule(allTasks, links, calendar);
  } catch {
    analysis = undefined;
  }
  const critical = analysis
    ? {
        count: leaves.filter(t => analysis!.info.get(t.id)?.critical).length,
        planFinish:
          analysis.projectFinish ??
          leaves.reduce<LocalDate | undefined>((max, t) => {
            const finish = analysis!.info.get(t.id)?.earlyFinish;
            return finish && (!max || finish > max) ? finish : max;
          }, undefined),
      }
    : undefined;

  // Linha de base: a mais recente congelada deste plano. As duas listas já vêm só com folhas e com o
  // recorte aplicado; o nível vai a zero para o `rollUpPlan` interno da comparação não reler uma folha
  // como resumo quando o pai dela ficou de fora.
  const frozen = data.plans.filter(p => p.baselineOf === plan.id).sort(byFrozenDesc)[0];
  let baseline: MediumTermPanelData['baseline'];
  if (frozen) {
    const flat = (list: PlanTask[]) => list.map(t => ({ ...t, level: 0 }));
    const baseLeaves = leavesOf(data.planTasks.filter(t => t.planId === frozen.id)).filter(passes);
    const variance = baselineVariance(flat(tasks), flat(baseLeaves), calendar);
    baseline = {
      name: frozen.name,
      frozenAt: frozen.frozenAt ?? frozen.createdAt,
      late: variance.summary.lateCount,
      early: variance.summary.earlyCount,
      onTime: variance.summary.onTimeCount,
      added: variance.summary.newCount,
      removed: variance.summary.removedCount,
      worst: variance.critical.slice(0, MAX_WORST).map(r => ({ name: r.name, days: r.finishVariance ?? 0 })),
      planFinishVariance: variance.summary.planFinishVariance,
    };
  }

  // Superalocação da semana analisada (a última do período), do plano inteiro (e do cronograma): a conta é
  // por equipe, não por tarefa.
  const load = weeklyTeamLoad(data, workId, ref.week, ref.weekEnd);
  const overloadedTeams = load.teams.filter(t => t.overloadedWeeks > 0);

  const horizonEnd = addDays(date, MILESTONE_WINDOW_DAYS);
  const milestones = tasks
    .filter(t => isMilestone(t) && t.plannedEnd >= date && t.plannedEnd <= horizonEnd)
    .sort((a, b) => a.plannedEnd.localeCompare(b.plannedEnd) || a.order - b.order)
    .slice(0, MAX_MILESTONES)
    .map(t => ({ name: t.name, date: t.plannedEnd, critical: analysis?.info.get(t.id)?.critical ?? false }));

  return {
    reference: date,
    milestoneHorizonEnd: horizonEnd,
    plan: { id: plan.id, name: plan.name, month: plan.month, monthLabel: monthLong(plan.month), taskCount: tasks.length },
    byStatus: [
      { label: 'Concluídas', value: done, color: STATUS_COLORS.done },
      { label: 'Em andamento', value: inProgress, color: STATUS_COLORS.inProgress },
      { label: 'Não iniciadas', value: notStarted, color: STATUS_COLORS.notStarted },
    ],
    done,
    inProgress,
    notStarted,
    late: {
      count: lateTasks.length,
      inProgress: lateTasks.filter(t => t.progress > 0).length,
      samples: lateTasks
        .slice(0, MAX_LATE_SAMPLES)
        .map(t => ({ name: t.name, plannedEnd: t.plannedEnd, daysLate: daysBetween(t.plannedEnd, date) })),
    },
    baseline,
    critical,
    overloaded: { count: overloadedTeams.length, names: overloadedTeams.map(t => `${t.team.company} · ${t.team.name}`) },
    milestones,
    companyFiltered,
    scale: ref.period.scale,
  };
}

/** Os segmentos da barra contra a linha de base, na ordem do modelo (atrasadas, no prazo, adiantadas). */
export const varianceSegments = (baseline: NonNullable<MediumTermPanelData['baseline']>) => [
  { label: 'Atrasadas', value: baseline.late, color: VARIANCE_COLORS.late },
  { label: 'No prazo', value: baseline.onTime, color: VARIANCE_COLORS.onTime },
  { label: 'Adiantadas', value: baseline.early, color: VARIANCE_COLORS.early },
];

/** Até três nomes e "+N" para o resto, para a ajuda do cartão não crescer com a obra. */
export function shortList(names: string[], max = MAX_OVERLOADED_NAMES): string {
  if (!names.length) return '';
  const head = names.slice(0, max).join(', ');
  return names.length > max ? `${head} +${names.length - max}` : head;
}

/** A frase do callout do PDF: o que está em andamento e já passou do término, e onde a rede termina. */
export function mediumTermCallout(d: MediumTermPanelData): string {
  const notStartedLate = d.late.count - d.late.inProgress;
  const parts = [
    d.inProgress
      ? `Das ${d.inProgress} em andamento, ${d.late.inProgress} ${d.late.inProgress === 1 ? 'terminaria' : 'terminariam'} até ${dayMonth(d.reference)}`
      : `Nenhuma tarefa em andamento na data`,
  ];
  if (notStartedLate > 0)
    parts.push(
      `${plural(notStartedLate, 'não iniciada', 'não iniciadas')} também ${notStartedLate === 1 ? 'passou' : 'passaram'} do término`,
    );
  const first = `${parts.join('; ')}.`;
  const second = d.critical
    ? `Caminho crítico com ${plural(d.critical.count, 'tarefa', 'tarefas')}${d.critical.planFinish ? `; término do plano em ${dayMonth(d.critical.planFinish)}` : ''}.`
    : 'Caminho crítico indisponível: a rede do plano não pôde ser calculada.';
  return `${first} ${second}`;
}

/** O cartão e a frase. Fora da semanal, a dica diz o dia e o plano ("Em 31/10 · plano de outubro · …") e a
 * frase troca "a data" pelo dia. */
export function mediumTermSummary(d: MediumTermPanelData, ref: DashboardReference): PanelSummary {
  const late = d.late.count;
  const name = monthName(d.plan.month);
  const weekly = isWeekly(ref);
  const day = dayMonth(ref.weekEnd);
  const against = d.baseline ? `${plural(d.baseline.late, 'atrasada', 'atrasadas')} contra a linha de base` : 'sem linha de base';
  const sentence: Segment[] = late
    ? [
        { text: `No plano de ${name}, ` },
        { text: plural(late, 'tarefa', 'tarefas'), strong: true },
        {
          text: ` ${late === 1 ? 'terminaria' : 'terminariam'} até ${weekly ? 'a data' : day} e não ${late === 1 ? 'terminou' : 'terminaram'}.`,
        },
      ]
    : [{ text: `No plano de ${name}, nenhuma tarefa está atrasada ${weekly ? 'na data' : `em ${day}`}.` }];
  return {
    kpi: {
      module: 'medio-prazo',
      label: 'Tarefas atrasadas',
      value: String(late),
      tag: late > 0 ? { text: `de ${d.plan.taskCount}`, tone: 'bad' } : { text: 'em dia', tone: 'good' },
      hint: weekly ? `Plano de ${d.plan.monthLabel} · ${against}` : `Em ${day} · plano de ${name} · ${against}`,
      tone: late > 0 ? 'bad' : 'good',
    },
    sentence,
  };
}

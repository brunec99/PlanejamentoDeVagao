import type { PlanningData, PlanTask, Team, WeeklyCommitment } from './entities';
import { daysBetween, floorSchedule, latestPercents, physicalProgress, planSpan, type LongTermPlanDocument } from './long-term-plan';
import { analyzeSchedule, DEFAULT_CALENDAR } from './plan-schedule';
import { causePareto, isOverdue, ppc, ppcSeries, rollUpPlan, targetPercent, wagonStatus } from './rules';
import { baselineVariance, weeklyTeamLoad } from './schedule-analysis';
import { addDays, startOfWeek } from './validation';
import { weekNumberFrom } from './week-numbering';

/** Dossiê da obra para o agente de IA (27/10/2026): a leitura determinística dos três níveis — longo
 * prazo (plano macro e vagões), médio prazo (plano do mês) e curto prazo (planilha semanal) — e as
 * correlações entre eles, em regras fixas e testáveis. O modelo recebe este texto e escreve a leitura
 * por cima; os achados aparecem na tela mesmo sem chave da API, e o `hash` diz se os dados mudaram
 * desde a última leitura guardada (sem mudança, o modelo não é chamado de novo).
 *
 * O pareamento entre níveis é pelo nome normalizado (sem acento, caixa nem espaço repetido), igual ao
 * que a cobertura do médio prazo faz: o vínculo formal entre níveis é opcional e raro. É sugestão, e o
 * texto diz isso ao modelo. */

export type BriefingLevel = 'longo' | 'medio' | 'curto';
export type FindingLevel = BriefingLevel | 'cruzado';
export type FindingSeverity = 'alerta' | 'atencao' | 'positivo' | 'info';
export interface BriefingFinding {
  /** Identificador fixo da regra (`curto-nao-levadas`); a tela e os testes o usam. */
  id: string;
  level: FindingLevel;
  severity: FindingSeverity;
  title: string;
  detail: string;
  /** Nomes envolvidos, no máximo oito. */
  items?: string[];
}

export interface ServiceGap {
  name: string;
  measured: number;
  planned: number;
  /** Planejado menos medido, em pontos percentuais: positivo é atraso. */
  gap: number;
}
export interface LongTermSummary {
  services: number;
  floors: number;
  start?: string;
  finish?: string;
  baseline?: { name: string; finish?: string; finishShiftDays?: number };
  physicalProgress?: number;
  plannedProgress?: number;
  lastMeasurement?: string;
  measurements: number;
  behind: ServiceGap[];
  ahead: number;
  wagons: {
    total: number;
    overdue: number;
    overdueNames: string[];
    restricted: number;
    openRestrictions: number;
    overdueRestrictions: string[];
  };
}
export interface MediumTermSummary {
  plan?: { name: string; month: string; tasks: number; leaves: number; stale: boolean };
  baseline?: { name: string; frozenAt?: string };
  late: { name: string; days: number }[];
  lateCount: number;
  planFinishVariance?: number;
  overdue: { name: string; plannedEnd: string; progress: number }[];
  overdueCount: number;
  behindTarget: { name: string; progress: number; target: number }[];
  behindTargetCount: number;
  dueSoon: { name: string; plannedEnd: string; progress: number }[];
  dueSoonCount: number;
  critical: number;
  conflicts: number;
  deadlinesMissed: number;
  overloaded: { team: string; weeks: number; peak: number; capacity: number }[];
}
export interface WeekSummary {
  weekStart: string;
  number: number;
  planned: number;
  fulfilled: number;
  pending: number;
  percent: number;
}
export interface ShortTermSummary {
  weekOne: string;
  currentWeek: WeekSummary;
  recent: WeekSummary[];
  averageRecent?: number;
  trend?: 'subindo' | 'caindo' | 'estável';
  topCauses: { cause: string; total: number; share: number }[];
  failuresInWindow: number;
  repeated: { name: string; company: string; weeks: number; causes: string[] }[];
  companies: { company: string; planned: number; percent: number }[];
  unrecorded: number;
  /** "Não" da semana anterior sem linha de mesmo nome e empresa na semana atual. */
  notCarried: string[];
}
export interface AgentBriefing {
  workId: string;
  workCode: string;
  workName: string;
  today: string;
  levels: BriefingLevel[];
  longo?: LongTermSummary;
  medio?: MediumTermSummary;
  curto?: ShortTermSummary;
  findings: BriefingFinding[];
  /** O dossiê em texto, como vai para o modelo. */
  text: string;
  /** Impressão digital do texto: muda quando os dados relevantes mudam. */
  hash: string;
}
export interface BriefingInput {
  data: PlanningData;
  workId: string;
  today: string;
  /** Níveis que a pessoa pode ler; os demais ficam fora do dossiê e do texto. */
  levels: BriefingLevel[];
  longTermPlan?: LongTermPlanDocument;
  /** Semana 1 da obra (configurações); sem ela, a primeira semana com linha. */
  weekOne?: string;
}

// ─── Utilidades ─────────────────────────────────────────────────────────────────

export const nameKey = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** Pareia nomes escritos à mão em níveis diferentes: iguais, ou um contém o outro (com ao menos quatro letras). */
export function namesPair(a: string, b: string): boolean {
  const x = nameKey(a),
    y = nameKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.includes(short);
}
export const commitmentCompanyOf = (row: WeeklyCommitment, teams: Team[]) =>
  row.supplier.trim() || teams.find(t => t.id === row.teamId)?.company || '';
export const MAX_ITEMS = 8;
const LIST = 6;
const num = (n: number, digits = 1) => {
  const factor = 10 ** digits;
  return String(Math.round(n * factor) / factor).replace('.', ',');
};
const pct = (n: number) => `${Math.round(n)}%`;
const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const dmy = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cut = (text: string, max = 70) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const top = <T>(rows: T[], n = MAX_ITEMS) => rows.slice(0, n);

/** FNV-1a de 32 bits em hexadecimal: só para saber se o texto mudou. */
export function briefingHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

// ─── Longo prazo ────────────────────────────────────────────────────────────────

function longTerm(doc: LongTermPlanDocument | undefined, data: PlanningData, workId: string, today: string): LongTermSummary {
  const activities = doc?.activities.filter(a => a.visible) ?? [];
  const span = planSpan(activities);
  const measurable = activities.filter(a => a.unit);
  const measured = doc ? latestPercents(activities, doc.measurements, today) : {};
  const physical = doc ? physicalProgress(activities, doc.measurements, today) : undefined;
  const plannedOf = (activity: (typeof activities)[number]) => {
    const slots = floorSchedule(activity);
    const total = slots.reduce((sum, s) => sum + s.duration, 0);
    const done = slots.reduce((sum, s) => sum + Math.max(0, Math.min(s.duration, daysBetween(s.start, today))), 0);
    return { weight: total, percent: total ? (done / total) * 100 : 0 };
  };
  const base = measurable.length ? measurable : activities;
  let weight = 0,
    planned = 0;
  for (const activity of base) {
    const p = plannedOf(activity);
    weight += p.weight;
    planned += p.weight * p.percent;
  }
  const gaps: ServiceGap[] = measurable.map(activity => {
    const p = plannedOf(activity).percent;
    const m = measured[activity.id] ?? 0;
    return { name: activity.name, measured: m, planned: p, gap: p - m };
  });
  const behind = gaps
    .filter(g => g.planned >= 5 && g.gap >= 10)
    .sort((a, b) => b.gap - a.gap || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, LIST);
  const ahead = gaps.filter(g => g.gap <= -10).length;
  const dates = doc?.measurements.map(m => m.date).sort() ?? [];
  const latestBaseline = doc?.baselines.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const baselineSpan = latestBaseline ? planSpan(latestBaseline.activities.filter(a => a.visible)) : undefined;

  const sequenceIds = new Set(data.sequences.filter(s => s.workId === workId).map(s => s.id));
  const wagons = data.wagons.filter(w => sequenceIds.has(w.sequenceId)).sort((a, b) => a.number - b.number);
  const wagonIds = new Set(wagons.map(w => w.id));
  const overdueWagons = wagons.filter(w => isOverdue(w, data, today));
  const restricted = wagons.filter(w => wagonStatus(w, data) === 'restricted').length;
  const openRestrictions = data.restrictions.filter(r => wagonIds.has(r.wagonId) && r.status === 'open');
  const overdueRestrictions = openRestrictions
    .filter(r => r.dueDate < today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map(r => `${cut(r.description, 50)} (venceu ${dm(r.dueDate)})`);
  return {
    services: activities.length,
    floors: doc?.floorCount ?? 0,
    start: span?.start,
    finish: span?.finish,
    baseline:
      latestBaseline && baselineSpan && span
        ? { name: latestBaseline.name, finish: baselineSpan.finish, finishShiftDays: daysBetween(baselineSpan.finish, span.finish) }
        : latestBaseline
          ? { name: latestBaseline.name }
          : undefined,
    physicalProgress: physical,
    plannedProgress: weight ? planned / weight : undefined,
    lastMeasurement: dates[dates.length - 1],
    measurements: doc?.measurements.length ?? 0,
    behind,
    ahead,
    wagons: {
      total: wagons.length,
      overdue: overdueWagons.length,
      overdueNames: top(overdueWagons.map(w => `Vagão ${String(w.number).padStart(2, '0')}`)),
      restricted,
      openRestrictions: openRestrictions.length,
      overdueRestrictions: top(overdueRestrictions),
    },
  };
}

// ─── Médio prazo ────────────────────────────────────────────────────────────────

function mediumTerm(data: PlanningData, workId: string, today: string) {
  const livePlans = data.plans
    .filter(p => p.workId === workId && !p.baselineOf && !p.frozenAt)
    .sort((a, b) => b.month.localeCompare(a.month));
  const plan = livePlans[0];
  const empty: MediumTermSummary = {
    late: [],
    lateCount: 0,
    overdue: [],
    overdueCount: 0,
    behindTarget: [],
    behindTargetCount: 0,
    dueSoon: [],
    dueSoonCount: 0,
    critical: 0,
    conflicts: 0,
    deadlinesMissed: 0,
    overloaded: [],
  };
  const weekStart = startOfWeek(today);
  const overloaded = weeklyTeamLoad(data, workId, weekStart, addDays(weekStart, 27))
    .teams.filter(t => t.overloadedWeeks > 0)
    .map(t => ({ team: `${t.team.company} · ${t.team.name}`, weeks: t.overloadedWeeks, peak: t.peak, capacity: t.team.weeklyCapacity }));
  if (!plan) return { summary: { ...empty, overloaded }, leaves: [] as PlanTask[], plan: undefined };

  const tasks = data.planTasks.filter(t => t.planId === plan.id).sort((a, b) => a.order - b.order);
  const rollUp = rollUpPlan(tasks);
  const leaves = tasks.filter(t => !rollUp.get(t.id)?.summary);
  const calendar = plan.calendar ?? DEFAULT_CALENDAR;
  const baseline = data.plans.filter(p => p.baselineOf === plan.id && p.frozenAt).sort((a, b) => b.frozenAt!.localeCompare(a.frozenAt!))[0];
  const variance = baseline
    ? baselineVariance(
        tasks,
        data.planTasks.filter(t => t.planId === baseline.id),
        calendar,
      )
    : undefined;
  const overdueRows = leaves
    .filter(t => t.plannedEnd < today && t.progress < 100 && !t.actualEnd)
    .sort((a, b) => a.plannedEnd.localeCompare(b.plannedEnd))
    .map(t => ({ name: t.name, plannedEnd: t.plannedEnd, progress: t.progress }));
  const behindRows = leaves
    .filter(t => t.plannedStart <= today && t.plannedEnd >= today && t.progress < 100 && !rollUp.get(t.id)?.milestone)
    .map(t => ({ name: t.name, progress: t.progress, target: targetPercent(t, today) }))
    .filter(t => t.target - t.progress >= 20)
    .sort((a, b) => b.target - b.progress - (a.target - a.progress));
  const dueSoonRows = leaves
    .filter(t => t.plannedEnd >= today && t.plannedEnd <= addDays(today, 14) && t.progress < 100)
    .sort((a, b) => a.plannedEnd.localeCompare(b.plannedEnd))
    .map(t => ({ name: t.name, plannedEnd: t.plannedEnd, progress: t.progress }));
  let critical = 0,
    conflicts = 0,
    deadlinesMissed = 0;
  try {
    const taskIds = new Set(tasks.map(t => t.id));
    const links = data.planDependencies.filter(d => taskIds.has(d.predecessorId) && taskIds.has(d.successorId));
    const { info } = analyzeSchedule(tasks, links, calendar);
    for (const leaf of leaves) {
      const i = info.get(leaf.id);
      if (!i) continue;
      if (i.critical && leaf.progress < 100) critical++;
      if (i.conflict) conflicts++;
      if (i.deadlineMissed) deadlinesMissed++;
    }
  } catch {
    // Plano com período inválido: a análise de rede fica de fora e o resto do dossiê segue.
  }
  const summary: MediumTermSummary = {
    plan: { name: plan.name, month: plan.month, tasks: tasks.length, leaves: leaves.length, stale: plan.month < today.slice(0, 7) },
    baseline: baseline ? { name: baseline.name, frozenAt: baseline.frozenAt } : undefined,
    late: variance ? variance.critical.slice(0, LIST).map(r => ({ name: r.name, days: r.finishVariance! })) : [],
    lateCount: variance?.summary.lateCount ?? 0,
    planFinishVariance: variance?.summary.planFinishVariance,
    overdue: overdueRows.slice(0, LIST),
    overdueCount: overdueRows.length,
    behindTarget: behindRows.slice(0, LIST),
    behindTargetCount: behindRows.length,
    dueSoon: dueSoonRows.slice(0, LIST),
    dueSoonCount: dueSoonRows.length,
    critical,
    conflicts,
    deadlinesMissed,
    overloaded,
  };
  return { summary, leaves, plan };
}

// ─── Curto prazo ────────────────────────────────────────────────────────────────

const LABOR_CAUSES = new Set(['Falta de Mão de Obra', 'Baixa Produtividade', 'Superestimação da produtividade']);
const UPSTREAM_CAUSES = new Set([
  'Atraso de tarefas antecedentes',
  'Falta de Material',
  'Falta de equipamento',
  'Falha de definição de projeto',
]);

function shortTerm(data: PlanningData, workId: string, today: string, weekOneInput?: string) {
  const teams = data.teams.filter(t => t.workId === workId);
  const rows = data.commitments.filter(c => c.workId === workId);
  const currentWeek = startOfWeek(today);
  const earliest = rows.reduce<string | undefined>((min, c) => (!min || c.weekStart < min ? c.weekStart : min), undefined);
  const weekOne = startOfWeek(weekOneInput ?? earliest ?? currentWeek);
  const numberOf = (weekStart: string) => weekNumberFrom(weekOne, weekStart);
  const toWeek = (w: { weekStart: string; planned: number; fulfilled: number; pending: number; percent: number }): WeekSummary => ({
    ...w,
    number: numberOf(w.weekStart),
  });
  const series = ppcSeries(rows);
  const closed = series.filter(w => w.weekStart < currentWeek);
  const recent = closed.slice(-8).map(toWeek);
  const current = toWeek({ weekStart: currentWeek, ...ppc(rows.filter(c => c.weekStart === currentWeek)) });
  const lastFour = closed.slice(-4);
  const averageRecent = lastFour.length ? lastFour.reduce((sum, w) => sum + w.percent, 0) / lastFour.length : undefined;
  let trend: ShortTermSummary['trend'];
  if (closed.length >= 2) {
    const last = closed[closed.length - 1].percent;
    const before = closed.slice(-4, -1);
    const reference = before.reduce((sum, w) => sum + w.percent, 0) / before.length;
    trend = last - reference >= 10 ? 'subindo' : last - reference <= -10 ? 'caindo' : 'estável';
  }
  const windowStart = recent[0]?.weekStart ?? currentWeek;
  const inWindow = rows.filter(c => c.weekStart >= windowStart && c.weekStart < currentWeek);
  const failures = inWindow.filter(c => c.fulfilled === false);
  const pareto = causePareto(inWindow);
  const topCauses = pareto.slice(0, 5).map(c => ({ cause: c.cause, total: c.total, share: c.share }));
  const groups = new Map<string, { name: string; company: string; weeks: Set<string>; causes: Set<string> }>();
  for (const row of failures) {
    const company = commitmentCompanyOf(row, teams);
    const key = `${nameKey(row.name)}|${nameKey(company)}`;
    const group = groups.get(key) ?? { name: row.name, company, weeks: new Set<string>(), causes: new Set<string>() };
    group.weeks.add(row.weekStart);
    if (row.cause) group.causes.add(row.cause);
    groups.set(key, group);
  }
  const repeated = [...groups.values()]
    .filter(g => g.weeks.size >= 2)
    .sort((a, b) => b.weeks.size - a.weeks.size || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, LIST)
    .map(g => ({ name: g.name, company: g.company, weeks: g.weeks.size, causes: [...g.causes] }));
  const byCompany = new Map<string, WeeklyCommitment[]>();
  for (const row of inWindow) {
    const company = commitmentCompanyOf(row, teams) || '(sem empreiteiro)';
    byCompany.set(company, [...(byCompany.get(company) ?? []), row]);
  }
  const companies = [...byCompany.entries()]
    .map(([company, list]) => ({ company, planned: list.length, percent: ppc(list).percent }))
    .filter(c => c.planned >= 5)
    .sort((a, b) => a.percent - b.percent || b.planned - a.planned)
    .slice(0, 5);
  const unrecorded = inWindow.filter(c => c.fulfilled === undefined).length;
  const previousWeek = addDays(currentWeek, -7);
  const currentRows = rows.filter(c => c.weekStart === currentWeek);
  const notCarried = rows
    .filter(c => c.weekStart === previousWeek && c.fulfilled === false)
    .filter(
      c =>
        !currentRows.some(
          n => nameKey(n.name) === nameKey(c.name) && nameKey(commitmentCompanyOf(n, teams)) === nameKey(commitmentCompanyOf(c, teams)),
        ),
    )
    .map(c => `${c.name}${commitmentCompanyOf(c, teams) ? ` (${commitmentCompanyOf(c, teams)})` : ''}`);
  const summary: ShortTermSummary = {
    weekOne,
    currentWeek: current,
    recent,
    averageRecent,
    trend,
    topCauses,
    failuresInWindow: failures.length,
    repeated,
    companies,
    unrecorded,
    notCarried,
  };
  return { summary, teams, rows, failures, currentRows, currentWeek };
}

// ─── Dossiê ─────────────────────────────────────────────────────────────────────

export function buildBriefing(input: BriefingInput): AgentBriefing {
  const { data, workId, today } = input;
  const work = data.works.find(w => w.id === workId);
  const levels = (['longo', 'medio', 'curto'] as const).filter(level => input.levels.includes(level));
  const findings: BriefingFinding[] = [];
  const add = (finding: BriefingFinding) => findings.push(finding);
  const lines: string[] = [];
  const weekday = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][new Date(`${today}T00:00:00Z`).getUTCDay()];

  const longo = levels.includes('longo') ? longTerm(input.longTermPlan, data, workId, today) : undefined;
  const medio = levels.includes('medio') ? mediumTerm(data, workId, today) : undefined;
  const curto = levels.includes('curto') ? shortTerm(data, workId, today, input.weekOne) : undefined;

  lines.push(`Obra: ${work?.code ?? '?'} · ${work?.name ?? workId}. Hoje: ${dmy(today)} (${weekday}).`);
  if (curto) lines.push(`Semana atual: ${curto.summary.currentWeek.number} (segunda ${dmy(curto.summary.currentWeek.weekStart)}).`);
  lines.push(`Níveis lidos: ${levels.join(', ')}.`);

  // Longo prazo
  if (longo) {
    const s = longo;
    lines.push('', '## Longo prazo (plano macro, Linha de Balanço, e vagões)');
    if (!input.longTermPlan || !s.services) {
      lines.push('- Sem plano de longo prazo preenchido no sistema.');
      add({
        id: 'longo-sem-plano',
        level: 'longo',
        severity: 'info',
        title: 'Sem plano de longo prazo',
        detail: 'A obra ainda não tem o plano macro preenchido no Planejador; o dossiê do longo prazo fica só com os vagões.',
      });
    } else {
      const baseline =
        s.baseline?.finishShiftDays !== undefined
          ? ` Linha de base "${s.baseline.name}": término ${dmy(s.baseline.finish!)} (${s.baseline.finishShiftDays >= 0 ? '+' : ''}${s.baseline.finishShiftDays} dias).`
          : '';
      lines.push(
        `- Serviços: ${s.services} em ${s.floors} pavimentos; início ${s.start ? dmy(s.start) : '?'}, término previsto ${s.finish ? dmy(s.finish) : '?'}.${baseline}`,
      );
      if (s.physicalProgress !== undefined && s.plannedProgress !== undefined) {
        const gap = s.plannedProgress - s.physicalProgress;
        lines.push(
          `- Avanço físico medido: ${num(s.physicalProgress)}% (última medição ${s.lastMeasurement ? dmy(s.lastMeasurement) : '?'}, ${plural(s.measurements, 'medição', 'medições')}). Planejado para hoje: ${num(s.plannedProgress)}%. Diferença: ${gap >= 0 ? '-' : '+'}${num(Math.abs(gap))} pontos.`,
        );
        if (gap >= 5)
          add({
            id: 'longo-avanco-atrasado',
            level: 'longo',
            severity: gap >= 15 ? 'alerta' : 'atencao',
            title: `Avanço físico ${num(gap)} pontos abaixo do planejado`,
            detail: `Medido ${num(s.physicalProgress)}% contra ${num(s.plannedProgress)}% previsto para hoje pelo plano macro.`,
          });
        else if (gap <= -5)
          add({
            id: 'longo-avanco-adiantado',
            level: 'longo',
            severity: 'positivo',
            title: `Avanço físico ${num(-gap)} pontos acima do planejado`,
            detail: `Medido ${num(s.physicalProgress)}% contra ${num(s.plannedProgress)}% previsto para hoje.`,
          });
      } else if (s.plannedProgress !== undefined) {
        lines.push(`- Sem medição física lançada; pelo tempo, o plano prevê ${num(s.plannedProgress)}% para hoje.`);
        add({
          id: 'longo-sem-medicao',
          level: 'longo',
          severity: 'info',
          title: 'Sem medição física',
          detail: 'Nenhuma medição lançada no Planejador: não dá para comparar o avanço real com o macro.',
        });
      }
      if (s.lastMeasurement && daysBetween(s.lastMeasurement, today) > 30)
        add({
          id: 'longo-medicao-antiga',
          level: 'longo',
          severity: 'atencao',
          title: `Última medição há ${daysBetween(s.lastMeasurement, today)} dias`,
          detail: `A medição mais recente é de ${dmy(s.lastMeasurement)}; o avanço físico pode estar defasado.`,
        });
      if (s.behind.length) {
        lines.push(
          `- Serviços atrasados (medido × planejado hoje): ${s.behind.map(g => `${g.name} ${pct(g.measured)}×${pct(g.planned)} (-${num(g.gap, 0)})`).join('; ')}.`,
        );
        add({
          id: 'longo-servicos-atrasados',
          level: 'longo',
          severity: s.behind[0].gap >= 25 ? 'alerta' : 'atencao',
          title: `${plural(s.behind.length, 'serviço atrasado', 'serviços atrasados')} no macro`,
          detail: `Maior diferença: ${s.behind[0].name}, ${num(s.behind[0].gap, 0)} pontos abaixo do previsto.`,
          items: s.behind.map(g => `${g.name}: ${pct(g.measured)} medido × ${pct(g.planned)} previsto`),
        });
      }
      if (s.ahead) lines.push(`- Serviços adiantados (10 pontos ou mais): ${s.ahead}.`);
      if (s.baseline?.finishShiftDays !== undefined && s.baseline.finishShiftDays > 0)
        add({
          id: 'longo-termino-deslizou',
          level: 'longo',
          severity: s.baseline.finishShiftDays > 30 ? 'alerta' : 'atencao',
          title: `Término ${s.baseline.finishShiftDays} dias depois da linha de base`,
          detail: `O plano macro termina em ${dmy(s.finish!)}; a linha de base "${s.baseline.name}" previa ${dmy(s.baseline.finish!)}.`,
        });
    }
    const w = s.wagons;
    if (w.total) {
      lines.push(
        `- Vagões: ${w.total}; vencidos sem terminalidade: ${w.overdue}${w.overdueNames.length ? ` (${w.overdueNames.join(', ')})` : ''}; com restrição aberta que bloqueia: ${w.restricted}. Restrições abertas: ${w.openRestrictions}, vencidas: ${w.overdueRestrictions.length}${w.overdueRestrictions.length ? ` — ${w.overdueRestrictions.join('; ')}` : ''}.`,
      );
      if (w.overdue)
        add({
          id: 'longo-vagoes-vencidos',
          level: 'longo',
          severity: 'atencao',
          title: `${plural(w.overdue, 'vagão vencido', 'vagões vencidos')} sem terminalidade`,
          detail: 'Passaram do término planejado sem fechar os critérios de terminalidade.',
          items: w.overdueNames,
        });
      if (w.overdueRestrictions.length)
        add({
          id: 'longo-restricoes-vencidas',
          level: 'longo',
          severity: 'alerta',
          title: `${plural(w.overdueRestrictions.length, 'restrição vencida', 'restrições vencidas')} em aberto`,
          detail: 'Restrições com limite de resolução no passado ainda abertas: a frente começa sem o que precisa.',
          items: w.overdueRestrictions,
        });
    } else lines.push('- Sem vagões gerados para esta obra.');
  }

  // Médio prazo
  if (medio) {
    const s = medio.summary;
    lines.push('', '## Médio prazo (plano do mês, padrão MS Project)');
    if (!s.plan) {
      lines.push('- Sem plano do mês vivo.');
      add({
        id: 'medio-sem-plano',
        level: 'medio',
        severity: 'atencao',
        title: 'Sem plano do mês',
        detail: 'Nenhum cronograma de médio prazo vivo para esta obra; a cobertura entre o mês e a semana não pode ser conferida.',
      });
    } else {
      lines.push(
        `- Plano vivo: "${s.plan.name}" (${s.plan.month}), ${s.plan.tasks} tarefas (${s.plan.leaves} folhas)${s.baseline ? `; linha de base "${s.baseline.name}"${s.baseline.frozenAt ? ` congelada em ${dmy(s.baseline.frozenAt.slice(0, 10))}` : ''}` : '; sem linha de base congelada'}.`,
      );
      if (s.plan.stale)
        add({
          id: 'medio-plano-desatualizado',
          level: 'medio',
          severity: 'atencao',
          title: `Plano do mês é de ${s.plan.month}`,
          detail: `O plano vivo mais recente é de ${s.plan.month}; o mês atual ainda não tem o próprio cronograma (cada mês nasce como cópia do anterior).`,
        });
      if (s.baseline) {
        lines.push(
          `- Contra a linha de base: ${plural(s.lateCount, 'tarefa atrasada', 'tarefas atrasadas')}${s.planFinishVariance !== undefined ? `; término do plano ${s.planFinishVariance >= 0 ? '+' : ''}${s.planFinishVariance} dias úteis` : ''}.${s.late.length ? ` Mais atrasadas: ${s.late.map(t => `${t.name} (+${t.days} du)`).join('; ')}.` : ''}`,
        );
        if (s.lateCount)
          add({
            id: 'medio-atraso-linha-base',
            level: 'medio',
            severity: s.late[0].days >= 5 ? 'alerta' : 'atencao',
            title: `${plural(s.lateCount, 'tarefa atrasada', 'tarefas atrasadas')} contra a linha de base`,
            detail: `Maior atraso: ${s.late[0].name}, ${s.late[0].days} dias úteis${s.planFinishVariance ? `; o término do plano deslizou ${s.planFinishVariance} dias úteis` : ''}.`,
            items: s.late.map(t => `${t.name}: +${t.days} du`),
          });
      } else
        add({
          id: 'medio-sem-linha-base',
          level: 'medio',
          severity: 'info',
          title: 'Plano do mês sem linha de base',
          detail: 'Sem linha de base congelada não há como medir o que atrasou dentro do mês.',
        });
      if (s.overdueCount) {
        lines.push(
          `- Vencidas sem concluir (término antes de hoje, menos de 100%): ${s.overdueCount}: ${s.overdue.map(t => `${t.name} (${dm(t.plannedEnd)}, ${pct(t.progress)})`).join('; ')}.`,
        );
        add({
          id: 'medio-vencidas',
          level: 'medio',
          severity: 'alerta',
          title: `${plural(s.overdueCount, 'tarefa vencida', 'tarefas vencidas')} sem concluir`,
          detail: 'Término planejado já passou e o percentual não chegou a 100%: ou atrasaram, ou falta lançar o avanço.',
          items: s.overdue.map(t => `${t.name}: término ${dm(t.plannedEnd)}, ${pct(t.progress)}`),
        });
      }
      if (s.behindTargetCount) {
        lines.push(
          `- Em andamento abaixo do alvo temporal (20 pontos ou mais): ${s.behindTargetCount}: ${s.behindTarget.map(t => `${t.name} ${pct(t.progress)} (alvo ${pct(t.target)})`).join('; ')}.`,
        );
        add({
          id: 'medio-abaixo-do-alvo',
          level: 'medio',
          severity: 'atencao',
          title: `${plural(s.behindTargetCount, 'tarefa', 'tarefas')} abaixo do alvo temporal`,
          detail: 'O tempo passou mais que o avanço lançado; o alvo é leitura de tempo, não medição.',
          items: s.behindTarget.map(t => `${t.name}: ${pct(t.progress)} de ${pct(t.target)}`),
        });
      }
      if (s.dueSoonCount)
        lines.push(
          `- Terminam nos próximos 14 dias: ${s.dueSoonCount}: ${s.dueSoon.map(t => `${t.name} (${dm(t.plannedEnd)}, ${pct(t.progress)})`).join('; ')}.`,
        );
      lines.push(
        `- Rede: ${plural(s.critical, 'tarefa crítica', 'tarefas críticas')} em aberto; vínculos desrespeitados: ${s.conflicts}; prazos finais estourados: ${s.deadlinesMissed}.`,
      );
      if (s.conflicts)
        add({
          id: 'medio-vinculos',
          level: 'medio',
          severity: 'atencao',
          title: `${plural(s.conflicts, 'vínculo desrespeitado', 'vínculos desrespeitados')}`,
          detail: 'Data real ou restrição prendeu a tarefa antes do que a predecessora permite.',
        });
      if (s.deadlinesMissed)
        add({
          id: 'medio-prazo-final',
          level: 'medio',
          severity: 'alerta',
          title: `${plural(s.deadlinesMissed, 'prazo final estourado', 'prazos finais estourados')}`,
          detail: 'Tarefas cujo término passou do "Prazo final" informado no plano.',
        });
    }
    if (s.overloaded.length) {
      lines.push(
        `- Equipes sobrecarregadas nas próximas 4 semanas: ${s.overloaded.map(t => `${t.team} (${plural(t.weeks, 'semana', 'semanas')}, pico ${t.peak} de ${t.capacity})`).join('; ')}.`,
      );
      add({
        id: 'medio-equipes-sobrecarga',
        level: 'medio',
        severity: 'atencao',
        title: `${plural(s.overloaded.length, 'equipe sobrecarregada', 'equipes sobrecarregadas')} nas próximas 4 semanas`,
        detail: 'Mais frentes simultâneas que a capacidade cadastrada, somando plano do mês e vagões.',
        items: s.overloaded.map(t => `${t.team}: pico ${t.peak} de ${t.capacity}`),
      });
    }
  }

  // Curto prazo
  if (curto) {
    const s = curto.summary;
    lines.push('', '## Curto prazo (planilha semanal, Last Planner)');
    const c = s.currentWeek;
    lines.push(
      `- Semana atual ${c.number} (${dmy(c.weekStart)}): ${plural(c.planned, 'linha', 'linhas')}, ${c.fulfilled} Sim, ${c.planned - c.fulfilled - c.pending} Não, ${c.pending} sem apontamento${c.planned ? ` (PPC parcial ${pct(c.percent)})` : ''}.`,
    );
    if (!c.planned)
      add({
        id: 'curto-semana-vazia',
        level: 'curto',
        severity: 'alerta',
        title: 'Semana atual sem planilha',
        detail: `Nenhuma linha na semana ${c.number}: a semana ainda não foi planejada.`,
      });
    if (s.recent.length) {
      lines.push(
        `- Últimas semanas fechadas (PPC): ${s.recent.map(w => `S${w.number} ${pct(w.percent)} (${w.planned})`).join(' · ')}.${s.averageRecent !== undefined ? ` Média das últimas ${Math.min(4, s.recent.length)}: ${pct(s.averageRecent)}.` : ''}${s.trend ? ` Tendência: ${s.trend}.` : ''}`,
      );
      if (s.averageRecent !== undefined && s.averageRecent < 60)
        add({
          id: 'curto-ppc-baixo',
          level: 'curto',
          severity: 'alerta',
          title: `PPC médio de ${pct(s.averageRecent)} nas últimas semanas`,
          detail: 'Abaixo de 60%: menos de dois terços do que se promete na semana é cumprido.',
        });
      else if (s.averageRecent !== undefined && s.averageRecent >= 85)
        add({
          id: 'curto-ppc-alto',
          level: 'curto',
          severity: 'positivo',
          title: `PPC médio de ${pct(s.averageRecent)}`,
          detail: 'Compromissos da semana vêm sendo cumpridos com consistência.',
        });
      if (s.trend === 'caindo')
        add({
          id: 'curto-ppc-caindo',
          level: 'curto',
          severity: 'atencao',
          title: 'PPC em queda',
          detail: `A última semana fechada ficou 10 pontos ou mais abaixo da média das três anteriores.`,
        });
    } else lines.push('- Nenhuma semana fechada ainda.');
    if (s.topCauses.length)
      lines.push(
        `- Causas de não cumprimento (últimas ${s.recent.length} semanas, ${s.failuresInWindow} falhas): ${s.topCauses.map(t => `${t.cause} ${t.total} (${pct(t.share)})`).join('; ')}.`,
      );
    if (s.repeated.length) {
      lines.push(
        `- Compromissos repetindo falha (2 semanas ou mais): ${s.repeated.map(r => `"${r.name}"${r.company ? ` (${r.company})` : ''} ${r.weeks}×: ${r.causes.join(', ') || 'sem causa'}`).join('; ')}.`,
      );
      add({
        id: 'curto-falhas-repetidas',
        level: 'curto',
        severity: 'atencao',
        title: `${plural(s.repeated.length, 'compromisso repete', 'compromissos repetem')} a falha semana após semana`,
        detail: 'A mesma linha, do mesmo empreiteiro, marcada Não em mais de uma semana recente.',
        items: s.repeated.map(r => `${r.name}${r.company ? ` (${r.company})` : ''}: ${r.weeks} semanas`),
      });
    }
    if (s.companies.length)
      lines.push(
        `- Empreiteiros com PPC mais baixo (${s.recent.length} semanas, 5 linhas ou mais): ${s.companies.map(e => `${e.company} ${pct(e.percent)} (${e.planned})`).join('; ')}.`,
      );
    if (s.unrecorded) {
      lines.push(`- Linhas de semanas fechadas sem apontamento: ${s.unrecorded}.`);
      add({
        id: 'curto-sem-apontamento',
        level: 'curto',
        severity: 'atencao',
        title: `${plural(s.unrecorded, 'linha fechada sem apontamento', 'linhas fechadas sem apontamento')}`,
        detail: 'Contam como não cumpridas no PPC até alguém apontar Sim ou Não.',
      });
    }
    if (s.notCarried.length) {
      lines.push(`- "Não" da semana anterior sem linha na semana atual: ${s.notCarried.length}: ${top(s.notCarried).join('; ')}.`);
      add({
        id: 'curto-nao-levadas',
        level: 'curto',
        severity: 'alerta',
        title: `${plural(s.notCarried.length, 'linha não cumprida', 'linhas não cumpridas')} da semana passada sem continuação`,
        detail:
          'Marcadas Não na semana anterior e sem linha de mesmo nome e empresa na semana atual: ou foram abandonadas, ou faltou levar.',
        items: top(s.notCarried),
      });
    }
  }

  // Correlações entre níveis
  if (medio?.plan && curto) {
    const weekEnd = addDays(curto.currentWeek, 6);
    const active = medio.leaves.filter(t => t.plannedStart <= weekEnd && t.plannedEnd >= curto.currentWeek && t.progress < 100);
    const uncovered = active.filter(t => !curto.currentRows.some(c => namesPair(c.name, t.name)));
    if (uncovered.length)
      add({
        id: 'cruzado-plano-sem-planilha',
        level: 'cruzado',
        severity: 'atencao',
        title: `${plural(uncovered.length, 'tarefa do plano do mês', 'tarefas do plano do mês')} sem linha na semana atual`,
        detail: `De ${active.length} tarefas do plano previstas para esta semana, ${uncovered.length} não têm linha com nome parecido na planilha da semana ${curto.summary.currentWeek.number}.`,
        items: top(uncovered.map(t => `${t.name} (${dm(t.plannedStart)}–${dm(t.plannedEnd)}, ${pct(t.progress)})`)),
      });
    else if (active.length)
      add({
        id: 'cruzado-plano-coberto',
        level: 'cruzado',
        severity: 'positivo',
        title: 'Plano do mês coberto pela semana',
        detail: `As ${active.length} tarefas do plano previstas para esta semana têm linha na planilha.`,
      });
    const unplanned = curto.currentRows.filter(c => !medio.leaves.some(t => namesPair(c.name, t.name)));
    if (curto.currentRows.length && unplanned.length)
      add({
        id: 'cruzado-planilha-fora-do-plano',
        level: 'cruzado',
        severity: 'info',
        title: `${plural(unplanned.length, 'linha da semana', 'linhas da semana')} sem tarefa no plano do mês`,
        detail: 'Frentes apontadas na semana que não aparecem no cronograma do mês (tarefas de engenharia ou frentes não planejadas).',
        items: top(unplanned.map(c => c.name)),
      });
  }
  if (medio && curto && medio.summary.overloaded.length) {
    const laborFailures = curto.failures.filter(c => c.cause && LABOR_CAUSES.has(c.cause));
    const hit = medio.summary.overloaded.filter(t =>
      laborFailures.some(
        c =>
          `${curto.teams.find(x => x.id === c.teamId)?.company ?? ''} · ${curto.teams.find(x => x.id === c.teamId)?.name ?? ''}` === t.team,
      ),
    );
    if (hit.length)
      add({
        id: 'cruzado-equipe-sobrecarga-falhas',
        level: 'cruzado',
        severity: 'alerta',
        title: `${plural(hit.length, 'equipe sobrecarregada', 'equipes sobrecarregadas')} já falhando por mão de obra`,
        detail:
          'Equipes com mais frentes que a capacidade nas próximas semanas e que já tiveram Não por falta de mão de obra ou produtividade.',
        items: hit.map(t => `${t.team}: pico ${t.peak} de ${t.capacity}`),
      });
  }
  if (longo && medio && curto && longo.behind.length) {
    const chains = longo.behind
      .map(service => {
        const task = [
          ...medio.summary.late.map(t => t.name),
          ...medio.summary.overdue.map(t => t.name),
          ...medio.summary.behindTarget.map(t => t.name),
        ].find(name => namesPair(name, service.name));
        const failures = curto.failures.filter(c => namesPair(c.name, service.name)).length;
        return task && failures
          ? `${service.name}: -${num(service.gap, 0)} pontos no macro, "${task}" atrasada no mês, ${plural(failures, 'Não', 'Não')} na planilha`
          : undefined;
      })
      .filter((s): s is string => !!s);
    if (chains.length)
      add({
        id: 'cruzado-frente-atrasada',
        level: 'cruzado',
        severity: 'alerta',
        title: `${plural(chains.length, 'frente atrasada', 'frentes atrasadas')} nos três níveis`,
        detail: 'Serviço atrasado no macro, tarefa atrasada no mês e Não na semana, pareados pelo nome.',
        items: chains,
      });
  }
  if (curto && curto.summary.averageRecent !== undefined && curto.summary.averageRecent < 70) {
    const macro =
      longo &&
      longo.physicalProgress !== undefined &&
      longo.plannedProgress !== undefined &&
      longo.plannedProgress - longo.physicalProgress >= 5;
    const month = medio ? medio.summary.lateCount >= 3 || medio.summary.overdueCount >= 3 : false;
    if (macro || month)
      add({
        id: 'cruzado-ppc-avanco',
        level: 'cruzado',
        severity: 'atencao',
        title: 'PPC baixo já aparece nos níveis de cima',
        detail: `PPC médio de ${pct(curto.summary.averageRecent)}${macro ? ', avanço físico abaixo do macro' : ''}${month ? ', tarefas do mês atrasadas' : ''}: a semana não entrega o que o mês e o macro esperam.`,
      });
  }
  if (curto && longo && longo.wagons.overdueRestrictions.length && curto.summary.topCauses.some(c => UPSTREAM_CAUSES.has(c.cause)))
    add({
      id: 'cruzado-restricoes-causas',
      level: 'cruzado',
      severity: 'atencao',
      title: 'Restrições vencidas e causas de insumo na semana',
      detail: `Causas como ${curto.summary.topCauses
        .filter(c => UPSTREAM_CAUSES.has(c.cause))
        .map(c => c.cause)
        .join(
          ', ',
        )} convivem com ${plural(longo.wagons.overdueRestrictions.length, 'restrição vencida', 'restrições vencidas')}: a falha da semana pode vir da restrição não tratada.`,
    });
  if (
    curto &&
    curto.summary.averageRecent !== undefined &&
    curto.summary.averageRecent >= 85 &&
    (!medio || !medio.summary.lateCount) &&
    (!longo ||
      longo.physicalProgress === undefined ||
      longo.plannedProgress === undefined ||
      longo.plannedProgress - longo.physicalProgress < 5)
  )
    add({
      id: 'cruzado-ritmo',
      level: 'cruzado',
      severity: 'positivo',
      title: 'Ritmo consistente nos níveis lidos',
      detail: 'PPC alto, sem atraso contra a linha de base do mês e avanço físico dentro do macro.',
    });

  // Ordem: alertas primeiro, depois atenção, positivos e informações; dentro do grupo, cruzados primeiro.
  const severityOrder: Record<FindingSeverity, number> = { alerta: 0, atencao: 1, positivo: 2, info: 3 };
  const levelOrder: Record<FindingLevel, number> = { cruzado: 0, curto: 1, medio: 2, longo: 3 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || levelOrder[a.level] - levelOrder[b.level]);

  lines.push('', '## Achados automáticos (regras fixas; pareamento entre níveis pelo nome)');
  if (!findings.length) lines.push('- Nenhum achado nos níveis lidos.');
  for (const f of findings)
    lines.push(`- [${f.severity}][${f.level}] ${f.title}. ${f.detail}${f.items?.length ? ` Itens: ${f.items.join(' | ')}.` : ''}`);

  const text = lines.join('\n');
  return {
    workId,
    workCode: work?.code ?? '',
    workName: work?.name ?? '',
    today,
    levels,
    longo,
    medio: medio?.summary,
    curto: curto?.summary,
    findings,
    text,
    hash: briefingHash(text),
  };
}

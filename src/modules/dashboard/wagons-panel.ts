import type { Planning } from '@/application/use-cases/get-planning';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import type { Activity, LocalDate, Restriction, WagonStatus } from '@/domain/entities';
import { isOverdue, leadTimeDeadline, weightedProgress } from '@/domain/rules';
import {
  dayMonth,
  isWeekly,
  matchesCompany,
  plural,
  type DashboardFilters,
  type DashboardReference,
  type PanelSummary,
  type Segment,
} from '@/modules/dashboard/model';
import type { DashboardScale } from '@/modules/dashboard/period';
import type { WagonsPeriodView } from '@/modules/dashboard/period-views';
import { statusLabels, wagonLabel } from '@/shared/format';

/** Quadro de vagões da aba 0 (aba 2 de origem, regra 7 do modelo aprovado em 04/11/2026): os vagões da
 * obra por status, o takt vencido, as dívidas de terminalidade, os vagões em produção e o quadro de
 * restrições, tudo lido até o sábado da semana analisada (`ref.weekEnd`). Puro, sem React.
 *
 * O que é "na data" e o que é "atual": o status do vagão e o progresso não têm série histórica (o
 * percentual guarda só o valor de hoje), então saem como estão; o takt vencido e o limite das
 * restrições são comparados com a data de referência, não com o hoje do servidor; e registros
 * criados depois da data (dívidas, restrições) ficam fora, porque na semana analisada eles não existiam.
 * Vagão com início previsto depois da data continua contando como "não iniciado": é planejamento.
 *
 * Escalas de tempo (04/11/2026, regra 9): o sábado de referência é o sábado final do período, e os números
 * acima continuam sendo o retrato nesse dia. O fluxo dentro do período (restrições resolvidas e criadas entre
 * a segunda-feira inicial e o sábado final) sai em `period`, em toda escala; a aba 0 só o mostra fora da
 * semanal, que continua exatamente como era. */

/** Ordem e cores fixas da barra empilhada, as da paleta do sistema. */
const STATUS_ORDER: { status: WagonStatus; color: string }[] = [
  { status: 'terminal', color: '#1baf7a' },
  { status: 'in_production', color: '#2a78d6' },
  { status: 'restricted', color: '#be123c' },
  { status: 'not_started', color: '#c4d3df' },
];
/** Quantos vagões em produção a lista mostra e quantas restrições vencidas o texto cita. */
export const PRODUCING_SHOWN = 3;
export const OVERDUE_SAMPLES = 3;

export interface WagonStatusCount {
  status: WagonStatus;
  label: string;
  value: number;
  color: string;
}
export interface ProducingWagon {
  id: string;
  number: number;
  plannedStart: LocalDate;
  plannedEnd: LocalDate;
  progress: number;
  /** Takt vencido na data de referência. */
  overdue: boolean;
}
export interface RestrictionsPanelData {
  identified: number;
  inTreatment: number;
  resolved: number;
  open: number;
  overdue: number;
  overdueBlockingExecution: number;
  overdueBlockingTerminality: number;
  /** Até `OVERDUE_SAMPLES` vencidas, da mais atrasada à menos: "Vagão 03, descrição". */
  overdueSamples: string[];
}
export interface WagonsPanelData {
  total: number;
  byStatus: WagonStatusCount[];
  overdue: { count: number; numbers: number[] };
  openDebts: number;
  producing: number;
  /** Progresso ponderado das atividades dos vagões em produção; ausente sem vagão em produção. */
  producingProgress?: number;
  /** Os `PRODUCING_SHOWN` vagões em produção de maior progresso. */
  producingList: ProducingWagon[];
  restrictions: RestrictionsPanelData;
  sequences: { name: string; takt: string }[];
  companyFiltered: boolean;
  /** Fluxo de restrições dentro do período, com o mesmo recorte de empreiteiro do resto do quadro. */
  period: WagonsPeriodView;
  /** Escala do período: na semanal o quadro diz o que dizia antes das escalas de tempo. */
  scale: DashboardScale;
  /** Sábado final do período (`ref.weekEnd`): a data dos retratos, "em 31/10" fora da semanal. */
  refDate: LocalDate;
}

/** "no mês", "no trimestre": o fluxo dentro do período ("Restrições resolvidas no mês"). */
export const SCALE_IN: Record<DashboardScale, string> = {
  semana: 'na semana',
  mes: 'no mês',
  trimestre: 'no trimestre',
  ano: 'no ano',
  personalizado: 'no período',
};

const dateOf = (timestamp: string): LocalDate => timestamp.slice(0, 10);
/** O limite exibido pelo quadro de restrições: com lead time e atividade, sai do início previsto atual
 * dela (a atividade pode ter sido reprogramada); senão, a data gravada. */
const deadlineFor = (r: Restriction, activity: Activity | undefined): LocalDate =>
  r.leadTimeDays !== undefined && activity ? leadTimeDeadline(activity.plannedStart, r.leadTimeDays) : r.dueDate;
const taktText = (days: number, calendar: 'calendar_days' | 'business_days') =>
  `${plural(days, 'dia', 'dias')} ${calendar === 'calendar_days' ? 'corridos' : 'úteis'}`;

export function buildWagonsPanel(
  planning: Planning,
  workId: string,
  ref: DashboardReference,
  filters: DashboardFilters,
): WagonsPanelData | undefined {
  const selected = selectWorkPlanning(planning, workId);
  if (!selected || !selected.wagons.length) return undefined;
  const { data } = planning;
  const date = ref.weekEnd;
  const companyFiltered = !!filters.companies;

  // Regra 4: a empresa vem da equipe da atividade. Com recorte, só as atividades de equipe de empresa
  // escolhida contam, e só os vagões que têm ao menos uma delas entram no quadro.
  const companyOf = new Map(data.teams.map(t => [t.id, t.company]));
  const matches = (a: Activity) => !companyFiltered || matchesCompany(filters, a.teamId ? companyOf.get(a.teamId) : undefined);
  const activitiesOf = new Map<string, Activity[]>();
  for (const a of data.activities) {
    if (!matches(a)) continue;
    const list = activitiesOf.get(a.wagonId);
    if (list) list.push(a);
    else activitiesOf.set(a.wagonId, [a]);
  }
  const wagons = companyFiltered ? selected.wagons.filter(w => activitiesOf.has(w.id)) : selected.wagons;
  const wagonIds = new Set(wagons.map(w => w.id));
  const numberOf = new Map(wagons.map(w => [w.id, w.number]));

  // O overdue do servidor usa o hoje; aqui a comparação é com o sábado da semana analisada.
  const overdueOf = (w: (typeof wagons)[number]) => isOverdue(w, data, date);
  const overdueWagons = wagons.filter(overdueOf);

  const byStatus = STATUS_ORDER.map(({ status, color }) => ({
    status,
    label: statusLabels[status],
    value: wagons.filter(w => w.status === status).length,
    color,
  }));

  const producingWagons = wagons.filter(w => w.status === 'in_production');
  const progressOf = (id: string) => weightedProgress(activitiesOf.get(id) ?? []);
  const producingList = producingWagons
    .map(w => ({
      id: w.id,
      number: w.number,
      plannedStart: w.plannedStart,
      plannedEnd: w.plannedEnd,
      progress: progressOf(w.id),
      overdue: overdueOf(w),
    }))
    .sort((a, b) => b.progress - a.progress || a.number - b.number)
    .slice(0, PRODUCING_SHOWN);
  const producingActivities = producingWagons.flatMap(w => activitiesOf.get(w.id) ?? []);

  // Dívida aberta: a pendência de origem continua aberta. A dívida registrada depois da data fica fora.
  const openDebts = selected.debts.filter(d => {
    if (dateOf(d.createdAt) > date) return false;
    const pending = data.pendingItems.find(p => p.id === d.pendingItemId);
    return !!pending && pending.status === 'open' && wagonIds.has(pending.wagonId);
  }).length;

  // Restrições só dos vagões considerados (da obra e, com recorte, com atividade da empresa), registradas
  // até a data. A coluna é a atual; "vencida" compara o limite com a data de referência.
  const activityById = new Map(data.activities.map(a => [a.id, a]));
  const restrictions = data.restrictions
    .filter(r => wagonIds.has(r.wagonId) && dateOf(r.createdAt) <= date)
    .map(r => ({ r, deadline: deadlineFor(r, r.activityId ? activityById.get(r.activityId) : undefined) }));
  const column = (r: Restriction) => (r.status === 'resolved' ? 'resolvida' : r.boardStatus);
  const open = restrictions.filter(({ r }) => r.status === 'open');
  const overdue = open
    .filter(({ deadline }) => deadline < date)
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.r.createdAt.localeCompare(b.r.createdAt));

  // Fluxo do período (regra 9): resolvidas e criadas entre a segunda-feira inicial e o sábado final, nos
  // mesmos vagões. A data é a do registro, como no retrato acima (resolvida não volta ao quadro).
  const { start, end } = ref.period;
  const within = (timestamp: string | undefined) => !!timestamp && dateOf(timestamp) >= start && dateOf(timestamp) <= end;
  const ofWagons = data.restrictions.filter(r => wagonIds.has(r.wagonId));

  return {
    total: wagons.length,
    byStatus,
    overdue: { count: overdueWagons.length, numbers: overdueWagons.map(w => w.number).sort((a, b) => a - b) },
    openDebts,
    producing: producingWagons.length,
    producingProgress: producingWagons.length ? weightedProgress(producingActivities) : undefined,
    producingList,
    restrictions: {
      identified: restrictions.filter(({ r }) => column(r) === 'identificada').length,
      inTreatment: restrictions.filter(({ r }) => column(r) === 'em_tratativa').length,
      resolved: restrictions.filter(({ r }) => column(r) === 'resolvida').length,
      open: open.length,
      overdue: overdue.length,
      overdueBlockingExecution: overdue.filter(({ r }) => r.blocksExecution).length,
      overdueBlockingTerminality: overdue.filter(({ r }) => r.blocksTerminality).length,
      overdueSamples: overdue.slice(0, OVERDUE_SAMPLES).map(({ r }) => `${wagonLabel(numberOf.get(r.wagonId) ?? 0)}, ${r.description}`),
    },
    sequences: selected.sequences.map(s => ({ name: s.name, takt: taktText(s.defaultTaktDays, s.calendar) })),
    companyFiltered,
    period: {
      start,
      end,
      restrictionsResolved: ofWagons.filter(r => r.status === 'resolved' && within(r.resolvedAt)).length,
      restrictionsCreated: ofWagons.filter(r => within(r.createdAt)).length,
    },
    scale: ref.period.scale,
    refDate: date,
  };
}

// ─── Textos do quadro (puros, para a tela e o papel saírem iguais) ────────────────────────────────────
const pad = (number: number) => String(number).padStart(2, '0');
const listText = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

/** "Vagão 02" · "Vagões 02 e 03" · "Vagões 02, 03 e 04" · "Vagões 02, 03, 04 e mais 2". */
export function wagonNumbersText(numbers: readonly number[], max = 3): string {
  if (!numbers.length) return '';
  if (numbers.length === 1) return wagonLabel(numbers[0]);
  const shown = numbers.slice(0, max).map(pad);
  const rest = numbers.length - shown.length;
  return `Vagões ${rest > 0 ? `${shown.join(', ')} e mais ${rest}` : listText(shown)}`;
}

const weeklyData = (data: Pick<WagonsPanelData, 'scale'>) => data.scale === 'semana';

/** Ajuda do cartão "Takt vencido": quais vagões, ou por que nenhum. */
export const overdueHint = (data: WagonsPanelData) =>
  data.overdue.count
    ? wagonNumbersText(data.overdue.numbers)
    : `Nenhum vagão com término previsto antes ${weeklyData(data) ? 'da data' : `de ${dayMonth(data.refDate)}`}`;

/** Textos que mudam com a escala: na semanal, os de antes das escalas de tempo; fora dela, os retratos dizem
 * o dia ("em 31/10") e o bloco de restrições ganha o fluxo do período. */
export const wagonsTexts = (data: WagonsPanelData) => {
  const weekly = weeklyData(data);
  const day = dayMonth(data.refDate);
  return {
    /** Explicação do bloco "Vagões por status" na tela. */
    statusNote: weekly ? 'Na data analisada.' : `Em ${day}.`,
    /** Explicação do bloco "Restrições" na tela. */
    restrictionsNote: weekly
      ? 'Coluna atual do quadro; vencidas pelo limite do lead time.'
      : `Coluna atual do quadro; vencidas em ${day} pelo limite do lead time.`,
    /** Fim da descrição do painel de status no papel. */
    paperStatusNote: weekly ? 'Status atual; takt vencido pela data analisada.' : `Status atual; takt vencido em ${day}.`,
    /** Descrição do painel de restrições no papel. */
    paperRestrictionsNote: `Coluna atual do quadro de restrições; vencida é a aberta com limite (início previsto menos lead time) antes ${weekly ? 'da data' : `de ${day}`}.`,
    /** "Restrições resolvidas no mês: 4"; ausente na semanal. */
    resolvedInPeriod: weekly ? undefined : `Restrições resolvidas ${SCALE_IN[data.scale]}: ${data.period.restrictionsResolved}`,
  };
};

/** Ajuda do cartão "Dívidas abertas". */
export const debtsHint = (data: WagonsPanelData) =>
  data.openDebts ? 'Pendências aceitas em liberação, ainda abertas' : 'Nenhuma pendência aceita em liberação segue aberta';

/** Legenda da lista "Em produção". */
export function producingLegend(data: WagonsPanelData): string {
  const debts = `Dívidas de terminalidade abertas: ${data.openDebts}.`;
  if (!data.producing) return `Nenhum vagão em produção. ${debts}`;
  const shown = data.producingList.length;
  const which = shown < data.producing ? `os ${shown} de maior progresso acima` : shown === 1 ? 'acima' : 'todos acima';
  return `${plural(data.producing, 'vagão em produção', 'vagões em produção')}; ${which}. ${debts}`;
}

/** Rótulo lido pelo leitor de tela na barra empilhada. */
export const statusAriaLabel = (data: WagonsPanelData) =>
  `${plural(data.total, 'vagão', 'vagões')} por status: ${data.byStatus.map(s => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`;

/** O aviso do bloco de restrições: alerta quando há vencida, neutro quando não. */
export function restrictionsCallout(data: WagonsPanelData): { tone: 'alert' | 'neutral'; text: string } {
  const r = data.restrictions;
  const registered = r.identified + r.inTreatment + r.resolved;
  if (!registered) return { tone: 'neutral', text: 'Nenhuma restrição registrada nos vagões desta obra.' };
  if (!r.open) return { tone: 'neutral', text: `Nenhuma restrição aberta: ${plural(r.resolved, 'resolvida', 'resolvidas')}.` };
  if (!r.overdue) return { tone: 'neutral', text: `Nenhuma restrição vencida entre as ${plural(r.open, 'aberta', 'abertas')}.` };
  const head =
    r.overdue === r.open
      ? r.overdue === 1
        ? '1 restrição vencida, a única aberta'
        : `As ${r.overdue} restrições abertas estão vencidas`
      : `${r.overdue === 1 ? '1 restrição vencida' : `${r.overdue} restrições vencidas`} entre as ${r.open} abertas`;
  const rest = r.overdue - r.overdueSamples.length;
  const blocks = [
    r.overdueBlockingExecution
      ? `${r.overdueBlockingExecution === 1 ? '1 bloqueia' : `${r.overdueBlockingExecution} bloqueiam`} execução`
      : '',
    r.overdueBlockingTerminality
      ? `${r.overdueBlockingTerminality === 1 ? '1 bloqueia' : `${r.overdueBlockingTerminality} bloqueiam`} terminalidade`
      : '',
  ].filter(Boolean);
  return {
    tone: 'alert',
    text: `${head}: ${r.overdueSamples.join('; ')}${rest > 0 ? ` e mais ${rest}` : ''}.${blocks.length ? ` ${listText(blocks).replace(/^./, c => c.toUpperCase())}.` : ''}`,
  };
}

// ─── Resumo do topo: dois cartões e os trechos da frase ───────────────────────────────────────────────
const strong = (text: string): Segment => ({ text, strong: true });
const say = (text: string): Segment => ({ text });

/** Trecho da frase para o takt: "2 vagões estão com o takt vencido" · "Um vagão está com o takt vencido" ·
 * "Nenhum vagão com takt vencido". Começa a frase, por isso vem com maiúscula. */
export function taktSentence(data: WagonsPanelData): Segment[] {
  const n = data.overdue.count;
  if (!n) return [say('Nenhum vagão com takt vencido')];
  return n === 1 ? [strong('Um vagão'), say(' está com o takt vencido')] : [strong(`${n} vagões`), say(' estão com o takt vencido')];
}
/** Trecho para as restrições: "3 restrições venceram" · "Uma restrição venceu" · "Nenhuma restrição
 * vencida". O resumo (`summary.ts`) junta cada trecho como frase própria, por isso vem com maiúscula. */
export function restrictionsSentence(data: WagonsPanelData): Segment[] {
  const n = data.restrictions.overdue;
  if (!n) return [say('Nenhuma restrição vencida')];
  return n === 1 ? [strong('Uma restrição'), say(' venceu')] : [strong(`${n} restrições`), say(' venceram')];
}
/** A frase inteira do quadro numa sentença só: "2 vagões estão com o takt vencido e 3 restrições venceram." */
export function wagonsSentence(data: WagonsPanelData): Segment[] {
  const [first, ...rest] = restrictionsSentence(data);
  return [...taktSentence(data), say(' e '), { ...first, text: first.text.replace(/^./, c => c.toLowerCase()) }, ...rest, say('.')];
}

/** Os dois cartões. Fora da semanal as dicas dizem o dia do retrato ("em 31/10") e a de restrições troca o
 * "prazo pelo lead time" pelas resolvidas no período ("4 resolvidas no mês"). */
export function wagonsSummary(data: WagonsPanelData, ref: DashboardReference): { takt: PanelSummary; restrictions: PanelSummary } {
  const overdue = data.overdue.count;
  const restricted = data.byStatus.find(s => s.status === 'restricted')?.value ?? 0;
  const r = data.restrictions;
  const blocking = r.overdueBlockingExecution;
  const weekly = isWeekly(ref);
  const day = dayMonth(ref.weekEnd);
  const blockingText = `${blocking === 1 ? '1 bloqueia' : `${blocking} bloqueiam`} execução`;
  const resolvedText = `${plural(data.period.restrictionsResolved, 'resolvida', 'resolvidas')} ${SCALE_IN[ref.period.scale]}`;
  return {
    takt: {
      kpi: {
        module: 'vagoes',
        label: 'Takt vencido',
        value: String(overdue),
        tag: overdue > 0 ? { text: overdue === 1 ? 'vagão' : 'vagões', tone: 'warn' } : { text: 'em dia', tone: 'good' },
        hint: weekly
          ? `De ${data.producing} em produção · ${restricted} com restrição aberta`
          : `Em ${day} · de ${data.producing} em produção · ${restricted} com restrição aberta`,
        ...(overdue > 0 ? { tone: 'warn' as const } : {}),
      },
      sentence: taktSentence(data),
    },
    restrictions: {
      kpi: {
        module: 'vagoes',
        label: 'Restrições vencidas',
        value: String(r.overdue),
        tag: {
          text: r.open === 0 ? 'nenhuma aberta' : `de ${plural(r.open, 'aberta', 'abertas')}`,
          tone: r.overdue > 0 ? 'bad' : 'good',
        },
        hint: weekly
          ? r.overdue > 0
            ? `${blockingText} · prazo pelo lead time`
            : `Nenhuma vencida até ${day} · prazo pelo lead time`
          : r.overdue > 0
            ? `Em ${day} · ${blockingText} · ${resolvedText}`
            : `Nenhuma vencida em ${day} · ${resolvedText}`,
        ...(r.overdue > 0 ? { tone: 'bad' as const } : {}),
      },
      sentence: restrictionsSentence(data),
    },
  };
}

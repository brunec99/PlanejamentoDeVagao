import type { ConstraintType, Id, LinkType, LocalDate, MediumTermPlan, PlanDependency, PlanTask } from './entities';
import {
  businessDuration,
  constraintOf,
  countedDays,
  durationDays,
  endFor,
  isMilestone,
  planWindow,
  signedWorkingDays,
  type DayEdge,
  type ScheduleAnalysis,
  type TaskConstraint,
  type WorkCalendar,
} from './plan-schedule';
import { rollUpPlan } from './rules';
import { addDays } from './validation';

/** Exportação do plano do mês para MSPDI, o XML que o Microsoft Project (2016+) abre direto.
 * É o canal pelo qual a equipe, que trabalha no Project, confere que o nosso motor reproduz o
 * que o Project calcula: vão tarefas com EAP, durações, vínculos com defasagem, restrições,
 * prazo final, % concluída, datas reais, datas cedo/tardias, folgas, calendário com feriados e
 * linha de base.
 *
 * O Project pensa em horas e minutos; o plano pensa em dias. A conversão fixa a jornada em
 * 08:00–12:00 e 13:00–17:00 (8 h) e, quando `hoursPerDay` é outro, mantém as 08:00 e estica ou
 * encurta a tarde para fechar a jornada (9 h → 18:00). Cada data sai na ponta do dia que o motor
 * calculou (`TaskSchedule.edges`): começo às 08:00, fim no fim da tarde — o marco empurrado por TI
 * fica no fim do dia, o de data digitada no começo; o término puxado por IT sem defasagem e o de
 * duração em dias corridos ficam às 08:00, como o Project mostra. Durações em
 * dias úteis viram `dias × hoursPerDay` horas (`DurationFormat` 7); corridos, `dias × 24` com
 * formato 8 (decorrido); horas vão como estão (formato 5); meses viram dias úteis antes. Folgas,
 * variações e defasagens vão em décimos de minuto, como o XSD pede.
 *
 * A ordem dos elementos segue o XSD do Project (o `propOrder` do MPXJ): o Project recusa
 * elemento fora de lugar. O que fica de fora nesta etapa: recursos — o Project ignora
 * `ResourceNames` no XML, os nomes só entram por `<Resources>` + `<Assignments>` (próxima
 * etapa); restrição em tarefa-resumo (o motor não a aplica, então vai como "O mais breve
 * possível"); e jornadas acima de 15 h, que não cabem nas duas faixas do dia e ficam truncadas
 * às 23:59.
 *
 * Três armadilhas medidas no Project 2019 real (docs/engenharia-reversa-project.md):
 * `<HonorConstraints>` é lido invertido (1 desliga "as tarefas sempre respeitam as datas de
 * restrição"), então o elemento não vai e vale o padrão, ligado; o `<StartDate>` tem de ser o
 * início das tarefas sem predecessora, porque toda tarefa "o mais breve possível" sem
 * predecessora vai para ele (o menor início de todas jogaria o cronograma para antes quando um
 * TT, IT ou antecipação puxa uma tarefa); e a tarefa sem predecessora que começa depois desse
 * início sai como "Não iniciar antes de" na data dela, senão o Project a puxa para o início. */
export interface MspdiInput {
  plan: MediumTermPlan;
  /** Na ordem do plano (campo `order`); resumo é a linha cujo próximo nível é maior. */
  tasks: PlanTask[];
  links: PlanDependency[];
  calendar: WorkCalendar;
  /** De `analyzeSchedule`: datas agendadas, cedo/tardias, folgas e crítico por id. */
  analysis: ScheduleAnalysis;
  workName?: string;
  /** Datas da linha de base por id de tarefa, quando houver. */
  baseline?: Map<Id, { start: LocalDate; end: LocalDate }>;
}

const NAMESPACE = 'http://schemas.microsoft.com/project';
const START_TIME = '08:00:00';
/** `ConstraintType` do MSPDI: 0 OMBP, 1 OMTP, 2 DIE, 3 DTE, 4 NIAD, 5 NIDD, 6 NTAD, 7 NTDD. */
const CONSTRAINT_CODES: Record<ConstraintType, number> = { ASAP: 0, ALAP: 1, MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7 };
const START_CONSTRAINTS = new Set<ConstraintType>(['SNET', 'SNLT', 'MSO']);
/** `PredecessorLink/Type`: 0 TT (FF), 1 TI (FS), 2 IT (SF), 3 II (SS). */
const LINK_CODES: Record<LinkType, number> = { TT: 0, TI: 1, IT: 2, II: 3 };
/** `DurationFormat`/`LagFormat`: 5 horas, 7 dias, 8 dias decorridos. */
const FORMAT = { hours: 5, days: 7, elapsed: 8 } as const;

// ————— Montagem do XML: árvore mínima, sem biblioteca —————

interface XmlNode {
  tag: string;
  text?: string;
  children?: XmlNode[];
}
type Maybe = XmlNode | undefined | false | '' | 0 | null;
const pad2 = (n: number) => String(n).padStart(2, '0');
/** Escape do texto e remoção dos caracteres de controle que o XML 1.0 não aceita (o MPXJ faz o mesmo). */
export function escapeXml(value: string): string {
  let clean = '';
  for (const ch of String(value)) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 || code === 9 || code === 10 || code === 13) clean += ch;
  }
  return clean.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const leaf = (tag: string, value: string | number): XmlNode => ({ tag, text: escapeXml(String(value)) });
const branch = (tag: string, children: Maybe[]): XmlNode => ({ tag, children: children.filter((c): c is XmlNode => !!c) });
function render(node: XmlNode, depth: number, out: string[]) {
  const indent = '  '.repeat(depth);
  if (!node.children) {
    out.push(`${indent}<${node.tag}>${node.text ?? ''}</${node.tag}>`);
    return;
  }
  if (!node.children.length) {
    out.push(`${indent}<${node.tag}/>`);
    return;
  }
  out.push(`${indent}<${node.tag}>`);
  for (const child of node.children) render(child, depth + 1, out);
  out.push(`${indent}</${node.tag}>`);
}

// ————— Conversões de dias para o relógio do Project —————

interface Journey {
  finishTime: string;
  ranges: [string, string][];
}
const clock = (hours: number) => {
  const minutes = Math.round(hours * 60);
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}:00`;
};
/** Jornada do dia útil: manhã 08:00–12:00, almoço, tarde das 13:00 até fechar `hoursPerDay`.
 * Jornada de até 4 h fica só na manhã; acima de 15 h não cabe no dia e trunca às 23:59. */
export function journeyFor(hoursPerDay: number): Journey {
  if (hoursPerDay <= 4) {
    const end = clock(8 + hoursPerDay);
    return { finishTime: end, ranges: [[START_TIME, end]] };
  }
  const end = clock(Math.min(13 + hoursPerDay - 4, 23 + 59 / 60));
  return {
    finishTime: end,
    ranges: [
      [START_TIME, '12:00:00'],
      ['13:00:00', end],
    ],
  };
}
/** `xsd:duration` como o Project grava: sempre em horas, `PT16H0M0S`. */
export function xsdDuration(hours: number): string {
  const seconds = Math.round(Math.max(0, hours) * 3600);
  return `PT${Math.floor(seconds / 3600)}H${Math.floor((seconds % 3600) / 60)}M${seconds % 60}S`;
}
/** Folgas, variações e defasagens: inteiro em décimos de minuto; `hoursPerDay` 24 para dias corridos. */
export const tenthsOfMinutes = (days: number, hoursPerDay: number) => Math.round(days * hoursPerDay * 600);
const at = (date: LocalDate, time: string) => `${date}T${time}`;
/** Carimbo ISO (`2026-09-01T12:00:00Z`) no formato sem fuso que o XSD usa; indefinido se não for um. */
const stamp = (iso: string | undefined) => (iso && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(iso) ? iso.slice(0, 19) : undefined);
const brDate = (date: LocalDate) => date.split('-').reverse().join('/');

interface Span {
  hours: number;
  format: number;
}
/** Duração da folha em horas do Project e o formato de exibição. Sem duração guardada, o motor
 * trata o período como dias corridos; aqui é igual. */
function leafSpan(task: PlanTask, c: WorkCalendar): Span {
  const duration = task.duration ?? { value: countedDays(task.plannedStart, task.plannedEnd, false, c), unit: 'dd' as const };
  if (duration.unit === 'h') return { hours: duration.value, format: FORMAT.hours };
  const days = durationDays(duration, c);
  return businessDuration(duration) ? { hours: days * c.hoursPerDay, format: FORMAT.days } : { hours: days * 24, format: FORMAT.elapsed };
}

// ————— Calendário —————

function calendarsNode(c: WorkCalendar, journey: Journey): XmlNode {
  const holidays = [...new Set(c.holidays)].sort();
  const period = (date: LocalDate) => branch('TimePeriod', [leaf('FromDate', at(date, '00:00:00')), leaf('ToDate', at(date, '23:59:59'))]);
  // `DayType` 1 = domingo … 7 = sábado; o plano numera 0 = domingo … 6 = sábado.
  const weekDays = [0, 1, 2, 3, 4, 5, 6].map(day => {
    const working = c.weekdays.includes(day);
    return branch('WeekDay', [
      leaf('DayType', day + 1),
      leaf('DayWorking', working ? 1 : 0),
      working &&
        branch(
          'WorkingTimes',
          journey.ranges.map(([from, to]) => branch('WorkingTime', [leaf('FromTime', from), leaf('ToTime', to)])),
        ),
    ]);
  });
  // Feriado nos dois formatos: o legado (2002), dentro de `WeekDays`, e o de 2003+, em
  // `Exceptions` — o Project novo lê o segundo, ferramentas antigas só o primeiro. Ordenados
  // por data, senão o Project os ignora.
  const legacy = holidays.map(date => branch('WeekDay', [leaf('DayType', 0), leaf('DayWorking', 0), period(date)]));
  const exceptions = holidays.map(date =>
    branch('Exception', [
      leaf('EnteredByOccurrences', 0),
      period(date),
      leaf('Occurrences', 1),
      leaf('Name', `Feriado ${brDate(date)}`),
      leaf('Type', 1),
      leaf('DayWorking', 0),
    ]),
  );
  return branch('Calendars', [
    branch('Calendar', [
      leaf('UID', 1),
      leaf('Name', 'Padrão'),
      leaf('IsBaseCalendar', 1),
      leaf('IsBaselineCalendar', 0),
      leaf('BaseCalendarUID', -1),
      branch('WeekDays', [...weekDays, ...legacy]),
      holidays.length > 0 && branch('Exceptions', exceptions),
    ]),
  ]);
}

// ————— Tarefas —————

export function buildMspdi(input: MspdiInput): string {
  const { plan, analysis, calendar: c } = input;
  const journey = journeyFor(c.hoursPerDay);
  // As datas agendadas são as do motor; a lista de entrada dá a ordem e o que o motor não toca.
  const scheduled = new Map(analysis.tasks.map(t => [t.id, t]));
  const rows = input.tasks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(t => scheduled.get(t.id) ?? t);
  const rollUp = rollUpPlan(rows);
  const uids = new Map(rows.map((t, i) => [t.id, i + 1]));
  const incoming = new Map<Id, PlanDependency[]>();
  for (const link of input.links)
    if (uids.has(link.predecessorId) && uids.has(link.successorId))
      incoming.set(link.successorId, [...(incoming.get(link.successorId) ?? []), link]);
  const bounds =
    analysis.projectStart && analysis.projectFinish
      ? { start: analysis.projectStart, end: analysis.projectFinish }
      : planWindow(plan.month);
  // O início do projeto do Project: o primeiro início entre as folhas sem predecessora.
  const leafRows = rows.filter(t => !rollUp.get(t.id)?.summary);
  const anchor = leafRows
    .filter(t => !incoming.has(t.id))
    .map(t => t.actualStart ?? t.plannedStart)
    .sort()[0];
  const projectStart = anchor ?? bounds.start;
  const time = (edge: DayEdge | undefined, fallback: 'start' | 'end') => ((edge ?? fallback) === 'start' ? START_TIME : journey.finishTime);
  const title = [input.workName?.trim(), plan.name?.trim()].filter(Boolean).join(' · ') || 'Plano';

  const linkNode = (link: PlanDependency) =>
    branch('PredecessorLink', [
      leaf('PredecessorUID', uids.get(link.predecessorId)!),
      leaf('Type', LINK_CODES[link.type]),
      leaf('CrossProject', 0),
      leaf('LinkLag', tenthsOfMinutes(link.lagDays, link.lagBusiness ? c.hoursPerDay : 24)),
      leaf('LagFormat', link.lagBusiness ? FORMAT.days : FORMAT.elapsed),
    ]);

  const taskNode = (task: PlanTask): XmlNode => {
    const uid = uids.get(task.id)!;
    const roll = rollUp.get(task.id)!;
    const info = analysis.info.get(task.id);
    const milestone = !roll.summary && isMilestone(task);
    const edges = info?.edges;
    const startTime = time(edges?.earlyStart, milestone ? 'end' : 'start');
    let finishTime = time(edges?.earlyFinish, 'end');
    const { plannedStart: start } = roll;
    // Tarefa dividida (iniciada, com o restante empurrado por predecessora aberta): o .xml leva o
    // término sem o empurrão — início real mais a duração inteira — e o Project divide de novo ao
    // abrir. Com o término já empurrado ele empurra outra vez (medido no Project 2019).
    const split = !roll.summary && !!info?.resume && !!task.actualStart && !task.actualEnd;
    const natural = split ? leafSpan(task, c) : undefined;
    const end = !natural
      ? roll.plannedEnd
      : natural.format === FORMAT.elapsed
        ? addDays(task.actualStart!, natural.hours / 24)
        : endFor(task.actualStart!, task.duration!, c).end;
    if (natural) finishTime = natural.format === FORMAT.elapsed ? START_TIME : journey.finishTime;
    // Resumo: duração é o que há de dias úteis no envelope dos filhos, como o Project resume.
    const span: Span = roll.summary ? { hours: countedDays(start, end, true, c) * c.hoursPerDay, format: FORMAT.days } : leafSpan(task, c);
    const earlyStart = info?.earlyStart ?? start,
      earlyFinish = info?.earlyFinish ?? end,
      lateStart = info?.lateStart ?? start,
      lateFinish = info?.lateFinish ?? end;
    const percent = Math.round(Math.min(100, Math.max(0, roll.progress || 0)));
    const own: TaskConstraint = roll.summary ? { type: 'ASAP' } : constraintOf(task);
    // Sem predecessora, começando depois do início do projeto: no Project isso é um NIAD na data.
    const constraint: TaskConstraint =
      own.type === 'ASAP' && !roll.summary && !incoming.has(task.id) && !roll.actualStart && start > projectStart
        ? { type: 'SNET', date: start }
        : own;
    const slackHours = span.format === FORMAT.elapsed ? 24 : c.hoursPerDay;
    const base = input.baseline?.get(task.id);
    const baseHours = !base
      ? 0
      : milestone
        ? 0
        : span.format === FORMAT.elapsed
          ? countedDays(base.start, base.end, false, c) * 24
          : countedDays(base.start, base.end, true, c) * c.hoursPerDay;
    // `OutlineLevel` sai da profundidade do número, que `rollUpPlan` já corrige quando o nível
    // guardado pula um degrau — número e nível incoerentes embaralham a estrutura no Project.
    return branch('Task', [
      leaf('UID', uid),
      leaf('ID', uid),
      leaf('Name', task.name),
      leaf('Active', 1),
      leaf('Manual', 0),
      leaf('Type', 0),
      leaf('IsNull', 0),
      leaf('WBS', roll.number),
      leaf('OutlineNumber', roll.number),
      leaf('OutlineLevel', roll.number.split('.').length),
      leaf('Priority', 500),
      leaf('Start', at(start, startTime)),
      leaf('Finish', at(end, finishTime)),
      leaf('Duration', xsdDuration(span.hours)),
      leaf('DurationFormat', span.format),
      leaf('Estimated', 0),
      leaf('Milestone', milestone ? 1 : 0),
      leaf('Summary', roll.summary ? 1 : 0),
      leaf('Critical', info?.critical ? 1 : 0),
      leaf('EarlyStart', at(earlyStart, startTime)),
      leaf('EarlyFinish', at(split ? end : earlyFinish, finishTime)),
      leaf('LateStart', at(lateStart, time(edges?.lateStart, milestone ? 'end' : 'start'))),
      leaf('LateFinish', at(split ? end : lateFinish, split ? finishTime : time(edges?.lateFinish, 'end'))),
      base && leaf('StartVariance', tenthsOfMinutes(signedWorkingDays(base.start, start, c), c.hoursPerDay)),
      base && leaf('FinishVariance', tenthsOfMinutes(signedWorkingDays(base.end, roll.plannedEnd, c), c.hoursPerDay)),
      // Folga de tarefa em dias corridos vem do motor em dias de 24 h, como o Project a guarda.
      leaf('FreeSlack', tenthsOfMinutes(info?.freeSlack ?? 0, slackHours)),
      leaf('TotalSlack', tenthsOfMinutes(info?.totalSlack ?? 0, slackHours)),
      leaf('StartSlack', tenthsOfMinutes(signedWorkingDays(earlyStart, lateStart, c), c.hoursPerDay)),
      leaf('FinishSlack', tenthsOfMinutes(signedWorkingDays(earlyFinish, lateFinish, c), c.hoursPerDay)),
      leaf('PercentComplete', percent),
      roll.actualStart && leaf('ActualStart', at(roll.actualStart, milestone ? startTime : START_TIME)),
      roll.actualEnd && leaf('ActualFinish', at(roll.actualEnd, milestone ? startTime : journey.finishTime)),
      leaf('ActualDuration', xsdDuration((span.hours * percent) / 100)),
      leaf('RemainingDuration', xsdDuration((span.hours * (100 - percent)) / 100)),
      leaf('ConstraintType', CONSTRAINT_CODES[constraint.type]),
      leaf('CalendarUID', -1),
      constraint.date &&
        leaf('ConstraintDate', at(constraint.date, START_CONSTRAINTS.has(constraint.type) ? START_TIME : journey.finishTime)),
      task.deadline && leaf('Deadline', at(task.deadline, journey.finishTime)),
      task.notes?.trim() && leaf('Notes', task.notes.trim()),
      ...(incoming.get(task.id) ?? []).map(linkNode),
      base &&
        branch('Baseline', [
          leaf('Number', 0),
          leaf('Start', at(base.start, startTime)),
          leaf('Finish', at(base.end, milestone ? startTime : journey.finishTime)),
          leaf('Duration', xsdDuration(baseHours)),
          leaf('DurationFormat', span.format),
        ]),
    ]);
  };

  const header: Maybe[] = [
    leaf('SaveVersion', 14),
    leaf('Name', title),
    leaf('Title', title),
    stamp(plan.createdAt) && leaf('CreationDate', stamp(plan.createdAt)!),
    stamp(plan.updatedAt) && leaf('LastSaved', stamp(plan.updatedAt)!),
    leaf('ScheduleFromStart', 1),
    leaf('StartDate', at(projectStart, START_TIME)),
    leaf('FinishDate', at(bounds.end, journey.finishTime)),
    leaf('CriticalSlackLimit', 0),
    leaf('CurrencyDigits', 2),
    leaf('CurrencySymbol', 'R$'),
    leaf('CurrencyCode', 'BRL'),
    leaf('CurrencySymbolPosition', 0),
    leaf('CalendarUID', 1),
    leaf('DefaultStartTime', START_TIME),
    leaf('DefaultFinishTime', journey.finishTime),
    leaf('MinutesPerDay', Math.round(c.hoursPerDay * 60)),
    leaf('MinutesPerWeek', Math.round(c.hoursPerDay * 60 * c.weekdays.length)),
    leaf('DaysPerMonth', c.daysPerMonth),
    leaf('DefaultTaskType', 0),
    leaf('DurationFormat', FORMAT.days),
    leaf('WorkFormat', 2),
    leaf('NewTasksEstimated', 0),
    leaf('WeekStartDay', 0),
    leaf('NewTasksAreManual', 0),
    branch('OutlineCodes', []),
    branch('WBSMasks', []),
    branch('ExtendedAttributes', []),
    calendarsNode(c, journey),
    branch('Tasks', rows.map(taskNode)),
  ];
  const lines = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', `<Project xmlns="${NAMESPACE}">`];
  for (const node of header) if (node) render(node, 1, lines);
  lines.push('</Project>');
  return lines.join('\n') + '\n';
}

import type { Activity, Baseline, Id, LinkRule, LinkType, LocalDate, NonFulfillmentCause, PlanDependency, PlanningData, PlanTask, ProgressEntry, Wagon, WagonStatus, WeeklyCommitment } from './entities';
import { addBusinessDays, addDays, periodDays } from './validation';

export function validateActivity(activity: Activity): void {
  if (!Number.isFinite(activity.progress) || activity.progress < 0 || activity.progress > 100) throw new Error('Progresso deve ficar entre 0 e 100.');
  if (!Number.isFinite(activity.weight) || activity.weight <= 0) throw new Error('Peso deve ser positivo.');
  if (activity.plannedEnd < activity.plannedStart) throw new Error('Término deve ser igual ou posterior ao início.');
  if (activity.status === 'completed' && activity.progress !== 100) throw new Error('Atividade concluída exige progresso de 100%.');
}
export function weightedProgress(activities: Activity[]): number {
  activities.forEach(validateActivity);
  const weight = activities.reduce((sum, activity) => sum + activity.weight, 0);
  return weight === 0 ? 0 : activities.reduce((sum, activity) => sum + activity.progress * activity.weight, 0) / weight;
}
export function isTerminal(wagonId: string, data: PlanningData): boolean {
  const required = data.activities.filter(a => a.wagonId === wagonId && a.mandatory);
  const activityIds = new Set(data.activities.filter(a => a.wagonId === wagonId).map(a => a.id));
  return required.length > 0
    && required.every(a => a.progress === 100 && a.status === 'completed')
    && data.criteria.filter(c => activityIds.has(c.activityId) && c.mandatory).every(c => c.fulfilled)
    && !data.pendingItems.some(p => p.wagonId === wagonId && p.status === 'open' && p.blocksTerminality)
    && !data.restrictions.some(r => r.wagonId === wagonId && r.status === 'open' && r.blocksTerminality);
}
export function wagonStatus(wagon: Wagon, data: PlanningData): WagonStatus {
  if (isTerminal(wagon.id, data)) return 'terminal';
  if (data.restrictions.some(r => r.wagonId === wagon.id && r.status === 'open' && (r.blocksExecution || r.blocksTerminality))) return 'restricted';
  if (wagon.actualStart || data.activities.some(a => a.wagonId === wagon.id && (a.progress > 0 || a.status !== 'not_started'))) return 'in_production';
  return 'not_started';
}
export function isOverdue(wagon: Wagon, data: PlanningData, today: string): boolean {
  return wagon.plannedEnd < today && !isTerminal(wagon.id, data);
}
/** PPC: compromissos cumpridos sobre compromissos planejados na semana. Nunca é a média
 * dos percentuais executados — o denominador é o número de compromissos assumidos. */
export function ppc(commitments: WeeklyCommitment[]) {
  const planned = commitments.length;
  const fulfilled = commitments.filter(c => c.fulfilled === true).length;
  const pending = commitments.filter(c => c.fulfilled === undefined).length;
  return { planned, fulfilled, pending, percent: planned === 0 ? 0 : (fulfilled / planned) * 100 };
}
/** Atividades da equipe que se sobrepõem à janela, contra a capacidade cadastrada. */
export function teamLoad(teamId: string, start: LocalDate, end: LocalDate, data: PlanningData) {
  const team = data.teams.find(t => t.id === teamId);
  // A carga conta os dois lugares onde a equipe é comprometida: a atividade do cronograma e a
  // linha do plano do mês. Contar só o cronograma dizia "dentro da capacidade" com o mês
  // estourado, justamente para quem planeja na grade nova.
  const activities = data.activities.filter(a => a.teamId === teamId && a.plannedStart <= end && a.plannedEnd >= start);
  const tasks = data.planTasks.filter(t => t.teamId === teamId && t.plannedStart <= end && t.plannedEnd >= start
    && !data.plans.find(p => p.id === t.planId)?.frozenAt);
  const assigned = activities.length + tasks.length;
  return { assigned, activities: activities.length, tasks: tasks.length, capacity: team?.weeklyCapacity ?? 0, overloaded: !!team && assigned > team.weeklyCapacity };
}
/** Dependências cuja sucessora começa antes de a predecessora terminar. A data não é
 * corrigida sozinha — a reprogramação é manual —, então a incoerência é apontada. */
export function dependencyConflicts(data: PlanningData) {
  const byId = new Map(data.activities.map(a => [a.id, a]));
  return data.dependencies.flatMap(dependency => {
    const predecessor = byId.get(dependency.predecessorId), successor = byId.get(dependency.successorId);
    return predecessor && successor && successor.plannedStart <= predecessor.plannedEnd ? [{ dependency, predecessor, successor }] : [];
  });
}
/** Limite para resolver a pendência: o lead time precisa caber antes de a frente começar,
 * então conta-se para trás a partir do início previsto da atividade. */
export function leadTimeDeadline(plannedStart: LocalDate, leadTimeDays: number): LocalDate {
  return addDays(plannedStart, -leadTimeDays);
}
/** Propriedades de um elemento IFC que as regras desta versão sabem ler. */
export interface ElementFacts { pavimento: string; tipo: string }
// Pavimentos em IFC brasileiro vêm como "1º Pavimento", "Térreo"; o valor da regra é
// digitado à mão. Sem ignorar acento e indicador ordinal, a regra falharia em silêncio.
const norm = (value: string) => value
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/(\d)\s*[ºª°]/g, '$1')
  .replace(/(\d)\s*[oa](?!\p{L})/gu, '$1')
  .replace(/\s+/g, ' ')
  .trim();
export function matchesRule(rule: LinkRule, element: ElementFacts): boolean {
  return rule.criteria.every(criterion => {
    const actual = norm(element[criterion.property] ?? '');
    const expected = norm(criterion.value);
    return criterion.operator === 'igual' ? actual === expected : actual.includes(expected);
  });
}
/** Serviço vinculado ao elemento: entre as regras que casam, a de menor ordem. Varre sem
 * ordenar porque é chamada uma vez por elemento do modelo. */
export function serviceForElement(rules: LinkRule[], element: ElementFacts): string | undefined {
  let winner: LinkRule | undefined;
  for (const rule of rules) if ((!winner || rule.order < winner.order) && matchesRule(rule, element)) winner = rule;
  return winner?.serviceName;
}
/** Regras cujo critério de pavimento não encontra nenhum pavimento do modelo atual —
 * o vínculo precisa de revisão humana, sem presumir correspondência. */
export function rulesNeedingReview(rules: LinkRule[], storeys: string[]): LinkRule[] {
  return rules.filter(rule => rule.criteria.some(criterion =>
    criterion.property === 'pavimento' && !storeys.some(storey =>
      criterion.operator === 'igual' ? norm(storey) === norm(criterion.value) : norm(storey).includes(norm(criterion.value)))));
}
export function validateSequence(wagons: Wagon[]): void {
  const byId = new Map(wagons.map(w => [w.id, w]));
  if (byId.size !== wagons.length) throw new Error('Identificador de vagão duplicado.');
  const successors = new Set<string>();
  const numbers = new Set<string>();
  for (const wagon of wagons) {
    const key = `${wagon.sequenceId}:${wagon.number}`;
    if (numbers.has(key)) throw new Error('Número de vagão duplicado na sequência.');
    numbers.add(key);
    if (wagon.predecessorId) {
      const previous = byId.get(wagon.predecessorId);
      if (!previous || previous.sequenceId !== wagon.sequenceId) throw new Error('Predecessor deve pertencer à mesma sequência.');
      if (successors.has(previous.id)) throw new Error('Um vagão não pode ter múltiplos sucessores.');
      successors.add(previous.id);
    }
    const visited = new Set<string>();
    let cursor: Wagon | undefined = wagon;
    while (cursor) {
      if (visited.has(cursor.id)) throw new Error('Sequência não pode conter ciclos.');
      visited.add(cursor.id);
      cursor = cursor.predecessorId ? byId.get(cursor.predecessorId) : undefined;
    }
  }
}

/** O plano do mês lido como estrutura, e não como lista: número do item (1, 1.1, 1.1.1), se ele
 * tem subitens e, quando tem, o que a linha de fato mostra.
 *
 * Um item de resumo não tem datas próprias — ele é o envelope dos subitens, como a barra de
 * resumo do MS Project. Guardar essas datas seria manter duas verdades sobre a mesma coisa: quem
 * edita o subitem esperaria o item acompanhar, e ele não acompanharia. Então o item é calculado
 * aqui, na leitura, a partir de quem está debaixo dele. */
export interface PlanRollUp {
  number: string; summary: boolean; leaves: number; plannedStart: LocalDate; plannedEnd: LocalDate; progress: number;
  /** Resumo: o início real mais cedo entre os subitens que já começaram. */
  actualStart?: LocalDate;
  /** Resumo: o término real mais tarde, só quando todos os subitens terminaram. */
  actualEnd?: LocalDate;
  /** Linha folha de duração zero. Opcional no tipo para quem monta a linha à mão; `rollUpPlan` sempre preenche. */
  milestone?: boolean;
}

export function rollUpPlan(tasks: PlanTask[]): Map<Id, PlanRollUp & { milestone: boolean }> {
  // A ordem é que define a estrutura: o pai de uma linha é a anterior mais próxima com nível menor.
  const rows = tasks.slice().sort((a, b) => a.order - b.order);
  const hasChildren = (at: number) => rows[at + 1] !== undefined && rows[at + 1].level > rows[at].level;
  // Duração em dias para ponderar o avanço: um subitem de dez dias pesa dez vezes um de um dia,
  // que é como o MS Project resume o percentual de um item.
  const weight = (task: PlanTask) => Math.max(1, periodDays(task.plannedStart, task.plannedEnd, false));
  const counters: number[] = [];
  const result = new Map<Id, PlanRollUp & { milestone: boolean }>();

  for (let at = 0; at < rows.length; at++) {
    const task = rows[at];
    // Nível que pula um degrau (dado antigo, ou importação) não deve quebrar a numeração.
    const depth = Math.min(Math.max(0, task.level), counters.length);
    counters.length = depth + 1;
    counters[depth] = (counters[depth] ?? 0) + 1;
    const number = counters.slice(0, depth + 1).join('.');

    const leaves: PlanTask[] = [];
    for (let below = at + 1; below < rows.length && rows[below].level > task.level; below++) if (!hasChildren(below)) leaves.push(rows[below]);
    if (!leaves.length) {
      result.set(task.id, { number, summary: false, leaves: 0, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, progress: task.progress, actualStart: task.actualStart, actualEnd: task.actualEnd, milestone: task.duration?.value === 0 });
      continue;
    }
    const total = leaves.reduce((sum, leaf) => sum + weight(leaf), 0);
    const started = leaves.filter(leaf => leaf.actualStart).map(leaf => leaf.actualStart!).sort();
    const finished = leaves.every(leaf => leaf.actualEnd) ? leaves.map(leaf => leaf.actualEnd!).sort() : [];
    result.set(task.id, {
      number, summary: true, leaves: leaves.length, milestone: false,
      actualStart: started[0], actualEnd: finished.at(-1),
      plannedStart: leaves.reduce((min, leaf) => (leaf.plannedStart < min ? leaf.plannedStart : min), leaves[0].plannedStart),
      plannedEnd: leaves.reduce((max, leaf) => (leaf.plannedEnd > max ? leaf.plannedEnd : max), leaves[0].plannedEnd),
      progress: leaves.reduce((sum, leaf) => sum + leaf.progress * weight(leaf), 0) / total,
    });
  }
  return result;
}

/** O PPC de cada semana, da mais antiga para a mais recente. O valor de uma semana isolada diz
 * pouco: o que o Last Planner usa é a série — se o comprometimento está sendo aprendido ou se a
 * equipe promete a mesma coisa todo mês e falha pelo mesmo motivo. */
export interface WeekPpc { weekStart: LocalDate; planned: number; fulfilled: number; pending: number; percent: number }
export function ppcSeries(commitments: WeeklyCommitment[]): WeekPpc[] {
  const weeks = new Map<string, WeeklyCommitment[]>();
  for (const commitment of commitments) {
    const week = weeks.get(commitment.weekStart);
    if (week) week.push(commitment); else weeks.set(commitment.weekStart, [commitment]);
  }
  return [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, rows]) => ({ weekStart, ...ppc(rows) }));
}

/** As causas do não cumprimento em ordem de peso, com o acumulado — o Pareto. A lista fechada de
 * 17 causas só serve para alguma coisa quando responde qual delas está custando a obra; coletar
 * sem ordenar é o que a planilha já fazia. */
export interface CauseTally { cause: NonFulfillmentCause; total: number; share: number; accumulated: number }
export function causePareto(commitments: WeeklyCommitment[]): CauseTally[] {
  const totals = new Map<NonFulfillmentCause, number>();
  for (const commitment of commitments) {
    if (commitment.fulfilled !== false || !commitment.cause) continue;
    totals.set(commitment.cause, (totals.get(commitment.cause) ?? 0) + 1);
  }
  const failures = [...totals.values()].reduce((sum, total) => sum + total, 0);
  if (!failures) return [];
  let running = 0;
  // Empate resolvido pelo nome: a ordem tem que ser a mesma a cada leitura, senão duas telas
  // iguais mostram Paretos diferentes.
  return [...totals.entries()].sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB, 'pt-BR'))
    .map(([cause, total]) => { running += total; return { cause, total, share: (total / failures) * 100, accumulated: (running / failures) * 100 }; });
}

/** Curva S: o avanço físico acumulado no tempo, planejado contra executado.
 *
 * O planejado de uma data é quanto do peso da obra deveria estar pronto ali, com cada frente
 * avançando linearmente entre o seu início e o seu término. É aproximação declarada: a obra não
 * avança em reta dentro de uma frente, mas a alternativa seria inventar uma curva de produção que
 * ninguém mediu. O executado não é aproximado — sai do lançamento datado, que é medição.
 *
 * A referência do planejado é uma linha de base quando houver: comparar o executado com o
 * planejamento atual, que foi reprogramado, é comparar a obra com a desculpa dela. */
interface Planned { plannedStart: LocalDate; plannedEnd: LocalDate; weight: number }
export interface CurvePoint { date: LocalDate; planned: number; executed: number }

const share = (item: Planned, date: LocalDate) => {
  if (date < item.plannedStart) return 0;
  if (date >= item.plannedEnd) return 100;
  return (periodDays(item.plannedStart, date, false) / periodDays(item.plannedStart, item.plannedEnd, false)) * 100;
};

export function plannedAt(items: Planned[], date: LocalDate): number {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  return total ? items.reduce((sum, item) => sum + share(item, date) * item.weight, 0) / total : 0;
}

/** Executado até a data: por atividade vale o último lançamento com data menor ou igual, e zero
 * quando não houver nenhum. O percentual da atividade guarda só o valor de hoje, não a série. */
export function executedAt(activities: Activity[], entries: ProgressEntry[], date: LocalDate): number {
  const total = activities.reduce((sum, activity) => sum + activity.weight, 0);
  if (!total) return 0;
  const byActivity = new Map<Id, ProgressEntry[]>();
  for (const entry of entries) {
    if (entry.recordedDate > date) continue;
    const list = byActivity.get(entry.activityId);
    if (list) list.push(entry); else byActivity.set(entry.activityId, [entry]);
  }
  const at = (activity: Activity) => byActivity.get(activity.id)?.slice()
    .sort((a, b) => a.recordedDate.localeCompare(b.recordedDate) || a.createdAt.localeCompare(b.createdAt)).at(-1)?.progress ?? 0;
  return activities.reduce((sum, activity) => sum + at(activity) * activity.weight, 0) / total;
}

/** A curva amostrada semana a semana. `to` entra sempre, mesmo fora do passo, para a leitura não
 * terminar antes da data que interessa. */
export function progressCurve({ activities, entries, baseline, from, to, step = 7 }: {
  activities: Activity[]; entries: ProgressEntry[]; baseline?: Baseline; from: LocalDate; to: LocalDate; step?: number;
}): CurvePoint[] {
  if (from > to) return [];
  const reference: Planned[] = baseline ? baseline.activities : activities;
  const points: CurvePoint[] = [];
  for (let date = from; date <= to; date = addDays(date, step)) {
    points.push({ date, planned: plannedAt(reference, date), executed: executedAt(activities, entries, date) });
  }
  if (points.at(-1)?.date !== to) points.push({ date: to, planned: plannedAt(reference, to), executed: executedAt(activities, entries, to) });
  return points;
}

/** Predecessoras escritas como no Project: número da linha, tipo do vínculo e defasagem.
 *
 * `12` · `12TI` · `12II+2d` · `12TT-1 dia` · `12TI+2dd` · `27TI+6 dias` · `12II+2 dias corridos` · `12;15II`
 *
 * O número é a posição na lista, não o número hierárquico do item: o hierárquico muda a cada
 * recuo, e a referência apontaria para outra linha. O tipo, quando omitido, é TI — é o vínculo
 * que 90% das obras usam e o padrão do Project. `d`/`dias` são dias úteis; `dd`/`dias corridos`,
 * corridos. Separe as predecessoras com `;` (como o Project) ou `,`. */
export interface ParsedLink { number: number; type: LinkType; lagDays: number; lagBusiness: boolean }
const LINK_TYPES: LinkType[] = ['TI', 'II', 'TT', 'IT'];
// Sem espaços: `6 dias corridos` chega aqui como `6diascorridos`.
const LINK_PATTERN = /^(\d+)(TI|II|TT|IT)?(?:([+-])(\d+)(dd|d|dias?(?:de)?corridos?|dias?)?)?$/i;

export function parseLinks(raw: string): { links: ParsedLink[]; invalid: string[] } {
  const links: ParsedLink[] = [];
  const invalid: string[] = [];
  for (const piece of raw.split(/[,;]/).map(part => part.trim()).filter(Boolean)) {
    const match = LINK_PATTERN.exec(piece.replace(/\s+/g, ''));
    if (!match) { invalid.push(piece); continue; }
    const [, number, type, sign, amount, unit] = match;
    const lag = amount ? Number(amount) * (sign === '-' ? -1 : 1) : 0;
    const lower = (unit ?? 'd').toLowerCase();
    links.push({
      number: Number(number),
      type: (type?.toUpperCase() as LinkType) ?? 'TI',
      lagDays: lag,
      // Sem unidade escrita, a defasagem é em dias úteis, como o Project assume.
      lagBusiness: lower !== 'dd' && !lower.includes('corrido'),
    });
  }
  return { links, invalid };
}

/** O texto de volta para a célula, no português do Project. Vínculo TI sem defasagem sai como só
 * o número; com defasagem, `27TI+6 dias`, `12II+2 dias corridos`, `5TT-1 dia`. */
export function formatLink(number: number, dependency: Pick<PlanDependency, 'type' | 'lagDays' | 'lagBusiness'>): string {
  const type = dependency.type === 'TI' ? '' : dependency.type;
  if (!dependency.lagDays) return `${number}${type}`;
  const sign = dependency.lagDays > 0 ? '+' : '-', amount = Math.abs(dependency.lagDays);
  const unit = (amount === 1 ? 'dia' : 'dias') + (dependency.lagBusiness ? '' : amount === 1 ? ' corrido' : ' corridos');
  return `${number}${type || 'TI'}${sign}${amount} ${unit}`;
}
/** A célula inteira de predecessoras, separadas por `;` como no Project. */
export function formatLinks(list: ParsedLink[]): string {
  return list.map(link => formatLink(link.number, link)).join(';');
}

/** A data mais cedo que o vínculo permite para a sucessora, e qual ponta dela ele prende.
 *
 * TI prende o início um dia depois do término da predecessora — a sucessora não começa no mesmo
 * dia em que a outra acaba. Os demais prendem a ponta que o nome diz, sem esse dia de folga. */
export function linkBoundary(dependency: Pick<PlanDependency, 'type' | 'lagDays' | 'lagBusiness'>, predecessor: Pick<PlanTask, 'plannedStart' | 'plannedEnd'>) {
  const shift = (date: LocalDate) => (dependency.lagBusiness ? addBusinessDays(date, dependency.lagDays) : addDays(date, dependency.lagDays));
  switch (dependency.type) {
    case 'II': return { edge: 'start' as const, earliest: shift(predecessor.plannedStart) };
    case 'TT': return { edge: 'end' as const, earliest: shift(predecessor.plannedEnd) };
    case 'IT': return { edge: 'end' as const, earliest: shift(predecessor.plannedStart) };
    default: return { edge: 'start' as const, earliest: shift(addBusinessDays(predecessor.plannedEnd, 1)) };
  }
}

/** Vínculos que a programação atual desrespeita. As datas não se movem sozinhas nesta versão:
 * a incoerência é apontada e a reprogramação é de quem planeja. */
export function linkConflicts(tasks: PlanTask[], dependencies: PlanDependency[]) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  return dependencies.flatMap(dependency => {
    const predecessor = byId.get(dependency.predecessorId), successor = byId.get(dependency.successorId);
    if (!predecessor || !successor) return [];
    const { edge, earliest } = linkBoundary(dependency, predecessor);
    const actual = edge === 'start' ? successor.plannedStart : successor.plannedEnd;
    return actual < earliest ? [{ dependency, predecessor, successor, edge, earliest, actual }] : [];
  });
}

/** Percentual-alvo: quanto do tempo planejado já passou na data de referência. É leitura de tempo,
 * não medição física — a tela precisa dizer isso, senão vira um avanço que ninguém mediu. */
export function targetPercent(task: Pick<PlanTask, 'plannedStart' | 'plannedEnd'>, date: LocalDate): number {
  if (date < task.plannedStart) return 0;
  if (date >= task.plannedEnd) return 100;
  return (periodDays(task.plannedStart, date, true) / periodDays(task.plannedStart, task.plannedEnd, true)) * 100;
}

/** Planejamento de longo prazo preenchido no próprio sistema: fluxograma de serviços que se
 * expande em Linha de Balanço. Reproduz a ferramenta "Planejamento de Longo Prazo" do App-ATR
 * (maio/2026, descontinuada em 08/07/2026), com o mesmo modelo — cada serviço percorre um
 * intervalo de pavimentos com duração por pavimento e ritmo (dias entre o início de um
 * pavimento e o do seguinte) — e com as correções descritas em `docs/planejamento-tres-niveis.md`.
 *
 * O plano é um documento por obra, fora do snapshot de planejamento: ele não passa por
 * `commit_planning`, e por isso uma obra sem plano ou sem a migração 0024 não derruba as outras
 * telas. Datas em dias corridos (é o macro da obra), sempre em UTC para não escorregar de fuso. */

export type LocalDate = string;

export interface LongTermTeam { name: string; size: number }
/** Predecessora do serviço. Sem `floor`, vale a regra de não cruzamento: em cada pavimento que os
 * dois serviços têm em comum, o sucessor só começa quando a predecessora terminou ali (+ espera).
 * Com `floor`, o sucessor começa no seu primeiro pavimento depois que a predecessora terminou
 * aquele pavimento específico. */
export interface LongTermLink { activityId: string; lagDays: number; floor?: number }
export interface LongTermActivity {
  id: string;
  name: string;
  color: string;
  firstFloor: number;
  lastFloor: number;
  /** Início no primeiro pavimento. */
  start: LocalDate;
  /** Dias corridos de trabalho em cada pavimento (padrão). */
  duration: number;
  /** Duração própria de alguns pavimentos; chave = número do pavimento. */
  floorDurations?: Record<string, number>;
  /** Ritmo: dias entre o início do pavimento n e o do n+1. Zero = todos juntos. */
  interval: number;
  visible: boolean;
  predecessors: LongTermLink[];
  teams: LongTermTeam[];
  /** Unidade de medição ('%', 'apartamento', 'm²'…). Fica travada depois da primeira medição. */
  unit?: string;
  /** Quantidade total prevista, denominador das medições que não são em %. */
  plannedTotal?: number;
  notes?: string;
}
export interface LongTermBaseline { id: string; name: string; createdAt: string; createdBy: string; activities: LongTermActivity[] }
export interface LongTermMeasurementItem { activityId: string; value: number; note?: string }
/** Rodada de medição: numerada em sequência, com a quantidade acumulada de cada serviço. */
export interface LongTermMeasurement { id: string; number: number; date: LocalDate; createdAt: string; createdBy: string; items: LongTermMeasurementItem[] }
export interface LongTermPlanDocument {
  floorCount: number;
  /** Nome de exibição dos pavimentos; chave = número. Sem nome, aparece "3º". */
  floorNames: Record<string, string>;
  activities: LongTermActivity[];
  baselines: LongTermBaseline[];
  measurements: LongTermMeasurement[];
}
/** `revision` é o controle de concorrência: salvar exige a revisão lida, e quem salvou por
 * último não apaga em silêncio o que outra pessoa gravou no meio tempo. Zero = ainda não salvo. */
/** `sync`: de qual revisão e para qual sequência os vagões foram gerados por último. */
export interface LongTermPlan { workId: string; revision: number; updatedAt?: string; updatedBy?: string; document: LongTermPlanDocument; sync?: { revision: number; sequenceId: string; at: string; by: string } }

export const LONG_TERM_COLORS = ['#dc2626', '#2563eb', '#059669', '#7c3aed', '#d97706', '#0891b2', '#be185d', '#65a30d', '#c2410c', '#0369a1', '#6d28d9', '#0f766e'];
export const MEASUREMENT_UNITS = ['%', 'apartamento', 'm²', 'm', 'unidade'];
export const LIMITS = { floors: 200, activities: 400, baselines: 60, measurements: 500, name: 120, text: 2000, duration: 3650 } as const;

// ─── Datas ──────────────────────────────────────────────────────────────────────

const DAY = 86_400_000;
export const toMs = (date: LocalDate) => Date.parse(`${date}T00:00:00Z`);
export const fromMs = (ms: number): LocalDate => new Date(ms).toISOString().slice(0, 10);
export const addDays = (date: LocalDate, days: number): LocalDate => fromMs(toMs(date) + days * DAY);
export const daysBetween = (from: LocalDate, to: LocalDate) => Math.round((toMs(to) - toMs(from)) / DAY);
export const isLocalDate = (value: unknown): value is LocalDate =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromMs(toMs(value)) === value;
const maxDate = (a: LocalDate, b: LocalDate) => (a > b ? a : b);
const minDate = (a: LocalDate, b: LocalDate) => (a < b ? a : b);

// ─── Pavimentos ─────────────────────────────────────────────────────────────────

export const floorLabel = (document: Pick<LongTermPlanDocument, 'floorNames'>, floor: number) =>
  document.floorNames[String(floor)]?.trim() || `${floor}º`;
export const floorsOf = (activity: Pick<LongTermActivity, 'firstFloor' | 'lastFloor'>) =>
  Array.from({ length: activity.lastFloor - activity.firstFloor + 1 }, (_, i) => activity.firstFloor + i);

// ─── Agenda de um serviço ───────────────────────────────────────────────────────

export const floorDuration = (activity: LongTermActivity, floor: number) =>
  activity.floorDurations?.[String(floor)] ?? activity.duration;
export const floorStart = (activity: LongTermActivity, floor: number): LocalDate =>
  addDays(activity.start, (floor - activity.firstFloor) * activity.interval);
/** Fim exclusivo: o primeiro dia livre depois do pavimento. É com ele que a sucessora encaixa. */
export const floorEnd = (activity: LongTermActivity, floor: number): LocalDate =>
  addDays(floorStart(activity, floor), floorDuration(activity, floor));
/** Último dia de trabalho no pavimento, o que se mostra como "término". */
export const floorFinish = (activity: LongTermActivity, floor: number): LocalDate => addDays(floorEnd(activity, floor), -1);

export interface FloorSlot { floor: number; start: LocalDate; end: LocalDate; finish: LocalDate; duration: number }
export function floorSchedule(activity: LongTermActivity): FloorSlot[] {
  return floorsOf(activity).map(floor => ({
    floor, start: floorStart(activity, floor), end: floorEnd(activity, floor),
    finish: floorFinish(activity, floor), duration: floorDuration(activity, floor),
  }));
}
/** Início e fim do serviço inteiro. O fim é o do pavimento que termina por último — com duração
 * própria por pavimento ele não é necessariamente o último pavimento. */
export function activitySpan(activity: LongTermActivity) {
  const slots = floorSchedule(activity);
  const start = slots.reduce((acc, s) => minDate(acc, s.start), slots[0].start);
  const end = slots.reduce((acc, s) => maxDate(acc, s.end), slots[0].end);
  return { start, end, finish: addDays(end, -1), days: daysBetween(start, end) };
}
export function planSpan(activities: LongTermActivity[]) {
  const shown = activities.filter(a => a.visible);
  if (!shown.length) return undefined;
  const spans = shown.map(activitySpan);
  const start = spans.reduce((acc, s) => minDate(acc, s.start), spans[0].start);
  const end = spans.reduce((acc, s) => maxDate(acc, s.end), spans[0].end);
  const a = new Date(toMs(start)), b = new Date(toMs(end));
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  return { start, end, finish: addDays(end, -1), days: daysBetween(start, end), months };
}

// ─── Predecessoras ──────────────────────────────────────────────────────────────

/** Início mínimo do sucessor imposto por uma predecessora.
 * - `floor` informado: termina aquele pavimento da predecessora, começa o primeiro do sucessor.
 * - Sem `floor`, com pavimentos em comum: em cada pavimento comum o sucessor começa depois do fim
 *   da predecessora ali. É a regra exata; a ferramenta original olhava só o primeiro ou o último
 *   pavimento e deixava cruzar quando havia duração própria por pavimento ou faixas diferentes.
 * - Sem pavimento em comum: término-início do serviço inteiro. */
export function minimumStart(predecessor: LongTermActivity, successor: LongTermActivity, link: LongTermLink): LocalDate {
  if (link.floor !== undefined && link.floor >= predecessor.firstFloor && link.floor <= predecessor.lastFloor) {
    return addDays(floorEnd(predecessor, link.floor), link.lagDays);
  }
  const from = Math.max(predecessor.firstFloor, successor.firstFloor);
  const to = Math.min(predecessor.lastFloor, successor.lastFloor);
  if (from > to) return addDays(activitySpan(predecessor).end, link.lagDays);
  let best = '';
  for (let floor = from; floor <= to; floor++) {
    const candidate = addDays(floorEnd(predecessor, floor), link.lagDays - (floor - successor.firstFloor) * successor.interval);
    if (candidate > best) best = candidate;
  }
  return best;
}
/** Maior início mínimo entre as predecessoras; indefinido para serviço sem predecessora. */
export function earliestStart(activity: LongTermActivity, activities: LongTermActivity[]): LocalDate | undefined {
  let best: LocalDate | undefined;
  for (const link of activity.predecessors) {
    const predecessor = activities.find(a => a.id === link.activityId);
    if (!predecessor) continue;
    const candidate = minimumStart(predecessor, activity, link);
    if (!best || candidate > best) best = candidate;
  }
  return best;
}
/** Verdadeiro se `activityId` já é ancestral de `candidateId`: ligar candidate → activity fecharia
 * um ciclo. O formulário usa para esconder essas opções; a validação usa para recusar. */
export function dependsOn(activities: LongTermActivity[], candidateId: string, activityId: string): boolean {
  const byId = new Map(activities.map(a => [a.id, a]));
  const seen = new Set<string>();
  const stack = [candidateId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === activityId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const link of byId.get(id)?.predecessors ?? []) stack.push(link.activityId);
  }
  return false;
}
/** Ordem topológica (predecessoras antes). Serviços presos num ciclo ficam de fora. */
export function topologicalOrder(activities: LongTermActivity[]): LongTermActivity[] {
  const ids = new Set(activities.map(a => a.id));
  const pending = new Map(activities.map(a => [a.id, new Set(a.predecessors.map(l => l.activityId).filter(id => ids.has(id) && id !== a.id))]));
  const order: LongTermActivity[] = [];
  const byId = new Map(activities.map(a => [a.id, a]));
  let ready = activities.filter(a => pending.get(a.id)!.size === 0).map(a => a.id);
  while (ready.length) {
    const next: string[] = [];
    for (const id of ready) {
      order.push(byId.get(id)!);
      for (const [other, preds] of pending) if (preds.delete(id) && preds.size === 0) next.push(other);
    }
    ready = next;
  }
  return order;
}
/** Reprograma em cascata, em ordem topológica (A→B→C numa passada).
 * - Padrão: só empurra para frente quem ficou antes do mínimo; folga dada à mão é mantida.
 * - `removeSlack`: puxa todo serviço com predecessora para o mínimo ("Recalcular").
 * Serviço sem predecessora nunca muda de data. */
export function reschedule(activities: LongTermActivity[], options: { removeSlack?: boolean } = {}): LongTermActivity[] {
  const next = new Map(activities.map(a => [a.id, { ...a }]));
  for (const original of topologicalOrder(activities)) {
    const activity = next.get(original.id)!;
    const minimum = earliestStart(activity, [...next.values()]);
    if (!minimum) continue;
    if (options.removeSlack ? minimum !== activity.start : minimum > activity.start) activity.start = minimum;
  }
  return activities.map(a => next.get(a.id)!);
}
/** Nível de precedência: 0 sem predecessora; senão, 1 + o maior nível das predecessoras. É a
 * coluna do fluxograma. */
export function precedenceLevels(activities: LongTermActivity[]): Map<string, number> {
  const level = new Map<string, number>();
  for (const activity of topologicalOrder(activities)) {
    const preds = activity.predecessors.map(l => level.get(l.activityId)).filter((v): v is number => v !== undefined);
    level.set(activity.id, preds.length ? Math.max(...preds) + 1 : 0);
  }
  for (const activity of activities) if (!level.has(activity.id)) level.set(activity.id, 0);
  return level;
}

// ─── Equipes ────────────────────────────────────────────────────────────────────

const mondayOf = (date: LocalDate) => { const weekday = new Date(toMs(date)).getUTCDay(); return addDays(date, weekday === 0 ? -6 : 1 - weekday); };
/** Pico diário de pessoas por equipe em cada semana (segunda-feira como chave). Soma os serviços
 * que usam a mesma equipe no mesmo dia, pavimento a pavimento, respeitando a duração própria. */
export function teamDemand(activities: LongTermActivity[]) {
  const daily = new Map<string, Map<string, number>>();
  for (const activity of activities) {
    if (!activity.visible || !activity.teams.length) continue;
    for (const slot of floorSchedule(activity)) {
      for (let d = 0; d < slot.duration; d++) {
        const day = addDays(slot.start, d);
        const load = daily.get(day) ?? new Map<string, number>();
        for (const team of activity.teams) load.set(team.name, (load.get(team.name) ?? 0) + team.size);
        daily.set(day, load);
      }
    }
  }
  const weekly = new Map<string, Map<string, number>>();
  for (const [day, load] of daily) {
    const week = mondayOf(day);
    const peak = weekly.get(week) ?? new Map<string, number>();
    for (const [team, size] of load) peak.set(team, Math.max(peak.get(team) ?? 0, size));
    weekly.set(week, peak);
  }
  const weeks = [...weekly.keys()].sort();
  const teams = [...new Set([...weekly.values()].flatMap(m => [...m.keys()]))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const matrix: Record<string, Record<string, number>> = {};
  for (const week of weeks) matrix[week] = Object.fromEntries(weekly.get(week)!);
  return { weeks, teams, matrix };
}

// ─── Medições ───────────────────────────────────────────────────────────────────

export function measuredPercent(activity: Pick<LongTermActivity, 'unit' | 'plannedTotal'>, value: number) {
  if (activity.unit === '%') return Math.max(0, Math.min(100, value));
  if (!activity.plannedTotal || activity.plannedTotal <= 0) return 0;
  return Math.max(0, Math.min(100, (value / activity.plannedTotal) * 100));
}
/** Percentual mais recente de cada serviço medido, até `until` (inclusive) se informado. */
export function latestPercents(activities: LongTermActivity[], measurements: LongTermMeasurement[], until?: LocalDate) {
  const result: Record<string, number> = {};
  const ordered = [...measurements].filter(m => !until || m.date <= until).sort((a, b) => a.date.localeCompare(b.date) || a.number - b.number);
  for (const measurement of ordered) {
    for (const item of measurement.items) {
      const activity = activities.find(a => a.id === item.activityId);
      if (activity?.unit) result[item.activityId] = measuredPercent(activity, item.value);
    }
  }
  return result;
}
/** Avanço físico do plano: média dos serviços com unidade de medição, ponderada pelos
 * pavimento-dias de cada um (um serviço de 20 pavimentos pesa mais que um de 2). Serviço com
 * unidade e ainda sem medição entra com 0%. A ferramenta original fazia média simples só dos já
 * medidos, o que inflava o avanço no começo da obra. */
export function physicalProgress(activities: LongTermActivity[], measurements: LongTermMeasurement[], until?: LocalDate) {
  const measurable = activities.filter(a => a.visible && a.unit);
  if (!measurable.length || !measurements.length) return undefined;
  const percents = latestPercents(activities, measurements, until);
  let weight = 0, done = 0;
  for (const activity of measurable) {
    const w = floorSchedule(activity).reduce((sum, s) => sum + s.duration, 0);
    weight += w; done += w * (percents[activity.id] ?? 0);
  }
  return weight ? done / weight : undefined;
}
/** Serviços que já têm medição: a unidade deles não pode mais mudar. */
export function measuredActivityIds(measurements: LongTermMeasurement[]) {
  return new Set(measurements.flatMap(m => m.items.map(i => i.activityId)));
}

// ─── Documento ──────────────────────────────────────────────────────────────────

export const emptyPlanDocument = (floorCount = 20): LongTermPlanDocument =>
  ({ floorCount, floorNames: {}, activities: [], baselines: [], measurements: [] });

/** Sequência típica de um edifício, para quem quer partir de algo e ajustar. Mesmos serviços da
 * obra-demo da ferramenta original, agora encadeados por predecessora. */
export function examplePlanDocument(start: LocalDate, floorCount = 20): LongTermPlanDocument {
  const base = (id: string, name: string, color: string, duration: number, interval: number, predecessors: LongTermLink[] = []): LongTermActivity =>
    ({ id, name, color, firstFloor: 1, lastFloor: floorCount, start, duration, interval, visible: true, predecessors, teams: [] });
  const activities = [
    base('ex-estrutura', 'Estrutura', LONG_TERM_COLORS[0], 5, 7),
    base('ex-alvenaria', 'Alvenaria', LONG_TERM_COLORS[1], 7, 7, [{ activityId: 'ex-estrutura', lagDays: 14 }]),
    base('ex-instalacoes', 'Instalações', LONG_TERM_COLORS[3], 10, 7, [{ activityId: 'ex-alvenaria', lagDays: 0 }]),
    base('ex-rev-int', 'Revestimento interno', LONG_TERM_COLORS[2], 10, 7, [{ activityId: 'ex-instalacoes', lagDays: 0 }]),
    base('ex-rev-ext', 'Revestimento externo', LONG_TERM_COLORS[4], 14, 10, [{ activityId: 'ex-alvenaria', lagDays: 7 }]),
    base('ex-acabamentos', 'Acabamentos', LONG_TERM_COLORS[5], 7, 7, [{ activityId: 'ex-rev-int', lagDays: 0 }]),
  ];
  return { ...emptyPlanDocument(floorCount), activities: reschedule(activities, { removeSlack: true }) };
}

/** Duplica um serviço como ponto de partida para outro parecido. */
export const copyActivity = (activity: LongTermActivity, id: string): LongTermActivity =>
  JSON.parse(JSON.stringify({ ...activity, id, name: `${activity.name} (cópia)`.slice(0, LIMITS.name) }));

// ─── Validação (API) ────────────────────────────────────────────────────────────

class PlanError extends Error {}
const fail = (message: string): never => { throw new PlanError(message); };
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, label: string, max: number = LIMITS.name, required = true) => {
  if (v === undefined || v === null || v === '') { if (required) fail(`${label}: informe um valor.`); return undefined; }
  if (typeof v !== 'string') return fail(`${label}: texto inválido.`);
  const t = v.trim();
  if (required && !t) fail(`${label}: informe um valor.`);
  if (t.length > max) fail(`${label}: até ${max} caracteres.`);
  return t || undefined;
};
const integer = (v: unknown, label: string, min: number, max: number) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) fail(`${label}: use um número inteiro entre ${min} e ${max}.`);
  return v as number;
};
const number = (v: unknown, label: string, min: number, max: number) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${label}: use um número entre ${min} e ${max}.`);
  return v as number;
};
const date = (v: unknown, label: string) => (isLocalDate(v) ? v : fail(`${label}: data inválida.`));
const list = (v: unknown, label: string, max: number) => {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return fail(`${label}: lista inválida.`);
  if (v.length > max) fail(`${label}: no máximo ${max}.`);
  return v as unknown[];
};

function readActivity(v: unknown, floorCount: number, index: number): LongTermActivity {
  if (!isObject(v)) fail(`Serviço ${index + 1}: formato inválido.`);
  const input = v as Record<string, unknown>;
  const name = text(input.name, `Serviço ${index + 1}`)!;
  const label = `Serviço "${name}"`;
  const id = text(input.id, `${label} (id)`, 80)!;
  const color = typeof input.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : fail(`${label}: cor inválida.`);
  const firstFloor = integer(input.firstFloor, `${label}, pavimento inicial`, 1, floorCount);
  const lastFloor = integer(input.lastFloor, `${label}, pavimento final`, firstFloor, floorCount);
  const floorDurations: Record<string, number> = {};
  if (input.floorDurations !== undefined) {
    if (!isObject(input.floorDurations)) fail(`${label}: durações por pavimento inválidas.`);
    for (const [key, value] of Object.entries(input.floorDurations as Record<string, unknown>)) {
      const floor = Number(key);
      if (!Number.isInteger(floor) || floor < firstFloor || floor > lastFloor) continue; // sobra de faixa antiga
      floorDurations[String(floor)] = integer(value, `${label}, duração do pavimento ${floor}`, 1, LIMITS.duration);
    }
  }
  const predecessors = list(input.predecessors, `${label}, predecessoras`, 50).map((raw, i) => {
    if (!isObject(raw)) return fail(`${label}: predecessora ${i + 1} inválida.`);
    const link = raw as Record<string, unknown>;
    const floor = link.floor === undefined || link.floor === null ? undefined : integer(link.floor, `${label}, pavimento da predecessora`, 1, floorCount);
    return { activityId: text(link.activityId, `${label}, predecessora`, 80)!, lagDays: integer(link.lagDays ?? 0, `${label}, espera`, -LIMITS.duration, LIMITS.duration), ...(floor === undefined ? {} : { floor }) };
  });
  const teams = list(input.teams, `${label}, equipes`, 30).map((raw, i) => {
    if (!isObject(raw)) return fail(`${label}: equipe ${i + 1} inválida.`);
    const team = raw as Record<string, unknown>;
    return { name: text(team.name, `${label}, equipe`, 80)!, size: integer(team.size, `${label}, pessoas da equipe`, 1, 1000) };
  });
  const unit = text(input.unit, `${label}, unidade`, 30, false);
  const plannedTotal = input.plannedTotal === undefined || input.plannedTotal === null ? undefined : number(input.plannedTotal, `${label}, total previsto`, 0.0001, 1e9);
  const notes = text(input.notes, `${label}, observações`, LIMITS.text, false);
  return {
    id, name, color, firstFloor, lastFloor,
    start: date(input.start, `${label}, início`),
    duration: integer(input.duration, `${label}, duração por pavimento`, 1, LIMITS.duration),
    ...(Object.keys(floorDurations).length ? { floorDurations } : {}),
    interval: integer(input.interval, `${label}, ritmo`, 0, LIMITS.duration),
    visible: input.visible !== false, predecessors, teams,
    ...(unit ? { unit } : {}), ...(plannedTotal !== undefined ? { plannedTotal } : {}), ...(notes ? { notes } : {}),
  };
}

function checkNetwork(activities: LongTermActivity[], label = '') {
  const ids = new Set<string>();
  for (const a of activities) { if (ids.has(a.id)) fail(`${label}Serviço repetido: "${a.name}".`); ids.add(a.id); }
  for (const a of activities) {
    const seen = new Set<string>();
    for (const link of a.predecessors) {
      if (link.activityId === a.id) fail(`${label}"${a.name}" não pode ser predecessora de si mesma.`);
      if (!ids.has(link.activityId)) fail(`${label}"${a.name}" aponta uma predecessora que não existe mais.`);
      if (seen.has(link.activityId)) fail(`${label}"${a.name}" repete a mesma predecessora.`);
      seen.add(link.activityId);
    }
  }
  if (topologicalOrder(activities).length !== activities.length) fail(`${label}As predecessoras formam um ciclo: um serviço acaba dependendo de si mesmo.`);
}

/** Valida e normaliza o documento vindo do navegador. Lança `Error` com mensagem para o usuário. */
export function validatePlanDocument(input: unknown): LongTermPlanDocument {
  if (!isObject(input)) fail('Plano inválido.');
  const body = input as Record<string, unknown>;
  const floorCount = integer(body.floorCount, 'Número de pavimentos', 1, LIMITS.floors);
  const floorNames: Record<string, string> = {};
  if (body.floorNames !== undefined) {
    if (!isObject(body.floorNames)) fail('Nomes dos pavimentos inválidos.');
    for (const [key, value] of Object.entries(body.floorNames as Record<string, unknown>)) {
      const floor = Number(key);
      if (!Number.isInteger(floor) || floor < 1 || floor > floorCount) continue;
      const name = text(value, `Nome do pavimento ${floor}`, 60, false);
      if (name) floorNames[String(floor)] = name;
    }
  }
  const activities = list(body.activities, 'Serviços', LIMITS.activities).map((a, i) => readActivity(a, floorCount, i));
  checkNetwork(activities);
  const ids = new Set(activities.map(a => a.id));
  const baselines = list(body.baselines, 'Linhas de base', LIMITS.baselines).map((raw, i) => {
    if (!isObject(raw)) return fail(`Linha de base ${i + 1} inválida.`);
    const b = raw as Record<string, unknown>;
    const name = text(b.name, `Linha de base ${i + 1}`)!;
    // A linha de base é uma foto: pode citar pavimentos que o plano atual já não tem.
    const frozen = list(b.activities, `Linha de base "${name}"`, LIMITS.activities).map((a, j) => readActivity(a, LIMITS.floors, j));
    checkNetwork(frozen, `Linha de base "${name}": `);
    const createdAt = typeof b.createdAt === 'string' && !Number.isNaN(Date.parse(b.createdAt)) ? b.createdAt : fail(`Linha de base "${name}": data de criação inválida.`);
    return { id: text(b.id, `Linha de base "${name}" (id)`, 80)!, name, createdAt, createdBy: text(b.createdBy, `Linha de base "${name}" (autor)`, 80)!, activities: frozen };
  });
  const numbers = new Set<number>();
  const measurements = list(body.measurements, 'Medições', LIMITS.measurements).map((raw, i) => {
    if (!isObject(raw)) return fail(`Medição ${i + 1} inválida.`);
    const m = raw as Record<string, unknown>;
    const numberValue = integer(m.number, `Medição ${i + 1}, número`, 1, 100_000);
    if (numbers.has(numberValue)) fail(`Medição #${numberValue} repetida.`);
    numbers.add(numberValue);
    const createdAt = typeof m.createdAt === 'string' && !Number.isNaN(Date.parse(m.createdAt)) ? m.createdAt : fail(`Medição #${numberValue}: data de criação inválida.`);
    const items = list(m.items, `Medição #${numberValue}`, LIMITS.activities).flatMap((rawItem): LongTermMeasurementItem[] => {
      if (!isObject(rawItem)) return fail(`Medição #${numberValue}: item inválido.`);
      const item = rawItem as Record<string, unknown>;
      const activityId = text(item.activityId, `Medição #${numberValue}, serviço`, 80)!;
      if (!ids.has(activityId)) return []; // serviço excluído depois: a medição dele sai junto
      const note = text(item.note, `Medição #${numberValue}, observação`, 500, false);
      return [{ activityId, value: number(item.value, `Medição #${numberValue}, valor`, 0, 1e9), ...(note ? { note } : {}) }];
    });
    return { id: text(m.id, `Medição #${numberValue} (id)`, 80)!, number: numberValue, date: date(m.date, `Medição #${numberValue}, data`), createdAt, createdBy: text(m.createdBy, `Medição #${numberValue} (autor)`, 80)!, items };
  });
  return { floorCount, floorNames, activities, baselines, measurements };
}
export const isPlanError = (error: unknown): error is Error => error instanceof PlanError;

// ─── Arquivo da ferramenta antiga ───────────────────────────────────────────────

/** Converte o `.plp.json` exportado pelo "Planejamento de Longo Prazo" do App-ATR (chaves em
 * português, predecessora única nos arquivos mais antigos) para o documento atual, e valida. */
export function fromLegacyProject(input: unknown): LongTermPlanDocument {
  if (!isObject(input) || !Array.isArray(input.atividades)) fail('Arquivo não reconhecido: esperava um plano exportado do sistema ou da ferramenta antiga.');
  const legacy = input as Record<string, unknown>;
  const activity = (raw: unknown): unknown => {
    if (!isObject(raw)) return raw;
    const a = raw as Record<string, unknown>;
    const links = Array.isArray(a.predecessoras) && a.predecessoras.length ? a.predecessoras as Record<string, unknown>[]
      : a.predecessoraId ? [{ atividadeId: a.predecessoraId, lagDias: a.lagDias, pavimento: a.predecessoraPavimento }] : [];
    return {
      id: a.id, name: a.nome, color: a.cor, firstFloor: a.paviInicial, lastFloor: a.paviFinal, start: a.dataInicio,
      duration: a.duracaoLocal, interval: a.intervalo, visible: a.visivel !== false,
      floorDurations: isObject(a.duracoesPorPavimento) ? Object.fromEntries(Object.entries(a.duracoesPorPavimento).map(([k, v]) => [String(k), v])) : undefined,
      predecessors: links.map(l => ({ activityId: l.atividadeId, lagDays: l.lagDias ?? 0, floor: l.pavimento ?? undefined })),
      teams: Array.isArray(a.equipes) ? (a.equipes as Record<string, unknown>[]).map(t => ({ name: t.nome, size: t.quantidade })) : [],
      unit: a.unidadeMedida || undefined, plannedTotal: a.totalPrevisto ?? undefined,
    };
  };
  const baselines = Array.isArray(legacy.baselines) ? (legacy.baselines as Record<string, unknown>[]).map(b => ({
    id: b.id, name: b.nome, createdAt: b.criadoEm, createdBy: 'importado', activities: Array.isArray(b.atividades) ? b.atividades.map(activity) : [],
  })) : [];
  const measurements = Array.isArray(legacy.rodadasMedicao) ? (legacy.rodadasMedicao as Record<string, unknown>[]).map(m => ({
    id: m.id, number: m.numero, date: m.data, createdAt: m.criadoEm, createdBy: 'importado',
    items: Array.isArray(m.itens) ? (m.itens as Record<string, unknown>[]).map(i => ({ activityId: i.atividadeId, value: i.valor, note: i.observacao })) : [],
  })) : [];
  return validatePlanDocument({ floorCount: legacy.numPavimentos, floorNames: legacy.nomePavimentos ?? {}, activities: (legacy.atividades as unknown[]).map(activity), baselines, measurements });
}
/** Aceita o arquivo exportado por este sistema ou o da ferramenta antiga. */
export function readPlanFile(input: unknown): LongTermPlanDocument {
  if (isObject(input) && Array.isArray(input.atividades)) return fromLegacyProject(input);
  if (isObject(input) && isObject(input.document)) return validatePlanDocument(input.document);
  return validatePlanDocument(input);
}

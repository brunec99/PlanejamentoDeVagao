/** Linha de Balanço no estilo Prevision (04/11/2026, modelo aprovado): o cronograma de longo prazo
 * como uma atividade por serviço × local, com dependências, linhas de base e medições com fotos.
 * Difere do Planejador (`long-term-plan.ts`), em que cada serviço é uma fórmula (início + ritmo ×
 * pavimento): aqui cada bloco tem data própria, pode atrasar sozinho e é medido sozinho.
 *
 * Tudo em dias úteis (segunda a sexta, sem feriados nesta etapa), em datas AAAA-MM-DD tratadas em
 * UTC para não escorregar de fuso. Os dados vivem fora do snapshot do planejamento (migração 0038),
 * como a Terminalidade: a ausência das tabelas derruba só estas visões da aba 1. */
import { NON_FULFILLMENT_CAUSES } from './entities';
import {
  addDays,
  daysBetween,
  isLocalDate,
  toMs,
  type LocalDate,
  type LongTermPlanDocument,
  floorSchedule,
  floorLabel,
} from './long-term-plan';
import { SERIES_COLORS } from '../shared/palette';

export type { LocalDate };
export type LobId = string;
type Stamped = { id: LobId; createdAt: string; updatedAt: string };

// ─── Entidades ──────────────────────────────────────────────────────────────────

/** Local da obra na Linha de Balanço ("Térreo", "5º pavimento", "Cobertura"); `orderIndex` dá a
 * ordem de baixo para cima. É um cadastro próprio: o dos vagões (`Location`) não tem ordem. */
export interface LobLocal extends Stamped {
  workId: LobId;
  name: string;
  orderIndex: number;
}
/** Serviço (o "pacote de trabalho" do Prevision) da obra: nome, cor, equipe e unidade. Nasce no
 * lançamento de um fluxo ou à mão; a cor é a identidade dos blocos no gráfico. */
export interface LobService extends Stamped {
  workId: LobId;
  name: string;
  color: string;
  team?: string;
  unit?: string;
  orderIndex: number;
}
/** Um bloco: o serviço num local, com início (dia útil) e duração em dias úteis. */
export interface LobActivity extends Stamped {
  workId: LobId;
  serviceId: LobId;
  localId: LobId;
  start: LocalDate;
  durationDays: number;
  /** Datas reais (regra 22): preenchidas pela medição, corrigíveis à mão. */
  actualStart?: LocalDate;
  actualFinish?: LocalDate;
  notes?: string;
  /** Lançamento que criou o bloco, quando veio de um fluxo. */
  launchId?: LobId;
}
/** Dependência término → início, com espera em dias úteis (negativa = antecipação). `crew` é a
 * ligação "equipe segue": o mesmo serviço no local seguinte, criada pelo ritmo do lançamento. */
export type LobDependencyKind = 'fs' | 'crew';
export interface LobDependency {
  id: LobId;
  workId: LobId;
  predecessorId: LobId;
  successorId: LobId;
  lagDays: number;
  kind: LobDependencyKind;
  createdAt: string;
}
export interface LobBaselineEntry {
  activityId: LobId;
  serviceId: LobId;
  localId: LobId;
  start: LocalDate;
  durationDays: number;
}
/** Foto das datas de todos os blocos. `automatic` = gravada pelo sistema antes de um lançamento. */
export interface LobBaseline {
  id: LobId;
  workId: LobId;
  name: string;
  automatic: boolean;
  createdBy: LobId;
  createdAt: string;
  snapshot: LobBaselineEntry[];
}
export type LobRhythm = { kind: 'continuous' } | { kind: 'takt'; days: number } | { kind: 'together' };
export type LobDirection = 'bottom_up' | 'top_down';
export interface LobLaunchParams {
  localIds: LobId[];
  start: LocalDate;
  direction: LobDirection;
  rhythm: LobRhythm;
}
/** Registro de um lançamento de fluxo na obra (de onde vieram os blocos e com que parâmetros). */
export interface LobLaunch {
  id: LobId;
  workId: LobId;
  flowId?: LobId;
  flowName: string;
  params: LobLaunchParams;
  activityCount: number;
  launchedBy: LobId;
  launchedAt: string;
}
export type LobMeasurementStatus = 'open' | 'closed';
/** Rodada de medição: numerada, com data; `open` é o rascunho em preenchimento (só um por obra). */
export interface LobMeasurement extends Stamped {
  workId: LobId;
  number: number;
  date: LocalDate;
  status: LobMeasurementStatus;
  note?: string;
  createdBy: LobId;
  closedAt?: string;
  closedBy?: LobId;
}
/** O acumulado realizado (%) de um bloco numa rodada. `previousValue` é o que valia antes da
 * rodada, para saber se houve avanço (e exigir foto). */
export interface LobMeasurementItem extends Stamped {
  measurementId: LobId;
  workId: LobId;
  activityId: LobId;
  value: number;
  previousValue: number;
  note?: string;
  delayCause?: string;
  createdBy: LobId;
}
/** Item de custo apropriado (11/11/2026, IDP ponderado por custo): uma linha do orçamento da obra
 * ligada a um pacote de serviço. O custo do pacote é a soma dos itens dele; item sem pacote fica
 * "não apropriado" e não entra no peso. Um pacote com um item só é o caso de quem digita o custo
 * direto na linha do pacote. Valores em reais, com duas casas. */
export interface LobCostItem extends Stamped {
  workId: LobId;
  serviceId?: LobId;
  /** Código do item no orçamento, quando houver. */
  code?: string;
  description: string;
  amount: number;
  orderIndex: number;
  createdBy: LobId;
}
export interface LobPhoto {
  id: LobId;
  itemId: LobId;
  measurementId: LobId;
  workId: LobId;
  activityId: LobId;
  storagePath: string;
  thumbPath: string;
  width?: number;
  height?: number;
  bytes?: number;
  createdBy: LobId;
  createdAt: string;
  /** URLs assinadas, preenchidas só na resposta do GET. */
  url?: string;
  thumbUrl?: string;
}
export interface LobData {
  locals: LobLocal[];
  services: LobService[];
  activities: LobActivity[];
  dependencies: LobDependency[];
  baselines: LobBaseline[];
  launches: LobLaunch[];
  measurements: LobMeasurement[];
  items: LobMeasurementItem[];
  photos: LobPhoto[];
  /** Itens de custo apropriados (migração 0044). Vazio antes da migração ou sem custo cadastrado. */
  costs: LobCostItem[];
}
export const emptyLobData = (): LobData => ({
  locals: [],
  services: [],
  activities: [],
  dependencies: [],
  baselines: [],
  launches: [],
  measurements: [],
  items: [],
  photos: [],
  costs: [],
});
/** Acesso aos custos na resposta: `full` = valores em reais; `masked` = perfil de consulta, que recebe
 * cada item como porcentagem do total (regra 9 do modelo do IDP: o peso continua o mesmo, o valor em
 * reais nunca sai do servidor); `unavailable` = migração 0044 ainda não aplicada. */
export type LobCostAccess = 'full' | 'masked' | 'unavailable';
/** Resposta de GET /api/lob. `available: false` = migração 0038 ainda não aplicada. */
export type LobResponse = ({ available: true; costAccess?: LobCostAccess } & LobData) | { available: false };

// ─── Fluxos de serviços (o macrofluxo do Prevision) ─────────────────────────────

export interface FlowService {
  id: string;
  name: string;
  color: string;
  durationDays: number;
  team?: string;
  unit?: string;
  predecessors: { serviceId: string; lagDays: number }[];
}
/** Molde da empresa (regra 3): criado uma vez, lançado em qualquer obra. Editado como um todo, com
 * trava de revisão como o plano de longo prazo. */
export interface ServiceFlow {
  id: LobId;
  name: string;
  direction: LobDirection;
  services: FlowService[];
  revision: number;
  createdBy: LobId;
  createdAt: string;
  updatedBy: LobId;
  updatedAt: string;
  /** Nomes das obras em que o fluxo já foi lançado; preenchido pela API. */
  usedIn?: string[];
}
export type ServiceFlowDocument = Pick<ServiceFlow, 'name' | 'direction' | 'services'>;

export const LOB_COLORS: readonly string[] = SERIES_COLORS;
export const LOB_UNITS = ['%', 'm²', 'm', 'm³', 'apartamento', 'laje', 'unidade'];
export const LOB_LIMITS = {
  locals: 300,
  services: 200,
  activities: 20000,
  name: 120,
  notes: 2000,
  durationDays: 730,
  lagDays: 365,
  taktDays: 365,
  baselines: 100,
  flowServices: 200,
  /** Fotos por bloco em cada medição (regra 21). */
  maxPhotosPerItem: 6,
  maxPhotoBytes: 2 * 1024 * 1024,
  maxThumbBytes: 300 * 1024,
  /** Atividades futuras listadas na medição: até 12 meses depois da data (regra 19). */
  futureMonths: 12,
  /** Previsto até hoje menos medido, em pontos percentuais, a partir do qual o bloco conta como atrasado. */
  lateThreshold: 10,
  /** Itens de custo por obra e por gravação (apropriação de custos, 11/11/2026). */
  costItems: 5000,
  costBatch: 3000,
  costDescription: 200,
  costCode: 40,
  /** Teto de um item de custo, em reais (um trilhão): barra valor colado com lixo. */
  maxCostAmount: 1_000_000_000_000,
} as const;
export const DELAY_CAUSES: readonly string[] = NON_FULFILLMENT_CAUSES.filter(c => c !== 'Causa não informada');

/** Caminhos no bucket `medicoes`: `<obra>/<item>/<foto>.jpg` e a miniatura. */
export const lobPhotoPaths = (workId: string, itemId: string, photoId: string) => ({
  storagePath: `${workId}/${itemId}/${photoId}.jpg`,
  thumbPath: `${workId}/${itemId}/${photoId}-thumb.jpg`,
});

// ─── Dias úteis ─────────────────────────────────────────────────────────────────

export const weekday = (date: LocalDate) => new Date(toMs(date)).getUTCDay();
export const isWorkday = (date: LocalDate) => {
  const d = weekday(date);
  return d !== 0 && d !== 6;
};
/** O próprio dia, se útil; senão a segunda-feira seguinte. */
export function nextWorkday(date: LocalDate): LocalDate {
  let d = date;
  while (!isWorkday(d)) d = addDays(d, 1);
  return d;
}
export function previousWorkday(date: LocalDate): LocalDate {
  let d = date;
  while (!isWorkday(d)) d = addDays(d, -1);
  return d;
}
/** `n` dias úteis depois de `date` (negativo: antes). Parte de um dia útil; zero devolve o próprio. */
export function addWorkdays(date: LocalDate, n: number): LocalDate {
  let d = nextWorkday(date);
  const step = n < 0 ? -1 : 1;
  for (let k = 0; k < Math.abs(n);) {
    d = addDays(d, step);
    if (isWorkday(d)) k++;
  }
  return d;
}
/** Dias úteis em [from, to): zero quando `to` não passa de `from`. */
export function workdaysBetween(from: LocalDate, to: LocalDate): number {
  if (to <= from) return 0;
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) if (isWorkday(d)) n++;
  return n;
}
/** Primeiro dia útil livre depois do bloco (fim exclusivo): é onde a sucessora encaixa. */
export const activityEnd = (a: Pick<LobActivity, 'start' | 'durationDays'>): LocalDate => addWorkdays(a.start, a.durationDays);
/** Último dia trabalhado, o que se mostra como término. */
export const activityFinish = (a: Pick<LobActivity, 'start' | 'durationDays'>): LocalDate => addWorkdays(a.start, a.durationDays - 1);

// ─── Rede e reprogramação ───────────────────────────────────────────────────────

const maxDate = (a: LocalDate, b: LocalDate) => (a > b ? a : b);

/** Predecessoras de cada bloco. */
export function predecessorsOf(dependencies: LobDependency[]) {
  const map = new Map<LobId, LobDependency[]>();
  for (const d of dependencies) {
    const list = map.get(d.successorId) ?? [];
    list.push(d);
    map.set(d.successorId, list);
  }
  return map;
}
export function successorsOf(dependencies: LobDependency[]) {
  const map = new Map<LobId, LobDependency[]>();
  for (const d of dependencies) {
    const list = map.get(d.predecessorId) ?? [];
    list.push(d);
    map.set(d.predecessorId, list);
  }
  return map;
}
/** Ordem topológica dos blocos (predecessoras antes). Blocos presos num ciclo ficam de fora. */
export function topologicalActivities(activities: LobActivity[], dependencies: LobDependency[]): LobActivity[] {
  const ids = new Set(activities.map(a => a.id));
  const pending = new Map<LobId, Set<LobId>>(activities.map(a => [a.id, new Set()]));
  for (const d of dependencies)
    if (ids.has(d.predecessorId) && ids.has(d.successorId) && d.predecessorId !== d.successorId)
      pending.get(d.successorId)!.add(d.predecessorId);
  const byId = new Map(activities.map(a => [a.id, a]));
  const order: LobActivity[] = [];
  let ready = activities.filter(a => pending.get(a.id)!.size === 0).map(a => a.id);
  while (ready.length) {
    const next: LobId[] = [];
    for (const id of ready) {
      order.push(byId.get(id)!);
      for (const [other, preds] of pending) if (preds.delete(id) && preds.size === 0) next.push(other);
    }
    ready = next;
  }
  return order;
}
/** Verdadeiro se ligar `predecessorId` → `successorId` fecharia um ciclo (o sucessor já é ancestral). */
export function wouldCycle(dependencies: LobDependency[], predecessorId: LobId, successorId: LobId): boolean {
  if (predecessorId === successorId) return true;
  const preds = predecessorsOf(dependencies);
  const seen = new Set<LobId>();
  const stack = [predecessorId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === successorId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const d of preds.get(id) ?? []) stack.push(d.predecessorId);
  }
  return false;
}
/** Início mínimo imposto pelas predecessoras; indefinido sem predecessora. */
export function minimumStart(
  activityId: LobId,
  activities: Map<LobId, LobActivity>,
  preds: Map<LobId, LobDependency[]>,
): LocalDate | undefined {
  let best: LocalDate | undefined;
  for (const d of preds.get(activityId) ?? []) {
    const p = activities.get(d.predecessorId);
    if (!p) continue;
    const candidate = addWorkdays(activityEnd(p), d.lagDays);
    if (!best || candidate > best) best = candidate;
  }
  return best;
}
/** Reprograma em cascata: só empurra para frente quem ficou antes do mínimo; folga dada à mão fica.
 * Devolve só os blocos que mudaram. */
export function cascade(activities: LobActivity[], dependencies: LobDependency[]): LobActivity[] {
  const next = new Map(activities.map(a => [a.id, { ...a }]));
  const preds = predecessorsOf(dependencies);
  const changed: LobActivity[] = [];
  for (const original of topologicalActivities(activities, dependencies)) {
    const a = next.get(original.id)!;
    const minimum = minimumStart(a.id, next, preds);
    if (minimum && minimum > a.start) {
      a.start = minimum;
      changed.push(a);
    }
  }
  return changed;
}
/** Move um bloco para `start` (regra 16): nunca antes do mínimo das predecessoras, e as sucessoras
 * são empurradas. Devolve os blocos alterados (o próprio incluído, se mudou). */
export function moveActivity(
  activities: LobActivity[],
  dependencies: LobDependency[],
  id: LobId,
  start: LocalDate,
  durationDays?: number,
): LobActivity[] {
  const byId = new Map(activities.map(a => [a.id, { ...a }]));
  const target = byId.get(id);
  if (!target) return [];
  const preds = predecessorsOf(dependencies);
  const minimum = minimumStart(id, byId, preds);
  const wanted = nextWorkday(start);
  target.start = minimum && minimum > wanted ? minimum : wanted;
  if (durationDays !== undefined) target.durationDays = durationDays;
  const list = [...byId.values()];
  const pushed = cascade(list, dependencies);
  const result = new Map(pushed.map(a => [a.id, a]));
  const original = activities.find(a => a.id === id)!;
  if (target.start !== original.start || target.durationDays !== original.durationDays) result.set(id, result.get(id) ?? target);
  return [...result.values()];
}
/** Blocos que acompanham `id` ao arrastar: todos os sucessores, direta ou indiretamente. */
export function descendants(dependencies: LobDependency[], id: LobId): Set<LobId> {
  const succ = successorsOf(dependencies);
  const seen = new Set<LobId>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    for (const d of succ.get(current) ?? [])
      if (!seen.has(d.successorId)) {
        seen.add(d.successorId);
        stack.push(d.successorId);
      }
  }
  return seen;
}

// ─── Fluxos: validação e lançamento ─────────────────────────────────────────────

export class LobError extends Error {}
const fail = (message: string): never => {
  throw new LobError(message);
};
export const isLobError = (error: unknown): error is LobError => error instanceof LobError;

/** "Térreo", "terreo" e " TÉRREO " são o mesmo nome. */
export const normalizeName = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Ordem topológica dos serviços do fluxo; ciclo = erro. */
export function flowOrder(services: FlowService[]): FlowService[] {
  const ids = new Set(services.map(s => s.id));
  const pending = new Map(
    services.map(s => [s.id, new Set(s.predecessors.map(p => p.serviceId).filter(id => ids.has(id) && id !== s.id))]),
  );
  const byId = new Map(services.map(s => [s.id, s]));
  const order: FlowService[] = [];
  let ready = services.filter(s => pending.get(s.id)!.size === 0).map(s => s.id);
  while (ready.length) {
    const next: string[] = [];
    for (const id of ready) {
      order.push(byId.get(id)!);
      for (const [other, preds] of pending) if (preds.delete(id) && preds.size === 0) next.push(other);
    }
    ready = next;
  }
  if (order.length !== services.length) fail('O fluxo tem um ciclo de predecessoras: um serviço depende, no fim, dele mesmo.');
  return order;
}
/** Travas do lançamento (regra 7): ao menos dois serviços, um só serviço inicial, sem ciclo. */
export function validateFlowForLaunch(flow: ServiceFlowDocument) {
  if (flow.services.length < 2) fail('Um fluxo precisa de ao menos dois serviços para ser lançado.');
  const initial = flow.services.filter(s => !s.predecessors.length);
  if (initial.length === 0) fail('O fluxo não tem serviço inicial: algum serviço precisa começar sem predecessora.');
  if (initial.length > 1)
    fail(`O fluxo tem ${initial.length} serviços iniciais (${initial.map(s => s.name).join(', ')}). Separe em dois fluxos ou ligue-os.`);
  const self = flow.services.find(s => s.predecessors.some(p => p.serviceId === s.id));
  if (self) fail(`"${self.name}" não pode depender dele mesmo.`);
  flowOrder(flow.services);
}
/** Confere o documento de um fluxo vindo do navegador e devolve a cópia limpa. */
export function validateFlowDocument(input: unknown): ServiceFlowDocument {
  if (!input || typeof input !== 'object') fail('Fluxo inválido.');
  const raw = input as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim() : '';
  if (!name) fail('Informe o nome do fluxo.');
  if (name.length > LOB_LIMITS.name) fail(`O nome do fluxo passa de ${LOB_LIMITS.name} caracteres.`);
  const direction: LobDirection = raw.direction === 'top_down' ? 'top_down' : 'bottom_up';
  if (!Array.isArray(raw.services)) fail('Lista de serviços do fluxo inválida.');
  const rawServices = raw.services as unknown[];
  if (rawServices.length > LOB_LIMITS.flowServices) fail(`Um fluxo aceita no máximo ${LOB_LIMITS.flowServices} serviços.`);
  const ids = new Set<string>();
  const names = new Set<string>();
  const services: FlowService[] = rawServices.map((item, index) => {
    const s = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const id = typeof s.id === 'string' && s.id ? s.id : fail(`Serviço ${index + 1} sem identificador.`);
    if (ids.has(id)) fail('Dois serviços do fluxo têm o mesmo identificador.');
    ids.add(id);
    const sName = typeof s.name === 'string' ? s.name.replace(/\s+/g, ' ').trim() : '';
    if (!sName) fail(`Informe o nome do serviço ${index + 1}.`);
    if (sName.length > LOB_LIMITS.name) fail(`O nome "${sName}" passa de ${LOB_LIMITS.name} caracteres.`);
    if (names.has(normalizeName(sName))) fail(`O serviço "${sName}" aparece duas vezes no fluxo.`);
    names.add(normalizeName(sName));
    const durationDays = Number(s.durationDays);
    if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > LOB_LIMITS.durationDays)
      fail(`Duração de "${sName}" inválida: informe de 1 a ${LOB_LIMITS.durationDays} dias úteis.`);
    const color =
      typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color.toLowerCase() : LOB_COLORS[index % LOB_COLORS.length];
    const team = typeof s.team === 'string' && s.team.trim() ? s.team.trim().slice(0, LOB_LIMITS.name) : undefined;
    const unit = typeof s.unit === 'string' && s.unit.trim() ? s.unit.trim().slice(0, 40) : undefined;
    const predecessors = Array.isArray(s.predecessors)
      ? s.predecessors.map(p => {
          const link = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
          const serviceId = typeof link.serviceId === 'string' ? link.serviceId : fail(`Predecessora inválida em "${sName}".`);
          const lagDays = link.lagDays === undefined || link.lagDays === null || link.lagDays === '' ? 0 : Number(link.lagDays);
          if (!Number.isInteger(lagDays) || Math.abs(lagDays) > LOB_LIMITS.lagDays)
            fail(`Espera inválida em "${sName}": use de −${LOB_LIMITS.lagDays} a ${LOB_LIMITS.lagDays} dias.`);
          return { serviceId, lagDays };
        })
      : [];
    return { id, name: sName, color, durationDays, team, unit, predecessors };
  });
  for (const s of services) {
    const seen = new Set<string>();
    for (const p of s.predecessors) {
      if (!ids.has(p.serviceId)) fail(`"${s.name}" depende de um serviço que não está no fluxo.`);
      if (p.serviceId === s.id) fail(`"${s.name}" não pode depender dele mesmo.`);
      if (seen.has(p.serviceId)) fail(`"${s.name}" tem a mesma predecessora duas vezes.`);
      seen.add(p.serviceId);
    }
  }
  flowOrder(services);
  return { name, direction, services };
}
/** Nível de precedência de cada serviço do fluxo (coluna da rede): 0 sem predecessora. */
export function flowLevels(services: FlowService[]): Map<string, number> {
  const level = new Map<string, number>();
  for (const s of flowOrder(services)) {
    const preds = s.predecessors.map(p => level.get(p.serviceId)).filter((v): v is number => v !== undefined);
    level.set(s.id, preds.length ? Math.max(...preds) + 1 : 0);
  }
  return level;
}

export interface LaunchPlan {
  /** Serviços novos da obra (os que já existiam pelo nome são reaproveitados). */
  services: LobService[];
  activities: LobActivity[];
  dependencies: LobDependency[];
  /** Serviço × local que já existia e foi mantido (regra 11). */
  skipped: { serviceName: string; localName: string }[];
  start?: LocalDate;
  end?: LocalDate;
}
export interface LaunchInput {
  workId: LobId;
  flow: ServiceFlowDocument;
  flowId?: LobId;
  locals: LobLocal[];
  params: LobLaunchParams;
  existing: Pick<LobData, 'services' | 'activities' | 'dependencies'>;
  launchId: LobId;
  now: string;
  newId: () => string;
}
/** Lança um fluxo (regras 8 a 12): para cada serviço, em ordem topológica, e cada local escolhido,
 * na ordem do sentido, o bloco começa no máximo entre o início pedido, o fim das predecessoras no
 * mesmo local (+ espera) e o ritmo: contínuo (a equipe passa ao local seguinte quando termina) ou
 * takt fixo (início a cada N dias úteis), os dois gravados como dependência "equipe segue". Bloco de
 * serviço que já existe no local é mantido, e as sucessoras encaixam nele. Puro: nada de banco. */
export function planLaunch(input: LaunchInput): LaunchPlan {
  const { flow, params, existing, workId, now, newId, launchId } = input;
  validateFlowForLaunch(flow);
  if (!isLocalDate(params.start)) fail('Informe a data de início do lançamento.');
  const chosen = new Set(params.localIds);
  const ordered = input.locals
    .filter(l => chosen.has(l.id))
    .sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, 'pt-BR'));
  if (!ordered.length) fail('Marque ao menos um local para lançar o fluxo.');
  if (params.direction === 'top_down') ordered.reverse();
  if (
    params.rhythm.kind === 'takt' &&
    (!Number.isInteger(params.rhythm.days) || params.rhythm.days < 1 || params.rhythm.days > LOB_LIMITS.taktDays)
  )
    fail(`Takt inválido: informe de 1 a ${LOB_LIMITS.taktDays} dias úteis.`);

  const start = nextWorkday(params.start);
  const serviceByName = new Map(existing.services.map(s => [normalizeName(s.name), s]));
  const newServices: LobService[] = [];
  let orderIndex = existing.services.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;
  const serviceOf = new Map<string, LobService>();
  for (const fs of flowOrder(flow.services)) {
    const found = serviceByName.get(normalizeName(fs.name));
    if (found) {
      serviceOf.set(fs.id, found);
      continue;
    }
    const created: LobService = {
      id: newId(),
      workId,
      name: fs.name,
      color: fs.color,
      team: fs.team,
      unit: fs.unit,
      orderIndex: orderIndex++,
      createdAt: now,
      updatedAt: now,
    };
    newServices.push(created);
    serviceByName.set(normalizeName(fs.name), created);
    serviceOf.set(fs.id, created);
  }
  const existingAt = new Map(existing.activities.map(a => [`${a.serviceId}|${a.localId}`, a]));
  const created = new Map<string, LobActivity>();
  const at = (serviceId: LobId, localId: LobId) => created.get(`${serviceId}|${localId}`) ?? existingAt.get(`${serviceId}|${localId}`);
  const activities: LobActivity[] = [];
  const dependencies: LobDependency[] = [];
  const skipped: LaunchPlan['skipped'] = [];
  const dep = (predecessorId: LobId, successorId: LobId, lagDays: number, kind: LobDependencyKind) =>
    dependencies.push({ id: newId(), workId, predecessorId, successorId, lagDays, kind, createdAt: now });
  let first: LocalDate | undefined, last: LocalDate | undefined;
  for (const fs of flowOrder(flow.services)) {
    const service = serviceOf.get(fs.id)!;
    let previous: LobActivity | undefined;
    for (const local of ordered) {
      const existingBlock = existingAt.get(`${service.id}|${local.id}`);
      if (existingBlock) {
        skipped.push({ serviceName: service.name, localName: local.name });
        previous = existingBlock;
        continue;
      }
      let st = start;
      const links: { predecessorId: LobId; lagDays: number; kind: LobDependencyKind }[] = [];
      if (previous && params.rhythm.kind !== 'together') {
        const lag = params.rhythm.kind === 'continuous' ? 0 : params.rhythm.days - previous.durationDays;
        st = maxDate(st, addWorkdays(activityEnd(previous), lag));
        links.push({ predecessorId: previous.id, lagDays: lag, kind: 'crew' });
      }
      for (const p of fs.predecessors) {
        const predService = serviceOf.get(p.serviceId);
        const predBlock = predService && at(predService.id, local.id);
        if (!predBlock) continue;
        st = maxDate(st, addWorkdays(activityEnd(predBlock), p.lagDays));
        links.push({ predecessorId: predBlock.id, lagDays: p.lagDays, kind: 'fs' });
      }
      const block: LobActivity = {
        id: newId(),
        workId,
        serviceId: service.id,
        localId: local.id,
        start: st,
        durationDays: fs.durationDays,
        launchId,
        createdAt: now,
        updatedAt: now,
      };
      activities.push(block);
      created.set(`${service.id}|${local.id}`, block);
      for (const l of links) dep(l.predecessorId, block.id, l.lagDays, l.kind);
      previous = block;
      if (!first || st < first) first = st;
      const end = activityEnd(block);
      if (!last || end > last) last = end;
    }
  }
  if (existing.activities.length + activities.length > LOB_LIMITS.activities) fail(`A obra passaria de ${LOB_LIMITS.activities} blocos.`);
  return { services: newServices, activities, dependencies, skipped, start: first, end: last };
}

// ─── Avanço, previsto e atraso ──────────────────────────────────────────────────

/** Previsto acumulado (%) do bloco até `date`, inclusive: proporção dos dias úteis decorridos. */
export function plannedPercent(a: Pick<LobActivity, 'start' | 'durationDays'>, date: LocalDate): number {
  if (date < a.start) return 0;
  const end = activityEnd(a);
  if (date >= end) return 100;
  return Math.round((100 * workdaysBetween(a.start, addDays(date, 1))) / a.durationDays);
}
export const byRound = (a: LobMeasurement, b: LobMeasurement) => a.date.localeCompare(b.date) || a.number - b.number;
/** Medições fechadas, da mais antiga à mais nova. */
export const closedMeasurements = (measurements: LobMeasurement[]) => measurements.filter(m => m.status === 'closed').sort(byRound);
export const openMeasurement = (measurements: LobMeasurement[]) => measurements.find(m => m.status === 'open');
/** A medição que ainda pode ser editada ou excluída (regra 24): a aberta ou, sem aberta, a última fechada. */
export function editableMeasurement(measurements: LobMeasurement[]): LobMeasurement | undefined {
  const open = openMeasurement(measurements);
  if (open) return open;
  const closed = closedMeasurements(measurements);
  return closed[closed.length - 1];
}
/** Acumulado medido de cada bloco: o valor da medição fechada mais recente (até `until`, inclusive). */
export function measuredPercents(measurements: LobMeasurement[], items: LobMeasurementItem[], until?: LocalDate): Record<LobId, number> {
  const result: Record<LobId, number> = {};
  const byMeasurement = new Map<LobId, LobMeasurementItem[]>();
  for (const item of items) {
    const list = byMeasurement.get(item.measurementId) ?? [];
    list.push(item);
    byMeasurement.set(item.measurementId, list);
  }
  for (const m of closedMeasurements(measurements)) {
    if (until && m.date > until) break;
    for (const item of byMeasurement.get(m.id) ?? []) result[item.activityId] = item.value;
  }
  return result;
}
/** Avanço físico da obra (regra 18): média dos blocos ponderada pela duração de cada um ou, com
 * `weights` (peso por bloco, de `lobWeights` em `lob-performance.ts`), pelo peso informado; bloco
 * fora do mapa pesa zero. */
export function physicalProgress(
  activities: LobActivity[],
  percents: Record<LobId, number>,
  weights?: ReadonlyMap<LobId, number>,
): number | undefined {
  let weight = 0,
    done = 0;
  for (const a of activities) {
    const w = weights ? (weights.get(a.id) ?? 0) : a.durationDays;
    weight += w;
    done += w * (percents[a.id] ?? 0);
  }
  return weight ? done / weight : undefined;
}
export function plannedProgress(activities: LobActivity[], date: LocalDate, weights?: ReadonlyMap<LobId, number>): number | undefined {
  let weight = 0,
    done = 0;
  for (const a of activities) {
    const w = weights ? (weights.get(a.id) ?? 0) : a.durationDays;
    weight += w;
    done += w * plannedPercent(a, date);
  }
  return weight ? done / weight : undefined;
}
/** Bloco atrasado (regra 14): previsto até hoje acima do medido, com folga de `lateThreshold` pontos
 * para a semana entre medições não marcar tudo em vermelho. */
export const isLate = (a: LobActivity, measured: number | undefined, today: LocalDate) =>
  plannedPercent(a, today) - (measured ?? 0) >= LOB_LIMITS.lateThreshold && (measured ?? 0) < 100;
/** Atraso em dias úteis: quanto do bloco falta em relação ao previsto, em dias. */
export const delayDays = (a: LobActivity, measured: number | undefined, today: LocalDate) =>
  Math.max(0, Math.round(((plannedPercent(a, today) - (measured ?? 0)) / 100) * a.durationDays));
/** Começo e fim do cronograma. */
export function lobSpan(activities: LobActivity[]) {
  if (!activities.length) return undefined;
  let start = activities[0].start,
    end = activityEnd(activities[0]);
  for (const a of activities) {
    if (a.start < start) start = a.start;
    const e = activityEnd(a);
    if (e > end) end = e;
  }
  return { start, end, finish: previousWorkday(addDays(end, -1)), days: daysBetween(start, end) };
}

// ─── Medições ───────────────────────────────────────────────────────────────────

/** Blocos medíveis numa data (regra 19): `current` = começaram até a data e não chegaram a 100%;
 * `future` = começam depois, até 12 meses; `done` = já em 100%. */
/** A mesma data `months` meses depois; no dia 31 de um mês curto, vai ao último dia dele. */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
export function measurableActivities(activities: LobActivity[], percents: Record<LobId, number>, date: LocalDate) {
  const limit = addMonths(date, LOB_LIMITS.futureMonths);
  const current: LobActivity[] = [],
    future: LobActivity[] = [],
    done: LobActivity[] = [];
  for (const a of activities) {
    const measured = percents[a.id] ?? 0;
    if (measured >= 100) done.push(a);
    else if (a.start <= date) current.push(a);
    else if (a.start <= limit) future.push(a);
  }
  return { current, future, done };
}
export function validateMeasurementValue(value: unknown, previous: number): number {
  // `Number('')` é 0: sem esta conferência, um campo em branco gravaria 0%.
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) fail('Informe o realizado acumulado.');
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) fail('O realizado acumulado vai de 0 a 100%.');
  const rounded = Math.round(n * 10) / 10;
  if (rounded < previous) fail(`O acumulado não pode ficar abaixo da medição anterior (${previous}%).`);
  return rounded;
}

// ─── Importar do Planejador (regra 2) ───────────────────────────────────────────

export interface PlannerImport {
  locals: LobLocal[];
  services: LobService[];
  activities: LobActivity[];
  dependencies: LobDependency[];
}
/** Converte o plano do Planejador em blocos: cada pavimento vira um local (de baixo para cima),
 * cada serviço um serviço da obra e cada serviço × pavimento um bloco com a data atual e a duração
 * em dias úteis. As predecessoras do plano viram dependências por pavimento em comum, e o ritmo vira
 * "equipe segue" entre pavimentos consecutivos. Só vale para obra ainda sem blocos. */
/** Devolve o nome livre: "Garagem", "Garagem (2)", "Garagem (3)"… O Planejador aceita nomes
 * repetidos, mas a Linha de Balanço tem nome único por obra (migração 0038). */
function uniqueName(name: string, used: Set<string>) {
  let candidate = name;
  for (let n = 2; used.has(normalizeName(candidate)); n++) candidate = `${name} (${n})`;
  used.add(normalizeName(candidate));
  return candidate;
}
export function fromLongTermPlan(document: LongTermPlanDocument, workId: LobId, now: string, newId: () => string): PlannerImport {
  const usedLocals = new Set<string>();
  const usedServices = new Set<string>();
  const locals: LobLocal[] = [];
  const localByFloor = new Map<number, LobLocal>();
  for (let floor = 1; floor <= document.floorCount; floor++) {
    const local: LobLocal = {
      id: newId(),
      workId,
      name: uniqueName(floorLabel(document, floor), usedLocals),
      orderIndex: floor - 1,
      createdAt: now,
      updatedAt: now,
    };
    locals.push(local);
    localByFloor.set(floor, local);
  }
  const services: LobService[] = [];
  const activities: LobActivity[] = [];
  const dependencies: LobDependency[] = [];
  const blockAt = new Map<string, LobActivity>();
  const serviceByPlan = new Map<string, LobService>();
  document.activities.forEach((planned, index) => {
    const service: LobService = {
      id: newId(),
      workId,
      name: uniqueName(planned.name, usedServices),
      color: planned.color,
      team: planned.teams[0]?.name,
      unit: planned.unit,
      orderIndex: index,
      createdAt: now,
      updatedAt: now,
    };
    services.push(service);
    serviceByPlan.set(planned.id, service);
    let previous: LobActivity | undefined;
    for (const slot of floorSchedule(planned)) {
      const local = localByFloor.get(slot.floor);
      if (!local) continue;
      const start = nextWorkday(slot.start);
      const durationDays = Math.max(1, workdaysBetween(start, slot.end));
      const block: LobActivity = {
        id: newId(),
        workId,
        serviceId: service.id,
        localId: local.id,
        start,
        durationDays,
        createdAt: now,
        updatedAt: now,
      };
      activities.push(block);
      blockAt.set(`${planned.id}|${slot.floor}`, block);
      if (previous) {
        const lag = workdaysBetween(activityEnd(previous), start) - workdaysBetween(start, activityEnd(previous));
        dependencies.push({
          id: newId(),
          workId,
          predecessorId: previous.id,
          successorId: block.id,
          lagDays: lag,
          kind: 'crew',
          createdAt: now,
        });
      }
      previous = block;
    }
  });
  for (const planned of document.activities) {
    for (const link of planned.predecessors) {
      const pred = document.activities.find(a => a.id === link.activityId);
      if (!pred) continue;
      for (let floor = Math.max(pred.firstFloor, planned.firstFloor); floor <= Math.min(pred.lastFloor, planned.lastFloor); floor++) {
        const from = blockAt.get(`${pred.id}|${floor}`),
          to = blockAt.get(`${planned.id}|${floor}`);
        if (!from || !to) continue;
        const end = activityEnd(from);
        // Folga real entre os dois blocos, em dias úteis (negativa quando se sobrepõem).
        const gap = to.start >= end ? workdaysBetween(end, to.start) : -workdaysBetween(to.start, end);
        dependencies.push({
          id: newId(),
          workId,
          predecessorId: from.id,
          successorId: to.id,
          lagDays: Math.min(Math.round((link.lagDays * 5) / 7), gap),
          kind: 'fs',
          createdAt: now,
        });
      }
    }
  }
  return { locals, services, activities, dependencies };
}

// ─── Comandos de POST /api/lob/commands ─────────────────────────────────────────

export type LobCommand =
  | { type: 'create_locals'; workId: LobId; names: string[] }
  | { type: 'rename_local'; localId: LobId; name: string }
  | { type: 'reorder_locals'; workId: LobId; localIds: LobId[] }
  | { type: 'delete_local'; localId: LobId }
  | { type: 'create_service'; workId: LobId; name: string; color?: string; team?: string; unit?: string }
  | { type: 'update_service'; serviceId: LobId; name?: string; color?: string; team?: string | null; unit?: string | null }
  | { type: 'delete_service'; serviceId: LobId }
  | { type: 'create_activity'; workId: LobId; serviceId: LobId; localId: LobId; start: LocalDate; durationDays: number }
  | {
      type: 'update_activity';
      activityId: LobId;
      start?: LocalDate;
      durationDays?: number;
      notes?: string | null;
      actualStart?: LocalDate | null;
      actualFinish?: LocalDate | null;
    }
  | { type: 'delete_activity'; activityId: LobId }
  | { type: 'add_dependency'; workId: LobId; predecessorId: LobId; successorId: LobId; lagDays: number; kind?: LobDependencyKind }
  | { type: 'update_dependency'; dependencyId: LobId; lagDays: number }
  | { type: 'remove_dependency'; dependencyId: LobId }
  /** Lança um fluxo da empresa; a rota carrega o fluxo e passa ao planejador. */
  | { type: 'launch_flow'; workId: LobId; flowId: LobId; params: LobLaunchParams }
  | { type: 'import_planner'; workId: LobId }
  | { type: 'create_baseline'; workId: LobId; name: string }
  | { type: 'restore_baseline'; baselineId: LobId }
  | { type: 'delete_baseline'; baselineId: LobId }
  | { type: 'open_measurement'; workId: LobId; measurementId: LobId; date: LocalDate }
  | { type: 'update_measurement'; measurementId: LobId; date?: LocalDate; note?: string | null }
  /** Lança ou corrige valores da medição editável; `itemId` vem do navegador para a foto subir em seguida. */
  | {
      type: 'save_items';
      measurementId: LobId;
      items: { itemId: LobId; activityId: LobId; value: number | string; note?: string | null; delayCause?: string | null }[];
    }
  | { type: 'remove_item'; itemId: LobId }
  | { type: 'close_measurement'; measurementId: LobId }
  | { type: 'delete_measurement'; measurementId: LobId }
  | {
      type: 'add_photo';
      itemId: LobId;
      photoId: LobId;
      storagePath: string;
      thumbPath: string;
      width?: number;
      height?: number;
      bytes?: number;
    }
  | { type: 'delete_photo'; photoId: LobId }
  /** Apropriação de custos (11/11/2026): grava de uma vez os itens novos ou alterados e remove os
   * excluídos. O `id` do item novo vem do navegador (UUID), como o `itemId` da medição. */
  | { type: 'save_costs'; workId: LobId; upsert: LobCostInput[]; remove: LobId[] };
/** Um item de custo como a tela manda: `serviceId` nulo = não apropriado; `amount` em reais. */
export interface LobCostInput {
  id: LobId;
  serviceId: LobId | null;
  code?: string | null;
  description: string;
  amount: number;
}

import {
  activityEnd,
  cascade,
  closedMeasurements,
  DELAY_CAUSES,
  editableMeasurement,
  fromLongTermPlan,
  isLobError,
  LOB_COLORS,
  LOB_LIMITS,
  lobPhotoPaths,
  measuredPercents,
  moveActivity,
  nextWorkday,
  normalizeName,
  openMeasurement,
  planLaunch,
  validateMeasurementValue,
  wouldCycle,
  type LobActivity,
  type LobBaseline,
  type LobCommand,
  type LobCostItem,
  type LobData,
  type LobDependency,
  type LobLaunch,
  type LobLocal,
  type LobMeasurement,
  type LobMeasurementItem,
  type LobPhoto,
  type LobService,
  type LobDirection,
  type LobRhythm,
  type LocalDate,
  type ServiceFlow,
} from '../../domain/lob';
import { isLocalDate, type LongTermPlanDocument } from '../../domain/long-term-plan';
import { formatDate } from '../../shared/format';

/** Regras da Linha de Balanço (aba 1, visões Linha de Balanço e Medições), sem banco: recebe os
 * dados atuais de UMA obra e devolve o que gravar, como `terminality-commands.ts`. A rota carrega a
 * obra, chama o planejador e só então escreve; o que o planejador recusa sai como erro com
 * mensagem pronta para a tela. */

export type LobTable = keyof LobData;
export const LOB_TABLES: readonly LobTable[] = [
  'locals',
  'services',
  'activities',
  'dependencies',
  'baselines',
  'launches',
  'measurements',
  'items',
  'photos',
  'costs',
];

export interface LobRowSet {
  locals: LobLocal[];
  services: LobService[];
  activities: LobActivity[];
  dependencies: LobDependency[];
  baselines: LobBaseline[];
  launches: LobLaunch[];
  measurements: LobMeasurement[];
  items: LobMeasurementItem[];
  photos: LobPhoto[];
  costs: LobCostItem[];
}
/** O que um comando grava. O repositório apaga (filhos antes), insere (pais antes), atualiza e,
 * por último, remove os arquivos do bucket. */
export interface LobMutation {
  workId: string;
  insert: LobRowSet;
  update: LobRowSet;
  delete: Record<LobTable, string[]>;
  removeFiles: string[];
  /** Números do comando para a tela avisar (lançamento: blocos lançados e mantidos). */
  summary?: Record<string, number>;
}
export interface LobContext {
  actorId: string;
  now: string;
  today?: string;
  newId: () => string;
}
/** O que a rota precisa carregar além da obra: o fluxo a lançar ou o plano do Planejador a importar. */
export interface LobExtras {
  flow?: ServiceFlow;
  plannerDocument?: LongTermPlanDocument;
}
export type LobTarget = { workId: string } | { table: LobTable; id: string };

export const LOB_COMMAND_TYPES = [
  'create_locals',
  'rename_local',
  'reorder_locals',
  'delete_local',
  'create_service',
  'update_service',
  'delete_service',
  'create_activity',
  'update_activity',
  'delete_activity',
  'add_dependency',
  'update_dependency',
  'remove_dependency',
  'launch_flow',
  'import_planner',
  'create_baseline',
  'restore_baseline',
  'delete_baseline',
  'open_measurement',
  'update_measurement',
  'save_items',
  'remove_item',
  'close_measurement',
  'delete_measurement',
  'add_photo',
  'delete_photo',
  'save_costs',
] as const satisfies readonly LobCommand['type'][];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BATCH_NAMES = 300;
const MAX_ITEMS = 2000;

class CommandError extends Error {}
const fail = (message: string): never => {
  throw new CommandError(message);
};
export const isLobCommandError = (error: unknown) => error instanceof CommandError || isLobError(error);

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const requiredId = (value: unknown, message: string) => (typeof value === 'string' && value ? value : fail(message));
const optionalText = (value: unknown, max: number, label: string): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return fail(`${label} inválido.`);
  if (value.length > max) fail(`${label} passa de ${max} caracteres.`);
  return value.trim();
};
const date = (value: unknown, label: string): LocalDate => (isLocalDate(value) ? value : fail(`${label} inválida.`));
const optionalDate = (value: unknown, label: string): LocalDate | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return date(value, label);
};
const integer = (value: unknown, min: number, max: number, message: string) => {
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isInteger(n) && (n as number) >= min && (n as number) <= max ? (n as number) : fail(message);
};
const color = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
function validName(value: unknown, label: string) {
  const name = text(value).replace(/\s+/g, ' ');
  if (!name) fail(`Informe o nome ${label}.`);
  if (name.length > LOB_LIMITS.name) fail(`O nome ${label} passa de ${LOB_LIMITS.name} caracteres.`);
  return name;
}
function rejectDuplicate(name: string, existing: { id: string; name: string }[], message: string, selfId?: string) {
  const key = normalizeName(name);
  if (existing.some(e => e.id !== selfId && normalizeName(e.name) === key)) fail(message);
}

// ─── Leitura do comando ─────────────────────────────────────────────────────────

function parseRhythm(value: unknown): LobRhythm {
  const r = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  if (r.kind === 'takt')
    return {
      kind: 'takt',
      days: integer(r.days, 1, LOB_LIMITS.taktDays, `Takt inválido: informe de 1 a ${LOB_LIMITS.taktDays} dias úteis.`),
    };
  if (r.kind === 'together') return { kind: 'together' };
  return { kind: 'continuous' };
}
const parseDirection = (value: unknown): LobDirection => (value === 'top_down' ? 'top_down' : 'bottom_up');

/** Texto colado do orçamento: sem espaços nas pontas nem repetidos; o limite vale depois de limpar. */
const cleanText = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
/** Arredonda a centavos pela notação decimal (1.005 → 1.01), que `Math.round(x * 100)` erra. */
function toCents(value: number) {
  const rounded = Math.round(Number(`${value}e2`));
  return (Number.isFinite(rounded) ? rounded : Math.round(value * 100)) / 100 || 0;
}

/** Itens de `save_costs` (11/11/2026, apropriação de custos): só forma e tipos; pacote, existência
 * e limite por obra ficam no planejador. O valor chega em número (a tela converte com `parseMoney`). */
function parseCosts(c: Record<string, unknown>): Pick<Extract<LobCommand, { type: 'save_costs' }>, 'upsert' | 'remove'> {
  if (!Array.isArray(c.upsert) || !Array.isArray(c.remove)) fail('Lista de itens de custo inválida.');
  const rawUpsert = c.upsert as unknown[];
  const rawRemove = c.remove as unknown[];
  if (!rawUpsert.length && !rawRemove.length) fail('Nenhum item de custo para salvar.');
  if (rawUpsert.length > LOB_LIMITS.costBatch || rawRemove.length > LOB_LIMITS.costBatch)
    fail(`Salve no máximo ${LOB_LIMITS.costBatch} itens de custo por vez.`);
  const costId = (value: unknown) => {
    const id = requiredId(value, 'Item de custo sem identificador.');
    if (!UUID.test(id)) fail('Identificador do item de custo inválido.');
    return id;
  };
  const saved = new Set<string>();
  const upsert = rawUpsert.map((raw, index) => {
    const i = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const id = costId(i.id);
    if (saved.has(id)) fail('Um item de custo aparece duas vezes na gravação. Recarregue a página.');
    saved.add(id);
    const description = cleanText(i.description);
    const code = cleanText(i.code);
    // Nas mensagens, o item pelo que a pessoa vê na tela: a descrição, o código ou a posição.
    const label = description ? `"${description.slice(0, 60)}"` : code ? `O item ${code}` : `O item ${index + 1}`;
    if (i.code !== undefined && i.code !== null && typeof i.code !== 'string') fail(`${label}: código inválido.`);
    if (code.length > LOB_LIMITS.costCode) fail(`${label}: o código passa de ${LOB_LIMITS.costCode} caracteres.`);
    if (!description) fail(`${label}: informe a descrição do item de custo.`);
    if (description.length > LOB_LIMITS.costDescription) fail(`${label}: a descrição passa de ${LOB_LIMITS.costDescription} caracteres.`);
    const serviceId = i.serviceId === undefined || i.serviceId === null || i.serviceId === '' ? null : i.serviceId;
    if (serviceId !== null && typeof serviceId !== 'string') fail(`${label}: pacote inválido.`);
    if (typeof i.amount !== 'number' || !Number.isFinite(i.amount)) fail(`${label}: valor inválido. Informe o valor em reais.`);
    if ((i.amount as number) < 0) fail(`${label}: o valor não pode ser negativo.`);
    const amount = toCents(i.amount as number);
    if (amount > LOB_LIMITS.maxCostAmount) fail(`${label}: o valor passa do teto de R$ 1 trilhão por item.`);
    return { id, serviceId: serviceId as string | null, code: code || null, description, amount };
  });
  const removed = new Set<string>();
  const remove = rawRemove.map(value => {
    const id = costId(value);
    if (saved.has(id)) fail('Um item de custo não pode ser salvo e excluído na mesma gravação. Recarregue a página.');
    if (removed.has(id)) fail('Um item de custo aparece duas vezes entre os excluídos. Recarregue a página.');
    removed.add(id);
    return id;
  });
  return { upsert, remove };
}

/** Confere forma e tipos de um comando vindo do navegador. Regras de negócio ficam no planejador. */
export function parseLobCommand(input: unknown): LobCommand {
  if (!input || typeof input !== 'object') fail('Comando inválido.');
  const c = input as Record<string, unknown>;
  const type = c.type as LobCommand['type'];
  if (!LOB_COMMAND_TYPES.includes(type)) fail('Comando desconhecido.');
  const workId = () => requiredId(c.workId, 'Obra não informada.');
  switch (type) {
    case 'create_locals': {
      if (!Array.isArray(c.names)) fail('Lista de nomes inválida.');
      const names = (c.names as unknown[]).map(v => text(v)).filter(Boolean);
      if (!names.length) fail('Informe ao menos um nome de local.');
      if (names.length > MAX_BATCH_NAMES) fail(`Cadastre no máximo ${MAX_BATCH_NAMES} locais por vez.`);
      return { type, workId: workId(), names };
    }
    case 'rename_local':
      return { type, localId: requiredId(c.localId, 'Local não informado.'), name: validName(c.name, 'do local') };
    case 'reorder_locals': {
      if (!Array.isArray(c.localIds) || !c.localIds.every(id => typeof id === 'string' && id)) fail('Ordem dos locais inválida.');
      return { type, workId: workId(), localIds: c.localIds as string[] };
    }
    case 'delete_local':
      return { type, localId: requiredId(c.localId, 'Local não informado.') };
    case 'create_service':
      return {
        type,
        workId: workId(),
        name: validName(c.name, 'do serviço'),
        color: typeof c.color === 'string' ? c.color : undefined,
        team: optionalText(c.team, LOB_LIMITS.name, 'Equipe') ?? undefined,
        unit: optionalText(c.unit, 40, 'Unidade') ?? undefined,
      };
    case 'update_service':
      return {
        type,
        serviceId: requiredId(c.serviceId, 'Serviço não informado.'),
        name: c.name === undefined ? undefined : validName(c.name, 'do serviço'),
        color: typeof c.color === 'string' ? c.color : undefined,
        team: optionalText(c.team, LOB_LIMITS.name, 'Equipe'),
        unit: optionalText(c.unit, 40, 'Unidade'),
      };
    case 'delete_service':
      return { type, serviceId: requiredId(c.serviceId, 'Serviço não informado.') };
    case 'create_activity':
      return {
        type,
        workId: workId(),
        serviceId: requiredId(c.serviceId, 'Serviço não informado.'),
        localId: requiredId(c.localId, 'Local não informado.'),
        start: date(c.start, 'Data de início'),
        durationDays: integer(
          c.durationDays,
          1,
          LOB_LIMITS.durationDays,
          `Duração inválida: informe de 1 a ${LOB_LIMITS.durationDays} dias úteis.`,
        ),
      };
    case 'update_activity':
      return {
        type,
        activityId: requiredId(c.activityId, 'Bloco não informado.'),
        start: c.start === undefined ? undefined : date(c.start, 'Data de início'),
        durationDays:
          c.durationDays === undefined
            ? undefined
            : integer(
                c.durationDays,
                1,
                LOB_LIMITS.durationDays,
                `Duração inválida: informe de 1 a ${LOB_LIMITS.durationDays} dias úteis.`,
              ),
        notes: optionalText(c.notes, LOB_LIMITS.notes, 'Observação'),
        actualStart: optionalDate(c.actualStart, 'Data de início real'),
        actualFinish: optionalDate(c.actualFinish, 'Data de término real'),
      };
    case 'delete_activity':
      return { type, activityId: requiredId(c.activityId, 'Bloco não informado.') };
    case 'add_dependency':
      return {
        type,
        workId: workId(),
        predecessorId: requiredId(c.predecessorId, 'Predecessora não informada.'),
        successorId: requiredId(c.successorId, 'Sucessora não informada.'),
        lagDays: integer(
          c.lagDays ?? 0,
          -LOB_LIMITS.lagDays,
          LOB_LIMITS.lagDays,
          `Espera inválida: use de −${LOB_LIMITS.lagDays} a ${LOB_LIMITS.lagDays} dias úteis.`,
        ),
        kind: c.kind === 'crew' ? 'crew' : 'fs',
      };
    case 'update_dependency':
      return {
        type,
        dependencyId: requiredId(c.dependencyId, 'Dependência não informada.'),
        lagDays: integer(
          c.lagDays ?? 0,
          -LOB_LIMITS.lagDays,
          LOB_LIMITS.lagDays,
          `Espera inválida: use de −${LOB_LIMITS.lagDays} a ${LOB_LIMITS.lagDays} dias úteis.`,
        ),
      };
    case 'remove_dependency':
      return { type, dependencyId: requiredId(c.dependencyId, 'Dependência não informada.') };
    case 'launch_flow': {
      const p = (c.params && typeof c.params === 'object' ? c.params : {}) as Record<string, unknown>;
      if (!Array.isArray(p.localIds) || !p.localIds.every(id => typeof id === 'string' && id)) fail('Marque os locais do lançamento.');
      return {
        type,
        workId: workId(),
        flowId: requiredId(c.flowId, 'Fluxo não informado.'),
        params: {
          localIds: [...new Set(p.localIds as string[])],
          start: date(p.start, 'Data de início'),
          direction: parseDirection(p.direction),
          rhythm: parseRhythm(p.rhythm),
        },
      };
    }
    case 'import_planner':
      return { type, workId: workId() };
    case 'create_baseline':
      return { type, workId: workId(), name: validName(c.name, 'da linha de base') };
    case 'restore_baseline':
    case 'delete_baseline':
      return { type, baselineId: requiredId(c.baselineId, 'Linha de base não informada.') };
    case 'open_measurement': {
      const measurementId = requiredId(c.measurementId, 'Medição não informada.');
      if (!UUID.test(measurementId)) fail('Identificador da medição inválido.');
      return { type, workId: workId(), measurementId, date: date(c.date, 'Data da medição') };
    }
    case 'update_measurement':
      return {
        type,
        measurementId: requiredId(c.measurementId, 'Medição não informada.'),
        date: c.date === undefined ? undefined : date(c.date, 'Data da medição'),
        note: optionalText(c.note, LOB_LIMITS.notes, 'Observação'),
      };
    case 'save_items': {
      if (!Array.isArray(c.items)) fail('Lista de lançamentos inválida.');
      const rawItems = c.items as unknown[];
      if (rawItems.length > MAX_ITEMS) fail(`Salve no máximo ${MAX_ITEMS} lançamentos por vez.`);
      const items = rawItems.map(raw => {
        const i = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const itemId = requiredId(i.itemId, 'Lançamento sem identificador.');
        if (!UUID.test(itemId)) fail('Identificador do lançamento inválido.');
        return {
          itemId,
          activityId: requiredId(i.activityId, 'Lançamento sem bloco.'),
          value: typeof i.value === 'number' || typeof i.value === 'string' ? i.value : fail('Informe o realizado acumulado.'),
          note: optionalText(i.note, LOB_LIMITS.notes, 'Observação'),
          delayCause: optionalText(i.delayCause, LOB_LIMITS.name, 'Motivo do atraso'),
        };
      });
      if (!items.length) fail('Nenhum lançamento para salvar.');
      return { type, measurementId: requiredId(c.measurementId, 'Medição não informada.'), items };
    }
    case 'remove_item':
      return { type, itemId: requiredId(c.itemId, 'Lançamento não informado.') };
    case 'close_measurement':
    case 'delete_measurement':
      return { type, measurementId: requiredId(c.measurementId, 'Medição não informada.') };
    case 'add_photo': {
      const photoId = requiredId(c.photoId, 'Identificador da foto ausente.');
      if (!UUID.test(photoId)) fail('Identificador da foto inválido.');
      const dimension = (v: unknown) => (v === undefined || v === null ? undefined : integer(v, 1, 20_000, 'Dimensão da foto inválida.'));
      return {
        type,
        itemId: requiredId(c.itemId, 'Lançamento não informado.'),
        photoId,
        storagePath: requiredId(c.storagePath, 'Caminho da foto ausente.'),
        thumbPath: requiredId(c.thumbPath, 'Caminho da miniatura ausente.'),
        width: dimension(c.width),
        height: dimension(c.height),
        bytes:
          c.bytes === undefined || c.bytes === null
            ? undefined
            : integer(c.bytes, 1, LOB_LIMITS.maxPhotoBytes, 'A foto passa do tamanho máximo.'),
      };
    }
    case 'delete_photo':
      return { type, photoId: requiredId(c.photoId, 'Foto não informada.') };
    case 'save_costs':
      return { type, workId: workId(), ...parseCosts(c) };
  }
  return fail('Comando desconhecido.');
}

/** Onde o comando atua, para a rota conferir o acesso antes de carregar a obra. */
export function lobCommandTarget(command: LobCommand): LobTarget {
  switch (command.type) {
    case 'rename_local':
    case 'delete_local':
      return { table: 'locals', id: command.localId };
    case 'update_service':
    case 'delete_service':
      return { table: 'services', id: command.serviceId };
    case 'update_activity':
    case 'delete_activity':
      return { table: 'activities', id: command.activityId };
    case 'update_dependency':
    case 'remove_dependency':
      return { table: 'dependencies', id: command.dependencyId };
    case 'restore_baseline':
    case 'delete_baseline':
      return { table: 'baselines', id: command.baselineId };
    case 'update_measurement':
    case 'save_items':
    case 'close_measurement':
    case 'delete_measurement':
      return { table: 'measurements', id: command.measurementId };
    case 'remove_item':
    case 'add_photo':
      return { table: 'items', id: command.itemId };
    case 'delete_photo':
      return { table: 'photos', id: command.photoId };
    // Os demais, inclusive `save_costs`, levam a obra no próprio comando.
    default:
      return { workId: command.workId };
  }
}

// ─── Planejamento ───────────────────────────────────────────────────────────────

const emptySet = (): LobRowSet => ({
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
const emptyMutation = (workId: string): LobMutation => ({
  workId,
  insert: emptySet(),
  update: emptySet(),
  delete: {
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
  },
  removeFiles: [],
});
const byId = <T extends { id: string }>(list: T[]) => new Map(list.map(item => [item.id, item]));
const label = (data: LobData, a: LobActivity) =>
  `${data.services.find(s => s.id === a.serviceId)?.name ?? 'Serviço'} · ${data.locals.find(l => l.id === a.localId)?.name ?? 'local'}`;

/** Aplica as mudanças de datas da cascata ao conjunto de atualização, com carimbo. */
function pushChanged(mutation: LobMutation, changed: LobActivity[], now: string) {
  for (const a of changed) {
    const existing = mutation.update.activities.find(x => x.id === a.id);
    if (existing) Object.assign(existing, { start: a.start, durationDays: a.durationDays, updatedAt: now });
    else mutation.update.activities.push({ ...a, updatedAt: now });
  }
}
/** Blocos com a atualização pendente aplicada por cima dos atuais. */
const merged = (data: LobData, mutation: LobMutation) => {
  const updates = byId(mutation.update.activities);
  return data.activities.map(a => updates.get(a.id) ?? a);
};

function snapshotBaseline(data: LobData, name: string, automatic: boolean, context: LobContext): LobBaseline {
  return {
    id: context.newId(),
    workId: data.activities[0]?.workId ?? data.locals[0]?.workId ?? data.services[0]?.workId ?? '',
    name,
    automatic,
    createdBy: context.actorId,
    createdAt: context.now,
    snapshot: data.activities.map(a => ({
      activityId: a.id,
      serviceId: a.serviceId,
      localId: a.localId,
      start: a.start,
      durationDays: a.durationDays,
    })),
  };
}

/** Medição que o comando pode alterar (regra 24); a rota já conferiu que ela é da obra. */
function editable(data: LobData, measurementId: string): LobMeasurement {
  const m = data.measurements.find(x => x.id === measurementId) ?? fail('Medição não encontrada. Recarregue a página.');
  const allowed = editableMeasurement(data.measurements);
  if (!allowed || allowed.id !== m.id) fail('Só a última medição pode ser alterada. As anteriores ficam só para consulta.');
  return m;
}
/** Acumulado que valia antes de uma medição: o da medição fechada anterior a ela. */
function previousPercents(data: LobData, measurement: LobMeasurement) {
  const others = data.measurements.filter(
    m =>
      m.id !== measurement.id &&
      m.status === 'closed' &&
      (m.date < measurement.date || (m.date === measurement.date && m.number < measurement.number)),
  );
  return measuredPercents(others, data.items);
}

/** O bloco com as datas reais preenchidas por um lançamento (regra 22), ou `undefined` se nada muda. */
function withActualDates(activity: LobActivity, value: number, date: LocalDate, now: string): LobActivity | undefined {
  const next = { ...activity, updatedAt: now };
  let changed = false;
  if (value > 0 && !next.actualStart) {
    next.actualStart = date;
    changed = true;
  }
  if (value >= 100 && !next.actualFinish) {
    next.actualFinish = date;
    if (!next.actualStart) next.actualStart = date;
    changed = true;
  }
  return changed ? next : undefined;
}

export function planLobCommand(data: LobData, command: LobCommand, context: LobContext, extras: LobExtras = {}): LobMutation {
  const today = context.today ?? context.now.slice(0, 10);
  const now = context.now;
  const workIdOf = (): string => {
    if ('workId' in command) return command.workId;
    const target = lobCommandTarget(command) as { table: LobTable; id: string };
    const row = (data[target.table] as { id: string; workId: string }[]).find(r => r.id === target.id);
    return row?.workId ?? fail('Registro não encontrado. Recarregue a página.');
  };
  const workId = workIdOf();
  const mutation = emptyMutation(workId);
  const stamp = { createdAt: now, updatedAt: now };

  switch (command.type) {
    // ─── Locais ───────────────────────────────────────────────────────────────
    case 'create_locals': {
      if (data.locals.length + command.names.length > LOB_LIMITS.locals) fail(`A obra aceita no máximo ${LOB_LIMITS.locals} locais.`);
      const seen = new Set(data.locals.map(l => normalizeName(l.name)));
      let orderIndex = data.locals.reduce((max, l) => Math.max(max, l.orderIndex), -1) + 1;
      for (const raw of command.names) {
        const name = validName(raw, 'do local');
        const key = normalizeName(name);
        if (seen.has(key)) fail(`O local "${name}" já existe.`);
        seen.add(key);
        mutation.insert.locals.push({ id: context.newId(), workId, name, orderIndex: orderIndex++, ...stamp });
      }
      return mutation;
    }
    case 'rename_local': {
      const local = data.locals.find(l => l.id === command.localId) ?? fail('Local não encontrado. Recarregue a página.');
      rejectDuplicate(command.name, data.locals, `O local "${command.name}" já existe.`, local.id);
      mutation.update.locals.push({ ...local, name: command.name, updatedAt: now });
      return mutation;
    }
    case 'reorder_locals': {
      const ids = new Set(data.locals.map(l => l.id));
      if (command.localIds.length !== ids.size || command.localIds.some(id => !ids.has(id)) || new Set(command.localIds).size !== ids.size)
        fail('A ordem não bate com os locais da obra. Recarregue a página.');
      const locals = byId(data.locals);
      command.localIds.forEach((id, index) => {
        const local = locals.get(id)!;
        if (local.orderIndex !== index) mutation.update.locals.push({ ...local, orderIndex: index, updatedAt: now });
      });
      return mutation;
    }
    case 'delete_local': {
      const local = data.locals.find(l => l.id === command.localId) ?? fail('Local não encontrado. Recarregue a página.');
      const blocks = data.activities.filter(a => a.localId === local.id).length;
      if (blocks) fail(`O local "${local.name}" tem ${blocks} ${blocks === 1 ? 'bloco' : 'blocos'}. Exclua-os antes de excluir o local.`);
      mutation.delete.locals.push(local.id);
      return mutation;
    }
    // ─── Serviços ─────────────────────────────────────────────────────────────
    case 'create_service': {
      if (data.services.length >= LOB_LIMITS.services) fail(`A obra aceita no máximo ${LOB_LIMITS.services} serviços.`);
      rejectDuplicate(command.name, data.services, `O serviço "${command.name}" já existe.`);
      mutation.insert.services.push({
        id: context.newId(),
        workId,
        name: command.name,
        color: color(command.color, LOB_COLORS[data.services.length % LOB_COLORS.length]),
        team: command.team,
        unit: command.unit,
        orderIndex: data.services.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1,
        ...stamp,
      });
      return mutation;
    }
    case 'update_service': {
      const service = data.services.find(s => s.id === command.serviceId) ?? fail('Serviço não encontrado. Recarregue a página.');
      const next = { ...service, updatedAt: now };
      if (command.name !== undefined) {
        rejectDuplicate(command.name, data.services, `O serviço "${command.name}" já existe.`, service.id);
        next.name = command.name;
      }
      if (command.color !== undefined) next.color = color(command.color, service.color);
      if (command.team !== undefined) next.team = command.team ?? undefined;
      if (command.unit !== undefined) next.unit = command.unit ?? undefined;
      mutation.update.services.push(next);
      return mutation;
    }
    case 'delete_service': {
      const service = data.services.find(s => s.id === command.serviceId) ?? fail('Serviço não encontrado. Recarregue a página.');
      const blocks = data.activities.filter(a => a.serviceId === service.id);
      const ids = new Set(blocks.map(b => b.id));
      if (data.items.some(i => ids.has(i.activityId))) fail(`"${service.name}" já tem medições registradas e não pode ser excluído.`);
      mutation.delete.activities.push(...ids);
      mutation.delete.dependencies.push(
        ...data.dependencies.filter(d => ids.has(d.predecessorId) || ids.has(d.successorId)).map(d => d.id),
      );
      mutation.delete.services.push(service.id);
      return mutation;
    }
    // ─── Blocos e dependências ────────────────────────────────────────────────
    case 'create_activity': {
      if (!data.services.some(s => s.id === command.serviceId)) fail('Serviço não encontrado. Recarregue a página.');
      if (!data.locals.some(l => l.id === command.localId)) fail('Local não encontrado. Recarregue a página.');
      if (data.activities.some(a => a.serviceId === command.serviceId && a.localId === command.localId))
        fail('Este serviço já tem um bloco neste local.');
      if (data.activities.length >= LOB_LIMITS.activities) fail(`A obra aceita no máximo ${LOB_LIMITS.activities} blocos.`);
      mutation.insert.activities.push({
        id: context.newId(),
        workId,
        serviceId: command.serviceId,
        localId: command.localId,
        start: nextWorkday(command.start),
        durationDays: command.durationDays,
        ...stamp,
      });
      return mutation;
    }
    case 'update_activity': {
      const activity = data.activities.find(a => a.id === command.activityId) ?? fail('Bloco não encontrado. Recarregue a página.');
      if (command.start !== undefined || command.durationDays !== undefined) {
        const changed = moveActivity(
          data.activities,
          data.dependencies,
          activity.id,
          command.start ?? activity.start,
          command.durationDays,
        );
        pushChanged(mutation, changed, now);
      }
      const current = mutation.update.activities.find(a => a.id === activity.id) ?? { ...activity, updatedAt: now };
      if (command.notes !== undefined) current.notes = command.notes ?? undefined;
      if (command.actualStart !== undefined) current.actualStart = command.actualStart ?? undefined;
      if (command.actualFinish !== undefined) current.actualFinish = command.actualFinish ?? undefined;
      if (current.actualStart && current.actualStart > today) fail('A data de início real não pode estar no futuro.');
      if (current.actualFinish && current.actualFinish > today) fail('A data de término real não pode estar no futuro.');
      if (current.actualStart && current.actualFinish && current.actualFinish < current.actualStart)
        fail('O término real não pode vir antes do início real.');
      if (!mutation.update.activities.some(a => a.id === activity.id)) mutation.update.activities.push(current);
      return mutation;
    }
    case 'delete_activity': {
      const activity = data.activities.find(a => a.id === command.activityId) ?? fail('Bloco não encontrado. Recarregue a página.');
      if (data.items.some(i => i.activityId === activity.id)) fail(`${label(data, activity)} já foi medido e não pode ser excluído.`);
      mutation.delete.activities.push(activity.id);
      mutation.delete.dependencies.push(
        ...data.dependencies.filter(d => d.predecessorId === activity.id || d.successorId === activity.id).map(d => d.id),
      );
      return mutation;
    }
    case 'add_dependency': {
      const pred = data.activities.find(a => a.id === command.predecessorId) ?? fail('Predecessora não encontrada. Recarregue a página.');
      const succ = data.activities.find(a => a.id === command.successorId) ?? fail('Sucessora não encontrada. Recarregue a página.');
      if (data.dependencies.some(d => d.predecessorId === pred.id && d.successorId === succ.id)) fail('Essa dependência já existe.');
      if (wouldCycle(data.dependencies, pred.id, succ.id)) fail(`Ligar ${label(data, pred)} → ${label(data, succ)} fecharia um ciclo.`);
      const dependency: LobDependency = {
        id: context.newId(),
        workId,
        predecessorId: pred.id,
        successorId: succ.id,
        lagDays: command.lagDays,
        kind: command.kind ?? 'fs',
        createdAt: now,
      };
      mutation.insert.dependencies.push(dependency);
      pushChanged(mutation, cascade(data.activities, [...data.dependencies, dependency]), now);
      return mutation;
    }
    case 'update_dependency': {
      const dependency =
        data.dependencies.find(d => d.id === command.dependencyId) ?? fail('Dependência não encontrada. Recarregue a página.');
      const next = { ...dependency, lagDays: command.lagDays };
      mutation.update.dependencies.push(next);
      pushChanged(
        mutation,
        cascade(
          data.activities,
          data.dependencies.map(d => (d.id === next.id ? next : d)),
        ),
        now,
      );
      return mutation;
    }
    case 'remove_dependency': {
      if (!data.dependencies.some(d => d.id === command.dependencyId)) fail('Dependência não encontrada. Recarregue a página.');
      mutation.delete.dependencies.push(command.dependencyId);
      return mutation;
    }
    // ─── Lançamento e importação ──────────────────────────────────────────────
    case 'launch_flow': {
      const flow = extras.flow ?? fail('Fluxo não encontrado. Ele pode ter sido excluído.');
      const known = new Set(data.locals.map(l => l.id));
      if (command.params.localIds.some(id => !known.has(id))) fail('Um dos locais marcados não existe mais. Recarregue a página.');
      const launchId = context.newId();
      const plan = planLaunch({
        workId,
        flow,
        flowId: flow.id,
        locals: data.locals,
        params: command.params,
        existing: data,
        launchId,
        now,
        newId: context.newId,
      });
      if (!plan.activities.length) fail('Nada a lançar: todos os blocos deste fluxo já existem nos locais marcados.');
      // Regra 10: antes de mexer numa obra que já tem blocos, uma foto automática.
      if (data.activities.length) {
        if (data.baselines.length >= LOB_LIMITS.baselines)
          fail(`A obra já tem ${LOB_LIMITS.baselines} linhas de base. Exclua alguma antes de lançar.`);
        const base = `Antes do lançamento ${formatDate(today)}`;
        const taken = new Set(data.baselines.map(b => normalizeName(b.name)));
        let name = base;
        for (let n = 2; taken.has(normalizeName(name)); n++) name = `${base} (${n})`;
        mutation.insert.baselines.push(snapshotBaseline(data, name, true, context));
      }
      mutation.insert.services.push(...plan.services);
      mutation.insert.activities.push(...plan.activities);
      mutation.insert.dependencies.push(...plan.dependencies);
      mutation.insert.launches.push({
        id: launchId,
        workId,
        flowId: flow.id,
        flowName: flow.name,
        params: command.params,
        activityCount: plan.activities.length,
        launchedBy: context.actorId,
        launchedAt: now,
      });
      // Regra 11: a tela diz quantos blocos entraram e quantos já existiam e foram mantidos.
      mutation.summary = { launched: plan.activities.length, skipped: plan.skipped.length };
      return mutation;
    }
    case 'import_planner': {
      const document = extras.plannerDocument ?? fail('A obra não tem plano no Planejador para importar.');
      if (!document.activities.length) fail('O Planejador desta obra está vazio: não há serviços para importar.');
      if (data.activities.length)
        fail('A importação só funciona numa Linha de Balanço sem blocos. Exclua os blocos atuais ou lance o fluxo direto.');
      const imported = fromLongTermPlan(document, workId, now, context.newId);
      // Locais e serviços já cadastrados com o mesmo nome são reaproveitados.
      const localByName = new Map(data.locals.map(l => [normalizeName(l.name), l]));
      const serviceByName = new Map(data.services.map(s => [normalizeName(s.name), s]));
      const localMap = new Map<string, string>();
      const serviceMap = new Map<string, string>();
      let localOrder = data.locals.reduce((max, l) => Math.max(max, l.orderIndex), -1) + 1;
      for (const local of imported.locals) {
        const found = localByName.get(normalizeName(local.name));
        if (found) localMap.set(local.id, found.id);
        else {
          mutation.insert.locals.push({ ...local, orderIndex: localOrder++ });
          localMap.set(local.id, local.id);
        }
      }
      let serviceOrder = data.services.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;
      for (const service of imported.services) {
        const found = serviceByName.get(normalizeName(service.name));
        if (found) serviceMap.set(service.id, found.id);
        else {
          mutation.insert.services.push({ ...service, orderIndex: serviceOrder++ });
          serviceMap.set(service.id, service.id);
        }
      }
      mutation.insert.activities.push(
        ...imported.activities.map(a => ({ ...a, serviceId: serviceMap.get(a.serviceId)!, localId: localMap.get(a.localId)! })),
      );
      mutation.insert.dependencies.push(...imported.dependencies);
      if (data.locals.length + mutation.insert.locals.length > LOB_LIMITS.locals) fail(`A obra passaria de ${LOB_LIMITS.locals} locais.`);
      return mutation;
    }
    // ─── Linhas de base ───────────────────────────────────────────────────────
    case 'create_baseline': {
      if (!data.activities.length) fail('Não há blocos para guardar numa linha de base.');
      if (data.baselines.length >= LOB_LIMITS.baselines) fail(`A obra aceita no máximo ${LOB_LIMITS.baselines} linhas de base.`);
      rejectDuplicate(command.name, data.baselines, `Já existe uma linha de base chamada "${command.name}".`);
      mutation.insert.baselines.push({ ...snapshotBaseline(data, command.name, false, context), workId });
      return mutation;
    }
    case 'restore_baseline': {
      const baseline = data.baselines.find(b => b.id === command.baselineId) ?? fail('Linha de base não encontrada. Recarregue a página.');
      const entries = byId(baseline.snapshot.map(e => ({ id: e.activityId, ...e })));
      const restored = data.activities.map(a => {
        const e = entries.get(a.id);
        return e ? { ...a, start: e.start, durationDays: e.durationDays } : a;
      });
      const changed = restored.filter((a, i) => a.start !== data.activities[i].start || a.durationDays !== data.activities[i].durationDays);
      if (!changed.length) fail('Os blocos já estão como nesta linha de base.');
      pushChanged(mutation, changed, now);
      pushChanged(mutation, cascade(restored, data.dependencies), now);
      return mutation;
    }
    case 'delete_baseline': {
      if (!data.baselines.some(b => b.id === command.baselineId)) fail('Linha de base não encontrada. Recarregue a página.');
      mutation.delete.baselines.push(command.baselineId);
      return mutation;
    }
    // ─── Medições ─────────────────────────────────────────────────────────────
    case 'open_measurement': {
      if (openMeasurement(data.measurements)) fail('Já existe uma medição em aberto. Salve ou exclua a atual antes de abrir outra.');
      if (data.measurements.some(m => m.id === command.measurementId)) fail('Esta medição já foi registrada.');
      if (command.date > today) fail('A data da medição não pode estar no futuro.');
      const closed = closedMeasurements(data.measurements);
      const last = closed[closed.length - 1];
      if (last && command.date < last.date) fail(`A data não pode ser anterior à medição #${last.number} (${formatDate(last.date)}).`);
      if (!data.activities.length) fail('Não há blocos para medir: lance um fluxo primeiro.');
      mutation.insert.measurements.push({
        id: command.measurementId,
        workId,
        number: data.measurements.reduce((max, m) => Math.max(max, m.number), 0) + 1,
        date: command.date,
        status: 'open',
        createdBy: context.actorId,
        ...stamp,
      });
      return mutation;
    }
    case 'update_measurement': {
      const m = editable(data, command.measurementId);
      const next = { ...m, updatedAt: now };
      if (command.date !== undefined && command.date !== m.date) {
        if (m.status === 'closed') fail('A data de uma medição salva não muda. Se estiver errada, exclua a medição e lance de novo.');
        if (command.date > today) fail('A data da medição não pode estar no futuro.');
        const closed = closedMeasurements(data.measurements).filter(x => x.id !== m.id);
        const last = closed[closed.length - 1];
        if (last && command.date < last.date) fail(`A data não pode ser anterior à medição #${last.number} (${formatDate(last.date)}).`);
        next.date = command.date;
      }
      if (command.note !== undefined) next.note = command.note ?? undefined;
      mutation.update.measurements.push(next);
      return mutation;
    }
    case 'save_items': {
      const m = editable(data, command.measurementId);
      const previous = previousPercents(data, m);
      const existing = new Map(data.items.filter(i => i.measurementId === m.id).map(i => [i.activityId, i]));
      const seen = new Set<string>();
      for (const input of command.items) {
        const activity =
          data.activities.find(a => a.id === input.activityId) ?? fail('Um dos blocos não existe mais. Recarregue a página.');
        if (seen.has(activity.id)) fail(`${label(data, activity)} aparece duas vezes no lançamento.`);
        seen.add(activity.id);
        const before = previous[activity.id] ?? 0;
        let value: number;
        try {
          value = validateMeasurementValue(input.value, before);
        } catch (error) {
          fail(`${label(data, activity)}: ${error instanceof Error ? error.message : 'valor inválido.'}`);
        }
        if (input.delayCause && !DELAY_CAUSES.includes(input.delayCause)) fail(`Motivo do atraso desconhecido: "${input.delayCause}".`);
        const current = existing.get(activity.id);
        if (current) {
          mutation.update.items.push({
            ...current,
            value: value!,
            previousValue: before,
            note: input.note === undefined ? current.note : (input.note ?? undefined),
            delayCause: input.delayCause === undefined ? current.delayCause : (input.delayCause ?? undefined),
            updatedAt: now,
          });
        } else {
          if (data.items.some(i => i.id === input.itemId)) fail('Este lançamento já foi registrado. Recarregue a página.');
          mutation.insert.items.push({
            id: input.itemId,
            measurementId: m.id,
            workId,
            activityId: activity.id,
            value: value!,
            previousValue: before,
            note: input.note ?? undefined,
            delayCause: input.delayCause ?? undefined,
            createdBy: context.actorId,
            ...stamp,
          });
        }
      }
      if (m.status === 'closed') {
        mutation.update.measurements.push({ ...m, updatedAt: now });
        // Regra 22: corrigir a última medição salva preenche as datas reais como o fechamento faria.
        for (const item of [...mutation.insert.items, ...mutation.update.items]) {
          const activity = data.activities.find(a => a.id === item.activityId);
          if (!activity) continue;
          const next = withActualDates(activity, item.value, m.date, now);
          if (next) mutation.update.activities.push(next);
        }
      }
      return mutation;
    }
    case 'remove_item': {
      const item = data.items.find(i => i.id === command.itemId) ?? fail('Lançamento não encontrado. Recarregue a página.');
      editable(data, item.measurementId);
      const photos = data.photos.filter(p => p.itemId === item.id);
      mutation.delete.photos.push(...photos.map(p => p.id));
      mutation.removeFiles.push(...photos.flatMap(p => [p.storagePath, p.thumbPath]));
      mutation.delete.items.push(item.id);
      return mutation;
    }
    case 'close_measurement': {
      const m = data.measurements.find(x => x.id === command.measurementId) ?? fail('Medição não encontrada. Recarregue a página.');
      if (m.status !== 'open') fail('Esta medição já foi salva.');
      const items = data.items.filter(i => i.measurementId === m.id);
      if (!items.length) fail('Lance o realizado de ao menos um bloco antes de salvar a medição.');
      // Regra 21: avanço sem foto não fecha a medição.
      const activities = byId(data.activities);
      const missing = items
        .filter(i => i.value > i.previousValue && !data.photos.some(p => p.itemId === i.id))
        .map(i => activities.get(i.activityId))
        .filter((a): a is LobActivity => !!a)
        .map(a => label(data, a));
      if (missing.length)
        fail(
          missing.length === 1
            ? `Avanço sem foto: ${missing[0]}. Tire ao menos uma foto do que avançou.`
            : `${missing.length} avanços sem foto: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}. Tire ao menos uma foto de cada um.`,
        );
      // Regra 22: início real no primeiro avanço, término real no 100%; o que já existe fica.
      for (const item of items) {
        const activity = activities.get(item.activityId);
        if (!activity) continue;
        const next = withActualDates(activity, item.value, m.date, now);
        if (next) mutation.update.activities.push(next);
      }
      mutation.update.measurements.push({ ...m, status: 'closed', closedAt: now, closedBy: context.actorId, updatedAt: now });
      return mutation;
    }
    case 'delete_measurement': {
      const m = editable(data, command.measurementId);
      const items = data.items.filter(i => i.measurementId === m.id);
      const itemIds = new Set(items.map(i => i.id));
      const photos = data.photos.filter(p => itemIds.has(p.itemId));
      mutation.delete.photos.push(...photos.map(p => p.id));
      mutation.removeFiles.push(...photos.flatMap(p => [p.storagePath, p.thumbPath]));
      mutation.delete.items.push(...itemIds);
      mutation.delete.measurements.push(m.id);
      // As datas reais que vieram desta medição (iguais à data dela) saem junto, a menos que outra
      // medição salva sustente a mesma data: com o lançamento apagado, elas apontariam para o nada.
      const others = data.measurements.filter(x => x.id !== m.id && x.status === 'closed');
      const remaining = measuredPercents(others, data.items);
      for (const item of items) {
        const activity = data.activities.find(a => a.id === item.activityId);
        if (!activity) continue;
        const next = { ...activity, updatedAt: now };
        let changed = false;
        if (activity.actualStart === m.date && !(remaining[activity.id] > 0)) {
          next.actualStart = undefined;
          changed = true;
        }
        if (activity.actualFinish === m.date && !(remaining[activity.id] >= 100)) {
          next.actualFinish = undefined;
          changed = true;
        }
        if (changed) mutation.update.activities.push(next);
      }
      return mutation;
    }
    case 'add_photo': {
      const item =
        data.items.find(i => i.id === command.itemId) ?? fail('Lançamento não encontrado. Salve o valor antes de anexar a foto.');
      editable(data, item.measurementId);
      if (data.photos.some(p => p.id === command.photoId)) fail('Esta foto já foi registrada.');
      const count = data.photos.filter(p => p.itemId === item.id).length;
      if (count >= LOB_LIMITS.maxPhotosPerItem) fail(`Este bloco já tem ${LOB_LIMITS.maxPhotosPerItem} fotos nesta medição, o máximo.`);
      const expected = lobPhotoPaths(workId, item.id, command.photoId);
      if (command.storagePath !== expected.storagePath || command.thumbPath !== expected.thumbPath) fail('Caminho da foto fora do padrão.');
      mutation.insert.photos.push({
        id: command.photoId,
        itemId: item.id,
        measurementId: item.measurementId,
        workId,
        activityId: item.activityId,
        storagePath: command.storagePath,
        thumbPath: command.thumbPath,
        width: command.width,
        height: command.height,
        bytes: command.bytes,
        createdBy: context.actorId,
        createdAt: now,
      });
      return mutation;
    }
    case 'delete_photo': {
      const photo = data.photos.find(p => p.id === command.photoId) ?? fail('Foto não encontrada. Recarregue a página.');
      const m = editable(data, photo.measurementId);
      const item = data.items.find(i => i.id === photo.itemId);
      const siblings = data.photos.filter(p => p.itemId === photo.itemId && p.id !== photo.id).length;
      if (m.status === 'closed' && item && item.value > item.previousValue && siblings === 0)
        fail('Esta é a única foto de um avanço numa medição já salva. Envie outra foto antes de excluir esta.');
      mutation.delete.photos.push(photo.id);
      mutation.removeFiles.push(photo.storagePath, photo.thumbPath);
      return mutation;
    }
    // ─── Apropriação de custos ────────────────────────────────────────────────
    case 'save_costs': {
      const services = new Set(data.services.map(s => s.id));
      const existing = byId(data.costs);
      let orderIndex = data.costs.reduce((max, c) => Math.max(max, c.orderIndex), -1) + 1;
      for (const input of command.upsert) {
        if (input.serviceId !== null && !services.has(input.serviceId)) fail('Pacote não encontrado. Recarregue a página.');
        const fields = {
          serviceId: input.serviceId ?? undefined,
          code: input.code || undefined,
          description: input.description,
          amount: input.amount,
        };
        const current = existing.get(input.id);
        if (!current) {
          mutation.insert.costs.push({ id: input.id, workId, ...fields, orderIndex: orderIndex++, createdBy: context.actorId, ...stamp });
          continue;
        }
        // A tela pode mandar a grade inteira: item igual ao gravado não vira escrita.
        const same =
          (current.serviceId ?? undefined) === fields.serviceId &&
          (current.code || undefined) === fields.code &&
          current.description === fields.description &&
          current.amount === fields.amount;
        if (!same) mutation.update.costs.push({ ...current, ...fields, updatedAt: now });
      }
      for (const id of command.remove) {
        if (!existing.has(id)) fail('Item de custo não encontrado. Recarregue a página.');
        mutation.delete.costs.push(id);
      }
      const total = data.costs.length + mutation.insert.costs.length - mutation.delete.costs.length;
      if (total > LOB_LIMITS.costItems)
        fail(`A obra aceita no máximo ${LOB_LIMITS.costItems} itens de custo; com esta gravação ficaria com ${total}.`);
      mutation.summary = { saved: mutation.insert.costs.length + mutation.update.costs.length, removed: mutation.delete.costs.length };
      return mutation;
    }
  }
  return fail('Comando desconhecido.');
}

/** Fim exclusivo, exportado para a tela não recalcular com outra regra. */
export { activityEnd };

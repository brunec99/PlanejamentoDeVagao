import type {
  LobActivity,
  LobBaseline,
  LobCostItem,
  LobData,
  LobDependency,
  LobLaunch,
  LobLocal,
  LobMeasurement,
  LobMeasurementItem,
  LobPhoto,
  LobService,
  ServiceFlow,
  ServiceFlowDocument,
} from '../../../domain/lob';
import type { LobMutation, LobTable } from '../../../application/use-cases/lob-commands';
import { logRouteError } from '../../log';
import { getServiceClient } from './client';

/** Leitura e gravação da Linha de Balanço e dos fluxos (migração 0038) e dos itens de custo
 * (migração 0044). Fora do snapshot: cada tabela é lida filtrada pela obra e cada comando grava só o
 * que mudou, na ordem que mantém o banco coerente sem transação (como a Terminalidade). */

export const LOB_BUCKET = 'medicoes';
const PAGE = 1000;
const SIGNED_URL_SECONDS = 60 * 60;
const SIGN_BATCH = 200;
/** Ids por `delete ... in (...)`: a lista vai na URL, e mil UUIDs passam do limite do gateway. */
const DELETE_BATCH = 100;
/** Linhas por requisição ao gravar itens de custo (a tela cola centenas de linhas do orçamento). */
const COST_BATCH = 500;

export class LobUnavailableError extends Error {
  constructor() {
    super('Aplique a migração 0038_lob.sql no Supabase para usar a Linha de Balanço e as medições.');
    this.name = 'LobUnavailableError';
  }
}
/** Itens de custo sem a 0044 (11/11/2026): a leitura segue com `costs: []`; só a gravação recusa. */
export class LobCostsUnavailableError extends Error {
  constructor() {
    super('Aplique a migração 0044_lob_costs.sql no Supabase para apropriar custos.');
    this.name = 'LobCostsUnavailableError';
  }
}
export class LobConflictError extends Error {
  constructor(message = 'Os dados mudaram enquanto você editava. Recarregue a página e tente de novo.') {
    super(message);
    this.name = 'LobConflictError';
  }
}
const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
type DbError = { code?: string; message: string } | null;
function check(error: DbError, action: string, table?: LobTable) {
  if (!error) return;
  if (missingTable(error.code)) throw table === 'costs' ? new LobCostsUnavailableError() : new LobUnavailableError();
  if (error.code === '23505' || error.code === '23503') throw new LobConflictError();
  throw new Error(`Falha ao ${action}: ${error.message}`);
}

const TABLE_NAMES: Record<LobTable, string> = {
  locals: 'lob_locals',
  services: 'lob_services',
  activities: 'lob_activities',
  dependencies: 'lob_dependencies',
  baselines: 'lob_baselines',
  launches: 'lob_launches',
  measurements: 'lob_measurements',
  items: 'lob_measurement_items',
  photos: 'lob_photos',
  costs: 'lob_cost_items',
};

// ----- Linhas (snake_case) e conversões -----

type Row = Record<string, unknown>;
const opt = <T>(value: T | null | undefined) => value ?? undefined;
const s = (v: unknown) => String(v);
const n = (v: unknown) => Number(v);
const stamps = (r: Row) => ({ createdAt: s(r.created_at), updatedAt: s(r.updated_at) });

export const lobFromRow: { [T in LobTable]: (r: Row) => LobData[T][number] } = {
  locals: r => ({ id: s(r.id), workId: s(r.work_id), name: s(r.name), orderIndex: n(r.order_index), ...stamps(r) }),
  services: r => ({
    id: s(r.id),
    workId: s(r.work_id),
    name: s(r.name),
    color: s(r.color),
    team: opt(r.team as string | null),
    unit: opt(r.unit as string | null),
    orderIndex: n(r.order_index),
    ...stamps(r),
  }),
  activities: r => ({
    id: s(r.id),
    workId: s(r.work_id),
    serviceId: s(r.service_id),
    localId: s(r.local_id),
    start: s(r.start_on).slice(0, 10),
    durationDays: n(r.duration_days),
    actualStart: r.actual_start ? s(r.actual_start).slice(0, 10) : undefined,
    actualFinish: r.actual_finish ? s(r.actual_finish).slice(0, 10) : undefined,
    notes: opt(r.notes as string | null),
    launchId: opt(r.launch_id as string | null),
    ...stamps(r),
  }),
  dependencies: r => ({
    id: s(r.id),
    workId: s(r.work_id),
    predecessorId: s(r.predecessor_id),
    successorId: s(r.successor_id),
    lagDays: n(r.lag_days),
    kind: r.kind === 'crew' ? 'crew' : 'fs',
    createdAt: s(r.created_at),
  }),
  baselines: r => ({
    id: s(r.id),
    workId: s(r.work_id),
    name: s(r.name),
    automatic: !!r.automatic,
    createdBy: s(r.created_by),
    createdAt: s(r.created_at),
    snapshot: Array.isArray(r.snapshot) ? (r.snapshot as LobBaseline['snapshot']) : [],
  }),
  launches: r => ({
    id: s(r.id),
    workId: s(r.work_id),
    flowId: opt(r.flow_id as string | null),
    flowName: s(r.flow_name),
    params: (r.params ?? {}) as LobLaunch['params'],
    activityCount: n(r.activity_count),
    launchedBy: s(r.launched_by),
    launchedAt: s(r.launched_at),
  }),
  measurements: r => ({
    id: s(r.id),
    workId: s(r.work_id),
    number: n(r.number),
    date: s(r.measured_on).slice(0, 10),
    status: r.status === 'closed' ? 'closed' : 'open',
    note: opt(r.note as string | null),
    createdBy: s(r.created_by),
    closedAt: opt(r.closed_at as string | null),
    closedBy: opt(r.closed_by as string | null),
    ...stamps(r),
  }),
  items: r => ({
    id: s(r.id),
    measurementId: s(r.measurement_id),
    workId: s(r.work_id),
    activityId: s(r.activity_id),
    value: n(r.value),
    previousValue: n(r.previous_value),
    note: opt(r.note as string | null),
    delayCause: opt(r.delay_cause as string | null),
    createdBy: s(r.created_by),
    ...stamps(r),
  }),
  photos: r => ({
    id: s(r.id),
    itemId: s(r.item_id),
    measurementId: s(r.measurement_id),
    workId: s(r.work_id),
    activityId: s(r.activity_id),
    storagePath: s(r.storage_path),
    thumbPath: s(r.thumb_path),
    width: opt(r.width as number | null),
    height: opt(r.height as number | null),
    bytes: opt(r.bytes as number | null),
    createdBy: s(r.created_by),
    createdAt: s(r.created_at),
  }),
  costs: r => ({
    id: s(r.id),
    workId: s(r.work_id),
    serviceId: opt(r.service_id as string | null),
    code: opt(r.code as string | null),
    description: s(r.description),
    // numeric chega como texto pelo PostgREST ("1234.50").
    amount: n(r.amount),
    orderIndex: n(r.order_index),
    createdBy: s(r.created_by),
    ...stamps(r),
  }),
};

const nul = <T>(value: T | undefined) => (value === undefined ? null : value);
export const lobToRow = {
  locals: (l: LobLocal): Row => ({
    id: l.id,
    work_id: l.workId,
    name: l.name,
    order_index: l.orderIndex,
    created_at: l.createdAt,
    updated_at: l.updatedAt,
  }),
  services: (x: LobService): Row => ({
    id: x.id,
    work_id: x.workId,
    name: x.name,
    color: x.color,
    team: nul(x.team),
    unit: nul(x.unit),
    order_index: x.orderIndex,
    created_at: x.createdAt,
    updated_at: x.updatedAt,
  }),
  activities: (a: LobActivity): Row => ({
    id: a.id,
    work_id: a.workId,
    service_id: a.serviceId,
    local_id: a.localId,
    start_on: a.start,
    duration_days: a.durationDays,
    actual_start: nul(a.actualStart),
    actual_finish: nul(a.actualFinish),
    notes: nul(a.notes),
    launch_id: nul(a.launchId),
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  }),
  dependencies: (d: LobDependency): Row => ({
    id: d.id,
    work_id: d.workId,
    predecessor_id: d.predecessorId,
    successor_id: d.successorId,
    lag_days: d.lagDays,
    kind: d.kind,
    created_at: d.createdAt,
  }),
  baselines: (b: LobBaseline): Row => ({
    id: b.id,
    work_id: b.workId,
    name: b.name,
    automatic: b.automatic,
    snapshot: b.snapshot,
    created_by: b.createdBy,
    created_at: b.createdAt,
  }),
  launches: (l: LobLaunch): Row => ({
    id: l.id,
    work_id: l.workId,
    flow_id: nul(l.flowId),
    flow_name: l.flowName,
    params: l.params,
    activity_count: l.activityCount,
    launched_by: l.launchedBy,
    launched_at: l.launchedAt,
  }),
  measurements: (m: LobMeasurement): Row => ({
    id: m.id,
    work_id: m.workId,
    number: m.number,
    measured_on: m.date,
    status: m.status,
    note: nul(m.note),
    created_by: m.createdBy,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    closed_at: nul(m.closedAt),
    closed_by: nul(m.closedBy),
  }),
  items: (i: LobMeasurementItem): Row => ({
    id: i.id,
    measurement_id: i.measurementId,
    work_id: i.workId,
    activity_id: i.activityId,
    value: i.value,
    previous_value: i.previousValue,
    note: nul(i.note),
    delay_cause: nul(i.delayCause),
    created_by: i.createdBy,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  }),
  photos: (p: LobPhoto): Row => ({
    id: p.id,
    item_id: p.itemId,
    measurement_id: p.measurementId,
    work_id: p.workId,
    activity_id: p.activityId,
    storage_path: p.storagePath,
    thumb_path: p.thumbPath,
    width: nul(p.width),
    height: nul(p.height),
    bytes: nul(p.bytes),
    created_by: p.createdBy,
    created_at: p.createdAt,
  }),
  costs: (c: LobCostItem): Row => ({
    id: c.id,
    work_id: c.workId,
    service_id: nul(c.serviceId),
    code: nul(c.code),
    description: c.description,
    amount: c.amount,
    order_index: c.orderIndex,
    created_by: c.createdBy,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }),
};

const ORDER: Record<LobTable, string[]> = {
  locals: ['order_index', 'id'],
  services: ['order_index', 'id'],
  activities: ['start_on', 'id'],
  dependencies: ['created_at', 'id'],
  baselines: ['created_at', 'id'],
  launches: ['launched_at', 'id'],
  measurements: ['measured_on', 'number'],
  items: ['created_at', 'id'],
  photos: ['created_at', 'id'],
  costs: ['order_index', 'id'],
};

async function fetchWorkRows(table: LobTable, workId: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = getServiceClient().from(TABLE_NAMES[table]).select('*').eq('work_id', workId);
    for (const column of ORDER[table]) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE - 1);
    check(error, `ler ${TABLE_NAMES[table]}`, table);
    all.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return all;
  }
}

/** Itens de custo da obra, ou `null` sem a migração 0044 (a Linha de Balanço não depende deles). */
async function fetchCosts(workId: string): Promise<LobCostItem[] | null> {
  try {
    return (await fetchWorkRows('costs', workId)).map(lobFromRow.costs);
  } catch (error) {
    if (error instanceof LobCostsUnavailableError) return null;
    throw error;
  }
}

/** Tudo de uma obra, sem URLs de foto, e se a tabela de custos existe (11/11/2026): sem as tabelas
 * da 0038 lança `LobUnavailableError`, como antes; sem a 0044 devolve `costs: []` e
 * `costsAvailable: false`, para a rota responder `costAccess: 'unavailable'`. */
export async function loadLobWithCosts(workId: string): Promise<{ data: LobData; costsAvailable: boolean }> {
  const [rows, costs] = await Promise.all([Promise.all(LOB_TABLE_LIST.map(table => fetchWorkRows(table, workId))), fetchCosts(workId)]);
  const data = { costs: costs ?? [] } as LobData;
  LOB_TABLE_LIST.forEach((table, index) => {
    const convert = lobFromRow[table] as (r: Row) => unknown;
    (data as unknown as Record<LobTable, unknown[]>)[table] = rows[index].map(convert);
  });
  return { data, costsAvailable: costs !== null };
}
/** Tudo de uma obra, sem URLs de foto; `costs: []` sem a migração 0044. */
export async function loadLob(workId: string): Promise<LobData> {
  return (await loadLobWithCosts(workId)).data;
}
/** As tabelas da 0038; os custos (0044) são lidos à parte, tolerando a tabela ausente. */
const LOB_TABLE_LIST: Exclude<LobTable, 'costs'>[] = [
  'locals',
  'services',
  'activities',
  'dependencies',
  'baselines',
  'launches',
  'measurements',
  'items',
  'photos',
];

export async function findWorkIdForEntity(table: LobTable, id: string): Promise<string | null> {
  const { data, error } = await getServiceClient().from(TABLE_NAMES[table]).select('work_id').eq('id', id).maybeSingle();
  check(error, `ler ${TABLE_NAMES[table]}`, table);
  return (data as { work_id: string } | null)?.work_id ?? null;
}

/** Lançamento e quantas fotos já tem, para liberar (ou não) mais um envio. */
export async function findItemForUpload(itemId: string): Promise<{ workId: string; photoCount: number } | null> {
  const client = getServiceClient();
  const { data, error } = await client.from('lob_measurement_items').select('work_id').eq('id', itemId).maybeSingle();
  check(error, 'ler lob_measurement_items');
  if (!data) return null;
  const photos = await client.from('lob_photos').select('id', { count: 'exact', head: true }).eq('item_id', itemId);
  check(photos.error, 'ler lob_photos');
  return { workId: (data as { work_id: string }).work_id, photoCount: photos.count ?? 0 };
}

/** URLs assinadas por uma hora para as fotos (o bucket é privado). */
export async function withSignedUrls(data: LobData): Promise<LobData> {
  const paths = [...new Set(data.photos.flatMap(p => [p.storagePath, p.thumbPath]))];
  if (!paths.length) return data;
  const bucket = getServiceClient().storage.from(LOB_BUCKET);
  const signed = new Map<string, string>();
  const batches: string[][] = [];
  for (let i = 0; i < paths.length; i += SIGN_BATCH) batches.push(paths.slice(i, i + SIGN_BATCH));
  const results = await Promise.all(batches.map(batch => bucket.createSignedUrls(batch, SIGNED_URL_SECONDS)));
  for (const { data: urls, error } of results) {
    if (error) throw new Error(`Falha ao assinar as fotos: ${error.message}`);
    for (const entry of urls ?? []) if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl);
  }
  return { ...data, photos: data.photos.map(p => ({ ...p, url: signed.get(p.storagePath), thumbUrl: signed.get(p.thumbPath) })) };
}

// ----- Gravação -----

const DELETE_ORDER: LobTable[] = [
  'photos',
  'items',
  'measurements',
  'dependencies',
  'activities',
  'baselines',
  'launches',
  'costs',
  'services',
  'locals',
];
const INSERT_ORDER: LobTable[] = [
  'locals',
  'services',
  'costs',
  'launches',
  'activities',
  'dependencies',
  'baselines',
  'measurements',
  'items',
  'photos',
];
type AnyRecord = { id: string };
const toRow = (table: LobTable, record: AnyRecord) => (lobToRow[table] as unknown as (r: AnyRecord) => Row)(record);
const chunks = <T>(list: T[], size: number) =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

export async function applyLobMutation(mutation: LobMutation): Promise<void> {
  const client = getServiceClient();
  for (const table of DELETE_ORDER) {
    for (const ids of chunks(mutation.delete[table], DELETE_BATCH)) {
      const { error } = await client.from(TABLE_NAMES[table]).delete().in('id', ids).eq('work_id', mutation.workId);
      check(error, `apagar de ${TABLE_NAMES[table]}`, table);
    }
  }
  for (const table of INSERT_ORDER) {
    const records = mutation.insert[table] as AnyRecord[];
    if (!records.length) continue;
    // Custos em blocos (até 3000 por gravação); as demais tabelas seguem numa requisição só.
    for (const batch of table === 'costs' ? chunks(records, COST_BATCH) : [records]) {
      const { error } = await client.from(TABLE_NAMES[table]).insert(batch.map(r => toRow(table, r)));
      check(error, `gravar em ${TABLE_NAMES[table]}`, table);
    }
  }
  // Custos alterados: upsert em blocos, em vez de um update por linha (centenas de linhas coladas).
  // Só vêm ids lidos desta obra pelo planejador, então o `onConflict` sempre cai em linha da obra. Ao
  // contrário do update por linha, item apagado por outra pessoa no meio volta (o upsert o recria):
  // aceitável para uma linha de orçamento, que a pessoa exclui de novo.
  for (const batch of chunks(mutation.update.costs, COST_BATCH)) {
    const { error } = await client.from(TABLE_NAMES.costs).upsert(
      batch.map(r => toRow('costs', r)),
      { onConflict: 'id' },
    );
    check(error, `atualizar ${TABLE_NAMES.costs}`, 'costs');
  }
  for (const table of INSERT_ORDER) {
    if (table === 'costs') continue;
    const records = mutation.update[table] as AnyRecord[];
    if (!records.length) continue;
    const results = await Promise.all(
      records.map(record => {
        const row = toRow(table, record);
        delete row.id;
        delete row.created_at;
        return client.from(TABLE_NAMES[table]).update(row).eq('id', record.id).eq('work_id', mutation.workId).select('id');
      }),
    );
    for (const { data, error } of results) {
      check(error, `atualizar ${TABLE_NAMES[table]}`, table);
      if (!data?.length) throw new LobConflictError();
    }
  }
  if (mutation.removeFiles.length) {
    const { error } = await client.storage.from(LOB_BUCKET).remove(mutation.removeFiles);
    if (error) logRouteError('lob applyMutation', error, { workId: mutation.workId, files: mutation.removeFiles.length });
  }
}

// ----- Fotos -----

export async function createPhotoUploadUrls(paths: { storagePath: string; thumbPath: string }) {
  const bucket = getServiceClient().storage.from(LOB_BUCKET);
  const [image, thumb] = await Promise.all([
    bucket.createSignedUploadUrl(paths.storagePath),
    bucket.createSignedUploadUrl(paths.thumbPath),
  ]);
  if (image.error || !image.data || thumb.error || !thumb.data) return null;
  return {
    image: { path: image.data.path, signedUrl: image.data.signedUrl },
    thumb: { path: thumb.data.path, signedUrl: thumb.data.signedUrl },
  };
}
type PhotoPaths = { storagePath: string; thumbPath: string };
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export async function photoFilesExist(paths: PhotoPaths): Promise<boolean> {
  const dir = paths.storagePath.slice(0, paths.storagePath.lastIndexOf('/'));
  const search = baseName(paths.storagePath).replace(/\.jpg$/, '');
  const { data, error } = await getServiceClient().storage.from(LOB_BUCKET).list(dir, { search, limit: 10 });
  if (error) throw new Error(`Falha ao conferir os arquivos da foto: ${error.message}`);
  const names = (data ?? []).map(entry => entry.name);
  return names.includes(baseName(paths.storagePath)) && names.includes(baseName(paths.thumbPath));
}
export async function removeUploadedPhotoFiles(paths: PhotoPaths): Promise<void> {
  const { error } = await getServiceClient().storage.from(LOB_BUCKET).remove([paths.storagePath, paths.thumbPath]);
  if (error) throw new Error(`Falha ao descartar os arquivos da foto: ${error.message}`);
}

// ----- Fluxos (da empresa) -----

type FlowRow = {
  id: string;
  name: string;
  direction: string;
  document: { services?: unknown } | null;
  revision: number;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
};
const flowFromRow = (r: FlowRow): ServiceFlow => ({
  id: r.id,
  name: r.name,
  direction: r.direction === 'top_down' ? 'top_down' : 'bottom_up',
  services: Array.isArray(r.document?.services) ? (r.document!.services as ServiceFlow['services']) : [],
  revision: r.revision,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedBy: r.updated_by,
  updatedAt: r.updated_at,
});

/** Todos os fluxos, com os nomes das obras em que cada um já foi lançado. */
export async function listFlows(): Promise<ServiceFlow[]> {
  const client = getServiceClient();
  const { data, error } = await client.from('service_flows').select('*').order('name');
  check(error, 'ler service_flows');
  const flows = ((data ?? []) as FlowRow[]).map(flowFromRow);
  if (!flows.length) return flows;
  const usage = await client.from('lob_launches').select('flow_id, work_id');
  check(usage.error, 'ler lob_launches');
  const workIds = [...new Set(((usage.data ?? []) as { work_id: string }[]).map(u => u.work_id))];
  const names = new Map<string, string>();
  if (workIds.length) {
    const works = await client.from('works').select('id, name').in('id', workIds);
    check(works.error, 'ler works');
    for (const w of (works.data ?? []) as { id: string; name: string }[]) names.set(w.id, w.name);
  }
  const byFlow = new Map<string, Set<string>>();
  for (const u of (usage.data ?? []) as { flow_id: string | null; work_id: string }[]) {
    if (!u.flow_id) continue;
    const set = byFlow.get(u.flow_id) ?? new Set();
    set.add(names.get(u.work_id) ?? u.work_id);
    byFlow.set(u.flow_id, set);
  }
  return flows.map(f => ({ ...f, usedIn: [...(byFlow.get(f.id) ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR')) }));
}
export async function getFlow(id: string): Promise<ServiceFlow | null> {
  const { data, error } = await getServiceClient().from('service_flows').select('*').eq('id', id).maybeSingle();
  check(error, 'ler service_flows');
  return data ? flowFromRow(data as FlowRow) : null;
}
export async function insertFlow(id: string, document: ServiceFlowDocument, actorId: string): Promise<ServiceFlow> {
  const now = new Date().toISOString();
  const { data, error } = await getServiceClient()
    .from('service_flows')
    .insert({
      id,
      name: document.name,
      direction: document.direction,
      document: { services: document.services },
      revision: 1,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    })
    .select('*')
    .single();
  check(error, 'gravar em service_flows');
  return flowFromRow(data as FlowRow);
}
/** Grava só se a revisão lida ainda é a do banco; senão, conflito. */
export async function updateFlow(id: string, revision: number, document: ServiceFlowDocument, actorId: string): Promise<ServiceFlow> {
  const { data, error } = await getServiceClient()
    .from('service_flows')
    .update({
      name: document.name,
      direction: document.direction,
      document: { services: document.services },
      revision: revision + 1,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('revision', revision)
    .select('*');
  check(error, 'atualizar service_flows');
  if (!data?.length)
    throw new LobConflictError('Outra pessoa salvou este fluxo enquanto você editava. Recarregue para ver a versão atual.');
  return flowFromRow(data[0] as FlowRow);
}
export async function deleteFlow(id: string): Promise<void> {
  const { error } = await getServiceClient().from('service_flows').delete().eq('id', id);
  check(error, 'apagar de service_flows');
}

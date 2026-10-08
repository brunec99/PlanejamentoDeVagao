import type {
  TerminalityData,
  TerminalityFloor,
  TerminalityItem,
  TerminalityPerson,
  TerminalityPhoto,
  TerminalityType,
  TerminalityUnit,
} from '../../../domain/terminality';
import type { TerminalityMutation, TerminalityTable } from '../../../application/use-cases/terminality-commands';
import { logRouteError } from '../../log';
import { getServiceClient } from './client';

/** Leitura e gravação da aba 5 (migração 0028). Fica fora do snapshot do planejamento: cada tabela
 * é lida filtrada pela obra e cada comando grava só as linhas que mudou. Sem transação entre tabelas
 * no PostgREST, a ordem das operações em `applyMutation` é o que mantém o banco coerente. */

export const TERMINALITY_BUCKET = 'terminalidade';
const PAGE = 1000;
const SIGNED_URL_SECONDS = 60 * 60;
const SIGN_BATCH = 200;

/** Migração 0028 não aplicada: a aba responde "indisponível" em vez de erro. */
export class TerminalityUnavailableError extends Error {
  constructor() {
    super('Aplique a migração 0028_terminality.sql no Supabase para usar a terminalidade.');
    this.name = 'TerminalityUnavailableError';
  }
}
/** Outra gravação chegou antes (nome repetido, id já usado, registro apagado no meio tempo). */
export class TerminalityConflictError extends Error {
  constructor() {
    super('Os dados mudaram enquanto você editava. Recarregue a página e tente de novo.');
    this.name = 'TerminalityConflictError';
  }
}

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
type DbError = { code?: string; message: string } | null;
function check(error: DbError, action: string) {
  if (!error) return;
  if (missingTable(error.code)) throw new TerminalityUnavailableError();
  // 23505: único violado; 23503: chave estrangeira (pai apagado por outra pessoa ou filho criado no meio tempo).
  if (error.code === '23505' || error.code === '23503') throw new TerminalityConflictError();
  throw new Error(`Falha ao ${action}: ${error.message}`);
}

const TABLE_NAMES: Record<TerminalityTable, string> = {
  floors: 'terminality_floors',
  units: 'terminality_units',
  types: 'terminality_types',
  people: 'terminality_people',
  items: 'terminality_items',
  photos: 'terminality_photos',
};

// ----- Linhas (snake_case, como na migração) e conversões. Opcional ausente = null no banco. -----

type FloorRow = { id: string; work_id: string; name: string; order_index: number; created_at: string; updated_at: string };
type UnitRow = FloorRow & { floor_id: string };
type TypeRow = FloorRow & { active: boolean };
type PersonRow = { id: string; work_id: string; name: string; active: boolean; created_at: string; updated_at: string };
type ItemRow = {
  id: string;
  work_id: string;
  floor_id: string;
  unit_id: string | null;
  description: string;
  type_id: string | null;
  observed_on: string;
  atr_person_id: string | null;
  contractor: string | null;
  status: TerminalityItem['status'];
  corrected_on: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type PhotoRow = {
  id: string;
  item_id: string;
  work_id: string;
  kind: TerminalityPhoto['kind'];
  storage_path: string;
  thumb_path: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_by: string;
  created_at: string;
};

const opt = <T>(value: T | null | undefined) => value ?? undefined;
const stamps = (r: { created_at: string; updated_at: string }) => ({ createdAt: r.created_at, updatedAt: r.updated_at });

export const terminalityFromRow = {
  floors: (r: FloorRow): TerminalityFloor => ({ id: r.id, workId: r.work_id, name: r.name, orderIndex: r.order_index, ...stamps(r) }),
  units: (r: UnitRow): TerminalityUnit => ({
    id: r.id,
    workId: r.work_id,
    floorId: r.floor_id,
    name: r.name,
    orderIndex: r.order_index,
    ...stamps(r),
  }),
  types: (r: TypeRow): TerminalityType => ({
    id: r.id,
    workId: r.work_id,
    name: r.name,
    orderIndex: r.order_index,
    active: r.active,
    ...stamps(r),
  }),
  people: (r: PersonRow): TerminalityPerson => ({ id: r.id, workId: r.work_id, name: r.name, active: r.active, ...stamps(r) }),
  items: (r: ItemRow): TerminalityItem => ({
    id: r.id,
    workId: r.work_id,
    floorId: r.floor_id,
    unitId: opt(r.unit_id),
    description: r.description,
    typeId: opt(r.type_id),
    observedOn: r.observed_on,
    atrPersonId: opt(r.atr_person_id),
    contractor: opt(r.contractor),
    status: r.status,
    correctedOn: opt(r.corrected_on),
    resolvedAt: opt(r.resolved_at),
    resolvedBy: opt(r.resolved_by),
    createdBy: r.created_by,
    ...stamps(r),
  }),
  photos: (r: PhotoRow): TerminalityPhoto => ({
    id: r.id,
    itemId: r.item_id,
    workId: r.work_id,
    kind: r.kind,
    storagePath: r.storage_path,
    thumbPath: r.thumb_path,
    width: opt(r.width),
    height: opt(r.height),
    bytes: opt(r.bytes),
    createdBy: r.created_by,
    createdAt: r.created_at,
  }),
};

export const terminalityToRow = {
  floors: (f: TerminalityFloor): FloorRow => ({
    id: f.id,
    work_id: f.workId,
    name: f.name,
    order_index: f.orderIndex,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  }),
  units: (u: TerminalityUnit): UnitRow => ({
    id: u.id,
    work_id: u.workId,
    floor_id: u.floorId,
    name: u.name,
    order_index: u.orderIndex,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  }),
  types: (t: TerminalityType): TypeRow => ({
    id: t.id,
    work_id: t.workId,
    name: t.name,
    order_index: t.orderIndex,
    active: t.active,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }),
  people: (p: TerminalityPerson): PersonRow => ({
    id: p.id,
    work_id: p.workId,
    name: p.name,
    active: p.active,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  }),
  items: (i: TerminalityItem): ItemRow => ({
    id: i.id,
    work_id: i.workId,
    floor_id: i.floorId,
    unit_id: i.unitId ?? null,
    description: i.description,
    type_id: i.typeId ?? null,
    observed_on: i.observedOn,
    atr_person_id: i.atrPersonId ?? null,
    contractor: i.contractor ?? null,
    status: i.status,
    corrected_on: i.correctedOn ?? null,
    resolved_at: i.resolvedAt ?? null,
    resolved_by: i.resolvedBy ?? null,
    created_by: i.createdBy,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  }),
  // url/thumbUrl são só da resposta; nunca vão ao banco.
  photos: (p: TerminalityPhoto): PhotoRow => ({
    id: p.id,
    item_id: p.itemId,
    work_id: p.workId,
    kind: p.kind,
    storage_path: p.storagePath,
    thumb_path: p.thumbPath,
    width: p.width ?? null,
    height: p.height ?? null,
    bytes: p.bytes ?? null,
    created_by: p.createdBy,
    created_at: p.createdAt,
  }),
};

// ----- Leitura -----

/** Ordem de cada lista na tela; o `id` no fim desempata e torna a paginação determinística. */
const ORDER: Record<TerminalityTable, string[]> = {
  floors: ['order_index', 'id'],
  units: ['floor_id', 'order_index', 'id'],
  types: ['order_index', 'id'],
  people: ['name', 'id'],
  items: ['created_at', 'id'],
  photos: ['created_at', 'id'],
};

/** O PostgREST devolve no máximo 1000 linhas por vez; uma obra grande passa disso em fotos. */
async function fetchWorkRows(table: TerminalityTable, workId: string): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = getServiceClient().from(TABLE_NAMES[table]).select('*').eq('work_id', workId);
    for (const column of ORDER[table]) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE - 1);
    check(error, `ler ${TABLE_NAMES[table]}`);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}

/** Todos os cadastros e pendências de uma obra, sem URLs de foto. */
export async function loadTerminality(workId: string): Promise<TerminalityData> {
  const [floors, units, types, people, items, photos] = await Promise.all([
    fetchWorkRows('floors', workId),
    fetchWorkRows('units', workId),
    fetchWorkRows('types', workId),
    fetchWorkRows('people', workId),
    fetchWorkRows('items', workId),
    fetchWorkRows('photos', workId),
  ]);
  return {
    floors: (floors as FloorRow[]).map(terminalityFromRow.floors),
    units: (units as UnitRow[]).map(terminalityFromRow.units),
    types: (types as TypeRow[]).map(terminalityFromRow.types),
    people: (people as PersonRow[]).map(terminalityFromRow.people),
    items: (items as ItemRow[]).map(terminalityFromRow.items),
    photos: (photos as PhotoRow[]).map(terminalityFromRow.photos),
  };
}

/** Obra de um registro, para a rota conferir o acesso antes de carregar tudo. `null` = não existe. */
export async function findWorkIdForEntity(table: TerminalityTable, id: string): Promise<string | null> {
  const { data, error } = await getServiceClient().from(TABLE_NAMES[table]).select('work_id').eq('id', id).maybeSingle();
  check(error, `ler ${TABLE_NAMES[table]}`);
  return (data as { work_id: string } | null)?.work_id ?? null;
}

/** Pendência e quantas fotos ela já tem, para liberar (ou não) mais um envio. */
export async function findItemForUpload(itemId: string): Promise<{ workId: string; photoCount: number } | null> {
  const client = getServiceClient();
  const { data, error } = await client.from('terminality_items').select('work_id').eq('id', itemId).maybeSingle();
  check(error, 'ler terminality_items');
  if (!data) return null;
  const photos = await client.from('terminality_photos').select('id', { count: 'exact', head: true }).eq('item_id', itemId);
  check(photos.error, 'ler terminality_photos');
  return { workId: (data as { work_id: string }).work_id, photoCount: photos.count ?? 0 };
}

/** Preenche `url` e `thumbUrl` com URLs assinadas por uma hora (o bucket é privado). Foto cujo
 * arquivo falhou ao assinar segue sem URL: a tela mostra o espaço vazio em vez de quebrar a lista. */
export async function withSignedUrls(data: TerminalityData): Promise<TerminalityData> {
  const paths = [...new Set(data.photos.flatMap(p => [p.storagePath, p.thumbPath]))];
  if (!paths.length) return data;
  const bucket = getServiceClient().storage.from(TERMINALITY_BUCKET);
  const signed = new Map<string, string>();
  const batches: string[][] = [];
  for (let i = 0; i < paths.length; i += SIGN_BATCH) batches.push(paths.slice(i, i + SIGN_BATCH));
  const results = await Promise.all(batches.map(batch => bucket.createSignedUrls(batch, SIGNED_URL_SECONDS)));
  for (const { data: urls, error } of results) {
    if (error) throw new Error(`Falha ao assinar as fotos: ${error.message}`);
    for (const entry of urls ?? []) if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl);
  }
  return {
    ...data,
    photos: data.photos.map(p => ({ ...p, url: signed.get(p.storagePath), thumbUrl: signed.get(p.thumbPath) })),
  };
}

// ----- Gravação -----

/** Filhos antes dos pais ao apagar; pais antes dos filhos ao inserir. */
const DELETE_ORDER: TerminalityTable[] = ['photos', 'items', 'units', 'floors', 'types', 'people'];
const INSERT_ORDER: TerminalityTable[] = ['floors', 'units', 'types', 'people', 'items', 'photos'];

type AnyRecord = { id: string };
const toRow = (table: TerminalityTable, record: AnyRecord) =>
  (terminalityToRow[table] as unknown as (r: AnyRecord) => Record<string, unknown>)(record);

/** Aplica o que o planejador decidiu. Cada tabela vai num comando só (o insert em lote é atômico);
 * os arquivos saem por último, depois que nenhuma linha aponta mais para eles. */
export async function applyMutation(mutation: TerminalityMutation): Promise<void> {
  const client = getServiceClient();
  for (const table of DELETE_ORDER) {
    const ids = mutation.delete[table];
    if (!ids.length) continue;
    const { error } = await client.from(TABLE_NAMES[table]).delete().in('id', ids).eq('work_id', mutation.workId);
    check(error, `apagar de ${TABLE_NAMES[table]}`);
  }
  for (const table of INSERT_ORDER) {
    const records = mutation.insert[table] as AnyRecord[];
    if (!records.length) continue;
    const { error } = await client.from(TABLE_NAMES[table]).insert(records.map(r => toRow(table, r)));
    check(error, `gravar em ${TABLE_NAMES[table]}`);
  }
  for (const table of INSERT_ORDER) {
    const records = mutation.update[table] as AnyRecord[];
    if (!records.length) continue;
    // Atualiza por id e obra (nunca upsert): um registro apagado por outra pessoa não pode renascer.
    const results = await Promise.all(
      records.map(record => {
        const row = toRow(table, record);
        delete row.id;
        delete row.created_at;
        return client.from(TABLE_NAMES[table]).update(row).eq('id', record.id).eq('work_id', mutation.workId).select('id');
      }),
    );
    for (const { data, error } of results) {
      check(error, `atualizar ${TABLE_NAMES[table]}`);
      if (!data?.length) throw new TerminalityConflictError();
    }
  }
  if (mutation.removeFiles.length) {
    // As linhas já saíram; se o Storage falhar, sobra um arquivo órfão no bucket privado, sem efeito na tela.
    const { error } = await client.storage.from(TERMINALITY_BUCKET).remove(mutation.removeFiles);
    if (error) logRouteError('terminality applyMutation', error, { workId: mutation.workId, files: mutation.removeFiles.length });
  }
}

/** URLs de envio direto ao Storage para a imagem e a miniatura de uma foto. */
export async function createPhotoUploadUrls(paths: { storagePath: string; thumbPath: string }) {
  const bucket = getServiceClient().storage.from(TERMINALITY_BUCKET);
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

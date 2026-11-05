import {
  SAFETY_BUCKET,
  type SafetyData,
  type SafetyInspector,
  type SafetyItem,
  type SafetyPhoto,
  type SafetyType,
} from '../../../domain/safety';
import type { SafetyMutation, SafetyTable } from '../../../application/use-cases/safety-commands';
import { logRouteError } from '../../log';
import { getServiceClient } from './client';

/** Leitura e gravação da aba 6, Segurança do trabalho (migração 0040). Mesmo desenho da terminalidade
 * (`terminality-repository.ts`): fora do snapshot do planejamento, cada comando grava só as linhas que
 * mudou e, sem transação entre tabelas no PostgREST, a ordem das operações em `applyMutation` é o que
 * mantém o banco coerente. Diferenças: os tipos são uma lista única (sem obra) e as gravações vão em
 * lotes, porque a importação da planilha "SST - Controle geral" grava milhares de apontamentos de uma vez. */

const PAGE = 1000;
const SIGNED_URL_SECONDS = 60 * 60;
const SIGN_BATCH = 200;
/** Linhas por insert: o corpo de 500 apontamentos fica bem abaixo do limite do PostgREST. */
const INSERT_CHUNK = 500;
/** Ids por delete: o filtro `in` vai na URL, e 100 UUIDs (~3,7 KB) não esbarram no limite de tamanho dela. */
const DELETE_CHUNK = 100;
/** Atualizações simultâneas: cada linha é uma requisição (nunca upsert, ver abaixo); sem teto, a edição em
 * lote de 500 apontamentos abriria 500 conexões de uma vez. */
const UPDATE_CONCURRENCY = 50;
/** Arquivos por chamada de remoção do Storage. */
const REMOVE_CHUNK = 500;

/** Migração 0040 não aplicada: a aba responde "indisponível" em vez de erro. */
export class SafetyUnavailableError extends Error {
  constructor() {
    super('Aplique a migração 0040_safety.sql no Supabase para usar a segurança do trabalho.');
    this.name = 'SafetyUnavailableError';
  }
}
/** Outra gravação chegou antes (nome repetido, id já usado, registro apagado no meio tempo). */
export class SafetyConflictError extends Error {
  constructor() {
    super('Os dados mudaram enquanto você editava. Recarregue a página e tente de novo.');
    this.name = 'SafetyConflictError';
  }
}

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
/** Coluna `profiles.tst` ausente: 42703 vem do Postgres (filtro ou select), PGRST204 do PostgREST (update). */
const missingColumn = (code?: string) => code === '42703' || code === 'PGRST204';
type DbError = { code?: string; message: string } | null;
function check(error: DbError, action: string) {
  if (!error) return;
  if (missingTable(error.code)) throw new SafetyUnavailableError();
  // 23505: único violado; 23503: chave estrangeira (pai apagado por outra pessoa ou filho criado no meio tempo).
  if (error.code === '23505' || error.code === '23503') throw new SafetyConflictError();
  throw new Error(`Falha ao ${action}: ${error.message}`);
}
/** Em `profiles` a tabela sempre existe; o que falta sem a 0040 é a coluna `tst`. */
function checkProfiles(error: DbError, action: string) {
  if (error && missingColumn(error.code)) throw new SafetyUnavailableError();
  check(error, action);
}

const TABLE_NAMES: Record<SafetyTable, string> = {
  types: 'safety_types',
  items: 'safety_items',
  photos: 'safety_photos',
};

// ----- Linhas (snake_case, como na migração) e conversões. Opcional ausente = null no banco. -----

type TypeRow = { id: string; name: string; order_index: number; active: boolean; created_at: string; updated_at: string };
type ItemRow = {
  id: string;
  work_id: string;
  type_id: string | null;
  consequence: SafetyItem['consequence'];
  probability: SafetyItem['probability'];
  description: string;
  location: string;
  observed_on: string;
  status: SafetyItem['status'];
  corrected_on: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  origin: SafetyItem['origin'];
  created_by: string;
  created_at: string;
  updated_at: string;
};
type PhotoRow = {
  id: string;
  item_id: string;
  work_id: string;
  kind: SafetyPhoto['kind'];
  storage_path: string;
  thumb_path: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  created_by: string;
  created_at: string;
};

/** `{ chave: valor }` só quando o banco tem valor: opcional nulo some do registro, não vira `undefined`. */
const optional = <K extends string, T>(key: K, value: T | null | undefined) =>
  (value === null || value === undefined ? {} : { [key]: value }) as Partial<Record<K, T>>;
const stamps = (r: { created_at: string; updated_at: string }) => ({ createdAt: r.created_at, updatedAt: r.updated_at });

export const safetyFromRow = {
  types: (r: TypeRow): SafetyType => ({ id: r.id, name: r.name, orderIndex: r.order_index, active: r.active, ...stamps(r) }),
  items: (r: ItemRow): SafetyItem => ({
    id: r.id,
    workId: r.work_id,
    ...optional('typeId', r.type_id),
    consequence: r.consequence,
    probability: r.probability,
    description: r.description,
    location: r.location ?? '',
    observedOn: r.observed_on,
    status: r.status,
    ...optional('correctedOn', r.corrected_on),
    ...optional('resolvedAt', r.resolved_at),
    ...optional('resolvedBy', r.resolved_by),
    ...optional('resolutionNote', r.resolution_note || null),
    origin: r.origin,
    createdBy: r.created_by,
    ...stamps(r),
  }),
  photos: (r: PhotoRow): SafetyPhoto => ({
    id: r.id,
    itemId: r.item_id,
    workId: r.work_id,
    kind: r.kind,
    storagePath: r.storage_path,
    thumbPath: r.thumb_path,
    ...optional('width', r.width),
    ...optional('height', r.height),
    ...optional('bytes', r.bytes),
    createdBy: r.created_by,
    createdAt: r.created_at,
  }),
};

export const safetyToRow = {
  types: (t: SafetyType): TypeRow => ({
    id: t.id,
    name: t.name,
    order_index: t.orderIndex,
    active: t.active,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }),
  // Todas as colunas sempre entram (nasceram juntas na 0040): reabrir grava o nulo de `resolution_note`
  // mesmo sem a chave no registro, e o insert em lote leva as mesmas colunas em toda linha.
  items: (i: SafetyItem): ItemRow => ({
    id: i.id,
    work_id: i.workId,
    type_id: i.typeId ?? null,
    consequence: i.consequence,
    probability: i.probability,
    description: i.description,
    location: i.location ?? '',
    observed_on: i.observedOn,
    status: i.status,
    corrected_on: i.correctedOn ?? null,
    resolved_at: i.resolvedAt ?? null,
    resolved_by: i.resolvedBy ?? null,
    resolution_note: i.resolutionNote ?? null,
    origin: i.origin,
    created_by: i.createdBy,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
  }),
  // url/thumbUrl são só da resposta; nunca vão ao banco.
  photos: (p: SafetyPhoto): PhotoRow => ({
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

/** Ordem de leitura; o `id` no fim desempata e torna a paginação determinística. Apontamentos e fotos
 * vêm por id (a tela ordena como quiser); os tipos, na ordem cadastrada. */
const ORDER: Record<SafetyTable, string[]> = {
  types: ['order_index', 'name', 'id'],
  items: ['id'],
  photos: ['id'],
};

/** O PostgREST devolve no máximo 1000 linhas por vez; uma obra passa de 1.200 apontamentos. Sem `workId`,
 * lê a tabela inteira (os tipos, que são da lista única). */
async function fetchRows(table: SafetyTable, workId?: string): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = getServiceClient().from(TABLE_NAMES[table]).select('*');
    if (workId) query = query.eq('work_id', workId);
    for (const column of ORDER[table]) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE - 1);
    check(error, `ler ${TABLE_NAMES[table]}`);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}

/** Todos os tipos (ativos e desativados) e os apontamentos e fotos de uma obra, sem URLs de foto. */
export async function loadSafety(workId: string): Promise<SafetyData> {
  const [types, items, photos] = await Promise.all([fetchRows('types'), fetchRows('items', workId), fetchRows('photos', workId)]);
  return {
    types: (types as TypeRow[]).map(safetyFromRow.types),
    items: (items as ItemRow[]).map(safetyFromRow.items),
    photos: (photos as PhotoRow[]).map(safetyFromRow.photos),
  };
}

/** Obra de um apontamento ou foto, para a rota conferir o acesso antes de carregar tudo. `null` = não existe. */
export async function findWorkIdForEntity(table: 'items' | 'photos', id: string): Promise<string | null> {
  const { data, error } = await getServiceClient().from(TABLE_NAMES[table]).select('work_id').eq('id', id).maybeSingle();
  check(error, `ler ${TABLE_NAMES[table]}`);
  return (data as { work_id: string } | null)?.work_id ?? null;
}

/** Apontamento e quantas fotos ele já tem, para liberar (ou não) mais um envio. */
export async function findItemForUpload(itemId: string): Promise<{ workId: string; photoCount: number } | null> {
  const client = getServiceClient();
  const { data, error } = await client.from('safety_items').select('work_id').eq('id', itemId).maybeSingle();
  check(error, 'ler safety_items');
  if (!data) return null;
  const photos = await client.from('safety_photos').select('id', { count: 'exact', head: true }).eq('item_id', itemId);
  check(photos.error, 'ler safety_photos');
  return { workId: (data as { work_id: string }).work_id, photoCount: photos.count ?? 0 };
}

/** Preenche `url` e `thumbUrl` com URLs assinadas por uma hora (o bucket é privado), em lotes. Foto cujo
 * arquivo falhou ao assinar segue sem URL: a tela mostra o espaço vazio em vez de quebrar a lista. */
export async function withSignedUrls(data: SafetyData): Promise<SafetyData> {
  const paths = [...new Set(data.photos.flatMap(p => [p.storagePath, p.thumbPath]))];
  if (!paths.length) return data;
  const bucket = getServiceClient().storage.from(SAFETY_BUCKET);
  const signed = new Map<string, string>();
  const results = await Promise.all(chunks(paths, SIGN_BATCH).map(batch => bucket.createSignedUrls(batch, SIGNED_URL_SECONDS)));
  for (const { data: urls, error } of results) {
    if (error) throw new Error(`Falha ao assinar as fotos: ${error.message}`);
    for (const entry of urls ?? []) if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl);
  }
  return {
    ...data,
    photos: data.photos.map(p => ({ ...p, url: signed.get(p.storagePath), thumbUrl: signed.get(p.thumbPath) })),
  };
}

/** TSTs com a obra liberada (mesma regra de acesso das rotas: `work_ids`), por nome. */
export async function listInspectors(workId: string): Promise<SafetyInspector[]> {
  const { data, error } = await getServiceClient().from('profiles').select('id, name').eq('tst', true).contains('work_ids', [workId]);
  checkProfiles(error, 'ler os técnicos de segurança');
  return ((data ?? []) as { id: string; name: string }[])
    .map(r => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Marca ou desmarca alguém como TST. `false` = perfil não existe. Não mexe em `updated_at`: o
 * `commit_planning` regrava essa coluna a partir do snapshot e não conhece `tst`, então as duas gravações
 * não se atropelam. */
export async function setTst(userId: string, enabled: boolean): Promise<boolean> {
  const { data, error } = await getServiceClient().from('profiles').update({ tst: enabled }).eq('id', userId).select('id');
  checkProfiles(error, 'marcar o técnico de segurança');
  return Boolean(data?.length);
}

// ----- Gravação -----

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Filhos antes dos pais ao apagar; pais antes dos filhos ao inserir. */
const DELETE_ORDER: SafetyTable[] = ['photos', 'items', 'types'];
const INSERT_ORDER: SafetyTable[] = ['types', 'items', 'photos'];

type AnyRecord = { id: string };
const toRow = (table: SafetyTable, record: AnyRecord) =>
  (safetyToRow[table] as unknown as (r: AnyRecord) => Record<string, unknown>)(record);

/** Apontamentos e fotos sempre se gravam presos à obra do comando (filtro `work_id`); os tipos não têm obra. */
function workFilter(mutation: SafetyMutation, table: SafetyTable): string | undefined {
  if (table === 'types') return undefined;
  if (!mutation.workId) throw new Error(`Gravação em ${TABLE_NAMES[table]} sem obra.`);
  return mutation.workId;
}

/** Aplica o que o planejador decidiu, em lotes. Um comando da tela cabe num lote só (o insert em lote é
 * atômico); a importação da planilha passa disso, e um lote que falhe no meio deixa gravados os anteriores
 * — quem importa precisa poder rodar de novo sem duplicar (o id repetido volta como conflito). Os arquivos
 * saem por último, depois que nenhuma linha aponta mais para eles. */
export async function applyMutation(mutation: SafetyMutation): Promise<void> {
  const client = getServiceClient();
  for (const table of DELETE_ORDER) {
    const ids = mutation.delete[table];
    if (!ids.length) continue;
    const workId = workFilter(mutation, table);
    for (const batch of chunks(ids, DELETE_CHUNK)) {
      let query = client.from(TABLE_NAMES[table]).delete().in('id', batch);
      if (workId) query = query.eq('work_id', workId);
      const { error } = await query;
      check(error, `apagar de ${TABLE_NAMES[table]}`);
    }
  }
  for (const table of INSERT_ORDER) {
    const records = mutation.insert[table] as AnyRecord[];
    if (!records.length) continue;
    workFilter(mutation, table);
    for (const batch of chunks(records, INSERT_CHUNK)) {
      const { error } = await client.from(TABLE_NAMES[table]).insert(batch.map(r => toRow(table, r)));
      check(error, `gravar em ${TABLE_NAMES[table]}`);
    }
  }
  for (const table of INSERT_ORDER) {
    const records = mutation.update[table] as AnyRecord[];
    if (!records.length) continue;
    const workId = workFilter(mutation, table);
    for (const batch of chunks(records, UPDATE_CONCURRENCY)) {
      // Atualiza por id (e obra), nunca upsert: um registro apagado por outra pessoa não pode renascer.
      const results = await Promise.all(
        batch.map(record => {
          const row = toRow(table, record);
          delete row.id;
          delete row.created_at;
          let query = client.from(TABLE_NAMES[table]).update(row).eq('id', record.id);
          if (workId) query = query.eq('work_id', workId);
          return query.select('id');
        }),
      );
      for (const { data, error } of results) {
        check(error, `atualizar ${TABLE_NAMES[table]}`);
        if (!data?.length) throw new SafetyConflictError();
      }
    }
  }
  if (mutation.removeFiles.length) {
    // As linhas já saíram; se o Storage falhar, sobra um arquivo órfão no bucket privado, sem efeito na tela.
    for (const batch of chunks(mutation.removeFiles, REMOVE_CHUNK)) {
      const { error } = await client.storage.from(SAFETY_BUCKET).remove(batch);
      if (error) logRouteError('safety applyMutation', error, { workId: mutation.workId, files: batch.length });
    }
  }
}

type PhotoPaths = { storagePath: string; thumbPath: string };
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** URLs de envio direto ao Storage para a imagem e a miniatura de uma foto. */
export async function createPhotoUploadUrls(paths: PhotoPaths) {
  const bucket = getServiceClient().storage.from(SAFETY_BUCKET);
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

/** Confere no Storage se os dois arquivos já subiram: `add_photo` não pode registrar foto sem arquivo
 * (senão uma "foto da correção" fantasma finalizaria o apontamento). Uma listagem só, filtrada pelo id
 * da foto, que é o prefixo dos dois nomes. */
export async function photoFilesExist(paths: PhotoPaths): Promise<boolean> {
  const dir = paths.storagePath.slice(0, paths.storagePath.lastIndexOf('/'));
  const search = baseName(paths.storagePath).replace(/\.jpg$/, '');
  const { data, error } = await getServiceClient().storage.from(SAFETY_BUCKET).list(dir, { search, limit: 10 });
  if (error) throw new Error(`Falha ao conferir os arquivos da foto: ${error.message}`);
  const names = (data ?? []).map(entry => entry.name);
  return names.includes(baseName(paths.storagePath)) && names.includes(baseName(paths.thumbPath));
}

/** Apaga os arquivos de um envio que não chegou a virar `add_photo` (a rota já conferiu que não há linha
 * para a foto). Falha do Storage vira erro: a rota responde e o cliente só registra. */
export async function removeUploadedPhotoFiles(paths: PhotoPaths): Promise<void> {
  const { error } = await getServiceClient().storage.from(SAFETY_BUCKET).remove([paths.storagePath, paths.thumbPath]);
  if (error) throw new Error(`Falha ao descartar os arquivos da foto: ${error.message}`);
}

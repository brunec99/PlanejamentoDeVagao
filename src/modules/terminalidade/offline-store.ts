'use client';
import { terminalityPhotoPaths } from '@/domain/terminality';
import {
  alreadyApplied,
  checkOperation,
  operationCommand,
  type FieldActor,
  type FieldOperation,
  type FieldPackage,
  type FieldWork,
  type QueuedOperation,
} from './offline-model';

/** Armazenamento do modo de campo da terminalidade, no mesmo desenho da vistoria da Obra do Mês
 * (App-ATR, `src/lib/vistoria-offline.ts`): o dono do rascunho é o aparelho. No canteiro não há sinal,
 * e perder pendência ou foto lançada é o único erro que este modo não pode cometer. Tudo vai para o
 * IndexedDB na hora, e a fila sobe quando houver rede.
 *
 * IndexedDB e não localStorage: as fotos são Blobs de centenas de KB, e a escrita síncrona do
 * localStorage travaria a tela entre um toque e outro. */

const DB_NAME = 'obra360-terminalidade';
const STORE = 'estado';
const KEY_WORKS = 'obras';
const KEY_QUEUE = 'fila';
const packageKey = (workId: string) => `pacote:${workId}`;
const photoKey = (photoId: string) => `foto:${photoId}`;
const thumbKey = (photoId: string) => `miniatura:${photoId}`;

export interface StoredWorks {
  actor: FieldActor;
  works: FieldWork[];
  savedAt: string;
}
export interface StoredPhoto {
  image: Blob;
  thumb: Blob;
}

const available = () => typeof window !== 'undefined' && 'indexedDB' in window;
let connection: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}
async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
  if (!available()) return null;
  const db = await open();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    request.onsuccess = () => resolve((request.result as T) ?? null);
    request.onerror = () => reject(request.error);
  });
}
const read = <T>(key: string) => run<T>('readonly', store => store.get(key));
const write = async (key: string, value: unknown) => {
  await run('readwrite', store => store.put(value, key));
};
const remove = async (key: string) => {
  await run('readwrite', store => store.delete(key));
};

// ————— Obras e pacotes —————

export const readWorks = () => read<StoredWorks>(KEY_WORKS);
export const readPackage = (workId: string) => read<FieldPackage>(packageKey(workId));
export const readQueue = async () => (await read<QueuedOperation[]>(KEY_QUEUE)) ?? [];
export const readPhoto = (photoId: string) => read<StoredPhoto>(photoKey(photoId));
export const readThumb = (photoId: string) => read<Blob>(thumbKey(photoId));

export class SessionExpiredError extends Error {
  constructor() {
    super('Sua sessão expirou. Entre de novo para enviar; o que foi lançado continua guardado neste aparelho.');
  }
}
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 401) throw new SessionExpiredError();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.');
  return body as T;
}

/** Obras do usuário (precisa de rede). Guardadas para a lista abrir sem sinal. */
export async function fetchWorks(): Promise<StoredWorks> {
  const body = await getJson<{ actor: FieldActor; works: FieldWork[] }>('/api/terminalidade/campo');
  const stored = { ...body, savedAt: new Date().toISOString() };
  await write(KEY_WORKS, stored);
  return stored;
}

/** Até quantas miniaturas de pendências abertas guardar por obra, para as fotos aparecerem sem sinal. */
const MAX_CACHED_THUMBS = 300;

/** Baixa tudo o que a obra precisa e guarda no aparelho. É a única etapa que exige rede: depois
 * dela a obra abre em modo avião. As miniaturas das pendências abertas vêm junto (as URLs
 * assinadas vencem em uma hora, e sem sinal não haveria como refazê-las). */
export async function preparePackage(workId: string): Promise<FieldPackage> {
  const body = await getJson<Omit<FieldPackage, 'savedAt'> & { available?: boolean }>(
    `/api/terminalidade/campo?workId=${encodeURIComponent(workId)}`,
  );
  if (body.available === false) throw new Error('A terminalidade ainda não está disponível neste banco.');
  const pkg: FieldPackage = {
    work: body.work,
    actor: body.actor,
    data: body.data,
    companies: body.companies,
    savedAt: new Date().toISOString(),
  };
  await write(packageKey(workId), pkg);
  const open = new Set(pkg.data.items.filter(item => item.status === 'open').map(item => item.id));
  const photos = pkg.data.photos.filter(photo => open.has(photo.itemId) && photo.thumbUrl).slice(0, MAX_CACHED_THUMBS);
  for (const photo of photos) {
    if (await readThumb(photo.id)) continue;
    try {
      const res = await fetch(photo.thumbUrl!);
      if (res.ok) await write(thumbKey(photo.id), await res.blob());
    } catch {
      // Sem a miniatura, a pendência abre igual; a foto só aparece com sinal.
    }
  }
  return pkg;
}

// ————— Fila de saída —————

/** Confere a operação pelas regras do servidor contra a vista local e a põe na fila. Fotos levam os
 * arquivos junto, gravados antes do registro, para nunca existir registro sem arquivo. Lança a
 * mensagem de recusa, pronta para o usuário. */
export async function enqueue(pkg: FieldPackage, operation: FieldOperation, photo?: StoredPhoto): Promise<void> {
  const queue = await readQueue();
  checkOperation(pkg, queue, operation);
  if (operation.kind === 'photo') {
    if (!photo) throw new Error('Foto não encontrada.');
    await write(photoKey(operation.photoId), photo);
  }
  const queued: QueuedOperation = { id: crypto.randomUUID(), workId: pkg.work.id, createdAt: new Date().toISOString(), operation };
  await write(KEY_QUEUE, [...(await readQueue()), queued]);
}

/** Tira uma operação da fila (enviada ou descartada) e, se for foto, apaga os arquivos do aparelho. */
async function dequeue(queued: QueuedOperation): Promise<void> {
  await write(
    KEY_QUEUE,
    (await readQueue()).filter(q => q.id !== queued.id),
  );
  if (queued.operation.kind === 'photo') await remove(photoKey(queued.operation.photoId));
}

/** Descartar de propósito uma alteração recusada. Sai também o que dependia dela (a foto e a
 * resolução de uma pendência que não chegou a ser criada), para a fila não travar de novo. */
export async function discard(queued: QueuedOperation): Promise<void> {
  const queue = await readQueue();
  const command = operationCommand(queued.workId, queued.operation);
  const dependents =
    command.type === 'create_item'
      ? queue.filter(
          q =>
            q.id !== queued.id &&
            'itemId' in operationCommand(q.workId, q.operation) &&
            (operationCommand(q.workId, q.operation) as { itemId?: string }).itemId === command.itemId,
        )
      : [];
  for (const q of [queued, ...dependents]) await dequeue(q);
}

async function markError(queued: QueuedOperation, error: string): Promise<void> {
  await write(
    KEY_QUEUE,
    (await readQueue()).map(q => (q.id === queued.id ? { ...q, error } : q)),
  );
}

export interface SyncResult {
  sent: number;
  pending: number;
  error: string | null;
  sessionExpired: boolean;
}

class BusinessError extends Error {}

async function post(url: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Sem resposta do servidor.');
  }
  if (res.status === 401) throw new SessionExpiredError();
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json;
  const message = (json as { error?: string }).error ?? 'Envio recusado pelo servidor.';
  // 4xx é recusa de regra (fica marcada na operação); 5xx é falha passageira (tenta de novo depois).
  if (res.status >= 400 && res.status < 500) throw new BusinessError(message);
  throw new Error(message);
}

async function putBlob(url: string, blob: Blob): Promise<boolean> {
  try {
    return (await fetch(url, { method: 'PUT', body: blob, headers: { 'content-type': 'image/jpeg' } })).ok;
  } catch {
    return false;
  }
}

async function sendPhoto(queued: QueuedOperation & { operation: Extract<FieldOperation, { kind: 'photo' }> }): Promise<void> {
  const { itemId, photoId } = queued.operation;
  const files = await readPhoto(photoId);
  if (!files) throw new BusinessError('Os arquivos desta foto não estão mais no aparelho.');
  let tickets: { image: { signedUrl: string }; thumb: { signedUrl: string } };
  try {
    tickets = (await post('/api/terminalidade/upload-url', { workId: queued.workId, itemId, photoId })) as typeof tickets;
  } catch (error) {
    if (error instanceof BusinessError && alreadyApplied(error.message)) return;
    throw error;
  }
  for (const [ticket, blob] of [
    [tickets.image, files.image],
    [tickets.thumb, files.thumb],
  ] as const)
    if (!(await putBlob(ticket.signedUrl, blob)) && !(await putBlob(ticket.signedUrl, blob)))
      throw new Error('A foto não subiu; tenta de novo quando o sinal melhorar.');
  // A miniatura fica guardada: a foto continua aparecendo sem sinal depois de enviada.
  await write(thumbKey(photoId), files.thumb);
  await post('/api/terminalidade/commands', operationCommand(queued.workId, queued.operation));
}

/** Sobe a fila na ordem em que foi lançada. O que sobe sai da fila na hora: se o sinal cair no meio,
 * o que já subiu não sobe de novo, e o que faltou continua guardado. Para na primeira recusa de
 * regra (a ordem importa: a foto e a resolução dependem da pendência criada antes). */
export async function synchronize(): Promise<SyncResult> {
  const pending = async () => (await readQueue()).length;
  if (typeof navigator !== 'undefined' && !navigator.onLine)
    return { sent: 0, pending: await pending(), error: 'Sem conexão.', sessionExpired: false };
  let sent = 0;
  const touched = new Set<string>();
  for (const queued of await readQueue()) {
    try {
      if (queued.operation.kind === 'photo') await sendPhoto(queued as Parameters<typeof sendPhoto>[0]);
      else
        try {
          await post('/api/terminalidade/commands', queued.operation.command);
        } catch (error) {
          if (!(error instanceof BusinessError && alreadyApplied(error.message))) throw error;
        }
      await dequeue(queued);
      touched.add(queued.workId);
      sent++;
    } catch (error) {
      if (error instanceof SessionExpiredError) return { sent, pending: await pending(), error: error.message, sessionExpired: true };
      const message = error instanceof Error ? error.message : 'Falha no envio.';
      if (error instanceof BusinessError) await markError(queued, message);
      await refresh(touched);
      return { sent, pending: await pending(), error: message, sessionExpired: false };
    }
  }
  await refresh(touched);
  return { sent, pending: await pending(), error: null, sessionExpired: false };
}

/** Depois de enviar, baixa de novo as obras mexidas: o que voltou do servidor passa a ser a base, e
 * o que ainda está na fila continua aplicado por cima. */
async function refresh(workIds: Set<string>) {
  for (const workId of workIds)
    try {
      await preparePackage(workId);
    } catch {
      // Sem sinal de novo: a base antiga com a fila por cima continua certa.
    }
}

/** Caminho da foto no bucket, para quem precisa montar o nome do arquivo. */
export const fieldPhotoPaths = terminalityPhotoPaths;

/** Registra o service worker que guarda a casca da tela de campo para abrir sem sinal. O escopo é
 * só `/campo/`: o resto do sistema continua sem cache nenhum. */
export function registerFieldServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/campo-sw.js', { scope: '/campo/', updateViaCache: 'none' }).catch(() => undefined);
}

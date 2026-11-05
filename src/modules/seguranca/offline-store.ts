'use client';
import { SafetyApiError, sendSafetyCommand } from './api';
import {
  alreadyApplied,
  checkOperation,
  operationCommand,
  operationItemId,
  type FieldActor,
  type FieldOperation,
  type FieldPackage,
  type FieldWork,
  type QueuedOperation,
} from './offline-model';

/** Armazenamento do modo de campo da segurança do trabalho, no mesmo desenho do da terminalidade
 * (`@/modules/terminalidade/offline-store`): o dono do rascunho é o aparelho. No canteiro não há sinal,
 * e perder apontamento ou foto lançada é o único erro que este modo não pode cometer. Tudo vai para o
 * IndexedDB na hora, e a fila sobe quando houver rede. Banco próprio (`obra360-seguranca`), para as
 * filas das duas abas nunca se misturarem.
 *
 * IndexedDB e não localStorage: as fotos são Blobs de centenas de KB, e a escrita síncrona do
 * localStorage travaria a tela entre um toque e outro. */

const DB_NAME = 'obra360-seguranca';
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
  const body = await getJson<{ actor: FieldActor; works: FieldWork[] }>('/api/seguranca/campo');
  const stored = { ...body, savedAt: new Date().toISOString() };
  await write(KEY_WORKS, stored);
  return stored;
}

/** Até quantas miniaturas de apontamentos abertos guardar por obra, para as fotos aparecerem sem sinal
 * (o mesmo teto da terminalidade). O histórico finalizado (a maior parte, em obras com mais de mil
 * apontamentos) não entra: as fotos dele só aparecem com sinal. */
const MAX_CACHED_THUMBS = 300;
/** Downloads de miniatura em paralelo: o bastante para não fazer fila no sinal fraco do canteiro. */
const THUMB_DOWNLOADS = 4;

/** Baixa tudo o que a obra precisa e guarda no aparelho. É a única etapa que exige rede: depois
 * dela a obra abre em modo avião. As miniaturas dos apontamentos abertos vêm junto (as URLs
 * assinadas vencem em uma hora, e sem sinal não haveria como refazê-las), os mais recentes primeiro. */
export async function preparePackage(workId: string): Promise<FieldPackage> {
  const body = await getJson<Omit<FieldPackage, 'savedAt'> & { available?: boolean }>(
    `/api/seguranca/campo?workId=${encodeURIComponent(workId)}`,
  );
  if (body.available === false) throw new Error('A segurança do trabalho ainda não está disponível neste banco.');
  const pkg: FieldPackage = {
    work: body.work,
    actor: body.actor,
    canEdit: body.canEdit === true,
    inspectors: body.inspectors ?? [],
    data: body.data,
    savedAt: new Date().toISOString(),
  };
  await write(packageKey(workId), pkg);
  const openOn = new Map(pkg.data.items.filter(item => item.status === 'open').map(item => [item.id, item.observedOn]));
  const photos = pkg.data.photos
    .filter(photo => openOn.has(photo.itemId) && photo.thumbUrl)
    .sort((a, b) => openOn.get(b.itemId)!.localeCompare(openOn.get(a.itemId)!))
    .slice(0, MAX_CACHED_THUMBS);
  let next = 0;
  const worker = async () => {
    while (next < photos.length) {
      const photo = photos[next++];
      if (await readThumb(photo.id)) continue;
      try {
        const res = await fetch(photo.thumbUrl!);
        if (res.ok) await write(thumbKey(photo.id), await res.blob());
      } catch {
        // Sem a miniatura, o apontamento abre igual; a foto só aparece com sinal.
      }
    }
  };
  await Promise.all(Array.from({ length: THUMB_DOWNLOADS }, worker));
  return pkg;
}

// ————— Fila de saída —————

/** Confere a operação pelas regras do servidor contra a vista local e a põe na fila. Quem não é TST é
 * recusado aqui, antes de qualquer gravação. Fotos levam os arquivos junto, gravados antes do registro,
 * para nunca existir registro sem arquivo. Lança a mensagem de recusa, pronta para o usuário. */
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

/** Descartar de propósito uma alteração recusada. Sai também o que dependia dela (as fotos e a
 * finalização de um apontamento que não chegou a ser criado), para a fila não travar de novo. */
export async function discard(queued: QueuedOperation): Promise<void> {
  const queue = await readQueue();
  const op = queued.operation;
  const dependents =
    op.kind === 'command' && op.command.type === 'create_item'
      ? queue.filter(q => q.id !== queued.id && q.workId === queued.workId && operationItemId(q.operation) === op.command.itemId)
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

/** Recusa de regra (4xx): fica marcada na operação. Qualquer outro erro é falha passageira. */
class BusinessError extends Error {}

/** Respostas 4xx que não são recusa de regra: o 409 é a gravação que esbarrou noutra ao mesmo tempo
 * ("os dados mudaram"), e a próxima tentativa replaneja sobre os dados novos — sai enviada, "já foi
 * registrado" ou com a recusa de verdade. Marcar como recusa levaria a pessoa a descartar o lançamento. */
const RETRY_STATUSES = new Set([408, 409, 429]);

/** Traduz a resposta da API para as três saídas da fila: sessão vencida, recusa de regra ou falha
 * passageira (sem rede, 5xx, 409), que tenta de novo depois. */
function classify(error: unknown): Error {
  if (error instanceof SafetyApiError) {
    if (error.status === 401) return new SessionExpiredError();
    if (error.status >= 400 && error.status < 500 && !RETRY_STATUSES.has(error.status)) return new BusinessError(error.message);
    return new Error(error.message);
  }
  return new Error('Sem resposta do servidor.');
}

/** Envia um comando pela mesma rota da aba 6 (`POST /api/seguranca/commands?workId=`). "Já foi
 * registrado" conta como enviado: a resposta da tentativa anterior se perdeu. */
async function sendCommand(queued: QueuedOperation): Promise<void> {
  try {
    await sendSafetyCommand(operationCommand(queued.workId, queued.operation), queued.workId);
  } catch (cause) {
    const error = classify(cause);
    if (error instanceof BusinessError && alreadyApplied(error.message)) return;
    throw error;
  }
}

/** Pede as URLs de envio da foto com o `photoId` que a fila já usa (o `uploadSafetyPhoto` da aba sorteia
 * um id novo a cada chamada, e aqui o mesmo id precisa valer em todas as tentativas, para a foto nunca
 * subir em dobro). */
async function uploadTickets(workId: string, itemId: string, photoId: string) {
  let res: Response;
  try {
    res = await fetch('/api/seguranca/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workId, itemId, photoId }),
    });
  } catch {
    throw new Error('Sem resposta do servidor.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw classify(new SafetyApiError((body as { error?: string }).error ?? 'Envio recusado pelo servidor.', res.status));
  return body as { image: { signedUrl: string }; thumb: { signedUrl: string } };
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
  let tickets: Awaited<ReturnType<typeof uploadTickets>>;
  try {
    tickets = await uploadTickets(queued.workId, itemId, photoId);
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
  await sendCommand(queued);
}

/** Sobe a fila na ordem em que foi lançada. O que sobe sai da fila na hora: se o sinal cair no meio,
 * o que já subiu não sobe de novo, e o que faltou continua guardado. Para na primeira recusa de
 * regra (a ordem importa: a foto e a finalização dependem do apontamento criado antes). */
export async function synchronize(): Promise<SyncResult> {
  const pending = async () => (await readQueue()).length;
  if (typeof navigator !== 'undefined' && !navigator.onLine)
    return { sent: 0, pending: await pending(), error: 'Sem conexão.', sessionExpired: false };
  let sent = 0;
  const touched = new Set<string>();
  for (const queued of await readQueue()) {
    try {
      if (queued.operation.kind === 'photo') await sendPhoto(queued as Parameters<typeof sendPhoto>[0]);
      else await sendCommand(queued);
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

/** Registra o service worker que guarda a casca das telas de campo para abrir sem sinal. É o mesmo
 * `/campo-sw.js` da terminalidade, com escopo só em `/campo/`: o resto do sistema continua sem cache. */
export function registerFieldServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/campo-sw.js', { scope: '/campo/', updateViaCache: 'none' }).catch(() => undefined);
}

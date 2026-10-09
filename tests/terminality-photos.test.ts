import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalityPhotoPaths, type TerminalityPhoto } from '../src/domain/terminality';
import {
  createRetryOnce,
  isPhotoUrlStale,
  PHOTO_URL_STALE_MS,
  photoRetryKey,
  refreshPhotos,
} from '../src/modules/terminalidade/photo-refresh';
import { hasPhotoFiles } from '../src/infrastructure/repositories/supabase/terminality-repository';
import { discardTerminalityUpload, uploadTerminalityPhoto } from '../src/modules/terminalidade/api';

const W = 'obra-1';
const ITEM = '11111111-1111-4111-8111-111111111111';
const PHOTO = '33333333-3333-4333-8333-000000000001';
const paths = terminalityPhotoPaths(W, ITEM, PHOTO);

const photo = (id: string, url: string): TerminalityPhoto => ({
  id,
  itemId: ITEM,
  workId: W,
  kind: 'issue',
  ...terminalityPhotoPaths(W, ITEM, id),
  createdBy: 'user-1',
  createdAt: '2026-10-08T15:00:00.000Z',
  url,
  thumbUrl: `${url}-thumb`,
});

// ----- Releitura das URLs assinadas -----

test('isPhotoUrlStale: só depois de 45 min da última leitura, e nunca sem leitura', () => {
  const at = 1_000_000;
  assert.equal(isPhotoUrlStale(undefined, at + PHOTO_URL_STALE_MS * 2), false);
  assert.equal(isPhotoUrlStale(at, at + PHOTO_URL_STALE_MS - 1), false);
  assert.equal(isPhotoUrlStale(at, at + PHOTO_URL_STALE_MS), true);
  assert.equal(isPhotoUrlStale(at, at + 10, 10), true);
});

test('photoRetryKey ignora o token: a mesma foto reassinada tem a mesma chave', () => {
  const a = `https://x.supabase.co/storage/v1/object/sign/terminalidade/${paths.storagePath}?token=aaa`;
  const b = `https://x.supabase.co/storage/v1/object/sign/terminalidade/${paths.storagePath}?token=bbb`;
  assert.equal(photoRetryKey(a), photoRetryKey(b));
  assert.notEqual(photoRetryKey(a), photoRetryKey(`https://x/${paths.thumbPath}?token=aaa`));
});

test('createRetryOnce libera uma releitura por arquivo, mesmo com URL nova', () => {
  const retry = createRetryOnce();
  assert.equal(retry('https://x/a.jpg?token=1'), true);
  assert.equal(retry('https://x/a.jpg?token=2'), false);
  assert.equal(retry('https://x/b.jpg?token=1'), true);
  assert.equal(retry('https://x/b.jpg?token=1'), false);
});

test('refreshPhotos troca pela versão atual e mantém a antiga quando a foto sumiu', () => {
  const old1 = photo('p1', 'https://x/p1?token=old');
  const old2 = photo('p2', 'https://x/p2?token=old');
  const new1 = photo('p1', 'https://x/p1?token=new');
  const refreshed = refreshPhotos([old1, old2], [new1, photo('p3', 'https://x/p3')]);
  assert.deepEqual(
    refreshed.map(p => [p.id, p.url]),
    [
      ['p1', 'https://x/p1?token=new'],
      ['p2', 'https://x/p2?token=old'],
    ],
  );
  assert.equal(refreshed.length, 2);
});

test('refreshPhotos devolve a mesma lista quando nada mudou (sem re-render à toa)', () => {
  const one = photo('p1', 'https://x/p1');
  const snapshot = [one];
  assert.equal(refreshPhotos(snapshot, [one, photo('p2', 'https://x/p2')]), snapshot);
  assert.equal(refreshPhotos(snapshot, []), snapshot);
  const empty: TerminalityPhoto[] = [];
  assert.equal(refreshPhotos(empty, [one]), empty);
});

// ----- Arquivos no Storage antes do add_photo -----

test('hasPhotoFiles exige a imagem e a miniatura entre os nomes listados', () => {
  assert.equal(hasPhotoFiles([`${PHOTO}.jpg`, `${PHOTO}-thumb.jpg`], paths), true);
  assert.equal(hasPhotoFiles([`${PHOTO}-thumb.jpg`, `${PHOTO}.jpg`, 'outra.jpg'], paths), true);
  assert.equal(hasPhotoFiles([`${PHOTO}.jpg`], paths), false);
  assert.equal(hasPhotoFiles([`${PHOTO}-thumb.jpg`], paths), false);
  assert.equal(hasPhotoFiles([], paths), false);
  // A listagem devolve só o nome, não o caminho: o caminho completo não conta.
  assert.equal(hasPhotoFiles([paths.storagePath, paths.thumbPath], paths), false);
});

// ----- Envio com segunda tentativa e descarte -----

type Call = { url: string; method: string; body?: string };
/** `fetch` falso: registra as chamadas e responde conforme o roteiro (um `ok` por PUT, na ordem). */
function fakeFetch(puts: boolean[]) {
  const calls: Call[] = [];
  const queue = [...puts];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
    if (url === '/api/terminalidade/upload-url' && method === 'POST')
      return Response.json({
        image: { path: paths.storagePath, signedUrl: 'https://up/image' },
        thumb: { path: paths.thumbPath, signedUrl: 'https://up/thumb' },
      });
    if (url === '/api/terminalidade/upload-url' && method === 'DELETE') return Response.json({ removed: true });
    if (method === 'PUT') {
      const ok = queue.shift();
      if (ok === undefined) throw new Error('PUT a mais');
      return new Response(null, { status: ok ? 200 : 500 });
    }
    throw new Error(`chamada inesperada: ${method} ${url}`);
  };
  return { calls, impl: impl as typeof fetch };
}

const upload = () =>
  uploadTerminalityPhoto({
    workId: W,
    itemId: ITEM,
    kind: 'issue',
    image: new Blob(['img']),
    thumb: new Blob(['th']),
    width: 10,
    height: 5,
  });

async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('uploadTerminalityPhoto: tudo ok envia imagem e miniatura uma vez e devolve add_photo com os caminhos do ticket', async () => {
  const { calls, impl } = fakeFetch([true, true]);
  const command = await withFetch(impl, upload);
  assert.equal(command.type, 'add_photo');
  assert.deepEqual(
    calls.map(c => `${c.method} ${c.url}`),
    ['POST /api/terminalidade/upload-url', 'PUT https://up/image', 'PUT https://up/thumb'],
  );
  const ticket = JSON.parse(calls[0].body ?? '{}') as { photoId: string };
  assert.equal(command.photoId, ticket.photoId);
  assert.deepEqual({ storagePath: command.storagePath, thumbPath: command.thumbPath }, terminalityPhotoPaths(W, ITEM, ticket.photoId));
  assert.equal(command.bytes, 3);
});

test('uploadTerminalityPhoto: um PUT que falha é repetido com o mesmo ticket, sem novo photoId', async () => {
  const { calls, impl } = fakeFetch([true, false, true]);
  const command = await withFetch(impl, upload);
  assert.deepEqual(
    calls.map(c => `${c.method} ${c.url}`),
    ['POST /api/terminalidade/upload-url', 'PUT https://up/image', 'PUT https://up/thumb', 'PUT https://up/thumb'],
  );
  assert.equal(calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(command.photoId, (JSON.parse(calls[0].body ?? '{}') as { photoId: string }).photoId);
});

test('uploadTerminalityPhoto: duas falhas seguidas descartam o envio (DELETE com o mesmo photoId) e lançam', async () => {
  const { calls, impl } = fakeFetch([true, false, false]);
  await assert.rejects(() => withFetch(impl, upload), /Não foi possível enviar a foto/);
  const last = calls.at(-1);
  assert.equal(`${last?.method} ${last?.url}`, 'DELETE /api/terminalidade/upload-url');
  assert.deepEqual(JSON.parse(last?.body ?? '{}'), JSON.parse(calls[0].body ?? '{}'));
  assert.equal(calls.filter(c => c.method === 'PUT').length, 3);
});

test('uploadTerminalityPhoto: rede caída no PUT conta como falha e também descarta', async () => {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${String(input)}`);
    if (method === 'POST')
      return Response.json({
        image: { path: paths.storagePath, signedUrl: 'https://up/image' },
        thumb: { path: paths.thumbPath, signedUrl: 'https://up/thumb' },
      });
    if (method === 'DELETE') throw new TypeError('Failed to fetch');
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;
  await assert.rejects(() => withFetch(impl, upload), /Não foi possível enviar a foto/);
  assert.deepEqual(calls, [
    'POST /api/terminalidade/upload-url',
    'PUT https://up/image',
    'PUT https://up/image',
    'DELETE /api/terminalidade/upload-url',
  ]);
});

test('discardTerminalityUpload nunca lança: a falha do descarte não muda o erro do envio', async () => {
  const impl = (async () => {
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;
  await withFetch(impl, () => discardTerminalityUpload({ workId: W, itemId: ITEM, photoId: PHOTO }));
});

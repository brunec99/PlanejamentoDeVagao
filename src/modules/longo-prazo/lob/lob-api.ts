'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  lobPhotoPaths,
  type LobCommand,
  type LobCostAccess,
  type LobData,
  type LobResponse,
  type ServiceFlow,
  type ServiceFlowDocument,
} from '@/domain/lob';

/** Cliente das visões Linha de Balanço, Fluxos e Medições (aba 1). Os dados vivem fora do snapshot
 * do planejamento: GET /api/lob, POST /api/lob/commands, /api/lob/flows e, para as fotos,
 * POST /api/lob/upload-url seguido do envio direto ao Storage (como na Terminalidade). */

/** `costAccess` (11/11/2026, apropriação de custos): `full` = valores em reais; `masked` = perfil de
 * consulta, que recebe só a porcentagem de cada item; `unavailable` = migração 0044 não aplicada. */
export type LobState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }
  | { status: 'ready'; data: LobData; costAccess: LobCostAccess };

export class LobApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'LobApiError';
  }
}
export const isLobConflict = (cause: unknown) => cause instanceof LobApiError && cause.status === 409;

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new LobApiError((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.', res.status);
  return body;
}
const post = (url: string, body: unknown, method = 'POST') =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export async function fetchLob(workId: string): Promise<LobResponse> {
  return readJson(await fetch(`/api/lob?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' }));
}
/** Executa um comando e devolve a obra já atualizada (com URLs de foto novas). */
export async function sendLobCommand(command: LobCommand): Promise<LobResponse & { launched?: number }> {
  return readJson(await post('/api/lob/commands', command));
}

// ----- Fluxos -----
export async function fetchFlows(): Promise<{ available: boolean; flows: ServiceFlow[] }> {
  return readJson(await fetch('/api/lob/flows', { cache: 'no-store' }));
}
export async function createFlow(document: ServiceFlowDocument, flowId?: string): Promise<ServiceFlow> {
  return (await readJson(await post('/api/lob/flows', { flowId, document }))).flow;
}
export async function updateFlow(flowId: string, revision: number, document: ServiceFlowDocument): Promise<ServiceFlow> {
  return (await readJson(await post('/api/lob/flows', { flowId, revision, document }, 'PUT'))).flow;
}
export async function deleteFlow(flowId: string): Promise<void> {
  await readJson(await post('/api/lob/flows', { flowId }, 'DELETE'));
}

// ----- Fotos -----
type UploadTicket = { path: string; signedUrl: string };
type UploadKey = { workId: string; itemId: string; photoId: string };
async function putBlob(ticket: UploadTicket, blob: Blob) {
  try {
    const sent = await fetch(ticket.signedUrl, { method: 'PUT', body: blob, headers: { 'content-type': 'image/jpeg' } });
    return sent.ok;
  } catch {
    return false;
  }
}
export async function discardLobUpload(key: UploadKey): Promise<void> {
  await post('/api/lob/upload-url', key, 'DELETE').catch(() => undefined);
}
/** Envia uma foto já comprimida (imagem + miniatura, JPEG) e devolve o comando `add_photo` pronto.
 * O lançamento (`itemId`) precisa existir antes: salve o valor com `save_items`. Cada PUT tem uma
 * segunda tentativa; se falhar, o que subiu é descartado no servidor. */
export async function uploadLobPhoto(input: {
  workId: string;
  itemId: string;
  image: Blob;
  thumb: Blob;
  width?: number;
  height?: number;
}): Promise<Extract<LobCommand, { type: 'add_photo' }>> {
  const photoId = crypto.randomUUID();
  const key: UploadKey = { workId: input.workId, itemId: input.itemId, photoId };
  const tickets = (await readJson(await post('/api/lob/upload-url', key))) as { image: UploadTicket; thumb: UploadTicket };
  for (const [ticket, blob] of [
    [tickets.image, input.image],
    [tickets.thumb, input.thumb],
  ] as const) {
    if (await putBlob(ticket, blob)) continue;
    if (await putBlob(ticket, blob)) continue;
    await discardLobUpload(key);
    throw new Error('Não foi possível enviar a foto. Verifique a conexão e tente de novo.');
  }
  const { storagePath, thumbPath } = lobPhotoPaths(input.workId, input.itemId, photoId);
  return {
    type: 'add_photo',
    itemId: input.itemId,
    photoId,
    storagePath,
    thumbPath,
    width: input.width,
    height: input.height,
    bytes: input.image.size,
  };
}

const PHOTO_URL_STALE_MS = 45 * 60 * 1000;

/** Estado da Linha de Balanço de uma obra: carrega, executa comandos e recarrega com o retorno do
 * servidor. As URLs das fotos valem uma hora: ao voltar ao foco com leitura velha, relê em silêncio. */
export function useLob(workId: string) {
  const [state, setState] = useState<LobState>({ status: 'loading' });
  const fetchedAt = useRef<number>(undefined);
  const version = useRef(0);
  const apply = useCallback((response: LobResponse) => {
    fetchedAt.current = Date.now();
    version.current += 1;
    if (!response.available) setState({ status: 'unavailable' });
    else {
      const { locals, services, activities, dependencies, baselines, launches, measurements, items, photos } = response;
      const costs = response.costs ?? [];
      setState({
        status: 'ready',
        data: { locals, services, activities, dependencies, baselines, launches, measurements, items, photos, costs },
        costAccess: response.costAccess ?? 'unavailable',
      });
    }
  }, []);
  const reload = useCallback(async () => {
    try {
      apply(await fetchLob(workId));
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar a Linha de Balanço.' });
    }
  }, [workId, apply]);
  const refresh = useCallback(async () => {
    const before = version.current;
    try {
      const response = await fetchLob(workId);
      if (version.current === before) apply(response);
    } catch {
      // Releitura silenciosa: a tela segue com o que tem.
    }
  }, [workId, apply]);
  // Leitura inicial (e ao trocar de obra), como na Terminalidade: a promessa aplica a resposta só
  // se o componente ainda estiver na mesma obra.
  useEffect(() => {
    let active = true;
    fetchLob(workId)
      .then(response => active && apply(response))
      .catch(
        error =>
          active &&
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar a Linha de Balanço.' }),
      );
    return () => {
      active = false;
    };
  }, [apply, workId]);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && fetchedAt.current !== undefined && Date.now() - fetchedAt.current >= PHOTO_URL_STALE_MS)
        refresh();
    };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);
  /** Executa um comando; erro vira exceção para quem chamou mostrar. Em 409 os dados são relidos. */
  const execute = useCallback(
    async (command: LobCommand) => {
      try {
        const response = await sendLobCommand(command);
        apply(response);
        return response;
      } catch (error) {
        if (isLobConflict(error)) await reload();
        throw error;
      }
    },
    [apply, reload],
  );
  return { state, reload, refresh, execute, apply };
}

'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  safetyPhotoPaths,
  type SafetyCommand,
  type SafetyData,
  type SafetyInspector,
  type SafetyPhotoKind,
  type SafetyResponse,
} from '@/domain/safety';
import { createRetryOnce, isPhotoUrlStale } from '@/modules/terminalidade/photo-refresh';
import { subscribeExpiredPhoto } from '@/modules/terminalidade/api';
import type { PendingPhoto } from '@/modules/terminalidade/photo-input';

/** Cliente da aba 6, Segurança do trabalho (05/11/2026). Mesmo desenho da aba 5: leitura e gravação
 * próprias, fora do snapshot — GET /api/seguranca, POST /api/seguranca/commands e, para as fotos,
 * POST /api/seguranca/upload-url seguido do envio direto ao Storage. O visualizador e a grade de fotos são
 * os da aba 5 (`@/modules/terminalidade/photo-viewer` e `photo-input`), que avisam foto vencida pelo
 * barramento da aba 5; `useSafety` assina esse barramento. */

export interface SafetyView extends SafetyData {
  /** Quem está logado é TST: só então a tela mostra os botões de gravar. O servidor confere de novo. */
  canEdit: boolean;
  /** TSTs com acesso à obra (para dizer quem pode lançar). */
  inspectors: SafetyInspector[];
}

export type SafetyState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; data: SafetyView };

/** Erro da API com o status HTTP: a tela decide o que fazer (409 = os dados mudaram, recarregar). */
export class SafetyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SafetyApiError';
  }
}
export const isSafetyConflict = (cause: unknown) => cause instanceof SafetyApiError && cause.status === 409;

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new SafetyApiError((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.', res.status);
  return body;
}

export async function fetchSafety(workId: string): Promise<SafetyResponse> {
  return readJson(await fetch(`/api/seguranca?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' }));
}

/** Executa um comando e devolve os dados da obra já atualizados (com URLs de foto novas). Os comandos de
 * tipo (`create_type`, `update_type`, `reorder_types`) não têm obra própria: a tela manda `workId` junto,
 * só para receber de volta a obra aberta. */
export async function sendSafetyCommand(command: SafetyCommand, workId: string): Promise<SafetyResponse> {
  return readJson(
    await fetch(`/api/seguranca/commands?workId=${encodeURIComponent(workId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }),
  );
}

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

/** Pede ao servidor para apagar os arquivos de um envio que não vai virar `add_photo` (melhor esforço). */
export async function discardSafetyUpload(key: UploadKey): Promise<void> {
  await fetch('/api/seguranca/upload-url', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(key),
  }).catch(() => undefined);
}

/** Envia uma foto já comprimida (imagem + miniatura, JPEG) e devolve o comando `add_photo` pronto. O
 * apontamento precisa existir antes (create_item). Cada PUT tem uma segunda tentativa com o mesmo ticket. */
export async function uploadSafetyPhoto(input: {
  workId: string;
  itemId: string;
  kind: SafetyPhotoKind;
  image: Blob;
  thumb: Blob;
  width?: number;
  height?: number;
}): Promise<Extract<SafetyCommand, { type: 'add_photo' }>> {
  const photoId = crypto.randomUUID();
  const key: UploadKey = { workId: input.workId, itemId: input.itemId, photoId };
  const tickets = (await readJson(
    await fetch('/api/seguranca/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(key),
    }),
  )) as { image: UploadTicket; thumb: UploadTicket };
  for (const [ticket, blob] of [
    [tickets.image, input.image],
    [tickets.thumb, input.thumb],
  ] as const) {
    if (await putBlob(ticket, blob)) continue;
    if (await putBlob(ticket, blob)) continue;
    await discardSafetyUpload(key);
    throw new Error('Não foi possível enviar a foto. Verifique a conexão e tente de novo.');
  }
  const { storagePath, thumbPath } = safetyPhotoPaths(input.workId, input.itemId, photoId);
  return {
    type: 'add_photo',
    itemId: input.itemId,
    photoId,
    kind: input.kind,
    storagePath,
    thumbPath,
    width: input.width,
    height: input.height,
    bytes: input.image.size,
  };
}

/** Envia as fotos pendentes (do `PhotoInput` da aba 5) uma a uma: Storage e depois `add_photo`. Na primeira
 * falha para e lança um erro dizendo qual foto falhou; as que já subiram ficam no apontamento. */
export async function uploadPendingSafetyPhotos({
  workId,
  itemId,
  kind,
  photos,
  execute,
  onProgress,
  onUploaded,
}: {
  workId: string;
  itemId: string;
  kind: SafetyPhotoKind;
  photos: PendingPhoto[];
  execute: (command: SafetyCommand) => Promise<void>;
  onProgress: (current: number, total: number) => void;
  onUploaded: (pendingId: string) => void;
}) {
  for (const [index, photo] of photos.entries()) {
    onProgress(index + 1, photos.length);
    try {
      const command = await uploadSafetyPhoto({
        workId,
        itemId,
        kind,
        image: photo.image,
        thumb: photo.thumb,
        width: photo.width,
        height: photo.height,
      });
      await execute(command);
    } catch (cause) {
      const detail = cause instanceof Error && cause.message ? cause.message : 'Falha na comunicação com o servidor.';
      const which = photos.length > 1 ? `A foto ${index + 1} de ${photos.length}` : 'A foto';
      throw new Error(`${which} não foi enviada. ${detail}`);
    }
    onUploaded(photo.id);
  }
}

/** Estado da aba para uma obra: carrega, executa comandos e recarrega com o retorno do servidor. As URLs
 * das fotos valem uma hora: ao voltar ao foco com leitura velha, ou quando uma imagem falha, relê em
 * silêncio. */
export function useSafety(workId: string) {
  const [state, setState] = useState<SafetyState>({ status: 'loading' });
  const fetchedAt = useRef<number>(undefined);
  const version = useRef(0);
  const apply = useCallback((response: SafetyResponse) => {
    fetchedAt.current = Date.now();
    version.current += 1;
    if (!response.available) setState({ status: 'unavailable' });
    else {
      const { types, items, photos, canEdit, inspectors } = response;
      setState({ status: 'ready', data: { types, items, photos, canEdit, inspectors } });
    }
  }, []);
  const reload = useCallback(async () => {
    try {
      apply(await fetchSafety(workId));
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar os apontamentos.' });
    }
  }, [apply, workId]);
  useEffect(() => {
    let active = true;
    fetchSafety(workId)
      .then(response => active && apply(response))
      .catch(error => active && setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar.' }));
    return () => {
      active = false;
    };
  }, [apply, workId]);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      const seen = version.current;
      try {
        const response = await fetchSafety(workId);
        if (active && version.current === seen) apply(response);
      } catch {
        // Silencioso: a tela segue com os dados que tem.
      } finally {
        inFlight = false;
      }
    };
    const retry = createRetryOnce();
    const unsubscribe = subscribeExpiredPhoto(url => {
      if (retry(url)) void refresh();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isPhotoUrlStale(fetchedAt.current, Date.now())) void refresh();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [apply, workId]);
  /** Lança o erro do servidor (mensagem pronta para o usuário); em caso de sucesso, a tela já atualiza. */
  const execute = useCallback(
    async (command: SafetyCommand) => {
      apply(await sendSafetyCommand(command, workId));
    },
    [apply, workId],
  );
  return { state, reload, execute };
}

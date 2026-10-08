'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  terminalityPhotoPaths,
  type TerminalityCommand,
  type TerminalityData,
  type TerminalityPhotoKind,
  type TerminalityResponse,
} from '@/domain/terminality';

/** Cliente da aba 5. A lista de pendências vive fora do snapshot do planejamento, então tem leitura
 * e gravação próprias: GET /api/terminalidade, POST /api/terminalidade/commands e, para as fotos,
 * POST /api/terminalidade/upload-url seguido do envio direto ao Storage (como no IFC). */

export type TerminalityState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }
  | { status: 'ready'; data: TerminalityData };

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.');
  return body;
}

export async function fetchTerminality(workId: string): Promise<TerminalityResponse> {
  return readJson(await fetch(`/api/terminalidade?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' }));
}

/** Executa um comando e devolve os dados da obra já atualizados (com URLs de foto novas). */
export async function sendTerminalityCommand(command: TerminalityCommand): Promise<TerminalityResponse> {
  return readJson(
    await fetch('/api/terminalidade/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }),
  );
}

type UploadTicket = { path: string; signedUrl: string };

/** Envia uma foto já comprimida (imagem + miniatura, JPEG) e devolve o comando `add_photo` pronto.
 * A pendência precisa existir antes (create_item). Quem chama executa o comando devolvido. */
export async function uploadTerminalityPhoto(input: {
  workId: string;
  itemId: string;
  kind: TerminalityPhotoKind;
  image: Blob;
  thumb: Blob;
  width?: number;
  height?: number;
}): Promise<Extract<TerminalityCommand, { type: 'add_photo' }>> {
  const photoId = crypto.randomUUID();
  const tickets = (await readJson(
    await fetch('/api/terminalidade/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workId: input.workId, itemId: input.itemId, photoId }),
    }),
  )) as { image: UploadTicket; thumb: UploadTicket };
  for (const [ticket, blob] of [
    [tickets.image, input.image],
    [tickets.thumb, input.thumb],
  ] as const) {
    const sent = await fetch(ticket.signedUrl, { method: 'PUT', body: blob, headers: { 'content-type': 'image/jpeg' } });
    if (!sent.ok) throw new Error('Não foi possível enviar a foto. Verifique a conexão e tente de novo.');
  }
  const { storagePath, thumbPath } = terminalityPhotoPaths(input.workId, input.itemId, photoId);
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

/** Estado da aba para uma obra: carrega, executa comandos e recarrega com o retorno do servidor. */
export function useTerminality(workId: string) {
  const [state, setState] = useState<TerminalityState>({ status: 'loading' });
  const apply = useCallback((response: TerminalityResponse) => {
    if (!response.available) setState({ status: 'unavailable' });
    else {
      const { floors, units, types, people, items, photos } = response;
      setState({ status: 'ready', data: { floors, units, types, people, items, photos } });
    }
  }, []);
  const reload = useCallback(async () => {
    try {
      apply(await fetchTerminality(workId));
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar as pendências.' });
    }
  }, [apply, workId]);
  useEffect(() => {
    let active = true;
    fetchTerminality(workId)
      .then(response => active && apply(response))
      .catch(error => active && setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar.' }));
    return () => {
      active = false;
    };
  }, [apply, workId]);
  /** Lança o erro do servidor (mensagem pronta para o usuário); em caso de sucesso, a tela já atualiza. */
  const execute = useCallback(
    async (command: TerminalityCommand) => {
      apply(await sendTerminalityCommand(command));
    },
    [apply],
  );
  return { state, reload, execute };
}

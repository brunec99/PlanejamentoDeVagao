'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  terminalityPhotoPaths,
  type TerminalityCommand,
  type TerminalityData,
  type TerminalityPhotoKind,
  type TerminalityResponse,
} from '@/domain/terminality';
import { createRetryOnce, isPhotoUrlStale } from './photo-refresh';

/** Cliente da aba 5. A lista de pendências vive fora do snapshot do planejamento, então tem leitura
 * e gravação próprias: GET /api/terminalidade, POST /api/terminalidade/commands e, para as fotos,
 * POST /api/terminalidade/upload-url seguido do envio direto ao Storage (como no IFC). */

export type TerminalityState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; data: TerminalityData };

/** Erro da API com o status HTTP: a tela decide o que fazer (409 = os dados mudaram, recarregar). */
export class TerminalityApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'TerminalityApiError';
  }
}
export const isTerminalityConflict = (cause: unknown) => cause instanceof TerminalityApiError && cause.status === 409;

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new TerminalityApiError((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.', res.status);
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
type UploadKey = { workId: string; itemId: string; photoId: string };

/** Um PUT no Storage; rede caída conta como falha, não como exceção. */
async function putBlob(ticket: UploadTicket, blob: Blob) {
  try {
    const sent = await fetch(ticket.signedUrl, { method: 'PUT', body: blob, headers: { 'content-type': 'image/jpeg' } });
    return sent.ok;
  } catch {
    return false;
  }
}

/** Pede ao servidor para apagar os arquivos de um envio que não vai virar `add_photo`. Melhor
 * esforço: a falha aqui não muda o erro que o usuário já vai ver. */
export async function discardTerminalityUpload(key: UploadKey): Promise<void> {
  await fetch('/api/terminalidade/upload-url', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(key),
  }).catch(() => undefined);
}

/** Envia uma foto já comprimida (imagem + miniatura, JPEG) e devolve o comando `add_photo` pronto.
 * A pendência precisa existir antes (create_item). Quem chama executa o comando devolvido.
 * Cada PUT tem uma segunda tentativa com o mesmo ticket (rede instável no canteiro) antes de
 * desistir: uma tentativa nova de quem chama gera outro photoId, e o que já subiu viraria órfão.
 * Se mesmo assim falhar, o que subiu é descartado pelo servidor (ver DELETE em upload-url). */
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
  const key: UploadKey = { workId: input.workId, itemId: input.itemId, photoId };
  const tickets = (await readJson(
    await fetch('/api/terminalidade/upload-url', {
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
    await discardTerminalityUpload(key);
    throw new Error('Não foi possível enviar a foto. Verifique a conexão e tente de novo.');
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

const expiredPhotoListeners = new Set<(url: string) => void>();
/** Uma imagem assinada falhou ao carregar (link vencido): quem tem `useTerminality` aberto relê os
 * dados, uma vez por arquivo, e a tela recebe URLs novas. Chamado pelo `onError` da `<img>`. */
export function reportExpiredPhoto(url: string) {
  for (const listener of expiredPhotoListeners) listener(url);
}

/** Estado da aba para uma obra: carrega, executa comandos e recarrega com o retorno do servidor.
 * As URLs das fotos valem uma hora: ao voltar ao foco com leitura velha, ou quando uma imagem
 * falha, relê em silêncio (sem passar por "carregando"). */
export function useTerminality(workId: string) {
  const [state, setState] = useState<TerminalityState>({ status: 'loading' });
  /** Quando os dados atuais chegaram e quantas vezes mudaram: a releitura silenciosa não pode
   * sobrescrever a resposta de um comando que chegou enquanto ela estava no ar. */
  const fetchedAt = useRef<number>(undefined);
  const version = useRef(0);
  const apply = useCallback((response: TerminalityResponse) => {
    fetchedAt.current = Date.now();
    version.current += 1;
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
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      const seen = version.current;
      try {
        const response = await fetchTerminality(workId);
        if (active && version.current === seen) apply(response);
      } catch {
        // Silencioso: a tela segue com os dados que tem; o próximo comando ou "tentar de novo" avisa.
      } finally {
        inFlight = false;
      }
    };
    const retry = createRetryOnce();
    const onExpired = (url: string) => {
      if (retry(url)) void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && isPhotoUrlStale(fetchedAt.current, Date.now())) void refresh();
    };
    expiredPhotoListeners.add(onExpired);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      expiredPhotoListeners.delete(onExpired);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
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

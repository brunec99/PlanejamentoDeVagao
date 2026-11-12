'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PendingCommand, PendingData, PendingPerson, PendingResponse, PendingSourceOptions } from '@/domain/pending-board';

/** Cliente da lista de pendência (aba 2, 10/11/2026). Mesmo desenho das abas 5 e 6: leitura e gravação
 * próprias, fora do snapshot do planejamento — GET /api/pendencias e POST /api/pendencias/commands, que
 * devolve a obra já atualizada. */

export interface PendingView extends PendingData {
  /** Quem pode ser responsável e ser marcado com @: perfis com a obra liberada. */
  people: PendingPerson[];
  /** Quem está logado é admin (pode excluir qualquer card). */
  admin: boolean;
  actorId: string;
}

export type PendingState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; data: PendingView };

/** Erro da API com o status HTTP. */
export class PendingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'PendingApiError';
  }
}

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new PendingApiError((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.', res.status);
  return body;
}

export async function fetchPending(workId: string): Promise<PendingResponse> {
  return readJson(await fetch(`/api/pendencias?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' }));
}

/** Tarefas do médio prazo e serviços do longo prazo a que uma pendência nova pode ser ligada. */
export async function fetchPendingSources(workId: string): Promise<PendingSourceOptions> {
  return readJson(await fetch(`/api/pendencias/origens?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' }));
}

/** Executa um comando e devolve a lista da obra já atualizada. */
export async function sendPendingCommand(command: PendingCommand, workId: string): Promise<PendingResponse> {
  return readJson(
    await fetch(`/api/pendencias/commands?workId=${encodeURIComponent(workId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }),
  );
}

export const errorText = (cause: unknown, fallback: string) => (cause instanceof Error && cause.message ? cause.message : fallback);

const toState = (response: PendingResponse): PendingState => {
  if (!response.available) return { status: 'unavailable' };
  const { cards, checklists, items, messages, people, admin, actorId } = response;
  return { status: 'ready', data: { cards, checklists, items, messages, people, admin, actorId } };
};

/** A conversa é de várias pessoas: ao voltar para a aba do navegador com leitura mais velha que isto, a
 * tela relê em silêncio. */
const STALE_MS = 30_000;

/** Quem chama pode adiantar o resultado na tela (`optimistic`); se o servidor recusar, a tela volta. */
export type PendingExecute = (command: PendingCommand, optimistic?: (data: PendingView) => PendingView) => Promise<void>;

/** Estado da lista de uma obra: carrega, executa comandos e troca os dados pelo retorno do servidor. */
export function usePending(workId: string) {
  const [state, setState] = useState<PendingState>({ status: 'loading' });
  // O estado mais recente fora do render: o comando otimista precisa saber para onde voltar.
  const latest = useRef<PendingState>(state);
  const fetchedAt = useRef(0);
  const version = useRef(0);
  const commit = useCallback((next: PendingState) => {
    latest.current = next;
    setState(next);
  }, []);
  const apply = useCallback(
    (response: PendingResponse) => {
      fetchedAt.current = Date.now();
      version.current += 1;
      commit(toState(response));
    },
    [commit],
  );
  const reload = useCallback(async () => {
    try {
      apply(await fetchPending(workId));
    } catch (error) {
      commit({ status: 'error', message: errorText(error, 'Falha ao carregar o Quadro de Restrições.') });
    }
  }, [apply, commit, workId]);
  /** Relê sem mexer na tela se falhar, e sem atropelar um comando que respondeu no meio do caminho. */
  const refresh = useCallback(async () => {
    const seen = version.current;
    try {
      const response = await fetchPending(workId);
      if (version.current === seen) apply(response);
    } catch {
      // Silencioso: a tela segue com os dados que tem.
    }
  }, [apply, workId]);
  useEffect(() => {
    let active = true;
    fetchPending(workId)
      .then(response => active && apply(response))
      .catch(error => active && commit({ status: 'error', message: errorText(error, 'Falha ao carregar o Quadro de Restrições.') }));
    return () => {
      active = false;
    };
  }, [apply, commit, workId]);
  useEffect(() => {
    let inFlight = false;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || inFlight || Date.now() - fetchedAt.current < STALE_MS) return;
      if (latest.current.status !== 'ready') return;
      inFlight = true;
      void refresh().finally(() => {
        inFlight = false;
      });
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  /** Lança o erro do servidor (mensagem pronta para o usuário); em caso de sucesso, a tela já atualiza. */
  const execute = useCallback<PendingExecute>(
    async (command, optimistic) => {
      const before = latest.current;
      let shown: PendingState | undefined;
      if (optimistic && before.status === 'ready') {
        shown = { status: 'ready', data: optimistic(before.data) };
        version.current += 1;
        commit(shown);
      }
      try {
        apply(await sendPendingCommand(command, workId));
      } catch (cause) {
        if (shown) {
          // Ninguém mexeu depois: volta ao que era. Se outro comando já trocou os dados, relê do servidor.
          if (latest.current === shown) commit(before);
          else void refresh();
        }
        throw cause;
      }
    },
    [apply, commit, refresh, workId],
  );
  return { state, reload, refresh, execute };
}

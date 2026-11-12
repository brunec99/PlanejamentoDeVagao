'use client';
import { useCallback, useEffect, useState } from 'react';
import type { HeadcountCommand, HeadcountEntry, HeadcountResponse } from '@/domain/headcount';
import { applyHeadcountMutation } from '@/application/use-cases/headcount-commands';

/** Cliente da aba 7, Histograma (11/11/2026). Leitura e gravação próprias, fora do snapshot: GET
 * /api/histograma traz o efetivo inteiro da obra e POST /api/histograma/commands devolve só o que mudou —
 * a tela aplica a mesma mutação no que já tem, em vez de reler milhares de linhas a cada lançamento. */

export interface HeadcountView {
  entries: HeadcountEntry[];
  /** Quem está logado pode lançar. O servidor confere de novo. */
  canEdit: boolean;
}
export type HeadcountState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; data: HeadcountView };

type Applied = { insert: HeadcountEntry[]; update: HeadcountEntry[]; delete: string[] };

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.');
  return body;
}

export async function fetchHeadcount(workId: string): Promise<HeadcountResponse> {
  return readJson(await fetch(`/api/histograma?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' }));
}

async function sendHeadcountCommand(command: HeadcountCommand, workId: string): Promise<Applied> {
  return readJson(
    await fetch(`/api/histograma/commands?workId=${encodeURIComponent(workId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }),
  );
}

/** Estado da aba para uma obra: carrega, executa comandos e aplica o retorno do servidor. */
export function useHeadcount(workId: string) {
  const [state, setState] = useState<HeadcountState>({ status: 'loading' });
  const apply = useCallback((response: HeadcountResponse) => {
    if (!response.available) setState({ status: 'unavailable' });
    else setState({ status: 'ready', data: { entries: response.entries, canEdit: response.canEdit } });
  }, []);
  const reload = useCallback(async () => {
    try {
      apply(await fetchHeadcount(workId));
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar o histograma.' });
    }
  }, [apply, workId]);
  useEffect(() => {
    let active = true;
    fetchHeadcount(workId)
      .then(response => active && apply(response))
      .catch(error => active && setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar.' }));
    return () => {
      active = false;
    };
  }, [apply, workId]);
  /** Lança o erro do servidor (mensagem pronta para o usuário); em caso de sucesso, a tela já atualiza. */
  const execute = useCallback(
    async (command: HeadcountCommand) => {
      const applied = await sendHeadcountCommand(command, workId);
      setState(current =>
        current.status === 'ready'
          ? { status: 'ready', data: { ...current.data, entries: applyHeadcountMutation(current.data.entries, applied) } }
          : current,
      );
      return applied;
    },
    [workId],
  );
  return { state, reload, execute };
}

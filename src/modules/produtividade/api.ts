'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ProductionCommand, ProductionEntry, ProductionResponse } from '@/domain/production';
import { applyProductionMutation } from '@/application/use-cases/production-commands';

/** Cliente da aba 8, Controle de produtividade (11/11/2026). Leitura e gravação próprias, fora do snapshot: GET
 * /api/produtividade traz os lançamentos inteiros da obra e POST /api/produtividade/commands devolve só o que mudou —
 * a tela aplica a mesma mutação no que já tem, em vez de reler milhares de linhas a cada lançamento. */

export interface ProductionView {
  entries: ProductionEntry[];
  /** Quem está logado pode lançar. O servidor confere de novo. */
  canEdit: boolean;
}
export type ProductionState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; data: ProductionView };

type Applied = { insert: ProductionEntry[]; update: ProductionEntry[]; delete: string[] };

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.');
  return body;
}

export async function fetchProduction(workId: string): Promise<ProductionResponse> {
  return readJson(await fetch(`/api/produtividade?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' }));
}

async function sendProductionCommand(command: ProductionCommand, workId: string): Promise<Applied> {
  return readJson(
    await fetch(`/api/produtividade/commands?workId=${encodeURIComponent(workId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }),
  );
}

/** Estado da aba para uma obra: carrega, executa comandos e aplica o retorno do servidor. */
export function useProduction(workId: string) {
  const [state, setState] = useState<ProductionState>({ status: 'loading' });
  const apply = useCallback((response: ProductionResponse) => {
    if (!response.available) setState({ status: 'unavailable' });
    else setState({ status: 'ready', data: { entries: response.entries, canEdit: response.canEdit } });
  }, []);
  const reload = useCallback(async () => {
    try {
      apply(await fetchProduction(workId));
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar o controle de produtividade.' });
    }
  }, [apply, workId]);
  useEffect(() => {
    let active = true;
    fetchProduction(workId)
      .then(response => active && apply(response))
      .catch(error => active && setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar.' }));
    return () => {
      active = false;
    };
  }, [apply, workId]);
  /** Lança o erro do servidor (mensagem pronta para o usuário); em caso de sucesso, a tela já atualiza. */
  const execute = useCallback(
    async (command: ProductionCommand) => {
      const applied = await sendProductionCommand(command, workId);
      setState(current =>
        current.status === 'ready'
          ? { status: 'ready', data: { ...current.data, entries: applyProductionMutation(current.data.entries, applied) } }
          : current,
      );
      return applied;
    },
    [workId],
  );
  return { state, reload, execute };
}

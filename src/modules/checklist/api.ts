'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ChecklistCommand, ChecklistData, ChecklistPhoto, ChecklistResponse } from '@/domain/equipment-checklist';

/** Cliente da aba 9, Checklist de equipamentos (11/11/2026). Leitura e gravação próprias, fora do
 * snapshot: GET /api/checklist traz os modelos, os equipamentos e as inspeções recentes da obra, e POST
 * /api/checklist/commands devolve a obra já atualizada, no mesmo formato. */

export interface ChecklistView extends ChecklistData {
  /** Quem está logado é TST ou admin. O servidor confere de novo. */
  canEdit: boolean;
  /** Quem está logado é admin: cadastra modelos e equipamentos e troca o link do QR. */
  canManage: boolean;
  /** "Hoje" no fuso da obra, vindo do servidor. */
  today: string;
}
export type ChecklistState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; data: ChecklistView };

async function readJson(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.');
  return body;
}

async function fetchChecklist(workId: string): Promise<ChecklistResponse> {
  return readJson(await fetch(`/api/checklist?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' }));
}

async function sendChecklistCommand(command: ChecklistCommand, workId: string): Promise<ChecklistResponse> {
  return readJson(
    await fetch(`/api/checklist/commands?workId=${encodeURIComponent(workId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }),
  );
}

export interface RunFiles {
  signatureUrl: string | null;
  photos: ChecklistPhoto[];
}
/** A assinatura e as fotos de uma inspeção, em URLs assinadas: pedidas só quando alguém abre a inspeção. */
export async function fetchRunFiles(workId: string, runId: string): Promise<RunFiles> {
  return readJson(
    await fetch(`/api/checklist/arquivos?workId=${encodeURIComponent(workId)}&runId=${encodeURIComponent(runId)}`, { cache: 'no-store' }),
  );
}

const toState = (response: ChecklistResponse): ChecklistState => {
  if (!response.available) return { status: 'unavailable' };
  const { models, equipment, runs, canEdit, canManage, today } = response;
  return { status: 'ready', data: { models, equipment, runs, canEdit, canManage: canManage === true, today } };
};

/** Estado da aba para uma obra: carrega, executa comandos e aplica o retorno do servidor. */
export function useChecklist(workId: string) {
  const [state, setState] = useState<ChecklistState>({ status: 'loading' });
  const reload = useCallback(async () => {
    try {
      setState(toState(await fetchChecklist(workId)));
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar os checklists.' });
    }
  }, [workId]);
  useEffect(() => {
    let active = true;
    fetchChecklist(workId)
      .then(response => active && setState(toState(response)))
      .catch(error => active && setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar.' }));
    return () => {
      active = false;
    };
  }, [workId]);
  /** Lança o erro do servidor (mensagem pronta para o usuário); em caso de sucesso, a tela já atualiza. */
  const execute = useCallback(
    async (command: ChecklistCommand) => {
      setState(toState(await sendChecklistCommand(command, workId)));
    },
    [workId],
  );
  return { state, reload, execute };
}

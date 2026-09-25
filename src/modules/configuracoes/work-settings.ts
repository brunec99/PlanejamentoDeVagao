'use client';
import { useCallback, useEffect, useState } from 'react';

export type WorkSettings = { available: boolean; weekOneStart: string | null };
type State = { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & WorkSettings);

/** Configurações da obra que vivem fora do snapshot (`/api/work-settings`). Enquanto carregam, ou se
 * falharem, quem usa cai no comportamento automático — a planilha não espera por elas. */
export function useWorkSettings(workId: string) {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    fetch(`/api/work-settings?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' })
      .then(async res => { if (!res.ok) throw new Error(); return res.json() as Promise<WorkSettings>; })
      .then(settings => { if (active) setState({ status: 'ready', ...settings }); })
      .catch(() => { if (active) setState({ status: 'error' }); });
    return () => { active = false; };
  }, [workId]);
  const saveWeekOne = useCallback(async (weekOneStart: string | null) => {
    const res = await fetch('/api/work-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workId, weekOneStart }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Não foi possível salvar.');
    setState({ status: 'ready', ...(body as WorkSettings) });
  }, [workId]);
  return { state, weekOneStart: state.status === 'ready' ? state.weekOneStart : null, saveWeekOne };
}

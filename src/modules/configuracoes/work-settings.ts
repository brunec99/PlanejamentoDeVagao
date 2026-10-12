'use client';
import { useCallback, useEffect, useState } from 'react';

export type WorkLocation = { place: string; latitude: number; longitude: number };
export type WorkSettings = {
  available: boolean;
  weekOneStart: string | null;
  place: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Falso enquanto a migração 0029 não foi aplicada: o local não pode ser lido nem salvo. */
  locationAvailable: boolean;
};
type State = { status: 'loading' } | { status: 'error' } | ({ status: 'ready' } & WorkSettings);

/** O local só existe com as três colunas preenchidas; qualquer uma vazia é "não informado". */
export function locationOf(settings: Pick<WorkSettings, 'place' | 'latitude' | 'longitude'>): WorkLocation | null {
  const { place, latitude, longitude } = settings;
  if (!place || latitude === null || longitude === null) return null;
  return { place, latitude, longitude };
}

/** Configurações da obra que vivem fora do snapshot (`/api/work-settings`): a semana 1 e o local.
 * Enquanto carregam, ou se falharem, quem usa cai no comportamento automático — a planilha não
 * espera por elas. Cada `save*` manda só a sua chave; a rota preserva o resto. */
export function useWorkSettings(workId: string) {
  const [state, setState] = useState<State>({ status: 'loading' });
  useEffect(() => {
    let active = true;
    fetch(`/api/work-settings?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error();
        return res.json() as Promise<WorkSettings>;
      })
      .then(settings => {
        if (active) setState({ status: 'ready', ...settings });
      })
      .catch(() => {
        if (active) setState({ status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [workId]);
  const save = useCallback(
    async (patch: { weekOneStart?: string | null; location?: WorkLocation | null }) => {
      const res = await fetch('/api/work-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workId, ...patch }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível salvar.');
      setState({ status: 'ready', ...(body as WorkSettings) });
    },
    [workId],
  );
  const saveWeekOne = useCallback((weekOneStart: string | null) => save({ weekOneStart }), [save]);
  const saveLocation = useCallback((location: WorkLocation | null) => save({ location }), [save]);
  const ready = state.status === 'ready';
  return {
    state,
    weekOneStart: ready ? state.weekOneStart : null,
    location: ready ? locationOf(state) : null,
    locationAvailable: ready && state.locationAvailable,
    saveWeekOne,
    saveLocation,
  };
}

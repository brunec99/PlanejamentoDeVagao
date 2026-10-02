'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HistoryEvent } from '@/domain/entities';
import { usePlanning } from './planning-provider';

type State = { status: 'loading' | 'ready' | 'error'; events: HistoryEvent[] };

/** Histórico das entidades que a tela mostra, lido de `/api/history`. Recarrega sozinho quando o
 * planejamento é recarregado (depois de um comando, por exemplo), porque é aí que surgem eventos. */
export function useHistory(workId: string, entityIds: string[], options: { action?: string; limit?: number; enabled?: boolean } = {}) {
  const { action, limit, enabled = true } = options;
  const context = usePlanning();
  const updatedAt = context.state === 'ready' ? context.updatedAt : 0;
  const key = useMemo(() => [...new Set(entityIds)].sort().join(','), [entityIds]);
  const [state, setState] = useState<State>({ status: 'loading', events: [] });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled || !key) {
      setState({ status: 'ready', events: [] });
      return;
    }
    let active = true;
    const params = new URLSearchParams({ workId, entityIds: key });
    if (action) params.set('action', action);
    if (limit) params.set('limit', String(limit));
    fetch(`/api/history?${params}`, { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error();
        return (await res.json()) as { events: HistoryEvent[] };
      })
      .then(body => {
        if (active) setState({ status: 'ready', events: body.events });
      })
      .catch(() => {
        if (active) setState(current => ({ status: 'error', events: current.events }));
      });
    return () => {
      active = false;
    };
  }, [workId, key, action, limit, enabled, updatedAt, attempt]);
  const reload = useCallback(() => setAttempt(n => n + 1), []);
  return { ...state, reload };
}

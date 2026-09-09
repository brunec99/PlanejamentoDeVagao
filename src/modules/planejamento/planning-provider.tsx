'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Planning } from '@/application/use-cases/get-planning';
import type { Command } from '@/application/use-cases/commands';
type PlanningState = { state: 'loading' } | { state: 'error' } | { state: 'ready'; planning: Planning; actorId: string; execute: (command: Command) => Promise<string>; refresh: () => Promise<void> };
type Loaded = { planning: Planning; actorId: string };
const Context = createContext<PlanningState>({ state: 'loading' });

async function fetchPlanning(): Promise<Loaded> {
  const res = await fetch('/api/planning', { cache: 'no-store' });
  if (!res.ok) throw new Error('Falha ao carregar o planejamento.');
  const { actorId, ...planning } = (await res.json()) as Planning & { actorId: string };
  return { planning, actorId };
}

export function PlanningProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    fetchPlanning().then(result => { if (active) setLoaded(result); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  const refresh = async () => { setLoaded(await fetchPlanning()); };
  const execute = async (command: Command) => {
    const res = await fetch('/api/planning/commands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Falha ao aplicar o comando.');
    setLoaded(await fetchPlanning());
    return body.id as string;
  };
  const value: PlanningState = error ? { state: 'error' } : loaded ? { state: 'ready', planning: loaded.planning, actorId: loaded.actorId, execute, refresh } : { state: 'loading' };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePlanning() { return useContext(Context); }

'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Planning } from '@/application/use-cases/get-planning';
import type { Command } from '@/application/use-cases/commands';

type Ready = {
  state: 'ready';
  planning: Planning;
  actorId: string;
  execute: (command: Command) => Promise<string>;
  refresh: () => Promise<void>;
  /** Uma recarga silenciosa está em andamento; os dados na tela continuam válidos. */
  refreshing: boolean;
  /** Quando a última recarga bem-sucedida aconteceu, em milissegundos. */
  updatedAt: number;
  /** A última recarga falhou: os dados na tela são os de `updatedAt`. */
  stale: boolean;
};
type PlanningState = { state: 'loading' } | { state: 'error'; message: string; retry: () => void } | Ready;
type Loaded = { planning: Planning; actorId: string };
const Context = createContext<PlanningState>({ state: 'loading' });

/** Recarga ao voltar para a aba, se os dados têm mais que isto. */
const FOCUS_AFTER = 30_000;
/** Recarga periódica enquanto a aba está visível: numa reunião, dois planejadores veem o mesmo. */
const EVERY = 120_000;

async function fetchPlanning(): Promise<Loaded> {
  const res = await fetch('/api/planning', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'Falha ao carregar o planejamento.');
  }
  const { actorId, ...planning } = (await res.json()) as Planning & { actorId: string };
  return { planning, actorId };
}

export function PlanningProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const inFlight = useRef<Promise<Loaded> | undefined>(undefined);
  const mutating = useRef(0);
  const latest = useRef(0);

  /** Uma única requisição por vez: quem pedir enquanto outra corre recebe a mesma promessa. */
  const load = useCallback(async (silent: boolean) => {
    if (!inFlight.current) {
      if (silent) setRefreshing(true);
      inFlight.current = fetchPlanning()
        .then(result => {
          setLoaded(result);
          setError('');
          setStale(false);
          setUpdatedAt(Date.now());
          latest.current = Date.now();
          return result;
        })
        .catch(cause => {
          // Com dados na tela, a falha só marca que eles podem estar velhos; sem dados, é erro.
          setStale(true);
          if (!silent) setError(cause instanceof Error ? cause.message : 'Falha ao carregar o planejamento.');
          throw cause;
        })
        .finally(() => {
          inFlight.current = undefined;
          setRefreshing(false);
        });
    }
    return inFlight.current;
  }, []);

  useEffect(() => {
    load(false).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Volta para a aba: se os dados têm mais de meio minuto, recarrega em silêncio. Nada disso acontece
  // no meio de um comando, para a resposta dele não competir com a recarga.
  useEffect(() => {
    const maybe = () => {
      if (document.visibilityState === 'visible' && !mutating.current && Date.now() - latest.current > FOCUS_AFTER)
        load(true).catch(() => {});
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !mutating.current) load(true).catch(() => {});
    }, EVERY);
    window.addEventListener('focus', maybe);
    document.addEventListener('visibilitychange', maybe);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', maybe);
      document.removeEventListener('visibilitychange', maybe);
    };
  }, [load]);

  const refresh = useCallback(async () => {
    await load(true).catch(() => {});
  }, [load]);
  const retry = useCallback(() => {
    setError('');
    load(false).catch(() => {});
  }, [load]);
  const execute = useCallback(
    async (command: Command) => {
      mutating.current += 1;
      try {
        const res = await fetch('/api/planning/commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Falha ao aplicar o comando.');
        // O comando já foi gravado: se a recarga falhar, a tela fica marcada como desatualizada, mas
        // quem chamou recebe o id e não vê um erro de algo que deu certo.
        await load(true).catch(() => {});
        return body.id as string;
      } finally {
        mutating.current -= 1;
      }
    },
    [load],
  );

  const value = useMemo<PlanningState>(() => {
    if (loaded)
      return { state: 'ready', planning: loaded.planning, actorId: loaded.actorId, execute, refresh, refreshing, updatedAt, stale };
    if (error) return { state: 'error', message: error, retry };
    return { state: 'loading' };
  }, [loaded, error, execute, refresh, refreshing, updatedAt, stale, retry]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePlanning() {
  return useContext(Context);
}

'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Planning } from '@/application/use-cases/get-planning';
import type { Command } from '@/application/use-cases/commands';
import { applyCommandLocally, projectsBeforeServer } from '@/application/use-cases/local-apply';
import { confirmsOwnWrite, parseVersion, shouldReload } from '@/application/planning-version';

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
/** Quem desenvolve o sistema vê todos os módulos; os demais, só o curto prazo (go-live). Vem do
 * layout, que lê a sessão no servidor. Só esconde atalhos: a proteção é do proxy e das rotas. */
const DeveloperContext = createContext(false);
/** Módulos em desenvolvimento liberados para a pessoa pelo admin. */
const NO_MODULES: readonly string[] = [];
const ModulesContext = createContext<readonly string[]>(NO_MODULES);

/** Conferência de versão ao voltar para a aba, se a última resposta boa tem mais que isto. */
const FOCUS_AFTER = 30_000;
/** Conferência periódica enquanto a aba está visível: numa reunião, dois planejadores veem o mesmo.
 * Eram 2 min de recarga completa; com a conferência de versão na frente, 5 min bastam, e o
 * planejamento inteiro só desce quando alguém gravou. */
const EVERY = 300_000;

async function fetchPlanning(): Promise<{ text: string }> {
  const res = await fetch('/api/planning', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : 'Falha ao carregar o planejamento.');
  }
  return { text: await res.text() };
}
/** Só a versão (`planning_meta.version`, que sobe a cada gravação): uns bytes em vez dos 3,9 MB do
 * planejamento. A recarga completa a cada 2 min por aba aberta, mais a cada volta à aba e depois de
 * cada comando, estourava a cota grátis de tráfego da Vercel e do Supabase com poucos usuários
 * (12/10/2026). Falha vira versão desconhecida: quem decide o que fazer com isso é `shouldReload`. */
async function fetchVersion(): Promise<number | undefined> {
  try {
    const res = await fetch('/api/planning/version', { cache: 'no-store' });
    if (!res.ok) return undefined;
    return parseVersion(await res.json());
  } catch {
    return undefined;
  }
}
const parsePlanning = (text: string): Loaded => {
  const { actorId, ...planning } = JSON.parse(text) as Planning & { actorId: string };
  return { planning, actorId };
};

export function PlanningProvider({
  children,
  developer = false,
  modules = NO_MODULES,
}: {
  children: ReactNode;
  developer?: boolean;
  modules?: readonly string[];
}) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(0);
  const inFlight = useRef<Promise<Loaded> | undefined>(undefined);
  /** Uma conferência de versão por vez: `focus` e `visibilitychange` disparam juntos ao voltar à aba. */
  const checking = useRef<Promise<void> | undefined>(undefined);
  const mutating = useRef(0);
  const latest = useRef(0);
  /** A versão do planejamento que os dados na tela representam. É lida logo antes da carga completa,
   * nunca depois: assim ela nunca é mais nova que os dados, e uma gravação entre as duas leituras
   * aparece na próxima conferência (custa uma recarga a mais, nunca uma a menos). Fica desconhecida
   * até a primeira carga boa e quando a leitura que antecedeu a carga falhou. */
  const version = useRef<number | undefined>(undefined);
  /** A última resposta, como texto. Uma obra com anos de curto prazo passa de 3 MB, e redesenhar a
   * planilha inteira a cada recarga automática travava a tela por meio segundo (09/10/2026): resposta
   * igual à anterior não muda estado nenhum. */
  const lastText = useRef('');
  const current = useRef<Loaded | undefined>(undefined);
  const staleNow = useRef(false);

  /** Uma única requisição por vez: quem pedir enquanto outra corre recebe a mesma promessa. `known`
   * é a versão que a conferência acabou de ler, para a carga não a ler de novo. */
  const load = useCallback(async (silent: boolean, known?: number) => {
    if (!inFlight.current) {
      // O "Recarregando…" só aparece no aviso de conexão; fora dele, ligar e desligar redesenharia tudo.
      if (silent && staleNow.current) setRefreshing(true);
      inFlight.current = (known === undefined ? fetchVersion() : Promise.resolve(known))
        .then(async fetched => ({ fetched, text: (await fetchPlanning()).text }))
        .then(({ fetched, text }) => {
          latest.current = Date.now();
          // Registrada mesmo com resposta igual: a próxima conferência compara com ela.
          version.current = fetched;
          if (text === lastText.current && current.current) {
            if (staleNow.current) {
              staleNow.current = false;
              setStale(false);
            }
            return current.current;
          }
          const result = parsePlanning(text);
          lastText.current = text;
          current.current = result;
          staleNow.current = false;
          setLoaded(result);
          setError('');
          setStale(false);
          setUpdatedAt(Date.now());
          return result;
        })
        .catch(cause => {
          // Com dados na tela, a falha só marca que eles podem estar velhos; sem dados, é erro.
          // O aviso diz de quando são os dados: a hora da última resposta boa, mesmo que ela tenha
          // sido igual à anterior e não tenha mudado estado nenhum.
          staleNow.current = true;
          setStale(true);
          setUpdatedAt(latest.current);
          if (!silent) setError(cause instanceof Error ? cause.message : 'Falha ao carregar o planejamento.');
          throw cause;
        })
        .finally(() => {
          inFlight.current = undefined;
          setRefreshing(current => (current ? false : current));
        });
    }
    return inFlight.current;
  }, []);

  /** Recarga automática: confere a versão e só baixa o planejamento se ela mudou. Versão igual
   * confirma os dados na tela: conta como resposta boa (para a janela do foco e para a hora que o
   * aviso de conexão mostra) e desfaz o aviso de desatualizado. Conferência falha cai na carga
   * completa, que é quem sabe marcar desatualizado e restabelecer a versão conhecida. */
  const check = useCallback(() => {
    // Uma carga em andamento já traz os dados e a versão mais novos.
    if (inFlight.current || checking.current) return;
    checking.current = fetchVersion()
      .then(fetched => {
        // Um comando ou uma carga começaram enquanto a conferência corria: a recarga deles basta.
        if (mutating.current || inFlight.current) return;
        if (shouldReload(version.current, fetched)) {
          load(true, fetched).catch(() => {});
          return;
        }
        latest.current = Date.now();
        if (staleNow.current) {
          staleNow.current = false;
          setStale(false);
        }
      })
      .finally(() => {
        checking.current = undefined;
      });
  }, [load]);

  useEffect(() => {
    load(false).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Volta para a aba: se a última resposta boa tem mais de meio minuto, confere a versão em silêncio.
  // Nada disso acontece no meio de um comando, para a resposta dele não competir com a recarga.
  useEffect(() => {
    const maybe = () => {
      if (document.visibilityState === 'visible' && !mutating.current && Date.now() - latest.current > FOCUS_AFTER) check();
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !mutating.current) check();
    }, EVERY);
    window.addEventListener('focus', maybe);
    document.addEventListener('visibilitychange', maybe);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', maybe);
      document.removeEventListener('visibilitychange', maybe);
    };
  }, [check]);

  // Pedido explícito (botão do aviso de conexão, telas que gravam fora dos comandos): carga completa,
  // sem conferir a versão, porque quem pede sabe que há algo novo ou quer a base refeita.
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
      // Curto prazo: a tela mostra o comando projetado sobre os dados carregados, em vez de esperar os
      // 3 MB da recarga (a equipe de obra sentia a planilha lenta, 10/10/2026). A recarga confirma em
      // segundo plano; `lastText` é zerado para a resposta dela, mesmo igual à última, substituir a
      // projeção pelo que o servidor gravou. A projeção é idempotente: se a recarga já trouxe a linha,
      // não cria outra.
      const project = (id: string) => {
        if (!current.current) return false;
        const planning = applyCommandLocally(current.current.planning, command, id, current.current.actorId, new Date().toISOString());
        if (!planning) return false;
        current.current = { planning, actorId: current.current.actorId };
        lastText.current = '';
        setLoaded(current.current);
        return true;
      };
      // Quem muda linha existente é projetado ANTES da ida ao servidor (26/10/2026): o Status, a causa e a
      // justificativa aparecem na célula no mesmo instante do clique, como numa planilha, e a gravação
      // segue por trás. Na obra, cada apontamento esperava a resposta inteira (~4 s) com a linha travada.
      // Se o servidor recusar ou a rede cair, a recarga devolve a linha ao que o banco tem.
      const early = projectsBeforeServer(command) && project('');
      try {
        const res = await fetch('/api/planning/commands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(command),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Falha ao aplicar o comando.');
        const id = body.id as string;
        const projected = early || project(id);
        // Uma recarga que saiu antes da gravação (timer, volta à aba) ainda traz o estado antigo, e
        // `load` entregaria essa mesma promessa: espera-se ela acabar e pede-se outra, já com o comando.
        // A resposta dela substitui a projeção, por isso o comando é projetado de novo por cima.
        if (inFlight.current) {
          await inFlight.current.catch(() => {});
          if (projected) project(early ? '' : id);
        }
        // Projeção confirmada pela versão: a resposta diz a versão gravada e, se ela é a conhecida + 1,
        // a única gravação desde a última carga foi esta. A projeção já é o que o banco tem; a versão
        // conhecida passa a ser a nova e nada é baixado (antes, cada clique baixava os 3,9 MB e
        // redesenhava a planilha inteira; a tela travava meio segundo a cada apontamento, 12/10/2026).
        if (projected && confirmsOwnWrite(version.current, body.version)) {
          version.current = body.version as number;
          latest.current = Date.now();
          return id;
        }
        // O comando já foi gravado: se a recarga falhar, a tela fica marcada como desatualizada, mas
        // quem chamou recebe o id e não vê um erro de algo que deu certo. Com projeção, quem chamou
        // nem espera a recarga: a fila da planilha libera a próxima gravação na hora. A recarga é
        // completa de propósito (o comando subiu a versão) e registra a versão nova como a conhecida.
        const reload = load(true).catch(() => {});
        if (!projected) await reload;
        return id;
      } catch (cause) {
        // A projeção adiantada já está na tela e o banco não a tem: a recarga é quem desfaz.
        if (early) load(true).catch(() => {});
        throw cause;
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
  return (
    <DeveloperContext.Provider value={developer}>
      <ModulesContext.Provider value={modules}>
        <Context.Provider value={value}>{children}</Context.Provider>
      </ModulesContext.Provider>
    </DeveloperContext.Provider>
  );
}
export function usePlanning() {
  return useContext(Context);
}
export function useDeveloper() {
  return useContext(DeveloperContext);
}
export function useModules() {
  return useContext(ModulesContext);
}

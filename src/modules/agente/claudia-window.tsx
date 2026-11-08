'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { ChevronLeft, List, MapPin, Maximize2, Minimize2, Minus, Pencil, Plus, RefreshCw, Search, Send, Sparkles, X } from 'lucide-react';
import type { AgentProposal } from '@/application/use-cases/agent-tools';
import { formatUsd } from '@/domain/agent-cost';
import { renderMarkdown } from '@/modules/curto-prazo/justifications-view';
import { useToast } from '@/modules/layout/toast';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { AGENT } from './agent-identity';
import { appliedTitle, grow, messageOf, ProposalCardView, readJson, WorkOverviewTab } from './agent-panel';
import {
  addTurn,
  buildHistory,
  contextFromPath,
  contextPhrase,
  DEFAULT_WINDOW,
  deleteTopic,
  emptyStore,
  hasPending,
  isPending,
  loadStore,
  loadWindowPrefs,
  newTurn,
  parseStore,
  removeTopics,
  renameTopic,
  restoreTopic,
  saveStore,
  saveWindowPrefs,
  serializeStore,
  setProposalState,
  showsContextMarker,
  topicCost,
  topicMeta,
  topicsKey,
  updateTurn,
  windowKey,
  workIdFromPath,
  type ProposalCard,
  type Topic,
  type TopicContext,
  type TopicStore,
  type TopicTurn,
  type WindowPrefs,
} from './claudia-topics';

/** Claudia geral (aprovada em 08/11/2026, só admins): a assistente vira uma janela flutuante em toda tela,
 * que guarda as conversas em assuntos e responde sobre qualquer obra e módulo. Quem não é admin continua
 * com a gaveta da obra (`AgentButton`, em `agent-panel.tsx`).
 *
 * - `ClaudiaProvider` fica no layout do app, que não remonta na navegação: os assuntos, a pergunta em
 *   andamento e o estado da janela sobrevivem à troca de tela e de obra. Os assuntos e o estado da janela
 *   ficam no localStorage, uma chave por pessoa (`claudia-topics.ts`).
 * - `ClaudiaButton` vai no cabeçalho; `ClaudiaWindow` é montada uma vez. A janela não é modal: não escurece
 *   nem prende o foco, e a página atrás continua clicável. Ctrl+J (⌘J no Mac) abre e fecha.
 * - Nada carrega antes da primeira abertura: o estado do servidor (`GET /api/agente/geral`) é lido quando a
 *   janela abre, e o uso do mês é atualizado por cada resposta. Fechada, não há polling nenhum. */

// ─── Contrato da rota ──────────────────────────────────────────────────────────

export interface GeneralUsage {
  monthUsd: number;
  budgetUsd: number;
  userUsd: number;
  userLimitUsd: number | null;
  model: string;
}
interface GeneralStatus {
  configured: boolean;
  blocked: boolean;
  migrationMissing: boolean;
  budget: { allowed: boolean; message?: string };
  usage: GeneralUsage;
}
interface GeneralAnswer {
  answer?: string;
  proposals?: AgentProposal[];
  consulted?: unknown;
  usage?: GeneralUsage;
  costUsd?: number;
  model?: string;
}
type StatusState =
  { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: GeneralStatus };
type Tab = 'conversa' | 'obra';

// ─── Estado compartilhado ──────────────────────────────────────────────────────

interface ClaudiaApi {
  /** A pessoa pode ter a Claudia geral (`enabled` do provider e sessão com usuário): o botão aparece. */
  available: boolean;
  /** Disponível e com o botão montado no cabeçalho: só então há atalho, carga e janela. Assim o atalho não
   * abre a janela para quem não tem o botão, mesmo que o layout monte a janela para todos. */
  enabled: boolean;
  hydrated: boolean;
  prefs: WindowPrefs;
  store: TopicStore;
  activeTopic: Topic | undefined;
  context: TopicContext;
  status: StatusState;
  usage: GeneralUsage | undefined;
  unread: boolean;
  question: string;
  tab: Tab;
  listing: boolean;
  /** Muda quando a pessoa abre a janela ou troca de assunto: a janela põe o foco no campo de pergunta. Na
   * reabertura automática (a janela estava aberta antes de recarregar) o foco fica onde está. */
  focusSignal: number;
  obraRefresh: number;
  setQuestion: (question: string) => void;
  setTab: (tab: Tab) => void;
  setListing: (listing: boolean) => void;
  open: () => void;
  close: () => void;
  minimize: () => void;
  toggle: () => void;
  toggleExpanded: () => void;
  newTopic: () => void;
  selectTopic: (topicId: string) => void;
  renameTopic: (topicId: string, title: string) => void;
  removeTopic: (topicId: string) => void;
  ask: (text: string) => void;
  apply: (topicId: string, turnId: string, card: ProposalCard) => void;
  discard: (topicId: string, turnId: string, card: ProposalCard) => void;
  retryStatus: () => void;
  registerButton: () => () => void;
}

const noop = () => {};
const Context = createContext<ClaudiaApi | null>(null);
const useClaudia = () => useContext(Context);

const JSON_HEADERS = { 'Content-Type': 'application/json' };
/** O estado do servidor (configurada, acesso, teto) é relido ao reabrir depois de 5 minutos. */
const STATUS_TTL_MS = 5 * 60_000;
const WINDOW_LABEL = `${AGENT.name}, ${AGENT.tagline}`;

const newId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    // Fora de HTTPS (rede local) o `randomUUID` não existe.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
};
const safeStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
const busy = (store: TopicStore) =>
  store.topics.some(topic => topic.turns.some(turn => isPending(turn) || turn.proposals.some(card => card.state.status === 'aplicando')));
const focusHeaderButton = () => {
  for (const button of document.querySelectorAll<HTMLElement>('[data-claudia-button]'))
    if (button.offsetParent !== null) {
      button.focus({ preventScroll: true });
      return;
    }
};

export function ClaudiaProvider({ userId, enabled = true, children }: { userId?: string | null; enabled?: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const planning = usePlanning();
  const { toast } = useToast();
  const [buttons, setButtons] = useState(0);
  const available = enabled && !!userId;
  const active = available && buttons > 0;
  const keys = useMemo(() => (userId ? { topics: topicsKey(userId), window: windowKey(userId) } : null), [userId]);

  const [hydrated, setHydrated] = useState(false);
  const [store, setStore] = useState<TopicStore>(emptyStore);
  const [prefs, setPrefs] = useState<WindowPrefs>(DEFAULT_WINDOW);
  const [status, setStatus] = useState<StatusState>({ status: 'idle' });
  const [usage, setUsage] = useState<GeneralUsage>();
  const [unread, setUnread] = useState(false);
  const [question, setQuestion] = useState('');
  const [tab, setTab] = useState<Tab>('conversa');
  const [listing, setListing] = useState(false);
  const [focusSignal, setFocusSignal] = useState(0);
  const [obraRefresh, setObraRefresh] = useState(0);

  const workId = workIdFromPath(pathname);
  const workName = workId && planning.state === 'ready' ? planning.planning.data.works.find(w => w.id === workId)?.name : undefined;
  const context = useMemo(() => contextFromPath(pathname, workName), [pathname, workName]);
  const activeTopic = prefs.activeId ? store.topics.find(topic => topic.id === prefs.activeId) : undefined;

  /** O que as respostas assíncronas leem na hora em que chegam (a pessoa pode ter navegado, minimizado ou
   * trocado de assunto enquanto esperava). */
  const live = useRef({ store, prefs, context, planning, listing, tab });
  useEffect(() => {
    live.current = { store, prefs, context, planning, listing, tab };
  });
  const lastSaved = useRef('');
  const statusInFlight = useRef(false);
  const statusAt = useRef(0);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const loadStatus = useCallback(async (silent: boolean) => {
    if (statusInFlight.current) return;
    statusInFlight.current = true;
    if (!silent) setStatus({ status: 'loading' });
    try {
      const data = await readJson<GeneralStatus>(await fetch('/api/agente/geral'));
      statusAt.current = Date.now();
      setStatus({ status: 'ready', data });
      if (data.usage) setUsage(data.usage);
    } catch (cause) {
      if (!silent) setStatus({ status: 'error', message: messageOf(cause) });
    } finally {
      statusInFlight.current = false;
    }
  }, []);
  const ensureStatus = useCallback(() => {
    const current = statusRef.current;
    if (current.status === 'idle' || current.status === 'error') void loadStatus(false);
    else if (current.status === 'ready' && Date.now() - statusAt.current > STATUS_TTL_MS) void loadStatus(true);
  }, [loadStatus]);

  // Carga do que está guardado neste navegador. Fica num efeito para o HTML do servidor e o primeiro
  // desenho do navegador serem iguais (janela fechada); a pergunta que a recarga interrompeu vira erro.
  useEffect(() => {
    if (!active || !keys) return;
    const storage = safeStorage();
    const loaded = loadStore(storage, keys.topics);
    const saved = loadWindowPrefs(storage, keys.window);
    setStore(loaded);
    setPrefs({ ...saved, activeId: saved.activeId && loaded.topics.some(t => t.id === saved.activeId) ? saved.activeId : null });
    setHydrated(true);
    if (saved.mode === 'open') ensureStatus();
  }, [active, keys, ensureStatus]);

  // Gravação dos assuntos. Com a cota cheia, `saveStore` tira os mais antigos, e a lista acompanha.
  useEffect(() => {
    if (!hydrated || !keys) return;
    const text = serializeStore(store);
    if (text === lastSaved.current) return;
    const result = saveStore(safeStorage(), keys.topics, store, prefs.activeId);
    lastSaved.current = result.text ?? text;
    if (result.dropped.length) setStore(previous => removeTopics(previous, result.dropped));
  }, [store, hydrated, keys, prefs.activeId]);
  useEffect(() => {
    if (hydrated && keys) saveWindowPrefs(safeStorage(), keys.window, prefs);
  }, [prefs, hydrated, keys]);

  // Outra aba do mesmo navegador gravou os assuntos: adota a lista dela, a menos que esta aba esteja
  // esperando uma resposta ou aplicando uma proposta (aí esta aba grava por cima quando terminar).
  useEffect(() => {
    if (!hydrated || !keys) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== keys.topics || event.newValue === null || busy(live.current.store)) return;
      const incoming = parseStore(event.newValue);
      lastSaved.current = serializeStore(incoming);
      setStore(incoming);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [hydrated, keys]);

  const open = useCallback(() => {
    setPrefs(previous => (previous.mode === 'open' ? previous : { ...previous, mode: 'open' }));
    setUnread(false);
    setFocusSignal(n => n + 1);
    ensureStatus();
  }, [ensureStatus]);
  const close = useCallback(() => {
    // Fechar com o foco dentro da janela devolve o foco ao botão do cabeçalho, para o teclado não se perder.
    const hadFocus = !!document.activeElement?.closest('[data-claudia-window]');
    setPrefs(previous => ({ ...previous, mode: 'closed' }));
    setListing(false);
    if (hadFocus) focusHeaderButton();
  }, []);
  const minimize = useCallback(() => {
    setPrefs(previous => ({ ...previous, mode: 'minimized' }));
    setListing(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-claudia-pill]')?.focus({ preventScroll: true }));
  }, []);
  const toggle = useCallback(() => (live.current.prefs.mode === 'open' ? close() : open()), [close, open]);
  const toggleExpanded = useCallback(() => setPrefs(previous => ({ ...previous, expanded: !previous.expanded })), []);
  const openTopic = useCallback(
    (topicId: string | null) => {
      setPrefs(previous => ({ ...previous, activeId: topicId, mode: 'open' }));
      setListing(false);
      setTab('conversa');
      setUnread(false);
      setFocusSignal(n => n + 1);
      ensureStatus();
    },
    [ensureStatus],
  );
  const newTopic = useCallback(() => openTopic(null), [openTopic]);

  // Atalho Ctrl+J / ⌘J. Com Shift ou Alt fica de fora: Ctrl+Shift+J é o console do navegador.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'j') return;
      event.preventDefault();
      if (!event.repeat) toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, toggle]);

  /** Resposta (ou erro) que chegou fora da vista: minimizada ou fechada ganha o ponto no botão e na pílula;
   * em todo caso sai o aviso, com "Ver" para abrir o assunto. */
  const notify = useCallback(
    (topicId: string, error?: string) => {
      const { store: current, prefs: win, listing: list, tab: shown, context: where } = live.current;
      const topic = current.topics.find(t => t.id === topicId);
      if (!topic) return;
      // Fora de uma obra a aba "Obra" some e a conversa é o que está à vista.
      const watching = win.mode === 'open' && win.activeId === topicId && !list && (shown === 'conversa' || !where.workId);
      if (watching) return;
      if (win.mode !== 'open') setUnread(true);
      toast({
        title: error ? `${AGENT.name} não conseguiu responder em “${topic.title}”.` : `${AGENT.name} respondeu em “${topic.title}”.`,
        description: error,
        tone: 'info',
        action: { label: 'Ver', onClick: () => openTopic(topicId) },
      });
    },
    [toast, openTopic],
  );

  const ask = useCallback(
    async (text: string) => {
      const asked = text.trim();
      const { store: current, prefs: win, context: where } = live.current;
      const topic = win.activeId ? current.topics.find(t => t.id === win.activeId) : undefined;
      if (!asked || hasPending(topic)) return;
      const topicId = topic?.id ?? newId();
      const turnId = newId();
      const now = new Date().toISOString();
      // O histórico sai do assunto antes desta pergunta: as 8 últimas rodadas respondidas, com o contexto.
      const history = buildHistory(topic?.turns ?? []);
      setStore(previous => addTurn(previous, topicId, newTurn({ id: turnId, question: asked, context: where, now }), now));
      setPrefs(previous => ({ ...previous, activeId: topicId }));
      setQuestion('');
      setListing(false);
      setTab('conversa');
      try {
        const response = await fetch('/api/agente/geral', {
          method: 'POST',
          headers: JSON_HEADERS,
          body: JSON.stringify({ question: asked, history, context: { workId: where.workId, screen: where.screen } }),
        });
        const body = await readJson<GeneralAnswer>(response);
        const proposals: ProposalCard[] = (body.proposals ?? []).map(proposal => ({ proposal, state: { status: 'pendente' } }));
        const consulted = Array.isArray(body.consulted) ? body.consulted.filter((item): item is string => typeof item === 'string') : [];
        setStore(previous =>
          updateTurn(
            previous,
            topicId,
            turnId,
            turn => ({
              ...turn,
              answer: body.answer ?? '',
              proposals,
              consulted,
              costUsd: typeof body.costUsd === 'number' && Number.isFinite(body.costUsd) ? body.costUsd : undefined,
              model: body.model,
            }),
            new Date().toISOString(),
          ),
        );
        if (body.usage) setUsage(body.usage);
        notify(topicId);
      } catch (cause) {
        const message = messageOf(cause);
        setStore(previous => updateTurn(previous, topicId, turnId, turn => ({ ...turn, error: message }), new Date().toISOString()));
        notify(topicId, message);
      }
    },
    [notify],
  );

  /** Aplica como a gaveta: pelo caminho normal de gravação (`execute`), um comando por vez; em erro para no
   * comando que falhou e guarda quantos já entraram, para "Tentar de novo" continuar dali. */
  const apply = useCallback(
    async (topicId: string, turnId: string, card: ProposalCard) => {
      const current = live.current.planning;
      if (current.state !== 'ready') {
        toast({
          title: 'Os dados das obras ainda não carregaram.',
          description: 'Espere a tela terminar de carregar e tente de novo.',
          tone: 'info',
        });
        return;
      }
      const { proposal, state } = card;
      let done = state.status === 'falhou' ? state.done : 0;
      try {
        for (; done < proposal.commands.length; done += 1) {
          const step = done;
          setStore(previous => setProposalState(previous, topicId, turnId, proposal.id, { status: 'aplicando', done: step }));
          await current.execute(proposal.commands[step]);
        }
        setStore(previous => setProposalState(previous, topicId, turnId, proposal.id, { status: 'aplicada' }));
        toast({
          title: appliedTitle(proposal),
          description: proposal.workName ? `Obra ${proposal.workName}.` : undefined,
          tone: 'success',
        });
        // Os dados mudaram: a aba "Obra" refaz o radar por trás, se estiver aberta.
        setObraRefresh(n => n + 1);
      } catch (cause) {
        const message = messageOf(cause);
        const failedAt = done;
        setStore(previous => setProposalState(previous, topicId, turnId, proposal.id, { status: 'falhou', done: failedAt, message }));
        toast({ title: 'Não foi possível aplicar a proposta.', description: message, tone: 'danger' });
      }
    },
    [toast],
  );
  const discard = useCallback(
    (topicId: string, turnId: string, card: ProposalCard) =>
      setStore(previous => setProposalState(previous, topicId, turnId, card.proposal.id, { status: 'descartada' })),
    [],
  );

  const rename = useCallback((topicId: string, title: string) => setStore(previous => renameTopic(previous, topicId, title)), []);
  const removeTopic = useCallback(
    (topicId: string) => {
      const topic = live.current.store.topics.find(t => t.id === topicId);
      if (!topic) return;
      setStore(previous => deleteTopic(previous, topicId));
      setPrefs(previous => (previous.activeId === topicId ? { ...previous, activeId: null } : previous));
      toast({
        title: 'Assunto apagado.',
        description: topic.title,
        tone: 'info',
        action: { label: 'Desfazer', onClick: () => setStore(previous => restoreTopic(previous, topic)) },
      });
    },
    [toast],
  );
  const registerButton = useCallback(() => {
    setButtons(n => n + 1);
    return () => setButtons(n => n - 1);
  }, []);

  const api = useMemo<ClaudiaApi>(
    () => ({
      available,
      enabled: active,
      hydrated,
      prefs,
      store,
      activeTopic,
      context,
      status,
      usage,
      unread,
      question,
      tab,
      listing,
      focusSignal,
      obraRefresh,
      setQuestion,
      setTab,
      setListing,
      open,
      close,
      minimize,
      toggle,
      toggleExpanded,
      newTopic,
      selectTopic: openTopic,
      renameTopic: rename,
      removeTopic,
      ask: text => void ask(text),
      apply: (topicId, turnId, card) => void apply(topicId, turnId, card),
      discard,
      retryStatus: () => void loadStatus(false),
      registerButton,
    }),
    [
      available,
      active,
      hydrated,
      prefs,
      store,
      activeTopic,
      context,
      status,
      usage,
      unread,
      question,
      tab,
      listing,
      focusSignal,
      obraRefresh,
      open,
      close,
      minimize,
      toggle,
      toggleExpanded,
      newTopic,
      openTopic,
      rename,
      removeTopic,
      ask,
      apply,
      discard,
      loadStatus,
      registerButton,
    ],
  );
  return <Context.Provider value={api}>{children}</Context.Provider>;
}

// ─── Botão do cabeçalho ────────────────────────────────────────────────────────

const subscribeNothing = () => noop;
const isMacClient = () => /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
/** No servidor e no primeiro desenho, "Ctrl J"; no Mac o navegador troca por "⌘J" sem erro de hidratação. */
const useIsMac = () => useSyncExternalStore(subscribeNothing, isMacClient, () => false);

export function ClaudiaButton() {
  const claudia = useClaudia();
  const mac = useIsMac();
  const register = claudia?.registerButton;
  useEffect(() => register?.(), [register]);
  if (!claudia?.available) return null;
  const isOpen = claudia.prefs.mode === 'open';
  return (
    <button
      type="button"
      onClick={claudia.toggle}
      data-tour="agente"
      data-claudia-button
      aria-expanded={isOpen}
      aria-keyshortcuts="Control+J Meta+J"
      aria-label={isOpen ? `Fechar ${AGENT.name}` : `Abrir ${WINDOW_LABEL}${claudia.unread ? ' (resposta nova)' : ''}`}
      title={`${WINDOW_LABEL} (${mac ? '⌘J' : 'Ctrl+J'})`}
      className={`relative flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors ${
        isOpen ? 'bg-brand-50 text-primary ring-1 ring-inset ring-brand-200' : 'text-slate-500 hover:bg-brand-50 hover:text-primary'
      }`}
    >
      <Sparkles size={18} aria-hidden />
      <span className="hidden md:inline">{AGENT.name}</span>
      <kbd
        aria-hidden
        className="hidden rounded border border-slate-200 px-1 font-sans text-[10px] font-semibold leading-4 text-slate-400 lg:inline"
      >
        {mac ? '⌘J' : 'Ctrl J'}
      </kbd>
      {claudia.unread && <span aria-hidden className="absolute top-1 right-1 h-2 w-2 rounded-full bg-success ring-2 ring-white" />}
    </button>
  );
}

// ─── Janela ────────────────────────────────────────────────────────────────────

export function ClaudiaWindow() {
  const claudia = useClaudia();
  if (!claudia?.enabled || !claudia.hydrated) return null;
  if (claudia.prefs.mode === 'minimized') return <MinimizedPill claudia={claudia} />;
  if (claudia.prefs.mode !== 'open') return null;
  return <OpenWindow claudia={claudia} />;
}

function IconButton({
  label,
  active = false,
  only,
  small = false,
  className = '',
  children,
  ...rest
}: ComponentProps<'button'> & { label: string; active?: boolean; only?: 'desktop' | 'mobile'; small?: boolean }) {
  const display = only === 'desktop' ? 'hidden md:grid' : only === 'mobile' ? 'grid md:hidden' : 'grid';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${display} shrink-0 place-items-center rounded-[7px] transition-colors ${small ? 'h-6 w-6' : 'h-7 w-7'} ${
        active ? 'bg-brand-50 text-primary' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function Mark({ round = false }: { round?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center bg-gradient-to-br from-primary to-brand-500 text-white ${
        round ? 'h-7 w-7 rounded-full' : 'h-[30px] w-[30px] rounded-[9px]'
      }`}
    >
      <Sparkles size={round ? 13 : 16} />
    </span>
  );
}

function MinimizedPill({ claudia }: { claudia: ClaudiaApi }) {
  const title = claudia.activeTopic?.title ?? 'Novo assunto';
  const waiting = busy(claudia.store);
  return (
    <div className="fixed right-4 bottom-4 z-[80] flex max-w-[calc(100vw_-_32px)] items-center gap-1 rounded-full border border-slate-200 bg-white py-1.5 pr-2 pl-1.5 shadow-[0_14px_34px_-10px_rgba(5,32,47,0.22)] print:hidden md:right-5 md:bottom-5">
      <button
        type="button"
        data-claudia-pill
        onClick={claudia.open}
        aria-label={`Abrir ${AGENT.name}: ${title}${claudia.unread ? ' (resposta nova)' : ''}`}
        title="Abrir a conversa"
        className="flex min-w-0 items-center gap-2 rounded-full pr-1"
      >
        <Mark round />
        <span className="truncate text-[12.5px] font-semibold text-slate-900">{title}</span>
        {waiting && <span aria-hidden title="Aguardando resposta" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" />}
        {claudia.unread && (
          <span aria-hidden title="Resposta nova" className="h-2 w-2 shrink-0 rounded-full bg-success ring-[3px] ring-success-soft" />
        )}
      </button>
      <IconButton small label="Fechar (o assunto fica guardado)" onClick={claudia.close}>
        <X size={13} aria-hidden />
      </IconButton>
    </div>
  );
}

const SUGGESTIONS_WORK = [
  'Resuma os riscos desta obra em 5 pontos',
  'Quais pendências de terminalidade estão mais antigas aqui?',
  'Compare esta obra com as outras em PPC',
  'Como funciona esta tela?',
];
const SUGGESTIONS_GERAL = [
  'Qual obra teve o pior PPC nas últimas 4 semanas, e por quê?',
  'Quais obras têm mais pendências de terminalidade abertas?',
  'Compare as obras em segurança do trabalho',
  'Como funciona o sistema? O que você sabe fazer?',
];

function OpenWindow({ claudia }: { claudia: ClaudiaApi }) {
  const { prefs, activeTopic: topic, context, listing } = claudia;
  const tab: Tab = context.workId ? claudia.tab : 'conversa';
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Esc com o foco dentro da janela fecha; o campo de renomear trata o próprio Esc antes.
    if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
    event.preventDefault();
    claudia.close();
  };
  return (
    <div
      data-claudia-window
      role="dialog"
      aria-modal="false"
      aria-label={WINDOW_LABEL}
      onKeyDown={onKeyDown}
      className={`fixed inset-0 z-[80] flex flex-col overflow-hidden bg-white text-slate-700 print:hidden md:inset-auto md:right-5 md:bottom-5 md:rounded-2xl md:border md:border-slate-200 md:shadow-[0_24px_60px_-12px_rgba(5,32,47,0.22),0_2px_6px_rgba(5,32,47,0.08)] ${
        prefs.expanded
          ? 'md:h-[calc(100dvh_-_40px)] md:w-[min(720px,calc(100vw_-_40px))]'
          : 'md:h-[min(650px,calc(100dvh_-_40px))] md:w-[min(430px,calc(100vw_-_40px))]'
      }`}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-slate-100 py-2.5 pr-3 pl-3 md:pl-3.5">
        <IconButton
          only="mobile"
          label={listing ? 'Voltar à conversa' : 'Voltar à tela'}
          onClick={listing ? () => claudia.setListing(false) : claudia.close}
        >
          <ChevronLeft size={18} aria-hidden />
        </IconButton>
        <span className="hidden md:contents">
          <Mark />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">{listing ? 'Assuntos' : AGENT.name}</p>
          <p className="truncate text-[11.5px] text-slate-500">
            {listing ? 'Guardados neste navegador' : (topic?.title ?? 'Novo assunto')}
          </p>
        </div>
        <IconButton
          data-tour="claudia-assuntos"
          label={listing ? 'Voltar à conversa' : 'Assuntos'}
          active={listing}
          aria-pressed={listing}
          onClick={() => claudia.setListing(!listing)}
        >
          <List size={16} aria-hidden />
        </IconButton>
        {!listing && (
          <>
            <IconButton label="Novo assunto" onClick={claudia.newTopic}>
              <Plus size={16} aria-hidden />
            </IconButton>
            <IconButton only="desktop" label="Minimizar" onClick={claudia.minimize}>
              <Minus size={16} aria-hidden />
            </IconButton>
            <IconButton only="desktop" label={prefs.expanded ? 'Reduzir' : 'Ampliar'} onClick={claudia.toggleExpanded}>
              {prefs.expanded ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
            </IconButton>
          </>
        )}
        <IconButton only="desktop" label="Fechar (o assunto fica guardado)" onClick={claudia.close}>
          <X size={16} aria-hidden />
        </IconButton>
      </header>

      {listing ? (
        <TopicList claudia={claudia} />
      ) : (
        <>
          <div
            className={`flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50 px-3.5 py-1.5 ${context.workId ? 'justify-between' : ''}`}
          >
            {context.workId && (
              <div role="tablist" aria-label={`Seções de ${AGENT.name}`} className="flex shrink-0 gap-0.5 rounded-lg bg-slate-100 p-0.5">
                <TabButton claudia={claudia} tab="conversa" current={tab} label="Conversa" />
                <TabButton claudia={claudia} tab="obra" current={tab} label="Obra" />
              </div>
            )}
            <span
              data-tour="claudia-contexto"
              title="Onde você está. Pergunta que não cita obra vale para esta; fora de uma obra, para todas."
              className="inline-flex min-w-0 items-center gap-1 rounded-full border border-brand-200 bg-primary-soft py-0.5 pr-2.5 pl-2 text-[11.5px] font-semibold text-primary-ink"
            >
              <MapPin size={12} aria-hidden className="shrink-0" />
              <span className="sr-only">Contexto: </span>
              <span className="truncate">{context.label}</span>
            </span>
          </div>
          {tab === 'obra' && context.workId ? (
            <div
              id="claudia-painel"
              role="tabpanel"
              aria-label="Obra"
              className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4"
            >
              <WorkOverviewTab key={context.workId} workId={context.workId} refreshSignal={claudia.obraRefresh} />
            </div>
          ) : (
            <Conversation claudia={claudia} />
          )}
          <Footer claudia={claudia} composer={tab === 'conversa'} />
        </>
      )}
    </div>
  );
}

function TabButton({ claudia, tab, current, label }: { claudia: ClaudiaApi; tab: Tab; current: Tab; label: string }) {
  const selected = tab === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls="claudia-painel"
      onClick={() => claudia.setTab(tab)}
      className={`rounded-md px-2.5 py-0.5 text-xs font-semibold transition-colors ${
        selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
    </button>
  );
}

function StatusNotices({ claudia }: { claudia: ClaudiaApi }) {
  const { status } = claudia;
  if (status.status === 'error')
    return (
      <div className="space-y-2">
        <Callout tone="danger" role="alert">
          {status.message}
        </Callout>
        <button type="button" className="button-ghost px-2.5 py-1 text-xs" onClick={claudia.retryStatus}>
          <RefreshCw size={13} aria-hidden />
          Tentar de novo
        </button>
      </div>
    );
  if (status.status !== 'ready') return null;
  const { configured, blocked, migrationMissing, budget } = status.data;
  if (configured && !blocked && !migrationMissing && budget.allowed) return null;
  return (
    <div className="space-y-2">
      {!configured && (
        <Callout tone="warning" role="status">
          A IA não está configurada no servidor (ANTHROPIC_API_KEY).
        </Callout>
      )}
      {blocked && (
        <Callout tone="danger" role="alert">
          Seu acesso ao agente foi cortado pelo administrador.
        </Callout>
      )}
      {!budget.allowed && !blocked && !migrationMissing && (
        <Callout tone="warning" role="status">
          {budget.message ?? 'O limite mensal de IA foi atingido.'}
        </Callout>
      )}
      {/* `migrationMissing` da rota geral = faltam as tabelas do agente (0035); sem a 0041 tudo funciona. */}
      {migrationMissing && (
        <Callout tone="warning" role="status">
          Aplique a migração 0035_agent.sql para guardar o uso e liberar as perguntas.
        </Callout>
      )}
    </div>
  );
}

function Conversation({ claudia }: { claudia: ClaudiaApi }) {
  const { activeTopic: topic, context, status } = claudia;
  const turns = useMemo(() => topic?.turns ?? [], [topic]);
  const body = useRef<HTMLDivElement>(null);
  const pending = hasPending(topic);
  const modelOff = status.status === 'ready' && (!status.data.configured || status.data.blocked);
  const firstProposalTurn = turns.find(turn => turn.proposals.length > 0)?.id;
  const lastTurn = turns[turns.length - 1];
  const lastKey = lastTurn ? `${lastTurn.id}:${lastTurn.answer !== undefined}:${lastTurn.error ?? ''}` : '';
  const topicId = topic?.id;

  // Ao abrir ou trocar de assunto, salta para o fim. Pergunta ou resposta nova rola suave até ela; resposta
  // mais alta que a janela fica com o começo à vista, em vez de o fim.
  const previous = useRef<{ topicId?: string; key: string } | null>(null);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const before = previous.current;
    previous.current = { topicId, key: lastKey };
    if (!before || before.topicId !== topicId) {
      element.scrollTop = element.scrollHeight;
      return;
    }
    if (before.key === lastKey || !lastKey) return;
    const node = element.querySelector<HTMLElement>(`[data-turn="${CSS.escape(lastKey.split(':')[0])}"]`);
    const top = node && node.offsetHeight > element.clientHeight ? node.offsetTop - 8 : element.scrollHeight;
    element.scrollTo({ top, behavior: 'smooth' });
  }, [topicId, lastKey]);

  const suggestions = context.workId ? SUGGESTIONS_WORK : SUGGESTIONS_GERAL;
  return (
    <div
      ref={body}
      id="claudia-painel"
      role={context.workId ? 'tabpanel' : undefined}
      aria-label="Conversa"
      data-tour="claudia-conversa"
      className="custom-scrollbar relative min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 pt-3 pb-2"
    >
      <StatusNotices claudia={claudia} />
      {turns.length === 0 ? (
        <div className="space-y-3 py-1">
          <p className="text-sm leading-6 text-slate-600">
            Pergunte sobre qualquer obra ou módulo, peça uma edição na planilha da semana ou tire uma dúvida do sistema. Sem citar obra, a
            pergunta vale para {context.workId ? context.workName : 'todas as obras'}.
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                className="button-ghost px-2.5 py-1 text-left text-xs font-medium"
                disabled={modelOff || pending}
                onClick={() => claudia.ask(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div aria-live="polite" className="flex flex-col gap-2.5">
          {turns.map((turn, index) => (
            <TurnView
              key={turn.id}
              claudia={claudia}
              topicId={topicId as string}
              turn={turn}
              marker={showsContextMarker(turns, index)}
              firstProposal={turn.id === firstProposalTurn}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TurnView({
  claudia,
  topicId,
  turn,
  marker,
  firstProposal,
}: {
  claudia: ClaudiaApi;
  topicId: string;
  turn: TopicTurn;
  marker: boolean;
  firstProposal: boolean;
}) {
  return (
    <div data-turn={turn.id} className="flex flex-col gap-2">
      {marker && (
        <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
          <span aria-hidden className="h-px flex-1 bg-slate-200" />
          <span className="max-w-[85%] text-center">perguntado {contextPhrase(turn.context)}</span>
          <span aria-hidden className="h-px flex-1 bg-slate-200" />
        </p>
      )}
      <p className="ml-auto w-fit max-w-[86%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-50 px-3 py-2 text-sm text-slate-900">
        {turn.question}
      </p>
      {isPending(turn) && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-slate-500">
          <Sparkles size={12} aria-hidden className="animate-pulse text-primary" />
          {AGENT.name} está lendo…
        </p>
      )}
      {turn.error && (
        <div className="space-y-1.5">
          <Callout tone="warning" role="alert">
            {turn.error}
          </Callout>
          <button
            type="button"
            className="text-link text-xs"
            onClick={() => {
              claudia.setQuestion(turn.question);
              document.getElementById('claudia-pergunta')?.focus({ preventScroll: true });
            }}
          >
            Repetir a pergunta
          </button>
        </div>
      )}
      {turn.answer !== undefined && (
        <div className="mr-auto max-w-[96%] space-y-1.5 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
          {turn.consulted.length > 0 && (
            <ul aria-label="O que ela consultou" className="flex flex-wrap gap-1">
              {turn.consulted.map((item, index) => (
                <li
                  key={`${item}-${index}`}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-px text-[10.5px] font-semibold text-slate-500"
                >
                  <Search size={11} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          )}
          <div className="[&>*:last-child]:mb-0">{renderMarkdown(turn.answer)}</div>
        </div>
      )}
      {turn.proposals.map((card, index) => (
        <ProposalCardView
          key={card.proposal.id}
          card={card}
          first={firstProposal && index === 0}
          canEdit
          onApply={() => claudia.apply(topicId, turn.id, card)}
          onDiscard={() => claudia.discard(topicId, turn.id, card)}
        />
      ))}
    </div>
  );
}

function Footer({ claudia, composer }: { claudia: ClaudiaApi; composer: boolean }) {
  const { activeTopic: topic, usage, status, question, focusSignal } = claudia;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pending = hasPending(topic);
  const modelOff = status.status === 'ready' && (!status.data.configured || status.data.blocked);
  const canSend = !modelOff && !pending && question.trim().length > 0;

  useEffect(() => {
    // Abrir pela mão (botão, Ctrl+J, pílula, aviso) ou trocar de assunto põe o foco no campo, sem rolar.
    if (focusSignal) textarea.current?.focus({ preventScroll: true });
  }, [focusSignal, composer]);
  useEffect(() => {
    if (textarea.current) grow(textarea.current);
  }, [question, composer]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSend) claudia.ask(question);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra linha. Durante a composição (acentos no celular) o Enter é do teclado.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) claudia.ask(question);
  };

  return (
    <div className="shrink-0 space-y-1.5 border-t border-slate-100 px-3 pt-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      {composer && (
        <form
          onSubmit={submit}
          className="flex items-end gap-2 rounded-xl border border-slate-200 bg-white py-1.5 pr-1.5 pl-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-ring"
        >
          <label htmlFor="claudia-pergunta" className="sr-only">
            Pergunta para {AGENT.name}
          </label>
          <textarea
            id="claudia-pergunta"
            ref={textarea}
            rows={1}
            value={question}
            onChange={event => claudia.setQuestion(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Pergunte sobre qualquer obra ou módulo…"
            className="max-h-32 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent py-1 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Perguntar"
            title={pending ? `${AGENT.name} ainda está respondendo` : 'Perguntar (Enter)'}
            className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm transition-colors hover:from-brand-700 hover:to-brand-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={15} aria-hidden />
          </button>
        </form>
      )}
      <p data-tour="agente-uso" className="flex flex-wrap justify-between gap-x-2 text-[10.5px] text-slate-400">
        <span>Este assunto: {formatUsd(topicCost(topic))}</span>
        {usage && (
          <span>
            Mês: {formatUsd(usage.monthUsd)} de {formatUsd(usage.budgetUsd)} · {usage.model}
            {usage.userLimitUsd != null ? ` · você: ${formatUsd(usage.userUsd)} de ${formatUsd(usage.userLimitUsd)}` : ''}
          </span>
        )}
      </p>
    </div>
  );
}

function TopicList({ claudia }: { claudia: ClaudiaApi }) {
  const { store, prefs } = claudia;
  const [now] = useState(() => new Date());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  /** O Enter grava e desmonta o campo; o `blur` que alguns navegadores disparam na saída não grava de novo. */
  const editingRef = useRef<string | null>(null);

  useEffect(() => {
    editingRef.current = editing;
    if (editing) {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    }
  }, [editing]);

  const startEdit = (topic: Topic) => {
    setDraft(topic.title);
    setEditing(topic.id);
  };
  const finish = (save: boolean) => {
    const id = editingRef.current;
    if (!id) return;
    editingRef.current = null;
    if (save) claudia.renameTopic(id, draft);
    setEditing(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={claudia.newTopic}
        className="mx-3 mt-2.5 mb-0.5 flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-brand-300 py-1.5 text-[12.5px] font-semibold text-primary transition-colors hover:bg-brand-50"
      >
        <Plus size={16} aria-hidden />
        Novo assunto
      </button>
      {store.topics.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Nenhum assunto ainda. A primeira pergunta abre um.</p>
      ) : (
        <ul className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 py-2">
          {store.topics.map(topic => {
            const current = topic.id === prefs.activeId;
            return (
              <li
                key={topic.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-[10px] px-2.5 py-2 ${
                  current ? 'bg-brand-50 ring-1 ring-inset ring-brand-200' : 'hover:bg-slate-50'
                }`}
              >
                {editing === topic.id ? (
                  <form
                    onSubmit={event => {
                      event.preventDefault();
                      finish(true);
                    }}
                  >
                    <input
                      ref={input}
                      value={draft}
                      maxLength={80}
                      onChange={event => setDraft(event.target.value)}
                      onBlur={() => finish(true)}
                      onKeyDown={event => {
                        if (event.key !== 'Escape') return;
                        // O Esc aqui cancela a edição; não fecha a janela.
                        event.preventDefault();
                        event.stopPropagation();
                        finish(false);
                      }}
                      aria-label="Novo nome do assunto"
                      className="field px-2 py-1 text-xs"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => claudia.selectTopic(topic.id)}
                    aria-current={current ? 'true' : undefined}
                    className="min-w-0 text-left"
                  >
                    <span className="block truncate text-[12.5px] font-semibold text-slate-900">{topic.title}</span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {topicMeta(topic, now)}
                      {hasPending(topic) ? ' · aguardando resposta' : ''}
                    </span>
                  </button>
                )}
                <span className="flex items-center gap-0.5">
                  <IconButton small label={`Renomear “${topic.title}”`} onClick={() => startEdit(topic)}>
                    <Pencil size={12} aria-hidden />
                  </IconButton>
                  <IconButton small label={`Apagar “${topic.title}”`} onClick={() => claudia.removeTopic(topic.id)}>
                    <X size={13} aria-hidden />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-auto shrink-0 border-t border-slate-100 px-3 py-2 text-[10.5px] text-slate-400">
        Os últimos 20 assuntos ficam guardados neste navegador. O título vem da primeira pergunta; o lápis renomeia.
      </p>
    </div>
  );
}

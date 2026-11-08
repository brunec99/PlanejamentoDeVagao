import type { AgentProposal, ProposalKind } from '@/application/use-cases/agent-tools';

/** Assuntos da Claudia geral (08/11/2026, só admins): a conversa pertence ao assunto, não à tela nem à
 * obra. Os assuntos ficam neste navegador (localStorage, uma chave por pessoa), os 20 mais recentes, com
 * o título tirado da primeira pergunta. Cada pergunta guarda o contexto de onde foi feita (obra e tela),
 * que a conversa mostra num marcador cinza e que vai ao modelo como prefixo no histórico.
 *
 * Funções puras, sem React: a janela (`claudia-window.tsx`) guarda o estado e chama estas funções. Todo
 * acesso ao armazenamento passa por `try/catch`: navegador em modo privado, cota cheia ou bloqueio de
 * dados do site não podem derrubar a tela. */

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type ProposalState =
  | { status: 'pendente' }
  | { status: 'aplicando'; done: number }
  | { status: 'aplicada' }
  | { status: 'descartada' }
  /** `done` é quantos comandos já foram gravados: "Tentar de novo" continua dali, sem repetir. */
  | { status: 'falhou'; done: number; message: string };
export interface ProposalCard {
  proposal: AgentProposal;
  state: ProposalState;
}

/** Onde a pergunta foi feita. `screen` usa as chaves do manual (`SCREEN_LABEL`); `label` é o texto do
 * chip ("Mozine · Terminalidade", "Dashboard geral"). */
export interface TopicContext {
  workId?: string;
  workName?: string;
  screen?: string;
  label: string;
}
/** Uma rodada: a pergunta e, quando chega, a resposta (com as propostas e o que ela consultou) ou o erro. */
export interface TopicTurn {
  id: string;
  question: string;
  askedAt: string;
  context: TopicContext;
  answer?: string;
  error?: string;
  proposals: ProposalCard[];
  consulted: string[];
  costUsd?: number;
  model?: string;
}
export interface Topic {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  turns: TopicTurn[];
}
export interface TopicStore {
  version: typeof STORE_VERSION;
  topics: Topic[];
}
export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
/** Estado da janela, lembrado entre recargas. `activeId` nulo é um assunto novo, ainda sem pergunta. */
export type WindowMode = 'closed' | 'open' | 'minimized';
export interface WindowPrefs {
  mode: WindowMode;
  expanded: boolean;
  activeId: string | null;
}
/** O pedaço do `Storage` que estas funções usam, para os testes passarem um armazenamento falso. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

// ─── Constantes ────────────────────────────────────────────────────────────────

export const STORE_VERSION = 1;
export const MAX_TOPICS = 20;
/** Rodadas respondidas que vão ao modelo como histórico (regra 11); o servidor também corta. */
export const HISTORY_TURNS = 8;
export const TITLE_MAX = 60;
export const RENAME_MAX = 80;
export const INTERRUPTED_MESSAGE = 'A resposta foi interrompida porque a página recarregou. Pergunte de novo.';
export const INTERRUPTED_APPLY_MESSAGE =
  'A aplicação foi interrompida porque a página recarregou. Confira a planilha antes de tentar de novo.';

export const topicsKey = (userId: string) => `obra360:claudia:assuntos:${userId}`;
export const windowKey = (userId: string) => `obra360:claudia:janela:${userId}`;

/** Nome curto de cada tela, para o chip de contexto. As chaves são as de `SCREEN_LABEL` do manual, que não
 * é importado aqui: ele puxa o manual inteiro (~200 KB) para o navegador. */
export const SCREEN_NAMES: Readonly<Record<string, string>> = {
  obras: 'Lista de obras',
  'dashboard-geral': 'Dashboard geral',
  'configuracoes-gerais': 'Configurações',
  dashboard: 'Dashboard',
  'longo-prazo': 'Longo prazo',
  vagoes: 'Vagões',
  'medio-prazo': 'Médio prazo',
  'curto-prazo': 'Curto prazo',
  terminalidade: 'Terminalidade',
  seguranca: 'Segurança do trabalho',
  federacao: 'Modelo federado',
  ifc: 'Arquivos IFC',
  dividas: 'Dívidas',
  importar: 'Integrações',
  configuracoes: 'Configurações da obra',
};
const WORK_SECTIONS = new Set([
  'dashboard',
  'longo-prazo',
  'vagoes',
  'medio-prazo',
  'curto-prazo',
  'terminalidade',
  'seguranca',
  'federacao',
  'ifc',
  'dividas',
  'importar',
  'configuracoes',
]);
/** Preposição do marcador "perguntado no Dashboard geral", "perguntado na Lista de obras". */
const SCREEN_PREPOSITION: Readonly<Record<string, string>> = {
  obras: 'na',
  'dashboard-geral': 'no',
  'configuracoes-gerais': 'em',
};

const PROPOSAL_KINDS = new Set<ProposalKind>(['levar', 'criar', 'apontar']);

// ─── Contexto ──────────────────────────────────────────────────────────────────

export function workIdFromPath(pathname: string | null | undefined): string | undefined {
  const match = /^\/obras\/([^/?#]+)/.exec(pathname ?? '');
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** A tela, na chave do manual: dentro da obra a seção (a tela de um vagão conta como "vagoes"), fora dela
 * a lista de obras, o Dashboard geral ou as Configurações do sistema. Seção desconhecida não vai. */
export function screenFromPath(pathname: string | null | undefined): string | undefined {
  const path = pathname ?? '';
  const section = /^\/obras\/[^/?#]+\/([^/?#]+)/.exec(path)?.[1];
  if (section !== undefined) return WORK_SECTIONS.has(section) ? section : undefined;
  if (/^\/obras\/?$/.test(path)) return 'obras';
  if (/^\/dashboard\/?$/.test(path)) return 'dashboard-geral';
  if (/^\/configuracoes(?:\/|$)/.test(path)) return 'configuracoes-gerais';
  return undefined;
}

/** Contexto do endereço atual. `workName` vem do planejamento carregado; enquanto ele carrega, "Obra". */
export function contextFromPath(pathname: string | null | undefined, workName?: string): TopicContext {
  const workId = workIdFromPath(pathname);
  const screen = screenFromPath(pathname);
  if (workId) {
    const name = workName?.trim() || 'Obra';
    const screenName = screen ? SCREEN_NAMES[screen] : undefined;
    return { workId, workName: name, screen, label: screenName ? `${name} · ${screenName}` : name };
  }
  return { screen, label: screen ? SCREEN_NAMES[screen] : 'Obra 360' };
}

/** "no Dashboard geral", "na Lista de obras", "em Mozine · Terminalidade". */
export function contextPhrase(context: TopicContext): string {
  const preposition = (!context.workId && context.screen && SCREEN_PREPOSITION[context.screen]) || 'em';
  return `${preposition} ${context.label}`;
}

const contextKey = (context: TopicContext) => `${context.workId ?? ''}|${context.screen ?? ''}`;

/** A conversa mostra o marcador "perguntado em…" na primeira pergunta e sempre que o contexto muda. A
 * comparação é por obra e tela, não pelo texto: o nome da obra pode ter chegado depois do planejamento. */
export function showsContextMarker(turns: readonly TopicTurn[], index: number): boolean {
  if (index <= 0) return true;
  const previous = turns[index - 1];
  const current = turns[index];
  return !previous || !current || contextKey(previous.context) !== contextKey(current.context);
}

// ─── Assuntos ──────────────────────────────────────────────────────────────────

export const emptyStore = (): TopicStore => ({ version: STORE_VERSION, topics: [] });

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Título da primeira pergunta, cortado em ~60 caracteres numa palavra inteira. */
export function titleFrom(question: string): string {
  const text = squash(question);
  if (!text) return 'Novo assunto';
  if (text.length <= TITLE_MAX) return text;
  const cut = text.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space >= TITLE_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:!?-]+$/, '')}…`;
}

export function newTurn(input: { id: string; question: string; context: TopicContext; now: string }): TopicTurn {
  return { id: input.id, question: input.question.trim(), askedAt: input.now, context: input.context, proposals: [], consulted: [] };
}

const time = (iso: string) => {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : 0;
};

/** Os 20 mais recentes por `updatedAt`, do mais novo ao mais velho. `keepId` (o assunto aberto) nunca sai. */
export function capTopics(topics: readonly Topic[], keepId?: string | null, max = MAX_TOPICS): Topic[] {
  const sorted = [...topics].sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  if (sorted.length <= max) return sorted;
  const kept = sorted.slice(0, max);
  const keep = keepId ? sorted.find(topic => topic.id === keepId) : undefined;
  if (keep && !kept.includes(keep)) kept.splice(max - 1, 1, keep);
  return kept;
}

/** Acrescenta a pergunta ao assunto `topicId`; se ele não existe (assunto novo, ou apagado enquanto a
 * pessoa escrevia), nasce um com esse id e o título da pergunta. */
export function addTurn(store: TopicStore, topicId: string, turn: TopicTurn, now: string): TopicStore {
  const existing = store.topics.find(topic => topic.id === topicId);
  const topics = existing
    ? store.topics.map(topic => (topic.id === topicId ? { ...topic, updatedAt: now, turns: [...topic.turns, turn] } : topic))
    : [...store.topics, { id: topicId, title: titleFrom(turn.question), createdAt: now, updatedAt: now, turns: [turn] }];
  return { ...store, topics: capTopics(topics, topicId) };
}

/** Altera uma rodada. Com `now`, o assunto sobe na lista (a resposta chegou). Assunto ou rodada que não
 * existem mais (apagados enquanto a resposta vinha) deixam o estado como está. */
export function updateTurn(
  store: TopicStore,
  topicId: string,
  turnId: string,
  update: (turn: TopicTurn) => TopicTurn,
  now?: string,
): TopicStore {
  const topic = store.topics.find(t => t.id === topicId);
  if (!topic || !topic.turns.some(turn => turn.id === turnId)) return store;
  const changed: Topic = {
    ...topic,
    updatedAt: now ?? topic.updatedAt,
    turns: topic.turns.map(turn => (turn.id === turnId ? update(turn) : turn)),
  };
  const topics = store.topics.map(t => (t.id === topicId ? changed : t));
  return { ...store, topics: now ? capTopics(topics, topicId) : topics };
}

export function setProposalState(store: TopicStore, topicId: string, turnId: string, proposalId: string, state: ProposalState): TopicStore {
  return updateTurn(store, topicId, turnId, turn => ({
    ...turn,
    proposals: turn.proposals.map(card => (card.proposal.id === proposalId ? { ...card, state } : card)),
  }));
}

/** Renomeia sem mudar a ordem da lista. Nome vazio não é aceito: o assunto fica com o título anterior. */
export function renameTopic(store: TopicStore, topicId: string, title: string): TopicStore {
  const name = squash(title).slice(0, RENAME_MAX).trim();
  if (!name) return store;
  return { ...store, topics: store.topics.map(topic => (topic.id === topicId ? { ...topic, title: name } : topic)) };
}

export function deleteTopic(store: TopicStore, topicId: string): TopicStore {
  return { ...store, topics: store.topics.filter(topic => topic.id !== topicId) };
}

/** Desfaz a exclusão: o assunto volta à lista na posição do seu `updatedAt`. */
export function restoreTopic(store: TopicStore, topic: Topic): TopicStore {
  return { ...store, topics: capTopics([...store.topics.filter(t => t.id !== topic.id), topic], topic.id) };
}

export function removeTopics(store: TopicStore, ids: readonly string[]): TopicStore {
  if (!ids.length) return store;
  const drop = new Set(ids);
  return { ...store, topics: store.topics.filter(topic => !drop.has(topic.id)) };
}

export const isPending = (turn: TopicTurn) => turn.answer === undefined && !turn.error;
export const hasPending = (topic: Topic | undefined) => !!topic?.turns.some(isPending);

/** Na carga da página, a pergunta sem resposta nem erro não vai mais receber resposta (o `fetch` morreu com
 * a página), e a proposta que estava sendo aplicada parou no meio. As duas viram erro, com o que fazer. */
export function markInterrupted(store: TopicStore): TopicStore {
  let changed = false;
  const topics = store.topics.map(topic => {
    let touched = false;
    const turns = topic.turns.map(turn => {
      let next = turn;
      if (isPending(turn)) next = { ...next, error: INTERRUPTED_MESSAGE };
      if (turn.proposals.some(card => card.state.status === 'aplicando'))
        next = {
          ...next,
          proposals: turn.proposals.map(card =>
            card.state.status === 'aplicando'
              ? { ...card, state: { status: 'falhou' as const, done: card.state.done, message: INTERRUPTED_APPLY_MESSAGE } }
              : card,
          ),
        };
      if (next !== turn) touched = true;
      return next;
    });
    if (!touched) return topic;
    changed = true;
    return { ...topic, turns };
  });
  return changed ? { ...store, topics } : store;
}

/** Histórico enviado ao modelo: as 8 últimas rodadas respondidas, como texto, cada pergunta com o contexto
 * de onde foi feita ("[Tela: Mozine · Terminalidade] E as pendências daqui?"). Propostas e erros ficam de fora. */
export function buildHistory(turns: readonly TopicTurn[], limit = HISTORY_TURNS): HistoryMessage[] {
  return turns
    .filter((turn): turn is TopicTurn & { answer: string } => typeof turn.answer === 'string' && !turn.error)
    .slice(-limit)
    .flatMap(turn => [
      { role: 'user' as const, content: `${contextPrefix(turn.context)} ${turn.question}` },
      { role: 'assistant' as const, content: turn.answer },
    ]);
}
export const contextPrefix = (context: TopicContext) => `[Tela: ${context.label}]`;

export const topicCost = (topic: Topic | undefined) =>
  topic ? topic.turns.reduce((sum, turn) => sum + (Number.isFinite(turn.costUsd) ? (turn.costUsd as number) : 0), 0) : 0;

const pad = (value: number) => String(value).padStart(2, '0');
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Hoje, 14:32", "Ontem, 18:05", "05/11" (e "05/11/2025" em outro ano), no fuso do navegador. */
export function formatWhen(iso: string, now: Date): string {
  const date = new Date(time(iso));
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (sameDay(date, now)) return `Hoje, ${clock}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(date, yesterday)) return `Ontem, ${clock}`;
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day}/${date.getFullYear()}`;
}

/** Obras das perguntas do assunto: uma só pelo nome, mais de uma "várias obras", nenhuma "geral". */
export function topicWorks(topic: Topic): string {
  const names = new Map<string, string>();
  for (const turn of topic.turns) if (turn.context.workId) names.set(turn.context.workId, turn.context.workName || 'Obra');
  if (names.size === 0) return 'geral';
  return names.size === 1 ? [...names.values()][0] : 'várias obras';
}

/** Linha sob o título na lista: "Hoje, 14:32 · 3 perguntas · várias obras". */
export function topicMeta(topic: Topic, now: Date): string {
  const count = topic.turns.length;
  return `${formatWhen(topic.updatedAt, now)} · ${count === 1 ? '1 pergunta' : `${count} perguntas`} · ${topicWorks(topic)}`;
}

// ─── Leitura e gravação ────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const optionalString = (value: unknown) => (isString(value) && value ? value : undefined);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter(isString) : []);
const nonNegativeInt = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0);

function parseState(value: unknown): ProposalState {
  if (!isRecord(value)) return { status: 'pendente' };
  switch (value.status) {
    case 'aplicada':
    case 'descartada':
    case 'pendente':
      return { status: value.status };
    case 'aplicando':
      return { status: 'aplicando', done: nonNegativeInt(value.done) };
    case 'falhou':
      return {
        status: 'falhou',
        done: nonNegativeInt(value.done),
        message: isString(value.message) ? value.message : 'Não foi possível aplicar.',
      };
    default:
      return { status: 'pendente' };
  }
}

function parseCard(value: unknown): ProposalCard | null {
  if (!isRecord(value) || !isRecord(value.proposal)) return null;
  const p = value.proposal;
  if (!isString(p.id) || !p.id || !PROPOSAL_KINDS.has(p.kind as ProposalKind) || !isString(p.title) || !Array.isArray(p.commands))
    return null;
  if (!p.commands.every(isRecord)) return null;
  const proposal: AgentProposal = {
    id: p.id,
    kind: p.kind as ProposalKind,
    title: p.title,
    lines: strings(p.lines),
    commands: p.commands as unknown as AgentProposal['commands'],
    weekStart: isString(p.weekStart) ? p.weekStart : '',
    skipped: strings(p.skipped),
    ...(optionalString(p.workId) ? { workId: p.workId as string } : {}),
    ...(optionalString(p.workName) ? { workName: p.workName as string } : {}),
  };
  return { proposal, state: parseState(value.state) };
}

function parseContext(value: unknown): TopicContext {
  if (!isRecord(value)) return { label: 'Obra 360' };
  const context: TopicContext = { label: optionalString(value.label) ?? 'Obra 360' };
  const workId = optionalString(value.workId);
  const workName = optionalString(value.workName);
  const screen = optionalString(value.screen);
  if (workId) context.workId = workId;
  if (workName) context.workName = workName;
  if (screen) context.screen = screen;
  return context;
}

function parseTurn(value: unknown): TopicTurn | null {
  if (!isRecord(value) || !isString(value.id) || !value.id || !isString(value.question) || !value.question.trim()) return null;
  const turn: TopicTurn = {
    id: value.id,
    question: value.question,
    askedAt: isString(value.askedAt) ? value.askedAt : '',
    context: parseContext(value.context),
    proposals: Array.isArray(value.proposals) ? value.proposals.map(parseCard).filter((card): card is ProposalCard => card !== null) : [],
    consulted: strings(value.consulted),
  };
  if (isString(value.answer)) turn.answer = value.answer;
  if (isString(value.error) && value.error) turn.error = value.error;
  if (typeof value.costUsd === 'number' && Number.isFinite(value.costUsd) && value.costUsd >= 0) turn.costUsd = value.costUsd;
  if (isString(value.model) && value.model) turn.model = value.model;
  return turn;
}

function parseTopic(value: unknown): Topic | null {
  if (!isRecord(value) || !isString(value.id) || !value.id || !Array.isArray(value.turns)) return null;
  const turns = value.turns.map(parseTurn).filter((turn): turn is TopicTurn => turn !== null);
  if (!turns.length) return null;
  const updatedAt = isString(value.updatedAt) ? value.updatedAt : turns[turns.length - 1].askedAt;
  return {
    id: value.id,
    title: optionalString(isString(value.title) ? value.title.trim() : '') ?? titleFrom(turns[0].question),
    createdAt: isString(value.createdAt) ? value.createdAt : turns[0].askedAt,
    updatedAt,
    turns,
  };
}

export const serializeStore = (store: TopicStore) => JSON.stringify({ version: STORE_VERSION, topics: store.topics });

/** Lê o que está guardado, descartando o que não tem a forma esperada (versão diferente, JSON quebrado,
 * assunto sem pergunta). Nunca lança: o pior caso é a lista vazia. */
export function parseStore(text: string | null | undefined): TopicStore {
  if (!text) return emptyStore();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return emptyStore();
  }
  if (!isRecord(raw) || raw.version !== STORE_VERSION || !Array.isArray(raw.topics)) return emptyStore();
  const byId = new Map<string, Topic>();
  for (const topic of raw.topics.map(parseTopic)) if (topic && !byId.has(topic.id)) byId.set(topic.id, topic);
  return { version: STORE_VERSION, topics: capTopics([...byId.values()]) };
}

/** Carga da página: lê, valida e marca o que a recarga interrompeu. */
export function loadStore(storage: StorageLike | null | undefined, key: string): TopicStore {
  try {
    return markInterrupted(parseStore(storage?.getItem(key)));
  } catch {
    return emptyStore();
  }
}

export function isQuotaError(error: unknown): boolean {
  if (!isRecord(error) && !(error instanceof Error)) return false;
  const { name, code } = error as { name?: unknown; code?: unknown };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}

/** Grava; com a cota cheia, tira o assunto mais antigo (nunca `keepId`, o aberto) e tenta de novo.
 * `dropped` diz quais saíram, para a tela tirá-los também da lista. Outro erro (armazenamento bloqueado)
 * devolve `ok: false` sem mexer em nada. */
export function saveStore(
  storage: StorageLike | null | undefined,
  key: string,
  store: TopicStore,
  keepId?: string | null,
): { ok: boolean; dropped: string[]; text?: string } {
  if (!storage) return { ok: false, dropped: [] };
  const dropped: string[] = [];
  let topics = capTopics(store.topics, keepId);
  for (;;) {
    const text = serializeStore({ version: STORE_VERSION, topics });
    try {
      storage.setItem(key, text);
      return { ok: true, dropped, text };
    } catch (error) {
      if (!isQuotaError(error)) return { ok: false, dropped };
      const candidates = topics.filter(topic => topic.id !== keepId);
      if (!candidates.length) return { ok: false, dropped };
      const oldest = candidates.reduce((a, b) => (time(b.updatedAt) < time(a.updatedAt) ? b : a));
      dropped.push(oldest.id);
      topics = topics.filter(topic => topic.id !== oldest.id);
    }
  }
}

export const DEFAULT_WINDOW: WindowPrefs = { mode: 'closed', expanded: false, activeId: null };

export function parseWindowPrefs(text: string | null | undefined): WindowPrefs {
  if (!text) return DEFAULT_WINDOW;
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw)) return DEFAULT_WINDOW;
    const mode: WindowMode = raw.mode === 'open' || raw.mode === 'minimized' ? raw.mode : 'closed';
    return { mode, expanded: raw.expanded === true, activeId: optionalString(raw.activeId) ?? null };
  } catch {
    return DEFAULT_WINDOW;
  }
}

export function loadWindowPrefs(storage: StorageLike | null | undefined, key: string): WindowPrefs {
  try {
    return parseWindowPrefs(storage?.getItem(key));
  } catch {
    return DEFAULT_WINDOW;
  }
}

export function saveWindowPrefs(storage: StorageLike | null | undefined, key: string, prefs: WindowPrefs): boolean {
  try {
    storage?.setItem(key, JSON.stringify(prefs));
    return !!storage;
  } catch {
    return false;
  }
}

import {
  PENDING_ORIGIN_LABELS,
  PENDING_STATUSES,
  checklistProgress,
  isClosed,
  pendingSignal,
  startBy,
  workdaysUntil,
  type PendingCard,
  type PendingChecklistItem,
  type PendingData,
  type PendingMessage,
  type PendingOrigin,
  type PendingPerson,
  type PendingSignal,
  type PendingStatus,
} from '@/domain/pending-board';
import type { LocalDate } from '@/domain/long-term-plan';

/** Regras de tela da lista de pendência (aba 2, 10/11/2026), sem React: filtros, ordem das colunas, o
 * texto do sinal de prazo, o movimento otimista do card e as menções da conversa. As regras de prazo em
 * si (dias úteis, "começar até", sinal) ficam no contrato, `@/domain/pending-board`. */

// ─── Datas ──────────────────────────────────────────────────────────────────────────────────────

/** "AAAA-MM-DD" → "dd/mm". */
export const dayMonth = (date: LocalDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

const STAMP = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Sao_Paulo',
});
const part = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find(p => p.type === type)?.value ?? '';
/** Carimbo ISO → "dd/mm hh:mm" no fuso das obras (America/Sao_Paulo). Texto inválido volta vazio. */
export function stampLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const parts = STAMP.formatToParts(new Date(ms));
  return `${part(parts, 'day')}/${part(parts, 'month')} ${part(parts, 'hour')}:${part(parts, 'minute')}`;
}
/** Carimbo ISO → "dd/mm" no fuso das obras. */
export const stampDay = (iso: string) => stampLabel(iso).slice(0, 5);

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ─── Filtros e colunas ──────────────────────────────────────────────────────────────────────────

/** Vazio = todos. */
export interface PendingFilters {
  responsibleId: string;
  origin: PendingOrigin | '';
}
export const NO_FILTERS: PendingFilters = { responsibleId: '', origin: '' };
export const hasFilters = (filters: PendingFilters) => !!filters.responsibleId || !!filters.origin;

export function filterCards(cards: readonly PendingCard[], filters: PendingFilters): PendingCard[] {
  return cards.filter(
    card => (!filters.responsibleId || card.responsibleId === filters.responsibleId) && (!filters.origin || card.origin === filters.origin),
  );
}

const byPosition = (a: PendingCard, b: PendingCard) =>
  a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Os cards de cada coluna, na ordem do quadro. */
export function cardsByStatus(cards: readonly PendingCard[]): Record<PendingStatus, PendingCard[]> {
  const columns = Object.fromEntries(PENDING_STATUSES.map(status => [status, [] as PendingCard[]])) as Record<PendingStatus, PendingCard[]>;
  for (const card of cards) columns[card.status]?.push(card);
  for (const status of PENDING_STATUSES) columns[status].sort(byPosition);
  return columns;
}

/** "Médio prazo · Forro de gesso 5º pav." nos cards ligados a tarefa ou serviço; nos demais, só a origem. */
export function originLabel(card: Pick<PendingCard, 'origin' | 'sourceLabel'>): string {
  const linked = card.origin === 'medio_prazo' || card.origin === 'longo_prazo';
  return linked && card.sourceLabel ? `${PENDING_ORIGIN_LABELS[card.origin]} · ${card.sourceLabel}` : PENDING_ORIGIN_LABELS[card.origin];
}
/** A entrega acompanha a tarefa ou o serviço de origem (regras 4 e 5): não é digitada. */
export const isLinked = (card: Pick<PendingCard, 'origin'>) => card.origin === 'medio_prazo' || card.origin === 'longo_prazo';
export const dueDateEditable = (card: Pick<PendingCard, 'origin'>) => !isLinked(card);

/** Regra 10: exclui quem criou o card ou o admin. O servidor confere de novo. */
export const canDeleteCard = (card: Pick<PendingCard, 'createdBy'>, actorId: string, admin: boolean) => admin || card.createdBy === actorId;

// ─── Sinal de prazo (regra 3) ───────────────────────────────────────────────────────────────────

export interface SignalChip {
  signal: PendingSignal;
  text: string;
}
/** O texto do chip de prazo. A cor só reforça: o texto sempre diz o que é. Os dias são úteis, como
 * todo prazo do quadro. */
export function signalChip(card: Pick<PendingCard, 'status' | 'dueDate' | 'leadTimeDays' | 'closedAt'>, today: LocalDate): SignalChip {
  const signal = pendingSignal(card, today);
  if (signal === 'closed') {
    const word = card.status === 'cancelled' ? 'Cancelada' : 'Concluída';
    const day = card.closedAt ? stampDay(card.closedAt) : '';
    return { signal, text: day ? `${word} em ${day}` : word };
  }
  if (signal === 'late') {
    if (card.dueDate < today) {
      // Entrega num sábado conferida no domingo dá zero dia útil: ainda assim está atrasada.
      const days = Math.max(1, workdaysUntil(card.dueDate, today));
      return { signal, text: `Atrasada ${plural(days, 'dia útil', 'dias úteis')}` };
    }
    return { signal, text: `Devia ter começado em ${dayMonth(startBy(card))}` };
  }
  if (card.status === 'todo') return { signal, text: `Começar até ${dayMonth(startBy(card))}` };
  const days = workdaysUntil(today, card.dueDate);
  return { signal, text: days === 0 ? 'Entrega hoje' : `Faltam ${plural(days, 'dia útil', 'dias úteis')}` };
}

/** Os três contadores acima do quadro: só os cards abertos. */
export function summarizeSignals(cards: readonly PendingCard[], today: LocalDate): { late: number; soon: number; ok: number } {
  const out = { late: 0, soon: 0, ok: 0 };
  for (const card of cards) {
    if (isClosed(card.status)) continue;
    const signal = pendingSignal(card, today);
    if (signal !== 'closed') out[signal] += 1;
  }
  return out;
}

/** "Entrega 02/12 · 20 d" do rodapé do card. */
export const dueLabel = (card: Pick<PendingCard, 'dueDate' | 'leadTimeDays'>) =>
  `Entrega ${dayMonth(card.dueDate)} · ${card.leadTimeDays} d`;

// ─── Checklists e conversa ──────────────────────────────────────────────────────────────────────

/** Itens ainda sem marcar: concluir o card com algum aberto pede confirmação (regra 8). */
export function openItemCount(items: readonly PendingChecklistItem[], cardId: string): number {
  const { done, total } = checklistProgress(items, cardId);
  return total - done;
}
export const progressPercent = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);

const byCreated = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
/** A conversa do card, em ordem cronológica (mensagens e linhas do sistema juntas). */
export const messagesOf = (messages: readonly PendingMessage[], cardId: string) =>
  messages.filter(m => m.cardId === cardId).sort(byCreated);
/** O número ao lado do balão no card: só o que alguém escreveu, sem o histórico do sistema. */
export const messageCount = (messages: readonly PendingMessage[], cardId: string) =>
  messages.filter(m => m.cardId === cardId && m.kind === 'message').length;

// ─── Pessoas ────────────────────────────────────────────────────────────────────────────────────

/** Duas letras para o avatar: a primeira do nome e a primeira do último sobrenome. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : (words[0][1] ?? '');
  return (first + last).toLocaleUpperCase('pt-BR');
}
export const personName = (people: readonly PendingPerson[], id: string, fallback = 'Pessoa sem acesso à obra') =>
  people.find(p => p.id === id)?.name ?? fallback;
export const sortPeople = (people: readonly PendingPerson[]) => [...people].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

// ─── Menções (regra 6) ──────────────────────────────────────────────────────────────────────────

/** Sem acento e em minúsculas, para o filtro do @ achar "João" digitando "joa". */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
const isWordChar = (char: string | undefined) => !!char && /[\p{L}\p{N}_]/u.test(char);
/** O maior nome completo do sistema cabe com folga; passou disso, o @ já não é uma menção em digitação. */
const MAX_QUERY = 60;

/** O @ que está sendo digitado na posição do cursor: onde começa e o que já foi escrito depois dele.
 * Só vale o @ no começo do texto ou depois de espaço (um e-mail no meio da frase não abre a lista). */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | undefined {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('@');
  if (start < 0) return undefined;
  if (start > 0 && !/\s/.test(before[start - 1])) return undefined;
  const query = before.slice(start + 1);
  if (query.length > MAX_QUERY || /[\n@]/.test(query)) return undefined;
  return { start, query };
}

/** Quem a lista do @ mostra: o que foi digitado começa o nome ou algum dos sobrenomes. Quem começa pelo
 * primeiro nome vem antes. */
export function matchPeople(people: readonly PendingPerson[], query: string, limit = 6): PendingPerson[] {
  const needle = fold(query.trimStart());
  const ranked = sortPeople(people).flatMap(person => {
    const name = fold(person.name);
    if (!needle || name.startsWith(needle)) return [{ person, rank: 0 }];
    const inWord = name.split(/\s+/).some((_, index, words) => words.slice(index).join(' ').startsWith(needle));
    return inWord ? [{ person, rank: 1 }] : [];
  });
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(r => r.person);
}

/** Troca o "@que" em digitação por "@Nome Completo " e devolve onde o cursor fica. */
export function applyMention(text: string, start: number, caret: number, person: PendingPerson): { text: string; caret: number } {
  const inserted = `@${person.name} `;
  const rest = text.slice(caret).replace(/^ /, '');
  return { text: text.slice(0, start) + inserted + rest, caret: start + inserted.length };
}

export interface BodySegment {
  text: string;
  /** Id da pessoa marcada, quando o trecho é uma menção. */
  personId?: string;
}
/** Quebra o texto nas menções "@Nome Completo" de `people`. Vale o nome mais longo que casa (para
 * "@Ana Lima Souza" não virar "@Ana Lima" + " Souza") e o nome precisa terminar ali. */
export function splitMentions(body: string, people: readonly PendingPerson[]): BodySegment[] {
  const candidates = [...people].filter(p => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  const segments: BodySegment[] = [];
  let plain = '';
  let index = 0;
  while (index < body.length) {
    if (body[index] === '@' && (index === 0 || !isWordChar(body[index - 1]))) {
      const person = candidates.find(p => body.startsWith(p.name, index + 1) && !isWordChar(body[index + 1 + p.name.length]));
      if (person) {
        if (plain) segments.push({ text: plain });
        plain = '';
        segments.push({ text: `@${person.name}`, personId: person.id });
        index += 1 + person.name.length;
        continue;
      }
    }
    plain += body[index];
    index += 1;
  }
  if (plain) segments.push({ text: plain });
  return segments;
}

/** Ids de quem foi marcado no texto, sem repetir, na ordem em que aparecem. */
export function extractMentions(body: string, people: readonly PendingPerson[]): string[] {
  const ids: string[] = [];
  for (const segment of splitMentions(body, people)) if (segment.personId && !ids.includes(segment.personId)) ids.push(segment.personId);
  return ids;
}

// ─── Movimento otimista (regra 2) ───────────────────────────────────────────────────────────────

export interface MoveTarget {
  status: PendingStatus;
  /** O card que fica logo abaixo; ausente = fim da coluna. */
  beforeCardId?: string;
}

/** O card já está nessa posição: soltar ali não é um movimento. */
export function isSamePlace(cards: readonly PendingCard[], cardId: string, target: MoveTarget): boolean {
  const card = cards.find(c => c.id === cardId);
  if (!card || card.status !== target.status) return false;
  if (target.beforeCardId === cardId) return true;
  const column = cardsByStatus(cards)[card.status];
  const next = column[column.findIndex(c => c.id === cardId) + 1];
  return next?.id === target.beforeCardId;
}

/** Como o quadro fica depois do movimento, antes de o servidor responder: o card troca de coluna, entra
 * acima de `beforeCardId` (ou no fim) e a coluna de destino é renumerada. O motivo acompanha só as
 * colunas que o pedem. */
export function applyMove(cards: readonly PendingCard[], cardId: string, target: MoveTarget, reason?: string): PendingCard[] {
  const card = cards.find(c => c.id === cardId);
  if (!card) return [...cards];
  const moved: PendingCard = { ...card, status: target.status, statusReason: reason?.trim() || undefined };
  const column = cardsByStatus(cards.filter(c => c.id !== cardId))[target.status];
  const at = target.beforeCardId ? column.findIndex(c => c.id === target.beforeCardId) : -1;
  if (at < 0) column.push(moved);
  else column.splice(at, 0, moved);
  const order = new Map(column.map((c, index) => [c.id, index]));
  return cards.map(c => {
    const orderIndex = order.get(c.id);
    if (orderIndex === undefined) return c;
    return c.id === cardId ? { ...moved, orderIndex } : { ...c, orderIndex };
  });
}

/** Marca ou desmarca um item antes de o servidor responder. */
export function applyItemDone(data: PendingData, itemId: string, done: boolean): PendingData {
  return { ...data, items: data.items.map(item => (item.id === itemId ? { ...item, done } : item)) };
}

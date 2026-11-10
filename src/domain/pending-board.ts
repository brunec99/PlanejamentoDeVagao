import { addDays, toMs, type LocalDate } from './long-term-plan';

/** Lista de pendência da aba 2 (10/11/2026, modelo aprovado "Modelo da lista de pendência"): quadro
 * Kanban de cinco colunas com conversa, menções e checklists. Fica FORA do snapshot do planejamento
 * (migração 0043), como a terminalidade e a segurança. Este arquivo é o contrato: tipos, comandos e as
 * regras de prazo, sem banco nem tela. */

export type PendingId = string;

/** As cinco colunas, na ordem do quadro (regra 2). */
export const PENDING_STATUSES = ['todo', 'doing', 'paused', 'done', 'cancelled'] as const;
export type PendingStatus = (typeof PENDING_STATUSES)[number];
export const PENDING_STATUS_LABELS: Record<PendingStatus, string> = {
  todo: 'A fazer',
  doing: 'Fazendo',
  paused: 'Pausado',
  done: 'Concluído',
  cancelled: 'Cancelado',
};
/** Pausar e cancelar pedem motivo, que aparece no card (regra 2). */
export const statusNeedsReason = (status: PendingStatus) => status === 'paused' || status === 'cancelled';
export const isPendingStatus = (value: unknown): value is PendingStatus => PENDING_STATUSES.includes(value as PendingStatus);

/** De onde o card veio. `restricao` são as restrições do antigo "Módulo de restrições" do longo prazo,
 * copiadas pela migração 0043 (regra 9). */
export const PENDING_ORIGINS = ['manual', 'medio_prazo', 'longo_prazo', 'restricao'] as const;
export type PendingOrigin = (typeof PENDING_ORIGINS)[number];
export const PENDING_ORIGIN_LABELS: Record<PendingOrigin, string> = {
  manual: 'Manual',
  medio_prazo: 'Médio prazo',
  longo_prazo: 'Longo prazo',
  restricao: 'Restrição',
};

export interface PendingCard {
  id: PendingId;
  workId: string;
  title: string;
  description?: string;
  status: PendingStatus;
  /** Motivo da pausa ou do cancelamento; some quando o card sai dessas colunas. */
  statusReason?: string;
  origin: PendingOrigin;
  /** `medio_prazo`: id da tarefa do plano do mês (`plan_tasks.id`). `longo_prazo`: id do serviço da
   * Linha de Balanço (`lob_services.id`). Ausente nas demais origens. */
  sourceId?: string;
  /** Nome da tarefa ou do serviço no momento da criação (o GET devolve o nome atual quando o acha). */
  sourceLabel?: string;
  /** Data de entrega EFETIVA. Nos cards ligados ao médio ou ao longo prazo o GET devolve a véspera útil
   * do início atual da tarefa ou do serviço (regras 4 e 5); o banco guarda a última data conhecida. */
  dueDate: LocalDate;
  /** Início atual da tarefa ou do serviço de origem, quando o GET o encontrou. */
  sourceStart?: LocalDate;
  /** A tarefa ou o serviço de origem não existe mais: o card fica com a última data gravada. */
  sourceMissing?: boolean;
  /** Tempo de execução (lead time) em dias úteis (regra 3). */
  leadTimeDays: number;
  responsibleId: string;
  /** Posição dentro da coluna, crescente. */
  orderIndex: number;
  /** Quando entrou em Concluído ou Cancelado. */
  closedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingChecklist {
  id: PendingId;
  cardId: PendingId;
  workId: string;
  title: string;
  orderIndex: number;
  createdAt: string;
}
export interface PendingChecklistItem {
  id: PendingId;
  checklistId: PendingId;
  cardId: PendingId;
  workId: string;
  text: string;
  done: boolean;
  doneBy?: string;
  doneAt?: string;
  orderIndex: number;
  createdAt: string;
}
/** `message` é o que alguém escreveu; `system` é a linha de histórico (regra 11), com `authorId` de
 * quem fez a mudança e o texto pronto em `body`. */
export interface PendingMessage {
  id: PendingId;
  cardId: PendingId;
  workId: string;
  kind: 'message' | 'system';
  authorId: string;
  body: string;
  /** Ids dos perfis marcados com @ (só em `message`). */
  mentions: string[];
  createdAt: string;
}

/** Quem pode ser marcado e escolhido como responsável: perfis com a obra liberada. */
export interface PendingPerson {
  id: string;
  name: string;
}

/** Tudo o que a tela da obra recebe. */
export interface PendingData {
  cards: PendingCard[];
  checklists: PendingChecklist[];
  items: PendingChecklistItem[];
  messages: PendingMessage[];
}
/** Resposta do GET /api/pendencias e de cada comando. */
export interface PendingResponse extends PendingData {
  available: boolean;
  people: PendingPerson[];
  /** Quem pediu é admin (pode excluir qualquer card). */
  admin: boolean;
  actorId: string;
}

export const PENDING_LIMITS = {
  title: 160,
  description: 4000,
  reason: 500,
  message: 4000,
  checklistTitle: 120,
  itemText: 300,
  leadTime: 999,
} as const;

/** Comandos do quadro, um por requisição (POST /api/pendencias/commands?workId=). */
export type PendingCommand =
  | {
      type: 'create_card';
      workId: string;
      title: string;
      description?: string;
      origin: 'manual' | 'medio_prazo' | 'longo_prazo';
      /** Obrigatório fora do manual. */
      sourceId?: string;
      sourceLabel?: string;
      /** Manual: a data de término digitada. Demais: a rota recalcula a partir da origem. */
      dueDate: LocalDate;
      leadTimeDays: number;
      responsibleId: string;
    }
  | {
      type: 'update_card';
      cardId: string;
      title?: string;
      description?: string;
      /** Só nos cards manuais e nos de restrição; nos ligados a tarefa ou serviço a data vem da origem. */
      dueDate?: LocalDate;
      leadTimeDays?: number;
      responsibleId?: string;
    }
  /** Muda de coluna e/ou de posição. `beforeCardId` é o card que fica logo abaixo; ausente = fim da coluna. */
  | { type: 'move_card'; cardId: string; status: PendingStatus; reason?: string; beforeCardId?: string }
  | { type: 'delete_card'; cardId: string }
  | { type: 'add_message'; cardId: string; body: string; mentions: string[] }
  | { type: 'create_checklist'; cardId: string; title: string }
  | { type: 'rename_checklist'; checklistId: string; title: string }
  | { type: 'delete_checklist'; checklistId: string }
  | { type: 'add_item'; checklistId: string; text: string }
  | { type: 'update_item'; itemId: string; text?: string; done?: boolean }
  | { type: 'delete_item'; itemId: string };

// ─── Prazo em dias úteis (regra 3: segunda a sexta, sem feriados) ───────────────────────────────

const isWorkday = (date: LocalDate) => {
  const d = new Date(toMs(date)).getUTCDay();
  return d !== 0 && d !== 6;
};
/** `n` dias úteis antes de `date`. Zero devolve a própria data. */
export function subtractWorkdays(date: LocalDate, n: number): LocalDate {
  let d = date;
  for (let k = 0; k < n;) {
    d = addDays(d, -1);
    if (isWorkday(d)) k++;
  }
  return d;
}
/** Dias úteis de `from` (inclusive) até `to` (exclusive); negativo quando `to` já passou. */
export function workdaysUntil(from: LocalDate, to: LocalDate): number {
  if (to === from) return 0;
  const sign = to > from ? 1 : -1;
  const [a, b] = sign === 1 ? [from, to] : [to, from];
  let n = 0;
  for (let d = a; d < b; d = addDays(d, 1)) if (isWorkday(d)) n++;
  return sign * n;
}
/** Entrega de um card ligado a tarefa ou serviço: o dia útil anterior ao início (regras 4 e 5). */
export const dueDateFromStart = (start: LocalDate): LocalDate => subtractWorkdays(start, 1);
/** Até quando o card precisa começar: a entrega menos o tempo de execução, em dias úteis. */
export const startBy = (card: Pick<PendingCard, 'dueDate' | 'leadTimeDays'>): LocalDate =>
  subtractWorkdays(card.dueDate, card.leadTimeDays);

export const isClosed = (status: PendingStatus) => status === 'done' || status === 'cancelled';

/** Sinal do card (regra 3). `late`: passou da entrega sem concluir, ou passou do "começar até" ainda em
 * A fazer. `soon`: precisa começar nos próximos 5 dias úteis e ainda está em A fazer. Pausado conta
 * como aberto: o prazo não para. */
export type PendingSignal = 'late' | 'soon' | 'ok' | 'closed';
export function pendingSignal(card: Pick<PendingCard, 'status' | 'dueDate' | 'leadTimeDays'>, today: LocalDate): PendingSignal {
  if (isClosed(card.status)) return 'closed';
  if (card.dueDate < today) return 'late';
  if (card.status !== 'todo') return 'ok';
  const limit = startBy(card);
  if (limit < today) return 'late';
  return workdaysUntil(today, limit) <= 5 ? 'soon' : 'ok';
}

/** Total marcado das checklists de um card, para a barra do card. */
export function checklistProgress(items: readonly PendingChecklistItem[], cardId: string): { done: number; total: number } {
  const own = items.filter(i => i.cardId === cardId);
  return { done: own.filter(i => i.done).length, total: own.length };
}

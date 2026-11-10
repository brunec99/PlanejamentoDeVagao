import {
  dueDateFromStart,
  isClosed,
  isPendingStatus,
  PENDING_LIMITS,
  PENDING_STATUS_LABELS,
  statusNeedsReason,
  type PendingCard,
  type PendingChecklist,
  type PendingChecklistItem,
  type PendingCommand,
  type PendingData,
  type PendingMessage,
  type PendingPerson,
  type PendingStatus,
} from '../../domain/pending-board';

/** Regras da Lista de pendência da aba 2 (migração 0043), sem banco: recebe os cards, checklists e
 * mensagens de UMA obra e devolve o que gravar e quem avisar por e-mail. Mesmo desenho da segurança
 * (`safety-commands.ts`). Quem pode abrir o módulo e tem a obra faz tudo (regra 1); a única trava por
 * pessoa é a exclusão do card (quem criou ou admin). Toda recusa de regra sai como erro com mensagem
 * pronta para o usuário. Aqui também mora a conta da data viva dos cards ligados ao médio e ao longo
 * prazo (`resolvePendingSources`), pura para ser testada sem banco. */

export type PendingTable = 'cards' | 'checklists' | 'items' | 'messages';
export const PENDING_TABLES: readonly PendingTable[] = ['cards', 'checklists', 'items', 'messages'];

/** Registros completos a inserir ou atualizar, por tabela. */
export interface PendingRowSet {
  cards: PendingCard[];
  checklists: PendingChecklist[];
  items: PendingChecklistItem[];
  messages: PendingMessage[];
}

/** Um aviso por e-mail que o comando gerou. Leva tudo o que o planejador sabe; a obra e o endereço do
 * card entram em `pendingEmail` (`takt-outbox.ts`), e o endereço de e-mail só na hora de enfileirar. */
export interface PendingNotification {
  reason: 'mencao' | 'atribuicao';
  /** Perfil que recebe. */
  userId: string;
  /** Nome completo de quem recebe (o modelo usa o primeiro nome). */
  userName: string;
  cardId: string;
  cardTitle: string;
  /** Só na menção: a mensagem em que a pessoa foi marcada. */
  messageId?: string;
  text?: string;
  authorName: string;
  dueDate: string;
  status: PendingStatus;
  responsibleName: string;
}

/** O que um comando grava. O repositório aplica na ordem: apaga (filhos antes), insere (pais antes) e
 * atualiza. Os avisos só saem depois de a gravação dar certo, e nunca a derrubam. */
export interface PendingMutation {
  workId: string;
  insert: PendingRowSet;
  update: PendingRowSet;
  delete: Record<PendingTable, string[]>;
  notifications: PendingNotification[];
}

export interface PendingContext {
  actorId: string;
  /** Instante ISO da gravação. */
  now: string;
  /** Data civil de hoje no fuso da obra. */
  today: string;
  newId: () => string;
  /** Papel admin: exclui qualquer card. */
  admin: boolean;
  /** Perfis com a obra liberada: quem pode ser responsável e ser marcado. */
  people: PendingPerson[];
  /** Só em `create_card` de origem médio ou longo prazo: a tarefa ou o serviço que a rota achou na obra
   * (início e nome atuais). Ausente = não existe ou é de outra obra, e o comando é recusado. */
  source?: { start: string; label: string };
}

/** Onde o comando atua: direto numa obra ou num registro cuja obra a rota precisa descobrir. */
export type PendingTarget = { workId: string } | { table: Exclude<PendingTable, 'messages'>; id: string };

export const PENDING_COMMAND_TYPES = [
  'create_card',
  'update_card',
  'move_card',
  'delete_card',
  'add_message',
  'create_checklist',
  'rename_checklist',
  'delete_checklist',
  'add_item',
  'update_item',
  'delete_item',
] as const satisfies readonly PendingCommand['type'][];

const fail = (message: string): never => {
  throw new Error(message);
};
const requiredId = (value: unknown, message: string) => (typeof value === 'string' && value ? value : fail(message));

/** Texto obrigatório de uma linha: sem quebras, espaços repetidos viram um. */
function line(value: unknown, label: string, max: number) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text) fail(`Informe ${label}.`);
  if (text.length > max) fail(`${label[0].toUpperCase()}${label.slice(1)} passa de ${max} caracteres.`);
  return text;
}
/** Texto livre (descrição, mensagem): mantém as quebras de linha. */
function block(value: unknown, label: string, max: number) {
  if (value !== undefined && value !== null && typeof value !== 'string') fail('Texto inválido.');
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > max) fail(`${label} passa de ${max} caracteres.`);
  return text;
}
function validDate(value: unknown, label: string) {
  const date = typeof value === 'string' ? value : '';
  const time = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  // Mês 13 nem vira data; 30/02 vira outra data. Os dois são recusados.
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date) fail(`${label} inválida.`);
  return date;
}
function validLeadTime(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > PENDING_LIMITS.leadTime)
    return fail(`O tempo de execução vai de 0 a ${PENDING_LIMITS.leadTime} dias úteis.`);
  return value;
}
function validResponsible(value: unknown, people: readonly PendingPerson[]) {
  const id = requiredId(value, 'Informe o responsável.');
  if (!people.some(p => p.id === id)) fail('O responsável precisa ter acesso a esta obra.');
  return id;
}

const emptyRows = (): PendingRowSet => ({ cards: [], checklists: [], items: [], messages: [] });
const emptyDeletes = (): Record<PendingTable, string[]> => ({ cards: [], checklists: [], items: [], messages: [] });
function mutation(workId: string, parts: Partial<Omit<PendingMutation, 'workId'>> = {}): PendingMutation {
  return { workId, insert: emptyRows(), update: emptyRows(), delete: emptyDeletes(), notifications: [], ...parts };
}
const rows = (partial: Partial<PendingRowSet>): PendingRowSet => ({ ...emptyRows(), ...partial });
const deletes = (partial: Partial<Record<PendingTable, string[]>>) => ({ ...emptyDeletes(), ...partial });

function find<T extends { id: string }>(list: readonly T[], id: unknown, message: string): T {
  return list.find(r => r.id === id) ?? fail(message);
}
const CARD_GONE = 'Card não encontrado. Recarregue a página.';
const CHECKLIST_GONE = 'Checklist não encontrada. Recarregue a página.';
const ITEM_GONE = 'Item não encontrado. Recarregue a página.';

const nextOrder = (list: readonly { orderIndex: number }[]) => list.reduce((max, r) => Math.max(max, r.orderIndex), 0) + 1;
/** Ordem de uma coluna: posição, depois criação e id para desempatar sempre do mesmo jeito. */
export const byPendingOrder = (a: PendingCard, b: PendingCard) =>
  a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

const dmy = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
const nameOf = (people: readonly PendingPerson[], id: string, fallback: string) => people.find(p => p.id === id)?.name ?? fallback;

/** A obra (ou o registro) que o comando altera; a rota confere o acesso antes de carregar os dados. */
export function pendingCommandTarget(command: PendingCommand): PendingTarget {
  switch (command.type) {
    case 'create_card':
      return { workId: requiredId(command.workId, 'Obra não informada.') };
    case 'update_card':
    case 'move_card':
    case 'delete_card':
    case 'add_message':
    case 'create_checklist':
      return { table: 'cards', id: requiredId(command.cardId, 'Card não informado.') };
    case 'rename_checklist':
    case 'delete_checklist':
    case 'add_item':
      return { table: 'checklists', id: requiredId(command.checklistId, 'Checklist não informada.') };
    case 'update_item':
    case 'delete_item':
      return { table: 'items', id: requiredId(command.itemId, 'Item não informado.') };
    default:
      return fail('Comando desconhecido.');
  }
}

/** Confere só o formato mínimo do corpo (objeto com tipo conhecido); o resto o planejador valida. */
export function parsePendingCommand(body: unknown): PendingCommand {
  const type = (body as { type?: unknown } | null)?.type;
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof type !== 'string') return fail('Comando inválido.');
  if (!(PENDING_COMMAND_TYPES as readonly string[]).includes(type)) return fail('Comando desconhecido.');
  return body as PendingCommand;
}

export function planPendingCommand(current: PendingData, command: PendingCommand, ctx: PendingContext): PendingMutation {
  const { actorId, now, people } = ctx;
  const authorName = nameOf(people, actorId, 'Alguém');
  const system = (card: Pick<PendingCard, 'id' | 'workId'>, body: string): PendingMessage => ({
    id: ctx.newId(),
    cardId: card.id,
    workId: card.workId,
    kind: 'system',
    authorId: actorId,
    body,
    mentions: [],
    createdAt: now,
  });
  const notify = (
    reason: PendingNotification['reason'],
    userId: string,
    card: PendingCard,
    extra: Pick<PendingNotification, 'messageId' | 'text'> = {},
  ): PendingNotification => ({
    reason,
    userId,
    userName: nameOf(people, userId, ''),
    cardId: card.id,
    cardTitle: card.title,
    ...extra,
    authorName,
    dueDate: card.dueDate,
    status: card.status,
    responsibleName: nameOf(people, card.responsibleId, 'Sem responsável'),
  });

  switch (command.type) {
    case 'create_card': {
      const workId = requiredId(command.workId, 'Obra não informada.');
      const title = line(command.title, 'o título', PENDING_LIMITS.title);
      const description = block(command.description, 'A descrição', PENDING_LIMITS.description);
      const origin = command.origin;
      if (origin !== 'manual' && origin !== 'medio_prazo' && origin !== 'longo_prazo') return fail('Origem do card inválida.');
      const leadTimeDays = validLeadTime(command.leadTimeDays);
      const responsibleId = validResponsible(command.responsibleId, people);
      let dueDate: string;
      let source: { sourceId: string; sourceLabel: string; sourceStart: string } | undefined;
      if (origin === 'manual') {
        dueDate = validDate(command.dueDate, 'Data de entrega');
      } else {
        const sourceId = requiredId(command.sourceId, origin === 'medio_prazo' ? 'Informe a tarefa do médio prazo.' : 'Informe o serviço.');
        if (!ctx.source)
          return fail(
            origin === 'medio_prazo'
              ? 'A tarefa do médio prazo não foi encontrada nesta obra. Recarregue a página.'
              : 'O serviço da Linha de Balanço não foi encontrado nesta obra. Recarregue a página.',
          );
        // A entrega não é digitada: é a véspera útil do início atual da origem (regras 4 e 5).
        dueDate = dueDateFromStart(validDate(ctx.source.start, 'Data de início da origem'));
        source = { sourceId, sourceLabel: ctx.source.label.slice(0, PENDING_LIMITS.title), sourceStart: ctx.source.start };
      }
      const card: PendingCard = {
        id: ctx.newId(),
        workId,
        title,
        ...(description ? { description } : {}),
        status: 'todo',
        origin,
        ...source,
        dueDate,
        leadTimeDays,
        responsibleId,
        orderIndex: nextOrder(current.cards.filter(c => c.status === 'todo')),
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      };
      return mutation(workId, {
        insert: rows({ cards: [card], messages: [system(card, 'criou a pendência')] }),
        notifications: responsibleId === actorId ? [] : [notify('atribuicao', responsibleId, card)],
      });
    }

    case 'update_card': {
      const card = find(current.cards, command.cardId, CARD_GONE);
      const next: PendingCard = { ...card };
      const messages: PendingMessage[] = [];
      const notifications: PendingNotification[] = [];
      if (command.title !== undefined) next.title = line(command.title, 'o título', PENDING_LIMITS.title);
      if (command.description !== undefined) {
        const description = block(command.description, 'A descrição', PENDING_LIMITS.description);
        if (description) next.description = description;
        else delete next.description;
      }
      if (command.dueDate !== undefined) {
        const dueDate = validDate(command.dueDate, 'Data de entrega');
        if (dueDate !== card.dueDate) {
          if (card.origin === 'medio_prazo' || card.origin === 'longo_prazo')
            return fail(
              `A entrega deste card acompanha ${card.origin === 'medio_prazo' ? 'a tarefa do médio prazo' : 'o serviço da Linha de Balanço'} e não pode ser digitada.`,
            );
          next.dueDate = dueDate;
          messages.push(system(card, `mudou a entrega de ${dmy(card.dueDate)} para ${dmy(dueDate)}`));
        }
      }
      if (command.leadTimeDays !== undefined) next.leadTimeDays = validLeadTime(command.leadTimeDays);
      if (command.responsibleId !== undefined && command.responsibleId !== card.responsibleId) {
        next.responsibleId = validResponsible(command.responsibleId, people);
        const from = nameOf(people, card.responsibleId, 'outra pessoa');
        messages.push(system(card, `passou a responsabilidade de ${from} para ${nameOf(people, next.responsibleId, '')}`));
        if (next.responsibleId !== actorId) notifications.push(notify('atribuicao', next.responsibleId, next));
      }
      const changed = (['title', 'description', 'dueDate', 'leadTimeDays', 'responsibleId'] as const).some(k => next[k] !== card[k]);
      if (!changed) return mutation(card.workId);
      next.updatedAt = now;
      return mutation(card.workId, { update: rows({ cards: [next] }), insert: rows({ messages }), notifications });
    }

    case 'move_card': {
      const card = find(current.cards, command.cardId, CARD_GONE);
      const status = isPendingStatus(command.status) ? command.status : fail('Coluna inválida.');
      const statusChanged = status !== card.status;
      const next: PendingCard = { ...card, status };
      const messages: PendingMessage[] = [];
      if (statusChanged) {
        if (statusNeedsReason(status)) {
          const reason = block(command.reason, 'O motivo', PENDING_LIMITS.reason);
          if (!reason) return fail(status === 'paused' ? 'Informe o motivo da pausa.' : 'Informe o motivo do cancelamento.');
          next.statusReason = reason;
          messages.push(system(card, `${status === 'paused' ? 'pausou' : 'cancelou'}: ${reason}`));
        } else {
          delete next.statusReason;
          messages.push(system(card, `moveu de ${PENDING_STATUS_LABELS[card.status]} para ${PENDING_STATUS_LABELS[status]}`));
        }
        if (isClosed(status)) next.closedAt = now;
        else delete next.closedAt;
      }

      // Posição na coluna de destino: logo acima de `beforeCardId`, ou no fim. Um `beforeCardId` que já
      // saiu da coluna (outra pessoa moveu) não é erro: o card vai para o fim.
      const column = current.cards.filter(c => c.status === status && c.id !== card.id).sort(byPendingOrder);
      const at = command.beforeCardId ? column.findIndex(c => c.id === command.beforeCardId) : -1;
      const shifted: PendingCard[] = [];
      if (at < 0) {
        const last = column[column.length - 1];
        // No fim e sem mudar de coluna: fica com o número que tem se já é o último.
        const alreadyLast = !statusChanged && (!last || last.orderIndex < card.orderIndex);
        if (!alreadyLast) next.orderIndex = last ? last.orderIndex + 1 : 1;
      } else if (at === 0) {
        if (statusChanged || card.orderIndex >= column[0].orderIndex) next.orderIndex = column[0].orderIndex - 1;
      } else {
        const above = column[at - 1];
        const alreadyThere = !statusChanged && card.orderIndex > above.orderIndex && card.orderIndex < column[at].orderIndex;
        if (!alreadyThere) {
          next.orderIndex = above.orderIndex + 1;
          // Só renumera os de baixo enquanto encostarem no anterior (regra 2: mexer no mínimo).
          let floor = next.orderIndex;
          for (const below of column.slice(at)) {
            if (below.orderIndex > floor) break;
            floor += 1;
            shifted.push({ ...below, orderIndex: floor });
          }
        }
      }
      if (!statusChanged && next.orderIndex === card.orderIndex && !shifted.length) return mutation(card.workId);
      next.updatedAt = now;
      return mutation(card.workId, { update: rows({ cards: [next, ...shifted] }), insert: rows({ messages }) });
    }

    case 'delete_card': {
      const card = find(current.cards, command.cardId, CARD_GONE);
      if (card.createdBy !== actorId && !ctx.admin) return fail('Só quem criou o card ou um administrador pode excluí-lo.');
      const ofCard = <T extends { id: string; cardId: string }>(list: readonly T[]) =>
        list.filter(r => r.cardId === card.id).map(r => r.id);
      return mutation(card.workId, {
        delete: deletes({
          cards: [card.id],
          checklists: ofCard(current.checklists),
          items: ofCard(current.items),
          messages: ofCard(current.messages),
        }),
      });
    }

    case 'add_message': {
      const card = find(current.cards, command.cardId, CARD_GONE);
      const body = block(command.body, 'A mensagem', PENDING_LIMITS.message);
      if (!body) return fail('Escreva a mensagem.');
      if (command.mentions !== undefined && !Array.isArray(command.mentions)) return fail('Lista de pessoas marcadas inválida.');
      const mentions = [...new Set(command.mentions ?? [])].filter(id => id !== actorId);
      for (const id of mentions)
        if (typeof id !== 'string' || !people.some(p => p.id === id)) return fail('Só dá para marcar quem tem acesso a esta obra.');
      const message: PendingMessage = {
        id: ctx.newId(),
        cardId: card.id,
        workId: card.workId,
        kind: 'message',
        authorId: actorId,
        body,
        mentions,
        createdAt: now,
      };
      return mutation(card.workId, {
        insert: rows({ messages: [message] }),
        notifications: mentions.map(id => notify('mencao', id, card, { messageId: message.id, text: body })),
      });
    }

    case 'create_checklist': {
      const card = find(current.cards, command.cardId, CARD_GONE);
      const checklist: PendingChecklist = {
        id: ctx.newId(),
        cardId: card.id,
        workId: card.workId,
        title: line(command.title, 'o título da checklist', PENDING_LIMITS.checklistTitle),
        orderIndex: nextOrder(current.checklists.filter(c => c.cardId === card.id)),
        createdAt: now,
      };
      return mutation(card.workId, { insert: rows({ checklists: [checklist] }) });
    }

    case 'rename_checklist': {
      const checklist = find(current.checklists, command.checklistId, CHECKLIST_GONE);
      const title = line(command.title, 'o título da checklist', PENDING_LIMITS.checklistTitle);
      if (title === checklist.title) return mutation(checklist.workId);
      return mutation(checklist.workId, { update: rows({ checklists: [{ ...checklist, title }] }) });
    }

    case 'delete_checklist': {
      const checklist = find(current.checklists, command.checklistId, CHECKLIST_GONE);
      return mutation(checklist.workId, {
        delete: deletes({ checklists: [checklist.id], items: current.items.filter(i => i.checklistId === checklist.id).map(i => i.id) }),
      });
    }

    case 'add_item': {
      const checklist = find(current.checklists, command.checklistId, CHECKLIST_GONE);
      const item: PendingChecklistItem = {
        id: ctx.newId(),
        checklistId: checklist.id,
        cardId: checklist.cardId,
        workId: checklist.workId,
        text: line(command.text, 'o texto do item', PENDING_LIMITS.itemText),
        done: false,
        orderIndex: nextOrder(current.items.filter(i => i.checklistId === checklist.id)),
        createdAt: now,
      };
      return mutation(checklist.workId, { insert: rows({ items: [item] }) });
    }

    case 'update_item': {
      const item = find(current.items, command.itemId, ITEM_GONE);
      const next: PendingChecklistItem = { ...item };
      if (command.text !== undefined) next.text = line(command.text, 'o texto do item', PENDING_LIMITS.itemText);
      if (command.done !== undefined) {
        if (typeof command.done !== 'boolean') return fail('Marcação do item inválida.');
        if (command.done !== item.done) {
          next.done = command.done;
          if (command.done) {
            next.doneBy = actorId;
            next.doneAt = now;
          } else {
            delete next.doneBy;
            delete next.doneAt;
          }
        }
      }
      if (next.text === item.text && next.done === item.done) return mutation(item.workId);
      return mutation(item.workId, { update: rows({ items: [next] }) });
    }

    case 'delete_item': {
      const item = find(current.items, command.itemId, ITEM_GONE);
      return mutation(item.workId, { delete: deletes({ items: [item.id] }) });
    }

    default:
      return fail('Comando desconhecido.');
  }
}

// ─── Data viva dos cards ligados ao médio e ao longo prazo (regras 4 e 5) ───────────────────────

/** Plano do médio prazo da obra, só com o que a resolução usa. */
export interface PendingSourcePlan {
  id: string;
  /** AAAA-MM. */
  month: string;
  /** Linha de base (`baseline_of` ou `frozen_at`): retrato congelado, nunca é a tarefa viva. */
  baseline: boolean;
  /** Gantt de legalização: não entra na sucessão dos planos do mês. */
  legalization: boolean;
}
export interface PendingSourceTask {
  id: string;
  planId: string;
  name: string;
  plannedStart: string;
  order: number;
  level: number;
  /** `schedule_meta.sourceTaskId`: a tarefa de que esta é cópia. */
  sourceTaskId?: string;
}
/** O que o repositório leu para resolver as origens; a conta abaixo não vai ao banco. */
export interface PendingSourceRows {
  plans: PendingSourcePlan[];
  tasks: PendingSourceTask[];
  services: { id: string; name: string }[];
  /** `lob_activities` dos serviços: um início por local. */
  serviceStarts: { serviceId: string; start: string }[];
}

const nameKey = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Um plano vivo já em ordem, com o início efetivo de cada linha (resumo = menor início das folhas
 * abaixo, como `rollUpPlan`) e a chave "caminho de nomes + ocorrência" de cada uma. */
function indexPlan(tasks: PendingSourceTask[]) {
  const list = tasks.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const hasChildren = (at: number) => list[at + 1] !== undefined && list[at + 1].level > list[at].level;
  const start = new Map<string, string>();
  const keyOf = new Map<string, string>();
  const byKey = new Map<string, string[]>();
  const trail: string[] = [];
  list.forEach((task, at) => {
    let first: string | undefined;
    for (let below = at + 1; below < list.length && list[below].level > task.level; below++)
      if (!hasChildren(below) && (!first || list[below].plannedStart < first)) first = list[below].plannedStart;
    start.set(task.id, first ?? task.plannedStart);
    const depth = Math.min(Math.max(0, task.level), trail.length);
    trail.length = depth;
    trail.push(nameKey(task.name));
    const key = trail.join(' > ');
    keyOf.set(task.id, key);
    byKey.set(key, [...(byKey.get(key) ?? []), task.id]);
  });
  return { start, keyOf, byKey };
}

/** Preenche a data viva dos cards de origem médio ou longo prazo; os demais voltam como vieram.
 *
 * Médio prazo: a tarefa viva é, entre os planos NÃO congelados da obra, a do mês mais recente que é a
 * tarefa do card ou descende dela. A descendência segue `sourceTaskId` (a cópia aponta para a tarefa de
 * que nasceu). Quando o plano do mês seguinte não tem nenhuma linha apontando para o plano atual (a
 * cópia mensal anterior a 10/11/2026 não gravava o elo, e o plano importado do Project não tem como gravar), o par é
 * achado pelo caminho de nomes (resumos acima + nome) na mesma ocorrência, e só quando o caminho se
 * repete o mesmo número de vezes nos dois planos. Sem par no mês seguinte, vale a última tarefa achada
 * (a cópia mensal descarta o que já terminou).
 *
 * Longo prazo: o início é o menor `start_on` do serviço na obra; sem bloco lançado, conta como origem
 * ausente (não há de onde tirar a data). */
export function resolvePendingSources(cards: readonly PendingCard[], sources: PendingSourceRows): PendingCard[] {
  const live = new Map(sources.plans.filter(p => !p.baseline).map(p => [p.id, p]));
  const tasksOfPlan = new Map<string, PendingSourceTask[]>();
  const taskById = new Map<string, PendingSourceTask>();
  const copiesOf = new Map<string, PendingSourceTask[]>();
  for (const task of sources.tasks) {
    if (!live.has(task.planId)) continue;
    taskById.set(task.id, task);
    tasksOfPlan.set(task.planId, [...(tasksOfPlan.get(task.planId) ?? []), task]);
    if (task.sourceTaskId) copiesOf.set(task.sourceTaskId, [...(copiesOf.get(task.sourceTaskId) ?? []), task]);
  }
  const indexes = new Map<string, ReturnType<typeof indexPlan>>();
  const indexOf = (planId: string) => {
    if (!indexes.has(planId)) indexes.set(planId, indexPlan(tasksOfPlan.get(planId) ?? []));
    return indexes.get(planId)!;
  };
  const monthly = [...live.values()]
    .filter(p => !p.legalization)
    .sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id));
  const monthOf = (task: PendingSourceTask) => live.get(task.planId)!.month;

  function successor(task: PendingSourceTask): PendingSourceTask | undefined {
    const plan = live.get(task.planId)!;
    // 1) Elo gravado: a cópia no mês mais recente.
    const linked = (copiesOf.get(task.id) ?? [])
      .filter(t => monthOf(t) > plan.month)
      .sort((a, b) => monthOf(b).localeCompare(monthOf(a)))[0];
    if (linked) return linked;
    if (plan.legalization) return undefined;
    // 2) Sem elo: o plano do mês seguinte, pelo caminho de nomes, se ele não for uma cópia com elo.
    const following = monthly.find(p => p.month > plan.month);
    if (!following) return undefined;
    const candidates = tasksOfPlan.get(following.id) ?? [];
    if (candidates.some(t => t.sourceTaskId && taskById.get(t.sourceTaskId)?.planId === plan.id)) return undefined;
    const from = indexOf(plan.id);
    const to = indexOf(following.id);
    const key = from.keyOf.get(task.id)!;
    const here = from.byKey.get(key) ?? [];
    const there = to.byKey.get(key) ?? [];
    if (!there.length || here.length !== there.length) return undefined;
    return taskById.get(there[here.indexOf(task.id)]);
  }

  const serviceName = new Map(sources.services.map(s => [s.id, s.name]));
  const serviceStart = new Map<string, string>();
  for (const { serviceId, start } of sources.serviceStarts) {
    const known = serviceStart.get(serviceId);
    if (!known || start < known) serviceStart.set(serviceId, start);
  }

  return cards.map(card => {
    if (card.origin !== 'medio_prazo' && card.origin !== 'longo_prazo') return card;
    const { sourceStart: _start, sourceMissing: _missing, ...stored } = card;
    let found: { start: string; label: string } | undefined;
    if (card.origin === 'medio_prazo') {
      let task = card.sourceId ? taskById.get(card.sourceId) : undefined;
      // O teto de voltas é o número de planos: cada passo avança pelo menos um mês.
      for (let step = 0; task && step < live.size; step++) {
        const next = successor(task);
        if (!next) break;
        task = next;
      }
      if (task) found = { start: indexOf(task.planId).start.get(task.id) ?? task.plannedStart, label: task.name };
    } else if (card.sourceId && serviceName.has(card.sourceId) && serviceStart.has(card.sourceId)) {
      found = { start: serviceStart.get(card.sourceId)!, label: serviceName.get(card.sourceId)! };
    }
    if (!found) return { ...stored, sourceMissing: true };
    return { ...stored, dueDate: dueDateFromStart(found.start), sourceStart: found.start, sourceLabel: found.label };
  });
}

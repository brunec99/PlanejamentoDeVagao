import type {
  PendingCard,
  PendingChecklist,
  PendingChecklistItem,
  PendingData,
  PendingMessage,
  PendingPerson,
} from '../../../domain/pending-board';
import {
  linkablePlan,
  resolvePendingSources,
  type PendingMutation,
  type PendingSourcePlan,
  type PendingSourceRows,
  type PendingSourceTask,
  type PendingTable,
} from '../../../application/use-cases/pending-commands';
import { logRouteError } from '../../log';
import { getServiceClient } from './client';

/** Leitura e gravação da Lista de pendência da aba 2 (migração 0043). Mesmo desenho da segurança
 * (`safety-repository.ts`): fora do snapshot do planejamento, cada comando grava só as linhas que mudou
 * e, sem transação entre tabelas no PostgREST, a ordem das operações em `applyMutation` é o que mantém o
 * banco coerente. A data dos cards ligados ao médio e ao longo prazo é recalculada a cada leitura: aqui
 * só se buscam as linhas; a conta é de `resolvePendingSources`. */

const PAGE = 1000;
/** Ids por filtro `in`: vai na URL, e 100 UUIDs não esbarram no limite de tamanho dela. */
const IN_CHUNK = 100;

/** Migração 0043 não aplicada: a lista responde "indisponível" em vez de erro. */
export class PendingUnavailableError extends Error {
  constructor() {
    super('Aplique a migração 0043_pending_board.sql no Supabase para usar a lista de pendência.');
    this.name = 'PendingUnavailableError';
  }
}
/** Outra gravação chegou antes (id já usado, registro apagado no meio tempo). */
export class PendingConflictError extends Error {
  constructor() {
    super('Os dados mudaram enquanto você editava. Recarregue a página e tente de novo.');
    this.name = 'PendingConflictError';
  }
}

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
type DbError = { code?: string; message: string } | null;
function check(error: DbError, action: string) {
  if (!error) return;
  if (missingTable(error.code)) throw new PendingUnavailableError();
  // 23505: único violado; 23503: chave estrangeira (pai apagado por outra pessoa no meio tempo).
  if (error.code === '23505' || error.code === '23503') throw new PendingConflictError();
  throw new Error(`Falha ao ${action}: ${error.message}`);
}
/** Leitura das tabelas de origem (planos, Linha de Balanço): qualquer falha é erro comum, nunca
 * "indisponível", porque quem as chama degrada sozinho. */
function checkSource(error: DbError, action: string) {
  if (error) throw new Error(`Falha ao ${action}: ${error.message}`);
}

const TABLE_NAMES: Record<PendingTable, string> = {
  cards: 'pending_cards',
  checklists: 'pending_checklists',
  items: 'pending_checklist_items',
  messages: 'pending_messages',
};

// ----- Linhas (snake_case, como na migração) e conversões. Opcional ausente = null no banco. -----

type CardRow = {
  id: string;
  work_id: string;
  title: string;
  description: string | null;
  status: PendingCard['status'];
  status_reason: string | null;
  origin: PendingCard['origin'];
  source_id: string | null;
  source_label: string | null;
  due_date: string;
  lead_time_days: number;
  responsible_id: string;
  order_index: number;
  closed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type ChecklistRow = { id: string; card_id: string; work_id: string; title: string; order_index: number; created_at: string };
type ItemRow = {
  id: string;
  checklist_id: string;
  card_id: string;
  work_id: string;
  text: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  order_index: number;
  created_at: string;
};
type MessageRow = {
  id: string;
  card_id: string;
  work_id: string;
  kind: PendingMessage['kind'];
  author_id: string;
  body: string;
  mentions: string[] | null;
  created_at: string;
};

/** `{ chave: valor }` só quando o banco tem valor: opcional nulo some do registro, não vira `undefined`. */
const optional = <K extends string, T>(key: K, value: T | null | undefined) =>
  (value === null || value === undefined ? {} : { [key]: value }) as Partial<Record<K, T>>;

export const pendingFromRow = {
  cards: (r: CardRow): PendingCard => ({
    id: r.id,
    workId: r.work_id,
    title: r.title,
    ...optional('description', r.description || null),
    status: r.status,
    ...optional('statusReason', r.status_reason || null),
    origin: r.origin,
    ...optional('sourceId', r.source_id),
    ...optional('sourceLabel', r.source_label),
    dueDate: r.due_date,
    leadTimeDays: r.lead_time_days,
    responsibleId: r.responsible_id,
    orderIndex: r.order_index,
    ...optional('closedAt', r.closed_at),
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),
  checklists: (r: ChecklistRow): PendingChecklist => ({
    id: r.id,
    cardId: r.card_id,
    workId: r.work_id,
    title: r.title,
    orderIndex: r.order_index,
    createdAt: r.created_at,
  }),
  items: (r: ItemRow): PendingChecklistItem => ({
    id: r.id,
    checklistId: r.checklist_id,
    cardId: r.card_id,
    workId: r.work_id,
    text: r.text,
    done: r.done,
    ...optional('doneBy', r.done_by),
    ...optional('doneAt', r.done_at),
    orderIndex: r.order_index,
    createdAt: r.created_at,
  }),
  messages: (r: MessageRow): PendingMessage => ({
    id: r.id,
    cardId: r.card_id,
    workId: r.work_id,
    kind: r.kind,
    authorId: r.author_id,
    body: r.body,
    mentions: r.mentions ?? [],
    createdAt: r.created_at,
  }),
};

export const pendingToRow = {
  // Todas as colunas sempre entram: sair de Pausado grava o nulo de `status_reason` mesmo sem a chave no
  // registro. `sourceStart` e `sourceMissing` são só da resposta; nunca vão ao banco.
  cards: (c: PendingCard): CardRow => ({
    id: c.id,
    work_id: c.workId,
    title: c.title,
    description: c.description ?? null,
    status: c.status,
    status_reason: c.statusReason ?? null,
    origin: c.origin,
    source_id: c.sourceId ?? null,
    source_label: c.sourceLabel ?? null,
    due_date: c.dueDate,
    lead_time_days: c.leadTimeDays,
    responsible_id: c.responsibleId,
    order_index: c.orderIndex,
    closed_at: c.closedAt ?? null,
    created_by: c.createdBy,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  }),
  checklists: (c: PendingChecklist): ChecklistRow => ({
    id: c.id,
    card_id: c.cardId,
    work_id: c.workId,
    title: c.title,
    order_index: c.orderIndex,
    created_at: c.createdAt,
  }),
  items: (i: PendingChecklistItem): ItemRow => ({
    id: i.id,
    checklist_id: i.checklistId,
    card_id: i.cardId,
    work_id: i.workId,
    text: i.text,
    done: i.done,
    done_by: i.doneBy ?? null,
    done_at: i.doneAt ?? null,
    order_index: i.orderIndex,
    created_at: i.createdAt,
  }),
  messages: (m: PendingMessage): MessageRow => ({
    id: m.id,
    card_id: m.cardId,
    work_id: m.workId,
    kind: m.kind,
    author_id: m.authorId,
    body: m.body,
    mentions: m.mentions,
    created_at: m.createdAt,
  }),
};

// ----- Leitura -----

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Ordem de leitura; o `id` no fim desempata e torna a paginação determinística. */
const ORDER: Record<PendingTable, string[]> = {
  cards: ['order_index', 'created_at', 'id'],
  checklists: ['order_index', 'created_at', 'id'],
  items: ['order_index', 'created_at', 'id'],
  messages: ['created_at', 'id'],
};

/** O PostgREST devolve no máximo 1000 linhas por vez; a conversa de uma obra passa disso com o tempo. */
async function fetchRows(table: PendingTable, workId: string): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = getServiceClient().from(TABLE_NAMES[table]).select('*').eq('work_id', workId);
    for (const column of ORDER[table]) query = query.order(column);
    const { data, error } = await query.range(from, from + PAGE - 1);
    check(error, `ler ${TABLE_NAMES[table]}`);
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return all;
  }
}

type PlanRow = {
  id: string;
  month: string;
  baseline_of: string | null;
  frozen_at: string | null;
  schedule_meta: { kind?: string } | null;
};
type TaskRow = {
  id: string;
  plan_id: string;
  name: string;
  planned_start: string;
  order_index: number;
  level: number | null;
  schedule_meta: { sourceTaskId?: string } | null;
};
const TASK_COLUMNS = 'id, plan_id, name, planned_start, order_index, level, schedule_meta';

/** Planos do médio prazo da obra, só com o que a resolução usa. */
async function fetchPlans(workId: string): Promise<PendingSourcePlan[]> {
  const { data, error } = await getServiceClient()
    .from('medium_term_plans')
    .select('id, month, baseline_of, frozen_at, schedule_meta')
    .eq('work_id', workId);
  checkSource(error, 'ler medium_term_plans');
  return ((data ?? []) as PlanRow[]).map(r => ({
    id: r.id,
    month: r.month,
    baseline: Boolean(r.baseline_of || r.frozen_at),
    legalization: r.schedule_meta?.kind === 'legalizacao',
  }));
}

/** Todas as tarefas de um plano, na ordem do cronograma. */
async function fetchPlanTasks(planId: string): Promise<PendingSourceTask[]> {
  const rows: TaskRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await getServiceClient()
      .from('plan_tasks')
      .select(TASK_COLUMNS)
      .eq('plan_id', planId)
      .order('order_index')
      .order('id')
      .range(from, from + PAGE - 1);
    checkSource(error, 'ler plan_tasks');
    rows.push(...((data ?? []) as TaskRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows.map(r => ({
    id: r.id,
    planId: r.plan_id,
    name: r.name,
    plannedStart: r.planned_start,
    order: r.order_index,
    level: r.level ?? 0,
    ...optional('sourceTaskId', r.schedule_meta?.sourceTaskId),
  }));
}

/** Planos e tarefas do médio prazo que a resolução precisa: os planos da obra, e as tarefas dos planos
 * vivos que contêm alguma tarefa pedida e dos meses seguintes a eles (para onde a cópia mensal as leva). */
async function loadPlanSources(workId: string, taskIds: string[]): Promise<Pick<PendingSourceRows, 'plans' | 'tasks'>> {
  if (!taskIds.length) return { plans: [], tasks: [] };
  const client = getServiceClient();
  const plans = await fetchPlans(workId);
  const live = new Map(plans.filter(p => !p.baseline).map(p => [p.id, p]));
  if (!live.size) return { plans, tasks: [] };

  // Em que planos estão as tarefas dos cards (a obra é conferida pelo plano: tarefa de outra obra some).
  const holders = new Set<string>();
  for (const batch of chunks(taskIds, IN_CHUNK)) {
    const { data, error } = await client.from('plan_tasks').select('id, plan_id').in('id', batch);
    checkSource(error, 'ler plan_tasks');
    for (const r of (data ?? []) as { plan_id: string }[]) if (live.has(r.plan_id)) holders.add(r.plan_id);
  }
  if (!holders.size) return { plans, tasks: [] };
  const firstMonth = [...holders].map(id => live.get(id)!.month).sort()[0];
  const wanted = [...live.values()].filter(p => holders.has(p.id) || (!p.legalization && p.month > firstMonth)).map(p => p.id);
  return { plans, tasks: (await Promise.all(wanted.map(fetchPlanTasks))).flat() };
}

/** Início de cada bloco da Linha de Balanço: de todos os serviços da obra ou só dos pedidos. */
async function fetchServiceStarts(workId: string, serviceIds?: string[]): Promise<PendingSourceRows['serviceStarts']> {
  const starts: PendingSourceRows['serviceStarts'] = [];
  for (let from = 0; ; from += PAGE) {
    let query = getServiceClient().from('lob_activities').select('service_id, start_on').eq('work_id', workId);
    if (serviceIds) query = query.in('service_id', serviceIds);
    const { data, error } = await query.order('id').range(from, from + PAGE - 1);
    checkSource(error, 'ler lob_activities');
    for (const r of (data ?? []) as { service_id: string; start_on: string }[]) starts.push({ serviceId: r.service_id, start: r.start_on });
    if (!data || data.length < PAGE) return starts;
  }
}

/** Serviços da Linha de Balanço pedidos (só os da obra) e o início de cada bloco deles. */
async function loadServiceSources(workId: string, serviceIds: string[]): Promise<Pick<PendingSourceRows, 'services' | 'serviceStarts'>> {
  if (!serviceIds.length) return { services: [], serviceStarts: [] };
  const client = getServiceClient();
  const services: PendingSourceRows['services'] = [];
  const serviceStarts: PendingSourceRows['serviceStarts'] = [];
  for (const batch of chunks(serviceIds, IN_CHUNK)) {
    const found = await client.from('lob_services').select('id, name').eq('work_id', workId).in('id', batch);
    checkSource(found.error, 'ler lob_services');
    services.push(...((found.data ?? []) as { id: string; name: string }[]));
    serviceStarts.push(...(await fetchServiceStarts(workId, batch)));
  }
  return { services, serviceStarts };
}

/** O que `pendingSourceOptions` precisa para o formulário "Nova pendência" da aba 2 (10/11/2026): as
 * tarefas do plano vivo mais recente do médio prazo e todos os serviços da Linha de Balanço da obra. */
export async function loadSourceOptions(workId: string): Promise<PendingSourceRows> {
  const loadTasks = async () => {
    const plans = await fetchPlans(workId);
    const plan = linkablePlan(plans);
    return { plans, tasks: plan ? await fetchPlanTasks(plan.id) : [] };
  };
  const loadServices = async () => {
    const services: PendingSourceRows['services'] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await getServiceClient()
        .from('lob_services')
        .select('id, name')
        .eq('work_id', workId)
        .order('id')
        .range(from, from + PAGE - 1);
      checkSource(error, 'ler lob_services');
      services.push(...((data ?? []) as { id: string; name: string }[]));
      if (!data || data.length < PAGE) return services;
    }
  };
  const [plans, services, serviceStarts] = await Promise.all([loadTasks(), loadServices(), fetchServiceStarts(workId)]);
  return { ...plans, services, serviceStarts };
}

/** Lê do banco o que `resolvePendingSources` precisa para estes cards. */
export async function loadPendingSources(
  workId: string,
  cards: readonly Pick<PendingCard, 'origin' | 'sourceId'>[],
): Promise<PendingSourceRows> {
  const ids = (origin: PendingCard['origin']) => [...new Set(cards.filter(c => c.origin === origin && c.sourceId).map(c => c.sourceId!))];
  const [plans, services] = await Promise.all([
    loadPlanSources(workId, ids('medio_prazo')),
    loadServiceSources(workId, ids('longo_prazo')),
  ]);
  return { ...plans, ...services };
}

/** Cards (já com a data viva dos ligados ao médio e ao longo prazo, regras 4 e 5), checklists, itens e
 * mensagens de uma obra. Se a leitura das origens falhar, os cards voltam com a data gravada e sem
 * `sourceMissing`: uma falha de leitura não pode parecer "a tarefa sumiu". O banco não é regravado aqui;
 * a data nova só é persistida quando um comando atualizar o card. */
export async function loadPending(workId: string): Promise<PendingData> {
  const [cardRows, checklists, items, messages] = await Promise.all([
    fetchRows('cards', workId),
    fetchRows('checklists', workId),
    fetchRows('items', workId),
    fetchRows('messages', workId),
  ]);
  let cards = (cardRows as CardRow[]).map(pendingFromRow.cards);
  if (cards.some(c => c.origin === 'medio_prazo' || c.origin === 'longo_prazo')) {
    try {
      cards = resolvePendingSources(cards, await loadPendingSources(workId, cards));
    } catch (error) {
      logRouteError('pending loadPending (origens)', error, { workId });
    }
  }
  return {
    cards,
    checklists: (checklists as ChecklistRow[]).map(pendingFromRow.checklists),
    items: (items as ItemRow[]).map(pendingFromRow.items),
    messages: (messages as MessageRow[]).map(pendingFromRow.messages),
  };
}

/** Início e nome atuais da tarefa do médio prazo ou do serviço da Linha de Balanço, para `create_card`.
 * `null` = não existe nesta obra (ou é de outra, ou o serviço ainda não tem bloco lançado). */
export async function resolveSourceForCreate(
  workId: string,
  origin: 'medio_prazo' | 'longo_prazo',
  sourceId: string,
): Promise<{ start: string; label: string } | null> {
  const probe = { origin, sourceId, dueDate: '' } as PendingCard;
  const [resolved] = resolvePendingSources([probe], await loadPendingSources(workId, [probe]));
  return resolved.sourceStart ? { start: resolved.sourceStart, label: resolved.sourceLabel ?? '' } : null;
}

/** Obra de um card, checklist ou item, para a rota conferir o acesso antes de carregar tudo. `null` = não existe. */
export async function findWorkIdForEntity(table: Exclude<PendingTable, 'messages'>, id: string): Promise<string | null> {
  const { data, error } = await getServiceClient().from(TABLE_NAMES[table]).select('work_id').eq('id', id).maybeSingle();
  check(error, `ler ${TABLE_NAMES[table]}`);
  return (data as { work_id: string } | null)?.work_id ?? null;
}

/** Perfis com a obra liberada (mesma regra de acesso das rotas: `work_ids`), por nome: quem pode ser
 * responsável e ser marcado com @. */
export async function listPeople(workId: string): Promise<PendingPerson[]> {
  const { data, error } = await getServiceClient().from('profiles').select('id, name').contains('work_ids', [workId]);
  if (error) throw new Error(`Falha ao ler as pessoas da obra: ${error.message}`);
  return ((data ?? []) as { id: string; name: string }[])
    .map(r => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
}

/** Nome da obra, para o e-mail. Vazio quando não achou (o aviso sai mesmo assim). */
export async function loadWorkName(workId: string): Promise<string> {
  const { data, error } = await getServiceClient().from('works').select('name').eq('id', workId).maybeSingle();
  if (error) throw new Error(`Falha ao ler a obra: ${error.message}`);
  return (data as { name: string } | null)?.name ?? '';
}

// ----- Gravação -----

/** Filhos antes dos pais ao apagar; pais antes dos filhos ao inserir. */
const DELETE_ORDER: PendingTable[] = ['messages', 'items', 'checklists', 'cards'];
const INSERT_ORDER: PendingTable[] = ['cards', 'checklists', 'items', 'messages'];

type AnyRecord = { id: string };
const toRow = (table: PendingTable, record: AnyRecord) =>
  (pendingToRow[table] as unknown as (r: AnyRecord) => Record<string, unknown>)(record);

/** Aplica o que o planejador decidiu, sempre preso à obra do comando (filtro `work_id`). Um comando da
 * tela mexe em poucas linhas; o insert de cada tabela vai num lote só (atômico). */
export async function applyMutation(mutation: PendingMutation): Promise<void> {
  const client = getServiceClient();
  const { workId } = mutation;
  if (!workId) throw new Error('Gravação da lista de pendência sem obra.');
  for (const table of DELETE_ORDER) {
    for (const batch of chunks(mutation.delete[table], IN_CHUNK)) {
      const { error } = await client.from(TABLE_NAMES[table]).delete().in('id', batch).eq('work_id', workId);
      check(error, `apagar de ${TABLE_NAMES[table]}`);
    }
  }
  for (const table of INSERT_ORDER) {
    const records = mutation.insert[table] as AnyRecord[];
    if (!records.length) continue;
    if (records.some(r => (r as { workId?: string }).workId !== workId)) throw new Error(`Gravação em ${TABLE_NAMES[table]} fora da obra.`);
    const { error } = await client.from(TABLE_NAMES[table]).insert(records.map(r => toRow(table, r)));
    check(error, `gravar em ${TABLE_NAMES[table]}`);
  }
  for (const table of INSERT_ORDER) {
    const records = mutation.update[table] as AnyRecord[];
    if (!records.length) continue;
    // Atualiza por id e obra, nunca upsert: um registro apagado por outra pessoa não pode renascer.
    const results = await Promise.all(
      records.map(record => {
        const row = toRow(table, record);
        delete row.id;
        delete row.work_id;
        delete row.created_at;
        return client.from(TABLE_NAMES[table]).update(row).eq('id', record.id).eq('work_id', workId).select('id');
      }),
    );
    for (const { data, error } of results) {
      check(error, `atualizar ${TABLE_NAMES[table]}`);
      if (!data?.length) throw new PendingConflictError();
    }
  }
}

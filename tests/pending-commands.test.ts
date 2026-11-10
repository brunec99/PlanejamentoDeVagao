import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePendingCommand,
  pendingCommandTarget,
  planPendingCommand,
  resolvePendingSources,
  type PendingContext,
  type PendingMutation,
  type PendingSourceRows,
  type PendingSourceTask,
} from '../src/application/use-cases/pending-commands';
import { PENDING_LIMITS, type PendingCard, type PendingCommand, type PendingData } from '../src/domain/pending-board';
import { pendingCardLink, pendingEmail } from '../src/infrastructure/email/takt-outbox';

const WORK = 'obra-1';
const ANA = 'u-ana';
const RAFA = 'u-rafa';
const BIA = 'u-bia';
const NOW = '2026-11-10T12:00:00.000Z';
const people = [
  { id: ANA, name: 'Ana Lima' },
  { id: BIA, name: 'Bia Souza' },
  { id: RAFA, name: 'Rafael Costa' },
];

// Um contador só para o arquivo: ids de contextos diferentes nunca se repetem.
let n = 0;
function context(over: Partial<PendingContext> = {}): PendingContext {
  return { actorId: ANA, now: NOW, today: '2026-11-10', newId: () => `new-${++n}`, admin: false, people, ...over };
}
const card = (id: string, over: Partial<PendingCard> = {}): PendingCard => ({
  id,
  workId: WORK,
  title: `Card ${id}`,
  status: 'todo',
  origin: 'manual',
  dueDate: '2026-11-20',
  leadTimeDays: 2,
  responsibleId: ANA,
  orderIndex: 1,
  createdBy: ANA,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  ...over,
});
const data = (over: Partial<PendingData> = {}): PendingData => ({ cards: [], checklists: [], items: [], messages: [], ...over });
const create = (over: Partial<Extract<PendingCommand, { type: 'create_card' }>> = {}): PendingCommand => ({
  type: 'create_card',
  workId: WORK,
  title: '  Comprar   esquadrias ',
  origin: 'manual',
  dueDate: '2026-11-27',
  leadTimeDays: 5,
  responsibleId: RAFA,
  ...over,
});
const refuses = (run: () => unknown, message: RegExp) => assert.throws(run, { message });
const touched = (m: PendingMutation) => [
  ...Object.values(m.insert).flat(),
  ...Object.values(m.update).flat(),
  ...Object.values(m.delete).flat(),
];

test('parse e alvo: tipo conhecido, obra no create e registro nos demais', () => {
  refuses(() => parsePendingCommand(null), /Comando inválido/);
  refuses(() => parsePendingCommand([]), /Comando inválido/);
  refuses(() => parsePendingCommand({ type: 'drop_table' }), /Comando desconhecido/);
  assert.deepEqual(pendingCommandTarget(create()), { workId: WORK });
  assert.deepEqual(pendingCommandTarget({ type: 'move_card', cardId: 'c1', status: 'doing' }), { table: 'cards', id: 'c1' });
  assert.deepEqual(pendingCommandTarget({ type: 'add_item', checklistId: 'k1', text: 'x' }), { table: 'checklists', id: 'k1' });
  assert.deepEqual(pendingCommandTarget({ type: 'update_item', itemId: 'i1', done: true }), { table: 'items', id: 'i1' });
  refuses(() => pendingCommandTarget({ type: 'delete_card', cardId: '' }), /Card não informado/);
});

test('create_card manual: entra no fim de A fazer, registra a criação e avisa o responsável', () => {
  const current = data({ cards: [card('a', { orderIndex: 4 }), card('b', { status: 'doing', orderIndex: 9 })] });
  const m = planPendingCommand(current, create({ description: ' linha 1\nlinha 2 ' }), context());
  const [created] = m.insert.cards;
  assert.equal(m.workId, WORK);
  assert.equal(created.title, 'Comprar esquadrias');
  assert.equal(created.description, 'linha 1\nlinha 2');
  assert.equal(created.status, 'todo');
  assert.equal(created.orderIndex, 5);
  assert.equal(created.dueDate, '2026-11-27');
  assert.equal(created.createdBy, ANA);
  assert.equal(created.sourceId, undefined);
  assert.deepEqual(
    m.insert.messages.map(x => [x.kind, x.authorId, x.body, x.cardId]),
    [['system', ANA, 'criou a pendência', created.id]],
  );
  assert.deepEqual(
    m.notifications.map(n => [n.reason, n.userId, n.userName, n.authorName, n.responsibleName, n.dueDate, n.status]),
    [['atribuicao', RAFA, 'Rafael Costa', 'Ana Lima', 'Rafael Costa', '2026-11-27', 'todo']],
  );
  // Quem atribui a si mesmo não recebe e-mail.
  assert.deepEqual(planPendingCommand(current, create({ responsibleId: ANA }), context()).notifications, []);
});

test('create_card valida título, data, tempo de execução, responsável e origem', () => {
  const run = (over: Parameters<typeof create>[0]) => () => planPendingCommand(data(), create(over), context());
  refuses(run({ title: '   ' }), /Informe o título/);
  refuses(run({ title: 'x'.repeat(PENDING_LIMITS.title + 1) }), /passa de 160/);
  refuses(run({ description: 'x'.repeat(PENDING_LIMITS.description + 1) }), /passa de 4000/);
  refuses(run({ dueDate: '2026-02-30' }), /Data de entrega inválida/);
  refuses(run({ dueDate: '27/11/2026' }), /Data de entrega inválida/);
  for (const leadTimeDays of [-1, 1.5, 1000, '3' as unknown as number]) refuses(run({ leadTimeDays }), /0 a 999/);
  refuses(run({ responsibleId: 'u-de-fora' }), /acesso a esta obra/);
  refuses(run({ responsibleId: '' }), /Informe o responsável/);
  refuses(run({ origin: 'restricao' as 'manual' }), /Origem do card inválida/);
});

test('create_card ligado ao médio ou ao longo prazo: a entrega sai do início da origem, nunca do que foi digitado', () => {
  const linked = create({ origin: 'medio_prazo', sourceId: 't-1', dueDate: '2030-01-01' });
  // Início numa segunda: a entrega é a sexta anterior.
  const m = planPendingCommand(data(), linked, context({ source: { start: '2026-11-16', label: 'Alvenaria 3º pav.' } }));
  const [created] = m.insert.cards;
  assert.equal(created.dueDate, '2026-11-13');
  assert.equal(created.sourceId, 't-1');
  assert.equal(created.sourceLabel, 'Alvenaria 3º pav.');
  assert.equal(created.sourceStart, '2026-11-16');
  // Origem inexistente ou de outra obra: a rota não acha e o planejador recusa.
  refuses(() => planPendingCommand(data(), linked, context()), /tarefa do médio prazo não foi encontrada/);
  refuses(
    () => planPendingCommand(data(), create({ origin: 'longo_prazo', sourceId: 's-1' }), context()),
    /serviço da Linha de Balanço não foi encontrado/,
  );
  refuses(() => planPendingCommand(data(), create({ origin: 'longo_prazo' }), context()), /Informe o serviço/);
});

test('update_card: histórico da data e do responsável, e-mail só para o novo responsável que não é quem mudou', () => {
  const current = data({ cards: [card('a')] });
  const m = planPendingCommand(
    current,
    {
      type: 'update_card',
      cardId: 'a',
      title: 'Novo título',
      dueDate: '2026-11-27',
      responsibleId: RAFA,
      leadTimeDays: 0,
      description: '',
    },
    context(),
  );
  const [next] = m.update.cards;
  assert.deepEqual(
    [next.title, next.dueDate, next.responsibleId, next.leadTimeDays, next.updatedAt],
    ['Novo título', '2026-11-27', RAFA, 0, NOW],
  );
  assert.deepEqual(
    m.insert.messages.map(x => x.body),
    ['mudou a entrega de 20/11/2026 para 27/11/2026', 'passou a responsabilidade de Ana Lima para Rafael Costa'],
  );
  assert.ok(m.insert.messages.every(x => x.kind === 'system' && x.authorId === ANA));
  assert.deepEqual(
    m.notifications.map(n => [n.reason, n.userId, n.dueDate, n.cardTitle]),
    [['atribuicao', RAFA, '2026-11-27', 'Novo título']],
  );
  // Título e tempo de execução não geram histórico; pegar para si não gera e-mail.
  const own = planPendingCommand(
    data({ cards: [card('a', { responsibleId: RAFA })] }),
    { type: 'update_card', cardId: 'a', responsibleId: ANA },
    context(),
  );
  assert.equal(own.insert.messages.length, 1);
  assert.deepEqual(own.notifications, []);
  const quiet = planPendingCommand(current, { type: 'update_card', cardId: 'a', title: 'Outro', leadTimeDays: 7 }, context());
  assert.deepEqual(quiet.insert.messages, []);
  // Nada mudou: nada a gravar.
  assert.deepEqual(
    touched(planPendingCommand(current, { type: 'update_card', cardId: 'a', dueDate: '2026-11-20', responsibleId: ANA }, context())),
    [],
  );
  refuses(() => planPendingCommand(current, { type: 'update_card', cardId: 'x', title: 'a' }, context()), /Card não encontrado/);
  refuses(
    () => planPendingCommand(current, { type: 'update_card', cardId: 'a', responsibleId: 'u-de-fora' }, context()),
    /acesso a esta obra/,
  );
  refuses(() => planPendingCommand(current, { type: 'update_card', cardId: 'a', dueDate: '2026-13-01' }, context()), /inválida/);
});

test('update_card recusa data digitada em card ligado a tarefa ou serviço; restrição aceita', () => {
  for (const origin of ['medio_prazo', 'longo_prazo'] as const) {
    const current = data({ cards: [card('a', { origin, sourceId: 's' })] });
    refuses(
      () => planPendingCommand(current, { type: 'update_card', cardId: 'a', dueDate: '2026-12-01' }, context()),
      /não pode ser digitada/,
    );
    // A mesma data que a tela já mostra não é uma tentativa de editar; o resto do card segue editável.
    const m = planPendingCommand(current, { type: 'update_card', cardId: 'a', dueDate: '2026-11-20', title: 'Outro' }, context());
    assert.equal(m.update.cards[0].title, 'Outro');
  }
  const restriction = data({ cards: [card('restricao-1', { origin: 'restricao', responsibleId: 'u-antigo' })] });
  const m = planPendingCommand(
    restriction,
    { type: 'update_card', cardId: 'restricao-1', dueDate: '2026-12-01', responsibleId: BIA },
    context(),
  );
  assert.equal(m.update.cards[0].dueDate, '2026-12-01');
  // Responsável antigo sem acesso à obra: o histórico não inventa nome.
  assert.equal(m.insert.messages[1].body, 'passou a responsabilidade de outra pessoa para Bia Souza');
});

test('move_card: motivo ao pausar e cancelar, closedAt ao fechar, histórico de cada mudança', () => {
  const current = data({ cards: [card('a')] });
  refuses(() => planPendingCommand(current, { type: 'move_card', cardId: 'a', status: 'paused' }, context()), /motivo da pausa/);
  refuses(
    () => planPendingCommand(current, { type: 'move_card', cardId: 'a', status: 'cancelled', reason: '  ' }, context()),
    /motivo do cancelamento/,
  );
  refuses(
    () =>
      planPendingCommand(
        current,
        { type: 'move_card', cardId: 'a', status: 'paused', reason: 'x'.repeat(PENDING_LIMITS.reason + 1) },
        context(),
      ),
    /passa de 500/,
  );
  refuses(
    () => planPendingCommand(current, { type: 'move_card', cardId: 'a', status: 'arquivado' as 'done' }, context()),
    /Coluna inválida/,
  );

  const doing = planPendingCommand(current, { type: 'move_card', cardId: 'a', status: 'doing' }, context());
  assert.deepEqual(
    [doing.update.cards[0].status, doing.update.cards[0].orderIndex, doing.update.cards[0].closedAt],
    ['doing', 1, undefined],
  );
  assert.deepEqual(
    doing.insert.messages.map(x => x.body),
    ['moveu de A fazer para Fazendo'],
  );
  assert.deepEqual(doing.notifications, []);

  const paused = planPendingCommand(
    current,
    { type: 'move_card', cardId: 'a', status: 'paused', reason: ' aguardando projeto ' },
    context(),
  );
  assert.equal(paused.update.cards[0].statusReason, 'aguardando projeto');
  assert.equal(paused.update.cards[0].closedAt, undefined);
  assert.deepEqual(
    paused.insert.messages.map(x => x.body),
    ['pausou: aguardando projeto'],
  );

  const cancelled = planPendingCommand(
    current,
    { type: 'move_card', cardId: 'a', status: 'cancelled', reason: 'escopo retirado' },
    context(),
  );
  assert.deepEqual([cancelled.update.cards[0].statusReason, cancelled.update.cards[0].closedAt], ['escopo retirado', NOW]);
  assert.deepEqual(
    cancelled.insert.messages.map(x => x.body),
    ['cancelou: escopo retirado'],
  );

  const done = planPendingCommand(current, { type: 'move_card', cardId: 'a', status: 'done' }, context());
  assert.equal(done.update.cards[0].closedAt, NOW);
  assert.deepEqual(
    done.insert.messages.map(x => x.body),
    ['moveu de A fazer para Concluído'],
  );

  // Sair de Pausado limpa o motivo; reabrir limpa o closedAt.
  const wasPaused = data({ cards: [card('a', { status: 'paused', statusReason: 'chuva' })] });
  const back = planPendingCommand(wasPaused, { type: 'move_card', cardId: 'a', status: 'doing' }, context());
  assert.equal('statusReason' in back.update.cards[0], false);
  const wasDone = data({ cards: [card('a', { status: 'done', closedAt: '2026-11-05T10:00:00.000Z' })] });
  const reopened = planPendingCommand(wasDone, { type: 'move_card', cardId: 'a', status: 'todo' }, context());
  assert.equal('closedAt' in reopened.update.cards[0], false);
  assert.deepEqual(
    reopened.insert.messages.map(x => x.body),
    ['moveu de Concluído para A fazer'],
  );
});

test('move_card: posição na coluna de destino, renumerando só o necessário', () => {
  const column = [card('a', { orderIndex: 1 }), card('b', { orderIndex: 2 }), card('c', { orderIndex: 3 }), card('d', { orderIndex: 10 })];
  const moved = card('m', { status: 'doing', orderIndex: 1 });
  const current = data({ cards: [...column, moved] });
  const order = (m: PendingMutation) => {
    const next = new Map(m.update.cards.map(c => [c.id, c]));
    return current.cards
      .map(c => next.get(c.id) ?? c)
      .filter(c => c.status === 'todo')
      .sort((x, y) => x.orderIndex - y.orderIndex)
      .map(c => c.id);
  };
  const ids = (m: PendingMutation) => m.update.cards.map(c => c.id);
  const move = (over: Partial<Extract<PendingCommand, { type: 'move_card' }>>, id = 'm') =>
    planPendingCommand(current, { type: 'move_card', cardId: id, status: 'todo', ...over }, context());

  // Sem `beforeCardId`: fim da coluna, só o card muda.
  const end = move({});
  assert.deepEqual(order(end), ['a', 'b', 'c', 'd', 'm']);
  assert.deepEqual(ids(end), ['m']);
  // Antes do primeiro: número abaixo dele, ninguém mais muda.
  const top = move({ beforeCardId: 'a' });
  assert.deepEqual(order(top), ['m', 'a', 'b', 'c', 'd']);
  assert.deepEqual(ids(top), ['m']);
  // No meio de números colados: empurra só até achar folga (o `d`, em 10, fica como está).
  const middle = move({ beforeCardId: 'b' });
  assert.deepEqual(order(middle), ['a', 'm', 'b', 'c', 'd']);
  assert.deepEqual(ids(middle), ['m', 'b', 'c']);
  assert.equal(middle.update.cards.find(c => c.id === 'b')!.updatedAt, column[1].updatedAt);
  // Com folga entre os vizinhos, só o card muda.
  const gap = move({ beforeCardId: 'd' });
  assert.deepEqual(order(gap), ['a', 'b', 'c', 'm', 'd']);
  assert.deepEqual(ids(gap), ['m']);
  // `beforeCardId` que já saiu da coluna: vai para o fim em vez de recusar.
  assert.deepEqual(order(move({ beforeCardId: 'sumiu' })), ['a', 'b', 'c', 'd', 'm']);

  // Reordenar dentro da coluna: sem histórico, e parado no lugar não grava nada.
  const within = move({ beforeCardId: 'a' }, 'c');
  assert.deepEqual(
    order(within),
    ['c', 'a', 'b', 'd', 'm'].filter(id => id !== 'm'),
  );
  assert.deepEqual(within.insert.messages, []);
  assert.deepEqual(touched(move({ beforeCardId: 'c' }, 'b')), []);
  assert.deepEqual(touched(move({}, 'd')), []);
  assert.deepEqual(touched(move({ beforeCardId: 'b' }, 'a')), []);
  assert.deepEqual(order(move({}, 'a')), ['b', 'c', 'd', 'a']);
  // Pausado que só muda de posição mantém o motivo e não pede outro.
  const paused = data({
    cards: [
      card('p1', { status: 'paused', statusReason: 'chuva', orderIndex: 1 }),
      card('p2', { status: 'paused', statusReason: 'falta material', orderIndex: 2 }),
    ],
  });
  const swap = planPendingCommand(paused, { type: 'move_card', cardId: 'p2', status: 'paused', beforeCardId: 'p1' }, context());
  assert.deepEqual(
    [swap.update.cards[0].id, swap.update.cards[0].statusReason, swap.update.cards[0].orderIndex],
    ['p2', 'falta material', 0],
  );
});

test('delete_card: só quem criou ou admin; leva checklists, itens e mensagens', () => {
  const current = data({
    cards: [card('a', { createdBy: RAFA }), card('b')],
    checklists: [{ id: 'k1', cardId: 'a', workId: WORK, title: 'Lista', orderIndex: 1, createdAt: NOW }],
    items: [
      { id: 'i1', checklistId: 'k1', cardId: 'a', workId: WORK, text: 'x', done: false, orderIndex: 1, createdAt: NOW },
      { id: 'i2', checklistId: 'k9', cardId: 'b', workId: WORK, text: 'y', done: false, orderIndex: 1, createdAt: NOW },
    ],
    messages: [
      { id: 'm1', cardId: 'a', workId: WORK, kind: 'system', authorId: RAFA, body: 'criou a pendência', mentions: [], createdAt: NOW },
    ],
  });
  refuses(() => planPendingCommand(current, { type: 'delete_card', cardId: 'a' }, context()), /Só quem criou o card ou um administrador/);
  for (const ctx of [context({ actorId: RAFA }), context({ admin: true })]) {
    const m = planPendingCommand(current, { type: 'delete_card', cardId: 'a' }, ctx);
    assert.deepEqual(m.delete, { cards: ['a'], checklists: ['k1'], items: ['i1'], messages: ['m1'] });
  }
});

test('add_message: texto obrigatório, menções só de quem tem a obra, sem repetir e sem o autor', () => {
  const current = data({ cards: [card('a', { responsibleId: BIA })] });
  const say = (body: string, mentions: string[]) =>
    planPendingCommand(current, { type: 'add_message', cardId: 'a', body, mentions }, context());
  refuses(() => say('   ', []), /Escreva a mensagem/);
  refuses(() => say('x'.repeat(PENDING_LIMITS.message + 1), []), /passa de 4000/);
  refuses(() => say('oi', ['u-de-fora']), /acesso a esta obra/);
  refuses(
    () =>
      planPendingCommand(current, { type: 'add_message', cardId: 'a', body: 'oi', mentions: 'u-rafa' as unknown as string[] }, context()),
    /inválida/,
  );

  const m = say('  @Rafael Costa veja isto\ncom a @Bia Souza ', [RAFA, ANA, RAFA, BIA]);
  const [message] = m.insert.messages;
  assert.equal(message.kind, 'message');
  assert.equal(message.body, '@Rafael Costa veja isto\ncom a @Bia Souza');
  assert.deepEqual(message.mentions, [RAFA, BIA]);
  assert.deepEqual(
    m.notifications.map(n => [n.reason, n.userId, n.messageId, n.text, n.responsibleName]),
    [
      ['mencao', RAFA, message.id, message.body, 'Bia Souza'],
      ['mencao', BIA, message.id, message.body, 'Bia Souza'],
    ],
  );
  assert.deepEqual(say('sem marcar ninguém', []).notifications, []);
});

test('checklists: várias por card, itens com quem marcou e quando', () => {
  let current = data({ cards: [card('a')] });
  const apply = (command: PendingCommand, ctx = context()) => {
    const m = planPendingCommand(current, command, ctx);
    const merge = <T extends { id: string }>(list: T[], table: 'checklists' | 'items') => [
      ...list.filter(r => !m.delete[table].includes(r.id)).map(r => (m.update[table] as unknown as T[]).find(u => u.id === r.id) ?? r),
      ...(m.insert[table] as unknown as T[]),
    ];
    current = { ...current, checklists: merge(current.checklists, 'checklists'), items: merge(current.items, 'items') };
    return m;
  };
  refuses(() => apply({ type: 'create_checklist', cardId: 'a', title: ' ' }), /Informe o título da checklist/);
  refuses(() => apply({ type: 'create_checklist', cardId: 'a', title: 'x'.repeat(121) }), /passa de 120/);
  const first = apply({ type: 'create_checklist', cardId: 'a', title: 'Documentos' }).insert.checklists[0];
  const second = apply({ type: 'create_checklist', cardId: 'a', title: 'Compras' }).insert.checklists[0];
  assert.deepEqual([first.orderIndex, second.orderIndex, second.cardId, second.workId], [1, 2, 'a', WORK]);
  apply({ type: 'rename_checklist', checklistId: first.id, title: 'Projetos' });
  assert.equal(current.checklists[0].title, 'Projetos');

  refuses(() => apply({ type: 'add_item', checklistId: first.id, text: 'x'.repeat(301) }), /passa de 300/);
  const one = apply({ type: 'add_item', checklistId: first.id, text: 'ART' }).insert.items[0];
  const two = apply({ type: 'add_item', checklistId: first.id, text: 'Alvará' }).insert.items[0];
  assert.deepEqual([one.done, one.orderIndex, two.orderIndex, two.cardId], [false, 1, 2, 'a']);

  const ticked = apply({ type: 'update_item', itemId: one.id, done: true }, context({ actorId: RAFA })).update.items[0];
  assert.deepEqual([ticked.done, ticked.doneBy, ticked.doneAt], [true, RAFA, NOW]);
  // Marcar de novo o que já está marcado não troca quem marcou; renomear também não.
  assert.deepEqual(touched(planPendingCommand(current, { type: 'update_item', itemId: one.id, done: true }, context())), []);
  const renamed = apply({ type: 'update_item', itemId: one.id, text: 'ART de execução' }).update.items[0];
  assert.deepEqual([renamed.text, renamed.doneBy], ['ART de execução', RAFA]);
  const cleared = apply({ type: 'update_item', itemId: one.id, done: false }).update.items[0];
  assert.deepEqual([cleared.done, 'doneBy' in cleared, 'doneAt' in cleared], [false, false, false]);

  assert.deepEqual(apply({ type: 'delete_item', itemId: two.id }).delete.items, [two.id]);
  const gone = apply({ type: 'delete_checklist', checklistId: first.id });
  assert.deepEqual([gone.delete.checklists, gone.delete.items], [[first.id], [one.id]]);
  refuses(() => apply({ type: 'add_item', checklistId: first.id, text: 'x' }), /Checklist não encontrada/);
  refuses(() => apply({ type: 'delete_item', itemId: one.id }), /Item não encontrado/);
  // Concluir com itens abertos é permitido (a tela é que confirma).
  apply({ type: 'add_item', checklistId: second.id, text: 'Cotar' });
  assert.equal(planPendingCommand(current, { type: 'move_card', cardId: 'a', status: 'done' }, context()).update.cards[0].status, 'done');
});

// ─── Data viva (regras 4 e 5) ───────────────────────────────────────────────────────────────────

const plan = (id: string, month: string, over: Partial<PendingSourceRows['plans'][number]> = {}) => ({
  id,
  month,
  baseline: false,
  legalization: false,
  ...over,
});
const task = (
  id: string,
  planId: string,
  name: string,
  plannedStart: string,
  order: number,
  level = 0,
  sourceTaskId?: string,
): PendingSourceTask => ({
  id,
  planId,
  name,
  plannedStart,
  order,
  level,
  ...(sourceTaskId ? { sourceTaskId } : {}),
});
const sources = (over: Partial<PendingSourceRows>): PendingSourceRows => ({
  plans: [],
  tasks: [],
  services: [],
  serviceStarts: [],
  ...over,
});
const linkedCard = (sourceId: string, over: Partial<PendingCard> = {}) =>
  card('a', { origin: 'medio_prazo', sourceId, sourceLabel: 'Nome antigo', dueDate: '2026-10-01', ...over });

test('data viva: a tarefa do próprio plano dá a véspera útil do início e o nome atual', () => {
  const rows = sources({ plans: [plan('p11', '2026-11')], tasks: [task('t1', 'p11', 'Alvenaria', '2026-11-16', 1)] });
  const [resolved] = resolvePendingSources([linkedCard('t1')], rows);
  assert.deepEqual(
    [resolved.dueDate, resolved.sourceStart, resolved.sourceLabel, resolved.sourceMissing],
    ['2026-11-13', '2026-11-16', 'Alvenaria', undefined],
  );
  // Card manual e de restrição passam intactos.
  const manual = card('m');
  assert.equal(resolvePendingSources([manual], rows)[0], manual);
});

test('data viva: segue o elo sourceTaskId até o mês mais recente e ignora a linha de base', () => {
  const rows = sources({
    plans: [plan('p10', '2026-10'), plan('p11', '2026-11'), plan('p12', '2026-12'), plan('base', '2026-12', { baseline: true })],
    tasks: [
      task('t10', 'p10', 'Alvenaria', '2026-11-16', 1),
      task('t11', 'p11', 'Alvenaria', '2026-11-23', 1, 0, 't10'),
      task('t12', 'p12', 'Alvenaria 3º pav.', '2026-12-07', 4, 0, 't11'),
      // A linha de base também aponta para a tarefa viva, mas é retrato congelado.
      task('tb', 'base', 'Alvenaria (base)', '2026-11-02', 1, 0, 't12'),
    ],
  });
  const [resolved] = resolvePendingSources([linkedCard('t10')], rows);
  assert.deepEqual([resolved.dueDate, resolved.sourceStart, resolved.sourceLabel], ['2026-12-04', '2026-12-07', 'Alvenaria 3º pav.']);
  // Card criado no mês do meio segue só para a frente.
  assert.equal(resolvePendingSources([linkedCard('t11')], rows)[0].sourceStart, '2026-12-07');
  // Card apontando para a tarefa da linha de base: não é tarefa viva.
  assert.equal(resolvePendingSources([linkedCard('tb')], rows)[0].sourceMissing, true);
});

test('data viva: mês seguinte sem elo (cópia de hoje, plano importado) casa pelo caminho de nomes na mesma ocorrência', () => {
  const october = [
    task('o1', 'p10', 'Torre A', '2026-10-01', 1, 0),
    task('o2', 'p10', 'Alvenaria', '2026-10-05', 2, 1),
    task('o3', 'p10', 'Torre B', '2026-10-01', 3, 0),
    task('o4', 'p10', 'Alvenaria', '2026-10-19', 4, 1),
    task('o5', 'p10', 'Pintura', '2026-10-26', 5, 1),
  ];
  const november = [
    task('n1', 'p11', 'Torre A', '2026-11-02', 1, 0),
    task('n2', 'p11', ' alvenaria ', '2026-11-09', 2, 1),
    task('n3', 'p11', 'Torre B', '2026-11-02', 3, 0),
    task('n4', 'p11', 'ALVENARIA', '2026-11-23', 4, 1),
  ];
  const rows = sources({ plans: [plan('p11', '2026-11'), plan('p10', '2026-10')], tasks: [...october, ...november] });
  // Mesmo nome em duas torres: o caminho (resumo acima) separa.
  assert.equal(resolvePendingSources([linkedCard('o2')], rows)[0].sourceStart, '2026-11-09');
  assert.equal(resolvePendingSources([linkedCard('o4')], rows)[0].sourceStart, '2026-11-23');
  // Tarefa que não passou para o mês seguinte (terminou): vale a última achada, não vira "ausente".
  const kept = resolvePendingSources([linkedCard('o5')], rows)[0];
  assert.deepEqual([kept.sourceStart, kept.sourceMissing], ['2026-10-26', undefined]);

  // Quantidade diferente de linhas com o mesmo caminho: ambíguo, não arrisca; fica na última achada.
  const doubled = sources({
    plans: rows.plans,
    tasks: [...october, ...november, task('n5', 'p11', 'Alvenaria', '2026-11-30', 5, 1)],
  });
  assert.equal(resolvePendingSources([linkedCard('o4')], doubled)[0].sourceStart, '2026-10-19');

  // Mês seguinte que É cópia com elo: quem não tem cópia foi descartado de propósito; nome igual não conta.
  const linked = sources({
    plans: rows.plans,
    tasks: [
      task('o2', 'p10', 'Alvenaria', '2026-10-05', 1),
      task('o5', 'p10', 'Pintura', '2026-10-26', 2),
      task('n9', 'p11', 'Pintura', '2026-11-16', 1),
      task('n2', 'p11', 'Alvenaria', '2026-11-09', 2, 0, 'o2'),
    ],
  });
  assert.equal(resolvePendingSources([linkedCard('o5')], linked)[0].sourceStart, '2026-10-26');
});

test('data viva: resumo usa o menor início das folhas abaixo; o Gantt de legalização não entra na sucessão', () => {
  const rows = sources({
    plans: [plan('p11', '2026-11'), plan('leg', '2026-12', { legalization: true })],
    tasks: [
      task('s', 'p11', 'Fachada', '2026-01-01', 1, 0),
      task('s1', 'p11', 'Reboco', '2026-11-24', 2, 1),
      task('s2', 'p11', 'Pintura', '2026-11-18', 3, 1),
      task('x', 'p11', 'Outra', '2026-11-03', 4, 0),
      task('l1', 'leg', 'Fachada', '2026-12-10', 1, 0),
    ],
  });
  const [resolved] = resolvePendingSources([linkedCard('s')], rows);
  assert.deepEqual([resolved.sourceStart, resolved.dueDate], ['2026-11-18', '2026-11-17']);
  // Card criado de uma linha do Gantt de legalização acompanha a própria linha.
  assert.equal(resolvePendingSources([linkedCard('l1')], rows)[0].sourceStart, '2026-12-10');
});

test('data viva: origem que sumiu marca sourceMissing e mantém a data gravada', () => {
  const [gone] = resolvePendingSources(
    [linkedCard('t-apagada', { sourceStart: '2026-10-02' })],
    sources({ plans: [plan('p11', '2026-11')] }),
  );
  assert.deepEqual([gone.sourceMissing, gone.dueDate, gone.sourceLabel, gone.sourceStart], [true, '2026-10-01', 'Nome antigo', undefined]);
});

test('data viva do longo prazo: menor início do serviço na obra e o nome atual', () => {
  const lob = (sourceId: string) => card('a', { origin: 'longo_prazo', sourceId, sourceLabel: 'Antigo', dueDate: '2026-10-01' });
  const rows = sources({
    services: [
      { id: 's1', name: 'Contrapiso' },
      { id: 's2', name: 'Sem bloco' },
    ],
    serviceStarts: [
      { serviceId: 's1', start: '2026-12-14' },
      { serviceId: 's1', start: '2026-12-01' },
      { serviceId: 's1', start: '2026-12-21' },
    ],
  });
  const [resolved] = resolvePendingSources([lob('s1')], rows);
  assert.deepEqual([resolved.dueDate, resolved.sourceStart, resolved.sourceLabel], ['2026-11-30', '2026-12-01', 'Contrapiso']);
  // Serviço sem bloco lançado não tem início; serviço apagado também.
  for (const id of ['s2', 's-apagado']) {
    const [missing] = resolvePendingSources([lob(id)], rows);
    assert.deepEqual([missing.sourceMissing, missing.dueDate], [true, '2026-10-01']);
  }
});

// ─── E-mail ─────────────────────────────────────────────────────────────────────────────────────

test('e-mail de menção: assunto, chave, payload do contrato e texto cortado em 1200', () => {
  const current = data({ cards: [card('c-1', { title: 'Liberar\r\nfachada', responsibleId: BIA, status: 'doing' })] });
  const body = 'a'.repeat(1500);
  const m = planPendingCommand(current, { type: 'add_message', cardId: 'c-1', body, mentions: [RAFA] }, context());
  const email = pendingEmail(m.notifications[0], { workId: 'obra 1/á', workName: 'Atmos', origin: 'https://obra360.exemplo', now: NOW });
  assert.equal(email.toUserId, RAFA);
  assert.equal(email.subject, 'Ana Lima marcou você em "Liberar fachada" (Atmos)');
  assert.equal(email.idempotencyKey, `obra360.pendencia:mencao:${m.insert.messages[0].id}:${RAFA}`);
  assert.deepEqual(email.payload, {
    motivo: 'mencao',
    autorNome: 'Ana Lima',
    primeiroNome: 'Rafael',
    obra: 'Atmos',
    // Só o assunto perde as quebras; o título novo já entra sem elas (o planejador as tira).
    cardTitulo: 'Liberar\r\nfachada',
    texto: 'a'.repeat(1200),
    truncado: true,
    entrega: '2026-11-20',
    status: 'Fazendo',
    responsavelNome: 'Bia Souza',
    link: 'https://obra360.exemplo/obras/obra%201%2F%C3%A1/vagoes?visao=pendencias&card=c-1',
  });
  // O pior caso (título, nomes e texto no limite, com acentos) fica bem abaixo dos 4096 bytes.
  const worst = pendingEmail(
    {
      ...m.notifications[0],
      cardTitle: 'ç'.repeat(160),
      text: 'ã'.repeat(4000),
      authorName: 'é'.repeat(80),
      responsibleName: 'é'.repeat(80),
      userName: 'é'.repeat(80),
    },
    { workId: WORK, workName: 'ó'.repeat(80), origin: 'https://obra360.exemplo', now: NOW },
  );
  assert.ok(Buffer.byteLength(JSON.stringify(worst.payload)) < 4096);
  assert.ok(worst.subject.length <= 200);
});

test('e-mail de atribuição: sem texto, chave com o instante, mensagem curta sem "truncado"', () => {
  const m = planPendingCommand(data(), create(), context());
  const email = pendingEmail(m.notifications[0], { workId: WORK, workName: 'Tauá', origin: 'http://localhost:3000', now: NOW });
  assert.equal(email.subject, 'Ana Lima atribuiu a você "Comprar esquadrias" (Tauá)');
  assert.equal(email.idempotencyKey, `obra360.pendencia:atribuicao:${m.insert.cards[0].id}:${RAFA}:${NOW}`);
  assert.deepEqual(email.payload, {
    motivo: 'atribuicao',
    autorNome: 'Ana Lima',
    primeiroNome: 'Rafael',
    obra: 'Tauá',
    cardTitulo: 'Comprar esquadrias',
    entrega: '2026-11-27',
    status: 'A fazer',
    responsavelNome: 'Rafael Costa',
    link: pendingCardLink('http://localhost:3000', WORK, m.insert.cards[0].id),
  });
  const short = planPendingCommand(
    data({ cards: [card('a')] }),
    { type: 'add_message', cardId: 'a', body: 'veja', mentions: [BIA] },
    context(),
  );
  const payload = pendingEmail(short.notifications[0], { workId: WORK, workName: 'Tauá', origin: 'http://x', now: NOW }).payload;
  assert.deepEqual([payload.texto, 'truncado' in payload], ['veja', false]);
});

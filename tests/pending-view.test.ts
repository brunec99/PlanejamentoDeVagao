import test from 'node:test';
import assert from 'node:assert/strict';
import type { PendingCard, PendingChecklistItem, PendingMessage, PendingPerson } from '../src/domain/pending-board';
import {
  NO_FILTERS,
  applyItemDone,
  applyMove,
  applyMention,
  canDeleteCard,
  cardsByStatus,
  dayMonth,
  dueDateEditable,
  dueLabel,
  extractMentions,
  filterCards,
  hasFilters,
  initials,
  isSamePlace,
  matchPeople,
  mentionQuery,
  messageCount,
  messagesOf,
  openItemCount,
  originLabel,
  personName,
  progressPercent,
  signalChip,
  splitMentions,
  stampDay,
  stampLabel,
  summarizeSignals,
} from '../src/modules/pendencias/pending-view';

/** Terça-feira. */
const TODAY = '2026-11-10';

const card = (id: string, patch: Partial<PendingCard> = {}): PendingCard => ({
  id,
  workId: 'w1',
  title: `Card ${id}`,
  status: 'todo',
  origin: 'manual',
  dueDate: '2026-12-04',
  leadTimeDays: 10,
  responsibleId: 'ana',
  orderIndex: 0,
  createdBy: 'ana',
  createdAt: '2026-11-01T12:00:00.000Z',
  updatedAt: '2026-11-01T12:00:00.000Z',
  ...patch,
});
const item = (id: string, cardId: string, done: boolean): PendingChecklistItem => ({
  id,
  checklistId: 'k1',
  cardId,
  workId: 'w1',
  text: id,
  done,
  orderIndex: 0,
  createdAt: '2026-11-01T12:00:00.000Z',
});
const message = (id: string, cardId: string, kind: PendingMessage['kind'], createdAt: string): PendingMessage => ({
  id,
  cardId,
  workId: 'w1',
  kind,
  authorId: 'ana',
  body: id,
  mentions: [],
  createdAt,
});
const PEOPLE: PendingPerson[] = [
  { id: 'ana', name: 'Ana Lima' },
  { id: 'ana2', name: 'Ana Lima Souza' },
  { id: 'joao', name: 'João Pereira' },
  { id: 'marina', name: 'Marina Souza' },
  { id: 'marcos', name: 'Marcos Andrade' },
];

test('datas: dia/mês e carimbo no fuso de São Paulo', () => {
  assert.equal(dayMonth('2026-12-04'), '04/12');
  // 01:30 UTC do dia 5 ainda é dia 4, 22:30, em São Paulo.
  assert.equal(stampLabel('2026-11-05T01:30:00.000Z'), '04/11 22:30');
  assert.equal(stampDay('2026-11-05T01:30:00.000Z'), '04/11');
  assert.equal(stampLabel('não é data'), '');
});

test('filtros por responsável e origem', () => {
  const cards = [card('a'), card('b', { responsibleId: 'joao' }), card('c', { origin: 'medio_prazo' })];
  assert.equal(hasFilters(NO_FILTERS), false);
  assert.deepEqual(
    filterCards(cards, NO_FILTERS).map(c => c.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    filterCards(cards, { responsibleId: 'joao', origin: '' }).map(c => c.id),
    ['b'],
  );
  assert.deepEqual(
    filterCards(cards, { responsibleId: 'ana', origin: 'medio_prazo' }).map(c => c.id),
    ['c'],
  );
  assert.equal(hasFilters({ responsibleId: '', origin: 'manual' }), true);
});

test('colunas na ordem do quadro, cada uma pela posição', () => {
  const columns = cardsByStatus([
    card('b', { orderIndex: 2 }),
    card('a', { orderIndex: 1 }),
    card('d', { status: 'done' }),
    card('c', { orderIndex: 2, createdAt: '2026-11-02T12:00:00.000Z' }),
  ]);
  assert.deepEqual(Object.keys(columns), ['todo', 'doing', 'paused', 'done', 'cancelled']);
  assert.deepEqual(
    columns.todo.map(c => c.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    columns.done.map(c => c.id),
    ['d'],
  );
  assert.deepEqual(columns.paused, []);
});

test('origem: tarefa e serviço levam o nome; data só é digitada fora deles', () => {
  assert.equal(originLabel(card('a', { origin: 'medio_prazo', sourceLabel: 'Piso do térreo' })), 'Médio prazo · Piso do térreo');
  assert.equal(originLabel(card('a', { origin: 'longo_prazo', sourceLabel: 'Esquadrias' })), 'Longo prazo · Esquadrias');
  assert.equal(originLabel(card('a', { origin: 'longo_prazo' })), 'Longo prazo');
  assert.equal(originLabel(card('a')), 'Manual');
  assert.equal(originLabel(card('a', { origin: 'restricao', sourceLabel: 'x' })), 'Restrição');
  assert.equal(dueDateEditable(card('a')), true);
  assert.equal(dueDateEditable(card('a', { origin: 'restricao' })), true);
  assert.equal(dueDateEditable(card('a', { origin: 'medio_prazo' })), false);
  assert.equal(dueDateEditable(card('a', { origin: 'longo_prazo' })), false);
});

test('excluir: quem criou ou o admin', () => {
  assert.equal(canDeleteCard(card('a'), 'ana', false), true);
  assert.equal(canDeleteCard(card('a'), 'joao', false), false);
  assert.equal(canDeleteCard(card('a'), 'joao', true), true);
});

test('sinal de prazo: texto de cada situação (dias úteis)', () => {
  // A fazer, começo longe: 04/12 menos 5 dias úteis = 27/11.
  assert.deepEqual(signalChip(card('a', { leadTimeDays: 5 }), TODAY), { signal: 'ok', text: 'Começar até 27/11' });
  // A fazer, começo nos próximos 5 dias úteis: 04/12 menos 15 = 13/11.
  assert.deepEqual(signalChip(card('a', { leadTimeDays: 15 }), TODAY), { signal: 'soon', text: 'Começar até 13/11' });
  // A fazer, começo já passou: 04/12 menos 25 = 30/10.
  assert.deepEqual(signalChip(card('a', { leadTimeDays: 25 }), TODAY), { signal: 'late', text: 'Devia ter começado em 30/10' });
  // Entrega vencida na sexta 06/11: sexta e segunda são os dois dias úteis de atraso.
  assert.deepEqual(signalChip(card('a', { status: 'doing', dueDate: '2026-11-06' }), TODAY), {
    signal: 'late',
    text: 'Atrasada 2 dias úteis',
  });
  assert.equal(signalChip(card('a', { status: 'paused', dueDate: '2026-11-09' }), TODAY).text, 'Atrasada 1 dia útil');
  // Entrega no sábado conferida no domingo: zero dia útil, mas já atrasou.
  assert.equal(signalChip(card('a', { status: 'doing', dueDate: '2026-11-07' }), '2026-11-08').text, 'Atrasada 1 dia útil');
  // Fazendo, no prazo: de terça 10/11 a quinta 26/11 são 12 dias úteis.
  assert.deepEqual(signalChip(card('a', { status: 'doing', dueDate: '2026-11-26' }), TODAY), {
    signal: 'ok',
    text: 'Faltam 12 dias úteis',
  });
  assert.equal(signalChip(card('a', { status: 'doing', dueDate: TODAY }), TODAY).text, 'Entrega hoje');
  assert.deepEqual(signalChip(card('a', { status: 'done', closedAt: '2026-11-05T15:00:00.000Z' }), TODAY), {
    signal: 'closed',
    text: 'Concluída em 05/11',
  });
  assert.equal(signalChip(card('a', { status: 'cancelled', closedAt: '2026-10-29T15:00:00.000Z' }), TODAY).text, 'Cancelada em 29/10');
  assert.equal(signalChip(card('a', { status: 'done' }), TODAY).text, 'Concluída');
});

test('contadores do cabeçalho ignoram os cards fechados', () => {
  const cards = [
    card('ok', { leadTimeDays: 5 }),
    card('soon', { leadTimeDays: 15 }),
    card('late', { leadTimeDays: 25 }),
    card('late2', { status: 'paused', dueDate: '2026-11-06' }),
    card('done', { status: 'done', dueDate: '2026-11-06' }),
    card('cancelled', { status: 'cancelled' }),
  ];
  assert.deepEqual(summarizeSignals(cards, TODAY), { late: 2, soon: 1, ok: 1 });
  assert.equal(dueLabel(card('a', { leadTimeDays: 20, dueDate: '2026-12-02' })), 'Entrega 02/12 · 20 d');
});

test('checklists e conversa do card', () => {
  const items = [item('i1', 'a', true), item('i2', 'a', false), item('i3', 'a', false), item('i4', 'b', false)];
  assert.equal(openItemCount(items, 'a'), 2);
  assert.equal(openItemCount(items, 'vazio'), 0);
  assert.equal(progressPercent(3, 5), 60);
  assert.equal(progressPercent(0, 0), 0);
  const messages = [
    message('m2', 'a', 'message', '2026-11-04T14:30:00.000Z'),
    message('s1', 'a', 'system', '2026-10-28T09:12:00.000Z'),
    message('m3', 'b', 'message', '2026-11-04T10:00:00.000Z'),
  ];
  assert.deepEqual(
    messagesOf(messages, 'a').map(m => m.id),
    ['s1', 'm2'],
  );
  assert.equal(messageCount(messages, 'a'), 1);
  const data = { cards: [], checklists: [], items, messages };
  assert.equal(applyItemDone(data, 'i2', true).items.find(i => i.id === 'i2')?.done, true);
  assert.equal(items[1].done, false);
});

test('pessoas: iniciais e nome de quem saiu da obra', () => {
  assert.equal(initials('Ana Lima'), 'AL');
  assert.equal(initials('  rafael de souza costa '), 'RC');
  assert.equal(initials('Bruno'), 'BR');
  assert.equal(initials(''), '?');
  assert.equal(personName(PEOPLE, 'joao'), 'João Pereira');
  assert.equal(personName(PEOPLE, 'x'), 'Pessoa sem acesso à obra');
  assert.equal(personName(PEOPLE, 'x', 'Fulano'), 'Fulano');
});

test('@ em digitação: só no começo ou depois de espaço', () => {
  assert.deepEqual(mentionQuery('Oi @ma', 6), { start: 3, query: 'ma' });
  assert.deepEqual(mentionQuery('@', 1), { start: 0, query: '' });
  assert.deepEqual(mentionQuery('Oi @Ana Li', 10), { start: 3, query: 'Ana Li' });
  // O cursor manda: antes do @ não há menção.
  assert.equal(mentionQuery('Oi @ma', 2), undefined);
  assert.equal(mentionQuery('fulano@atr.com', 14), undefined);
  assert.equal(mentionQuery('Oi @ma\nnova linha', 17), undefined);
  assert.equal(mentionQuery('sem arroba', 5), undefined);
});

test('lista do @: filtra sem acento, pelo nome ou pelo sobrenome', () => {
  assert.deepEqual(
    matchPeople(PEOPLE, 'ma').map(p => p.id),
    ['marcos', 'marina'],
  );
  assert.deepEqual(
    matchPeople(PEOPLE, 'joa').map(p => p.id),
    ['joao'],
  );
  // Quem começa pelo primeiro nome vem antes de quem casa pelo sobrenome.
  assert.deepEqual(
    matchPeople(PEOPLE, 'so').map(p => p.id),
    ['ana2', 'marina'],
  );
  assert.equal(matchPeople(PEOPLE, '').length, 5);
  assert.equal(matchPeople(PEOPLE, '', 2).length, 2);
  // Depois de escolhido ("Ana Lima " com o espaço), a lista fecha.
  assert.deepEqual(matchPeople([PEOPLE[0]], 'Ana Lima '), []);
  assert.deepEqual(matchPeople(PEOPLE, 'zz'), []);
});

test('escolher na lista troca o @ em digitação pelo nome completo', () => {
  assert.deepEqual(applyMention('Oi @ma, tudo bem?', 3, 6, PEOPLE[3]), { text: 'Oi @Marina Souza , tudo bem?', caret: 17 });
  assert.deepEqual(applyMention('@jo', 0, 3, PEOPLE[2]), { text: '@João Pereira ', caret: 14 });
  // Não dobra o espaço que já existia depois do cursor.
  assert.equal(applyMention('@jo fim', 0, 3, PEOPLE[2]).text, '@João Pereira fim');
});

test('menções no texto: nome mais longo, sem repetir, sem casar pela metade', () => {
  const body = 'Lote ok. @Ana Lima Souza, avisa a @Ana Lima e o @João Pereira. De novo: @Ana Lima!';
  assert.deepEqual(extractMentions(body, PEOPLE), ['ana2', 'ana', 'joao']);
  assert.deepEqual(splitMentions('Oi @Ana Lima, ok?', PEOPLE), [
    { text: 'Oi ' },
    { text: '@Ana Lima', personId: 'ana' },
    { text: ', ok?' },
  ]);
  // "@Ana Limaverde" não é a Ana Lima; e-mail não é menção.
  assert.deepEqual(extractMentions('@Ana Limaverde e ana@Ana Lima', PEOPLE), []);
  assert.deepEqual(extractMentions('sem ninguém', PEOPLE), []);
  assert.deepEqual(splitMentions('', PEOPLE), []);
});

test('mover: muda de coluna, entra acima do card indicado e renumera', () => {
  const cards = [
    card('a', { orderIndex: 0 }),
    card('b', { orderIndex: 1 }),
    card('c', { orderIndex: 2 }),
    card('d', { status: 'doing', orderIndex: 0 }),
    card('e', { status: 'doing', orderIndex: 1 }),
  ];
  const order = (list: PendingCard[], status: PendingCard['status']) => cardsByStatus(list)[status].map(c => c.id);

  const across = applyMove(cards, 'a', { status: 'doing', beforeCardId: 'e' });
  assert.deepEqual(order(across, 'todo'), ['b', 'c']);
  assert.deepEqual(order(across, 'doing'), ['d', 'a', 'e']);

  const within = applyMove(cards, 'c', { status: 'todo', beforeCardId: 'a' });
  assert.deepEqual(order(within, 'todo'), ['c', 'a', 'b']);

  const end = applyMove(cards, 'a', { status: 'todo' });
  assert.deepEqual(order(end, 'todo'), ['b', 'c', 'a']);

  const paused = applyMove(cards, 'a', { status: 'paused' }, '  aguardando o projeto ');
  assert.equal(paused.find(c => c.id === 'a')?.statusReason, 'aguardando o projeto');
  // Sair de Pausado sem motivo limpa o motivo.
  assert.equal(applyMove(paused, 'a', { status: 'doing' }).find(c => c.id === 'a')?.statusReason, undefined);

  assert.deepEqual(applyMove(cards, 'não existe', { status: 'done' }), cards);
  // O original não muda.
  assert.equal(cards[0].status, 'todo');
});

test('soltar no mesmo lugar não é movimento', () => {
  const cards = [card('a', { orderIndex: 0 }), card('b', { orderIndex: 1 }), card('c', { orderIndex: 2 })];
  assert.equal(isSamePlace(cards, 'a', { status: 'todo', beforeCardId: 'b' }), true);
  assert.equal(isSamePlace(cards, 'a', { status: 'todo', beforeCardId: 'a' }), true);
  assert.equal(isSamePlace(cards, 'c', { status: 'todo' }), true);
  assert.equal(isSamePlace(cards, 'a', { status: 'todo' }), false);
  assert.equal(isSamePlace(cards, 'a', { status: 'todo', beforeCardId: 'c' }), false);
  assert.equal(isSamePlace(cards, 'a', { status: 'doing' }), false);
});

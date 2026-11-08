import test from 'node:test';
import assert from 'node:assert/strict';
import type { AgentProposal } from '../src/application/use-cases/agent-tools';
import {
  addTurn,
  buildHistory,
  capTopics,
  contextFromPath,
  contextPhrase,
  deleteTopic,
  emptyStore,
  formatWhen,
  hasPending,
  INTERRUPTED_APPLY_MESSAGE,
  INTERRUPTED_MESSAGE,
  isQuotaError,
  loadStore,
  loadWindowPrefs,
  markInterrupted,
  MAX_TOPICS,
  newTurn,
  parseStore,
  parseWindowPrefs,
  removeTopics,
  renameTopic,
  restoreTopic,
  saveStore,
  saveWindowPrefs,
  screenFromPath,
  serializeStore,
  setProposalState,
  showsContextMarker,
  titleFrom,
  topicCost,
  topicMeta,
  topicsKey,
  updateTurn,
  windowKey,
  workIdFromPath,
  type StorageLike,
  type Topic,
  type TopicContext,
  type TopicStore,
} from '../src/modules/agente/claudia-topics';

const MOZINE_TERM: TopicContext = { workId: 'w1', workName: 'Mozine', screen: 'terminalidade', label: 'Mozine · Terminalidade' };
const GERAL: TopicContext = { screen: 'dashboard-geral', label: 'Dashboard geral' };
const iso = (minute: number) => new Date(Date.UTC(2026, 10, 8, 12, minute)).toISOString();

const proposal = (over: Partial<AgentProposal> = {}): AgentProposal => ({
  id: 'p1',
  kind: 'levar',
  title: '3 linhas para a semana 114',
  lines: ['Alvenaria 8º pav.'],
  commands: [{ type: 'x' } as unknown as AgentProposal['commands'][number], { type: 'y' } as unknown as AgentProposal['commands'][number]],
  weekStart: '2026-11-09',
  skipped: [],
  workId: 'w1',
  workName: 'Mozine',
  ...over,
});

/** Assunto com `n` perguntas respondidas, a última em `minute`. */
function storeWith(topicId: string, n: number, minute = 0, context: TopicContext = MOZINE_TERM): TopicStore {
  let store = emptyStore();
  for (let i = 0; i < n; i += 1) {
    store = addTurn(store, topicId, newTurn({ id: `${topicId}-t${i}`, question: `Pergunta ${i}`, context, now: iso(minute) }), iso(minute));
    store = updateTurn(store, topicId, `${topicId}-t${i}`, turn => ({ ...turn, answer: `Resposta ${i}`, costUsd: 0.05 }));
  }
  return store;
}

class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  limit = Infinity;
  blocked = false;
  getItem(key: string) {
    if (this.blocked) throw new Error('SecurityError');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.blocked) throw new Error('SecurityError');
    if (value.length > this.limit) throw new DOMException('cheio', 'QuotaExceededError');
    this.data.set(key, value);
  }
}

test('contexto: tela e obra vêm do endereço, com as chaves do manual', () => {
  assert.equal(workIdFromPath('/obras/abc%20d/terminalidade'), 'abc d');
  assert.equal(workIdFromPath('/obras'), undefined);
  assert.equal(screenFromPath('/obras/w1/terminalidade'), 'terminalidade');
  assert.equal(screenFromPath('/obras/w1/vagoes/v9'), 'vagoes');
  assert.equal(screenFromPath('/obras/w1/inexistente'), undefined);
  assert.equal(screenFromPath('/obras'), 'obras');
  assert.equal(screenFromPath('/obras/'), 'obras');
  assert.equal(screenFromPath('/dashboard'), 'dashboard-geral');
  assert.equal(screenFromPath('/configuracoes'), 'configuracoes-gerais');
  assert.equal(screenFromPath('/configuracoes/agente'), 'configuracoes-gerais');
  assert.equal(screenFromPath('/login'), undefined);

  assert.deepEqual(contextFromPath('/obras/w1/terminalidade', 'Mozine'), MOZINE_TERM);
  assert.equal(contextFromPath('/obras/w1/curto-prazo').label, 'Obra · Curto prazo', 'nome da obra ainda carregando');
  assert.equal(contextFromPath('/obras/w1/seguranca', 'Atmos').label, 'Atmos · Segurança do trabalho');
  assert.deepEqual(contextFromPath('/dashboard'), GERAL);
  assert.equal(contextFromPath('/obras').label, 'Lista de obras');
  assert.equal(contextFromPath('/configuracoes/agente').label, 'Configurações');
});

test('marcador de contexto: preposição e quando aparece', () => {
  assert.equal(contextPhrase(GERAL), 'no Dashboard geral');
  assert.equal(contextPhrase({ screen: 'obras', label: 'Lista de obras' }), 'na Lista de obras');
  assert.equal(contextPhrase({ screen: 'configuracoes-gerais', label: 'Configurações' }), 'em Configurações');
  assert.equal(contextPhrase(MOZINE_TERM), 'em Mozine · Terminalidade');

  const turns = [
    newTurn({ id: 'a', question: 'q', context: GERAL, now: iso(0) }),
    newTurn({ id: 'b', question: 'q', context: GERAL, now: iso(1) }),
    newTurn({ id: 'c', question: 'q', context: MOZINE_TERM, now: iso(2) }),
    newTurn({ id: 'd', question: 'q', context: { ...MOZINE_TERM, label: 'Obra · Terminalidade' }, now: iso(3) }),
  ];
  assert.deepEqual(
    turns.map((_, i) => showsContextMarker(turns, i)),
    [true, false, true, false],
    'muda por obra e tela, não pelo texto do rótulo',
  );
});

test('título: primeira pergunta, espaços colapsados, cortado em palavra inteira', () => {
  assert.equal(titleFrom('  Qual obra   teve o pior PPC? '), 'Qual obra teve o pior PPC?');
  const long = 'Qual obra teve o pior PPC nas últimas quatro semanas e quais foram as causas mais citadas pelos empreiteiros';
  const title = titleFrom(long);
  assert.ok(title.length <= 60, title);
  assert.ok(title.endsWith('…'));
  assert.ok(long.startsWith(title.slice(0, -1)));
  assert.ok(!title.slice(0, -1).endsWith(' '));
  assert.equal(titleFrom('a'.repeat(80)).length, 60, 'sem espaço, corte seco');
  assert.equal(titleFrom('   '), 'Novo assunto');
});

test('addTurn cria o assunto na primeira pergunta e acrescenta nas seguintes', () => {
  let store = addTurn(emptyStore(), 'T', newTurn({ id: 't1', question: ' Primeira ', context: GERAL, now: iso(0) }), iso(0));
  assert.equal(store.topics.length, 1);
  assert.equal(store.topics[0].title, 'Primeira');
  assert.equal(store.topics[0].turns[0].question, 'Primeira');
  assert.ok(hasPending(store.topics[0]));
  store = addTurn(store, 'T', newTurn({ id: 't2', question: 'Segunda', context: MOZINE_TERM, now: iso(5) }), iso(5));
  assert.equal(store.topics.length, 1);
  assert.equal(store.topics[0].turns.length, 2);
  assert.equal(store.topics[0].title, 'Primeira', 'o título não muda com as perguntas seguintes');
  assert.equal(store.topics[0].updatedAt, iso(5));
});

test('updateTurn grava a resposta; assunto apagado no meio do caminho é ignorado', () => {
  let store = storeWith('A', 1, 0);
  store = addTurn(store, 'A', newTurn({ id: 'x', question: 'Mais', context: GERAL, now: iso(1) }), iso(1));
  store = updateTurn(store, 'A', 'x', turn => ({ ...turn, answer: 'ok', consulted: ['Panorama das obras'], costUsd: 0.07 }), iso(2));
  const topic = store.topics[0];
  assert.equal(topic.turns[1].answer, 'ok');
  assert.deepEqual(topic.turns[1].consulted, ['Panorama das obras']);
  assert.equal(topic.updatedAt, iso(2));
  assert.ok(!hasPending(topic));
  assert.equal(Math.round(topicCost(topic) * 100), 12);
  assert.equal(topicCost(undefined), 0);

  const gone = deleteTopic(store, 'A');
  assert.equal(
    updateTurn(gone, 'A', 'x', turn => ({ ...turn, answer: 'tarde' })),
    gone,
  );
  assert.equal(
    updateTurn(store, 'A', 'inexistente', turn => ({ ...turn, answer: 'tarde' })),
    store,
  );
});

test('capTopics guarda os 20 mais recentes e nunca o assunto aberto', () => {
  let store = emptyStore();
  for (let i = 0; i < 25; i += 1) store = { ...store, topics: [...store.topics, ...storeWith(`T${i}`, 1, i).topics] };
  const capped = capTopics(store.topics);
  assert.equal(capped.length, MAX_TOPICS);
  assert.equal(capped[0].id, 'T24', 'do mais novo ao mais velho');
  assert.ok(!capped.some(t => t.id === 'T0'));
  const kept = capTopics(store.topics, 'T0');
  assert.equal(kept.length, MAX_TOPICS);
  assert.ok(kept.some(t => t.id === 'T0'));
  assert.ok(!kept.some(t => t.id === 'T5'));

  // addTurn corta sozinho: o 21º assunto empurra o mais velho para fora.
  let full = { ...emptyStore(), topics: capped };
  full = addTurn(full, 'novo', newTurn({ id: 'n', question: 'Nova', context: GERAL, now: iso(59) }), iso(59));
  assert.equal(full.topics.length, MAX_TOPICS);
  assert.equal(full.topics[0].id, 'novo');
  assert.ok(!full.topics.some(t => t.id === 'T5'));
});

test('renomear, apagar, desfazer e tirar vários', () => {
  const store = { ...emptyStore(), topics: [...storeWith('A', 1, 1).topics, ...storeWith('B', 1, 2).topics] };
  const renamed = renameTopic(store, 'A', '  Atrasos   de novembro ');
  assert.equal(renamed.topics.find(t => t.id === 'A')?.title, 'Atrasos de novembro');
  assert.deepEqual(
    renamed.topics.map(t => t.id),
    store.topics.map(t => t.id),
    'renomear não reordena',
  );
  assert.equal(renameTopic(store, 'A', '   '), store, 'nome vazio é recusado');
  assert.equal(renameTopic(store, 'A', 'x'.repeat(200)).topics.find(t => t.id === 'A')?.title.length, 80);

  const deleted = deleteTopic(store, 'A');
  assert.deepEqual(
    deleted.topics.map(t => t.id),
    ['B'],
  );
  const restored = restoreTopic(deleted, store.topics.find(t => t.id === 'A') as Topic);
  assert.deepEqual(restored.topics.map(t => t.id).sort(), ['A', 'B']);
  assert.deepEqual(removeTopics(store, ['A', 'B']).topics, []);
  assert.equal(removeTopics(store, []), store);
});

test('estado das propostas fica no assunto', () => {
  let store = storeWith('A', 1, 0);
  store = updateTurn(store, 'A', 'A-t0', turn => ({ ...turn, proposals: [{ proposal: proposal(), state: { status: 'pendente' } }] }));
  store = setProposalState(store, 'A', 'A-t0', 'p1', { status: 'falhou', done: 1, message: 'Sem conexão' });
  assert.deepEqual(store.topics[0].turns[0].proposals[0].state, { status: 'falhou', done: 1, message: 'Sem conexão' });
});

test('markInterrupted: pergunta sem resposta e aplicação no meio viram erro', () => {
  let store = storeWith('A', 1, 0);
  store = updateTurn(store, 'A', 'A-t0', turn => ({
    ...turn,
    proposals: [{ proposal: proposal(), state: { status: 'aplicando', done: 1 } }],
  }));
  store = addTurn(store, 'A', newTurn({ id: 'pend', question: 'E agora?', context: GERAL, now: iso(1) }), iso(1));
  store = addTurn(store, 'A', newTurn({ id: 'err', question: 'Falhou', context: GERAL, now: iso(2) }), iso(2));
  store = updateTurn(store, 'A', 'err', turn => ({ ...turn, error: 'Limite atingido' }));
  const marked = markInterrupted(store);
  const turns = marked.topics[0].turns;
  assert.equal(turns[1].error, INTERRUPTED_MESSAGE);
  assert.equal(turns[2].error, 'Limite atingido', 'erro anterior fica como estava');
  assert.deepEqual(turns[0].proposals[0].state, { status: 'falhou', done: 1, message: INTERRUPTED_APPLY_MESSAGE });
  assert.equal(markInterrupted(marked), marked, 'sem nada a marcar devolve o mesmo objeto');
});

test('histórico: 8 últimas rodadas respondidas, com o contexto na pergunta', () => {
  let store = storeWith('A', 10, 0, GERAL);
  store = addTurn(store, 'A', newTurn({ id: 'e', question: 'Deu erro', context: GERAL, now: iso(1) }), iso(1));
  store = updateTurn(store, 'A', 'e', turn => ({ ...turn, error: 'falha' }));
  store = addTurn(store, 'A', newTurn({ id: 'last', question: 'E as pendências daqui?', context: MOZINE_TERM, now: iso(2) }), iso(2));
  store = updateTurn(store, 'A', 'last', turn => ({ ...turn, answer: '146 abertas' }));
  store = addTurn(store, 'A', newTurn({ id: 'pend', question: 'Esperando', context: GERAL, now: iso(3) }), iso(3));
  const history = buildHistory(store.topics[0].turns);
  assert.equal(history.length, 16);
  assert.deepEqual(history[0], { role: 'user', content: '[Tela: Dashboard geral] Pergunta 3' });
  assert.deepEqual(history.slice(-2), [
    { role: 'user', content: '[Tela: Mozine · Terminalidade] E as pendências daqui?' },
    { role: 'assistant', content: '146 abertas' },
  ]);
  assert.ok(!history.some(m => m.content.includes('Deu erro') || m.content.includes('Esperando')));
  assert.deepEqual(buildHistory([]), []);
});

test('lista: quando, quantas perguntas e de que obras', () => {
  const now = new Date(2026, 10, 8, 15, 0);
  assert.equal(formatWhen(new Date(2026, 10, 8, 14, 32).toISOString(), now), 'Hoje, 14:32');
  assert.equal(formatWhen(new Date(2026, 10, 7, 18, 5).toISOString(), now), 'Ontem, 18:05');
  assert.equal(formatWhen(new Date(2026, 10, 5, 9, 0).toISOString(), now), '05/11');
  assert.equal(formatWhen(new Date(2025, 11, 30, 9, 0).toISOString(), now), '30/12/2025');

  const one = storeWith('A', 1, 0, MOZINE_TERM).topics[0];
  const updatedAt = new Date(2026, 10, 8, 14, 32).toISOString();
  assert.equal(topicMeta({ ...one, updatedAt }, now), 'Hoje, 14:32 · 1 pergunta · Mozine');
  let mixed = storeWith('B', 2, 0, GERAL);
  mixed = addTurn(
    mixed,
    'B',
    newTurn({ id: 'z', question: 'Atmos?', context: { workId: 'w2', workName: 'Atmos', label: 'Atmos' }, now: iso(1) }),
    iso(1),
  );
  mixed = addTurn(mixed, 'B', newTurn({ id: 'y', question: 'Mozine?', context: MOZINE_TERM, now: iso(2) }), iso(2));
  assert.equal(topicMeta({ ...mixed.topics[0], updatedAt }, now), 'Hoje, 14:32 · 4 perguntas · várias obras');
  assert.equal(topicMeta({ ...storeWith('C', 2, 0, GERAL).topics[0], updatedAt }, now), 'Hoje, 14:32 · 2 perguntas · geral');
});

test('serializar e ler de volta, com versão e validação', () => {
  let store = storeWith('A', 2, 3);
  store = updateTurn(store, 'A', 'A-t1', turn => ({
    ...turn,
    consulted: ['Terminalidade · Mozine'],
    model: 'claude-sonnet',
    proposals: [{ proposal: proposal(), state: { status: 'aplicada' } }],
  }));
  const text = serializeStore(store);
  assert.deepEqual(parseStore(text), store);

  assert.deepEqual(parseStore(null), emptyStore());
  assert.deepEqual(parseStore('{quebrado'), emptyStore());
  assert.deepEqual(parseStore(JSON.stringify({ version: 999, topics: store.topics })), emptyStore(), 'versão diferente');
  assert.deepEqual(parseStore(JSON.stringify([])), emptyStore());

  const dirty = JSON.stringify({
    version: 1,
    topics: [
      store.topics[0],
      store.topics[0], // repetido
      { id: 'vazio', title: 'Sem perguntas', turns: [] },
      {
        id: 'ruim',
        turns: [{ id: 't', question: '' }, { question: 'sem id' }, { id: 'ok', question: 'Vale', context: 'x', proposals: 'x' }],
      },
      {
        id: 'prop',
        title: '',
        turns: [
          {
            id: 'p',
            question: 'Propostas',
            askedAt: iso(9),
            context: GERAL,
            answer: 'sim',
            costUsd: -1,
            proposals: [
              { proposal: proposal({ id: 'boa' }), state: { status: 'inventado' } },
              { proposal: { ...proposal({ id: 'ruim' }), kind: 'apagar' }, state: { status: 'pendente' } },
              { proposal: { ...proposal({ id: 'sem-comandos' }), commands: [1] }, state: { status: 'pendente' } },
            ],
          },
        ],
      },
      'lixo',
    ],
  });
  const parsed = parseStore(dirty);
  assert.deepEqual(parsed.topics.map(t => t.id).sort(), ['A', 'prop', 'ruim']);
  const ruim = parsed.topics.find(t => t.id === 'ruim') as Topic;
  assert.equal(ruim.turns.length, 1);
  assert.deepEqual(ruim.turns[0].context, { label: 'Obra 360' });
  assert.deepEqual(ruim.turns[0].proposals, []);
  assert.equal(ruim.title, 'Vale', 'sem título, vem da primeira pergunta');
  const prop = parsed.topics.find(t => t.id === 'prop') as Topic;
  assert.equal(prop.turns[0].costUsd, undefined);
  assert.deepEqual(
    prop.turns[0].proposals.map(c => [c.proposal.id, c.state.status]),
    [['boa', 'pendente']],
  );
});

test('loadStore marca o interrompido e nunca lança', () => {
  const storage = new FakeStorage();
  const key = topicsKey('u1');
  assert.equal(key, 'obra360:claudia:assuntos:u1');
  let store = storeWith('A', 1, 0);
  store = addTurn(store, 'A', newTurn({ id: 'pend', question: 'Esperando', context: GERAL, now: iso(1) }), iso(1));
  storage.setItem(key, serializeStore(store));
  assert.equal(loadStore(storage, key).topics[0].turns[1].error, INTERRUPTED_MESSAGE);
  storage.blocked = true;
  assert.deepEqual(loadStore(storage, key), emptyStore());
  assert.deepEqual(loadStore(null, key), emptyStore());
});

test('saveStore com a cota cheia tira os assuntos mais antigos, nunca o aberto', () => {
  const storage = new FakeStorage();
  const key = topicsKey('u1');
  let store = emptyStore();
  for (let i = 0; i < 5; i += 1) store = { ...store, topics: [...store.topics, ...storeWith(`T${i}`, 3, i).topics] };
  const full = serializeStore(store).length;
  // Tirar um assunto encurta o texto no tamanho dele mais a vírgula; todos têm o mesmo tamanho.
  const oneTopic = JSON.stringify(store.topics[0]).length + 1;

  assert.deepEqual(saveStore(storage, key, store), {
    ok: true,
    dropped: [],
    text: serializeStore({ ...store, topics: capTopics(store.topics) }),
  });

  storage.limit = full - oneTopic; // cabe tudo menos um assunto
  const result = saveStore(storage, key, store, 'T0');
  assert.equal(result.ok, true);
  assert.deepEqual(result.dropped, ['T1'], 'o mais antigo que não é o aberto');
  assert.deepEqual(
    parseStore(storage.data.get(key))
      .topics.map(t => t.id)
      .sort(),
    ['T0', 'T2', 'T3', 'T4'],
  );

  storage.limit = 10; // nem o aberto cabe
  const none = saveStore(storage, key, store, 'T0');
  assert.equal(none.ok, false);
  assert.deepEqual(none.dropped.sort(), ['T1', 'T2', 'T3', 'T4']);

  storage.limit = Infinity;
  storage.blocked = true;
  assert.deepEqual(saveStore(storage, key, store), { ok: false, dropped: [] }, 'outro erro não apaga nada');
  assert.deepEqual(saveStore(null, key, store), { ok: false, dropped: [] });
});

test('isQuotaError reconhece os nomes e códigos dos navegadores', () => {
  assert.ok(isQuotaError(new DOMException('x', 'QuotaExceededError')));
  assert.ok(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }));
  assert.ok(isQuotaError({ code: 22 }));
  assert.ok(!isQuotaError(new Error('SecurityError')));
  assert.ok(!isQuotaError(null));
  assert.ok(!isQuotaError('QuotaExceededError'));
});

test('preferências da janela: aberta, minimizada ou ampliada, e o assunto aberto', () => {
  const storage = new FakeStorage();
  const key = windowKey('u1');
  assert.equal(key, 'obra360:claudia:janela:u1');
  assert.deepEqual(loadWindowPrefs(storage, key), { mode: 'closed', expanded: false, activeId: null });
  assert.ok(saveWindowPrefs(storage, key, { mode: 'minimized', expanded: true, activeId: 'A' }));
  assert.deepEqual(loadWindowPrefs(storage, key), { mode: 'minimized', expanded: true, activeId: 'A' });
  assert.deepEqual(parseWindowPrefs('{"mode":"gigante","expanded":"sim","activeId":7}'), {
    mode: 'closed',
    expanded: false,
    activeId: null,
  });
  assert.deepEqual(parseWindowPrefs('não é json'), { mode: 'closed', expanded: false, activeId: null });
  storage.blocked = true;
  assert.equal(saveWindowPrefs(storage, key, { mode: 'open', expanded: false, activeId: null }), false);
  assert.deepEqual(loadWindowPrefs(storage, key), { mode: 'closed', expanded: false, activeId: null });
});

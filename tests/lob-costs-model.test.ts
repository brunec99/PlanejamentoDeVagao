import test from 'node:test';
import assert from 'node:assert/strict';
import {
  columnFill,
  columnValues,
  costsDiff,
  importBudget,
  moveItems,
  parseBudgetPaste,
  pastedRows,
  readAmount,
  saveBlocker,
  setPackageAmount,
  type DraftContext,
  type DraftCost,
} from '../src/modules/longo-prazo/lob/costs-model';
import { LOB_LIMITS } from '../src/domain/lob';

/** Tela "Custos" da aba 1 (11/11/2026): leitura do orçamento colado, rascunho e o `save_costs`. */

const NOW = '2026-11-11T12:00:00.000Z';
const services = [
  { id: 's-alv', name: 'Alvenaria' },
  { id: 's-ele', name: 'Instalações elétricas' },
  { id: 's-pin', name: 'Pintura' },
];
const item = (id: string, fields: Partial<DraftCost> = {}): DraftCost => ({
  id,
  workId: 'w',
  description: `Item ${id}`,
  amount: 100,
  orderIndex: 0,
  createdBy: 'u1',
  createdAt: NOW,
  updatedAt: NOW,
  ...fields,
});
const context = (): DraftContext => {
  let n = 0;
  return { workId: 'w', actorId: 'u1', now: NOW, newId: () => `novo-${++n}` };
};

// ─── Colar do orçamento ─────────────────────────────────────────────────────────

test('orçamento colado: código, descrição e valor separados por tabulação; cabeçalho vai para as ignoradas', () => {
  const text = [
    'Código\tDescrição\tValor (R$)',
    '01.02.003\tAlvenaria de vedação com blocos cerâmicos\tR$ 1.234.567,89',
    '01.02.004\tVerga e contraverga\t1500',
    '',
  ].join('\n');
  const { lines, ignored } = parseBudgetPaste(text, services);
  assert.deepEqual(lines, [
    { line: 2, code: '01.02.003', description: 'Alvenaria de vedação com blocos cerâmicos', amount: 1234567.89 },
    { line: 3, code: '01.02.004', description: 'Verga e contraverga', amount: 1500 },
  ]);
  assert.equal(ignored.length, 1);
  assert.equal(ignored[0].line, 1);
  assert.equal(ignored[0].reason, 'sem valor em reais');
});

test('orçamento colado: valores no formato brasileiro e o último número da linha é o valor', () => {
  const text = [
    'Chapisco\t1.500', // mil e quinhentos
    'Reboco\t1234,56',
    'Contrapiso\tm²\t120\t45,00\t5.400,00', // unidade, quantidade, unitário e total
    'Emboço\t(1.234,00)', // negativo
    'Rodapé\t0', // zero é valor informado
  ].join('\n');
  const { lines, ignored } = parseBudgetPaste(text, services);
  assert.deepEqual(
    lines.map(l => [l.description, l.amount, l.code]),
    [
      ['Chapisco', 1500, undefined],
      ['Reboco', 1234.56, undefined],
      ['Contrapiso', 5400, undefined], // "120" depois da descrição é quantidade, não código
      ['Rodapé', 0, undefined],
    ],
  );
  assert.deepEqual(
    ignored.map(i => [i.line, i.reason]),
    [[4, 'valor negativo']],
  );
});

test('orçamento colado: pacote reconhecido pelo nome sem diferença de acento ou caixa', () => {
  const text = [
    'INSTALACOES ELETRICAS\t02.01\tQuadro de distribuição\t8.000,00',
    '  alvenaria \t12.000,00', // só o nome do pacote: ele mesmo vira a descrição
    'Pintura externa\t3.000,00', // nome parecido não conta
  ].join('\n');
  const { lines } = parseBudgetPaste(text, services);
  assert.deepEqual(lines, [
    { line: 1, code: '02.01', description: 'Quadro de distribuição', amount: 8000, serviceId: 's-ele' },
    { line: 2, description: 'alvenaria', amount: 12000, serviceId: 's-alv' },
    { line: 3, description: 'Pintura externa', amount: 3000 },
  ]);
});

test('orçamento colado: linha sem descrição, linha de total e ponto e vírgula', () => {
  const text = ['01.01\t\t2.000,00', '\tTOTAL GERAL\t99.999,00', 'Limpeza final;350,00'].join('\n');
  const { lines, ignored } = parseBudgetPaste(text, services);
  assert.deepEqual(lines, [{ line: 3, description: 'Limpeza final', amount: 350 }]);
  assert.deepEqual(
    ignored.map(i => [i.line, i.reason]),
    [
      [1, 'sem descrição'],
      [2, 'linha de total'],
    ],
  );
});

test('importar: acrescenta ao fim ou substitui todos os itens do rascunho', () => {
  const draft = [item('a', { serviceId: 's-alv', orderIndex: 4 })];
  const { lines } = parseBudgetPaste('Fiação\t500\nPintura\t700', services);
  const added = importBudget(draft, lines, false, context());
  assert.deepEqual(
    added.map(i => [i.id, i.serviceId, i.description, i.amount, i.orderIndex]),
    [
      ['a', 's-alv', 'Item a', 100, 4],
      ['novo-1', undefined, 'Fiação', 500, 5],
      ['novo-2', 's-pin', 'Pintura', 700, 6],
    ],
  );
  const replaced = importBudget(draft, lines, true, context());
  assert.deepEqual(
    replaced.map(i => i.id),
    ['novo-1', 'novo-2'],
  );
});

// ─── Rascunho e gravação ────────────────────────────────────────────────────────

test('custo na linha do pacote: cria o item, troca o valor do único item, apagar tira o item; com 2+ itens não muda', () => {
  let draft: DraftCost[] = [];
  draft = setPackageAmount(draft, 's-alv', 1000, context());
  assert.deepEqual(
    draft.map(i => [i.id, i.serviceId, i.description, i.amount]),
    [['novo-1', 's-alv', 'Custo do pacote', 1000]],
  );
  draft = setPackageAmount(draft, 's-alv', 1250.555, context());
  assert.equal(draft[0].amount, 1250.56);
  draft = setPackageAmount(draft, 's-alv', null, context());
  assert.deepEqual(draft, []);

  const two = [item('a', { serviceId: 's-ele' }), item('b', { serviceId: 's-ele' })];
  assert.deepEqual(setPackageAmount(two, 's-ele', 5, context()), two);
  assert.deepEqual(setPackageAmount(two, 's-ele', null, context()), two);
});

test('costsDiff: novos e alterados no upsert, inalterados fora, excluídos no remove', () => {
  const server = [
    item('igual', { serviceId: 's-alv', code: '01', orderIndex: 0 }),
    item('valor', { serviceId: 's-alv', orderIndex: 1 }),
    item('movido', { serviceId: 's-ele', orderIndex: 2 }),
    item('excluido', { orderIndex: 3 }),
  ];
  let draft = server.filter(i => i.id !== 'excluido').map(i => (i.id === 'valor' ? { ...i, amount: 150 } : i));
  draft = moveItems(draft, ['movido'], null);
  draft = [...draft, item('novo', { serviceId: 's-pin', code: ' 02.01 ', description: ' Massa  corrida ', amount: 10.005, orderIndex: 9 })];
  const diff = costsDiff(server, draft);
  assert.deepEqual(diff.remove, ['excluido']);
  assert.deepEqual(diff.upsert, [
    { id: 'valor', serviceId: 's-alv', code: null, description: 'Item valor', amount: 150 },
    { id: 'movido', serviceId: null, code: null, description: 'Item movido', amount: 100 },
    { id: 'novo', serviceId: 's-pin', code: '02.01', description: 'Massa corrida', amount: 10.01 },
  ]);
  assert.deepEqual(costsDiff(server, server), { upsert: [], remove: [] });
});

test('saveBlocker: limite do lote e item sem descrição', () => {
  const draft = [item('a')];
  assert.equal(saveBlocker(draft, { upsert: [1], remove: [] }), undefined);
  const big = { upsert: Array.from({ length: LOB_LIMITS.costBatch }, (_, i) => i), remove: [0] };
  assert.match(saveBlocker(draft, big) ?? '', /cada gravação aceita até 3\.000/);
  assert.match(saveBlocker([item('a', { description: '  ' })], { upsert: [1], remove: [] }) ?? '', /sem descrição/);
});

test('readAmount: vazio, inválido, negativo e valor', () => {
  assert.deepEqual(readAmount(''), { kind: 'empty' });
  assert.deepEqual(readAmount('R$ 1.234,56'), { kind: 'value', amount: 1234.56 });
  assert.equal(readAmount('abc').kind, 'invalid');
  assert.equal(readAmount('-5').kind, 'invalid');
  assert.equal(readAmount('2.000.000.000.000,00').kind, 'invalid');
});

// ─── Coluna colada ──────────────────────────────────────────────────────────────

test('coluna colada: preenche a partir do pacote do campo; 2+ itens pula a linha; sobra contada', () => {
  const values = columnValues('1.000,00\r\n2.000,00\r\n\r\nabc\r\n5.000\r\n6.000\r\n');
  assert.deepEqual(values.slice(0, 3), [1000, 2000, null]);
  assert.ok(Number.isNaN(values[3]));
  assert.deepEqual(values.slice(4), [5000, 6000]);
  assert.equal(pastedRows('1\n2\n'), 2);
  assert.equal(pastedRows('1.000,00'), 1);

  const order = ['s0', 's1', 's2', 's3', 's4', 's5'];
  const counts: Record<string, number> = { s2: 2 };
  const fill = columnFill(order, 's1', values, id => counts[id] ?? 0);
  // s1 ← 1.000; s2 tem dois itens: pulado com o 2.000; s3 em branco; s4 inválido; s5 ← 5.000; o 6.000 sobra.
  assert.deepEqual(fill, {
    assignments: [
      { serviceId: 's1', amount: 1000 },
      { serviceId: 's5', amount: 5000 },
    ],
    skipped: 1,
    invalid: 1,
    blank: 1,
    leftover: 1,
  });
});

test('coluna colada com várias colunas: vale o último número de cada linha', () => {
  assert.deepEqual(columnValues('Alvenaria\t1.000\nPintura\t2.500,50'), [1000, 2500.5]);
});

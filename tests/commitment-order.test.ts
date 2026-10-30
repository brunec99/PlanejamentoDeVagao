import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { commandScope } from '../src/application/use-cases/command-scope';
import { applyCommandLocally, projectsBeforeServer } from '../src/application/use-cases/local-apply';
import { orderPositions, placeBefore, sheetOrder } from '../src/domain/commitment-order';
import type { WeeklyCommitment } from '../src/domain/entities';
import { diffChangedRows, planningDataToPayload, rowsToPlanningData } from '../src/infrastructure/repositories/supabase/mappers';
import { mergePinned } from '../src/modules/curto-prazo/sheet-view';
import { recreateCommand } from '../src/modules/curto-prazo/undo';
import { createMockData } from '../src/mocks/planning';

/* Ordem da planilha do curto prazo (30/10/2026): inserir linha no meio e arrastar linhas gravam a
 * posição da semana inteira; sem posição, vale a ordem de inclusão de antes. */

const WEEK = '2026-09-28';
let clock = 0;
let id = 0;
/** Cada comando num instante diferente, para a ordem de inclusão não empatar. */
const run = (data: ReturnType<typeof createMockData>, command: Command, actorId = 'user-1', today = '2026-10-02') => {
  clock++;
  return applyCommand(data, command, {
    actorId,
    today,
    now: `2026-10-02T12:00:${String(clock % 60).padStart(2, '0')}.${String(clock).padStart(3, '0')}Z`,
    newId: () => `ordem-${++id}`,
  });
};
const create = (
  data: ReturnType<typeof createMockData>,
  name: string,
  extra: Partial<Extract<Command, { type: 'create_commitment' }>> = {},
) => run(data, { type: 'create_commitment', workId: 'obra-1', name, weekStart: WEEK, responsibleId: 'user-1', ...extra });
const withRows = (...names: string[]) => {
  const data = createMockData();
  const ids = names.map(name => create(data, name));
  return { data, ids };
};
const companyOf = (row: WeeklyCommitment) => row.supplier;
/** Os nomes da semana na ordem salva, como a planilha mostra ao abrir. */
const sheet = (data: ReturnType<typeof createMockData>, week = WEEK) =>
  data.commitments
    .filter(c => c.workId === 'obra-1' && c.weekStart === week)
    .sort(sheetOrder(companyOf))
    .map(c => c.name);

test('sem posição gravada, a planilha segue a ordem de inclusão, com o lote importado desempatado por empresa', () => {
  const row = (name: string, createdAt: string, supplier: string, order?: number): WeeklyCommitment => ({
    id: name,
    createdAt,
    updatedAt: createdAt,
    workId: 'obra-1',
    name,
    supplier,
    weekStart: WEEK,
    weekEnd: '2026-10-04',
    responsibleId: 'user-1',
    startDate: WEEK,
    endDate: WEEK,
    order,
  });
  const lote = '2026-09-01T00:00:00.000Z';
  const rows = [
    row('C', '2026-09-03T00:00:00.000Z', ''),
    row('B2', lote, 'Beta'),
    row('A1', lote, 'Alfa'),
    row('Z', '2026-09-02T00:00:00.000Z', ''),
  ];
  assert.deepEqual(
    [...rows].sort(sheetOrder(companyOf)).map(r => r.id),
    ['A1', 'B2', 'Z', 'C'],
  );
  // Com posição, ela manda; a linha sem posição (criada depois, embaixo) vem no fim.
  const positioned = [row('C', '2026-09-03T00:00:00.000Z', '', 1), row('A1', lote, 'Alfa', 2), row('Z', '2026-09-02T00:00:00.000Z', '')];
  assert.deepEqual(
    positioned.sort(sheetOrder(companyOf)).map(r => r.id),
    ['C', 'A1', 'Z'],
  );
});

test('placeBefore e orderPositions: inserir, mover, linha esquecida vai para o fim, id estranho é ignorado', () => {
  assert.deepEqual(placeBefore(['a', 'b', 'c'], 'n', 'b'), ['a', 'n', 'b', 'c']);
  assert.deepEqual(placeBefore(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(placeBefore(['a', 'b', 'c'], 'a', undefined), ['b', 'c', 'a']);
  assert.deepEqual(placeBefore(['a', 'b'], 'n', 'sumiu'), ['a', 'b', 'n']);
  const { data, ids } = withRows('Um', 'Dois', 'Três');
  const week = data.commitments;
  const positions = orderPositions(week, [ids[2], 'outra-semana', ids[0], ids[2]], companyOf);
  assert.deepEqual(
    [...positions],
    [
      [ids[2], 1],
      [ids[0], 2],
      [ids[1], 3],
    ],
  );
});

test('inserir acima de uma linha grava a ordem da tela com a linha nova no lugar', () => {
  const { data, ids } = withRows('Alvenaria', 'Reboco', 'Pintura');
  assert.deepEqual(sheet(data), ['Alvenaria', 'Reboco', 'Pintura']);
  const novo = create(data, 'Contrapiso', { beforeId: ids[2], order: ids });
  assert.deepEqual(sheet(data), ['Alvenaria', 'Reboco', 'Contrapiso', 'Pintura']);
  assert.equal(data.commitments.find(c => c.id === novo)!.order, 3);
  // A linha criada depois, pela linha em branco do fim, continua entrando embaixo.
  create(data, 'Limpeza');
  assert.deepEqual(sheet(data), ['Alvenaria', 'Reboco', 'Contrapiso', 'Pintura', 'Limpeza']);
});

test('inserir respeita a ordem da tela, não a salva: o que estava classificado fica como estava', () => {
  const { data, ids } = withRows('A', 'B', 'C');
  create(data, 'N', { beforeId: ids[0], order: [ids[2], ids[1], ids[0]] });
  assert.deepEqual(sheet(data), ['C', 'B', 'N', 'A']);
});

test('sem a ordem da tela (Desfazer de exclusão), a linha volta acima da de baixo na ordem salva', () => {
  const { data, ids } = withRows('A', 'B', 'C');
  const row = data.commitments.find(c => c.id === ids[1])!;
  run(data, { type: 'delete_commitment', commitmentId: ids[1] });
  const command = recreateCommand(row, 'user-1', ids[2]);
  assert.equal((command as { beforeId?: string }).beforeId, ids[2]);
  run(data, command);
  assert.deepEqual(sheet(data), ['A', 'B', 'C']);
  // Sem a linha de baixo (era a última), volta embaixo, sem posição.
  assert.equal('beforeId' in recreateCommand(row, 'user-1'), false);
});

test('linha de referência que sumiu não é erro: a inserida entra embaixo', () => {
  const { data, ids } = withRows('A', 'B');
  run(data, { type: 'delete_commitment', commitmentId: ids[0] });
  create(data, 'N', { beforeId: ids[0], order: ids });
  assert.deepEqual(sheet(data), ['B', 'N']);
});

test('arrastar grava a semana inteira e só toca as linhas que mudaram de posição', () => {
  const { data, ids } = withRows('A', 'B', 'C', 'D');
  run(data, { type: 'reorder_commitments', workId: 'obra-1', weekStart: WEEK, ids: [ids[0], ids[1], ids[3], ids[2]] });
  assert.deepEqual(sheet(data), ['A', 'B', 'D', 'C']);
  const before = structuredClone(data);
  run(data, { type: 'reorder_commitments', workId: 'obra-1', weekStart: '2026-10-01', ids: [ids[1], ids[0], ids[3], ids[2]] });
  assert.deepEqual(sheet(data), ['B', 'A', 'D', 'C']);
  const changed = diffChangedRows(before, data).weekly_commitments.map(r => r.name);
  assert.deepEqual(changed.sort(), ['A', 'B']);
  // No histórico, a contagem e não a lista de ids.
  const event = data.history[data.history.length - 1];
  assert.deepEqual(event.changes, {
    targetId: 'obra-1',
    type: 'reorder_commitments',
    workId: 'obra-1',
    weekStart: '2026-10-01',
    rows: 4,
  });
});

test('arrastar é edição da planilha: semana encerrada só para admin, obra sem acesso recusada, ordem inválida recusada', () => {
  const { data, ids } = withRows('A', 'B');
  data.users.find(u => u.id === 'user-2')!.role = 'planner';
  const reorder: Extract<Command, { type: 'reorder_commitments' }> = {
    type: 'reorder_commitments',
    workId: 'obra-1',
    weekStart: WEEK,
    ids: [ids[1], ids[0]],
  };
  assert.throws(() => run(data, reorder, 'user-2', '2026-10-09'), /foi encerrada/);
  data.users.find(u => u.id === 'user-1')!.role = 'admin';
  run(data, reorder, 'user-1', '2026-10-09');
  assert.deepEqual(sheet(data), ['B', 'A']);
  assert.throws(() => run(data, { ...reorder, workId: 'obra-2' }, 'user-2'), /acesso/);
  assert.throws(() => run(data, { ...reorder, ids: [1, 2] as unknown as string[] }), /Ordem das linhas inválida/);
  assert.throws(() => run(data, { type: 'reorder_commitments', workId: 'obra-1', weekStart: WEEK, ids: [ids[0]] }, 'user-3'), /consulta/);
});

test('linha que muda de semana perde a posição e entra embaixo da semana nova', () => {
  const { data, ids } = withRows('A', 'B');
  const next = '2026-10-05';
  const other = create(data, 'X', { weekStart: next });
  run(data, { type: 'reorder_commitments', workId: 'obra-1', weekStart: next, ids: [other] });
  run(data, { type: 'reorder_commitments', workId: 'obra-1', weekStart: WEEK, ids: [ids[1], ids[0]] });
  const row = data.commitments.find(c => c.id === ids[1])!;
  run(data, {
    type: 'update_commitment',
    commitmentId: row.id,
    name: row.name,
    supplier: row.supplier,
    weekStart: next,
    startDate: next,
    endDate: next,
  });
  assert.equal(data.commitments.find(c => c.id === ids[1])!.order, undefined);
  assert.deepEqual(sheet(data, next), ['X', 'B']);
  // Editar sem trocar de semana mantém a posição.
  const a = data.commitments.find(c => c.id === ids[0])!;
  run(data, { type: 'update_commitment', commitmentId: a.id, name: 'A2', supplier: '', weekStart: WEEK, startDate: WEEK, endDate: WEEK });
  assert.equal(data.commitments.find(c => c.id === ids[0])!.order, 2);
});

test('recorte da leitura: arrastar lê a semana; inserir já lia a semana', () => {
  assert.deepEqual(commandScope({ type: 'reorder_commitments', workId: 'obra-1', weekStart: '2026-10-01', ids: [] }, ['obra-1']), {
    workIds: ['obra-1'],
    commitments: { weekStarts: [WEEK] },
  });
});

test('projeção na tela: arrastar muda na hora; inserir numera a semana como o servidor', () => {
  const { data, ids } = withRows('A', 'B', 'C');
  const planning = { data, today: '2026-10-02', wagons: [] };
  const reorder: Command = { type: 'reorder_commitments', workId: 'obra-1', weekStart: WEEK, ids: [ids[2], ids[0], ids[1]] };
  assert.equal(projectsBeforeServer(reorder), true);
  const moved = applyCommandLocally(planning, reorder, '', 'user-1', '2026-10-02T13:00:00.000Z')!;
  assert.deepEqual(sheet(moved.data), ['C', 'A', 'B']);
  assert.deepEqual(sheet(data), ['A', 'B', 'C'], 'a entrada não muda');

  const insert: Command = {
    type: 'create_commitment',
    workId: 'obra-1',
    name: 'N',
    weekStart: WEEK,
    responsibleId: 'user-1',
    beforeId: ids[1],
    order: ids,
  };
  const server = structuredClone(data);
  applyCommand(server, insert, { actorId: 'user-1', today: '2026-10-02', now: '2026-10-02T13:00:00.000Z', newId: () => 'novo' });
  const local = applyCommandLocally(planning, insert, 'novo', 'user-1', '2026-10-02T13:00:00.000Z')!;
  const positions = (d: typeof data) => d.commitments.map(c => [c.id, c.order]).sort();
  assert.deepEqual(positions(local.data), positions(server));
  assert.deepEqual(sheet(local.data), ['A', 'N', 'B', 'C']);
});

test('mergePinned: linha nova entra embaixo, a inserida entra no lugar mesmo na ordem classificada, a que saiu some', () => {
  assert.deepEqual(mergePinned(['c', 'b', 'a'], ['a', 'b', 'c', 'n']), ['c', 'b', 'a', 'n']);
  assert.deepEqual(mergePinned(['c', 'b', 'a'], ['a', 'n', 'b', 'c']), ['c', 'n', 'b', 'a']);
  assert.deepEqual(mergePinned(['c', 'b', 'a'], ['a', 'n', 'm', 'b']), ['n', 'm', 'b', 'a']);
  assert.deepEqual(mergePinned([], ['a', 'b']), ['a', 'b']);
});

test('banco: a posição vai e volta como order_index; sem a coluna (antes da 0036), a linha fica sem posição', () => {
  const { data, ids } = withRows('A', 'B');
  run(data, { type: 'reorder_commitments', workId: 'obra-1', weekStart: WEEK, ids: [ids[1], ids[0]] });
  const payload = planningDataToPayload(data);
  assert.deepEqual(
    payload.weekly_commitments.map(r => r.order_index),
    [2, 1],
  );
  const rows = { ...payload, history_events: [] } as unknown as Parameters<typeof rowsToPlanningData>[0];
  assert.deepEqual(
    rowsToPlanningData(rows).commitments.map(c => c.order),
    [2, 1],
  );
  const legacy = {
    ...rows,
    weekly_commitments: payload.weekly_commitments.map(({ order_index: _, ...rest }) => rest),
  } as unknown as Parameters<typeof rowsToPlanningData>[0];
  assert.deepEqual(
    rowsToPlanningData(legacy).commitments.map(c => c.order),
    [undefined, undefined],
  );
});

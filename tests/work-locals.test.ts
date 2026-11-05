import test from 'node:test';
import assert from 'node:assert/strict';
import { planLobCommand, type LobContext } from '../src/application/use-cases/lob-commands';
import { parseWorkLocalCommand, WORK_LOCAL_COMMANDS, workLocalsView } from '../src/application/use-cases/work-locals';
import { emptyLobData, type LobActivity, type LobData, type LobLocal } from '../src/domain/lob';

/* "Locais da obra" nas Configurações da obra (05/11/2026): a rota aberta a quem tem a obra só aceita os comandos do
 * cadastro de locais, pelas mesmas regras da Linha de Balanço. */

const W = 'obra-1';
const OLD = '2026-10-01T12:00:00.000Z';
let seq = 0;
const ctx: LobContext = { actorId: 'u1', now: '2026-11-05T12:00:00.000Z', today: '2026-11-05', newId: () => `id-${++seq}` };
const local = (id: string, name: string, orderIndex: number): LobLocal => ({
  id,
  workId: W,
  name,
  orderIndex,
  createdAt: OLD,
  updatedAt: OLD,
});
const block = (id: string, localId: string): LobActivity => ({
  id,
  workId: W,
  serviceId: 's1',
  localId,
  start: '2026-11-09',
  durationDays: 5,
  createdAt: OLD,
  updatedAt: OLD,
});
const data = (over: Partial<LobData> = {}): LobData => ({ ...emptyLobData(), ...over });

test('a rota das Configurações aceita os quatro comandos do cadastro de locais', () => {
  assert.deepEqual([...WORK_LOCAL_COMMANDS], ['create_locals', 'rename_local', 'reorder_locals', 'delete_local']);
  assert.deepEqual(parseWorkLocalCommand({ type: 'create_locals', workId: W, names: ['Térreo', ' 1º pavimento '] }), {
    type: 'create_locals',
    workId: W,
    names: ['Térreo', '1º pavimento'],
  });
  assert.equal(parseWorkLocalCommand({ type: 'rename_local', localId: 'l1', name: 'Cobertura' }).type, 'rename_local');
  assert.equal(parseWorkLocalCommand({ type: 'reorder_locals', workId: W, localIds: ['l2', 'l1'] }).type, 'reorder_locals');
  assert.equal(parseWorkLocalCommand({ type: 'delete_local', localId: 'l1' }).type, 'delete_local');
});

test('a rota das Configurações recusa os demais comandos da Linha de Balanço e entrada inválida', () => {
  assert.throws(
    () => parseWorkLocalCommand({ type: 'delete_activity', activityId: 'a1' }),
    /Nas Configurações da obra só se cadastram locais/,
  );
  assert.throws(() => parseWorkLocalCommand({ type: 'create_service', workId: W, name: 'Alvenaria' }), /só se cadastram locais/);
  assert.throws(() => parseWorkLocalCommand(null));
  assert.throws(() => parseWorkLocalCommand({ type: 'create_locals', workId: W, names: [] }), /ao menos um nome/);
  assert.throws(() => parseWorkLocalCommand({ type: 'rename_local', localId: '', name: 'X' }), /Local não informado/);
});

test('a vista dos locais vem de baixo para cima, com os blocos de cada local', () => {
  const view = workLocalsView(
    data({
      locals: [local('l3', 'Cobertura', 2), local('l1', 'Térreo', 0), local('l2', '1º pavimento', 1)],
      activities: [block('a1', 'l1'), block('a2', 'l1'), block('a3', 'l3')],
    }),
  );
  assert.deepEqual(
    view.locals.map(l => l.name),
    ['Térreo', '1º pavimento', 'Cobertura'],
  );
  assert.deepEqual(view.blocks, { l1: 2, l3: 1 });
  assert.deepEqual(workLocalsView(data()), { locals: [], blocks: {} });
});

test('as regras são as da Linha de Balanço: nome repetido e local com blocos são recusados', () => {
  const current = data({ locals: [local('l1', 'Térreo', 0)], activities: [block('a1', 'l1')] });
  const created = planLobCommand(current, parseWorkLocalCommand({ type: 'create_locals', workId: W, names: ['1º pavimento'] }), ctx);
  assert.equal(created.workId, W);
  assert.deepEqual(
    created.insert.locals.map(l => [l.name, l.orderIndex]),
    [['1º pavimento', 1]],
  );
  assert.throws(
    () => planLobCommand(current, parseWorkLocalCommand({ type: 'create_locals', workId: W, names: ['TÉRREO'] }), ctx),
    /já existe/i,
  );
  assert.throws(() => planLobCommand(current, parseWorkLocalCommand({ type: 'delete_local', localId: 'l1' }), ctx), /tem 1 bloco/);
  const free = data({ locals: [local('l1', 'Térreo', 0), local('l2', 'Cobertura', 1)], activities: [block('a1', 'l1')] });
  assert.deepEqual(planLobCommand(free, parseWorkLocalCommand({ type: 'delete_local', localId: 'l2' }), ctx).delete.locals, ['l2']);
});

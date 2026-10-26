import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommandLocally, projectsBeforeServer } from '../src/application/use-cases/local-apply';
import type { Planning } from '../src/application/use-cases/get-planning';
import type { Command } from '../src/application/use-cases/commands';
import type { WeeklyCommitment } from '../src/domain/entities';
import { createMockData } from '../src/mocks/planning';

const NOW = '2026-10-11T12:00:00.000Z';
const ACTOR = 'user-1';
const row: WeeklyCommitment = {
  id: 'c1',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  workId: 'obra-1',
  name: 'Alvenaria',
  supplier: 'SM MARTINS',
  weekStart: '2026-10-05',
  weekEnd: '2026-10-11',
  responsibleId: 'user-1',
  teamId: 'equipe-1',
  startDate: '2026-10-06',
  endDate: '2026-10-08',
  fulfilled: false,
  cause: 'Falta de Material',
  justification: 'Entrega atrasou',
  recordedAt: '2026-10-10T00:00:00.000Z',
  recordedBy: 'user-2',
};
function planning(): Planning {
  const data = createMockData();
  data.commitments = [row];
  return { data, today: '2026-10-11', wagons: [] };
}
/** Cópia profunda do estado antes, para comparar depois: a função nunca deve mexer na entrada. */
const snapshot = (p: Planning) => JSON.stringify(p);
const apply = (p: Planning, command: Command, id = 'novo') => applyCommandLocally(p, command, id, ACTOR, NOW);

test('create_commitment: linha nova com a semana canônica e datas padrão', () => {
  const before = planning();
  const frozen = snapshot(before);
  const next = apply(before, {
    type: 'create_commitment',
    workId: 'obra-1',
    name: '  Reboco ',
    weekStart: '2026-10-14', // quarta → segunda 12/10
    responsibleId: 'user-1',
    teamId: null,
    activityId: null,
  });
  assert.ok(next);
  assert.equal(snapshot(before), frozen);
  assert.notEqual(next, before);
  assert.notEqual(next.data, before.data);
  assert.equal(next.data.commitments.length, 2);
  const created = next.data.commitments[1];
  assert.equal(created.id, 'novo');
  assert.equal(created.name, 'Reboco');
  assert.equal(created.supplier, '');
  assert.equal(created.weekStart, '2026-10-12');
  assert.equal(created.weekEnd, '2026-10-18');
  assert.equal(created.startDate, '2026-10-12');
  assert.equal(created.endDate, '2026-10-12');
  assert.equal(created.teamId, undefined);
  assert.equal(created.activityId, undefined);
  assert.equal(created.createdAt, NOW);
  assert.equal(created.updatedAt, NOW);
  // Os demais dados são compartilhados, não copiados.
  assert.equal(next.data.teams, before.data.teams);
  assert.equal(next.wagons, before.wagons);
});
test('create_commitment: datas e fornecedor informados; id já presente não duplica', () => {
  const before = planning();
  const next = apply(before, {
    type: 'create_commitment',
    workId: 'obra-1',
    name: 'Pintura',
    supplier: ' ATR ',
    weekStart: '2026-10-12',
    responsibleId: 'user-1',
    teamId: 'equipe-2',
    activityId: 'a1',
    startDate: '2026-10-13',
    endDate: '2026-10-15',
  });
  assert.ok(next);
  const created = next.data.commitments[1];
  assert.deepEqual(
    [created.supplier, created.teamId, created.activityId, created.startDate, created.endDate],
    ['ATR', 'equipe-2', 'a1', '2026-10-13', '2026-10-15'],
  );
  assert.equal(
    apply(before, { type: 'create_commitment', workId: 'obra-1', name: 'X', weekStart: '2026-10-12', responsibleId: 'user-1' }, 'c1'),
    null,
  );
});
test('update_commitment: troca os campos da linha e mantém o apontamento', () => {
  const before = planning();
  const frozen = snapshot(before);
  const next = apply(before, {
    type: 'update_commitment',
    commitmentId: 'c1',
    name: ' Alvenaria 2 ',
    supplier: '',
    teamId: null,
    weekStart: '2026-10-15',
    startDate: '2026-10-12',
    endDate: '2026-10-17',
  });
  assert.ok(next);
  assert.equal(snapshot(before), frozen);
  const updated = next.data.commitments[0];
  assert.notEqual(updated, row);
  assert.equal(updated.name, 'Alvenaria 2');
  assert.equal(updated.supplier, '');
  assert.equal(updated.teamId, undefined);
  assert.equal(updated.weekStart, '2026-10-12');
  assert.equal(updated.weekEnd, '2026-10-18');
  assert.equal(updated.startDate, '2026-10-12');
  assert.equal(updated.endDate, '2026-10-17');
  assert.equal(updated.updatedAt, NOW);
  assert.equal(updated.createdAt, row.createdAt);
  assert.equal(updated.fulfilled, false);
  assert.equal(updated.cause, 'Falta de Material');
  assert.equal(
    apply(before, {
      type: 'update_commitment',
      commitmentId: 'nada',
      name: 'X',
      supplier: '',
      weekStart: '2026-10-12',
      startDate: '2026-10-12',
      endDate: '2026-10-12',
    }),
    null,
  );
});
test('record_fulfillment: não cumprido guarda a causa; cumprido limpa a causa', () => {
  const before = planning();
  const frozen = snapshot(before);
  const no = apply(before, {
    type: 'record_fulfillment',
    commitmentId: 'c1',
    fulfilled: false,
    cause: 'Intempéries',
    justification: ' Choveu ',
  });
  assert.ok(no);
  assert.equal(snapshot(before), frozen);
  const noRow = no.data.commitments[0];
  assert.deepEqual(
    [noRow.fulfilled, noRow.cause, noRow.justification, noRow.recordedAt, noRow.recordedBy, noRow.updatedAt],
    [false, 'Intempéries', 'Choveu', NOW, ACTOR, NOW],
  );
  const yes = apply(before, {
    type: 'record_fulfillment',
    commitmentId: 'c1',
    fulfilled: true,
    cause: 'Intempéries',
    justification: '   ',
  });
  assert.ok(yes);
  const yesRow = yes.data.commitments[0];
  assert.deepEqual([yesRow.fulfilled, yesRow.cause, yesRow.justification, yesRow.recordedBy], [true, undefined, undefined, ACTOR]);
});
test('clear_fulfillment: apaga o apontamento inteiro', () => {
  const before = planning();
  const frozen = snapshot(before);
  const next = apply(before, { type: 'clear_fulfillment', commitmentId: 'c1' } as unknown as Command);
  assert.ok(next);
  assert.equal(snapshot(before), frozen);
  const cleared = next.data.commitments[0];
  assert.deepEqual(
    [cleared.fulfilled, cleared.cause, cleared.justification, cleared.recordedAt, cleared.recordedBy, cleared.updatedAt],
    [undefined, undefined, undefined, undefined, undefined, NOW],
  );
  assert.equal(cleared.name, 'Alvenaria');
});
test('delete_commitment: remove a linha; inexistente devolve null', () => {
  const before = planning();
  const frozen = snapshot(before);
  const next = apply(before, { type: 'delete_commitment', commitmentId: 'c1' });
  assert.ok(next);
  assert.equal(snapshot(before), frozen);
  assert.deepEqual(next.data.commitments, []);
  assert.equal(apply(before, { type: 'delete_commitment', commitmentId: 'nada' }), null);
});
test('create_team: equipe nova com o id do servidor', () => {
  const before = planning();
  const frozen = snapshot(before);
  const next = apply(
    before,
    { type: 'create_team', workId: 'obra-1', company: ' ATR ', name: ' Hidráulica ', weeklyCapacity: 2 },
    'equipe-9',
  );
  assert.ok(next);
  assert.equal(snapshot(before), frozen);
  assert.equal(next.data.teams.length, before.data.teams.length + 1);
  const team = next.data.teams.at(-1)!;
  assert.deepEqual(team, {
    id: 'equipe-9',
    createdAt: NOW,
    updatedAt: NOW,
    workId: 'obra-1',
    company: 'ATR',
    name: 'Hidráulica',
    weeklyCapacity: 2,
  });
  assert.equal(next.data.commitments, before.data.commitments);
  assert.equal(apply(before, { type: 'create_team', workId: 'obra-1', company: 'A', name: 'B', weeklyCapacity: 1 }, 'equipe-1'), null);
});
test('comandos fora do curto prazo não têm projeção local', () => {
  const before = planning();
  assert.equal(apply(before, { type: 'create_location', workId: 'obra-1', name: 'Torre' }), null);
  assert.equal(apply(before, { type: 'update_team', teamId: 'equipe-1', company: 'A', name: 'B', weeklyCapacity: 1 }), null);
});
test('record_fulfillments: projeta o lote inteiro, ou nada se uma linha não existe', () => {
  const before = planning();
  const second: WeeklyCommitment = { ...row, id: 'c2', name: 'Reboco', fulfilled: undefined, cause: undefined, justification: undefined };
  before.data.commitments = [row, second];
  const frozen = snapshot(before);
  const next = apply(before, {
    type: 'record_fulfillments',
    items: [
      { commitmentId: 'c1', fulfilled: true, justification: ' feito ' },
      { commitmentId: 'c2', fulfilled: false, cause: 'Intempéries', justification: 'Chuva' },
    ],
  });
  assert.ok(next);
  assert.equal(snapshot(before), frozen);
  assert.deepEqual(
    next.data.commitments.map(c => [c.fulfilled, c.cause, c.justification, c.recordedBy, c.updatedAt]),
    [
      [true, undefined, 'feito', ACTOR, NOW],
      [false, 'Intempéries', 'Chuva', ACTOR, NOW],
    ],
  );
  assert.equal(apply(before, { type: 'record_fulfillments', items: [{ commitmentId: 'c9', fulfilled: true }] }), null);
  assert.equal(apply(before, { type: 'record_fulfillments', items: [] }), null);
});
test('projectsBeforeServer: só o que muda linha existente é projetado antes da resposta', () => {
  assert.equal(projectsBeforeServer({ type: 'record_fulfillment', commitmentId: 'c1', fulfilled: true }), true);
  assert.equal(projectsBeforeServer({ type: 'record_fulfillments', items: [] }), true);
  assert.equal(projectsBeforeServer({ type: 'clear_fulfillment', commitmentId: 'c1' }), true);
  assert.equal(projectsBeforeServer({ type: 'delete_commitment', commitmentId: 'c1' }), true);
  assert.equal(
    projectsBeforeServer({ type: 'create_commitment', workId: 'obra-1', name: 'x', weekStart: '2026-10-05', responsibleId: 'u' }),
    false,
  );
  assert.equal(projectsBeforeServer({ type: 'create_team', workId: 'obra-1', company: 'A', name: 'B', weeklyCapacity: 1 }), false);
});
test('record_fulfillments: item com `clear` projeta a linha limpa', () => {
  const before = planning();
  const next = apply(before, { type: 'record_fulfillments', items: [{ commitmentId: 'c1', clear: true }] });
  assert.ok(next);
  const c = next.data.commitments[0];
  assert.deepEqual(
    [c.fulfilled, c.cause, c.justification, c.recordedAt, c.recordedBy, c.updatedAt],
    [undefined, undefined, undefined, undefined, undefined, NOW],
  );
});

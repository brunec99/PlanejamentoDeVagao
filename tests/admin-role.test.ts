import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type CommandContext } from '../src/application/use-cases/commands';
import { actsAsManager } from '../src/domain/rules';
import { createMockData } from '../src/mocks/planning';

let id = 0;
const context = (actorId: string): CommandContext => ({
  actorId,
  today: '2026-09-08',
  now: '2026-09-08T12:00:00Z',
  newId: () => `adm-${++id}`,
});
const withAdmin = () => {
  const d = createMockData();
  d.users.push({ id: 'admin-1', createdAt: '', updatedAt: '', name: 'Admin', role: 'admin', workIds: ['obra-1', 'obra-2'] });
  return d;
};

test('Admin herda o Gestor; planejador e consulta não', () => {
  assert.deepEqual(
    ['admin', 'manager', 'planner', 'viewer', undefined].map(r => actsAsManager(r as never)),
    [true, true, false, false, false],
  );
});

test('Admin cadastra obra e passa a ter acesso a ela', () => {
  const d = withAdmin();
  const workId = applyCommand(d, { type: 'create_work', name: 'Residencial Novo', code: 'RN-01' }, context('admin-1'));
  assert.ok(d.works.some(w => w.id === workId && w.code === 'RN-01'));
  assert.ok(d.users.find(u => u.id === 'admin-1')!.workIds.includes(workId));
});

test('planejador continua sem cadastrar obra', () => {
  const d = withAdmin();
  assert.throws(() => applyCommand(d, { type: 'create_work', name: 'X', code: 'X-01' }, context('user-2')), /gestor ou admin/);
});

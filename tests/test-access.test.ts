import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockData } from '../src/mocks/planning';
import { applyCommand, type CommandContext } from '../src/application/use-cases/commands';
import { planningDataToPayload, rowsToPlanningData, type Rows } from '../src/infrastructure/repositories/supabase/mappers';

/* Permissão de teste do médio prazo (14/10/2026): só o admin liga e desliga; vai e volta do banco
 * pela coluna `test_access` (migração 0030) e, sem a coluna, lê como desligada. */

const context = (actorId: string): CommandContext => ({ actorId, today: '2026-10-14', now: '2026-10-14T12:00:00Z', newId: () => 'id' });

test('admin liga e desliga a permissão de teste; os demais papéis são recusados', () => {
  const data = createMockData();
  // Os dados de exemplo não têm admin: a gestora vira admin para o teste.
  const admin = data.users.find(u => u.id === 'user-1')!;
  admin.role = 'admin';
  const other = data.users.find(u => u.id === 'user-2')!;
  applyCommand(data, { type: 'set_test_access', userId: other.id, enabled: true }, context(admin.id));
  assert.equal(other.testAccess, true);
  applyCommand(data, { type: 'set_test_access', userId: other.id, enabled: false }, context(admin.id));
  assert.equal(other.testAccess, false);
  assert.throws(
    () => applyCommand(data, { type: 'set_test_access', userId: admin.id, enabled: true }, context(other.id)),
    /administradores/,
  );
  assert.throws(
    () => applyCommand(data, { type: 'set_test_access', userId: 'ninguem', enabled: true }, context(admin.id)),
    /não encontrado/,
  );
  assert.throws(
    () => applyCommand(data, { type: 'set_test_access', userId: other.id, enabled: 'sim' as unknown as boolean }, context(admin.id)),
    /ligada ou desligada/,
  );
});

test('a permissão vai ao banco como test_access e volta; coluna ausente lê como desligada', () => {
  const data = createMockData();
  const user = data.users[0];
  user.testAccess = true;
  const payload = planningDataToPayload(data) as unknown as Rows;
  const row = payload.profiles.find(r => r.id === user.id)!;
  assert.equal(row.test_access, true);
  assert.equal(rowsToPlanningData(payload).users.find(u => u.id === user.id)!.testAccess, true);
  delete row.test_access;
  assert.equal(rowsToPlanningData(payload).users.find(u => u.id === user.id)!.testAccess, false);
});

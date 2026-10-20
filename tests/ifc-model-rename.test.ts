import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockData } from '../src/mocks/planning';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { isCommandAllowed } from '../src/application/module-access';

/* Renomear modelo IFC (15/10/2026): nome e disciplina mudam; versões e arquivos ficam como estão. */

const run = (data: ReturnType<typeof createMockData>, command: Command, actorId = 'user-1') =>
  applyCommand(data, command, { actorId, today: '2026-10-15', now: '2026-10-15T12:00:00Z', newId: () => crypto.randomUUID() });

test('renomeia e corrige a disciplina; recusa nome vazio, repetido na obra e perfil de consulta', () => {
  const data = createMockData();
  const a = run(data, { type: 'create_ifc_model', workId: 'obra-1', name: 'MAR-ELE-PR-MOD-prumadas', discipline: 'Arquitetura' });
  run(data, { type: 'create_ifc_model', workId: 'obra-1', name: 'MAR-HID-LO-MOD', discipline: 'Hidrossanitário' });
  run(data, { type: 'update_ifc_model', modelId: a, name: '  Elétrica · prumadas  ', discipline: 'Elétrica' });
  const model = data.ifcModels.find(m => m.id === a)!;
  assert.equal(model.name, 'Elétrica · prumadas');
  assert.equal(model.discipline, 'Elétrica');
  assert.throws(() => run(data, { type: 'update_ifc_model', modelId: a, name: ' ', discipline: 'Elétrica' }), /Nome do modelo/);
  assert.throws(() => run(data, { type: 'update_ifc_model', modelId: a, name: 'mar-hid-lo-mod', discipline: 'Elétrica' }), /Já existe/);
  assert.throws(() => run(data, { type: 'update_ifc_model', modelId: 'x', name: 'A', discipline: 'B' }), /não encontrado/);
  assert.throws(() => run(data, { type: 'update_ifc_model', modelId: a, name: 'Outro', discipline: 'Elétrica' }, 'user-3'), /consulta/);
  // Quem tem o módulo IFC liberado também renomeia.
  assert.equal(isCommandAllowed('update_ifc_model', { developer: false, modules: ['ifc'] }), true);
  assert.equal(isCommandAllowed('update_ifc_model', { developer: false, modules: ['medio-prazo'] }), false);
});

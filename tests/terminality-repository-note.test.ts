import test from 'node:test';
import assert from 'node:assert/strict';
import { terminalityFromRow, terminalityToRow } from '../src/infrastructure/repositories/supabase/terminality-repository';
import type { TerminalityItem } from '../src/domain/terminality';

/* "Como foi corrigido" (migração 0034): a coluna só entra na gravação quando há texto a gravar ou a
 * limpar, para o resto da terminalidade seguir gravando num banco ainda sem a migração. */

const item: TerminalityItem = {
  id: 'i1',
  workId: 'w1',
  floorId: 'f1',
  description: 'Rejunte',
  observedOn: '2026-10-01',
  status: 'open',
  createdBy: 'u1',
  createdAt: '2026-10-01T12:00:00Z',
  updatedAt: '2026-10-01T12:00:00Z',
};

test('sem texto, a linha não leva a coluna; com texto ou limpeza, leva', () => {
  assert.equal('resolution_note' in terminalityToRow.items(item), false);
  assert.equal(
    terminalityToRow.items({ ...item, status: 'resolved', correctedOn: '2026-10-02', resolutionNote: 'Refeito' }).resolution_note,
    'Refeito',
  );
  assert.equal(terminalityToRow.items({ ...item, resolutionNote: undefined }).resolution_note, null);
});

test('na leitura, só a linha com texto ganha o campo', () => {
  const row = terminalityToRow.items(item);
  assert.equal('resolutionNote' in terminalityFromRow.items({ ...row, resolution_note: null }), false);
  assert.equal('resolutionNote' in terminalityFromRow.items(row), false);
  assert.equal(terminalityFromRow.items({ ...row, resolution_note: 'Refeito' }).resolutionNote, 'Refeito');
});

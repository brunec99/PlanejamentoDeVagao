import test from 'node:test';
import assert from 'node:assert/strict';
import { rowStepFor, siblingRowIndex } from '../src/modules/curto-prazo/row-navigation';

/* Teclado da planilha do curto prazo (26/10/2026): Enter desce, Shift+Enter sobe, setas só em campo de texto. */

test('linha vizinha na ordem da tela, sem passar das pontas', () => {
  const ids = ['a', 'b', 'c'];
  assert.equal(siblingRowIndex(ids, 'a', 1), 1);
  assert.equal(siblingRowIndex(ids, 'c', -1), 1);
  assert.equal(siblingRowIndex(ids, 'c', 1), -1);
  assert.equal(siblingRowIndex(ids, 'a', -1), -1);
  assert.equal(siblingRowIndex(ids, 'zzz', 1), -1);
});

test('Enter desce e Shift+Enter sobe em qualquer célula; setas só onde não trocam o valor', () => {
  assert.equal(rowStepFor('Enter', false, false), 1);
  assert.equal(rowStepFor('Enter', true, false), -1);
  assert.equal(rowStepFor('ArrowDown', false, true), 1);
  assert.equal(rowStepFor('ArrowUp', false, true), -1);
  assert.equal(rowStepFor('ArrowDown', false, false), null);
  assert.equal(rowStepFor('Tab', false, true), null);
  assert.equal(rowStepFor('a', false, true), null);
});

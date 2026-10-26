import test from 'node:test';
import assert from 'node:assert/strict';
import { rowAtY, rowsBetween } from '../src/modules/curto-prazo/fill-handle';

const ids = ['a', 'b', 'c', 'd', 'e'];

test('Arrastar para baixo devolve as linhas abaixo da origem até o alvo, inclusive', () => {
  assert.deepEqual(rowsBetween(ids, 'b', 'd'), ['c', 'd']);
  assert.deepEqual(rowsBetween(ids, 'a', 'e'), ['b', 'c', 'd', 'e']);
  assert.deepEqual(rowsBetween(ids, 'd', 'e'), ['e']);
});

test('Arrastar para cima devolve as linhas acima, mantendo a ordem da tela', () => {
  assert.deepEqual(rowsBetween(ids, 'd', 'b'), ['b', 'c']);
  assert.deepEqual(rowsBetween(ids, 'e', 'a'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(rowsBetween(ids, 'b', 'a'), ['a']);
});

test('Alvo igual à origem não tem linhas alvo', () => {
  assert.deepEqual(rowsBetween(ids, 'c', 'c'), []);
});

test('Id fora da ordem (origem ou alvo) não tem linhas alvo', () => {
  assert.deepEqual(rowsBetween(ids, 'x', 'c'), []);
  assert.deepEqual(rowsBetween(ids, 'c', 'x'), []);
  assert.deepEqual(rowsBetween([], 'a', 'b'), []);
});

// Três linhas de 20 px com um vão de 4 px entre a 2ª e a 3ª (espaçamento de borda).
const rows = [
  { id: 'a', top: 100, bottom: 120 },
  { id: 'b', top: 120, bottom: 140 },
  { id: 'c', top: 144, bottom: 164 },
];

test('Ponteiro dentro de uma linha devolve essa linha', () => {
  assert.equal(rowAtY(rows, 110), 'a');
  assert.equal(rowAtY(rows, 130), 'b');
  assert.equal(rowAtY(rows, 150), 'c');
});

test('Acima da primeira linha vale a primeira; abaixo da última, a última', () => {
  assert.equal(rowAtY(rows, 0), 'a');
  assert.equal(rowAtY(rows, 99.5), 'a');
  assert.equal(rowAtY(rows, 164.5), 'c');
  assert.equal(rowAtY(rows, 9999), 'c');
});

test('Na fronteira entre linhas contíguas vale a de cima; num vão, a mais próxima (empate: a de cima)', () => {
  // Fronteira compartilhada (bottom de a == top de b): a de cima fica com o ponto.
  assert.equal(rowAtY(rows, 120), 'a');
  // Vão de 140 a 144: metade de baixo vai para c, metade de cima (e o meio exato) fica com b.
  assert.equal(rowAtY(rows, 141), 'b');
  assert.equal(rowAtY(rows, 142), 'b');
  assert.equal(rowAtY(rows, 143), 'c');
});

test('Sem linhas, não há linha sob o ponteiro', () => {
  assert.equal(rowAtY([], 10), undefined);
});

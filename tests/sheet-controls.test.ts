import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSelection, matchOptions, normalizeText, resolveTyped } from '../src/modules/curto-prazo/sheet-controls';

test('normalização ignora acentos, caixa e espaços repetidos', () => {
  assert.equal(normalizeText('  Elétrica   PREDIAL '), 'eletrica predial');
});

test('busca do combo é "contém" sem acentos e devolve tudo quando vazia', () => {
  const options = ['Alvenaria', 'Instalação elétrica', 'Pintura'];
  assert.deepEqual(matchOptions(options, 'ELETR'), ['Instalação elétrica']);
  assert.deepEqual(matchOptions(options, '  '), options);
});

test('texto digitado reaproveita a opção equivalente e só cria o que não existe', () => {
  const options = ['Construtora Ávila', 'Pinturas Sul'];
  assert.deepEqual(resolveTyped(' construtora  avila ', options), { value: 'Construtora Ávila', isNew: false });
  assert.deepEqual(resolveTyped('  Nova   Empresa ', options), { value: 'Nova Empresa', isNew: true });
  assert.equal(resolveTyped('   ', options), null);
});

test('marcar todos os valores remove o filtro; seleção parcial vira conjunto próprio', () => {
  assert.equal(filterSelection(['', 'A', 'B'], new Set(['', 'A', 'B'])), undefined);
  const checked = new Set(['A']);
  const next = filterSelection(['', 'A', 'B'], checked);
  assert.deepEqual([...next!], ['A']);
  assert.notEqual(next, checked);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  floorNames,
  missingNames,
  nameKey,
  parseFloorNumber,
  parseNameList,
  planUnitsForFloors,
  previewNames,
  unitNames,
} from '../src/modules/configuracoes/terminality-generator';

test('gera pavimentos do 1° ao 20° com o sufixo padrão', () => {
  const names = floorNames({ from: 1, to: 20 });
  assert.equal(names.length, 20);
  assert.equal(names[0], '1° pavto');
  assert.equal(names[19], '20° pavto');
});

test('extras entram antes e depois, de baixo para cima', () => {
  assert.deepEqual(floorNames({ from: 1, to: 2, extras: { before: ['Garagem', 'Térreo'], after: ['Cobertura'] } }), [
    'Garagem',
    'Térreo',
    '1° pavto',
    '2° pavto',
    'Cobertura',
  ]);
  assert.deepEqual(floorNames({ from: 3, to: 3, suffix: 'º Pavimento' }), ['3º Pavimento']);
});

test('sequência de pavimentos inválida explica o problema', () => {
  assert.throws(() => floorNames({ from: 5, to: 1 }), RangeError);
  assert.throws(() => floorNames({ from: 1.5, to: 3 }), RangeError);
  assert.throws(() => floorNames({ from: 1, to: 500 }), /no máximo/);
});

test('unidades pelo número do pavimento', () => {
  assert.deepEqual(unitNames({ floorNumber: 4, from: 1, to: 4 }), ['401', '402', '403', '404']);
  assert.deepEqual(unitNames({ floorNumber: 12, from: 1, to: 2 }), ['1201', '1202']);
  assert.deepEqual(unitNames({ floorNumber: 3, from: 9, to: 11 }), ['309', '310', '311']);
  assert.deepEqual(unitNames({ floorNumber: 2, from: 1, to: 2, pad: 1 }), ['21', '22']);
});

test('unidades não cabem no número de dígitos escolhido', () => {
  assert.throws(() => unitNames({ floorNumber: 4, from: 1, to: 120 }), /no máximo até 99/);
  assert.throws(() => unitNames({ floorNumber: -1, from: 1, to: 4 }), RangeError);
});

test('lista livre: separa, apara e tira repetidos', () => {
  assert.deepEqual(parseNameList('401, 402; 403\n404\n\n 402 ,405\t406'), ['401', '402', '403', '404', '405', '406']);
  assert.deepEqual(parseNameList('Hall, Escada\nhall'), ['Hall', 'Escada']);
});

test('lista de pavimentos usa só a quebra de linha', () => {
  assert.deepEqual(parseNameList('Térreo\n1° pavto, ala A\n  terreo  \r\nCobertura', { lines: true }), [
    'Térreo',
    '1° pavto, ala A',
    'Cobertura',
  ]);
});

test('nomes comparados sem acento, sem caixa e com espaços normalizados', () => {
  assert.equal(nameKey('  PINTÚRA  '), nameKey('pintura'));
  assert.equal(nameKey('4°   pavto'), nameKey('4° Pavto'));
  assert.deepEqual(missingNames(['A/C', 'pintura'], ['A/C', 'RI', 'PINTURA']), ['RI']);
});

test('número do pavimento no nome', () => {
  assert.equal(parseFloorNumber('4° pavto'), 4);
  assert.equal(parseFloorNumber('4º Pavimento'), 4);
  assert.equal(parseFloorNumber('4 pav'), 4);
  assert.equal(parseFloorNumber('12° pavto'), 12);
  assert.equal(parseFloorNumber('Pavimento 7'), 7);
  assert.equal(parseFloorNumber('Térreo'), null);
  assert.equal(parseFloorNumber('Cobertura'), null);
});

test('mesmo padrão em todos os pavimentos, pulando os sem número e os já completos', () => {
  const floors = [
    { id: 't', name: 'Térreo' },
    { id: 'p1', name: '1° pavto' },
    { id: 'p2', name: '2° pavto' },
    { id: 'p3', name: '3° pavto' },
  ];
  const existing = new Map([
    ['p2', ['201']],
    ['p3', ['301', '302']],
  ]);
  assert.deepEqual(planUnitsForFloors(floors, existing, { from: 1, to: 2 }), [
    { floorId: 't', floorName: 'Térreo', names: [], skipped: 'sem-numero' },
    { floorId: 'p1', floorName: '1° pavto', names: ['101', '102'] },
    { floorId: 'p2', floorName: '2° pavto', names: ['202'] },
    { floorId: 'p3', floorName: '3° pavto', names: [], skipped: 'completo' },
  ]);
});

test('prévia curta de listas longas', () => {
  assert.equal(previewNames(['401', '402']), '401, 402');
  assert.equal(previewNames(['401', '402', '403', '404']), '401, 402, 403, 404');
  assert.equal(previewNames(['1', '2', '3', '4', '5']), '1, 2, 3 … 5');
});

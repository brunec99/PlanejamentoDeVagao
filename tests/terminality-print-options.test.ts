import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrintParams, printSearchParams } from '../src/modules/terminalidade/print-options';
import { DEFAULT_FILTERS } from '../src/modules/terminalidade/terminality-view';

const roundTrip = (params: URLSearchParams) => parsePrintParams(Object.fromEntries(params));

test('opções do PDF vão e voltam pela URL', () => {
  const options = {
    filters: { ...DEFAULT_FILTERS, situation: 'all' as const, floorId: 'f4', contractor: 'RC Pinturas', search: 'rejunte' },
    sort: { column: 'observacao' as const, dir: 'desc' as const },
    grouping: 'empreiteiro' as const,
    photos: false,
    pageBreak: true,
  };
  const params = printSearchParams(options);
  assert.equal(params.get('terceiro'), 'RC Pinturas');
  assert.equal(params.has('apto'), false);
  assert.deepEqual(roundTrip(params), options);
});

test('URL sem opções ou com valores estranhos vira o padrão', () => {
  assert.deepEqual(parsePrintParams({}), {
    filters: DEFAULT_FILTERS,
    sort: undefined,
    grouping: 'pavimento',
    photos: true,
    pageBreak: true,
  });
  const odd = parsePrintParams({ situacao: 'x', ordem: 'nada', agrupar: 'y', sentido: 'z' });
  assert.equal(odd.filters.situation, 'open');
  assert.equal(odd.sort, undefined);
  assert.equal(odd.grouping, 'pavimento');
  assert.deepEqual(parsePrintParams({ ordem: 'tipo', sentido: ['desc', 'asc'] }).sort, { column: 'tipo', dir: 'desc' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { initialGrouping, parsePrintParams, printSearchParams, type SafetyPrintOptions } from '../src/modules/seguranca/print-options';
import { DEFAULT_FILTERS } from '../src/modules/seguranca/safety-view';

/** Como a página recebe a URL: chave repetida vira lista. */
function asRaw(params: URLSearchParams) {
  const raw: Record<string, string | string[]> = {};
  for (const [key, value] of params) raw[key] = key in raw ? ([] as string[]).concat(raw[key], value) : value;
  return raw;
}

test('opções do PDF da segurança vão e voltam pela URL', () => {
  const options: SafetyPrintOptions = {
    filters: {
      ...DEFAULT_FILTERS,
      situation: 'all',
      typeIds: ['t-periferica', 't-linha-vida'],
      consequences: ['Morte', 'Autuação/Multa'],
      probabilities: ['Provável'],
      locations: ['2º pavimento', '__vazio__'],
      search: 'guarda-corpo',
    },
    sort: { column: 'consequence', dir: 'desc' },
    grouping: 'local',
    groups: ['2º pavimento', '__vazio__'],
    photos: false,
    pageBreak: true,
  };
  const params = printSearchParams(options);
  assert.deepEqual(params.getAll('tipo'), ['t-periferica', 't-linha-vida']);
  assert.deepEqual(params.getAll('consequencia'), ['Morte', 'Autuação/Multa']);
  assert.equal(params.get('busca'), 'guarda-corpo');
  assert.equal(params.has('quebra'), false);
  assert.deepEqual(params.getAll('local'), ['2º pavimento', '__vazio__']);
  assert.deepEqual(params.getAll('grupo'), ['2º pavimento', '__vazio__']);
  assert.deepEqual(parsePrintParams(asRaw(params)), options);
});

test('filtros vazios não vão para a URL', () => {
  const params = printSearchParams({ filters: DEFAULT_FILTERS, grouping: 'tipo', photos: true, pageBreak: true });
  assert.deepEqual([...params.keys()], ['agrupar', 'situacao']);
  assert.deepEqual(parsePrintParams(asRaw(params)), {
    filters: DEFAULT_FILTERS,
    sort: undefined,
    grouping: 'tipo',
    groups: undefined,
    photos: true,
    pageBreak: true,
  });
});

test('URL sem opções ou com valores estranhos vira o padrão', () => {
  assert.deepEqual(parsePrintParams({}), {
    filters: DEFAULT_FILTERS,
    sort: undefined,
    grouping: 'tipo',
    groups: undefined,
    photos: true,
    pageBreak: true,
  });
  const odd = parsePrintParams({
    situacao: 'x',
    ordem: 'nada',
    agrupar: 'pavimento',
    sentido: 'z',
    consequencia: ['Morte', 'Grave', 'Morte'],
    probabilidade: 'Talvez',
  });
  assert.equal(odd.filters.situation, DEFAULT_FILTERS.situation);
  assert.equal(odd.sort, undefined);
  assert.equal(odd.grouping, 'tipo');
  // Consequência fora da lista some, e a repetida entra uma vez.
  assert.deepEqual(odd.filters.consequences, ['Morte']);
  assert.deepEqual(odd.filters.probabilities, []);
  assert.deepEqual(parsePrintParams({ ordem: 'days', sentido: ['desc', 'asc'] }).sort, { column: 'days', dir: 'desc' });
  assert.deepEqual(parsePrintParams({ ordem: 'observedOn' }).sort, { column: 'observedOn', dir: 'asc' });
  assert.equal(parsePrintParams({ fotos: '0', quebra: '0' }).photos, false);
  assert.equal(parsePrintParams({ fotos: '0', quebra: '0' }).pageBreak, false);
});

test('agrupar por consequência e um grupo só vão pela URL como lista', () => {
  const parsed = parsePrintParams({ agrupar: 'consequencia', grupo: 'Morte', local: 'canteiro' });
  assert.equal(parsed.grouping, 'consequencia');
  assert.deepEqual(parsed.groups, ['Morte']);
  assert.deepEqual(parsed.filters.locations, ['canteiro']);
});

test('a janela abre agrupada pelo filtro da lista', () => {
  assert.equal(initialGrouping(DEFAULT_FILTERS), 'tipo');
  assert.equal(initialGrouping({ ...DEFAULT_FILTERS, typeIds: ['t1'], locations: ['canteiro'] }), 'tipo');
  assert.equal(initialGrouping({ ...DEFAULT_FILTERS, locations: ['canteiro'], consequences: ['Morte'] }), 'local');
  assert.equal(initialGrouping({ ...DEFAULT_FILTERS, consequences: ['Morte'], probabilities: ['Rara'] }), 'consequencia');
  assert.equal(initialGrouping({ ...DEFAULT_FILTERS, probabilities: ['Rara'], search: 'andaime' }), 'tipo');
});

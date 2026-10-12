import test from 'node:test';
import assert from 'node:assert/strict';
import {
  labelFromAddress,
  parseCoordinates,
  searchAddresses,
  toPlaceOptions,
} from '../src/infrastructure/integrations/geocoding/nominatim';

const row = {
  display_name: 'Rua Maranhão, Portão, Curitiba, Paraná, Região Sul, 80610-140, Brasil',
  lat: '-25.4702298',
  lon: '-49.2854648',
  address: {
    road: 'Rua Maranhão',
    house_number: '2176',
    suburb: 'Portão',
    city: 'Curitiba',
    state: 'Paraná',
    'ISO3166-2-lvl4': 'BR-PR',
    postcode: '80610-140',
  },
};

test('O rótulo sai no padrão brasileiro: rua e número, bairro, cidade e UF, com o CEP', () => {
  assert.equal(labelFromAddress(row), 'Rua Maranhão, 2176 – Portão, Curitiba – PR (80610-140)');
  assert.equal(labelFromAddress({ display_name: 'Só o nome', lat: '1', lon: '2' }), 'Só o nome');
  assert.equal(labelFromAddress({ address: { town: 'Sorocaba', state: 'São Paulo' } }), 'Sorocaba – São Paulo');
});

test('Opções: coordenadas válidas, sem repetir o mesmo rótulo', () => {
  const places = toPlaceOptions([row, { ...row, lat: '-25.47' }, { ...row, lat: 'x' }]);
  assert.equal(places.length, 1);
  assert.deepEqual([places[0].latitude, places[0].longitude], [-25.4702298, -49.2854648]);
  assert.equal(places[0].name, row.display_name);
});

test('Coordenadas coladas viram uma opção direta; texto de endereço não', () => {
  assert.deepEqual(parseCoordinates('-25.4284, -49.2733')?.label, 'Coordenadas -25.4284, -49.2733');
  assert.equal(parseCoordinates('-25,4284; -49,2733')?.latitude, -25.4284);
  assert.equal(parseCoordinates('https://www.google.com/maps/@-25.4284,-49.2733,17z')?.longitude, -49.2733);
  assert.equal(parseCoordinates('Rua 15, 230'), null);
  assert.equal(parseCoordinates('Curitiba'), null);
  assert.equal(parseCoordinates('95, 200'), null, 'fora da faixa');
});

test('A busca pede ao Nominatim com identificação e país, e guarda o resultado', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(url));
    assert.match(String((init?.headers as Record<string, string>)['User-Agent']), /Obra360/);
    return new Response(JSON.stringify([row]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const first = await searchAddresses('Rua Maranhão, 2176 - Portão, Curitiba - PR', fetchImpl);
  const second = await searchAddresses('rua maranhão, 2176 - portão, curitiba - pr', fetchImpl);
  assert.equal(first.length, 1);
  assert.equal(second, first, 'mesma consulta (sem diferença de caixa) vem do cache');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /countrycodes=br/);
  assert.match(calls[0], /addressdetails=1/);
});

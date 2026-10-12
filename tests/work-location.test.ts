import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { WeatherDay } from '../src/domain/weather';
import { locationOf } from '../src/modules/configuracoes/work-settings';
import { formatCoordinates, weatherDayLine } from '../src/modules/configuracoes/work-location';
import { PUT } from '../src/app/api/work-settings/route';

const day = (over: Partial<WeatherDay>): WeatherDay => ({
  date: '2026-10-12',
  code: 61,
  label: 'Chuva',
  icon: 'rain',
  tMax: 27.4,
  tMin: 18.2,
  rainMm: 12.3,
  rainChance: 80,
  observed: false,
  ...over,
});

test('o local só existe com nome e as duas coordenadas', () => {
  assert.deepEqual(locationOf({ place: 'Curitiba, PR, Brasil', latitude: -25.4284, longitude: -49.2733 }), {
    place: 'Curitiba, PR, Brasil',
    latitude: -25.4284,
    longitude: -49.2733,
  });
  assert.equal(locationOf({ place: null, latitude: -25.4284, longitude: -49.2733 }), null);
  assert.equal(locationOf({ place: '', latitude: -25.4284, longitude: -49.2733 }), null);
  assert.equal(locationOf({ place: 'Curitiba', latitude: null, longitude: -49.2733 }), null);
  assert.equal(locationOf({ place: 'Curitiba', latitude: -25.4284, longitude: null }), null);
});

test('coordenadas saem com quatro casas e ponto, inclusive zero', () => {
  assert.equal(formatCoordinates(-25.42842, -49.27331), '-25.4284, -49.2733');
  assert.equal(formatCoordinates(0, 0), '0.0000, 0.0000');
});

test('a linha do dia tem dia da semana, rótulo, mínima/máxima e chuva', () => {
  assert.equal(weatherDayLine(day({})), 'segunda · Chuva · 18/27 °C · 12 mm');
  assert.equal(weatherDayLine(day({ date: '2026-10-14', rainMm: 0.4, label: 'Garoa' })), 'quarta · Garoa · 18/27 °C · <1 mm');
  assert.equal(weatherDayLine(day({ tMin: null, rainMm: null, label: 'Sem dados' })), 'segunda · Sem dados · — · —');
  assert.equal(weatherDayLine(day({ rainMm: 0 })), 'segunda · Chuva · 18/27 °C · 0 mm');
});

const put = async (body: unknown) => {
  const res = await PUT(new NextRequest('http://local/api/work-settings', { method: 'PUT', body: JSON.stringify(body) }));
  return { status: res.status, error: ((await res.json()) as { error?: string }).error };
};

test('a rota recusa o corpo antes de tocar na base: obra, chaves e local inválidos', async () => {
  assert.deepEqual(await put({ weekOneStart: '2026-10-12' }), { status: 400, error: 'Obra não informada.' });
  assert.deepEqual(await put({ workId: 'obra-1' }), { status: 400, error: 'Nada para salvar.' });
  assert.deepEqual(await put({ workId: 'obra-1', weekOneStart: 'ontem' }), { status: 400, error: 'Data da semana 1 inválida.' });
  assert.deepEqual(await put({ workId: 'obra-1', location: 'Curitiba' }), { status: 400, error: 'Local da obra inválido.' });
  assert.equal((await put({ workId: 'obra-1', location: { place: '   ', latitude: 0, longitude: 0 } })).status, 400);
  assert.equal((await put({ workId: 'obra-1', location: { place: 'x'.repeat(121), latitude: 0, longitude: 0 } })).status, 400);
  assert.deepEqual(await put({ workId: 'obra-1', location: { place: 'Curitiba', latitude: 91, longitude: 0 } }), {
    status: 400,
    error: 'Latitude inválida (de -90 a 90).',
  });
  assert.deepEqual(await put({ workId: 'obra-1', location: { place: 'Curitiba', latitude: '-25', longitude: 0 } }), {
    status: 400,
    error: 'Latitude inválida (de -90 a 90).',
  });
  assert.deepEqual(await put({ workId: 'obra-1', location: { place: 'Curitiba', latitude: 0, longitude: -181 } }), {
    status: 400,
    error: 'Longitude inválida (de -180 a 180).',
  });
  assert.deepEqual(await put({ workId: 'obra-1', location: { place: 'Curitiba', latitude: 0, longitude: Number.NaN } }), {
    status: 400,
    error: 'Longitude inválida (de -180 a 180).',
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearWeatherCache,
  fetchWeekWeather,
  selectEndpoint,
  toPlaceOptions,
  toWeatherDays,
  WeatherProviderError,
} from '../src/infrastructure/integrations/weather/open-meteo';

// Resposta real de api.open-meteo.com/v1/forecast em 12/10/2026 (São Paulo, semana 12–18/10).
const forecast = {
  latitude: -23.514938,
  longitude: -46.610504,
  generationtime_ms: 0.15,
  utc_offset_seconds: -10800,
  timezone: 'America/Sao_Paulo',
  timezone_abbreviation: 'GMT-3',
  elevation: 737.0,
  daily_units: {
    time: 'iso8601',
    weather_code: 'wmo code',
    temperature_2m_max: '°C',
    temperature_2m_min: '°C',
    precipitation_sum: 'mm',
    precipitation_probability_max: '%',
  },
  daily: {
    time: ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'],
    weather_code: [95, 80, 95, 95, 95, 80, 51],
    temperature_2m_max: [24.9, 28.0, 28.6, 25.3, 25.2, 22.6, 19.4],
    temperature_2m_min: [17.2, 17.2, 18.7, 18.3, 17.3, 14.7, 13.3],
    precipitation_sum: [7.7, 2.5, 20.8, 9.5, 28.1, 4.2, 1.4],
    precipitation_probability_max: [97, 75, 79, 99, 96, 82, 43],
  },
};
// Resposta real de archive-api.open-meteo.com/v1/archive (semana 21–27/09): sem probabilidade.
const archive = {
  ...forecast,
  daily_units: { time: 'iso8601', weather_code: 'wmo code', temperature_2m_max: '°C', temperature_2m_min: '°C', precipitation_sum: 'mm' },
  daily: {
    time: ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'],
    weather_code: [51, 63, 61, 3, 51, 3, 3],
    temperature_2m_max: [28.5, 22.3, 16.1, 20.8, 25.8, 31.4, 30.0],
    temperature_2m_min: [18.3, 16.2, 12.8, 12.8, 15.5, 16.4, 17.3],
    precipitation_sum: [0.4, 19.8, 6.2, 0.0, 0.7, 0.0, 0.0],
  },
};
const week = (start: string) =>
  Array.from({ length: 7 }, (_, i) => `${start.slice(0, 8)}${String(Number(start.slice(8)) + i).padStart(2, '0')}`);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** fetch falso que guarda as URLs chamadas e responde com o corpo dado. */
function fakeFetch(body: unknown, status = 200) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return jsonResponse(body, status);
  }) as typeof fetch;
  return { impl, calls };
}

test.beforeEach(() => {
  clearWeatherCache();
  delete process.env.OPEN_METEO_API_KEY;
});

test('mapeia a resposta diária: passado é observado sem probabilidade, futuro é previsão', () => {
  const days = toWeatherDays(forecast, week('2026-10-12'), '2026-10-14');
  assert.equal(days.length, 7);
  assert.deepEqual(days[0], {
    date: '2026-10-12',
    code: 95,
    label: 'Trovoada',
    icon: 'storm',
    tMax: 24.9,
    tMin: 17.2,
    rainMm: 7.7,
    rainChance: null,
    observed: true,
  });
  assert.equal(days[1].observed, true);
  assert.equal(days[1].rainChance, null);
  assert.deepEqual(days[2], {
    date: '2026-10-14',
    code: 95,
    label: 'Trovoada',
    icon: 'storm',
    tMax: 28.6,
    tMin: 18.7,
    rainMm: 20.8,
    rainChance: 79,
    observed: false,
  });
  assert.equal(days[5].label, 'Pancadas de chuva');
  assert.equal(days[6].label, 'Garoa');
  assert.equal(days[6].icon, 'drizzle');
});

test('datas fora da resposta e valores nulos viram "Sem dados"', () => {
  const partial = { daily: { ...forecast.daily, time: forecast.daily.time.slice(0, 5), weather_code: [95, null, 'x', 95, 95] } };
  const days = toWeatherDays(partial, week('2026-10-12'), '2026-10-12');
  assert.deepEqual(days[5], {
    date: '2026-10-17',
    code: -1,
    label: 'Sem dados',
    icon: 'cloud',
    tMax: null,
    tMin: null,
    rainMm: null,
    rainChance: null,
    observed: false,
  });
  assert.equal(days[6].label, 'Sem dados');
  assert.equal(days[1].label, 'Sem dados');
  assert.equal(days[1].tMax, 28.0);
  assert.equal(days[2].code, -1);
  assert.equal(days[3].code, 95);
});

test('resposta sem a série diária é falha do provedor, não sete dias vazios', () => {
  assert.throws(() => toWeatherDays({ error: true, reason: 'Bad Request' }, week('2026-10-12'), '2026-10-12'), WeatherProviderError);
  assert.throws(() => toWeatherDays(null, week('2026-10-12'), '2026-10-12'), WeatherProviderError);
  assert.throws(() => toWeatherDays({ daily: { weather_code: [1] } }, week('2026-10-12'), '2026-10-12'), WeatherProviderError);
});

test('semana encerrada há mais de 6 dias vai para a reanálise; as outras, para a previsão', () => {
  // Semana 28/09–04/10: 6 dias depois (10/10) ainda é previsão; 7 dias depois (11/10) é reanálise.
  assert.equal(selectEndpoint('2026-09-28', '2026-10-10'), 'forecast');
  assert.equal(selectEndpoint('2026-09-28', '2026-10-11'), 'archive');
  assert.equal(selectEndpoint('2026-10-12', '2026-10-12'), 'forecast');
  assert.equal(selectEndpoint('2026-10-19', '2026-10-12'), 'forecast');
});

test('previsão: pede as cinco variáveis no host público e resume a semana', async () => {
  const { impl, calls } = fakeFetch(forecast);
  const result = await fetchWeekWeather({
    latitude: -23.55,
    longitude: -46.63,
    weekStart: '2026-10-12',
    today: '2026-10-12',
    fetchImpl: impl,
  });
  assert.equal(calls.length, 1);
  const url = new URL(calls[0]);
  assert.equal(url.host, 'api.open-meteo.com');
  assert.equal(url.pathname, '/v1/forecast');
  assert.equal(
    url.searchParams.get('daily'),
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
  );
  assert.equal(url.searchParams.get('timezone'), 'America/Sao_Paulo');
  assert.equal(url.searchParams.get('start_date'), '2026-10-12');
  assert.equal(url.searchParams.get('end_date'), '2026-10-18');
  assert.equal(url.searchParams.has('apikey'), false);
  assert.equal(result.source, 'Open-Meteo');
  assert.equal(result.weekStart, '2026-10-12');
  assert.equal(result.days.length, 7);
  assert.equal(result.summary, 'Chuva prevista na segunda, terça, quarta, quinta, sexta e sábado (até 28 mm).');
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
});

test('reanálise: host de arquivo, sem probabilidade, tudo observado', async () => {
  const { impl, calls } = fakeFetch(archive);
  const result = await fetchWeekWeather({
    latitude: -23.55,
    longitude: -46.63,
    weekStart: '2026-09-21',
    today: '2026-10-12',
    fetchImpl: impl,
  });
  const url = new URL(calls[0]);
  assert.equal(url.host, 'archive-api.open-meteo.com');
  assert.equal(url.pathname, '/v1/archive');
  assert.equal(url.searchParams.get('daily'), 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum');
  assert.ok(result.days.every(d => d.observed && d.rainChance === null));
  assert.equal(result.summary, 'Choveu na terça e quarta (até 20 mm).');
});

test('semana que atravessa o horizonte é recortada em hoje + 15; o resto sai "Sem dados"', async () => {
  const horizonJson = { daily: { ...forecast.daily, time: ['2026-10-26', '2026-10-27'], weather_code: [1, 2] } };
  const { impl, calls } = fakeFetch(horizonJson);
  const result = await fetchWeekWeather({
    latitude: -23.55,
    longitude: -46.63,
    weekStart: '2026-10-26',
    today: '2026-10-12',
    fetchImpl: impl,
  });
  const url = new URL(calls[0]);
  assert.equal(url.searchParams.get('start_date'), '2026-10-26');
  assert.equal(url.searchParams.get('end_date'), '2026-10-27');
  assert.equal(result.days[0].label, 'Poucas nuvens');
  assert.equal(result.days[1].label, 'Parcialmente nublado');
  assert.ok(result.days.slice(2).every(d => d.label === 'Sem dados' && d.tMax === null && !d.observed));
});

test('semana inteira além do horizonte não consulta nada', async () => {
  const { impl, calls } = fakeFetch(forecast);
  const result = await fetchWeekWeather({
    latitude: -23.55,
    longitude: -46.63,
    weekStart: '2026-11-09',
    today: '2026-10-12',
    fetchImpl: impl,
  });
  assert.equal(calls.length, 0);
  assert.equal(result.days.length, 7);
  assert.ok(result.days.every(d => d.label === 'Sem dados'));
  assert.equal(result.summary, 'Sem dados do tempo para a semana.');
});

test('cache por coordenada, semana e endpoint: a segunda leitura não consulta de novo', async () => {
  const { impl, calls } = fakeFetch(forecast);
  const first = await fetchWeekWeather({
    latitude: -23.55,
    longitude: -46.63,
    weekStart: '2026-10-12',
    today: '2026-10-12',
    fetchImpl: impl,
  });
  const second = await fetchWeekWeather({
    latitude: -23.55,
    longitude: -46.63,
    weekStart: '2026-10-12',
    today: '2026-10-12',
    fetchImpl: impl,
  });
  assert.equal(calls.length, 1);
  assert.equal(second, first);
  await fetchWeekWeather({ latitude: -23.55, longitude: -46.64, weekStart: '2026-10-12', today: '2026-10-12', fetchImpl: impl });
  assert.equal(calls.length, 2);
  clearWeatherCache();
  await fetchWeekWeather({ latitude: -23.55, longitude: -46.63, weekStart: '2026-10-12', today: '2026-10-12', fetchImpl: impl });
  assert.equal(calls.length, 3);
});

test('com chave comercial usa os hosts customer-* e manda apikey', async () => {
  const { impl, calls } = fakeFetch(forecast);
  await fetchWeekWeather({
    latitude: -23.55,
    longitude: -46.63,
    weekStart: '2026-10-12',
    today: '2026-10-12',
    apiKey: 'chave',
    fetchImpl: impl,
  });
  const url = new URL(calls[0]);
  assert.equal(url.host, 'customer-api.open-meteo.com');
  assert.equal(url.searchParams.get('apikey'), 'chave');
  const archived = fakeFetch(archive);
  await fetchWeekWeather({
    latitude: -23.55,
    longitude: -46.63,
    weekStart: '2026-09-21',
    today: '2026-10-12',
    apiKey: 'chave',
    fetchImpl: archived.impl,
  });
  assert.equal(new URL(archived.calls[0]).host, 'customer-archive-api.open-meteo.com');
});

test('erro HTTP, corpo com error:true ou rede fora lançam WeatherProviderError e não entram no cache', async () => {
  const bad = fakeFetch({ error: true, reason: "Parameter 'end_date' is out of allowed range" }, 400);
  await assert.rejects(
    fetchWeekWeather({ latitude: -23.55, longitude: -46.63, weekStart: '2026-10-12', today: '2026-10-12', fetchImpl: bad.impl }),
    WeatherProviderError,
  );
  const refused = fakeFetch({ error: true, reason: 'Bad Request' });
  await assert.rejects(
    fetchWeekWeather({ latitude: -23.55, longitude: -46.63, weekStart: '2026-10-12', today: '2026-10-12', fetchImpl: refused.impl }),
    WeatherProviderError,
  );
  const offline = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  await assert.rejects(
    fetchWeekWeather({ latitude: -23.55, longitude: -46.63, weekStart: '2026-10-12', today: '2026-10-12', fetchImpl: offline }),
    WeatherProviderError,
  );
  const ok = fakeFetch(forecast);
  await fetchWeekWeather({ latitude: -23.55, longitude: -46.63, weekStart: '2026-10-12', today: '2026-10-12', fetchImpl: ok.impl });
  assert.equal(ok.calls.length, 1);
});

// Resposta real de geocoding-api.open-meteo.com/v1/search?name=Rio%20de%20Janeiro&language=pt em 12/10/2026, resumida.
const geocode = {
  results: [
    {
      id: 3451190,
      name: 'Rio de Janeiro',
      latitude: -22.90642,
      longitude: -43.18223,
      country: 'Brasil',
      admin1: 'Rio de Janeiro',
      admin2: 'Rio de Janeiro',
    },
    { id: 1, name: 'Río de Janeiro', latitude: 16.1, longitude: -92.0, country: 'México', admin1: 'Chiapas', admin2: 'La Trinitaria' },
    { id: 2, name: 'Río de Janeiro', latitude: 17.5, longitude: -93.1, country: 'México', admin1: 'Chiapas', admin2: 'Pichucalco' },
    { id: 3, name: 'Río de Janeiro', latitude: 5.2, longitude: -75.6, country: 'Colômbia', admin1: 'Caldas', admin2: 'San José' },
    { id: 4, name: 'Río de Janeiro', latitude: 5.3, longitude: -75.7, country: 'Colômbia', admin1: 'Caldas' },
    { id: 5, name: 'Sem país', latitude: 1, longitude: 2 },
    { id: 6, name: 'Sem coordenada', latitude: null, longitude: 2, country: 'Brasil' },
  ],
  generationtime_ms: 0.24,
};

test('opções de local: rótulo "Cidade, UF, País", sem repetir rótulo nem aceitar sem coordenada', () => {
  const places = toPlaceOptions(geocode);
  assert.deepEqual(
    places.map(p => p.label),
    ['Rio de Janeiro, Rio de Janeiro, Brasil', 'Río de Janeiro, Chiapas, México', 'Río de Janeiro, Caldas, Colômbia', 'Sem país'],
  );
  assert.deepEqual(places[0], {
    name: 'Rio de Janeiro',
    label: 'Rio de Janeiro, Rio de Janeiro, Brasil',
    latitude: -22.90642,
    longitude: -43.18223,
  });
  assert.equal(places[2].latitude, 5.2);
});

test('busca sem resultado vem sem a chave results e vira lista vazia', () => {
  assert.deepEqual(toPlaceOptions({ generationtime_ms: 0.06 }), []);
  assert.deepEqual(toPlaceOptions(null), []);
});

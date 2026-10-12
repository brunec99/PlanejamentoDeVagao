import { addDays } from '../../../domain/validation';
import { describeWeatherCode, summarizeWeek, type PlaceOption, type WeatherDay, type WeatherWeek } from '../../../domain/weather';

/** Provedor do tempo: Open-Meteo (https://open-meteo.com). Só o Route Handler importa este módulo. Sem
 * chave usa os hosts públicos, de uso não comercial; com `OPEN_METEO_API_KEY` passa aos hosts
 * `customer-*`, que exigem a chave na query. Formas das respostas confirmadas ao vivo em 12/10/2026. */

export class WeatherProviderError extends Error {}

type WeatherEndpoint = 'forecast' | 'archive';

/** A previsão vai até hoje + 15 (a API devolve 400 fora da faixa, não nulos: por isso o pedido é
 * recortado antes). Para trás ela aceita ~90 dias, mas semanas encerradas há mais de 6 dias vão
 * para a reanálise (ERA5), que é o observado de fato e não muda mais. */
const FORECAST_AHEAD_DAYS = 15;
const ARCHIVE_AFTER_DAYS = 6;
const TIMEOUT_MS = 8000;
const TTL_MS: Record<WeatherEndpoint, number> = { forecast: 30 * 60 * 1000, archive: 24 * 60 * 60 * 1000 };
const DAILY_FORECAST = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max';
const DAILY_ARCHIVE = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum';

export type WeekWeatherData = Omit<WeatherWeek, 'workId' | 'place'>;

export interface FetchWeekWeatherOptions {
  latitude: number;
  longitude: number;
  /** Segunda-feira, AAAA-MM-DD. */
  weekStart: string;
  /** Hoje no fuso da obra: separa observado de previsto e escolhe o endpoint. */
  today: string;
  apiKey?: string;
  /** Para testes: substitui o fetch global. */
  fetchImpl?: typeof fetch;
}

/** Cache por processo: na Vercel cada instância serverless guarda a sua, então o acerto não é
 * garantido entre requisições; serve para não repetir a consulta a cada PDF da mesma semana. */
const cache = new Map<string, { expires: number; value: WeekWeatherData }>();
const CACHE_MAX = 500;

export function clearWeatherCache() {
  cache.clear();
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const finite = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function hosts(apiKey: string | undefined) {
  const prefix = apiKey ? 'customer-' : '';
  return {
    forecast: `https://${prefix}api.open-meteo.com/v1/forecast`,
    archive: `https://${prefix}archive-api.open-meteo.com/v1/archive`,
    geocoding: `https://${prefix}geocoding-api.open-meteo.com/v1/search`,
  };
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
    // Erros de parâmetro vêm como 400 com `{ error: true, reason }`; o resto é falha de rede.
    if (!response.ok) throw new WeatherProviderError(`Open-Meteo respondeu ${response.status}.`);
    const json: unknown = await response.json();
    if (json && typeof json === 'object' && (json as { error?: unknown }).error)
      throw new WeatherProviderError(String((json as { reason?: unknown }).reason ?? 'Open-Meteo recusou a consulta.'));
    return json;
  } catch (error) {
    if (error instanceof WeatherProviderError) throw error;
    throw new WeatherProviderError('Não foi possível consultar o Open-Meteo.');
  } finally {
    clearTimeout(timer);
  }
}

const emptyDay = (date: string, today: string): WeatherDay => ({
  date,
  // -1 não é código WMO: cai no "Sem dados" de describeWeatherCode, já que o contrato não tem nulo.
  code: -1,
  ...describeWeatherCode(-1),
  tMax: null,
  tMin: null,
  rainMm: null,
  rainChance: null,
  observed: date < today,
});

/** Resposta diária do Open-Meteo → um WeatherDay por data pedida, na ordem. Datas ausentes da
 * resposta (além do horizonte) ou valores nulos viram "Sem dados"; dias passados são observados e
 * não carregam probabilidade, que só faz sentido como previsão. */
export function toWeatherDays(json: unknown, dates: string[], today: string): WeatherDay[] {
  const daily = (json as { daily?: Record<string, unknown> } | null)?.daily;
  const time = daily?.time;
  if (!daily || !Array.isArray(time)) throw new WeatherProviderError('Resposta do Open-Meteo sem a série diária.');
  const column = (name: string) => (Array.isArray(daily[name]) ? (daily[name] as unknown[]) : []);
  const codes = column('weather_code');
  const tMax = column('temperature_2m_max');
  const tMin = column('temperature_2m_min');
  const rain = column('precipitation_sum');
  const chance = column('precipitation_probability_max');
  return dates.map(date => {
    const index = time.indexOf(date);
    if (index < 0) return emptyDay(date, today);
    const observed = date < today;
    const code = finite(codes[index]);
    return {
      date,
      code: code ?? -1,
      ...describeWeatherCode(code ?? -1),
      tMax: finite(tMax[index]),
      tMin: finite(tMin[index]),
      rainMm: finite(rain[index]),
      rainChance: observed ? null : finite(chance[index]),
      observed,
    };
  });
}

const hasData = (day: WeatherDay) => day.code >= 0 || day.tMax !== null || day.rainMm !== null;

export function selectEndpoint(weekStart: string, today: string): WeatherEndpoint {
  return daysBetween(addDays(weekStart, 6), today) > ARCHIVE_AFTER_DAYS ? 'archive' : 'forecast';
}

/** Semana de segunda a domingo com o tempo dia a dia. Semana inteira além do horizonte não consulta
 * nada: sai com sete "Sem dados". */
export async function fetchWeekWeather(options: FetchWeekWeatherOptions): Promise<WeekWeatherData> {
  const { latitude, longitude, weekStart, today } = options;
  const apiKey = options.apiKey ?? process.env.OPEN_METEO_API_KEY ?? undefined;
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = selectEndpoint(weekStart, today);
  const key = `${latitude},${longitude},${weekStart},${endpoint}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const horizon = addDays(today, FORECAST_AHEAD_DAYS);
  const endDate = endpoint === 'forecast' && dates[6] > horizon ? horizon : dates[6];
  let days: WeatherDay[];
  if (weekStart > endDate) days = dates.map(date => emptyDay(date, today));
  else {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: endpoint === 'forecast' ? DAILY_FORECAST : DAILY_ARCHIVE,
      timezone: 'America/Sao_Paulo',
      start_date: weekStart,
      end_date: endDate,
    });
    if (apiKey) params.set('apikey', apiKey);
    days = toWeatherDays(await getJson(`${hosts(apiKey)[endpoint]}?${params}`, fetchImpl), dates, today);
  }
  const value: WeekWeatherData = {
    weekStart,
    latitude,
    longitude,
    days,
    // summarizeWeek lê "sem dados" como "sem chuva"; a semana vazia merece a frase honesta.
    summary: days.some(hasData) ? summarizeWeek(days) : 'Sem dados do tempo para a semana.',
    source: 'Open-Meteo',
    fetchedAt: new Date().toISOString(),
  };
  if (cache.size >= CACHE_MAX) {
    const now = Date.now();
    for (const [k, entry] of cache) if (entry.expires <= now) cache.delete(k);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, { expires: Date.now() + TTL_MS[endpoint], value });
  return value;
}

/** Resultados da geocodificação → opções com rótulo "Cidade, UF, País". Sem resultado a API omite
 * `results`. Entradas que viram o mesmo rótulo (bairros homônimos) ficam só com a primeira. */
export function toPlaceOptions(json: unknown): PlaceOption[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<string>();
  const places: PlaceOption[] = [];
  for (const row of results as Record<string, unknown>[]) {
    const name = typeof row?.name === 'string' ? row.name.trim() : '';
    const latitude = finite(row?.latitude);
    const longitude = finite(row?.longitude);
    if (!name || latitude === null || longitude === null) continue;
    const label = [name, row.admin1, row.country].filter(part => typeof part === 'string' && part.trim()).join(', ');
    if (seen.has(label)) continue;
    seen.add(label);
    places.push({ name, label, latitude, longitude });
  }
  return places;
}

export async function searchPlaces(q: string, fetchImpl: typeof fetch = fetch): Promise<PlaceOption[]> {
  const apiKey = process.env.OPEN_METEO_API_KEY || undefined;
  const params = new URLSearchParams({ name: q, count: '6', language: 'pt', format: 'json' });
  if (apiKey) params.set('apikey', apiKey);
  return toPlaceOptions(await getJson(`${hosts(apiKey).geocoding}?${params}`, fetchImpl));
}

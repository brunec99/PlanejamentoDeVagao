import type { PlaceOption } from '@/domain/weather';

/** Busca de endereço pelo Nominatim (OpenStreetMap), para o "Local da obra" (12/10/2026). A
 * geocodificação do Open-Meteo só conhece nomes de lugares; a obra digita rua e número ("Rua Maranhão,
 * 2176 - Portão, Curitiba - PR"), e isso o Nominatim resolve. Política de uso do serviço público:
 * no máximo 1 pedido por segundo, identificação do aplicativo no User-Agent e nada de rajadas — daí a
 * fila com intervalo, o cache e o debounce maior na tela. */

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = process.env.GEOCODING_USER_AGENT || 'Obra360/1.0 (+https://obra360-atr.vercel.app)';
const MIN_INTERVAL_MS = 1100;
const TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 200;

type NominatimRow = {
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: Record<string, string | undefined>;
};

/** Rótulo curto no padrão brasileiro: "Rua Maranhão, 2176 – Portão, Curitiba – PR (80610-140)". */
export function labelFromAddress(row: NominatimRow): string {
  const a = row.address ?? {};
  const street = [a.road ?? a.pedestrian ?? a.residential, a.house_number].filter(Boolean).join(', ');
  const district = a.suburb ?? a.neighbourhood ?? a.city_district ?? a.quarter;
  const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
  const state = (a['ISO3166-2-lvl4'] ?? '').replace(/^BR-/, '') || a.state;
  const main = [street, district].filter(Boolean).join(' – ');
  const tail = [city, state].filter(Boolean).join(' – ');
  const label = [main, tail].filter(Boolean).join(', ');
  const cep = a.postcode ? ` (${a.postcode})` : '';
  return (label || row.display_name || '').trim() + (label ? cep : '');
}

export function toPlaceOptions(rows: NominatimRow[]): PlaceOption[] {
  const seen = new Set<string>();
  const out: PlaceOption[] = [];
  for (const row of rows) {
    const latitude = Number(row.lat);
    const longitude = Number(row.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const label = labelFromAddress(row);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ name: row.display_name ?? label, label, latitude, longitude });
  }
  return out;
}

/** "lat, lon" colado da internet (ou um link do Google Maps com "@lat,lon") vira uma opção direta. */
export function parseCoordinates(q: string): PlaceOption | null {
  const text = q.trim();
  const m = text.match(/(?:@)?\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)(?![\d.])/);
  if (!m) return null;
  // Link do Google Maps traz "@lat,lon,17z": o primeiro par é o que importa.
  const latitude = Number(m[1].replace(',', '.'));
  const longitude = Number(m[2].replace(',', '.'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // Texto com letras além do par (ex.: "Rua 15, 230") não é coordenada.
  if (!/^[@\s\d.,;+-]+$/.test(text) && !/@-?\d/.test(text)) return null;
  const label = `Coordenadas ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  return { name: label, label, latitude, longitude };
}

const cache = new Map<string, { at: number; places: PlaceOption[] }>();
let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

/** Uma chamada por vez, com o intervalo mínimo da política do Nominatim, por instância do servidor. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = Math.max(0, lastCall + MIN_INTERVAL_MS - Date.now());
    if (wait) await new Promise(r => setTimeout(r, wait));
    lastCall = Date.now();
    return task();
  });
  queue = run.catch(() => {});
  return run;
}

export async function searchAddresses(q: string, fetchImpl: typeof fetch = fetch): Promise<PlaceOption[]> {
  const key = q.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.places;
  const params = new URLSearchParams({
    q: q.trim(),
    format: 'jsonv2',
    limit: '6',
    countrycodes: 'br',
    'accept-language': 'pt-BR',
    addressdetails: '1',
  });
  const places = await throttled(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${ENDPOINT}?${params}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);
      return toPlaceOptions((await res.json()) as NominatimRow[]);
    } finally {
      clearTimeout(timer);
    }
  });
  if (cache.size >= CACHE_MAX) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { at: Date.now(), places });
  return places;
}

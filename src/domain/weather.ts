/** Tempo na semana do curto prazo (12/10/2026): previsão dia a dia no PDF do planejamento e tempo
 * observado no PDF do fechamento. O contrato entre a rota `/api/clima`, o provedor (Open-Meteo) e a
 * faixa impressa. Datas em AAAA-MM-DD no fuso da obra (America/Sao_Paulo). */

export type WeatherIcon = 'sun' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'storm' | 'snow';

export interface WeatherDay {
  date: string;
  /** Código WMO do dia (0 = céu limpo … 95–99 = trovoada). */
  code: number;
  label: string;
  icon: WeatherIcon;
  tMax: number | null;
  tMin: number | null;
  /** Chuva acumulada no dia, em mm. */
  rainMm: number | null;
  /** Probabilidade máxima de chuva no dia (%); só na previsão. */
  rainChance: number | null;
  /** Dia já passado: valor observado (reanálise), não previsão. */
  observed: boolean;
}

export interface WeatherWeek {
  workId: string;
  weekStart: string;
  place: string;
  latitude: number;
  longitude: number;
  /** De segunda a domingo, sempre 7 dias, na ordem. */
  days: WeatherDay[];
  /** Uma frase para o rodapé do PDF: "Chuva prevista na quarta e na quinta (até 18 mm)." */
  summary: string;
  source: string;
  fetchedAt: string;
}

/** Resposta de GET /api/clima?workId=&semana=. `sem_local` = obra sem coordenadas (configurar na obra);
 * `indisponivel` = provedor fora do ar ou migração 0029 ausente. */
export type WeatherResponse =
  ({ available: true } & WeatherWeek) | { available: false; reason: 'sem_local' | 'indisponivel'; message: string };

/** Local escolhido na busca de endereço (Configurações da obra). */
export interface PlaceOption {
  name: string;
  /** "Cidade, UF, País" para a pessoa reconhecer. */
  label: string;
  latitude: number;
  longitude: number;
}

/** Código WMO → rótulo curto em português e ícone. Tabela oficial dos modelos do Open-Meteo. */
export function describeWeatherCode(code: number): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: 'Céu limpo', icon: 'sun' };
  if (code === 1) return { label: 'Poucas nuvens', icon: 'partly' };
  if (code === 2) return { label: 'Parcialmente nublado', icon: 'partly' };
  if (code === 3) return { label: 'Nublado', icon: 'cloud' };
  if (code === 45 || code === 48) return { label: 'Nevoeiro', icon: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Garoa', icon: 'drizzle' };
  if (code >= 61 && code <= 67) return { label: code >= 65 ? 'Chuva forte' : 'Chuva', icon: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Neve', icon: 'snow' };
  if (code >= 80 && code <= 82) return { label: code === 82 ? 'Pancadas fortes' : 'Pancadas de chuva', icon: 'rain' };
  if (code >= 85 && code <= 86) return { label: 'Neve', icon: 'snow' };
  if (code >= 95) return { label: 'Trovoada', icon: 'storm' };
  return { label: 'Sem dados', icon: 'cloud' };
}

const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const weekdayName = (date: string) => DAY_NAMES[new Date(`${date}T12:00:00Z`).getUTCDay()];

/** Frase do rodapé: quais dias úteis (seg–sáb) têm chuva relevante e quanto. Chuva relevante =
 * acumulado ≥ 1 mm ou probabilidade ≥ 50 % na previsão. */
export function summarizeWeek(days: WeatherDay[]): string {
  const working = days.slice(0, 6).filter(d => d.tMax !== null || d.rainMm !== null);
  const rainy = working.filter(d => (d.rainMm ?? 0) >= 1 || (d.rainChance ?? 0) >= 50);
  const observedAll = working.length > 0 && working.every(d => d.observed);
  const forecastAll = working.length > 0 && working.every(d => !d.observed);
  const verb = observedAll ? 'Choveu' : forecastAll ? 'Chuva prevista' : 'Chuva registrada ou prevista';
  if (!working.length) return 'Sem dados do tempo para a semana.';
  if (!rainy.length) return observedAll ? 'Sem chuva relevante na semana.' : 'Sem chuva relevante prevista para a semana.';
  const names = rainy.map(d => weekdayName(d.date));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  const max = Math.max(...rainy.map(d => d.rainMm ?? 0));
  const amount = max >= 1 ? ` (até ${Math.round(max)} mm)` : '';
  return `${verb} na ${list}${amount}.`;
}

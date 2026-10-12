'use client';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from 'lucide-react';
import type { WeatherDay, WeatherIcon, WeatherResponse, WeatherWeek } from '@/domain/weather';
import { weekdayName } from '@/domain/weather';
import { formatDate } from '@/shared/format';

/** Faixa do tempo no fim dos PDFs do curto prazo (12/10/2026): seis células seg–sáb com ícone, rótulo,
 * temperaturas e chuva do dia, depois a frase-resumo e a fonte. Os helpers são puros e testados em
 * tests/weather-strip.test.ts; o CSS mora no <style> do print-sheet (classes `.pcp-weather*`). */
export type WeatherTitleKind = 'planejamento' | 'fechamento';

const SHORT_DAYS = ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb'];
const weekdayIndex = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export const shortWeekday = (date: string) => SHORT_DAYS[weekdayIndex(date)];

/** Só segunda a sábado, como a planilha: o domingo fica fora do PDF. */
export const printedDays = (days: WeatherDay[]) => days.filter(d => weekdayIndex(d.date) !== 0);

/** Último dia observado e primeiro dia previsto entre os dias impressos (a semana corrente mistura os dois). */
export function splitObservedForecast(days: WeatherDay[]): { observedUntil: string | null; forecastFrom: string | null } {
  const printed = printedDays(days);
  const observed = printed.filter(d => d.observed);
  const forecast = printed.filter(d => !d.observed);
  return {
    observedUntil: observed.length ? observed[observed.length - 1].date : null,
    forecastFrom: forecast.length ? forecast[0].date : null,
  };
}

/** Título pelo que os dados são, não pelo PDF: o planejamento reimpresso de uma semana passada mostra o
 * observado, e o fechamento tirado na sexta mistura observado e previsão. O tipo do PDF decide só sem dias. */
export function weatherTitle(kind: WeatherTitleKind, days: WeatherDay[]): string {
  const { observedUntil, forecastFrom } = splitObservedForecast(days);
  if (observedUntil && forecastFrom)
    return `Tempo na semana (observado até ${weekdayName(observedUntil)}; previsão a partir de ${weekdayName(forecastFrom)})`;
  if (observedUntil) return 'Tempo na semana';
  if (forecastFrom) return 'Previsão do tempo para a semana';
  return kind === 'fechamento' ? 'Tempo na semana' : 'Previsão do tempo para a semana';
}

/** "máx 28° · mín 19°"; sem nenhum dos dois, "—". */
export function formatTemps(tMax: number | null, tMin: number | null): string {
  const parts = [tMax !== null ? `máx ${Math.round(tMax)}°` : null, tMin !== null ? `mín ${Math.round(tMin)}°` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

/** "12 mm", "<1 mm" para traço de chuva, mais "· 60 %" quando há probabilidade (só na previsão). */
export function formatRain(rainMm: number | null, rainChance: number | null): string {
  const mm = rainMm === null ? '—' : rainMm > 0 && rainMm < 1 ? '<1 mm' : `${Math.round(rainMm)} mm`;
  return rainChance === null ? mm : `${mm} · ${Math.round(rainChance)} %`;
}

/** Mesma régua do resumo (summarizeWeek): chuva relevante = acumulado ≥ 1 mm ou probabilidade ≥ 50 %. */
export const rainyDay = (day: Pick<WeatherDay, 'rainMm' | 'rainChance'>) => (day.rainMm ?? 0) >= 1 || (day.rainChance ?? 0) >= 50;

/** "dd/mm hh:mm" no fuso da obra; data inválida vira ''. */
export function formatFetchedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('day')}/${part('month')} ${part('hour')}:${part('minute')}`;
}

export function sourceLine(week: Pick<WeatherWeek, 'place' | 'fetchedAt'>): string {
  const when = formatFetchedAt(week.fetchedAt);
  return `Fonte: Open-Meteo · ${week.place}${when ? ` · consultado em ${when}` : ''}`;
}

export const unavailableMessage = (reason: 'sem_local' | 'indisponivel') =>
  reason === 'sem_local' ? 'Tempo não incluído: informe o local da obra em Configurações da obra.' : 'Tempo indisponível no momento.';

/** Glifos monocromáticos do lucide, em traço `currentColor`: imprimem bem em preto e branco. */
const ICONS: Record<WeatherIcon, typeof Sun> = {
  sun: Sun,
  partly: CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  storm: CloudLightning,
  snow: CloudSnow,
};

export function WeatherStrip({ weather, kind }: { weather: WeatherResponse; kind: WeatherTitleKind }) {
  if (!weather.available) return <p className="pcp-weather-note">{unavailableMessage(weather.reason)}</p>;
  const days = printedDays(weather.days);
  if (!days.length) return <p className="pcp-weather-note">{unavailableMessage('indisponivel')}</p>;
  return (
    <section className="pcp-weather">
      <h2 className="pcp-weather-title">{weatherTitle(kind, weather.days)}</h2>
      <table>
        <tbody>
          <tr>
            {days.map(day => {
              const Icon = ICONS[day.icon] ?? Cloud;
              return (
                <td key={day.date} className={rainyDay(day) ? 'pcp-weather-rain' : undefined}>
                  <div className="pcp-weather-day">
                    <span>
                      <b>{shortWeekday(day.date)}</b> {formatDate(day.date).slice(0, 5)}
                    </span>
                    <span className="pcp-weather-tag">{day.observed ? 'obs.' : 'prev.'}</span>
                  </div>
                  <div className="pcp-weather-label">
                    <Icon aria-hidden />
                    <span>{day.label}</span>
                  </div>
                  <div>{formatTemps(day.tMax, day.tMin)}</div>
                  <div>{formatRain(day.rainMm, day.rainChance)}</div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <p className="pcp-weather-summary">{weather.summary}</p>
      <p className="pcp-weather-source">{sourceLine(weather)}</p>
    </section>
  );
}

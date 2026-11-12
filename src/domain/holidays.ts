/** Feriados nacionais do Brasil (12/11/2026, regra 14 do modelo "Dashboards completos e resumo semanal"): o dia
 * útil que os dashboards e o resumo semanal cobram do histograma e da produtividade é de segunda a sexta, fora
 * feriado nacional. Puro, sem tabela: as datas fixas da lei e a Sexta-feira Santa, pela Páscoa.
 *
 * Carnaval e Corpus Christi NÃO entram: são ponto facultativo, não feriado nacional. Feriados estaduais e
 * municipais também ficam de fora (o sistema não sabe a cidade da obra); a semana com um deles mostra o dia
 * como falta. */

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const shift = (iso: string, days: number) => new Date(toUtc(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);

/** Domingo de Páscoa do ano (algoritmo gregoriano anônimo, de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Dia e mês dos feriados de data fixa; o da Consciência Negra é nacional desde 2024 (Lei 14.759/2023). */
const FIXED: readonly { monthDay: string; name: string; since?: number }[] = [
  { monthDay: '01-01', name: 'Confraternização Universal' },
  { monthDay: '04-21', name: 'Tiradentes' },
  { monthDay: '05-01', name: 'Dia do Trabalho' },
  { monthDay: '09-07', name: 'Independência do Brasil' },
  { monthDay: '10-12', name: 'Nossa Senhora Aparecida' },
  { monthDay: '11-02', name: 'Finados' },
  { monthDay: '11-15', name: 'Proclamação da República' },
  { monthDay: '11-20', name: 'Dia da Consciência Negra', since: 2024 },
  { monthDay: '12-25', name: 'Natal' },
];

/** O nome do feriado nacional do dia, ou `undefined`. */
export function nationalHolidayName(date: string): string | undefined {
  const year = Number(date.slice(0, 4));
  const fixed = FIXED.find(h => h.monthDay === date.slice(5) && (h.since === undefined || year >= h.since));
  if (fixed) return fixed.name;
  return shift(easterSunday(year), -2) === date ? 'Sexta-feira Santa' : undefined;
}
export const isNationalHoliday = (date: string) => nationalHolidayName(date) !== undefined;

/** Segunda a sexta e não feriado nacional. */
export function isWorkday(date: string): boolean {
  const weekday = toUtc(date).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !isNationalHoliday(date);
}

/** Os dias úteis de `from` a `to`, os dois inclusive, em ordem. Vazio quando `to` vem antes de `from`. */
export function workdaysIn(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = shift(day, 1)) if (isWorkday(day)) days.push(day);
  return days;
}

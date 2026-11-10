import { addDays, startOfWeek } from '@/domain/validation';
import { bucketLabel, shiftKey } from '@/modules/dashboard/period';

/** Período da aba 6 (10/11/2026, pedido da equipe de SST: "colocar no filtro de data igual o que temos em
 * Dashboard da obra"). A tela usa os botões de escala e a lista com setas ‹ › da aba 0, com duas diferenças
 * de propósito:
 *
 * - "Tudo", o padrão, não limita a data: a lista de abertos é o que os TSTs mais usam, e um aberto antigo
 *   não pode sumir da tela só porque o mês virou.
 * - Os períodos são do calendário, não de semanas inteiras: semana de segunda a domingo, mês do dia 1º ao
 *   último, trimestre e ano do calendário. A lista, o quadro mês a mês e o PDF contam pela data do
 *   apontamento, então "outubro de 2026" tem de ser de 01/10 a 31/10 (na aba 0 o mês é o das semanas cuja
 *   segunda-feira cai nele, e vai até o sábado).
 *
 * O período escolhido vira o início e o término de `SafetyFilters` (AAAA-MM-DD, os dois dias inclusive), que
 * é o que filtra a lista, os cartões, os gráficos e o PDF. Funções puras, para a tela e os testes. */

export type SafetyScale = 'tudo' | 'semana' | 'mes' | 'trimestre' | 'ano' | 'personalizado';
/** As escalas que têm uma lista de períodos (todas, menos "Tudo" e "Personalizado"). */
export type FixedScale = Exclude<SafetyScale, 'tudo' | 'personalizado'>;

export const SAFETY_SCALES: readonly { id: SafetyScale; label: string }[] = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'semana', label: 'Semanal' },
  { id: 'mes', label: 'Mensal' },
  { id: 'trimestre', label: 'Trimestral' },
  { id: 'ano', label: 'Anual' },
  { id: 'personalizado', label: 'Personalizado' },
];
export const isSafetyScale = (value: unknown): value is SafetyScale => SAFETY_SCALES.some(scale => scale.id === value);
export const isFixedScale = (value: unknown): value is FixedScale =>
  value === 'semana' || value === 'mes' || value === 'trimestre' || value === 'ano';

/** O que o seletor muda nos filtros: a escala e o início e o término. */
export interface SafetyPeriodPatch {
  scale: SafetyScale;
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
const dm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const dmy = (day: string) => `${dm(day)}/${day.slice(0, 4)}`;

/** Chave do período de calendário que contém o dia: a segunda-feira da semana ("2026-10-26"), o mês
 * ("2026-10"), o trimestre ("2026-T4") ou o ano ("2026"). As chaves de uma escala se ordenam como texto. */
export function periodKey(scale: FixedScale, day: string): string {
  switch (scale) {
    case 'semana':
      return startOfWeek(day);
    case 'mes':
      return day.slice(0, 7);
    case 'trimestre':
      return `${day.slice(0, 4)}-T${Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1}`;
    case 'ano':
      return day.slice(0, 4);
  }
}

/** Primeiro e último dia do período (os dois inclusive). */
export function periodRange(scale: FixedScale, key: string): { from: string; to: string } {
  const year = Number(key.slice(0, 4));
  switch (scale) {
    case 'semana':
      return { from: key, to: addDays(key, 6) };
    case 'mes': {
      const month = Number(key.slice(5, 7));
      return { from: `${key}-01`, to: lastDayOfMonth(year, month) };
    }
    case 'trimestre': {
      const quarter = Number(key.slice(-1));
      return { from: `${year}-${pad(quarter * 3 - 2)}-01`, to: lastDayOfMonth(year, quarter * 3) };
    }
    case 'ano':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
}

/** Nome do período: "26/10 a 01/11/2026", "outubro de 2026", "4º trimestre de 2026 (out–dez)", "2026". */
export function periodName(scale: FixedScale, key: string): string {
  if (scale !== 'semana') return bucketLabel(scale, key, 'long');
  const { from, to } = periodRange(scale, key);
  return `${dm(from)} a ${dmy(to)}`;
}

/** Limites da lista: do período do apontamento mais antigo da obra (`since`) ao período de hoje. Sem
 * apontamento, ou com `since` depois de hoje, a lista tem só o período de hoje. */
function bounds(scale: FixedScale, since: string | undefined, today: string) {
  return { first: periodKey(scale, since && since < today ? since : today), last: periodKey(scale, today) };
}

/** Os períodos da lista do seletor, do mais novo ao mais antigo; o de hoje sai marcado como atual. */
export function periodChoices(
  scale: FixedScale,
  since: string | undefined,
  today: string,
): { key: string; label: string; current: boolean }[] {
  const { first, last } = bounds(scale, since, today);
  const out: { key: string; label: string; current: boolean }[] = [];
  for (let key = last; key >= first && out.length < 2000; key = shiftKey(scale, key, -1))
    out.push({ key, label: periodName(scale, key), current: key === last });
  return out;
}

/** O período que o seletor mostra: o que contém o início do filtro (que, numa escala fixa, é o primeiro dia
 * do período); sem início, o de hoje. */
export function currentKey(scale: FixedScale, from: string, today: string): string {
  return periodKey(scale, from || today);
}

/** O período de uma escala fixa como mudança nos filtros. */
export function fixedPeriod(scale: FixedScale, key: string): SafetyPeriodPatch {
  return { scale, ...periodRange(scale, key) };
}

/** As setas ‹ ›: o período anterior (-1) ou o seguinte (+1); ausente quando sairia da lista (antes do
 * apontamento mais antigo ou depois de hoje), e aí o botão fica desabilitado. */
export function stepPeriod(
  scale: FixedScale,
  key: string,
  delta: -1 | 1,
  since: string | undefined,
  today: string,
): SafetyPeriodPatch | undefined {
  const { first, last } = bounds(scale, since, today);
  const next = shiftKey(scale, key, delta);
  return next < first || next > last ? undefined : fixedPeriod(scale, next);
}

/** Trocar de escala mantém o lugar, como na aba 0: a escala fixa abre no período que contém o término do
 * período de agora (sem término, ou término no futuro, o de hoje), dentro dos limites da lista; o
 * personalizado começa com o início e o término de agora; "Tudo" limpa as datas. */
export function switchScale(
  current: Pick<SafetyPeriodPatch, 'from' | 'to'>,
  scale: SafetyScale,
  since: string | undefined,
  today: string,
): SafetyPeriodPatch {
  if (scale === 'tudo') return { scale, from: '', to: '' };
  if (scale === 'personalizado') return { scale, from: current.from, to: current.to };
  const anchor = current.to && current.to < today ? current.to : today;
  const { first, last } = bounds(scale, since, today);
  const key = periodKey(scale, anchor);
  return fixedPeriod(scale, key < first ? first : key > last ? last : key);
}

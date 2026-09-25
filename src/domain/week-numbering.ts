import { addDays, startOfWeek } from './validation';

const WEEK = 604800000;

/** A semana 1 é sempre uma segunda-feira: qualquer data informada vale pela semana que a contém. */
export const normalizeWeekOne = (date: string) => startOfWeek(date);

/** Número da semana contado a partir da semana 1. Semanas anteriores dão zero ou negativo, e a tela
 * mostra assim mesmo: esconder o número faria parecer que a linha não tem semana. */
export const weekNumberFrom = (weekOne: string, weekStart: string) =>
  Math.round((Date.parse(startOfWeek(weekStart)) - Date.parse(startOfWeek(weekOne))) / WEEK) + 1;

/** Quem conhece a obra sabe o número da semana atual (a planilha diz 113), não a data da semana 1:
 * a data sai de voltar esse número de semanas a partir da segunda-feira atual. */
export function weekOneFromCurrent(currentWeek: string, currentNumber: number) {
  if (!Number.isInteger(currentNumber) || currentNumber < 1) throw new Error('Informe o número da semana atual como inteiro positivo.');
  return addDays(startOfWeek(currentWeek), -(currentNumber - 1) * 7);
}

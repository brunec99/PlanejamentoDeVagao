import type { ImportedActivity } from './commands';

export interface WagonWindow { id: string; plannedStart: string; plannedEnd: string }
export interface ActivitySlice { wagonId: string; percent: number; part: number; parts: number; row: ImportedActivity }

const MS = 86400000;
const parse = (value: string) => Date.parse(`${value}T00:00:00Z`);
/** Dias corridos inclusivos entre duas datas civis. */
export const spanDays = (start: string, end: string) => Math.round((parse(end) - parse(start)) / MS) + 1;

/**
 * Divide uma atividade do cronograma nas fatias que cabem em cada vagão que ela atravessa.
 * A fatia recebe o período recortado pela janela do vagão e o percentual proporcional aos
 * dias dentro dela — é isso que permite uma atividade longa estar em vários takts ao mesmo
 * tempo em que cada registro continua contido no período do seu vagão.
 */
export function sliceActivity(row: ImportedActivity, wagons: WagonWindow[]): ActivitySlice[] {
  const total = spanDays(row.plannedStart, row.plannedEnd);
  if (total <= 0) return [];
  const overlaps = wagons
    .map(wagon => {
      const start = row.plannedStart > wagon.plannedStart ? row.plannedStart : wagon.plannedStart;
      const end = row.plannedEnd < wagon.plannedEnd ? row.plannedEnd : wagon.plannedEnd;
      return { wagon, start, end, days: spanDays(start, end) };
    })
    .filter(overlap => overlap.days > 0)
    .sort((a, b) => a.start.localeCompare(b.start));
  if (overlaps.length === 0) return [];
  // Se os vagões cobrem só um trecho do período da atividade (ex.: ela começa antes do
  // primeiro vagão da sequência), não force um encaixe: sem cobertura total, a atividade não
  // entra em vagão nenhum — fica em "fora do período" em vez de aparecer como 100% num vagão
  // que na verdade só contém uma fração dela.
  const coveredDays = overlaps.reduce((sum, o) => sum + o.days, 0);
  if (coveredDays < total) return [];

  const percents = overlaps.map(o => Math.max(1, Math.round((o.days / total) * 100)));
  // O arredondamento sobra ou falta: o ajuste vai para a maior fatia, para o total fechar em 100%.
  const drift = 100 - percents.reduce((sum, p) => sum + p, 0);
  if (drift !== 0) {
    const biggest = percents.indexOf(Math.max(...percents));
    percents[biggest] += drift;
  }

  const single = overlaps.length === 1 && percents[0] === 100;
  return overlaps.map((overlap, index) => ({
    wagonId: overlap.wagon.id,
    percent: percents[index],
    part: index + 1,
    parts: overlaps.length,
    row: {
      ...row,
      externalId: single ? row.externalId : `${row.externalId}#${index + 1}`,
      // A fatia se identifica por posição e tamanho: "parte 2 de 3 · 35%".
      name: single ? row.name : `${row.name} — parte ${index + 1} de ${overlaps.length} · ${percents[index]}%`,
      plannedStart: overlap.start,
      plannedEnd: overlap.end,
      weight: percents[index] / 100,
    },
  }));
}

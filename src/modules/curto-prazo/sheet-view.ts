import { compareText } from '@/domain/commitment-order';
import { addDays } from '@/domain/validation';

/** Filtro e classificação da planilha da semana, no modelo do Google Sheets que ela substitui: cada
 * coluna filtra por valores marcados, e a classificação escolhida vale sobre a ordem padrão. */
export type Accessor<T> = (row: T) => string;
export type SheetSort = { column: string; dir: 'asc' | 'desc' };
export type SheetFilters = Record<string, Set<string> | undefined>;

// A comparação de texto é a da ordem da planilha (domínio), para o funil e o servidor concordarem.
export { compareText };

/** Sem acento, sem caixa e sem espaço repetido: "Hidrotec " e "HIDROTEC" são a mesma empresa. */
export const textKey = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Valores distintos da coluna com a contagem, em ordem alfabética e com as células vazias por último. */
export function distinctValues<T>(rows: T[], get: Accessor<T>) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = get(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => ((a.value === '') !== (b.value === '') ? (a.value === '' ? 1 : -1) : compareText(a.value, b.value)));
}

/** Linha passa quando cada coluna filtrada tem o valor dela marcado. A classificação de uma coluna
 * vale primeiro; empate e ausência de classificação caem na ordem padrão (`fallback`). */
/** `sortKeys` troca o texto exibido pela chave de ordem quando os dois diferem — "03/10" vem depois
 * de "28/09" na semana que vira o mês, o que a ordem alfabética do texto não respeitaria. */
export function applySheetView<T>(
  rows: T[],
  accessors: Record<string, Accessor<T>>,
  filters: SheetFilters,
  sort: SheetSort | undefined,
  fallback: (a: T, b: T) => number,
  sortKeys: Record<string, Accessor<T>> = {},
): T[] {
  const active = Object.entries(filters).filter((entry): entry is [string, Set<string>] => !!entry[1] && !!accessors[entry[0]]);
  const shown = rows.filter(row => active.every(([column, selected]) => selected.has(accessors[column](row))));
  const get = sort ? (sortKeys[sort.column] ?? accessors[sort.column]) : undefined;
  return shown.sort((a, b) => {
    if (sort && get) {
      const [x, y] = [get(a), get(b)];
      // Vazio fica por último nas duas direções, como no Sheets.
      if ((x === '') !== (y === '')) return x === '' ? 1 : -1;
      const byColumn = compareText(x, y) * (sort.dir === 'asc' ? 1 : -1);
      if (byColumn) return byColumn;
    }
    return fallback(a, b);
  });
}

/** A ordem presa da tela com as linhas que ela ainda não conhece. Cada uma entra logo acima da linha que
 * vem depois dela na ordem salva (`saved`), ou no fim: a linha nova entra embaixo, e a inserida no meio
 * (por esta tela ou, na recarga, por outra pessoa) aparece no lugar dela, mesmo com a planilha
 * classificada pelo funil. Linha que saiu da semana sai da lista. */
export function mergePinned(pinned: readonly string[], saved: readonly string[]): string[] {
  const known = new Set(saved);
  const merged = pinned.filter(id => known.has(id));
  const present = new Set(merged);
  saved.forEach((id, index) => {
    if (present.has(id)) return;
    const next = saved.slice(index + 1).find(other => present.has(other));
    merged.splice(next === undefined ? merged.length : merged.indexOf(next), 0, id);
    present.add(id);
  });
  return merged;
}

/** As semanas oferecidas na lista: da primeira semana da obra até `ahead` semanas depois da atual. */
export function weekOptions(firstWeek: string, currentWeek: string, ahead = 4): string[] {
  const last = addDays(currentWeek, ahead * 7);
  const weeks: string[] = [];
  for (let week = firstWeek < currentWeek ? firstWeek : currentWeek; week <= last; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

/** As semanas mostradas em volta da analisada na visão "Semanas vizinhas" (pedido da obra, 19/10/2026):
 * a anterior, para levar o que não foi feito, e a próxima, para ver a continuidade. Antes da semana 1
 * da obra não há semana anterior. */
export function neighborWeeks(week: string, firstWeek: string): { previous?: string; next: string } {
  const previous = addDays(week, -7);
  return { previous: previous >= firstWeek ? previous : undefined, next: addDays(week, 7) };
}

/** Empresas oferecidas: as do cadastro e as já escritas na planilha, sem repetir grafias equivalentes.
 * Prevalece a grafia do cadastro, que é a que alguém conferiu. */
export function companyOptions(registered: string[], typed: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of [...registered, ...typed]) {
    const key = textKey(name);
    if (key && !byKey.has(key)) byKey.set(key, name.trim());
  }
  return [...byKey.values()].sort(compareText);
}

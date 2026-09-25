import { addDays } from '@/domain/validation';

/** Filtro e classificação da planilha da semana, no modelo do Google Sheets que ela substitui: cada
 * coluna filtra por valores marcados, e a classificação escolhida vale sobre a ordem padrão. */
export type Accessor<T> = (row: T) => string;
export type SheetSort = { column: string; dir: 'asc' | 'desc' };
export type SheetFilters = Record<string, Set<string> | undefined>;

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
export const compareText = (a: string, b: string) => collator.compare(a, b);

/** Sem acento, sem caixa e sem espaço repetido: "Hidrotec " e "HIDROTEC" são a mesma empresa. */
export const textKey = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Valores distintos da coluna com a contagem, em ordem alfabética e com as células vazias por último. */
export function distinctValues<T>(rows: T[], get: Accessor<T>) {
  const counts = new Map<string, number>();
  for (const row of rows) { const value = get(row); counts.set(value, (counts.get(value) ?? 0) + 1); }
  return [...counts].map(([value, count]) => ({ value, count }))
    .sort((a, b) => (a.value === '') !== (b.value === '') ? (a.value === '' ? 1 : -1) : compareText(a.value, b.value));
}

/** Linha passa quando cada coluna filtrada tem o valor dela marcado. A classificação de uma coluna
 * vale primeiro; empate e ausência de classificação caem na ordem padrão (`fallback`). */
/** `sortKeys` troca o texto exibido pela chave de ordem quando os dois diferem — "03/10" vem depois
 * de "28/09" na semana que vira o mês, o que a ordem alfabética do texto não respeitaria. */
export function applySheetView<T>(rows: T[], accessors: Record<string, Accessor<T>>, filters: SheetFilters, sort: SheetSort | undefined, fallback: (a: T, b: T) => number, sortKeys: Record<string, Accessor<T>> = {}): T[] {
  const active = Object.entries(filters).filter((entry): entry is [string, Set<string>] => !!entry[1] && !!accessors[entry[0]]);
  const shown = rows.filter(row => active.every(([column, selected]) => selected.has(accessors[column](row))));
  const get = sort ? sortKeys[sort.column] ?? accessors[sort.column] : undefined;
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

/** As semanas oferecidas na lista: da primeira semana da obra até `ahead` semanas depois da atual. */
export function weekOptions(firstWeek: string, currentWeek: string, ahead = 4): string[] {
  const last = addDays(currentWeek, ahead * 7);
  const weeks: string[] = [];
  for (let week = firstWeek < currentWeek ? firstWeek : currentWeek; week <= last; week = addDays(week, 7)) weeks.push(week);
  return weeks;
}

/** Empresas oferecidas: as do cadastro e as já escritas na planilha, sem repetir grafias equivalentes.
 * Prevalece a grafia do cadastro, que é a que alguém conferiu. */
export function companyOptions(registered: string[], typed: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of [...registered, ...typed]) { const key = textKey(name); if (key && !byKey.has(key)) byKey.set(key, name.trim()); }
  return [...byKey.values()].sort(compareText);
}

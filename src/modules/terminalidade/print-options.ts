import {
  DEFAULT_FILTERS,
  isGrouping,
  isSortColumn,
  type TerminalityFilters,
  type TerminalityGrouping,
  type TerminalitySituation,
  type TerminalitySort,
} from './terminality-view';

/** O que a página de impressão da lista de pendências recebe pela URL (20/10/2026): os filtros e a
 * classificação da lista no momento do clique, o agrupamento (por pavimento, empreiteiro ou tipo), os grupos escolhidos, se leva
 * fotos e se cada grupo começa em folha nova. Funções puras, para a janela e a página lerem igual. */
export interface TerminalityPrintOptions {
  filters: TerminalityFilters;
  sort?: TerminalitySort;
  grouping: TerminalityGrouping;
  /** Grupos escolhidos na janela (chaves de `groupItems`); ausente = todos os da lista. Vai a lista do
   * que entra, e não do que sai: uma pendência nova de outro grupo não aparece no PDF sem ter sido pedida. */
  groups?: string[];
  photos: boolean;
  pageBreak: boolean;
}

/** Nome de cada filtro na URL; o vazio não vai, para o endereço ficar curto. */
const FILTER_PARAMS: Record<Exclude<keyof TerminalityFilters, 'situation'>, string> = {
  floorId: 'pavimento',
  unitId: 'apto',
  typeId: 'tipo',
  contractor: 'terceiro',
  atrPersonId: 'atr',
  search: 'busca',
};
const SITUATIONS: TerminalitySituation[] = ['open', 'resolved', 'all'];

export function printSearchParams(options: TerminalityPrintOptions): URLSearchParams {
  const params = new URLSearchParams({ agrupar: options.grouping, situacao: options.filters.situation });
  for (const [key, name] of Object.entries(FILTER_PARAMS) as [keyof typeof FILTER_PARAMS, string][]) {
    if (options.filters[key]) params.set(name, options.filters[key]);
  }
  if (options.sort) {
    params.set('ordem', options.sort.column);
    params.set('sentido', options.sort.dir);
  }
  for (const key of options.groups ?? []) params.append('grupo', key);
  if (!options.photos) params.set('fotos', '0');
  if (!options.pageBreak) params.set('quebra', '0');
  return params;
}

type RawParams = Record<string, string | string[] | undefined>;
const one = (raw: RawParams, name: string): string => {
  const value = raw[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
};

/** Lê a URL de volta. Valor estranho vira o padrão em vez de erro: o pior caso é um PDF com mais linhas. */
export function parsePrintParams(raw: RawParams): TerminalityPrintOptions {
  const filters: TerminalityFilters = { ...DEFAULT_FILTERS };
  for (const [key, name] of Object.entries(FILTER_PARAMS) as [keyof typeof FILTER_PARAMS, string][]) filters[key] = one(raw, name);
  const situation = one(raw, 'situacao');
  filters.situation = SITUATIONS.includes(situation as TerminalitySituation) ? (situation as TerminalitySituation) : 'open';
  const column = one(raw, 'ordem');
  const dir = one(raw, 'sentido');
  return {
    filters,
    sort: isSortColumn(column) ? { column, dir: dir === 'desc' ? 'desc' : 'asc' } : undefined,
    grouping: isGrouping(one(raw, 'agrupar')) ? (one(raw, 'agrupar') as TerminalityGrouping) : 'pavimento',
    groups: raw.grupo === undefined ? undefined : ([] as string[]).concat(raw.grupo),
    photos: one(raw, 'fotos') !== '0',
    pageBreak: one(raw, 'quebra') !== '0',
  };
}

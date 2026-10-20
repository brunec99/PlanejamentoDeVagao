import {
  DEFAULT_FILTERS,
  isSortColumn,
  type TerminalityFilters,
  type TerminalityGrouping,
  type TerminalitySituation,
  type TerminalitySort,
} from './terminality-view';

/** O que a página de impressão da lista de pendências recebe pela URL (20/10/2026): os filtros e a
 * classificação da lista no momento do clique, o agrupamento (por pavimento ou por empreiteiro), se leva
 * fotos e se cada grupo começa em folha nova. Funções puras, para a janela e a página lerem igual. */
export interface TerminalityPrintOptions {
  filters: TerminalityFilters;
  sort?: TerminalitySort;
  grouping: TerminalityGrouping;
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
  if (!options.photos) params.set('fotos', '0');
  if (!options.pageBreak) params.set('quebra', '0');
  return params;
}

type RawParams = Record<string, string | string[] | undefined>;
const one = (raw: RawParams, name: string) => {
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
    grouping: one(raw, 'agrupar') === 'empreiteiro' ? 'empreiteiro' : 'pavimento',
    photos: one(raw, 'fotos') !== '0',
    pageBreak: one(raw, 'quebra') !== '0',
  };
}

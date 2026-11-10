import { isSafetyConsequence, isSafetyProbability } from '@/domain/safety';
import {
  DEFAULT_FILTERS,
  isDay,
  isGrouping,
  isSortColumn,
  type SafetyFilters,
  type SafetyGrouping,
  type SafetySituation,
  type SafetySort,
} from './safety-view';

/** O que a página de impressão da vistoria de segurança recebe pela URL (05/11/2026), no desenho do PDF da
 * terminalidade: os filtros e a classificação da lista no momento do clique, o agrupamento (por tipo, local
 * ou consequência), os grupos escolhidos, se leva fotos e se cada grupo começa em folha nova. Funções puras,
 * para a janela e a página lerem igual. */
export interface SafetyPrintOptions {
  filters: SafetyFilters;
  sort?: SafetySort;
  grouping: SafetyGrouping;
  /** Grupos escolhidos na janela (chaves de `groupItems`); ausente = todos os da lista. Vai a lista do que
   * entra, e não do que sai: um apontamento novo de outro grupo não aparece no PDF sem ter sido pedido. */
  groups?: string[];
  photos: boolean;
  /** Cada grupo começa em folha nova. Desligado por padrão desde 10/11/2026 (pedido da equipe de SST: separar
   * por pavimento, mas sem gastar uma folha por grupo); a faixa azul do título continua separando os grupos. */
  pageBreak: boolean;
}

/** Agrupamento quando a URL não traz um válido: o tipo de apontamento, a leitura principal da planilha. */
export const DEFAULT_GROUPING: SafetyGrouping = 'tipo';

/** Agrupamento com que a janela abre, como na aba 5: pelo filtro da lista, para o PDF sair "do" que se
 * filtrou. Filtrada por tipo (ou sem filtro de tipo, local e consequência), por tipo; filtrada por local e
 * não por tipo, por local; só por consequência, por consequência. */
export function initialGrouping(filters: SafetyFilters): SafetyGrouping {
  if (filters.typeIds.length) return 'tipo';
  if (filters.locations.length) return 'local';
  if (filters.consequences.length) return 'consequencia';
  return DEFAULT_GROUPING;
}

/** Nome de cada filtro de lista na URL, repetido para cada valor (local vai pela chave de `locationKey`,
 * tipo pelo id, `NONE` para o vazio); lista vazia não vai, para o endereço ficar curto. */
const LIST_PARAMS = {
  typeIds: 'tipo',
  consequences: 'consequencia',
  probabilities: 'probabilidade',
  locations: 'local',
} as const satisfies Partial<Record<keyof SafetyFilters, string>>;
const SITUATIONS: SafetySituation[] = ['open', 'resolved', 'all'];

export function printSearchParams(options: SafetyPrintOptions): URLSearchParams {
  const { filters } = options;
  const params = new URLSearchParams({ agrupar: options.grouping, situacao: filters.situation });
  for (const [key, name] of Object.entries(LIST_PARAMS) as [keyof typeof LIST_PARAMS, string][]) {
    for (const value of filters[key]) params.append(name, value);
  }
  if (filters.search) params.set('busca', filters.search);
  // Período pela data do apontamento: "de" e "ate" em AAAA-MM-DD, só o lado que tem data.
  if (filters.from) params.set('de', filters.from);
  if (filters.to) params.set('ate', filters.to);
  if (options.sort) {
    params.set('ordem', options.sort.column);
    params.set('sentido', options.sort.dir);
  }
  for (const key of options.groups ?? []) params.append('grupo', key);
  if (!options.photos) params.set('fotos', '0');
  if (options.pageBreak) params.set('quebra', '1');
  return params;
}

type RawParams = Record<string, string | string[] | undefined>;
const all = (raw: RawParams, name: string): string[] => ([] as (string | undefined)[]).concat(raw[name]).filter((v): v is string => !!v);
const one = (raw: RawParams, name: string): string => all(raw, name)[0] ?? '';
/** Valores repetidos entram uma vez só, na ordem em que vieram. */
const unique = <T>(values: T[]) => [...new Set(values)];

/** Lê a URL de volta. Valor estranho vira o padrão em vez de erro (consequência ou probabilidade fora da
 * lista é ignorada): o pior caso é um PDF com mais linhas. */
export function parsePrintParams(raw: RawParams): SafetyPrintOptions {
  const situation = one(raw, 'situacao');
  const filters: SafetyFilters = {
    ...DEFAULT_FILTERS,
    situation: SITUATIONS.includes(situation as SafetySituation) ? (situation as SafetySituation) : DEFAULT_FILTERS.situation,
    typeIds: unique(all(raw, LIST_PARAMS.typeIds)),
    consequences: unique(all(raw, LIST_PARAMS.consequences).filter(isSafetyConsequence)),
    probabilities: unique(all(raw, LIST_PARAMS.probabilities).filter(isSafetyProbability)),
    locations: unique(all(raw, LIST_PARAMS.locations)),
    search: one(raw, 'busca'),
    from: isDay(one(raw, 'de')) ? one(raw, 'de') : '',
    to: isDay(one(raw, 'ate')) ? one(raw, 'ate') : '',
  };
  const column = one(raw, 'ordem');
  const grouping = one(raw, 'agrupar');
  return {
    filters,
    sort: isSortColumn(column) ? { column, dir: one(raw, 'sentido') === 'desc' ? 'desc' : 'asc' } : undefined,
    grouping: isGrouping(grouping) ? grouping : DEFAULT_GROUPING,
    groups: raw.grupo === undefined ? undefined : ([] as string[]).concat(raw.grupo),
    photos: one(raw, 'fotos') !== '0',
    pageBreak: one(raw, 'quebra') === '1',
  };
}

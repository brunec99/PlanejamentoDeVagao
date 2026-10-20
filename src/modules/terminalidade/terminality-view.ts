import type {
  TerminalityData,
  TerminalityFloor,
  TerminalityItem,
  TerminalityPerson,
  TerminalityPhoto,
  TerminalityType,
  TerminalityUnit,
} from '@/domain/terminality';
import { compareText, textKey } from '@/modules/curto-prazo/sheet-view';

/** Leitura da lista de pendências (aba 5): filtro, ordem, resumo e rótulos. Funções puras, sem
 * React, para a tela e os testes usarem as mesmas regras. */

/** Valor de filtro que pede a célula vazia: pendência sem apto, sem tipo, sem responsável. */
export const NONE = '__vazio__';

export type TerminalitySituation = 'open' | 'resolved' | 'all';
export interface TerminalityFilters {
  floorId: string;
  unitId: string;
  typeId: string;
  contractor: string;
  atrPersonId: string;
  situation: TerminalitySituation;
  search: string;
}
/** Abertas é o padrão: a lista existe para ser zerada, e o resolvido é consulta. */
export const DEFAULT_FILTERS: TerminalityFilters = {
  floorId: '',
  unitId: '',
  typeId: '',
  contractor: '',
  atrPersonId: '',
  situation: 'open',
  search: '',
};

/** Busca por id dos cadastros da obra e as fotos de cada pendência, já separadas por tipo e na
 * ordem em que foram tiradas. */
export interface TerminalityIndex {
  floors: Map<string, TerminalityFloor>;
  units: Map<string, TerminalityUnit>;
  types: Map<string, TerminalityType>;
  people: Map<string, TerminalityPerson>;
  photos: Map<string, { issue: TerminalityPhoto[]; correction: TerminalityPhoto[] }>;
}

export function indexTerminality(data: TerminalityData): TerminalityIndex {
  const photos = new Map<string, { issue: TerminalityPhoto[]; correction: TerminalityPhoto[] }>();
  for (const photo of [...data.photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const entry = photos.get(photo.itemId) ?? { issue: [], correction: [] };
    entry[photo.kind].push(photo);
    photos.set(photo.itemId, entry);
  }
  return {
    floors: new Map(data.floors.map(f => [f.id, f])),
    units: new Map(data.units.map(u => [u.id, u])),
    types: new Map(data.types.map(t => [t.id, t])),
    people: new Map(data.people.map(p => [p.id, p])),
    photos,
  };
}

const NO_PHOTOS = { issue: [] as TerminalityPhoto[], correction: [] as TerminalityPhoto[] };
export const photosOf = (index: TerminalityIndex, itemId: string) => index.photos.get(itemId) ?? NO_PHOTOS;

export const floorName = (index: TerminalityIndex, item: TerminalityItem) => index.floors.get(item.floorId)?.name ?? '';
export const unitName = (index: TerminalityIndex, item: TerminalityItem) => (item.unitId ? (index.units.get(item.unitId)?.name ?? '') : '');
export const typeName = (index: TerminalityIndex, item: TerminalityItem) => (item.typeId ? (index.types.get(item.typeId)?.name ?? '') : '');
export const personName = (index: TerminalityIndex, item: TerminalityItem) =>
  item.atrPersonId ? (index.people.get(item.atrPersonId)?.name ?? '') : '';

/** "4° pavto · 401"; pendência do pavimento, fora de uma unidade, fica só com o pavimento. */
export function locationLabel(index: TerminalityIndex, item: TerminalityItem) {
  return [floorName(index, item), unitName(index, item)].filter(Boolean).join(' · ');
}

/** Pavimentos e unidades na ordem cadastrada; o nome desempata com ordem natural ("2" antes de "10"). */
export const compareFloors = (a: TerminalityFloor, b: TerminalityFloor) => a.orderIndex - b.orderIndex || compareText(a.name, b.name);
export const compareUnits = (a: TerminalityUnit, b: TerminalityUnit) => a.orderIndex - b.orderIndex || compareText(a.name, b.name);

/** Ordem padrão da lista, a da planilha percorrida na obra: pavimento, apto e data de observação.
 * A pendência do pavimento (sem apto) vem antes dos aptos dele. */
export function compareItems(index: TerminalityIndex) {
  const floorOrder = (item: TerminalityItem) => index.floors.get(item.floorId)?.orderIndex ?? Number.MAX_SAFE_INTEGER;
  return (a: TerminalityItem, b: TerminalityItem) => {
    const byFloor = floorOrder(a) - floorOrder(b) || compareText(floorName(index, a), floorName(index, b));
    if (byFloor) return byFloor;
    const [x, y] = [a.unitId ? index.units.get(a.unitId) : undefined, b.unitId ? index.units.get(b.unitId) : undefined];
    if (!a.unitId !== !b.unitId) return a.unitId ? 1 : -1;
    if (x && y) {
      const byUnit = compareUnits(x, y);
      if (byUnit) return byUnit;
    } else if (x || y) return x ? -1 : 1;
    return a.observedOn.localeCompare(b.observedOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  };
}

/** Confere um id opcional contra o filtro: vazio não filtra, `NONE` pede o campo em branco. */
const matchId = (filter: string, value: string | undefined) => !filter || (filter === NONE ? !value : value === filter);

/** Filtros somam. "Responsável terceiro" compara sem acento e sem caixa, porque o nome da empresa
 * pode ter sido escrito à mão. A busca procura no texto da descrição. */
export function filterItems(items: TerminalityItem[], filters: TerminalityFilters, ignore: (keyof TerminalityFilters)[] = []) {
  const f = { ...filters };
  for (const key of ignore) (f as Record<string, string>)[key] = key === 'situation' ? 'all' : '';
  const needle = textKey(f.search);
  const contractor = f.contractor === NONE ? NONE : textKey(f.contractor);
  return items.filter(
    item =>
      (f.situation === 'all' || item.status === f.situation) &&
      matchId(f.floorId, item.floorId) &&
      matchId(f.unitId, item.unitId) &&
      matchId(f.typeId, item.typeId) &&
      matchId(f.atrPersonId, item.atrPersonId) &&
      (!contractor || (contractor === NONE ? !textKey(item.contractor ?? '') : textKey(item.contractor ?? '') === contractor)) &&
      (!needle || textKey(item.description).includes(needle)),
  );
}

/** Lista visível: filtrada e na ordem padrão. */
export function visibleItems(data: TerminalityData, index: TerminalityIndex, filters: TerminalityFilters) {
  return filterItems(data.items, filters).sort(compareItems(index));
}

export const hasActiveFilters = (filters: TerminalityFilters) =>
  (Object.keys(DEFAULT_FILTERS) as (keyof TerminalityFilters)[]).some(key => filters[key] !== DEFAULT_FILTERS[key]);

export interface Breakdown {
  /** Valor que vai para o filtro ao clicar (id do pavimento, nome da empresa ou `NONE`). */
  key: string;
  label: string;
  count: number;
}
export interface TerminalitySummary {
  total: number;
  open: number;
  resolved: number;
  /** Percentual resolvido; `undefined` sem nenhuma pendência, para não exibir 0% de nada. */
  percent: number | undefined;
  openByContractor: Breakdown[];
  openByFloor: Breakdown[];
}

export function summarize(items: TerminalityItem[], index: TerminalityIndex): TerminalitySummary {
  const open = items.filter(item => item.status === 'open');
  const resolved = items.length - open.length;

  // Empresas com grafias equivalentes ("Hidrotec " e "HIDROTEC") somam juntas, com a primeira grafia vista.
  const contractors = new Map<string, Breakdown>();
  for (const item of open) {
    const key = textKey(item.contractor ?? '');
    const entry = contractors.get(key) ?? {
      key: key ? (item.contractor ?? '').trim() : NONE,
      label: key ? (item.contractor ?? '').trim() : 'Sem responsável',
      count: 0,
    };
    entry.count++;
    contractors.set(key, entry);
  }
  const floors = new Map<string, Breakdown>();
  for (const item of open) {
    const entry = floors.get(item.floorId) ?? { key: item.floorId, label: floorName(index, item) || 'Pavimento removido', count: 0 };
    entry.count++;
    floors.set(item.floorId, entry);
  }
  const floorOrder = (id: string) => index.floors.get(id)?.orderIndex ?? Number.MAX_SAFE_INTEGER;
  return {
    total: items.length,
    open: open.length,
    resolved,
    percent: items.length ? (resolved / items.length) * 100 : undefined,
    // Quem mais deve vem primeiro; empate em ordem alfabética, "sem responsável" por último.
    openByContractor: [...contractors.values()].sort(
      (a, b) => b.count - a.count || (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) || compareText(a.label, b.label),
    ),
    // Pavimento com mais pendências primeiro; empate na ordem da obra.
    openByFloor: [...floors.values()].sort((a, b) => b.count - a.count || floorOrder(a.key) - floorOrder(b.key)),
  };
}

/** Opções de filtro de apto: as unidades do pavimento escolhido, ou de todos, na ordem da obra. */
export function unitOptions(data: TerminalityData, floorId: string) {
  const floors = new Map(data.floors.map(f => [f.id, f]));
  return data.units
    .filter(unit => !floorId || floorId === NONE || unit.floorId === floorId)
    .sort((a, b) => {
      const [x, y] = [floors.get(a.floorId), floors.get(b.floorId)];
      return (x && y ? compareFloors(x, y) : 0) || compareUnits(a, b);
    });
}

/** Percentual para exibir: inteiro, mas sem arredondar 99,6% para 100% enquanto houver pendência aberta. */
export function percentLabel(summary: Pick<TerminalitySummary, 'percent' | 'open'>) {
  if (summary.percent === undefined) return '—';
  const rounded = Math.round(summary.percent);
  return `${summary.open > 0 && rounded === 100 ? 99 : rounded}%`;
}

/** Classificação por coluna, como no Excel (pedido do usuário, 20/10/2026): cada coluna da lista
 * classifica do menor para o maior ou ao contrário. Célula vazia fica por último nos dois sentidos, e o
 * empate cai na ordem padrão (pavimento, apto, data). "Local" segue a ordem cadastrada dos pavimentos,
 * não a alfabética ("Térreo" antes de "2° pavto"); as colunas de foto classificam pela quantidade. */
export type TerminalitySortColumn =
  'local' | 'apto' | 'descricao' | 'tipo' | 'observacao' | 'correcao' | 'atr' | 'terceiro' | 'foto' | 'resolvido' | 'fotoCorrecao';
export type TerminalitySort = { column: TerminalitySortColumn; dir: 'asc' | 'desc' };
export const SORT_COLUMNS: { value: TerminalitySortColumn; label: string }[] = [
  { value: 'local', label: 'Local' },
  { value: 'apto', label: 'Apto' },
  { value: 'descricao', label: 'Descrição da pendência' },
  { value: 'tipo', label: 'Tipo' },
  { value: 'observacao', label: 'Data observação' },
  { value: 'correcao', label: 'Data correção' },
  { value: 'atr', label: 'Responsável ATR' },
  { value: 'terceiro', label: 'Responsável terceiro' },
  { value: 'foto', label: 'Foto' },
  { value: 'resolvido', label: 'Resolvido?' },
  { value: 'fotoCorrecao', label: 'Foto da correção' },
];
export const isSortColumn = (value: string): value is TerminalitySortColumn => SORT_COLUMNS.some(c => c.value === value);

/** O próximo estado do cabeçalho clicado: sem classificação → crescente → decrescente → sem classificação. */
export function nextSort(current: TerminalitySort | undefined, column: TerminalitySortColumn): TerminalitySort | undefined {
  if (current?.column !== column) return { column, dir: 'asc' };
  return current.dir === 'asc' ? { column, dir: 'desc' } : undefined;
}

/** Valor da célula para classificar; `undefined` é a célula vazia. */
function sortValue(index: TerminalityIndex, item: TerminalityItem, column: TerminalitySortColumn): string | number | undefined {
  const text = (value: string) => value.trim() || undefined;
  const count = (n: number) => n || undefined;
  switch (column) {
    case 'local':
      return index.floors.get(item.floorId)?.orderIndex;
    case 'apto':
      return text(unitName(index, item));
    case 'descricao':
      return text(item.description);
    case 'tipo':
      return text(typeName(index, item));
    case 'observacao':
      return item.observedOn;
    case 'correcao':
      return item.correctedOn;
    case 'atr':
      return text(personName(index, item));
    case 'terceiro':
      return text(item.contractor ?? '');
    case 'foto':
      return count(photosOf(index, item.id).issue.length);
    case 'resolvido':
      return item.status === 'resolved' ? 1 : 0;
    case 'fotoCorrecao':
      return count(photosOf(index, item.id).correction.length);
  }
}

/** Itens na ordem pedida; sem classificação, a ordem padrão. Não altera a lista recebida. */
export function sortItems(items: TerminalityItem[], index: TerminalityIndex, sort?: TerminalitySort): TerminalityItem[] {
  const fallback = compareItems(index);
  if (!sort) return [...items].sort(fallback);
  const sign = sort.dir === 'asc' ? 1 : -1;
  const keyed = items.map(item => ({ item, value: sortValue(index, item, sort.column) }));
  return keyed
    .sort((a, b) => {
      if ((a.value === undefined) !== (b.value === undefined)) return a.value === undefined ? 1 : -1;
      if (a.value !== undefined && b.value !== undefined) {
        const byValue =
          typeof a.value === 'number' && typeof b.value === 'number' ? a.value - b.value : compareText(String(a.value), String(b.value));
        if (byValue) return byValue * sign;
      }
      return fallback(a.item, b.item);
    })
    .map(entry => entry.item);
}

/** Como o PDF agrupa as pendências: por pavimento, por responsável terceiro (empreiteiro) ou por tipo. */
export type TerminalityGrouping = 'pavimento' | 'empreiteiro' | 'tipo';
export const GROUPINGS: { value: TerminalityGrouping; label: string; one: string; plural: string }[] = [
  { value: 'pavimento', label: 'Pavimento', one: 'pavimento', plural: 'pavimentos' },
  { value: 'empreiteiro', label: 'Responsável terceiro', one: 'empreiteiro', plural: 'empreiteiros' },
  { value: 'tipo', label: 'Tipo', one: 'tipo', plural: 'tipos' },
];
export const isGrouping = (value: string): value is TerminalityGrouping => GROUPINGS.some(g => g.value === value);
export interface TerminalityGroup {
  key: string;
  label: string;
  items: TerminalityItem[];
}
export const NO_CONTRACTOR_LABEL = 'Sem responsável terceiro';
export const NO_TYPE_LABEL = 'Sem tipo';

/** Chave e nome do grupo de uma pendência. A chave do empreiteiro é o nome sem acento e sem caixa, para
 * juntar grafias equivalentes; sem valor, a chave é `NONE`. */
export function groupOf(index: TerminalityIndex, item: TerminalityItem, by: TerminalityGrouping): { key: string; label: string } {
  if (by === 'pavimento') return { key: item.floorId, label: floorName(index, item) || 'Pavimento removido' };
  if (by === 'tipo') return { key: item.typeId ?? NONE, label: typeName(index, item) || NO_TYPE_LABEL };
  const contractor = (item.contractor ?? '').trim();
  return { key: textKey(contractor) || NONE, label: contractor || NO_CONTRACTOR_LABEL };
}

/** Grupos do PDF, mantendo a ordem dos itens recebidos dentro de cada grupo. Pavimentos e tipos na ordem
 * cadastrada na obra; empreiteiros em ordem alfabética. O grupo sem valor ("sem tipo", "sem
 * responsável") fica no fim. */
export function groupItems(items: TerminalityItem[], index: TerminalityIndex, by: TerminalityGrouping): TerminalityGroup[] {
  const groups = new Map<string, TerminalityGroup>();
  for (const item of items) {
    const { key, label } = groupOf(index, item, by);
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  const order = (key: string) =>
    (by === 'pavimento' ? index.floors.get(key)?.orderIndex : by === 'tipo' ? index.types.get(key)?.orderIndex : 0) ??
    Number.MAX_SAFE_INTEGER;
  return [...groups.values()].sort(
    (a, b) => (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) || order(a.key) - order(b.key) || compareText(a.label, b.label),
  );
}

/** Fatias de um gráfico de rosca do PDF. Uma rosca só se lê com poucas fatias: passando de `max`
 * categorias, as maiores ficam e o resto vira "Outros", com a quantidade de categorias juntadas. */
export type DonutField = 'tipo' | 'pavimento' | 'terceiro';
export interface DonutSlice {
  key: string;
  label: string;
  count: number;
  /** Fração do total, de 0 a 1. */
  share: number;
  /** Fatia "Outros": quantas categorias ela junta. */
  others?: number;
}
export function donutSlices(items: TerminalityItem[], index: TerminalityIndex, field: DonutField, max = 6): DonutSlice[] {
  const counts = new Map<string, { key: string; label: string; count: number; order: number }>();
  for (const item of items) {
    const contractor = (item.contractor ?? '').trim();
    const entry =
      field === 'pavimento'
        ? {
            key: item.floorId,
            label: floorName(index, item) || 'Pavimento removido',
            order: index.floors.get(item.floorId)?.orderIndex ?? 0,
          }
        : field === 'tipo'
          ? { key: item.typeId ?? NONE, label: typeName(index, item) || 'Sem tipo', order: 0 }
          : { key: textKey(contractor) || NONE, label: contractor || NO_CONTRACTOR_LABEL, order: 0 };
    const current = counts.get(entry.key) ?? { ...entry, count: 0 };
    current.count++;
    counts.set(entry.key, current);
  }
  const total = items.length;
  // Maior primeiro; no empate, a ordem da obra (pavimentos) ou a alfabética, com o vazio por último.
  const sorted = [...counts.values()].sort(
    (a, b) =>
      b.count - a.count || (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) || a.order - b.order || compareText(a.label, b.label),
  );
  const slice = (entry: { key: string; label: string; count: number }): DonutSlice => ({
    key: entry.key,
    label: entry.label,
    count: entry.count,
    share: total ? entry.count / total : 0,
  });
  if (sorted.length <= max) return sorted.map(slice);
  const kept = sorted.slice(0, max - 1);
  const rest = sorted.slice(max - 1);
  const others = rest.reduce((sum, entry) => sum + entry.count, 0);
  return [
    ...kept.map(slice),
    { key: '__outros__', label: 'Outros', count: others, share: total ? others / total : 0, others: rest.length },
  ];
}

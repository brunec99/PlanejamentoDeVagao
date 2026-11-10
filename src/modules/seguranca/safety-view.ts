import {
  SAFETY_CONSEQUENCES,
  SAFETY_PROBABILITIES,
  safetyDays,
  type SafetyConsequence,
  type SafetyData,
  type SafetyItem,
  type SafetyPhoto,
  type SafetyPhotoKind,
  type SafetyProbability,
  type SafetyType,
} from '@/domain/safety';
import { formatDate } from '@/shared/format';
import { compareText, textKey } from '@/modules/curto-prazo/sheet-view';
import type { DonutSlice } from '@/modules/terminalidade/terminality-view';
import type { SafetyScale } from './period';

export type { DonutSlice };

/** Leitura da lista de apontamentos de segurança (aba 6): filtro, ordem, grupos, resumo, roscas e o quadro
 * mês a mês. Funções puras, sem React, para a tela, o PDF e os testes usarem as mesmas regras. Mesmo
 * desenho de `terminality-view` (aba 5), com as colunas da planilha "SST - Controle geral". */

/** Valor de filtro que pede a célula vazia: apontamento sem tipo ou sem local. */
export const NONE = '__vazio__';
export const NO_TYPE_LABEL = 'Sem tipo';
export const NO_LOCATION_LABEL = 'Sem local';
/** "Abertos há mais de 7 dias": o cartão que cobra o que está parado. */
export const OPEN_OVER_DAYS = 7;

export type SafetySituation = 'open' | 'resolved' | 'all';
export interface SafetyFilters {
  situation: SafetySituation;
  /** Ids de tipo; `NONE` pede os apontamentos sem tipo. Vazio não filtra. */
  typeIds: string[];
  consequences: SafetyConsequence[];
  probabilities: SafetyProbability[];
  /** Chaves de local (`locationKey`) ou `NONE` (sem local). */
  locations: string[];
  search: string;
  /** Período pela "Data do apontamento" (06/11/2026): início e término (AAAA-MM-DD), os dois dias inclusive.
   * Vazio = sem limite daquele lado. Vale para os cartões, as roscas, o quadro mês a mês, a lista e o PDF. */
  from: string;
  to: string;
  /** Escala do seletor de período (10/11/2026, o da aba 0): "tudo" (sem datas, o padrão), uma escala do
   * calendário (semana, mês, trimestre, ano, cujo período vira `from`/`to`) ou "personalizado". Só a tela
   * usa: o filtro em si são `from` e `to`. */
  scale: SafetyScale;
}
/** Abertos é o padrão: a lista existe para ser zerada, e o finalizado é consulta. */
export const DEFAULT_FILTERS: SafetyFilters = {
  situation: 'open',
  typeIds: [],
  consequences: [],
  probabilities: [],
  locations: [],
  search: '',
  from: '',
  to: '',
  scale: 'tudo',
};

export const hasActiveFilters = (filters: SafetyFilters) =>
  filters.situation !== DEFAULT_FILTERS.situation ||
  filters.typeIds.length > 0 ||
  filters.consequences.length > 0 ||
  filters.probabilities.length > 0 ||
  filters.locations.length > 0 ||
  filters.search.trim() !== '' ||
  hasPeriod(filters);

/** Dia no formato do campo de data (AAAA-MM-DD) e existente no calendário. */
export function isDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}
export const hasPeriod = (filters: Pick<SafetyFilters, 'from' | 'to'>) => filters.from !== '' || filters.to !== '';
/** Início depois do término: nenhum apontamento cabe no período, e a tela avisa. */
export const periodInverted = (filters: Pick<SafetyFilters, 'from' | 'to'>) => !!filters.from && !!filters.to && filters.from > filters.to;

/** O período por extenso, para a tela e o PDF: "de 01/10/2026 a 31/10/2026", "a partir de 01/10/2026",
 * "até 31/10/2026"; vazio sem período. */
export function periodLabel(filters: Pick<SafetyFilters, 'from' | 'to'>) {
  if (filters.from && filters.to)
    return filters.from === filters.to ? `em ${formatDate(filters.from)}` : `de ${formatDate(filters.from)} a ${formatDate(filters.to)}`;
  if (filters.from) return `a partir de ${formatDate(filters.from)}`;
  if (filters.to) return `até ${formatDate(filters.to)}`;
  return '';
}

/** Busca por id dos tipos, as fotos de cada apontamento (do apontamento e depois da correção, cada grupo na
 * ordem em que foram tiradas) e o nome de exibição de cada local (a grafia mais usada na obra). */
export interface SafetyIndex {
  types: Map<string, SafetyType>;
  photos: Map<string, SafetyPhoto[]>;
  /** `locationKey` → grafia mais usada nos apontamentos da obra. */
  locationLabels: Map<string, string>;
}

const KIND_ORDER: Record<SafetyPhotoKind, number> = { issue: 0, correction: 1 };

export function indexSafety(data: SafetyData): SafetyIndex {
  const photos = new Map<string, SafetyPhoto[]>();
  const sorted = [...data.photos].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
  for (const photo of sorted) {
    const list = photos.get(photo.itemId) ?? [];
    list.push(photo);
    photos.set(photo.itemId, list);
  }
  return {
    types: new Map(data.types.map(t => [t.id, t])),
    photos,
    locationLabels: new Map(locationOptions(data.items).map(option => [option.key, option.label])),
  };
}

const NO_PHOTOS: SafetyPhoto[] = [];
/** Todas as fotos do apontamento: as do apontamento primeiro, depois as da correção. */
export const photosOf = (index: SafetyIndex, itemId: string) => index.photos.get(itemId) ?? NO_PHOTOS;
/** Só as fotos de um tipo (`issue` = do apontamento, `correction` = da correção). */
export const photosOfKind = (index: SafetyIndex, itemId: string, kind: SafetyPhotoKind) =>
  photosOf(index, itemId).filter(photo => photo.kind === kind);

/** Nome do tipo; vazio quando o apontamento não tem tipo (ou o tipo não está no cadastro). */
export const typeName = (index: SafetyIndex, item: SafetyItem) => (item.typeId ? (index.types.get(item.typeId)?.name ?? '') : '');

/** Chave do local para filtrar e agrupar: sem acento, sem caixa e sem espaço sobrando, e com "°" e "º"
 * equivalentes, porque o local é texto livre ("2° Pavimento", "2º pavimento "). Vazio = sem local. */
export const locationKey = (location: string) => textKey(location.replace(/[°˚º]/g, 'º'));

/** Grafia de exibição: o texto com os espaços arrumados. */
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

export interface LocationOption {
  key: string;
  label: string;
  count: number;
}

/** Locais já usados nos apontamentos, juntando grafias equivalentes. O nome é a grafia mais usada (empate:
 * ordem alfabética e, se só muda a caixa, a primeira vista); a lista vem do local com mais apontamentos para o com menos. Não inclui "sem local". */
export function locationOptions(items: SafetyItem[]): LocationOption[] {
  const byKey = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const item of items) {
    const key = locationKey(item.location);
    if (!key) continue;
    const entry = byKey.get(key) ?? { count: 0, spellings: new Map<string, number>() };
    entry.count++;
    const spelling = tidy(item.location);
    entry.spellings.set(spelling, (entry.spellings.get(spelling) ?? 0) + 1);
    byKey.set(key, entry);
  }
  return [...byKey.entries()]
    .map(([key, entry]) => {
      const [label] = [...entry.spellings.entries()].sort((a, b) => b[1] - a[1] || compareText(a[0], b[0]))[0];
      return { key, label, count: entry.count };
    })
    .sort((a, b) => b.count - a.count || compareText(a.label, b.label));
}

/** Sugestões de local para os campos de texto (lançar, editar, editar em lote): as grafias de
 * `locationOptions`, do mais usado para o menos. */
export const locationSuggestions = (items: SafetyItem[]) => locationOptions(items).map(option => option.label);

/** Nome do local para grupos e legendas: a grafia mais usada na obra para aquela chave. */
export function locationLabel(index: SafetyIndex, item: SafetyItem) {
  const key = locationKey(item.location);
  return key ? (index.locationLabels.get(key) ?? tidy(item.location)) : '';
}

/** Filtros somam entre si; dentro de um filtro, os valores marcados valem um OU outro. A busca procura,
 * sem acento e sem caixa, na descrição, no local, no nome do tipo e no "como foi corrigido". `ignore`
 * desliga filtros (a rosca de tipos ignora o filtro de tipo, para continuar mostrando todos os tipos). */
export function filterItems(items: SafetyItem[], filters: SafetyFilters, index: SafetyIndex, ignore: (keyof SafetyFilters)[] = []) {
  const off = new Set(ignore);
  const situation = off.has('situation') ? 'all' : filters.situation;
  const typeIds = off.has('typeIds') ? [] : filters.typeIds;
  const consequences = off.has('consequences') ? [] : filters.consequences;
  const probabilities = off.has('probabilities') ? [] : filters.probabilities;
  const locations = off.has('locations') ? [] : filters.locations;
  const needle = off.has('search') ? '' : textKey(filters.search);
  const from = off.has('from') ? '' : filters.from;
  const to = off.has('to') ? '' : filters.to;
  return items.filter(item => {
    if (situation !== 'all' && item.status !== situation) return false;
    if (from && item.observedOn < from) return false;
    if (to && item.observedOn > to) return false;
    if (typeIds.length) {
      const key = item.typeId && index.types.has(item.typeId) ? item.typeId : NONE;
      if (!typeIds.includes(key)) return false;
    }
    if (consequences.length && !consequences.includes(item.consequence)) return false;
    if (probabilities.length && !probabilities.includes(item.probability)) return false;
    if (locations.length && !locations.includes(locationKey(item.location) || NONE)) return false;
    if (needle) {
      const haystack = textKey([item.description, item.location, typeName(index, item), item.resolutionNote ?? ''].join(' \n '));
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Posição na escala da planilha: consequência da mais grave para a mais leve, probabilidade da mais
 * provável para a menos. Valor fora da escala vai para o fim. */
export const consequenceRank = (value: string) => {
  const at = (SAFETY_CONSEQUENCES as readonly string[]).indexOf(value);
  return at < 0 ? SAFETY_CONSEQUENCES.length : at;
};
export const probabilityRank = (value: string) => {
  const at = (SAFETY_PROBABILITIES as readonly string[]).indexOf(value);
  return at < 0 ? SAFETY_PROBABILITIES.length : at;
};

/** Ordem do cadastro de tipos (a mesma das roscas, dos grupos e do quadro mês a mês); sem tipo por último. */
const typeOrder = (index: SafetyIndex, typeId: string | undefined) =>
  (typeId ? index.types.get(typeId)?.orderIndex : undefined) ?? Number.MAX_SAFE_INTEGER;

/** Ordem padrão da lista: o apontamento mais recente primeiro; no mesmo dia, pela ordem do cadastro de
 * tipos e pela descrição. */
export function compareItems(index: SafetyIndex) {
  return (a: SafetyItem, b: SafetyItem) =>
    b.observedOn.localeCompare(a.observedOn) ||
    typeOrder(index, a.typeId) - typeOrder(index, b.typeId) ||
    compareText(typeName(index, a), typeName(index, b)) ||
    compareText(a.description, b.description) ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.id.localeCompare(b.id);
}

/** Classificação por coluna, como no Excel (o mesmo da aba 5): cada coluna classifica do menor para o maior
 * ou ao contrário, célula vazia por último nos dois sentidos e empate na ordem padrão. Consequência e
 * probabilidade seguem a escala da planilha (crescente = da mais grave/provável para a mais leve/rara); as
 * colunas de foto classificam pela quantidade; "Dias para resolver" pelos dias (aberto conta até hoje);
 * "Situação" põe os abertos antes dos finalizados no crescente. */
export type SafetySortColumn =
  | 'type'
  | 'consequence'
  | 'probability'
  | 'description'
  | 'location'
  | 'observedOn'
  | 'issuePhotos'
  | 'correctedOn'
  | 'correctionPhotos'
  | 'days'
  | 'situation';
export type SafetySort = { column: SafetySortColumn; dir: 'asc' | 'desc' };
export const SORT_COLUMNS: { value: SafetySortColumn; label: string }[] = [
  { value: 'type', label: 'Tipo de apontamento' },
  { value: 'consequence', label: 'Risco: consequência' },
  { value: 'probability', label: 'Risco: probabilidade' },
  { value: 'description', label: 'Descrição' },
  { value: 'location', label: 'Local' },
  { value: 'observedOn', label: 'Data do apontamento' },
  { value: 'issuePhotos', label: 'Foto do apontamento' },
  { value: 'correctedOn', label: 'Data de correção' },
  { value: 'correctionPhotos', label: 'Foto da correção' },
  { value: 'days', label: 'Dias para resolver' },
  { value: 'situation', label: 'Situação' },
];
export const isSortColumn = (value: string): value is SafetySortColumn => SORT_COLUMNS.some(c => c.value === value);

/** O próximo estado do cabeçalho clicado: sem classificação → crescente → decrescente → sem classificação. */
export function nextSort(current: SafetySort | undefined, column: SafetySortColumn): SafetySort | undefined {
  if (current?.column !== column) return { column, dir: 'asc' };
  return current.dir === 'asc' ? { column, dir: 'desc' } : undefined;
}

/** Valor da célula para classificar; `undefined` é a célula vazia. */
function sortValue(index: SafetyIndex, item: SafetyItem, column: SafetySortColumn, today: string): string | number | undefined {
  const text = (value: string) => value.trim() || undefined;
  const count = (n: number) => n || undefined;
  switch (column) {
    case 'type':
      return text(typeName(index, item));
    case 'consequence':
      return item.consequence ? consequenceRank(item.consequence) : undefined;
    case 'probability':
      return item.probability ? probabilityRank(item.probability) : undefined;
    case 'description':
      return text(item.description);
    case 'location':
      return text(locationLabel(index, item));
    case 'observedOn':
      return item.observedOn || undefined;
    case 'issuePhotos':
      return count(photosOfKind(index, item.id, 'issue').length);
    case 'correctedOn':
      return item.correctedOn || undefined;
    case 'correctionPhotos':
      return count(photosOfKind(index, item.id, 'correction').length);
    case 'days':
      return safetyDays(item, today);
    case 'situation':
      return item.status === 'resolved' ? 1 : 0;
  }
}

/** Itens na ordem pedida; sem classificação, a ordem padrão. Não altera a lista recebida. */
export function sortItems(items: SafetyItem[], index: SafetyIndex, sort: SafetySort | undefined, today: string): SafetyItem[] {
  const fallback = compareItems(index);
  if (!sort) return [...items].sort(fallback);
  const sign = sort.dir === 'asc' ? 1 : -1;
  const keyed = items.map(item => ({ item, value: sortValue(index, item, sort.column, today) }));
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

/** Como o PDF agrupa os apontamentos: por tipo, por local ou pela consequência do risco. */
export type SafetyGrouping = 'tipo' | 'local' | 'consequencia';
export const GROUPINGS: { value: SafetyGrouping; label: string; one: string; plural: string }[] = [
  { value: 'tipo', label: 'Tipo de apontamento', one: 'tipo', plural: 'tipos' },
  { value: 'local', label: 'Local', one: 'local', plural: 'locais' },
  { value: 'consequencia', label: 'Risco: consequência', one: 'consequência', plural: 'consequências' },
];
export const isGrouping = (value: string): value is SafetyGrouping => GROUPINGS.some(g => g.value === value);
export interface SafetyGroup {
  key: string;
  label: string;
  items: SafetyItem[];
}

/** Chave e nome do grupo de um apontamento. Tipo: o id (sem tipo = `NONE`); local: `locationKey` (sem
 * local = `NONE`), com a grafia mais usada na obra; consequência: o próprio valor. */
export function groupOf(index: SafetyIndex, item: SafetyItem, by: SafetyGrouping): { key: string; label: string } {
  if (by === 'tipo') {
    const name = typeName(index, item);
    return name && item.typeId ? { key: item.typeId, label: name } : { key: NONE, label: NO_TYPE_LABEL };
  }
  if (by === 'local') {
    const key = locationKey(item.location);
    return key ? { key, label: locationLabel(index, item) } : { key: NONE, label: NO_LOCATION_LABEL };
  }
  return { key: item.consequence, label: item.consequence };
}

/** Grupos do PDF, mantendo a ordem dos itens recebidos dentro de cada grupo. Tipos na ordem do cadastro,
 * locais em ordem alfabética natural ("2° Pavimento" antes de "10° Pavimento"), consequências da mais
 * grave para a mais leve. O grupo sem valor ("Sem tipo", "Sem local") fica no fim. */
export function groupItems(items: SafetyItem[], index: SafetyIndex, by: SafetyGrouping): SafetyGroup[] {
  const groups = new Map<string, SafetyGroup>();
  for (const item of items) {
    const { key, label } = groupOf(index, item, by);
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  const order = (key: string) => (by === 'tipo' ? typeOrder(index, key) : by === 'consequencia' ? consequenceRank(key) : 0);
  return [...groups.values()].sort(
    (a, b) => (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) || order(a.key) - order(b.key) || compareText(a.label, b.label),
  );
}

export interface SafetySummary {
  total: number;
  open: number;
  resolved: number;
  /** Percentual finalizado; `undefined` sem nenhum apontamento, para não exibir 0% de nada. */
  percent: number | undefined;
  /** Média de "Dias para resolver" dos finalizados; `null` sem nenhum finalizado. */
  avgDaysToResolve: number | null;
  /** Abertos há mais de `OPEN_OVER_DAYS` (7) dias, contados até hoje. */
  openOverDays: number;
}

export function summarize(items: SafetyItem[], today: string): SafetySummary {
  let open = 0;
  let openOverDays = 0;
  let resolvedDays = 0;
  let resolvedCount = 0;
  for (const item of items) {
    if (item.status === 'open') {
      open++;
      if (safetyDays(item, today) > OPEN_OVER_DAYS) openOverDays++;
    } else if (item.correctedOn) {
      resolvedCount++;
      resolvedDays += safetyDays(item, today);
    }
  }
  const resolved = items.length - open;
  return {
    total: items.length,
    open,
    resolved,
    percent: items.length ? (resolved / items.length) * 100 : undefined,
    avgDaysToResolve: resolvedCount ? resolvedDays / resolvedCount : null,
    openOverDays,
  };
}

/** A consequência mais grave da escala: o cartão "Risco de morte em aberto" (10/11/2026) cobra estes. */
export const DEATH_CONSEQUENCE: SafetyConsequence = 'Morte';

export interface DeathRiskSummary {
  /** Abertos com risco de morte. */
  open: number;
  /** Há quantos dias está aberto o mais antigo deles (0 = aberto hoje); `null` sem nenhum aberto. */
  oldestOpenDays: number | null;
  /** Finalizados com risco de morte e a média de dias que levaram para ser finalizados (`null` sem nenhum). */
  resolved: number;
  avgDaysToResolve: number | null;
}

/** O cartão "Risco de morte em aberto" (pedido da equipe de SST, "incluir dias para risco de morte"):
 * quantos apontamentos de consequência "Morte" estão abertos e há quantos dias o mais antigo espera; sem
 * nenhum aberto, quanto tempo os finalizados levaram, em média. */
export function summarizeDeathRisk(items: SafetyItem[], today: string): DeathRiskSummary {
  const death = items.filter(item => item.consequence === DEATH_CONSEQUENCE);
  const { open, resolved, avgDaysToResolve } = summarize(death, today);
  let oldestOpenDays: number | null = null;
  for (const item of death) if (item.status === 'open') oldestOpenDays = Math.max(oldestOpenDays ?? 0, safetyDays(item, today));
  return { open, oldestOpenDays, resolved, avgDaysToResolve };
}

/** Percentual para exibir: inteiro, mas sem arredondar 99,6% para 100% enquanto houver apontamento aberto. */
export function percentLabel(summary: Pick<SafetySummary, 'percent' | 'open'>) {
  if (summary.percent === undefined) return '—';
  const rounded = Math.round(summary.percent);
  return `${summary.open > 0 && rounded === 100 ? 99 : rounded}%`;
}

/** Média de dias com uma casa ("3,5"); "—" sem finalizados. */
export const daysLabel = (days: number | null) =>
  days === null ? '—' : days.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** Fatias de uma rosca. Passando de `max` categorias, as maiores ficam e o resto vira "Outros", com a
 * quantidade de categorias juntadas (mesmo formato da aba 5, para reaproveitar o `DonutRing`). */
export type DonutField = 'tipo' | 'consequencia' | 'probabilidade';
export function donutSlices(items: SafetyItem[], index: SafetyIndex, field: DonutField, max = 6): DonutSlice[] {
  const counts = new Map<string, { key: string; label: string; count: number; order: number }>();
  for (const item of items) {
    let entry: { key: string; label: string; order: number };
    if (field === 'tipo') {
      const { key, label } = groupOf(index, item, 'tipo');
      entry = { key, label, order: key === NONE ? Number.MAX_SAFE_INTEGER : typeOrder(index, key) };
    } else if (field === 'consequencia')
      entry = { key: item.consequence, label: item.consequence, order: consequenceRank(item.consequence) };
    else entry = { key: item.probability, label: item.probability, order: probabilityRank(item.probability) };
    const current = counts.get(entry.key) ?? { ...entry, count: 0 };
    current.count++;
    counts.set(entry.key, current);
  }
  const total = items.length;
  // Maior primeiro; no empate, a ordem do cadastro ou da escala, com o vazio por último.
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

const MONTH_NAMES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-11" → "nov/26". */
export function monthLabel(month: string) {
  const [year, number] = month.split('-').map(Number);
  return `${MONTH_NAMES[(number || 1) - 1]}/${String(year).slice(-2)}`;
}

/** Os `count` meses de calendário que terminam no mês de `today` (AAAA-MM-DD), do mais antigo ao atual. */
export function lastMonths(today: string, count: number): string[] {
  const [year, month] = today.split('-').map(Number);
  const result: string[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const total = year * 12 + (month - 1) - back;
    result.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`);
  }
  return result;
}

/** Sem período, o quadro mês a mês mostra os últimos 4 meses; com período, os meses dele, até 12. */
export const MONTHLY_DEFAULT_MONTHS = 4;
export const MONTHLY_MAX_MONTHS = 12;
const monthIndex = (day: string) => {
  const [year, month] = day.split('-').map(Number);
  return year * 12 + (month - 1);
};

export interface MonthWindow {
  /** Meses do quadro ('AAAA-MM'), do mais antigo ao mais recente. */
  months: string[];
  /** Quantos meses o período tem; maior que `months.length` quando passou de 12 e o quadro mostra só os últimos. */
  periodMonths: number;
}

/** Meses do quadro mês a mês. Sem período, os 4 que terminam no mês de hoje. Com período, do mês do início
 * ao mês do término; o término no futuro para no mês de hoje e, sem início, o quadro mostra os 4 meses que
 * terminam no término. Passando de 12 meses, ficam os 12 últimos. Início depois do término mostra o mês do
 * término (o quadro sai zerado, como a lista). */
export function monthWindow(today: string, filters: Pick<SafetyFilters, 'from' | 'to'>): MonthWindow {
  if (!hasPeriod(filters)) return { months: lastMonths(today, MONTHLY_DEFAULT_MONTHS), periodMonths: MONTHLY_DEFAULT_MONTHS };
  const endDay = filters.to && filters.to < today ? filters.to : today;
  const end = Math.max(monthIndex(endDay), filters.from ? monthIndex(filters.from) : 0);
  const start = filters.from ? Math.min(monthIndex(filters.from), end) : end - (MONTHLY_DEFAULT_MONTHS - 1);
  const periodMonths = periodInverted(filters) ? 1 : end - start + 1;
  const count = Math.min(periodMonths, MONTHLY_MAX_MONTHS);
  const last = `${Math.floor(end / 12)}-${String((end % 12) + 1).padStart(2, '0')}-01`;
  return { months: lastMonths(last, count), periodMonths };
}

export interface MonthlyRow {
  /** Id do tipo, `NONE` (sem tipo) ou `'__geral__'` (linha GERAL). */
  key: string;
  label: string;
  /** Apontamentos por mês, na ordem de `months`. */
  counts: number[];
  /** Soma dos meses da janela. */
  total: number;
  /** Último mês menos o anterior. */
  diff: number;
  /** Diferença em % do mês anterior; `null` quando o mês anterior teve zero (não há base para comparar). */
  diffPercent: number | null;
}
export interface MonthlyByType {
  /** Meses da janela ('AAAA-MM'), do mais antigo ao atual. */
  months: string[];
  /** Rótulos dos meses ("nov/26"), na mesma ordem. */
  monthLabels: string[];
  /** Tipos com apontamento na janela, na ordem do cadastro; "Sem tipo" por último. */
  rows: MonthlyRow[];
  /** Linha GERAL: a soma de todos os tipos. */
  total: MonthlyRow;
}
export const MONTHLY_TOTAL_KEY = '__geral__';

function monthlyRow(key: string, label: string, counts: number[]): MonthlyRow {
  const last = counts[counts.length - 1] ?? 0;
  const previous = counts.length > 1 ? counts[counts.length - 2] : 0;
  const diff = last - previous;
  return {
    key,
    label,
    counts,
    total: counts.reduce((sum, n) => sum + n, 0),
    diff,
    diffPercent: previous ? (diff / previous) * 100 : null,
  };
}

/** O quadro "Página15" da planilha: quantos apontamentos de cada tipo nos últimos meses (pelo mês da data
 * do apontamento, abertos e finalizados), com a variação do último mês sobre o anterior e a linha GERAL.
 * `months`: quantos meses até o mês de hoje, ou a lista exata de meses (`monthWindow`, com o período). */
export function monthlyByType(
  items: SafetyItem[],
  index: SafetyIndex,
  today: string,
  months: number | string[] = MONTHLY_DEFAULT_MONTHS,
): MonthlyByType {
  const window = typeof months === 'number' ? lastMonths(today, Math.max(1, months)) : months;
  const column = new Map(window.map((month, at) => [month, at]));
  const byType = new Map<string, { key: string; label: string; counts: number[] }>();
  const totals = window.map(() => 0);
  for (const item of items) {
    const at = column.get(item.observedOn.slice(0, 7));
    if (at === undefined) continue;
    const { key, label } = groupOf(index, item, 'tipo');
    const entry = byType.get(key) ?? { key, label, counts: window.map(() => 0) };
    entry.counts[at]++;
    totals[at]++;
    byType.set(key, entry);
  }
  const rows = [...byType.values()]
    .sort(
      (a, b) =>
        (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) ||
        typeOrder(index, a.key) - typeOrder(index, b.key) ||
        compareText(a.label, b.label),
    )
    .map(entry => monthlyRow(entry.key, entry.label, entry.counts));
  return { months: window, monthLabels: window.map(monthLabel), rows, total: monthlyRow(MONTHLY_TOTAL_KEY, 'GERAL', totals) };
}

/** Variação para exibir: "+3 (+50%)", "−2 (−40%)", "0", "+4 (novo)" quando o mês anterior teve zero. */
export function diffLabel(row: Pick<MonthlyRow, 'diff' | 'diffPercent'>) {
  const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
  const absolute = `${sign(row.diff)}${Math.abs(row.diff)}`;
  if (row.diff === 0) return '0';
  if (row.diffPercent === null) return `${absolute} (novo)`;
  return `${absolute} (${sign(row.diffPercent)}${Math.abs(Math.round(row.diffPercent))}%)`;
}

/** Aba 7, Histograma de mão de obra (11/11/2026): o efetivo diário da obra, no formato da planilha
 * "ATR Histograma - Todas as obras" usada até então, com as mesmas colunas — Obra, Data, Empresa, Função,
 * Número de funcionários e Observação —, uma linha por empresa × função × dia. Lança quem tem o módulo
 * liberado e não é do papel consulta; os demais com o módulo só consultam. Vive fora do snapshot do
 * planejamento (migração 0045), com API própria em /api/histograma. Tudo aqui é puro: as regras de grafia
 * e as contas da tela (série, resumo, ranking, folha do dia) rodam no navegador e nos testes. */

export type HeadcountId = string;
export type HeadcountOrigin = 'app' | 'planilha';

/** Uma linha do efetivo: quantas pessoas de uma função, de uma empresa, estavam na obra num dia. */
export interface HeadcountEntry {
  id: HeadcountId;
  workId: string;
  /** Data civil do dia trabalhado, AAAA-MM-DD. */
  workedOn: string;
  company: string;
  role: string;
  quantity: number;
  /** "Observação" da planilha: falta, atestado, day off. */
  note: string;
  origin: HeadcountOrigin;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface HeadcountData {
  entries: HeadcountEntry[];
}

export type HeadcountResponse = ({ available: true; canEdit: boolean } & HeadcountData) | { available: false };

export const HEADCOUNT_LIMITS = { name: 80, note: 300, quantity: 500, copy: 400 } as const;

export const HEADCOUNT_READ_ONLY_MESSAGE = 'O papel consulta só visualiza o histograma. Peça a um administrador para lançar.';

/** Comandos da aba 7. `save_entry` sem `id` cria; com `id`, edita. `copy_day` repete as equipes de um dia
 * em outro que ainda está vazio — o efetivo muda pouco de um dia para o outro, e é o gesto de todo dia. */
export type HeadcountCommand =
  | {
      type: 'save_entry';
      id?: HeadcountId;
      workId: string;
      workedOn: string;
      company: string;
      role: string;
      quantity: number;
      note?: string;
    }
  | { type: 'delete_entry'; id: HeadcountId }
  | { type: 'copy_day'; workId: string; from: string; to: string };

// ----- Grafia -----

export const cleanHeadcountName = (text: string) => text.replace(/\s+/g, ' ').trim();
/** Chave de comparação: sem acento, caixa nem espaço sobrando ("ATR " = "ATR", "Mestre De Obra" = "Mestre de obra"). */
export const headcountKey = (text: string) => cleanHeadcountName(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const OWN_COMPANIES = new Set(['atr', 'atr incorporadora', 'takt', 'takt engenharia']);
/** Mão de obra própria (ATR e Takt); o resto é empreiteiro. */
export const isOwnCompany = (company: string) => OWN_COMPANIES.has(headcountKey(company));

/** A grafia que já existe na obra para o texto digitado, ou o próprio texto limpo. */
export function existingSpelling(text: string, names: readonly string[]): string {
  const key = headcountKey(text);
  return names.find(name => headcountKey(name) === key) ?? cleanHeadcountName(text);
}

// ----- Datas (AAAA-MM-DD) -----

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]);
}
const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const addDays = (iso: string, days: number) => new Date(toUtc(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10);
/** 0 = domingo … 6 = sábado. */
export const weekday = (iso: string) => toUtc(iso).getUTCDay();
export const isWeekend = (iso: string) => weekday(iso) === 0 || weekday(iso) === 6;
export const formatDay = (iso: string, withYear = true) => {
  const [y, m, d] = iso.split('-');
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
};
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const weekdayName = (iso: string) => WEEKDAYS[weekday(iso)];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Dias úteis (seg–sex) depois de `from` até `to`, inclusive. Não conhece feriado. */
export function workdaysBetween(from: string, to: string): number {
  let count = 0;
  for (let day = addDays(from, 1); day <= to; day = addDays(day, 1)) if (!isWeekend(day)) count++;
  return count;
}

// ----- Contas da tela -----

export interface HeadcountFilter {
  from: string;
  to: string;
}
export type HeadcountGrain = 'dia' | 'semana' | 'mes';
export type HeadcountCut = 'vinculo' | 'empresa' | 'funcao';
export const OWN_LABEL = 'Próprio (ATR/Takt)';
export const CONTRACTOR_LABEL = 'Empreiteiros';
export const OTHERS_LABEL = 'Demais';

const inFilter = (entry: HeadcountEntry, filter: HeadcountFilter) => entry.workedOn >= filter.from && entry.workedOn <= filter.to;

function bucketStart(day: string, grain: HeadcountGrain): string {
  if (grain === 'dia') return day;
  if (grain === 'semana') return addDays(day, -((weekday(day) + 6) % 7)); // segunda-feira
  return `${day.slice(0, 7)}-01`;
}
function bucketLabel(start: string, grain: HeadcountGrain): string {
  if (grain === 'mes') return `${MONTHS[Number(start.slice(5, 7)) - 1]}/${start.slice(2, 4)}`;
  return formatDay(start, false);
}

export interface HeadcountPoint {
  start: string;
  label: string;
  /** Dias que entraram na média (no grão "dia", sempre 1). */
  days: number;
  total: number;
  values: Record<string, number>;
}
export interface HeadcountSeries {
  keys: string[];
  points: HeadcountPoint[];
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Efetivo ao longo do tempo, empilhado pelo corte. No grão "dia" o valor é a soma do dia; em semana e mês
 * é a MÉDIA DIÁRIA: homens-dia do período ÷ dias úteis (seg–sex) com lançamento. Sábado e domingo têm
 * equipe reduzida e ficam fora da média (se o período só tiver fim de semana, valem os dias que houver).
 * Empresa e função guardam as `top` maiores do período e juntam o resto em "Demais". */
export function headcountSeries(
  entries: readonly HeadcountEntry[],
  filter: HeadcountFilter,
  grain: HeadcountGrain,
  cut: HeadcountCut,
  top = 8,
): HeadcountSeries {
  const keyOf = (entry: HeadcountEntry) =>
    cut === 'empresa' ? entry.company : cut === 'funcao' ? entry.role : isOwnCompany(entry.company) ? OWN_LABEL : CONTRACTOR_LABEL;
  type Bucket = { workdays: Set<string>; all: Set<string>; onWorkdays: Map<string, number>; onAll: Map<string, number> };
  const buckets = new Map<string, Bucket>();
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (!inFilter(entry, filter)) continue;
    const start = bucketStart(entry.workedOn, grain);
    let bucket = buckets.get(start);
    if (!bucket) {
      bucket = { workdays: new Set(), all: new Set(), onWorkdays: new Map(), onAll: new Map() };
      buckets.set(start, bucket);
    }
    const key = keyOf(entry);
    bucket.all.add(entry.workedOn);
    bucket.onAll.set(key, (bucket.onAll.get(key) ?? 0) + entry.quantity);
    if (!isWeekend(entry.workedOn)) {
      bucket.workdays.add(entry.workedOn);
      bucket.onWorkdays.set(key, (bucket.onWorkdays.get(key) ?? 0) + entry.quantity);
    }
    totals.set(key, (totals.get(key) ?? 0) + entry.quantity);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key]) => key);
  const limited = cut !== 'vinculo';
  const kept = limited ? ranked.slice(0, top) : ranked;
  const keptSet = new Set(kept);
  const keys = limited && ranked.length > top ? [...kept, OTHERS_LABEL] : kept;

  const points = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([start, bucket]): HeadcountPoint => {
      const useWorkdays = grain !== 'dia' && bucket.workdays.size > 0;
      const sums = useWorkdays ? bucket.onWorkdays : bucket.onAll;
      const days = grain === 'dia' ? 1 : useWorkdays ? bucket.workdays.size : bucket.all.size;
      const values: Record<string, number> = Object.fromEntries(keys.map(key => [key, 0]));
      let total = 0;
      for (const [key, sum] of sums) {
        const target = keptSet.has(key) ? key : OTHERS_LABEL;
        values[target] = (values[target] ?? 0) + sum / days;
        total += sum / days;
      }
      for (const key of keys) values[key] = round1(values[key]);
      return { start, label: bucketLabel(start, grain), days, total: round1(total), values };
    });
  return { keys, points };
}

export interface HeadcountSummary {
  /** Soma de pessoas × dias no período. */
  manDays: number;
  /** Dias (de qualquer tipo) com lançamento. */
  days: number;
  /** Média de pessoas por dia útil com lançamento. */
  dailyAverage: number;
  peak: number;
  peakDay: string | null;
  /** Parcela dos homens-dia que é de empreiteiro (0–1). */
  contractorShare: number;
  companies: number;
  roles: number;
}

export function headcountSummary(entries: readonly HeadcountEntry[], filter: HeadcountFilter): HeadcountSummary {
  const perDay = new Map<string, number>();
  const companies = new Set<string>();
  const roles = new Set<string>();
  let manDays = 0;
  let contractors = 0;
  for (const entry of entries) {
    if (!inFilter(entry, filter)) continue;
    perDay.set(entry.workedOn, (perDay.get(entry.workedOn) ?? 0) + entry.quantity);
    manDays += entry.quantity;
    if (!isOwnCompany(entry.company)) contractors += entry.quantity;
    companies.add(headcountKey(entry.company));
    roles.add(headcountKey(entry.role));
  }
  let peak = 0;
  let peakDay: string | null = null;
  let onWorkdays = 0;
  let workdays = 0;
  for (const [day, total] of perDay) {
    if (total > peak || (total === peak && peakDay !== null && day < peakDay)) {
      peak = total;
      peakDay = day;
    }
    if (!isWeekend(day)) {
      onWorkdays += total;
      workdays++;
    }
  }
  return {
    manDays,
    days: perDay.size,
    dailyAverage: workdays > 0 ? onWorkdays / workdays : perDay.size > 0 ? manDays / perDay.size : 0,
    peak,
    peakDay,
    contractorShare: manDays > 0 ? contractors / manDays : 0,
    companies: companies.size,
    roles: roles.size,
  };
}

export interface HeadcountRankRow {
  name: string;
  manDays: number;
  /** Homens-dia ÷ dias em que apareceu: o tamanho típico da equipe quando está na obra. */
  averagePresent: number;
  daysPresent: number;
  peak: number;
  own?: boolean;
}

export function headcountRanking(
  entries: readonly HeadcountEntry[],
  filter: HeadcountFilter,
  by: 'empresa' | 'funcao',
): HeadcountRankRow[] {
  // Soma por (item, dia): uma empresa tem várias funções no mesmo dia.
  const perItem = new Map<string, { name: string; days: Map<string, number> }>();
  for (const entry of entries) {
    if (!inFilter(entry, filter)) continue;
    const name = by === 'empresa' ? entry.company : entry.role;
    const key = headcountKey(name);
    let item = perItem.get(key);
    if (!item) {
      item = { name, days: new Map() };
      perItem.set(key, item);
    }
    item.days.set(entry.workedOn, (item.days.get(entry.workedOn) ?? 0) + entry.quantity);
  }
  return [...perItem.values()]
    .map(({ name, days }) => {
      const values = [...days.values()];
      const manDays = values.reduce((sum, value) => sum + value, 0);
      return {
        name,
        manDays,
        daysPresent: days.size,
        averagePresent: manDays / days.size,
        peak: Math.max(...values),
        ...(by === 'empresa' ? { own: isOwnCompany(name) } : {}),
      };
    })
    .sort((a, b) => b.manDays - a.manDays || a.name.localeCompare(b.name));
}

/** Dias com lançamento, em ordem: alimenta o navegador da folha do dia. */
export const launchedDays = (entries: readonly HeadcountEntry[]) => [...new Set(entries.map(e => e.workedOn))].sort();

export interface HeadcountCrew {
  company: string;
  own: boolean;
  total: number;
  rows: HeadcountEntry[];
}

/** O efetivo de um dia, como na folha de campo: empresa › funções. Próprio primeiro, depois as maiores. */
export function crewsOfDay(entries: readonly HeadcountEntry[], day: string): HeadcountCrew[] {
  const crews = new Map<string, HeadcountCrew>();
  for (const entry of entries) {
    if (entry.workedOn !== day) continue;
    const key = headcountKey(entry.company);
    let crew = crews.get(key);
    if (!crew) {
      crew = { company: entry.company, own: isOwnCompany(entry.company), total: 0, rows: [] };
      crews.set(key, crew);
    }
    crew.total += entry.quantity;
    crew.rows.push(entry);
  }
  const list = [...crews.values()];
  for (const crew of list) crew.rows.sort((a, b) => b.quantity - a.quantity || a.role.localeCompare(b.role));
  return list.sort((a, b) => Number(b.own) - Number(a.own) || b.total - a.total || a.company.localeCompare(b.company));
}

/** Empresas e funções já lançadas na obra, da mais usada para a menos: as sugestões da tela. */
export function headcountCatalog(entries: readonly HeadcountEntry[]): { companies: string[]; roles: string[] } {
  const count = (pick: (e: HeadcountEntry) => string) => {
    const uses = new Map<string, { name: string; uses: number }>();
    for (const entry of entries) {
      const key = headcountKey(pick(entry));
      const item = uses.get(key);
      if (item) item.uses++;
      else uses.set(key, { name: pick(entry), uses: 1 });
    }
    return [...uses.values()].sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name)).map(item => item.name);
  };
  return { companies: count(e => e.company), roles: count(e => e.role) };
}

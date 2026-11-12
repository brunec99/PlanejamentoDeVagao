import { cleanHeadcountName, headcountKey } from './headcount';

/** Aba 8, Controle de produtividade (11/11/2026): o lançamento diário de serviço × empreiteiro × equipe ×
 * produção, no formato da planilha "ATR - Controle da produção" usada até então, com as mesmas colunas —
 * Obra, Serviço, Empreiteiro, Data, Qtd profissionais, Qtd ajudantes, Produção, Unid. e Obs. O índice que
 * sai dele é a produção por homem-dia (a coluna "PRODUÇÃO/homem*dia" da planilha). Lança quem tem o módulo
 * liberado e não é do papel consulta. Vive fora do snapshot do planejamento (migração 0046), com API
 * própria em /api/produtividade. Tudo aqui é puro. */

export type ProductionId = string;
export type ProductionOrigin = 'app' | 'planilha';

export const PRODUCTION_UNITS = ['m²', 'm³', 'm', 'kg', 'un', 'vb', 't'] as const;
export type ProductionUnit = (typeof PRODUCTION_UNITS)[number];

/** Uma linha do controle: a equipe de um empreiteiro num serviço, num dia, e o que ela produziu. */
export interface ProductionEntry {
  id: ProductionId;
  workId: string;
  /** Data civil do dia trabalhado, AAAA-MM-DD. */
  workedOn: string;
  service: string;
  contractor: string;
  professionals: number;
  helpers: number;
  /** null = equipe lançada, produção ainda não medida. */
  quantity: number | null;
  /** Vazia só enquanto a produção não foi medida. */
  unit: ProductionUnit | '';
  /** "Obs." da planilha: trecho, pavimento, motivo de parada. */
  note: string;
  origin: ProductionOrigin;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionData {
  entries: ProductionEntry[];
}

export type ProductionResponse = ({ available: true; canEdit: boolean } & ProductionData) | { available: false };

export const PRODUCTION_LIMITS = { name: 80, note: 300, crew: 200, quantity: 99_999_999, copy: 200 } as const;

export const PRODUCTION_READ_ONLY_MESSAGE =
  'O papel consulta só visualiza o controle de produtividade. Peça a um administrador para lançar.';

/** Comandos da aba 8. `save_entry` sem `id` cria; com `id`, edita. `quantity: null` é "a medir".
 * `copy_day` repete as equipes de um dia em outro ainda vazio, sem a produção e sem as observações. */
export type ProductionCommand =
  | {
      type: 'save_entry';
      id?: ProductionId;
      workId: string;
      workedOn: string;
      service: string;
      contractor: string;
      professionals: number;
      helpers: number;
      quantity: number | null;
      unit: string;
      note?: string;
    }
  | { type: 'delete_entry'; id: ProductionId }
  | { type: 'copy_day'; workId: string; from: string; to: string };

// ----- Unidade -----

const UNIT_BY_SPELLING: Record<string, ProductionUnit> = {
  m2: 'm²',
  'm²': 'm²',
  m3: 'm³',
  'm³': 'm³',
  m: 'm',
  ml: 'm',
  'm/l': 'm',
  kg: 'kg',
  kgs: 'kg',
  un: 'un',
  und: 'un',
  unid: 'un',
  uni: 'un',
  ud: 'un',
  u: 'un',
  umd: 'un',
  vb: 'vb',
  t: 't',
};
/** "M2", "m2", "M²" → "m²"; "und", "Ud" → "un"; "ml", "m/L" → "m". O que não reconhece vira vazio. */
export const normalizeUnit = (text: string | null | undefined): ProductionUnit | '' =>
  UNIT_BY_SPELLING[cleanHeadcountName(text ?? '').toLowerCase()] ?? '';

// ----- Contas da tela -----

/** Pessoas na frente de serviço. */
export const crewSize = (entry: Pick<ProductionEntry, 'professionals' | 'helpers'>) => entry.professionals + entry.helpers;

/** Produção por homem-dia de uma linha; null enquanto a produção não foi medida. */
export function perManDay(entry: Pick<ProductionEntry, 'professionals' | 'helpers' | 'quantity'>): number | null {
  const crew = crewSize(entry);
  return entry.quantity !== null && entry.quantity > 0 && crew > 0 ? entry.quantity / crew : null;
}

export interface ProductionFilter {
  from: string;
  to: string;
}
const inFilter = (entry: ProductionEntry, filter: ProductionFilter) => entry.workedOn >= filter.from && entry.workedOn <= filter.to;

export interface ProductionSummary {
  entries: number;
  /** Linhas com produção medida. */
  measured: number;
  /** Linhas ainda "a medir". */
  pending: number;
  /** Homens-dia lançados (com ou sem produção). */
  manDays: number;
  days: number;
  services: number;
  contractors: number;
}

export function productionSummary(entries: readonly ProductionEntry[], filter: ProductionFilter): ProductionSummary {
  const days = new Set<string>();
  const services = new Set<string>();
  const contractors = new Set<string>();
  let count = 0;
  let measured = 0;
  let manDays = 0;
  for (const entry of entries) {
    if (!inFilter(entry, filter)) continue;
    count++;
    if (entry.quantity !== null) measured++;
    manDays += crewSize(entry);
    days.add(entry.workedOn);
    services.add(headcountKey(entry.service));
    contractors.add(headcountKey(entry.contractor));
  }
  return {
    entries: count,
    measured,
    pending: count - measured,
    manDays,
    days: days.size,
    services: services.size,
    contractors: contractors.size,
  };
}

export interface ProductivityRow {
  /** Serviço (na tabela principal) ou empreiteiro (no detalhe do serviço). */
  name: string;
  unit: ProductionUnit;
  /** Produção somada das linhas medidas nesta unidade. */
  quantity: number;
  /** Homens-dia dessas mesmas linhas. */
  manDays: number;
  /** Produção ÷ homens-dia: a média ponderada do período, não a média das linhas. */
  perManDay: number;
  /** Linhas medidas que entraram na conta. */
  measured: number;
  /** Linhas do mesmo serviço ainda sem produção (não entram na conta). */
  pending: number;
  best: number;
  worst: number;
}

/** Produtividade por serviço (ou por empreiteiro dentro de um serviço), só com as linhas medidas. Um
 * serviço lançado em duas unidades (m² e m) vira duas linhas: somar unidades diferentes não diz nada.
 * A produção por homem-dia é a ponderada — produção total ÷ homens-dia —, para o dia de equipe grande
 * pesar mais que o de uma pessoa só. */
export function productivityBy(
  entries: readonly ProductionEntry[],
  filter: ProductionFilter,
  by: 'service' | 'contractor',
  onlyService?: string,
): ProductivityRow[] {
  type Group = { name: string; unit: ProductionUnit; quantity: number; manDays: number; measured: number; best: number; worst: number };
  const groups = new Map<string, Group>();
  const pending = new Map<string, number>();
  const wanted = onlyService === undefined ? undefined : headcountKey(onlyService);
  for (const entry of entries) {
    if (!inFilter(entry, filter)) continue;
    if (wanted !== undefined && headcountKey(entry.service) !== wanted) continue;
    const name = by === 'service' ? entry.service : entry.contractor;
    const nameKey = headcountKey(name);
    const rate = perManDay(entry);
    if (rate === null || entry.unit === '') {
      pending.set(nameKey, (pending.get(nameKey) ?? 0) + 1);
      continue;
    }
    const key = `${nameKey}|${entry.unit}`;
    let group = groups.get(key);
    if (!group) {
      group = { name, unit: entry.unit, quantity: 0, manDays: 0, measured: 0, best: rate, worst: rate };
      groups.set(key, group);
    }
    group.quantity += entry.quantity ?? 0;
    group.manDays += crewSize(entry);
    group.measured++;
    group.best = Math.max(group.best, rate);
    group.worst = Math.min(group.worst, rate);
  }
  return [...groups.values()]
    .map(group => ({ ...group, perManDay: group.quantity / group.manDays, pending: pending.get(headcountKey(group.name)) ?? 0 }))
    .sort((a, b) => b.measured - a.measured || a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit));
}

/** As linhas de um dia, por serviço e empreiteiro. */
export const entriesOfDay = (entries: readonly ProductionEntry[], day: string) =>
  entries
    .filter(entry => entry.workedOn === day)
    .sort(
      (a, b) => a.service.localeCompare(b.service) || a.contractor.localeCompare(b.contractor) || a.createdAt.localeCompare(b.createdAt),
    );

export const productionDays = (entries: readonly ProductionEntry[]) => [...new Set(entries.map(e => e.workedOn))].sort();

export interface ProductionCatalog {
  /** Do mais usado para o menos; `unit` é a unidade mais lançada para o serviço. */
  services: { name: string; unit: ProductionUnit | ''; uses: number }[];
  contractors: { name: string; uses: number }[];
}

/** Serviços e empreiteiros já lançados na obra: as sugestões da tela, e a unidade que o serviço costuma ter. */
export function productionCatalog(entries: readonly ProductionEntry[]): ProductionCatalog {
  const services = new Map<string, { name: string; uses: number; units: Map<ProductionUnit, number> }>();
  const contractors = new Map<string, { name: string; uses: number }>();
  for (const entry of entries) {
    const serviceKey = headcountKey(entry.service);
    let service = services.get(serviceKey);
    if (!service) {
      service = { name: entry.service, uses: 0, units: new Map() };
      services.set(serviceKey, service);
    }
    service.uses++;
    if (entry.unit) service.units.set(entry.unit, (service.units.get(entry.unit) ?? 0) + 1);
    const contractorKey = headcountKey(entry.contractor);
    const contractor = contractors.get(contractorKey);
    if (contractor) contractor.uses++;
    else contractors.set(contractorKey, { name: entry.contractor, uses: 1 });
  }
  const byUse = <T extends { name: string; uses: number }>(a: T, b: T) => b.uses - a.uses || a.name.localeCompare(b.name);
  return {
    services: [...services.values()]
      .map(s => ({ name: s.name, uses: s.uses, unit: [...s.units].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ('' as const) }))
      .sort(byUse),
    contractors: [...contractors.values()].sort(byUse),
  };
}

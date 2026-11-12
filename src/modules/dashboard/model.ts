import type { LocalDate } from '@/domain/entities';
import { addDays, startOfWeek } from '@/domain/validation';
import { weekNumberFrom } from '@/domain/week-numbering';
import { textKey } from '@/modules/curto-prazo/sheet-view';
import { formatDate } from '@/shared/format';
import type { Segment } from '@/modules/curto-prazo/closing-dashboard';
import { parsePeriodParams, periodSearchEntries, weekPeriod, type DashboardPeriod, type PeriodSelection } from './period';

/** Aba 0, Dashboard da obra (04/11/2026, modelo aprovado pelo usuário): os cinco níveis numa página, até a
 * semana analisada, só com os módulos que a pessoa pode abrir e que têm dado nesta obra. Este arquivo é o
 * contrato comum aos quadros (`long-term-panel.ts`, `wagons-panel.ts`, `medium-term-panel.ts`,
 * `short-term-panel.ts`, `terminality-panel.ts`), à tela (`dashboard-overview.tsx`) e ao PDF
 * (`dashboard-print.tsx`): filtros, data de referência, cartões do resumo e a URL da impressão. Tudo puro. */

export type { Segment };

/** Desde 12/11/2026 (modelo "Dashboards completos e resumo semanal") a aba 0 e o Dashboard geral têm os mesmos
 * onze quadros: os cinco de 04/11 e os seis novos (`balanco` = IDP da Linha de Balanço e Gantt de legalização). */
export type DashboardModule =
  | 'longo-prazo'
  | 'balanco'
  | 'vagoes'
  | 'medio-prazo'
  | 'curto-prazo'
  | 'restricoes'
  | 'terminalidade'
  | 'histograma'
  | 'produtividade'
  | 'seguranca'
  | 'checklist';
/** Os quadros do Dashboard geral: os mesmos da aba 0 (até 12/11/2026 o geral tinha a segurança a mais). */
export type PortfolioModule = DashboardModule;
export interface DashboardModuleInfo<M extends PortfolioModule = DashboardModule> {
  id: M;
  /** O código da tela no menu ("1.3"), desde 12/11/2026; os vagões abrem pelo longo prazo e levam o dele. */
  number: string;
  label: string;
  /** A seção de `module-access` que libera o quadro (`balanco` segue o longo prazo). */
  section: string;
  /** O caminho da tela de origem dentro da obra ("histograma" em `/obras/{id}/histograma`). */
  path: string;
}
/** Na ordem do menu (regra 1 do modelo de 12/11/2026); os vagões ficam junto do longo prazo. */
export const DASHBOARD_MODULES: readonly DashboardModuleInfo[] = [
  { id: 'longo-prazo', number: '1.1', label: 'Longo prazo', section: 'longo-prazo', path: 'longo-prazo' },
  { id: 'balanco', number: '1.1', label: 'Linha de Balanço e legalização', section: 'longo-prazo', path: 'longo-prazo' },
  { id: 'vagoes', number: '1.1', label: 'Vagões', section: 'vagoes', path: 'vagoes' },
  { id: 'medio-prazo', number: '1.2', label: 'Médio prazo', section: 'medio-prazo', path: 'medio-prazo' },
  { id: 'curto-prazo', number: '1.3', label: 'Curto prazo', section: 'curto-prazo', path: 'curto-prazo' },
  { id: 'restricoes', number: '1.4', label: 'Quadro de Restrições', section: 'restricoes', path: 'restricoes' },
  { id: 'terminalidade', number: '2.1', label: 'Terminalidade', section: 'terminalidade', path: 'terminalidade' },
  { id: 'histograma', number: '2.2', label: 'Histograma', section: 'histograma', path: 'histograma' },
  { id: 'produtividade', number: '2.3', label: 'Produtividade', section: 'produtividade', path: 'produtividade' },
  { id: 'seguranca', number: '3.1', label: 'Segurança do trabalho', section: 'seguranca', path: 'seguranca' },
  { id: 'checklist', number: '3.2', label: 'Checklist de equipamentos', section: 'checklist', path: 'checklist' },
];
export const PORTFOLIO_MODULES: readonly DashboardModuleInfo<PortfolioModule>[] = DASHBOARD_MODULES;
/** Os seis quadros de 12/11/2026, que leem `GET /api/dashboard/extras` (e, no `balanco`, o planejamento). */
export const EXTRA_MODULES = ['balanco', 'restricoes', 'histograma', 'produtividade', 'seguranca', 'checklist'] as const;
export type ExtraModule = (typeof EXTRA_MODULES)[number];
export const isExtraModule = (value: unknown): value is ExtraModule => EXTRA_MODULES.includes(value as ExtraModule);
export const isDashboardModule = (value: unknown): value is DashboardModule =>
  typeof value === 'string' && DASHBOARD_MODULES.some(m => m.id === value);
export const isPortfolioModule = (value: unknown): value is PortfolioModule =>
  typeof value === 'string' && PORTFOLIO_MODULES.some(m => m.id === value);
export function moduleInfo(id: DashboardModule): DashboardModuleInfo;
export function moduleInfo(id: PortfolioModule): DashboardModuleInfo<PortfolioModule>;
export function moduleInfo(id: PortfolioModule): DashboardModuleInfo<PortfolioModule> {
  return PORTFOLIO_MODULES.find(m => m.id === id)!;
}

/** Filtros da aba 0 (regra 4 do modelo). `week` é a segunda-feira da semana analisada. `companies` guarda
 * os nomes de empreiteiro como aparecem no seletor; a comparação é por `textKey` (sem acento nem caixa), porque
 * o nome é digitado à mão no curto prazo e na terminalidade. `floors` guarda as chaves normalizadas dos
 * pavimentos (`floorKey`), pareando a terminalidade e o longo prazo pelo nome. `modules` são os quadros
 * marcados; ausente = todos. Conjunto ausente = sem recorte. */
export interface DashboardFilters {
  week: LocalDate;
  /** Escala e período escolhidos (04/11/2026, escalas de tempo); ausente = a semana `week`. Viaja na URL da impressão. */
  selection?: PeriodSelection;
  companies?: ReadonlySet<string>;
  floors?: ReadonlySet<string>;
  modules?: ReadonlySet<DashboardModule>;
}
export const companyKey = textKey;
export const floorKey = textKey;
/** A empresa passa no recorte? Sem recorte, tudo passa; a linha sem empresa só passa sem recorte. */
export function matchesCompany(filters: Pick<DashboardFilters, 'companies'>, company: string | undefined): boolean {
  if (!filters.companies) return true;
  const key = companyKey(company ?? '');
  if (!key) return false;
  for (const chosen of filters.companies) if (companyKey(chosen) === key) return true;
  return false;
}
export function matchesFloor(filters: Pick<DashboardFilters, 'floors'>, floorName: string | undefined): boolean {
  return !filters.floors || filters.floors.has(floorKey(floorName ?? ''));
}
export const moduleShown = (filters: Pick<DashboardFilters, 'modules'>, module: DashboardModule) =>
  !filters.modules || filters.modules.has(module);
export const hasCompanyFilter = (filters: Pick<DashboardFilters, 'companies'>) => !!filters.companies;
export const hasFloorFilter = (filters: Pick<DashboardFilters, 'floors'>) => !!filters.floors;

/** A data de referência (regra 3): todo quadro conta até o sábado da semana analisada e nada depois.
 * `firstWeek` é a semana 1 da obra (configurações ou a primeira semana com linha), para numerar as semanas
 * como a planilha. Com as escalas de tempo (04/11/2026), a "semana analisada" é a última semana do período:
 * `week`/`weekEnd` são `period.lastWeek`/`period.end`, e os retratos continuam tirados nesse sábado. */
export interface DashboardReference {
  /** Segunda-feira da semana analisada (a última semana do período). */
  week: LocalDate;
  /** Sábado da semana analisada: a data até a qual tudo conta. */
  weekEnd: LocalDate;
  weekNumber: number;
  currentWeek: LocalDate;
  today: LocalDate;
  firstWeek: LocalDate;
  /** O período analisado (escala, semanas, série, anterior). Na escala semanal, a própria semana. */
  period: DashboardPeriod;
}
/** Sem `period`, o período é a semana `week` (escala semanal), como antes das escalas de tempo. Com `period`,
 * `week` é ignorada: a semana de referência é a última do período. */
export function referenceOf(week: LocalDate, today: LocalDate, firstWeek: LocalDate, period?: DashboardPeriod): DashboardReference {
  const resolved = period ?? weekPeriod(week, firstWeek);
  const monday = resolved.lastWeek;
  return {
    week: monday,
    weekEnd: addDays(monday, 5),
    weekNumber: weekNumberFrom(firstWeek, monday),
    currentWeek: startOfWeek(today),
    today,
    firstWeek,
    period: resolved,
  };
}
/** "semana 64" na escala semanal; o rótulo do período nas demais ("outubro de 2026"). */
export const periodName = (ref: Pick<DashboardReference, 'period' | 'weekNumber'>) =>
  ref.period.scale === 'semana' ? `semana ${ref.weekNumber}` : ref.period.label;
/** A escala é a semanal (os quadros mostram o que mostravam antes das escalas de tempo). */
export const isWeekly = (ref: Pick<DashboardReference, 'period'>) => ref.period.scale === 'semana';
export const weekNumberOf = (ref: Pick<DashboardReference, 'firstWeek'>, weekStart: LocalDate) => weekNumberFrom(ref.firstWeek, weekStart);

/** Estados de cor, sempre acompanhados de texto (regra 10): bom, atenção, crítico, neutro e "esta obra/semana". */
export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'here';
/** Um cartão do resumo no topo: o indicador principal de um módulo, dizendo de que aba vem. */
export interface KpiCard {
  /** A aba de origem; `seguranca` só aparece no Dashboard geral. */
  module: PortfolioModule;
  label: string;
  value: string;
  tag?: { text: string; tone: Tone };
  hint: string;
  /** O cartão em destaque (o PPC da semana, quando o curto prazo está presente). */
  main?: boolean;
  /** Cor do número; ausente = neutra. */
  tone?: Tone;
}
/** O que cada quadro entrega ao resumo: o cartão e a parte dele na frase do topo. */
export interface PanelSummary {
  kpi: KpiCard;
  sentence: Segment[];
}
/** Estado de carga de um quadro na tela e no PDF. `absent` = o módulo não tem dado nesta obra (ou a pessoa
 * não pode abri-lo); só ele some da página. `error` deixa só aquele quadro como indisponível. */
export type PanelState<T> =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'absent' } | { status: 'ready'; data: T };

// ─── URL da impressão (regra 11): os filtros seguem na URL, como nos PDFs de hoje ────────────────────
const isLocalDate = (value: unknown): value is LocalDate => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const list = (value: string | string[] | undefined): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);

export function dashboardSearchParams(filters: DashboardFilters): URLSearchParams {
  const entries =
    filters.selection && filters.selection.scale !== 'semana' ? periodSearchEntries(filters.selection) : [['semana', filters.week]];
  const params = new URLSearchParams(entries);
  if (filters.companies) for (const company of filters.companies) params.append('empreiteiro', company);
  if (filters.floors) for (const floor of filters.floors) params.append('pavimento', floor);
  if (filters.modules) params.set('quadros', [...filters.modules].join(','));
  return params;
}
export const printDashboardPath = (workId: string, filters: DashboardFilters) =>
  `/imprimir/dashboard/${encodeURIComponent(workId)}?${dashboardSearchParams(filters)}`;

/** Lê os filtros da URL. Semana inválida ou ausente fica indefinida (a página usa a semana atual); lista
 * vazia de quadros vale como "todos". Escala e período (`escala`, `periodo`, `de`, `ate`, `agrupar`) vêm em
 * `selection`; o link antigo só com `semana` vira a escala semanal. */
export function parseDashboardParams(raw: Record<string, string | string[] | undefined>): Partial<DashboardFilters> {
  const semana = Array.isArray(raw.semana) ? raw.semana[0] : raw.semana;
  const companies = list(raw.empreiteiro);
  const floors = list(raw.pavimento).map(floorKey).filter(Boolean);
  const modules = list(raw.quadros)
    .flatMap(value => value.split(','))
    .map(value => value.trim())
    .filter(isDashboardModule);
  const selection = parsePeriodParams(raw);
  return {
    ...(isLocalDate(semana) ? { week: startOfWeek(semana) } : {}),
    ...(selection ? { selection } : {}),
    ...(companies.length ? { companies: new Set(companies) } : {}),
    ...(floors.length ? { floors: new Set(floors) } : {}),
    ...(modules.length ? { modules: new Set(modules) } : {}),
  };
}

// ─── Rótulos compartilhados pelos quadros ────────────────────────────────────────────────────────────
export const pct = (value: number) => `${Math.round(value)}%`;
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** "+4 p.p." / "−5 p.p." / "0 p.p.", com o sinal de menos tipográfico. */
export const signedPoints = (delta: number) => `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(Math.round(delta))} p.p.`;
export const signedDays = (days: number) => `${days > 0 ? '+' : days < 0 ? '−' : ''}${Math.abs(days)}`;
export const dayMonth = (date: LocalDate) => formatDate(date).slice(0, 5);
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "out/26" a partir de "2026-10". */
export const monthShort = (month: string) => `${MONTHS_SHORT[Number(month.slice(5, 7)) - 1] ?? month}/${month.slice(2, 4)}`;
/** "outubro de 2026" a partir de "2026-10". */
export const monthLong = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
export const monthOf = (date: LocalDate) => date.slice(0, 7);
/** Os meses de `from` a `to`, inclusive, como "AAAA-MM". */
export function monthsBetween(from: LocalDate, to: LocalDate): string[] {
  const out: string[] = [];
  let [year, month] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const last = monthOf(to);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    out.push(key);
    if (key >= last || out.length > 600) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}
/** Último dia do mês "AAAA-MM". */
export function monthEnd(month: string): LocalDate {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
}
export const daysBetween = (from: LocalDate, to: LocalDate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
/** Semanas canônicas (segunda-feira) de `count` semanas terminando em `week`, da mais antiga à mais nova. */
export function lastWeeks(week: LocalDate, count: number): LocalDate[] {
  const monday = startOfWeek(week);
  return Array.from({ length: count }, (_, i) => addDays(monday, -7 * (count - 1 - i)));
}

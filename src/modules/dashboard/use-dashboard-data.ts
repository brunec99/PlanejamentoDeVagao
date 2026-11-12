'use client';
import { useEffect, useMemo, useState } from 'react';
import type { LocalDate, Work } from '@/domain/entities';
import type { LongTermPlanDocument } from '@/domain/long-term-plan';
import type { TerminalityData, TerminalityResponse } from '@/domain/terminality';
import type { ClosingRankingResponse } from '@/domain/closing-ranking';
import { startOfWeek } from '@/domain/validation';
import { hasSectionAccess } from '@/application/module-access';
import { useDeveloper, useModules, usePlanning } from '@/modules/planejamento/planning-provider';
import { useWorkSettings } from '@/modules/configuracoes/work-settings';
import { weekOptions } from '@/modules/curto-prazo/sheet-view';
import {
  companyKey,
  DASHBOARD_MODULES,
  EXTRA_MODULES,
  floorKey,
  moduleShown,
  referenceOf,
  type DashboardFilters,
  type DashboardModule,
  type DashboardReference,
  type KpiCard,
  type PanelState,
  type Segment,
} from './model';
import { resolvePeriod, selectionOf, type DashboardPeriod, type PeriodContext, type PeriodSelection } from './period';
import { composeSummary, type SummaryKey } from './summary';
import { buildLongTermPanel, longTermFloorNames, longTermSummary, type LongTermPanelData } from './long-term-panel';
import { buildWagonsPanel, wagonsSummary, type WagonsPanelData } from './wagons-panel';
import { buildMediumTermPanel, mediumTermSummary, type MediumTermPanelData } from './medium-term-panel';
import { buildShortTermPanel, shortTermCompanies, shortTermSummary, type ShortTermPanelData } from './short-term-panel';
import {
  buildTerminalityPanel,
  terminalityCompanies,
  terminalityFloorNames,
  terminalitySummary,
  type TerminalityPanelData,
} from './terminality-panel';
import type { PortfolioSafety } from './portfolio/types';
import { headcountSummary, restrictionsSummary, safetySummary, type BalancePanelData } from './extras/extras-summary';
import { dashboardExtrasPath } from './extras/blocks';
import { buildLegalizationBlock } from './extras/legalization';
import type {
  ChecklistBlock,
  DashboardExtrasResponse,
  ExtrasCell,
  HeadcountBlock,
  ProductionBlock,
  RestrictionsBlock,
  WorkExtras,
} from './extras/types';

/** Os dados da aba 0, os mesmos na tela e no PDF (regra 12 do modelo): o planejamento que a obra já
 * carrega (vagões, plano do mês, compromissos, restrições), mais as rotas que já existem (plano de longo
 * prazo, terminalidade, ranking das obras). Cada quadro tem o próprio estado: aparece quando o dado dele
 * chega, e uma falha deixa só ele como indisponível. Quem não pode abrir um módulo não vê o quadro dele
 * (a rota responderia 403 de qualquer forma). Nenhuma migração, nenhuma tabela nova.
 *
 * 12/11/2026 (modelo "Dashboards completos e resumo semanal"): seis quadros novos. Cinco chegam já calculados
 * de `GET /api/dashboard/extras`, numa leitura só por período (`de` = segunda-feira inicial, `ate` = sábado
 * final): Quadro de Restrições, histograma, produtividade, segurança e checklist, mais o IDP da Linha de
 * Balanço. A legalização sai do planejamento já carregado (`buildLegalizationBlock`). O acesso de cada quadro
 * segue a seção de `module-access` (`section`), que no `balanco` é a do longo prazo. */

type Fetched<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'absent' } | { status: 'ready'; data: T };

/** Uma leitura por URL, só quando `enabled`; 403 vira "ausente" (módulo que a pessoa não pode abrir), as
 * demais falhas viram erro com a mensagem da rota. O resultado guarda a URL que o produziu: trocar de
 * semana (o ranking) volta a "carregando" sem um setState dentro do efeito. */
function useFetched<T>(url: string | undefined, enabled: boolean, parse: (body: unknown) => Fetched<T>): Fetched<T> {
  const [result, setResult] = useState<{ url: string; state: Fetched<T> }>();
  useEffect(() => {
    if (!enabled || !url) return;
    let active = true;
    const settle = (state: Fetched<T>) => {
      if (active) setResult({ url, state });
    };
    fetch(url, { cache: 'no-store' })
      .then(async res => {
        const body: unknown = await res.json().catch(() => ({}));
        if (res.status === 403) settle({ status: 'absent' });
        else if (!res.ok) {
          const message =
            typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : 'Não foi possível carregar.';
          settle({ status: 'error', message });
        } else settle(parse(body));
      })
      .catch(() => settle({ status: 'error', message: 'Falha na comunicação com o servidor.' }));
    return () => {
      active = false;
    };
    // `parse` é estável por chamada; a leitura depende só da URL e de estar habilitada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled]);
  if (!enabled || !url) return { status: 'absent' };
  return result && result.url === url ? result.state : { status: 'loading' };
}

const parseLongTerm = (body: unknown): Fetched<LongTermPlanDocument> => {
  const plan = (body as { plan?: { document?: LongTermPlanDocument } }).plan;
  return plan?.document ? { status: 'ready', data: plan.document } : { status: 'absent' };
};
const parseTerminality = (body: unknown): Fetched<TerminalityData> => {
  const response = body as TerminalityResponse;
  return response && response.available ? { status: 'ready', data: response } : { status: 'absent' };
};
/** A obra pedida na resposta dos quadros novos; sem ela, nada (todos os quadros ficam sem dado). */
const parseExtras =
  (workId: string) =>
  (body: unknown): Fetched<WorkExtras> => {
    const works = (body as Partial<DashboardExtrasResponse> | null)?.works;
    const own = Array.isArray(works) ? (works.find(w => w.workId === workId) ?? works[0]) : undefined;
    return own ? { status: 'ready', data: own } : { status: 'absent' };
  };
/** Uma célula da leitura dos quadros novos como estado de quadro: célula ausente (sem o módulo), sem dado ou
 * migração ausente = quadro ausente; erro deixa só ele indisponível. */
function fromCell<T>(
  enabled: boolean,
  fetched: Fetched<WorkExtras>,
  pick: (extras: WorkExtras) => ExtrasCell<T> | undefined,
): PanelState<T> {
  if (!enabled) return { status: 'absent' };
  if (fetched.status !== 'ready') return fetched;
  const cell = pick(fetched.data);
  if (!cell || cell.kind === 'absent' || cell.kind === 'unavailable') return { status: 'absent' };
  if (cell.kind === 'error') return { status: 'error', message: cell.message };
  return { status: 'ready', data: cell.data };
}
const parseRanking = (body: unknown): Fetched<ClosingRankingResponse> => {
  const response = body as ClosingRankingResponse;
  return response && typeof response.available === 'boolean' ? { status: 'ready', data: response } : { status: 'absent' };
};

export interface DashboardInput {
  workId: string;
  /** Semana pedida (qualquer dia dela); ausente ou fora das opções = semana atual. Vale só sem `selection`. */
  week?: LocalDate;
  /** Escala e período (04/11/2026, escalas de tempo); ausente = escala semanal na semana `week`. */
  selection?: PeriodSelection;
  companies?: ReadonlySet<string>;
  /** Chaves normalizadas (`floorKey`). */
  floors?: ReadonlySet<string>;
  modules?: ReadonlySet<DashboardModule>;
}
export interface DashboardPanels {
  longTerm: PanelState<LongTermPanelData>;
  wagons: PanelState<WagonsPanelData>;
  medium: PanelState<MediumTermPanelData>;
  short: PanelState<ShortTermPanelData>;
  terminality: PanelState<TerminalityPanelData>;
  /** Quadros de 12/11/2026. */
  balance: PanelState<BalancePanelData>;
  restrictions: PanelState<RestrictionsBlock>;
  headcount: PanelState<HeadcountBlock>;
  production: PanelState<ProductionBlock>;
  safety: PanelState<PortfolioSafety>;
  checklist: PanelState<ChecklistBlock>;
}
/** Os quadros na ordem da tela, a de `DASHBOARD_MODULES` (a ordem do menu). */
export const PANEL_ORDER: (keyof DashboardPanels)[] = [
  'longTerm',
  'balance',
  'wagons',
  'medium',
  'short',
  'restrictions',
  'terminality',
  'headcount',
  'production',
  'safety',
  'checklist',
];
export interface DashboardReady {
  work: Work;
  actorName: string;
  ref: DashboardReference;
  filters: DashboardFilters;
  /** Semanas que o seletor oferece (segundas-feiras), da mais antiga à atual. */
  weeks: LocalDate[];
  /** O período analisado (igual a `ref.period`) e o que o seletor precisa para listar e andar entre períodos. */
  period: DashboardPeriod;
  periodContext: PeriodContext;
  companyOptions: { value: string; count: number }[];
  floorOptions: { value: string; count: number }[];
  /** Quais módulos a pessoa pode abrir (os demais não existem para ela nesta página). */
  access: Record<DashboardModule, boolean>;
  panels: DashboardPanels;
  summary: { kpis: KpiCard[]; sentence: Segment[] };
  /** Módulos que a pessoa pode abrir mas não têm dado nesta obra até a semana. */
  noData: DashboardModule[];
  unavailable: DashboardModule[];
  loading: DashboardModule[];
  /** As configurações da obra (semana 1) já responderam: o número da semana é o definitivo. */
  settingsReady: boolean;
}
export type DashboardState =
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'missing' }
  | ({ status: 'ready' } & DashboardReady);

export const PANEL_MODULE: Record<keyof DashboardPanels, DashboardModule> = {
  longTerm: 'longo-prazo',
  balance: 'balanco',
  wagons: 'vagoes',
  medium: 'medio-prazo',
  short: 'curto-prazo',
  restrictions: 'restricoes',
  terminality: 'terminalidade',
  headcount: 'histograma',
  production: 'produtividade',
  safety: 'seguranca',
  checklist: 'checklist',
};

/** Junta opções de seletor vindas de mais de um módulo, somando as contagens de grafias equivalentes. */
function mergeOptions(lists: { value: string; count: number }[][], key: (value: string) => string) {
  const merged = new Map<string, { value: string; count: number }>();
  for (const list of lists)
    for (const option of list) {
      const k = key(option.value);
      const current = merged.get(k);
      if (current) current.count += option.count;
      else merged.set(k, { value: option.value, count: option.count });
    }
  return [...merged.values()].sort(
    (a, b) => (a.value ? 0 : 1) - (b.value ? 0 : 1) || a.value.localeCompare(b.value, 'pt-BR', { numeric: true, sensitivity: 'base' }),
  );
}

/** O quadro "Linha de Balanço e legalização": pronto quando o IDP ou a legalização tem dado. A legalização vem
 * do planejamento já carregado, então não espera a leitura do IDP; uma falha do IDP só derruba o quadro quando
 * a obra também não tem legalização. */
function balanceState(
  enabled: boolean,
  lob: PanelState<NonNullable<BalancePanelData['lob']>>,
  legalization: BalancePanelData['legalization'],
): PanelState<BalancePanelData> {
  if (!enabled) return { status: 'absent' };
  if (lob.status === 'ready') return { status: 'ready', data: { lob: lob.data, ...(legalization ? { legalization } : {}) } };
  if (lob.status === 'loading') return lob;
  if (legalization) return { status: 'ready', data: { legalization } };
  return lob;
}

export function useDashboard(input: DashboardInput): DashboardState {
  const { workId } = input;
  const context = usePlanning();
  const developer = useDeveloper();
  const modules = useModules();
  const { state: settings, weekOneStart } = useWorkSettings(workId);
  const access = useMemo(
    () =>
      Object.fromEntries(DASHBOARD_MODULES.map(m => [m.id, hasSectionAccess(m.section, { developer, modules })])) as Record<
        DashboardModule,
        boolean
      >,
    [developer, modules],
  );
  const ready = context.state === 'ready';
  const planning = ready ? context.planning : undefined;
  const data = planning?.data;
  const work = data?.works.find(w => w.id === workId);
  const actor = data?.users.find(u => u.id === (ready ? context.actorId : ''));
  const allowed = !!work && !!actor?.workIds.includes(workId);

  const commitments = useMemo(() => (data && allowed ? data.commitments.filter(c => c.workId === workId) : []), [data, allowed, workId]);
  const teams = useMemo(() => (data && allowed ? data.teams.filter(t => t.workId === workId) : []), [data, allowed, workId]);
  const today = planning?.today ?? '';
  const currentWeek = today ? startOfWeek(today) : '';
  // Mesma regra da planilha: a semana 1 vem das configurações; sem ela, a primeira semana com linha.
  const firstWeek = useMemo(() => {
    if (!today) return '';
    if (weekOneStart) return weekOneStart;
    return startOfWeek(commitments.reduce((earliest, c) => (c.weekStart < earliest ? c.weekStart : earliest), today));
  }, [today, weekOneStart, commitments]);
  const weeks = useMemo(() => {
    if (!firstWeek || !currentWeek) return [];
    return [
      ...new Set([...weekOptions(firstWeek, currentWeek, 0), ...commitments.map(c => c.weekStart).filter(w => w <= currentWeek)]),
    ].sort();
  }, [firstWeek, currentWeek, commitments]);
  // O período (escalas de tempo, 04/11/2026): a primeira semana oferecida limita a lista e a série anual; sem
  // período escolhido, a escala semanal na semana pedida, ou na atual, como antes.
  const periodContext = useMemo<PeriodContext | undefined>(
    () => (currentWeek && weeks.length ? { currentWeek, since: weeks[0], anchorWeek: currentWeek } : undefined),
    [currentWeek, weeks],
  );
  const requested = input.week ? startOfWeek(input.week) : '';
  const selection: PeriodSelection | undefined =
    input.selection ?? (requested && weeks.includes(requested) ? { scale: 'semana', key: requested } : undefined);
  const selectionKey = selection ? JSON.stringify(selection) : '';
  const period = useMemo(
    () =>
      periodContext ? resolvePeriod(selectionKey ? (JSON.parse(selectionKey) as PeriodSelection) : undefined, periodContext) : undefined,
    [periodContext, selectionKey],
  );
  const week = period?.lastWeek ?? currentWeek;
  const ref = useMemo(
    () => (period && today && firstWeek ? referenceOf(period.lastWeek, today, firstWeek, period) : undefined),
    [period, today, firstWeek],
  );

  const shown = (module: DashboardModule) => allowed && access[module] && moduleShown({ modules: input.modules }, module);
  const longTerm = useFetched(`/api/long-term-plan?workId=${encodeURIComponent(workId)}`, ready && shown('longo-prazo'), parseLongTerm);
  const terminality = useFetched(
    `/api/terminalidade?workId=${encodeURIComponent(workId)}`,
    ready && shown('terminalidade'),
    parseTerminality,
  );
  const ranking = useFetched(
    week ? `/api/curto-prazo/ranking?semana=${week}&obra=${encodeURIComponent(workId)}` : undefined,
    ready && shown('curto-prazo') && commitments.length > 0,
    parseRanking,
  );
  // Quadros novos: uma leitura por período. A segurança só é pedida quando o quadro dela entra.
  const extrasWanted = EXTRA_MODULES.some(module => shown(module));
  const extrasUrl = ref
    ? dashboardExtrasPath({ start: ref.period.start, end: ref.weekEnd }, { workId, safety: shown('seguranca') })
    : undefined;
  const parseWorkExtras = useMemo(() => parseExtras(workId), [workId]);
  const extras = useFetched(extrasUrl, ready && extrasWanted, parseWorkExtras);

  const filters = useMemo<DashboardFilters>(
    () => ({
      week: ref?.week ?? week,
      ...(ref ? { selection: selectionOf(ref.period) } : {}),
      companies: input.companies,
      floors: input.floors,
      modules: input.modules,
    }),
    [ref, week, input.companies, input.floors, input.modules],
  );

  const panels = useMemo<DashboardPanels | undefined>(() => {
    if (!planning || !data || !work || !ref) return undefined;
    const fromBuilder = <T>(enabled: boolean, build: () => T | undefined): PanelState<T> => {
      if (!enabled) return { status: 'absent' };
      const result = build();
      return result === undefined ? { status: 'absent' } : { status: 'ready', data: result };
    };
    const fromFetched = <S, T>(enabled: boolean, fetched: Fetched<S>, build: (source: S) => T | undefined): PanelState<T> => {
      if (!enabled) return { status: 'absent' };
      if (fetched.status !== 'ready') return fetched;
      return fromBuilder(true, () => build(fetched.data));
    };
    const rankingData = ranking.status === 'ready' ? ranking.data : undefined;
    return {
      longTerm: fromFetched(shown('longo-prazo'), longTerm, document => buildLongTermPanel(document, ref, filters)),
      wagons: fromBuilder(shown('vagoes'), () => buildWagonsPanel(planning, workId, ref, filters)),
      medium: fromBuilder(shown('medio-prazo'), () => buildMediumTermPanel(data, workId, ref, filters)),
      // O ranking ainda carregando não segura o quadro: o PPC sai e a posição chega depois.
      short: fromBuilder(shown('curto-prazo'), () =>
        buildShortTermPanel(
          { commitments, teams, work: { id: work.id, name: work.name, code: work.code }, ranking: rankingData },
          ref,
          filters,
        ),
      ),
      terminality: fromFetched(shown('terminalidade'), terminality, source => buildTerminalityPanel(source, ref, filters)),
      balance: balanceState(
        shown('balanco'),
        fromCell(true, extras, e => e.lob),
        shown('balanco')
          ? buildLegalizationBlock(data, workId, { start: ref.period.start, end: ref.weekEnd, today: ref.today })
          : undefined,
      ),
      restrictions: fromCell(shown('restricoes'), extras, e => e.restrictions),
      headcount: fromCell(shown('histograma'), extras, e => e.headcount),
      production: fromCell(shown('produtividade'), extras, e => e.production),
      safety: fromCell(shown('seguranca'), extras, e => e.safety),
      checklist: fromCell(shown('checklist'), extras, e => e.checklist),
    };
    // `shown` depende de `access`, `allowed` e `input.modules`, todos já nas dependências via `filters`/`access`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planning, data, work, ref, filters, access, allowed, longTerm, terminality, ranking, extras, commitments, teams, workId]);

  const summary = useMemo(() => {
    if (!panels || !ref) return { kpis: [], sentence: [] };
    const parts: Partial<Record<SummaryKey, ReturnType<typeof longTermSummary>>> = {};
    if (panels.short.status === 'ready') parts.curto = shortTermSummary(panels.short.data, ref);
    if (panels.longTerm.status === 'ready') parts.longo = longTermSummary(panels.longTerm.data, ref);
    if (panels.wagons.status === 'ready') {
      const both = wagonsSummary(panels.wagons.data, ref);
      parts.takt = both.takt;
      parts.restricoes = both.restrictions;
    }
    if (panels.medium.status === 'ready') parts.medio = mediumTermSummary(panels.medium.data, ref);
    if (panels.terminality.status === 'ready') parts.terminalidade = terminalitySummary(panels.terminality.data, ref);
    if (panels.headcount.status === 'ready') parts.efetivo = headcountSummary(panels.headcount.data, ref);
    if (panels.restrictions.status === 'ready') parts.cards = restrictionsSummary(panels.restrictions.data);
    if (panels.safety.status === 'ready') parts.seguranca = safetySummary(panels.safety.data, ref);
    return composeSummary(parts);
  }, [panels, ref]);

  const companyOptions = useMemo(
    () =>
      mergeOptions(
        [
          shortTermCompanies(commitments, teams),
          terminality.status === 'ready' ? terminalityCompanies(terminality.data) : [],
          // Empresas do cadastro de equipes: valem para o médio prazo e os vagões mesmo sem linha na semana.
          [...new Set(teams.map(t => t.company.trim()).filter(Boolean))].map(value => ({ value, count: 0 })),
        ],
        companyKey,
      ).filter(option => option.value),
    [commitments, teams, terminality],
  );
  const floorOptions = useMemo(
    () =>
      mergeOptions(
        [
          terminality.status === 'ready' ? terminalityFloorNames(terminality.data).map(value => ({ value, count: 0 })) : [],
          longTerm.status === 'ready' ? longTermFloorNames(longTerm.data).map(value => ({ value, count: 0 })) : [],
        ],
        floorKey,
      ).filter(option => option.value),
    [terminality, longTerm],
  );

  if (context.state === 'error') return { status: 'error', message: context.message, retry: context.retry };
  if (!ready || !panels || !ref || !work || !periodContext) return { status: 'loading' };
  if (!allowed) return { status: 'missing' };
  const byStatus = (status: PanelState<unknown>['status']) =>
    (Object.keys(panels) as (keyof DashboardPanels)[])
      .filter(
        key => access[PANEL_MODULE[key]] && moduleShown({ modules: input.modules }, PANEL_MODULE[key]) && panels[key].status === status,
      )
      .map(key => PANEL_MODULE[key]);
  return {
    status: 'ready',
    work,
    actorName: actor?.name ?? '',
    ref,
    filters,
    weeks,
    period: ref.period,
    periodContext,
    companyOptions,
    floorOptions,
    access,
    panels,
    summary,
    noData: byStatus('absent'),
    unavailable: byStatus('error'),
    loading: byStatus('loading'),
    settingsReady: settings.status !== 'loading',
  };
}

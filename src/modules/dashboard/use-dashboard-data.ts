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

/** Os dados da aba 0, os mesmos na tela e no PDF (regra 12 do modelo): o planejamento que a obra já
 * carrega (vagões, plano do mês, compromissos, restrições), mais as rotas que já existem (plano de longo
 * prazo, terminalidade, ranking das obras). Cada quadro tem o próprio estado: aparece quando o dado dele
 * chega, e uma falha deixa só ele como indisponível. Quem não pode abrir um módulo não vê o quadro dele
 * (a rota responderia 403 de qualquer forma). Nenhuma migração, nenhuma tabela nova. */

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
const parseRanking = (body: unknown): Fetched<ClosingRankingResponse> => {
  const response = body as ClosingRankingResponse;
  return response && typeof response.available === 'boolean' ? { status: 'ready', data: response } : { status: 'absent' };
};

export interface DashboardInput {
  workId: string;
  /** Semana pedida (qualquer dia dela); ausente ou fora das opções = semana atual. */
  week?: LocalDate;
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
}
export interface DashboardReady {
  work: Work;
  actorName: string;
  ref: DashboardReference;
  filters: DashboardFilters;
  /** Semanas que o seletor oferece (segundas-feiras), da mais antiga à atual. */
  weeks: LocalDate[];
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

const PANEL_MODULE: Record<keyof DashboardPanels, DashboardModule> = {
  longTerm: 'longo-prazo',
  wagons: 'vagoes',
  medium: 'medio-prazo',
  short: 'curto-prazo',
  terminality: 'terminalidade',
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

export function useDashboard(input: DashboardInput): DashboardState {
  const { workId } = input;
  const context = usePlanning();
  const developer = useDeveloper();
  const modules = useModules();
  const { state: settings, weekOneStart } = useWorkSettings(workId);
  const access = useMemo(
    () =>
      Object.fromEntries(DASHBOARD_MODULES.map(m => [m.id, hasSectionAccess(m.id, { developer, modules })])) as Record<
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
  const requested = input.week ? startOfWeek(input.week) : '';
  const week = requested && weeks.includes(requested) ? requested : currentWeek;
  const ref = useMemo(() => (week && today && firstWeek ? referenceOf(week, today, firstWeek) : undefined), [week, today, firstWeek]);

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

  const filters = useMemo<DashboardFilters>(
    () => ({ week: ref?.week ?? week, companies: input.companies, floors: input.floors, modules: input.modules }),
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
    };
    // `shown` depende de `access`, `allowed` e `input.modules`, todos já nas dependências via `filters`/`access`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planning, data, work, ref, filters, access, allowed, longTerm, terminality, ranking, commitments, teams, workId]);

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
  if (!ready || !panels || !ref || !work) return { status: 'loading' };
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

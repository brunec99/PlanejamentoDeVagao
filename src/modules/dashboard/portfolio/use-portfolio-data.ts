'use client';
import { useEffect, useMemo, useState } from 'react';
import type { LocalDate, Team, WeeklyCommitment } from '@/domain/entities';
import { ppcSeries } from '@/domain/rules';
import { startOfWeek } from '@/domain/validation';
import { hasSectionAccess } from '@/application/module-access';
import { useDeveloper, useModules, usePlanning } from '@/modules/planejamento/planning-provider';
import { DASHBOARD_MODULES, referenceOf, type DashboardFilters, type DashboardModule, type DashboardReference } from '../model';
import { resolvePeriod, type PeriodContext, type PeriodSelection } from '../period';
import { buildLongTermPanel, type LongTermPanelData } from '../long-term-panel';
import { buildWagonsPanel, type WagonsPanelData } from '../wagons-panel';
import { buildMediumTermPanel, type MediumTermPanelData } from '../medium-term-panel';
import { buildShortTermPanel, type ShortTermPanelData } from '../short-term-panel';
import { buildTerminalityPanel, type TerminalityPanelData } from '../terminality-panel';
import { aggregatePortfolio } from './aggregate';
import { extractRow, type PortfolioSource } from './extract';
import type { PortfolioInput, PortfolioRow, PortfolioSourcesResponse, PortfolioState, PortfolioWork } from './types';

/** Os dados do Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"), os mesmos na
 * tela e no PDF. Regra 15: curto prazo, vagões e médio prazo saem do planejamento já carregado (`usePlanning`,
 * que traz todas as obras da pessoa); longo prazo e terminalidade, de uma leitura só de `GET /api/dashboard/obras`
 * para todas as obras de uma vez. Para cada obra escolhida, os construtores da aba 0 rodam com a data de
 * referência do período (sem recorte de empreiteiro nem de pavimento, que ficam só na aba 0), e `extract.ts` e
 * `aggregate.ts` fazem o resto.
 *
 * Semana 1 de cada obra no geral = a primeira semana com linha no curto prazo. As configurações de cada obra
 * (`useWorkSettings`) não são lidas aqui: seriam uma chamada por obra, e a semana 1 só numera as semanas
 * ("semana 64"), que o geral não mostra; nenhum número comparado depende dela.
 *
 * Regra 6: sem período escolhido, o geral abre em Mensal, no mês da semana apurada mais recente entre as obras
 * escolhidas (a última semana antes da atual em que alguma obra tem todas as linhas com Status); sem nenhuma,
 * no mês da semana atual. */

type Fetched<T> = { status: 'loading' } | { status: 'error'; message: string } | { status: 'absent' } | { status: 'ready'; data: T };

/** Uma leitura por URL, só quando `enabled` (cópia do `useFetched` da aba 0): 403 vira "ausente", as demais
 * falhas viram erro com a mensagem da rota. O resultado guarda a URL que o produziu. */
function useFetched<T>(url: string, enabled: boolean, parse: (body: unknown) => Fetched<T>): Fetched<T> {
  const [result, setResult] = useState<{ url: string; state: Fetched<T> }>();
  useEffect(() => {
    if (!enabled) return;
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
  if (!enabled) return { status: 'absent' };
  return result && result.url === url ? result.state : { status: 'loading' };
}

const SOURCES_URL = '/api/dashboard/obras';
const parseSources = (body: unknown): Fetched<PortfolioSourcesResponse> => {
  const response = body as PortfolioSourcesResponse;
  return response && Array.isArray(response.works)
    ? { status: 'ready', data: response }
    : { status: 'error', message: 'Resposta inesperada do servidor.' };
};

/** Os módulos que vêm da rota do Dashboard geral (os demais vêm do planejamento já carregado). */
const REMOTE_MODULES: DashboardModule[] = ['longo-prazo', 'terminalidade'];
const NO_TERMINALITY = 'A terminalidade não está disponível neste ambiente.';
const NO_LONG_TERM_SERVICE = 'O plano de longo prazo não tem serviço.';
const NO_TERMINALITY_ITEM = 'Sem pendências de terminalidade nesta obra.';

const byName = (a: PortfolioWork, b: PortfolioWork) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' });
const listText = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

type SourceEntry = PortfolioSourcesResponse['works'][number];
type Reasons = Partial<Record<DashboardModule, string>>;

interface WorkLines {
  commitments: WeeklyCommitment[];
  teams: Team[];
  /** Segunda-feira da primeira semana com linha; ausente sem linha. */
  firstWeek?: LocalDate;
  /** A última semana antes da atual com todas as linhas com Status. */
  lastClosed?: LocalDate;
}
interface LocalSources {
  short: PortfolioSource<ShortTermPanelData>;
  wagons: PortfolioSource<WagonsPanelData>;
  medium: PortfolioSource<MediumTermPanelData>;
}
interface RemoteSources {
  longTerm: PortfolioSource<LongTermPanelData>;
  terminality: PortfolioSource<TerminalityPanelData>;
  reasons: Reasons;
}

/** O longo prazo de uma obra a partir da resposta da rota: sem acesso, escondido; `null`, sem plano. */
function longTermSource(
  response: PortfolioSourcesResponse,
  entry: SourceEntry | undefined,
  ref: DashboardReference,
  reasons: Reasons,
): PortfolioSource<LongTermPanelData> {
  if (!response.longTermAccess) return { status: 'hidden' };
  if (entry?.longTermError) return { status: 'error', message: entry.longTermError };
  if (!entry?.longTerm) return { status: 'absent' };
  const data = buildLongTermPanel(entry.longTerm, ref, { week: ref.week });
  if (data) return { status: 'ready', data };
  reasons['longo-prazo'] = NO_LONG_TERM_SERVICE;
  return { status: 'absent' };
}

/** A terminalidade de uma obra a partir da resposta da rota (pendências sem fotos). */
function terminalitySource(
  response: PortfolioSourcesResponse,
  entry: SourceEntry | undefined,
  ref: DashboardReference,
  reasons: Reasons,
): PortfolioSource<TerminalityPanelData> {
  if (!response.terminalityAvailable) {
    reasons.terminalidade = NO_TERMINALITY;
    return { status: 'absent' };
  }
  if (entry?.terminalityError) return { status: 'error', message: entry.terminalityError };
  if (!entry?.terminality) {
    reasons.terminalidade = NO_TERMINALITY_ITEM;
    return { status: 'absent' };
  }
  const data = buildTerminalityPanel(entry.terminality, ref, { week: ref.week });
  return data ? { status: 'ready', data } : { status: 'absent' };
}

/** O resultado de um construtor como estado de quadro: `undefined` vira "ausente". */
const fromBuilder = <T>(build: () => T | undefined): PortfolioSource<T> => {
  const data = build();
  return data === undefined ? { status: 'absent' } : { status: 'ready', data };
};

export function usePortfolio(input: PortfolioInput): PortfolioState {
  const context = usePlanning();
  const developer = useDeveloper();
  const modules = useModules();
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
  const actor = data?.users.find(u => u.id === (ready ? context.actorId : ''));
  const today = planning?.today ?? '';
  const currentWeek = today ? startOfWeek(today) : '';

  // Regra 2: só as obras liberadas para a pessoa, na ordem do nome.
  const works = useMemo<PortfolioWork[]>(
    () =>
      data && actor
        ? data.works
            .filter(w => actor.workIds.includes(w.id))
            .map(w => ({ id: w.id, name: w.name, code: w.code }))
            .sort(byName)
        : [],
    [data, actor],
  );
  // Conjuntos chegam novos a cada render (vêm da URL): as dependências usam chaves em texto.
  const workKey = input.workIds ? [...input.workIds].sort().join(',') : '';
  const chosen = useMemo(() => {
    const wanted = workKey ? new Set(workKey.split(',')) : undefined;
    const picked = wanted ? works.filter(w => wanted.has(w.id)) : works;
    // Nenhuma das obras pedidas está liberada (link antigo, obra retirada): volta a todas.
    return picked.length ? picked : works;
  }, [works, workKey]);
  const moduleKey = input.modules ? [...input.modules].sort().join(',') : '*';
  const shown = useMemo(() => {
    const wanted = moduleKey === '*' ? undefined : new Set(moduleKey.split(','));
    const picked = DASHBOARD_MODULES.filter(m => access[m.id] && (!wanted || wanted.has(m.id))).map(m => m.id);
    // Nenhum dos quadros pedidos é acessível (link antigo, módulo retirado): volta a todos, como nas obras.
    return new Set(picked.length ? picked : DASHBOARD_MODULES.filter(m => access[m.id]).map(m => m.id));
  }, [access, moduleKey]);

  const lines = useMemo(() => {
    const map = new Map<string, WorkLines>();
    if (!data || !currentWeek) return map;
    for (const work of chosen) map.set(work.id, { commitments: [], teams: [] });
    for (const c of data.commitments) map.get(c.workId)?.commitments.push(c);
    for (const t of data.teams) map.get(t.workId)?.teams.push(t);
    for (const own of map.values()) {
      const series = ppcSeries(own.commitments);
      if (series.length) own.firstWeek = startOfWeek(series[0].weekStart);
      own.lastClosed = series.filter(point => point.weekStart < currentWeek && point.pending === 0).at(-1)?.weekStart;
    }
    return map;
  }, [data, chosen, currentWeek]);

  const periodContext = useMemo<PeriodContext | undefined>(() => {
    if (!currentWeek) return undefined;
    let since = currentWeek;
    let anchor: LocalDate | undefined;
    for (const own of lines.values()) {
      if (own.firstWeek && own.firstWeek < since) since = own.firstWeek;
      if (own.lastClosed && (!anchor || own.lastClosed > anchor)) anchor = own.lastClosed;
    }
    return { currentWeek, since, anchorWeek: anchor ?? currentWeek };
  }, [lines, currentWeek]);

  const selectionKey = JSON.stringify(input.selection ?? { scale: 'mes' });
  const period = useMemo(
    () => (periodContext ? resolvePeriod(JSON.parse(selectionKey) as PeriodSelection, periodContext) : undefined),
    [periodContext, selectionKey],
  );

  // A data de referência de cada obra: o sábado final do período; a semana 1 é a primeira semana com linha. A obra
  // que só começa depois do período fica sem referência: `aggregate` a tira das linhas (regra 10), então nenhum
  // quadro dela é construído.
  const refs = useMemo(() => {
    const map = new Map<string, DashboardReference>();
    if (!period || !today) return map;
    for (const work of chosen) {
      const firstWeek = lines.get(work.id)?.firstWeek;
      if (firstWeek && firstWeek > period.lastWeek) continue;
      map.set(work.id, referenceOf(period.lastWeek, today, firstWeek ?? period.lastWeek, period));
    }
    return map;
  }, [period, today, chosen, lines]);

  const remoteShown = REMOTE_MODULES.some(module => shown.has(module));
  const sources = useFetched(SOURCES_URL, ready && remoteShown, parseSources);

  // Curto prazo, vagões e médio prazo: do planejamento já carregado, sem esperar a rota.
  const local = useMemo(() => {
    const map = new Map<string, LocalSources>();
    if (!planning || !data) return map;
    for (const work of chosen) {
      const ref = refs.get(work.id);
      if (!ref) {
        map.set(work.id, { short: { status: 'absent' }, wagons: { status: 'absent' }, medium: { status: 'absent' } });
        continue;
      }
      const filters: DashboardFilters = { week: ref.week };
      const own = lines.get(work.id)!;
      map.set(work.id, {
        short: shown.has('curto-prazo')
          ? fromBuilder(() => buildShortTermPanel({ commitments: own.commitments, teams: own.teams, work }, ref, filters))
          : { status: 'hidden' },
        wagons: shown.has('vagoes') ? fromBuilder(() => buildWagonsPanel(planning, work.id, ref, filters)) : { status: 'hidden' },
        medium: shown.has('medio-prazo') ? fromBuilder(() => buildMediumTermPanel(data, work.id, ref, filters)) : { status: 'hidden' },
      });
    }
    return map;
  }, [planning, data, chosen, refs, lines, shown]);

  // Longo prazo e terminalidade: da rota, uma leitura para todas as obras.
  const remote = useMemo(() => {
    const map = new Map<string, RemoteSources>();
    const entries = new Map((sources.status === 'ready' ? sources.data.works : []).map(entry => [entry.workId, entry]));
    for (const work of chosen) {
      const ref = refs.get(work.id);
      const entry = entries.get(work.id);
      const reasons: Partial<Record<DashboardModule, string>> = {};
      // O que vale antes de olhar a obra: módulo escondido (ou a rota negou), obra fora do período, rota
      // carregando ou com erro.
      const pick = <T>(
        module: DashboardModule,
        build: (response: PortfolioSourcesResponse, ref: DashboardReference) => PortfolioSource<T>,
      ) => {
        if (!shown.has(module) || sources.status === 'absent') return { status: 'hidden' } as const;
        if (!ref) return { status: 'absent' } as const;
        if (sources.status !== 'ready') return sources;
        return build(sources.data, ref);
      };
      map.set(work.id, {
        longTerm: pick('longo-prazo', (response, ref) => longTermSource(response, entry, ref, reasons)),
        terminality: pick('terminalidade', (response, ref) => terminalitySource(response, entry, ref, reasons)),
        reasons,
      });
    }
    return map;
  }, [sources, chosen, refs, shown]);

  const rows = useMemo<PortfolioRow[] | undefined>(() => {
    if (!period) return undefined;
    return chosen.map(work => {
      const own = lines.get(work.id) ?? { commitments: [], teams: [] };
      const fromLocal = local.get(work.id) ?? { short: { status: 'absent' }, wagons: { status: 'absent' }, medium: { status: 'absent' } };
      const fromRemote = remote.get(work.id) ?? { longTerm: { status: 'absent' }, terminality: { status: 'absent' }, reasons: {} };
      return extractRow(
        {
          work,
          ...(own.firstWeek ? { firstWeek: own.firstWeek } : {}),
          commitments: own.commitments,
          teams: own.teams,
          short: fromLocal.short,
          wagons: fromLocal.wagons,
          medium: fromLocal.medium,
          longTerm: fromRemote.longTerm,
          terminality: fromRemote.terminality,
          reasons: fromRemote.reasons,
        },
        period,
      );
    });
  }, [period, chosen, lines, local, remote]);

  const portfolio = useMemo(() => (period && rows ? aggregatePortfolio({ period, rows, shown }) : undefined), [period, rows, shown]);

  if (context.state === 'error') return { status: 'error', message: context.message, retry: context.retry };
  if (!ready || !periodContext || !portfolio) return { status: 'loading' };

  const remoteModules = REMOTE_MODULES.filter(module => shown.has(module));
  const loading = sources.status === 'loading' ? remoteModules : [];
  const unavailable =
    sources.status === 'error'
      ? remoteModules.map(module => ({ module, message: sources.message }))
      : remoteModules.flatMap(module => {
          const failed = portfolio.rows.filter(row => row.status[module].kind === 'error').map(row => row.work.name);
          return failed.length ? [{ module, message: `Não foi possível carregar em ${listText(failed)}.` }] : [];
        });
  return {
    status: 'ready',
    data: portfolio,
    actorName: actor?.name ?? '',
    today,
    periodContext,
    works,
    access,
    loading,
    unavailable,
  };
}

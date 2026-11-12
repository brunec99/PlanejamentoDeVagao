'use client';
import { useEffect, useMemo, useState } from 'react';
import type { LocalDate } from '@/domain/entities';
import { ppcSeries } from '@/domain/rules';
import { startOfWeek } from '@/domain/validation';
import { hasSectionAccess } from '@/application/module-access';
import { useDeveloper, useModules, usePlanning } from '@/modules/planejamento/planning-provider';
import { companyKey, PORTFOLIO_MODULES, referenceOf, type DashboardFilters, type DashboardReference, type PortfolioModule } from '../model';
import { resolvePeriod, type PeriodContext, type PeriodSelection } from '../period';
import { buildWagonsPanel } from '../wagons-panel';
import { buildMediumTermPanel } from '../medium-term-panel';
import { buildShortTermPanel, shortTermCompanies } from '../short-term-panel';
import { terminalityCompanies } from '../terminality-panel';
import { buildLegalizationBlock } from '../extras/legalization';
import type { DashboardExtrasResponse } from '../extras/types';
import { aggregatePortfolio } from './aggregate';
import { extractRow, type PortfolioSource } from './extract';
import { EXTRA_ROUTE_MODULES, extraSources, extrasUrl, HIDDEN_EXTRAS, type ExtraSources } from './extras';
import {
  byName,
  fromBuilder,
  longTermSource,
  mergeCompanyOptions,
  REMOTE_MODULES,
  safetySource,
  teamCompanies,
  terminalitySource,
  type LocalSources,
  type RemoteSources,
  type WorkLines,
} from './sources';
import type { PortfolioInput, PortfolioRow, PortfolioSourcesResponse, PortfolioState, PortfolioWork } from './types';

/** Os dados do Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"), os mesmos na
 * tela e no PDF. Regra 15: curto prazo, vagões e médio prazo saem do planejamento já carregado (`usePlanning`,
 * que traz todas as obras da pessoa); longo prazo, terminalidade e, desde 06/11/2026, segurança do trabalho, de uma
 * leitura só de `GET /api/dashboard/obras` para todas as obras de uma vez. Para cada obra escolhida, os construtores da aba 0 rodam com a data de
 * referência do período (sem recorte de empreiteiro nem de pavimento, que ficam só na aba 0), e `extract.ts` e
 * `aggregate.ts` fazem o resto.
 *
 * Quadros de 12/11/2026 (modelo "Dashboards completos e resumo semanal"): Linha de Balanço, Quadro de Restrições,
 * histograma, produtividade e checklist chegam já calculados para o período de `GET /api/dashboard/extras?de=&ate=`
 * (uma leitura por período, para todas as obras); a legalização sai do planejamento já carregado. Sem recorte de
 * empreiteiro: esses quadros mostram sempre a obra inteira.
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

const parseExtras = (body: unknown): Fetched<DashboardExtrasResponse> => {
  const response = body as DashboardExtrasResponse;
  return response && Array.isArray(response.works)
    ? { status: 'ready', data: response }
    : { status: 'error', message: 'Resposta inesperada do servidor.' };
};

const listText = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

export function usePortfolio(input: PortfolioInput): PortfolioState {
  const context = usePlanning();
  const developer = useDeveloper();
  const modules = useModules();
  const access = useMemo(
    () =>
      Object.fromEntries(PORTFOLIO_MODULES.map(m => [m.id, hasSectionAccess(m.section, { developer, modules })])) as Record<
        PortfolioModule,
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
    const picked = PORTFOLIO_MODULES.filter(m => access[m.id] && (!wanted || wanted.has(m.id))).map(m => m.id);
    // Nenhum dos quadros pedidos é acessível (link antigo, módulo retirado): volta a todos, como nas obras.
    return new Set(picked.length ? picked : PORTFOLIO_MODULES.filter(m => access[m.id]).map(m => m.id));
  }, [access, moduleKey]);

  // Recorte de empreiteiro (05/11/2026): os nomes vão aos construtores, que comparam por `companyKey`.
  const companyNames = input.companies ? [...input.companies].sort().join('\n') : '';
  const companies = useMemo(() => (companyNames ? new Set(companyNames.split('\n')) : undefined), [companyNames]);

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

  const remoteShown = REMOTE_MODULES.some(module => shown.has(module));
  const sources = useFetched(SOURCES_URL, ready && remoteShown, parseSources);
  // Os quadros de 12/11/2026: uma leitura por período, já calculada no servidor.
  const extrasShown = EXTRA_ROUTE_MODULES.some(module => shown.has(module));
  const hasWeeks = !!period && period.weeks.length > 0;
  const extras = useFetched(period ? extrasUrl(period) : '', ready && extrasShown && hasWeeks, parseExtras);

  // Empreiteiros do seletor, somando as obras escolhidas: as linhas do curto prazo (coluna Empresa), as equipes e,
  // quando a rota responde, os responsáveis terceiros da terminalidade. Com recorte, a obra onde nenhum dos
  // escolhidos aparece sai das linhas (`withoutCompany`).
  const companyLists = useMemo(() => {
    const entries = new Map((sources.status === 'ready' ? sources.data.works : []).map(entry => [entry.workId, entry]));
    return new Map(
      chosen.map(work => {
        const own = lines.get(work.id) ?? { commitments: [], teams: [] };
        const terminality = entries.get(work.id)?.terminality;
        return [
          work.id,
          [shortTermCompanies(own.commitments, own.teams), terminality ? terminalityCompanies(terminality) : [], teamCompanies(own.teams)],
        ] as const;
      }),
    );
  }, [chosen, lines, sources]);
  const companyOptions = useMemo(() => mergeCompanyOptions([...companyLists.values()].flat()), [companyLists]);
  const { included, withoutCompany } = useMemo(() => {
    if (!companies) return { included: chosen, withoutCompany: [] as PortfolioWork[] };
    const keys = new Set([...companies].map(companyKey));
    const present = (work: PortfolioWork) =>
      (companyLists.get(work.id) ?? []).some(list => list.some(option => keys.has(companyKey(option.value))));
    return { included: chosen.filter(present), withoutCompany: chosen.filter(work => !present(work)) };
  }, [chosen, companies, companyLists]);

  // A data de referência de cada obra: o sábado final do período; a semana 1 é a primeira semana com linha. A obra
  // que só começa depois do período fica sem referência: `aggregate` a tira das linhas (regra 10), então nenhum
  // quadro dela é construído.
  const refs = useMemo(() => {
    const map = new Map<string, DashboardReference>();
    if (!period || !today) return map;
    for (const work of included) {
      const firstWeek = lines.get(work.id)?.firstWeek;
      if (firstWeek && firstWeek > period.lastWeek) continue;
      map.set(work.id, referenceOf(period.lastWeek, today, firstWeek ?? period.lastWeek, period));
    }
    return map;
  }, [period, today, included, lines]);

  // Curto prazo, vagões e médio prazo: do planejamento já carregado, sem esperar a rota.
  const local = useMemo(() => {
    const map = new Map<string, LocalSources>();
    if (!planning || !data) return map;
    for (const work of included) {
      const ref = refs.get(work.id);
      if (!ref) {
        map.set(work.id, { short: { status: 'absent' }, wagons: { status: 'absent' }, medium: { status: 'absent' } });
        continue;
      }
      const filters: DashboardFilters = { week: ref.week, ...(companies ? { companies } : {}) };
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
  }, [planning, data, included, refs, lines, shown, companies]);

  // Longo prazo, terminalidade e segurança: da rota, uma leitura para todas as obras.
  const remote = useMemo(() => {
    const map = new Map<string, RemoteSources>();
    const entries = new Map((sources.status === 'ready' ? sources.data.works : []).map(entry => [entry.workId, entry]));
    for (const work of included) {
      const ref = refs.get(work.id);
      const entry = entries.get(work.id);
      const reasons: Partial<Record<PortfolioModule, string>> = {};
      // O que vale antes de olhar a obra: módulo escondido (ou a rota negou), obra fora do período, rota
      // carregando ou com erro.
      const pick = <T>(
        module: PortfolioModule,
        build: (response: PortfolioSourcesResponse, ref: DashboardReference) => PortfolioSource<T>,
      ) => {
        if (!shown.has(module) || sources.status === 'absent') return { status: 'hidden' } as const;
        if (!ref) return { status: 'absent' } as const;
        if (sources.status !== 'ready') return sources;
        return build(sources.data, ref);
      };
      map.set(work.id, {
        longTerm: pick('longo-prazo', (response, ref) => longTermSource(response, entry, ref, reasons)),
        terminality: pick('terminalidade', (response, ref) => terminalitySource(response, entry, ref, reasons, companies)),
        safety: pick('seguranca', (response, ref) => safetySource(response, entry, ref, reasons, today)),
        reasons,
      });
    }
    return map;
  }, [sources, included, refs, shown, companies, today]);

  // Linha de Balanço, restrições, histograma, produtividade e checklist: da rota dos quadros novos; a legalização,
  // do planejamento.
  const extra = useMemo(() => {
    const map = new Map<string, ExtraSources>();
    if (!period) return map;
    const entries = new Map((extras.status === 'ready' ? extras.data.works : []).map(entry => [entry.workId, entry]));
    for (const work of included) {
      const inPeriod = refs.has(work.id);
      const legalization =
        data && inPeriod && shown.has('balanco')
          ? buildLegalizationBlock(data, work.id, { start: period.start, end: period.end, today })
          : undefined;
      map.set(
        work.id,
        extraSources({ state: extras, entry: entries.get(work.id), inPeriod, shown, ...(legalization ? { legalization } : {}) }),
      );
    }
    return map;
  }, [extras, included, refs, shown, period, data, today]);

  const rows = useMemo<PortfolioRow[] | undefined>(() => {
    if (!period) return undefined;
    return included.map(work => {
      const own = lines.get(work.id) ?? { commitments: [], teams: [] };
      const fromLocal = local.get(work.id) ?? { short: { status: 'absent' }, wagons: { status: 'absent' }, medium: { status: 'absent' } };
      const fromRemote = remote.get(work.id) ?? {
        longTerm: { status: 'absent' },
        terminality: { status: 'absent' },
        safety: { status: 'absent' },
        reasons: {},
      };
      const fromExtra = extra.get(work.id) ?? HIDDEN_EXTRAS;
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
          safety: fromRemote.safety,
          balance: fromExtra.balance,
          restrictions: fromExtra.restrictions,
          headcount: fromExtra.headcount,
          production: fromExtra.production,
          checklist: fromExtra.checklist,
          reasons: { ...fromRemote.reasons, ...fromExtra.reasons },
        },
        period,
      );
    });
  }, [period, included, lines, local, remote, extra]);

  const portfolio = useMemo(() => {
    if (!period || !rows) return undefined;
    const aggregated = aggregatePortfolio({ period, rows, shown });
    if (!companies) return aggregated;
    // Com recorte, "Empreiteiros em mais de uma obra" mostra só os escolhidos.
    const keys = new Set([...companies].map(companyKey));
    return {
      ...aggregated,
      companies: { ...aggregated.companies, rows: aggregated.companies.rows.filter(row => keys.has(companyKey(row.name))) },
    };
  }, [period, rows, shown, companies]);

  if (context.state === 'error') return { status: 'error', message: context.message, retry: context.retry };
  if (!ready || !periodContext || !portfolio) return { status: 'loading' };

  const remoteModules = REMOTE_MODULES.filter(module => shown.has(module));
  const extraModules = EXTRA_ROUTE_MODULES.filter(module => shown.has(module));
  const loading = [...(sources.status === 'loading' ? remoteModules : []), ...(extras.status === 'loading' ? extraModules : [])];
  const failedIn = (list: PortfolioModule[]) =>
    list.flatMap(module => {
      const failed = portfolio.rows.filter(row => row.status[module].kind === 'error').map(row => row.work.name);
      return failed.length ? [{ module, message: `Não foi possível carregar em ${listText(failed)}.` }] : [];
    });
  const unavailable = [
    ...(sources.status === 'error' ? remoteModules.map(module => ({ module, message: sources.message })) : failedIn(remoteModules)),
    ...(extras.status === 'error' ? extraModules.map(module => ({ module, message: extras.message })) : failedIn(extraModules)),
  ];
  return {
    status: 'ready',
    data: portfolio,
    actorName: actor?.name ?? '',
    today,
    periodContext,
    works,
    access,
    companyOptions,
    withoutCompany,
    loading,
    unavailable,
  };
}

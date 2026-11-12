import type { LocalDate, Work } from '@/domain/entities';
import { ppcSeries } from '@/domain/rules';
import { startOfWeek } from '@/domain/validation';
import { hasSectionAccess, type ModuleAccess } from '@/application/module-access';
import type { Planning } from '@/application/use-cases/get-planning';
import { companyKey, PORTFOLIO_MODULES, referenceOf, type DashboardFilters, type DashboardReference, type PortfolioModule } from '../model';
import { resolvePeriod, type PeriodContext, type PeriodSelection } from '../period';
import { buildWagonsPanel } from '../wagons-panel';
import { buildMediumTermPanel } from '../medium-term-panel';
import { buildShortTermPanel, shortTermCompanies } from '../short-term-panel';
import { terminalityCompanies } from '../terminality-panel';
import { buildLegalizationBlock } from '../extras/legalization';
import type { DashboardExtrasResponse, ExtrasRange } from '../extras/types';
import { aggregatePortfolio } from './aggregate';
import { extractRow, type PortfolioSource } from './extract';
import { EXTRA_ROUTE_MODULES, extraSources, type ExtrasState } from './extras';
import {
  byName,
  fromBuilder,
  longTermSource,
  REMOTE_MODULES,
  safetySource,
  teamCompanies,
  terminalitySource,
  type LocalSources,
  type RemoteSources,
  type WorkLines,
} from './sources';
import type { PortfolioData, PortfolioSourcesResponse, PortfolioWork } from './types';

export { portfolioText, PORTFOLIO_TEXT_LIMIT } from './portfolio-text';

/** Dashboard geral no servidor (08/11/2026, "Claudia geral", aprovado pelo usuário): a ferramenta
 * `panorama_obras` precisa dos MESMOS números da página `/dashboard`, e a composição da página só existia no
 * navegador (`usePortfolio`, em `use-portfolio-data.ts`). Esta função refaz, sem React, os passos do hook na
 * mesma ordem e com as mesmas peças (`sources.ts`, os construtores da aba 0, `extractRow` e
 * `aggregatePortfolio`):
 *
 * 1. as obras em ordem de nome; 2. as linhas do curto prazo de cada obra, com a primeira semana e a última
 * apurada; 3. o `PeriodContext` (semana atual, primeira semana com dado, âncora = semana apurada mais recente);
 * 4. o período (`resolvePeriod`; sem escolha, Mensal); 5. o recorte de empreiteiro; 6. a data de referência de
 * cada obra (`referenceOf`); 7. curto prazo, vagões e médio prazo do planejamento; 8. longo prazo, terminalidade
 * e segurança da resposta de `readPortfolioSources`; 9. `extractRow` por obra e `aggregatePortfolio`.
 *
 * Quadros (`shown`) como na tela: só os módulos que a pessoa pode abrir (`hasSectionAccess` sobre
 * `PORTFOLIO_MODULES`), restritos aos pedidos; nenhum pedido acessível volta a todos os acessíveis. A diferença
 * para o hook é só o que não existe no servidor: nada fica "carregando" (a leitura já terminou) e a resposta
 * ausente equivale ao 403 da tela (os quadros remotos somem). Puro: quem chama lê o planejamento e as fontes.
 *
 * Quadros de 12/11/2026 (Linha de Balanço e legalização, Quadro de Restrições, histograma, produtividade e
 * checklist): os blocos vêm de `readDashboardExtras`, que precisa do intervalo do período. Por isso quem chama
 * resolve primeiro o período com `portfolioRange` (os mesmos passos 1 a 4), lê os quadros e passa a resposta em
 * `extras`; sem ela, esses quadros somem, como os remotos. A legalização sai do planejamento. */

export interface ComposePortfolioInput extends ModuleAccess {
  /** O planejamento (saída de `getPlanning`) com, pelo menos, as obras de `works`. */
  planning: Planning;
  /** As obras a comparar, já restritas às liberadas para a pessoa (na tela, as escolhidas em "Obras"). */
  works: readonly Pick<Work, 'id' | 'name' | 'code'>[];
  /** A resposta de `readPortfolioSources` (a mesma de `GET /api/dashboard/obras`). `{ error }`: a leitura falhou e
   * os quadros remotos ficam com erro, como na tela; ausente: sem leitura, os quadros remotos somem. */
  sources?: PortfolioSourcesResponse | { error: string };
  /** A resposta de `readDashboardExtras` para o intervalo de `portfolioRange` (a mesma de
   * `GET /api/dashboard/extras`). `{ error }`: a leitura falhou; ausente: os quadros de 12/11/2026 somem. */
  extras?: DashboardExtrasResponse | { error: string };
  /** Escala e período; ausente = Mensal, no mês da semana apurada mais recente entre as obras (regra 6). */
  selection?: PeriodSelection;
  /** Hoje; padrão `planning.today`. */
  today?: LocalDate;
  /** Quadros pedidos (o seletor "Quadros"); ausente = todos os que a pessoa pode abrir. */
  shown?: ReadonlySet<PortfolioModule>;
  /** Recorte de empreiteiro (nomes comparados sem acento nem caixa, `companyKey`); ausente = sem recorte. */
  companies?: ReadonlySet<string>;
}

export interface ComposedPortfolio extends PortfolioData {
  /** Os quadros que entraram (acessíveis e pedidos), na ordem de `PORTFOLIO_MODULES`. */
  shown: PortfolioModule[];
  /** Semana atual, primeira semana com dado entre as obras e âncora (o que o seletor de período da tela usa). */
  periodContext: PeriodContext;
  /** Com recorte de empreiteiro: as obras onde nenhum dos escolhidos aparece (saem das linhas), como na tela. */
  withoutCompany: PortfolioWork[];
  /** Quadros remotos com falha de leitura, com a mesma mensagem do aviso da tela. */
  unavailable: { module: PortfolioModule; message: string }[];
}

type SourcesState = { status: 'absent' } | { status: 'error'; message: string } | { status: 'ready'; data: PortfolioSourcesResponse };

const listText = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`);

/** As obras em ordem de nome, as linhas do curto prazo de cada uma e o período (passos 1 a 4). */
function resolveBase(input: Pick<ComposePortfolioInput, 'planning' | 'works' | 'selection' | 'today'>) {
  const data = input.planning.data;
  const today = input.today ?? input.planning.today;
  const currentWeek = startOfWeek(today);
  // Regra 2: as obras na ordem do nome.
  const chosen: PortfolioWork[] = input.works.map(w => ({ id: w.id, name: w.name, code: w.code })).sort(byName);

  const lines = new Map<string, WorkLines>();
  for (const work of chosen) lines.set(work.id, { commitments: [], teams: [] });
  for (const c of data.commitments) lines.get(c.workId)?.commitments.push(c);
  for (const t of data.teams) lines.get(t.workId)?.teams.push(t);
  for (const own of lines.values()) {
    const series = ppcSeries(own.commitments);
    if (series.length) own.firstWeek = startOfWeek(series[0].weekStart);
    own.lastClosed = series.filter(point => point.weekStart < currentWeek && point.pending === 0).at(-1)?.weekStart;
  }

  let since = currentWeek;
  let anchor: LocalDate | undefined;
  for (const own of lines.values()) {
    if (own.firstWeek && own.firstWeek < since) since = own.firstWeek;
    if (own.lastClosed && (!anchor || own.lastClosed > anchor)) anchor = own.lastClosed;
  }
  const periodContext: PeriodContext = { currentWeek, since, anchorWeek: anchor ?? currentWeek };
  const period = resolvePeriod(input.selection ?? { scale: 'mes' }, periodContext);
  return { today, chosen, lines, periodContext, period };
}

/** O intervalo que `readDashboardExtras` deve ler para esta composição (segunda-feira inicial, sábado final e
 * hoje), ou `undefined` quando o período não tem semana. */
export function portfolioRange(input: Pick<ComposePortfolioInput, 'planning' | 'works' | 'selection' | 'today'>): ExtrasRange | undefined {
  const { period, today } = resolveBase(input);
  return period.weeks.length ? { start: period.start, end: period.end, today } : undefined;
}

export function composePortfolio(input: ComposePortfolioInput): ComposedPortfolio {
  const { planning } = input;
  // Conjunto vazio = sem recorte, como na tela (a URL sem empreiteiro).
  const companies = input.companies?.size ? input.companies : undefined;
  const data = planning.data;
  const { today, chosen, lines, periodContext, period } = resolveBase(input);

  // Acesso e quadros, como `access` e `shown` do hook.
  const access = Object.fromEntries(
    PORTFOLIO_MODULES.map(m => [m.id, hasSectionAccess(m.section, { developer: input.developer, modules: input.modules })]),
  ) as Record<PortfolioModule, boolean>;
  const picked = PORTFOLIO_MODULES.filter(m => access[m.id] && (!input.shown || input.shown.has(m.id))).map(m => m.id);
  const shown = new Set(picked.length ? picked : PORTFOLIO_MODULES.filter(m => access[m.id]).map(m => m.id));

  // A leitura remota, como o `useFetched` do hook depois de terminar.
  const remoteShown = REMOTE_MODULES.some(module => shown.has(module));
  const sources: SourcesState =
    !remoteShown || !input.sources
      ? { status: 'absent' }
      : 'error' in input.sources
        ? { status: 'error', message: input.sources.error }
        : { status: 'ready', data: input.sources };
  const entries = new Map((sources.status === 'ready' ? sources.data.works : []).map(entry => [entry.workId, entry]));

  // Recorte de empreiteiro: a obra onde nenhum dos escolhidos aparece sai das linhas.
  let included = chosen;
  let withoutCompany: PortfolioWork[] = [];
  if (companies) {
    const keys = new Set([...companies].map(companyKey));
    const present = (work: PortfolioWork) => {
      const own = lines.get(work.id) ?? { commitments: [], teams: [] };
      const terminality = entries.get(work.id)?.terminality;
      const lists = [
        shortTermCompanies(own.commitments, own.teams),
        terminality ? terminalityCompanies(terminality) : [],
        teamCompanies(own.teams),
      ];
      return lists.some(list => list.some(option => keys.has(companyKey(option.value))));
    };
    included = chosen.filter(present);
    withoutCompany = chosen.filter(work => !present(work));
  }

  // A data de referência de cada obra: o sábado final do período. A obra que só começa depois dele fica sem
  // referência e nenhum quadro dela é construído (`aggregatePortfolio` a põe em `notStarted`).
  const refs = new Map<string, DashboardReference>();
  for (const work of included) {
    const firstWeek = lines.get(work.id)?.firstWeek;
    if (firstWeek && firstWeek > period.lastWeek) continue;
    refs.set(work.id, referenceOf(period.lastWeek, today, firstWeek ?? period.lastWeek, period));
  }

  const local = new Map<string, LocalSources>();
  for (const work of included) {
    const ref = refs.get(work.id);
    if (!ref) {
      local.set(work.id, { short: { status: 'absent' }, wagons: { status: 'absent' }, medium: { status: 'absent' } });
      continue;
    }
    const filters: DashboardFilters = { week: ref.week, ...(companies ? { companies } : {}) };
    const own = lines.get(work.id)!;
    local.set(work.id, {
      short: shown.has('curto-prazo')
        ? fromBuilder(() => buildShortTermPanel({ commitments: own.commitments, teams: own.teams, work }, ref, filters))
        : { status: 'hidden' },
      wagons: shown.has('vagoes') ? fromBuilder(() => buildWagonsPanel(planning, work.id, ref, filters)) : { status: 'hidden' },
      medium: shown.has('medio-prazo') ? fromBuilder(() => buildMediumTermPanel(data, work.id, ref, filters)) : { status: 'hidden' },
    });
  }

  const remote = new Map<string, RemoteSources>();
  for (const work of included) {
    const ref = refs.get(work.id);
    const entry = entries.get(work.id);
    const reasons: Partial<Record<PortfolioModule, string>> = {};
    const pick = <T>(
      module: PortfolioModule,
      build: (response: PortfolioSourcesResponse, ref: DashboardReference) => PortfolioSource<T>,
    ): PortfolioSource<T> => {
      if (!shown.has(module) || sources.status === 'absent') return { status: 'hidden' };
      if (!ref) return { status: 'absent' };
      if (sources.status !== 'ready') return sources;
      return build(sources.data, ref);
    };
    remote.set(work.id, {
      longTerm: pick('longo-prazo', (response, ref) => longTermSource(response, entry, ref, reasons)),
      terminality: pick('terminalidade', (response, ref) => terminalitySource(response, entry, ref, reasons, companies)),
      safety: pick('seguranca', (response, ref) => safetySource(response, entry, ref, reasons, today)),
      reasons,
    });
  }

  // Os quadros de 12/11/2026, como `extras` do hook depois de terminar.
  const extrasShown = EXTRA_ROUTE_MODULES.some(module => shown.has(module));
  const extras: ExtrasState =
    !extrasShown || !input.extras || !period.weeks.length
      ? { status: 'absent' }
      : 'error' in input.extras
        ? { status: 'error', message: input.extras.error }
        : { status: 'ready', data: input.extras };
  const extraEntries = new Map((extras.status === 'ready' ? extras.data.works : []).map(entry => [entry.workId, entry]));

  const rows = included.map(work => {
    const own = lines.get(work.id) ?? { commitments: [], teams: [] };
    const fromLocal = local.get(work.id)!;
    const fromRemote = remote.get(work.id)!;
    const inPeriod = refs.has(work.id);
    const legalization =
      inPeriod && shown.has('balanco') ? buildLegalizationBlock(data, work.id, { start: period.start, end: period.end, today }) : undefined;
    const fromExtra = extraSources({
      state: extras,
      entry: extraEntries.get(work.id),
      inPeriod,
      shown,
      ...(legalization ? { legalization } : {}),
    });
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

  const aggregated = aggregatePortfolio({ period, rows, shown });
  // Com recorte, "Empreiteiros em mais de uma obra" mostra só os escolhidos.
  const keys = companies ? new Set([...companies].map(companyKey)) : undefined;
  const portfolio: PortfolioData = keys
    ? {
        ...aggregated,
        companies: { ...aggregated.companies, rows: aggregated.companies.rows.filter(row => keys.has(companyKey(row.name))) },
      }
    : aggregated;

  const remoteModules = REMOTE_MODULES.filter(module => shown.has(module));
  const extraModules = EXTRA_ROUTE_MODULES.filter(module => shown.has(module));
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
    ...portfolio,
    shown: PORTFOLIO_MODULES.filter(m => shown.has(m.id)).map(m => m.id),
    periodContext,
    withoutCompany,
    unavailable,
  };
}

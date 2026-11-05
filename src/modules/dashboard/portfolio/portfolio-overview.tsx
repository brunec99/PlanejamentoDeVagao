'use client';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ChartColumn, FileDown, RefreshCw } from 'lucide-react';
import { HelpNote } from '@/modules/layout/help-note';
import { LoadState } from '@/modules/planejamento/ui';
import { FilterPicker } from '@/modules/curto-prazo/closing-filter';
import { formatDate, workPath } from '@/shared/format';
import { DASHBOARD_STYLE } from '../styles';
import { KpiCards, Text } from '../dashboard-overview';
import { DASHBOARD_MODULES, dayMonth, moduleInfo, pct, plural, type DashboardModule } from '../model';
import { GROUPING_NOUN, periodSearchEntries, selectionOf, type PeriodSelection } from '../period';
import { PeriodControl, ScaleButtons } from '../period-picker';
import { portfolioPath, printPortfolioPath, type PortfolioParams } from './params';
import type { PortfolioReady, PortfolioRow, PortfolioWork } from './types';
import { usePortfolio } from './use-portfolio-data';
import { PORTFOLIO_STYLE } from './portfolio-styles';
import {
  CausesPareto,
  ComparisonTable,
  CompaniesHeat,
  DEFAULT_SORT,
  HeatRamp,
  LongTermRows,
  MediumRows,
  NoDataNote,
  PpcBarsLegend,
  PpcByWorkBars,
  PpcHeat,
  ResponsiblesList,
  TerminalityRows,
  WagonRows,
  comparisonModules,
  hasNoDataNote,
  moduleBoard,
  type ComparisonSort,
  type ModuleBoard,
} from './portfolio-charts';

/** Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"): fora das obras, em
 * Empreendimentos, os quadros do dashboard para todas as obras liberadas para a pessoa, lado a lado, no período
 * escolhido. Filtros de escala, período, obras e quadros (regra 3), todos na URL para o link e o PDF
 * reproduzirem a visão (regra 4); a linha de escopo, a frase e os cartões (regra 13); o comparativo das obras
 * (regra 10) e um quadro por módulo (regras 11 e 12). Clicar numa obra abre a aba 0 dela no mesmo período.
 * Nada aqui se edita. No celular, uma coluna e a tabela rolando de lado com a obra fixa (regra 16). */

const HELP = (
  <>
    <p>
      <strong>O período é feito de semanas inteiras.</strong> A semana pertence ao período da sua segunda-feira (outubro vai da semana de
      05/10 à de 26/10) e tudo conta até o sábado da última semana; nada depois entra. O período em andamento aparece como parcial, e a
      semana em aberto fica fora do PPC.
    </p>
    <p>
      <strong>Soma, não média.</strong> O PPC do período é cumpridos ÷ assumidos de todas as semanas apuradas, e o consolidado soma as
      linhas de todas as obras: a obra com mais compromissos pesa mais. A seta compara com o período anterior da mesma escala.
    </p>
    <p>
      <strong>Fluxo e retrato.</strong> Compromissos, causas, pendências abertas e resolvidas e o avanço do período somam o que aconteceu
      dentro dele. Status dos vagões, takt e restrições vencidas, atrasadas do médio prazo, pendências em aberto e o avanço acumulado são o
      retrato no sábado final.
    </p>
    <p>
      <strong>Só as obras liberadas para você</strong>, as mesmas da lista de obras, e só os módulos que você pode abrir. Obra que só começa
      depois do período sai da tabela e é citada na linha de escopo.
    </p>
    <p>
      <strong>Clique numa obra</strong> da tabela para abrir a aba 0 dela no mesmo período e na mesma escala. "Gerar PDF" imprime esta
      visão, com os filtros de agora.
    </p>
  </>
);

export function PortfolioOverview({ initial }: { initial: PortfolioParams }) {
  const [params, setParams] = useState<PortfolioParams>(initial);
  const [sort, setSort] = useState<ComparisonSort>(DEFAULT_SORT);
  const state = usePortfolio({ selection: params.selection, workIds: params.workIds, modules: params.modules });
  // A URL acompanha cada escolha (regra 4), sem recarregar nem rolar a página: o link copiado reproduz a mesma
  // visão. O History API nativo conversa com o roteador do Next (como na aba 0) e evita ida ao servidor.
  const update = (next: PortfolioParams) => {
    setParams(next);
    window.history.replaceState(null, '', portfolioPath(next));
  };

  if (state.status === 'loading') return <LoadState />;
  if (state.status === 'error')
    return (
      <div className="panel p-6">
        <p role="alert" className="text-sm font-semibold text-slate-800">
          Não foi possível carregar o Dashboard geral.
        </p>
        <p className="mt-1 text-sm text-slate-500">{state.message || 'Verifique a conexão e tente de novo.'}</p>
        <button type="button" className="button-ghost mt-4" onClick={state.retry}>
          <RefreshCw size={15} aria-hidden />
          Tentar de novo
        </button>
      </div>
    );
  return <Ready state={state} params={params} update={update} sort={sort} onSort={setSort} />;
}

/** O nome de cada obra no seletor; nomes repetidos levam o código, para a escolha voltar ao id certo. */
function workLabels(works: readonly PortfolioWork[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const work of works) count.set(work.name, (count.get(work.name) ?? 0) + 1);
  return new Map(works.map(work => [work.id, (count.get(work.name) ?? 0) > 1 && work.code ? `${work.name} (${work.code})` : work.name]));
}

function Board({
  module,
  title,
  subtitle,
  board,
  children,
}: {
  module: DashboardModule;
  title?: string;
  subtitle?: string;
  board: ModuleBoard;
  children: ReactNode;
}) {
  const info = moduleInfo(module);
  return (
    <section className="dsh-mod" aria-labelledby={`geral-${module}`}>
      <div className="dsh-mod-h">
        <h2 id={`geral-${module}`}>
          <span className="n" aria-hidden>
            {info.number}
          </span>
          {title ?? info.label}
          {subtitle && board.kind === 'ready' && <span className="sub">{subtitle}</span>}
        </h2>
      </div>
      {board.kind === 'loading' && (
        <div className="dsh-mod-b unavailable" role="status">
          Carregando…
        </div>
      )}
      {board.kind === 'unavailable' && (
        <div className="dsh-mod-b unavailable" role="alert">
          Quadro indisponível: {board.message}
        </div>
      )}
      {board.kind === 'ready' && children}
    </section>
  );
}

function Ready({
  state,
  params,
  update,
  sort,
  onSort,
}: {
  state: PortfolioReady;
  params: PortfolioParams;
  update: (next: PortfolioParams) => void;
  sort: ComparisonSort;
  onSort: (sort: ComparisonSort) => void;
}) {
  const router = useRouter();
  const { data, works, access, periodContext } = state;
  const period = data.period;
  const end = dayMonth(period.end);
  const available = DASHBOARD_MODULES.filter(m => access[m.id]);
  // Quadros vindos da URL sem nenhum acessível valem como "todos".
  const chosen = params.modules && available.some(m => params.modules!.has(m.id)) ? params.modules : undefined;
  const boards = Object.fromEntries(DASHBOARD_MODULES.map(m => [m.id, moduleBoard(state, chosen, m.id)])) as Record<
    DashboardModule,
    ModuleBoard
  >;
  const columns = comparisonModules(boards);
  // Escolher obras ou quadros fixa o período que está na tela, para o filtro não mudar o período por baixo.
  const pinned: PeriodSelection = params.selection ?? selectionOf(period);

  const choosePeriod = (selection: PeriodSelection) => update({ ...params, selection });

  const labels = workLabels(works);
  const workOptions = works.map(work => ({ value: labels.get(work.id)! }));
  const chosenWorks = params.workIds ? works.filter(work => params.workIds!.has(work.id)) : undefined;
  const selectedLabels = chosenWorks?.length ? new Set(chosenWorks.map(work => labels.get(work.id)!)) : undefined;
  const chooseWorks = (next: Set<string> | undefined) => {
    const ids = next ? works.filter(work => next.has(labels.get(work.id)!)).map(work => work.id) : [];
    update({ ...params, selection: pinned, workIds: next && ids.length && ids.length < works.length ? new Set(ids) : undefined });
  };

  const toggleModule = (id: DashboardModule) => {
    const current = new Set(chosen ?? available.map(m => m.id));
    if (current.has(id)) current.delete(id);
    else current.add(id);
    const kept = available.filter(m => current.has(m.id)).map(m => m.id);
    // Todos marcados = sem recorte; nenhum marcado não é permitido (ficaria uma página vazia).
    if (!kept.length) return;
    update({ ...params, selection: pinned, modules: kept.length === available.length ? undefined : new Set(kept) });
  };
  const filtering = !!selectedLabels || !!chosen;
  const clear = () => update({ selection: pinned });

  const generate = () =>
    window.open(printPortfolioPath({ selection: pinned, workIds: params.workIds, modules: chosen }), '_blank', 'noopener');
  const workQuery = new URLSearchParams(periodSearchEntries(selectionOf(period))).toString();
  const hrefOf = (row: PortfolioRow) => `${workPath(row.work.id, 'dashboard')}${workQuery ? `?${workQuery}` : ''}`;

  // Linha de escopo.
  const hiddenByChoice = chosen ? available.filter(m => !chosen.has(m.id)).map(m => m.label.toLowerCase()) : [];
  const loading = DASHBOARD_MODULES.filter(m => boards[m.id].kind === 'loading').map(m => m.label.toLowerCase());
  const unavailable = DASHBOARD_MODULES.filter(m => boards[m.id].kind === 'unavailable').map(m => m.label.toLowerCase());
  const lastWeek = period.weeks.at(-1);

  const totals = data.totals;
  const lowerBoards = (['longo-prazo', 'vagoes', 'medio-prazo', 'terminalidade'] as const).filter(m => boards[m].kind !== 'hidden');
  const earlyWorks = data.rows.some(row => row.short?.early && row.short.current.percent !== undefined);

  return (
    <div className="dsh">
      <style>{DASHBOARD_STYLE}</style>
      <style>{PORTFOLIO_STYLE}</style>

      <header data-tour="geral-cabecalho" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span
            aria-hidden
            className="mt-1 hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-brand-900/20 ring-1 ring-brand-900/10 sm:grid"
          >
            <ChartColumn size={24} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Empreendimentos</p>
            <h1 className="page-title">Dashboard geral</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm text-slate-500">As obras liberadas para você, lado a lado, no período escolhido.</p>
              <span data-tour="geral-ajuda" className="inline-flex">
                <HelpNote title="Como funciona: dashboard geral" label="Como funciona">
                  {HELP}
                </HelpNote>
              </span>
            </div>
          </div>
        </div>
        <button type="button" className="button" data-tour="geral-pdf" onClick={generate}>
          <FileDown size={16} aria-hidden />
          Gerar PDF
        </button>
      </header>

      <div
        data-tour="geral-filtros"
        role="group"
        aria-label="Filtros do Dashboard geral"
        className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-600"
      >
        <span className="flex flex-wrap items-center gap-2">
          Escala
          <span data-tour="geral-escala" className="inline-flex">
            <ScaleButtons period={period} onChange={choosePeriod} />
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          Período
          <span data-tour="geral-periodo" className="inline-flex max-w-full">
            <PeriodControl period={period} context={periodContext} onChange={choosePeriod} idPrefix="geral-periodo" />
          </span>
        </span>
        <span data-tour="geral-obras" className="inline-flex">
          <FilterPicker label="Obras" values={workOptions} selected={selectedLabels} onChange={chooseWorks} />
        </span>
        {available.length > 0 && (
          <span data-tour="geral-quadros" role="group" aria-label="Quadros" className="inline-flex flex-wrap items-center gap-1">
            <span className="text-slate-500">Quadros</span>
            {available.map(m => {
              const on = !chosen || chosen.has(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleModule(m.id)}
                  className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors ${
                    on ? 'border-primary-ring bg-primary-soft text-primary-ink' : 'border-slate-200 bg-white text-slate-400 line-through'
                  }`}
                >
                  <span className="tabular-nums">{m.number}</span>
                  {m.label}
                </button>
              );
            })}
          </span>
        )}
        {filtering && (
          <button type="button" className="text-link text-xs" onClick={clear}>
            Limpar
          </button>
        )}
      </div>

      <p data-tour="geral-escopo" className="pf-scope mb-4 text-xs text-slate-500">
        {!period.weeks.length || !lastWeek ? (
          'O intervalo escolhido não tem semanas com dado.'
        ) : (
          <>
            <b className="font-semibold text-slate-700">{plural(data.rows.length, 'obra', 'obras')}</b> no período
            {selectedLabels ? ` (recorte: ${selectedLabels.size} de ${works.length})` : ''} ·{' '}
            {period.weeks.length === 1
              ? `semana de ${dayMonth(period.weeks[0])}`
              : `semanas de ${dayMonth(period.weeks[0])} a ${dayMonth(lastWeek)}`}
            , tudo até o sábado {formatDate(period.end)}
            {period.partial && (
              <>
                {' '}
                · <span className="dsh-tag here">parcial</span>
              </>
            )}
            {period.scale === 'personalizado' &&
              ` · agrupado por ${GROUPING_NOUN[period.grouping].one}${(period.groupingChoice ?? 'auto') === 'auto' ? ' (automático)' : ''}`}
            {data.notStarted.length > 0 &&
              ` · ${data.notStarted.map(work => work.name).join(', ')} ${data.notStarted.length === 1 ? 'começou' : 'começaram'} depois do período`}
            {hiddenByChoice.length > 0 && ` · fora por escolha: ${hiddenByChoice.join(', ')}`}
            {unavailable.length > 0 && ` · indisponível: ${unavailable.join(', ')}`}
            {loading.length > 0 && ` · carregando: ${loading.join(', ')}`}
          </>
        )}
      </p>

      {data.sentence.length > 0 && (
        <p data-tour="geral-resumo" className="dsh-summary">
          <Text segments={data.sentence} />
        </p>
      )}
      {data.kpis.length > 0 && (
        <div data-tour="geral-cartoes" className="dsh-kpis">
          <KpiCards kpis={data.kpis} />
        </div>
      )}

      <div className="dsh-mods">
        <section data-tour="geral-comparativo" className="dsh-mod" aria-labelledby="geral-comparativo-titulo">
          <div className="dsh-mod-h">
            <h2 id="geral-comparativo-titulo">
              Comparativo das obras
              <span className="sub">
                {period.label} · {data.rows.length > 1 ? 'clique no título para ordenar' : 'clique na obra para abrir a aba 0'}
              </span>
            </h2>
          </div>
          <div className="dsh-mod-b">
            {data.rows.length ? (
              <div className="pf-xscroll">
                <ComparisonTable
                  data={data}
                  modules={columns}
                  variant="screen"
                  sort={sort}
                  onSort={onSort}
                  hrefOf={hrefOf}
                  onOpen={row => router.push(hrefOf(row))}
                />
              </div>
            ) : (
              <p className="dsh-callout">
                Nenhuma obra no período
                {data.notStarted.length ? `: ${data.notStarted.map(work => work.name).join(', ')} só começa depois dele.` : '.'}
              </p>
            )}
          </div>
        </section>

        {boards['curto-prazo'].kind !== 'hidden' && (
          <div data-tour="geral-curto">
            <Board
              module="curto-prazo"
              title="Curto prazo · as obras comparadas"
              subtitle={`${period.label} · consolidado ${totals.short.percent === undefined ? '—' : pct(totals.short.percent)}`}
              board={boards['curto-prazo']}
            >
              <div className="dsh-mod-b dsh-cols-21">
                <div className="dsh-blk">
                  <h5>PPC do período por obra</h5>
                  <p className="dsh-d">
                    Cumpridos ÷ assumidos das semanas apuradas. Obra em início (menos de 4 semanas apuradas) fica no fim, sem posição.
                  </p>
                  <PpcByWorkBars rows={data.rows} consolidated={totals.short.percent} variant="screen" />
                  <PpcBarsLegend early={earlyWorks} />
                </div>
                <div className="dsh-blk" data-tour="geral-mapa">
                  <h5>Evolução do PPC, obra × {GROUPING_NOUN[period.grouping].one}</h5>
                  <p className="dsh-d">
                    {period.scale === 'personalizado'
                      ? `Os períodos do intervalo, agrupados por ${GROUPING_NOUN[period.grouping].one}.`
                      : `${plural(data.heat.buckets.length, GROUPING_NOUN[period.grouping].one, GROUPING_NOUN[period.grouping].many)} até o analisado, que tem a borda âmbar.`}{' '}
                    Última linha: todas as obras somadas.
                  </p>
                  <PpcHeat heat={data.heat} />
                  <HeatRamp />
                </div>
                <div className="dsh-blk">
                  <h5>Causas no período, somando as obras</h5>
                  <p className="dsh-d">
                    As causas que somam 80% dos não cumpridos em vermelho, com a obra que mais contribui com cada uma.
                  </p>
                  <CausesPareto pareto={data.pareto} />
                </div>
                <div className="dsh-blk" data-tour="geral-empreiteiros">
                  <h5>Empreiteiros em mais de uma obra</h5>
                  <p className="dsh-d">
                    PPC de cada empresa em cada obra no período, pela coluna Empresa da planilha (nome comparado sem acento).
                  </p>
                  <CompaniesHeat companies={data.companies} />
                </div>
              </div>
              {hasNoDataNote('curto-prazo', data) && (
                <div className="dsh-mod-b">
                  <NoDataNote module="curto-prazo" data={data} />
                </div>
              )}
            </Board>
          </div>
        )}

        {lowerBoards.length > 0 && (
          <div data-tour="geral-modulos" className="pf-mods-2">
            {boards['longo-prazo'].kind !== 'hidden' && (
              <Board
                module="longo-prazo"
                subtitle={`em ${end} · ${plural(totals.longTerm.withMeasurement, 'obra com medição', 'obras com medição')}`}
                board={boards['longo-prazo']}
              >
                <div className="dsh-mod-b">
                  <div className="dsh-blk">
                    <h5>Avanço físico acumulado: medido × planejado</h5>
                    <p className="dsh-d">
                      Última medição até o sábado final contra o planejado pela linha de base mais recente. Embaixo, o que avançou dentro do
                      período.
                    </p>
                    <LongTermRows rows={data.rows} end={end} />
                    <NoDataNote module="longo-prazo" data={data} />
                  </div>
                </div>
              </Board>
            )}
            {boards.vagoes.kind !== 'hidden' && (
              <Board module="vagoes" title="Vagões e restrições" subtitle={`em ${end}`} board={boards.vagoes}>
                <div className="dsh-mod-b">
                  <div className="dsh-blk">
                    <h5>Vagões por status no sábado final</h5>
                    <p className="dsh-d">À direita, takt vencido e restrições vencidas na mesma data.</p>
                    <WagonRows rows={data.rows} end={end} />
                    <NoDataNote module="vagoes" data={data} />
                  </div>
                </div>
              </Board>
            )}
            {boards['medio-prazo'].kind !== 'hidden' && (
              <Board module="medio-prazo" subtitle={`em ${end}`} board={boards['medio-prazo']}>
                <div className="dsh-mod-b">
                  <div className="dsh-blk">
                    <h5>Tarefas do plano do mês no sábado final</h5>
                    <p className="dsh-d">
                      Só as folhas. À direita, atrasadas, variação contra a linha de base (dias úteis) e equipes superalocadas.
                    </p>
                    <MediumRows rows={data.rows} />
                    <NoDataNote module="medio-prazo" data={data} />
                  </div>
                </div>
              </Board>
            )}
            {boards.terminalidade.kind !== 'hidden' && (
              <Board
                module="terminalidade"
                subtitle={`${period.label} · ${totals.terminality.open} em aberto`}
                board={boards.terminalidade}
              >
                <div className="dsh-mod-b">
                  <div className="dsh-blk">
                    <h5>Pendências abertas × resolvidas no período</h5>
                    <p className="dsh-d">
                      À direita, em aberto no sábado final (e a diferença para o início), % resolvidas desde a primeira pendência e tempo
                      médio até a correção.
                    </p>
                    <TerminalityRows rows={data.rows} />
                    <NoDataNote module="terminalidade" data={data} />
                  </div>
                  <div className="dsh-blk">
                    <h5>Responsáveis terceiros com mais pendências em aberto, somando as obras</h5>
                    <ResponsiblesList responsibles={data.responsibles} />
                  </div>
                </div>
              </Board>
            )}
          </div>
        )}
      </div>

      <p data-tour="geral-rodape" className="dsh-foot-note">
        Clique numa obra da tabela para abrir a aba 0 dela no mesmo período e na mesma escala. Nada aqui se edita.{' '}
        {state.unavailable.length > 0 && (
          <button type="button" className="text-link inline-flex items-center gap-1" onClick={() => window.location.reload()}>
            <RefreshCw size={12} aria-hidden /> Recarregar a página
          </button>
        )}
      </p>
    </div>
  );
}

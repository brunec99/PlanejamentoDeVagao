'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDate } from '@/shared/format';
import { DASHBOARD_STYLE } from '../styles';
import { KpiCards, Text } from '../dashboard-overview';
import { dayMonth, pct, plural, PORTFOLIO_MODULES, type PortfolioModule } from '../model';
import { GROUPING_NOUN, scaleLabel } from '../period';
import type { PortfolioParams } from './params';
import type { PortfolioReady } from './types';
import { usePortfolio } from './use-portfolio-data';
import { PORTFOLIO_STYLE } from './portfolio-styles';
import {
  CausesPareto,
  ComparisonTable,
  CompaniesHeat,
  HeatRamp,
  LongTermRows,
  MediumRows,
  NoDataNote,
  PpcByWorkBars,
  PpcHeat,
  ResponsiblesList,
  SafetyRiskRows,
  SafetyRows,
  SafetyTypesList,
  TerminalityRows,
  WagonRows,
  comparisonModules,
  moduleBoard,
  oneDecimal,
  safetyGrave,
  type ModuleBoard,
} from './portfolio-charts';

/** O PDF do Dashboard geral (04/11/2026, regra 14 do modelo aprovado): A4 paisagem, no padrão do PDF da aba 0 e
 * do painel do fechamento (logos, faixa azul, rodapé). Cabeçalho "DASHBOARD GERAL DAS OBRAS" com a escala e o
 * período. Folha 1: frase, cartões (até sete, numa linha), comparativo (com as colunas de segurança) e PPC por
 * obra; folha 2: curto prazo (mapa de calor, causas, empreiteiros); folha 3: longo prazo e vagões; folha 4: médio
 * prazo e terminalidade; folha 5: segurança do trabalho (aba 6, modelo aprovado em 06/11/2026, regra 11: seis
 * números e os três blocos da tela). Saem só as folhas dos quadros presentes. Abre numa aba própria com escala,
 * período, obras e quadros na URL (os mesmos parâmetros da tela) e chama a impressão do navegador quando os dados
 * chegam, ou passado o limite de espera. */

/** Espera máxima pelas leituras de longo prazo e terminalidade antes de imprimir assim mesmo. */
const SOURCES_TIMEOUT_MS = 10000;

interface SheetInfo {
  ready: PortfolioReady;
  title: string;
  /** "consolidado 78%" no cabeçalho; ausente sem o quadro do curto prazo. */
  consolidated?: string;
  /** Texto próprio da folha à direita da faixa clara, no lugar de "N obras · consolidado". */
  aside?: string;
  page: number;
  total: number;
  footer: string;
  generated: string;
}

function Head({ ready, title, consolidated, aside }: Pick<SheetInfo, 'ready' | 'title' | 'consolidated' | 'aside'>) {
  const { data } = ready;
  const period = data.period;
  const lastWeek = period.weeks.at(-1) ?? period.lastWeek;
  return (
    <div className="dsh-head">
      <div>
        <span className="logos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-atr.png" alt="ATR Incorporadora" />
          <i aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-takt.png" alt="Takt Engenharia" />
        </span>
      </div>
      <div className="title">DASHBOARD GERAL DAS OBRAS</div>
      <div className="week">
        <span>
          Escala: <span className="pill">{scaleLabel(period.scale)}</span>
          <br />
          {period.label}
          {period.partial ? ' · parcial' : ''}
        </span>
      </div>
      <div className="sub">
        <span>
          <b>{title}</b> ·{' '}
          {period.weeks.length > 1 ? (
            <>
              semanas de <b>{dayMonth(period.weeks[0])}</b> a <b>{dayMonth(lastWeek)}</b>
            </>
          ) : (
            <>
              semana de <b>{dayMonth(lastWeek)}</b>
            </>
          )}
          , tudo até o sábado {formatDate(period.end)}
        </span>
        <span>
          {aside ?? (
            <>
              {plural(data.rows.length, 'obra', 'obras')}
              {consolidated ? ` · ${consolidated}` : ''}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function Foot({ ready, page, total, footer, generated }: Omit<SheetInfo, 'title' | 'consolidated' | 'aside'>) {
  return (
    <div className="dsh-foot">
      <span>
        {footer} Gerado {ready.actorName ? `por ${ready.actorName} ` : ''}em {generated}.
      </span>
      <span>
        Folha {page} de {total} · Obra 360
      </span>
    </div>
  );
}

function Sheet({ info, children }: { info: SheetInfo; children: ReactNode }) {
  return (
    <section className="dsh-sheet">
      <Head ready={info.ready} title={info.title} consolidated={info.consolidated} aside={info.aside} />
      {children}
      <Foot ready={info.ready} page={info.page} total={info.total} footer={info.footer} generated={info.generated} />
    </section>
  );
}

export function PortfolioPrint({ params }: { params: PortfolioParams }) {
  const state = usePortfolio({
    selection: params.selection,
    workIds: params.workIds,
    modules: params.modules,
    companies: params.companies,
  });
  const printed = useRef(false);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), SOURCES_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  const ready = state.status === 'ready' && (expired || state.loading.length === 0);
  const title = state.status === 'ready' ? `Dashboard geral - ${state.data.period.label}` : 'Dashboard geral';
  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    document.title = title;
    // Um respiro para as fontes e o layout assentarem antes do diálogo de impressão.
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [ready, title]);

  if (state.status === 'error')
    return (
      <div className="p-6 text-sm">
        <p className="text-danger">{state.message}</p>
        <button type="button" className="button-ghost mt-3" onClick={state.retry}>
          Tentar de novo
        </button>
      </div>
    );
  if (state.status !== 'ready' || !ready) return <p className="p-6 text-sm text-slate-500">Preparando o PDF…</p>;
  return <Sheets ready={state} params={params} />;
}

function Sheets({ ready, params }: { ready: PortfolioReady; params: PortfolioParams }) {
  const { data, works, access } = ready;
  const period = data.period;
  const end = dayMonth(period.end);
  const available = PORTFOLIO_MODULES.filter(m => access[m.id]);
  const chosen = params.modules && available.some(m => params.modules!.has(m.id)) ? params.modules : undefined;
  const boards = Object.fromEntries(PORTFOLIO_MODULES.map(m => [m.id, moduleBoard(ready, chosen, m.id)])) as Record<
    PortfolioModule,
    ModuleBoard
  >;
  const shown = (module: PortfolioModule) => boards[module].kind === 'ready';
  const columns = comparisonModules(boards);

  const generated = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date())
    .replace(', ', ' às ');
  const chosenWorks = params.workIds ? works.filter(work => params.workIds!.has(work.id)) : [];
  const worksText = chosenWorks.length ? `${chosenWorks.length} de ${works.length} escolhidas` : `todas as liberadas (${works.length})`;
  const shownModules = available.filter(m => !chosen || chosen.has(m.id));
  const modulesText = `${shownModules.length} de ${available.length}${chosen ? ` (${shownModules.map(m => m.label.toLowerCase()).join(', ')})` : ''}`;
  const unavailable = PORTFOLIO_MODULES.filter(m => boards[m.id].kind !== 'ready' && boards[m.id].kind !== 'hidden').map(m =>
    m.label.toLowerCase(),
  );
  const footer = `Escala ${scaleLabel(period.scale).toLowerCase()} · ${period.label}${period.partial ? ' (parcial)' : ''}${
    period.scale === 'personalizado' ? ` · agrupado por ${GROUPING_NOUN[period.grouping].one}` : ''
  } · Obras: ${worksText} · Quadros: ${modulesText}${
    params.companies
      ? ` · Empreiteiros: ${[...params.companies].join(', ')}${
          ready.withoutCompany.length ? ` (não aparecem em ${ready.withoutCompany.map(work => work.name).join(', ')})` : ''
        }; longo prazo, PPC geral${shown('seguranca') ? ' e segurança do trabalho' : ''} consideram a obra inteira`
      : ''
  }.${
    data.notStarted.length
      ? ` ${data.notStarted.map(work => work.name).join(', ')} só começa${data.notStarted.length > 1 ? 'm' : ''} depois do período.`
      : ''
  }`;

  const consolidated =
    shown('curto-prazo') && data.totals.short.percent !== undefined ? `consolidado ${pct(data.totals.short.percent)}` : undefined;

  // As folhas presentes, na ordem: resumo; curto prazo; longo prazo e vagões; médio prazo e terminalidade; segurança.
  const sheets: { title: string; aside?: string; body: ReactNode }[] = [];
  sheets.push({
    title: 'RESUMO E COMPARATIVO DAS OBRAS',
    body: (
      <>
        <p className="dsh-summary">
          <Text segments={data.sentence} />
          {unavailable.length > 0 && ` Quadros indisponíveis no momento: ${unavailable.join(', ')}.`}
        </p>
        {data.kpis.length > 0 && (
          <div className={`dsh-kpis${data.kpis.length <= 4 ? ' k4' : data.kpis.length === 5 ? ' k5' : data.kpis.length >= 7 ? ' k7' : ''}`}>
            <KpiCards kpis={data.kpis} paper />
          </div>
        )}
        <div className="dsh-row" style={{ gridTemplateColumns: shown('curto-prazo') ? 'minmax(0, 1fr) 262px' : '1fr' }}>
          <div className="dsh-panel">
            <h3>Comparativo das obras</h3>
            {data.rows.length ? (
              <ComparisonTable data={data} modules={columns} variant="paper" />
            ) : (
              <p className="dsh-empty">Nenhuma obra no período.</p>
            )}
          </div>
          {shown('curto-prazo') && (
            <div className="dsh-panel">
              <h3>PPC do período por obra</h3>
              <p className="dsh-desc">Obra em início no fim, hachurada, sem posição.</p>
              <PpcByWorkBars rows={data.rows} consolidated={data.totals.short.percent} variant="paper" />
            </div>
          )}
        </div>
      </>
    ),
  });
  if (shown('curto-prazo'))
    sheets.push({
      title: 'CURTO PRAZO · AS OBRAS COMPARADAS',
      body: (
        <div className="dsh-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
          <div className="dsh-panel" style={{ gridColumn: '1 / -1' }}>
            <h3>Evolução do PPC, obra × {GROUPING_NOUN[period.grouping].one}</h3>
            <p className="dsh-desc">
              {period.scale === 'personalizado'
                ? `Os períodos do intervalo, agrupados por ${GROUPING_NOUN[period.grouping].one}.`
                : 'O período analisado com a borda âmbar.'}{' '}
              Última linha: todas as obras somadas.
            </p>
            <PpcHeat heat={data.heat} />
            <HeatRamp />
          </div>
          <div className="dsh-panel">
            <h3>Causas no período, somando as obras</h3>
            <p className="dsh-desc">As causas que somam 80% dos não cumpridos em vermelho, com a obra que mais contribui com cada uma.</p>
            <CausesPareto pareto={data.pareto} limit={8} />
          </div>
          <div className="dsh-panel">
            <h3>Empreiteiros em mais de uma obra</h3>
            <p className="dsh-desc">PPC de cada empresa em cada obra no período (coluna Empresa, nome comparado sem acento).</p>
            <CompaniesHeat companies={data.companies} />
            <NoDataNote module="curto-prazo" data={data} />
          </div>
        </div>
      ),
    });
  if (shown('longo-prazo') || shown('vagoes')) {
    const both = shown('longo-prazo') && shown('vagoes');
    sheets.push({
      title: both ? 'LONGO PRAZO E VAGÕES' : shown('longo-prazo') ? 'LONGO PRAZO' : 'VAGÕES E RESTRIÇÕES',
      body: (
        <div className="dsh-row" style={{ gridTemplateColumns: both ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr' }}>
          {shown('longo-prazo') && (
            <div className="dsh-panel">
              <h3>Longo prazo · avanço físico acumulado em {end}</h3>
              <p className="dsh-desc">
                Medido × planejado pela linha de base mais recente; embaixo, o que avançou dentro do período e o prazo contra a linha de
                base.
              </p>
              <LongTermRows rows={data.rows} end={end} />
              <NoDataNote module="longo-prazo" data={data} />
            </div>
          )}
          {shown('vagoes') && (
            <div className="dsh-panel">
              <h3>Vagões por status em {end}</h3>
              <p className="dsh-desc">À direita, takt vencido e restrições vencidas na mesma data.</p>
              <WagonRows rows={data.rows} end={end} />
              <NoDataNote module="vagoes" data={data} />
            </div>
          )}
        </div>
      ),
    });
  }
  if (shown('medio-prazo') || shown('terminalidade')) {
    const both = shown('medio-prazo') && shown('terminalidade');
    sheets.push({
      title: both ? 'MÉDIO PRAZO E TERMINALIDADE' : shown('medio-prazo') ? 'MÉDIO PRAZO' : 'TERMINALIDADE',
      body: (
        <div className="dsh-row" style={{ gridTemplateColumns: both ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr' }}>
          {shown('medio-prazo') && (
            <div className="dsh-panel">
              <h3>Médio prazo · tarefas do plano do mês em {end}</h3>
              <p className="dsh-desc">
                Só as folhas. À direita, atrasadas, variação contra a linha de base (dias úteis) e equipes superalocadas.
              </p>
              <MediumRows rows={data.rows} />
              <NoDataNote module="medio-prazo" data={data} />
            </div>
          )}
          {shown('terminalidade') && (
            <div className="dsh-panel">
              <h3>Terminalidade · pendências abertas × resolvidas no período</h3>
              <p className="dsh-desc">
                À direita, em aberto em {end} (e a diferença para o início), % resolvidas e tempo médio até a correção.
              </p>
              <TerminalityRows rows={data.rows} />
              <NoDataNote module="terminalidade" data={data} />
              <p className="dsh-desc" style={{ marginTop: 10, fontWeight: 700, color: '#1f2937' }}>
                Responsáveis terceiros com mais pendências em aberto, somando as obras
              </p>
              <ResponsiblesList responsibles={data.responsibles} />
            </div>
          )}
        </div>
      ),
    });
  }
  if (shown('seguranca')) {
    const safety = data.totals.safety;
    const diff = safety.open - safety.openAtStart;
    const made = safety.byConsequence.reduce((sum, value) => sum + value, 0);
    const grave = safetyGrave(safety.byConsequence);
    sheets.push({
      title: 'SEGURANÇA DO TRABALHO',
      aside: `${safety.works} de ${plural(data.rows.length, 'obra', 'obras')} com apontamentos · fluxo no período, retrato em ${end}`,
      body: (
        <>
          <div className="dsh-kpis pf-sst-kpis">
            <div className="dsh-kpi main">
              <div className="l">
                <span>Em aberto em {end}</span>
              </div>
              <div className="v">
                {safety.open}
                <span className={`dl ${diff > 0 ? 't-bad' : diff < 0 ? 't-good' : 't-mut'}`}>
                  {diff > 0 ? `▲ ${diff}` : diff < 0 ? `▼ ${-diff}` : '= 0'}
                </span>
              </div>
              <div className="h">{safety.openAtStart} no início do período</div>
            </div>
            <div className="dsh-kpi">
              <div className="l">
                <span>Abertos há mais de 7 dias</span>
              </div>
              <div className={`v ${safety.openOver7 ? 't-bad' : 't-good'}`}>{safety.openOver7}</div>
              <div className="h">{safety.worksOver7 ? `em ${plural(safety.worksOver7, 'obra', 'obras')}` : 'em nenhuma obra'}</div>
            </div>
            <div className="dsh-kpi">
              <div className="l">
                <span>Feitos no período</span>
              </div>
              <div className="v">{safety.opened}</div>
              <div className="h">pela data do apontamento</div>
            </div>
            <div className="dsh-kpi">
              <div className="l">
                <span>Finalizados no período</span>
              </div>
              <div className="v">{safety.resolved}</div>
              <div className="h">pela data de correção</div>
            </div>
            <div className="dsh-kpi">
              <div className="l">
                <span>Média de dias para resolver</span>
              </div>
              <div className="v">{safety.averageDaysToResolve === undefined ? '—' : oneDecimal(safety.averageDaysToResolve)}</div>
              <div className="h">dos finalizados no período</div>
            </div>
            <div className="dsh-kpi">
              <div className="l">
                <span>Graves (Morte + Severa)</span>
              </div>
              <div className="v">{grave}</div>
              <div className="h">{made ? `${pct((grave / made) * 100)} dos feitos no período` : 'nenhum feito no período'}</div>
            </div>
          </div>
          <div className="dsh-row" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, 1fr)' }}>
            <div className="dsh-panel">
              <h3>Feitos × finalizados no período</h3>
              <p className="dsh-desc">
                À direita: em aberto em {end} (variação) · &gt; 7 dias · média de dias.
                {params.companies ? ' Sem recorte de empreiteiro: a vistoria não registra a empresa.' : ''}
              </p>
              <SafetyRows rows={data.rows} />
              <NoDataNote module="seguranca" data={data} />
            </div>
            <div className="dsh-panel">
              <h3>Risco dos feitos no período</h3>
              <p className="dsh-desc">Pela consequência. À direita: graves (Morte + Severa).</p>
              <SafetyRiskRows rows={data.rows} total={safety} />
            </div>
            <div className="dsh-panel">
              <h3>Tipos com mais apontamentos</h3>
              <p className="dsh-desc">Somando as obras, com a contagem em cada uma.</p>
              <SafetyTypesList types={data.safetyTypes} />
            </div>
          </div>
        </>
      ),
    });
  }

  return (
    <div className="dsh-paper">
      <style>{DASHBOARD_STYLE}</style>
      <style>{PORTFOLIO_STYLE}</style>
      <style>{`@page { size: A4 landscape; margin: 7mm; }`}</style>
      <div className="dsh-toolbar">
        <button type="button" className="button" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </button>
        <span style={{ color: '#59738a' }}>
          No diálogo, escolha &quot;Salvar como PDF&quot; e o modo paisagem. {plural(sheets.length, 'folha', 'folhas')}, {period.label}.
        </span>
      </div>
      {sheets.map((sheet, index) => (
        <Sheet
          key={sheet.title}
          info={{ ready, title: sheet.title, consolidated, aside: sheet.aside, page: index + 1, total: sheets.length, footer, generated }}
        >
          {sheet.body}
        </Sheet>
      ))}
    </div>
  );
}

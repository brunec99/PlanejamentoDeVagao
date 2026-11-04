'use client';
import type { ReactNode } from 'react';
import { MIN_RANKED_WEEKS } from '@/domain/closing-ranking';
import type { CauseTally } from '@/domain/rules';
import { paretoCallout, SERIES_WEEKS, topCauses, vitalCauses, type ClosingDashboard } from '@/modules/curto-prazo/closing-dashboard';
import { HistoryBars, PpcBars } from '@/modules/dashboard/charts';
import { monthLong, monthOf, monthsBetween, pct, plural, type Segment } from '@/modules/dashboard/model';
import { yearsSentence, type ShortTermHistory, type ShortTermPanelData } from '@/modules/dashboard/short-term-panel';
import { workPath } from '@/shared/format';

/** Quadro do curto prazo da aba 0 (04/11/2026, modelo aprovado): na tela, dois blocos (o painel do fechamento
 * e o histórico desde a semana 1); no papel, três painéis para a folha 1 do PDF. Os números são os de
 * `buildShortTermPanel`, os mesmos da primeira página do PDF do fechamento para a mesma semana. */

const PARETO_CAUSES = 5;
const WEEK_CAUSES = 6;
const PARETO_COLUMNS = 'minmax(0,1fr) 44px minmax(0,.8fr) 58px';
const VITAL = '#be123c';
const PLANNED = '#2a78d6';
const REST = '#c4d3df';

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** "ago/2024" a partir de "2024-08": o ano inteiro, porque o histórico atravessa anos. */
const monthYear = (month: string) => `${MONTHS_SHORT[Number(month.slice(5, 7)) - 1] ?? month}/${month.slice(0, 4)}`;

function Text({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.strong ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}

export function ShortTermPanel({
  data,
  variant,
  workId,
}: {
  data: ShortTermPanelData;
  variant: 'screen' | 'paper';
  workId: string;
}): ReactNode {
  return variant === 'paper' ? <Paper data={data} /> : <Screen data={data} workId={workId} />;
}

// ─── Tela ────────────────────────────────────────────────────────────────────────────────────────────
function Screen({ data, workId }: { data: ShortTermPanelData; workId: string }) {
  const d = data.closing;
  const n = data.weekNumber;
  return (
    <>
      <div className="dsh-mod-b dsh-cols-2">
        <div className="dsh-blk">
          <h5>PPC da semana e das anteriores</h5>
          <p className="dsh-d">
            As {SERIES_WEEKS} semanas até a analisada; a faixa âmbar é a semana {n}. Tracejado: média das semanas apuradas.
          </p>
          {d.series.length ? (
            <PpcBars series={d.series} week={d.week} average={d.average} label={data.label} />
          ) : (
            <p className="dsh-empty">{emptySeries(data)}</p>
          )}
          <RankingNote d={d} />
        </div>
        <div className="dsh-blk">
          <h5>Principais causas na obra · Pareto</h5>
          <p className="dsh-d">
            Só as linhas com Status Não e causa apontada, do início da obra até a semana {n}
            {data.companyFiltered ? ', no recorte de empreiteiro' : ''}.
          </p>
          <Pareto d={d} />
          <h5 style={{ marginTop: 12 }}>Causas na semana {n}</h5>
          <WeekCauses d={d} />
          <p className="dsh-legend">
            <a href={`${workPath(workId, 'curto-prazo')}?secao=fechamento`}>Abrir o fechamento da aba 4</a>
          </p>
        </div>
      </div>
      <div className="dsh-mod-b" style={{ gridTemplateColumns: 'minmax(0,2.1fr) minmax(0,1fr)' }}>
        <div className="dsh-blk">
          <h5>Histórico desde a semana 1 · PPC por mês</h5>
          <p className="dsh-d">
            Todo o passado da obra: as semanas importadas da planilha PCP e as seguintes do sistema. Cada barra é o PPC do mês; o tracejado
            é o PPC geral.
          </p>
          <History data={data} />
        </div>
        <div className="dsh-blk">
          <HistoryCards data={data} />
          <HistoryCallout history={data.history} />
        </div>
      </div>
    </>
  );
}

const emptySeries = (data: ShortTermPanelData) =>
  data.companyFiltered
    ? `Nenhum compromisso do empreiteiro escolhido até a semana ${data.weekNumber}.`
    : `Nenhum compromisso registrado até a semana ${data.weekNumber}.`;

/** A posição no ranking das obras pelo PPC geral, sempre da obra inteira, com a média das obras. */
function RankingNote({ d }: { d: ClosingDashboard }) {
  if (!d.ranking) return <p className="dsh-legend">Ranking das obras indisponível no momento.</p>;
  if (d.position === undefined)
    return <p className="dsh-legend">Com menos de {MIN_RANKED_WEEKS} semanas apuradas, a obra ainda não tem posição no ranking.</p>;
  if (d.ranked < 2) return <p className="dsh-legend">Só esta obra tem posição no ranking das obras.</p>;
  return (
    <p className="dsh-legend">
      <span>
        <span className="dsh-tag here">
          {d.position}º de {d.ranked} obras
        </span>{' '}
        no PPC geral
      </span>
      {d.mean !== undefined && <span>Média das obras: {pct(d.mean)}</span>}
    </p>
  );
}

/** Chamada e tabela do Pareto da obra: as causas vitais (os primeiros 80%) em vermelho quando há concentração. */
function Pareto({ d }: { d: ClosingDashboard }) {
  const tally = d.pareto;
  if (!tally.length)
    return <p className="dsh-empty">Nenhuma falha apurada ainda. O Pareto se forma quando as linhas não cumpridas recebem a causa.</p>;
  const vital = vitalCauses(tally);
  const concentrated = tally.length > 1 && vital < tally.length;
  const { rows, rest } = topCauses(tally, PARETO_CAUSES);
  return (
    <>
      <div className={`dsh-callout${concentrated ? ' alert' : ''}`}>
        <Text segments={paretoCallout(tally)} />
      </div>
      <div className="dsh-grid">
        <div className="thd" style={{ gridTemplateColumns: PARETO_COLUMNS }}>
          <span>Causa</span>
          <span className="num">Falhas</span>
          <span>Participação</span>
          <span className="num">Acumulado</span>
        </div>
        {rows.map((item, index) => (
          <ParetoRow key={item.cause} item={item} color={concentrated && index < vital ? VITAL : PLANNED} />
        ))}
        {rest && (
          <div className="muted" style={{ gridTemplateColumns: PARETO_COLUMNS }}>
            <span className="txt">Outras {rest.causes} causas</span>
            <span className="num plain">{rest.total}</span>
            <Share share={rest.share} color={REST} />
            <span className="num">100%</span>
          </div>
        )}
      </div>
    </>
  );
}

function ParetoRow({ item, color }: { item: CauseTally; color: string }) {
  return (
    <div style={{ gridTemplateColumns: PARETO_COLUMNS }}>
      <span className="txt" title={item.cause}>
        {item.cause}
      </span>
      <span className="num plain">{item.total}</span>
      <Share share={item.share} color={color} />
      <span className="num">{pct(item.accumulated)}</span>
    </div>
  );
}

function Share({ share, color }: { share: number; color: string }) {
  return (
    <span className="share">
      <span className="dsh-track thin">
        <b style={{ width: `${Math.max(2, Math.round(share))}%`, background: color }} />
      </span>
      <em>{pct(share)}</em>
    </span>
  );
}

/** As causas da semana analisada, com a posição de cada uma no Pareto da obra (como o painel do PDF). */
function WeekCauses({ d }: { d: ClosingDashboard }) {
  const { rows, rest } = topCauses(d.weekCauses, WEEK_CAUSES);
  const peak = Math.max(1, ...rows.map(item => item.total));
  const rankOf = (cause: string) => d.pareto.findIndex(item => item.cause === cause) + 1;
  const c = d.current;
  const note = !c
    ? 'Semana sem compromissos.'
    : c.pending > 0
      ? `Semana em aberto: ${plural(c.pending, 'linha', 'linhas')} sem Status.`
      : d.uncaused > 0
        ? `${plural(d.uncaused, 'linha com Não está', 'linhas com Não estão')} sem causa e fora desta lista.`
        : d.failures
          ? `Semana apurada: as ${c.planned} linhas têm Status, e todas as ${d.failures} com Não têm causa.`
          : `Semana apurada: as ${c.planned} linhas têm Status e nenhuma ficou como Não.`;
  return (
    <>
      {rows.length > 0 ? (
        <div className="dsh-hb">
          {rows.map(item => (
            <div key={item.cause} className="ranked">
              <span className="txt" title={item.cause}>
                {item.cause}
              </span>
              <span className="num">{item.total}</span>
              <span className="rk">{rankOf(item.cause)}ª na obra</span>
              <span className="dsh-track">
                <b style={{ width: `${(item.total / peak) * 100}%` }} />
              </span>
            </div>
          ))}
          {rest && (
            <div>
              <span className="txt" style={{ gridColumn: '1 / -1' }}>
                Outras {rest.causes} causas ({plural(rest.total, 'falha', 'falhas')})
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="dsh-hb">
          <div>
            <span className="none" style={{ gridColumn: '1 / -1' }}>
              {d.failures ? 'Nenhuma falha da semana tem causa apontada.' : 'Nenhum compromisso não cumprido.'}
            </span>
          </div>
        </div>
      )}
      <p className="dsh-legend">
        {d.failures ? `${plural(d.failures, 'compromisso não cumprido', 'compromissos não cumpridos')}. ` : ''}
        {note}
      </p>
    </>
  );
}

const chartMonths = (history: ShortTermHistory) =>
  history.months.flatMap(item => (item.percent === undefined ? [] : [{ month: item.month, percent: item.percent, weeks: item.weeks }]));

function History({ data, width, height }: { data: ShortTermPanelData; width?: number; height?: number }) {
  const months = chartMonths(data.history);
  if (!months.length) return <p className="dsh-empty">Nenhuma semana apurada até a semana {data.weekNumber}.</p>;
  return (
    <HistoryBars months={months} overall={data.history.overall} hereMonth={monthOf(data.closing.week)} width={width} height={height} />
  );
}

function HistoryCards({ data }: { data: ShortTermPanelData }) {
  const h = data.history;
  const allMonths = monthsBetween(h.firstWeek, data.closing.week);
  const open = h.totalWeeks - h.closedWeeks;
  return (
    <div className="dsh-mini">
      <div>
        <div className="l">PPC geral desde a semana 1</div>
        <div className="v">{h.overall === undefined ? '—' : pct(h.overall)}</div>
        <div className="h">{h.closedWeeks ? `${h.fulfilled} cumpridos de ${h.planned} assumidos` : 'nenhuma semana apurada'}</div>
      </div>
      <div>
        <div className="l">Semanas apuradas</div>
        <div className="v">
          {h.closedWeeks} de {h.totalWeeks}
        </div>
        <div className="h">{open ? plural(open, 'semana em aberto', 'semanas em aberto') : 'todas as semanas com linha'}</div>
      </div>
      <div>
        <div className="l">Falhas com causa</div>
        <div className="v">{h.failuresWithCause}</div>
        <div className="h">
          {h.failures
            ? `${pct((h.failuresWithCause / h.failures) * 100)} das ${plural(h.failures, 'linha com Não', 'linhas com Não')}`
            : 'nenhuma linha com Não'}
        </div>
      </div>
      <div>
        <div className="l">Meses</div>
        <div className="v">{allMonths.length}</div>
        <div className="h">
          {allMonths.length > 1 ? `${monthYear(allMonths[0])} a ${monthYear(allMonths.at(-1)!)}` : monthYear(allMonths[0])}
        </div>
      </div>
    </div>
  );
}

function HistoryCallout({ history }: { history: ShortTermHistory }) {
  const { best, worst } = history;
  if (!best || !worst) return null;
  const single = best.month === worst.month;
  return (
    <div className="dsh-callout">
      {single ? (
        <>
          Único mês com semana apurada: {monthLong(best.month)} (<strong>{pct(best.percent!)}</strong>).
        </>
      ) : (
        <>
          Melhor mês: {monthLong(best.month)} (<strong>{pct(best.percent!)}</strong>); pior: {monthLong(worst.month)} (
          <strong>{pct(worst.percent!)}</strong>).
        </>
      )}{' '}
      {yearsSentence(history.years)}
    </div>
  );
}

// ─── Papel: três painéis para a folha 1 do PDF ───────────────────────────────────────────────────────
function Paper({ data }: { data: ShortTermPanelData }) {
  const d = data.closing;
  const h = data.history;
  const n = data.weekNumber;
  const open = h.totalWeeks - h.closedWeeks;
  return (
    <>
      <div className="dsh-panel">
        <h3>Aba 4 · PPC da semana e das anteriores</h3>
        <p className="dsh-desc">
          As {SERIES_WEEKS} semanas até a semana {n}. Cada barra é uma semana; a faixa âmbar é a semana analisada; o tracejado, a média das
          apuradas.
        </p>
        {d.series.length ? (
          <PpcBars series={d.series} week={d.week} average={d.average} label={data.label} width={640} height={205} />
        ) : (
          <p className="dsh-empty">{emptySeries(data)}</p>
        )}
        <RankingNote d={d} />
      </div>
      <div className="dsh-panel">
        <h3>Aba 4 · Principais causas na obra · Pareto</h3>
        <p className="dsh-desc">
          Só as linhas com Status Não e causa apontada, do início da obra até a semana {n}
          {data.companyFiltered ? ', no recorte de empreiteiro' : ''}.
        </p>
        <Pareto d={d} />
      </div>
      <div className="dsh-panel" style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.3fr 1fr', gap: 14, minHeight: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h3>Aba 4 · Histórico desde a semana 1 · PPC por mês</h3>
            <p className="dsh-desc">
              As semanas importadas da planilha PCP e as seguintes do sistema. Cada barra é o PPC do mês; o tracejado é o PPC geral.
            </p>
            <History data={data} width={760} height={108} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3>Desde a semana 1</h3>
            <div className="dsh-mini compact" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 4 }}>
              <div>
                <div className="l">PPC geral</div>
                <div className="v">{h.overall === undefined ? '—' : pct(h.overall)}</div>
                <div className="h">{h.closedWeeks ? `${h.fulfilled} de ${h.planned} compromissos` : 'nenhuma semana apurada'}</div>
              </div>
              <div>
                <div className="l">Semanas apuradas</div>
                <div className="v">
                  {h.closedWeeks} de {h.totalWeeks}
                </div>
                <div className="h">{open ? plural(open, 'em aberto', 'em aberto') : 'todas com linha'}</div>
              </div>
              <div>
                <div className="l">Por ano</div>
                <div className="v">{h.years.map(item => (item.percent === undefined ? '—' : Math.round(item.percent))).join(' · ')}</div>
                <div className="h">{h.years.map(item => item.year).join(' · ')}</div>
              </div>
              <div>
                <div className="l">Falhas com causa</div>
                <div className="v">{h.failuresWithCause}</div>
                <div className="h">
                  {h.failures
                    ? `${pct((h.failuresWithCause / h.failures) * 100)} das ${plural(h.failures, 'linha com Não', 'linhas com Não')}`
                    : 'nenhuma linha com Não'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

'use client';
import type { ReactNode } from 'react';
import { MIN_RANKED_WEEKS } from '@/domain/closing-ranking';
import type { CauseTally } from '@/domain/rules';
import { paretoCallout, SERIES_WEEKS, topCauses, vitalCauses, type ClosingDashboard } from '@/modules/curto-prazo/closing-dashboard';
import { HistoryBars, PpcBars } from '@/modules/dashboard/charts';
import { PeriodPpcBars } from '@/modules/dashboard/charts-period';
import { monthLong, monthOf, monthsBetween, pct, plural, signedPoints, type Segment } from '@/modules/dashboard/model';
import { GROUPING_NOUN, SCALE_OF } from '@/modules/dashboard/period';
import {
  periodDelta,
  periodNoun,
  yearsSentence,
  type ShortTermHistory,
  type ShortTermPanelData,
} from '@/modules/dashboard/short-term-panel';
import { workPath } from '@/shared/format';

/** Quadro do curto prazo da aba 0 (04/11/2026, modelo aprovado): na tela, dois blocos (o painel do fechamento
 * e o histórico desde a semana 1); no papel, três painéis para a folha 1 do PDF. Os números são os de
 * `buildShortTermPanel`, os mesmos da primeira página do PDF do fechamento para a mesma semana.
 *
 * Fora da escala semanal (escalas de tempo, 04/11/2026): o bloco da série mostra o PPC por balde
 * (`PeriodPpcBars`) com os números miúdos do período, e "Causas na semana" vira "Causas do mês/período". O
 * Pareto da obra, o histórico e o ranking ficam como estão. Na escala semanal, nada muda. */

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
  const weekly = data.periodInfo.scale === 'semana';
  return (
    <>
      <div className="dsh-mod-b dsh-cols-2">
        <div className="dsh-blk">
          {weekly ? (
            <>
              <h5>PPC da semana e das anteriores</h5>
              <p className="dsh-d">
                As {SERIES_WEEKS} semanas até a analisada; a faixa âmbar é a semana {n}. Tracejado: média das semanas apuradas.
              </p>
              {d.series.length ? (
                <PpcBars series={d.series} week={d.week} average={d.average} label={data.label} />
              ) : (
                <p className="dsh-empty">{emptySeries(data)}</p>
              )}
            </>
          ) : (
            <>
              <h5>{periodTitle(data)}</h5>
              <p className="dsh-d">{periodDescription(data)}</p>
              <PeriodNumbers data={data} />
              <PeriodSeries data={data} />
            </>
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
          {weekly ? (
            <>
              <h5 style={{ marginTop: 12 }}>Causas na semana {n}</h5>
              <WeekCauses d={d} />
            </>
          ) : (
            <>
              <h5 style={{ marginTop: 12 }}>Causas {data.periodInfo.of}</h5>
              <PeriodCauses data={data} />
            </>
          )}
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

// ─── Período (fora da escala semanal) ────────────────────────────────────────────────────────────────

/** "PPC do mês e dos anteriores"; no personalizado, "PPC do período por mês". */
function periodTitle(data: ShortTermPanelData) {
  const info = data.periodInfo;
  return info.scale === 'personalizado' ? `PPC do período por ${GROUPING_NOUN[info.grouping].one}` : `PPC ${info.of} e dos anteriores`;
}

/** O balde analisado na frase da faixa âmbar: "o mês analisado", "o trimestre analisado", "o ano analisado". */
const ANALYZED = { semana: 'a semana analisada', mes: 'o mês analisado', trimestre: 'o trimestre analisado', ano: 'o ano analisado' };

function periodDescription(data: ShortTermPanelData) {
  const info = data.periodInfo;
  const g = info.grouping;
  const many = `${g === 'semana' ? 'das' : 'dos'} ${GROUPING_NOUN[g].many}`;
  const each = `cada barra soma cumpridos ÷ assumidos das semanas apuradas ${SCALE_OF[g]}`;
  return info.scale === 'personalizado'
    ? `${plural(info.weeks, 'semana', 'semanas')} de ${info.label}, por ${GROUPING_NOUN[g].one}: ${each}. Tracejado: média simples ${many} com PPC.`
    : `Série por ${GROUPING_NOUN[g].one} até ${info.label}: ${each}; a faixa âmbar é ${ANALYZED[g]}. Tracejado: média simples ${many} com PPC.`;
}

/** O balde anterior nos números miúdos: "set/26: 74%". */
function previousText(data: ShortTermPanelData) {
  const previous = data.period.previous;
  if (!previous) return 'sem período anterior';
  return `${previous.short}: ${previous.percent === undefined ? 'sem semana apurada' : pct(previous.percent)}`;
}

/** Semanas apuradas: o que falta para o período estar todo apurado. */
function weeksText(data: ShortTermPanelData) {
  const c = data.period.current;
  const info = data.periodInfo;
  const empty = info.weeks - c.closedWeeks - c.openWeeks;
  const parts = [
    c.openWeeks ? `${plural(c.openWeeks, 'em aberto', 'em aberto')}, fora do PPC` : '',
    info.partial ? 'período em andamento' : '',
    empty > 0 ? plural(empty, 'sem compromissos', 'sem compromissos') : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'todas apuradas';
}

/** Os números miúdos do período: PPC, comparação com o anterior e semanas apuradas. */
function PeriodNumbers({ data }: { data: ShortTermPanelData }) {
  const c = data.period.current;
  const delta = periodDelta(data.period);
  return (
    <div className="dsh-mini" style={{ marginBottom: 6 }}>
      <div>
        <div className="l">PPC {data.periodInfo.of}</div>
        <div className="v">{c.percent === undefined ? '—' : pct(c.percent)}</div>
        <div className="h">
          {c.closedWeeks ? `${c.fulfilled} de ${plural(c.planned, 'compromisso', 'compromissos')}` : 'nenhuma semana apurada'}
        </div>
      </div>
      <div>
        <div className="l">vs anterior</div>
        <div className="v">{delta === undefined ? '—' : signedPoints(delta)}</div>
        <div className="h">{previousText(data)}</div>
      </div>
      <div>
        <div className="l">Semanas apuradas</div>
        <div className="v">
          {c.closedWeeks} de {data.periodInfo.nominalWeeks}
        </div>
        <div className="h">{weeksText(data)}</div>
      </div>
    </div>
  );
}

/** Os mesmos números numa linha, para o papel. */
function periodNumbersLine(data: ShortTermPanelData) {
  const c = data.period.current;
  const delta = periodDelta(data.period);
  const previous = data.period.previous;
  return [
    `PPC ${data.periodInfo.of}: ${c.percent === undefined ? '—' : `${pct(c.percent)} (${c.fulfilled} de ${plural(c.planned, 'compromisso', 'compromissos')})`}`,
    delta === undefined || !previous
      ? ''
      : `${signedPoints(delta)} vs ${data.periodInfo.scale === 'personalizado' ? 'período anterior' : previous.short}`,
    `${c.closedWeeks} de ${plural(data.periodInfo.nominalWeeks, 'semana apurada', 'semanas apuradas')}${c.openWeeks ? ` (${plural(c.openWeeks, 'em aberto', 'em aberto')})` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function PeriodSeries({ data, width, height }: { data: ShortTermPanelData; width?: number; height?: number }) {
  const series = data.period.series;
  if (!series.some(bucket => bucket.closedWeeks || bucket.openWeeks))
    return (
      <p className="dsh-empty">
        {data.companyFiltered ? 'Nenhum compromisso do empreiteiro escolhido' : 'Nenhum compromisso registrado'} na série até{' '}
        {data.periodInfo.label}.
      </p>
    );
  return (
    <PeriodPpcBars
      buckets={series}
      grouping={data.periodInfo.grouping}
      analyzedKey={data.periodInfo.analyzedKey}
      average={data.period.average}
      width={width}
      height={height}
    />
  );
}

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
    <CauseList
      causes={d.weekCauses}
      pareto={d.pareto}
      failures={d.failures}
      none={d.failures ? 'Nenhuma falha da semana tem causa apontada.' : 'Nenhum compromisso não cumprido.'}
      note={note}
    />
  );
}

/** As causas das semanas do período (todas, inclusive as em aberto), com a posição no Pareto da obra. */
function PeriodCauses({ data }: { data: ShortTermPanelData }) {
  const p = data.period;
  const c = p.current;
  const of = data.periodInfo.of;
  const note =
    !c.closedWeeks && !c.openWeeks
      ? `${periodNoun(data.periodInfo.scale)} sem compromissos.`
      : [
          p.uncaused > 0
            ? `${plural(p.uncaused, 'linha com Não está', 'linhas com Não estão')} sem causa e fora desta lista.`
            : p.failures === 1
              ? 'A linha com Não tem causa.'
              : p.failures
                ? `Todas as ${p.failures} linhas com Não têm causa.`
                : `Nenhuma linha ficou como Não nas semanas ${of}.`,
          c.openWeeks && p.failures ? 'Inclui as linhas com Não das semanas em aberto.' : '',
        ]
          .filter(Boolean)
          .join(' ');
  return (
    <CauseList
      causes={p.causes}
      pareto={data.closing.pareto}
      failures={p.failures}
      none={p.failures ? `Nenhuma falha ${of} tem causa apontada.` : 'Nenhum compromisso não cumprido.'}
      note={note}
    />
  );
}

function CauseList({
  causes,
  pareto,
  failures,
  none,
  note,
}: {
  causes: CauseTally[];
  pareto: CauseTally[];
  failures: number;
  none: string;
  note: string;
}) {
  const { rows, rest } = topCauses(causes, WEEK_CAUSES);
  const peak = Math.max(1, ...rows.map(item => item.total));
  const rankOf = (cause: string) => pareto.findIndex(item => item.cause === cause) + 1;
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
              {none}
            </span>
          </div>
        </div>
      )}
      <p className="dsh-legend">
        {failures ? `${plural(failures, 'compromisso não cumprido', 'compromissos não cumpridos')}. ` : ''}
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
  const weekly = data.periodInfo.scale === 'semana';
  return (
    <>
      <div className="dsh-panel">
        {weekly ? (
          <>
            <h3>Aba 4 · PPC da semana e das anteriores</h3>
            <p className="dsh-desc">
              As {SERIES_WEEKS} semanas até a semana {n}. Cada barra é uma semana; a faixa âmbar é a semana analisada; o tracejado, a média
              das apuradas.
            </p>
            {d.series.length ? (
              <PpcBars series={d.series} week={d.week} average={d.average} label={data.label} width={640} height={205} />
            ) : (
              <p className="dsh-empty">{emptySeries(data)}</p>
            )}
          </>
        ) : (
          <>
            <h3>Aba 4 · {periodTitle(data)}</h3>
            <p className="dsh-desc">
              <strong>{periodNumbersLine(data)}.</strong> {periodDescription(data)}
            </p>
            <PeriodSeries data={data} width={640} height={190} />
          </>
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

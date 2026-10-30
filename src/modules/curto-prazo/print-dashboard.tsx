'use client';
import type { WeeklyCommitment, Work } from '@/domain/entities';
import type { ClosingRankingResponse, RankingEntry } from '@/domain/closing-ranking';
import type { WeekPpc } from '@/domain/rules';
import { addDays } from '@/domain/validation';
import { CHART, STATUS } from '@/shared/palette';
import { formatDate } from '@/shared/format';
import {
  AVERAGE_ALERT,
  closingDashboard,
  closingSummary,
  paretoCallout,
  SERIES_WEEKS,
  topCauses,
  visibleRanking,
  vitalCauses,
  type ClosingDashboard,
  type Segment,
} from '@/modules/curto-prazo/closing-dashboard';

/** Primeira página do PDF do fechamento (30/10/2026, modelo aprovado pelo usuário): o painel com o PPC
 * da semana contra as anteriores, o ranking das obras pelo PPC geral e as principais causas. Ocupa uma
 * folha A4 paisagem inteira (a área útil com as margens de 7 mm é 1069 × 741 px) e quebra a página
 * depois; a planilha de resultados segue como antes. O painel considera sempre a obra inteira: os
 * empreiteiros desmarcados na janela saem só da planilha. Cores fixas, porque é papel. */

const dayMonth = (date: string) => formatDate(date).slice(0, 5);
const pct = (value: number) => `${Math.round(value)}%`;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const RANKING_ROWS = 7;
const WEEK_CAUSES = 6;
const PARETO_CAUSES = 5;

const STYLE = `
  .pcd-page { height: 732px; max-width: 1069px; margin: 0 auto 16px; display: flex; flex-direction: column; gap: 9px; break-after: page; page-break-after: always; font-size: 11px; color: #111; }
  .pcd-head { display: grid; grid-template-columns: 26% 52% 22%; border: 1px solid #1f2937; }
  .pcd-band { display: contents; }
  .pcd-band > div { background: #6d9eeb; height: 44px; display: flex; align-items: center; padding: 0 8px; font-weight: 700; }
  .pcd-band .pcd-title { justify-content: center; font-size: 15px; text-align: center; }
  .pcd-band .pcd-week { justify-content: flex-end; text-align: right; font-size: 10px; font-weight: 400; line-height: 1.5; }
  .pcp-print .pcd-band .pcp-logos img { height: 22px; }
  .pcp-print .pcd-band .pcp-logos-sep { height: 20px; }
  .pcd-pill { display: inline-block; border-radius: 999px; background: #fff; padding: 0 7px; font-weight: 700; }
  .pcd-sub { grid-column: 1 / -1; background: #c9daf8; border-top: 1px solid #1f2937; height: 22px; display: flex; align-items: center; padding: 0 8px; }
  .pcd-summary { margin: 0; font-size: 11.5px; line-height: 1.45; color: #1f2937; }
  .pcd-summary strong { color: #111; }
  .pcd-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 9px; }
  .pcd-kpi { border: 1px solid #c4d3df; border-radius: 4px; padding: 8px 11px 9px; display: grid; gap: 1px; align-content: start; }
  .pcd-kpi.pcd-main { border-color: #2a78d6; background: #f3f8fe; }
  .pcd-lbl { font-size: 9px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #59738a; }
  .pcd-val { font-size: 30px; font-weight: 700; line-height: 1.1; color: #2f4a61; font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 8px; white-space: nowrap; }
  .pcd-main .pcd-val { color: #1f5fae; }
  .pcd-val small { font-size: 11px; font-weight: 700; }
  .pcd-hint { font-size: 10px; color: #59738a; }
  .pcd-chip { display: inline-block; font-size: 9px; font-weight: 700; border-radius: 999px; padding: 1px 7px; letter-spacing: .02em; }
  .pcd-good { background: #dcf3e8; color: #04603f; }
  .pcd-warn { background: #fdecc8; color: #7c3a06; }
  .pcd-neutral { background: #eef3f7; color: #475569; }
  .pcd-here { background: #fbe9d4; color: #8a3f06; }
  .pcd-row { display: grid; gap: 9px; min-height: 0; }
  .pcd-r2 { grid-template-columns: 1.42fr 1fr; flex: 1.12; }
  .pcd-r3 { grid-template-columns: 1fr 1.3fr; flex: 1; }
  .pcd-panel { border: 1px solid #c4d3df; border-radius: 4px; padding: 9px 12px 8px; display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
  .pcd-panel h3 { margin: 0; font-size: 12px; font-weight: 700; color: #1f2937; }
  .pcd-desc { margin: 1px 0 0; font-size: 9.5px; color: #59738a; }
  .pcd-panel svg { display: block; width: 100%; height: auto; margin-top: 4px; }
  .pcd-legend { margin: auto 0 0; padding-top: 4px; font-size: 9px; color: #59738a; display: flex; gap: 4px 12px; flex-wrap: wrap; }
  .pcd-legend i { display: inline-block; width: 10px; height: 8px; border-radius: 2px; vertical-align: -1px; margin-right: 4px; }
  .pcd-empty { margin: 10px 0 0; font-size: 10.5px; color: #59738a; }
  .pcd-grid { display: grid; margin-top: 6px; font-variant-numeric: tabular-nums; }
  .pcd-grid > div { display: grid; align-items: center; border-bottom: 1px solid #e6edf3; padding: 2px 0; font-size: 10.5px; }
  .pcd-grid > .pcd-th { font-size: 8.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #59738a; border-bottom-color: #c4d3df; padding: 0 0 4px; }
  .pcd-grid > div > span { padding: 0 6px; min-width: 0; }
  .pcd-rank > div { grid-template-columns: 30px minmax(0, 1.1fr) minmax(0, 1fr) 42px 66px; }
  .pcd-pos { text-align: center; font-weight: 700; color: #59738a; }
  .pcd-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pcd-num { text-align: right; font-weight: 700; }
  .pcd-wk { text-align: right; color: #59738a; white-space: nowrap; }
  .pcd-rank > .pcd-mine { background: #fdf3e7; }
  .pcd-mine .pcd-pos, .pcd-mine .pcd-name { color: #8a3f06; }
  .pcd-rank > .pcd-avg { border-bottom: 0; color: #59738a; font-style: italic; }
  .pcd-track { display: block; position: relative; height: 10px; background: #eef3f7; border-radius: 2px; }
  .pcd-track > b { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 2px; background: #a9c6ea; }
  .pcd-mine .pcd-track > b { background: #2a78d6; }
  .pcd-track > i { position: absolute; top: -3px; bottom: -3px; width: 0; border-left: 1.5px dashed #2f4a61; }
  .pcd-callout { margin-top: 6px; border-left: 3px solid #8ea4b7; background: #f5f8fb; padding: 4px 8px; font-size: 10px; line-height: 1.4; color: #1f2937; }
  .pcd-callout.pcd-alert { border-left-color: #be123c; background: #fdf0f3; color: #3b1520; }
  .pcd-pareto > div { grid-template-columns: minmax(0, 1fr) 44px minmax(0, 0.75fr) 62px; }
  .pcd-pareto .pcd-share { display: flex; align-items: center; gap: 6px; }
  .pcd-pareto .pcd-share .pcd-track { flex: 1; height: 7px; }
  .pcd-pareto .pcd-share em { width: 28px; text-align: right; font-style: normal; }
  .pcd-pareto > .pcd-rest { color: #59738a; }
  .pcd-wklist { display: grid; gap: 5px; margin-top: 8px; }
  .pcd-wkitem { display: grid; grid-template-columns: minmax(0, 1fr) 22px 62px; align-items: center; gap: 0 8px; font-size: 10.5px; }
  .pcd-wkitem .pcd-t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pcd-wkitem .pcd-cnt { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
  .pcd-wkitem .pcd-rk { font-size: 9px; color: #59738a; text-align: right; }
  .pcd-wkitem .pcd-bar { grid-column: 1 / -1; height: 6px; background: #eef3f7; border-radius: 2px; position: relative; }
  .pcd-wkitem .pcd-bar b { position: absolute; top: 0; bottom: 0; left: 0; background: #2a78d6; border-radius: 2px; }
  .pcd-foot { display: flex; justify-content: space-between; gap: 16px; font-size: 8.5px; color: #59738a; border-top: 1px solid #c4d3df; padding-top: 5px; }
  .pcd-foot span:last-child { white-space: nowrap; }
  @media print { .pcd-page { margin: 0; } }
`;

function Text({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.strong ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}

export function PrintDashboard({
  work,
  week,
  currentWeek,
  label,
  commitments,
  ranking,
  excluded,
}: {
  work: Work;
  week: string;
  currentWeek: string;
  label: (weekStart: string) => number;
  /** Todas as linhas da obra: o painel não segue o recorte de empreiteiros. */
  commitments: readonly WeeklyCommitment[];
  /** Ausente: a rota do ranking falhou ou passou do tempo. */
  ranking: ClosingRankingResponse | undefined;
  excluded: readonly string[];
}) {
  const d = closingDashboard(commitments, work, week, ranking);
  const n = label(week);
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

  return (
    <section className="pcd-page" aria-label={`Painel do fechamento da semana ${n}`}>
      <style>{STYLE}</style>
      <div className="pcd-head">
        <div className="pcd-band">
          <div>
            <span className="pcp-logos">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-atr.png" alt="ATR Incorporadora" />
              <span className="pcp-logos-sep" aria-hidden />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-takt.png" alt="Takt Engenharia" />
            </span>
          </div>
          <div className="pcd-title">PLANEJAMENTO DE CURTO PRAZO {work.name.toUpperCase()}</div>
          <div className="pcd-week">
            <span>
              Semana analisada: <span className="pcd-pill">{n}</span>
              <br />
              Semana atual: {label(currentWeek)}
            </span>
          </div>
        </div>
        <div className="pcd-sub">
          <span>
            <b>RESULTADOS DA SEMANA {n}</b> · {dayMonth(week)} a {formatDate(addDays(week, 5))} · Painel do fechamento
          </span>
        </div>
      </div>

      <p className="pcd-summary">
        <Text segments={closingSummary(d, label)} />
      </p>

      <Kpis d={d} label={label} />

      <div className="pcd-row pcd-r2">
        <div className="pcd-panel">
          <h3>PPC da semana e das anteriores</h3>
          <p className="pcd-desc">
            As {SERIES_WEEKS} semanas até a semana analisada. Cada barra é uma semana; a faixa âmbar é a semana deste relatório.
          </p>
          <Series d={d} label={label} />
        </div>
        <Ranking d={d} workId={work.id} week={week} />
      </div>

      <div className="pcd-row pcd-r3">
        <WeekCauses d={d} n={n} />
        <Pareto d={d} />
      </div>

      <div className="pcd-foot">
        <span>
          PPC = compromissos cumpridos ÷ compromissos assumidos. Semana com linha sem Status fica fora das médias e do ranking. Gerado em{' '}
          {generated}.
          {excluded.length > 0 &&
            ` O painel considera todos os empreiteiros; a planilha a seguir não inclui ${excluded.map(c => c || '(sem empreiteiro)').join(', ')}.`}
        </span>
        <span>Página 1 · a planilha de resultados segue nas próximas páginas</span>
      </div>
    </section>
  );
}

function Kpis({ d, label }: { d: ClosingDashboard; label: (weekStart: string) => number }) {
  const c = d.current;
  const comparable = d.average !== undefined && d.closedInSeries >= 2;
  const versusAverage = c && comparable ? Math.round(c.percent) - Math.round(d.average!) : undefined;
  const chip = !c
    ? undefined
    : c.pending > 0
      ? { text: `em aberto · ${c.pending} sem Status`, tone: 'pcd-warn' }
      : versusAverage === undefined
        ? undefined
        : versusAverage > 0
          ? { text: 'acima da média', tone: 'pcd-good' }
          : versusAverage < 0
            ? { text: 'abaixo da média', tone: 'pcd-neutral' }
            : { text: 'na média', tone: 'pcd-neutral' };
  const delta = c && d.previous ? Math.round(c.percent) - Math.round(d.previous.percent) : undefined;
  const low = d.average !== undefined && d.average < AVERAGE_ALERT;
  const first = d.series[0],
    last = d.series.at(-1);

  return (
    <div className="pcd-kpis">
      <div className="pcd-kpi pcd-main">
        <span className="pcd-lbl">PPC da semana {label(d.week)}</span>
        <span className="pcd-val">
          {c ? pct(c.percent) : '—'}
          {chip && <span className={`pcd-chip ${chip.tone}`}>{chip.text}</span>}
        </span>
        <span className="pcd-hint">
          {c ? `${c.fulfilled} de ${plural(c.planned, 'compromisso cumprido', 'compromissos cumpridos')}` : 'Semana sem compromissos'}
        </span>
      </div>
      <div className="pcd-kpi">
        <span className="pcd-lbl">
          {d.previous ? `Em relação à semana ${label(d.previous.weekStart)}` : 'Em relação à semana anterior'}
        </span>
        <span
          className="pcd-val"
          style={{ color: delta === undefined || delta === 0 ? undefined : delta > 0 ? STATUS.good : STATUS.danger }}
        >
          {delta === undefined ? (
            '—'
          ) : (
            <>
              {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {Math.abs(delta)} <small>p.p.</small>
            </>
          )}
        </span>
        <span className="pcd-hint">
          {d.previous
            ? `Semana ${label(d.previous.weekStart)}: ${pct(d.previous.percent)}${c?.pending ? ' · esta semana ainda em aberto' : ''}`
            : 'Nenhuma semana apurada antes desta'}
        </span>
      </div>
      <div className="pcd-kpi">
        <span className="pcd-lbl">Média das últimas {SERIES_WEEKS} semanas</span>
        <span className="pcd-val" style={{ color: low ? STATUS.warning : undefined }}>
          {d.average === undefined ? '—' : pct(d.average)}
        </span>
        <span className="pcd-hint">
          {first && last
            ? `Semanas ${label(first.weekStart)} a ${label(last.weekStart)}, ${
                d.closedInSeries === d.series.length ? 'todas apuradas' : plural(d.closedInSeries, 'apurada', 'apuradas')
              }${low ? ` · abaixo de ${AVERAGE_ALERT}%` : ''}`
            : 'Sem semanas na série'}
        </span>
      </div>
      <div className="pcd-kpi">
        <span className="pcd-lbl">PPC geral da obra</span>
        <span className="pcd-val">
          {d.overall.percent === undefined ? '—' : pct(d.overall.percent)}
          {d.ranking &&
            (d.position !== undefined && d.ranked >= 2 ? (
              <span className="pcd-chip pcd-here">
                {d.position}º de {d.ranked}
              </span>
            ) : d.position === undefined ? (
              <span className="pcd-chip pcd-neutral">em início</span>
            ) : null)}
        </span>
        <span className="pcd-hint">
          {!d.ranking
            ? 'Ranking das obras indisponível no momento'
            : d.mean !== undefined && d.ranked >= 2
              ? `Média das obras: ${pct(d.mean)}`
              : plural(d.overall.closedWeeks, 'semana apurada', 'semanas apuradas')}
        </span>
      </div>
    </div>
  );
}

/** A série da tela Fechamento no papel: barra cheia apurada, hachurada em aberto (fora da média),
 * faixa âmbar na semana analisada e o tracejado da média. Os valores ficam dentro das barras, para não
 * cruzar o tracejado; o da semana analisada vai em cima, em âmbar, quando há espaço livre. */
function Series({ d, label }: { d: ClosingDashboard; label: (weekStart: string) => number }) {
  if (!d.series.length) return <p className="pcd-empty">Nenhum compromisso registrado até esta semana.</p>;
  const W = 640,
    H = 205,
    TOP = 22,
    BOTTOM = 34,
    LEFT = 28,
    RIGHT = 54,
    PLOT = H - TOP - BOTTOM;
  const step = (W - LEFT - RIGHT) / d.series.length;
  const bar = Math.min(30, step * 0.58);
  const y = (percent: number) => TOP + PLOT * (1 - percent / 100);
  const open = d.series.some(point => point.pending > 0);
  const valueLabel = (point: WeekPpc, center: number, height: number, here: boolean, pending: boolean) => {
    const top = TOP + PLOT - height;
    const avg = d.average === undefined ? undefined : y(d.average);
    const clearAbove = avg === undefined || avg < top - 16 || avg > top - 2;
    if (here && clearAbove)
      return (
        <text x={center} y={top - 5} textAnchor="middle" fontSize={12} fontWeight={700} fill={CHART.today}>
          {Math.round(point.percent)}
        </text>
      );
    if (!pending && height >= 16)
      return (
        <text x={center} y={top + 13} textAnchor="middle" fontSize={10} fontWeight={700} fill={CHART.surface}>
          {Math.round(point.percent)}
        </text>
      );
    return (
      <text x={center} y={top - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={here ? CHART.today : CHART.ink}>
        {Math.round(point.percent)}
      </text>
    );
  };

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`PPC das semanas ${d.series.map(p => `${label(p.weekStart)}: ${Math.round(p.percent)}%`).join(', ')}`}
      >
        <defs>
          <pattern id="pcd-aberta" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={7} height={7} fill={CHART.planned} />
            <line x1={0} y1={0} x2={0} y2={7} stroke={CHART.surface} strokeWidth={3} />
          </pattern>
        </defs>
        {[0, 50, 100].map(mark => (
          <g key={mark}>
            <line x1={LEFT} y1={y(mark)} x2={W - RIGHT} y2={y(mark)} stroke={CHART.grid} strokeWidth={1} />
            <text x={LEFT - 6} y={y(mark) + 3} textAnchor="end" fontSize={10} fill={CHART.inkFaint}>
              {mark}
            </text>
          </g>
        ))}
        {d.series.map((point, index) =>
          point.weekStart === d.week ? (
            <rect
              key={`aqui-${point.weekStart}`}
              x={LEFT + step * index + 2}
              y={TOP - 14}
              width={step - 4}
              height={PLOT + 44}
              rx={4}
              fill={CHART.today}
              opacity={0.12}
            />
          ) : null,
        )}
        {d.average !== undefined && (
          <>
            <line
              x1={LEFT}
              y1={y(d.average)}
              x2={W - RIGHT}
              y2={y(d.average)}
              stroke={CHART.inkMuted}
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text x={W - RIGHT + 6} y={y(d.average) - 3} fontSize={10} fontWeight={700} fill={CHART.inkMuted}>
              média
            </text>
            <text x={W - RIGHT + 6} y={y(d.average) + 10} fontSize={10} fontWeight={700} fill={CHART.inkMuted}>
              {pct(d.average)}
            </text>
          </>
        )}
        {d.series.map((point, index) => {
          const center = LEFT + step * (index + 0.5);
          const height = Math.max(2, (PLOT * point.percent) / 100);
          const here = point.weekStart === d.week,
            pending = point.pending > 0;
          return (
            <g key={point.weekStart}>
              <rect
                x={center - bar / 2}
                y={TOP + PLOT - height}
                width={bar}
                height={height}
                rx={2}
                fill={pending ? 'url(#pcd-aberta)' : CHART.planned}
                opacity={pending ? 0.75 : 1}
              />
              {valueLabel(point, center, height, here, pending)}
              <text
                x={center}
                y={H - BOTTOM + 14}
                textAnchor="middle"
                fontSize={10}
                fontWeight={here ? 700 : 600}
                fill={here ? CHART.today : CHART.inkMuted}
              >
                S{label(point.weekStart)}
              </text>
              <text x={center} y={H - BOTTOM + 26} textAnchor="middle" fontSize={9.5} fill={CHART.inkFaint}>
                {dayMonth(point.weekStart)}
              </text>
            </g>
          );
        })}
        <line x1={LEFT} y1={TOP + PLOT} x2={W - RIGHT} y2={TOP + PLOT} stroke={CHART.gridStrong} strokeWidth={1} />
      </svg>
      <p className="pcd-legend">
        <span>
          <i style={{ background: CHART.planned }} />
          Semana apurada
        </span>
        {open && (
          <span>
            <i style={{ background: CHART.planned, opacity: 0.45 }} />
            Semana em aberto, fora da média
          </span>
        )}
        <span>
          <i style={{ background: '#fbe9d4', border: `1px solid ${CHART.today}` }} />
          Semana analisada
        </span>
        <span>- - - Média das semanas apuradas</span>
      </p>
    </>
  );
}

function Ranking({ d, workId, week }: { d: ClosingDashboard; workId: string; week: string }) {
  const weekCell = (entry: RankingEntry) => (!entry.week ? '—' : entry.week.pending > 0 ? 'aberta' : pct(entry.week.percent));
  const closedWeeks = (d.ranking ?? []).flatMap(entry => (entry.week && entry.week.pending === 0 ? [entry.week.percent] : []));
  const weekMean = closedWeeks.length ? closedWeeks.reduce((sum, value) => sum + value, 0) / closedWeeks.length : undefined;
  const { rows, hidden } = visibleRanking(d.ranking ?? [], workId, RANKING_ROWS);
  const starting = rows.some(entry => entry.position === undefined);
  const mean = d.mean;

  return (
    <div className="pcd-panel">
      <h3>Ranking das obras · PPC geral</h3>
      <p className="pcd-desc">
        Todas as semanas apuradas de cada obra, até a semana analisada. A última coluna é o PPC da mesma semana do calendário.
      </p>
      {!d.ranking ? (
        <p className="pcd-empty">Ranking das obras indisponível no momento. O PDF saiu sem a comparação; gere de novo em instantes.</p>
      ) : (
        <>
          <div className="pcd-grid pcd-rank">
            <div className="pcd-th">
              <span className="pcd-pos">#</span>
              <span>Obra</span>
              <span>PPC geral</span>
              <span />
              <span className="pcd-wk">
                {dayMonth(week)}–{dayMonth(addDays(week, 5))}
              </span>
            </div>
            {rows.map(entry => {
              const mine = entry.workId === workId;
              return (
                <div key={entry.workId} className={mine ? 'pcd-mine' : undefined}>
                  <span className="pcd-pos">{entry.position === undefined ? '—' : `${entry.position}º`}</span>
                  <span className="pcd-name">
                    {entry.name}
                    {mine && <span className="pcd-chip pcd-here"> esta obra</span>}
                    {entry.position === undefined && <span className="pcd-chip pcd-neutral"> em início</span>}
                  </span>
                  <span>
                    <span className="pcd-track">
                      {entry.overall.percent !== undefined && <b style={{ width: `${entry.overall.percent}%` }} />}
                      {mean !== undefined && <i style={{ left: `${mean}%` }} />}
                    </span>
                  </span>
                  <span className="pcd-num">{entry.overall.percent === undefined ? '—' : pct(entry.overall.percent)}</span>
                  <span className="pcd-wk">{weekCell(entry)}</span>
                </div>
              );
            })}
            <div className="pcd-avg">
              <span />
              <span className="pcd-name">Média das obras</span>
              <span />
              <span className="pcd-num">{mean === undefined ? '—' : pct(mean)}</span>
              <span className="pcd-wk">{weekMean === undefined ? '—' : pct(weekMean)}</span>
            </div>
          </div>
          <p className="pcd-legend">
            <span>Tracejado: média das obras</span>
            <span>Linha destacada: esta obra</span>
            {starting && <span>Em início: menos de 4 semanas apuradas, sem posição</span>}
            {hidden > 0 && <span>Mais {plural(hidden, 'obra fora da lista', 'obras fora da lista')}, contadas na média</span>}
          </p>
        </>
      )}
    </div>
  );
}

function WeekCauses({ d, n }: { d: ClosingDashboard; n: number }) {
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
    <div className="pcd-panel">
      <h3>Causas na semana {n}</h3>
      <p className="pcd-desc">
        {d.failures
          ? `${plural(d.failures, 'compromisso não cumprido', 'compromissos não cumpridos')}. À direita, a posição da causa no Pareto da obra.`
          : 'Nenhum compromisso não cumprido.'}
      </p>
      {rows.length > 0 && (
        <div className="pcd-wklist">
          {rows.map(item => (
            <div key={item.cause} className="pcd-wkitem">
              <span className="pcd-t">{item.cause}</span>
              <span className="pcd-cnt">{item.total}</span>
              <span className="pcd-rk">{rankOf(item.cause)}ª na obra</span>
              <span className="pcd-bar">
                <b style={{ width: `${(item.total / peak) * 100}%` }} />
              </span>
            </div>
          ))}
          {rest && (
            <div className="pcd-wkitem">
              <span className="pcd-t">
                Outras {rest.causes} causas ({plural(rest.total, 'falha', 'falhas')})
              </span>
            </div>
          )}
        </div>
      )}
      <p className="pcd-legend">{note}</p>
    </div>
  );
}

function Pareto({ d }: { d: ClosingDashboard }) {
  const tally = d.pareto;
  const vital = vitalCauses(tally);
  const concentrated = tally.length > 1 && vital < tally.length;
  const { rows, rest } = topCauses(tally, PARETO_CAUSES);

  return (
    <div className="pcd-panel">
      <h3>Principais causas na obra · Pareto</h3>
      <p className="pcd-desc">Só entram as linhas com Status Não e causa apontada, desde o início da obra até a semana analisada.</p>
      {!tally.length ? (
        <p className="pcd-empty">Nenhuma falha apurada ainda. O Pareto se forma quando as linhas não cumpridas recebem a causa.</p>
      ) : (
        <>
          <div className={`pcd-callout${concentrated ? ' pcd-alert' : ''}`}>
            <Text segments={paretoCallout(tally)} />
          </div>
          <div className="pcd-grid pcd-pareto">
            <div className="pcd-th">
              <span>Causa</span>
              <span className="pcd-num">Falhas</span>
              <span>Participação</span>
              <span className="pcd-num">Acumulado</span>
            </div>
            {rows.map((item, index) => (
              <div key={item.cause}>
                <span>{item.cause}</span>
                <span className="pcd-num" style={{ fontWeight: 400 }}>
                  {item.total}
                </span>
                <span className="pcd-share">
                  <span className="pcd-track">
                    <b
                      style={{
                        width: `${Math.max(2, Math.round(item.share))}%`,
                        background: concentrated && index < vital ? CHART.late : CHART.planned,
                      }}
                    />
                  </span>
                  <em>{pct(item.share)}</em>
                </span>
                <span className="pcd-num">{pct(item.accumulated)}</span>
              </div>
            ))}
            {rest && (
              <div className="pcd-rest">
                <span>Outras {rest.causes} causas</span>
                <span className="pcd-num" style={{ fontWeight: 400 }}>
                  {rest.total}
                </span>
                <span className="pcd-share">
                  <span className="pcd-track">
                    <b style={{ width: `${Math.max(2, Math.round(rest.share))}%`, background: CHART.gridStrong }} />
                  </span>
                  <em>{pct(rest.share)}</em>
                </span>
                <span className="pcd-num">100%</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

'use client';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';
import { formatDate } from '@/shared/format';
import { Legend } from '../charts';
import { DASHBOARD_MODULES, monthShort, pct, plural, signedDays, signedPoints, type DashboardModule, type Tone } from '../model';
import type { BucketPpc } from '../period-views';
import type {
  PortfolioCellStatus,
  PortfolioCompanies,
  PortfolioData,
  PortfolioHeat,
  PortfolioPareto,
  PortfolioReady,
  PortfolioResponsibles,
  PortfolioRow,
  PortfolioWork,
} from './types';

/** Gráficos e tabela do Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"), nas
 * duas saídas: `screen` dentro dos quadros da tela, `paper` nos painéis do PDF. Regras do modelo que moram aqui:
 * - Regra 10: o comparativo, uma linha por obra, com cor e texto em cada célula, "—" com o motivo, o
 *   consolidado na última linha e os títulos que ordenam;
 * - Regra 11: barras do PPC do período por obra com a linha tracejada dos 70% e a do consolidado (obra "em
 *   início" no fim, hachurada, sem posição), mapa de calor obra × balde com a última linha "Todas", Pareto das
 *   causas somando as obras e empreiteiros em mais de uma obra. Faixas do PPC: 80% ou mais em verde, abaixo de
 *   70% em âmbar, abaixo de 60% em vermelho;
 * - Regra 12: medido × planejado, vagões por status, tarefas por situação, abertas × resolvidas e responsáveis
 *   terceiros (faixas do físico: atrás do planejado em âmbar, mais de 10 p.p. em vermelho).
 * Tudo só lê `PortfolioData`; nenhum cálculo de indicador acontece aqui além de ordenar e escalar barras. */

export type ChartVariant = 'screen' | 'paper';

// ─── Faixas e rótulos ──────────────────────────────────────────────────────────────────────────────────

export const ppcTone = (percent: number | undefined): Tone => {
  if (percent === undefined) return 'neutral';
  const value = Math.round(percent);
  return value >= 80 ? 'good' : value < 60 ? 'bad' : value < 70 ? 'warn' : 'neutral';
};
/** Desvio do físico em p.p., pelo valor arredondado que a tela mostra. */
export const deviationTone = (delta: number): Tone => {
  const value = Math.round(delta);
  return value >= 0 ? 'good' : value >= -10 ? 'warn' : 'bad';
};
const INK: Record<Tone, string> = { good: '#047857', warn: '#b45309', bad: '#be123c', neutral: '#1b3348', here: '#8a3f06' };
const toneText = (tone: Tone) => (tone === 'good' ? 't-good' : tone === 'warn' ? 't-warn' : tone === 'bad' ? 't-bad' : '');
const int = (value: number) => Math.round(value).toLocaleString('pt-BR');
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
const dm = (date: string) => formatDate(date).slice(0, 5);

/** "—" com o motivo ao passar o mouse e, para leitor de tela, no próprio texto. */
function Dash({ reason }: { reason: string }) {
  return (
    <span className="t-mut" title={reason}>
      —<span className="sr-only"> ({reason})</span>
    </span>
  );
}
const statusReason = (status: PortfolioCellStatus | undefined, fallback: string) =>
  status?.kind === 'absent'
    ? status.reason
    : status?.kind === 'error'
      ? `Indisponível: ${status.message}`
      : status?.kind === 'loading'
        ? 'Carregando…'
        : fallback;

function Arrow({ delta, title }: { delta: number; title?: string }) {
  const value = Math.round(delta);
  return (
    <span className={`v ${value > 0 ? 't-good' : value < 0 ? 't-bad' : 't-mut'}`} title={title}>
      {value > 0 ? '▲' : value < 0 ? '▼' : '='} {Math.abs(value)} p.p.
    </span>
  );
}

// ─── Estado de cada quadro ─────────────────────────────────────────────────────────────────────────────

/** O dado de cada módulo numa linha do comparativo. */
export const MODULE_FIELD: Record<DashboardModule, (row: PortfolioRow) => unknown> = {
  'longo-prazo': row => row.longTerm,
  vagoes: row => row.wagons,
  'medio-prazo': row => row.medium,
  'curto-prazo': row => row.short,
  terminalidade: row => row.terminality,
};
/** "Sem <dado>: obras…", embaixo de cada quadro. */
export const NO_DATA_LABEL: Record<DashboardModule, string> = {
  'longo-prazo': 'plano de longo prazo',
  vagoes: 'vagões',
  'medio-prazo': 'plano de médio prazo',
  'curto-prazo': 'linhas no curto prazo',
  terminalidade: 'pendências de terminalidade',
};

export type ModuleBoard = { kind: 'hidden' } | { kind: 'loading' } | { kind: 'unavailable'; message: string } | { kind: 'ready' };

/** O quadro de um módulo aparece? Some se a pessoa não pode abrir o módulo, se o desmarcou ou se nenhuma obra
 * tem dado dele; mostra "Carregando…" enquanto a leitura não chega e "Quadro indisponível" quando ela falha em
 * todas as obras (rota fora do ar). */
export function moduleBoard(state: PortfolioReady, chosen: ReadonlySet<DashboardModule> | undefined, module: DashboardModule): ModuleBoard {
  if (!state.access[module] || (chosen && !chosen.has(module))) return { kind: 'hidden' };
  if (state.loading.includes(module)) return { kind: 'loading' };
  const rows = state.data.rows;
  // Falha em parte das obras não esconde as outras: o quadro aparece e a nota embaixo cita onde falhou.
  if (rows.some(row => MODULE_FIELD[module](row) !== undefined)) return { kind: 'ready' };
  const failure = state.unavailable.find(item => item.module === module);
  if (failure) return { kind: 'unavailable', message: failure.message };
  if (rows.some(row => row.status[module]?.kind === 'loading')) return { kind: 'loading' };
  const error = rows.map(row => row.status[module]).find(status => status?.kind === 'error');
  if (error?.kind === 'error') return { kind: 'unavailable', message: error.message };
  return { kind: 'hidden' };
}

/** Há o que dizer embaixo do quadro: obra sem dado do módulo ou com a leitura falhada. */
export const hasNoDataNote = (module: DashboardModule, data: PortfolioData) =>
  (data.noData[module]?.length ?? 0) > 0 || data.rows.some(row => row.status[module]?.kind === 'error');

/** As obras sem dado do módulo (o motivo vem do cálculo) e as obras em que a leitura falhou. */
export function NoDataNote({ module, data }: { module: DashboardModule; data: PortfolioData }) {
  const errors = data.rows.flatMap(row => {
    const status = row.status[module];
    return status?.kind === 'error' ? [{ work: row.work, message: status.message }] : [];
  });
  const failed = new Set(errors.map(item => item.work.id));
  const missing = (data.noData[module] ?? []).filter(work => !failed.has(work.id));
  return (
    <>
      {missing.length > 0 && (
        <p className="pf-nodata">
          Sem {NO_DATA_LABEL[module]}: {missing.map(work => work.name).join(', ')}.
        </p>
      )}
      {errors.length > 0 && (
        <p className="pf-nodata">Indisponível em {errors.map(item => `${item.work.name} (${item.message})`).join(', ')}.</p>
      )}
    </>
  );
}

// ─── Comparativo das obras (regra 10) ──────────────────────────────────────────────────────────────────

export type ColumnKey = 'obra' | 'state' | 'ppc' | 'delta' | 'overall' | 'lp' | 'dev' | 'takt' | 'rv' | 'late' | 'stock' | 'flow' | 'days';
export interface ComparisonSort {
  column: ColumnKey;
  dir: 1 | -1;
}
/** Padrão: o PPC do período, do maior para o menor. */
export const DEFAULT_SORT: ComparisonSort = { column: 'ppc', dir: -1 };

interface CellContext {
  /** "31/10": o sábado final, data dos retratos. */
  end: string;
}
interface Column {
  key: ColumnKey;
  group: string;
  label: string;
  module?: DashboardModule;
  /** Valor para ordenar; ausente = sem dado, vai para o fim nos dois sentidos. */
  sortValue: (row: PortfolioRow) => number | string | undefined;
  /** Faixa antes do valor, nos dois sentidos: no PPC, a obra "em início" vem depois das que têm posição. */
  tier?: (row: PortfolioRow) => number;
  cell: (row: PortfolioRow, ctx: CellContext) => ReactNode;
  total: (data: PortfolioData, ctx: CellContext) => ReactNode;
}

const STATE_RANK: Record<Tone, number> = { neutral: 0, here: 0, good: 1, warn: 2, bad: 3 };
const STATE_ICON: Record<Tone, string> = { good: '✓', warn: '▲', bad: '!', neutral: '●', here: '●' };

const COLUMNS: Column[] = [
  {
    key: 'obra',
    group: '',
    label: 'Obra',
    sortValue: row => row.work.name,
    cell: () => null, // desenhada à parte: na tela é o link para a aba 0
    total: data => (
      <span className="ob">
        <b>Consolidado</b>
        <small>{plural(data.totals.works, 'obra', 'obras')}</small>
      </span>
    ),
  },
  {
    key: 'state',
    group: '',
    label: 'Estado',
    sortValue: row => STATE_RANK[row.state],
    cell: row => (
      <span className={`pf-state ${row.state}`}>
        <span aria-hidden>{STATE_ICON[row.state]}</span> {row.stateLabel}
      </span>
    ),
    total: data => {
      const bad = data.rows.filter(row => row.state === 'bad').length;
      const warn = data.rows.filter(row => row.state === 'warn').length;
      return (
        <span className="t-mut" style={{ fontWeight: 600 }}>
          {bad} crít. · {warn} atenção
        </span>
      );
    },
  },
  {
    key: 'ppc',
    group: 'Curto prazo',
    label: 'PPC do período',
    module: 'curto-prazo',
    sortValue: row => row.short?.current.percent,
    tier: row => (row.short?.early ? 1 : 0),
    cell: row => {
      const short = row.short;
      if (!short) return <Dash reason={statusReason(row.status['curto-prazo'], 'Sem linha no curto prazo no período.')} />;
      const current = short.current;
      if (current.percent === undefined)
        return (
          <Dash
            reason={current.openWeeks > 0 ? 'Semana em aberto: nenhuma semana apurada no período.' : 'Sem linha no curto prazo no período.'}
          />
        );
      return (
        <>
          <span
            className={`v ${toneText(ppcTone(current.percent))}`}
            title={`${int(current.fulfilled)} de ${int(current.planned)} compromissos\n${plural(current.closedWeeks, 'semana apurada', 'semanas apuradas')}${
              current.openWeeks ? ` · ${current.openWeeks} em aberto` : ''
            }`}
          >
            {pct(current.percent)}
          </span>
          {Math.round(current.percent) < 70 && <span className="s t-warn">abaixo de 70%</span>}
        </>
      );
    },
    total: data => {
      const short = data.totals.short;
      if (short.percent === undefined) return '—';
      return (
        <>
          <span className="v">{pct(short.percent)}</span>
          <span className="s t-mut">
            {int(short.fulfilled)} de {int(short.planned)}
          </span>
        </>
      );
    },
  },
  {
    key: 'delta',
    group: 'Curto prazo',
    label: 'vs anterior',
    module: 'curto-prazo',
    sortValue: row => row.short?.delta,
    cell: row =>
      row.short?.delta === undefined ? (
        <Dash reason="Sem PPC no período anterior para comparar." />
      ) : (
        <Arrow
          delta={row.short.delta}
          title={row.short.previous?.percent !== undefined ? `${row.short.previous.label}: ${pct(row.short.previous.percent)}` : undefined}
        />
      ),
    total: data => (data.totals.short.delta === undefined ? '—' : <Arrow delta={data.totals.short.delta} />),
  },
  {
    key: 'overall',
    group: 'Curto prazo',
    label: 'PPC geral',
    module: 'curto-prazo',
    sortValue: row => row.short?.overall.percent,
    cell: (row, ctx) => {
      const short = row.short;
      if (short?.overall.percent === undefined)
        return <Dash reason={short ? 'Nenhuma semana apurada.' : statusReason(row.status['curto-prazo'], 'Sem linha no curto prazo.')} />;
      return (
        <>
          <span title={`Desde a primeira semana até ${ctx.end}: ${int(short.overall.fulfilled)} de ${int(short.overall.planned)}`}>
            {pct(short.overall.percent)}
          </span>
          {short.early && <span className="s t-mut">em início</span>}
        </>
      );
    },
    total: data => (data.totals.short.overallPercent === undefined ? '—' : pct(data.totals.short.overallPercent)),
  },
  {
    key: 'lp',
    group: 'Longo prazo',
    label: 'Medido × plan.',
    module: 'longo-prazo',
    sortValue: row => row.longTerm?.measured,
    cell: (row, ctx) => {
      const lt = row.longTerm;
      if (!lt) return <Dash reason={statusReason(row.status['longo-prazo'], 'Sem plano de longo prazo nesta obra.')} />;
      if (lt.measured === undefined) return <Dash reason={`Sem medição até ${ctx.end}; planejado ${pct(lt.planned)}.`} />;
      return (
        <span
          title={`${lt.lastMeasurement ? `Medição de ${formatDate(lt.lastMeasurement)}\n` : ''}Planejado em ${ctx.end} ${
            lt.plannedSource === 'baseline' ? 'pela linha de base' : 'pelo plano vivo, sem linha de base'
          }`}
        >
          {pct(lt.measured)} × {pct(lt.planned)}
        </span>
      );
    },
    total: data =>
      data.totals.longTerm.withMeasurement ? `${data.totals.longTerm.behind} de ${data.totals.longTerm.withMeasurement} atrás` : '—',
  },
  {
    key: 'dev',
    group: 'Longo prazo',
    label: 'Desvio',
    module: 'longo-prazo',
    sortValue: row => row.longTerm?.delta,
    cell: row => {
      const lt = row.longTerm;
      if (lt?.delta === undefined)
        return (
          <Dash
            reason={!lt ? statusReason(row.status['longo-prazo'], 'Sem plano de longo prazo nesta obra.') : 'Sem medição até a data.'}
          />
        );
      return <span className={`dsh-tag ${deviationTone(lt.delta)}`}>{signedPoints(lt.delta)}</span>;
    },
    total: data =>
      data.totals.longTerm.worst ? (
        <span className="t-mut" style={{ fontWeight: 600 }} title={data.totals.longTerm.worst.work.name}>
          pior: {data.totals.longTerm.worst.work.code}
        </span>
      ) : (
        ''
      ),
  },
  {
    key: 'takt',
    group: 'Vagões',
    label: 'Takt vencido',
    module: 'vagoes',
    sortValue: row => row.wagons?.taktOverdue,
    cell: (row, ctx) =>
      !row.wagons ? (
        <Dash reason={statusReason(row.status.vagoes, 'A obra não usa vagões.')} />
      ) : (
        <>
          <span className={`v ${row.wagons.taktOverdue ? 't-warn' : 't-good'}`}>{row.wagons.taktOverdue}</span>
          <span className="s t-mut">em {ctx.end}</span>
        </>
      ),
    total: data => (data.totals.wagons.works ? String(data.totals.wagons.taktOverdue) : '—'),
  },
  {
    key: 'rv',
    group: 'Vagões',
    label: 'Restr. vencidas',
    module: 'vagoes',
    sortValue: row => row.wagons?.restrictionsOverdue,
    cell: (row, ctx) =>
      !row.wagons ? (
        <Dash reason={statusReason(row.status.vagoes, 'A obra não usa vagões.')} />
      ) : (
        <>
          <span className={`v ${row.wagons.restrictionsOverdue ? 't-bad' : 't-good'}`}>{row.wagons.restrictionsOverdue}</span>
          <span className="s t-mut">em {ctx.end}</span>
        </>
      ),
    total: data => (data.totals.wagons.works ? String(data.totals.wagons.restrictionsOverdue) : '—'),
  },
  {
    key: 'late',
    group: 'Médio prazo',
    label: 'Atrasadas',
    module: 'medio-prazo',
    sortValue: row => row.medium?.late,
    cell: row =>
      !row.medium ? (
        <Dash reason={statusReason(row.status['medio-prazo'], 'Sem plano de médio prazo nesta obra.')} />
      ) : (
        <>
          <span className={`v ${row.medium.late ? 't-warn' : 't-good'}`} title={row.medium.planName}>
            {row.medium.late}
          </span>
          <span className="s t-mut">plano de {monthShort(row.medium.planMonth)}</span>
        </>
      ),
    total: data => (data.totals.medium.works ? String(data.totals.medium.late) : '—'),
  },
  {
    key: 'stock',
    group: 'Terminalidade',
    label: 'Em aberto',
    module: 'terminalidade',
    sortValue: row => row.terminality?.open,
    cell: (row, ctx) => {
      const t = row.terminality;
      if (!t) return <Dash reason={statusReason(row.status.terminalidade, 'Sem pendências de terminalidade nesta obra.')} />;
      const diff = t.open - t.openAtStart;
      return (
        <>
          <span className="v" title={`Em aberto em ${ctx.end}; ${t.openAtStart} na véspera do período`}>
            {int(t.open)}
          </span>
          <span className={`s ${diff > 0 ? 't-bad' : 't-good'}`}>{signedDays(diff)} no período</span>
        </>
      );
    },
    total: data => {
      const t = data.totals.terminality;
      if (!t.works) return '—';
      const diff = t.open - t.openAtStart;
      return (
        <>
          {int(t.open)}
          <span className={`s ${diff > 0 ? 't-bad' : 't-good'}`}>{signedDays(diff)} no período</span>
        </>
      );
    },
  },
  {
    key: 'flow',
    group: 'Terminalidade',
    label: 'Abertas / resolv.',
    module: 'terminalidade',
    sortValue: row => (row.terminality ? row.terminality.resolved - row.terminality.opened : undefined),
    cell: row => {
      const t = row.terminality;
      if (!t) return <Dash reason={statusReason(row.status.terminalidade, 'Sem pendências de terminalidade nesta obra.')} />;
      return (
        <span title={`${t.opened} abertas e ${t.resolved} resolvidas no período\n${t.percentLabel} resolvidas desde a primeira`}>
          {t.opened} / {t.resolved}
        </span>
      );
    },
    total: data => (data.totals.terminality.works ? `${data.totals.terminality.opened} / ${data.totals.terminality.resolved}` : '—'),
  },
  {
    key: 'days',
    group: 'Terminalidade',
    label: 'Tempo médio',
    module: 'terminalidade',
    sortValue: row => row.terminality?.averageDaysToResolve,
    cell: row => {
      const t = row.terminality;
      if (!t) return <Dash reason={statusReason(row.status.terminalidade, 'Sem pendências de terminalidade nesta obra.')} />;
      if (t.averageDaysToResolve === undefined) return <Dash reason="Nenhuma pendência resolvida no período." />;
      return plural(Math.round(t.averageDaysToResolve), 'dia', 'dias');
    },
    total: data =>
      data.totals.terminality.averageDaysToResolve === undefined
        ? '—'
        : plural(Math.round(data.totals.terminality.averageDaysToResolve), 'dia', 'dias'),
  },
];

/** Ordena as linhas pela coluna escolhida; sem dado vai para o fim nos dois sentidos, empate pelo nome. No PPC do
 * período, a obra "em início" fica depois das que têm posição (regra 11), também nos dois sentidos. */
export function sortRows(rows: readonly PortfolioRow[], sort: ComparisonSort): PortfolioRow[] {
  const column = COLUMNS.find(c => c.key === sort.column) ?? COLUMNS.find(c => c.key === DEFAULT_SORT.column)!;
  const byName = (a: PortfolioRow, b: PortfolioRow) => a.work.name.localeCompare(b.work.name, 'pt-BR');
  return [...rows].sort((a, b) => {
    const x = column.sortValue(a);
    const y = column.sortValue(b);
    if (x === undefined || y === undefined) return x === y ? byName(a, b) : x === undefined ? 1 : -1;
    const tier = column.tier ? column.tier(a) - column.tier(b) : 0;
    if (tier) return tier;
    const diff = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
    return diff * sort.dir || byName(a, b);
  });
}

export function ComparisonTable({
  data,
  modules,
  variant,
  sort = DEFAULT_SORT,
  onSort,
  hrefOf,
  onOpen,
}: {
  data: PortfolioData;
  /** Os módulos com coluna: acessíveis, marcados e com dado em alguma obra. */
  modules: ReadonlySet<DashboardModule>;
  variant: ChartVariant;
  sort?: ComparisonSort;
  onSort?: (sort: ComparisonSort) => void;
  /** Tela: o link da obra para a aba 0 no mesmo período. */
  hrefOf?: (row: PortfolioRow) => string;
  onOpen?: (row: PortfolioRow) => void;
}) {
  const screen = variant === 'screen';
  const columns = COLUMNS.filter(column => !column.module || modules.has(column.module));
  const ctx: CellContext = { end: dm(data.period.end) };
  const rows = sortRows(data.rows, sort);
  const choose = (key: ColumnKey) =>
    onSort?.(sort.column === key ? { column: key, dir: sort.dir === 1 ? -1 : 1 } : { column: key, dir: key === 'obra' ? 1 : -1 });
  return (
    <table className="pf-cmp">
      <thead>
        <tr>
          {columns.map(column => {
            const sorted = sort.column === column.key;
            return (
              <th
                key={column.key}
                scope="col"
                aria-sort={screen && onSort ? (sorted ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none') : undefined}
              >
                <span className="grp">{column.group || ' '}</span>
                {screen && onSort ? (
                  <button type="button" onClick={() => choose(column.key)} title={`Ordenar por ${column.label.toLowerCase()}`}>
                    {column.label}
                    <span className="ar" aria-hidden>
                      {sorted ? (sort.dir === 1 ? '↑' : '↓') : ''}
                    </span>
                  </button>
                ) : (
                  column.label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const href = screen ? hrefOf?.(row) : undefined;
          return (
            <tr
              key={row.work.id}
              className={screen && onOpen ? 'link' : undefined}
              title={screen && onOpen ? `Abrir a aba 0 de ${row.work.name} em ${data.period.label}` : undefined}
              onClick={
                screen && onOpen
                  ? event => {
                      // O link do nome e os botões cuidam do próprio clique.
                      if ((event.target as Element).closest('a, button')) return;
                      onOpen(row);
                    }
                  : undefined
              }
            >
              {columns.map(column => (
                <td key={column.key}>
                  {column.key === 'obra' ? (
                    <span className="ob">
                      {href ? <Link href={href}>{row.work.name}</Link> : <b>{row.work.name}</b>}
                      <small>
                        {row.work.code}
                        {row.short?.early ? ' · em início' : ''}
                      </small>
                    </span>
                  ) : (
                    column.cell(row, ctx)
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="total">
          {columns.map(column => (
            <td key={column.key}>{column.total(data, ctx)}</td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

/** Os módulos que ganham coluna no comparativo, na ordem das abas. */
export const comparisonModules = (boards: Record<DashboardModule, ModuleBoard>) =>
  new Set(DASHBOARD_MODULES.filter(m => boards[m.id].kind === 'ready').map(m => m.id));

// ─── PPC do período por obra (regra 11) ────────────────────────────────────────────────────────────────

const BAR = '#2a78d6';
const HATCH_LINE = '#c4d3df';

export function PpcByWorkBars({
  rows,
  consolidated,
  variant,
}: {
  rows: readonly PortfolioRow[];
  consolidated?: number;
  variant: ChartVariant;
}) {
  const patternId = useId();
  const withPpc = rows.filter(row => row.short?.current.percent !== undefined);
  const value = (row: PortfolioRow) => row.short!.current.percent!;
  const ranked = withPpc
    .filter(row => !row.short!.early)
    .sort((a, b) => value(b) - value(a) || a.work.name.localeCompare(b.work.name, 'pt-BR'));
  const early = withPpc.filter(row => row.short!.early);
  const list = [...ranked, ...early];
  if (!list.length) return <p className="dsh-empty">Nenhuma semana apurada no período.</p>;
  const compact = variant === 'paper';
  const W = compact ? 300 : 560,
    LEFT = compact ? 64 : 156,
    RIGHT = compact ? 52 : 74,
    TOP = 20,
    ROW = compact ? 30 : 28;
  const H = TOP + list.length * ROW + 40;
  const x = (percent: number) => LEFT + ((W - LEFT - RIGHT) * clampPercent(percent)) / 100;
  const bottom = TOP + list.length * ROW;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`PPC do período por obra: ${list.map(row => `${row.work.name} ${pct(value(row))}${row.short!.early ? ' (em início)' : ''}`).join(', ')}${
        consolidated === undefined ? '' : `; consolidado ${pct(consolidated)}`
      }`}
    >
      <defs>
        <pattern id={patternId} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={6} height={6} fill="#fff" />
          <line x1={0} y1={0} x2={0} y2={6} stroke={HATCH_LINE} strokeWidth={3} />
        </pattern>
      </defs>
      {[0, 25, 50, 75, 100].map(mark => (
        <g key={mark}>
          <line x1={x(mark)} x2={x(mark)} y1={TOP - 4} y2={bottom} stroke="#ebf1f6" />
          <text x={x(mark)} y={12} fontSize={9.5} fill="#8ea4b7" textAnchor="middle">
            {mark}%
          </text>
        </g>
      ))}
      {list.map((row, index) => {
        const short = row.short!;
        const percent = value(row);
        const y = TOP + index * ROW;
        const rank = short.early ? '' : `${short.position ?? index + 1}º `;
        return (
          <g key={row.work.id}>
            <title>
              {`${row.work.name}: ${pct(percent)}\n${int(short.current.fulfilled)} de ${int(short.current.planned)} compromissos · ${plural(
                short.current.closedWeeks,
                'semana apurada',
                'semanas apuradas',
              )}${short.early ? '\nEm início: menos de 4 semanas apuradas na obra' : ''}`}
            </title>
            <rect x={0} y={y} width={W} height={ROW} fill="transparent" />
            {compact ? (
              <>
                <text x={0} y={y + 13} fontSize={11.5} fontWeight={700} fill="#1b3348">
                  {rank}
                  {row.work.code || row.work.name.slice(0, 6)}
                </text>
                {short.early && (
                  <text x={0} y={y + 24} fontSize={9.5} fill="#59738a">
                    em início
                  </text>
                )}
              </>
            ) : (
              <>
                <text x={0} y={y + 13} fontSize={11.5} fontWeight={700} fill="#1b3348">
                  {rank}
                  {row.work.name.length > 22 ? `${row.work.name.slice(0, 21)}…` : row.work.name}
                </text>
                <text x={0} y={y + 24} fontSize={9.5} fill="#59738a">
                  {row.work.code}
                  {short.early ? ' · em início' : ''}
                </text>
              </>
            )}
            <rect
              x={x(0)}
              y={y + 8}
              width={Math.max(2, x(percent) - x(0))}
              height={12}
              rx={3}
              fill={short.early ? `url(#${patternId})` : BAR}
              stroke={short.early ? HATCH_LINE : undefined}
            />
            <text x={x(percent) + 6} y={y + 18} fontSize={11.5} fontWeight={700} fill={INK[ppcTone(percent)]}>
              {pct(percent)}
              {Math.round(percent) < 70 ? ' ▲' : ''}
            </text>
          </g>
        );
      })}
      <line x1={x(70)} x2={x(70)} y1={TOP - 4} y2={bottom + 4} stroke="#b45309" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={x(70)} y={bottom + 16} dx={-4} fontSize={9.5} fill="#b45309" textAnchor="end">
        alerta 70%
      </text>
      {consolidated !== undefined && (
        <>
          <line x1={x(consolidated)} x2={x(consolidated)} y1={TOP - 4} y2={bottom + 18} stroke="#0d1f2b" strokeWidth={1.5} />
          <text
            x={x(consolidated)}
            y={bottom + 30}
            dx={consolidated > 85 ? -4 : 4}
            fontSize={9.5}
            fontWeight={700}
            fill="#0d1f2b"
            textAnchor={consolidated > 85 ? 'end' : 'start'}
          >
            consolidado {pct(consolidated)}
          </text>
        </>
      )}
    </svg>
  );
}

export function PpcBarsLegend({ early }: { early: boolean }) {
  return (
    <Legend
      items={[
        { color: BAR, text: 'PPC da obra' },
        ...(early
          ? [{ color: `repeating-linear-gradient(45deg, ${HATCH_LINE} 0 2px, #fff 2px 4px)`, outline: HATCH_LINE, text: 'em início' }]
          : []),
        // `Legend` pinta a amostra com `background`: o gradiente desenha o tracejado âmbar da linha dos 70%.
        { color: 'repeating-linear-gradient(90deg, #b45309 0 4px, transparent 4px 7px)', line: true, text: 'alerta 70%' },
        { color: '#0d1f2b', line: true, text: 'consolidado' },
      ]}
    />
  );
}

// ─── Mapa de calor (regra 11) ──────────────────────────────────────────────────────────────────────────

/** Rampa sequencial azul de 40% a 100%; abaixo de 40%, o primeiro tom. Texto branco nos tons escuros. */
const RAMP = [
  '#cde2fb',
  '#b7d3f6',
  '#9ec5f4',
  '#86b6ef',
  '#6da7ec',
  '#5598e7',
  '#3987e5',
  '#2a78d6',
  '#256abf',
  '#1c5cab',
  '#184f95',
  '#104281',
];
export function heatColor(percent: number): { background: string; color: string } {
  const index = Math.max(0, Math.min(RAMP.length - 1, Math.floor(((percent - 40) / 60) * RAMP.length)));
  return { background: RAMP[index], color: index >= 6 ? '#fff' : '#0d1f2b' };
}

function HeatCell({ cell, who, label, here }: { cell: BucketPpc | undefined; who: string; label: string; here: boolean }) {
  if (!cell || (cell.planned === 0 && cell.openWeeks === 0 && cell.percent === undefined))
    return (
      <td className="none" title={`${who} · ${label}: sem linha`}>
        ·
      </td>
    );
  if (cell.percent === undefined)
    return (
      <td className={`open${here ? ' here' : ''}`} title={`${who} · ${label}: semana em aberto`}>
        aberto
      </td>
    );
  return (
    <td
      className={here ? 'here' : undefined}
      style={heatColor(cell.percent)}
      title={`${who} · ${label}: ${pct(cell.percent)}\n${int(cell.fulfilled)} de ${int(cell.planned)} compromissos${
        cell.openWeeks ? `\n${plural(cell.openWeeks, 'semana em aberto', 'semanas em aberto')} fora da conta` : ''
      }`}
    >
      {Math.round(cell.percent)}
    </td>
  );
}

export function PpcHeat({ heat }: { heat: PortfolioHeat }) {
  if (!heat.rows.length || !heat.buckets.length) return <p className="dsh-empty">Nenhuma obra com linha no curto prazo na série.</p>;
  return (
    <div className="pf-xscroll">
      <table className="pf-heat">
        <thead>
          <tr>
            <th aria-label="Obra" />
            {heat.buckets.map(bucket => (
              <th key={bucket.key} scope="col" className={bucket.analyzed ? 'here' : undefined} title={bucket.label}>
                {bucket.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {heat.rows.map(row => (
            <tr key={row.work.id}>
              <th scope="row" className="rowh" title={row.work.name}>
                {row.work.code || row.work.name}
              </th>
              {heat.buckets.map((bucket, index) => (
                <HeatCell key={bucket.key} cell={row.cells[index]} who={row.work.name} label={bucket.label} here={bucket.analyzed} />
              ))}
            </tr>
          ))}
          <tr className="total">
            <th scope="row" className="rowh">
              Todas
            </th>
            {heat.buckets.map((bucket, index) => (
              <HeatCell key={bucket.key} cell={heat.total[index]} who="Todas as obras" label={bucket.label} here={bucket.analyzed} />
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function HeatRamp({ open = true }: { open?: boolean }) {
  return (
    <div className="pf-ramp" aria-hidden>
      <span>40%</span>
      <span className="bar">
        {RAMP.map(color => (
          <i key={color} style={{ background: color }} />
        ))}
      </span>
      <span>100%</span>
      {open && (
        <span>
          <i className="hatch" />
          em aberto
        </span>
      )}
    </div>
  );
}

// ─── Causas somando as obras (regra 11) ────────────────────────────────────────────────────────────────

const VITAL = '#be123c';
const REST = '#c4d3df';

export function CausesPareto({ pareto, limit }: { pareto: PortfolioPareto; limit?: number }) {
  if (!pareto.rows.length || !pareto.failures) return <p className="dsh-empty">Nenhum compromisso não cumprido no período.</p>;
  const shown = limit ? pareto.rows.slice(0, limit) : pareto.rows;
  const rest = pareto.rows.slice(shown.length);
  const peak = Math.max(1, ...pareto.rows.map(row => row.total));
  // Acumulado de cada causa sobre os não cumpridos, para a dica de cada linha.
  const accumulated = shown.map((_, index) => shown.slice(0, index + 1).reduce((sum, row) => sum + row.total, 0));
  return (
    <>
      <div className="dsh-grid pf-g3">
        <div className="thd">
          <span>Causa</span>
          <span className="num">Linhas</span>
          <span>Obra que mais contribui</span>
        </div>
        {shown.map((row, index) => {
          const running = accumulated[index];
          const share = (row.total / pareto.failures) * 100;
          const topShare = row.total ? (row.top.total / row.total) * 100 : 0;
          return (
            <div
              key={row.cause}
              title={`${row.cause}: ${row.total} linhas (${pct(share)})\nAcumulado: ${pct((running / pareto.failures) * 100)}`}
            >
              <span className="txt">
                <span className="cause">{row.cause}</span>
                <span
                  className="bar"
                  style={{ width: `${Math.max(3, (row.total / peak) * 100)}%`, background: row.vital ? VITAL : REST }}
                />
              </span>
              <span className="num">{row.total}</span>
              <span className="muted txt" title={row.top.work.name}>
                {row.top.work.code || row.top.work.name} · {pct(topShare)} das linhas
              </span>
            </div>
          );
        })}
        {rest.length > 0 && (
          <div>
            <span className="txt muted">{rest.length === 1 ? rest[0].cause : `Outras ${rest.length} causas`}</span>
            <span className="num">{rest.reduce((sum, row) => sum + row.total, 0)}</span>
            <span />
          </div>
        )}
      </div>
      <Legend
        items={[
          { color: VITAL, text: `somam 80% dos ${int(pareto.failures)} não cumpridos` },
          { color: REST, text: 'demais' },
        ]}
      />
    </>
  );
}

// ─── Empreiteiros em mais de uma obra (regra 11) ───────────────────────────────────────────────────────

export function CompaniesHeat({ companies }: { companies: PortfolioCompanies }) {
  if (!companies.rows.length) return <p className="dsh-empty">Nenhuma empresa com linhas em mais de uma obra no período.</p>;
  return (
    <div className="pf-xscroll">
      <table className="pf-heat">
        <thead>
          <tr>
            <th aria-label="Empresa" />
            {companies.works.map(work => (
              <th key={work.id} scope="col" title={work.name}>
                {work.code || work.name}
              </th>
            ))}
            <th scope="col">Todas</th>
          </tr>
        </thead>
        <tbody>
          {companies.rows.map(row => (
            <tr key={row.name}>
              <th scope="row" className="rowh" title={row.name}>
                {row.name}
              </th>
              {companies.works.map(work => {
                const cell = row.byWork[work.id];
                if (!cell || !cell.planned || cell.percent === undefined)
                  return (
                    <td key={work.id} className="none" title={`${row.name} sem linha em ${work.name}`}>
                      ·
                    </td>
                  );
                return (
                  <td
                    key={work.id}
                    style={heatColor(cell.percent)}
                    title={`${row.name} em ${work.name}: ${pct(cell.percent)}\n${int(cell.fulfilled)} de ${int(cell.planned)} compromissos`}
                  >
                    {Math.round(cell.percent)}
                  </td>
                );
              })}
              {row.total.percent === undefined ? (
                <td className="none">·</td>
              ) : (
                <td
                  className="strong"
                  style={heatColor(row.total.percent)}
                  title={`${row.name}, todas as obras: ${int(row.total.fulfilled)} de ${int(row.total.planned)}`}
                >
                  {Math.round(row.total.percent)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Linhas por obra dos demais módulos (regra 12) ─────────────────────────────────────────────────────

function Name({ work, sub }: { work: PortfolioWork; sub?: string }) {
  return (
    <span className="nm" title={work.name}>
      {work.name}
      <small>
        {work.code}
        {sub ? `${work.code ? ' · ' : ''}${sub}` : ''}
      </small>
    </span>
  );
}

const PLANNED_FILL = '#b7d3f6';
const MEASURED_FILL = '#1c5cab';

export function LongTermRows({ rows, end }: { rows: readonly PortfolioRow[]; end: string }) {
  const list = rows.filter(row => row.longTerm);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com plano de longo prazo.</p>;
  return (
    <>
      <div className="pf-rows">
        {list.map(row => {
          const lt = row.longTerm!;
          const slip =
            lt.slip === undefined
              ? undefined
              : lt.slip === 0
                ? 'prazo igual à linha de base'
                : `prazo ${signedDays(lt.slip)} dias vs linha de base`;
          if (lt.measured === undefined)
            return (
              <div key={row.work.id} className="pf-rowx">
                <Name work={row.work} sub={slip} />
                <span className="muted">
                  sem medição até {end}; planejado {pct(lt.planned)}
                </span>
                <span />
              </div>
            );
          return (
            <div
              key={row.work.id}
              className="pf-rowx"
              title={`${row.work.name}\nMedido ${pct(lt.measured)}${lt.lastMeasurement ? ` (medição de ${formatDate(lt.lastMeasurement)})` : ''}\nPlanejado ${pct(
                lt.planned,
              )} em ${end} ${lt.plannedSource === 'baseline' ? 'pela linha de base' : 'pelo plano vivo'}`}
            >
              <Name work={row.work} sub={slip} />
              <span className="pf-bullet" role="img" aria-label={`Medido ${pct(lt.measured)}, planejado ${pct(lt.planned)}`}>
                <span className="pl" style={{ width: `${clampPercent(lt.planned)}%` }} />
                <span className="me" style={{ width: `${clampPercent(lt.measured)}%` }} />
              </span>
              <span className="meta">
                <b>{pct(lt.measured)}</b> × {pct(lt.planned)}{' '}
                {lt.delta !== undefined && <span className={`dsh-tag ${deviationTone(lt.delta)}`}>{signedPoints(lt.delta)}</span>}
              </span>
              <span className="sub2">
                No período: medido {lt.measuredGain === undefined ? '—' : signedPoints(lt.measuredGain)} × planejado{' '}
                {signedPoints(lt.plannedGain)}
              </span>
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { color: PLANNED_FILL, text: 'planejado' },
          { color: MEASURED_FILL, text: 'medido' },
        ]}
      />
    </>
  );
}

export function WagonRows({ rows, end }: { rows: readonly PortfolioRow[]; end: string }) {
  const list = rows.filter(row => row.wagons);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com vagões.</p>;
  const legend = list[0].wagons!.byStatus;
  return (
    <>
      <div className="pf-rows">
        {list.map(row => {
          const w = row.wagons!;
          const counts = w.byStatus.map(s => `${s.value} ${s.label.toLowerCase()}`).join(' · ');
          return (
            <div key={row.work.id} className="pf-rowx" title={`${row.work.name} em ${end}\n${counts}`}>
              <Name work={row.work} sub={plural(w.total, 'vagão', 'vagões')} />
              {w.total ? (
                <span className="pf-stackb" role="img" aria-label={`Vagões por status: ${counts}`}>
                  {w.byStatus.map(s => (s.value ? <b key={s.status} style={{ flex: s.value, background: s.color }} /> : null))}
                </span>
              ) : (
                <span className="muted">nenhum vagão</span>
              )}
              <span className="meta">
                <span className={w.taktOverdue ? 't-warn' : 't-good'}>
                  <b>{w.taktOverdue}</b> takt vencido
                </span>{' '}
                ·{' '}
                <span className={w.restrictionsOverdue ? 't-bad' : 't-good'}>
                  <b>{w.restrictionsOverdue}</b> restr. vencidas
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <Legend items={legend.map(s => ({ color: s.color, text: s.label.toLowerCase() }))} />
    </>
  );
}

const DONE = '#1c5cab';
const DOING = '#6da7ec';
const TODO = '#cde2fb';

export function MediumRows({ rows }: { rows: readonly PortfolioRow[] }) {
  const list = rows.filter(row => row.medium);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com plano de médio prazo.</p>;
  return (
    <>
      <div className="pf-rows">
        {list.map(row => {
          const m = row.medium!;
          const total = m.done + m.inProgress + m.notStarted;
          const counts = `${m.done} concluídas · ${m.inProgress} em andamento · ${m.notStarted} não iniciadas`;
          return (
            <div key={row.work.id} className="pf-rowx" title={`${row.work.name} · ${m.planName} (${m.planMonthLabel})\n${counts}`}>
              <Name work={row.work} sub={`plano de ${monthShort(m.planMonth)}`} />
              {total ? (
                <span className="pf-stackb" role="img" aria-label={`Tarefas: ${counts}`}>
                  {m.done > 0 && <b style={{ flex: m.done, background: DONE }} />}
                  {m.inProgress > 0 && <b style={{ flex: m.inProgress, background: DOING }} />}
                  {m.notStarted > 0 && <b style={{ flex: m.notStarted, background: TODO }} />}
                </span>
              ) : (
                <span className="muted">sem tarefas</span>
              )}
              <span className="meta">
                <span className={m.late ? 't-warn' : 't-good'}>
                  <b>{m.late}</b> {m.late === 1 ? 'atrasada' : 'atrasadas'}
                </span>{' '}
                · {m.finishVariance === undefined ? 'sem linha de base' : `${signedDays(m.finishVariance)} d.u.`} · {m.overloaded}{' '}
                superaloc.
              </span>
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { color: DONE, text: 'concluídas' },
          { color: DOING, text: 'em andamento' },
          { color: TODO, text: 'não iniciadas' },
        ]}
      />
    </>
  );
}

const OPENED = '#eb6834';
const RESOLVED = '#2a78d6';

export function TerminalityRows({ rows }: { rows: readonly PortfolioRow[] }) {
  const list = rows.filter(row => row.terminality);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com pendências de terminalidade.</p>;
  const peak = Math.max(1, ...list.map(row => Math.max(row.terminality!.opened, row.terminality!.resolved)));
  return (
    <>
      <div className="pf-rows">
        {list.map(row => {
          const t = row.terminality!;
          const diff = t.open - t.openAtStart;
          return (
            <div
              key={row.work.id}
              className="pf-rowx"
              title={`${row.work.name}\n${t.opened} abertas e ${t.resolved} resolvidas no período\nEm aberto: ${t.openAtStart} no início, ${t.open} no fim`}
            >
              <Name work={row.work} />
              <div className="pf-pair" role="img" aria-label={`${t.opened} abertas e ${t.resolved} resolvidas no período`}>
                <div>
                  <span className="tr">
                    <b style={{ width: `${(t.opened / peak) * 100}%`, background: OPENED }} />
                  </span>
                  <span className="n">{t.opened}</span>
                </div>
                <div>
                  <span className="tr">
                    <b style={{ width: `${(t.resolved / peak) * 100}%`, background: RESOLVED }} />
                  </span>
                  <span className="n">{t.resolved}</span>
                </div>
              </div>
              <span className="meta">
                <b>{int(t.open)}</b> em aberto <span className={diff > 0 ? 't-bad' : 't-good'}>({signedDays(diff)})</span> ·{' '}
                {t.percentLabel} resolv. · {t.averageDaysToResolve === undefined ? '—' : `${Math.round(t.averageDaysToResolve)} d`}
              </span>
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { color: OPENED, text: 'abertas no período' },
          { color: RESOLVED, text: 'resolvidas no período' },
        ]}
      />
    </>
  );
}

export function ResponsiblesList({ responsibles }: { responsibles: PortfolioResponsibles }) {
  if (!responsibles.rows.length) return <p className="dsh-empty">Nenhuma pendência em aberto no sábado final.</p>;
  return (
    <div className="dsh-grid pf-g3">
      <div className="thd">
        <span>Responsável terceiro</span>
        <span className="num">Abertas</span>
        <span>Por obra</span>
      </div>
      {responsibles.rows.map(row => {
        const byWork = row.byWork.map(item => `${item.work.code || item.work.name} ${item.count}`).join(' · ');
        return (
          <div key={row.label}>
            <span className={`txt${row.none ? ' muted' : ''}`} title={row.label}>
              {row.label}
            </span>
            <span className="num">{row.total}</span>
            <span className="muted txt" title={row.byWork.map(item => `${item.work.name}: ${item.count}`).join('\n')}>
              {byWork}
            </span>
          </div>
        );
      })}
    </div>
  );
}

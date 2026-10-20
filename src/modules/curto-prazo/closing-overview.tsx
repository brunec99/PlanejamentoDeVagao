'use client';
import { useState } from 'react';
import { causePareto, ppcSeries, type CauseTally, type WeekPpc } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { weekNumberFrom } from '@/domain/week-numbering';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { TabHeader } from '@/modules/layout/tab-header';
import { HelpNote } from '@/modules/layout/help-note';
import { CHART } from '@/shared/palette';
import { formatDate } from '@/shared/format';
import { useWorkSettings } from '@/modules/configuracoes/work-settings';
import { distinctValues, weekOptions } from '@/modules/curto-prazo/sheet-view';
import { SectionNav } from '@/modules/curto-prazo/section-nav';
import { FilterPicker } from '@/modules/curto-prazo/closing-filter';
import { JustificationsView } from '@/modules/curto-prazo/justifications-view';
import {
  applyClosingFilter,
  commitmentCompany,
  commitmentTeam,
  failureRows,
  groupByCause,
  type ClosingFilter,
} from '@/modules/curto-prazo/justifications';

const dayMonth = (date: string) => formatDate(date).slice(0, 5);

/** Seção "Fechamento" da aba 4 (09/10/2026, pedido da obra): a série do PPC e o Pareto das causas saíram
 * de baixo da planilha para uma seção própria (`?secao=fechamento`), para a planilha ficar sozinha na
 * página. Lê os mesmos compromissos da planilha e de mais nada. */
export function ClosingOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const [chosen, setChosen] = useState('');
  const [scope, setScope] = useState<'obra' | 'semana'>('obra');
  const [filter, setFilter] = useState<ClosingFilter>({});
  const { weekOneStart } = useWorkSettings(workId);
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const teams = planning.data.teams.filter(t => t.workId === workId);
  const all = planning.data.commitments.filter(c => c.workId === workId);
  // O recorte por empreiteiro/equipe (11/10/2026, pedido da obra) vale para a série, o Pareto e as
  // justificativas; as opções e contagens dos seletores saem da obra inteira, sem o recorte.
  const commitments = applyClosingFilter(all, filter, teams);
  const companies = distinctValues(all, row => commitmentCompany(row, teams));
  const teamNames = distinctValues(all, row => commitmentTeam(row, teams));
  const filtering = !!filter.companies || !!filter.teams;
  const currentWeek = startOfWeek(planning.today);
  const firstWeek =
    weekOneStart ?? startOfWeek(all.reduce((earliest, c) => (c.weekStart < earliest ? c.weekStart : earliest), planning.today));
  const weeks = [...new Set([...weekOptions(firstWeek, currentWeek), ...all.map(c => c.weekStart)])].sort();
  const week = weeks.includes(chosen) ? chosen : currentWeek;
  const weekNumber = (start: string) => weekNumberFrom(firstWeek, start);
  const weekRows = commitments.filter(c => c.weekStart === week);
  const series = ppcSeries(commitments);
  const pareto = causePareto(scope === 'semana' ? weekRows : commitments);
  const period = scope === 'semana' ? `na semana ${weekNumber(week)}` : 'na obra';
  const groups = groupByCause(
    failureRows(scope === 'semana' ? weekRows : commitments, teams, firstWeek),
    pareto.map(item => item.cause),
  );

  return (
    <>
      <TabHeader
        workId={workId}
        section="curto-prazo"
        description="A série do PPC diz se o comprometimento está sendo aprendido; o Pareto, o que está custando a obra."
      >
        <SectionNav workId={workId} section="fechamento" />
      </TabHeader>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
        <label data-tour="curto-fechamento-semana" className="flex items-center gap-2">
          Semana analisada
          <select className="field max-w-60 py-1.5" value={week} onChange={e => setChosen(e.target.value)}>
            {[...weeks].reverse().map(w => (
              <option key={w} value={w}>
                {weekNumber(w)} · {dayMonth(w)} a {dayMonth(addDays(w, 5))}
                {w === currentWeek ? ' (atual)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div
          data-tour="curto-fechamento-recorte"
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Recorte da série e do Pareto"
        >
          <FilterPicker
            label="Empreiteiro"
            values={companies}
            selected={filter.companies as Set<string> | undefined}
            onChange={companies => setFilter(current => ({ ...current, companies }))}
          />
          <FilterPicker
            label="Equipe"
            values={teamNames}
            selected={filter.teams as Set<string> | undefined}
            onChange={teams => setFilter(current => ({ ...current, teams }))}
          />
          {filtering && (
            <button type="button" className="text-link text-xs" onClick={() => setFilter({})}>
              Limpar
            </button>
          )}
        </div>
      </div>
      <section aria-labelledby="fechamento-title">
        {/* Só existe nesta seção: é o alvo da abertura do fechamento no tour "Como usar". */}
        <div data-tour="curto-fechamento" className="flex flex-wrap items-center gap-x-1 gap-y-1">
          <h2 id="fechamento-title" className="text-lg font-bold text-slate-900">
            Fechamento da semana
          </h2>
          <HelpNote title="Como ler o fechamento" label="Como ler o fechamento" compact>
            <p>
              O PPC de uma semana sozinha diz pouco, e causa coletada e nunca somada não diz nada. O que o Last Planner lê é a série — se o
              comprometimento está sendo aprendido — e o Pareto das causas, que aponta o que está custando a obra.
            </p>
            <p>As duas leituras saem da planilha acima e de mais nada: esta tela não depende do plano do mês.</p>
          </HelpNote>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          A série do PPC diz se o comprometimento está sendo aprendido; o Pareto, o que está custando a obra.
        </p>
        {filtering && (
          <p className="mt-2 text-xs font-semibold text-primary-ink" role="status">
            Recorte ativo: a série, o Pareto e as justificativas abaixo consideram só os empreiteiros e equipes marcados.
          </p>
        )}
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <PpcSeries series={series} week={week} label={weekNumber} />
          {/* O filtro de coluna da planilha não chega aqui; o recorte do fechamento (acima), sim. */}
          <CausesPareto tally={pareto} scope={scope} onScope={setScope} period={period} weekLabel={weekNumber(week)} />
        </div>
        <JustificationsView
          groups={groups}
          period={period}
          request={{
            workId,
            scope,
            weekStart: week,
            companies: filter.companies && [...filter.companies],
            teams: filter.teams && [...filter.teams],
          }}
        />
      </section>
    </>
  );
}

function PpcSeries({ series, week, label }: { series: WeekPpc[]; week: string; label: (weekStart: string) => number }) {
  const shown = series.slice(-12);
  // Semana com linha sem Status não é PPC fechado: ela entra no desenho, mas fora da média.
  const closed = shown.filter(point => point.pending === 0);
  const average = closed.length ? closed.reduce((sum, point) => sum + point.percent, 0) / closed.length : 0;
  const W = 640,
    H = 172,
    TOP = 16,
    BOTTOM = 38,
    LEFT = 30,
    PLOT = H - TOP - BOTTOM;
  const step = (W - LEFT) / Math.max(1, shown.length);
  const barWidth = Math.min(46, step * 0.58);
  const y = (percent: number) => TOP + PLOT * (1 - percent / 100);

  return (
    <section data-tour="curto-fechamento-serie" className="panel p-5" aria-labelledby="ppc-serie-title">
      <div className="flex flex-wrap items-center gap-x-1">
        <h3 id="ppc-serie-title" className="text-sm font-bold text-slate-800">
          Série do PPC
        </h3>
        <HelpNote title="Como ler a série do PPC" label="Como ler a série do PPC" compact>
          <p>Cada barra é uma semana da obra, da mais antiga para a mais recente. Barra cheia é semana apurada.</p>
          <p>Barra hachurada e clara é semana ainda em aberto: tem linha sem Status, então aquele PPC não fechou e fica fora da média.</p>
          <p>A faixa âmbar é a semana exibida na planilha, e a linha tracejada é a média das semanas apuradas.</p>
        </HelpNote>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">Cada barra é uma semana da obra, da mais antiga para a mais recente.</p>

      {shown.length === 0 ? (
        <div className="mt-4">
          <Empty>Nenhum compromisso registrado ainda: a série começa na primeira linha da planilha.</Empty>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatCard
              label="PPC médio das semanas apuradas"
              tone={closed.length > 0 && average < 70 ? 'warning' : 'default'}
              value={closed.length > 0 ? `${Math.round(average)}%` : '—'}
            />
            <StatCard label="Semanas apuradas · em aberto" value={`${closed.length} · ${shown.length - closed.length}`} />
          </div>

          <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" aria-hidden="true">
            <defs>
              {/* Hachura da semana em aberto: o mesmo azul, riscado — barra listrada é "ainda não fechou". */}
              <pattern id="ppc-aberta" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={7} height={7} fill={CHART.planned} />
                <line x1={0} y1={0} x2={0} y2={7} stroke={CHART.surface} strokeWidth={3} />
              </pattern>
            </defs>
            {[0, 50, 100].map(mark => (
              <g key={mark}>
                <line x1={LEFT} y1={y(mark)} x2={W} y2={y(mark)} stroke={CHART.grid} strokeWidth={1} />
                <text x={LEFT - 6} y={y(mark) + 3} textAnchor="end" fontSize={10} fill={CHART.inkFaint}>
                  {mark}
                </text>
              </g>
            ))}
            {/* A semana exibida na planilha ganha a faixa âmbar, o mesmo papel que o âmbar tem nos
              outros gráficos: "é aqui que você está". Faixa, e não contorno, para não cruzar o
              rótulo da barra cheia. */}
            {shown.map((point, index) =>
              point.weekStart === week ? (
                <rect
                  key={`aqui-${point.weekStart}`}
                  x={LEFT + step * index + 1}
                  y={TOP - 10}
                  width={step - 2}
                  height={PLOT + 10}
                  rx={4}
                  fill={CHART.today}
                  opacity={0.12}
                />
              ) : null,
            )}
            {closed.length > 0 && (
              <>
                <line x1={LEFT} y1={y(average)} x2={W} y2={y(average)} stroke={CHART.inkMuted} strokeWidth={1.5} strokeDasharray="5 4" />
                <text x={W - 2} y={y(average) - 4} textAnchor="end" fontSize={10} fontWeight={700} fill={CHART.inkMuted}>
                  média {Math.round(average)}%
                </text>
              </>
            )}
            {shown.map((point, index) => {
              const center = LEFT + step * (index + 0.5);
              const height = Math.max(2, (PLOT * point.percent) / 100);
              const open = point.pending > 0,
                here = point.weekStart === week;
              return (
                <g key={point.weekStart}>
                  <rect
                    x={center - barWidth / 2}
                    y={TOP + PLOT - height}
                    width={barWidth}
                    height={height}
                    rx={2}
                    fill={open ? 'url(#ppc-aberta)' : CHART.planned}
                    opacity={open ? 0.75 : 1}
                  />
                  <text
                    x={center}
                    y={TOP + PLOT - height - 4}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill={here ? CHART.today : CHART.ink}
                  >
                    {Math.round(point.percent)}
                  </text>
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
                  <text x={center} y={H - BOTTOM + 26} textAnchor="middle" fontSize={10} fill={CHART.inkFaint}>
                    {dayMonth(point.weekStart)}
                  </text>
                </g>
              );
            })}
            <line x1={LEFT} y1={TOP + PLOT} x2={W} y2={TOP + PLOT} stroke={CHART.gridStrong} strokeWidth={1} />
          </svg>

          <p className="mt-2 text-xs leading-5 text-slate-500">
            Barra cheia: semana apurada. Barra hachurada: semana em aberto, fora da média. Faixa âmbar: semana da planilha. Tracejado: média
            das apuradas.
          </p>

          <table className="sr-only">
            <caption>PPC por semana da obra</caption>
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col">Período</th>
                <th scope="col">Compromissos</th>
                <th scope="col">Cumpridos</th>
                <th scope="col">Sem status</th>
                <th scope="col">PPC</th>
                <th scope="col">Situação</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(point => (
                <tr key={point.weekStart}>
                  <th scope="row">Semana {label(point.weekStart)}</th>
                  <td>
                    {formatDate(point.weekStart)} a {formatDate(addDays(point.weekStart, 5))}
                  </td>
                  <td>{point.planned}</td>
                  <td>{point.fulfilled}</td>
                  <td>{point.pending}</td>
                  <td>{Math.round(point.percent)}%</td>
                  <td>
                    {point.pending > 0 ? `Em aberto, ${point.pending} sem status` : 'Apurada'}
                    {point.weekStart === week ? ' · semana exibida na planilha' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

/** O Pareto das causas. O período padrão é a obra inteira: numa semana só, cada causa aparece uma
 * ou duas vezes e a ordem é ruído — o Pareto só diz alguma coisa com massa de falhas atrás. */
function CausesPareto({
  tally,
  scope,
  onScope,
  period,
  weekLabel,
}: {
  tally: CauseTally[];
  scope: 'obra' | 'semana';
  onScope: (scope: 'obra' | 'semana') => void;
  period: string;
  weekLabel: number;
}) {
  const failures = tally.reduce((sum, item) => sum + item.total, 0);
  // As poucas vitais: as primeiras causas até fechar 80% das falhas. É a leitura que importa —
  // atacar essas causas é atacar a maior parte do que não foi cumprido.
  const vital = tally.findIndex(item => item.accumulated >= 80) + 1;

  return (
    <section data-tour="curto-fechamento-pareto" className="panel p-5" aria-labelledby="pareto-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-1">
            <h3 id="pareto-title" className="text-sm font-bold text-slate-800">
              Pareto das causas
            </h3>
            <HelpNote title="Como ler o Pareto" label="Como ler o Pareto" compact>
              <p>
                Só entram as linhas com Status Não e causa apontada. As causas vêm em ordem de ocorrências, com a participação de cada uma e
                o acumulado.
              </p>
              <p>
                As barras em vermelho são as poucas causas que somam os primeiros 80% das falhas: atacar essas é atacar a maior parte do que
                não foi cumprido.
              </p>
              <p>O período padrão é a obra inteira. Numa semana só, cada causa aparece uma ou duas vezes e a ordem é ruído.</p>
            </HelpNote>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Só entram as linhas com Status Não e causa apontada.</p>
        </div>
        <label data-tour="curto-fechamento-periodo" className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          Período
          <select className="field max-w-40 py-1.5" value={scope} onChange={e => onScope(e.target.value as 'obra' | 'semana')}>
            <option value="obra">A obra inteira</option>
            <option value="semana">Esta semana</option>
          </select>
        </label>
      </div>

      {tally.length === 0 ? (
        <div className="mt-4">
          <Empty>
            {scope === 'semana'
              ? `Nenhuma falha apurada na semana ${weekLabel}. Troque o período para a obra inteira: é onde o Pareto tem sentido.`
              : 'Nenhuma falha apurada ainda. O Pareto se forma quando as linhas não cumpridas recebem a causa.'}
          </Empty>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <Callout tone={vital <= 3 && vital < tally.length ? 'warning' : 'info'} role="status">
              {vital === tally.length ? (
                <>
                  As {tally.length} causas apontadas se dividem por {failures} {failures === 1 ? 'falha' : 'falhas'} {period}, sem
                  concentração clara.
                </>
              ) : (
                <>
                  <strong>
                    {vital} {vital === 1 ? 'causa responde' : 'causas respondem'} por {Math.round(tally[vital - 1].accumulated)}%
                  </strong>{' '}
                  das {failures} falhas apuradas {period} —{' '}
                  {tally
                    .slice(0, vital)
                    .map(item => item.cause)
                    .join(', ')}
                  . É aí que está o ganho.
                </>
              )}
            </Callout>
          </div>

          <div className="mt-4 overflow-x-auto custom-scrollbar" role="region" aria-label={`Pareto das causas ${period}`} tabIndex={0}>
            <table className="data-table min-w-[420px]">
              <thead>
                <tr>
                  <th scope="col">Causa</th>
                  <th scope="col">Ocorrências</th>
                  <th scope="col">Participação</th>
                  <th scope="col">Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {tally.map((item, index) => {
                  const heavy = index < vital && vital < tally.length;
                  return (
                    <tr key={item.cause}>
                      <th scope="row" className="leading-snug">
                        {item.cause}
                      </th>
                      <td className="tabular-nums">{item.total}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.max(2, Math.round(item.share))}%`,
                                backgroundColor: heavy ? CHART.late : CHART.planned,
                              }}
                            />
                          </span>
                          <span className="tabular-nums">{Math.round(item.share)}%</span>
                        </div>
                      </td>
                      <td className="tabular-nums font-semibold text-slate-700">{Math.round(item.accumulated)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {vital < tally.length && (
            <p className="mt-2 text-xs text-slate-500">As barras em vermelho são as causas que somam os primeiros 80% das falhas.</p>
          )}
        </>
      )}
    </section>
  );
}

/** A restrição nasce da falha: o Não da planilha vira item do quadro do longo prazo, sem passar
 * pelo plano do mês. O modelo é por vagão — o servidor exige `wagonId` —, e o lead time só existe
 * preso a uma atividade daquele vagão, porque o limite é contado para trás a partir do início
 * previsto dela. Sem lead time, o prazo é digitado. */

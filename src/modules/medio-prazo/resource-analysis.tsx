'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Users } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Empty, LoadState, Missing, Panel, StatCard } from '@/modules/planejamento/ui';
import { HelpNote } from '@/modules/layout/help-note';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { weeklyTeamLoad, type WeekLoad } from '@/domain/schedule-analysis';
import { addDays, startOfWeek } from '@/domain/validation';
import { formatDate, workPath } from '@/shared/format';
import { CHART } from '@/shared/palette';

const NEXT_WEEKS = 'proximas';
const monthEndOf = (month: string) => {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);
};
const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
const shortDate = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Célula do mapa de calor: a cor nunca é o único sinal — o número e o texto "acima"/"no limite"
 * dizem a mesma coisa para quem não distingue as cores. Os tons são os tokens de estado do
 * sistema, os mesmos dos cartões e dos avisos, para que "acima" seja sempre o mesmo vermelho. */
function cellTone(week: WeekLoad) {
  if (week.overloaded) return { className: 'bg-danger-soft text-danger font-bold', label: 'acima' };
  if (week.load > 0 && week.load === week.capacity) return { className: 'bg-warning-soft text-warning font-semibold', label: 'no limite' };
  if (week.load > 0) return { className: 'bg-success-soft text-success', label: '' };
  return { className: 'text-slate-400', label: '' };
}
/** A legenda repete exatamente a classe da célula, com um contorno para o quadradinho não sumir no branco. */
const LEGEND = [
  { className: 'bg-success-soft border-success-ring', label: 'abaixo da capacidade' },
  { className: 'bg-warning-soft border-warning-ring', label: 'no limite' },
  { className: 'bg-danger-soft border-danger-ring', label: 'acima da capacidade' },
];

export function ResourceAnalysis({ workId }: { workId: string }) {
  const context = usePlanning();
  const [period, setPeriod] = useState('');
  const [teamId, setTeamId] = useState('');
  const [cell, setCell] = useState<{ teamId: string; weekStart: string }>();
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data, today } = planning;

  const months = [...new Set(data.plans.filter(p => p.workId === workId && !p.baselineOf && !p.frozenAt).map(p => p.month))].sort((a, b) =>
    b.localeCompare(a),
  );
  const chosen = period === NEXT_WEEKS || months.includes(period) ? period : (months[0] ?? NEXT_WEEKS);
  const from = chosen === NEXT_WEEKS ? startOfWeek(today) : `${chosen}-01`;
  const to = chosen === NEXT_WEEKS ? addDays(startOfWeek(today), 12 * 7 - 1) : monthEndOf(chosen);
  const result = weeklyTeamLoad(data, workId, from, to);
  const { teams, weeks, unassigned } = result;

  const overloadedTeams = teams.filter(t => t.overloadedWeeks > 0).length;
  const overloadedWeeks = weeks.filter((_, at) => teams.some(t => t.weeks[at].overloaded)).length;
  const peak = teams.reduce<{ load: number; label?: string }>(
    (best, t) => (t.peak > best.load ? { load: t.peak, label: t.team.name } : best),
    { load: 0 },
  );
  const looseIds = new Set(unassigned.flatMap(w => w.items.map(i => i.id)));
  const focus = teams.find(t => t.team.id === teamId) ?? teams.find(t => t.overloadedWeeks > 0) ?? teams[0];
  const detail = cell && teams.find(t => t.team.id === cell.teamId)?.weeks.find(w => w.weekStart === cell.weekStart);
  const detailTeam = cell && teams.find(t => t.team.id === cell.teamId)?.team;
  const scale = focus ? Math.max(1, focus.peak, focus.team.weeklyCapacity) : 1;

  return (
    <Panel
      title="Alocação de recursos e superalocação"
      tourId="medio-resources"
      actions={
        <>
          <HelpNote title="Como funciona: alocação de recursos" align="end" compact>
            <p>Carga semanal de cada equipe: as linhas do plano do mês vivo e as atividades do cronograma que tocam a semana, somadas.</p>
            <p>
              Capacidade é o número de atividades simultâneas por semana, não pessoas nem horas; é a cadastrada em Configurações da obra.
              Linha de base congelada e item de resumo não contam.
            </p>
            <p>
              Análise, não bloqueio: o plano continua aceitando qualquer alocação. Verde é abaixo da capacidade, âmbar no limite, vermelho
              acima; o número na célula diz o mesmo para quem não distingue as cores.
            </p>
          </HelpNote>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            Período
            <select
              className="field max-w-60 py-1.5"
              value={chosen}
              onChange={e => {
                setPeriod(e.target.value);
                setCell(undefined);
              }}
              aria-label="Período analisado"
            >
              {months.map(m => (
                <option key={m} value={m}>
                  Plano de {monthLabel(m)}
                </option>
              ))}
              <option value={NEXT_WEEKS}>Próximas 12 semanas</option>
            </select>
          </label>
        </>
      }
    >
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Equipes superalocadas" value={overloadedTeams} tone={overloadedTeams ? 'danger' : 'default'} />
        <StatCard
          label="Semanas com superalocação"
          value={`${overloadedWeeks} de ${weeks.length}`}
          tone={overloadedWeeks ? 'danger' : 'default'}
        />
        <StatCard label="Pico de carga semanal" value={peak.load} hint={peak.label} />
        <StatCard label="Itens sem equipe no período" value={looseIds.size} tone={looseIds.size ? 'warning' : 'default'} />
      </div>

      {teams.length === 0 ? (
        <Empty>
          Nenhuma equipe cadastrada nesta obra.{' '}
          <Link className="text-link" href={workPath(workId, 'configuracoes')}>
            Cadastre empreiteiros e equipes
          </Link>{' '}
          para acompanhar a carga semanal.
        </Empty>
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto custom-scrollbar" role="region" aria-label="Mapa de carga semanal por equipe" tabIndex={0}>
            <table className="data-table min-w-[720px]">
              <caption className="sr-only">
                Carga por equipe e semana, no formato carga/capacidade. Selecione uma célula para ver os itens da semana.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-slate-50">
                    Equipe
                  </th>
                  {weeks.map(w => (
                    <th scope="col" key={w} className="whitespace-nowrap text-center tabular-nums">
                      Sem. {shortDate(w)}
                    </th>
                  ))}
                  <th scope="col" className="text-center">
                    Pico
                  </th>
                </tr>
              </thead>
              <tbody>
                {teams.map(row => (
                  <tr key={row.team.id}>
                    <th scope="row" className="sticky left-0 z-10 bg-white">
                      <button
                        type="button"
                        className={`text-left ${focus?.team.id === row.team.id ? 'text-primary-ink' : ''}`}
                        onClick={() => setTeamId(row.team.id)}
                        aria-pressed={focus?.team.id === row.team.id}
                      >
                        {row.team.name}
                        <span className="block text-xs font-normal text-slate-400">
                          {row.team.company} · cap. {row.team.weeklyCapacity}
                        </span>
                      </button>
                    </th>
                    {row.weeks.map(week => {
                      const tone = cellTone(week);
                      const active = cell?.teamId === row.team.id && cell.weekStart === week.weekStart;
                      return (
                        <td key={week.weekStart} className="p-1 text-center">
                          <button
                            type="button"
                            disabled={!week.load}
                            onClick={() => {
                              setCell(active ? undefined : { teamId: row.team.id, weekStart: week.weekStart });
                              setTeamId(row.team.id);
                            }}
                            aria-pressed={active}
                            aria-label={`${row.team.name}, semana de ${formatDate(week.weekStart)}: ${week.load} de ${week.capacity}${tone.label ? `, ${tone.label} da capacidade` : ''}`}
                            className={`flex min-h-10 w-full min-w-14 flex-col items-center justify-center rounded tabular-nums ${tone.className} ${active ? 'ring-2 ring-primary' : ''} disabled:cursor-default`}
                          >
                            <span className="inline-flex items-center gap-1">
                              {week.overloaded && <AlertTriangle size={12} aria-hidden />}
                              {week.load}/{week.capacity}
                            </span>
                            {tone.label && <span className="text-xs uppercase leading-none">{tone.label}</span>}
                          </button>
                        </td>
                      );
                    })}
                    <td
                      className={`text-center font-semibold tabular-nums ${row.peak > row.team.weeklyCapacity ? 'text-danger' : 'text-slate-700'}`}
                    >
                      {row.peak}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="sticky left-0 z-10 bg-white text-slate-500">
                    Sem equipe<span className="block text-xs font-normal text-slate-400">informativo</span>
                  </th>
                  {unassigned.map(week => (
                    <td
                      key={week.weekStart}
                      className={`text-center tabular-nums ${week.load ? 'font-semibold text-warning' : 'text-slate-400'}`}
                    >
                      {week.load}
                    </td>
                  ))}
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {LEGEND.map(item => (
              <span key={item.label}>
                <span className={`mr-1 inline-block h-2.5 w-2.5 rounded-sm border align-middle ${item.className}`} aria-hidden />
                {item.label}
              </span>
            ))}
          </p>

          {detail && detailTeam && (
            <div className="mt-4 rounded-lg border border-slate-200 p-4" role="status">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-800">
                  {detailTeam.name} · semana de {formatDate(detail.weekStart)} a {formatDate(detail.weekEnd)}
                </h3>
                <span className={detail.overloaded ? 'badge-muted text-danger' : 'badge-muted'}>
                  {detail.load} de {detail.capacity}
                  {detail.overloaded ? ` · ${detail.load - detail.capacity} acima` : ''}
                </span>
              </div>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {detail.items.map(item => (
                  <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>
                      <strong className="font-semibold text-slate-800">{item.name}</strong>{' '}
                      <span className="text-xs text-slate-500">
                        {item.kind === 'tarefa' ? 'Plano do mês' : 'Cronograma'} · {item.source}
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-xs tabular-nums text-slate-600">
                      {formatDate(item.plannedStart)} a {formatDate(item.plannedEnd)}
                    </span>
                  </li>
                ))}
              </ul>
              {detail.overloaded && (
                <p className="mt-2 text-xs text-slate-500">
                  Para resolver: desloque uma das linhas no plano do mês, passe-a para outra equipe ou revise a capacidade cadastrada.
                </p>
              )}
            </div>
          )}

          {focus && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Histograma · {focus.team.name}</h3>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  Equipe
                  <select
                    className="field max-w-60 py-1.5"
                    value={focus.team.id}
                    onChange={e => setTeamId(e.target.value)}
                    aria-label="Equipe do histograma"
                  >
                    {teams.map(t => (
                      <option key={t.team.id} value={t.team.id}>
                        {t.team.company} · {t.team.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {/* Barra azul é a carga planejada, vermelha quando passa da capacidade: a mesma paleta do Gantt e da curva de avanço. */}
              <div
                className="-mx-1 mt-3 overflow-x-auto custom-scrollbar"
                role="img"
                aria-label={`Histograma de carga semanal de ${focus.team.name}: ${focus.weeks.map(w => `${shortDate(w.weekStart)} ${w.load}`).join(', ')}; capacidade ${focus.team.weeklyCapacity}.`}
              >
                <div
                  className="relative flex h-40 min-w-[480px] items-end gap-1 px-1"
                  style={{ borderBottom: `1px solid ${CHART.gridStrong}` }}
                >
                  <div
                    className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed"
                    style={{ bottom: `${(focus.team.weeklyCapacity / scale) * 100}%`, borderColor: CHART.ink }}
                  >
                    <span className="absolute -top-5 right-1 bg-white px-1 text-xs font-semibold" style={{ color: CHART.ink }}>
                      capacidade {focus.team.weeklyCapacity}
                    </span>
                  </div>
                  {focus.weeks.map(w => (
                    <div key={w.weekStart} className="flex h-full flex-1 flex-col justify-end">
                      <span className={`text-center text-xs tabular-nums ${w.overloaded ? 'font-bold text-danger' : 'text-slate-500'}`}>
                        {w.load || ''}
                      </span>
                      <div
                        className="rounded-t"
                        style={{ height: `${(w.load / scale) * 100}%`, backgroundColor: w.overloaded ? CHART.late : CHART.planned }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex min-w-[480px] gap-1 px-1 pt-1">
                  {focus.weeks.map(w => (
                    <span key={w.weekStart} className="flex-1 text-center text-xs tabular-nums text-slate-400">
                      {shortDate(w.weekStart)}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                {focus.overloadedWeeks ? (
                  <>
                    <AlertTriangle size={13} className="text-danger" aria-hidden />
                    {focus.overloadedWeeks} {focus.overloadedWeeks === 1 ? 'semana acima' : 'semanas acima'} da capacidade, pico de{' '}
                    {focus.peak}.
                  </>
                ) : (
                  <>
                    <Check size={13} className="text-success" aria-hidden />
                    Dentro da capacidade em todas as semanas do período.
                  </>
                )}
              </p>
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex justify-end">
        <Link className="text-link inline-flex min-h-10 items-center gap-2 text-sm" href={workPath(workId, 'configuracoes')}>
          <Users size={15} aria-hidden />
          Ajustar equipes e capacidades
        </Link>
      </div>
    </Panel>
  );
}

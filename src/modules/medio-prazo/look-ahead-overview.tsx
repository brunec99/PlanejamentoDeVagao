'use client';
import { CommandForm, Field, TextField, number, value } from '@/modules/planejamento/forms';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, Panel, StatCard } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { teamLoad, weightedProgress } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { Gantt } from '@/modules/medio-prazo/gantt';
import { formatDate, wagonLabel } from '@/shared/format';

export function LookAheadOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  if (!selected || !planning.data.users.find(u => u.id === context.actorId)?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data, today } = planning;
  const { work, wagons } = selected;
  const windowEnd = addDays(today, 90);
  const weekStart = startOfWeek(today);

  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? 'Não informado';
  const place = (id: string) => data.locations.find(l => l.id === id)?.name ?? 'Local não informado';
  const wagonOf = (wagonId: string) => wagons.find(w => w.id === wagonId);

  const workActivities = data.activities.filter(a => wagons.some(w => w.id === a.wagonId));
  const lookAhead = workActivities.filter(a => a.plannedStart <= windowEnd && a.plannedEnd >= today).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.name.localeCompare(b.name));
  const teams = data.teams.filter(t => t.workId === workId).sort((a, b) => a.name.localeCompare(b.name));
  const loads = teams.map(team => ({ team, ...teamLoad(team.id, today, windowEnd, data) }));
  const withoutTeam = lookAhead.filter(a => !a.teamId).length;
  const overloaded = loads.filter(l => l.overloaded).length;
  // A atividade guarda só o percentual corrente; a série datada dos lançamentos fica em progressEntries.
  const entries = data.progressEntries.filter(e => workActivities.some(a => a.id === e.activityId)).sort((a, b) => b.recordedDate.localeCompare(a.recordedDate) || b.createdAt.localeCompare(a.createdAt));
  const shown = entries.slice(0, 20);

  return <>
    <p className="eyebrow">{work.code}</p>
    <h1 className="page-title">Planejamento de médio prazo</h1>
    <p className="mt-1 text-sm text-slate-500">Look Ahead de três meses: a janela vai de hoje ({formatDate(today)}) até {formatDate(windowEnd)} e desliza junto com o dia atual — cada dia entra uma data nova no fim e sai uma no começo, não é uma revisão trimestral.</p>

    <div className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Atividades na janela" value={lookAhead.length} />
      <StatCard label="Atividades sem equipe" value={withoutTeam} tone={withoutTeam > 0 ? 'warning' : 'default'} />
      <StatCard label="Equipes em sobrecarga" value={overloaded} tone={overloaded > 0 ? 'danger' : 'default'} />
      <StatCard label="Progresso ponderado da janela" value={`${Math.round(weightedProgress(lookAhead))}%`} />
    </div>

    <Panel title="Equipes" tourId="medio-teams">
      <p className="text-sm leading-6 text-slate-600">A capacidade semanal é o número de atividades simultâneas que a equipe consegue executar. A carga considera todas as atividades da equipe dentro da janela de três meses.</p>
      <div className="my-4">
        <CommandForm title="Cadastrar equipe" submit="Cadastrar equipe" command={d => ({ type: 'create_team', workId, name: value(d, 'name'), weeklyCapacity: number(d, 'weeklyCapacity') })}>
          <TextField name="name" label="Nome da equipe" />
          <TextField name="weeklyCapacity" label="Capacidade semanal (atividades simultâneas)" type="number" min={1} step="1" defaultValue={1} />
        </CommandForm>
      </div>
      {teams.length === 0
        ? <Empty>Nenhuma equipe cadastrada nesta obra. Sem equipes não é possível identificar quem executa cada atividade nem apurar sobrecarga.</Empty>
        : <div className="-mx-1 overflow-x-auto custom-scrollbar" role="region" aria-label="Equipes da obra" tabIndex={0}>
            <table className="data-table min-w-[620px]">
              <thead><tr>{['Equipe', 'Capacidade semanal', 'Atribuídas na janela', 'Situação'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{loads.map(load => <tr key={load.team.id}>
                <th scope="row">{load.team.name}</th>
                <td className="tabular-nums">{load.capacity} {load.capacity === 1 ? 'atividade' : 'atividades'}</td>
                <td className="tabular-nums">{load.assigned}</td>
                <td className={load.overloaded ? 'font-semibold text-amber-600' : ''}>{load.overloaded ? `Sobrecarga · ${load.assigned - load.capacity} além da capacidade` : 'Dentro da capacidade'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
    </Panel>

    <Gantt workId={workId} />

    <section className="panel overflow-hidden" aria-labelledby="entries-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h2 id="entries-title" className="text-sm font-bold text-slate-800">Histórico de lançamentos</h2>
        <span className="badge-muted">{entries.length} {entries.length === 1 ? 'lançamento' : 'lançamentos'}</span>
      </div>
      {shown.length === 0
        ? <div className="p-5"><Empty>Nenhum percentual executado lançado nesta obra.</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Histórico de lançamentos" tabIndex={0}>
            <table className="data-table min-w-[720px]">
              <thead><tr>{['Atividade', 'Data do lançamento', 'Percentual', 'Lançado por'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{shown.map(entry => {
                const activity = workActivities.find(a => a.id === entry.activityId);
                const wagon = activity && wagonOf(activity.wagonId);
                return <tr key={entry.id}>
                  <th scope="row">{activity?.name ?? 'Atividade indisponível'}{wagon && <span className="mt-0.5 block text-xs font-normal text-slate-400">{wagonLabel(wagon.number)}</span>}</th>
                  <td className="whitespace-nowrap tabular-nums">{formatDate(entry.recordedDate)}</td>
                  <td className="tabular-nums">{Math.round(entry.progress)}%</td>
                  <td>{person(entry.recordedBy)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
      {entries.length > shown.length && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Mostrando os {shown.length} lançamentos mais recentes de {entries.length}. O histórico completo de cada atividade fica no detalhe do vagão.</p>}
    </section>

    <div className="my-6"><Callout tone="info">Cada lançamento fica registrado com a sua data: o percentual da atividade é sempre o valor corrente, e é a série datada que permite comparar uma semana com a anterior.</Callout></div>
  </>;
}

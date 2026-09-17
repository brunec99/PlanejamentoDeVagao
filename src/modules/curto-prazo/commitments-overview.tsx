'use client';
import Link from 'next/link';
import { useState } from 'react';
import { CommandForm, Field, Responsible, TextField, number, value } from '@/modules/planejamento/forms';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, Progress, StatCard } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { ppc } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { activityLabels, formatDate, formatTimestamp, wagonLabel, wagonPath } from '@/shared/format';

const weekLabel = (start: string) => `${formatDate(start)} a ${formatDate(addDays(start, 6))}`;

export function CommitmentsOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const [chosen, setChosen] = useState('');
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  if (!selected || !planning.data.users.find(u => u.id === context.actorId)?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data } = planning;
  const { work, wagons } = selected;

  const wagonOf = (wagonId: string) => wagons.find(w => w.id === wagonId);
  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? 'Responsável não informado';
  const wagonIds = new Set(wagons.map(w => w.id));
  const activities = data.activities.filter(a => wagonIds.has(a.wagonId)).sort((a, b) => (wagonOf(a.wagonId)?.number ?? 0) - (wagonOf(b.wagonId)?.number ?? 0) || a.name.localeCompare(b.name));
  const activityIds = new Set(activities.map(a => a.id));
  const commitments = data.commitments.filter(c => activityIds.has(c.activityId));

  const currentWeek = startOfWeek(planning.today);
  const weeks = [...new Set([currentWeek, ...commitments.map(c => c.weekStart)])].sort().reverse();
  const week = weeks.includes(chosen) ? chosen : currentWeek;
  const rows = commitments.filter(c => c.weekStart === week).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // PPC conta compromissos cumpridos sobre compromissos assumidos, não a média dos percentuais das atividades.
  const stats = ppc(rows);
  const unfulfilled = stats.planned - stats.fulfilled - stats.pending;
  const past = weeks.filter(w => w < currentWeek).sort();

  return <>
    <p className="eyebrow">{work.code}</p>
    <h1 className="page-title">Planejamento de curto prazo</h1>
    <p className="mt-1 text-sm text-slate-500">O compromisso semanal do Last Planner: a meta assumida para cada atividade, o que foi cumprido e a causa de cada não cumprimento.</p>

    <div className="mt-6 max-w-xs">
      <Field label="Semana do compromisso">
        <select className="field" value={week} onChange={e => setChosen(e.target.value)}>
          {weeks.map(w => <option key={w} value={w}>{weekLabel(w)}{w === currentWeek ? ' · semana atual' : ''}</option>)}
        </select>
      </Field>
    </div>

    <div data-tour="curto-ppc" className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Compromissos planejados" value={stats.planned} />
      <StatCard label="Cumpridos" value={stats.fulfilled} />
      <StatCard label="Não cumpridos" value={unfulfilled} tone={unfulfilled > 0 ? 'danger' : 'default'} />
      <StatCard label="PPC da semana" value={`${Math.round(stats.percent)}%`} tone={stats.pending > 0 ? 'warning' : 'default'} />
    </div>

    {stats.pending > 0 && <p className="mb-3 text-sm text-slate-500">{stats.pending} {stats.pending === 1 ? 'compromisso desta semana ainda não foi apurado' : 'compromissos desta semana ainda não foram apurados'} — o PPC só fecha quando todos tiverem resultado registrado.</p>}

    <Callout tone="info">O PPC conta compromissos: é o número de compromissos cumpridos dividido pelo número de compromissos assumidos na semana. Não é a média dos percentuais executados nas atividades — uma atividade só entra no numerador quando a meta assumida foi atingida.</Callout>

    <div className="my-6">
      <CommandForm title="Assumir compromisso da semana" submit="Assumir compromisso" command={d => ({ type: 'create_commitment', activityId: value(d, 'activityId'), weekStart: value(d, 'weekStart'), responsibleId: value(d, 'responsibleId'), targetProgress: number(d, 'targetProgress') })}>
        <Field label="Atividade">
          <select className="field" name="activityId" required defaultValue="">
            <option value="">Selecione</option>
            {activities.map(a => <option key={a.id} value={a.id}>{wagonLabel(wagonOf(a.wagonId)?.number ?? 0)} · {a.name} · {Math.round(a.progress)}% executado</option>)}
          </select>
        </Field>
        <Responsible workId={workId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="weekStart" label="Semana (qualquer dia dela)" type="date" defaultValue={week} />
          <TextField name="targetProgress" label="Meta da semana (%)" type="number" min={1} max={100} step="any" />
        </div>
        <p className="text-sm text-slate-600">A data é ajustada para a segunda-feira da semana. A meta precisa superar o percentual já executado, e cada atividade assume um único compromisso por semana.</p>
      </CommandForm>
    </div>

    <section className="panel overflow-hidden" aria-labelledby="commitments-title">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 id="commitments-title" className="text-sm font-bold text-slate-800">Compromissos de {weekLabel(week)}</h2>
        <p className="mt-0.5 text-xs text-slate-500">O cumprimento é registrado uma única vez por compromisso.</p>
      </div>
      {rows.length === 0
        ? <div className="p-5"><Empty>Nenhum compromisso assumido nesta semana.</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label={`Compromissos de ${weekLabel(week)}`} tabIndex={0}>
            <table data-tour="curto-commitments" className="data-table min-w-[1050px]">
              <thead><tr>{['Atividade', 'Vagão', 'Responsável', 'Meta', 'Progresso atual', 'Situação'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{rows.map(c => {
                const activity = activities.find(a => a.id === c.activityId)!;
                const wagon = wagonOf(activity.wagonId);
                return <tr key={c.id}>
                  <th scope="row" className="min-w-64">
                    <Link className="text-link" href={wagonPath(workId, activity.wagonId)}>{activity.name}</Link>
                    <p className="mt-0.5 text-xs font-normal text-slate-500">{data.locations.find(l => l.id === activity.locationId)?.name ?? 'Local não informado'} · {activityLabels[activity.status]}</p>
                  </th>
                  <td className="whitespace-nowrap">{wagon ? wagonLabel(wagon.number) : 'Vagão não encontrado'}</td>
                  <td>{person(c.responsibleId)}</td>
                  <td className="tabular-nums">{c.targetProgress}%</td>
                  <td><Progress value={activity.progress} label={`Progresso de ${activity.name}`} /></td>
                  <td className="min-w-72">
                    {c.fulfilled === true && <p className="font-semibold text-emerald-600">Cumprido</p>}
                    {c.fulfilled === false && <><p className="font-semibold text-rose-600">Não cumprido</p><p className="mt-1 text-sm">Causa: {c.cause}</p></>}
                    {c.fulfilled === undefined && <><span className="badge-muted">A apurar</span><FulfillmentActions commitmentId={c.id} /></>}
                    {typeof c.fulfilled === 'boolean' && c.recordedAt && <p className="mt-1 text-xs text-slate-500">Apurado por {person(c.recordedBy ?? '')} em {formatTimestamp(c.recordedAt)}</p>}
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
    </section>

    <section className="panel mt-6 overflow-hidden" aria-labelledby="history-title">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 id="history-title" className="text-sm font-bold text-slate-800">Histórico de PPC</h2>
        <p className="mt-0.5 text-xs text-slate-500">Semanas já encerradas, na ordem em que aconteceram.</p>
      </div>
      {past.length === 0
        ? <div className="p-5"><Empty>Nenhuma semana anterior com compromissos assumidos.</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Histórico de PPC por semana" tabIndex={0}>
            <table className="data-table min-w-[620px]">
              <thead><tr>{['Semana', 'Planejados', 'Cumpridos', 'PPC'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{past.map(w => {
                const history = ppc(commitments.filter(c => c.weekStart === w));
                return <tr key={w}>
                  <th scope="row" className="whitespace-nowrap tabular-nums">{weekLabel(w)}</th>
                  <td className="tabular-nums">{history.planned}{history.pending > 0 && <span className="block text-xs text-slate-400">{history.pending} a apurar</span>}</td>
                  <td className="tabular-nums">{history.fulfilled}</td>
                  <td className="font-semibold tabular-nums text-slate-800">{Math.round(history.percent)}%</td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
    </section>
  </>;
}

function FulfillmentActions({ commitmentId }: { commitmentId: string }) {
  return <div className="mt-3 space-y-2">
    <CommandForm title="Cumpriu a meta" submit="Registrar cumprimento" command={() => ({ type: 'record_fulfillment', commitmentId, fulfilled: true })}>
      <p className="text-sm">Confirme que a meta assumida foi atingida na semana.</p>
    </CommandForm>
    <CommandForm title="Não cumpriu a meta" submit="Registrar causa" command={d => ({ type: 'record_fulfillment', commitmentId, fulfilled: false, cause: value(d, 'cause') })}>
      <TextField name="cause" label="Causa do não cumprimento" />
    </CommandForm>
  </div>;
}

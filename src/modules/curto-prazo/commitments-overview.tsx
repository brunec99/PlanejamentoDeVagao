'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Check, CommandForm, Field, Responsible, TextField, checked, value } from '@/modules/planejamento/forms';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { NON_FULFILLMENT_CAUSES } from '@/domain/entities';
import { ppc } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { formatDate, formatTimestamp, wagonLabel, wagonPath } from '@/shared/format';

const WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;
const weekdayNames = { 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SÁB' } as const;
const dayMonth = (date: string) => formatDate(date).slice(0, 5);
const weekLabel = (start: string) => `${dayMonth(start)} a ${dayMonth(addDays(start, 5))}`;

export function CommitmentsOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const [chosen, setChosen] = useState('');
  const [wagonFilter, setWagonFilter] = useState('');
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  if (!selected || !planning.data.users.find(u => u.id === context.actorId)?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data } = planning;
  const { work, wagons } = selected;

  const wagonOf = (wagonId: string) => wagons.find(w => w.id === wagonId);
  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? 'Não informado';
  const wagonIds = new Set(wagons.map(w => w.id));
  const activities = data.activities.filter(a => wagonIds.has(a.wagonId)).sort((a, b) => (wagonOf(a.wagonId)?.number ?? 0) - (wagonOf(b.wagonId)?.number ?? 0) || a.name.localeCompare(b.name));
  const activityIds = new Set(activities.map(a => a.id));
  const commitments = data.commitments.filter(c => activityIds.has(c.activityId));

  const currentWeek = startOfWeek(planning.today);
  // A "Semana" da planilha é cumulativa: conta-se a partir da primeira semana planejada da obra.
  const firstWeek = startOfWeek(activities.reduce((earliest, a) => (a.plannedStart < earliest ? a.plannedStart : earliest), planning.today));
  const weekNumber = (start: string) => Math.floor((Date.parse(start) - Date.parse(firstWeek)) / 604800000) + 1;

  const weeks = [...new Set([currentWeek, ...commitments.map(c => c.weekStart)])].sort().reverse();
  const week = weeks.includes(chosen) ? chosen : currentWeek;
  const days = WEEKDAYS.map(day => ({ day, date: addDays(week, day - 1) }));
  const rows = commitments.filter(c => c.weekStart === week).sort((a, b) => a.company.localeCompare(b.company) || a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt));
  // O PPC conta compromissos cumpridos sobre assumidos, nunca a média dos percentuais executados.
  const stats = ppc(rows);
  const unfulfilled = stats.planned - stats.fulfilled - stats.pending;
  const filtered = wagonFilter ? activities.filter(a => a.wagonId === wagonFilter) : [];

  return <>
    <p className="eyebrow">{work.code}</p>
    <h1 className="page-title">Planejamento de curto prazo</h1>
    <p className="mt-1 text-sm text-slate-500">A planilha semanal de produção: empresa, período, atividade, equipe e os dias marcados da semana. O PPC sai da coluna Status — cada linha com Status “Sim” conta como compromisso cumprido.</p>

    <div className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="w-full max-w-xs">
        <Field label="Semana analisada">
          <select className="field" value={week} onChange={e => setChosen(e.target.value)}>
            {weeks.map(w => <option key={w} value={w}>{weekNumber(w)} · {weekLabel(w)}{w === currentWeek ? ' · semana atual' : ''}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-xs font-semibold text-slate-600">Semana atual: <span className="tabular-nums text-slate-900">{weekNumber(currentWeek)}</span> <span className="font-normal text-slate-500">({weekLabel(currentWeek)})</span></p>
    </div>
    <p className="mt-2 text-xs text-slate-500">A contagem de semanas começa na primeira semana planejada da obra — semana 1 = {weekLabel(firstWeek)}. A numeração da planilha original pode partir de outra origem.</p>

    <div data-tour="curto-ppc" className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Compromissos planejados" value={stats.planned} />
      <StatCard label="Cumpridos" value={stats.fulfilled} />
      <StatCard label="Não cumpridos" value={unfulfilled} tone={unfulfilled > 0 ? 'danger' : 'default'} />
      <StatCard label={`PPC da semana ${weekNumber(week)}`} value={`${Math.round(stats.percent)}%`} tone={stats.pending > 0 ? 'warning' : 'default'} />
    </div>

    {stats.pending > 0 && <p className="mb-3 text-sm text-slate-500">{stats.pending} {stats.pending === 1 ? 'linha desta semana ainda está sem Status' : 'linhas desta semana ainda estão sem Status'} — o PPC só fecha quando toda a coluna estiver preenchida.</p>}

    <Callout tone="info">O PPC conta compromissos: compromissos cumpridos divididos pelos compromissos assumidos na semana. Não é a média dos percentuais executados — uma linha só entra no numerador quando o Status é “Sim”.</Callout>

    <div className="my-6">
      <CommandForm title="Adicionar à semana" submit="Adicionar linha" command={d => ({ type: 'create_commitment', activityId: value(d, 'activityId'), weekStart: week, responsibleId: value(d, 'responsibleId'), company: value(d, 'company'), crew: value(d, 'crew'), startDate: value(d, 'startDate'), endDate: value(d, 'endDate'), weekdays: WEEKDAYS.filter(day => checked(d, `day${day}`)) })}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vagão">
            <select className="field" value={wagonFilter} onChange={e => setWagonFilter(e.target.value)}>
              <option value="">Selecione o vagão</option>
              {wagons.map(w => <option key={w.id} value={w.id}>{wagonLabel(w.number)}</option>)}
            </select>
          </Field>
          <Field label="Atividade">
            <select key={wagonFilter} className="field" name="activityId" required defaultValue="" disabled={!wagonFilter}>
              <option value="">{wagonFilter ? 'Selecione a atividade' : 'Selecione o vagão primeiro'}</option>
              {filtered.map(a => <option key={a.id} value={a.id}>{wagonLabel(wagonOf(a.wagonId)?.number ?? 0)} · {a.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="company" label="Empresa" />
          <TextField name="crew" label="Equipe" />
        </div>
        <Responsible workId={workId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField name="startDate" label="Início" type="date" defaultValue={week} min={week} max={addDays(week, 5)} />
          <TextField name="endDate" label="Término" type="date" defaultValue={addDays(week, 5)} min={week} max={addDays(week, 5)} />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-slate-600">Dias planejados</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">{days.map(({ day, date }) => <Check key={day} name={`day${day}`} label={`${weekdayNames[day]} ${dayMonth(date)}`} />)}</div>
        </fieldset>
        <p className="text-sm text-slate-600">A linha entra na semana {weekNumber(week)} ({weekLabel(week)}); o período precisa ficar dentro dela e ao menos um dia precisa estar marcado. Cada atividade tem uma única linha por semana.</p>
      </CommandForm>
    </div>

    <section className="panel overflow-hidden" aria-labelledby="sheet-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 id="sheet-title" className="text-sm font-bold text-slate-800">Planejamento e controle da produção · semana {weekNumber(week)}</h2>
          <p className="mt-0.5 text-xs text-slate-500">O Status é registrado uma única vez por linha; com “Não”, a causa vem da lista fechada de causas de não cumprimento.</p>
        </div>
        <span className="badge-muted">{rows.length} {rows.length === 1 ? 'linha' : 'linhas'}</span>
      </div>
      {rows.length === 0
        ? <div className="p-5"><Empty>Nenhuma linha nesta semana. Use “Adicionar à semana” para montar o planejamento semanal.</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label={`Planilha de produção da semana ${weekNumber(week)}`} tabIndex={0}>
            <table data-tour="curto-commitments" className="data-table min-w-[1560px]">
              <thead><tr>
                {['Empresa', 'Semana', 'Início', 'Término', 'Atividade', 'Equipe'].map(l => <th scope="col" key={l}>{l}</th>)}
                {days.map(({ day, date }) => <th scope="col" key={day} className="text-center whitespace-nowrap">{weekdayNames[day]}<span className="block font-semibold tabular-nums text-slate-500">{dayMonth(date)}</span></th>)}
                {['Status', 'Causas', 'Justificativa'].map(l => <th scope="col" key={l}>{l}</th>)}
              </tr></thead>
              <tbody>{rows.map(c => {
                const activity = activities.find(a => a.id === c.activityId)!;
                const wagon = wagonOf(activity.wagonId);
                return <tr key={c.id}>
                  <th scope="row" className="whitespace-nowrap">{c.company}</th>
                  <td className="tabular-nums">{weekNumber(c.weekStart)}</td>
                  <td className="whitespace-nowrap tabular-nums">{dayMonth(c.startDate)}</td>
                  <td className="whitespace-nowrap tabular-nums">{dayMonth(c.endDate)}</td>
                  <td className="min-w-64">
                    <Link className="text-link" href={wagonPath(workId, activity.wagonId)}>{activity.name}</Link>
                    <p className="mt-0.5 text-xs text-slate-500">{wagon ? wagonLabel(wagon.number) : 'Vagão não encontrado'} · {data.locations.find(l => l.id === activity.locationId)?.name ?? 'Local não informado'}</p>
                  </td>
                  <td className="whitespace-nowrap">{c.crew}<span className="mt-0.5 block text-xs text-slate-400">{person(c.responsibleId)}</span></td>
                  {days.map(({ day }) => c.weekdays.includes(day)
                    ? <td key={day} className="bg-blue-50 text-center font-bold text-blue-800">x</td>
                    : <td key={day} />)}
                  <td className="min-w-72">
                    {c.fulfilled === true && <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">Sim</span>}
                    {c.fulfilled === false && <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">Não</span>}
                    {c.fulfilled === undefined && <><span className="badge-muted">A apurar</span><Assessment commitmentId={c.id} /></>}
                    {typeof c.fulfilled === 'boolean' && c.recordedAt && <p className="mt-1 text-xs text-slate-500">Registrado por {person(c.recordedBy ?? '')} em {formatTimestamp(c.recordedAt)}</p>}
                  </td>
                  <td className="min-w-56">{c.cause ?? ''}</td>
                  <td className="min-w-64">{c.justification ?? ''}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
    </section>

    <section className="panel mt-6 overflow-hidden" aria-labelledby="history-title">
      <div className="border-b border-slate-100 px-5 py-3.5">
        <h2 id="history-title" className="text-sm font-bold text-slate-800">Histórico de PPC</h2>
        <p className="mt-0.5 text-xs text-slate-500">Uma linha por semana com compromissos, da mais recente para a mais antiga.</p>
      </div>
      {commitments.length === 0
        ? <div className="p-5"><Empty>Nenhuma semana com compromissos nesta obra.</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Histórico de PPC por semana" tabIndex={0}>
            <table className="data-table min-w-[620px]">
              <thead><tr>{['Semana', 'Planejados', 'Cumpridos', 'PPC'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{weeks.filter(w => commitments.some(c => c.weekStart === w)).map(w => {
                const history = ppc(commitments.filter(c => c.weekStart === w));
                return <tr key={w}>
                  <th scope="row" className="whitespace-nowrap tabular-nums">{weekNumber(w)} <span className="font-normal text-slate-500">· {weekLabel(w)}</span></th>
                  <td className="tabular-nums">{history.planned}{history.pending > 0 && <span className="block text-xs text-slate-400">{history.pending} sem Status</span>}</td>
                  <td className="tabular-nums">{history.fulfilled}</td>
                  <td className="font-semibold tabular-nums text-slate-800">{Math.round(history.percent)}%</td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
    </section>
  </>;
}

function Assessment({ commitmentId }: { commitmentId: string }) {
  return <div className="mt-3 space-y-2">
    <CommandForm title="Cumpriu" submit="Registrar Sim" command={() => ({ type: 'record_fulfillment', commitmentId, fulfilled: true })}>
      <p className="text-sm">Confirme que o planejado da semana foi executado.</p>
    </CommandForm>
    <CommandForm title="Não cumpriu" submit="Registrar Não" command={d => ({ type: 'record_fulfillment', commitmentId, fulfilled: false, cause: value(d, 'cause'), justification: value(d, 'justification') })}>
      <Field label="Causas">
        <select className="field" name="cause" required defaultValue="">
          <option value="">Selecione a causa</option>
          {NON_FULFILLMENT_CAUSES.map(cause => <option key={cause} value={cause}>{cause}</option>)}
        </select>
      </Field>
      <TextField name="justification" label="Justificativa (opcional)" required={false} />
    </CommandForm>
  </div>;
}

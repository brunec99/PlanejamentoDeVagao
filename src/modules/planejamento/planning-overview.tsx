'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Download, Wallet } from 'lucide-react';
import { PlanningActions } from './planning-actions';
import { usePlanning } from './planning-provider';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatDate, releaseLabels, wagonLabel, wagonPath } from '@/shared/format';
import { LoadState, Missing, Status, Progress, Empty, Callout, StatCard } from './ui';

export function PlanningOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const [showPast, setShowPast] = useState(false);
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  if (!selected || !planning.data.users.find(u => u.id === context.actorId)?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { work, wagons, sequences, debts } = selected;
  const { data, today } = planning;

  const isPast = (w: { plannedEnd: string }) => w.plannedEnd < today;
  const pastCount = wagons.filter(isPast).length;
  const openDebts = debts.filter(d => data.pendingItems.some(p => p.id === d.pendingItemId && p.status === 'open')).length;

  return <>
    <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800" href="/obras"><ArrowLeft size={15} />Obras</Link>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">Planejamento por período · {work.code}</p>
        <h1 className="page-title">{work.name}</h1>
        <p className="mt-1 text-sm text-slate-500">Cada vagão reúne as atividades previstas entre seus marcos de início e término.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link className="button-ghost" href={`/obras/${workId}/dividas`}><Wallet size={15} />Dívidas</Link>
        <Link className="button" href={`/obras/${workId}/importar`}><Download size={15} />Importar do Prevision</Link>
      </div>
    </div>

    <div className="my-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Vagões planejados" value={wagons.length} />
      <StatCard label="Terminais" value={wagons.filter(w => w.status === 'terminal').length} />
      <StatCard label="Takt vencido" value={wagons.filter(w => w.overdue).length} tone={wagons.some(w => w.overdue) ? 'warning' : 'default'} />
      <StatCard label="Dívidas abertas" value={openDebts} tone={openDebts > 0 ? 'danger' : 'default'} />
    </div>

    <PlanningActions workId={workId} />

    {sequences.length === 0 && <div className="panel p-6"><h2 className="mb-1 text-sm font-bold text-slate-800">Nenhum vagão planejado</h2><Empty>Esta obra ainda não possui sequências de produção.</Empty></div>}

    {pastCount > 0 && <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
      <span className="text-slate-500">{pastCount} {pastCount === 1 ? 'vagão encerrou' : 'vagões encerraram'} antes de hoje ({formatDate(today)}).</span>
      <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-600">
        <input type="checkbox" className="accent-blue-700" checked={showPast} onChange={e => setShowPast(e.target.checked)} />Mostrar passado
      </label>
    </div>}

    <div className="space-y-5">{sequences.map(sequence => {
      const all = wagons.filter(w => w.sequenceId === sequence.id);
      const rows = showPast ? all : all.filter(w => !isPast(w));
      return <section key={sequence.id} className="panel overflow-hidden" aria-labelledby={`title-${sequence.id}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 id={`title-${sequence.id}`} className="text-sm font-bold text-slate-800">{sequence.name}</h2>
          <span className="badge-muted">Takt {sequence.defaultTaktDays} dias {sequence.calendar === 'calendar_days' ? 'corridos' : 'úteis'}</span>
        </div>
        {rows.length === 0
          ? <div className="p-5"><Empty>{all.length === 0 ? 'Nenhum vagão nesta sequência.' : 'Todos os vagões desta sequência já são passado. Marque "Mostrar passado" para vê-los.'}</Empty></div>
          : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label={`Vagões de ${sequence.name}`} tabIndex={0}>
              <table className="data-table min-w-[900px]">
                <thead><tr>{['Vagão', 'Período previsto', 'Atividades', 'Progresso', 'Status', 'Prazo', 'Liberação'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
                <tbody>{rows.map(w => {
                  const release = data.releases.find(r => r.wagonId === w.id);
                  const past = isPast(w);
                  return <tr key={w.id} className={past ? 'opacity-60' : undefined}>
                    <th scope="row"><Link className="text-link whitespace-nowrap" href={wagonPath(workId, w.id)}>{wagonLabel(w.number)}</Link>{past && <span className="mt-0.5 block text-[11px] font-normal text-slate-400">passado</span>}</th>
                    <td className="whitespace-nowrap tabular-nums">{formatDate(w.plannedStart)}<span className="block text-xs text-slate-400">até {formatDate(w.plannedEnd)}</span></td>
                    <td className="tabular-nums">{data.activities.filter(a => a.wagonId === w.id).length}</td>
                    <td><Progress value={w.progress} label={`Progresso do ${wagonLabel(w.number)}`} /></td>
                    <td><Status status={w.status} /></td>
                    <td className={w.overdue ? 'font-semibold text-rose-600' : ''}>{w.overdue ? 'Atrasado' : w.status === 'terminal' ? 'Encerrado' : 'Dentro do prazo'}</td>
                    <td>{release ? releaseLabels[release.type] : <span className="text-slate-400">Aguardando</span>}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
      </section>;
    })}</div>

    <div className="mt-5"><Callout tone="info">O término do takt não conclui o vagão. A terminalidade depende das atividades obrigatórias, dos critérios e dos bloqueios em aberto.</Callout></div>
  </>;
}

'use client';
import Link from 'next/link';
import { PlanningActions } from './planning-actions';
import { usePlanning } from './planning-provider';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatDate, releaseLabels, wagonLabel, wagonPath } from '@/shared/format';
import { LoadState, Missing, Status, Progress, Empty } from './ui';
export function PlanningOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  if (!selected || !planning.data.users.find(u => u.id === context.actorId)?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { work, wagons, sequences, debts } = selected;
  const { data } = planning;
  return <><nav aria-label="Navegação estrutural" className="mb-6 text-sm"><Link className="text-link" href="/obras">Obras</Link><span className="mx-2" aria-hidden="true">/</span><span>{work.name}</span></nav><p className="eyebrow">Planejamento por período</p><h1 className="page-title">{work.name}</h1><p className="mt-2 text-slate-600">Cada vagão reúne as atividades previstas entre seus marcos de início e término.</p><div className="my-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
    ['Vagões planejados', wagons.length], ['Terminais', wagons.filter(w => w.status === 'terminal').length], ['Takt vencido', wagons.filter(w => w.overdue).length], ['Dívidas abertas', debts.filter(d => data.pendingItems.some(p => p.id === d.pendingItemId && p.status === 'open')).length],
  ].map(([label, value]) => <div key={label} className="panel p-5"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p></div>)}</div>
  <div className="mb-5 flex flex-wrap gap-5 text-sm"><Link className="text-link" href={`/obras/${workId}/dividas`}>Dívidas de terminalidade →</Link><Link className="text-link" href="/integracoes">Importar do Prevision →</Link></div><PlanningActions workId={workId}/>{sequences.length === 0 && <div className="panel p-6"><h2 className="mb-2 text-lg font-semibold">Nenhum vagão planejado</h2><Empty>Esta obra ainda não possui sequências de produção.</Empty></div>}
  <div className="space-y-6">{sequences.map(sequence => <section key={sequence.id} className="panel overflow-hidden" aria-labelledby={`title-${sequence.id}`}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5"><h2 id={`title-${sequence.id}`} className="text-lg font-semibold">{sequence.name}</h2><span className="text-sm text-slate-600">Takt padrão: {sequence.defaultTaktDays} dias {sequence.calendar === 'calendar_days' ? 'corridos' : 'úteis'}</span></div>{!wagons.some(w => w.sequenceId === sequence.id) ? <div className="p-5"><Empty>Nenhum vagão nesta sequência.</Empty></div> : <div className="overflow-x-auto" role="region" aria-label={`Vagões de ${sequence.name}`} tabIndex={0}><table className="data-table min-w-[1000px]"><caption className="sr-only">Vagões temporais com progresso, status, prazo e liberação separados</caption><thead><tr>{['Vagão', 'Período previsto', 'Atividades', 'Progresso', 'Status', 'Prazo', 'Liberação'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{wagons.filter(w => w.sequenceId === sequence.id).map(w => {
    const release = data.releases.find(r => r.wagonId === w.id);
    return <tr key={w.id}><th scope="row"><Link className="text-link whitespace-nowrap" href={wagonPath(workId, w.id)}>{wagonLabel(w.number)} →</Link></th><td className="whitespace-nowrap tabular-nums">{formatDate(w.plannedStart)}<br/><span className="text-slate-500">até {formatDate(w.plannedEnd)}</span></td><td>{data.activities.filter(a => a.wagonId === w.id).length}</td><td><Progress value={w.progress} label={`Progresso do ${wagonLabel(w.number)}`} /></td><td><Status status={w.status} /></td><td className={w.overdue ? 'font-medium text-rose-700' : 'text-slate-600'}>{w.overdue ? 'Atrasado' : w.status === 'terminal' ? 'Encerrado' : 'Dentro do prazo'}</td><td>{release ? releaseLabels[release.type] : 'Aguardando'}</td></tr>;
  })}</tbody></table></div>}</section>)}</div><p className="mt-6 border-l-4 border-blue-700 bg-blue-50 p-4 text-sm leading-6 text-blue-950">O término do takt não conclui o vagão. A terminalidade depende das atividades obrigatórias, dos critérios e dos bloqueios em aberto.</p></>;
}

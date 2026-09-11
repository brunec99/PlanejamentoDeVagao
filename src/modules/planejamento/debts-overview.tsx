'use client';
import Link from 'next/link';
import { useState } from 'react';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { usePlanning } from './planning-provider';
import { Empty, LoadState, Missing } from './ui';
import { ResolveAction } from './wagon-actions';
import { formatDate, planningPath, wagonLabel, wagonPath } from '@/shared/format';
export function DebtsOverview({workId}:{workId:string}){
  const c=usePlanning();const[filter,setFilter]=useState('open');
  if(c.state!=='ready')return <LoadState error={c.state==='error'}/>;
  const {data,today}=c.planning;const selected=selectWorkPlanning(c.planning,workId);
  if(!selected||!data.users.find(u=>u.id===c.actorId)?.workIds.includes(workId))return <Missing label="Obra não encontrada"/>;
  const debts=selected.debts.filter(d=>{const p=data.pendingItems.find(p=>p.id===d.pendingItemId)!;return filter==='all'||(filter==='resolved'?p.status==='resolved':p.status==='open'&&(filter!=='overdue'||d.dueDate<today));});
  return <><Link className="text-link text-sm" href={planningPath(workId)}>← {selected.work.name}</Link><p className="eyebrow mt-6">Terminalidade</p><h1 className="page-title">Dívidas de terminalidade</h1><p className="mt-2 text-slate-600">Pendências mantidas após a liberação dos períodos seguintes.</p><label data-tour="dividas-filter" className="my-6 flex items-center gap-3 text-sm">Situação<select className="field max-w-56" value={filter} onChange={e=>setFilter(e.target.value)}><option value="open">Abertas</option><option value="overdue">Vencidas</option><option value="resolved">Resolvidas</option><option value="all">Todas</option></select></label><div data-tour="dividas-list" className="space-y-4">{debts.length===0&&<div className="panel p-6"><Empty>Nenhuma dívida nesta situação.</Empty></div>}{debts.map(debt=>{const pending=data.pendingItems.find(p=>p.id===debt.pendingItemId)!;const origin=data.wagons.find(w=>w.id===pending.wagonId)!;const release=data.releases.find(r=>r.id===debt.releaseId)!;const next=data.wagons.find(w=>w.id===release.wagonId)!;return <article className="panel p-5" key={debt.id}><div className="flex flex-wrap justify-between gap-3"><h2 className="text-lg font-semibold">{pending.description}</h2><span className={`status ${pending.status==='resolved'?'terminal':'restricted'}`}>{pending.status==='resolved'?'Resolvida':debt.dueDate<today?'Vencida':'Aberta'}</span></div><p className="mt-3 text-sm">Origem: <Link className="text-link" href={wagonPath(workId,origin.id)}>{wagonLabel(origin.number)}</Link> · gerada ao liberar <Link className="text-link" href={wagonPath(workId,next.id)}>{wagonLabel(next.number)}</Link>.</p><p className="mt-2 text-sm text-slate-600">{data.users.find(u=>u.id===debt.responsibleId)?.name} · prazo assumido: {formatDate(debt.dueDate)}</p>{pending.status==='open'?<ResolveAction id={pending.id} kind="pending"/>:<p className="mt-3 text-sm">Resolução: {pending.resolution??'Registrada'}</p>}</article>;})}</div></>;
}

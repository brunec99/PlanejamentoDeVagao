'use client';
import Link from 'next/link';
import { WorkActions } from '@/modules/planejamento/planning-actions';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { LoadState } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { planningPath } from '@/shared/format';
export function WorksOverview() {
  const context = usePlanning();
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  return <><p className="eyebrow">Planejamento de produção</p><h1 className="page-title">Obras</h1><p className="mt-2 text-slate-600">Selecione uma obra para acompanhar seus ciclos de produção.</p><WorkActions/><div className="mt-8 grid gap-5 md:grid-cols-2">{planning.data.works.filter(w => planning.data.users.find(u => u.id === context.actorId)?.workIds.includes(w.id)).map(work => {
    const selected = selectWorkPlanning(planning, work.id)!;
    return <article className="panel p-6" key={work.id}><p className="eyebrow">{work.code}</p><h2 className="mt-3 text-xl font-semibold"><Link className="text-link" href={planningPath(work.id)}>{work.name}</Link></h2><p className="mt-2 text-slate-600">{work.description}</p><dl className="mt-6 flex gap-8 text-sm"><div><dt className="text-slate-500">Vagões</dt><dd className="mt-1 text-2xl font-semibold">{selected.wagons.length}</dd></div><div><dt className="text-slate-500">Terminais</dt><dd className="mt-1 text-2xl font-semibold">{selected.wagons.filter(w => w.status === 'terminal').length}</dd></div></dl><Link className="mt-6 inline-block text-link" href={planningPath(work.id)}>Abrir planejamento →</Link></article>;
  })}</div></>;
}

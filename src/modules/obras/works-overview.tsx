'use client';
import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';
import { WorkActions } from '@/modules/planejamento/planning-actions';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Empty, LoadState } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { planningPath } from '@/shared/format';

export function WorksOverview() {
  const context = usePlanning();
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const actor = planning.data.users.find(u => u.id === context.actorId);
  const works = planning.data.works.filter(w => actor?.workIds.includes(w.id));
  return <>
    <p className="eyebrow">Planejamento de produção</p>
    <h1 className="page-title">Obras</h1>
    <p className="mt-1 text-sm text-slate-500">Selecione uma obra para acompanhar seus ciclos de produção.</p>
    {actor?.role === 'manager' && <div data-tour="obras-actions"><WorkActions /></div>}
    {works.length === 0
      ? <div className="panel mt-6 p-6"><Empty>Você ainda não tem acesso a nenhuma obra. Peça a um administrador para liberar em Configurações.</Empty></div>
      : <div data-tour="obras-grid" className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{works.map(work => {
          const selected = selectWorkPlanning(planning, work.id)!;
          const terminais = selected.wagons.filter(w => w.status === 'terminal').length;
          const atividades = planning.data.activities.filter(a => selected.wagons.some(w => w.id === a.wagonId)).length;
          return <Link href={planningPath(work.id)} key={work.id} className="card-accent group border-blue-100 transition-shadow hover:shadow-md">
            <div className="card-accent-bar from-blue-500 to-cyan-400" />
            <div className="flex items-start justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="eyebrow">{work.code}</p>
                <h2 className="mt-1.5 truncate text-base font-bold text-slate-900">{work.name}</h2>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Building2 size={17} /></span>
            </div>
            <dl className="mx-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
              <div><dt className="text-[11px] font-medium text-slate-400">Vagões</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{selected.wagons.length}</dd></div>
              <div><dt className="text-[11px] font-medium text-slate-400">Terminais</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{terminais}</dd></div>
              <div><dt className="text-[11px] font-medium text-slate-400">Atividades</dt><dd className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{atividades}</dd></div>
            </dl>
            <span className="mx-5 mb-5 mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700">Abrir planejamento <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
          </Link>;
        })}</div>}
  </>;
}

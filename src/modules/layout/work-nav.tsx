'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TrendingUp, CalendarRange, ClipboardCheck, TrainFront, Boxes, Layers, Wallet, RefreshCw } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { workPath } from '@/shared/format';

const sections = [
  { section: 'longo-prazo', label: 'Planejamento de longo prazo', Icon: TrendingUp },
  { section: 'medio-prazo', label: 'Planejamento de médio prazo', Icon: CalendarRange },
  { section: 'curto-prazo', label: 'Planejamento de curto prazo', Icon: ClipboardCheck },
  { section: 'vagoes', label: 'Vagões', Icon: TrainFront },
  { section: 'ifc', label: 'Modelos IFC', Icon: Boxes },
  { section: 'federacao', label: 'Modelo federado', Icon: Layers },
  { section: 'quatro-d', label: 'BIM 4D', Icon: Layers },
  { section: 'dividas', label: 'Dívidas', Icon: Wallet },
  { section: 'importar', label: 'Integrações', Icon: RefreshCw },
];

export function WorkNav() {
  const pathname = usePathname();
  const context = usePlanning();
  const workId = pathname.match(/^\/obras\/([^/]+)/)?.[1];
  if (!workId) return null;
  const work = context.state === 'ready' ? context.planning.data.works.find(w => w.id === decodeURIComponent(workId)) : undefined;
  return <div data-tour="work-nav">
    <p className="eyebrow mb-1 mt-5 truncate px-3" title={work?.name}>{work ? work.name : 'Obra'}</p>
    <div className="space-y-0.5">
      {sections.map(({ section, label, Icon }) => {
        const href = workPath(workId, section);
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={section} href={href} aria-current={active ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium leading-snug transition-all ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
          <Icon size={17} className={`shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />{label}
        </Link>;
      })}
    </div>
  </div>;
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { workPath } from '@/shared/format';

const sections = [
  { section: 'longo-prazo', label: 'Planejamento de longo prazo' },
  { section: 'medio-prazo', label: 'Planejamento de médio prazo' },
  { section: 'curto-prazo', label: 'Planejamento de curto prazo' },
  { section: 'vagoes', label: 'Vagões' },
  { section: 'dividas', label: 'Dívidas' },
  { section: 'importar', label: 'Integrações' },
];

export function WorkNav({ workId }: { workId: string }) {
  const pathname = usePathname();
  return <nav data-tour="work-nav" aria-label="Seções da obra" className="mb-6 flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
    {sections.map(({ section, label }) => {
      const href = workPath(workId, section);
      const active = pathname === href || pathname.startsWith(`${href}/`);
      return <Link key={section} href={href} aria-current={active ? 'page' : undefined}
        className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
        {label}
      </Link>;
    })}
  </nav>;
}

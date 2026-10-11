import Link from 'next/link';
import { workPath } from '@/shared/format';

export const CURTO_SECTIONS = [
  { id: 'planilha', label: 'Planilha da semana' },
  { id: 'fechamento', label: 'Fechamento' },
] as const;
export type CurtoSection = (typeof CURTO_SECTIONS)[number]['id'];
export const isCurtoSection = (value: string | undefined): value is CurtoSection => CURTO_SECTIONS.some(s => s.id === value);

/** As duas seções da aba 4 na URL (`?secao=`), como o médio prazo faz: a planilha sozinha na página e o
 * fechamento (série do PPC, Pareto) à parte. */
export function SectionNav({ workId, section }: { workId: string; section: CurtoSection }) {
  const base = workPath(workId, 'curto-prazo');
  return (
    <nav aria-label="Seções do curto prazo" className="inline-flex rounded-lg border border-slate-200 bg-slate-100/70 p-1">
      {CURTO_SECTIONS.map(s => (
        <Link
          key={s.id}
          href={s.id === 'planilha' ? base : `${base}?secao=${s.id}`}
          aria-current={section === s.id ? 'page' : undefined}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${section === s.id ? 'bg-white text-primary-ink shadow-sm ring-1 ring-primary-ring' : 'text-slate-600 hover:text-slate-900'}`}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}

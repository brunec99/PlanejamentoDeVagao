'use client';
import type { MouseEvent } from 'react';
import { workPath } from '@/shared/format';

export const CURTO_SECTIONS = [
  { id: 'planilha', label: 'Planilha da semana' },
  { id: 'fechamento', label: 'Fechamento' },
] as const;
export type CurtoSection = (typeof CURTO_SECTIONS)[number]['id'];
export const isCurtoSection = (value: string | undefined): value is CurtoSection => CURTO_SECTIONS.some(s => s.id === value);

/** Troca de seção sem o servidor: `pushState` entra no roteador do Next e atualiza o
 * `useSearchParams` de `CurtoPrazoSections`; Voltar e Avançar seguem funcionando, porque o popstate
 * é tratado pelo próprio Next. Clique do meio, Ctrl/Cmd/Shift+clique e "abrir em nova aba" ficam
 * com o `<a href>` real. Na seção já aberta não se empilha histórico. */
function switchSection(event: MouseEvent<HTMLAnchorElement>, href: string, current: boolean) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (!current) window.history.pushState(null, '', href);
}

/** As duas seções da aba 4 na URL (`?secao=`), como o médio prazo faz: a planilha sozinha na página e o
 * fechamento (série do PPC, Pareto) à parte. */
export function SectionNav({ workId, section }: { workId: string; section: CurtoSection }) {
  const base = workPath(workId, 'curto-prazo');
  return (
    <nav
      data-tour="curto-secoes"
      aria-label="Seções do curto prazo"
      className="inline-flex rounded-lg border border-slate-200 bg-slate-100/70 p-1"
    >
      {CURTO_SECTIONS.map(s => {
        const href = s.id === 'planilha' ? base : `${base}?secao=${s.id}`;
        const current = section === s.id;
        return (
          <a
            key={s.id}
            href={href}
            onClick={event => switchSection(event, href, current)}
            aria-current={current ? 'page' : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${current ? 'bg-white text-primary-ink shadow-sm ring-1 ring-primary-ring' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {s.label}
          </a>
        );
      })}
    </nav>
  );
}

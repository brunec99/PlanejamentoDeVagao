'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { useDeveloper, usePlanning } from '@/modules/planejamento/planning-provider';
import { SUPPORT, WORK_TABS } from '@/modules/layout/work-nav';
import { workPath } from '@/shared/format';

type Crumb = { label: string; href?: string };

/** A trilha "Obras › obra › aba" sai do endereço e do planejamento já carregado: nenhuma tela
 * precisa declarar a própria. Enquanto o planejamento carrega, a obra aparece só como "Obra". */
function useCrumbs(): Crumb[] {
  const pathname = usePathname();
  const context = usePlanning();
  // A obra abre na mesma aba que o cartão da lista de obras: o curto prazo fora do desenvolvimento.
  const landing = useDeveloper() ? 'longo-prazo' : 'curto-prazo';
  const data = context.state === 'ready' ? context.planning.data : undefined;
  if (pathname.startsWith('/configuracoes')) return [{ label: 'Configurações' }];
  const match = pathname.match(/^\/obras\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/);
  if (!match) return [{ label: 'Obras' }];
  const workId = decodeURIComponent(match[1]);
  const [, , section, child] = match;
  const work = data?.works.find(w => w.id === workId);
  const crumbs: Crumb[] = [
    { label: 'Obras', href: '/obras' },
    { label: work?.name ?? 'Obra', href: section && section !== landing ? workPath(workId, landing) : undefined },
  ];
  const tab = WORK_TABS.find(t => t.section === section) ?? SUPPORT.find(s => s.section === section);
  if (tab) crumbs.push({ label: 'short' in tab ? tab.short : tab.label, href: child ? workPath(workId, section) : undefined });
  if (section === 'vagoes' && child) {
    const wagon = data?.wagons.find(w => w.id === decodeURIComponent(child));
    crumbs.push({ label: wagon ? `Vagão ${String(wagon.number).padStart(2, '0')}` : 'Vagão' });
  }
  return crumbs;
}

/** Cabeçalho fixo, translúcido, como o do Takt Hub: a trilha diz onde se está e os atalhos (modo
 * reunião, ajuda) ficam à mão em telas longas sem roubar espaço. No celular só a página atual
 * aparece na trilha; o resto está no menu. */
export function TopBar({ start, end }: { start?: React.ReactNode; end?: React.ReactNode }) {
  const crumbs = useCrumbs();
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200/80 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-5 md:px-8">
        {start}
        <nav aria-label="Trilha" className="min-w-0 flex-1">
          <ol className="flex items-center gap-1.5 truncate text-sm text-slate-500">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className={`min-w-0 items-center gap-1.5 ${last ? 'flex' : 'hidden sm:flex'}`}>
                  {index > 0 && <ChevronRight aria-hidden size={14} className="hidden shrink-0 text-slate-300 sm:block" />}
                  {crumb.href && !last ? (
                    <Link href={crumb.href} className="truncate transition-colors hover:text-primary">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? 'page' : undefined} className="truncate font-semibold text-primary-ink">
                      {crumb.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        {end && <div className="flex shrink-0 items-center gap-1">{end}</div>}
      </div>
    </header>
  );
}

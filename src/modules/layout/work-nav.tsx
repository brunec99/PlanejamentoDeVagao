'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Boxes, Layers, Wallet, RefreshCw, Settings2 } from 'lucide-react';
import { useDeveloper, usePlanning } from '@/modules/planejamento/planning-provider';
import { RESTRICTED_SECTIONS } from '@/application/module-access';
import { workPath } from '@/shared/format';

/** As quatro abas do sistema, na ordem em que o planejamento desce do macro para a semana. O número
 * faz parte do nome: é assim que a equipe se refere a elas. Em 02/10/2026 o usuário cancelou o BIM 4D
 * e concentrou o sistema nestes quatro níveis; o modelo federado e os arquivos IFC seguem como apoio. */
export const WORK_TABS = [
  { section: 'longo-prazo', short: 'Longo prazo', label: 'Cronograma de longo prazo', hint: 'Fluxograma · Linha de balanço · Restrições' },
  { section: 'vagoes', short: 'Vagões', label: 'Planejamento por vagões', hint: 'Períodos de takt · Terminalidade' },
  { section: 'medio-prazo', short: 'Médio prazo', label: 'Cronograma de médio prazo', hint: 'Gantt · Recursos · Linha de base' },
  { section: 'curto-prazo', short: 'Curto prazo', label: 'Cronograma de curto prazo', hint: 'Planilha semanal · PPC · Causas' },
] as const;

/** Telas de apoio: alimentam as abas, mas não são um nível de planejamento. */
export const SUPPORT = [
  { section: 'federacao', label: 'Modelo federado', Icon: Layers },
  { section: 'ifc', label: 'Arquivos IFC', Icon: Boxes },
  { section: 'dividas', label: 'Dívidas', Icon: Wallet },
  { section: 'importar', label: 'Integrações', Icon: RefreshCw },
  { section: 'configuracoes', label: 'Configurações da obra', Icon: Settings2 },
];

const restricted = new Set<string>(RESTRICTED_SECTIONS);

function useWork() {
  const pathname = usePathname();
  const context = usePlanning();
  const developer = useDeveloper();
  // Fora do desenvolvimento, só as seções abertas no go-live; o número segue o da aba.
  const tabs = WORK_TABS.map((tab, index) => ({ ...tab, number: index + 1 })).filter(t => developer || !restricted.has(t.section));
  const support = SUPPORT.filter(s => developer || !restricted.has(s.section));
  const workId = pathname.match(/^\/obras\/([^/]+)/)?.[1];
  const work = workId && context.state === 'ready' ? context.planning.data.works.find(w => w.id === decodeURIComponent(workId)) : undefined;
  const isActive = (section: string) => {
    const href = workPath(workId ?? '', section);
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  return { workId, work, isActive, tabs, support };
}

export function WorkNav() {
  const { workId, work, isActive, tabs, support } = useWork();
  if (!workId) return null;
  return (
    <div data-tour="work-nav">
      <p className="nav-label mb-1.5 mt-6 truncate px-3" title={work?.name}>
        {work ? work.name : 'Obra'}
      </p>
      <ol className="space-y-0.5">
        {tabs.map(({ section, label, hint, number }) => {
          const active = isActive(section);
          return (
            <li key={section}>
              <Link
                href={workPath(workId, section)}
                aria-current={active ? 'page' : undefined}
                // O item aceso ganha o fundo claro e um traço na borda do menu, como no Takt Hub: dá
                // para achar "onde estou" de relance.
                className={`relative flex items-start gap-3 rounded-lg px-3 py-2 transition-colors ${active ? 'bg-white/12 shadow-sm ring-1 ring-white/10 before:absolute before:top-1/2 before:-left-3 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-brand-300' : 'hover:bg-white/6'}`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-xs font-bold ${active ? 'bg-brand-300 text-brand-950' : 'bg-white/10 text-brand-200'}`}
                >
                  {number}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold leading-snug ${active ? 'text-white' : 'text-brand-50/90'}`}>{label}</span>
                  <span className={`block truncate text-xs leading-4 ${active ? 'text-brand-200' : 'text-brand-300/75'}`}>{hint}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="nav-label mb-1.5 mt-6 px-3">Apoio</p>
      <div className="space-y-0.5">
        {support.map(({ section, label, Icon }) => {
          const active = isActive(section);
          return (
            <Link
              key={section}
              href={workPath(workId, section)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-white/12 text-white before:absolute before:top-1/2 before:-left-3 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-brand-300' : 'text-brand-100/80 hover:bg-white/6 hover:text-white'}`}
            >
              <Icon size={15} className={`shrink-0 ${active ? 'text-brand-300' : 'text-brand-300/70'}`} />
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** No celular a lateral vira a gaveta do menu; as quatro abas também ficam numa faixa rolável sob
 * o cabeçalho, para a troca de nível não exigir abrir o menu. */
export function WorkTabsMobile() {
  const { workId, isActive, tabs } = useWork();
  const strip = useRef<HTMLElement>(null);
  const pathname = usePathname();
  // A aba aberta rola para a vista: no celular o curto prazo, a única liberada em produção, ficava
  // fora da tela à direita e a faixa parecia não marcar onde se está.
  useEffect(() => {
    const active = strip.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (active && strip.current) strip.current.scrollLeft = active.offsetLeft - 12;
  }, [pathname]);
  if (!workId) return null;
  return (
    <nav
      ref={strip}
      aria-label="Abas da obra"
      className="custom-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white/90 px-3 py-2 backdrop-blur md:hidden"
    >
      {tabs.map(({ section, short, number }) => {
        const active = isActive(section);
        return (
          <Link
            key={section}
            href={workPath(workId, section)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${active ? 'bg-primary-soft text-primary-ink ring-1 ring-primary-ring' : 'text-slate-600'}`}
          >
            <span
              aria-hidden
              className={`grid h-5 w-5 place-items-center rounded-md text-xs ${active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              {number}
            </span>
            {short}
          </Link>
        );
      })}
    </nav>
  );
}

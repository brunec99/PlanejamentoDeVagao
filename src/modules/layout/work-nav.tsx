'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Boxes, Wallet, RefreshCw, Settings2 } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { workPath } from '@/shared/format';

/** As seis abas do sistema, na ordem em que o planejamento desce do macro para a semana e depois
 * sobe para o modelo. O número faz parte do nome: é assim que a equipe se refere a elas. */
export const WORK_TABS = [
  { section: 'longo-prazo', short: 'Longo prazo', label: 'Cronograma de longo prazo', hint: 'Fluxograma · Linha de balanço · Restrições' },
  { section: 'vagoes', short: 'Vagões', label: 'Planejamento por vagões', hint: 'Períodos de takt · Terminalidade' },
  { section: 'medio-prazo', short: 'Médio prazo', label: 'Cronograma de médio prazo', hint: 'Gantt · Recursos · Linha de base' },
  { section: 'curto-prazo', short: 'Curto prazo', label: 'Cronograma de curto prazo', hint: 'Planilha semanal · PPC · Causas' },
  { section: 'federacao', short: 'Federado', label: 'Modelo federado', hint: 'Modelos IFC integrados' },
  { section: 'quatro-d', short: 'BIM 4D', label: 'BIM 4D', hint: 'Simulação cronograma × modelo' },
] as const;

/** Telas de apoio: alimentam as abas, mas não são um nível de planejamento. */
const SUPPORT = [
  { section: 'ifc', label: 'Arquivos IFC', Icon: Boxes },
  { section: 'dividas', label: 'Dívidas', Icon: Wallet },
  { section: 'importar', label: 'Integrações', Icon: RefreshCw },
  { section: 'configuracoes', label: 'Configurações da obra', Icon: Settings2 },
];

function useWork() {
  const pathname = usePathname();
  const context = usePlanning();
  const workId = pathname.match(/^\/obras\/([^/]+)/)?.[1];
  const work = workId && context.state === 'ready' ? context.planning.data.works.find(w => w.id === decodeURIComponent(workId)) : undefined;
  const isActive = (section: string) => { const href = workPath(workId ?? '', section); return pathname === href || pathname.startsWith(`${href}/`); };
  return { workId, work, isActive };
}

export function WorkNav() {
  const { workId, work, isActive } = useWork();
  if (!workId) return null;
  return <div data-tour="work-nav">
    <p className="eyebrow mb-1 mt-5 truncate px-3" title={work?.name}>{work ? work.name : 'Obra'}</p>
    <ol className="space-y-0.5">
      {WORK_TABS.map(({ section, label, hint }, index) => {
        const active = isActive(section);
        return <li key={section}><Link href={workPath(workId, section)} aria-current={active ? 'page' : undefined}
          className={`flex items-start gap-3 rounded-lg px-3 py-2 transition-all ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
          <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-bold ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>
          <span className="min-w-0">
            <span className={`block text-sm font-semibold leading-snug ${active ? 'text-blue-800' : 'text-slate-700'}`}>{label}</span>
            <span className="block truncate text-[11px] leading-4 text-slate-400">{hint}</span>
          </span>
        </Link></li>;
      })}
    </ol>
    <p className="eyebrow mb-1 mt-5 px-3">Apoio</p>
    <div className="space-y-0.5">
      {SUPPORT.map(({ section, label, Icon }) => {
        const active = isActive(section);
        return <Link key={section} href={workPath(workId, section)} aria-current={active ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
          <Icon size={15} className={`shrink-0 ${active ? 'text-blue-600' : 'text-slate-400'}`} />{label}
        </Link>;
      })}
    </div>
  </div>;
}

/** No celular a lateral some; as seis abas viram uma faixa rolável sob o cabeçalho. */
export function WorkTabsMobile() {
  const { workId, isActive } = useWork();
  if (!workId) return null;
  return <nav aria-label="Abas da obra" className="custom-scrollbar flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
    {WORK_TABS.map(({ section, short }, index) => {
      const active = isActive(section);
      return <Link key={section} href={workPath(workId, section)} aria-current={active ? 'page' : undefined}
        className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${active ? 'bg-blue-50 text-blue-800' : 'text-slate-600'}`}>
        <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-md text-[11px] ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{index + 1}</span>{short}
      </Link>;
    })}
  </nav>;
}

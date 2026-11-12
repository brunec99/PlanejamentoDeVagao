'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { BarChart3, Boxes, Layers, Wallet, RefreshCw, Settings2 } from 'lucide-react';
import { useDeveloper, useModules, usePlanning } from '@/modules/planejamento/planning-provider';
import { hasSectionAccess } from '@/application/module-access';
import { workPath } from '@/shared/format';

/** As telas da obra e o menu (12/11/2026, a pedido do usuário): o dashboard (0) no topo e três grupos
 * numerados — 1 Prazo, 2 Controles de obra, 3 SST —, com as telas em 1.1, 1.2 … 3.2. `number` é esse
 * código: aparece no menu, na faixa do celular e no cabeçalho de cada tela ("Aba 1.3"). Até 11/11/2026 as
 * abas tinham número corrido (1 longo, 2 vagões, 3 médio, 4 curto, 5 terminalidade, 6 segurança, 7
 * histograma, 8 produtividade, 9 checklist); comentários e documentos antigos ainda usam esses números.
 * O planejamento de vagão (antiga aba 2) saiu do menu (`menu: false`): abre por dentro do longo prazo e
 * leva o código dele. O Quadro de Restrições (1.4) é o Kanban que era a "Lista de pendência" da aba 2. */
export const WORK_TABS = [
  // Aberto a todos (não está em RESTRICTED_SECTIONS); cada quadro só aparece para quem pode abrir o módulo dele.
  {
    section: 'dashboard',
    group: 'geral',
    number: '0',
    short: 'Dashboard',
    label: 'Dashboard da obra',
    hint: 'Visão geral · Filtros · PDF',
  },
  {
    section: 'longo-prazo',
    group: 'prazo',
    number: '1.1',
    short: 'Longo prazo',
    label: 'Cronograma de longo prazo',
    hint: 'Linha de balanço · Fluxos · Medições',
  },
  // Fora do menu desde 12/11/2026: abre pelo botão "Planejamento de vagão" do longo prazo.
  {
    section: 'vagoes',
    group: 'prazo',
    menu: false,
    number: '1.1',
    short: 'Vagões',
    label: 'Planejamento de vagão',
    hint: 'Períodos de takt · Atividades · Liberações',
  },
  {
    section: 'medio-prazo',
    group: 'prazo',
    number: '1.2',
    short: 'Médio prazo',
    label: 'Cronograma de médio prazo',
    hint: 'Gantt · Recursos · Linha de base',
  },
  {
    section: 'curto-prazo',
    group: 'prazo',
    number: '1.3',
    short: 'Curto prazo',
    label: 'Cronograma de curto prazo',
    hint: 'Planilha semanal · PPC · Causas',
  },
  // O Kanban de cards com prazo, conversa e checklists (10/11/2026), com item próprio desde 12/11/2026.
  {
    section: 'restricoes',
    group: 'prazo',
    number: '1.4',
    short: 'Restrições',
    label: 'Quadro de Restrições',
    hint: 'Kanban · Prazos · Conversa',
  },
  {
    section: 'terminalidade',
    group: 'controles',
    number: '2.1',
    short: 'Terminalidade',
    label: 'Terminalidade',
    hint: 'Pendências por apartamento · Fotos',
  },
  {
    section: 'histograma',
    group: 'controles',
    number: '2.2',
    short: 'Histograma',
    label: 'Histograma de mão de obra',
    hint: 'Efetivo diário · Empresa · Função',
  },
  {
    section: 'produtividade',
    group: 'controles',
    number: '2.3',
    short: 'Produtividade',
    label: 'Controle de produtividade',
    hint: 'Serviço · Equipe · Produção por homem-dia',
  },
  // Liberadas por pessoa desde 12/11/2026 (antes, abertas a todos para consulta); TST e admin gravam.
  {
    section: 'seguranca',
    group: 'sst',
    number: '3.1',
    short: 'Segurança',
    label: 'Segurança do trabalho',
    nav: 'Vistoria de segurança',
    hint: 'Vistorias dos TSTs · Fotos',
  },
  {
    section: 'checklist',
    group: 'sst',
    number: '3.2',
    short: 'Checklist',
    label: 'Checklist de equipamentos',
    hint: 'Diário · Semanal · Mensal',
  },
] as const;

/** Grupos do menu da obra: o dashboard sozinho no topo, depois os três grupos numerados. */
export const WORK_GROUPS = [
  { id: 'geral', number: null, label: null },
  { id: 'prazo', number: 1, label: 'Prazo' },
  { id: 'controles', number: 2, label: 'Controles de obra' },
  { id: 'sst', number: 3, label: 'SST' },
] as const;

/** Telas de apoio: alimentam as abas, mas não são um nível de planejamento. */
export const SUPPORT = [
  { section: 'federacao', label: 'Modelo federado', Icon: Layers },
  { section: 'ifc', label: 'Arquivos IFC', Icon: Boxes },
  { section: 'dividas', label: 'Dívidas', Icon: Wallet },
  { section: 'importar', label: 'Integrações', Icon: RefreshCw },
  { section: 'configuracoes', label: 'Configurações da obra', Icon: Settings2 },
];

/** Dashboard geral (04/11/2026, regras 1 e 2 do modelo "Dashboard geral e escalas de tempo"): item em
 * Empreendimentos, abaixo de Obras, para quem tem duas obras ou mais (com uma só não há o que comparar) e
 * sempre para admin e desenvolvedor. Fica aqui, no cliente, para acender quando é a página aberta. */
export const canComparePortfolio = (workCount: number, role: string | undefined, developer: boolean) =>
  developer || role === 'admin' || workCount >= 2;

export function PortfolioLink() {
  const pathname = usePathname();
  const context = usePlanning();
  const developer = useDeveloper();
  if (context.state !== 'ready') return null;
  const { data } = context.planning;
  const actor = data.users.find(u => u.id === context.actorId);
  // A mesma contagem do botão "Comparar obras" da lista: as obras liberadas que existem.
  const works = data.works.filter(w => actor?.workIds.includes(w.id)).length;
  if (!canComparePortfolio(works, actor?.role, developer)) return null;
  const active = pathname === '/dashboard';
  return (
    <Link
      href="/dashboard"
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-start gap-3 rounded-lg px-3 py-2 transition-colors ${active ? 'bg-white/12 shadow-sm ring-1 ring-white/10 before:absolute before:top-1/2 before:-left-3 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-brand-300' : 'hover:bg-white/6'}`}
    >
      <BarChart3 size={17} aria-hidden className="mt-0.5 shrink-0 text-brand-300" />
      <span className="min-w-0">
        <span className={`block text-sm font-medium leading-snug ${active ? 'text-white' : 'text-brand-50/90'}`}>Dashboard geral</span>
        <span className={`block truncate text-xs leading-4 ${active ? 'text-brand-200' : 'text-brand-300/75'}`}>
          Todas as obras · Comparativos
        </span>
      </span>
    </Link>
  );
}

function useWork() {
  const pathname = usePathname();
  const context = usePlanning();
  const developer = useDeveloper();
  const modules = useModules();
  // Fora do desenvolvimento, só as seções abertas a todos e os módulos liberados para a pessoa;
  // o número é o da aba, mesmo quando uma aba do meio está escondida.
  const tabs = WORK_TABS.filter(t => hasSectionAccess(t.section, { developer, modules }));
  const support = SUPPORT.filter(s => hasSectionAccess(s.section, { developer, modules }));
  const workId = pathname.match(/^\/obras\/([^/]+)/)?.[1];
  const work = workId && context.state === 'ready' ? context.planning.data.works.find(w => w.id === decodeURIComponent(workId)) : undefined;
  const isActive = (section: string) => {
    const href = workPath(workId ?? '', section);
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  // O vagão não tem item próprio: com ele aberto, acende o longo prazo, de onde ele se abre.
  const menu = tabs.filter(t => !('menu' in t));
  const activeSection = menu.find(t => isActive(t.section))?.section ?? (isActive('vagoes') ? 'longo-prazo' : undefined);
  return {
    workId,
    work,
    isActive: (section: string) => (menu.some(t => t.section === section) ? section === activeSection : isActive(section)),
    tabs: menu,
    support,
  };
}

export function WorkNav() {
  const { workId, work, isActive, tabs, support } = useWork();
  if (!workId) return null;
  return (
    <div data-tour="work-nav">
      <p className="nav-label mb-1.5 mt-6 truncate px-3" title={work?.name}>
        {work ? work.name : 'Obra'}
      </p>
      {WORK_GROUPS.map(group => {
        const items = tabs.filter(t => t.group === group.id);
        if (!items.length) return null;
        return (
          <div key={group.id}>
            {group.label && (
              <p className="nav-label mb-1.5 mt-5 px-3">
                {group.number} · {group.label}
              </p>
            )}
            <ol className="space-y-0.5">
              {items.map(tab => {
                const { section, hint, number } = tab;
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
                        className={`mt-0.5 grid h-5 min-w-7 shrink-0 place-items-center rounded-md px-1 text-xs font-bold tabular-nums ${active ? 'bg-brand-300 text-brand-950' : 'bg-white/10 text-brand-200'}`}
                      >
                        {number}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold leading-snug ${active ? 'text-white' : 'text-brand-50/90'}`}>
                          {'nav' in tab ? tab.nav : tab.label}
                        </span>
                        <span className={`block truncate text-xs leading-4 ${active ? 'text-brand-200' : 'text-brand-300/75'}`}>
                          {hint}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
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
  // A aba aberta rola para a vista: no celular o curto prazo, por muito tempo a única liberada, ficava
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
              className={`grid h-5 min-w-5 place-items-center rounded-md px-1 text-xs tabular-nums ${active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}
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

import Link from 'next/link';
import Image from 'next/image';
import { Building2, Settings, LogOut } from 'lucide-react';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { PlanningProvider } from '@/modules/planejamento/planning-provider';
import { SidebarWrapper } from '@/modules/layout/sidebar-wrapper';
import { MobileDrawer } from '@/modules/layout/mobile-drawer';
import { WorkNav, WorkTabsMobile } from '@/modules/layout/work-nav';
import { TopBar } from '@/modules/layout/top-bar';
import { ToastProvider } from '@/modules/layout/toast';
import { ConfirmProvider } from '@/modules/layout/confirm';
import { ZoomToggle } from '@/modules/layout/zoom-toggle';
import { ConnectionBanner } from '@/modules/layout/connection-banner';
import { TourProvider } from '@/modules/tour/tour-provider';
import { TourOverlay } from '@/modules/tour/tour-overlay';
import { HelpButton } from '@/modules/tour/help-button';
import { signOut } from '../login/actions';
import { roleLabels } from '@/shared/format';

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { profile, developer } = await getRouteAccess();
  // O mesmo conteúdo serve a lateral do desktop e a gaveta do celular: marca, abas, Apoio e perfil.
  // Os dois ficam no azul-petróleo da marca (`nav-dark`); modo reunião e ajuda foram para o
  // cabeçalho, ao lado da trilha, que é onde se procuram.
  const navigation = (
    <>
      <div className="px-4 pt-5 pb-4">
        <Link href="/obras" className="block rounded-xl focus-visible:outline-brand-300">
          <div className="flex w-fit items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm shadow-brand-950/30">
            <Image src="/logo-atr.png" alt="ATR Incorporadora" width={140} height={61} className="h-6 w-auto object-contain" priority />
            <div className="h-6 w-px bg-slate-200" />
            <Image src="/logo-takt.png" alt="Takt Engenharia" width={200} height={112} className="h-6 w-auto object-contain" priority />
          </div>
          <div className="mt-4 px-1 leading-tight">
            <p className="text-lg font-semibold tracking-tight text-white">
              Obra <span className="text-brand-300">360</span>
            </p>
            <p className="text-xs font-medium text-brand-300/80">Gestão de projetos e obras</p>
          </div>
        </Link>
      </div>
      <div className="mx-4 h-px bg-gradient-to-r from-white/15 via-white/10 to-transparent" />
      <nav aria-label="Menu principal" className="flex-1 px-3 py-4">
        <p className="nav-label mb-1.5 mt-1 px-3">Empreendimentos</p>
        <div className="space-y-0.5">
          <Link
            href="/obras"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-50/90 transition-colors hover:bg-white/6 hover:text-white"
          >
            <Building2 size={17} className="shrink-0 text-brand-300" />
            Obras
          </Link>
        </div>
        <WorkNav />
        {profile?.role === 'admin' && (
          <>
            <p className="nav-label mb-1.5 mt-6 px-3">Administração</p>
            <div className="space-y-0.5">
              <Link
                href="/configuracoes"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-100/80 transition-colors hover:bg-white/6 hover:text-white"
              >
                <Settings size={16} className="shrink-0 text-brand-300/70" />
                Configurações
              </Link>
            </div>
          </>
        )}
      </nav>
      {profile && (
        <div className="m-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/6 px-3 py-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-300 to-brand-500 text-xs font-bold text-brand-950">
            {initials(profile.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{profile.name}</p>
            <p className="truncate text-xs text-brand-300">{roleLabels[profile.role]}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              aria-label="Sair do sistema"
              title="Sair do sistema"
              className="grid h-9 w-9 place-items-center rounded-lg text-brand-200 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut size={17} />
            </button>
          </form>
        </div>
      )}
    </>
  );
  return (
    <TourProvider>
      <ToastProvider>
        <ConfirmProvider>
          <PlanningProvider developer={developer}>
            <div className="flex h-screen overflow-hidden">
              <a className="skip-link" href="#main">
                Ir para o conteúdo
              </a>
              <SidebarWrapper>{navigation}</SidebarWrapper>
              <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
                <TopBar
                  start={
                    <div className="flex shrink-0 items-center gap-1 md:hidden">
                      <MobileDrawer>{navigation}</MobileDrawer>
                      <Link href="/obras" className="flex items-center gap-2 pl-1" aria-label="Obra 360 — obras">
                        <Image src="/logo-atr.png" alt="" width={90} height={39} className="h-5 w-auto object-contain" priority />
                      </Link>
                      <span aria-hidden className="mx-1 h-5 w-px bg-slate-200" />
                    </div>
                  }
                  end={
                    <>
                      <ZoomToggle variant="icon" />
                      <HelpButton variant="icon" />
                    </>
                  }
                />
                <WorkTabsMobile />
                <ConnectionBanner />
                <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 p-4 sm:p-5 md:p-8">
                  {children}
                </main>
              </div>
              <TourOverlay />
            </div>
          </PlanningProvider>
        </ConfirmProvider>
      </ToastProvider>
    </TourProvider>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import { Building2, Settings, LogOut } from 'lucide-react';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { PlanningProvider } from '@/modules/planejamento/planning-provider';
import { SidebarWrapper } from '@/modules/layout/sidebar-wrapper';
import { MobileDrawer } from '@/modules/layout/mobile-drawer';
import { WorkNav, WorkTabsMobile } from '@/modules/layout/work-nav';
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
  const profile = await getRouteProfile();
  // O mesmo conteúdo serve a lateral do desktop e a gaveta do celular: abas, Apoio, perfil e saída.
  const navigation = (
    <>
      <div className="space-y-3 border-b border-slate-100 p-5">
        <Link href="/obras" className="block space-y-3">
          <div className="flex items-center gap-3">
            <Image src="/logo-atr.png" alt="ATR Incorporadora" width={140} height={61} className="h-7 w-auto object-contain" priority />
            <div className="h-7 w-px bg-slate-200" />
            <Image src="/logo-takt.png" alt="Takt Engenharia" width={200} height={112} className="h-7 w-auto object-contain" priority />
          </div>
          <div className="leading-tight">
            <p className="text-base font-bold text-slate-900">
              Obra <span className="text-primary">360</span>
            </p>
            <p className="text-xs font-medium text-slate-500">Gestão de projetos e obras</p>
          </div>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4">
        <p className="eyebrow mb-1 mt-1 px-3">Empreendimentos</p>
        <div className="space-y-0.5">
          <Link
            href="/obras"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900"
          >
            <Building2 size={17} className="shrink-0 text-primary" />
            Obras
          </Link>
        </div>
        <WorkNav />
        {profile?.role === 'admin' && (
          <>
            <p className="eyebrow mb-1 mt-5 px-3">Configurações</p>
            <div className="space-y-0.5">
              <Link
                href="/configuracoes"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900"
              >
                <Settings size={17} className="shrink-0 text-slate-500" />
                Configurações
              </Link>
            </div>
          </>
        )}
      </nav>
      <div className="border-t border-slate-100 p-4">
        {profile && (
          <div className="mb-3 flex items-center gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-primary-ring bg-primary-soft text-xs font-bold text-primary">
              {initials(profile.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{profile.name}</p>
              <p className="truncate text-xs text-slate-500">{roleLabels[profile.role]}</p>
            </div>
          </div>
        )}
        <ZoomToggle />
        <HelpButton />
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <LogOut size={16} />
            Sair do sistema
          </button>
        </form>
      </div>
    </>
  );
  return (
    <TourProvider>
      <ToastProvider>
        <ConfirmProvider>
          <PlanningProvider>
            <div className="flex h-screen overflow-hidden bg-slate-100">
              <a className="skip-link" href="#main">
                Ir para o conteúdo
              </a>
              <SidebarWrapper>{navigation}</SidebarWrapper>
              <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto bg-slate-100">
                <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 md:hidden">
                  <div className="flex items-center gap-1">
                    <MobileDrawer>{navigation}</MobileDrawer>
                    <Link href="/obras" className="flex items-center gap-2.5 pl-1">
                      <Image
                        src="/logo-atr.png"
                        alt="ATR Incorporadora"
                        width={90}
                        height={39}
                        className="h-6 w-auto object-contain"
                        priority
                      />
                      <span className="text-sm font-bold leading-tight text-slate-900">
                        Obra <span className="text-primary">360</span>
                      </span>
                    </Link>
                  </div>
                  <div className="flex items-center gap-3 pr-1">
                    <ZoomToggle variant="icon" />
                    <HelpButton variant="icon" />
                    {profile?.role === 'admin' && (
                      <Link href="/configuracoes" className="text-slate-500" aria-label="Configurações">
                        <Settings size={18} />
                      </Link>
                    )}
                  </div>
                </header>
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

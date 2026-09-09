import Link from 'next/link';
import { Building2, Settings, LogOut } from 'lucide-react';
import { getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { PlanningProvider } from '@/modules/planejamento/planning-provider';
import { signOut } from '../login/actions';
import { roleLabels } from '@/shared/format';

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await getRouteProfile();
  return (
    <div className="flex min-h-screen bg-slate-100">
      <a className="skip-link" href="#main">Ir para o conteúdo</a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 p-5">
          <Link href="/obras" className="flex items-center gap-2.5">
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-700 text-sm font-bold text-white">V</span>
            <span className="text-sm font-bold leading-tight text-slate-900">Planejamento<br />Vagão</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4">
          <p className="eyebrow mb-1 px-3">Planejamento</p>
          <Link href="/obras" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
            <Building2 size={17} className="shrink-0 text-blue-600" />Obras
          </Link>
          {profile?.role === 'admin' && <>
            <p className="eyebrow mb-1 mt-5 px-3">Configurações</p>
            <Link href="/configuracoes" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
              <Settings size={17} className="shrink-0 text-slate-500" />Configurações
            </Link>
          </>}
        </nav>
        <div className="border-t border-slate-100 p-4">
          {profile && <div className="mb-3 flex items-center gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-blue-200 bg-blue-100 text-xs font-bold text-blue-700">{initials(profile.name)}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{profile.name}</p>
              <p className="truncate text-xs text-slate-400">{roleLabels[profile.role]}</p>
            </div>
          </div>}
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600">
              <LogOut size={16} />Sair do sistema
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-3 md:hidden">
          <Link href="/obras" className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-blue-700 text-xs font-bold text-white">V</span>Planejamento Vagão
          </Link>
          {profile?.role === 'admin' && <Link href="/configuracoes" className="text-slate-500"><Settings size={18} /></Link>}
        </header>
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 p-5 md:p-8">
          <PlanningProvider>{children}</PlanningProvider>
        </main>
      </div>
    </div>
  );
}

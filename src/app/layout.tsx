import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { getAuthUser, getRouteProfile } from '@/infrastructure/auth/supabase-server';
import { signOut } from './login/actions';
import './globals.css';
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
export const metadata: Metadata = { title: { default: 'Sistema de Planejamento Vagão', template: '%s | Planejamento Vagão' }, description: 'Planejamento de produção por períodos de takt e controle de terminalidade.' };
const roleLabels = { manager: 'Gestor', planner: 'Planejador', viewer: 'Consulta' } as const;
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const authUser = await getAuthUser();
  const profile = authUser ? await getRouteProfile() : null;
  return <html lang="pt-BR" className={inter.variable}><body>
    <a className="skip-link" href="#main">Ir para o conteúdo</a>
    <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-6">
          <Link href="/obras" className="flex items-center gap-2.5 font-semibold tracking-tight text-[var(--ink)]">
            <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[var(--ink)] text-[13px] font-bold text-white">V</span>
            <span className="text-[14.5px]">Planejamento Vagão</span>
          </Link>
          <Link className="text-[13.5px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]" href="/integracoes">Prevision</Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="badge-muted">Ambiente de validação</span>
          {profile && <form action={signOut} className="flex items-center gap-3 text-[13.5px]"><span className="text-[var(--ink-muted)]">{profile.name} <span className="text-[var(--ink-subtle)]">· {roleLabels[profile.role]}</span></span><button className="text-link" type="submit">Sair</button></form>}
        </div>
      </div>
    </header>
    <main id="main" className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    <footer className="mx-auto max-w-6xl px-6 pb-10 text-[12.5px] text-[var(--ink-subtle)]">Validação do MVP · referência em 08/09/2026</footer>
  </body></html>;
}

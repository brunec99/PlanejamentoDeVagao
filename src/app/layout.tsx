import type { Metadata } from 'next';
import Link from 'next/link';
import { PlanningProvider } from '@/modules/planejamento/planning-provider';
import './globals.css';
export const metadata: Metadata = { title: { default: 'Sistema de Planejamento Vagão', template: '%s | Planejamento Vagão' }, description: 'Planejamento de produção por períodos de takt e controle de terminalidade.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body><a className="skip-link" href="#main">Ir para o conteúdo</a><header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5"><Link href="/obras" className="flex items-center gap-3 font-semibold tracking-tight"><span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-800 font-bold text-white">V</span><span>Sistema de Planejamento Vagão</span></Link><Link className="text-link text-sm" href="/integracoes">Prevision</Link><span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900">Demonstração · dados fictícios</span></div></header><PlanningProvider><main id="main" className="mx-auto max-w-7xl px-6 py-8">{children}</main></PlanningProvider><footer className="mx-auto max-w-7xl px-6 pb-8 text-sm text-slate-500">Validação do MVP · referência em 08/09/2026 · dados em memória</footer></body></html>;
}

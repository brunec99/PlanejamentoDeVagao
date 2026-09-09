import Link from 'next/link';
import type { ReactNode } from 'react';
import type { WagonStatus } from '@/domain/entities';
import { statusLabels } from '@/shared/format';
export function Status({ status }: { status: WagonStatus }) { return <span className={`status ${status}`}>{statusLabels[status]}</span>; }
export function Progress({ value, label }: { value: number; label: string }) {
  return <div className="flex items-center gap-2.5">
    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} /></div>
    <span className="text-xs font-semibold tabular-nums text-slate-500">{Math.round(value)}%</span>
  </div>;
}
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><h2 className="border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-800">{title}</h2><div className="p-5">{children}</div></section>; }
export function Empty({ children }: { children: ReactNode }) { return <p className="text-sm leading-6 text-slate-500">{children}</p>; }
export function LoadState({ error = false }: { error?: boolean }) { return <div className="panel p-6"><p role={error ? 'alert' : 'status'} className="text-sm text-slate-500">{error ? 'Não foi possível carregar os dados. Atualize a página para tentar novamente.' : 'Carregando planejamento…'}</p></div>; }
export function Missing({ label, href = '/obras' }: { label: string; href?: string }) { return <div className="panel p-6"><h1 className="text-lg font-bold text-slate-900">{label}</h1><p className="my-2 text-sm text-slate-500">Confira o endereço ou retorne à lista.</p><Link className="text-link text-sm" href={href}>Voltar</Link></div>; }
export function Callout({ tone = 'info', role, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; role?: 'alert' | 'status'; children: ReactNode }) { return <p role={role} className={`callout callout-${tone}`}>{children}</p>; }
export function StatCard({ label, value, tone = 'default' }: { label: string; value: ReactNode; tone?: 'default' | 'warning' | 'danger' }) {
  const color = tone === 'danger' ? 'text-rose-600' : tone === 'warning' ? 'text-amber-600' : 'text-slate-900';
  return <div className="stat-card"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-1.5 text-2xl font-bold tabular-nums ${color}`}>{value}</p></div>;
}

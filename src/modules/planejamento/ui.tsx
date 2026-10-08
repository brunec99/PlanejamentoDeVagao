'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import type { WagonStatus } from '@/domain/entities';
import { statusLabels } from '@/shared/format';
import { usePlanning } from './planning-provider';
export function Status({ status }: { status: WagonStatus }) {
  return <span className={`status ${status}`}>{statusLabels[status]}</span>;
}
export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          role="progressbar"
          aria-label={label}
          aria-valuenow={Math.round(value)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-slate-500">{Math.round(value)}%</span>
    </div>
  );
}
export function Panel({ title, tourId, actions, children }: { title: string; tourId?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section data-tour={tourId} className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-slate-100 bg-gradient-to-r from-brand-50/80 to-transparent px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-primary-ink">
          <span aria-hidden className="h-4 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-700" />
          {title}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-6 text-slate-500">{children}</p>;
}

/** Esqueleto de uma tela comum: cabeçalho, quatro cartões e um painel com linhas. */
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-6">
      <div className="space-y-2">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton h-7 w-80" />
        <div className="skeleton h-3 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="stat-card space-y-3">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="panel p-5">
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="skeleton h-4" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Estado de carga ou de erro do planejamento. Em erro, o botão tenta de novo sem recarregar a
 * página; em carga, o esqueleto mostra a forma da tela que vem. */
export function LoadState({ error = false, rows }: { error?: boolean; rows?: number }) {
  const context = usePlanning();
  if (!error)
    return (
      <div role="status" aria-label="Carregando planejamento">
        <PageSkeleton rows={rows} />
      </div>
    );
  return (
    <div className="panel p-6">
      <p role="alert" className="text-sm font-semibold text-slate-800">
        Não foi possível carregar os dados.
      </p>
      <p className="mt-1 text-sm text-slate-500">
        {context.state === 'error' && context.message ? context.message : 'Verifique a conexão e tente de novo.'}
      </p>
      {context.state === 'error' && (
        <button type="button" className="button-ghost mt-4" onClick={context.retry}>
          <RefreshCw size={15} aria-hidden />
          Tentar de novo
        </button>
      )}
    </div>
  );
}
export function Missing({ label, href = '/obras' }: { label: string; href?: string }) {
  return (
    <div className="panel p-6">
      <h1 className="text-lg font-bold text-slate-900">{label}</h1>
      <p className="my-2 text-sm text-slate-500">Confira o endereço ou retorne à lista.</p>
      <Link className="text-link text-sm" href={href}>
        Voltar
      </Link>
    </div>
  );
}
export function Callout({
  tone = 'info',
  role,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  role?: 'alert' | 'status';
  children: ReactNode;
}) {
  return (
    <p role={role} className={`callout callout-${tone}`}>
      {children}
    </p>
  );
}
export function StatCard({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  hint?: ReactNode;
}) {
  const color =
    tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-slate-900';
  return (
    <div className="stat-card">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

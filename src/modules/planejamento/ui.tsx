import Link from 'next/link';
import type { ReactNode } from 'react';
import type { WagonStatus } from '@/domain/entities';
import { statusLabels } from '@/shared/format';
export function Status({ status }: { status: WagonStatus }) { return <span className={`status ${status}`}>{statusLabels[status]}</span>; }
export function Progress({ value, label }: { value: number; label: string }) { return <div className="flex items-center gap-3"><progress aria-label={label} max={100} value={value} className="h-1.5 w-24 accent-[var(--accent)]"/><span className="text-sm tabular-nums text-[var(--ink-muted)]">{Math.round(value)}%</span></div>; }
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><h2 className="border-b border-[var(--border)] px-5 py-4 text-[15px] font-semibold">{title}</h2><div className="p-5">{children}</div></section>; }
export function Empty({ children }: { children: ReactNode }) { return <p className="text-sm leading-6 text-[var(--ink-muted)]">{children}</p>; }
export function LoadState({ error = false }: { error?: boolean }) { return <div className="panel p-6"><p role={error ? 'alert' : 'status'} className="text-[13.5px] text-[var(--ink-muted)]">{error ? 'Não foi possível carregar a demonstração. Atualize a página para tentar novamente.' : 'Carregando planejamento…'}</p></div>; }
export function Missing({ label, href = '/obras' }: { label: string; href?: string }) { return <div className="panel p-6"><h1 className="text-xl font-semibold">{label}</h1><p className="my-3 text-sm text-[var(--ink-muted)]">Confira o endereço ou retorne à lista.</p><Link className="text-link" href={href}>Voltar ao planejamento</Link></div>; }
export function Callout({ tone = 'info', role, children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; role?: 'alert' | 'status'; children: ReactNode }) { return <p role={role} className={`callout callout-${tone}`}>{children}</p>; }

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { WagonStatus } from '@/domain/entities';
import { statusLabels } from '@/shared/format';
export function Status({ status }: { status: WagonStatus }) { return <span className={`status ${status}`}>{statusLabels[status]}</span>; }
export function Progress({ value, label }: { value: number; label: string }) { return <div className="flex items-center gap-3"><progress aria-label={label} max={100} value={value} className="h-2 w-24 accent-blue-700"/><span className="text-sm tabular-nums">{Math.round(value)}%</span></div>; }
export function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><h2 className="border-b border-slate-200 px-5 py-4 text-lg font-semibold">{title}</h2><div className="p-5">{children}</div></section>; }
export function Empty({ children }: { children: ReactNode }) { return <p className="text-sm leading-6 text-slate-600">{children}</p>; }
export function LoadState({ error = false }: { error?: boolean }) { return <div className="panel p-6"><p role={error ? 'alert' : 'status'}>{error ? 'Não foi possível carregar a demonstração. Atualize a página para tentar novamente.' : 'Carregando planejamento…'}</p></div>; }
export function Missing({ label, href = '/obras' }: { label: string; href?: string }) { return <div className="panel p-6"><h1 className="text-2xl font-semibold">{label}</h1><p className="my-3 text-slate-600">Confira o endereço ou retorne à lista.</p><Link className="text-link" href={href}>Voltar ao planejamento</Link></div>; }

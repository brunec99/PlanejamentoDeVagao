'use client';
import { useState, type ReactNode } from 'react';
import type { Command } from '@/application/use-cases/commands';
import { usePlanning } from './planning-provider';
import { Callout } from './ui';
export const value = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
export const number = (data: FormData, key: string) => Number(data.get(key));
export const checked = (data: FormData, key: string) => data.get(key) === 'on';
export function CommandForm({ title, children, command, submit = 'Salvar', onDone }: { title: string; children: ReactNode; command: (data: FormData) => Command; submit?: string; onDone?: (id: string) => void }) {
  const context = usePlanning();
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (context.state !== 'ready') return null;
  const actor = context.planning.data.users.find(u => u.id === context.actorId);
  if (actor?.role === 'viewer') return null;
  return <details className="command-box"><summary>{title}</summary><form className="mt-4 space-y-4" onSubmit={async e => {
    e.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
    const form = e.currentTarget; const input = new FormData(form);
    try { const id = await context.execute(command(input)); setMessage('Salvo com sucesso.'); onDone?.(id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }}><fieldset disabled={busy} className="space-y-4">{children}<button className="button" type="submit">{busy ? 'Salvando…' : submit}</button></fieldset>{error && <Callout tone="danger" role="alert">{error}</Callout>}{message && <Callout tone="success" role="status">{message}</Callout>}</form></details>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-[13px] font-medium text-[var(--ink-muted)]"><span className="mb-1.5 block">{label}</span>{children}</label>; }
export function TextField({ name, label, defaultValue = '', required = true, type = 'text', min, max, step }: { name: string; label: string; defaultValue?: string | number; required?: boolean; type?: string; min?: string | number; max?: string | number; step?: string }) { return <Field label={label}><input className="field" name={name} type={type} defaultValue={defaultValue} required={required} min={min} max={max} step={step}/></Field>; }
export function Check({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) { return <label className="flex items-center gap-2 text-[13.5px] text-[var(--ink)]"><input type="checkbox" name={name} defaultChecked={defaultChecked} className="accent-[var(--accent)]"/>{label}</label>; }
export function Reason() { return <TextField name="reason" label="Justificativa (obrigatória para reabertura ou redução do progresso)" required={false} />; }
export function Responsible({ workId, defaultValue }: { workId: string; defaultValue?: string }) { const c = usePlanning(); if (c.state !== 'ready') return null; return <Field label="Responsável"><select className="field" name="responsibleId" defaultValue={defaultValue ?? c.actorId} required>{c.planning.data.users.filter(u => u.workIds.includes(workId)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>; }

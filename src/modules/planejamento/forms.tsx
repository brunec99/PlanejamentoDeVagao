'use client';
import { useId, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { Command } from '@/application/use-cases/commands';
import { usePlanning } from './planning-provider';
import { useToast } from '@/modules/layout/toast';
import { Drawer } from '@/modules/layout/drawer';
import { Callout } from './ui';
export const value = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
export const number = (data: FormData, key: string) => Number(data.get(key));
export const checked = (data: FormData, key: string) => data.get(key) === 'on';

/** Um formulário que envia um comando. Por padrão vive numa gaveta lateral: a tela mostra só o
 * botão, e o formulário abre por cima, com foco preso e Esc para fechar. Sucesso fecha a gaveta
 * e avisa num toast; erro fica dentro da gaveta, perto dos campos. `variant="inline"` mantém a
 * caixa recolhível antiga, para os poucos lugares em que o formulário é o conteúdo da tela. */
export function CommandForm({
  title,
  description,
  children,
  command,
  submit = 'Salvar',
  onDone,
  variant = 'drawer',
  trigger,
  tone = 'ghost',
  icon = 'plus',
  success,
  width,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  command: (data: FormData) => Command;
  submit?: string;
  onDone?: (id: string) => void;
  variant?: 'drawer' | 'inline';
  trigger?: ReactNode;
  tone?: 'primary' | 'ghost' | 'link';
  icon?: 'plus' | 'none';
  success?: string;
  width?: 'md' | 'lg';
}) {
  const context = usePlanning();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const formId = useId();
  if (context.state !== 'ready') return null;
  const actor = context.planning.data.users.find(u => u.id === context.actorId);
  if (actor?.role === 'viewer') return null;
  const run = async (form: HTMLFormElement) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const input = new FormData(form);
    try {
      const id = await context.execute(command(input));
      if (variant === 'drawer') {
        setOpen(false);
        toast({ title: success ?? `${title}: salvo.`, tone: 'success' });
      } else {
        setMessage(success ?? 'Salvo com sucesso.');
        form.reset();
      }
      onDone?.(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  };
  const body = (
    <form
      id={formId}
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault();
        run(e.currentTarget);
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
        {children}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button className="button" type="submit">
            {busy ? 'Salvando…' : submit}
          </button>
          {variant === 'drawer' && (
            <button type="button" className="button-ghost" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          )}
        </div>
      </fieldset>
      {error && (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      )}
      {message && (
        <Callout tone="success" role="status">
          {message}
        </Callout>
      )}
    </form>
  );
  if (variant === 'inline')
    return (
      <details className="command-box">
        <summary>{title}</summary>
        <div className="mt-4">{body}</div>
      </details>
    );
  const buttonClass =
    tone === 'primary' ? 'button' : tone === 'link' ? 'text-link inline-flex min-h-9 items-center gap-1.5 text-sm' : 'button-ghost';
  return (
    <>
      <button
        type="button"
        className={buttonClass}
        aria-haspopup="dialog"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {icon === 'plus' && <Plus size={15} aria-hidden />}
        {trigger ?? title}
      </button>
      <Drawer
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={title}
        description={description}
        width={width}
      >
        {body}
      </Drawer>
    </>
  );
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      <span className="mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] font-normal text-slate-500">{hint}</span>}
    </label>
  );
}
export function TextField({
  name,
  label,
  defaultValue = '',
  required = true,
  type = 'text',
  min,
  max,
  step,
  hint,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | number;
  required?: boolean;
  type?: string;
  min?: string | number;
  max?: string | number;
  step?: string;
  hint?: ReactNode;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input
        className="field"
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
      />
    </Field>
  );
}
export function Check({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="accent-blue-700" />
      {label}
    </label>
  );
}
export function Reason() {
  return (
    <TextField
      name="reason"
      label="Justificativa"
      required={false}
      hint="Obrigatória para reabrir um vagão terminal ou reduzir o progresso."
    />
  );
}
export function Responsible({ workId, defaultValue }: { workId: string; defaultValue?: string }) {
  const c = usePlanning();
  if (c.state !== 'ready') return null;
  return (
    <Field label="Responsável">
      <select className="field" name="responsibleId" defaultValue={defaultValue ?? c.actorId} required>
        {c.planning.data.users
          .filter(u => u.workIds.includes(workId))
          .map(u => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
      </select>
    </Field>
  );
}

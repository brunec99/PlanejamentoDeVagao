'use client';
import { useActionState, useState } from 'react';
import { CheckCircle2, UserPlus } from 'lucide-react';
import { requestAccess, type AccessRequestState } from './actions';

/** "Solicitar acesso" para quem entrou com o Google e não tem cadastro no Obra 360. O e-mail confirmado
 * pelo Google vem do servidor e fica travado; sem ele (o Google recusou antes), a pessoa digita. */
export function AccessRequest({ verified }: { verified: { email: string; name: string } | null }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AccessRequestState, FormData>(requestAccess, { status: 'idle' });

  if (state.status === 'sent')
    return (
      <div role="status" className="mb-5 flex gap-3 rounded-xl border border-success-ring bg-success-soft px-4 py-3">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-emerald-900">Pedido enviado</p>
          <p className="mt-0.5 text-xs leading-5 text-emerald-800">
            Um administrador vai ver o pedido em Configurações. Quando o cadastro for feito, entre de novo com o Google.
          </p>
        </div>
      </div>
    );

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <UserPlus size={16} aria-hidden />
        Solicitar acesso
      </button>
    );

  const field =
    'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
  return (
    <form action={action} className="mb-5 rounded-xl border border-brand-100 bg-white p-4 shadow-sm" aria-labelledby="access-request-title">
      <h2 id="access-request-title" className="text-sm font-semibold text-brand-950">
        Solicitar acesso ao Obra 360
      </h2>
      <p className="mt-0.5 text-xs text-slate-600">O pedido vai para os administradores, que liberam as obras e os módulos.</p>
      <label className="mt-3 block text-xs font-semibold text-slate-700">
        E-mail
        {verified ? (
          <span className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-normal text-slate-700">
            {verified.email}
            <span className="text-xs text-success">confirmado pelo Google</span>
          </span>
        ) : (
          <input className={field} type="email" name="email" required autoComplete="email" placeholder="nome@atrincorporadora.com.br" />
        )}
      </label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">
        Nome
        <input className={field} name="name" required maxLength={120} defaultValue={verified?.name ?? ''} autoComplete="name" />
      </label>
      <label className="mt-3 block text-xs font-semibold text-slate-700">
        Obra e função <span className="font-normal text-slate-500">(opcional)</span>
        <textarea className={`${field} min-h-16`} name="message" maxLength={500} placeholder="Ex.: Blentt, estagiário de planejamento" />
      </label>
      {state.status === 'error' && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {state.message}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-strong disabled:opacity-60"
        >
          {pending ? 'Enviando…' : 'Enviar pedido'}
        </button>
      </div>
    </form>
  );
}

'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}
type Ask = (options: ConfirmOptions) => Promise<boolean>;
const Context = createContext<Ask>(async () => false);

/** Diálogo de confirmação no lugar do `window.confirm`: mesmo visual do sistema, foco preso no
 * diálogo, Esc cancela. Devolve uma promessa, então o código de quem pergunta continua linear. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (value: boolean) => void }>();
  const dialog = useRef<HTMLDialogElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const ask = useCallback<Ask>(options => new Promise(resolve => setPending({ options, resolve })), []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (pending && !element.open) {
      element.showModal();
      confirmButton.current?.focus();
    }
    if (!pending && element.open) element.close();
  }, [pending]);
  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(undefined);
  };
  const options = pending?.options;
  return (
    <Context.Provider value={ask}>
      {children}
      <dialog
        ref={dialog}
        onCancel={event => {
          event.preventDefault();
          settle(false);
        }}
        onClose={() => {
          if (pending) settle(false);
        }}
        aria-labelledby="confirm-title"
        className="m-auto w-[min(26rem,92vw)] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
      >
        {options && (
          <div className="p-5">
            <div className="flex items-start gap-3">
              {options.tone === 'danger' && (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-50 text-rose-600">
                  <TriangleAlert size={18} aria-hidden />
                </span>
              )}
              <div className="min-w-0">
                <h2 id="confirm-title" className="text-base font-bold text-slate-900">
                  {options.title}
                </h2>
                {options.description && <div className="mt-1.5 text-sm leading-6 text-slate-600">{options.description}</div>}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="button-ghost" onClick={() => settle(false)}>
                {options.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                ref={confirmButton}
                type="button"
                className={options.tone === 'danger' ? 'button-danger' : 'button'}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </Context.Provider>
  );
}

/** `const ok = await confirm({ title: 'Excluir a linha?', tone: 'danger' })`. */
export function useConfirm() {
  return useContext(Context);
}

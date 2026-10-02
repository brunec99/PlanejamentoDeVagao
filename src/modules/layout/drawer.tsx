'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Painel lateral para formulários e detalhes. É um `<dialog>` nativo: foco preso, Esc fecha,
 * fundo escurecido. Em telas estreitas ocupa a largura toda; no desktop encosta à direita. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  width?: 'md' | 'lg';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-labelledby={open ? 'drawer-title' : undefined}
      className={`drawer ${width === 'lg' ? 'drawer-lg' : ''}`}
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <h2 id="drawer-title" className="text-base font-bold text-slate-900">
                {title}
              </h2>
              {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </header>
          <div className="custom-scrollbar flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

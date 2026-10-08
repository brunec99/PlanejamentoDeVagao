'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

/** No celular a lateral some; este botão abre o mesmo conteúdo numa gaveta, com as abas, o Apoio,
 * o perfil e a saída. Navegar fecha a gaveta. */
export function MobileDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
        aria-haspopup="dialog"
        className="-ml-1 rounded-lg p-2 text-slate-600 hover:bg-brand-50 hover:text-primary md:hidden"
      >
        <Menu size={20} />
      </button>
      <dialog
        ref={dialog}
        onCancel={event => {
          event.preventDefault();
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        aria-label="Menu"
        className="drawer drawer-left nav-dark md:hidden"
      >
        {open && (
          <div className="flex h-full flex-col">
            <div className="flex justify-end px-2 pt-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="rounded-lg p-2 text-brand-200 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="nav-scroll flex flex-1 flex-col overflow-y-auto">{children}</div>
          </div>
        )}
      </dialog>
    </>
  );
}

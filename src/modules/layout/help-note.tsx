'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CircleHelp, X } from 'lucide-react';

/** A explicação de uma tela ou de um painel, escondida atrás de um botão "Como funciona". A tela
 * fica com uma linha; quem quer entender o método abre aqui. Fecha com Esc ou clicando fora. */
export function HelpNote({
  title = 'Como funciona',
  label,
  children,
  align = 'start',
  compact = false,
}: {
  title?: string;
  label?: string;
  children: ReactNode;
  align?: 'start' | 'end';
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={root} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        className={
          compact
            ? 'inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700'
            : 'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800'
        }
      >
        <CircleHelp size={compact ? 16 : 15} aria-hidden />
        {compact ? <span className="sr-only">{label ?? title}</span> : (label ?? title)}
      </button>
      {open && (
        <div
          id={id}
          role="region"
          aria-label={title}
          className={`absolute z-40 mt-1 w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-xl ${align === 'end' ? 'right-0' : 'left-0'}`}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="text-sm font-bold text-slate-800">{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar ajuda"
              className="-mr-1 -mt-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2 [&_p]:m-0">{children}</div>
        </div>
      )}
    </div>
  );
}

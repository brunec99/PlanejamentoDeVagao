'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

export type ToastTone = 'success' | 'danger' | 'info';
export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}
interface Toast extends ToastInput {
  id: number;
  tone: ToastTone;
}
interface ToastApi {
  toast: (input: ToastInput) => void;
  dismiss: (id: number) => void;
}

const Context = createContext<ToastApi>({ toast: () => {}, dismiss: () => {} });
const ICONS = { success: CheckCircle2, danger: CircleAlert, info: Info } as const;
const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 [&_svg]:text-emerald-600',
  danger: 'border-rose-200 bg-rose-50 text-rose-900 [&_svg]:text-rose-600',
  info: 'border-primary-ring bg-primary-soft text-primary-ink [&_svg]:text-primary',
} as const;

/** Avisos curtos de resultado de ação, no canto inferior direito. Sucesso some sozinho; erro fica
 * até ser fechado, porque quem errou precisa ler. A região é `aria-live` para leitores de tela. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const sequence = useRef(0);
  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);
  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++sequence.current;
      const tone = input.tone ?? 'success';
      setToasts(current => [...current.slice(-3), { ...input, id, tone }]);
      const duration = input.duration ?? (tone === 'danger' ? 0 : 5000);
      if (duration > 0)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
    },
    [dismiss],
  );
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);
  return (
    <Context.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5"
      >
        {toasts.map(t => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'danger' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${TONES[t.tone]}`}
            >
              <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs leading-5 opacity-90">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Fechar aviso"
                className="-mr-1 rounded p-1 opacity-60 hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </Context.Provider>
  );
}

export function useToast() {
  return useContext(Context);
}

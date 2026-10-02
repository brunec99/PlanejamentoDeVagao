'use client';
import { useEffect, useState } from 'react';
import { Presentation } from 'lucide-react';

const KEY = 'obra360-zoom';

/** Modo reunião: o sistema inteiro cresce um degrau, para ler no projetor da sala. É só o tamanho
 * da fonte raiz; todo espaçamento em `rem` acompanha. A escolha fica no navegador da pessoa. */
export function ZoomToggle({ variant = 'full' }: { variant?: 'full' | 'icon' }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'reuniao') {
        setOn(true);
        document.documentElement.dataset.zoom = 'reuniao';
      }
    } catch {}
  }, []);
  const toggle = () => {
    const next = !on;
    setOn(next);
    if (next) document.documentElement.dataset.zoom = 'reuniao';
    else delete document.documentElement.dataset.zoom;
    try {
      localStorage.setItem(KEY, next ? 'reuniao' : 'normal');
    } catch {}
  };
  if (variant === 'icon')
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label="Modo reunião"
        title="Modo reunião: texto maior para projetar"
        className={on ? 'text-primary' : 'text-slate-500'}
      >
        <Presentation size={18} />
      </button>
    );
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${on ? 'bg-primary-soft text-primary' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
    >
      <Presentation size={16} />
      Modo reunião{on && <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-primary">ligado</span>}
    </button>
  );
}

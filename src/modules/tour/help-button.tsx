'use client';
import { HelpCircle } from 'lucide-react';
import { useTour } from './tour-provider';

export function HelpButton({ variant = 'full' }: { variant?: 'full' | 'icon' }) {
  const { available, start } = useTour();
  if (!available) return null;
  if (variant === 'icon') {
    // O "?" com o texto "Como usar" no computador (20/10/2026): só o ícone passava despercebido.
    return (
      <button
        type="button"
        // Dentro de uma janela marcada com `data-tour-scope`, o tour fica só nela.
        onClick={event => start(event.currentTarget.closest('[data-tour-scope]'))}
        aria-label="Como usar esta tela"
        title="Como usar esta tela: destaca cada botão e explica o que ele faz"
        data-tour="ajuda"
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-brand-50 hover:text-primary"
      >
        <HelpCircle size={18} />
        <span className="hidden md:inline">Como usar</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => start()}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-primary-soft hover:text-primary"
    >
      <HelpCircle size={16} />
      Como usar esta tela
    </button>
  );
}

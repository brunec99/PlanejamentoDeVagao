'use client';
import { HelpCircle } from 'lucide-react';
import { useTour } from './tour-provider';

export function HelpButton({ variant = 'full' }: { variant?: 'full' | 'icon' }) {
  const { available, start } = useTour();
  if (!available) return null;
  if (variant === 'icon') {
    return <button type="button" onClick={start} aria-label="Como usar esta tela" className="text-slate-500 hover:text-blue-700"><HelpCircle size={18} /></button>;
  }
  return <button type="button" onClick={start} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700">
    <HelpCircle size={16} />Como usar esta tela
  </button>;
}

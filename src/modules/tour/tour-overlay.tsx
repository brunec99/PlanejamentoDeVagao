'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useTour } from './tour-provider';

const PAD = 8;
const CARD_WIDTH = 320;
const GAP = 14;

function useTargetRect(selector: string | undefined, active: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!active || !selector) { setRect(null); return; }
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [selector, active]);
  return rect;
}

export function TourOverlay() {
  const { active, steps, stepIndex, next, back, stop } = useTour();
  const step = steps[stepIndex];
  const rect = useTargetRect(step?.target, active);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, stop]);

  if (!active || !step) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  let cardTop: number, cardLeft: number;
  if (rect) {
    const spaceBelow = vh - rect.bottom;
    const placeBelow = spaceBelow > 220 || spaceBelow > rect.top;
    cardTop = placeBelow ? Math.min(rect.bottom + GAP, vh - 220) : Math.max(16, rect.top - GAP - 200);
    cardLeft = Math.min(Math.max(rect.left, 16), vw - CARD_WIDTH - 16);
  } else {
    cardTop = vh / 2 - 100;
    cardLeft = vw / 2 - CARD_WIDTH / 2;
  }

  return <>
    <div className="fixed inset-0 z-[100] bg-slate-900/55" style={{ pointerEvents: 'none' }} aria-hidden="true" />
    {rect && <div
      className="fixed z-[101] rounded-xl ring-2 ring-blue-500 transition-all duration-200"
      style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)', pointerEvents: 'none' }}
    />}
    <div
      role="dialog" aria-modal="true" aria-label={step.title}
      className="fixed z-[102] w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-xl transition-all duration-200"
      style={{ top: cardTop, left: cardLeft }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-blue-700">Passo {stepIndex + 1} de {steps.length}</p>
        <button type="button" onClick={stop} aria-label="Sair do tour" className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      </div>
      <h2 className="mt-1.5 text-sm font-bold text-slate-900">{step.title}</h2>
      <p className="mt-1.5 text-sm leading-6 text-slate-600">{step.body}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" onClick={stop} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Sair do tour</button>
        <div className="flex items-center gap-2">
          {stepIndex > 0 && <button type="button" onClick={back} className="button-ghost px-3 py-1.5 text-xs"><ArrowLeft size={13} />Voltar</button>}
          <button type="button" onClick={next} className="button px-3 py-1.5 text-xs">
            {stepIndex + 1 === steps.length ? 'Concluir' : <>Próximo<ArrowRight size={13} /></>}
          </button>
        </div>
      </div>
    </div>
  </>;
}

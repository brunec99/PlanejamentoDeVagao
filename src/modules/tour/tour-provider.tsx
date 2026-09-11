'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { resolveTourKey, tours, type TourStep } from './tours';

interface TourContextValue {
  active: boolean;
  available: boolean;
  steps: TourStep[];
  stepIndex: number;
  start: () => void;
  stop: () => void;
  next: () => void;
  back: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const tourKey = resolveTourKey(pathname ?? '');
  const steps = useMemo(() => (tourKey ? tours[tourKey] : []), [tourKey]);

  // Navegar para outra tela durante o tour deixa os alvos antigos sem sentido — encerra e reinicia do zero.
  const previousPathname = useRef(pathname);
  useEffect(() => {
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname;
      setActive(false);
      setStepIndex(0);
    }
  }, [pathname]);

  const value: TourContextValue = {
    active,
    available: steps.length > 0,
    steps,
    stepIndex,
    start: () => { setStepIndex(0); setActive(true); },
    stop: () => setActive(false),
    next: () => { if (stepIndex + 1 < steps.length) setStepIndex(stepIndex + 1); else setActive(false); },
    back: () => setStepIndex(i => Math.max(0, i - 1)),
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour deve ser usado dentro de TourProvider');
  return ctx;
}

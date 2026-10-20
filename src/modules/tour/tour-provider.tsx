'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { resolveTourKey, tours, type TourStep } from './tours';

interface TourContextValue {
  active: boolean;
  available: boolean;
  steps: TourStep[];
  stepIndex: number;
  /** Para onde o último clique andou: um alvo que sumiu no meio do tour é pulado no mesmo sentido. */
  direction: 'next' | 'back';
  /** O elemento do alvo, procurado só dentro da janela de onde o tour foi aberto (se foi). */
  find: (target: string) => HTMLElement | null;
  /** `scope`: a janela (`data-tour-scope`) de onde o "?" foi clicado; o tour fica só nela. */
  start: (scope?: Element | null) => void;
  stop: () => void;
  next: () => void;
  back: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<'next' | 'back'>('next');
  // Os passos do tour em curso: só os que têm alvo visível quando ele começa (o papel, o celular e a
  // seção aberta mudam o que existe). Assim o "Passo X de N" conta o que a pessoa vai ver de fato.
  const [running, setRunning] = useState<TourStep[]>([]);
  // Aberto de dentro de uma janela (formulário em tela cheia), o tour percorre só ela: o que está
  // atrás fica escurecido e não faz sentido explicar.
  const [scope, setScope] = useState<Element | null>(null);
  const find = useCallback((target: string) => (scope ?? document).querySelector<HTMLElement>(`[data-tour="${target}"]`), [scope]);

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

  const shown = active ? running : steps;
  const value: TourContextValue = {
    active,
    available: steps.length > 0,
    steps: shown,
    stepIndex,
    direction,
    find,
    start: (root?: Element | null) => {
      setScope(root ?? null);
      setRunning(steps.filter(step => !step.target || isVisibleTarget(step.target, root ?? document)));
      setStepIndex(0);
      setDirection('next');
      setActive(true);
    },
    stop: () => setActive(false),
    next: () => {
      setDirection('next');
      if (stepIndex + 1 < shown.length) setStepIndex(stepIndex + 1);
      else setActive(false);
    },
    back: () => {
      setDirection('back');
      setStepIndex(i => Math.max(0, i - 1));
    },
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

/** O alvo existe e tem área na tela: um elemento escondido (celular, papel sem permissão) não conta. */
export function isVisibleTarget(target: string, root: ParentNode = document) {
  const element = root.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour deve ser usado dentro de TourProvider');
  return ctx;
}

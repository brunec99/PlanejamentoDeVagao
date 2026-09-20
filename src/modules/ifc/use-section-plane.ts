'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Federation } from './fragments-stage';
import { createSectionController, DEFAULT_SECTION_CUT, sectionBounds, sectionPlaneDefinition, type SectionCut, type SectionStage } from './section-plane';

export function useSectionPlane(stage: SectionStage | undefined, federation: Federation | undefined) {
  const [state, setState] = useState<{ target: Federation | undefined; cut: SectionCut }>();
  const [failure, setFailure] = useState<{ target: Federation; message: string }>();
  const controller = useRef<ReturnType<typeof createSectionController> | undefined>(undefined);
  const bounds = useMemo(() => federation ? sectionBounds(federation.models) : undefined, [federation]);
  // Uma carga nova começa sem corte; a configuração da versão anterior não vaza para ela.
  const value = state?.target === federation ? state?.cut ?? DEFAULT_SECTION_CUT : DEFAULT_SECTION_CUT;
  const available = !!stage && !!bounds && !!sectionPlaneDefinition(bounds, { ...DEFAULT_SECTION_CUT, enabled: true });

  useEffect(() => {
    if (!stage || !federation || !bounds) return;
    const instance = createSectionController(stage, federation, bounds, () => {
      setFailure({ target: federation, message: 'Não foi possível atualizar o seccionamento. Recarregue a geometria.' });
    });
    controller.current = instance;
    return () => { instance.dispose(); controller.current = undefined; };
  }, [stage, federation, bounds]);

  useEffect(() => { controller.current?.set(value); }, [stage, federation, value]);

  const setValue = (cut: SectionCut) => { setFailure(undefined); setState({ target: federation, cut }); };
  return { value, setValue, available, error: failure?.target === federation ? failure?.message : undefined, reset: () => setValue(DEFAULT_SECTION_CUT) };
}

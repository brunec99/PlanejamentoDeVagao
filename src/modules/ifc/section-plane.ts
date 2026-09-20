import type * as THREE from 'three';
import type { FragmentsModel, FragmentsModels } from '@thatopen/fragments';

export interface SectionCut { enabled: boolean; axis: 'x' | 'y' | 'z'; position: number; inverted: boolean }
export const DEFAULT_SECTION_CUT: SectionCut = { enabled: false, axis: 'y', position: 50, inverted: false };
interface Point { x: number; y: number; z: number }
export interface SectionBounds { min: Point; max: Point }
export interface SectionStage {
  three: Pick<typeof THREE, 'Plane' | 'Vector3'>;
  renderer: Pick<THREE.WebGLRenderer, 'clippingPlanes'>;
}
interface SectionModels {
  models: { model: Pick<FragmentsModel, 'box' | 'getClippingPlanesEvent'> }[];
  fragments: { settings: Pick<FragmentsModels['settings'], 'maxUpdateRate'>; update: FragmentsModels['update'] };
}
const axes = ['x', 'y', 'z'] as const;

/** As caixas do Fragments já estão em coordenadas da cena, inclusive suas transformações. */
export function sectionBounds(models: SectionModels['models']): SectionBounds {
  const bounds: SectionBounds = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  for (const { model } of models) {
    const box = model.box;
    if (box.isEmpty()) continue;
    for (const axis of axes) {
      bounds.min[axis] = Math.min(bounds.min[axis], box.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], box.max[axis]);
    }
  }
  return bounds;
}

export function sectionPlaneDefinition(bounds: SectionBounds, cut: SectionCut): { normal: [number, number, number]; constant: number } | undefined {
  if (!cut.enabled || !Number.isFinite(cut.position) || !axes.includes(cut.axis)) return;
  if (axes.some(axis => !Number.isFinite(bounds.min[axis]) || !Number.isFinite(bounds.max[axis]) || bounds.max[axis] < bounds.min[axis])) return;
  const position = Math.max(0, Math.min(100, cut.position)) / 100;
  const location = bounds.min[cut.axis] * (1 - position) + bounds.max[cut.axis] * position;
  const sign = cut.inverted ? 1 : -1;
  const normal: [number, number, number] = [0, 0, 0];
  normal[axes.indexOf(cut.axis)] = sign;
  // Three e Fragments mantêm o semiespaço com distância ao plano >= 0.
  return { normal, constant: -sign * location };
}

/** Compartilha o plano global com o renderer, o descarte de tiles e o raycast do worker. */
export function createSectionController(stage: SectionStage, federation: SectionModels, bounds: SectionBounds, onError: (cause: unknown) => void) {
  const previousPlanes = stage.renderer.clippingPlanes;
  const planes = () => stage.renderer.clippingPlanes;
  const callbacks = federation.models.map(({ model }) => {
    const previous = model.getClippingPlanesEvent;
    model.getClippingPlanesEvent = planes;
    return { model, previous };
  });
  let disposed = false, updating = false, revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer);
    // update(true) também respeita maxUpdateRate. Uma atualização após a última alteração
    // evita perder o valor final do slider e traz de volta tiles antes removidos pelo corte.
    timer = setTimeout(() => { void refresh(); }, federation.fragments.settings.maxUpdateRate + 1);
  };
  const refresh = async () => {
    if (disposed || updating) return;
    updating = true;
    const current = revision;
    try { await federation.fragments.update(true); }
    catch (cause) { if (!disposed) onError(cause); }
    finally {
      updating = false;
      if (!disposed && current !== revision) schedule();
    }
  };
  return {
    set(cut: SectionCut) {
      if (disposed) return;
      const definition = sectionPlaneDefinition(bounds, cut);
      stage.renderer.clippingPlanes = definition ? [new stage.three.Plane(new stage.three.Vector3(...definition.normal), definition.constant)] : [];
      revision++;
      schedule();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      stage.renderer.clippingPlanes = previousPlanes;
      for (const { model, previous } of callbacks) if (model.getClippingPlanesEvent === planes) model.getClippingPlanesEvent = previous;
    },
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_APPEARANCE, isDefaultAppearance, normalizeAppearance, paintColor } from '../src/modules/federacao/appearance';

/* Cor e opacidade por modelo no modelo federado (14/10/2026). */

test('aparência guardada é conferida: modo, cor #rrggbb e opacidade entre 10% e 100%', () => {
  assert.deepEqual(normalizeAppearance({ mode: 'personalizada', color: '#FF8800', opacity: 0.4 }), {
    mode: 'personalizada',
    color: '#ff8800',
    opacity: 0.4,
  });
  assert.deepEqual(normalizeAppearance({ mode: 'outro', color: 'vermelho', opacity: 5 }), { ...DEFAULT_APPEARANCE, opacity: 1 });
  assert.equal(normalizeAppearance({ opacity: 0 }).opacity, 0.1);
  assert.deepEqual(normalizeAppearance(null), DEFAULT_APPEARANCE);
});

test('cor pintada: padrão usa a da paleta, escolhida usa a do seletor, original mantém o IFC', () => {
  assert.equal(paintColor({ ...DEFAULT_APPEARANCE }, '#1baf7a'), '#1baf7a');
  assert.equal(paintColor({ mode: 'personalizada', color: '#123456', opacity: 1 }, '#1baf7a'), '#123456');
  assert.equal(paintColor({ mode: 'original', color: '#123456', opacity: 0.5 }, '#1baf7a'), undefined);
  assert.equal(isDefaultAppearance(DEFAULT_APPEARANCE), true);
  assert.equal(isDefaultAppearance({ ...DEFAULT_APPEARANCE, opacity: 0.5 }), false);
});

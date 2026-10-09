import test from 'node:test';
import assert from 'node:assert/strict';
import { fitWidths } from '../src/modules/curto-prazo/column-widths';

const base = { empresa: 200, atividade: 400, dia: 100 };
const min = { empresa: 100, atividade: 150, dia: 40 };
const sum = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

test('Ajustar à tela reduz proporcionalmente quando há espaço acima dos mínimos', () => {
  const fitted = fitWidths(base, min, 525);
  assert.deepEqual(fitted, { empresa: 150, atividade: 300, dia: 75 });
});

test('Quem bate no mínimo para nele, e o resto divide o espaço que sobra', () => {
  // 340/700 levaria a empresa a 97 (< 100): ela para em 100 e os outros dividem os 240 restantes.
  const fitted = fitWidths(base, min, 340);
  assert.equal(fitted.empresa, 100);
  assert.deepEqual([fitted.atividade, fitted.dia], [192, 48]);
  assert.ok(sum(fitted) <= 340);
});

test('Sem espaço nem para os mínimos, fica nos mínimos (e a planilha rola de lado)', () => {
  assert.deepEqual(fitWidths(base, min, 100), min);
});

test('Tela maior que o padrão amplia proporcionalmente', () => {
  const fitted = fitWidths(base, min, 1400);
  assert.deepEqual(fitted, { empresa: 400, atividade: 800, dia: 200 });
});

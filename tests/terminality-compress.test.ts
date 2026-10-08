import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_LADDER,
  THUMB_LADDER,
  classifyFile,
  firstWithin,
  fitWithin,
  formatBytes,
  type CompressionStep,
} from '../src/modules/terminalidade/compress-image';
import { TERMINALITY_LIMITS } from '../src/domain/terminality';

test('fitWithin reduz pelo lado maior e mantém a proporção', () => {
  assert.deepEqual(fitWithin(4032, 3024, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3024, 4032, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(4000, 4000, 320), { width: 320, height: 320 });
  // Panorâmica: o lado menor nunca chega a zero.
  assert.deepEqual(fitWithin(20000, 10, 1600), { width: 1600, height: 1 });
});

test('fitWithin nunca amplia uma foto pequena', () => {
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1600, 900, 1600), { width: 1600, height: 900 });
});

test('fitWithin rejeita dimensões inválidas', () => {
  assert.throws(() => fitWithin(0, 100, 1600));
  assert.throws(() => fitWithin(100, Number.NaN, 1600));
  assert.throws(() => fitWithin(100, 100, 0));
});

test('escadas começam no alvo combinado e só pioram a cada degrau', () => {
  assert.deepEqual(IMAGE_LADDER[0], { maxSide: 1600, quality: 0.8 });
  assert.deepEqual(THUMB_LADDER[0], { maxSide: 320, quality: 0.7 });
  for (const ladder of [IMAGE_LADDER, THUMB_LADDER]) {
    for (let i = 1; i < ladder.length; i++) {
      assert.ok(ladder[i].maxSide <= ladder[i - 1].maxSide, 'lado não cresce');
      assert.ok(ladder[i].quality <= ladder[i - 1].quality, 'qualidade não cresce');
      assert.ok(ladder[i].maxSide < ladder[i - 1].maxSide || ladder[i].quality < ladder[i - 1].quality, 'cada degrau reduz algo');
    }
    for (const step of ladder) assert.ok(step.quality > 0 && step.quality <= 1);
  }
});

test('firstWithin para no primeiro degrau que cabe', async () => {
  const sizes = [3_000_000, 2_500_000, 1_800_000, 900_000];
  const tried: CompressionStep[] = [];
  const outcome = await firstWithin(IMAGE_LADDER, TERMINALITY_LIMITS.maxPhotoBytes, async step => {
    tried.push(step);
    return { size: sizes[tried.length - 1] };
  });
  assert.equal(tried.length, 3);
  assert.equal(outcome.result?.size, 1_800_000);
  assert.deepEqual(outcome.step, IMAGE_LADDER[2]);
});

test('firstWithin devolve o menor tamanho quando nada cabe', async () => {
  let call = 0;
  const outcome = await firstWithin(THUMB_LADDER, 100, async () => ({ size: [500, 300, 400][call++] }));
  assert.equal(outcome.result, undefined);
  assert.equal(outcome.smallest, 300);
  assert.equal(call, THUMB_LADDER.length);
});

test('classifyFile separa imagem, HEIC e outros arquivos', () => {
  assert.equal(classifyFile({ name: 'IMG_0001.jpg', type: 'image/jpeg' }), 'image');
  assert.equal(classifyFile({ name: 'print.png', type: 'image/png' }), 'image');
  assert.equal(classifyFile({ name: 'IMG_0002.HEIC', type: 'image/heic' }), 'heic');
  assert.equal(classifyFile({ name: 'IMG_0003.heif', type: '' }), 'heic');
  assert.equal(classifyFile({ name: 'foto.heic', type: 'application/octet-stream' }), 'heic');
  // Android às vezes manda o tipo vazio: vale a extensão.
  assert.equal(classifyFile({ name: 'camera.jpeg', type: '' }), 'image');
  assert.equal(classifyFile({ name: 'planilha.xlsx', type: 'application/vnd.ms-excel' }), 'other');
  assert.equal(classifyFile({ name: 'video.mp4', type: 'video/mp4' }), 'other');
  assert.equal(classifyFile({ name: 'sem-extensao', type: '' }), 'other');
});

test('formatBytes escreve no padrão brasileiro', () => {
  assert.equal(formatBytes(2 * 1024 * 1024), '2,0 MB');
  assert.equal(formatBytes(300 * 1024), '300 KB');
  assert.equal(formatBytes(10), '1 KB');
});

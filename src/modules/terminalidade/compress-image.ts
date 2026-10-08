import { TERMINALITY_LIMITS } from '@/domain/terminality';

/** Compressão das fotos da Terminalidade no navegador, antes de subir ao Storage. A foto do celular
 * (3 a 12 MB, 4000 px ou mais) vira um JPEG de até 1600 px no lado maior, ~300 KB, e uma miniatura
 * de 320 px para a lista. É o que segura o custo do bucket: o servidor só confere os limites.
 * As funções puras (contas de dimensão, escada de qualidade, tipo do arquivo) ficam exportadas
 * para teste sem DOM; `compressImage` é a única que precisa do navegador. */

export interface CompressionStep {
  /** Lado maior da imagem final, em pixels. */
  maxSide: number;
  /** Qualidade do JPEG (0 a 1). */
  quality: number;
}

/** Tentativas da imagem principal, da melhor para a mais enxuta. A primeira resolve quase sempre;
 * as demais só entram se o JPEG passar de `TERMINALITY_LIMITS.maxPhotoBytes` (foto muito ruidosa). */
export const IMAGE_LADDER: readonly CompressionStep[] = [
  { maxSide: 1600, quality: 0.8 },
  { maxSide: 1600, quality: 0.68 },
  { maxSide: 1400, quality: 0.6 },
  { maxSide: 1200, quality: 0.55 },
  { maxSide: 1024, quality: 0.5 },
];

/** Tentativas da miniatura. 320 px a 0,7 dá 20–40 KB; o resto é só segurança. */
export const THUMB_LADDER: readonly CompressionStep[] = [
  { maxSide: 320, quality: 0.7 },
  { maxSide: 320, quality: 0.55 },
  { maxSide: 240, quality: 0.5 },
];

/** Arquivo de origem acima disto nem é aberto: decodificar uma imagem enorme derruba a aba no celular. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** Erro com mensagem pronta para o usuário. Qualquer outro erro vira a mensagem genérica. */
export class PhotoError extends Error {}

export const UNSUPPORTED_FORMAT_MESSAGE = 'Formato não suportado; tire a foto pela câmera do sistema ou envie JPG/PNG.';

/** Reduz (nunca amplia) `width × height` para caber em `maxSide`, mantendo a proporção. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new Error('Dimensões inválidas.');
  if (!(maxSide > 0)) throw new Error('Tamanho máximo inválido.');
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Percorre a escada e devolve o primeiro resultado que cabe em `maxBytes`. Se nenhum couber,
 * devolve `undefined` junto com o menor tamanho alcançado, para a mensagem de erro. */
export async function firstWithin<T extends { size: number }>(
  ladder: readonly CompressionStep[],
  maxBytes: number,
  encode: (step: CompressionStep) => Promise<T>,
): Promise<{ result?: T; step?: CompressionStep; smallest: number }> {
  let smallest = Infinity;
  for (const step of ladder) {
    const result = await encode(step);
    smallest = Math.min(smallest, result.size);
    if (result.size <= maxBytes) return { result, step, smallest };
  }
  return { smallest };
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i;
const HEIC = /^image\/hei[cf](-sequence)?$/i;
const HEIC_EXTENSION = /\.hei[cf]$/i;

/** Classifica o arquivo antes de tentar abrir: imagem comum, HEIC/HEIF (só alguns navegadores
 * decodificam) ou algo que não é imagem. Alguns celulares mandam `type` vazio; aí vale a extensão. */
export function classifyFile(file: { name: string; type: string }): 'image' | 'heic' | 'other' {
  const type = file.type.toLowerCase();
  if (HEIC.test(type) || HEIC_EXTENSION.test(file.name)) return 'heic';
  if (type.startsWith('image/')) return 'image';
  if (!type && IMAGE_EXTENSIONS.test(file.name)) return 'image';
  return 'other';
}

/** "2,4 MB" / "310 KB", para mensagens. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ---------------------------------------------------------------------------------------------
// Parte que depende do navegador.

type Source = { draw: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeWithBitmap(file: File): Promise<Source> {
  // `from-image` aplica a orientação do EXIF: a foto em pé do celular não chega deitada.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { draw: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
}

async function decodeWithElement(file: File): Promise<Source> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('decode'));
      image.src = url;
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  // O <img> já respeita o EXIF (image-orientation: from-image é o padrão dos navegadores atuais).
  return { draw: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

async function decode(file: File): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await decodeWithBitmap(file);
    } catch {
      // Safari antigo não aceita as opções; outros falham em formatos raros. Tenta pelo <img>.
    }
  }
  return decodeWithElement(file);
}

async function encodeJpeg(source: Source, step: CompressionStep): Promise<{ blob: Blob; width: number; height: number; size: number }> {
  const { width, height } = fitWithin(source.width, source.height, step.maxSide);
  let blob: Blob | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    paint(context, source.draw, width, height);
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: step.quality });
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    paint(context, source.draw, width, height);
    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', step.quality));
    canvas.width = canvas.height = 0; // libera a memória do canvas já (importante no iPhone)
  }
  if (!blob || blob.size === 0) throw new Error('canvas');
  return { blob, width, height, size: blob.size };
}

function paint(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
) {
  // Fundo branco: PNG com transparência viraria preto no JPEG.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
}

/** Abre a foto escolhida, gira conforme o EXIF e gera o JPEG principal (≤ 1600 px) e a miniatura
 * (≤ 320 px). Rejeita com mensagem pronta para o usuário quando o arquivo não serve. */
export async function compressImage(file: File): Promise<{ image: Blob; thumb: Blob; width: number; height: number }> {
  const kind = classifyFile(file);
  if (kind === 'other') throw new PhotoError(`“${file.name}” não é uma imagem. Envie uma foto em JPG ou PNG.`);
  if (file.size === 0) throw new PhotoError(`“${file.name}” está vazio. Tire a foto de novo.`);
  if (file.size > MAX_SOURCE_BYTES)
    throw new PhotoError(
      `“${file.name}” tem ${formatBytes(file.size)}; o limite é ${formatBytes(MAX_SOURCE_BYTES)}. Envie uma foto menor.`,
    );

  let source: Source;
  try {
    source = await decode(file);
  } catch {
    // HEIC só abre no Safari; no Chrome/Android/Windows o navegador não decodifica.
    throw new PhotoError(
      kind === 'heic' ? UNSUPPORTED_FORMAT_MESSAGE : `Não foi possível abrir “${file.name}”. ${UNSUPPORTED_FORMAT_MESSAGE}`,
    );
  }
  try {
    if (!(source.width > 0) || !(source.height > 0)) throw new PhotoError(UNSUPPORTED_FORMAT_MESSAGE);
    const main = await firstWithin(IMAGE_LADDER, TERMINALITY_LIMITS.maxPhotoBytes, step => encodeJpeg(source, step));
    if (!main.result)
      throw new PhotoError(
        `Mesmo comprimida, “${file.name}” ficou com ${formatBytes(main.smallest)} (limite ${formatBytes(TERMINALITY_LIMITS.maxPhotoBytes)}). Tire a foto de novo.`,
      );
    const thumb = await firstWithin(THUMB_LADDER, TERMINALITY_LIMITS.maxThumbBytes, step => encodeJpeg(source, step));
    if (!thumb.result) throw new PhotoError(`Não foi possível gerar a miniatura de “${file.name}”.`);
    return { image: main.result.blob, thumb: thumb.result.blob, width: main.result.width, height: main.result.height };
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    throw new PhotoError(`Não foi possível preparar “${file.name}” neste navegador. ${UNSUPPORTED_FORMAT_MESSAGE}`);
  } finally {
    source.release();
  }
}

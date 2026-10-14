/** Aparência de cada modelo na cena federada (14/10/2026): o cliente escolhe a cor e a opacidade de
 * cada disciplina. Guardada no navegador por id de modelo — o mesmo id em todas as revisões e
 * composições, como a cor da paleta —, sem ir ao banco: é preferência de quem olha, não dado da obra. */

/** `paleta` = a cor padrão do sistema para a disciplina; `original` = as cores que vieram no IFC;
 * `personalizada` = a cor escolhida no seletor. */
export type ColorMode = 'paleta' | 'original' | 'personalizada';
export interface ModelAppearance {
  mode: ColorMode;
  /** `#rrggbb`, usada no modo personalizado. */
  color: string;
  /** De 0,1 a 1. */
  opacity: number;
}
export const DEFAULT_APPEARANCE: ModelAppearance = { mode: 'paleta', color: '#2a78d6', opacity: 1 };
export const MIN_OPACITY = 0.1;
const STORAGE_KEY = 'obra360:federacao:aparencia';
const HEX = /^#[0-9a-f]{6}$/i;

/** Valor lido de fora (armazenamento local) virado aparência válida; o que não serve volta ao padrão. */
export function normalizeAppearance(value: unknown): ModelAppearance {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof ModelAppearance, unknown>>;
  const mode = raw.mode === 'original' || raw.mode === 'personalizada' ? raw.mode : 'paleta';
  const color = typeof raw.color === 'string' && HEX.test(raw.color) ? raw.color.toLowerCase() : DEFAULT_APPEARANCE.color;
  const opacity = typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) ? Math.min(1, Math.max(MIN_OPACITY, raw.opacity)) : 1;
  return { mode, color, opacity };
}
export const isDefaultAppearance = (a: ModelAppearance) => a.mode === 'paleta' && a.opacity === 1;

export function readAppearances(): Record<string, ModelAppearance> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).map(([id, value]) => [id, normalizeAppearance(value)]));
  } catch {
    return {};
  }
}
export function writeAppearances(all: Record<string, ModelAppearance>) {
  try {
    // Só o que difere do padrão: a lista não cresce com modelos que ninguém mexeu.
    const kept = Object.fromEntries(Object.entries(all).filter(([, a]) => !isDefaultAppearance(a)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    // Navegação privada ou armazenamento cheio: a escolha vale só nesta visita.
  }
}

/** A cor que a cena pinta no modo "por modelo"; `undefined` = manter as cores do IFC. */
export function paintColor(appearance: ModelAppearance, paletteColor: string): string | undefined {
  if (appearance.mode === 'original') return undefined;
  return appearance.mode === 'personalizada' ? appearance.color : paletteColor;
}

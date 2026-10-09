import type { TerminalityPhoto } from '@/domain/terminality';

/** As URLs assinadas das fotos valem uma hora (`SIGNED_URL_SECONDS` no repositório). A aba releu os
 * dados por conta própria quando volta ao foco depois deste prazo, antes de a hora vencer; e, se uma
 * imagem já expirada falhar ao carregar, relê uma vez por arquivo. Lógica pura, sem React. */

export const PHOTO_URL_STALE_MS = 45 * 60 * 1000;

/** A última leitura é velha o bastante para as URLs estarem perto de vencer. */
export const isPhotoUrlStale = (fetchedAt: number | undefined, now: number, staleMs = PHOTO_URL_STALE_MS) =>
  fetchedAt !== undefined && now - fetchedAt >= staleMs;

/** Chave estável de uma URL assinada: o caminho sem o token. Uma nova leitura troca o token, não o
 * caminho, então "uma tentativa por arquivo" vale mesmo depois de recarregar. */
export const photoRetryKey = (url: string) => url.split('?')[0];

/** Devolve `true` só na primeira vez que vê cada arquivo: evita o laço "erro → recarrega → erro"
 * quando a foto sumiu do Storage de vez. */
export function createRetryOnce() {
  const seen = new Set<string>();
  return (url: string) => {
    const key = photoRetryKey(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

/** O visualizador guarda a lista de fotos de quando foi aberto; depois de uma releitura, troca cada
 * foto pela versão atual (URL nova) e mantém a antiga se ela sumiu, para a navegação não pular. */
export function refreshPhotos(snapshot: TerminalityPhoto[], current: TerminalityPhoto[]): TerminalityPhoto[] {
  if (!snapshot.length) return snapshot;
  const byId = new Map(current.map(photo => [photo.id, photo]));
  let changed = false;
  const refreshed = snapshot.map(photo => {
    const fresh = byId.get(photo.id);
    if (!fresh || fresh === photo) return photo;
    changed = true;
    return fresh;
  });
  return changed ? refreshed : snapshot;
}

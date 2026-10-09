'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import type { TerminalityPhoto } from '@/domain/terminality';
import { formatTimestamp } from '@/shared/format';
import { reportExpiredPhoto } from './api';

const KIND_LABELS = { issue: 'Problema', correction: 'Correção' } as const;
/** Deslocamento horizontal mínimo, em px, para o arrasto do dedo virar troca de foto. */
const SWIPE = 50;

/** Visualizador de fotos da pendência em tela cheia. É um `<dialog>` modal: o resto da página fica
 * inerte (o foco não sai dele) e o Esc fecha. Setas do teclado, botões e arrasto lateral no celular
 * trocam a foto; o rótulo diz se é a foto do problema ou a da correção. Quem o abre passa as fotos
 * já atualizadas (`refreshPhotos`): uma imagem com link vencido pede releitura e volta com URL nova. */
export function PhotoViewer({ photos, startIndex, onClose }: { photos: TerminalityPhoto[]; startIndex: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const swipeStart = useRef<number | undefined>(undefined);
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, photos.length - 1)));
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    closeButton.current?.focus();
  }, []);

  const count = photos.length;
  const photo = photos[Math.min(index, count - 1)];
  const go = (step: number) => count > 1 && setIndex(current => (current + step + count) % count);
  const src = photo?.url ?? photo?.thumbUrl;

  const pointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') swipeStart.current = event.clientX;
  };
  const pointerUp = (event: PointerEvent) => {
    const start = swipeStart.current;
    swipeStart.current = undefined;
    if (start === undefined) return;
    const delta = event.clientX - start;
    if (Math.abs(delta) >= SWIPE) go(delta < 0 ? 1 : -1);
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={photo ? `Foto ${index + 1} de ${count}: ${KIND_LABELS[photo.kind]}` : 'Fotos'}
      onKeyDown={event => {
        if (event.key === 'ArrowRight') go(1);
        if (event.key === 'ArrowLeft') go(-1);
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-slate-950/95 p-0 text-white backdrop:bg-slate-950/80"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            {photo && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${photo.kind === 'issue' ? 'bg-rose-500/20 text-rose-200' : 'bg-emerald-500/20 text-emerald-200'}`}
              >
                {KIND_LABELS[photo.kind]}
              </span>
            )}
            <span className="tabular-nums text-slate-300">
              {count ? `${index + 1} de ${count}` : 'Sem fotos'}
              {photo && <span className="hidden sm:inline"> · {formatTimestamp(photo.createdAt)}</span>}
            </span>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={() => dialog.current?.close()}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-slate-200 hover:bg-white/10"
          >
            <X size={18} aria-hidden />
            Fechar
          </button>
        </div>

        <div
          className="relative flex min-h-0 flex-1 touch-pan-y select-none items-center justify-center px-2 pb-4 sm:px-16"
          onPointerDown={pointerDown}
          onPointerUp={pointerUp}
          onPointerCancel={() => (swipeStart.current = undefined)}
        >
          {src && failed !== src ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, que expira: não passa pelo otimizador.
            <img
              key={src}
              src={src}
              alt={`Foto ${index + 1} de ${count}: ${photo ? KIND_LABELS[photo.kind].toLowerCase() : ''}`}
              className="max-h-full max-w-full rounded-lg object-contain"
              draggable={false}
              onError={() => {
                setFailed(src);
                reportExpiredPhoto(src);
              }}
            />
          ) : (
            <p className="flex flex-col items-center gap-2 text-sm text-slate-300">
              <ImageOff size={32} aria-hidden />
              {count
                ? 'Não foi possível abrir a foto. Se o link venceu, ela volta em instantes; senão, recarregue a página.'
                : 'Nenhuma foto.'}
            </p>
          )}
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Foto anterior"
                className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 sm:left-4"
              >
                <ChevronLeft size={22} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Próxima foto"
                className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 sm:right-4"
              >
                <ChevronRight size={22} aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, ImageOff, ImagePlus, LoaderCircle, Trash2, X } from 'lucide-react';
import { LOB_LIMITS, type LobCommand, type LobMeasurementItem, type LobPhoto } from '@/domain/lob';
import { useConfirm } from '@/modules/layout/confirm';
import { Callout } from '@/modules/planejamento/ui';
import { compressImage, PhotoError } from '@/modules/terminalidade/compress-image';
import { formatTimestamp } from '@/shared/format';
import { uploadLobPhoto } from './lob-api';

/** Fotos de um lançamento da medição (regra 21: avanço sem foto não fecha a rodada). Três peças:
 * `PhotoStrip` (miniaturas + Tirar foto/Galeria + envio), usada na linha de detalhe da tabela e no
 * cartão do celular; `PhotoDialog`, o modal aberto pelo botão "Fotos" da linha; e `PhotoViewer`, a
 * foto em tela cheia. A foto é comprimida no navegador (`compressImage`, a mesma da Terminalidade),
 * sobe ao Storage (`uploadLobPhoto`) e só então entra no banco pelo comando `add_photo`. */

export type LobExecute = (command: LobCommand) => Promise<unknown>;

/** Mesmo padrão de `plan-panels.tsx`: o `<dialog>` abre modal ao montar; fechar passa por `close()`. */
function useModal() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return { dialog, close: () => dialog.current?.close() };
}

const errorMessage = (cause: unknown, fallback: string) => (cause instanceof Error && cause.message ? cause.message : fallback);

// ─── Tela cheia ─────────────────────────────────────────────────────────────────

/** Uma foto por vez, em tela cheia: setas (botões e teclado) trocam, Esc e "Fechar" saem. Simples
 * de propósito: sem arrasto nem zoom. Link vencido mostra o ícone e orienta a recarregar. */
export function PhotoViewer({ photos, startIndex, onClose }: { photos: LobPhoto[]; startIndex: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), Math.max(0, photos.length - 1)));
  const [failed, setFailed] = useState<string>();
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    closeButton.current?.focus();
  }, []);
  const count = photos.length;
  const photo = photos[Math.min(index, Math.max(0, count - 1))];
  const src = photo?.url ?? photo?.thumbUrl;
  const go = (step: number) => count > 1 && setIndex(current => (current + step + count) % count);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={count ? `Foto ${index + 1} de ${count}` : 'Fotos'}
      onKeyDown={event => {
        if (event.key === 'ArrowRight') go(1);
        if (event.key === 'ArrowLeft') go(-1);
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-slate-950/95 p-0 text-white backdrop:bg-slate-950/80"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm tabular-nums text-slate-300">
            {count ? `${index + 1} de ${count}` : 'Sem fotos'}
            {photo && <span className="hidden sm:inline"> · {formatTimestamp(photo.createdAt)}</span>}
          </span>
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
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-16">
          {src && failed !== src ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, que expira: não passa pelo otimizador.
            <img
              key={src}
              src={src}
              alt={`Foto ${index + 1} de ${count}`}
              className="max-h-full max-w-full rounded-lg object-contain"
              draggable={false}
              onError={() => setFailed(src)}
            />
          ) : (
            <p className="flex flex-col items-center gap-2 px-6 text-center text-sm text-slate-300">
              <ImageOff size={32} aria-hidden />
              {count ? 'Não foi possível abrir a foto. Se o link venceu, recarregue a página.' : 'Nenhuma foto.'}
            </p>
          )}
          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Foto anterior"
                className="absolute top-1/2 left-2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 sm:left-4"
              >
                <ChevronLeft size={22} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Próxima foto"
                className="absolute top-1/2 right-2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60 sm:right-4"
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

// ─── Faixa de fotos ─────────────────────────────────────────────────────────────

/** Miniaturas do lançamento mais os botões de envio. Sem `item` (valor ainda não salvo) os botões
 * ficam desabilitados com a dica: a foto precisa de um lançamento para pertencer. "Tirar foto" só
 * aparece em telas de toque (`pointer-coarse`), abrindo a câmera traseira direto; "Galeria" aceita
 * várias. `needsPhoto` pinta "Tirar foto" de âmbar: houve avanço e ainda não há foto. */
export function PhotoStrip({
  workId,
  item,
  photos,
  readOnly,
  onExecute,
  needsPhoto = false,
  columns = 'grid-cols-4 sm:grid-cols-6',
  label = 'Fotos desta medição',
}: {
  workId: string;
  item: LobMeasurementItem | undefined;
  photos: LobPhoto[];
  readOnly: boolean;
  onExecute: LobExecute;
  needsPhoto?: boolean;
  columns?: string;
  label?: string;
}) {
  const confirm = useConfirm();
  const [progress, setProgress] = useState<{ current: number; total: number }>();
  const [errors, setErrors] = useState<string[]>([]);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [viewer, setViewer] = useState<number>();
  const [removing, setRemoving] = useState<string>();
  const room = Math.max(0, LOB_LIMITS.maxPhotosPerItem - photos.length);
  const uploading = progress !== undefined;
  const blocked = readOnly || !item || uploading || room === 0;

  const handle = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = ''; // permite escolher a mesma foto de novo
    if (!files.length || !item) return;
    const problems: string[] = [];
    const accepted = files.slice(0, room);
    if (files.length > room)
      problems.push(
        room === 0
          ? `Este bloco já tem ${LOB_LIMITS.maxPhotosPerItem} fotos nesta medição, o máximo.`
          : `Só cabem mais ${room} ${room === 1 ? 'foto' : 'fotos'}; ${files.length - room} ${files.length - room === 1 ? 'ficou' : 'ficaram'} de fora.`,
      );
    setErrors([]);
    for (const [index, file] of accepted.entries()) {
      setProgress({ current: index + 1, total: accepted.length });
      try {
        // Comprimir, subir ao Storage e só então registrar: o servidor confere caminho e limites.
        const compressed = await compressImage(file);
        const command = await uploadLobPhoto({ workId, itemId: item.id, ...compressed });
        await onExecute(command);
      } catch (cause) {
        problems.push(cause instanceof PhotoError ? cause.message : errorMessage(cause, `Não foi possível enviar “${file.name}”.`));
      }
    }
    setProgress(undefined);
    setErrors(problems);
  };

  const remove = async (photo: LobPhoto) => {
    const ok = await confirm({
      title: 'Excluir esta foto?',
      description: 'A foto sai da medição e do armazenamento. Se o bloco avançou nesta medição, ele volta a precisar de foto.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    setRemoving(photo.id);
    try {
      await onExecute({ type: 'delete_photo', photoId: photo.id });
    } catch (cause) {
      setErrors([errorMessage(cause, 'Não foi possível excluir a foto.')]);
    } finally {
      setRemoving(undefined);
    }
  };

  const pickerClass = (extra = '') =>
    `button-ghost min-h-10 cursor-pointer px-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-ring ${
      blocked ? 'pointer-events-none opacity-50' : ''
    } ${extra}`;
  const hint = !item
    ? 'Salve o realizado para anexar fotos.'
    : uploading
      ? ''
      : readOnly
        ? ''
        : `${photos.length} de ${LOB_LIMITS.maxPhotosPerItem}`;

  return (
    <div className="space-y-2">
      {photos.length > 0 && (
        <ul className={`grid gap-2 ${columns}`} aria-label={label}>
          {photos.map((photo, index) => {
            const src = photo.thumbUrl ?? photo.url;
            return (
              <li key={photo.id} className="relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <button
                  type="button"
                  onClick={() => setViewer(index)}
                  aria-label={`Ampliar foto ${index + 1}`}
                  className="block h-full w-full focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:outline-none"
                >
                  {src && !failed.has(src) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, de vida curta
                    <img
                      key={src}
                      src={src}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={() => setFailed(current => new Set(current).add(src))}
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center text-slate-400">
                      <ImageOff size={20} aria-hidden />
                    </span>
                  )}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    disabled={removing === photo.id}
                    onClick={() => remove(photo)}
                    aria-label={`Excluir foto ${index + 1}`}
                    className="absolute top-1 right-1 grid h-8 w-8 place-items-center rounded-full bg-slate-900/65 text-white shadow transition-colors hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Rótulo com o input dentro: no iPhone, abrir um input escondido por `click()` falha às vezes. */}
          <label
            className={pickerClass(
              `hidden pointer-coarse:inline-flex ${needsPhoto && !blocked ? 'border-warning-ring bg-warning-soft text-warning hover:bg-amber-100' : ''}`,
            )}
            aria-disabled={blocked}
            title={needsPhoto ? 'Avanço sem foto' : undefined}
          >
            <Camera size={16} aria-hidden />
            Tirar foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={blocked}
              onChange={event => handle(event.currentTarget)}
            />
          </label>
          <label className={pickerClass()} aria-disabled={blocked}>
            <ImagePlus size={16} aria-hidden />
            <span className="pointer-coarse:hidden">Escolher fotos</span>
            <span className="hidden pointer-coarse:inline">Galeria</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={blocked}
              onChange={event => handle(event.currentTarget)}
            />
          </label>
          <span className="text-xs text-slate-500" aria-live="polite">
            {progress ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-primary-ink">
                <LoaderCircle size={14} className="animate-spin" aria-hidden />
                {progress.total > 1 ? `Enviando ${progress.current} de ${progress.total}…` : 'Enviando foto…'}
              </span>
            ) : (
              hint
            )}
          </span>
        </div>
      )}
      {readOnly && photos.length === 0 && <p className="text-xs text-slate-500">Sem fotos nesta medição.</p>}
      {errors.length > 0 && (
        <Callout tone="danger" role="alert">
          {errors.map((message, index) => (
            <span key={index} className="block">
              {message}
            </span>
          ))}
        </Callout>
      )}
      {viewer !== undefined && <PhotoViewer photos={photos} startIndex={viewer} onClose={() => setViewer(undefined)} />}
    </div>
  );
}

// ─── Modal ──────────────────────────────────────────────────────────────────────

/** O botão "Fotos" da linha abre este modal: a faixa de fotos do lançamento com a contagem. */
export function PhotoDialog({
  workId,
  item,
  photos,
  readOnly,
  onExecute,
  onClose,
  title = 'Fotos do bloco',
  subtitle,
  needsPhoto = false,
}: {
  workId: string;
  item: LobMeasurementItem | undefined;
  photos: LobPhoto[];
  readOnly: boolean;
  onExecute: LobExecute;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  needsPhoto?: boolean;
}) {
  const { dialog, close } = useModal();
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="lob-photos-title"
      className="m-auto max-h-[90vh] w-[min(40rem,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            {subtitle && <p className="eyebrow">{subtitle}</p>}
            <h3 id="lob-photos-title" className="mt-1 text-base font-bold text-slate-900">
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {photos.length} de {LOB_LIMITS.maxPhotosPerItem} fotos nesta medição
              {needsPhoto && <span className="ml-2 font-semibold text-warning">· avanço sem foto</span>}
            </p>
          </div>
          <button type="button" className="button-ghost shrink-0" onClick={close}>
            Fechar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <PhotoStrip
            workId={workId}
            item={item}
            photos={photos}
            readOnly={readOnly}
            onExecute={onExecute}
            needsPhoto={needsPhoto}
            columns="grid-cols-3 sm:grid-cols-4"
          />
          {!readOnly && (
            <p className="mt-3 text-xs text-slate-500">
              A foto é comprimida no navegador antes de subir (1600 px, ~300 KB) e fica no bucket privado da obra.
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}

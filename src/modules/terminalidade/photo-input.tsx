'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImageOff, ImagePlus, LoaderCircle, Trash2, X } from 'lucide-react';
import type { TerminalityCommand, TerminalityPhoto, TerminalityPhotoKind } from '@/domain/terminality';
import { Callout } from '@/modules/planejamento/ui';
import { compressImage, PhotoError } from './compress-image';
import { uploadTerminalityPhoto } from './api';

/** Foto escolhida e já comprimida no navegador, ainda não enviada. */
export interface PendingPhoto {
  id: string;
  name: string;
  image: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

/** Seletor de fotos da Terminalidade. No celular (toque) mostra "Tirar foto", que abre a câmera
 * traseira direto, e "Galeria", com várias de uma vez; no computador, um botão só. Cada foto é
 * comprimida assim que é escolhida (`compressImage`), e o pai recebe as prontas em `onChange`.
 * O envio fica com quem usa o seletor, porque a pendência precisa existir antes da foto. */
export function PhotoInput({
  value,
  onChange,
  max,
  disabled = false,
  onBusyChange,
  emptyHint,
}: {
  value: PendingPhoto[];
  onChange: (next: PendingPhoto[]) => void;
  /** Quantas fotos ainda cabem (já descontadas as que a pendência tem). */
  max: number;
  disabled?: boolean;
  /** Avisa enquanto há foto sendo preparada, para o pai segurar o botão de salvar. */
  onBusyChange?: (busy: boolean) => void;
  emptyHint?: string;
}) {
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const [progress, setProgress] = useState<{ current: number; total: number }>();
  const [errors, setErrors] = useState<string[]>([]);
  const preparing = progress !== undefined;
  const room = Math.max(0, max - value.length);
  const blocked = disabled || preparing || room === 0;

  const handle = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = ''; // permite escolher a mesma foto de novo depois de removê-la
    if (files.length === 0) return;
    const problems: string[] = [];
    const free = Math.max(0, max - latest.current.length);
    const accepted = files.slice(0, free);
    if (files.length > free)
      problems.push(
        free === 0
          ? 'O limite de fotos desta pendência já foi atingido.'
          : `Só cabem mais ${free} ${free === 1 ? 'foto' : 'fotos'}; ${files.length - free} ${files.length - free === 1 ? 'ficou' : 'ficaram'} de fora.`,
      );
    setErrors([]);
    if (accepted.length) {
      onBusyChange?.(true);
      for (const [index, file] of accepted.entries()) {
        setProgress({ current: index + 1, total: accepted.length });
        try {
          const compressed = await compressImage(file);
          const next = [...latest.current, { id: crypto.randomUUID(), name: file.name, ...compressed }];
          latest.current = next;
          onChange(next);
        } catch (cause) {
          problems.push(cause instanceof PhotoError ? cause.message : `Não foi possível preparar “${file.name}”.`);
        }
      }
      setProgress(undefined);
      onBusyChange?.(false);
    }
    setErrors(problems);
  };

  const remove = (id: string) => {
    const next = latest.current.filter(photo => photo.id !== id);
    latest.current = next;
    onChange(next);
  };

  const pickerClass = (extra = '') =>
    `button-ghost min-h-12 cursor-pointer px-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-ring ${
      blocked ? 'pointer-events-none opacity-50' : ''
    } ${extra}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Rótulo com o input dentro: no iPhone, abrir um input escondido por `click()` falha às vezes. */}
        <label className={pickerClass('hidden pointer-coarse:inline-flex')} aria-disabled={blocked}>
          <Camera size={18} aria-hidden />
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
          <ImagePlus size={18} aria-hidden />
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
              {progress.total > 1 ? `Preparando foto ${progress.current} de ${progress.total}…` : 'Preparando foto…'}
            </span>
          ) : room === 0 && max > 0 ? (
            'Limite de fotos atingido.'
          ) : max === 0 ? (
            'Esta pendência já tem o máximo de fotos.'
          ) : value.length === 0 && emptyHint ? (
            emptyHint
          ) : null}
        </span>
      </div>

      {errors.length > 0 && (
        <Callout tone="danger" role="alert">
          {errors.map((message, index) => (
            <span key={index} className="block">
              {message}
            </span>
          ))}
        </Callout>
      )}

      {value.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Fotos a enviar">
          {value.map((photo, index) => (
            <li key={photo.id} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              <BlobImage blob={photo.thumb} alt={`Foto ${index + 1} a enviar`} className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 rounded bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                Não enviada
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(photo.id)}
                  aria-label={`Remover a foto ${index + 1}`}
                  className="absolute top-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-slate-900/65 text-white shadow transition-colors hover:bg-rose-700"
                >
                  <X size={18} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Mostra um Blob local sem guardar URL em estado: cria a URL ao montar e a libera quando a
 * imagem carrega (a imagem decodificada continua na tela) ou quando o elemento sai. */
function BlobImage({ blob, alt, className }: { blob: Blob; alt: string; className?: string }) {
  const ref = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image) return;
      const url = URL.createObjectURL(blob);
      const release = () => URL.revokeObjectURL(url);
      image.addEventListener('load', release, { once: true });
      image.addEventListener('error', release, { once: true });
      image.src = url;
      return release;
    },
    [blob],
  );
  // eslint-disable-next-line @next/next/no-img-element -- URL local (blob:), sem otimização do Next
  return <img ref={ref} alt={alt} className={className} />;
}

/** Grade das fotos já enviadas (miniaturas por URL assinada). Toque abre a foto grande; a lixeira,
 * quando há `onDelete`, pede confirmação a quem chama. */
export function PhotoGrid({
  photos,
  label,
  onOpen,
  onDelete,
  disabled = false,
}: {
  photos: TerminalityPhoto[];
  label: string;
  onOpen: (index: number) => void;
  onDelete?: (photo: TerminalityPhoto) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={label}>
      {photos.map((photo, index) => (
        <li key={photo.id} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          <button
            type="button"
            onClick={() => onOpen(index)}
            aria-label={`Ampliar ${label.toLowerCase()} ${index + 1}`}
            className="block h-full w-full focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:outline-none"
          >
            {photo.thumbUrl || photo.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, de vida curta
              <img src={photo.thumbUrl ?? photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-slate-400">
                <ImageOff size={22} aria-hidden />
              </span>
            )}
          </button>
          {onDelete && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onDelete(photo)}
              aria-label={`Excluir ${label.toLowerCase()} ${index + 1}`}
              className="absolute top-1 right-1 grid h-9 w-9 place-items-center rounded-full bg-slate-900/65 text-white shadow transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              <Trash2 size={16} aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Envia as fotos pendentes uma a uma: Storage (`uploadTerminalityPhoto`) e depois `add_photo`.
 * Cada foto confirmada sai da fila por `onUploaded`; na primeira falha, para e lança um erro
 * dizendo qual foto falhou — as que já subiram ficam na pendência e as outras continuam na fila
 * para uma nova tentativa. */
export async function uploadPendingPhotos({
  workId,
  itemId,
  kind,
  photos,
  execute,
  onProgress,
  onUploaded,
}: {
  workId: string;
  itemId: string;
  kind: TerminalityPhotoKind;
  photos: PendingPhoto[];
  execute: (command: TerminalityCommand) => Promise<void>;
  onProgress: (current: number, total: number) => void;
  onUploaded: (pendingId: string) => void;
}) {
  for (const [index, photo] of photos.entries()) {
    onProgress(index + 1, photos.length);
    try {
      const command = await uploadTerminalityPhoto({
        workId,
        itemId,
        kind,
        image: photo.image,
        thumb: photo.thumb,
        width: photo.width,
        height: photo.height,
      });
      await execute(command);
    } catch (cause) {
      const detail = cause instanceof Error && cause.message ? cause.message : 'Falha na comunicação com o servidor.';
      const which = photos.length > 1 ? `A foto ${index + 1} de ${photos.length}` : 'A foto';
      throw new Error(`${which} não foi enviada. ${detail}`);
    }
    onUploaded(photo.id);
  }
}

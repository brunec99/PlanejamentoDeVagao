'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Camera, Eraser, X } from 'lucide-react';
import { CHECKLIST_LIMITS } from '@/domain/equipment-checklist';

/** Campos da inspeção que a tela logada e a tela do operador (QR) dividem, desde 12/11/2026: o quadro de
 * assinatura e as fotos. Os dois entregam base64 puro (sem o prefixo `data:`), que vai dentro do comando. */

const SIGN_WIDTH = 600;
const SIGN_HEIGHT = 220;

/** Quadro de assinatura: o dedo (ou o mouse) desenha num canvas de fundo branco, e cada traço terminado
 * entrega o PNG. "Limpar" zera. `touch-action: none` impede a página de rolar enquanto a pessoa assina. */
export function SignaturePad({ onChange, disabled }: { onChange: (png: string | undefined) => void; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);

  const blank = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#0a364d';
    context.lineWidth = 3.5;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  };
  useEffect(blank, []);

  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const box = canvas.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * canvas.width, y: ((event.clientY - box.top) / box.height) * canvas.height };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
    // Um toque sem arrastar também marca (o pingo do i).
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setSigned(true);
    onChange(canvasRef.current!.toDataURL('image/png').split(',')[1]);
  };

  return (
    <div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={SIGN_WIDTH}
          height={SIGN_HEIGHT}
          role="img"
          aria-label={signed ? 'Assinatura desenhada' : 'Quadro de assinatura, em branco'}
          data-testid="signature-pad"
          className="block w-full touch-none rounded-xl border-2 border-dashed border-slate-300 bg-white"
          style={{ aspectRatio: `${SIGN_WIDTH} / ${SIGN_HEIGHT}` }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        {!signed && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-slate-400">
            Assine aqui com o dedo
          </span>
        )}
      </div>
      {signed && !disabled && (
        <button
          type="button"
          className="text-link mt-1 inline-flex items-center gap-1 text-xs"
          onClick={() => {
            blank();
            setSigned(false);
            onChange(undefined);
          }}
        >
          <Eraser size={13} aria-hidden />
          Limpar e assinar de novo
        </button>
      )}
    </div>
  );
}

/** Foto no formulário: `data` é o JPEG novo em base64; `url` é a foto já gravada (URL assinada). */
export interface PhotoDraft {
  id: string;
  data?: string;
  url?: string;
}

const PHOTO_STEPS = [
  { side: 1280, quality: 0.72 },
  { side: 1280, quality: 0.6 },
  { side: 1024, quality: 0.55 },
  { side: 800, quality: 0.5 },
];
/** Teto do JPEG de cada foto (~600 KB): quatro delas, mais a assinatura, cabem folgadas num envio só. */
const PHOTO_BYTES = 600 * 1024;

async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // cai no <img>
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('decode'));
    image.src = url;
  }).catch(error => {
    URL.revokeObjectURL(url);
    throw error;
  });
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

/** Reduz a foto do celular (vários MB) a um JPEG de até 1280 px e ~600 KB, em base64. */
export async function compressChecklistPhoto(file: File): Promise<string> {
  const image = await loadImage(file);
  try {
    for (const step of PHOTO_STEPS) {
      const scale = Math.min(1, step.side / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', step.quality).split(',')[1] ?? '';
      canvas.width = canvas.height = 0;
      if (data && data.length * 0.75 <= PHOTO_BYTES) return data;
    }
    throw new Error('size');
  } finally {
    image.release();
  }
}

/** Fotos da inspeção: até `CHECKLIST_LIMITS.photos`, opcionais. O celular oferece câmera ou galeria. */
export function PhotoPicker({
  photos,
  onChange,
  disabled,
}: {
  photos: PhotoDraft[];
  onChange: (update: (current: PhotoDraft[]) => PhotoDraft[]) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const room = CHECKLIST_LIMITS.photos - photos.length;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    setBusy(true);
    try {
      for (const file of [...files].slice(0, room)) {
        try {
          const data = await compressChecklistPhoto(file);
          onChange(current => (current.length >= CHECKLIST_LIMITS.photos ? current : [...current, { id: crypto.randomUUID(), data }]));
        } catch {
          setError('Não foi possível usar uma das fotos. Tire de novo pela câmera ou envie JPG/PNG.');
        }
      }
      if (files.length > room) setError(`Só cabem ${CHECKLIST_LIMITS.photos} fotos por inspeção.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        {photos.map((photo, index) => (
          <li key={photo.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto local (base64) ou URL assinada do bucket privado */}
            <img
              src={photo.data ? `data:image/jpeg;base64,${photo.data}` : photo.url}
              alt={`Foto ${index + 1} da inspeção`}
              className="size-20 rounded-lg border border-slate-200 bg-slate-100 object-cover"
            />
            {!disabled && (
              <button
                type="button"
                aria-label={`Remover a foto ${index + 1}`}
                className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-slate-800 text-white shadow"
                onClick={() => onChange(current => current.filter(other => other.id !== photo.id))}
              >
                <X size={13} aria-hidden />
              </button>
            )}
          </li>
        ))}
        {room > 0 && !disabled && (
          <li>
            <label className="grid size-20 cursor-pointer place-items-center rounded-lg border-2 border-dashed border-slate-300 text-slate-500 hover:border-primary hover:text-primary-ink">
              <span className="flex flex-col items-center gap-0.5 text-[11px] font-medium">
                <Camera size={20} aria-hidden />
                {busy ? 'Aguarde…' : 'Adicionar'}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                aria-label="Adicionar foto"
                disabled={busy}
                onChange={event => {
                  void add(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

'use client';
import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';

/** Largura das colunas da planilha, ajustável arrastando a borda do cabeçalho, como no Sheets. Fica
 * guardada no navegador de cada pessoa (localStorage): é preferência de quem lê, não dado da obra.
 * Sem o armazenamento (janela anônima, bloqueio), a planilha abre com as larguras padrão. */
export const MIN_COLUMN_WIDTH = 40;

export function useColumnWidths(storageKey: string, defaults: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(defaults);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, unknown>;
      const valid = Object.fromEntries(
        Object.entries(saved).filter(([key, value]) => key in defaults && typeof value === 'number' && value >= MIN_COLUMN_WIDTH),
      ) as Record<string, number>;
      // Carrega depois da montagem: no servidor não há localStorage, e ler na renderização desalinharia a hidratação.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Object.keys(valid).length) setWidths(current => ({ ...current, ...valid }));
    } catch {}
    // As larguras padrão são constantes de quem chama; só a chave decide quando reler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const persist = useCallback(
    (next: Record<string, number>) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
    },
    [storageKey],
  );
  const resize = useCallback(
    (column: string, width: number) =>
      setWidths(current => {
        const next = { ...current, [column]: Math.max(MIN_COLUMN_WIDTH, Math.round(width)) };
        persist(next);
        return next;
      }),
    [persist],
  );
  const reset = useCallback(
    (column?: string) =>
      setWidths(current => {
        const next = column ? { ...current, [column]: defaults[column] } : { ...defaults };
        persist(next);
        return next;
      }),
    [defaults, persist],
  );
  const total = Object.values(widths).reduce((sum, w) => sum + w, 0);
  return { widths, resize, reset, total };
}

/** Alça na borda direita do cabeçalho. Arrastar muda a largura; duplo clique volta ao padrão. O
 * teclado também ajusta (setas, com foco na alça), para não depender do mouse. */
export function ColumnResizeHandle({
  label,
  width,
  onResize,
  onReset,
}: {
  label: string;
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}) {
  const start = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    const originWidth = width;
    const move = (e: PointerEvent) => onResize(originWidth + e.clientX - originX);
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Largura da coluna ${label}`}
      aria-valuenow={width}
      aria-valuemin={MIN_COLUMN_WIDTH}
      tabIndex={0}
      title="Arraste para mudar a largura · duplo clique volta ao padrão"
      onPointerDown={start}
      onDoubleClick={event => {
        event.stopPropagation();
        onReset();
      }}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          onResize(width + (event.key === 'ArrowRight' ? 16 : -16));
        }
      }}
      className="absolute top-0 right-0 z-10 h-full w-2 cursor-col-resize touch-none select-none border-r-2 border-transparent hover:border-primary focus-visible:border-primary focus-visible:outline-none"
    />
  );
}

'use client';
import { useCallback, useEffect, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';

/** Largura das colunas da planilha, ajustável arrastando a borda do cabeçalho, como no Sheets. Fica
 * guardada no navegador de cada pessoa (localStorage): é preferência de quem lê, não dado da obra.
 * Sem o armazenamento (janela anônima, bloqueio), a planilha abre ajustada à tela. */
export const MIN_COLUMN_WIDTH = 40;

/** Cabe na largura disponível: reduz (ou amplia) proporcionalmente as larguras-base, sem descer do
 * mínimo de cada coluna. Se nem os mínimos cabem, fica nos mínimos e a planilha rola de lado. */
export function fitWidths(base: Record<string, number>, minimums: Record<string, number>, available: number): Record<string, number> {
  const keys = Object.keys(base);
  const result = { ...base };
  let flexible = keys;
  let room = available;
  // Algumas passadas: quem bate no mínimo sai da conta e o resto divide o espaço que sobra.
  for (let pass = 0; pass < keys.length && flexible.length; pass++) {
    const total = flexible.reduce((sum, k) => sum + base[k], 0);
    const scale = room / total;
    const clamped = flexible.filter(k => base[k] * scale < (minimums[k] ?? MIN_COLUMN_WIDTH));
    if (!clamped.length) {
      flexible.forEach(k => (result[k] = Math.floor(base[k] * scale)));
      return result;
    }
    clamped.forEach(k => {
      result[k] = minimums[k] ?? MIN_COLUMN_WIDTH;
      room -= result[k];
    });
    flexible = flexible.filter(k => !clamped.includes(k));
    if (room <= 0) break;
  }
  flexible.forEach(k => (result[k] = minimums[k] ?? MIN_COLUMN_WIDTH));
  return result;
}

export function useColumnWidths(storageKey: string, defaults: Record<string, number>, minimums: Record<string, number> = {}) {
  const [widths, setWidths] = useState<Record<string, number>>(defaults);
  /** A pessoa já escolheu larguras (arrastando ou ajustando): não se ajusta mais sozinho. */
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, unknown>;
      const valid = Object.fromEntries(
        Object.entries(stored).filter(([key, value]) => key in defaults && typeof value === 'number' && value >= MIN_COLUMN_WIDTH),
      ) as Record<string, number>;
      // Carrega depois da montagem: no servidor não há localStorage, e ler na renderização desalinharia a hidratação.
      if (Object.keys(valid).length) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWidths(current => ({ ...current, ...valid }));
        setSaved(true);
      }
    } catch {}
    // As larguras padrão são constantes de quem chama; só a chave decide quando reler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const persist = useCallback(
    (next: Record<string, number> | null) => {
      try {
        if (next) localStorage.setItem(storageKey, JSON.stringify(next));
        else localStorage.removeItem(storageKey);
      } catch {}
    },
    [storageKey],
  );
  const resize = useCallback(
    (column: string, width: number) => {
      setSaved(true);
      setWidths(current => {
        const next = { ...current, [column]: Math.max(minimums[column] ?? MIN_COLUMN_WIDTH, Math.round(width)) };
        persist(next);
        return next;
      });
    },
    [minimums, persist],
  );
  /** Ajusta à largura visível. `remember` grava como preferência (botão); o ajuste automático não grava. */
  const fit = useCallback(
    (available: number, remember: boolean) => {
      if (available <= 0) return;
      const next = fitWidths(defaults, minimums, available);
      setWidths(next);
      if (remember) {
        setSaved(true);
        persist(next);
      }
    },
    [defaults, minimums, persist],
  );
  const reset = useCallback(
    (column: string) =>
      setWidths(current => {
        const next = { ...current, [column]: defaults[column] };
        persist(next);
        return next;
      }),
    [defaults, persist],
  );
  const total = Object.values(widths).reduce((sum, w) => sum + w, 0);
  return { widths, resize, fit, reset, total, saved };
}

/** Telas largas (lg, 1024 px) desenham a tabela; as estreitas, os cartões. Desenhar as duas e esconder
 * uma com CSS dobrava a página (46 mil elementos numa semana de 120 linhas, 09/10/2026). */
export function useWideScreen(): boolean {
  return useSyncExternalStore(
    notify => {
      const query = window.matchMedia('(min-width: 1024px)');
      query.addEventListener('change', notify);
      return () => query.removeEventListener('change', notify);
    },
    () => window.matchMedia('(min-width: 1024px)').matches,
    () => true,
  );
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

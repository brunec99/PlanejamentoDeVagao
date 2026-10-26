'use client';
import { useEffect, useRef, type JSX, type PointerEvent as ReactPointerEvent } from 'react';

/** Alça de preenchimento da planilha semanal, como no Google Sheets: o quadradinho no canto inferior
 * direito da célula; arrastar para baixo (ou para cima) copia o valor da célula de origem nas linhas
 * por onde o ponteiro passou. Só mouse/toque; o teclado fica com a barra de seleção da planilha. */
export type FillColumn = 'status' | 'causas' | 'justificativa';

/** Classe do tema (globals.css) usada para realçar as linhas alvo durante o arrasto. */
const HIGHLIGHT_CLASS = 'fill-target';

/** Ids das linhas entre a origem e o alvo, na ordem da tela (de cima para baixo, mesmo arrastando para
 * cima), sem a origem. Vazio se alvo === origem ou se algum dos dois não está na ordem. */
export function rowsBetween(orderedIds: readonly string[], sourceId: string, targetId: string): string[] {
  const source = orderedIds.indexOf(sourceId);
  const target = orderedIds.indexOf(targetId);
  if (source < 0 || target < 0 || source === target) return [];
  return target > source ? orderedIds.slice(source + 1, target + 1) : orderedIds.slice(target, source);
}

/** Linha sob o Y do ponteiro, dados os retângulos das linhas na ordem da tela. Acima da primeira vale
 * a primeira; abaixo da última, a última. Num vão entre duas linhas (espaçamento de borda) vale a
 * mais próxima e, em empate, a de cima — assim o alvo só muda quando o ponteiro realmente cruza a
 * metade do vão, nos dois sentidos do arrasto. */
export function rowAtY(rows: readonly { id: string; top: number; bottom: number }[], y: number): string | undefined {
  if (!rows.length) return undefined;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (y < row.top) {
      if (i === 0) return row.id;
      const above = rows[i - 1];
      return y - above.bottom <= row.top - y ? above.id : row.id;
    }
    if (y <= row.bottom) return row.id;
  }
  return rows[rows.length - 1].id;
}

export function FillHandle({
  rowId,
  column,
  disabled,
  onFill,
}: {
  rowId: string;
  column: FillColumn;
  disabled?: boolean;
  /** Chamado ao soltar, com as linhas alvo (sem a origem), já na ordem da tela. Não é chamado sem alvo. */
  onFill: (column: FillColumn, sourceId: string, targetIds: string[]) => void;
}): JSX.Element | null {
  /** Desfaz o arrasto em curso (realce, cursor, listeners); também roda se a alça sumir no meio dele. */
  const abort = useRef<(() => void) | null>(null);
  useEffect(() => () => abort.current?.(), []);
  if (disabled) return null;

  const start = (event: ReactPointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const body = handle.closest('tbody');
    if (!body) return;
    // Ordem e retângulos medidos uma vez só, no início: medir a tabela inteira a cada pixel travaria o arrasto.
    const trs = Array.from(body.querySelectorAll<HTMLTableRowElement>('tr[data-row-id]')).filter(tr => tr.dataset.rowId);
    const byId = new Map(trs.map(tr => [tr.dataset.rowId as string, tr]));
    const rects = trs.map(tr => {
      const rect = tr.getBoundingClientRect();
      return { id: tr.dataset.rowId as string, top: rect.top, bottom: rect.bottom };
    });
    const ids = rects.map(rect => rect.id);
    // Se a página (ou o contêiner) rolar durante o arrasto, as linhas se deslocam na tela; o deslocamento
    // do tbody devolve o Y do ponteiro ao referencial dos retângulos medidos no início.
    const bodyTop = body.getBoundingClientRect().top;

    handle.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'none';

    // O realce mexe direto no DOM, sem estado React: redesenhar a planilha a cada pixel seria lento.
    const highlighted = new Set<HTMLTableRowElement>();
    let targets: string[] = [];
    const paint = (next: string[]) => {
      const keep = new Set(next.map(id => byId.get(id)).filter((tr): tr is HTMLTableRowElement => !!tr));
      highlighted.forEach(tr => {
        if (!keep.has(tr)) {
          tr.classList.remove(HIGHLIGHT_CLASS);
          highlighted.delete(tr);
        }
      });
      keep.forEach(tr => {
        if (!highlighted.has(tr)) {
          tr.classList.add(HIGHLIGHT_CLASS);
          highlighted.add(tr);
        }
      });
    };
    const move = (e: PointerEvent) => {
      const under = rowAtY(rects, e.clientY + (bodyTop - body.getBoundingClientRect().top));
      targets = under ? rowsBetween(ids, rowId, under) : [];
      paint(targets);
    };
    const teardown = () => {
      paint([]);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', finish);
      handle.removeEventListener('pointercancel', cancel);
      abort.current = null;
    };
    const finish = () => {
      const filled = targets;
      teardown();
      if (filled.length) onFill(column, rowId, filled);
    };
    // Cancelamento (o navegador tomou o ponteiro, p.ex. rolagem por toque) não preenche: um gesto
    // interrompido não pode sobrescrever dezenas de linhas.
    const cancel = () => teardown();
    abort.current = teardown;
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', cancel);
  };

  return (
    <span
      aria-hidden
      title="Arraste para copiar este valor nas linhas vizinhas"
      onPointerDown={start}
      onClick={event => event.stopPropagation()}
      className="absolute -right-0.5 -bottom-0.5 z-10 h-2.5 w-2.5 cursor-crosshair touch-none rounded-sm border border-white bg-primary opacity-0 select-none group-hover:opacity-100 group-focus-within:opacity-100"
    />
  );
}

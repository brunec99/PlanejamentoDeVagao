/** Navegação por teclado na planilha do curto prazo (26/10/2026), como no Sheets: Enter e as setas para
 * cima e para baixo levam o foco à mesma coluna da linha vizinha, e o foco que sai da célula é o que grava.
 * Cada célula editável marca a coluna com `data-col`; cada linha é um `tr[data-row-id]`. As faixas das
 * semanas vizinhas e a linha em branco não têm `data-row-id`, então são puladas. */

export type RowStep = 1 | -1;

/** Posição da linha vizinha na ordem da tela; -1 quando não há (primeira para cima, última para baixo). Puro. */
export function siblingRowIndex(rowIds: readonly string[], fromId: string, step: RowStep): number {
  const index = rowIds.indexOf(fromId);
  if (index < 0) return -1;
  const next = index + step;
  return next >= 0 && next < rowIds.length ? next : -1;
}

/** O que a tecla pede: descer, subir ou nada. Enter desce (Shift+Enter sobe), como no Sheets; as setas
 * só valem onde não têm outro papel (`arrows`: campos de texto de uma linha; num select elas trocam o valor). */
export function rowStepFor(key: string, shiftKey: boolean, arrows: boolean): RowStep | null {
  if (key === 'Enter') return shiftKey ? -1 : 1;
  if (arrows && key === 'ArrowDown') return 1;
  if (arrows && key === 'ArrowUp') return -1;
  return null;
}

/** Leva o foco à célula de mesma coluna na linha vizinha. Devolve false quando não há para onde ir. */
export function focusSiblingCell(cell: HTMLElement, step: RowStep): boolean {
  const column = cell.dataset.col;
  const row = cell.closest<HTMLElement>('tr[data-row-id]');
  const body = row?.closest('tbody');
  if (!column || !row || !body) return false;
  const rows = [...body.querySelectorAll<HTMLElement>('tr[data-row-id]')];
  const index = siblingRowIndex(
    rows.map(r => r.dataset.rowId ?? ''),
    row.dataset.rowId ?? '',
    step,
  );
  const target = index < 0 ? null : rows[index].querySelector<HTMLElement>(`[data-col="${column}"]`);
  if (!target || target.matches(':disabled')) return false;
  target.focus();
  if (target instanceof HTMLInputElement) target.select();
  return true;
}

/** Trata a tecla numa célula: move o foco (o que dispara o `blur` que grava) e diz se tratou. */
export function handleRowKey(
  event: { key: string; shiftKey: boolean; currentTarget: HTMLElement; preventDefault(): void },
  options: { arrows: boolean },
): boolean {
  const step = rowStepFor(event.key, event.shiftKey, options.arrows);
  if (step === null) return false;
  event.preventDefault();
  // Sem vizinha (última linha), o Enter ainda confirma a célula: tirar o foco é o que grava.
  if (!focusSiblingCell(event.currentTarget, step)) event.currentTarget.blur();
  return true;
}

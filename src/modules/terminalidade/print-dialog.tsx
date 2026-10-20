'use client';
import { useEffect, useRef, useState } from 'react';
import { printSearchParams } from './print-options';
import { SORT_COLUMNS, type TerminalityFilters, type TerminalityGrouping, type TerminalitySort } from './terminality-view';

const SITUATION_LABEL = { open: 'abertas', resolved: 'resolvidas', all: 'abertas e resolvidas' } as const;

/** Janela antes do PDF da lista de pendências (20/10/2026). O PDF sai com o que a lista mostra — os
 * filtros e a classificação do momento — e aqui se escolhe só o agrupamento (por pavimento ou por
 * empreiteiro), se leva fotos e se cada grupo começa em folha nova. Abre a página de impressão numa aba
 * nova, como os PDFs do curto prazo. */
export function TerminalityPrintDialog({
  workId,
  filters,
  sort,
  count,
  filtered,
  onClose,
}: {
  workId: string;
  filters: TerminalityFilters;
  sort?: TerminalitySort;
  /** Pendências que a lista mostra agora, e portanto as que entram no PDF. */
  count: number;
  /** A lista tem algum filtro além da situação. */
  filtered: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [grouping, setGrouping] = useState<TerminalityGrouping>(filters.contractor ? 'empreiteiro' : 'pavimento');
  const [photos, setPhotos] = useState(true);
  const [pageBreak, setPageBreak] = useState(true);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const generate = () => {
    if (!count) return;
    const params = printSearchParams({ filters, sort, grouping, photos, pageBreak });
    window.open(`/imprimir/terminalidade/${encodeURIComponent(workId)}?${params}`, '_blank', 'noopener');
    onClose();
  };
  const sortLabel = sort
    ? `${SORT_COLUMNS.find(c => c.value === sort.column)?.label ?? ''} (${sort.dir === 'asc' ? 'crescente' : 'decrescente'})`
    : 'pavimento, apto e data de observação';

  return (
    <dialog
      ref={dialog}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-labelledby="terminality-print-title"
      className="m-auto w-[min(30rem,94vw)] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <div className="flex max-h-[85vh] flex-col overflow-auto p-5">
        <h2 id="terminality-print-title" className="text-base font-bold text-slate-900">
          PDF das pendências
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Entram as {count} {count === 1 ? 'pendência' : 'pendências'} {SITUATION_LABEL[filters.situation]} que a lista mostra
          {filtered ? ', com os filtros de agora' : ''}. A primeira folha traz os gráficos por tipo, pavimento e responsável terceiro.
        </p>

        <fieldset className="mt-4">
          <legend className="eyebrow mb-2">Agrupar por</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {(
              [
                ['pavimento', 'Pavimento'],
                ['empreiteiro', 'Responsável terceiro'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${grouping === value ? 'border-primary bg-primary-soft text-primary-ink' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <input
                  type="radio"
                  name="agrupar"
                  className="accent-primary"
                  checked={grouping === value}
                  onChange={() => setGrouping(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 space-y-2 text-sm text-slate-700">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-primary" checked={photos} onChange={e => setPhotos(e.target.checked)} />
            Com as fotos do problema e da correção
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-primary" checked={pageBreak} onChange={e => setPageBreak(e.target.checked)} />
            Cada {grouping === 'pavimento' ? 'pavimento' : 'empreiteiro'} começa em folha nova
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">Dentro de cada grupo, na ordem da lista: {sortLabel}.</p>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {!count && <span className="mr-auto text-xs text-slate-500">A lista está vazia com esses filtros.</span>}
          <button type="button" className="button-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="button" disabled={!count} onClick={generate}>
            Gerar PDF
          </button>
        </div>
      </div>
    </dialog>
  );
}

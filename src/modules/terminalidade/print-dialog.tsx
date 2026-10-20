'use client';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { TerminalityItem } from '@/domain/terminality';
import { normalizeText } from '@/modules/curto-prazo/sheet-controls';
import { printSearchParams } from './print-options';
import {
  GROUPINGS,
  NONE,
  SORT_COLUMNS,
  groupItems,
  type TerminalityFilters,
  type TerminalityGrouping,
  type TerminalityIndex,
  type TerminalitySort,
} from './terminality-view';

const SITUATION_LABEL = { open: 'abertas', resolved: 'resolvidas', all: 'abertas e resolvidas' } as const;

/** Janela antes do PDF da lista de pendências (20/10/2026). O PDF parte do que a lista mostra — os
 * filtros e a classificação do momento. Aqui se escolhe o agrupamento (pavimento, responsável terceiro
 * ou tipo), quais grupos entram (marcar, desmarcar, pesquisar, como a janela do PDF do curto prazo), se
 * leva fotos e se cada grupo começa em folha nova. Abre a página de impressão numa aba nova. */
export function TerminalityPrintDialog({
  workId,
  filters,
  sort,
  items,
  index,
  filtered,
  onClose,
}: {
  workId: string;
  filters: TerminalityFilters;
  sort?: TerminalitySort;
  /** Pendências que a lista mostra agora: é delas que saem os grupos. */
  items: TerminalityItem[];
  index: TerminalityIndex;
  /** A lista tem algum filtro além da situação. */
  filtered: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [grouping, setGrouping] = useState<TerminalityGrouping>(
    filters.contractor ? 'empreiteiro' : filters.typeId && !filters.floorId ? 'tipo' : 'pavimento',
  );
  // Desmarcados de cada agrupamento: trocar de agrupamento não perde o que se escolheu no outro.
  const [excluded, setExcluded] = useState<Record<TerminalityGrouping, Set<string>>>({
    pavimento: new Set(),
    empreiteiro: new Set(),
    tipo: new Set(),
  });
  const [query, setQuery] = useState('');
  const [photos, setPhotos] = useState(true);
  const [pageBreak, setPageBreak] = useState(true);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const meta = GROUPINGS.find(g => g.value === grouping) ?? GROUPINGS[0];
  const groups = groupItems(items, index, grouping);
  const left = excluded[grouping];
  const chosen = groups.filter(g => !left.has(g.key));
  const lines = chosen.reduce((sum, g) => sum + g.items.length, 0);
  const needle = normalizeText(query);
  const visible = groups.filter(g => normalizeText(g.label).includes(needle));
  const mark = (keys: string[], on: boolean) =>
    setExcluded(current => {
      const next = new Set(current[grouping]);
      keys.forEach(key => (on ? next.delete(key) : next.add(key)));
      return { ...current, [grouping]: next };
    });

  const generate = () => {
    if (!lines) return;
    // Todos marcados: a URL não leva a lista, e o PDF sai com todos os grupos da lista.
    const subset = chosen.length < groups.length ? chosen.map(g => g.key) : undefined;
    const params = printSearchParams({ filters, sort, grouping, groups: subset, photos, pageBreak });
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
      className="m-auto w-[min(32rem,94vw)] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <div className="flex max-h-[90vh] flex-col p-5">
        <h2 id="terminality-print-title" className="text-base font-bold text-slate-900">
          PDF das pendências
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Parte das {items.length} {items.length === 1 ? 'pendência' : 'pendências'} {SITUATION_LABEL[filters.situation]} que a lista mostra
          {filtered ? ', com os filtros de agora' : ''}. A primeira folha traz os gráficos por tipo, pavimento e responsável terceiro do que
          for impresso.
        </p>

        <fieldset className="mt-4">
          <legend className="eyebrow mb-2">Agrupar por</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {GROUPINGS.map(option => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${grouping === option.value ? 'border-primary bg-primary-soft text-primary-ink' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <input
                  type="radio"
                  name="agrupar"
                  className="accent-primary"
                  checked={grouping === option.value}
                  onChange={() => {
                    setGrouping(option.value);
                    setQuery('');
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 text-xs">
          <p className="eyebrow">Quais {meta.plural} entram</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-link"
              onClick={() =>
                mark(
                  visible.map(g => g.key),
                  true,
                )
              }
            >
              Selecionar tudo
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                mark(
                  visible.map(g => g.key),
                  false,
                )
              }
            >
              Limpar
            </button>
            <span className="ml-auto tabular-nums text-slate-400">
              {chosen.length} de {groups.length}
            </span>
          </div>
          <div className="relative">
            <Search aria-hidden size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={event => setQuery(event.target.value)}
              aria-label={`Pesquisar ${meta.plural}`}
              placeholder="Pesquisar"
              autoComplete="off"
              spellCheck={false}
              className="field py-1.5 pl-7 text-xs"
            />
          </div>
          <ul className="custom-scrollbar max-h-56 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-100">
            {visible.map(g => (
              <li key={g.key}>
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={!left.has(g.key)}
                    onChange={event => mark([g.key], event.target.checked)}
                  />
                  <span className={`flex-1 truncate ${g.key === NONE ? 'italic text-slate-500' : ''}`}>{g.label}</span>
                  <span className="tabular-nums text-slate-400">{g.items.length}</span>
                </label>
              </li>
            ))}
            {!visible.length && <li className="px-2 py-1.5 text-slate-500">Nada encontrado.</li>}
          </ul>
        </div>

        <div className="mt-4 space-y-2 text-sm text-slate-700">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-primary" checked={photos} onChange={e => setPhotos(e.target.checked)} />
            Com as fotos do problema e da correção
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="accent-primary" checked={pageBreak} onChange={e => setPageBreak(e.target.checked)} />
            Cada {meta.one} começa em folha nova
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">Dentro de cada grupo, na ordem da lista: {sortLabel}.</p>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">
            {lines
              ? `${lines} ${lines === 1 ? 'pendência' : 'pendências'} no PDF`
              : items.length
                ? `Marque ao menos um ${meta.one}.`
                : 'A lista está vazia com esses filtros.'}
          </span>
          <button type="button" className="button-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="button" disabled={!lines} onClick={generate}>
            Gerar PDF
          </button>
        </div>
      </div>
    </dialog>
  );
}

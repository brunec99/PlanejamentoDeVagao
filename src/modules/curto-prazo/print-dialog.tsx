'use client';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { normalizeText } from '@/modules/curto-prazo/sheet-controls';
import type { PrintKind, PrintOrder } from '@/modules/curto-prazo/print-sheet';

/** Janela antes do PDF (pedido do usuário, 08/10/2026): escolher os empreiteiros que entram, no mesmo
 * estilo do filtro de coluna da planilha (marcar, desmarcar, pesquisar, contagem por valor), e a ordem
 * das linhas — por empreiteiro (como a planilha da obra) ou por data de início. Gera a página de
 * impressão numa aba nova; os empreiteiros desmarcados seguem na URL como `excluir`. */
export function PrintDialog({
  workId,
  week,
  kind,
  companies,
  initialSelected,
  onClose,
}: {
  workId: string;
  week: string;
  kind: PrintKind;
  /** Empreiteiros da semana com o número de linhas de cada um; '' = linhas sem empreiteiro. */
  companies: { value: string; count: number }[];
  /** O filtro da coluna Empresa da planilha, quando houver: vira a seleção inicial. */
  initialSelected?: ReadonlySet<string>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initialSelected ?? companies.map(c => c.value)));
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<PrintOrder>('empreiteiro');
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const text = (value: string) => value || '(sem empreiteiro)';
  const ordered = [...companies].sort(
    (a, b) => (a.value ? 1 : 0) - (b.value ? 1 : 0) || a.value.localeCompare(b.value, 'pt-BR', { numeric: true, sensitivity: 'base' }),
  );
  const needle = normalizeText(query);
  const visible = ordered.filter(c => normalizeText(text(c.value)).includes(needle));
  const chosen = companies.filter(c => checked.has(c.value));
  const lines = chosen.reduce((sum, c) => sum + c.count, 0);
  const mark = (values: string[], on: boolean) =>
    setChecked(current => {
      const next = new Set(current);
      values.forEach(v => (on ? next.add(v) : next.delete(v)));
      return next;
    });
  const generate = () => {
    if (!chosen.length) return;
    const params = new URLSearchParams({ semana: week, tipo: kind, ordem: order });
    companies.filter(c => !checked.has(c.value)).forEach(c => params.append('excluir', c.value));
    window.open(`/imprimir/curto-prazo/${encodeURIComponent(workId)}?${params}`, '_blank', 'noopener');
    onClose();
  };
  const title = kind === 'fechamento' ? 'PDF do fechamento' : 'PDF do planejamento';

  return (
    <dialog
      ref={dialog}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      aria-labelledby="print-dialog-title"
      className="m-auto w-[min(30rem,94vw)] rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <div className="flex max-h-[85vh] flex-col p-5">
        <h2 id="print-dialog-title" className="text-base font-bold text-slate-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">Escolha os empreiteiros e a ordem das linhas.</p>

        <fieldset className="mt-4">
          <legend className="eyebrow mb-2">Ordem das linhas</legend>
          <div className="flex flex-wrap gap-2 text-sm">
            {(
              [
                ['empreiteiro', 'Por empreiteiro'],
                ['inicio', 'Por data de início'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${order === value ? 'border-primary bg-primary-soft text-primary-ink' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <input type="radio" name="ordem" className="accent-primary" checked={order === value} onChange={() => setOrder(value)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 text-xs">
          <p className="eyebrow">Empreiteiros</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-link"
              onClick={() =>
                mark(
                  visible.map(c => c.value),
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
                  visible.map(c => c.value),
                  false,
                )
              }
            >
              Limpar
            </button>
            <span className="ml-auto tabular-nums text-slate-400">
              {chosen.length} de {companies.length}
            </span>
          </div>
          <div className="relative">
            <Search aria-hidden size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={event => setQuery(event.target.value)}
              aria-label="Pesquisar empreiteiros"
              placeholder="Pesquisar"
              autoComplete="off"
              spellCheck={false}
              className="field py-1.5 pl-7 text-xs"
            />
          </div>
          <ul className="custom-scrollbar max-h-64 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-100">
            {visible.map(c => (
              <li key={c.value}>
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={checked.has(c.value)}
                    onChange={event => mark([c.value], event.target.checked)}
                  />
                  <span className={`flex-1 truncate ${c.value ? '' : 'italic text-slate-500'}`}>{text(c.value)}</span>
                  <span className="tabular-nums text-slate-400">{c.count}</span>
                </label>
              </li>
            ))}
            {!visible.length && <li className="px-2 py-1.5 text-slate-500">Nenhum empreiteiro encontrado.</li>}
          </ul>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">
            {chosen.length ? `${lines} linha${lines === 1 ? '' : 's'} no PDF` : 'Marque ao menos um empreiteiro.'}
          </span>
          <button type="button" className="button-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="button" disabled={!chosen.length} onClick={generate}>
            Gerar PDF
          </button>
        </div>
      </div>
    </dialog>
  );
}

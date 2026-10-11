'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, ListFilter, Search } from 'lucide-react';
import { filterSelection, normalizeText } from '@/modules/curto-prazo/sheet-controls';

/** Seletor múltiplo do fechamento (11/10/2026, pedido da obra: "filtrar uma equipe ou retirar
 * uma"). Mesma lógica do filtro de coluna da planilha — marcar tudo é não filtrar, a escolha só vale
 * no OK —, num chip compacto porque aqui não há cabeçalho de coluna para ancorar. */
export function FilterPicker({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: { value: string; count: number }[];
  selected: Set<string> | undefined;
  onChange: (next: Set<string> | undefined) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [checked, setChecked] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const text = (value: string) => value || '(vazias)';
  const needle = normalizeText(query);
  const visible = values.filter(v => normalizeText(text(v.value)).includes(needle));
  const none = !values.some(v => checked.has(v.value));
  const chosen = selected ? values.filter(v => selected.has(v.value)).length : values.length;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setOpen(false);
    setQuery('');
    setChecked(new Set(selected ?? values.map(v => v.value)));
    setOpen(true);
  };
  const mark = (list: string[], on: boolean) =>
    setChecked(current => {
      const next = new Set(current);
      list.forEach(v => (on ? next.add(v) : next.delete(v)));
      return next;
    });
  const apply = () => {
    if (none && values.length) return;
    onChange(
      filterSelection(
        values.map(v => v.value),
        checked,
      ),
    );
    setOpen(false);
  };
  const active = selected !== undefined;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={`${label}: ${active ? `${chosen} de ${values.length}` : 'todos'}`}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
          active ? 'border-primary-ring bg-primary-soft text-primary-ink' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        <ListFilter aria-hidden size={12} strokeWidth={2.5} className={active ? 'text-primary' : 'text-slate-400'} />
        {label}
        <span className="tabular-nums text-slate-500">{active ? `${chosen} de ${values.length}` : 'todos'}</span>
        <ChevronDown aria-hidden size={13} className="opacity-60" />
      </button>
      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-label={`Filtrar ${label}`}
          className="absolute left-0 top-full z-40 mt-1 flex w-72 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-xs text-slate-700 shadow-lg"
        >
          <div className="flex min-h-0 flex-col gap-2 p-2">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  mark(
                    visible.map(v => v.value),
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
                    visible.map(v => v.value),
                    false,
                  )
                }
              >
                Limpar
              </button>
              <span className="ml-auto tabular-nums text-slate-400">
                {values.filter(v => checked.has(v.value)).length} de {values.length}
              </span>
            </div>
            <div className="relative">
              <Search aria-hidden size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    apply();
                  }
                }}
                aria-label={`Pesquisar ${label}`}
                placeholder="Pesquisar"
                autoComplete="off"
                spellCheck={false}
                className="field py-1.5 pl-7 text-xs"
              />
            </div>
            <ul className="custom-scrollbar max-h-56 min-h-0 overflow-auto">
              {visible.map(v => (
                <li key={v.value}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={checked.has(v.value)}
                      onChange={event => mark([v.value], event.target.checked)}
                    />
                    <span className={`flex-1 truncate ${v.value ? '' : 'italic text-slate-500'}`}>{text(v.value)}</span>
                    <span className="tabular-nums text-slate-400">{v.count}</span>
                  </label>
                </li>
              ))}
              {!visible.length && <li className="px-1.5 py-1 text-slate-500">Nenhum valor encontrado.</li>}
            </ul>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 p-2">
            <button type="button" className="button-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="button px-3 py-1.5 text-xs disabled:cursor-not-allowed"
              disabled={none && values.length > 0}
              onClick={apply}
            >
              <Check aria-hidden size={13} />
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

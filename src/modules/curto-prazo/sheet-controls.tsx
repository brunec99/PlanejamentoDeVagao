'use client';
import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject, type SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowUpZA, Check, ChevronDown, ListFilter, Search, X } from 'lucide-react';

export type PillTone = 'neutral' | 'success' | 'danger' | 'required';

/** Comparação de busca: sem acentos, sem caixa e com espaços colapsados. */
export const normalizeText = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim();
export const matchOptions = (options: string[], query: string) => {
  const needle = normalizeText(query);
  return needle ? options.filter(option => normalizeText(option).includes(needle)) : options;
};
/** Texto digitado no combo: vira a opção equivalente (ignorando acento/caixa) ou um valor novo. */
export function resolveTyped(text: string, options: string[]): { value: string; isNew: boolean } | null {
  const typed = text.replace(/\s+/g, ' ').trim();
  if (!typed) return null;
  const hit = options.find(option => normalizeText(option) === normalizeText(typed));
  return hit === undefined ? { value: typed, isNew: true } : { value: hit, isNew: false };
}
/** Como no Sheets: marcar todos os valores equivale a não filtrar. */
export const filterSelection = (values: string[], checked: ReadonlySet<string>): Set<string> | undefined =>
  values.every(value => checked.has(value)) ? undefined : new Set(checked);

const TONES: Record<PillTone, [surface: string, ink: string]> = {
  neutral: ['bg-slate-100 enabled:hover:bg-slate-200', 'text-slate-700'],
  success: ['bg-emerald-100 enabled:hover:bg-emerald-200', 'text-emerald-800'],
  danger: ['bg-rose-100 enabled:hover:bg-rose-200', 'text-rose-700'],
  // ring-inset: a célula da tabela corta sombras externas.
  required: ['bg-rose-50 ring-2 ring-inset ring-rose-400 enabled:hover:bg-rose-100', 'text-rose-700'],
};
const pill = (tone: PillTone, empty: boolean) =>
  `block h-7 w-full min-w-0 truncate rounded-full pl-2.5 pr-6 text-left text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${TONES[tone][0]} ${empty && tone === 'neutral' ? 'text-slate-400' : TONES[tone][1]}`;
const chevron = (disabled?: boolean) => `pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${disabled ? 'opacity-30' : 'opacity-60'}`;
// Os popovers vão para o body; eventos de portal sobem pela árvore React, então não podem vazar para a grade.
const stop = (event: SyntheticEvent) => event.stopPropagation();

/** Posiciona um popover fixo sob a âncora (ou acima, sem espaço) e fecha ao clicar fora. */
function useAnchoredPopover(anchor: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, width: number, height: number) {
  const popover = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<CSSProperties | null>(null);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => { closeRef.current = onClose; });
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const w = Math.max(width, rect.width), below = innerHeight - rect.bottom - 12, above = rect.top - 12;
      const up = below < Math.min(height, 240) && above > below;
      setBox({ position: 'fixed', left: Math.max(8, Math.min(rect.left, innerWidth - w - 8)), width: w, maxHeight: Math.max(160, Math.min(height, up ? above : below)), ...(up ? { bottom: innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }) });
    };
    const scroll = (event: Event) => { if (!popover.current?.contains(event.target as Node)) place(); };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchor.current?.contains(target) && !popover.current?.contains(target)) closeRef.current();
    };
    place();
    addEventListener('resize', place);
    addEventListener('scroll', scroll, true);
    document.addEventListener('pointerdown', outside, true);
    return () => { removeEventListener('resize', place); removeEventListener('scroll', scroll, true); document.removeEventListener('pointerdown', outside, true); };
  }, [anchor, open, width, height]);
  return { popover, box: open ? box : null };
}

/** Raiz de todo popover: `data-sheet-popover` deixa a tabela reconhecer foco que entrou aqui (relatedTarget.closest). */
function Popover({ box, popover, children, onKeyDown, ...aria }: { box: CSSProperties; popover: RefObject<HTMLDivElement | null>; children: ReactNode; id?: string; role?: string; 'aria-label'?: string; onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void }) {
  return createPortal(<div ref={popover} data-sheet-popover="" style={box} {...aria} onClick={stop} onPointerDown={stop} onKeyUp={stop}
    onKeyDown={event => { event.stopPropagation(); onKeyDown?.(event); }}
    className="z-50 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left text-xs font-normal normal-case tracking-normal text-slate-700 shadow-lg">{children}</div>, document.body);
}

function SearchBox(props: { value: string; onChange: (value: string) => void; ariaLabel: string; onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void; combo?: { listId: string; active?: string } }) {
  const { value, onChange, ariaLabel, onKeyDown, combo } = props;
  return <div className="relative">
    <Search aria-hidden size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
    <input autoFocus type="text" value={value} onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} aria-label={ariaLabel} placeholder="Pesquisar"
      autoComplete="off" spellCheck={false} className="field py-1.5 pl-7 text-xs"
      {...(combo && { role: 'combobox', 'aria-expanded': true, 'aria-controls': combo.listId, 'aria-autocomplete': 'list' as const, 'aria-activedescendant': combo.active })} />
  </div>;
}

/** Select nativo com cara de chip do Sheets: teclado e seletor do celular continuam os do sistema. */
export function PillSelect({ value, options, onChange, ariaLabel, tone = 'neutral', disabled, placeholder, title }: {
  value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; ariaLabel: string;
  tone?: PillTone; disabled?: boolean; placeholder?: string; title?: string;
}) {
  const current = options.find(option => option.value === value);
  return <div className="relative w-full min-w-0">
    <select value={value} onChange={event => onChange(event.target.value)} aria-label={ariaLabel} title={title ?? current?.label ?? (value || placeholder)} disabled={disabled}
      className={`${pill(tone, !value)} cursor-pointer appearance-none`}>
      {(placeholder !== undefined || !value) && <option value="" className="text-slate-500">{placeholder ?? ''}</option>}
      {/* Valor fora da lista (ex.: equipe arquivada) continua visível em vez de o select mostrar outra opção. */}
      {value && !current && <option value={value} className="text-slate-800">{value}</option>}
      {options.map(option => <option key={option.value} value={option.value} className="text-slate-800">{option.label}</option>)}
    </select>
    <ChevronDown aria-hidden size={14} className={chevron(disabled)} />
  </div>;
}

/** Chip que abre uma lista pesquisável e aceita digitar um valor novo (combobox). */
export function PillCombo({ value, options, onCommit, ariaLabel, allowCreate = true, createLabel = text => `Usar “${text}”`, emptyHint, disabled, placeholder, tone = 'neutral' }: {
  value: string; options: string[]; onCommit: (value: string, isNew: boolean) => void; ariaLabel: string; allowCreate?: boolean;
  createLabel?: (text: string) => string; emptyHint?: string; disabled?: boolean; placeholder?: string; tone?: PillTone;
}) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [active, setActive] = useState(0);
  const chip = useRef<HTMLButtonElement>(null), list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const { popover, box } = useAnchoredPopover(chip, open, () => setOpen(false), 224, 320);
  const typed = allowCreate ? resolveTyped(text, options) : null;
  const items = [...matchOptions(options, text).map(option => ({ value: option, isNew: false })), ...(typed?.isNew ? [typed] : [])];
  const index = Math.min(active, items.length - 1);
  const mounted = !!box;
  useLayoutEffect(() => {
    const ul = list.current, li = ul?.children[index] as HTMLElement | undefined;
    if (!ul || !li) return;
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight;
  }, [mounted, index]);

  const close = () => { setOpen(false); chip.current?.focus(); };
  const commit = (item: { value: string; isNew: boolean } | undefined) => {
    if (!item) return;
    close();
    // Texto novo igual ao atual (a menos de acento/caixa) não é mudança.
    if (item.isNew ? normalizeText(item.value) !== normalizeText(value) : item.value !== value) onCommit(item.value, item.isNew);
  };
  const type = (next: string) => {
    setText(next);
    const hit = resolveTyped(next, options);
    setActive(hit && !hit.isNew ? Math.max(0, matchOptions(options, next).indexOf(hit.value)) : 0);
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length) setActive((index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
    } else if (event.key === 'Home' && items.length && !text) { event.preventDefault(); setActive(0); }
    else if (event.key === 'End' && items.length && !text) { event.preventDefault(); setActive(items.length - 1); }
    else if (event.key === 'Enter') { event.preventDefault(); commit(items[index]); }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
    // Foca o chip antes da ação padrão: o Tab segue para a célula vizinha, não para o fim do body.
    else if (event.key === 'Tab') close();
  };
  const toggle = () => {
    if (open) return close();
    setText(''); setActive(Math.max(0, options.indexOf(value))); setOpen(true);
  };

  return <>
    <button ref={chip} type="button" disabled={disabled} onClick={toggle} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-label={value ? `${ariaLabel}: ${value}` : ariaLabel} title={value || placeholder} className={`relative ${pill(tone, !value)} cursor-pointer`}>
      <span className="block truncate">{value || placeholder || '\u00a0'}</span>
      <ChevronDown aria-hidden size={14} className={chevron(disabled)} />
    </button>
    {box && <Popover box={box} popover={popover}>
      <div className="border-b border-slate-100 p-2">
        <SearchBox value={text} onChange={type} onKeyDown={keyDown} ariaLabel={ariaLabel} combo={{ listId, active: items.length ? `${listId}-${index}` : undefined }} />
      </div>
      {!options.length && emptyHint && <p className="px-3 py-2 text-slate-500">{emptyHint}</p>}
      {options.length > 0 && !items.length && <p className="px-3 py-2 text-slate-500">Nenhuma opção encontrada.</p>}
      <ul ref={list} id={listId} role="listbox" aria-label={ariaLabel} className="custom-scrollbar max-h-60 min-h-0 flex-1 overflow-auto py-1">
        {items.map((item, i) => <li key={`${item.isNew}:${item.value}`} id={`${listId}-${i}`} role="option" aria-selected={i === index}
          onMouseDown={event => event.preventDefault()} onMouseMove={() => i !== index && setActive(i)} onClick={() => commit(item)}
          className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 ${i === index ? 'bg-blue-50 text-blue-900' : ''} ${item.isNew ? 'border-t border-slate-100 font-semibold text-blue-700' : ''}`}>
          <span className="w-3.5 shrink-0">{item.value === value && !item.isNew && <Check aria-hidden size={13} className="text-blue-700" />}</span>
          <span className="truncate">{item.isNew ? createLabel(item.value) : item.value}</span>
        </li>)}
      </ul>
    </Popover>}
  </>;
}

/** Cabeçalho de coluna com o funil do Sheets: classificar e filtrar por valores (edição só vale no OK). */
export function ColumnFilter({ label, values, selected, onChange, sort, onSort, align = 'left' }: {
  label: string; values: { value: string; count: number }[]; selected: Set<string> | undefined; onChange: (next: Set<string> | undefined) => void;
  sort: 'asc' | 'desc' | undefined; onSort: (dir: 'asc' | 'desc' | undefined) => void; align?: 'left' | 'center';
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [checked, setChecked] = useState<Set<string>>(new Set());
  const button = useRef<HTMLButtonElement>(null);
  const dialogId = useId();
  const { popover, box } = useAnchoredPopover(button, open, () => setOpen(false), 256, 440);
  const filtered = selected !== undefined, active = filtered || sort !== undefined;
  const text = (value: string) => value || '(vazias)';
  // Vazias primeiro e ordem natural ("Semana 2" antes de "Semana 10"), como na lista do Sheets.
  const ordered = [...values].sort((a, b) => (a.value ? 1 : 0) - (b.value ? 1 : 0) || a.value.localeCompare(b.value, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  const needle = normalizeText(query);
  const visible = ordered.filter(v => normalizeText(text(v.value)).includes(needle));
  const none = !values.some(v => checked.has(v.value));

  const close = () => { setOpen(false); button.current?.focus(); };
  const toggle = () => {
    if (open) return close();
    setQuery(''); setChecked(new Set(selected ?? values.map(v => v.value))); setOpen(true);
  };
  const apply = () => { if (none && values.length) return; onChange(filterSelection(values.map(v => v.value), checked)); close(); };
  const sortBy = (dir: 'asc' | 'desc' | undefined) => { onSort(dir); close(); };
  const mark = (list: string[], on: boolean) => setChecked(current => { const next = new Set(current); list.forEach(v => (on ? next.add(v) : next.delete(v))); return next; });
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    // Mantém o Tab dentro do diálogo: o portal fica no fim do body.
    const focusables = [...(popover.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])];
    const edge = event.shiftKey ? focusables[0] : focusables.at(-1);
    if (document.activeElement === edge) { event.preventDefault(); (event.shiftKey ? focusables.at(-1) : focusables[0])?.focus(); }
  };
  const row = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium hover:bg-slate-100 aria-pressed:bg-blue-50 aria-pressed:text-blue-800';
  const SortIcon = sort === 'desc' ? ArrowUpZA : ArrowDownAZ;

  return <div className={`flex min-w-0 items-center gap-1 ${align === 'center' ? 'justify-center' : ''}`}>
    <span className="truncate">{label}</span>
    {sort && <SortIcon aria-hidden size={12} className="shrink-0 text-blue-700" />}
    <button ref={button} type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}
      aria-label={`Filtrar ${label}${filtered ? ' (filtro ativo)' : ''}${sort ? `, classificado ${sort === 'asc' ? 'A→Z' : 'Z→A'}` : ''}`} title={`Filtrar e classificar ${label}`}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${active ? 'bg-blue-700 text-white hover:bg-blue-800' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'}`}>
      <ListFilter aria-hidden size={12} strokeWidth={2.5} />
    </button>
    {box && <Popover box={box} popover={popover} id={dialogId} role="dialog" aria-label={`Filtrar ${label}`} onKeyDown={keyDown}>
      <div className="border-b border-slate-100 p-1">
        <button type="button" className={row} aria-pressed={sort === 'asc'} onClick={() => sortBy('asc')}><ArrowDownAZ aria-hidden size={14} />Classificar A→Z</button>
        <button type="button" className={row} aria-pressed={sort === 'desc'} onClick={() => sortBy('desc')}><ArrowUpZA aria-hidden size={14} />Classificar Z→A</button>
        {sort && <button type="button" className={row} onClick={() => sortBy(undefined)}><X aria-hidden size={14} />Remover classificação</button>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <p className="eyebrow">Filtrar por valores</p>
        <div className="flex items-center gap-3">
          <button type="button" className="text-link" onClick={() => mark(visible.map(v => v.value), true)}>Selecionar tudo</button>
          <button type="button" className="text-link" onClick={() => mark(visible.map(v => v.value), false)}>Limpar</button>
          <span className="ml-auto tabular-nums text-slate-400">{values.filter(v => checked.has(v.value)).length} de {values.length}</span>
        </div>
        <SearchBox value={query} onChange={setQuery} ariaLabel={`Pesquisar valores de ${label}`} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); apply(); } }} />
        <ul className="custom-scrollbar max-h-56 min-h-0 flex-1 overflow-auto">
          {visible.map(v => <li key={v.value}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50">
              <input type="checkbox" className="accent-blue-700" checked={checked.has(v.value)} onChange={event => mark([v.value], event.target.checked)} />
              <span className={`flex-1 truncate ${v.value ? '' : 'italic text-slate-500'}`}>{text(v.value)}</span>
              <span className="tabular-nums text-slate-400">{v.count}</span>
            </label>
          </li>)}
          {!visible.length && <li className="px-1.5 py-1 text-slate-500">Nenhum valor encontrado.</li>}
        </ul>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 p-2">
        <button type="button" className="button-ghost px-3 py-1.5 text-xs" onClick={close}>Cancelar</button>
        <button type="button" className="button px-3 py-1.5 text-xs disabled:cursor-not-allowed" disabled={none && values.length > 0} onClick={apply}>OK</button>
      </div>
    </Popover>}
  </div>;
}

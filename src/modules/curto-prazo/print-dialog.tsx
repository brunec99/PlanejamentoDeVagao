'use client';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { normalizeText } from '@/modules/curto-prazo/sheet-controls';
import { printLocalOptions, type LocalOption } from '@/modules/curto-prazo/commitment-local';
import { printSearchParams, type PrintKind, type PrintOrder } from '@/modules/curto-prazo/print-options';

/** Janela antes do PDF (pedido do usuário, 08/10/2026): escolher os empreiteiros que entram, no mesmo
 * estilo do filtro de coluna da planilha (marcar, desmarcar, pesquisar, contagem por valor), e a ordem
 * das linhas — por empreiteiro (como a planilha da obra) ou por data de início. Desde 05/11/2026, também os
 * locais, quando alguma linha da semana tem local. Gera a página de impressão numa aba nova; os empreiteiros
 * desmarcados seguem na URL como `excluir`, e os locais como `excluir-local` (`print-options.ts`). */
export function PrintDialog({
  workId,
  week,
  kind,
  companies,
  initialSelected,
  rows,
  locals,
  initialLocals,
  onClose,
}: {
  workId: string;
  week: string;
  kind: PrintKind;
  /** Empreiteiros da semana com o número de linhas de cada um; '' = linhas sem empreiteiro. */
  companies: { value: string; count: number }[];
  /** O filtro da coluna Empresa da planilha, quando houver: vira a seleção inicial. */
  initialSelected?: ReadonlySet<string>;
  /** Empresa e local (id, ou '' sem local) de cada linha da semana: contam as linhas com os dois recortes. */
  rows: { company: string; local: string }[];
  /** Os locais da obra, de cima para baixo. */
  locals: readonly LocalOption[];
  /** O filtro da coluna Local da planilha, em ids ('' = sem local), quando houver: vira a seleção inicial. */
  initialLocals?: ReadonlySet<string>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initialSelected ?? companies.map(c => c.value)));
  const localItems = printLocalOptions(
    rows.map(row => row.local),
    locals,
  );
  // Até a pessoa mexer, vale a seleção inicial (o filtro da coluna Local, ou todos): calculada a cada vez, para
  // não ficar vazia se os locais chegarem depois de a janela abrir.
  const [localChoice, setLocalChoice] = useState<Set<string>>();
  const checkedLocals = localChoice ?? new Set(initialLocals ?? localItems.map(l => l.value));
  const [order, setOrder] = useState<PrintOrder>('empreiteiro');
  // Painel na primeira página do fechamento (30/10/2026): marcado por padrão; desmarcado, sai só a planilha.
  const [panel, setPanel] = useState(true);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  // Sem nenhuma linha com local na semana, não há o que recortar: a seção não aparece e o local não filtra.
  const byLocal = localItems.length > 0;
  const chosen = companies.filter(c => checked.has(c.value));
  const chosenLocals = localItems.filter(l => checkedLocals.has(l.value));
  const lines = rows.filter(row => checked.has(row.company) && (!byLocal || checkedLocals.has(row.local))).length;
  const missing = !chosen.length ? 'Marque ao menos um empreiteiro.' : byLocal && !chosenLocals.length ? 'Marque ao menos um local.' : '';
  const generate = () => {
    if (missing) return;
    const params = printSearchParams({
      week,
      kind,
      order,
      panel,
      excludedCompanies: companies.filter(c => !checked.has(c.value)).map(c => c.value),
      excludedLocals: byLocal ? localItems.filter(l => !checkedLocals.has(l.value)).map(l => l.value) : [],
    });
    window.open(`/imprimir/curto-prazo/${encodeURIComponent(workId)}?${params}`, '_blank', 'noopener');
    onClose();
  };
  const title = kind === 'fechamento' ? 'PDF do fechamento' : 'PDF do planejamento';
  // Empreiteiros em ordem alfabética, com "(sem empreiteiro)" primeiro, como no filtro de coluna.
  const companyItems = [...companies]
    .sort(
      (a, b) => (a.value ? 1 : 0) - (b.value ? 1 : 0) || a.value.localeCompare(b.value, 'pt-BR', { numeric: true, sensitivity: 'base' }),
    )
    .map(c => ({ value: c.value, label: c.value || '(sem empreiteiro)', count: c.count }));

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
        <p className="mt-1 text-sm text-slate-600">
          {byLocal ? 'Escolha os empreiteiros, os locais e a ordem das linhas.' : 'Escolha os empreiteiros e a ordem das linhas.'}
        </p>

        {kind === 'fechamento' && (
          <label
            className={`mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${panel ? 'border-primary bg-primary-soft text-primary-ink' : 'border-slate-200 hover:bg-slate-50'}`}
          >
            <input type="checkbox" className="mt-0.5 accent-primary" checked={panel} onChange={event => setPanel(event.target.checked)} />
            <span>
              <span className="block font-semibold">Painel na primeira página</span>
              <span className="block text-xs text-slate-600">
                PPC da semana e das anteriores, ranking das obras e principais causas. O painel considera a obra inteira, com todos os
                empreiteiros{byLocal ? ' e locais' : ''}.
              </span>
            </span>
          </label>
        )}

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

        <ChoiceList
          title="Empreiteiros"
          noun="empreiteiros"
          empty="Nenhum empreiteiro encontrado."
          items={companyItems}
          checked={checked}
          onChange={setChecked}
          compact={byLocal}
        />
        {byLocal && (
          <ChoiceList
            title="Local"
            noun="locais"
            empty="Nenhum local encontrado."
            items={localItems}
            checked={checkedLocals}
            onChange={setLocalChoice}
            compact
          />
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">{missing || `${lines} linha${lines === 1 ? '' : 's'} no PDF`}</span>
          <button type="button" className="button-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="button" disabled={!!missing} onClick={generate}>
            Gerar PDF
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Uma lista de marcar no estilo do filtro de coluna da planilha: "Selecionar tudo" e "Limpar" (nos itens à
 * vista), contagem de marcados, pesquisa e o número de linhas de cada valor. O valor '' (sem empreiteiro, sem
 * local) aparece em itálico. `compact`: duas listas na janela dividem a altura. */
function ChoiceList({
  title,
  noun,
  empty,
  items,
  checked,
  onChange,
  compact,
}: {
  title: string;
  noun: string;
  empty: string;
  items: { value: string; label: string; count: number }[];
  checked: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState('');
  const needle = normalizeText(query);
  const visible = items.filter(item => normalizeText(item.label).includes(needle));
  const mark = (values: string[], on: boolean) => {
    const next = new Set(checked);
    values.forEach(v => (on ? next.add(v) : next.delete(v)));
    onChange(next);
  };
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 text-xs">
      <p className="eyebrow">{title}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-link"
          onClick={() =>
            mark(
              visible.map(item => item.value),
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
              visible.map(item => item.value),
              false,
            )
          }
        >
          Limpar
        </button>
        <span className="ml-auto tabular-nums text-slate-400">
          {items.filter(item => checked.has(item.value)).length} de {items.length}
        </span>
      </div>
      <div className="relative">
        <Search aria-hidden size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={event => setQuery(event.target.value)}
          aria-label={`Pesquisar ${noun}`}
          placeholder="Pesquisar"
          autoComplete="off"
          spellCheck={false}
          className="field py-1.5 pl-7 text-xs"
        />
      </div>
      <ul
        aria-label={title}
        className={`custom-scrollbar min-h-0 flex-1 overflow-auto rounded-lg border border-slate-100 ${compact ? 'max-h-40' : 'max-h-64'}`}
      >
        {visible.map(item => (
          <li key={item.value}>
            <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-slate-50">
              <input
                type="checkbox"
                className="accent-primary"
                checked={checked.has(item.value)}
                onChange={event => mark([item.value], event.target.checked)}
              />
              <span className={`flex-1 truncate ${item.value ? '' : 'italic text-slate-500'}`}>{item.label}</span>
              <span className="tabular-nums text-slate-400">{item.count}</span>
            </label>
          </li>
        ))}
        {!visible.length && <li className="px-2 py-1.5 text-slate-500">{empty}</li>}
      </ul>
    </div>
  );
}

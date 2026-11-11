'use client';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste } from 'lucide-react';
import { LOB_LIMITS, type LobService } from '@/domain/lob';
import { formatMoney } from '@/domain/lob-performance';
import { Callout } from '@/modules/planejamento/ui';
import { parseBudgetPaste, type BudgetLine } from './costs-model';

/** Diálogo "Colar do orçamento" da tela Custos (11/11/2026): a pessoa cola as linhas do orçamento
 * copiadas do Excel, vê o que foi lido (código, descrição, valor e o pacote reconhecido pelo nome) e
 * joga no rascunho da tela. Nada é gravado aqui: só o "Salvar" da tela grava. */

/** A prévia mostra até este número de linhas; o resto entra igual na importação. */
const PREVIEW_ROWS = 300;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

export function CostsImportDialog({
  services,
  currentCount,
  onImport,
  onClose,
}: {
  services: readonly LobService[];
  /** Itens no rascunho hoje, para o limite da obra e o aviso de "Substituir". */
  currentCount: number;
  onImport: (lines: BudgetLine[], replace: boolean) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  // Colagens grandes (milhares de linhas): a leitura acompanha sem travar a digitação.
  const deferred = useDeferredValue(text);
  const parsed = useMemo(() => parseBudgetPaste(deferred, services), [deferred, services]);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  const close = () => dialog.current?.close();

  const serviceById = useMemo(() => new Map(services.map(s => [s.id, s])), [services]);
  const total = parsed.lines.reduce((sum, l) => sum + l.amount, 0);
  const recognized = parsed.lines.filter(l => l.serviceId).length;
  const resulting = (replace ? 0 : currentCount) + parsed.lines.length;
  const overLimit = resulting > LOB_LIMITS.costItems;
  const canImport = parsed.lines.length > 0 && !overLimit && deferred === text;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="lob-costs-import-title"
      className="m-auto max-h-[92vh] w-[min(56rem,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <form
        className="flex max-h-[92vh] flex-col"
        onSubmit={event => {
          event.preventDefault();
          if (!canImport) return;
          onImport(parsed.lines, replace);
          close();
        }}
      >
        <header className="border-b border-slate-100 px-5 py-4">
          <p className="eyebrow">Custos</p>
          <h2 id="lob-costs-import-title" className="mt-1 text-base font-bold text-slate-900">
            Colar do orçamento
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Copie as linhas do orçamento no Excel (código, descrição e valor, em qualquer ordem) e cole abaixo. Uma coluna com o nome do
            pacote de serviço já aponta o item a ele; o resto fica como não apropriado, para apontar depois.
          </p>
        </header>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label htmlFor="lob-costs-import-text" className="text-sm font-semibold text-slate-700">
              Linhas do orçamento
            </label>
            <textarea
              id="lob-costs-import-text"
              className="field mt-1 min-h-32 resize-y font-mono text-xs"
              placeholder={'01.02.003\tAlvenaria de vedação\tR$ 125.000,00\n01.02.004\tVergas e contravergas\t8.400,00'}
              value={text}
              autoFocus
              spellCheck={false}
              onChange={event => setText(event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Em cada linha, o valor é o último número; a descrição é o texto mais longo; um código como 01.02.003 vira o código. Linhas sem
              valor (como o cabeçalho) e linhas de total ficam de fora.
            </p>
          </div>

          {text.trim() && (
            <>
              <p className="text-sm text-slate-700 tabular-nums" aria-live="polite">
                <b>{plural(parsed.lines.length, 'linha lida', 'linhas lidas')}</b>
                {parsed.lines.length > 0 && (
                  <>
                    {' · total '}
                    <b>{formatMoney(total)}</b>
                    {' · '}
                    {plural(recognized, 'com pacote reconhecido', 'com pacote reconhecido')}
                  </>
                )}
                {parsed.ignored.length > 0 && <> · {plural(parsed.ignored.length, 'ignorada', 'ignoradas')}</>}
              </p>

              {parsed.lines.length > 0 && (
                <div className="custom-scrollbar max-h-72 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Prévia das linhas lidas</caption>
                    <thead className="sticky top-0 bg-brand-50 text-[11px] font-bold tracking-wider text-brand-800 uppercase">
                      <tr>
                        <th scope="col" className="px-3 py-2">
                          Linha
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Código
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Descrição
                        </th>
                        <th scope="col" className="px-3 py-2 text-right">
                          Valor
                        </th>
                        <th scope="col" className="px-3 py-2">
                          Pacote
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.lines.slice(0, PREVIEW_ROWS).map(l => {
                        const service = l.serviceId ? serviceById.get(l.serviceId) : undefined;
                        return (
                          <tr key={l.line} className="border-t border-slate-100">
                            <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums">{l.line}</td>
                            <td className="px-3 py-1.5 text-xs whitespace-nowrap text-slate-600 tabular-nums">{l.code ?? '—'}</td>
                            <td className="min-w-48 px-3 py-1.5 text-slate-800">{l.description}</td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap text-slate-800 tabular-nums">
                              {formatMoney(l.amount)}
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              {service ? (
                                <span className="inline-flex items-center gap-1.5 text-slate-700">
                                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: service.color }} />
                                  {service.name}
                                </span>
                              ) : (
                                <span className="text-slate-400">não apropriado</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {parsed.lines.length > PREVIEW_ROWS && (
                    <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                      Mostrando as {PREVIEW_ROWS} primeiras; todas as {parsed.lines.length.toLocaleString('pt-BR')} entram na importação.
                    </p>
                  )}
                </div>
              )}

              {parsed.ignored.length > 0 && (
                <details className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-semibold text-slate-700">
                    {plural(parsed.ignored.length, 'linha ignorada', 'linhas ignoradas')}
                  </summary>
                  <ul className="custom-scrollbar mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                    {parsed.ignored.slice(0, PREVIEW_ROWS).map(i => (
                      <li key={i.line}>
                        <span className="text-slate-400 tabular-nums">Linha {i.line}</span> · <b className="text-slate-700">{i.reason}</b>
                        {i.text && <> · {i.text}</>}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1 accent-primary" checked={replace} onChange={event => setReplace(event.target.checked)} />
            <span>
              <b>Substituir todos os itens atuais</b>
              <span className="block text-xs text-slate-500">
                {replace
                  ? `Os ${plural(currentCount, 'item atual sai', 'itens atuais saem')} do rascunho e ficam só as linhas coladas.`
                  : 'Desligado: as linhas coladas entram depois dos itens que já existem.'}
              </span>
            </span>
          </label>

          {overLimit && (
            <Callout tone="danger" role="alert">
              A obra aceita até {LOB_LIMITS.costItems.toLocaleString('pt-BR')} itens de custo; com esta colagem seriam{' '}
              {resulting.toLocaleString('pt-BR')}. Cole menos linhas ou marque "Substituir todos os itens atuais".
            </Callout>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-500">Importar só põe as linhas na tela: nada é gravado até você clicar em Salvar.</p>
          <div className="flex gap-2">
            <button type="button" className="button-ghost" onClick={close}>
              Cancelar
            </button>
            <button type="submit" className="button" disabled={!canImport}>
              <ClipboardPaste size={15} aria-hidden />
              {parsed.lines.length ? `Importar ${plural(parsed.lines.length, 'linha', 'linhas')}` : 'Importar'}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

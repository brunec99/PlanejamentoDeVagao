'use client';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { Import } from 'lucide-react';
import { applyLobImport, lobServiceRows, type LobServiceRow } from '@/domain/legalization';
import { fetchLob } from '@/modules/longo-prazo/lob/lob-api';
import type { SheetApi } from '@/modules/medio-prazo/schedule-sheet';
import { useToast } from '@/modules/layout/toast';
import { workPath } from '@/shared/format';
import { plural, projectDate } from './legalization-summary';

/* "Trazer da Linha de Balanço" (modelo de 04/11/2026, tela 3; regras 15 e 16): uma linha por serviço
 * da Linha de Balanço, do início do primeiro local ao término do último, com o % medido. Vem marcado
 * o que cai na janela; confirmar leva tudo para o rascunho do cronograma num passo só do desfazer
 * (`api.replaceTasks`). Nada é gravado aqui: a gravação é o "Revisar e salvar" do cronograma. */

type LoadState =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; rows: LobServiceRow[] };
type Range = { start: string; end: string };

const errorMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Falha na comunicação com o servidor.');
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const WORK_GROUP = 'Caminho crítico da obra';
const FINISHES = 'Acabamentos internos dos apartamentos';
const pill = 'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold';
const pillInfo = `${pill} border-primary-ring bg-primary-soft text-primary-ink`;
const pillMuted = `${pill} border-slate-200 bg-slate-100 text-slate-500`;

/** O botão da barra de ferramentas e o diálogo. `autoOpen` abre o diálogo assim que dá para editar
 * (logo depois de criar o Gantt com "Trazer também…" marcado); `onAutoOpenDone` avisa quando ele
 * fecha, para não abrir de novo. */
export function LobImport({
  api,
  workId,
  planId,
  range,
  autoOpen = false,
  onAutoOpenDone,
}: {
  api: SheetApi;
  workId: string;
  planId: string;
  range: Range;
  autoOpen?: boolean;
  onAutoOpenDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Derivado, sem efeito: o pedido de abrir vale enquanto não for consumido no fechamento.
  const showing = open || (autoOpen && api.canEdit);
  return (
    <>
      <span
        data-tour="longo-legal-trazer-lb"
        className="inline-flex"
        title={api.canEdit ? undefined : 'Termine a edição da célula (ou espere a gravação) para trazer da Linha de Balanço.'}
      >
        <button
          type="button"
          className="button-secondary h-8 px-2.5 py-0 text-xs"
          disabled={!api.canEdit}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Import size={14} aria-hidden />
          Trazer da Linha de Balanço
        </button>
      </span>
      {showing && (
        <LobImportDialog
          api={api}
          workId={workId}
          planId={planId}
          range={range}
          onClose={() => {
            setOpen(false);
            if (autoOpen) onAutoOpenDone?.();
          }}
        />
      )}
    </>
  );
}

function LobImportDialog({
  api,
  workId,
  planId,
  range,
  onClose,
}: {
  api: SheetApi;
  workId: string;
  planId: string;
  range: Range;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  const close = () => dialog.current?.close();
  const { toast } = useToast();
  const id = useId();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState('');

  // A Linha de Balanço vem do servidor a cada abertura: medições e blocos mudam fora do planejamento.
  useEffect(() => {
    let cancelled = false;
    fetchLob(workId)
      .then(response => {
        if (cancelled) return;
        if (!response.available) {
          setState({ status: 'unavailable' });
          return;
        }
        const rows = lobServiceRows(response, range);
        setSelected(new Set(rows.filter(r => r.inWindow).map(r => r.serviceId)));
        setState({ status: 'ready', rows });
      })
      .catch(err => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [workId, range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = state.status === 'ready' ? state.rows : [];
  const linked = new Set(api.tasks.map(t => t.lobServiceId).filter((s): s is string => !!s));
  const chosen = rows.filter(r => selected.has(r.serviceId));
  const outside = rows.filter(r => !r.inWindow);
  const hasGroup = api.tasks.some(t => plain(t.name) === plain(WORK_GROUP));
  const hasFinishes = api.tasks.some(t => plain(t.name) === plain(FINISHES));
  const canBring = chosen.length > 0 && api.canEdit;

  const toggle = (serviceId: string) =>
    setSelected(current => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });

  const bring = () => {
    if (!canBring) return;
    setError('');
    try {
      const result = applyLobImport(api.tasks, chosen, {
        planId,
        calendar: api.calendar,
        newId: () => crypto.randomUUID(),
        now: new Date().toISOString(),
      });
      api.replaceTasks(result.tasks);
      close();
      toast({
        title: `${plural(result.added, 'linha nova', 'linhas novas')}, ${plural(result.updated, 'atualizada', 'atualizadas')} · use Revisar e salvar para gravar`,
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const status = (row: LobServiceRow) =>
    linked.has(row.serviceId) ? (
      <span className={row.inWindow ? pillInfo : pillMuted}>Atualiza a linha LB{row.inWindow ? '' : ' · fora da janela'}</span>
    ) : row.inWindow ? (
      <span className={pillInfo}>Linha nova · LB</span>
    ) : (
      <span className={pillMuted}>Fora da janela</span>
    );
  const cell = 'px-3 py-2';

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby={`${id}-title`}
      className="m-auto max-h-[92vh] w-[min(54rem,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <div className="flex max-h-[92vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="eyebrow">Gantt de legalização</p>
            <h3 id={`${id}-title`} className="mt-1 text-base font-bold text-slate-900">
              Trazer da Linha de Balanço
            </h3>
          </div>
          <button type="button" className="button-ghost shrink-0" onClick={close}>
            Fechar
          </button>
        </header>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-sm leading-6 text-slate-600">
            Uma linha por serviço da Linha de Balanço que passa pela janela (termina nela ou depois dela): início do primeiro local, término
            do último e o % medido. As linhas entram{' '}
            {hasGroup ? (
              <>
                no grupo <b className="text-slate-800">{WORK_GROUP}</b>
              </>
            ) : (
              'no fim do cronograma'
            )}{' '}
            com o indicador <span className={pillInfo}>LB</span> e "Não iniciar antes de" no início da Linha de Balanço.
          </p>

          {state.status === 'loading' && (
            <p role="status" className="text-sm text-slate-500">
              Carregando a Linha de Balanço da obra…
            </p>
          )}
          {state.status === 'error' && (
            <p className="callout callout-danger" role="alert">
              {state.message}
            </p>
          )}
          {state.status === 'unavailable' && (
            <p className="callout callout-warning" role="status">
              A Linha de Balanço ainda não está disponível nesta instalação do sistema, então não há serviços para trazer. Avise quem
              administra o sistema.
            </p>
          )}
          {state.status === 'ready' && !rows.length && (
            <p className="callout callout-info">
              A Linha de Balanço desta obra ainda não tem blocos. Lance um fluxo na{' '}
              <Link className="text-link" href={workPath(workId, 'longo-prazo')}>
                Linha de Balanço
              </Link>{' '}
              e volte para trazer os serviços.
            </p>
          )}

          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-brand-50 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap text-brand-800">
                    <th className={`${cell} w-10`}>
                      <span className="sr-only">Trazer</span>
                    </th>
                    <th className={cell}>Serviço</th>
                    <th className={`${cell} text-right`}>Locais</th>
                    <th className={cell}>Início (1º local)</th>
                    <th className={cell}>Término (último)</th>
                    <th className={`${cell} text-right`}>% medido</th>
                    <th className={cell}>No Gantt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const box = `${id}-${row.serviceId}`;
                    return (
                      <tr
                        key={row.serviceId}
                        className={`border-t border-slate-100 whitespace-nowrap ${row.inWindow ? 'text-slate-600' : 'text-slate-400'}`}
                      >
                        <td className={cell}>
                          <input
                            id={box}
                            type="checkbox"
                            className="accent-primary"
                            checked={selected.has(row.serviceId)}
                            onChange={() => toggle(row.serviceId)}
                          />
                        </td>
                        <td className={cell}>
                          <label
                            htmlFor={box}
                            className={`cursor-pointer font-semibold ${row.inWindow ? 'text-slate-900' : 'text-slate-400'}`}
                          >
                            {row.name}
                          </label>
                        </td>
                        <td className={`${cell} text-right tabular-nums`}>{row.locals}</td>
                        <td className={`${cell} tabular-nums`}>{projectDate(row.start)}</td>
                        <td className={`${cell} tabular-nums`}>{projectDate(row.finish)}</td>
                        <td className={`${cell} text-right tabular-nums`}>{row.percent}%</td>
                        <td className={cell}>{status(row)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <p className="callout callout-info">
              Tudo entra no rascunho: nada é gravado antes de "Revisar e salvar". Trazer de novo depois atualiza início, duração e % das
              linhas LB; vínculos e as outras linhas não mudam.
            </p>
          )}
          {rows.length > 0 && hasFinishes && (
            <p className="callout callout-warning">
              O Gantt já tem "{FINISHES}". Se os serviços da Linha de Balanço cobrirem essa tarefa, apague a do modelo e ligue as linhas LB
              à "Limpeza final".
            </p>
          )}
          {error && (
            <p className="callout callout-danger" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="min-w-[12rem] flex-1 text-xs text-slate-500">
            {rows.length > 0 && (
              <>
                <b className="text-slate-900">
                  {chosen.length} de {rows.length}
                </b>{' '}
                {rows.length === 1 ? 'serviço marcado' : 'serviços marcados'}
                {outside.length > 0 &&
                  ` · ${outside.length === 1 ? `${outside[0].name} fica fora da janela` : `${outside.length} fora da janela`}`}
              </>
            )}
          </p>
          <button type="button" className="button-ghost" onClick={close}>
            Cancelar
          </button>
          <button type="button" className="button" disabled={!canBring} onClick={bring}>
            Trazer {plural(chosen.length, 'linha', 'linhas')}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

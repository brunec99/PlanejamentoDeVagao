'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { SAFETY_LIMITS, safetyDays, type SafetyCommand, type SafetyItem, type SafetyPhoto } from '@/domain/safety';
import { Field } from '@/modules/planejamento/forms';
import { Callout } from '@/modules/planejamento/ui';
import { useToast } from '@/modules/layout/toast';
import { PhotoGrid, PhotoInput, type PendingPhoto } from '@/modules/terminalidade/photo-input';
import { PhotoViewer } from '@/modules/terminalidade/photo-viewer';
import { refreshPhotos } from '@/modules/terminalidade/photo-refresh';
import { formatDate } from '@/shared/format';
import { isSafetyConflict, uploadPendingSafetyPhotos } from './api';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const errorText = (cause: unknown, fallback: string) => (cause instanceof Error && cause.message ? cause.message : fallback);

/** Finaliza um apontamento da aba 6: data de correção e, obrigatoriamente, ao menos uma foto da correção
 * (o "antes" aparece ao lado para comparar). Mesmo fluxo do "Resolver pendência" da aba 5: as fotos novas
 * sobem primeiro (Storage + `add_photo`, kind `correction`) e só então vai o `resolve_item`. Se algo falha
 * no meio, o que já subiu fica no apontamento e conta para a exigência; a nova tentativa envia só o que
 * falta. Num 409 (outra gravação chegou antes) avisa e fecha, para a lista recarregar. */
export function SafetyResolveDialog(props: {
  workId: string;
  item: SafetyItem;
  /** Fotos da obra (ou só do apontamento): o diálogo filtra as do apontamento. */
  photos: SafetyPhoto[];
  today: string;
  execute: (c: SafetyCommand) => Promise<void>;
  onClose: () => void;
}) {
  const { workId, item, photos, today, execute, onClose } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const { toast } = useToast();
  const [correctedOn, setCorrectedOn] = useState(() => (today < item.observedOn ? item.observedOn : today));
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<{ photos: SafetyPhoto[]; index: number }>();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const itemPhotos = useMemo(
    () => photos.filter(p => p.itemId === item.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [photos, item.id],
  );
  const issuePhotos = itemPhotos.filter(p => p.kind === 'issue');
  const correctionPhotos = itemPhotos.filter(p => p.kind === 'correction');
  const room = Math.max(0, SAFETY_LIMITS.maxPhotosPerItem - itemPhotos.length);
  const alreadyResolved = item.status === 'resolved';
  const openDays = safetyDays({ observedOn: item.observedOn }, today);

  const hasPhoto = correctionPhotos.length + pending.length > 0;
  const dateProblem = !ISO_DATE.test(correctedOn)
    ? 'Informe a data de correção.'
    : correctedOn > today
      ? 'A data de correção não pode ser futura.'
      : correctedOn < item.observedOn
        ? `A correção não pode ser antes do apontamento (${formatDate(item.observedOn)}).`
        : '';
  const ready = hasPhoto && !dateProblem && !preparing && !busy && !alreadyResolved;

  const close = () => {
    if (!busy) dialog.current?.close();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await uploadPendingSafetyPhotos({
        workId,
        itemId: item.id,
        kind: 'correction',
        photos: pending,
        execute,
        onProgress: (current, total) => setProgress(total > 1 ? `Enviando foto ${current} de ${total}…` : 'Enviando foto…'),
        onUploaded: pendingId => setPending(current => current.filter(p => p.id !== pendingId)),
      });
    } catch (cause) {
      setError(
        `${errorText(cause, 'Falha ao enviar a foto.')} O apontamento continua em aberto; as fotos que subiram ficaram salvas. Toque em “Tentar de novo”.`,
      );
      setProgress('');
      setBusy(false);
      return;
    }
    try {
      setProgress('Finalizando…');
      await execute({ type: 'resolve_item', itemId: item.id, correctedOn, ...(note.trim() ? { resolutionNote: note.trim() } : {}) });
    } catch (cause) {
      setProgress('');
      setBusy(false);
      if (isSafetyConflict(cause)) {
        // Outra gravação chegou antes (apontamento apagado, já finalizado): avisa e fecha.
        toast({ title: 'Não foi possível finalizar o apontamento.', description: errorText(cause, ''), tone: 'danger' });
        dialog.current?.close();
        return;
      }
      setError(
        `${errorText(cause, 'Não foi possível finalizar o apontamento.')} As fotos da correção já estão salvas; toque em “Tentar de novo”.`,
      );
      return;
    }
    setProgress('');
    setBusy(false);
    toast({ title: 'Apontamento finalizado.', description: `Corrigido em ${formatDate(correctedOn)}.`, tone: 'success' });
    dialog.current?.close();
  };

  const requirement = !hasPhoto
    ? 'Adicione ao menos uma foto da correção para finalizar.'
    : dateProblem || (preparing ? 'Aguarde a foto ficar pronta.' : '');

  return (
    <dialog
      ref={dialog}
      // O React repassa `cancel`/`close` do visualizador de fotos (outro <dialog> aqui dentro).
      onCancel={event => {
        if (event.target === event.currentTarget && busy) event.preventDefault();
      }}
      onClose={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="seguranca-finalizar-titulo"
      className="m-auto max-h-[92dvh] w-[min(40rem,94vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Segurança do trabalho{item.location ? ` · ${item.location}` : ''}</p>
            <h3 id="seguranca-finalizar-titulo" className="mt-1 text-base font-bold text-slate-900">
              Finalizar apontamento
            </h3>
          </div>
          <button type="button" className="button-ghost min-h-11" onClick={close} disabled={busy}>
            Fechar
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm leading-6 whitespace-pre-line text-slate-800">{item.description}</p>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <div>
              <dt className="inline font-semibold">Apontado: </dt>
              <dd className="inline">
                {formatDate(item.observedOn)}
                {alreadyResolved ? '' : ` (há ${openDays} ${openDays === 1 ? 'dia' : 'dias'})`}
              </dd>
            </div>
            {item.location && (
              <div>
                <dt className="inline font-semibold">Local: </dt>
                <dd className="inline">{item.location}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-semibold">Risco: </dt>
              <dd className="inline">
                {item.consequence} · {item.probability}
              </dd>
            </div>
          </dl>
        </div>

        <section className="mt-4 space-y-2" aria-labelledby="seguranca-finalizar-antes">
          <h4 id="seguranca-finalizar-antes" className="text-xs font-semibold text-slate-600">
            Antes (fotos do apontamento)
          </h4>
          {issuePhotos.length ? (
            <PhotoGrid photos={issuePhotos} label="Foto do apontamento" onOpen={index => setViewer({ photos: issuePhotos, index })} />
          ) : (
            <p className="text-sm text-slate-500">O apontamento foi registrado sem foto.</p>
          )}
        </section>

        {alreadyResolved ? (
          <div className="mt-5">
            <Callout tone="success" role="status">
              Este apontamento já foi finalizado{item.correctedOn ? ` em ${formatDate(item.correctedOn)}` : ''}.
            </Callout>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
            <fieldset disabled={busy} className="space-y-4">
              <Field label="Data de correção" hint={`Entre ${formatDate(item.observedOn)} e hoje.`}>
                <input
                  className="field min-h-11 sm:max-w-[14rem]"
                  type="date"
                  required
                  min={item.observedOn}
                  max={today}
                  value={correctedOn}
                  onChange={e => setCorrectedOn(e.target.value)}
                />
              </Field>
              <Field label="Como foi corrigido" hint="Opcional. O que foi feito, por quem, material usado.">
                <textarea
                  className="field min-h-20"
                  maxLength={SAFETY_LIMITS.maxResolutionNote}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Ex.: guarda-corpo reinstalado e travado pela equipe da estrutura."
                />
              </Field>
            </fieldset>

            <section className="space-y-2" aria-labelledby="seguranca-finalizar-depois">
              <h4 id="seguranca-finalizar-depois" className="text-xs font-semibold text-slate-600">
                Depois (fotos da correção) <span className="font-normal text-slate-500">· obrigatória ao menos uma</span>
              </h4>
              {correctionPhotos.length > 0 && (
                <PhotoGrid
                  photos={correctionPhotos}
                  label="Foto da correção"
                  onOpen={index => setViewer({ photos: correctionPhotos, index })}
                />
              )}
              <PhotoInput
                value={pending}
                onChange={setPending}
                max={room}
                disabled={busy}
                onBusyChange={setPreparing}
                noun="apontamento"
                emptyHint={correctionPhotos.length ? undefined : 'Fotografe o local corrigido, do mesmo ângulo da foto do apontamento.'}
              />
            </section>

            {error && (
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            )}

            <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 bg-white px-5 py-3 sm:-mx-6 sm:px-6">
              <button className="button min-h-11" type="submit" disabled={!ready}>
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" aria-hidden />
                    {progress || 'Salvando…'}
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} aria-hidden />
                    {error ? 'Tentar de novo' : 'Finalizar apontamento'}
                  </>
                )}
              </button>
              {!busy && requirement && (
                <span className="text-xs text-slate-500" role="status">
                  {requirement}
                </span>
              )}
            </div>
          </form>
        )}
      </div>
      {viewer && (
        <PhotoViewer
          photos={refreshPhotos(viewer.photos, photos)}
          startIndex={viewer.index}
          onClose={() => setViewer(undefined)}
          issueLabel="Apontamento"
        />
      )}
    </dialog>
  );
}

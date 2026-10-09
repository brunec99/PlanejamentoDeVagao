'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import {
  TERMINALITY_LIMITS,
  type TerminalityCommand,
  type TerminalityData,
  type TerminalityItem,
  type TerminalityPhoto,
} from '@/domain/terminality';
import { Field } from '@/modules/planejamento/forms';
import { Callout } from '@/modules/planejamento/ui';
import { formatDate } from '@/shared/format';
import { useToast } from '@/modules/layout/toast';
import { PhotoGrid, PhotoInput, uploadPendingPhotos, type PendingPhoto } from './photo-input';
import { PhotoViewer } from './photo-viewer';
import { refreshPhotos } from './photo-refresh';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const errorText = (cause: unknown, fallback: string) => (cause instanceof Error && cause.message ? cause.message : fallback);

/** Dá baixa numa pendência: data da correção e, obrigatoriamente, ao menos uma foto do serviço
 * corrigido (o "antes" aparece ao lado para comparar). As fotos novas sobem primeiro (Storage +
 * `add_photo`, kind `correction`) e só então vai o `resolve_item`. Se algo falha no meio, o que já
 * subiu fica na pendência e conta para a exigência; a nova tentativa envia só o que falta. */
export function ResolveDialog(props: {
  workId: string;
  item: TerminalityItem;
  data: TerminalityData;
  today: string;
  execute: (c: TerminalityCommand) => Promise<void>;
  onClose: () => void;
}) {
  const { workId, item, data, today, execute, onClose } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const { toast } = useToast();
  const live = data.items.find(i => i.id === item.id) ?? item;
  const [correctedOn, setCorrectedOn] = useState(() => (today < item.observedOn ? item.observedOn : today));
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState<{ photos: TerminalityPhoto[]; index: number }>();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const photos = useMemo(
    () => data.photos.filter(p => p.itemId === item.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [data.photos, item.id],
  );
  const issuePhotos = photos.filter(p => p.kind === 'issue');
  const correctionPhotos = photos.filter(p => p.kind === 'correction');
  const room = Math.max(0, TERMINALITY_LIMITS.maxPhotosPerItem - photos.length);

  const floor = data.floors.find(f => f.id === live.floorId)?.name ?? 'Pavimento removido';
  const unit = live.unitId ? data.units.find(u => u.id === live.unitId)?.name : undefined;
  const type = live.typeId ? data.types.find(t => t.id === live.typeId)?.name : undefined;
  const person = live.atrPersonId ? data.people.find(p => p.id === live.atrPersonId)?.name : undefined;
  const alreadyResolved = live.status === 'resolved';

  const hasPhoto = correctionPhotos.length + pending.length > 0;
  const dateProblem = !ISO_DATE.test(correctedOn)
    ? 'Informe a data da correção.'
    : correctedOn > today
      ? 'A data da correção não pode ser futura.'
      : correctedOn < live.observedOn
        ? `A correção não pode ser antes da observação (${formatDate(live.observedOn)}).`
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
      await uploadPendingPhotos({
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
        `${errorText(cause, 'Falha ao enviar a foto.')} A pendência continua em aberto; as fotos que subiram ficaram salvas. Toque em “Tentar de novo”.`,
      );
      setProgress('');
      setBusy(false);
      return;
    }
    try {
      setProgress('Dando baixa…');
      await execute({ type: 'resolve_item', itemId: item.id, correctedOn });
    } catch (cause) {
      setError(
        `${errorText(cause, 'Não foi possível resolver a pendência.')} As fotos da correção já estão salvas; toque em “Tentar de novo”.`,
      );
      setProgress('');
      setBusy(false);
      return;
    }
    setProgress('');
    setBusy(false);
    toast({ title: 'Pendência resolvida.', description: `Corrigida em ${formatDate(correctedOn)}.`, tone: 'success' });
    dialog.current?.close();
  };

  const requirement = !hasPhoto
    ? 'Adicione ao menos uma foto do serviço corrigido para resolver.'
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
      aria-labelledby="terminalidade-resolver-titulo"
      className="m-auto max-h-[92dvh] w-[min(40rem,94vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">
              Terminalidade · {floor}
              {unit ? ` · ${unit}` : ''}
            </p>
            <h3 id="terminalidade-resolver-titulo" className="mt-1 text-base font-bold text-slate-900">
              Resolver pendência
            </h3>
          </div>
          <button type="button" className="button-ghost min-h-11" onClick={close} disabled={busy}>
            Fechar
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm leading-6 whitespace-pre-line text-slate-800">{live.description}</p>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <div>
              <dt className="inline font-semibold">Observada: </dt>
              <dd className="inline">{formatDate(live.observedOn)}</dd>
            </div>
            {type && (
              <div>
                <dt className="inline font-semibold">Tipo: </dt>
                <dd className="inline">{type}</dd>
              </div>
            )}
            {live.contractor && (
              <div>
                <dt className="inline font-semibold">Terceiro: </dt>
                <dd className="inline">{live.contractor}</dd>
              </div>
            )}
            {person && (
              <div>
                <dt className="inline font-semibold">ATR: </dt>
                <dd className="inline">{person}</dd>
              </div>
            )}
          </dl>
        </div>

        <section className="mt-4 space-y-2" aria-labelledby="terminalidade-resolver-antes">
          <h4 id="terminalidade-resolver-antes" className="text-xs font-semibold text-slate-600">
            Antes (fotos do problema)
          </h4>
          {issuePhotos.length ? (
            <PhotoGrid photos={issuePhotos} label="Foto do problema" onOpen={index => setViewer({ photos: issuePhotos, index })} />
          ) : (
            <p className="text-sm text-slate-500">A pendência foi registrada sem foto.</p>
          )}
        </section>

        {alreadyResolved ? (
          <div className="mt-5">
            <Callout tone="success" role="status">
              Esta pendência já foi resolvida{live.correctedOn ? ` em ${formatDate(live.correctedOn)}` : ''}.
            </Callout>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
            <fieldset disabled={busy} className="space-y-4">
              <Field label="Data da correção" hint={`Entre ${formatDate(live.observedOn)} e hoje.`}>
                <input
                  className="field min-h-11 sm:max-w-[14rem]"
                  type="date"
                  required
                  min={live.observedOn}
                  max={today}
                  value={correctedOn}
                  onChange={e => setCorrectedOn(e.target.value)}
                />
              </Field>
            </fieldset>

            <section className="space-y-2" aria-labelledby="terminalidade-resolver-depois">
              <h4 id="terminalidade-resolver-depois" className="text-xs font-semibold text-slate-600">
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
                emptyHint={correctionPhotos.length ? undefined : 'Fotografe o serviço pronto, do mesmo ângulo da foto do problema.'}
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
                    {error ? 'Tentar de novo' : 'Resolver pendência'}
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
        <PhotoViewer photos={refreshPhotos(viewer.photos, data.photos)} startIndex={viewer.index} onClose={() => setViewer(undefined)} />
      )}
    </dialog>
  );
}

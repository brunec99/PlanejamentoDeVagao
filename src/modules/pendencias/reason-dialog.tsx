'use client';
import { useState, type FormEvent } from 'react';
import { PENDING_LIMITS, PENDING_STATUS_LABELS, type PendingStatus } from '@/domain/pending-board';
import { Field } from '@/modules/planejamento/forms';
import { Callout } from '@/modules/planejamento/ui';
import { errorText } from './api';
import { Modal } from './parts';

/** Pausar e cancelar pedem um motivo, que aparece no card (regra 2). O card só muda de coluna depois de
 * o motivo ser confirmado; cancelar aqui deixa o card onde estava. */
export function ReasonDialog({
  title,
  status,
  onSubmit,
  onClose,
}: {
  title: string;
  status: PendingStatus;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const verb = status === 'cancelled' ? 'Cancelar' : 'Pausar';
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const text = reason.trim();
    if (!text) return setError('Escreva o motivo.');
    setBusy(true);
    setError('');
    try {
      await onSubmit(text);
      onClose();
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível mover o card.'));
      setBusy(false);
    }
  };
  return (
    <Modal onClose={onClose} labelledBy="pendencia-motivo-titulo" busy={busy} width="sm">
      <form className="space-y-4 p-5" onSubmit={submit} noValidate>
        <div>
          <h3 id="pendencia-motivo-titulo" className="text-base font-bold text-slate-900">
            {verb} a pendência?
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            <strong className="text-slate-800">{title}</strong> vai para {PENDING_STATUS_LABELS[status]}. O motivo aparece no card.
          </p>
        </div>
        <Field label="Motivo">
          <textarea
            className="field min-h-20 resize-y"
            value={reason}
            onChange={event => setReason(event.target.value)}
            maxLength={PENDING_LIMITS.reason}
            disabled={busy}
            autoFocus
            required
          />
        </Field>
        {error && (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="button-ghost" onClick={onClose} disabled={busy}>
            Voltar
          </button>
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Movendo…' : `${verb} pendência`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  isSafetyConsequence,
  isSafetyProbability,
  SAFETY_CONSEQUENCES,
  SAFETY_LIMITS,
  SAFETY_PROBABILITIES,
  type SafetyCommand,
  type SafetyItem,
  type SafetyType,
} from '@/domain/safety';
import { Callout } from '@/modules/planejamento/ui';
import { useToast } from '@/modules/layout/toast';
import { isSafetyConflict } from './api';

/** Edição em lote da aba 6, como a da aba 5: o mesmo tipo, risco (consequência e probabilidade) ou local
 * em vários apontamentos de uma vez. Cada campo abre em "Manter como está", e só o que a pessoa trocar vai
 * para o servidor, numa só gravação (`update_items`); "Sem tipo" limpa o tipo em todos. Descrição, datas,
 * situação e fotos não mudam. */

const KEEP = '__manter__';
const CLEAR = '__limpar__';

export function SafetyBulkEditDialog({
  workId,
  items,
  types,
  locationSuggestions,
  execute,
  onClose,
  onDone,
}: {
  workId: string;
  /** Os apontamentos marcados. */
  items: SafetyItem[];
  types: SafetyType[];
  locationSuggestions: string[];
  execute: (c: SafetyCommand) => Promise<void>;
  onClose: () => void;
  /** Depois de gravar (a tela desmarca as linhas). */
  onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { toast } = useToast();
  const [typeId, setTypeId] = useState(KEEP);
  const [consequence, setConsequence] = useState(KEEP);
  const [probability, setProbability] = useState(KEEP);
  const [locationMode, setLocationMode] = useState<'keep' | 'set'>('keep');
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const activeTypes = useMemo(
    () =>
      types.filter(t => t.active).sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, 'pt-BR', { numeric: true })),
    [types],
  );
  const itemIds = useMemo(() => items.map(item => item.id), [items]);
  const count = itemIds.length;
  const noun = count === 1 ? 'apontamento' : 'apontamentos';
  // O valor atual de cada campo nos marcados: igual em todos, ou "valores diferentes".
  const current = (pick: (item: SafetyItem) => string | undefined, name: (value: string) => string, empty: string) => {
    const values = new Set(items.map(item => pick(item) ?? ''));
    if (values.size !== 1) return 'valores diferentes';
    const only = [...values][0];
    return only ? name(only) : empty;
  };
  const typeNow = current(
    item => item.typeId,
    id => types.find(t => t.id === id)?.name ?? '—',
    'Sem tipo',
  );
  const consequenceNow = current(
    item => item.consequence,
    value => value,
    '—',
  );
  const probabilityNow = current(
    item => item.probability,
    value => value,
    '—',
  );
  const locationNow = current(
    item => item.location.trim(),
    value => value,
    'Sem local',
  );

  const command = (): Extract<SafetyCommand, { type: 'update_items' }> => ({
    type: 'update_items',
    workId,
    itemIds,
    ...(typeId !== KEEP ? { typeId: typeId === CLEAR ? null : typeId } : {}),
    ...(isSafetyConsequence(consequence) ? { consequence } : {}),
    ...(isSafetyProbability(probability) ? { probability } : {}),
    ...(locationMode === 'set' ? { location: location.trim() } : {}),
  });
  const nothing = typeId === KEEP && consequence === KEEP && probability === KEEP && locationMode === 'keep';
  const locationProblem =
    locationMode === 'set' && !location.trim()
      ? 'Escreva o local, ou volte para "Manter como está".'
      : location.trim().length > SAFETY_LIMITS.maxLocation
        ? `O local passa de ${SAFETY_LIMITS.maxLocation} caracteres.`
        : '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || nothing || locationProblem) return;
    setBusy(true);
    setError('');
    try {
      await execute(command());
      toast({ title: `${count} ${count === 1 ? 'apontamento atualizado' : 'apontamentos atualizados'}.`, tone: 'success' });
      onDone();
      dialog.current?.close();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível salvar.';
      if (isSafetyConflict(cause)) {
        // Outra gravação chegou antes (apontamento apagado, tipo desativado): avisa e fecha.
        toast({ title: 'Não foi possível salvar a edição em lote.', description: message, tone: 'danger' });
        dialog.current?.close();
      } else setError(message);
    } finally {
      setBusy(false);
    }
  }

  const label = 'mb-1.5 block text-xs font-semibold text-slate-600';
  const hint = 'mt-1 text-xs text-slate-500';
  return (
    <dialog
      ref={dialog}
      onCancel={event => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
      aria-labelledby="seguranca-lote-titulo"
      className="m-auto max-h-[92dvh] w-[min(36rem,94vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55"
    >
      <form className="space-y-4 p-5 sm:p-6" onSubmit={submit}>
        <div>
          <p className="eyebrow">Segurança do trabalho · edição em lote</p>
          <h3 id="seguranca-lote-titulo" className="mt-1 text-base font-bold text-slate-900">
            Editar {count} {noun}
          </h3>
          <p className="mt-1 text-sm text-slate-600">Só os campos que você trocar mudam; o resto de cada apontamento fica como está.</p>
        </div>

        <label className="block">
          <span className={label}>Tipo de apontamento</span>
          <select className="field min-h-11" value={typeId} onChange={e => setTypeId(e.target.value)} disabled={busy}>
            <option value={KEEP}>Manter como está</option>
            {activeTypes.map(type => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
            <option value={CLEAR}>Sem tipo</option>
          </select>
          <span className={hint}>Hoje: {typeNow}</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Risco: consequência</span>
            <select className="field min-h-11" value={consequence} onChange={e => setConsequence(e.target.value)} disabled={busy}>
              <option value={KEEP}>Manter como está</option>
              {SAFETY_CONSEQUENCES.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span className={hint}>Hoje: {consequenceNow}</span>
          </label>

          <label className="block">
            <span className={label}>Risco: probabilidade</span>
            <select className="field min-h-11" value={probability} onChange={e => setProbability(e.target.value)} disabled={busy}>
              <option value={KEEP}>Manter como está</option>
              {SAFETY_PROBABILITIES.map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span className={hint}>Hoje: {probabilityNow}</span>
          </label>
        </div>

        <div>
          <label className="block">
            <span className={label}>Local</span>
            <select
              className="field min-h-11"
              value={locationMode}
              onChange={e => setLocationMode(e.target.value === 'set' ? 'set' : 'keep')}
              disabled={busy}
            >
              <option value="keep">Manter como está</option>
              <option value="set">Trocar por…</option>
            </select>
          </label>
          {locationMode === 'set' && (
            <>
              <input
                className="field mt-2 min-h-11"
                list="seguranca-lote-locais"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Um local já usado na obra ou outro"
                maxLength={SAFETY_LIMITS.maxLocation}
                autoComplete="off"
                aria-label="Local"
                autoFocus
                disabled={busy}
              />
              <datalist id="seguranca-lote-locais">
                {locationSuggestions.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </>
          )}
          <span className={hint}>Hoje: {locationNow}</span>
        </div>

        {(error || (locationProblem && location.trim())) && (
          <Callout tone="danger" role="alert">
            {error || locationProblem}
          </Callout>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="button-ghost min-h-11" onClick={() => dialog.current?.close()} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="button min-h-11" disabled={busy || nothing || !!locationProblem}>
            {busy ? 'Salvando…' : `Aplicar a ${count}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}

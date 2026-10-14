'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { TERMINALITY_LIMITS, type TerminalityCommand, type TerminalityData } from '@/domain/terminality';
import { Callout } from '@/modules/planejamento/ui';
import { useToast } from '@/modules/layout/toast';

/** Edição em lote da aba 5 (14/10/2026): o mesmo tipo, responsável ATR ou responsável terceiro em
 * várias pendências de uma vez. Cada campo abre em "Manter como está", e só o que a pessoa trocar vai
 * para o servidor (`update_items`); "Sem …" limpa o campo em todas. */

const KEEP = '__manter__';
const CLEAR = '__limpar__';

export function BulkEditDialog({
  workId,
  itemIds,
  data,
  companies,
  execute,
  onClose,
  onDone,
}: {
  workId: string;
  itemIds: string[];
  data: TerminalityData;
  companies: string[];
  execute: (command: TerminalityCommand) => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { toast } = useToast();
  const [typeId, setTypeId] = useState(KEEP);
  const [personId, setPersonId] = useState(KEEP);
  const [contractorMode, setContractorMode] = useState<'keep' | 'set' | 'clear'>('keep');
  const [contractor, setContractor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const types = useMemo(() => data.types.filter(t => t.active).sort((a, b) => a.orderIndex - b.orderIndex), [data.types]);
  const people = useMemo(() => data.people.filter(p => p.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [data.people]);
  const selected = useMemo(() => data.items.filter(item => itemIds.includes(item.id)), [data.items, itemIds]);
  // O valor atual de cada campo nas selecionadas: igual em todas, ou "vários".
  const current = (pick: (item: (typeof selected)[number]) => string | undefined, name: (id: string) => string) => {
    const values = new Set(selected.map(item => pick(item) ?? ''));
    if (values.size !== 1) return 'valores diferentes';
    const only = [...values][0];
    return only ? name(only) : 'vazio';
  };
  const typeNow = current(
    item => item.typeId,
    id => data.types.find(t => t.id === id)?.name ?? '—',
  );
  const personNow = current(
    item => item.atrPersonId,
    id => data.people.find(p => p.id === id)?.name ?? '—',
  );
  const contractorNow = current(
    item => item.contractor,
    name => name,
  );

  const command = (): Extract<TerminalityCommand, { type: 'update_items' }> => ({
    type: 'update_items',
    workId,
    itemIds,
    ...(typeId !== KEEP ? { typeId: typeId === CLEAR ? null : typeId } : {}),
    ...(personId !== KEEP ? { atrPersonId: personId === CLEAR ? null : personId } : {}),
    ...(contractorMode === 'clear' ? { contractor: null } : contractorMode === 'set' ? { contractor: contractor.trim() } : {}),
  });
  const nothing = typeId === KEEP && personId === KEEP && contractorMode === 'keep';
  const contractorProblem =
    contractorMode === 'set' && !contractor.trim()
      ? 'Escreva o nome do responsável terceiro, ou escolha "Sem responsável terceiro".'
      : contractor.trim().length > TERMINALITY_LIMITS.maxName
        ? `O nome passa de ${TERMINALITY_LIMITS.maxName} caracteres.`
        : '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || nothing || contractorProblem) return;
    setBusy(true);
    setError('');
    try {
      await execute(command());
      toast({ title: `${itemIds.length} ${itemIds.length === 1 ? 'pendência atualizada' : 'pendências atualizadas'}.`, tone: 'success' });
      onDone();
      dialog.current?.close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
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
      aria-labelledby="terminalidade-lote-titulo"
      className="m-auto max-h-[92dvh] w-[min(36rem,94vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55"
    >
      <form className="space-y-4 p-5 sm:p-6" onSubmit={submit}>
        <div>
          <p className="eyebrow">Terminalidade · edição em lote</p>
          <h3 id="terminalidade-lote-titulo" className="mt-1 text-base font-bold text-slate-900">
            Editar {itemIds.length} {itemIds.length === 1 ? 'pendência' : 'pendências'}
          </h3>
          <p className="mt-1 text-sm text-slate-600">Só os campos que você trocar mudam; o resto de cada pendência fica como está.</p>
        </div>

        <label className="block">
          <span className={label}>Tipo</span>
          <select className="field min-h-11" value={typeId} onChange={e => setTypeId(e.target.value)} disabled={busy}>
            <option value={KEEP}>Manter como está</option>
            {types.map(type => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
            <option value={CLEAR}>Sem tipo</option>
          </select>
          <span className={hint}>Hoje: {typeNow}</span>
        </label>

        <label className="block">
          <span className={label}>Responsável ATR</span>
          <select className="field min-h-11" value={personId} onChange={e => setPersonId(e.target.value)} disabled={busy}>
            <option value={KEEP}>Manter como está</option>
            {people.map(person => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
            <option value={CLEAR}>Sem responsável ATR</option>
          </select>
          <span className={hint}>Hoje: {personNow}</span>
        </label>

        <div>
          <label className="block">
            <span className={label}>Responsável terceiro (empreiteiro)</span>
            <select
              className="field min-h-11"
              value={contractorMode === 'set' ? 'set' : contractorMode === 'clear' ? CLEAR : KEEP}
              onChange={e => setContractorMode(e.target.value === 'set' ? 'set' : e.target.value === CLEAR ? 'clear' : 'keep')}
              disabled={busy}
            >
              <option value={KEEP}>Manter como está</option>
              <option value="set">Trocar por…</option>
              <option value={CLEAR}>Sem responsável terceiro</option>
            </select>
          </label>
          {contractorMode === 'set' && (
            <>
              <input
                className="field mt-2 min-h-11"
                list="terminalidade-lote-terceiros"
                value={contractor}
                onChange={e => setContractor(e.target.value)}
                placeholder="Empresa do cadastro de equipes ou outro nome"
                maxLength={TERMINALITY_LIMITS.maxName}
                aria-label="Responsável terceiro"
                autoFocus
                disabled={busy}
              />
              <datalist id="terminalidade-lote-terceiros">
                {companies.map(name => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </>
          )}
          <span className={hint}>Hoje: {contractorNow}</span>
        </div>

        {(error || (contractorProblem && contractor.trim())) && (
          <Callout tone="danger" role="alert">
            {error || contractorProblem}
          </Callout>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" className="button-ghost min-h-11" onClick={() => dialog.current?.close()} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="button min-h-11" disabled={busy || nothing || !!contractorProblem}>
            {busy ? 'Salvando…' : `Aplicar a ${itemIds.length}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}

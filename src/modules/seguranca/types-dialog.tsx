'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Check, Pencil, Plus, X } from 'lucide-react';
import { SAFETY_LIMITS, type SafetyCommand, type SafetyItem, type SafetyType } from '@/domain/safety';
import { nameKey } from '@/modules/configuracoes/terminality-generator';
import { Callout, Empty } from '@/modules/planejamento/ui';
import { useToast } from '@/modules/layout/toast';
import { isSafetyConflict } from './api';

const MAX_NAME = SAFETY_LIMITS.maxName;
const byOrder = (a: SafetyType, b: SafetyType) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
const cleanName = (value: string) => value.replace(/\s+/g, ' ').trim();
const usageLabel = (count: number) =>
  count ? `${count} ${count === 1 ? 'apontamento' : 'apontamentos'} nesta obra` : 'sem uso nesta obra';

type Messages = { success?: string; failure: string };

/** Cadastro dos "Tipos de apontamento" da aba 6. A lista é ÚNICA para todas as obras (a equipe de TSTs é
 * a mesma e a planilha "SST - Controle geral" compara os tipos entre obras): incluir, renomear, desativar
 * ou reordenar vale para todas. Tipo não se exclui: desativado, sai da lista de escolha e continua nos
 * apontamentos que já o usam. A ordem dos ativos é a da lista de escolha (`reorder_types` com todos os
 * ids: os ativos na ordem nova e os desativados no fim). A contagem ao lado de cada tipo é só da obra
 * aberta. Num 409 (outra gravação chegou antes) avisa e fecha, para a lista recarregar. */
export function SafetyTypesDialog({
  types,
  items,
  execute,
  onClose,
}: {
  types: SafetyType[];
  /** Apontamentos da obra aberta, para contar o uso de cada tipo. */
  items: SafetyItem[];
  execute: (c: SafetyCommand) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<string>();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const active = useMemo(() => types.filter(t => t.active).sort(byOrder), [types]);
  const inactive = useMemo(() => types.filter(t => !t.active).sort(byOrder), [types]);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) if (item.typeId) counts.set(item.typeId, (counts.get(item.typeId) ?? 0) + 1);
    return counts;
  }, [items]);

  /** Executa um comando; sucesso e erro vão ao toast. Devolve se deu certo, para o formulário limpar. */
  const run = async (command: SafetyCommand, { success, failure }: Messages) => {
    if (busy) return false;
    setBusy(true);
    try {
      await execute(command);
      if (success) toast({ title: success, tone: 'success' });
      return true;
    } catch (cause) {
      toast({ title: failure, description: cause instanceof Error ? cause.message : 'Tente de novo em instantes.', tone: 'danger' });
      if (isSafetyConflict(cause)) dialog.current?.close();
      return false;
    } finally {
      setBusy(false);
    }
  };

  /** Outro tipo com o mesmo nome, ignorando acento, maiúsculas e espaços (o servidor recusa). */
  const twinOf = (value: string, except?: string) => types.find(t => t.id !== except && nameKey(t.name) === nameKey(value));
  const twinMessage = (twin: SafetyType) =>
    twin.active ? `Já existe o tipo "${twin.name}".` : `Já existe o tipo "${twin.name}", desativado. Reative-o na lista.`;

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const value = cleanName(name);
    if (!value) return;
    const twin = twinOf(value);
    if (twin) {
      setError(twinMessage(twin));
      return;
    }
    setError('');
    if (
      await run(
        { type: 'create_type', name: value },
        { success: `Tipo ${value} adicionado.`, failure: 'Não foi possível adicionar o tipo.' },
      )
    )
      setName('');
  };
  const rename = async (type: SafetyType, value: string) => {
    const twin = twinOf(value, type.id);
    if (twin) {
      setError(twinMessage(twin));
      return;
    }
    setError('');
    if (
      await run(
        { type: 'update_type', typeId: type.id, name: value },
        { success: 'Tipo renomeado.', failure: 'Não foi possível renomear o tipo.' },
      )
    )
      setRenaming(undefined);
  };
  const toggle = (type: SafetyType) =>
    void run(
      { type: 'update_type', typeId: type.id, active: !type.active },
      {
        success: type.active ? `Tipo ${type.name} desativado.` : `Tipo ${type.name} reativado.`,
        failure: type.active ? 'Não foi possível desativar o tipo.' : 'Não foi possível reativar o tipo.',
      },
    );
  const move = (index: number, delta: -1 | 1) => {
    const ids = active.map(t => t.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void run({ type: 'reorder_types', typeIds: [...ids, ...inactive.map(t => t.id)] }, { failure: 'Não foi possível reordenar os tipos.' });
  };

  const row = (type: SafetyType, index: number) => (
    <li key={type.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
      {renaming === type.id ? (
        <RenameForm
          value={type.name}
          label={`Novo nome de ${type.name}`}
          busy={busy}
          onCancel={() => setRenaming(undefined)}
          onSave={value => rename(type, value)}
        />
      ) : (
        <span className={`text-sm font-medium ${type.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{type.name}</span>
      )}
      {!type.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Desativado</span>}
      <span className="text-xs text-slate-500">{usageLabel(usage.get(type.id) ?? 0)}</span>
      <div className="ml-auto flex items-center gap-0.5">
        {type.active && (
          <>
            <IconButton label={`Mover ${type.name} para cima na lista`} disabled={busy || index === 0} onClick={() => move(index, -1)}>
              <ArrowUp size={14} aria-hidden />
            </IconButton>
            <IconButton
              label={`Mover ${type.name} para baixo na lista`}
              disabled={busy || index === active.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown size={14} aria-hidden />
            </IconButton>
          </>
        )}
        <IconButton label={`Renomear ${type.name}`} disabled={busy || renaming === type.id} onClick={() => setRenaming(type.id)}>
          <Pencil size={14} aria-hidden />
        </IconButton>
        <button type="button" className="button-ghost ml-1 px-2 py-1 text-xs" disabled={busy} onClick={() => toggle(type)}>
          {type.active ? 'Desativar' : 'Reativar'}
        </button>
      </div>
    </li>
  );

  return (
    <dialog
      ref={dialog}
      onCancel={event => {
        if (busy) event.preventDefault();
      }}
      onClose={onClose}
      aria-labelledby="seguranca-tipos-titulo"
      className="m-auto max-h-[92dvh] w-[min(40rem,94vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55"
    >
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Segurança do trabalho · cadastro</p>
            <h3 id="seguranca-tipos-titulo" className="mt-1 text-base font-bold text-slate-900">
              Tipos de apontamento
            </h3>
          </div>
          <button type="button" className="button-ghost min-h-11" onClick={() => dialog.current?.close()} disabled={busy}>
            Fechar
          </button>
        </div>

        <Callout tone="info">
          Esta lista é a mesma para <strong>todas as obras</strong>: incluir, renomear, desativar ou reordenar um tipo vale para os
          apontamentos de todas elas. A contagem ao lado de cada tipo é só desta obra.
        </Callout>
        <p className="text-sm text-slate-600">
          Tipos não são excluídos. Desativado, o tipo sai da lista de escolha dos novos apontamentos e continua nos que já o usam. A ordem
          abaixo é a da lista de escolha.
        </p>

        <form className="flex flex-wrap gap-2" onSubmit={add}>
          <label className="min-w-48 flex-1">
            <span className="sr-only">Nome do novo tipo</span>
            <input
              className="field"
              value={name}
              maxLength={MAX_NAME}
              placeholder="Ex.: Içamento de cargas"
              disabled={busy}
              onChange={e => {
                setName(e.target.value);
                setError('');
              }}
            />
          </label>
          <button type="submit" className="button" disabled={busy || !name.trim()}>
            <Plus size={15} aria-hidden />
            Adicionar tipo
          </button>
        </form>
        {error && (
          <Callout tone="warning" role="alert">
            {error}
          </Callout>
        )}

        {active.length === 0 ? (
          <Empty>Nenhum tipo ativo. Adicione um acima ou reative um dos desativados.</Empty>
        ) : (
          <ol
            className="divide-y divide-slate-100 rounded-xl border border-slate-200"
            aria-label="Tipos ativos, na ordem da lista de escolha"
          >
            {active.map(row)}
          </ol>
        )}

        {inactive.length > 0 && (
          <section className="space-y-2" aria-labelledby="seguranca-tipos-desativados">
            <h4 id="seguranca-tipos-desativados" className="text-xs font-semibold text-slate-600">
              Desativados <span className="font-normal text-slate-500">({inactive.length})</span>
            </h4>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{inactive.map(row)}</ul>
          </section>
        )}
      </div>
    </dialog>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Renomeação no lugar do nome: Enter salva, Esc cancela (sem fechar o diálogo). */
function RenameForm({
  value,
  label,
  busy,
  onSave,
  onCancel,
}: {
  value: string;
  label: string;
  busy: boolean;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = cleanName(text);
    if (!name || name === value) onCancel();
    else void onSave(name);
  };
  return (
    <form className="flex items-center gap-1" onSubmit={submit}>
      <input
        ref={input}
        className="field w-56 py-1"
        aria-label={label}
        value={text}
        maxLength={MAX_NAME}
        disabled={busy}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') {
            // Sem isto, o Esc também fecharia o diálogo.
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <button
        type="submit"
        className="rounded-lg p-1.5 text-success hover:bg-success-soft disabled:opacity-35"
        aria-label="Salvar nome"
        title="Salvar"
        disabled={busy}
      >
        <Check size={14} aria-hidden />
      </button>
      <button
        type="button"
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
        aria-label="Cancelar"
        title="Cancelar"
        onClick={onCancel}
      >
        <X size={14} aria-hidden />
      </button>
    </form>
  );
}

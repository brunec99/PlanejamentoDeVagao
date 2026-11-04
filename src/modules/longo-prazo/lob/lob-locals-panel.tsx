'use client';
import { useState } from 'react';
import { ArrowDown, ArrowUp, Building2, Trash2 } from 'lucide-react';
import { LOB_LIMITS, normalizeName, type LobCommand, type LobData } from '@/domain/lob';
import { Drawer } from '@/modules/layout/drawer';
import { useConfirm } from '@/modules/layout/confirm';
import { useToast } from '@/modules/layout/toast';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { byHeight } from '@/modules/longo-prazo/line-of-balance';
import { CommitField } from './lob-activity-panel';

/** Gaveta "Locais da obra" da Linha de Balanço: o cadastro próprio dos locais (regra 13), listado
 * como um prédio, de cima para baixo, com o último `orderIndex` no topo. Renomear é inline, a ordem
 * muda pelas setas e o cadastro em lote aceita um nome por linha; "Usar os locais da obra" traz os
 * locais do planejamento (vagões) ordenados por altura, pulando os que já existem. */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Falha na comunicação com o servidor.');
/** Rodapé fixo da gaveta, como nos painéis do Planejador. */
const drawerFooter = 'sticky bottom-0 -mx-5 -mb-4 mt-6 border-t border-slate-100 bg-white px-5 py-4';

export function LobLocalsPanel({
  workId,
  data,
  readOnly,
  onExecute,
  onClose,
}: {
  workId: string;
  data: LobData;
  readOnly: boolean;
  onExecute: (command: LobCommand) => Promise<unknown>;
  onClose: () => void;
}) {
  const context = usePlanning();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [batch, setBatch] = useState('');

  // Do topo para a base, como se olha um prédio.
  const ordered = [...data.locals].sort((a, b) => b.orderIndex - a.orderIndex);
  const existing = new Set(data.locals.map(l => normalizeName(l.name)));
  const ready = context.state === 'ready' ? context : undefined;
  const planningLocals = ready
    ? ready.planning.data.locations
        .filter(l => l.workId === workId)
        .sort(byHeight)
        .map(l => l.name)
    : [];
  const fresh = planningLocals.filter(name => !existing.has(normalizeName(name)));
  const names = [
    ...new Set(
      batch
        .split(/\r?\n/)
        .map(n => n.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    ),
  ];
  const duplicates = names.filter(n => existing.has(normalizeName(n)));
  const remaining = LOB_LIMITS.locals - data.locals.length;

  const send = async (command: LobCommand) => {
    setBusy(true);
    try {
      await onExecute(command);
      return true;
    } catch (error) {
      toast({ title: 'Não foi possível salvar', description: errorMessage(error), tone: 'danger' });
      return false;
    } finally {
      setBusy(false);
    }
  };
  /** Troca duas posições da lista (que está de cima para baixo) e manda a ordem inteira, de baixo
   * para cima, como o servidor espera. */
  const swap = (i: number, j: number) => {
    if (j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];
    send({ type: 'reorder_locals', workId, localIds: next.reverse().map(l => l.id) });
  };
  const remove = async (id: string, name: string) => {
    const blocks = data.activities.filter(a => a.localId === id).length;
    const ok = await confirm({
      title: `Excluir o local "${name}"?`,
      description: blocks
        ? `Este local tem ${plural(blocks, 'bloco', 'blocos')}: a exclusão será recusada até eles saírem.`
        : 'O local sai da Linha de Balanço. Os locais dos vagões não mudam.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (ok) send({ type: 'delete_local', localId: id });
  };
  const create = async () => {
    if (!names.length || duplicates.length) return;
    if (await send({ type: 'create_locals', workId, names })) {
      toast({ title: `${plural(names.length, 'local cadastrado', 'locais cadastrados')}` });
      setBatch('');
    }
  };

  return (
    <Drawer open onClose={onClose} title="Locais da obra" description="Linha de Balanço · de cima para baixo, como o prédio">
      {!ordered.length && (
        <p className="py-6 text-center text-sm text-slate-500">
          Nenhum local ainda. Cadastre abaixo, um por linha, começando pela base{planningLocals.length ? ', ou use os locais da obra' : ''}.
        </p>
      )}
      <ol className="space-y-1.5" aria-label="Locais, do topo para a base">
        {ordered.map((local, index) => (
          <li key={local.id} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5">
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400" title="Posição, de baixo para cima">
              {local.orderIndex + 1}
            </span>
            {readOnly ? (
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{local.name}</span>
            ) : (
              <CommitField
                value={local.name}
                disabled={busy}
                ariaLabel={`Nome do local ${local.name}`}
                className="field min-w-0 flex-1 py-1 text-sm"
                onCommit={name => {
                  const trimmed = name.replace(/\s+/g, ' ').trim();
                  if (trimmed && trimmed !== local.name) send({ type: 'rename_local', localId: local.id, name: trimmed });
                }}
              />
            )}
            {!readOnly && (
              <>
                <button
                  type="button"
                  className="button-ghost p-1.5"
                  aria-label={`Subir ${local.name}`}
                  disabled={busy || index === 0}
                  onClick={() => swap(index, index - 1)}
                >
                  <ArrowUp size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className="button-ghost p-1.5"
                  aria-label={`Descer ${local.name}`}
                  disabled={busy || index === ordered.length - 1}
                  onClick={() => swap(index, index + 1)}
                >
                  <ArrowDown size={14} aria-hidden />
                </button>
                <button
                  type="button"
                  className="button-ghost p-1.5 hover:text-danger"
                  aria-label={`Excluir ${local.name}`}
                  disabled={busy}
                  onClick={() => remove(local.id, local.name)}
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </>
            )}
          </li>
        ))}
      </ol>
      {ordered.length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {plural(ordered.length, 'local', 'locais')}. A ordem é a do eixo vertical da Linha de Balanço: o primeiro cadastrado fica embaixo.
        </p>
      )}

      {!readOnly && (
        <form
          className={`${drawerFooter} space-y-2`}
          onSubmit={event => {
            event.preventDefault();
            create();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="lob-locals-batch" className="text-sm font-semibold text-slate-700">
              Cadastrar locais
            </label>
            <button
              type="button"
              className="button-ghost px-2.5 py-1 text-xs"
              disabled={busy || !fresh.length}
              title={
                !planningLocals.length
                  ? 'A obra não tem locais no planejamento dos vagões'
                  : !fresh.length
                    ? 'Todos os locais do planejamento já estão aqui'
                    : 'Preenche com os locais do planejamento dos vagões, da base ao topo'
              }
              onClick={() => setBatch(current => [...current.split(/\r?\n/).filter(l => l.trim()), ...fresh].join('\n'))}
            >
              <Building2 size={13} aria-hidden /> Usar os locais da obra
            </button>
          </div>
          <textarea
            id="lob-locals-batch"
            className="field min-h-24 resize-y text-sm"
            placeholder={'Um nome por linha, da base ao topo:\nTérreo\n1º pavimento\n2º pavimento'}
            value={batch}
            disabled={busy}
            onChange={event => setBatch(event.target.value)}
          />
          {duplicates.length > 0 && (
            <p className="text-xs text-danger" role="alert">
              Já existe: {duplicates.join(', ')}. Tire da lista para cadastrar.
            </p>
          )}
          {names.length > remaining && (
            <p className="text-xs text-danger" role="alert">
              A obra aceita no máximo {LOB_LIMITS.locals} locais; cabem mais {remaining}.
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">Os novos entram acima dos existentes, na ordem das linhas.</p>
            <button type="submit" className="button" disabled={busy || !names.length || duplicates.length > 0 || names.length > remaining}>
              Cadastrar {names.length ? plural(names.length, 'local', 'locais') : ''}
            </button>
          </div>
        </form>
      )}
    </Drawer>
  );
}

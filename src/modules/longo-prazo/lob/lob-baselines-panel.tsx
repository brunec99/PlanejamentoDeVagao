'use client';
import { useMemo, useState } from 'react';
import { Eye, EyeOff, RotateCcw, Trash2 } from 'lucide-react';
import { LOB_LIMITS, activityFinish, lobSpan, type LobBaseline, type LobCommand, type LobData, type LocalDate } from '@/domain/lob';
import { daysBetween } from '@/domain/long-term-plan';
import { Drawer } from '@/modules/layout/drawer';
import { useConfirm } from '@/modules/layout/confirm';
import { useToast } from '@/modules/layout/toast';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { formatDate, formatTimestamp } from '@/shared/format';

/** Gaveta "Linhas de base" da Linha de Balanço (regras 10 e 18): a lista das fotos do cronograma,
 * manuais e automáticas (gravadas antes de cada lançamento), com Comparar (sobrepõe no gráfico),
 * Restaurar (devolve as datas) e Excluir, mais o formulário da linha de base nova. */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Falha na comunicação com o servidor.');
const drawerFooter = 'sticky bottom-0 -mx-5 -mb-4 mt-6 border-t border-slate-100 bg-white px-5 py-4';

/** Último dia trabalhado na foto: o término previsto que ela guardava. */
const baselineFinish = (baseline: LobBaseline): LocalDate | undefined =>
  baseline.snapshot.reduce<LocalDate | undefined>((max, entry) => {
    const finish = activityFinish(entry);
    return !max || finish > max ? finish : max;
  }, undefined);

export function LobBaselinesPanel({
  data,
  readOnly,
  activeId,
  onExecute,
  onClose,
  onCompare,
}: {
  data: LobData;
  readOnly: boolean;
  /** Linha de base em comparação no gráfico, se houver. */
  activeId?: string;
  onExecute: (command: LobCommand) => Promise<unknown>;
  onClose: () => void;
  onCompare: (baselineId: string | undefined) => void;
}) {
  const context = usePlanning();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const users = context.state === 'ready' ? context.planning.data.users : [];
  const author = (id: string) => users.find(u => u.id === id)?.name ?? 'sistema';
  const ordered = useMemo(() => [...data.baselines].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.baselines]);
  const currentFinish = lobSpan(data.activities)?.finish;
  const full = data.baselines.length >= LOB_LIMITS.baselines;
  const workId = data.activities[0]?.workId ?? data.locals[0]?.workId ?? data.services[0]?.workId ?? '';

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
  const save = async () => {
    const trimmed = name.replace(/\s+/g, ' ').trim();
    if (!trimmed || readOnly || full || busy) return;
    if (await send({ type: 'create_baseline', workId, name: trimmed.slice(0, LOB_LIMITS.name) })) {
      toast({ title: `Linha de base "${trimmed}" salva` });
      setName('');
    }
  };

  return (
    <Drawer open onClose={onClose} title="Linhas de base" description="Linha de Balanço · fotos das datas de todos os blocos">
      <ul className="space-y-3">
        {!ordered.length && (
          <li className="py-6 text-center text-sm text-slate-500">Nenhuma linha de base ainda. Salve a primeira abaixo.</li>
        )}
        {ordered.map(b => {
          const active = b.id === activeId;
          const finish = baselineFinish(b);
          // Diferença em dias corridos: positiva quando o cronograma atual termina depois da foto.
          const delta = finish && currentFinish ? daysBetween(finish, currentFinish) : undefined;
          return (
            <li key={b.id} className={`rounded-xl border px-3 py-3 ${active ? 'border-primary-ring bg-primary-soft' : 'border-slate-200'}`}>
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="break-words">{b.name}</span>
                {b.automatic && <span className="badge-muted px-2 py-0 text-[10px]">automática</span>}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatTimestamp(b.createdAt)} · {author(b.createdBy)} · {plural(b.snapshot.length, 'bloco', 'blocos')}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {finish ? (
                  <>
                    Término {formatDate(finish)}
                    {delta !== undefined && (
                      <>
                        {' · '}
                        <span className={delta > 0 ? 'font-semibold text-danger' : delta < 0 ? 'font-semibold text-success' : ''}>
                          {delta > 0 ? `hoje +${delta} dias` : delta < 0 ? `hoje −${Math.abs(delta)} dias` : 'igual ao atual'}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  'Sem blocos na foto'
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="button-ghost px-2.5 py-1.5 text-xs"
                  aria-pressed={active}
                  onClick={() => onCompare(active ? undefined : b.id)}
                >
                  {active ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
                  {active ? 'Comparando' : 'Comparar'}
                </button>
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      className="button-ghost px-2.5 py-1.5 text-xs"
                      aria-label={`Restaurar ${b.name}`}
                      disabled={busy}
                      onClick={async () => {
                        const ok = await confirm({
                          title: `Restaurar "${b.name}"?`,
                          description:
                            'Os blocos voltam às datas e durações desta foto; blocos criados depois dela ficam onde estão. "Desfazer" devolve o estado atual.',
                          confirmLabel: 'Restaurar',
                        });
                        if (ok && (await send({ type: 'restore_baseline', baselineId: b.id }))) {
                          toast({ title: 'Cronograma restaurado', description: `A partir da linha de base "${b.name}".` });
                          onClose();
                        }
                      }}
                    >
                      <RotateCcw size={14} aria-hidden />
                      Restaurar
                    </button>
                    <button
                      type="button"
                      className="button-ghost px-2.5 py-1.5 text-xs hover:text-danger"
                      aria-label={`Excluir ${b.name}`}
                      disabled={busy}
                      onClick={async () => {
                        if (await confirm({ title: `Excluir a linha de base "${b.name}"?`, confirmLabel: 'Excluir', tone: 'danger' })) {
                          if (active) onCompare(undefined);
                          send({ type: 'delete_baseline', baselineId: b.id });
                        }
                      }}
                    >
                      <Trash2 size={14} aria-hidden />
                      Excluir
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!readOnly && (
        <form
          className={`${drawerFooter} space-y-2`}
          onSubmit={event => {
            event.preventDefault();
            save();
          }}
        >
          <label htmlFor="lob-baseline-name" className="text-sm font-semibold text-slate-700">
            Nova linha de base
          </label>
          <div className="flex gap-2">
            <input
              id="lob-baseline-name"
              className="field"
              placeholder="Ex.: Aprovada pela diretoria"
              maxLength={LOB_LIMITS.name}
              value={name}
              disabled={busy || full || !data.activities.length}
              onChange={event => setName(event.target.value)}
            />
            <button type="submit" className="button shrink-0" disabled={busy || full || !name.trim() || !data.activities.length}>
              Salvar
            </button>
          </div>
          <p className="text-xs text-slate-500">
            {!data.activities.length
              ? 'Sem blocos não há o que guardar.'
              : full
                ? `A obra já tem ${LOB_LIMITS.baselines} linhas de base, o máximo. Exclua alguma para salvar outra.`
                : 'Guarda as datas de todos os blocos de hoje para comparar ou restaurar depois.'}
          </p>
        </form>
      )}
    </Drawer>
  );
}

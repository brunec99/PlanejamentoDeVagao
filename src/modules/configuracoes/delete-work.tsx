'use client';
import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { useToast } from '@/modules/layout/toast';
import { confirmsCode, workFootprint } from './delete-work-view';

const count = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;

/** Exclusão da obra, só para administradores, no fim das Configurações da obra. Não tem volta: o admin
 * abre o bloco, vê o que sai e digita o código da obra, que o servidor confere de novo (`delete_work`). */
export function DeleteWork({ workId }: { workId: string }) {
  const context = usePlanning();
  const router = useRouter();
  const { toast } = useToast();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (context.state !== 'ready') return null;
  const { data } = context.planning;
  const actor = data.users.find(u => u.id === context.actorId);
  const work = data.works.find(w => w.id === workId);
  if (actor?.role !== 'admin' || !work) return null;
  const footprint = workFootprint(data, workId);
  const ready = confirmsCode(typed, work.code);

  const close = () => {
    setOpen(false);
    setTyped('');
    setError('');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/works/${encodeURIComponent(workId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: typed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível excluir a obra.');
      toast({
        title: `Obra ${work.code} · ${work.name} excluída.`,
        description: body.files?.failed?.length
          ? 'Alguns arquivos não saíram do armazenamento. Eles não aparecem em nenhuma tela.'
          : undefined,
        tone: 'success',
      });
      // Fica ocupado até a tela sair daqui: a obra já não existe.
      router.replace('/obras');
      await context.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a obra.');
      setBusy(false);
    }
  };

  return (
    <section data-tour="obra-config-delete" className="panel border-danger-ring p-5" aria-labelledby={`${id}-title`}>
      <div className="flex items-start gap-3">
        <Trash2 size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-base font-bold text-slate-900">
            Excluir obra
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Só administradores. Apaga a obra e tudo o que é dela, para todas as pessoas. Não dá para desfazer.
          </p>

          {!open ? (
            <button
              type="button"
              className="button-ghost mt-4 hover:border-danger-ring hover:bg-danger-soft hover:text-danger"
              onClick={() => setOpen(true)}
            >
              Excluir esta obra…
            </button>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <div className="text-sm text-slate-700">
                <p>Sai junto com a obra:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  <li>{count(footprint.commitments, 'linha', 'linhas')} do curto prazo, com os apontamentos;</li>
                  <li>
                    {count(footprint.wagons, 'vagão', 'vagões')}, {count(footprint.plans, 'plano', 'planos')} do médio prazo (com as linhas
                    de base) e o plano de longo prazo;
                  </li>
                  <li>
                    {count(footprint.teams, 'equipe', 'equipes')}, {count(footprint.ifcModels, 'modelo IFC', 'modelos IFC')} com os
                    arquivos, os itens e as fotos da terminalidade e as configurações da obra;
                  </li>
                  <li>o acesso de {count(footprint.people, 'pessoa', 'pessoas')} a esta obra.</li>
                </ul>
                <p className="mt-2 text-slate-500">
                  Ficam o histórico de alterações e o consumo de IA do mês, que continua contando no limite.
                </p>
              </div>
              <label className="block text-xs font-semibold text-slate-600" htmlFor={`${id}-code`}>
                Para confirmar, digite o código da obra: <strong className="text-slate-900">{work.code}</strong>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id={`${id}-code`}
                  className="field w-48"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  value={typed}
                  disabled={busy}
                  onChange={e => setTyped(e.target.value)}
                />
                <button className="button-danger" type="submit" disabled={busy || !ready}>
                  {busy ? 'Excluindo…' : 'Excluir definitivamente'}
                </button>
                <button className="button-ghost" type="button" disabled={busy} onClick={close}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {error && (
            <div className="mt-3">
              <Callout tone="danger" role="alert">
                {error}
              </Callout>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Building2, ListOrdered, RefreshCw } from 'lucide-react';
import type { LobCommand, LobLocal } from '@/domain/lob';
import type { WorkLocalsResponse, WorkLocalsView } from '@/application/use-cases/work-locals';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { HelpNote } from '@/modules/layout/help-note';

/** A gaveta é a mesma da Linha de Balanço; só baixa quando a pessoa abre o cadastro. */
const LobLocalsPanel = dynamic(() => import('@/modules/longo-prazo/lob/lob-locals-panel').then(m => m.LobLocalsPanel), { ssr: false });

type State =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | ({ status: 'ready' } & WorkLocalsView);

class WorkLocalsError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'WorkLocalsError';
  }
}
async function readResponse(res: Response): Promise<WorkLocalsResponse> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new WorkLocalsError((body as { error?: string }).error ?? 'Falha na comunicação com o servidor.', res.status);
  return body as WorkLocalsResponse;
}
const toState = (body: WorkLocalsResponse): State =>
  body.available ? { status: 'ready', locals: body.locals, blocks: body.blocks } : { status: 'unavailable' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Locais da obra" nas Configurações da obra (05/11/2026, pedido do usuário: "deveria estar em configuração da
 * obra"): torres, pavimentos e áreas, de cima para baixo como o prédio. É a lista da Linha de Balanço (aba 1), que
 * também alimenta a coluna Local do curto prazo e o filtro de local do PDF. A aba 1 é restrita, então até aqui
 * só quem tinha o longo prazo conseguia cadastrar; agora qualquer pessoa com a obra cadastra (Consulta só vê),
 * pela rota `/api/work-locals`, com as mesmas regras e a mesma gaveta da Linha de Balanço. */
export function WorkLocals({ workId }: { workId: string }) {
  const context = usePlanning();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/work-locals?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' });
      setState(toState(await readResponse(res)));
    } catch (cause) {
      setState({ status: 'error', message: cause instanceof Error ? cause.message : 'Falha na comunicação com o servidor.' });
    }
  }, [workId]);
  useEffect(() => {
    let active = true;
    fetch(`/api/work-locals?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' })
      .then(readResponse)
      .then(body => {
        if (active) setState(toState(body));
      })
      .catch(cause => {
        if (active) setState({ status: 'error', message: cause instanceof Error ? cause.message : 'Falha na comunicação com o servidor.' });
      });
    return () => {
      active = false;
    };
  }, [workId]);

  if (context.state !== 'ready') return null;
  const actor = context.planning.data.users.find(u => u.id === context.actorId);
  if (!actor?.workIds.includes(workId)) return null;
  const readOnly = actor.role === 'viewer';

  /** A gaveta mostra o erro no toast; aqui a lista se atualiza com a resposta e, no conflito, recarrega. */
  const execute = async (command: LobCommand) => {
    try {
      const res = await fetch('/api/work-locals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      });
      setState(toState(await readResponse(res)));
    } catch (cause) {
      if (cause instanceof WorkLocalsError && cause.status === 409) await load();
      throw cause;
    }
  };
  const retry = async () => {
    setRetrying(true);
    await load();
    setRetrying(false);
  };

  // De cima para baixo, como a gaveta e a lista do curto prazo.
  const topDown: LobLocal[] = state.status === 'ready' ? [...state.locals].reverse() : [];

  return (
    <section data-tour="obra-config-locais" className="panel p-5" aria-labelledby="locais-obra-title">
      <div className="flex items-start gap-3">
        <Building2 size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="locais-obra-title" className="text-base font-bold text-slate-900">
            Locais da obra
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm text-slate-500">
              Torres, pavimentos e áreas, de cima para baixo: a lista da coluna Local do curto prazo e da Linha de Balanço.
            </p>
            <HelpNote title="Como funciona: locais da obra" compact>
              <p>
                Uma lista só por obra. Ela alimenta a coluna <strong>Local</strong> do curto prazo (e o filtro de local do PDF) e o eixo
                vertical da <strong>Linha de Balanço</strong> da aba 1.1, que abre a mesma lista em &quot;Locais da obra&quot;.
              </p>
              <p>
                Cadastre um nome por linha, da base ao topo; as setas mudam a ordem. Renomear muda o nome em todas as linhas do curto prazo.
              </p>
              <p>
                Excluir deixa sem local as linhas do curto prazo que o usavam. Local com blocos na Linha de Balanço não pode ser excluído.
              </p>
            </HelpNote>
          </div>

          {state.status === 'loading' && (
            <div className="mt-3 space-y-2" role="status" aria-label="Carregando os locais da obra">
              <div className="skeleton h-4 w-1/3" aria-hidden />
              <div className="skeleton h-4 w-1/2" aria-hidden />
            </div>
          )}
          {state.status === 'error' && (
            <div className="mt-3 space-y-3">
              <Callout tone="danger" role="alert">
                Não foi possível carregar os locais da obra. {state.message}
              </Callout>
              <button type="button" className="button-ghost" onClick={retry} disabled={retrying}>
                <RefreshCw size={15} aria-hidden />
                {retrying ? 'Tentando…' : 'Tentar de novo'}
              </button>
            </div>
          )}
          {state.status === 'unavailable' && (
            <div className="mt-3">
              <Callout tone="warning">
                Para cadastrar os locais, aplique a migração <code>0038_lob.sql</code> no Supabase.
              </Callout>
            </div>
          )}
          {state.status === 'ready' && (
            <>
              {topDown.length ? (
                <>
                  <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Locais, do topo para a base">
                    {topDown.map(local => (
                      <li key={local.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-sm text-slate-700">
                        {local.name}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-slate-500">{plural(topDown.length, 'local', 'locais')}, do topo para a base.</p>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-700">
                  Nenhum local cadastrado. Sem locais, a coluna Local do curto prazo fica travada.
                </p>
              )}
              {readOnly ? (
                <p className="mt-3 text-xs text-slate-400">Seu perfil permite consulta aos locais.</p>
              ) : (
                <button type="button" data-tour="obra-config-locais-editar" className="button-ghost mt-3" onClick={() => setOpen(true)}>
                  <ListOrdered size={15} aria-hidden />
                  {topDown.length ? 'Cadastrar e ordenar locais' : 'Cadastrar locais'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {open && state.status === 'ready' && (
        <LobLocalsPanel
          workId={workId}
          locals={state.locals}
          blocksOf={id => state.blocks[id] ?? 0}
          readOnly={readOnly}
          onExecute={execute}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Workflow } from 'lucide-react';
import type { ServiceFlow } from '@/domain/lob';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, LoadState } from '@/modules/planejamento/ui';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { createFlow, fetchFlows } from './lob-api';
import { exampleFlowDocument, FlowEditor, listNames, uniqueName } from './flow-editor';

/** Visão "Fluxos de serviços" da aba 1 (tela 2 do modelo aprovado de 04/11/2026): os moldes da
 * empresa (regra 3), com a lista à esquerda e o editor à direita. Planejador, gestor e admin criam,
 * editam e lançam; consulta só vê (regra 4). Os dados vêm de /api/lob/flows, fora do snapshot do
 * planejamento: sem a migração 0038 só esta visão fica indisponível. */

type State =
  { status: 'loading' } | { status: 'error'; message: string } | { status: 'unavailable' } | { status: 'ready'; flows: ServiceFlow[] };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const byName = (a: ServiceFlow, b: ServiceFlow) => a.name.localeCompare(b.name, 'pt-BR');

export function FlowsView({ workId }: { workId: string }) {
  const context = usePlanning();
  const { toast } = useToast();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [selectedId, setSelectedId] = useState<string>();
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setState(current => (current.status === 'ready' ? current : { status: 'loading' }));
    try {
      const response = await fetchFlows();
      setState(response.available ? { status: 'ready', flows: [...response.flows].sort(byName) } : { status: 'unavailable' });
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar os fluxos de serviços.' });
    }
  }, []);
  // Leitura inicial como na Terminalidade: a resposta só é aplicada se a tela ainda estiver aberta.
  useEffect(() => {
    let active = true;
    fetchFlows()
      .then(response => {
        if (active) setState(response.available ? { status: 'ready', flows: [...response.flows].sort(byName) } : { status: 'unavailable' });
      })
      .catch(error => {
        if (active)
          setState({ status: 'error', message: error instanceof Error ? error.message : 'Falha ao carregar os fluxos de serviços.' });
      });
    return () => {
      active = false;
    };
  }, []);

  // Regra 4: só o perfil de consulta não altera. Até o planejamento carregar, a tela fica em leitura.
  const ready = context.state === 'ready' ? context : undefined;
  const actor = ready?.planning.data.users.find(u => u.id === ready.actorId);
  const readOnly = !actor || actor.role === 'viewer';

  const flows = useMemo(() => (state.status === 'ready' ? state.flows : []), [state]);
  const selected = flows.find(f => f.id === selectedId) ?? flows[0];

  /** Fluxo gravado pelo editor: o próprio (revisão nova) ou um novo (cópia), que entra na lista e
   * é aberto. A ordem da lista não muda ao renomear, para o item não pular enquanto se digita. */
  const upsert = useCallback((saved: ServiceFlow) => {
    setState(current => {
      if (current.status !== 'ready') return current;
      const exists = current.flows.some(f => f.id === saved.id);
      return { status: 'ready', flows: exists ? current.flows.map(f => (f.id === saved.id ? saved : f)) : [...current.flows, saved] };
    });
  }, []);
  const onSaved = useCallback(
    (saved: ServiceFlow) => {
      const isNew = !flows.some(f => f.id === saved.id);
      upsert(saved);
      if (isNew) setSelectedId(saved.id);
    },
    [flows, upsert],
  );
  const onDeleted = useCallback(
    (flowId: string) => {
      const index = flows.findIndex(f => f.id === flowId);
      const neighbour = flows[index + 1] ?? flows[index - 1];
      setState(current => (current.status === 'ready' ? { status: 'ready', flows: current.flows.filter(f => f.id !== flowId) } : current));
      setSelectedId(neighbour?.id);
    },
    [flows],
  );
  const create = async () => {
    setCreating(true);
    try {
      const created = await createFlow(
        exampleFlowDocument(
          uniqueName(
            'Novo fluxo',
            flows.map(f => f.name),
          ),
        ),
      );
      upsert({ ...created, usedIn: [] });
      setSelectedId(created.id);
      toast({ title: 'Fluxo criado', description: 'Dê um nome, ajuste os serviços e lance na Linha de Balanço.' });
    } catch (error) {
      toast({ title: 'Não foi possível criar o fluxo', description: error instanceof Error ? error.message : undefined, tone: 'danger' });
    } finally {
      setCreating(false);
    }
  };

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Fluxos de serviços</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm text-slate-500">
            Sequência padrão de serviços, com duração por local e dependências. Monte uma vez e lance em qualquer obra.
          </p>
          <HelpNote title="Como funciona: fluxos de serviços" compact>
            <p>
              Um fluxo é o <strong>molde da empresa</strong> (o "macrofluxo"): a sequência de serviços que se repete em cada local da obra.
              Cada serviço tem nome, cor, <strong>duração por local em dias úteis</strong> (segunda a sexta), equipe e unidade de medição.
            </p>
            <p>
              A coluna <strong>"Depois de"</strong> diz de quais serviços cada um depende, sempre{' '}
              <strong>término → início no mesmo local</strong>, com uma espera em dias úteis que pode ser negativa (antecipação). A rede
              acima da tabela é desenhada sozinha a partir dessas ligações: não há caixas para arrastar.
            </p>
            <p>
              O fluxo é <strong>salvo sozinho</strong> um segundo depois de cada alteração. Para ser lançado precisa de ao menos dois
              serviços, um só serviço inicial e nenhum ciclo; fora disso o botão fica desabilitado com o motivo.
            </p>
            <p>
              <strong>Lançar na Linha de Balanço</strong> leva o fluxo para os locais da obra, com data de início, sentido e ritmo. Depois
              disso fluxo e obra ficam independentes: mudar o fluxo não mexe nos blocos já lançados.
            </p>
          </HelpNote>
        </div>
      </div>
      <button
        data-tour="longo-fluxos-novo"
        type="button"
        className="button"
        disabled={readOnly || creating || state.status !== 'ready'}
        title={readOnly ? 'Seu acesso é de consulta.' : undefined}
        onClick={create}
      >
        <Plus size={16} aria-hidden />
        Novo fluxo
      </button>
    </div>
  );

  if (state.status === 'loading')
    return (
      <section className="space-y-5">
        {header}
        <LoadState rows={6} />
      </section>
    );
  if (state.status === 'error')
    return (
      <section className="space-y-5">
        {header}
        <div className="panel p-6">
          <Callout tone="danger" role="alert">
            Não foi possível carregar os fluxos de serviços. {state.message}
          </Callout>
          <button type="button" className="button-ghost mt-4" onClick={load}>
            <RefreshCw size={15} aria-hidden />
            Tentar de novo
          </button>
        </div>
      </section>
    );
  if (state.status === 'unavailable')
    return (
      <section className="space-y-5">
        {header}
        <Callout tone="warning">
          A Linha de Balanço ainda não está disponível neste ambiente: aplique a migração <code>0038_lob.sql</code> no Supabase e recarregue
          a página. As outras visões da aba continuam funcionando.
        </Callout>
      </section>
    );

  return (
    <section className="space-y-5">
      {header}
      {/* Duas colunas no computador; no celular a lista fica em cima do editor. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[272px_minmax(0,1fr)]">
        <nav data-tour="longo-fluxos-lista" aria-label="Fluxos da empresa" className="panel p-3">
          <p className="eyebrow px-3 pb-2 pt-1">Fluxos da empresa</p>
          {flows.length ? (
            <ul className="space-y-1">
              {flows.map(flow => {
                const active = selected?.id === flow.id;
                const usage = flow.usedIn?.length ? `usado em ${listNames(flow.usedIn)}` : 'nunca lançado';
                return (
                  <li key={flow.id}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => setSelectedId(flow.id)}
                      className={`block w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${active ? 'border-primary-ring bg-primary-soft' : 'border-transparent hover:bg-slate-50'}`}
                    >
                      <span className={`block truncate text-sm font-semibold ${active ? 'text-primary-ink' : 'text-slate-900'}`}>
                        {flow.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {plural(flow.services.length, 'serviço', 'serviços')} · {usage}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500">Nenhum fluxo ainda.</p>
          )}
          <p className="mt-3 px-3 text-xs leading-5 text-slate-500">
            Um fluxo é um molde. Depois de lançado, a obra não muda quando o fluxo muda (regra 12).
          </p>
        </nav>

        {selected ? (
          // A chave remonta o editor a cada troca: cada fluxo começa do que está na lista.
          <FlowEditor
            key={selected.id}
            flow={selected}
            workId={workId}
            readOnly={readOnly}
            onSaved={onSaved}
            onDeleted={onDeleted}
            onReload={load}
          />
        ) : (
          <div className="panel flex flex-col items-center px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary" aria-hidden>
              <Workflow size={22} />
            </span>
            <p className="mt-4 text-base font-bold text-slate-900">Nenhum fluxo de serviços ainda</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">
              {readOnly
                ? 'Quando um planejador criar o primeiro fluxo da empresa, ele aparece aqui.'
                : 'Crie o primeiro: ele nasce com dois serviços de exemplo encadeados, para você trocar os nomes, ajustar durações e montar a sequência da empresa.'}
            </p>
            {!readOnly && (
              <button type="button" className="button mt-5" disabled={creating} onClick={create}>
                <Plus size={16} aria-hidden />
                Novo fluxo
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

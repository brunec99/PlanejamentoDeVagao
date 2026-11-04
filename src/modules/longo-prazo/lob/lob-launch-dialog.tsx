'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
  LOB_LIMITS,
  activityEnd,
  activityFinish,
  planLaunch,
  type LobActivity,
  type LobCommand,
  type LobData,
  type LobDirection,
  type LobLaunchParams,
  type LobRhythm,
  type LocalDate,
  type ServiceFlow,
} from '@/domain/lob';
import { addDays, daysBetween } from '@/domain/long-term-plan';
import { useToast } from '@/modules/layout/toast';
import { formatDate, workPath } from '@/shared/format';
import { fetchFlows } from './lob-api';

/** Diálogo "Lançar fluxo na Linha de Balanço" (modelo de 04/11/2026, tela 3; regras 8 a 12). Pede
 * fluxo, locais, início, sentido e ritmo e calcula a prévia no navegador com o mesmo `planLaunch`
 * que o servidor usa: o que a prévia mostra é o que será gravado. O servidor confere tudo de novo. */

type FlowsState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; flows: ServiceFlow[] };
type RhythmKind = LobRhythm['kind'];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Falha na comunicação com o servidor.');
/** Próxima segunda-feira a partir de hoje (hoje, se já for segunda): o começo natural de um fluxo. */
const nextMonday = (today: LocalDate) => {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, weekday === 1 ? 0 : (8 - weekday) % 7);
};
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const weekdayName = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] : '');

function Radio({ checked, onChange, children, name }: { checked: boolean; onChange: () => void; children: ReactNode; name: string }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${checked ? 'border-primary-ring bg-primary-soft font-semibold text-primary-ink' : 'border-slate-200 text-slate-600'}`}
    >
      <input type="radio" name={name} className="accent-primary" checked={checked} onChange={onChange} />
      <span className="flex flex-wrap items-center gap-1.5">{children}</span>
    </label>
  );
}

export function LobLaunchDialog({
  workId,
  data,
  today,
  initialFlowId,
  onExecute,
  onClose,
}: {
  workId: string;
  data: LobData;
  today: LocalDate;
  initialFlowId?: string;
  onExecute: (command: LobCommand) => Promise<unknown>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  const close = () => dialog.current?.close();
  const { toast } = useToast();

  const [flows, setFlows] = useState<FlowsState>({ status: 'loading' });
  const [flowId, setFlowId] = useState(initialFlowId ?? '');
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(data.locals.map(l => l.id)));
  const [start, setStart] = useState<string>(() => nextMonday(today));
  const [direction, setDirection] = useState<LobDirection>();
  const [rhythmKind, setRhythmKind] = useState<RhythmKind>('continuous');
  const [taktDays, setTaktDays] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchFlows()
      .then(result => {
        if (!cancelled) setFlows({ status: 'ready', flows: result.available ? result.flows : [] });
      })
      .catch(err => {
        if (!cancelled) setFlows({ status: 'error', message: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flowList = flows.status === 'ready' ? flows.flows : [];
  // Sem escolha explícita, o primeiro fluxo da lista já alimenta a prévia.
  const chosenId = flowId || flowList[0]?.id || '';
  const flow = flowList.find(f => f.id === chosenId);
  const missingFlow = flows.status === 'ready' && !!flowId && !flow;
  const effectiveDirection: LobDirection = direction ?? flow?.direction ?? 'bottom_up';
  const locals = [...data.locals].sort((a, b) => a.orderIndex - b.orderIndex);
  const selectedIds = locals.filter(l => selected.has(l.id)).map(l => l.id);

  // Prévia recalculada a cada mudança: o mesmo `planLaunch` do servidor, barato para o tamanho de um fluxo.
  const preview = (() => {
    if (!flow) return undefined;
    const rhythm: LobRhythm =
      rhythmKind === 'takt'
        ? { kind: 'takt', days: Number(taktDays) }
        : rhythmKind === 'together'
          ? { kind: 'together' }
          : { kind: 'continuous' };
    const params: LobLaunchParams = { localIds: selectedIds, start, direction: effectiveDirection, rhythm };
    try {
      let n = 0;
      const plan = planLaunch({
        workId,
        flow,
        flowId: flow.id,
        locals: data.locals,
        params,
        existing: data,
        launchId: 'preview',
        now: `${today}T00:00:00.000Z`,
        newId: () => `preview-${n++}`,
      });
      return { plan, params };
    } catch (err) {
      return { params, error: errorMessage(err) };
    }
  })();

  const plan = preview?.plan;
  const serviceNames = new Map([...data.services, ...(plan?.services ?? [])].map(s => [s.id, s.name]));
  const localNames = new Map(data.locals.map(l => [l.id, l.name]));
  const blockLabel = (a: LobActivity) => `${serviceNames.get(a.serviceId) ?? 'Serviço'} · ${localNames.get(a.localId) ?? 'local'}`;
  const first = plan?.activities.reduce<LobActivity | undefined>((best, a) => (!best || a.start < best.start ? a : best), undefined);
  const last = plan?.activities.reduce<LobActivity | undefined>(
    (best, a) => (!best || activityEnd(a) > activityEnd(best) ? a : best),
    undefined,
  );
  const weeks = plan?.start && plan.end ? Math.max(1, Math.round(daysBetween(plan.start, plan.end) / 7)) : 0;
  const skippedByService = new Map<string, number>();
  for (const s of plan?.skipped ?? []) skippedByService.set(s.serviceName, (skippedByService.get(s.serviceName) ?? 0) + 1);
  const count = plan?.activities.length ?? 0;
  const canLaunch = !!flow && !!plan && count > 0 && !busy;

  const toggle = (id: string) =>
    setSelected(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const launch = async () => {
    if (!flow || !preview?.plan || !canLaunch) return;
    setBusy(true);
    setError('');
    try {
      await onExecute({ type: 'launch_flow', workId, flowId: flow.id, params: preview.params });
      toast({
        title: `Fluxo "${flow.name}" lançado`,
        description: `${plural(count, 'bloco', 'blocos')} em ${plural(preview.params.localIds.length, 'local', 'locais')}.`,
      });
      close();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const flowsHref = `${workPath(workId, 'longo-prazo')}?visao=fluxos`;
  const row = 'grid gap-1.5 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-x-4';
  const rowLabel = 'text-sm font-semibold text-slate-700 sm:pt-2';

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="lob-launch-title"
      className="m-auto max-h-[92vh] w-[min(48rem,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <div className="flex max-h-[92vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="eyebrow">Linha de Balanço</p>
            <h3 id="lob-launch-title" className="mt-1 text-base font-bold text-slate-900">
              Lançar fluxo na Linha de Balanço
            </h3>
          </div>
          <button type="button" className="button-ghost shrink-0" onClick={close}>
            Fechar
          </button>
        </header>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Fluxo */}
          <div className={row}>
            <label htmlFor="lob-launch-flow" className={rowLabel}>
              Fluxo
            </label>
            <div className="space-y-1.5">
              {flows.status === 'loading' && <p className="text-sm text-slate-500">Carregando os fluxos da empresa…</p>}
              {flows.status === 'error' && (
                <p className="callout callout-danger text-xs" role="alert">
                  {flows.message}
                </p>
              )}
              {flows.status === 'ready' && !flowList.length && (
                <p className="callout callout-info text-sm">
                  Nenhum fluxo de serviços cadastrado ainda.{' '}
                  <Link className="text-link" href={flowsHref}>
                    Criar fluxo
                  </Link>
                </p>
              )}
              {flowList.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    id="lob-launch-flow"
                    className="field min-w-0 flex-1"
                    value={flow?.id ?? ''}
                    onChange={event => setFlowId(event.target.value)}
                  >
                    {!flow && <option value="">Escolha um fluxo…</option>}
                    {flowList.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} · {plural(f.services.length, 'serviço', 'serviços')}
                      </option>
                    ))}
                  </select>
                  {flow && <span className="badge-muted">{plural(flow.services.length, 'serviço', 'serviços')}</span>}
                  <Link className="text-link text-sm" href={flowsHref}>
                    Editar fluxos
                  </Link>
                </div>
              )}
              {missingFlow && <p className="text-xs text-warning">O fluxo indicado no endereço não existe mais. Escolha outro.</p>}
              {flow?.usedIn && flow.usedIn.length > 0 && <p className="text-xs text-slate-500">Já lançado em {flow.usedIn.join(', ')}.</p>}
            </div>
          </div>

          {/* Locais */}
          <div className={row}>
            <p className={rowLabel}>
              Locais
              <span className="block text-xs font-normal text-slate-500">
                {selectedIds.length} de {locals.length}
              </span>
            </p>
            <div>
              <div className="mb-1.5 flex flex-wrap gap-2 text-xs">
                <button type="button" className="text-link" onClick={() => setSelected(new Set(locals.map(l => l.id)))}>
                  Marcar todos
                </button>
                <button type="button" className="text-link" onClick={() => setSelected(new Set())}>
                  Desmarcar
                </button>
              </div>
              <div role="group" aria-label="Locais do lançamento" className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
                {locals.map(l => {
                  const on = selected.has(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(l.id)}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs font-semibold ${on ? 'border-primary-ring bg-primary-soft text-primary-ink' : 'border-slate-200 text-slate-400 line-through'}`}
                    >
                      <span
                        aria-hidden
                        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded border ${on ? 'border-primary bg-primary text-white' : 'border-slate-300'}`}
                      >
                        {on && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className="truncate">{l.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Ordem do cadastro de locais da obra, de baixo para cima. Locais desmarcados ficam fora deste fluxo.
              </p>
            </div>
          </div>

          {/* Início */}
          <div className={row}>
            <label htmlFor="lob-launch-start" className={rowLabel}>
              Início
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="lob-launch-start"
                type="date"
                className="field w-auto"
                value={start}
                onChange={event => setStart(event.target.value)}
              />
              <span className="text-xs text-slate-500">
                {weekdayName(start) && <span className="mr-2 text-slate-400">{weekdayName(start)}</span>}
                Primeiro serviço, no primeiro local marcado. Fim de semana cai na segunda seguinte.
              </span>
            </div>
          </div>

          {/* Sentido */}
          <div className={row}>
            <p className={rowLabel}>Sentido</p>
            <div className="flex flex-wrap gap-2">
              <Radio name="lob-direction" checked={effectiveDirection === 'bottom_up'} onChange={() => setDirection('bottom_up')}>
                Base → topo{locals[0] ? ` (${locals[0].name} primeiro)` : ''}
              </Radio>
              <Radio name="lob-direction" checked={effectiveDirection === 'top_down'} onChange={() => setDirection('top_down')}>
                Topo → base
              </Radio>
            </div>
          </div>

          {/* Ritmo */}
          <div className={row}>
            <p className={rowLabel}>Ritmo</p>
            <div className="grid gap-1.5">
              <Radio name="lob-rhythm" checked={rhythmKind === 'continuous'} onChange={() => setRhythmKind('continuous')}>
                Contínuo: a equipe passa ao próximo local quando termina o anterior
              </Radio>
              <Radio name="lob-rhythm" checked={rhythmKind === 'takt'} onChange={() => setRhythmKind('takt')}>
                Takt fixo de
                <input
                  type="number"
                  min={1}
                  max={LOB_LIMITS.taktDays}
                  className="field inline-block w-16 py-0.5 text-center text-sm tabular-nums"
                  aria-label="Dias úteis por local"
                  value={taktDays}
                  onFocus={() => setRhythmKind('takt')}
                  onChange={event => setTaktDays(event.target.value)}
                />
                dias úteis por local (como o vagão)
              </Radio>
              <Radio name="lob-rhythm" checked={rhythmKind === 'together'} onChange={() => setRhythmKind('together')}>
                Todos os locais juntos
              </Radio>
            </div>
          </div>

          {/* Prévia */}
          <div className={row}>
            <p className={rowLabel}>Prévia</p>
            <div className="space-y-2">
              {preview?.error && (
                <p className="callout callout-warning text-sm" role="status">
                  {preview.error}
                </p>
              )}
              {plan && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Blocos</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900">{count}</p>
                    <p className="text-xs text-slate-500">
                      {plural(flow?.services.length ?? 0, 'serviço', 'serviços')} × {plural(selectedIds.length, 'local', 'locais')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Primeiro bloco</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900">{first ? formatDate(first.start) : '—'}</p>
                    <p className="truncate text-xs text-slate-500">{first ? blockLabel(first) : 'nada a lançar'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Último bloco</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900">{last ? formatDate(activityFinish(last)) : '—'}</p>
                    <p className="truncate text-xs text-slate-500">{last ? blockLabel(last) : 'nada a lançar'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Duração</p>
                    <p className="text-lg font-bold tabular-nums text-slate-900">{weeks ? plural(weeks, 'semana', 'semanas') : '—'}</p>
                    <p className="text-xs text-slate-500">dias úteis, sem feriados</p>
                  </div>
                </div>
              )}
              {plan && plan.skipped.length > 0 && (
                <p className="callout callout-warning text-xs leading-5">
                  {plural(plan.skipped.length, 'bloco já existe', 'blocos já existem')} e{' '}
                  {plan.skipped.length === 1 ? 'é mantido' : 'são mantidos'}, não {plan.skipped.length === 1 ? 'duplicado' : 'duplicados'}:{' '}
                  {[...skippedByService].map(([name, n], index) => (
                    <span key={name}>
                      {index > 0 && ', '}
                      <b>{name}</b> em {plural(n, 'local', 'locais')}
                    </span>
                  ))}
                  . {count > 0 ? `Os outros ${count} entram.` : 'Nada novo a lançar.'}
                </p>
              )}
              {plan && count === 0 && !plan.skipped.length && (
                <p className="callout callout-warning text-xs">Nada a lançar com esses parâmetros.</p>
              )}
              {flow && data.activities.length > 0 && (
                <p className="callout callout-info text-xs leading-5">
                  Antes de lançar, uma linha de base automática <b>"Antes do lançamento {formatDate(today)}"</b> guarda o cronograma de
                  hoje. Desfazer o lançamento é restaurá-la.
                </p>
              )}
              {error && (
                <p className="callout callout-danger text-sm" role="alert">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <p className="min-w-[12rem] flex-1 text-xs text-slate-500">
            Depois de lançado, o fluxo e a obra ficam independentes: mudar o fluxo não mexe nestes blocos.
          </p>
          <button type="button" className="button-ghost" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="button" disabled={!canLaunch} onClick={launch}>
            {busy ? 'Lançando…' : `Lançar ${plural(count, 'bloco', 'blocos')}`}
          </button>
        </footer>
      </div>
    </dialog>
  );
}

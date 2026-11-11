'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Building2,
  ChevronDown,
  Coins,
  Download,
  Flag,
  MoreHorizontal,
  Plus,
  Ruler,
  Table2,
  TriangleAlert,
  Undo2,
  Upload,
} from 'lucide-react';
import {
  activityFinish,
  closedMeasurements,
  delayDays,
  isLate,
  lobSpan,
  measuredPercents,
  plannedPercent,
  type LobActivity,
  type LobCommand,
  type LocalDate,
} from '@/domain/lob';
import {
  formatIdp,
  IDP_TONE_LABEL,
  idpTone,
  lobPerformance,
  performanceBaseline,
  weightedProgress,
  weightingLabel,
  type IdpTone,
  type LobPerformance,
} from '@/domain/lob-performance';
import { addDays, daysBetween, isLocalDate } from '@/domain/long-term-plan';
import { useDeveloper, useModules, usePlanning } from '@/modules/planejamento/planning-provider';
import { hasSectionAccess } from '@/application/module-access';
import { CreatePendingDialog, type PendingSource } from '@/modules/pendencias/create-pending-dialog';
import { Callout, LoadState, StatCard } from '@/modules/planejamento/ui';
import { useConfirm } from '@/modules/layout/confirm';
import { useToast } from '@/modules/layout/toast';
import { HelpNote } from '@/modules/layout/help-note';
import { formatDate, workPath } from '@/shared/format';
import { useLob } from './lob-api';
import { LobChart, LobLegend, type LobZoom } from './lob-chart';
import { LobTable } from './lob-table';
import { LobActivityPanel } from './lob-activity-panel';
import { LobLocalsPanel } from './lob-locals-panel';
import { LobLaunchDialog } from './lob-launch-dialog';
import { LobBaselinesPanel } from './lob-baselines-panel';
import { Pill } from './measurement-sheet';

/** Visão "Linha de Balanço" da aba 1 (modelo aprovado em 04/11/2026, tela 1): barra de ferramentas,
 * cinco indicadores (o quinto, o IDP, desde 11/11/2026), o painel da atividade selecionada e, abaixo dele,
 * o gráfico (ou tabela) com legenda.
 * Os dados vêm de `useLob`; toda alteração é um comando ao servidor, que devolve a obra inteira já
 * recalculada (cascata de sucessoras incluída). "Desfazer" guarda, por comando, as datas que ele
 * mudou e as reenvia; vale na sessão (regra 16). */

type Period = 'all' | '3m' | '6m' | 'custom';
type Panel = 'locals' | 'baselines' | 'launch' | 'late';
/** Datas que um comando alterou, para "Desfazer" devolvê-las. */
type UndoEntry = { id: string; start: LocalDate; durationDays: number }[];
const UNDO_DEPTH = 50;
const ZOOMS: { id: LobZoom; label: string }[] = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
  { id: 'trimestre', label: 'Trimestre' },
];

const pct = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
/** "11/11". */
const dayMonth = (date: LocalDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Falha na comunicação com o servidor.');
/** Atalho de teclado só vale fora de campos de texto. */
const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element || !element.tagName) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable;
};

export function LobView({ workId }: { workId: string }) {
  // `useSearchParams` pede uma fronteira de Suspense para a página não travar a pré-renderização.
  return (
    <Suspense fallback={<LoadState />}>
      <LobViewInner workId={workId} />
    </Suspense>
  );
}

// ─── Peças da barra de ferramentas ──────────────────────────────────────────────

/** Botão que abre um painel flutuante; fecha com Esc, clique fora ou quando um item pede. */
function Popover({
  label,
  ariaLabel,
  tourId,
  align = 'start',
  children,
}: {
  label: ReactNode;
  ariaLabel?: string;
  tourId?: string;
  align?: 'start' | 'end';
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div ref={root} className="relative" data-tour={tourId}>
      <button
        type="button"
        className="button-ghost"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        {label}
        {!ariaLabel && <ChevronDown size={14} aria-hidden className="text-slate-400" />}
      </button>
      {open && (
        <div
          className={`absolute z-40 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-2 shadow-xl ${align === 'end' ? 'right-0' : 'left-0'}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Lista de marcação para os filtros de serviços e locais. */
function CheckList({
  items,
  isChecked,
  onToggle,
  onAll,
  onNone,
  empty,
}: {
  items: { id: string; label: string; color?: string }[];
  isChecked: (id: string) => boolean;
  onToggle: (id: string) => void;
  onAll: () => void;
  onNone: () => void;
  empty: string;
}) {
  if (!items.length) return <p className="px-2 py-1.5 text-xs text-slate-500">{empty}</p>;
  return (
    <div>
      <div className="flex gap-3 px-2 pb-1.5 text-xs">
        <button type="button" className="text-link" onClick={onAll}>
          Todos
        </button>
        <button type="button" className="text-link" onClick={onNone}>
          Nenhum
        </button>
      </div>
      <ul className="custom-scrollbar max-h-64 overflow-y-auto">
        {items.map(item => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
              <input type="checkbox" className="accent-primary" checked={isChecked(item.id)} onChange={() => onToggle(item.id)} />
              {item.color && <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm" style={{ background: item.color }} />}
              <span className="truncate">{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

const menuItem =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

/** Diálogo "Atrasos": os blocos cujo previsto até hoje passa do medido (regra 14). */
function LateDialog({
  rows,
  onSelect,
  onClose,
}: {
  rows: { id: string; label: string; planned: number; measured: number; delay: number }[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="lob-late-title"
      className="m-auto max-h-[90vh] w-[min(40rem,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="eyebrow">Linha de Balanço</p>
            <h3 id="lob-late-title" className="mt-1 text-base font-bold text-slate-900">
              {plural(rows.length, 'bloco atrasado', 'blocos atrasados')}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Previsto até hoje acima do medido em 10 pontos ou mais. Clique para ver o bloco.
            </p>
          </div>
          <button type="button" className="button-ghost shrink-0" onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </header>
        <div className="custom-scrollbar flex-1 overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Serviço · local</th>
                <th className="text-right">Previsto</th>
                <th className="text-right">Medido</th>
                <th className="text-right">Atraso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} className="cursor-pointer" onClick={() => onSelect(row.id)}>
                  <th scope="row" className="font-semibold">
                    <button type="button" className="text-left hover:text-primary">
                      {row.label}
                    </button>
                  </th>
                  <td className="text-right tabular-nums">{row.planned}%</td>
                  <td className="text-right tabular-nums text-danger">{row.measured}%</td>
                  <td className="text-right tabular-nums">{plural(row.delay, 'dia útil', 'dias úteis')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  );
}

// ─── IDP ─────────────────────────────────────────────────────────────────────────

const IDP_CARD_TONE: Record<IdpTone, 'success' | 'warning' | 'danger'> = { good: 'success', warn: 'warning', bad: 'danger' };
const IDP_PILL_TONE: Record<IdpTone, 'ok' | 'warn' | 'late'> = { good: 'ok', warn: 'warn', bad: 'late' };

/** De onde sai o planejado do IDP (regra 4): a linha de base escolhida, a manual mais recente ou o cronograma atual. */
export const idpReference = (performance: LobPerformance) =>
  performance.baseline ? `contra a linha de base “${performance.baseline.name}”` : 'contra o cronograma atual';

/** A linha da regra 6 (falta custo em algum pacote com blocos) ou do custo somando zero, com o caminho
 * até a visão Custos. Nada quando o peso já é o custo. Sem a migração 0044 (`costsUnavailable`) não há
 * onde apropriar: em vez do aviso em vermelho, diz que a apropriação ainda não foi ativada. */
export function IdpWeightNote({
  performance,
  costsHref,
  readOnly,
  costsUnavailable = false,
}: {
  performance: LobPerformance;
  costsHref: string;
  readOnly: boolean;
  costsUnavailable?: boolean;
}) {
  const { fallback, missingServiceIds, servicesWithBlocks } = performance.weights;
  if (fallback && costsUnavailable)
    return <span className="mt-1 block">A apropriação de custos ainda não foi ativada no banco: peso por duração.</span>;
  if (fallback === 'missing')
    return (
      <span className="mt-1 block font-semibold text-danger">
        Faltam custos em {missingServiceIds.length} de {plural(servicesWithBlocks.length, 'pacote', 'pacotes')}.{' '}
        <Link className="text-link font-semibold" href={costsHref}>
          {readOnly ? 'Ver custos' : 'Apropriar custos'}
        </Link>
      </span>
    );
  if (fallback === 'zero') return <span className="mt-1 block">Os custos apropriados somam zero: peso por duração.</span>;
  return null;
}

/** Quinto indicador (11/11/2026, modelo "IDP na Linha de Balanço"): real ÷ planejado na última medição
 * fechada, na cor da faixa (regra 10), com a conta, a referência e o peso na dica (regras 1, 3, 4 e 7);
 * sem número nos casos da regra 11. */
function IdpCard({
  performance,
  costsHref,
  readOnly,
  costsUnavailable,
}: {
  performance: LobPerformance;
  costsHref: string;
  readOnly: boolean;
  costsUnavailable: boolean;
}) {
  const { status, point, weights } = performance;
  const weight = weightingLabel(weights.mode);
  const note = <IdpWeightNote performance={performance} costsHref={costsHref} readOnly={readOnly} costsUnavailable={costsUnavailable} />;
  if (status === 'ok' && point?.idp !== undefined) {
    const tone = idpTone(point.idp);
    return (
      <StatCard
        label="IDP · desempenho de prazo"
        tone={IDP_CARD_TONE[tone]}
        value={
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatIdp(point.idp)}
            <Pill tone={IDP_PILL_TONE[tone]}>{IDP_TONE_LABEL[tone]}</Pill>
          </span>
        }
        hint={
          <>
            <span className="block tabular-nums">
              {pct(point.real)} ÷ {pct(point.planned)} em {dayMonth(point.date)} (medição nº {point.number}) · {idpReference(performance)} ·{' '}
              {weight}
            </span>
            {note}
          </>
        }
      />
    );
  }
  const reason =
    status === 'no-blocks'
      ? 'sem blocos ainda'
      : status === 'no-measurement'
        ? `sem medição · ${weight}`
        : `nada previsto até a data${point ? ` (medição nº ${point.number}, ${dayMonth(point.date)})` : ''} · ${idpReference(performance)} · ${weight}`;
  return (
    <StatCard
      label="IDP · desempenho de prazo"
      value="—"
      hint={
        <>
          <span className="block">{reason}</span>
          {status !== 'no-blocks' && note}
        </>
      }
    />
  );
}

// ─── A visão ─────────────────────────────────────────────────────────────────────

function LobViewInner({ workId }: { workId: string }) {
  const context = usePlanning();
  const confirm = useConfirm();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { state, reload, execute } = useLob(workId);

  const [hiddenServiceIds, setHiddenServiceIds] = useState<ReadonlySet<string>>(() => new Set());
  const [localFilter, setLocalFilter] = useState<ReadonlySet<string>>(); // indefinido = todos
  const [period, setPeriod] = useState<Period>('all');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [baselineId, setBaselineId] = useState('');
  const [zoom, setZoom] = useState<LobZoom>('mes');
  const [showTable, setShowTable] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  // `?lancar=<fluxo>` (vindo da visão Fluxos) já abre o diálogo com o fluxo escolhido; o efeito
  // abaixo tira o parâmetro do endereço para um recarregamento não reabrir.
  const launchParam = searchParams.get('lancar');
  const [panel, setPanel] = useState<Panel | undefined>(() => (launchParam ? 'launch' : undefined));
  const [launchFlowId, setLaunchFlowId] = useState<string | undefined>(() => launchParam ?? undefined);
  const [todayToken, setTodayToken] = useState(0);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const undoRef = useRef<() => void>(() => {});
  // "Criar pendência" de um serviço (10/11/2026): card da Lista de pendência da aba 2, só para quem abre
  // a aba 2 (a API das pendências é do módulo "vagoes").
  const developer = useDeveloper(),
    modules = useModules();
  const canPend = hasSectionAccess('vagoes', { developer, modules });
  const [pending, setPending] = useState<PendingSource>();

  const ready = context.state === 'ready' ? context : undefined;
  const actor = ready?.planning.data.users.find(u => u.id === ready.actorId);
  const readOnly = !actor || actor.role === 'viewer';
  const today: LocalDate = ready?.planning.today ?? new Date().toISOString().slice(0, 10);
  const data = state.status === 'ready' ? state.data : undefined;

  const percents = useMemo(() => (data ? measuredPercents(data.measurements, data.items) : {}), [data]);
  const measurementDates = useMemo(
    () => (data ? closedMeasurements(data.measurements).map(m => ({ number: m.number, date: m.date })) : []),
    [data],
  );
  const lateActivities = useMemo(
    () => (data ? data.activities.filter(a => isLate(a, percents[a.id], today)) : []),
    [data, percents, today],
  );
  // IDP e peso da aba (11/11/2026): o cartão do IDP segue a linha de base do seletor (vazio = regra 4) e
  // o "Avanço físico" usa o mesmo peso (regra 7). Memorizados: a obra chega a 600 blocos e o IDP refaz
  // o acumulado de cada medição fechada.
  const performance = useMemo(() => (data ? lobPerformance(data, { baselineId: baselineId || undefined }) : undefined), [data, baselineId]);
  const weights = performance?.weights;
  const progress = useMemo(() => (data && weights ? weightedProgress(data, today, weights) : undefined), [data, today, weights]);
  const range = useMemo(() => {
    if (period === '3m') return { start: today, end: addDays(today, 91) };
    if (period === '6m') return { start: today, end: addDays(today, 182) };
    if (period === 'custom' && isLocalDate(custom.start) && isLocalDate(custom.end) && custom.start <= custom.end)
      return { start: custom.start, end: custom.end };
    return undefined;
  }, [period, custom, today]);

  // Teclas: H rola até hoje; Ctrl+Z / Cmd+Z desfaz. Fora de campos e com nenhum diálogo aberto.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
      if ((event.key === 'z' || event.key === 'Z') && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        undoRef.current();
      } else if ((event.key === 'h' || event.key === 'H') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        setTodayToken(t => t + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!launchParam) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('lancar')) return;
    url.searchParams.delete('lancar');
    window.history.replaceState(null, '', url.toString());
  }, [launchParam]);

  /** Executa um comando e guarda, para "Desfazer", as datas dos blocos que ele mudou. Só comandos
   * que mantêm o mesmo conjunto de blocos entram na pilha: lançar, importar e excluir não se desfazem. */
  const run = async (command: LobCommand) => {
    const before = new Map((data?.activities ?? []).map(a => [a.id, a]));
    const response = await execute(command);
    if (response.available && response.activities.length === before.size && response.activities.every(a => before.has(a.id))) {
      const entry: UndoEntry = response.activities
        .filter(a => {
          const b = before.get(a.id)!;
          return b.start !== a.start || b.durationDays !== a.durationDays;
        })
        .map(a => {
          const b = before.get(a.id)!;
          return { id: a.id, start: b.start, durationDays: b.durationDays };
        });
      if (entry.length) setUndoStack(stack => [...stack.slice(-(UNDO_DEPTH - 1)), entry]);
    }
    return response;
  };
  const fail = (error: unknown) => toast({ title: 'Não foi possível salvar', description: errorMessage(error), tone: 'danger' });
  const undo = async () => {
    if (!data || readOnly || busy) return;
    const entry = undoStack[undoStack.length - 1];
    if (!entry) return;
    setUndoStack(stack => stack.slice(0, -1));
    setBusy(true);
    try {
      // Em ordem crescente de início: a predecessora volta antes, e só então a sucessora pode voltar.
      for (const item of [...entry].sort((a, b) => a.start.localeCompare(b.start)))
        await execute({ type: 'update_activity', activityId: item.id, start: item.start, durationDays: item.durationDays });
      toast({
        title: 'Alteração desfeita',
        description: `${plural(entry.length, 'bloco voltou', 'blocos voltaram')} às datas anteriores.`,
      });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    undoRef.current = undo;
  });

  if (state.status === 'error')
    return (
      <div className="panel p-6">
        <Callout tone="danger" role="alert">
          {state.message}
        </Callout>
        <button type="button" className="button-ghost mt-4" onClick={reload}>
          Tentar de novo
        </button>
      </div>
    );
  if (state.status === 'unavailable')
    return (
      <Callout tone="warning" role="status">
        A Linha de Balanço ainda não foi ativada no banco: aplique a migração 0038 (
        <code className="text-xs">supabase/migrations/0038_lob.sql</code>) e recarregue a página.
      </Callout>
    );
  if (!data || !performance || context.state === 'loading') return <LoadState />;

  // ─── Derivados da obra carregada ──────────────────────────────────────────
  const services = [...data.services].sort((a, b) => a.orderIndex - b.orderIndex);
  const locals = [...data.locals].sort((a, b) => a.orderIndex - b.orderIndex);
  const localName = (id: string) => data.locals.find(l => l.id === id)?.name ?? 'local';
  const serviceName = (id: string) => data.services.find(s => s.id === id)?.name ?? 'Serviço';
  const label = (a: LobActivity) => `${serviceName(a.serviceId)} · ${localName(a.localId)}`;
  const selected = selectedId ? data.activities.find(a => a.id === selectedId) : undefined;
  /** A entrega do card sai do primeiro início do serviço na obra: o menor `start` entre os blocos dele.
   * Serviço sem bloco não tem de onde tirar a data (e nem aparece aqui: chega-se a ele por um bloco). */
  const createPending = (serviceId: string) => {
    const service = data.services.find(s => s.id === serviceId);
    const starts = data.activities.filter(a => a.serviceId === serviceId).map(a => a.start);
    if (!service || !starts.length) return;
    setPending({ origin: 'longo_prazo', sourceId: service.id, label: service.name, start: starts.reduce((a, b) => (b < a ? b : a)) });
  };
  const span = lobSpan(data.activities);
  const baseline = data.baselines.find(b => b.id === baselineId);
  /** A linha de base que o IDP usa quando o seletor está vazio (regra 4), para o rótulo da opção vazia. */
  const defaultIdpBaseline = performanceBaseline(data.baselines);
  const baselineFinish = baseline?.snapshot.reduce<LocalDate | undefined>((max, e) => {
    const f = activityFinish(e);
    return !max || f > max ? f : max;
  }, undefined);
  const finishDelta = span && baselineFinish ? daysBetween(baselineFinish, span.finish) : undefined;
  const physical = progress?.physical;
  const planned = progress?.planned;
  const weightLabel = weightingLabel(performance.weights.mode);
  const withCost = performance.weights.servicesWithBlocks.length - performance.weights.missingServiceIds.length;
  const behind = physical !== undefined && planned !== undefined && physical < planned - 0.05;
  const visibleServices = services.filter(s => !hiddenServiceIds.has(s.id)).length;
  const visibleLocals = localFilter ? locals.filter(l => localFilter.has(l.id)).length : locals.length;
  const base = workPath(workId, 'longo-prazo');
  const costsHref = `${base}?visao=custos`;

  const toggleService = (id: string) =>
    setHiddenServiceIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleLocal = (id: string) =>
    setLocalFilter(current => {
      const next = new Set(current ?? locals.map(l => l.id));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size === locals.length ? undefined : next;
    });
  const move = (id: string, start: LocalDate) => {
    if (readOnly || busy) return;
    run({ type: 'update_activity', activityId: id, start }).catch(fail);
  };
  const openLaunch = (flowId?: string) => {
    if (!data.locals.length) {
      toast({
        title: 'Cadastre os locais da obra primeiro',
        description: 'O fluxo é lançado nos locais marcados; sem locais não há onde colocar os blocos.',
        tone: 'info',
      });
      setPanel('locals');
      return;
    }
    setLaunchFlowId(flowId);
    setPanel('launch');
  };
  const importPlanner = async () => {
    const ok = await confirm({
      title: 'Importar o plano do Planejador?',
      description: data.activities.length
        ? `A importação só funciona com a Linha de Balanço vazia, e esta obra já tem ${plural(data.activities.length, 'bloco', 'blocos')}: ela será recusada. Exclua os blocos antes ou lance o fluxo direto.`
        : 'Cada serviço × pavimento do Planejador vira um bloco com as datas atuais, e os pavimentos viram locais. Só funciona com a Linha de Balanço vazia.',
      confirmLabel: 'Importar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const response = await execute({ type: 'import_planner', workId });
      if (response.available)
        toast({
          title: 'Plano importado',
          description: `${plural(response.activities.length, 'bloco', 'blocos')} em ${plural(response.locals.length, 'local', 'locais')}.`,
        });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  /** CSV dos blocos, no formato que o Excel em pt-BR lê (`;`, vírgula decimal, BOM). */
  const exportCsv = () => {
    const localOrder = new Map(locals.map((l, i) => [l.id, i]));
    const serviceOrder = new Map(services.map((s, i) => [s.id, i]));
    const sorted = [...data.activities].sort(
      (a, b) =>
        (localOrder.get(a.localId) ?? 0) - (localOrder.get(b.localId) ?? 0) ||
        (serviceOrder.get(a.serviceId) ?? 0) - (serviceOrder.get(b.serviceId) ?? 0),
    );
    const rows: (string | number)[][] = [
      ['Local', 'Serviço', 'Início', 'Término', 'Duração (dias úteis)', 'Previsto até hoje (%)', 'Medido (%)'],
      ...sorted.map(a => [
        localName(a.localId),
        serviceName(a.serviceId),
        formatDate(a.start),
        formatDate(activityFinish(a)),
        a.durationDays,
        plannedPercent(a, today),
        percents[a.id] ?? 0,
      ]),
    ];
    const text = rows
      .map(row =>
        row
          .map(cell =>
            typeof cell === 'number'
              ? cell.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 1 })
              : `"${cell.replace(/"/g, '""')}"`,
          )
          .join(';'),
      )
      .join('\r\n');
    const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `linha-de-balanco-${workId}.csv` });
    link.click();
    URL.revokeObjectURL(url);
  };

  const lateRows = lateActivities
    .map(a => ({
      id: a.id,
      label: label(a),
      planned: plannedPercent(a, today),
      measured: percents[a.id] ?? 0,
      delay: delayDays(a, percents[a.id], today),
    }))
    .sort((a, b) => b.delay - a.delay || a.label.localeCompare(b.label, 'pt-BR'));

  return (
    <section aria-label="Linha de Balanço" className="space-y-4">
      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Ferramentas da Linha de Balanço">
        <Popover
          tourId="longo-lob-filtros"
          label={visibleServices === services.length ? 'Serviços: todos' : `Serviços: ${visibleServices} de ${services.length}`}
        >
          {() => (
            <CheckList
              items={services.map(s => ({ id: s.id, label: s.name, color: s.color }))}
              isChecked={id => !hiddenServiceIds.has(id)}
              onToggle={toggleService}
              onAll={() => setHiddenServiceIds(new Set())}
              onNone={() => setHiddenServiceIds(new Set(services.map(s => s.id)))}
              empty="Nenhum serviço ainda: lance um fluxo."
            />
          )}
        </Popover>
        <Popover label={!localFilter ? 'Locais: todos' : `Locais: ${visibleLocals} de ${locals.length}`}>
          {() => (
            <CheckList
              items={[...locals].reverse().map(l => ({ id: l.id, label: l.name }))}
              isChecked={id => !localFilter || localFilter.has(id)}
              onToggle={toggleLocal}
              onAll={() => setLocalFilter(undefined)}
              onNone={() => setLocalFilter(new Set())}
              empty="Nenhum local cadastrado."
            />
          )}
        </Popover>
        <label htmlFor="lob-period" className="sr-only">
          Período
        </label>
        <select id="lob-period" className="field w-auto py-2" value={period} onChange={event => setPeriod(event.target.value as Period)}>
          <option value="all">Período: obra inteira</option>
          <option value="3m">Período: próximos 3 meses</option>
          <option value="6m">Período: próximos 6 meses</option>
          <option value="custom">Período: personalizado</option>
        </select>
        {period === 'custom' && (
          <>
            <input
              type="date"
              className="field w-auto py-2"
              aria-label="Início do período"
              value={custom.start}
              onChange={event => setCustom(c => ({ ...c, start: event.target.value }))}
            />
            <input
              type="date"
              className="field w-auto py-2"
              aria-label="Fim do período"
              value={custom.end}
              onChange={event => setCustom(c => ({ ...c, end: event.target.value }))}
            />
          </>
        )}
        <label htmlFor="lob-baseline" className="sr-only">
          Linha de base
        </label>
        <select id="lob-baseline" className="field w-auto py-2" value={baselineId} onChange={event => setBaselineId(event.target.value)}>
          {/* Vazio = nada no gráfico; o IDP cai na regra 4 (manual mais recente) e diz qual usa na dica. */}
          <option value="">
            {defaultIdpBaseline ? `Linha de base: nenhuma no gráfico (IDP: “${defaultIdpBaseline.name}”)` : 'Linha de base: nenhuma'}
          </option>
          {[...data.baselines]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.automatic ? ' (automática)' : ''}
              </option>
            ))}
        </select>
        <span className="hidden flex-1 lg:block" />
        <div
          data-tour="longo-lob-zoom"
          role="group"
          aria-label="Zoom"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
        >
          {ZOOMS.map(z => (
            <button
              key={z.id}
              type="button"
              aria-pressed={zoom === z.id}
              onClick={() => setZoom(z.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${zoom === z.id ? 'bg-white text-primary-ink shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {z.label}
            </button>
          ))}
        </div>
        <button
          data-tour="longo-lob-hoje"
          type="button"
          className="button-ghost"
          title="Rolar até hoje (tecla H)"
          onClick={() => setTodayToken(t => t + 1)}
        >
          Hoje <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px] font-semibold text-slate-400">H</kbd>
        </button>
        {!readOnly && (
          <button
            data-tour="longo-lob-desfazer"
            type="button"
            className="button-ghost"
            disabled={!undoStack.length || busy}
            title="Ctrl+Z"
            onClick={undo}
          >
            <Undo2 size={15} aria-hidden /> Desfazer
          </button>
        )}
        <button
          data-tour="longo-lob-tabela"
          type="button"
          className="button-ghost"
          aria-pressed={showTable}
          onClick={() => setShowTable(v => !v)}
        >
          <Table2 size={15} aria-hidden /> Tabela
        </button>
        <button
          data-tour="longo-lob-atrasos"
          type="button"
          className="button-ghost"
          disabled={!lateActivities.length}
          onClick={() => setPanel('late')}
        >
          <TriangleAlert size={15} aria-hidden className={lateActivities.length ? 'text-danger' : undefined} /> Atrasos
          {lateActivities.length > 0 && <b className="tabular-nums text-danger">{lateActivities.length}</b>}
        </button>
        <button data-tour="longo-lob-linha-base" type="button" className="button-ghost" onClick={() => setPanel('baselines')}>
          <Flag size={15} aria-hidden /> {readOnly ? 'Linhas de base' : 'Salvar linha de base'}
          {data.baselines.length > 0 && <span className="badge-muted px-2 py-0">{data.baselines.length}</span>}
        </button>
        {/* Custos por pacote (11/11/2026): o selo diz quantos pacotes com blocos já têm custo (regra 6). */}
        <Link
          data-tour="longo-lob-custos"
          href={costsHref}
          className="button-ghost"
          title={
            performance.weights.servicesWithBlocks.length
              ? `${withCost} de ${plural(performance.weights.servicesWithBlocks.length, 'pacote com blocos tem', 'pacotes com blocos têm')} custo apropriado`
              : 'Custos por pacote de serviço: o peso do IDP'
          }
        >
          <Coins size={15} aria-hidden /> Custos
          {performance.weights.servicesWithBlocks.length > 0 && (
            <span
              className={`badge-muted px-2 py-0 tabular-nums ${performance.weights.fallback === 'missing' ? 'border-warning-ring bg-warning-soft text-warning' : ''}`}
            >
              {withCost}/{performance.weights.servicesWithBlocks.length}
            </span>
          )}
        </Link>
        <Link data-tour="longo-lob-nova-medicao" href={`${base}?visao=medicoes`} className="button-secondary">
          <Ruler size={15} aria-hidden /> Nova medição
        </Link>
        {!readOnly && (
          <button data-tour="longo-lob-lancar" type="button" className="button" disabled={busy} onClick={() => openLaunch()}>
            <Plus size={16} aria-hidden /> Lançar fluxo
          </button>
        )}
        <Popover tourId="longo-lob-mais" label={<MoreHorizontal size={16} aria-hidden />} ariaLabel="Mais ações" align="end">
          {close => (
            <div role="menu">
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                onClick={() => {
                  close();
                  setPanel('locals');
                }}
              >
                <Building2 size={15} aria-hidden /> Locais da obra
              </button>
              {!readOnly && (
                <button
                  type="button"
                  role="menuitem"
                  className={menuItem}
                  disabled={busy}
                  onClick={() => {
                    close();
                    importPlanner();
                  }}
                >
                  <Upload size={15} aria-hidden /> Importar do Planejador
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                disabled={!data.activities.length}
                onClick={() => {
                  close();
                  exportCsv();
                }}
              >
                <Download size={15} aria-hidden /> Exportar CSV
              </button>
            </div>
          )}
        </Popover>
        <HelpNote title="Como funciona: Linha de Balanço" compact>
          <p>
            Cada bloco é um <strong>serviço num local</strong>, com início e duração em dias úteis. A parte cheia é o que já foi medido; o
            contorno vermelho marca atraso (previsto até hoje acima do medido).
          </p>
          <p>
            <strong>Arraste</strong> um bloco para mudar a data: ele nunca entra antes do fim das predecessoras, e as sucessoras acompanham.{' '}
            <strong>Desfazer</strong> (Ctrl+Z) devolve as datas na sessão. Duração, dependências, equipe e datas reais se editam no painel
            ao lado.
          </p>
          <p>
            <strong>Lançar fluxo</strong> cria os blocos a partir de um fluxo da empresa nos locais marcados; antes de cada lançamento numa
            obra que já tem blocos, uma linha de base automática guarda o cronograma.
          </p>
          <p>
            O <strong>IDP</strong> (desempenho de prazo) é o avanço real ÷ o planejado na última medição fechada, contra a linha de base
            escolhida (sem escolha, a manual mais recente): 1,00 ou mais está em dia, abaixo de 0,90 atrasado. Com o custo de todos os
            pacotes apropriado em <strong>Custos</strong>, ele e o avanço físico passam a pesar pelo custo; até lá, pela duração.
          </p>
        </HelpNote>
      </div>

      {actor?.role === 'viewer' && (
        <Callout tone="info">Seu acesso é de consulta: a Linha de Balanço aparece aqui, mas não pode ser alterada.</Callout>
      )}
      {!readOnly && !data.locals.length && (
        <Callout tone="warning">
          Antes de lançar um fluxo, cadastre os locais da obra (Térreo, 1º pavimento… de baixo para cima).{' '}
          <button type="button" className="text-link" onClick={() => setPanel('locals')}>
            Locais da obra
          </button>
        </Callout>
      )}

      {/* Indicadores */}
      <div data-tour="longo-lob-indicadores" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Serviços"
          value={data.services.length}
          hint={`${plural(data.launches.length, 'lançamento', 'lançamentos')} · ${plural(data.activities.length, 'bloco', 'blocos')}`}
        />
        <StatCard
          label="Locais"
          value={data.locals.length}
          hint={
            locals.length >= 2 ? `${locals[0].name} a ${locals[locals.length - 1].name}` : (locals[0]?.name ?? 'cadastre os locais da obra')
          }
        />
        <StatCard
          label="Término previsto"
          value={span ? formatDate(span.finish) : '—'}
          hint={
            finishDelta !== undefined && baselineFinish ? (
              <span className={finishDelta > 0 ? 'font-semibold text-danger' : finishDelta < 0 ? 'font-semibold text-success' : undefined}>
                {finishDelta > 0 ? `+${finishDelta} dias sobre` : finishDelta < 0 ? `−${Math.abs(finishDelta)} dias sobre` : 'igual à'} a
                linha de base ({formatDate(baselineFinish)})
              </span>
            ) : span ? (
              'escolha uma linha de base para comparar'
            ) : (
              'sem blocos ainda'
            )
          }
        />
        <StatCard
          label="Avanço físico"
          value={physical !== undefined ? pct(physical) : '—'}
          hint={
            planned !== undefined ? (
              <>
                <span className={behind ? 'font-semibold text-danger' : undefined}>
                  Previsto até hoje {pct(planned)} · {plural(lateActivities.length, 'bloco atrasado', 'blocos atrasados')}
                </span>{' '}
                · {weightLabel}
              </>
            ) : (
              'sem blocos ainda'
            )
          }
        />
        <div data-tour="longo-lob-idp" className="grid">
          <IdpCard
            performance={performance}
            costsHref={costsHref}
            readOnly={readOnly}
            costsUnavailable={state.status === 'ready' && state.costAccess === 'unavailable'}
          />
        </div>
      </div>

      {/* Atividade selecionada: acima do gráfico, para não tomar a lateral dele (11/11/2026) */}
      <aside className="panel p-4" data-tour="longo-lob-painel" aria-label="Atividade selecionada">
        {selected ? (
          <LobActivityPanel
            key={selected.id}
            activity={selected}
            data={data}
            percents={percents}
            today={today}
            readOnly={readOnly}
            onExecute={run}
            onClose={() => setSelectedId(undefined)}
            onSelect={setSelectedId}
            onCreatePending={canPend ? createPending : undefined}
          />
        ) : data.activities.length ? (
          <div className="text-sm text-slate-500">
            <p className="eyebrow">Atividade selecionada</p>
            <p className="mt-2">Clique num bloco para ver detalhes: datas, duração, dependências, equipe, situação e fotos da medição.</p>
            {!readOnly && (
              <p className="mt-2 text-xs">Arraste um bloco para mudar a data; as sucessoras acompanham. H leva até hoje; Ctrl+Z desfaz.</p>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-600">
            <p className="eyebrow">Começar</p>
            <p className="mt-2">Nenhum bloco ainda. Cadastre os locais e lance um fluxo da empresa, ou traga o plano do Planejador.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!readOnly && (
                <button type="button" className="button" disabled={busy} onClick={() => openLaunch()}>
                  <Plus size={16} aria-hidden /> Lançar fluxo
                </button>
              )}
              <button type="button" className="button-ghost" onClick={() => setPanel('locals')}>
                <Building2 size={15} aria-hidden /> Locais da obra
              </button>
              {!readOnly && (
                <button type="button" className="button-ghost" disabled={busy} onClick={importPlanner}>
                  <Upload size={15} aria-hidden /> Importar do Planejador
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
      {/* Gráfico (ou tabela), na largura toda */}
      <div className="panel p-4" data-tour="longo-lob-grafico">
        {!data.activities.length ? (
          <p className="py-12 text-center text-sm text-slate-500">
            A Linha de Balanço desta obra ainda não tem blocos.
            {!readOnly && ' Use "Lançar fluxo" para criar os blocos a partir de um fluxo da empresa, ou importe o plano do Planejador.'}
          </p>
        ) : showTable ? (
          <LobTable
            data={data}
            percents={percents}
            today={today}
            hiddenServiceIds={hiddenServiceIds}
            visibleLocalIds={localFilter}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : (
          <LobChart
            data={data}
            today={today}
            percents={percents}
            measurementDates={measurementDates}
            baseline={baseline}
            hiddenServiceIds={hiddenServiceIds}
            visibleLocalIds={localFilter}
            range={range}
            zoom={zoom}
            selectedId={selectedId}
            readOnly={readOnly || busy}
            onSelect={setSelectedId}
            onMove={move}
            scrollToTodayToken={todayToken}
          />
        )}
        {services.length > 0 && (
          <div data-tour="longo-lob-legenda" className="mt-3 border-t border-slate-100 pt-3">
            <LobLegend services={services} hidden={hiddenServiceIds} onToggle={toggleService} />
          </div>
        )}
      </div>

      {panel === 'locals' && (
        <LobLocalsPanel
          workId={workId}
          locals={data.locals}
          blocksOf={id => data.activities.filter(a => a.localId === id).length}
          readOnly={readOnly}
          onExecute={run}
          onClose={() => setPanel(undefined)}
        />
      )}
      {panel === 'baselines' && (
        <LobBaselinesPanel
          data={data}
          readOnly={readOnly}
          activeId={baselineId || undefined}
          onExecute={run}
          onClose={() => setPanel(undefined)}
          onCompare={id => setBaselineId(id ?? '')}
        />
      )}
      {panel === 'launch' && !readOnly && data.locals.length > 0 && (
        <LobLaunchDialog
          workId={workId}
          data={data}
          today={today}
          initialFlowId={launchFlowId}
          onExecute={run}
          onClose={() => {
            setPanel(undefined);
            setLaunchFlowId(undefined);
          }}
        />
      )}
      {pending && <CreatePendingDialog workId={workId} source={pending} open onClose={() => setPending(undefined)} />}
      {panel === 'late' && (
        <LateDialog
          rows={lateRows}
          onSelect={id => {
            setSelectedId(id);
            setShowTable(false);
            setPanel(undefined);
          }}
          onClose={() => setPanel(undefined)}
        />
      )}
    </section>
  );
}

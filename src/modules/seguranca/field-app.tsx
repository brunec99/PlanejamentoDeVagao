'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  CloudDownload,
  CloudUpload,
  ImageOff,
  LogIn,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import {
  SAFETY_CONSEQUENCES,
  SAFETY_LIMITS,
  SAFETY_PROBABILITIES,
  SAFETY_TST_ONLY_MESSAGE,
  safetyDays,
  type SafetyConsequence,
  type SafetyItem,
  type SafetyPhoto,
  type SafetyPhotoKind,
  type SafetyProbability,
} from '@/domain/safety';
import { compressImage } from '@/modules/terminalidade/compress-image';
import { isPhotoUrlStale } from '@/modules/terminalidade/photo-refresh';
import {
  compareItems,
  DEFAULT_FILTERS,
  filterItems,
  indexSafety,
  locationKey,
  locationLabel,
  locationOptions,
  NO_LOCATION_LABEL,
  NO_TYPE_LABEL,
  NONE,
  photosOf,
  typeName,
  type SafetyFilters,
  type SafetyIndex,
  type SafetySituation,
} from './safety-view';
import { localView, todayInSaoPaulo, type FieldPackage, type LocalView, type QueuedOperation } from './offline-model';
import {
  discard,
  enqueue,
  fetchWorks,
  preparePackage,
  readPackage,
  readPhoto,
  readQueue,
  readThumb,
  readWorks,
  registerFieldServiceWorker,
  SessionExpiredError,
  synchronize,
  type StoredWorks,
} from './offline-store';

/* Segurança em campo: a lista de apontamentos da aba 6 para o celular e sem sinal, no mesmo desenho da
 * terminalidade em campo (aba 5). Baixa-se a obra com sinal; depois tudo abre em modo avião, o que é
 * lançado vai para a fila do aparelho e sobe sozinho quando a conexão volta. Só o TST lança: abrir
 * apontamento com foto, juntar foto, finalizar com a foto da correção e reabrir. Quem não é TST vê a
 * lista, os filtros e as fotos, e nada entra na fila. Cadastro de tipos, edição, edição em lote e
 * exclusão ficam na aba 6, no computador. Sem o tour "Como usar" da terminalidade em campo. */

function useOnline(): boolean {
  return useSyncExternalStore(
    notify => {
      window.addEventListener('online', notify);
      window.addEventListener('offline', notify);
      return () => {
        window.removeEventListener('online', notify);
        window.removeEventListener('offline', notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const FIELD_PATH = '/campo/seguranca';
const dateLabel = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
const stampLabel = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const daysText = (days: number) => (days === 1 ? '1 dia' : `${days} dias`);
/** Volta do login direto para a obra aberta. */
const loginUrl = (workId: string) =>
  `/login?redirect=${encodeURIComponent(workId ? `${FIELD_PATH}?obra=${encodeURIComponent(workId)}` : FIELD_PATH)}`;
/** Apontamentos por página da lista: obras com mais de mil (quase tudo histórico finalizado) não podem
 * montar tudo de uma vez no celular. */
const PAGE_SIZE = 25;

type Toast = { text: string; tone: 'ok' | 'error' } | null;
type Act = (run: (pkg: FieldPackage) => Promise<void>, success: string) => Promise<boolean>;

export function FieldSafety() {
  const online = useOnline();
  const [works, setWorks] = useState<StoredWorks | null>(null);
  const [packages, setPackages] = useState<Record<string, FieldPackage>>({});
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [workId, setWorkId] = useState<string>('');
  const [busy, setBusy] = useState<'' | 'works' | 'prepare' | 'sync'>('');
  const [loaded, setLoaded] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((text: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  const reloadLocal = useCallback(async (ids?: string[]) => {
    setQueue(await readQueue());
    const stored = await readWorks();
    if (stored) setWorks(stored);
    const wanted = ids ?? stored?.works.map(w => w.id) ?? [];
    const found: Record<string, FieldPackage> = {};
    for (const id of wanted) {
      const pkg = await readPackage(id);
      if (pkg) found[id] = pkg;
    }
    setPackages(current => ({ ...current, ...found }));
  }, []);

  const syncNow = useCallback(
    async (silent = false) => {
      if (!navigator.onLine) return;
      if (!silent) setBusy('sync');
      try {
        const result = await synchronize();
        await reloadLocal();
        if (result.sessionExpired) setNeedsLogin(true);
        if (result.error && !silent) show(result.error, 'error');
        else if (result.sent) show(result.sent === 1 ? '1 alteração enviada.' : `${result.sent} alterações enviadas.`);
      } finally {
        if (!silent) setBusy('');
      }
    },
    [reloadLocal, show],
  );

  // Abre pelo que está no aparelho e, com sinal, atualiza a lista de obras e envia o que ficou na fila.
  useEffect(() => {
    registerFieldServiceWorker();
    const requested = new URLSearchParams(window.location.search).get('obra') ?? '';
    void (async () => {
      await reloadLocal();
      setLoaded(true);
      if (requested) setWorkId(requested);
      if (!navigator.onLine) return;
      try {
        setWorks(await fetchWorks());
        await reloadLocal();
      } catch (error) {
        if (error instanceof SessionExpiredError) setNeedsLogin(true);
      }
      await syncNow(true);
    })();
  }, [reloadLocal, syncNow]);

  // O sinal voltou: sobe o que ficou na fila sem a pessoa precisar lembrar.
  useEffect(() => {
    const back = () => void syncNow(true);
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [syncNow]);

  async function prepare(id: string) {
    setBusy('prepare');
    try {
      const pkg = await preparePackage(id);
      setPackages(current => ({ ...current, [id]: pkg }));
      show(`${pkg.work.name} pronta para usar sem sinal.`);
      return true;
    } catch (error) {
      if (error instanceof SessionExpiredError) setNeedsLogin(true);
      show(error instanceof Error ? error.message : 'Não foi possível baixar a obra.', 'error');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function openWork(id: string) {
    if (!packages[id] && !(await prepare(id))) return;
    setWorkId(id);
    window.history.replaceState(null, '', `${FIELD_PATH}?obra=${encodeURIComponent(id)}`);
  }

  const pkg = workId ? packages[workId] : undefined;
  const view = useMemo(() => (pkg ? localView(pkg, queue) : undefined), [pkg, queue]);

  // As fotos do histórico finalizado só aparecem com sinal, pela URL assinada do pacote, que vence em uma
  // hora. Obra aberta com sinal e pacote velho: baixa de novo em silêncio, uma vez por obra.
  const staleRefreshed = useRef(new Set<string>());
  useEffect(() => {
    if (!pkg || !online || staleRefreshed.current.has(pkg.work.id)) return;
    if (!isPhotoUrlStale(Date.parse(pkg.savedAt), Date.now())) return;
    staleRefreshed.current.add(pkg.work.id);
    preparePackage(pkg.work.id)
      .then(fresh => setPackages(current => ({ ...current, [fresh.work.id]: fresh })))
      .catch(error => error instanceof SessionExpiredError && setNeedsLogin(true));
  }, [pkg, online]);
  const failed = queue.filter(q => q.error);
  // Quem não é TST só consulta: o pacote da obra diz (`canEdit`); antes de abrir uma obra, o perfil.
  const readOnly = pkg ? !pkg.canEdit : works ? !works.actor.tst : false;

  /** Grava no aparelho e, com sinal, já tenta enviar. A fila é relida mesmo na recusa: uma parte do
   * lançamento (as fotos, por exemplo) pode ter entrado antes do erro. */
  const act: Act = async (run, success) => {
    if (!pkg) return false;
    try {
      await run(pkg);
      show(navigator.onLine ? success : `${success} Fica no aparelho até o sinal voltar.`);
      if (navigator.onLine) void syncNow(true);
      return true;
    } catch (error) {
      show(error instanceof Error ? error.message : 'Não foi possível registrar.', 'error');
      return false;
    } finally {
      setQueue(await readQueue());
    }
  };

  return (
    <div className="min-h-dvh bg-slate-100 pb-28 font-sans text-slate-900">
      <Header
        title={pkg ? pkg.work.name : 'Segurança em campo'}
        subtitle={pkg ? `Baixada em ${stampLabel(pkg.savedAt)}` : 'Apontamentos de segurança no celular, com ou sem sinal'}
        online={online}
        pending={queue.length}
        syncing={busy === 'sync'}
        onBack={pkg ? () => setWorkId('') : undefined}
        onSync={() => void syncNow()}
      />
      {needsLogin && (
        <Banner tone="warning">
          Sua sessão expirou. O que foi lançado continua guardado neste aparelho.{' '}
          <a href={loginUrl(workId)} className="inline-flex items-center gap-1 font-semibold underline">
            <LogIn size={14} aria-hidden /> Entrar de novo
          </a>
        </Banner>
      )}
      {failed.length > 0 && <FailedOperations failed={failed} onDiscard={async q => (await discard(q), setQueue(await readQueue()))} />}
      {loaded && readOnly && (
        <Banner tone="info">
          {SAFETY_TST_ONLY_MESSAGE}
          {pkg && pkg.inspectors.length > 0 && (
            <span className="mt-0.5 block text-xs">
              {pkg.inspectors.length === 1 ? 'TST desta obra: ' : 'TSTs desta obra: '}
              {pkg.inspectors.map(i => i.name).join(', ')}.
            </span>
          )}
        </Banner>
      )}
      {!loaded ? (
        <p className="p-6 text-center text-sm text-slate-500">Abrindo…</p>
      ) : pkg && view ? (
        <WorkScreen
          key={pkg.work.id}
          pkg={pkg}
          view={view}
          online={online}
          onRefresh={() => prepare(pkg.work.id)}
          refreshing={busy === 'prepare'}
          act={act}
        />
      ) : (
        <WorkList
          works={works}
          packages={packages}
          queue={queue}
          online={online}
          busy={busy !== ''}
          onOpen={id => void openWork(id)}
          onReloadWorks={async () => {
            setBusy('works');
            try {
              setWorks(await fetchWorks());
            } catch (error) {
              if (error instanceof SessionExpiredError) setNeedsLogin(true);
              else show(error instanceof Error ? error.message : 'Não foi possível carregar as obras.', 'error');
            } finally {
              setBusy('');
            }
          }}
        />
      )}
      {toast && (
        <div
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={`fixed inset-x-3 bottom-24 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${toast.tone === 'error' ? 'bg-rose-700 text-white' : 'bg-slate-900 text-white'}`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Header({
  title,
  subtitle,
  online,
  pending,
  syncing,
  onBack,
  onSync,
}: {
  title: string;
  subtitle: string;
  online: boolean;
  pending: number;
  syncing: boolean;
  onBack?: () => void;
  onSync: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 bg-brand-950 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white shadow">
      <div className="flex items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar para as obras"
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"
          >
            <ArrowLeft size={20} aria-hidden />
          </button>
        ) : (
          <Link
            href="/obras"
            aria-label="Voltar ao Obra 360"
            className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"
          >
            <ArrowLeft size={20} aria-hidden />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <p className="truncate text-xs text-brand-200">{subtitle}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${online ? 'bg-white/15 text-brand-50' : 'bg-amber-400 text-amber-950'}`}
        >
          {online ? <CloudUpload size={13} aria-hidden /> : <WifiOff size={13} aria-hidden />}
          {online ? 'on-line' : 'sem sinal'}
        </span>
        <button
          type="button"
          onClick={onSync}
          disabled={!online || syncing || pending === 0}
          aria-label="Enviar o que está no aparelho"
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-40"
        >
          <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} aria-hidden />
        </button>
      </div>
      {pending > 0 && (
        <p className="mt-1 rounded-md bg-amber-400/90 px-2 py-1 text-xs font-medium text-amber-950">
          {pending} {pending === 1 ? 'alteração guardada no aparelho' : 'alterações guardadas no aparelho'}
          {online ? ', enviando…' : ' — sobe sozinho quando o sinal voltar'}
        </p>
      )}
    </header>
  );
}

const BANNER_TONES = {
  warning: 'bg-amber-100 text-amber-950',
  error: 'bg-rose-100 text-rose-900',
  info: 'bg-sky-100 text-sky-950',
} as const;

function Banner({ tone, children }: { tone: keyof typeof BANNER_TONES; children: ReactNode }) {
  return (
    <div role={tone === 'info' ? 'note' : 'alert'} className={`mx-3 mt-3 rounded-xl px-4 py-3 text-sm ${BANNER_TONES[tone]}`}>
      {children}
    </div>
  );
}

function FailedOperations({ failed, onDiscard }: { failed: QueuedOperation[]; onDiscard: (q: QueuedOperation) => void }) {
  return (
    <Banner tone="error">
      <p className="font-semibold">O servidor recusou {failed.length === 1 ? 'uma alteração' : `${failed.length} alterações`}.</p>
      <p className="mt-0.5 text-xs">O envio parou nela para não mudar a ordem. Confira e descarte para seguir.</p>
      <ul className="mt-2 space-y-2">
        {failed.map(q => (
          <li key={q.id} className="flex items-start justify-between gap-2 rounded-lg bg-white/70 p-2 text-xs">
            <span>
              <strong>{describe(q)}</strong> · {stampLabel(q.createdAt)}
              <br />
              {q.error}
            </span>
            <button
              type="button"
              onClick={() => onDiscard(q)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-700 px-2 py-1.5 font-semibold text-white"
            >
              <Trash2 size={12} aria-hidden /> Descartar
            </button>
          </li>
        ))}
      </ul>
    </Banner>
  );
}

function describe(q: QueuedOperation): string {
  const op = q.operation;
  if (op.kind === 'photo') return op.photoKind === 'correction' ? 'Foto da correção' : 'Foto do apontamento';
  switch (op.command.type) {
    case 'create_item':
      return `Novo apontamento: ${op.command.description.slice(0, 40)}`;
    case 'resolve_item':
      return 'Finalizar apontamento';
    case 'reopen_item':
      return 'Reabrir apontamento';
  }
}

/** Abertos de uma obra baixada, com a fila do aparelho por cima só quando há fila (a conta direta no
 * pacote poupa reaplicar as regras sobre mais de mil apontamentos a cada toque). */
function openCount(pkg: FieldPackage, queue: QueuedOperation[]) {
  const items = queue.some(q => q.workId === pkg.work.id) ? localView(pkg, queue).data.items : pkg.data.items;
  return items.filter(i => i.status === 'open').length;
}

function WorkList({
  works,
  packages,
  queue,
  online,
  busy,
  onOpen,
  onReloadWorks,
}: {
  works: StoredWorks | null;
  packages: Record<string, FieldPackage>;
  queue: QueuedOperation[];
  online: boolean;
  busy: boolean;
  onOpen: (id: string) => void;
  onReloadWorks: () => void;
}) {
  const counts = useMemo(
    () => Object.fromEntries(Object.values(packages).map(pkg => [pkg.work.id, openCount(pkg, queue)])),
    [packages, queue],
  );
  if (!works)
    return (
      <div className="m-3 rounded-2xl bg-white p-6 text-center shadow-sm">
        <CloudDownload size={28} className="mx-auto text-brand-600" aria-hidden />
        <h2 className="mt-2 text-base font-semibold">Prepare com sinal</h2>
        <p className="mt-1 text-sm text-slate-600">
          Abra esta tela uma vez com internet e baixe a obra. Depois ela funciona no canteiro, sem sinal.
        </p>
        {online ? (
          <button
            type="button"
            onClick={onReloadWorks}
            disabled={busy}
            className="mt-4 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            Carregar minhas obras
          </button>
        ) : (
          <p className="mt-4 text-sm font-semibold text-amber-800">Sem sinal agora.</p>
        )}
      </div>
    );
  return (
    <div className="space-y-3 p-3">
      <p className="px-1 text-xs text-slate-500">
        {works.actor.name}
        {works.actor.tst ? ' (TST)' : ''} · obras liberadas para você. Baixe antes de ir para o canteiro.
      </p>
      {works.works.map(work => {
        const pkg = packages[work.id];
        const queued = queue.filter(q => q.workId === work.id).length;
        const open = counts[work.id];
        return (
          <button
            key={work.id}
            type="button"
            onClick={() => onOpen(work.id)}
            disabled={busy || (!pkg && !online)}
            className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm active:bg-slate-50 disabled:opacity-60"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{work.name}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {pkg ? (
                  <>
                    <Check size={12} className="mr-0.5 inline text-success" aria-hidden />
                    Pronta sem sinal · {open} {open === 1 ? 'aberto' : 'abertos'}
                    {queued > 0 && ` · ${queued} para enviar`}
                  </>
                ) : online ? (
                  'Toque para baixar e usar sem sinal'
                ) : (
                  'Não baixada: precisa de sinal'
                )}
              </p>
            </div>
            {pkg ? (
              <ChevronRight size={20} className="text-slate-400" aria-hidden />
            ) : (
              <CloudDownload size={20} className="text-brand-600" aria-hidden />
            )}
          </button>
        );
      })}
      {works.works.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Nenhuma obra liberada para você.</p>}
    </div>
  );
}

const selectClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm';

function WorkScreen({
  pkg,
  view,
  online,
  onRefresh,
  refreshing,
  act,
}: {
  pkg: FieldPackage;
  view: LocalView;
  online: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  act: Act;
}) {
  const { data } = view;
  const index = useMemo(() => indexSafety(data), [data]);
  const today = todayInSaoPaulo();
  const [filters, setFilters] = useState<SafetyFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [shown, setShown] = useState({ key: '', count: PAGE_SIZE });
  const [creating, setCreating] = useState(false);
  const [resolving, setResolving] = useState<SafetyItem | null>(null);
  const [adding, setAdding] = useState<SafetyItem | null>(null);
  const canEdit = pkg.canEdit;

  // Os contadores da situação respeitam os outros filtros: "Abertos (3)" é o que o toque vai mostrar.
  const others = useMemo(() => filterItems(data.items, filters, index, ['situation']), [data.items, filters, index]);
  const openTotal = others.filter(i => i.status === 'open').length;
  const items = useMemo(
    () => (filters.situation === 'all' ? [...others] : others.filter(i => i.status === filters.situation)).sort(compareItems(index)),
    [others, filters.situation, index],
  );
  // A página volta ao começo quando o filtro muda (sem efeito: a contagem vale para a chave do filtro).
  const filterKey = JSON.stringify(filters);
  const limit = shown.key === filterKey ? shown.count : PAGE_SIZE;
  const visible = items.slice(0, limit);

  const typeOptions = useMemo(() => {
    const used = new Set(data.items.map(i => i.typeId));
    return data.types.filter(t => t.active || used.has(t.id)).sort((a, b) => a.orderIndex - b.orderIndex);
  }, [data.items, data.types]);
  const hasUntyped = useMemo(() => data.items.some(i => !i.typeId || !index.types.has(i.typeId)), [data.items, index]);
  const locations = useMemo(() => locationOptions(data.items), [data.items]);
  const hasNoLocation = useMemo(() => data.items.some(i => !locationKey(i.location)), [data.items]);
  const extraFilters = filters.typeIds.length + filters.consequences.length + filters.locations.length;
  const setSituation = (situation: SafetySituation) => setFilters(f => ({ ...f, situation }));
  const initialLocation =
    filters.locations[0] && filters.locations[0] !== NONE ? (index.locationLabels.get(filters.locations[0]) ?? '') : '';

  return (
    <>
      <div className="sticky top-[4.25rem] z-20 space-y-2 bg-slate-100 px-3 pb-2 pt-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 text-sm shadow-sm" role="group" aria-label="Situação">
          {(
            [
              ['open', `Abertos (${openTotal})`],
              ['resolved', `Finalizados (${others.length - openTotal})`],
              ['all', 'Todos'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filters.situation === value}
              onClick={() => setSituation(value)}
              className={`rounded-lg py-2 font-semibold ${filters.situation === value ? 'bg-primary text-white' : 'text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="relative block flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <span className="sr-only">Buscar</span>
            <input
              type="search"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm"
              placeholder="Buscar na descrição ou no local"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowFilters(v => !v)}
            aria-expanded={showFilters}
            className={`inline-flex h-11 shrink-0 items-center gap-1 rounded-xl border px-3 text-sm font-semibold ${extraFilters ? 'border-primary bg-brand-50 text-brand-800' : 'border-slate-200 bg-white text-slate-700'}`}
          >
            <SlidersHorizontal size={16} aria-hidden />
            Filtros{extraFilters ? ` · ${extraFilters}` : ''}
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Tipo de apontamento"
              className={`${selectClass} col-span-2`}
              value={filters.typeIds[0] ?? ''}
              onChange={e => setFilters(f => ({ ...f, typeIds: e.target.value ? [e.target.value] : [] }))}
            >
              <option value="">Todos os tipos</option>
              {typeOptions.map(t => (
                <option key={t.id} value={t.id}>
                  {t.active ? t.name : `${t.name} (desativado)`}
                </option>
              ))}
              {hasUntyped && <option value={NONE}>{NO_TYPE_LABEL}</option>}
            </select>
            <select
              aria-label="Risco: consequência"
              className={selectClass}
              value={filters.consequences[0] ?? ''}
              onChange={e => setFilters(f => ({ ...f, consequences: e.target.value ? [e.target.value as SafetyConsequence] : [] }))}
            >
              <option value="">Toda consequência</option>
              {SAFETY_CONSEQUENCES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              aria-label="Local"
              className={selectClass}
              value={filters.locations[0] ?? ''}
              onChange={e => setFilters(f => ({ ...f, locations: e.target.value ? [e.target.value] : [] }))}
            >
              <option value="">Todos os locais</option>
              {locations.map(l => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
              {hasNoLocation && <option value={NONE}>{NO_LOCATION_LABEL}</option>}
            </select>
            {extraFilters > 0 && (
              <button
                type="button"
                onClick={() => setFilters(f => ({ ...DEFAULT_FILTERS, situation: f.situation, search: f.search }))}
                className="col-span-2 justify-self-start text-xs font-semibold text-brand-700 underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      <ul className="space-y-2 px-3">
        {visible.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            index={index}
            today={today}
            photos={photosOf(index, item.id)}
            pending={view.pendingItems.has(item.id)}
            pendingPhotos={view.pendingPhotos}
            canEdit={canEdit}
            onResolve={() => setResolving(item)}
            onAddPhoto={() => setAdding(item)}
            onReopen={() =>
              void act(
                current => enqueue(current, { kind: 'command', command: { type: 'reopen_item', itemId: item.id } }),
                'Apontamento reaberto.',
              )
            }
          />
        ))}
      </ul>
      {items.length > visible.length && (
        <p className="p-3 text-center">
          <button
            type="button"
            onClick={() => setShown({ key: filterKey, count: limit + PAGE_SIZE })}
            className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            Mostrar mais ({items.length - visible.length} {items.length - visible.length === 1 ? 'restante' : 'restantes'})
          </button>
        </p>
      )}
      {items.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">
          {data.items.length === 0 ? 'Nenhum apontamento lançado nesta obra.' : 'Nenhum apontamento neste filtro.'}
        </p>
      ) : (
        <p className="px-3 pt-1 text-center text-xs text-slate-500">
          Mostrando {visible.length} de {items.length}
        </p>
      )}
      {online && (
        <p className="p-4 text-center">
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="text-xs font-semibold text-brand-700 underline disabled:opacity-50"
          >
            {refreshing ? 'Atualizando…' : 'Atualizar a obra com o que está no servidor'}
          </button>
        </p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-white shadow-xl active:scale-95"
        >
          <Plus size={20} aria-hidden /> Novo apontamento
        </button>
      )}
      {creating && <NewItemSheet view={view} initialLocation={initialLocation} onClose={() => setCreating(false)} act={act} />}
      {resolving && <ResolveSheet item={resolving} view={view} onClose={() => setResolving(null)} act={act} />}
      {adding && <AddPhotoSheet item={adding} view={view} onClose={() => setAdding(null)} act={act} />}
    </>
  );
}

/** Cor da consequência, da mais grave para a mais leve; "Autuação/Multa" é a consequência legal. */
const CONSEQUENCE_TONES: Record<SafetyConsequence, string> = {
  Morte: 'bg-rose-700 text-white',
  Severa: 'bg-rose-100 text-rose-900',
  Significativa: 'bg-amber-100 text-amber-900',
  Leve: 'bg-yellow-50 text-yellow-900',
  Nenhuma: 'bg-slate-100 text-slate-700',
  'Autuação/Multa': 'bg-violet-100 text-violet-900',
};

function ItemCard({
  item,
  index,
  today,
  photos,
  pending,
  pendingPhotos,
  canEdit,
  onResolve,
  onAddPhoto,
  onReopen,
}: {
  item: SafetyItem;
  index: SafetyIndex;
  today: string;
  photos: SafetyPhoto[];
  pending: boolean;
  pendingPhotos: Set<string>;
  canEdit: boolean;
  onResolve: () => void;
  onAddPhoto: () => void;
  onReopen: () => void;
}) {
  const type = typeName(index, item) || NO_TYPE_LABEL;
  const local = locationLabel(index, item);
  const days = safetyDays(item, today);
  return (
    <li className={`rounded-2xl bg-white p-3 shadow-sm ${item.status === 'resolved' ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-brand-700">
          {type}
          {local ? ` · ${local}` : ''}
        </p>
        <span className="flex shrink-0 gap-1">
          {pending && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">no aparelho</span>}
          {item.status === 'resolved' ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
              Finalizado {dateLabel(item.correctedOn)}
            </span>
          ) : (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-900">Aberto</span>
          )}
        </span>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] font-semibold">
        <span className="text-slate-500">Risco:</span>
        <span className={`rounded-full px-2 py-0.5 ${CONSEQUENCE_TONES[item.consequence] ?? 'bg-slate-100 text-slate-700'}`}>
          {item.consequence}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{item.probability}</span>
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{item.description}</p>
      {item.status === 'resolved' && item.resolutionNote && (
        <p className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
          Correção: {item.resolutionNote}
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Apontado em {dateLabel(item.observedOn)}
        {item.status === 'open' ? ` · aberto há ${daysText(days)}` : ` · ${daysText(days)} para resolver`}
      </p>
      {photos.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {photos.map(photo => (
            <Thumb key={photo.id} photo={photo} local={pendingPhotos.has(photo.id)} />
          ))}
        </div>
      )}
      {canEdit && (
        <div className="mt-3 flex gap-2">
          {item.status === 'open' ? (
            <>
              <button type="button" onClick={onResolve} className="h-11 flex-1 rounded-xl bg-emerald-700 text-sm font-semibold text-white">
                Finalizar
              </button>
              <button
                type="button"
                onClick={onAddPhoto}
                className="inline-flex h-11 items-center gap-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700"
              >
                <Camera size={16} aria-hidden /> Foto
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onReopen}
              className="inline-flex h-11 items-center gap-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700"
            >
              <RotateCcw size={16} aria-hidden /> Reabrir
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** Miniatura: a do aparelho (foto ainda não enviada ou guardada ao baixar a obra) e, com sinal, a do
 * servidor. Sem nenhuma das duas, um aviso no lugar da imagem. */
function Thumb({ photo, local }: { photo: SafetyPhoto; local: boolean }) {
  const online = useOnline();
  const [src, setSrc] = useState<string>('');
  const [failed, setFailed] = useState(false);
  // Enquanto lê do aparelho, um quadro neutro: "sem sinal" só quando não há mesmo de onde mostrar.
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let url = '';
    let active = true;
    void (async () => {
      const blob = local ? (await readPhoto(photo.id))?.thumb : await readThumb(photo.id);
      if (!active) return;
      if (blob) {
        url = URL.createObjectURL(blob);
        setSrc(url);
      } else if (photo.thumbUrl) setSrc(photo.thumbUrl);
      setLoading(false);
    })();
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo.id, photo.thumbUrl, local]);
  const label = photo.kind === 'correction' ? 'Foto da correção' : 'Foto do apontamento';
  return (
    <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : loading ? (
        <span className="block h-full w-full animate-pulse bg-slate-200" aria-label={`${label}: carregando`} />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] text-slate-500">
          <ImageOff size={16} aria-hidden /> {online ? 'indisponível' : 'sem sinal'}
        </span>
      )}
      {photo.kind === 'correction' && (
        <span className="absolute bottom-0 inset-x-0 bg-emerald-700/90 text-center text-[10px] font-semibold text-white">correção</span>
      )}
    </span>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-slate-900/50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const fieldClass = 'mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base';
const labelClass = 'block text-sm font-semibold text-slate-700';

type Prepared = { image: Blob; thumb: Blob; width: number; height: number; preview: string };

/** Fotos tiradas pela câmera do celular, já comprimidas (≈1600 px, ≈300 KB) e com miniatura, pela mesma
 * compressão da terminalidade. `max` = quantas ainda cabem no apontamento. `reservesCorrection`: as fotos
 * do apontamento aberto, que guardam uma vaga para a foto da correção (`issuePhotoRoom`); o aviso de limite
 * diz isso, em vez de citar dez fotos quando só cabem nove. */
function PhotoPicker({
  photos,
  onChange,
  label,
  max,
  reservesCorrection = false,
}: {
  photos: Prepared[];
  onChange: (photos: Prepared[]) => void;
  label: string;
  max: number;
  reservesCorrection?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const room = Math.max(0, max - photos.length);
  return (
    <div className="mt-3">
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {photos.map((photo, i) => (
          <span key={photo.preview} className="relative h-20 w-20 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.preview} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label={`Tirar a foto ${i + 1}`}
              onClick={() => {
                URL.revokeObjectURL(photo.preview);
                onChange(photos.filter((_, j) => j !== i));
              }}
              className="absolute right-0.5 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/70 text-white"
            >
              <X size={14} aria-hidden />
            </button>
          </span>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={working}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs font-semibold text-slate-600 disabled:opacity-50"
          >
            <Camera size={20} aria-hidden />
            {working ? '…' : 'Câmera'}
          </button>
        )}
      </div>
      {room === 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {reservesCorrection
            ? `Limite de ${SAFETY_LIMITS.maxPhotosPerItem - 1} fotos do apontamento: a última vaga fica para a foto da correção.`
            : `Limite de ${SAFETY_LIMITS.maxPhotosPerItem} fotos por apontamento.`}
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={async e => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (!files.length) return;
          setWorking(true);
          setError('');
          const ready: Prepared[] = [];
          for (const file of files.slice(0, room))
            try {
              const done = await compressImage(file);
              ready.push({ ...done, preview: URL.createObjectURL(done.thumb) });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Não foi possível usar a foto.');
            }
          if (files.length > room) setError(`Cabem só mais ${room} ${room === 1 ? 'foto' : 'fotos'} neste apontamento.`);
          onChange([...photos, ...ready]);
          setWorking(false);
        }}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** Põe as fotos na fila uma a uma. `onQueued` tira do formulário a que já entrou, para uma nova
 * tentativa (depois de uma recusa no meio) não guardar a mesma foto duas vezes. */
async function enqueuePhotos(
  pkg: FieldPackage,
  itemId: string,
  kind: SafetyPhotoKind,
  photos: Prepared[],
  onQueued: (photo: Prepared) => void,
) {
  for (const photo of photos) {
    await enqueue(
      pkg,
      {
        kind: 'photo',
        itemId,
        photoId: crypto.randomUUID(),
        photoKind: kind,
        width: photo.width,
        height: photo.height,
        bytes: photo.image.size,
      },
      { image: photo.image, thumb: photo.thumb },
    );
    onQueued(photo);
  }
}

/** Estado das fotos do formulário com a retirada da que já entrou na fila. */
function usePreparedPhotos() {
  const [photos, setPhotos] = useState<Prepared[]>([]);
  const queued = useCallback((photo: Prepared) => {
    URL.revokeObjectURL(photo.preview);
    setPhotos(current => current.filter(p => p !== photo));
  }, []);
  return [photos, setPhotos, queued] as const;
}

const photoRoom = (view: LocalView, itemId: string) =>
  SAFETY_LIMITS.maxPhotosPerItem - view.data.photos.filter(p => p.itemId === itemId).length;
/** Vagas para fotos do apontamento: enquanto ele está aberto, uma fica reservada para a foto da correção,
 * como no computador. Sem isso, dez fotos do apontamento impediam finalizar em qualquer lugar. */
const issuePhotoRoom = (view: LocalView, itemId?: string) => {
  const item = itemId ? view.data.items.find(i => i.id === itemId) : undefined;
  const room = itemId ? photoRoom(view, itemId) : SAFETY_LIMITS.maxPhotosPerItem;
  return Math.max(0, room - (item?.status === 'resolved' ? 0 : 1));
};

function NewItemSheet({
  view,
  initialLocation,
  onClose,
  act,
}: {
  view: LocalView;
  initialLocation: string;
  onClose: () => void;
  act: Act;
}) {
  const { data } = view;
  // O id nasce com o formulário: se a gravação parar no meio, tentar de novo não cria outro apontamento.
  const [itemId] = useState(() => crypto.randomUUID());
  const [typeId, setTypeId] = useState('');
  const [consequence, setConsequence] = useState<SafetyConsequence | ''>('');
  const [probability, setProbability] = useState<SafetyProbability | ''>('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(initialLocation);
  const [observedOn, setObservedOn] = useState(todayInSaoPaulo());
  const [photos, setPhotos, photoQueued] = usePreparedPhotos();
  const [saving, setSaving] = useState(false);
  const types = data.types.filter(t => t.active).sort((a, b) => a.orderIndex - b.orderIndex);
  const options = useMemo(() => locationOptions(data.items), [data.items]);
  const typed = locationKey(location);
  const suggestions = options.filter(o => o.key !== typed && (!typed || o.key.includes(typed))).slice(0, 6);
  const created = data.items.some(i => i.id === itemId);
  return (
    <Sheet title="Novo apontamento" onClose={onClose}>
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (saving || !consequence || !probability) return;
          setSaving(true);
          const ok = await act(async current => {
            // Já criado numa tentativa anterior (na fila ou já enviado): falta só guardar as fotos.
            if (!created)
              await enqueue(current, {
                kind: 'command',
                command: {
                  type: 'create_item',
                  workId: current.work.id,
                  itemId,
                  typeId: typeId || undefined,
                  consequence,
                  probability,
                  description,
                  location,
                  observedOn,
                },
              });
            await enqueuePhotos(current, itemId, 'issue', photos, photoQueued);
          }, 'Apontamento lançado.');
          setSaving(false);
          if (ok) onClose();
        }}
      >
        <label className={labelClass}>
          Tipo de apontamento
          <select
            required={types.length > 0}
            className={fieldClass}
            value={typeId}
            disabled={created}
            onChange={e => setTypeId(e.target.value)}
          >
            <option value="">{types.length ? 'Escolha' : '—'}</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className={labelClass}>
            Risco: consequência
            <select
              required
              className={fieldClass}
              value={consequence}
              disabled={created}
              onChange={e => setConsequence(e.target.value as SafetyConsequence | '')}
            >
              <option value="">Escolha</option>
              {SAFETY_CONSEQUENCES.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            Risco: probabilidade
            <select
              required
              className={fieldClass}
              value={probability}
              disabled={created}
              onChange={e => setProbability(e.target.value as SafetyProbability | '')}
            >
              <option value="">Escolha</option>
              {SAFETY_PROBABILITIES.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={`mt-3 ${labelClass}`}>
          Descrição
          <textarea
            required
            maxLength={SAFETY_LIMITS.maxDescription}
            disabled={created}
            className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 text-base"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </label>
        <label className={`mt-3 ${labelClass}`}>
          Local
          <input
            list="safety-field-locations"
            maxLength={SAFETY_LIMITS.maxLocation}
            disabled={created}
            className={fieldClass}
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="Ex.: Térreo, 2° Pavimento, Canteiro"
          />
          <datalist id="safety-field-locations">
            {options.map(o => (
              <option key={o.key} value={o.label} />
            ))}
          </datalist>
        </label>
        {!created && suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Locais já usados nesta obra">
            {suggestions.map(o => (
              <button
                key={o.key}
                type="button"
                onClick={() => setLocation(o.label)}
                className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        <label className={`mt-3 ${labelClass}`}>
          Data do apontamento
          <input
            type="date"
            required
            max={todayInSaoPaulo()}
            disabled={created}
            className={fieldClass}
            value={observedOn}
            onChange={e => setObservedOn(e.target.value)}
          />
        </label>
        <PhotoPicker
          photos={photos}
          onChange={setPhotos}
          label="Foto do apontamento (obrigatória)"
          max={issuePhotoRoom(view, created ? itemId : undefined)}
          reservesCorrection
        />
        <button
          type="submit"
          disabled={saving || photos.length === 0}
          className="mt-5 w-full rounded-xl bg-primary py-3.5 text-base font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Lançar apontamento'}
        </button>
      </form>
    </Sheet>
  );
}

function ResolveSheet({ item, view, onClose, act }: { item: SafetyItem; view: LocalView; onClose: () => void; act: Act }) {
  const [correctedOn, setCorrectedOn] = useState(todayInSaoPaulo());
  const [note, setNote] = useState('');
  const [photos, setPhotos, photoQueued] = usePreparedPhotos();
  const [saving, setSaving] = useState(false);
  const hasCorrection = view.data.photos.some(p => p.itemId === item.id && p.kind === 'correction');
  return (
    <Sheet title="Finalizar apontamento" onClose={onClose}>
      <p className="text-sm text-slate-700">{item.description}</p>
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          const ok = await act(async current => {
            await enqueuePhotos(current, item.id, 'correction', photos, photoQueued);
            await enqueue(current, {
              kind: 'command',
              command: { type: 'resolve_item', itemId: item.id, correctedOn, ...(note.trim() ? { resolutionNote: note.trim() } : {}) },
            });
          }, 'Apontamento finalizado.');
          setSaving(false);
          if (ok) onClose();
        }}
      >
        <label className={`mt-3 ${labelClass}`}>
          Data de correção
          <input
            type="date"
            required
            min={item.observedOn}
            max={todayInSaoPaulo()}
            className={fieldClass}
            value={correctedOn}
            onChange={e => setCorrectedOn(e.target.value)}
          />
        </label>
        <label className={`mt-3 ${labelClass}`}>
          Como foi corrigido <span className="font-normal text-slate-500">(opcional)</span>
          <textarea
            maxLength={SAFETY_LIMITS.maxResolutionNote}
            className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-base"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="O que foi feito, por quem"
          />
        </label>
        <PhotoPicker
          photos={photos}
          onChange={setPhotos}
          label={hasCorrection ? 'Mais fotos da correção (opcional)' : 'Foto da correção (obrigatória)'}
          max={photoRoom(view, item.id)}
        />
        <button
          type="submit"
          disabled={saving || (!hasCorrection && photos.length === 0)}
          className="mt-5 w-full rounded-xl bg-emerald-700 py-3.5 text-base font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Finalizar apontamento'}
        </button>
      </form>
    </Sheet>
  );
}

function AddPhotoSheet({ item, view, onClose, act }: { item: SafetyItem; view: LocalView; onClose: () => void; act: Act }) {
  const [photos, setPhotos, photoQueued] = usePreparedPhotos();
  const [saving, setSaving] = useState(false);
  return (
    <Sheet title="Foto do apontamento" onClose={onClose}>
      <p className="text-sm text-slate-700">{item.description}</p>
      <PhotoPicker
        photos={photos}
        onChange={setPhotos}
        label="Fotos"
        max={issuePhotoRoom(view, item.id)}
        reservesCorrection={item.status !== 'resolved'}
      />
      <button
        type="button"
        disabled={saving || photos.length === 0}
        onClick={async () => {
          setSaving(true);
          const many = photos.length > 1;
          const ok = await act(
            current => enqueuePhotos(current, item.id, 'issue', photos, photoQueued),
            many ? 'Fotos guardadas.' : 'Foto guardada.',
          );
          setSaving(false);
          if (ok) onClose();
        }}
        className="mt-5 w-full rounded-xl bg-primary py-3.5 text-base font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Guardando…' : 'Guardar'}
      </button>
    </Sheet>
  );
}

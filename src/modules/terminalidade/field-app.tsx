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
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import type { TerminalityItem, TerminalityPhoto, TerminalityPhotoKind } from '@/domain/terminality';
import { compareFloors, compareItems, indexTerminality, unitOptions, type TerminalityIndex } from './terminality-view';
import { compressImage } from './compress-image';
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

/* Terminalidade em campo: a mesma lista de pendências da aba 5, para o celular e sem sinal, no
 * desenho da vistoria da Obra do Mês (App-ATR). Baixa-se a obra com sinal; depois tudo abre em modo
 * avião, o que é lançado vai para a fila do aparelho e sobe sozinho quando a conexão volta. Aqui só
 * o que se faz andando pelo prédio: lançar pendência com foto, juntar foto, resolver com a foto da
 * correção e reabrir. Cadastros, edição e exclusão ficam na aba 5, no computador. */

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

const dateLabel = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
const stampLabel = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const LOGIN_URL = '/login?redirect=%2Fcampo%2Fterminalidade';

type Toast = { text: string; tone: 'ok' | 'error' } | null;

export function FieldTerminality() {
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
    window.history.replaceState(null, '', `/campo/terminalidade?obra=${encodeURIComponent(id)}`);
  }

  const pkg = workId ? packages[workId] : undefined;
  const view = useMemo(() => (pkg ? localView(pkg, queue) : undefined), [pkg, queue]);
  const failed = queue.filter(q => q.error);

  async function act(run: (pkg: FieldPackage) => Promise<void>, success: string) {
    if (!pkg) return false;
    try {
      await run(pkg);
      setQueue(await readQueue());
      show(navigator.onLine ? success : `${success} Fica no aparelho até o sinal voltar.`);
      if (navigator.onLine) void syncNow(true);
      return true;
    } catch (error) {
      show(error instanceof Error ? error.message : 'Não foi possível registrar.', 'error');
      return false;
    }
  }

  return (
    <div className="min-h-dvh bg-slate-100 pb-28 font-sans text-slate-900">
      <Header
        title={pkg ? pkg.work.name : 'Terminalidade em campo'}
        subtitle={pkg ? `Baixada em ${stampLabel(pkg.savedAt)}` : 'Lista de pendências no celular, com ou sem sinal'}
        online={online}
        pending={queue.length}
        syncing={busy === 'sync'}
        onBack={pkg ? () => setWorkId('') : undefined}
        onSync={() => void syncNow()}
      />
      {needsLogin && (
        <Banner tone="warning">
          Sua sessão expirou. O que foi lançado continua guardado neste aparelho.{' '}
          <a href={LOGIN_URL} className="inline-flex items-center gap-1 font-semibold underline">
            <LogIn size={14} aria-hidden /> Entrar de novo
          </a>
        </Banner>
      )}
      {failed.length > 0 && <FailedOperations failed={failed} onDiscard={async q => (await discard(q), setQueue(await readQueue()))} />}
      {!loaded ? (
        <p className="p-6 text-center text-sm text-slate-500">Abrindo…</p>
      ) : pkg && view ? (
        <WorkScreen
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

function Banner({ tone, children }: { tone: 'warning' | 'error'; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={`mx-3 mt-3 rounded-xl px-4 py-3 text-sm ${tone === 'warning' ? 'bg-amber-100 text-amber-950' : 'bg-rose-100 text-rose-900'}`}
    >
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
  if (op.kind === 'photo') return op.photoKind === 'correction' ? 'Foto da correção' : 'Foto da pendência';
  switch (op.command.type) {
    case 'create_item':
      return `Nova pendência: ${op.command.description.slice(0, 40)}`;
    case 'resolve_item':
      return 'Resolver pendência';
    case 'reopen_item':
      return 'Reabrir pendência';
    default:
      return 'Alteração';
  }
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
      <p className="px-1 text-xs text-slate-500">{works.actor.name} · obras liberadas para você. Baixe antes de ir para o canteiro.</p>
      {works.works.map(work => {
        const pkg = packages[work.id];
        const queued = queue.filter(q => q.workId === work.id).length;
        const open = pkg ? localView(pkg, queue).data.items.filter(i => i.status === 'open').length : undefined;
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
                    Pronta sem sinal · {open} {open === 1 ? 'aberta' : 'abertas'}
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

type Situation = 'open' | 'resolved' | 'all';

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
  act: (run: (pkg: FieldPackage) => Promise<void>, success: string) => Promise<boolean>;
}) {
  const { data } = view;
  const index = useMemo(() => indexTerminality(data), [data]);
  const [floorId, setFloorId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [situation, setSituation] = useState<Situation>('open');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [resolving, setResolving] = useState<TerminalityItem | null>(null);
  const [adding, setAdding] = useState<TerminalityItem | null>(null);
  const readOnly = pkg.actor.role === 'viewer';
  const floors = useMemo(() => [...data.floors].sort(compareFloors), [data.floors]);
  const units = useMemo(() => (floorId ? unitOptions(data, floorId) : []), [data, floorId]);
  const normalized = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const items = useMemo(() => {
    const tokens = normalized(query).split(/\s+/).filter(Boolean);
    return data.items
      .filter(
        item =>
          (situation === 'all' || item.status === situation) &&
          (!floorId || item.floorId === floorId) &&
          (!unitId || item.unitId === unitId) &&
          tokens.every(token => normalized(item.description).includes(token)),
      )
      .sort(compareItems(index));
  }, [data.items, situation, floorId, unitId, query, index]);
  const openCount = data.items.filter(i => i.status === 'open').length;

  return (
    <>
      <div className="sticky top-[4.25rem] z-20 space-y-2 bg-slate-100 px-3 pb-2 pt-3">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 text-sm shadow-sm" role="group" aria-label="Situação">
          {(
            [
              ['open', `Abertas (${openCount})`],
              ['resolved', `Resolvidas (${data.items.length - openCount})`],
              ['all', 'Todas'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={situation === value}
              onClick={() => setSituation(value)}
              className={`rounded-lg py-2 font-semibold ${situation === value ? 'bg-primary text-white' : 'text-slate-600'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            aria-label="Pavimento"
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            value={floorId}
            onChange={e => {
              setFloorId(e.target.value);
              setUnitId('');
            }}
          >
            <option value="">Todos os pavimentos</option>
            {floors.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Unidade"
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm disabled:opacity-50"
            value={unitId}
            disabled={!floorId}
            onChange={e => setUnitId(e.target.value)}
          >
            <option value="">{floorId ? 'Todo o pavimento' : 'Escolha o pavimento'}</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <label className="relative block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <span className="sr-only">Buscar na descrição</span>
          <input
            type="search"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm"
            placeholder="Buscar na descrição"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
      </div>

      <ul className="space-y-2 px-3">
        {items.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            index={index}
            photos={data.photos.filter(p => p.itemId === item.id)}
            pending={view.pendingItems.has(item.id)}
            pendingPhotos={view.pendingPhotos}
            readOnly={readOnly}
            onResolve={() => setResolving(item)}
            onAddPhoto={() => setAdding(item)}
            onReopen={() =>
              void act(pkg => enqueue(pkg, { kind: 'command', command: { type: 'reopen_item', itemId: item.id } }), 'Pendência reaberta.')
            }
          />
        ))}
      </ul>
      {items.length === 0 && (
        <p className="p-6 text-center text-sm text-slate-500">
          {data.items.length === 0 ? 'Nenhuma pendência lançada nesta obra.' : 'Nenhuma pendência neste filtro.'}
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

      {!readOnly && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-base font-semibold text-white shadow-xl active:scale-95"
        >
          <Plus size={20} aria-hidden /> Nova pendência
        </button>
      )}
      {creating && (
        <NewItemSheet pkg={pkg} view={view} initialFloor={floorId} initialUnit={unitId} onClose={() => setCreating(false)} act={act} />
      )}
      {resolving && <ResolveSheet item={resolving} view={view} onClose={() => setResolving(null)} act={act} />}
      {adding && <AddPhotoSheet item={adding} onClose={() => setAdding(null)} act={act} />}
    </>
  );
}

function ItemCard({
  item,
  index,
  photos,
  pending,
  pendingPhotos,
  readOnly,
  onResolve,
  onAddPhoto,
  onReopen,
}: {
  item: TerminalityItem;
  index: TerminalityIndex;
  photos: TerminalityPhoto[];
  pending: boolean;
  pendingPhotos: Set<string>;
  readOnly: boolean;
  onResolve: () => void;
  onAddPhoto: () => void;
  onReopen: () => void;
}) {
  const floor = index.floors.get(item.floorId)?.name ?? '';
  const unit = item.unitId ? index.units.get(item.unitId)?.name : '';
  const type = item.typeId ? index.types.get(item.typeId)?.name : '';
  const person = item.atrPersonId ? index.people.get(item.atrPersonId)?.name : '';
  return (
    <li className={`rounded-2xl bg-white p-3 shadow-sm ${item.status === 'resolved' ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-brand-700">
          {floor}
          {unit ? ` · ${unit}` : ''}
          {type ? ` · ${type}` : ''}
        </p>
        <span className="flex shrink-0 gap-1">
          {pending && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">no aparelho</span>}
          {item.status === 'resolved' ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
              Resolvida {dateLabel(item.correctedOn)}
            </span>
          ) : (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-900">Aberta</span>
          )}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{item.description}</p>
      <p className="mt-1 text-xs text-slate-500">
        Observada em {dateLabel(item.observedOn)}
        {person ? ` · ATR: ${person}` : ''}
        {item.contractor ? ` · ${item.contractor}` : ''}
      </p>
      {photos.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {photos.map(photo => (
            <Thumb key={photo.id} photo={photo} local={pendingPhotos.has(photo.id)} />
          ))}
        </div>
      )}
      {!readOnly && (
        <div className="mt-3 flex gap-2">
          {item.status === 'open' ? (
            <>
              <button type="button" onClick={onResolve} className="h-11 flex-1 rounded-xl bg-emerald-700 text-sm font-semibold text-white">
                Resolver
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
function Thumb({ photo, local }: { photo: TerminalityPhoto; local: boolean }) {
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
  const label = photo.kind === 'correction' ? 'Foto da correção' : 'Foto da pendência';
  return (
    <span className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : loading ? (
        <span className="block h-full w-full animate-pulse bg-slate-200" aria-label={`${label}: carregando`} />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] text-slate-500">
          <ImageOff size={16} aria-hidden /> sem sinal
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
        <div className="mb-3 flex items-center justify-between">
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

type Prepared = { image: Blob; thumb: Blob; width: number; height: number; preview: string };

/** Fotos tiradas pela câmera do celular, já comprimidas (≈1600 px, ≈300 KB) e com miniatura. */
function PhotoPicker({ photos, onChange, label }: { photos: Prepared[]; onChange: (photos: Prepared[]) => void; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
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
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={working}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs font-semibold text-slate-600 disabled:opacity-50"
        >
          <Camera size={20} aria-hidden />
          {working ? '…' : 'Câmera'}
        </button>
      </div>
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
          for (const file of files)
            try {
              const done = await compressImage(file);
              ready.push({ ...done, preview: URL.createObjectURL(done.thumb) });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Não foi possível usar a foto.');
            }
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

async function enqueuePhotos(pkg: FieldPackage, itemId: string, kind: TerminalityPhotoKind, photos: Prepared[]) {
  for (const photo of photos)
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
}

function NewItemSheet({
  pkg,
  view,
  initialFloor,
  initialUnit,
  onClose,
  act,
}: {
  pkg: FieldPackage;
  view: LocalView;
  initialFloor: string;
  initialUnit: string;
  onClose: () => void;
  act: (run: (pkg: FieldPackage) => Promise<void>, success: string) => Promise<boolean>;
}) {
  const { data } = view;
  const [floorId, setFloorId] = useState(initialFloor);
  const [unitId, setUnitId] = useState(initialUnit);
  const [description, setDescription] = useState('');
  const [typeId, setTypeId] = useState('');
  const [personId, setPersonId] = useState('');
  const [contractor, setContractor] = useState('');
  const [observedOn, setObservedOn] = useState(todayInSaoPaulo());
  const [photos, setPhotos] = useState<Prepared[]>([]);
  const [saving, setSaving] = useState(false);
  const floors = [...data.floors].sort(compareFloors);
  const units = floorId ? unitOptions(data, floorId) : [];
  const types = data.types.filter(t => t.active).sort((a, b) => a.orderIndex - b.orderIndex);
  const people = data.people.filter(p => p.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return (
    <Sheet title="Nova pendência" onClose={onClose}>
      {floors.length === 0 ? (
        <p className="text-sm text-slate-600">
          Esta obra ainda não tem pavimentos cadastrados. O cadastro é feito no computador, em Configurações da obra.
        </p>
      ) : (
        <form
          onSubmit={async e => {
            e.preventDefault();
            if (saving) return;
            setSaving(true);
            const itemId = crypto.randomUUID();
            const ok = await act(async current => {
              await enqueue(current, {
                kind: 'command',
                command: {
                  type: 'create_item',
                  workId: current.work.id,
                  itemId,
                  floorId,
                  unitId: unitId || undefined,
                  description,
                  typeId: typeId || undefined,
                  observedOn,
                  atrPersonId: personId || undefined,
                  contractor: contractor.trim() || undefined,
                },
              });
              await enqueuePhotos(current, itemId, 'issue', photos);
            }, 'Pendência lançada.');
            setSaving(false);
            if (ok) onClose();
          }}
        >
          <label className="block text-sm font-semibold text-slate-700">
            Pavimento
            <select required className={fieldClass} value={floorId} onChange={e => (setFloorId(e.target.value), setUnitId(''))}>
              <option value="">Escolha</option>
              {floors.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-semibold text-slate-700">
            Apto ou área
            <select className={fieldClass} value={unitId} disabled={!floorId} onChange={e => setUnitId(e.target.value)}>
              <option value="">Do pavimento todo</option>
              {units.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-semibold text-slate-700">
            Descrição
            <textarea
              required
              maxLength={1000}
              className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 text-base"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block text-sm font-semibold text-slate-700">
              Tipo
              <select className={fieldClass} value={typeId} onChange={e => setTypeId(e.target.value)}>
                <option value="">—</option>
                {types.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Observada em
              <input
                type="date"
                required
                max={todayInSaoPaulo()}
                className={fieldClass}
                value={observedOn}
                onChange={e => setObservedOn(e.target.value)}
              />
            </label>
          </div>
          <label className="mt-3 block text-sm font-semibold text-slate-700">
            Responsável ATR
            <select className={fieldClass} value={personId} onChange={e => setPersonId(e.target.value)}>
              <option value="">—</option>
              {people.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm font-semibold text-slate-700">
            Responsável terceiro
            <input
              list="field-companies"
              className={fieldClass}
              value={contractor}
              onChange={e => setContractor(e.target.value)}
              placeholder="Empresa"
            />
            <datalist id="field-companies">
              {pkg.companies.map(company => (
                <option key={company} value={company} />
              ))}
            </datalist>
          </label>
          <PhotoPicker photos={photos} onChange={setPhotos} label="Fotos da pendência" />
          <button
            type="submit"
            disabled={saving}
            className="mt-5 h-13 w-full rounded-xl bg-primary py-3.5 text-base font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Lançar pendência'}
          </button>
        </form>
      )}
    </Sheet>
  );
}

function ResolveSheet({
  item,
  view,
  onClose,
  act,
}: {
  item: TerminalityItem;
  view: LocalView;
  onClose: () => void;
  act: (run: (pkg: FieldPackage) => Promise<void>, success: string) => Promise<boolean>;
}) {
  const [correctedOn, setCorrectedOn] = useState(todayInSaoPaulo());
  const [photos, setPhotos] = useState<Prepared[]>([]);
  const [saving, setSaving] = useState(false);
  const hasCorrection = view.data.photos.some(p => p.itemId === item.id && p.kind === 'correction');
  return (
    <Sheet title="Resolver pendência" onClose={onClose}>
      <p className="text-sm text-slate-700">{item.description}</p>
      <form
        onSubmit={async e => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          const ok = await act(async current => {
            await enqueuePhotos(current, item.id, 'correction', photos);
            await enqueue(current, { kind: 'command', command: { type: 'resolve_item', itemId: item.id, correctedOn } });
          }, 'Pendência resolvida.');
          setSaving(false);
          if (ok) onClose();
        }}
      >
        <label className="mt-3 block text-sm font-semibold text-slate-700">
          Corrigida em
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
        <PhotoPicker
          photos={photos}
          onChange={setPhotos}
          label={hasCorrection ? 'Mais fotos da correção (opcional)' : 'Foto da correção (obrigatória)'}
        />
        <button
          type="submit"
          disabled={saving || (!hasCorrection && photos.length === 0)}
          className="mt-5 w-full rounded-xl bg-emerald-700 py-3.5 text-base font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Marcar como resolvida'}
        </button>
      </form>
    </Sheet>
  );
}

function AddPhotoSheet({
  item,
  onClose,
  act,
}: {
  item: TerminalityItem;
  onClose: () => void;
  act: (run: (pkg: FieldPackage) => Promise<void>, success: string) => Promise<boolean>;
}) {
  const [photos, setPhotos] = useState<Prepared[]>([]);
  const [saving, setSaving] = useState(false);
  return (
    <Sheet title="Foto da pendência" onClose={onClose}>
      <p className="text-sm text-slate-700">{item.description}</p>
      <PhotoPicker photos={photos} onChange={setPhotos} label="Fotos" />
      <button
        type="button"
        disabled={saving || photos.length === 0}
        onClick={async () => {
          setSaving(true);
          const ok = await act(
            current => enqueuePhotos(current, item.id, 'issue', photos),
            photos.length === 1 ? 'Foto guardada.' : 'Fotos guardadas.',
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

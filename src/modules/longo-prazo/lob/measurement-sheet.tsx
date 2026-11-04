'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Camera, ChevronRight, History, MessageSquare, Minus, Plus, Search, Trash2, TriangleAlert } from 'lucide-react';
import {
  activityFinish,
  byRound,
  DELAY_CAUSES,
  isLate,
  LOB_LIMITS,
  measurableActivities,
  measuredPercents,
  normalizeName,
  plannedPercent,
  type LobActivity,
  type LobData,
  type LobLocal,
  type LobMeasurement,
  type LobMeasurementItem,
  type LobPhoto,
  type LobService,
  type LocalDate,
} from '@/domain/lob';
import { isLocalDate } from '@/domain/long-term-plan';
import { useConfirm } from '@/modules/layout/confirm';
import { useToast } from '@/modules/layout/toast';
import { Callout } from '@/modules/planejamento/ui';
import { formatDate } from '@/shared/format';
import { PhotoDialog, PhotoStrip, type LobExecute } from './measurement-photos';

/** A medição aberta (ou uma rodada fechada, para consulta ou correção) de uma obra: tabela agrupada
 * por local no computador e, abaixo de 768 px, a tela do canteiro (um local por vez, cartões com
 * − / +, câmera direta). Os dois layouts saem do mesmo estado e dos mesmos comandos; a diferença é
 * só o que se desenha. Cada valor é gravado no blur (um `save_items` com um item), porque no
 * canteiro a medição é feita em partes e a aba pode ser fechada a qualquer momento (regra 24: o
 * rascunho fica guardado até salvar). */

// ─── Linhas da folha ────────────────────────────────────────────────────────────

export interface SheetRow {
  activity: LobActivity;
  service: LobService;
  local: LobLocal;
  /** Previsto acumulado até a data da medição. */
  planned: number;
  /** Acumulado que valia antes desta rodada (medições fechadas anteriores). */
  previous: number;
  item?: LobMeasurementItem;
  photos: LobPhoto[];
  /** O que vale para esta rodada: o lançado ou, sem lançamento, o anterior. */
  value: number;
  /** Com o valor desta rodada, o bloco ainda está atrasado na data da medição (regra 14). */
  late: boolean;
  /** Houve avanço nesta rodada e ainda não há foto (regra 21). */
  needsPhoto: boolean;
}
export type SheetTab = 'current' | 'future' | 'done';
export const TAB_LABELS: Record<SheetTab, string> = { current: 'Atuais', future: 'Futuras', done: 'Concluídas' };

const UNKNOWN_SERVICE = (id: string): LobService => ({
  id,
  workId: '',
  name: 'Serviço',
  color: '#8ea4b7',
  orderIndex: 0,
  createdAt: '',
  updatedAt: '',
});
const UNKNOWN_LOCAL = (id: string): LobLocal => ({ id, workId: '', name: 'local', orderIndex: -1, createdAt: '', updatedAt: '' });

/** Acumulado que valia antes de `measurement`: só as fechadas anteriores (por data e número), para
 * uma rodada antiga continuar coerente mesmo depois de outras serem salvas. */
export function previousPercents(data: LobData, measurement: LobMeasurement) {
  return measuredPercents(
    data.measurements.filter(
      m =>
        m.id !== measurement.id &&
        m.status === 'closed' &&
        (m.date < measurement.date || (m.date === measurement.date && m.number < measurement.number)),
    ),
    data.items,
  );
}
/** Medições fechadas anteriores a `measurement`, da mais nova à mais antiga. */
export function roundsBefore(data: LobData, measurement: LobMeasurement) {
  return data.measurements
    .filter(
      m =>
        m.id !== measurement.id &&
        m.status === 'closed' &&
        (m.date < measurement.date || (m.date === measurement.date && m.number < measurement.number)),
    )
    .sort(byRound)
    .reverse();
}
/** Linhas da folha, por aba (regra 19), ordenadas do local mais alto para o mais baixo e, dentro do
 * local, na ordem dos serviços. */
export function buildSheet(data: LobData, measurement: LobMeasurement): Record<SheetTab, SheetRow[]> {
  const previous = previousPercents(data, measurement);
  const services = new Map(data.services.map(s => [s.id, s]));
  const locals = new Map(data.locals.map(l => [l.id, l]));
  const items = new Map(data.items.filter(i => i.measurementId === measurement.id).map(i => [i.activityId, i]));
  const photos = new Map<string, LobPhoto[]>();
  for (const p of data.photos) {
    if (p.measurementId !== measurement.id) continue;
    const list = photos.get(p.itemId) ?? [];
    list.push(p);
    photos.set(p.itemId, list);
  }
  const toRow = (activity: LobActivity): SheetRow => {
    const item = items.get(activity.id);
    const before = previous[activity.id] ?? 0;
    const value = item?.value ?? before;
    const itemPhotos = item ? (photos.get(item.id) ?? []) : [];
    return {
      activity,
      service: services.get(activity.serviceId) ?? UNKNOWN_SERVICE(activity.serviceId),
      local: locals.get(activity.localId) ?? UNKNOWN_LOCAL(activity.localId),
      planned: plannedPercent(activity, measurement.date),
      previous: before,
      item,
      photos: itemPhotos,
      value,
      late: isLate(activity, value, measurement.date),
      needsPhoto: !!item && item.value > item.previousValue && itemPhotos.length === 0,
    };
  };
  const order = (a: SheetRow, b: SheetRow) =>
    b.local.orderIndex - a.local.orderIndex ||
    a.local.name.localeCompare(b.local.name, 'pt-BR') ||
    a.service.orderIndex - b.service.orderIndex;
  const lists = measurableActivities(data.activities, previous, measurement.date);
  return {
    current: lists.current.map(toRow).sort(order),
    future: lists.future.map(toRow).sort(order),
    done: lists.done.map(toRow).sort(order),
  };
}
export interface SheetGroup {
  local: LobLocal;
  rows: SheetRow[];
}
export function groupRows(rows: SheetRow[]): SheetGroup[] {
  const groups: SheetGroup[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.local.id === row.local.id) last.rows.push(row);
    else groups.push({ local: row.local, rows: [row] });
  }
  return groups;
}
export const rowLabel = (row: SheetRow) => `${row.service.name} · ${row.local.name}`;
/** "62%" ou "62,5%": o acumulado aceita uma casa decimal. */
export const formatPercent = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const formatPp = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pp`;
const shortDate = (date: LocalDate) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
/** Data civil (São Paulo) de um carimbo ISO, para "salva em dd/mm/aaaa". */
export const stampDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorMessage = (cause: unknown, fallback: string) => (cause instanceof Error && cause.message ? cause.message : fallback);
/** Próximo múltiplo de 5 acima ou abaixo (os botões − / + do celular andam de 5 em 5). */
export const stepFive = (value: number, direction: 1 | -1, min: number, max = 100) => {
  const next = direction > 0 ? Math.floor(value / 5) * 5 + 5 : Math.ceil(value / 5) * 5 - 5;
  return Math.min(max, Math.max(min, next));
};

// ─── Peças visuais ──────────────────────────────────────────────────────────────

type PillTone = 'muted' | 'ok' | 'late' | 'warn' | 'info';
const PILL: Record<PillTone, string> = {
  muted: 'border-slate-200 bg-slate-100 text-slate-600',
  ok: 'border-success-ring bg-success-soft text-emerald-700',
  late: 'border-danger-ring bg-danger-soft text-danger',
  warn: 'border-warning-ring bg-warning-soft text-warning',
  info: 'border-primary-ring bg-primary-soft text-primary-ink',
};
export function Pill({ tone, children, className = '' }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-bold whitespace-nowrap tabular-nums ${PILL[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
const Swatch = ({ color, size = 'h-3 w-3' }: { color: string; size?: string }) => (
  <span aria-hidden className={`${size} shrink-0 rounded-sm`} style={{ background: color }} />
);
type ActionTone = 'default' | 'has' | 'warn' | 'danger';
const ACTION: Record<ActionTone, string> = {
  default: 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800',
  has: 'border-primary-ring bg-primary-soft text-primary',
  warn: 'border-warning-ring bg-warning-soft text-warning',
  danger: 'border-danger-ring bg-danger-soft text-danger',
};
function IconAction({
  label,
  title,
  tone = 'default',
  count,
  disabled = false,
  pressed,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  tone?: ActionTone;
  count?: number;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`relative grid h-8 w-8 place-items-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ACTION[tone]} ${pressed ? 'ring-2 ring-primary-ring' : ''}`}
    >
      {children}
      {count ? (
        <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-white tabular-nums">
          {count}
        </span>
      ) : null}
    </button>
  );
}
/** Campo de data que grava no blur (ou Enter), não a cada tecla: digitar o ano dígito a dígito
 * produz datas válidas intermediárias que iriam ao servidor. */
function DateField({
  value,
  max,
  disabled,
  label,
  className = '',
  onCommit,
}: {
  value: string;
  max?: string;
  disabled?: boolean;
  label: string;
  className?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setDraft(value);
    }
  }, [value]);
  const commit = () => {
    if (draft === value) return;
    if (draft && !isLocalDate(draft)) {
      setDraft(value);
      return;
    }
    onCommit(draft);
  };
  return (
    <input
      type="date"
      aria-label={label}
      value={draft}
      max={max}
      disabled={disabled}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={`field h-8 px-2 text-xs tabular-nums disabled:bg-slate-50 disabled:text-slate-500 ${className}`}
    />
  );
}

// ─── Folha ──────────────────────────────────────────────────────────────────────

export function MeasurementSheet({
  workId,
  data,
  measurement,
  today,
  readOnly,
  editable,
  onExecute,
  authorName = () => 'autor desconhecido',
}: {
  workId: string;
  data: LobData;
  measurement: LobMeasurement;
  today: LocalDate;
  /** Perfil de consulta (regra 26): vê tudo, não mede. */
  readOnly: boolean;
  /** Esta é a rodada editável (regra 24) e o perfil pode escrever. */
  editable: boolean;
  onExecute: LobExecute;
  authorName?: (userId: string) => string;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const canEdit = editable && !readOnly;
  const isOpen = measurement.status === 'open';
  const [tab, setTab] = useState<SheetTab>('current');
  const [search, setSearch] = useState('');
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [photoFor, setPhotoFor] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [mobileLocal, setMobileLocal] = useState<string>();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const { sheet, allRows, rowsById } = useMemo(() => {
    const built = buildSheet(data, measurement);
    const all = [...built.current, ...built.future, ...built.done];
    return { sheet: built, allRows: all, rowsById: new Map(all.map(r => [r.activity.id, r])) };
  }, [data, measurement]);
  // O − / + do celular grava com atraso: a gravação adiada lê a linha mais recente, não a do toque.
  const latestRows = useRef(rowsById);
  useEffect(() => {
    latestRows.current = rowsById;
  }, [rowsById]);
  const before = useMemo(() => roundsBefore(data, measurement), [data, measurement]);
  const previousRound = before[0];
  const query = normalizeName(search);
  const visible = useMemo(
    () =>
      query
        ? sheet[tab].filter(r => normalizeName(r.service.name).includes(query) || normalizeName(r.local.name).includes(query))
        : sheet[tab],
    [sheet, tab, query],
  );
  const groups = useMemo(() => groupRows(visible), [visible]);
  const isGroupOpen = (localId: string, index: number) => (query ? true : (toggled[localId] ?? index < 2));

  // Rodapé: lançadas, fotos e avanços sem foto desta rodada (de qualquer aba).
  const launched = allRows.filter(r => r.item);
  const total = new Set([...sheet.current.map(r => r.activity.id), ...launched.map(r => r.activity.id)]).size;
  const photoCount = launched.reduce((n, r) => n + r.photos.length, 0);
  const missing = launched.filter(r => r.needsPhoto);
  const saveBlocked = !canEdit
    ? readOnly
      ? 'Perfil de consulta: não mede.'
      : 'Só a última medição pode ser alterada.'
    : launched.length === 0
      ? 'Lance o realizado de ao menos um bloco antes de salvar.'
      : missing.length
        ? `${plural(missing.length, 'avanço sem foto', 'avanços sem foto')}: ${missing.map(rowLabel).join(', ')}`
        : undefined;

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  const setError = (id: string, message?: string) =>
    setErrors(current => {
      const next = { ...current };
      if (message) next[id] = message;
      else delete next[id];
      return next;
    });
  const setDraft = (id: string, value?: string) =>
    setDrafts(current => {
      const next = { ...current };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });

  /** Grava o realizado de um bloco (um `save_items` com um item). Campo vazio com lançamento
   * existente remove o lançamento (e as fotos), depois de confirmar. */
  const saveValue = async (row: SheetRow, raw: string) => {
    const id = row.activity.id;
    const trimmed = raw.trim();
    if (trimmed === '') {
      if (!row.item) {
        setDraft(id);
        setError(id);
        return;
      }
      const ok = await confirm({
        title: 'Remover o lançamento?',
        description: `${rowLabel(row)} volta a ${formatPercent(row.previous)} nesta medição${row.photos.length ? ` e ${plural(row.photos.length, 'foto é excluída', 'fotos são excluídas')}` : ''}.`,
        confirmLabel: 'Remover',
        tone: 'danger',
      });
      if (!ok) {
        setDraft(id);
        return;
      }
      try {
        await onExecute({ type: 'remove_item', itemId: row.item.id });
        setDraft(id);
        setError(id);
      } catch (cause) {
        setError(id, errorMessage(cause, 'Não foi possível remover o lançamento.'));
      }
      return;
    }
    const n = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) return setError(id, 'O realizado acumulado vai de 0 a 100%.');
    if (n < row.previous) return setError(id, `O acumulado não pode ficar abaixo da medição anterior (${formatPercent(row.previous)}).`);
    const rounded = Math.round(n * 10) / 10;
    if (row.item && row.item.value === rounded) {
      setDraft(id);
      setError(id);
      return;
    }
    try {
      // O itemId nasce aqui para a foto subir em seguida, sem ida e volta.
      await onExecute({
        type: 'save_items',
        measurementId: measurement.id,
        items: [{ itemId: row.item?.id ?? crypto.randomUUID(), activityId: id, value: rounded }],
      });
      setDraft(id);
      setError(id);
    } catch (cause) {
      setError(id, errorMessage(cause, 'Não foi possível gravar o realizado.'));
    }
  };
  /** Motivo e observação reenviam o valor atual; sem lançamento, o bloco é lançado com o anterior
   * ("não avançou, por este motivo"), porque o motivo pertence a um lançamento. */
  const saveMeta = async (row: SheetRow, patch: { note?: string | null; delayCause?: string | null }) => {
    const id = row.activity.id;
    try {
      await onExecute({
        type: 'save_items',
        measurementId: measurement.id,
        items: [{ itemId: row.item?.id ?? crypto.randomUUID(), activityId: id, value: row.item?.value ?? row.previous, ...patch }],
      });
      setError(id);
    } catch (cause) {
      setError(id, errorMessage(cause, 'Não foi possível gravar.'));
    }
  };
  const saveActual = async (row: SheetRow, field: 'actualStart' | 'actualFinish', value: string) => {
    try {
      await onExecute({ type: 'update_activity', activityId: row.activity.id, [field]: value || null });
    } catch (cause) {
      toast({ title: 'Data real não gravada', description: errorMessage(cause, 'Tente de novo.'), tone: 'danger' });
    }
  };
  const changeDate = async (value: string) => {
    if (!value || value === measurement.date) return;
    try {
      await onExecute({ type: 'update_measurement', measurementId: measurement.id, date: value });
    } catch (cause) {
      toast({ title: 'Data da medição não alterada', description: errorMessage(cause, 'Tente de novo.'), tone: 'danger' });
    }
  };
  /** Atalhos ("= previsto", "100%") e − / + gravam direto; o − / + espera o dedo parar. */
  const setAndSave = (row: SheetRow, value: number, debounce = 0) => {
    const id = row.activity.id;
    setDraft(id, String(value));
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    if (!debounce) return void saveValue(row, String(value));
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        saveValue(latestRows.current.get(id) ?? row, String(value));
      }, debounce),
    );
  };
  const currentValue = (row: SheetRow) => {
    const draft = drafts[row.activity.id];
    if (draft !== undefined) {
      const n = Number(draft.replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
    return row.value;
  };
  const bump = (row: SheetRow, direction: 1 | -1) => {
    const next = stepFive(currentValue(row), direction, row.previous);
    if (next !== currentValue(row)) setAndSave(row, next, 800);
  };
  const close = async () => {
    setBusy(true);
    try {
      await onExecute({ type: 'close_measurement', measurementId: measurement.id });
      toast({
        title: `Medição #${measurement.number} salva`,
        description: `${plural(launched.length, 'bloco lançado', 'blocos lançados')} · ${plural(photoCount, 'foto', 'fotos')}.`,
      });
    } catch (cause) {
      toast({ title: 'A medição não foi salva', description: errorMessage(cause, 'Tente de novo.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const ok = await confirm({
      title: `Excluir a medição #${measurement.number}?`,
      description: `${plural(launched.length, 'lançamento', 'lançamentos')} e ${plural(photoCount, 'foto', 'fotos')} desta rodada são apagados. Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await onExecute({ type: 'delete_measurement', measurementId: measurement.id });
      toast({ title: `Medição #${measurement.number} excluída` });
    } catch (cause) {
      toast({ title: 'A medição não foi excluída', description: errorMessage(cause, 'Tente de novo.'), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  const toggleDetail = (id: string) => setExpanded(current => ({ ...current, [id]: !current[id] }));
  const historyOf = (row: SheetRow) =>
    before
      .map(m => ({ m, item: data.items.find(i => i.measurementId === m.id && i.activityId === row.activity.id) }))
      .filter((h): h is { m: LobMeasurement; item: LobMeasurementItem } => !!h.item)
      .map(
        ({ m, item }) =>
          `M${m.number} · ${shortDate(m.date)}: ${formatPercent(item.value)} (${authorName(item.createdBy)}, ${plural(data.photos.filter(p => p.itemId === item.id).length, 'foto', 'fotos')})`,
      );

  const photoRow = photoFor ? rowsById.get(photoFor) : undefined;
  const inputDisabled = () => !canEdit || tab === 'done' || busy;
  const statusLine = isOpen
    ? `Medição #${measurement.number} · em aberto`
    : `Medição #${measurement.number} · salva em ${measurement.closedAt ? formatDate(stampDate(measurement.closedAt)) : formatDate(measurement.date)}`;

  // Celular: o local mostrado (começa pelo mais alto com atividades na aba).
  const mobileGroup = groups.find(g => g.local.id === mobileLocal) ?? groups[0];

  // ─── Pedaços compartilhados ────────────────────────────────────────────────
  const valueInput = (row: SheetRow, size: 'sm' | 'lg') => {
    const id = row.activity.id;
    const draft = drafts[id];
    const shown = draft ?? (row.item ? String(row.item.value).replace('.', ',') : '');
    return (
      <input
        type="text"
        inputMode="decimal"
        aria-label={`Realizado acumulado de ${rowLabel(row)}`}
        value={shown}
        placeholder={String(row.previous).replace('.', ',')}
        disabled={inputDisabled()}
        onChange={event => setDraft(id, event.target.value)}
        onBlur={event => {
          if (drafts[id] !== undefined) saveValue(row, event.target.value);
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className={`field text-right font-semibold tabular-nums disabled:bg-slate-50 disabled:text-slate-500 ${
          size === 'lg' ? 'h-11 flex-1 text-xl' : 'h-8 w-[4.5rem] px-2 text-sm'
        } ${row.item ? 'border-primary ring-2 ring-primary-ring' : ''} ${errors[id] ? 'border-danger' : ''}`}
      />
    );
  };
  const shortcuts = (row: SheetRow, size: 'sm' | 'lg') => {
    const cls =
      size === 'lg'
        ? 'flex-1 rounded-lg border border-slate-200 bg-slate-50 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40'
        : 'whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-40';
    const disabled = inputDisabled();
    return (
      <>
        <button
          type="button"
          className={cls}
          disabled={disabled || row.planned < row.previous}
          onClick={() => setAndSave(row, row.planned)}
          title="Igual ao previsto até a data"
        >
          = previsto
        </button>
        <button type="button" className={cls} disabled={disabled} onClick={() => setAndSave(row, 100)} title="Bloco concluído">
          100%
        </button>
      </>
    );
  };
  const delta = (row: SheetRow) => {
    const d = currentValue(row) - row.planned;
    return (
      <span className={`text-xs font-bold tabular-nums ${d < -4 ? 'text-danger' : d > 4 ? 'text-success' : 'text-slate-400'}`}>
        {formatPp(d)}
      </span>
    );
  };
  const detail = (row: SheetRow) => {
    const id = row.activity.id;
    const history = historyOf(row);
    return (
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <h5 className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
            Fotos desta medição · {row.photos.length} de {LOB_LIMITS.maxPhotosPerItem}
          </h5>
          <PhotoStrip
            workId={workId}
            item={row.item}
            photos={row.photos}
            readOnly={!canEdit}
            onExecute={onExecute}
            needsPhoto={row.needsPhoto}
          />
        </div>
        <div className="space-y-3">
          <div>
            <h5 className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Motivo do atraso</h5>
            <select
              className="field h-9 text-sm"
              aria-label={`Motivo do atraso de ${rowLabel(row)}`}
              value={row.item?.delayCause ?? ''}
              disabled={!canEdit || busy}
              onChange={event => saveMeta(row, { delayCause: event.target.value || null })}
            >
              <option value="">{row.late ? 'Informe o motivo…' : 'Sem motivo'}</option>
              {DELAY_CAUSES.map(cause => (
                <option key={cause} value={cause}>
                  {cause}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Mesma lista de causas do curto prazo.</p>
          </div>
          <div>
            <h5 className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Observação</h5>
            <textarea
              className="field min-h-16 resize-y text-sm"
              aria-label={`Observação de ${rowLabel(row)}`}
              value={noteDrafts[id] ?? row.item?.note ?? ''}
              maxLength={LOB_LIMITS.notes}
              disabled={!canEdit || busy}
              onChange={event => setNoteDrafts(current => ({ ...current, [id]: event.target.value }))}
              onBlur={event => {
                const text = event.target.value.trim();
                setNoteDrafts(current => {
                  const next = { ...current };
                  delete next[id];
                  return next;
                });
                if (text !== (row.item?.note ?? '')) saveMeta(row, { note: text || null });
              }}
            />
          </div>
          <div>
            <h5 className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Histórico</h5>
            {history.length ? (
              <ul className="space-y-0.5 text-xs text-slate-600 tabular-nums">
                {history.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-500">Primeira medição deste bloco.</p>
            )}
          </div>
        </div>
      </div>
    );
  };
  const header = (
    <div data-tour="longo-medicoes-data" className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3.5 md:px-5">
      <div className="min-w-0">
        <p className="eyebrow">{statusLine}</p>
        <h3 className="text-base font-bold text-slate-900">{isOpen ? 'Lançar o acumulado realizado' : 'Acumulado realizado'}</h3>
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-slate-600">
        Data
        <DateField
          label="Data da medição"
          value={measurement.date}
          max={today}
          disabled={!isOpen || !canEdit || busy}
          onCommit={changeDate}
          className="w-[9.5rem] font-semibold"
        />
      </label>
      <span className="text-xs text-slate-500">Retroativa permitida, futura não. A data trava ao salvar.</span>
      <label className="relative ml-auto w-full md:w-60">
        <Search size={14} aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          aria-label="Buscar serviço ou local"
          placeholder="Buscar serviço ou local…"
          value={search}
          onChange={event => setSearch(event.target.value)}
          className="field h-9 pl-8 text-sm"
        />
      </label>
      {!isOpen && editable && !readOnly && (
        <p className="basis-full text-xs text-primary-ink">Esta medição já foi salva; a última medição ainda pode ser corrigida.</p>
      )}
      {!isOpen && !editable && <Pill tone="muted">só leitura</Pill>}
    </div>
  );
  const tabs = (
    <div
      data-tour="longo-medicoes-abas"
      role="tablist"
      aria-label="Blocos da medição"
      className="relative flex gap-1 overflow-x-auto border-b border-slate-100 px-3 md:px-4"
    >
      {(['current', 'future', 'done'] as SheetTab[]).map(key => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          onClick={() => setTab(key)}
          className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
            tab === key ? 'border-primary text-primary-ink' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {TAB_LABELS[key]} <span className="tabular-nums">{sheet[key].length}</span>
        </button>
      ))}
    </div>
  );
  const summary = (
    <span className="text-sm text-slate-600">
      <b className="text-slate-900 tabular-nums">{launched.length}</b> de <b className="text-slate-900 tabular-nums">{total}</b> lançadas ·{' '}
      <b className="text-slate-900 tabular-nums">{photoCount}</b> fotos
      {missing.length > 0 && (
        <>
          {' · '}
          <b className="text-danger tabular-nums">{missing.length}</b> {missing.length === 1 ? 'avanço sem foto' : 'avanços sem foto'}:{' '}
          {missing.map(rowLabel).join(', ')}
        </>
      )}
    </span>
  );

  return (
    <section className="panel relative">
      {header}
      {tabs}

      {/* ─── Computador: tabela agrupada por local ───────────────────────────── */}
      <div className="hidden md:block">
        <div data-tour="longo-medicoes-tabela" className="relative overflow-x-auto">
          <table className="data-table text-[13px] [&_tbody_td]:px-3 [&_tbody_td]:py-2 [&_thead_th]:px-3">
            <thead>
              <tr>
                <th className="min-w-[14rem]">Serviço · local</th>
                <th className="text-right">Previsto até {shortDate(measurement.date)}</th>
                <th
                  className="text-right"
                  title={previousRound ? `Medição #${previousRound.number} de ${formatDate(previousRound.date)}` : 'Sem medição anterior'}
                >
                  {previousRound ? `M${previousRound.number} · ${shortDate(previousRound.date)}` : 'Anterior'}
                </th>
                <th>Realizado acumulado</th>
                <th className="text-right">Desvio</th>
                <th>Início real</th>
                <th>Término real</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                    {query ? 'Nenhum bloco combina com a busca.' : `Nenhum bloco em "${TAB_LABELS[tab]}" nesta data.`}
                  </td>
                </tr>
              )}
              {groups.map((group, index) => {
                const open = isGroupOpen(group.local.id, index);
                const launchedHere = group.rows.filter(r => r.item).length;
                const lateHere = group.rows.filter(r => r.late).length;
                return [
                  <tr key={`g-${group.local.id}`} className="bg-slate-50 hover:bg-slate-50">
                    <td colSpan={8} className="!py-1.5">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setToggled(current => ({ ...current, [group.local.id]: !open }))}
                        className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900"
                      >
                        <ChevronRight size={14} aria-hidden className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
                        {group.local.name}
                        <Pill tone="muted">{plural(group.rows.length, 'atividade', 'atividades')}</Pill>
                        {launchedHere > 0 && <Pill tone="ok">{plural(launchedHere, 'lançada', 'lançadas')}</Pill>}
                        {lateHere > 0 && <Pill tone="late">{plural(lateHere, 'atrasada', 'atrasadas')}</Pill>}
                      </button>
                    </td>
                  </tr>,
                  ...(open
                    ? group.rows.flatMap(row => {
                        const id = row.activity.id;
                        const rows = [
                          <tr key={id} className={expanded[id] ? 'bg-brand-50/50' : ''}>
                            <td>
                              <span className="inline-flex items-start gap-2">
                                <Swatch color={row.service.color} size="mt-1 h-3 w-3" />
                                <span>
                                  <b className="text-slate-900">{row.service.name}</b>
                                  <br />
                                  <span className="text-xs text-slate-500">
                                    {row.local.name}
                                    {row.service.unit ? ` · ${row.service.unit}` : ''} · {shortDate(row.activity.start)}–
                                    {shortDate(activityFinish(row.activity))}
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="text-right tabular-nums">{formatPercent(row.planned)}</td>
                            <td className="text-right text-slate-500 tabular-nums">{formatPercent(row.previous)}</td>
                            <td>
                              <span className="inline-flex items-center gap-1">
                                {valueInput(row, 'sm')}
                                <span className="text-xs text-slate-500">%</span>
                                <span className="inline-flex gap-1">{shortcuts(row, 'sm')}</span>
                              </span>
                              {errors[id] && (
                                <p role="alert" className="mt-1 max-w-xs text-xs text-danger">
                                  {errors[id]}
                                </p>
                              )}
                            </td>
                            <td className="text-right">{delta(row)}</td>
                            <td>
                              <DateField
                                label={`Início real de ${rowLabel(row)}`}
                                value={row.activity.actualStart ?? ''}
                                max={today}
                                disabled={!canEdit || busy}
                                onCommit={value => saveActual(row, 'actualStart', value)}
                                className="w-[9.5rem]"
                              />
                            </td>
                            <td>
                              <DateField
                                label={`Término real de ${rowLabel(row)}`}
                                value={row.activity.actualFinish ?? ''}
                                max={today}
                                disabled={!canEdit || busy}
                                onCommit={value => saveActual(row, 'actualFinish', value)}
                                className="w-[9.5rem]"
                              />
                            </td>
                            <td>
                              <div className="inline-flex gap-1">
                                <IconAction
                                  label={`Fotos de ${rowLabel(row)}`}
                                  title={row.needsPhoto ? 'Avanço sem foto' : row.item ? 'Fotos' : 'Salve o realizado para anexar fotos'}
                                  tone={row.needsPhoto ? 'warn' : row.photos.length ? 'has' : 'default'}
                                  count={row.photos.length}
                                  disabled={!row.item}
                                  onClick={() => setPhotoFor(id)}
                                >
                                  <Camera size={14} aria-hidden />
                                </IconAction>
                                <IconAction
                                  label={`Observação de ${rowLabel(row)}`}
                                  title="Observação"
                                  tone={row.item?.note ? 'has' : 'default'}
                                  pressed={!!expanded[id]}
                                  onClick={() => toggleDetail(id)}
                                >
                                  <MessageSquare size={14} aria-hidden />
                                </IconAction>
                                <IconAction
                                  label={`Motivo do atraso de ${rowLabel(row)}`}
                                  title={
                                    row.item?.delayCause
                                      ? `Motivo: ${row.item.delayCause}`
                                      : row.late
                                        ? 'Atrasado sem motivo'
                                        : 'Motivo do atraso'
                                  }
                                  tone={row.item?.delayCause ? 'has' : row.late ? 'danger' : 'default'}
                                  pressed={!!expanded[id]}
                                  onClick={() => toggleDetail(id)}
                                >
                                  <TriangleAlert size={14} aria-hidden />
                                </IconAction>
                                <IconAction
                                  label={`Histórico de ${rowLabel(row)}`}
                                  title="Histórico"
                                  pressed={!!expanded[id]}
                                  onClick={() => toggleDetail(id)}
                                >
                                  <History size={14} aria-hidden />
                                </IconAction>
                              </div>
                            </td>
                          </tr>,
                        ];
                        if (expanded[id])
                          rows.push(
                            <tr key={`${id}-detail`} className="bg-slate-50 hover:bg-slate-50">
                              <td colSpan={8} className="!px-4 !py-3">
                                {detail(row)}
                              </td>
                            </tr>,
                          );
                        return rows;
                      })
                    : []),
                ];
              })}
            </tbody>
          </table>
        </div>
        <div
          data-tour="longo-medicoes-rodape"
          className="flex flex-wrap items-center gap-3 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-5 py-3"
        >
          {summary}
          <span className="flex-1" />
          {canEdit && (
            <button type="button" className="button-ghost text-danger hover:text-danger" disabled={busy} onClick={remove}>
              <Trash2 size={15} aria-hidden />
              Excluir medição
            </button>
          )}
          {isOpen && (
            <button
              data-tour="longo-medicoes-salvar"
              type="button"
              className="button"
              disabled={!!saveBlocked || busy}
              title={saveBlocked}
              onClick={close}
            >
              {busy ? 'Salvando…' : `Salvar medição #${measurement.number}`}
            </button>
          )}
        </div>
      </div>

      {/* ─── Celular: um local por vez, cartões com − / + e câmera ───────────── */}
      <div className="md:hidden">
        {groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            {query ? 'Nenhum bloco combina com a busca.' : `Nenhum bloco em "${TAB_LABELS[tab]}" nesta data.`}
          </p>
        ) : (
          <>
            <div className="relative flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none]" role="tablist" aria-label="Locais">
              {groups.map(group => {
                const on = group.local.id === mobileGroup?.local.id;
                const pending = group.rows.filter(r => r.needsPhoto).length;
                return (
                  <button
                    key={group.local.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setMobileLocal(group.local.id)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                      on ? 'border-primary-ink bg-primary-ink text-white' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    {group.local.name}
                    {pending > 0 && <span className={`ml-1 ${on ? 'text-amber-200' : 'text-warning'}`}>●</span>}
                  </button>
                );
              })}
            </div>
            {mobileGroup && (
              <div className="space-y-2.5 px-3 pb-3">
                <p className="flex items-center justify-between px-1 text-sm font-bold text-slate-900">
                  {mobileGroup.local.name}
                  <Pill tone="warn">
                    {mobileGroup.rows.filter(r => r.item).length} de {mobileGroup.rows.length}
                  </Pill>
                </p>
                {mobileGroup.rows.map(row => {
                  const id = row.activity.id;
                  const shown = currentValue(row);
                  return (
                    <article key={id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-card">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Swatch color={row.service.color} />
                        <span className="min-w-0 flex-1 truncate">{row.service.name}</span>
                        {row.late && <Pill tone="late">atrasado</Pill>}
                      </div>
                      <p className="mt-1 flex justify-between text-xs text-slate-500 tabular-nums">
                        <span>
                          Previsto <b className="text-slate-800">{formatPercent(row.planned)}</b>
                        </span>
                        <span>
                          {previousRound ? `M${previousRound.number}` : 'Anterior'}{' '}
                          <b className="text-slate-800">{formatPercent(row.previous)}</b>
                        </span>
                      </p>
                      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                        <i className="absolute inset-y-0 left-0 rounded-full bg-slate-300" style={{ width: `${row.planned}%` }} />
                        <i
                          className="absolute inset-y-0 left-0 rounded-full"
                          style={{ width: `${shown}%`, background: row.service.color }}
                        />
                      </div>
                      <div className="mt-2.5 flex items-center gap-2">
                        <button
                          type="button"
                          aria-label="Menos 5"
                          disabled={inputDisabled() || shown <= row.previous}
                          onClick={() => bump(row, -1)}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
                        >
                          <Minus size={18} aria-hidden />
                        </button>
                        {valueInput(row, 'lg')}
                        <span className="text-sm text-slate-500">%</span>
                        <button
                          type="button"
                          aria-label="Mais 5"
                          disabled={inputDisabled() || shown >= 100}
                          onClick={() => bump(row, 1)}
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
                        >
                          <Plus size={18} aria-hidden />
                        </button>
                      </div>
                      <div className="mt-2 flex gap-1.5">{shortcuts(row, 'lg')}</div>
                      {errors[id] && (
                        <p role="alert" className="mt-1.5 text-xs text-danger">
                          {errors[id]}
                        </p>
                      )}
                      <div className="mt-2.5">
                        <PhotoStrip
                          workId={workId}
                          item={row.item}
                          photos={row.photos}
                          readOnly={!canEdit}
                          onExecute={onExecute}
                          needsPhoto={row.needsPhoto}
                          columns="grid-cols-4"
                        />
                      </div>
                      {row.needsPhoto && (
                        <p className="mt-1.5 text-xs font-semibold text-warning">
                          Avançou de {formatPercent(row.item!.previousValue)} para {formatPercent(row.item!.value)}: tire ao menos uma foto
                          para enviar.
                        </p>
                      )}
                      {(row.late || row.item?.delayCause || row.item?.note || expanded[id]) && (
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
                          aria-expanded={!!expanded[id]}
                          onClick={() => toggleDetail(id)}
                        >
                          <TriangleAlert size={13} aria-hidden className={row.late && !row.item?.delayCause ? 'text-danger' : ''} />
                          {expanded[id]
                            ? 'Ocultar motivo e observação'
                            : row.item?.delayCause
                              ? `Motivo: ${row.item.delayCause}`
                              : 'Motivo do atraso e observação'}
                        </button>
                      )}
                      {expanded[id] && <div className="mt-2 border-t border-slate-100 pt-2">{detail(row)}</div>}
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
        <div className="sticky bottom-0 space-y-2 rounded-b-2xl border-t border-slate-100 bg-white/95 px-3 py-3 backdrop-blur">
          <p className="text-xs text-slate-600">{summary}</p>
          <div className="flex gap-2">
            {canEdit && (
              <button type="button" className="button-ghost text-danger" aria-label="Excluir medição" disabled={busy} onClick={remove}>
                <Trash2 size={16} aria-hidden />
              </button>
            )}
            {isOpen ? (
              <button
                type="button"
                className="button h-11 flex-1 text-[15px]"
                disabled={!!saveBlocked || busy}
                title={saveBlocked}
                onClick={close}
              >
                {busy ? 'Salvando…' : `Salvar medição #${measurement.number}`}
              </button>
            ) : (
              <p className="flex-1 self-center text-xs text-slate-500">
                {editable && !readOnly ? 'Medição salva; a última ainda pode ser corrigida.' : 'Medição salva · só leitura.'}
              </p>
            )}
          </div>
          {saveBlocked && isOpen && canEdit && <p className="text-xs text-warning">{saveBlocked}</p>}
        </div>
      </div>

      {photoRow && (
        <PhotoDialog
          workId={workId}
          item={photoRow.item}
          photos={photoRow.photos}
          readOnly={!canEdit}
          onExecute={onExecute}
          onClose={() => setPhotoFor(undefined)}
          title={rowLabel(photoRow)}
          subtitle={`Medição #${measurement.number} · ${formatDate(measurement.date)}`}
          needsPhoto={photoRow.needsPhoto}
        />
      )}
      {missing.length > 0 && isOpen && canEdit && (
        <div className="sr-only" role="status">
          {plural(missing.length, 'avanço sem foto', 'avanços sem foto')}.
        </div>
      )}
      {!canEdit && !readOnly && !editable && (
        <div className="hidden px-5 pb-4 md:block">
          <Callout tone="info" role="status">
            Esta medição é anterior à última: fica só para consulta. Para corrigir, exclua as medições posteriores primeiro.
          </Callout>
        </div>
      )}
    </section>
  );
}

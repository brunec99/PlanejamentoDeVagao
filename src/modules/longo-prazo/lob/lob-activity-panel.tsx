'use client';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Camera, ClipboardList, Plus, Trash2, X } from 'lucide-react';
import {
  LOB_LIMITS,
  activityFinish,
  byRound,
  delayDays,
  descendants,
  isLate,
  plannedPercent,
  wouldCycle,
  type LobActivity,
  type LobCommand,
  type LobData,
  type LobPhoto,
  type LocalDate,
} from '@/domain/lob';
import { isLocalDate } from '@/domain/long-term-plan';
import { useConfirm } from '@/modules/layout/confirm';
import { useToast } from '@/modules/layout/toast';
import { formatDate, formatTimestamp } from '@/shared/format';

/** Painel lateral "Atividade selecionada" da Linha de Balanço (modelo de 04/11/2026, tela 1): tudo o
 * que um bloco tem se edita aqui, campo a campo, e cada campo grava sozinho ao sair ou no Enter.
 * O servidor é a fonte: a tela mostra o que ele devolveu e, se recusar, o rascunho é descartado e
 * o motivo vai num aviso. Em consulta tudo fica desabilitado. */

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dateLabel = (date: LocalDate) => `${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${formatDate(date)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorMessage = (error: unknown) => (error instanceof Error && error.message ? error.message : 'Falha na comunicação com o servidor.');

/** Campo que grava ao sair ou no Enter. Enquanto a pessoa digita, mostra o rascunho; ao confirmar,
 * descarta o rascunho e volta a mostrar o valor do servidor, que muda quando a gravação chega. Esc
 * descarta sem gravar. Em `multiline` o Enter quebra linha e só o blur grava. */
export function CommitField({
  id,
  value,
  onCommit,
  type = 'text',
  disabled,
  className = 'field',
  multiline,
  min,
  max,
  placeholder,
  ariaLabel,
  rows = 3,
}: {
  id?: string;
  value: string;
  onCommit: (value: string) => void;
  type?: 'text' | 'date' | 'number';
  disabled?: boolean;
  className?: string;
  multiline?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  ariaLabel?: string;
  rows?: number;
}) {
  const [draft, setDraft] = useState<string>();
  const shown = draft ?? value;
  const commit = () => {
    if (draft !== undefined && draft !== value) onCommit(draft);
    setDraft(undefined);
  };
  const keys = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') setDraft(undefined);
    if (event.key === 'Enter' && !multiline) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };
  const common = {
    id,
    value: shown,
    disabled,
    placeholder,
    'aria-label': ariaLabel,
    className,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
    onBlur: commit,
    onKeyDown: keys,
  };
  return multiline ? <textarea {...common} rows={rows} /> : <input {...common} type={type} min={min} max={max} />;
}

/** Visualizador simples da foto em tamanho cheio: `<dialog>` modal, Esc fecha. */
function PhotoLightbox({ photo, label, onClose }: { photo: LobPhoto; label: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={label}
      className="m-auto max-h-[94vh] w-[min(64rem,96vw)] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 p-0 text-white shadow-xl backdrop:bg-slate-950/80"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
        <span className="truncate">{label}</span>
        <button type="button" className="rounded p-1 hover:bg-white/10" aria-label="Fechar" onClick={() => dialog.current?.close()}>
          <X size={16} aria-hidden />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, fora do otimizador do Next */}
      <img src={photo.url ?? photo.thumbUrl} alt={label} className="max-h-[85vh] w-full object-contain" />
    </dialog>
  );
}

const Swatch = ({ color }: { color: string }) => (
  <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: color }} />
);
const sectionTitle = 'mt-4 text-xs font-bold text-slate-700';

export function LobActivityPanel({
  activity,
  data,
  percents,
  today,
  readOnly,
  onExecute,
  onClose,
  onSelect,
  onCreatePending,
}: {
  activity: LobActivity;
  data: LobData;
  percents: Record<string, number>;
  today: LocalDate;
  readOnly: boolean;
  onExecute: (command: LobCommand) => Promise<unknown>;
  onClose: () => void;
  onSelect: (id: string | undefined) => void;
  /** "Criar pendência" do serviço deste bloco (Lista de pendência da aba 2). Ausente para quem não
   * abre a aba 2: aí o botão não aparece. */
  onCreatePending?: (serviceId: string) => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [newPredecessor, setNewPredecessor] = useState('');
  const [newLag, setNewLag] = useState('0');
  const [viewing, setViewing] = useState<LobPhoto>();

  const service = data.services.find(s => s.id === activity.serviceId);
  const local = data.locals.find(l => l.id === activity.localId);
  const serviceName = (id: string) => data.services.find(s => s.id === id)?.name ?? 'Serviço';
  const localName = (id: string) => data.locals.find(l => l.id === id)?.name ?? 'local';
  const colorOf = (id: string) => data.services.find(s => s.id === id)?.color ?? '#8ea4b7';
  const label = (a: LobActivity) => `${serviceName(a.serviceId)} · ${localName(a.localId)}`;
  const title = label(activity);
  const disabled = readOnly || busy;

  /** Toda gravação passa aqui: ocupado enquanto espera, erro vira aviso com a mensagem do servidor. */
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

  // ─── Datas, duração e situação ────────────────────────────────────────────
  const finish = activityFinish(activity);
  const measured = percents[activity.id] ?? 0;
  const planned = plannedPercent(activity, today);
  const late = isLate(activity, percents[activity.id], today);
  const delay = delayDays(activity, percents[activity.id], today);
  // Último lançamento de medição deste bloco: traz o motivo do atraso informado em campo.
  const rounds = [...data.measurements].sort(byRound);
  const lastItem = rounds
    .map(m => data.items.find(i => i.measurementId === m.id && i.activityId === activity.id))
    .filter(Boolean)
    .pop();

  // ─── Dependências ─────────────────────────────────────────────────────────
  const localOrder = new Map(data.locals.map(l => [l.id, l.orderIndex]));
  const serviceOrder = new Map(data.services.map(s => [s.id, s.orderIndex]));
  const byPosition = (a: LobActivity, b: LobActivity) =>
    (localOrder.get(a.localId) ?? 0) - (localOrder.get(b.localId) ?? 0) ||
    (serviceOrder.get(a.serviceId) ?? 0) - (serviceOrder.get(b.serviceId) ?? 0);
  const predecessors = data.dependencies.filter(d => d.successorId === activity.id);
  const successors = data.dependencies.filter(d => d.predecessorId === activity.id);
  const followers = descendants(data.dependencies, activity.id);
  // Candidatas a predecessora: qualquer bloco que não feche ciclo e ainda não seja predecessora.
  const candidates = data.activities
    .filter(
      a => a.id !== activity.id && !predecessors.some(d => d.predecessorId === a.id) && !wouldCycle(data.dependencies, a.id, activity.id),
    )
    .sort(byPosition);

  const addPredecessor = async () => {
    const lag = Number(newLag || 0);
    if (!newPredecessor || !Number.isInteger(lag)) return;
    if (
      await send({
        type: 'add_dependency',
        workId: activity.workId,
        predecessorId: newPredecessor,
        successorId: activity.id,
        lagDays: lag,
        kind: 'fs',
      })
    ) {
      setNewPredecessor('');
      setNewLag('0');
    }
  };

  // ─── Fotos da última medição que fotografou este bloco ─────────────────────
  const mine = data.photos.filter(p => p.activityId === activity.id);
  const photoRound = [...rounds].reverse().find(m => mine.some(p => p.measurementId === m.id));
  const photos = photoRound ? mine.filter(p => p.measurementId === photoRound.id) : [];

  const remove = async () => {
    const ok = await confirm({
      title: `Excluir ${title}?`,
      description: 'As dependências que entram e saem deste bloco também são removidas. Bloco já medido não pode ser excluído.',
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (ok && (await send({ type: 'delete_activity', activityId: activity.id }))) onClose();
  };

  return (
    <div className="text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow">Atividade selecionada</p>
          <h3 className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Swatch color={service?.color ?? '#8ea4b7'} />
            <span className="break-words">{title}</span>
          </h3>
        </div>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fechar detalhes"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
        <dt className="text-slate-500">Início</dt>
        <dd className="m-0">
          <CommitField
            type="date"
            value={activity.start}
            disabled={disabled}
            ariaLabel="Início do bloco"
            className="field py-1.5"
            onCommit={value => {
              if (isLocalDate(value)) send({ type: 'update_activity', activityId: activity.id, start: value });
            }}
          />
          <span className="mt-0.5 block text-xs text-slate-500">
            {dateLabel(activity.start)}. Cai num dia útil; as sucessoras acompanham.
          </span>
        </dd>
        <dt className="text-slate-500">Duração</dt>
        <dd className="m-0 flex items-center gap-2">
          <CommitField
            type="number"
            min={1}
            max={LOB_LIMITS.durationDays}
            value={String(activity.durationDays)}
            disabled={disabled}
            ariaLabel="Duração em dias úteis"
            className="field w-20 py-1.5 text-right tabular-nums"
            onCommit={value => {
              const days = Number(value);
              if (Number.isInteger(days) && days >= 1) send({ type: 'update_activity', activityId: activity.id, durationDays: days });
            }}
          />
          <span className="text-xs text-slate-500">dias úteis</span>
        </dd>
        <dt className="text-slate-500">Término</dt>
        <dd className="m-0 font-medium tabular-nums text-slate-900">{dateLabel(finish)}</dd>
        <dt className="text-slate-500">Equipe</dt>
        <dd className="m-0">
          <CommitField
            value={service?.team ?? ''}
            disabled={disabled || !service}
            placeholder="Equipe do serviço"
            ariaLabel="Equipe do serviço"
            className="field py-1.5"
            onCommit={value => service && send({ type: 'update_service', serviceId: service.id, team: value.trim() || null })}
          />
        </dd>
        <dt className="text-slate-500">Unidade</dt>
        <dd className="m-0">
          <CommitField
            value={service?.unit ?? ''}
            disabled={disabled || !service}
            placeholder="%, m², apartamento…"
            ariaLabel="Unidade de medição do serviço"
            className="field py-1.5"
            onCommit={value => service && send({ type: 'update_service', serviceId: service.id, unit: value.trim() || null })}
          />
        </dd>
      </dl>
      <p className="mt-1 text-[11px] text-slate-400">Equipe e unidade valem para o serviço inteiro, em todos os locais.</p>
      {onCreatePending && service && (
        <button
          type="button"
          data-tour="longo-lob-criar-pendencia"
          className="button-ghost mt-2 px-2.5 py-1.5 text-xs"
          onClick={() => onCreatePending(service.id)}
          title={`Cria um card na Lista de pendência (aba 2) ligado ao serviço ${service.name}: a entrega é o dia útil anterior ao primeiro início do serviço na obra e acompanha a reprogramação`}
        >
          <ClipboardList size={14} aria-hidden /> Criar pendência do serviço
        </button>
      )}

      <label htmlFor="lob-activity-notes" className={`${sectionTitle} block`}>
        Observação
      </label>
      <CommitField
        id="lob-activity-notes"
        multiline
        rows={2}
        value={activity.notes ?? ''}
        disabled={disabled}
        placeholder="Anote o que importa para este bloco."
        className="field mt-1 resize-y text-sm"
        onCommit={value => send({ type: 'update_activity', activityId: activity.id, notes: value.trim() || null })}
      />

      <p className={sectionTitle}>Depois de</p>
      <ul className="mt-1 space-y-1">
        {!predecessors.length && <li className="text-xs text-slate-500">Sem predecessora: o bloco começa na data que tiver.</li>}
        {predecessors.map(dep => {
          const pred = data.activities.find(a => a.id === dep.predecessorId);
          if (!pred) return null;
          return (
            <li key={dep.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
              <Swatch color={colorOf(pred.serviceId)} />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium text-slate-700 hover:text-primary"
                onClick={() => onSelect(pred.id)}
                title="Ver a predecessora"
              >
                {label(pred)}
              </button>
              {dep.kind === 'crew' && <span className="shrink-0 text-slate-400">equipe segue</span>}
              <span className="flex shrink-0 items-center gap-1 tabular-nums text-slate-500">
                {dep.lagDays >= 0 ? '+' : ''}
                <CommitField
                  type="number"
                  min={-LOB_LIMITS.lagDays}
                  max={LOB_LIMITS.lagDays}
                  value={String(dep.lagDays)}
                  disabled={disabled}
                  ariaLabel={`Espera depois de ${label(pred)}, em dias úteis`}
                  className="field w-14 px-1.5 py-0.5 text-right text-xs tabular-nums"
                  onCommit={value => {
                    const lag = Number(value);
                    if (Number.isInteger(lag)) send({ type: 'update_dependency', dependencyId: dep.id, lagDays: lag });
                  }}
                />
                d
              </span>
              {!readOnly && (
                <button
                  type="button"
                  className="rounded p-0.5 text-slate-400 hover:text-danger disabled:opacity-50"
                  aria-label={`Remover a dependência de ${label(pred)}`}
                  disabled={busy}
                  onClick={() => send({ type: 'remove_dependency', dependencyId: dep.id })}
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <label htmlFor="lob-new-predecessor" className="sr-only">
            Adicionar predecessora
          </label>
          <select
            id="lob-new-predecessor"
            className="field min-w-0 flex-1 py-1 text-xs"
            value={newPredecessor}
            disabled={disabled || !candidates.length}
            onChange={event => setNewPredecessor(event.target.value)}
          >
            <option value="">{candidates.length ? 'adicionar predecessora…' : 'nenhum bloco disponível'}</option>
            {candidates.map(a => (
              <option key={a.id} value={a.id}>
                {label(a)}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="field w-16 px-1.5 py-1 text-right text-xs tabular-nums"
            aria-label="Espera em dias úteis"
            min={-LOB_LIMITS.lagDays}
            max={LOB_LIMITS.lagDays}
            value={newLag}
            disabled={disabled}
            onChange={event => setNewLag(event.target.value)}
          />
          <button type="button" className="button-ghost px-2 py-1 text-xs" disabled={disabled || !newPredecessor} onClick={addPredecessor}>
            <Plus size={13} aria-hidden /> Ligar
          </button>
        </div>
      )}

      <p className={sectionTitle}>Sucessoras que acompanham ao arrastar</p>
      <p className="mt-1 text-xs text-slate-600">
        {successors.length ? (
          <>
            {successors.map((dep, index) => {
              const succ = data.activities.find(a => a.id === dep.successorId);
              return succ ? (
                <span key={dep.id}>
                  {index > 0 && ', '}
                  <button type="button" className="font-medium text-slate-700 hover:text-primary" onClick={() => onSelect(succ.id)}>
                    {label(succ)}
                  </button>
                </span>
              ) : null;
            })}{' '}
            e tudo que vem depois: <b className="tabular-nums">{plural(followers.size, 'bloco', 'blocos')}</b>.
          </>
        ) : (
          'Nenhuma: mover este bloco não arrasta outro.'
        )}
      </p>

      {late ? (
        <div className="callout callout-danger mt-4 text-xs leading-5">
          <b>Atrasado {plural(delay, 'dia útil', 'dias úteis')}.</b> Previsto até hoje {planned}%, medido {measured}%
          {lastItem?.delayCause && (
            <>
              . Motivo informado: <b>{lastItem.delayCause}</b>
            </>
          )}
          .
        </div>
      ) : measured >= 100 ? (
        <div className="callout callout-success mt-4 text-xs leading-5">Concluído: 100% medido.</div>
      ) : (
        <div className="callout callout-info mt-4 text-xs leading-5">
          Previsto até hoje {planned}% · medido {measured}%{data.measurements.length ? '' : ' (ainda sem medição)'}.
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {(
          [
            ['Início real', 'actualStart', activity.actualStart],
            ['Término real', 'actualFinish', activity.actualFinish],
          ] as const
        ).map(([text, field, value]) => (
          <div key={field}>
            <label htmlFor={`lob-${field}`} className="text-xs font-semibold text-slate-600">
              {text}
            </label>
            <div className="mt-0.5 flex items-center gap-1">
              <CommitField
                id={`lob-${field}`}
                type="date"
                value={value ?? ''}
                disabled={disabled}
                className="field min-w-0 py-1 text-xs"
                onCommit={next => {
                  if (next === '' || isLocalDate(next)) send({ type: 'update_activity', activityId: activity.id, [field]: next || null });
                }}
              />
              {value && !readOnly && (
                <button
                  type="button"
                  className="rounded p-1 text-slate-400 hover:text-danger"
                  aria-label={`Limpar ${text.toLowerCase()}`}
                  disabled={busy}
                  onClick={() => send({ type: 'update_activity', activityId: activity.id, [field]: null })}
                >
                  <X size={14} aria-hidden />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">A medição preenche as datas reais; aqui elas podem ser corrigidas ou limpas.</p>

      <p className={`${sectionTitle} flex items-center gap-1.5`}>
        <Camera size={13} aria-hidden /> Fotos da medição
        {photoRound && (
          <span className="font-normal text-slate-500">
            #{photoRound.number} · {formatDate(photoRound.date)} · {plural(photos.length, 'foto', 'fotos')}
          </span>
        )}
      </p>
      {photos.length ? (
        <ul className="mt-1 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
          {photos.map(photo => (
            <li key={photo.id}>
              <button
                type="button"
                className="block aspect-[4/3] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                onClick={() => setViewing(photo)}
                aria-label={`Abrir foto de ${formatTimestamp(photo.createdAt)}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura assinada do Storage */}
                <img src={photo.thumbUrl ?? photo.url} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Nenhuma foto deste bloco ainda. As fotos entram pela medição.</p>
      )}
      {viewing && (
        <PhotoLightbox photo={viewing} label={`${title} · ${formatTimestamp(viewing.createdAt)}`} onClose={() => setViewing(undefined)} />
      )}

      {!readOnly && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button type="button" className="button-ghost px-2.5 py-1.5 text-xs hover:text-danger" disabled={busy} onClick={remove}>
            <Trash2 size={14} aria-hidden /> Excluir bloco
          </button>
          {local && <span className="self-center text-[11px] text-slate-400">Local: {local.name}</span>}
        </div>
      )}
    </div>
  );
}

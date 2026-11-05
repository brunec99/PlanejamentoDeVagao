'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleAlert, LoaderCircle, Trash2 } from 'lucide-react';
import {
  isSafetyConsequence,
  isSafetyProbability,
  SAFETY_CONSEQUENCES,
  SAFETY_LIMITS,
  SAFETY_PROBABILITIES,
  safetyDays,
  type SafetyCommand,
  type SafetyConsequence,
  type SafetyItem,
  type SafetyPhoto,
  type SafetyProbability,
  type SafetyType,
} from '@/domain/safety';
import { Field } from '@/modules/planejamento/forms';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { useConfirm } from '@/modules/layout/confirm';
import { useToast } from '@/modules/layout/toast';
import { PhotoGrid, PhotoInput, type PendingPhoto } from '@/modules/terminalidade/photo-input';
import { PhotoViewer } from '@/modules/terminalidade/photo-viewer';
import { refreshPhotos } from '@/modules/terminalidade/photo-refresh';
import { formatDate } from '@/shared/format';
import { isSafetyConflict, uploadPendingSafetyPhotos, type SafetyView } from './api';

/** Campos editáveis de um apontamento, como estão no formulário (vazio = ainda não escolhido). */
interface FormState {
  typeId: string;
  consequence: SafetyConsequence | '';
  probability: SafetyProbability | '';
  description: string;
  location: string;
  observedOn: string;
}

/** O que o formulário lembra entre um lançamento e outro: o TST percorre a obra e lança vários
 * apontamentos no mesmo local e do mesmo tipo. Fica só neste navegador. O risco não é lembrado: cada
 * apontamento tem a própria avaliação. */
type Remembered = Partial<Pick<FormState, 'typeId' | 'location'>>;
const memoryKey = (workId: string) => `obra360-seguranca-ultimo:${workId}`;
function readMemory(workId: string): Remembered {
  try {
    if (typeof window === 'undefined') return {};
    const parsed: unknown = JSON.parse(localStorage.getItem(memoryKey(workId)) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Remembered = {};
    for (const key of ['typeId', 'location'] as const) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}
function writeMemory(workId: string, form: FormState) {
  try {
    const value: Remembered = { typeId: form.typeId, location: form.location.trim() };
    localStorage.setItem(memoryKey(workId), JSON.stringify(value));
  } catch {}
}

const byOrder = (a: SafetyType, b: SafetyType) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
const byCreated = (a: SafetyPhoto, b: SafetyPhoto) => a.createdAt.localeCompare(b.createdAt);
const errorText = (cause: unknown, fallback: string) => (cause instanceof Error && cause.message ? cause.message : fallback);
const daysLabel = (days: number) => `${days} ${days === 1 ? 'dia' : 'dias'}`;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** "Apontado por" do histórico importado da planilha, que não tem autor no sistema. */
const SPREADSHEET_AUTHOR = 'Planilha SST - Controle geral';

function initialForm(props: { workId: string; data: SafetyView; today: string; item?: SafetyItem }): FormState {
  const { item, data, today } = props;
  if (item)
    return {
      typeId: item.typeId ?? '',
      consequence: item.consequence,
      probability: item.probability,
      description: item.description,
      location: item.location,
      observedOn: item.observedOn,
    };
  const memory = readMemory(props.workId);
  const typeId = data.types.some(t => t.id === memory.typeId && t.active) ? memory.typeId! : '';
  return { typeId, consequence: '', probability: '', description: '', location: memory.location ?? '', observedOn: today };
}

type Fields = Omit<Extract<SafetyCommand, { type: 'update_item' }>, 'type' | 'itemId'>;
/** Campos do comando (create_item / update_item) a partir do formulário já validado. */
function commandFields(form: FormState, consequence: SafetyConsequence, probability: SafetyProbability): Fields {
  return {
    typeId: form.typeId || undefined,
    consequence,
    probability,
    description: form.description.trim(),
    location: form.location.trim(),
    observedOn: form.observedOn,
  };
}
function changed(item: SafetyItem, fields: Fields) {
  return (
    (item.typeId ?? undefined) !== fields.typeId ||
    item.consequence !== fields.consequence ||
    item.probability !== fields.probability ||
    item.description !== fields.description ||
    item.location !== fields.location ||
    item.observedOn !== fields.observedOn
  );
}

/** Lançamento, edição e consulta de um apontamento da aba 6 (Segurança do trabalho), com as fotos do
 * apontamento. Mesmo fluxo do diálogo da pendência da aba 5:
 *
 * Lançar: o apontamento nasce primeiro (`create_item`, com id gerado aqui) e só então as fotos sobem, uma
 * a uma (Storage + `add_photo`). Se uma foto falha, o apontamento já existe: o diálogo continua aberto,
 * agora editando o apontamento criado, com as fotos que faltam na fila para tentar de novo.
 * Editar (só TST): `update_item` só se algum campo mudou, mais as fotos novas; as já enviadas abrem grandes
 * e podem ser excluídas. `readOnly` (quem não é TST) mostra tudo e não deixa mudar nada.
 * Num 409 (outra gravação chegou antes) avisa e fecha, para a lista recarregar. */
export function SafetyItemDialog(props: {
  workId: string;
  data: SafetyView;
  /** Ausente = novo apontamento. */
  item?: SafetyItem;
  readOnly: boolean;
  today: string;
  locationSuggestions: string[];
  execute: (c: SafetyCommand) => Promise<void>;
  onClose: () => void;
}) {
  const { workId, data, item, readOnly, today, locationSuggestions, execute, onClose } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const consequenceRef = useRef<HTMLSelectElement>(null);
  const confirm = useConfirm();
  const { toast } = useToast();
  const planning = usePlanning();

  const [form, setForm] = useState<FormState>(() => initialForm(props));
  /** Id do apontamento criado neste diálogo, quando o envio de alguma foto falhou depois. */
  const [createdId, setCreatedId] = useState<string>();
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  /** A última tentativa salvou os campos, mas alguma foto não subiu: o botão vira "Tentar de novo". */
  const [uploadFailed, setUploadFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [viewer, setViewer] = useState<{ photos: SafetyPhoto[]; index: number }>();
  /** Conta os "Salvar e lançar outro": o foco volta ao risco depois que o formulário destrava. */
  const [round, setRound] = useState(0);

  const autofocus = !item && !readOnly;
  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    element.showModal();
    // No lançamento, o cursor vai para o primeiro campo a escolher (o tipo costuma vir lembrado).
    if (autofocus) (typeRef.current?.value ? consequenceRef.current : typeRef.current)?.focus();
  }, [autofocus]);
  useEffect(() => {
    if (round) consequenceRef.current?.focus();
  }, [round]);

  const itemId = item?.id ?? createdId;
  const live = itemId ? (data.items.find(i => i.id === itemId) ?? item) : undefined;
  const creating = !item; // fluxo de lançamento, inclusive depois de criado com foto pendente

  const types = useMemo(
    () => data.types.filter(t => t.active || t.id === live?.typeId || t.id === form.typeId).sort(byOrder),
    [data.types, live?.typeId, form.typeId],
  );
  // No lançamento o tipo é obrigatório; "Sem tipo" só existe para o apontamento que já está sem tipo
  // (histórico da planilha), para editar os outros campos sem ter de classificá-lo.
  const allowNoType = !creating && !live?.typeId;

  const itemPhotos = useMemo(() => (itemId ? data.photos.filter(p => p.itemId === itemId).sort(byCreated) : []), [data.photos, itemId]);
  const issuePhotos = itemPhotos.filter(p => p.kind === 'issue');
  const correctionPhotos = itemPhotos.filter(p => p.kind === 'correction');
  const resolved = live?.status === 'resolved';
  // Enquanto aberto, guarda uma vaga para a foto da correção, que é obrigatória para finalizar.
  const room = Math.max(0, SAFETY_LIMITS.maxPhotosPerItem - itemPhotos.length - (resolved ? 0 : 1));
  const locked = readOnly || busy;

  const users = planning.state === 'ready' ? planning.planning.data.users : undefined;
  const personName = (id: string) => users?.find(u => u.id === id)?.name ?? data.inspectors.find(p => p.id === id)?.name ?? '—';
  const author = live ? (live.origin === 'planilha' ? SPREADSHEET_AUTHOR : personName(live.createdBy)) : '';

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));

  const close = () => {
    if (!busy) dialog.current?.close();
  };

  /** 409: outra gravação chegou antes (apontamento apagado ou alterado por outra pessoa). Avisa e fecha;
   * a lista recarrega. Devolve se tratou o erro. */
  const closeOnConflict = (cause: unknown, title: string) => {
    if (!isSafetyConflict(cause)) return false;
    toast({ title, description: errorText(cause, 'Os dados mudaram enquanto você editava.'), tone: 'danger' });
    setProgress('');
    setBusy(false);
    dialog.current?.close();
    return true;
  };

  const validate = (): string => {
    if (creating && !form.typeId)
      return types.length
        ? 'Escolha o tipo de apontamento.'
        : 'Não há tipos de apontamento ativos. Cadastre ou reative um em “Tipos de apontamento”.';
    if (!form.consequence) return 'Escolha o risco: consequência.';
    if (!form.probability) return 'Escolha o risco: probabilidade.';
    if (!form.description.trim()) return 'Descreva o apontamento.';
    if (form.description.trim().length > SAFETY_LIMITS.maxDescription)
      return `A descrição passa de ${SAFETY_LIMITS.maxDescription} caracteres.`;
    if (form.location.trim().length > SAFETY_LIMITS.maxLocation) return `O local passa de ${SAFETY_LIMITS.maxLocation} caracteres.`;
    if (!ISO_DATE.test(form.observedOn)) return 'Informe a data do apontamento.';
    if (form.observedOn > today) return 'A data do apontamento não pode ser futura.';
    if (resolved && live?.correctedOn && form.observedOn > live.correctedOn)
      return `O apontamento não pode ser depois da correção (${formatDate(live.correctedOn)}).`;
    return '';
  };

  const save = async (another: boolean) => {
    if (busy || preparing || readOnly) return;
    const problem = validate();
    const { consequence, probability } = form;
    if (problem || !consequence || !probability) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    setUploadFailed(false);
    setNotice('');
    const fields = commandFields(form, consequence, probability);
    let id = itemId;
    let createdNow = false;
    let updated = false;
    try {
      if (!id) {
        id = crypto.randomUUID();
        setProgress('Salvando apontamento…');
        await execute({ type: 'create_item', workId, itemId: id, ...fields });
        createdNow = true;
        setCreatedId(id);
        writeMemory(workId, form);
      } else if (live && changed(live, fields)) {
        setProgress('Salvando alterações…');
        await execute({ type: 'update_item', itemId: id, ...fields });
        updated = true;
      }
    } catch (cause) {
      if (closeOnConflict(cause, 'Não foi possível salvar o apontamento.')) return;
      setError(errorText(cause, 'Não foi possível salvar o apontamento.'));
      setProgress('');
      setBusy(false);
      return;
    }

    const queue = pending;
    try {
      await uploadPendingSafetyPhotos({
        workId,
        itemId: id,
        kind: 'issue',
        photos: queue,
        execute,
        onProgress: (current, total) => setProgress(total > 1 ? `Enviando foto ${current} de ${total}…` : 'Enviando foto…'),
        onUploaded: pendingId => setPending(current => current.filter(p => p.id !== pendingId)),
      });
    } catch (cause) {
      // O apontamento existe; só a foto falhou. O diálogo fica aberto editando o apontamento, com as
      // fotos que não subiram ainda na fila, e o botão de salvar tenta de novo só o que falta.
      const saved = createdNow ? 'O apontamento foi salvo, mas uma foto não subiu. ' : updated ? 'As alterações foram salvas. ' : '';
      setError(`${saved}${errorText(cause, 'Falha ao enviar a foto.')} Toque em “Tentar de novo” para reenviar o que falta.`);
      setUploadFailed(true);
      setProgress('');
      setBusy(false);
      return;
    }

    setProgress('');
    setBusy(false);
    const sent = queue.length ? ` com ${queue.length} ${queue.length === 1 ? 'foto' : 'fotos'}` : '';
    if (creating && another) {
      // Próximo apontamento na mesma ronda: mantém tipo, local e data; descrição e risco recomeçam.
      setCreatedId(undefined);
      setForm(current => ({ ...current, description: '', consequence: '', probability: '' }));
      setNotice(`Apontamento salvo${sent}. Classifique o risco e descreva o próximo.`);
      toast({ title: `Apontamento lançado${sent}.`, tone: 'success' });
      top.current?.scrollIntoView({ block: 'start' });
      setRound(current => current + 1);
      return;
    }
    if (creating) toast({ title: `Apontamento lançado${sent}.`, tone: 'success' });
    else if (updated || queue.length) toast({ title: `Apontamento atualizado${sent}.`, tone: 'success' });
    dialog.current?.close();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    save(submitter?.dataset.next === 'true');
  };

  const deletePhoto = async (photo: SafetyPhoto) => {
    if (locked) return;
    const ok = await confirm({
      title: 'Excluir esta foto?',
      description: 'A foto sai do apontamento e do armazenamento. Não dá para desfazer.',
      confirmLabel: 'Excluir foto',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await execute({ type: 'delete_photo', photoId: photo.id });
      toast({ title: 'Foto excluída.', tone: 'success' });
    } catch (cause) {
      if (closeOnConflict(cause, 'Não foi possível excluir a foto.')) return;
      setError(errorText(cause, 'Não foi possível excluir a foto.'));
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async () => {
    if (locked || !itemId) return;
    const count = itemPhotos.length;
    const ok = await confirm({
      title: 'Excluir este apontamento?',
      description: `${count ? `O apontamento e ${count === 1 ? 'a foto dele saem' : `as ${count} fotos dele saem`}` : 'O apontamento sai'} da lista. Não dá para desfazer.`,
      confirmLabel: 'Excluir apontamento',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await execute({ type: 'delete_item', itemId });
    } catch (cause) {
      if (closeOnConflict(cause, 'Não foi possível excluir o apontamento.')) return;
      setError(errorText(cause, 'Não foi possível excluir o apontamento.'));
      setBusy(false);
      return;
    }
    setBusy(false);
    toast({ title: 'Apontamento excluído.', tone: 'success' });
    // O apontamento sumiu dos dados; a tela pode já ter desmontado o diálogo, então avisa direto.
    onClose();
  };

  const title = readOnly
    ? 'Apontamento'
    : creating && !createdId
      ? 'Novo apontamento'
      : createdId
        ? 'Apontamento salvo — faltam fotos'
        : 'Editar apontamento';
  const primaryLabel = busy
    ? progress || 'Salvando…'
    : uploadFailed && pending.length > 0
      ? 'Tentar de novo'
      : creating
        ? 'Salvar'
        : 'Salvar alterações';
  const days = live ? safetyDays(live, today) : 0;

  return (
    <dialog
      ref={dialog}
      // O React repassa `cancel`/`close` do visualizador de fotos (outro <dialog> aqui dentro) para
      // estes handlers; só reage quando o evento é deste diálogo.
      onCancel={event => {
        if (event.target === event.currentTarget && busy) event.preventDefault();
      }}
      onClose={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="seguranca-item-titulo"
      className="m-auto max-h-[92dvh] w-[min(42rem,94vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55"
    >
      <div ref={top} className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Segurança do trabalho{live?.location ? ` · ${live.location}` : ''}</p>
            <h3 id="seguranca-item-titulo" className="mt-1 text-base font-bold text-slate-900">
              {title}
            </h3>
            {live && (
              <p className="mt-1 text-xs text-slate-500">
                Apontado em {formatDate(live.observedOn)}
                {resolved && live.correctedOn ? ` · corrigido em ${formatDate(live.correctedOn)}` : ' · aberto'}
              </p>
            )}
          </div>
          <button type="button" className="button-ghost min-h-11" onClick={close} disabled={busy}>
            Fechar
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
          {notice && (
            <Callout tone="success" role="status">
              {notice}
            </Callout>
          )}

          {live && (
            <dl className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold text-slate-600">Situação</dt>
                <dd
                  className={`mt-0.5 flex items-center gap-1.5 text-sm font-semibold ${resolved ? 'text-emerald-800' : 'text-amber-800'}`}
                >
                  {resolved ? <CheckCircle2 size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />}
                  {resolved ? `Finalizado${live.correctedOn ? ` em ${formatDate(live.correctedOn)}` : ''}` : 'Aberto'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Dias para resolver</dt>
                <dd className="mt-0.5 text-sm text-slate-800 tabular-nums">
                  {daysLabel(days)}
                  {resolved ? '' : ' até hoje'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-slate-600">Apontado por</dt>
                <dd className="mt-0.5 text-sm text-slate-800">{author}</dd>
              </div>
            </dl>
          )}
          {resolved && live?.resolutionNote && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-600">Como foi corrigido</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{live.resolutionNote}</p>
            </div>
          )}

          <fieldset disabled={locked} className="space-y-4">
            <Field label="Tipo de apontamento">
              <select
                ref={typeRef}
                className="field min-h-11"
                value={form.typeId}
                required={!allowNoType}
                onChange={e => set('typeId', e.target.value)}
              >
                {(allowNoType || !form.typeId) && <option value="">{allowNoType ? 'Sem tipo' : 'Escolha o tipo'}</option>}
                {types.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                    {type.active ? '' : ' (desativado)'}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Risco: consequência">
                <select
                  ref={consequenceRef}
                  className="field min-h-11"
                  value={form.consequence}
                  required
                  onChange={e => set('consequence', isSafetyConsequence(e.target.value) ? e.target.value : '')}
                >
                  {!form.consequence && <option value="">Escolha a consequência</option>}
                  {SAFETY_CONSEQUENCES.map(value => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Risco: probabilidade">
                <select
                  className="field min-h-11"
                  value={form.probability}
                  required
                  onChange={e => set('probability', isSafetyProbability(e.target.value) ? e.target.value : '')}
                >
                  {!form.probability && <option value="">Escolha a probabilidade</option>}
                  {SAFETY_PROBABILITIES.map(value => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Descrição"
              hint={
                form.description.length > SAFETY_LIMITS.maxDescription * 0.8
                  ? `${form.description.length} de ${SAFETY_LIMITS.maxDescription} caracteres`
                  : undefined
              }
            >
              <textarea
                className="field"
                rows={3}
                required
                maxLength={SAFETY_LIMITS.maxDescription}
                placeholder="Ex.: Guarda-corpo ausente na borda da laje"
                value={form.description}
                onChange={e => set('description', e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Local" hint={readOnly ? undefined : 'Escolha um local já usado na obra ou digite outro.'}>
                <input
                  className="field min-h-11"
                  list="seguranca-locais"
                  maxLength={SAFETY_LIMITS.maxLocation}
                  autoComplete="off"
                  placeholder="Ex.: Térreo, 2° Pavimento, Canteiro"
                  value={form.location}
                  onChange={e => set('location', e.target.value)}
                />
                <datalist id="seguranca-locais">
                  {locationSuggestions.map(name => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </Field>
              <Field label="Data do apontamento">
                <input
                  className="field min-h-11"
                  type="date"
                  required
                  max={resolved && live?.correctedOn && live.correctedOn < today ? live.correctedOn : today}
                  value={form.observedOn}
                  onChange={e => set('observedOn', e.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <section className="space-y-2" aria-labelledby="seguranca-fotos-apontamento">
            <h4 id="seguranca-fotos-apontamento" className="text-xs font-semibold text-slate-600">
              Fotos do apontamento
              {issuePhotos.length > 0 && <span className="ml-1 font-normal text-slate-500">({issuePhotos.length})</span>}
            </h4>
            {issuePhotos.length > 0 && (
              <PhotoGrid
                photos={issuePhotos}
                label="Foto do apontamento"
                onOpen={index => setViewer({ photos: issuePhotos, index })}
                onDelete={readOnly ? undefined : deletePhoto}
                disabled={locked}
              />
            )}
            {readOnly ? (
              issuePhotos.length === 0 && <p className="text-sm text-slate-500">Sem fotos do apontamento.</p>
            ) : (
              <PhotoInput
                value={pending}
                onChange={setPending}
                max={room}
                disabled={busy}
                onBusyChange={setPreparing}
                noun="apontamento"
                emptyHint={issuePhotos.length === 0 ? 'Opcional, mas ajuda a achar o risco e a comparar com a correção.' : undefined}
              />
            )}
          </section>

          {correctionPhotos.length > 0 && (
            <section className="space-y-2" aria-labelledby="seguranca-fotos-correcao">
              <h4 id="seguranca-fotos-correcao" className="text-xs font-semibold text-slate-600">
                Fotos da correção
                {live?.correctedOn && <span className="ml-1 font-normal text-slate-500">· {formatDate(live.correctedOn)}</span>}
              </h4>
              <PhotoGrid
                photos={correctionPhotos}
                label="Foto da correção"
                onOpen={index => setViewer({ photos: correctionPhotos, index })}
              />
            </section>
          )}

          {error && (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          )}

          {!readOnly && (
            <div className="sticky bottom-0 -mx-5 flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-5 py-3 sm:-mx-6 sm:px-6">
              <button className="button min-h-11" type="submit" data-next="false" disabled={busy || preparing}>
                {busy && <LoaderCircle size={16} className="animate-spin" aria-hidden />}
                {primaryLabel}
              </button>
              {creating && (
                <button className="button-secondary min-h-11" type="submit" data-next="true" disabled={busy || preparing}>
                  Salvar e lançar outro
                </button>
              )}
              {preparing && <span className="text-xs text-slate-500">Aguarde a foto ficar pronta.</span>}
              {itemId && (
                <button
                  type="button"
                  className="button-ghost min-h-11 text-danger sm:ml-auto"
                  onClick={deleteItem}
                  disabled={busy || preparing}
                >
                  <Trash2 size={16} aria-hidden />
                  Excluir apontamento
                </button>
              )}
            </div>
          )}
        </form>
      </div>
      {viewer && (
        <PhotoViewer
          photos={refreshPhotos(viewer.photos, data.photos)}
          startIndex={viewer.index}
          onClose={() => setViewer(undefined)}
          issueLabel="Apontamento"
        />
      )}
    </dialog>
  );
}

'use client';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, LoaderCircle, Trash2 } from 'lucide-react';
import {
  TERMINALITY_LIMITS,
  type TerminalityCommand,
  type TerminalityData,
  type TerminalityItem,
  type TerminalityPhoto,
} from '@/domain/terminality';
import { Field } from '@/modules/planejamento/forms';
import { Callout } from '@/modules/planejamento/ui';
import { useConfirm } from '@/modules/layout/confirm';
import { useToast } from '@/modules/layout/toast';
import { formatDate } from '@/shared/format';
import { PhotoGrid, PhotoInput, uploadPendingPhotos, type PendingPhoto } from './photo-input';
import { PhotoViewer } from './photo-viewer';
import { refreshPhotos } from './photo-refresh';

/** Campos editáveis de uma pendência, como estão no formulário (vazio = não informado). */
interface FormState {
  floorId: string;
  unitId: string;
  description: string;
  typeId: string;
  observedOn: string;
  atrPersonId: string;
  contractor: string;
}

/** O que o campo lembra entre um cadastro e outro: quem anda pela obra lança várias pendências no
 * mesmo apartamento, do mesmo tipo e do mesmo empreiteiro. Fica só neste navegador. */
type Remembered = Partial<Pick<FormState, 'floorId' | 'unitId' | 'typeId' | 'contractor'>>;
const memoryKey = (workId: string) => `obra360-terminalidade-ultimo:${workId}`;
function readMemory(workId: string): Remembered {
  try {
    if (typeof window === 'undefined') return {};
    const parsed: unknown = JSON.parse(localStorage.getItem(memoryKey(workId)) ?? '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Remembered = {};
    for (const key of ['floorId', 'unitId', 'typeId', 'contractor'] as const) {
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
    const value: Remembered = { floorId: form.floorId, unitId: form.unitId, typeId: form.typeId, contractor: form.contractor.trim() };
    localStorage.setItem(memoryKey(workId), JSON.stringify(value));
  } catch {}
}

const byOrder = (a: { orderIndex: number; name: string }, b: { orderIndex: number; name: string }) =>
  a.orderIndex - b.orderIndex || a.name.localeCompare(b.name, 'pt-BR', { numeric: true });
const byCreated = (a: TerminalityPhoto, b: TerminalityPhoto) => a.createdAt.localeCompare(b.createdAt);
const errorText = (cause: unknown, fallback: string) => (cause instanceof Error && cause.message ? cause.message : fallback);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function initialForm(props: { workId: string; data: TerminalityData; today: string; item?: TerminalityItem }): FormState {
  const { item, data, today } = props;
  if (item)
    return {
      floorId: item.floorId,
      unitId: item.unitId ?? '',
      description: item.description,
      typeId: item.typeId ?? '',
      observedOn: item.observedOn,
      atrPersonId: item.atrPersonId ?? '',
      contractor: item.contractor ?? '',
    };
  const memory = readMemory(props.workId);
  const floors = [...data.floors].sort(byOrder);
  const floorId = floors.some(f => f.id === memory.floorId) ? memory.floorId! : (floors[0]?.id ?? '');
  const unitId = data.units.some(u => u.id === memory.unitId && u.floorId === floorId) ? memory.unitId! : '';
  const typeId = data.types.some(t => t.id === memory.typeId && t.active) ? memory.typeId! : '';
  return { floorId, unitId, description: '', typeId, observedOn: today, atrPersonId: '', contractor: memory.contractor ?? '' };
}

/** Campos do comando (create_item / update_item) a partir do formulário. */
function commandFields(form: FormState) {
  return {
    floorId: form.floorId,
    unitId: form.unitId || undefined,
    description: form.description.trim(),
    typeId: form.typeId || undefined,
    observedOn: form.observedOn,
    atrPersonId: form.atrPersonId || undefined,
    contractor: form.contractor.trim() || undefined,
  };
}
function changed(item: TerminalityItem, fields: ReturnType<typeof commandFields>) {
  return (
    item.floorId !== fields.floorId ||
    (item.unitId ?? undefined) !== fields.unitId ||
    item.description !== fields.description ||
    (item.typeId ?? undefined) !== fields.typeId ||
    item.observedOn !== fields.observedOn ||
    (item.atrPersonId ?? undefined) !== fields.atrPersonId ||
    (item.contractor ?? undefined) !== fields.contractor
  );
}

/** Cadastro e edição de uma pendência da Terminalidade, com as fotos do problema.
 *
 * Criar: a pendência nasce primeiro (`create_item`, com id gerado aqui) e só então as fotos sobem,
 * uma a uma (Storage + `add_photo`). Se uma foto falha, a pendência já existe: o diálogo continua
 * aberto, agora editando a pendência criada, com as fotos que faltam na fila para tentar de novo.
 * Editar: `update_item` só se algum campo mudou, mais as fotos novas; as já enviadas abrem grandes
 * e podem ser excluídas. `readOnly` (perfil de consulta) mostra tudo e não deixa mudar nada. */
export function ItemDialog(props: {
  workId: string;
  data: TerminalityData;
  companies: string[];
  today: string;
  item?: TerminalityItem;
  readOnly?: boolean;
  execute: (c: TerminalityCommand) => Promise<void>;
  onClose: () => void;
}) {
  const { workId, data, companies, today, item, readOnly = false, execute, onClose } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>(() => initialForm(props));
  /** Id da pendência criada neste diálogo, quando o envio de alguma foto falhou depois. */
  const [createdId, setCreatedId] = useState<string>();
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  /** A última tentativa salvou os campos, mas alguma foto não subiu: o botão vira "Tentar de novo". */
  const [uploadFailed, setUploadFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [viewer, setViewer] = useState<{ photos: TerminalityPhoto[]; index: number }>();

  const autofocus = !item && !readOnly;
  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    element.showModal();
    // No cadastro, o cursor já vai para a descrição (local e tipo costumam vir lembrados).
    if (autofocus) descriptionRef.current?.focus();
  }, [autofocus]);

  const itemId = item?.id ?? createdId;
  const live = itemId ? (data.items.find(i => i.id === itemId) ?? item) : undefined;
  const creating = !item; // fluxo de cadastro, inclusive depois de criada com foto pendente

  const floors = useMemo(() => [...data.floors].sort(byOrder), [data.floors]);
  const units = useMemo(() => data.units.filter(u => u.floorId === form.floorId).sort(byOrder), [data.units, form.floorId]);
  const types = useMemo(
    () => data.types.filter(t => t.active || t.id === live?.typeId || t.id === form.typeId).sort(byOrder),
    [data.types, live?.typeId, form.typeId],
  );
  const people = useMemo(
    () =>
      data.people
        .filter(p => p.active || p.id === live?.atrPersonId || p.id === form.atrPersonId)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [data.people, live?.atrPersonId, form.atrPersonId],
  );
  const contractorOptions = useMemo(() => {
    const names = new Set<string>();
    for (const name of companies) if (name.trim()) names.add(name.trim());
    for (const i of data.items) if (i.contractor?.trim()) names.add(i.contractor.trim());
    return [...names].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [companies, data.items]);

  const itemPhotos = useMemo(() => (itemId ? data.photos.filter(p => p.itemId === itemId).sort(byCreated) : []), [data.photos, itemId]);
  const issuePhotos = itemPhotos.filter(p => p.kind === 'issue');
  const correctionPhotos = itemPhotos.filter(p => p.kind === 'correction');
  const resolved = live?.status === 'resolved';
  // Enquanto aberta, guarda uma vaga para a foto da correção, que é obrigatória para resolver.
  const room = Math.max(0, TERMINALITY_LIMITS.maxPhotosPerItem - itemPhotos.length - (resolved ? 0 : 1));

  const floorName = floors.find(f => f.id === form.floorId)?.name;
  const unitName = data.units.find(u => u.id === form.unitId)?.name;
  const locked = readOnly || busy;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(current => ({ ...current, [key]: value }));

  const close = () => {
    if (!busy) dialog.current?.close();
  };

  const validate = (): string => {
    if (!form.floorId) return 'Escolha o pavimento.';
    if (!form.description.trim()) return 'Descreva a pendência.';
    if (form.description.trim().length > TERMINALITY_LIMITS.maxDescription)
      return `A descrição passa de ${TERMINALITY_LIMITS.maxDescription} caracteres.`;
    if (!ISO_DATE.test(form.observedOn)) return 'Informe a data da observação.';
    if (form.observedOn > today) return 'A data da observação não pode ser futura.';
    if (resolved && live?.correctedOn && form.observedOn > live.correctedOn)
      return `A observação não pode ser depois da correção (${formatDate(live.correctedOn)}).`;
    if (form.contractor.trim().length > TERMINALITY_LIMITS.maxName)
      return `O nome do terceiro passa de ${TERMINALITY_LIMITS.maxName} caracteres.`;
    return '';
  };

  const save = async (another: boolean) => {
    if (busy || preparing || readOnly) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    setUploadFailed(false);
    setNotice('');
    const fields = commandFields(form);
    let id = itemId;
    let createdNow = false;
    let updated = false;
    try {
      if (!id) {
        id = crypto.randomUUID();
        setProgress('Salvando pendência…');
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
      setError(errorText(cause, 'Não foi possível salvar a pendência.'));
      setProgress('');
      setBusy(false);
      return;
    }

    const queue = pending;
    try {
      await uploadPendingPhotos({
        workId,
        itemId: id,
        kind: 'issue',
        photos: queue,
        execute,
        onProgress: (current, total) => setProgress(total > 1 ? `Enviando foto ${current} de ${total}…` : 'Enviando foto…'),
        onUploaded: pendingId => setPending(current => current.filter(p => p.id !== pendingId)),
      });
    } catch (cause) {
      // A pendência existe; só a foto falhou. O diálogo fica aberto editando a pendência, com as
      // fotos que não subiram ainda na fila, e o botão de salvar tenta de novo só o que falta.
      const saved = createdNow ? 'A pendência foi salva, mas uma foto não subiu. ' : updated ? 'As alterações foram salvas. ' : '';
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
      // Próxima pendência no mesmo lugar: mantém local, tipo, data, responsáveis e terceiro.
      setCreatedId(undefined);
      setForm(current => ({ ...current, description: '' }));
      setNotice(`Pendência salva${sent}. Descreva a próxima.`);
      toast({ title: `Pendência cadastrada${sent}.`, tone: 'success' });
      top.current?.scrollIntoView({ block: 'start' });
      descriptionRef.current?.focus();
      return;
    }
    if (creating) toast({ title: `Pendência cadastrada${sent}.`, tone: 'success' });
    else if (updated || queue.length) toast({ title: `Pendência atualizada${sent}.`, tone: 'success' });
    dialog.current?.close();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    save(submitter?.dataset.next === 'true');
  };

  const deletePhoto = async (photo: TerminalityPhoto) => {
    if (locked) return;
    const ok = await confirm({
      title: 'Excluir esta foto?',
      description: 'A foto sai da pendência e do armazenamento. Não dá para desfazer.',
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
      setError(errorText(cause, 'Não foi possível excluir a foto.'));
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async () => {
    if (locked || !itemId) return;
    const count = itemPhotos.length;
    const ok = await confirm({
      title: 'Excluir esta pendência?',
      description: `${count ? `A pendência e ${count === 1 ? 'a foto dela saem' : `as ${count} fotos dela saem`}` : 'A pendência sai'} da lista. Não dá para desfazer.`,
      confirmLabel: 'Excluir pendência',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    try {
      await execute({ type: 'delete_item', itemId });
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível excluir a pendência.'));
      setBusy(false);
      return;
    }
    setBusy(false);
    toast({ title: 'Pendência excluída.', tone: 'success' });
    // A pendência sumiu dos dados; a tela pode já ter desmontado o diálogo, então avisa direto.
    onClose();
  };

  const title = readOnly
    ? 'Pendência'
    : creating && !createdId
      ? 'Nova pendência'
      : createdId
        ? 'Pendência salva — faltam fotos'
        : 'Editar pendência';
  const primaryLabel = busy
    ? progress || 'Salvando…'
    : uploadFailed && pending.length > 0
      ? 'Tentar de novo'
      : creating
        ? 'Salvar'
        : 'Salvar alterações';

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
      aria-labelledby="terminalidade-item-titulo"
      className="m-auto max-h-[92dvh] w-[min(42rem,94vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55"
    >
      <div ref={top} className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">
              Terminalidade{floorName ? ` · ${floorName}` : ''}
              {unitName ? ` · ${unitName}` : ''}
            </p>
            <h3 id="terminalidade-item-titulo" className="mt-1 text-base font-bold text-slate-900">
              {title}
            </h3>
            {live && (
              <p className="mt-1 text-xs text-slate-500">
                Observada em {formatDate(live.observedOn)}
                {resolved && live.correctedOn ? ` · corrigida em ${formatDate(live.correctedOn)}` : ' · em aberto'}
              </p>
            )}
          </div>
          <button type="button" className="button-ghost min-h-11" onClick={close} disabled={busy}>
            Fechar
          </button>
        </div>

        {floors.length === 0 ? (
          <div className="mt-5">
            <Callout tone="warning" role="status">
              Esta obra ainda não tem pavimentos cadastrados. Cadastre os pavimentos e apartamentos antes de lançar pendências.
            </Callout>
          </div>
        ) : (
          <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
            {notice && (
              <Callout tone="success" role="status">
                {notice}
              </Callout>
            )}
            {resolved && (
              <p className="flex items-center gap-2 rounded-lg border border-success-ring bg-success-soft px-4 py-3 text-sm font-semibold text-emerald-800">
                <CheckCircle2 size={18} aria-hidden />
                Resolvida{live?.correctedOn ? ` em ${formatDate(live.correctedOn)}` : ''}
              </p>
            )}

            <fieldset disabled={locked} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Local (pavimento)">
                  <select
                    className="field min-h-11"
                    value={form.floorId}
                    required
                    onChange={e => setForm(current => ({ ...current, floorId: e.target.value, unitId: '' }))}
                  >
                    {!form.floorId && <option value="">Escolha o pavimento</option>}
                    {floors.map(floor => (
                      <option key={floor.id} value={floor.id}>
                        {floor.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Apto">
                  <select className="field min-h-11" value={form.unitId} onChange={e => set('unitId', e.target.value)}>
                    <option value="">— (pavimento / área comum)</option>
                    {units.map(unit => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field
                label="Descrição"
                hint={
                  form.description.length > TERMINALITY_LIMITS.maxDescription * 0.8
                    ? `${form.description.length} de ${TERMINALITY_LIMITS.maxDescription} caracteres`
                    : undefined
                }
              >
                <textarea
                  ref={descriptionRef}
                  className="field"
                  rows={3}
                  required
                  maxLength={TERMINALITY_LIMITS.maxDescription}
                  placeholder="Ex.: Rejunte falhando no box do banheiro social"
                  value={form.description}
                  onChange={e => set('description', e.target.value)}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Tipo">
                  <select className="field min-h-11" value={form.typeId} onChange={e => set('typeId', e.target.value)}>
                    <option value="">Sem tipo</option>
                    {types.map(type => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                        {type.active ? '' : ' (desativado)'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Data observação">
                  <input
                    className="field min-h-11"
                    type="date"
                    required
                    max={resolved && live?.correctedOn && live.correctedOn < today ? live.correctedOn : today}
                    value={form.observedOn}
                    onChange={e => set('observedOn', e.target.value)}
                  />
                </Field>
                <Field label="Responsável ATR">
                  <select className="field min-h-11" value={form.atrPersonId} onChange={e => set('atrPersonId', e.target.value)}>
                    <option value="">Não informado</option>
                    {people.map(person => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                        {person.active ? '' : ' (desativado)'}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Responsável Terceiro" hint={readOnly ? undefined : 'Escolha da lista ou digite o nome da empresa.'}>
                  <input
                    className="field min-h-11"
                    list="terminalidade-terceiros"
                    maxLength={TERMINALITY_LIMITS.maxName}
                    autoComplete="off"
                    placeholder="Empresa responsável"
                    value={form.contractor}
                    onChange={e => set('contractor', e.target.value)}
                  />
                  <datalist id="terminalidade-terceiros">
                    {contractorOptions.map(name => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </Field>
              </div>
            </fieldset>

            <section className="space-y-2" aria-labelledby="terminalidade-fotos-problema">
              <h4 id="terminalidade-fotos-problema" className="text-xs font-semibold text-slate-600">
                Fotos do problema
                {issuePhotos.length > 0 && <span className="ml-1 font-normal text-slate-500">({issuePhotos.length})</span>}
              </h4>
              {issuePhotos.length > 0 && (
                <PhotoGrid
                  photos={issuePhotos}
                  label="Foto do problema"
                  onOpen={index => setViewer({ photos: issuePhotos, index })}
                  onDelete={readOnly ? undefined : deletePhoto}
                  disabled={locked}
                />
              )}
              {readOnly ? (
                issuePhotos.length === 0 && <p className="text-sm text-slate-500">Sem fotos do problema.</p>
              ) : (
                <PhotoInput
                  value={pending}
                  onChange={setPending}
                  max={room}
                  disabled={busy}
                  onBusyChange={setPreparing}
                  emptyHint={issuePhotos.length === 0 ? 'Opcional, mas ajuda o terceiro a achar o problema.' : undefined}
                />
              )}
            </section>

            {correctionPhotos.length > 0 && (
              <section className="space-y-2" aria-labelledby="terminalidade-fotos-correcao">
                <h4 id="terminalidade-fotos-correcao" className="text-xs font-semibold text-slate-600">
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
                    Salvar e cadastrar outra
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
                    Excluir pendência
                  </button>
                )}
              </div>
            )}
          </form>
        )}
      </div>
      {viewer && (
        <PhotoViewer photos={refreshPhotos(viewer.photos, data.photos)} startIndex={viewer.index} onClose={() => setViewer(undefined)} />
      )}
    </dialog>
  );
}

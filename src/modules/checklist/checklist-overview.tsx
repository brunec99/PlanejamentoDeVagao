'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CheckCheck, Copy, Pencil, Plus, Printer, QrCode as QrIcon, RefreshCw, Trash2, X } from 'lucide-react';
import {
  ANSWER_LABEL,
  CHECKLIST_FREQUENCIES,
  CHECKLIST_LIMITS,
  FREQUENCY_LABEL,
  FREQUENCY_PERIOD,
  checklistBoard,
  checklistKey,
  checklistPublicPath,
  checklistSummary,
  equipmentTypes,
  formatChecklistDay,
  nonConformities,
  recentRuns,
  type ChecklistCommand,
  type ChecklistDue,
  type ChecklistEquipment,
  type ChecklistFrequency,
  type ChecklistModel,
  type ChecklistRun,
} from '@/domain/equipment-checklist';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { TabHeader } from '@/modules/layout/tab-header';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { fetchRunFiles, useChecklist, type RunFiles } from './api';
import { AnswerList, type AnswerDraft } from './answer-list';
import { QrCode } from './qr';
import { PhotoPicker, SignaturePad, type PhotoDraft } from './run-fields';

/** Tela da aba 9, Checklist de equipamentos (11/11/2026). De cima para baixo: os cartões do período, o
 * quadro (cada equipamento com os checklists devidos hoje, na semana e no mês), o formulário de inspeção
 * (abre ao clicar num checklist), as últimas inspeções e os modelos, que o TST edita. */

const STATUS_STYLE = {
  pending: 'border-amber-300 bg-amber-50 text-amber-900',
  done: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  nonconforming: 'border-red-300 bg-red-50 text-red-900',
} as const;

/** Assinatura e fotos de uma inspeção, buscadas quando ela é aberta (URLs assinadas de uma hora). */
function useRunFiles(workId: string, run: ChecklistRun | undefined): RunFiles | 'loading' | 'error' | undefined {
  const wanted = run && (run.signaturePath || run.photos.length) ? `${run.id}|${run.updatedAt}` : undefined;
  const [loaded, setLoaded] = useState<{ key: string; files: RunFiles | 'error' }>();
  useEffect(() => {
    if (!wanted) return;
    let active = true;
    fetchRunFiles(workId, wanted.split('|')[0])
      .then(files => active && setLoaded({ key: wanted, files }))
      .catch(() => active && setLoaded({ key: wanted, files: 'error' }));
    return () => {
      active = false;
    };
  }, [workId, wanted]);
  if (!wanted) return undefined;
  return loaded?.key === wanted ? loaded.files : 'loading';
}

const signedAtText = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** O que a inspeção guarda além das respostas: quem operou, a assinatura e as fotos. */
function RunEvidence({ workId, run }: { workId: string; run: ChecklistRun }) {
  const files = useRunFiles(workId, run);
  if (!run.operatorName && !run.signaturePath && !run.photos.length) return null;
  return (
    <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 text-sm text-slate-700">
      {run.operatorName && (
        <p>
          Operador: <strong>{run.operatorName}</strong>
          {run.source === 'link' && <span className="text-slate-500"> · preenchido pelo QR, sem login</span>}
        </p>
      )}
      {files === 'loading' && <p className="text-xs text-slate-500">Carregando assinatura e fotos…</p>}
      {files === 'error' && <p className="text-xs text-danger">Não foi possível carregar a assinatura e as fotos.</p>}
      {files && typeof files === 'object' && (
        <>
          {files.signatureUrl && (
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket privado */}
              <img
                src={files.signatureUrl}
                alt={`Assinatura de ${run.operatorName}`}
                className="h-20 rounded-lg border border-slate-200 bg-white"
              />
              <figcaption className="mt-0.5 text-xs text-slate-500">
                Assinado em {run.signedAt ? signedAtText(run.signedAt) : '—'}
              </figcaption>
            </figure>
          )}
          {files.photos.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {files.photos.map((photo, index) => (
                <li key={photo.id}>
                  <a href={photo.url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket privado */}
                    <img
                      src={photo.url}
                      alt={`Foto ${index + 1} da inspeção`}
                      className="size-20 rounded-lg border border-slate-200 object-cover"
                    />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/** O link do operador de um equipamento: o QR, o endereço para copiar, a etiqueta para imprimir e, para o
 * admin, a troca do segredo (a etiqueta antiga deixa de valer). */
function EquipmentLink({
  equipment,
  workId,
  canManage,
  busy,
  execute,
  onClose,
}: {
  equipment: ChecklistEquipment;
  workId: string;
  canManage: boolean;
  busy: boolean;
  execute: Execute;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  if (!equipment.publicToken)
    return (
      <div className="mt-3 w-full rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
        O link do operador ainda não existe: falta aplicar a migração 0048_checklist_operator.sql no Supabase.
      </div>
    );
  const url = `${window.location.origin}${checklistPublicPath(equipment.publicToken)}`;
  const rotate = async () => {
    const ok = await confirm({
      title: `Gerar um novo link para ${equipment.name}?`,
      description: 'A etiqueta já colada no equipamento deixa de funcionar. Será preciso imprimir e colar a nova.',
      confirmLabel: 'Gerar novo link',
      tone: 'danger',
    });
    if (ok) await execute({ type: 'rotate_equipment_token', id: equipment.id }, 'Link novo gerado: imprima a etiqueta de novo');
  };
  return (
    <div data-tour="checklist-qr" className="mt-3 flex w-full flex-wrap items-start gap-4 rounded-xl bg-slate-50 p-3">
      <QrCode value={url} size={132} label={`QR do checklist de ${equipment.name}`} />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-slate-700">
          Cole a etiqueta no equipamento. O operador aponta a câmera, preenche os checklists pendentes de <strong>{equipment.name}</strong>,
          tira fotos e assina, <strong>sem login</strong>. Quem tem este link só vê este equipamento.
        </p>
        <p className="break-all rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-600">{url}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="button-ghost"
            onClick={() =>
              navigator.clipboard.writeText(url).then(
                () => toast({ title: 'Link copiado' }),
                () => toast({ title: 'Não foi possível copiar', description: 'Selecione o endereço e copie à mão.', tone: 'danger' }),
              )
            }
          >
            <Copy size={15} aria-hidden />
            Copiar link
          </button>
          <a
            className="button-ghost"
            href={`/imprimir/checklist/${encodeURIComponent(workId)}?equipamento=${encodeURIComponent(equipment.id)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Printer size={15} aria-hidden />
            Imprimir etiqueta
          </a>
          {canManage && (
            <button type="button" className="button-ghost" disabled={busy} onClick={rotate}>
              <RefreshCw size={15} aria-hidden />
              Gerar novo link
            </button>
          )}
          <button type="button" className="button-ghost" onClick={onClose}>
            <X size={15} aria-hidden />
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function dueText(due: ChecklistDue): string {
  if (due.status === 'pending')
    return `pendente ${FREQUENCY_PERIOD[due.model.frequency]}${due.lastDoneOn ? ` · último em ${formatChecklistDay(due.lastDoneOn)}` : ''}`;
  const day = formatChecklistDay(due.run!.doneOn);
  const nc = nonConformities(due.run!);
  return nc ? `${nc} não conforme${nc > 1 ? 's' : ''} · ${day}` : `feito em ${day}`;
}

type Filling = { equipment: ChecklistEquipment; model?: ChecklistModel; run?: ChecklistRun };
type Execute = (command: ChecklistCommand, done?: string) => Promise<boolean>;

/** Formulário de inspeção: uma linha por item, com Conforme / Não conforme / Não se aplica. */
function RunForm({
  filling,
  workId,
  today,
  canEdit,
  busy,
  execute,
  onClose,
}: {
  filling: Filling;
  workId: string;
  today: string;
  canEdit: boolean;
  busy: boolean;
  execute: Execute;
  onClose: () => void;
}) {
  const { equipment, model, run } = filling;
  // Na edição valem os itens que a inspeção guardou; na nova, os do modelo.
  const items = run ? run.answers.map(a => ({ id: a.itemId, text: a.text })) : (model?.items ?? []);
  const [doneOn, setDoneOn] = useState(run?.doneOn ?? today);
  const [note, setNote] = useState(run?.note ?? '');
  const [answers, setAnswers] = useState<AnswerDraft>(() =>
    Object.fromEntries((run?.answers ?? []).map(a => [a.itemId, { answer: a.answer, note: a.note }])),
  );
  const [operatorName, setOperatorName] = useState(run?.operatorName ?? '');
  const [signature, setSignature] = useState<string>();
  const [resign, setResign] = useState(!run?.signaturePath);
  // As fotos já gravadas entram pelo id; a miniatura chega quando as URLs assinadas carregam.
  const [photos, setPhotos] = useState<PhotoDraft[]>(() => (run?.photos ?? []).map(p => ({ id: p.id })));
  const files = useRunFiles(workId, run);
  const fileUrls = new Map(typeof files === 'object' ? files.photos.map(p => [p.id, p.url]) : []);
  const signatureUrl = typeof files === 'object' ? files.signatureUrl : null;
  const title = run?.modelName ?? model?.name ?? '';
  const missing = items.filter(item => !answers[item.id]?.answer).length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await execute(
      {
        type: 'save_run',
        ...(run ? { id: run.id } : {}),
        workId,
        equipmentId: equipment.id,
        modelId: run?.modelId ?? model!.id,
        doneOn,
        answers: items.map(item => ({ itemId: item.id, answer: answers[item.id]!.answer!, note: answers[item.id]?.note ?? '' })),
        note,
        operatorName,
        ...(signature ? { signature } : {}),
        photos: photos.map(photo => ({ id: photo.id, ...(photo.data ? { data: photo.data } : {}) })),
      },
      'Inspeção registrada',
    );
    if (ok) onClose();
  };

  return (
    <section data-tour="checklist-form" className="panel mb-6 p-5" aria-labelledby="ck-form-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ck-form-title" className="text-base font-bold text-slate-900">
            {title} · {equipment.name}
          </h2>
          <p className="text-sm text-slate-500">
            {FREQUENCY_LABEL[run?.frequency ?? model!.frequency]} · {equipment.equipmentType}
            {run ? ' · editando a inspeção registrada' : ''}
          </p>
        </div>
        <button type="button" className="button-ghost" onClick={onClose}>
          <X size={15} aria-hidden />
          Fechar
        </button>
      </div>
      <form onSubmit={submit}>
        <fieldset disabled={!canEdit || busy} className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-700">
              Data da inspeção
              <input type="date" className="field mt-1" value={doneOn} max={today} onChange={e => setDoneOn(e.target.value)} required />
            </label>
            {canEdit && (
              <button
                type="button"
                className="button-ghost"
                onClick={() =>
                  setAnswers(current =>
                    Object.fromEntries(
                      items.map(item => [item.id, current[item.id]?.answer ? current[item.id] : { answer: 'c', note: '' }]),
                    ),
                  )
                }
              >
                <CheckCheck size={15} aria-hidden />
                Marcar os demais como conforme
              </button>
            )}
          </div>
          <AnswerList items={items} answers={answers} onChange={setAnswers} />
          <label className="block text-sm font-medium text-slate-700">
            Observação geral
            <input className="field mt-1" value={note} maxLength={CHECKLIST_LIMITS.note} onChange={e => setNote(e.target.value)} />
          </label>
          <div>
            <p className="mb-1 text-sm font-medium text-slate-700">Fotos (opcional, até {CHECKLIST_LIMITS.photos})</p>
            <PhotoPicker
              photos={photos.map(photo => (photo.data ? photo : { ...photo, url: fileUrls.get(photo.id) }))}
              onChange={setPhotos}
              disabled={!canEdit || busy}
            />
          </div>
          <div className="grid gap-4 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Operador do equipamento (opcional)
              <input
                className="field mt-1"
                value={operatorName}
                maxLength={CHECKLIST_LIMITS.operator}
                placeholder="Nome completo de quem opera"
                required={!!signature}
                onChange={e => setOperatorName(e.target.value)}
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Preenchendo junto com o operador, escreva o nome dele e peça a assinatura ao lado.
              </span>
            </label>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Assinatura do operador (opcional)</p>
              {resign ? (
                <SignaturePad onChange={setSignature} disabled={!canEdit || busy} />
              ) : (
                <>
                  {signatureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL assinada do bucket privado
                    <img
                      src={signatureUrl}
                      alt={`Assinatura de ${run?.operatorName ?? 'operador'}`}
                      className="h-20 rounded-lg border border-slate-200 bg-white"
                    />
                  ) : (
                    <p className="text-xs text-slate-500">
                      {files === 'error' ? 'Assinatura guardada (não foi possível exibir).' : 'Carregando a assinatura…'}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    {run?.signedAt ? `Assinado em ${signedAtText(run.signedAt)}. ` : ''}
                    {canEdit && (
                      <button type="button" className="text-link" onClick={() => setResign(true)}>
                        Assinar de novo
                      </button>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="button" disabled={busy || missing > 0}>
                {busy ? 'Gravando…' : run ? 'Salvar alterações' : 'Registrar inspeção'}
              </button>
              {missing > 0 && (
                <span className="text-xs text-slate-500">
                  {missing === 1 ? 'Falta responder 1 item.' : `Faltam responder ${missing} itens.`}
                </span>
              )}
            </div>
          )}
        </fieldset>
      </form>
    </section>
  );
}

type ItemDraft = { key: string; id?: string; text: string };
let draftKey = 0;
const newDraft = (text = '', id?: string): ItemDraft => ({ key: `i${draftKey++}`, ...(id ? { id } : {}), text });

/** Editor de um modelo: nome, tipo de equipamento, periodicidade e a lista ordenada de itens. */
function ModelEditor({
  model,
  types,
  busy,
  execute,
  onClose,
}: {
  model?: ChecklistModel;
  types: string[];
  busy: boolean;
  execute: Execute;
  onClose: () => void;
}) {
  const [name, setName] = useState(model?.name ?? '');
  const [equipmentType, setEquipmentType] = useState(model?.equipmentType ?? '');
  const [frequency, setFrequency] = useState<ChecklistFrequency>(model?.frequency ?? 'daily');
  const [items, setItems] = useState<ItemDraft[]>(() => (model ? model.items.map(item => newDraft(item.text, item.id)) : [newDraft()]));
  const [paste, setPaste] = useState('');

  const move = (index: number, delta: number) =>
    setItems(list => {
      const next = list.slice();
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await execute(
      {
        type: 'save_model',
        ...(model ? { id: model.id } : {}),
        name,
        equipmentType,
        frequency,
        items: items.filter(item => item.text.trim()).map(item => ({ ...(item.id ? { id: item.id } : {}), text: item.text })),
      },
      model ? 'Checklist atualizado' : 'Checklist criado',
    );
    if (ok) onClose();
  };

  return (
    <form onSubmit={submit} className="mb-4 rounded-xl bg-slate-50 p-4">
      <fieldset disabled={busy} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-12">
          <label className="text-sm font-medium text-slate-700 sm:col-span-5">
            Nome do checklist
            <input
              className="field mt-1"
              value={name}
              maxLength={80}
              required
              placeholder="Betoneira — diário"
              onChange={e => setName(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-4">
            Tipo de equipamento
            <input
              className="field mt-1"
              list="ck-types"
              value={equipmentType}
              maxLength={80}
              required
              placeholder="Betoneira"
              onChange={e => setEquipmentType(e.target.value)}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-3">
            Periodicidade
            <select className="field mt-1" value={frequency} onChange={e => setFrequency(e.target.value as ChecklistFrequency)}>
              {CHECKLIST_FREQUENCIES.map(option => (
                <option key={option} value={option}>
                  {FREQUENCY_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <datalist id="ck-types">
          {types.map(type => (
            <option key={type} value={type} />
          ))}
        </datalist>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Itens a conferir</p>
          <ol className="space-y-2">
            {items.map((item, index) => (
              <li key={item.key} className="flex items-center gap-2">
                <span className="w-6 text-right text-xs tabular-nums text-slate-400">{index + 1}.</span>
                <input
                  className="field flex-1"
                  aria-label={`Item ${index + 1}`}
                  value={item.text}
                  maxLength={200}
                  placeholder="Ex.: Proteção das partes móveis instalada e íntegra"
                  onChange={e => setItems(list => list.map(other => (other.key === item.key ? { ...other, text: e.target.value } : other)))}
                />
                <button
                  type="button"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30"
                  aria-label={`Subir o item ${index + 1}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30"
                  aria-label={`Descer o item ${index + 1}`}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={15} aria-hidden />
                </button>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-danger disabled:opacity-30"
                  aria-label={`Remover o item ${index + 1}`}
                  disabled={items.length === 1}
                  onClick={() => setItems(list => list.filter(other => other.key !== item.key))}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="text-link mt-2 text-xs" onClick={() => setItems(list => [...list, newDraft()])}>
            + Adicionar item
          </button>
        </div>
        <details>
          <summary className="cursor-pointer text-xs font-medium text-slate-600">Colar vários itens de uma vez (um por linha)</summary>
          <textarea
            className="field mt-2 h-28"
            aria-label="Itens, um por linha"
            value={paste}
            onChange={e => setPaste(e.target.value)}
            placeholder="Cole aqui a lista da ficha que vocês usam hoje"
          />
          <button
            type="button"
            className="button-ghost mt-2"
            disabled={!paste.trim()}
            onClick={() => {
              const lines = paste
                .split('\n')
                .map(line => line.replace(/^\s*(\d+[.)-]?|[-•*])\s*/, '').trim())
                .filter(Boolean);
              setItems(list => [...list.filter(item => item.text.trim()), ...lines.map(line => newDraft(line.slice(0, 200)))]);
              setPaste('');
            }}
          >
            Acrescentar à lista
          </button>
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Gravando…' : model ? 'Salvar checklist' : 'Criar checklist'}
          </button>
          <button type="button" className="button-ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
        {model && (
          <p className="text-xs text-slate-500">
            As inspeções já registradas guardam os itens como estavam no dia: editar aqui só vale daqui em diante.
          </p>
        )}
      </fieldset>
    </form>
  );
}

export function ChecklistOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const { state, reload, execute: send } = useChecklist(workId);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [filling, setFilling] = useState<{ equipmentId: string; modelId?: string; runId?: string }>();
  const [editingModel, setEditingModel] = useState<string | 'new'>();
  const [equipmentForm, setEquipmentForm] = useState({ name: '', equipmentType: '' });
  const [showInactive, setShowInactive] = useState(false);
  const [openRun, setOpenRun] = useState<string>();
  const [linkOf, setLinkOf] = useState<string>();

  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const work = planning.data.works.find(w => w.id === workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;

  const header = (
    <TabHeader
      workId={workId}
      section="checklist"
      helpTitle="Como funciona: checklist de equipamentos"
      description="A inspeção diária, semanal e mensal dos equipamentos da obra: o que está em dia, o que falta e onde há não conformidade."
      help={
        <>
          <p>
            O <strong>modelo</strong> é a ficha: um tipo de equipamento, uma periodicidade (diário, semanal ou mensal) e os itens a
            conferir. A lista de modelos é a mesma para todas as obras.
          </p>
          <p>
            O <strong>equipamento</strong> é o que existe nesta obra (“Betoneira 01”). Ele recebe todos os modelos do tipo dele.
          </p>
          <p>
            A <strong>inspeção</strong> é o modelo preenchido num dia: cada item é Conforme, Não conforme (com a descrição) ou Não se
            aplica. O quadro mostra o que falta hoje, nesta semana (segunda a domingo) e neste mês.
          </p>
          <p>
            Cada equipamento tem um <strong>QR</strong> para colar na máquina: o operador aponta a câmera do celular e preenche os
            checklists pendentes, com fotos e assinatura, sem login.
          </p>
          <p>
            Técnicos de segurança (TST) e administradores registram e corrigem inspeções. O cadastro de modelos e equipamentos e a troca do
            link do QR são só dos administradores. Os demais consultam.
          </p>
        </>
      }
    />
  );

  if (state.status === 'loading') return <LoadState rows={8} />;
  if (state.status === 'error')
    return (
      <>
        {header}
        <div className="panel space-y-4 p-6">
          <Callout tone="danger" role="alert">
            Não foi possível carregar os checklists. {state.message}
          </Callout>
          <button
            type="button"
            className="button-ghost"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              reload().finally(() => setRetrying(false));
            }}
          >
            <RefreshCw size={15} aria-hidden />
            {retrying ? 'Tentando…' : 'Tentar de novo'}
          </button>
        </div>
      </>
    );
  if (state.status === 'unavailable')
    return (
      <>
        {header}
        <Callout tone="warning" role="status">
          O checklist de equipamentos ainda não está disponível neste ambiente: falta aplicar a migração 0047_equipment_checklist.sql no
          Supabase. As demais abas seguem normais.
        </Callout>
      </>
    );

  const { data } = state;
  const { canEdit, canManage, today } = data;
  const board = checklistBoard(data, today);
  const summary = checklistSummary(board);
  const types = equipmentTypes(data);
  const history = recentRuns(data.runs).slice(0, 30);
  const equipmentById = new Map(data.equipment.map(e => [e.id, e]));
  const inactiveEquipment = data.equipment.filter(e => !e.active);
  const models = data.models
    .filter(m => showInactive || m.active)
    .sort((a, b) => a.equipmentType.localeCompare(b.equipmentType, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'));
  const inactiveModels = data.models.filter(m => !m.active).length;

  const execute: Execute = async (command, done) => {
    setBusy(true);
    try {
      await send(command);
      if (done) toast({ title: done });
      return true;
    } catch (error) {
      toast({ title: 'Não foi possível gravar', description: error instanceof Error ? error.message : undefined, tone: 'danger' });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const fillingEquipment = filling ? equipmentById.get(filling.equipmentId) : undefined;
  const fillingRun = filling?.runId ? data.runs.find(r => r.id === filling.runId) : undefined;
  const fillingModel = filling?.modelId ? data.models.find(m => m.id === filling.modelId) : undefined;
  const fillingReady = fillingEquipment && (fillingRun || fillingModel);

  const addEquipment = async (event: FormEvent) => {
    event.preventDefault();
    if (await execute({ type: 'save_equipment', workId, ...equipmentForm }, 'Equipamento cadastrado'))
      setEquipmentForm(form => ({ name: '', equipmentType: form.equipmentType }));
  };
  const renameEquipment = async (equipment: ChecklistEquipment) => {
    const name = window.prompt('Identificação do equipamento', equipment.name);
    if (name === null || name.trim() === equipment.name) return;
    await execute(
      { type: 'save_equipment', id: equipment.id, workId, name, equipmentType: equipment.equipmentType },
      'Equipamento renomeado',
    );
  };
  const deactivateEquipment = async (equipment: ChecklistEquipment) => {
    const ok = await confirm({
      title: `Desativar ${equipment.name}?`,
      description:
        'Ele sai do quadro (saiu da obra, por exemplo). As inspeções já registradas continuam no histórico, e dá para reativar depois.',
      confirmLabel: 'Desativar',
    });
    if (ok) await execute({ type: 'set_equipment_active', id: equipment.id, active: false }, 'Equipamento desativado');
  };
  const deleteRun = async (run: ChecklistRun) => {
    const ok = await confirm({
      title: 'Excluir esta inspeção?',
      description: `${run.modelName} · ${equipmentById.get(run.equipmentId)?.name ?? 'equipamento'} · ${formatChecklistDay(run.doneOn)}. Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (ok) await execute({ type: 'delete_run', id: run.id }, 'Inspeção excluída');
  };

  const pendingHint = (frequency: ChecklistFrequency) =>
    summary.due[frequency].total
      ? `de ${summary.due[frequency].total} ${FREQUENCY_LABEL[frequency].toLowerCase()}s`
      : 'nenhum checklist devido';

  return (
    <>
      {header}
      {!canEdit && (
        <div className="mb-4">
          <Callout tone="info">
            Você está em modo de consulta: técnicos de segurança (TST) e administradores registram inspeções, e o cadastro é dos
            administradores.
          </Callout>
        </div>
      )}

      <div data-tour="checklist-cards" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pendentes hoje"
          value={summary.due.daily.pending}
          tone={summary.due.daily.pending ? 'warning' : 'default'}
          hint={pendingHint('daily')}
        />
        <StatCard
          label="Pendentes na semana"
          value={summary.due.weekly.pending}
          tone={summary.due.weekly.pending ? 'warning' : 'default'}
          hint={pendingHint('weekly')}
        />
        <StatCard
          label="Pendentes no mês"
          value={summary.due.monthly.pending}
          tone={summary.due.monthly.pending ? 'warning' : 'default'}
          hint={pendingHint('monthly')}
        />
        <StatCard
          label="Com não conformidade"
          value={summary.nonconforming}
          tone={summary.nonconforming ? 'danger' : 'default'}
          hint="checklists do período corrente"
        />
      </div>

      {fillingReady && (
        <RunForm
          key={`${filling!.equipmentId}|${filling!.modelId ?? ''}|${filling!.runId ?? ''}`}
          filling={{ equipment: fillingEquipment, model: fillingModel, run: fillingRun }}
          workId={workId}
          today={today}
          canEdit={canEdit}
          busy={busy}
          execute={execute}
          onClose={() => setFilling(undefined)}
        />
      )}

      <section data-tour="checklist-board" className="panel mb-6 p-5" aria-labelledby="ck-board">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ck-board" className="text-base font-bold text-slate-900">
              Equipamentos da obra · {formatChecklistDay(today)}
            </h2>
            <p className="text-sm text-slate-500">
              {canEdit
                ? 'Clique num checklist para preencher ou abrir a inspeção do período. O QR de cada equipamento é o link do operador.'
                : 'Clique num checklist feito para ver as respostas.'}
            </p>
          </div>
          {canEdit && board.length > 0 && (
            <a className="button-ghost" href={`/imprimir/checklist/${encodeURIComponent(workId)}`} target="_blank" rel="noreferrer">
              <Printer size={15} aria-hidden />
              Imprimir etiquetas com QR
            </a>
          )}
        </div>
        {board.length === 0 ? (
          <Empty>
            {canManage
              ? 'Nenhum equipamento cadastrado nesta obra. Cadastre o primeiro abaixo.'
              : 'Nenhum equipamento cadastrado nesta obra ainda. O cadastro é feito pelos administradores.'}
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {board.map(row => (
              <li key={row.equipment.id} className="flex flex-wrap items-start gap-3 p-3">
                <div className="w-full min-w-0 sm:w-56">
                  <p className="truncate text-sm font-bold text-slate-800">{row.equipment.name}</p>
                  <p className="truncate text-xs text-slate-500">{row.equipment.equipmentType}</p>
                  {canEdit && (
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      <button
                        type="button"
                        className="text-link inline-flex items-center gap-1 text-xs"
                        aria-expanded={linkOf === row.equipment.id}
                        onClick={() => setLinkOf(linkOf === row.equipment.id ? undefined : row.equipment.id)}
                      >
                        <QrIcon size={13} aria-hidden />
                        QR do operador
                      </button>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            className="text-link text-xs"
                            disabled={busy}
                            onClick={() => renameEquipment(row.equipment)}
                          >
                            Renomear
                          </button>
                          <button
                            type="button"
                            className="text-link text-xs"
                            disabled={busy}
                            onClick={() => deactivateEquipment(row.equipment)}
                          >
                            Desativar
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                  {row.dues.length === 0 && (
                    <p className="text-xs text-warning">
                      Nenhum checklist para o tipo “{row.equipment.equipmentType}”. {canManage ? 'Crie um modelo abaixo.' : ''}
                    </p>
                  )}
                  {row.dues.map(due => {
                    const disabled = due.status === 'pending' && !canEdit;
                    return (
                      <button
                        key={due.model.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setFilling({ equipmentId: row.equipment.id, modelId: due.model.id, runId: due.run?.id })}
                        className={`min-h-11 rounded-lg border px-3 py-1.5 text-left transition-shadow enabled:hover:shadow-sm ${STATUS_STYLE[due.status]}`}
                      >
                        <span className="block text-xs font-bold">
                          {FREQUENCY_LABEL[due.model.frequency]} · {due.model.name}
                        </span>
                        <span className="block text-xs">{dueText(due)}</span>
                      </button>
                    );
                  })}
                </div>
                {canEdit && linkOf === row.equipment.id && (
                  <EquipmentLink
                    equipment={row.equipment}
                    workId={workId}
                    canManage={canManage}
                    busy={busy}
                    execute={execute}
                    onClose={() => setLinkOf(undefined)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <form onSubmit={addEquipment} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-12">
            <label className="text-xs font-medium text-slate-600 sm:col-span-5">
              Identificação do equipamento
              <input
                className="field mt-1"
                value={equipmentForm.name}
                maxLength={80}
                required
                placeholder="Betoneira 01"
                onChange={e => setEquipmentForm(form => ({ ...form, name: e.target.value }))}
              />
            </label>
            <label className="text-xs font-medium text-slate-600 sm:col-span-5">
              Tipo
              <input
                className="field mt-1"
                list="ck-types-equipment"
                value={equipmentForm.equipmentType}
                maxLength={80}
                required
                placeholder="Betoneira"
                onChange={e => setEquipmentForm(form => ({ ...form, equipmentType: e.target.value }))}
              />
              {equipmentForm.equipmentType.trim() && !types.some(t => checklistKey(t) === checklistKey(equipmentForm.equipmentType)) && (
                <span className="mt-1 block text-xs text-warning">Tipo novo: ainda sem checklist.</span>
              )}
            </label>
            <datalist id="ck-types-equipment">
              {types.map(type => (
                <option key={type} value={type} />
              ))}
            </datalist>
            <div className="flex items-end sm:col-span-2">
              <button type="submit" className="button w-full" disabled={busy}>
                <Plus size={15} aria-hidden />
                Cadastrar
              </button>
            </div>
          </form>
        )}
        {inactiveEquipment.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-slate-600">
              Equipamentos desativados ({inactiveEquipment.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {inactiveEquipment.map(equipment => (
                <li key={equipment.id} className="flex items-center gap-3 text-sm text-slate-600">
                  {equipment.name} · {equipment.equipmentType}
                  {canManage && (
                    <button
                      type="button"
                      className="text-link text-xs"
                      disabled={busy}
                      onClick={() => execute({ type: 'set_equipment_active', id: equipment.id, active: true }, 'Equipamento reativado')}
                    >
                      Reativar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section data-tour="checklist-history" className="panel mb-6 p-5" aria-labelledby="ck-history">
        <h2 id="ck-history" className="mb-1 text-base font-bold text-slate-900">
          Últimas inspeções
        </h2>
        <p className="mb-4 text-sm text-slate-500">As 30 mais recentes dos últimos 120 dias.</p>
        {history.length === 0 ? (
          <Empty>Nenhuma inspeção registrada ainda.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {history.map(run => {
              const nc = nonConformities(run);
              const open = openRun === run.id;
              const author = run.operatorName || planning.data.users.find(u => u.id === run.createdBy)?.name;
              return (
                <li key={run.id} className="p-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="w-24 text-sm tabular-nums text-slate-600">{formatChecklistDay(run.doneOn)}</span>
                    <span className="min-w-0 flex-1 text-sm text-slate-800">
                      <strong>{equipmentById.get(run.equipmentId)?.name ?? 'Equipamento'}</strong> · {run.modelName}
                      {author && <span className="text-slate-500"> · {author}</span>}
                      {run.source === 'link' && (
                        <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary-ink">
                          pelo QR
                        </span>
                      )}
                    </span>
                    <span className={`text-xs font-bold ${nc ? 'text-danger' : 'text-success'}`}>
                      {nc ? `${nc} não conforme${nc > 1 ? 's' : ''}` : 'Conforme'}
                    </span>
                    <button
                      type="button"
                      className="text-link text-xs"
                      aria-expanded={open}
                      onClick={() => setOpenRun(open ? undefined : run.id)}
                    >
                      {open ? 'Fechar' : 'Ver respostas'}
                    </button>
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Editar a inspeção"
                          onClick={() => {
                            setFilling({ equipmentId: run.equipmentId, modelId: run.modelId, runId: run.id });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                        >
                          <Pencil size={15} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-danger"
                          aria-label="Excluir a inspeção"
                          disabled={busy}
                          onClick={() => deleteRun(run)}
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </>
                    )}
                  </div>
                  {open && (
                    <ol className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3">
                      {run.answers.map((answer, index) => (
                        <li key={answer.itemId} className="text-sm text-slate-700">
                          <span className="mr-2 tabular-nums text-slate-400">{index + 1}.</span>
                          {answer.text} —{' '}
                          <strong
                            className={answer.answer === 'nc' ? 'text-danger' : answer.answer === 'c' ? 'text-success' : 'text-slate-500'}
                          >
                            {ANSWER_LABEL[answer.answer]}
                          </strong>
                          {answer.note && <span className="text-slate-600">: {answer.note}</span>}
                        </li>
                      ))}
                      {run.note && <li className="pt-1 text-sm text-slate-600">Observação: {run.note}</li>}
                      <li>
                        <RunEvidence workId={workId} run={run} />
                      </li>
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section data-tour="checklist-models" className="panel p-5" aria-labelledby="ck-models">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ck-models" className="text-base font-bold text-slate-900">
              Modelos de checklist
            </h2>
            <p className="text-sm text-slate-500">
              Lista única para todas as obras. Alterar aqui vale para todas. {canManage ? '' : 'Só administradores criam e editam.'}
            </p>
          </div>
          {canManage && editingModel === undefined && (
            <button type="button" className="button" onClick={() => setEditingModel('new')}>
              <Plus size={15} aria-hidden />
              Novo checklist
            </button>
          )}
        </div>
        {canManage && editingModel !== undefined && (
          <ModelEditor
            key={editingModel}
            model={editingModel === 'new' ? undefined : data.models.find(m => m.id === editingModel)}
            types={types}
            busy={busy}
            execute={execute}
            onClose={() => setEditingModel(undefined)}
          />
        )}
        {models.length === 0 ? (
          <Empty>
            {canManage
              ? 'Nenhum modelo ainda. Crie o primeiro com os itens da ficha que vocês usam hoje.'
              : 'Nenhum modelo cadastrado ainda. Os administradores criam os modelos.'}
          </Empty>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {models.map(model => (
              <li key={model.id} className="p-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1 text-sm text-slate-800">
                    <strong>{model.name}</strong>
                    <span className="text-slate-500">
                      {' '}
                      · {model.equipmentType} · {FREQUENCY_LABEL[model.frequency]} · {model.items.length}{' '}
                      {model.items.length === 1 ? 'item' : 'itens'}
                    </span>
                    {!model.active && <span className="ml-2 text-xs font-bold text-slate-500">Desativado</span>}
                  </span>
                  {canManage && (
                    <>
                      <button type="button" className="text-link text-xs" disabled={busy} onClick={() => setEditingModel(model.id)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="text-link text-xs"
                        disabled={busy}
                        onClick={() =>
                          execute(
                            { type: 'set_model_active', id: model.id, active: !model.active },
                            model.active ? 'Checklist desativado' : 'Checklist reativado',
                          )
                        }
                      >
                        {model.active ? 'Desativar' : 'Reativar'}
                      </button>
                    </>
                  )}
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-slate-500">Ver itens</summary>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-6 text-sm text-slate-700">
                    {model.items.map(item => (
                      <li key={item.id}>{item.text}</li>
                    ))}
                  </ol>
                </details>
              </li>
            ))}
          </ul>
        )}
        {inactiveModels > 0 && (
          <button type="button" className="text-link mt-3 text-xs" onClick={() => setShowInactive(value => !value)}>
            {showInactive ? 'Ocultar desativados' : `Mostrar desativados (${inactiveModels})`}
          </button>
        )}
      </section>
    </>
  );
}

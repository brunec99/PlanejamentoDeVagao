'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  PENDING_LIMITS,
  PENDING_STATUSES,
  PENDING_STATUS_LABELS,
  checklistProgress,
  isPendingStatus,
  startBy,
  statusNeedsReason,
  type PendingCard,
  type PendingChecklist,
  type PendingChecklistItem,
  type PendingCommand,
  type PendingStatus,
} from '@/domain/pending-board';
import type { LocalDate } from '@/domain/long-term-plan';
import { Callout } from '@/modules/planejamento/ui';
import { useConfirm } from '@/modules/layout/confirm';
import { formatDate } from '@/shared/format';
import { errorText, type PendingExecute, type PendingView } from './api';
import { MentionInput, MentionText } from './mention-input';
import { Avatar, Modal, OriginChip, ProgressBar, SignalChip } from './parts';
import {
  applyItemDone,
  canDeleteCard,
  dueDateEditable,
  extractMentions,
  isLinked,
  messagesOf,
  plural,
  sortPeople,
  stampLabel,
} from './pending-view';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const byOrder = <T extends { orderIndex: number; createdAt: string }>(a: T, b: T) =>
  a.orderIndex - b.orderIndex || a.createdAt.localeCompare(b.createdAt);

/** Campo que grava ao sair (ou no Enter, quando é de uma linha). Quem usa passa `key` com o valor
 * gravado, para o rascunho recomeçar quando o servidor devolve outro valor. */
function CommitField({
  value,
  onCommit,
  label,
  type = 'text',
  multiline = false,
  className = 'field',
  maxLength,
  min,
  max,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  type?: 'text' | 'date' | 'number';
  multiline?: boolean;
  className?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    if (draft.trim() !== value.trim()) onCommit(draft.trim());
  };
  if (multiline)
    return (
      <textarea
        className={className}
        aria-label={label}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
      />
    );
  return (
    <input
      className={className}
      aria-label={label}
      type={type}
      inputMode={type === 'number' ? 'numeric' : undefined}
      value={draft}
      maxLength={maxLength}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-100/80 px-3 py-2">
      <span className="block text-[11px] font-semibold text-slate-500">{label}</span>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{children}</div>
    </div>
  );
}
const FACT_INPUT =
  'w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold tabular-nums text-slate-900 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring';

/** Caixa de uma linha para acrescentar (item, checklist): Enter ou o botão grava e limpa. */
function AddLine({
  placeholder,
  label,
  maxLength,
  onAdd,
}: {
  placeholder: string;
  label: string;
  maxLength: number;
  onAdd: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    if (await onAdd(value)) setText('');
    setBusy(false);
  };
  return (
    <form className="flex items-center gap-2" onSubmit={submit}>
      <input
        className="field py-1.5"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        maxLength={maxLength}
        onChange={event => setText(event.target.value)}
      />
      <button type="submit" className="button-ghost shrink-0 py-1.5" disabled={busy || !text.trim()}>
        <Plus size={14} aria-hidden />
        {label}
      </button>
    </form>
  );
}

const ICON_BUTTON =
  'grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700';

function ChecklistBlock({
  checklist,
  items,
  run,
}: {
  checklist: PendingChecklist;
  items: PendingChecklistItem[];
  run: (command: PendingCommand, optimistic?: (data: PendingView) => PendingView) => Promise<boolean>;
}) {
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [editing, setEditing] = useState<string>();
  const done = items.filter(i => i.done).length;
  const remove = async () => {
    const ok = await confirm({
      title: `Excluir a checklist “${checklist.title}”?`,
      description: items.length > 0 ? `${plural(items.length, 'item será excluído', 'itens serão excluídos')} junto.` : undefined,
      confirmLabel: 'Excluir checklist',
      tone: 'danger',
    });
    if (ok) await run({ type: 'delete_checklist', checklistId: checklist.id });
  };
  return (
    <section className="space-y-2" aria-label={`Checklist ${checklist.title}`}>
      <div className="flex items-center justify-between gap-2">
        {renaming ? (
          <CommitFieldAuto
            value={checklist.title}
            label="Nome da checklist"
            maxLength={PENDING_LIMITS.checklistTitle}
            onDone={title => {
              setRenaming(false);
              if (title && title !== checklist.title) void run({ type: 'rename_checklist', checklistId: checklist.id, title });
            }}
          />
        ) : (
          <h4 className="min-w-0 break-words text-sm font-bold text-slate-900">Checklist · {checklist.title}</h4>
        )}
        <span className="flex shrink-0 items-center gap-1">
          <span className="mr-1 text-xs tabular-nums text-slate-500">
            {done} de {items.length}
          </span>
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label={`Renomear a checklist ${checklist.title}`}
            onClick={() => setRenaming(true)}
          >
            <Pencil size={14} aria-hidden />
          </button>
          <button type="button" className={ICON_BUTTON} aria-label={`Excluir a checklist ${checklist.title}`} onClick={remove}>
            <Trash2 size={14} aria-hidden />
          </button>
        </span>
      </div>
      <ProgressBar done={done} total={items.length} label={`Itens marcados de ${checklist.title}`} />
      <ul>
        {items.map(item => (
          <li key={item.id} className="group flex items-start gap-2 py-1">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 accent-emerald-700"
              checked={item.done}
              aria-label={item.text}
              onChange={event => {
                const next = event.target.checked;
                void run({ type: 'update_item', itemId: item.id, done: next }, data => ({
                  ...data,
                  ...applyItemDone(data, item.id, next),
                }));
              }}
            />
            {editing === item.id ? (
              <CommitFieldAuto
                value={item.text}
                label="Texto do item"
                maxLength={PENDING_LIMITS.itemText}
                onDone={text => {
                  setEditing(undefined);
                  if (text && text !== item.text) void run({ type: 'update_item', itemId: item.id, text });
                }}
              />
            ) : (
              <button
                type="button"
                title="Editar o item"
                onClick={() => setEditing(item.id)}
                className={`min-w-0 flex-1 break-words rounded text-left text-sm leading-6 ${item.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}
              >
                {item.text}
              </button>
            )}
            <button
              type="button"
              className={`${ICON_BUTTON} opacity-60 group-hover:opacity-100 focus-visible:opacity-100`}
              aria-label={`Excluir o item ${item.text}`}
              onClick={() => void run({ type: 'delete_item', itemId: item.id })}
            >
              <X size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <AddLine
        label="Item"
        placeholder="Novo item"
        maxLength={PENDING_LIMITS.itemText}
        onAdd={text => run({ type: 'add_item', checklistId: checklist.id, text })}
      />
    </section>
  );
}

/** Edição no lugar (nome da checklist, texto do item): já abre com o foco, grava ao sair ou no Enter. O
 * Esc desiste sem fechar o card. */
function CommitFieldAuto({
  value,
  label,
  maxLength,
  onDone,
}: {
  value: string;
  label: string;
  maxLength: number;
  onDone: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  return (
    <input
      className="field min-w-0 flex-1 py-1"
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      autoFocus
      onChange={event => setDraft(event.target.value)}
      onBlur={() => onDone(cancelled.current ? undefined : draft.trim())}
      onKeyDown={event => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** O card aberto (modelo aprovado): à esquerda a coluna, a origem, os fatos do prazo e as checklists; à
 * direita a conversa com menções. Cada campo grava ao sair; os erros aparecem aqui dentro, porque o
 * diálogo cobre os avisos da página. */
export function PendingCardDialog({
  card,
  data,
  today,
  nameOf,
  execute,
  onMove,
  onDelete,
  onClose,
}: {
  card: PendingCard;
  data: PendingView;
  today: LocalDate;
  nameOf: (id: string) => string;
  execute: PendingExecute;
  /** Muda de coluna pelas regras do quadro (motivo, confirmação). Lança o erro do servidor. */
  onMove: (status: PendingStatus) => Promise<void>;
  /** Exclui o card (já confirmado). Lança o erro do servidor. */
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState('');
  const thread = useRef<HTMLDivElement>(null);

  const checklists = data.checklists.filter(c => c.cardId === card.id).sort(byOrder);
  const messages = messagesOf(data.messages, card.id);
  const progress = checklistProgress(data.items, card.id);
  const people = sortPeople(data.people);
  const linked = isLinked(card);
  const service = card.origin === 'longo_prazo';

  // A conversa abre e acompanha no fim, onde está a mensagem mais nova.
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [messages.length]);

  /** Grava e mostra o erro aqui dentro; devolve se deu certo. */
  const run = async (command: PendingCommand, optimistic?: (view: PendingView) => PendingView) => {
    setError('');
    try {
      await execute(command, optimistic);
      return true;
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível gravar.'));
      return false;
    }
  };
  const update = (fields: Omit<Extract<PendingCommand, { type: 'update_card' }>, 'type' | 'cardId'>) =>
    run({ type: 'update_card', cardId: card.id, ...fields });
  const move = async (status: PendingStatus) => {
    if (status === card.status) return;
    setError('');
    try {
      await onMove(status);
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível mover o card.'));
    }
  };
  const send = async () => {
    const body = message.trim();
    if (!body || sending) return;
    setSending(true);
    setChatError('');
    try {
      await execute({ type: 'add_message', cardId: card.id, body, mentions: extractMentions(body, data.people) });
      setMessage('');
    } catch (cause) {
      setChatError(errorText(cause, 'Não foi possível enviar a mensagem.'));
    } finally {
      setSending(false);
    }
  };
  const remove = async () => {
    const ok = await confirm({
      title: 'Excluir este card?',
      description: `“${card.title}” sai do quadro com a conversa e as checklists. Não dá para desfazer.`,
      confirmLabel: 'Excluir card',
      tone: 'danger',
    });
    if (!ok) return;
    setError('');
    try {
      await onDelete();
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível excluir o card.'));
    }
  };

  // "a tarefa “Piso do térreo” do médio prazo" / "o serviço “Esquadrias” do longo prazo".
  const sourceTail = `${card.sourceLabel ? ` “${card.sourceLabel}”` : ''} ${service ? 'do longo prazo' : 'do médio prazo'}`;
  const sourceNote = !linked
    ? undefined
    : card.sourceMissing
      ? `${service ? 'O serviço' : 'A tarefa'}${sourceTail} não existe mais: a entrega ficou congelada em ${formatDate(card.dueDate)}.`
      : `A entrega acompanha ${service ? 'o serviço' : 'a tarefa'}${sourceTail}${card.sourceStart ? ` (início em ${formatDate(card.sourceStart)})` : ''}: é o dia útil anterior ao início. Se ${service ? 'o serviço' : 'a tarefa'} mudar de data, a entrega muda junto.`;

  return (
    <Modal onClose={onClose} labelledBy="pendencia-card-titulo" width="xl">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              Coluna
              <select
                className="rounded-full border border-primary-ring bg-primary-soft py-1 pl-3 pr-7 text-xs font-semibold text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={card.status}
                onChange={event => {
                  if (isPendingStatus(event.target.value)) void move(event.target.value);
                }}
              >
                {PENDING_STATUSES.map(status => (
                  <option key={status} value={status}>
                    {PENDING_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <OriginChip card={card} />
            <SignalChip card={card} today={today} />
          </div>
          <button type="button" className="button-ghost" onClick={onClose}>
            Fechar
          </button>
        </div>

        {error && (
          <div className="mt-3">
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          </div>
        )}

        <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <h3 id="pendencia-card-titulo" className="sr-only">
              {card.title}
            </h3>
            <CommitField
              key={`titulo-${card.title}`}
              value={card.title}
              label="Pendência"
              maxLength={PENDING_LIMITS.title}
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-bold text-slate-900 hover:border-slate-200 focus-visible:border-primary focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring -mx-2"
              onCommit={title => {
                if (title) void update({ title });
              }}
            />
            {statusNeedsReason(card.status) && card.statusReason && (
              <p className="break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-700">Motivo {card.status === 'cancelled' ? 'do cancelamento' : 'da pausa'}:</span>{' '}
                {card.statusReason}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Fact label="Entrega">
                {dueDateEditable(card) ? (
                  <CommitField
                    key={`entrega-${card.dueDate}`}
                    value={card.dueDate}
                    label="Data de entrega"
                    type="date"
                    className={FACT_INPUT}
                    onCommit={dueDate => {
                      if (ISO_DATE.test(dueDate)) void update({ dueDate });
                      else setError('Informe uma data de entrega válida.');
                    }}
                  />
                ) : (
                  formatDate(card.dueDate)
                )}
              </Fact>
              <Fact label="Tempo de execução (dias úteis)">
                <CommitField
                  key={`prazo-${card.leadTimeDays}`}
                  value={String(card.leadTimeDays)}
                  label="Tempo de execução em dias úteis"
                  type="number"
                  min={0}
                  max={PENDING_LIMITS.leadTime}
                  className={FACT_INPUT}
                  onCommit={text => {
                    const days = Number(text);
                    if (text !== '' && Number.isInteger(days) && days >= 0 && days <= PENDING_LIMITS.leadTime)
                      void update({ leadTimeDays: days });
                    else setError(`O tempo de execução é um número inteiro de dias úteis, de 0 a ${PENDING_LIMITS.leadTime}.`);
                  }}
                />
              </Fact>
              <Fact label="Começar até">{formatDate(startBy(card))}</Fact>
              <Fact label="Responsável">
                <select
                  className={FACT_INPUT}
                  aria-label="Responsável"
                  value={card.responsibleId}
                  onChange={event => void update({ responsibleId: event.target.value })}
                >
                  {!people.some(p => p.id === card.responsibleId) && (
                    <option value={card.responsibleId}>{nameOf(card.responsibleId)}</option>
                  )}
                  {people.map(person => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </Fact>
            </div>
            {sourceNote && <p className="text-xs leading-5 text-slate-500">{sourceNote}</p>}
            <CommitField
              key={`descricao-${card.description ?? ''}`}
              value={card.description ?? ''}
              label="Descrição"
              multiline
              maxLength={PENDING_LIMITS.description}
              placeholder="Descrição (opcional)"
              className="field min-h-16 resize-y"
              onCommit={description => void update({ description })}
            />

            <div className="space-y-5 border-t border-slate-100 pt-4">
              {progress.total > 0 && checklists.length > 1 && (
                <p className="text-xs font-semibold text-slate-500">
                  Checklists: {progress.done} de {progress.total} itens marcados
                </p>
              )}
              {checklists.map(checklist => (
                <ChecklistBlock
                  key={checklist.id}
                  checklist={checklist}
                  items={data.items.filter(i => i.checklistId === checklist.id).sort(byOrder)}
                  run={run}
                />
              ))}
              <AddLine
                label="Checklist"
                placeholder="Nome da nova checklist"
                maxLength={PENDING_LIMITS.checklistTitle}
                onAdd={title => run({ type: 'create_checklist', cardId: card.id, title })}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
              <span>
                Criado por {nameOf(card.createdBy)} em {stampLabel(card.createdAt)}
              </span>
              {canDeleteCard(card, data.actorId, data.admin) && (
                <button
                  type="button"
                  className="button-ghost py-1.5 text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-800"
                  onClick={remove}
                >
                  <Trash2 size={14} aria-hidden />
                  Excluir card
                </button>
              )}
            </div>
          </div>

          <section className="flex min-w-0 flex-col gap-3" aria-label="Conversa">
            <h4 className="text-sm font-bold text-slate-900">Conversa</h4>
            <div
              ref={thread}
              className="custom-scrollbar max-h-[26rem] space-y-3 overflow-y-auto pr-1"
              role="log"
              aria-label="Mensagens do card"
            >
              {messages.length === 0 && <p className="text-sm text-slate-500">Nenhuma mensagem ainda.</p>}
              {messages.map(m =>
                m.kind === 'system' ? (
                  <p key={m.id} className="break-words pl-9 text-xs leading-5 text-slate-500">
                    {nameOf(m.authorId)} {m.body} · {stampLabel(m.createdAt)}
                  </p>
                ) : (
                  <div key={m.id} className="flex gap-2">
                    <Avatar name={nameOf(m.authorId)} size="md" />
                    <div className="min-w-0 rounded-xl bg-slate-100/80 px-3 py-2">
                      <p className="text-xs text-slate-500">
                        <strong className="text-slate-800">{nameOf(m.authorId)}</strong> · {stampLabel(m.createdAt)}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
                        <MentionText body={m.body} people={data.people.filter(p => m.mentions.includes(p.id))} />
                      </p>
                    </div>
                  </div>
                ),
              )}
            </div>
            <MentionInput value={message} onChange={setMessage} onSubmit={send} people={people} disabled={sending} />
            {chatError && (
              <Callout tone="danger" role="alert">
                {chatError}
              </Callout>
            )}
            <p className="text-xs text-slate-500">Quem é marcado recebe um e-mail com a mensagem e o link do card.</p>
          </section>
        </div>
      </div>
    </Modal>
  );
}

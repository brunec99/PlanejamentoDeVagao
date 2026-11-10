'use client';
import type { DragEvent } from 'react';
import { MessageSquare, MoreVertical, SquareCheckBig } from 'lucide-react';
import {
  PENDING_STATUSES,
  PENDING_STATUS_LABELS,
  isPendingStatus,
  statusNeedsReason,
  type PendingCard,
  type PendingStatus,
} from '@/domain/pending-board';
import type { LocalDate } from '@/domain/long-term-plan';
import { Avatar, OriginChip, ProgressBar, SignalChip } from './parts';
import { dueLabel } from './pending-view';

/** A face do card no quadro (modelo aprovado): título, origem, sinal de prazo, motivo da pausa ou do
 * cancelamento, barra das checklists e o rodapé com a entrega, o total marcado, as mensagens e o
 * responsável. Arrasta-se o card inteiro; o menu "⋮" move sem arrastar (teclado e celular). */
export function PendingCardFace({
  card,
  today,
  responsible,
  progress,
  messages,
  selected,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
  onDragOver,
}: {
  card: PendingCard;
  today: LocalDate;
  responsible: string;
  progress: { done: number; total: number };
  messages: number;
  selected: boolean;
  dragging: boolean;
  onOpen: () => void;
  onMove: (status: PendingStatus) => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={onOpen}
      aria-label={card.title}
      className={`flex cursor-grab flex-col gap-2 rounded-xl border bg-white p-3 shadow-sm transition-[box-shadow,opacity] hover:shadow-md active:cursor-grabbing ${selected ? 'border-primary ring-2 ring-primary-ring' : 'border-slate-200'} ${dragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onOpen();
          }}
          className="min-w-0 flex-1 rounded text-left text-sm font-semibold leading-snug text-slate-900 hover:text-primary-strong"
        >
          <span className="break-words">{card.title}</span>
        </button>
        {/* O seletor nativo fica invisível por cima do ícone: abre a lista do sistema no celular e no teclado. */}
        <label
          onClick={event => event.stopPropagation()}
          className="relative -mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-within:ring-2 focus-within:ring-primary"
        >
          <MoreVertical size={15} aria-hidden />
          <span className="sr-only">Mover “{card.title}” para outra coluna</span>
          <select
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            value={card.status}
            onChange={event => {
              if (isPendingStatus(event.target.value) && event.target.value !== card.status) onMove(event.target.value);
            }}
          >
            <optgroup label="Mover para">
              {PENDING_STATUSES.map(status => (
                <option key={status} value={status}>
                  {PENDING_STATUS_LABELS[status]}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        <OriginChip card={card} />
        <SignalChip card={card} today={today} />
      </div>
      {statusNeedsReason(card.status) && card.statusReason && (
        <p className="break-words text-xs leading-5 text-slate-500">Motivo: {card.statusReason}</p>
      )}
      {progress.total > 0 && <ProgressBar done={progress.done} total={progress.total} label="Itens marcados das checklists" />}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs tabular-nums text-slate-500">
        <span className="whitespace-nowrap" title="Entrega e tempo de execução em dias úteis">
          {dueLabel(card)}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {progress.total > 0 && (
            <span className="inline-flex items-center gap-1" title="Itens marcados das checklists">
              <SquareCheckBig size={13} aria-hidden />
              <span className="sr-only">Checklist:</span>
              {progress.done}/{progress.total}
            </span>
          )}
          {messages > 0 && (
            <span className="inline-flex items-center gap-1" title="Mensagens na conversa">
              <MessageSquare size={13} aria-hidden />
              <span className="sr-only">Mensagens:</span>
              {messages}
            </span>
          )}
          <Avatar name={responsible} />
        </span>
      </div>
    </article>
  );
}

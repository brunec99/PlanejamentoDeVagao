'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import type { PendingCard, PendingSignal } from '@/domain/pending-board';
import type { LocalDate } from '@/domain/long-term-plan';
import { workPath } from '@/shared/format';
import { initials, isLinked, originLabel, progressPercent, signalChip } from './pending-view';

/** Peças pequenas da lista de pendência, usadas no quadro, no card aberto e no formulário de criação. */

/** Endereço do Quadro de Restrições (aba 1.4 desde 12/11/2026; antes, `vagoes?visao=pendencias`, que ainda
 * redireciona para cá). Com `cardId`, já abre o card (é o link do e-mail). */
export const pendingPath = (workId: string, cardId?: string) =>
  `${workPath(workId, 'restricoes')}${cardId ? `?card=${encodeURIComponent(cardId)}` : ''}`;

const CHIP = 'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 ring-1 ring-inset';
export const SIGNAL_TONE: Record<PendingSignal, string> = {
  late: 'bg-danger-soft text-rose-800 ring-danger-ring',
  soon: 'bg-warning-soft text-amber-800 ring-warning-ring',
  ok: 'bg-success-soft text-emerald-800 ring-success-ring',
  closed: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function Chip({ tone, title, children }: { tone: string; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`${CHIP} ${tone}`}>
      <span className="truncate">{children}</span>
    </span>
  );
}
/** Chip de prazo do card (regra 3): a cor reforça, o texto diz. */
export function SignalChip({ card, today }: { card: PendingCard; today: LocalDate }) {
  const chip = signalChip(card, today);
  return <Chip tone={SIGNAL_TONE[chip.signal]}>{chip.text}</Chip>;
}
/** De onde o card veio (regras 4 e 5). */
export function OriginChip({ card }: { card: PendingCard }) {
  const label = originLabel(card);
  return (
    <Chip
      tone={isLinked(card) ? 'bg-primary-soft text-primary-ink ring-primary-ring' : 'bg-slate-100 text-slate-600 ring-slate-200'}
      title={label}
    >
      {label}
    </Chip>
  );
}

export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  return (
    <span
      title={name}
      className={`inline-grid shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-primary-strong ring-1 ring-primary-ring ${size === 'md' ? 'h-7 w-7 text-[11px]' : 'h-6 w-6 text-[10px]'}`}
    >
      <span aria-hidden>{initials(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = progressPercent(done, total);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 overflow-hidden rounded-full bg-slate-100"
    >
      <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}

const WIDTHS = { sm: 'w-[min(26rem,94vw)]', md: 'w-[min(34rem,94vw)]', xl: 'w-[min(68rem,96vw)]' } as const;

/** Diálogo modal nativo (`<dialog>`), como os das abas 5 e 6: foco preso, Esc fecha, fundo escurecido.
 * Existe enquanto está montado: quem abre monta, quem fecha desmonta. `busy` segura o Esc no meio de
 * uma gravação. */
export function Modal({
  onClose,
  labelledBy,
  busy = false,
  width = 'md',
  children,
}: {
  onClose: () => void;
  labelledBy: string;
  busy?: boolean;
  width?: keyof typeof WIDTHS;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      // O React repassa `cancel`/`close` de um <dialog> interno para estes handlers; só reage ao próprio.
      onCancel={event => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClose={event => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby={labelledBy}
      className={`custom-scrollbar m-auto max-h-[92dvh] ${WIDTHS[width]} overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55`}
    >
      {children}
    </dialog>
  );
}

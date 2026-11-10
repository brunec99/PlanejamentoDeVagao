'use client';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { SendHorizontal } from 'lucide-react';
import { PENDING_LIMITS, type PendingPerson } from '@/domain/pending-board';
import { Avatar } from './parts';
import { applyMention, matchPeople, mentionQuery, splitMentions } from './pending-view';

/** Texto de uma mensagem com as menções realçadas (regra 6). O corpo guarda "@Nome Completo" em texto
 * puro; aqui ele é quebrado pelos nomes de quem foi marcado. */
export function MentionText({ body, people }: { body: string; people: readonly PendingPerson[] }): ReactNode {
  return splitMentions(body, people).map((segment, index) =>
    segment.personId ? (
      <span key={index} className="rounded bg-primary-soft px-0.5 font-semibold text-primary-strong">
        {segment.text}
      </span>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  );
}

/** Caixa da conversa com o @ (regra 6): digitar @ abre a lista de quem tem a obra liberada, que filtra
 * conforme se escreve; setas e Enter (ou o clique) escolhem. Enter envia; Shift+Enter quebra a linha. */
export function MentionInput({
  value,
  onChange,
  onSubmit,
  people,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  people: readonly PendingPerson[];
  disabled?: boolean;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  // Esc fecha a lista para aquele @; ela volta quando o texto muda.
  const [dismissed, setDismissed] = useState<string>();

  const mention = mentionQuery(value, caret);
  const options = mention && dismissed !== value ? matchPeople(people, mention.query) : [];
  const open = options.length > 0;
  const current = Math.min(active, options.length - 1);

  const sync = (element: HTMLTextAreaElement) => setCaret(element.selectionStart ?? element.value.length);
  const pick = (person: PendingPerson) => {
    if (!mention) return;
    const next = applyMention(value, mention.start, caret, person);
    onChange(next.text);
    setCaret(next.caret);
    setActive(0);
    // O cursor só pode ser reposto depois que o React escrever o texto novo no campo.
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(next.caret, next.caret);
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((current + step + options.length) % options.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(options[current]);
        return;
      }
      if (event.key === 'Escape') {
        // Fecha só a lista: sem isto o Esc fecharia o card inteiro.
        event.preventDefault();
        event.stopPropagation();
        setDismissed(value);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (value.trim()) onSubmit();
    }
  };

  return (
    <div className="relative">
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Pessoas para marcar"
          className="absolute bottom-full left-0 z-10 mb-1 max-h-60 w-64 max-w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          {options.map((person, index) => (
            <li
              key={person.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === current}
              // `mousedown` e não `click`: o clique tiraria o foco do campo antes de escolher.
              onMouseDown={event => {
                event.preventDefault();
                pick(person);
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-800 ${index === current ? 'bg-primary-soft' : ''}`}
            >
              <Avatar name={person.name} />
              <span className="truncate">{person.name}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={field}
          className="field min-h-[2.75rem] flex-1 resize-y"
          rows={2}
          maxLength={PENDING_LIMITS.message}
          value={value}
          // Só leitura durante o envio: `disabled` tiraria o foco do campo.
          readOnly={disabled}
          placeholder="Escreva uma mensagem. Use @ para marcar alguém…"
          aria-label="Mensagem"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open ? `${listId}-${current}` : undefined}
          onChange={event => {
            onChange(event.target.value);
            sync(event.target);
            setActive(0);
          }}
          onSelect={event => sync(event.currentTarget)}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="button min-h-[2.75rem]" disabled={disabled || !value.trim()} onClick={onSubmit}>
          <SendHorizontal size={15} aria-hidden />
          Enviar
        </button>
      </div>
    </div>
  );
}

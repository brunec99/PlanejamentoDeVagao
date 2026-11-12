'use client';
import {
  ANSWER_LABEL,
  CHECKLIST_ANSWERS,
  CHECKLIST_LIMITS,
  type ChecklistAnswer,
  type ChecklistModelItem,
} from '@/domain/equipment-checklist';

/** A lista de itens com C / NC / N/A, dividida entre a tela logada e a do operador (12/11/2026). */

export type AnswerDraft = Record<string, { answer?: ChecklistAnswer; note: string }>;

const ANSWER_STYLE: Record<ChecklistAnswer, string> = {
  c: 'bg-emerald-600 text-white',
  nc: 'bg-red-600 text-white',
  na: 'bg-slate-600 text-white',
};
const ANSWER_SHORT: Record<ChecklistAnswer, string> = { c: 'C', nc: 'NC', na: 'N/A' };

export function AnswerList({
  items,
  answers,
  onChange,
  large,
}: {
  items: ChecklistModelItem[];
  answers: AnswerDraft;
  onChange: (update: (current: AnswerDraft) => AnswerDraft) => void;
  /** Botões maiores e empilhados, para o dedo no celular. */
  large?: boolean;
}) {
  return (
    <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {items.map((item, index) => {
        const current = answers[item.id];
        return (
          <li key={item.id} className="p-3">
            <div className={large ? 'space-y-2' : 'flex flex-wrap items-center justify-between gap-2'}>
              <p className="min-w-0 flex-1 text-sm text-slate-800">
                <span className="mr-2 tabular-nums text-slate-400">{index + 1}.</span>
                {item.text}
              </p>
              <div
                role="radiogroup"
                aria-label={`Item ${index + 1}: ${item.text}`}
                className={`gap-1 rounded-lg bg-slate-100 p-1 ${large ? 'grid grid-cols-3' : 'inline-flex'}`}
              >
                {CHECKLIST_ANSWERS.map(option => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={current?.answer === option}
                    title={ANSWER_LABEL[option]}
                    onClick={() => onChange(all => ({ ...all, [item.id]: { answer: option, note: all[item.id]?.note ?? '' } }))}
                    className={`min-w-11 rounded-md px-2.5 text-xs font-bold transition-colors ${large ? 'min-h-11 text-sm' : 'min-h-9'} ${current?.answer === option ? ANSWER_STYLE[option] : 'text-slate-600 hover:bg-white'}`}
                  >
                    {ANSWER_SHORT[option]}
                  </button>
                ))}
              </div>
            </div>
            {(current?.answer === 'nc' || current?.note) && (
              <input
                className="field mt-2"
                aria-label={`Observação do item ${index + 1}`}
                placeholder={current?.answer === 'nc' ? 'Descreva a não conformidade (obrigatório)' : 'Observação'}
                value={current?.note ?? ''}
                maxLength={CHECKLIST_LIMITS.note}
                required={current?.answer === 'nc'}
                onChange={e => onChange(all => ({ ...all, [item.id]: { ...all[item.id], note: e.target.value } }))}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

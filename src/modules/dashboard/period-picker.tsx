'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  DASHBOARD_SCALES,
  GROUPING_NOUN,
  periodOptions,
  stepPeriod,
  switchScale,
  type DashboardPeriod,
  type GroupingChoice,
  type PeriodContext,
  type PeriodSelection,
} from './period';

/** O seletor de escala e período (04/11/2026, regra 4 do modelo "Dashboard geral e escalas de tempo"), o mesmo
 * na aba 0 de cada obra e no Dashboard geral. São duas peças, para cada tela pôr a marca do tour em cada uma:
 * os botões de escala e, ao lado, o período (lista com setas ‹ › ou, no personalizado, "de", "até" e
 * "Agrupar por"). Trocar de escala mantém o lugar (`switchScale`). */

export function ScaleButtons({ period, onChange }: { period: DashboardPeriod; onChange: (selection: PeriodSelection) => void }) {
  return (
    <span
      role="group"
      aria-label="Escala de tempo"
      className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm"
    >
      {DASHBOARD_SCALES.map(scale => {
        const on = period.scale === scale.id;
        return (
          <button
            key={scale.id}
            type="button"
            aria-pressed={on}
            onClick={() => !on && onChange(switchScale(period, scale.id))}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              on ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {scale.label}
          </button>
        );
      })}
    </span>
  );
}

const GROUPING_CHOICES: { id: GroupingChoice; label: (period: DashboardPeriod) => string }[] = [
  { id: 'auto', label: period => `Agrupar: automático (por ${GROUPING_NOUN[period.grouping].one})` },
  { id: 'semana', label: () => 'Agrupar por semana' },
  { id: 'mes', label: () => 'Agrupar por mês' },
  { id: 'trimestre', label: () => 'Agrupar por trimestre' },
];
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** O período da escala escolhida. `optionLabel` troca o rótulo das opções (a aba 0 numera as semanas como a
 * planilha: "64 · 26/10 a 31/10"); `idPrefix` separa os `id` quando há dois seletores na página. */
export function PeriodControl({
  period,
  context,
  onChange,
  optionLabel,
  idPrefix = 'periodo',
}: {
  period: DashboardPeriod;
  context: PeriodContext;
  onChange: (selection: PeriodSelection) => void;
  optionLabel?: (option: { key: string; label: string; current: boolean; firstWeek: string }) => string;
  idPrefix?: string;
}) {
  const back = stepPeriod(period, -1, context);
  const forward = stepPeriod(period, 1, context);
  const arrows = (
    <>
      <button
        type="button"
        className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        aria-label="Período anterior"
        disabled={!back}
        onClick={() => back && onChange(back)}
      >
        <ChevronLeft size={15} aria-hidden />
      </button>
    </>
  );
  const next = (
    <button
      type="button"
      className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      aria-label="Próximo período"
      disabled={!forward}
      onClick={() => forward && onChange(forward)}
    >
      <ChevronRight size={15} aria-hidden />
    </button>
  );

  if (period.scale === 'personalizado') {
    const choice = period.groupingChoice ?? 'auto';
    const custom = (from: string, to: string, grouping: GroupingChoice) =>
      isDate(from) && isDate(to) && onChange({ scale: 'personalizado', from, to, grouping });
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {arrows}
        <label className="sr-only" htmlFor={`${idPrefix}-de`}>
          De
        </label>
        <input
          // A chave refaz o campo quando o período muda por fora (setas, troca de escala).
          key={`de-${period.key}`}
          id={`${idPrefix}-de`}
          type="date"
          className="field w-auto py-1.5"
          defaultValue={period.start}
          max={context.currentWeek}
          onChange={e => custom(e.target.value, period.end, choice)}
        />
        <span className="font-medium text-slate-500">até</span>
        <label className="sr-only" htmlFor={`${idPrefix}-ate`}>
          Até
        </label>
        <input
          key={`ate-${period.key}`}
          id={`${idPrefix}-ate`}
          type="date"
          className="field w-auto py-1.5"
          defaultValue={period.end}
          onChange={e => custom(period.start, e.target.value, choice)}
        />
        <label className="sr-only" htmlFor={`${idPrefix}-agrupar`}>
          Agrupar por
        </label>
        <select
          id={`${idPrefix}-agrupar`}
          className="field w-auto py-1.5"
          value={choice}
          onChange={e => custom(period.start, period.end, e.target.value as GroupingChoice)}
        >
          {GROUPING_CHOICES.map(option => (
            <option key={option.id} value={option.id}>
              {option.label(period)}
            </option>
          ))}
        </select>
        {next}
      </span>
    );
  }

  const options = periodOptions(period.scale, context);
  return (
    <span className="inline-flex items-center gap-1.5">
      {arrows}
      <label className="sr-only" htmlFor={`${idPrefix}-lista`}>
        Período
      </label>
      <select
        id={`${idPrefix}-lista`}
        className="field max-w-72 py-1.5"
        value={period.key}
        onChange={e => onChange({ scale: period.scale, key: e.target.value })}
      >
        {options.map(option => (
          <option key={option.key} value={option.key}>
            {/* Com rótulo próprio, quem chama decide como marcar o período em andamento (a aba 0 diz "(atual)"). */}
            {optionLabel ? optionLabel(option) : `${option.label}${option.current ? ' · parcial' : ''}`}
          </option>
        ))}
      </select>
      {next}
    </span>
  );
}

'use client';
import { useId } from 'react';
import { Scissors, RotateCcw } from 'lucide-react';
import { DEFAULT_SECTION_CUT, type SectionCut } from './section-plane';

export function SectionControls({ value, onChange, disabled, error }: {
  value: SectionCut; onChange: (value: SectionCut) => void; disabled: boolean; error?: string;
}) {
  const id = useId();
  const locked = disabled || !value.enabled;
  return <fieldset className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 px-3 pb-3" aria-describedby={`${id}-help`}>
    <legend className="flex items-center gap-2 px-1 text-xs font-bold text-slate-700"><Scissors size={15} aria-hidden />Seccionamento</legend>
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
        <input type="checkbox" className="h-4 w-4 accent-blue-700 disabled:cursor-not-allowed" disabled={disabled} checked={value.enabled} onChange={event => onChange({ ...value, enabled: event.target.checked })} />Ativar corte
      </label>
      <label className="min-w-36 flex-1 text-xs font-semibold text-slate-600">Orientação
        <select className="field mt-1 min-h-10 disabled:opacity-50" value={value.axis} disabled={locked} onChange={event => onChange({ ...value, axis: event.target.value as SectionCut['axis'] })}>
          <option value="y">Horizontal · Y</option><option value="x">Vertical · X</option><option value="z">Vertical · Z</option>
        </select>
      </label>
      <div className="min-w-48 flex-[2]">
        <label htmlFor={`${id}-range`} className="text-xs font-semibold text-slate-600">Posição do corte</label>
        <div className="mt-1 flex min-h-10 items-center gap-3">
          <input id={`${id}-range`} type="range" min="0" max="100" step="1" className="min-w-0 flex-1 accent-blue-700 disabled:opacity-50" disabled={locked} value={value.position} aria-valuetext={`${value.position}% do eixo ${value.axis.toUpperCase()}`} onChange={event => onChange({ ...value, position: Number(event.target.value) })} />
          <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500"><span className="sr-only">Posição do corte em porcentagem</span>
            <input type="number" min="0" max="100" step="1" className="field w-20 px-2 disabled:opacity-50" disabled={locked} value={value.position} onChange={event => {
              const position = event.target.valueAsNumber;
              if (Number.isFinite(position)) onChange({ ...value, position: Math.max(0, Math.min(100, position)) });
            }} /><span aria-hidden>%</span>
          </label>
        </div>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" className="h-4 w-4 accent-blue-700 disabled:cursor-not-allowed" disabled={locked} checked={value.inverted} onChange={event => onChange({ ...value, inverted: event.target.checked })} />Inverter lado</label>
      <button type="button" className="button-ghost min-h-10 disabled:cursor-not-allowed disabled:opacity-50" disabled={locked} onClick={() => onChange(DEFAULT_SECTION_CUT)}><RotateCcw size={14} aria-hidden />Remover corte</button>
    </div>
    <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-slate-500">{disabled ? 'Carregue a geometria para seccionar o modelo.' : value.enabled ? `Corte ${value.axis.toUpperCase()} em ${value.position}% · mantendo o lado ${value.inverted ? 'maior' : 'menor'} do eixo. A posição considera toda a geometria carregada.` : 'Ative para ver o interior do modelo. O corte pode ser combinado com os filtros de visibilidade.'}</p>
    {error && <p role="alert" className="mt-2 text-xs font-medium text-rose-700">{error}</p>}
  </fieldset>;
}

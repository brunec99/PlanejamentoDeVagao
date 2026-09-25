'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Building2, Camera, Eye, EyeOff, History, Ruler, RotateCcw, Trash2 } from 'lucide-react';
import {
  LIMITS, daysBetween, isLocalDate, measuredPercent, physicalProgress, planSpan,
  type LocalDate, type LongTermBaseline, type LongTermMeasurement, type LongTermMeasurementItem, type LongTermPlanDocument,
} from '@/domain/long-term-plan';
import { formatDate, formatTimestamp } from '@/shared/format';

// ─── Casca dos painéis ──────────────────────────────────────────────────────────

/** `<dialog>` nativo: Esc, foco preso e fundo inerte vêm do navegador. Fechar sempre passa por
 * `close()`, e o evento `close` avisa quem abriu — um único caminho de saída. */
function useModal() {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);
  return { dialog, close: () => dialog.current?.close() };
}

function PanelHeader({ id, eyebrow, title, onClose, children }: { id: string; eyebrow: string; title: string; onClose: () => void; children?: ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
    <div className="min-w-0">
      <p className="eyebrow">{eyebrow}</p>
      <h3 id={id} className="mt-1 text-base font-bold text-slate-900">{title}</h3>
      {children}
    </div>
    <button type="button" className="button-ghost shrink-0" onClick={onClose}>Fechar</button>
  </div>;
}

const drawerClass = 'm-0 ml-auto h-full max-h-none w-[min(26rem,100vw)] rounded-none border-l border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40';
const Swatch = ({ color, size = 'h-3 w-3' }: { color: string; size?: string }) =>
  <span aria-hidden className={`${size} shrink-0 rounded-sm`} style={{ background: color }} />;
function Bar({ percent, color, faded }: { percent: number; color: string; faded?: boolean }) {
  return <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
    <div className="h-1.5 rounded-full transition-[width]" style={{ width: `${percent}%`, background: color, opacity: faded ? 0.45 : 1 }} />
  </div>;
}
const pct = (value: number) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
const num = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

// ─── Configurações: pavimentos ──────────────────────────────────────────────────

const NAME_MAX = 60; // mesmo limite da validação do documento
const NUMBERING: { value: string; label: string; prefix: string[] }[] = [
  { value: 'numbers', label: '1º pavimento, 2º pavimento…', prefix: [] },
  { value: 'terreo', label: 'Térreo, 1º pavimento…', prefix: ['Térreo'] },
  { value: 'subsolo', label: 'Subsolo, Térreo, 1º pavimento…', prefix: ['Subsolo', 'Térreo'] },
  { value: 'fundacao', label: 'Fundação, Térreo, 1º pavimento…', prefix: ['Fundação', 'Térreo'] },
];

export function ConfigPanel({ document, locationNames, readOnly, onSave, onClose }: {
  document: LongTermPlanDocument;
  locationNames: string[];
  readOnly: boolean;
  onSave: (floorCount: number, floorNames: Record<string, string>) => void;
  onClose: () => void;
}) {
  const { dialog, close } = useModal();
  const [countText, setCountText] = useState(String(document.floorCount));
  // Nomes acima do limite ficam guardados: reduzir e voltar a aumentar não apaga o que foi digitado.
  const [names, setNames] = useState<Record<string, string>>(document.floorNames);
  const [numbering, setNumbering] = useState('terreo');

  const count = Number(countText);
  const validCount = Number.isInteger(count) && count >= 1 && count <= LIMITS.floors;
  const cut = validCount ? document.activities.filter(a => a.lastFloor > count).length : 0;
  const floors = validCount ? Array.from({ length: count }, (_, i) => count - i) : []; // de cima para baixo, como um corte
  const typed = (upTo: number) => Object.entries(names).some(([k, v]) => Number(k) <= upTo && v.trim());

  const setName = (floor: number, value: string) => setNames(prev => {
    const next = { ...prev };
    if (value.trim()) next[String(floor)] = value.slice(0, NAME_MAX); else delete next[String(floor)];
    return next;
  });
  const replaceAll = (total: number, nameOf: (floor: number) => string) => {
    if (typed(total) && !confirm('Substituir os nomes de pavimento já digitados?')) return;
    setCountText(String(total));
    setNames(Object.fromEntries(Array.from({ length: total }, (_, i) => [String(i + 1), nameOf(i + 1).trim().slice(0, NAME_MAX)]).filter(([, v]) => v)));
  };
  const useLocations = () => {
    const total = Math.min(locationNames.length, LIMITS.floors);
    replaceAll(total, floor => locationNames[floor - 1] ?? '');
  };
  const applyNumbering = () => {
    if (!validCount) return;
    const prefix = NUMBERING.find(n => n.value === numbering)?.prefix ?? [];
    replaceAll(count, floor => prefix[floor - 1] ?? `${floor - prefix.length}º pavimento`);
  };
  const save = () => {
    if (!validCount || readOnly) return;
    const kept = Object.fromEntries(Object.entries(names).filter(([k, v]) => Number(k) <= count && v.trim()).map(([k, v]) => [k, v.trim()]));
    onSave(count, kept);
    close();
  };

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="lp-config-title" className={drawerClass}>
    <div className="flex h-full flex-col">
      <PanelHeader id="lp-config-title" eyebrow="Plano de longo prazo" title="Pavimentos" onClose={close} />
      <div className="custom-scrollbar flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <label htmlFor="lp-floor-count" className="text-sm font-semibold text-slate-700">Número de pavimentos</label>
          <input id="lp-floor-count" className="field mt-1.5" type="number" inputMode="numeric" min={1} max={LIMITS.floors} step={1}
            value={countText} disabled={readOnly} aria-invalid={!validCount} aria-describedby="lp-floor-count-hint"
            onChange={e => setCountText(e.target.value)} />
          <p id="lp-floor-count-hint" className="mt-1 text-xs text-slate-500">
            {validCount ? 'O pavimento 1 é o mais baixo.' : `Use um número inteiro entre 1 e ${LIMITS.floors}.`}
          </p>
          {cut > 0 && <p className="callout callout-warning mt-2" role="status">
            {cut} serviço(s) passam do novo limite e terão a faixa de pavimentos cortada.
          </p>}
        </div>

        {!readOnly && locationNames.length > 0 && <div className="space-y-1.5">
          <button type="button" className="button-ghost w-full" onClick={useLocations}>
            <Building2 size={16} aria-hidden /> Usar os locais da obra ({locationNames.length})
          </button>
          <p className="text-xs text-slate-500">Os locais vêm da importação do Prevision, em ordem de altura.</p>
        </div>}

        {!readOnly && validCount && <fieldset className="space-y-2 rounded-xl border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">Numerar a partir de</legend>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className="field" aria-label="Sequência de nomes a partir do pavimento 1" value={numbering} onChange={e => setNumbering(e.target.value)}>
              {NUMBERING.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
            <button type="button" className="button-ghost shrink-0" onClick={applyNumbering}>Preencher</button>
          </div>
        </fieldset>}

        <div>
          <p className="text-sm font-semibold text-slate-700">Nomes dos pavimentos</p>
          <p className="mt-0.5 text-xs text-slate-500">Em branco, aparece a numeração padrão (1º, 2º…). O topo do prédio vem primeiro.</p>
          <ol className="mt-3 space-y-1.5">
            {floors.map(floor => <li key={floor} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-400" aria-hidden>{floor}</span>
              <input className="field py-1.5" aria-label={`Nome do pavimento ${floor}`} placeholder={`${floor}º pavimento`}
                maxLength={NAME_MAX} disabled={readOnly} value={names[String(floor)] ?? ''} onChange={e => setName(floor, e.target.value)} />
            </li>)}
          </ol>
        </div>
      </div>
      {!readOnly && <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
        <button type="button" className="button-ghost flex-1" onClick={close}>Cancelar</button>
        <button type="button" className="button flex-1" disabled={!validCount} onClick={save}>Salvar</button>
      </div>}
    </div>
  </dialog>;
}

// ─── Linhas de base ─────────────────────────────────────────────────────────────

function finishDelta(finish: LocalDate | undefined, current: LocalDate | undefined) {
  if (!finish || !current) return undefined;
  const days = daysBetween(current, finish);
  if (days === 0) return 'mesmo término';
  return `${days > 0 ? '+' : '−'}${Math.abs(days)} d em relação ao atual`;
}

export function BaselinePanel({ baselines, activeId, readOnly, currentFinish, onToggle, onSave, onRestore, onDelete, onClose }: {
  baselines: LongTermBaseline[];
  activeId: string;
  readOnly: boolean;
  currentFinish?: LocalDate;
  onToggle: (id: string) => void;
  onSave: (name: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { dialog, close } = useModal();
  const [name, setName] = useState('');
  const ordered = useMemo(() => [...baselines].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [baselines]);
  const full = baselines.length >= LIMITS.baselines;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || readOnly || full) return;
    onSave(trimmed.slice(0, LIMITS.name));
    setName('');
  };

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="lp-baselines-title" className={drawerClass}>
    <div className="flex h-full flex-col">
      <PanelHeader id="lp-baselines-title" eyebrow="Plano de longo prazo" title="Linhas de base" onClose={close} />
      <ul className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-5 py-5">
        {!ordered.length && <li className="py-6 text-center text-sm text-slate-500">Nenhuma linha de base salva.</li>}
        {ordered.map(b => {
          const active = b.id === activeId;
          const finish = planSpan(b.activities)?.finish;
          const delta = finishDelta(finish, currentFinish);
          return <li key={b.id} className={`rounded-xl border px-3 py-3 ${active ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200'}`}>
            <p className="break-words text-sm font-semibold text-slate-900">{b.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Salva em {formatTimestamp(b.createdAt)} · {b.activities.length} serviço{b.activities.length === 1 ? '' : 's'}
            </p>
            <p className="mt-0.5 text-xs text-slate-600">
              {finish ? <>Término {formatDate(finish)}{delta && <> · <span className={delta.startsWith('+') ? 'text-emerald-700' : delta.startsWith('−') ? 'text-rose-700' : ''}>{delta}</span></>}</> : 'Sem serviços visíveis'}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button type="button" className="button-ghost px-2.5 py-1.5 text-xs" aria-pressed={active} onClick={() => onToggle(b.id)}>
                {active ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}{active ? 'Comparando' : 'Comparar'}
              </button>
              {!readOnly && <>
                <button type="button" className="button-ghost px-2.5 py-1.5 text-xs" aria-label={`Restaurar ${b.name}`}
                  onClick={() => { if (confirm(`Restaurar "${b.name}"? Os serviços atuais serão substituídos por esta foto.`)) { onRestore(b.id); close(); } }}>
                  <RotateCcw size={14} aria-hidden />Restaurar
                </button>
                <button type="button" className="button-ghost px-2.5 py-1.5 text-xs hover:text-rose-700" aria-label={`Excluir ${b.name}`}
                  onClick={() => { if (confirm(`Excluir a linha de base "${b.name}"?`)) onDelete(b.id); }}>
                  <Trash2 size={14} aria-hidden />Excluir
                </button>
              </>}
            </div>
          </li>;
        })}
      </ul>
      <form className="space-y-2 border-t border-slate-100 px-5 py-4" onSubmit={e => { e.preventDefault(); save(); }}>
        <label htmlFor="lp-baseline-name" className="text-sm font-semibold text-slate-700">Nova linha de base</label>
        <input id="lp-baseline-name" className="field" placeholder="Ex.: Aprovado na diretoria" maxLength={LIMITS.name}
          disabled={readOnly} value={name} onChange={e => setName(e.target.value)} />
        <button type="submit" className="button w-full" disabled={readOnly || full || !name.trim()}>
          <Camera size={16} aria-hidden />Salvar linha de base atual
        </button>
        <p className="text-xs text-slate-500">
          {full ? `Limite de ${LIMITS.baselines} linhas de base: exclua uma para salvar outra.` : 'A linha de base é uma foto: reprogramar o plano depois não a altera.'}
        </p>
      </form>
    </div>
  </dialog>;
}

// ─── Medições ───────────────────────────────────────────────────────────────────

const byDate = (a: LongTermMeasurement, b: LongTermMeasurement) => a.date.localeCompare(b.date) || a.number - b.number;

/** Linha única do avanço físico por rodada. Pontos igualmente espaçados (como na ferramenta
 * original): com datas próximas, uma escala de tempo empilharia os rótulos. */
function ProgressChart({ points }: { points: { label: string; date: LocalDate; value: number }[] }) {
  const W = 640, H = 220, left = 40, right = 16, top = 16, bottom = 40;
  const x = (i: number) => left + (points.length === 1 ? (W - left - right) / 2 : (i * (W - left - right)) / (points.length - 1));
  const y = (v: number) => top + ((100 - v) * (H - top - bottom)) / 100;
  const every = Math.max(1, Math.ceil(points.length / 8)); // rótulos seletivos para não colidirem
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
    aria-label={`Avanço físico do plano: ${points.map(p => `${p.label}, ${pct(p.value)}`).join('; ')}`}>
    {[0, 25, 50, 75, 100].map(v => <g key={v}>
      <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth={1} />
      <text x={left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="#64748b">{v}%</text>
    </g>)}
    <path d={path} fill="none" stroke="#1d4ed8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    {points.map((p, i) => <g key={p.label}>
      <circle cx={x(i)} cy={y(p.value)} r={4.5} fill="#1d4ed8" stroke="#fff" strokeWidth={2} />
      {/* alvo maior que o ponto para o tooltip nativo */}
      <circle cx={x(i)} cy={y(p.value)} r={14} fill="transparent"><title>{`${p.label} — ${formatDate(p.date)}: ${p.value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</title></circle>
      {(i % every === 0 || i === points.length - 1) &&
        <text x={x(i)} y={H - bottom + 18} textAnchor="middle" fontSize={11} fill="#64748b">{p.label}</text>}
    </g>)}
    <text x={x(points.length - 1)} y={y(last.value) - 10} textAnchor={points.length > 1 ? 'end' : 'middle'} fontSize={12} fontWeight={700} fill="#0f172a">{pct(last.value)}</text>
  </svg>;
}

export function MeasurementPanel({ document, today, readOnly, onSave, onDelete, onClose }: {
  document: LongTermPlanDocument;
  today: LocalDate;
  readOnly: boolean;
  onSave: (measurement: { date: LocalDate; items: LongTermMeasurementItem[] }) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { dialog, close } = useModal();
  const { activities, measurements } = document;
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [date, setDate] = useState<LocalDate>(today);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const measurable = activities.filter(a => a.visible && a.unit);
  const nextNumber = measurements.reduce((max, m) => Math.max(max, m.number), 0) + 1;
  const ordered = useMemo(() => [...measurements].sort(byDate), [measurements]);
  // Último valor medido de cada serviço, na mesma ordem (data, número) que `latestPercents` usa.
  const previous = useMemo(() => {
    const result: Record<string, { value: number; number: number }> = {};
    for (const m of ordered) for (const item of m.items) result[item.activityId] = { value: item.value, number: m.number };
    return result;
  }, [ordered]);

  const parsed = measurable.map(activity => {
    const raw = (values[activity.id] ?? '').trim();
    const value = raw === '' ? undefined : Number(raw.replace(',', '.'));
    const max = activity.unit === '%' ? 100 : 1e9;
    const invalid = value !== undefined && (!Number.isFinite(value) || value < 0 || value > max);
    return { activity, value, invalid };
  });
  const filled = parsed.filter(p => p.value !== undefined && !p.invalid);
  const hasInvalid = parsed.some(p => p.invalid);
  const validDate = isLocalDate(date);
  const canSave = !readOnly && validDate && filled.length > 0 && !hasInvalid && measurements.length < LIMITS.measurements;

  const save = () => {
    if (!canSave) return;
    onSave({
      date,
      items: filled.map(({ activity, value }) => {
        const note = (notes[activity.id] ?? '').trim().slice(0, 500);
        return { activityId: activity.id, value: value!, ...(note ? { note } : {}) };
      }),
    });
    setValues({}); setNotes({}); setTab('history');
  };

  const chart = useMemo(() => {
    if (ordered.length < 2) return [];
    return ordered.flatMap(m => {
      const value = physicalProgress(activities, measurements, m.date);
      return value === undefined ? [] : [{ label: `#${m.number} ${formatDate(m.date).slice(0, 5)}`, date: m.date, value }];
    });
  }, [ordered, activities, measurements]);
  const rounds = useMemo(() => [...measurements].sort((a, b) => b.number - a.number), [measurements]);
  const byId = useMemo(() => new Map(activities.map(a => [a.id, a])), [activities]);

  const tabClass = (on: boolean) => `-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${on ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`;

  return <dialog ref={dialog} onClose={onClose} aria-labelledby="lp-measure-title"
    className="m-auto max-h-[90vh] w-[min(48rem,94vw)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55">
    <div className="flex max-h-[90vh] flex-col">
      <PanelHeader id="lp-measure-title" eyebrow="Plano de longo prazo" title="Medições físicas" onClose={close} />
      <div role="tablist" aria-label="Medições" className="flex shrink-0 gap-2 border-b border-slate-200 px-5">
        <button type="button" role="tab" id="lp-tab-new" aria-controls="lp-panel-new" aria-selected={tab === 'new'} className={tabClass(tab === 'new')} onClick={() => setTab('new')}>
          <span className="inline-flex items-center gap-1.5"><Ruler size={15} aria-hidden />Nova medição #{nextNumber}</span>
        </button>
        <button type="button" role="tab" id="lp-tab-history" aria-controls="lp-panel-history" aria-selected={tab === 'history'} className={tabClass(tab === 'history')} onClick={() => setTab('history')}>
          <span className="inline-flex items-center gap-1.5"><History size={15} aria-hidden />Histórico ({measurements.length})</span>
        </button>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {tab === 'new' && <div role="tabpanel" id="lp-panel-new" aria-labelledby="lp-tab-new" className="space-y-4 p-5">
          {!measurable.length
            ? <p className="callout callout-info">Nenhum serviço tem unidade de medição. Defina a unidade no cadastro do serviço para medir.</p>
            : <>
              {readOnly && <p className="callout callout-info">Seu acesso é de consulta: a medição não pode ser salva.</p>}
              <div className="max-w-[12rem]">
                <label htmlFor="lp-measure-date" className="text-sm font-semibold text-slate-700">Data da medição</label>
                <input id="lp-measure-date" type="date" className="field mt-1.5" value={date} disabled={readOnly} aria-invalid={!validDate} onChange={e => setDate(e.target.value)} />
              </div>
              <ul className="space-y-3">
                {parsed.map(({ activity, value, invalid }) => {
                  const unit = activity.unit!;
                  const isPercent = unit === '%';
                  const last = previous[activity.id];
                  const lastPercent = last ? measuredPercent(activity, last.value) : undefined;
                  const current = value !== undefined && !invalid ? measuredPercent(activity, value) : undefined;
                  const inputId = `lp-measure-${activity.id}`;
                  return <li key={activity.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Swatch color={activity.color} />
                      <label htmlFor={inputId} className="min-w-0 flex-1 text-sm font-semibold text-slate-900">{activity.name}</label>
                      <span className="text-xs text-slate-500">{isPercent ? 'em %' : `${unit} · total ${activity.plannedTotal !== undefined ? num(activity.plannedTotal) : 'não informado'}`}</span>
                    </div>
                    {last && lastPercent !== undefined && <div className="mt-2">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Medição #{last.number}: {num(last.value)} {isPercent ? '%' : unit}</span><span className="tabular-nums">{pct(lastPercent)}</span>
                      </div>
                      <div className="mt-1 flex"><Bar percent={lastPercent} color={activity.color} faded /></div>
                    </div>}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <input id={inputId} type="number" inputMode="decimal" min={0} max={isPercent ? 100 : undefined} step={0.1}
                        className="field w-36" placeholder={isPercent ? '0 – 100' : `em ${unit}`} disabled={readOnly}
                        aria-invalid={invalid} aria-describedby={`${inputId}-hint`}
                        value={values[activity.id] ?? ''} onChange={e => setValues(prev => ({ ...prev, [activity.id]: e.target.value }))} />
                      <span className="text-xs text-slate-500">{isPercent ? '%' : unit}</span>
                      {current !== undefined && <span className="ml-auto text-sm font-bold tabular-nums text-slate-900">{pct(current)}</span>}
                    </div>
                    {current !== undefined && <div className="mt-2 flex"><Bar percent={current} color={activity.color} /></div>}
                    <div id={`${inputId}-hint`}>
                      {invalid && <p className="mt-2 text-xs font-medium text-rose-700">{isPercent ? 'Use um valor entre 0 e 100.' : 'Use um número maior ou igual a zero.'}</p>}
                      {!isPercent && !activity.plannedTotal && value !== undefined && !invalid &&
                        <p className="mt-2 text-xs text-slate-500">Sem total previsto no cadastro, o percentual fica em 0%.</p>}
                      {/* A medição é acumulada: um valor menor quase sempre é digitação do incremento. */}
                      {last && value !== undefined && !invalid && value < last.value &&
                        <p className="callout callout-warning mt-2" role="status">
                          {num(value)} {isPercent ? '%' : unit} é menor que a medição anterior — a medição é acumulada.
                        </p>}
                    </div>
                    <input className="field mt-2 py-1.5 text-xs" aria-label={`Observação sobre ${activity.name}`} placeholder="Observação (opcional)"
                      maxLength={500} disabled={readOnly} value={notes[activity.id] ?? ''} onChange={e => setNotes(prev => ({ ...prev, [activity.id]: e.target.value }))} />
                  </li>;
                })}
              </ul>
              {measurements.length >= LIMITS.measurements && <p className="callout callout-warning">Limite de {LIMITS.measurements} medições atingido: exclua uma rodada antiga para registrar outra.</p>}
              <button type="button" className="button w-full" disabled={!canSave} onClick={save}>
                Salvar medição #{nextNumber}{filled.length ? ` (${filled.length} serviço${filled.length === 1 ? '' : 's'})` : ''}
              </button>
            </>}
        </div>}

        {tab === 'history' && <div role="tabpanel" id="lp-panel-history" aria-labelledby="lp-tab-history" className="space-y-4 p-5">
          {chart.length >= 2 && <figure className="rounded-xl border border-slate-200 p-4">
            <figcaption className="text-sm font-semibold text-slate-800">Avanço físico do plano</figcaption>
            <div className="mt-2"><ProgressChart points={chart} /></div>
            <p className="mt-1 text-xs text-slate-500">Média dos serviços com unidade, ponderada pelos pavimento-dias de cada um; serviço sem medição conta 0%.</p>
          </figure>}
          {!rounds.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma medição registrada ainda.</p>}
          <ul className="space-y-3">
            {rounds.map(m => {
              const items = m.items.flatMap(item => { const activity = byId.get(item.activityId); return activity ? [{ item, activity }] : []; });
              return <li key={m.id} className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <p className="text-sm">
                    <span className="font-bold text-slate-900">Medição #{m.number}</span>
                    <span className="ml-2 text-slate-600">{formatDate(m.date)}</span>
                    <span className="ml-2 text-xs text-slate-500">{items.length} serviço{items.length === 1 ? '' : 's'}</span>
                  </p>
                  {!readOnly && <button type="button" className="button-ghost px-2 py-1.5 hover:text-rose-700" aria-label={`Excluir a medição #${m.number}`}
                    onClick={() => { if (confirm(`Excluir a medição #${m.number}?`)) onDelete(m.id); }}>
                    <Trash2 size={14} aria-hidden />
                  </button>}
                </div>
                <ul className="divide-y divide-slate-100">
                  {items.map(({ item, activity }) => {
                    const percent = measuredPercent(activity, item.value);
                    return <li key={item.activityId} className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="flex w-full min-w-0 items-center gap-2 sm:w-44">
                          <Swatch color={activity.color} size="h-2.5 w-2.5" /><span className="truncate text-sm text-slate-800">{activity.name}</span>
                        </span>
                        <Bar percent={percent} color={activity.color} />
                        <span className="w-24 text-right text-xs font-semibold tabular-nums text-slate-700">{num(item.value)} {activity.unit === '%' ? '%' : activity.unit}</span>
                        <span className="w-10 text-right text-xs tabular-nums text-slate-500">{pct(percent)}</span>
                      </div>
                      {item.note && <p className="mt-1 text-xs text-slate-500">{item.note}</p>}
                    </li>;
                  })}
                </ul>
              </li>;
            })}
          </ul>
        </div>}
      </div>
    </div>
  </dialog>;
}

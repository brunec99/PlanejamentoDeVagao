'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronDown, Copy, Plus, Trash2, X } from 'lucide-react';
import {
  activitySpan, dependsOn, earliestStart, floorLabel, isLocalDate, minimumStart,
  LIMITS, LONG_TERM_COLORS, MEASUREMENT_UNITS,
  type LocalDate, type LongTermActivity, type LongTermLink, type LongTermPlanDocument, type LongTermTeam,
} from '@/domain/long-term-plan';
import { formatDate } from '@/shared/format';

/** Números ficam como texto enquanto se digita: campo vazio ou "-" no meio da digitação não pode
 * virar zero e empurrar o cronograma. A conversão acontece no rascunho e na validação. */
interface LinkDraft { activityId: string; lagDays: string; floor?: number }
interface FormState {
  name: string; color: string; firstFloor: number; lastFloor: number; start: string;
  duration: string; interval: string; floorDurations: Record<string, string>;
  predecessors: LinkDraft[]; teams: LongTermTeam[]; unit: string; plannedTotal: string; notes: string;
}

// Serviço novo ainda não tem id; este só existe para o cálculo do mínimo e da rede.
const DRAFT_ID = '__novo-servico__';
const SCHEDULE_KEYS: (keyof FormState)[] = ['firstFloor', 'lastFloor', 'duration', 'interval', 'floorDurations', 'predecessors'];

const int = (value: string) => (/^\s*-?\d+\s*$/.test(value) ? Number(value) : NaN);
const within = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
const orDefault = (n: number, min: number, max: number, fallback: number) => (within(n, min, max) ? n : fallback);
const decimal = (value: string) => (value.trim() === '' ? NaN : Number(value.replace(',', '.')));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function initialState(initial: LongTermActivity | undefined, floorCount: number, defaultStart: LocalDate, defaultColor: string): FormState {
  const firstFloor = Math.min(initial?.firstFloor ?? 1, floorCount);
  return {
    name: initial?.name ?? '',
    color: initial?.color ?? defaultColor,
    firstFloor,
    lastFloor: Math.max(firstFloor, Math.min(initial?.lastFloor ?? floorCount, floorCount)),
    start: initial?.start ?? defaultStart,
    duration: String(initial?.duration ?? 7),
    interval: String(initial?.interval ?? 7),
    floorDurations: Object.fromEntries(Object.entries(initial?.floorDurations ?? {}).map(([k, v]) => [k, String(v)])),
    predecessors: (initial?.predecessors ?? []).map(l => ({ activityId: l.activityId, lagDays: String(l.lagDays), floor: l.floor })),
    teams: initial?.teams.map(t => ({ ...t })) ?? [],
    unit: initial?.unit ?? '',
    plannedTotal: initial?.plannedTotal !== undefined ? String(initial.plannedTotal) : '',
    notes: initial?.notes ?? '',
  };
}

/** Serviço montado a partir do formulário. Valores inválidos caem num padrão só para o cálculo
 * ao vivo (mínimo e resumo); a validação do envio é que barra. */
function buildActivity(form: FormState, base: { id: string; visible: boolean }, activities: LongTermActivity[]): LongTermActivity {
  const byId = new Map(activities.map(a => [a.id, a]));
  const floorDurations: Record<string, number> = {};
  for (const [key, raw] of Object.entries(form.floorDurations)) {
    const floor = Number(key), days = int(raw);
    // Sobra de uma faixa de pavimentos anterior não vai para o plano.
    if (floor >= form.firstFloor && floor <= form.lastFloor && within(days, 1, LIMITS.duration)) floorDurations[key] = days;
  }
  const predecessors: LongTermLink[] = form.predecessors.flatMap(link => {
    const pred = byId.get(link.activityId);
    if (!pred) return []; // predecessora excluída enquanto o formulário estava aberto
    const floor = link.floor !== undefined && link.floor >= pred.firstFloor && link.floor <= pred.lastFloor ? link.floor : undefined;
    return [{ activityId: link.activityId, lagDays: orDefault(int(link.lagDays), -LIMITS.duration, LIMITS.duration, 0), ...(floor === undefined ? {} : { floor }) }];
  });
  return {
    id: base.id, name: form.name.trim(), color: form.color, firstFloor: form.firstFloor, lastFloor: form.lastFloor, start: form.start,
    duration: orDefault(int(form.duration), 1, LIMITS.duration, 1),
    ...(Object.keys(floorDurations).length ? { floorDurations } : {}),
    interval: orDefault(int(form.interval), 0, LIMITS.duration, 0),
    visible: base.visible, predecessors, teams: form.teams,
  };
}

export function ActivityForm({ document, initial, defaultStart, defaultColor, unitLocked, readOnly, onSave, onDelete, onDuplicate, onClose }: {
  document: LongTermPlanDocument;
  initial?: LongTermActivity;
  defaultStart: LocalDate;
  defaultColor: string;
  unitLocked: boolean;
  readOnly: boolean;
  onSave: (activity: LongTermActivity) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onClose: () => void;
}) {
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState(() => initialState(initial, document.floorCount, defaultStart, defaultColor));
  const [errors, setErrors] = useState<string[]>([]);
  const [addingId, setAddingId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamSize, setTeamSize] = useState('1');
  const [showPerFloor, setShowPerFloor] = useState(() => Object.keys(initial?.floorDurations ?? {}).length > 0);

  const id = initial?.id ?? DRAFT_ID;
  const base = { id, visible: initial?.visible ?? true };
  const others = document.activities.filter(a => a.id !== id);
  const byId = new Map(document.activities.map(a => [a.id, a]));
  const floors = Array.from({ length: document.floorCount }, (_, i) => i + 1);
  const range = floors.filter(f => f >= form.firstFloor && f <= form.lastFloor);

  useEffect(() => {
    dialog.current?.showModal();
    (readOnly ? closeButton.current : firstField.current)?.focus();
  }, [readOnly]);
  useEffect(() => { if (errors.length) errorBox.current?.scrollIntoView({ block: 'nearest' }); }, [errors]);

  const minimumFor = (state: FormState) => {
    const draft = buildActivity(state, base, document.activities);
    return draft.predecessors.length ? earliestStart(draft, [...others, draft]) : undefined;
  };
  // Igual à ferramenta original: mexer na rede ou no ritmo empurra o início para o mínimo, mas
  // nunca o puxa para trás — folga dada à mão continua valendo.
  const change = (patch: Partial<FormState>) => setForm(prev => {
    const next = { ...prev, ...patch };
    if (next.lastFloor < next.firstFloor) next.lastFloor = next.firstFloor;
    if (!SCHEDULE_KEYS.some(key => key in patch)) return next;
    const minimum = minimumFor(next);
    return minimum && isLocalDate(next.start) && next.start < minimum ? { ...next, start: minimum } : next;
  });

  const draft = buildActivity(form, base, document.activities);
  const minimum = draft.predecessors.length ? earliestStart(draft, [...others, draft]) : undefined;
  const span = isLocalDate(form.start) ? activitySpan(draft) : undefined;
  const faster = draft.predecessors.flatMap(link => {
    const pred = byId.get(link.activityId);
    return pred && link.floor === undefined && draft.interval < pred.interval ? [pred] : [];
  });
  // Serviço novo não tem sucessoras, então nenhum candidato fecha ciclo com ele.
  const candidates = others
    .filter(a => !form.predecessors.some(l => l.activityId === a.id) && (!initial || !dependsOn(document.activities, a.id, initial.id)))
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));

  const setLink = (index: number, patch: Partial<LinkDraft>) =>
    change({ predecessors: form.predecessors.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  const addLink = () => {
    if (!addingId) return;
    change({ predecessors: [...form.predecessors, { activityId: addingId, lagDays: '0' }] });
    setAddingId('');
  };
  const addTeam = () => {
    const name = teamName.trim(), size = int(teamSize);
    if (!name || !within(size, 1, 1000)) return;
    const existing = form.teams.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
    change({ teams: existing >= 0 ? form.teams.map((t, i) => (i === existing ? { ...t, size } : t)) : [...form.teams, { name, size }] });
    setTeamName(''); setTeamSize('1');
  };
  const onTeamKey = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); addTeam(); } };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    const problems: string[] = [];
    const name = form.name.trim();
    if (!name) problems.push('Informe o nome do serviço.');
    if (!/^#[0-9a-fA-F]{6}$/.test(form.color)) problems.push('Escolha uma cor válida.');
    if (!isLocalDate(form.start)) problems.push('Informe a data de início.');
    if (!within(int(form.duration), 1, LIMITS.duration)) problems.push(`Duração por pavimento: use um número inteiro de 1 a ${LIMITS.duration} dias.`);
    if (!within(int(form.interval), 0, LIMITS.duration)) problems.push(`Ritmo: use um número inteiro de 0 a ${LIMITS.duration} dias.`);
    for (const f of range) {
      const raw = form.floorDurations[String(f)];
      if (raw?.trim() && !within(int(raw), 1, LIMITS.duration)) problems.push(`Duração do pavimento ${floorLabel(document, f)}: use um número inteiro de 1 a ${LIMITS.duration} dias.`);
    }
    for (const link of form.predecessors) {
      if (!within(int(link.lagDays), -LIMITS.duration, LIMITS.duration)) problems.push(`Espera após "${byId.get(link.activityId)?.name ?? 'predecessora'}": use um número inteiro de dias.`);
    }
    const unit = unitLocked ? initial?.unit : form.unit.trim() || undefined;
    let plannedTotal = unitLocked ? initial?.plannedTotal : undefined;
    if (!unitLocked && unit && unit !== '%') {
      const total = decimal(form.plannedTotal);
      if (Number.isFinite(total) && total > 0 && total <= 1e9) plannedTotal = total;
      else problems.push(`Informe o total previsto em ${unit} (maior que zero).`);
    }
    if (minimum && isLocalDate(form.start) && form.start < minimum) problems.push(`O início não pode ser antes de ${formatDate(minimum)}, o mínimo pelas predecessoras e pelo ritmo.`);
    setErrors(problems);
    if (problems.length) return;
    const notes = form.notes.trim();
    onSave({
      ...draft, id: initial?.id ?? crypto.randomUUID(), name,
      ...(unit ? { unit } : {}), ...(plannedTotal !== undefined ? { plannedTotal } : {}), ...(notes ? { notes } : {}),
    });
  }

  const label = 'mb-1 block text-xs font-semibold text-slate-600';
  const hint = 'mt-1 text-xs text-slate-500';
  const title = `${uid}-titulo`;
  const floorOptions = (list: number[]) => list.map(f => <option key={f} value={f}>{floorLabel(document, f)}</option>);

  return <dialog ref={dialog} onClose={onClose} aria-labelledby={title} className="m-auto max-h-[90vh] w-[min(44rem,94vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55">
    <form onSubmit={submit} noValidate className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Longo prazo · Serviço</p>
          <h3 id={title} className="mt-1 text-base font-bold text-slate-900">{initial ? 'Editar serviço' : 'Novo serviço'}</h3>
        </div>
        <button type="button" className="button-ghost px-2" aria-label="Fechar" onClick={() => dialog.current?.close()}><X size={16} aria-hidden /></button>
      </div>

      <fieldset disabled={readOnly} className="mt-5 min-w-0 space-y-5">
        <div>
          <label htmlFor={`${uid}-nome`} className={label}>Nome</label>
          <input ref={firstField} id={`${uid}-nome`} className="field" required maxLength={LIMITS.name} value={form.name} onChange={e => change({ name: e.target.value })} />
        </div>

        <div role="group" aria-labelledby={`${uid}-cor`}>
          <p id={`${uid}-cor`} className={label}>Cor</p>
          <div className="flex flex-wrap items-center gap-2">
            {LONG_TERM_COLORS.map(c => {
              const active = form.color.toLowerCase() === c;
              return <button key={c} type="button" aria-label={`Cor ${c}`} aria-pressed={active} onClick={() => change({ color: c })}
                className={`h-7 w-7 rounded-full border-2 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${active ? 'scale-110 border-slate-800' : 'border-transparent'}`}
                style={{ background: c }} />;
            })}
            <input type="color" aria-label="Cor personalizada" value={form.color} onChange={e => change({ color: e.target.value })}
              className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-pav-ini`} className={label}>Pavimento inicial</label>
            <select id={`${uid}-pav-ini`} className="field" value={form.firstFloor} onChange={e => change({ firstFloor: Number(e.target.value) })}>{floorOptions(floors)}</select>
          </div>
          <div>
            <label htmlFor={`${uid}-pav-fim`} className={label}>Pavimento final</label>
            <select id={`${uid}-pav-fim`} className="field" value={form.lastFloor} onChange={e => change({ lastFloor: Number(e.target.value) })}>{floorOptions(floors.filter(f => f >= form.firstFloor))}</select>
          </div>
        </div>

        <div role="group" aria-labelledby={`${uid}-preds`}>
          <p id={`${uid}-preds`} className={label}>Predecessoras</p>
          {form.predecessors.length > 0 && <ul className="mb-2 space-y-2">
            {form.predecessors.map((link, index) => {
              const pred = byId.get(link.activityId);
              const saved = draft.predecessors.find(l => l.activityId === link.activityId);
              const rowId = `${uid}-pred-${index}`;
              return <li key={link.activityId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
                    {pred ? <><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: pred.color }} aria-hidden />{pred.name}</> : 'Serviço excluído do plano'}
                  </p>
                  <button type="button" className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600" aria-label={`Remover predecessora ${pred?.name ?? ''}`.trim()}
                    onClick={() => change({ predecessors: form.predecessors.filter((_, i) => i !== index) })}><X size={14} aria-hidden /></button>
                </div>
                {pred && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem]">
                  <div>
                    <label htmlFor={`${rowId}-pav`} className="mb-1 block text-[11px] font-semibold text-slate-500">Referência</label>
                    <select id={`${rowId}-pav`} className="field" value={saved?.floor ?? ''} onChange={e => setLink(index, { floor: e.target.value === '' ? undefined : Number(e.target.value) })}>
                      <option value="">Cruzamento automático</option>
                      {Array.from({ length: pred.lastFloor - pred.firstFloor + 1 }, (_, i) => pred.firstFloor + i).map(f => <option key={f} value={f}>Após o pavimento {floorLabel(document, f)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${rowId}-lag`} className="mb-1 block text-[11px] font-semibold text-slate-500">Espera (dias)</label>
                    <input id={`${rowId}-lag`} className="field" type="number" step={1} inputMode="numeric" value={link.lagDays} onChange={e => setLink(index, { lagDays: e.target.value })} />
                  </div>
                </div>}
                {pred && saved && <p className="mt-1.5 text-[11px] text-slate-500">Libera o início a partir de {formatDate(minimumStart(pred, draft, saved))}.</p>}
              </li>;
            })}
          </ul>}
          <div className="flex gap-2">
            <label htmlFor={`${uid}-add-pred`} className="sr-only">Adicionar predecessora</label>
            <select id={`${uid}-add-pred`} className="field" value={addingId} onChange={e => setAddingId(e.target.value)}>
              <option value="">{candidates.length ? 'Selecionar serviço…' : 'Nenhum serviço disponível'}</option>
              {candidates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button type="button" className="button-ghost shrink-0" disabled={!addingId} onClick={addLink}><Plus size={14} aria-hidden />Adicionar</button>
          </div>
          <p className={hint}>Cruzamento automático: em cada pavimento em comum, este serviço só entra depois que a predecessora sai. Espera negativa é antecipação — começa antes de a predecessora terminar. Serviços que já dependem deste não aparecem, para não formar ciclo.</p>
        </div>

        <div>
          <label htmlFor={`${uid}-inicio`} className={label}>Data de início — {floorLabel(document, form.firstFloor)}</label>
          <div className="flex flex-wrap items-center gap-2">
            <input id={`${uid}-inicio`} className="field sm:max-w-[14rem]" type="date" required value={form.start} onChange={e => change({ start: e.target.value })} />
            {minimum && <button type="button" className="button-ghost" disabled={form.start === minimum} onClick={() => change({ start: minimum })}>Usar a data mínima</button>}
          </div>
          {minimum && <p className={`${hint} ${isLocalDate(form.start) && form.start < minimum ? 'font-semibold text-rose-700' : ''}`}>Mínimo pelas predecessoras e pelo ritmo: {formatDate(minimum)} — você pode adiar, nunca antecipar.</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-duracao`} className={label}>Duração por pavimento (dias corridos)</label>
            <input id={`${uid}-duracao`} className="field" type="number" min={1} max={LIMITS.duration} step={1} inputMode="numeric" required value={form.duration} onChange={e => change({ duration: e.target.value })} />
          </div>
          <div>
            <label htmlFor={`${uid}-ritmo`} className={label}>Ritmo / intervalo entre pavimentos (dias)</label>
            <input id={`${uid}-ritmo`} className="field" type="number" min={0} max={LIMITS.duration} step={1} inputMode="numeric" required aria-describedby={`${uid}-ritmo-dica`} value={form.interval} onChange={e => change({ interval: e.target.value })} />
            <p id={`${uid}-ritmo-dica`} className={hint}>Dias entre o início do pavimento n e o do n+1; 0 = todos ao mesmo tempo.</p>
          </div>
        </div>
        {faster.map(pred => <p key={pred.id} className="callout callout-warning" role="status">Ritmo mais rápido que {pred.name}: o início foi ajustado para os dois não se cruzarem no último pavimento em comum.</p>)}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-600">Durações por pavimento</p>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline" aria-expanded={showPerFloor} aria-controls={`${uid}-por-pav`} onClick={() => setShowPerFloor(v => !v)}>
              {showPerFloor ? 'Ocultar' : 'Personalizar por pavimento'}<ChevronDown size={14} aria-hidden className={showPerFloor ? 'rotate-180' : ''} />
            </button>
          </div>
          {showPerFloor && <ul id={`${uid}-por-pav`} className="custom-scrollbar mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {range.map(f => <li key={f} className="flex items-center gap-2">
              <label htmlFor={`${uid}-dur-${f}`} className="w-32 shrink-0 truncate text-xs text-slate-600">{floorLabel(document, f)}</label>
              <input id={`${uid}-dur-${f}`} className="field max-w-[7rem] py-1" type="number" min={1} max={LIMITS.duration} step={1} inputMode="numeric" placeholder={form.duration}
                value={form.floorDurations[String(f)] ?? ''}
                onChange={e => {
                  const next = { ...form.floorDurations };
                  if (e.target.value === '') delete next[String(f)]; else next[String(f)] = e.target.value;
                  change({ floorDurations: next });
                }} />
              <span className="text-xs text-slate-400">dias</span>
            </li>)}
          </ul>}
          <p className={hint}>Em branco, o pavimento usa a duração padrão ({form.duration || '—'} dias).</p>
        </div>

        <div role="group" aria-labelledby={`${uid}-equipes`}>
          <p id={`${uid}-equipes`} className={label}>Equipes</p>
          {form.teams.length > 0 && <ul className="mb-2 flex flex-wrap gap-1.5">
            {form.teams.map((team, index) => <li key={team.name} className="badge-muted pr-1.5">
              {team.name} · {plural(team.size, 'pessoa', 'pessoas')}
              <button type="button" className="rounded p-0.5 text-slate-400 hover:text-rose-600" aria-label={`Remover equipe ${team.name}`}
                onClick={() => change({ teams: form.teams.filter((_, i) => i !== index) })}><X size={12} aria-hidden /></button>
            </li>)}
          </ul>}
          <div className="flex gap-2">
            <label htmlFor={`${uid}-equipe-nome`} className="sr-only">Nome da equipe</label>
            <input id={`${uid}-equipe-nome`} className="field" placeholder="Nome da equipe…" maxLength={80} value={teamName} onChange={e => setTeamName(e.target.value)} onKeyDown={onTeamKey} />
            <label htmlFor={`${uid}-equipe-qtd`} className="sr-only">Pessoas na equipe</label>
            <input id={`${uid}-equipe-qtd`} className="field w-20 shrink-0" type="number" min={1} max={1000} step={1} inputMode="numeric" value={teamSize} onChange={e => setTeamSize(e.target.value)} onKeyDown={onTeamKey} />
            <button type="button" className="button-ghost shrink-0" disabled={!teamName.trim()} onClick={addTeam}><Plus size={14} aria-hidden />Adicionar</button>
          </div>
          <p className={hint}>Nome e quantidade de pessoas trabalhando ao mesmo tempo. Enter adiciona; repetir o nome atualiza a quantidade.</p>
        </div>

        <div role="group" aria-labelledby={`${uid}-unidade`}>
          <p id={`${uid}-unidade`} className={label}>Unidade de medição</p>
          {unitLocked ? <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="badge-muted">{initial?.unit ?? 'Sem unidade'}</span>
            {initial?.plannedTotal !== undefined && <span className="text-slate-600">Total previsto: <strong>{initial.plannedTotal.toLocaleString('pt-BR')}</strong></span>}
            <span className="w-full text-xs text-slate-500">Travada: este serviço já tem medição registrada.</span>
          </div> : <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {MEASUREMENT_UNITS.map(u => {
                const active = form.unit === u;
                return <button key={u} type="button" aria-pressed={active} onClick={() => change({ unit: active ? '' : u })}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-400'}`}>{u}</button>;
              })}
              <label htmlFor={`${uid}-outra`} className="sr-only">Outra unidade</label>
              <input id={`${uid}-outra`} className="field min-w-[8rem] flex-1 py-1.5" placeholder="Outra unidade…" maxLength={30}
                value={MEASUREMENT_UNITS.includes(form.unit) ? '' : form.unit} onChange={e => change({ unit: e.target.value })} />
            </div>
            {form.unit.trim() && form.unit.trim() !== '%' && <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${uid}-total`} className="text-xs font-semibold text-slate-600">Total previsto</label>
              <input id={`${uid}-total`} className="field w-32" type="number" min={0} step="any" inputMode="decimal" required placeholder="Ex.: 24"
                value={form.plannedTotal} onChange={e => change({ plannedTotal: e.target.value })} />
              <span className="text-xs text-slate-500">{form.unit.trim()} no total</span>
            </div>}
            <p className={hint}>Unidade com que o serviço será medido. Depois da primeira medição ela não muda mais.</p>
          </div>}
        </div>

        <div>
          <label htmlFor={`${uid}-obs`} className={label}>Observações</label>
          <textarea id={`${uid}-obs`} className="field min-h-20" rows={3} maxLength={LIMITS.text} value={form.notes} onChange={e => change({ notes: e.target.value })} />
        </div>
      </fieldset>

      <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700" aria-live="polite">
        {span ? <>Início <strong>{formatDate(span.start)}</strong> → término <strong>{formatDate(span.finish)}</strong> · {plural(span.days, 'dia', 'dias')} · {plural(range.length, 'pavimento', 'pavimentos')}</> : 'Informe a data de início para ver o período do serviço.'}
      </p>

      {errors.length > 0 && <div ref={errorBox} className="callout callout-danger mt-4" role="alert">
        {errors.length === 1 ? errors[0] : <ul className="list-disc space-y-0.5 pl-5">{errors.map(m => <li key={m}>{m}</li>)}</ul>}
      </div>}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
        {readOnly ? <button ref={closeButton} type="button" className="button-ghost" onClick={() => dialog.current?.close()}>Fechar</button> : <>
          {initial && onDelete && <button type="button" className="button-ghost mr-auto text-rose-700 hover:text-rose-800"
            onClick={() => { if (confirm(`Excluir "${initial.name}"? As medições dele também saem do plano.`)) onDelete(); }}><Trash2 size={14} aria-hidden />Excluir</button>}
          {initial && onDuplicate && <button type="button" className="button-ghost" onClick={onDuplicate}><Copy size={14} aria-hidden />Duplicar</button>}
          <button type="button" className="button-ghost" onClick={() => dialog.current?.close()}>Cancelar</button>
          <button type="submit" className="button">Salvar</button>
        </>}
      </div>
    </form>
  </dialog>;
}

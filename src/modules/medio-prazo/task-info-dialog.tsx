'use client';
import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { CONSTRAINT_TYPES, LINK_TYPES, type ConstraintType, type LinkType, type Team } from '@/domain/entities';
import { CONSTRAINT_LABELS, constraintNeedsDate } from '@/domain/plan-schedule';
import { formatLink } from '@/domain/rules';

/* "Informações da tarefa" do Project (Shift+F2, ou duplo clique na linha ou na barra), com as abas
 * Geral, Predecessoras, Recursos, Avançado e Anotações sobre uma tarefa só. O diálogo não valida datas
 * nem grava nada: devolve as células alteradas, no mesmo texto que a pessoa digitaria na grade, e a
 * tela as aplica de uma vez com a mesma função da edição de célula (mesmas validações, mesmo
 * reagendamento) — um passo só no desfazer. Só a defasagem é conferida aqui, porque a grade não tem
 * campo numérico para ela. */

/** Campos do diálogo que viram célula da grade; os nomes são as chaves das colunas da tabela. */
export type TaskInfoField =
  'name' | 'duration' | 'progress' | 'start' | 'end' | 'links' | 'team' | 'constraintType' | 'constraintDate' | 'deadline' | 'notes';
export type TaskInfoTab = 'geral' | 'predecessoras' | 'recursos' | 'avancado' | 'anotacoes';
/** Uma linha da aba Predecessoras: o Id da linha na tabela (texto, como se digita), o tipo e a defasagem. */
export interface TaskInfoPredecessor {
  number: string;
  type: LinkType;
  /** Dias inteiros, com sinal; texto porque é o que o campo guarda enquanto se digita. */
  lag: string;
  lagBusiness: boolean;
}
export interface TaskInfoValues {
  name: string;
  /** Como a coluna Duração escreve: "5 dias", "3 dias corridos", "0 dias". */
  duration: string;
  progress: string;
  /** AAAA-MM-DD. */
  start: string;
  end: string;
  timeline: boolean;
  predecessors: TaskInfoPredecessor[];
  teamId: string;
  constraintType: ConstraintType;
  constraintDate: string;
  deadline: string;
  notes: string;
}
/** Tarefa que pode ser escolhida como predecessora: o Id da linha e o nome. */
export interface TaskInfoOption {
  number: number;
  name: string;
  summary: boolean;
}
export interface TaskInfoChange {
  key: TaskInfoField;
  text: string;
}

const TABS: { id: TaskInfoTab; label: string }[] = [
  { id: 'geral', label: 'Geral' },
  { id: 'predecessoras', label: 'Predecessoras' },
  { id: 'recursos', label: 'Recursos' },
  { id: 'avancado', label: 'Avançado' },
  { id: 'anotacoes', label: 'Anotações' },
];
const LINK_LABELS: Record<LinkType, string> = {
  TI: 'Término-a-início (TI)',
  II: 'Início-a-início (II)',
  TT: 'Término-a-término (TT)',
  IT: 'Início-a-término (IT)',
};

/** A defasagem digitada, em dias inteiros; vazio é zero. */
function lagDays(row: TaskInfoPredecessor, line: number): number {
  const text = row.lag.trim().replace(',', '.');
  if (!text) return 0;
  const n = Number(text);
  if (!Number.isInteger(n))
    throw new Error(`Predecessora da linha ${line}: a defasagem é um número inteiro de dias (use - para antecipar).`);
  return n;
}

/** Texto da coluna Predecessoras para as linhas da aba, no formato da grade ("3;5II+2 dias"). Linha
 * sem Id fica de fora; Id que não é número segue como foi digitado, para a grade recusar com a
 * mensagem dela. */
export function predecessorsText(rows: readonly TaskInfoPredecessor[]): string {
  return rows
    .filter(r => r.number.trim())
    .map((r, i) => {
      const number = r.number.trim();
      if (!/^\d+$/.test(number)) return number;
      return formatLink(Number(number), { type: r.type, lagDays: lagDays(r, i + 1), lagBusiness: r.lagBusiness });
    })
    .join(';');
}

/** As células que mudaram entre `before` e `after`, na ordem em que a grade deve aplicá-las: o
 * início antes do % (lançar avanço prende o início real no início previsto), a duração antes do
 * término (o término digitado refaz a duração) e as datas antes da restrição, para o tipo e a data
 * escolhidos em Avançado valerem sobre a restrição que digitar o início ou o término cria. */
export function taskInfoChanges(before: TaskInfoValues, after: TaskInfoValues): TaskInfoChange[] {
  const changes: TaskInfoChange[] = [];
  const add = (key: TaskInfoField, a: string, b: string) => {
    if (a.trim() !== b.trim()) changes.push({ key, text: b });
  };
  add('name', before.name, after.name);
  add('duration', before.duration, after.duration);
  add('start', before.start, after.start);
  add('end', before.end, after.end);
  add('progress', before.progress, after.progress);
  add('links', predecessorsText(before.predecessors), predecessorsText(after.predecessors));
  add('team', before.teamId, after.teamId);
  add('constraintType', before.constraintType, after.constraintType);
  if (constraintNeedsDate(after.constraintType)) add('constraintDate', before.constraintDate, after.constraintDate);
  add('deadline', before.deadline, after.deadline);
  if (before.notes !== after.notes) changes.push({ key: 'notes', text: after.notes });
  return changes;
}

export interface TaskInfoDialogProps {
  /** "3 · Alvenaria 4º pav": Id da linha e nome. */
  title: string;
  subtitle?: string;
  summary: boolean;
  initial: TaskInfoValues;
  initialTab?: TaskInfoTab;
  /** A grade está liberada para edição; sem isso o diálogo só mostra. */
  canEdit: boolean;
  /** Campo a campo, o que a grade deixa editar nesta linha (o resumo não tem datas próprias). */
  editable: Record<TaskInfoField | 'timeline', boolean>;
  options: TaskInfoOption[];
  teams: Team[];
  /** Aplica tudo de uma vez; devolve a mensagem de erro, se a grade recusar. */
  onApply: (changes: TaskInfoChange[], timeline: boolean) => string | undefined;
  onClose: () => void;
}

export function TaskInfoDialog({
  title,
  subtitle,
  summary,
  initial,
  initialTab = 'geral',
  canEdit,
  editable,
  options,
  teams,
  onApply,
  onClose,
}: TaskInfoDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  // O ponto de partida fica guardado: a comparação do OK é contra o que o diálogo mostrou ao abrir.
  const [start] = useState(initial);
  const [values, setValues] = useState(initial);
  const [tab, setTab] = useState<TaskInfoTab>(initialTab);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  const set = <K extends keyof TaskInfoValues>(key: K, value: TaskInfoValues[K]) => setValues(v => ({ ...v, [key]: value }));
  const setRow = (index: number, patch: Partial<TaskInfoPredecessor>) =>
    set(
      'predecessors',
      values.predecessors.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  function ok() {
    if (!canEdit) return onClose();
    try {
      const message = onApply(taskInfoChanges(start, values), values.timeline);
      if (message) setError(message);
      else onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const tabClass = (on: boolean) =>
    `-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${on ? 'border-primary text-primary-ink' : 'border-transparent text-slate-500 hover:text-slate-800'}`;
  const label = 'block text-xs font-semibold text-slate-600';
  const linksLocked = !editable.links;

  return (
    <dialog
      ref={ref}
      aria-labelledby="task-info-title"
      onCancel={e => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[90vh] w-[min(95vw,46rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/55"
    >
      <form
        className="flex max-h-[90vh] flex-col"
        onSubmit={e => {
          e.preventDefault();
          ok();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <p className="eyebrow">Informações da tarefa</p>
            <h3 id="task-info-title" className="mt-1 truncate text-base font-bold text-slate-900">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" className="button-ghost shrink-0 px-2" onClick={onClose} aria-label="Fechar sem aplicar">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div
          role="tablist"
          aria-label="Informações da tarefa"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-5"
        >
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`task-info-tab-${t.id}`}
              aria-controls={`task-info-panel-${t.id}`}
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              className={tabClass(tab === t.id)}
              onClick={() => setTab(t.id)}
              onKeyDown={e => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const at = TABS.findIndex(x => x.id === tab) + (e.key === 'ArrowRight' ? 1 : -1);
                const next = TABS[(at + TABS.length) % TABS.length].id;
                setTab(next);
                requestAnimationFrame(() => document.getElementById(`task-info-tab-${next}`)?.focus());
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`task-info-panel-${tab}`}
          aria-labelledby={`task-info-tab-${tab}`}
          className="min-h-[18rem] flex-1 overflow-auto px-5 py-4"
        >
          {tab === 'geral' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${label} sm:col-span-2`}>
                Nome
                <input className="field mt-1.5" value={values.name} disabled={!editable.name} onChange={e => set('name', e.target.value)} />
              </label>
              <label className={label}>
                Duração
                <input
                  className="field mt-1.5"
                  value={values.duration}
                  disabled={!editable.duration}
                  placeholder="5 dias, 3 dias corridos, 0 dias"
                  onChange={e => set('duration', e.target.value)}
                />
              </label>
              <label className={label}>
                % concluída
                <input
                  className="field mt-1.5"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={values.progress}
                  disabled={!editable.progress}
                  onChange={e => set('progress', e.target.value)}
                />
              </label>
              <label className={label}>
                Início
                <input
                  className="field mt-1.5"
                  type="date"
                  value={values.start}
                  disabled={!editable.start}
                  onChange={e => set('start', e.target.value)}
                />
              </label>
              <label className={label}>
                Término
                <input
                  className="field mt-1.5"
                  type="date"
                  value={values.end}
                  disabled={!editable.end}
                  onChange={e => set('end', e.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={values.timeline}
                  disabled={!editable.timeline}
                  onChange={e => set('timeline', e.target.checked)}
                />
                Exibir na Linha do Tempo
              </label>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                {summary
                  ? 'Resumo: duração, datas e % concluída vêm das subtarefas.'
                  : 'Mudar o início cria “Não iniciar antes de” nessa data, e o término, “Não terminar antes de”, como digitar na grade.'}
              </p>
            </div>
          )}
          {tab === 'predecessoras' && (
            <div>
              {linksLocked && summary && <p className="mb-3 text-xs text-slate-500">Vínculos ficam nas subtarefas, não nos resumos.</p>}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[34rem] text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th scope="col" className="w-16 px-2 py-2 font-semibold">
                        Id
                      </th>
                      <th scope="col" className="px-2 py-2 font-semibold">
                        Nome da tarefa
                      </th>
                      <th scope="col" className="w-44 px-2 py-2 font-semibold">
                        Tipo
                      </th>
                      <th scope="col" className="w-36 px-2 py-2 font-semibold">
                        Defasagem
                      </th>
                      <th scope="col" className="w-10 px-2 py-2">
                        <span className="sr-only">Remover</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {values.predecessors.map((row, i) => {
                      const option = options.find(o => String(o.number) === row.number.trim());
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1.5">
                            <input
                              className="field px-2 py-1 text-xs"
                              inputMode="numeric"
                              aria-label={`Id da predecessora ${i + 1}`}
                              value={row.number}
                              disabled={linksLocked}
                              onChange={e => setRow(i, { number: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="field px-2 py-1 text-xs"
                              aria-label={`Nome da predecessora ${i + 1}`}
                              value={option ? String(option.number) : ''}
                              disabled={linksLocked}
                              onChange={e => setRow(i, { number: e.target.value })}
                            >
                              <option value="">{row.number.trim() ? `Linha ${row.number.trim()} não existe` : 'Escolha a tarefa'}</option>
                              {options.map(o => (
                                <option key={o.number} value={o.number}>
                                  {o.number} · {o.name}
                                  {o.summary ? ' (resumo)' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              className="field px-2 py-1 text-xs"
                              aria-label={`Tipo do vínculo ${i + 1}`}
                              value={row.type}
                              disabled={linksLocked}
                              onChange={e => setRow(i, { type: e.target.value as LinkType })}
                            >
                              {LINK_TYPES.map(type => (
                                <option key={type} value={type}>
                                  {LINK_LABELS[type]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <span className="flex items-center gap-1">
                              <input
                                className="field w-14 px-2 py-1 text-xs"
                                inputMode="numeric"
                                aria-label={`Defasagem do vínculo ${i + 1}, em dias`}
                                value={row.lag}
                                disabled={linksLocked}
                                onChange={e => setRow(i, { lag: e.target.value })}
                              />
                              <select
                                className="field w-auto px-1 py-1 text-xs"
                                aria-label={`Unidade da defasagem ${i + 1}`}
                                value={row.lagBusiness ? 'd' : 'dd'}
                                disabled={linksLocked}
                                onChange={e => setRow(i, { lagBusiness: e.target.value === 'd' })}
                              >
                                <option value="d">dias</option>
                                <option value="dd">corridos</option>
                              </select>
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-danger disabled:opacity-40"
                              aria-label={`Remover predecessora ${i + 1}`}
                              disabled={linksLocked}
                              onClick={() =>
                                set(
                                  'predecessors',
                                  values.predecessors.filter((_, j) => j !== i),
                                )
                              }
                            >
                              <Trash2 size={14} aria-hidden />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {!values.predecessors.length && (
                      <tr>
                        <td colSpan={5} className="px-2 py-3 text-slate-500">
                          Sem predecessoras: a data vem da restrição ou do início guardado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="button-ghost mt-3 px-2.5 py-1.5 text-xs"
                disabled={linksLocked}
                onClick={() => set('predecessors', [...values.predecessors, { number: '', type: 'TI', lag: '', lagBusiness: true }])}
              >
                <Plus size={14} aria-hidden /> Adicionar predecessora
              </button>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Defasagem positiva é espera; negativa, antecipação. Vínculo que fecharia um ciclo é recusado ao aplicar.
              </p>
            </div>
          )}
          {tab === 'recursos' && (
            <div className="grid gap-3">
              <label className={label}>
                Recurso (equipe da obra)
                <select
                  className="field mt-1.5"
                  value={values.teamId}
                  disabled={!editable.team}
                  onChange={e => set('teamId', e.target.value)}
                >
                  <option value="">Sem recurso</option>
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>
                      {team.company} · {team.name}
                    </option>
                  ))}
                </select>
              </label>
              {(() => {
                const team = teams.find(t => t.id === values.teamId);
                return team ? (
                  <p className="text-xs text-slate-500">
                    Capacidade semanal: {team.weeklyCapacity}{' '}
                    {team.weeklyCapacity === 1 ? 'atividade simultânea' : 'atividades simultâneas'}.
                  </p>
                ) : null;
              })()}
              <p className="text-xs leading-5 text-slate-500">
                O recurso é a equipe cadastrada na obra. Ele aparece no Planejador de Equipe, no Uso dos Recursos e na Planilha de Recursos.
              </p>
            </div>
          )}
          {tab === 'avancado' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`${label} sm:col-span-2`}>
                Prazo final
                <input
                  className="field mt-1.5 sm:w-1/2"
                  type="date"
                  value={values.deadline}
                  disabled={!editable.deadline}
                  onChange={e => set('deadline', e.target.value)}
                />
              </label>
              <label className={label}>
                Tipo de restrição
                <select
                  className="field mt-1.5"
                  value={values.constraintType}
                  disabled={!editable.constraintType}
                  onChange={e => set('constraintType', e.target.value as ConstraintType)}
                >
                  {CONSTRAINT_TYPES.map(type => (
                    <option key={type} value={type}>
                      {CONSTRAINT_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={label}>
                Data da restrição
                <input
                  className="field mt-1.5"
                  type="date"
                  value={constraintNeedsDate(values.constraintType) ? values.constraintDate : ''}
                  disabled={!editable.constraintDate || !constraintNeedsDate(values.constraintType)}
                  onChange={e => set('constraintDate', e.target.value)}
                />
              </label>
              <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                Prazo final não move a tarefa: reduz a folga e acende o indicador quando o término passa dele. Tipo com data e sem data
                informada usa o início (ou o término) atual da tarefa.
              </p>
            </div>
          )}
          {tab === 'anotacoes' && (
            <label className={label}>
              Anotações e encaminhamentos
              <textarea
                className="field mt-1.5 min-h-56 whitespace-pre-wrap font-normal"
                value={values.notes}
                readOnly={!editable.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </label>
          )}
        </div>
        {error && (
          <p role="alert" className="mx-5 mb-2 rounded-lg border border-danger-ring bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {!canEdit && <p className="mr-auto text-xs text-slate-500">Somente leitura: libere a edição da grade para alterar.</p>}
          <button type="button" className="button-ghost" onClick={onClose}>
            {canEdit ? 'Cancelar' : 'Fechar'}
          </button>
          {canEdit && (
            <button type="submit" className="button">
              OK
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}

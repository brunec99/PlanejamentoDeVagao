'use client';
import { useId, useMemo, useState } from 'react';
import { FileUp, Plus } from 'lucide-react';
import type { MediumTermPlan } from '@/domain/entities';
import { buildPlanImport, parseMspdi, type MspdiProject, type PlanImportDraft } from '@/domain/mspdi-import';
import { planWindow } from '@/domain/plan-schedule';
import {
  compareWithProject,
  suggestResourceChoices,
  toImportCommand,
  type DateDifference,
  type ResourceChoice,
} from '@/application/use-cases/plan-import';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Field } from '@/modules/planejamento/forms';
import { Callout } from '@/modules/planejamento/ui';
import { Drawer } from '@/modules/layout/drawer';
import { useToast } from '@/modules/layout/toast';

/** Gaveta "Novo cronograma do mês" (08/11/2026): o mês nasce como cópia de um mês anterior, em branco
 * ou importado de um arquivo do MS Project. A importação lê o XML no navegador, mostra a conferência
 * (o que foi lido, avisos, recursos → equipes e as datas que o sistema calcula diferente do Project)
 * e só grava ao confirmar, pelo comando `import_plan`. Regras no modelo aprovado e em
 * docs/planejamento-tres-niveis.md, seção de 08/11/2026. */

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const projectDate = (d?: string) =>
  d ? `${WEEKDAYS[new Date(d + 'T00:00:00Z').getUTCDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : 'ND';
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const nextMonth = (m: string) => {
  const y = Number(m.slice(0, 4)),
    n = Number(m.slice(5, 7));
  return n === 12 ? `${y + 1}-01` : `${y}-${String(n + 1).padStart(2, '0')}`;
};
const count = (n: number, one: string, many: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
export const PROJECT_BASELINE_NAME = 'Linha de base do Project';
/** Mais que isso a lista de datas diferentes vira "mais N", para a gaveta não crescer sem fim. */
const MAX_DIFFERENCES = 40;

type Origin = { kind: 'copy'; planId: string } | { kind: 'blank' } | { kind: 'import' };
interface Loaded {
  fileName: string;
  project: MspdiProject;
}

export function NewPlanDrawer({
  workId,
  plans,
  today,
  onDone,
  tone = 'ghost',
}: {
  workId: string;
  plans: MediumTermPlan[];
  today: string;
  onDone: (id: string) => void;
  tone?: 'primary' | 'ghost';
}) {
  const context = usePlanning();
  const { toast } = useToast();
  const latest = plans[0];
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(latest ? nextMonth(latest.month) : today.slice(0, 7));
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [origin, setOrigin] = useState<Origin>(latest ? { kind: 'copy', planId: latest.id } : { kind: 'blank' });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fileError, setFileError] = useState('');
  const [choices, setChoices] = useState<ResourceChoice[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = { month: useId(), name: useId(), file: useId(), origin: useId() };
  const teams = useMemo(
    () =>
      context.state === 'ready'
        ? context.planning.data.teams
            .filter(t => t.workId === workId)
            .slice()
            .sort((a, b) => a.company.localeCompare(b.company, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR'))
        : [],
    [context, workId],
  );
  // O rascunho depende do mês (a janela do plano), então é refeito quando ele muda.
  const built = useMemo<{ draft?: PlanImportDraft; error?: string }>(() => {
    if (!loaded) return {};
    try {
      return { draft: buildPlanImport(loaded.project, { month, fileName: loaded.fileName }) };
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'Não foi possível converter o arquivo.' };
    }
  }, [loaded, month]);
  const draft = built.draft;
  const comparison = useMemo<{ differences: DateDifference[]; compared: number; error?: string } | null>(() => {
    if (!draft) return null;
    try {
      return compareWithProject(draft);
    } catch (cause) {
      return { differences: [], compared: 0, error: cause instanceof Error ? cause.message : 'Falha ao calcular as datas.' };
    }
  }, [draft]);

  if (context.state !== 'ready') return null;
  const actor = context.planning.data.users.find(u => u.id === context.actorId);
  if (actor?.role === 'viewer') return null;

  const reset = () => {
    setMonth(latest ? nextMonth(latest.month) : today.slice(0, 7));
    setName('');
    setNameTouched(false);
    setOrigin(latest ? { kind: 'copy', planId: latest.id } : { kind: 'blank' });
    setLoaded(null);
    setFileError('');
    setChoices([]);
    setError('');
  };

  const readFile = async (file: File | undefined) => {
    setFileError('');
    setLoaded(null);
    setChoices([]);
    if (!file) return;
    if (/\.(mpp|mpt)$/i.test(file.name)) {
      setFileError(
        'O arquivo .mpp é o formato fechado do Project. Abra-o no Project e use Arquivo › Salvar como › tipo "Formato XML (*.xml)"; depois escolha o .xml aqui.',
      );
      return;
    }
    try {
      const text = await file.text();
      const project = parseMspdi(text);
      const next = { fileName: file.name, project };
      const first = buildPlanImport(project, { month, fileName: file.name });
      setLoaded(next);
      setChoices(suggestResourceChoices(first.resources, teams));
      if (!nameTouched) setName(first.name);
    } catch (cause) {
      setFileError(cause instanceof Error ? cause.message : 'Não foi possível ler o arquivo.');
    }
  };

  const submit = async () => {
    if (busy) return;
    setError('');
    if (origin.kind === 'import' && !draft) {
      setError('Escolha o arquivo do Project antes de criar o cronograma.');
      return;
    }
    setBusy(true);
    try {
      const id =
        origin.kind === 'import'
          ? await context.execute(
              toImportCommand(draft!, choices, {
                workId,
                month,
                fileName: loaded!.fileName,
                name,
                baselineName: draft!.baseline && Object.keys(draft!.baseline).length ? PROJECT_BASELINE_NAME : undefined,
              }),
            )
          : await context.execute({
              type: 'create_plan',
              workId,
              month,
              name: name.trim() || undefined,
              copyFrom: origin.kind === 'copy' ? origin.planId : undefined,
            });
      setOpen(false);
      toast({ title: origin.kind === 'import' ? 'Cronograma importado do Project' : 'Cronograma criado', tone: 'success' });
      onDone(id);
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o cronograma.');
    } finally {
      setBusy(false);
    }
  };

  const originValue = origin.kind === 'copy' ? `copy:${origin.planId}` : origin.kind;
  const importing = origin.kind === 'import';
  const horizon = planWindow(/^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7));

  return (
    <>
      <button
        type="button"
        className={tone === 'primary' ? 'button' : 'button-ghost'}
        aria-haspopup="dialog"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Plus size={15} aria-hidden />
        Novo cronograma do mês
      </button>
      <Drawer
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Novo cronograma do mês"
        description="Cada mês tem o seu cronograma, com horizonte de três meses."
        width={importing && draft ? 'lg' : 'md'}
      >
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <Field label="Mês">
              <input id={ids.month} className="field" type="month" required value={month} onChange={e => setMonth(e.target.value)} />
            </Field>
            <Field label="Partir de">
              <select
                id={ids.origin}
                className="field"
                value={originValue}
                onChange={e => {
                  const v = e.target.value;
                  setOrigin(v === 'blank' ? { kind: 'blank' } : v === 'import' ? { kind: 'import' } : { kind: 'copy', planId: v.slice(5) });
                }}
              >
                {plans.map(p => (
                  <option key={p.id} value={`copy:${p.id}`}>
                    Cópia de {monthLabel(p.month)} · {p.name}
                  </option>
                ))}
                <option value="blank">Em branco</option>
                <option value="import">Importar do MS Project (.xml)</option>
              </select>
            </Field>
            {origin.kind === 'copy' && (
              <p className="text-xs text-slate-500">
                A cópia leva tarefas, vínculos, recursos, % concluída e datas reais. Tarefas já concluídas antes do novo horizonte ficam de
                fora; o cronograma do mês anterior não muda.
              </p>
            )}
            {importing && (
              <div className="space-y-2 rounded-lg border border-dashed border-brand-400 bg-slate-50 p-3">
                <label htmlFor={ids.file} className="flex items-center gap-2 text-sm font-semibold text-brand-700">
                  <FileUp size={16} aria-hidden />
                  Arquivo do Project (.xml)
                </label>
                <input
                  id={ids.file}
                  type="file"
                  accept=".xml,.mpp,application/xml,text/xml"
                  className="block w-full min-w-0 text-xs file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                  onChange={e => void readFile(e.target.files?.[0])}
                />
                <p className="text-[11px] text-slate-500">
                  No Project: Arquivo › Salvar como › tipo &quot;Formato XML (*.xml)&quot;. Nada é gravado até você clicar em &quot;Criar
                  cronograma&quot;.
                </p>
              </div>
            )}
            {importing && fileError && (
              <Callout tone="danger" role="alert">
                {fileError}
              </Callout>
            )}
            {importing && built.error && (
              <Callout tone="danger" role="alert">
                {built.error}
              </Callout>
            )}
            {importing && draft && comparison && (
              <ImportReview
                draft={draft}
                comparison={comparison}
                choices={choices}
                setChoices={setChoices}
                teams={teams}
                windowEnd={horizon.end}
                windowStart={horizon.start}
              />
            )}
            <Field
              label={importing ? 'Nome' : 'Nome (opcional)'}
              hint={importing && loaded ? 'Vem do título do arquivo; dá para trocar.' : undefined}
            >
              <input
                id={ids.name}
                className="field"
                value={name}
                onChange={e => {
                  setName(e.target.value);
                  setNameTouched(true);
                }}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button className="button" type="submit" disabled={importing && !draft}>
                {busy ? 'Salvando…' : importing ? `Criar cronograma de ${monthLabel(month)}` : 'Criar cronograma'}
              </button>
              <button type="button" className="button-ghost" onClick={() => setOpen(false)}>
                Cancelar
              </button>
            </div>
          </fieldset>
          {error && (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          )}
        </form>
      </Drawer>
    </>
  );
}

function ImportReview({
  draft,
  comparison,
  choices,
  setChoices,
  teams,
  windowStart,
  windowEnd,
}: {
  draft: PlanImportDraft;
  comparison: { differences: DateDifference[]; compared: number; error?: string };
  choices: ResourceChoice[];
  setChoices: (next: ResourceChoice[]) => void;
  teams: { id: string; name: string; company: string }[];
  windowStart: string;
  windowEnd: string;
}) {
  const tasks = draft.tasks;
  const summaries = tasks.filter((t, i) => (tasks[i + 1]?.level ?? -1) > t.level).length;
  const leaves = tasks.filter((t, i) => (tasks[i + 1]?.level ?? -1) <= t.level);
  const done = leaves.filter(t => t.progress >= 100).length;
  const running = leaves.filter(t => t.progress > 0 && t.progress < 100).length;
  const baselineCount = draft.baseline ? Object.keys(draft.baseline).length : 0;
  const outside = leaves.filter(t => t.plannedStart > windowEnd).length;
  const before = leaves.filter(t => t.plannedEnd < windowStart && t.progress < 100).length;
  const workdays = [1, 2, 3, 4, 5, 6, 0]
    .filter(d => draft.calendar.weekdays.includes(d))
    .map(d => WEEKDAYS[d])
    .join(', ');
  const created = choices.filter(c => c.kind === 'create').length;
  const linked = choices.filter(c => c.kind === 'team').length;
  const setChoice = (index: number, raw: string) => {
    const current = choices[index];
    const next = choices.slice();
    if (raw === 'none') next[index] = { name: current.name, taskCount: current.taskCount, kind: 'none' };
    else if (raw === 'create') {
      const dash = current.name.indexOf(' - ');
      next[index] = {
        name: current.name,
        taskCount: current.taskCount,
        kind: 'create',
        teamName: current.name.trim(),
        company: (dash > 0 ? current.name.slice(0, dash) : current.name).trim(),
      };
    } else next[index] = { name: current.name, taskCount: current.taskCount, kind: 'team', teamId: raw };
    setChoices(next);
  };
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-3" aria-label="Conferência do arquivo">
      <h3 className="text-sm font-semibold text-slate-800">Conferência antes de criar</h3>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [count(tasks.length, 'linha', 'linhas'), count(summaries, 'resumo', 'resumos')],
          [draft.links.length.toLocaleString('pt-BR'), 'vínculos'],
          [`${done} · ${running}`, 'concluídas · em andamento'],
          [String(choices.length), 'recursos usados'],
        ].map(([value, label]) => (
          <div key={label} className="rounded-lg border border-slate-200 px-3 py-2">
            <dt className="sr-only">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">{value}</dd>
            <dd className="text-[11px] text-slate-500">{label}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-1.5 text-xs">
        <li className="callout callout-success">
          {baselineCount
            ? `Linha de base do Project em ${count(baselineCount, 'tarefa', 'tarefas')}: vira a linha de base "${PROJECT_BASELINE_NAME}", já escolhida no Gantt.`
            : 'O arquivo não tem linha de base; defina uma no sistema depois, se quiser.'}
        </li>
        <li className="callout callout-success">
          Calendário: {workdays}, {draft.calendar.hoursPerDay} h por dia,{' '}
          {count(draft.calendar.holidays.length, 'dia sem trabalho', 'dias sem trabalho')}.
        </li>
        <li className="callout callout-info">
          Horizonte de {projectDate(windowStart)} a {projectDate(windowEnd)}
          {outside
            ? `: ${count(outside, 'tarefa começa', 'tarefas começam')} depois dele e ${outside === 1 ? 'entra' : 'entram'} com o indicador "Fora do horizonte".`
            : '.'}
          {before ? ` ${count(before, 'tarefa não concluída termina', 'tarefas não concluídas terminam')} antes dele.` : ''}
        </li>
        {draft.warnings.map(w => (
          <li key={w.code} className="callout callout-warning">
            {w.message}
          </li>
        ))}
      </ul>

      {choices.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-xs font-semibold text-slate-700">Recursos do Project → equipes da obra</h4>
            <span className="text-[11px] text-slate-500">
              {linked} já existem · {created} serão criadas
            </span>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">Recurso no Project</th>
                  <th className="px-2 py-1.5 text-right">Tarefas</th>
                  <th className="px-2 py-1.5">Equipe no Obra 360</th>
                </tr>
              </thead>
              <tbody>
                {choices.map((choice, index) => (
                  <tr key={choice.name} className="border-t border-slate-100">
                    <td className="px-2 py-1">{choice.name}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{choice.taskCount}</td>
                    <td className="px-2 py-1">
                      <select
                        className="field py-1 text-xs"
                        aria-label={`Equipe para ${choice.name}`}
                        value={choice.kind === 'team' ? choice.teamId : choice.kind}
                        onChange={e => setChoice(index, e.target.value)}
                      >
                        <option value="create">
                          Criar &quot;{choice.kind === 'create' ? choice.teamName : choice.name}&quot;
                          {choice.kind === 'create' && choice.company !== choice.teamName ? ` (empresa ${choice.company})` : ''}
                        </option>
                        <option value="none">Sem recurso</option>
                        {teams.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} · {t.company}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <h4 className="text-xs font-semibold text-slate-700">Datas que o sistema calcula diferente do Project</h4>
        {comparison.error ? (
          <p className="callout callout-danger">{comparison.error}</p>
        ) : comparison.differences.length === 0 ? (
          <p className="text-xs text-slate-600">
            As {comparison.compared.toLocaleString('pt-BR')} tarefas ficam com as mesmas datas do Project.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-600">
              O sistema refaz a rede ao criar, como o Project faz ao abrir. {comparison.compared - comparison.differences.length} de{' '}
              {comparison.compared} tarefas ficam com as mesmas datas; estas mudam:
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5 text-right">Id</th>
                    <th className="px-2 py-1.5">Tarefa</th>
                    <th className="px-2 py-1.5">No Project</th>
                    <th className="px-2 py-1.5">No Obra 360</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.differences.slice(0, MAX_DIFFERENCES).map(d => (
                    <tr key={d.key} className="border-t border-slate-100">
                      <td className="px-2 py-1 text-right tabular-nums">{d.row}</td>
                      <td className="px-2 py-1">{d.name}</td>
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                        {projectDate(d.project.start)} → {projectDate(d.project.end)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                        {projectDate(d.system.start)} → {projectDate(d.system.end)}
                      </td>
                    </tr>
                  ))}
                  {comparison.differences.length > MAX_DIFFERENCES && (
                    <tr className="border-t border-slate-100">
                      <td colSpan={4} className="px-2 py-1 text-slate-500">
                        … mais {comparison.differences.length - MAX_DIFFERENCES}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

'use client';
import { useMemo, useState, type ReactNode } from 'react';
import type { MediumTermPlan } from '@/domain/entities';
import {
  LEGALIZATION_DEFAULT_NAME,
  LEGALIZATION_TEMPLATE,
  buildLegalizationTasks,
  legalizationSummary,
  legalizationWindow,
} from '@/domain/legalization';
import { DEFAULT_CALENDAR, analyzeSchedule } from '@/domain/plan-schedule';
import { CommandForm, Field, TextField, value } from '@/modules/planejamento/forms';
import { Callout } from '@/modules/planejamento/ui';
import { formatDate } from '@/shared/format';
import { plural } from './legalization-summary';

/* Formulários do Gantt de legalização (modelo de 04/11/2026, tela 2): criar o Gantt a partir da
 * entrega contratual e alterar a entrega depois. Os dois são comandos do planejamento
 * (`create_legalization_plan` e `update_legalization_plan`) numa gaveta, como os do médio prazo;
 * quem só consulta não vê nenhum dos dois (o `CommandForm` some para o perfil de consulta). */

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
/** A janela de 12 meses da data digitada, ou nada enquanto a data não está completa. */
function windowOf(date: string) {
  if (!isDate(date)) return undefined;
  try {
    return legalizationWindow(date);
  } catch {
    return undefined;
  }
}
const TEMPLATE_LINKS = LEGALIZATION_TEMPLATE.reduce((n, row) => n + (row.links?.length ?? 0), 0);
const caption = 'mb-1.5 block text-xs font-semibold text-slate-600';

/** Data da entrega e, logo abaixo, a janela que ela abre: o que a pessoa precisa conferir antes de criar. */
function DeliveryFields({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const range = windowOf(date);
  return (
    <>
      <Field
        label="Entrega contratual"
        hint={
          <>
            {range && <span className="mr-1 font-semibold text-slate-600">{WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]}.</span>}
            Vira o prazo final do marco "Entrega das chaves". A tolerância de 180 dias do contrato não entra.
          </>
        }
      >
        <input className="field" type="date" name="deliveryDate" required value={date} onChange={e => onChange(e.target.value)} />
      </Field>
      <div>
        <span className={caption}>Janela</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge-muted tabular-nums">
            {range ? `${formatDate(range.start)} a ${formatDate(range.end)}` : 'informe a entrega'}
          </span>
          <span className="text-[11px] text-slate-500">12 meses antes da entrega. Sombreada no Gantt; tarefas podem começar antes.</span>
        </div>
      </div>
    </>
  );
}

function Choice({
  name,
  value: choice,
  checked,
  onChange,
  title,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${checked ? 'border-primary-ring bg-primary-soft' : 'border-slate-200 bg-white'}`}
    >
      <input type="radio" name={name} value={choice} checked={checked} onChange={onChange} className="mt-1 accent-primary" />
      <span className="min-w-0">
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-600">{children}</span>
      </span>
    </label>
  );
}

/** Prévia do que o comando vai criar, com o mesmo `buildLegalizationTasks` do servidor e o motor do cronograma. */
function usePreview(date: string, template: 'atr' | 'blank', today: string) {
  return useMemo(() => {
    if (!windowOf(date)) return undefined;
    try {
      let n = 0;
      const { tasks, links } = buildLegalizationTasks({
        planId: 'previa',
        deliveryDate: date,
        template,
        newId: () => `previa-${n++}`,
        now: `${today}T00:00:00.000Z`,
      });
      const analysis = analyzeSchedule(tasks, links, DEFAULT_CALENDAR);
      const summary = legalizationSummary(tasks, analysis, date, today);
      const first = tasks.filter(t => t.duration).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.order - b.order)[0];
      return { first, summary };
    } catch {
      return undefined;
    }
  }, [date, template, today]);
}

/** Os campos da gaveta "Criar": vivem só enquanto ela está aberta, então cada abertura começa limpa. */
function CreateFields({ today, withLob, onWithLob }: { today: string; withLob: boolean; onWithLob: (on: boolean) => void }) {
  const [date, setDate] = useState('');
  const [template, setTemplate] = useState<'atr' | 'blank'>('atr');
  const preview = usePreview(date, template, today);
  const late = preview?.summary.lateDays ?? 0;
  const card = 'min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2';
  const cardLabel = 'text-[11px] font-bold uppercase tracking-wider text-slate-500';
  return (
    <>
      <DeliveryFields date={date} onChange={setDate} />
      <fieldset className="space-y-2">
        <legend className={caption}>Partir de</legend>
        <Choice
          name="template"
          value="atr"
          checked={template === 'atr'}
          onChange={() => setTemplate('atr')}
          title="Modelo ATR de legalização"
        >
          {LEGALIZATION_TEMPLATE.length} linhas e {TEMPLATE_LINKS} vínculos: caminho crítico da obra, Corpo de Bombeiros, concessionárias,
          elevadores, Prefeitura, Receita Federal, cartório e condomínio. Montado de trás para frente a partir da entrega.
        </Choice>
        <Choice name="template" value="blank" checked={template === 'blank'} onChange={() => setTemplate('blank')} title="Em branco">
          Só o marco "Entrega das chaves", com o prazo final na entrega contratual.
        </Choice>
      </fieldset>
      <div>
        <span className={caption}>Linha de Balanço</span>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" name="lob" checked={withLob} onChange={e => onWithLob(e.target.checked)} className="mt-1 accent-primary" />
          <span>
            Trazer também os serviços da Linha de Balanço que passam pela janela{' '}
            <span className="text-slate-500">(você revê a lista no passo seguinte)</span>.
          </span>
        </label>
      </div>
      {preview && (
        <div>
          <span className={caption}>Prévia</span>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className={card}>
              <p className={cardLabel}>Primeira tarefa</p>
              <p className="text-base font-bold tabular-nums text-slate-900">
                {preview.first ? formatDate(preview.first.plannedStart) : '—'}
              </p>
              <p className="truncate text-xs text-slate-500" title={preview.first?.name}>
                {preview.first?.name ?? 'nenhuma'}
              </p>
            </div>
            <div className={card}>
              <p className={cardLabel}>Entrega prevista</p>
              <p className={`text-base font-bold tabular-nums ${late > 0 ? 'text-danger' : 'text-slate-900'}`}>
                {preview.summary.forecast ? formatDate(preview.summary.forecast) : '—'}
              </p>
              <p className={`text-xs ${late > 0 ? 'font-semibold text-danger' : 'text-slate-500'}`}>
                {late > 0
                  ? `${plural(late, 'dia útil', 'dias úteis')} após o prazo`
                  : late < 0
                    ? `${plural(-late, 'dia útil', 'dias úteis')} antes do prazo`
                    : 'No prazo'}
              </p>
            </div>
            <div className={card}>
              <p className={cardLabel}>Críticas</p>
              <p className="text-base font-bold tabular-nums text-slate-900">
                {plural(preview.summary.criticalCount, 'tarefa', 'tarefas')}
              </p>
              <p className="text-xs text-slate-500">folga total ≤ 0</p>
            </div>
          </div>
          <div className="mt-2">
            <Callout tone="info">
              As datas do modelo são um ponto de partida. Depois de criado, o Gantt é seu: durações, vínculos e tarefas se editam como no
              cronograma do médio prazo, e nada muda quando o modelo da empresa mudar.
            </Callout>
          </div>
        </div>
      )}
      <TextField name="name" label="Nome (opcional)" required={false} placeholder={LEGALIZATION_DEFAULT_NAME} />
      <p className="text-xs text-slate-500">Um Gantt de legalização por obra.</p>
    </>
  );
}

/** "Criar Gantt de legalização": o botão primário do estado vazio. `onCreated` recebe se a pessoa
 * deixou marcado "Trazer também os serviços da Linha de Balanço", para a tela abrir a importação. */
export function CreateLegalizationForm({
  workId,
  today,
  onCreated,
}: {
  workId: string;
  today: string;
  onCreated: (importLob: boolean) => void;
}) {
  const [withLob, setWithLob] = useState(true);
  return (
    <CommandForm
      title="Criar Gantt de legalização"
      description="Os 12 meses até a entrega: o caminho crítico da obra e cada documento até as chaves."
      submit={withLob ? 'Criar e revisar a Linha de Balanço' : 'Criar Gantt de legalização'}
      tone="primary"
      width="lg"
      success="Gantt de legalização criado"
      // O `withLob` deste render é o que foi enviado: a gaveta fica travada enquanto salva.
      onDone={() => onCreated(withLob)}
      command={d => ({
        type: 'create_legalization_plan',
        workId,
        deliveryDate: value(d, 'deliveryDate'),
        template: value(d, 'template') === 'blank' ? 'blank' : 'atr',
        name: value(d, 'name') || undefined,
      })}
    >
      <CreateFields today={today} withLob={withLob} onWithLob={setWithLob} />
    </CommandForm>
  );
}

function DeliveryEditFields({ plan }: { plan: MediumTermPlan }) {
  const [date, setDate] = useState(plan.deliveryDate ?? '');
  return (
    <>
      <DeliveryFields date={date} onChange={setDate} />
      <TextField name="name" label="Nome" required={false} defaultValue={plan.name} placeholder={LEGALIZATION_DEFAULT_NAME} />
    </>
  );
}

/** "Alterar entrega", no cabeçalho do cronograma. Com rascunho aberto o botão fica travado: a nova
 * entrega grava o prazo final do marco direto no banco, e o "Revisar e salvar" do rascunho seria
 * recusado por o cronograma ter mudado por fora. */
export function DeliveryForm({
  plan,
  locked = false,
  label = 'Alterar entrega',
}: {
  plan: MediumTermPlan;
  locked?: boolean;
  label?: string;
}) {
  if (locked)
    return (
      <span className="inline-flex" title="Salve ou descarte o rascunho antes de alterar a entrega.">
        <button type="button" className="button-ghost" disabled>
          {label}
        </button>
      </span>
    );
  return (
    <CommandForm
      title="Alterar entrega"
      description="A nova data vira o prazo final do marco da entrega e move a janela de 12 meses. As tarefas não mudam de data: a folga passa a ser contada até o novo prazo."
      submit="Salvar entrega"
      trigger={label}
      icon="none"
      success="Entrega contratual alterada"
      command={d => ({
        type: 'update_legalization_plan',
        planId: plan.id,
        deliveryDate: value(d, 'deliveryDate'),
        name: value(d, 'name'),
      })}
    >
      <DeliveryEditFields plan={plan} />
    </CommandForm>
  );
}

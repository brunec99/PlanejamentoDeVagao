'use client';
import { useMemo, type ReactNode } from 'react';
import { legalizationSummary } from '@/domain/legalization';
import type { SheetApi } from '@/modules/medio-prazo/schedule-sheet';
import { Callout } from '@/modules/planejamento/ui';

/* Resumo do topo do Gantt de legalização (modelo de 04/11/2026, regras 9 e 10): cinco números e,
 * quando a entrega prevista passa do prazo, um aviso vermelho com a cadeia que empurra a entrega.
 * Tudo sai de `legalizationSummary` sobre o rascunho já agendado e analisado pelo motor, então muda
 * a cada edição, antes de "Revisar e salvar". */

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const weekday = (d: string) => WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
/** "30/09/27". */
export const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;
/** Data no formato que a equipe lê no Project: "Qui 30/09/27". */
export const projectDate = (d?: string) => (d ? `${weekday(d)} ${shortDate(d)}` : 'ND');
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Folga como o Project escreve: "3 dias", "1 dia", "-2 dias" (fracionária com vírgula). */
const SLACK_NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const slackText = (n: number) => `${SLACK_NUMBER.format(n)} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`;
const businessDays = (n: number) => plural(n, 'dia útil', 'dias úteis');

/** A data do indicador: o dia da semana pequeno na frente, para o número caber em cinco colunas. */
function DateValue({ date }: { date?: string }) {
  if (!date) return <>—</>;
  return (
    <>
      <span className="mr-1 text-sm font-semibold opacity-70">{weekday(date)}</span>
      {shortDate(date)}
    </>
  );
}

/** O cartão de indicador do app (`stat-card`, o mesmo do `StatCard`), clicável quando leva a uma linha. */
function Indicator({
  label,
  value,
  hint,
  tone = 'default',
  onClick,
  title,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'danger';
  onClick?: () => void;
  title?: string;
}) {
  const danger = tone === 'danger';
  const body = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1.5 truncate text-xl font-bold tabular-nums ${danger ? 'text-danger' : 'text-slate-900'}`}>{value}</p>
      {hint && <p className={`mt-1 truncate text-xs ${danger ? 'font-semibold text-danger' : 'text-slate-500'}`}>{hint}</p>}
    </>
  );
  // No vermelho, o traço do topo do cartão também fica vermelho, como no modelo.
  const className = `stat-card min-w-0 ${danger ? 'before:from-danger before:to-danger-ring' : ''}`;
  if (!onClick)
    return (
      <div className={className} title={title}>
        {body}
      </div>
    );
  return (
    <button
      type="button"
      className={`${className} block w-full text-left transition-colors hover:border-primary-ring focus-visible:ring-2 focus-visible:ring-primary-ring focus-visible:outline-none`}
      title={title}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

export function LegalizationSummary({ api, deliveryDate, today }: { api: SheetApi; deliveryDate: string; today: string }) {
  const summary = useMemo(
    () => legalizationSummary(api.tasks, api.analysis, deliveryDate, today, api.calendar),
    [api.tasks, api.analysis, deliveryDate, today, api.calendar],
  );
  const { lateDays, deliverySlack, milestones, next, chain, workSlack } = summary;
  const late = lateDays > 0;
  const deliveryName = api.tasks.find(t => t.id === summary.deliveryTaskId)?.name;
  return (
    <div data-tour="longo-legal-resumo" className="space-y-3 border-b border-slate-200 bg-slate-50/60 p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Indicator
          label="Entrega contratual"
          value={<DateValue date={deliveryDate} />}
          hint={deliveryName ? `Prazo final do marco "${deliveryName}"` : 'Nenhum marco com este prazo final'}
        />
        <Indicator
          label="Entrega prevista"
          value={<DateValue date={summary.forecast} />}
          tone={late ? 'danger' : 'default'}
          hint={
            !summary.forecast
              ? 'Sem tarefas no cronograma'
              : late
                ? `${businessDays(lateDays)} depois do prazo`
                : lateDays < 0
                  ? `${businessDays(-lateDays)} antes do prazo`
                  : 'No prazo'
          }
        />
        <Indicator
          label="Caminho crítico"
          value={plural(summary.criticalCount, 'tarefa', 'tarefas')}
          tone={deliverySlack !== undefined && deliverySlack < 0 ? 'danger' : 'default'}
          title="Tarefas com folga total ≤ 0; a folga é a do marco da entrega."
          hint={deliverySlack === undefined ? 'Sem marco de entrega' : `Folga total ${slackText(deliverySlack)}`}
        />
        <Indicator
          label="Marcos de legalização"
          value={`${milestones.done} de ${milestones.total}`}
          hint={milestones.total ? 'Cumpridos no grupo Legalização' : 'Nenhum marco no grupo Legalização'}
        />
        {next ? (
          <Indicator
            label="Próximo marco"
            value={<DateValue date={next.date} />}
            hint={next.name}
            title={`${next.name}: selecionar no cronograma`}
            onClick={() => api.selectTask(next.id)}
          />
        ) : (
          <Indicator
            label="Próximo marco"
            value="—"
            hint={milestones.total ? 'Nenhum marco pendente daqui em diante' : 'Nenhum marco no grupo Legalização'}
          />
        )}
      </div>
      {late && (
        <Callout tone="danger" role="status">
          <b>A entrega prevista passa {businessDays(lateDays)} do prazo.</b>
          {chain.length > 0 && (
            <>
              {' '}
              O que empurra:{' '}
              {chain.map((link, index) => (
                <span key={link.id}>
                  {index > 0 && ' → '}
                  <button
                    type="button"
                    className="font-semibold underline decoration-danger-ring underline-offset-2 hover:decoration-current"
                    title="Selecionar no cronograma"
                    onClick={() => api.selectTask(link.id)}
                  >
                    {link.name}
                  </button>
                </span>
              ))}
              .
            </>
          )}
          {workSlack !== undefined && workSlack > 0 && <> A obra em si tem {slackText(workSlack)} de folga.</>}
        </Callout>
      )}
    </div>
  );
}

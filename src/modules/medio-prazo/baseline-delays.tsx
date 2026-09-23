'use client';
import { useState } from 'react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, Panel, StatCard } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { baselineVariance, type TaskVariance, type VarianceStatus } from '@/domain/schedule-analysis';
import { DEFAULT_CALENDAR } from '@/domain/plan-schedule';
import { addDays } from '@/domain/validation';
import { formatDate, formatTimestamp } from '@/shared/format';

const statusStyle: Record<VarianceStatus, string> = {
  atrasada: 'bg-rose-50 text-rose-700 border-rose-200',
  adiantada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'no prazo': 'bg-slate-100 text-slate-600 border-slate-200',
  nova: 'bg-blue-50 text-blue-700 border-blue-200',
  removida: 'bg-amber-50 text-amber-700 border-amber-200',
};
const signed = (value?: number) => (value === undefined ? '—' : value > 0 ? `+${value}` : String(value));
const deltaClass = (value?: number) => (value === undefined || value === 0 ? 'text-slate-500' : value > 0 ? 'font-semibold text-rose-700' : 'text-emerald-700');
const dayMs = 86400000;
const MAX_BARS = 15;

export function BaselineDelays({ workId }: { workId: string }) {
  const context = usePlanning();
  const [planId, setPlanId] = useState('');
  const [baselineId, setBaselineId] = useState('');
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data } = planning;

  const livePlans = data.plans.filter(p => p.workId === workId && !p.baselineOf && !p.frozenAt).sort((a, b) => b.month.localeCompare(a.month));
  const plan = livePlans.find(p => p.id === planId) ?? livePlans[0];
  const baselines = plan ? data.plans.filter(p => p.baselineOf === plan.id).sort((a, b) => (b.frozenAt ?? b.createdAt).localeCompare(a.frozenAt ?? a.createdAt)) : [];
  const baseline = baselines.find(b => b.id === baselineId) ?? baselines[0];

  const header = <div className="mb-4 flex flex-wrap items-center gap-3">
    <p className="w-full text-sm leading-6 text-slate-600">Compara o plano do mês vivo com uma linha de base congelada, tarefa a tarefa. As variações são em dias úteis do calendário do plano; positivo é atraso. O status segue o término, e item de resumo fica de fora — o atraso aparece no subitem que o causou.</p>
    {livePlans.length > 0 && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Plano
      <select className="field max-w-60 py-1.5" value={plan?.id} onChange={e => { setPlanId(e.target.value); setBaselineId(''); }} aria-label="Plano do mês comparado">
        {livePlans.map(p => <option key={p.id} value={p.id}>{p.name} · {p.month}</option>)}
      </select>
    </label>}
    {baselines.length > 0 && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Linha de base
      <select className="field max-w-72 py-1.5" value={baseline?.id} onChange={e => setBaselineId(e.target.value)} aria-label="Linha de base usada na comparação">
        {baselines.map(b => <option key={b.id} value={b.id}>{b.name}{b.frozenAt ? ` · ${formatTimestamp(b.frozenAt)}` : ''}</option>)}
      </select>
    </label>}
  </div>;

  if (!plan || !baseline) return <div className="my-6"><Panel title="Linha de base e atrasos" tourId="medio-baseline">
    {header}
    <Empty>{!plan
      ? 'Esta obra ainda não tem plano do mês aberto. Crie o plano na grade acima para depois congelar uma linha de base e medir os atrasos.'
      : <>O plano <strong className="font-semibold text-slate-700">{plan.name}</strong> ainda não tem linha de base. Use &quot;Criar linha de base&quot; na grade acima para congelar as datas atuais; a partir daí, cada reprogramação aparece aqui como variação.</>}</Empty>
  </Panel></div>;

  const calendar = plan.calendar ?? DEFAULT_CALENDAR;
  const { rows, summary, critical } = baselineVariance(
    data.planTasks.filter(t => t.planId === plan.id), data.planTasks.filter(t => t.planId === baseline.id), calendar);
  const bars = critical.slice(0, MAX_BARS);
  const dates = bars.flatMap(r => [r.live!.plannedStart, r.live!.plannedEnd, r.baseline!.plannedStart, r.baseline!.plannedEnd]).sort();
  const axisStart = dates[0], axisEnd = dates.at(-1);
  const span = axisStart && axisEnd ? (Date.parse(axisEnd) - Date.parse(axisStart)) / dayMs + 1 : 1;
  const pos = (date: string) => ((Date.parse(date) - Date.parse(axisStart!)) / dayMs / span) * 100;
  const width = (start: string, end: string) => Math.max(0.8, ((Date.parse(end) - Date.parse(start)) / dayMs + 1) / span * 100);
  const ticks = axisStart ? Array.from({ length: 5 }, (_, i) => addDays(axisStart, Math.round(((span - 1) * i) / 4))) : [];
  const finish = summary.planFinishVariance;

  return <div className="my-6"><Panel title="Linha de base e atrasos" tourId="medio-baseline">
    {header}
    <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Atividades atrasadas" value={summary.lateCount} tone={summary.lateCount ? 'danger' : 'default'} />
      <StatCard label="Maior atraso (dias úteis)" value={summary.maxDelay ? <span>{summary.maxDelay}<span className="ml-2 text-sm font-medium text-slate-500">média {summary.averageDelay.toFixed(1).replace('.', ',')}</span></span> : 0} tone={summary.maxDelay ? 'danger' : 'default'} />
      <StatCard label="Variação do término do plano" value={finish === undefined ? '—' : `${signed(finish)} ${Math.abs(finish) === 1 ? 'dia útil' : 'dias úteis'}`} tone={finish && finish > 0 ? 'warning' : 'default'} />
      <StatCard label="Novas / removidas" value={`${summary.newCount} / ${summary.removedCount}`} />
    </div>

    {bars.length === 0
      ? <Callout tone="success">Nenhuma tarefa termina depois do que a linha de base &quot;{baseline.name}&quot; previa.</Callout>
      : <section aria-labelledby="baseline-bars-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="baseline-bars-title" className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tarefas atrasadas, da maior para a menor variação</h3>
          <span className="flex items-center gap-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-5 rounded-sm bg-rose-500" aria-hidden />atual</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1 w-5 rounded-sm bg-slate-400" aria-hidden />linha de base</span>
          </span>
        </div>
        <div className="-mx-1 mt-3 overflow-x-auto custom-scrollbar" role="region" aria-label="Comparação de barras das tarefas atrasadas" tabIndex={0}>
          <div className="min-w-[640px] px-1">
            <div className="ml-[34%] flex justify-between border-b border-slate-200 pb-1 text-[10px] tabular-nums text-slate-400">{ticks.map((t, i) => <span key={`${t}-${i}`}>{formatDate(t).slice(0, 5)}</span>)}</div>
            <ul>{bars.map(row => <li key={row.id} className="flex items-center border-b border-slate-50 py-1.5">
              <span className="w-[34%] truncate pr-3 text-xs text-slate-700" title={row.name}>{row.name} <strong className="text-rose-700">+{row.finishVariance}</strong></span>
              <span className="relative block h-5 flex-1" aria-label={`${row.name}: base ${formatDate(row.baseline!.plannedStart)} a ${formatDate(row.baseline!.plannedEnd)}, atual ${formatDate(row.live!.plannedStart)} a ${formatDate(row.live!.plannedEnd)}`} role="img">
                <span className="absolute top-0.5 h-2.5 rounded-sm bg-rose-500" style={{ left: `${pos(row.live!.plannedStart)}%`, width: `${width(row.live!.plannedStart, row.live!.plannedEnd)}%` }} />
                <span className="absolute top-3.5 h-1 rounded-sm bg-slate-400" style={{ left: `${pos(row.baseline!.plannedStart)}%`, width: `${width(row.baseline!.plannedStart, row.baseline!.plannedEnd)}%` }} />
              </span>
            </li>)}</ul>
          </div>
        </div>
        {critical.length > bars.length && <p className="mt-1 text-xs text-slate-500">Mostrando as {bars.length} maiores de {critical.length} atrasadas; a tabela abaixo tem todas.</p>}
      </section>}

    <div className="-mx-1 mt-5 max-h-[60vh] overflow-auto custom-scrollbar" role="region" aria-label="Variação por tarefa" tabIndex={0}>
      <table className="data-table min-w-[900px]">
        <caption className="sr-only">Datas da linha de base {baseline.name} contra o plano {plan.name}, com variação em dias úteis. Positivo é atraso.</caption>
        <thead><tr>{['Tarefa', 'Início base', 'Início atual', 'Δ início', 'Término base', 'Término atual', 'Δ término', 'Status'].map(l => <th scope="col" key={l} className="sticky top-0 z-10">{l}</th>)}</tr></thead>
        <tbody>{rows.length === 0
          ? <tr><td colSpan={8} className="text-slate-500">Nenhuma tarefa no plano nem na linha de base.</td></tr>
          : rows.map((row: TaskVariance) => <tr key={`${row.status}-${row.id}`}>
            <th scope="row">{row.name}</th>
            <td className="whitespace-nowrap tabular-nums">{row.baseline ? formatDate(row.baseline.plannedStart) : '—'}</td>
            <td className="whitespace-nowrap tabular-nums">{row.live ? formatDate(row.live.plannedStart) : '—'}</td>
            <td className={`tabular-nums ${deltaClass(row.startVariance)}`}>{signed(row.startVariance)}</td>
            <td className="whitespace-nowrap tabular-nums">{row.baseline ? formatDate(row.baseline.plannedEnd) : '—'}</td>
            <td className="whitespace-nowrap tabular-nums">{row.live ? formatDate(row.live.plannedEnd) : '—'}</td>
            <td className={`tabular-nums ${deltaClass(row.finishVariance)}`}>{signed(row.finishVariance)}</td>
            <td><span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle[row.status]}`}>{row.status}</span></td>
          </tr>)}</tbody>
      </table>
    </div>
    <p className="mt-2 text-xs text-slate-500">Pareamento pelo vínculo que a linha de base guarda com a tarefa de origem; em linhas de base antigas, pelo nome normalizado. &quot;Nova&quot; não existia na base; &quot;removida&quot; saiu do plano vivo.</p>
  </Panel></div>;
}

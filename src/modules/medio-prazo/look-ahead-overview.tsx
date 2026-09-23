'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, Panel, StatCard } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import type { Activity } from '@/domain/entities';
import { rollUpPlan, teamLoad, weightedProgress } from '@/domain/rules';
import { addDays, startOfWeek } from '@/domain/validation';
import { ScheduleSheet } from '@/modules/medio-prazo/schedule-sheet';
import { formatDate, wagonLabel, workPath } from '@/shared/format';

/** O vínculo formal entre os níveis é opcional e quase nunca preenchido, então a conferência
 * pareia pelo nome — sem acento, sem caixa e sem espaço repetido. É a mesma estratégia que o
 * plano do mês já usa contra a linha de base; aqui ela atravessa níveis, onde o nome é digitado
 * de novo a cada planilha e a diferença costuma ser só um acento ou um espaço sobrando. */
const nameKey = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const monthEndOf = (month: string) => { const [year, m] = month.split('-').map(Number); return new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10); };
const monthLabel = (month: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));

export function LookAheadOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [planId, setPlanId] = useState('');
  const [section, setSection] = useState<'window' | 'teams' | 'coverage' | 'history'>('window');
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const { data, today } = planning;
  const { work, wagons } = selected;
  const windowEnd = addDays(today, 90);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);

  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? 'Não informado';
  const place = (id: string) => data.locations.find(l => l.id === id)?.name ?? 'Local não informado';
  const wagonOf = (wagonId: string) => wagons.find(w => w.id === wagonId);

  const workActivities = data.activities.filter(a => wagons.some(w => w.id === a.wagonId));
  const lookAhead = workActivities.filter(a => a.plannedStart <= windowEnd && a.plannedEnd >= today).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.name.localeCompare(b.name));
  const teams = data.teams.filter(t => t.workId === workId).sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
  const loads = teams.map(team => ({ team, ...teamLoad(team.id, today, windowEnd, data) }));
  const withoutTeam = lookAhead.filter(a => !a.teamId).length;
  const overloaded = loads.filter(l => l.overloaded).length;
  const rows = onlyOpen ? lookAhead.filter(a => !a.teamId) : lookAhead;
  // A atividade guarda só o percentual corrente; a série datada dos lançamentos fica em progressEntries.
  const entries = data.progressEntries.filter(e => workActivities.some(a => a.id === e.activityId)).sort((a, b) => b.recordedDate.localeCompare(a.recordedDate) || b.createdAt.localeCompare(a.createdAt));
  const shown = entries.slice(0, 20);

  // Frente da janela é o conjunto de atividades com o mesmo nome: o cronograma repete o serviço
  // vagão a vagão, e o plano do mês escreve a frente uma vez só.
  const fronts = new Map<string, { name: string; rows: Activity[] }>();
  for (const activity of lookAhead) {
    const front = fronts.get(nameKey(activity.name));
    if (front) front.rows.push(activity); else fronts.set(nameKey(activity.name), { name: activity.name, rows: [activity] });
  }
  // A linha de base congelada é um retrato, não o plano em que se escreve: a conferência é contra
  // o plano vivo, o mesmo que a grade abre por padrão.
  const livePlans = data.plans.filter(p => p.workId === workId && !p.baselineOf && !p.frozenAt).sort((a, b) => b.month.localeCompare(a.month));
  const plan = livePlans[0] ? livePlans.find(p => p.id === planId) ?? livePlans[0] : undefined;
  const planTasks = plan ? data.planTasks.filter(t => t.planId === plan.id).sort((a, b) => a.order - b.order) : [];
  const rollUp = rollUpPlan(planTasks);
  const planKeys = new Set(planTasks.map(t => nameKey(t.name)));
  const monthStart = plan ? `${plan.month}-01` : '';
  const monthEnd = plan ? monthEndOf(plan.month) : '';
  const inMonth = [...fronts].filter(([, front]) => front.rows.some(a => a.plannedStart <= monthEnd && a.plannedEnd >= monthStart));
  const missingFronts = inMonth.filter(([key]) => !planKeys.has(key)).map(([, front]) => front);
  const outsideMonth = fronts.size - inMonth.length;
  const commitments = data.commitments.filter(c => c.workId === workId);
  // Item de resumo não entra: ele é o envelope dos subitens, e quem vai para a planilha da semana
  // é o subitem. Cobrar o envelope apontaria a mesma frente duas vezes.
  const missingTasks = planTasks.filter(task => !rollUp.get(task.id)?.summary
    && !commitments.some(c => nameKey(c.name) === nameKey(task.name) && c.weekStart <= task.plannedEnd && c.weekEnd >= task.plannedStart));

  const wagonsOf = (front: { rows: Activity[] }) => {
    const numbers = [...new Set(front.rows.map(a => wagonOf(a.wagonId)?.number).filter((n): n is number => n !== undefined))].sort((a, b) => a - b);
    if (numbers.length === 0) return 'Vagão não informado';
    if (numbers.length === 1) return wagonLabel(numbers[0]);
    const head = numbers.slice(0, 6).map(n => String(n).padStart(2, '0')).join(', ');
    return `Vagões ${head}${numbers.length > 6 ? ` +${numbers.length - 6}` : ''}`;
  };
  const teamLabel = (teamId?: string) => { const team = teams.find(t => t.id === teamId); return team ? `${team.company} · ${team.name}` : undefined; };

  return <>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="eyebrow">Aba 3 · {work.code} · {work.name}</p><h1 className="page-title">Cronograma de médio prazo</h1><p className="mt-1 text-sm text-slate-500">Gantt do mês com alocação de recursos, análise de superalocação e linha de base com cálculo de atrasos.</p></div>
      <Link className="button-ghost" href={workPath(workId, 'configuracoes')}><Users size={16} aria-hidden />Configurar recursos</Link>
    </div>
    <ScheduleSheet workId={workId} />
    <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold text-slate-800">Apoio ao planejamento</h2><p className="mt-1 text-xs text-slate-500">Janela móvel de 90 dias: {formatDate(today)} a {formatDate(windowEnd)}.</p></div></div>
    <div className="flex flex-wrap gap-1 border-b border-slate-200" aria-label="Informações de apoio ao planejamento">
      {([{ id: 'window', label: 'Próximos 90 dias' }, { id: 'teams', label: 'Carga das equipes' }, { id: 'coverage', label: 'Cobertura entre níveis' }, { id: 'history', label: 'Histórico de avanço' }] as const).map(tab => <button key={tab.id} type="button" onClick={() => setSection(tab.id)} aria-pressed={section === tab.id} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${section === tab.id ? 'border-blue-600 text-blue-800' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}>{tab.label}</button>)}
    </div>

    {section === 'window' && <><div className="my-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard label="Atividades na janela" value={lookAhead.length} />
      <StatCard label="Atividades sem equipe" value={withoutTeam} tone={withoutTeam > 0 ? 'warning' : 'default'} />
      <StatCard label="Equipes em sobrecarga" value={overloaded} tone={overloaded > 0 ? 'danger' : 'default'} />
      <StatCard label="Progresso ponderado da janela" value={`${Math.round(weightedProgress(lookAhead))}%`} />
    </div>

    <section className="panel my-6 overflow-hidden" aria-labelledby="look-ahead-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 id="look-ahead-title" className="text-sm font-bold text-slate-800">O que vem na janela</h2>
          <p className="mt-0.5 text-xs text-slate-500">As atividades do cronograma que tocam os próximos três meses, em ordem de início — a lista que a reunião de médio prazo percorre.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="badge-muted">{rows.length} de {lookAhead.length} {lookAhead.length === 1 ? 'atividade' : 'atividades'}</span>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" className="accent-blue-700" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)}
              aria-label={`Mostrar somente as ${withoutTeam} atividades da janela sem equipe definida`} />
            Somente sem equipe ({withoutTeam})
          </label>
        </div>
      </div>
      {lookAhead.length === 0
        ? <div className="p-5"><Empty>Nenhuma atividade do cronograma cai nos próximos três meses. A janela lê as atividades dos vagões desta obra — sem elas não há o que antecipar.</Empty></div>
        : rows.length === 0
          ? <div className="p-5"><Empty>Toda atividade da janela já tem equipe definida. Desmarque o filtro para ver a lista inteira.</Empty></div>
          : <div className="max-h-[60vh] overflow-auto custom-scrollbar" role="region" aria-label="Atividades da janela de três meses" tabIndex={0}>
              <table className="data-table min-w-[900px]">
                <thead><tr>{['Atividade', 'Vagão', 'Local', 'Período previsto', 'Equipe', 'Percentual'].map(l => <th scope="col" key={l} className="sticky top-0 z-10">{l}</th>)}</tr></thead>
                <tbody>{rows.map(activity => {
                  const wagon = wagonOf(activity.wagonId);
                  const team = teamLabel(activity.teamId);
                  return <tr key={activity.id}>
                    <th scope="row">{activity.name}</th>
                    <td className="whitespace-nowrap">{wagon ? wagonLabel(wagon.number) : 'Não informado'}</td>
                    <td>{place(activity.locationId)}</td>
                    <td className="whitespace-nowrap tabular-nums">{formatDate(activity.plannedStart)} a {formatDate(activity.plannedEnd)}</td>
                    <td className={team ? '' : 'font-semibold text-amber-600'}>{team ?? 'Sem equipe'}</td>
                    <td className="tabular-nums">{Math.round(activity.progress)}%</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>}
    </section></>}

    {section === 'teams' && <div className="my-4"><Panel title="Carga das equipes na janela" tourId="medio-teams">
      <p className="text-sm leading-6 text-slate-600">A capacidade semanal é o número de atividades simultâneas que a equipe consegue executar. A carga soma os dois lugares onde a equipe é comprometida dentro da janela de três meses: as atividades do cronograma e as linhas do plano do mês — linha de base congelada não entra na conta. O cadastro em Configurações da obra abastece os recursos do plano do mês e da planilha de curto prazo.</p>
      <div className="my-4"><Link className="text-link inline-flex min-h-10 items-center gap-2 text-sm" href={workPath(workId, 'configuracoes')}><Users size={15} aria-hidden />Gerenciar empreiteiros e equipes da obra</Link></div>
      {teams.length === 0
        ? <Empty>Nenhuma equipe cadastrada nesta obra. Sem equipes não é possível identificar quem executa cada atividade nem apurar sobrecarga.</Empty>
        : <div className="-mx-1 overflow-x-auto custom-scrollbar" role="region" aria-label="Equipes da obra" tabIndex={0}>
            <table className="data-table min-w-[980px]">
              <thead><tr>{['Equipe', 'Empresa', 'Capacidade semanal', 'Do cronograma', 'Do plano do mês', 'Total na janela', 'Situação'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{loads.map(load => <tr key={load.team.id}>
                <th scope="row">{load.team.name}</th>
                <td className="whitespace-nowrap">{load.team.company}</td>
                <td className="tabular-nums">{load.capacity} {load.capacity === 1 ? 'atividade' : 'atividades'}</td>
                <td className="tabular-nums">{load.activities}</td>
                <td className="tabular-nums">{load.tasks}</td>
                <td className="font-semibold tabular-nums text-slate-800">{load.assigned}</td>
                <td className={load.overloaded ? 'font-semibold text-amber-600' : ''}>{load.overloaded ? `Sobrecarga · ${load.assigned - load.capacity} além da capacidade` : 'Dentro da capacidade'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
    </Panel></div>}

    {section === 'coverage' && <div className="my-4"><Panel title="Cobertura entre os níveis">
      <p className="text-sm leading-6 text-slate-600">Confere se o que a janela diz que vem tem linha no plano do mês, e se o que está no plano do mês aparece na planilha de alguma semana que cubra o período dele. O pareamento é pelo nome normalizado — sem acento, sem caixa e sem espaço repetido —, não pelo vínculo formal: é conferência, não vínculo, e ela erra quando o nome muda de um nível para o outro.</p>

      {!plan
        ? <div className="my-4"><Empty>Esta obra ainda não tem plano do mês aberto, então não há o que conferir. A janela acima continua valendo, e a planilha da semana continua podendo ser escrita direto.</Empty></div>
        : <>
            <div className="my-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">Plano do mês conferido
                <select className="field max-w-60 py-1.5" value={plan.id} onChange={e => setPlanId(e.target.value)} aria-label="Plano do mês usado na conferência">
                  {livePlans.map(p => <option key={p.id} value={p.id}>{p.name} · {p.month}</option>)}
                </select>
              </label>
              <span className="text-xs text-slate-400">A grade acima tem a seleção dela; aqui você escolhe contra qual plano a janela é conferida.</span>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Da janela para o mês</h3>
              <span className="badge-muted">{missingFronts.length} {missingFronts.length === 1 ? 'frente sem linha' : 'frentes sem linha'}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">Frentes da janela que caem em {monthLabel(plan.month)} e não têm linha no plano <strong className="font-semibold text-slate-800">{plan.name}</strong>.</p>
            {missingFronts.length === 0
              ? <p className="mt-2 text-sm leading-6 text-slate-500">Toda frente da janela que cai neste mês tem linha correspondente no plano.</p>
              : <div className="-mx-1 mt-3 overflow-x-auto custom-scrollbar" role="region" aria-label="Frentes da janela sem linha no plano do mês" tabIndex={0}>
                  <table className="data-table min-w-[720px]">
                    <thead><tr>{['Frente', 'Vagões', 'Atividades', 'Período na janela'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
                    <tbody>{missingFronts.map(front => <tr key={nameKey(front.name)}>
                      <th scope="row">{front.name}</th>
                      <td>{wagonsOf(front)}</td>
                      <td className="tabular-nums">{front.rows.length}</td>
                      <td className="whitespace-nowrap tabular-nums">{formatDate(front.rows.reduce((min, a) => (a.plannedStart < min ? a.plannedStart : min), front.rows[0].plannedStart))} a {formatDate(front.rows.reduce((max, a) => (a.plannedEnd > max ? a.plannedEnd : max), front.rows[0].plannedEnd))}</td>
                    </tr>)}</tbody>
                  </table>
                </div>}
            {outsideMonth > 0 && <p className="mt-2 text-xs text-slate-500">Outras {outsideMonth} {outsideMonth === 1 ? 'frente da janela fica' : 'frentes da janela ficam'} fora de {monthLabel(plan.month)} e não {outsideMonth === 1 ? 'é cobrada' : 'são cobradas'} aqui — {outsideMonth === 1 ? 'ela entra' : 'elas entram'} na conferência do plano do mês correspondente.</p>}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Do mês para a semana</h3>
              <span className="badge-muted">{missingTasks.length} {missingTasks.length === 1 ? 'linha sem semana' : 'linhas sem semana'}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">Linhas do plano que não aparecem na planilha de nenhuma semana sobreposta ao período delas. Item de resumo não entra: ele é o envelope dos subitens, e quem vai para a semana é o subitem.</p>
            {planTasks.length === 0
              ? <p className="mt-2 text-sm leading-6 text-slate-500">O plano {plan.name} ainda não tem linhas escritas.</p>
              : missingTasks.length === 0
                ? <p className="mt-2 text-sm leading-6 text-slate-500">Toda linha do plano aparece em alguma semana que cobre o período dela.</p>
                : <div className="-mx-1 mt-3 overflow-x-auto custom-scrollbar" role="region" aria-label="Linhas do plano do mês sem semana correspondente" tabIndex={0}>
                    <table className="data-table min-w-[760px]">
                      <thead><tr>{['Item', 'Linha do plano', 'Período', 'Equipe'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
                      <tbody>{missingTasks.map(task => <tr key={task.id}>
                        <td className="tabular-nums">{rollUp.get(task.id)?.number ?? '—'}</td>
                        <th scope="row">{task.name}</th>
                        <td className="whitespace-nowrap tabular-nums">{formatDate(task.plannedStart)} a {formatDate(task.plannedEnd)}
                          {task.plannedStart <= weekEnd && task.plannedEnd >= weekStart && <span className="mt-0.5 block text-xs font-semibold text-amber-600">Atravessa a semana atual</span>}</td>
                        <td>{teamLabel(task.teamId) ?? 'Sem recurso'}</td>
                      </tr>)}</tbody>
                    </table>
                  </div>}
          </>}

      <div className="mt-5"><Callout tone="info">Isto é sugestão, nunca exigência: nada aqui bloqueia o plano, cria linha sozinho nem pede que você vincule uma coisa à outra. A planilha da semana se sustenta sozinha por decisão de quem planeja — ela mistura frentes de obra com tarefas que não existem no cronograma, e uma linha fora destas listas não está errada.</Callout></div>
    </Panel></div>}

    {section === 'history' && <><section className="panel my-4 overflow-hidden" aria-labelledby="entries-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <h2 id="entries-title" className="text-sm font-bold text-slate-800">Histórico de lançamentos</h2>
        <span className="badge-muted">{entries.length} {entries.length === 1 ? 'lançamento' : 'lançamentos'}</span>
      </div>
      {shown.length === 0
        ? <div className="p-5"><Empty>Nenhum percentual executado lançado nesta obra.</Empty></div>
        : <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Histórico de lançamentos" tabIndex={0}>
            <table className="data-table min-w-[720px]">
              <thead><tr>{['Atividade', 'Data do lançamento', 'Percentual', 'Lançado por'].map(l => <th scope="col" key={l}>{l}</th>)}</tr></thead>
              <tbody>{shown.map(entry => {
                const activity = workActivities.find(a => a.id === entry.activityId);
                const wagon = activity && wagonOf(activity.wagonId);
                return <tr key={entry.id}>
                  <th scope="row">{activity?.name ?? 'Atividade indisponível'}{wagon && <span className="mt-0.5 block text-xs font-normal text-slate-400">{wagonLabel(wagon.number)}</span>}</th>
                  <td className="whitespace-nowrap tabular-nums">{formatDate(entry.recordedDate)}</td>
                  <td className="tabular-nums">{Math.round(entry.progress)}%</td>
                  <td>{person(entry.recordedBy)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
      {entries.length > shown.length && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Mostrando os {shown.length} lançamentos mais recentes de {entries.length}. O histórico completo de cada atividade fica no detalhe do vagão.</p>}
    </section>

    <div className="my-4"><Callout tone="info">Cada lançamento fica registrado com a sua data: o percentual da atividade é sempre o valor corrente, e é a série datada que permite comparar uma semana com a anterior.</Callout></div></>}
  </>;
}

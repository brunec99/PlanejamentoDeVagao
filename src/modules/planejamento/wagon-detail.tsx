'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import type { Activity } from '@/domain/entities';
import { ancestors } from '@/application/use-cases/commands';
import { selectWagonDetail } from '@/application/use-cases/get-planning';
import { isTerminal } from '@/domain/rules';
import { activityLabels, formatDate, formatTimestamp, planningPath, releaseLabels, wagonLabel, wagonPath } from '@/shared/format';
import { ActivityEditor, CriterionAction, ReleaseForm, ResolveAction, WagonActions } from './wagon-actions';
import { useHistory } from './history';
import { usePlanning } from './planning-provider';
import { Callout, Empty, LoadState, Missing, Panel, Progress, Status } from './ui';

const ORIGIN_LABELS: Record<Activity['origin'], string> = {
  manual: 'Manual',
  mock: 'Demonstração',
  prevision: 'Prevision',
  long_term: 'Plano de longo prazo',
};

/** Nome de cada ação do histórico. Ação desconhecida vira "Planejamento atualizado", para um
 * comando novo no servidor não quebrar a lista. */
const HISTORY_LABELS: Record<string, string> = {
  exceptional_release: 'Liberação excepcional registrada',
  release: 'Liberação registrada',
  create_activity: 'Atividade adicionada',
  update_activity: 'Atividade atualizada',
  create_criterion: 'Critério adicionado',
  set_criterion: 'Critério atualizado',
  create_pending: 'Pendência registrada',
  resolve_pending: 'Pendência resolvida',
  create_restriction: 'Restrição registrada',
  resolve_restriction: 'Restrição resolvida',
  edit_wagon: 'Período atualizado',
  create_wagon: 'Vagão criado',
  terminality_reopened: 'Terminalidade reaberta',
  import_activities: 'Atividades importadas do Prevision',
  sync_long_term_plan: 'Vagões gerados pelo plano de longo prazo',
};

export function WagonDetail({ workId, wagonId }: { workId: string; wagonId: string }) {
  const context = usePlanning();
  const planning = context.state === 'ready' ? context.planning : undefined;

  // Os hooks vêm antes de qualquer retorno condicional (regra dos hooks). Enquanto o planejamento
  // não chegou, as listas ficam vazias e o histórico não é consultado. As listas de ids são
  // memorizadas para não recriar o array a cada render, o que refaria a busca do histórico.
  const detail = useMemo(() => (planning ? selectWagonDetail(planning, workId, wagonId) : undefined), [planning, workId, wagonId]);
  const ancestorWagons = useMemo(() => (planning && detail ? ancestors(planning.data, detail.wagon) : []), [planning, detail]);
  const historyIds = useMemo(() => (detail ? [detail.wagon.id, ...detail.activities.map(a => a.id)] : []), [detail]);
  const ancestorIds = useMemo(() => ancestorWagons.map(w => w.id), [ancestorWagons]);
  // O histórico saiu do snapshot: `data.history` chega vazio e tudo é lido de `/api/history`.
  const history = useHistory(workId, historyIds, { limit: 100 });
  const reopened = useHistory(workId, ancestorIds, { action: 'terminality_reopened', limit: 50 });

  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { data, today } = context.planning;
  const actor = data.users.find(u => u.id === context.actorId);
  if (!detail || !actor?.workIds.includes(workId)) return <Missing label="Vagão não encontrado nesta obra" href={planningPath(workId)} />;

  const { wagon, work, sequence, predecessor, successor, activities, criteria, pendingItems, restrictions, debts, releases } = detail;
  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? 'Responsável não informado';
  const canAct = actor.role !== 'viewer';
  const past = wagon.plannedEnd < today;
  const mandatory = activities.filter(a => a.mandatory);
  const completedMandatory = mandatory.filter(a => a.progress === 100 && a.status === 'completed').length;
  const requiredCriteria = criteria.filter(c => c.mandatory);
  const fulfilledRequired = requiredCriteria.filter(c => c.fulfilled).length;
  // Um antecessor reaberto e ainda não terminal de novo invalida a base da liberação deste vagão.
  const reopenedAncestors = ancestorWagons.filter(w => !isTerminal(w.id, data) && reopened.events.some(e => e.entityId === w.id));
  const events = [...history.events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const columns = ['Atividade / local', 'Responsável', 'Previsão', 'Progresso', 'Status', 'Peso / origem', ...(canAct ? ['Ações'] : [])];
  const neighbours = [
    { label: '← Vagão anterior', value: predecessor, empty: 'Primeiro vagão da sequência' },
    { label: 'Vagão seguinte →', value: successor, empty: 'Último vagão planejado' },
  ];

  return (
    <>
      <nav aria-label="Navegação estrutural" className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link className="text-link" href="/obras">
          Obras
        </Link>
        <span aria-hidden="true">/</span>
        <Link className="text-link" href={planningPath(workId)}>
          {work.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span>{wagonLabel(wagon.number)}</span>
      </nav>

      <header className="mb-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="eyebrow">{sequence.name}</p>
            <h1 className="page-title">{wagonLabel(wagon.number)}</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {formatDate(wagon.plannedStart)} <span aria-hidden="true">→</span>
              <span className="sr-only">até</span> {formatDate(wagon.plannedEnd)}
              {past && <span className="ml-2 badge-muted">passado</span>}
            </p>
          </div>
          <div data-tour="vagao-status" className="flex flex-wrap items-center gap-3">
            <Status status={wagon.status} />
            {wagon.overdue && <span className="text-sm font-semibold text-danger">Takt vencido</span>}
          </div>
        </div>
        <WagonActions workId={workId} wagonId={wagonId} />
      </header>

      {reopenedAncestors.length > 0 && (
        <div className="mb-6">
          <Callout tone="warning" role="alert">
            Terminalidade reaberta em período anterior: {reopenedAncestors.map(w => wagonLabel(w.number)).join(', ')}. Reavalie a liberação
            e registre as novas pendências.
          </Callout>
        </div>
      )}
      {reopened.status === 'error' && ancestorIds.length > 0 && (
        <p className="mb-6 text-xs text-slate-500">
          Não foi possível conferir se algum período anterior teve a terminalidade reaberta.{' '}
          <button type="button" className="text-link" onClick={reopened.reload}>
            Tentar de novo
          </button>
        </p>
      )}

      <dl className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="stat-card">
          <dt className="text-xs font-medium text-slate-500">Duração do takt</dt>
          <dd className="mt-1.5 text-lg font-bold text-slate-900">
            {wagon.taktDays} dias {sequence.calendar === 'calendar_days' ? 'corridos' : 'úteis'}
          </dd>
        </div>
        <div className="stat-card">
          <dt className="text-xs font-medium text-slate-500">Progresso ponderado</dt>
          <dd className="mt-2.5">
            <Progress value={wagon.progress} label="Progresso do vagão" />
          </dd>
        </div>
        <div className="stat-card">
          <dt className="text-xs font-medium text-slate-500">Responsáveis pelo período</dt>
          <dd className="mt-1.5 text-sm font-semibold text-slate-900">{wagon.responsibleIds.map(person).join(', ') || 'Não informado'}</dd>
        </div>
      </dl>

      <nav aria-label="Sequência de vagões" className="mb-6 grid gap-3 sm:grid-cols-2">
        {neighbours.map(item => (
          <div className="panel p-4" key={item.label}>
            <p className="mb-2 text-sm text-slate-600">{item.label}</p>
            {item.value ? (
              <Link className="text-link" href={wagonPath(workId, item.value.id)}>
                {wagonLabel(item.value.number)} · {formatDate(item.value.plannedStart)} a {formatDate(item.value.plannedEnd)}
              </Link>
            ) : (
              <p className="text-sm text-slate-500">{item.empty}</p>
            )}
          </div>
        ))}
      </nav>

      <section data-tour="vagao-activities" className="panel mb-6 overflow-hidden" aria-labelledby="activities-title">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 id="activities-title" className="text-sm font-bold text-slate-800">
            Atividades do período
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Os locais pertencem às atividades. Um mesmo vagão pode reunir diferentes pavimentos e zonas.
          </p>
        </div>
        {activities.length === 0 ? (
          <div className="p-5">
            <Empty>Nenhuma atividade neste período. O vagão ainda não pode ser terminal.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Atividades do período" tabIndex={0}>
            <table className="data-table min-w-[1050px]">
              <thead>
                <tr>
                  {columns.map(label => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activities.map(activity => (
                  <tr key={activity.id}>
                    <th scope="row" className="min-w-64">
                      <p>{activity.name}</p>
                      <p className="mt-0.5 text-xs font-normal text-slate-500">
                        {data.locations.find(l => l.id === activity.locationId)?.name ?? 'Local não informado'}
                      </p>
                      <p className="mt-0.5 text-xs font-normal text-slate-400">{activity.mandatory ? 'Obrigatória' : 'Opcional'}</p>
                    </th>
                    <td>{person(activity.responsibleId)}</td>
                    <td className="whitespace-nowrap">
                      {formatDate(activity.plannedStart)}
                      <br />a {formatDate(activity.plannedEnd)}
                    </td>
                    <td>
                      <Progress value={activity.progress} label={`Progresso de ${activity.name}`} />
                    </td>
                    <td>{activityLabels[activity.status]}</td>
                    <td>
                      {activity.weight}
                      <br />
                      <span className="text-slate-500">{ORIGIN_LABELS[activity.origin]}</span>
                    </td>
                    {/* A chave em `updatedAt` remonta o editor depois de salvar, para os valores padrão acompanharem. */}
                    {canAct && (
                      <td className="whitespace-nowrap">
                        <ActivityEditor key={activity.updatedAt} workId={workId} activity={activity} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Terminalidade" tourId="vagao-criteria">
          <p className="text-sm leading-6 text-slate-600">
            {completedMandatory} de {mandatory.length} atividades obrigatórias concluídas · {fulfilledRequired} de {requiredCriteria.length}{' '}
            critérios obrigatórios atendidos.
          </p>
          {criteria.length === 0 ? (
            <div className="mt-4">
              <Empty>Nenhum critério adicional cadastrado.</Empty>
            </div>
          ) : (
            <ul className="mt-4 space-y-3">
              {criteria.map(c => (
                <li key={c.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        <span className={c.fulfilled ? 'text-success' : 'text-slate-500'}>{c.fulfilled ? 'Atendido' : 'Aguardando'}</span> ·{' '}
                        {c.description}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {activities.find(a => a.id === c.activityId)?.name} · {c.mandatory ? 'Obrigatório' : 'Opcional'}
                      </p>
                      {c.fulfilled && c.confirmedBy && c.confirmedAt && (
                        <p className="mt-1 text-sm text-slate-500">
                          Confirmado por {person(c.confirmedBy)} em {formatTimestamp(c.confirmedAt)}
                        </p>
                      )}
                    </div>
                    <CriterionAction id={c.id} fulfilled={c.fulfilled} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className={`mt-4 text-sm font-semibold ${wagon.status === 'terminal' ? 'text-success' : 'text-slate-500'}`}>
            {wagon.status === 'terminal'
              ? 'Este vagão atende às condições de terminalidade.'
              : 'Este vagão ainda não atende a todas as condições de terminalidade.'}
          </p>
        </Panel>

        <Panel title="Liberação deste vagão" tourId="vagao-release">
          {releases.length === 0 ? (
            <Empty>Aguardando liberação para iniciar a execução.</Empty>
          ) : (
            releases.map(release => (
              <div key={release.id} className="space-y-2">
                <p className="font-semibold">Liberação {releaseLabels[release.type].toLowerCase()}</p>
                <p className="text-sm text-slate-600">
                  Autorizada por {person(release.authorizedBy)} em {formatTimestamp(release.releasedAt)}.
                </p>
                {release.justification && <p className="text-sm leading-6">{release.justification}</p>}
                {release.regularizationResponsibleId && (
                  <p className="text-sm">
                    Regularização: {person(release.regularizationResponsibleId)}
                    {release.dueDate && ` · até ${formatDate(release.dueDate)}`}
                  </p>
                )}
                {release.acceptedPendingIds.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {release.acceptedPendingIds.map(id => (
                      <li key={id}>Pendência aceita: {data.pendingItems.find(p => p.id === id)?.description ?? 'Registro indisponível'}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
          <ReleaseForm workId={workId} wagonId={wagonId} />
          <p className="mt-4 text-sm text-slate-500">A liberação não altera a terminalidade do vagão anterior.</p>
        </Panel>

        <Panel title="Pendências deste vagão" tourId="vagao-pending">
          {pendingItems.length === 0 ? (
            <Empty>Nenhuma pendência registrada.</Empty>
          ) : (
            <ul className="space-y-4">
              {pendingItems.map(p => (
                <li key={p.id}>
                  <p className="font-medium">{p.description}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {person(p.responsibleId)} · prazo {formatDate(p.dueDate)}
                  </p>
                  <p className="mt-1 text-sm">
                    {p.status === 'resolved' ? 'Resolvida' : 'Aberta'}
                    {p.status === 'open' && p.dueDate < today && <span className="font-semibold text-danger"> · Vencida</span>}
                    {p.blocksTerminality && ' · Bloqueia terminalidade'}
                  </p>
                  {p.status === 'open' && (
                    <div className="mt-2">
                      <ResolveAction id={p.id} kind="pending" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Restrições" tourId="vagao-restrictions">
          {restrictions.length === 0 ? (
            <Empty>Nenhuma restrição registrada.</Empty>
          ) : (
            <ul className="space-y-4">
              {restrictions.map(r => (
                <li key={r.id}>
                  <p className="font-medium">{r.description}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {person(r.responsibleId)} · prazo {formatDate(r.dueDate)}
                  </p>
                  <p className="mt-1 text-sm">
                    {r.status === 'open' ? 'Aberta' : 'Resolvida'}
                    {r.blocksExecution && ' · Bloqueia execução'}
                    {r.blocksTerminality && ' · Bloqueia terminalidade'}
                  </p>
                  {r.status === 'open' && (
                    <div className="mt-2">
                      <ResolveAction id={r.id} kind="restriction" />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Dívidas de terminalidade">
          {debts.length === 0 ? (
            <Empty>Nenhuma dívida deste vagão ou de seus antecessores.</Empty>
          ) : (
            <ul className="space-y-4">
              {debts.map(debt => {
                const pending = data.pendingItems.find(p => p.id === debt.pendingItemId)!;
                const origin = data.wagons.find(w => w.id === pending.wagonId)!;
                const release = data.releases.find(r => r.id === debt.releaseId)!;
                const releasedWagon = data.wagons.find(w => w.id === release.wagonId)!;
                const situation = pending.status === 'resolved' ? 'Resolvida' : debt.dueDate < today ? 'Aberta · Vencida' : 'Aberta';
                return (
                  <li key={debt.id} className="callout callout-warning">
                    <p className="font-medium">{pending.description}</p>
                    <p className="mt-2 text-sm">
                      Origem:{' '}
                      <Link className="text-link" href={wagonPath(workId, origin.id)}>
                        {wagonLabel(origin.number)}
                      </Link>{' '}
                      · {origin.id === wagon.id ? 'Dívida própria' : 'Herdada de período anterior'}
                    </p>
                    <p className="mt-1 text-sm">
                      Gerada na liberação de{' '}
                      <Link className="text-link" href={wagonPath(workId, releasedWagon.id)}>
                        {wagonLabel(releasedWagon.number)}
                      </Link>
                      .
                    </p>
                    <p className="mt-1 text-sm">
                      {person(debt.responsibleId)} · prazo {formatDate(debt.dueDate)}
                    </p>
                    <p className="mt-2 text-sm font-semibold">{situation}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Histórico">
          {history.status === 'loading' && (
            <div role="status" aria-label="Carregando histórico" className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="skeleton h-4" style={{ width: `${85 - i * 15}%` }} />
              ))}
            </div>
          )}
          {history.status === 'error' && (
            <p role="alert" className="mb-3 text-sm text-slate-600">
              Não foi possível carregar o histórico.{' '}
              <button type="button" className="text-link" onClick={history.reload}>
                Tentar de novo
              </button>
            </p>
          )}
          {history.status === 'ready' && events.length === 0 && <Empty>Nenhum evento registrado para este vagão.</Empty>}
          {events.length > 0 && (
            <ol className="space-y-4">
              {events.map(event => (
                <li key={event.id}>
                  <p className="font-medium">{HISTORY_LABELS[event.action] ?? 'Planejamento atualizado'}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {person(event.authorId)} · {formatTimestamp(event.occurredAt)}
                  </p>
                  {typeof event.changes.reason === 'string' && event.changes.reason && (
                    <p className="mt-1 text-sm">Justificativa: {event.changes.reason}</p>
                  )}
                  {typeof event.changes.resolution === 'string' && <p className="mt-1 text-sm">Resolução: {event.changes.resolution}</p>}
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Link href={planningPath(workId)} className="text-link mt-8 inline-block">
        ← Voltar ao planejamento da obra
      </Link>
    </>
  );
}

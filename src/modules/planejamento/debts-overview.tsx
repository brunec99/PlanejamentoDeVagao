'use client';
import Link from 'next/link';
import { useState } from 'react';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { HelpNote } from '@/modules/layout/help-note';
import { formatDate, wagonLabel, wagonPath } from '@/shared/format';
import { usePlanning } from './planning-provider';
import { Empty, LoadState, Missing } from './ui';
import { ResolveAction } from './wagon-actions';

type Situation = 'open' | 'overdue' | 'resolved';
type Filter = Situation | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Abertas' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'resolved', label: 'Resolvidas' },
  { value: 'all', label: 'Todas' },
];

/** "Abertas" inclui as vencidas: vencida é a aberta cujo prazo assumido já passou. */
const matches = (situation: Situation, filter: Filter) =>
  filter === 'all' || (filter === 'open' ? situation !== 'resolved' : situation === filter);

const PILL: Record<Situation, { label: string; className: string }> = {
  open: { label: 'Aberta', className: 'border-warning-ring bg-warning-soft text-warning' },
  overdue: { label: 'Vencida', className: 'border-danger-ring bg-danger-soft text-danger' },
  resolved: { label: 'Resolvida', className: 'border-success-ring bg-success-soft text-success' },
};

function SituationPill({ situation }: { situation: Situation }) {
  const pill = PILL[situation];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${pill.className}`}>
      {pill.label}
    </span>
  );
}

export function DebtsOverview({ workId }: { workId: string }) {
  const c = usePlanning();
  const [filter, setFilter] = useState<Filter>('open');
  if (c.state !== 'ready') return <LoadState error={c.state === 'error'} />;
  const { data, today } = c.planning;
  const selected = selectWorkPlanning(c.planning, workId);
  if (!selected || !data.users.find(u => u.id === c.actorId)?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? 'Responsável não informado';

  // A dívida aponta para a pendência de origem e para a liberação que a aceitou. A situação é a
  // da pendência: resolver a pendência encerra a dívida sem apagar de onde ela veio.
  const rows = selected.debts.map(debt => {
    const pending = data.pendingItems.find(p => p.id === debt.pendingItemId)!;
    const release = data.releases.find(r => r.id === debt.releaseId)!;
    const situation: Situation = pending.status === 'resolved' ? 'resolved' : debt.dueDate < today ? 'overdue' : 'open';
    return {
      debt,
      pending,
      situation,
      origin: data.wagons.find(w => w.id === pending.wagonId)!,
      releasedWagon: data.wagons.find(w => w.id === release.wagonId)!,
    };
  });
  const visible = rows.filter(row => matches(row.situation, filter));

  return (
    <>
      <header className="mb-6">
        <p className="eyebrow">
          Apoio · {selected.work.code} · {selected.work.name}
        </p>
        <h1 className="page-title">Dívidas de terminalidade</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm text-slate-500">Pendências aceitas numa liberação excepcional e que continuam por resolver.</p>
          <HelpNote title="O que é uma dívida de terminalidade" compact>
            <p>
              Quando um vagão é liberado sem que o anterior seja terminal (liberação excepcional), as pendências em aberto do anterior são
              aceitas e viram dívidas: a execução segue, mas a pendência continua devida.
            </p>
            <p>
              A dívida guarda o responsável e o prazo assumidos na liberação. Uma liberação seguinte não a duplica — só registra o
              reconhecimento. Resolver a pendência de origem encerra a dívida, sem apagar de onde ela veio.
            </p>
            <p>
              Vencida é a dívida aberta cujo prazo assumido já passou. Restrições impeditivas não viram dívida: elas não podem ser
              contornadas por liberação excepcional.
            </p>
          </HelpNote>
        </div>
      </header>

      <div data-tour="dividas-filter" role="group" aria-label="Situação" className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold text-slate-500">Situação</span>
        {FILTERS.map(option => {
          const active = filter === option.value;
          const count = rows.filter(row => matches(row.situation, option.value)).length;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(option.value)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors ${active ? 'border-primary-ring bg-primary-soft text-primary' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              {option.label}
              <span className="text-xs tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
      </div>

      <div data-tour="dividas-list" className="space-y-4">
        {visible.length === 0 && (
          <div className="panel p-6">
            <Empty>Nenhuma dívida nesta situação.</Empty>
          </div>
        )}
        {visible.map(({ debt, pending, situation, origin, releasedWagon }) => (
          <article key={debt.id} className="panel p-5" aria-labelledby={`debt-${debt.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 id={`debt-${debt.id}`} className="text-base font-semibold text-slate-900">
                {pending.description}
              </h2>
              <SituationPill situation={situation} />
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Origem:{' '}
              <Link className="text-link" href={wagonPath(workId, origin.id)}>
                {wagonLabel(origin.number)}
              </Link>{' '}
              · gerada ao liberar{' '}
              <Link className="text-link" href={wagonPath(workId, releasedWagon.id)}>
                {wagonLabel(releasedWagon.number)}
              </Link>
              .
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {person(debt.responsibleId)} · prazo assumido: {formatDate(debt.dueDate)}
            </p>
            {pending.status === 'open' ? (
              <div className="mt-3">
                <ResolveAction id={pending.id} kind="pending" />
              </div>
            ) : (
              <p className="mt-3 text-sm">Resolução: {pending.resolution ?? 'Registrada'}</p>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { BoardStatus, Restriction } from '@/domain/entities';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty } from '@/modules/planejamento/ui';
import { Check, CommandForm, Field, Responsible, TextField, checked, value } from '@/modules/planejamento/forms';
import { boardStatusLabels, formatDate, wagonLabel, wagonPath } from '@/shared/format';

const columns: BoardStatus[] = ['identificada', 'em_tratativa', 'resolvida'];
const columnOf = (r: Restriction): BoardStatus => (r.status === 'resolved' ? 'resolvida' : r.boardStatus);

export function RestrictionsBoard({ workId }: { workId: string }) {
  const context = usePlanning();
  if (context.state !== 'ready') return null;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return null;
  const { data } = planning;
  const wagonIds = new Set(selected.wagons.map(w => w.id));
  const activities = data.activities.filter(a => wagonIds.has(a.wagonId));
  const restrictions = data.restrictions.filter(r => wagonIds.has(r.wagonId)).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt));
  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? 'Responsável não informado';
  const wagonOf = (id: string) => selected.wagons.find(w => w.id === id)!;

  return <section className="mt-8" aria-labelledby="restricoes-title">
    <h2 id="restricoes-title" className="text-lg font-bold text-slate-900">Restrições</h2>
    <p className="mt-1 text-sm text-slate-500">Quadro das restrições desta obra. Enquanto uma restrição estiver aberta e bloquear a execução, o vagão não aceita lançamento de progresso — mover para “Resolvida” exige registrar como foi resolvida.</p>

    <div className="my-5">
      <CommandForm title="Registrar restrição" submit="Registrar restrição" command={d => ({ type: 'create_restriction', wagonId: value(d, 'wagonId'), activityId: value(d, 'activityId') || undefined, description: value(d, 'description'), responsibleId: value(d, 'responsibleId'), dueDate: value(d, 'dueDate'), blocksExecution: checked(d, 'blocksExecution'), blocksTerminality: checked(d, 'blocksTerminality') })}>
        <TextField name="description" label="Restrição" />
        <Field label="Vagão"><select className="field" name="wagonId" required defaultValue=""><option value="">Selecione</option>{selected.wagons.map(w => <option key={w.id} value={w.id}>{wagonLabel(w.number)} · {selected.sequences.find(s => s.id === w.sequenceId)?.name ?? 'Sequência'}</option>)}</select></Field>
        <Field label="Atividade vinculada"><select className="field" name="activityId" defaultValue=""><option value="">Todo o vagão</option>{activities.map(a => <option key={a.id} value={a.id}>{wagonLabel(wagonOf(a.wagonId).number)} · {a.name}</option>)}</select></Field>
        <Responsible workId={workId} />
        <TextField name="dueDate" label="Prazo" type="date" />
        <Check name="blocksExecution" label="Bloqueia execução" defaultChecked />
        <Check name="blocksTerminality" label="Bloqueia terminalidade" defaultChecked />
      </CommandForm>
    </div>

    <div data-tour="medio-board" className="grid gap-4 md:grid-cols-3">{columns.map(column => {
      const cards = restrictions.filter(r => columnOf(r) === column);
      return <section key={column} className="panel" aria-labelledby={`coluna-${column}`}>
        <h3 id={`coluna-${column}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-800">{boardStatusLabels[column]}<span className="badge-muted tabular-nums">{cards.length}</span></h3>
        <div className="space-y-4 p-5">{cards.length === 0 ? <Empty>Nenhuma restrição nesta coluna.</Empty> : cards.map(r => {
          const wagon = wagonOf(r.wagonId);
          const overdue = r.status === 'open' && r.dueDate < planning.today;
          return <article key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">{r.description}</p>
            <p className="mt-1.5 text-sm"><Link className="text-link" href={wagonPath(workId, wagon.id)}>{wagonLabel(wagon.number)}</Link>{r.activityId && <span className="text-slate-600"> · {activities.find(a => a.id === r.activityId)?.name ?? 'Atividade indisponível'}</span>}</p>
            <p className="mt-1 text-sm text-slate-600">{person(r.responsibleId)} · prazo {formatDate(r.dueDate)}{overdue && <span className="ml-2 font-semibold text-rose-600">Prazo vencido</span>}</p>
            {(r.blocksExecution || r.blocksTerminality) && <p className="mt-2 flex flex-wrap gap-2">{r.blocksExecution && <span className="badge-muted">Bloqueia execução</span>}{r.blocksTerminality && <span className="badge-muted">Bloqueia terminalidade</span>}</p>}
            {r.status === 'resolved' && r.resolution && <p className="mt-2 text-sm text-slate-600">Resolução: {r.resolution}</p>}
            {r.status === 'open' && <div className="mt-3 space-y-3">{actor.role !== 'viewer' && <MoveAction restriction={r} />}<CommandForm title="Registrar resolução" command={d => ({ type: 'resolve_restriction', restrictionId: r.id, resolution: value(d, 'resolution') })}><TextField name="resolution" label="Como foi resolvido?" /></CommandForm></div>}
          </article>;
        })}</div>
      </section>;
    })}</div>
  </section>;
}

function MoveAction({ restriction }: { restriction: Restriction }) {
  const context = usePlanning();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (context.state !== 'ready') return null;
  const target: Exclude<BoardStatus, 'resolvida'> = restriction.boardStatus === 'identificada' ? 'em_tratativa' : 'identificada';
  return <div className="space-y-3">
    <button type="button" className="button-ghost" disabled={busy} aria-label={`Mover restrição “${restriction.description}” para ${boardStatusLabels[target]}`} onClick={async () => {
      if (busy) return; setBusy(true); setError('');
      try { await context.execute({ type: 'move_restriction', restrictionId: restriction.id, boardStatus: target }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível mover a restrição.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Movendo…' : target === 'em_tratativa' ? 'Iniciar tratativa →' : '← Voltar para identificada'}</button>
    {error && <Callout tone="danger" role="alert">{error}</Callout>}
  </div>;
}

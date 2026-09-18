'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Activity, BoardStatus, Location, Restriction, Wagon } from '@/domain/entities';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { leadTimeDeadline } from '@/domain/rules';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, StatCard } from '@/modules/planejamento/ui';
import { Check, CommandForm, Field, Responsible, TextField, checked, number, value } from '@/modules/planejamento/forms';
import { boardStatusLabels, formatDate, wagonLabel, wagonPath } from '@/shared/format';

const columns: BoardStatus[] = ['identificada', 'em_tratativa', 'resolvida'];
const columnOf = (r: Restriction): BoardStatus => (r.status === 'resolved' ? 'resolvida' : r.boardStatus);
const isInteger = (raw: string) => raw !== '' && /^\d+$/.test(raw);
/** A atividade pode ser reprogramada depois do cadastro, então o limite exibido é recalculado
 * a partir do início previsto atual; `dueDate` guarda o que foi gravado na criação. */
const deadlineFor = (r: Restriction, activity?: Activity) => (r.leadTimeDays !== undefined && activity ? leadTimeDeadline(activity.plannedStart, r.leadTimeDays) : r.dueDate);

export function RestrictionsBoard({ workId }: { workId: string }) {
  const context = usePlanning();
  const [openId, setOpenId] = useState('');
  if (context.state !== 'ready') return null;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return null;
  const { data } = planning;
  const wagonIds = new Set(selected.wagons.map(w => w.id));
  const activities = data.activities.filter(a => wagonIds.has(a.wagonId));
  const wagonOf = (id: string) => selected.wagons.find(w => w.id === id)!;
  const activityOf = (id?: string) => (id ? activities.find(a => a.id === id) : undefined);
  const deadlineOf = (r: Restriction) => deadlineFor(r, activityOf(r.activityId));
  const person = (id: string) => data.users.find(u => u.id === id)?.name ?? 'Responsável não informado';
  const restrictions = data.restrictions.filter(r => wagonIds.has(r.wagonId)).sort((a, b) => deadlineOf(a).localeCompare(deadlineOf(b)) || a.createdAt.localeCompare(b.createdAt));
  const pendingOpen = restrictions.filter(r => r.status === 'open');
  const overdue = pendingOpen.filter(r => deadlineOf(r) < planning.today);
  const next = pendingOpen[0];
  const detail = restrictions.find(r => r.id === openId);

  return <section className="mt-8" aria-labelledby="pendencias-title">
    <h2 id="pendencias-title" className="text-lg font-bold text-slate-900">Pendências</h2>
    <p className="mt-1 text-sm text-slate-500">Cada pendência é ligada a uma atividade e a um lead time: o limite de resolução sai do início previsto da atividade menos esse lead time, porque a obtenção precisa caber antes de a frente começar. Abra o card para ver a descrição completa e de onde veio a data. Enquanto uma pendência estiver aberta e bloquear a execução, o vagão não aceita lançamento de progresso.</p>

    <div className="my-5">
      <CommandForm title="Registrar pendência" submit="Registrar pendência" command={d => {
        const activity = activityOf(value(d, 'activityId'));
        const raw = value(d, 'leadTimeDays');
        const lead = isInteger(raw) ? number(d, 'leadTimeDays') : undefined;
        return {
          type: 'create_restriction', wagonId: activity?.wagonId ?? '', activityId: activity?.id, description: value(d, 'description'), responsibleId: value(d, 'responsibleId'),
          // Com lead time o servidor recalcula o prazo pelo início previsto e ignora o que enviamos aqui.
          dueDate: lead !== undefined && activity ? leadTimeDeadline(activity.plannedStart, lead) : value(d, 'dueDate'),
          blocksExecution: checked(d, 'blocksExecution'), blocksTerminality: checked(d, 'blocksTerminality'), leadTimeDays: lead,
        };
      }}>
        <RestrictionFields workId={workId} activities={activities} locations={data.locations} />
      </CommandForm>
    </div>

    <div className="mb-5 grid gap-4 sm:grid-cols-3">
      <StatCard label="Pendências abertas" value={pendingOpen.length} />
      <StatCard label="Com prazo vencido" value={overdue.length} tone={overdue.length > 0 ? 'danger' : 'default'} />
      <StatCard label="Mais próxima do limite" tone={next && deadlineOf(next) < planning.today ? 'danger' : 'default'} value={next ? <>{formatDate(deadlineOf(next))}<span className="mt-1 block truncate text-xs font-medium text-slate-500">{next.description}</span></> : '—'} />
    </div>

    <div data-tour="longo-board" className="grid gap-4 md:grid-cols-3">{columns.map(column => {
      const cards = restrictions.filter(r => columnOf(r) === column);
      return <section key={column} className="panel" aria-labelledby={`coluna-${column}`}>
        <h3 id={`coluna-${column}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 text-sm font-bold text-slate-800">{boardStatusLabels[column]}<span className="badge-muted tabular-nums">{cards.length}</span></h3>
        <div className="space-y-3 p-5">{cards.length === 0 ? <Empty>Nenhuma pendência nesta coluna.</Empty> : cards.map(r => {
          const activity = activityOf(r.activityId);
          const limit = deadlineFor(r, activity);
          const late = r.status === 'open' && limit < planning.today;
          return <button key={r.id} type="button" aria-haspopup="dialog" onClick={() => setOpenId(r.id)} className={`block w-full rounded-lg border bg-slate-50 p-4 text-left transition-colors hover:border-blue-300 hover:bg-white ${late ? 'border-rose-200' : 'border-slate-200'}`}>
            <p className="line-clamp-2 text-sm font-semibold text-slate-800">{r.description}</p>
            <p className="mt-1.5 text-xs text-slate-600">{wagonLabel(wagonOf(r.wagonId).number)} · {activity ? activity.name : 'Sem atividade vinculada'}</p>
            <p className="mt-1 text-xs text-slate-600">Limite {formatDate(limit)}{late && <span className="ml-2 font-semibold text-rose-600">Prazo vencido</span>}</p>
            {r.leadTimeDays !== undefined && <p className="mt-2"><span className="badge-muted">Lead time {r.leadTimeDays} d</span></p>}
          </button>;
        })}</div>
      </section>;
    })}</div>

    {detail && <CardDetail restriction={detail} activity={activityOf(detail.activityId)} wagon={wagonOf(detail.wagonId)} workId={workId} responsible={person(detail.responsibleId)} today={planning.today} canMove={actor.role !== 'viewer'} onClose={() => setOpenId('')} />}
  </section>;
}

function RestrictionFields({ workId, activities, locations }: { workId: string; activities: Activity[]; locations: Location[] }) {
  const [locationId, setLocationId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [lead, setLead] = useState('');
  // Uma obra real tem milhares de atividades. O recorte é por local, não por vagão: o longo
  // prazo lê a obra por serviço e local, e o vagão sai da atividade escolhida.
  const options = activities.filter(a => a.locationId === locationId).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const activity = options.find(a => a.id === activityId);
  const days = isInteger(lead) ? Number(lead) : undefined;
  const used = locations.filter(l => activities.some(a => a.locationId === l.id));
  return <>
    <TextField name="description" label="Descrição da pendência" />
    <Field label="Local">
      <select className="field" required value={locationId} onChange={e => { setLocationId(e.target.value); setActivityId(''); }}>
        <option value="">Selecione</option>
        {used.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </Field>
    <Field label="Atividade vinculada">
      <select className="field" name="activityId" required disabled={!locationId} value={activityId} onChange={e => setActivityId(e.target.value)}>
        <option value="">{locationId ? 'Selecione' : 'Escolha o local primeiro'}</option>
        {options.map(a => <option key={a.id} value={a.id}>{a.name} · {formatDate(a.plannedStart)}</option>)}
      </select>
    </Field>
    <Responsible workId={workId} />
    <Field label="Lead time (dias para obter)">
      <input className="field" name="leadTimeDays" type="number" min={0} step={1} inputMode="numeric" value={lead} onChange={e => setLead(e.target.value)} placeholder="Deixe vazio para digitar o prazo" />
    </Field>
    {days !== undefined
      ? activity
        ? <Callout tone="info" role="status">Data limite para resolução: <strong>{formatDate(leadTimeDeadline(activity.plannedStart, days))}</strong> — início previsto {formatDate(activity.plannedStart)} menos {days} dias de lead time.</Callout>
        : <Callout tone="warning" role="status">Selecione a atividade para calcular a data limite pelo lead time.</Callout>
      : <TextField name="dueDate" label="Prazo (sem lead time, a data é digitada)" type="date" />}
    <Check name="blocksExecution" label="Bloqueia execução" defaultChecked />
    <Check name="blocksTerminality" label="Bloqueia terminalidade" defaultChecked />
  </>;
}

function CardDetail({ restriction, activity, wagon, workId, responsible, today, canMove, onClose }: { restriction: Restriction; activity?: Activity; wagon: Wagon; workId: string; responsible: string; today: string; canMove: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.showModal(); closeButton.current?.focus(); }, []);
  const limit = deadlineFor(restriction, activity);
  const late = restriction.status === 'open' && limit < today;
  const wagonLink = <Link className="text-link" href={wagonPath(workId, wagon.id)}>{wagonLabel(wagon.number)}</Link>;
  return <dialog ref={dialog} onClose={onClose} aria-labelledby="pendencia-detalhe" className="m-auto max-h-[85vh] w-[min(40rem,92vw)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl custom-scrollbar backdrop:bg-slate-900/55">
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Pendência · {boardStatusLabels[columnOf(restriction)]}</p>
          <h3 id="pendencia-detalhe" className="mt-1 text-base font-bold text-slate-900">Detalhe da pendência</h3>
        </div>
        <button ref={closeButton} type="button" className="button-ghost" onClick={() => dialog.current?.close()}>Fechar</button>
      </div>

      <dl className="mt-5 space-y-4 text-sm">
        <div><dt className="eyebrow">Descrição</dt><dd className="mt-1 leading-6 text-slate-800">{restriction.description}</dd></div>
        <div><dt className="eyebrow">Atividade vinculada</dt><dd className="mt-1 text-slate-700">
          {activity ? <>{activity.name} · {wagonLink}<span className="mt-0.5 block text-slate-500">Período previsto {formatDate(activity.plannedStart)} → {formatDate(activity.plannedEnd)}</span></> : <>Sem atividade vinculada · {wagonLink}</>}
        </dd></div>
        <div><dt className="eyebrow">Lead time</dt><dd className="mt-1 text-slate-700">{restriction.leadTimeDays !== undefined ? `${restriction.leadTimeDays} dias` : 'Sem lead time — prazo digitado manualmente'}</dd></div>
        <div><dt className="eyebrow">Data limite para resolução</dt><dd className="mt-1 font-semibold text-slate-900">
          {formatDate(limit)}{late && <span className="ml-2 text-rose-600">Prazo vencido</span>}
          {restriction.leadTimeDays !== undefined && activity && <span className="mt-1 block text-xs font-medium text-slate-500">Início previsto {formatDate(activity.plannedStart)} menos {restriction.leadTimeDays} dias de lead time.</span>}
          {limit !== restriction.dueDate && <span className="mt-1 block text-xs font-medium text-amber-700">A atividade foi reprogramada desde o cadastro: o limite registrado é {formatDate(restriction.dueDate)}.</span>}
        </dd></div>
        <div><dt className="eyebrow">Responsável</dt><dd className="mt-1 text-slate-700">{responsible}</dd></div>
        <div><dt className="eyebrow">Situação</dt><dd className="mt-1 text-slate-700">{restriction.status === 'resolved' ? `Resolvida${restriction.resolvedAt ? ` em ${formatDate(restriction.resolvedAt.slice(0, 10))}` : ''}` : `Aberta · ${boardStatusLabels[restriction.boardStatus]}`}</dd></div>
        <div><dt className="eyebrow">Bloqueios</dt><dd className="mt-1 flex flex-wrap gap-2">
          {restriction.blocksExecution && <span className="badge-muted">Bloqueia execução</span>}
          {restriction.blocksTerminality && <span className="badge-muted">Bloqueia terminalidade</span>}
          {!restriction.blocksExecution && !restriction.blocksTerminality && <span className="text-slate-700">Não bloqueia execução nem terminalidade</span>}
        </dd></div>
        {restriction.status === 'resolved' && restriction.resolution && <div><dt className="eyebrow">Resolução</dt><dd className="mt-1 leading-6 text-slate-700">{restriction.resolution}</dd></div>}
      </dl>

      {/* “Resolvida” não é alcançável por movimentação: exige registrar a resolução. */}
      {restriction.status === 'open' && <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
        {canMove && <MoveAction restriction={restriction} />}
        <CommandForm title="Registrar resolução" command={d => ({ type: 'resolve_restriction', restrictionId: restriction.id, resolution: value(d, 'resolution') })}>
          <TextField name="resolution" label="Como foi resolvido?" />
        </CommandForm>
      </div>}
    </div>
  </dialog>;
}

function MoveAction({ restriction }: { restriction: Restriction }) {
  const context = usePlanning();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (context.state !== 'ready') return null;
  const target: Exclude<BoardStatus, 'resolvida'> = restriction.boardStatus === 'identificada' ? 'em_tratativa' : 'identificada';
  return <div className="space-y-3">
    <button type="button" className="button-ghost" disabled={busy} aria-label={`Mover pendência “${restriction.description}” para ${boardStatusLabels[target]}`} onClick={async () => {
      if (busy) return; setBusy(true); setError('');
      try { await context.execute({ type: 'move_restriction', restrictionId: restriction.id, boardStatus: target }); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível mover a pendência.'); }
      finally { setBusy(false); }
    }}>{busy ? 'Movendo…' : target === 'em_tratativa' ? 'Iniciar tratativa →' : '← Voltar para identificada'}</button>
    {error && <Callout tone="danger" role="alert">{error}</Callout>}
  </div>;
}

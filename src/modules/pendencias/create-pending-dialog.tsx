'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { CircleCheckBig, LoaderCircle, Lock } from 'lucide-react';
import { PENDING_LIMITS, dueDateFromStart, startBy, type PendingPerson } from '@/domain/pending-board';
import { Field } from '@/modules/planejamento/forms';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { useToast } from '@/modules/layout/toast';
import { formatDate } from '@/shared/format';
import { errorText, fetchPending, sendPendingCommand } from './api';
import { Modal, pendingPath } from './parts';
import { sortPeople } from './pending-view';

/** A tarefa do médio prazo ou o serviço do longo prazo de onde o card nasce (regras 4 e 5). */
export interface PendingSource {
  origin: 'medio_prazo' | 'longo_prazo';
  sourceId: string;
  label: string;
  /** AAAA-MM-DD, início atual da tarefa ou do serviço. */
  start: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_FIELD: Record<PendingSource['origin'], string> = { medio_prazo: 'Tarefa', longo_prazo: 'Serviço da linha de balanço' };
const SOURCE_HINT: Record<PendingSource['origin'], string> = {
  medio_prazo: 'Só o lead time é digitado; a data vem da tarefa e muda junto com ela.',
  longo_prazo: 'Só o lead time é digitado; a data vem do serviço e muda junto com ele.',
};
const LOCKED = 'flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm tabular-nums text-slate-600';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }
  | { status: 'ready'; people: PendingPerson[]; actorId: string; knownIds: Set<string> };

/** Criação de um card da lista de pendência (10/11/2026). Serve às três entradas do modelo aprovado: o
 * botão "+ Nova pendência" da aba 2 (sem `source`: tudo é digitado) e os botões na tarefa do médio prazo
 * e no serviço do longo prazo (com `source`: a entrega é a véspera útil do início e só o lead time é
 * digitado). É autossuficiente — busca as pessoas e grava sozinho —, para abrir em qualquer tela sem o
 * quadro montado. */
export function CreatePendingDialog(props: {
  workId: string;
  source?: PendingSource;
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}): JSX.Element | null {
  if (!props.open) return null;
  // Montado só enquanto aberto: cada abertura começa com o formulário limpo.
  return <CreateForm {...props} />;
}

function CreateForm({
  workId,
  source,
  onClose,
  onCreated,
}: {
  workId: string;
  source?: PendingSource;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const context = usePlanning();
  const { toast } = useToast();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [leadTime, setLeadTime] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ title: string; cardId?: string }>();

  useEffect(() => {
    let active = true;
    fetchPending(workId)
      .then(response => {
        if (!active) return;
        if (!response.available) return setLoad({ status: 'unavailable' });
        setLoad({
          status: 'ready',
          people: sortPeople(response.people),
          actorId: response.actorId,
          knownIds: new Set(response.cards.map(c => c.id)),
        });
        // Quem cria costuma ser o responsável: já vem escolhido, se tiver a obra liberada.
        setResponsibleId(current => current || (response.people.some(p => p.id === response.actorId) ? response.actorId : ''));
      })
      .catch(cause => active && setLoad({ status: 'error', message: errorText(cause, 'Falha ao carregar as pessoas da obra.') }));
    return () => {
      active = false;
    };
  }, [workId, attempt]);

  const today = context.state === 'ready' ? context.planning.today : undefined;
  const due = source ? (ISO_DATE.test(source.start) ? dueDateFromStart(source.start) : '') : dueDate;
  const days = leadTime.trim() === '' ? NaN : Number(leadTime);
  const daysValid = Number.isInteger(days) && days >= 0 && days <= PENDING_LIMITS.leadTime;
  const begin = ISO_DATE.test(due) && daysValid ? startBy({ dueDate: due, leadTimeDays: days }) : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || load.status !== 'ready') return;
    const name = title.trim();
    if (!name) return setError('Escreva a pendência.');
    if (!ISO_DATE.test(due)) return setError(source ? 'A origem está sem data de início.' : 'Informe a data de término.');
    if (!daysValid) return setError(`O tempo de execução é um número inteiro de dias úteis, de 0 a ${PENDING_LIMITS.leadTime}.`);
    if (!responsibleId) return setError('Escolha o responsável.');
    setBusy(true);
    setError('');
    try {
      const response = await sendPendingCommand(
        {
          type: 'create_card',
          workId,
          title: name,
          description: source ? undefined : description.trim() || undefined,
          origin: source?.origin ?? 'manual',
          sourceId: source?.sourceId,
          sourceLabel: source?.label,
          dueDate: due,
          leadTimeDays: days,
          responsibleId,
        },
        workId,
      );
      onCreated?.();
      if (!source) {
        toast({ title: 'Pendência criada.', description: name, tone: 'success' });
        onClose();
        return;
      }
      // O card novo é o que não existia quando o formulário abriu (o mais recente, se houver mais de um).
      const fresh = response.cards
        .filter(c => !load.knownIds.has(c.id) && c.title === name)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      setLoad({ ...load, knownIds: new Set(response.cards.map(c => c.id)) });
      setCreated({ title: name, cardId: fresh?.id });
      setTitle('');
      setLeadTime('');
    } catch (cause) {
      setError(errorText(cause, 'Não foi possível criar a pendência.'));
    } finally {
      setBusy(false);
    }
  };

  const heading = (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="eyebrow">Lista de pendência</p>
        <h3 id="pendencia-nova-titulo" className="mt-1 text-base font-bold text-slate-900">
          Nova pendência
        </h3>
      </div>
      <button type="button" className="button-ghost" onClick={onClose} disabled={busy}>
        Fechar
      </button>
    </div>
  );

  return (
    <Modal onClose={onClose} labelledBy="pendencia-nova-titulo" busy={busy}>
      <div className="space-y-4 p-5 sm:p-6">
        {heading}
        {load.status === 'loading' && (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle size={15} aria-hidden className="animate-spin" />
            Carregando as pessoas da obra…
          </p>
        )}
        {load.status === 'error' && (
          <>
            <Callout tone="danger" role="alert">
              Não foi possível abrir o formulário. {load.message}
            </Callout>
            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                setLoad({ status: 'loading' });
                setAttempt(n => n + 1);
              }}
            >
              Tentar de novo
            </button>
          </>
        )}
        {load.status === 'unavailable' && (
          <Callout tone="warning" role="status">
            A lista de pendência fica indisponível até a migração 0043 ser aplicada no banco.
          </Callout>
        )}
        {load.status === 'ready' && created && (
          <div className="space-y-4">
            <Callout tone="success" role="status">
              <CircleCheckBig size={15} aria-hidden className="mr-1.5 inline align-[-2px]" />
              Pendência criada: <strong>{created.title}</strong>. Ela está em A fazer, na lista de pendência da aba 2.
            </Callout>
            <div className="flex flex-wrap items-center gap-2">
              <Link className="button" href={pendingPath(workId, created.cardId)}>
                {created.cardId ? 'Abrir o card' : 'Abrir a lista de pendência'}
              </Link>
              <button type="button" className="button-ghost" onClick={() => setCreated(undefined)}>
                Criar outra
              </button>
              <button type="button" className="button-ghost" onClick={onClose}>
                Fechar
              </button>
            </div>
          </div>
        )}
        {load.status === 'ready' && !created && (
          <form className="space-y-4" onSubmit={submit} noValidate>
            <fieldset disabled={busy} className="space-y-4">
              {source && (
                <div className="text-xs font-semibold text-slate-600">
                  <span className="mb-1.5 block">{SOURCE_FIELD[source.origin]}</span>
                  <p className={LOCKED}>
                    <Lock size={13} aria-hidden className="shrink-0 text-slate-400" />
                    <span className="min-w-0 font-normal">
                      {source.label}
                      {ISO_DATE.test(source.start) ? ` · início ${formatDate(source.start)}` : ''}
                    </span>
                  </p>
                </div>
              )}
              <Field label="Pendência">
                <input
                  className="field"
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  maxLength={PENDING_LIMITS.title}
                  placeholder="O que precisa estar resolvido"
                  autoFocus
                  required
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                {source ? (
                  <div className="text-xs font-semibold text-slate-600">
                    <span className="mb-1.5 block">Entrega (véspera do início)</span>
                    <p className={LOCKED}>
                      <Lock size={13} aria-hidden className="shrink-0 text-slate-400" />
                      <span className="font-normal">{due ? formatDate(due) : 'sem data'}</span>
                    </p>
                  </div>
                ) : (
                  <Field label="Data de término">
                    <input className="field" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} required />
                  </Field>
                )}
                <Field label={source ? 'Lead time (dias úteis)' : 'Tempo de execução (dias úteis)'}>
                  <input
                    className="field"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={PENDING_LIMITS.leadTime}
                    step={1}
                    value={leadTime}
                    onChange={event => setLeadTime(event.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Responsável">
                <select className="field" value={responsibleId} onChange={event => setResponsibleId(event.target.value)} required>
                  <option value="">Escolha…</option>
                  {load.people.map(person => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </Field>
              {!source && (
                <Field label="Descrição (opcional)">
                  <textarea
                    className="field min-h-20 resize-y"
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    maxLength={PENDING_LIMITS.description}
                  />
                </Field>
              )}
              <p className="text-xs text-slate-500">
                {begin ? (
                  <>
                    Precisa começar até <strong className="tabular-nums text-slate-700">{formatDate(begin)}</strong>
                    {today && begin < today ? ', data que já passou: o card nasce atrasado.' : '.'}
                  </>
                ) : (
                  'Precisa começar até: a entrega menos o tempo de execução, em dias úteis.'
                )}
                {source && <span className="block">{SOURCE_HINT[source.origin]}</span>}
              </p>
              {load.people.length === 0 && (
                <Callout tone="warning">
                  Ninguém tem esta obra liberada para ser responsável. Libere a obra em Configurações → Usuários.
                </Callout>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" className="button">
                  {busy ? 'Criando…' : 'Criar pendência'}
                </button>
                <button type="button" className="button-ghost" onClick={onClose}>
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
        )}
      </div>
    </Modal>
  );
}

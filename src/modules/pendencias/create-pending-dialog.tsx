'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { CircleCheckBig, LoaderCircle, Lock } from 'lucide-react';
import {
  PENDING_LIMITS,
  dueDateFromStart,
  startBy,
  type PendingPerson,
  type PendingSourceOption,
  type PendingSourceOptions,
} from '@/domain/pending-board';
import { Field } from '@/modules/planejamento/forms';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout } from '@/modules/planejamento/ui';
import { useToast } from '@/modules/layout/toast';
import { formatDate } from '@/shared/format';
import { errorText, fetchPending, fetchPendingSources, sendPendingCommand } from './api';
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
/** Ligação escolhida no formulário da aba 2: nenhuma (data digitada), tarefa ou serviço. */
type LinkKind = 'manual' | PendingSource['origin'];
const LINK_KINDS: { kind: LinkKind; label: string }[] = [
  { kind: 'manual', label: 'Sem ligação' },
  { kind: 'medio_prazo', label: 'Tarefa do médio prazo' },
  { kind: 'longo_prazo', label: 'Serviço do longo prazo' },
];
const LINK_EMPTY: Record<PendingSource['origin'], string> = {
  medio_prazo: 'Esta obra não tem cronograma do médio prazo com tarefas.',
  longo_prazo: 'Esta obra não tem serviço lançado na Linha de Balanço.',
};
type Options = { status: 'idle' | 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: PendingSourceOptions };
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const LOCKED = 'flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm tabular-nums text-slate-600';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'unavailable' }
  | { status: 'ready'; people: PendingPerson[]; actorId: string; knownIds: Set<string> };

/** Criação de um card da lista de pendência (10/11/2026). Serve às três entradas do modelo aprovado: o
 * botão "+ Nova pendência" da aba 2 (sem `source`: tudo é digitado) e os botões na tarefa do médio prazo
 * e no serviço do longo prazo (com `source`: a entrega é a véspera útil do início e só o lead time é
 * digitado). Na aba 2 a pessoa também pode ligar o card a uma tarefa do médio prazo ou a um serviço do longo
 * prazo, escolhidos numa lista: o card nasce igual ao criado pelo botão daquelas telas. É autossuficiente — busca as pessoas e grava sozinho —, para abrir em qualquer tela sem o
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
  source: fixed,
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
  // Ligação escolhida na aba 2 (sem `source` vindo de fora).
  const [linkKind, setLinkKind] = useState<LinkKind>('manual');
  const [linkId, setLinkId] = useState('');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Options>({ status: 'idle' });
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  // A lista é lida uma vez por abertura (ou a cada "Tentar de novo"), na primeira vez que for pedida.
  const needOptions = !fixed && linkKind !== 'manual' && options.status !== 'ready' && options.status !== 'error';

  useEffect(() => {
    if (!needOptions) return;
    let active = true;
    fetchPendingSources(workId)
      .then(data => active && setOptions({ status: 'ready', data }))
      .catch(cause => active && setOptions({ status: 'error', message: errorText(cause, 'Falha ao carregar a lista.') }));
    return () => {
      active = false;
    };
  }, [workId, needOptions, optionsAttempt]);

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
  const linkList: PendingSourceOption[] =
    options.status !== 'ready' || linkKind === 'manual' ? [] : linkKind === 'medio_prazo' ? options.data.tasks : options.data.services;
  const linked = linkList.find(o => o.id === linkId);
  const term = plain(search.trim());
  // A escolhida continua na lista mesmo fora da busca, para o campo não ficar mostrando outra coisa.
  const shown = term ? linkList.filter(o => o.id === linkId || (!o.summary && plain(o.label).includes(term))) : linkList;
  const source: PendingSource | undefined =
    fixed ??
    (linkKind !== 'manual' && linked ? { origin: linkKind, sourceId: linked.id, label: linked.label, start: linked.start } : undefined);
  const picking = !fixed && linkKind !== 'manual';
  const due = source ? (ISO_DATE.test(source.start) ? dueDateFromStart(source.start) : '') : picking ? '' : dueDate;
  const days = leadTime.trim() === '' ? NaN : Number(leadTime);
  const daysValid = Number.isInteger(days) && days >= 0 && days <= PENDING_LIMITS.leadTime;
  const begin = ISO_DATE.test(due) && daysValid ? startBy({ dueDate: due, leadTimeDays: days }) : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || load.status !== 'ready') return;
    const name = title.trim();
    if (!name) return setError('Escreva a pendência.');
    if (picking && !source)
      return setError(linkKind === 'medio_prazo' ? 'Escolha a tarefa do médio prazo.' : 'Escolha o serviço do longo prazo.');
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
          description: fixed ? undefined : description.trim() || undefined,
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
      if (!fixed) {
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
              {fixed && source && (
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
              {!fixed && (
                <div className="space-y-2">
                  <div role="radiogroup" aria-label="Ligar a pendência a" className="text-xs font-semibold text-slate-600">
                    <span className="mb-1.5 block">Ligar a</span>
                    <div className="flex flex-wrap gap-1.5">
                      {LINK_KINDS.map(({ kind, label }) => (
                        <button
                          key={kind}
                          type="button"
                          role="radio"
                          aria-checked={linkKind === kind}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            linkKind === kind
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                          onClick={() => {
                            if (kind === linkKind) return;
                            setLinkKind(kind);
                            setLinkId('');
                            setSearch('');
                            setError('');
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {picking && options.status !== 'ready' && options.status !== 'error' && (
                    <p role="status" className="flex items-center gap-2 text-sm text-slate-500">
                      <LoaderCircle size={15} aria-hidden className="animate-spin" />
                      Carregando a lista…
                    </p>
                  )}
                  {picking && options.status === 'error' && (
                    <Callout tone="danger" role="alert">
                      {options.message}{' '}
                      <button
                        type="button"
                        className="font-semibold underline"
                        onClick={() => {
                          setOptions({ status: 'loading' });
                          setOptionsAttempt(n => n + 1);
                        }}
                      >
                        Tentar de novo
                      </button>
                    </Callout>
                  )}
                  {picking && options.status === 'ready' && linkList.length === 0 && (
                    <Callout tone="warning">{LINK_EMPTY[linkKind as PendingSource['origin']]}</Callout>
                  )}
                  {picking && options.status === 'ready' && linkList.length > 0 && (
                    <>
                      {linkList.length > 8 && (
                        <input
                          className="field"
                          type="search"
                          value={search}
                          onChange={event => setSearch(event.target.value)}
                          placeholder={linkKind === 'medio_prazo' ? 'Buscar tarefa pelo nome' : 'Buscar serviço pelo nome'}
                          aria-label={linkKind === 'medio_prazo' ? 'Buscar tarefa pelo nome' : 'Buscar serviço pelo nome'}
                        />
                      )}
                      <Field label={SOURCE_FIELD[linkKind as PendingSource['origin']]}>
                        <select
                          className="field"
                          value={linkId}
                          onChange={event => {
                            setLinkId(event.target.value);
                            setError('');
                          }}
                          required
                        >
                          <option value="">{shown.length ? 'Escolha…' : 'Nenhum nome com essa busca'}</option>
                          {shown.map(option => (
                            <option key={option.id} value={option.id} disabled={option.summary}>
                              {'\u00a0\u00a0'.repeat(term ? 0 : Math.min(option.level ?? 0, 6))}
                              {option.label} · início {formatDate(option.start)}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  )}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {picking || source ? (
                  <div className="text-xs font-semibold text-slate-600">
                    <span className="mb-1.5 block">Entrega (véspera do início)</span>
                    <p className={LOCKED}>
                      <Lock size={13} aria-hidden className="shrink-0 text-slate-400" />
                      <span className="font-normal">{due ? formatDate(due) : source ? 'sem data' : 'vem da escolha acima'}</span>
                    </p>
                  </div>
                ) : (
                  <Field label="Data de término">
                    <input className="field" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} required />
                  </Field>
                )}
                <Field label={picking || source ? 'Lead time (dias úteis)' : 'Tempo de execução (dias úteis)'}>
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
              {!fixed && (
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

'use client';
import { useCallback, useEffect, useState } from 'react';
import { Database, Inbox, Mail, RefreshCw, Timer, UserPlus, Users } from 'lucide-react';
import { useDeveloper, usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState } from '@/modules/planejamento/ui';
import { useToast } from '@/modules/layout/toast';
import { formatTimestamp, roleLabels } from '@/shared/format';
import type { Command } from '@/application/use-cases/commands';
import type { AccessRequest } from '@/application/access-request';
import { UsersTable } from './users-table';

function useCommand() {
  const c = usePlanning();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (command: Command) => {
    if (c.state !== 'ready' || busy) return;
    setBusy(true);
    setError('');
    try {
      await c.execute(command);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function TaktField({ sequenceId, taktDays }: { sequenceId: string; taktDays: number }) {
  const { busy, error, run } = useCommand();
  const [value, setValue] = useState(String(taktDays));
  const dirty = value !== String(taktDays);
  return (
    <div data-tour="config-takt-field" className="flex items-center gap-2">
      <input
        className="field w-20 py-1.5 text-sm"
        type="number"
        min={1}
        max={365}
        value={value}
        aria-label="Takt em dias"
        onChange={e => setValue(e.target.value)}
      />
      <span className="text-xs text-slate-400">dias</span>
      {dirty && (
        <button
          className="button px-3 py-1.5 text-xs"
          disabled={busy}
          onClick={() => run({ type: 'set_takt', sequenceId, taktDays: Number(value) })}
        >
          Salvar
        </button>
      )}
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function StartDateField({ sequenceId, startDate }: { sequenceId: string; startDate?: string }) {
  const { busy, error, run } = useCommand();
  const [value, setValue] = useState(startDate ?? '');
  const dirty = value !== (startDate ?? '');
  return (
    <div data-tour="config-start-date" className="flex items-center gap-2">
      <input
        className="field w-36 py-1.5 text-sm"
        type="date"
        value={value}
        aria-label="Início do primeiro vagão"
        onChange={e => setValue(e.target.value)}
      />
      {dirty && (
        <button
          className="button px-3 py-1.5 text-xs"
          disabled={busy}
          onClick={() => run({ type: 'set_sequence_start', sequenceId, startDate: value || null })}
        >
          Salvar
        </button>
      )}
      {error && (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/** Pedidos de acesso feitos na tela de login por quem não tem cadastro. "Cadastrar" cria o usuário
 * como consulta, sem obras (o admin libera obras e módulos na lista de usuários logo abaixo), e o
 * pedido sai da lista; "Dispensar" só o tira da lista. Some quando não há pedido. */
function AccessRequests({ refreshKey, onRegistered }: { refreshKey: number; onRegistered: () => void }) {
  const { toast } = useToast();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/access-requests', { cache: 'no-store' });
      const body = await res.json();
      if (res.ok) setRequests(body.requests ?? []);
    } catch {}
  }, []);
  useEffect(() => {
    void load();
  }, [load, refreshKey]);
  if (!requests.length) return null;
  const act = async (request: AccessRequest, kind: 'register' | 'dismiss') => {
    setBusy(request.id);
    setError('');
    try {
      const res =
        kind === 'register'
          ? await fetch('/api/admin/invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: request.email, name: request.name, role: 'viewer' }),
            })
          : await fetch(`/api/admin/access-requests/${encodeURIComponent(request.id)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'dismissed' }),
            });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível concluir.');
      if (kind === 'register') {
        toast({
          title: `${request.name} cadastrado como consulta.`,
          description: 'Libere as obras e os módulos na lista de usuários; avise a pessoa para entrar de novo com o Google.',
          tone: 'success',
        });
        onRegistered();
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir.');
    } finally {
      setBusy('');
    }
  };
  return (
    <section data-tour="config-requests" aria-labelledby="access-requests-title" className="panel mb-4 border-primary-ring p-5">
      <h3 id="access-requests-title" className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <Inbox size={16} className="text-primary" aria-hidden />
        Pedidos de acesso
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-white">{requests.length}</span>
      </h3>
      <p className="mt-1 text-sm text-slate-500">Pessoas que tentaram entrar sem cadastro e pediram acesso pela tela de login.</p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      <ul className="mt-3 divide-y divide-slate-100">
        {requests.map(request => (
          <li key={request.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{request.name}</p>
              <p className="text-xs text-slate-500">
                {request.email} ·{' '}
                {request.verified ? (
                  <span className="text-success">e-mail confirmado pelo Google</span>
                ) : (
                  <span className="text-warning">e-mail digitado, não confirmado</span>
                )}{' '}
                · {formatTimestamp(request.updatedAt)}
              </p>
              {request.message && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">“{request.message}”</p>}
            </div>
            <div data-tour="config-request-actions" className="flex items-center gap-2">
              <button type="button" className="button" disabled={!!busy} onClick={() => act(request, 'register')}>
                {busy === request.id ? 'Salvando…' : 'Cadastrar'}
              </button>
              <button type="button" className="button-ghost" disabled={!!busy} onClick={() => act(request, 'dismiss')}>
                Dispensar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      data-tour="config-invite"
      className="panel p-5"
      onSubmit={async e => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        try {
          const res = await fetch('/api/admin/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, role }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? 'Não foi possível cadastrar.');
          // Sucesso vai para o toast: o formulário limpa e o aviso não fica preso embaixo dele.
          toast({
            title: `${body.email} cadastrado.`,
            description: 'Avise a pessoa para entrar com a conta Google desse e-mail; nenhum e-mail é enviado.',
            tone: 'success',
          });
          setEmail('');
          setName('');
          onDone();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <UserPlus size={16} className="text-primary" aria-hidden />
        Cadastrar usuário
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Só entra quem foi cadastrado aqui. A pessoa entra com a conta Google do mesmo e-mail; nenhum e-mail é enviado. O acesso às obras é
        liberado abaixo.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-xs font-semibold text-slate-600">
          <span className="mb-1.5 block">E-mail</span>
          <input
            className="field w-72"
            type="email"
            required
            placeholder="nome@atrincorporadora.com.br"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          <span className="mb-1.5 block">Nome (opcional)</span>
          <input className="field w-56" value={name} onChange={e => setName(e.target.value)} />
        </label>
        <label data-tour="config-invite-role" className="block text-xs font-semibold text-slate-600">
          <span className="mb-1.5 block">Papel</span>
          <select className="field w-40" value={role} onChange={e => setRole(e.target.value)}>
            {(['viewer', 'planner', 'manager', 'admin'] as const).map(r => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </label>
        <button className="button" type="submit" disabled={busy}>
          <Mail size={15} aria-hidden />
          {busy ? 'Cadastrando…' : 'Cadastrar'}
        </button>
      </div>
      {error && (
        <div className="mt-3">
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        </div>
      )}
    </form>
  );
}

/** O que `GET /api/health` devolve: cada migração conhecida e se o banco já a tem. */
type Health = {
  checkedAt: string;
  summary: { total: number; applied: number; missing: string[]; criticalMissing: string[] };
  migrations: { migration: string; label: string; effect: string; critical: boolean; applied: boolean; detail?: string }[];
};

/** Estado do banco para o administrador. As migrações são aplicadas à mão no painel do Supabase e
 * não deixam registro, então a tela pergunta ao banco o que existe e lista o que falta — com o
 * efeito de cada ausência, para o admin saber se é "nada carrega" ou "só o 3D". */
function DatabaseHealth() {
  const [health, setHealth] = useState<Health>();
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(true);
  const check = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/health', { cache: 'no-store', signal });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível consultar o banco.');
      setHealth(body as Health);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o banco.');
    } finally {
      if (!signal?.aborted) setChecking(false);
    }
  }, []);
  // Consulta ao montar; a verificação é abortada se o admin sair da tela antes da resposta.
  useEffect(() => {
    const controller = new AbortController();
    check(controller.signal);
    return () => controller.abort();
  }, [check]);

  const missing = health?.migrations.filter(m => !m.applied) ?? [];
  const critical = missing.filter(m => m.critical);
  const optional = missing.filter(m => !m.critical);

  return (
    <section data-tour="config-db" aria-labelledby="db-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="db-title" className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <Database size={16} className="text-primary" aria-hidden />
          Banco de dados
        </h2>
        <button data-tour="config-db-refresh" type="button" className="button-ghost" disabled={checking} onClick={() => check()}>
          <RefreshCw size={15} aria-hidden className={checking ? 'animate-spin' : ''} />
          {checking ? 'Verificando…' : 'Verificar de novo'}
        </button>
      </div>
      <div className="panel p-5">
        {error && (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        )}
        {!health && !error && (
          <div role="status" aria-label="Consultando o banco" className="space-y-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="skeleton h-4" style={{ width: `${55 + i * 10}%` }} />
            ))}
          </div>
        )}
        {health && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong className="font-semibold text-slate-800">
                {health.summary.applied} de {health.summary.total}
              </strong>{' '}
              migrações aplicadas · verificado em {formatTimestamp(health.checkedAt)}.
            </p>
            {critical.length > 0 && (
              <Callout tone="danger" role="alert">
                <strong className="font-semibold">
                  {critical.length === 1 ? 'Migração crítica faltando.' : `${critical.length} migrações críticas faltando.`}
                </strong>{' '}
                Sem elas as telas não carregam — aplique no painel do Supabase antes de qualquer outra coisa.
                {critical.map(m => (
                  <span key={m.migration} className="mt-1 block">
                    <code className="text-xs">{m.migration}</code> · {m.label} — {m.effect}
                  </span>
                ))}
              </Callout>
            )}
            {optional.length > 0 && (
              <Callout tone="warning" role="status">
                <strong className="font-semibold">
                  {optional.length === 1 ? 'Migração opcional faltando.' : `${optional.length} migrações opcionais faltando.`}
                </strong>{' '}
                O sistema funciona, mas a funcionalidade correspondente fica indisponível.
                {optional.map(m => (
                  <span key={m.migration} className="mt-1 block">
                    <code className="text-xs">{m.migration}</code> · {m.label} — {m.effect}
                  </span>
                ))}
              </Callout>
            )}
            {missing.length === 0 && (
              <Callout tone="success" role="status">
                Todas as migrações conhecidas estão aplicadas.
              </Callout>
            )}
            <div className="overflow-x-auto custom-scrollbar" role="region" aria-label="Migrações do banco" tabIndex={0}>
              <table className="data-table min-w-[640px]">
                <thead>
                  <tr>
                    <th scope="col">Situação</th>
                    <th scope="col">Migração</th>
                    <th scope="col">O que faz</th>
                    <th scope="col">Sem ela</th>
                  </tr>
                </thead>
                <tbody>
                  {health.migrations.map(m => {
                    // Faltando crítica é perigo; faltando opcional é aviso; aplicada é sucesso. Sempre com o texto.
                    const pill = m.applied
                      ? 'border-success-ring bg-success-soft text-success'
                      : m.critical
                        ? 'border-danger-ring bg-danger-soft text-danger'
                        : 'border-warning-ring bg-warning-soft text-warning';
                    return (
                      <tr key={m.migration}>
                        <td>
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${pill}`}
                          >
                            {m.applied ? 'Aplicada' : m.critical ? 'Faltando · crítica' : 'Faltando'}
                          </span>
                          {m.detail && <span className="mt-1 block text-xs text-warning">{m.detail}</span>}
                        </td>
                        <th scope="row">
                          <code className="text-xs font-semibold">{m.migration}</code>
                        </th>
                        <td>{m.label}</td>
                        <td className="text-xs">{m.effect}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function SettingsManager() {
  const [emails, setEmails] = useState<Record<string, string>>({});
  // Cadastrar pelo formulário também aprova o pedido do mesmo e-mail: a lista de pedidos relê.
  const [requestsKey, setRequestsKey] = useState(0);
  const loadEmails = () =>
    fetch('/api/admin/users', { cache: 'no-store' })
      .then(r => r.json())
      .then(b => setEmails(b.emails ?? {}))
      .catch(() => {});
  useEffect(() => {
    loadEmails();
  }, []);

  const c = usePlanning();
  // Takt e início da sequência são dos vagões, ainda em desenvolvimento; usuários e acessos ficam abertos.
  const developer = useDeveloper();
  if (c.state !== 'ready') return <LoadState error={c.state === 'error'} />;
  const { data } = c.planning;
  const actor = data.users.find(u => u.id === c.actorId);
  if (actor?.role !== 'admin')
    return (
      <div data-tour="config-restrito" className="panel p-6">
        <Empty>Acesso restrito a administradores.</Empty>
      </div>
    );

  return (
    <div className="space-y-8">
      {developer && (
        <section aria-labelledby="takt-title">
          <h2 id="takt-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
            <Timer size={16} className="text-primary" aria-hidden />
            Takt por obra
          </h2>
          <div data-tour="config-takt" className="panel divide-y divide-slate-100">
            {data.works.length === 0 && (
              <div className="p-5">
                <Empty>Nenhuma obra cadastrada.</Empty>
              </div>
            )}
            {data.works.map(work => {
              const sequences = data.sequences.filter(s => s.workId === work.id);
              return (
                <div key={work.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{work.name}</p>
                    <p className="text-xs text-slate-400">{work.code}</p>
                  </div>
                  <div className="space-y-2">
                    {sequences.length === 0 ? (
                      <p className="text-xs text-slate-400">Nenhuma sequência cadastrada</p>
                    ) : (
                      sequences.map(s => (
                        <div key={s.id} className="flex flex-wrap items-center gap-3">
                          <span className="text-xs text-slate-500">{s.name}</span>
                          <TaktField sequenceId={s.id} taktDays={s.defaultTaktDays} />
                          <span className="text-xs text-slate-400">início do 1º vagão (até liberar)</span>
                          <StartDateField sequenceId={s.id} startDate={s.startDate} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="users-title">
        <h2 id="users-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
          <Users size={16} className="text-primary" aria-hidden />
          Usuários e acessos
        </h2>
        <AccessRequests
          refreshKey={requestsKey}
          onRegistered={() => {
            c.refresh();
            loadEmails();
          }}
        />
        <div className="mb-4">
          <InviteForm
            onDone={() => {
              c.refresh();
              loadEmails();
              setRequestsKey(k => k + 1);
            }}
          />
        </div>
        {/* As marcas do tour de cada linha (papel, excluir, células) se repetem em todas; o tour destaca a
            primeira que aparece — a de excluir, portanto, nunca na sua própria linha. */}
        <UsersTable
          users={data.users}
          works={data.works}
          emails={emails}
          actorId={c.actorId}
          onDeleted={() => {
            c.refresh();
            loadEmails();
          }}
        />
      </section>

      <DatabaseHealth />
    </div>
  );
}

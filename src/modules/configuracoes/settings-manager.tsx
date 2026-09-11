'use client';
import { useEffect, useState } from 'react';
import { Check, Mail, Timer, Trash2, UserPlus, Users } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Empty, LoadState } from '@/modules/planejamento/ui';
import { roleLabels } from '@/shared/format';
import type { Command } from '@/application/use-cases/commands';

function useCommand() {
  const c = usePlanning();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (command: Command) => {
    if (c.state !== 'ready' || busy) return;
    setBusy(true); setError('');
    try { await c.execute(command); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar.'); }
    finally { setBusy(false); }
  };
  return { busy, error, run };
}

function AccessChip({ userId, workId, name, granted }: { userId: string; workId: string; name: string; granted: boolean }) {
  const { busy, run } = useCommand();
  return <button type="button" disabled={busy} onClick={() => run({ type: granted ? 'revoke_access' : 'grant_access', userId, workId })}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${granted ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
    {granted && <Check size={12} />}{name}
  </button>;
}

function RoleSelect({ userId, role, self }: { userId: string; role: string; self: boolean }) {
  const { busy, error, run } = useCommand();
  return <div>
    <select className="field w-auto py-1.5 text-xs" value={role} disabled={busy || self}
      onChange={e => run({ type: 'set_role', userId, role: e.target.value as 'viewer' | 'planner' | 'manager' | 'admin' })}>
      {(['viewer', 'planner', 'manager', 'admin'] as const).map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
    </select>
    {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
  </div>;
}

function TaktField({ sequenceId, taktDays }: { sequenceId: string; taktDays: number }) {
  const { busy, error, run } = useCommand();
  const [value, setValue] = useState(String(taktDays));
  const dirty = value !== String(taktDays);
  return <div className="flex items-center gap-2">
    <input className="field w-20 py-1.5 text-sm" type="number" min={1} max={365} value={value} onChange={e => setValue(e.target.value)} />
    <span className="text-xs text-slate-400">dias</span>
    {dirty && <button className="button px-3 py-1.5 text-xs" disabled={busy} onClick={() => run({ type: 'set_takt', sequenceId, taktDays: Number(value) })}>Salvar</button>}
    {error && <span className="text-xs text-rose-600">{error}</span>}
  </div>;
}

function StartDateField({ sequenceId, startDate }: { sequenceId: string; startDate?: string }) {
  const { busy, error, run } = useCommand();
  const [value, setValue] = useState(startDate ?? '');
  const dirty = value !== (startDate ?? '');
  return <div data-tour="config-start-date" className="flex items-center gap-2">
    <input className="field w-36 py-1.5 text-sm" type="date" value={value} onChange={e => setValue(e.target.value)} />
    {dirty && <button className="button px-3 py-1.5 text-xs" disabled={busy} onClick={() => run({ type: 'set_sequence_start', sequenceId, startDate: value || null })}>Salvar</button>}
    {error && <span className="text-xs text-rose-600">{error}</span>}
  </div>;
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  return <form data-tour="config-invite" className="panel p-5" onSubmit={async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const res = await fetch('/api/admin/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name, role }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Não foi possível convidar.');
      setMessage(`Convite enviado para ${body.email}. Ele também pode entrar direto com a conta Google.`);
      setEmail(''); setName(''); onDone();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível convidar.'); }
    finally { setBusy(false); }
  }}>
    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><UserPlus size={16} className="text-blue-600" />Convidar usuário</h2>
    <p className="mt-1 text-sm text-slate-500">Envia um convite por e-mail e já cria o perfil com o papel escolhido. O acesso às obras é liberado abaixo.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">E-mail</span>
        <input className="field w-72" type="email" required placeholder="nome@atrincorporadora.com.br" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Nome (opcional)</span>
        <input className="field w-56" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Papel</span>
        <select className="field w-40" value={role} onChange={e => setRole(e.target.value)}>
          {(['viewer', 'planner', 'manager', 'admin'] as const).map(r => <option key={r} value={r}>{roleLabels[r]}</option>)}
        </select></label>
      <button className="button" type="submit" disabled={busy}><Mail size={15} />{busy ? 'Enviando…' : 'Enviar convite'}</button>
    </div>
    {error && <p className="callout callout-danger mt-3" role="alert">{error}</p>}
    {message && <p className="callout callout-success mt-3" role="status">{message}</p>}
  </form>;
}

function DeleteUserButton({ userId, name, onDone }: { userId: string; name: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div>
    <button type="button" disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
      onClick={async () => {
        if (!confirm(`Excluir ${name}? Essa ação não pode ser desfeita — a pessoa perde o acesso e precisa ser convidada de novo.`)) return;
        setBusy(true); setError('');
        try {
          const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? 'Não foi possível excluir.');
          onDone();
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir.'); }
        finally { setBusy(false); }
      }}>
      <Trash2 size={13} />{busy ? 'Excluindo…' : 'Excluir'}
    </button>
    {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
  </div>;
}

export function SettingsManager() {
  const [emails, setEmails] = useState<Record<string, string>>({});
  const loadEmails = () => fetch('/api/admin/users', { cache: 'no-store' }).then(r => r.json()).then(b => setEmails(b.emails ?? {})).catch(() => {});
  useEffect(() => { loadEmails(); }, []);

  const c = usePlanning();
  if (c.state !== 'ready') return <LoadState error={c.state === 'error'} />;
  const { data } = c.planning;
  const actor = data.users.find(u => u.id === c.actorId);
  if (actor?.role !== 'admin') return <div className="panel p-6"><Empty>Acesso restrito a administradores.</Empty></div>;

  return <div className="space-y-8">
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Timer size={16} className="text-blue-600" />Takt por obra</h2>
      <div data-tour="config-takt" className="panel divide-y divide-slate-100">
        {data.works.length === 0 && <div className="p-5"><Empty>Nenhuma obra cadastrada.</Empty></div>}
        {data.works.map(work => {
          const sequences = data.sequences.filter(s => s.workId === work.id);
          return <div key={work.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{work.name}</p>
              <p className="text-xs text-slate-400">{work.code}</p>
            </div>
            <div className="space-y-2">
              {sequences.length === 0
                ? <p className="text-xs text-slate-400">Nenhuma sequência cadastrada</p>
                : sequences.map(s => <div key={s.id} className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-slate-500">{s.name}</span>
                    <TaktField sequenceId={s.id} taktDays={s.defaultTaktDays} />
                    <span className="text-xs text-slate-400">início do 1º vagão (até liberar)</span>
                    <StartDateField sequenceId={s.id} startDate={s.startDate} />
                  </div>)}
            </div>
          </div>;
        })}
      </div>
    </section>

    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800"><Users size={16} className="text-blue-600" />Usuários e acessos</h2>
      <div className="mb-4"><InviteForm onDone={() => { c.refresh(); loadEmails(); }} /></div>
      <div data-tour="config-users" className="panel divide-y divide-slate-100">
        {data.users.map(user => (
          <div key={user.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                <p className="text-xs text-slate-400">{emails[user.id] ?? '—'}</p>
              </div>
              <div className="flex items-center gap-2">
                <RoleSelect userId={user.id} role={user.role} self={user.id === c.actorId} />
                {user.id !== c.actorId && <DeleteUserButton userId={user.id} name={user.name} onDone={() => { c.refresh(); loadEmails(); }} />}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.works.length === 0
                ? <span className="text-xs text-slate-400">Nenhuma obra para liberar</span>
                : data.works.map(work => <AccessChip key={work.id} userId={user.id} workId={work.id} name={work.name} granted={user.workIds.includes(work.id)} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  </div>;
}

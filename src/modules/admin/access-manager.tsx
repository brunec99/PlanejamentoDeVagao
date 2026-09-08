'use client';
import { useState } from 'react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Empty, LoadState } from '@/modules/planejamento/ui';
import { roleLabels } from '@/shared/format';

function AccessChip({ userId, workId, name, granted }: { userId: string; workId: string; name: string; granted: boolean }) {
  const c = usePlanning();
  const [busy, setBusy] = useState(false);
  if (c.state !== 'ready') return null;
  return <button type="button" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await c.execute({ type: granted ? 'revoke_access' : 'grant_access', userId, workId }); }
    finally { setBusy(false); }
  }} className="badge-muted disabled:opacity-50" style={granted ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
    {name}{granted ? ' ✓' : ''}
  </button>;
}

export function AccessManager() {
  const c = usePlanning();
  if (c.state !== 'ready') return <LoadState error={c.state === 'error'} />;
  const { data } = c.planning;
  const actor = data.users.find(u => u.id === c.actorId);
  if (actor?.role !== 'admin') return <div className="panel p-6"><Empty>Acesso restrito a administradores.</Empty></div>;
  if (data.users.length === 0) return <div className="panel p-6"><Empty>Nenhum usuário provisionado ainda.</Empty></div>;
  return <div className="space-y-4">{data.users.map(user => (
    <div key={user.id} className="panel p-5">
      <p className="font-semibold">{user.name}</p>
      <p className="text-sm text-[var(--ink-muted)]">{roleLabels[user.role]}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {data.works.length === 0
          ? <Empty>Nenhuma obra cadastrada ainda.</Empty>
          : data.works.map(work => <AccessChip key={work.id} userId={user.id} workId={work.id} name={work.name} granted={user.workIds.includes(work.id)} />)}
      </div>
    </div>
  ))}</div>;
}

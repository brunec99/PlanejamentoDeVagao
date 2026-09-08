import { AccessManager } from '@/modules/admin/access-manager';
export const metadata = { title: 'Administração' };
export default function AdminPage() {
  return <><p className="eyebrow">Administração</p><h1 className="page-title">Acesso às obras</h1><p className="mt-2 text-[13.5px] text-[var(--ink-muted)]">Conceda ou retire o acesso de cada usuário às obras.</p><div className="mt-8"><AccessManager /></div></>;
}

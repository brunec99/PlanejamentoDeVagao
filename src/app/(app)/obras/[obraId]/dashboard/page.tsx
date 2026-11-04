import { DashboardOverview } from '@/modules/dashboard/dashboard-overview';

export const metadata = { title: 'Dashboard da obra' };

/** Aba 0 (04/11/2026): aberta a todo papel com a obra liberada; dentro dela, cada quadro segue o acesso
 * ao módulo de origem, decidido no cliente pelo mesmo `hasSectionAccess` das abas. */
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <DashboardOverview workId={obraId} />;
}

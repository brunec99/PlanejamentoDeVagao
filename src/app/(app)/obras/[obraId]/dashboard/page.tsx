import { DashboardOverview } from '@/modules/dashboard/dashboard-overview';
import { parsePeriodParams } from '@/modules/dashboard/period';

export const metadata = { title: 'Dashboard da obra' };

/** Aba 0 (04/11/2026): aberta a todo papel com a obra liberada; dentro dela, cada quadro segue o acesso
 * ao módulo de origem, decidido no cliente pelo mesmo `hasSectionAccess` das abas. A escala e o período
 * podem vir na URL (escalas de tempo, 04/11/2026): é assim que o Dashboard geral abre a aba 0 no mesmo
 * período, e o link antigo com `semana=` continua abrindo na escala semanal. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ obraId }, raw] = await Promise.all([params, searchParams]);
  return <DashboardOverview workId={obraId} initial={parsePeriodParams(raw)} />;
}

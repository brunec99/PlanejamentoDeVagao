import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { PlanningProvider } from '@/modules/planejamento/planning-provider';
import { DashboardPrint } from '@/modules/dashboard/dashboard-print';
import { parseDashboardParams } from '@/modules/dashboard/model';

export const metadata = { title: 'Dashboard da obra' };

/** Fora do layout do sistema (sem lateral nem cabeçalho) para imprimir só as folhas do dashboard. O login
 * segue exigido pelo proxy. Os módulos liberados vão ao provedor como no layout da aplicação: sem eles, o
 * PDF esconderia os quadros em desenvolvimento até de quem pode abri-los. Os filtros vêm da URL. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ obraId }, raw] = await Promise.all([params, searchParams]);
  const { developer, modules } = await getRouteAccess();
  return (
    <PlanningProvider developer={developer} modules={modules}>
      <DashboardPrint workId={obraId} filters={parseDashboardParams(raw)} />
    </PlanningProvider>
  );
}

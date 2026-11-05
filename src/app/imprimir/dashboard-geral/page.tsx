import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { PlanningProvider } from '@/modules/planejamento/planning-provider';
import { PortfolioPrint } from '@/modules/dashboard/portfolio/portfolio-print';
import { parsePortfolioParams } from '@/modules/dashboard/portfolio/params';

export const metadata = { title: 'Dashboard geral' };

/** O PDF do Dashboard geral (regra 14 do modelo de 04/11/2026), fora do layout do sistema, como o da aba 0:
 * o login segue exigido pelo proxy, os módulos liberados vão ao provedor e os filtros vêm da URL. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [raw, { developer, modules }] = await Promise.all([searchParams, getRouteAccess()]);
  return (
    <PlanningProvider developer={developer} modules={modules}>
      <PortfolioPrint params={parsePortfolioParams(raw)} />
    </PlanningProvider>
  );
}

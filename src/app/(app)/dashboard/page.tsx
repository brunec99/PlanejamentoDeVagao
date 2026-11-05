import { PortfolioOverview } from '@/modules/dashboard/portfolio/portfolio-overview';
import { parsePortfolioParams } from '@/modules/dashboard/portfolio/params';

export const metadata = { title: 'Dashboard geral' };

/** Dashboard geral (04/11/2026, modelo aprovado "Dashboard geral e escalas de tempo"): fora das obras, os
 * quadros do dashboard para todas as obras liberadas para a pessoa, comparadas no período escolhido. Cada
 * pessoa vê só as próprias obras e os quadros dos módulos que pode abrir (decidido no cliente pelo mesmo
 * `hasSectionAccess` das abas). Escala, período, obras e quadros vêm da URL, para o link reproduzir a visão. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  return <PortfolioOverview initial={parsePortfolioParams(raw)} />;
}

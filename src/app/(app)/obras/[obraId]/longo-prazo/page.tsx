import { BaselinesOverview } from '@/modules/longo-prazo/baselines-overview';
import { LineOfBalance } from '@/modules/longo-prazo/line-of-balance';
import { SCurve } from '@/modules/longo-prazo/s-curve';
import { RestrictionsBoard } from '@/modules/longo-prazo/restrictions-board';
import { TabHeader } from '@/modules/layout/tab-header';
export const metadata = { title: 'Cronograma de longo prazo' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <>
    <TabHeader workId={obraId} section="longo-prazo" description="Linha de Balanço da obra e o módulo de restrições que precisam ser removidas antes de cada frente começar." />
    <LineOfBalance workId={obraId} />
    <RestrictionsBoard workId={obraId} />
    <SCurve workId={obraId} />
    <BaselinesOverview workId={obraId} />
  </>;
}

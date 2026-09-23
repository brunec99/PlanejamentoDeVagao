import { LookAheadOverview } from '@/modules/medio-prazo/look-ahead-overview';
import { ResourceAnalysis } from '@/modules/medio-prazo/resource-analysis';
import { BaselineDelays } from '@/modules/medio-prazo/baseline-delays';
export const metadata = { title: 'Cronograma de médio prazo' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <><LookAheadOverview workId={obraId} /><ResourceAnalysis workId={obraId} /><BaselineDelays workId={obraId} /></>;
}

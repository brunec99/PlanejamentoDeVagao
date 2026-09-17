import { BaselinesOverview } from '@/modules/longo-prazo/baselines-overview';
import { LineOfBalance } from '@/modules/longo-prazo/line-of-balance';
export const metadata = { title: 'Planejamento de longo prazo' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <><BaselinesOverview workId={obraId} /><LineOfBalance workId={obraId} /></>;
}

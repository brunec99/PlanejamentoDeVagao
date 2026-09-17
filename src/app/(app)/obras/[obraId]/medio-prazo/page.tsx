import { LookAheadOverview } from '@/modules/medio-prazo/look-ahead-overview';
export const metadata = { title: 'Planejamento de médio prazo' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) { const { obraId } = await params; return <LookAheadOverview workId={obraId} />; }

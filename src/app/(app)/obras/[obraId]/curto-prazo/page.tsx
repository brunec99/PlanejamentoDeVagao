import { CommitmentsOverview } from '@/modules/curto-prazo/commitments-overview';
export const metadata = { title: 'Cronograma de curto prazo' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) { const { obraId } = await params; return <CommitmentsOverview workId={obraId} />; }

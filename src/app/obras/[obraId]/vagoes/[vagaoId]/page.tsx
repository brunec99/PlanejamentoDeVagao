import { WagonDetail } from '@/modules/planejamento/wagon-detail';
export const metadata = { title: 'Detalhe do vagão' };
export default async function Page({ params }: { params: Promise<{ obraId: string; vagaoId: string }> }) { const { obraId, vagaoId } = await params; return <WagonDetail workId={obraId} wagonId={vagaoId} />; }

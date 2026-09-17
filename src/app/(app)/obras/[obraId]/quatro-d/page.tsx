import { FourDOverview } from '@/modules/quatro-d/four-d-overview';
export const metadata = { title: 'BIM 4D' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) { const { obraId } = await params; return <FourDOverview workId={obraId} />; }

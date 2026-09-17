import { PlanningOverview } from '@/modules/planejamento/planning-overview';
export const metadata = { title: 'Planejamento' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) { const { obraId } = await params; return <PlanningOverview workId={obraId} />; }

import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { PlanningOverview } from '@/modules/planejamento/planning-overview';

export const metadata = { title: 'Planejamento por vagões' };

export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  // Módulo em desenvolvimento: o proxy já desvia quem não desenvolve; a página confere de novo.
  const { developer } = await getRouteAccess();
  if (!developer) redirect(`/obras/${encodeURIComponent(obraId)}/curto-prazo`);
  return <PlanningOverview workId={obraId} />;
}

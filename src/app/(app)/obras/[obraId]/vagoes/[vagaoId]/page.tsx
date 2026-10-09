import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { WagonDetail } from '@/modules/planejamento/wagon-detail';

export const metadata = { title: 'Detalhe do vagão' };

export default async function Page({ params }: { params: Promise<{ obraId: string; vagaoId: string }> }) {
  const { obraId, vagaoId } = await params;
  // Módulo em desenvolvimento: o proxy já desvia quem não desenvolve; a página confere de novo.
  const { developer } = await getRouteAccess();
  if (!developer) redirect(`/obras/${encodeURIComponent(obraId)}/curto-prazo`);
  return <WagonDetail workId={obraId} wagonId={vagaoId} />;
}

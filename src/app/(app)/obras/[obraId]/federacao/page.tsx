import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { FederationOverview } from '@/modules/federacao/federation-overview';
export const metadata = { title: 'Modelo federado' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  // Módulo em desenvolvimento: o proxy já desvia quem não desenvolve; a página confere de novo.
  const { developer } = await getRouteAccess();
  if (!developer) redirect(`/obras/${encodeURIComponent(obraId)}/curto-prazo`);
  return <FederationOverview key={obraId} workId={obraId} />;
}

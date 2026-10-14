import { hasSectionAccess } from '@/application/module-access';
import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { PrevisionImport } from '@/modules/integracoes/prevision';
export const metadata = { title: 'Integrações' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  // Módulo em desenvolvimento: o proxy já desvia quem não desenvolve; a página confere de novo.
  const access = await getRouteAccess();
  if (!hasSectionAccess('importar', access)) redirect(`/obras/${encodeURIComponent(obraId)}/curto-prazo`);
  return <PrevisionImport workId={obraId} />;
}

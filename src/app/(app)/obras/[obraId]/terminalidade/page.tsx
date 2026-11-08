import { redirect } from 'next/navigation';
import { hasSectionAccess } from '@/application/module-access';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { TerminalityOverview } from '@/modules/terminalidade/terminality-overview';
export const metadata = { title: 'Terminalidade' };
/** Liberada por pessoa desde 08/11/2026: o proxy já desvia quem não tem o módulo; a página confere de novo. */
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  if (!hasSectionAccess('terminalidade', await getRouteAccess())) redirect(`/obras/${encodeURIComponent(obraId)}/dashboard`);
  return <TerminalityOverview workId={obraId} />;
}

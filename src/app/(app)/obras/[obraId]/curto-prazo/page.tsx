import { redirect } from 'next/navigation';
import { hasSectionAccess } from '@/application/module-access';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { CurtoPrazoSections } from '@/modules/curto-prazo/curto-prazo-sections';
export const metadata = { title: 'Cronograma de curto prazo' };
/** Página magra: a seção (`?secao=`, planilha ou fechamento) é lida no cliente, em
 * `CurtoPrazoSections`, para a troca entre as duas não voltar à função no servidor. Liberada por pessoa desde
 * 08/11/2026: o proxy já desvia quem não tem o módulo; a página confere de novo. */
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  if (!hasSectionAccess('curto-prazo', await getRouteAccess())) redirect(`/obras/${encodeURIComponent(obraId)}/dashboard`);
  return <CurtoPrazoSections workId={obraId} />;
}

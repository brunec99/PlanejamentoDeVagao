import { redirect } from 'next/navigation';
import { hasSectionAccess } from '@/application/module-access';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { PendingBoard } from '@/modules/pendencias/pending-board';

export const metadata = { title: 'Quadro de Restrições' };

/** Aba 1.4, Quadro de Restrições (12/11/2026): o quadro Kanban que nasceu em 10/11/2026 como a visão "Lista
 * de pendência" da antiga aba 2. Ganhou item próprio no menu e módulo próprio (`restricoes`). `?card=<id>`
 * já abre o card (é o link dos e-mails de menção). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<{ card?: string | string[] }>;
}) {
  const { obraId } = await params;
  // O proxy já desvia quem não tem o módulo; a página confere de novo.
  if (!hasSectionAccess('restricoes', await getRouteAccess())) redirect(`/obras/${encodeURIComponent(obraId)}/dashboard`);
  const { card } = await searchParams;
  return <PendingBoard workId={obraId} initialCardId={typeof card === 'string' && card ? card : undefined} />;
}

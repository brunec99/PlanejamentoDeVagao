import { hasSectionAccess } from '@/application/module-access';
import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { PlanningOverview } from '@/modules/planejamento/planning-overview';
import { PendingBoard } from '@/modules/pendencias/pending-board';
import { PendingViewSwitch } from '@/modules/pendencias/parts';

export const metadata = { title: 'Planejamento de vagão e lista de pendência' };

/** Aba 2 (10/11/2026, modelo aprovado da lista de pendência, regra 1): duas visões. "Vagões" é a tela de
 * sempre e continua a padrão; "Lista de pendência" é o quadro Kanban. O endereço guarda a visão em
 * `?visao=pendencias`, e `?card=<id>` já abre o card (é o link dos e-mails de menção). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<{ visao?: string | string[]; card?: string | string[] }>;
}) {
  const { obraId } = await params;
  // Módulo em desenvolvimento: o proxy já desvia quem não desenvolve; a página confere de novo.
  const access = await getRouteAccess();
  if (!hasSectionAccess('vagoes', access)) redirect(`/obras/${encodeURIComponent(obraId)}/dashboard`);
  const { visao, card } = await searchParams;
  if (visao === 'pendencias') return <PendingBoard workId={obraId} initialCardId={typeof card === 'string' && card ? card : undefined} />;
  return <PlanningOverview workId={obraId} switcher={<PendingViewSwitch workId={obraId} view="vagoes" />} />;
}

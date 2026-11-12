import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { hasSectionAccess } from '@/application/module-access';
import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { PlanningOverview } from '@/modules/planejamento/planning-overview';
import { workPath } from '@/shared/format';

export const metadata = { title: 'Planejamento de vagão' };

/** Planejamento de vagão (a antiga aba 2). Desde 12/11/2026 não tem item no menu: abre pelo botão
 * "Planejamento de vagão" do longo prazo (1.1), e o quadro Kanban que era a segunda visão daqui virou a aba
 * 1.4, Quadro de Restrições (`/restricoes`). O endereço antigo `?visao=pendencias` (com `&card=`, o link dos
 * e-mails já enviados) redireciona para lá; quem não tem o módulo novo cai no dashboard pela própria página. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<{ visao?: string | string[]; card?: string | string[] }>;
}) {
  const { obraId } = await params;
  const { visao, card } = await searchParams;
  if (visao === 'pendencias')
    redirect(`${workPath(obraId, 'restricoes')}${typeof card === 'string' && card ? `?card=${encodeURIComponent(card)}` : ''}`);
  const access = await getRouteAccess();
  if (!hasSectionAccess('vagoes', access)) redirect(`/obras/${encodeURIComponent(obraId)}/dashboard`);
  const back = hasSectionAccess('longo-prazo', access) ? (
    <Link className="text-link inline-flex items-center gap-1 text-sm" href={workPath(obraId, 'longo-prazo')}>
      <ArrowLeft size={15} aria-hidden />
      Cronograma de longo prazo
    </Link>
  ) : undefined;
  return <PlanningOverview workId={obraId} switcher={back} />;
}

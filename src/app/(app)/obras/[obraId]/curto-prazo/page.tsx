import { CommitmentsOverview } from '@/modules/curto-prazo/commitments-overview';
import { ClosingOverview } from '@/modules/curto-prazo/closing-overview';
import { isCurtoSection } from '@/modules/curto-prazo/section-nav';
export const metadata = { title: 'Cronograma de curto prazo' };
/** Duas seções na URL (`?secao=`): a planilha, sozinha na página, e o fechamento da semana. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<{ secao?: string }>;
}) {
  const [{ obraId }, { secao }] = await Promise.all([params, searchParams]);
  const section = isCurtoSection(secao) ? secao : 'planilha';
  return section === 'fechamento' ? <ClosingOverview workId={obraId} /> : <CommitmentsOverview workId={obraId} />;
}

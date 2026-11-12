import { HeadcountOverview } from '@/modules/histograma/headcount-overview';
export const metadata = { title: 'Histograma de mão de obra' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <HeadcountOverview workId={obraId} />;
}

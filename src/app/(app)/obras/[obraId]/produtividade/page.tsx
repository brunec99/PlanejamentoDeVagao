import { ProductionOverview } from '@/modules/produtividade/production-overview';
export const metadata = { title: 'Controle de produtividade' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <ProductionOverview workId={obraId} />;
}

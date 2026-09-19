import { FederationOverview } from '@/modules/federacao/federation-overview';
export const metadata = { title: 'Modelo federado' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <FederationOverview key={obraId} workId={obraId} />;
}

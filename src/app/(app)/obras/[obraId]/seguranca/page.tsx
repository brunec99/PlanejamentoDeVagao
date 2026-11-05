import { SafetyOverview } from '@/modules/seguranca/safety-overview';
export const metadata = { title: 'Segurança do trabalho' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <SafetyOverview workId={obraId} />;
}

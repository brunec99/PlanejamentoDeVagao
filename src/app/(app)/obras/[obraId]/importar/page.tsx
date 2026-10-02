import { PrevisionImport } from '@/modules/integracoes/prevision';
export const metadata = { title: 'Integrações' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <PrevisionImport workId={obraId} />;
}

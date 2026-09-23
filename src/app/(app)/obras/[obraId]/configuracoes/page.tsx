import { WorkResources } from '@/modules/configuracoes/work-resources';

export const metadata = { title: 'Configurações da obra · Recursos' };

export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <WorkResources key={obraId} workId={obraId} />;
}

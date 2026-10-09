import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { ModelsOverview } from '@/modules/ifc/models-overview';
import { IfcQuantities } from '@/modules/ifc/quantities';
import { ModelViewer } from '@/modules/ifc/model-viewer';
export const metadata = { title: 'Arquivos IFC' };
// O cabeçalho da tela vive em ModelsOverview, o primeiro painel: o código e o nome da obra vêm do
// planejamento carregado no cliente, que esta página (servidor) não tem.
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  // Módulo em desenvolvimento: o proxy já desvia quem não desenvolve; a página confere de novo.
  const { developer } = await getRouteAccess();
  if (!developer) redirect(`/obras/${encodeURIComponent(obraId)}/curto-prazo`);
  return (
    <>
      <ModelsOverview workId={obraId} />
      <IfcQuantities workId={obraId} />
      <ModelViewer workId={obraId} />
    </>
  );
}

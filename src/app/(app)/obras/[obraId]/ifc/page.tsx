import { ModelsOverview } from '@/modules/ifc/models-overview';
import { IfcQuantities } from '@/modules/ifc/quantities';
import { ModelViewer } from '@/modules/ifc/model-viewer';
import { LinkRules } from '@/modules/ifc/link-rules';
export const metadata = { title: 'Arquivos IFC' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <><ModelsOverview workId={obraId} /><IfcQuantities workId={obraId} /><ModelViewer workId={obraId} /><LinkRules workId={obraId} /></>;
}

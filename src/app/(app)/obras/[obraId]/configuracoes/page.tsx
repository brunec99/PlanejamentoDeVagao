import { WorkResources } from '@/modules/configuracoes/work-resources';
import { WeekNumbering } from '@/modules/configuracoes/week-numbering';

export const metadata = { title: 'Configurações da obra' };

export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <div className="space-y-6"><WorkResources key={obraId} workId={obraId} /><WeekNumbering key={`semana-${obraId}`} workId={obraId} /></div>;
}

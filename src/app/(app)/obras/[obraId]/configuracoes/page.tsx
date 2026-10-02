import { WorkResources, WorkSettingsHeader } from '@/modules/configuracoes/work-resources';
import { WeekNumbering } from '@/modules/configuracoes/week-numbering';

export const metadata = { title: 'Configurações da obra' };

/** Um cabeçalho só para a página; abaixo dele, as duas seções: quem executa e a semana 1. */
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return (
    <div className="space-y-6">
      <WorkSettingsHeader key={`header-${obraId}`} workId={obraId} />
      <WorkResources key={obraId} workId={obraId} />
      <WeekNumbering key={`semana-${obraId}`} workId={obraId} />
    </div>
  );
}

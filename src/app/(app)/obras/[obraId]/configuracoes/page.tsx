import { WorkResources, WorkSettingsHeader } from '@/modules/configuracoes/work-resources';
import { WeekNumbering } from '@/modules/configuracoes/week-numbering';
import { WorkLocation } from '@/modules/configuracoes/work-location';
import { TerminalityCatalogs } from '@/modules/configuracoes/terminality-catalogs';
import { DeleteWork } from '@/modules/configuracoes/delete-work';

export const metadata = { title: 'Configurações da obra' };

/** Um cabeçalho só para a página; abaixo dele, as seções: quem executa, a semana 1, o local da obra
 * (previsão do tempo nos PDFs), os cadastros da terminalidade (pavimentos e unidades, tipos de
 * pendência e responsáveis ATR) e, só para administradores, a exclusão da obra. */
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return (
    <div className="space-y-6">
      <WorkSettingsHeader key={`header-${obraId}`} workId={obraId} />
      <WorkResources key={obraId} workId={obraId} />
      <WeekNumbering key={`semana-${obraId}`} workId={obraId} />
      <WorkLocation key={`local-${obraId}`} workId={obraId} />
      <TerminalityCatalogs key={`terminalidade-${obraId}`} workId={obraId} />
      <DeleteWork key={`excluir-${obraId}`} workId={obraId} />
    </div>
  );
}

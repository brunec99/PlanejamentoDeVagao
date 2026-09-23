import { BaselinesOverview } from '@/modules/longo-prazo/baselines-overview';
import { LineOfBalance } from '@/modules/longo-prazo/line-of-balance';
import { SCurve } from '@/modules/longo-prazo/s-curve';
import { RestrictionsBoard } from '@/modules/longo-prazo/restrictions-board';
import { TabHeader } from '@/modules/layout/tab-header';
import { Callout } from '@/modules/planejamento/ui';
import { workPath } from '@/shared/format';
export const metadata = { title: 'Cronograma de longo prazo' };
export default async function Page({ params }: { params: Promise<{ obraId: string }> }) {
  const { obraId } = await params;
  return <>
    <TabHeader workId={obraId} section="longo-prazo" description="Consulta do cronograma macro em Linha de Balanço, como base para identificar e tratar as restrições de cada frente." />
    {/* O cronograma de longo prazo é mantido no Prevision; aqui ele é só lido, para servir de base às restrições. */}
    <Callout tone="info">Por enquanto, o cronograma de longo prazo é mantido apenas no <strong>Prevision</strong>. Esta tela não edita o cronograma: ela mostra os dados importados de lá para apoiar a criação e o acompanhamento das restrições. Para trazer atividades novas ou atualizadas, use <a className="text-link" href={workPath(obraId, 'importar')}>Integrações</a>.</Callout>
    <LineOfBalance workId={obraId} />
    <RestrictionsBoard workId={obraId} />
    <SCurve workId={obraId} />
    <BaselinesOverview workId={obraId} />
  </>;
}

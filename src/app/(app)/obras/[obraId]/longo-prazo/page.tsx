import Link from 'next/link';
import { BaselinesOverview } from '@/modules/longo-prazo/baselines-overview';
import { LineOfBalance } from '@/modules/longo-prazo/line-of-balance';
import { SCurve } from '@/modules/longo-prazo/s-curve';
import { RestrictionsBoard } from '@/modules/longo-prazo/restrictions-board';
import { LongTermPlanner } from '@/modules/longo-prazo/planner/long-term-planner';
import { TabHeader } from '@/modules/layout/tab-header';
import { Callout } from '@/modules/planejamento/ui';
import { workPath } from '@/shared/format';
export const metadata = { title: 'Cronograma de longo prazo' };

const VIEWS = [
  { id: 'planejador', label: 'Planejador' },
  { id: 'prevision', label: 'Vagões e restrições' },
] as const;

export default async function Page({ params, searchParams }: { params: Promise<{ obraId: string }>; searchParams: Promise<{ visao?: string }> }) {
  const { obraId } = await params;
  const { visao } = await searchParams;
  const view = visao === 'prevision' ? 'prevision' : 'planejador';
  const base = workPath(obraId, 'longo-prazo');
  return <>
    <TabHeader workId={obraId} section="longo-prazo" description={view === 'planejador'
      ? 'Preenchimento do cronograma macro: fluxograma de serviços que se expande em Linha de Balanço, com linhas de base, medições e alocação de equipes.'
      : 'As atividades dos vagões em Linha de Balanço, como base para identificar e tratar as restrições de cada frente.'}>
      <nav data-tour="longo-visoes" aria-label="Visões do longo prazo" className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {VIEWS.map(v => <Link key={v.id} href={v.id === 'planejador' ? base : `${base}?visao=${v.id}`} aria-current={view === v.id ? 'page' : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${view === v.id ? 'bg-blue-700 text-white' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>{v.label}</Link>)}
      </nav>
    </TabHeader>
    {view === 'planejador' ? <LongTermPlanner workId={obraId} /> : <>
      {/* As atividades dos vagões são só leitura aqui: servem de base às restrições, que dependem do vagão de cada atividade. */}
      <Callout tone="info">Esta visão mostra as <strong>atividades dos vagões</strong>, que é onde as restrições se ligam. O responsável por elas é o plano de longo prazo: para mudar datas, serviços ou pavimentos, edite o <Link className="text-link" href={base}>Planejador</Link> e use "Gerar vagões". Obras que ainda não geraram vagões pelo plano mostram aqui o que veio do Prevision (<Link className="text-link" href={workPath(obraId, 'importar')}>Integrações</Link>).</Callout>
      <LineOfBalance workId={obraId} />
      <RestrictionsBoard workId={obraId} />
      <SCurve workId={obraId} />
      <BaselinesOverview workId={obraId} />
    </>}
  </>;
}

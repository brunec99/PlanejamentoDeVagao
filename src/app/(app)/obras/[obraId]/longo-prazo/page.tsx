import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
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

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<{ visao?: string }>;
}) {
  const { obraId } = await params;
  // Módulo em desenvolvimento: o proxy já desvia quem não desenvolve; a página confere de novo.
  const { developer } = await getRouteAccess();
  if (!developer) redirect(`/obras/${encodeURIComponent(obraId)}/curto-prazo`);
  const { visao } = await searchParams;
  const view = visao === 'prevision' ? 'prevision' : 'planejador';
  const base = workPath(obraId, 'longo-prazo');
  // A explicação longa das duas visões vive na ajuda do cabeçalho: a tela fica com uma linha, e
  // quem quer entender como Planejador, vagões e restrições se encaixam abre "Como funciona".
  const help = (
    <>
      <p>
        <strong>Planejador</strong> é o cronograma macro: o fluxograma de serviços por pavimento que se expande em Linha de Balanço, com
        linhas de base, medições e alocação de equipes. É ele o dono das atividades dos vagões — "Gerar vagões" transforma cada serviço ×
        pavimento em atividades de vagão.
      </p>
      <p>
        <strong>Vagões e restrições</strong> mostra essas atividades só para leitura e é onde as restrições se ligam: cada uma aponta para
        uma atividade e um lead time, e o limite de resolução sai do início previsto menos esse lead time. Enquanto uma restrição aberta
        bloquear a execução, o vagão não aceita lançamento de progresso.
      </p>
      <p>
        Para mudar datas, serviços ou pavimentos, edite o Planejador e gere os vagões de novo. Obras que ainda não geraram vagões pelo plano
        mostram o que veio do Prevision (
        <Link className="text-link" href={workPath(obraId, 'importar')}>
          Integrações
        </Link>
        ).
      </p>
    </>
  );
  return (
    <>
      <TabHeader
        workId={obraId}
        section="longo-prazo"
        help={help}
        description={
          view === 'planejador'
            ? 'Preenchimento do cronograma macro: fluxograma de serviços que se expande em Linha de Balanço, com linhas de base, medições e alocação de equipes.'
            : 'As atividades dos vagões em Linha de Balanço, como base para identificar e tratar as restrições de cada frente.'
        }
      >
        <nav
          data-tour="longo-visoes"
          aria-label="Visões do longo prazo"
          className="inline-flex rounded-lg border border-slate-200 bg-slate-100/70 p-1"
        >
          {VIEWS.map(v => (
            <Link
              key={v.id}
              href={v.id === 'planejador' ? base : `${base}?visao=${v.id}`}
              aria-current={view === v.id ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${view === v.id ? 'bg-white text-primary-ink shadow-sm ring-1 ring-primary-ring' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </TabHeader>
      {view === 'planejador' ? (
        <LongTermPlanner workId={obraId} />
      ) : (
        <>
          {/* As atividades dos vagões são só leitura aqui: servem de base às restrições, que dependem do vagão de cada atividade. */}
          <Callout tone="info">
            Atividades dos vagões, só leitura: para mudar datas, serviços ou pavimentos, edite o{' '}
            <Link className="text-link" href={base}>
              Planejador
            </Link>{' '}
            e use "Gerar vagões".
          </Callout>
          <LineOfBalance workId={obraId} />
          <RestrictionsBoard workId={obraId} />
          <SCurve workId={obraId} />
          <BaselinesOverview workId={obraId} />
        </>
      )}
    </>
  );
}

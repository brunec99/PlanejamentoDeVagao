import { hasSectionAccess } from '@/application/module-access';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { BaselinesOverview } from '@/modules/longo-prazo/baselines-overview';
import { LineOfBalance } from '@/modules/longo-prazo/line-of-balance';
import { SCurve } from '@/modules/longo-prazo/s-curve';
import { RestrictionsBoard } from '@/modules/longo-prazo/restrictions-board';
import { LongTermPlanner } from '@/modules/longo-prazo/planner/long-term-planner';
import { LobView } from '@/modules/longo-prazo/lob/lob-view';
import { FlowsView } from '@/modules/longo-prazo/lob/flows-view';
import { MeasurementsView } from '@/modules/longo-prazo/lob/measurements-view';
import { TabHeader } from '@/modules/layout/tab-header';
import { Callout } from '@/modules/planejamento/ui';
import { workPath } from '@/shared/format';
export const metadata = { title: 'Cronograma de longo prazo' };

/** Visões da aba 1 (04/11/2026, modelo aprovado, regra 1): a Linha de Balanço no estilo Prevision é
 * a padrão; Fluxos de serviços e Medições são as outras duas visões novas. "Vagões e restrições"
 * continua, e o Planejador (fluxograma) fica por último até a Linha de Balanço assumir "Gerar
 * vagões". O endereço guarda a visão em `?visao=`. */
const VIEWS = [
  { id: 'lob', label: 'Linha de Balanço' },
  { id: 'fluxos', label: 'Fluxos de serviços' },
  { id: 'medicoes', label: 'Medições' },
  { id: 'prevision', label: 'Vagões e restrições' },
  { id: 'planejador', label: 'Planejador' },
] as const;
type View = (typeof VIEWS)[number]['id'];
const DESCRIPTIONS: Record<View, string> = {
  lob: 'Linha de Balanço da obra: cada bloco é um serviço num local, com o que já foi medido. Arraste para reprogramar; as sucessoras acompanham.',
  fluxos: 'Fluxos de serviços: a sequência padrão da empresa, com duração por local e dependências, pronta para lançar em qualquer obra.',
  medicoes: 'Medições: o acumulado realizado de cada serviço em cada local, com foto do que avançou.',
  prevision: 'As atividades dos vagões em Linha de Balanço, como base para identificar e tratar as restrições de cada frente.',
  planejador:
    'Fluxograma de serviços que se expande em Linha de Balanço, com linhas de base, medições e alocação de equipes (ferramenta anterior).',
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<{ visao?: string }>;
}) {
  const { obraId } = await params;
  // Módulo em desenvolvimento: o proxy já desvia quem não desenvolve; a página confere de novo.
  const access = await getRouteAccess();
  if (!hasSectionAccess('longo-prazo', access)) redirect(`/obras/${encodeURIComponent(obraId)}/curto-prazo`);
  const { visao } = await searchParams;
  const view: View = VIEWS.some(v => v.id === visao) ? (visao as View) : 'lob';
  const base = workPath(obraId, 'longo-prazo');
  const href = (id: View) => (id === 'lob' ? base : `${base}?visao=${id}`);
  const help = (
    <>
      <p>
        <strong>Linha de Balanço</strong> é o cronograma de longo prazo: uma atividade por serviço × local, no estilo do Prevision. Os
        blocos nascem do lançamento de um <strong>fluxo de serviços</strong> (a sequência padrão da empresa, com duração por local e
        dependências) nos locais da obra, com a data de início, o sentido e o ritmo escolhidos. Arrastar um bloco empurra as sucessoras;
        cada bloco mostra a parte já medida e fica vermelho quando o previsto até hoje passa do medido.
      </p>
      <p>
        <strong>Medições</strong> são rodadas com data: o acumulado realizado de cada bloco, com foto obrigatória de cada avanço. Elas
        preenchem os blocos, apontam os atrasos e alimentam o avanço físico.
      </p>
      <p>
        <strong>Vagões e restrições</strong> mostra as atividades dos vagões só para leitura, para criar e acompanhar restrições. O{' '}
        <strong>Planejador</strong> é a ferramenta anterior (fluxograma por pavimento); o plano dele pode ser importado para a Linha de
        Balanço pelo botão "Importar do Planejador", e ele continua gerando os vagões até a Linha de Balanço assumir essa função. Obras que
        ainda não geraram vagões pelo plano mostram o que veio do Prevision (
        <Link className="text-link" href={workPath(obraId, 'importar')}>
          Integrações
        </Link>
        ).
      </p>
    </>
  );
  return (
    <>
      <TabHeader workId={obraId} section="longo-prazo" help={help} description={DESCRIPTIONS[view]}>
        <nav
          data-tour="longo-visoes"
          aria-label="Visões do longo prazo"
          className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-100/70 p-1"
        >
          {VIEWS.map(v => (
            <Link
              key={v.id}
              href={href(v.id)}
              aria-current={view === v.id ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${view === v.id ? 'bg-white text-primary-ink shadow-sm ring-1 ring-primary-ring' : v.id === 'planejador' ? 'text-slate-400 hover:text-slate-700' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </TabHeader>
      {view === 'lob' && <LobView workId={obraId} />}
      {view === 'fluxos' && <FlowsView workId={obraId} />}
      {view === 'medicoes' && <MeasurementsView workId={obraId} />}
      {view === 'planejador' && <LongTermPlanner workId={obraId} />}
      {view === 'prevision' && (
        <>
          <Callout tone="info">
            Atividades dos vagões, só leitura: para mudar datas, serviços ou pavimentos, edite o{' '}
            <Link className="text-link" href={href('planejador')}>
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

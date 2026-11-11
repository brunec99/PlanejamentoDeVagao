import { hasSectionAccess } from '@/application/module-access';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { BaselinesOverview } from '@/modules/longo-prazo/baselines-overview';
import { LineOfBalance } from '@/modules/longo-prazo/line-of-balance';
import { SCurve } from '@/modules/longo-prazo/s-curve';
import { LongTermPlanner } from '@/modules/longo-prazo/planner/long-term-planner';
import { LobView } from '@/modules/longo-prazo/lob/lob-view';
import { FlowsView } from '@/modules/longo-prazo/lob/flows-view';
import { MeasurementsView } from '@/modules/longo-prazo/lob/measurements-view';
import { CostsView } from '@/modules/longo-prazo/lob/costs-view';
import { LegalizationView } from '@/modules/longo-prazo/legalizacao/legalization-view';
import { TabHeader } from '@/modules/layout/tab-header';
import { Callout } from '@/modules/planejamento/ui';
import { workPath } from '@/shared/format';
export const metadata = { title: 'Cronograma de longo prazo' };

/** Visões da aba 1 (04/11/2026, modelo aprovado, regra 1): a Linha de Balanço no estilo Prevision é
 * a padrão; Fluxos de serviços e Medições são as outras duas visões novas. "Vagões" (antes
 * "Vagões e restrições": em 10/11/2026 o quadro de restrições foi para a aba 2, "Lista de pendência")
 * continua, e o Planejador (fluxograma) fica por último até a Linha de Balanço assumir "Gerar
 * vagões". O endereço guarda a visão em `?visao=`. O Gantt de legalização (04/11/2026, segundo modelo
 * aprovado, regra 1) entra depois de Medições: os 12 meses até a entrega, no cronograma do Project.
 * Custos (11/11/2026, com o IDP ponderado por custo) vem logo depois de Medições: o orçamento
 * apropriado por pacote de serviço, que dá o peso de cada serviço. */
const VIEWS = [
  { id: 'lob', label: 'Linha de Balanço' },
  { id: 'fluxos', label: 'Fluxos de serviços' },
  { id: 'medicoes', label: 'Medições' },
  { id: 'custos', label: 'Custos' },
  { id: 'legalizacao', label: 'Gantt de legalização' },
  { id: 'prevision', label: 'Vagões' },
  { id: 'planejador', label: 'Planejador' },
] as const;
type View = (typeof VIEWS)[number]['id'];
const DESCRIPTIONS: Record<View, string> = {
  lob: 'Linha de Balanço da obra: cada bloco é um serviço num local, com o que já foi medido. Arraste para reprogramar; as sucessoras acompanham.',
  fluxos: 'Fluxos de serviços: a sequência padrão da empresa, com duração por local e dependências, pronta para lançar em qualquer obra.',
  medicoes: 'Medições: o acumulado realizado de cada serviço em cada local, com foto do que avançou.',
  custos:
    'Custos: o orçamento apropriado em cada pacote de serviço, que dá o peso de cada serviço no avanço físico e no IDP (real ÷ planejado).',
  legalizacao:
    'Gantt de legalização: os 12 meses até a entrega, com o caminho crítico da obra e os documentos de cada órgão até as chaves.',
  prevision: 'As atividades dos vagões em Linha de Balanço, só para leitura, com a curva de avanço e as linhas de base da obra.',
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
  if (!hasSectionAccess('longo-prazo', access)) redirect(`/obras/${encodeURIComponent(obraId)}/dashboard`);
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
        <strong>Custos</strong> é a apropriação do orçamento em cada pacote de serviço: digite um valor por pacote ou cole as linhas do
        orçamento e aponte cada uma a um pacote. Com todos os pacotes que têm blocos custeados, o avanço físico e o <strong>IDP</strong> (%
        físico real ÷ % físico planejado, na última medição fechada) passam a pesar cada serviço pelo custo; antes disso, pesam pela
        duração. Quem só consulta vê o peso em %, sem os valores em reais.
      </p>
      <p>
        <strong>Gantt de legalização</strong> é o planejamento dos 12 meses até a entrega: o caminho crítico da obra e a legalização por
        órgão (Corpo de Bombeiros, concessionárias, Prefeitura, Receita Federal, cartório e condomínio) no mesmo cronograma do médio prazo,
        com a entrega contratual como prazo final do marco "Entrega das chaves". Quando a rede passa da data, o marco fica vermelho e o
        caminho crítico mostra o que empurra a entrega. Ele nasce do modelo ATR (ou em branco) e pode receber um resumo por serviço da Linha
        de Balanço.
      </p>
      <p>
        <strong>Vagões</strong> mostra as atividades dos vagões só para leitura, com a curva de avanço e as linhas de base. As pendências da
        obra ficam na{' '}
        {hasSectionAccess('vagoes', access) ? (
          <Link className="text-link" href={`${workPath(obraId, 'vagoes')}?visao=pendencias`}>
            aba 2 → Lista de pendência
          </Link>
        ) : (
          'aba 2 → Lista de pendência'
        )}
        , inclusive as restrições que estavam aqui, copiadas como cards. O <strong>Planejador</strong> é a ferramenta anterior (fluxograma
        por pavimento); o plano dele pode ser importado para a Linha de Balanço pelo botão "Importar do Planejador", e ele continua gerando
        os vagões até a Linha de Balanço assumir essa função. Obras que ainda não geraram vagões pelo plano mostram o que veio do Prevision
        (
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
      {view === 'custos' && <CostsView workId={obraId} />}
      {view === 'legalizacao' && <LegalizationView workId={obraId} />}
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
          <SCurve workId={obraId} />
          <BaselinesOverview workId={obraId} />
        </>
      )}
    </>
  );
}

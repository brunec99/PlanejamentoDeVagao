import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { getRouteAccess } from '@/infrastructure/auth/supabase-server';
import { TabHeader } from '@/modules/layout/tab-header';
import { ScheduleSheet } from '@/modules/medio-prazo/schedule-sheet';
import { LookAheadOverview, type LookAheadSection } from '@/modules/medio-prazo/look-ahead-overview';
import { ResourceAnalysis } from '@/modules/medio-prazo/resource-analysis';
import { BaselineDelays } from '@/modules/medio-prazo/baseline-delays';
import { workPath } from '@/shared/format';
export const metadata = { title: 'Cronograma de médio prazo' };

/* A aba 3 tem sete seções na URL (?secao=), como a aba 1 faz com ?visao=: o cronograma do mês é a
 * tela principal e abre por padrão; as outras são apoio à reunião de médio prazo. Seção na URL,
 * e não em estado local, para que um link compartilhado abra a mesma coisa para todo mundo e o
 * botão Voltar do navegador funcione. */
const SECTIONS = [
  {
    id: 'cronograma',
    label: 'Cronograma',
    description:
      'Um cronograma por mês, com horizonte de três meses, no layout do MS Project: tabela e Gantt lado a lado, datas reais e linha de base.',
  },
  {
    id: 'janela',
    label: 'Próximos 90 dias',
    description:
      'As atividades dos vagões que tocam os próximos três meses, em ordem de início: a lista que a reunião de médio prazo percorre.',
  },
  { id: 'equipes', label: 'Equipes', description: 'A carga de cada equipe nos próximos 90 dias contra a capacidade cadastrada.' },
  {
    id: 'cobertura',
    label: 'Cobertura',
    description: 'Confere se o que vem na janela tem linha no plano do mês e se o plano do mês chegou à planilha da semana.',
  },
  {
    id: 'historico',
    label: 'Histórico',
    description: 'Os lançamentos de percentual executado das atividades desta obra, do mais recente ao mais antigo.',
  },
  {
    id: 'recursos',
    label: 'Recursos',
    description: 'A carga semanal de cada equipe, plano do mês e cronograma somados, contra a capacidade cadastrada.',
  },
  {
    id: 'linha-de-base',
    label: 'Linha de base',
    description: 'A variação de início e de término de cada tarefa do plano vivo contra uma linha de base congelada.',
  },
] as const;
type Section = (typeof SECTIONS)[number]['id'];
const isSection = (value: string | undefined): value is Section => SECTIONS.some(s => s.id === value);
// As quatro seções que leem a janela de 90 dias são desenhadas pelo mesmo componente, que recebe qual delas mostrar.
const LOOK_AHEAD: readonly string[] = ['janela', 'equipes', 'cobertura', 'historico'] satisfies LookAheadSection[];
const isLookAhead = (value: Section): value is Section & LookAheadSection => LOOK_AHEAD.includes(value);

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ obraId: string }>;
  searchParams: Promise<{ secao?: string }>;
}) {
  const { obraId } = await params;
  // Módulo em desenvolvimento: o proxy já desvia quem não desenvolve; a página confere de novo.
  const { developer } = await getRouteAccess();
  if (!developer) redirect(`/obras/${encodeURIComponent(obraId)}/curto-prazo`);
  const { secao } = await searchParams;
  const section: Section = isSection(secao) ? secao : 'cronograma';
  const base = workPath(obraId, 'medio-prazo');
  const current = SECTIONS.find(s => s.id === section)!;
  return (
    <>
      <TabHeader
        workId={obraId}
        section="medio-prazo"
        description={current.description}
        helpTitle="Como funciona: médio prazo"
        help={
          <>
            <p>
              <strong>Um cronograma por mês.</strong> Cada plano cobre o mês dele com horizonte de três meses à frente, e o plano novo nasce
              como cópia do anterior: o que não terminou segue, o que terminou sai.
            </p>
            <p>
              <strong>Agendamento automático.</strong> As datas vêm da rede de predecessoras e das durações, no calendário do plano; mudar
              uma duração ou um vínculo empurra as sucessoras. Data real lançada prende a tarefa.
            </p>
            <p>
              <strong>Linha de base congelada.</strong> Um retrato das datas num momento escolhido; o plano vivo segue mudando e a seção
              Linha de base mede, em dias úteis, quanto cada tarefa se afastou do retrato.
            </p>
            <p>
              <strong>Conferência por nome.</strong> O vínculo formal entre os níveis é opcional e raro, então a cobertura entre a janela, o
              plano do mês e a planilha da semana pareia pelo nome normalizado. É sugestão: nada bloqueia o plano nem cria linha sozinho.
            </p>
          </>
        }
      >
        <div className="max-w-full overflow-x-auto custom-scrollbar">
          <nav
            data-tour="medio-secoes"
            aria-label="Seções do médio prazo"
            className="inline-flex rounded-lg border border-slate-200 bg-slate-100/70 p-1"
          >
            {SECTIONS.map(s => (
              <Link
                key={s.id}
                href={s.id === 'cronograma' ? base : `${base}?secao=${s.id}`}
                aria-current={section === s.id ? 'page' : undefined}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${section === s.id ? 'bg-white text-primary-ink shadow-sm ring-1 ring-primary-ring' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link className="button-ghost" href={workPath(obraId, 'configuracoes')}>
          <Users size={16} aria-hidden />
          Configurar recursos
        </Link>
      </TabHeader>
      {section === 'cronograma' && <ScheduleSheet workId={obraId} />}
      {isLookAhead(section) && <LookAheadOverview workId={obraId} section={section} />}
      {section === 'recursos' && <ResourceAnalysis workId={obraId} />}
      {section === 'linha-de-base' && <BaselineDelays workId={obraId} />}
    </>
  );
}

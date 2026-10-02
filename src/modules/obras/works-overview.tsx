'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, Building2, CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { WorkActions } from '@/modules/planejamento/planning-actions';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Empty, LoadState } from '@/modules/planejamento/ui';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { formatDate, workPath } from '@/shared/format';
import { actsAsManager, ppcSeries, weightedProgress } from '@/domain/rules';

type Tone = 'default' | 'success' | 'warning' | 'danger';

/* A cor nunca anda sozinha: cada tom tem o texto que o nomeia, para quem não distingue cores e
 * para quem lê a tela em preto e branco numa impressão de reunião. */
const TEXT: Record<Tone, string> = { default: 'text-slate-900', success: 'text-success', warning: 'text-warning', danger: 'text-danger' };
const BAR: Record<Tone, string> = {
  default: 'from-slate-400 to-slate-300',
  success: 'from-success to-emerald-400',
  warning: 'from-warning to-amber-400',
  danger: 'from-danger to-rose-400',
};
const BORDER: Record<Tone, string> = {
  default: 'border-slate-200',
  success: 'border-success-ring',
  warning: 'border-warning-ring',
  danger: 'border-danger-ring',
};
const PILL: Record<Tone, string> = {
  default: 'border-slate-200 bg-slate-50 text-slate-600',
  success: 'border-success-ring bg-success-soft text-success',
  warning: 'border-warning-ring bg-warning-soft text-warning',
  danger: 'border-danger-ring bg-danger-soft text-danger',
};
const LABEL: Record<Tone, string> = { default: 'Sem apuração', success: 'Em dia', warning: 'Atenção', danger: 'Crítico' };
const ICON: Record<Tone, typeof Building2> = { default: Building2, success: CircleCheck, warning: TriangleAlert, danger: CircleAlert };
const RANK: Record<Tone, number> = { default: 0, success: 1, warning: 2, danger: 3 };

/** Faixas do PPC na leitura do cartão: de 80% para cima o Last Planner considera o comprometimento
 * confiável; abaixo de 60% a semana foi mais promessa do que entrega. */
const ppcTone = (percent: number): Tone => (percent >= 80 ? 'success' : percent >= 60 ? 'warning' : 'danger');

/** O pior estado entre os indicadores manda na cor da barra e do selo do cartão: uma obra com PPC
 * bom e uma restrição vencida está vermelha, porque é a restrição que vai parar a frente. */
const worst = (tones: Tone[]): Tone => tones.reduce((acc, tone) => (RANK[tone] > RANK[acc] ? tone : acc), 'default');

function Indicator({ label, value, state, tone }: { label: string; value: ReactNode; state: string; tone: Tone }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5">
        <span className={`block text-lg font-bold leading-tight tabular-nums ${TEXT[tone]}`}>{value}</span>
        <span className={`block truncate text-xs ${tone === 'default' ? 'text-slate-400' : TEXT[tone]}`}>{state}</span>
      </dd>
    </div>
  );
}

export function WorksOverview() {
  const context = usePlanning();
  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const { data, today } = planning;
  const actor = data.users.find(u => u.id === context.actorId);
  const works = data.works.filter(w => actor?.workIds.includes(w.id));
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Planejamento de produção</p>
          <h1 className="page-title">Obras</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cada cartão mostra a saúde da obra: PPC da última semana, restrições vencidas e vagões com takt estourado.
          </p>
        </div>
        {/* `WorkActions` traz um `mt-6` próprio, feito para a posição antiga; aqui o botão fica ao lado do título. */}
        {actsAsManager(actor?.role) && (
          <div data-tour="obras-actions" className="[&>div]:mt-0">
            <WorkActions />
          </div>
        )}
      </header>
      {works.length === 0 ? (
        <div className="panel mt-6 p-6">
          <Empty>Você ainda não tem acesso a nenhuma obra. Peça a um administrador para liberar em Configurações.</Empty>
        </div>
      ) : (
        <div data-tour="obras-grid" className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {works.map(work => {
            const selected = selectWorkPlanning(planning, work.id)!;
            const wagonIds = new Set(selected.wagons.map(w => w.id));

            // PPC da última semana apurada: a última da série em que nenhum compromisso ficou sem
            // Sim/Não. A semana corrente, ainda aberta, diria "50%" só porque metade foi registrada.
            const series = ppcSeries(data.commitments.filter(c => c.workId === work.id));
            const closed = [...series].reverse().find(week => week.pending === 0);
            const ppcState: Tone = closed ? ppcTone(closed.percent) : 'default';

            // Restrição aberta com prazo vencido é a que já está segurando uma frente.
            const overdueRestrictions = data.restrictions.filter(
              r => wagonIds.has(r.wagonId) && r.status === 'open' && r.dueDate < today,
            ).length;
            const restrictionState: Tone = overdueRestrictions > 0 ? 'danger' : 'success';

            // Takt vencido é atraso, não bloqueio: pesa como atenção, igual ao painel de vagões.
            const overdueWagons = selected.wagons.filter(w => w.overdue).length;
            const wagonState: Tone = overdueWagons > 0 ? 'warning' : 'success';

            // O progresso ponderado só das frentes em produção: o que está sendo executado agora.
            const inProduction = selected.wagons.filter(w => w.status === 'in_production');
            const producingIds = new Set(inProduction.map(w => w.id));
            const progress = inProduction.length ? weightedProgress(data.activities.filter(a => producingIds.has(a.wagonId))) : 0;

            const tone = worst([ppcState, restrictionState, wagonState]);
            const Icon = ICON[tone];
            return (
              <Link
                href={workPath(work.id, 'longo-prazo')}
                key={work.id}
                className={`card-accent group transition-shadow hover:shadow-md ${BORDER[tone]}`}
              >
                <div className={`card-accent-bar ${BAR[tone]}`} />
                <div className="flex items-start justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <p className="eyebrow">{work.code}</p>
                    <h2 className="mt-1.5 truncate text-base font-bold text-slate-900">{work.name}</h2>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${PILL[tone]}`}
                  >
                    <Icon size={13} aria-hidden />
                    {LABEL[tone]}
                  </span>
                </div>
                <dl className="mx-5 grid grid-cols-3 gap-3 border-t border-slate-100 pt-4">
                  <Indicator
                    label="PPC da semana"
                    tone={ppcState}
                    value={closed ? `${Math.round(closed.percent)}%` : '—'}
                    state={closed ? `Semana de ${formatDate(closed.weekStart)}` : 'Sem semana apurada'}
                  />
                  <Indicator
                    label="Restrições vencidas"
                    tone={restrictionState}
                    value={overdueRestrictions}
                    state={overdueRestrictions > 0 ? (overdueRestrictions === 1 ? 'Prazo vencido' : 'Prazos vencidos') : 'Em dia'}
                  />
                  <Indicator
                    label="Takt vencido"
                    tone={wagonState}
                    value={overdueWagons}
                    state={overdueWagons > 0 ? (overdueWagons === 1 ? 'Vagão atrasado' : 'Vagões atrasados') : 'Em dia'}
                  />
                </dl>
                {inProduction.length > 0 && (
                  <div className="mx-5 mt-4">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        Progresso em produção · {inProduction.length} {inProduction.length === 1 ? 'vagão' : 'vagões'}
                      </span>
                      <span className="font-semibold tabular-nums text-slate-700">{Math.round(progress)}%</span>
                    </div>
                    <div
                      className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                      aria-label={`Progresso ponderado dos vagões em produção de ${work.name}`}
                      aria-valuenow={Math.round(progress)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                      />
                    </div>
                  </div>
                )}
                <span className="mx-5 mb-5 mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  Abrir planejamento <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

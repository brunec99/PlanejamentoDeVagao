'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { StackBar } from '@/modules/dashboard/charts';
import { dayMonth, plural, signedDays } from '@/modules/dashboard/model';
import {
  mediumTermCallout,
  mediumTermSnapshot,
  shortList,
  varianceSegments,
  type MediumTermPanelData,
} from '@/modules/dashboard/medium-term-panel';
import { workPath } from '@/shared/format';

/** Quadro da aba 3 na aba 0: na tela, três blocos lado a lado; no papel, três painéis que o PDF
 * distribui na folha do médio prazo. O mesmo dado desenha os dois, com as classes `dsh-*`. Fora da escala
 * semanal, o retrato diz o dia e o plano ("Em 31/10 · plano de outubro") e a superalocação diz que é a da
 * última semana do período; na semanal, nada muda. */

const statusAria = (d: MediumTermPanelData) =>
  `Tarefas do plano por status: ${d.done} concluídas, ${d.inProgress} em andamento, ${d.notStarted} não iniciadas`;
const varianceAria = (b: NonNullable<MediumTermPanelData['baseline']>) =>
  `Tarefas contra a linha de base: ${b.late} atrasadas, ${b.onTime} no prazo, ${b.early} adiantadas`;

const StatusChart = ({ d }: { d: MediumTermPanelData }) =>
  d.plan.taskCount ? (
    <StackBar segments={d.byStatus} ariaLabel={statusAria(d)} />
  ) : (
    <p className="dsh-empty">{d.companyFiltered ? 'Nenhuma tarefa deste empreiteiro no plano.' : 'O plano ainda não tem tarefas.'}</p>
  );

const weeklyData = (d: MediumTermPanelData) => d.scale === 'semana';

/** Os três cartões pequenos da tela: atrasadas na data, caminho crítico e equipes superalocadas. */
const Minis = ({ d }: { d: MediumTermPanelData }) => (
  <div className="dsh-mini" style={{ marginTop: 10 }}>
    <div>
      <div className="l">{weeklyData(d) ? 'Atrasadas na data' : `Atrasadas em ${dayMonth(d.reference)}`}</div>
      <div className={`v${d.late.count > 0 ? ' t-bad' : ''}`}>{d.late.count}</div>
      <div className="h">término previsto antes de {dayMonth(d.reference)} e &lt; 100%</div>
    </div>
    <div>
      <div className="l">Caminho crítico</div>
      <div className="v">{d.critical ? plural(d.critical.count, 'tarefa', 'tarefas') : '—'}</div>
      <div className="h">
        {d.critical
          ? `folga zero${d.critical.planFinish ? ` · término em ${dayMonth(d.critical.planFinish)}` : ''}${d.companyFiltered ? ' · plano inteiro' : ''}`
          : 'rede do plano sem cálculo; confira os vínculos no Cronograma'}
      </div>
    </div>
    <div>
      <div className="l">Equipes superalocadas</div>
      <div className={`v${d.overloaded.count > 0 ? ' t-warn' : ''}`}>{d.overloaded.count}</div>
      <div className="h">
        {d.overloaded.count > 0
          ? `${shortList(d.overloaded.names)}${weeklyData(d) ? '' : ' · última semana'}`
          : `nenhuma acima da capacidade na ${weeklyData(d) ? 'semana' : 'última semana'}`}
        {d.companyFiltered ? ' · plano inteiro' : ''}
      </div>
    </div>
  </div>
);

const BaselineBody = ({ d, variant, workId }: { d: MediumTermPanelData; variant: 'screen' | 'paper'; workId: string }) => {
  const b = d.baseline;
  if (!b)
    return (
      <p className="dsh-empty">
        Sem linha de base congelada neste plano. Em{' '}
        {variant === 'screen' ? (
          <Link className="text-link" href={workPath(workId, 'medio-prazo')}>
            Cronograma
          </Link>
        ) : (
          'Cronograma'
        )}
        , "Definir linha de base" cria o retrato.
      </p>
    );
  const segments = varianceSegments(b);
  const compared = b.late + b.onTime + b.early;
  const extras = [b.added ? plural(b.added, 'nova', 'novas') : '', b.removed ? plural(b.removed, 'removida', 'removidas') : ''].filter(
    Boolean,
  );
  return (
    <>
      {compared ? (
        <StackBar segments={segments} ariaLabel={varianceAria(b)} />
      ) : (
        <p className="dsh-empty">Nenhuma tarefa pareada com a linha de base.</p>
      )}
      <p className="dsh-legend">
        Base "{b.name}" de {dayMonth(b.frozenAt.slice(0, 10))}
        {extras.length ? ` · ${extras.join(' e ')}` : ''}
        {b.planFinishVariance !== undefined
          ? ` · término do plano ${signedDays(b.planFinishVariance)} ${Math.abs(b.planFinishVariance) === 1 ? 'dia útil' : 'dias úteis'}`
          : ''}
      </p>
      <div className="dsh-grid">
        <div className="thd" style={{ gridTemplateColumns: 'minmax(0,1fr) 60px' }}>
          <span>Maiores atrasos</span>
          <span className="num">dias úteis</span>
        </div>
        {b.worst.length ? (
          b.worst.map((row, i) => (
            <div key={`${row.name}-${i}`} style={{ gridTemplateColumns: 'minmax(0,1fr) 60px' }}>
              <span className="txt" title={row.name}>
                {row.name}
              </span>
              <span className="num t-bad">{signedDays(row.days)}</span>
            </div>
          ))
        ) : (
          <div style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
            <span className="muted">Nenhuma tarefa termina depois da linha de base.</span>
          </div>
        )}
      </div>
    </>
  );
};

const Milestones = ({ d }: { d: MediumTermPanelData }) => (
  <>
    {d.milestones.length ? (
      <div className="dsh-marks">
        {d.milestones.map((m, i) => (
          <div key={`${m.date}-${i}`}>
            <span className="dt">{dayMonth(m.date)}</span>
            <span className="txt" title={m.name}>
              {m.name}
            </span>
            {m.critical ? <span className="dsh-tag bad">crítico</span> : <span className="dsh-tag neutral">no prazo</span>}
          </div>
        ))}
      </div>
    ) : (
      <p className="dsh-empty">
        Nenhum marco com término entre {dayMonth(d.reference)} e {dayMonth(d.milestoneHorizonEnd)}
        {d.companyFiltered ? ' para este empreiteiro' : ''}.
      </p>
    )}
    <p className="dsh-legend">Marco em vermelho está no caminho crítico do plano.</p>
  </>
);

const DESC = {
  /** Fora da semanal, começa pelo retrato: "Em 31/10 · plano de outubro. Pelo % concluída…". */
  status: (d: MediumTermPanelData) => {
    const text = 'Pelo % concluída e pelo término previsto até a data.';
    const snapshot = mediumTermSnapshot(d);
    return snapshot ? `${snapshot.replace(/^./, c => c.toUpperCase())}. ${text}` : text;
  },
  baseline: 'Variação do término em dias úteis; positivo é atraso.',
  milestones: (d: MediumTermPanelData) => `Tarefas de 0 dias com término até ${dayMonth(d.milestoneHorizonEnd)}.`,
};

export function MediumTermPanel({
  data,
  variant,
  workId,
}: {
  data: MediumTermPanelData;
  variant: 'screen' | 'paper';
  workId: string;
}): ReactNode {
  if (variant === 'paper')
    return (
      <>
        <div className="dsh-panel">
          <h3>Aba 3 · Tarefas do plano</h3>
          <p className="dsh-desc">{DESC.status(data)}</p>
          <StatusChart d={data} />
          <p className={`dsh-callout${data.late.count > 0 ? ' alert' : ''}`}>{mediumTermCallout(data)}</p>
        </div>
        <div className="dsh-panel">
          <h3>Aba 3 · Contra a linha de base</h3>
          <p className="dsh-desc">{DESC.baseline}</p>
          <BaselineBody d={data} variant={variant} workId={workId} />
        </div>
        <div className="dsh-panel">
          <h3>Aba 3 · Próximos marcos · 30 dias</h3>
          <p className="dsh-desc">{DESC.milestones(data)}</p>
          <Milestones d={data} />
        </div>
      </>
    );
  return (
    <div className="dsh-mod-b dsh-cols-3">
      <div className="dsh-blk">
        <h5>Tarefas do plano</h5>
        <p className="dsh-d">{DESC.status(data)}</p>
        <StatusChart d={data} />
        <Minis d={data} />
      </div>
      <div className="dsh-blk">
        <h5>Contra a linha de base</h5>
        <p className="dsh-d">{DESC.baseline}</p>
        <BaselineBody d={data} variant={variant} workId={workId} />
      </div>
      <div className="dsh-blk">
        <h5>Próximos marcos · 30 dias</h5>
        <p className="dsh-d">{DESC.milestones(data)}</p>
        <Milestones d={data} />
      </div>
    </div>
  );
}

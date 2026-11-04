'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { StackBar } from '@/modules/dashboard/charts';
import { dayMonth, pct, plural } from '@/modules/dashboard/model';
import {
  debtsHint,
  overdueHint,
  producingLegend,
  restrictionsCallout,
  statusAriaLabel,
  type ProducingWagon,
  type WagonsPanelData,
} from '@/modules/dashboard/wagons-panel';
import { wagonLabel, wagonPath } from '@/shared/format';

/** Quadro de vagões da aba 0 (aba 2 de origem). Na tela é um corpo de módulo com três blocos; no papel são
 * dois painéis que o PDF coloca na folha 2. Os textos vêm de `wagons-panel.ts`, para a tela e o papel
 * dizerem a mesma coisa. */
export function WagonsPanel({ data, variant, workId }: { data: WagonsPanelData; variant: 'screen' | 'paper'; workId: string }): ReactNode {
  if (variant === 'paper') return <Paper data={data} />;
  return (
    <div className="dsh-mod-b dsh-cols-3">
      <div className="dsh-blk">
        <h5>Vagões por status</h5>
        <p className="dsh-d">Na data analisada.{data.companyFiltered ? ' Só vagões com atividade das empresas escolhidas.' : ''}</p>
        <StatusBar data={data} />
        <div className="dsh-mini">
          <Mini label="Takt vencido" value={data.overdue.count} tone={data.overdue.count ? 't-warn' : undefined} hint={overdueHint(data)} />
          <Mini label="Dívidas abertas" value={data.openDebts} tone={data.openDebts ? 't-bad' : undefined} hint={debtsHint(data)} />
          <Mini
            label="Progresso em produção"
            value={data.producingProgress === undefined ? '—' : pct(data.producingProgress)}
            hint={
              data.producing ? `Ponderado pelas atividades de ${plural(data.producing, 'vagão', 'vagões')}` : 'Nenhum vagão em produção'
            }
          />
        </div>
      </div>
      <div className="dsh-blk">
        <h5>Em produção</h5>
        <p className="dsh-d">Os vagões em produção de maior progresso.</p>
        <ProducingList rows={data.producingList} workId={workId} />
        <p className="dsh-legend">
          <span>{producingLegend(data)}</span>
        </p>
      </div>
      <div className="dsh-blk">
        <h5>Restrições</h5>
        <p className="dsh-d">Coluna atual do quadro; vencidas pelo limite do lead time.</p>
        <RestrictionsMini data={data} />
        <Callout data={data} />
      </div>
    </div>
  );
}

function Paper({ data }: { data: WagonsPanelData }) {
  const sequences = data.sequences.map(s => `${s.name} (takt ${s.takt})`).join('; ');
  return (
    <>
      <div className="dsh-panel">
        <h3>Aba 2 · Vagões por status e em produção</h3>
        <p className="dsh-desc">
          {plural(data.total, 'vagão', 'vagões')}
          {sequences ? ` em ${sequences}` : ''}. Status atual; takt vencido pela data analisada.
          {data.companyFiltered ? ' Só vagões com atividade das empresas escolhidas.' : ''}
        </p>
        <div className="dsh-stack-blocks">
          <StatusBar data={data} />
          <div className="dsh-mini compact">
            <Mini
              label="Takt vencido"
              value={data.overdue.count}
              tone={data.overdue.count ? 't-warn' : undefined}
              hint={overdueHint(data)}
            />
            <Mini label="Dívidas abertas" value={data.openDebts} tone={data.openDebts ? 't-bad' : undefined} hint={debtsHint(data)} />
          </div>
          <div>
            <ProducingList rows={data.producingList} />
            <p className="dsh-legend">
              <span>{producingLegend(data)}</span>
            </p>
          </div>
        </div>
      </div>
      <div className="dsh-panel">
        <h3>Aba 2 · Restrições</h3>
        <p className="dsh-desc">
          Coluna atual do quadro de restrições; vencida é a aberta com limite (início previsto menos lead time) antes da data.
        </p>
        <RestrictionsMini data={data} compact />
        <Callout data={data} />
      </div>
    </>
  );
}

function StatusBar({ data }: { data: WagonsPanelData }) {
  // Com recorte de empresa que não deixa vagão, a barra não tem o que mostrar.
  if (!data.total) return <p className="dsh-empty">Nenhum vagão tem atividade das empresas escolhidas.</p>;
  return (
    <StackBar segments={data.byStatus.map(s => ({ label: s.label, value: s.value, color: s.color }))} ariaLabel={statusAriaLabel(data)} />
  );
}

function Mini({ label, value, tone, hint }: { label: string; value: number | string; tone?: 't-warn' | 't-bad'; hint?: string }) {
  // A cor vai num `span` dentro de `.v`, porque `.dsh-mini .v` fixa a cor do próprio `div`.
  return (
    <div>
      <div className="l">{label}</div>
      <div className="v">{tone ? <span className={tone}>{value}</span> : value}</div>
      {hint && <div className="h">{hint}</div>}
    </div>
  );
}

function ProducingList({ rows, workId }: { rows: ProducingWagon[]; workId?: string }) {
  if (!rows.length) return <p className="dsh-empty">Nenhum vagão em produção na obra.</p>;
  return (
    <div className="dsh-wag">
      {rows.map(w => {
        const label = wagonLabel(w.number);
        return (
          <div key={w.id}>
            <b className="name">
              {workId ? (
                <Link className="text-link" href={wagonPath(workId, w.id)}>
                  {label}
                </Link>
              ) : (
                label
              )}
            </b>
            <span className="when">
              {dayMonth(w.plannedStart)} → {dayMonth(w.plannedEnd)}
              {w.overdue && (
                <>
                  {' · '}
                  <b className="t-warn">takt vencido</b>
                </>
              )}
            </span>
            <span className="pct">{pct(w.progress)}</span>
            <span className="dsh-track" aria-hidden="true">
              <b style={{ width: `${Math.max(0, Math.min(100, w.progress))}%`, background: w.overdue ? '#b45309' : '#2a78d6' }} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RestrictionsMini({ data, compact }: { data: WagonsPanelData; compact?: boolean }) {
  const r = data.restrictions;
  return (
    <div className={compact ? 'dsh-mini compact' : 'dsh-mini'}>
      <Mini label="Identificada" value={r.identified} />
      <Mini label="Em tratativa" value={r.inTreatment} />
      <Mini label="Resolvida" value={r.resolved} />
    </div>
  );
}

function Callout({ data }: { data: WagonsPanelData }) {
  const callout = restrictionsCallout(data);
  return <p className={callout.tone === 'alert' ? 'dsh-callout alert' : 'dsh-callout'}>{callout.text}</p>;
}

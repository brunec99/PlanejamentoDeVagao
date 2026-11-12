'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { addDays } from '@/domain/validation';
import { Donut, EvolutionChart, HBars } from '@/modules/dashboard/charts';
import { dayMonth, plural } from '@/modules/dashboard/model';
import { GROUPING_NOUN, SCALE_OF } from '@/modules/dashboard/period';
import { periodFlowText, type TerminalityPanelData } from '@/modules/dashboard/terminality-panel';
import { workPath } from '@/shared/format';

/** Quadro da terminalidade (aba 5) na aba 0, nas duas saídas: `screen` é um bloco de três colunas dentro
 * do módulo da tela; `paper` são três painéis que o PDF põe na folha 4, com os cartões do topo montados pela
 * folha. Os mesmos gráficos de `charts.tsx` desenham os dois, mudando só o tamanho. Fora da escala semanal
 * (04/11/2026), os números miúdos contam o fluxo do período e a evolução usa os baldes da série do período
 * (meses, trimestres, anos) no lugar das 12 semanas. */

const EVOLUTION_DESC = 'Pendências abertas e resolvidas em cada semana, e o saldo em aberto no fim dela.';
const isWeekly = (data: TerminalityPanelData) => data.scale === 'semana';
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
/** A evolução que o quadro desenha: as 12 semanas na escala semanal; os baldes do período nas demais. */
function evolution(data: TerminalityPanelData) {
  if (isWeekly(data)) return { title: 'Evolução · 12 semanas', desc: EVOLUTION_DESC, items: data.weeks, bucket: undefined };
  const noun = GROUPING_NOUN[data.grouping];
  const of = SCALE_OF[data.grouping];
  const count = data.period.buckets.length;
  return {
    title: `Evolução · ${count} ${count === 1 ? noun.one : noun.many}`,
    desc: `Pendências abertas e resolvidas em cada ${noun.one}, e o saldo em aberto no fim ${of}.`,
    items: data.period.buckets.map(b => ({ weekStart: b.key, label: b.short, opened: b.opened, resolved: b.resolved, balance: b.balance })),
    bucket: { of, many: noun.many },
  };
}
/** "+9", "−9", "mesmo número": em aberto no sábado final contra a véspera do período. */
const balanceDelta = (delta: number) => (delta === 0 ? 'mesmo número' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`);
const CONTRACTOR_TITLE = 'Abertas por responsável terceiro';
const FLOOR_TITLE = 'Abertas por pavimento';
const TYPE_TITLE = 'Abertas por tipo';

const contractorDesc = (data: TerminalityPanelData) =>
  `Os 6 empreiteiros com mais pendências abertas${data.contractorRest > 0 ? `; os demais somam ${data.contractorRest}.` : '.'}`;
const floorDesc = (data: TerminalityPanelData) =>
  `Os 6 pavimentos com mais pendências abertas${data.floorRest > 0 ? `; os demais somam ${data.floorRest}.` : '.'}`;
const contractorRows = (data: TerminalityPanelData) =>
  data.byContractor.map(row => ({ label: row.label, value: row.count, muted: row.none }));
const floorRows = (data: TerminalityPanelData) => data.byFloor.map(row => ({ label: row.label, value: row.count }));

export function TerminalityPanel({
  data,
  variant,
  workId,
}: {
  data: TerminalityPanelData;
  variant: 'screen' | 'paper';
  workId: string;
}): ReactNode {
  const refDay = dayMonth(data.refDate);
  // Sem aberta na data, as listas e a rosca não têm o que mostrar: uma frase só, no lugar delas.
  const empty = data.open === 0 ? `Nenhuma pendência aberta ${data.filtered ? 'neste recorte ' : ''}até ${refDay}.` : undefined;

  const chart = evolution(data);
  const weekly = isWeekly(data);
  const eve = dayMonth(addDays(data.period.start, -1));

  if (variant === 'paper')
    return (
      <>
        <div className="dsh-panel">
          <h3>{weekly ? 'Aba 2.1 · Evolução nas 12 semanas' : `Aba 2.1 · ${chart.title}`}</h3>
          <p className="dsh-desc">
            {chart.desc} Até {refDay}
            {data.filtered ? ', no recorte de empreiteiro ou pavimento escolhido' : ''}.
            {!weekly &&
              ` ${capitalize(periodFlowText(data))}; ${data.open} em aberto em ${refDay} (eram ${data.period.openAtStart} em ${eve}).`}
          </p>
          <EvolutionChart weeks={chart.items} bucket={chart.bucket} width={560} height={250} />
        </div>
        <div className="dsh-panel">
          <h3>Aba 2.1 · {CONTRACTOR_TITLE}</h3>
          <p className="dsh-desc">{contractorDesc(data)}</p>
          {empty ? <p className="dsh-empty">{empty}</p> : <HBars rows={contractorRows(data)} />}
          <p className="dsh-desc" style={{ marginTop: 10, fontWeight: 700, color: '#1f2937' }}>
            {TYPE_TITLE}
          </p>
          {empty ? (
            <p className="dsh-empty">{empty}</p>
          ) : (
            <Donut slices={data.byType} total={data.open} title={TYPE_TITLE} centerLabel="abertas" size={96} />
          )}
        </div>
        <div className="dsh-panel">
          <h3>Aba 2.1 · {FLOOR_TITLE}</h3>
          <p className="dsh-desc">{floorDesc(data)}</p>
          {empty ? <p className="dsh-empty">{empty}</p> : <HBars rows={floorRows(data)} />}
        </div>
      </>
    );

  return (
    <div className="dsh-mod-b dsh-cols-3">
      <div className="dsh-stack-blocks">
        <div className="dsh-blk">{weekly ? <WeeklyNumbers data={data} /> : <PeriodNumbers data={data} />}</div>
        <div className="dsh-blk">
          <h5>{chart.title}</h5>
          <p className="dsh-d">{chart.desc}</p>
          <EvolutionChart weeks={chart.items} bucket={chart.bucket} />
        </div>
      </div>
      <div className="dsh-blk">
        <h5>{CONTRACTOR_TITLE}</h5>
        <p className="dsh-d">{contractorDesc(data)}</p>
        {empty ? <EmptyNote text={empty} workId={workId} /> : <HBars rows={contractorRows(data)} />}
      </div>
      <div className="dsh-stack-blocks">
        <div className="dsh-blk">
          <h5>{FLOOR_TITLE}</h5>
          <p className="dsh-d">{floorDesc(data)}</p>
          {empty ? <p className="dsh-empty">{empty}</p> : <HBars rows={floorRows(data)} />}
        </div>
        <div className="dsh-blk">
          <h5>{TYPE_TITLE}</h5>
          <p className="dsh-d">Pelo tipo da pendência; até 6 fatias, o resto em "Outros".</p>
          {empty ? (
            <p className="dsh-empty">{empty}</p>
          ) : (
            <Donut slices={data.byType} total={data.open} title={TYPE_TITLE} centerLabel="abertas" />
          )}
        </div>
      </div>
      {data.filtered && (
        <p className="dsh-legend" style={{ gridColumn: '1 / -1' }}>
          <span>O recorte de empreiteiro e de pavimento vale em todo este quadro: contagens, listas, rosca e evolução.</span>
        </p>
      )}
    </div>
  );
}

/** Os números miúdos fora da escala semanal: o fluxo do período e o retrato no sábado final, com a diferença
 * para a véspera da segunda-feira inicial. */
function PeriodNumbers({ data }: { data: TerminalityPanelData }) {
  const refDay = dayMonth(data.refDate);
  const eve = dayMonth(addDays(data.period.start, -1));
  const delta = data.open - data.period.openAtStart;
  return (
    <div className="dsh-mini">
      <div>
        <div className="l">Abertas {data.periodIn}</div>
        <div className="v">{data.period.opened}</div>
        <div className="h">
          observadas de {dayMonth(data.period.start)} a {refDay}
        </div>
      </div>
      <div>
        <div className="l">Resolvidas {data.periodIn}</div>
        <div className="v t-good">{data.period.resolved}</div>
        <div className="h">
          {data.period.averageDaysToResolve === undefined
            ? `nenhuma corrigida ${data.periodIn}`
            : `em média ${plural(Math.round(data.period.averageDaysToResolve), 'dia', 'dias')} para resolver`}
        </div>
      </div>
      <div>
        <div className="l">Em aberto em {refDay}</div>
        <div className={`v${data.open > 0 ? ' t-bad' : ''}`}>{data.open}</div>
        <div className="h">
          eram {data.period.openAtStart} em {eve} ·{' '}
          <span className={delta > 0 ? 't-bad' : delta < 0 ? 't-good' : undefined}>{balanceDelta(delta)}</span>
        </div>
      </div>
      <div>
        <div className="l">Tempo médio em aberto</div>
        <div className="v">{data.averageOpenDays === undefined ? '—' : plural(data.averageOpenDays, 'dia', 'dias')}</div>
        <div className="h">
          {data.percentLabel} resolvido{data.open > 0 ? ` · ${data.olderThan30} há mais de 30 dias` : ''}
        </div>
      </div>
    </div>
  );
}

/** Os números miúdos da escala semanal: o retrato no sábado, como antes das escalas de tempo. */
function WeeklyNumbers({ data }: { data: TerminalityPanelData }) {
  const refDay = dayMonth(data.refDate);
  return (
    <div className="dsh-mini">
      <div>
        <div className="l">Abertas</div>
        <div className={`v${data.open > 0 ? ' t-bad' : ''}`}>{data.open}</div>
        <div className="h">na data, {refDay}</div>
      </div>
      <div>
        <div className="l">Resolvidas</div>
        <div className="v t-good">{data.resolved}</div>
        <div className="h">com data de correção até {refDay}</div>
      </div>
      <div>
        <div className="l">Resolvido</div>
        <div className="v">{data.percentLabel}</div>
        <div className="h">de {plural(data.total, 'registrada', 'registradas')}</div>
      </div>
      <div>
        <div className="l">Tempo médio em aberto</div>
        <div className="v">{data.averageOpenDays === undefined ? '—' : plural(data.averageOpenDays, 'dia', 'dias')}</div>
        <div className="h">{data.open > 0 ? `${data.olderThan30} há mais de 30 dias` : 'desde a data de observação'}</div>
      </div>
    </div>
  );
}

/** A frase do vazio na tela, com o caminho para a lista da aba 5. */
function EmptyNote({ text, workId }: { text: string; workId: string }) {
  return (
    <p className="dsh-empty">
      {text} <Link href={workPath(workId, 'terminalidade')}>Abrir a lista de pendências</Link>
    </p>
  );
}

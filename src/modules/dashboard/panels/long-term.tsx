'use client';
import type { ReactNode } from 'react';
import { SCurve } from '@/modules/dashboard/charts';
import {
  capitalize,
  plannedByText,
  plannedSourceText,
  type LongTermDeviation,
  type LongTermPanelData,
} from '@/modules/dashboard/long-term-panel';
import { addDays } from '@/domain/validation';
import { dayMonth, monthOf, monthShort, pct, plural, signedDays, signedPoints } from '@/modules/dashboard/model';

/** Quadro do longo prazo (aba 1) na aba 0: a curva S do avanço físico planejado × medido, os cartões do
 * prazo e das contagens e os serviços com maior desvio na data. O mesmo dado desenha a tela (`screen`) e a
 * folha 2 do PDF (`paper`); o cabeçalho com o link "Abrir aba" é do coordenador da página, não deste quadro.
 * Fora da escala semanal (04/11/2026), o quadro diz quanto o medido e o planejado andaram no período e a
 * curva S pinta a faixa do período; o acumulado continua sendo o do sábado final. */

const DEVIATION_COLUMNS = 'minmax(0,1fr) 52px 48px 52px';
const listText = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`);
const deltaClass = (delta: number) => (delta < 0 ? 't-bad' : delta > 0 ? 't-good' : '');

const isWeekly = (data: LongTermPanelData) => data.scale === 'semana';
/** "No mês: medido +3 p.p. × planejado +4 p.p." (sem medição até o fim, só o planejado; sem medição antes do
 * período, o medido do período é o acumulado, e o texto avisa). */
function periodText(data: LongTermPanelData): string {
  const { measuredGain, measuredAtStart, plannedGain } = data.period;
  const head = capitalize(data.periodIn);
  if (measuredGain === undefined) return `${head}: planejado ${signedPoints(plannedGain)}, sem medição.`;
  const first = measuredAtStart === undefined ? ' (sem medição antes do período)' : '';
  return `${head}: medido ${signedPoints(measuredGain)}${first} × planejado ${signedPoints(plannedGain)}.`;
}
/** A linha de explicação sob o título: de onde vem o planejado e como o medido se compara a ele. */
function description(data: LongTermPanelData): string {
  const source = `Planejado ${plannedByText(data)}`;
  const period = isWeekly(data) ? '' : ` ${periodText(data)}`;
  if (data.measured === undefined)
    return `${source}. Nenhuma medição até ${dayMonth(data.refDate)}: a curva mostra só o planejado.${period}`;
  const delta = data.delta ?? 0;
  return `${source}. Em ${dayMonth(data.refDate)}: medido ${pct(data.measured)} × planejado ${pct(data.planned)} (${signedPoints(delta)}).${period}`;
}
/** A faixa do período na curva S; ausente na escala semanal. */
const highlightOf = (data: LongTermPanelData) =>
  isWeekly(data) ? undefined : { from: data.period.start, to: data.period.end, label: `Período analisado (${data.periodLabel})` };
const plannedLabel = (data: LongTermPanelData) =>
  data.plannedSource === 'baseline' ? 'Planejado (linha de base)' : 'Planejado (plano atual)';
const MEASURED_LABEL = 'Medido (avanço físico por medição)';

function DeviationTable({ data }: { data: LongTermPanelData }) {
  if (data.measured === undefined)
    return (
      <p className="dsh-empty">
        Sem medição até {dayMonth(data.refDate)}: a comparação por serviço aparece quando a primeira medição do longo prazo for lançada.
      </p>
    );
  if (!data.deviations.length) return <p className="dsh-empty">Nenhum serviço com unidade de medição neste recorte.</p>;
  return (
    <div className="dsh-grid" role="table" aria-label="Serviços com maior desvio na data">
      <div className="thd" role="row" style={{ gridTemplateColumns: DEVIATION_COLUMNS }}>
        <span role="columnheader">Serviço</span>
        <span className="num" role="columnheader">
          Planej.
        </span>
        <span className="num" role="columnheader">
          Medido
        </span>
        <span className="num" role="columnheader">
          Desvio
        </span>
      </div>
      {data.deviations.map((row: LongTermDeviation) => (
        <div key={row.id} role="row" style={{ gridTemplateColumns: DEVIATION_COLUMNS }}>
          <span className="txt" role="cell" title={row.name}>
            {row.name}
          </span>
          <span className="num plain" role="cell">
            {pct(row.planned)}
          </span>
          <span className="num plain" role="cell">
            {pct(row.measured)}
          </span>
          <span className={`num ${deltaClass(row.delta)}`} role="cell">
            {signedPoints(row.delta)}
          </span>
        </div>
      ))}
    </div>
  );
}

function FloorCallout({ data }: { data: LongTermPanelData }) {
  if (!data.floorFiltered) return null;
  const floors = data.selectedFloors.length ? listText(data.selectedFloors) : 'nenhum pavimento deste plano';
  return (
    <div className="dsh-callout warn">
      Recorte por pavimento ({floors}): o planejado considera só esses pavimentos; a medição é por serviço e vale para o serviço inteiro.
    </div>
  );
}

function MiniCards({ data }: { data: LongTermPanelData }) {
  const span = data.span;
  const slip = span?.slip;
  return (
    <div className="dsh-mini">
      <div>
        <div className="l">Avanço físico medido</div>
        <div className="v">{data.measured === undefined ? '—' : pct(data.measured)}</div>
        <div className="h">
          {data.measured === undefined ? (
            `Sem medição até ${dayMonth(data.refDate)}`
          ) : (
            <>
              {plural(data.measurementCount, 'medição', 'medições')}
              {data.lastMeasurement ? `, última em ${dayMonth(data.lastMeasurement)}` : ''}
              {data.delta !== undefined && (
                <>
                  {' · '}
                  <span className={deltaClass(data.delta)}>{signedPoints(data.delta)} vs planejado</span>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <div>
        <div className="l">Planejado na data</div>
        <div className="v">{pct(data.planned)}</div>
        <div className="h">
          {dayMonth(data.refDate)} · {plannedSourceText(data)}
        </div>
      </div>
      {!isWeekly(data) && <PeriodCard data={data} />}
      <div>
        <div className="l">Prazo planejado</div>
        <div className="v">{span ? plural(span.months, 'mês', 'meses') : '—'}</div>
        <div className="h">
          {span ? (
            <>
              {monthShort(monthOf(span.start))} → {monthShort(monthOf(span.finish))} · {plural(span.days, 'dia', 'dias')}
              {slip !== undefined && (
                <>
                  {' · '}
                  {slip > 0 ? (
                    <span className="t-warn">{signedDays(slip)} dias vs LB</span>
                  ) : slip < 0 ? (
                    <span className="t-good">{signedDays(slip)} dias vs LB</span>
                  ) : (
                    'no prazo da LB'
                  )}
                </>
              )}
            </>
          ) : (
            'Sem serviço visível'
          )}
        </div>
      </div>
      <div>
        <div className="l">Serviços · pavimentos</div>
        <div className="v">
          {data.services} · {data.floors}
        </div>
        <div className="h">
          {plural(data.services, 'serviço visível', 'serviços visíveis')}
          {data.floorFiltered ? ' nos pavimentos escolhidos' : ''} · {plural(data.floors, 'pavimento no plano', 'pavimentos no plano')}
        </div>
      </div>
    </div>
  );
}

/** O avanço dentro do período (só fora da escala semanal): o medido no período contra o planejado no mesmo
 * intervalo, de quanto a quanto, com a véspera da segunda-feira inicial como ponto de partida. */
function PeriodCard({ data }: { data: LongTermPanelData }) {
  const { measuredGain, measuredAtStart, plannedAtStart, plannedGain, start } = data.period;
  const eve = dayMonth(addDays(start, -1));
  return (
    <div>
      <div className="l">Avanço {data.periodIn}</div>
      <div className={`v${measuredGain === undefined ? '' : ` ${deltaClass(measuredGain - plannedGain)}`}`}>
        {measuredGain === undefined ? '—' : signedPoints(measuredGain)}
      </div>
      <div className="h">
        planejado {signedPoints(plannedGain)}
        {measuredGain === undefined
          ? ` (${pct(plannedAtStart)} → ${pct(data.planned)}) · sem medição`
          : measuredAtStart === undefined
            ? ` · sem medição até ${eve}`
            : ` · medido ${pct(measuredAtStart)} em ${eve} → ${pct(data.measured ?? 0)}`}
      </div>
    </div>
  );
}

export function LongTermPanel({
  data,
  variant,
  workId: _workId,
}: {
  data: LongTermPanelData;
  variant: 'screen' | 'paper';
  /** Reservado: o link para a aba fica no cabeçalho que a página monta. */
  workId: string;
}): ReactNode {
  if (!data.services) {
    const empty =
      'Nenhum serviço do longo prazo passa pelos pavimentos escolhidos. Limpe o recorte de pavimentos para ver o plano inteiro.';
    return variant === 'paper' ? (
      <div className="dsh-panel">
        <h3>Aba 1 · Curva S · planejado × medido</h3>
        <p className="dsh-empty">{empty}</p>
      </div>
    ) : (
      <div className="dsh-mod-b">
        <p className="dsh-empty">{empty}</p>
      </div>
    );
  }

  if (variant === 'paper') {
    return (
      <div className="dsh-panel">
        <h3>Aba 1 · Curva S · planejado × medido</h3>
        <p className="dsh-desc">
          {description(data)}
          {data.span && (
            <>
              {' '}
              Prazo planejado: {plural(data.span.months, 'mês', 'meses')}, {dayMonth(data.span.start)} → {dayMonth(data.span.finish)}
              {data.span.slip !== undefined && data.span.slip !== 0 ? ` (${signedDays(data.span.slip)} dias vs linha de base)` : ''}.
            </>
          )}
          {data.floorFiltered &&
            ` Recorte por pavimento (${data.selectedFloors.length ? listText(data.selectedFloors) : 'nenhum deste plano'}): a medição é por serviço inteiro.`}
        </p>
        <SCurve
          points={data.curve}
          measured={data.measurements}
          refDate={data.refDate}
          refLabel={data.refLabel}
          plannedLabel={plannedLabel(data)}
          measuredLabel={MEASURED_LABEL}
          highlight={highlightOf(data)}
          width={560}
          height={250}
        />
        <p className="dsh-desc" style={{ marginTop: 6, fontWeight: 700, color: '#1f2937' }}>
          Serviços com maior desvio na data
        </p>
        <DeviationTable data={data} />
      </div>
    );
  }

  return (
    <div className="dsh-mod-b dsh-cols-2">
      <div className="dsh-blk">
        <h5>Curva S · avanço físico planejado × medido</h5>
        <p className="dsh-d">{description(data)}</p>
        <SCurve
          points={data.curve}
          measured={data.measurements}
          refDate={data.refDate}
          refLabel={data.refLabel}
          plannedLabel={plannedLabel(data)}
          measuredLabel={MEASURED_LABEL}
          highlight={highlightOf(data)}
        />
        <FloorCallout data={data} />
      </div>
      <div className="dsh-blk">
        <MiniCards data={data} />
        <h5 style={{ marginTop: 12 }}>Serviços com maior desvio na data</h5>
        <p className="dsh-d">
          {data.measured === undefined
            ? 'Planejado × medido por serviço mensurável, em pontos percentuais.'
            : `Os ${Math.min(data.deviations.length, 5)} serviços mais distantes do planejado em ${dayMonth(data.refDate)}; serviço com unidade e sem medição conta como 0%.`}
        </p>
        <DeviationTable data={data} />
      </div>
    </div>
  );
}

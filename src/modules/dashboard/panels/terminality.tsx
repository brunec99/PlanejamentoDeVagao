'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Donut, EvolutionChart, HBars } from '@/modules/dashboard/charts';
import { dayMonth, plural } from '@/modules/dashboard/model';
import type { TerminalityPanelData } from '@/modules/dashboard/terminality-panel';
import { workPath } from '@/shared/format';

/** Quadro da terminalidade (aba 5) na aba 0, nas duas saídas: `screen` é um bloco de três colunas dentro
 * do módulo da tela; `paper` são três painéis que o PDF põe na folha 4, com os cartões do topo montados pela
 * folha. Os mesmos gráficos de `charts.tsx` desenham os dois, mudando só o tamanho. */

const EVOLUTION_DESC = 'Pendências abertas e resolvidas em cada semana, e o saldo em aberto no fim dela.';
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

  if (variant === 'paper')
    return (
      <>
        <div className="dsh-panel">
          <h3>Aba 5 · Evolução nas 12 semanas</h3>
          <p className="dsh-desc">
            {EVOLUTION_DESC} Até {refDay}
            {data.filtered ? ', no recorte de empreiteiro ou pavimento escolhido' : ''}.
          </p>
          <EvolutionChart weeks={data.weeks} width={560} height={250} />
        </div>
        <div className="dsh-panel">
          <h3>Aba 5 · {CONTRACTOR_TITLE}</h3>
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
          <h3>Aba 5 · {FLOOR_TITLE}</h3>
          <p className="dsh-desc">{floorDesc(data)}</p>
          {empty ? <p className="dsh-empty">{empty}</p> : <HBars rows={floorRows(data)} />}
        </div>
      </>
    );

  return (
    <div className="dsh-mod-b dsh-cols-3">
      <div className="dsh-stack-blocks">
        <div className="dsh-blk">
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
        </div>
        <div className="dsh-blk">
          <h5>Evolução · 12 semanas</h5>
          <p className="dsh-d">{EVOLUTION_DESC}</p>
          <EvolutionChart weeks={data.weeks} />
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

/** A frase do vazio na tela, com o caminho para a lista da aba 5. */
function EmptyNote({ text, workId }: { text: string; workId: string }) {
  return (
    <p className="dsh-empty">
      {text} <Link href={workPath(workId, 'terminalidade')}>Abrir a lista de pendências</Link>
    </p>
  );
}

'use client';
import { FREQUENCY_LABEL } from '@/domain/equipment-checklist';
import { formatDate } from '@/shared/format';
import { Legend } from '../charts';
import { dayMonth, pct, plural } from '../model';
import { checklistOnTime, COVERAGE_LABEL, coverageText, coverageTone, idpLabel, idpToneOf, missingText, SERVICES_SHOWN } from './extras';
import { Name } from './portfolio-charts';
import type { WorkdayCoverage } from '../extras/types';
import type { PortfolioCardOwners, PortfolioRow, PortfolioServices, PortfolioTotals } from './types';

/** Os quadros de 12/11/2026 no Dashboard geral (modelo aprovado "Dashboards completos e resumo semanal", regras 4
 * a 8), na tela e no papel: uma linha por obra em cada módulo, como os quadros de 04/11 (`.pf-rows`), mais
 * "Serviços medidos em mais de uma obra" e os responsáveis com mais cards vencidos. Só leem `PortfolioData`;
 * nada se calcula aqui além de escalar barras. Estado sempre com cor e texto. Nenhum valor em reais. */

const int = (value: number) => Math.round(value).toLocaleString('pt-BR');
const decimal = (value: number) =>
  value.toLocaleString('pt-BR', { minimumFractionDigits: value < 100 ? 1 : 0, maximumFractionDigits: value < 100 ? 1 : 0 });
const clamp = (value: number) => Math.max(0, Math.min(100, value));

const OWN = '#1c5cab';
const CONTRACTOR = '#8cc6e4';
const MEASURED = '#2a78d6';
const PENDING = '#cde2fb';
const TODO = '#cde2fb';
const DOING = '#2a78d6';
const PAUSED = '#f5a524';
const REAL = '#1c5cab';
const PLANNED = '#b7d3f6';
const ON_TIME = '#10b981';
const LATE = '#be123c';

function CoverageTag({ coverage }: { coverage: WorkdayCoverage }) {
  const tone = coverageTone(coverage);
  return (
    <span
      className={`dsh-tag ${tone}`}
      title={`${coverage.launched} de ${plural(coverage.expected, 'dia útil', 'dias úteis')} com lançamento`}
    >
      {coverageText(coverage)} dias · {COVERAGE_LABEL[tone]}
    </span>
  );
}

// ─── Histograma (2.2), regra 4 ──────────────────────────────────────────────────────────────────────────

export function HeadcountRows({ rows, total }: { rows: readonly PortfolioRow[]; total: PortfolioTotals['headcount'] }) {
  const list = rows.filter(row => row.headcount);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com lançamento no histograma.</p>;
  const peak = Math.max(1, ...list.map(row => row.headcount!.dailyAverage));
  return (
    <>
      <div className="pf-rows">
        {list.map(row => {
          const h = row.headcount!;
          const contractor = h.dailyAverage * h.contractorShare;
          const own = h.dailyAverage - contractor;
          const width = (h.dailyAverage / peak) * 100;
          const top = h.companies
            .slice(0, 3)
            .map(company => `${company.name} ${decimal(company.averagePresent)}`)
            .join(' · ');
          return (
            <div
              key={row.work.id}
              className="pf-rowx"
              title={`${row.work.name}\nEfetivo médio ${int(h.dailyAverage)} por dia útil lançado (${int(own)} próprios e ${int(contractor)} de empreiteiros)\n${int(
                h.manDays,
              )} homens-dia · pico de ${int(h.peak)}${h.peakDay ? ` em ${dayMonth(h.peakDay)}` : ''}${top ? `\nMaiores equipes: ${top}` : ''}`}
            >
              <Name work={row.work} sub={h.lastDay ? `último dia ${dayMonth(h.lastDay)}` : undefined} />
              <span
                className="pf-stackb"
                role="img"
                aria-label={`Efetivo médio ${int(h.dailyAverage)}: ${int(own)} próprios e ${int(contractor)} de empreiteiros`}
                style={{ width: `${clamp(width)}%` }}
              >
                {own > 0 && <b style={{ flex: own, background: OWN }} />}
                {contractor > 0 && <b style={{ flex: contractor, background: CONTRACTOR }} />}
              </span>
              <span className="meta">
                <b>{int(h.dailyAverage)}</b> por dia · {pct(h.contractorShare * 100)} empreit. · <CoverageTag coverage={h.coverage} />
              </span>
              <span className="sub2">
                Pico de {int(h.peak)}
                {h.peakDay ? ` em ${dayMonth(h.peakDay)}` : ''} · {missingText(h.coverage)}
              </span>
            </div>
          );
        })}
        {list.length > 1 && (
          <div className="pf-rowx total">
            <span className="nm">
              Todas<small>{plural(total.works, 'obra', 'obras')}</small>
            </span>
            <span className="muted">soma do efetivo médio das obras</span>
            <span className="meta">
              <b>{int(total.dailyAverage)}</b> por dia
              {total.contractorShare !== undefined && <> · {pct(total.contractorShare * 100)} empreit.</>} · {coverageText(total)} dias
            </span>
          </div>
        )}
      </div>
      <Legend
        items={[
          { color: OWN, text: 'próprio (ATR/Takt)' },
          { color: CONTRACTOR, text: 'empreiteiros' },
        ]}
      />
    </>
  );
}

// ─── Produtividade (2.3), regra 5 ───────────────────────────────────────────────────────────────────────

export function ProductionRows({ rows, total }: { rows: readonly PortfolioRow[]; total: PortfolioTotals['production'] }) {
  const list = rows.filter(row => row.production);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com lançamento na produtividade.</p>;
  return (
    <>
      <div className="pf-rows">
        {list.map(row => {
          const p = row.production!;
          const share = p.measuredShare === undefined ? undefined : p.measuredShare * 100;
          return (
            <div
              key={row.work.id}
              className="pf-rowx"
              title={`${row.work.name}\n${plural(p.entries, 'lançamento', 'lançamentos')} no período · ${int(p.manDays)} homens-dia\n${int(
                p.measured,
              )} com produção medida e ${int(p.pending)} a medir`}
            >
              <Name work={row.work} sub={p.lastDay ? `último dia ${dayMonth(p.lastDay)}` : undefined} />
              {p.entries ? (
                <span
                  className="pf-stackb"
                  role="img"
                  aria-label={`${int(p.measured)} lançamentos com produção medida e ${int(p.pending)} a medir`}
                >
                  {p.measured > 0 && <b style={{ flex: p.measured, background: MEASURED }} />}
                  {p.pending > 0 && <b style={{ flex: p.pending, background: PENDING }} />}
                </span>
              ) : (
                <span className="muted">nenhum lançamento no período</span>
              )}
              <span className="meta">
                <b>{share === undefined ? '—' : pct(share)}</b> medido · {int(p.entries)} lanç. · {int(p.manDays)} Hd ·{' '}
                <CoverageTag coverage={p.coverage} />
              </span>
              <span className="sub2">{missingText(p.coverage)}</span>
            </div>
          );
        })}
        {list.length > 1 && (
          <div className="pf-rowx total">
            <span className="nm">
              Todas<small>{plural(total.works, 'obra', 'obras')}</small>
            </span>
            <span className="muted">parcela medida ponderada pelos lançamentos</span>
            <span className="meta">
              <b>{total.measuredShare === undefined ? '—' : pct(total.measuredShare * 100)}</b> medido · {int(total.entries)} lanç. ·{' '}
              {int(total.manDays)} Hd · {coverageText(total)} dias
            </span>
          </div>
        )}
      </div>
      <Legend
        items={[
          { color: MEASURED, text: 'com produção medida' },
          { color: PENDING, text: 'a medir' },
        ]}
      />
    </>
  );
}

/** "Serviços medidos em mais de uma obra": produção por homem-dia de cada obra, lado a lado. Sem cor de bom ou
 * ruim: não há meta de produtividade por serviço; o negrito marca a melhor obra de cada linha. */
export function ServicesTable({ services }: { services: PortfolioServices }) {
  if (!services.rows.length)
    return <p className="dsh-empty">Nenhum serviço medido em mais de uma obra no período (mesmo nome e mesma unidade).</p>;
  return (
    <div className="pf-xscroll">
      <table className="pf-heat pf-svc">
        <thead>
          <tr>
            <th aria-label="Serviço" />
            {services.works.map(work => (
              <th key={work.id} scope="col" title={work.name}>
                {work.code || work.name}
              </th>
            ))}
            <th scope="col">Todas</th>
          </tr>
        </thead>
        <tbody>
          {services.rows.map(row => {
            const best = Math.max(...Object.values(row.byWork).map(cell => cell.perManDay));
            return (
              <tr key={`${row.key}|${row.unit}`}>
                <th scope="row" className="rowh" title={`${row.name} (${row.unit} por homem-dia)`}>
                  {row.name} <span className="t-mut">{row.unit}/Hd</span>
                </th>
                {services.works.map(work => {
                  const cell = row.byWork[work.id];
                  if (!cell)
                    return (
                      <td key={work.id} className="none" title={`${row.name} sem medição em ${work.name}`}>
                        ·
                      </td>
                    );
                  return (
                    <td
                      key={work.id}
                      className={cell.perManDay === best ? 'strong' : undefined}
                      title={`${row.name} em ${work.name}: ${decimal(cell.perManDay)} ${row.unit} por homem-dia\n${decimal(cell.quantity)} ${row.unit} em ${int(cell.manDays)} homens-dia`}
                    >
                      {decimal(cell.perManDay)}
                    </td>
                  );
                })}
                <td className="strong tot" title={`${row.name}, somando as obras: ${int(row.manDays)} homens-dia`}>
                  {decimal(row.perManDay)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
export const SERVICES_NOTE = `Até ${SERVICES_SHOWN} serviços, pelos homens-dia. O nome é digitado em cada obra: só pareia o que tem o mesmo nome (sem acento) e a mesma unidade.`;

// ─── Quadro de Restrições (1.4), regra 6 ────────────────────────────────────────────────────────────────

export function RestrictionRows({ rows, total }: { rows: readonly PortfolioRow[]; total: PortfolioTotals['restrictions'] }) {
  const list = rows.filter(row => row.restrictions);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com cards no Quadro de Restrições.</p>;
  return (
    <>
      <div className="pf-rows">
        {list.map(row => {
          const r = row.restrictions!;
          const counts = `${r.byStatus.todo} a fazer · ${r.byStatus.doing} fazendo · ${r.byStatus.paused} pausados`;
          return (
            <div key={row.work.id} className="pf-rowx" title={`${row.work.name} em ${dayMonth(r.asOf)}\n${counts}`}>
              <Name work={row.work} sub={plural(r.open, 'card em aberto', 'cards em aberto')} />
              {r.open ? (
                <span className="pf-stackb" role="img" aria-label={`Cards em aberto: ${counts}`}>
                  {r.byStatus.todo > 0 && <b style={{ flex: r.byStatus.todo, background: TODO }} />}
                  {r.byStatus.doing > 0 && <b style={{ flex: r.byStatus.doing, background: DOING }} />}
                  {r.byStatus.paused > 0 && <b style={{ flex: r.byStatus.paused, background: PAUSED }} />}
                </span>
              ) : (
                <span className="muted">nenhum card em aberto</span>
              )}
              <span className="meta">
                <span className={r.overdue ? 't-bad' : 't-good'}>
                  <b>{r.overdue}</b> {r.overdue === 1 ? 'vencido' : 'vencidos'}
                </span>{' '}
                ·{' '}
                <span className={r.startOverdue ? 't-warn' : 't-good'}>
                  <b>{r.startOverdue}</b> começo atrasado
                </span>
              </span>
              <span className="sub2">
                No período: {plural(r.doneInPeriod, 'concluído', 'concluídos')}, {plural(r.createdInPeriod, 'criado', 'criados')}
                {r.cancelledInPeriod ? `, ${plural(r.cancelledInPeriod, 'cancelado', 'cancelados')}` : ''}
              </span>
            </div>
          );
        })}
        {list.length > 1 && (
          <div className="pf-rowx total">
            <span className="nm">
              Todas<small>{plural(total.open, 'card em aberto', 'cards em aberto')}</small>
            </span>
            <span className="muted">
              {plural(total.doneInPeriod, 'concluído', 'concluídos')} e {plural(total.createdInPeriod, 'criado', 'criados')} no período
            </span>
            <span className="meta">
              <span className={total.overdue ? 't-bad' : 't-good'}>
                <b>{total.overdue}</b> {total.overdue === 1 ? 'vencido' : 'vencidos'}
              </span>{' '}
              · <b>{total.startOverdue}</b> começo atrasado
            </span>
          </div>
        )}
      </div>
      <Legend
        items={[
          { color: TODO, text: 'a fazer' },
          { color: DOING, text: 'fazendo' },
          { color: PAUSED, text: 'pausado' },
        ]}
      />
    </>
  );
}

export function CardOwnersList({ owners }: { owners: PortfolioCardOwners }) {
  if (!owners.rows.length) return <p className="dsh-empty">Nenhum card vencido entre os responsáveis com mais cards em aberto.</p>;
  return (
    <div className="dsh-grid pf-g3">
      <div className="thd">
        <span>Responsável</span>
        <span className="num">Vencidos</span>
        <span>Por obra (vencidos / abertos)</span>
      </div>
      {owners.rows.map(row => (
        <div key={row.name}>
          <span className="txt" title={row.name}>
            {row.name}
          </span>
          <span className="num t-bad">{row.overdue}</span>
          <span
            className="muted txt"
            title={row.byWork.map(item => `${item.work.name}: ${item.overdue} vencidos de ${item.open} em aberto`).join('\n')}
          >
            {row.byWork.map(item => `${item.work.code || item.work.name} ${item.overdue}/${item.open}`).join(' · ')}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Linha de Balanço e legalização (1.1), regra 7 ──────────────────────────────────────────────────────

export function IdpRows({ rows }: { rows: readonly PortfolioRow[] }) {
  const list = rows.filter(row => row.balance?.lob);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com Linha de Balanço.</p>;
  return (
    <>
      <div className="pf-rows">
        {list.map(row => {
          const lob = row.balance!.lob!;
          const weighting = lob.weighting === 'cost' ? 'peso por custo' : 'peso por duração';
          if (lob.idp === undefined || lob.real === undefined || lob.planned === undefined)
            return (
              <div key={row.work.id} className="pf-rowx">
                <Name work={row.work} sub={weighting} />
                <span className="muted">
                  {lob.status === 'no-measurement' ? 'sem medição fechada até o fim do período' : 'nada planejado até a data da medição'}
                </span>
                <span />
              </div>
            );
          return (
            <div
              key={row.work.id}
              className="pf-rowx"
              title={`${row.work.name}\nReal ${pct(lob.real)} × planejado ${pct(lob.planned)}${
                lob.measurementDate ? ` na medição de ${formatDate(lob.measurementDate)}` : ''
              }\n${lob.baselineName ? `Linha de base: ${lob.baselineName}` : 'Planejado pelo cronograma atual'} · ${weighting}`}
            >
              <Name work={row.work} sub={weighting} />
              <span className="pf-bullet" role="img" aria-label={`Real ${pct(lob.real)}, planejado ${pct(lob.planned)}`}>
                <span className="pl" style={{ width: `${clamp(lob.planned)}%` }} />
                <span className="me" style={{ width: `${clamp(lob.real)}%` }} />
              </span>
              <span className="meta">
                <b>{pct(lob.real)}</b> × {pct(lob.planned)} <span className={`dsh-tag ${idpToneOf(lob.idp)}`}>IDP {idpLabel(lob.idp)}</span>
              </span>
              <span className="sub2">
                {lob.measurementNumber !== undefined ? `Medição ${lob.measurementNumber}` : 'Última medição fechada'}
                {lob.measurementDate ? ` de ${formatDate(lob.measurementDate)}` : ''} ·{' '}
                {lob.baselineName ? `linha de base ${lob.baselineName}` : 'sem linha de base, pelo cronograma atual'}
              </span>
            </div>
          );
        })}
      </div>
      <Legend
        items={[
          { color: PLANNED, text: 'planejado' },
          { color: REAL, text: 'real' },
        ]}
      />
    </>
  );
}

export function LegalizationRows({ rows }: { rows: readonly PortfolioRow[] }) {
  const list = rows.filter(row => row.balance?.legalization);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com Gantt de legalização.</p>;
  return (
    <div className="pf-rows">
      {list.map(row => {
        const l = row.balance!.legalization!;
        const share = l.milestones.total ? (l.milestones.done / l.milestones.total) * 100 : 0;
        return (
          <div
            key={row.work.id}
            className="pf-rowx"
            title={`${row.work.name}\n${l.milestones.done} de ${plural(l.milestones.total, 'marco concluído', 'marcos concluídos')}\n${l.tasks.done} de ${plural(
              l.tasks.total,
              'tarefa concluída',
              'tarefas concluídas',
            )}`}
          >
            <Name work={row.work} sub={l.deliveryDate ? `entrega ${formatDate(l.deliveryDate)}` : undefined} />
            <span className="dsh-track" role="img" aria-label={`${l.milestones.done} de ${l.milestones.total} marcos concluídos`}>
              <b style={{ width: `${clamp(share)}%` }} />
            </span>
            <span className="meta">
              <b>
                {l.milestones.done}/{l.milestones.total}
              </b>{' '}
              marcos ·{' '}
              <span className={l.late ? 't-warn' : 't-good'}>
                <b>{l.late}</b> {l.late === 1 ? 'atrasada' : 'atrasadas'}
              </span>
            </span>
            <span className="sub2">
              {l.next ? `Próximo marco: ${l.next.name}, ${dayMonth(l.next.date)}` : 'Sem próximo marco'}
              {l.forecast && l.lateDays > 0 ? ` · entrega prevista ${formatDate(l.forecast)} (${l.lateDays} d.u. depois)` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Checklist de equipamentos (3.2), regra 8 ───────────────────────────────────────────────────────────

export function ChecklistRows({ rows, total }: { rows: readonly PortfolioRow[]; total: PortfolioTotals['checklist'] }) {
  const list = rows.filter(row => row.checklist);
  if (!list.length) return <p className="dsh-empty">Nenhuma obra com equipamento no checklist.</p>;
  return (
    <>
      <div className="pf-rows">
        {list.map(row => {
          const c = row.checklist!;
          const onTime = checklistOnTime(c);
          const pending = c.pendingList.map(item => `${item.equipment} (${FREQUENCY_LABEL[item.frequency].toLowerCase()})`);
          const rest = c.pending - pending.length;
          return (
            <div
              key={row.work.id}
              className="pf-rowx"
              title={`${row.work.name}\nHoje: ${onTime} em dia e ${c.pending} vencidos de ${plural(c.due, 'checklist devido', 'checklists devidos')}\nNo período: ${plural(
                c.runsInPeriod,
                'inspeção',
                'inspeções',
              )}, ${c.runsWithNonConformity} com não conformidade`}
            >
              <Name work={row.work} sub={plural(c.equipment, 'equipamento', 'equipamentos')} />
              {c.due ? (
                <span className="pf-stackb" role="img" aria-label={`Checklists de hoje: ${onTime} em dia e ${c.pending} vencidos`}>
                  {onTime > 0 && <b style={{ flex: onTime, background: ON_TIME }} />}
                  {c.pending > 0 && <b style={{ flex: c.pending, background: LATE }} />}
                </span>
              ) : (
                <span className="muted">nenhum checklist devido hoje</span>
              )}
              <span className="meta">
                <b>
                  {onTime}/{c.due}
                </b>{' '}
                em dia ·{' '}
                <span className={c.pending ? 't-bad' : 't-good'}>
                  <b>{c.pending}</b> {c.pending === 1 ? 'vencido' : 'vencidos'}
                </span>{' '}
                ·{' '}
                <span className={c.nonConformities ? 't-warn' : 't-good'}>
                  <b>{c.nonConformities}</b> NC
                </span>
              </span>
              <span className="sub2">
                No período: {plural(c.runsInPeriod, 'inspeção', 'inspeções')}
                {c.runsWithNonConformity ? `, ${c.runsWithNonConformity} com não conformidade` : ''}
                {pending.length ? ` · vencidos hoje: ${pending.join(', ')}${rest > 0 ? ` e mais ${rest}` : ''}` : ''}
              </span>
            </div>
          );
        })}
        {list.length > 1 && (
          <div className="pf-rowx total">
            <span className="nm">
              Todas<small>{plural(total.equipment, 'equipamento', 'equipamentos')}</small>
            </span>
            <span className="muted">{plural(total.runsInPeriod, 'inspeção', 'inspeções')} no período</span>
            <span className="meta">
              <span className={total.pending ? 't-bad' : 't-good'}>
                <b>{total.pending}</b> {total.pending === 1 ? 'vencido' : 'vencidos'}
              </span>{' '}
              de {total.due} hoje · <b>{total.nonConformities}</b> NC
            </span>
          </div>
        )}
      </div>
      <Legend
        items={[
          { color: ON_TIME, text: 'em dia hoje' },
          { color: LATE, text: 'vencido hoje' },
          { text: 'NC = itens não conformes nas inspeções do período' },
        ]}
      />
    </>
  );
}

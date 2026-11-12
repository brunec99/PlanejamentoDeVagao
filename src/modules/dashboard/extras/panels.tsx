'use client';
import type { ReactNode } from 'react';
import { FREQUENCY_LABEL } from '@/domain/equipment-checklist';
import { SAFETY_CONSEQUENCES } from '@/domain/safety';
import { formatDate } from '@/shared/format';
import { NONE } from '@/modules/seguranca/safety-view';
import { HBars, StackBar } from '../charts';
import { dayMonth, pct, plural, signedDays, type Tone } from '../model';
import { SAFETY_CONSEQUENCE_COLORS } from '../portfolio/portfolio-charts';
import type { PortfolioSafety } from '../portfolio/types';
import {
  coverageLabel,
  coverageTone,
  coverageValue,
  crewLabel,
  idpView,
  lobStatusText,
  missingText,
  oneDecimal,
  shareLabel,
  weightingText,
  type BalancePanelData,
} from './extras-summary';
import type { ChecklistBlock, HeadcountBlock, ProductionBlock, RestrictionsBlock, WorkdayCoverage } from './types';

/** Os seis quadros de 12/11/2026 na aba 0 (modelo "Dashboards completos e resumo semanal", regras 3 a 8), nas
 * duas saídas, como os quadros de 04/11: `screen` é o corpo do módulo na tela; `paper` é um painel só, que o
 * PDF põe nas folhas "Linha de Balanço e Quadro de Restrições" e "Controles de obra e SST". Os blocos chegam
 * calculados de `GET /api/dashboard/extras` (a legalização, do planejamento já carregado); aqui só se desenha.
 * Estes quadros não seguem o recorte de empreiteiro nem de pavimento, e cada um diz isso quando há recorte. */

export interface ExtrasPanelContext {
  /** "no mês", "na semana". */
  periodIn: string;
  /** "do mês", "da semana". */
  periodOf: string;
  /** Sábado final do período, AAAA-MM-DD. */
  end: string;
  /** Há recorte de empreiteiro ou de pavimento ativo (que estes quadros não seguem). */
  filtered: boolean;
}
type Variant = 'screen' | 'paper';

const toneText = (tone?: Tone) => (tone === 'good' ? 't-good' : tone === 'warn' ? 't-warn' : tone === 'bad' ? 't-bad' : '');

function Mini({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div>
      <div className="l">{label}</div>
      <div className={`v ${toneText(tone)}`}>{value}</div>
      {hint !== undefined && <div className="h">{hint}</div>}
    </div>
  );
}

const NO_FILTER_NOTE = 'Este quadro mostra a obra inteira: não segue o recorte de empreiteiro nem de pavimento.';
function NoFilterNote({ ctx }: { ctx: ExtrasPanelContext }) {
  if (!ctx.filtered) return null;
  return (
    <p className="dsh-legend" style={{ gridColumn: '1 / -1' }}>
      <span>{NO_FILTER_NOTE}</span>
    </p>
  );
}

/** Corpo comum: na tela, colunas de blocos; no papel, um painel com título, descrição e os mesmos blocos. */
function Frame({
  variant,
  title,
  desc,
  columns = 2,
  ctx,
  children,
}: {
  variant: Variant;
  title: string;
  desc: string;
  columns?: 2 | 3;
  ctx: ExtrasPanelContext;
  children: ReactNode;
}) {
  if (variant === 'paper')
    return (
      <div className="dsh-panel dsh-xp">
        <h3>{title}</h3>
        <p className="dsh-desc">
          {desc}
          {ctx.filtered ? ` ${NO_FILTER_NOTE}` : ''}
        </p>
        <div className="dsh-xp-b">{children}</div>
      </div>
    );
  return (
    <div className={`dsh-mod-b ${columns === 3 ? 'dsh-cols-3' : 'dsh-cols-21'}`}>
      {children}
      <NoFilterNote ctx={ctx} />
    </div>
  );
}

function Block({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="dsh-blk">
      <h5>{title}</h5>
      {desc && <p className="dsh-d">{desc}</p>}
      {children}
    </div>
  );
}

function CoverageMini({ coverage, label = 'Dias lançados' }: { coverage: WorkdayCoverage; label?: string }) {
  const tone = coverageTone(coverage);
  return (
    <Mini
      label={label}
      value={
        <>
          {coverageValue(coverage)} <span className={`dsh-tag ${tone}`}>{coverageLabel(coverage)}</span>
        </>
      }
      hint="dias úteis"
    />
  );
}
function MissingDays({ coverage, what }: { coverage: WorkdayCoverage; what: string }) {
  const text = missingText(coverage, 6);
  if (!text) return null;
  const tone = coverageTone(coverage);
  return (
    <p className={`dsh-callout${tone === 'bad' ? ' alert' : tone === 'warn' ? ' warn' : ''}`}>
      Sem {what}: {text}.
    </p>
  );
}

// ─── 1.1 · Linha de Balanço e legalização ───────────────────────────────────────────────────────────
export function BalancePanel({ data, variant, ctx }: { data: BalancePanelData; variant: Variant; ctx: ExtrasPanelContext }) {
  const { lob, legalization } = data;
  const idp = lob ? idpView(lob) : undefined;
  const refDay = dayMonth(ctx.end);
  return (
    <Frame
      variant={variant}
      title="Aba 1.1 · Linha de Balanço e legalização"
      desc={`IDP da última medição fechada até ${refDay} e o Gantt de legalização na mesma data. Sem valores em reais.`}
      ctx={ctx}
    >
      <Block
        title="Linha de Balanço: IDP"
        desc="Índice de desempenho de prazo: avanço real ÷ planejado na data da medição. 1,00 ou mais está em dia; de 0,90 a 0,99, atenção."
      >
        {!lob ? (
          <p className="dsh-empty">Sem Linha de Balanço nesta obra, ou módulo indisponível.</p>
        ) : !idp ? (
          <p className="dsh-empty">{lobStatusText(lob)}</p>
        ) : (
          <>
            <div className="dsh-mini">
              <Mini
                label="IDP"
                value={
                  <>
                    {idp.value} <span className={`dsh-tag ${idp.tone}`}>{idp.label}</span>
                  </>
                }
                tone={idp.tone === 'good' ? undefined : idp.tone}
                hint={weightingText(lob)}
              />
              <Mini
                label="Real × planejado"
                value={`${pct(lob.real ?? 0)} × ${pct(lob.planned ?? 0)}`}
                hint={lob.baselineName ? `linha de base ${lob.baselineName}` : 'planejado pelo cronograma atual'}
              />
              <Mini
                label="Medição"
                value={lob.measurementNumber !== undefined ? `nº ${lob.measurementNumber}` : '—'}
                hint={lob.measurementDate ? `fechada em ${formatDate(lob.measurementDate)}` : undefined}
              />
            </div>
            <p className="dsh-legend">
              <span>O IDP só muda quando uma medição é fechada; medição depois de {refDay} não entra.</span>
            </p>
          </>
        )}
      </Block>
      <Block title="Gantt de legalização" desc={`Marcos e tarefas do cronograma de legalização em ${refDay}.`}>
        {!legalization ? (
          <p className="dsh-empty">Sem Gantt de legalização nesta obra.</p>
        ) : (
          <>
            <div className="dsh-mini">
              <Mini
                label="Marcos concluídos"
                value={`${legalization.milestones.done}/${legalization.milestones.total}`}
                hint={`${legalization.tasks.done} de ${plural(legalization.tasks.total, 'tarefa', 'tarefas')} concluídas`}
              />
              <Mini
                label="Tarefas atrasadas"
                value={legalization.late}
                tone={legalization.late > 0 ? 'bad' : undefined}
                hint={`término previsto antes de ${refDay} e menos de 100%`}
              />
              <Mini
                label="Entrega prevista"
                value={legalization.forecast ? formatDate(legalization.forecast) : '—'}
                tone={legalization.lateDays > 0 ? 'bad' : undefined}
                hint={
                  legalization.deliveryDate
                    ? `contratual ${formatDate(legalization.deliveryDate)} · ${
                        legalization.lateDays > 0
                          ? `${plural(legalization.lateDays, 'dia útil', 'dias úteis')} de atraso`
                          : legalization.lateDays < 0
                            ? `${plural(-legalization.lateDays, 'dia útil', 'dias úteis')} de folga`
                            : 'no prazo'
                      }`
                    : 'sem data contratual'
                }
              />
            </div>
            <p className="dsh-legend">
              <span>
                {legalization.next
                  ? `Próximo marco: ${legalization.next.name}, ${formatDate(legalization.next.date)}.`
                  : 'Nenhum marco de legalização por vir.'}
              </span>
            </p>
          </>
        )}
      </Block>
    </Frame>
  );
}

// ─── 1.4 · Quadro de Restrições ─────────────────────────────────────────────────────────────────────
export function RestrictionsPanel({ data, variant, ctx }: { data: RestrictionsBlock; variant: Variant; ctx: ExtrasPanelContext }) {
  const asOf = dayMonth(data.asOf);
  const paper = variant === 'paper';
  return (
    <Frame
      variant={variant}
      title="Aba 1.4 · Quadro de Restrições"
      desc={`Cards do Kanban em ${asOf}; concluídos, cancelados e criados ${ctx.periodIn}.`}
      ctx={ctx}
    >
      <Block
        title={`Cards em ${asOf}`}
        desc="Em aberto = A fazer, Fazendo e Pausado (o prazo não para na pausa). Vencido = passou da entrega sem concluir."
      >
        <div className={`dsh-mini${paper ? ' compact' : ''}`}>
          <Mini
            label="Em aberto"
            value={data.open}
            hint={`${data.byStatus.todo} a fazer · ${data.byStatus.doing} fazendo · ${data.byStatus.paused} pausado`}
          />
          <Mini label="Vencidos" value={data.overdue} tone={data.overdue > 0 ? 'bad' : undefined} hint="passaram da entrega" />
          <Mini
            label="Começo atrasado"
            value={data.startOverdue}
            tone={data.startOverdue > 0 ? 'warn' : undefined}
            hint={'em A fazer, depois do "começar até"'}
          />
          <Mini
            label={`Concluídos ${ctx.periodIn}`}
            value={data.doneInPeriod}
            tone={data.doneInPeriod > 0 ? 'good' : undefined}
            hint={`${data.createdInPeriod} criados · ${data.cancelledInPeriod} cancelados`}
          />
        </div>
      </Block>
      <Block title="Em aberto por responsável" desc="Os 5 responsáveis com mais cards em aberto; entre parênteses, os vencidos.">
        {data.byResponsible.length ? (
          <HBars
            rows={data.byResponsible.map(row => ({
              label: row.overdue ? `${row.name} (${plural(row.overdue, 'vencido', 'vencidos')})` : row.name,
              value: row.open,
            }))}
          />
        ) : (
          <p className="dsh-empty">Nenhum card em aberto em {asOf}.</p>
        )}
      </Block>
    </Frame>
  );
}

// ─── 2.2 · Histograma ───────────────────────────────────────────────────────────────────────────────
export function HeadcountPanel({ data, variant, ctx }: { data: HeadcountBlock; variant: Variant; ctx: ExtrasPanelContext }) {
  const paper = variant === 'paper';
  const none = data.manDays === 0;
  // No papel, só os 6 pontos mais recentes: a folha tem altura fixa.
  const series = paper ? data.series.slice(-6) : data.series;
  const grain = data.seriesGrain === 'semana' ? 'semana' : 'mês';
  return (
    <Frame
      variant={variant}
      title="Aba 2.2 · Histograma de mão de obra"
      desc={`Efetivo lançado ${ctx.periodIn}, até ${dayMonth(ctx.end)}. A média conta só os dias úteis lançados.`}
      columns={3}
      ctx={ctx}
    >
      <Block
        title={`Efetivo ${ctx.periodOf}`}
        desc="Média de pessoas por dia útil lançado, o maior dia e a parcela de empreiteiros nos homens-dia."
      >
        <div className={`dsh-mini${paper ? ' compact' : ''}`}>
          <Mini label="Efetivo médio" value={none ? '—' : crewLabel(data.dailyAverage)} hint="por dia útil lançado" />
          <Mini label="Pico" value={none ? '—' : data.peak} hint={data.peakDay ? `em ${dayMonth(data.peakDay)}` : undefined} />
          <Mini
            label="Empreiteiros"
            value={none ? '—' : shareLabel(data.contractorShare)}
            hint={`de ${plural(data.manDays, 'homem-dia', 'homens-dia')}`}
          />
          <CoverageMini coverage={data.coverage} />
        </div>
        <MissingDays coverage={data.coverage} what="lançamento" />
        {none && data.lastDay && <p className="dsh-empty">Último dia lançado: {formatDate(data.lastDay)}.</p>}
      </Block>
      <Block title={`Efetivo médio por ${grain}`} desc={`Média por dia útil lançado em cada ${grain}.`}>
        {series.length ? (
          <HBars rows={series.map(point => ({ label: point.label, value: Math.round(point.value) }))} />
        ) : (
          <p className="dsh-empty">Nenhum lançamento {ctx.periodIn}.</p>
        )}
      </Block>
      <Block
        title="Maiores equipes"
        desc={`As 5 empresas com mais homens-dia ${ctx.periodIn}; o número é a equipe média nos dias em que esteve na obra.`}
      >
        {data.companies.length ? (
          <HBars
            rows={data.companies.map(company => ({
              label: company.own ? `${company.name} (próprio)` : company.name,
              value: Math.round(company.averagePresent),
            }))}
          />
        ) : (
          <p className="dsh-empty">Nenhuma empresa lançada {ctx.periodIn}.</p>
        )}
      </Block>
    </Frame>
  );
}

// ─── 2.3 · Produtividade ────────────────────────────────────────────────────────────────────────────
export function ProductionPanel({ data, variant, ctx }: { data: ProductionBlock; variant: Variant; ctx: ExtrasPanelContext }) {
  const paper = variant === 'paper';
  const services = data.services.slice(0, 5);
  return (
    <Frame
      variant={variant}
      title="Aba 2.3 · Controle de produtividade"
      desc={`Lançamentos ${ctx.periodIn}, até ${dayMonth(ctx.end)}. Produção em branco é "a medir", não zero.`}
      ctx={ctx}
    >
      <Block
        title={`Lançamentos ${ctx.periodOf}`}
        desc="Equipes lançadas, quanto delas já tem produção medida e em quantos dias úteis houve lançamento."
      >
        <div className={`dsh-mini${paper ? ' compact' : ''}`}>
          <Mini label="Lançamentos" value={data.entries} hint={plural(data.manDays, 'homem-dia', 'homens-dia')} />
          <Mini
            label="Com produção medida"
            value={data.measuredShare === undefined ? '—' : shareLabel(data.measuredShare)}
            hint={data.entries ? `${data.pending} a medir` : `nenhum lançamento ${ctx.periodIn}`}
          />
          <CoverageMini coverage={data.coverage} />
        </div>
        <MissingDays coverage={data.coverage} what="lançamento" />
        {!data.entries && data.lastDay && <p className="dsh-empty">Último dia lançado: {formatDate(data.lastDay)}.</p>}
      </Block>
      <Block
        title="Produção por homem-dia"
        desc="Os 5 serviços medidos com mais homens-dia: produção total ÷ homens-dia das linhas medidas (não é a RUP)."
      >
        {services.length ? (
          <div className="dsh-grid">
            <div className="thd" style={{ gridTemplateColumns: 'minmax(0, 1fr) 96px 64px' }}>
              <span>Serviço</span>
              <span className="num">Por homem-dia</span>
              <span className="num">H-dia</span>
            </div>
            {services.map(service => (
              <div key={`${service.key}|${service.unit}`} style={{ gridTemplateColumns: 'minmax(0, 1fr) 96px 64px' }}>
                <span className="txt" title={service.name}>
                  {service.name}
                </span>
                <span className="num">
                  {oneDecimal(service.perManDay)} {service.unit}/Hd
                </span>
                <span className="num plain">{service.manDays}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="dsh-empty">Nenhum serviço com produção medida {ctx.periodIn}.</p>
        )}
      </Block>
    </Frame>
  );
}

// ─── 3.1 · Segurança do trabalho ────────────────────────────────────────────────────────────────────
export function SafetyPanel({ data, variant, ctx }: { data: PortfolioSafety; variant: Variant; ctx: ExtrasPanelContext }) {
  const paper = variant === 'paper';
  const refDay = dayMonth(ctx.end);
  const diff = data.open - data.openAtStart;
  const made = data.byConsequence.reduce((sum, value) => sum + value, 0);
  const types = data.byType.slice(0, paper ? 4 : 6);
  return (
    <Frame
      variant={variant}
      title="Aba 3.1 · Segurança do trabalho"
      desc={`Apontamentos da vistoria feitos e finalizados ${ctx.periodIn}; em aberto em ${refDay}.`}
      columns={3}
      ctx={ctx}
    >
      <Block
        title={`Apontamentos ${ctx.periodOf}`}
        desc="Feitos pela data do apontamento, finalizados pela data de correção; em aberto é o retrato do sábado final."
      >
        <div className={`dsh-mini${paper ? ' compact' : ''}`}>
          <Mini label={`Apontados ${ctx.periodIn}`} value={data.opened} />
          <Mini
            label={`Finalizados ${ctx.periodIn}`}
            value={data.resolved}
            tone={data.resolved > 0 ? 'good' : undefined}
            hint={
              data.averageDaysToResolve === undefined
                ? 'nenhum finalizado'
                : `${oneDecimal(data.averageDaysToResolve)} ${data.averageDaysToResolve === 1 ? 'dia' : 'dias'} em média`
            }
          />
          <Mini
            label={`Em aberto em ${refDay}`}
            value={data.open}
            tone={data.openOver7 > 0 ? 'bad' : data.open > 0 ? 'warn' : undefined}
            hint={`${data.openOver7} há mais de 7 dias · ${diff === 0 ? 'mesmo número do início' : `${signedDays(diff)} no período`}`}
          />
        </div>
      </Block>
      <Block
        title="Por consequência"
        desc={`Os ${plural(made, 'apontamento feito', 'apontamentos feitos')} ${ctx.periodIn}, da mais grave para a mais leve.`}
      >
        {made ? (
          <StackBar
            ariaLabel={`Apontamentos por consequência: ${SAFETY_CONSEQUENCES.map((name, index) => `${name} ${data.byConsequence[index] ?? 0}`).join(', ')}`}
            segments={SAFETY_CONSEQUENCES.map((name, index) => ({
              label: name,
              value: data.byConsequence[index] ?? 0,
              color: SAFETY_CONSEQUENCE_COLORS[index],
            }))}
          />
        ) : (
          <p className="dsh-empty">Nenhum apontamento feito {ctx.periodIn}.</p>
        )}
      </Block>
      <Block title="Por tipo" desc={`Os tipos com mais apontamentos feitos ${ctx.periodIn}.`}>
        {types.length ? (
          <HBars rows={types.map(type => ({ label: type.label, value: type.count, muted: type.key === NONE }))} />
        ) : (
          <p className="dsh-empty">Nenhum apontamento feito {ctx.periodIn}.</p>
        )}
      </Block>
    </Frame>
  );
}

// ─── 3.2 · Checklist de equipamentos ────────────────────────────────────────────────────────────────
export function ChecklistPanel({ data, variant, ctx }: { data: ChecklistBlock; variant: Variant; ctx: ExtrasPanelContext }) {
  const paper = variant === 'paper';
  const done = data.due - data.pending;
  const more = data.pending - data.pendingList.length;
  return (
    <Frame
      variant={variant}
      title="Aba 3.2 · Checklist de equipamentos"
      desc={`Checklists devidos hoje (o quadro de vencidos é sempre o de hoje) e as inspeções feitas ${ctx.periodIn}.`}
      ctx={ctx}
    >
      <Block
        title="Equipamentos e checklists"
        desc="Devido hoje = o diário de hoje, o semanal desta semana e o mensal deste mês. Inspeções e não conformidades são as do período."
      >
        <div className={`dsh-mini${paper ? ' compact' : ''}`}>
          <Mini label="Equipamentos" value={data.equipment} hint="ativos" />
          <Mini
            label="Checklists em dia hoje"
            value={`${done}/${data.due}`}
            tone={data.pending > 0 ? 'bad' : data.due > 0 ? 'good' : undefined}
            hint={data.due ? `${plural(data.pending, 'vencido', 'vencidos')} hoje` : 'nenhum checklist devido'}
          />
          <Mini
            label={`Não conformidades ${ctx.periodIn}`}
            value={data.nonConformities}
            tone={data.nonConformities > 0 ? 'bad' : undefined}
            hint={`em ${data.runsWithNonConformity} de ${plural(data.runsInPeriod, 'inspeção', 'inspeções')}`}
          />
        </div>
      </Block>
      <Block title="Vencidos hoje" desc="Checklists devidos hoje e ainda sem inspeção.">
        {data.pendingList.length ? (
          <>
            <div className="dsh-grid">
              {data.pendingList.map((item, index) => (
                <div key={`${item.equipment}-${item.model}-${index}`} style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                  <span className="txt" title={`${item.equipment} · ${item.model}`}>
                    {item.equipment}
                  </span>
                  <span className="muted">{FREQUENCY_LABEL[item.frequency].toLowerCase()}</span>
                </div>
              ))}
            </div>
            {more > 0 && (
              <p className="dsh-legend">
                <span>E mais {more}.</span>
              </p>
            )}
          </>
        ) : (
          <p className="dsh-empty">{data.due ? 'Nenhum checklist vencido hoje.' : 'Nenhum checklist devido hoje.'}</p>
        )}
      </Block>
    </Frame>
  );
}

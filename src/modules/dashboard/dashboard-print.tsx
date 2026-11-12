'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { addDays } from '@/domain/validation';
import { formatDate } from '@/shared/format';
import { DASHBOARD_STYLE } from './styles';
import { scaleLabel } from './period';
import {
  dayMonth,
  isWeekly,
  moduleInfo,
  monthLong,
  pct,
  plural,
  weekNumberOf,
  type DashboardFilters,
  type DashboardModule,
  type KpiCard,
} from './model';
import { useDashboard, type DashboardReady } from './use-dashboard-data';
import { extrasContext, KpiCards, Text } from './dashboard-overview';
import { LongTermPanel } from './panels/long-term';
import { WagonsPanel } from './panels/wagons';
import { MediumTermPanel } from './panels/medium-term';
import { ShortTermPanel } from './panels/short-term';
import { TerminalityPanel } from './panels/terminality';
import { BalancePanel, ChecklistPanel, HeadcountPanel, ProductionPanel, RestrictionsPanel, SafetyPanel } from './extras/panels';

/** O PDF da aba 0 (regra 11 do modelo aprovado): A4 paisagem, cabeçalho igual ao do painel do fechamento
 * (logos, nome da obra, semana analisada e atual; fora da escala semanal, a escala e o período — escalas de
 * tempo, 04/11/2026, regra 14). Folha 1: resumo e curto prazo; depois uma folha por
 * módulo presente: longo prazo e vagões juntos, médio prazo, terminalidade. Abre numa aba própria, fora do
 * layout do sistema, com os filtros na URL, e chama a impressão do navegador ("Salvar como PDF") quando os
 * quadros terminam de chegar, ou passado o limite de espera, saindo com o que houver.
 *
 * 12/11/2026 (modelo "Dashboards completos e resumo semanal", regra 10): duas folhas a mais, só quando há o que
 * mostrar. "Linha de Balanço e Quadro de Restrições" vem logo depois da folha do longo prazo e dos vagões (os
 * dois quadros não cabem naquela folha, de altura fixa, sem cortar nada); "Controles de obra e SST" (histograma,
 * produtividade, segurança e checklist) fecha o PDF. A folha 1 leva até nove cartões numa linha só. */

/** Espera máxima pelos quadros (plano de longo prazo, terminalidade, ranking) antes de imprimir assim mesmo. */
const PANELS_TIMEOUT_MS = 10000;

function Head({ dash, title, filters }: { dash: DashboardReady; title: string; filters: string }) {
  const { ref, work } = dash;
  return (
    <div className="dsh-head">
      <div>
        <span className="logos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-atr.png" alt="ATR Incorporadora" />
          <i aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-takt.png" alt="Takt Engenharia" />
        </span>
      </div>
      <div className="title">DASHBOARD DA OBRA {work.name.toUpperCase()}</div>
      <div className="week">
        {isWeekly(ref) ? (
          <span>
            Semana analisada: <span className="pill">{ref.weekNumber}</span>
            <br />
            Semana atual: {weekNumberOf(ref, ref.currentWeek)}
          </span>
        ) : (
          <span>
            {scaleLabel(ref.period.scale)}: <span className="pill">{ref.period.short}</span>
            <br />
            Semanas {weekNumberOf(ref, ref.period.weeks[0])} a {ref.weekNumber}
            {ref.period.partial ? ' · parcial' : ''}
          </span>
        )}
      </div>
      <div className="sub">
        <span>
          <b>{title}</b> · {dayMonth(ref.period.start)} a {formatDate(ref.weekEnd)}
        </span>
        <span>{filters}</span>
      </div>
    </div>
  );
}

function Foot({ dash, page, total, generated }: { dash: DashboardReady; page: number; total: number; generated: string }) {
  return (
    <div className="dsh-foot">
      <span>
        Todos os quadros contam até sáb {formatDate(dash.ref.weekEnd)}; nada depois{' '}
        {isWeekly(dash.ref) ? 'da semana analisada' : `do período (${dash.ref.period.label})`}. Ranking das obras e avanço físico consideram
        a obra inteira, assim como os quadros de 12/11/2026 (1.1 Linha de Balanço, 1.4, 2.2, 2.3, 3.1 e 3.2). Gerado em {generated}
        {dash.actorName ? ` por ${dash.actorName}` : ''}.
      </span>
      <span>
        Folha {page} de {total} · Obra 360
      </span>
    </div>
  );
}

function Sheet({ children }: { children: ReactNode }) {
  return <section className="dsh-sheet">{children}</section>;
}

function kpi(module: DashboardModule, label: string, value: string, hint: string, main = false): KpiCard {
  return { module, label, value, hint, main };
}

/** Os filtros ativos, como o rodapé e o cabeçalho os descrevem. */
function filtersText(filters: DashboardFilters): string {
  const parts: string[] = [];
  parts.push(filters.companies ? `empreiteiros: ${[...filters.companies].join(', ')}` : 'todos os empreiteiros');
  parts.push(filters.floors ? `${plural(filters.floors.size, 'pavimento', 'pavimentos')}` : 'todos os pavimentos');
  if (filters.modules) parts.push(`quadros: ${[...filters.modules].map(m => moduleInfo(m).label.toLowerCase()).join(', ')}`);
  return `Filtros: ${parts.join(' · ')}`;
}

export function DashboardPrint({ workId, filters }: { workId: string; filters: Partial<DashboardFilters> }) {
  const dash = useDashboard({
    workId,
    week: filters.week,
    selection: filters.selection,
    companies: filters.companies,
    floors: filters.floors,
    modules: filters.modules,
  });
  const printed = useRef(false);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), PANELS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  const ready = dash.status === 'ready' && dash.settingsReady && (expired || dash.loading.length === 0);
  const title =
    dash.status === 'ready'
      ? `Dashboard ${dash.work.code || dash.work.name} - ${isWeekly(dash.ref) ? `Semana ${dash.ref.weekNumber}` : dash.ref.period.label}`
      : 'Dashboard da obra';
  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    document.title = title;
    // Um respiro para as fontes e o layout assentarem antes do diálogo de impressão.
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [ready, title]);

  if (dash.status === 'error') return <p className="p-6 text-sm text-danger">{dash.message}</p>;
  if (dash.status === 'missing') return <p className="p-6 text-sm text-slate-500">Obra não encontrada ou sem acesso.</p>;
  if (!ready) return <p className="p-6 text-sm text-slate-500">Preparando o PDF…</p>;

  const { panels, summary, ref } = dash;
  const longTerm = panels.longTerm.status === 'ready' ? panels.longTerm.data : undefined;
  const wagons = panels.wagons.status === 'ready' ? panels.wagons.data : undefined;
  const medium = panels.medium.status === 'ready' ? panels.medium.data : undefined;
  const short = panels.short.status === 'ready' ? panels.short.data : undefined;
  const terminality = panels.terminality.status === 'ready' ? panels.terminality.data : undefined;
  const generated = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date())
    .replace(', ', ' às ');
  const balance = panels.balance.status === 'ready' ? panels.balance.data : undefined;
  const restrictions = panels.restrictions.status === 'ready' ? panels.restrictions.data : undefined;
  const headcount = panels.headcount.status === 'ready' ? panels.headcount.data : undefined;
  const production = panels.production.status === 'ready' ? panels.production.data : undefined;
  const safety = panels.safety.status === 'ready' ? panels.safety.data : undefined;
  const checklist = panels.checklist.status === 'ready' ? panels.checklist.data : undefined;
  const ctx = extrasContext(dash);
  const filtersLine = filtersText(dash.filters);
  const unavailable = dash.unavailable.map(m => moduleInfo(m).label.toLowerCase());

  // As folhas presentes, na ordem: resumo (+ curto prazo), longo prazo e vagões, Linha de Balanço e Quadro de
  // Restrições, médio prazo, terminalidade, controles de obra e SST.
  const sheets: ((page: number, total: number) => ReactNode)[] = [];
  sheets.push((page, total) => (
    <Sheet key="resumo">
      <Head dash={dash} title={short ? 'RESUMO DA OBRA E CURTO PRAZO' : 'RESUMO DA OBRA'} filters={filtersLine} />
      <p className="dsh-summary">
        <Text segments={summary.sentence} />
        {unavailable.length > 0 && ` Quadros indisponíveis no momento: ${unavailable.join(', ')}.`}
      </p>
      {summary.kpis.length > 0 && (
        <div
          className={`dsh-kpis${summary.kpis.length <= 4 ? ' k4' : summary.kpis.length === 5 ? ' k5' : summary.kpis.length > 6 ? ' kw' : ''}`}
          // Sete a nove cartões (12/11/2026) cabem numa linha só, mais estreitos, para o curto prazo manter a altura.
          style={summary.kpis.length > 6 ? { gridTemplateColumns: `repeat(${summary.kpis.length}, minmax(0, 1fr))` } : undefined}
        >
          <KpiCards kpis={summary.kpis} paper />
        </div>
      )}
      {short ? (
        <div className="dsh-row" style={{ gridTemplateColumns: '1.35fr 1fr', gridTemplateRows: 'minmax(0, 1fr) 182px' }}>
          <ShortTermPanel data={short} variant="paper" workId={workId} />
        </div>
      ) : (
        <div className="dsh-row" style={{ gridTemplateColumns: '1fr' }}>
          <div className="dsh-panel">
            <h3>Curto prazo</h3>
            <p className="dsh-desc">Sem compromissos registrados nesta obra até o fim do período, ou módulo fora do PDF.</p>
          </div>
        </div>
      )}
      <Foot dash={dash} page={page} total={total} generated={generated} />
    </Sheet>
  ));
  if (longTerm || wagons) {
    const kpis: KpiCard[] = [];
    if (longTerm) {
      kpis.push(
        kpi(
          'longo-prazo',
          'Avanço físico medido',
          longTerm.measured === undefined ? '—' : pct(longTerm.measured),
          longTerm.measurementCount
            ? `medição nº ${longTerm.measurementCount}${longTerm.lastMeasurement ? ` · ${formatDate(longTerm.lastMeasurement)}` : ''}`
            : 'sem medição até a data',
          true,
        ),
        kpi(
          'longo-prazo',
          'Planejado na data',
          pct(longTerm.planned),
          `${longTerm.plannedSource === 'baseline' ? `linha de base ${longTerm.baselineName ?? ''}` : 'plano vivo, sem linha de base'}${
            longTerm.delta === undefined ? '' : ` · desvio ${longTerm.delta > 0 ? '+' : ''}${Math.round(longTerm.delta)} p.p.`
          }`,
        ),
      );
      if (longTerm.span)
        kpis.push(
          kpi(
            'longo-prazo',
            'Prazo planejado',
            plural(longTerm.span.months, 'mês', 'meses'),
            `${dayMonth(longTerm.span.start)}/${longTerm.span.start.slice(2, 4)} → ${dayMonth(longTerm.span.finish)}/${longTerm.span.finish.slice(2, 4)}${
              longTerm.span.slip === undefined ? '' : ` · ${longTerm.span.slip > 0 ? '+' : ''}${longTerm.span.slip} dias vs linha de base`
            }`,
          ),
        );
    }
    if (wagons)
      kpis.push(kpi('vagoes', 'Vagões', String(wagons.total), wagons.byStatus.map(s => `${s.value} ${s.label.toLowerCase()}`).join(' · ')));
    sheets.push((page, total) => (
      <Sheet key="longo-vagoes">
        <Head dash={dash} title={longTerm && wagons ? 'LONGO PRAZO E VAGÕES' : longTerm ? 'LONGO PRAZO' : 'VAGÕES'} filters={filtersLine} />
        <div className={`dsh-kpis${kpis.length <= 4 ? ' k4' : ' k5'}`}>
          <KpiCards kpis={kpis} paper />
        </div>
        <div className="dsh-row" style={{ gridTemplateColumns: longTerm && wagons ? '1.25fr 1fr 1fr' : wagons ? '1fr 1fr' : '1fr' }}>
          {longTerm && <LongTermPanel data={longTerm} variant="paper" workId={workId} />}
          {wagons && <WagonsPanel data={wagons} variant="paper" workId={workId} />}
        </div>
        <Foot dash={dash} page={page} total={total} generated={generated} />
      </Sheet>
    ));
  }
  if (balance || restrictions) {
    sheets.push((page, total) => (
      <Sheet key="balanco-restricoes">
        <Head
          dash={dash}
          title={
            balance && restrictions
              ? 'LINHA DE BALANÇO, LEGALIZAÇÃO E QUADRO DE RESTRIÇÕES'
              : balance
                ? 'LINHA DE BALANÇO E LEGALIZAÇÃO'
                : 'QUADRO DE RESTRIÇÕES'
          }
          filters={filtersLine}
        />
        <div className="dsh-row" style={{ gridTemplateColumns: balance && restrictions ? '1fr 1fr' : '1fr' }}>
          {balance && <BalancePanel data={balance} variant="paper" ctx={ctx} />}
          {restrictions && <RestrictionsPanel data={restrictions} variant="paper" ctx={ctx} />}
        </div>
        <Foot dash={dash} page={page} total={total} generated={generated} />
      </Sheet>
    ));
  }
  if (medium) {
    const kpis: KpiCard[] = [
      kpi(
        'medio-prazo',
        'Tarefas atrasadas na data',
        String(medium.late.count),
        `de ${medium.plan.taskCount} · término previsto antes de ${dayMonth(ref.weekEnd)} e < 100%`,
        true,
      ),
      kpi(
        'medio-prazo',
        'Contra a linha de base',
        medium.baseline ? `${medium.baseline.late} atrasadas` : '—',
        medium.baseline
          ? `${medium.baseline.early} adiantadas · ${medium.baseline.onTime} no prazo · linha de base de ${dayMonth(medium.baseline.frozenAt.slice(0, 10))}`
          : 'sem linha de base congelada',
      ),
      kpi(
        'medio-prazo',
        'Caminho crítico',
        medium.critical ? plural(medium.critical.count, 'tarefa', 'tarefas') : '—',
        medium.critical
          ? `folga zero${medium.critical.planFinish ? ` · término do plano em ${formatDate(medium.critical.planFinish)}` : ''}`
          : 'não calculado',
      ),
      kpi(
        'medio-prazo',
        'Equipes superalocadas',
        String(medium.overloaded.count),
        medium.overloaded.names.length
          ? `${medium.overloaded.names.join(', ')} na semana ${ref.weekNumber}`
          : `nenhuma na semana ${ref.weekNumber}`,
      ),
    ];
    sheets.push((page, total) => (
      <Sheet key="medio">
        <Head dash={dash} title={`MÉDIO PRAZO · PLANO DE ${monthLong(medium.plan.month).toUpperCase()}`} filters={filtersLine} />
        <div className="dsh-kpis k4">
          <KpiCards kpis={kpis} paper />
        </div>
        <div className="dsh-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <MediumTermPanel data={medium} variant="paper" workId={workId} />
        </div>
        <Foot dash={dash} page={page} total={total} generated={generated} />
      </Sheet>
    ));
  }
  if (terminality) {
    const flow = terminality.period;
    const kpis: KpiCard[] = !isWeekly(ref)
      ? [
          kpi(
            'terminalidade',
            `Em aberto em ${dayMonth(ref.weekEnd)}`,
            String(terminality.open),
            `${flow.openAtStart} no início do período · ${terminality.olderThan30} há mais de 30 dias`,
            true,
          ),
          kpi(
            'terminalidade',
            `Abertas ${ref.period.of}`,
            String(flow.opened),
            `observadas de ${dayMonth(ref.period.start)} a ${dayMonth(ref.weekEnd)}`,
          ),
          kpi(
            'terminalidade',
            `Resolvidas ${ref.period.of}`,
            String(flow.resolved),
            `${terminality.percentLabel} resolvido desde a primeira pendência`,
          ),
          kpi(
            'terminalidade',
            'Tempo médio até a correção',
            flow.averageDaysToResolve === undefined ? '—' : plural(Math.round(flow.averageDaysToResolve), 'dia', 'dias'),
            `das ${flow.resolved} resolvidas no período`,
          ),
        ]
      : [
          kpi('terminalidade', 'Pendências abertas', String(terminality.open), `${terminality.olderThan30} há mais de 30 dias`, true),
          kpi('terminalidade', 'Resolvidas', String(terminality.resolved), `de ${terminality.total} registradas até a data`),
          kpi(
            'terminalidade',
            'Resolvido',
            terminality.percentLabel,
            `pendência resolvida depois de ${dayMonth(ref.weekEnd)} conta como aberta`,
          ),
          kpi(
            'terminalidade',
            'Tempo médio em aberto',
            terminality.averageOpenDays === undefined ? '—' : plural(terminality.averageOpenDays, 'dia', 'dias'),
            `das ${terminality.open} abertas, desde a data de observação`,
          ),
        ];
    sheets.push((page, total) => (
      <Sheet key="terminalidade">
        <Head dash={dash} title="TERMINALIDADE" filters={filtersLine} />
        <div className="dsh-kpis k4">
          <KpiCards kpis={kpis} paper />
        </div>
        <div className="dsh-row" style={{ gridTemplateColumns: '1.3fr 1fr 1fr' }}>
          <TerminalityPanel data={terminality} variant="paper" workId={workId} />
        </div>
        <Foot dash={dash} page={page} total={total} generated={generated} />
      </Sheet>
    ));
  }
  const controls = [headcount, production, safety, checklist].filter(Boolean).length;
  if (controls) {
    sheets.push((page, total) => (
      <Sheet key="controles-sst">
        <Head dash={dash} title="CONTROLES DE OBRA E SST" filters={filtersLine} />
        <div
          className="dsh-row"
          // Um ou dois quadros dividem a folha em colunas; três ou quatro, em duas linhas de duas colunas.
          style={
            controls <= 2
              ? { gridTemplateColumns: controls === 2 ? '1fr 1fr' : '1fr' }
              : { gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)' }
          }
        >
          {headcount && <HeadcountPanel data={headcount} variant="paper" ctx={ctx} />}
          {production && <ProductionPanel data={production} variant="paper" ctx={ctx} />}
          {safety && <SafetyPanel data={safety} variant="paper" ctx={ctx} />}
          {checklist && <ChecklistPanel data={checklist} variant="paper" ctx={ctx} />}
        </div>
        <Foot dash={dash} page={page} total={total} generated={generated} />
      </Sheet>
    ));
  }

  return (
    <div className="dsh-paper">
      <style>{DASHBOARD_STYLE}</style>
      <style>{`@page { size: A4 landscape; margin: 7mm; }`}</style>
      <div className="dsh-toolbar">
        <button type="button" className="button" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </button>
        <span style={{ color: '#59738a' }}>
          No diálogo, escolha &quot;Salvar como PDF&quot; e o modo paisagem. {plural(sheets.length, 'folha', 'folhas')},{' '}
          {isWeekly(ref) ? `semana ${ref.weekNumber} (${dayMonth(ref.week)} a ${dayMonth(addDays(ref.week, 5))})` : ref.period.label}.{' '}
          {filtersLine}.
        </span>
      </div>
      {sheets.map((sheet, index) => sheet(index + 1, sheets.length))}
    </div>
  );
}

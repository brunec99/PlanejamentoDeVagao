'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { FileDown, RefreshCw } from 'lucide-react';
import { TabHeader } from '@/modules/layout/tab-header';
import { LoadState, Missing } from '@/modules/planejamento/ui';
import { TourMark } from '@/modules/planejamento/wagon-actions';
import { FilterPicker } from '@/modules/curto-prazo/closing-filter';
import { addDays } from '@/domain/validation';
import { periodSearchEntries, type PeriodSelection } from './period';
import { PeriodControl, ScaleButtons } from './period-picker';
import { formatDate, workPath } from '@/shared/format';
import { DASHBOARD_STYLE } from './styles';
import {
  companyKey,
  DASHBOARD_MODULES,
  dayMonth,
  floorKey,
  isWeekly,
  moduleInfo,
  plural,
  printDashboardPath,
  weekNumberOf,
  type DashboardModule,
  type KpiCard,
  type PanelState,
  type Segment,
} from './model';
import { useDashboard, type DashboardPanels, type DashboardReady } from './use-dashboard-data';
import { LongTermPanel } from './panels/long-term';
import { WagonsPanel } from './panels/wagons';
import { MediumTermPanel } from './panels/medium-term';
import { ShortTermPanel } from './panels/short-term';
import { TerminalityPanel } from './panels/terminality';

/** Aba 0, Dashboard da obra (04/11/2026, modelo aprovado): os cinco níveis numa página, até a semana
 * analisada, só com os módulos que a pessoa pode abrir e que têm dado nesta obra. Filtros no topo (escala e
 * período, empreiteiro, pavimento, quadros), a frase e os cartões do resumo, um quadro por módulo com o link
 * para a aba de origem, e "Gerar PDF", que abre a impressão com os mesmos filtros. Nada aqui se edita.
 * Escalas de tempo (04/11/2026, segundo modelo aprovado): "Semana analisada" virou escala (semanal, mensal,
 * trimestral, anual, personalizado) e período; a escala semanal mostra o que a aba mostrava antes. */

export function Text({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.strong ? <strong key={index}>{segment.text}</strong> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}

const toneClass = (tone?: KpiCard['tone']) => (tone === 'good' ? 't-good' : tone === 'warn' ? 't-warn' : tone === 'bad' ? 't-bad' : '');

export function KpiCards({ kpis, paper = false }: { kpis: KpiCard[]; paper?: boolean }) {
  return (
    <>
      {kpis.map(kpi => (
        <div key={`${kpi.module}-${kpi.label}`} className={`${paper ? 'dsh-kpi' : 'dsh-stat'}${kpi.main ? ' main' : ''}`}>
          <div className="l">
            <span>{kpi.label}</span>
            <em title="Aba de origem">aba {moduleInfo(kpi.module).number}</em>
          </div>
          <div className={`v ${toneClass(kpi.tone)}`}>
            {kpi.value}
            {kpi.tag && <span className={`dsh-tag ${kpi.tag.tone}`}>{kpi.tag.text}</span>}
          </div>
          <div className="h">{kpi.hint}</div>
        </div>
      ))}
    </>
  );
}

const MODULE_ORDER: (keyof DashboardPanels)[] = ['longTerm', 'wagons', 'medium', 'short', 'terminality'];
const MODULE_OF: Record<keyof DashboardPanels, DashboardModule> = {
  longTerm: 'longo-prazo',
  wagons: 'vagoes',
  medium: 'medio-prazo',
  short: 'curto-prazo',
  terminality: 'terminalidade',
};

/** A linha abaixo do título de cada quadro: de onde vem o dado e em que estado está. */
function subtitleOf(key: keyof DashboardPanels, panels: DashboardPanels, dash: DashboardReady): string {
  const state = panels[key];
  if (state.status !== 'ready') return '';
  switch (key) {
    case 'longTerm': {
      const d = panels.longTerm.status === 'ready' ? panels.longTerm.data : undefined;
      if (!d) return '';
      const source =
        d.plannedSource === 'baseline'
          ? `linha de base ${d.baselineName ?? ''}${d.baselineDate ? ` (${formatDate(d.baselineDate)})` : ''}`
          : 'planejado pelo plano vivo, sem linha de base';
      const measured = d.measurementCount
        ? `medição nº ${d.measurementCount}${d.lastMeasurement ? ` em ${dayMonth(d.lastMeasurement)}` : ''}`
        : 'sem medição até a data';
      return `Planejador · ${source} · ${measured}`;
    }
    case 'wagons': {
      const d = panels.wagons.status === 'ready' ? panels.wagons.data : undefined;
      if (!d) return '';
      const sequences = d.sequences.map(s => `${s.name} · ${s.takt}`).join(' · ');
      return `${sequences ? `${sequences} · ` : ''}${plural(d.total, 'vagão', 'vagões')}${d.companyFiltered ? ' · recorte por empreiteiro' : ''}`;
    }
    case 'medium': {
      const d = panels.medium.status === 'ready' ? panels.medium.data : undefined;
      if (!d) return '';
      return `${d.plan.name} · ${plural(d.plan.taskCount, 'tarefa', 'tarefas')} · ${d.baseline ? `linha de base de ${dayMonth(d.baseline.frozenAt.slice(0, 10))}` : 'sem linha de base'}${d.companyFiltered ? ' · recorte por empreiteiro' : ''}`;
    }
    case 'short': {
      const d = panels.short.status === 'ready' ? panels.short.data : undefined;
      if (!d) return '';
      if (!isWeekly(dash.ref)) {
        const p = d.period.current;
        const weeks = p.closedWeeks
          ? `${plural(p.closedWeeks, 'semana apurada', 'semanas apuradas')} · ${plural(p.planned, 'compromisso', 'compromissos')}`
          : 'nenhuma semana apurada';
        const open = p.openWeeks ? ` · ${plural(p.openWeeks, 'semana em aberto', 'semanas em aberto')}` : '';
        const rank =
          d.whole.ranking && d.whole.position !== undefined && d.whole.ranked >= 2
            ? ` · ${d.whole.position}º de ${d.whole.ranked} obras no PPC geral`
            : '';
        return `${dash.period.label} · ${weeks}${open}${rank}${d.companyFiltered ? ' · recorte por empreiteiro' : ''}`;
      }
      const current = d.closing.current;
      const week = !current
        ? `Semana ${d.weekNumber} sem linhas`
        : `Semana ${d.weekNumber} ${current.pending > 0 ? 'em aberto' : 'apurada'} · ${plural(current.planned, 'compromisso', 'compromissos')}`;
      const position =
        d.whole.ranking && d.whole.position !== undefined && d.whole.ranked >= 2
          ? ` · ${d.whole.position}º de ${d.whole.ranked} obras no PPC geral`
          : '';
      return `${week}${position}${d.companyFiltered ? ' · recorte por empreiteiro' : ''}`;
    }
    case 'terminality': {
      const d = panels.terminality.status === 'ready' ? panels.terminality.data : undefined;
      if (!d) return '';
      return `${plural(d.total, 'pendência registrada', 'pendências registradas')} até ${dayMonth(dash.ref.weekEnd)} · ${d.open} abertas${d.filtered ? ' · com recorte' : ''}`;
    }
  }
}

function panelBody(key: keyof DashboardPanels, panels: DashboardPanels, workId: string): ReactNode {
  switch (key) {
    case 'longTerm':
      return panels.longTerm.status === 'ready' ? <LongTermPanel data={panels.longTerm.data} variant="screen" workId={workId} /> : null;
    case 'wagons':
      return panels.wagons.status === 'ready' ? <WagonsPanel data={panels.wagons.data} variant="screen" workId={workId} /> : null;
    case 'medium':
      return panels.medium.status === 'ready' ? <MediumTermPanel data={panels.medium.data} variant="screen" workId={workId} /> : null;
    case 'short':
      return panels.short.status === 'ready' ? <ShortTermPanel data={panels.short.data} variant="screen" workId={workId} /> : null;
    case 'terminality':
      return panels.terminality.status === 'ready' ? (
        <TerminalityPanel data={panels.terminality.data} variant="screen" workId={workId} />
      ) : null;
  }
}

function ModuleCard({
  module,
  subtitle,
  state,
  first,
  workId,
  children,
}: {
  module: DashboardModule;
  subtitle: string;
  state: PanelState<unknown>;
  first: boolean;
  workId: string;
  children: ReactNode;
}) {
  const info = moduleInfo(module);
  return (
    <section className="dsh-mod" aria-labelledby={`dash-${module}`}>
      <div className="dsh-mod-h">
        <h2 id={`dash-${module}`}>
          <span className="n" aria-hidden>
            {info.number}
          </span>
          {info.label}
          {subtitle && <span className="sub">{subtitle}</span>}
        </h2>
        {/* O tour marca só o primeiro quadro; `TourMark` escreve o alvo literal que o teste dos tours procura. */}
        <TourMark tourId="dash-abrir-aba" when={first}>
          <Link href={workPath(workId, module)}>Abrir aba {info.number} →</Link>
        </TourMark>
      </div>
      {state.status === 'loading' && (
        <div className="dsh-mod-b unavailable" role="status">
          Carregando…
        </div>
      )}
      {state.status === 'error' && (
        <div className="dsh-mod-b unavailable" role="alert">
          Quadro indisponível no momento: {state.message}
        </div>
      )}
      {state.status === 'ready' && children}
    </section>
  );
}

const HELP = (
  <>
    <p>
      <strong>Uma página, no período escolhido.</strong> A escala pode ser semanal, mensal, trimestral, anual ou um intervalo de datas, e o
      período é sempre feito de semanas inteiras (a semana conta no mês da sua segunda-feira). Cada quadro conta só até o sábado da última
      semana do período e nada depois: uma pendência resolvida depois conta como aberta, uma medição posterior não entra. É o que deixa o
      PDF de um período antigo sair igual quando for gerado de novo.
    </p>
    <p>
      <strong>No período e no sábado final.</strong> PPC, causas, pendências abertas e resolvidas e o avanço físico do período somam o que
      aconteceu dentro dele (o PPC soma as linhas das semanas apuradas, não faz média). Status dos vagões, restrições vencidas, tarefas
      atrasadas e pendências em aberto são o retrato do sábado final.
    </p>
    <p>
      <strong>Só o que existe nesta obra.</strong> Aparecem os módulos que você pode abrir e que têm dado na obra; os demais não ocupam
      espaço, e a linha abaixo dos filtros diz quais ficaram de fora.
    </p>
    <p>
      <strong>Filtros.</strong> Empreiteiro vale no curto prazo (coluna Empresa), na terminalidade (Responsável terceiro), no médio prazo e
      nos vagões (empresa da equipe). Pavimento vale na terminalidade e no longo prazo. O ranking das obras e o avanço físico consideram
      sempre a obra inteira.
    </p>
    <p>
      <strong>Nada se edita aqui.</strong> Os números saem das abas de origem; "Abrir aba" leva até elas. "Gerar PDF" imprime a página com
      os filtros de agora, uma folha de resumo e uma por módulo.
    </p>
  </>
);

/** `initial` vem da URL (`escala`, `periodo`, `de`, `ate`, `agrupar` ou o antigo `semana`): o Dashboard geral
 * abre a aba 0 no mesmo período, e o link copiado reproduz a visão. */
export function DashboardOverview({
  workId,
  initial,
  initialCompanies,
}: {
  workId: string;
  initial?: PeriodSelection;
  /** Recorte de empreiteiro vindo do Dashboard geral (`empreiteiro=`); comparado sem acento nem caixa. */
  initialCompanies?: ReadonlySet<string>;
}) {
  const [selection, setSelection] = useState<PeriodSelection | undefined>(initial);
  const [companies, setCompanies] = useState<Set<string> | undefined>(initialCompanies && new Set(initialCompanies));
  // O seletor guarda os nomes como aparecem; o filtro compara pela chave normalizada.
  const [floorNames, setFloorNames] = useState<Set<string>>();
  const [modulesChosen, setModulesChosen] = useState<Set<DashboardModule>>();
  const dash = useDashboard({
    workId,
    selection,
    companies,
    floors: floorNames && new Set([...floorNames].map(floorKey)),
    modules: modulesChosen,
  });

  if (dash.status === 'loading') return <LoadState />;
  if (dash.status === 'error') return <LoadState error />;
  if (dash.status === 'missing') return <Missing label="Obra não encontrada" />;

  const { ref, panels, summary, access } = dash;
  const choosePeriod = (next: PeriodSelection) => {
    setSelection(next);
    // A URL acompanha a escolha (sem recarregar a página), para o link e o "voltar" do PDF reproduzirem a visão.
    const query = new URLSearchParams(periodSearchEntries(next)).toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  };
  const filtering = !!companies || !!floorNames || !!modulesChosen;
  const available = DASHBOARD_MODULES.filter(m => access[m.id]);
  const toggleModule = (id: DashboardModule) => {
    const current = new Set(modulesChosen ?? available.map(m => m.id));
    if (current.has(id)) current.delete(id);
    else current.add(id);
    // Todos marcados = sem recorte; nenhum marcado não é permitido (ficaria uma página vazia).
    if (!current.size) return;
    setModulesChosen(current.size === available.length ? undefined : current);
  };
  const generate = () => window.open(printDashboardPath(workId, dash.filters), '_blank', 'noopener');
  const missing = [...dash.noData.map(m => moduleInfo(m).label.toLowerCase())];
  const hiddenByChoice = modulesChosen ? available.filter(m => !modulesChosen.has(m.id)).map(m => m.label.toLowerCase()) : [];
  const shownKeys = MODULE_ORDER.filter(key => {
    const id = MODULE_OF[key];
    return access[id] && (!modulesChosen || modulesChosen.has(id)) && panels[key].status !== 'absent';
  });

  return (
    <div className="dsh">
      <style>{DASHBOARD_STYLE}</style>
      <TabHeader
        workId={workId}
        section="dashboard"
        description="Os cinco níveis da obra numa página, no período escolhido: só os módulos liberados e com dados nesta obra."
        helpTitle="Como funciona: dashboard da obra"
        help={HELP}
      >
        <button type="button" className="button" data-tour="dash-pdf" onClick={generate}>
          <FileDown size={16} aria-hidden />
          Gerar PDF
        </button>
      </TabHeader>

      <div
        data-tour="dash-filtros"
        role="group"
        aria-label="Filtros do dashboard"
        className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-600"
      >
        <span className="flex flex-wrap items-center gap-2">
          Escala
          <span data-tour="dash-escala" className="inline-flex">
            <ScaleButtons period={dash.period} onChange={choosePeriod} />
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          Período
          <span data-tour="dash-periodo" className="inline-flex">
            <PeriodControl
              period={dash.period}
              context={dash.periodContext}
              onChange={choosePeriod}
              idPrefix="aba0-periodo"
              // Na escala semanal a lista numera as semanas como a planilha, como o antigo "Semana analisada".
              optionLabel={
                dash.period.scale === 'semana'
                  ? option =>
                      `${weekNumberOf(ref, option.key)} · ${dayMonth(option.key)} a ${dayMonth(addDays(option.key, 5))}${option.current ? ' (atual)' : ''}`
                  : undefined
              }
            />
          </span>
        </span>
        <span data-tour="dash-empreiteiro" className="inline-flex">
          <FilterPicker
            label="Empreiteiro"
            values={dash.companyOptions}
            // O nome vindo do Dashboard geral pode ter outra grafia: acende a opção equivalente.
            selected={
              companies &&
              new Set(dash.companyOptions.filter(o => [...companies].some(c => companyKey(c) === companyKey(o.value))).map(o => o.value))
            }
            onChange={setCompanies}
          />
        </span>
        <span data-tour="dash-pavimento" className="inline-flex">
          <FilterPicker label="Pavimento" values={dash.floorOptions} selected={floorNames} onChange={setFloorNames} />
        </span>
        <span data-tour="dash-quadros" role="group" aria-label="Quadros" className="inline-flex flex-wrap items-center gap-1">
          <span className="text-slate-500">Quadros</span>
          {available.map(m => {
            const on = !modulesChosen || modulesChosen.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleModule(m.id)}
                className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors ${
                  on ? 'border-primary-ring bg-primary-soft text-primary-ink' : 'border-slate-200 bg-white text-slate-400 line-through'
                }`}
              >
                <span className="tabular-nums">{m.number}</span>
                {m.label}
              </button>
            );
          })}
        </span>
        {filtering && (
          <button
            type="button"
            className="text-link text-xs"
            onClick={() => {
              setCompanies(undefined);
              setFloorNames(undefined);
              setModulesChosen(undefined);
            }}
          >
            Limpar
          </button>
        )}
      </div>
      <p data-tour="dash-escopo" className="mb-4 text-xs text-slate-500">
        {!isWeekly(ref) && (
          <>
            Período: <b className="font-semibold text-slate-700">{dash.period.label}</b>
            {dash.period.weeks.length > 1
              ? ` (semanas ${weekNumberOf(ref, dash.period.weeks[0])} a ${weekNumberOf(ref, dash.period.lastWeek)})`
              : ` (semana ${weekNumberOf(ref, dash.period.lastWeek)})`}
            {dash.period.partial && ' · parcial'} ·{' '}
          </>
        )}
        Dados até <b className="font-semibold text-slate-700">sáb {formatDate(ref.weekEnd)}</b> · semana atual:{' '}
        {weekNumberOf(ref, ref.currentWeek)}
        {!dash.settingsReady && ' · numeração provisória'} · Módulos sem dados nesta obra:{' '}
        <b className="font-semibold text-slate-700">{missing.length ? missing.join(', ') : 'nenhum'}</b>
        {hiddenByChoice.length > 0 && ` · fora por escolha: ${hiddenByChoice.join(', ')}`}
        {dash.unavailable.length > 0 && ` · indisponível: ${dash.unavailable.map(m => moduleInfo(m).label.toLowerCase()).join(', ')}`}
        {dash.loading.length > 0 && ` · carregando: ${dash.loading.map(m => moduleInfo(m).label.toLowerCase()).join(', ')}`}
        {(companies || floorNames) && (
          <>
            {' '}
            · Recorte: {companies ? `${plural(companies.size, 'empreiteiro', 'empreiteiros')}` : ''}
            {companies && floorNames ? ' e ' : ''}
            {floorNames ? `${plural(floorNames.size, 'pavimento', 'pavimentos')}` : ''}
          </>
        )}
      </p>

      <p data-tour="dash-resumo" className="dsh-summary">
        <Text segments={summary.sentence} />
      </p>
      {summary.kpis.length > 0 && (
        <div data-tour="dash-cartoes" className="dsh-kpis">
          <KpiCards kpis={summary.kpis} />
        </div>
      )}

      <div className="dsh-mods">
        {shownKeys.map((key, index) => {
          const card = (
            <ModuleCard
              key={key}
              module={MODULE_OF[key]}
              subtitle={subtitleOf(key, panels, dash)}
              state={panels[key]}
              first={index === 0}
              workId={workId}
            >
              {panelBody(key, panels, workId)}
            </ModuleCard>
          );
          // O primeiro quadro é o alvo do tour; o envoltório só existe nele.
          return index === 0 ? (
            <div key={key} data-tour="dash-quadro">
              {card}
            </div>
          ) : (
            card
          );
        })}
        {!shownKeys.length && (
          <div className="panel p-6 text-sm text-slate-500">
            Nenhum quadro para mostrar:{' '}
            {available.length ? 'os módulos que você pode abrir ainda não têm dados nesta obra.' : 'nenhum módulo liberado para você.'}
          </div>
        )}
      </div>
      <p data-tour="dash-rodape" className="dsh-foot-note">
        Ranking das obras e avanço físico consideram sempre a obra inteira; o recorte por empreiteiro e pavimento vale nos demais quadros.
        Nada aqui se edita: os links levam à aba de origem.{' '}
        {dash.unavailable.length > 0 && (
          <button type="button" className="text-link inline-flex items-center gap-1" onClick={() => window.location.reload()}>
            <RefreshCw size={12} aria-hidden /> Recarregar a página
          </button>
        )}
      </p>
    </div>
  );
}

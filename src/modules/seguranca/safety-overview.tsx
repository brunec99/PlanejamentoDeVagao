'use client';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarRange,
  Camera,
  ChevronDown,
  FileDown,
  ListFilter,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Tags,
  X,
} from 'lucide-react';
import {
  SAFETY_CONSEQUENCES,
  SAFETY_LIMITS,
  SAFETY_PROBABILITIES,
  safetyDays,
  type SafetyCommand,
  type SafetyConsequence,
  type SafetyItem,
  type SafetyPhoto,
  type SafetyPhotoKind,
  type SafetyProbability,
} from '@/domain/safety';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, Panel, StatCard } from '@/modules/planejamento/ui';
import { TabHeader } from '@/modules/layout/tab-header';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { formatDate } from '@/shared/format';
import { compareText } from '@/modules/curto-prazo/sheet-view';
import { DonutRing, donutColor, sharePercent } from '@/modules/terminalidade/donut-chart';
import { PhotoViewer } from '@/modules/terminalidade/photo-viewer';
import { refreshPhotos } from '@/modules/terminalidade/photo-refresh';
import { isSafetyConflict, useSafety } from './api';
import { SafetyItemDialog } from './item-dialog';
import { SafetyResolveDialog } from './resolve-dialog';
import { SafetyBulkEditDialog } from './bulk-edit-dialog';
import { SafetyTypesDialog } from './types-dialog';
import { SafetyPrintDialog } from './print-dialog';
import {
  DEFAULT_FILTERS,
  NONE,
  NO_LOCATION_LABEL,
  NO_TYPE_LABEL,
  OPEN_OVER_DAYS,
  SORT_COLUMNS,
  daysLabel,
  diffLabel,
  donutSlices,
  filterItems,
  hasActiveFilters,
  hasPeriod,
  indexSafety,
  isDay,
  isSortColumn,
  locationKey,
  locationOptions,
  monthWindow,
  monthlyByType,
  nextSort,
  percentLabel,
  periodInverted,
  periodLabel,
  photosOf,
  photosOfKind,
  sortItems,
  summarize,
  typeName,
  type DonutField,
  type DonutSlice,
  type MonthWindow,
  type MonthlyRow,
  type SafetyFilters,
  type SafetySituation,
  type SafetySort,
  type SafetySortColumn,
} from './safety-view';

/** Aba 6, Segurança do trabalho (05/11/2026): a planilha "SST - Controle geral" dentro do sistema, no
 * desenho da terminalidade (aba 5) — cartões, roscas, quadro mês a mês por tipo, filtros e a lista com
 * classificação por coluna. Só o TST e o admin gravam (`canEdit`, decidido pelo servidor); os demais
 * consultam. */

type DialogState =
  { kind: 'new' } | { kind: 'edit'; itemId: string } | { kind: 'resolve'; itemId: string } | { kind: 'bulk' } | { kind: 'types' };
/** A obra pode ter mais de 1.200 apontamentos (quase todos histórico finalizado): a lista desenha de 100 em 100. */
const PAGE = 100;
const SITUATIONS: { value: SafetySituation; label: string }[] = [
  { value: 'open', label: 'Abertos' },
  { value: 'resolved', label: 'Finalizados' },
  { value: 'all', label: 'Todos' },
];
const stop = (event: MouseEvent) => event.stopPropagation();
const SORT_LABEL = Object.fromEntries(SORT_COLUMNS.map(c => [c.value, c.label])) as Record<SafetySortColumn, string>;
const DIR_LABEL = { asc: 'crescente', desc: 'decrescente' } as const;
/** O que as roscas contam, no singular e no plural (o anel da aba 5 conta pendências por padrão). */
const NOUN = ['apontamento', 'apontamentos'] as const;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Liga ou desliga um valor num filtro de vários valores. */
const toggleValue = <T extends string>(list: T[], value: T) => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
/** Começo da descrição para títulos de confirmação e rótulos de leitor de tela. */
const short = (text: string, max = 60) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Cor da "Risco: consequência", da mais grave para a mais leve; a multa (consequência legal) em violeta.
 * O texto sempre aparece: a cor só reforça. */
const CONSEQUENCE_TONE: Record<SafetyConsequence, string> = {
  Morte: 'bg-red-100 text-red-800 ring-red-200',
  Severa: 'bg-orange-100 text-orange-800 ring-orange-200',
  Significativa: 'bg-amber-100 text-amber-800 ring-amber-200',
  Leve: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  Nenhuma: 'bg-slate-100 text-slate-700 ring-slate-200',
  'Autuação/Multa': 'bg-violet-100 text-violet-800 ring-violet-200',
};

export function SafetyOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const { state, reload, execute } = useSafety(workId);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<SafetyFilters>(DEFAULT_FILTERS);
  const [dialog, setDialog] = useState<DialogState>();
  const [viewer, setViewer] = useState<{ photos: SafetyPhoto[]; start: number }>();
  const [busy, setBusy] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // Apontamentos marcados para a edição em lote (tipo, consequência, probabilidade e local).
  const [checked, setChecked] = useState<string[]>([]);
  // Classificação por coluna, à parte dos filtros: "Limpar filtros" não desfaz a ordem escolhida.
  const [sort, setSort] = useState<SafetySort>();
  const [printing, setPrinting] = useState(false);
  // Quantas linhas a lista desenha; volta a 100 quando os filtros ou a ordem mudam.
  const [limit, setLimit] = useState(PAGE);

  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const work = planning.data.works.find(w => w.id === workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  // "Hoje" no fuso da obra (America/Sao_Paulo), o mesmo das outras abas.
  const today = planning.today;
  const ready = state.status === 'ready' ? state.data : undefined;
  const canEdit = !!ready?.canEdit;

  const header = (
    <div data-tour="safety-header">
      <TabHeader
        workId={workId}
        section="seguranca"
        helpTitle="Como funciona: segurança do trabalho"
        description="A vistoria dos técnicos de segurança: cada apontamento com risco, local e foto, até a foto da correção."
        help={
          <>
            <p>
              É a planilha “SST - Controle geral” dentro do sistema: cada linha é um apontamento da vistoria de segurança, com tipo, risco
              (consequência e probabilidade), descrição, local, data e foto.
            </p>
            <p>
              Só os técnicos de segurança (TST) e os administradores lançam, editam, finalizam, reabrem e excluem apontamentos. Os demais
              com acesso à obra consultam a lista, as fotos e o PDF.
            </p>
            <p>
              O apontamento só é finalizado com a foto da correção e a data. “Dias para resolver” conta do apontamento até a correção; nos
              abertos, até hoje. Se a correção não ficou boa, “Reabrir” devolve o apontamento para os abertos.
            </p>
            <p>Os tipos de apontamento são os mesmos em todas as obras, para comparar as obras mês a mês.</p>
          </>
        }
      >
        {canEdit && (
          <button type="button" className="button" data-tour="safety-new" aria-haspopup="dialog" onClick={() => setDialog({ kind: 'new' })}>
            <Plus size={16} aria-hidden />
            Novo apontamento
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            className="button-ghost"
            data-tour="safety-types"
            aria-haspopup="dialog"
            title="Cadastra, renomeia, reordena e desativa os tipos (a lista é a mesma em todas as obras)"
            onClick={() => setDialog({ kind: 'types' })}
          >
            <Tags size={16} aria-hidden />
            Tipos de apontamento
          </button>
        )}
        {/* Atalho para o modo de campo: celular, sem sinal, com fila que sobe quando a conexão volta. */}
        <a
          href={`/campo/seguranca?obra=${encodeURIComponent(workId)}`}
          className="button-ghost"
          data-tour="safety-field"
          title="Abre a lista no celular; depois de baixar a obra, funciona sem sinal no canteiro"
        >
          <Smartphone size={16} aria-hidden />
          Usar no celular, sem sinal
        </a>
        {/* Leitura também: quem só acompanha a obra é quem mais leva a lista impressa para a reunião. */}
        {ready && (
          <button
            type="button"
            className="button-ghost"
            data-tour="safety-pdf"
            aria-haspopup="dialog"
            disabled={ready.items.length === 0}
            title="Gera um PDF com os apontamentos que a lista mostra, com os filtros e a classificação de agora"
            onClick={() => setPrinting(true)}
          >
            <FileDown size={16} aria-hidden />
            Gerar PDF
          </button>
        )}
      </TabHeader>
    </div>
  );

  if (state.status === 'loading') return <LoadState rows={8} />;
  if (state.status === 'error')
    return (
      <>
        {header}
        <div className="panel space-y-4 p-6">
          <Callout tone="danger" role="alert">
            Não foi possível carregar os apontamentos. {state.message}
          </Callout>
          <button
            type="button"
            className="button-ghost"
            disabled={retrying}
            onClick={() => {
              setRetrying(true);
              reload().finally(() => setRetrying(false));
            }}
          >
            <RefreshCw size={15} aria-hidden />
            {retrying ? 'Tentando…' : 'Tentar de novo'}
          </button>
        </div>
      </>
    );
  if (state.status === 'unavailable')
    return (
      <>
        {header}
        <Callout tone="warning" role="status">
          A segurança do trabalho ainda não foi ativada no banco: aplique a migração 0040.
        </Callout>
      </>
    );

  const data = state.data;
  const index = indexSafety(data);
  const inspectors = [...data.inspectors].sort((a, b) => compareText(a.name, b.name));
  const locations = locationOptions(data.items);
  const suggestions = locations.map(option => option.label);
  const rows = sortItems(filterItems(data.items, filters, index), index, sort, today);
  const shown = rows.slice(0, limit);
  // A seleção vale só para o que está na lista: filtrar some com os marcados que saíram de vista.
  const visibleIds = new Set(rows.map(item => item.id));
  const selection = checked.filter(id => visibleIds.has(id));
  // "Marcar todos" marca as linhas desenhadas, não as que ainda estão atrás do "Mostrar mais".
  const allChecked = shown.length > 0 && shown.every(item => selection.includes(item.id));
  const someChecked = shown.some(item => selection.includes(item.id));
  const toggle = (id: string) => setChecked(current => (current.includes(id) ? current.filter(x => x !== id) : [...current, id]));
  const toggleAll = () => {
    const ids = shown.map(item => item.id);
    setChecked(current => (allChecked ? current.filter(id => !ids.includes(id)) : [...new Set([...current, ...ids])]));
  };
  const selectable = canEdit;
  const overBulkLimit = selection.length > SAFETY_LIMITS.maxBulkItems;
  // Os cartões contam a seleção dos filtros em todas as situações: abertos + finalizados = total.
  const scope = summarize(filterItems(data.items, filters, index, ['situation']), today);
  const narrowed = hasActiveFilters({ ...filters, situation: DEFAULT_FILTERS.situation });
  // Roscas: seguem a situação e os demais filtros, mas cada uma ignora o próprio, para continuar
  // mostrando as alternativas; clicar na legenda liga ou desliga aquele valor no filtro.
  const donuts = (
    [
      { field: 'tipo', title: 'Por tipo', plural: 'tipos', ignore: 'typeIds' },
      { field: 'consequencia', title: 'Por consequência', plural: 'consequências', ignore: 'consequences' },
      { field: 'probabilidade', title: 'Por probabilidade', plural: 'probabilidades', ignore: 'probabilities' },
    ] as const
  ).map(donut => {
    const scoped = filterItems(data.items, filters, index, [donut.ignore]);
    return { ...donut, total: scoped.length, slices: donutSlices(scoped, index, donut.field) };
  });
  const donutSelected = (field: DonutField, slice: DonutSlice) =>
    field === 'tipo'
      ? filters.typeIds.includes(slice.key)
      : field === 'consequencia'
        ? filters.consequences.includes(slice.key as SafetyConsequence)
        : filters.probabilities.includes(slice.key as SafetyProbability);
  const pickSlice = (field: DonutField, slice: DonutSlice) => {
    if (slice.others) return;
    if (field === 'tipo') patch({ typeIds: toggleValue(filters.typeIds, slice.key) });
    else if (field === 'consequencia') patch({ consequences: toggleValue(filters.consequences, slice.key as SafetyConsequence) });
    else patch({ probabilities: toggleValue(filters.probabilities, slice.key as SafetyProbability) });
  };
  // Quadro mês a mês: conta pelo mês da data do apontamento, abertos e finalizados, com os demais filtros.
  // Sem período, os últimos 4 meses; com período, os meses dele (até 12).
  const monthRange = monthWindow(today, filters);
  const monthly = monthlyByType(filterItems(data.items, filters, index, ['situation']), index, today, monthRange.months);
  // Contagem de cada opção dos filtros, ignorando o próprio filtro (como as roscas).
  const countBy = (ignore: keyof SafetyFilters, key: (item: SafetyItem) => string) => {
    const counts = new Map<string, number>();
    for (const item of filterItems(data.items, filters, index, [ignore])) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
    return counts;
  };
  const typeCounts = countBy('typeIds', item => (item.typeId && index.types.has(item.typeId) ? item.typeId : NONE));
  const consequenceCounts = countBy('consequences', item => item.consequence);
  const probabilityCounts = countBy('probabilities', item => item.probability);
  const locationCounts = countBy('locations', item => locationKey(item.location) || NONE);
  const types = [...data.types].sort((a, b) => a.orderIndex - b.orderIndex || compareText(a.name, b.name));
  const activeCount =
    [filters.typeIds, filters.consequences, filters.probabilities, filters.locations].filter(list => list.length > 0).length +
    (filters.search.trim() ? 1 : 0);

  const patch = (next: Partial<SafetyFilters>) => {
    setFilters(current => ({ ...current, ...next }));
    setLimit(PAGE);
  };
  const sortBy = (column: SafetySortColumn) => {
    setSort(current => nextSort(current, column));
    setLimit(PAGE);
  };

  const openPhotos = (item: SafetyItem, kind: SafetyPhotoKind, at: number) => {
    const all = photosOf(index, item.id);
    const issues = all.filter(photo => photo.kind === 'issue').length;
    setViewer({ photos: all, start: kind === 'issue' ? at : issues + at });
  };
  const openItem = (item: SafetyItem) => setDialog({ kind: 'edit', itemId: item.id });

  /** 409 = outra pessoa mudou os apontamentos: a tela relê do servidor antes de devolver o erro. */
  const guardedExecute = async (command: SafetyCommand) => {
    try {
      await execute(command);
    } catch (cause) {
      if (isSafetyConflict(cause)) void reload();
      throw cause;
    }
  };
  /** Os diálogos gravam e avisam por conta própria (sucesso e erro); a lista só fecha o diálogo. */
  const closeDialog = () => setDialog(undefined);
  const run = async (item: SafetyItem, command: SafetyCommand, success: string) => {
    if (busy) return;
    setBusy(item.id);
    try {
      await execute(command);
      toast({ title: success, tone: 'success' });
    } catch (cause) {
      if (isSafetyConflict(cause)) {
        await reload();
        toast({
          title: 'A lista mudou enquanto você trabalhava.',
          description: 'Outra pessoa alterou estes apontamentos. A tela foi atualizada: confira e tente de novo.',
          tone: 'info',
        });
        return;
      }
      const title = 'Não foi possível salvar.';
      const message = cause instanceof Error ? cause.message : '';
      toast({ title, description: message && message !== title ? message : undefined, tone: 'danger' });
    } finally {
      setBusy('');
    }
  };
  const reopen = async (item: SafetyItem) => {
    const ok = await confirm({
      title: 'Reabrir o apontamento?',
      description: `“${short(item.description)}”: a data de correção (${item.correctedOn ? formatDate(item.correctedOn) : '—'}) e o “como foi corrigido” são apagados e o apontamento volta para os abertos. As fotos ficam.`,
      confirmLabel: 'Reabrir',
    });
    if (ok) await run(item, { type: 'reopen_item', itemId: item.id }, 'Apontamento reaberto.');
  };
  const remove = async (item: SafetyItem) => {
    const ok = await confirm({
      title: 'Excluir o apontamento?',
      description: `“${short(item.description)}” sai da lista com as fotos dele. Isto não pode ser desfeito.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (ok) await run(item, { type: 'delete_item', itemId: item.id }, 'Apontamento excluído.');
  };

  const editing = dialog && 'itemId' in dialog ? data.items.find(i => i.id === dialog.itemId) : undefined;
  const emptyState =
    data.items.length === 0 ? (
      <Empty>Nenhum apontamento registrado ainda.{canEdit && ' Use “Novo apontamento” para registrar o primeiro, com a foto.'}</Empty>
    ) : rows.length === 0 ? (
      filters.situation === 'open' && scope.open === 0 && scope.resolved > 0 ? (
        <Callout tone="success" role="status">
          Nenhum apontamento aberto{narrowed ? ' nesta seleção' : ''}: os {scope.resolved} registrados estão finalizados.
        </Callout>
      ) : (
        <Empty>Nenhum apontamento com esses filtros.</Empty>
      )
    ) : null;
  const remaining = rows.length - shown.length;
  const showMore = remaining > 0 && (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-600">
      <button type="button" className="button-ghost" onClick={() => setLimit(current => current + PAGE)}>
        Mostrar mais {Math.min(PAGE, remaining)}
      </button>
      <span>
        {plural(remaining, 'apontamento ainda não mostrado', 'apontamentos ainda não mostrados')}. Os filtros e a busca encontram qualquer
        um deles.
      </span>
    </div>
  );
  const itemLabel = (item: SafetyItem) => `“${short(item.description, 50)}”`;

  return (
    <>
      {header}

      {!canEdit && (
        <div data-tour="safety-readonly" className="mb-4">
          <Callout tone="info" role="status">
            Consulta: só os técnicos de segurança (TST) e os administradores lançam e finalizam apontamentos.{' '}
            {inspectors.length > 0
              ? `TSTs desta obra: ${inspectors.map(person => person.name).join(', ')}.`
              : 'Nenhum TST tem acesso a esta obra. O administrador escolhe o papel “TST” em Configurações → Usuários.'}
          </Callout>
        </div>
      )}
      {canEdit && data.types.length === 0 && (
        <div className="mb-4">
          <Callout tone="info" role="status">
            Nenhum tipo de apontamento cadastrado ainda. Use “Tipos de apontamento” para cadastrar a lista (Proteções periféricas, SPIQ –
            Linha de Vida…), que vale para todas as obras.
          </Callout>
        </div>
      )}

      {data.items.length > 0 && <PeriodBar from={filters.from} to={filters.to} onChange={period => patch(period)} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-tour="safety-cards">
        <StatCard label="Total" value={scope.total} hint={narrowed ? 'na seleção dos filtros' : 'apontamentos da obra'} />
        <StatCard label="Abertos" value={scope.open} tone={scope.open > 0 ? 'warning' : 'default'} />
        <StatCard
          label="Finalizados"
          value={scope.resolved}
          tone={scope.resolved > 0 ? 'success' : 'default'}
          hint={scope.total ? `${percentLabel(scope)} do total` : 'sem apontamentos'}
        />
        <StatCard
          label="Média de dias para resolver"
          value={daysLabel(scope.avgDaysToResolve)}
          hint={scope.avgDaysToResolve === null ? 'nenhum finalizado' : `nos ${plural(scope.resolved, 'finalizado', 'finalizados')}`}
        />
        <StatCard
          label={`Abertos há mais de ${OPEN_OVER_DAYS} dias`}
          value={scope.openOverDays}
          tone={scope.openOverDays > 0 ? 'danger' : 'default'}
          hint="contados até hoje"
        />
      </div>

      {donuts.some(donut => donut.total > 0) && (
        // `grid-cols-1` (minmax(0, 1fr)) e não a coluna implícita: sem ela, a legenda em uma linha (nomes de tipo
        // longos) alargava a coluna além da tela no celular e criava rolagem lateral.
        <div
          className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3"
          aria-label="Apontamentos por tipo, consequência e probabilidade"
          data-tour="safety-donuts"
        >
          {donuts.map(donut => (
            <DonutPanel
              key={donut.field}
              title={donut.title}
              plural={donut.plural}
              total={donut.total}
              slices={donut.slices}
              selected={slice => donutSelected(donut.field, slice)}
              onPick={slice => pickSlice(donut.field, slice)}
            />
          ))}
        </div>
      )}
      {/* As roscas seguem a situação da lista: num período antigo, em "Abertos", elas sumiriam sem explicação. */}
      {!donuts.some(donut => donut.total > 0) && filters.situation !== 'all' && scope.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <span>
            Os gráficos seguem a situação da lista: nenhum apontamento {filters.situation === 'open' ? 'aberto' : 'finalizado'}
            {narrowed ? ' nesta seleção' : ''}.
          </span>
          <button type="button" className="button-ghost px-2.5 py-1 text-xs" onClick={() => patch({ situation: 'all' })}>
            Ver todos os {scope.total}
          </button>
        </div>
      )}

      {data.items.length > 0 && (
        <div className="mt-4">
          <Panel title="Apontamentos por tipo, mês a mês" tourId="safety-monthly">
            <MonthlyTable monthly={monthly} range={monthRange} period={periodLabel(filters)} narrowed={narrowed} />
          </Panel>
        </div>
      )}

      <section className="mt-6" aria-labelledby="apontamentos-title">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <h2 id="apontamentos-title" className="text-lg font-bold text-slate-900">
            Apontamentos
          </h2>
          <HelpNote title="Como usar a lista" label="Como usar a lista" compact>
            <p>A lista abre nos apontamentos abertos, do mais recente para o mais antigo.</p>
            <p>
              Clique no título de uma coluna para classificar por ela, como no Excel: o primeiro clique põe em ordem crescente, o segundo em
              decrescente e o terceiro volta à ordem padrão. Células vazias ficam no fim nos dois sentidos. Consequência e probabilidade
              seguem a escala da planilha (crescente começa em “Morte” e em “Provável”), e as colunas de foto classificam pela quantidade de
              fotos. No celular, use “Classificar por”, acima dos cartões.
            </p>
            <p>
              Cada filtro aceita vários valores. Clicar num item da legenda das roscas liga ou desliga aquele valor no filtro. O local junta
              grafias parecidas (“2° Pavimento” e “2º pavimento”).
            </p>
            <p>
              A lista desenha 100 apontamentos por vez; “Mostrar mais” traz os próximos. “Gerar PDF” leva a seleção dos filtros inteira.
            </p>
            <p>Clique numa linha para ver o apontamento e as fotos. Clique numa miniatura para ampliar a foto.</p>
          </HelpNote>
        </div>

        <div data-tour="safety-filters" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Situação" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              {SITUATIONS.map(option => {
                const count = option.value === 'open' ? scope.open : option.value === 'resolved' ? scope.resolved : scope.total;
                const active = filters.situation === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => patch({ situation: option.value })}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${active ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {option.label} <span className={`tabular-nums ${active ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="button-ghost px-2.5 py-1.5 text-xs md:hidden"
              aria-expanded={showFilters}
              aria-controls="seguranca-filtros"
              onClick={() => setShowFilters(open => !open)}
            >
              <ListFilter size={14} aria-hidden />
              Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
            </button>
          </div>

          <div className="relative">
            <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="field py-2 pl-9"
              value={filters.search}
              placeholder="Buscar na descrição, no local, no tipo ou na correção"
              aria-label="Buscar nos apontamentos: descrição, local, tipo e como foi corrigido"
              onChange={e => patch({ search: e.target.value })}
            />
          </div>

          <div id="seguranca-filtros" className={`${showFilters ? 'grid' : 'hidden'} grid-cols-2 gap-2 sm:grid-cols-4 md:grid`}>
            <MultiFilter
              label="Tipo de apontamento"
              value={filters.typeIds}
              onChange={typeIds => patch({ typeIds })}
              options={[
                ...types.map(t => ({
                  value: t.id,
                  label: `${t.name}${t.active ? '' : ' (desativado)'}`,
                  count: typeCounts.get(t.id) ?? 0,
                })),
                { value: NONE, label: `(${NO_TYPE_LABEL.toLowerCase()})`, count: typeCounts.get(NONE) ?? 0 },
              ]}
            />
            <MultiFilter
              label="Risco: consequência"
              align="end"
              value={filters.consequences}
              onChange={consequences => patch({ consequences })}
              options={SAFETY_CONSEQUENCES.map(value => ({ value, label: value, count: consequenceCounts.get(value) ?? 0 }))}
            />
            <MultiFilter
              label="Risco: probabilidade"
              value={filters.probabilities}
              onChange={probabilities => patch({ probabilities })}
              options={SAFETY_PROBABILITIES.map(value => ({ value, label: value, count: probabilityCounts.get(value) ?? 0 }))}
            />
            <MultiFilter
              label="Local"
              align="end"
              value={filters.locations}
              onChange={next => patch({ locations: next })}
              options={[
                ...locations.map(option => ({ value: option.key, label: option.label, count: locationCounts.get(option.key) ?? 0 })),
                { value: NONE, label: `(${NO_LOCATION_LABEL.toLowerCase()})`, count: locationCounts.get(NONE) ?? 0 },
              ]}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>
            {remaining > 0
              ? `Mostrando os ${shown.length} primeiros de ${rows.length} apontamentos desta seleção (${data.items.length} na obra).`
              : `Mostrando ${rows.length} de ${plural(data.items.length, 'apontamento', 'apontamentos')}.`}
          </span>
          {hasActiveFilters(filters) && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setLimit(PAGE);
              }}
            >
              Limpar filtros
            </button>
          )}
          {sort && (
            <>
              <span>
                Classificada por {SORT_LABEL[sort.column]} ({DIR_LABEL[sort.dir]}).
              </span>
              <button type="button" className="text-link" onClick={() => setSort(undefined)}>
                Voltar à ordem padrão
              </button>
            </>
          )}
        </div>

        {selectable && selection.length > 0 && (
          <div
            role="region"
            aria-label="Apontamentos marcados"
            data-tour="safety-bulk"
            className="sticky bottom-3 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary-ring bg-white px-3 py-2 shadow-lg md:static md:shadow-none"
          >
            <span className="text-sm font-semibold text-slate-800">
              {plural(selection.length, 'apontamento marcado', 'apontamentos marcados')}
            </span>
            {overBulkLimit && (
              <span className="text-xs font-semibold text-danger">Edite no máximo {SAFETY_LIMITS.maxBulkItems} de uma vez.</span>
            )}
            <button
              type="button"
              className="button ml-auto"
              aria-haspopup="dialog"
              onClick={() => setDialog({ kind: 'bulk' })}
              disabled={!!busy || overBulkLimit}
            >
              <PencilLine size={15} aria-hidden />
              Editar em lote
            </button>
            <button type="button" className="button-ghost" onClick={() => setChecked([])}>
              <X size={15} aria-hidden />
              Desmarcar
            </button>
          </div>
        )}

        <div className="mt-3" data-tour="safety-table">
          {/* `relative`: os textos `sr-only` (absolutos) das últimas colunas ficam presos à rolagem do quadro; sem
              isso escapavam dela e davam rolagem lateral à página inteira (a tabela tem 1.400 px). */}
          <div
            className="panel relative hidden overflow-x-auto custom-scrollbar md:block"
            role="region"
            aria-label="Lista de apontamentos"
            tabIndex={0}
          >
            <table className="w-full min-w-[1400px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200">
                  {selectable && (
                    <th scope="col" className="w-9 px-2 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={allChecked}
                        ref={el => {
                          if (el) el.indeterminate = someChecked && !allChecked;
                        }}
                        onChange={toggleAll}
                        aria-label={allChecked ? 'Desmarcar os apontamentos mostrados' : 'Marcar os apontamentos mostrados'}
                      />
                    </th>
                  )}
                  <SortHeader column="type" sort={sort} onSort={sortBy} className="w-36" />
                  <SortHeader column="consequence" sort={sort} onSort={sortBy} className="w-28" />
                  <SortHeader column="probability" sort={sort} onSort={sortBy} className="w-24" />
                  <SortHeader column="description" sort={sort} onSort={sortBy} className="min-w-72" />
                  <SortHeader column="location" sort={sort} onSort={sortBy} className="w-32" />
                  <SortHeader column="observedOn" sort={sort} onSort={sortBy} className="w-24" />
                  <SortHeader column="issuePhotos" sort={sort} onSort={sortBy} className="w-24" />
                  <SortHeader column="correctedOn" sort={sort} onSort={sortBy} className="w-24" />
                  <SortHeader column="correctionPhotos" sort={sort} onSort={sortBy} className="w-24" />
                  <SortHeader column="days" sort={sort} onSort={sortBy} className="w-24" />
                  <SortHeader column="situation" sort={sort} onSort={sortBy} className="w-24" center />
                  {canEdit && (
                    <th scope="col" className="w-36 px-2 py-2">
                      <span className="sr-only">Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {shown.map((item, rowIndex) => {
                  const issuePhotos = photosOfKind(index, item.id, 'issue');
                  const correctionPhotos = photosOfKind(index, item.id, 'correction');
                  const label = itemLabel(item);
                  const kind = typeName(index, item);
                  const rowClass = `cursor-pointer border-t border-slate-100 align-middle ${busy === item.id ? 'bg-amber-50/60' : selection.includes(item.id) ? 'bg-primary-soft/40' : 'hover:bg-slate-50/60'}`;
                  return (
                    <tr key={item.id} onClick={() => openItem(item)} className={rowClass}>
                      {selectable && (
                        <td className="px-2 py-1.5" onClick={stop}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={selection.includes(item.id)}
                            onChange={() => toggle(item.id)}
                            aria-label={`Marcar o apontamento ${label} para editar em lote`}
                          />
                        </td>
                      )}
                      <td className="px-2 py-1.5 font-semibold text-slate-700">{kind || <Dash />}</td>
                      <td className="px-2 py-1.5">
                        <ConsequenceChip value={item.consequence} />
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{item.probability || <Dash />}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-start gap-1.5">
                          <button
                            type="button"
                            className="line-clamp-2 text-left font-medium text-slate-800 hover:text-primary"
                            title={item.description}
                            aria-label={`${canEdit ? 'Editar' : 'Ver'} o apontamento: ${item.description}`}
                            aria-haspopup="dialog"
                            onClick={e => {
                              stop(e);
                              openItem(item);
                            }}
                          >
                            {item.description}
                          </button>
                          {item.origin === 'planilha' && <SheetBadge />}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{item.location.trim() || <Dash />}</td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-600">{formatDate(item.observedOn)}</td>
                      <td className="px-2 py-1" onClick={stop}>
                        <Thumbs photos={issuePhotos} label={`do apontamento ${label}`} onOpen={at => openPhotos(item, 'issue', at)} />
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-600">
                        {item.correctedOn ? formatDate(item.correctedOn) : <Dash />}
                      </td>
                      <td className="px-2 py-1" onClick={stop}>
                        <Thumbs
                          photos={correctionPhotos}
                          label={`da correção do apontamento ${label}`}
                          onOpen={at => openPhotos(item, 'correction', at)}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <DaysCell item={item} today={today} />
                      </td>
                      <td
                        className="px-2 py-1.5 text-center"
                        title={item.resolutionNote ? `Como foi corrigido: ${item.resolutionNote}` : undefined}
                      >
                        <SituationChip resolved={item.status === 'resolved'} />
                        {item.resolutionNote && <span className="sr-only">. Como foi corrigido: {item.resolutionNote}</span>}
                      </td>
                      {canEdit && (
                        <td className="px-2 py-1" onClick={stop}>
                          <RowActions tourId="safety-row-actions" on={rowIndex === 0}>
                            {item.status === 'open' ? (
                              <button
                                type="button"
                                className="button-secondary px-2 py-1 text-xs"
                                disabled={!!busy}
                                aria-haspopup="dialog"
                                aria-label={`Finalizar o apontamento ${label}`}
                                onClick={() => setDialog({ kind: 'resolve', itemId: item.id })}
                              >
                                Finalizar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="button-ghost px-2 py-1 text-xs"
                                disabled={!!busy}
                                aria-label={`Reabrir o apontamento ${label}`}
                                onClick={() => reopen(item)}
                              >
                                Reabrir
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => remove(item)}
                              disabled={!!busy}
                              aria-label={`Excluir o apontamento ${label}`}
                              title="Excluir apontamento"
                              className="rounded px-1.5 py-1 text-slate-300 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                            >
                              ✕
                            </button>
                          </RowActions>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {emptyState && <div className="border-t border-slate-100 p-4">{emptyState}</div>}
          </div>

          {/* No celular não há cabeçalho de coluna para clicar: a classificação vira um select. */}
          {data.items.length > 0 && (
            <div className="mb-3 flex items-end gap-2 md:hidden">
              <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
                Classificar por
                <select
                  className="field mt-1 py-1.5"
                  value={sort?.column ?? ''}
                  onChange={e => {
                    const column = e.target.value;
                    setSort(current => (isSortColumn(column) ? { column, dir: current?.dir ?? 'asc' } : undefined));
                    setLimit(PAGE);
                  }}
                >
                  <option value="">Ordem padrão (mais recentes)</option>
                  {SORT_COLUMNS.map(c => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button-ghost shrink-0 py-1.5"
                disabled={!sort}
                aria-label={
                  sort
                    ? `${sort.dir === 'asc' ? 'Crescente' : 'Decrescente'}. Toque para ${sort.dir === 'asc' ? 'decrescente' : 'crescente'}`
                    : undefined
                }
                title={sort ? undefined : 'Escolha antes a coluna para classificar'}
                onClick={() => setSort(current => current && { ...current, dir: current.dir === 'asc' ? 'desc' : 'asc' })}
              >
                {sort?.dir === 'desc' ? <ArrowDown size={15} aria-hidden /> : <ArrowUp size={15} aria-hidden />}
                {sort?.dir === 'desc' ? 'Decrescente' : 'Crescente'}
              </button>
            </div>
          )}

          {/* No celular, cada apontamento é um cartão: a tabela de onze colunas só serviria para rolar de lado. */}
          <div className="space-y-3 md:hidden" role="region" aria-label="Lista de apontamentos">
            {shown.map(item => {
              const all = photosOf(index, item.id);
              const label = itemLabel(item);
              const resolved = item.status === 'resolved';
              const kind = typeName(index, item) || NO_TYPE_LABEL;
              const details = [
                item.location.trim(),
                item.probability && `probabilidade ${item.probability.toLowerCase()}`,
                `apontado em ${formatDate(item.observedOn)}`,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <article
                  key={item.id}
                  aria-label={`${kind}: ${item.description}`}
                  className={`rounded-xl border p-3 shadow-sm ${busy === item.id ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex gap-3">
                    <CardThumb
                      photo={all[0]}
                      more={all.length - 1}
                      label={`Ver as fotos do apontamento ${label}`}
                      onOpen={() => openPhotos(item, all[0]?.kind ?? 'issue', 0)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        {selectable ? (
                          <label className="flex min-h-6 min-w-0 items-center gap-2 text-xs font-bold text-slate-500">
                            <input
                              type="checkbox"
                              className="h-5 w-5 shrink-0 accent-primary"
                              checked={selection.includes(item.id)}
                              onChange={() => toggle(item.id)}
                              aria-label={`Marcar o apontamento ${label} para editar em lote`}
                            />
                            <span className="truncate">{kind}</span>
                          </label>
                        ) : (
                          <p className="truncate text-xs font-bold text-slate-500">{kind}</p>
                        )}
                        <ConsequenceChip value={item.consequence} />
                      </div>
                      <p className="mt-0.5 line-clamp-3 text-sm font-semibold text-slate-900">
                        {item.description}
                        {item.origin === 'planilha' && (
                          <>
                            {' '}
                            <SheetBadge />
                          </>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{details}</p>
                      <p className="mt-0.5 text-xs">
                        {resolved && item.correctedOn ? (
                          <span className="font-semibold text-success">
                            Corrigido em {formatDate(item.correctedOn)} · {plural(safetyDays(item, today), 'dia', 'dias')} para resolver
                          </span>
                        ) : (
                          <DaysCell item={item} today={today} />
                        )}
                      </p>
                      {resolved && item.resolutionNote && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600" title={item.resolutionNote}>
                          Correção: {item.resolutionNote}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {canEdit && !resolved && (
                      <button
                        type="button"
                        className="button flex-1"
                        disabled={!!busy}
                        aria-haspopup="dialog"
                        aria-label={`Finalizar o apontamento ${label}`}
                        onClick={() => setDialog({ kind: 'resolve', itemId: item.id })}
                      >
                        Finalizar
                      </button>
                    )}
                    {canEdit && resolved && (
                      <button
                        type="button"
                        className="button-ghost flex-1"
                        disabled={!!busy}
                        aria-label={`Reabrir o apontamento ${label}`}
                        onClick={() => reopen(item)}
                      >
                        Reabrir
                      </button>
                    )}
                    <button
                      type="button"
                      className="button-ghost flex-1"
                      aria-haspopup="dialog"
                      aria-label={`${canEdit ? 'Editar' : 'Ver'} o apontamento ${label}`}
                      onClick={() => openItem(item)}
                    >
                      {canEdit ? 'Editar' : 'Ver'}
                    </button>
                  </div>
                </article>
              );
            })}
            {emptyState && <div className="rounded-xl border border-slate-200 bg-white p-4">{emptyState}</div>}
          </div>
          {showMore}
        </div>
      </section>

      {dialog?.kind === 'new' && canEdit && (
        <SafetyItemDialog
          workId={workId}
          data={data}
          readOnly={false}
          today={today}
          locationSuggestions={suggestions}
          execute={guardedExecute}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'edit' && editing && (
        <SafetyItemDialog
          workId={workId}
          data={data}
          item={editing}
          readOnly={!canEdit}
          today={today}
          locationSuggestions={suggestions}
          execute={guardedExecute}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'resolve' && editing && canEdit && (
        <SafetyResolveDialog
          workId={workId}
          item={editing}
          photos={photosOf(index, editing.id)}
          today={today}
          execute={guardedExecute}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'bulk' && canEdit && selection.length > 0 && (
        <SafetyBulkEditDialog
          workId={workId}
          items={data.items.filter(item => selection.includes(item.id))}
          types={data.types}
          locationSuggestions={suggestions}
          execute={guardedExecute}
          onClose={closeDialog}
          onDone={() => setChecked([])}
        />
      )}
      {dialog?.kind === 'types' && canEdit && (
        <SafetyTypesDialog types={data.types} items={data.items} execute={guardedExecute} onClose={closeDialog} />
      )}
      {viewer && (
        <PhotoViewer
          photos={refreshPhotos(viewer.photos, data.photos)}
          startIndex={viewer.start}
          issueLabel="Apontamento"
          onClose={() => setViewer(undefined)}
        />
      )}
      {printing && <SafetyPrintDialog workId={workId} data={data} filters={filters} sort={sort} onClose={() => setPrinting(false)} />}
    </>
  );
}

const Dash = () => <span className="text-slate-300">—</span>;

/** Ações da linha (Finalizar/Reabrir e excluir). O tour "Como usar" aponta para as da primeira linha: só
 * ela leva a marca, para o `data-tour` ficar único na página. */
function RowActions({ tourId, on, children }: { tourId: string; on: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap" data-tour={on ? tourId : undefined}>
      {children}
    </div>
  );
}

/** Selo do histórico importado da planilha, ao lado da descrição. */
function SheetBadge() {
  return (
    <span
      title="Importado da planilha SST - Controle geral"
      className="inline-flex shrink-0 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-slate-500"
    >
      Planilha
    </span>
  );
}

function ConsequenceChip({ value }: { value: SafetyConsequence }) {
  return (
    <span
      className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${CONSEQUENCE_TONE[value] ?? CONSEQUENCE_TONE.Nenhuma}`}
    >
      <span className="sr-only">Consequência: </span>
      {value}
    </span>
  );
}

function SituationChip({ resolved }: { resolved: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${resolved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}
    >
      {resolved ? 'Finalizado' : 'Aberto'}
    </span>
  );
}

/** "Dias para resolver": no finalizado, os dias até a correção; no aberto, há quanto tempo está aberto
 * (em vermelho depois de 7 dias, como o cartão do topo). */
function DaysCell({ item, today }: { item: SafetyItem; today: string }) {
  const days = safetyDays(item, today);
  if (item.status === 'resolved') return <span className="tabular-nums text-slate-700">{plural(days, 'dia', 'dias')}</span>;
  const late = days > OPEN_OVER_DAYS;
  return (
    <span
      className={`tabular-nums font-semibold ${late ? 'text-danger' : 'text-warning'}`}
      title={late ? `Aberto há mais de ${OPEN_OVER_DAYS} dias` : 'Aberto: conta até hoje'}
    >
      {days === 0 ? 'aberto hoje' : `há ${plural(days, 'dia', 'dias')}`}
    </span>
  );
}

/** Cabeçalho que classifica a lista, como no Excel: cada clique passa de crescente para decrescente e
 * de volta à ordem padrão. A seta fraca avisa que a coluna é clicável. */
function SortHeader({
  column,
  sort,
  onSort,
  className,
  center,
}: {
  column: SafetySortColumn;
  sort?: SafetySort;
  onSort: (column: SafetySortColumn) => void;
  className: string;
  center?: boolean;
}) {
  const label = SORT_LABEL[column];
  const dir = sort?.column === column ? sort.dir : undefined;
  const Icon = dir === 'asc' ? ArrowUp : dir === 'desc' ? ArrowDown : ArrowUpDown;
  const hint =
    dir === 'asc'
      ? `Classificado por ${label}, crescente. Clique para decrescente`
      : dir === 'desc'
        ? `Classificado por ${label}, decrescente. Clique para voltar à ordem padrão`
        : `Classificar por ${label}`;
  return (
    <th
      scope="col"
      className={`${className} px-2 py-2 ${center ? 'text-center' : ''}`}
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={hint}
        aria-label={hint}
        className={`group inline-flex items-center gap-1 rounded uppercase tracking-wider transition-colors hover:text-slate-800 ${center ? 'text-center' : 'text-left'} ${dir ? 'text-slate-800' : ''}`}
      >
        {label}
        <Icon
          size={12}
          aria-hidden
          className={`shrink-0 ${dir ? 'text-primary' : 'text-slate-300 group-hover:text-slate-500 group-focus-visible:text-slate-500'}`}
        />
      </button>
    </th>
  );
}

/** Miniatura da célula: a primeira foto e, havendo mais, um "+N". O clique abre o visualizador. */
function Thumbs({ photos, label, onOpen }: { photos: SafetyPhoto[]; label: string; onOpen: (at: number) => void }) {
  const first = photos[0];
  if (!first) return <Dash />;
  return (
    <button
      type="button"
      onClick={() => onOpen(0)}
      aria-label={`Ver ${photos.length === 1 ? 'a foto' : `as ${photos.length} fotos`} ${label}`}
      className="relative block h-10 w-10 overflow-hidden rounded-md border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-primary-ring"
    >
      <ThumbImage photo={first} />
      {photos.length > 1 && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-slate-900/70 px-1 text-[10px] font-bold text-white">
          +{photos.length - 1}
        </span>
      )}
    </button>
  );
}

function CardThumb({ photo, more, label, onOpen }: { photo?: SafetyPhoto; more: number; label: string; onOpen: () => void }) {
  if (!photo)
    return (
      <span
        aria-hidden
        className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-dashed border-slate-200 text-slate-300"
      >
        <Camera size={20} />
      </span>
    );
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
    >
      <ThumbImage photo={photo} />
      {more > 0 && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-slate-900/70 px-1 text-[10px] font-bold text-white">+{more}</span>
      )}
    </button>
  );
}

function ThumbImage({ photo }: { photo: SafetyPhoto }) {
  const src = photo.thumbUrl ?? photo.url;
  if (!src) return <Camera size={16} aria-hidden className="m-auto text-slate-400" />;
  // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, que expira: não passa pelo otimizador.
  return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />;
}

/** Filtro de vários valores: um botão no formato do select, que abre uma lista de caixas de marcar com a
 * contagem de cada opção. Fecha ao clicar fora ou com Esc. `align="end"` abre a lista alinhada pela direita
 * do botão: é o caso dos filtros que ficam na coluna da direita no celular (consequência e local), cuja
 * lista, alinhada pela esquerda, saía da tela. */
function MultiFilter<T extends string>({
  label,
  options,
  value,
  onChange,
  align = 'start',
}: {
  label: string;
  options: { value: T; label: string; count: number }[];
  value: T[];
  onChange: (value: T[]) => void;
  align?: 'start' | 'end';
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const element = ref.current;
      if (element?.open && !element.contains(event.target as Node)) element.open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      const element = ref.current;
      if (event.key !== 'Escape' || !element?.open) return;
      element.open = false;
      element.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const chosen = options.filter(option => value.includes(option.value));
  const summary =
    value.length === 0 ? 'Todos' : value.length === 1 ? (chosen[0]?.label ?? '1 selecionado') : `${value.length} selecionados`;
  return (
    <div className="min-w-0 text-xs font-semibold text-slate-600">
      <span aria-hidden>{label}</span>
      <details ref={ref} className="relative mt-1">
        <summary
          aria-label={`${label}: ${summary}`}
          className={`field flex cursor-pointer list-none items-center justify-between gap-2 py-1.5 [&::-webkit-details-marker]:hidden ${value.length ? 'font-semibold text-primary-ink' : 'font-normal'}`}
        >
          <span className="truncate">{summary}</span>
          <ChevronDown size={14} aria-hidden className="shrink-0 text-slate-400" />
        </summary>
        <div
          role="group"
          aria-label={label}
          className={`absolute ${align === 'end' ? 'right-0' : 'left-0'} z-30 mt-1 max-h-72 w-64 max-w-[80vw] overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl`}
        >
          {options.map(option => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 font-normal text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-primary"
                checked={value.includes(option.value)}
                onChange={() => onChange(toggleValue(value, option.value))}
              />
              <span className="min-w-0 flex-1 truncate" title={option.label}>
                {option.label}
              </span>
              <span className="tabular-nums text-slate-400">{option.count}</span>
            </label>
          ))}
          {value.length > 0 && (
            <button type="button" className="text-link mt-1 px-1.5 text-xs" onClick={() => onChange([])}>
              Limpar este filtro
            </button>
          )}
        </div>
      </details>
    </div>
  );
}

/** Rosca com a legenda ao lado (cor, nome, quantidade e %). A legenda é a leitura de verdade e também o
 * filtro: clicar num item liga ou desliga aquele valor no filtro. "Outros" não filtra. */
function DonutPanel({
  title,
  plural: pluralLabel,
  total,
  slices,
  selected,
  onPick,
}: {
  title: string;
  plural: string;
  total: number;
  slices: DonutSlice[];
  selected: (slice: DonutSlice) => boolean;
  onPick: (slice: DonutSlice) => void;
}) {
  return (
    <section className="panel p-4" aria-label={title}>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {total === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nenhum apontamento nesta seleção.</p>
      ) : (
        <div className="mt-2 flex items-center gap-4">
          <DonutRing slices={slices} total={total} title={title} noun={NOUN} className="h-28 w-28 shrink-0" />
          <ul className="min-w-0 flex-1 space-y-0.5">
            {slices.map((slice, i) => {
              const active = selected(slice);
              const label = slice.others ? `Outros (${slice.others} ${pluralLabel})` : slice.label;
              const content = (
                <>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: donutColor(slice, i) }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate" title={label}>
                    {label}
                  </span>
                  <span className="font-semibold tabular-nums">{slice.count}</span>
                  <span className="w-9 text-right tabular-nums text-slate-500">{sharePercent(slice)}</span>
                </>
              );
              return (
                <li key={slice.key}>
                  {slice.others ? (
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-slate-600">{content}</div>
                  ) : (
                    <button
                      type="button"
                      aria-pressed={active}
                      title={active ? 'Clique para tirar do filtro' : `Filtrar a lista por ${label}`}
                      onClick={() => onPick(slice)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ${active ? 'bg-primary-soft font-bold text-primary-ink ring-1 ring-primary-ring' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

/** O quadro "Página15" da planilha: apontamentos por tipo nos últimos quatro meses (pelo mês da data do
 * apontamento), a diferença do mês atual sobre o anterior e a linha GERAL. */
function MonthlyTable({
  monthly,
  range,
  period,
  narrowed,
}: {
  monthly: ReturnType<typeof monthlyByType>;
  range: MonthWindow;
  /** O período por extenso ("de 01/10/2026 a 31/10/2026"); vazio sem período. */
  period: string;
  narrowed: boolean;
}) {
  const last = monthly.monthLabels[monthly.monthLabels.length - 1];
  const previous = monthly.monthLabels[monthly.monthLabels.length - 2];
  // Um mês só (período dentro de um mês): não há mês anterior para comparar, e a coluna sai.
  const compare = monthly.months.length > 1;
  return (
    <>
      <p className="mb-3 text-xs text-slate-500">
        {period
          ? `Quantos apontamentos foram feitos em cada mês do período (${period}), pela data do apontamento (abertos e finalizados), com os filtros de agora. O mês cortado pelo início ou pelo término conta só os dias de dentro do período.`
          : 'Quantos apontamentos foram feitos em cada mês, pela data do apontamento (abertos e finalizados), com os filtros de agora.'}
        {compare && ` A última coluna compara ${last} com ${previous}.`}
        {!period && ' O mês atual ainda está em andamento.'}
        {range.periodMonths > monthly.months.length &&
          ` O período tem ${range.periodMonths} meses: o quadro mostra os ${monthly.months.length} últimos.`}
      </p>
      {monthly.rows.length === 0 ? (
        <Empty>
          {period ? 'Nenhum apontamento no período' : `Nenhum apontamento nos últimos ${monthly.months.length} meses`}
          {narrowed && !period ? ' nesta seleção' : ''}.
        </Empty>
      ) : (
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[560px] border-collapse text-left text-xs">
            <thead className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr className="border-b border-slate-200">
                <th scope="col" className="px-2 py-2">
                  Tipo de apontamento
                </th>
                {monthly.monthLabels.map(label => (
                  <th key={label} scope="col" className="w-20 px-2 py-2 text-right">
                    {label}
                  </th>
                ))}
                {compare && (
                  <th scope="col" className="w-32 px-2 py-2 text-right" title={`Diferença de ${last} sobre ${previous}`}>
                    Diferença
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {monthly.rows.map(row => (
                <MonthlyLine key={row.key} row={row} compare={compare} />
              ))}
            </tbody>
            <tfoot>
              <MonthlyLine row={monthly.total} compare={compare} total />
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}

function MonthlyLine({ row, compare, total = false }: { row: MonthlyRow; compare: boolean; total?: boolean }) {
  return (
    <tr className={total ? 'border-t-2 border-slate-200 font-bold text-slate-900' : 'border-t border-slate-100 text-slate-700'}>
      <th scope="row" className={`px-2 py-1.5 text-left ${total ? 'font-bold' : 'font-semibold'}`}>
        {row.label}
      </th>
      {row.counts.map((count, at) => (
        <td key={at} className={`px-2 py-1.5 text-right tabular-nums ${count === 0 ? 'text-slate-300' : ''}`}>
          {count}
        </td>
      ))}
      {compare && <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{diffLabel(row)}</td>}
    </tr>
  );
}

/** Filtro de período do painel (06/11/2026): início e término pela "Data do apontamento", os dois dias
 * inclusive. Vale para os cartões, as roscas, o quadro mês a mês, a lista e o PDF. Um lado vazio não limita. */
function PeriodBar({ from, to, onChange }: { from: string; to: string; onChange: (period: { from?: string; to?: string }) => void }) {
  const inverted = periodInverted({ from, to });
  // O campo de data devolve "" enquanto a data está incompleta; ano com mais de 4 dígitos não entra.
  const pick = (side: 'from' | 'to', value: string) => {
    if (value === '' || isDay(value)) onChange({ [side]: value });
  };
  return (
    <div
      role="group"
      aria-labelledby="seguranca-periodo"
      data-tour="safety-period"
      className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
    >
      <div className="mr-1 basis-full self-center sm:basis-auto">
        <p id="seguranca-periodo" className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <CalendarRange size={16} aria-hidden className="text-slate-500" />
          Período
        </p>
        <p className="text-xs text-slate-500">pela data do apontamento</p>
      </div>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600 sm:flex-none">
        Início
        <input
          type="date"
          className="field w-full py-1.5 sm:w-40"
          value={from}
          max={to || undefined}
          aria-invalid={inverted || undefined}
          onChange={e => pick('from', e.target.value)}
        />
      </label>
      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600 sm:flex-none">
        Término
        <input
          type="date"
          className="field w-full py-1.5 sm:w-40"
          value={to}
          min={from || undefined}
          aria-invalid={inverted || undefined}
          onChange={e => pick('to', e.target.value)}
        />
      </label>
      {hasPeriod({ from, to }) ? (
        <button
          type="button"
          className="text-link self-center text-left text-xs max-sm:basis-full"
          onClick={() => onChange({ from: '', to: '' })}
        >
          Limpar período
        </button>
      ) : (
        <span className="self-center text-xs text-slate-500 max-sm:basis-full">Sem período: todos os apontamentos da obra.</span>
      )}
      {inverted && (
        <p role="alert" className="basis-full text-xs font-semibold text-danger">
          O início está depois do término: nenhum apontamento cabe nesse período.
        </p>
      )}
    </div>
  );
}

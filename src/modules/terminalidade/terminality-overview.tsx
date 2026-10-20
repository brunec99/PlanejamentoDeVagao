'use client';
import Link from 'next/link';
import { useState, type MouseEvent, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Camera,
  FileDown,
  ListFilter,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  X,
} from 'lucide-react';
import type { TerminalityCommand, TerminalityItem, TerminalityPhoto } from '@/domain/terminality';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing, StatCard } from '@/modules/planejamento/ui';
import { TabHeader } from '@/modules/layout/tab-header';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { formatDate, workPath } from '@/shared/format';
import { companyOptions, compareText, textKey } from '@/modules/curto-prazo/sheet-view';
import { useTerminality } from './api';
import { ItemDialog } from './item-dialog';
import { ResolveDialog } from './resolve-dialog';
import { BulkEditDialog } from './bulk-edit-dialog';
import { PhotoViewer } from './photo-viewer';
import { refreshPhotos } from './photo-refresh';
import { TerminalityPrintDialog } from './print-dialog';
import { DonutRing, donutColor, sharePercent } from './donut-chart';
import {
  DEFAULT_FILTERS,
  NONE,
  SORT_COLUMNS,
  donutSlices,
  filterItems,
  floorName,
  hasActiveFilters,
  indexTerminality,
  isSortColumn,
  locationLabel,
  nextSort,
  percentLabel,
  personName,
  photosOf,
  sortItems,
  summarize,
  typeName,
  unitName,
  unitOptions,
  type Breakdown,
  type DonutField,
  type DonutSlice,
  type TerminalityFilters,
  type TerminalitySituation,
  type TerminalitySort,
  type TerminalitySortColumn,
} from './terminality-view';

type DialogState = { kind: 'new' } | { kind: 'edit'; itemId: string } | { kind: 'resolve'; itemId: string } | { kind: 'bulk' };
/** Quantas linhas cada quebra (por empreiteiro, por pavimento) mostra antes do "ver todos". */
const TOP = 6;
const SITUATIONS: { value: TerminalitySituation; label: string }[] = [
  { value: 'open', label: 'Abertas' },
  { value: 'resolved', label: 'Resolvidas' },
  { value: 'all', label: 'Todas' },
];
const stop = (event: MouseEvent) => event.stopPropagation();
const SORT_LABEL = Object.fromEntries(SORT_COLUMNS.map(c => [c.value, c.label])) as Record<TerminalitySortColumn, string>;
const DIR_LABEL = { asc: 'crescente', desc: 'decrescente' } as const;

export function TerminalityOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const { state, reload, execute } = useTerminality(workId);
  const { toast } = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<TerminalityFilters>(DEFAULT_FILTERS);
  const [dialog, setDialog] = useState<DialogState>();
  const [viewer, setViewer] = useState<{ photos: TerminalityPhoto[]; start: number }>();
  const [busy, setBusy] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // Pendências marcadas para a edição em lote (tipo, responsável ATR e responsável terceiro).
  const [checked, setChecked] = useState<string[]>([]);
  // Classificação por coluna, à parte dos filtros: "Limpar filtros" não desfaz a ordem escolhida.
  const [sort, setSort] = useState<TerminalitySort>();
  const [printing, setPrinting] = useState(false);

  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { planning } = context;
  const work = planning.data.works.find(w => w.id === workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const readOnly = actor.role === 'viewer';
  const today = planning.today;
  const ready = state.status === 'ready' ? state.data : undefined;
  const hasCatalog = !!ready && ready.floors.length > 0;

  const header = (
    <TabHeader
      workId={workId}
      section="terminalidade"
      helpTitle="Como funciona: terminalidade"
      description="A lista de pendências da obra por pavimento, apartamento e empreiteiro, com foto do problema e da correção."
      help={
        <>
          <p>
            É a mesma “Lista de pendências” da planilha: cada linha é um problema encontrado na vistoria, com local, apto, tipo, quem da ATR
            acompanha e qual empreiteiro corrige.
          </p>
          <p>
            Registre a pendência com a foto do problema, no escritório ou no celular, na obra. Quando o serviço for corrigido, use
            “Resolver”: a pendência só fecha com a foto da correção e a data. Se a correção não ficou boa, “Reabrir” devolve a pendência
            para as abertas.
          </p>
          <p>
            Pavimentos, apartamentos, tipos e responsáveis da ATR são cadastrados nas Configurações da obra; os empreiteiros vêm do cadastro
            de equipes.
          </p>
        </>
      }
    >
      {!readOnly && hasCatalog && (
        <button type="button" className="button" data-tour="termin-nova" onClick={() => setDialog({ kind: 'new' })}>
          <Plus size={16} aria-hidden />
          Nova pendência
        </button>
      )}
    </TabHeader>
  );

  if (state.status === 'loading') return <LoadState rows={8} />;
  if (state.status === 'error')
    return (
      <>
        {header}
        <div className="panel space-y-4 p-6">
          <Callout tone="danger" role="alert">
            Não foi possível carregar as pendências. {state.message}
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
          A terminalidade ainda não foi ativada no banco: aplique a migração 0028.
        </Callout>
      </>
    );

  const data = state.data;
  if (!hasCatalog)
    return (
      <>
        {header}
        <Callout tone="info" role="status">
          A lista de pendências é organizada por pavimento e apartamento.{' '}
          <Link className="text-link" data-tour="termin-cadastro" href={workPath(workId, 'configuracoes')}>
            Cadastre pavimentos e apartamentos nas Configurações da obra
          </Link>{' '}
          para registrar a primeira pendência.
        </Callout>
      </>
    );

  const index = indexTerminality(data);
  const teams = planning.data.teams.filter(t => t.workId === workId);
  // Empreiteiros do cadastro de equipes e os já escritos em pendências, sem repetir grafias.
  const companies = companyOptions(
    teams.map(t => t.company),
    data.items.map(i => i.contractor ?? ''),
  );
  const rows = sortItems(filterItems(data.items, filters), index, sort);
  // A seleção vale só para o que está na lista: filtrar some com as marcadas que saíram de vista.
  const visibleIds = new Set(rows.map(item => item.id));
  const selection = checked.filter(id => visibleIds.has(id));
  const allChecked = rows.length > 0 && selection.length === rows.length;
  const toggle = (id: string) => setChecked(current => (current.includes(id) ? current.filter(x => x !== id) : [...current, id]));
  const toggleAll = () => setChecked(allChecked ? [] : rows.map(item => item.id));
  const selectable = !readOnly;
  // Os cartões contam a seleção dos filtros em todas as situações: abertas + resolvidas = total.
  const scope = summarize(filterItems(data.items, filters, ['situation']), index);
  // Cada quebra ignora o próprio filtro, para a lista continuar mostrando as alternativas.
  // O filtro guarda a grafia de onde veio (quadro ou lista); o select precisa da grafia da lista.
  const contractorValue =
    filters.contractor === NONE ? NONE : (companies.find(c => textKey(c) === textKey(filters.contractor)) ?? filters.contractor);
  const byContractor = summarize(filterItems(data.items, filters, ['situation', 'contractor']), index).openByContractor;
  const byFloor = summarize(filterItems(data.items, filters, ['situation', 'floorId', 'unitId']), index).openByFloor;
  const narrowed = hasActiveFilters({ ...filters, situation: DEFAULT_FILTERS.situation });
  // Roscas do topo (20/10/2026): seguem a situação e os demais filtros, mas cada uma ignora o próprio,
  // como os quadros abaixo, para continuar mostrando as alternativas; clicar na legenda filtra a lista.
  const donuts = (
    [
      { field: 'tipo', title: 'Por tipo', plural: 'tipos', ignore: ['typeId'] },
      { field: 'pavimento', title: 'Por pavimento', plural: 'pavimentos', ignore: ['floorId', 'unitId'] },
      { field: 'terceiro', title: 'Por responsável terceiro', plural: 'empreiteiros', ignore: ['contractor'] },
    ] as const
  ).map(donut => {
    const scoped = filterItems(data.items, filters, [...donut.ignore]);
    return { ...donut, total: scoped.length, slices: donutSlices(scoped, index, donut.field) };
  });
  /** O valor que a fatia põe no filtro; o empreiteiro vai com a grafia exibida, não com a chave. */
  const donutFilter = (field: DonutField, slice: DonutSlice): Partial<TerminalityFilters> =>
    field === 'tipo'
      ? { typeId: slice.key }
      : field === 'pavimento'
        ? { floorId: slice.key, unitId: '' }
        : { contractor: slice.key === NONE ? NONE : slice.label };
  const donutSelected = (field: DonutField, slice: DonutSlice) =>
    field === 'tipo'
      ? filters.typeId === slice.key
      : field === 'pavimento'
        ? filters.floorId === slice.key
        : !!filters.contractor && (filters.contractor === NONE ? slice.key === NONE : textKey(filters.contractor) === slice.key);
  const pickSlice = (field: DonutField, slice: DonutSlice) => {
    const next = donutFilter(field, slice);
    patch(donutSelected(field, slice) ? Object.fromEntries(Object.keys(next).map(key => [key, ''])) : next);
  };
  const activeCount = (['floorId', 'unitId', 'typeId', 'contractor', 'atrPersonId', 'search'] as const).filter(k => filters[k]).length;
  // Alvos do tour "Como usar" que se repetem por linha: só a primeira ocorrência leva a marca.
  const legendDonut = donuts.find(donut => donut.total > 0)?.field;
  const firstPhotoId = rows.find(item => photosOf(index, item.id).issue.length > 0)?.id;
  const firstOpenId = rows.find(item => item.status === 'open')?.id;
  const firstResolvedId = rows.find(item => item.status === 'resolved')?.id;

  const patch = (next: Partial<TerminalityFilters>) => setFilters(current => ({ ...current, ...next }));
  const sortBy = (column: TerminalitySortColumn) => setSort(current => nextSort(current, column));
  /** Clicar numa quebra filtra por ela (de novo, desfaz). Como a quebra conta abertas, sai de "Resolvidas". */
  const pick = (next: Partial<TerminalityFilters>, same: boolean) =>
    setFilters(current => ({
      ...current,
      ...(same ? Object.fromEntries(Object.keys(next).map(k => [k, ''])) : next),
      situation: current.situation === 'resolved' ? 'open' : current.situation,
    }));

  const openPhotos = (item: TerminalityItem, kind: 'issue' | 'correction', at: number) => {
    const { issue, correction } = photosOf(index, item.id);
    setViewer({ photos: [...issue, ...correction], start: kind === 'issue' ? at : issue.length + at });
  };
  const openItem = (item: TerminalityItem) => setDialog({ kind: 'edit', itemId: item.id });

  /** Os diálogos gravam e avisam por conta própria (sucesso e erro); a lista só fecha o diálogo. */
  const closeDialog = () => setDialog(undefined);
  const run = async (item: TerminalityItem, command: TerminalityCommand, success: string) => {
    if (busy) return;
    setBusy(item.id);
    try {
      await execute(command);
      toast({ title: success, tone: 'success' });
    } catch (cause) {
      const title = 'Não foi possível salvar.';
      const message = cause instanceof Error ? cause.message : '';
      toast({ title, description: message && message !== title ? message : undefined, tone: 'danger' });
    } finally {
      setBusy('');
    }
  };
  const reopen = async (item: TerminalityItem) => {
    const ok = await confirm({
      title: `Reabrir a pendência de ${locationLabel(index, item)}?`,
      description: `A data de correção (${item.correctedOn ? formatDate(item.correctedOn) : '—'}) é apagada e a pendência volta para as abertas.`,
      confirmLabel: 'Reabrir',
    });
    if (ok) await run(item, { type: 'reopen_item', itemId: item.id }, 'Pendência reaberta.');
  };
  const remove = async (item: TerminalityItem) => {
    const ok = await confirm({
      title: `Excluir a pendência de ${locationLabel(index, item)}?`,
      description: `“${item.description}” sai da lista com as fotos dela. Isto não pode ser desfeito.`,
      confirmLabel: 'Excluir',
      tone: 'danger',
    });
    if (ok) await run(item, { type: 'delete_item', itemId: item.id }, 'Pendência excluída.');
  };

  const editing = dialog && 'itemId' in dialog ? data.items.find(i => i.id === dialog.itemId) : undefined;
  const emptyState =
    data.items.length === 0 ? (
      <Empty>
        Nenhuma pendência registrada ainda.{!readOnly && ' Use “Nova pendência” para registrar a primeira, com a foto do problema.'}
      </Empty>
    ) : rows.length === 0 ? (
      filters.situation === 'open' && scope.open === 0 && scope.resolved > 0 ? (
        <Callout tone="success" role="status">
          Nenhuma pendência aberta{narrowed ? ' nesta seleção' : ''}: as {scope.resolved} registradas estão resolvidas.
        </Callout>
      ) : (
        <Empty>Nenhuma pendência com esses filtros.</Empty>
      )
    ) : null;

  const floors = [...data.floors].sort((a, b) => a.orderIndex - b.orderIndex || compareText(a.name, b.name));
  const types = [...data.types].sort((a, b) => a.orderIndex - b.orderIndex || compareText(a.name, b.name));
  const people = [...data.people].sort((a, b) => compareText(a.name, b.name));
  const units = unitOptions(data, filters.floorId);

  return (
    <>
      {header}

      <div className="grid gap-3 sm:grid-cols-3" data-tour="termin-indicadores">
        <StatCard
          label="Abertas"
          value={scope.open}
          tone={scope.open > 0 ? 'warning' : 'default'}
          hint={narrowed ? 'na seleção dos filtros' : undefined}
        />
        <StatCard label="Resolvidas" value={scope.resolved} tone={scope.resolved > 0 ? 'success' : 'default'} />
        <StatCard label="% resolvida" value={percentLabel(scope)} hint={scope.total ? `de ${scope.total} pendências` : 'sem pendências'} />
      </div>

      {donuts.some(donut => donut.total > 0) && (
        <div
          className="mt-4 grid gap-4 lg:grid-cols-3"
          aria-label="Pendências por tipo, pavimento e responsável terceiro"
          data-tour="termin-roscas"
        >
          {donuts.map(donut => (
            <DonutPanel
              key={donut.field}
              title={donut.title}
              plural={donut.plural}
              total={donut.total}
              slices={donut.slices}
              markLegend={donut.field === legendDonut}
              selected={slice => donutSelected(donut.field, slice)}
              onPick={slice => pickSlice(donut.field, slice)}
            />
          ))}
        </div>
      )}

      {(byContractor.length > 0 || byFloor.length > 0) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2" data-tour="termin-quebras">
          <BreakdownPanel
            title="Abertas por responsável terceiro"
            items={byContractor}
            selected={filters.contractor}
            onPick={(key, same) => pick({ contractor: key }, same)}
          />
          <BreakdownPanel
            title="Abertas por pavimento"
            items={byFloor}
            selected={filters.floorId}
            onPick={(key, same) => pick({ floorId: key, unitId: '' }, same)}
          />
        </div>
      )}

      <section className="mt-6" aria-labelledby="pendencias-title">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <h2 id="pendencias-title" className="text-lg font-bold text-slate-900">
            Lista de pendências
          </h2>
          <span data-tour="termin-como-usar" className="inline-flex">
            <HelpNote title="Como usar a lista" label="Como usar a lista" compact>
              <p>A lista abre nas pendências abertas, na ordem da obra: pavimento, apartamento e data de observação.</p>
              <p>
                Clique no título de uma coluna para classificar por ela, como no Excel: o primeiro clique põe em ordem crescente, o segundo
                em decrescente e o terceiro volta à ordem padrão. Células vazias ficam no fim nos dois sentidos. “Local” segue a ordem dos
                pavimentos da obra, não a alfabética, e as colunas de foto classificam pela quantidade de fotos. No celular, use
                “Classificar por”, acima dos cartões.
              </p>
              <p>“Gerar PDF” leva o que a lista mostra, com os filtros e a classificação de agora.</p>
              <p>
                Clique numa linha para ver ou editar a pendência e as fotos. Clique numa miniatura para ampliar a foto. Clicar num
                empreiteiro ou pavimento nos quadros acima filtra a lista por ele.
              </p>
            </HelpNote>
          </span>
          {/* Atalho para o modo de campo: celular, sem sinal, com fila que sobe quando a conexão volta. */}
          <a
            href={`/campo/terminalidade?obra=${encodeURIComponent(workId)}`}
            data-tour="termin-celular"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Abre a lista no celular; depois de baixar a obra, funciona sem sinal no canteiro"
          >
            <Smartphone size={14} aria-hidden /> Usar no celular, sem sinal
          </a>
          {/* Leitura também: quem só acompanha a obra é quem mais leva a lista impressa para a reunião. */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
            disabled={data.items.length === 0}
            aria-haspopup="dialog"
            data-tour="termin-pdf"
            title="Gera um PDF com as pendências que a lista mostra, com os filtros e a classificação de agora"
            onClick={() => setPrinting(true)}
          >
            <FileDown size={14} aria-hidden /> Gerar PDF
          </button>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <div
              role="group"
              aria-label="Situação"
              data-tour="termin-situacao"
              className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
            >
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
              aria-controls="terminalidade-filtros"
              data-tour="termin-filtros-celular"
              onClick={() => setShowFilters(open => !open)}
            >
              <ListFilter size={14} aria-hidden />
              Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
            </button>
          </div>
        </div>

        <div className="relative mt-3" data-tour="termin-busca">
          <Search aria-hidden size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            className="field py-2 pl-9"
            value={filters.search}
            placeholder="Buscar na descrição"
            aria-label="Buscar na descrição da pendência"
            onChange={e => patch({ search: e.target.value })}
          />
        </div>

        <div
          id="terminalidade-filtros"
          data-tour="termin-filtros"
          className={`${showFilters ? 'grid' : 'hidden'} mt-3 grid-cols-2 gap-2 sm:grid-cols-3 md:grid lg:grid-cols-5`}
        >
          <FilterSelect label="Pavimento" value={filters.floorId} onChange={floorId => patch({ floorId, unitId: '' })}>
            {floors.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Apto" value={filters.unitId} onChange={unitId => patch({ unitId })}>
            <option value={NONE}>(sem apto)</option>
            {units.map(u => (
              <option key={u.id} value={u.id}>
                {filters.floorId ? u.name : `${u.name} · ${index.floors.get(u.floorId)?.name ?? ''}`}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Tipo" value={filters.typeId} onChange={typeId => patch({ typeId })}>
            <option value={NONE}>(sem tipo)</option>
            {types.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.active ? '' : ' (desativado)'}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Responsável terceiro" value={contractorValue} onChange={contractor => patch({ contractor })}>
            <option value={NONE}>(sem responsável)</option>
            {companies.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Responsável ATR" value={filters.atrPersonId} onChange={atrPersonId => patch({ atrPersonId })}>
            <option value={NONE}>(sem responsável)</option>
            {people.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.active ? '' : ' (desativado)'}
              </option>
            ))}
          </FilterSelect>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600" data-tour="termin-contagem">
          <span>
            Mostrando {rows.length} de {data.items.length} {data.items.length === 1 ? 'pendência' : 'pendências'}.
          </span>
          {hasActiveFilters(filters) && (
            <button type="button" className="text-link" onClick={() => setFilters(DEFAULT_FILTERS)}>
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
            aria-label="Pendências marcadas"
            data-tour="termin-lote"
            className="sticky bottom-3 z-20 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary-ring bg-white px-3 py-2 shadow-lg md:static md:shadow-none"
          >
            <span className="text-sm font-semibold text-slate-800">
              {selection.length} {selection.length === 1 ? 'pendência marcada' : 'pendências marcadas'}
            </span>
            <button type="button" className="button ml-auto" onClick={() => setDialog({ kind: 'bulk' })} disabled={!!busy}>
              <PencilLine size={15} aria-hidden />
              Editar em lote
            </button>
            <button type="button" className="button-ghost" onClick={() => setChecked([])}>
              <X size={15} aria-hidden />
              Desmarcar
            </button>
          </div>
        )}

        <div className="mt-3">
          <div
            className="panel hidden overflow-x-auto custom-scrollbar md:block"
            role="region"
            aria-label="Lista de pendências"
            tabIndex={0}
          >
            <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200" data-tour="termin-colunas">
                  {selectable && (
                    <th scope="col" className="w-9 px-2 py-2" data-tour="termin-marcar">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={allChecked}
                        ref={el => {
                          if (el) el.indeterminate = selection.length > 0 && !allChecked;
                        }}
                        onChange={toggleAll}
                        aria-label={allChecked ? 'Desmarcar todas as pendências da lista' : 'Marcar todas as pendências da lista'}
                      />
                    </th>
                  )}
                  <SortHeader column="local" sort={sort} onSort={sortBy} className="w-28" />
                  <SortHeader column="apto" sort={sort} onSort={sortBy} className="w-16" />
                  <SortHeader column="descricao" sort={sort} onSort={sortBy} className="min-w-72" />
                  <SortHeader column="tipo" sort={sort} onSort={sortBy} className="w-24" />
                  <SortHeader column="observacao" sort={sort} onSort={sortBy} className="w-24" />
                  <SortHeader column="correcao" sort={sort} onSort={sortBy} className="w-24" />
                  <SortHeader column="atr" sort={sort} onSort={sortBy} className="w-32" />
                  <SortHeader column="terceiro" sort={sort} onSort={sortBy} className="w-40" />
                  <SortHeader column="foto" sort={sort} onSort={sortBy} className="w-20" />
                  <SortHeader column="resolvido" sort={sort} onSort={sortBy} className="w-20" center />
                  <SortHeader column="fotoCorrecao" sort={sort} onSort={sortBy} className="w-20" />
                  <th scope="col" className="w-32 px-2 py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item, rowIndex) => {
                  const photos = photosOf(index, item.id);
                  const location = locationLabel(index, item);
                  const rowClass = `cursor-pointer border-t border-slate-100 align-middle ${busy === item.id ? 'bg-amber-50/60' : selection.includes(item.id) ? 'bg-primary-soft/40' : 'hover:bg-slate-50/60'}`;
                  const cells = (
                    <>
                      {selectable && (
                        <td className="px-2 py-1.5" onClick={stop}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={selection.includes(item.id)}
                            onChange={() => toggle(item.id)}
                            aria-label={`Marcar a pendência de ${location} para editar em lote`}
                          />
                        </td>
                      )}
                      <td className="px-2 py-1.5 font-semibold text-slate-700">{floorName(index, item)}</td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-700">{unitName(index, item) || <Dash />}</td>
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          className="line-clamp-2 text-left font-medium text-slate-800 hover:text-primary"
                          title={item.description}
                          aria-label={`${readOnly ? 'Ver' : 'Editar'} a pendência de ${location}: ${item.description}`}
                          aria-haspopup="dialog"
                          onClick={e => {
                            stop(e);
                            openItem(item);
                          }}
                        >
                          {item.description}
                        </button>
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{typeName(index, item) || <Dash />}</td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-600">{formatDate(item.observedOn)}</td>
                      <td className="px-2 py-1.5 tabular-nums text-slate-600">
                        {item.correctedOn ? formatDate(item.correctedOn) : <Dash />}
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{personName(index, item) || <Dash />}</td>
                      <td className="px-2 py-1.5 font-semibold text-slate-700">{item.contractor || <Dash />}</td>
                      <td className="px-2 py-1" onClick={stop}>
                        <TourSpot tourId="termin-foto" on={item.id === firstPhotoId}>
                          <Thumbs photos={photos.issue} label={`do problema em ${location}`} onOpen={at => openPhotos(item, 'issue', at)} />
                        </TourSpot>
                      </td>
                      <td
                        className="px-2 py-1.5 text-center"
                        title={item.resolutionNote ? `Como foi corrigido: ${item.resolutionNote}` : undefined}
                      >
                        <ResolvedChip resolved={item.status === 'resolved'} />
                        {item.resolutionNote && <span className="sr-only">. Como foi corrigido: {item.resolutionNote}</span>}
                      </td>
                      <td className="px-2 py-1" onClick={stop}>
                        <Thumbs
                          photos={photos.correction}
                          label={`da correção em ${location}`}
                          onOpen={at => openPhotos(item, 'correction', at)}
                        />
                      </td>
                      <td className="px-2 py-1" onClick={stop}>
                        {!readOnly && (
                          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                            {item.status === 'open' ? (
                              <TourSpot tourId="termin-resolver" on={item.id === firstOpenId}>
                                <button
                                  type="button"
                                  className="button-secondary px-2 py-1 text-xs"
                                  disabled={!!busy}
                                  aria-haspopup="dialog"
                                  aria-label={`Resolver a pendência de ${location}`}
                                  onClick={() => setDialog({ kind: 'resolve', itemId: item.id })}
                                >
                                  Resolver
                                </button>
                              </TourSpot>
                            ) : (
                              <TourSpot tourId="termin-reabrir" on={item.id === firstResolvedId}>
                                <button
                                  type="button"
                                  className="button-ghost px-2 py-1 text-xs"
                                  disabled={!!busy}
                                  aria-label={`Reabrir a pendência de ${location}`}
                                  onClick={() => reopen(item)}
                                >
                                  Reabrir
                                </button>
                              </TourSpot>
                            )}
                            <TourSpot tourId="termin-excluir" on={rowIndex === 0}>
                              <button
                                type="button"
                                onClick={() => remove(item)}
                                disabled={!!busy}
                                aria-label={`Excluir a pendência de ${location}`}
                                title="Excluir pendência"
                                className="rounded px-1.5 py-1 text-slate-300 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                              >
                                ✕
                              </button>
                            </TourSpot>
                          </div>
                        )}
                      </td>
                    </>
                  );
                  // O tour destaca a primeira linha: o valor de `data-tour` é único na página.
                  return rowIndex === 0 ? (
                    <tr key={item.id} data-tour="termin-linha" onClick={() => openItem(item)} className={rowClass}>
                      {cells}
                    </tr>
                  ) : (
                    <tr key={item.id} onClick={() => openItem(item)} className={rowClass}>
                      {cells}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {emptyState && <div className="border-t border-slate-100 p-4">{emptyState}</div>}
          </div>

          {/* No celular não há cabeçalho de coluna para clicar: a classificação vira um select. */}
          {data.items.length > 0 && (
            <div className="mb-3 flex items-end gap-2 md:hidden" data-tour="termin-classificar-celular">
              <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
                Classificar por
                <select
                  className="field mt-1 py-1.5"
                  value={sort?.column ?? ''}
                  onChange={e => {
                    const column = e.target.value;
                    setSort(current => (isSortColumn(column) ? { column, dir: current?.dir ?? 'asc' } : undefined));
                  }}
                >
                  <option value="">Ordem padrão</option>
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

          {/* No celular, cada pendência é um cartão: a tabela de onze colunas só serviria para rolar de lado. */}
          <div className="space-y-3 md:hidden" role="region" aria-label="Lista de pendências">
            {rows.map((item, rowIndex) => {
              const photos = photosOf(index, item.id);
              const location = locationLabel(index, item);
              const resolved = item.status === 'resolved';
              const details = [typeName(index, item), item.contractor, `obs. ${formatDate(item.observedOn)}`].filter(Boolean).join(' · ');
              const card = (
                <article
                  aria-label={`${location}: ${item.description}`}
                  className={`rounded-xl border p-3 shadow-sm ${busy === item.id ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex gap-3">
                    <CardThumb
                      photo={photos.issue[0]}
                      more={photos.issue.length + photos.correction.length - 1}
                      label={`Ver as fotos de ${location}`}
                      onOpen={() => openPhotos(item, 'issue', 0)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        {selectable ? (
                          <label className="flex min-h-6 items-center gap-2 text-xs font-bold text-slate-500">
                            <input
                              type="checkbox"
                              className="h-5 w-5 accent-primary"
                              checked={selection.includes(item.id)}
                              onChange={() => toggle(item.id)}
                              aria-label={`Marcar a pendência de ${location} para editar em lote`}
                            />
                            {location}
                          </label>
                        ) : (
                          <p className="text-xs font-bold text-slate-500">{location}</p>
                        )}
                        <ResolvedChip resolved={resolved} />
                      </div>
                      <p className="mt-0.5 line-clamp-3 text-sm font-semibold text-slate-900">{item.description}</p>
                      <p className="mt-1 text-xs text-slate-500">{details}</p>
                      {resolved && item.correctedOn && (
                        <p className="mt-0.5 text-xs font-semibold text-success">Corrigida em {formatDate(item.correctedOn)}</p>
                      )}
                      {resolved && item.resolutionNote && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600" title={item.resolutionNote}>
                          Correção: {item.resolutionNote}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    {!readOnly && !resolved && (
                      <button
                        type="button"
                        className="button flex-1"
                        disabled={!!busy}
                        aria-haspopup="dialog"
                        aria-label={`Resolver a pendência de ${location}`}
                        onClick={() => setDialog({ kind: 'resolve', itemId: item.id })}
                      >
                        Resolver
                      </button>
                    )}
                    {!readOnly && resolved && (
                      <button
                        type="button"
                        className="button-ghost flex-1"
                        disabled={!!busy}
                        aria-label={`Reabrir a pendência de ${location}`}
                        onClick={() => reopen(item)}
                      >
                        Reabrir
                      </button>
                    )}
                    <button
                      type="button"
                      className="button-ghost flex-1"
                      aria-haspopup="dialog"
                      aria-label={`${readOnly ? 'Ver' : 'Editar'} a pendência de ${location}`}
                      onClick={() => openItem(item)}
                    >
                      {readOnly ? 'Ver' : 'Editar'}
                    </button>
                  </div>
                </article>
              );
              return (
                <TourSpot key={item.id} tourId="termin-cartao" on={rowIndex === 0} className="block">
                  {card}
                </TourSpot>
              );
            })}
            {emptyState && <div className="rounded-xl border border-slate-200 bg-white p-4">{emptyState}</div>}
          </div>
        </div>
      </section>

      {dialog?.kind === 'new' && (
        <ItemDialog workId={workId} data={data} companies={companies} today={today} execute={execute} onClose={closeDialog} />
      )}
      {dialog?.kind === 'edit' && editing && (
        <ItemDialog
          workId={workId}
          data={data}
          companies={companies}
          today={today}
          item={editing}
          readOnly={readOnly}
          execute={execute}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'bulk' && !readOnly && selection.length > 0 && (
        <BulkEditDialog
          workId={workId}
          itemIds={selection}
          data={data}
          companies={companies}
          execute={execute}
          onClose={closeDialog}
          onDone={() => setChecked([])}
        />
      )}
      {dialog?.kind === 'resolve' && editing && !readOnly && (
        <ResolveDialog workId={workId} item={editing} data={data} today={today} execute={execute} onClose={closeDialog} />
      )}
      {viewer && (
        <PhotoViewer photos={refreshPhotos(viewer.photos, data.photos)} startIndex={viewer.start} onClose={() => setViewer(undefined)} />
      )}
      {printing && (
        <TerminalityPrintDialog
          workId={workId}
          filters={filters}
          sort={sort}
          items={rows}
          index={index}
          filtered={narrowed}
          onClose={() => setPrinting(false)}
        />
      )}
    </>
  );
}

const Dash = () => <span className="text-slate-300">—</span>;

/** Alvo do tour "Como usar" num elemento que se repete (linha, cartão, rosca): só a ocorrência escolhida
 * leva a marca, para o `data-tour` ficar único na página. Sem a marca, o filho entra sem invólucro. */
function TourSpot({
  tourId,
  on,
  className = 'flex w-fit',
  children,
}: {
  tourId: string;
  on: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!on) return <>{children}</>;
  return (
    <div data-tour={tourId} className={className}>
      {children}
    </div>
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
  column: TerminalitySortColumn;
  sort?: TerminalitySort;
  onSort: (column: TerminalitySortColumn) => void;
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

function ResolvedChip({ resolved }: { resolved: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${resolved ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}
    >
      {resolved ? 'SIM' : 'NÃO'}
      <span className="sr-only">{resolved ? ', resolvida' : ', aberta'}</span>
    </span>
  );
}

/** Miniatura da célula: a primeira foto e, havendo mais, um "+N". O clique abre o visualizador. */
function Thumbs({ photos, label, onOpen }: { photos: TerminalityPhoto[]; label: string; onOpen: (at: number) => void }) {
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

function CardThumb({ photo, more, label, onOpen }: { photo?: TerminalityPhoto; more: number; label: string; onOpen: () => void }) {
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

function ThumbImage({ photo }: { photo: TerminalityPhoto }) {
  const src = photo.thumbUrl ?? photo.url;
  if (!src) return <Camera size={16} aria-hidden className="m-auto text-slate-400" />;
  // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, que expira: não passa pelo otimizador.
  return <img src={src} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />;
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="min-w-0 text-xs font-semibold text-slate-600">
      {label}
      <select className="field mt-1 py-1.5" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Todos</option>
        {children}
      </select>
    </label>
  );
}

/** Quebra das abertas por uma dimensão, com barra proporcional. Clicar filtra a lista; o item
 * escolhido fica marcado e clicar nele de novo desfaz. */
/** Rosca com a legenda ao lado (cor, nome, quantidade e %). A legenda é a leitura de verdade e também o
 * filtro: clicar num item filtra a lista por ele, e clicar de novo desfaz. "Outros" não filtra. */
function DonutPanel({
  title,
  plural,
  total,
  slices,
  markLegend,
  selected,
  onPick,
}: {
  title: string;
  plural: string;
  total: number;
  slices: DonutSlice[];
  /** A legenda desta rosca é o alvo do tour (a primeira rosca com pendências). */
  markLegend: boolean;
  selected: (slice: DonutSlice) => boolean;
  onPick: (slice: DonutSlice) => void;
}) {
  return (
    <section className="panel p-4" aria-label={title}>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {total === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nenhuma pendência nesta seleção.</p>
      ) : (
        <div className="mt-2 flex items-center gap-4">
          <DonutRing slices={slices} total={total} title={title} className="h-28 w-28 shrink-0" />
          <TourSpot tourId="termin-rosca-legenda" on={markLegend} className="min-w-0 flex-1">
            <ul className="min-w-0 flex-1 space-y-0.5">
              {slices.map((slice, i) => {
                const active = selected(slice);
                const label = slice.others ? `Outros (${slice.others} ${plural})` : slice.label;
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
                        title={active ? 'Clique para tirar o filtro' : `Filtrar a lista por ${label}`}
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
          </TourSpot>
        </div>
      )}
    </section>
  );
}

function BreakdownPanel({
  title,
  items,
  selected,
  onPick,
}: {
  title: string;
  items: Breakdown[];
  selected: string;
  onPick: (key: string, same: boolean) => void;
}) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...items.map(i => i.count));
  // Comparação sem acento e sem caixa: o empreiteiro pode ter sido escolhido com outra grafia na lista.
  const isSelected = (key: string) => !!selected && textKey(key) === textKey(selected);
  const chosen = items.findIndex(i => isSelected(i.key));
  // O escolhido continua à vista mesmo fora dos primeiros.
  const shown = all ? items : items.filter((item, at) => at < TOP || at === chosen);
  return (
    <section className="panel p-4" aria-label={title}>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">Nenhuma pendência aberta.</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {shown.map(item => {
            const active = isSelected(item.key);
            return (
              <li key={item.key}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onPick(item.key, active)}
                  className={`grid w-full grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ${active ? 'bg-primary-soft font-bold text-primary-ink ring-1 ring-primary-ring' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className="truncate" title={item.label}>
                    {item.label}
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <span className="block h-full rounded-full bg-warning" style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }} />
                  </span>
                  <span className="text-right font-semibold tabular-nums">{item.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > TOP && (
        <button type="button" className="text-link mt-2 text-xs" onClick={() => setAll(v => !v)}>
          {all ? 'Mostrar menos' : `Ver todos (${items.length})`}
        </button>
      )}
    </section>
  );
}

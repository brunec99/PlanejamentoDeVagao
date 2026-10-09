'use client';
import Link from 'next/link';
import { useState, type MouseEvent, type ReactNode } from 'react';
import { Camera, ListFilter, Plus, RefreshCw, Search } from 'lucide-react';
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
import { PhotoViewer } from './photo-viewer';
import { refreshPhotos } from './photo-refresh';
import {
  DEFAULT_FILTERS,
  NONE,
  filterItems,
  floorName,
  hasActiveFilters,
  indexTerminality,
  locationLabel,
  percentLabel,
  personName,
  photosOf,
  summarize,
  typeName,
  unitName,
  unitOptions,
  visibleItems,
  type Breakdown,
  type TerminalityFilters,
  type TerminalitySituation,
} from './terminality-view';

type DialogState = { kind: 'new' } | { kind: 'edit'; itemId: string } | { kind: 'resolve'; itemId: string };
/** Quantas linhas cada quebra (por empreiteiro, por pavimento) mostra antes do "ver todos". */
const TOP = 6;
const SITUATIONS: { value: TerminalitySituation; label: string }[] = [
  { value: 'open', label: 'Abertas' },
  { value: 'resolved', label: 'Resolvidas' },
  { value: 'all', label: 'Todas' },
];
const stop = (event: MouseEvent) => event.stopPropagation();

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
        <button type="button" className="button" onClick={() => setDialog({ kind: 'new' })}>
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
          <Link className="text-link" href={workPath(workId, 'configuracoes')}>
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
  const rows = visibleItems(data, index, filters);
  // Os cartões contam a seleção dos filtros em todas as situações: abertas + resolvidas = total.
  const scope = summarize(filterItems(data.items, filters, ['situation']), index);
  // Cada quebra ignora o próprio filtro, para a lista continuar mostrando as alternativas.
  // O filtro guarda a grafia de onde veio (quadro ou lista); o select precisa da grafia da lista.
  const contractorValue =
    filters.contractor === NONE ? NONE : (companies.find(c => textKey(c) === textKey(filters.contractor)) ?? filters.contractor);
  const byContractor = summarize(filterItems(data.items, filters, ['situation', 'contractor']), index).openByContractor;
  const byFloor = summarize(filterItems(data.items, filters, ['situation', 'floorId', 'unitId']), index).openByFloor;
  const narrowed = hasActiveFilters({ ...filters, situation: DEFAULT_FILTERS.situation });
  const activeCount = (['floorId', 'unitId', 'typeId', 'contractor', 'atrPersonId', 'search'] as const).filter(k => filters[k]).length;

  const patch = (next: Partial<TerminalityFilters>) => setFilters(current => ({ ...current, ...next }));
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

  const editing = dialog && dialog.kind !== 'new' ? data.items.find(i => i.id === dialog.itemId) : undefined;
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

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Abertas"
          value={scope.open}
          tone={scope.open > 0 ? 'warning' : 'default'}
          hint={narrowed ? 'na seleção dos filtros' : undefined}
        />
        <StatCard label="Resolvidas" value={scope.resolved} tone={scope.resolved > 0 ? 'success' : 'default'} />
        <StatCard label="% resolvida" value={percentLabel(scope)} hint={scope.total ? `de ${scope.total} pendências` : 'sem pendências'} />
      </div>

      {(byContractor.length > 0 || byFloor.length > 0) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
          <HelpNote title="Como usar a lista" label="Como usar a lista" compact>
            <p>A lista abre nas pendências abertas, na ordem da obra: pavimento, apartamento e data de observação.</p>
            <p>
              Clique numa linha para ver ou editar a pendência e as fotos. Clique numa miniatura para ampliar a foto. Clicar num empreiteiro
              ou pavimento nos quadros acima filtra a lista por ele.
            </p>
          </HelpNote>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
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
              aria-controls="terminalidade-filtros"
              onClick={() => setShowFilters(open => !open)}
            >
              <ListFilter size={14} aria-hidden />
              Filtros{activeCount > 0 ? ` (${activeCount})` : ''}
            </button>
          </div>
        </div>

        <div className="relative mt-3">
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

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>
            Mostrando {rows.length} de {data.items.length} {data.items.length === 1 ? 'pendência' : 'pendências'}.
          </span>
          {hasActiveFilters(filters) && (
            <button type="button" className="text-link" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Limpar filtros
            </button>
          )}
        </div>

        <div className="mt-3">
          <div
            className="panel hidden overflow-x-auto custom-scrollbar md:block"
            role="region"
            aria-label="Lista de pendências"
            tabIndex={0}
          >
            <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-200">
                  <th scope="col" className="w-28 px-2 py-2">
                    Local
                  </th>
                  <th scope="col" className="w-16 px-2 py-2">
                    Apto
                  </th>
                  <th scope="col" className="min-w-72 px-2 py-2">
                    Descrição da pendência
                  </th>
                  <th scope="col" className="w-24 px-2 py-2">
                    Tipo
                  </th>
                  <th scope="col" className="w-24 px-2 py-2">
                    Data observação
                  </th>
                  <th scope="col" className="w-24 px-2 py-2">
                    Data correção
                  </th>
                  <th scope="col" className="w-32 px-2 py-2">
                    Responsável ATR
                  </th>
                  <th scope="col" className="w-40 px-2 py-2">
                    Responsável terceiro
                  </th>
                  <th scope="col" className="w-20 px-2 py-2">
                    Foto
                  </th>
                  <th scope="col" className="w-20 px-2 py-2 text-center">
                    Resolvido?
                  </th>
                  <th scope="col" className="w-20 px-2 py-2">
                    Foto da correção
                  </th>
                  <th scope="col" className="w-32 px-2 py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(item => {
                  const photos = photosOf(index, item.id);
                  const location = locationLabel(index, item);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => openItem(item)}
                      className={`cursor-pointer border-t border-slate-100 align-middle ${busy === item.id ? 'bg-amber-50/60' : 'hover:bg-slate-50/60'}`}
                    >
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
                        <Thumbs photos={photos.issue} label={`do problema em ${location}`} onOpen={at => openPhotos(item, 'issue', at)} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <ResolvedChip resolved={item.status === 'resolved'} />
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
                            ) : (
                              <button
                                type="button"
                                className="button-ghost px-2 py-1 text-xs"
                                disabled={!!busy}
                                aria-label={`Reabrir a pendência de ${location}`}
                                onClick={() => reopen(item)}
                              >
                                Reabrir
                              </button>
                            )}
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
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {emptyState && <div className="border-t border-slate-100 p-4">{emptyState}</div>}
          </div>

          {/* No celular, cada pendência é um cartão: a tabela de onze colunas só serviria para rolar de lado. */}
          <div className="space-y-3 md:hidden" role="region" aria-label="Lista de pendências">
            {rows.map(item => {
              const photos = photosOf(index, item.id);
              const location = locationLabel(index, item);
              const resolved = item.status === 'resolved';
              const details = [typeName(index, item), item.contractor, `obs. ${formatDate(item.observedOn)}`].filter(Boolean).join(' · ');
              return (
                <article
                  key={item.id}
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
                        <p className="text-xs font-bold text-slate-500">{location}</p>
                        <ResolvedChip resolved={resolved} />
                      </div>
                      <p className="mt-0.5 line-clamp-3 text-sm font-semibold text-slate-900">{item.description}</p>
                      <p className="mt-1 text-xs text-slate-500">{details}</p>
                      {resolved && item.correctedOn && (
                        <p className="mt-0.5 text-xs font-semibold text-success">Corrigida em {formatDate(item.correctedOn)}</p>
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
      {dialog?.kind === 'resolve' && editing && !readOnly && (
        <ResolveDialog workId={workId} item={editing} data={data} today={today} execute={execute} onClose={closeDialog} />
      )}
      {viewer && (
        <PhotoViewer photos={refreshPhotos(viewer.photos, data.photos)} startIndex={viewer.start} onClose={() => setViewer(undefined)} />
      )}
    </>
  );
}

const Dash = () => <span className="text-slate-300">—</span>;

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

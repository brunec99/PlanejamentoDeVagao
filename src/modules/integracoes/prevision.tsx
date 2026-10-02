'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, Flag, Link2, PackageOpen, RefreshCw, Search } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing } from '@/modules/planejamento/ui';
import { HelpNote } from '@/modules/layout/help-note';
import { useToast } from '@/modules/layout/toast';
import { useConfirm } from '@/modules/layout/confirm';
import { formatDate, formatTimestamp, wagonLabel, wagonPath } from '@/shared/format';
import type { ImportedActivity } from '@/application/use-cases/commands';
import { sliceActivity } from '@/application/use-cases/slice-activity';

const MS = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS) + 1;
const tabClass = (active: boolean) =>
  `rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active ? 'bg-primary text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`;

export function PrevisionImport({ workId }: { workId: string }) {
  const c = usePlanning();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'pool' | 'milestones' | 'wagon'>('pool');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [pickedProjectId, setPickedProjectId] = useState('');
  const [rows, setRows] = useState<ImportedActivity[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [responsibleId, setResponsibleId] = useState('');
  const [search, setSearch] = useState('');
  const [wagonId, setWagonId] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // O resultado da regeneração é longo e por sequência: fica num aviso na tela, não no toast.
  const [regenDetail, setRegenDetail] = useState('');

  const loadCache = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prevision/schedule?workId=${encodeURIComponent(workId)}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Falha ao ler o cronograma salvo.');
      setRows(body.rows);
      setSyncedAt(body.syncedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o cronograma salvo.');
    } finally {
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    loadCache();
  }, [loadCache]);

  if (c.state !== 'ready') return <LoadState error={c.state === 'error'} />;
  const { data } = c.planning;
  const actor = data.users.find(u => u.id === c.actorId);
  const work = data.works.find(w => w.id === workId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;

  const sequences = data.sequences.filter(s => s.workId === workId);
  const wagons = data.wagons
    .filter(w => sequences.some(s => s.id === w.sequenceId))
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  // A API libera a integração por papel (planejador, gestor, administrador) e responde 403 ao
  // perfil de consulta; a tela segue a mesma regra para não oferecer botões que vão falhar.
  const canImport = actor.role !== 'viewer';
  const projectId = work.previsionProjectId ?? (pickedProjectId || undefined);

  // Uma atividade pode ter virado várias fatias (`id#1`, `id#2`...), então basta uma delas existir.
  const isImported = (row: ImportedActivity) =>
    data.activities.some(
      a =>
        a.previsionExternalId === `${projectId}:${row.externalId}` || a.previsionExternalId?.startsWith(`${projectId}:${row.externalId}#`),
    );
  const slicesFor = (row: ImportedActivity) => sliceActivity(row, wagons);

  const listProjects = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/prevision');
      const body = await res.json();
      // Em 403 a API explica o papel que falta; a mensagem dela é a que vale na tela.
      if (!res.ok) throw new Error(body.error ?? 'Falha na consulta.');
      setProjects(body.projects);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar o Prevision.');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    // A atualização apaga e recria a cauda ainda não liberada de cada sequência: é o único passo
    // destrutivo desta tela, por isso pede confirmação antes de tocar no Prevision.
    const ok = await confirm({
      title: 'Atualizar o cronograma do Prevision?',
      description:
        'Os vagões futuros ainda não liberados são apagados e recriados a partir do cronograma novo. Vagões já liberados não mudam; atividades com progresso ou critério preenchido nos vagões refeitos são removidas.',
      confirmLabel: 'Atualizar',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    setRegenDetail('');
    try {
      const res = await fetch(`/api/prevision/schedule?workId=${encodeURIComponent(workId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectId && !work.previsionProjectId ? { projectId } : {}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Falha ao atualizar.');
      await loadCache();
      await c.refresh();
      type RegenSummary = {
        sequenceName: string;
        aborted: boolean;
        reason?: string;
        removedWagons?: number;
        createdWagons?: number;
        placedActivities?: number;
        removedWithProgressOrCriteria?: number;
        skippedTooLong?: number;
        skippedProgress?: number;
      };
      const regen = (body.regeneration ?? []) as RegenSummary[];
      const regenText = regen
        .map(r =>
          r.aborted
            ? `${r.sequenceName}: não regenerada (${r.reason})`
            : `${r.sequenceName}: ${r.removedWagons} vagão(ões) refeito(s), ${r.createdWagons} vagão(ões) criado(s), ${r.placedActivities} atividades encaixadas${r.removedWithProgressOrCriteria ? ` · ⚠ ${r.removedWithProgressOrCriteria} com progresso/critério preenchido foram removidas` : ''}`,
        )
        .join(' | ');
      toast({
        title: `Cronograma atualizado: ${body.count} atividades salvas.`,
        description: body.skipped ? `${body.skipped} registros inválidos ignorados.` : undefined,
        tone: 'success',
      });
      if (regenText) setRegenDetail(`Vagões regenerados — ${regenText}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível atualizar.');
    } finally {
      setBusy(false);
    }
  };

  const addSliced = async (row: ImportedActivity) => {
    const slices = slicesFor(row);
    if (!slices.length) return;
    setBusy(true);
    setError('');
    try {
      for (const slice of slices) {
        await c.execute({ type: 'import_activities', wagonId: slice.wagonId, projectId: projectId!, responsibleId, rows: [slice.row] });
      }
      toast({
        title:
          slices.length === 1
            ? `"${row.name}" adicionada ao ${wagonLabel(wagons.find(w => w.id === slices[0].wagonId)!.number)}.`
            : `"${row.name}" dividida em ${slices.length} fatias (${slices.map(s => `${s.percent}%`).join(' · ')}).`,
        tone: 'success',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível adicionar.');
    } finally {
      setBusy(false);
    }
  };

  const importRows = async (targetWagonId: string, chosen: ImportedActivity[]) => {
    if (!chosen.length) return;
    setBusy(true);
    setError('');
    try {
      await c.execute({ type: 'import_activities', wagonId: targetWagonId, projectId: projectId!, responsibleId, rows: chosen });
      const wagon = wagons.find(w => w.id === targetWagonId)!;
      setSelected([]);
      toast({
        title: `${chosen.length} ${chosen.length === 1 ? 'atividade adicionada' : 'atividades adicionadas'} ao ${wagonLabel(wagon.number)}.`,
        tone: 'success',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível adicionar.');
    } finally {
      setBusy(false);
    }
  };

  const matches = (r: ImportedActivity) => `${r.name} ${r.location}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'));
  const pending = rows.filter(r => !isImported(r));
  const pool = pending.filter(matches);
  const placeable = pool.filter(r => slicesFor(r).length > 0);
  const orphan = pool.filter(r => slicesFor(r).length === 0);
  const importedCount = rows.length - pending.length;
  const wagon = wagons.find(w => w.id === wagonId);
  const wagonFits = wagon ? pool.filter(r => r.plannedStart >= wagon.plannedStart && r.plannedEnd <= wagon.plannedEnd) : [];

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            Apoio · {work.code} · {work.name}
          </p>
          <h1 className="page-title">Integrações</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm text-slate-500">Cronograma do Prevision e importação de atividades</p>
            <HelpNote compact title="Como funciona: integrações">
              <p>
                O cronograma fica salvo aqui; o Prevision só é consultado quando você pede “Atualizar do Prevision”. A atualização grava as
                atividades e refaz a cauda ainda não liberada de cada sequência — vagões já liberados nunca mudam.
              </p>
              <p>
                Cada atividade só entra num vagão cujo período a contenha inteira. A que atravessa mais de um vagão é dividida em fatias
                proporcionais aos dias de cada período, sempre somando 100%: é assim que toda atividade acaba dentro de algum vagão.
              </p>
              <p>
                O responsável local é obrigatório para adicionar atividades. A integração é liberada por papel: planejadores, gestores e
                administradores consultam o Prevision; o perfil de consulta vê o cronograma salvo, mas não dispara chamadas externas.
              </p>
            </HelpNote>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canImport && (
            <button data-tour="prevision-sync" className="button" disabled={busy || !projectId} onClick={sync}>
              <RefreshCw size={15} className={busy ? 'animate-spin' : ''} aria-hidden />
              Atualizar do Prevision
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="mb-4">
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        </div>
      )}
      {regenDetail && (
        <div className="mb-4">
          <Callout tone="info" role="status">
            {regenDetail}
          </Callout>
        </div>
      )}

      <div className="panel flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold text-slate-800">Cronograma salvo</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {work.previsionProjectId ? `Projeto ${work.previsionProjectId}` : 'Obra ainda não vinculada'}
            {rows.length > 0 && ` · ${rows.length} atividades · ${importedCount} em vagões · ${pending.length} fora`}
            {syncedAt && ` · atualizado em ${formatTimestamp(syncedAt)}`}
          </p>
        </div>
        <label data-tour="prevision-responsible" className="block text-xs font-semibold text-slate-600">
          <span className="mb-1.5 block">Responsável local</span>
          <select className="field w-56" value={responsibleId} onChange={e => setResponsibleId(e.target.value)}>
            <option value="">Selecione</option>
            {data.users
              .filter(u => u.workIds.includes(workId) && u.role !== 'viewer')
              .map(u => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      {!work.previsionProjectId && (
        <div className="panel mt-4 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Link2 size={15} className="text-primary" aria-hidden />
            Vincular ao projeto do Prevision
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {canImport
              ? 'Escolha o projeto e use “Atualizar do Prevision”. O vínculo fica gravado na primeira atividade adicionada a um vagão.'
              : 'Vincular a obra a um projeto do Prevision é tarefa de planejadores e gestores.'}
          </p>
          {canImport && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="button-ghost" disabled={busy} onClick={listProjects}>
                <RefreshCw size={15} className={busy ? 'animate-spin' : ''} aria-hidden />
                Listar projetos
              </button>
              {projects.length > 0 && (
                <select
                  className="field w-auto min-w-64"
                  aria-label="Projeto do Prevision"
                  value={pickedProjectId}
                  onChange={e => setPickedProjectId(e.target.value)}
                >
                  <option value="">Selecione o projeto</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="mt-4">
          <LoadState />
        </div>
      ) : rows.length === 0 ? (
        <div className="panel mt-4 p-6">
          <Empty>Nenhum cronograma salvo ainda. Use &quot;Atualizar do Prevision&quot; para trazer as atividades.</Empty>
        </div>
      ) : (
        <>
          <div data-tour="prevision-tabs" className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={tab === 'pool'} onClick={() => setTab('pool')} className={tabClass(tab === 'pool')}>
              Disponíveis para vagão ({placeable.length})
            </button>
            <button
              type="button"
              aria-pressed={tab === 'milestones'}
              onClick={() => setTab('milestones')}
              className={tabClass(tab === 'milestones')}
            >
              Fora do período dos vagões ({orphan.length})
            </button>
            <button type="button" aria-pressed={tab === 'wagon'} onClick={() => setTab('wagon')} className={tabClass(tab === 'wagon')}>
              Escolher por vagão
            </button>
            <div className="relative ml-auto">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                className="field w-64 pl-8"
                placeholder="Buscar atividade ou local"
                aria-label="Buscar atividade ou local"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {tab === 'pool' ? (
            <section data-tour="prevision-pool" className="panel mt-4 overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <PackageOpen size={15} className="text-primary" aria-hidden />
                  Disponíveis para vagão
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Atividades que ainda não estão em vagão. As que atravessam vários takts entram fatiadas em percentual.
                </p>
              </div>
              {placeable.length === 0 ? (
                <div className="p-5">
                  <Empty>Todas as atividades do cronograma já estão em vagões.</Empty>
                </div>
              ) : (
                <div className="max-h-[560px] overflow-auto custom-scrollbar">
                  <table className="data-table min-w-[1000px]">
                    <thead className="sticky top-0">
                      <tr>
                        <th>Atividade / local</th>
                        <th>Previsão</th>
                        <th>Linha de base</th>
                        <th>Duração</th>
                        <th>Distribuição nos vagões</th>
                      </tr>
                    </thead>
                    <tbody>
                      {placeable.map(row => {
                        const slices = slicesFor(row);
                        return (
                          <tr key={row.externalId}>
                            <th scope="row">
                              {row.name}
                              <span className="mt-0.5 block text-xs font-normal text-slate-500">{row.location}</span>
                            </th>
                            <td className="whitespace-nowrap">
                              {formatDate(row.plannedStart)}
                              <span className="block text-xs text-slate-400">a {formatDate(row.plannedEnd)}</span>
                            </td>
                            <td className="whitespace-nowrap text-xs">
                              {row.baselineStart && row.baselineEnd ? (
                                <>
                                  {formatDate(row.baselineStart)}
                                  <span className="block text-slate-400">a {formatDate(row.baselineEnd)}</span>
                                </>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap tabular-nums">{days(row.plannedStart, row.plannedEnd)} dias</td>
                            <td>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="flex flex-wrap gap-1">
                                  {slices.map(slice => {
                                    const w = wagons.find(x => x.id === slice.wagonId)!;
                                    return (
                                      <span key={slice.wagonId} className="badge-muted px-2 py-0.5">
                                        {wagonLabel(w.number)}
                                        {slice.parts > 1 && ` · parte ${slice.part}/${slice.parts}`} · {slice.percent}%
                                      </span>
                                    );
                                  })}
                                </span>
                                {canImport && (
                                  <button
                                    className="button px-3 py-1.5 text-xs"
                                    disabled={busy || !responsibleId}
                                    onClick={() => addSliced(row)}
                                  >
                                    {slices.length === 1 ? 'Adicionar' : `Adicionar ${slices.length} fatias`}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!responsibleId && placeable.length > 0 && canImport && (
                <div className="border-t border-slate-100 p-4">
                  <Callout tone="warning">Selecione o responsável local acima para conseguir adicionar atividades.</Callout>
                </div>
              )}
            </section>
          ) : tab === 'milestones' ? (
            <section className="panel mt-4 overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                  <Flag size={15} className="text-warning" aria-hidden />
                  Fora do período dos vagões
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Atividades que não cruzam nenhum vagão existente — normalmente por serem anteriores ao início do planejamento.
                </p>
              </div>
              {orphan.length === 0 ? (
                <div className="p-5">
                  <Empty>Nenhuma atividade fora do alcance dos vagões.</Empty>
                </div>
              ) : (
                <div className="max-h-[560px] overflow-auto custom-scrollbar">
                  <table className="data-table min-w-[900px]">
                    <thead className="sticky top-0">
                      <tr>
                        <th>Atividade / local</th>
                        <th>Previsão</th>
                        <th>Linha de base</th>
                        <th>Duração</th>
                        <th>Progresso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orphan.map(row => {
                        const drift = row.baselineEnd && row.baselineEnd !== row.plannedEnd ? days(row.baselineEnd, row.plannedEnd) - 1 : 0;
                        return (
                          <tr key={row.externalId}>
                            <th scope="row">
                              {row.name}
                              <span className="mt-0.5 block text-xs font-normal text-slate-500">{row.location}</span>
                            </th>
                            <td className="whitespace-nowrap">
                              {formatDate(row.plannedStart)}
                              <span className="block text-xs text-slate-400">a {formatDate(row.plannedEnd)}</span>
                            </td>
                            <td className="whitespace-nowrap text-xs">
                              {row.baselineStart && row.baselineEnd ? (
                                <>
                                  {formatDate(row.baselineStart)}
                                  <span className="block text-slate-400">a {formatDate(row.baselineEnd)}</span>
                                </>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                              {drift !== 0 && (
                                <span className={`mt-0.5 block font-semibold ${drift > 0 ? 'text-danger' : 'text-success'}`}>
                                  {drift > 0 ? `+${drift}` : drift} dias
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap tabular-nums">{days(row.plannedStart, row.plannedEnd)} dias</td>
                            <td className="tabular-nums">{row.progress}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <section className="panel mt-4 overflow-hidden">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Escolher o vagão e marcar várias atividades</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Só aparecem atividades que cabem inteiras no período do vagão.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="field w-auto min-w-72"
                    aria-label="Vagão de destino"
                    value={wagonId}
                    onChange={e => {
                      setWagonId(e.target.value);
                      setSelected([]);
                    }}
                  >
                    <option value="">Selecione o vagão</option>
                    {wagons.map(w => (
                      <option key={w.id} value={w.id}>
                        {wagonLabel(w.number)} · {formatDate(w.plannedStart)} a {formatDate(w.plannedEnd)} ·{' '}
                        {data.activities.filter(a => a.wagonId === w.id).length} atividades
                      </option>
                    ))}
                  </select>
                  {wagon && canImport && (
                    <button className="button-ghost" onClick={() => setSelected(wagonFits.map(r => r.externalId))}>
                      Marcar todas ({wagonFits.length})
                    </button>
                  )}
                </div>
              </div>
              {!wagon ? (
                <div className="p-5">
                  <Empty>Selecione um vagão para ver as atividades que cabem nele.</Empty>
                </div>
              ) : wagonFits.length === 0 ? (
                <div className="p-5">
                  <Empty>Nenhuma atividade pendente cabe no período deste vagão.</Empty>
                </div>
              ) : (
                <>
                  <div className="max-h-[480px] overflow-auto custom-scrollbar">
                    <table className="data-table min-w-[850px]">
                      <thead className="sticky top-0">
                        <tr>
                          <th className="w-10"></th>
                          <th>Atividade / local</th>
                          <th>Previsão</th>
                          <th>Linha de base</th>
                          <th>Progresso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wagonFits.map(row => (
                          <tr key={row.externalId}>
                            <td>
                              <input
                                type="checkbox"
                                className="accent-primary"
                                aria-label={`Selecionar ${row.name}`}
                                checked={selected.includes(row.externalId)}
                                disabled={busy || !canImport}
                                onChange={e =>
                                  setSelected(ids =>
                                    e.target.checked ? [...ids, row.externalId] : ids.filter(id => id !== row.externalId),
                                  )
                                }
                              />
                            </td>
                            <th scope="row">
                              {row.name}
                              <span className="mt-0.5 block text-xs font-normal text-slate-500">{row.location}</span>
                            </th>
                            <td className="whitespace-nowrap">
                              {formatDate(row.plannedStart)}
                              <span className="block text-xs text-slate-400">a {formatDate(row.plannedEnd)}</span>
                            </td>
                            <td className="whitespace-nowrap text-xs">
                              {row.baselineStart && row.baselineEnd ? (
                                <>
                                  {formatDate(row.baselineStart)}
                                  <span className="block text-slate-400">a {formatDate(row.baselineEnd)}</span>
                                </>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="tabular-nums">{row.progress}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {canImport && (
                    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 p-5">
                      <button
                        className="button"
                        disabled={busy || selected.length === 0 || !responsibleId}
                        onClick={() =>
                          importRows(
                            wagon.id,
                            wagonFits.filter(r => selected.includes(r.externalId)),
                          )
                        }
                      >
                        <Download size={15} />
                        Adicionar {selected.length > 0 ? `${selected.length} atividades` : 'selecionadas'}
                      </button>
                      <Link className="text-link text-sm" href={wagonPath(workId, wagon.id)}>
                        Abrir {wagonLabel(wagon.number)} →
                      </Link>
                      {!responsibleId && <span className="text-xs text-warning">Selecione o responsável local acima.</span>}
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {importedCount > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-success">
              <CheckCircle2 size={13} aria-hidden />
              {importedCount} atividades já estão distribuídas em vagões.
            </p>
          )}
        </>
      )}
    </>
  );
}

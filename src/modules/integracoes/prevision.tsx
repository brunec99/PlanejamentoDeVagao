'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, Download, Link2, RefreshCw, Search } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing } from '@/modules/planejamento/ui';
import { formatDate, planningPath, wagonLabel, wagonPath } from '@/shared/format';
import type { ImportedActivity } from '@/application/use-cases/commands';

type Fit = 'imported' | 'fits' | 'outside';

export function PrevisionImport({ workId }: { workId: string }) {
  const c = usePlanning();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<ImportedActivity[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [wagonId, setWagonId] = useState('');
  const [responsibleId, setResponsibleId] = useState('');
  const [search, setSearch] = useState('');
  const [onlyEligible, setOnlyEligible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pickedProjectId, setPickedProjectId] = useState('');

  if (c.state !== 'ready') return <LoadState error={c.state === 'error'} />;
  const { data } = c.planning;
  const actor = data.users.find(u => u.id === c.actorId);
  const work = data.works.find(w => w.id === workId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;

  const sequences = data.sequences.filter(s => s.workId === workId);
  const wagons = data.wagons.filter(w => sequences.some(s => s.id === w.sequenceId)).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
  const wagon = wagons.find(w => w.id === wagonId);
  const canImport = actor.role === 'planner' || actor.role === 'manager';
  // O vínculo definitivo obra↔projeto é gravado pelo próprio comando de importação;
  // até lá basta escolher o projeto para conseguir consultar as atividades.
  const projectId = work.previsionProjectId ?? (pickedProjectId || undefined);

  const classify = (row: ImportedActivity): Fit => {
    if (data.activities.some(a => a.previsionExternalId === `${projectId}:${row.externalId}`)) return 'imported';
    if (wagon && row.plannedStart >= wagon.plannedStart && row.plannedEnd <= wagon.plannedEnd) return 'fits';
    return 'outside';
  };

  async function query(kind: 'projects' | 'activities') {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(kind === 'projects' ? '/api/prevision' : `/api/prevision?projectId=${encodeURIComponent(projectId!)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Falha na consulta.');
      if (kind === 'projects') { setProjects(result.projects); }
      else { setRows(result.rows); setSkipped(result.skipped); setLoaded(true); setSelected([]); setMessage(`${result.rows.length} atividades carregadas do Prevision.`); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível consultar o Prevision.'); }
    finally { setBusy(false); }
  }

  const visible = rows
    .filter(r => `${r.name} ${r.location}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
    .filter(r => !onlyEligible || classify(r) === 'fits');
  const eligibleCount = rows.filter(r => classify(r) === 'fits').length;
  const importedCount = rows.filter(r => classify(r) === 'imported').length;

  return <>
    <Link className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800" href={planningPath(workId)}><ArrowLeft size={15} />{work.name}</Link>
    <p className="eyebrow mt-5">Prevision</p>
    <h1 className="page-title">Importar atividades</h1>
    <p className="mt-1 max-w-3xl text-sm text-slate-500">Escolha o vagão de destino e selecione as atividades que acontecem dentro daquele período. A importação não altera nada no Prevision.</p>

    {!projectId ? (
      <div className="panel mt-6 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Link2 size={15} className="text-blue-600" />Escolher o projeto no Prevision</h2>
        <p className="mt-1 text-sm text-slate-500">Esta obra ainda não está vinculada. O vínculo fica gravado na primeira importação e não pode ser trocado depois.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="button-ghost" disabled={busy} onClick={() => query('projects')}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} />Listar projetos</button>
          {projects.length > 0 && <select className="field w-auto min-w-64" value={pickedProjectId} onChange={e => { setPickedProjectId(e.target.value); setRows([]); setLoaded(false); }}>
            <option value="">Selecione o projeto</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>}
        </div>
      </div>
    ) : (
      <>
        <ol className="mt-6 space-y-4">
          <li className="panel p-5">
            <p className="eyebrow">Passo 1</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Carregar atividades do Prevision</h2>
                <p className="mt-0.5 text-xs text-slate-500">Projeto vinculado: <span className="font-semibold text-slate-700">{projectId}</span>{loaded && ` · ${rows.length} atividades · ${importedCount} já importadas`}</p>
              </div>
              <button className="button" disabled={busy} onClick={() => query('activities')}>
                <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />{loaded ? 'Recarregar' : 'Carregar atividades'}
              </button>
            </div>
          </li>

          <li className={`panel p-5 ${loaded ? '' : 'opacity-50'}`}>
            <p className="eyebrow">Passo 2</p>
            <h2 className="mt-2 text-sm font-bold text-slate-800">Vagão de destino</h2>
            {wagons.length === 0
              ? <div className="mt-2"><Empty>Esta obra ainda não tem vagões. Crie um vagão no planejamento antes de importar.</Empty></div>
              : <div className="mt-3 flex flex-wrap items-center gap-3">
                  <select className="field w-auto min-w-80" value={wagonId} disabled={!loaded} onChange={e => { setWagonId(e.target.value); setSelected([]); }}>
                    <option value="">Selecione o vagão</option>
                    {wagons.map(w => {
                      const count = data.activities.filter(a => a.wagonId === w.id).length;
                      return <option key={w.id} value={w.id}>{wagonLabel(w.number)} · {formatDate(w.plannedStart)} a {formatDate(w.plannedEnd)} · {count} atividades</option>;
                    })}
                  </select>
                  {wagon && <span className="badge-muted">{eligibleCount} atividades cabem neste período</span>}
                </div>}
          </li>

          <li className={`panel p-5 ${wagon && loaded ? '' : 'opacity-50'}`}>
            <p className="eyebrow">Passo 3</p>
            <h2 className="mt-2 text-sm font-bold text-slate-800">Responsável local</h2>
            <select className="field mt-3 w-auto min-w-64" value={responsibleId} disabled={!wagon} onChange={e => setResponsibleId(e.target.value)}>
              <option value="">Selecione o responsável</option>
              {data.users.filter(u => u.workIds.includes(workId) && u.role !== 'viewer').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </li>
        </ol>

        {loaded && wagon && (
          <section className="panel mt-4 overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <p className="eyebrow">Passo 4</p>
                <h2 className="mt-2 text-sm font-bold text-slate-800">Selecionar atividades</h2>
                <p className="mt-0.5 text-xs text-slate-500">Período do {wagonLabel(wagon.number)}: {formatDate(wagon.plannedStart)} a {formatDate(wagon.plannedEnd)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="field w-56 pl-8" placeholder="Buscar atividade ou local" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                  <input type="checkbox" className="accent-blue-700" checked={onlyEligible} onChange={e => setOnlyEligible(e.target.checked)} />
                  Só as que cabem
                </label>
                {canImport && <button className="button-ghost" onClick={() => setSelected(visible.filter(r => classify(r) === 'fits').map(r => r.externalId))}>Selecionar todas</button>}
              </div>
            </div>
            {visible.length === 0
              ? <div className="p-5"><Empty>Nenhuma atividade encontrada com esses filtros.</Empty></div>
              : <div className="max-h-[480px] overflow-auto custom-scrollbar">
                  <table className="data-table">
                    <thead className="sticky top-0"><tr><th className="w-10"></th><th>Atividade / local</th><th>Previsão</th><th>Progresso</th><th>Situação</th></tr></thead>
                    <tbody>{visible.map(row => {
                      const fit = classify(row);
                      return <tr key={row.externalId}>
                        <td><input type="checkbox" className="accent-blue-700" aria-label={`Selecionar ${row.name}`} checked={selected.includes(row.externalId)} disabled={fit !== 'fits' || busy || !canImport}
                          onChange={e => setSelected(ids => e.target.checked ? [...ids, row.externalId] : ids.filter(id => id !== row.externalId))} /></td>
                        <th scope="row">{row.name}<span className="mt-0.5 block text-xs font-normal text-slate-500">{row.location}</span></th>
                        <td className="whitespace-nowrap">{formatDate(row.plannedStart)}<span className="block text-xs text-slate-400">a {formatDate(row.plannedEnd)}</span></td>
                        <td className="tabular-nums">{row.progress}%</td>
                        <td>{fit === 'imported'
                          ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600"><CheckCircle2 size={13} />Já importada</span>
                          : fit === 'fits' ? <span className="status in_production">Cabe no vagão</span>
                          : <span className="text-xs text-slate-400">Fora do período</span>}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>}
            {skipped > 0 && <div className="p-4"><Callout tone="warning">{skipped} registros do Prevision não puderam ser lidos por falta de datas válidas.</Callout></div>}
            {canImport && <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 p-5">
              <button className="button" disabled={busy || selected.length === 0 || !responsibleId} onClick={async () => {
                setBusy(true); setError(''); setMessage('');
                try {
                  const chosen = rows.filter(r => selected.includes(r.externalId) && classify(r) === 'fits');
                  if (chosen.length === 0) throw new Error('Revise as atividades selecionadas.');
                  await c.execute({ type: 'import_activities', wagonId: wagon.id, projectId: projectId!, responsibleId, rows: chosen });
                  setSelected([]);
                  setMessage(`${chosen.length} atividades importadas para o ${wagonLabel(wagon.number)}.`);
                } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível importar.'); }
                finally { setBusy(false); }
              }}><Download size={15} />Importar {selected.length > 0 ? `${selected.length} atividades` : 'selecionadas'}</button>
              <Link className="text-link text-sm" href={wagonPath(workId, wagon.id)}>Abrir {wagonLabel(wagon.number)} →</Link>
              {!responsibleId && selected.length > 0 && <span className="text-xs text-amber-600">Selecione o responsável no passo 3.</span>}
            </div>}
          </section>
        )}
      </>
    )}

    {error && <div className="mt-4"><Callout tone="danger" role="alert">{error}</Callout></div>}
    {message && <div className="mt-4"><Callout tone="success" role="status">{message}</Callout></div>}
  </>;
}

'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Layers, Play, Save, Search, CheckCircle2, AlertCircle, FolderOpen, ArrowUpRight } from 'lucide-react';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, LoadState, Missing } from '@/modules/planejamento/ui';
import { formatTimestamp, workPath } from '@/shared/format';
import type { SavedFederation } from '@/domain/ifc-federation';
import { FederationViewer, type FederationJob, type ViewerState } from './viewer';

interface VersionStatus { versionId: string; extractedAt: string | null; hasGeometry: boolean }
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body as T;
}

export function FederationOverview({ workId }: { workId: string }) {
  const context = usePlanning();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<SavedFederation[]>([]);
  const [savedId, setSavedId] = useState('');
  const [name, setName] = useState('');
  const [statuses, setStatuses] = useState<VersionStatus[]>();
  const [loadError, setLoadError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [job, setJob] = useState<FederationJob>();
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [onlySelected, setOnlySelected] = useState(false);
  const [remembered, setRemembered] = useState<Record<string, string>>({});
  const [viewerState, setViewerState] = useState<ViewerState>('idle');
  const [savedLoading, setSavedLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoadError(''); setStatusError(''); setStatuses(undefined); setSavedLoading(true);
    void json<{ federations: SavedFederation[] }>(`/api/ifc/federations?workId=${encodeURIComponent(workId)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) { setSaved(result.federations); setSavedLoading(false); } })
      .catch(cause => { if (!controller.signal.aborted) { setLoadError(cause.message); setSavedLoading(false); } });
    void json<{ versoes: VersionStatus[] }>(`/api/ifc/status?workId=${encodeURIComponent(workId)}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setStatuses(result.versoes); })
      .catch(cause => { if (!controller.signal.aborted) setStatusError(cause.message); });
    return () => controller.abort();
  }, [workId, retry]);

  if (context.state !== 'ready') return <LoadState error={context.state === 'error'} />;
  const { data } = context.planning;
  const work = data.works.find(candidate => candidate.id === workId);
  const actor = data.users.find(user => user.id === context.actorId);
  if (!work || !actor?.workIds.includes(workId)) return <Missing label="Obra não encontrada" />;
  const models = data.ifcModels.filter(model => model.workId === workId).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const versionsOf = (modelId: string) => data.ifcVersions.filter(version => version.modelId === modelId).slice().sort((a, b) => b.version - a.version);
  const chosenId = (modelId: string) => picked[modelId] ?? versionsOf(modelId)[0]?.id ?? '';
  const versions = models.flatMap(model => {
    const version = versionsOf(model.id).find(candidate => candidate.id === chosenId(model.id));
    return version ? [{ id: version.id, modelId: model.id, label: `${model.name} · v${version.version}` }] : [];
  });
  const selectedKey = versions.map(version => version.id).sort().join('|');
  const loadedKey = job?.versions.map(version => version.id).sort().join('|');
  const unavailable = versions.filter(version => !statuses?.some(status => status.versionId === version.id && status.extractedAt && status.hasGeometry));
  const canLoad = !!statuses && versions.length > 0 && unavailable.length === 0;
  const canSave = actor.role !== 'viewer';
  const locked = saving || viewerState === 'loading';
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visibleModels = models.filter(model => (!onlySelected || !!chosenId(model.id)) && normalize(`${model.name} ${model.discipline}`).includes(normalize(query.trim())));
  const editSelection = (values: Record<string, string>) => { setPicked(current => ({ ...current, ...values })); setSavedId(''); setNotice(''); };
  const loadHint = statusError ? 'Não foi possível consultar a disponibilidade.' : !statuses ? 'Consultando a disponibilidade dos arquivos…' : !versions.length ? 'Inclua ao menos um modelo.' : unavailable.length ? `${unavailable.length} modelo(s) selecionado(s) precisam de dados ou geometria.` : `${versions.length} modelo(s) pronto(s) para carregar.`;

  const save = async () => {
    if (saving) return;
    setSaving(true); setSaveError(''); setNotice('');
    try {
      const { federation } = await json<{ federation: SavedFederation }>('/api/ifc/federations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workId, name, versionIds: versions.map(version => version.id) }),
      });
      setSaved(current => [federation, ...current]); setSavedId(federation.id); setName(federation.name);
      setNotice('Composição salva com as versões selecionadas.'); setLoadError('');
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Falha ao salvar.'); }
    finally { setSaving(false); }
  };
  const openSaved = (id: string) => {
    const composition = saved.find(candidate => candidate.id === id);
    setSavedId(id); setNotice('');
    if (!composition) return;
    const ids = new Set(composition.versionIds);
    setPicked(Object.fromEntries(models.map(model => [model.id, versionsOf(model.id).find(version => ids.has(version.id))?.id ?? ''])));
    setName(composition.name);
    const missing = composition.versionIds.filter(versionId => !data.ifcVersions.some(version => version.id === versionId && models.some(model => model.id === version.modelId)));
    setNotice(missing.length ? `${missing.length} versão(ões) da composição não estão disponíveis. Confira a seleção antes de carregar ou salvar uma cópia.` : 'Composição aberta. Use Carregar conjunto para exibir estas versões.');
  };

  return <div className="federation-page">
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{work.name} · Coordenação</p>
        <h1 className="page-title">Modelo federado</h1>
        <p className="mt-1 text-sm text-slate-600">Escolha os modelos e as versões. Explore tudo em uma mesma cena.</p>
      </div>
      <Link className="button-ghost min-h-10" href={workPath(workId, 'ifc')}>Arquivos IFC <ArrowUpRight size={16} aria-hidden /></Link>
    </header>
    <details className="panel mb-5 group" data-tour="federation-saved">
      <summary className="flex min-h-14 cursor-pointer flex-wrap items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-800">
        <FolderOpen size={18} className="text-blue-700" aria-hidden />Composições salvas
        <span className="ml-auto text-xs font-normal text-slate-500">{savedId ? saved.find(item => item.id === savedId)?.name : savedLoading ? 'Consultando…' : loadError ? 'Consulta indisponível' : `${saved.length} composições`} · Abrir / salvar</span>
      </summary>
      <div className="grid gap-5 border-t border-slate-100 p-4 lg:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-slate-700">Abrir uma composição
            <select className="field mt-2 min-h-11" value={savedId} disabled={locked || savedLoading || !saved.length} onChange={event => openSaved(event.target.value)}>
              <option value="">{savedLoading ? 'Consultando composições…' : saved.length ? 'Escolha uma composição' : 'Nenhuma composição salva'}</option>
              {saved.map(composition => <option key={composition.id} value={composition.id}>{composition.name} · {formatTimestamp(composition.createdAt)}</option>)}
            </select>
          </label>
          <p className="mt-2 text-xs leading-5 text-slate-500">Abrir restaura a seleção. A cena muda ao carregar o conjunto.</p>
          {loadError && <div className="mt-3"><Callout tone="warning" role="alert">{loadError}</Callout><button className="button-ghost mt-2" type="button" disabled={locked} onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div>}
        </div>
        {canSave ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <label className="text-sm font-medium text-slate-700">Salvar a seleção atual
            <input className="field mt-2 min-h-11" required maxLength={120} value={name} disabled={locked} placeholder="Nome da composição" onChange={event => setName(event.target.value)} />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2"><button type="submit" className="button-ghost min-h-10" disabled={locked || !versions.length || !name.trim()}><Save size={15} aria-hidden />{saving ? 'Salvando…' : 'Salvar nova composição'}</button><span className="text-xs text-slate-500">{versions.length} modelo(s) · versões fixas</span></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Cria uma nova cópia. Composições anteriores são preservadas.</p>
          {saveError && <div className="mt-3"><Callout tone="danger" role="alert">{saveError}</Callout></div>}
        </form> : <p className="self-center text-sm text-slate-500">Seu perfil permite consultar e explorar as composições salvas.</p>}
      </div>
    </details>
    {notice && <p className="mb-4 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status">{notice}</p>}
    <div className="grid items-start gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
      <section className="panel min-w-0 overflow-hidden" data-tour="federation-composition" aria-labelledby="composition-heading">
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between gap-2"><h2 id="composition-heading" className="flex items-center gap-2 text-sm font-bold"><Layers size={17} aria-hidden />Modelos do conjunto</h2><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{versions.length}/{models.length}</span></div>
          <label className="relative mt-4 block"><span className="sr-only">Buscar modelo ou disciplina</span><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" aria-hidden /><input type="search" className="field min-h-11 pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar modelo ou disciplina" /></label>
          <label className="mt-2 flex min-h-10 items-center gap-2 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 accent-blue-700" checked={onlySelected} onChange={event => setOnlySelected(event.target.checked)} />Somente selecionados</label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="text-link min-h-9 text-xs" disabled={locked || !statuses} onClick={() => editSelection(Object.fromEntries(models.map(model => [model.id, versionsOf(model.id).find(version => statuses?.some(status => status.versionId === version.id && status.extractedAt && status.hasGeometry))?.id ?? ''])))}>Selecionar disponíveis</button>
            <span className="self-center text-slate-300" aria-hidden>·</span>
            <button type="button" className="min-h-9 text-xs font-semibold text-slate-600 hover:text-slate-900" disabled={locked || !versions.length} onClick={() => { setRemembered(current => ({ ...current, ...Object.fromEntries(models.filter(model => chosenId(model.id)).map(model => [model.id, chosenId(model.id)])) })); editSelection(Object.fromEntries(models.map(model => [model.id, '']))); }}>Limpar seleção</button>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <p id="load-hint" className="mb-3 text-xs leading-5 text-slate-600" role="status">{loadHint}</p>
          {statusError && <button type="button" className="text-link mb-3 min-h-10 text-sm" onClick={() => setRetry(value => value + 1)}>Consultar novamente</button>}
          <button type="button" className="button min-h-11 w-full" aria-describedby="load-hint" disabled={!canLoad || locked || viewerState === 'unsupported'} onClick={() => { setViewerState('loading'); setJob({ token: Date.now(), versions }); }}><Play size={16} aria-hidden />{viewerState === 'loading' ? 'Carregando conjunto…' : job ? 'Aplicar seleção ao 3D' : 'Carregar conjunto'}</button>
        </div>
        <div className="max-h-96 overflow-y-auto overscroll-contain custom-scrollbar xl:max-h-[52vh]">
          {!models.length ? <div className="p-5"><Empty>Envie seus primeiros modelos em Arquivos IFC.</Empty></div> : !visibleModels.length ? <div className="p-5 text-sm text-slate-500">Nenhum modelo corresponde aos filtros.<button type="button" className="text-link mt-2 block min-h-10" onClick={() => { setQuery(''); setOnlySelected(false); }}>Limpar filtros</button></div> : visibleModels.map(model => {
            const selected = chosenId(model.id);
            const modelVersions = versionsOf(model.id);
            const status = statuses?.find(candidate => candidate.versionId === selected);
            const available = status?.hasGeometry && status.extractedAt;
            return <div key={model.id} className={`border-b border-slate-100 p-4 last:border-0 ${selected ? 'bg-blue-50/40' : 'bg-white'}`}>
              <label className="flex min-h-10 cursor-pointer items-start gap-3">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-blue-700" checked={!!selected} disabled={locked || !modelVersions.length} onChange={event => { if (selected) setRemembered(current => ({ ...current, [model.id]: selected })); editSelection({ [model.id]: event.target.checked ? remembered[model.id] || modelVersions[0]?.id || '' : '' }); }} />
                <span className="min-w-0"><span className="block break-words text-sm font-semibold text-slate-800">{model.name}</span><span className="mt-0.5 block text-xs text-slate-500">{model.discipline || 'Sem disciplina'}</span></span>
              </label>
              {selected ? <div className="ml-7 mt-2">
                <label className="block text-xs font-medium text-slate-600">Versão
                  <select className="field mt-1 min-h-10 text-xs" aria-label={`Versão de ${model.name}`} value={selected} disabled={locked} onChange={event => editSelection({ [model.id]: event.target.value })}>
                    {modelVersions.map(version => <option key={version.id} value={version.id}>v{version.version} · {version.fileName}</option>)}
                  </select>
                </label>
                <p className={`mt-2 flex items-start gap-1.5 text-xs leading-5 ${available ? 'text-emerald-700' : 'text-amber-800'}`}>{available ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden /> : <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />}{!statuses ? statusError ? 'Disponibilidade não consultada' : 'Consultando disponibilidade…' : !status?.extractedAt ? 'Dados pendentes' : !status.hasGeometry ? 'Geometria pendente' : 'Pronto para carregar'}</p>
              </div> : <p className="ml-7 mt-1 text-xs text-slate-500">{modelVersions.length ? 'Fora do conjunto' : 'Nenhuma versão enviada'}</p>}
            </div>;
          })}
        </div>

      </section>
      <div className="min-w-0">
        {job && selectedKey !== loadedKey && <div className="mb-3"><Callout tone="warning">A seleção foi alterada. Aplique a seleção ao 3D para atualizar as versões da cena.</Callout></div>}
        <FederationViewer job={job} onState={setViewerState} />
      </div>
    </div>
    <details className="mt-5 text-xs text-slate-500"><summary className="min-h-10 cursor-pointer py-2 font-medium">Sobre esta etapa da federação</summary><p className="max-w-3xl leading-6">Os modelos usam o posicionamento da geometria importada. Ajustes de coordenadas, organização pelos sistemas internos do IFC e integração 4D ficam para as próximas etapas. Filtros e visibilidade não alteram a composição salva.</p></details>
  </div>;
}

'use client';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FragmentsModel, MaterialDefinition } from '@thatopen/fragments';
import { Boxes, Search, MousePointer2, X, Maximize, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { searchElements } from './element-search';
import { Callout } from '@/modules/planejamento/ui';
import { readElementMap, type MapRow } from '@/modules/ifc/element-map';
import { frame, loadFragments, type Federation } from '@/modules/ifc/fragments-stage';
import { SectionControls } from '@/modules/ifc/section-controls';
import { useSectionPlane } from '@/modules/ifc/use-section-plane';

export interface FederationJob { token: number; versions: { id: string; label: string; modelId: string }[] }
export type ViewerState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';
type Paint = 'modelo' | 'pavimento' | 'classe';
interface Stage { three: typeof THREE; renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls }
interface Part { versionId: string; label: string; modelId: string; model: FragmentsModel; rows: Map<number, MapRow>; byStorey: Map<string, number[]>; byClass: Map<string, number[]> }
interface Loaded { federation: Federation; parts: Part[]; declared: number; matched: number; queue: Promise<void> }
interface Picked { versionId: string; localId: number; row?: MapRow; label: string }
const compare = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
function hue(name: string) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return (hash >>> 0) % 360;
}
function dispose(federation: Federation) {
  for (const { model } of federation.models) model.object.removeFromParent();
  void federation.fragments.dispose().catch(() => undefined);
}

/** Exploração espacial, independente de serviços, datas e avanço físico. */
export function FederationViewer({ job, onState }: { job: FederationJob | undefined; onState: (state: ViewerState) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | undefined>(undefined);
  const loadRef = useRef<Loaded | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [loaded, setLoaded] = useState<Loaded>();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [paint, setPaint] = useState<Paint>('modelo');
  const [storey, setStorey] = useState('');
  const [hidden, setHidden] = useState<string[]>([]);
  const [picked, setPicked] = useState<Picked>();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [explorer, setExplorer] = useState<'modelos' | 'elementos'>('modelos');
  const busy = !!message;
  const usable = !!loaded && !busy && webgl;
  const section = useSectionPlane(stageRef.current, loaded?.federation);
  const clearView = () => { setHidden([]); setStorey(''); setPicked(undefined); section.reset(); };
  useEffect(() => {
    onState(!webgl ? 'unsupported' : error ? 'error' : busy || (job && !ready) ? 'loading' : loaded ? 'ready' : 'idle');
  }, [webgl, error, busy, job, ready, loaded, onState]);

  useEffect(() => {
    let stopped = false;
    let teardown: (() => void) | undefined;
    async function build() {
      const [three, { OrbitControls }] = await Promise.all([import('three'), import('three/examples/jsm/controls/OrbitControls.js')]);
      if (stopped || !box.current || !canvas.current) return;
      const host = box.current, dom = canvas.current;
      let renderer: THREE.WebGLRenderer;
      try { renderer = new three.WebGLRenderer({ canvas: dom, antialias: true }); }
      catch { setWebgl(false); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const scene = new three.Scene();
      scene.background = new three.Color('#eef2f6');
      scene.add(new three.AmbientLight('#ffffff', 2.1));
      const sun = new three.DirectionalLight('#ffffff', 1.5);
      sun.position.set(1, 2, 1.5); scene.add(sun);
      const camera = new three.PerspectiveCamera(55, 1, 0.1, 5000);
      camera.position.set(30, 24, 30);
      const controls = new OrbitControls(camera, dom);
      controls.enableDamping = true;
      stageRef.current = { three, renderer, scene, camera, controls };
      const resize = () => {
        const width = host.clientWidth || 1, height = host.clientHeight || 1;
        renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      };
      resize();
      const observer = new ResizeObserver(resize); observer.observe(host);
      let refreshing = false;
      const refresh = () => {
        const load = loadRef.current;
        if (!load || refreshing) return;
        refreshing = true;
        load.federation.fragments.update().catch(() => undefined).finally(() => { refreshing = false; });
      };
      controls.addEventListener('change', refresh);
      renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
      let startX = 0, startY = 0, pickSequence = 0;
      const down = (event: PointerEvent) => { startX = event.clientX; startY = event.clientY; };
      const up = async (event: PointerEvent) => {
        if (event.button !== 0 || Math.hypot(event.clientX - startX, event.clientY - startY) > 5) return;
        const load = loadRef.current;
        if (!load) return;
        const sequence = ++pickSequence;
        const planes = renderer.clippingPlanes;
        const hits = await Promise.all(load.parts.map(async part => ({ part, hit: await part.model.raycast({ camera, mouse: new three.Vector2(event.clientX, event.clientY), dom }).catch(() => null) })));
        if (stopped || loadRef.current !== load || sequence !== pickSequence || renderer.clippingPlanes !== planes) return;
        const nearest = hits.filter(entry => entry.hit && planes.every(plane => plane.distanceToPoint(entry.hit!.point) >= 0)).sort((a, b) => a.hit!.distance - b.hit!.distance)[0];
        setPicked(nearest?.hit ? { versionId: nearest.part.versionId, localId: nearest.hit.localId, row: nearest.part.rows.get(nearest.hit.localId), label: nearest.part.label } : undefined);
      };
      dom.addEventListener('pointerdown', down); dom.addEventListener('pointerup', up);
      setReady(true);
      teardown = () => {
        observer.disconnect(); dom.removeEventListener('pointerdown', down); dom.removeEventListener('pointerup', up);
        controls.removeEventListener('change', refresh); controls.dispose(); renderer.setAnimationLoop(null);
        renderer.dispose(); renderer.forceContextLoss(); scene.clear(); stageRef.current = undefined;
      };
    }
    void build().catch(() => { if (!stopped) setError('Não foi possível iniciar o visualizador. Reabra esta página.'); });
    return () => { stopped = true; teardown?.(); };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!ready || !job || !stage) return;
    const controller = new AbortController();
    let stopped = false;
    let opened: Federation | undefined;
    async function run() {
      setLoaded(undefined); loadRef.current = undefined; setPicked(undefined); setQuery(''); setHidden([]); setStorey(''); setError('');
      setMessage('Lendo os elementos do conjunto…');
      try {
        const map = await readElementMap(job!.versions.map(version => version.id), controller.signal, (read, total) => {
          if (!stopped) setMessage(`Lendo elementos: ${read.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}…`);
        });
        if (stopped) return;
        const federation = await loadFragments({ scene: stage!.scene, camera: stage!.camera, versions: job!.versions, signal: controller.signal, onProgress: text => { if (!stopped) setMessage(text); } });
        if (stopped) { dispose(federation); return; }
        opened = federation;
        setMessage('Relacionando os elementos à geometria…');
        const byVersion = new Map<string, MapRow[]>();
        for (const row of map.rows) {
          const group = byVersion.get(row.versionId);
          if (group) group.push(row); else byVersion.set(row.versionId, [row]);
        }
        const parts: Part[] = [];
        for (const entry of federation.models) {
          const rows = byVersion.get(entry.versionId) ?? [];
          const localIds = await entry.model.getLocalIdsByGuids(rows.map(row => row.globalId));
          if (stopped) return;
          const byLocal = new Map<number, MapRow>();
          localIds.forEach((localId, index) => { if (typeof localId === 'number' && rows[index]) byLocal.set(localId, rows[index]); });
          const byStorey = new Map<string, number[]>(), byClass = new Map<string, number[]>();
          for (const [id, row] of byLocal) {
            for (const [groups, name] of [[byStorey, row.storey], [byClass, row.ifcClass]] as const) {
              const group = groups.get(name);
              if (group) group.push(id); else groups.set(name, [id]);
            }
          }
          parts.push({ ...entry, modelId: job!.versions.find(version => version.id === entry.versionId)!.modelId, rows: byLocal, byStorey, byClass });
        }
        frame(stage!.three, stage!.camera, stage!.controls, federation.models);
        const result: Loaded = { federation, parts, declared: map.declared, matched: parts.reduce((sum, part) => sum + part.rows.size, 0), queue: Promise.resolve() };
        loadRef.current = result; setLoaded(result);
      } catch (cause) {
        if (opened) { dispose(opened); opened = undefined; }
        if (!stopped) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o conjunto.');
      } finally { if (!stopped) setMessage(''); }
    }
    void run();
    return () => { stopped = true; controller.abort(); loadRef.current = undefined; if (opened) dispose(opened); };
  }, [job, ready]);

  // Serializa alterações no worker: uma pintura antiga não pode terminar por cima da nova.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !loaded) return;
    let stale = false;
    const apply = async () => {
      if (stale) return;
      const material = (name: string): MaterialDefinition => ({
        color: name === 'selecionado' ? new stage.three.Color('#f59e0b') : name === 'sem-dados' ? new stage.three.Color('#94a3b8') : new stage.three.Color().setHSL(hue(name) / 360, 0.58, 0.52, stage.three.SRGBColorSpace),
        opacity: 1, transparent: false, renderedFaces: loaded.federation.api.RenderedFaces.TWO,
      });
      for (const part of loaded.parts) {
        if (stale) return;
        await part.model.highlight(undefined, material(paint === 'modelo' ? part.modelId : 'sem-dados'));
        if (paint !== 'modelo') {
          const groups = paint === 'classe' ? part.byClass : part.byStorey;
          for (const [name, ids] of groups) { if (stale) return; await part.model.highlight(ids, material(name)); }
        }
        if (picked?.versionId === part.versionId) await part.model.highlight([picked.localId], material('selecionado'));
        if (hidden.includes(part.versionId) || storey) {
          await part.model.setVisible(undefined, false);
          if (!hidden.includes(part.versionId)) await part.model.setVisible(part.byStorey.get(storey) ?? [], true);
        } else await part.model.resetVisible();
      }
      if (!stale) await loaded.federation.fragments.update(true);
    };
    loaded.queue = loaded.queue.then(apply).catch(() => { if (!stale) setError('Não foi possível atualizar a visualização. Recarregue o conjunto.'); });
    return () => { stale = true; };
  }, [loaded, paint, hidden, storey, picked]);

  const storeys = useMemo(() => [...new Set(loaded?.parts.flatMap(part => [...part.byStorey.keys()]) ?? [])].sort(compare), [loaded]);
  const legend = useMemo(() => {
    const totals = new Map<string, number>();
    if (paint !== 'modelo') for (const part of loaded?.parts ?? []) {
      for (const [name, ids] of paint === 'classe' ? part.byClass : part.byStorey) totals.set(name, (totals.get(name) ?? 0) + ids.length);
    }
    return [...totals].sort(([a], [b]) => compare(a, b));
  }, [loaded, paint]);
  const search = useMemo(() => searchElements(loaded?.parts ?? [], deferredQuery, hidden, storey), [loaded, deferredQuery, hidden, storey]);
  return <section className="panel min-w-0 overflow-hidden" data-tour="federation-viewer" aria-labelledby="scene-heading">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
      <div><h2 id="scene-heading" className="flex items-center gap-2 text-sm font-bold"><Boxes size={18} className="text-blue-700" aria-hidden />Explorar o conjunto</h2><p className="mt-1 text-xs text-slate-500">{busy ? 'Preparando a cena…' : loaded ? `${loaded.parts.length} modelos carregados · ${loaded.matched.toLocaleString('pt-BR')} elementos relacionados` : 'A cena será exibida após carregar os modelos.'}</p></div>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${busy ? 'bg-blue-50 text-blue-700' : error ? 'bg-rose-50 text-rose-700' : loaded ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{busy ? 'Carregando' : error ? 'Falha na visualização' : !webgl ? 'WebGL indisponível' : loaded ? 'Conjunto carregado' : 'Aguardando seleção'}</span>
    </div>
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 bg-slate-50/70 p-3">
      <label className="min-w-32 flex-1 text-xs font-semibold text-slate-600">Cores
        <select className="field mt-1 min-h-10" disabled={!usable} value={paint} onChange={event => setPaint(event.target.value as Paint)}><option value="modelo">Por modelo</option><option value="pavimento">Por pavimento</option><option value="classe">Por classe IFC</option></select>
      </label>
      <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">Pavimento
        <select className="field mt-1 min-h-10" disabled={!usable} value={storey} onChange={event => { setStorey(event.target.value); setPicked(undefined); }}><option value="">Todos os pavimentos</option>{storeys.map(name => <option key={name}>{name}</option>)}</select>
      </label>
      <div className="flex gap-2">
        <button type="button" className="button-ghost min-h-10" title="Enquadrar todos os modelos carregados" disabled={!usable} onClick={() => { const stage = stageRef.current; if (stage && loaded) frame(stage.three, stage.camera, stage.controls, loaded.federation.models); }}><Maximize size={16} aria-hidden /><span className="sr-only sm:not-sr-only">Enquadrar</span></button>
        <button type="button" className="button-ghost min-h-10" disabled={!usable} onClick={clearView}><RotateCcw size={16} aria-hidden /><span className="sr-only sm:not-sr-only">Mostrar tudo</span></button>
      </div>
    </div>
    <div className="border-b border-slate-100 p-3"><SectionControls value={section.value} disabled={!usable || !section.available} error={section.error} onChange={value => { section.setValue(value); setPicked(undefined); }} /></div>
    {error && <div className="m-3"><Callout tone="danger" role="alert">{error}</Callout></div>}
    <div ref={box} className="relative h-[360px] overflow-hidden bg-slate-100 sm:h-[480px] 2xl:h-[560px]" aria-busy={busy}>
      <canvas ref={canvas} className="h-full w-full" role="img" aria-label="Modelo federado. Arraste para orbitar e use a roda para aproximar. Consulte elementos pelo clique ou pela lista abaixo." />
      {!webgl && <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-slate-600">WebGL não está disponível. Você ainda pode montar e salvar composições na seleção de modelos.</div>}
      {webgl && busy && <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80 p-6"><p role="status" className="max-w-md rounded-xl border border-blue-100 bg-white px-5 py-4 text-center text-sm font-medium text-blue-800 shadow-sm">{message}</p></div>}
      {webgl && !job && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center"><Boxes size={40} className="text-slate-400" aria-hidden /><p className="font-semibold text-slate-700">Seu conjunto começa pela seleção</p><p className="max-w-sm text-sm leading-6 text-slate-500">Inclua os modelos, confira as versões e clique em Carregar conjunto.</p></div>}
      {usable && <p className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-white/90 px-3 py-2 text-xs text-slate-600 shadow-sm">Arraste para orbitar · Role para aproximar · Clique para selecionar</p>}
    </div>
    {usable && (hidden.length > 0 || storey || section.value.enabled) && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900"><span>{[hidden.length > 0 ? `${hidden.length} modelo(s) oculto(s)` : '', storey ? `Pavimento: ${storey}` : '', section.value.enabled ? `Corte ${section.value.axis.toUpperCase()}: ${section.value.position}%${section.value.inverted ? ' · invertido' : ''}` : ''].filter(Boolean).join(' · ')}</span><button type="button" className="min-h-9 font-semibold underline underline-offset-4" onClick={clearView}>Limpar recorte</button></div>}
    <div className="border-t border-slate-200">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-3 py-2" aria-label="Painel de exploração">
        <button type="button" aria-pressed={explorer === 'modelos'} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${explorer === 'modelos' ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setExplorer('modelos')}>Modelos em cena{loaded ? ` (${loaded.parts.length})` : ''}</button>
        <button type="button" aria-pressed={explorer === 'elementos'} className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${explorer === 'elementos' ? 'bg-blue-50 text-blue-800' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setExplorer('elementos')}>Buscar elementos</button>
        <span className="ml-auto text-xs text-slate-500">Visibilidade não altera a composição</span>
      </div>
      <div className="grid divide-y divide-slate-100 2xl:grid-cols-2 2xl:divide-x 2xl:divide-y-0">
        <div className="min-w-0 p-4">
          {explorer === 'modelos' ? <>
            {!loaded && <p className="py-3 text-sm text-slate-500">Os modelos carregados aparecerão aqui para ocultar ou isolar.</p>}
            <ul className="max-h-64 space-y-2 overflow-y-auto custom-scrollbar">{loaded?.parts.map(part => <li key={part.versionId} className={`flex items-center gap-2 rounded-lg border p-2 ${hidden.includes(part.versionId) ? 'border-slate-200 bg-slate-50' : 'border-blue-100 bg-blue-50/30'}`}>
              <button type="button" disabled={!usable} aria-label={`${hidden.includes(part.versionId) ? 'Mostrar' : 'Ocultar'} ${part.label}`} aria-pressed={!hidden.includes(part.versionId)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-white" onClick={() => { setHidden(current => current.includes(part.versionId) ? current.filter(id => id !== part.versionId) : [...current, part.versionId]); setPicked(undefined); }}>{hidden.includes(part.versionId) ? <EyeOff size={17} aria-hidden /> : <Eye size={17} aria-hidden />}</button>
              <div className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-medium text-slate-700">{paint === 'modelo' && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `hsl(${hue(part.modelId)} 58% 52%)` }} />}<span className="break-words">{part.label}</span></span><p className="mt-0.5 text-xs text-slate-500">{hidden.includes(part.versionId) ? 'Oculto' : 'Visível'} · {part.rows.size.toLocaleString('pt-BR')} elementos</p></div>
              <button type="button" disabled={!usable} className="text-link min-h-10 px-2 text-xs" onClick={() => { setHidden(loaded!.parts.filter(candidate => candidate !== part).map(candidate => candidate.versionId)); setPicked(undefined); }}>Isolar<span className="sr-only"> {part.label}</span></button>
            </li>)}</ul>
          </> : <>
            <label className="relative block"><span className="sr-only">Buscar elementos por nome, classe ou GlobalId</span><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" aria-hidden /><input type="search" disabled={!usable} className="field min-h-11 pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome, classe ou GlobalId" /></label>
            <p className="my-2 text-xs text-slate-500" role="status">{!loaded ? 'Carregue o conjunto para buscar elementos.' : `${search.total.toLocaleString('pt-BR')} resultados nos modelos e pavimentos visíveis${search.total > 50 ? ' · mostrando os primeiros 50; refine a busca' : ''}.`}</p>
            {section.value.enabled && <p className="mb-2 text-xs leading-5 text-amber-800">A busca inclui elementos além do plano de corte. Remova o corte para vê-los por inteiro.</p>}
            <ul className="max-h-64 space-y-1 overflow-y-auto custom-scrollbar">{search.results.map(item => <li key={`${item.versionId}:${item.localId}`}><button type="button" disabled={!usable} aria-pressed={picked?.versionId === item.versionId && picked.localId === item.localId} className={`w-full rounded-lg border p-3 text-left ${picked?.versionId === item.versionId && picked.localId === item.localId ? 'border-amber-300 bg-amber-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`} onClick={() => setPicked(item)}><span className="block break-words text-sm font-medium text-slate-800">{item.row.name || 'Elemento sem nome'}</span><span className="mt-1 block break-words text-xs text-slate-500">{item.row.ifcClass} · {item.row.storey} · {item.label}</span></button></li>)}</ul>
            {loaded && !search.total && <p className="py-4 text-sm text-slate-500">Nenhum elemento encontrado. Ajuste a busca ou mostre todos os modelos e pavimentos.</p>}
          </>}
        </div>
        <aside className="min-w-0 p-4" aria-label="Dados do elemento selecionado">
          <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><MousePointer2 size={16} aria-hidden />Elemento selecionado</h3>{picked && <button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Limpar seleção do elemento" onClick={() => setPicked(undefined)}><X size={17} aria-hidden /></button>}</div>
          {picked ? <><p className="mt-3 break-words text-sm font-semibold text-slate-900">{picked.row?.name || 'Elemento sem nome'}</p><dl className="mt-3 space-y-3">{[['Modelo / versão', picked.label], ['Classe IFC', picked.row?.ifcClass], ['Pavimento', picked.row?.storey], ['GlobalId', picked.row?.globalId]].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-0.5 break-all text-sm text-slate-800 ${label === 'GlobalId' ? 'font-mono text-xs' : ''}`}>{value || 'Sem dados transcritos'}</dd></div>)}</dl></> : <p className="mt-3 text-sm leading-6 text-slate-500">Clique em uma peça no 3D ou escolha um resultado em Buscar elementos. Os dados e a origem aparecem aqui.</p>}
        </aside>
      </div>
    </div>
    {legend.length > 0 && <details className="border-t border-slate-100 px-4 py-2"><summary className="min-h-10 cursor-pointer py-2 text-xs font-semibold text-slate-600">Legenda do conjunto completo · {paint === 'classe' ? 'classes IFC' : 'pavimentos'}</summary><ul className="mb-2 flex max-h-32 flex-wrap gap-2 overflow-y-auto">{legend.map(([name, total]) => <li key={name} className="badge-muted"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: `hsl(${hue(name)} 58% 52%)` }} />{name} · {total.toLocaleString('pt-BR')}</li>)}</ul></details>}
    {loaded && loaded.declared > loaded.matched && <p className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-500">{(loaded.declared - loaded.matched).toLocaleString('pt-BR')} registros com GlobalId não foram relacionados à geometria. A busca e os filtros consideram os elementos relacionados.</p>}
  </section>;
}

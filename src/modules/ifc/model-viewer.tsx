'use client';
import { useEffect, useRef, useState } from 'react';
import { Boxes, Eraser, MousePointerClick, Play } from 'lucide-react';
import type * as ThreeNS from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FlatMesh, IfcAPI } from 'web-ifc';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, StatCard } from '@/modules/planejamento/ui';
import { formatTimestamp } from '@/shared/format';

type Three = typeof ThreeNS;
const CHUNK = 250;
const pause = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });
const megabytes = (bytes: number) => `${(bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
const count = (value: number) => value.toLocaleString('pt-BR');
const byText = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

interface Stage { three: Three; renderer: ThreeNS.WebGLRenderer; scene: ThreeNS.Scene; camera: ThreeNS.PerspectiveCamera; controls: OrbitControls; root: ThreeNS.Group; zUp: ThreeNS.Group; highlight: ThreeNS.MeshLambertMaterial }
interface Loaded { mesh: ThreeNS.Mesh; expressID: number; storey: string; base: ThreeNS.MeshLambertMaterial }
interface Job { versionId: string; label: string; version: number; fileName: string; fileSize: number; createdAt: string }
interface Report { meshes: number; elements: number; declared: number; storeys: string[]; withoutStorey: number }
interface Picked { expressID: number; ifcClass: string; name: string; globalId: string; storey: string }

function idsOfType(api: IfcAPI, modelID: number, type: number, inherited = false) {
  const found: number[] = [];
  try {
    const vector = api.GetLineIDsWithType(modelID, type, inherited);
    for (let i = 0; i < vector.size(); i++) found.push(vector.get(i));
  } catch { /* tipo inexistente no schema do arquivo */ }
  return found;
}
const asList = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : []) as { value?: number }[];
const line = (api: IfcAPI, modelID: number, id: number) => { try { return api.GetLine(modelID, id); } catch { return undefined; } };
const typeNameOf = (api: IfcAPI, modelID: number, expressID: number) => {
  try { return String(api.GetNameFromTypeCode(api.GetLineType(modelID, expressID)) ?? ''); } catch { return ''; }
};

/** O pavimento sai da estrutura espacial: IFCRELCONTAINEDINSPATIALSTRUCTURE liga o elemento a um
 * espaço/pavimento, e IFCRELAGGREGATES permite subir de um espaço até o pavimento que o contém. */
function readStoreys(ifc: typeof import('web-ifc'), api: IfcAPI, modelID: number) {
  const names = new Map<number, string>();
  for (const id of idsOfType(api, modelID, ifc.IFCBUILDINGSTOREY)) {
    const storey = line(api, modelID, id);
    const name = String(storey?.Name?.value ?? storey?.LongName?.value ?? '').trim();
    if (name) names.set(id, name);
  }
  const parentOf = new Map<number, number>();
  for (const id of idsOfType(api, modelID, ifc.IFCRELAGGREGATES)) {
    const rel = line(api, modelID, id);
    const parent = rel?.RelatingObject?.value;
    if (!parent) continue;
    for (const child of asList(rel?.RelatedObjects)) if (child?.value) parentOf.set(child.value, parent);
  }
  const climb = (spatialId: number | undefined) => {
    let cursor = spatialId;
    for (let hop = 0; cursor !== undefined && hop < 24; hop++) {
      const name = names.get(cursor);
      if (name) return name;
      cursor = parentOf.get(cursor);
    }
    return '';
  };
  const resolved = new Map<number, string>();
  for (const id of idsOfType(api, modelID, ifc.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const rel = line(api, modelID, id);
    const name = climb(rel?.RelatingStructure?.value);
    if (!name) continue;
    for (const element of asList(rel?.RelatedElements)) if (element?.value) resolved.set(element.value, name);
  }
  return resolved;
}

/** Só o que o próprio arquivo diz do elemento clicado: classe, Name, GlobalId e pavimento. */
function describe(api: IfcAPI | undefined, modelID: number, item: Loaded): Picked {
  const open = api && modelID >= 0 ? api : undefined;
  const data = open ? line(open, modelID, item.expressID) : undefined;
  return {
    expressID: item.expressID,
    ifcClass: open ? typeNameOf(open, modelID, item.expressID) : '',
    name: String(data?.Name?.value ?? '').trim(),
    globalId: String(data?.GlobalId?.value ?? '').trim(),
    storey: item.storey,
  };
}

export function ModelViewer({ workId }: { workId: string }) {
  const context = usePlanning();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [versionId, setVersionId] = useState('');
  const [job, setJob] = useState<Job>();
  const [step, setStep] = useState('');
  const [failure, setFailure] = useState('');
  const [report, setReport] = useState<Report>();
  const [storey, setStorey] = useState('');
  const [picked, setPicked] = useState<Picked>();
  const stageRef = useRef<Stage | undefined>(undefined);
  const loadedRef = useRef<Loaded[]>([]);
  const materialsRef = useRef<ThreeNS.MeshLambertMaterial[]>([]);
  const apiRef = useRef<IfcAPI | undefined>(undefined);
  const modelRef = useRef(-1);
  const busy = step !== '';

  useEffect(() => {
    if (!box || !canvas) return;
    let dropped = false;
    let teardown: (() => void) | undefined;

    const build = async () => {
      const [three, controls] = await Promise.all([import('three'), import('three/examples/jsm/controls/OrbitControls.js')]);
      if (dropped) return;
      const width = () => box.clientWidth || 1;
      const height = () => box.clientHeight || 1;
      let renderer: ThreeNS.WebGLRenderer;
      try { renderer = new three.WebGLRenderer({ canvas, antialias: true }); }
      catch { setWebgl(false); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width(), height(), false);
      const scene = new three.Scene();
      scene.background = new three.Color('#eef2f6');
      const camera = new three.PerspectiveCamera(55, width() / height(), 0.1, 5000);
      camera.position.set(30, 24, 30);
      scene.add(new three.AmbientLight('#ffffff', 2.1));
      const sun = new three.DirectionalLight('#ffffff', 1.5);
      sun.position.set(1, 2, 1.5);
      scene.add(sun);
      const root = new three.Group();
      root.matrixAutoUpdate = false;
      // IFC é Z para cima; three é Y para cima.
      const zUp = new three.Group();
      zUp.rotation.x = -Math.PI / 2;
      zUp.matrixAutoUpdate = false;
      zUp.updateMatrix();
      root.add(zUp);
      scene.add(root);
      const orbit = new controls.OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.08;
      const highlight = new three.MeshLambertMaterial({ color: '#f59e0b', emissive: new three.Color('#92400e'), side: three.DoubleSide });
      stageRef.current = { three, renderer, scene, camera, controls: orbit, root, zUp, highlight };
      renderer.setAnimationLoop(() => { orbit.update(); renderer.render(scene, camera); });

      const observer = new ResizeObserver(() => {
        camera.aspect = width() / height();
        camera.updateProjectionMatrix();
        renderer.setSize(width(), height(), false);
      });
      observer.observe(box);

      const raycaster = new three.Raycaster();
      const pointer = new three.Vector2();
      let downX = 0, downY = 0;
      const onDown = (event: PointerEvent) => { downX = event.clientX; downY = event.clientY; };
      const onUp = (event: PointerEvent) => {
        if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return; // arrastar orbita, não seleciona
        const rect = canvas.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        // O Raycaster não olha `visible`, então o recorte por pavimento entra na lista de candidatos.
        const visible = loadedRef.current.filter(item => item.mesh.visible);
        const hit = raycaster.intersectObjects(visible.map(item => item.mesh), false)[0];
        const found = hit ? visible.find(item => item.mesh === hit.object) : undefined;
        setPicked(found ? describe(apiRef.current, modelRef.current, found) : undefined);
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerup', onUp);
      setReady(true);

      teardown = () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        observer.disconnect();
        renderer.setAnimationLoop(null);
        orbit.dispose();
        highlight.dispose();
        scene.clear();
        renderer.dispose();
        renderer.forceContextLoss();
        stageRef.current = undefined;
      };
    };
    build();

    return () => { dropped = true; setReady(false); teardown?.(); };
  }, [box, canvas]);

  useEffect(() => {
    if (!job || !ready) return;
    const stage = stageRef.current;
    if (!stage) return;
    const three = stage.three;
    let cancelled = false;
    let api: IfcAPI | undefined;
    let modelID = -1;
    const clear = () => {
      for (const item of loadedRef.current) { stage.zUp.remove(item.mesh); item.mesh.geometry.dispose(); }
      loadedRef.current = [];
      for (const material of materialsRef.current) material.dispose();
      materialsRef.current = [];
      apiRef.current = undefined;
      modelRef.current = -1;
    };

    const run = async () => {
      setFailure(''); setReport(undefined); setPicked(undefined); setStorey('');
      stage.root.position.set(0, 0, 0);
      stage.root.updateMatrix();
      try {
        const ifc = await import('web-ifc');
        if (cancelled) return;
        setStep('Buscando o arquivo…');
        const signed = await fetch(`/api/ifc/download-url?versionId=${encodeURIComponent(job.versionId)}`, { cache: 'no-store' });
        const body = await signed.json().catch(() => ({}));
        if (cancelled) return;
        if (!signed.ok || !body?.url) throw new Error(body?.error ?? 'Não foi possível liberar o arquivo desta versão para download.');
        const file = await fetch(String(body.url));
        if (cancelled) return;
        if (!file.ok) throw new Error('Não foi possível baixar o arquivo do armazenamento. Tente carregar de novo.');
        const buffer = await file.arrayBuffer();
        if (cancelled) return;

        setStep('Lendo o modelo…');
        api = new ifc.IfcAPI();
        // Só web-ifc.wasm é publicado em /wasm/: caminho absoluto e thread única para não buscar a variante multithread.
        api.SetWasmPath('/wasm/', true);
        try { await api.Init(undefined, true); }
        catch { throw new Error('Não foi possível iniciar o leitor de IFC neste navegador.'); }
        if (cancelled) return;
        await pause();
        modelID = api.OpenModel(new Uint8Array(buffer));
        if (modelID < 0 || !api.IsModelOpen(modelID)) throw new Error('O arquivo não pôde ser lido como IFC. Confirme que é um modelo IFC válido e não corrompido.');
        // O modelo fica aberto enquanto está em cena: a inspeção lê as linhas do arquivo a cada clique.
        apiRef.current = api;
        modelRef.current = modelID;
        const storeyOf = readStoreys(ifc, api, modelID);
        const ids = idsOfType(api, modelID, ifc.IFCELEMENT, true);
        if (cancelled) return;

        const materials = new Map<string, ThreeNS.MeshLambertMaterial>();
        const withGeometry = new Set<number>();
        const addFlat = (flat: FlatMesh) => {
          if (cancelled) return;
          const storeyName = storeyOf.get(flat.expressID) ?? '';
          for (let part = 0; part < flat.geometries.size(); part++) {
            const placed = flat.geometries.get(part);
            const source = api!.GetGeometry(modelID, placed.geometryExpressID);
            const vertices = api!.GetVertexArray(source.GetVertexData(), source.GetVertexDataSize());
            const indices = api!.GetIndexArray(source.GetIndexData(), source.GetIndexDataSize());
            source.delete();
            if (!vertices.length || !indices.length) continue;
            const geometry = new three.BufferGeometry();
            const interleaved = new three.InterleavedBuffer(vertices, 6); // posição (3) + normal (3) por vértice
            geometry.setAttribute('position', new three.InterleavedBufferAttribute(interleaved, 3, 0));
            geometry.setAttribute('normal', new three.InterleavedBufferAttribute(interleaved, 3, 3));
            geometry.setIndex(new three.BufferAttribute(indices, 1));
            // Alfa 0 declarado no arquivo deixaria o elemento invisível e a cena pareceria vazia.
            const alpha = Math.max(placed.color.w, 0.15);
            const key = `${placed.color.x.toFixed(3)}:${placed.color.y.toFixed(3)}:${placed.color.z.toFixed(3)}:${alpha.toFixed(2)}`;
            let base = materials.get(key);
            if (!base) {
              base = new three.MeshLambertMaterial({
                color: new three.Color().setRGB(placed.color.x, placed.color.y, placed.color.z, three.SRGBColorSpace),
                transparent: alpha < 1, opacity: alpha, depthWrite: alpha > 0.9, side: three.DoubleSide,
              });
              materials.set(key, base);
              materialsRef.current.push(base);
            }
            const mesh = new three.Mesh(geometry, base);
            mesh.applyMatrix4(new three.Matrix4().fromArray(placed.flatTransformation));
            mesh.matrixAutoUpdate = false;
            mesh.matrixWorldNeedsUpdate = true;
            stage.zUp.add(mesh);
            loadedRef.current.push({ mesh, expressID: flat.expressID, storey: storeyName, base });
            withGeometry.add(flat.expressID);
          }
        };

        // Em lotes para dar progresso e devolver a thread ao navegador; sem lista de elementos
        // (schema inesperado) o fallback pede todas as malhas de uma vez.
        setStep('Montando a geometria…');
        for (let at = 0; at < ids.length; at += CHUNK) {
          if (cancelled) return;
          api.StreamMeshes(modelID, ids.slice(at, at + CHUNK), addFlat);
          setStep(`Montando a geometria… ${count(Math.min(at + CHUNK, ids.length))} de ${count(ids.length)} elementos`);
          await pause();
        }
        if (!ids.length) {
          await pause();
          if (cancelled) return;
          api.StreamAllMeshes(modelID, addFlat);
        }
        if (cancelled) return;

        stage.root.updateMatrixWorld(true);
        const bounds = new three.Box3().setFromObject(stage.zUp);
        if (!bounds.isEmpty()) {
          const center = bounds.getCenter(new three.Vector3());
          const radius = Math.max(bounds.getSize(new three.Vector3()).length() / 2, 1);
          const distance = radius / Math.sin((stage.camera.fov * Math.PI) / 360);
          stage.root.position.copy(center).negate();
          stage.root.updateMatrix();
          stage.camera.position.set(distance * 0.65, distance * 0.55, distance * 0.65);
          stage.camera.near = Math.max(distance / 1000, 0.01);
          stage.camera.far = distance * 12;
          stage.camera.updateProjectionMatrix();
          stage.controls.target.set(0, 0, 0);
          stage.controls.update();
        }
        const storeys = [...new Set(loadedRef.current.map(item => item.storey).filter(Boolean))].sort(byText);
        setReport({
          meshes: loadedRef.current.length,
          elements: withGeometry.size,
          declared: ids.length,
          storeys,
          withoutStorey: [...withGeometry].filter(id => !storeyOf.get(id)).length,
        });
        setStep('');
      } catch (error) {
        if (cancelled) return;
        // Nada de meia geometria em cena junto de uma mensagem de erro.
        clear();
        if (api && modelID >= 0) { try { api.CloseModel(modelID); } catch { /* modelo já liberado */ } }
        api = undefined; modelID = -1;
        setFailure(error instanceof Error && error.message ? error.message : 'Não foi possível carregar este modelo.');
        setStep('');
      }
    };
    run();

    return () => {
      cancelled = true;
      clear();
      if (api && modelID >= 0) { try { api.CloseModel(modelID); } catch { /* modelo já liberado */ } }
    };
  }, [job, ready]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    for (const item of loadedRef.current) {
      item.mesh.visible = !storey || item.storey === storey;
      item.mesh.material = picked?.expressID === item.expressID ? stage.highlight : item.base;
    }
  }, [report, storey, picked]);

  if (context.state !== 'ready') return null;
  const { planning } = context;
  const selected = selectWorkPlanning(planning, workId);
  const actor = planning.data.users.find(u => u.id === context.actorId);
  if (!selected || !actor?.workIds.includes(workId)) return null;
  const { data } = planning;

  const models = data.ifcModels.filter(m => m.workId === workId).slice().sort((a, b) => byText(a.name, b.name));
  const options = models.flatMap(model => data.ifcVersions.filter(v => v.modelId === model.id).slice().sort((a, b) => b.version - a.version)
    .map(version => ({ id: version.id, label: `${model.name} · v${version.version} · ${version.fileName}`, version })));
  const chosen = options.find(option => option.id === versionId) ?? options[0];
  const storeys = report?.storeys ?? [];
  // Trocar de versão pode tirar de cena o pavimento escolhido; aí o recorte volta a "todos".
  const activeStorey = storeys.includes(storey) ? storey : '';
  const label = job && report
    ? `Modelo ${job.label} em 3D com ${count(report.elements)} elementos. Os números e a seleção abaixo trazem a mesma informação em texto.`
    : 'Nenhum modelo carregado. Escolha uma versão e use o botão Carregar modelo.';

  return <section data-tour="ifc-viewer" className="panel mt-8 overflow-hidden">
    <div className="border-b border-slate-100 px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Boxes size={15} className="text-blue-600" />Visualizador</h2>
      <p className="mt-0.5 text-xs text-slate-500">Abre em 3D uma versão já armazenada no repositório, para navegar pelo modelo e inspecionar os elementos.</p>
    </div>

    {options.length === 0
      ? <div className="p-5"><Empty>Nenhuma versão armazenada nesta obra. Envie um arquivo IFC em um dos modelos acima e ele aparecerá aqui para visualização.</Empty></div>
      : <div className="p-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Versão do modelo</span>
              <select className="field w-full sm:w-96" value={chosen?.id ?? ''} disabled={busy} onChange={event => setVersionId(event.target.value)}>
                {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Recorte por pavimento</span>
              <select className="field w-52" value={activeStorey} disabled={busy || storeys.length === 0} onChange={event => setStorey(event.target.value)}>
                <option value="">Todos os pavimentos</option>
                {storeys.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <button type="button" className="button" disabled={busy || !webgl || !chosen}
              onClick={() => {
                if (!chosen) return;
                setStep('Buscando o arquivo…'); setFailure('');
                setJob({ versionId: chosen.id, label: chosen.label, version: chosen.version.version, fileName: chosen.version.fileName, fileSize: chosen.version.fileSize, createdAt: chosen.version.createdAt });
              }}>
              <Play size={15} />{job ? 'Recarregar modelo' : 'Carregar modelo'}
            </button>
          </div>

          {busy && <p role="status" className="mt-3 text-xs font-semibold text-blue-700">{step}</p>}
          {failure && <div className="mt-3"><Callout tone="danger" role="alert">{failure}</Callout></div>}
          {report?.meshes === 0 && <div className="mt-3"><Callout tone="warning" role="status">O arquivo abriu, mas o leitor não gerou geometria para {report.declared > 0 ? `nenhum dos ${count(report.declared)} elementos declarados nele` : 'nenhum elemento'}. Não há nada para desenhar nesta versão — a cena continua vazia de propósito.</Callout></div>}

          {job && report && <>
            <div className="my-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Elementos carregados" value={count(report.elements)} tone={report.elements === 0 ? 'warning' : 'default'} />
              <StatCard label="Pavimentos encontrados" value={report.storeys.length} />
              <StatCard label="Arquivo" value={<span className="block text-sm leading-5 break-all">{job.fileName}
                <span className="mt-0.5 block text-xs font-normal text-slate-500">{megabytes(job.fileSize)} · v{job.version} enviada em {formatTimestamp(job.createdAt)}</span></span>} />
            </div>
            {report.meshes > 0 && <p className="mb-4 text-xs text-slate-500">
              {count(report.meshes)} {report.meshes === 1 ? 'malha desenhada' : 'malhas desenhadas'}
              {report.declared > 0 ? ` para ${count(report.elements)} de ${count(report.declared)} elementos declarados no arquivo.` : ` para ${count(report.elements)} ${report.elements === 1 ? 'elemento' : 'elementos'} com geometria.`}
              {report.withoutStorey > 0 && ` ${count(report.withoutStorey)} ${report.withoutStorey === 1 ? 'elemento não tem pavimento' : 'elementos não têm pavimento'} na estrutura espacial e ${report.withoutStorey === 1 ? 'fica' : 'ficam'} fora de qualquer recorte por pavimento.`}
            </p>}
          </>}

          <div ref={setBox} className="relative h-[600px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <canvas ref={setCanvas} role="img" aria-label={label} className="block h-full w-full" />
            {!webgl && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">
              Este navegador não tem WebGL disponível, então o modelo 3D não pode ser desenhado. Os pavimentos e a contagem de elementos de cada versão continuam na tabela de modelos acima.
            </p>}
            {webgl && busy && <p className="absolute inset-x-0 top-0 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900">{step}</p>}
            {webgl && !busy && failure && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">{failure}</p>}
            {webgl && !busy && !failure && !job && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-500">
              Nenhum modelo carregado. Escolha uma versão e use &quot;Carregar modelo&quot; — os arquivos IFC são grandes e só são baixados quando você pede.
            </p>}
          </div>

          <div className="mt-4">
            {picked
              ? <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow">Elemento selecionado · linha #{picked.expressID}</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{picked.ifcClass || 'Classe IFC não identificada no arquivo'}</p>
                    </div>
                    <button type="button" className="button-ghost" onClick={() => setPicked(undefined)}><Eraser size={15} />Limpar seleção</button>
                  </div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                    {[['Name', picked.name, 'sem Name no arquivo'], ['GlobalId', picked.globalId, 'sem GlobalId no arquivo'], ['Pavimento', picked.storey, 'sem pavimento na estrutura espacial']].map(([field, value, missing]) =>
                      <div key={field}>
                        <dt className="text-xs font-medium text-slate-500">{field}</dt>
                        <dd className={`text-sm break-all ${value ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{value || missing}</dd>
                      </div>)}
                  </dl>
                  <p className="mt-3 text-xs text-slate-500">Só o que o arquivo informa sobre este elemento: a classe IFC, o Name, o GlobalId e o pavimento resolvido pela estrutura espacial. Nenhuma outra propriedade é lida nem inferida.</p>
                </div>
              : <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <MousePointerClick size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  Arraste para orbitar, use a roda para aproximar e clique num elemento para ver a classe IFC, o Name, o GlobalId e o pavimento que o arquivo declara.
                </p>}
          </div>
        </div>}
  </section>;
}

'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FlatMesh, IfcAPI } from 'web-ifc';
import type { LinkRule } from '@/domain/entities';
import { serviceForElement, type ElementFacts } from '@/domain/rules';

export interface ViewerService { name: string; color: string; percent: number | undefined }
export interface ViewerJob { token: number; versions: { id: string; label: string }[] }

const NEUTRAL = '#94a3b8';
const CHUNK = 250;
const pause = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

interface Stage { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; root: THREE.Group; zUp: THREE.Group; placeholder: THREE.MeshLambertMaterial }
interface Loaded { mesh: THREE.Mesh; facts: ElementFacts }

function idsOfType(api: IfcAPI, modelID: number, type: number) {
  const found: number[] = [];
  try {
    const vector = api.GetLineIDsWithType(modelID, type);
    for (let i = 0; i < vector.size(); i++) found.push(vector.get(i));
  } catch { /* tipo inexistente no schema do arquivo */ }
  return found;
}
const asList = (value: unknown) => (Array.isArray(value) ? value : value ? [value] : []) as { value?: number }[];
const line = (api: IfcAPI, modelID: number, id: number) => { try { return api.GetLine(modelID, id); } catch { return undefined; } };
const typeNameOf = (api: IfcAPI, modelID: number, expressID: number) => {
  try { return String(api.GetNameFromTypeCode(api.GetLineType(modelID, expressID)) ?? ''); } catch { return ''; }
};

/** `ElementFacts.pavimento` sai da estrutura espacial: IFCRELCONTAINEDINSPATIALSTRUCTURE liga o
 * elemento a um espaço/pavimento, e IFCRELAGGREGATES permite subir de um espaço até o pavimento. */
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

/** `ElementFacts.tipo` é a classe IFC do elemento, lida dos tipos presentes no arquivo. */
function readElements(api: IfcAPI, modelID: number) {
  const tipoOf = new Map<number, string>();
  for (const type of api.GetAllTypesOfModel(modelID)) {
    if (!api.IsIfcElement(type.typeID)) continue;
    for (const id of idsOfType(api, modelID, type.typeID)) tipoOf.set(id, type.typeName);
  }
  return tipoOf;
}

/** Avanço parcial vira tom e opacidade do serviço inteiro. Nunca "feito/não feito" por elemento:
 * o percentual é do serviço e não diz quais elementos foram executados. */
function materialFor(service: ViewerService | undefined) {
  if (!service) return new THREE.MeshLambertMaterial({ color: NEUTRAL, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const full = new THREE.Color(service.color);
  const pale = full.clone().lerp(new THREE.Color('#ffffff'), 0.78);
  const ratio = Math.min(1, Math.max(0, (service.percent ?? 0) / 100));
  const opacity = 0.32 + 0.68 * ratio;
  return new THREE.MeshLambertMaterial({ color: new THREE.Color().lerpColors(pale, full, ratio), transparent: opacity < 1, opacity, depthWrite: opacity > 0.85, side: THREE.DoubleSide });
}

export function FourDViewer({ job, rules, services, storey, onReport, onError }: {
  job: ViewerJob | undefined;
  rules: LinkRule[];
  services: ViewerService[];
  storey: string;
  onReport: (report: { elements: number; linked: number }) => void;
  onError: (message: string) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<Stage | undefined>(undefined);
  const loadedRef = useRef<Loaded[]>([]);
  const materialsRef = useRef<THREE.MeshLambertMaterial[]>([]);
  const [webgl, setWebgl] = useState(true);
  const [painted, setPainted] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
    catch { setWebgl(false); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(box.clientWidth || 1, box.clientHeight || 1, false);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8fafc');
    const camera = new THREE.PerspectiveCamera(55, (box.clientWidth || 1) / (box.clientHeight || 1), 0.1, 5000);
    camera.position.set(30, 24, 30);
    scene.add(new THREE.HemisphereLight('#ffffff', '#cbd5e1', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.4);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);
    const fill = new THREE.DirectionalLight('#ffffff', 0.6);
    fill.position.set(-1.5, 0.8, -1);
    scene.add(fill);
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    // IFC é Z para cima; three é Y para cima.
    const zUp = new THREE.Group();
    zUp.rotation.x = -Math.PI / 2;
    zUp.matrixAutoUpdate = false;
    zUp.updateMatrix();
    root.add(zUp);
    scene.add(root);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    const placeholder = new THREE.MeshLambertMaterial({ color: NEUTRAL, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    stageRef.current = { renderer, scene, camera, controls, root, zUp, placeholder };
    renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
    const observer = new ResizeObserver(() => {
      const width = box.clientWidth || 1;
      const height = box.clientHeight || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    observer.observe(box);
    return () => {
      observer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      for (const { mesh } of loadedRef.current) mesh.geometry.dispose();
      loadedRef.current = [];
      for (const material of materialsRef.current) material.dispose();
      materialsRef.current = [];
      placeholder.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      stageRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (!job) return;
    const stage = stageRef.current;
    if (!stage) { onError('Este navegador não conseguiu iniciar o WebGL, então o modelo não pode ser desenhado. Use a tabela de serviços por vagão abaixo.'); return; }
    let cancelled = false;
    let api: IfcAPI | undefined;
    const open: number[] = [];

    const run = async () => {
      setBusy(true); setFailure(''); onError(''); onReport({ elements: 0, linked: 0 });
      for (const { mesh } of loadedRef.current) { stage.zUp.remove(mesh); mesh.geometry.dispose(); }
      loadedRef.current = [];
      stage.root.position.set(0, 0, 0);
      stage.root.updateMatrix();
      setPainted(count => count + 1);
      try {
        setMessage('Iniciando o leitor de IFC…');
        const ifc = await import('web-ifc');
        if (cancelled) return;
        api = new ifc.IfcAPI();
        api.SetWasmPath('/wasm/', true);
        // Thread única: só `web-ifc.wasm` é publicado em /wasm/, a variante multithread não.
        await api.Init(undefined, true);
        if (cancelled) return;
        for (const [index, version] of job.versions.entries()) {
          const of = `${index + 1}/${job.versions.length}`;
          setMessage(`Baixando ${version.label} (${of})…`);
          const signed = await fetch(`/api/ifc/download-url?versionId=${encodeURIComponent(version.id)}`, { cache: 'no-store' });
          const body = await signed.json().catch(() => ({}));
          if (cancelled) return;
          if (!signed.ok || !body?.url) throw new Error(body?.error ?? `Não foi possível liberar o arquivo de ${version.label}.`);
          const file = await fetch(String(body.url));
          if (cancelled) return;
          if (!file.ok) throw new Error(`Não foi possível baixar o arquivo de ${version.label}.`);
          const buffer = await file.arrayBuffer();
          if (cancelled) return;
          setMessage(`Abrindo ${version.label} (${of})…`);
          await pause();
          if (cancelled) return;
          const modelID = api.OpenModel(new Uint8Array(buffer));
          if (modelID < 0) throw new Error(`O arquivo de ${version.label} não pôde ser lido como IFC.`);
          open.push(modelID);
          const storeyOf = readStoreys(ifc, api, modelID);
          const tipoOf = readElements(api, modelID);
          const ids = [...tipoOf.keys()];
          const addFlat = (flat: FlatMesh, tipo: string) => {
            const facts: ElementFacts = { pavimento: storeyOf.get(flat.expressID) ?? '', tipo };
            for (let part = 0; part < flat.geometries.size(); part++) {
              const placed = flat.geometries.get(part);
              const source = api!.GetGeometry(modelID, placed.geometryExpressID);
              const vertices = api!.GetVertexArray(source.GetVertexData(), source.GetVertexDataSize());
              const indices = api!.GetIndexArray(source.GetIndexData(), source.GetIndexDataSize());
              source.delete();
              if (!indices.length || !vertices.length) continue;
              const geometry = new THREE.BufferGeometry();
              const interleaved = new THREE.InterleavedBuffer(vertices, 6); // posição (3) + normal (3) por vértice
              geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
              geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleaved, 3, 3));
              geometry.setIndex(new THREE.BufferAttribute(indices, 1));
              const mesh = new THREE.Mesh(geometry, stage.placeholder);
              mesh.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
              mesh.matrixAutoUpdate = false;
              mesh.matrixWorldNeedsUpdate = true;
              stage.zUp.add(mesh);
              loadedRef.current.push({ mesh, facts });
            }
          };
          // Em lotes para dar progresso e devolver a thread ao navegador; sem lista de elementos
          // (schema inesperado) o fallback carrega tudo de uma vez.
          for (let at = 0; at < ids.length; at += CHUNK) {
            if (cancelled) return;
            api.StreamMeshes(modelID, ids.slice(at, at + CHUNK), flat => addFlat(flat, tipoOf.get(flat.expressID) ?? ''));
            setMessage(`Processando ${version.label} (${of}): ${Math.min(at + CHUNK, ids.length)} de ${ids.length} elementos…`);
            await pause();
          }
          if (!ids.length) {
            setMessage(`Processando ${version.label} (${of})…`);
            await pause();
            if (cancelled) return;
            api.StreamAllMeshes(modelID, flat => addFlat(flat, typeNameOf(api!, modelID, flat.expressID)));
          }
          api.CloseModel(modelID);
          open.splice(open.indexOf(modelID), 1);
          if (cancelled) return;
          setPainted(count => count + 1);
        }
        stage.root.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(stage.zUp);
        if (!bounds.isEmpty()) {
          const center = bounds.getCenter(new THREE.Vector3());
          const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 1);
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
        setMessage('');
        setPainted(count => count + 1);
      } catch (error) {
        if (cancelled) return;
        const text = error instanceof Error && error.message ? error.message : 'Não foi possível carregar o modelo federado.';
        setFailure(text); setMessage(''); onError(text);
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    run();

    return () => {
      cancelled = true;
      for (const modelID of open) { try { api?.CloseModel(modelID); } catch { /* modelo já liberado */ } }
    };
  }, [job, onError, onReport]);

  useEffect(() => {
    if (!stageRef.current) return;
    const cache = new Map<string, THREE.MeshLambertMaterial>();
    const byName = new Map(services.map(service => [service.name, service]));
    let linked = 0;
    for (const { mesh, facts } of loadedRef.current) {
      mesh.visible = !storey || facts.pavimento === storey;
      const name = serviceForElement(rules, facts);
      if (name) linked++;
      const service = name ? byName.get(name) : undefined;
      const key = service ? `${service.color}:${service.percent ?? 'x'}` : 'neutro';
      let material = cache.get(key);
      if (!material) { material = materialFor(service); cache.set(key, material); }
      mesh.material = material;
    }
    for (const old of materialsRef.current) old.dispose();
    materialsRef.current = [...cache.values()];
    onReport({ elements: loadedRef.current.length, linked });
  }, [painted, storey, services, rules, onReport]);

  return <div ref={boxRef} className="relative h-[520px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
    <canvas ref={canvasRef} className="block h-full w-full" aria-label="Modelo federado colorido por serviço vinculado por regra" role="img" />
    {!webgl && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">
      Este navegador não tem WebGL disponível, então o modelo 3D não pode ser desenhado. A tabela de serviços por vagão abaixo traz a mesma informação de avanço por data.
    </p>}
    {webgl && busy && <p role="status" className="absolute inset-x-0 top-0 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900">{message || 'Carregando o modelo federado…'}</p>}
    {webgl && !busy && failure && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">{failure}</p>}
    {webgl && !busy && !failure && !job && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-500">
      Nenhum modelo carregado. Escolha as versões do conjunto federado e use &quot;Carregar modelo&quot; — os arquivos IFC são grandes e só são baixados quando você pede.
    </p>}
  </div>;
}

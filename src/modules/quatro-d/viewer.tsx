'use client';
import { useEffect, useRef, useState } from 'react';
import type * as ThreeNS from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LinkRule } from '@/domain/entities';
import { serviceForElement, type ElementFacts } from '@/domain/rules';
import { readBoxes, NO_CLASS, NO_STOREY, type BoxRow } from '@/modules/ifc/box-source';

type Three = typeof ThreeNS;
export interface ViewerService { name: string; color: string; percent: number | undefined }
export interface ViewerJob { token: number; versions: { id: string; label: string }[] }

const NEUTRAL = '#94a3b8';
// Caixa de espessura zero (elemento plano na transcrição) desapareceria com escala 0.
const MIN_SIZE = 1e-4;
const NO_SERVICE = '';
const count = (value: number) => value.toLocaleString('pt-BR');
const pause = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

interface Stage { three: Three; renderer: ThreeNS.WebGLRenderer; scene: ThreeNS.Scene; camera: ThreeNS.PerspectiveCamera; controls: OrbitControls; root: ThreeNS.Group; zUp: ThreeNS.Group; geometry: ThreeNS.BoxGeometry }
/** Um lote por par pavimento + serviço: o recorte por pavimento vira `.visible` e a cor do serviço
 * vira a troca de um material só, sem remontar a cena quando a data da consulta muda. */
interface Bucket { storey: string; service: string; mesh: ThreeNS.InstancedMesh }

/** A regra casa com o que o arquivo diz do elemento. A transcrição dá nome à ausência para poder
 * filtrar por ela na tela; aqui a ausência volta a ser vazia, que é o que a regra entende. */
const factsOf = (row: BoxRow): ElementFacts => ({
  pavimento: row.storey === NO_STOREY ? '' : row.storey,
  tipo: row.ifcClass === NO_CLASS ? '' : row.ifcClass,
});

/** Avanço parcial vira tom e opacidade do serviço inteiro. Nunca "feito/não feito" por elemento:
 * o percentual é do serviço e não diz quais elementos foram executados. */
function materialFor(three: Three, service: ViewerService | undefined) {
  if (!service) return new three.MeshLambertMaterial({ color: NEUTRAL, transparent: true, opacity: 0.22, depthWrite: false });
  const full = new three.Color(service.color);
  const pale = full.clone().lerp(new three.Color('#ffffff'), 0.78);
  const ratio = Math.min(1, Math.max(0, (service.percent ?? 0) / 100));
  const opacity = 0.32 + 0.68 * ratio;
  return new three.MeshLambertMaterial({ color: new three.Color().lerpColors(pale, full, ratio), transparent: opacity < 1, opacity, depthWrite: opacity > 0.85 });
}

export function FourDViewer({ job, rules, services, storey, onReport, onError }: {
  job: ViewerJob | undefined;
  rules: LinkRule[];
  services: ViewerService[];
  storey: string;
  onReport: (report: { elements: number; linked: number }) => void;
  onError: (message: string) => void;
}) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState(true);
  const [rows, setRows] = useState<BoxRow[]>();
  const [flat, setFlat] = useState(false);
  const [built, setBuilt] = useState(0);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const stageRef = useRef<Stage | undefined>(undefined);
  const bucketsRef = useRef<Bucket[]>([]);
  const materialsRef = useRef<ThreeNS.MeshLambertMaterial[]>([]);
  const busy = message !== '';

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
      scene.background = new three.Color('#f8fafc');
      const camera = new three.PerspectiveCamera(55, width() / height(), 0.1, 5000);
      camera.position.set(30, 24, 30);
      scene.add(new three.HemisphereLight('#ffffff', '#cbd5e1', 2.2));
      const sun = new three.DirectionalLight('#ffffff', 1.4);
      sun.position.set(1, 2, 1.5);
      scene.add(sun);
      const fill = new three.DirectionalLight('#ffffff', 0.6);
      fill.position.set(-1.5, 0.8, -1);
      scene.add(fill);
      const root = new three.Group();
      root.matrixAutoUpdate = false;
      // A tabela guarda a caixa no eixo do arquivo, com Z na vertical; o three usa Y.
      const zUp = new three.Group();
      zUp.rotation.x = -Math.PI / 2;
      zUp.matrixAutoUpdate = false;
      zUp.updateMatrix();
      root.add(zUp);
      scene.add(root);
      const orbit = new controls.OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.08;
      const geometry = new three.BoxGeometry(1, 1, 1);
      stageRef.current = { three, renderer, scene, camera, controls: orbit, root, zUp, geometry };
      renderer.setAnimationLoop(() => { orbit.update(); renderer.render(scene, camera); });
      const observer = new ResizeObserver(() => {
        camera.aspect = width() / height();
        camera.updateProjectionMatrix();
        renderer.setSize(width(), height(), false);
      });
      observer.observe(box);
      setReady(true);

      teardown = () => {
        observer.disconnect();
        renderer.setAnimationLoop(null);
        orbit.dispose();
        for (const bucket of bucketsRef.current) bucket.mesh.dispose();
        bucketsRef.current = [];
        for (const material of materialsRef.current) material.dispose();
        materialsRef.current = [];
        geometry.dispose();
        scene.clear();
        renderer.dispose();
        renderer.forceContextLoss();
        stageRef.current = undefined;
      };
    };
    build();

    return () => { dropped = true; setReady(false); teardown?.(); };
  }, [box, canvas]);

  // Leitura: a geometria do conjunto federado vem da transcrição das versões escolhidas.
  useEffect(() => {
    if (!job || !ready) return;
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      setFailure(''); onError(''); setRows(undefined); setFlat(false);
      setMessage('Lendo a geometria transcrita…');
      try {
        const { rows: read, declared } = await readBoxes(job.versions.map(version => version.id), controller.signal, (done, total) => {
          setMessage(total > 0 ? `Lendo ${count(done)} de ${count(total)} elementos…` : 'Lendo a geometria transcrita…');
        });
        if (cancelled) return;
        setFlat(declared === 0);
        setRows(read);
      } catch (cause) {
        if (cancelled || controller.signal.aborted) return;
        const text = cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o modelo federado.';
        setFailure(text); onError(text);
      } finally {
        if (!cancelled) setMessage('');
      }
    };
    run();

    return () => { cancelled = true; controller.abort(); };
  }, [job, ready, onError]);

  // Montagem: o serviço de cada elemento sai das regras, então a cena é remontada quando as
  // regras mudam — nunca quando só a data muda, que é troca de material.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !rows) return;
    const { three } = stage;
    for (const bucket of bucketsRef.current) { stage.zUp.remove(bucket.mesh); bucket.mesh.dispose(); }
    bucketsRef.current = [];
    stage.root.position.set(0, 0, 0);
    stage.root.updateMatrix();
    if (!rows.length) { onReport({ elements: 0, linked: 0 }); setBuilt(token => token + 1); return; }

    const groups = new Map<string, { storey: string; service: string; rows: BoxRow[] }>();
    let linked = 0;
    for (const row of rows) {
      const service = serviceForElement(rules, factsOf(row)) ?? NO_SERVICE;
      if (service !== NO_SERVICE) linked++;
      const key = `${row.storey} ${service}`;
      const group = groups.get(key);
      if (group) group.rows.push(row); else groups.set(key, { storey: row.storey, service, rows: [row] });
    }
    // Modelo georreferenciado guarda coordenadas na ordem dos milhões e a matriz de instância é
    // float32: sem trazer o conjunto para a origem, as caixas tremeriam e brigariam no depth.
    const origin = [0, 1, 2].map(axis => {
      let low = Infinity, high = -Infinity;
      for (const row of rows) { low = Math.min(low, row.min[axis]); high = Math.max(high, row.max[axis]); }
      return Number.isFinite(low) ? (low + high) / 2 : 0;
    });
    const matrix = new three.Matrix4();
    const placeholder = materialFor(three, undefined);
    for (const group of groups.values()) {
      const mesh = new three.InstancedMesh(stage.geometry, placeholder, group.rows.length);
      for (const [index, row] of group.rows.entries()) {
        matrix.makeScale(
          Math.max(row.max[0] - row.min[0], MIN_SIZE),
          Math.max(row.max[1] - row.min[1], MIN_SIZE),
          Math.max(row.max[2] - row.min[2], MIN_SIZE),
        );
        matrix.setPosition(
          (row.min[0] + row.max[0]) / 2 - origin[0],
          (row.min[1] + row.max[1]) / 2 - origin[1],
          (row.min[2] + row.max[2]) / 2 - origin[2],
        );
        mesh.setMatrixAt(index, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      stage.zUp.add(mesh);
      bucketsRef.current.push({ storey: group.storey, service: group.service, mesh });
    }
    materialsRef.current = [placeholder];

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
    onReport({ elements: rows.length, linked });
    setBuilt(token => token + 1);
  }, [rows, rules, onReport]);

  // Pintura: trocar a data da consulta muda o percentual de cada serviço, e com ele o tom.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !built) return;
    const byName = new Map(services.map(service => [service.name, service]));
    const cache = new Map<string, ThreeNS.MeshLambertMaterial>();
    for (const bucket of bucketsRef.current) {
      bucket.mesh.visible = !storey || bucket.storey === storey;
      const service = bucket.service === NO_SERVICE ? undefined : byName.get(bucket.service);
      const key = service ? `${service.color}:${service.percent ?? 'x'}` : 'neutro';
      let material = cache.get(key);
      if (!material) { material = materialFor(stage.three, service); cache.set(key, material); }
      bucket.mesh.material = material;
    }
    for (const old of materialsRef.current) old.dispose();
    materialsRef.current = [...cache.values()];
  }, [built, services, storey]);

  const empty = rows && rows.length === 0;
  return <div ref={setBox} className="relative h-[520px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
    <canvas ref={setCanvas} className="block h-full w-full" aria-label="Modelo federado colorido por serviço vinculado por regra" role="img" />
    {!webgl && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">
      Este navegador não tem WebGL disponível, então o modelo 3D não pode ser desenhado. A tabela de serviços por vagão abaixo traz a mesma informação de avanço por data.
    </p>}
    {webgl && busy && <p role="status" className="absolute inset-x-0 top-0 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900">{message}</p>}
    {webgl && !busy && failure && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">{failure}</p>}
    {webgl && !busy && !failure && empty && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">
      {flat
        ? 'As versões escolhidas têm dados transcritos, mas nenhuma representação geométrica — o que é válido num IFC e não é falha. A tabela de serviços por vagão abaixo traz o avanço por data; para ter a cena 3D, envie uma versão do modelo que inclua geometria.'
        : 'Nenhuma caixa envolvente utilizável nas versões escolhidas. Reenvie o modelo em Modelos IFC para transcrever a geometria de novo.'}
    </p>}
    {webgl && !busy && !failure && !job && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-500">
      Nenhum modelo carregado. Escolha as versões do conjunto federado e use &quot;Carregar modelo&quot; — a geometria transcrita é lida do banco quando você pede.
    </p>}
  </div>;
}

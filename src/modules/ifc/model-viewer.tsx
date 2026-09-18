'use client';
import { useEffect, useRef, useState } from 'react';
import { Boxes, Eraser, MousePointerClick, Play } from 'lucide-react';
import type * as ThreeNS from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, StatCard } from '@/modules/planejamento/ui';
import { formatTimestamp } from '@/shared/format';

type Three = typeof ThreeNS;
type Raw = Record<string, unknown>;
type Paint = 'pavimento' | 'classe';

const NO_STOREY = 'Sem pavimento';
const NO_CLASS = 'Sem classe IFC';
const HIGHLIGHT = '#f59e0b';
// Caixa de espessura zero (elemento plano na transcrição) desapareceria com escala 0.
const MIN_SIZE = 1e-4;
const pause = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });
const count = (value: number) => value.toLocaleString('pt-BR');
const byText = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
// Coluna `numeric` do Postgres chega como string no JSON: todo número da resposta passa por Number().
const num = (value: unknown) => Number(value);
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** A cor sai de um hash do próprio nome: o mesmo pavimento (ou a mesma classe) mantém a cor
 * entre versões, recargas e sessões, sem nenhuma tabela de cores para manter. */
function hueOf(name: string) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) { hash ^= name.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 360;
}
const cssColor = (name: string) => `hsl(${hueOf(name)} 58% 52%)`;

interface Stage { three: Three; renderer: ThreeNS.WebGLRenderer; scene: ThreeNS.Scene; camera: ThreeNS.PerspectiveCamera; controls: OrbitControls; root: ThreeNS.Group; zUp: ThreeNS.Group; geometry: ThreeNS.BoxGeometry; material: ThreeNS.MeshLambertMaterial }
interface Row { expressId: number; globalId: string; ifcClass: string; name: string; storey: string; min: [number, number, number]; max: [number, number, number] }
interface Bucket { storey: string; mesh: ThreeNS.InstancedMesh; rows: Row[] }
interface Job { versionId: string; label: string; version: number; fileName: string; createdAt: string }
interface Tally { name: string; total: number }
interface Report { elements: number; declared: number; storeys: Tally[]; classes: Tally[] }
interface Picked { storey: string; index: number; row: Row }

/** A geometria vem da transcrição, não do arquivo: cada elemento é a caixa envolvente gravada na
 * tabela. O IFC inteiro esbarraria no limite por arquivo do Storage e travaria o navegador; seis
 * números por elemento cabem numa consulta paginada. */
async function readBoxes(versionId: string, signal: AbortSignal, onProgress: (read: number, total: number) => void) {
  const rows: Row[] = [];
  let read = 0;
  for (let page = 0; ; page++) {
    const res = await fetch(`/api/ifc/elements?versionId=${encodeURIComponent(versionId)}&geometria=1&pagina=${page}`, { cache: 'no-store', signal });
    const body: Raw = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(text(body.error) || 'Não foi possível ler a geometria transcrita desta versão.');
    const batch = Array.isArray(body.elementos) ? body.elementos as Raw[] : [];
    const total = num(body.total) || 0;
    const size = num(body.porPagina) || batch.length;
    read += batch.length;
    for (const item of batch) {
      const min: [number, number, number] = [num(item.min_x), num(item.min_y), num(item.min_z)];
      const max: [number, number, number] = [num(item.max_x), num(item.max_y), num(item.max_z)];
      if (![...min, ...max].every(Number.isFinite)) continue;
      rows.push({
        expressId: num(item.express_id), globalId: text(item.global_id),
        ifcClass: text(item.ifc_class) || NO_CLASS, name: text(item.name),
        storey: text(item.storey) || NO_STOREY, min, max,
      });
    }
    onProgress(read, total);
    if (!batch.length || !size || (page + 1) * size >= total) return { rows, declared: total };
  }
}

function tally(names: string[]) {
  const totals = new Map<string, number>();
  for (const name of names) totals.set(name, (totals.get(name) ?? 0) + 1);
  return [...totals.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total || byText(a.name, b.name));
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
  const [paint, setPaint] = useState<Paint>('pavimento');
  const [picked, setPicked] = useState<Picked>();
  const stageRef = useRef<Stage | undefined>(undefined);
  const bucketsRef = useRef<Bucket[]>([]);
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
      const fill = new three.DirectionalLight('#ffffff', 0.6);
      fill.position.set(-1.5, 0.8, -1);
      scene.add(fill);
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
      // Uma caixa unitária e um material branco servem a cena inteira: a cor de cada elemento é
      // cor de instância, que multiplica a do material.
      const geometry = new three.BoxGeometry(1, 1, 1);
      const material = new three.MeshLambertMaterial({ color: '#ffffff' });
      stageRef.current = { three, renderer, scene, camera, controls: orbit, root, zUp, geometry, material };
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
        const visible = bucketsRef.current.filter(bucket => bucket.mesh.visible);
        const hit = raycaster.intersectObjects(visible.map(bucket => bucket.mesh), false)[0];
        const bucket = hit ? visible.find(item => item.mesh === hit.object) : undefined;
        const index = hit?.instanceId;
        const row = bucket && index !== undefined ? bucket.rows[index] : undefined;
        setPicked(bucket && index !== undefined && row ? { storey: bucket.storey, index, row } : undefined);
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
        geometry.dispose();
        material.dispose();
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
    const controller = new AbortController();
    let cancelled = false;
    const clear = () => {
      for (const bucket of bucketsRef.current) { stage.zUp.remove(bucket.mesh); bucket.mesh.dispose(); }
      bucketsRef.current = [];
    };

    const run = async () => {
      setFailure(''); setReport(undefined); setPicked(undefined); setStorey('');
      clear();
      stage.root.position.set(0, 0, 0);
      stage.root.updateMatrix();
      try {
        setStep('Lendo a geometria transcrita…');
        const { rows, declared } = await readBoxes(job.versionId, controller.signal, (read, total) => {
          setStep(total > 0 ? `Lendo ${count(read)} de ${count(total)} elementos…` : 'Lendo a geometria transcrita…');
        });
        if (cancelled) return;
        setStep(`Montando ${count(rows.length)} caixas…`);
        await pause();
        if (cancelled) return;

        const groups = new Map<string, Row[]>();
        for (const row of rows) {
          const list = groups.get(row.storey);
          if (list) list.push(row); else groups.set(row.storey, [row]);
        }
        // Modelo georreferenciado guarda coordenadas na ordem dos milhões e a matriz de instância é
        // float32: sem trazer o conjunto para a origem, as caixas tremeriam e brigariam no depth.
        const origin = [0, 1, 2].map(axis => {
          let low = Infinity, high = -Infinity;
          for (const row of rows) { low = Math.min(low, row.min[axis]); high = Math.max(high, row.max[axis]); }
          return Number.isFinite(low) ? (low + high) / 2 : 0;
        });
        const matrix = new three.Matrix4();
        const buckets: Bucket[] = [];
        for (const name of [...groups.keys()].sort(byText)) {
          const list = groups.get(name)!;
          // Uma InstancedMesh por pavimento: o recorte vira um `.visible`, sem remontar a cena.
          const mesh = new three.InstancedMesh(stage.geometry, stage.material, list.length);
          for (const [index, row] of list.entries()) {
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
          buckets.push({ storey: name, mesh, rows: list });
        }
        bucketsRef.current = buckets;

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
        setReport({ elements: rows.length, declared, storeys: tally(rows.map(row => row.storey)), classes: tally(rows.map(row => row.ifcClass)) });
        setStep('');
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        // Nada de meia cena em pé junto de uma mensagem de erro.
        clear();
        setFailure(error instanceof Error && error.message ? error.message : 'Não foi possível desenhar a geometria desta versão.');
        setStep('');
      }
    };
    run();

    return () => { cancelled = true; controller.abort(); clear(); };
  }, [job, ready]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const color = new stage.three.Color();
    for (const bucket of bucketsRef.current) {
      bucket.mesh.visible = !storey || bucket.storey === storey;
      for (const [index, row] of bucket.rows.entries()) {
        if (picked?.storey === bucket.storey && picked.index === index) color.set(HIGHLIGHT);
        else color.setHSL(hueOf(paint === 'classe' ? row.ifcClass : row.storey) / 360, 0.58, 0.52, stage.three.SRGBColorSpace);
        bucket.mesh.setColorAt(index, color);
      }
      if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
    }
  }, [report, storey, paint, picked]);

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
  const storeys = (report?.storeys ?? []).map(item => item.name).sort(byText);
  // Trocar de versão pode tirar de cena o pavimento escolhido; aí o recorte volta a "todos".
  const activeStorey = storeys.includes(storey) ? storey : '';
  const legend = paint === 'classe' ? report?.classes ?? [] : report?.storeys ?? [];
  const label = job && report
    ? `Caixas envolventes de ${count(report.elements)} elementos do modelo ${job.label}, coloridas por ${paint === 'classe' ? 'classe IFC' : 'pavimento'}. Os números, a legenda e a seleção abaixo trazem a mesma informação em texto.`
    : 'Nenhuma geometria carregada. Escolha uma versão e use o botão Carregar geometria.';

  return <section data-tour="ifc-viewer" className="panel mt-8 overflow-hidden">
    <div className="border-b border-slate-100 px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Boxes size={15} className="text-blue-600" />Visualizador</h2>
      <p className="mt-0.5 text-xs text-slate-500">Monta o 3D a partir das tabelas transcritas da versão: cada elemento entra como a caixa envolvente gravada no banco. O arquivo IFC não é baixado.</p>
    </div>

    {options.length === 0
      ? <div className="p-5"><Empty>Nenhuma versão armazenada nesta obra. Envie um arquivo IFC em um dos modelos acima e ele aparecerá aqui para visualização.</Empty></div>
      : <div className="p-5">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Versão do modelo</span>
              <select className="field w-full sm:w-96" aria-label="Versão do modelo a desenhar" value={chosen?.id ?? ''} disabled={busy} onChange={event => setVersionId(event.target.value)}>
                {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Recorte por pavimento</span>
              <select className="field w-52" aria-label="Recorte por pavimento" value={activeStorey} disabled={busy || storeys.length === 0} onChange={event => setStorey(event.target.value)}>
                <option value="">Todos os pavimentos</option>
                {storeys.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">Cor dos elementos</span>
              <select className="field w-44" aria-label="Critério de cor dos elementos" value={paint} disabled={busy} onChange={event => setPaint(event.target.value === 'classe' ? 'classe' : 'pavimento')}>
                <option value="pavimento">Por pavimento</option>
                <option value="classe">Por classe IFC</option>
              </select>
            </label>
            <button type="button" className="button" disabled={busy || !webgl || !chosen}
              onClick={() => {
                if (!chosen) return;
                setStep('Lendo a geometria transcrita…'); setFailure('');
                setJob({ versionId: chosen.id, label: chosen.label, version: chosen.version.version, fileName: chosen.version.fileName, createdAt: chosen.version.createdAt });
              }}>
              <Play size={15} />{job ? 'Recarregar geometria' : 'Carregar geometria'}
            </button>
          </div>

          {busy && <p role="status" className="mt-3 text-xs font-semibold text-blue-700">{step}</p>}
          {failure && <div className="mt-3"><Callout tone="danger" role="alert">{failure}</Callout></div>}
          {report?.declared === 0 && <div className="mt-3"><Callout tone="info" role="status">
            Esta versão tem dados transcritos, mas nenhum elemento com caixa envolvente gravada — sem representação geométrica não há o que desenhar. Isso é válido, não é falha: uma versão só de dados continua servindo às propriedades e ao quantitativo. Se a transcrição desta versão ainda não foi feita, transcreva o IFC na tela de modelos e volte aqui.
          </Callout></div>}

          {job && report && <>
            <div className="my-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Elementos desenhados" value={count(report.elements)} tone={report.elements === 0 ? 'warning' : 'default'} />
              <StatCard label="Pavimentos" value={report.storeys.length} />
              <StatCard label="Classes IFC distintas" value={report.classes.length} />
              <StatCard label="Versão" value={<span className="block text-sm leading-5 break-all">v{job.version}
                <span className="mt-0.5 block text-xs font-normal text-slate-500">{job.fileName} · enviada em {formatTimestamp(job.createdAt)}</span></span>} />
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Cada caixa é a envolvente do elemento na transcrição, não a sua malha: o contorno é aproximado de propósito, e é isso que permite abrir um modelo inteiro sem baixar o arquivo.
              {report.declared > report.elements && ` ${count(report.declared - report.elements)} ${report.declared - report.elements === 1 ? 'elemento ficou de fora porque a caixa gravada não é numérica' : 'elementos ficaram de fora porque a caixa gravada não é numérica'}.`}
            </p>
          </>}

          <div ref={setBox} className="relative h-[600px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <canvas ref={setCanvas} role="img" aria-label={label} className="block h-full w-full" />
            {!webgl && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">
              Este navegador não tem WebGL disponível, então o modelo 3D não pode ser desenhado. Os pavimentos e a contagem de elementos de cada versão continuam na tabela de modelos acima.
            </p>}
            {webgl && busy && <p role="status" className="absolute inset-x-0 top-0 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900">{step}</p>}
            {webgl && !busy && failure && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">{failure}</p>}
            {webgl && !busy && !failure && !job && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-500">
              Nenhuma geometria carregada. Escolha uma versão e use &quot;Carregar geometria&quot; — são milhares de linhas do banco, lidas só quando você pede.
            </p>}
          </div>

          {legend.length > 0 && <div className="mt-4">
            <p className="eyebrow">Legenda · {paint === 'classe' ? 'classe IFC' : 'pavimento'}</p>
            <ul className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto custom-scrollbar">
              {legend.map(item => <li key={item.name} className="badge-muted">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cssColor(item.name) }} />
                {item.name}
                <span className="font-normal tabular-nums text-slate-500">{count(item.total)}</span>
              </li>)}
            </ul>
          </div>}

          <div className="mt-4">
            {picked
              ? <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="eyebrow">Elemento selecionado · express id #{picked.row.expressId}</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{picked.row.ifcClass}</p>
                    </div>
                    <button type="button" className="button-ghost" aria-label="Limpar a seleção do elemento" onClick={() => setPicked(undefined)}><Eraser size={15} />Limpar seleção</button>
                  </div>
                  <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                    {[['Name', picked.row.name, 'sem Name na transcrição'], ['GlobalId', picked.row.globalId, 'sem GlobalId na transcrição'], ['Pavimento', picked.row.storey, '']].map(([field, value, missing]) =>
                      <div key={field}>
                        <dt className="text-xs font-medium text-slate-500">{field}</dt>
                        <dd className={`text-sm break-all ${value ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{value || missing}</dd>
                      </div>)}
                  </dl>
                  <p className="mt-3 text-xs text-slate-500">Só o que a transcrição guarda deste elemento: a classe IFC, o Name, o GlobalId, o pavimento e o express id. A caixa destacada em laranja é a envolvente dele, não a sua forma.</p>
                </div>
              : <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <MousePointerClick size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  Arraste para orbitar, use a roda para aproximar e clique numa caixa para ver a classe IFC, o Name, o GlobalId e o pavimento que a transcrição guarda.
                </p>}
          </div>
        </div>}
  </section>;
}

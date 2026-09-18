'use client';
import { useEffect, useRef, useState } from 'react';
import { Boxes, Eraser, MousePointerClick, Play } from 'lucide-react';
import type * as ThreeNS from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FragmentsModel, MaterialDefinition } from '@thatopen/fragments';
import { selectWorkPlanning } from '@/application/use-cases/get-planning';
import { usePlanning } from '@/modules/planejamento/planning-provider';
import { Callout, Empty, StatCard } from '@/modules/planejamento/ui';
import { formatTimestamp } from '@/shared/format';
import { readElementMap, type MapRow } from './element-map';
import { MissingGeometry, frame, loadFragments, type Federation, type FragmentsApi } from './fragments-stage';

type Three = typeof ThreeNS;
type Paint = 'pavimento' | 'classe';

const HIGHLIGHT = '#f59e0b';
const count = (value: number) => value.toLocaleString('pt-BR');
const byText = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });

/** A cor sai de um hash do próprio nome: o mesmo pavimento (ou a mesma classe) mantém a cor
 * entre versões, recargas e sessões, sem nenhuma tabela de cores para manter. */
function hueOf(name: string) {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) { hash ^= name.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 360;
}
const cssColor = (name: string) => `hsl(${hueOf(name)} 58% 52%)`;
const groupColor = (three: Three, name: string) => new three.Color().setHSL(hueOf(name) / 360, 0.58, 0.52, three.SRGBColorSpace);
/** Na geometria convertida não existe cor por instância para mexer: o que se pinta é um conjunto
 * de ids recebendo um material. `TWO` desenha as duas faces, senão a parede vista de dentro
 * desaparece no recorte por pavimento. */
const material = (api: FragmentsApi, color: ThreeNS.Color): MaterialDefinition => ({ color, opacity: 1, transparent: false, renderedFaces: api.RenderedFaces.TWO });

interface Stage { three: Three; renderer: ThreeNS.WebGLRenderer; scene: ThreeNS.Scene; camera: ThreeNS.PerspectiveCamera; controls: OrbitControls }
/** A federação carregada mais o mapa que liga a malha aos dados: `byLocal` responde ao clique,
 * os agrupamentos respondem à cor e ao recorte. */
interface Loaded extends Federation { model: FragmentsModel; byLocal: Map<number, MapRow>; byStorey: Map<string, number[]>; byClass: Map<string, number[]> }
interface Job { versionId: string; label: string; version: number; fileName: string; createdAt: string }
interface Tally { name: string; total: number }
interface Report { elements: number; declared: number; orphans: number; storeys: Tally[]; classes: Tally[] }
interface Picked { localId: number; row?: MapRow }
/** `geometry` diz de qual metade veio a falha: só a da malha permite oferecer a reconversão. */
/** `pending` é a versão que nunca foi convertida — dado em tabela sem malha. Isso não é falha,
 * é uma metade que falta, e só nesse caso reenviar o modelo resolve; erro de rede na mesma metade
 * não pede reenvio nenhum. Quem distingue os dois é o tipo do erro, não o texto da mensagem. */
interface Failure { message: string; pending: boolean }

const tally = (groups: Map<string, number[]>) => [...groups.entries()]
  .map(([name, ids]) => ({ name, total: ids.length }))
  .sort((a, b) => b.total - a.total || byText(a.name, b.name));

/** Sai da cena antes de morrer: o dispose é assíncrono e o modelo velho não pode ficar aparecendo
 * junto do novo nem deixar o worker pendurado. */
function discard(federation?: Federation) {
  if (!federation) return;
  for (const { model } of federation.models) model.object.removeFromParent();
  federation.fragments.dispose().catch(() => undefined);
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
  const [failure, setFailure] = useState<Failure>();
  const [report, setReport] = useState<Report>();
  const [storey, setStorey] = useState('');
  const [paint, setPaint] = useState<Paint>('pavimento');
  const [picked, setPicked] = useState<Picked>();
  const stageRef = useRef<Stage | undefined>(undefined);
  const loadRef = useRef<Loaded | undefined>(undefined);
  const pickedRef = useRef<Picked | undefined>(undefined);
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
      const orbit = new controls.OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.08;
      stageRef.current = { three, renderer, scene, camera, controls: orbit };
      renderer.setAnimationLoop(() => { orbit.update(); renderer.render(scene, camera); });

      // A malha convertida é servida em tiles: o que está na cena depende de onde a câmera está, e
      // quem troca os tiles é o `update`. Uma chamada por vez, porque o damping dispara `change` a
      // cada frame e a fila do worker não precisa engordar.
      let refreshing = false;
      const refresh = () => {
        const load = loadRef.current;
        if (!load || refreshing) return;
        refreshing = true;
        load.fragments.update().catch(() => undefined).finally(() => { refreshing = false; });
      };
      orbit.addEventListener('change', refresh);

      const observer = new ResizeObserver(() => {
        camera.aspect = width() / height();
        camera.updateProjectionMatrix();
        renderer.setSize(width(), height(), false);
      });
      observer.observe(box);

      let downX = 0, downY = 0;
      const onDown = (event: PointerEvent) => { downX = event.clientX; downY = event.clientY; };
      const onUp = async (event: PointerEvent) => {
        if (Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return; // arrastar orbita, não seleciona
        const load = loadRef.current;
        if (!load) return;
        // O raycast do Fragments quer a posição do ponteiro na tela, não em NDC: é ele quem projeta,
        // usando o retângulo do canvas que recebe em `dom`.
        const mouse = new three.Vector2(event.clientX, event.clientY);
        const hit = await load.model.raycast({ camera, mouse, dom: canvas }).catch(() => null);
        if (dropped || loadRef.current !== load) return;
        setPicked(hit ? { localId: hit.localId, row: load.byLocal.get(hit.localId) } : undefined);
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerup', onUp);
      setReady(true);

      teardown = () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        orbit.removeEventListener('change', refresh);
        observer.disconnect();
        renderer.setAnimationLoop(null);
        orbit.dispose();
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
    const controller = new AbortController();
    let cancelled = false;

    const run = async () => {
      setFailure(undefined); setReport(undefined); setPicked(undefined); setStorey('');
      let federation: Federation | undefined;
      let failed: Failure | undefined;
      const fail = (cause: unknown, geometry: boolean): never => {
        const fallback = geometry ? 'Não foi possível abrir a geometria convertida desta versão.' : 'Não foi possível ler os elementos transcritos desta versão.';
        failed ??= { message: cause instanceof Error && cause.message ? cause.message : fallback, pending: cause instanceof MissingGeometry };
        throw cause;
      };
      try {
        let geometry = 'Abrindo a geometria convertida…';
        let table = 'lendo os elementos transcritos…';
        const show = () => { if (!cancelled) setStep(`${geometry} · ${table}`); };
        show();
        // As duas metades da versão vêm juntas: a malha do Storage e a tabela do banco. Nenhuma
        // depende da outra até a hora de casar os GlobalIds, então esperar em série era só espera.
        const [loaded, map] = await Promise.all([
          loadFragments({
            scene: stage.scene, camera: stage.camera, signal: controller.signal,
            versions: [{ id: job.versionId, label: job.label }],
            onProgress: message => { geometry = message; show(); },
          }).then(result => { federation = result; geometry = 'Geometria convertida aberta'; show(); return result; }, cause => fail(cause, true)),
          readElementMap([job.versionId], controller.signal, (read, declared) => {
            table = declared > 0 ? `lendo ${count(read)} de ${count(declared)} elementos transcritos…` : 'lendo os elementos transcritos…';
            show();
          }).then(result => { table = 'elementos transcritos lidos'; show(); return result; }, cause => fail(cause, false)),
        ]);
        if (cancelled) { discard(loaded); return; }
        const model = loaded.models[0]?.model;
        if (!model) throw new Error('A geometria convertida desta versão voltou vazia.');

        setStep(`Casando ${count(map.rows.length)} elementos transcritos com a geometria…`);
        const locals = await model.getLocalIdsByGuids(map.rows.map(row => row.globalId));
        if (cancelled) { discard(loaded); return; }
        const byLocal = new Map<number, MapRow>();
        const byStorey = new Map<string, number[]>();
        const byClass = new Map<string, number[]>();
        const push = (index: Map<string, number[]>, key: string, localId: number) => {
          const list = index.get(key);
          if (list) list.push(localId); else index.set(key, [localId]);
        };
        for (const [index, localId] of locals.entries()) {
          const row = map.rows[index];
          // GlobalId sem par na malha: elemento transcrito que a conversão não desenha (espaço,
          // anotação, agrupamento). É contagem de tela, não falha.
          if (localId === null || !row) continue;
          byLocal.set(localId, row);
          push(byStorey, row.storey, localId);
          push(byClass, row.ifcClass, localId);
        }
        loadRef.current = { ...loaded, model, byLocal, byStorey, byClass };
        frame(stage.three, stage.camera, stage.controls, loaded.models);
        setReport({ elements: byLocal.size, declared: map.declared, orphans: map.rows.length - byLocal.size, storeys: tally(byStorey), classes: tally(byClass) });
        setStep('');
      } catch (cause) {
        discard(federation);
        if (cancelled || controller.signal.aborted) return;
        controller.abort(); // a outra metade ainda pode estar em voo
        setFailure(failed ?? { message: cause instanceof Error && cause.message ? cause.message : 'Não foi possível desenhar esta versão.', pending: cause instanceof MissingGeometry });
        setStep('');
      }
    };
    run();

    return () => {
      cancelled = true;
      controller.abort();
      discard(loadRef.current);
      loadRef.current = undefined;
    };
  }, [job, ready]);

  useEffect(() => {
    const stage = stageRef.current;
    const load = loadRef.current;
    if (!stage || !load || !report) return;
    let stale = false;
    const apply = async () => {
      const groups = paint === 'classe' ? load.byClass : load.byStorey;
      // Um resetHighlight antes: sem ele, a pintura do critério anterior fica nos ids que o novo
      // critério não alcança.
      await load.model.resetHighlight();
      for (const [name, ids] of groups) {
        if (stale) return;
        await load.model.highlight(ids, material(load.api, groupColor(stage.three, name)));
      }
      const chosen = pickedRef.current;
      if (chosen) await load.model.highlight([chosen.localId], material(load.api, new stage.three.Color(HIGHLIGHT)));
      if (storey) {
        // Esconder tudo e mostrar o pavimento cobre também o que a malha tem sem linha transcrita:
        // esse item não está em nenhum grupo e ficaria de pé no recorte.
        await load.model.setVisible(undefined, false);
        await load.model.setVisible(load.byStorey.get(storey) ?? [], true);
      } else await load.model.resetVisible();
      if (stale) return;
      await load.fragments.update(true);
    };
    apply().catch(() => undefined);
    return () => { stale = true; };
  }, [report, paint, storey]);

  useEffect(() => {
    const stage = stageRef.current;
    const load = loadRef.current;
    const previous = pickedRef.current;
    pickedRef.current = picked;
    if (!stage || !load || previous?.localId === picked?.localId) return;
    const apply = async () => {
      // O anterior volta à cor do grupo, não ao material de origem: um resetHighlight nele levaria
      // embora a pintura por pavimento ou classe.
      if (previous) {
        const row = load.byLocal.get(previous.localId);
        if (row) await load.model.highlight([previous.localId], material(load.api, groupColor(stage.three, paint === 'classe' ? row.ifcClass : row.storey)));
        else await load.model.resetHighlight([previous.localId]);
      }
      if (picked) await load.model.highlight([picked.localId], material(load.api, new stage.three.Color(HIGHLIGHT)));
      await load.fragments.update(true);
    };
    apply().catch(() => undefined);
  }, [picked, paint]);

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
    ? `Geometria convertida do modelo ${job.label} com ${count(report.elements)} elementos, colorida por ${paint === 'classe' ? 'classe IFC' : 'pavimento'}. Os números, a legenda e a seleção abaixo trazem a mesma informação em texto.`
    : 'Nenhuma geometria carregada. Escolha uma versão e use o botão Carregar geometria.';

  return <section data-tour="ifc-viewer" className="panel mt-8 overflow-hidden">
    <div className="border-b border-slate-100 px-5 py-3.5">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Boxes size={15} className="text-blue-600" />Visualizador</h2>
      <p className="mt-0.5 text-xs text-slate-500">Desenha a geometria convertida da versão, guardada no Storage e apontada pelo banco no envio; a classe, o nome e o pavimento de cada elemento vêm das tabelas transcritas e reencontram a malha pelo GlobalId. O arquivo IFC não é baixado nem lido no navegador.</p>
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
            {/* Sem cena montada não há para onde carregar: clicar antes do `three` chegar deixaria o
                progresso ligado esperando um estágio que pode nem existir, se o WebGL faltar. */}
            <button type="button" className="button" disabled={busy || !webgl || !ready || !chosen}
              onClick={() => {
                if (!chosen) return;
                setStep('Abrindo a geometria convertida…'); setFailure(undefined);
                setJob({ versionId: chosen.id, label: chosen.label, version: chosen.version.version, fileName: chosen.version.fileName, createdAt: chosen.version.createdAt });
              }}>
              <Play size={15} />{job ? 'Recarregar geometria' : 'Carregar geometria'}
            </button>
          </div>

          {busy && <p role="status" className="mt-3 text-xs font-semibold text-blue-700">{step}</p>}
          {failure && <div className="mt-3 space-y-2">
            <Callout tone="danger" role="alert">{failure.message}</Callout>
            {failure.pending && <Callout tone="info">Os dados transcritos desta versão continuam valendo para as propriedades e o quantitativo; o que falta aqui é a geometria 3D — reenviar o modelo em Modelos IFC gera a conversão.</Callout>}
          </div>}
          {report?.declared === 0 && <div className="mt-3"><Callout tone="info" role="status">
            A geometria desta versão abriu, mas ela não tem nenhum elemento transcrito: sem a tabela não há classe, nome nem pavimento para colorir, recortar ou mostrar no clique. Transcreva o IFC na tela de modelos e volte aqui.
          </Callout></div>}
          {report && report.declared > 0 && report.elements === 0 && <div className="mt-3"><Callout tone="warning" role="status">
            Nenhum dos {count(report.declared)} elementos transcritos foi encontrado na geometria convertida — os dois lados não compartilham GlobalId, sinal de que a transcrição e a conversão saíram de arquivos diferentes. Reenvie o modelo em Modelos IFC para refazer as duas metades a partir do mesmo IFC.
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
              O contorno é a malha do elemento como a conversão a gravou, não uma caixa envolvente: é o mesmo modelo do roteiro 4D, e é por isso que os dois concordam.
              {report.orphans > 0 && ` ${count(report.orphans)} ${report.orphans === 1 ? 'elemento transcrito não tem par na geometria convertida e ficou fora da cena' : 'elementos transcritos não têm par na geometria convertida e ficaram fora da cena'} — espaços, anotações e agrupamentos existem na tabela sem nada para desenhar.`}
            </p>
          </>}

          <div ref={setBox} className="relative h-[600px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            <canvas ref={setCanvas} role="img" aria-label={label} className="block h-full w-full" />
            {!webgl && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">
              Este navegador não tem WebGL disponível, então o modelo 3D não pode ser desenhado. Os pavimentos e a contagem de elementos de cada versão continuam na tabela de modelos acima.
            </p>}
            {webgl && busy && <p role="status" className="absolute inset-x-0 top-0 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900">{step}</p>}
            {webgl && !busy && failure && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">{failure.message}</p>}
            {webgl && !busy && !failure && !job && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-500">
              Nenhuma geometria carregada. Escolha uma versão e use &quot;Carregar geometria&quot; — são megabytes de malha convertida, baixados só quando você pede.
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
                      <p className="eyebrow">Elemento selecionado</p>
                      <p className="mt-1 text-sm font-bold text-slate-900">{picked.row?.ifcClass ?? 'Item sem linha transcrita'}</p>
                    </div>
                    <button type="button" className="button-ghost" aria-label="Limpar a seleção do elemento" onClick={() => setPicked(undefined)}><Eraser size={15} />Limpar seleção</button>
                  </div>
                  {picked.row
                    ? <>
                        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                          {[['Name', picked.row.name, 'sem Name na transcrição'], ['GlobalId', picked.row.globalId, ''], ['Pavimento', picked.row.storey, '']].map(([field, value, missing]) =>
                            <div key={field}>
                              <dt className="text-xs font-medium text-slate-500">{field}</dt>
                              <dd className={`text-sm break-all ${value ? 'font-semibold text-slate-800' : 'text-slate-400'}`}>{value || missing}</dd>
                            </div>)}
                        </dl>
                        <p className="mt-3 text-xs text-slate-500">A malha em destaque é a forma convertida deste elemento; a classe IFC, o Name e o pavimento vêm da linha transcrita que o GlobalId alcança.</p>
                      </>
                    : <p className="mt-3 text-xs text-slate-500">Esta peça está na geometria convertida mas não tem linha na transcrição desta versão (id local #{picked.localId}), então não há classe IFC, Name nem pavimento para mostrar.</p>}
                </div>
              : <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <MousePointerClick size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  Arraste para orbitar, use a roda para aproximar e clique num elemento para ver a classe IFC, o Name, o GlobalId e o pavimento que a transcrição guarda.
                </p>}
          </div>
        </div>}
  </section>;
}

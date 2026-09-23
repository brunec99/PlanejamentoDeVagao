'use client';
import { useEffect, useRef, useState } from 'react';
import type * as ThreeNS from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FragmentsModel, FragmentsModels, MaterialDefinition, RenderedFaces } from '@thatopen/fragments';
import type { LinkRule } from '@/domain/entities';
import { serviceForElement, type ElementFacts } from '@/domain/rules';
import type { ServiceLook } from './simulation';
import { NO_CLASS, NO_STOREY, readElementMap, type MapRow } from '@/modules/ifc/element-map';
import { frame, loadFragments, MissingGeometry, type Federation } from '@/modules/ifc/fragments-stage';

type Three = typeof ThreeNS;
/** Serviço como a simulação quer vê-lo no quadro atual: cor, intensidade e se aparece. */
export interface ViewerService { name: string; look: ServiceLook }
export interface ViewerJob { token: number; versions: { id: string; label: string }[] }

const NEUTRAL = '#94a3b8';
const NO_SERVICE = '';
const NEUTRAL_KEY = 'neutral';
const count = (value: number) => value.toLocaleString('pt-BR');

interface Stage { three: Three; renderer: ThreeNS.WebGLRenderer; scene: ThreeNS.Scene; camera: ThreeNS.PerspectiveCamera; controls: OrbitControls }
/** Um elemento em cena: a linha transcrita já casada com o localId dela no modelo da sua versão. */
interface Item { model: FragmentsModel; localId: number; storey: string; ifcClass: string }
interface Loaded { fragments: FragmentsModels; models: FragmentsModel[]; faces: RenderedFaces; items: Item[]; declared: number; unconverted: number }
/** localId só vale dentro do seu modelo, então toda cor e todo recorte vão por modelo. */
interface Slice { model: FragmentsModel; localIds: number[] }
/** Célula = serviço × pavimento. É a menor unidade que a simulação e o recorte mudam, então cada
 * quadro manda no máximo um comando por célula e por modelo — e só para as que mudaram. */
interface Cell { key: string; service: string; storey: string; slices: Slice[] }
interface Grouping { load: Loaded; cells: Cell[] }
/** O que já foi mandado ao Fragments, para aplicar só a diferença no quadro seguinte. */
interface Applied { grouping: Grouping; storey: string; cells: Map<string, { visible: boolean; material: string }> }

/** A regra casa com o que o arquivo diz do elemento. A transcrição dá nome à ausência para poder
 * filtrar por ela na tela; aqui a ausência volta a ser vazia, que é o que a regra entende. */
const factsOf = (row: { storey: string; ifcClass: string }): ElementFacts => ({
  pavimento: row.storey === NO_STOREY ? '' : row.storey,
  tipo: row.ifcClass === NO_CLASS ? '' : row.ifcClass,
});

const lookKey = (look: ServiceLook | undefined) => look ? `${look.display}|${look.color}|${look.strength}` : NEUTRAL_KEY;

/** Avanço parcial vira tom e opacidade do serviço inteiro. Nunca "feito/não feito" por elemento:
 * o percentual é do serviço e não diz quais elementos foram executados. */
function materialFor(three: Three, faces: RenderedFaces, look: ServiceLook | undefined): MaterialDefinition {
  if (!look) return { color: new three.Color(NEUTRAL), opacity: 0.22, transparent: true, depthWrite: false, renderedFaces: faces };
  const full = new three.Color(look.color);
  const pale = full.clone().lerp(new three.Color('#ffffff'), 0.78);
  // Fantasma: o serviço ainda não começou nesta data, mas fica como referência de volume.
  if (look.display === 'ghost') return { color: pale, opacity: 0.12, transparent: true, depthWrite: false, renderedFaces: faces };
  const ratio = Math.min(1, Math.max(0, look.strength));
  const opacity = 0.32 + 0.68 * ratio;
  return { color: new three.Color().lerpColors(pale, full, ratio), opacity, transparent: opacity < 1, depthWrite: opacity > 0.85, renderedFaces: faces };
}

/** Junta os localIds por chave e por modelo, para mandar um comando por grupo em vez de um por
 * elemento: a conversa com o worker é assíncrona e um modelo tem centenas de milhares de itens. */
function push(index: Map<string, Cell>, service: string, item: Item) {
  const key = `${service}\u0000${item.storey}`;
  let cell = index.get(key);
  if (!cell) { cell = { key, service, storey: item.storey, slices: [] }; index.set(key, cell); }
  const slice = cell.slices.find(candidate => candidate.model === item.model);
  if (slice) slice.localIds.push(item.localId); else cell.slices.push({ model: item.model, localIds: [item.localId] });
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
  const [loaded, setLoaded] = useState<Loaded>();
  const [grouping, setGrouping] = useState<Grouping>();
  const [message, setMessage] = useState('');
  /** `pending` separa a versão que ainda não foi convertida de uma falha de leitura: a primeira
   * não é erro, é uma metade que falta, e a tela explica as duas de formas diferentes. */
  const [failure, setFailure] = useState<{ text: string; pending: boolean }>();
  const stageRef = useRef<Stage | undefined>(undefined);
  const fragmentsRef = useRef<FragmentsModels | undefined>(undefined);
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
      const orbit = new controls.OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.08;
      // A malha convertida é entregue por pedaços, conforme o que a câmera alcança. Sem avisar o
      // Fragments a cada movimento, a cena congela no detalhe do enquadramento anterior.
      const follow = () => { void fragmentsRef.current?.update(); };
      orbit.addEventListener('change', follow);
      stageRef.current = { three, renderer, scene, camera, controls: orbit };
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
        orbit.removeEventListener('change', follow);
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

  // Carga: as duas metades do modelo, que o envio separou. A malha vem do .frag de cada versão e
  // a classe e o pavimento vêm das tabelas; o GlobalId é o que existe nos dois lados.
  useEffect(() => {
    const stage = stageRef.current;
    if (!job || !ready || !stage) return;
    const controller = new AbortController();
    let cancelled = false;
    let opened: Federation | undefined;

    const run = async () => {
      setFailure(undefined); onError(''); setLoaded(undefined); setGrouping(undefined);
      setMessage('Abrindo a geometria convertida…');
      try {
        const federation = await loadFragments({ scene: stage.scene, camera: stage.camera, versions: job.versions, signal: controller.signal, onProgress: setMessage });
        opened = federation;
        if (cancelled) return;
        fragmentsRef.current = federation.fragments;
        const { rows, declared } = await readElementMap(job.versions.map(version => version.id), controller.signal, (read, total) => {
          setMessage(total > 0 ? `Lendo ${count(read)} de ${count(total)} elementos transcritos…` : 'Lendo os dados transcritos…');
        });
        if (cancelled) return;
        setMessage('Casando os elementos com a geometria…');
        const byVersion = new Map<string, MapRow[]>();
        for (const row of rows) {
          const list = byVersion.get(row.versionId);
          if (list) list.push(row); else byVersion.set(row.versionId, [row]);
        }
        const faces = federation.api.RenderedFaces.TWO;
        const items: Item[] = [];
        let unconverted = 0;
        for (const { versionId, model } of federation.models) {
          // Toda a malha começa neutra, inclusive o que existe convertido sem linha transcrita:
          // nenhum elemento pode aparecer com a cor original do IFC, que se leria como vínculo.
          await model.highlight(undefined, materialFor(stage.three, faces, undefined));
          const mine = byVersion.get(versionId) ?? [];
          if (!mine.length) continue;
          // localId é por modelo: o GlobalId de uma versão só se resolve no .frag dela.
          const localIds = await model.getLocalIdsByGuids(mine.map(row => row.globalId));
          if (cancelled) return;
          for (const [index, localId] of localIds.entries()) {
            // Sem localId, o elemento foi transcrito sem representação geométrica — existe como
            // dado e não como malha, o que é válido num IFC.
            if (typeof localId !== 'number') { unconverted++; continue; }
            items.push({ model, localId, storey: mine[index].storey, ifcClass: mine[index].ifcClass });
          }
        }
        frame(stage.three, stage.camera, stage.controls, federation.models);
        await federation.fragments.update(true);
        if (cancelled) return;
        setLoaded({ fragments: federation.fragments, models: federation.models.map(entry => entry.model), faces, items, declared, unconverted });
      } catch (cause) {
        if (cancelled || controller.signal.aborted) return;
        const text = cause instanceof Error && cause.message ? cause.message : 'Não foi possível carregar o modelo federado.';
        setFailure({ text, pending: cause instanceof MissingGeometry }); onError(text);
      } finally {
        if (!cancelled) setMessage('');
      }
    };
    run();

    return () => {
      cancelled = true;
      controller.abort();
      setLoaded(undefined); setGrouping(undefined);
      if (!opened) return;
      // Recarregar sem descartar deixaria um worker e uma malha inteira por carga vivos na aba.
      for (const { model } of opened.models) model.object.removeFromParent();
      if (fragmentsRef.current === opened.fragments) fragmentsRef.current = undefined;
      void opened.fragments.dispose().catch(() => undefined);
    };
  }, [job, ready, onError]);

  // Agrupamento: o serviço de cada elemento sai das regras, então as células são refeitas quando
  // as regras mudam — nunca quando só a data muda, que é repintura.
  useEffect(() => {
    if (!loaded) return;
    const cells = new Map<string, Cell>();
    let linked = 0;
    for (const item of loaded.items) {
      const service = serviceForElement(rules, factsOf(item)) ?? NO_SERVICE;
      if (service !== NO_SERVICE) linked++;
      push(cells, service, item);
    }
    onReport({ elements: loaded.items.length, linked });
    setGrouping({ load: loaded, cells: [...cells.values()] });
  }, [loaded, rules, onReport]);

  // Pintura por quadro. A simulação troca a data várias vezes por segundo; cada troca só guarda o
  // alvo mais recente e pede um requestAnimationFrame. Se a pintura anterior ainda conversa com o
  // worker, o quadro é pulado (fica marcado como pendente) em vez de enfileirado: ao terminar, a
  // pintura aplica direto o alvo mais novo. Nada disso recarrega geometria.
  const targetRef = useRef<{ grouping: Grouping; services: ViewerService[]; storey: string } | undefined>(undefined);
  const appliedRef = useRef<Applied | undefined>(undefined);
  const runRef = useRef({ busy: false, dirty: false, raf: 0 });

  useEffect(() => {
    targetRef.current = grouping ? { grouping, services, storey } : undefined;
    const run = runRef.current;

    const paint = async () => {
      const target = targetRef.current;
      const stage = stageRef.current;
      if (!target || !stage) return;
      run.busy = true; run.dirty = false;
      const { grouping: current, storey: cut } = target;
      const looks = new Map(target.services.map(service => [service.name, service.look]));
      try {
        let applied = appliedRef.current;
        // Carga nova: tudo começou visível e neutro (a carga pinta a malha inteira de neutro).
        if (!applied || applied.grouping !== current) {
          applied = { grouping: current, storey: '', cells: new Map(current.cells.map(cell => [cell.key, { visible: true, material: NEUTRAL_KEY }])) };
          appliedRef.current = applied;
        }
        let changed = false;
        // O recorte por pavimento também esconde a malha convertida sem linha transcrita, que não
        // pertence a célula nenhuma; por isso a troca de recorte mexe no modelo inteiro primeiro.
        if (applied.storey !== cut) {
          const hideAll = cut !== '';
          for (const model of current.load.models) {
            if (targetRef.current?.grouping !== current) return;
            if (hideAll) await model.setVisible(undefined, false); else await model.resetVisible();
          }
          for (const state of applied.cells.values()) state.visible = !hideAll;
          applied.storey = cut;
          changed = true;
        }
        for (const cell of current.cells) {
          if (targetRef.current?.grouping !== current) return;
          const look = cell.service === NO_SERVICE ? undefined : looks.get(cell.service);
          const visible = (!cut || cell.storey === cut) && look?.display !== 'hidden';
          const material = lookKey(look);
          const state = applied.cells.get(cell.key) ?? { visible: true, material: NEUTRAL_KEY };
          if (visible && state.material !== material) {
            const definition = materialFor(stage.three, current.load.faces, look);
            for (const slice of cell.slices) await slice.model.highlight(slice.localIds, definition);
            state.material = material; changed = true;
          }
          if (state.visible !== visible) {
            for (const slice of cell.slices) await slice.model.setVisible(slice.localIds, visible);
            state.visible = visible; changed = true;
          }
          applied.cells.set(cell.key, state);
        }
        if (changed && targetRef.current?.grouping === current) await current.load.fragments.update(true);
      } catch {
        // Federação descartada no meio: a carga seguinte recomeça do zero.
        appliedRef.current = undefined;
      } finally {
        run.busy = false;
        if (run.dirty) schedule();
      }
    };

    function schedule() {
      if (run.raf) return;
      run.raf = requestAnimationFrame(() => {
        run.raf = 0;
        if (run.busy) { run.dirty = true; return; }
        void paint();
      });
    }

    if (grouping) schedule();
  }, [grouping, services, storey]);

  useEffect(() => () => {
    const run = runRef.current;
    if (run.raf) cancelAnimationFrame(run.raf);
    run.raf = 0;
  }, []);

  const empty = loaded !== undefined && loaded.items.length === 0;
  const scene = webgl && !busy && !failure && loaded !== undefined && loaded.items.length > 0;
  return <div ref={setBox} className="relative h-[520px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
    <canvas ref={setCanvas} className="block h-full w-full" aria-label="Modelo federado em geometria convertida, colorido pelo serviço vinculado por regra" role="img" />
    {!webgl && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">
      Este navegador não tem WebGL disponível, então o modelo 3D não pode ser desenhado. A tabela de serviços por vagão abaixo traz a mesma informação de avanço por data.
    </p>}
    {webgl && busy && <p role="status" className="absolute inset-x-0 top-0 border-b border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-900">{message}</p>}
    {webgl && !busy && failure && <p role="alert" className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">
      {failure.pending
        ? `${failure.text} A versão tem os dados transcritos em tabela, mas não tem a malha 3D, e isso não é falha: a conversão da geometria é feita no envio do modelo, então reenviar em Modelos IFC gera a metade que falta. Até lá, a tabela de serviços por vagão abaixo traz o mesmo avanço em texto.`
        : failure.text}
    </p>}
    {webgl && !busy && !failure && empty && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-600">
      {loaded.declared === 0
        ? 'As versões escolhidas não têm elementos transcritos, então nada na cena pode ser ligado a um serviço. Reenvie o modelo em Modelos IFC para transcrever o IFC de novo.'
        : `Nenhum dos ${count(loaded.declared)} elementos transcritos foi encontrado na geometria convertida pelo GlobalId, que é o que liga as duas metades do modelo. Reenvie o modelo em Modelos IFC para gerar as duas na mesma conversão.`}
    </p>}
    {webgl && !busy && !failure && !job && <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm leading-6 text-slate-500">
      Nenhum modelo carregado. Escolha as versões do conjunto federado e use &quot;Carregar modelo&quot; — a geometria convertida no envio é baixada quando você pede.
    </p>}
    {scene && loaded.unconverted > 0 && <p role="status" className="absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white/90 px-4 py-2 text-xs leading-5 text-slate-600">
      {count(loaded.unconverted)} {loaded.unconverted === 1 ? 'elemento transcrito não tem geometria convertida e não aparece' : 'elementos transcritos não têm geometria convertida e não aparecem'} na cena — o avanço do serviço deles continua na tabela de serviços por vagão.
    </p>}
  </div>;
}

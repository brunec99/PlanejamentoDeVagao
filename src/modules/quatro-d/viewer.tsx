'use client';
import { useEffect, useRef, useState } from 'react';
import type * as ThreeNS from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FragmentsModel, FragmentsModels, MaterialDefinition, RenderedFaces } from '@thatopen/fragments';
import type { LinkRule } from '@/domain/entities';
import { serviceForElement, type ElementFacts } from '@/domain/rules';
import { NO_CLASS, NO_STOREY, readElementMap, type MapRow } from '@/modules/ifc/element-map';
import { frame, loadFragments, MissingGeometry, type Federation } from '@/modules/ifc/fragments-stage';

type Three = typeof ThreeNS;
export interface ViewerService { name: string; color: string; percent: number | undefined }
export interface ViewerJob { token: number; versions: { id: string; label: string }[] }

const NEUTRAL = '#94a3b8';
const NO_SERVICE = '';
const count = (value: number) => value.toLocaleString('pt-BR');

interface Stage { three: Three; renderer: ThreeNS.WebGLRenderer; scene: ThreeNS.Scene; camera: ThreeNS.PerspectiveCamera; controls: OrbitControls }
/** Um elemento em cena: a linha transcrita já casada com o localId dela no modelo da sua versão. */
interface Item { model: FragmentsModel; localId: number; storey: string; ifcClass: string }
interface Loaded { fragments: FragmentsModels; models: FragmentsModel[]; faces: RenderedFaces; items: Item[]; declared: number; unconverted: number }
/** localId só vale dentro do seu modelo, então toda cor e todo recorte vão por modelo. */
interface Slice { model: FragmentsModel; localIds: number[] }
interface Grouping { load: Loaded; byService: { service: string; slices: Slice[] }[]; byStorey: Map<string, Slice[]> }

/** A regra casa com o que o arquivo diz do elemento. A transcrição dá nome à ausência para poder
 * filtrar por ela na tela; aqui a ausência volta a ser vazia, que é o que a regra entende. */
const factsOf = (row: { storey: string; ifcClass: string }): ElementFacts => ({
  pavimento: row.storey === NO_STOREY ? '' : row.storey,
  tipo: row.ifcClass === NO_CLASS ? '' : row.ifcClass,
});

/** Avanço parcial vira tom e opacidade do serviço inteiro. Nunca "feito/não feito" por elemento:
 * o percentual é do serviço e não diz quais elementos foram executados. */
function materialFor(three: Three, faces: RenderedFaces, service: ViewerService | undefined): MaterialDefinition {
  if (!service) return { color: new three.Color(NEUTRAL), opacity: 0.22, transparent: true, depthWrite: false, renderedFaces: faces };
  const full = new three.Color(service.color);
  const pale = full.clone().lerp(new three.Color('#ffffff'), 0.78);
  const ratio = Math.min(1, Math.max(0, (service.percent ?? 0) / 100));
  const opacity = 0.32 + 0.68 * ratio;
  return { color: new three.Color().lerpColors(pale, full, ratio), opacity, transparent: opacity < 1, depthWrite: opacity > 0.85, renderedFaces: faces };
}

/** Junta os localIds por chave e por modelo, para mandar um comando por grupo em vez de um por
 * elemento: a conversa com o worker é assíncrona e um modelo tem centenas de milhares de itens. */
function push(index: Map<string, Slice[]>, key: string, item: Item) {
  let slices = index.get(key);
  if (!slices) { slices = []; index.set(key, slices); }
  const slice = slices.find(candidate => candidate.model === item.model);
  if (slice) slice.localIds.push(item.localId); else slices.push({ model: item.model, localIds: [item.localId] });
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

  // Agrupamento: o serviço de cada elemento sai das regras, então os grupos são refeitos quando
  // as regras mudam — nunca quando só a data muda, que é repintura.
  useEffect(() => {
    if (!loaded) return;
    const byService = new Map<string, Slice[]>();
    const byStorey = new Map<string, Slice[]>();
    let linked = 0;
    for (const item of loaded.items) {
      const service = serviceForElement(rules, factsOf(item)) ?? NO_SERVICE;
      if (service !== NO_SERVICE) linked++;
      push(byService, service, item);
      push(byStorey, item.storey, item);
    }
    onReport({ elements: loaded.items.length, linked });
    setGrouping({ load: loaded, byService: [...byService].map(([service, slices]) => ({ service, slices })), byStorey });
  }, [loaded, rules, onReport]);

  // Pintura: trocar a data da consulta muda o percentual de cada serviço, e com ele o tom. Só o
  // material de cada grupo é reaplicado — a geometria convertida continua carregada.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !grouping) return;
    let cancelled = false;

    const paint = async () => {
      const byName = new Map(services.map(service => [service.name, service]));
      try {
        for (const group of grouping.byService) {
          const definition = materialFor(stage.three, grouping.load.faces, group.service === NO_SERVICE ? undefined : byName.get(group.service));
          for (const slice of group.slices) {
            if (cancelled) return;
            await slice.model.highlight(slice.localIds, definition);
          }
        }
        if (cancelled) return;
        await grouping.load.fragments.update(true);
      } catch { /* federação descartada no meio: a carga seguinte repinta tudo. */ }
    };
    paint();

    return () => { cancelled = true; };
  }, [grouping, services]);

  // Recorte por pavimento: esconde e mostra, sem tocar na cor nem recarregar nada.
  useEffect(() => {
    if (!grouping) return;
    let cancelled = false;

    const cut = async () => {
      try {
        for (const model of grouping.load.models) {
          if (cancelled) return;
          if (storey) await model.setVisible(undefined, false); else await model.resetVisible();
        }
        for (const slice of storey ? grouping.byStorey.get(storey) ?? [] : []) {
          if (cancelled) return;
          await slice.model.setVisible(slice.localIds, true);
        }
        if (cancelled) return;
        await grouping.load.fragments.update(true);
      } catch { /* federação descartada no meio: a carga seguinte reaplica o recorte. */ }
    };
    cut();

    return () => { cancelled = true; };
  }, [grouping, storey]);

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

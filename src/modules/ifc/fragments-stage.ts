import type * as ThreeNS from 'three';
import type { FragmentsModel, FragmentsModels } from '@thatopen/fragments';

/** Abertura da geometria convertida. O .frag é a malha do modelo em binário compacto: um IFC de
 * 217 MB medido virou 15 MB, o que cabe no limite por arquivo do Storage e abre no navegador sem
 * reabrir o STEP. O processamento roda num worker, então a aba continua respondendo.
 *
 * O worker é servido pelo próprio app (public/fragments/), copiado no pré-build a partir do
 * pacote: a lib sabe buscá-lo numa CDN, e é justamente o que não queremos — a versão do worker
 * tem que casar com a do package.json, e um terceiro não decide isso por nós. */
const WORKER = '/fragments/worker.mjs';

/** Versão transcrita antes de a conversão existir: tem os dados em tabela e não tem a malha.
 * Isso não é falha de leitura, e a tela diz coisas diferentes nos dois casos — daí o tipo, em vez
 * de a tela ter que reconhecer a situação pelo texto da mensagem. */
export class MissingGeometry extends Error {}

export type FragmentsApi = typeof import('@thatopen/fragments');
export interface LoadedModel { versionId: string; label: string; model: FragmentsModel }
export interface Federation { api: FragmentsApi; fragments: FragmentsModels; models: LoadedModel[] }

/** Traz a geometria de cada versão para a cena. Em série: são megabytes por versão, e o worker
 * já paraleliza o processamento por dentro. */
export async function loadFragments({ scene, camera, versions, signal, onProgress }: {
  scene: ThreeNS.Object3D;
  camera: ThreeNS.PerspectiveCamera;
  versions: { id: string; label: string }[];
  signal: AbortSignal;
  onProgress: (message: string) => void;
}): Promise<Federation> {
  const api = await import('@thatopen/fragments');
  const fragments = new api.FragmentsModels(WORKER);
  const models: LoadedModel[] = [];
  try {
    for (const [index, version] of versions.entries()) {
      const of = versions.length > 1 ? ` (${index + 1}/${versions.length})` : '';
      onProgress(`Abrindo a geometria de ${version.label}${of}…`);
      const signed = await fetch(`/api/ifc/fragments?versionId=${encodeURIComponent(version.id)}`, { cache: 'no-store', signal });
      const body = (await signed.json().catch(() => ({}))) as { url?: unknown; error?: unknown };
      if (!signed.ok || typeof body.url !== 'string') {
        const message = typeof body.error === 'string' ? body.error : `Não foi possível abrir a geometria de ${version.label}.`;
        throw signed.status === 404 ? new MissingGeometry(message) : new Error(message);
      }
      const file = await fetch(body.url, { signal });
      if (!file.ok) throw new Error(`Não foi possível baixar a geometria de ${version.label}.`);
      const bytes = new Uint8Array(await file.arrayBuffer());
      onProgress(`Montando ${version.label}${of}…`);
      // O modelId precisa ser estável e único na cena: a versão é exatamente isso.
      const model = await fragments.load(bytes, { modelId: version.id, camera });
      scene.add(model.object);
      models.push({ versionId: version.id, label: version.label, model });
    }
    await fragments.update(true);
    return { api, fragments, models };
  } catch (cause) {
    // Falha no meio da federação não pode deixar worker e modelos pendurados.
    await fragments.dispose().catch(() => undefined);
    throw cause;
  }
}

/** Enquadra a câmera no conjunto carregado, usando a caixa que os próprios modelos declaram. */
export function frame(three: typeof ThreeNS, camera: ThreeNS.PerspectiveCamera, controls: { target: ThreeNS.Vector3; update: () => void }, models: LoadedModel[]) {
  const bounds = new three.Box3();
  for (const { model } of models) if (!model.box.isEmpty()) bounds.union(model.box);
  if (bounds.isEmpty()) return;
  const center = bounds.getCenter(new three.Vector3());
  const radius = Math.max(bounds.getSize(new three.Vector3()).length() / 2, 1);
  const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
  camera.position.set(center.x + distance * 0.65, center.y + distance * 0.55, center.z + distance * 0.65);
  camera.near = Math.max(distance / 1000, 0.01);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

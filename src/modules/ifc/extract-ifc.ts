import type { IfcAPI } from 'web-ifc';

/** Transcrição do IFC para o formato tabular. O arquivo é um grafo de instâncias tipadas e
 * relações objetivadas; aqui ele vira elemento, propriedade, quantidade e caixa envolvente —
 * as camadas que o planejamento usa. O express id só é único dentro do arquivo, então quem
 * identifica o elemento entre versões é o GlobalId. */

/** Caixa envolvente em coordenadas do modelo, com Z na vertical — o mesmo eixo da elevação que o
 * IFC declara no pavimento. É a geometria que vai para a tabela: seis números por elemento bastam
 * para a leitura de planejamento e cabem em qualquer tamanho de modelo. */
export interface BoundingBox { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }
export interface ExtractedElement { expressId: number; globalId?: string; ifcClass: string; name?: string; objectType?: string; storey?: string; box?: BoundingBox; attributes: Record<string, string | number | boolean> }
export interface ExtractedProperty { expressId: number; pset: string; name: string; valueText?: string; valueNumber?: number; unit?: string }
export type QuantityKind = 'area' | 'volume' | 'length' | 'count' | 'weight' | 'time';
export interface ExtractedQuantity { expressId: number; qset: string; name: string; kind: QuantityKind; value: number; unit?: string }
export interface Extraction { elements: ExtractedElement[]; properties: ExtractedProperty[]; quantities: ExtractedQuantity[] }

type Line = Record<string, unknown>;
const scalar = (value: unknown): string | number | boolean | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object' && 'value' in (value as Line)) return scalar((value as Line).value);
  return undefined;
};
const text = (value: unknown) => { const raw = scalar(value); return typeof raw === 'string' ? raw : undefined; };
const list = (value: unknown): Line[] => (Array.isArray(value) ? value as Line[] : value ? [value as Line] : []);
const ref = (value: unknown): number | undefined => { const raw = scalar(value); return typeof raw === 'number' ? raw : undefined; };

/** A quantidade guarda o valor num atributo com o nome do próprio tipo (AreaValue, VolumeValue…). */
const QUANTITIES: { type: string; kind: QuantityKind; field: string }[] = [
  { type: 'IFCQUANTITYAREA', kind: 'area', field: 'AreaValue' },
  { type: 'IFCQUANTITYVOLUME', kind: 'volume', field: 'VolumeValue' },
  { type: 'IFCQUANTITYLENGTH', kind: 'length', field: 'LengthValue' },
  { type: 'IFCQUANTITYCOUNT', kind: 'count', field: 'CountValue' },
  { type: 'IFCQUANTITYWEIGHT', kind: 'weight', field: 'WeightValue' },
  { type: 'IFCQUANTITYTIME', kind: 'time', field: 'TimeValue' },
];

type Api = Pick<IfcAPI, 'GetLine' | 'GetLineType' | 'GetNameFromTypeCode' | 'GetLineIDsWithType'>;
type GeometryApi = Api & Pick<IfcAPI, 'StreamAllMeshes' | 'GetGeometry' | 'GetVertexArray' | 'GetIndexArray'>;

/** Percorre as malhas e reduz cada elemento à sua caixa envolvente, aplicando a transformação
 * de cada geometria posicionada. Um IFC sem representação geométrica simplesmente não produz
 * caixa nenhuma — o que é válido, e diferente de falha.
 *
 * O web-ifc entrega a malha já girada para Y na vertical, a convenção do three.js: a matriz que
 * ele devolve leva (x, y, z) do IFC para (x, z, -y). A tabela desfaz esse giro e guarda o eixo do
 * arquivo, porque ali a caixa é dado, não cena — é o que permite comparar min_z com a elevação do
 * pavimento. Girar para a tela é trabalho de quem desenha, e o visualizador faz isso. */
export function extractBoxes(api: GeometryApi, modelID: number): Map<number, BoundingBox> {
  const boxes = new Map<number, BoundingBox>();
  api.StreamAllMeshes(modelID, mesh => {
    let box = boxes.get(mesh.expressID);
    for (let i = 0; i < mesh.geometries.size(); i++) {
      const placed = mesh.geometries.get(i);
      const geometry = api.GetGeometry(modelID, placed.geometryExpressID);
      const vertices = api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
      const m = placed.flatTransformation;
      // O vértice ocupa seis floats: posição e normal. A normal não entra na caixa.
      for (let v = 0; v < vertices.length; v += 6) {
        const x = vertices[v], y = vertices[v + 1], z = vertices[v + 2];
        const px = m[0] * x + m[4] * y + m[8] * z + m[12];
        const py = m[1] * x + m[5] * y + m[9] * z + m[13];
        const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
        // De volta ao eixo do arquivo: a altura é Z e Y é o que o web-ifc tinha negado.
        const ix = px, iy = -pz, iz = py;
        box = box
          ? { minX: Math.min(box.minX, ix), minY: Math.min(box.minY, iy), minZ: Math.min(box.minZ, iz), maxX: Math.max(box.maxX, ix), maxY: Math.max(box.maxY, iy), maxZ: Math.max(box.maxZ, iz) }
          : { minX: ix, minY: iy, minZ: iz, maxX: ix, maxY: iy, maxZ: iz };
      }
      geometry.delete();
    }
    if (box) boxes.set(mesh.expressID, box);
  });
  return boxes;
}
const ids = (api: Api, modelID: number, type: number, inherited = false) => {
  const vector = api.GetLineIDsWithType(modelID, type, inherited);
  return Array.from({ length: vector.size() }, (_, i) => vector.get(i));
};

/** Roda sobre um modelo já aberto, para o navegador e os testes usarem o mesmo caminho. */
export function extractFromModel(api: Api, modelID: number, schema: Record<string, number>, boxes = new Map<number, BoundingBox>()): Extraction {
  const className = (expressId: number) => api.GetNameFromTypeCode(api.GetLineType(modelID, expressId));

  // Pavimento: o elemento é contido numa estrutura espacial, que pode ser o próprio pavimento
  // ou um espaço agregado nele — daí a subida por IfcRelAggregates.
  const parentOf = new Map<number, number>();
  for (const id of ids(api, modelID, schema.IFCRELAGGREGATES)) {
    const relation = api.GetLine(modelID, id) as Line;
    const parent = ref(relation.RelatingObject);
    if (parent !== undefined) for (const child of list(relation.RelatedObjects)) { const childId = ref(child); if (childId !== undefined) parentOf.set(childId, parent); }
  }
  const storeyNameOf = new Map<number, string>();
  for (const id of ids(api, modelID, schema.IFCBUILDINGSTOREY)) {
    const line = api.GetLine(modelID, id) as Line;
    const name = text(line.Name) ?? text(line.LongName);
    if (name) storeyNameOf.set(id, name);
  }
  const storeyOfStructure = (structureId: number, guard = 0): string | undefined => {
    if (guard > 20) return undefined;
    const direct = storeyNameOf.get(structureId);
    if (direct) return direct;
    const parent = parentOf.get(structureId);
    return parent === undefined ? undefined : storeyOfStructure(parent, guard + 1);
  };
  const storeyOf = new Map<number, string>();
  for (const id of ids(api, modelID, schema.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const relation = api.GetLine(modelID, id) as Line;
    const structure = ref(relation.RelatingStructure);
    const storey = structure === undefined ? undefined : storeyOfStructure(structure);
    if (!storey) continue;
    for (const element of list(relation.RelatedElements)) { const elementId = ref(element); if (elementId !== undefined) storeyOf.set(elementId, storey); }
  }

  // Sem o terceiro argumento, IFCELEMENT não alcança IfcWall e a lista sai vazia.
  const elementIds = ids(api, modelID, schema.IFCELEMENT, true);
  const known = new Set(elementIds);
  const elements: ExtractedElement[] = elementIds.map(expressId => {
    const line = api.GetLine(modelID, expressId) as Line;
    const attributes: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(line)) {
      if (key === 'expressID' || key === 'type') continue;
      const raw = scalar(value);
      if (raw !== undefined && key !== 'GlobalId' && key !== 'Name') attributes[key] = raw;
    }
    return {
      expressId, globalId: text(line.GlobalId), ifcClass: className(expressId),
      name: text(line.Name), objectType: text(line.ObjectType), storey: storeyOf.get(expressId), box: boxes.get(expressId), attributes,
    };
  });

  const properties: ExtractedProperty[] = [];
  const quantities: ExtractedQuantity[] = [];
  for (const id of ids(api, modelID, schema.IFCRELDEFINESBYPROPERTIES)) {
    const relation = api.GetLine(modelID, id) as Line;
    const definitionId = ref(relation.RelatingPropertyDefinition);
    if (definitionId === undefined) continue;
    const definition = api.GetLine(modelID, definitionId) as Line;
    const setName = text(definition.Name) ?? 'Sem nome';
    const targets = list(relation.RelatedObjects).map(ref).filter((value): value is number => value !== undefined && known.has(value));
    if (!targets.length) continue;

    for (const property of list(definition.HasProperties)) {
      const propertyId = ref(property);
      if (propertyId === undefined) continue;
      const line = api.GetLine(modelID, propertyId) as Line;
      const name = text(line.Name);
      const value = scalar(line.NominalValue);
      if (!name || value === undefined) continue;
      for (const expressId of targets) properties.push({
        expressId, pset: setName, name,
        valueText: typeof value === 'number' ? undefined : String(value),
        valueNumber: typeof value === 'number' ? value : undefined,
        unit: text(line.Unit),
      });
    }

    for (const quantity of list(definition.Quantities)) {
      const quantityId = ref(quantity);
      if (quantityId === undefined) continue;
      const line = api.GetLine(modelID, quantityId) as Line;
      const shape = QUANTITIES.find(option => option.type === className(quantityId).toUpperCase());
      const value = shape ? scalar(line[shape.field]) : undefined;
      const name = text(line.Name);
      if (!shape || !name || typeof value !== 'number') continue;
      for (const expressId of targets) quantities.push({ expressId, qset: setName, name, kind: shape.kind, value, unit: text(line.Unit) });
    }
  }

  return { elements, properties, quantities };
}

/** Caminho do navegador: abre o arquivo com o WASM servido em /wasm/ e transcreve. */
export async function extractIfc(file: File): Promise<Extraction> {
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath('/wasm/', true);
  await api.Init(undefined, true);
  let modelID: number | undefined;
  try {
    modelID = api.OpenModel(new Uint8Array(await file.arrayBuffer()));
    const boxes = extractBoxes(api, modelID);
    return extractFromModel(api, modelID, WebIFC as unknown as Record<string, number>, boxes);
  } catch (cause) {
    throw new Error(`Não foi possível ler o IFC: ${cause instanceof Error ? cause.message : 'arquivo inválido.'}`);
  } finally {
    if (modelID !== undefined) try { api.CloseModel(modelID); } catch { /* modelo já liberado */ }
  }
}

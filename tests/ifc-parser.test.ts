import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { serviceForElement, rulesNeedingReview } from '../src/domain/rules';
import type { LinkRule } from '../src/domain/entities';

// A leitura de IFC é a única parte do produto que depende de WASM de terceiro, e é a que o
// resto da suíte não alcança. Este teste abre um IFC mínimo versionado em tests/fixtures e
// confere o contrato do web-ifc que as telas usam — se uma atualização da lib renomear ou
// mudar um desses métodos, quebra aqui em vez de quebrar no navegador do engenheiro.
const require = createRequire(import.meta.url);
// O pacote não exporta package.json, então o diretório vem pelo wasm, que é exportado.
const packageDir = require.resolve('web-ifc/web-ifc-node.wasm').replace(/web-ifc-node\.wasm$/, '');

async function openFixture(name = 'minimo.ifc') {
  const WebIFC = await import('web-ifc');
  const api = new WebIFC.IfcAPI();
  api.SetWasmPath(packageDir, true);
  await api.Init(undefined, true);
  const modelID = api.OpenModel(new Uint8Array(readFileSync(new URL(`fixtures/${name}`, import.meta.url))));
  return { WebIFC, api, modelID };
}
const names = (api: { GetLine: (m: number, id: number) => { Name?: { value: string } } }, modelID: number, ids: { size(): number; get(i: number): number }) =>
  Array.from({ length: ids.size() }, (_, i) => api.GetLine(modelID, ids.get(i)).Name?.value);

test('o IFC abre e entrega os pavimentos com nome e elevação', async () => {
  const { WebIFC, api, modelID } = await openFixture();
  assert.equal(api.IsModelOpen(modelID), true);
  const storeys = api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY);
  assert.deepEqual(names(api, modelID, storeys), ['Terreo', '1o Pavimento']);
  assert.equal(api.GetLine(modelID, storeys.get(1)).Elevation.value, 3000);
  api.CloseModel(modelID);
});

test('a contagem de elementos usa herança de tipo', async () => {
  const { WebIFC, api, modelID } = await openFixture();
  // Sem o terceiro argumento, IFCELEMENT não alcança IFCWALL: é o que faz a contagem dar zero.
  assert.equal(api.GetLineIDsWithType(modelID, WebIFC.IFCELEMENT, true).size(), 2);
  assert.equal(api.GetLineIDsWithType(modelID, WebIFC.IFCELEMENT).size(), 0);
  api.CloseModel(modelID);
});

test('o elemento resolve classe e pavimento pela estrutura espacial', async () => {
  const { WebIFC, api, modelID } = await openFixture();
  const relations = api.GetLineIDsWithType(modelID, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
  const found: { element?: string; klass: string; storey?: string }[] = [];
  for (let i = 0; i < relations.size(); i++) {
    const relation = api.GetLine(modelID, relations.get(i));
    const storey = api.GetLine(modelID, relation.RelatingStructure.value);
    const related = Array.isArray(relation.RelatedElements) ? relation.RelatedElements : [relation.RelatedElements];
    for (const reference of related) {
      found.push({
        element: api.GetLine(modelID, reference.value).Name?.value,
        klass: api.GetNameFromTypeCode(api.GetLineType(modelID, reference.value)),
        storey: storey.Name?.value,
      });
    }
  }
  assert.deepEqual(found, [
    { element: 'Parede do terreo', klass: 'IfcWall', storey: 'Terreo' },
    { element: 'Parede do primeiro', klass: 'IfcWall', storey: '1o Pavimento' },
  ]);
  api.CloseModel(modelID);
});

test('as regras casam com os pavimentos como eles saem do arquivo', async () => {
  const { WebIFC, api, modelID } = await openFixture();
  const storeys = names(api, modelID, api.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY)).filter((n): n is string => !!n);
  api.CloseModel(modelID);
  const stamp = { createdAt: '2026-09-08T12:00:00Z', updatedAt: '2026-09-08T12:00:00Z' };
  // O arquivo traz "Terreo" e "1o Pavimento"; a regra é digitada "Térreo" e "1º pavimento".
  const rule = (id: string, value: string): LinkRule => ({ id, ...stamp, workId: 'obra-1', order: 1, serviceName: 'Alvenaria', criteria: [{ property: 'pavimento', operator: 'igual', value }] });
  assert.equal(serviceForElement([rule('r1', 'Térreo')], { pavimento: storeys[0], tipo: 'IfcWall' }), 'Alvenaria');
  assert.equal(serviceForElement([rule('r2', '1º pavimento')], { pavimento: storeys[1], tipo: 'IfcWall' }), 'Alvenaria');
  assert.deepEqual(rulesNeedingReview([rule('r3', 'Cobertura')], storeys).map(r => r.id), ['r3']);
  assert.deepEqual(rulesNeedingReview([rule('r4', 'Térreo')], storeys), []);
});

test('a transcrição do IFC entrega elementos, propriedades e quantidades', async () => {
  const { WebIFC, api, modelID } = await openFixture();
  const { extractFromModel } = await import('../src/modules/ifc/extract-ifc');
  const { elements, properties, quantities } = extractFromModel(api, modelID, WebIFC as unknown as Record<string, number>);
  api.CloseModel(modelID);

  assert.deepEqual(elements.map(e => [e.ifcClass, e.name, e.storey]), [
    ['IfcWall', 'Parede do terreo', 'Terreo'],
    ['IfcWall', 'Parede do primeiro', '1o Pavimento'],
  ]);
  assert.ok(elements[0].globalId, 'o GlobalId identifica o elemento entre versões');

  const wall = elements[0].expressId;
  assert.deepEqual(properties.filter(p => p.expressId === wall).map(p => [p.pset, p.name, p.valueText ?? p.valueNumber]), [
    ['Pset_Alvenaria', 'Material', 'Bloco ceramico 14'],
    ['Pset_Alvenaria', 'Espessura', 0.14],
  ]);
  assert.deepEqual(quantities.filter(q => q.expressId === wall).map(q => [q.name, q.kind, q.value]), [
    ['NetSideArea', 'area', 12.5],
    ['NetVolume', 'volume', 1.75],
  ]);
  // A segunda parede não tem conjunto de propriedades: a transcrição não inventa linhas.
  assert.deepEqual(properties.filter(p => p.expressId === elements[1].expressId), []);
});

test('a caixa envolvente sai da malha com o posicionamento aplicado', async () => {
  // O 3D é montado a partir da tabela, e o que vai para a tabela é esta caixa. O fixture tem
  // dimensões e deslocamentos escolhidos a mão para o teste conferir três coisas que só a lib
  // responde: o passo de seis floats por vértice, o formato da matriz de posicionamento e o
  // eixo vertical do IFC ser o Z. Errar qualquer uma delas ainda desenha um prédio — torto.
  const { WebIFC, api, modelID } = await openFixture('geometria.ifc');
  const { extractBoxes, extractFromModel } = await import('../src/modules/ifc/extract-ifc');
  const boxes = extractBoxes(api, modelID);
  const { elements } = extractFromModel(api, modelID, WebIFC as unknown as Record<string, number>, boxes);
  api.CloseModel(modelID);

  const near = (value: number | undefined, expected: number, label: string) =>
    assert.ok(value !== undefined && Math.abs(value - expected) < 0.01, `${label}: ${value} deveria ser ${expected}`);
  const boxOf = (ifcClass: string) => {
    const element = elements.find(e => e.ifcClass === ifcClass);
    assert.ok(element?.box, `${ifcClass} deveria ter caixa envolvente`);
    return element.box;
  };

  // Parede de 4,00 x 0,20 extrudada 3,00 m, posicionada em (10, 5, 0).
  const wall = boxOf('IfcWall');
  near(wall?.minX, 8, 'parede minX'); near(wall?.maxX, 12, 'parede maxX');
  near(wall?.minY, 4.9, 'parede minY'); near(wall?.maxY, 5.1, 'parede maxY');
  near(wall?.minZ, 0, 'parede minZ'); near(wall?.maxZ, 3, 'parede maxZ');

  // Laje de 6,00 x 6,00 com 0,20 m de espessura, no nível 3,00 — a altura é Z, não Y.
  const slab = boxOf('IfcSlab');
  near(slab?.minX, -3, 'laje minX'); near(slab?.maxX, 3, 'laje maxX');
  near(slab?.minZ, 3, 'laje minZ'); near(slab?.maxZ, 3.2, 'laje maxZ');

  assert.deepEqual(elements.map(e => [e.ifcClass, e.storey]), [['IfcWall', 'Terreo'], ['IfcSlab', '1o Pavimento']]);
});

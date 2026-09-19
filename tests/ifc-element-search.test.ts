import test from 'node:test';
import assert from 'node:assert/strict';
import { searchElements } from '../src/modules/federacao/element-search';
const row = (versionId: string, name: string, storey = 'Térreo') => ({ versionId, name, storey, globalId: 'GUID-123', ifcClass: 'IfcWall' });
const parts = [
  { versionId: 'v1', label: 'Estrutura · v1', rows: new Map([[1, row('v1', 'Parede térrea')], [2, row('v1', 'Parede superior', '1º Pavimento')]]) },
  { versionId: 'v2', label: 'Arquitetura · v2', rows: new Map([[1, row('v2', 'Parede térrea')]]) },
];
test('busca aceita acentos, múltiplos termos e GlobalId sem confundir ids locais de modelos distintos', () => {
  assert.equal(searchElements(parts, 'parede terrea', [], '').total, 2);
  assert.equal(searchElements(parts, 'guid-123 estrutura', [], '').total, 2);
  assert.deepEqual(searchElements(parts, 'terrea', [], '').results.map(item => [item.versionId, item.localId]), [['v1', 1], ['v2', 1]]);
});
test('busca respeita modelos ocultos e recorte por pavimento', () => {
  assert.deepEqual(searchElements(parts, '', ['v2'], 'Térreo').results.map(item => item.row.name), ['Parede térrea']);
  assert.equal(searchElements(parts, '', ['v1', 'v2'], '').total, 0);
  assert.equal(searchElements(parts, 'inexistente', [], '').total, 0);
});
test('limite de resultados restringe a lista sem reduzir o total encontrado', () => {
  const result = searchElements(parts, '', [], '', 1);
  assert.equal(result.total, 3);
  assert.equal(result.results.length, 1);
});

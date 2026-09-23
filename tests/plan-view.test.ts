import test from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTask } from '../src/domain/entities';
import { dependencyAnchors, filterPlanRows, type PlanRowFilter } from '../src/modules/medio-prazo/plan-view';

function task(id: string, level: number, name = id, progress = 0, order = 0): PlanTask {
  return { id, level, name, progress, order, planId: 'plan', plannedStart: '2026-09-01', plannedEnd: '2026-09-30', createdAt: '', updatedAt: '' };
}
const options = (overrides: Partial<{ query: string; filter: PlanRowFilter; conflictTaskIds: ReadonlySet<string>; folded: ReadonlySet<string> }> = {}) => ({
  query: '', filter: 'all' as PlanRowFilter, conflictTaskIds: new Set<string>(), folded: new Set<string>(), ...overrides,
});
const ids = (tasks: PlanTask[]) => tasks.map(row => row.id);

test('leitura sem filtro recolhe só descendentes, preservando irmãos e próximos grupos', () => {
  const rows = [task('a', 0), task('b', 1), task('c', 2), task('d', 1), task('e', 0), task('f', 1)];
  assert.deepEqual(ids(filterPlanRows(rows, options({ folded: new Set(['b']) }))), ['a', 'b', 'd', 'e', 'f']);
  assert.deepEqual(ids(filterPlanRows(rows, options({ folded: new Set(['a', 'b']) }))), ['a', 'e', 'f']);
});

test('busca sem acentos combina tokens em qualquer ordem e revela todos os ancestrais', () => {
  const rows = [task('a', 0, 'Prédio'), task('b', 1, 'Pavimento'), task('c', 2, 'Instalação elétrica'), task('d', 1, 'Pintura')];
  const result = filterPlanRows(rows, options({ query: ' ELETRICA  instalacao ', folded: new Set(['a', 'b']) }));
  assert.deepEqual(ids(result), ['a', 'b', 'c']);
});

test('busca não mistura ancestrais entre grupos nem inclui descendentes sem correspondência', () => {
  const rows = [task('a', 0, 'Fundação'), task('b', 1), task('c', 0, 'Estrutura'), task('d', 1, 'Concretagem')];
  assert.deepEqual(ids(filterPlanRows(rows, options({ query: 'concretagem' }))), ['c', 'd']);
  assert.deepEqual(ids(filterPlanRows(rows, options({ query: 'fundacao' }))), ['a']);
});

test('hierarquia considera o nível menor anterior mesmo quando há saltos nos níveis', () => {
  const rows = [task('a', 0), task('b', 3), task('c', 5, 'Encontrada'), task('d', 2), task('e', 0)];
  assert.deepEqual(ids(filterPlanRows(rows, options({ query: 'encontrada' }))), ['a', 'b', 'c']);
  assert.deepEqual(ids(filterPlanRows(rows, options({ folded: new Set(['b']) }))), ['a', 'b', 'd', 'e']);
});

test('incompletas usa apenas progresso das folhas, nunca valor persistido de resumo', () => {
  const rows = [task('a', 0, 'Resumo concluído', 0), task('b', 1, 'Concluída', 100), task('c', 0, 'Resumo pendente', 100), task('d', 1, 'Pendente', 40), task('e', 1, 'Concluída', 100)];
  assert.deepEqual(ids(filterPlanRows(rows, options({ filter: 'incomplete', folded: new Set(['c']) }))), ['c', 'd']);
});

test('busca e filtro são interseção; ancestrais só precisam contextualizar a folha encontrada', () => {
  const rows = [task('a', 0, 'Bloco A'), task('b', 1, 'Pintura interna', 50), task('c', 1, 'Pintura externa', 100), task('d', 0, 'Fundação', 10)];
  assert.deepEqual(ids(filterPlanRows(rows, options({ query: 'pintura', filter: 'incomplete' }))), ['a', 'b']);
  assert.deepEqual(ids(filterPlanRows(rows, options({ query: 'externa', filter: 'incomplete' }))), []);
});

test('filtro de conflitos revela a sucessora com seu contexto sem incluir outras linhas', () => {
  const rows = [task('a', 0, 'Bloco A'), task('b', 1, 'Pintura'), task('c', 1, 'Alvenaria'), task('d', 0, 'Pintura')];
  const selected = options({ filter: 'conflicts', conflictTaskIds: new Set(['c', 'd', 'missing']), folded: new Set(['a']) });
  assert.deepEqual(ids(filterPlanRows(rows, selected)), ['a', 'c', 'd']);
  assert.deepEqual(ids(filterPlanRows(rows, { ...selected, query: 'alvenaria' })), ['a', 'c']);
});

test('mantém ordem de entrada e os objetos originais sem renumerar ou alterar preferências', () => {
  const rows = [task('z', 0, 'Grupo', 0, 19), task('b', 1, 'Busca', 30, 2), task('a', 0, 'Busca', 10, 7)];
  const snapshot = structuredClone(rows);
  const folded = new Set(['z']);
  const result = filterPlanRows(rows, options({ query: 'busca', folded }));
  assert.deepEqual(ids(result), ['z', 'b', 'a']);
  result.forEach((row, index) => assert.equal(row, rows[index]));
  assert.deepEqual(rows, snapshot);
  assert.deepEqual([...folded], ['z']);
  assert.deepEqual(ids(filterPlanRows(rows, options({ folded }))), ['z', 'a']);
});

test('busca vazia ou apenas espaços mantém recolhimento e entrada vazia é válida', () => {
  const rows = [task('a', 0), task('b', 1)];
  assert.deepEqual(ids(filterPlanRows(rows, options({ query: ' \t ', folded: new Set(['a']) }))), ['a']);
  assert.deepEqual(filterPlanRows([], options({ query: 'inexistente', filter: 'incomplete' })), []);
});

test('setas partem e chegam às pontas correspondentes aos quatro tipos de vínculo', () => {
  assert.deepEqual(dependencyAnchors('TI'), { from: 'end', to: 'start' });
  assert.deepEqual(dependencyAnchors('II'), { from: 'start', to: 'start' });
  assert.deepEqual(dependencyAnchors('TT'), { from: 'end', to: 'end' });
  assert.deepEqual(dependencyAnchors('IT'), { from: 'start', to: 'end' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { TerminalityData, TerminalityItem, TerminalityPhoto } from '../src/domain/terminality';
import {
  DEFAULT_FILTERS,
  NONE,
  compareItems,
  filterItems,
  hasActiveFilters,
  indexTerminality,
  locationLabel,
  percentLabel,
  photosOf,
  summarize,
  unitOptions,
  visibleItems,
} from '../src/modules/terminalidade/terminality-view';

const stamp = { createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };
const W = 'obra-1';
const floor = (id: string, name: string, orderIndex: number) => ({ ...stamp, id, workId: W, name, orderIndex });
const unit = (id: string, floorId: string, name: string, orderIndex = 0) => ({ ...stamp, id, workId: W, floorId, name, orderIndex });
const item = (id: string, patch: Partial<TerminalityItem>): TerminalityItem => ({
  ...stamp,
  id,
  workId: W,
  floorId: 'f4',
  description: `Pendência ${id}`,
  observedOn: '2026-10-01',
  status: 'open',
  createdBy: 'u1',
  ...patch,
});
const photo = (id: string, itemId: string, kind: TerminalityPhoto['kind'], createdAt: string): TerminalityPhoto => ({
  id,
  itemId,
  workId: W,
  kind,
  storagePath: `${W}/${itemId}/${id}.jpg`,
  thumbPath: `${W}/${itemId}/${id}-thumb.jpg`,
  createdBy: 'u1',
  createdAt,
});

// Ordem cadastrada do térreo para cima; os aptos de propósito com ordem empatada para testar o desempate numérico.
const data: TerminalityData = {
  floors: [floor('f4', '4° pavto', 4), floor('f1', 'Térreo', 0), floor('f10', '10° pavto', 10)],
  units: [unit('u410', 'f4', '410'), unit('u402', 'f4', '402'), unit('u401', 'f4', '401'), unit('u1001', 'f10', '1001')],
  types: [{ ...stamp, id: 't-ac', workId: W, name: 'A/C', orderIndex: 0, active: true }],
  people: [{ ...stamp, id: 'p-ana', workId: W, name: 'Ana', active: true }],
  items: [
    item('a', { unitId: 'u410', contractor: 'MZ CLIMATIZAÇÃO', typeId: 't-ac', observedOn: '2026-09-20' }),
    item('b', { unitId: 'u402', contractor: 'mz climatizacao ', observedOn: '2026-09-25' }),
    item('c', { unitId: 'u402', contractor: 'HIDROTEC', observedOn: '2026-09-10', atrPersonId: 'p-ana' }),
    item('d', { floorId: 'f1', description: 'Rejunte do hall', contractor: 'HIDROTEC', status: 'resolved', correctedOn: '2026-10-02' }),
    item('e', { floorId: 'f10', unitId: 'u1001', description: 'Pintura do teto descascando' }),
    item('f', { description: 'Escada sem corrimão' }),
  ],
  photos: [
    photo('p2', 'a', 'issue', '2026-09-20T12:00:00Z'),
    photo('p1', 'a', 'issue', '2026-09-20T11:00:00Z'),
    photo('p3', 'd', 'correction', '2026-10-02T09:00:00Z'),
  ],
};
const index = indexTerminality(data);
const ids = (items: TerminalityItem[]) => items.map(i => i.id);

test('ordem padrão: pavimento, depois o pavimento sem apto, aptos em ordem natural e data de observação', () => {
  assert.deepEqual(ids([...data.items].sort(compareItems(index))), ['d', 'f', 'c', 'b', 'a', 'e']);
});

test('apto "10" vem depois de "9" quando a ordem cadastrada empata', () => {
  const extra = { ...data, units: [unit('x10', 'f4', '10'), unit('x9', 'f4', '9')] };
  const items = [item('m', { unitId: 'x10' }), item('n', { unitId: 'x9' })];
  assert.deepEqual(ids(items.sort(compareItems(indexTerminality(extra)))), ['n', 'm']);
});

test('local é "pavimento · apto", e só o pavimento quando não há apto', () => {
  assert.equal(locationLabel(index, data.items[0]), '4° pavto · 410');
  assert.equal(locationLabel(index, data.items[5]), '4° pavto');
});

test('filtro padrão mostra só as abertas', () => {
  assert.deepEqual(ids(visibleItems(data, index, DEFAULT_FILTERS)), ['f', 'c', 'b', 'a', 'e']);
  assert.deepEqual(ids(visibleItems(data, index, { ...DEFAULT_FILTERS, situation: 'resolved' })), ['d']);
  assert.equal(visibleItems(data, index, { ...DEFAULT_FILTERS, situation: 'all' }).length, 6);
});

test('responsável terceiro compara sem acento, caixa e espaço sobrando', () => {
  assert.deepEqual(ids(filterItems(data.items, { ...DEFAULT_FILTERS, contractor: 'MZ Climatização' })), ['a', 'b']);
});

test('NONE pede o campo vazio: sem apto, sem tipo, sem responsável', () => {
  assert.deepEqual(ids(filterItems(data.items, { ...DEFAULT_FILTERS, situation: 'all', unitId: NONE })), ['d', 'f']);
  assert.deepEqual(ids(filterItems(data.items, { ...DEFAULT_FILTERS, typeId: NONE })), ['b', 'c', 'e', 'f']);
  assert.deepEqual(ids(filterItems(data.items, { ...DEFAULT_FILTERS, contractor: NONE })), ['e', 'f']);
  assert.deepEqual(ids(filterItems(data.items, { ...DEFAULT_FILTERS, atrPersonId: 'p-ana' })), ['c']);
});

test('filtros se somam e a busca procura na descrição sem acento', () => {
  assert.deepEqual(ids(filterItems(data.items, { ...DEFAULT_FILTERS, floorId: 'f4', unitId: 'u402' })), ['b', 'c']);
  assert.deepEqual(ids(filterItems(data.items, { ...DEFAULT_FILTERS, search: 'corrimao' })), ['f']);
  assert.deepEqual(ids(filterItems(data.items, { ...DEFAULT_FILTERS, situation: 'all', search: '  HALL ' })), ['d']);
});

test('ignorar um filtro devolve a seleção sem ele', () => {
  const filters = { ...DEFAULT_FILTERS, contractor: 'HIDROTEC' };
  assert.deepEqual(ids(filterItems(data.items, filters, ['situation'])), ['c', 'd']);
  assert.equal(filterItems(data.items, filters, ['situation', 'contractor']).length, 6);
});

test('hasActiveFilters só acusa o que difere do padrão', () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, situation: 'all' }), true);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, search: 'x' }), true);
});

test('resumo conta abertas, resolvidas e o percentual', () => {
  const summary = summarize(data.items, index);
  assert.equal(summary.total, 6);
  assert.equal(summary.open, 5);
  assert.equal(summary.resolved, 1);
  assert.equal(Math.round(summary.percent ?? 0), 17);
  assert.equal(summarize([], index).percent, undefined);
  assert.equal(percentLabel(summarize([], index)), '—');
});

test('percentual não arredonda para 100% com pendência aberta', () => {
  assert.equal(percentLabel({ percent: 99.6, open: 1 }), '99%');
  assert.equal(percentLabel({ percent: 100, open: 0 }), '100%');
  assert.equal(percentLabel({ percent: 16.7, open: 5 }), '17%');
});

test('abertas por empreiteiro juntam grafias e deixam "sem responsável" por último no empate', () => {
  assert.deepEqual(summarize(data.items, index).openByContractor, [
    { key: 'MZ CLIMATIZAÇÃO', label: 'MZ CLIMATIZAÇÃO', count: 2 },
    { key: NONE, label: 'Sem responsável', count: 2 },
    { key: 'HIDROTEC', label: 'HIDROTEC', count: 1 },
  ]);
});

test('abertas por pavimento: mais pendências primeiro, empate na ordem da obra; resolvida não conta', () => {
  assert.deepEqual(summarize(data.items, index).openByFloor, [
    { key: 'f4', label: '4° pavto', count: 4 },
    { key: 'f10', label: '10° pavto', count: 1 },
  ]);
});

test('fotos agrupadas por tipo e na ordem em que foram tiradas', () => {
  assert.deepEqual(
    photosOf(index, 'a').issue.map(p => p.id),
    ['p1', 'p2'],
  );
  assert.deepEqual(
    photosOf(index, 'd').correction.map(p => p.id),
    ['p3'],
  );
  assert.deepEqual(photosOf(index, 'sem-foto'), { issue: [], correction: [] });
});

test('opções de apto seguem o pavimento escolhido, na ordem da obra', () => {
  assert.deepEqual(
    unitOptions(data, 'f4').map(u => u.name),
    ['401', '402', '410'],
  );
  assert.deepEqual(
    unitOptions(data, '').map(u => u.name),
    ['401', '402', '410', '1001'],
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { assignLanes, GEOMETRY, lobLayout, rowHeightFor } from '../src/modules/longo-prazo/lob/lob-model';
import type { LobActivity, LobLocal, LobService } from '../src/domain/lob';

const NOW = '2026-11-11T12:00:00.000Z';
const local = (id: string, orderIndex: number): LobLocal => ({ id, workId: 'w', name: id, orderIndex, createdAt: NOW, updatedAt: NOW });
const service = (id: string, orderIndex: number): LobService => ({
  id,
  workId: 'w',
  name: id,
  color: '#2a78d6',
  orderIndex,
  createdAt: NOW,
  updatedAt: NOW,
});
const act = (id: string, serviceId: string, localId: string, start: string, durationDays: number): LobActivity => ({
  id,
  workId: 'w',
  serviceId,
  localId,
  start,
  durationDays,
  createdAt: NOW,
  updatedAt: NOW,
});

test('faixas: blocos em sequência ficam numa só; simultâneos repartem a linha', () => {
  // A e B em sequência (B começa no fim exclusivo de A); C, D e E juntos; F sozinho depois.
  const lanes = assignLanes([
    { start: '2026-11-02', end: '2026-11-09', order: 0 },
    { start: '2026-11-09', end: '2026-11-16', order: 1 },
    { start: '2026-11-16', end: '2026-11-23', order: 4 },
    { start: '2026-11-16', end: '2026-11-23', order: 2 },
    { start: '2026-11-16', end: '2026-11-23', order: 3 },
    { start: '2026-11-30', end: '2026-12-07', order: 5 },
  ]);
  assert.deepEqual(lanes, [
    { lane: 0, lanes: 1 },
    { lane: 0, lanes: 1 },
    { lane: 2, lanes: 3 },
    { lane: 0, lanes: 3 },
    { lane: 1, lanes: 3 },
    { lane: 0, lanes: 1 },
  ]);
});

test('faixas: sobreposição em cadeia reaproveita a faixa que vagou', () => {
  // Grua longa; Cremalheira 1 no meio; Elevador começa quando a Cremalheira acaba e volta à faixa dela.
  const lanes = assignLanes([
    { start: '2026-01-05', end: '2026-12-28', order: 0 },
    { start: '2026-03-02', end: '2026-06-01', order: 1 },
    { start: '2026-06-01', end: '2026-08-03', order: 2 },
  ]);
  assert.deepEqual(lanes, [
    { lane: 0, lanes: 2 },
    { lane: 1, lanes: 2 },
    { lane: 1, lanes: 2 },
  ]);
});

test('layout: linha com simultâneos cresce e os blocos não se cobrem; as demais seguem com 30 px', () => {
  const layout = lobLayout({
    data: {
      locals: [local('L1', 0), local('L2', 1)],
      services: [service('ALV', 0), service('ELE', 1), service('HID', 2), service('ACA', 3)],
      activities: [
        act('a1', 'ALV', 'L1', '2026-11-02', 5),
        act('a2', 'ELE', 'L1', '2026-11-09', 5),
        act('a3', 'HID', 'L1', '2026-11-09', 5),
        act('a4', 'ACA', 'L1', '2026-11-09', 5),
        act('b1', 'ALV', 'L2', '2026-11-09', 5),
      ],
    },
    zoom: 'semana',
    availableWidth: 1200,
    today: '2026-11-11',
  });
  const [l1, l2] = layout.rows;
  assert.equal(l1.lanes, 3);
  assert.equal(l1.height, rowHeightFor(3));
  assert.ok(l1.height > GEOMETRY.row);
  assert.deepEqual([l2.lanes, l2.height], [1, GEOMETRY.row]);
  // L2 (índice 1) fica em cima, encostada no topo; L1 logo abaixo.
  assert.equal(l2.y, GEOMETRY.top);
  assert.equal(l1.y, GEOMETRY.top + GEOMETRY.row);
  assert.equal(layout.innerH, l1.height + l2.height);
  const block = (id: string) => layout.blockById.get(id)!;
  // O bloco sem sobreposição ocupa a linha inteira; os três simultâneos, uma faixa cada, sem se cobrir.
  assert.equal(block('a1').h, l1.height - 2 * GEOMETRY.blockPad);
  const lanes = ['a2', 'a3', 'a4'].map(block).sort((a, b) => a.y - b.y);
  for (const b of lanes) assert.ok(b.h >= GEOMETRY.lane - 0.01);
  for (let i = 1; i < lanes.length; i++) assert.ok(lanes[i].y >= lanes[i - 1].y + lanes[i - 1].h);
  assert.ok(lanes[2].y + lanes[2].h <= l1.y + l1.height - GEOMETRY.blockPad + 0.01);
  // Ordem das faixas pela ordem dos serviços: Elétrica em cima.
  assert.deepEqual(
    lanes.map(b => b.service.id),
    ['ELE', 'HID', 'ACA'],
  );
});

test('layout: serviço escondido não ocupa faixa', () => {
  const layout = lobLayout({
    data: {
      locals: [local('L1', 0)],
      services: [service('ELE', 0), service('HID', 1)],
      activities: [act('a', 'ELE', 'L1', '2026-11-09', 5), act('b', 'HID', 'L1', '2026-11-09', 5)],
    },
    zoom: 'semana',
    availableWidth: 1200,
    today: '2026-11-11',
    hiddenServiceIds: new Set(['HID']),
  });
  assert.deepEqual([layout.rows[0].lanes, layout.rows[0].height], [1, GEOMETRY.row]);
});

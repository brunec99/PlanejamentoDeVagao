import test from 'node:test';
import assert from 'node:assert/strict';
import type { TerminalityData, TerminalityItem } from '../src/domain/terminality';
import { referenceOf, type DashboardFilters } from '../src/modules/dashboard/model';
import {
  buildTerminalityPanel,
  terminalityCompanies,
  terminalityFloorNames,
  terminalitySummary,
  type TerminalityPanelData,
} from '../src/modules/dashboard/terminality-panel';

const stamp = { createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };
const W = 'obra-1';
const floor = (id: string, name: string, orderIndex: number) => ({ ...stamp, id, workId: W, name, orderIndex });
const type = (id: string, name: string, orderIndex: number) => ({ ...stamp, id, workId: W, name, orderIndex, active: true });
const item = (id: string, patch: Partial<TerminalityItem>): TerminalityItem => ({
  ...stamp,
  id,
  workId: W,
  floorId: 'f2',
  description: `Pendência ${id}`,
  observedOn: '2026-10-01',
  status: 'open',
  createdBy: 'u1',
  ...patch,
});
const resolved = (correctedOn: string): Partial<TerminalityItem> => ({ status: 'resolved', correctedOn });

// Pavimentos de propósito fora da ordem cadastrada; três tipos; pendências espalhadas pelas 12 semanas.
const data: TerminalityData = {
  floors: [floor('f2', '2° pavto', 2), floor('f1', 'Térreo', 0)],
  units: [],
  types: [type('t1', 'A/C', 0), type('t2', 'Pintura', 1), type('t3', 'Hidráulica', 2)],
  people: [],
  items: [
    item('a', { observedOn: '2026-08-01', contractor: 'HIDROTEC', typeId: 't1' }),
    item('b', { observedOn: '2026-08-12', contractor: 'Hidrotec ', typeId: 't2', ...resolved('2026-09-02') }),
    // Resolvida depois da data de referência: na data, ainda aberta.
    item('c', { observedOn: '2026-09-15', contractor: 'MZ', typeId: 't3', ...resolved('2026-11-03') }),
    // Observada no domingo depois do sábado de referência: fica fora.
    item('d', { observedOn: '2026-11-01', contractor: 'MZ', floorId: 'f1', typeId: 't1' }),
    item('e', { observedOn: '2026-10-20', floorId: 'f1', typeId: 't1' }),
    item('f', { observedOn: '2026-10-28', contractor: 'Pintar', floorId: 'f1' }),
    item('g', { observedOn: '2026-10-05', contractor: 'MZ', typeId: 't2', ...resolved('2026-10-05') }),
    item('h', { observedOn: '2026-09-01', contractor: 'mz', typeId: 't3' }),
    // Resolvida antes das 12 semanas: conta no total e nas resolvidas, não na evolução.
    item('j', { observedOn: '2026-07-01', contractor: 'HIDROTEC', floorId: 'f1', typeId: 't1', ...resolved('2026-07-20') }),
  ],
  photos: [],
};
// Semana analisada de 26/10 a 31/10/2026 (semana 43 da obra, com a semana 1 em 05/01/2026).
const ref = referenceOf('2026-10-26', '2026-11-04', '2026-01-05');
const none: DashboardFilters = { week: ref.week };
const panel = buildTerminalityPanel(data, ref, none)!;
const text = (segments: { text: string }[]) => segments.map(s => s.text).join('');

test('entram só as pendências observadas até o sábado da semana analisada', () => {
  assert.equal(panel.total, 8);
  assert.equal(panel.refDate, '2026-10-31');
  assert.equal(panel.filtered, false);
});

test('resolvida depois da data conta como aberta; contagens e percentual como a aba 5', () => {
  assert.equal(panel.open, 5);
  assert.equal(panel.resolved, 3);
  assert.equal(panel.percent, 37.5);
  assert.equal(panel.percentLabel, '38%');
});

test('tempo médio em aberto das abertas e quantas passam de 30 dias', () => {
  // a 91 dias, c 46, e 11, f 3, h 60: média 42,2.
  assert.equal(panel.averageOpenDays, 42);
  assert.equal(panel.olderThan30, 3);
});

test('abertas por responsável terceiro juntam grafias, maior primeiro e "Sem responsável" por último no empate', () => {
  assert.deepEqual(panel.byContractor, [
    { label: 'MZ', count: 2 },
    { label: 'HIDROTEC', count: 1 },
    { label: 'Pintar', count: 1 },
    { label: 'Sem responsável', count: 1, none: true },
  ]);
  assert.equal(panel.contractorRest, 0);
});

test('abertas por pavimento: mais pendências primeiro, sem resto com dois pavimentos', () => {
  assert.deepEqual(panel.byFloor, [
    { label: '2° pavto', count: 3 },
    { label: 'Térreo', count: 2 },
  ]);
  assert.equal(panel.floorRest, 0);
});

test('rosca por tipo só com as abertas na data', () => {
  assert.deepEqual(
    panel.byType.map(s => [s.label, s.count, s.share]),
    [
      ['A/C', 2, 0.4],
      ['Hidráulica', 2, 0.4],
      ['Sem tipo', 1, 0.2],
    ],
  );
});

test('evolução: 12 semanas até a analisada, abertas e resolvidas por semana e saldo no fim dela', () => {
  assert.equal(panel.weeks.length, 12);
  assert.equal(panel.weeks[0].weekStart, '2026-08-10');
  assert.equal(panel.weeks[11].weekStart, '2026-10-26');
  assert.deepEqual(
    panel.weeks.map(w => w.label),
    [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43],
  );
  assert.deepEqual(
    panel.weeks.map(w => w.opened),
    [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1],
  );
  assert.deepEqual(
    panel.weeks.map(w => w.resolved),
    [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
  );
  assert.deepEqual(
    panel.weeks.map(w => w.balance),
    [2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 5],
  );
  // O saldo da semana analisada é o mesmo das abertas do quadro: a semana para no sábado de referência.
  assert.equal(panel.weeks[11].balance, panel.open);
});

test('filtro de empreiteiro vale em tudo e compara sem acento, caixa e espaço', () => {
  const p = buildTerminalityPanel(data, ref, { week: ref.week, companies: new Set(['hidrotec']) })!;
  assert.equal(p.filtered, true);
  assert.equal(p.total, 3);
  assert.equal(p.open, 1);
  assert.equal(p.resolved, 2);
  assert.deepEqual(p.byContractor, [{ label: 'HIDROTEC', count: 1 }]);
  assert.deepEqual(p.byFloor, [{ label: '2° pavto', count: 1 }]);
  assert.deepEqual(p.weeks.map(w => [w.opened, w.resolved, w.balance]).slice(0, 4), [
    [1, 0, 2],
    [0, 0, 2],
    [0, 0, 2],
    [0, 1, 1],
  ]);
  assert.equal(p.weeks[11].balance, 1);
});

test('filtro de pavimento pelo nome; pendência sem responsável só passa sem recorte de empreiteiro', () => {
  const p = buildTerminalityPanel(data, ref, { week: ref.week, floors: new Set(['terreo']) })!;
  assert.equal(p.filtered, true);
  assert.equal(p.total, 3);
  assert.equal(p.open, 2);
  assert.deepEqual(p.byContractor, [
    { label: 'Pintar', count: 1 },
    { label: 'Sem responsável', count: 1, none: true },
  ]);
  assert.deepEqual(
    p.byType.map(s => [s.label, s.count]),
    [
      ['A/C', 1],
      ['Sem tipo', 1],
    ],
  );
  const both = buildTerminalityPanel(data, ref, { week: ref.week, floors: new Set(['terreo']), companies: new Set(['MZ']) })!;
  assert.equal(both.total, 0);
  assert.equal(both.open, 0);
  assert.equal(both.percentLabel, '—');
  assert.equal(both.averageOpenDays, undefined);
  assert.equal(both.filtered, true);
  assert.deepEqual(both.byContractor, []);
  assert.ok(both.weeks.every(w => w.opened === 0 && w.resolved === 0 && w.balance === 0));
});

test('sem pendência observada até a data, o módulo não tem dado', () => {
  assert.equal(buildTerminalityPanel({ ...data, items: [] }, ref, none), undefined);
  assert.equal(buildTerminalityPanel({ ...data, items: [data.items[3]] }, ref, none), undefined);
  // O recorte que esvazia o quadro não o esconde.
  assert.notEqual(buildTerminalityPanel(data, ref, { week: ref.week, companies: new Set(['ninguém']) }), undefined);
});

test('listas cortam nos 6 maiores e dizem quanto os demais somam', () => {
  const floors = Array.from({ length: 8 }, (_, i) => floor(`p${i + 1}`, `P${i + 1}`, i));
  const items: TerminalityItem[] = [];
  // Pavimento k com k pendências; empreiteiro Ek com k pendências (E7 leva também as do 8°) e uma sem responsável.
  for (let k = 1; k <= 8; k++)
    for (let n = 0; n < k; n++)
      items.push(item(`p${k}-${n}`, { floorId: `p${k}`, contractor: k === 8 ? 'E7' : k === 1 && n === 0 ? undefined : `E${k}` }));
  items.push(item('extra', { floorId: 'p1' }));
  const p = buildTerminalityPanel({ ...data, floors, items }, ref, none)!;
  assert.equal(p.open, 37);
  assert.deepEqual(
    p.byFloor.map(f => [f.label, f.count]),
    [
      ['P8', 8],
      ['P7', 7],
      ['P6', 6],
      ['P5', 5],
      ['P4', 4],
      ['P3', 3],
    ],
  );
  assert.equal(p.floorRest, 4);
  assert.deepEqual(
    p.byContractor.map(c => [c.label, c.count]),
    [
      ['E7', 15],
      ['E6', 6],
      ['E5', 5],
      ['E4', 4],
      ['E3', 3],
      ['E2', 2],
    ],
  );
  assert.equal(p.contractorRest, 2);
});

test('opções dos seletores: empreiteiros distintos com a primeira grafia e pavimentos na ordem cadastrada', () => {
  assert.deepEqual(terminalityCompanies(data), [
    { value: 'HIDROTEC', count: 3 },
    { value: 'MZ', count: 4 },
    { value: 'Pintar', count: 1 },
  ]);
  assert.deepEqual(terminalityFloorNames(data), ['Térreo', '2° pavto']);
  assert.deepEqual(terminalityFloorNames({ ...data, floors: [...data.floors, floor('f9', ' TÉRREO', 9)] }), ['Térreo', '2° pavto']);
});

test('cartão do resumo: abertas, percentual resolvido e as antigas; frase compara com há 12 semanas', () => {
  const summary = terminalitySummary(panel, ref);
  assert.deepEqual(summary.kpi, {
    module: 'terminalidade',
    label: 'Pendências abertas',
    value: '5',
    tag: { text: '38% resolvido', tone: 'neutral' },
    hint: '3 resolvidas de 8 · 3 abertas há mais de 30 dias',
  });
  assert.equal(text(summary.sentence), 'A terminalidade tem 5 pendências abertas, 3 a mais que há 12 semanas.');
  assert.deepEqual(
    summary.sentence.filter(s => s.strong).map(s => s.text),
    ['5 pendências abertas'],
  );
});

test('frase com menos abertas, com o mesmo número e sem aberta', () => {
  const fewer: TerminalityPanelData = {
    ...panel,
    open: 1,
    olderThan30: 0,
    weeks: [{ ...panel.weeks[0], balance: 3 }, ...panel.weeks.slice(1)],
  };
  const less = terminalitySummary(fewer, ref);
  assert.equal(text(less.sentence), 'A terminalidade tem 1 pendência aberta, 2 a menos que há 12 semanas.');
  assert.equal(less.kpi.hint, '3 resolvidas de 8 · nenhuma há mais de 30 dias');

  const same = terminalitySummary({ ...panel, open: 2 }, ref);
  assert.equal(text(same.sentence), 'A terminalidade tem 2 pendências abertas, o mesmo número que há 12 semanas.');

  const done = terminalitySummary({ ...panel, open: 0, resolved: 8, percentLabel: '100%' }, ref);
  assert.equal(text(done.sentence), 'A terminalidade não tem pendência aberta.');
  assert.deepEqual(done.kpi.tag, { text: '100% resolvido', tone: 'good' });
  assert.equal(done.kpi.hint, '8 resolvidas de 8');
  assert.equal(done.kpi.tone, 'good');

  const empty = buildTerminalityPanel(data, ref, { week: ref.week, companies: new Set(['ninguém']) })!;
  const nothing = terminalitySummary(empty, ref);
  assert.equal(nothing.kpi.value, '0');
  assert.deepEqual(nothing.kpi.tag, { text: 'Sem pendência', tone: 'good' });
  assert.equal(nothing.kpi.hint, 'Nenhuma pendência registrada até a data');
});

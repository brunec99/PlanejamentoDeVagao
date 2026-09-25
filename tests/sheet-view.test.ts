import test from 'node:test';
import assert from 'node:assert/strict';
import { applySheetView, companyOptions, distinctValues, weekOptions } from '../src/modules/curto-prazo/sheet-view';

type Row = { empresa: string; inicio: string; status: string; ordem: number };
const rows: Row[] = [
  { empresa: 'ROCHA', inicio: '2026-09-22', status: 'Sim', ordem: 1 },
  { empresa: 'HIDROTEC', inicio: '2026-09-23', status: '', ordem: 2 },
  { empresa: 'HIDROTEC', inicio: '2026-09-21', status: 'Não', ordem: 3 },
  { empresa: '', inicio: '2026-09-21', status: 'Sim', ordem: 4 },
];
const accessors = { empresa: (r: Row) => r.empresa, status: (r: Row) => r.status, inicio: (r: Row) => r.inicio };
const byCompanyThenStart = (a: Row, b: Row) => (a.empresa === '') !== (b.empresa === '') ? (a.empresa ? -1 : 1) : a.empresa.localeCompare(b.empresa) || a.inicio.localeCompare(b.inicio);

test('distinctValues conta e deixa as vazias por último', () => {
  assert.deepEqual(distinctValues(rows, accessors.empresa), [{ value: 'HIDROTEC', count: 2 }, { value: 'ROCHA', count: 1 }, { value: '', count: 1 }]);
});

test('sem filtro nem classificação vale a ordem padrão: empresa, depois início', () => {
  assert.deepEqual(applySheetView([...rows], accessors, {}, undefined, byCompanyThenStart).map(r => r.ordem), [3, 2, 1, 4]);
});

test('filtro mantém só os valores marcados, inclusive a célula vazia', () => {
  assert.deepEqual(applySheetView([...rows], accessors, { status: new Set(['', 'Não']) }, undefined, byCompanyThenStart).map(r => r.ordem), [3, 2]);
});

test('filtros de colunas diferentes se somam', () => {
  assert.deepEqual(applySheetView([...rows], accessors, { status: new Set(['Sim']), empresa: new Set(['ROCHA']) }, undefined, byCompanyThenStart).map(r => r.ordem), [1]);
});

test('classificação decrescente deixa vazias no fim e desempata pela ordem padrão', () => {
  assert.deepEqual(applySheetView([...rows], accessors, {}, { column: 'status', dir: 'desc' }, byCompanyThenStart).map(r => r.ordem), [1, 4, 3, 2]);
});

test('weekOptions vai da primeira semana até quatro depois da atual', () => {
  assert.deepEqual(weekOptions('2026-09-07', '2026-09-21'), ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19']);
  assert.equal(weekOptions('2026-10-05', '2026-09-21', 0)[0], '2026-09-21');
});

test('companyOptions junta cadastro e digitadas sem repetir grafias equivalentes', () => {
  assert.deepEqual(companyOptions(['Hidrotec', 'Rocha Imper'], ['HIDROTEC ', 'JH Construções', 'jh construcoes']), ['Hidrotec', 'JH Construções', 'Rocha Imper']);
});

test('sortKeys ordena datas pela data, não pelo texto exibido', () => {
  const dated = [{ d: '2026-10-03' }, { d: '2026-09-28' }];
  const shown = (r: { d: string }) => r.d.slice(8) + '/' + r.d.slice(5, 7);
  assert.deepEqual(applySheetView([...dated], { d: shown }, {}, { column: 'd', dir: 'asc' }, () => 0, { d: r => r.d }).map(r => r.d), ['2026-09-28', '2026-10-03']);
});

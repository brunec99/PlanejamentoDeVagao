import test from 'node:test';
import assert from 'node:assert/strict';
import type { SafetyData, SafetyItem, SafetyPhoto, SafetyType } from '../src/domain/safety';
import {
  DEFAULT_FILTERS,
  MONTHLY_TOTAL_KEY,
  NONE,
  OPEN_OVER_DAYS,
  daysLabel,
  diffLabel,
  donutSlices,
  filterItems,
  groupItems,
  groupOf,
  hasActiveFilters,
  hasPeriod,
  indexSafety,
  isDay,
  isGrouping,
  isSortColumn,
  lastMonths,
  locationKey,
  locationLabel,
  locationOptions,
  locationSuggestions,
  monthLabel,
  monthWindow,
  monthlyByType,
  nextSort,
  percentLabel,
  periodInverted,
  periodLabel,
  photosOf,
  photosOfKind,
  sortItems,
  summarize,
  typeName,
  type SafetyFilters,
} from '../src/modules/seguranca/safety-view';

const stamp = { createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };
const W = 'obra-1';
const TODAY = '2026-11-05';
const type = (id: string, name: string, orderIndex: number, active = true): SafetyType => ({ ...stamp, id, name, orderIndex, active });
const item = (id: string, patch: Partial<SafetyItem>): SafetyItem => ({
  ...stamp,
  id,
  workId: W,
  consequence: 'Leve',
  probability: 'Possível',
  description: `Apontamento ${id}`,
  location: '',
  observedOn: '2026-11-01',
  status: 'open',
  origin: 'app',
  createdBy: 'u1',
  ...patch,
});
const photo = (id: string, itemId: string, kind: SafetyPhoto['kind'], createdAt: string): SafetyPhoto => ({
  id,
  itemId,
  workId: W,
  kind,
  storagePath: `${W}/${itemId}/${id}.jpg`,
  thumbPath: `${W}/${itemId}/${id}-thumb.jpg`,
  createdBy: 'u1',
  createdAt,
});
const resolved = (correctedOn: string): Partial<SafetyItem> => ({
  status: 'resolved',
  correctedOn,
  resolvedAt: `${correctedOn}T12:00:00Z`,
});

// Cadastro de propósito fora da ordem alfabética: a ordem do cadastro manda nos grupos, roscas e no quadro mensal.
const types = [type('t-prot', 'Proteções periféricas', 0), type('t-spiq', 'SPIQ – Linha de Vida', 1), type('t-epi', 'EPI', 2, false)];
const items: SafetyItem[] = [
  item('a', {
    typeId: 't-spiq',
    consequence: 'Morte',
    probability: 'Provável',
    description: 'Linha de vida sem tensão',
    location: '2° Pavimento',
    observedOn: '2026-11-03',
  }),
  item('b', {
    typeId: 't-prot',
    consequence: 'Severa',
    description: 'Guarda-corpo solto',
    location: '2º pavimento ',
    observedOn: '2026-10-20',
  }),
  item('c', {
    typeId: 't-prot',
    consequence: 'Significativa',
    probability: 'Remota',
    description: 'Rodapé faltando na laje',
    location: '2° Pavimento',
    observedOn: '2026-10-10',
    ...resolved('2026-10-14'),
    resolutionNote: 'Rodapé recolocado',
    origin: 'planilha',
  }),
  item('d', {
    consequence: 'Autuação/Multa',
    probability: 'Rara',
    description: 'Extintor vencido',
    location: 'Área de vivência',
    observedOn: '2026-09-15',
    ...resolved('2026-09-25'),
  }),
  item('e', { typeId: 't-epi', consequence: 'Nenhuma', description: 'Capacete sem jugular', location: 'Térreo', observedOn: '2026-11-03' }),
  item('f', {
    typeId: 't-prot',
    consequence: 'Leve',
    description: 'Tela da fachada rasgada',
    location: '10° Pavimento',
    observedOn: '2026-11-01',
  }),
];
const photos = [
  photo('p3', 'a', 'correction', '2026-11-04T10:00:00Z'),
  photo('p2', 'a', 'issue', '2026-11-03T11:00:00Z'),
  photo('p1', 'a', 'issue', '2026-11-03T10:00:00Z'),
  photo('p4', 'c', 'issue', '2026-10-10T10:00:00Z'),
];
const data: SafetyData = { types, items, photos };
const index = indexSafety(data);
const ids = (list: SafetyItem[]) => list.map(i => i.id);
const all: SafetyFilters = { ...DEFAULT_FILTERS, situation: 'all' };

test('índice: fotos do apontamento antes das da correção, cada grupo na ordem em que foram tiradas', () => {
  assert.deepEqual(
    photosOf(index, 'a').map(p => p.id),
    ['p1', 'p2', 'p3'],
  );
  assert.deepEqual(
    photosOfKind(index, 'a', 'issue').map(p => p.id),
    ['p1', 'p2'],
  );
  assert.deepEqual(
    photosOfKind(index, 'a', 'correction').map(p => p.id),
    ['p3'],
  );
  assert.deepEqual(photosOf(index, 'sem-foto'), []);
  assert.equal(typeName(index, items[0]), 'SPIQ – Linha de Vida');
  assert.equal(typeName(index, items[3]), '');
});

test('locationKey ignora acento, caixa, espaços e trata "°" e "º" como o mesmo sinal', () => {
  assert.equal(locationKey('2° Pavimento'), locationKey('  2º   PAVIMENTO '));
  assert.equal(locationKey('Área de vivência'), locationKey('area de vivencia'));
  assert.equal(locationKey('   '), '');
  assert.notEqual(locationKey('2° Pavimento'), locationKey('10° Pavimento'));
});

test('locationOptions junta grafias, usa a mais frequente e ordena pela contagem', () => {
  const options = locationOptions(items);
  assert.deepEqual(options[0], { key: locationKey('2° Pavimento'), label: '2° Pavimento', count: 3 });
  // Empate de contagem cai na ordem alfabética natural; local vazio não entra.
  assert.deepEqual(
    options.slice(1).map(o => o.label),
    ['10° Pavimento', 'Área de vivência', 'Térreo'],
  );
  assert.deepEqual(locationSuggestions(items), ['2° Pavimento', '10° Pavimento', 'Área de vivência', 'Térreo']);
  // O nome de exibição do item usa a grafia da obra, não a dele.
  assert.equal(locationLabel(index, items[1]), '2° Pavimento');
  // Empate entre grafias que só mudam na caixa: fica a primeira vista.
  const tie = locationOptions([item('x', { location: 'Canteiro' }), item('y', { location: 'canteiro' })]);
  assert.equal(tie[0].label, 'Canteiro');
});

test('filtros: situação aberta por padrão, valores do mesmo filtro somam e filtros diferentes restringem', () => {
  assert.deepEqual(ids(filterItems(items, DEFAULT_FILTERS, index)), ['a', 'b', 'e', 'f']);
  assert.deepEqual(ids(filterItems(items, { ...DEFAULT_FILTERS, situation: 'resolved' }, index)), ['c', 'd']);
  assert.deepEqual(ids(filterItems(items, { ...all, typeIds: ['t-prot', NONE] }, index)), ['b', 'c', 'd', 'f']);
  assert.deepEqual(ids(filterItems(items, { ...all, consequences: ['Morte', 'Severa'] }, index)), ['a', 'b']);
  assert.deepEqual(ids(filterItems(items, { ...all, probabilities: ['Rara'] }, index)), ['d']);
  assert.deepEqual(ids(filterItems(items, { ...all, locations: [locationKey('2º PAVIMENTO')] }, index)), ['a', 'b', 'c']);
  assert.deepEqual(ids(filterItems([...items, item('g', { location: ' ' })], { ...all, locations: [NONE] }, index)), ['g']);
  assert.deepEqual(ids(filterItems(items, { ...DEFAULT_FILTERS, typeIds: ['t-prot'], consequences: ['Leve'] }, index)), ['f']);
});

test('busca sem acento em descrição, local, tipo e "como foi corrigido"', () => {
  const search = (text: string) => ids(filterItems(items, { ...all, search: text }, index));
  assert.deepEqual(search('GUARDA-corpo'), ['b']);
  assert.deepEqual(search('area de vivencia'), ['d']);
  assert.deepEqual(search('linha de vida'), ['a']);
  assert.deepEqual(search('recolocado'), ['c']);
  assert.deepEqual(search('protecoes'), ['b', 'c', 'f']);
});

test('ignore desliga só os filtros pedidos, e hasActiveFilters reconhece cada um', () => {
  const filters: SafetyFilters = { ...DEFAULT_FILTERS, typeIds: ['t-spiq'], consequences: ['Severa'] };
  assert.deepEqual(ids(filterItems(items, filters, index)), []);
  assert.deepEqual(ids(filterItems(items, filters, index, ['typeIds'])), ['b']);
  assert.deepEqual(ids(filterItems(items, filters, index, ['typeIds', 'consequences', 'situation'])), ids(items));
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, search: '   ' }), false);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, situation: 'all' }), true);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, locations: [NONE] }), true);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, probabilities: ['Rara'] }), true);
});

test('ordem padrão: mais recente primeiro; no mesmo dia, ordem do cadastro de tipos e descrição', () => {
  // a e e são do mesmo dia: SPIQ (1) antes de EPI (2).
  assert.deepEqual(ids(sortItems(items, index, undefined, TODAY)), ['a', 'e', 'f', 'b', 'c', 'd']);
  const sameDay = [item('z1', { typeId: 't-prot', description: 'Zebra' }), item('z2', { typeId: 't-prot', description: 'Abertura' })];
  assert.deepEqual(ids(sortItems(sameDay, index, undefined, TODAY)), ['z2', 'z1']);
});

test('ciclo do cabeçalho: crescente → decrescente → ordem padrão; outra coluna recomeça no crescente', () => {
  const asc = nextSort(undefined, 'days');
  assert.deepEqual(asc, { column: 'days', dir: 'asc' });
  const desc = nextSort(asc, 'days');
  assert.deepEqual(desc, { column: 'days', dir: 'desc' });
  assert.equal(nextSort(desc, 'days'), undefined);
  assert.deepEqual(nextSort(desc, 'type'), { column: 'type', dir: 'asc' });
  assert.equal(isSortColumn('consequence'), true);
  assert.equal(isSortColumn('local'), false);
});

test('consequência e probabilidade classificam pela escala da planilha, não pelo alfabeto', () => {
  assert.deepEqual(ids(sortItems(items, index, { column: 'consequence', dir: 'asc' }, TODAY)), ['a', 'b', 'c', 'f', 'e', 'd']);
  assert.deepEqual(ids(sortItems(items, index, { column: 'consequence', dir: 'desc' }, TODAY)), ['d', 'e', 'f', 'c', 'b', 'a']);
  // Provável, Possível (empate na ordem padrão), Remota, Rara.
  assert.deepEqual(ids(sortItems(items, index, { column: 'probability', dir: 'asc' }, TODAY)), ['a', 'e', 'f', 'b', 'c', 'd']);
});

test('célula vazia fica no fim nos dois sentidos; dias de aberto contam até hoje', () => {
  assert.deepEqual(ids(sortItems(items, index, { column: 'type', dir: 'asc' }, TODAY)), ['e', 'f', 'b', 'c', 'a', 'd']);
  assert.deepEqual(ids(sortItems(items, index, { column: 'type', dir: 'desc' }, TODAY)), ['a', 'f', 'b', 'c', 'e', 'd']);
  assert.deepEqual(ids(sortItems(items, index, { column: 'correctedOn', dir: 'asc' }, TODAY)), ['d', 'c', 'a', 'e', 'f', 'b']);
  assert.deepEqual(ids(sortItems(items, index, { column: 'correctedOn', dir: 'desc' }, TODAY)), ['c', 'd', 'a', 'e', 'f', 'b']);
  // Fotos pela quantidade; sem foto no fim.
  assert.deepEqual(ids(sortItems(items, index, { column: 'issuePhotos', dir: 'desc' }, TODAY)), ['a', 'c', 'e', 'f', 'b', 'd']);
  // Dias: a 2, e 2, f 4, c 4, d 10, b 16.
  assert.deepEqual(ids(sortItems(items, index, { column: 'days', dir: 'asc' }, TODAY)), ['a', 'e', 'f', 'c', 'd', 'b']);
  assert.deepEqual(ids(sortItems(items, index, { column: 'situation', dir: 'asc' }, TODAY)), ['a', 'e', 'f', 'b', 'c', 'd']);
  assert.deepEqual(ids(sortItems(items, index, { column: 'location', dir: 'asc' }, TODAY)).slice(0, 4), ['a', 'b', 'c', 'f']);
  // Não altera a lista recebida.
  assert.deepEqual(ids(items), ['a', 'b', 'c', 'd', 'e', 'f']);
});

test('grupos: tipos na ordem do cadastro, locais em ordem natural, consequências pela gravidade; vazio no fim', () => {
  assert.deepEqual(
    groupItems(items, index, 'tipo').map(g => [g.label, ids(g.items)]),
    [
      ['Proteções periféricas', ['b', 'c', 'f']],
      ['SPIQ – Linha de Vida', ['a']],
      ['EPI', ['e']],
      ['Sem tipo', ['d']],
    ],
  );
  const withEmpty = [...items, item('g', { location: '' })];
  assert.deepEqual(
    groupItems(withEmpty, indexSafety({ ...data, items: withEmpty }), 'local').map(g => g.label),
    ['2° Pavimento', '10° Pavimento', 'Área de vivência', 'Térreo', 'Sem local'],
  );
  assert.deepEqual(
    groupItems(items, index, 'consequencia').map(g => g.label),
    ['Morte', 'Severa', 'Significativa', 'Leve', 'Nenhuma', 'Autuação/Multa'],
  );
  assert.deepEqual(groupOf(index, items[3], 'tipo'), { key: NONE, label: 'Sem tipo' });
  assert.deepEqual(groupOf(index, items[1], 'local'), { key: locationKey('2° Pavimento'), label: '2° Pavimento' });
  assert.equal(isGrouping('local'), true);
  assert.equal(isGrouping('pavimento'), false);
});

test('resumo: totais, % finalizado, média de dias para resolver e abertos há mais de 7 dias', () => {
  const summary = summarize(items, TODAY);
  assert.equal(summary.total, 6);
  assert.equal(summary.open, 4);
  assert.equal(summary.resolved, 2);
  assert.equal(Math.round(summary.percent ?? 0), 33);
  // c: 4 dias, d: 10 dias.
  assert.equal(summary.avgDaysToResolve, 7);
  // b está aberto há 16 dias; a, e (2) e f (4) não passam de 7.
  assert.equal(OPEN_OVER_DAYS, 7);
  assert.equal(summary.openOverDays, 1);
  const empty = summarize([], TODAY);
  assert.equal(empty.percent, undefined);
  assert.equal(empty.avgDaysToResolve, null);
  assert.equal(percentLabel(empty), '—');
  assert.equal(percentLabel({ percent: 99.7, open: 1 }), '99%');
  assert.equal(daysLabel(null), '—');
  assert.equal(daysLabel(3.25), '3,3');
  assert.equal(daysLabel(7), '7');
});

test('roscas: maior primeiro, empate na ordem do cadastro ou da escala, e "Outros" passando de 6', () => {
  assert.deepEqual(
    donutSlices(items, index, 'tipo').map(s => [s.label, s.count]),
    [
      ['Proteções periféricas', 3],
      ['SPIQ – Linha de Vida', 1],
      ['EPI', 1],
      ['Sem tipo', 1],
    ],
  );
  const consequences = donutSlices(items, index, 'consequencia');
  assert.deepEqual(
    consequences.map(s => s.key),
    ['Morte', 'Severa', 'Significativa', 'Leve', 'Nenhuma', 'Autuação/Multa'],
  );
  assert.ok(Math.abs(consequences.reduce((sum, s) => sum + s.share, 0) - 1) < 1e-9);
  const many = donutSlices(items, index, 'consequencia', 4);
  assert.deepEqual(
    many.map(s => [s.label, s.count, s.others]),
    [
      ['Morte', 1, undefined],
      ['Severa', 1, undefined],
      ['Significativa', 1, undefined],
      ['Outros', 3, 3],
    ],
  );
  assert.deepEqual(
    donutSlices(items, index, 'probabilidade').map(s => [s.key, s.count]),
    [
      ['Possível', 3],
      ['Provável', 1],
      ['Remota', 1],
      ['Rara', 1],
    ],
  );
  assert.deepEqual(donutSlices([], index, 'tipo'), []);
});

test('meses: janela de calendário até o mês de hoje, atravessando a virada do ano', () => {
  assert.deepEqual(lastMonths('2026-11-05', 4), ['2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(lastMonths('2027-02-01', 3), ['2026-12', '2027-01', '2027-02']);
  assert.equal(monthLabel('2026-09'), 'set/26');
});

test('mês a mês por tipo (quadro "Página15"): contagem pelo mês do apontamento, diferença e linha GERAL', () => {
  const extra = [...items, item('h', { typeId: 't-spiq', observedOn: '2026-10-02', ...resolved('2026-10-03') })];
  const table = monthlyByType(extra, index, TODAY);
  assert.deepEqual(table.months, ['2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(table.monthLabels, ['ago/26', 'set/26', 'out/26', 'nov/26']);
  assert.deepEqual(
    table.rows.map(r => [r.label, r.counts, r.diff, r.diffPercent]),
    [
      ['Proteções periféricas', [0, 0, 2, 1], -1, -50],
      ['SPIQ – Linha de Vida', [0, 0, 1, 1], 0, 0],
      ['EPI', [0, 0, 0, 1], 1, null],
      ['Sem tipo', [0, 1, 0, 0], 0, null],
    ],
  );
  assert.equal(table.total.key, MONTHLY_TOTAL_KEY);
  assert.equal(table.total.label, 'GERAL');
  assert.deepEqual(table.total.counts, [0, 1, 3, 3]);
  assert.equal(table.total.total, 7);
  assert.equal(table.total.diffPercent, 0);
  // Fora da janela não conta; sem nada na janela, nenhuma linha de tipo.
  const old = monthlyByType([item('old', { typeId: 't-prot', observedOn: '2026-01-10' })], index, TODAY);
  assert.deepEqual(old.rows, []);
  assert.deepEqual(old.total.counts, [0, 0, 0, 0]);
  assert.equal(monthlyByType(items, index, TODAY, 2).months.length, 2);
  assert.equal(diffLabel({ diff: -1, diffPercent: -50 }), '−1 (−50%)');
  assert.equal(diffLabel({ diff: 1, diffPercent: null }), '+1 (novo)');
  assert.equal(diffLabel({ diff: 0, diffPercent: null }), '0');
});

test('período pela data do apontamento: início e término inclusive, um lado vazio não limita', () => {
  // a 03/11, b 20/10, c 10/10, d 15/09, e 03/11, f 01/11.
  assert.deepEqual(ids(filterItems(items, { ...all, from: '2026-10-10', to: '2026-10-20' }, index)), ['b', 'c']);
  assert.deepEqual(ids(filterItems(items, { ...all, from: '2026-11-01' }, index)), ['a', 'e', 'f']);
  assert.deepEqual(ids(filterItems(items, { ...all, to: '2026-09-30' }, index)), ['d']);
  // Junta com os demais filtros e com a situação.
  assert.deepEqual(ids(filterItems(items, { ...DEFAULT_FILTERS, from: '2026-10-01', to: '2026-10-31' }, index)), ['b']);
  // Início depois do término: nada cabe.
  assert.deepEqual(filterItems(items, { ...all, from: '2026-11-01', to: '2026-10-01' }, index), []);
  // `ignore` desliga um lado.
  assert.deepEqual(ids(filterItems(items, { ...all, from: '2026-11-01', to: '2026-11-02' }, index, ['to'])), ['a', 'e', 'f']);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, from: '2026-10-01' }), true);
  assert.equal(hasActiveFilters({ ...DEFAULT_FILTERS, to: '2026-10-01' }), true);
  assert.equal(hasPeriod(DEFAULT_FILTERS), false);
  assert.equal(periodInverted({ from: '2026-11-01', to: '2026-10-01' }), true);
  assert.equal(periodInverted({ from: '2026-10-01', to: '2026-10-01' }), false);
  assert.equal(periodInverted({ from: '2026-11-01', to: '' }), false);
});

test('período por extenso e datas válidas', () => {
  assert.equal(periodLabel({ from: '2026-10-01', to: '2026-10-31' }), 'de 01/10/2026 a 31/10/2026');
  assert.equal(periodLabel({ from: '2026-10-01', to: '2026-10-01' }), 'em 01/10/2026');
  assert.equal(periodLabel({ from: '2026-10-01', to: '' }), 'a partir de 01/10/2026');
  assert.equal(periodLabel({ from: '', to: '2026-10-31' }), 'até 31/10/2026');
  assert.equal(periodLabel({ from: '', to: '' }), '');
  assert.equal(isDay('2026-02-28'), true);
  assert.equal(isDay('2026-02-30'), false);
  assert.equal(isDay('2026-2-1'), false);
  assert.equal(isDay('202611-01-01'), false);
  assert.equal(isDay(''), false);
});

test('meses do quadro com período: do início ao término, até hoje, no máximo 12', () => {
  // Sem período: os 4 meses até hoje.
  assert.deepEqual(monthWindow(TODAY, { from: '', to: '' }), { months: ['2026-08', '2026-09', '2026-10', '2026-11'], periodMonths: 4 });
  // Do mês do início ao do término.
  assert.deepEqual(monthWindow(TODAY, { from: '2026-06-15', to: '2026-09-10' }).months, ['2026-06', '2026-07', '2026-08', '2026-09']);
  // Dentro de um mês: uma coluna.
  assert.deepEqual(monthWindow(TODAY, { from: '2026-10-05', to: '2026-10-20' }), { months: ['2026-10'], periodMonths: 1 });
  // Término no futuro para no mês de hoje; só o início vai até hoje.
  assert.deepEqual(monthWindow(TODAY, { from: '2026-10-01', to: '2027-03-31' }).months, ['2026-10', '2026-11']);
  assert.deepEqual(monthWindow(TODAY, { from: '2026-09-01', to: '' }).months, ['2026-09', '2026-10', '2026-11']);
  // Só o término: os 4 meses até ele, atravessando o ano.
  assert.deepEqual(monthWindow(TODAY, { from: '', to: '2026-02-10' }).months, ['2025-11', '2025-12', '2026-01', '2026-02']);
  // Mais de 12 meses: os 12 últimos, com o tamanho do período para a tela avisar.
  const long = monthWindow(TODAY, { from: '2025-01-01', to: '2026-11-05' });
  assert.equal(long.periodMonths, 23);
  assert.equal(long.months.length, 12);
  assert.equal(long.months[0], '2025-12');
  assert.equal(long.months[11], '2026-11');
  // Início no futuro: o mês do início, sem quebrar.
  assert.deepEqual(monthWindow(TODAY, { from: '2027-01-10', to: '' }).months, ['2027-01']);
  // Início depois do término: uma coluna só (o quadro sai zerado, como a lista).
  assert.deepEqual(monthWindow(TODAY, { from: '2026-10-01', to: '2026-08-01' }), { months: ['2026-10'], periodMonths: 1 });
  // O quadro conta nos meses pedidos, só com os apontamentos que passaram pelo filtro.
  const scoped = filterItems(items, { ...all, from: '2026-09-01', to: '2026-10-31' }, index);
  const table = monthlyByType(scoped, index, TODAY, monthWindow(TODAY, { from: '2026-09-01', to: '2026-10-31' }).months);
  assert.deepEqual(table.months, ['2026-09', '2026-10']);
  assert.deepEqual(table.total.counts, [1, 2]);
});

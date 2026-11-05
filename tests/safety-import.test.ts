import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalLocation,
  matchWorks,
  normalizeRecord,
  parseCorrectionDate,
  parseCsv,
  parseProbability,
  parseSheetDay,
  photoColumnNote,
  planSafetyImport,
  readSheet,
  seededSafetyTypes,
  sheetTypeName,
  unifyLocations,
  type SafetyImportContext,
  type SafetyImportPlan,
  type SheetRecord,
  type WorkTarget,
} from '../src/application/use-cases/import-safety';
import { SAFETY_TABLES } from '../src/application/use-cases/safety-commands';
import type { SafetyData, SafetyItem, SafetyPhoto, SafetyType } from '../src/domain/safety';

/* Importação da planilha "SST - Controle geral" para a aba 6 (05/11/2026): cada linha passa pelos
 * comandos da aba (com `importing: true`), e rodar de novo só acrescenta o que é novo. */

const ESSENZA = '11111111-1111-4111-8111-111111111111';
const ATMOS = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-11-05T15:00:00.000Z';

function context(): SafetyImportContext {
  let n = 0;
  // Id estável de teste: o mesmo texto dá o mesmo UUID, como o sha1 do script.
  const stable = new Map<string, string>();
  const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  return {
    actorId: 'admin',
    now: NOW,
    today: '2026-11-05',
    newId: () => uuid(900000 + n++),
    idFor: seed => {
      if (!stable.has(seed)) stable.set(seed, uuid(stable.size + 1));
      return stable.get(seed)!;
    },
  };
}

const record = (over: Partial<SheetRecord> & { row: number }): SheetRecord => ({
  obra: 'Essenza',
  tipo: 'Proteções periféricas',
  consequencia: 'Severa',
  probabilidade: 'Possível',
  descricao: 'Guarda-corpo solto na laje',
  local: '2 pavimento ',
  observado: '10/10/2026',
  fotoApontamento: '',
  corrigido: '',
  fotoCorrecao: '',
  ...over,
});

const target = (over: Partial<WorkTarget> = {}): WorkTarget => ({
  obra: 'Essenza',
  workId: ESSENZA,
  workName: 'Essenza',
  items: [],
  photos: [],
  ...over,
});

function plan(rows: SheetRecord[], works: WorkTarget[] = [target()], types: SafetyType[] = seededSafetyTypes(NOW), ctx = context()) {
  return planSafetyImport({ rows, types, works }, ctx);
}

/** O que o banco teria depois de gravar o plano de uma obra (tipos e obra). */
function saved(result: SafetyImportPlan, types: SafetyType[] = seededSafetyTypes(NOW), index = 0) {
  const work = result.works[index];
  const data: SafetyData = { types, items: work.target.items, photos: work.target.photos };
  for (const mutation of [result.types.mutation, work.mutation])
    for (const table of SAFETY_TABLES) {
      const updates = new Map((mutation.update[table] as { id: string }[]).map(r => [r.id, r]));
      (data as unknown as Record<string, { id: string }[]>)[table] = (data[table] as { id: string }[])
        .map(r => updates.get(r.id) ?? r)
        .concat(mutation.insert[table] as { id: string }[]);
    }
  return data;
}

test('CSV RFC 4180: aspas, vírgula e quebra de linha no campo; linha da planilha por registro; em branco pulado', () => {
  assert.deepEqual(parseCsv('﻿a,"b, c","d ""e"""\r\n1,"2\n3",\n'), [
    ['a', 'b, c', 'd "e"'],
    ['1', '2\n3', ''],
  ]);
  const header =
    'Obra,Tipo de apontamento,Risco: consequência,Risco: Probabilidade,Descrição,Local,Data do apontamento,Foto do apontamento,Data de correção,Foto da correção,Dias para resolver';
  const csv = [
    header,
    'Atmos,Bandeja,Leve,Rara,"Bandeja\ncom entulho",Térreo,01/10/2026,,,,35',
    ',,,,,,,,,,0',
    'Tauá,Bandeja,Leve,Rara,Outra,Térreo,02/10/2026,,03/10/2026,,1',
  ].join('\n');
  const sheet = readSheet(parseCsv(csv));
  assert.equal(sheet.blank, 1);
  assert.deepEqual(
    sheet.rows.map(r => [r.row, r.obra, r.descricao]),
    [
      [2, 'Atmos', 'Bandeja\ncom entulho'],
      [4, 'Tauá', 'Outra'],
    ],
  );
  assert.throws(() => readSheet(parseCsv('Obra,Descrição\nA,B')), /Colunas não encontradas/);
});

test('tipos: grafias do catálogo pela chave, sinônimos claros e o resto como tipo novo', () => {
  assert.equal(sheetTypeName(' Elétrica irregular'), 'Elétrica irregular');
  assert.equal(sheetTypeName('Escada / Bancadas / Rampas'), 'Escada / Bancadas');
  assert.equal(sheetTypeName('Limpeza e organização'), 'Organização / Limpeza');
  assert.equal(sheetTypeName('Projetos SST'), 'Projeto SST');
  assert.equal(sheetTypeName('risco de acidente'), 'Risco de acidente');
  assert.equal(sheetTypeName(''), undefined);

  const spellings = [
    'SPIQ - Linha de Vida',
    'SPIQ (Linha de vida)',
    'Maquinas e equipamentos',
    'Organização/ limpeza',
    'Area de Vivencia',
    'Tela de fachada',
    ' Elétrica irregular',
    'Escadas',
    'Bancadas',
    'Projeto SST',
    'Projetos SST',
    'Proteções coletivas',
    'Proteções coletivas',
    'risco de acidente',
    '',
  ];
  const result = plan(spellings.map((tipo, i) => record({ row: i + 2, tipo, descricao: `Linha ${i}` })));
  const types = [...seededSafetyTypes(NOW), ...result.types.mutation.insert.types];
  const nameOf = (row: number) => {
    const item = result.works[0].mutation.insert.items[row - 2];
    return types.find(t => t.id === item.typeId)?.name;
  };
  assert.deepEqual(
    spellings.map((_, i) => nameOf(i + 2)),
    [
      'SPIQ – Linha de Vida',
      'SPIQ – Linha de Vida',
      'Máquinas e equipamentos',
      'Organização / Limpeza',
      'Área de vivência',
      'Tela de Fachada',
      'Elétrica irregular',
      'Escada / Bancadas',
      'Escada / Bancadas',
      'Projeto SST',
      'Projeto SST',
      'Proteções coletivas',
      'Proteções coletivas',
      'Risco de acidente',
      undefined,
    ],
  );
  assert.deepEqual(result.types.created, [
    { name: 'Projeto SST', spellings: ['Projeto SST', 'Projetos SST'], rows: 2 },
    { name: 'Proteções coletivas', spellings: ['Proteções coletivas'], rows: 2 },
    { name: 'Risco de acidente', spellings: ['risco de acidente'], rows: 1 },
  ]);
  // Tipo novo entra no fim da lista única, sem obra.
  assert.equal(result.types.mutation.workId, undefined);
  assert.deepEqual(
    result.types.mutation.insert.types.map(t => t.orderIndex),
    [16, 17, 18],
  );
  assert.equal(result.typeMappings.find(m => m.spelling === 'Escadas')?.how, 'sinônimo');
  assert.equal(result.typeMappings.find(m => m.spelling === 'Maquinas e equipamentos')?.how, 'catálogo');
});

test('locais: pavimentos, térreo, ático, subsolo e mezanino; o resto só ganha a maiúscula se estava todo minúsculo', () => {
  const cases: [string, string][] = [
    ['2 pavimento ', '2° Pavimento'],
    ['02 pavimento', '2° Pavimento'],
    ['2° pavimento', '2° Pavimento'],
    ['12° PAVIMENTO', '12° Pavimento'],
    ['14 ° Pavimento', '14° Pavimento'],
    ['3ºPavimento', '3° Pavimento'],
    ['5⁰pavimento ', '5° Pavimento'],
    ['2°andar ', '2° Pavimento'],
    ['3 andar', '3° Pavimento'],
    ['4°', '4° Pavimento'],
    ['térreo ', 'Térreo'],
    ['TÉRREO', 'Térreo'],
    ['terriu ', 'Térreo'],
    ['Terreo', 'Térreo'],
    ['ATICO', 'Ático'],
    ['atico ', 'Ático'],
    ['subsolo ', 'Subsolo'],
    ['MEZANINO', 'Mezanino'],
    ['vestiário ', 'Vestiário'],
    ['obra', 'Obra'],
    ['Geral', 'Geral'],
    ['GERAL', 'GERAL'],
    ['1101', '1101'],
    ['subsolo rampa ', 'Subsolo rampa'],
    ['2 e 3 pavimento ', '2 e 3 pavimento'],
    ['Duplex \n(12°)', 'Duplex (12°)'],
    ['', ''],
  ];
  for (const [raw, expected] of cases) assert.equal(canonicalLocation(raw), expected, JSON.stringify(raw));

  // Só acento e caixa: fica a grafia do sistema; senão, a mais usada na planilha.
  const map = unifyLocations(['Vestiário', 'VESTIÁRIO', 'Vestiário', 'Carpintaria', 'Carpintária', 'Refeitório'], ['Refeitorio']);
  assert.equal(map.get('VESTIÁRIO'), 'Vestiário');
  assert.equal(map.get('Carpintária'), 'Carpintaria');
  assert.equal(map.get('Refeitório'), 'Refeitorio');

  const result = plan([
    record({ row: 2, local: '2 pavimento ' }),
    record({ row: 3, local: '02 pavimento', descricao: 'Outro' }),
    record({ row: 4, local: 'VESTIÁRIO', descricao: 'Outro 2' }),
    record({ row: 5, local: 'vestiário ', descricao: 'Outro 3' }),
    record({ row: 6, local: 'vestiário', descricao: 'Outro 4' }),
  ]);
  assert.deepEqual(
    result.works[0].mutation.insert.items.map(i => i.location),
    ['2° Pavimento', '2° Pavimento', 'Vestiário', 'Vestiário', 'Vestiário'],
  );
  assert.deepEqual([result.works[0].report.locationsBefore, result.works[0].report.locationsAfter], [4, 2]);
});

test('datas: DD/MM/AAAA; correção sem ano ou com ano de 2 dígitos, com aviso', () => {
  assert.equal(parseSheetDay('07/05/2026'), '2026-05-07');
  assert.equal(parseSheetDay('31/02/2026'), undefined);
  assert.equal(parseSheetDay('2026-05-07'), undefined);
  assert.deepEqual(parseCorrectionDate('08/05', '2026-05-07'), { date: '2026-05-08', fixed: 'sem-ano' });
  assert.deepEqual(parseCorrectionDate('15/01', '2025-12-20'), { date: '2026-01-15', fixed: 'sem-ano' });
  assert.deepEqual(parseCorrectionDate('27/10/25', '2025-10-20'), { date: '2025-10-27', fixed: 'ano-curto' });
  assert.deepEqual(parseCorrectionDate('06/04/2026', '2026-04-01'), { date: '2026-04-06' });
  assert.deepEqual(parseCorrectionDate('', '2026-04-01'), {});
  assert.deepEqual(parseCorrectionDate('ontem', '2026-04-01'), { unreadable: true });

  const result = plan([
    record({ row: 524, observado: '07/05/2026', corrigido: '08/05' }),
    record({ row: 1025, observado: '20/10/2025', corrigido: '27/10/25', descricao: 'B' }),
    record({ row: 30, observado: '10/10/2026', corrigido: '01/10/2026', descricao: 'C' }),
    record({ row: 31, observado: '10/10/2026', corrigido: '10/12/2026', descricao: 'D' }),
    record({ row: 32, observado: '10/10/2026', corrigido: '?', descricao: 'E' }),
  ]);
  const items = result.works[0].mutation.insert.items;
  assert.deepEqual(
    items.map(i => [i.status, i.correctedOn]),
    [
      ['resolved', '2026-05-08'],
      ['resolved', '2025-10-27'],
      ['open', undefined],
      ['open', undefined],
      ['open', undefined],
    ],
  );
  assert.deepEqual(
    result.works[0].report.warnings.map(w => [w.row, w.kind]),
    [
      [524, 'correcao-sem-ano'],
      [1025, 'correcao-ano-curto'],
      [30, 'correcao-anterior'],
      [31, 'correcao-futura'],
      [32, 'correcao-ilegivel'],
    ],
  );
});

test('risco: "Nenhum" vira Rara com aviso; valor fora da lista é erro e a linha não entra', () => {
  assert.deepEqual(parseProbability('Nenhum'), { value: 'Rara', fromNone: true });
  assert.deepEqual(parseProbability('provável'), { value: 'Provável' });
  const result = plan([
    record({ row: 2, probabilidade: 'Nenhum' }),
    record({ row: 3, consequencia: 'Grave', descricao: 'B' }),
    record({ row: 4, observado: '31/02/2026', descricao: 'C' }),
    record({ row: 5, descricao: '  ' }),
    record({ row: 6, consequencia: 'Autuação/Multa', descricao: 'D' }),
  ]);
  const report = result.works[0].report;
  assert.deepEqual(
    result.works[0].mutation.insert.items.map(i => [i.probability, i.consequence]),
    [
      ['Rara', 'Severa'],
      ['Possível', 'Autuação/Multa'],
    ],
  );
  assert.deepEqual(
    report.warnings.map(w => [w.row, w.kind]),
    [[2, 'probabilidade-nenhum']],
  );
  assert.deepEqual(
    report.errors.map(e => [e.row, e.kind]),
    [
      [3, 'consequencia'],
      [4, 'data-apontamento'],
      [5, 'descricao'],
    ],
  );
  assert.deepEqual([report.rows, report.created], [5, 2]);
});

test('texto nas colunas de foto: observação na descrição ou "como foi corrigido"; "?" e data solta saem', () => {
  assert.deepEqual(photoColumnNote(' ? '), {});
  assert.deepEqual(photoColumnNote('-'), {});
  assert.deepEqual(photoColumnNote('08/12/2025'), { dateOnly: true });
  assert.deepEqual(photoColumnNote('Projeto  enviado'), { note: 'Projeto enviado' });

  const result = plan([
    record({ row: 2, fotoApontamento: 'Repetido', corrigido: '12/10/2026', fotoCorrecao: 'Escadas desmontadas' }),
    record({ row: 3, descricao: 'B', fotoApontamento: '?', fotoCorrecao: 'inserir foto' }),
    record({ row: 4, descricao: 'C', corrigido: '11/10/2026', fotoCorrecao: '11/10/2026' }),
  ]);
  const items = result.works[0].mutation.insert.items;
  assert.equal(items[0].description, 'Guarda-corpo solto na laje — Obs.: Repetido');
  assert.equal(items[0].resolutionNote, 'Escadas desmontadas');
  assert.equal(items[1].description, 'B — Obs.: inserir foto');
  assert.equal(items[1].status, 'open');
  assert.equal(items[2].description, 'C');
  assert.equal(items[2].resolutionNote, undefined);
  const report = result.works[0].report;
  assert.deepEqual([report.notesInDescription, report.resolutionNotes], [2, 1]);
  assert.deepEqual(
    report.warnings.map(w => [w.row, w.kind]),
    [[4, 'nota-data']],
  );
  assert.ok(
    normalizeRecord(record({ row: 9, fotoApontamento: 'x'.repeat(990) }), '2026-11-05').warnings.some(w => w.kind === 'descricao-cortada'),
  );
});

test('origem planilha, finalizado sem foto e numa gravação só; a ordem da planilha fica no created_at', () => {
  const result = plan([record({ row: 2, corrigido: '12/10/2026' }), record({ row: 3, descricao: 'B' })]);
  const { insert, update } = result.works[0].mutation;
  assert.equal(result.works[0].mutation.workId, ESSENZA);
  assert.deepEqual(
    insert.items.map(i => [i.origin, i.status, i.createdBy]),
    [
      ['planilha', 'resolved', 'admin'],
      ['planilha', 'open', 'admin'],
    ],
  );
  assert.equal(insert.items[0].resolvedBy, 'admin');
  assert.equal(update.items.length, 0, 'a finalização de apontamento novo vai na própria inserção');
  assert.ok(insert.items[0].createdAt < insert.items[1].createdAt);
  assert.deepEqual([result.works[0].report.resolved, result.works[0].report.open], [1, 1]);
});

test('linhas idênticas viram apontamentos distintos; rodar de novo não duplica nem sobrescreve', () => {
  const ctx = context();
  const twin = record({ row: 2 });
  const rows = [twin, { ...twin, row: 3 }, record({ row: 4, descricao: 'Extintor vencido', local: 'térreo' })];
  const first = plan(rows, [target()], seededSafetyTypes(NOW), ctx);
  const items = first.works[0].mutation.insert.items;
  assert.equal(items.length, 3);
  assert.notEqual(items[0].id, items[1].id);

  // O TST corrigiu a descrição na tela: rodar de novo não volta o texto da planilha.
  const data = saved(first);
  data.items = data.items.map(i => (i.id === items[2].id ? { ...i, description: 'Extintor vencido (trocado o lacre)' } : i));
  const again = plan(rows, [target({ items: data.items, photos: data.photos })], data.types, ctx);
  assert.deepEqual([again.works[0].report.created, again.works[0].report.existing], [0, 3]);
  for (const table of SAFETY_TABLES) {
    assert.equal(again.works[0].mutation.insert[table].length, 0);
    assert.equal(again.works[0].mutation.update[table].length, 0);
  }

  // Depois: a planilha ganhou a correção de uma linha e uma linha nova; outra foi finalizada no sistema.
  const resolvedInSystem: SafetyItem[] = data.items.map(i =>
    i.id === items[1].id ? { ...i, status: 'resolved', correctedOn: '2026-10-20', resolvedAt: NOW, resolvedBy: 'tst' } : i,
  );
  const later = plan(
    [{ ...twin, corrigido: '15/10/2026', fotoCorrecao: 'Fixado' }, { ...twin, row: 3 }, rows[2], record({ row: 5, descricao: 'Nova' })],
    [target({ items: resolvedInSystem, photos: [] })],
    data.types,
    ctx,
  );
  const report = later.works[0].report;
  assert.deepEqual([report.created, report.existing, report.resolvedNow, report.resolved, report.open], [1, 3, 1, 2, 2]);
  assert.deepEqual(
    later.works[0].mutation.update.items.map(i => [i.id, i.status, i.correctedOn, i.resolutionNote]),
    [[items[0].id, 'resolved', '2026-10-15', 'Fixado']],
  );
  assert.deepEqual(
    report.warnings.map(w => [w.row, w.kind]),
    [[3, 'resolvido-no-sistema']],
  );
  assert.equal(later.works[0].mutation.insert.items[0].description, 'Nova');
});

test('tipo novo não se repete ao rodar de novo nem entre obras; obra fora da importação é contada e pulada', () => {
  const ctx = context();
  const rows = [
    record({ row: 2, tipo: 'Balancins' }),
    record({ row: 3, obra: 'Atmos', tipo: 'balancins' }),
    record({ row: 4, obra: 'My Sunset', tipo: 'Poço elevador' }),
    record({ row: 5, obra: 'My Sunset' }),
  ];
  const works = [target(), target({ obra: 'Atmos', workId: ATMOS, workName: 'Atmos' })];
  const first = plan(rows, works, seededSafetyTypes(NOW), ctx);
  assert.deepEqual(
    first.types.created.map(t => [t.name, t.rows]),
    [['Balancins', 2]],
  );
  assert.equal(first.works[1].mutation.insert.items[0].typeId, first.types.mutation.insert.types[0].id);
  assert.notEqual(first.works[0].mutation.insert.items[0].id, first.works[1].mutation.insert.items[0].id);
  assert.deepEqual(first.skipped, [{ obra: 'My Sunset', rows: 2 }]);

  const types = [...seededSafetyTypes(NOW), ...first.types.mutation.insert.types];
  const again = plan(rows, works, types, ctx);
  assert.equal(again.types.mutation.insert.types.length, 0);

  // Tipo desativado no sistema: o apontamento entra sem tipo, com aviso.
  const disabled = types.map(t => (t.name === 'Balancins' ? { ...t, active: false } : t));
  const withDisabled = plan([rows[0]], [target()], disabled, context());
  assert.equal(withDisabled.works[0].mutation.insert.items[0].typeId, undefined);
  assert.equal(withDisabled.works[0].report.warnings[0].kind, 'tipo-desativado');
});

test('obras: nome ou código sem acento, indicação em --obras, aproximação única; o resto fica de fora', () => {
  const works = [
    { id: 'w-atm', name: 'Atmos', code: 'ATM' },
    { id: 'w-tau', name: 'Taua', code: 'TAU' },
    { id: 'w-mzn', name: 'Residencial Mozine', code: 'MZN' },
    { id: 'w-ess', name: 'Essenza', code: 'ESS' },
  ];
  const result = matchWorks(['Atmos', 'Tauá', 'Mozine', 'ESS', 'My Sunset', 'Amariles', 'Blentt'], works, { blentt: 'ESS', Outra: 'nada' });
  assert.deepEqual(
    result.matched.map(m => [m.obra, m.work.id, m.how]),
    [
      ['Atmos', 'w-atm', 'nome'],
      ['Tauá', 'w-tau', 'nome'],
      ['Mozine', 'w-mzn', 'aproximada'],
      ['ESS', 'w-ess', 'código'],
      ['Blentt', 'w-ess', 'indicada'],
    ],
  );
  assert.deepEqual(result.unmatched, ['My Sunset', 'Amariles']);
  assert.deepEqual(matchWorks(['Mozine'], works, { Mozine: 'inexistente' }).badOverrides, ['Mozine → inexistente']);
});

test('fotos da passada posterior: id estável por apontamento e endereço, caminho do bucket, sem repetir', () => {
  const ctx = context();
  const rows = [record({ row: 2, corrigido: '12/10/2026' }), record({ row: 3, descricao: 'B' })];
  const photos = {
    '2': { issue: ['https://exemplo.com/a.jpg', 'https://exemplo.com/a.jpg'], correction: ['https://exemplo.com/b.jpg'] },
    '3': { issue: ['ftp://exemplo.com/c.jpg'] },
    '9': { issue: ['https://exemplo.com/d.jpg'] },
  };
  const first = planSafetyImport({ rows, types: seededSafetyTypes(NOW), works: [target()], photos }, ctx);
  const work = first.works[0];
  assert.deepEqual(
    work.uploads.map(u => [u.row, u.kind, u.url]),
    [
      [2, 'issue', 'https://exemplo.com/a.jpg'],
      [2, 'correction', 'https://exemplo.com/b.jpg'],
    ],
  );
  assert.ok(work.uploads.every(u => u.storagePath === `${ESSENZA}/${u.itemId}/${u.photoId}.jpg` && u.thumbPath.endsWith('-thumb.jpg')));
  assert.deepEqual(
    work.mutation.insert.photos.map(p => p.kind),
    ['issue', 'correction'],
  );
  assert.deepEqual(
    work.report.warnings.map(w => [w.row, w.kind]),
    [[3, 'foto-url']],
  );
  assert.deepEqual(
    first.photoIssues.map(i => [i.row, i.kind]),
    [[9, 'foto-sem-linha']],
  );

  // Segunda passada: o apontamento já existe (finalizado) e as fotos já registradas são puladas.
  const data = saved(first);
  const again = planSafetyImport(
    { rows, types: data.types, works: [target({ items: data.items, photos: data.photos as SafetyPhoto[] })], photos },
    ctx,
  );
  assert.equal(again.works[0].uploads.length, 0);
  assert.equal(again.works[0].report.existing, 2);
  const more = planSafetyImport(
    {
      rows,
      types: data.types,
      works: [target({ items: data.items, photos: data.photos })],
      photos: { '3': { issue: ['https://exemplo.com/e.jpg'] } },
    },
    ctx,
  );
  assert.deepEqual(
    more.works[0].uploads.map(u => [u.row, u.itemId]),
    [[3, data.items[1].id]],
  );
});

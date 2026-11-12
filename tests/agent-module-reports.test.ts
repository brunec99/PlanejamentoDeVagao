import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAFETY_TOOL_SPEC,
  TERMINALITY_TOOL_SPEC,
  safetyReport,
  terminalityReport,
  type ModuleReportEntry,
} from '../src/application/use-cases/agent-module-reports';
import type { TerminalityData, TerminalityItem, TerminalityPhoto } from '../src/domain/terminality';
import type { SafetyData, SafetyItem, SafetyPhoto } from '../src/domain/safety';
import { indexTerminality, percentLabel, summarize as summarizeTerminality } from '../src/modules/terminalidade/terminality-view';
import { daysLabel, summarize as summarizeSafety } from '../src/modules/seguranca/safety-view';

/** Relatórios da Claudia geral para as abas 5 e 6 (08/11/2026). Hoje fixo em 08/11/2026: a janela dos
 * "últimos 7 dias" vai de 02/11 a 08/11. */
const TODAY = '2026-11-08';
const stamp = { createdAt: '2026-10-01T10:00:00Z', updatedAt: '2026-10-01T10:00:00Z' };

// ─── Terminalidade ──────────────────────────────────────────────────────────────

const W = 'obra-mzn';
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
const tPhoto = (id: string, itemId: string, kind: TerminalityPhoto['kind']): TerminalityPhoto => ({
  id,
  itemId,
  workId: W,
  kind,
  storagePath: `${W}/${itemId}/${id}.jpg`,
  thumbPath: `${W}/${itemId}/${id}-thumb.jpg`,
  createdBy: 'u1',
  createdAt: `2026-10-01T10:00:0${id.slice(-1)}Z`,
});
function terminality(): TerminalityData {
  return {
    floors: [
      { ...stamp, id: 'f0', workId: W, name: 'Térreo', orderIndex: 0 },
      { ...stamp, id: 'f4', workId: W, name: '4° pavto', orderIndex: 4 },
      { ...stamp, id: 'f14', workId: W, name: '14° pavto', orderIndex: 14 },
    ],
    units: [
      { ...stamp, id: 'u401', workId: W, floorId: 'f4', name: '401', orderIndex: 0 },
      { ...stamp, id: 'u402', workId: W, floorId: 'f4', name: '402', orderIndex: 1 },
    ],
    types: [
      { ...stamp, id: 't-ac', workId: W, name: 'A/C', orderIndex: 0, active: true },
      { ...stamp, id: 't-pt', workId: W, name: 'Pintura', orderIndex: 1, active: true },
    ],
    people: [{ ...stamp, id: 'p-joao', workId: W, name: 'João', active: true }],
    items: [
      // a: a mais antiga aberta (68 dias), com duas fotos do problema.
      item('a', { unitId: 'u401', typeId: 't-ac', contractor: 'MZ Climatização', observedOn: '2026-09-01', atrPersonId: 'p-joao' }),
      // b: aberta há 9 dias.
      item('b', { unitId: 'u402', typeId: 't-pt', contractor: 'Hidrotec', observedOn: '2026-10-30', description: 'Parede | manchada' }),
      // c: aberta há 3 dias, do pavimento (sem apto), sem tipo nem empreiteiro.
      item('c', { observedOn: '2026-11-05', description: 'Escada sem corrimão' }),
      // d: resolvida em 10 dias, com o texto da correção e uma foto da correção.
      item('d', {
        floorId: 'f0',
        typeId: 't-pt',
        contractor: 'HIDROTEC ',
        observedOn: '2026-10-01',
        status: 'resolved',
        correctedOn: '2026-10-11',
        resolutionNote: 'Rejunte refeito',
      }),
      // e: resolvida em 3 dias, dentro dos últimos 7 dias.
      item('e', {
        floorId: 'f0',
        typeId: 't-ac',
        contractor: 'mz climatizacao',
        observedOn: '2026-11-01',
        status: 'resolved',
        correctedOn: '2026-11-04',
      }),
    ],
    photos: [tPhoto('p1', 'a', 'issue'), tPhoto('p2', 'a', 'issue'), tPhoto('p3', 'd', 'correction')],
  };
}
const one = (data = terminality(), workName = 'Mozine'): ModuleReportEntry<TerminalityData>[] => [{ workId: W, workName, data }];
/** As linhas da lista de pendências (as que trazem a data de observação). */
const detail = (report: string) => report.split('\n').filter(line => / \| \d{2}\/\d{2}\/\d{4} \| \d+ \| /.test(line));

test('specs: nomes fixos, obra declarada com a descrição combinada e sem campos extras', () => {
  for (const spec of [TERMINALITY_TOOL_SPEC, SAFETY_TOOL_SPEC]) {
    const schema = spec.input_schema as {
      type: string;
      properties: Record<string, { type: string; description?: string }>;
      additionalProperties: boolean;
    };
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.obra.type, 'string');
    assert.equal(
      schema.properties.obra.description,
      'Nome, sigla ou id da obra, ou "todas" para todas as obras. Sem ela, vale a obra da tela em que a pessoa está.',
    );
    for (const key of ['status', 'de', 'ate', 'agrupar_por', 'limite', 'busca']) assert.ok(schema.properties[key], `${spec.name}: ${key}`);
  }
  assert.equal(TERMINALITY_TOOL_SPEC.name, 'consultar_terminalidade');
  assert.equal(SAFETY_TOOL_SPEC.name, 'consultar_seguranca');
  const t = TERMINALITY_TOOL_SPEC.input_schema as { properties: Record<string, unknown> };
  for (const key of ['pavimento', 'apartamento', 'tipo', 'empreiteiro', 'responsavel_atr']) assert.ok(t.properties[key], key);
  const s = SAFETY_TOOL_SPEC.input_schema as { properties: Record<string, unknown> };
  for (const key of ['tipo', 'local', 'consequencia', 'probabilidade', 'tst']) assert.ok(s.properties[key], key);
});

test('terminalidade, padrão: abertas, agrupadas por pavimento, a mais antiga primeiro, e o resumo bate com a aba 2.1', () => {
  const data = terminality();
  const report = terminalityReport(one(data), {}, TODAY);
  const summary = summarizeTerminality(data.items, indexTerminality(data));
  assert.match(report, /^Terminalidade \(aba 2\.1\) · Mozine · hoje 08\/11\/2026/);
  assert.match(report, /Filtros: situação abertas · agrupado por pavimento/);
  assert.ok(
    report.includes(
      `Resumo (abertas e resolvidas): ${summary.total} pendências · ${summary.open} abertas · ${summary.resolved} resolvidas · ${percentLabel(summary)} resolvida`,
    ),
  );
  // (10 + 3) / 2 = 6,5 dias para resolver; abertas com 68, 9 e 3 dias.
  assert.match(
    report,
    /média de 6,5 dias para resolver \(2 resolvidas\) · abertas há mais de 7 dias: 2 · há mais de 30 dias: 1 · média de 27 dias em aberto/,
  );
  assert.match(report, /Mais antiga aberta: 4° pavto · 401 · Pendência a — desde 01\/09\/2026, há 68 dias/);
  assert.match(report, /Últimos 7 dias \(02\/11 a 08\/11\): 1 observada · 1 resolvida/);
  assert.match(
    report,
    /Fotos \(só a contagem; as imagens não chegam aqui\): 2 do problema · 1 da correção · 2 abertas sem foto do problema/,
  );
  assert.match(report, /Por pavimento \(3 abertas, 1 grupo\):\n4° pavto: 3 \(100%\)/);
  const rows = detail(report);
  assert.deepEqual(
    rows.map(r => r.split(' | ')[2]),
    ['Pendência a', 'Parede / manchada', 'Escada sem corrimão'],
  );
  assert.equal(rows[0], '4° pavto | 401 | Pendência a | A/C | MZ Climatização | João | 01/09/2026 | 68 | aberta | 2+0');
  assert.equal(rows[2], '4° pavto | - | Escada sem corrimão | - | - | - | 05/11/2026 | 3 | aberta | 0+0');
  assert.doesNotMatch(report, /lista cortada/);
});

test('terminalidade: todas agrupadas por empreiteiro somam grafias equivalentes; resolvidas trazem a data e o texto da correção', () => {
  const report = terminalityReport(one(), { status: 'todas', agrupar_por: 'empreiteiro' }, TODAY);
  assert.match(report, /^Resumo: 5 pendências/m);
  assert.match(report, /Por empreiteiro \(responsável terceiro\) \(5 pendências, 3 grupos\):/);
  // "MZ Climatização" e "mz climatizacao" juntas; "Hidrotec" e "HIDROTEC " juntas; o grupo vazio por último.
  assert.match(report, /\nHidrotec: 2 · 1 aberta · 50% resolvida\n/i);
  assert.match(report, /\nMZ Climatização: 2 · 1 aberta · 50% resolvida\n/i);
  assert.match(report, /\nSem responsável terceiro: 1 · 1 aberta · 0% resolvida\n/);
  const rows = detail(report);
  assert.equal(rows.length, 5);
  // Abertas da mais antiga para a mais nova; depois as resolvidas, da correção mais recente.
  assert.deepEqual(
    rows.map(r => r.split(' | ')[2]),
    ['Pendência a', 'Parede / manchada', 'Escada sem corrimão', 'Pendência e', 'Pendência d'],
  );
  assert.equal(
    rows[4],
    'Térreo | - | Pendência d | Pintura | HIDROTEC | - | 01/10/2026 | 10 | resolvida em 11/10/2026: Rejunte refeito | 0+1',
  );
});

test('terminalidade: filtros de texto sem acento nem caixa; "4" pega o 4° pavto e não o 14°; "vazio" pede o campo em branco', () => {
  const byContractor = terminalityReport(one(), { empreiteiro: 'CLIMATIZACAO' }, TODAY);
  assert.match(byContractor, /empreiteiro "CLIMATIZACAO" \(MZ Climatização\)/);
  assert.deepEqual(
    detail(byContractor).map(r => r.split(' | ')[2]),
    ['Pendência a'],
  );
  const terreo = terminalityReport(one(), { pavimento: 'terreo', status: 'todas' }, TODAY);
  assert.match(terreo, /Resumo: 2 pendências · 0 abertas · 2 resolvidas · 100% resolvida/);
  const fourth = terminalityReport(one(), { pavimento: '4' }, TODAY);
  assert.match(fourth, /pavimento "4" \(4° pavto\)/);
  assert.equal(detail(fourth).length, 3);
  const noType = terminalityReport(one(), { tipo: 'vazio' }, TODAY);
  assert.match(noType, /tipo "vazio" \(sem tipo\)/);
  assert.deepEqual(
    detail(noType).map(r => r.split(' | ')[2]),
    ['Escada sem corrimão'],
  );
  const atr = terminalityReport(one(), { responsavel_atr: 'joao', apartamento: '401' }, TODAY);
  assert.equal(detail(atr).length, 1);
  const search = terminalityReport(one(), { busca: 'CORRIMAO escada' }, TODAY);
  assert.deepEqual(
    detail(search).map(r => r.split(' | ')[2]),
    ['Escada sem corrimão'],
  );
});

test('terminalidade: filtro que não casa com nada lista o que existe na obra', () => {
  const report = terminalityReport(one(), { pavimento: 'cobertura' }, TODAY);
  assert.match(report, /Filtro pavimento "cobertura": nada casa\. Pavimentos na obra: 4° pavto; 14° pavto; Térreo\./);
  assert.doesNotMatch(report, /Resumo/);
});

test('terminalidade: período pela data de observação, os dois dias inclusos; período invertido é recusado', () => {
  const report = terminalityReport(one(), { de: '2026-10-01', ate: '2026-10-30', status: 'todas' }, TODAY);
  assert.match(report, /observadas de 01\/10\/2026 a 30\/10\/2026/);
  assert.match(report, /Resumo: 2 pendências · 1 aberta · 1 resolvida · 50% resolvida/);
  assert.deepEqual(
    detail(report).map(r => r.split(' | ')[2]),
    ['Parede / manchada', 'Pendência d'],
  );
  assert.match(terminalityReport(one(), { de: '2026-11-01', ate: '2026-10-01' }, TODAY), /Período inválido/);
  assert.match(terminalityReport(one(), { de: '01/10/2026' }, TODAY), /Aviso: "de" \(01\/10\/2026\) não é uma data/);
});

test('terminalidade: limite corta a lista com o aviso; 0 deixa só resumo e grupos', () => {
  const cut = terminalityReport(one(), { limite: 1 }, TODAY);
  assert.equal(detail(cut).length, 1);
  assert.match(cut, /Pendências \(abertas, mais antigas primeiro; 1 de 3\):/);
  assert.match(
    cut,
    /\(lista cortada: mostrando 1 de 3\. Para ver outras, filtre por pavimento, empreiteiro, tipo ou período, ou aumente "limite" \(até 150\)\.\)/,
  );
  const none = terminalityReport(one(), { limite: 0 }, TODAY);
  assert.equal(detail(none).length, 0);
  assert.match(none, /\(Lista de pendências omitida: limite 0\.\)/);
  assert.match(none, /Por pavimento/);
});

test('terminalidade: muitas pendências param no tamanho máximo da resposta, com o aviso', () => {
  const data = terminality();
  data.items = Array.from({ length: 400 }, (_, i) =>
    item(`x${i}`, {
      observedOn: `2026-0${1 + (i % 9)}-1${i % 10}`,
      description: `Pendência longa ${i} `.repeat(12),
      contractor: `Empresa ${i % 7}`,
    }),
  );
  const report = terminalityReport(one(data), { limite: 150 }, TODAY);
  assert.ok(report.length <= 12_000, `${report.length}`);
  assert.match(report, /\(lista cortada no tamanho máximo da resposta: mostrando \d+ de 400\./);
  assert.ok(detail(report).length > 20);
  // A descrição longa é cortada com reticências.
  assert.match(detail(report)[0], /…/);
});

test('terminalidade com várias obras: comparativo, grupos com a divisão por obra e linhas com a obra', () => {
  const atmos = terminality();
  atmos.items = [
    item('z', { unitId: 'u402', typeId: 't-pt', contractor: 'HIDROTEC', observedOn: '2026-08-01' }),
    item('y', { unitId: 'u401', typeId: 't-pt', contractor: 'Hidrotec', observedOn: '2026-11-07' }),
  ];
  atmos.photos = [];
  const empty: TerminalityData = { ...terminality(), items: [], photos: [] };
  const entries: ModuleReportEntry<TerminalityData>[] = [
    { workId: W, workName: 'Mozine', data: terminality() },
    { workId: 'obra-atm', workName: 'Atmos', data: atmos },
    { workId: 'obra-tau', workName: 'Tauá', data: empty },
  ];
  const report = terminalityReport(entries, { agrupar_por: 'empreiteiro' }, TODAY);
  assert.match(report, /^Terminalidade \(aba 2\.1\) · 3 obras · hoje 08\/11\/2026/);
  assert.match(report, /Resumo das 3 obras \(abertas e resolvidas\): 7 pendências · 5 abertas · 2 resolvidas · 29% resolvida/);
  assert.match(report, /Mais antiga aberta: Atmos \| 4° pavto · 402 · Pendência z — desde 01\/08\/2026, há 99 dias/);
  assert.match(
    report,
    /Comparativo por obra \(mais abertas primeiro\):\nobra \| total \| abertas \| resolvidas \| % resolvida \| abertas >7 d \| >30 d \| mais antiga aberta\nMozine \| 5 \| 3 \| 2 \| 40% \| 2 \| 1 \| 01\/09\/2026 \(68 d\)\nAtmos \| 2 \| 2 \| 0 \| 0% \| 1 \| 1 \| 01\/08\/2026 \(99 d\)\n/,
  );
  assert.match(report, /Sem pendência registrada: Tauá\./);
  assert.match(
    report,
    /Por empreiteiro \(responsável terceiro\), somando as obras \(5 abertas, 3 grupos\):\nHidrotec: 3 \(60%\) — Atmos 2 · Mozine 1\n/i,
  );
  const rows = detail(report);
  assert.equal(rows.length, 5);
  assert.ok(rows[0].startsWith('Atmos | 4° pavto | 402 | Pendência z |'));
  assert.ok(rows[1].startsWith('Mozine | 4° pavto | 401 | Pendência a |'));
  // Limite vale somando as obras.
  assert.equal(detail(terminalityReport(entries, { limite: 2 }, TODAY)).length, 2);
});

test('terminalidade sem dados: diz claramente, com uma obra, com várias e com o recorte vazio', () => {
  const empty: TerminalityData = { floors: [], units: [], types: [], people: [], items: [], photos: [] };
  assert.match(terminalityReport(one(empty), {}, TODAY), /Nenhuma pendência registrada na terminalidade em Mozine\./);
  assert.match(
    terminalityReport(
      [
        { workId: 'a', workName: 'A', data: empty },
        { workId: 'b', workName: 'B', data: empty },
      ],
      {},
      TODAY,
    ),
    /Nenhuma pendência registrada na terminalidade em nenhuma das 2 obras\./,
  );
  assert.match(terminalityReport(one(), { de: '2026-11-07' }, TODAY), /Nenhuma pendência no recorte \(5 na obra, sem filtros\)\./);
  assert.match(terminalityReport(one(), { pavimento: 'terreo' }, TODAY), /Nenhuma pendência aberta no recorte \(as 2 estão resolvidas\)\./);
  assert.match(terminalityReport([], {}, TODAY), /nenhuma obra/);
});

// ─── Segurança do trabalho ──────────────────────────────────────────────────────

const sItem = (id: string, patch: Partial<SafetyItem>): SafetyItem => ({
  ...stamp,
  id,
  workId: W,
  consequence: 'Leve',
  probability: 'Rara',
  description: `Apontamento ${id}`,
  location: 'Térreo',
  observedOn: '2026-10-01',
  status: 'open',
  origin: 'app',
  createdBy: 'u-tst',
  ...patch,
});
const sPhoto = (id: string, itemId: string, kind: SafetyPhoto['kind']): SafetyPhoto => ({
  id,
  itemId,
  workId: W,
  kind,
  storagePath: `${W}/${itemId}/${id}.jpg`,
  thumbPath: `${W}/${itemId}/${id}-thumb.jpg`,
  createdBy: 'u-tst',
  createdAt: `2026-10-01T10:00:0${id.slice(-1)}Z`,
});
function safety(): SafetyData {
  return {
    types: [
      { ...stamp, id: 'pp', name: 'Proteções periféricas', orderIndex: 0, active: true },
      { ...stamp, id: 'lv', name: 'SPIQ – Linha de Vida', orderIndex: 1, active: true },
    ],
    items: [
      // s1: aberto há 19 dias, risco mais grave, com foto.
      sItem('s1', { typeId: 'pp', consequence: 'Morte', probability: 'Provável', location: '2° Pavimento', observedOn: '2026-10-20' }),
      // s2: aberto há 2 dias, lançado por quem não tem nome nos dados; local com "º" e espaço sobrando.
      sItem('s2', { typeId: 'lv', location: '2º pavimento ', observedOn: '2026-11-06', createdBy: 'u-adm' }),
      // s3: histórico da planilha, sem tipo, finalizado em 5 dias.
      sItem('s3', {
        consequence: 'Severa',
        probability: 'Possível',
        location: 'Canteiro',
        observedOn: '2026-09-15',
        status: 'resolved',
        correctedOn: '2026-09-20',
        origin: 'planilha',
        createdBy: 'u-import',
      }),
      // s4: finalizado em 2 dias, nos últimos 7 dias.
      sItem('s4', {
        typeId: 'pp',
        consequence: 'Significativa',
        probability: 'Remota',
        observedOn: '2026-11-03',
        status: 'resolved',
        correctedOn: '2026-11-05',
        resolutionNote: 'Rodapé instalado',
      }),
    ],
    photos: [sPhoto('q1', 's1', 'issue'), sPhoto('q2', 's4', 'issue'), sPhoto('q3', 's4', 'correction')],
  };
}
const withNames = (data: SafetyData) => Object.assign(data, { inspectors: [{ id: 'u-tst', name: 'Carlos Técnico' }] });
const sOne = (data: SafetyData = withNames(safety())): ModuleReportEntry<SafetyData>[] => [{ workId: W, workName: 'Mozine', data }];
const sDetail = (report: string) => report.split('\n').filter(line => / \| \d{2}\/\d{2}\/\d{4} \| \d+ \| /.test(line));

test('segurança, padrão: abertos agrupados por tipo, o mais antigo primeiro, e o resumo bate com a aba 3.1', () => {
  const data = withNames(safety());
  const report = safetyReport(sOne(data), {}, TODAY);
  const summary = summarizeSafety(data.items, TODAY);
  assert.match(report, /^Segurança do trabalho \(aba 3\.1\) · Mozine · hoje 08\/11\/2026/);
  assert.ok(
    report.includes(
      `Resumo (abertos e finalizados): ${summary.total} apontamentos · ${summary.open} abertos · ${summary.resolved} finalizados · 50% finalizado`,
    ),
  );
  assert.ok(report.includes(`média de ${daysLabel(summary.avgDaysToResolve)} dias para resolver (2 finalizados)`));
  assert.ok(report.includes(`abertos há mais de 7 dias: ${summary.openOverDays} · há mais de 30 dias: 0 · média de 11 dias em aberto`));
  assert.match(
    report,
    /Mais antigo aberto: Proteções periféricas · 2° Pavimento · Morte · Apontamento s1 — desde 20\/10\/2026, há 19 dias/,
  );
  assert.match(report, /Últimos 7 dias \(02\/11 a 08\/11\): 2 apontados · 1 finalizado/);
  assert.match(
    report,
    /Fotos \(só a contagem; as imagens não chegam aqui\): 2 do apontamento · 1 da correção · 1 aberto sem foto do apontamento/,
  );
  assert.match(report, /Abertos por consequência: Morte 1 · Leve 1/);
  assert.match(
    report,
    /Por tipo de apontamento \(2 abertos, 2 grupos\):\nProteções periféricas: 1 \(50%\)\nSPIQ – Linha de Vida: 1 \(50%\)/,
  );
  assert.match(report, /Obs\.: há lançamentos feitos no sistema sem o nome de quem lançou/);
  const rows = sDetail(report);
  assert.equal(
    rows[0],
    'Proteções periféricas | Morte · Provável | 2° Pavimento | Apontamento s1 | 20/10/2026 | 19 | aberto | Carlos Técnico | 1+0',
  );
  // O local com grafias equivalentes aparece com a grafia mais usada (empate: a primeira em ordem alfabética, como a aba 6).
  assert.equal(
    rows[1],
    'SPIQ – Linha de Vida | Leve · Rara | 2° Pavimento | Apontamento s2 | 06/11/2026 | 2 | aberto | TST não identificado | 0+0',
  );
});

test('segurança: local sem acento e com "°"/"º" equivalentes, consequência com vários valores, TST e planilha', () => {
  const local = safetyReport(sOne(), { local: '2º PAVIMENTO' }, TODAY);
  assert.equal(sDetail(local).length, 2);
  const terreo = safetyReport(sOne(), { local: 'terreo', status: 'todos' }, TODAY);
  assert.deepEqual(
    sDetail(terreo).map(r => r.split(' | ')[3]),
    ['Apontamento s4'],
  );
  const grave = safetyReport(sOne(), { consequencia: 'morte, SEVERA', status: 'todos' }, TODAY);
  assert.match(grave, /consequência "morte, SEVERA" \(Morte, Severa\)/);
  assert.deepEqual(
    sDetail(grave).map(r => r.split(' | ')[3]),
    ['Apontamento s1', 'Apontamento s3'],
  );
  const sheet = safetyReport(sOne(), { tst: 'planilha', status: 'todos' }, TODAY);
  assert.deepEqual(
    sDetail(sheet).map(r => r.split(' | ')[7]),
    ['Planilha SST'],
  );
  const carlos = safetyReport(sOne(), { tst: 'carlos', status: 'todos' }, TODAY);
  assert.equal(sDetail(carlos).length, 2);
  const lifeline = safetyReport(sOne(), { tipo: 'linha de vida' }, TODAY);
  assert.deepEqual(
    sDetail(lifeline).map(r => r.split(' | ')[3]),
    ['Apontamento s2'],
  );
  const note = safetyReport(sOne(), { busca: 'rodape', status: 'finalizados' }, TODAY);
  assert.equal(sDetail(note).length, 1);
  assert.match(sDetail(note)[0], /finalizado em 05\/11\/2026: Rodapé instalado/);
});

test('segurança: agrupar por mês (do mais recente) e por TST, e período pela data do apontamento', () => {
  const months = safetyReport(sOne(), { agrupar_por: 'mes', status: 'todos' }, TODAY);
  assert.match(
    months,
    /Por mês do apontamento \(4 apontamentos, 3 grupos\):\nnov\/26: 2 · 1 aberto · 50% finalizado\nout\/26: 1 · 1 aberto · 0% finalizado\nset\/26: 1 · 0 abertos · 100% finalizado/,
  );
  const authors = safetyReport(sOne(), { agrupar_por: 'tst', status: 'todos' }, TODAY);
  assert.match(authors, /\nCarlos Técnico: 2 · 1 aberto · 50% finalizado\n/);
  assert.match(authors, /\nPlanilha SST - Controle geral \(histórico importado\): 1 · 0 abertos · 100% finalizado\n/);
  assert.match(authors, /\nTST não identificado: 1 · 1 aberto · 0% finalizado\n/);
  const october = safetyReport(sOne(), { de: '2026-10-01', ate: '2026-10-31', status: 'todos' }, TODAY);
  assert.match(october, /apontados de 01\/10\/2026 a 31\/10\/2026/);
  assert.match(october, /Resumo: 1 apontamento · 1 aberto · 0 finalizados · 0% finalizado/);
});

test('segurança: sem os nomes nos dados, ninguém é inventado; filtro de TST sem nome casa só com a planilha', () => {
  const report = safetyReport(sOne(safety()), { status: 'todos' }, TODAY);
  assert.ok(sDetail(report).every(r => /\| (TST não identificado|Planilha SST) \| \d+\+\d+$/.test(r)));
  assert.match(
    safetyReport(sOne(safety()), { tst: 'carlos' }, TODAY),
    /Filtro TST "carlos": nada casa\. TSTs na obra: Planilha SST - Controle geral\./,
  );
});

test('segurança com várias obras e sem dados', () => {
  const tauá: SafetyData = { types: safety().types, items: [], photos: [] };
  const other = withNames(safety());
  other.items = [sItem('o1', { typeId: 'pp', observedOn: '2026-07-01' })];
  other.photos = [];
  const entries: ModuleReportEntry<SafetyData>[] = [
    { workId: W, workName: 'Mozine', data: withNames(safety()) },
    { workId: 'obra-atm', workName: 'Atmos', data: other },
    { workId: 'obra-tau', workName: 'Tauá', data: tauá },
  ];
  const report = safetyReport(entries, {}, TODAY);
  assert.match(
    report,
    /Comparativo por obra \(mais abertos primeiro\):\nobra \| total \| abertos \| finalizados \| % finalizado \| abertos >7 d \| >30 d \| mais antigo aberto\nMozine \| 4 \| 2 \| 2 \| 50% \|/,
  );
  assert.match(report, /\nAtmos \| 1 \| 1 \| 0 \| 0% \| 1 \| 1 \| 01\/07\/2026 \(130 d\)\n/);
  assert.match(report, /Sem apontamento registrado: Tauá\./);
  // Empate na divisão por obra: a ordem das obras recebidas.
  assert.match(report, /\nProteções periféricas: 2 \(67%\) — Mozine 1 · Atmos 1\n/);
  assert.ok(sDetail(report)[0].startsWith('Atmos | Proteções periféricas |'));
  assert.match(
    safetyReport([{ workId: 'x', workName: 'Tauá', data: tauá }], {}, TODAY),
    /Nenhum apontamento registrado na segurança do trabalho em Tauá\./,
  );
});

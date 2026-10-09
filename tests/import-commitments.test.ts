import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { CommandContext } from '../src/application/use-cases/commands';
import {
  groupRowsByWork,
  importGroup,
  loadCausesMap,
  normalizeText,
  parseCommitmentsCsv,
  parseCsv,
  recordedAtFor,
  resolveCause,
} from '../src/application/use-cases/import-commitments';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { createMockData as mockData } from '../src/mocks/planning';

/** O histórico cai em semanas encerradas, que só admin altera: o ator padrão (user-1) vira admin. */
const createMockData = () => {
  const data = mockData();
  data.users.find(u => u.id === 'user-1')!.role = 'admin';
  return data;
};
import { ppc } from '../src/domain/rules';
import type { PlanningData } from '../src/domain/entities';

const HEADER = 'obra;empresa;semana;inicio;termino;atividade;equipe;status;causa;justificativa';
const csv = (...rows: string[]) => [HEADER, ...rows].join('\n');
let id = 0;
const context = (actorId = 'user-1', now = '2026-09-08T12:00:00.000Z'): CommandContext => ({
  actorId,
  today: now.slice(0, 10),
  now,
  newId: () => `imp-${++id}`,
});
/** Simula o script: lê, agrupa e aplica cada obra numa transação do repositório. */
async function runImport(
  repository: MockPlanningRepository,
  text: string,
  options: { actorId?: string; createWorks?: boolean; workId?: string; causesMap?: ReturnType<typeof loadCausesMap> } = {},
) {
  const parsed = parseCommitmentsCsv(text, { causesMap: options.causesMap, requireObra: !options.workId });
  assert.deepEqual(parsed.errors, []);
  const results = [];
  for (const group of groupRowsByWork(parsed.rows, options.workId))
    results.push(
      await repository.transaction(draft => {
        const result = importGroup(draft, group, { context: context(options.actorId), createWorks: options.createWorks });
        if (result.errors.length) throw new Error(result.errors.map(e => e.message).join('\n'));
        return result;
      }),
    );
  return results;
}

test('parseCsv entende aspas, separador e quebra de linha dentro do campo, BOM e CRLF', () => {
  const records = parseCsv('﻿a;b;c\r\n"x;y";"linha 1\nlinha 2";"diz ""oi"""\r\n\r\nfim;;\n');
  assert.deepEqual(records, [
    { line: 1, fields: ['a', 'b', 'c'] },
    { line: 2, fields: ['x;y', 'linha 1\nlinha 2', 'diz "oi"'] },
    { line: 4, fields: [''] },
    { line: 5, fields: ['fim', '', ''] },
  ]);
  assert.throws(() => parseCsv('a;b\n"aberto;c\n'), /Aspas sem fechamento/);
});

test('causas: lista oficial sem acento/caixa, mapa da planilha e mapa inválido', () => {
  assert.equal(normalizeText('  Intempéries  DA  obra '), 'intemperies da obra');
  assert.equal(resolveCause('falta de MATERIAL'), 'Falta de Material');
  assert.equal(resolveCause('FALHA de equipamento'), 'Falha de Equipamento');
  assert.equal(resolveCause('falta de equipamento'), 'Falta de equipamento');
  assert.equal(resolveCause('Chuva'), undefined);
  const map = loadCausesMap({ Chuva: 'intemperies', 'Material não chegou': 'Falta de Material' });
  assert.equal(resolveCause('chuva', map), 'Intempéries');
  assert.equal(resolveCause('MATERIAL NAO CHEGOU', map), 'Falta de Material');
  assert.throws(() => loadCausesMap({ Chuva: 'Tempo ruim' }), /fora da lista oficial/);
  assert.throws(() => loadCausesMap(['Chuva']), /objeto JSON/);
});

test('validação do CSV aponta erros com o número da linha', () => {
  const parsed = parseCommitmentsCsv(
    csv(
      'Obra A;Emp;2026-08-03;;;Ok;;;;',
      'Obra A;Emp;2026-08-03;;;;;;;',
      'Obra A;Emp;03/08/2026;;;Data BR;;;;',
      'Obra A;Emp;2026-08-03;2026-08-02;2026-08-04;Fora da semana;;;;',
      'Obra A;Emp;2026-08-03;2026-08-05;2026-08-04;Invertida;;;;',
      'Obra A;Emp;2026-08-03;;;Status ruim;;Talvez;;',
      'Obra A;Emp;2026-08-03;;;Sem causa;;Não;;',
      'Obra A;Emp;2026-08-03;;;Causa desconhecida;;Nao;Chuva;',
      'Obra A;;2026-08-03;;;Equipe sem empresa;Pintura;;;',
      ';Emp;2026-08-03;;;Sem obra;;;;',
      ';;;;;;;;;',
      'Obra A;Emp;2026-08-03;;;Causa com Sim;;Sim;Retrabalho;',
    ),
  );
  const byLine = (line: number) => parsed.errors.filter(e => e.line === line).map(e => e.message);
  assert.deepEqual(
    parsed.rows.map(r => r.line),
    [2, 13],
  );
  assert.match(byLine(3)[0], /Atividade é obrigatória/);
  assert.match(byLine(4)[0], /Semana inválida/);
  assert.match(byLine(5)[0], /fora da semana/);
  assert.match(byLine(6)[0], /antes do início/);
  assert.match(byLine(7)[0], /Status "Talvez" inválido/);
  assert.match(byLine(8)[0], /Causa é obrigatória/);
  assert.match(byLine(9)[0], /Causa "Chuva" fora da lista/);
  assert.match(byLine(10)[0], /Equipe informada sem empresa/);
  assert.match(byLine(11)[0], /Obra é obrigatória/);
  assert.equal(byLine(12).length, 0, 'linha em branco é ignorada');
  assert.deepEqual([...parsed.unmappedCauses], [['Chuva', 1]]);
  assert.ok(parsed.warnings.some(w => w.line === 13 && /Causa "Retrabalho" ignorada/.test(w.message)));
  assert.equal(parsed.rows[1].cause, undefined);
  assert.equal(parseCommitmentsCsv('obra;semana\nX;2026-08-03').errors[0].message.includes('Cabeçalho sem as colunas'), true);
});

test('semana em outro dia vai para a segunda; datas em branco nascem no início da semana', () => {
  const [row] = parseCommitmentsCsv(csv('Obra A;Emp;2026-08-06;;;Diário de obra;;;;')).rows;
  assert.equal(row.weekStart, '2026-08-03');
  assert.equal(row.startDate, '2026-08-03');
  assert.equal(row.endDate, '2026-08-03');
  const [only] = parseCommitmentsCsv(csv('Obra A;Emp;2026-08-03;2026-08-05;;Uma data;;;;')).rows;
  assert.equal(only.endDate, '2026-08-05');
  // Domingo pertence à semana que começa na segunda anterior, como no domínio.
  assert.equal(parseCommitmentsCsv(csv('Obra A;Emp;2026-08-09;;2026-08-09;Domingo;;;;')).rows[0].weekStart, '2026-08-03');
});

test('recordedAt do apontamento importado é o sábado da semana, nunca depois de agora', () => {
  assert.equal(recordedAtFor('2026-08-03', '2026-09-08T12:00:00.000Z'), '2026-08-08T15:00:00.000Z');
  assert.equal(recordedAtFor('2026-09-07', '2026-09-08T12:00:00.000Z'), '2026-09-08T12:00:00.000Z');
});

test('importação ponta a ponta no repositório em memória com o CSV de exemplo, idempotente', async () => {
  const repository = new MockPlanningRepository(createMockData());
  const text = fs.readFileSync(new URL('../scripts/exemplo-curto-prazo.csv', import.meta.url), 'utf8');
  const [first] = await runImport(repository, text);
  assert.equal(first.workId, 'obra-1');
  assert.equal(first.rows, 6);
  assert.equal(first.created, 6);
  assert.deepEqual(first.teamsCreated, [{ company: 'Hidro Sul', name: 'Hidráulica' }]);
  assert.equal(first.teamsReused, 2, 'Revestimentos (SM MARTINS) e Elétrica (ATR ENG) vêm do cadastro');
  assert.deepEqual([first.fulfilled, first.notFulfilled, first.pending], [2, 2, 2]);
  assert.deepEqual(first.weeks, { first: '2026-08-03', last: '2026-08-10', count: 2 });
  assert.deepEqual(
    first.ppc.map(w => [w.weekStart, w.planned, w.fulfilled, Math.round(w.percent)]),
    [
      ['2026-08-03', 3, 2, 67],
      ['2026-08-10', 3, 0, 0],
    ],
  );

  const data = await repository.getSnapshot();
  const rows = data.commitments.filter(c => c.workId === 'obra-1');
  assert.equal(rows.length, 6);
  const reboco = rows.find(c => c.name === 'Reboco interno 2º pavimento')!;
  assert.equal(reboco.teamId, 'equipe-1');
  assert.equal(reboco.supplier, 'SM Martins');
  assert.equal(reboco.responsibleId, 'user-1');
  assert.equal(reboco.fulfilled, true);
  assert.equal(reboco.recordedAt, '2026-08-08T15:00:00.000Z');
  assert.equal(reboco.recordedBy, 'user-1');
  const eletro = rows.find(c => c.name === 'Eletrodutos 3º pavimento')!;
  assert.equal(eletro.teamId, 'equipe-2');
  assert.equal(eletro.cause, 'Falta de Material');
  assert.equal(eletro.justification, 'Cabo 4mm não entregue');
  const diario = rows.find(c => c.name === 'Diário de obra')!;
  assert.deepEqual(
    [diario.weekStart, diario.weekEnd, diario.startDate, diario.endDate, diario.teamId],
    ['2026-08-03', '2026-08-09', '2026-08-03', '2026-08-03', undefined],
  );
  assert.equal(rows.find(c => c.name.startsWith('Prumadas'))!.cause, 'Intempéries');
  assert.equal(rows.find(c => c.name === 'Contrapiso; 1º e 2º pavimentos')!.fulfilled, undefined);
  assert.equal(ppc(rows.filter(c => c.weekStart === '2026-08-03')).fulfilled, 2);
  assert.equal(data.teams.filter(t => t.workId === 'obra-1').length, 3);
  assert.ok(data.history.some(h => h.action === 'create_commitment'));

  // Rodar de novo não duplica nada.
  const [again] = await runImport(repository, text);
  assert.deepEqual([again.created, again.updated, again.unchanged, again.teamsCreated.length], [0, 0, 6, 0]);
  assert.equal((await repository.getSnapshot()).commitments.length, 6);

  // Apontar depois na planilha e reimportar atualiza só o apontamento da linha.
  const later = text.replace('Revestimentos;;;', 'Revestimentos;Sim;;');
  const [third] = await runImport(repository, later);
  assert.deepEqual([third.created, third.updated, third.unchanged], [0, 1, 5]);
  const after = await repository.getSnapshot();
  assert.equal(after.commitments.length, 6);
  const contrapiso = after.commitments.find(c => c.name === 'Contrapiso; 1º e 2º pavimentos')!;
  assert.equal(contrapiso.fulfilled, true);
  assert.equal(contrapiso.recordedAt, '2026-08-15T15:00:00.000Z');
});

test('linhas repetidas na mesma semana viram compromissos distintos e continuam idempotentes', async () => {
  const repository = new MockPlanningRepository(createMockData());
  const text = csv(
    'residencial horizonte;Construtora Alfa;2026-08-03;;;Diário de obra;;Sim;;',
    'RESIDENCIAL HORIZONTE;construtora alfa;2026-08-03;;;diario de obra;;Sim;;',
  );
  const [first] = await runImport(repository, text);
  assert.equal(first.created, 2);
  const [second] = await runImport(repository, text);
  assert.deepEqual([second.created, second.unchanged], [0, 2]);
  assert.equal((await repository.getSnapshot()).commitments.length, 2);
});

test('obra inexistente: erro sem --create-works; criada com ele e reaproveitada na segunda vez', async () => {
  const text = csv('Obra Nova Ágata;Fornecedor X;2026-07-06;;;Fundação;Bate-estaca;Sim;;');
  const data = createMockData();
  const [group] = groupRowsByWork(parseCommitmentsCsv(text).rows);
  const missing = importGroup(structuredClone(data), group, { context: context() });
  assert.match(missing.errors[0].message, /não encontrada \(linhas 2\)/);

  const repository = new MockPlanningRepository(data);
  const [created] = await runImport(repository, text, { createWorks: true });
  assert.deepEqual(created.createdWork, { name: 'Obra Nova Ágata', code: 'OBRA-NOVA-AGATA' });
  const snapshot = await repository.getSnapshot();
  const work = snapshot.works.find(w => w.id === created.workId)!;
  assert.equal(work.name, 'Obra Nova Ágata');
  assert.ok(snapshot.users.find(u => u.id === 'user-1')!.workIds.includes(work.id));
  assert.equal(snapshot.teams.filter(t => t.workId === work.id).length, 1);

  const [again] = await runImport(repository, text.replace('Obra Nova Ágata', 'obra nova agata'), { createWorks: true });
  assert.equal(again.createdWork, undefined);
  assert.equal(again.workId, work.id);
  assert.deepEqual([again.created, again.unchanged], [0, 1]);
});

test('--work-id manda todas as linhas para a obra e dispensa a coluna obra', async () => {
  const repository = new MockPlanningRepository(createMockData());
  const [result] = await runImport(repository, csv(';Emp;2026-08-03;;;A;;;;', 'Outro nome;Emp;2026-08-03;;;B;;;;'), {
    workId: 'obra-2',
  });
  assert.equal(result.workId, 'obra-2');
  assert.equal(result.created, 2);
  const snapshot = await repository.getSnapshot();
  assert.deepEqual(
    snapshot.commitments.map(c => c.workId),
    ['obra-2', 'obra-2'],
  );
});

test('ator precisa ser admin com acesso à obra; obra ambígua pede --work-id', () => {
  const data: PlanningData = createMockData();
  const [group] = groupRowsByWork(parseCommitmentsCsv(csv('Residencial Horizonte;Emp;2026-08-03;;;A;;;;')).rows);
  assert.throws(() => importGroup(structuredClone(data), group, { context: context('user-2') }), /exige admin/);
  assert.throws(() => importGroup(structuredClone(data), group, { context: context('user-3') }), /exige admin/);
  assert.throws(() => importGroup(structuredClone(data), group, { context: context('nao-existe') }), /não encontrado/);

  const noAccess = structuredClone(data);
  noAccess.users.find(u => u.id === 'user-1')!.workIds = ['obra-2'];
  assert.match(importGroup(noAccess, group, { context: context() }).errors[0].message, /não tem acesso/);

  const twin = structuredClone(data);
  twin.works.push({ ...twin.works[0], id: 'obra-gemea', code: 'RH-99', name: 'RESIDENCIAL HORIZONTE' });
  assert.match(importGroup(twin, group, { context: context() }).errors[0].message, /ambígua/);
});

test('gravação confere a obra resolvida na simulação', () => {
  const data = createMockData();
  const [group] = groupRowsByWork(parseCommitmentsCsv(csv('Residencial Horizonte;Emp;2026-08-03;;;A;;;;')).rows);
  assert.throws(() => importGroup(structuredClone(data), group, { context: context(), expectedWorkId: 'obra-2' }), /outro cadastro/);
  assert.throws(() => importGroup(structuredClone(data), group, { context: context(), expectedWorkId: null }), /outro cadastro/);
  assert.equal(importGroup(structuredClone(data), group, { context: context(), expectedWorkId: 'obra-1' }).created, 1);
});

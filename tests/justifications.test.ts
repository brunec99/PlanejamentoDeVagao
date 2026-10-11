import test from 'node:test';
import assert from 'node:assert/strict';
import type { Team, WeeklyCommitment } from '../src/domain/entities';
import {
  applyClosingFilter,
  commitmentCompany,
  commitmentTeam,
  deriveThemes,
  failureRows,
  groupByCause,
  matchesSearch,
  tokenize,
} from '../src/modules/curto-prazo/justifications';

const teams: Team[] = [
  { id: 't1', workId: 'w', company: 'Hidrotec', name: 'Equipe A', weeklyCapacity: 40, createdAt: '', updatedAt: '' },
  { id: 't2', workId: 'w', company: 'Rocha', name: 'Pedreiros', weeklyCapacity: 40, createdAt: '', updatedAt: '' },
];
const row = (over: Partial<WeeklyCommitment> & { id: string }): WeeklyCommitment => ({
  workId: 'w',
  name: 'Alvenaria',
  supplier: '',
  weekStart: '2026-09-07',
  weekEnd: '2026-09-12',
  responsibleId: 'u',
  startDate: '2026-09-07',
  endDate: '2026-09-09',
  createdAt: '',
  updatedAt: '',
  ...over,
});
const rows: WeeklyCommitment[] = [
  row({ id: '1', teamId: 't1', fulfilled: false, cause: 'Falta de Material', justification: 'Faltou cimento no almoxarifado' }),
  row({
    id: '2',
    teamId: 't1',
    weekStart: '2026-09-14',
    fulfilled: false,
    cause: 'Falta de Material',
    justification: 'Cimento não chegou, fornecedor atrasou',
  }),
  row({ id: '3', supplier: 'Rocha', teamId: 't2', fulfilled: false, cause: 'Falta de Material', justification: 'Faltou aço na obra' }),
  row({ id: '4', supplier: 'Rocha', fulfilled: false, cause: 'Intempéries', justification: 'Chuva o dia inteiro' }),
  row({ id: '5', supplier: 'Rocha', fulfilled: true, cause: 'Intempéries', justification: 'não conta: cumprido' }),
  row({ id: '6', supplier: 'Rocha', fulfilled: false, justification: 'sem causa não entra' }),
  row({ id: '7', supplier: 'Elétrica Sul', fulfilled: false, cause: 'Falta de Mão de Obra' }),
];

test('empresa é o fornecedor escrito; sem ele, a da equipe; equipe é o nome do cadastro', () => {
  assert.equal(commitmentCompany(rows[0], teams), 'Hidrotec');
  assert.equal(commitmentCompany(rows[2], teams), 'Rocha');
  assert.equal(commitmentTeam(rows[2], teams), 'Pedreiros');
  assert.equal(commitmentTeam(rows[3], teams), '');
});

test('filtro por empreiteiro e equipe se somam e sem filtro devolve a mesma lista', () => {
  assert.equal(applyClosingFilter(rows, {}, teams), rows);
  assert.deepEqual(
    applyClosingFilter(rows, { companies: new Set(['Rocha']) }, teams).map(r => r.id),
    ['3', '4', '5', '6'],
  );
  assert.deepEqual(
    applyClosingFilter(rows, { companies: new Set(['Rocha']), teams: new Set(['']) }, teams).map(r => r.id),
    ['4', '5', '6'],
  );
});

test('failureRows só traz Não com causa, numera a semana e ordena por semana, empresa e atividade', () => {
  const failures = failureRows(rows, teams, '2026-08-31');
  assert.deepEqual(
    failures.map(f => [f.id, f.week, f.company, f.team]),
    [
      ['7', 2, 'Elétrica Sul', ''],
      ['1', 2, 'Hidrotec', 'Equipe A'],
      ['3', 2, 'Rocha', 'Pedreiros'],
      ['4', 2, 'Rocha', ''],
      ['2', 3, 'Hidrotec', 'Equipe A'],
    ],
  );
  assert.equal(failures[0].justification, '');
});

test('tokenize tira acento, pontuação, números soltos e palavras vazias', () => {
  assert.deepEqual(tokenize('Faltou o cimento, não chegou (2 dias) na obra!'), ['faltou', 'cimento', 'chegou']);
});

test('temas: termo recorrente agrupa, bigrama ganha no empate e cada justificativa entra num tema só', () => {
  const themes = deriveThemes([
    'Faltou cimento no almoxarifado',
    'Cimento não chegou, fornecedor atrasou',
    'Faltou cimento de novo',
    'Fornecedor atrasou a entrega de aço',
    'Chuva forte',
  ]);
  // "fornecedor atrasou" aparece em duas, mas uma delas já foi para "cimento": sobra uma, e uma não faz tema.
  assert.deepEqual(
    themes.map(t => [t.label, t.count]),
    [['cimento', 3]],
  );
  assert.deepEqual(themes[0].examples, [
    'Faltou cimento no almoxarifado',
    'Cimento não chegou, fornecedor atrasou',
    'Faltou cimento de novo',
  ]);
  // Ordem e rótulos não mudam entre execuções.
  assert.deepEqual(deriveThemes(['a b c', 'a b d', 'x y', 'x y']), deriveThemes(['a b c', 'a b d', 'x y', 'x y']));
});

test('temas: bigrama vence a palavra solta quando a frequência é a mesma', () => {
  const themes = deriveThemes(['falta de material na frente', 'falta de material no estoque', 'chuva forte']);
  assert.equal(themes[0].label, 'falta material');
  assert.equal(themes[0].count, 2);
});

test('sem recorrência não há tema', () => {
  assert.deepEqual(deriveThemes(['chuva', 'greve', '']), []);
  assert.deepEqual(deriveThemes([]), []);
});

test('groupByCause segue a ordem do Pareto, conta justificadas e deriva temas por causa', () => {
  const groups = groupByCause(failureRows(rows, teams, '2026-08-31'), ['Intempéries', 'Falta de Material']);
  assert.deepEqual(
    groups.map(g => [g.cause, g.total, g.justified]),
    [
      ['Intempéries', 1, 1],
      ['Falta de Material', 3, 3],
      ['Falta de Mão de Obra', 1, 0],
    ],
  );
  assert.deepEqual(
    groups[1].themes.map(t => [t.label, t.count]),
    [['cimento', 2]],
  );
});

test('busca casa na justificativa, na atividade, na empresa ou na equipe, sem acento', () => {
  const [first] = failureRows([rows[2]], teams, '2026-08-31');
  assert.equal(matchesSearch(first, 'AÇO'), true);
  assert.equal(matchesSearch(first, 'pedreiro'), true);
  assert.equal(matchesSearch(first, 'alvenaria'), true);
  assert.equal(matchesSearch(first, 'cimento'), false);
  assert.equal(matchesSearch(first, '  '), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Team } from '../src/domain/entities';
import { DEFAULT_CALENDAR } from '../src/domain/plan-schedule';
import {
  compareWithProject,
  suggestResourceChoices,
  toImportCommand,
  type ImportDraftLike,
} from '../src/application/use-cases/plan-import';

// Ponte entre o arquivo lido e o comando `import_plan` (08/11/2026).
const stamp = { createdAt: '2026-11-01T12:00:00Z', updatedAt: '2026-11-01T12:00:00Z' };
const team = (id: string, name: string, company: string): Team => ({ id, ...stamp, workId: 'obra-1', name, company, weeklyCapacity: 3 });
const teams = [
  team('t1', 'MONTANINI', 'MONTANINI'),
  team('t2', 'adenir', 'ATR OBRA'),
  team('t3', 'ALEX', 'RC'),
  team('t4', 'ALEX', 'GGP ALV'),
  team('t5', 'Revestimentos', 'SM MARTINS'),
  team('t6', 'André', 'LIGA'),
];

test('recurso do Project casa com a equipe pelo nome, por "EMPRESA - NOME" e pelo começo da empresa', () => {
  const choices = suggestResourceChoices(
    [
      { name: 'Montanini', taskCount: 27 },
      { name: 'ATR - Adenir', taskCount: 6 },
      { name: 'RC - ALEX', taskCount: 6 },
      { name: 'sm martins - revestimentos', taskCount: 2 },
      { name: 'ALEX', taskCount: 1 },
      { name: 'LIGA - 2', taskCount: 6 },
      { name: 'liga', taskCount: 3 },
      { name: 'JWS', taskCount: 21 },
    ],
    teams,
  );
  assert.deepEqual(choices, [
    { name: 'Montanini', taskCount: 27, kind: 'team', teamId: 't1' },
    { name: 'ATR - Adenir', taskCount: 6, kind: 'team', teamId: 't2' },
    { name: 'RC - ALEX', taskCount: 6, kind: 'team', teamId: 't3' },
    { name: 'sm martins - revestimentos', taskCount: 2, kind: 'team', teamId: 't5' },
    // Duas equipes ALEX: não é escolha automática.
    { name: 'ALEX', taskCount: 1, kind: 'create', teamName: 'ALEX', company: 'ALEX' },
    // A empresa que já existe mantém a grafia da obra.
    { name: 'LIGA - 2', taskCount: 6, kind: 'create', teamName: 'LIGA - 2', company: 'LIGA' },
    { name: 'liga', taskCount: 3, kind: 'create', teamName: 'liga', company: 'LIGA' },
    { name: 'JWS', taskCount: 21, kind: 'create', teamName: 'JWS', company: 'JWS' },
  ]);
});

const draft: ImportDraftLike = {
  name: 'BLT_Médio Prazo NOV - JAN',
  calendar: DEFAULT_CALENDAR,
  tasks: [
    { key: '1', name: 'Estrutura', level: 0, plannedStart: '2026-11-02', plannedEnd: '2026-11-06', progress: 0 },
    {
      key: '2',
      name: 'Forma',
      level: 1,
      duration: { value: 2, unit: 'd' },
      plannedStart: '2026-11-02',
      plannedEnd: '2026-11-03',
      progress: 0,
      resourceName: 'MONTANINI',
    },
    {
      key: '3',
      name: 'Armação',
      level: 1,
      duration: { value: 3, unit: 'd' },
      plannedStart: '2026-11-04',
      plannedEnd: '2026-11-06',
      progress: 0,
      resourceName: 'JWS',
    },
  ],
  links: [{ predecessorKey: '2', successorKey: '3', type: 'TI', lagDays: 0, lagBusiness: true }],
  baseline: { '2': { start: '2026-11-02', end: '2026-11-03' } },
  fileDates: {
    '1': { start: '2026-11-02', end: '2026-11-06' },
    '2': { start: '2026-11-02', end: '2026-11-03' },
    '3': { start: '2026-11-04', end: '2026-11-06' },
  },
  resources: [
    { name: 'MONTANINI', taskCount: 1 },
    { name: 'JWS', taskCount: 1 },
  ],
};

test('monta o comando com as escolhas de recurso e a linha de base por tarefa', () => {
  const command = toImportCommand(
    draft,
    [
      { name: 'MONTANINI', taskCount: 1, kind: 'team', teamId: 't1' },
      { name: 'JWS', taskCount: 1, kind: 'none' },
    ],
    { workId: 'obra-1', month: '2026-11', fileName: 'BLT.xml', name: '  ', baselineName: 'Linha de base do Project' },
  );
  assert.equal(command.type, 'import_plan');
  assert.equal(command.name, 'BLT_Médio Prazo NOV - JAN', 'nome em branco usa o do arquivo');
  assert.deepEqual(command.resources, [{ name: 'MONTANINI', teamId: 't1' }, { name: 'JWS' }]);
  assert.deepEqual(
    command.tasks.map(t => [t.key, t.resource, t.baseline]),
    [
      ['1', undefined, undefined],
      ['2', 'MONTANINI', { start: '2026-11-02', end: '2026-11-03' }],
      ['3', 'JWS', undefined],
    ],
  );
  assert.equal(command.baselineName, 'Linha de base do Project');
});

test('compara as datas do motor com as do Project, só nas folhas', () => {
  assert.deepEqual(compareWithProject(draft), { differences: [], compared: 2 });
  // O Project dizia que a armação terminava na sexta; com 4 dias de duração o motor termina na segunda.
  const longer: ImportDraftLike = {
    ...draft,
    tasks: draft.tasks.map(t => (t.key === '3' ? { ...t, duration: { value: 4, unit: 'd' as const } } : t)),
  };
  const result = compareWithProject(longer);
  assert.equal(result.compared, 2);
  assert.deepEqual(result.differences, [
    {
      key: '3',
      row: 3,
      name: 'Armação',
      project: { start: '2026-11-04', end: '2026-11-06' },
      system: { start: '2026-11-04', end: '2026-11-09' },
    },
  ]);
});

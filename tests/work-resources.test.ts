import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command } from '../src/application/use-cases/commands';
import { createMockData } from '../src/mocks/planning';
import type { PlanningData } from '../src/domain/entities';
import { teamLabel, teamUsage } from '../src/domain/resources';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';

let id = 0;
const now = '2026-09-20T12:00:00Z';
const run = (data: PlanningData, command: Command, actorId = 'user-1') => applyCommand(data, command, { actorId, today: '2026-09-20', now, newId: () => `resources-${++id}` });
const edit: Command = { type: 'update_team', teamId: 'equipe-1', company: ' Empreiteira Alfa ', name: ' Equipe 01 ', weeklyCapacity: 5 };

test('editar equipe preserva identidade, obra e vínculos sem reescrever fornecedor histórico', () => {
  const data = createMockData();
  run(data, { type: 'assign_team', activityId: 'a1', teamId: 'equipe-1' });
  const commitmentId = run(data, { type: 'create_commitment', workId: 'obra-1', name: 'Serviço contratado', weekStart: '2026-09-21', responsibleId: 'user-1', teamId: 'equipe-1', supplier: 'Fornecedor original' });
  const original = { ...data.teams.find(t => t.id === 'equipe-1')! };
  assert.equal(run(data, edit), 'equipe-1');
  assert.deepEqual(data.teams.find(t => t.id === 'equipe-1'), { ...original, company: 'Empreiteira Alfa', name: 'Equipe 01', weeklyCapacity: 5, updatedAt: now });
  assert.equal(data.activities.find(a => a.id === 'a1')?.teamId, 'equipe-1');
  assert.equal(data.commitments.find(c => c.id === commitmentId)?.supplier, 'Fornecedor original');
  assert.equal(data.commitments.find(c => c.id === commitmentId)?.teamId, 'equipe-1');
  assert.ok(data.history.some(e => e.action === 'update_team' && e.changes.targetId === 'equipe-1'));
});

test('editar recursos exige perfil de edição e acesso à obra; id inexistente é recusado', () => {
  const data = createMockData();
  assert.throws(() => run(data, edit, 'user-3'), /apenas consulta/);
  data.teams.push({ ...data.teams[0], id: 'other-team', workId: 'obra-2' });
  assert.throws(() => run(data, { ...edit, teamId: 'other-team' }, 'user-2'), /acesso/);
  assert.throws(() => run(data, { ...edit, teamId: 'missing' }), /não encontrada/);
});

test('edição valida campos e duplicidade por empresa e obra, sem conflitar consigo mesma', () => {
  const data = createMockData();
  const team = data.teams.find(t => t.id === 'equipe-1')!;
  run(data, { ...edit, company: team.company, name: team.name, weeklyCapacity: team.weeklyCapacity });
  for (const weeklyCapacity of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => run(data, { ...edit, weeklyCapacity }), /inteiro positivo/);
  assert.throws(() => run(data, { ...edit, company: ' ' }), /Empresa/);
  assert.throws(() => run(data, { ...edit, name: ' ' }), /Nome da equipe/);
  const other = run(data, { type: 'create_team', workId: 'obra-1', company: 'Outra empresa', name: 'Equipe 01', weeklyCapacity: 2 });
  assert.throws(() => run(data, { ...edit, teamId: other, company: ` ${team.company.toLowerCase()} `, name: team.name.toUpperCase() }), /já cadastrada/);
  run(data, { ...edit, teamId: other, company: 'Outra empresa', name: team.name });
  assert.equal(data.teams.find(t => t.id === other)?.name, team.name);
});

test('falha de atualização não deixa alterações parciais nem eventos de histórico', async () => {
  const repository = new MockPlanningRepository();
  const before = await repository.getSnapshot();
  await assert.rejects(repository.transaction(data => run(data, { ...edit, weeklyCapacity: 0 })), /inteiro positivo/);
  assert.deepEqual(await repository.getSnapshot(), before);
});

test('exclusão protege tarefas de médio prazo e linhas de base congeladas', () => {
  const data = createMockData();
  const teamId = run(data, { type: 'create_team', workId: 'obra-1', company: 'Alfa', name: 'Pintura', weeklyCapacity: 2 });
  const planId = run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-09', name: 'Plano setembro' });
  const taskId = run(data, { type: 'create_plan_task', planId, name: 'Pintura', plannedStart: '2026-09-21', plannedEnd: '2026-09-25', teamId });
  assert.throws(() => run(data, { type: 'delete_team', teamId }), /médio prazo/);
  run(data, { type: 'freeze_plan_baseline', planId, name: 'Aprovado' });
  run(data, { type: 'update_plan_task', taskId, name: 'Pintura', plannedStart: '2026-09-21', plannedEnd: '2026-09-25', teamId: null, progress: 0 });
  assert.throws(() => run(data, { type: 'delete_team', teamId }), /linha de base/);
  assert.equal(teamUsage(data, teamId).baselines, 1);
});

test('exclusão protege curto prazo e atividades, mas permite remover recurso sem vínculos', () => {
  const data = createMockData();
  const teamId = run(data, { type: 'create_team', workId: 'obra-1', company: 'Alfa', name: 'Pintura', weeklyCapacity: 2 });
  run(data, { type: 'assign_team', activityId: 'a1', teamId });
  assert.throws(() => run(data, { type: 'delete_team', teamId }), /atribuída a atividades/);
  run(data, { type: 'assign_team', activityId: 'a1', teamId: null });
  const commitmentId = run(data, { type: 'create_commitment', workId: 'obra-1', name: 'Pintura', weekStart: '2026-09-21', responsibleId: 'user-1', teamId });
  assert.throws(() => run(data, { type: 'delete_team', teamId }), /compromissos/);
  run(data, { type: 'update_commitment', commitmentId, name: 'Pintura', supplier: 'Alfa', teamId: null, weekStart: '2026-09-21', startDate: '2026-09-21', endDate: '2026-09-21' });
  run(data, { type: 'delete_team', teamId });
  assert.equal(data.teams.some(t => t.id === teamId), false);
});

test('contagem de usos distingue prazo, atividades e referências históricas', () => {
  const data = createMockData();
  const teamId = run(data, { type: 'create_team', workId: 'obra-1', company: 'Alfa', name: 'Pintura', weeklyCapacity: 2 });
  const planId = run(data, { type: 'create_plan', workId: 'obra-1', month: '2026-09' });
  run(data, { type: 'create_plan_task', planId, name: 'Pintura', plannedStart: '2026-09-21', plannedEnd: '2026-09-25', teamId });
  run(data, { type: 'freeze_plan_baseline', planId, name: 'Aprovado' });
  run(data, { type: 'create_commitment', workId: 'obra-1', name: 'Pintura', weekStart: '2026-09-07', responsibleId: 'user-1', teamId });
  run(data, { type: 'assign_team', activityId: 'a1', teamId });
  assert.deepEqual(teamUsage(data, teamId), { medium: 1, baselines: 1, short: 1, activities: 1, total: 4 });
  assert.deepEqual(teamUsage(data, 'missing'), { medium: 0, baselines: 0, short: 0, activities: 0, total: 0 });
  assert.equal(teamLabel({ company: 'Alfa', name: 'Pintura' }), 'Alfa · Pintura');
  assert.equal(teamLabel({ company: '', name: 'Pintura' }), 'Pintura');
});

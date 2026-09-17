import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { createMockData } from '../src/mocks/planning';
import { ppc, teamLoad } from '../src/domain/rules';
import type { PlanningData, Team, WeeklyCommitment } from '../src/domain/entities';
let id=0;
const context=(actorId='user-1'):CommandContext=>({actorId,today:'2026-09-08',now:'2026-09-08T12:00:00Z',newId:()=>`test-${++id}`});
const run=(d:PlanningData,c:Command,actorId='user-1')=>applyCommand(d,c,context(actorId));
const stamp={createdAt:'2026-08-20T12:00:00Z',updatedAt:'2026-08-20T12:00:00Z'};
const otherWorkTeam=(d:PlanningData)=>{const t:Team={id:'equipe-obra2',...stamp,workId:'obra-2',name:'Terceirizada',weeklyCapacity:4};d.teams.push(t);return t;};
const commitment=(id:string,fulfilled?:boolean):WeeklyCommitment=>({id,...stamp,activityId:'a1',weekStart:'2026-09-07',weekEnd:'2026-09-13',responsibleId:'user-1',targetProgress:100,fulfilled});

test('consulta e obra sem acesso são bloqueados nos comandos da expansão',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',name:'Pintura',weeklyCapacity:2},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'record_progress',activityId:'b3',progress:60},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'move_restriction',restrictionId:'r1',boardStatus:'em_tratativa'},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-2',name:'Pintura',weeklyCapacity:2},'user-2'),/acesso/);
  assert.throws(()=>run(d,{type:'create_baseline',workId:'obra-2',name:'LB inicial'},'user-2'),/acesso/);
});
test('equipe exige capacidade inteira positiva e nome único na obra',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',name:'Pintura',weeklyCapacity:0}),/inteiro positivo/);
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',name:'Pintura',weeklyCapacity:2.5}),/inteiro positivo/);
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',name:'  ',weeklyCapacity:2}),/Nome da equipe/);
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',name:'revestimentos',weeklyCapacity:2}),/já cadastrada/);
  const teamId=run(d,{type:'create_team',workId:'obra-1',name:'Pintura',weeklyCapacity:4});
  assert.equal(d.teams.find(t=>t.id===teamId)?.weeklyCapacity,4);
});
test('atribuição de equipe respeita a obra e aceita limpar',()=>{
  const d=createMockData();otherWorkTeam(d);
  assert.throws(()=>run(d,{type:'assign_team',activityId:'a1',teamId:'equipe-obra2'}),/Equipe deve pertencer/);
  run(d,{type:'assign_team',activityId:'a1',teamId:'equipe-1'});
  assert.equal(d.activities.find(a=>a.id==='a1')?.teamId,'equipe-1');
  run(d,{type:'assign_team',activityId:'a1',teamId:null});
  assert.equal(d.activities.find(a=>a.id==='a1')?.teamId,undefined);
});
test('apontamento exige liberação e respeita a restrição de execução da atividade',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'record_progress',activityId:'a5',progress:30}),/Libere/);
  assert.throws(()=>run(d,{type:'record_progress',activityId:'a3',progress:60}),/restrição/);
  assert.equal(d.progressEntries.length,0);
});
test('redução de apontamento exige justificativa',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'record_progress',activityId:'a2',progress:50}),/Justificativa/);
  assert.throws(()=>run(d,{type:'record_progress',activityId:'a2',progress:120,reason:'Erro'}),/entre 0 e 100/);
  run(d,{type:'record_progress',activityId:'a2',progress:50,reason:'Medição refeita'});
  assert.equal(d.activities.find(a=>a.id==='a2')?.progress,50);
});
test('apontamento grava um lançamento datado e atualiza progresso e status',()=>{
  const d=createMockData();
  run(d,{type:'record_progress',activityId:'b3',progress:100});
  assert.equal(d.progressEntries.length,1);
  const entry=d.progressEntries[0];
  assert.equal(entry.activityId,'b3');assert.equal(entry.recordedDate,'2026-09-08');assert.equal(entry.progress,100);assert.equal(entry.recordedBy,'user-1');
  const activity=d.activities.find(a=>a.id==='b3')!;
  assert.equal(activity.progress,100);assert.equal(activity.status,'completed');
});
test('compromisso é ancorado na segunda-feira da semana',()=>{
  const d=createMockData();
  const commitmentId=run(d,{type:'create_commitment',activityId:'a4',weekStart:'2026-09-10',responsibleId:'user-1',targetProgress:80});
  const saved=d.commitments.find(c=>c.id===commitmentId)!;
  assert.equal(saved.weekStart,'2026-09-07');assert.equal(saved.weekEnd,'2026-09-13');assert.equal(saved.fulfilled,undefined);
});
test('meta do compromisso precisa superar o executado e ficar entre 1 e 100',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'create_commitment',activityId:'a4',weekStart:'2026-09-10',responsibleId:'user-1',targetProgress:0}),/entre 1 e 100/);
  assert.throws(()=>run(d,{type:'create_commitment',activityId:'a4',weekStart:'2026-09-10',responsibleId:'user-1',targetProgress:101}),/entre 1 e 100/);
  assert.throws(()=>run(d,{type:'create_commitment',activityId:'a4',weekStart:'2026-09-10',responsibleId:'user-1',targetProgress:25}),/superar/);
  assert.throws(()=>run(d,{type:'create_commitment',activityId:'a4',weekStart:'2026-09-10',responsibleId:'inexistente',targetProgress:80}),/Responsável/);
  assert.equal(d.commitments.length,0);
});
test('compromisso é único por atividade e semana',()=>{
  const d=createMockData();
  run(d,{type:'create_commitment',activityId:'a4',weekStart:'2026-09-07',responsibleId:'user-1',targetProgress:80});
  assert.throws(()=>run(d,{type:'create_commitment',activityId:'a4',weekStart:'2026-09-11',responsibleId:'user-1',targetProgress:90}),/já tem compromisso/);
  run(d,{type:'create_commitment',activityId:'a4',weekStart:'2026-09-14',responsibleId:'user-1',targetProgress:90});
  assert.deepEqual(d.commitments.map(c=>c.weekStart),['2026-09-07','2026-09-14']);
});
test('cumprimento exige causa quando não cumprido e é apurado uma só vez',()=>{
  const d=createMockData();
  const commitmentId=run(d,{type:'create_commitment',activityId:'a4',weekStart:'2026-09-10',responsibleId:'user-1',targetProgress:80});
  assert.throws(()=>run(d,{type:'record_fulfillment',commitmentId,fulfilled:false}),/Causa/);
  run(d,{type:'record_fulfillment',commitmentId,fulfilled:false,cause:'Falta de material'});
  const saved=d.commitments.find(c=>c.id===commitmentId)!;
  assert.equal(saved.fulfilled,false);assert.equal(saved.cause,'Falta de material');assert.equal(saved.recordedBy,'user-1');
  assert.throws(()=>run(d,{type:'record_fulfillment',commitmentId,fulfilled:true}),/já foi registrado/);
});
test('ppc conta compromissos cumpridos sobre planejados, não a média de progresso',()=>{
  const result=ppc([commitment('x1',true),commitment('x2',false),commitment('x3')]);
  assert.equal(result.planned,3);assert.equal(result.fulfilled,1);assert.equal(result.pending,1);
  assert.equal(Math.round(result.percent*100)/100,33.33);
  assert.deepEqual(ppc([]),{planned:0,fulfilled:0,pending:0,percent:0});
});
test('carga da equipe acusa sobrecarga acima da capacidade semanal',()=>{
  const d=createMockData();
  assert.deepEqual(teamLoad('equipe-1','2026-09-01','2026-09-10',d),{assigned:0,capacity:2,overloaded:false});
  run(d,{type:'assign_team',activityId:'a3',teamId:'equipe-1'});
  run(d,{type:'assign_team',activityId:'b3',teamId:'equipe-1'});
  assert.deepEqual(teamLoad('equipe-1','2026-09-01','2026-09-10',d),{assigned:2,capacity:2,overloaded:false});
  run(d,{type:'assign_team',activityId:'a4',teamId:'equipe-1'});
  assert.deepEqual(teamLoad('equipe-1','2026-09-01','2026-09-10',d),{assigned:3,capacity:2,overloaded:true});
  assert.deepEqual(teamLoad('equipe-1','2026-08-22','2026-08-26',d),{assigned:0,capacity:2,overloaded:false});
});
test('linha de base exige vagão e não se move quando o plano é reprogramado',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'create_baseline',workId:'obra-2',name:'LB inicial'}),/ao menos um vagão/);
  const baselineId=run(d,{type:'create_baseline',workId:'obra-1',name:'LB inicial'});
  const baseline=d.baselines.find(b=>b.id===baselineId)!;
  assert.equal(baseline.wagons.length,6);assert.equal(baseline.activities.length,12);assert.equal(baseline.createdBy,'user-1');
  run(d,{type:'edit_wagon',wagonId:'v5',plannedStart:'2026-09-11',plannedEnd:'2026-09-25',responsibleId:'user-1'});
  assert.equal(d.wagons.find(w=>w.id==='v5')!.plannedEnd,'2026-09-25');
  assert.equal(baseline.wagons.find(w=>w.id==='v5')!.plannedEnd,'2026-09-15');
  assert.equal(baseline.activities.find(a=>a.id==='a5')!.plannedEnd,'2026-09-15');
});
test('quadro de restrições nasce identificada, anda para tratativa e não aceita resolvida',()=>{
  const d=createMockData();
  const restrictionId=run(d,{type:'create_restriction',wagonId:'v5',description:'Projeto pendente',responsibleId:'user-1',dueDate:'2026-09-20',blocksExecution:false,blocksTerminality:true});
  assert.equal(d.restrictions.find(r=>r.id===restrictionId)?.boardStatus,'identificada');
  assert.throws(()=>run(d,{type:'move_restriction',restrictionId,boardStatus:'resolvida' as 'em_tratativa'}),/Coluna inválida/);
  run(d,{type:'move_restriction',restrictionId,boardStatus:'em_tratativa'});
  assert.equal(d.restrictions.find(r=>r.id===restrictionId)?.boardStatus,'em_tratativa');
  run(d,{type:'resolve_restriction',restrictionId,resolution:'Projeto recebido'});
  assert.equal(d.restrictions.find(r=>r.id===restrictionId)?.boardStatus,'resolvida');
  assert.throws(()=>run(d,{type:'move_restriction',restrictionId,boardStatus:'identificada'}),/não volta ao quadro/);
});
test('apontamento recusado não grava lançamento nem histórico no repositório',async()=>{
  const repo=new MockPlanningRepository();const before=await repo.getSnapshot();
  await assert.rejects(repo.transaction(d=>run(d,{type:'record_progress',activityId:'a5',progress:30})),/Libere/);
  assert.deepEqual(await repo.getSnapshot(),before);
  await assert.rejects(repo.transaction(d=>run(d,{type:'create_commitment',activityId:'a1',weekStart:'2026-09-10',responsibleId:'user-1',targetProgress:100})),/superar/);
  assert.deepEqual(await repo.getSnapshot(),before);
});

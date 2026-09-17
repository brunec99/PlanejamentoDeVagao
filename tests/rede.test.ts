import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { diffDeletedIds } from '../src/infrastructure/repositories/supabase/mappers';
import { createMockData } from '../src/mocks/planning';
import { dependencyConflicts } from '../src/domain/rules';
import type { PlanningData } from '../src/domain/entities';
let id=0;
const context=(actorId='user-1'):CommandContext=>({actorId,today:'2026-09-08',now:'2026-09-08T12:00:00Z',newId:()=>`test-${++id}`});
const run=(d:PlanningData,c:Command,actorId='user-1')=>applyCommand(d,c,context(actorId));
const link=(predecessorId:string,successorId:string):Command=>({type:'link_activities',predecessorId,successorId});
const activity=(d:PlanningData,activityId:string)=>d.activities.find(a=>a.id===activityId)!;
const pairs=(d:PlanningData)=>d.dependencies.map(dep=>`${dep.predecessorId}>${dep.successorId}`);
// obra-2 nasce sem sequência, vagão, local ou atividade: a rede só tem o que estes quatro comandos criam.
const obra2Activity=(d:PlanningData)=>{
  const sequenceId=run(d,{type:'create_sequence',workId:'obra-2',name:'Ciclo inicial',taktDays:5,calendar:'calendar_days'});
  const wagonId=run(d,{type:'create_wagon',sequenceId,number:1,plannedStart:'2026-10-01',plannedEnd:'2026-10-05',responsibleId:'user-1'});
  const locationId=run(d,{type:'create_location',workId:'obra-2',name:'Térreo · Aurora'});
  return run(d,{type:'create_activity',wagonId,activity:{name:'Alvenaria de vedação',locationId,responsibleId:'user-1',plannedStart:'2026-10-01',plannedEnd:'2026-10-05',weight:1,mandatory:true}});
};

test('vínculo válido entra em dependencies apontando predecessora e sucessora',()=>{
  const d=createMockData();
  const dependencyId=run(d,link('a1','a2'));
  const dependency=d.dependencies.find(dep=>dep.id===dependencyId)!;
  assert.equal(dependency.predecessorId,'a1');assert.equal(dependency.successorId,'a2');
  assert.equal(dependency.createdAt,'2026-09-08T12:00:00Z');
  assert.equal(d.dependencies.length,1);
});
test('ligar uma atividade a si mesma é recusado',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,link('a1','a1')),/si mesma/);
  assert.equal(d.dependencies.length,0);
});
test('atividade inexistente é recusada nas duas pontas',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,link('inexistente','a2')),/Atividade não encontrada/);
  assert.throws(()=>run(d,link('a1','inexistente')),/Atividade não encontrada/);
  assert.equal(d.dependencies.length,0);
});
test('dependência duplicada é recusada',()=>{
  const d=createMockData();
  run(d,link('a1','a2'));
  assert.throws(()=>run(d,link('a1','a2')),/já existe/);
  assert.equal(d.dependencies.length,1);
});
test('ciclo direto A→B depois B→A é recusado',()=>{
  const d=createMockData();
  run(d,link('a1','a2'));
  assert.throws(()=>run(d,link('a2','a1')),/ciclo/);
  assert.deepEqual(pairs(d),['a1>a2']);
});
test('ciclo indireto A→B→C→A é recusado',()=>{
  const d=createMockData();
  run(d,link('a1','a2'));run(d,link('a2','a3'));
  assert.throws(()=>run(d,link('a3','a1')),/ciclo/);
  assert.deepEqual(pairs(d),['a1>a2','a2>a3']);
});
test('cadeia longa legítima é aceita, inclusive o atalho que pula um elo',()=>{
  const d=createMockData();
  run(d,link('a1','a2'));run(d,link('a2','a3'));run(d,link('a3','a4'));run(d,link('a1','a3'));
  assert.deepEqual(pairs(d),['a1>a2','a2>a3','a3>a4','a1>a3']);
});
test('atividades de obras diferentes não se ligam e a obra sem acesso é barrada',()=>{
  const d=createMockData();
  const outra=obra2Activity(d);
  assert.throws(()=>run(d,link('a1',outra)),/mesma obra/);
  assert.throws(()=>run(d,link(outra,'a1')),/mesma obra/);
  assert.throws(()=>run(d,link('a1',outra),'user-2'),/acesso/);
  assert.equal(d.dependencies.length,0);
});
test('unlink_activities remove só o vínculo alvo e o snapshot acusa a remoção',()=>{
  const d=createMockData();
  const primeira=run(d,link('a1','a2'));
  const segunda=run(d,link('a2','a3'));
  const before=structuredClone(d);
  assert.throws(()=>run(d,{type:'unlink_activities',dependencyId:'inexistente'}),/Dependência não encontrada/);
  run(d,{type:'unlink_activities',dependencyId:primeira});
  assert.deepEqual(d.dependencies.map(dep=>dep.id),[segunda]);
  const diff=diffDeletedIds(before,d);
  assert.deepEqual(diff.activity_dependencies,[primeira]);
  assert.deepEqual(diff.activities,[]);
});
test('desligar não mexe nas datas das atividades: a ferramenta nunca reprograma',()=>{
  const d=createMockData();
  const dependencyId=run(d,link('a1','b1'));
  assert.equal(dependencyConflicts(d).length,1);
  run(d,{type:'unlink_activities',dependencyId});
  assert.equal(activity(d,'b1').plannedStart,'2026-08-22');
  assert.equal(activity(d,'a1').plannedEnd,'2026-08-26');
  assert.deepEqual(dependencyConflicts(d),[]);
});
test('set_activity_note grava com trim e nota vazia ou só espaços limpa o campo',()=>{
  const d=createMockData();
  run(d,{type:'set_activity_note',activityId:'a1',note:'  Conferir prumo antes do revestimento  '});
  assert.equal(activity(d,'a1').notes,'Conferir prumo antes do revestimento');
  run(d,{type:'set_activity_note',activityId:'a1',note:'   '});
  assert.equal(activity(d,'a1').notes,undefined);
  run(d,{type:'set_activity_note',activityId:'b1',note:'Ponto elétrico conferido'});
  run(d,{type:'set_activity_note',activityId:'b1',note:''});
  assert.equal(activity(d,'b1').notes,undefined);
});
test('anotação acima de 2000 caracteres é recusada e o limite exato passa',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'set_activity_note',activityId:'a1',note:'x'.repeat(2001)}),/2000 caracteres/);
  assert.equal(activity(d,'a1').notes,undefined);
  run(d,{type:'set_activity_note',activityId:'a1',note:'x'.repeat(2000)});
  assert.equal(activity(d,'a1').notes?.length,2000);
  assert.throws(()=>run(d,{type:'set_activity_note',activityId:'inexistente',note:'oi'}),/Atividade não encontrada/);
});
test('dependencyConflicts acusa a ligação dentro do mesmo vagão e ignora a sequência correta',()=>{
  const d=createMockData();
  run(d,link('a1','a2'));
  assert.deepEqual(dependencyConflicts(d),[]);
  const mesmoVagao=run(d,link('a1','b1'));
  const conflicts=dependencyConflicts(d);
  assert.deepEqual(conflicts.map(c=>c.dependency.id),[mesmoVagao]);
  assert.equal(conflicts[0].predecessor.id,'a1');assert.equal(conflicts[0].successor.id,'b1');
});
test('consulta não liga, desliga nem anota',()=>{
  const d=createMockData();
  const dependencyId=run(d,link('a1','a2'));
  assert.throws(()=>run(d,link('a2','a3'),'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'unlink_activities',dependencyId},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'set_activity_note',activityId:'a1',note:'Anotação da consulta'},'user-3'),/apenas consulta/);
  assert.deepEqual(pairs(d),['a1>a2']);
  assert.equal(activity(d,'a1').notes,undefined);
});
test('vínculo recusado não deixa rastro no snapshot',async()=>{
  const repo=new MockPlanningRepository();const before=await repo.getSnapshot();
  await assert.rejects(repo.transaction(d=>run(d,link('a1','a1'))),/si mesma/);
  assert.deepEqual(await repo.getSnapshot(),before);
  await repo.transaction(d=>run(d,link('a1','a2')));
  const linked=await repo.getSnapshot();
  await assert.rejects(repo.transaction(d=>run(d,link('a2','a1'))),/ciclo/);
  assert.deepEqual(await repo.getSnapshot(),linked);
});

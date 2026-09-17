import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { createMockData } from '../src/mocks/planning';
import { leadTimeDeadline } from '../src/domain/rules';
import type { PlanningData } from '../src/domain/entities';
let id=0;
const context=(actorId='user-1'):CommandContext=>({actorId,today:'2026-09-08',now:'2026-09-08T12:00:00Z',newId:()=>`test-${++id}`});
const run=(d:PlanningData,c:Command,actorId='user-1')=>applyCommand(d,c,context(actorId));
const base={description:'Esquadria de alumínio sem pedido de compra',responsibleId:'user-1',blocksExecution:true,blocksTerminality:true} as const;
// a4 pertence ao v4, que começa em 2026-09-06; a3 pertence ao v3, que começa em 2026-09-01.
const restriction=(extra:Partial<Extract<Command,{type:'create_restriction'}>>={}):Command=>({type:'create_restriction',wagonId:'v4',activityId:'a4',dueDate:'2026-09-09',...base,...extra});
const created=(d:PlanningData,command:Command)=>{const createdId=run(d,command);return d.restrictions.find(r=>r.id===createdId)!;};

test('o limite sai do início previsto da atividade menos o lead time',()=>{
  const d=createMockData();
  assert.equal(created(d,restriction({leadTimeDays:45})).dueDate,'2026-07-23');
});
test('lead time zero mantém o próprio início previsto',()=>{
  const d=createMockData();
  assert.equal(created(d,restriction({wagonId:'v5',activityId:'a5',leadTimeDays:0})).dueDate,'2026-09-11');
});
test('o desconto do lead time atravessa a virada de mês',()=>{
  const d=createMockData();
  assert.equal(created(d,restriction({wagonId:'v3',activityId:'a3',leadTimeDays:1})).dueDate,'2026-08-31');
});
test('leadTimeDeadline atravessa a virada de ano',()=>{
  assert.equal(leadTimeDeadline('2027-01-05',10),'2026-12-26');
  assert.equal(leadTimeDeadline('2026-09-11',200),'2026-02-23');
});
test('com lead time, a data enviada pelo cliente é ignorada',()=>{
  const d=createMockData();
  assert.equal(created(d,restriction({leadTimeDays:45,dueDate:'2030-01-01'})).dueDate,'2026-07-23');
});
test('lead time sem atividade vinculada é recusado',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,restriction({activityId:undefined,leadTimeDays:45})),/atividade/);
});
test('lead time fracionário ou negativo é recusado',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,restriction({leadTimeDays:2.5})),/inteiro/);
  assert.throws(()=>run(d,restriction({leadTimeDays:-1})),/inteiro/);
});
test('atividade de outro vagão é recusada',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,restriction({wagonId:'v4',activityId:'a3',leadTimeDays:10})),/não pertence ao vagão/);
});
test('o lead time é gravado na pendência e fica ausente quando não informado',()=>{
  const d=createMockData();
  assert.equal(created(d,restriction({leadTimeDays:45})).leadTimeDays,45);
  assert.equal(created(d,restriction({activityId:'b4'})).leadTimeDays,undefined);
});
test('sem lead time o prazo continua vindo do comando e exige data válida',()=>{
  const d=createMockData();
  assert.equal(created(d,restriction({dueDate:'2026-09-30'})).dueDate,'2026-09-30');
  assert.throws(()=>run(d,restriction({activityId:'b4',dueDate:'30/09/2026'})),/Data inválida/);
});
test('nova pendência entra na coluna identificada e resolver leva para resolvida',()=>{
  const d=createMockData();
  const record=created(d,restriction({leadTimeDays:45}));
  assert.equal(record.boardStatus,'identificada');
  run(d,{type:'resolve_restriction',restrictionId:record.id,resolution:'Pedido colocado e prazo confirmado'});
  assert.equal(record.boardStatus,'resolvida');
});
test('pendência de vagão (create_pending) não tem lead time e usa a data do comando',()=>{
  const d=createMockData();
  const createdId=run(d,{type:'create_pending',wagonId:'v4',activityId:'a4',description:'Conferir projeto',responsibleId:'user-1',dueDate:'2026-09-20',blocksTerminality:true});
  const pending=d.pendingItems.find(p=>p.id===createdId)!;
  assert.equal(pending.dueDate,'2026-09-20');
  assert.equal('leadTimeDays' in pending,false);
});
test('consulta não registra pendência com lead time',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,restriction({leadTimeDays:45}),'user-3'),/apenas consulta/);
});
test('pendência recusada não deixa rastro no snapshot',async()=>{
  const repo=new MockPlanningRepository();const before=await repo.getSnapshot();
  await assert.rejects(repo.transaction(d=>run(d,restriction({leadTimeDays:-5}))),/inteiro/);
  assert.deepEqual(await repo.getSnapshot(),before);
});

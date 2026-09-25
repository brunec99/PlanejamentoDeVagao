import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CALENDAR as calendar, scheduleTasks, parseDuration, endFor, temporalTarget, planSnapshot } from '../src/domain/plan-schedule';
import type { PlanTask, PlanDependency, LinkType } from '../src/domain/entities';
import { createMockData } from '../src/mocks/planning';
import { applyCommand, type CommandContext } from '../src/application/use-cases/commands';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
const stamp={createdAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z'};
const task=(id:string,start='2026-09-07',duration='2d'):PlanTask=>({id,...stamp,planId:'p',name:id,plannedStart:start,plannedEnd:endFor(start,parseDuration(duration),calendar).end,duration:parseDuration(duration),level:0,order:Number(id)||1,progress:0});
const link=(type:LinkType='TI',lagDays=0,lagBusiness=true):PlanDependency=>({id:'l',...stamp,predecessorId:'1',successorId:'2',type,lagDays,lagBusiness});
let seq=0;const context:CommandContext={actorId:'user-1',today:'2026-09-22',now:'2026-09-22T12:00:00Z',newId:()=>`generated-${++seq}`};
for(const [type,start,end] of [['TI','2026-09-09','2026-09-10'],['II','2026-09-07','2026-09-08'],['TT','2026-09-07','2026-09-08'],['IT','2026-09-04','2026-09-07']] as const)test(`motor calcula ${type}`,()=>{const result=scheduleTasks([task('1'),task('2')],[link(type)]);assert.equal(result[1].plannedStart,start);assert.equal(result[1].plannedEnd,end);});
test('calendário considera feriados, horas, meses úteis e corridos',()=>{
 const c={...calendar,holidays:['2026-09-07']};
 assert.deepEqual(endFor('2026-09-04',parseDuration('16h'),c),{start:'2026-09-04',end:'2026-09-08'});
 assert.equal(endFor('2026-09-04',parseDuration('2dd'),c).end,'2026-09-05');
 assert.equal(endFor('2026-09-01',parseDuration('1mês'),calendar).end,'2026-09-28');
 assert.equal(endFor('2026-09-01',parseDuration('1md'),calendar).end,'2026-09-30');
 assert.throws(()=>parseDuration('-1d'));assert.deepEqual(parseDuration('0d'),{value:0,unit:'d'});assert.throws(()=>parseDuration('NaN'));
});
test('múltiplas predecessoras e defasagens positivas e negativas',()=>{
 const tasks=[task('1'),task('2'),task('3','2026-09-10')];
 const result=scheduleTasks(tasks,[link('II',-1),{...link('TT',2,false),id:'l2',predecessorId:'3'}]);
 assert.equal(result.find(t=>t.id==='2')!.plannedEnd,'2026-09-14');
});
test('ciclos, autorreferência, inexistentes e duplicadas são rejeitados sem mutação',()=>{
 const tasks=[task('1'),task('2')],copy=structuredClone(tasks);
 for(const links of [[link(),{...link(),id:'l2',predecessorId:'2',successorId:'1'}],[{...link(),predecessorId:'2'}],[{...link(),predecessorId:'404'}],[link(),{...link(),id:'l2'}]])assert.throws(()=>scheduleTasks(tasks,links));
 assert.deepEqual(tasks,copy);
});
test('cadeia longa não usa recursão e recalcula integralmente',()=>{
 const tasks=Array.from({length:1200},(_,i)=>task(String(i+1),'2026-09-07','1dd'));
 const links=tasks.slice(1).map((t,i)=>({...link(),id:`l${i}`,predecessorId:tasks[i].id,successorId:t.id}));
 const result=scheduleTasks(tasks,links);assert.equal(result.at(-1)!.plannedStart,'2029-12-19');
});
test('datas civis independem de fuso e alvo respeita calendário',()=>{
 const before=process.env.TZ;
 try{for(const tz of ['UTC','America/Sao_Paulo','Pacific/Auckland']){process.env.TZ=tz;assert.equal(endFor('2026-09-04',parseDuration('2d'),calendar).end,'2026-09-07');assert.equal(temporalTarget(task('1'),'2026-09-07',calendar),50);}}finally{process.env.TZ=before;}
});
function setup(){const data=createMockData();data.plans.push({id:'p',...stamp,workId:'obra-1',month:'2026-09',name:'Teste',createdBy:'user-1'});data.planTasks.push(task('1'),task('2'));return data;}
test('revisão exige motivo, perfil e snapshot, preserva rascunho e grava histórico',async()=>{
 const data=setup(),plan=data.plans.find(p=>p.id==='p')!;const repository=new MockPlanningRepository(data);
 const tasks=structuredClone(data.planTasks.filter(t=>t.planId==='p'));tasks[0].progress=40;tasks[0].actualStart=tasks[0].plannedStart;
 const command={type:'save_plan_revision' as const,planId:'p',expectedSnapshot:planSnapshot(plan,data.planTasks,data.planDependencies),reason:'Reunião',tasks,links:[],calendar};
 await assert.rejects(repository.transaction(d=>applyCommand(d,{...command,reason:''},context)),/Motivo/);
 await assert.rejects(repository.transaction(d=>applyCommand(d,command,{...context,actorId:'user-3'})),/consulta/);
 assert.deepEqual(await repository.getSnapshot(),data);
 await repository.transaction(d=>applyCommand(d,command,context));
 const saved=await repository.getSnapshot();assert.equal(saved.planTasks.find(t=>t.id==='1')!.progress,40);assert.ok(saved.history.some(h=>h.action==='plan_task_revision'&&h.changes.reason==='Reunião'));
 await assert.rejects(repository.transaction(d=>applyCommand(d,command,context)),/Outra pessoa/);assert.deepEqual(await repository.getSnapshot(),saved);
});
test('erro numa tarefa rejeita lote todo e baseline preserva vínculos e IDs de origem',async()=>{
 const data=setup(),plan=data.plans.find(p=>p.id==='p')!;data.planDependencies.push(link());
 const repository=new MockPlanningRepository(data);const tasks=scheduleTasks(data.planTasks.filter(t=>t.planId==='p'),[link()]);tasks[0].progress=20;tasks[0].actualStart=tasks[0].plannedStart;tasks[1].progress=101;
 await assert.rejects(repository.transaction(d=>applyCommand(d,{type:'save_plan_revision',planId:'p',expectedSnapshot:planSnapshot(plan,data.planTasks,data.planDependencies),reason:'Teste',tasks,links:[link()],calendar},context)),/100/);
 assert.deepEqual(await repository.getSnapshot(),data);
 const id=applyCommand(data,{type:'freeze_plan_baseline',planId:'p',name:'Base teste'},context);
 const copies=data.planTasks.filter(t=>t.planId===id);assert.deepEqual(copies.map(t=>t.sourceTaskId),['1','2']);assert.ok(data.planDependencies.some(l=>l.predecessorId===copies[0].id&&l.successorId===copies[1].id));
});
test('substituição de predecessoras inválida mantém conjunto anterior',()=>{
 const data=setup();data.planDependencies.push(link());const before=structuredClone(data);
 assert.throws(()=>applyCommand(data,{type:'replace_plan_predecessors',taskId:'2',links:[{predecessorId:'404',linkType:'TI',lagDays:0,lagBusiness:true}]},context));assert.deepEqual(data,before);
});

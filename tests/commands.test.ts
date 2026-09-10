import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, assessRelease, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { createMockData } from '../src/mocks/planning';
import { isTerminal } from '../src/domain/rules';
import type { Activity, PlanningData } from '../src/domain/entities';
let id=0;
const context=(actorId='user-1'):CommandContext=>({actorId,today:'2026-09-08',now:'2026-09-08T12:00:00Z',newId:()=>`test-${++id}`});
const input=(a:Activity)=>({name:a.name,locationId:a.locationId,responsibleId:a.responsibleId,plannedStart:a.plannedStart,plannedEnd:a.plannedEnd,weight:a.weight,mandatory:a.mandatory});
const run=(d:PlanningData,c:Command,actorId='user-1')=>applyCommand(d,c,context(actorId));
function unreleased(){const d=createMockData();d.releases=d.releases.filter(r=>r.wagonId!=='v3');d.debts=[];d.history=[];return d;}
const exceptional:Command={type:'release',wagonId:'v3',mode:'exceptional',justification:'Equipe dedicada',responsibleId:'user-1',dueDate:'2026-09-10'};

test('consulta e usuário de outra obra não podem alterar dados',()=>{
  const d=createMockData();assert.throws(()=>run(d,{type:'create_location',workId:'obra-1',name:'Novo'},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'create_sequence',workId:'obra-2',name:'Novo',taktDays:5,calendar:'calendar_days'},'user-2'),/acesso/);
});
test('execução exige liberação e respeita restrição da atividade',()=>{
  const d=createMockData();const a=d.activities.find(a=>a.id==='a5')!;
  assert.throws(()=>run(d,{type:'update_activity',activityId:a.id,activity:input(a),progress:10,status:'in_progress'}),/Libere/);
  const blocked=d.activities.find(a=>a.id==='a3')!;
  assert.throws(()=>run(d,{type:'update_activity',activityId:blocked.id,activity:input(blocked),progress:60,status:'in_progress'}),/restrição/);
  const other=d.activities.find(a=>a.id==='b3')!;
  run(d,{type:'update_activity',activityId:other.id,activity:input(other),progress:60,status:'in_progress'});
  assert.equal(other.progress,60);
});
test('encerramento exige progresso, critérios e resolução de pendências',()=>{
  const d=createMockData();for(const a of d.activities.filter(a=>a.wagonId==='v2'))run(d,{type:'update_activity',activityId:a.id,activity:input(a),progress:100,status:'completed'});
  assert.equal(isTerminal('v2',d),false);run(d,{type:'set_criterion',criterionId:'c2',fulfilled:true});
  assert.equal(isTerminal('v2',d),false);run(d,{type:'resolve_pending',pendingId:'p1',resolution:'Executado e conferido'});
  assert.equal(isTerminal('v2',d),true);
  assert.equal(d.pendingItems.find(p=>p.id===d.debts[0].pendingItemId)?.status,'resolved');
});
test('reabertura exige gestor e justificativa, preservando liberações e histórico',()=>{
  const d=createMockData();const originalReleases=structuredClone(d.releases);
  assert.throws(()=>run(d,{type:'set_criterion',criterionId:'c1',fulfilled:false}),/Justificativa/);
  assert.throws(()=>run(d,{type:'set_criterion',criterionId:'c1',fulfilled:false,reason:'Falha identificada'},'user-2'),/gestor/);
  run(d,{type:'set_criterion',criterionId:'c1',fulfilled:false,reason:'Falha identificada'});
  assert.equal(isTerminal('v1',d),false);assert.deepEqual(d.releases,originalReleases);
  assert.ok(d.history.some(e=>e.action==='terminality_reopened'&&e.entityId==='v1'));
});
test('redução de progresso exige justificativa mesmo fora de vagão terminal',()=>{
  const d=createMockData();const a=d.activities[1];assert.throws(()=>run(d,{type:'update_activity',activityId:a.id,activity:input(a),progress:50,status:'in_progress'}),/Justificativa/);
});
test('liberação normal depende de terminalidade e não de data',()=>{
  const d=unreleased();assert.equal(assessRelease(d,'v3').normal,false);assert.throws(()=>run(d,{type:'release',wagonId:'v3',mode:'normal'}),/terminal/);
  for(const a of d.activities.filter(a=>a.wagonId==='v2')){a.progress=100;a.status='completed';}d.criteria[1].fulfilled=true;d.pendingItems[0].status='resolved';
  run(d,{type:'release',wagonId:'v3',mode:'normal'});assert.equal(d.releases.at(-1)?.type,'normal');
});
test('liberação excepcional exige gestor, justificativa, responsável e prazo futuro',()=>{
  assert.throws(()=>run(unreleased(),exceptional,'user-2'),/gestor/);
  assert.throws(()=>run(unreleased(),{...exceptional,justification:''}),/Justificativa/);
  assert.throws(()=>run(unreleased(),{...exceptional,responsibleId:'inexistente'}),/Responsável/);
  assert.throws(()=>run(unreleased(),{...exceptional,dueDate:'2026-09-08'}),/futuro/);
});
test('liberação excepcional cria dívida e autorização sem concluir predecessor',()=>{
  const d=unreleased();run(d,exceptional);assert.equal(d.debts.length,1);assert.equal(d.debts[0].pendingItemId,'p1');assert.equal(d.debts[0].releaseId,d.releases.at(-1)?.id);assert.equal(isTerminal('v2',d),false);
  assert.throws(()=>run(d,exceptional),/já liberado/);
});
test('condições descobertas e restrições impeditivas não podem ser contornadas',()=>{
  const d=unreleased();d.pendingItems=[];assert.throws(()=>run(d,exceptional),/Registre pendências/);
  const restricted=unreleased();restricted.restrictions[0].wagonId='v2';assert.throws(()=>run(restricted,exceptional),/restrições impeditivas/);
});
test('dívida herdada é reconhecida sem duplicação ou renovação silenciosa de prazo',()=>{
  const d=createMockData();d.restrictions=[];
  const v3=d.wagons.find(w=>w.id==='v3')!;
  d.wagons.push({...v3,id:'new-next',number:7,predecessorId:'v3',plannedStart:'2026-09-06',plannedEnd:'2026-09-10'});
  for(const a of d.activities.filter(a=>a.wagonId==='v3')){a.progress=100;a.status='completed';}d.criteria.find(c=>c.activityId==='a3')!.fulfilled=true;
  assert.equal(assessRelease(d,'new-next').normal,false);
  run(d,{...exceptional,wagonId:'new-next'});
  assert.equal(d.debts.length,1);assert.equal(d.debts[0].dueDate,'2026-09-07');assert.deepEqual(d.releases.at(-1)?.acknowledgedDebtIds,['d1']);
});
test('transação falha não grava mudanças parciais nem histórico',async()=>{
  const repo=new MockPlanningRepository();const before=await repo.getSnapshot();
  await assert.rejects(repo.transaction(d=>{d.pendingItems[0].status='resolved';throw new Error('Falha');}));
  assert.deepEqual(await repo.getSnapshot(),before);
});
test('cadastro temporal proíbe ramificação e sobreposição',async()=>{
  const repo=new MockPlanningRepository();const before=await repo.getSnapshot();
  const command:Command={type:'create_wagon',sequenceId:'seq-1',number:7,predecessorId:'v1',plannedStart:'2026-09-11',plannedEnd:'2026-09-15',responsibleId:'user-1'};
  await assert.rejects(repo.transaction(d=>run(d,command)),/múltiplos/);
  assert.deepEqual(await repo.getSnapshot(),before);
  assert.throws(()=>run(createMockData(),{...command,predecessorId:'v3',plannedStart:'2026-09-05'}),/após/);
});
test('importação mantém local por atividade e exige conferência mesmo com progresso 100',()=>{
  const d=createMockData();run(d,{type:'import_activities',wagonId:'v6',projectId:'123',responsibleId:'user-1',rows:[{externalId:'99',name:'Importada',location:'Cobertura',plannedStart:'2026-09-01',plannedEnd:'2026-09-05',progress:100}]});
  const a=d.activities.at(-1)!;assert.equal(a.origin,'prevision');assert.equal(a.previsionExternalId,'123:99');assert.equal(a.progress,100);
  assert.equal(d.criteria.find(c=>c.activityId===a.id)?.fulfilled,false);assert.equal(isTerminal('v6',d),false);assert.equal('locationId' in d.wagons[5],false);
});
test('importação duplicada, inválida ou fora do período é atômica',async()=>{
  const repo=new MockPlanningRepository();const before=await repo.getSnapshot();
  const row={externalId:'99',name:'Importada',location:'Cobertura',plannedStart:'2026-09-01',plannedEnd:'2026-09-05',progress:0};
  const command:Command={type:'import_activities',wagonId:'v6',projectId:'123',responsibleId:'user-1',rows:[row,row]};
  await assert.rejects(repo.transaction(d=>run(d,command)),/já importada/);assert.deepEqual(await repo.getSnapshot(),before);
  await assert.rejects(repo.transaction(d=>run(d,{...command,rows:[{...row,plannedEnd:'2026-09-06'}]})),/período/);assert.deepEqual(await repo.getSnapshot(),before);
});
test('atividade deve respeitar janela, local da obra e status coerente',()=>{
  const d=createMockData();const a=d.activities[1];
  assert.throws(()=>run(d,{type:'update_activity',activityId:a.id,activity:{...input(a),plannedStart:'2026-01-01'},progress:75,status:'in_progress'}),/período/);
  assert.throws(()=>run(d,{type:'update_activity',activityId:a.id,activity:{...input(a),locationId:'outro'},progress:75,status:'in_progress'}),/Local/);
  assert.throws(()=>run(d,{type:'update_activity',activityId:a.id,activity:input(a),progress:75,status:'completed'}),/100%/);
});
test('vínculo da obra impede misturar projetos externos',async()=>{
  const d=createMockData();d.works[0].previsionProjectId='outro';const repo=new MockPlanningRepository(d);const before=await repo.getSnapshot();
  await assert.rejects(repo.transaction(d=>run(d,{type:'import_activities',wagonId:'v6',projectId:'123',responsibleId:'user-1',rows:[{externalId:'99',name:'Importada',location:'Cobertura',plannedStart:'2026-09-01',plannedEnd:'2026-09-05',progress:0}]})),/vínculo/);
  assert.deepEqual(await repo.getSnapshot(),before);
});

test('editar o peso de uma fatia subtrai a diferença da fatia seguinte',()=>{
  const d=createMockData();
  const slice1:Activity={...d.activities[0],id:'s1',wagonId:'v4',plannedStart:'2026-09-06',plannedEnd:'2026-09-10',mandatory:false,progress:0,status:'not_started',name:'EST - fatia 1',weight:0.6,previsionExternalId:'29875:9000#1'};
  const slice2:Activity={...d.activities[0],id:'s2',wagonId:'v5',plannedStart:'2026-09-11',plannedEnd:'2026-09-15',mandatory:false,progress:0,status:'not_started',name:'EST - fatia 2',weight:0.4,previsionExternalId:'29875:9000#2'};
  d.activities.push(slice1,slice2);
  run(d,{type:'update_activity',activityId:'s1',activity:input({...slice1,weight:0.8}),progress:0,status:'not_started'});
  assert.equal(d.activities.find(a=>a.id==='s1')!.weight,0.8);
  assert.equal(d.activities.find(a=>a.id==='s2')!.weight,0.2);
});
test('editar peso de fatia sem seguinte suficiente é recusado',()=>{
  const d=createMockData();
  const slice1:Activity={...d.activities[0],id:'s1',wagonId:'v4',plannedStart:'2026-09-06',plannedEnd:'2026-09-10',mandatory:false,progress:0,status:'not_started',name:'EST - fatia 1',weight:0.6,previsionExternalId:'29875:9001#1'};
  const slice2:Activity={...d.activities[0],id:'s2',wagonId:'v5',plannedStart:'2026-09-11',plannedEnd:'2026-09-15',mandatory:false,progress:0,status:'not_started',name:'EST - fatia 2',weight:0.1,previsionExternalId:'29875:9001#2'};
  d.activities.push(slice1,slice2);
  assert.throws(()=>run(d,{type:'update_activity',activityId:'s1',activity:input({...slice1,weight:0.9}),progress:0,status:'not_started'}),/fatia seguinte/);
  assert.equal(d.activities.find(a=>a.id==='s1')!.weight,0.6,'nada deve mudar quando a operação falha');
});

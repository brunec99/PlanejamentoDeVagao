import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { diffDeletedIds } from '../src/infrastructure/repositories/supabase/mappers';
import { createMockData } from '../src/mocks/planning';
import { matchesRule, rulesNeedingReview, serviceForElement, type ElementFacts } from '../src/domain/rules';
import type { LinkRule, LinkRuleCriterion, PlanningData } from '../src/domain/entities';
let id=0;
const context=(actorId='user-1'):CommandContext=>({actorId,today:'2026-09-08',now:'2026-09-08T12:00:00Z',newId:()=>`test-${++id}`});
const run=(d:PlanningData,c:Command,actorId='user-1')=>applyCommand(d,c,context(actorId));
const stamp={createdAt:'2026-08-20T12:00:00Z',updatedAt:'2026-08-20T12:00:00Z'};
const newModel=(d:PlanningData,name='Estrutura',workId='obra-1',actorId='user-1')=>run(d,{type:'create_ifc_model',workId,name,discipline:'Estrutural'},actorId);
const upload=(d:PlanningData,modelId:string,storagePath:string,storeys:string[]=['Térreo'],actorId='user-1')=>run(d,{type:'add_ifc_version',modelId,fileName:'torre.ifc',fileSize:2048,storagePath,storeys,elementCount:120},actorId);
const newRule=(d:PlanningData,serviceName:string,criteria:LinkRuleCriterion[],workId='obra-1',actorId='user-1')=>run(d,{type:'create_link_rule',workId,serviceName,criteria},actorId);
const rule=(order:number,serviceName:string,criteria:LinkRuleCriterion[],ruleId=`regra-${order}`):LinkRule=>({id:ruleId,...stamp,workId:'obra-1',order,serviceName,criteria});
const element=(pavimento:string,tipo:string):ElementFacts=>({pavimento,tipo});

test('consulta é bloqueada nos quatro comandos do repositório IFC',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'create_ifc_model',workId:'obra-1',name:'Estrutura',discipline:'Estrutural'},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'add_ifc_version',modelId:'m1',fileName:'torre.ifc',fileSize:10,storagePath:'obra-1/torre.ifc',storeys:[],elementCount:0},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'create_link_rule',workId:'obra-1',serviceName:'Alvenaria',criteria:[{property:'tipo',operator:'igual',value:'Parede'}]},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'delete_link_rule',ruleId:'regra-1'},'user-3'),/apenas consulta/);
  assert.equal(d.ifcModels.length,0);assert.equal(d.linkRules.length,0);
});
test('obra sem acesso é bloqueada no modelo, na versão e nas regras',()=>{
  const d=createMockData();
  const modelId=newModel(d,'Estrutura Aurora','obra-2');
  const ruleId=newRule(d,'Alvenaria',[{property:'tipo',operator:'igual',value:'Parede'}],'obra-2');
  assert.throws(()=>run(d,{type:'create_ifc_model',workId:'obra-2',name:'Hidráulica',discipline:'Hidráulica'},'user-2'),/acesso/);
  assert.throws(()=>upload(d,modelId,'obra-2/torre.ifc',['Térreo'],'user-2'),/acesso/);
  assert.throws(()=>run(d,{type:'create_link_rule',workId:'obra-2',serviceName:'Alvenaria',criteria:[{property:'tipo',operator:'igual',value:'Parede'}]},'user-2'),/acesso/);
  assert.throws(()=>run(d,{type:'delete_link_rule',ruleId},'user-2'),/acesso/);
  assert.equal(d.ifcVersions.length,0);assert.equal(d.linkRules.length,1);
});
test('modelo exige nome e disciplina e o nome é único na obra sem distinguir caixa',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'create_ifc_model',workId:'obra-1',name:'  ',discipline:'Estrutural'}),/Nome do modelo/);
  assert.throws(()=>run(d,{type:'create_ifc_model',workId:'obra-1',name:'Estrutura',discipline:'  '}),/Disciplina/);
  const modelId=newModel(d,'Estrutura Torre A');
  assert.throws(()=>newModel(d,'estrutura torre a'),/já cadastrado/);
  assert.throws(()=>newModel(d,'  ESTRUTURA TORRE A  '),/já cadastrado/);
  newModel(d,'Estrutura Torre A','obra-2');
  assert.deepEqual(d.ifcModels.map(m=>m.workId),['obra-1','obra-2']);
  assert.equal(d.ifcModels.find(m=>m.id===modelId)?.discipline,'Estrutural');
});
test('o repositório aceita apenas arquivos .ifc',()=>{
  const d=createMockData();const modelId=newModel(d);
  assert.throws(()=>run(d,{type:'add_ifc_version',modelId,fileName:'torre.rvt',fileSize:10,storagePath:'obra-1/a',storeys:[],elementCount:0}),/apenas modelos IFC/);
  assert.throws(()=>run(d,{type:'add_ifc_version',modelId,fileName:'torre.pdf',fileSize:10,storagePath:'obra-1/b',storeys:[],elementCount:0}),/apenas modelos IFC/);
  assert.throws(()=>run(d,{type:'add_ifc_version',modelId,fileName:'torre',fileSize:10,storagePath:'obra-1/c',storeys:[],elementCount:0}),/apenas modelos IFC/);
  assert.throws(()=>run(d,{type:'add_ifc_version',modelId,fileName:'  ',fileSize:10,storagePath:'obra-1/d',storeys:[],elementCount:0}),/Nome do arquivo/);
  assert.equal(d.ifcVersions.length,0);
  upload(d,modelId,'obra-1/torre.IFC');
  assert.equal(run(d,{type:'add_ifc_version',modelId,fileName:'TORRE.IFC',fileSize:10,storagePath:'obra-1/maiuscula',storeys:[],elementCount:0}).length>0,true);
});
test('versão recusa caminho já registrado, arquivo vazio e modelo inexistente',()=>{
  const d=createMockData();const modelId=newModel(d);
  upload(d,modelId,'obra-1/estrutura/v1.ifc');
  assert.throws(()=>upload(d,modelId,'obra-1/estrutura/v1.ifc'),/já foi registrada/);
  assert.throws(()=>run(d,{type:'add_ifc_version',modelId,fileName:'torre.ifc',fileSize:0,storagePath:'obra-1/estrutura/v2.ifc',storeys:[],elementCount:0}),/Arquivo vazio/);
  assert.throws(()=>run(d,{type:'add_ifc_version',modelId,fileName:'torre.ifc',fileSize:-1,storagePath:'obra-1/estrutura/v3.ifc',storeys:[],elementCount:0}),/Arquivo vazio/);
  assert.throws(()=>upload(d,'inexistente','obra-1/estrutura/v4.ifc'),/Modelo não encontrado/);
  assert.equal(d.ifcVersions.length,1);
});
test('a versão vale sem arquivo guardado: o que sustenta ela são as tabelas transcritas',()=>{
  const d=createMockData();const modelId=newModel(d);
  // Um IFC grande não cabe no Storage, mas a transcrição cabe no banco: a versão existe assim mesmo.
  const semArquivo=run(d,{type:'add_ifc_version',modelId,fileName:'torre.ifc',fileSize:200000000,storeys:['Terreo'],elementCount:1200});
  assert.equal(d.ifcVersions.find(v=>v.id===semArquivo)?.storagePath,undefined);
  const emBranco=run(d,{type:'add_ifc_version',modelId,fileName:'torre.ifc',fileSize:10,storagePath:'   ',storeys:[],elementCount:0});
  assert.equal(d.ifcVersions.find(v=>v.id===emBranco)?.storagePath,undefined);
  assert.equal(d.ifcVersions.filter(v=>v.modelId===modelId).length,2);
});
test('a numeração de versões sobe por modelo e é independente entre modelos',()=>{
  const d=createMockData();
  const estrutura=newModel(d,'Estrutura');const hidraulica=newModel(d,'Hidráulica');
  const primeira=upload(d,estrutura,'obra-1/estrutura/v1.ifc');
  const segunda=upload(d,estrutura,'obra-1/estrutura/v2.ifc');
  const outra=upload(d,hidraulica,'obra-1/hidraulica/v1.ifc');
  assert.equal(d.ifcVersions.find(v=>v.id===primeira)?.version,1);
  assert.equal(d.ifcVersions.find(v=>v.id===segunda)?.version,2);
  assert.equal(d.ifcVersions.find(v=>v.id===outra)?.version,1);
  assert.equal(upload(d,estrutura,'obra-1/estrutura/v3.ifc')&&d.ifcVersions.filter(v=>v.modelId===estrutura).map(v=>v.version).join(),'1,2,3');
});
test('pavimentos são deduplicados e aparados e o envio fica no nome do ator',()=>{
  const d=createMockData();const modelId=newModel(d);
  const versionId=upload(d,modelId,'obra-1/estrutura/v1.ifc',[' Térreo ','Térreo','   ','1º Pavimento','1º Pavimento '],'user-2');
  const version=d.ifcVersions.find(v=>v.id===versionId)!;
  assert.deepEqual(version.storeys,['Térreo','1º Pavimento']);
  assert.equal(version.uploadedBy,'user-2');
  assert.equal(version.elementCount,120);
  assert.equal(version.fileSize,2048);
});
test('novas versões IFC preservam seus respectivos históricos',()=>{
  const d=createMockData();const modelId=newModel(d);
  const primeiraId=upload(d,modelId,'obra-1/estrutura/v1.ifc',['Térreo'],'user-2');
  const antes=structuredClone(d.ifcVersions.find(v=>v.id===primeiraId)!);
  upload(d,modelId,'obra-1/estrutura/v2.ifc',['Térreo','1º Pavimento']);
  assert.equal(d.ifcVersions.length,2);
  assert.deepEqual(d.ifcVersions.find(v=>v.id===primeiraId),antes);
  assert.deepEqual(d.ifcVersions.map(v=>v.version),[1,2]);
  assert.deepEqual(d.ifcVersions.find(v=>v.version===2)?.storeys,['Térreo','1º Pavimento']);
});
test('regra exige serviço e ao menos um critério válido',()=>{
  const d=createMockData();
  assert.throws(()=>newRule(d,'  ',[{property:'tipo',operator:'igual',value:'Parede'}]),/Serviço/);
  assert.throws(()=>newRule(d,'Alvenaria',[]),/ao menos um critério/);
  assert.throws(()=>newRule(d,'Alvenaria',[{property:'material' as 'tipo',operator:'igual',value:'Parede'}]),/não suportada/);
  assert.throws(()=>newRule(d,'Alvenaria',[{property:'tipo',operator:'termina' as 'igual',value:'Parede'}]),/Operador inválido/);
  assert.throws(()=>newRule(d,'Alvenaria',[{property:'tipo',operator:'igual',value:'  '}]),/Valor do critério/);
  assert.equal(d.linkRules.length,0);
});
test('a ordem da regra sobe por obra e os valores são aparados',()=>{
  const d=createMockData();
  const primeira=newRule(d,'Alvenaria',[{property:'tipo',operator:'igual',value:'  Parede  '}]);
  const segunda=newRule(d,'Contrapiso',[{property:'tipo',operator:'contem',value:'Laje'},{property:'pavimento',operator:'igual',value:'Térreo'}]);
  const outraObra=newRule(d,'Alvenaria',[{property:'tipo',operator:'igual',value:'Parede'}],'obra-2');
  assert.equal(d.linkRules.find(r=>r.id===primeira)?.order,1);
  assert.equal(d.linkRules.find(r=>r.id===segunda)?.order,2);
  assert.equal(d.linkRules.find(r=>r.id===outraObra)?.order,1);
  assert.equal(d.linkRules.find(r=>r.id===primeira)?.criteria[0].value,'Parede');
  assert.equal(d.linkRules.find(r=>r.id===segunda)?.criteria.length,2);
});
test('excluir regra remove só a alvo e o snapshot acusa a remoção',()=>{
  const d=createMockData();
  const primeira=newRule(d,'Alvenaria',[{property:'tipo',operator:'igual',value:'Parede'}]);
  const segunda=newRule(d,'Contrapiso',[{property:'tipo',operator:'contem',value:'Laje'}]);
  const before=structuredClone(d);
  assert.throws(()=>run(d,{type:'delete_link_rule',ruleId:'inexistente'}),/Regra não encontrada/);
  run(d,{type:'delete_link_rule',ruleId:primeira});
  assert.deepEqual(d.linkRules.map(r=>r.id),[segunda]);
  const diff=diffDeletedIds(before,d);
  assert.deepEqual(diff.link_rules,[primeira]);
  assert.deepEqual(diff.wagons,[]);
});
test('matchesRule exige todos os critérios e ignora caixa e espaços',()=>{
  const alvenaria=rule(1,'Alvenaria',[{property:'pavimento',operator:'igual',value:' 1º PAVIMENTO '},{property:'tipo',operator:'contem',value:'parede'}]);
  assert.equal(matchesRule(alvenaria,element('1º Pavimento','Parede de alvenaria')),true);
  assert.equal(matchesRule(alvenaria,element('  1º pavimento  ','PAREDE')),true);
  assert.equal(matchesRule(alvenaria,element('2º Pavimento','Parede de alvenaria')),false);
  assert.equal(matchesRule(alvenaria,element('1º Pavimento','Laje')),false);
  assert.equal(matchesRule(alvenaria,element('','Parede')),false);
  const igual=rule(1,'Alvenaria',[{property:'tipo',operator:'igual',value:'Parede'}]);
  assert.equal(matchesRule(igual,element('Térreo','Parede de alvenaria')),false);
  const contem=rule(1,'Alvenaria',[{property:'tipo',operator:'contem',value:'Parede de alvenaria'}]);
  assert.equal(matchesRule(contem,element('Térreo','Parede')),false);
});
test('a normalização das regras ignora acento e indicador ordinal',()=>{
  assert.equal(matchesRule(rule(1,'Alvenaria',[{property:'pavimento',operator:'igual',value:'1o pavimento'}]),element('1º Pavimento','Parede')),true);
  assert.equal(matchesRule(rule(1,'Alvenaria',[{property:'pavimento',operator:'igual',value:'1º pavimento'}]),element('1 Pavimento','Parede')),true);
  assert.equal(matchesRule(rule(1,'Alvenaria',[{property:'pavimento',operator:'igual',value:'Terreo'}]),element('Térreo','Parede')),true);
  assert.equal(matchesRule(rule(1,'Alvenaria',[{property:'pavimento',operator:'igual',value:'2 pavimento'}]),element('1º Pavimento','Parede')),false);
});
test('serviceForElement entrega a primeira regra da ordem que casa',()=>{
  const especifica=rule(2,'Alvenaria do térreo',[{property:'pavimento',operator:'igual',value:'Térreo'},{property:'tipo',operator:'contem',value:'parede'}],'regra-especifica');
  const generica=rule(1,'Alvenaria',[{property:'tipo',operator:'contem',value:'parede'}],'regra-generica');
  assert.equal(serviceForElement([especifica,generica],element('Térreo','Parede de alvenaria')),'Alvenaria');
  assert.equal(serviceForElement([{...especifica,order:1},{...generica,order:2}],element('Térreo','Parede de alvenaria')),'Alvenaria do térreo');
  assert.equal(serviceForElement([especifica,generica],element('2º Pavimento','Parede de alvenaria')),'Alvenaria');
  assert.equal(serviceForElement([especifica,generica],element('Térreo','Laje')),undefined);
  assert.equal(serviceForElement([],element('Térreo','Parede')),undefined);
});
test('rulesNeedingReview acusa a regra cujo pavimento não existe no modelo',()=>{
  const storeys=['Térreo','1º Pavimento','2º Pavimento'];
  const ausente=rule(1,'Alvenaria da cobertura',[{property:'pavimento',operator:'igual',value:'Cobertura'}],'regra-ausente');
  const exata=rule(2,'Alvenaria do térreo',[{property:'pavimento',operator:'igual',value:'  térreo '}],'regra-exata');
  const parcial=rule(3,'Alvenaria dos tipos',[{property:'pavimento',operator:'contem',value:'pavimento'}],'regra-parcial');
  const semPavimento=rule(4,'Laje',[{property:'tipo',operator:'contem',value:'laje'}],'regra-sem-pavimento');
  const revisao=rulesNeedingReview([ausente,exata,parcial,semPavimento],storeys);
  assert.deepEqual(revisao.map(r=>r.id),['regra-ausente']);
  assert.deepEqual(rulesNeedingReview([exata,parcial],[]).map(r=>r.id),['regra-exata','regra-parcial']);
  assert.deepEqual(rulesNeedingReview([semPavimento],[]).map(r=>r.id),[]);
});
test('versão recusada não deixa rastro do modelo criado no mesmo comando',async()=>{
  const repo=new MockPlanningRepository();const before=await repo.getSnapshot();
  await assert.rejects(repo.transaction(d=>{
    newModel(d,'Estrutura');
    return run(d,{type:'add_ifc_version',modelId:'inexistente',fileName:'torre.ifc',fileSize:10,storagePath:'obra-1/estrutura/v1.ifc',storeys:[],elementCount:0});
  }),/Modelo não encontrado/);
  assert.deepEqual(await repo.getSnapshot(),before);
  await assert.rejects(repo.transaction(d=>run(d,{type:'create_link_rule',workId:'obra-1',serviceName:'Alvenaria',criteria:[]})),/ao menos um critério/);
  assert.deepEqual(await repo.getSnapshot(),before);
});

test('a classe IFC vira rótulo de obra, e o desconhecido continua legível',async()=>{
  const {groupOf}=await import('../src/modules/ifc/groups');
  assert.equal(groupOf('IfcWallStandardCase'),'Parede');
  assert.equal(groupOf('IFCSLAB'),'Laje');
  assert.equal(groupOf('IfcColumn'),'Pilar');
  assert.equal(groupOf('IfcBuildingElementProxy'),'Genérico');
  // Classe fora do mapa não vira "Outros": o modelo tem o que tem, e a tela mostra.
  assert.equal(groupOf('IfcBuildingElementPart'),'Building Element Part');
  assert.equal(groupOf('IFCFOOTING'),'Fundação');
});

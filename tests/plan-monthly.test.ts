import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CALENDAR as calendar, scheduleTasks, parseDuration, formatDuration, isMilestone, endFor, durationDays, withProgress, withActualStart, withActualEnd, planWindow, planSnapshot } from '../src/domain/plan-schedule';
import { parseLinks, formatLink, formatLinks, rollUpPlan } from '../src/domain/rules';
import type { PlanTask, PlanDependency, LinkType, PlanningData } from '../src/domain/entities';
import { createMockData } from '../src/mocks/planning';
import { applyCommand, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { planningDataToPayload, rowsToPlanningData, type Rows } from '../src/infrastructure/repositories/supabase/mappers';

const stamp={createdAt:'2026-09-01T12:00:00Z',updatedAt:'2026-09-01T12:00:00Z'};
const task=(id:string,start='2026-09-07',duration='2d',extra:Partial<PlanTask>={}):PlanTask=>({id,...stamp,planId:'p',name:id,plannedStart:start,plannedEnd:endFor(start,parseDuration(duration),calendar).end,duration:parseDuration(duration),level:0,order:Number(id)||1,progress:0,...extra});
const link=(predecessorId:string,successorId:string,type:LinkType='TI',lagDays=0,lagBusiness=true):PlanDependency=>({id:`l-${predecessorId}-${successorId}`,...stamp,predecessorId,successorId,type,lagDays,lagBusiness});
const byId=(rows:PlanTask[],id:string)=>rows.find(t=>t.id===id)!;
let seq=0;const context:CommandContext={actorId:'user-1',today:'2026-09-22',now:'2026-09-22T12:00:00Z',newId:()=>`monthly-${++seq}`};
const run=(d:PlanningData,c:Command)=>applyCommand(d,c,context);

test('duração aceita texto do Project, zero é marco e volta formatada em português',()=>{
 for(const [raw,value,unit] of [['10',10,'d'],['10d',10,'d'],['10 dias',10,'d'],['1 dia',1,'d'],['10dd',10,'dd'],['10 dias corridos',10,'dd'],['1 dia corrido',1,'dd'],['8h',8,'h'],['8 horas',8,'h'],['1mês',1,'mês'],['2 meses',2,'mês'],['1md',1,'md'],['2 meses corridos',2,'md'],['0',0,'d'],['0 dias',0,'d'],['3 dias?',3,'d'],['1,5d',1.5,'d']] as const)
  assert.deepEqual(parseDuration(raw),{value,unit},raw);
 for(const bad of ['-1d','dias','10 semanas','10x','']) assert.throws(()=>parseDuration(bad),/duração|Duração/,bad);
 assert.deepEqual([{value:0,unit:'d'},{value:1,unit:'d'},{value:10,unit:'d'},{value:10,unit:'dd'},{value:1,unit:'dd'},{value:8,unit:'h'},{value:1,unit:'mês'},{value:2,unit:'mês'},{value:1,unit:'md'},{value:2,unit:'md'},{value:1.5,unit:'d'}].map(d=>formatDuration(d as PlanTask['duration'] & {})),
  ['0 dias','1 dia','10 dias','10 dias corridos','1 dia corrido','8 h','1 mês','2 meses','1 mês corrido','2 meses corridos','1,5 dias']);
 // O texto formatado é lido de volta igual.
 for(const text of ['0 dias','1 dia','10 dias corridos','8 h','2 meses','1 mês corrido']) assert.equal(formatDuration(parseDuration(text)),text);
 assert.equal(isMilestone({duration:{value:0,unit:'d'}}),true);assert.equal(isMilestone({duration:{value:1,unit:'d'}}),false);assert.equal(isMilestone({}),false);
});

test('marco: início igual ao término, no dia em que a predecessora TI termina, e funciona como predecessora e sucessora',()=>{
 assert.equal(durationDays({value:0,unit:'d'},calendar),0);
 assert.deepEqual(endFor('2026-09-05',{value:0,unit:'d'},calendar),{start:'2026-09-07',end:'2026-09-07'});
 assert.deepEqual(endFor('2026-09-08',{value:0,unit:'dd'},calendar),{start:'2026-09-08',end:'2026-09-08'});
 // 1 (2d, 07–08) → marco 2 (TI) → 3 (1d, TI do marco). Como no Project, o marco fica no dia do término
 // da predecessora, e a tarefa depois dele começa no dia útil seguinte.
 const rows=scheduleTasks([task('1'),task('2','2026-09-01','0'),task('3','2026-09-01','1d')],[link('1','2'),link('2','3')]);
 assert.deepEqual([byId(rows,'2').plannedStart,byId(rows,'2').plannedEnd],['2026-09-08','2026-09-08']);
 assert.deepEqual([byId(rows,'3').plannedStart,byId(rows,'3').plannedEnd],['2026-09-09','2026-09-09']);
 // Marco ligado por TT fica no término da predecessora, sem recuar duração.
 const tt=scheduleTasks([task('1'),task('2','2026-09-01','0')],[link('1','2','TT')]);
 assert.deepEqual([byId(tt,'2').plannedStart,byId(tt,'2').plannedEnd],['2026-09-08','2026-09-08']);
 // Marco numa sexta com sucessora TI: a sucessora vai para segunda.
 const friday=scheduleTasks([task('1','2026-09-04','0'),task('2','2026-09-01','2d')],[link('1','2')]);
 assert.deepEqual([byId(friday,'2').plannedStart,byId(friday,'2').plannedEnd],['2026-09-07','2026-09-08']);
 // Resumo com marco não divide por zero.
 const roll=rollUpPlan([task('1'),{...task('2','2026-09-09','0'),level:1},{...task('3','2026-09-09','0'),level:1}]);
 assert.equal(roll.get('1')!.summary,true);assert.equal(roll.get('1')!.progress,0);assert.equal(roll.get('2')!.milestone,true);
});

test('restrição "Não iniciar antes de" vale junto com as predecessoras: ganha a data mais tarde',()=>{
 const later=scheduleTasks([task('1'),task('2','2026-09-01','2d',{anchorStart:'2026-09-14'})],[link('1','2')]);
 assert.deepEqual([byId(later,'2').plannedStart,byId(later,'2').plannedEnd],['2026-09-14','2026-09-15']);
 const earlier=scheduleTasks([task('1'),task('2','2026-09-01','2d',{anchorStart:'2026-09-02'})],[link('1','2')]);
 assert.equal(byId(earlier,'2').plannedStart,'2026-09-09');
 // Sem predecessora: vale a restrição; sem restrição, o início guardado.
 assert.equal(scheduleTasks([task('1','2026-09-07','2d',{anchorStart:'2026-09-10'})],[])[0].plannedStart,'2026-09-10');
 assert.equal(scheduleTasks([task('1','2026-09-07')],[])[0].plannedStart,'2026-09-07');
});

test('início e término reais prendem as datas e ignoram vínculo e restrição',()=>{
 const started=scheduleTasks([task('1'),task('2','2026-09-01','2d',{actualStart:'2026-09-03',anchorStart:'2026-09-20',progress:10}),task('3','2026-09-01','1d')],[link('1','2'),link('2','3')]);
 assert.deepEqual([byId(started,'2').plannedStart,byId(started,'2').plannedEnd],['2026-09-03','2026-09-04']);
 assert.equal(byId(started,'3').plannedStart,'2026-09-07');
 const finished=scheduleTasks([task('1'),task('2','2026-09-01','2d',{actualStart:'2026-09-03',actualEnd:'2026-09-10',progress:100}),task('3','2026-09-01','1d')],[link('1','2'),link('2','3')]);
 assert.deepEqual([byId(finished,'2').plannedStart,byId(finished,'2').plannedEnd],['2026-09-03','2026-09-10']);
 assert.deepEqual(byId(finished,'2').duration,{value:2,unit:'d'});
 assert.equal(byId(finished,'3').plannedStart,'2026-09-11');
 // Início real num sábado continua no sábado.
 assert.equal(scheduleTasks([task('1','2026-09-07','2d',{actualStart:'2026-09-05'})],[])[0].plannedStart,'2026-09-05');
 assert.throws(()=>scheduleTasks([task('1','2026-09-07','2d',{actualEnd:'2026-09-08'})],[]),/início real/);
 assert.throws(()=>scheduleTasks([task('1','2026-09-07','2d',{actualStart:'2026-09-09',actualEnd:'2026-09-08'})],[]),/Início real/);
});

test('% concluído segue a regra do Project para as datas reais',()=>{
 const t=task('1','2026-09-07','5d');const copy=structuredClone(t);
 const half=withProgress(t,50,calendar);
 assert.equal(half.actualStart,'2026-09-07');assert.equal(half.actualEnd,undefined);assert.equal(half.progress,50);
 const done=withProgress(half,100,calendar);assert.equal(done.actualEnd,'2026-09-11');
 const reopened=withProgress(done,60,calendar);assert.equal(reopened.actualStart,'2026-09-07');assert.equal('actualEnd' in reopened,false);
 const zero=withProgress(done,0,calendar);assert.equal('actualStart' in zero,false);assert.equal('actualEnd' in zero,false);
 // Início real depois do término previsto: o término real não fica antes dele.
 assert.equal(withProgress({...t,actualStart:'2026-09-20'},100,calendar).actualEnd,'2026-09-20');
 assert.throws(()=>withProgress(t,101,calendar),/0 e 100/);assert.throws(()=>withProgress(t,-1,calendar),/0 e 100/);
 assert.deepEqual(t,copy);
});

test('início real: limpar zera o andamento; informar não mexe no %',()=>{
 const t=task('1','2026-09-07','5d',{progress:100,actualStart:'2026-09-07',actualEnd:'2026-09-11'});
 const cleared=withActualStart(t,undefined,calendar);assert.equal(cleared.progress,0);assert.equal('actualStart' in cleared,false);assert.equal('actualEnd' in cleared,false);
 const set=withActualStart(task('1'),'2026-09-08',calendar);assert.equal(set.actualStart,'2026-09-08');assert.equal(set.progress,0);
 assert.throws(()=>withActualStart(t,'2026-09-12',calendar),/Início real não pode ser depois do término real/);
 assert.throws(()=>withActualStart(t,'2026-02-30',calendar),/Data inválida/);
 assert.equal(t.actualStart,'2026-09-07');
});

test('término real conclui a tarefa e recalcula a duração pelo que durou',()=>{
 const t=task('1','2026-09-07','2d');
 const done=withActualEnd(t,'2026-09-10',calendar);
 assert.deepEqual([done.progress,done.actualStart,done.actualEnd],[100,'2026-09-07','2026-09-10']);assert.deepEqual(done.duration,{value:4,unit:'d'});
 // Previsto depois do término informado: o início real é o próprio término, um dia.
 const early=withActualEnd(task('1','2026-09-14','3d'),'2026-09-10',calendar);assert.equal(early.actualStart,'2026-09-10');assert.deepEqual(early.duration,{value:1,unit:'d'});
 // Tarefa em corridos continua em corridos.
 assert.deepEqual(withActualEnd(task('1','2026-09-04','3dd'),'2026-09-07',calendar).duration,{value:4,unit:'dd'});
 assert.deepEqual(withActualEnd(task('1','2026-09-04','1md'),'2026-09-07',calendar).duration,{value:4,unit:'dd'});
 // Marco continua marco: início e término reais no mesmo dia.
 const milestone=withActualEnd(task('1','2026-09-01','0',{actualStart:'2026-09-01'}),'2026-09-09',calendar);
 assert.deepEqual([milestone.actualStart,milestone.actualEnd,milestone.duration?.value,milestone.progress],['2026-09-09','2026-09-09',0,100]);
 assert.throws(()=>withActualEnd({...t,actualStart:'2026-09-11'},'2026-09-10',calendar),/Término real não pode ser antes do início real/);
 assert.throws(()=>withActualEnd(done,undefined,calendar),/Reduza o % concluído/);
 const partial=withActualEnd({...t,progress:50,actualStart:'2026-09-07',actualEnd:'2026-09-08'},undefined,calendar);assert.equal('actualEnd' in partial,false);assert.equal(partial.actualStart,'2026-09-07');
 assert.equal(t.progress,0);assert.equal(t.actualEnd,undefined);
 // Depois do término real, o motor prende o término nele.
 assert.equal(scheduleTasks([done],[])[0].plannedEnd,'2026-09-10');
});

test('janela do plano cobre três meses, inclusive na virada do ano',()=>{
 assert.deepEqual(planWindow('2026-09'),{start:'2026-09-01',end:'2026-11-30'});
 assert.deepEqual(planWindow('2026-11'),{start:'2026-11-01',end:'2027-01-31'});
 assert.deepEqual(planWindow('2026-12'),{start:'2026-12-01',end:'2027-02-28'});
 assert.deepEqual(planWindow('2027-12'),{start:'2027-12-01',end:'2028-02-29'});
 for(const bad of ['2026-13','2026-9','set/2026','']) assert.throws(()=>planWindow(bad),/AAAA-MM/);
});

test('predecessoras no texto do Project: ponto e vírgula, "dias" e ida e volta',()=>{
 const {links,invalid}=parseLinks('27TI+6 dias; 12ii+2 dias corridos;5tt-1 dia, 3; 9IT+3dd; 4II-2 dias decorridos');
 assert.deepEqual(invalid,[]);
 assert.deepEqual(links.map(l=>[l.number,l.type,l.lagDays,l.lagBusiness]),[[27,'TI',6,true],[12,'II',2,false],[5,'TT',-1,true],[3,'TI',0,true],[9,'IT',3,false],[4,'II',-2,false]]);
 assert.equal(formatLink(27,{type:'TI',lagDays:6,lagBusiness:true}),'27TI+6 dias');
 assert.equal(formatLink(12,{type:'II',lagDays:2,lagBusiness:false}),'12II+2 dias corridos');
 assert.equal(formatLink(5,{type:'TT',lagDays:-1,lagBusiness:true}),'5TT-1 dia');
 assert.equal(formatLink(12,{type:'TI',lagDays:0,lagBusiness:true}),'12');assert.equal(formatLink(12,{type:'II',lagDays:0,lagBusiness:false}),'12II');
 const text=formatLinks(links);
 assert.equal(text,'27TI+6 dias;12II+2 dias corridos;5TT-1 dia;3;9IT+3 dias corridos;4II-2 dias corridos');
 assert.deepEqual(parseLinks(text).links,links);
 assert.deepEqual(parseLinks('3XX+2d; 4TI+2 semanas').invalid,['3XX+2d','4TI+2 semanas']);
});

test('resumo mostra o início real mais cedo e o término real só quando tudo terminou',()=>{
 const tasks=[task('1'),{...task('2','2026-09-01','3d',{actualStart:'2026-09-03',actualEnd:'2026-09-05',progress:100}),level:1},{...task('3','2026-09-01','2d',{actualStart:'2026-09-02',progress:50}),level:1},{...task('4','2026-09-10','0'),level:1}];
 const roll=rollUpPlan(tasks);
 assert.equal(roll.get('1')!.actualStart,'2026-09-02');assert.equal(roll.get('1')!.actualEnd,undefined);assert.equal(roll.get('1')!.milestone,false);
 assert.equal(roll.get('2')!.actualEnd,'2026-09-05');assert.equal(roll.get('3')!.actualStart,'2026-09-02');assert.equal(roll.get('4')!.milestone,true);
 const all=rollUpPlan(tasks.map(t=>t.id==='1'?t:{...t,actualStart:t.actualStart??'2026-09-10',actualEnd:t.id==='3'?'2026-09-12':t.actualEnd??'2026-09-10'}));
 assert.equal(all.get('1')!.actualEnd,'2026-09-12');
 assert.equal(rollUpPlan([task('1')]).get('1')!.actualStart,undefined);
});

function setup(){const data=createMockData();data.plans.push({id:'p',...stamp,workId:'obra-1',month:'2026-09',name:'Teste',createdBy:'user-1'});data.planTasks.push(task('1'),task('2'));return data;}
const revision=(data:PlanningData,tasks:PlanTask[],schedule=true):Command=>({type:'save_plan_revision',planId:'p',expectedSnapshot:planSnapshot(data.plans.find(p=>p.id==='p')!,data.planTasks,data.planDependencies),reason:'Medição',tasks:schedule?scheduleTasks(tasks,[],calendar):tasks,links:[],calendar});

test('revisão valida e grava início e término reais, com histórico por campo',async()=>{
 const data=setup();const repository=new MockPlanningRepository(data);
 const draft=()=>structuredClone(data.planTasks.filter(t=>t.planId==='p'));
 const attempt=(edit:(rows:PlanTask[])=>void,pattern:RegExp)=>{const rows=draft();edit(rows);return assert.rejects(repository.transaction(d=>applyCommand(d,revision(data,rows,false),context)),pattern);};
 await attempt(rows=>{rows[0].actualEnd='2026-09-08';rows[0].progress=100;},/término real exige início real/);
 await attempt(rows=>{Object.assign(rows[0],{actualStart:'2026-09-07',actualEnd:'2026-09-08',progress:50});},/100% concluída/);
 await attempt(rows=>{rows[0].progress=30;},/precisa de início real/);
 await attempt(rows=>{rows[0].actualStart='2026-09-31';rows[0].progress=10;},/Data inválida/);
 await attempt(rows=>{rows[1].level=1;rows[0].actualStart='2026-09-07';},/resumo não recebe início ou término real/);
 await attempt(rows=>{Object.assign(rows[0],{actualStart:'2026-09-09',actualEnd:'2026-09-08',progress:100});},/início real não pode ser depois do término real/);
 assert.deepEqual(await repository.getSnapshot(),data);
 // Válido: tarefa 1 concluída com datas reais; tarefa 2 vira marco.
 const rows=draft();Object.assign(rows[0],withActualEnd(withActualStart(rows[0],'2026-09-04',calendar),'2026-09-08',calendar));rows[1].duration={value:0,unit:'d'};
 await repository.transaction(d=>applyCommand(d,revision(data,rows),context));
 const saved=await repository.getSnapshot();const one=saved.planTasks.find(t=>t.id==='1')!,two=saved.planTasks.find(t=>t.id==='2')!;
 assert.deepEqual([one.actualStart,one.actualEnd,one.plannedStart,one.plannedEnd,one.progress],['2026-09-04','2026-09-08','2026-09-04','2026-09-08',100]);
 assert.equal(two.plannedStart,two.plannedEnd);
 const history=saved.history.find(h=>h.action==='plan_task_revision'&&h.entityId==='1')!;
 const fields=(history.changes as {fields:Record<string,{before:unknown;after:unknown}>}).fields;
 assert.deepEqual(fields.actualStart,{before:null,after:'2026-09-04'});assert.deepEqual(fields.actualEnd,{before:null,after:'2026-09-08'});
 // Limpar o real numa revisão seguinte remove o campo guardado.
 const next=structuredClone(saved.planTasks.filter(t=>t.planId==='p'));next[0]=withProgress(next[0],0,calendar);
 await repository.transaction(d=>applyCommand(d,revision(saved,next),context));
 assert.equal((await repository.getSnapshot()).planTasks.find(t=>t.id==='1')!.actualStart,undefined);
});

test('reais e origem da cópia sobrevivem ao mapeamento do Supabase',()=>{
 const data=setup();data.plans[0].copiedFromPlanId='anterior';data.planTasks[0]={...data.planTasks[0],actualStart:'2026-09-07',actualEnd:'2026-09-08',progress:100};
 const payload=planningDataToPayload(data);
 const rows={...Object.fromEntries(Object.keys(payload).map(k=>[k,[]])),history_events:[],profiles:[],medium_term_plans:payload.medium_term_plans,plan_tasks:payload.plan_tasks,plan_dependencies:[]} as unknown as Rows;
 const back=rowsToPlanningData(JSON.parse(JSON.stringify(rows)));
 assert.equal(back.plans[0].copiedFromPlanId,'anterior');
 assert.deepEqual([back.planTasks[0].actualStart,back.planTasks[0].actualEnd],['2026-09-07','2026-09-08']);
});

/** Plano de setembro: resumo que termina inteiro em setembro, resumo com parte concluída, tarefa
 * antiga com % sem início real, tarefa concluída dentro da janela nova e uma além dela. */
function september(){
 const data=createMockData();
 data.plans.push({id:'set',...stamp,workId:'obra-1',month:'2026-09',name:'Setembro',createdBy:'user-1',calendar:{...calendar,holidays:['2026-10-12']},version:3});
 const rows:PlanTask[]=[
  task('1','2026-09-01','1d',{name:'Fundação',level:0}),
  task('2','2026-09-01','2d',{name:'Blocos',level:1,progress:100,actualStart:'2026-09-01',actualEnd:'2026-09-02'}),
  task('3','2026-09-21','1d',{name:'Alvenaria',level:0}),
  task('4','2026-09-21','5d',{name:'Marcação',level:1,progress:100,actualStart:'2026-09-21',actualEnd:'2026-09-25'}),
  task('5','2026-09-28','5d',{name:'Elevação',level:1,notes:'Frente norte',teamId:'equipe-1'}),
  task('6','2026-10-05','3d',{name:'Encunhamento',level:1}),
  task('7','2026-09-24','10d',{name:'Instalações',level:0,progress:30}),
  task('8','2026-09-28','5d',{name:'Impermeabilização',level:0,progress:100,actualStart:'2026-09-28',actualEnd:'2026-10-02'}),
  task('9','2027-01-11','1d',{name:'Fachada',level:0,anchorStart:'2027-01-11'}),
 ].map(t=>({...t,planId:'set',id:`s${t.id}`,version:2,sourceTaskId:'antigo'}));
 const links=[link('s4','s5'),link('s5','s6')];
 data.planTasks.push(...scheduleTasks(rows,links,data.plans[0].calendar));data.planDependencies.push(...links);
 return data;
}

test('plano novo nasce como cópia do anterior, sem o que já terminou e com vínculos remapeados',async()=>{
 const data=september();const repository=new MockPlanningRepository(data);
 const planId=await repository.transaction(d=>run(d,{type:'create_plan',workId:'obra-1',month:'2026-10',copyFrom:'set'}));
 const saved=await repository.getSnapshot();
 const plan=saved.plans.find(p=>p.id===planId)!;
 assert.equal(plan.copiedFromPlanId,'set');assert.equal(plan.name,'Plano de 2026-10');assert.deepEqual(plan.calendar,{...calendar,holidays:['2026-10-12']});assert.equal(plan.version,undefined);
 const rows=saved.planTasks.filter(t=>t.planId===planId).sort((a,b)=>a.order-b.order);
 // Fundação some (todos os filhos concluídos em setembro); Marcação some; o resto fica, na ordem.
 assert.deepEqual(rows.map(t=>[t.name,t.level,t.order]),[['Alvenaria',0,1],['Elevação',1,2],['Encunhamento',1,3],['Instalações',0,4],['Impermeabilização',0,5],['Fachada',0,6]]);
 assert.ok(rows.every(t=>!t.id.startsWith('s')&&t.sourceTaskId===undefined&&t.version===undefined));
 const named=(name:string)=>rows.find(t=>t.name===name)!;
 // Elevação perdeu a predecessora: ganha a restrição no início atual e não salta.
 assert.equal(named('Elevação').anchorStart,'2026-09-28');assert.deepEqual([named('Elevação').plannedStart,named('Elevação').plannedEnd],['2026-09-28','2026-10-02']);
 assert.equal(named('Elevação').notes,'Frente norte');assert.equal(named('Elevação').teamId,'equipe-1');assert.deepEqual(named('Elevação').duration,{value:5,unit:'d'});
 assert.equal(named('Encunhamento').anchorStart,undefined);
 const copiedLinks=saved.planDependencies.filter(l=>rows.some(t=>t.id===l.successorId));
 assert.deepEqual(copiedLinks.map(l=>[l.predecessorId,l.successorId,l.type]),[[named('Elevação').id,named('Encunhamento').id,'TI']]);
 assert.ok(copiedLinks.every(l=>!l.id.startsWith('l-')));
 // Dado antigo com % e sem início real ganha o real pela regra do Project; concluída na janela fica.
 assert.equal(named('Instalações').actualStart,'2026-09-24');assert.equal(named('Instalações').progress,30);
 assert.deepEqual([named('Impermeabilização').actualStart,named('Impermeabilização').actualEnd,named('Impermeabilização').progress],['2026-09-28','2026-10-02',100]);
 // Tarefa além da janela de três meses é mantida.
 assert.equal(named('Fachada').plannedStart,'2027-01-11');
 // O plano de origem fica intacto.
 assert.equal(saved.planTasks.filter(t=>t.planId==='set').length,9);assert.equal(saved.planDependencies.filter(l=>l.id.startsWith('l-')).length,2);
 assert.ok(saved.history.some(h=>h.action==='create_plan'&&h.entityId===planId&&(h.changes as {copyFrom?:string}).copyFrom==='set'));
 // A cópia é salvável sem ajustes: o motor devolve as mesmas datas.
 await repository.transaction(d=>applyCommand(d,{type:'save_plan_revision',planId,expectedSnapshot:planSnapshot(plan,saved.planTasks,saved.planDependencies),reason:'Abertura do mês',tasks:rows,links:copiedLinks,calendar:plan.calendar!},context));
});

test('cópia só de plano vivo, da mesma obra e de mês anterior',()=>{
 const data=september();
 const baseline=run(data,{type:'freeze_plan_baseline',planId:'set',name:'Base setembro'});
 const before=structuredClone(data);
 assert.throws(()=>run(data,{type:'create_plan',workId:'obra-1',month:'2026-10',copyFrom:baseline}),/linha de base/);
 assert.throws(()=>run(data,{type:'create_plan',workId:'obra-1',month:'2026-08',copyFrom:'set'}),/mês anterior/);
 assert.throws(()=>run(data,{type:'create_plan',workId:'obra-2',month:'2026-10',copyFrom:'set'}),/mesma obra/);
 assert.throws(()=>run(data,{type:'create_plan',workId:'obra-1',month:'2026-10',copyFrom:'404'}),/Plano não encontrado/);
 assert.deepEqual(data,before);
 // A linha de base carrega as datas reais junto.
 assert.equal(data.planTasks.find(t=>t.planId===baseline&&t.name==='Marcação')!.actualEnd,'2026-09-25');
 // Sem copyFrom, o plano nasce vazio como antes.
 const empty=run(data,{type:'create_plan',workId:'obra-1',month:'2026-10'});
 assert.equal(data.planTasks.filter(t=>t.planId===empty).length,0);assert.equal(data.plans.find(p=>p.id===empty)!.copiedFromPlanId,undefined);
});

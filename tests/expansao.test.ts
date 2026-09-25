import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, type Command, type CommandContext } from '../src/application/use-cases/commands';
import { MockPlanningRepository } from '../src/infrastructure/repositories/mock/planning-repository';
import { createMockData } from '../src/mocks/planning';
import { rollUpPlan, ppc, teamLoad, ppcSeries, causePareto, plannedAt, executedAt, progressCurve, parseLinks, formatLink, linkBoundary, linkConflicts, targetPercent } from '../src/domain/rules';
import type { PlanningData, Team, WeeklyCommitment } from '../src/domain/entities';
import { addDays } from '../src/domain/validation';
let id=0;
const context=(actorId='user-1'):CommandContext=>({actorId,today:'2026-09-08',now:'2026-09-08T12:00:00Z',newId:()=>`test-${++id}`});
const run=(d:PlanningData,c:Command,actorId='user-1')=>applyCommand(d,c,context(actorId));
const stamp={createdAt:'2026-08-20T12:00:00Z',updatedAt:'2026-08-20T12:00:00Z'};
const otherWorkTeam=(d:PlanningData)=>{const t:Team={id:'equipe-obra2',...stamp,workId:'obra-2',company:'Terceira',name:'Terceirizada',weeklyCapacity:4};d.teams.push(t);return t;};
const commitment=(id:string,fulfilled?:boolean):WeeklyCommitment=>({id,...stamp,workId:'obra-1',name:'Alvenaria do 3º pavimento',supplier:'Construtora Alfa',activityId:'a1',weekStart:'2026-09-07',weekEnd:'2026-09-13',responsibleId:'user-1',teamId:'equipe-2',startDate:'2026-09-08',endDate:'2026-09-10',fulfilled});

test('consulta e obra sem acesso são bloqueados nos comandos da expansão',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',company:'SM MARTINS',name:'Pintura',weeklyCapacity:2},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'record_progress',activityId:'b3',progress:60},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'move_restriction',restrictionId:'r1',boardStatus:'em_tratativa'},'user-3'),/apenas consulta/);
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-2',company:'SM MARTINS',name:'Pintura',weeklyCapacity:2},'user-2'),/acesso/);
  assert.throws(()=>run(d,{type:'create_baseline',workId:'obra-2',name:'LB inicial'},'user-2'),/acesso/);
});
test('equipe exige capacidade inteira positiva e nome único na obra',()=>{
  const d=createMockData();
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',company:'SM MARTINS',name:'Pintura',weeklyCapacity:0}),/inteiro positivo/);
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',company:'SM MARTINS',name:'Pintura',weeklyCapacity:2.5}),/inteiro positivo/);
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',company:'SM MARTINS',name:'  ',weeklyCapacity:2}),/Nome da equipe/);
  assert.throws(()=>run(d,{type:'create_team',workId:'obra-1',company:'sm martins',name:'revestimentos',weeklyCapacity:2}),/já cadastrada/);
  const teamId=run(d,{type:'create_team',workId:'obra-1',company:'SM MARTINS',name:'Pintura',weeklyCapacity:4});
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
  const commitmentId=run(d,{type:'create_commitment',workId:'obra-1',name:'Diário de obra',activityId:'a4',weekStart:'2026-09-10',responsibleId:'user-1',teamId:'equipe-2',startDate:'2026-09-08',endDate:'2026-09-10'});
  const saved=d.commitments.find(c=>c.id===commitmentId)!;
  assert.equal(saved.weekStart,'2026-09-07');assert.equal(saved.weekEnd,'2026-09-13');assert.equal(saved.fulfilled,undefined);
});
test('a linha da semana recusa período fora da semana, e a equipe é opcional',()=>{
  const d=createMockData();
  otherWorkTeam(d);
  const command=(extra:object)=>({type:'create_commitment' as const,workId:'obra-1',name:'Diário de obra',activityId:'a4',weekStart:'2026-09-10',responsibleId:'user-1',teamId:'equipe-2',startDate:'2026-09-08',endDate:'2026-09-10',...extra});
  assert.throws(()=>run(d,command({teamId:'inexistente'})),/Equipe deve pertencer/);
  assert.throws(()=>run(d,command({teamId:'equipe-obra2'})),/Equipe deve pertencer/);
  assert.throws(()=>run(d,command({startDate:'2026-09-06'})),/dentro da semana/);
  assert.throws(()=>run(d,command({endDate:'2026-09-14'})),/dentro da semana/);
  assert.throws(()=>run(d,command({responsibleId:'inexistente'})),/Responsável/);
  assert.equal(d.commitments.length,0);
  // A planilha da semana não depende de cadastro: sem equipe e sem fornecedor, a linha existe.
  const id=run(d,command({teamId:null}));
  const saved=d.commitments.find(c=>c.id===id)!;
  assert.equal(saved.teamId,undefined);assert.equal(saved.supplier,'');
});
test('sem período, a linha nasce no primeiro dia da semana',()=>{
  const d=createMockData();
  const id=run(d,{type:'create_commitment',workId:'obra-1',name:'GFIP',weekStart:'2026-09-10',responsibleId:'user-1'});
  const saved=d.commitments.find(c=>c.id===id)!;
  assert.equal(saved.startDate,'2026-09-07');assert.equal(saved.endDate,'2026-09-07');
});
test('a semana é montada do zero: a linha repete e dispensa atividade',()=>{
  const d=createMockData();
  const linha=(extra:object)=>({type:'create_commitment' as const,workId:'obra-1',name:'Diário de obra',weekStart:'2026-09-07',responsibleId:'user-1',teamId:'equipe-2',startDate:'2026-09-08',endDate:'2026-09-10',...extra});
  // A planilha real repete linhas na mesma semana e traz tarefas fora do cronograma.
  run(d,linha({activityId:'a4'}));
  run(d,linha({activityId:'a4'}));
  const semVinculo=run(d,linha({name:'GFIP'}));
  assert.equal(d.commitments.length,3);
  assert.equal(d.commitments.find(c=>c.id===semVinculo)?.activityId,undefined);
  assert.equal(d.commitments.find(c=>c.id===semVinculo)?.name,'GFIP');
  assert.throws(()=>run(d,linha({name:'  '})),/Atividade/);
  assert.throws(()=>run(d,linha({activityId:'inexistente'})),/mesma obra/);
});
test('cumprimento exige causa da lista e o apontamento pode ser corrigido',()=>{
  const d=createMockData();
  const commitmentId=run(d,{type:'create_commitment',workId:'obra-1',name:'Diário de obra',activityId:'a4',weekStart:'2026-09-10',responsibleId:'user-1',teamId:'equipe-2',startDate:'2026-09-08',endDate:'2026-09-10'});
  assert.throws(()=>run(d,{type:'record_fulfillment',commitmentId,fulfilled:false}),/Causa/);
  assert.throws(()=>run(d,{type:'record_fulfillment',commitmentId,fulfilled:false,cause:'Chuva'}),/fora da lista/);
  run(d,{type:'record_fulfillment',commitmentId,fulfilled:false,cause:'Falta de Material',justification:'Fornecedor atrasou a entrega'});
  const saved=d.commitments.find(c=>c.id===commitmentId)!;
  assert.equal(saved.fulfilled,false);assert.equal(saved.cause,'Falta de Material');assert.equal(saved.justification,'Fornecedor atrasou a entrega');assert.equal(saved.recordedBy,'user-1');
  // A planilha é editável: trocar o Status é corrigir a célula, não excluir a linha.
  run(d,{type:'record_fulfillment',commitmentId,fulfilled:true});
  const corrigido=d.commitments.find(c=>c.id===commitmentId)!;
  assert.equal(corrigido.fulfilled,true);assert.equal(corrigido.cause,undefined);
});
test('tudo na linha da semana é editável, inclusive a semana',()=>{
  const d=createMockData();
  const commitmentId=run(d,{type:'create_commitment',workId:'obra-1',name:'Diário de obra',weekStart:'2026-09-07',responsibleId:'user-1',teamId:'equipe-2',startDate:'2026-09-08',endDate:'2026-09-09'});
  const edit=(extra:object)=>({type:'update_commitment' as const,commitmentId,name:'Diário de obra e medição',supplier:'Empreiteira Beta',teamId:'equipe-1',weekStart:'2026-09-07',startDate:'2026-09-07',endDate:'2026-09-11',...extra});
  run(d,edit({}));
  const saved=d.commitments.find(c=>c.id===commitmentId)!;
  assert.equal(saved.name,'Diário de obra e medição');assert.equal(saved.supplier,'Empreiteira Beta');assert.equal(saved.teamId,'equipe-1');
  assert.equal(saved.startDate,'2026-09-07');assert.equal(saved.endDate,'2026-09-11');
  // Mover a linha de semana leva o período com ela, e a semana nova é que passa a contê-lo.
  run(d,edit({weekStart:'2026-09-16',startDate:'2026-09-15',endDate:'2026-09-18'}));
  const movido=d.commitments.find(c=>c.id===commitmentId)!;
  assert.equal(movido.weekStart,'2026-09-14');assert.equal(movido.weekEnd,'2026-09-20');assert.equal(movido.startDate,'2026-09-15');
  // A equipe sai da linha sem levar a linha embora.
  run(d,edit({teamId:null}));
  assert.equal(d.commitments.find(c=>c.id===commitmentId)?.teamId,undefined);
  assert.throws(()=>run(d,edit({startDate:'2026-09-06'})),/dentro da semana/);
  assert.throws(()=>run(d,edit({name:'  '})),/Atividade/);
});
test('ppc conta compromissos cumpridos sobre planejados, não a média de progresso',()=>{
  const result=ppc([commitment('x1',true),commitment('x2',false),commitment('x3')]);
  assert.equal(result.planned,3);assert.equal(result.fulfilled,1);assert.equal(result.pending,1);
  assert.equal(Math.round(result.percent*100)/100,33.33);
  assert.deepEqual(ppc([]),{planned:0,fulfilled:0,pending:0,percent:0});
});
test('carga da equipe acusa sobrecarga acima da capacidade semanal',()=>{
  const d=createMockData();
  assert.deepEqual(teamLoad('equipe-1','2026-09-01','2026-09-10',d),{assigned:0,activities:0,tasks:0,capacity:2,overloaded:false});
  run(d,{type:'assign_team',activityId:'a3',teamId:'equipe-1'});
  run(d,{type:'assign_team',activityId:'b3',teamId:'equipe-1'});
  assert.deepEqual(teamLoad('equipe-1','2026-09-01','2026-09-10',d),{assigned:2,activities:2,tasks:0,capacity:2,overloaded:false});
  run(d,{type:'assign_team',activityId:'a4',teamId:'equipe-1'});
  assert.deepEqual(teamLoad('equipe-1','2026-09-01','2026-09-10',d),{assigned:3,activities:3,tasks:0,capacity:2,overloaded:true});
  assert.deepEqual(teamLoad('equipe-1','2026-08-22','2026-08-26',d),{assigned:0,activities:0,tasks:0,capacity:2,overloaded:false});
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
  await assert.rejects(repo.transaction(d=>run(d,{type:'create_commitment',workId:'obra-1',name:'Diário de obra',activityId:'a1',weekStart:'2026-09-10',responsibleId:'user-1',teamId:'equipe-2',startDate:'2026-09-06',endDate:'2026-09-10'})),/dentro da semana/);
  assert.deepEqual(await repo.getSnapshot(),before);
});

test('o plano do mês tem item e subitem, e o item é o envelope dos subitens',()=>{
  const d=createMockData();
  const planId=run(d,{type:'create_plan',workId:'obra-1',month:'2026-09'});
  const linha=(name:string,plannedStart:string,plannedEnd:string)=>run(d,{type:'create_plan_task',planId,name,plannedStart,plannedEnd});
  const estrutura=linha('Estrutura','2026-09-01','2026-09-30');
  const pilar=linha('Pilares do 3º','2026-09-01','2026-09-10');
  const laje=linha('Laje do 3º','2026-09-14','2026-09-25');
  run(d,{type:'indent_plan_task',taskId:pilar});
  run(d,{type:'indent_plan_task',taskId:laje});
  run(d,{type:'update_plan_task',taskId:pilar,name:'Pilares do 3º',plannedStart:'2026-09-01',plannedEnd:'2026-09-10',progress:100});

  const roll=rollUpPlan(d.planTasks.filter(t=>t.planId===planId));
  const item=roll.get(estrutura)!;
  assert.equal(item.summary,true);assert.equal(item.leaves,2);assert.equal(item.number,'1');
  // As datas do item são as dos subitens, não as que foram digitadas nele.
  assert.equal(item.plannedStart,'2026-09-01');assert.equal(item.plannedEnd,'2026-09-25');
  // Avanço ponderado pela duração: 10 dias a 100% e 12 dias a 0%.
  assert.equal(Math.round(item.progress),45);
  assert.equal(roll.get(pilar)!.number,'1.1');assert.equal(roll.get(laje)!.number,'1.2');
  assert.equal(roll.get(laje)!.summary,false);
});

test('o recuo leva os subitens e não passa de um degrau por vez',()=>{
  const d=createMockData();
  const planId=run(d,{type:'create_plan',workId:'obra-1',month:'2026-10'});
  const linha=(name:string)=>run(d,{type:'create_plan_task',planId,name,plannedStart:'2026-10-01',plannedEnd:'2026-10-02'});
  const a=linha('Fachada'),b=linha('Andaime'),c=linha('Reboco'),e=linha('Pintura');
  const level=(id:string)=>d.planTasks.find(t=>t.id===id)!.level;
  assert.throws(()=>run(d,{type:'indent_plan_task',taskId:a}),/primeira linha/);
  for (const taskId of [b,c,e]) run(d,{type:'indent_plan_task',taskId});
  run(d,{type:'indent_plan_task',taskId:e});
  assert.equal(level(b),1);assert.equal(level(c),1);assert.equal(level(e),2);
  // Um degrau por vez: quem já é subitem direto da linha de cima não tem de quem mais ser filho.
  assert.throws(()=>run(d,{type:'indent_plan_task',taskId:b}),/já é subitem/);
  // Recuar um item leva o que está debaixo dele: a subárvore acompanha o pai.
  run(d,{type:'indent_plan_task',taskId:c});
  assert.equal(level(c),2);assert.equal(level(e),3);
  run(d,{type:'outdent_plan_task',taskId:c});
  assert.equal(level(c),1);assert.equal(level(e),2);
  assert.throws(()=>run(d,{type:'outdent_plan_task',taskId:a}),/nível mais alto/);
  // Apagar um item apaga os subitens: deixá-los órfãos reescreveria a estrutura por conta.
  run(d,{type:'delete_plan_task',taskId:c});
  assert.deepEqual(d.planTasks.filter(t=>t.planId===planId).map(t=>t.name),['Fachada','Andaime']);
});

test('o PPC vira série: a semana isolada diz pouco',()=>{
  const week=(weekStart:string,fulfilled:(boolean|undefined)[]):WeeklyCommitment[]=>fulfilled.map((f,i)=>({
    ...commitment(`${weekStart}-${i}`,f),weekStart,weekEnd:'2026-09-13'}));
  const series=ppcSeries([...week('2026-09-07',[true,true,false,false]),...week('2026-08-31',[true,false]),...week('2026-09-14',[true,undefined])]);
  assert.deepEqual(series.map(s=>s.weekStart),['2026-08-31','2026-09-07','2026-09-14']);
  assert.deepEqual(series.map(s=>Math.round(s.percent)),[50,50,50]);
  // A semana em aberto aparece com o que já foi apurado, e diz quantas linhas faltam.
  assert.equal(series[2].pending,1);assert.equal(series[2].planned,2);
});

test('as causas viram Pareto: a lista fechada só serve ordenada',()=>{
  const fail=(id:string,cause:string):WeeklyCommitment=>({...commitment(id,false),cause:cause as WeeklyCommitment['cause']});
  const rows=[fail('a','Falta de Material'),fail('b','Falta de Material'),fail('c','Chuva/Condições climáticas'),
    fail('d','Falta de Material'),fail('e','Retrabalho'),commitment('f',true),commitment('g',undefined)];
  const pareto=causePareto(rows);
  assert.deepEqual(pareto.map(p=>[p.cause,p.total]),[['Falta de Material',3],['Chuva/Condições climáticas',1],['Retrabalho',1]]);
  // O acumulado é sobre as falhas, não sobre tudo que foi prometido: a cumprida não entra.
  assert.equal(Math.round(pareto[0].share),60);
  assert.equal(Math.round(pareto.at(-1)!.accumulated),100);
  assert.deepEqual(causePareto([commitment('x',true)]),[]);
});

test('a carga da equipe enxerga o plano do mês, não só o cronograma',()=>{
  const d=createMockData();
  const planId=run(d,{type:'create_plan',workId:'obra-1',month:'2026-09'});
  const before=teamLoad('equipe-1','2026-09-01','2026-09-30',d);
  run(d,{type:'create_plan_task',planId,name:'Alvenaria do 5º',plannedStart:'2026-09-07',plannedEnd:'2026-09-18',teamId:'equipe-1'});
  const after=teamLoad('equipe-1','2026-09-01','2026-09-30',d);
  assert.equal(after.assigned,before.assigned+1);
  assert.equal(after.tasks,1);
  // A linha de base é retrato, não compromisso: congelar o plano não dobra a carga da equipe.
  run(d,{type:'freeze_plan_baseline',planId,name:'Base de setembro'});
  assert.equal(teamLoad('equipe-1','2026-09-01','2026-09-30',d).tasks,1);
});

test('a curva S compara executado com a linha de base, não com o replanejamento',()=>{
  const d=createMockData();
  const baselineId=run(d,{type:'create_baseline',workId:'obra-1',name:'LB inicial'});
  const baseline=d.baselines.find(b=>b.id===baselineId)!;
  const wagonIds=new Set(d.wagons.filter(w=>d.sequences.some(s=>s.id===w.sequenceId&&s.workId==='obra-1')).map(w=>w.id));
  const activities=d.activities.filter(a=>wagonIds.has(a.wagonId));
  const first=baseline.activities.reduce((min,a)=>a.plannedStart<min?a.plannedStart:min,baseline.activities[0].plannedStart);
  const last=baseline.activities.reduce((max,a)=>a.plannedEnd>max?a.plannedEnd:max,baseline.activities[0].plannedEnd);
  // Antes de começar nada está previsto; no fim do prazo, tudo.
  assert.equal(Math.round(plannedAt(baseline.activities,addDays(first,-1))),0);
  assert.equal(Math.round(plannedAt(baseline.activities,last)),100);
  const curve=progressCurve({activities,entries:d.progressEntries,baseline,from:first,to:last});
  assert.ok(curve.length>1,'a curva precisa de mais de um ponto');
  assert.equal(curve[0].date,first);assert.equal(curve.at(-1)!.date,last);
  // A curva do planejado nunca desce: peso não volta para trás.
  for (let i=1;i<curve.length;i++) assert.ok(curve[i].planned>=curve[i-1].planned-1e-9,`planejado caiu em ${curve[i].date}`);
  // O executado do dia do lançamento reflete a medição, e o dia anterior não sabe dela.
  const before=executedAt(activities,d.progressEntries,'2026-09-07');
  run(d,{type:'record_progress',activityId:'b3',progress:100});
  assert.ok(executedAt(activities,d.progressEntries,'2026-09-08')>before);
  assert.equal(executedAt(activities,d.progressEntries,'2026-09-07'),before);
});

test('predecessora é lida como no Project: número, tipo e defasagem',()=>{
  const { links, invalid } = parseLinks('12, 15II+2d, 7TT-1d, 9IT+3dd');
  assert.deepEqual(links.map(l=>[l.number,l.type,l.lagDays,l.lagBusiness]),[
    [12,'TI',0,true],[15,'II',2,true],[7,'TT',-1,true],[9,'IT',3,false]]);
  assert.deepEqual(invalid,[]);
  // Sem tipo escrito, é TI — o padrão do Project e o vínculo que a obra mais usa.
  assert.equal(parseLinks('3').links[0].type,'TI');
  // Sem unidade escrita, a defasagem é em dias úteis.
  assert.equal(parseLinks('3TI+2d').links[0].lagBusiness,true);
  assert.equal(parseLinks('3TI+2dd').links[0].lagBusiness,false);
  // O que não é vínculo não vira vínculo silenciosamente: volta como inválido, para a tela dizer.
  assert.deepEqual(parseLinks('12, alvenaria, 4XX').invalid,['alvenaria','4XX']);
  assert.equal(parseLinks('12, alvenaria').links.length,1);
  // Ida e volta: o texto que a célula mostra é lido de volta igual.
  assert.equal(formatLink(12,{type:'TI',lagDays:0,lagBusiness:true}),'12');
  assert.equal(formatLink(15,{type:'II',lagDays:2,lagBusiness:true}),'15II+2 dias');
  assert.equal(formatLink(7,{type:'TT',lagDays:-1,lagBusiness:false}),'7TT-1 dia corrido');
});

test('cada tipo de vínculo prende a ponta que o nome diz',()=>{
  // Predecessora de segunda (07/09/2026) a sexta (11/09/2026).
  const pred={plannedStart:'2026-09-07',plannedEnd:'2026-09-11'};
  const at=(type:'TI'|'II'|'TT'|'IT',lagDays=0,lagBusiness=true)=>linkBoundary({type,lagDays,lagBusiness},pred);
  // TI: a sucessora não começa no dia em que a outra acaba — começa no próximo dia útil.
  assert.deepEqual(at('TI'),{edge:'start',earliest:'2026-09-14'});
  assert.deepEqual(at('II'),{edge:'start',earliest:'2026-09-07'});
  assert.deepEqual(at('TT'),{edge:'end',earliest:'2026-09-11'});
  assert.deepEqual(at('IT'),{edge:'end',earliest:'2026-09-07'});
  // Defasagem útil pula o fim de semana; a corrida cai dentro dele.
  assert.equal(at('II',2,true).earliest,'2026-09-09');
  assert.equal(at('TT',2,true).earliest,'2026-09-15');
  assert.equal(at('TT',2,false).earliest,'2026-09-13');
  assert.equal(at('II',-2,true).earliest,'2026-09-03');
});

test('a incoerência é apontada por tipo de vínculo, e não reprogramada sozinha',()=>{
  const d=createMockData();
  const planId=run(d,{type:'create_plan',workId:'obra-1',month:'2026-09'});
  const linha=(name:string,plannedStart:string,plannedEnd:string)=>run(d,{type:'create_plan_task',planId,name,plannedStart,plannedEnd});
  const quarto=linha('Alvenaria do 4º','2026-09-07','2026-09-11');
  const quinto=linha('Alvenaria do 5º','2026-09-09','2026-09-16');
  const tasks=()=>d.planTasks.filter(t=>t.planId===planId);
  // Como II+2d o vínculo é coerente: o 5º começa dois dias úteis depois do 4º.
  run(d,{type:'link_plan_tasks',predecessorId:quarto,successorId:quinto,linkType:'II',lagDays:2});
  assert.deepEqual(linkConflicts(tasks(),d.planDependencies),[]);
  // O mesmo par como TI seria incoerente: o 5º começaria antes de o 4º terminar.
  const dependency=d.planDependencies.find(dep=>dep.successorId===quinto)!;
  dependency.type='TI';dependency.lagDays=0;
  const conflicts=linkConflicts(tasks(),d.planDependencies);
  assert.equal(conflicts.length,1);
  assert.equal(conflicts[0].edge,'start');
  assert.equal(conflicts[0].earliest,'2026-09-14');
  // As datas continuam onde estavam: apontar não é reprogramar.
  assert.equal(d.planTasks.find(t=>t.id===quinto)!.plannedStart,'2026-09-09');
  // Tipo fora dos quatro e defasagem absurda são recusados — num par novo, porque o par repetido
  // esbarra antes na checagem de duplicado.
  const sexto=linha('Alvenaria do 6º','2026-09-21','2026-09-25');
  assert.throws(()=>run(d,{type:'link_plan_tasks',predecessorId:quinto,successorId:sexto,linkType:'XX' as 'TI'}),/TI, II, TT ou IT/);
  assert.throws(()=>run(d,{type:'link_plan_tasks',predecessorId:quinto,successorId:sexto,lagDays:9999}),/defasagem/);
  assert.throws(()=>run(d,{type:'link_plan_tasks',predecessorId:quarto,successorId:quinto}),/já existe/);
});

test('percentual-alvo é leitura de tempo decorrido, não medição',()=>{
  const task={plannedStart:'2026-09-07',plannedEnd:'2026-09-18'};
  assert.equal(targetPercent(task,'2026-09-06'),0);
  assert.equal(targetPercent(task,'2026-09-18'),100);
  assert.equal(targetPercent(task,'2026-09-25'),100);
  // Dez dias úteis no total; na sexta da primeira semana, cinco deles passaram.
  assert.equal(Math.round(targetPercent(task,'2026-09-11')),50);
});

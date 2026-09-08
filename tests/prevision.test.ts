import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeActivities, normalizeProjects } from '../src/infrastructure/integrations/prevision/normalize';
const row={id:123,service_name:'Estrutura',floor_name:'Térreo',start_at:'2026-07-29T00:00:00Z',end_at:'2026-07-31T23:59:59Z',percentage_completed:50,jobs:[{name:'subatividade'}],parts:[]};
test('normalização usa entidade atividade sem duplicar jobs ou presumir datas',()=>{
  const result=normalizeActivities({activities:[row]});assert.equal(result.rows.length,1);assert.equal(result.rows[0].plannedStart,'2026-07-29');assert.equal(result.rows[0].plannedEnd,'2026-07-31');assert.equal(result.rows[0].progress,50);assert.equal(result.rows[0].location,'Térreo');
});
test('registros malformados são reportados, nunca convertidos silenciosamente',()=>{
  const result=normalizeActivities({activities:[row,{...row,id:2,start_at:null},{...row,id:3,percentage_completed:500},{...row,id:4,start_at:'2026-02-30'},{...row,id:5,floor_name:''}]});assert.equal(result.rows.length,1);assert.equal(result.skipped,4);
});
test('resposta inesperada de projetos/atividades falha explicitamente',()=>{
  assert.deepEqual(normalizeProjects({projects:[{id:'123',name:'Obra'}]}),[{id:'123',name:'Obra'}]);
  assert.throws(()=>normalizeProjects({projects:[{id:'../escape',name:'Obra'}]}));assert.throws(()=>normalizeActivities({data:[]}));
});

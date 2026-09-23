import type { PlanningData } from '../../domain/entities';
/** A autorização também limita o payload, antes de ele chegar ao navegador. */
export function scopePlanning(data: PlanningData, actorId: string): PlanningData {
  const actor=data.users.find(u=>u.id===actorId);
  if(!actor)throw new Error('Perfil não encontrado.');
  const workIds=new Set(actor.workIds);
  const works=data.works.filter(w=>workIds.has(w.id));
  const locations=data.locations.filter(l=>workIds.has(l.workId));
  const sequences=data.sequences.filter(s=>workIds.has(s.workId));const sequenceIds=new Set(sequences.map(s=>s.id));
  const wagons=data.wagons.filter(w=>sequenceIds.has(w.sequenceId));const wagonIds=new Set(wagons.map(w=>w.id));
  const activities=data.activities.filter(a=>wagonIds.has(a.wagonId));const activityIds=new Set(activities.map(a=>a.id));
  const criteria=data.criteria.filter(c=>activityIds.has(c.activityId));
  const pendingItems=data.pendingItems.filter(p=>wagonIds.has(p.wagonId));const pendingIds=new Set(pendingItems.map(p=>p.id));
  const restrictions=data.restrictions.filter(r=>wagonIds.has(r.wagonId));
  const releases=data.releases.filter(r=>wagonIds.has(r.wagonId));
  const debts=data.debts.filter(d=>pendingIds.has(d.pendingItemId));
  const teams=data.teams.filter(t=>workIds.has(t.workId));
  const progressEntries=data.progressEntries.filter(p=>activityIds.has(p.activityId));
  const commitments=data.commitments.filter(c=>workIds.has(c.workId));
  const baselines=data.baselines.filter(b=>workIds.has(b.workId));
  const dependencies=data.dependencies.filter(d=>activityIds.has(d.predecessorId)&&activityIds.has(d.successorId));
  const plans=data.plans.filter(p=>workIds.has(p.workId));const planIds=new Set(plans.map(p=>p.id));
  const planTasks=data.planTasks.filter(t=>planIds.has(t.planId));const taskIds=new Set(planTasks.map(t=>t.id));
  const planDependencies=data.planDependencies.filter(d=>taskIds.has(d.predecessorId)&&taskIds.has(d.successorId));
  const ifcModels=data.ifcModels.filter(m=>workIds.has(m.workId));const modelIds=new Set(ifcModels.map(m=>m.id));
  const ifcVersions=data.ifcVersions.filter(v=>modelIds.has(v.modelId));
  const linkRules=data.linkRules.filter(r=>workIds.has(r.workId));
  const users=(actor.role==='admin'||actor.role==='manager'?data.users:data.users.filter(u=>u.id===actorId||u.workIds.some(id=>workIds.has(id)))).map(u=>({...u,workIds:u.workIds.filter(id=>workIds.has(id))}));
  const collections={works,locations,sequences,wagons,activities,criteria,pendingItems,restrictions,releases,debts,teams,progressEntries,commitments,baselines,dependencies,plans,planTasks,planDependencies,ifcModels,ifcVersions,linkRules,users};
  const visibleIds=new Set(Object.values(collections).flatMap(rows=>rows.map(r=>r.id)));
  const history=data.history.filter(h=>visibleIds.has(h.entityId)||typeof h.changes.planId==='string'&&planIds.has(h.changes.planId));
  return {...collections,history};
}

import type { PlanningData } from '@/domain/entities';

/** O que a exclusão leva, contado no planejamento que a tela já tem, para o admin ver o tamanho do que
 * vai sumir antes de confirmar. A terminalidade, os arquivos e o longo prazo ficam fora do planejamento
 * carregado; a tela os cita sem número. */
export function workFootprint(data: PlanningData, workId: string) {
  const sequences = new Set(data.sequences.filter(s => s.workId === workId).map(s => s.id));
  return {
    commitments: data.commitments.filter(c => c.workId === workId).length,
    wagons: data.wagons.filter(w => sequences.has(w.sequenceId)).length,
    plans: data.plans.filter(p => p.workId === workId).length,
    teams: data.teams.filter(t => t.workId === workId).length,
    ifcModels: data.ifcModels.filter(m => m.workId === workId).length,
    people: data.users.filter(u => u.workIds.includes(workId)).length,
  };
}

/** O código digitado confirma a obra, sem diferença de maiúsculas nem de espaços nas pontas: a mesma
 * regra de `delete_work` no banco. */
export const confirmsCode = (typed: string, code: string) =>
  typed.trim() !== '' && typed.trim().toLowerCase() === code.trim().toLowerCase();

import type { Activity, PlanningData, Wagon } from '../../domain/entities';
import { floorLabel, floorSchedule, type LongTermPlanDocument } from '../../domain/long-term-plan';
import { addBusinessDays, addDays, periodDays } from '../../domain/validation';
import { sliceActivity } from './slice-activity';

/** Serviço × pavimento do plano de longo prazo, a unidade que vira atividade de vagão. */
export interface LongTermSlot { key: string; name: string; location: string; plannedStart: string; plannedEnd: string; teamNames: string[] }
export interface PlannedActivity { externalId: string; name: string; location: string; plannedStart: string; plannedEnd: string; weight: number; teamNames: string[] }
export interface PlannedWagon { plannedStart: string; plannedEnd: string; taktDays: number; activities: PlannedActivity[] }
export interface LongTermSyncPlan {
  aborted: boolean;
  reason?: string;
  frozenWagonId?: string;
  startNumber: number;
  /** Primeiro dia que o plano pode ocupar: o dia seguinte ao último vagão liberado, ou hoje. */
  frontier: string;
  wagons: PlannedWagon[];
  /** Vagões da cauda não liberada que não voltam (nenhum vagão novo começa no mesmo dia). */
  removedWagonIds: string[];
  /** Atividades da cauda que o plano não gera mais. */
  removedActivityIds: string[];
  removedRestrictionIds: string[];
  removedPendingIds: string[];
  /** Das removidas, quantas tinham avanço lançado ou critério atendido. */
  removedWithProgress: number;
  /** Serviço × pavimento que termina antes da fronteira e fica fora dos vagões. */
  skippedPast: number;
  keptWagons: number;
  keptActivities: number;
}

/** Prefixo de `previsionExternalId` das atividades geradas pelo plano. O campo guarda a origem
 * externa da atividade; aqui a origem é o próprio plano, e o prefixo nunca colide com um id do
 * Prevision (que é numérico). */
export const LONG_TERM_PREFIX = 'plano:';

/** Todo serviço do plano, visível ou não: ocultar é só leitura do gráfico, não tira a frente da obra. */
export function longTermSlots(document: LongTermPlanDocument): LongTermSlot[] {
  return document.activities.flatMap(activity => floorSchedule(activity).map(slot => ({
    key: `${LONG_TERM_PREFIX}${activity.id}:${slot.floor}`,
    name: activity.name,
    location: floorLabel(document, slot.floor),
    plannedStart: slot.start,
    plannedEnd: slot.finish,
    teamNames: activity.teams.map(t => t.name),
  })));
}

/** Cadeia de vagões da sequência, do primeiro ao último, ou o motivo de não conseguir montá-la. */
function chain(data: PlanningData, sequenceId: string): Wagon[] | string {
  const wagons = data.wagons.filter(w => w.sequenceId === sequenceId);
  const byId = new Map(wagons.map(w => [w.id, w]));
  const ordered: Wagon[] = [];
  const seen = new Set<string>();
  let cursor = wagons.find(w => !w.predecessorId || !byId.has(w.predecessorId));
  while (cursor) {
    if (seen.has(cursor.id)) return 'Ciclo na sequência de vagões.';
    seen.add(cursor.id); ordered.push(cursor);
    const current: Wagon = cursor;
    cursor = wagons.find(w => w.predecessorId === current.id);
  }
  return ordered.length === wagons.length ? ordered : 'Sequência com vagões fora da cadeia principal.';
}

const nextBusinessDay = (date: string) => { const d = new Date(`${date}T00:00:00Z`).getUTCDay(); return d === 6 ? addDays(date, 2) : d === 0 ? addDays(date, 1) : date; };

/**
 * Recalcula os vagões da sequência a partir do plano de longo prazo, que passa a ser o
 * responsável pelas atividades dos vagões. Função pura — quem chama aplica o resultado.
 *
 * - Vagões liberados ficam intocados; o plano ocupa a cauda, a partir do dia seguinte ao último
 *   liberado (ou de hoje / da data de início da sequência, o que for mais tarde).
 * - A cauda vira uma grade contínua de vagões com o takt da sequência. Cada serviço × pavimento é
 *   fatiado nos vagões que atravessa, como na importação do Prevision ("parte 2 de 3 · 35%").
 *   Vagão da grade sem nenhuma atividade não é criado.
 * - Idempotente: vagão que começa no mesmo dia de um existente reaproveita o registro (e as
 *   restrições e pendências dele); atividade com a mesma chave serviço × pavimento × vagão
 *   reaproveita o registro (avanço, critérios, equipe, anotação). Gerar de novo sem mudar o plano
 *   não perde nada.
 */
export function planLongTermSync(data: PlanningData, sequenceId: string, slots: LongTermSlot[], today: string): LongTermSyncPlan {
  const sequence = data.sequences.find(s => s.id === sequenceId);
  const empty = { startNumber: 1, frontier: today, wagons: [], removedWagonIds: [], removedActivityIds: [], removedRestrictionIds: [], removedPendingIds: [], removedWithProgress: 0, skippedPast: 0, keptWagons: 0, keptActivities: 0 };
  if (!sequence) return { aborted: true, reason: 'Sequência não encontrada.', ...empty };
  const ordered = chain(data, sequenceId);
  if (typeof ordered === 'string') return { aborted: true, reason: `${ordered} Geração abortada.`, ...empty };
  const released = new Set(data.releases.map(r => r.wagonId));
  let frozen = -1;
  while (frozen + 1 < ordered.length && released.has(ordered[frozen + 1].id)) frozen++;
  const tail = ordered.slice(frozen + 1);
  if (tail.some(w => released.has(w.id))) return { aborted: true, reason: 'Há vagão liberado depois de um não liberado. Geração abortada para não mexer em vagão liberado.', ...empty };
  const frozenWagon = frozen >= 0 ? ordered[frozen] : undefined;

  const floor = frozenWagon ? addDays(frozenWagon.plannedEnd, 1) : (sequence.startDate ?? today);
  const frontier = floor > today ? floor : today;
  const live = slots.filter(s => s.plannedEnd >= frontier);
  const skippedPast = slots.length - live.length;
  const business = sequence.calendar === 'business_days';

  // Grade contínua (sem buraco de calendário, senão o fatiamento recusa a atividade): em dias
  // úteis o vagão vai da segunda ao domingo seguinte e conta só os úteis como takt.
  const grid: { id: string; plannedStart: string; plannedEnd: string }[] = [];
  if (live.length) {
    const first = live.reduce((min, s) => (s.plannedStart < min ? s.plannedStart : min), live[0].plannedStart);
    const last = live.reduce((max, s) => (s.plannedEnd > max ? s.plannedEnd : max), live[0].plannedEnd);
    let start = first > frontier ? first : frontier;
    while (start <= last && grid.length < 2000) {
      const end = business ? addDays(addBusinessDays(nextBusinessDay(start), sequence.defaultTaktDays), -1) : addDays(start, sequence.defaultTaktDays - 1);
      grid.push({ id: String(grid.length), plannedStart: start, plannedEnd: end });
      start = addDays(end, 1);
    }
  }
  const buckets = grid.map(w => ({ ...w, activities: [] as PlannedActivity[] }));
  for (const slot of live) {
    const row = { externalId: slot.key, name: slot.name, location: slot.location, plannedStart: slot.plannedStart, plannedEnd: slot.plannedEnd, progress: 0 };
    for (const slice of sliceActivity(row, grid)) {
      const bucket = buckets[Number(slice.wagonId)];
      // A chave leva o início do vagão: sem isso, a fatia "#1" de um vagão já liberado e a "#1"
      // da cauda teriam o mesmo id externo, que é único no banco.
      bucket.activities.push({ externalId: `${slice.row.externalId}@${bucket.plannedStart}`, name: slice.row.name, location: slot.location, plannedStart: slice.row.plannedStart, plannedEnd: slice.row.plannedEnd, weight: slice.row.weight ?? 1, teamNames: slot.teamNames });
    }
  }
  const wagons: PlannedWagon[] = buckets.filter(b => b.activities.length).map(b => ({
    plannedStart: b.plannedStart, plannedEnd: b.plannedEnd, taktDays: periodDays(b.plannedStart, b.plannedEnd, business) || 1, activities: b.activities,
  }));

  const keptWagonIds = new Set(tail.filter(w => wagons.some(p => p.plannedStart === w.plannedStart)).map(w => w.id));
  const tailIds = new Set(tail.map(w => w.id));
  const wanted = new Set(wagons.flatMap(w => w.activities.map(a => a.externalId)));
  // Na cauda, o plano responde por tudo que veio de fora (plano ou Prevision). Atividade manual
  // sobrevive se o vagão dela continua e ela ainda cabe no novo período.
  const survivingManual = (a: Activity) => {
    if (a.origin !== 'manual' || !keptWagonIds.has(a.wagonId)) return false;
    const wagon = wagons.find(p => p.plannedStart === data.wagons.find(w => w.id === a.wagonId)!.plannedStart)!;
    return a.plannedStart >= wagon.plannedStart && a.plannedEnd <= wagon.plannedEnd;
  };
  const tailActivities = data.activities.filter(a => tailIds.has(a.wagonId));
  const removedActivities = tailActivities.filter(a => !(a.previsionExternalId && wanted.has(a.previsionExternalId)) && !survivingManual(a));
  const removedActivityIds = removedActivities.map(a => a.id);
  const removedWagonIds = tail.filter(w => !keptWagonIds.has(w.id)).map(w => w.id);
  const removedWagonSet = new Set(removedWagonIds);
  return {
    aborted: false, frozenWagonId: frozenWagon?.id, startNumber: (frozenWagon?.number ?? 0) + 1, frontier, wagons,
    removedWagonIds, removedActivityIds,
    // Restrição e pendência saem só com o vagão; se sai apenas a atividade, elas ficam e perdem o vínculo.
    removedRestrictionIds: data.restrictions.filter(r => removedWagonSet.has(r.wagonId)).map(r => r.id),
    removedPendingIds: data.pendingItems.filter(p => removedWagonSet.has(p.wagonId)).map(p => p.id),
    removedWithProgress: removedActivities.filter(a => a.progress > 0 || data.criteria.some(c => c.activityId === a.id && c.fulfilled)).length,
    skippedPast, keptWagons: keptWagonIds.size, keptActivities: tailActivities.length - removedActivities.length,
  };
}

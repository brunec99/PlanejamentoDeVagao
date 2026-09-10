import type { PlanningData, Wagon } from '../../domain/entities';
import type { ImportedActivity } from './commands';
import { spanDays } from './slice-activity';

const MS = 86400000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * MS).toISOString().slice(0, 10);

export interface RegenerationWindow { plannedStart: string; plannedEnd: string; members: ImportedActivity[] }
export interface RegenerationResult {
  aborted: boolean;
  reason?: string;
  removedWagonIds: string[];
  removedActivityIds: string[];
  removedCriterionIds: string[];
  removedPendingIds: string[];
  removedRestrictionIds: string[];
  /** Contagem de atividades com progresso ou critérios atendidos que foram removidas mesmo
   * assim — não bloqueia a regeneração, só torna visível que algo além de "vazio" foi perdido. */
  removedWithProgressOrCriteria: number;
  frozenWagonId?: string;
  startNumber: number;
  windows: RegenerationWindow[];
  skippedTooLong: number;
  skippedProgress: number;
}

/** Agrupa atividades ainda não colocadas em janelas de até `taktDays`, por proximidade real
 * (a janela nasce na primeira atividade não agrupada, nunca numa grade fixa) — mesmo algoritmo
 * usado na carga inicial dos vagões, agora promovido de script descartável para código real. */
function clusterIntoWindows(rows: ImportedActivity[], taktDays: number): RegenerationWindow[] {
  const sorted = [...rows].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.plannedEnd.localeCompare(b.plannedEnd));
  const windows: RegenerationWindow[] = [];
  let current: RegenerationWindow | null = null;
  for (const row of sorted) {
    if (current && row.plannedStart <= current.plannedEnd) {
      const end = row.plannedEnd > current.plannedEnd ? row.plannedEnd : current.plannedEnd;
      if (spanDays(current.plannedStart, end) <= taktDays) { current.plannedEnd = end; current.members.push(row); continue; }
      continue; // atravessaria o teto do vagão atual — fica para uma janela futura, se houver
    }
    if (current) windows.push(current);
    current = { plannedStart: row.plannedStart, plannedEnd: row.plannedEnd, members: [row] };
  }
  if (current) windows.push(current);
  return windows;
}

function aborted(reason: string): RegenerationResult {
  return { aborted: true, reason, removedWagonIds: [], removedActivityIds: [], removedCriterionIds: [], removedPendingIds: [], removedRestrictionIds: [], removedWithProgressOrCriteria: 0, startNumber: 1, windows: [], skippedTooLong: 0, skippedProgress: 0 };
}

/**
 * Decide o que apagar (só a cauda não liberada de uma sequência) e o que criar no lugar,
 * a partir do cronograma atualizado do Prevision. Função pura — quem chama aplica o resultado.
 */
export function planSequenceRegeneration(data: PlanningData, sequenceId: string, projectId: string, rows: ImportedActivity[], taktDays: number, today: string): RegenerationResult {
  const wagons = data.wagons.filter(w => w.sequenceId === sequenceId);
  const byId = new Map(wagons.map(w => [w.id, w]));
  const head = wagons.find(w => !w.predecessorId || !byId.has(w.predecessorId));

  const ordered: Wagon[] = [];
  const seen = new Set<string>();
  let cursor = head;
  while (cursor) {
    if (seen.has(cursor.id)) return aborted('Ciclo detectado na sequência — regeneração abortada.');
    seen.add(cursor.id); ordered.push(cursor);
    cursor = wagons.find(w => w.predecessorId === cursor!.id);
  }
  if (ordered.length !== wagons.length) return aborted('Sequência com vagões desconectados da cadeia principal — regeneração abortada.');

  const released = new Set(data.releases.map(r => r.wagonId));
  let frozenIndex = -1;
  while (frozenIndex + 1 < ordered.length && released.has(ordered[frozenIndex + 1].id)) frozenIndex++;
  const removable = ordered.slice(frozenIndex + 1);
  if (removable.some(w => released.has(w.id))) return aborted('Existe vagão liberado depois de um não liberado (ordem inesperada) — regeneração abortada para não arriscar um vagão liberado.');

  const removableIds = new Set(removable.map(w => w.id));
  const removedWagonIds = [...removableIds];
  const removedActivityIds = data.activities.filter(a => removableIds.has(a.wagonId)).map(a => a.id);
  const removedActivityIdSet = new Set(removedActivityIds);
  const removedCriterionIds = data.criteria.filter(c => removedActivityIdSet.has(c.activityId)).map(c => c.id);
  const removedPendingIds = data.pendingItems.filter(p => removableIds.has(p.wagonId)).map(p => p.id);
  const removedRestrictionIds = data.restrictions.filter(r => removableIds.has(r.wagonId)).map(r => r.id);
  const removedWithProgressOrCriteria =
    data.activities.filter(a => removedActivityIdSet.has(a.id) && a.progress > 0).length +
    data.criteria.filter(c => removedCriterionIds.includes(c.id) && c.fulfilled).length;

  const frozenWagon = frozenIndex >= 0 ? ordered[frozenIndex] : undefined;
  const frontier = frozenWagon ? addDays(frozenWagon.plannedEnd, 1) : today;
  const startFrontier = frontier > today ? frontier : today;

  // Atividades já presentes em vagões que ficam de pé (liberados ou não) não voltam pro funil —
  // só o que estava na cauda removida ou nunca foi importado é reconsiderado.
  const keptExternalIds = new Set(
    data.activities
      .filter(a => !removedActivityIdSet.has(a.id) && a.previsionExternalId?.startsWith(`${projectId}:`))
      .map(a => a.previsionExternalId!.split('#')[0]),
  );

  let skippedTooLong = 0, skippedProgress = 0;
  const eligible: ImportedActivity[] = [];
  for (const row of rows) {
    if (keptExternalIds.has(`${projectId}:${row.externalId}`)) continue;
    if (row.plannedEnd < startFrontier) continue;
    if (row.progress > 0) { skippedProgress++; continue; }
    if (spanDays(row.plannedStart, row.plannedEnd) > taktDays) { skippedTooLong++; continue; }
    const plannedStart = row.plannedStart < startFrontier ? startFrontier : row.plannedStart;
    eligible.push({ ...row, plannedStart });
  }

  return {
    aborted: false,
    removedWagonIds, removedActivityIds, removedCriterionIds, removedPendingIds, removedRestrictionIds,
    removedWithProgressOrCriteria,
    frozenWagonId: frozenWagon?.id,
    startNumber: (frozenWagon?.number ?? 0) + 1,
    windows: clusterIntoWindows(eligible, taktDays),
    skippedTooLong, skippedProgress,
  };
}

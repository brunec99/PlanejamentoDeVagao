import type {
  Activity, HistoryEvent, Location, PendingItem, PlanningData, ProductionSequence,
  Release, Restriction, TerminalityCriterion, TerminalityDebt, User, Wagon, Work,
} from '../../../domain/entities';

/** Raw rows as returned by `select('*')` — snake_case, matching the SQL columns in 0001_init.sql. */
export interface Rows {
  works: WorkRow[]; locations: LocationRow[]; production_sequences: SequenceRow[]; wagons: WagonRow[];
  activities: ActivityRow[]; terminality_criteria: CriterionRow[]; pending_items: PendingRow[];
  restrictions: RestrictionRow[]; releases: ReleaseRow[]; terminality_debts: DebtRow[];
  history_events: HistoryRow[]; profiles: ProfileRow[];
}

interface WorkRow { id: string; created_at: string; updated_at: string; name: string; code: string; description: string; active: boolean; prevision_project_id: string | null }
interface LocationRow { id: string; created_at: string; updated_at: string; work_id: string; name: string; code: string; parent_id: string | null }
interface SequenceRow { id: string; created_at: string; updated_at: string; work_id: string; name: string; default_takt_days: number; calendar: 'calendar_days' | 'business_days' }
interface WagonRow { id: string; created_at: string; updated_at: string; sequence_id: string; number: number; predecessor_id: string | null; planned_start: string; planned_end: string; takt_days: number; actual_start: string | null; responsible_ids: string[] }
interface ActivityRow { id: string; created_at: string; updated_at: string; wagon_id: string; name: string; location_id: string; responsible_id: string; planned_start: string; planned_end: string; progress: number; status: Activity['status']; weight: number; mandatory: boolean; origin: Activity['origin']; prevision_external_id: string | null }
interface CriterionRow { id: string; created_at: string; updated_at: string; activity_id: string; description: string; mandatory: boolean; fulfilled: boolean; confirmed_at: string | null; confirmed_by: string | null }
interface PendingRow { id: string; created_at: string; updated_at: string; wagon_id: string; activity_id: string | null; description: string; responsible_id: string; due_date: string; status: PendingItem['status']; blocks_terminality: boolean; resolved_at: string | null; resolution: string | null }
interface RestrictionRow extends PendingRow { blocks_execution: boolean }
interface ReleaseRow { id: string; created_at: string; updated_at: string; wagon_id: string; predecessor_id: string | null; type: Release['type']; justification: string | null; authorized_by: string; regularization_responsible_id: string | null; due_date: string | null; released_at: string; accepted_pending_ids: string[]; acknowledged_debt_ids: string[] }
interface DebtRow { id: string; created_at: string; updated_at: string; pending_item_id: string; release_id: string; responsible_id: string; due_date: string }
interface HistoryRow { id: string; entity_id: string; entity_type: string; action: string; author_id: string; occurred_at: string; changes: Record<string, unknown> }
interface ProfileRow { id: string; created_at: string; updated_at: string; name: string; role: User['role']; work_ids: string[] }

export function rowsToPlanningData(rows: Rows): PlanningData {
  return {
    works: rows.works.map((r): Work => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, name: r.name, code: r.code, description: r.description, active: r.active, previsionProjectId: r.prevision_project_id ?? undefined })),
    locations: rows.locations.map((r): Location => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, name: r.name, code: r.code, parentId: r.parent_id ?? undefined })),
    sequences: rows.production_sequences.map((r): ProductionSequence => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, name: r.name, defaultTaktDays: r.default_takt_days, calendar: r.calendar })),
    wagons: rows.wagons.map((r): Wagon => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, sequenceId: r.sequence_id, number: r.number, predecessorId: r.predecessor_id ?? undefined, plannedStart: r.planned_start, plannedEnd: r.planned_end, taktDays: r.takt_days, actualStart: r.actual_start ?? undefined, responsibleIds: r.responsible_ids })),
    activities: rows.activities.map((r): Activity => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, wagonId: r.wagon_id, name: r.name, locationId: r.location_id, responsibleId: r.responsible_id, plannedStart: r.planned_start, plannedEnd: r.planned_end, progress: r.progress, status: r.status, weight: r.weight, mandatory: r.mandatory, origin: r.origin, previsionExternalId: r.prevision_external_id ?? undefined })),
    criteria: rows.terminality_criteria.map((r): TerminalityCriterion => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, activityId: r.activity_id, description: r.description, mandatory: r.mandatory, fulfilled: r.fulfilled, confirmedAt: r.confirmed_at ?? undefined, confirmedBy: r.confirmed_by ?? undefined })),
    pendingItems: rows.pending_items.map((r): PendingItem => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, wagonId: r.wagon_id, activityId: r.activity_id ?? undefined, description: r.description, responsibleId: r.responsible_id, dueDate: r.due_date, status: r.status, blocksTerminality: r.blocks_terminality, resolvedAt: r.resolved_at ?? undefined, resolution: r.resolution ?? undefined })),
    restrictions: rows.restrictions.map((r): Restriction => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, wagonId: r.wagon_id, activityId: r.activity_id ?? undefined, description: r.description, responsibleId: r.responsible_id, dueDate: r.due_date, status: r.status, blocksExecution: r.blocks_execution, blocksTerminality: r.blocks_terminality, resolvedAt: r.resolved_at ?? undefined, resolution: r.resolution ?? undefined })),
    releases: rows.releases.map((r): Release => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, wagonId: r.wagon_id, predecessorId: r.predecessor_id ?? undefined, type: r.type, justification: r.justification ?? undefined, authorizedBy: r.authorized_by, regularizationResponsibleId: r.regularization_responsible_id ?? undefined, dueDate: r.due_date ?? undefined, releasedAt: r.released_at, acceptedPendingIds: r.accepted_pending_ids, acknowledgedDebtIds: r.acknowledged_debt_ids })),
    debts: rows.terminality_debts.map((r): TerminalityDebt => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, pendingItemId: r.pending_item_id, releaseId: r.release_id, responsibleId: r.responsible_id, dueDate: r.due_date })),
    users: rows.profiles.map((r): User => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, name: r.name, role: r.role, workIds: r.work_ids })),
    history: rows.history_events.map((r): HistoryEvent => ({ id: r.id, entityId: r.entity_id, entityType: r.entity_type, action: r.action, authorId: r.author_id, occurredAt: r.occurred_at, changes: r.changes })),
  };
}

/** Payload for the `commit_planning` RPC — snake_case keys matching table/column names.
 * profiles are included because create_work mutates the acting user's workIds (see commands.ts);
 * no command creates a new profile, so the RPC only ever updates existing rows. */
export function planningDataToPayload(data: PlanningData) {
  return {
    works: data.works.map(w => ({ id: w.id, created_at: w.createdAt, updated_at: w.updatedAt, name: w.name, code: w.code, description: w.description, active: w.active, prevision_project_id: w.previsionProjectId ?? null })),
    locations: data.locations.map(l => ({ id: l.id, created_at: l.createdAt, updated_at: l.updatedAt, work_id: l.workId, name: l.name, code: l.code, parent_id: l.parentId ?? null })),
    production_sequences: data.sequences.map(s => ({ id: s.id, created_at: s.createdAt, updated_at: s.updatedAt, work_id: s.workId, name: s.name, default_takt_days: s.defaultTaktDays, calendar: s.calendar })),
    wagons: data.wagons.map(w => ({ id: w.id, created_at: w.createdAt, updated_at: w.updatedAt, sequence_id: w.sequenceId, number: w.number, predecessor_id: w.predecessorId ?? null, planned_start: w.plannedStart, planned_end: w.plannedEnd, takt_days: w.taktDays, actual_start: w.actualStart ?? null, responsible_ids: w.responsibleIds })),
    activities: data.activities.map(a => ({ id: a.id, created_at: a.createdAt, updated_at: a.updatedAt, wagon_id: a.wagonId, name: a.name, location_id: a.locationId, responsible_id: a.responsibleId, planned_start: a.plannedStart, planned_end: a.plannedEnd, progress: a.progress, status: a.status, weight: a.weight, mandatory: a.mandatory, origin: a.origin, prevision_external_id: a.previsionExternalId ?? null })),
    terminality_criteria: data.criteria.map(c => ({ id: c.id, created_at: c.createdAt, updated_at: c.updatedAt, activity_id: c.activityId, description: c.description, mandatory: c.mandatory, fulfilled: c.fulfilled, confirmed_at: c.confirmedAt ?? null, confirmed_by: c.confirmedBy ?? null })),
    pending_items: data.pendingItems.map(p => ({ id: p.id, created_at: p.createdAt, updated_at: p.updatedAt, wagon_id: p.wagonId, activity_id: p.activityId ?? null, description: p.description, responsible_id: p.responsibleId, due_date: p.dueDate, status: p.status, blocks_terminality: p.blocksTerminality, resolved_at: p.resolvedAt ?? null, resolution: p.resolution ?? null })),
    restrictions: data.restrictions.map(r => ({ id: r.id, created_at: r.createdAt, updated_at: r.updatedAt, wagon_id: r.wagonId, activity_id: r.activityId ?? null, description: r.description, responsible_id: r.responsibleId, due_date: r.dueDate, status: r.status, blocks_execution: r.blocksExecution, blocks_terminality: r.blocksTerminality, resolved_at: r.resolvedAt ?? null, resolution: r.resolution ?? null })),
    releases: data.releases.map(r => ({ id: r.id, created_at: r.createdAt, updated_at: r.updatedAt, wagon_id: r.wagonId, predecessor_id: r.predecessorId ?? null, type: r.type, justification: r.justification ?? null, authorized_by: r.authorizedBy, regularization_responsible_id: r.regularizationResponsibleId ?? null, due_date: r.dueDate ?? null, released_at: r.releasedAt, accepted_pending_ids: r.acceptedPendingIds, acknowledged_debt_ids: r.acknowledgedDebtIds })),
    terminality_debts: data.debts.map(d => ({ id: d.id, created_at: d.createdAt, updated_at: d.updatedAt, pending_item_id: d.pendingItemId, release_id: d.releaseId, responsible_id: d.responsibleId, due_date: d.dueDate })),
    history_events: data.history.map(h => ({ id: h.id, entity_id: h.entityId, entity_type: h.entityType, action: h.action, author_id: h.authorId, occurred_at: h.occurredAt, changes: h.changes })),
    profiles: data.users.map(u => ({ id: u.id, created_at: u.createdAt, updated_at: u.updatedAt, name: u.name, role: u.role, work_ids: u.workIds })),
  };
}

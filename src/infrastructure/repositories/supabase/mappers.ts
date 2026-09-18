import type {
  Activity, ActivityDependency, Baseline, MediumTermPlan, PlanDependency, PlanTask, BaselineActivity, BaselineWagon, HistoryEvent, IfcModel, IfcModelVersion,
  LinkRule, LinkRuleCriterion, Location, PendingItem, PlanningData, ProductionSequence,
  ProgressEntry, Release, Restriction, Team, TerminalityCriterion, TerminalityDebt, User,
  Wagon, WeeklyCommitment, Work,
} from '../../../domain/entities';

/** Raw rows as returned by `select('*')` — snake_case, matching the SQL columns in 0001_init.sql. */
export interface Rows {
  works: WorkRow[]; locations: LocationRow[]; production_sequences: SequenceRow[]; wagons: WagonRow[];
  activities: ActivityRow[]; terminality_criteria: CriterionRow[]; pending_items: PendingRow[];
  restrictions: RestrictionRow[]; releases: ReleaseRow[]; terminality_debts: DebtRow[];
  teams: TeamRow[]; progress_entries: ProgressEntryRow[]; baselines: BaselineRow[];
  weekly_commitments: CommitmentRow[]; activity_dependencies: DependencyRow[]; ifc_models: IfcModelRow[];
  medium_term_plans: PlanRow[]; plan_tasks: PlanTaskRow[]; plan_dependencies: DependencyRow[];
  ifc_model_versions: IfcVersionRow[]; link_rules: LinkRuleRow[];
  history_events: HistoryRow[]; profiles: ProfileRow[];
}

interface WorkRow { id: string; created_at: string; updated_at: string; name: string; code: string; description: string; active: boolean; prevision_project_id: string | null }
interface LocationRow { id: string; created_at: string; updated_at: string; work_id: string; name: string; code: string; parent_id: string | null }
interface SequenceRow { id: string; created_at: string; updated_at: string; work_id: string; name: string; default_takt_days: number; calendar: 'calendar_days' | 'business_days'; start_date: string | null }
interface WagonRow { id: string; created_at: string; updated_at: string; sequence_id: string; number: number; predecessor_id: string | null; planned_start: string; planned_end: string; takt_days: number; actual_start: string | null; responsible_ids: string[] }
interface ActivityRow { id: string; created_at: string; updated_at: string; wagon_id: string; name: string; location_id: string; responsible_id: string; planned_start: string; planned_end: string; progress: number; status: Activity['status']; weight: number; mandatory: boolean; origin: Activity['origin']; prevision_external_id: string | null; team_id: string | null; notes: string | null }
interface CriterionRow { id: string; created_at: string; updated_at: string; activity_id: string; description: string; mandatory: boolean; fulfilled: boolean; confirmed_at: string | null; confirmed_by: string | null }
interface PendingRow { id: string; created_at: string; updated_at: string; wagon_id: string; activity_id: string | null; description: string; responsible_id: string; due_date: string; status: PendingItem['status']; blocks_terminality: boolean; resolved_at: string | null; resolution: string | null }
interface RestrictionRow extends PendingRow { blocks_execution: boolean; board_status: Restriction['boardStatus']; lead_time_days: number | null }
interface TeamRow { id: string; created_at: string; updated_at: string; work_id: string; company: string; name: string; weekly_capacity: number }
interface ProgressEntryRow { id: string; created_at: string; updated_at: string; activity_id: string; recorded_date: string; progress: number; recorded_by: string }
interface BaselineRow { id: string; created_at: string; updated_at: string; work_id: string; name: string; created_by: string; wagons: BaselineWagon[]; activities: BaselineActivity[] }
interface CommitmentRow { id: string; created_at: string; updated_at: string; work_id: string; name: string; activity_id: string | null; week_start: string; week_end: string; responsible_id: string; team_id: string; start_date: string; end_date: string; weekdays: number[]; fulfilled: boolean | null; cause: WeeklyCommitment['cause'] | null; justification: string | null; recorded_at: string | null; recorded_by: string | null }
interface DependencyRow { id: string; created_at: string; updated_at: string; predecessor_id: string; successor_id: string }
interface PlanRow { id: string; created_at: string; updated_at: string; work_id: string; month: string; name: string; baseline_of: string | null; frozen_at: string | null; created_by: string }
interface PlanTaskRow { id: string; created_at: string; updated_at: string; plan_id: string; name: string; planned_start: string; planned_end: string; team_id: string | null; activity_id: string | null; notes: string | null; progress: number; order_index: number }
interface IfcModelRow { id: string; created_at: string; updated_at: string; work_id: string; name: string; discipline: string }
interface IfcVersionRow { id: string; created_at: string; updated_at: string; model_id: string; version: number; file_name: string; file_size: number; storage_path: string; uploaded_by: string; storeys: string[]; element_count: number }
interface LinkRuleRow { id: string; created_at: string; updated_at: string; work_id: string; order_index: number; service_name: string; criteria: LinkRuleCriterion[] }
interface ReleaseRow { id: string; created_at: string; updated_at: string; wagon_id: string; predecessor_id: string | null; type: Release['type']; justification: string | null; authorized_by: string; regularization_responsible_id: string | null; due_date: string | null; released_at: string; accepted_pending_ids: string[]; acknowledged_debt_ids: string[] }
interface DebtRow { id: string; created_at: string; updated_at: string; pending_item_id: string; release_id: string; responsible_id: string; due_date: string }
interface HistoryRow { id: string; entity_id: string; entity_type: string; action: string; author_id: string; occurred_at: string; changes: Record<string, unknown> }
interface ProfileRow { id: string; created_at: string; updated_at: string; name: string; role: User['role']; work_ids: string[] }

export function rowsToPlanningData(rows: Rows): PlanningData {
  return {
    works: rows.works.map((r): Work => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, name: r.name, code: r.code, description: r.description, active: r.active, previsionProjectId: r.prevision_project_id ?? undefined })),
    locations: rows.locations.map((r): Location => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, name: r.name, code: r.code, parentId: r.parent_id ?? undefined })),
    sequences: rows.production_sequences.map((r): ProductionSequence => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, name: r.name, defaultTaktDays: r.default_takt_days, calendar: r.calendar, startDate: r.start_date ?? undefined })),
    wagons: rows.wagons.map((r): Wagon => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, sequenceId: r.sequence_id, number: r.number, predecessorId: r.predecessor_id ?? undefined, plannedStart: r.planned_start, plannedEnd: r.planned_end, taktDays: r.takt_days, actualStart: r.actual_start ?? undefined, responsibleIds: r.responsible_ids })),
    activities: rows.activities.map((r): Activity => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, wagonId: r.wagon_id, name: r.name, locationId: r.location_id, responsibleId: r.responsible_id, plannedStart: r.planned_start, plannedEnd: r.planned_end, progress: r.progress, status: r.status, weight: r.weight, mandatory: r.mandatory, origin: r.origin, previsionExternalId: r.prevision_external_id ?? undefined, teamId: r.team_id ?? undefined, notes: r.notes ?? undefined })),
    criteria: rows.terminality_criteria.map((r): TerminalityCriterion => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, activityId: r.activity_id, description: r.description, mandatory: r.mandatory, fulfilled: r.fulfilled, confirmedAt: r.confirmed_at ?? undefined, confirmedBy: r.confirmed_by ?? undefined })),
    pendingItems: rows.pending_items.map((r): PendingItem => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, wagonId: r.wagon_id, activityId: r.activity_id ?? undefined, description: r.description, responsibleId: r.responsible_id, dueDate: r.due_date, status: r.status, blocksTerminality: r.blocks_terminality, resolvedAt: r.resolved_at ?? undefined, resolution: r.resolution ?? undefined })),
    restrictions: rows.restrictions.map((r): Restriction => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, wagonId: r.wagon_id, activityId: r.activity_id ?? undefined, description: r.description, responsibleId: r.responsible_id, dueDate: r.due_date, status: r.status, blocksExecution: r.blocks_execution, blocksTerminality: r.blocks_terminality, resolvedAt: r.resolved_at ?? undefined, resolution: r.resolution ?? undefined, boardStatus: r.board_status, leadTimeDays: r.lead_time_days ?? undefined })),
    releases: rows.releases.map((r): Release => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, wagonId: r.wagon_id, predecessorId: r.predecessor_id ?? undefined, type: r.type, justification: r.justification ?? undefined, authorizedBy: r.authorized_by, regularizationResponsibleId: r.regularization_responsible_id ?? undefined, dueDate: r.due_date ?? undefined, releasedAt: r.released_at, acceptedPendingIds: r.accepted_pending_ids, acknowledgedDebtIds: r.acknowledged_debt_ids })),
    debts: rows.terminality_debts.map((r): TerminalityDebt => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, pendingItemId: r.pending_item_id, releaseId: r.release_id, responsibleId: r.responsible_id, dueDate: r.due_date })),
    teams: rows.teams.map((r): Team => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, company: r.company, name: r.name, weeklyCapacity: r.weekly_capacity })),
    progressEntries: rows.progress_entries.map((r): ProgressEntry => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, activityId: r.activity_id, recordedDate: r.recorded_date, progress: r.progress, recordedBy: r.recorded_by })),
    commitments: rows.weekly_commitments.map((r): WeeklyCommitment => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, name: r.name, activityId: r.activity_id ?? undefined, weekStart: r.week_start, weekEnd: r.week_end, responsibleId: r.responsible_id, teamId: r.team_id, startDate: r.start_date, endDate: r.end_date, weekdays: r.weekdays, fulfilled: r.fulfilled ?? undefined, cause: r.cause ?? undefined, justification: r.justification ?? undefined, recordedAt: r.recorded_at ?? undefined, recordedBy: r.recorded_by ?? undefined })),
    baselines: rows.baselines.map((r): Baseline => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, name: r.name, createdBy: r.created_by, wagons: r.wagons, activities: r.activities })),
    dependencies: rows.activity_dependencies.map((r): ActivityDependency => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, predecessorId: r.predecessor_id, successorId: r.successor_id })),
    plans: rows.medium_term_plans.map((r): MediumTermPlan => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, month: r.month, name: r.name, baselineOf: r.baseline_of ?? undefined, frozenAt: r.frozen_at ?? undefined, createdBy: r.created_by })),
    planTasks: rows.plan_tasks.map((r): PlanTask => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, planId: r.plan_id, name: r.name, plannedStart: r.planned_start, plannedEnd: r.planned_end, teamId: r.team_id ?? undefined, activityId: r.activity_id ?? undefined, notes: r.notes ?? undefined, progress: r.progress, order: r.order_index })),
    planDependencies: rows.plan_dependencies.map((r): PlanDependency => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, predecessorId: r.predecessor_id, successorId: r.successor_id })),
    ifcModels: rows.ifc_models.map((r): IfcModel => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, name: r.name, discipline: r.discipline })),
    ifcVersions: rows.ifc_model_versions.map((r): IfcModelVersion => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, modelId: r.model_id, version: r.version, fileName: r.file_name, fileSize: r.file_size, storagePath: r.storage_path, uploadedBy: r.uploaded_by, storeys: r.storeys, elementCount: r.element_count })),
    linkRules: rows.link_rules.map((r): LinkRule => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, workId: r.work_id, order: r.order_index, serviceName: r.service_name, criteria: r.criteria })),
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
    production_sequences: data.sequences.map(s => ({ id: s.id, created_at: s.createdAt, updated_at: s.updatedAt, work_id: s.workId, name: s.name, default_takt_days: s.defaultTaktDays, calendar: s.calendar, start_date: s.startDate ?? null })),
    wagons: data.wagons.map(w => ({ id: w.id, created_at: w.createdAt, updated_at: w.updatedAt, sequence_id: w.sequenceId, number: w.number, predecessor_id: w.predecessorId ?? null, planned_start: w.plannedStart, planned_end: w.plannedEnd, takt_days: w.taktDays, actual_start: w.actualStart ?? null, responsible_ids: w.responsibleIds })),
    activities: data.activities.map(a => ({ id: a.id, created_at: a.createdAt, updated_at: a.updatedAt, wagon_id: a.wagonId, name: a.name, location_id: a.locationId, responsible_id: a.responsibleId, planned_start: a.plannedStart, planned_end: a.plannedEnd, progress: a.progress, status: a.status, weight: a.weight, mandatory: a.mandatory, origin: a.origin, prevision_external_id: a.previsionExternalId ?? null, team_id: a.teamId ?? null, notes: a.notes ?? null })),
    terminality_criteria: data.criteria.map(c => ({ id: c.id, created_at: c.createdAt, updated_at: c.updatedAt, activity_id: c.activityId, description: c.description, mandatory: c.mandatory, fulfilled: c.fulfilled, confirmed_at: c.confirmedAt ?? null, confirmed_by: c.confirmedBy ?? null })),
    pending_items: data.pendingItems.map(p => ({ id: p.id, created_at: p.createdAt, updated_at: p.updatedAt, wagon_id: p.wagonId, activity_id: p.activityId ?? null, description: p.description, responsible_id: p.responsibleId, due_date: p.dueDate, status: p.status, blocks_terminality: p.blocksTerminality, resolved_at: p.resolvedAt ?? null, resolution: p.resolution ?? null })),
    restrictions: data.restrictions.map(r => ({ id: r.id, created_at: r.createdAt, updated_at: r.updatedAt, wagon_id: r.wagonId, activity_id: r.activityId ?? null, description: r.description, responsible_id: r.responsibleId, due_date: r.dueDate, status: r.status, blocks_execution: r.blocksExecution, blocks_terminality: r.blocksTerminality, resolved_at: r.resolvedAt ?? null, resolution: r.resolution ?? null, board_status: r.boardStatus, lead_time_days: r.leadTimeDays ?? null })),
    releases: data.releases.map(r => ({ id: r.id, created_at: r.createdAt, updated_at: r.updatedAt, wagon_id: r.wagonId, predecessor_id: r.predecessorId ?? null, type: r.type, justification: r.justification ?? null, authorized_by: r.authorizedBy, regularization_responsible_id: r.regularizationResponsibleId ?? null, due_date: r.dueDate ?? null, released_at: r.releasedAt, accepted_pending_ids: r.acceptedPendingIds, acknowledged_debt_ids: r.acknowledgedDebtIds })),
    terminality_debts: data.debts.map(d => ({ id: d.id, created_at: d.createdAt, updated_at: d.updatedAt, pending_item_id: d.pendingItemId, release_id: d.releaseId, responsible_id: d.responsibleId, due_date: d.dueDate })),
    teams: data.teams.map(t => ({ id: t.id, created_at: t.createdAt, updated_at: t.updatedAt, work_id: t.workId, company: t.company, name: t.name, weekly_capacity: t.weeklyCapacity })),
    progress_entries: data.progressEntries.map(p => ({ id: p.id, created_at: p.createdAt, updated_at: p.updatedAt, activity_id: p.activityId, recorded_date: p.recordedDate, progress: p.progress, recorded_by: p.recordedBy })),
    weekly_commitments: data.commitments.map(c => ({ id: c.id, created_at: c.createdAt, updated_at: c.updatedAt, work_id: c.workId, name: c.name, activity_id: c.activityId ?? null, week_start: c.weekStart, week_end: c.weekEnd, responsible_id: c.responsibleId, team_id: c.teamId, start_date: c.startDate, end_date: c.endDate, weekdays: c.weekdays, fulfilled: c.fulfilled ?? null, cause: c.cause ?? null, justification: c.justification ?? null, recorded_at: c.recordedAt ?? null, recorded_by: c.recordedBy ?? null })),
    baselines: data.baselines.map(b => ({ id: b.id, created_at: b.createdAt, updated_at: b.updatedAt, work_id: b.workId, name: b.name, created_by: b.createdBy, wagons: b.wagons, activities: b.activities })),
    activity_dependencies: data.dependencies.map(d => ({ id: d.id, created_at: d.createdAt, updated_at: d.updatedAt, predecessor_id: d.predecessorId, successor_id: d.successorId })),
    medium_term_plans: data.plans.map(p => ({ id: p.id, created_at: p.createdAt, updated_at: p.updatedAt, work_id: p.workId, month: p.month, name: p.name, baseline_of: p.baselineOf ?? null, frozen_at: p.frozenAt ?? null, created_by: p.createdBy })),
    plan_tasks: data.planTasks.map(t => ({ id: t.id, created_at: t.createdAt, updated_at: t.updatedAt, plan_id: t.planId, name: t.name, planned_start: t.plannedStart, planned_end: t.plannedEnd, team_id: t.teamId ?? null, activity_id: t.activityId ?? null, notes: t.notes ?? null, progress: t.progress, order_index: t.order })),
    plan_dependencies: data.planDependencies.map(d => ({ id: d.id, created_at: d.createdAt, updated_at: d.updatedAt, predecessor_id: d.predecessorId, successor_id: d.successorId })),
    ifc_models: data.ifcModels.map(m => ({ id: m.id, created_at: m.createdAt, updated_at: m.updatedAt, work_id: m.workId, name: m.name, discipline: m.discipline })),
    ifc_model_versions: data.ifcVersions.map(v => ({ id: v.id, created_at: v.createdAt, updated_at: v.updatedAt, model_id: v.modelId, version: v.version, file_name: v.fileName, file_size: v.fileSize, storage_path: v.storagePath, uploaded_by: v.uploadedBy, storeys: v.storeys, element_count: v.elementCount })),
    link_rules: data.linkRules.map(r => ({ id: r.id, created_at: r.createdAt, updated_at: r.updatedAt, work_id: r.workId, order_index: r.order, service_name: r.serviceName, criteria: r.criteria })),
    history_events: data.history.map(h => ({ id: h.id, entity_id: h.entityId, entity_type: h.entityType, action: h.action, author_id: h.authorId, occurred_at: h.occurredAt, changes: h.changes })),
    profiles: data.users.map(u => ({ id: u.id, created_at: u.createdAt, updated_at: u.updatedAt, name: u.name, role: u.role, work_ids: u.workIds })),
  };
}

/** Ids present in `before` but missing from `after`, per table — o que `commit_planning`
 * precisa apagar de fato. Só dois comandos removem linhas: `regenerate_sequence` (a cauda
 * não liberada da sequência) e `delete_link_rule`. */
export function diffDeletedIds(before: PlanningData, after: PlanningData) {
  const removed = <T extends { id: string }>(from: T[], to: T[]) => {
    const keep = new Set(to.map(x => x.id));
    return from.filter(x => !keep.has(x.id)).map(x => x.id);
  };
  return {
    wagons: removed(before.wagons, after.wagons),
    activities: removed(before.activities, after.activities),
    terminality_criteria: removed(before.criteria, after.criteria),
    pending_items: removed(before.pendingItems, after.pendingItems),
    restrictions: removed(before.restrictions, after.restrictions),
    link_rules: removed(before.linkRules, after.linkRules),
    activity_dependencies: removed(before.dependencies, after.dependencies),
    weekly_commitments: removed(before.commitments, after.commitments),
    teams: removed(before.teams, after.teams),
    plan_dependencies: removed(before.planDependencies, after.planDependencies),
    plan_tasks: removed(before.planTasks, after.planTasks),
    medium_term_plans: removed(before.plans, after.plans),
  };
}

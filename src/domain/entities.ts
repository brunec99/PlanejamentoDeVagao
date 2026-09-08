export type Id = string;
/** ISO calendar date (YYYY-MM-DD), without timezone conversion. */
export type LocalDate = string;
export interface RecordBase { id: Id; createdAt: string; updatedAt: string }
export interface Work extends RecordBase { name: string; code: string; description: string; active: boolean; previsionProjectId?: string }
export interface Location extends RecordBase { workId: Id; name: string; code: string; parentId?: Id }
export interface ProductionSequence extends RecordBase { workId: Id; name: string; defaultTaktDays: number; calendar: 'calendar_days' | 'business_days' }
/** A wagon is a temporal production cycle. Locations belong only to activities. */
export interface Wagon extends RecordBase { sequenceId: Id; number: number; predecessorId?: Id; plannedStart: LocalDate; plannedEnd: LocalDate; taktDays: number; actualStart?: LocalDate; responsibleIds: Id[] }
export type ActivityStatus = 'not_started' | 'in_progress' | 'completed';
export interface Activity extends RecordBase { wagonId: Id; name: string; locationId: Id; responsibleId: Id; plannedStart: LocalDate; plannedEnd: LocalDate; progress: number; status: ActivityStatus; weight: number; mandatory: boolean; origin: 'manual' | 'mock' | 'prevision'; previsionExternalId?: string }
export interface TerminalityCriterion extends RecordBase { activityId: Id; description: string; mandatory: boolean; fulfilled: boolean; confirmedAt?: string; confirmedBy?: Id }
export interface PendingItem extends RecordBase { wagonId: Id; activityId?: Id; description: string; responsibleId: Id; dueDate: LocalDate; status: 'open' | 'resolved'; blocksTerminality: boolean; resolvedAt?: string; resolution?: string }
export interface Restriction extends RecordBase { wagonId: Id; activityId?: Id; description: string; responsibleId: Id; dueDate: LocalDate; status: 'open' | 'resolved'; blocksExecution: boolean; blocksTerminality: boolean; resolvedAt?: string; resolution?: string }
export interface Release extends RecordBase { wagonId: Id; predecessorId?: Id; type: 'initial' | 'normal' | 'exceptional'; justification?: string; authorizedBy: Id; regularizationResponsibleId?: Id; dueDate?: LocalDate; releasedAt: string; acceptedPendingIds: Id[]; acknowledgedDebtIds: Id[] }
export interface TerminalityDebt extends RecordBase { pendingItemId: Id; releaseId: Id; responsibleId: Id; dueDate: LocalDate }
export interface User extends RecordBase { name: string; role: 'viewer' | 'planner' | 'manager'; workIds: Id[] }
export interface HistoryEvent { id: Id; entityId: Id; entityType: string; action: string; authorId: Id; occurredAt: string; changes: Record<string, unknown> }
export interface PlanningData { works: Work[]; locations: Location[]; sequences: ProductionSequence[]; wagons: Wagon[]; activities: Activity[]; criteria: TerminalityCriterion[]; pendingItems: PendingItem[]; restrictions: Restriction[]; releases: Release[]; debts: TerminalityDebt[]; users: User[]; history: HistoryEvent[] }
export type WagonStatus = 'not_started' | 'in_production' | 'restricted' | 'terminal';

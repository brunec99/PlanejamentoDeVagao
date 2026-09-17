export type Id = string;
/** ISO calendar date (YYYY-MM-DD), without timezone conversion. */
export type LocalDate = string;
export interface RecordBase { id: Id; createdAt: string; updatedAt: string }
export interface Work extends RecordBase { name: string; code: string; description: string; active: boolean; previsionProjectId?: string }
export interface Location extends RecordBase { workId: Id; name: string; code: string; parentId?: Id }
export interface ProductionSequence extends RecordBase { workId: Id; name: string; defaultTaktDays: number; calendar: 'calendar_days' | 'business_days'; startDate?: string }
/** A wagon is a temporal production cycle. Locations belong only to activities. */
export interface Wagon extends RecordBase { sequenceId: Id; number: number; predecessorId?: Id; plannedStart: LocalDate; plannedEnd: LocalDate; taktDays: number; actualStart?: LocalDate; responsibleIds: Id[] }
export type ActivityStatus = 'not_started' | 'in_progress' | 'completed';
export interface Activity extends RecordBase { wagonId: Id; name: string; locationId: Id; responsibleId: Id; plannedStart: LocalDate; plannedEnd: LocalDate; progress: number; status: ActivityStatus; weight: number; mandatory: boolean; origin: 'manual' | 'mock' | 'prevision'; previsionExternalId?: string; teamId?: Id }
/** Equipe executora. Capacidade em atividades simultâneas por semana. */
export interface Team extends RecordBase { workId: Id; name: string; weeklyCapacity: number }
/** Lançamento datado de percentual executado. `Activity.progress` guarda só o valor atual;
 * a série histórica vive aqui, para comparar planejado e realizado ao longo do tempo. */
export interface ProgressEntry extends RecordBase { activityId: Id; recordedDate: LocalDate; progress: number; recordedBy: Id }
export interface TerminalityCriterion extends RecordBase { activityId: Id; description: string; mandatory: boolean; fulfilled: boolean; confirmedAt?: string; confirmedBy?: Id }
export interface PendingItem extends RecordBase { wagonId: Id; activityId?: Id; description: string; responsibleId: Id; dueDate: LocalDate; status: 'open' | 'resolved'; blocksTerminality: boolean; resolvedAt?: string; resolution?: string }
export type BoardStatus = 'identificada' | 'em_tratativa' | 'resolvida';
export interface Restriction extends RecordBase { wagonId: Id; activityId?: Id; description: string; responsibleId: Id; dueDate: LocalDate; status: 'open' | 'resolved'; blocksExecution: boolean; blocksTerminality: boolean; resolvedAt?: string; resolution?: string; boardStatus: BoardStatus }
export interface Release extends RecordBase { wagonId: Id; predecessorId?: Id; type: 'initial' | 'normal' | 'exceptional'; justification?: string; authorizedBy: Id; regularizationResponsibleId?: Id; dueDate?: LocalDate; releasedAt: string; acceptedPendingIds: Id[]; acknowledgedDebtIds: Id[] }
export interface TerminalityDebt extends RecordBase { pendingItemId: Id; releaseId: Id; responsibleId: Id; dueDate: LocalDate }
/** Compromisso semanal do Last Planner. `weekStart` é sempre a segunda-feira da semana,
 * para o PPC agrupar por semanas canônicas. `fulfilled` indefinido = ainda não apurado. */
export interface WeeklyCommitment extends RecordBase { activityId: Id; weekStart: LocalDate; weekEnd: LocalDate; responsibleId: Id; targetProgress: number; fulfilled?: boolean; cause?: string; recordedAt?: string; recordedBy?: Id }
/** Cópia imutável das datas planejadas de uma obra num momento. Reprogramar o
 * planejamento atual nunca altera uma linha de base já salva. */
export interface BaselineWagon { id: Id; number: number; plannedStart: LocalDate; plannedEnd: LocalDate }
export interface BaselineActivity { id: Id; wagonId: Id; name: string; locationId: Id; plannedStart: LocalDate; plannedEnd: LocalDate; weight: number }
export interface Baseline extends RecordBase { workId: Id; name: string; createdBy: Id; wagons: BaselineWagon[]; activities: BaselineActivity[] }
/** Modelo IFC da obra. O arquivo vive no Storage; cada envio cria uma versão nova e
 * as anteriores nunca são apagadas. */
export interface IfcModel extends RecordBase { workId: Id; name: string; discipline: string }
export interface IfcModelVersion extends RecordBase { modelId: Id; version: number; fileName: string; fileSize: number; storagePath: string; uploadedBy: Id; storeys: string[]; elementCount: number }
/** Regra de vínculo entre elementos IFC e um serviço (nome de atividade). As regras são
 * persistidas; o vínculo elemento a elemento é resolvido na visualização, nunca gravado —
 * seriam dezenas de milhares de linhas num snapshot que trafega inteiro a cada comando. */
export type LinkRuleProperty = 'pavimento' | 'tipo';
export interface LinkRuleCriterion { property: LinkRuleProperty; operator: 'igual' | 'contem'; value: string }
export interface LinkRule extends RecordBase { workId: Id; order: number; serviceName: string; criteria: LinkRuleCriterion[] }
export interface User extends RecordBase { name: string; role: 'viewer' | 'planner' | 'manager' | 'admin'; workIds: Id[] }
export interface HistoryEvent { id: Id; entityId: Id; entityType: string; action: string; authorId: Id; occurredAt: string; changes: Record<string, unknown> }
export interface PlanningData { works: Work[]; locations: Location[]; sequences: ProductionSequence[]; wagons: Wagon[]; activities: Activity[]; criteria: TerminalityCriterion[]; pendingItems: PendingItem[]; restrictions: Restriction[]; releases: Release[]; debts: TerminalityDebt[]; teams: Team[]; progressEntries: ProgressEntry[]; commitments: WeeklyCommitment[]; baselines: Baseline[]; ifcModels: IfcModel[]; ifcVersions: IfcModelVersion[]; linkRules: LinkRule[]; users: User[]; history: HistoryEvent[] }
export type WagonStatus = 'not_started' | 'in_production' | 'restricted' | 'terminal';

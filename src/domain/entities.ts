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
export interface Activity extends RecordBase { wagonId: Id; name: string; locationId: Id; responsibleId: Id; plannedStart: LocalDate; plannedEnd: LocalDate; progress: number; status: ActivityStatus; weight: number; mandatory: boolean; origin: 'manual' | 'mock' | 'prevision'; previsionExternalId?: string; teamId?: Id; notes?: string }
/** Dependência término-início entre atividades. O produto reprograma manualmente, por decisão
 * de escopo: a dependência serve para ler a rede e apontar incoerência, nunca para mover datas. */
export interface ActivityDependency extends RecordBase { predecessorId: Id; successorId: Id }

/** Plano mensal de médio prazo: a folha que o planejador preenche para o mês, que nasce vazia.
 * Um plano por mês por obra. A linha de base é o próprio plano congelado — `baselineOf` aponta
 * para o plano de origem e `frozenAt` marca o congelamento; plano congelado não aceita edição,
 * e por isso pode ser aberto no mesmo cronograma para comparar com o vivo. */
export interface MediumTermPlan extends RecordBase { workId: Id; month: string; name: string; baselineOf?: Id; frozenAt?: string; createdBy: Id }
/** Linha do plano mensal. Escrita à mão; `activityId` liga ao longo prazo quando faz sentido,
 * sem obrigar — é o rastro entre o mês detalhado e o serviço macro. */
/** Tarefa do plano do mês. `level` é o recuo, como no MS Project: o pai de uma linha é a linha
 * anterior mais próxima com nível menor. Linha com filhos é resumo — início, término e avanço
 * dela são os dos filhos, calculados na leitura (`rollUp`), e não os valores guardados aqui. */
export interface PlanTask extends RecordBase { planId: Id; name: string; plannedStart: LocalDate; plannedEnd: LocalDate; teamId?: Id; activityId?: Id; notes?: string; progress: number; order: number; level: number }
/** Dependência término-início entre linhas do plano mensal. */
export interface PlanDependency extends RecordBase { predecessorId: Id; successorId: Id }
/** Equipe executora, o cadastro que o cronograma usa como recurso e a planilha semanal usa
 * nas colunas Empresa e Equipe. Capacidade em atividades simultâneas por semana. */
export interface Team extends RecordBase { workId: Id; company: string; name: string; weeklyCapacity: number }
/** Lançamento datado de percentual executado. `Activity.progress` guarda só o valor atual;
 * a série histórica vive aqui, para comparar planejado e realizado ao longo do tempo. */
export interface ProgressEntry extends RecordBase { activityId: Id; recordedDate: LocalDate; progress: number; recordedBy: Id }
export interface TerminalityCriterion extends RecordBase { activityId: Id; description: string; mandatory: boolean; fulfilled: boolean; confirmedAt?: string; confirmedBy?: Id }
export interface PendingItem extends RecordBase { wagonId: Id; activityId?: Id; description: string; responsibleId: Id; dueDate: LocalDate; status: 'open' | 'resolved'; blocksTerminality: boolean; resolvedAt?: string; resolution?: string }
export type BoardStatus = 'identificada' | 'em_tratativa' | 'resolvida';
/** `leadTimeDays` é o prazo de obtenção da pendência. Quando informado junto da atividade,
 * o limite de resolução deixa de ser digitado e passa a sair do início previsto dela. */
export interface Restriction extends RecordBase { wagonId: Id; activityId?: Id; description: string; responsibleId: Id; dueDate: LocalDate; status: 'open' | 'resolved'; blocksExecution: boolean; blocksTerminality: boolean; resolvedAt?: string; resolution?: string; boardStatus: BoardStatus; leadTimeDays?: number }
export interface Release extends RecordBase { wagonId: Id; predecessorId?: Id; type: 'initial' | 'normal' | 'exceptional'; justification?: string; authorizedBy: Id; regularizationResponsibleId?: Id; dueDate?: LocalDate; releasedAt: string; acceptedPendingIds: Id[]; acknowledgedDebtIds: Id[] }
export interface TerminalityDebt extends RecordBase { pendingItemId: Id; releaseId: Id; responsibleId: Id; dueDate: LocalDate }
/** Causas de não cumprimento usadas na análise do PPC. Lista fechada, como na planilha que
 * este módulo substitui — "Falha de Equipamento" (quebrou) e "Falta de equipamento" (não
 * havia) são causas diferentes de propósito. */
export const NON_FULFILLMENT_CAUSES = [
  'Atraso de tarefas antecedentes', 'Baixa Produtividade', 'Falha de comunicação',
  'Falha de definição de projeto', 'Falha de Equipamento', 'Falha de Gestão do Empreiteiro',
  'Falha de Planejamento', 'Falta de equipamento', 'Falta de Mão de Obra', 'Falta de Material',
  'Intempéries', 'Mudança de prioridade', 'Problemas não previstos na execução', 'Retrabalho',
  'Superestimação da produtividade', 'Demanda extra', 'Falta de documentação',
] as const;
export type NonFulfillmentCause = (typeof NON_FULFILLMENT_CAUSES)[number];
/** Compromisso semanal do Last Planner, na forma da planilha de produção: empresa e equipe (do
 * cadastro), período dentro da semana e os dias marcados. A semana é montada do zero: `name` é
 * escrito à mão, porque a planilha real mistura frentes de obra com tarefas de engenharia
 * ("Diário de obra", "GFIP", "Visita"), que não existem no cronograma. `activityId` liga a uma
 * atividade quando faz sentido, sem obrigar. `weekStart` é sempre a segunda-feira, para o PPC
 * agrupar por semanas canônicas, e `fulfilled` indefinido = ainda não apurado.
 * `weekdays` usa 1 (segunda) a 6 (sábado). */
/** Linha da planilha da semana. Ela se sustenta sozinha: o fornecedor é texto escrito na própria
 * linha e a equipe é opcional, porque na obra a semana é preenchida direto, sem depender de
 * cadastro feito em outra tela. O calendário de segunda a sábado não é guardado — ele se preenche
 * a partir de `startDate` e `endDate`, que é o que o engenheiro digita. */
export interface WeeklyCommitment extends RecordBase { workId: Id; name: string; supplier: string; activityId?: Id; weekStart: LocalDate; weekEnd: LocalDate; responsibleId: Id; teamId?: Id; startDate: LocalDate; endDate: LocalDate; fulfilled?: boolean; cause?: NonFulfillmentCause; justification?: string; recordedAt?: string; recordedBy?: Id }
/** Cópia imutável das datas planejadas de uma obra num momento. Reprogramar o
 * planejamento atual nunca altera uma linha de base já salva. */
export interface BaselineWagon { id: Id; number: number; plannedStart: LocalDate; plannedEnd: LocalDate }
export interface BaselineActivity { id: Id; wagonId: Id; name: string; locationId: Id; plannedStart: LocalDate; plannedEnd: LocalDate; weight: number }
export interface Baseline extends RecordBase { workId: Id; name: string; createdBy: Id; wagons: BaselineWagon[]; activities: BaselineActivity[] }
/** Modelo IFC da obra. O arquivo vive no Storage; cada envio cria uma versão nova e
 * as anteriores nunca são apagadas. */
export interface IfcModel extends RecordBase { workId: Id; name: string; discipline: string }
/** `storagePath` é opcional de propósito: o IFC é uma base de dados, e o que o planejamento
 * consome são as tabelas transcritas dele. Guardar o arquivo é o que permite abrir o modelo em
 * 3D, mas esbarra no limite por arquivo do Storage — sem ele a versão continua válida, só não
 * abre no visualizador. */
export interface IfcModelVersion extends RecordBase { modelId: Id; version: number; fileName: string; fileSize: number; storagePath?: string; uploadedBy: Id; storeys: string[]; elementCount: number }
/** Regra de vínculo entre elementos IFC e um serviço (nome de atividade). As regras são
 * persistidas; o vínculo elemento a elemento é resolvido na visualização, nunca gravado —
 * seriam dezenas de milhares de linhas num snapshot que trafega inteiro a cada comando. */
export type LinkRuleProperty = 'pavimento' | 'tipo';
export interface LinkRuleCriterion { property: LinkRuleProperty; operator: 'igual' | 'contem'; value: string }
export interface LinkRule extends RecordBase { workId: Id; order: number; serviceName: string; criteria: LinkRuleCriterion[] }
export interface User extends RecordBase { name: string; role: 'viewer' | 'planner' | 'manager' | 'admin'; workIds: Id[] }
export interface HistoryEvent { id: Id; entityId: Id; entityType: string; action: string; authorId: Id; occurredAt: string; changes: Record<string, unknown> }
export interface PlanningData { works: Work[]; locations: Location[]; sequences: ProductionSequence[]; wagons: Wagon[]; activities: Activity[]; criteria: TerminalityCriterion[]; pendingItems: PendingItem[]; restrictions: Restriction[]; releases: Release[]; debts: TerminalityDebt[]; teams: Team[]; progressEntries: ProgressEntry[]; commitments: WeeklyCommitment[]; baselines: Baseline[]; dependencies: ActivityDependency[]; plans: MediumTermPlan[]; planTasks: PlanTask[]; planDependencies: PlanDependency[]; ifcModels: IfcModel[]; ifcVersions: IfcModelVersion[]; linkRules: LinkRule[]; users: User[]; history: HistoryEvent[] }
export type WagonStatus = 'not_started' | 'in_production' | 'restricted' | 'terminal';

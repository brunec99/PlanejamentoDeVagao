import type { Activity, BoardStatus, LinkRuleCriterion, NonFulfillmentCause, PlanningData, RecordBase, Restriction, Wagon } from '../../domain/entities';
import { NON_FULFILLMENT_CAUSES } from '../../domain/entities';
import { isTerminal, leadTimeDeadline, validateActivity, validateSequence } from '../../domain/rules';
import { planSequenceRegeneration } from './regenerate-sequence';
import { addDays, periodDays, requireText, startOfWeek, validateDate, validatePeriod } from '../../domain/validation';
export type ActivityInput = Pick<Activity, 'name' | 'locationId' | 'responsibleId' | 'plannedStart' | 'plannedEnd' | 'weight' | 'mandatory'>;
export type Command =
  | { type: 'create_work'; name: string; code: string; previsionProjectId?: string }
  | { type: 'create_sequence'; workId: string; name: string; taktDays: number; calendar: 'calendar_days' | 'business_days' }
  | { type: 'create_wagon'; sequenceId: string; number: number; predecessorId?: string; plannedStart: string; plannedEnd: string; responsibleId: string }
  | { type: 'edit_wagon'; wagonId: string; plannedStart: string; plannedEnd: string; responsibleId: string }
  | { type: 'create_location'; workId: string; name: string }
  | { type: 'create_activity'; wagonId: string; activity: ActivityInput; reason?: string }
  | { type: 'update_activity'; activityId: string; activity: ActivityInput; progress: number; status: Activity['status']; reason?: string }
  | { type: 'create_criterion'; activityId: string; description: string; mandatory: boolean; reason?: string }
  | { type: 'set_criterion'; criterionId: string; fulfilled: boolean; reason?: string }
  | { type: 'create_pending'; wagonId: string; activityId?: string; description: string; responsibleId: string; dueDate: string; blocksTerminality: boolean; reason?: string }
  | { type: 'resolve_pending'; pendingId: string; resolution: string }
  | { type: 'create_restriction'; wagonId: string; activityId?: string; description: string; responsibleId: string; dueDate: string; blocksExecution: boolean; blocksTerminality: boolean; leadTimeDays?: number; reason?: string }
  | { type: 'resolve_restriction'; restrictionId: string; resolution: string }
  | { type: 'release'; wagonId: string; mode: 'initial' | 'normal' | 'exceptional'; justification?: string; responsibleId?: string; dueDate?: string }
  | { type: 'import_activities'; wagonId: string; projectId: string; responsibleId: string; rows: ImportedActivity[]; reason?: string }
  | { type: 'grant_access'; userId: string; workId: string }
  | { type: 'revoke_access'; userId: string; workId: string }
  | { type: 'set_role'; userId: string; role: 'viewer' | 'planner' | 'manager' | 'admin' }
  | { type: 'create_team'; workId: string; company: string; name: string; weeklyCapacity: number }
  | { type: 'delete_team'; teamId: string }
  | { type: 'assign_team'; activityId: string; teamId: string | null }
  | { type: 'record_progress'; activityId: string; progress: number; reason?: string }
  | { type: 'create_commitment'; workId: string; name: string; activityId?: string | null; weekStart: string; responsibleId: string; teamId: string; startDate: string; endDate: string; weekdays: number[] }
  | { type: 'delete_commitment'; commitmentId: string }
  | { type: 'record_fulfillment'; commitmentId: string; fulfilled: boolean; cause?: string; justification?: string }
  | { type: 'create_baseline'; workId: string; name: string }
  | { type: 'move_restriction'; restrictionId: string; boardStatus: Exclude<BoardStatus, 'resolvida'> }
  | { type: 'create_plan'; workId: string; month: string; name?: string }
  | { type: 'delete_plan'; planId: string }
  | { type: 'freeze_plan_baseline'; planId: string; name: string }
  | { type: 'create_plan_task'; planId: string; name: string; plannedStart: string; plannedEnd: string; teamId?: string | null; activityId?: string | null }
  | { type: 'update_plan_task'; taskId: string; name: string; plannedStart: string; plannedEnd: string; teamId?: string | null; activityId?: string | null; progress: number }
  | { type: 'delete_plan_task'; taskId: string }
  | { type: 'set_plan_task_note'; taskId: string; note: string }
  | { type: 'link_plan_tasks'; predecessorId: string; successorId: string }
  | { type: 'unlink_plan_tasks'; dependencyId: string }
  | { type: 'link_activities'; predecessorId: string; successorId: string }
  | { type: 'unlink_activities'; dependencyId: string }
  | { type: 'set_activity_note'; activityId: string; note: string }
  | { type: 'create_ifc_model'; workId: string; name: string; discipline: string }
  | { type: 'add_ifc_version'; modelId: string; fileName: string; fileSize: number; storagePath: string; storeys: string[]; elementCount: number }
  | { type: 'create_link_rule'; workId: string; serviceName: string; criteria: LinkRuleCriterion[] }
  | { type: 'delete_link_rule'; ruleId: string }
  | { type: 'set_takt'; sequenceId: string; taktDays: number }
  | { type: 'set_sequence_start'; sequenceId: string; startDate: string | null }
  | { type: 'regenerate_sequence'; sequenceId: string; projectId: string; rows: ImportedActivity[]; responsibleId: string };
export interface ImportedActivity { externalId: string; name: string; location: string; plannedStart: string; plannedEnd: string; progress: number; baselineStart?: string; baselineEnd?: string; weight?: number }
export interface CommandContext { actorId: string; today: string; now: string; newId: () => string }

function wagonFor(data: PlanningData, id: string): Wagon {
  const wagon = data.wagons.find(w => w.id === id);
  if (!wagon) throw new Error('Vagão não encontrado.');
  return wagon;
}
export function ancestors(data: PlanningData, wagon: Wagon): Wagon[] {
  const result: Wagon[] = []; const visited = new Set([wagon.id]); let id = wagon.predecessorId;
  while (id) {
    if (visited.has(id)) throw new Error('Ciclo na sequência.');
    visited.add(id); const previous = wagonFor(data, id);
    if (previous.sequenceId !== wagon.sequenceId) throw new Error('Vínculo inválido.');
    result.push(previous); id = previous.predecessorId;
  }
  return result;
}
export function assessRelease(data: PlanningData, wagonId: string) {
  const wagon = wagonFor(data, wagonId);
  const previous = wagon.predecessorId ? wagonFor(data, wagon.predecessorId) : undefined;
  const priorIds = new Set(ancestors(data, wagon).map(w => w.id));
  const pending = data.pendingItems.filter(p => priorIds.has(p.wagonId) && p.status === 'open');
  const debts = data.debts.filter(d => pending.some(p => p.id === d.pendingItemId));
  const restrictions = data.restrictions.filter(r => priorIds.has(r.wagonId) && r.status === 'open' && (r.blocksExecution || r.blocksTerminality));
  const uncovered: string[] = [];
  for (const prior of ancestors(data, wagon)) {
    const all = data.activities.filter(a => a.wagonId === prior.id);
    if (!all.some(a => a.mandatory)) uncovered.push(`${prior.number}: nenhuma atividade obrigatória cadastrada`);
    for (const a of all) {
      const incomplete = (a.mandatory && (a.progress < 100 || a.status !== 'completed')) || data.criteria.some(c => c.activityId === a.id && c.mandatory && !c.fulfilled);
      if (incomplete && !pending.some(p => p.wagonId === prior.id && (!p.activityId || p.activityId === a.id))) uncovered.push(a.name);
    }
  }
  return { previous, pending, debts, restrictions, uncovered, normal: !!previous && isTerminal(previous.id, data) && pending.length === 0 && debts.length === 0 && restrictions.length === 0 && uncovered.length === 0 };
}

/** Mutates an isolated transaction draft only. Exceptions discard every change. */
export function applyCommand(data: PlanningData, command: Command, context: CommandContext): string {
  const { actorId, today, now, newId } = context;
  validateDate(today);
  const actor = data.users.find(u => u.id === actorId);
  if (!actor || actor.role === 'viewer') throw new Error('Seu perfil permite apenas consulta.');
  const base = (): RecordBase => ({ id: newId(), createdAt: now, updatedAt: now });
  const checkWork = (workId: string) => {
    if (!data.works.some(w => w.id === workId) || !actor.workIds.includes(workId)) throw new Error('Você não tem acesso a esta obra.');
  };
  const workOf = (wagon: Wagon) => { const sequence = data.sequences.find(s => s.id === wagon.sequenceId); if (!sequence) throw new Error('Sequência não encontrada.'); checkWork(sequence.workId); return sequence.workId; };
  const responsible = (id: string, workId: string) => { if (!data.users.some(u => u.id === id && u.workIds.includes(workId))) throw new Error('Responsável deve pertencer à obra.'); };
  const ensureExecution = (wagon: Wagon, activityId?: string) => {
    if (!data.releases.some(r => r.wagonId === wagon.id)) throw new Error('Libere o vagão antes de registrar execução.');
    if (data.restrictions.some(r => r.wagonId === wagon.id && r.status === 'open' && r.blocksExecution && (!r.activityId || !activityId || r.activityId === activityId))) throw new Error('Resolva a restrição de execução antes de avançar.');
  };
  const checkActivity = (input: ActivityInput, wagon: Wagon) => {
    const workId = workOf(wagon); responsible(input.responsibleId, workId);
    requireText(input.name, 'Nome da atividade'); validatePeriod(input.plannedStart, input.plannedEnd);
    if (input.plannedStart < wagon.plannedStart || input.plannedEnd > wagon.plannedEnd) throw new Error('A previsão da atividade deve estar dentro do período do vagão.');
    if (!data.locations.some(l => l.id === input.locationId && l.workId === workId)) throw new Error('Local deve pertencer à obra.');
    if (!Number.isFinite(input.weight) || input.weight <= 0) throw new Error('Peso deve ser positivo.');
  };
  const checkReopen = (wagon: Wagon, reason?: string) => { if (isTerminal(wagon.id, data)) { if (actor.role !== 'manager') throw new Error('Somente gestor pode reabrir um vagão terminal.'); requireText(reason ?? '', 'Justificativa de reabertura'); } };
  const touch = (record: RecordBase) => { record.updatedAt = now; };
  const planFor = (id: string) => { const plan = data.plans.find(p => p.id === id); if (!plan) throw new Error('Plano não encontrado.'); return plan; };
  const taskFor = (id: string) => { const task = data.planTasks.find(t => t.id === id); if (!task) throw new Error('Linha do plano não encontrada.'); return task; };
  let entityId = ''; let wagonId: string | undefined;
  const beforeTerminal = new Set(data.wagons.filter(w => isTerminal(w.id, data)).map(w => w.id));
  switch (command.type) {
    case 'create_work': {
      if (actor.role !== 'manager') throw new Error('Somente gestor pode cadastrar obras.');
      const code = requireText(command.code, 'Código');
      if (data.works.some(w => w.code.toLowerCase() === code.toLowerCase())) throw new Error('Código de obra já utilizado.');
      if (command.previsionProjectId && (!/^\d+$/.test(command.previsionProjectId) || data.works.some(w => w.previsionProjectId === command.previsionProjectId))) throw new Error('Projeto Prevision inválido ou já vinculado.');
      const work = { ...base(), name: requireText(command.name, 'Nome'), code, description: '', active: true, previsionProjectId: command.previsionProjectId };
      data.works.push(work); actor.workIds.push(work.id); entityId = work.id; break;
    }
    case 'create_sequence': {
      checkWork(command.workId); requireText(command.name, 'Nome');
      if (!Number.isInteger(command.taktDays) || command.taktDays <= 0 || command.taktDays > 365) throw new Error('Takt deve ter entre 1 e 365 dias.');
      const sequence = { ...base(), workId: command.workId, name: command.name.trim(), defaultTaktDays: command.taktDays, calendar: command.calendar };
      data.sequences.push(sequence); entityId = sequence.id; break;
    }
    case 'create_location': {
      checkWork(command.workId); const name = requireText(command.name, 'Local');
      if (data.locations.some(l => l.workId === command.workId && l.name.toLowerCase() === name.toLowerCase())) throw new Error('Local já cadastrado.');
      const location = { ...base(), workId: command.workId, name, code: '' }; data.locations.push(location); entityId = location.id; break;
    }
    case 'create_wagon': {
      const sequence = data.sequences.find(s => s.id === command.sequenceId); if (!sequence) throw new Error('Sequência não encontrada.');
      checkWork(sequence.workId); responsible(command.responsibleId, sequence.workId); validatePeriod(command.plannedStart, command.plannedEnd);
      if (!Number.isInteger(command.number) || command.number <= 0) throw new Error('Número deve ser inteiro positivo.');
      const existing = data.wagons.filter(w => w.sequenceId === sequence.id);
      if (existing.length > 0 && !command.predecessorId) throw new Error('Selecione o último vagão como predecessor.');
      const previous = command.predecessorId ? wagonFor(data, command.predecessorId) : undefined;
      if (previous && (previous.sequenceId !== sequence.id || previous.plannedEnd >= command.plannedStart)) throw new Error('O período deve começar após o predecessor da mesma sequência.');
      const taktDays = periodDays(command.plannedStart, command.plannedEnd, sequence.calendar === 'business_days');
      if (!taktDays) throw new Error('O período precisa conter dias de produção.');
      const wagon = { ...base(), sequenceId: sequence.id, number: command.number, predecessorId: command.predecessorId, plannedStart: command.plannedStart, plannedEnd: command.plannedEnd, taktDays, responsibleIds: [command.responsibleId] };
      data.wagons.push(wagon); validateSequence(data.wagons); entityId = wagon.id; wagonId = wagon.id; break;
    }
    case 'edit_wagon': {
      const wagon = wagonFor(data, command.wagonId); const workId = workOf(wagon);
      if (wagon.actualStart || data.releases.some(r => r.wagonId === wagon.id)) throw new Error('Só é possível replanejar vagões ainda não liberados.');
      responsible(command.responsibleId, workId); validatePeriod(command.plannedStart, command.plannedEnd);
      if (data.activities.some(a => a.wagonId === wagon.id && (a.plannedStart < command.plannedStart || a.plannedEnd > command.plannedEnd))) throw new Error('O novo período deve conter todas as atividades.');
      const previous = data.wagons.find(w => w.id === wagon.predecessorId); const next = data.wagons.find(w => w.predecessorId === wagon.id);
      if ((previous && previous.plannedEnd >= command.plannedStart) || (next && next.plannedStart <= command.plannedEnd)) throw new Error('O período não pode sobrepor seus vizinhos.');
      const seq = data.sequences.find(s => s.id === wagon.sequenceId)!;
      const taktDays = periodDays(command.plannedStart, command.plannedEnd, seq.calendar === 'business_days');
      if (!taktDays) throw new Error('O período precisa conter dias de produção.');
      Object.assign(wagon, { plannedStart: command.plannedStart, plannedEnd: command.plannedEnd, taktDays, responsibleIds: [command.responsibleId] }); touch(wagon); entityId = wagon.id; wagonId = wagon.id; break;
    }
    case 'create_activity': {
      const wagon = wagonFor(data, command.wagonId); checkActivity(command.activity, wagon); checkReopen(wagon, command.reason);
      const activity: Activity = { ...base(), ...command.activity, name: command.activity.name.trim(), wagonId: wagon.id, progress: 0, status: 'not_started', origin: 'manual' };
      data.activities.push(activity); entityId = activity.id; wagonId = wagon.id; break;
    }
    case 'update_activity': {
      const activity = data.activities.find(a => a.id === command.activityId); if (!activity) throw new Error('Atividade não encontrada.');
      const wagon = wagonFor(data, activity.wagonId); checkActivity(command.activity, wagon);
      const next = { ...activity, ...command.activity, progress: command.progress, status: command.status }; validateActivity(next);
      if (command.progress > activity.progress || (command.status === 'completed' && activity.status !== 'completed')) ensureExecution(wagon, activity.id);
      if (command.status !== 'not_started' && activity.status === 'not_started') ensureExecution(wagon, activity.id);
      if (command.status === 'not_started' && command.progress !== 0) throw new Error('Atividade não iniciada deve ter progresso zero.');
      if (isTerminal(wagon.id, data)) checkReopen(wagon, command.reason);
      if (command.progress < activity.progress || (activity.status === 'completed' && command.status !== 'completed')) requireText(command.reason ?? '', 'Justificativa da correção');
      // Atividade fatiada entre vagões (id termina em "#N"): mexer no peso de uma fatia
      // subtrai a diferença da fatia seguinte, para as partes continuarem somando o peso
      // original da atividade inteira em vez de inflar o progresso ponderado do vagão.
      const weightDelta = next.weight - activity.weight;
      const sliceMatch = activity.previsionExternalId?.match(/^(.+)#(\d+)$/);
      if (weightDelta !== 0 && sliceMatch) {
        const [, base, index] = sliceMatch;
        const sibling = data.activities.find(a => a.previsionExternalId === `${base}#${Number(index) + 1}`);
        if (sibling) {
          const siblingWeight = sibling.weight - weightDelta;
          if (siblingWeight <= 0) throw new Error(`Esse ajuste zeraria o peso da fatia seguinte (${sibling.name}). Reduza menos.`);
          sibling.weight = Math.round(siblingWeight * 100) / 100; touch(sibling);
        }
      }
      Object.assign(activity, next); touch(activity);
      if ((activity.progress > 0 || activity.status !== 'not_started') && !wagon.actualStart) { wagon.actualStart = today; touch(wagon); }
      entityId = activity.id; wagonId = wagon.id; break;
    }
    case 'create_criterion': {
      const activity = data.activities.find(a => a.id === command.activityId); if (!activity) throw new Error('Atividade não encontrada.');
      const wagon = wagonFor(data, activity.wagonId); workOf(wagon); checkReopen(wagon, command.reason);
      const criterion = { ...base(), activityId: activity.id, description: requireText(command.description, 'Critério'), mandatory: command.mandatory, fulfilled: false };
      data.criteria.push(criterion); entityId = criterion.id; wagonId = wagon.id; break;
    }
    case 'set_criterion': {
      const criterion = data.criteria.find(c => c.id === command.criterionId); if (!criterion) throw new Error('Critério não encontrado.');
      const activity = data.activities.find(a => a.id === criterion.activityId)!; const wagon = wagonFor(data, activity.wagonId); workOf(wagon);
      if (!command.fulfilled) checkReopen(wagon, command.reason); else ensureExecution(wagon, activity.id);
      criterion.fulfilled = command.fulfilled; criterion.confirmedAt = command.fulfilled ? now : undefined; criterion.confirmedBy = command.fulfilled ? actorId : undefined; touch(criterion); entityId = criterion.id; wagonId = wagon.id; break;
    }
    case 'create_pending': case 'create_restriction': {
      const wagon = wagonFor(data, command.wagonId); const workId = workOf(wagon); checkReopen(wagon, command.reason); responsible(command.responsibleId, workId);
      const activity = command.activityId ? data.activities.find(a => a.id === command.activityId && a.wagonId === wagon.id) : undefined;
      if (command.activityId && !activity) throw new Error('Atividade não pertence ao vagão.');
      const leadTimeDays = command.type === 'create_restriction' ? command.leadTimeDays : undefined;
      let dueDate = command.dueDate;
      if (leadTimeDays !== undefined) {
        if (!activity) throw new Error('Vincule a pendência a uma atividade para calcular o limite pelo lead time.');
        if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0) throw new Error('Lead time deve ser um número inteiro de dias, zero ou mais.');
        dueDate = leadTimeDeadline(activity.plannedStart, leadTimeDays);
      }
      validateDate(dueDate);
      const record = { ...base(), wagonId: wagon.id, activityId: command.activityId, description: requireText(command.description, 'Descrição'), responsibleId: command.responsibleId, dueDate, blocksTerminality: command.blocksTerminality, status: 'open' as const };
      if (command.type === 'create_pending') data.pendingItems.push(record); else data.restrictions.push({ ...record, blocksExecution: command.blocksExecution, boardStatus: 'identificada', leadTimeDays });
      entityId = record.id; wagonId = wagon.id; break;
    }
    case 'resolve_pending': case 'resolve_restriction': {
      const record = command.type === 'resolve_pending' ? data.pendingItems.find(p => p.id === command.pendingId) : data.restrictions.find(r => r.id === command.restrictionId);
      if (!record) throw new Error('Registro não encontrado.');
      const wagon = wagonFor(data, record.wagonId); workOf(wagon);
      if (record.status === 'resolved') throw new Error('Registro já resolvido.');
      requireText(command.resolution, 'Descrição da resolução');
      record.status = 'resolved'; Object.assign(record, { resolution: command.resolution.trim(), resolvedAt: now });
      if (command.type === 'resolve_restriction') (record as Restriction).boardStatus = 'resolvida';
      touch(record); entityId = record.id; wagonId = wagon.id; break;
    }
    case 'release': {
      const wagon = wagonFor(data, command.wagonId); const workId = workOf(wagon);
      if (data.releases.some(r => r.wagonId === wagon.id)) throw new Error('Vagão já liberado.');
      const assessment = assessRelease(data, wagon.id);
      if (command.mode === 'initial' && wagon.predecessorId) throw new Error('Liberação inicial só vale para o primeiro vagão.');
      if (command.mode !== 'initial' && !wagon.predecessorId) throw new Error('Utilize liberação inicial.');
      if (assessment.restrictions.length) throw new Error('Resolva as restrições impeditivas dos antecessores.');
      if (command.mode === 'normal' && !assessment.normal) throw new Error('Liberação normal exige predecessor terminal e nenhuma dívida ou pendência herdada.');
      if (command.mode === 'exceptional') {
        if (actor.role !== 'manager') throw new Error('Somente gestor pode liberar excepcionalmente.');
        requireText(command.justification ?? '', 'Justificativa'); responsible(command.responsibleId ?? '', workId); validateDate(command.dueDate ?? '');
        if (command.dueDate! <= today) throw new Error('O prazo de regularização deve ser futuro.');
        if (assessment.uncovered.length) throw new Error('Registre pendências para todas as condições não atendidas: ' + assessment.uncovered.join(', '));
        if (!assessment.pending.length) throw new Error('Sem pendências: utilize a liberação normal.');
      }
      const release = { ...base(), wagonId: wagon.id, predecessorId: wagon.predecessorId, type: command.mode, authorizedBy: actorId, releasedAt: now, justification: command.mode === 'exceptional' ? command.justification!.trim() : undefined, regularizationResponsibleId: command.mode === 'exceptional' ? command.responsibleId : undefined, dueDate: command.mode === 'exceptional' ? command.dueDate : undefined, acceptedPendingIds: command.mode === 'exceptional' ? assessment.pending.map(p => p.id) : [], acknowledgedDebtIds: assessment.debts.map(d => d.id) };
      data.releases.push(release);
      if (command.mode === 'exceptional') for (const pending of assessment.pending) {
        if (!data.debts.some(d => d.pendingItemId === pending.id)) data.debts.push({ ...base(), pendingItemId: pending.id, releaseId: release.id, responsibleId: command.responsibleId!, dueDate: command.dueDate! });
      }
      entityId = release.id; wagonId = wagon.id; break;
    }
    case 'import_activities': {
      const wagon = wagonFor(data, command.wagonId); const workId = workOf(wagon); responsible(command.responsibleId, workId); checkReopen(wagon, command.reason);
      if (!/^\d+$/.test(command.projectId)) throw new Error('Projeto Prevision inválido.');
      const work = data.works.find(w => w.id === workId)!;
      if ((work.previsionProjectId && work.previsionProjectId !== command.projectId) || data.works.some(w => w.id !== workId && w.previsionProjectId === command.projectId)) throw new Error('A obra selecionada não corresponde ao vínculo com este projeto Prevision.');
      if (!command.rows.length) throw new Error('Selecione ao menos uma atividade.');
      work.previsionProjectId = command.projectId; touch(work);
      for (const row of command.rows) {
        const externalId = `${command.projectId}:${row.externalId}`;
        if (data.activities.some(a => a.previsionExternalId === externalId)) throw new Error(`Atividade ${row.name} já importada. Nenhuma alteração foi aplicada.`);
        validatePeriod(row.plannedStart, row.plannedEnd);
        if (row.plannedStart < wagon.plannedStart || row.plannedEnd > wagon.plannedEnd) throw new Error('Selecione um vagão cujo período contenha integralmente as atividades.');
        if (row.progress > 0) ensureExecution(wagon);
        const locationName = requireText(row.location, 'Local');
        let location = data.locations.find(l => l.workId === workId && l.name === locationName);
        if (!location) { location = { ...base(), workId, name: locationName, code: '' }; data.locations.push(location); }
        const activity: Activity = { ...base(), wagonId: wagon.id, name: requireText(row.name, 'Atividade'), locationId: location.id, responsibleId: command.responsibleId, plannedStart: row.plannedStart, plannedEnd: row.plannedEnd, progress: row.progress, status: row.progress === 100 ? 'completed' : row.progress > 0 ? 'in_progress' : 'not_started', weight: typeof row.weight === 'number' && row.weight > 0 ? row.weight : 1, mandatory: true, origin: 'prevision', previsionExternalId: externalId };
        validateActivity(activity); data.activities.push(activity);
        // External completion never implies locally accepted terminality.
        data.criteria.push({ ...base(), activityId: activity.id, description: 'Conferência local da atividade importada', mandatory: true, fulfilled: false });
        if (row.progress > 0 && !wagon.actualStart) { wagon.actualStart = today; touch(wagon); }
      }
      entityId = wagon.id; wagonId = wagon.id; break;
    }
    case 'create_team': {
      checkWork(command.workId); const name = requireText(command.name, 'Nome da equipe');
      const company = requireText(command.company, 'Empresa');
      if (!Number.isInteger(command.weeklyCapacity) || command.weeklyCapacity <= 0) throw new Error('Capacidade deve ser um número inteiro positivo de atividades por semana.');
      if (data.teams.some(t => t.workId === command.workId && t.name.toLowerCase() === name.toLowerCase() && t.company.toLowerCase() === company.toLowerCase())) throw new Error('Equipe já cadastrada nesta obra para esta empresa.');
      const team = { ...base(), workId: command.workId, company, name, weeklyCapacity: command.weeklyCapacity };
      data.teams.push(team); entityId = team.id; break;
    }
    case 'delete_team': {
      const team = data.teams.find(t => t.id === command.teamId); if (!team) throw new Error('Equipe não encontrada.');
      checkWork(team.workId);
      // Apagar a equipe deixaria atividade e compromisso apontando para o vazio.
      if (data.activities.some(a => a.teamId === team.id)) throw new Error('Esta equipe está atribuída a atividades. Troque o recurso delas antes de excluir.');
      if (data.commitments.some(c => c.teamId === team.id)) throw new Error('Esta equipe tem compromissos na planilha semanal. Exclua as linhas antes de excluir a equipe.');
      data.teams = data.teams.filter(t => t.id !== team.id); entityId = team.id; break;
    }
    case 'assign_team': {
      const activity = data.activities.find(a => a.id === command.activityId); if (!activity) throw new Error('Atividade não encontrada.');
      const wagon = wagonFor(data, activity.wagonId); const workId = workOf(wagon);
      if (command.teamId && !data.teams.some(t => t.id === command.teamId && t.workId === workId)) throw new Error('Equipe deve pertencer à obra.');
      activity.teamId = command.teamId ?? undefined; touch(activity); entityId = activity.id; wagonId = wagon.id; break;
    }
    case 'record_progress': {
      const activity = data.activities.find(a => a.id === command.activityId); if (!activity) throw new Error('Atividade não encontrada.');
      const wagon = wagonFor(data, activity.wagonId); workOf(wagon);
      if (!Number.isFinite(command.progress) || command.progress < 0 || command.progress > 100) throw new Error('Progresso deve ficar entre 0 e 100.');
      if (command.progress > activity.progress) ensureExecution(wagon, activity.id);
      if (command.progress < activity.progress) requireText(command.reason ?? '', 'Justificativa da correção');
      if (command.progress < 100 && isTerminal(wagon.id, data)) checkReopen(wagon, command.reason);
      const status = command.progress === 100 ? 'completed' as const : command.progress > 0 ? 'in_progress' as const : 'not_started' as const;
      Object.assign(activity, { progress: command.progress, status }); validateActivity(activity); touch(activity);
      // O escalar da atividade é só o valor corrente; a série datada fica em progressEntries.
      data.progressEntries.push({ ...base(), activityId: activity.id, recordedDate: today, progress: command.progress, recordedBy: actorId });
      if (activity.status !== 'not_started' && !wagon.actualStart) { wagon.actualStart = today; touch(wagon); }
      entityId = activity.id; wagonId = wagon.id; break;
    }
    case 'create_commitment': {
      // A semana é montada do zero: o nome é escrito à mão e a atividade é vínculo opcional,
      // porque a planilha real mistura frentes de obra com tarefas que não estão no cronograma.
      const workId = command.workId; checkWork(workId);
      const name = requireText(command.name, 'Atividade');
      if (command.activityId) {
        const linked = data.activities.find(a => a.id === command.activityId);
        if (!linked || workOf(wagonFor(data, linked.wagonId)) !== workId) throw new Error('A atividade vinculada deve ser da mesma obra.');
      }
      responsible(command.responsibleId, workId); validateDate(command.weekStart);
      const weekStart = startOfWeek(command.weekStart), weekEnd = addDays(weekStart, 6);
      validatePeriod(command.startDate, command.endDate);
      if (command.startDate < weekStart || command.endDate > weekEnd) throw new Error('O período do compromisso deve ficar dentro da semana.');
      const weekdays = [...new Set(command.weekdays ?? [])].sort((a, b) => a - b);
      if (!weekdays.length) throw new Error('Marque ao menos um dia da semana.');
      if (weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 6)) throw new Error('Os dias da semana vão de segunda (1) a sábado (6).');
      const team = data.teams.find(t => t.id === command.teamId && t.workId === workId);
      if (!team) throw new Error('Selecione uma equipe cadastrada nesta obra.');
      const commitment = { ...base(), workId, name, activityId: command.activityId ?? undefined, weekStart, weekEnd,
        responsibleId: command.responsibleId, teamId: team.id, startDate: command.startDate, endDate: command.endDate, weekdays };
      data.commitments.push(commitment); entityId = commitment.id; break;
    }
    case 'record_fulfillment': {
      const commitment = data.commitments.find(c => c.id === command.commitmentId); if (!commitment) throw new Error('Compromisso não encontrado.');
      checkWork(commitment.workId);
      if (typeof commitment.fulfilled === 'boolean') throw new Error('Cumprimento deste compromisso já foi registrado.');
      let cause: NonFulfillmentCause | undefined;
      if (!command.fulfilled) {
        cause = NON_FULFILLMENT_CAUSES.find(option => option === requireText(command.cause ?? '', 'Causa do não cumprimento'));
        if (!cause) throw new Error('Causa fora da lista de causas de não cumprimento.');
      }
      Object.assign(commitment, { fulfilled: command.fulfilled, cause, justification: command.justification?.trim() || undefined, recordedAt: now, recordedBy: actorId });
      touch(commitment); entityId = commitment.id; break;
    }
    case 'delete_commitment': {
      const commitment = data.commitments.find(c => c.id === command.commitmentId); if (!commitment) throw new Error('Compromisso não encontrado.');
      checkWork(commitment.workId);
      // A planilha permite apagar a linha, inclusive já apurada: é como se corrige um apontamento.
      data.commitments = data.commitments.filter(c => c.id !== commitment.id); entityId = commitment.id; break;
    }
    case 'create_baseline': {
      checkWork(command.workId); const name = requireText(command.name, 'Nome da linha de base');
      const sequenceIds = new Set(data.sequences.filter(s => s.workId === command.workId).map(s => s.id));
      const wagons = data.wagons.filter(w => sequenceIds.has(w.sequenceId));
      if (!wagons.length) throw new Error('Cadastre ao menos um vagão antes de definir a linha de base.');
      const wagonIds = new Set(wagons.map(w => w.id));
      const baseline = { ...base(), workId: command.workId, name, createdBy: actorId,
        wagons: wagons.map(w => ({ id: w.id, number: w.number, plannedStart: w.plannedStart, plannedEnd: w.plannedEnd })),
        activities: data.activities.filter(a => wagonIds.has(a.wagonId)).map(a => ({ id: a.id, wagonId: a.wagonId, name: a.name, locationId: a.locationId, plannedStart: a.plannedStart, plannedEnd: a.plannedEnd, weight: a.weight })) };
      data.baselines.push(baseline); entityId = baseline.id; break;
    }
    case 'move_restriction': {
      const restriction = data.restrictions.find(r => r.id === command.restrictionId); if (!restriction) throw new Error('Restrição não encontrada.');
      const wagon = wagonFor(data, restriction.wagonId); workOf(wagon);
      if (restriction.status === 'resolved') throw new Error('Restrição resolvida não volta ao quadro.');
      if (command.boardStatus !== 'identificada' && command.boardStatus !== 'em_tratativa') throw new Error('Coluna inválida: resolver a restrição exige registrar a resolução.');
      restriction.boardStatus = command.boardStatus; touch(restriction); entityId = restriction.id; wagonId = wagon.id; break;
    }
    case 'create_plan': {
      checkWork(command.workId);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(command.month)) throw new Error('Informe o mês no formato AAAA-MM.');
      if (data.plans.some(p => p.workId === command.workId && p.month === command.month && !p.baselineOf)) throw new Error('Esta obra já tem um plano para este mês.');
      const plan = { ...base(), workId: command.workId, month: command.month, name: command.name?.trim() || `Plano de ${command.month}`, createdBy: actorId };
      data.plans.push(plan); entityId = plan.id; break;
    }
    case 'delete_plan': {
      const plan = planFor(command.planId); checkWork(plan.workId);
      if (data.plans.some(p => p.baselineOf === plan.id)) throw new Error('Este plano tem linhas de base salvas. Exclua-as antes de excluir o plano.');
      const taskIds = new Set(data.planTasks.filter(t => t.planId === plan.id).map(t => t.id));
      data.planDependencies = data.planDependencies.filter(d => !taskIds.has(d.predecessorId) && !taskIds.has(d.successorId));
      data.planTasks = data.planTasks.filter(t => !taskIds.has(t.id));
      data.plans = data.plans.filter(p => p.id !== plan.id);
      entityId = plan.id; break;
    }
    case 'freeze_plan_baseline': {
      const plan = planFor(command.planId); checkWork(plan.workId);
      if (plan.baselineOf) throw new Error('Esta já é uma linha de base.');
      const tasks = data.planTasks.filter(t => t.planId === plan.id);
      if (!tasks.length) throw new Error('Preencha o plano antes de definir a linha de base.');
      // A linha de base é o próprio plano congelado: mesma estrutura, aberta no mesmo cronograma.
      const frozen = { ...base(), workId: plan.workId, month: plan.month, name: requireText(command.name, 'Nome da linha de base'), baselineOf: plan.id, frozenAt: now, createdBy: actorId };
      data.plans.push(frozen);
      for (const task of tasks) data.planTasks.push({ ...base(), planId: frozen.id, name: task.name, plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, teamId: task.teamId, activityId: task.activityId, notes: task.notes, progress: task.progress, order: task.order });
      entityId = frozen.id; break;
    }
    case 'create_plan_task': case 'update_plan_task': {
      const plan = command.type === 'create_plan_task' ? planFor(command.planId) : planFor(taskFor(command.taskId).planId);
      const workId = plan.workId; checkWork(workId);
      if (plan.frozenAt) throw new Error('Linha de base é um retrato congelado e não aceita edição.');
      const name = requireText(command.name, 'Nome da linha');
      validatePeriod(command.plannedStart, command.plannedEnd);
      if (command.teamId && !data.teams.some(t => t.id === command.teamId && t.workId === workId)) throw new Error('Equipe deve pertencer à obra.');
      if (command.activityId) {
        const linked = data.activities.find(a => a.id === command.activityId);
        if (!linked || workOf(wagonFor(data, linked.wagonId)) !== workId) throw new Error('A atividade vinculada deve ser da mesma obra.');
      }
      const fields = { name, plannedStart: command.plannedStart, plannedEnd: command.plannedEnd, teamId: command.teamId ?? undefined, activityId: command.activityId ?? undefined };
      if (command.type === 'create_plan_task') {
        const order = Math.max(0, ...data.planTasks.filter(t => t.planId === plan.id).map(t => t.order)) + 1;
        const task = { ...base(), planId: plan.id, ...fields, progress: 0, order };
        data.planTasks.push(task); entityId = task.id;
      } else {
        if (!Number.isFinite(command.progress) || command.progress < 0 || command.progress > 100) throw new Error('Progresso deve ficar entre 0 e 100.');
        const task = taskFor(command.taskId);
        Object.assign(task, fields, { progress: command.progress }); touch(task); entityId = task.id;
      }
      break;
    }
    case 'delete_plan_task': {
      const task = taskFor(command.taskId); const plan = planFor(task.planId); checkWork(plan.workId);
      if (plan.frozenAt) throw new Error('Linha de base é um retrato congelado e não aceita edição.');
      data.planDependencies = data.planDependencies.filter(d => d.predecessorId !== task.id && d.successorId !== task.id);
      data.planTasks = data.planTasks.filter(t => t.id !== task.id);
      entityId = task.id; break;
    }
    case 'set_plan_task_note': {
      const task = taskFor(command.taskId); const plan = planFor(task.planId); checkWork(plan.workId);
      if (plan.frozenAt) throw new Error('Linha de base é um retrato congelado e não aceita edição.');
      if (command.note.length > 2000) throw new Error('Anotação muito longa: use até 2000 caracteres.');
      task.notes = command.note.trim() || undefined; touch(task); entityId = task.id; break;
    }
    case 'link_plan_tasks': {
      const predecessor = taskFor(command.predecessorId), successor = taskFor(command.successorId);
      if (predecessor.id === successor.id) throw new Error('Uma linha não pode depender de si mesma.');
      if (predecessor.planId !== successor.planId) throw new Error('As linhas ligadas devem ser do mesmo plano.');
      const plan = planFor(successor.planId); checkWork(plan.workId);
      if (plan.frozenAt) throw new Error('Linha de base é um retrato congelado e não aceita edição.');
      if (data.planDependencies.some(d => d.predecessorId === predecessor.id && d.successorId === successor.id)) throw new Error('Essa dependência já existe.');
      const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
        if (from === target) return true;
        if (seen.has(from)) return false;
        seen.add(from);
        return data.planDependencies.filter(d => d.predecessorId === from).some(d => reaches(d.successorId, target, seen));
      };
      if (reaches(successor.id, predecessor.id)) throw new Error('Essa ligação criaria um ciclo entre as linhas.');
      const dependency = { ...base(), predecessorId: predecessor.id, successorId: successor.id };
      data.planDependencies.push(dependency); entityId = dependency.id; break;
    }
    case 'unlink_plan_tasks': {
      const dependency = data.planDependencies.find(d => d.id === command.dependencyId); if (!dependency) throw new Error('Dependência não encontrada.');
      const plan = planFor(taskFor(dependency.successorId).planId); checkWork(plan.workId);
      if (plan.frozenAt) throw new Error('Linha de base é um retrato congelado e não aceita edição.');
      data.planDependencies = data.planDependencies.filter(d => d.id !== dependency.id);
      entityId = dependency.id; break;
    }
    case 'link_activities': {
      const predecessor = data.activities.find(a => a.id === command.predecessorId);
      const successor = data.activities.find(a => a.id === command.successorId);
      if (!predecessor || !successor) throw new Error('Atividade não encontrada.');
      if (predecessor.id === successor.id) throw new Error('Uma atividade não pode depender de si mesma.');
      const workOfActivity = (activity: Activity) => workOf(wagonFor(data, activity.wagonId));
      if (workOfActivity(predecessor) !== workOfActivity(successor)) throw new Error('As atividades ligadas devem ser da mesma obra.');
      if (data.dependencies.some(d => d.predecessorId === predecessor.id && d.successorId === successor.id)) throw new Error('Essa dependência já existe.');
      // Se a predecessora já é alcançável a partir da sucessora, a ligação fecharia um laço.
      const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
        if (from === target) return true;
        if (seen.has(from)) return false;
        seen.add(from);
        return data.dependencies.filter(d => d.predecessorId === from).some(d => reaches(d.successorId, target, seen));
      };
      if (reaches(successor.id, predecessor.id)) throw new Error('Essa ligação criaria um ciclo entre as atividades.');
      const dependency = { ...base(), predecessorId: predecessor.id, successorId: successor.id };
      data.dependencies.push(dependency); entityId = dependency.id; wagonId = successor.wagonId; break;
    }
    case 'unlink_activities': {
      const dependency = data.dependencies.find(d => d.id === command.dependencyId); if (!dependency) throw new Error('Dependência não encontrada.');
      const successor = data.activities.find(a => a.id === dependency.successorId);
      if (successor) { workOf(wagonFor(data, successor.wagonId)); wagonId = successor.wagonId; }
      data.dependencies = data.dependencies.filter(d => d.id !== dependency.id);
      entityId = dependency.id; break;
    }
    case 'set_activity_note': {
      const activity = data.activities.find(a => a.id === command.activityId); if (!activity) throw new Error('Atividade não encontrada.');
      const wagon = wagonFor(data, activity.wagonId); workOf(wagon);
      if (typeof command.note !== 'string') throw new Error('Anotação inválida.');
      if (command.note.length > 2000) throw new Error('Anotação muito longa: use até 2000 caracteres.');
      activity.notes = command.note.trim() || undefined; touch(activity);
      entityId = activity.id; wagonId = wagon.id; break;
    }
    case 'create_ifc_model': {
      checkWork(command.workId); const name = requireText(command.name, 'Nome do modelo');
      if (data.ifcModels.some(m => m.workId === command.workId && m.name.toLowerCase() === name.toLowerCase())) throw new Error('Modelo já cadastrado nesta obra.');
      const model = { ...base(), workId: command.workId, name, discipline: requireText(command.discipline, 'Disciplina') };
      data.ifcModels.push(model); entityId = model.id; break;
    }
    case 'add_ifc_version': {
      const model = data.ifcModels.find(m => m.id === command.modelId); if (!model) throw new Error('Modelo não encontrado.');
      checkWork(model.workId);
      const fileName = requireText(command.fileName, 'Nome do arquivo');
      if (!/\.ifc$/i.test(fileName)) throw new Error('O repositório armazena apenas modelos IFC.');
      requireText(command.storagePath, 'Caminho do arquivo');
      if (data.ifcVersions.some(v => v.storagePath === command.storagePath)) throw new Error('Esta versão já foi registrada.');
      if (!Number.isFinite(command.fileSize) || command.fileSize <= 0) throw new Error('Arquivo vazio.');
      // Versões anteriores nunca são substituídas: cada envio empilha uma nova.
      const version = Math.max(0, ...data.ifcVersions.filter(v => v.modelId === model.id).map(v => v.version)) + 1;
      const storeys = [...new Set((command.storeys ?? []).filter(s => typeof s === 'string' && s.trim()).map(s => s.trim()))];
      const record = { ...base(), modelId: model.id, version, fileName, fileSize: command.fileSize, storagePath: command.storagePath, uploadedBy: actorId, storeys, elementCount: Number.isFinite(command.elementCount) ? command.elementCount : 0 };
      data.ifcVersions.push(record); entityId = record.id; break;
    }
    case 'create_link_rule': {
      checkWork(command.workId); const serviceName = requireText(command.serviceName, 'Serviço');
      if (!Array.isArray(command.criteria) || !command.criteria.length) throw new Error('Informe ao menos um critério.');
      for (const criterion of command.criteria) {
        if (criterion.property !== 'pavimento' && criterion.property !== 'tipo') throw new Error('Propriedade ainda não suportada nas regras.');
        if (criterion.operator !== 'igual' && criterion.operator !== 'contem') throw new Error('Operador inválido.');
        requireText(criterion.value, 'Valor do critério');
      }
      const order = Math.max(0, ...data.linkRules.filter(r => r.workId === command.workId).map(r => r.order)) + 1;
      const rule = { ...base(), workId: command.workId, order, serviceName, criteria: command.criteria.map(c => ({ ...c, value: c.value.trim() })) };
      data.linkRules.push(rule); entityId = rule.id; break;
    }
    case 'delete_link_rule': {
      const rule = data.linkRules.find(r => r.id === command.ruleId); if (!rule) throw new Error('Regra não encontrada.');
      checkWork(rule.workId);
      data.linkRules = data.linkRules.filter(r => r.id !== rule.id); entityId = rule.id; break;
    }
    case 'grant_access': case 'revoke_access': {
      if (actor.role !== 'admin') throw new Error('Somente administradores podem gerenciar acessos.');
      const target = data.users.find(u => u.id === command.userId); if (!target) throw new Error('Usuário não encontrado.');
      if (!data.works.some(w => w.id === command.workId)) throw new Error('Obra não encontrada.');
      if (command.type === 'grant_access') { if (!target.workIds.includes(command.workId)) target.workIds.push(command.workId); }
      else { target.workIds = target.workIds.filter(id => id !== command.workId); }
      touch(target); entityId = target.id; break;
    }
    case 'set_role': {
      if (actor.role !== 'admin') throw new Error('Somente administradores podem alterar papéis.');
      const target = data.users.find(u => u.id === command.userId); if (!target) throw new Error('Usuário não encontrado.');
      if (target.id === actorId && command.role !== 'admin') throw new Error('Você não pode remover seu próprio acesso de administrador.');
      target.role = command.role; touch(target); entityId = target.id; break;
    }
    case 'set_takt': {
      const sequence = data.sequences.find(s => s.id === command.sequenceId); if (!sequence) throw new Error('Sequência não encontrada.');
      if (actor.role !== 'admin') checkWork(sequence.workId);
      if (!Number.isInteger(command.taktDays) || command.taktDays <= 0 || command.taktDays > 365) throw new Error('Takt deve ter entre 1 e 365 dias.');
      sequence.defaultTaktDays = command.taktDays; touch(sequence); entityId = sequence.id; break;
    }
    case 'set_sequence_start': {
      const sequence = data.sequences.find(s => s.id === command.sequenceId); if (!sequence) throw new Error('Sequência não encontrada.');
      if (actor.role !== 'admin') checkWork(sequence.workId);
      if (command.startDate !== null) validateDate(command.startDate);
      sequence.startDate = command.startDate ?? undefined; touch(sequence); entityId = sequence.id; break;
    }
    case 'regenerate_sequence': {
      const sequence = data.sequences.find(s => s.id === command.sequenceId); if (!sequence) throw new Error('Sequência não encontrada.');
      const workId = sequence.workId; checkWork(workId); responsible(command.responsibleId, workId);
      const work = data.works.find(w => w.id === workId)!;
      if (work.previsionProjectId && work.previsionProjectId !== command.projectId) throw new Error('A obra selecionada não corresponde ao vínculo com este projeto Prevision.');
      const plan = planSequenceRegeneration(data, command.sequenceId, command.projectId, command.rows, sequence.defaultTaktDays, today);
      if (plan.aborted) throw new Error(plan.reason);
      const removedWagons = new Set(plan.removedWagonIds), removedActivities = new Set(plan.removedActivityIds);
      const removedCriteria = new Set(plan.removedCriterionIds), removedPending = new Set(plan.removedPendingIds), removedRestrictions = new Set(plan.removedRestrictionIds);
      data.wagons = data.wagons.filter(w => !removedWagons.has(w.id));
      data.activities = data.activities.filter(a => !removedActivities.has(a.id));
      data.criteria = data.criteria.filter(c => !removedCriteria.has(c.id));
      data.pendingItems = data.pendingItems.filter(p => !removedPending.has(p.id));
      data.restrictions = data.restrictions.filter(r => !removedRestrictions.has(r.id));
      // Filhos da atividade removida precisam sair do rascunho: o payload trafega inteiro e
      // reinseriria linhas apontando para atividade inexistente, violando a chave estrangeira
      // e derrubando a transação toda.
      data.progressEntries = data.progressEntries.filter(p => !removedActivities.has(p.activityId));
      // A linha da planilha é do planejador, não do cronograma: ressincronizar o Prevision
      // desfaz o vínculo com a atividade removida, mas não apaga o registro da semana.
      for (const commitment of data.commitments) if (commitment.activityId && removedActivities.has(commitment.activityId)) { commitment.activityId = undefined; touch(commitment); }
      for (const task of data.planTasks) if (task.activityId && removedActivities.has(task.activityId)) { task.activityId = undefined; touch(task); }
      data.dependencies = data.dependencies.filter(d => !removedActivities.has(d.predecessorId) && !removedActivities.has(d.successorId));
      if (!work.previsionProjectId) { work.previsionProjectId = command.projectId; touch(work); }
      let predecessorId = plan.frozenWagonId; let number = plan.startNumber;
      for (const window of plan.windows) {
        const taktDays = periodDays(window.plannedStart, window.plannedEnd, sequence.calendar === 'business_days');
        if (!taktDays) continue;
        const wagon = { ...base(), sequenceId: sequence.id, number, predecessorId, plannedStart: window.plannedStart, plannedEnd: window.plannedEnd, taktDays, responsibleIds: [command.responsibleId] };
        data.wagons.push(wagon); predecessorId = wagon.id; number++;
        for (const member of window.members) {
          const externalId = `${command.projectId}:${member.externalId}`;
          let location = data.locations.find(l => l.workId === workId && l.name === member.location);
          if (!location) { location = { ...base(), workId, name: member.location, code: '' }; data.locations.push(location); }
          const activity: Activity = { ...base(), wagonId: wagon.id, name: requireText(member.name, 'Atividade'), locationId: location.id, responsibleId: command.responsibleId, plannedStart: member.plannedStart, plannedEnd: member.plannedEnd, progress: member.progress, status: member.progress === 100 ? 'completed' : member.progress > 0 ? 'in_progress' : 'not_started', weight: typeof member.weight === 'number' && member.weight > 0 ? member.weight : 1, mandatory: true, origin: 'prevision', previsionExternalId: externalId };
          validateActivity(activity); data.activities.push(activity);
          data.criteria.push({ ...base(), activityId: activity.id, description: 'Conferência local da atividade importada', mandatory: true, fulfilled: false });
        }
      }
      validateSequence(data.wagons);
      entityId = sequence.id; break;
    }
  }
  data.history.push({ id: newId(), entityId: wagonId ?? entityId, entityType: wagonId ? 'wagon' : command.type === 'create_work' ? 'work' : 'planning', action: command.type, authorId: actorId, occurredAt: now, changes: { targetId: entityId, ...command } });
  for (const id of beforeTerminal) if (!isTerminal(id, data)) data.history.push({ id: newId(), entityId: id, entityType: 'wagon', action: 'terminality_reopened', authorId: actorId, occurredAt: now, changes: { reason: 'reason' in command ? command.reason : undefined } });
  return entityId;
}

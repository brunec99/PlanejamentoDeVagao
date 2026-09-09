import type { Activity, PlanningData, RecordBase, Wagon } from '../../domain/entities';
import { isTerminal, validateActivity, validateSequence } from '../../domain/rules';
import { periodDays, requireText, validateDate, validatePeriod } from '../../domain/validation';
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
  | { type: 'create_restriction'; wagonId: string; activityId?: string; description: string; responsibleId: string; dueDate: string; blocksExecution: boolean; blocksTerminality: boolean; reason?: string }
  | { type: 'resolve_restriction'; restrictionId: string; resolution: string }
  | { type: 'release'; wagonId: string; mode: 'initial' | 'normal' | 'exceptional'; justification?: string; responsibleId?: string; dueDate?: string }
  | { type: 'import_activities'; wagonId: string; projectId: string; responsibleId: string; rows: ImportedActivity[]; reason?: string }
  | { type: 'grant_access'; userId: string; workId: string }
  | { type: 'revoke_access'; userId: string; workId: string }
  | { type: 'set_role'; userId: string; role: 'viewer' | 'planner' | 'manager' | 'admin' }
  | { type: 'set_takt'; sequenceId: string; taktDays: number };
export interface ImportedActivity { externalId: string; name: string; location: string; plannedStart: string; plannedEnd: string; progress: number; baselineStart?: string; baselineEnd?: string }
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
      const wagon = wagonFor(data, command.wagonId); const workId = workOf(wagon); checkReopen(wagon, command.reason); responsible(command.responsibleId, workId); validateDate(command.dueDate);
      if (command.activityId && !data.activities.some(a => a.id === command.activityId && a.wagonId === wagon.id)) throw new Error('Atividade não pertence ao vagão.');
      const record = { ...base(), wagonId: wagon.id, activityId: command.activityId, description: requireText(command.description, 'Descrição'), responsibleId: command.responsibleId, dueDate: command.dueDate, blocksTerminality: command.blocksTerminality, status: 'open' as const };
      if (command.type === 'create_pending') data.pendingItems.push(record); else data.restrictions.push({ ...record, blocksExecution: command.blocksExecution });
      entityId = record.id; wagonId = wagon.id; break;
    }
    case 'resolve_pending': case 'resolve_restriction': {
      const record = command.type === 'resolve_pending' ? data.pendingItems.find(p => p.id === command.pendingId) : data.restrictions.find(r => r.id === command.restrictionId);
      if (!record) throw new Error('Registro não encontrado.');
      const wagon = wagonFor(data, record.wagonId); workOf(wagon);
      if (record.status === 'resolved') throw new Error('Registro já resolvido.');
      requireText(command.resolution, 'Descrição da resolução');
      record.status = 'resolved'; Object.assign(record, { resolution: command.resolution.trim(), resolvedAt: now }); touch(record); entityId = record.id; wagonId = wagon.id; break;
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
        const activity: Activity = { ...base(), wagonId: wagon.id, name: requireText(row.name, 'Atividade'), locationId: location.id, responsibleId: command.responsibleId, plannedStart: row.plannedStart, plannedEnd: row.plannedEnd, progress: row.progress, status: row.progress === 100 ? 'completed' : row.progress > 0 ? 'in_progress' : 'not_started', weight: 1, mandatory: true, origin: 'prevision', previsionExternalId: externalId };
        validateActivity(activity); data.activities.push(activity);
        // External completion never implies locally accepted terminality.
        data.criteria.push({ ...base(), activityId: activity.id, description: 'Conferência local da atividade importada', mandatory: true, fulfilled: false });
        if (row.progress > 0 && !wagon.actualStart) { wagon.actualStart = today; touch(wagon); }
      }
      entityId = wagon.id; wagonId = wagon.id; break;
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
  }
  data.history.push({ id: newId(), entityId: wagonId ?? entityId, entityType: wagonId ? 'wagon' : command.type === 'create_work' ? 'work' : 'planning', action: command.type, authorId: actorId, occurredAt: now, changes: { targetId: entityId, ...command } });
  for (const id of beforeTerminal) if (!isTerminal(id, data)) data.history.push({ id: newId(), entityId: id, entityType: 'wagon', action: 'terminality_reopened', authorId: actorId, occurredAt: now, changes: { reason: 'reason' in command ? command.reason : undefined } });
  return entityId;
}

import type { NonFulfillmentCause, PlanningData, Team, WeeklyCommitment } from '../../domain/entities';
import { addDays, startOfWeek } from '../../domain/validation';
import type { Command } from './commands';
import type { Planning } from './get-planning';

/** O comando que limpa o apontamento está sendo criado em paralelo: tipado aqui pela forma, para
 * este módulo compilar com ou sem ele na união. */
type ClearFulfillment = { type: 'clear_fulfillment'; commitmentId: string };
const isClearFulfillment = (command: Command): command is Command & ClearFulfillment =>
  (command as { type: string }).type === 'clear_fulfillment' && typeof (command as ClearFulfillment).commitmentId === 'string';

/** Projeção local de um comando já gravado no servidor, para a tela refletir a mudança sem
 * esperar a recarga de `/api/planning` (3 MB numa obra com anos de curto prazo). Cobre só o
 * curto prazo, que é onde a equipe de obra sente a lentidão; os demais devolvem `null`, e o
 * provedor segue recarregando como antes. Não valida: o servidor já aceitou o comando, e a
 * recarga que vem em seguida é a confirmação. Nunca altera o `planning` recebido. */
export function applyCommandLocally(planning: Planning, command: Command, id: string, actorId: string, now: string): Planning | null {
  const { data } = planning;
  const commitments = (next: WeeklyCommitment[]): Planning => ({ ...planning, data: { ...data, commitments: next } });
  const patch = (commitmentId: string, change: (c: WeeklyCommitment) => WeeklyCommitment): Planning | null => {
    const index = data.commitments.findIndex(c => c.id === commitmentId);
    if (index < 0) return null;
    const next = data.commitments.slice();
    next[index] = change(data.commitments[index]);
    return commitments(next);
  };
  if (isClearFulfillment(command))
    return patch(command.commitmentId, c => ({
      ...c,
      fulfilled: undefined,
      cause: undefined,
      justification: undefined,
      recordedAt: undefined,
      recordedBy: undefined,
      updatedAt: now,
    }));
  switch (command.type) {
    case 'create_commitment': {
      // Uma recarga que correu junto com a gravação pode já ter trazido a linha: não se duplica.
      if (data.commitments.some(c => c.id === id)) return null;
      const weekStart = startOfWeek(command.weekStart);
      const startDate = command.startDate ?? weekStart;
      return commitments([
        ...data.commitments,
        {
          id,
          createdAt: now,
          updatedAt: now,
          workId: command.workId,
          name: command.name.trim(),
          supplier: command.supplier?.trim() ?? '',
          weekStart,
          weekEnd: addDays(weekStart, 6),
          responsibleId: command.responsibleId,
          teamId: command.teamId ?? undefined,
          activityId: command.activityId ?? undefined,
          startDate,
          endDate: command.endDate ?? startDate,
        },
      ]);
    }
    case 'update_commitment': {
      const weekStart = startOfWeek(command.weekStart);
      return patch(command.commitmentId, c => ({
        ...c,
        name: command.name.trim(),
        supplier: command.supplier?.trim() ?? '',
        teamId: command.teamId ?? undefined,
        weekStart,
        weekEnd: addDays(weekStart, 6),
        startDate: command.startDate,
        endDate: command.endDate,
        updatedAt: now,
      }));
    }
    case 'record_fulfillment':
      return patch(command.commitmentId, c => ({
        ...c,
        fulfilled: command.fulfilled,
        // Cumprido não tem causa: a célula é limpa junto, como no servidor.
        cause: command.fulfilled ? undefined : (command.cause as NonFulfillmentCause | undefined),
        justification: command.justification?.trim() || undefined,
        recordedAt: now,
        recordedBy: actorId,
        updatedAt: now,
      }));
    case 'delete_commitment': {
      if (!data.commitments.some(c => c.id === command.commitmentId)) return null;
      return commitments(data.commitments.filter(c => c.id !== command.commitmentId));
    }
    case 'create_team': {
      if (data.teams.some(t => t.id === id)) return null;
      const team: Team = {
        id,
        createdAt: now,
        updatedAt: now,
        workId: command.workId,
        company: command.company.trim(),
        name: command.name.trim(),
        weeklyCapacity: command.weeklyCapacity,
      };
      const next: PlanningData = { ...data, teams: [...data.teams, team] };
      return { ...planning, data: next };
    }
    default:
      return null;
  }
}

import type { NonFulfillmentCause, PlanningData, Team, WeeklyCommitment } from '../../domain/entities';
import { addDays, startOfWeek } from '../../domain/validation';
import type { Command } from './commands';
import type { Planning } from './get-planning';

/** O comando que limpa o apontamento está sendo criado em paralelo: tipado aqui pela forma, para
 * este módulo compilar com ou sem ele na união. */
type ClearFulfillment = { type: 'clear_fulfillment'; commitmentId: string };
const isClearFulfillment = (command: Command): command is Command & ClearFulfillment =>
  (command as { type: string }).type === 'clear_fulfillment' && typeof (command as ClearFulfillment).commitmentId === 'string';

/** Comandos que a tela projeta ANTES de o servidor responder (26/10/2026): mudam linhas que já existem,
 * então a projeção não depende de id novo, e a célula mostra o valor escolhido na hora, como numa planilha.
 * Se o servidor recusar, o provedor recarrega e a célula volta. Criar linha ou equipe precisa do id do
 * servidor e continua sendo projetado depois da resposta. */
export function projectsBeforeServer(command: Command): boolean {
  switch ((command as { type: string }).type) {
    case 'record_fulfillment':
    case 'record_fulfillments':
    case 'clear_fulfillment':
    case 'update_commitment':
    case 'delete_commitment':
      return true;
    default:
      return false;
  }
}

/** Projeção local de um comando já gravado no servidor, para a tela refletir a mudança sem
 * esperar a recarga de `/api/planning` (3 MB numa obra com anos de curto prazo). Cobre só o
 * curto prazo, que é onde a equipe de obra sente a lentidão; os demais devolvem `null`, e o
 * provedor segue recarregando como antes. Não valida: o servidor já aceitou o comando, e a
 * recarga que vem em seguida é a confirmação. Nunca altera o `planning` recebido. */
export function applyCommandLocally(planning: Planning, command: Command, id: string, actorId: string, now: string): Planning | null {
  const { data } = planning;
  const recorded = (c: WeeklyCommitment, item: { fulfilled: boolean; cause?: string; justification?: string }): WeeklyCommitment => ({
    ...c,
    fulfilled: item.fulfilled,
    // Cumprido não tem causa: a célula é limpa junto, como no servidor.
    cause: item.fulfilled ? undefined : (item.cause as NonFulfillmentCause | undefined),
    justification: item.justification?.trim() || undefined,
    recordedAt: now,
    recordedBy: actorId,
    updatedAt: now,
  });
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
      return patch(command.commitmentId, c => recorded(c, command));
    case 'record_fulfillments': {
      // Todas as linhas precisam existir: o servidor recusa o lote inteiro se uma faltar, e aqui vale o mesmo.
      if (!command.items.length || command.items.some(item => !data.commitments.some(c => c.id === item.commitmentId))) return null;
      const byId = new Map(command.items.map(item => [item.commitmentId, item]));
      return commitments(data.commitments.map(c => (byId.has(c.id) ? recorded(c, byId.get(c.id)!) : c)));
    }
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

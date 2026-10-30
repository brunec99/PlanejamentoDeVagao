import type { Command } from '@/application/use-cases/commands';
import type { WeeklyCommitment } from '@/domain/entities';

/** "Desfazer" da planilha do curto prazo (26/10/2026). Cada gravação guarda o estado anterior da(s)
 * linha(s) e o comando que devolve a planilha a ele; o botão, o Ctrl+Z e o "Desfazer" dos avisos
 * mandam esse comando. Como no Sheets, só vale na sessão: recarregar a página zera a pilha. Funções
 * puras, testadas em tests/undo.test.ts. */

export const quote = (name: string) => `“${name}”`;

/** Devolve o apontamento de cada linha ao que era, numa gravação só: quem tinha Status volta a tê-lo,
 * quem não tinha é limpo (`clear`). */
export function undoFulfillmentCommand(before: readonly WeeklyCommitment[]): Command {
  return {
    type: 'record_fulfillments',
    items: before.map(row =>
      row.fulfilled === undefined
        ? { commitmentId: row.id, clear: true as const }
        : { commitmentId: row.id, fulfilled: row.fulfilled, cause: row.cause, justification: row.justification },
    ),
  };
}

/** Devolve as células da linha (empresa, equipe, semana, período, atividade) ao que eram. */
export function undoUpdateCommand(before: WeeklyCommitment): Command {
  return {
    type: 'update_commitment',
    commitmentId: before.id,
    name: before.name,
    supplier: before.supplier,
    teamId: before.teamId ?? null,
    weekStart: before.weekStart,
    startDate: before.startDate,
    endDate: before.endDate,
  };
}

/** Recria uma linha excluída com as mesmas células. Nasce com id novo e sem apontamento: quem desfaz a
 * exclusão regrava o Sim/Não em seguida, com `record_fulfillment` no id novo. Com `beforeId` (a linha que
 * vinha logo abaixo na ordem salva), volta para o mesmo lugar em vez de entrar embaixo. */
export function recreateCommand(before: WeeklyCommitment, responsibleId: string, beforeId?: string): Command {
  return {
    type: 'create_commitment',
    workId: before.workId,
    name: before.name,
    weekStart: before.weekStart,
    responsibleId,
    supplier: before.supplier,
    teamId: before.teamId ?? null,
    activityId: before.activityId ?? null,
    startDate: before.startDate,
    endDate: before.endDate,
    ...(beforeId && { beforeId }),
  };
}

/** O que o botão vai desfazer, em palavras: "apontamento de “Reboco”" ou "apontamento de 3 linhas". */
export function fulfillmentLabel(before: readonly WeeklyCommitment[]): string {
  return before.length === 1 ? `apontamento de ${quote(before[0].name)}` : `apontamento de ${before.length} linhas`;
}

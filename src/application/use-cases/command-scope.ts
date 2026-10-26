import type { SnapshotScope } from '../ports/planning-repository';
import { startOfWeek } from '../../domain/validation';
import type { Command } from './commands';

/** Recorte da leitura por comando. Os comandos do curto prazo só leem obras, perfis, equipes e o(s)
 * compromisso(s) envolvido(s), então a transação carrega só isso e grava só o que mudou. Ficam com
 * o planejamento inteiro das obras: `delete_team` (confere atividades e tarefas do mês que usam a
 * equipe), a linha vinculada a atividade do cronograma e todos os demais comandos. */
export function commandScope(command: Command, workIds: string[]): SnapshotScope {
  const full = { workIds };
  // Data inválida não derruba a leitura: o comando é que recusa, com a mensagem de negócio.
  const week = (date: string) => {
    try {
      return [startOfWeek(date)];
    } catch {
      return [];
    }
  };
  const id = (value: string) => (typeof value === 'string' ? [value] : []);
  switch (command.type) {
    case 'create_team':
    case 'update_team':
      return { workIds, commitments: { ids: [] } };
    case 'create_commitment':
      return command.activityId ? full : { workIds, commitments: { weekStarts: week(command.weekStart) } };
    // Mover de semana: a linha pela chave e a semana de destino, para o rascunho conter as duas pontas.
    case 'update_commitment':
      return { workIds, commitments: { ids: id(command.commitmentId), weekStarts: week(command.weekStart) } };
    case 'record_fulfillment':
    case 'clear_fulfillment':
    case 'delete_commitment':
      return { workIds, commitments: { ids: id(command.commitmentId) } };
    // O lote lê só as linhas que vai apontar: a barra de seleção manda dezenas de ids, não a semana.
    case 'record_fulfillments':
      return { workIds, commitments: { ids: Array.isArray(command.items) ? command.items.flatMap(item => id(item?.commitmentId)) : [] } };
    default:
      return full;
  }
}

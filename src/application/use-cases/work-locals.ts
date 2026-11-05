import type { LobCommand, LobData, LobLocal } from '@/domain/lob';
import { parseLobCommand } from './lob-commands';

/** Cadastro dos "Locais da obra" nas Configurações da obra (05/11/2026, pedido do usuário: "onde fica o campo para
 * inserir os locais? deveria estar em configuração da obra"). É a mesma lista da Linha de Balanço (`lob_locals`,
 * migração 0038), que também alimenta a coluna Local do curto prazo. A rota `/api/lob/commands` é restrita ao módulo
 * do longo prazo; a das Configurações (`/api/work-locals`) é aberta a quem tem a obra e só aceita estes comandos. */
export const WORK_LOCAL_COMMANDS = ['create_locals', 'rename_local', 'reorder_locals', 'delete_local'] as const;
export type WorkLocalCommand = Extract<LobCommand, { type: (typeof WORK_LOCAL_COMMANDS)[number] }>;

const isWorkLocalCommand = (command: LobCommand): command is WorkLocalCommand =>
  (WORK_LOCAL_COMMANDS as readonly string[]).includes(command.type);

/** Valida como a Linha de Balanço valida e recusa qualquer comando que não seja do cadastro de locais. */
export function parseWorkLocalCommand(input: unknown): WorkLocalCommand {
  const command = parseLobCommand(input);
  if (!isWorkLocalCommand(command)) throw new Error('Nas Configurações da obra só se cadastram locais.');
  return command;
}

/** O que a seção mostra: os locais de baixo para cima (como a Linha de Balanço guarda a ordem) e quantos blocos da
 * Linha de Balanço cada um tem, para a exclusão avisar antes de o servidor recusar. */
export interface WorkLocalsView {
  locals: LobLocal[];
  blocks: Record<string, number>;
}
export type WorkLocalsResponse = ({ available: true } & WorkLocalsView) | { available: false };

export function workLocalsView(data: Pick<LobData, 'locals' | 'activities'>): WorkLocalsView {
  const blocks: Record<string, number> = {};
  for (const activity of data.activities) blocks[activity.localId] = (blocks[activity.localId] ?? 0) + 1;
  const locals = [...data.locals].sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
  return { locals, blocks };
}

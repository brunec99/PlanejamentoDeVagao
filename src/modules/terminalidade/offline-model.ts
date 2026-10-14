import { planTerminalityCommand, TERMINALITY_TABLES, type TerminalityMutation } from '@/application/use-cases/terminality-commands';
import { terminalityPhotoPaths, type TerminalityCommand, type TerminalityData, type TerminalityPhotoKind } from '@/domain/terminality';

/** Regras puras do modo de campo da terminalidade (sem IndexedDB nem rede), testadas em
 * tests/terminality-offline.test.ts. O mesmo desenho da vistoria da Obra do Mês no App-ATR: o dono
 * do rascunho é o aparelho. A tela mostra o pacote baixado do servidor com a fila local aplicada por
 * cima, pelas mesmas regras do servidor (`planTerminalityCommand`), e a fila sobe quando houver rede. */

export interface FieldActor {
  id: string;
  name: string;
  role: string;
}
export interface FieldWork {
  id: string;
  name: string;
  code: string;
}
/** Tudo o que uma obra precisa para abrir sem sinal: baixado em "Baixar para usar sem sinal". */
export interface FieldPackage {
  work: FieldWork;
  actor: FieldActor;
  data: TerminalityData;
  /** Empresas do cadastro de equipes, para o "Responsável Terceiro". */
  companies: string[];
  savedAt: string;
}

/** Uma alteração feita no aparelho e ainda não enviada. A foto viaja em duas partes: os arquivos
 * (guardados à parte, por `photoId`) e o registro, que vira `add_photo` ao subir. */
export type FieldOperation =
  | { kind: 'command'; command: Exclude<TerminalityCommand, { type: 'add_photo' }> }
  | { kind: 'photo'; itemId: string; photoId: string; photoKind: TerminalityPhotoKind; width?: number; height?: number; bytes?: number };
export interface QueuedOperation {
  id: string;
  workId: string;
  createdAt: string;
  operation: FieldOperation;
  /** Recusa do servidor na última tentativa (a fila para nela até alguém descartar). */
  error?: string;
}

/** O comando que a operação representa, já com os caminhos de foto que o servidor exige. */
export function operationCommand(workId: string, operation: FieldOperation): TerminalityCommand {
  if (operation.kind === 'command') return operation.command;
  const paths = terminalityPhotoPaths(workId, operation.itemId, operation.photoId);
  return {
    type: 'add_photo',
    itemId: operation.itemId,
    photoId: operation.photoId,
    kind: operation.photoKind,
    ...paths,
    width: operation.width,
    height: operation.height,
    bytes: operation.bytes,
  };
}

/** Aplica o que um comando grava sobre os dados da obra, como o repositório faz no banco. Puro. */
export function applyMutationToData(data: TerminalityData, mutation: TerminalityMutation): TerminalityData {
  const next = { ...data } as TerminalityData;
  for (const table of TERMINALITY_TABLES) {
    const removed = new Set(mutation.delete[table]);
    const updated = new Map((mutation.update[table] as { id: string }[]).map(row => [row.id, row]));
    const rows = (data[table] as { id: string }[])
      .filter(row => !removed.has(row.id))
      .map(row => updated.get(row.id) ?? row)
      .concat(mutation.insert[table] as { id: string }[]);
    (next as unknown as Record<string, unknown>)[table] = rows;
  }
  return next;
}

/** Data civil de hoje em São Paulo, a mesma que o servidor usa para "não pode estar no futuro". */
export function todayInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export interface LocalView {
  data: TerminalityData;
  /** Ids de pendência com alteração ainda não enviada (para o selo "aguardando envio"). */
  pendingItems: Set<string>;
  /** Fotos ainda no aparelho, por id. */
  pendingPhotos: Set<string>;
  /** Operações que já não cabem nos dados atuais do servidor (outra pessoa mudou a pendência). */
  rejected: { operation: QueuedOperation; message: string }[];
}

const itemOf = (command: TerminalityCommand) => ('itemId' in command ? command.itemId : undefined);

/** O pacote do servidor com a fila desta obra aplicada por cima, na ordem em que foi lançada. Uma
 * operação que já não vale (a pendência foi apagada por outra pessoa, por exemplo) não derruba as
 * outras: vai para `rejected`, e a tela oferece descartar. */
export function localView(pkg: FieldPackage, queue: QueuedOperation[], now = new Date()): LocalView {
  let data = pkg.data;
  const pendingItems = new Set<string>();
  const pendingPhotos = new Set<string>();
  const rejected: LocalView['rejected'] = [];
  const context = { actorId: pkg.actor.id, now: now.toISOString(), today: todayInSaoPaulo(now), newId: () => crypto.randomUUID() };
  for (const queued of queue) {
    if (queued.workId !== pkg.work.id) continue;
    const command = operationCommand(queued.workId, queued.operation);
    try {
      data = applyMutationToData(data, planTerminalityCommand(data, command, context));
      const itemId = itemOf(command);
      if (itemId) pendingItems.add(itemId);
      if (queued.operation.kind === 'photo') pendingPhotos.add(queued.operation.photoId);
    } catch (error) {
      rejected.push({ operation: queued, message: error instanceof Error ? error.message : 'Alteração inválida.' });
    }
  }
  return { data, pendingItems, pendingPhotos, rejected };
}

/** Confere uma operação nova contra a vista local antes de entrar na fila: sem sinal, é aqui que o
 * aparelho recusa o que o servidor recusaria (resolver sem foto da correção, data no futuro...). */
export function checkOperation(pkg: FieldPackage, queue: QueuedOperation[], operation: FieldOperation, now = new Date()): void {
  const view = localView(pkg, queue, now);
  const context = { actorId: pkg.actor.id, now: now.toISOString(), today: todayInSaoPaulo(now), newId: () => crypto.randomUUID() };
  planTerminalityCommand(view.data, operationCommand(pkg.work.id, operation), context);
}

/** Recusa do servidor que significa "isso já foi gravado": uma tentativa anterior subiu e a resposta
 * se perdeu (sinal caiu no meio). A operação sai da fila como enviada, não como erro. */
export function alreadyApplied(message: string): boolean {
  return /já foi registrada/i.test(message);
}

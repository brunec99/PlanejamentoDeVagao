import { planSafetyCommand, SAFETY_TABLES, type SafetyMutation } from '@/application/use-cases/safety-commands';
import {
  SAFETY_TST_ONLY_MESSAGE,
  safetyPhotoPaths,
  type SafetyCommand,
  type SafetyData,
  type SafetyInspector,
  type SafetyPhotoKind,
} from '@/domain/safety';

/** Regras puras do modo de campo da segurança do trabalho (sem IndexedDB nem rede), testadas em
 * tests/safety-offline.test.ts. O mesmo desenho do modo de campo da terminalidade (aba 5): o dono do
 * rascunho é o aparelho. A tela mostra o pacote baixado do servidor com a fila local aplicada por cima,
 * pelas mesmas regras do servidor (`planSafetyCommand`), e a fila sobe quando houver rede. A diferença é
 * quem grava: só TST (`canEdit` do pacote); para os demais a tela é só consulta e nada entra na fila. */

export interface FieldActor {
  id: string;
  name: string;
  role: string;
  /** Marcado como técnico de segurança do trabalho (`profiles.tst`). */
  tst: boolean;
}
export interface FieldWork {
  id: string;
  name: string;
  code: string;
}
/** Tudo o que uma obra precisa para abrir sem sinal: baixado ao abrir a obra com sinal. */
export interface FieldPackage {
  work: FieldWork;
  actor: FieldActor;
  /** Quem baixou é TST: só então a tela mostra os botões e o aparelho aceita lançamentos. O servidor
   * confere de novo ao receber. */
  canEdit: boolean;
  /** TSTs com acesso à obra, para quem só consulta saber a quem pedir. */
  inspectors: SafetyInspector[];
  data: SafetyData;
  savedAt: string;
}

/** Os comandos que o campo lança. Cadastro de tipos, edição, edição em lote e exclusão ficam na aba 6,
 * no computador. A foto entra pela operação `photo` (vira `add_photo` ao subir). */
export type FieldCommand = Extract<SafetyCommand, { type: 'create_item' | 'resolve_item' | 'reopen_item' }>;

/** Uma alteração feita no aparelho e ainda não enviada. A foto viaja em duas partes: os arquivos
 * (guardados à parte, por `photoId`) e o registro, que vira `add_photo` ao subir. */
export type FieldOperation =
  | { kind: 'command'; command: FieldCommand }
  | { kind: 'photo'; itemId: string; photoId: string; photoKind: SafetyPhotoKind; width?: number; height?: number; bytes?: number };
export interface QueuedOperation {
  id: string;
  workId: string;
  createdAt: string;
  operation: FieldOperation;
  /** Recusa do servidor na última tentativa (a fila para nela até alguém descartar). */
  error?: string;
}

/** O comando que a operação representa, já com os caminhos de foto que o servidor exige. */
export function operationCommand(workId: string, operation: FieldOperation): SafetyCommand {
  if (operation.kind === 'command') return operation.command;
  const paths = safetyPhotoPaths(workId, operation.itemId, operation.photoId);
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

/** O apontamento em que a operação mexe (todas as do campo mexem em um). */
export const operationItemId = (operation: FieldOperation): string =>
  operation.kind === 'photo' ? operation.itemId : operation.command.itemId;

/** Aplica o que um comando grava sobre os dados da obra, como o repositório faz no banco. Puro. */
export function applyMutationToData(data: SafetyData, mutation: SafetyMutation): SafetyData {
  const next = { ...data };
  for (const table of SAFETY_TABLES) {
    // Tabela sem mudança mantém o mesmo array: a tela não refaz índice de mais de mil apontamentos à toa.
    if (!mutation.delete[table].length && !mutation.update[table].length && !mutation.insert[table].length) continue;
    const removed = new Set(mutation.delete[table]);
    const updated = new Map((mutation.update[table] as { id: string }[]).map(row => [row.id, row]));
    const rows = (data[table] as { id: string }[])
      .filter(row => !removed.has(row.id))
      .map(row => updated.get(row.id) ?? row)
      .concat(mutation.insert[table] as { id: string }[]);
    (next as Record<string, unknown>)[table] = rows;
  }
  return next;
}

/** Data civil de hoje em São Paulo, a mesma que o servidor usa para "não pode estar no futuro". */
export function todayInSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export interface LocalView {
  data: SafetyData;
  /** Ids de apontamento com alteração ainda não enviada (para o selo "no aparelho"). */
  pendingItems: Set<string>;
  /** Fotos ainda no aparelho, por id. */
  pendingPhotos: Set<string>;
  /** Operações que já não cabem nos dados atuais do servidor (outra pessoa mudou o apontamento). */
  rejected: { operation: QueuedOperation; message: string }[];
}

const contextOf = (pkg: FieldPackage, now: Date) => ({
  actorId: pkg.actor.id,
  now: now.toISOString(),
  today: todayInSaoPaulo(now),
  newId: () => crypto.randomUUID(),
});

/** O pacote do servidor com a fila desta obra aplicada por cima, na ordem em que foi lançada. Uma
 * operação que já não vale (o apontamento foi excluído no computador, por exemplo) não derruba as
 * outras: vai para `rejected`, e a tela oferece descartar. */
export function localView(pkg: FieldPackage, queue: QueuedOperation[], now = new Date()): LocalView {
  let data = pkg.data;
  const pendingItems = new Set<string>();
  const pendingPhotos = new Set<string>();
  const rejected: LocalView['rejected'] = [];
  const context = contextOf(pkg, now);
  for (const queued of queue) {
    if (queued.workId !== pkg.work.id) continue;
    try {
      data = applyMutationToData(data, planSafetyCommand(data, operationCommand(queued.workId, queued.operation), context));
      pendingItems.add(operationItemId(queued.operation));
      if (queued.operation.kind === 'photo') pendingPhotos.add(queued.operation.photoId);
    } catch (error) {
      rejected.push({ operation: queued, message: error instanceof Error ? error.message : 'Alteração inválida.' });
    }
  }
  return { data, pendingItems, pendingPhotos, rejected };
}

/** Confere uma operação nova contra a vista local antes de entrar na fila: sem sinal, é aqui que o
 * aparelho recusa o que o servidor recusaria (quem não é TST, finalizar sem foto da correção, data no
 * futuro, mais de 10 fotos...). Lança a mensagem pronta para o usuário. */
export function checkOperation(pkg: FieldPackage, queue: QueuedOperation[], operation: FieldOperation, now = new Date()): void {
  if (!pkg.canEdit) throw new Error(SAFETY_TST_ONLY_MESSAGE);
  if (operation.kind === 'command' && operation.command.type === 'create_item' && operation.command.workId !== pkg.work.id)
    throw new Error('O apontamento não é desta obra.');
  const view = localView(pkg, queue, now);
  planSafetyCommand(view.data, operationCommand(pkg.work.id, operation), contextOf(pkg, now));
}

/** Recusa do servidor que significa "isso já foi gravado": uma tentativa anterior subiu e a resposta
 * se perdeu (sinal caiu no meio). A operação sai da fila como enviada, não como erro. */
export function alreadyApplied(message: string): boolean {
  return /já foi registrad[oa]/i.test(message);
}

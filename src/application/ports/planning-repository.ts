import type { PlanningData } from '../../domain/entities';

/** Recorte do snapshot: só as obras listadas. `works` e `users` vêm sempre inteiros, porque o
 * cadastro de obra confere unicidade de código e a administração de acessos precisa de todos. */
export interface SnapshotScope {
  workIds: string[];
}

export interface PlanningRepository {
  getSnapshot(scope?: SnapshotScope): Promise<PlanningData>;
  /** Runs `operation` on an isolated draft and persists it atomically. Throwing discards all changes. */
  transaction<T>(operation: (draft: PlanningData) => T, scope?: SnapshotScope): Promise<T>;
}

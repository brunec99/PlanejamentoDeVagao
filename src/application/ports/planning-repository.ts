import type { PlanningData } from '../../domain/entities';

/** Recorte do snapshot: só as obras listadas. `works` e `users` vêm sempre inteiros, porque o
 * cadastro de obra confere unicidade de código e a administração de acessos precisa de todos. */
export interface SnapshotScope {
  workIds: string[];
  /** Recorte do curto prazo (comandos de compromisso e de equipe): só `works` das obras, `profiles`,
   * `teams` das obras e os compromissos das semanas ou com os ids listados; as demais coleções vêm
   * vazias. Só serve a quem grava só o que mudou (o adaptador real faz isso): num rascunho assim,
   * linha ausente não quer dizer linha apagada. */
  commitments?: CommitmentScope;
}

export interface CommitmentScope {
  weekStarts?: string[];
  ids?: string[];
}

/** O que uma gravação devolve: o resultado da operação e a versão do planejamento depois dela
 * (`planning_meta.version`), para a tela saber que o que está nela já é a versão do banco. */
export interface Committed<T> {
  result: T;
  version: number;
}

export interface PlanningRepository {
  getSnapshot(scope?: SnapshotScope): Promise<PlanningData>;
  /** Runs `operation` on an isolated draft and persists it atomically. Throwing discards all changes. */
  transaction<T>(operation: (draft: PlanningData) => T, scope?: SnapshotScope): Promise<T>;
  /** `transaction` que também diz a versão gravada. */
  commit<T>(operation: (draft: PlanningData) => T, scope?: SnapshotScope): Promise<Committed<T>>;
}

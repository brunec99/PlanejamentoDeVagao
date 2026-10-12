import type { PlanningRepository, SnapshotScope } from '../../../application/ports/planning-repository';
import type { PlanningData } from '../../../domain/entities';
import { createMockData } from '../../../mocks/planning';
export class MockPlanningRepository implements PlanningRepository {
  private data: PlanningData;
  /** Espelha `planning_meta.version`: começa em 0 e sobe a cada gravação, como `commit_planning`. */
  private version = 0;
  constructor(seed: PlanningData = createMockData()) {
    this.data = structuredClone(seed);
  }
  /** O recorte por obra é do adaptador real; em memória o snapshot inteiro é o que os testes esperam. */
  async getSnapshot(_scope?: SnapshotScope): Promise<PlanningData> {
    return structuredClone(this.data);
  }
  /** Sinal de mudança para a tela conferir antes de baixar o planejamento inteiro. */
  async getVersion(): Promise<number> {
    return this.version;
  }
  async transaction<T>(operation: (draft: PlanningData) => T, _scope?: SnapshotScope): Promise<T> {
    const draft = structuredClone(this.data);
    const result = operation(draft);
    this.data = structuredClone(draft);
    this.version += 1;
    return result;
  }
}

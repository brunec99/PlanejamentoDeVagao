import type { PlanningRepository, SnapshotScope } from '../../../application/ports/planning-repository';
import type { PlanningData } from '../../../domain/entities';
import { createMockData } from '../../../mocks/planning';
export class MockPlanningRepository implements PlanningRepository {
  private data: PlanningData;
  constructor(seed: PlanningData = createMockData()) {
    this.data = structuredClone(seed);
  }
  /** O recorte por obra é do adaptador real; em memória o snapshot inteiro é o que os testes esperam. */
  async getSnapshot(_scope?: SnapshotScope): Promise<PlanningData> {
    return structuredClone(this.data);
  }
  async transaction<T>(operation: (draft: PlanningData) => T, _scope?: SnapshotScope): Promise<T> {
    const draft = structuredClone(this.data);
    const result = operation(draft);
    this.data = structuredClone(draft);
    return result;
  }
}

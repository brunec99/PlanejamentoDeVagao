import type { PlanningRepository } from '../../../application/ports/planning-repository';
import type { PlanningData } from '../../../domain/entities';
import { createMockData } from '../../../mocks/planning';
export class MockPlanningRepository implements PlanningRepository {
  private data: PlanningData;
  constructor(seed: PlanningData = createMockData()) { this.data = structuredClone(seed); }
  async getSnapshot(): Promise<PlanningData> { return structuredClone(this.data); }
  async transaction<T>(operation: (draft: PlanningData) => T): Promise<T> {
    const draft = structuredClone(this.data);
    const result = operation(draft);
    this.data = structuredClone(draft);
    return result;
  }
}

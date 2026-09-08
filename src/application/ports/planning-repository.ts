import type { PlanningData } from '../../domain/entities';
/** A transaction commits its isolated draft only after all validations pass. */
export interface PlanningRepository {
  getSnapshot(): Promise<PlanningData>;
  transaction<T>(operation: (draft: PlanningData) => T): Promise<T>;
}

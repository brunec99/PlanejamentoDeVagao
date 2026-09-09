import type { PlanningRepository } from '../../../application/ports/planning-repository';
import type { PlanningData } from '../../../domain/entities';
import { getServiceClient } from './client';
import { planningDataToPayload, rowsToPlanningData, type Rows } from './mappers';

const TABLES = ['works', 'locations', 'production_sequences', 'wagons', 'activities', 'terminality_criteria', 'pending_items', 'restrictions', 'releases', 'terminality_debts', 'history_events', 'profiles'] as const;
const MAX_ATTEMPTS = 5;
const PAGE = 1000;

/** O PostgREST devolve no máximo 1000 linhas por requisição; sem paginar, o snapshot
 * viria truncado e o domínio decidiria sobre dados incompletos. */
async function fetchAll(table: string): Promise<unknown[]> {
  const client = getServiceClient();
  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) return all;
  }
}

async function fetchSnapshotWithVersion(): Promise<{ data: PlanningData; version: number }> {
  const client = getServiceClient();
  const [rows, meta] = await Promise.all([
    Promise.all(TABLES.map(fetchAll)),
    client.from('planning_meta').select('version').eq('id', 1).single(),
  ]);
  if (meta.error) throw new Error(`Falha ao ler planning_meta: ${meta.error.message}`);
  const byTable = Object.fromEntries(TABLES.map((table, i) => [table, rows[i]])) as unknown as Rows;
  return { data: rowsToPlanningData(byTable), version: meta.data.version as number };
}

/** Server-only repository. Reads/writes go through the service role — the browser never talks to Supabase Postgres directly. */
export class SupabasePlanningRepository implements PlanningRepository {
  async getSnapshot(): Promise<PlanningData> {
    return (await fetchSnapshotWithVersion()).data;
  }

  async transaction<T>(operation: (draft: PlanningData) => T): Promise<T> {
    const client = getServiceClient();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { data, version } = await fetchSnapshotWithVersion();
      const draft = structuredClone(data);
      const result = operation(draft);
      const { error } = await client.rpc('commit_planning', { p_expected_version: version, p_payload: planningDataToPayload(draft) });
      if (!error) return result;
      if (!error.message.includes('version_conflict')) throw new Error(error.message);
    }
    throw new Error('Conflito de concorrência: outra alteração foi salva ao mesmo tempo. Tente novamente.');
  }
}

import type { PlanningRepository, SnapshotScope } from '../../../application/ports/planning-repository';
import type { PlanningData } from '../../../domain/entities';
import { getServiceClient } from './client';
import { diffDeletedIds, planningDataToPayload, rowsToPlanningData, type Rows } from './mappers';

/** As tabelas lidas no snapshot. `history_events` ficou de fora em 01/10/2026: o histórico só
 * cresce, nunca é lido pelos comandos, e trafegava inteiro em cada requisição. Ele continua sendo
 * gravado pelo `commit_planning` (o payload leva só os eventos novos) e é lido pela rota própria
 * `/api/history`, por entidade. */
const TABLES = [
  'works',
  'locations',
  'production_sequences',
  'wagons',
  'activities',
  'terminality_criteria',
  'pending_items',
  'restrictions',
  'releases',
  'terminality_debts',
  'teams',
  'progress_entries',
  'weekly_commitments',
  'baselines',
  'activity_dependencies',
  'medium_term_plans',
  'plan_tasks',
  'plan_dependencies',
  'ifc_models',
  'ifc_model_versions',
  'link_rules',
  'profiles',
] as const;
const MAX_ATTEMPTS = 5;
const PAGE = 1000;
/** Depois de descobrir que a função `planning_snapshot` não existe no banco, o repositório volta
 * às leituras por tabela e só tenta a função de novo depois deste intervalo. */
const PROBE_AGAIN_AFTER = 5 * 60_000;
let rpcMissingSince: number | undefined;

const missingFunction = (code?: string) => code === 'PGRST202' || code === '42883';

/** O PostgREST devolve no máximo 1000 linhas por requisição; sem paginar, o snapshot
 * viria truncado e o domínio decidiria sobre dados incompletos. O `order('id')` é o que
 * torna a paginação determinística: cada comando regrava a tabela inteira e muda a ordem
 * física das linhas, então sem ordenação explícita uma escrita entre duas páginas faria
 * o snapshot repetir ou perder registros. */
async function fetchAll(table: string): Promise<unknown[]> {
  const client = getServiceClient();
  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) return all;
  }
}

/** Leitura por tabela, sem recorte: é o caminho de antes da migração 0027, mantido para o banco
 * sem a função continuar servindo todas as telas. */
async function fetchByTables(): Promise<{ data: PlanningData; version: number }> {
  const client = getServiceClient();
  const [rows, meta] = await Promise.all([
    Promise.all(TABLES.map(fetchAll)),
    client.from('planning_meta').select('version').eq('id', 1).single(),
  ]);
  if (meta.error) throw new Error(`Falha ao ler planning_meta: ${meta.error.message}`);
  const byTable = Object.fromEntries(TABLES.map((table, i) => [table, rows[i]])) as unknown as Rows;
  return { data: rowsToPlanningData({ ...byTable, history_events: [] }), version: meta.data.version as number };
}

/** Uma ida só ao banco, já recortada pelas obras do usuário (migração 0027). Sem a função no
 * banco, cai na leitura por tabela. */
async function fetchSnapshotWithVersion(scope?: SnapshotScope): Promise<{ data: PlanningData; version: number }> {
  const probe = rpcMissingSince === undefined || Date.now() - rpcMissingSince > PROBE_AGAIN_AFTER;
  if (scope && probe) {
    const { data, error } = await getServiceClient().rpc('planning_snapshot', { p_work_ids: scope.workIds });
    if (!error) {
      rpcMissingSince = undefined;
      const { version, ...tables } = data as { version: number } & Omit<Rows, 'history_events'>;
      return { data: rowsToPlanningData({ ...tables, history_events: [] }), version };
    }
    if (!missingFunction(error.code)) throw new Error(`Falha ao ler o planejamento: ${error.message}`);
    rpcMissingSince = Date.now();
  }
  return fetchByTables();
}

/** Server-only repository. Reads/writes go through the service role — the browser never talks to Supabase Postgres directly. */
export class SupabasePlanningRepository implements PlanningRepository {
  async getSnapshot(scope?: SnapshotScope): Promise<PlanningData> {
    return (await fetchSnapshotWithVersion(scope)).data;
  }

  async transaction<T>(operation: (draft: PlanningData) => T, scope?: SnapshotScope): Promise<T> {
    const client = getServiceClient();
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { data, version } = await fetchSnapshotWithVersion(scope);
      const draft = structuredClone(data);
      const result = operation(draft);
      // O payload leva só o que o rascunho conhece: com recorte por obra, as linhas das outras
      // obras não viajam e não são tocadas, porque o commit faz upsert e só apaga o que `p_deletes` lista.
      const { error } = await client.rpc('commit_planning', {
        p_expected_version: version,
        p_payload: planningDataToPayload(draft),
        p_deletes: diffDeletedIds(data, draft),
      });
      if (!error) return result;
      if (!error.message.includes('version_conflict')) throw new Error(error.message);
    }
    throw new Error('Conflito de concorrência: outra alteração foi salva ao mesmo tempo. Tente novamente.');
  }
}

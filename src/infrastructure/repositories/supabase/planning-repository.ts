import type { SupabaseClient } from '@supabase/supabase-js';
import type { Committed, CommitmentScope, PlanningRepository, SnapshotScope } from '../../../application/ports/planning-repository';
import type { PlanningData } from '../../../domain/entities';
import { getServiceClient } from './client';
import { diffChangedRows, diffDeletedIds, rowsToPlanningData, type Rows } from './mappers';

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

interface Snapshot {
  data: PlanningData;
  version: number;
}
/** Filtros `coluna in (valores)`; o postgrest-js põe aspas nos valores que precisam. */
type Where = Record<string, readonly string[]>;

/** O PostgREST devolve no máximo 1000 linhas por requisição; sem paginar, o snapshot
 * viria truncado e o domínio decidiria sobre dados incompletos. O `order('id')` é o que
 * torna a paginação determinística: uma escrita entre duas páginas muda a ordem física das
 * linhas, então sem ordenação explícita o snapshot repetiria ou perderia registros. */
async function fetchAll(client: SupabaseClient, table: string, where: Where = {}): Promise<unknown[]> {
  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = client.from(table).select('*');
    for (const [column, values] of Object.entries(where)) query = query.in(column, values);
    const { data, error } = await query.order('id').range(from, from + PAGE - 1);
    if (error) throw new Error(`Falha ao ler ${table}: ${error.message}`);
    all.push(...data);
    if (data.length < PAGE) return all;
  }
}

/** `planning_meta.version`: linha única que `commit_planning` incrementa a cada gravação. É a
 * conferência da concorrência otimista e o sinal barato de que há algo novo para a tela. */
async function fetchVersion(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.from('planning_meta').select('version').eq('id', 1).single();
  if (error) throw new Error(`Falha ao ler planning_meta: ${error.message}`);
  return data.version as number;
}

const emptyRows = (): Rows => Object.fromEntries([...TABLES, 'history_events'].map(table => [table, []])) as unknown as Rows;

/** Leitura por tabela, sem recorte: é o caminho de antes da migração 0027, mantido para o banco
 * sem a função continuar servindo todas as telas. */
async function fetchByTables(client: SupabaseClient): Promise<Snapshot> {
  const [rows, version] = await Promise.all([Promise.all(TABLES.map(table => fetchAll(client, table))), fetchVersion(client)]);
  const byTable = Object.fromEntries(TABLES.map((table, i) => [table, rows[i]])) as unknown as Rows;
  return { data: rowsToPlanningData({ ...byTable, history_events: [] }), version };
}

/** Recorte do curto prazo: os comandos de compromisso e de equipe só leem obras, perfis, equipes e
 * o(s) compromisso(s) envolvido(s) (`applyCommand`), então só isso viaja — dezenas de KB em vez do
 * planejamento inteiro das obras. As outras coleções voltam vazias; como a gravação envia só o que
 * mudou, elas nunca viram upsert nem exclusão. */
async function fetchShortTermScope(client: SupabaseClient, workIds: string[], scope: CommitmentScope): Promise<Snapshot> {
  // A versão vem antes das linhas: uma gravação concorrente entre as duas leituras faz o commit
  // falhar com `version_conflict` e recomeçar, em vez de regravar linha velha por cima da nova.
  const version = await fetchVersion(client);
  // Sem obra não há o que ler (`in ()` nem é um filtro válido); o comando recusa o acesso.
  const scoped = (table: string, where: Where) => (workIds.length ? fetchAll(client, table, where) : Promise.resolve([]));
  const weekStarts = scope.weekStarts ?? [];
  const ids = scope.ids ?? [];
  const [works, profiles, teams, byWeek, byId] = await Promise.all([
    scoped('works', { id: workIds }),
    fetchAll(client, 'profiles'),
    scoped('teams', { work_id: workIds }),
    weekStarts.length ? scoped('weekly_commitments', { work_id: workIds, week_start: weekStarts }) : [],
    ids.length ? scoped('weekly_commitments', { work_id: workIds, id: ids }) : [],
  ]);
  // A semana de destino pode conter a própria linha movida: uma cópia só de cada.
  const commitments = new Map<string, unknown>();
  for (const row of [...byWeek, ...byId]) commitments.set((row as { id: string }).id, row);
  const rows = { ...emptyRows(), works, profiles, teams, weekly_commitments: [...commitments.values()] } as Rows;
  return { data: rowsToPlanningData(rows), version };
}

/** Uma ida só ao banco, já recortada pelas obras do usuário (migração 0027). Sem a função no
 * banco, cai na leitura por tabela. Com recorte de compromissos, lê só o curto prazo. */
async function fetchSnapshotWithVersion(client: SupabaseClient, scope?: SnapshotScope): Promise<Snapshot> {
  if (scope?.commitments) return fetchShortTermScope(client, scope.workIds, scope.commitments);
  const probe = rpcMissingSince === undefined || Date.now() - rpcMissingSince > PROBE_AGAIN_AFTER;
  if (scope && probe) {
    const { data, error } = await client.rpc('planning_snapshot', { p_work_ids: scope.workIds });
    if (!error) {
      rpcMissingSince = undefined;
      const { version, ...tables } = data as { version: number } & Omit<Rows, 'history_events'>;
      return { data: rowsToPlanningData({ ...tables, history_events: [] }), version };
    }
    if (!missingFunction(error.code)) throw new Error(`Falha ao ler o planejamento: ${error.message}`);
    rpcMissingSince = Date.now();
  }
  return fetchByTables(client);
}

/** Server-only repository. Reads/writes go through the service role — the browser never talks to Supabase Postgres directly. */
export class SupabasePlanningRepository implements PlanningRepository {
  /** O cliente só é injetado nos testes, para falar com um banco de mentira; em produção é o do
   * service role, criado quando o primeiro método roda. */
  constructor(private readonly injected?: SupabaseClient) {}

  private get client(): SupabaseClient {
    return this.injected ?? getServiceClient();
  }

  async getSnapshot(scope?: SnapshotScope): Promise<PlanningData> {
    return (await fetchSnapshotWithVersion(this.client, scope)).data;
  }

  /** Só a versão, uns bytes: a tela confere se há algo novo antes de baixar o planejamento inteiro
   * (`/api/planning/version`). */
  async getVersion(): Promise<number> {
    return fetchVersion(this.client);
  }

  async transaction<T>(operation: (draft: PlanningData) => T, scope?: SnapshotScope): Promise<T> {
    return (await this.commit(operation, scope)).result;
  }

  /** A versão devolvida é a esperada + 1, sem outra leitura: `commit_planning` tranca `planning_meta`
   * (`for update`), recusa qualquer outra versão (`version_conflict`) e soma 1 ao gravar. */
  async commit<T>(operation: (draft: PlanningData) => T, scope?: SnapshotScope): Promise<Committed<T>> {
    const client = this.client;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { data, version } = await fetchSnapshotWithVersion(client, scope);
      const draft = structuredClone(data);
      const result = operation(draft);
      // Só o que mudou viaja: `commit_planning` faz upsert linha a linha e só apaga o que `p_deletes`
      // lista, então as linhas iguais — e as que o recorte nem trouxe — ficam como estão no banco.
      const { error } = await client.rpc('commit_planning', {
        p_expected_version: version,
        p_payload: diffChangedRows(data, draft),
        p_deletes: diffDeletedIds(data, draft),
      });
      if (!error) return { result, version: version + 1 };
      if (!error.message.includes('version_conflict')) throw new Error(error.message);
    }
    throw new Error('Conflito de concorrência: outra alteração foi salva ao mesmo tempo. Tente novamente.');
  }
}

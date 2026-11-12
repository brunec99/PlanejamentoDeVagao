import type { ProductionData, ProductionEntry } from '../../../domain/production';
import type { ProductionMutation } from '../../../application/use-cases/production-commands';
import { getServiceClient } from './client';

/** Leitura e gravação da aba 8, Controle de produtividade (migração 0046). Mesmo desenho do histograma
 * (`headcount-repository.ts`): fora do snapshot do planejamento, páginas lidas em paralelo depois de
 * contar e gravação em lotes (a importação da planilha grava milhares de linhas de uma vez). */

const TABLE = 'production_entries';
const PAGE = 1000;
const INSERT_CHUNK = 500;
const DELETE_CHUNK = 100;
const UPDATE_CONCURRENCY = 50;

/** Migração 0046 não aplicada: a aba responde "indisponível" em vez de erro. */
export class ProductionUnavailableError extends Error {
  constructor() {
    super('Aplique a migração 0046_production.sql no Supabase para usar o controle de produtividade.');
    this.name = 'ProductionUnavailableError';
  }
}
/** Outra gravação chegou antes (linha apagada no meio tempo, id já usado). */
export class ProductionConflictError extends Error {
  constructor() {
    super('Os dados mudaram enquanto você editava. Recarregue a página e tente de novo.');
    this.name = 'ProductionConflictError';
  }
}

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
type DbError = { code?: string; message: string } | null;
function check(error: DbError, action: string) {
  if (!error) return;
  if (missingTable(error.code)) throw new ProductionUnavailableError();
  if (error.code === '23505' || error.code === '23503') throw new ProductionConflictError();
  throw new Error(`Falha ao ${action}: ${error.message}`);
}

type Row = {
  id: string;
  work_id: string;
  worked_on: string;
  service: string;
  contractor: string;
  professionals: number;
  helpers: number;
  /** `numeric` chega como texto pelo PostgREST. */
  quantity: number | string | null;
  unit: ProductionEntry['unit'];
  note: string;
  origin: ProductionEntry['origin'];
  created_by: string;
  created_at: string;
  updated_at: string;
};
const COLUMNS = 'id,work_id,worked_on,service,contractor,professionals,helpers,quantity,unit,note,origin,created_by,created_at,updated_at';

export const productionFromRow = (r: Row): ProductionEntry => ({
  id: r.id,
  workId: r.work_id,
  workedOn: r.worked_on,
  service: r.service,
  contractor: r.contractor,
  professionals: r.professionals,
  helpers: r.helpers,
  quantity: r.quantity === null ? null : Number(r.quantity),
  unit: r.unit,
  note: r.note,
  origin: r.origin,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export const productionToRow = (e: ProductionEntry): Row => ({
  id: e.id,
  work_id: e.workId,
  worked_on: e.workedOn,
  service: e.service,
  contractor: e.contractor,
  professionals: e.professionals,
  helpers: e.helpers,
  quantity: e.quantity,
  unit: e.unit,
  note: e.note,
  origin: e.origin,
  created_by: e.createdBy,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});

/** Todos os lançamentos de uma obra, do dia mais antigo para o mais novo. */
export async function loadProduction(workId: string): Promise<ProductionData> {
  const db = getServiceClient();
  const page = (from: number) =>
    db
      .from(TABLE)
      .select(COLUMNS, from === 0 ? { count: 'exact' } : undefined)
      .eq('work_id', workId)
      .order('worked_on')
      .order('id')
      .range(from, from + PAGE - 1);
  const first = await page(0);
  check(first.error, 'ler o controle de produtividade');
  const rows = [...((first.data ?? []) as Row[])];
  const total = first.count ?? rows.length;
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) => page((i + 1) * PAGE)));
  for (const result of rest) {
    check(result.error, 'ler o controle de produtividade');
    rows.push(...((result.data ?? []) as Row[]));
  }
  return { entries: rows.map(productionFromRow) };
}

/** A obra de uma linha, ou null se ela não existe: a rota confere o acesso antes de gravar. */
export async function findProductionWorkId(entryId: string): Promise<string | null> {
  const { data, error } = await getServiceClient().from(TABLE).select('work_id').eq('id', entryId).maybeSingle();
  check(error, 'localizar o lançamento');
  return (data as { work_id: string } | null)?.work_id ?? null;
}

/** Aplica a mutação: apaga, insere e atualiza, nesta ordem. */
export async function applyProductionMutationToDb(mutation: ProductionMutation): Promise<void> {
  const db = getServiceClient();
  for (let i = 0; i < mutation.delete.length; i += DELETE_CHUNK) {
    const { error } = await db
      .from(TABLE)
      .delete()
      .eq('work_id', mutation.workId)
      .in('id', mutation.delete.slice(i, i + DELETE_CHUNK));
    check(error, 'excluir o lançamento');
  }
  for (let i = 0; i < mutation.insert.length; i += INSERT_CHUNK) {
    const { error } = await db.from(TABLE).insert(mutation.insert.slice(i, i + INSERT_CHUNK).map(productionToRow));
    check(error, 'gravar o lançamento');
  }
  // Nunca upsert: uma linha apagada por outra pessoa não pode renascer pela edição.
  for (let i = 0; i < mutation.update.length; i += UPDATE_CONCURRENCY) {
    const results = await Promise.all(
      mutation.update.slice(i, i + UPDATE_CONCURRENCY).map(entry => {
        const { id, work_id, created_by, created_at, ...changes } = productionToRow(entry);
        void created_by;
        void created_at;
        return db.from(TABLE).update(changes).eq('id', id).eq('work_id', work_id).select('id');
      }),
    );
    for (const result of results) {
      check(result.error, 'atualizar o lançamento');
      if (!result.data?.length) throw new ProductionConflictError();
    }
  }
}

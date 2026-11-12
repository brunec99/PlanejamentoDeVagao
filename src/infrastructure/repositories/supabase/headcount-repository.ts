import type { HeadcountData, HeadcountEntry } from '../../../domain/headcount';
import type { HeadcountMutation } from '../../../application/use-cases/headcount-commands';
import { getServiceClient } from './client';

/** Leitura e gravação da aba 7, Histograma de mão de obra (migração 0045). Mesmo desenho da segurança
 * (`safety-repository.ts`): fora do snapshot do planejamento, cada comando grava só as linhas que mudou.
 * A obra de dois anos passa de dez mil linhas, então a leitura pede as páginas em paralelo depois de
 * contar, e a gravação vai em lotes (a importação da planilha grava milhares de uma vez). */

const TABLE = 'headcount_entries';
const PAGE = 1000;
const INSERT_CHUNK = 500;
const DELETE_CHUNK = 100;
const UPDATE_CONCURRENCY = 50;

/** Migração 0045 não aplicada: a aba responde "indisponível" em vez de erro. */
export class HeadcountUnavailableError extends Error {
  constructor() {
    super('Aplique a migração 0045_headcount.sql no Supabase para usar o histograma.');
    this.name = 'HeadcountUnavailableError';
  }
}
/** Outra gravação chegou antes (a mesma empresa e função já lançadas no dia, linha apagada no meio tempo). */
export class HeadcountConflictError extends Error {
  constructor() {
    super('Os dados mudaram enquanto você editava. Recarregue a página e tente de novo.');
    this.name = 'HeadcountConflictError';
  }
}

const missingTable = (code?: string) => code === '42P01' || code === 'PGRST205';
type DbError = { code?: string; message: string } | null;
function check(error: DbError, action: string) {
  if (!error) return;
  if (missingTable(error.code)) throw new HeadcountUnavailableError();
  // 23505: a unicidade (obra, dia, empresa, função); 23503: a obra foi excluída.
  if (error.code === '23505' || error.code === '23503') throw new HeadcountConflictError();
  throw new Error(`Falha ao ${action}: ${error.message}`);
}

type Row = {
  id: string;
  work_id: string;
  worked_on: string;
  company: string;
  role: string;
  quantity: number;
  note: string;
  origin: HeadcountEntry['origin'];
  created_by: string;
  created_at: string;
  updated_at: string;
};
const COLUMNS = 'id,work_id,worked_on,company,role,quantity,note,origin,created_by,created_at,updated_at';

export const headcountFromRow = (r: Row): HeadcountEntry => ({
  id: r.id,
  workId: r.work_id,
  workedOn: r.worked_on,
  company: r.company,
  role: r.role,
  quantity: r.quantity,
  note: r.note,
  origin: r.origin,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export const headcountToRow = (e: HeadcountEntry): Row => ({
  id: e.id,
  work_id: e.workId,
  worked_on: e.workedOn,
  company: e.company,
  role: e.role,
  quantity: e.quantity,
  note: e.note,
  origin: e.origin,
  created_by: e.createdBy,
  created_at: e.createdAt,
  updated_at: e.updatedAt,
});

/** Todo o efetivo de uma obra, do dia mais antigo para o mais novo. */
export async function loadHeadcount(workId: string): Promise<HeadcountData> {
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
  check(first.error, 'ler o histograma');
  const rows = [...((first.data ?? []) as Row[])];
  const total = first.count ?? rows.length;
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(total / PAGE) - 1) }, (_, i) => page((i + 1) * PAGE)));
  for (const result of rest) {
    check(result.error, 'ler o histograma');
    rows.push(...((result.data ?? []) as Row[]));
  }
  return { entries: rows.map(headcountFromRow) };
}

/** A obra de uma linha, ou null se ela não existe: a rota confere o acesso antes de gravar. */
export async function findHeadcountWorkId(entryId: string): Promise<string | null> {
  const { data, error } = await getServiceClient().from(TABLE).select('work_id').eq('id', entryId).maybeSingle();
  check(error, 'localizar o lançamento');
  return (data as { work_id: string } | null)?.work_id ?? null;
}

/** Aplica a mutação: apaga, insere e atualiza, nesta ordem (apagar antes libera a unicidade do dia). */
export async function applyHeadcountMutationToDb(mutation: HeadcountMutation): Promise<void> {
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
    const { error } = await db.from(TABLE).insert(mutation.insert.slice(i, i + INSERT_CHUNK).map(headcountToRow));
    check(error, 'gravar o lançamento');
  }
  // Nunca upsert: uma linha apagada por outra pessoa não pode renascer pela edição.
  for (let i = 0; i < mutation.update.length; i += UPDATE_CONCURRENCY) {
    const results = await Promise.all(
      mutation.update.slice(i, i + UPDATE_CONCURRENCY).map(entry => {
        const { id, work_id, created_by, created_at, ...changes } = headcountToRow(entry);
        void created_by;
        void created_at;
        return db.from(TABLE).update(changes).eq('id', id).eq('work_id', work_id).select('id');
      }),
    );
    for (const result of results) {
      check(result.error, 'atualizar o lançamento');
      if (!result.data?.length) throw new HeadcountConflictError();
    }
  }
}

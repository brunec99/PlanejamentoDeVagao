import type { SupabaseClient } from '@supabase/supabase-js';
import { TERMINALITY_BUCKET } from './terminality-repository';

/** Os buckets em que cada obra tem uma pasta com o próprio id: os IFC e a geometria convertida em
 * `ifc/<obra>/<modelo>/…`, as fotos da terminalidade em `terminalidade/<obra>/<item>/…`. */
export const WORK_BUCKETS = ['ifc', TERMINALITY_BUCKET] as const;
const PAGE = 1000;
const REMOVE_BATCH = 100;

type Bucket = ReturnType<SupabaseClient['storage']['from']>;

/** Todos os arquivos debaixo de `prefix`, descendo nas pastas. O `list` do Storage não é recursivo:
 * pasta vem com `id` nulo. */
async function listFiles(bucket: Bucket, prefix: string): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(error.message);
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) files.push(...(await listFiles(bucket, path)));
      else files.push(path);
    }
    if (data.length < PAGE) return files;
  }
}

export interface WorkFilesResult {
  removed: number;
  /** Buckets em que a limpeza falhou: os arquivos ficam órfãos no bucket privado, sem efeito na tela. */
  failed: string[];
}

/** Apaga a pasta da obra nos buckets, depois de `delete_work` já ter tirado as linhas do banco. Lista a
 * pasta em vez de ler os caminhos das linhas, para levar também o envio que nunca chegou a ser registrado. */
export async function removeWorkFiles(client: SupabaseClient, workId: string): Promise<WorkFilesResult> {
  const result: WorkFilesResult = { removed: 0, failed: [] };
  for (const name of WORK_BUCKETS) {
    const bucket = client.storage.from(name);
    try {
      const files = await listFiles(bucket, workId);
      for (let i = 0; i < files.length; i += REMOVE_BATCH) {
        const { error } = await bucket.remove(files.slice(i, i + REMOVE_BATCH));
        if (error) throw new Error(error.message);
        result.removed += Math.min(REMOVE_BATCH, files.length - i);
      }
    } catch {
      result.failed.push(name);
    }
  }
  return result;
}
